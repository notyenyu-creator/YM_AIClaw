import { existsSync } from "node:fs";
import { dirname, join, normalize, resolve, sep } from "node:path";

function resolveDenchClawRoot(): string {
  let current = resolve(process.cwd());
  for (let depth = 0; depth < 8; depth += 1) {
    if (
      existsSync(join(current, "skills", "enms", "SKILL.md")) &&
      existsSync(join(current, "wiki"))
    ) {
      return current;
    }

    const parent = dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  const cwd = process.cwd();
  if (cwd.endsWith("/apps/web")) {
    return resolve(cwd, "..", "..");
  }
  return resolve(cwd);
}

function normalizeArtifactPath(relativePath: string): string {
  const normalizedPath = normalize(relativePath).split(sep).join("/");
  if (
    normalizedPath.startsWith("../") ||
    normalizedPath.startsWith("/") ||
    normalizedPath.includes("/../")
  ) {
    throw new Error(`Invalid EnMS learning artifact path: ${relativePath}`);
  }
  return normalizedPath;
}

export function resolveEnmsLearningArtifactPath(
  relativePath: string,
  allowedPrefixes: readonly string[],
): string {
  const normalizedPath = normalizeArtifactPath(relativePath);
  const allowed = allowedPrefixes.some((prefix) =>
    prefix.endsWith("/")
      ? normalizedPath.startsWith(prefix)
      : normalizedPath === prefix
  );
  if (!allowed) {
    throw new Error(
      `EnMS learning artifact path is outside the allowlist: ${relativePath}`,
    );
  }

  const root = resolveDenchClawRoot();
  const absolutePath = resolve(root, normalizedPath);
  if (absolutePath !== root && !absolutePath.startsWith(`${root}${sep}`)) {
    throw new Error(`EnMS learning artifact path escaped repository root: ${relativePath}`);
  }

  return absolutePath;
}

export function resolveEnmsWikiDraftArtifactPath(relativePath: string): string {
  return resolveEnmsLearningArtifactPath(relativePath, [
    "wiki/entities/energy/",
    "wiki/entities/sites/",
    "wiki/operations/enms/",
    "wiki/playbooks/enms/",
  ]);
}

export function resolveEnmsRegressionArtifactPath(relativePath: string): string {
  return resolveEnmsLearningArtifactPath(relativePath, ["wiki/regression/enms/"]);
}

export function resolveEnmsWikiSupportArtifactPath(relativePath: string): string {
  return resolveEnmsLearningArtifactPath(relativePath, ["wiki/index.md", "wiki/log.md"]);
}
