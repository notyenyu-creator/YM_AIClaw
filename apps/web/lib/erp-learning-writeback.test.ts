import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { writeErpLearningWikiDrafts } from "./erp-learning-writeback";

const originalCwd = process.cwd();

afterEach(() => {
  process.chdir(originalCwd);
});

const sampleDraft = {
  session_id: "session-erp-001",
  status: "ready" as const,
  learning_focus: "sales_order",
  summary: "summary",
  meta: {
    generated_at: 1710000000000,
    generation_mode: "minimal_evidence" as const,
    token_guardrails: ["single_session_single_draft"],
    cached: false,
    source: "fresh_generation" as const,
  },
  writeback: {
    status: "not_written" as const,
    updated_at: null,
    files: [],
    skipped_files: [],
    promoted_files: [],
    promotion_skipped_files: [],
    promotion_conflict_files: [],
    approved_at: null,
    approved_via: null,
    resolution_action: null,
    resolved_at: null,
    review_reason: null,
    reviewer_note: null,
    reviewer_actor: null,
  },
  evidence: {
    latest_user_message: "OOCHAIN 本月還沒出貨的訂單？",
    latest_assistant_reply: "整理出 3 張未出貨單，2 張過交期。",
    live_query_steps: ["read_real_data", "exclude_cancelled_documents"],
    matched_keywords: ["訂單", "出貨"],
  },
  drafts: {
    wiki: [
      {
        kind: "sales_order_summary" as const,
        suggested_path: "wiki/entities/orders/erp-sample-sales-order-summary.md",
        title: "ERP Sales Order Summary Draft",
        reason: "Reusable sales-order summary.",
        outline: ["訂單範圍", "交期狀態", "下一步"],
      },
    ],
    playbooks: [],
    memory: [],
  },
};

describe("writeErpLearningWikiDrafts", () => {
  it("writes ERP draft markdown with session evidence and source-system stamp", () => {
    const root = mkdtempSync(join(tmpdir(), "dench-erp-writeback-"));
    const appDir = join(root, "apps", "web");
    mkdirSync(appDir, { recursive: true });
    process.chdir(appDir);

    const result = writeErpLearningWikiDrafts("session-erp-001", sampleDraft);
    const absolutePath = join(
      root,
      "wiki",
      "entities",
      "orders",
      "erp-sample-sales-order-summary.md",
    );

    expect(result.files).toEqual([
      "wiki/entities/orders/erp-sample-sales-order-summary.md",
    ]);
    expect(result.skipped_files).toEqual([]);
    expect(existsSync(absolutePath)).toBe(true);

    const content = readFileSync(absolutePath, "utf-8");
    expect(content).toContain("# ERP Sales Order Summary Draft");
    expect(content).toContain("Source session: `session-erp-001`");
    expect(content).toContain("Source system: ERP");
    expect(content).toContain("Latest user message: OOCHAIN 本月還沒出貨的訂單？");
    expect(content).toContain("Matched keywords: 訂單, 出貨");
    expect(content).toContain("Live query steps: read_real_data, exclude_cancelled_documents");
    expect(content).toContain("ERP is the source-of-truth for transactional facts");
  });

  it("skips existing files unless overwrite is enabled", () => {
    const root = mkdtempSync(join(tmpdir(), "dench-erp-writeback-skip-"));
    const appDir = join(root, "apps", "web");
    const targetDir = join(root, "wiki", "entities", "orders");
    mkdirSync(appDir, { recursive: true });
    mkdirSync(targetDir, { recursive: true });
    writeFileSync(
      join(targetDir, "erp-sample-sales-order-summary.md"),
      "# Existing Human Draft\n\nKeep me.\n",
      "utf-8",
    );
    process.chdir(appDir);

    const skipped = writeErpLearningWikiDrafts("session-erp-001", sampleDraft);
    expect(skipped.files).toEqual([]);
    expect(skipped.skipped_files).toEqual([
      "wiki/entities/orders/erp-sample-sales-order-summary.md",
    ]);
    expect(
      readFileSync(join(targetDir, "erp-sample-sales-order-summary.md"), "utf-8"),
    ).toContain("Keep me.");

    const overwritten = writeErpLearningWikiDrafts("session-erp-001", sampleDraft, {
      overwrite: true,
    });
    expect(overwritten.files).toEqual([
      "wiki/entities/orders/erp-sample-sales-order-summary.md",
    ]);
    expect(overwritten.skipped_files).toEqual([]);
    expect(
      readFileSync(join(targetDir, "erp-sample-sales-order-summary.md"), "utf-8"),
    ).toContain("Source system: ERP");
  });
});
