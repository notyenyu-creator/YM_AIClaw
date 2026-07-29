import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { resolveEnmsRegressionArtifactPath } from "./enms-learning-artifact-path";
import type { EnmsLearningDraft } from "./enms-learning-draft";

const CONTRACT_VERSION = "enms.learning.regression.v1";

function renderRegressionJson(
  sessionId: string,
  draft: EnmsLearningDraft,
  item: EnmsLearningDraft["drafts"]["regression"][number],
): string {
  return `${JSON.stringify(
    {
      contractVersion: CONTRACT_VERSION,
      source: "enms_learning_draft",
      sourceSystem: "EnMS",
      sourceSessionId: sessionId,
      learningFocus: draft.learning_focus,
      generatedAt: new Date(draft.meta.generated_at).toISOString(),
      reviewStatus: draft.writeback.status,
      case: {
        kind: item.kind,
        title: item.title,
        question: item.question,
        expectedIntent: item.expected_intent,
        expectedCapabilities: item.expected_capabilities,
        requiredEvidence: item.required_evidence,
        guardrails: item.guardrails,
        reason: item.reason,
      },
      sourceEvidence: {
        latestUserMessage: draft.evidence.latest_user_message,
        latestAssistantReply: draft.evidence.latest_assistant_reply,
        matchedKeywords: draft.evidence.matched_keywords,
        liveQuerySteps: draft.evidence.live_query_steps,
      },
    },
    null,
    2,
  )}\n`;
}

export function writeEnmsLearningRegressionDrafts(
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

  for (const item of draft.drafts.regression ?? []) {
    const targetPath = resolveEnmsRegressionArtifactPath(item.suggested_path);
    if (existsSync(targetPath) && !overwrite) {
      skippedFiles.push(item.suggested_path);
      continue;
    }

    mkdirSync(dirname(targetPath), { recursive: true });
    writeFileSync(targetPath, renderRegressionJson(sessionId, draft, item), "utf-8");
    files.push(item.suggested_path);
  }

  return { files, skipped_files: skippedFiles };
}
