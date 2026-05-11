import type { ErpPlannerPreflight } from "./erp-context-builder";

export type ErpContextPack = {
	planner: ErpPlannerPreflight;
	presentation: {
		optional_chart_requested: boolean;
		chart_render_allowed: boolean;
		chart_guardrail_reason: string | null;
		max_chart_panels: number;
	};
	read_first: string[];
	references: string[];
	wiki: string[];
	playbooks: string[];
	memory_keys: string[];
	live_query_steps: string[];
	execution_hints: string[];
};

function pushUnique(target: string[], value: string) {
	if (!target.includes(value)) {
		target.push(value);
	}
}

function buildReferences(preflight: ErpPlannerPreflight): string[] {
	const references = [
		"skills/erp/reference/auto-schema-erp.md",
		"skills/erp/reference/db-schema-cheatsheet.md",
	];

	if (
		preflight.intent === "sales_order"
		|| preflight.intent === "shipping_status"
		|| preflight.intent === "inventory_status"
	) {
		references.push("skills/erp/reference/analysis-templates.md");
	}

	if (preflight.intent === "unknown") {
		references.push("skills/erp/reference/feature-guide.md");
	}

	return references;
}

function buildWiki(preflight: ErpPlannerPreflight): string[] {
	const pages: string[] = [];

	if (preflight.intent === "sales_order") {
		pushUnique(pages, "wiki/entities/orders/ERP_SALES_ORDER_SUMMARY_TEMPLATE.md");
	}
	if (preflight.intent === "inventory_status") {
		pushUnique(pages, "wiki/entities/items/ERP_INVENTORY_SNAPSHOT_TEMPLATE.md");
	}
	if (preflight.intent === "shipping_status") {
		pushUnique(pages, "wiki/operations/erp/ERP_SHIPMENT_TRACKING_TEMPLATE.md");
	}

	return pages;
}

function buildPlaybooks(preflight: ErpPlannerPreflight): string[] {
	const playbooks: string[] = [];

	if (
		preflight.intent === "sales_order"
		|| preflight.intent === "shipping_status"
		|| preflight.intent === "inventory_status"
	) {
		pushUnique(
			playbooks,
			"wiki/playbooks/erp/ERP_ORDER_FULFILLMENT_PLAYBOOK_TEMPLATE.md",
		);
	}

	return playbooks;
}

function buildMemoryKeys(preflight: ErpPlannerPreflight): string[] {
	const memory = [
		"known_rule:erp_tables_are_uppercase_and_quoted",
		"known_rule:erp_queries_must_be_read_only",
	];

	if (preflight.intent === "inventory_status") {
		pushUnique(memory, "known_rule:inventory_scope_requires_company_site");
	}

	return memory;
}

function buildLiveQuerySteps(preflight: ErpPlannerPreflight): string[] {
	const steps = [
		"read_real_data",
		"read_auto_schema_first",
		"confirm_company_site_scope",
	];

	if (
		preflight.intent === "sales_order"
		|| preflight.intent === "purchase_order"
		|| preflight.intent === "shipping_status"
	) {
		pushUnique(steps, "exclude_cancelled_documents");
	}

	if (preflight.intent === "inventory_status") {
		pushUnique(steps, "aggregate_inventory_before_chart");
	}

	if (preflight.intent === "finance_doc") {
		pushUnique(steps, "avoid_high_risk_write_paths");
	}

	return steps;
}

