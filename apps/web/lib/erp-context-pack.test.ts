import { describe, expect, it } from "vitest";
import { buildErpContext } from "./erp-context-builder";
import {
	buildErpContextPack,
	decorateMessageWithErpContextPack,
} from "./erp-context-pack";

describe("buildErpContextPack", () => {
	it("builds a compact ERP pack with schema, wiki, and playbook references", () => {
		const preflight = buildErpContext({
			request: { user_message: "請幫我查 OOCHAIN 本月還沒出貨的訂單。" },
		});

		const pack = buildErpContextPack(preflight);

		expect(pack.planner.intent).toBe("sales_order");
		expect(pack.read_first).toContain("skills/erp/SKILL.md");
		expect(pack.references).toContain("skills/erp/reference/auto-schema-erp.md");
		expect(pack.wiki).toContain("wiki/entities/orders/ERP_SALES_ORDER_SUMMARY_TEMPLATE.md");
		expect(pack.playbooks).toContain("wiki/playbooks/erp/ERP_ORDER_FULFILLMENT_PLAYBOOK_TEMPLATE.md");
		expect(pack.live_query_steps).toContain("exclude_cancelled_documents");
	});

	it("marks chart requests as optional guarded visuals", () => {
		const preflight = buildErpContext({
			request: { user_message: "請用圖表分析目前可用庫存最多的前 10 個商品" },
		});

		const pack = buildErpContextPack(preflight);

		expect(pack.presentation.optional_chart_requested).toBe(true);
		expect(pack.presentation.chart_render_allowed).toBe(true);
		expect(pack.presentation.chart_guardrail_reason).toBe(
			"chart_optional_if_non_empty_aggregates_available",
		);
		expect(pack.presentation.max_chart_panels).toBe(2);
	});
});

describe("decorateMessageWithErpContextPack", () => {
	it("injects Hermes-style ERP context pack into the user message", () => {
		const preflight = buildErpContext({
			request: { user_message: "請查詢目前庫存狀態" },
		});
		const pack = buildErpContextPack(preflight);

		const decorated = decorateMessageWithErpContextPack("原始訊息", pack);

		expect(decorated).toContain("[ERP Context Pack]");
		expect(decorated).toContain("runtime.gateway=openclaw_gateway");
		expect(decorated).toContain("runtime.orchestration=hermes_style");
		expect(decorated).toContain("runtime.knowledge_layer=ai_wiki");
		expect(decorated).toContain("planner.intent=inventory_status");
		expect(decorated).toContain("planner.read_first=skills/erp/SKILL.md");
		expect(decorated).toContain("原始訊息");
	});

	it("returns the original message when ERP should not route", () => {
		const preflight = buildErpContext({
			request: { user_message: "今天天氣如何？" },
		});
		const pack = buildErpContextPack(preflight);

		expect(decorateMessageWithErpContextPack("原始訊息", pack)).toBe("原始訊息");
	});
});
