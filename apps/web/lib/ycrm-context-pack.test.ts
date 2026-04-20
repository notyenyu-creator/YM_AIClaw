import { describe, expect, it } from "vitest";
import { buildYcrmContext, createDefaultYcrmContextInput } from "./ycrm-context-builder";
import {
	buildYcrmContextPack,
	decorateMessageWithYcrmContextPack,
} from "./ycrm-context-pack";

describe("buildYcrmContextPack", () => {
	it("builds a reusable Y-CRM context pack for person-based entity summaries", () => {
		const plan = buildYcrmContext(
			createDefaultYcrmContextInput(
				"請幫我整理 Y-CRM 工作區裡面的 Calleen Hong 目前負責的客戶背景。",
			),
		);
		const pack = buildYcrmContextPack(plan);

		expect(pack.planner.intent).toBe("entity_summary");
		expect(pack.read_first).toEqual(
			expect.arrayContaining([
				"skills/ycrm/SKILL.md",
				"schema/integration-profiles/ycrm.md",
				"skills/ycrm/reference/auto-schema-workspace_3joxkr9ofo5hlxjan164egffx.md",
			]),
		);
		expect(pack.memory_keys).toContain("known_rule:person_name_is_not_workspace");
		expect(pack.live_query_steps).toEqual(
			expect.arrayContaining([
				"read_real_data",
				"read_auto_schema_first",
				"resolve_workspace_member_fk",
			]),
		);
	});

	it("formats a prompt-ready Y-CRM context pack block", () => {
		const plan = buildYcrmContext(
			createDefaultYcrmContextInput(
				"幫我分析 Y-CRM 裡許子新的商機分布，順便做成圖表。",
			),
		);
		const pack = buildYcrmContextPack(plan);
		const decorated = decorateMessageWithYcrmContextPack("原始訊息", pack);

		expect(decorated).toContain("[Y-CRM Context Pack]");
		expect(decorated).toContain("runtime.gateway=openclaw_gateway");
		expect(decorated).toContain("runtime.orchestration=hermes_style");
		expect(decorated).toContain("runtime.knowledge_layer=ai_wiki");
		expect(decorated).toContain("planner.intent=sales_report");
		expect(decorated).toContain("planner.live=read_real_data,read_auto_schema_first,resolve_workspace_member_fk,emit_chart_from_report_json_values");
		expect(decorated).toContain("skills/ycrm/reference/analysis-templates.md");
		expect(decorated).toContain("Do not start from workspace README.md for Y-CRM routing; use planner.read_first entries first because README may be absent.");
		expect(decorated).toContain("For charts, query real CRM data first and only then emit report-json VALUES payloads.");
		expect(decorated).toContain("原始訊息");
	});

	it("keeps optional charts as a guarded fallback for entity summaries", () => {
		const plan = buildYcrmContext(
			createDefaultYcrmContextInput(
				"請幫我整理 Y-CRM 工作區裡面的 Calleen Hong 目前負責的客戶背景（也可以用圖表呈現）",
			),
		);
		const pack = buildYcrmContextPack(plan);
		const decorated = decorateMessageWithYcrmContextPack("原始訊息", pack);

		expect(pack.planner.intent).toBe("entity_summary");
		expect(pack.presentation.optional_chart_requested).toBe(true);
		expect(pack.presentation.chart_render_allowed).toBe(false);
		expect(decorated).toContain("planner.presentation.optional_chart_requested=true");
		expect(decorated).toContain("planner.presentation.chart_render_allowed=false");
		expect(decorated).toContain("planner.presentation.chart_guardrail=chart_optional_but_primary_task_is_entity_summary");
		expect(decorated).toContain("Do not emit any report-json or chart card unless you already have non-empty aggregated chart data");
		expect(decorated).toContain("runtime.pack_mode=compact");
	});
});
