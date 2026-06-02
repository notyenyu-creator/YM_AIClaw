import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import type { EnmsLearningDraft } from "./enms-learning-draft";

function resolveDenchClawRoot(): string {
  const cwd = process.cwd();
  if (cwd.endsWith("/apps/web")) {
    return resolve(cwd, "..", "..");
  }
  return cwd;
}

function resolveTargetPath(suggestedPath: string): string {
  if (isAbsolute(suggestedPath)) {
    return suggestedPath;
  }
  return join(resolveDenchClawRoot(), suggestedPath);
}

function renderWikiDraftMarkdown(
  sessionId: string,
  item: EnmsLearningDraft["drafts"]["wiki"][number],
  draft: EnmsLearningDraft,
): string {
  return [
    `# ${item.title}`,
    "",
    `> Source session: \`${sessionId}\``,
    `> Learning focus: \`${draft.learning_focus}\``,
    `> Generated at: ${new Date(draft.meta.generated_at).toISOString()}`,
    `> Source system: EnMS`,
    "",
    "## Why This Draft Exists",
    "",
    item.reason,
    "",
    "## Suggested Outline",
    "",
    ...item.outline.map((section) => `- ${section}`),
    "",
    "## Session Evidence",
    "",
    `- Latest user message: ${draft.evidence.latest_user_message ?? "n/a"}`,
    `- Latest assistant reply: ${draft.evidence.latest_assistant_reply ?? "n/a"}`,
    `- Matched keywords: ${draft.evidence.matched_keywords.length > 0 ? draft.evidence.matched_keywords.join(", ") : "none"}`,
    `- Live query steps: ${draft.evidence.live_query_steps.length > 0 ? draft.evidence.live_query_steps.join(", ") : "none"}`,
    "",
    "## Draft Notes",
    "",
    "- This file was generated from the persisted EnMS learning draft flow.",
    "- Review and refine before promoting it into a formal wiki page.",
    "- EnMS PostgreSQL / TimescaleDB remains the source-of-truth for measurements; refresh live data before publishing operational decisions.",
    "",
  ].join("\n");
}

export function writeEnmsLearningWikiDrafts(
  sessionId: string,
  draft: EnmsLearningDraft,
  options?: { overwrite?: boolean },
): {
  files: string[];
  skipped_files: string[];
} {
  const files: string[] = [];
  const skippedFiles: string[] = [];
  const overwrite = options?.overwrite === true;

  for (const item of draft.drafts.wiki) {
    const targetPath = resolveTargetPath(item.suggested_path);
    if (existsSync(targetPath) && !overwrite) {
      skippedFiles.push(item.suggested_path);
      continue;
    }

    mkdirSync(dirname(targetPath), { recursive: true });
    writeFileSync(
      targetPath,
      renderWikiDraftMarkdown(sessionId, item, draft),
      "utf-8",
    );
    files.push(item.suggested_path);
  }

  return { files, skipped_files: skippedFiles };
}
