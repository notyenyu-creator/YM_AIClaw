import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { GET, POST } from "./route";
import { POST as promotePost } from "./promote/route";
import { POST as resolvePost } from "./resolve/route";
import { POST as writebackPost } from "./writeback/route";

const REVIEW_TOKEN = "review-secret";
const ORIGINAL_ENV = { ...process.env };

function buildRequest(path: string, body: unknown, token = REVIEW_TOKEN): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function enableReviewGate() {
  process.env.ENCLAW_ENMS_LEARNING_REVIEW_ENABLED = "1";
  process.env.ENCLAW_ENMS_LEARNING_REVIEW_TOKEN = REVIEW_TOKEN;
  delete process.env.ENCLAW_ENMS_LEARNING_REVIEW_TOKEN_FILE;
}

describe("EnMS learning draft review debug API gate", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("fails closed when the EnMS learning review feature flag is disabled", async () => {
    const response = await GET(
      new Request("http://localhost/api/debug/enms-learning-draft", {
        headers: { Authorization: `Bearer ${REVIEW_TOKEN}` },
      }),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining("disabled"),
    });
  });

  it("requires reviewer bearer auth when the feature flag is enabled", async () => {
    enableReviewGate();

    const response = await POST(
      new Request("http://localhost/api/debug/enms-learning-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: "s1" }),
      }),
    );

    expect(response.status).toBe(401);
  });

  it("fails closed when a configured reviewer token file is missing", async () => {
    const secretDir = mkdtempSync(join(tmpdir(), "enms-review-token-"));
    try {
      process.env.ENCLAW_ENMS_LEARNING_REVIEW_ENABLED = "1";
      process.env.ENCLAW_ENMS_LEARNING_REVIEW_TOKEN = REVIEW_TOKEN;
      process.env.ENCLAW_ENMS_LEARNING_REVIEW_TOKEN_FILE = join(
        secretDir,
        "missing-token",
      );

      const response = await GET(
        new Request("http://localhost/api/debug/enms-learning-draft", {
          headers: { Authorization: `Bearer ${REVIEW_TOKEN}` },
        }),
      );

      expect(response.status).toBe(401);
    } finally {
      rmSync(secretDir, { recursive: true, force: true });
    }
  });

  it("allows contract metadata only after feature flag and reviewer auth pass", async () => {
    enableReviewGate();

    const response = await GET(
      new Request("http://localhost/api/debug/enms-learning-draft", {
        headers: { Authorization: `Bearer ${REVIEW_TOKEN}` },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.sample_output.learning_focus).toBe("demand_forecast");
  });

  it.each([
    ["draft", "/api/debug/enms-learning-draft", POST],
    ["writeback", "/api/debug/enms-learning-draft/writeback", writebackPost],
    ["promote", "/api/debug/enms-learning-draft/promote", promotePost],
    ["resolve", "/api/debug/enms-learning-draft/resolve", resolvePost],
  ])(
    "keeps the original %s request validation after the gate passes",
    async (_label, path, handler) => {
      enableReviewGate();

      const response = await handler(buildRequest(path, "{bad-json"));

      expect(response.status).toBe(400);
    },
  );
});
