import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { promoteErpLearningWikiDrafts } from "./erp-learning-promotion";
import type { ErpLearningDraft } from "./erp-learning-draft";

const originalCwd = process.cwd();

afterEach(() => {
  process.chdir(originalCwd);
});

const ERP_DRAFT_MARKER =
  "- This file was generated from the persisted ERP learning draft flow.";

function buildBaseDraft(
  sessionId: string,
  suggestedPath: string,
  title: string,
  kind: ErpLearningDraft["drafts"]["wiki"][number]["kind"],
): ErpLearningDraft {
  return {
    session_id: sessionId,
    status: "ready",
    learning_focus: "sales_order",
    summary: "summary",
    meta: {
      generated_at: 1710000000000,
      generation_mode: "minimal_evidence",
      token_guardrails: ["single_session_single_draft"],
      cached: false,
      source: "fresh_generation",
    },
    writeback: {
      status: "written",
      updated_at: 1710000000100,
      files: [suggestedPath],
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
      latest_user_message: "OOCHAIN 本月訂單",
      latest_assistant_reply: "整理出 3 張單",
      live_query_steps: ["read_real_data"],
      matched_keywords: ["訂單"],
    },
    drafts: {
      wiki: [
        {
          kind,
          suggested_path: suggestedPath,
          title,
          reason: "reusable summary",
          outline: ["訂單範圍", "交期狀態"],
        },
      ],
      playbooks: [],
      memory: [],
    },
  };
}

function setupRoot(): { root: string; appDir: string } {
  const root = mkdtempSync(join(tmpdir(), "dench-erp-promotion-"));
  const appDir = join(root, "apps", "web");
  mkdirSync(appDir, { recursive: true });
  mkdirSync(join(root, "wiki", "entities", "orders"), { recursive: true });
  writeFileSync(
    join(root, "wiki", "index.md"),
    [
      "# DenchClaw Wiki Index",
      "",
      "### Entities",
      "",
      "| 頁面 | 摘要 | 來源系統 | 最後更新 |",
      "|------|------|----------|----------|",
      "",
      "### Operations",
      "",
      "| 頁面 | 摘要 | 來源系統 | 最後更新 |",
      "|------|------|----------|----------|",
      "",
    ].join("\n"),
    "utf-8",
  );
  writeFileSync(join(root, "wiki", "log.md"), "# DenchClaw Wiki Log\n", "utf-8");
  return { root, appDir };
}

describe("promoteErpLearningWikiDrafts", () => {
  it("registers a written draft into index + log and stamps promotion metadata", () => {
    const { root, appDir } = setupRoot();
    const filePath = "wiki/entities/orders/sample-erp-sales-order-summary.md";
    writeFileSync(
      join(root, filePath),
      [
        "# ERP Sales Order Summary Draft",
        "",
        "## Draft Notes",
        "",
        ERP_DRAFT_MARKER,
        "- Review and refine before promoting it into a formal wiki page.",
        "",
      ].join("\n"),
      "utf-8",
    );
    process.chdir(appDir);

    const result = promoteErpLearningWikiDrafts(
      "session-erpaaaa",
      buildBaseDraft(
        "session-erpaaaa",
        filePath,
        "ERP Sales Order Summary Draft",
        "sales_order_summary",
      ),
    );

    expect(result.promoted_files).toEqual([filePath]);
    expect(result.conflict_files).toEqual([]);
    expect(result.updated_supporting_files).toContain("wiki/index.md");
    expect(result.updated_supporting_files).toContain("wiki/log.md");

    const indexContent = readFileSync(join(root, "wiki", "index.md"), "utf-8");
    expect(indexContent).toContain(`\`${filePath}\``);
    expect(indexContent).toContain("ERP");

    const logContent = readFileSync(join(root, "wiki", "log.md"), "utf-8");
    expect(logContent).toContain("ERP learning draft session-");

    const pageContent = readFileSync(join(root, filePath), "utf-8");
    expect(pageContent).toContain("## Promotion Metadata");
    expect(pageContent).toContain("Source session: `session-erpaaaa`");
    expect(pageContent).toContain("Source system: ERP");
  });

  it("flags a conflict when an existing promoted page belongs to a different session", () => {
    const { root, appDir } = setupRoot();
    const filePath = "wiki/entities/orders/conflict-erp-order.md";
    writeFileSync(
      join(root, filePath),
      [
        "# ERP Sales Order Summary Draft",
        "",
        ERP_DRAFT_MARKER,
        "",
        "## Promotion Metadata",
        "",
        "- Promotion status: approved",
        "- Source session: `other-session-id`",
        "- Source system: ERP",
        "",
      ].join("\n"),
      "utf-8",
    );
    process.chdir(appDir);

    const result = promoteErpLearningWikiDrafts(
      "current-session-id",
      buildBaseDraft(
        "current-session-id",
        filePath,
        "ERP Sales Order Summary Draft",
        "sales_order_summary",
      ),
    );

    expect(result.promoted_files).toEqual([]);
    expect(result.conflict_files).toEqual([filePath]);
    expect(result.conflict_details).toHaveLength(1);
    expect(result.conflict_details[0].reason).toBe("different_source_session");
    expect(result.conflict_details[0].current_source_session).toBe("other-session-id");
  });

  it("flags a conflict when the file lacks the ERP draft marker (manual content)", () => {
    const { root, appDir } = setupRoot();
    const filePath = "wiki/entities/orders/manual-erp-page.md";
    writeFileSync(
      join(root, filePath),
      [
        "# Manually Authored Page",
        "",
        "This is a human-written ERP wiki page.",
        "",
      ].join("\n"),
      "utf-8",
    );
    process.chdir(appDir);

    const result = promoteErpLearningWikiDrafts(
      "session-manual",
      buildBaseDraft(
        "session-manual",
        filePath,
        "ERP Sales Order Summary Draft",
        "sales_order_summary",
      ),
    );

    expect(result.promoted_files).toEqual([]);
    expect(result.conflict_files).toEqual([filePath]);
    expect(result.conflict_details[0].reason).toBe("manual_content_detected");
  });

  it("respects forceConflictOverride and promotes the page anyway", () => {
    const { root, appDir } = setupRoot();
    const filePath = "wiki/entities/orders/force-override-erp-page.md";
    writeFileSync(
      join(root, filePath),
      [
        "# Manually Authored Page",
        "",
        "Human page that we want to override.",
        "",
      ].join("\n"),
      "utf-8",
    );
    process.chdir(appDir);

    const result = promoteErpLearningWikiDrafts(
      "session-force",
      buildBaseDraft(
        "session-force",
        filePath,
        "ERP Sales Order Summary Draft",
        "sales_order_summary",
      ),
      { forceConflictOverride: true },
    );

    expect(result.promoted_files).toEqual([filePath]);
    expect(result.conflict_files).toEqual([]);

    const pageContent = readFileSync(join(root, filePath), "utf-8");
    expect(pageContent).toContain("## Promotion Metadata");
  });
});
