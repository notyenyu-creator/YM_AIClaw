import { describe, expect, it } from "vitest";
import {
  buildYcrmContext,
  createDefaultYcrmContextInput,
  type YcrmContextBuilderInput,
} from "./ycrm-context-builder";

type YcrmContextBuilderInputOverrides =
  Partial<Omit<YcrmContextBuilderInput, "request" | "runtime_state" | "defaults">> & {
    request?: Partial<YcrmContextBuilderInput["request"]>;
    runtime_state?: Partial<YcrmContextBuilderInput["runtime_state"]>;
    defaults?: Partial<YcrmContextBuilderInput["defaults"]>;
  };

function makeInput(
  userMessage: string,
  overrides?: YcrmContextBuilderInputOverrides,
): YcrmContextBuilderInput {
  return {
    ...createDefaultYcrmContextInput(),
    ...overrides,
    request: {
      ...createDefaultYcrmContextInput().request,
      ...overrides?.request,
      user_message: userMessage,
    },
    runtime_state: {
      ...createDefaultYcrmContextInput().runtime_state,
      ...overrides?.runtime_state,
    },
    defaults: {
      ...createDefaultYcrmContextInput().defaults,
      ...overrides?.defaults,
    },
  };
}

describe("buildYcrmContext", () => {
  it("routes product help without live query", () => {
    const result = buildYcrmContext(makeInput("Y-CRM 的 LINE 自動回覆要怎麼設定？"));

    expect(result.decision.should_route_to_ycrm).toBe(true);
    expect(result.decision.intent).toBe("product_help");
    expect(result.workspace.resolved_workspace_id).toBe("workspace_3joxkr9ofo5hlxjan164egffx");
    expect(result.live_requirements.real_query_required).toBe(false);
    expect(result.live_requirements.auto_schema_required).toBe(false);
    expect(result.handoff.cross_system).toBe(false);
  });

  it("handles entity summary with person lookup", () => {
    const result = buildYcrmContext(makeInput(
      "請幫我整理 Y-CRM 工作區裡面的 Calleen Hong 目前負責的客戶背景。",
      { request: { current_system_hint: "ycrm" } },
    ));

    expect(result.decision.should_route_to_ycrm).toBe(true);
    expect(result.decision.intent).toBe("entity_summary");
    expect(result.workspace.source).toBe("explicit_ycrm");
    expect(result.workspace.resolved_workspace_id).toBe("workspace_3joxkr9ofo5hlxjan164egffx");
    expect(result.live_requirements.real_query_required).toBe(true);
    expect(result.live_requirements.auto_schema_required).toBe(true);
    expect(result.live_requirements.workspace_member_lookup_required).toBe(true);
    expect(result.context_bundle.references).toContain(
      "skills/ycrm/reference/auto-schema-workspace_3joxkr9ofo5hlxjan164egffx.md",
    );
    expect(
      result.context_bundle.references.some((path) => path.includes("workspace_407lopjyyvm7bxeutk1tvqkpo")),
    ).toBe(false);
    expect(result.handoff.cross_system).toBe(false);
  });

  it("treats short Y-CRM person-summary requests as entity summaries", () => {
    const result = buildYcrmContext(makeInput(
      "請幫我整理 Y-CRM 工作區裡面的 Calleen Hong",
    ));

    expect(result.decision.should_route_to_ycrm).toBe(true);
    expect(result.decision.intent).toBe("entity_summary");
    expect(result.decision.confidence).not.toBe("low");
    expect(result.notes.blockers).not.toContain("intent_unknown");
    expect(result.live_requirements.workspace_member_lookup_required).toBe(true);
  });

  it("flags chart reports to require VALUES output", () => {
    const result = buildYcrmContext(makeInput(
      "幫我分析 Y-CRM 裡許子新的商機分布，順便做成圖表。",
      { request: { current_system_hint: "ycrm" } },
    ));

    expect(result.decision.intent).toBe("sales_report");
    expect(result.live_requirements.real_query_required).toBe(true);
    expect(result.live_requirements.auto_schema_required).toBe(true);
    expect(result.live_requirements.workspace_member_lookup_required).toBe(true);
    expect(result.live_requirements.report_json_values_required).toBe(true);
    expect(result.context_bundle.references).toContain("skills/ycrm/reference/analysis-templates.md");
    expect(result.handoff.cross_system).toBe(false);
    expect(result.presentation.optional_chart_requested).toBe(true);
    expect(result.presentation.chart_render_allowed).toBe(true);
  });

  it("keeps entity summaries primary when chart rendering is only optional", () => {
    const result = buildYcrmContext(makeInput(
      "請幫我整理 Y-CRM 工作區裡面的 Calleen Hong 目前負責的客戶背景（也可以用圖表呈現）",
      { request: { current_system_hint: "ycrm" } },
    ));

    expect(result.decision.intent).toBe("entity_summary");
    expect(result.live_requirements.report_json_values_required).toBe(false);
    expect(result.presentation.optional_chart_requested).toBe(true);
    expect(result.presentation.chart_render_allowed).toBe(true);
    expect(result.presentation.chart_guardrail_reason).toBe("chart_optional_if_non_empty_aggregates_available");
    expect(result.presentation.max_chart_panels).toBe(2);
    expect(result.notes.warnings).toContain("chart_optional_requires_non_empty_aggregates");
  });

  it("keeps entity summaries primary for short follow-up chart expansion requests when prior intent is entity_summary", () => {
    const result = buildYcrmContext(makeInput(
      "好，我需要全部資料，然後用圖表呈現。",
      {
        request: {
          current_system_hint: "ycrm",
          requested_workspace: "workspace_3joxkr9ofo5hlxjan164egffx",
          prior_intent_hint: "entity_summary",
        },
      },
    ));

    expect(result.decision.should_route_to_ycrm).toBe(true);
    expect(result.decision.intent).toBe("entity_summary");
    expect(result.decision.confidence).toBe("high");
    expect(result.presentation.optional_chart_requested).toBe(true);
    expect(result.presentation.chart_render_allowed).toBe(true);
    expect(result.presentation.chart_guardrail_reason).toBe("chart_optional_if_non_empty_aggregates_available");
    expect(result.notes.blockers).not.toContain("intent_unknown");
  });

  it("routes line interaction review with relevant wiki", () => {
    const result = buildYcrmContext(makeInput("幫我看一下這個客戶最近的 LINE 對話重點，還有下一步要追什麼。"));

    expect(result.decision.intent).toBe("line_interaction_review");
    expect(result.live_requirements.real_query_required).toBe(true);
    expect(result.live_requirements.auto_schema_required).toBe(true);
    expect(result.live_requirements.workspace_member_lookup_required).toBe(false);
    expect(result.context_bundle.wiki).toContain("wiki/operations/ycrm/YCRM_LINE_INTERACTION_SUMMARY_TEMPLATE.md");
    expect(result.handoff.cross_system).toBe(false);
  });

  it("keeps Y-CRM as context but escalates cross-system requests", () => {
    const result = buildYcrmContext(makeInput(
      "這個客戶在 Y-CRM 裡商機很熱，但我想知道他的訂單現在到哪、庫存夠不夠、還有工單有沒有卡住。",
      { request: { current_system_hint: "ycrm" } },
    ));

    expect(result.decision.should_route_to_ycrm).toBe(true);
    expect(result.decision.intent).toBe("cross_system_request");
    expect(result.handoff.cross_system).toBe(true);
    expect(result.handoff.target_systems).toEqual(expect.arrayContaining(["erp", "wms", "mes"]));
    expect(result.notes.blockers).toContain("cross_system_required");
  });

  it("marks low-risk writes as REST plus readback", () => {
    const result = buildYcrmContext(makeInput(
      "請幫我在 Y-CRM 幫這個客戶新增一筆跟進備註，內容是下週一回覆報價版本。",
      { request: { current_system_hint: "ycrm" } },
    ));

    expect(result.decision.intent).toBe("write_intent");
    expect(result.live_requirements.real_query_required).toBe(true);
    expect(result.live_requirements.auto_schema_required).toBe(true);
    expect(result.live_requirements.rest_write_required).toBe(true);
    expect(result.live_requirements.readback_required).toBe(true);
    expect(result.risk.level).toBe("L1");
    expect(result.handoff.cross_system).toBe(false);
  });

  it("leaves ambiguous workspace references unresolved", () => {
    const result = buildYcrmContext(makeInput("請幫我看 Calleen公司 裡面 Y-CRM 的這筆客戶資料。"));

    expect(result.decision.should_route_to_ycrm).toBe(true);
    expect(result.workspace.source).toBe("unresolved");
    expect(result.workspace.needs_workspace_validation).toBe(true);
    expect(result.notes.warnings).toContain("person_name_may_be_misread_as_workspace");
  });

  it("blocks when required auto-schema is missing", () => {
    const result = buildYcrmContext(makeInput(
      "幫我整理 HOPET 工作區裡最近一週的新商機。",
      {
        request: {
          current_system_hint: "ycrm",
          requested_workspace: "workspace_5sgeef4h8tfcbqihsmg9numuh",
        },
      },
    ));

    expect(["entity_summary", "unknown"]).toContain(result.decision.intent);
    expect(result.workspace.resolved_workspace_id).toBe("workspace_5sgeef4h8tfcbqihsmg9numuh");
    expect(result.notes.blockers).toContain("auto_schema_missing");
    expect(result.live_requirements.auto_schema_required).toBe(true);
  });

  it("avoids routing generic rewrite requests into Y-CRM", () => {
    const result = buildYcrmContext(makeInput("把這段內容整理得更有說服力。"));

    expect(result.decision.should_route_to_ycrm).toBe(false);
    expect(result.decision.intent).toBe("unknown");
    expect(result.notes.blockers).toContain("intent_unknown");
  });

  it("does not claim messages that explicitly exclude Y-CRM", () => {
    const result = buildYcrmContext(makeInput(
      "請用 EnMS 資料比較阿里山與洋銘資訊最近 30 天總用電與功率因數，不要看 ERP 或 Y-CRM。",
    ));

    expect(result.decision.should_route_to_ycrm).toBe(false);
    expect(result.decision.confidence).toBe("low");
  });

  it("does not auto-claim generic company prompts when ERP scope is explicit and Y-CRM is not mentioned", () => {
    const result = buildYcrmContext(makeInput(
      "請只看 ERP，不要看 EnMS。ERP 目前有多少公司？先不要分析耗電異常或場域電表。",
      {
        request: { current_system_hint: "erp" },
      },
    ));

    expect(result.decision.should_route_to_ycrm).toBe(false);
  });

  it("lets an explicit 'do not use Y-CRM' instruction override a Y-CRM tab hint", () => {
    const result = buildYcrmContext(makeInput(
      "不要看 Y-CRM，改看 ERP 庫存與出貨狀態。",
      {
        request: { current_system_hint: "ycrm" },
      },
    ));

    expect(result.decision.should_route_to_ycrm).toBe(false);
  });

  it("treats system-first Y-CRM exclusions as explicit exclusions", () => {
    const result = buildYcrmContext(makeInput(
      "Y-CRM 先不要查，改看 ERP 庫存與出貨狀態。",
      {
        request: { current_system_hint: "ycrm" },
      },
    ));

    expect(result.decision.should_route_to_ycrm).toBe(false);
  });

  it("falls back cleanly when wiki pages are unavailable", () => {
    const result = buildYcrmContext(makeInput(
      "幫我看一下這個客戶最近的 LINE 對話重點。",
      {
        request: { current_system_hint: "ycrm" },
        runtime_state: { available_wiki_pages: [] },
      },
    ));

    expect(result.decision.intent).toBe("line_interaction_review");
    expect(result.live_requirements.real_query_required).toBe(true);
    expect(result.notes.warnings).toContain("wiki_not_found_fallback_to_live_query");
  });
});
