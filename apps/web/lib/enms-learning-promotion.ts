import { existsSync, readFileSync, writeFileSync } from "node:fs";
import {
  resolveEnmsRegressionArtifactPath,
  resolveEnmsWikiDraftArtifactPath,
  resolveEnmsWikiSupportArtifactPath,
} from "./enms-learning-artifact-path";
import type { EnmsLearningDraft } from "./enms-learning-draft";

const DRAFT_MARKER = "- This file was generated from the persisted EnMS learning draft flow.";

function inferSection(filePath: string): "Entities" | "Operations" | "Playbooks" | "Analysis" {
  if (filePath.startsWith("wiki/entities/")) {
    return "Entities";
  }
  if (filePath.startsWith("wiki/operations/")) {
    return "Operations";
  }
  if (filePath.startsWith("wiki/playbooks/")) {
    return "Playbooks";
  }
  return "Analysis";
}

function buildSummary(filePath: string): string {
  if (filePath.includes("/energy/")) {
    return "EnMS learning draft 升格後的能源分析頁";
  }
  if (filePath.includes("/sites/")) {
    return "EnMS learning draft 升格後的場域能耗摘要頁";
  }
  if (filePath.includes("/operations/")) {
    return "EnMS learning draft 升格後的營運/異常摘要頁";
  }
  if (filePath.includes("/playbooks/")) {
    return "EnMS learning draft 升格後的 playbook 頁";
  }
  return "EnMS learning draft 升格後的知識頁";
}

function appendRowToSectionTable(
  content: string,
  section: string,
  row: string,
): { content: string; updated: boolean } {
  const heading = `### ${section}`;
  const start = content.indexOf(heading);
  if (start === -1 || content.includes(row)) {
    return { content, updated: false };
  }

  const nextHeading = content.indexOf("\n### ", start + heading.length);
  const sectionEnd = nextHeading === -1 ? content.length : nextHeading;
  const sectionBody = content.slice(start, sectionEnd).replace(/\s*$/, "");
  const updatedSection = `${sectionBody}\n${row}\n`;
  return {
    content: `${content.slice(0, start)}${updatedSection}${content.slice(sectionEnd)}`,
    updated: true,
  };
}

function ensureIndexEntries(files: string[], today: string): boolean {
  const indexPath = resolveEnmsWikiSupportArtifactPath("wiki/index.md");
  if (!existsSync(indexPath)) {
    return false;
  }

  let content = readFileSync(indexPath, "utf-8");
  let changed = false;

  for (const filePath of files) {
    if (content.includes(`\`${filePath}\``)) {
      continue;
    }
    const row = `| \`${filePath}\` | ${buildSummary(filePath)} | EnMS | ${today} |`;
    const result = appendRowToSectionTable(content, inferSection(filePath), row);
    content = result.content;
    changed ||= result.updated;
  }

  if (changed) {
    writeFileSync(indexPath, content, "utf-8");
  }
  return changed;
}

function ensureLogEntry(sessionId: string, files: string[], today: string): boolean {
  const logPath = resolveEnmsWikiSupportArtifactPath("wiki/log.md");
  if (!existsSync(logPath)) {
    return false;
  }

  const header = `## [${today}] promotion | EnMS learning draft ${sessionId.slice(0, 8)}`;
  const content = readFileSync(logPath, "utf-8");
  if (content.includes(header)) {
    return false;
  }

  const entry = [
    "",
    header,
    "",
    `- 來源 session：\`${sessionId}\``,
    ...files.map((filePath) => `- 升格 \`${filePath}\``),
    "- 更新 `wiki/index.md`，讓頁面正式進入 wiki 導航層",
    "",
  ].join("\n");

  writeFileSync(logPath, `${content.replace(/\s*$/, "")}${entry}`, "utf-8");
  return true;
}