function buildExecutionHints(
	preflight: ErpPlannerPreflight,
	presentation: ErpContextPack["presentation"],
): string[] {
	const hints = [
		"Use the OpenClaw Gateway session runtime and follow the Hermes-style planner/context flow for this request.",
		"Treat the AI Wiki layer as durable operating knowledge, but treat ERP itself as the transaction source-of-truth.",
		"Keep ERP scoped to transaction, inventory, shipment, and finance facts. Do not substitute CRM semantics for ERP truth.",
		"Always read the ERP skill and auto-schema reference before writing SQL or assuming field names.",
		'Use quoted uppercase table names such as erp.public."SO" and erp.public."INVENTORY".',
		"Use postgres_scanner in READ_ONLY mode and never emit INSERT/UPDATE/DELETE statements.",
		"When token pressure is high, prefer a concise summary over dumping raw rows or oversized charts.",
	];

	if (
		preflight.intent === "sales_order"
		|| preflight.intent === "purchase_order"
		|| preflight.intent === "shipping_status"
	) {
		hints.push("Exclude cancelled documents with cancelled_at IS NULL before drawing conclusions.");
	}

	if (presentation.optional_chart_requested) {
		hints.push("Charts are optional support visuals. Finish the factual ERP summary first.");
		hints.push(
			`Only render charts if non-empty aggregated ERP data exists, and do not exceed ${presentation.max_chart_panels} panels.`,
		);
	}

	if (preflight.intent === "inventory_status") {
		hints.push(
			'For INVENTORY queries: use available_qty for "available/可用" stock and on_hand_qty for "on-hand/在手" stock. NEVER use allocated_qty for available-stock questions — it is almost always 0 in UAT.',
		);
		hints.push(
			"Always JOIN B_ITEM to retrieve item_name; do not claim item_name is empty without checking B_ITEM.",
		);
		hints.push("Aggregate inventory facts before visualizing them, and avoid charting raw item-by-item dumps.");
	}

	if (preflight.warnings.length > 0) {
		hints.push(`Watch-outs: ${preflight.warnings.join(", ")}.`);
	}

	return hints;
}

export function buildErpContextPack(
	preflight: ErpPlannerPreflight,
): ErpContextPack {
	return {
		planner: preflight,
		presentation: preflight.presentation,
		read_first: [
			"skills/erp/SKILL.md",
			"skills/erp/reference/auto-schema-erp.md",
		],
		references: buildReferences(preflight),
		wiki: buildWiki(preflight),
		playbooks: buildPlaybooks(preflight),
		memory_keys: buildMemoryKeys(preflight),
		live_query_steps: buildLiveQuerySteps(preflight),
		execution_hints: buildExecutionHints(preflight, preflight.presentation),
	};
}

export function decorateMessageWithErpContextPack(
	userMessage: string,
	pack: ErpContextPack,
): string {
	if (!pack.planner.shouldRouteToErp) {
		return userMessage;
	}

	const compactReadFirst = pack.read_first.slice(0, 2);
	const compactReferences = pack.references.slice(0, 2);
	const compactWiki = pack.wiki.slice(0, 2);
	const compactPlaybooks = pack.playbooks.slice(0, 1);
	const compactMemory = pack.memory_keys.slice(0, 2);
	const compactLive = pack.live_query_steps.slice(0, 4);
	const compactHints = pack.execution_hints.slice(0, 8);

	const lines = [
		"[ERP Context Pack]",
		"runtime.gateway=openclaw_gateway",
		"runtime.orchestration=hermes_style",
		"runtime.knowledge_layer=ai_wiki",
		"runtime.pack_mode=compact",
		"runtime.token_budget_mode=compact_guarded",
		`planner.intent=${pack.planner.intent}`,
		`planner.confidence=${pack.planner.confidence}`,
		"planner.system_scope=erp",
		`planner.matched_keywords=${pack.planner.matchedKeywords.join(",") || "none"}`,
		`planner.read_first=${compactReadFirst.join(" | ")}`,
		`planner.references=${compactReferences.length > 0 ? compactReferences.join(" | ") : "none"}`,
		`planner.wiki=${compactWiki.length > 0 ? compactWiki.join(" | ") : "none"}`,
		`planner.playbooks=${compactPlaybooks.length > 0 ? compactPlaybooks.join(" | ") : "none"}`,
		`planner.memory=${compactMemory.length > 0 ? compactMemory.join(",") : "none"}`,
		`planner.live=${compactLive.join(",")}`,
		`planner.presentation.optional_chart_requested=${pack.presentation.optional_chart_requested ? "true" : "false"}`,
		`planner.presentation.chart_render_allowed=${pack.presentation.chart_render_allowed ? "true" : "false"}`,
		`planner.presentation.max_chart_panels=${pack.presentation.max_chart_panels}`,
		`planner.presentation.chart_guardrail=${pack.presentation.chart_guardrail_reason ?? "none"}`,
		`planner.warnings=${pack.planner.warnings.length > 0 ? pack.planner.warnings.join(",") : "none"}`,
		"Guidance:",
		...compactHints.map((hint) => `- ${hint}`),
		"[/ERP Context Pack]",
	];

	return `${lines.join("\n")}\n\n${userMessage}`;
}
