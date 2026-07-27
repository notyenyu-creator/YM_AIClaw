# syntax=docker/dockerfile:1.7

ARG NODE_IMAGE=node:22-bookworm-slim

FROM ${NODE_IMAGE} AS base

ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    NEXT_TELEMETRY_DISABLED=1

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.23.0 --activate

FROM base AS deps

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ pkg-config git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.json tsdown.config.ts vitest.config.ts vitest.unit.config.ts .oxfmtrc.jsonc .oxlintrc.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/dench/package.json packages/dench/package.json
COPY extensions/apollo-enrichment/package.json extensions/apollo-enrichment/package.json
COPY extensions/dench-ai-gateway/package.json extensions/dench-ai-gateway/package.json
COPY extensions/dench-identity/package.json extensions/dench-identity/package.json
COPY extensions/exa-search/package.json extensions/exa-search/package.json
COPY extensions/posthog-analytics/package.json extensions/posthog-analytics/package.json

RUN pnpm install --frozen-lockfile

FROM deps AS builder

COPY . .

RUN pnpm build:plugin-env \
    && pnpm build \
    && pnpm web:build \
    && pnpm web:prepack

RUN node <<'NODE'
const { createRequire } = require("node:module");
const { dirname, join } = require("node:path");
const { cpSync, existsSync, mkdirSync, rmSync } = require("node:fs");

const req = createRequire("/app/apps/web/package.json");
const targetRoot = "/app/apps/web/.next/standalone/apps/web/node_modules";
const packages = ["node-pty", "ws", "bufferutil", "utf-8-validate"];

for (const pkg of packages) {
  let packageJson;
  try {
    packageJson = req.resolve(`${pkg}/package.json`);
  } catch {
    continue;
  }
  const source = dirname(packageJson);
  const target = join(targetRoot, pkg);
  rmSync(target, { recursive: true, force: true });
  mkdirSync(dirname(target), { recursive: true });
  cpSync(source, target, { recursive: true, dereference: true, force: true });
}
NODE

FROM ${NODE_IMAGE} AS runner

ARG DUCKDB_VERSION=v1.5.0

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3200 \
    HOSTNAME=0.0.0.0 \
    HOME=/home/dench \
    OPENCLAW_HOME=/home/dench \
    SHELL=/bin/bash

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl bash zsh unzip tini \
    && rm -rf /var/lib/apt/lists/*

RUN set -eux; \
    arch="$(dpkg --print-architecture)"; \
    case "$arch" in \
      amd64) duckdb_arch="amd64" ;; \
      arm64) duckdb_arch="arm64" ;; \
      *) echo "Unsupported architecture for DuckDB CLI: $arch" >&2; exit 1 ;; \
    esac; \
    curl -fsSL -o /tmp/duckdb.zip "https://github.com/duckdb/duckdb/releases/download/${DUCKDB_VERSION}/duckdb_cli-linux-${duckdb_arch}.zip"; \
    unzip /tmp/duckdb.zip -d /usr/local/bin; \
    chmod +x /usr/local/bin/duckdb; \
    rm -f /tmp/duckdb.zip; \
    duckdb --version

RUN groupadd --system dench \
    && useradd --system --gid dench --create-home --home-dir /home/dench --shell /bin/bash dench \
    && mkdir -p /home/dench/.openclaw-dench/workspace \
    && chown -R dench:dench /home/dench

WORKDIR /app/apps/web

COPY --from=builder --chown=dench:dench /app/package.json /app/package.json
COPY --from=builder --chown=dench:dench /app/assets /app/assets
COPY --from=builder --chown=dench:dench /app/docs /app/docs
COPY --from=builder --chown=dench:dench /app/extensions /app/extensions
COPY --from=builder --chown=dench:dench /app/schema /app/schema
COPY --from=builder --chown=dench:dench /app/skills /app/skills
COPY --from=builder --chown=dench:dench /app/src /app/src
COPY --from=builder --chown=dench:dench /app/wiki /app/wiki
COPY --from=builder --chown=dench:dench /app/apps/web/package.json /app/apps/web/package.json
COPY --from=builder --chown=dench:dench /app/apps/web/public /app/apps/web/public
COPY --from=builder --chown=dench:dench /app/apps/web/.next /app/apps/web/.next

USER dench

EXPOSE 3200

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=5 \
  CMD curl -fsS "http://127.0.0.1:${PORT}/" >/dev/null || exit 1

ENTRYPOINT ["tini", "--"]
CMD ["node", "/app/apps/web/.next/standalone/apps/web/server.js"]
