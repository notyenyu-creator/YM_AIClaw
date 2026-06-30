import { describe, expect, it } from "vitest";
import {
  buildDomainReadOnlyExecutionPlan,
  buildReadOnlyExecutionBlockedReply,
  decorateMessageWithReadOnlyExecutionPlan,
} from "./domain-read-only-pipeline";
import type { DomainBootstrapSnapshot } from "./domain-bootstrap";
import type { EnmsPlannerPreflight } from "./enms-context-builder";
import type { EnmsContextPack } from "./enms-context-pack";
import type { ErpPlannerPreflight } from "./erp-context-builder";
import type { ErpContextPack } from "./erp-context-pack";
import type { YcrmContextPack } from "./ycrm-context-pack";
import type { YcrmPlannerPreflight } from "./ycrm-context-builder";

function makeReadySnapshot(system: DomainBootstrapSnapshot["system"]): DomainBootstrapSnapshot {
  return {
    system,
    source: "live_db",
    scope: `${system}.public`,
    availability: "ready",
    facts: [],
    joins: [],
    cautions: [],
    gaps: [],
    stillAvailable: [],
  };
}

describe("domain-read-only-pipeline", () => {
  it("marks EnMS phase-one intents as eligible unified read-only plans", () => {
    const preflight: EnmsPlannerPreflight = {
      system: "enms",
      updatedAt: Date.now(),
      intent: "natural_language_query",
      confidence: "high",
      shouldRouteToEnms: true,
      matchedKeywords: ["電表"],
      warnings: [],
      presentation: {
        optional_chart_requested: true,
        chart_render_allowed: true,
        chart_guardrail_reason: null,
        max_chart_panels: 2,
      },
    };
    const pack: EnmsContextPack = {
      planner: preflight,
      presentation: preflight.presentation,
      read_first: [],
      references: [],
      wiki: [],
      playbooks: [],
      memory_keys: [],
      live_query_steps: ["read_summary_view_first"],
      execution_hints: ["Treat EnMS questions as DB-first requests."],
    };

    const plan = buildDomainReadOnlyExecutionPlan({
      system: "enms",
      userMessage: "請幫我查 EnMS 電表圖表",
      preflight,
      pack,
      snapshot: makeReadySnapshot("enms"),
    });

    expect(plan.eligible).toBe(true);
    expect(plan.domain).toBe("enms");
    expect(plan.presentation.chartRequested).toBe(true);
  });

  it("excludes Y-CRM write intents from the unified read-only path", () => {
    const preflight: YcrmPlannerPreflight = {
      system: "ycrm",
      updatedAt: Date.now(),
      intent: "write_intent",
      confidence: "high",
      shouldRouteToYcrm: true,
      workspaceId: "workspace_demo",
      needsWorkspaceValidation: false,
      warnings: [],
      blockers: [],
      crossSystem: false,
      targetSystems: [],
    };
    const pack: YcrmContextPack = {
      planner: preflight,
      presentation: {
        optional_chart_requested: false,
        chart_render_allowed: false,
        chart_guardrail_reason: null,
        max_chart_panels: 0,
      },
      read_first: [],
      references: [],
      wiki: [],
      playbooks: [],
      memory_keys: [],
      live_query_steps: ["write_via_rest_api_only"],
      execution_hints: ["If a write is required, use the REST API path and verify the result with a readback."],
    };

    const plan = buildDomainReadOnlyExecutionPlan({
      system: "ycrm",
      userMessage: "請幫我在 Y-CRM 新增一筆跟進備註",
      preflight,
      pack,
      snapshot: makeReadySnapshot("ycrm"),
    });

    expect(plan.eligible).toBe(false);
  });

  it("returns a blocked reply when Y-CRM auto-schema is missing", () => {
    const preflight: YcrmPlannerPreflight = {
      system: "ycrm",
      updatedAt: Date.now(),
      intent: "entity_summary",
      confidence: "medium",
      shouldRouteToYcrm: true,
      workspaceId: "workspace_missing",
      needsWorkspaceValidation: false,
      warnings: [],
      blockers: ["auto_schema_missing"],
      crossSystem: false,
      targetSystems: [],
    };
    const pack: YcrmContextPack = {
      planner: preflight,
      presentation: {
        optional_chart_requested: false,
        chart_render_allowed: false,
        chart_guardrail_reason: null,
        max_chart_panels: 0,
      },
      read_first: [],
      references: [],
      wiki: [],
      playbooks: [],
      memory_keys: [],
      live_query_steps: ["read_auto_schema_first"],
      execution_hints: ["Read the matching auto-schema reference before writing SQL or assuming field names."],
    };

    const plan = buildDomainReadOnlyExecutionPlan({
      system: "ycrm",
      userMessage: "幫我整理工作區裡最近一週的新商機",
      preflight,
      pack,
      snapshot: makeReadySnapshot("ycrm"),
    });

    expect(plan.eligible).toBe(true);
    expect(buildReadOnlyExecutionBlockedReply(plan)).toContain("auto-schema");
  });

  it("decorates ERP unified read-only prompts with explicit execution rules", () => {
    const preflight: ErpPlannerPreflight = {
      system: "erp",
      updatedAt: Date.now(),
      intent: "inventory_status",
      confidence: "high",
      shouldRouteToErp: true,
      matchedKeywords: ["庫存"],
      warnings: [],
      presentation: {
        optional_chart_requested: true,
        chart_render_allowed: true,
        chart_guardrail_reason: null,
        max_chart_panels: 2,
      },
    };
    const pack: ErpContextPack = {
      planner: preflight,
      presentation: preflight.presentation,
      read_first: [],
      references: [],
      wiki: [],
      playbooks: [],
      memory_keys: [],
      live_query_steps: ["read_real_data", "read_auto_schema_first"],
      execution_hints: ["Treat ERP questions as source-of-truth-first requests: check real ERP rows before answering from generic model knowledge."],
    };

    const plan = buildDomainReadOnlyExecutionPlan({
      system: "erp",
      userMessage: "請列出庫存圖表",
      preflight,
      pack,
      snapshot: makeReadySnapshot("erp"),
    });

    expect(plan.eligible).toBe(true);
    const decorated = decorateMessageWithReadOnlyExecutionPlan("請列出庫存圖表", plan);
    expect(decorated).toContain("[Unified Read-Only Execution Plan]");
    expect(decorated).toContain("pipeline.domain=erp");
    expect(decorated).toContain("only emit report-json from verified aggregate rows");
  });

  it("excludes ERP write-like requests from the unified read-only path", () => {
    const preflight: ErpPlannerPreflight = {
      system: "erp",
      updatedAt: Date.now(),
      intent: "inventory_status",
      confidence: "high",
      shouldRouteToErp: true,
      matchedKeywords: ["庫存"],
      warnings: [],
      presentation: {
        optional_chart_requested: false,
        chart_render_allowed: false,
        chart_guardrail_reason: null,
        max_chart_panels: 0,
      },
    };
    const pack: ErpContextPack = {
      planner: preflight,
      presentation: preflight.presentation,
      read_first: [],
      references: [],
      wiki: [],
      playbooks: [],
      memory_keys: [],
      live_query_steps: ["read_real_data"],
      execution_hints: ["Treat ERP questions as source-of-truth-first requests."],
    };

    const plan = buildDomainReadOnlyExecutionPlan({
      system: "erp",
      userMessage: "請幫我更新庫存數量並補一筆調整紀錄",
      preflight,
      pack,
      snapshot: makeReadySnapshot("erp"),
    });

    expect(plan.eligible).toBe(false);
  });

  it("keeps Y-CRM product help outside the unified DB-first path", () => {
    const preflight: YcrmPlannerPreflight = {
      system: "ycrm",
      updatedAt: Date.now(),
      intent: "product_help",
      confidence: "high",
      shouldRouteToYcrm: true,
      workspaceId: "workspace_demo",
      needsWorkspaceValidation: false,
      warnings: [],
      blockers: [],
      crossSystem: false,
      targetSystems: [],
    };
    const pack: YcrmContextPack = {
      planner: preflight,
      presentation: {
        optional_chart_requested: false,
        chart_render_allowed: false,
        chart_guardrail_reason: null,
        max_chart_panels: 0,
      },
      read_first: [],
      references: [],
      wiki: [],
      playbooks: [],
      memory_keys: [],
      live_query_steps: [],
      execution_hints: ["Answer from verified product guidance."],
    };

    const plan = buildDomainReadOnlyExecutionPlan({
      system: "ycrm",
      userMessage: "Y-CRM 的 LINE 自動回覆要怎麼設定？",
      preflight,
      pack,
      snapshot: makeReadySnapshot("ycrm"),
    });

    expect(plan.eligible).toBe(false);
  });
});
