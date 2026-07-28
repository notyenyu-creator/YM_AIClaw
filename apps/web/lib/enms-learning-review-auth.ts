import { readFileSync } from "node:fs";
import { timingSafeEqual } from "node:crypto";

function getReviewToken(): string {
  const tokenFile = process.env.ENCLAW_ENMS_LEARNING_REVIEW_TOKEN_FILE?.trim();
  if (tokenFile) {
    try {
      return readFileSync(tokenFile, "utf8").trim();
    } catch {
      return "";
    }
  }

  return process.env.ENCLAW_ENMS_LEARNING_REVIEW_TOKEN?.trim() ?? "";
}

function isTokenMatch(expected: string, actual: string): boolean {
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);
  return (
    expectedBuffer.length === actualBuffer.length &&
    timingSafeEqual(expectedBuffer, actualBuffer)
  );
}

function readBearerToken(req: Request): string {
  return (
    (req.headers.get("authorization") ?? "").match(/^Bearer\s+(.+)$/i)?.[1] ??
    ""
  );
}

export function requireEnmsLearningReviewAccess(req: Request): Response | null {
  if (process.env.ENCLAW_ENMS_LEARNING_REVIEW_ENABLED !== "1") {
    return Response.json(
      { error: "EnMS learning review endpoints are disabled" },
      { status: 404 },
    );
  }

  const expected = getReviewToken();
  if (!expected || !isTokenMatch(expected, readBearerToken(req))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}
