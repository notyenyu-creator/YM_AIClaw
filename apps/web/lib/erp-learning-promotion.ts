// ERP Learning Promotion — Phase 2b
//
// Mirrors ycrm-learning-promotion. Promotes already-written ERP wiki
// draft files into the formal wiki registry (wiki/index.md + log.md)
// with conflict detection: refuses to overwrite manual edits or pages
// already promoted from a different session, unless explicitly forced.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import type { ErpLearningDraft } from "./erp-learning-draft";

const DRAFT_MARKER = "- This file was generated from the persisted ERP learning draft flow.";

function resolveDenchClawRoot(): string {
  const cwd = process.cwd();
  if (cwd.endsWith("/apps/web")) {
    return resolve(cwd, "..", "..");
  }
  return cwd;
}

function resolveRepoPath(relativePath: string): string {
  if (isAbsolute(relativePath)) {
    return relativePath;
  }
  return join(resolveDenchClawRoot(), relativePath);
}

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
  if (filePath.includes("/orders/")) {
    return "ERP learning draft 升格後的銷售訂單摘要頁";
  }
  if (filePath.includes("/items/")) {
    return "ERP learning draft 升格後的庫存快照頁";
  }
  if (filePath.includes("/work-orders/")) {
    return "ERP learning draft 升格後的工單摘要頁";
  }
  if (filePath.includes("/purchases/")) {
    return "ERP learning draft 升格後的採購摘要頁";
  }
  if (filePath.includes("/operations/")) {
    return "ERP learning draft 升格後的營運摘要頁";
  }
  if (filePath.includes("/playbooks/")) {
    return "ERP learning draft 升格後的 playbook 頁";
  }
  return "ERP learning draft 升格後的知識頁";
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
  const indexPath = resolveRepoPath("wiki/index.md");
  if (!existsSync(indexPath)) {
    return false;
  }

  let content = readFileSync(indexPath, "utf-8");
  let changed = false;

  for (const filePath of files) {
    if (content.includes(`\`${filePath}\``)) {
      continue;
    }
    const row = `| \`${filePath}\` | ${buildSummary(filePath)} | ERP | ${today} |`;
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
  const logPath = resolveRepoPath("wiki/log.md");
  if (!existsSync(logPath)) {
    return false;
  }

  const header = `## [${today}] promotion | ERP learning draft ${sessionId.slice(0, 8)}`;
  const content = readFileSync(logPath, "utf-8");
  if (content.includes(header)) {
    return false;
  }

  const entry = [
    "",
    header,
    "",
    `- 來源 session：\`${sessionId}\``,
    ...files.map((filePath) => `- 升格 ` + `\`${filePath}\``),
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
  draft: ErpLearningDraft,
): boolean {
  const absolutePath = resolveRepoPath(filePath);
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
    "- Source system: ERP",
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

export type ErpPromotionConflictDetail = {
  file_path: string;
  reason: "manual_content_detected" | "different_source_session";
  current_title: string | null;
  current_excerpt: string | null;
  current_source_session: string | null;
  proposed_title: string | null;
  proposed_outline: string[];
};

export type ErpPromotionResult = {
  promoted_files: string[];
  skipped_files: string[];
  conflict_files: string[];
  conflict_details: ErpPromotionConflictDetail[];
  updated_supporting_files: string[];
};

export function promoteErpLearningWikiDrafts(
  sessionId: string,
  draft: ErpLearningDraft,
  options?: {
    forceConflictOverride?: boolean;
  },
): ErpPromotionResult {
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
  const conflictDetails: ErpPromotionConflictDetail[] = [];

  const wikiDraftMap = new Map(
    draft.drafts.wiki.map((item) => [item.suggested_path, item] as const),
  );

  for (const filePath of uniqueCandidates) {
    const absolutePath = resolveRepoPath(filePath);
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
