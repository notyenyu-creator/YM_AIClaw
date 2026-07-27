import { readFileSync } from "node:fs";

export function getEnmsS2sApiKey(): string {
  const apiKeyFile = process.env.ENCLAW_ENMS_API_KEY_FILE?.trim();
  if (apiKeyFile) {
    try {
      return readFileSync(apiKeyFile, "utf8").trim();
    } catch {
      // A configured secret file must fail closed instead of falling back.
      return "";
    }
  }

  return (
    process.env.ENCLAW_ENMS_API_KEY?.trim() ||
    process.env.ENMS_AI_ASSISTANT_API_KEY?.trim() ||
    ""
  );
}