function readPromotionSourceSession(content: string): string | null {
  const match = content.match(/- Source session: `([^`]+)`/);
  return match?.[1] ?? null;
}

function upsertPromotionMetadataNote(
  filePath: string,
  sessionId: string,
  draft: EnmsLearningDraft,
): boolean {
  const absolutePath = resolveEnmsWikiDraftArtifactPath(filePath);
  if (!existsSync(absolutePath)) {
    return false;
  }

  const content = readFileSync(absolutePath, "utf-8");
  const metadataBlock = [
    "## Promotion Metadata",
    "",
    "- Promotion status: approved",
    "- Approved via: manual_promotion",
    `- Approved at: ${new Date().toISOString()}`,
    `- Source session: \`${sessionId}\``,
    `- Learning focus: \`${draft.learning_focus}\``,
    `- Generation mode: \`${draft.meta.generation_mode}\``,
    "- Source system: EnMS",
    "- Registry references: `wiki/index.md`, `wiki/log.md`",
    "",
  ].join("\n");

  const marker = "\n## Promotion Metadata\n";
  const nextHeadingRegex = /\n## [^\n]+/g;

  if (content.includes(marker)) {
    const start = content.indexOf(marker);
    if (start === -1) {
      return false;
    }
    nextHeadingRegex.lastIndex = start + marker.length;
    const nextMatch = nextHeadingRegex.exec(content);
    const end = nextMatch ? nextMatch.index : content.length;
    const updated = `${content.slice(0, start).replace(/\s*$/, "")}\n\n${metadataBlock}${content.slice(end)}`;
    writeFileSync(absolutePath, updated.replace(/\s*$/, "") + "\n", "utf-8");
    return true;
  }

  writeFileSync(absolutePath, `${content.replace(/\s*$/, "")}\n\n${metadataBlock}`, "utf-8");
  return true;
}

export type EnmsPromotionConflictDetail = {
  file_path: string;
  reason: "manual_content_detected" | "different_source_session";
  current_title: string | null;
  current_excerpt: string | null;
  current_source_session: string | null;
  proposed_title: string | null;
  proposed_outline: string[];
};

export type EnmsPromotionResult = {
  promoted_files: string[];
  skipped_files: string[];
  conflict_files: string[];
  conflict_details: EnmsPromotionConflictDetail[];
  updated_supporting_files: string[];
};

export type EnmsPromotionReadiness = {
  ready: boolean;
  missing_gates: string[];
};

function artifactExists(
  filePath: string,
  resolver: (value: string) => string,
): boolean {
  try {
    return existsSync(resolver(filePath));
  } catch {
    return false;
  }
}

export function validateEnmsLearningPromotionReadiness(
  draft: EnmsLearningDraft,
  options?: { allowPromotionConflicted?: boolean },
): EnmsPromotionReadiness {
  const missing: string[] = [];
  const hasWikiDraft = draft.drafts.wiki.length > 0;
  const hasRegressionDraft = (draft.drafts.regression ?? []).length > 0;
  const hasEvidence =
    Boolean(draft.evidence.latest_user_message) &&
    Boolean(draft.evidence.latest_assistant_reply) &&
    draft.evidence.live_query_steps.length > 0;
  const wikiArtifacts = [
    ...draft.writeback.files,
    ...draft.writeback.skipped_files,
  ];
  const regressionArtifacts = [
    ...(draft.writeback.regression_files ?? []),
    ...(draft.writeback.regression_skipped_files ?? []),
  ];
  const hasWrittenWiki = wikiArtifacts.length > 0;
  const hasWrittenRegression = regressionArtifacts.length > 0;
  const hasWikiArtifactOnDisk =
    hasWrittenWiki &&
    wikiArtifacts.some((filePath) =>
      artifactExists(filePath, resolveEnmsWikiDraftArtifactPath)
    );
  const hasRegressionArtifactOnDisk =
    hasWrittenRegression &&
    regressionArtifacts.some((filePath) =>
      artifactExists(filePath, resolveEnmsRegressionArtifactPath)
    );
  const hasPromotableStatus =
    draft.writeback.status === "written" ||
    (
      options?.allowPromotionConflicted === true &&
      draft.writeback.status === "promotion_conflicted"
    );

  if (draft.status !== "ready") {
    missing.push("draft_status_ready");
  }
  if (!hasEvidence) {
    missing.push("reviewable_evidence");
  }
  if (!hasWikiDraft) {
    missing.push("wiki_draft_candidate");
  }
  if (!hasRegressionDraft) {
    missing.push("regression_case_candidate");
  }
  if (!hasPromotableStatus) {
    missing.push(
      options?.allowPromotionConflicted === true
        ? "writeback_status_written_or_conflicted"
        : "writeback_status_written",
    );
  }
  if (!hasWrittenWiki) {
    missing.push("wiki_artifact_written_or_skipped");
  } else if (!hasWikiArtifactOnDisk) {
    missing.push("wiki_artifact_exists_on_disk");
  }
  if (!hasWrittenRegression) {
    missing.push("regression_artifact_written_or_skipped");
  } else if (!hasRegressionArtifactOnDisk) {
    missing.push("regression_artifact_exists_on_disk");
  }

  return {
    ready: missing.length === 0,
    missing_gates: missing,
  };
}

export function promoteEnmsLearningWikiDrafts(
  sessionId: string,
  draft: EnmsLearningDraft,
  options?: {
    forceConflictOverride?: boolean;
  },
): EnmsPromotionResult {
  const candidateFiles = [
    ...draft.writeback.files,
    ...draft.writeback.skipped_files,
    ...draft.drafts.wiki.map((item) => item.suggested_path),
  ];
  const uniqueCandidates = [...new Set(candidateFiles)];
  const promotedFiles: string[] = [];
  const skippedFiles: string[] = [];
  const conflictFiles: string[] = [];
  const forceConflictOverride = options?.forceConflictOverride === true;
  const conflictDetails: EnmsPromotionConflictDetail[] = [];

  const wikiDraftMap = new Map(
    draft.drafts.wiki.map((item) => [item.suggested_path, item] as const),
  );

  for (const filePath of uniqueCandidates) {
    const absolutePath = resolveEnmsWikiDraftArtifactPath(filePath);
    if (!existsSync(absolutePath)) {
      skippedFiles.push(filePath);
      continue;
    }

    const content = readFileSync(absolutePath, "utf-8");
    const hasPromotionMetadata = content.includes("## Promotion Metadata");
    const hasDraftMarker = content.includes(DRAFT_MARKER);
    const sourceSession = readPromotionSourceSession(content);
    const titleMatch = content.match(/^#\s+(.+)$/m);
    const currentTitle = titleMatch?.[1] ?? null;
    const currentExcerpt =
      content
        .split("\n")
        .map((line) => line.trim())
        .find((line) => line.length > 0 && !line.startsWith("#") && !line.startsWith("-"))
        ?.slice(0, 180) ?? null;
    const proposedDraft = wikiDraftMap.get(filePath);

    if (!forceConflictOverride && hasPromotionMetadata && sourceSession && sourceSession !== sessionId) {
      conflictFiles.push(filePath);
      conflictDetails.push({
        file_path: filePath,
        reason: "different_source_session",
        current_title: currentTitle,
        current_excerpt: currentExcerpt,
        current_source_session: sourceSession,
        proposed_title: proposedDraft?.title ?? null,
        proposed_outline: [...(proposedDraft?.outline ?? [])],
      });
      continue;
    }

    if (!forceConflictOverride && !hasDraftMarker && !hasPromotionMetadata) {
      conflictFiles.push(filePath);
      conflictDetails.push({
        file_path: filePath,
        reason: "manual_content_detected",
        current_title: currentTitle,
        current_excerpt: currentExcerpt,
        current_source_session: sourceSession,
        proposed_title: proposedDraft?.title ?? null,
        proposed_outline: [...(proposedDraft?.outline ?? [])],
      });
      continue;
    }

    promotedFiles.push(filePath);
  }

  const today = new Date().toISOString().slice(0, 10);
  const updatedSupportingFiles: string[] = [];
  const updatedPromotedPages: string[] = [];

  for (const filePath of promotedFiles) {
    if (upsertPromotionMetadataNote(filePath, sessionId, draft)) {
      updatedPromotedPages.push(filePath);
    }
  }

  if (promotedFiles.length > 0 && ensureIndexEntries(promotedFiles, today)) {
    updatedSupportingFiles.push("wiki/index.md");
  }
  if (promotedFiles.length > 0 && ensureLogEntry(sessionId, promotedFiles, today)) {
    updatedSupportingFiles.push("wiki/log.md");
  }

  return {
    promoted_files: promotedFiles,
    skipped_files: skippedFiles,
    conflict_files: conflictFiles,
    conflict_details: conflictDetails,
    updated_supporting_files: [...updatedSupportingFiles, ...updatedPromotedPages],
  };
}
