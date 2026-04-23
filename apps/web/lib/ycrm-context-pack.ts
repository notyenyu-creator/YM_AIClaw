import type {
	YcrmContextBuilderOutput,
	YcrmPlannerPreflight,
} from "./ycrm-context-builder";
import { summarizeYcrmContextPlan } from "./ycrm-context-builder";

export type YcrmContextPack = {
	planner: YcrmPlannerPreflight;
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

function selectCompactExecutionHints(
	pack: YcrmContextPack,
): string[] {
	const selected: string[] = [];

	for (const hint of pack.execution_hints) {
		if (selected.length >= 4) {
			break;
		}
		pushUnique(selected, hint);
	}

	const criticalMatchers = [
		"For charts, query real CRM data first and only then emit report-json VALUES payloads.",
		"Do not emit any report-json or chart card unless you already have non-empty aggregated chart data from a real query.",
		"The user only made chart rendering optional. Keep the primary response as an entity summary and use charts only as supporting visuals.",
		"Read the matching auto-schema reference before writing SQL or assuming field names.",
		"Resolve workspaceMember IDs first, then follow owner/assignee foreign keys instead of display labels.",
		"Do not start from workspace README.md for Y-CRM routing; use planner.read_first entries first because README may be absent.",
		"Only read schema references that match the resolved Y-CRM workspace in planner.read_first. Do not probe other workspace auto-schema files.",
		"Owner/assignee foreign keys are table-scoped. Never reuse a field like fuZeYeWuId on person/company unless that table's auto-schema explicitly shows it.",
		"When token pressure is high, prefer a concise text summary and skip optional charts, extra panels, and raw result dumps.",
	];

	for (const critical of criticalMatchers) {
		const match = pack.execution_hints.find((hint) => hint === critical);
		if (match) {
			pushUnique(selected, match);
		}
	}

	return selected.slice(0, 12);
}

function buildLiveQuerySteps(plan: YcrmContextBuilderOutput): string[] {
	const steps: string[] = [];

	if (plan.live_requirements.real_query_required) {
		pushUnique(steps, "read_real_data");
	}
	if (plan.live_requirements.auto_schema_required) {
		pushUnique(steps, "read_auto_schema_first");
	}
	if (plan.live_requirements.workspace_member_lookup_required) {
		pushUnique(steps, "resolve_workspace_member_fk");
	}
	if (plan.live_requirements.report_json_values_required) {
		pushUnique(steps, "emit_chart_from_report_json_values");
	}
	if (plan.live_requirements.rest_write_required) {
		pushUnique(steps, "write_via_rest_api_only");
	}
	if (plan.live_requirements.readback_required) {
		pushUnique(steps, "read_back_after_write");
	}

	return steps;
}

function buildExecutionHints(plan: YcrmContextBuilderOutput): string[] {
	const hints = [
		"Use the OpenClaw Gateway session runtime and follow the Hermes-style planner/context flow for this request.",
		"Treat the AI Wiki layer as the durable knowledge source; prefer planner.read_first and wiki references over generic workspace guesses.",
		"Keep Y-CRM as the source-of-truth for customer, contact, and opportunity semantics.",
		"Do not fabricate CRM records; verify live data before making operational claims.",
		"Do not start from workspace README.md for Y-CRM routing; use planner.read_first entries first because README may be absent.",
		"Only read schema references that match the resolved Y-CRM workspace in planner.read_first. Do not probe other workspace auto-schema files.",
		"Owner/assignee foreign keys are table-scoped. Never reuse a field like fuZeYeWuId on person/company unless that table's auto-schema explicitly shows it.",
		"When token pressure is high, prefer a concise text summary and skip optional charts, extra panels, and raw result dumps.",
	];

	if (plan.live_requirements.auto_schema_required) {
		hints.push("Read the matching auto-schema reference before writing SQL or assuming field names.");
	}
	if (plan.live_requirements.workspace_member_lookup_required) {
		hints.push("Resolve workspaceMember IDs first, then follow owner/assignee foreign keys instead of display labels.");
	}
	if (plan.live_requirements.report_json_values_required) {
		hints.push("For charts, query real CRM data first and only then emit report-json VALUES payloads.");
	}
	if (plan.presentation.chart_guardrail_reason === "chart_optional_if_non_empty_aggregates_available") {
		hints.push("The user only made chart rendering optional. Keep the primary response as an entity summary and use charts only as supporting visuals.");
		hints.push("Do not emit any report-json or chart card unless you already have non-empty aggregated chart data from a real query.");
		hints.push("If grouped chart data is empty, omit the chart card entirely and explain in plain text that grouped chart data is not available yet.");
	}
	if (plan.presentation.optional_chart_requested && plan.presentation.chart_render_allowed) {
		hints.push(`If you render charts, keep them compact and do not exceed ${plan.presentation.max_chart_panels} panels.`);
	}
	if (plan.live_requirements.rest_write_required) {
		hints.push("If a write is required, use the REST API path and verify the result with a readback.");
	}
	if (plan.handoff.cross_system) {
		hints.push(`Keep Y-CRM as commercial context only and hand off execution to: ${plan.handoff.target_systems.join(", ")}.`);
	}
	if (plan.notes.warnings.length > 0) {
		hints.push(`Watch-outs: ${plan.notes.warnings.join(", ")}.`);
	}
	if (plan.notes.blockers.length > 0) {
		hints.push(`Blockers: ${plan.notes.blockers.join(", ")}.`);
	}

	return hints;
}

export function buildYcrmContextPack(
	plan: YcrmContextBuilderOutput,
): YcrmContextPack {
	const readFirst = [
		...plan.context_bundle.rules,
		...plan.context_bundle.references,
	];

	return {
		planner: summarizeYcrmContextPlan(plan),
		presentation: { ...plan.presentation },
		read_first: readFirst,
		references: [...plan.context_bundle.references],
		wiki: [...plan.context_bundle.wiki],
		playbooks: [...plan.context_bundle.playbooks],
		memory_keys: [...plan.context_bundle.memory_keys],
		live_query_steps: buildLiveQuerySteps(plan),
		execution_hints: buildExecutionHints(plan),
	};
}

export function decorateMessageWithYcrmContextPack(
	userMessage: string,
	pack: YcrmContextPack,
): string {
	if (!pack.planner.shouldRouteToYcrm) {
		return userMessage;
	}

	const compactReadFirst = pack.read_first.slice(0, 3);
	const compactWiki = pack.wiki.slice(0, 2);
	const compactPlaybooks = pack.playbooks.slice(0, 1);
	const compactMemory = pack.memory_keys.slice(0, 2);
	const compactLive = pack.live_query_steps.slice(0, 4);
	const compactHints = selectCompactExecutionHints(pack);

	const lines = [
		"[Y-CRM Context Pack]",
		"runtime.gateway=openclaw_gateway",
		"runtime.orchestration=hermes_style",
		"runtime.knowledge_layer=ai_wiki",
		"runtime.pack_mode=compact",
		"runtime.token_budget_mode=compact_guarded",
		`planner.intent=${pack.planner.intent}`,
		`planner.confidence=${pack.planner.confidence}`,
		`planner.workspace=${pack.planner.workspaceId ?? "unresolved"}`,
		`planner.system_scope=ycrm:${pack.planner.workspaceId ?? "unresolved"}`,
		`planner.needs_workspace_validation=${pack.planner.needsWorkspaceValidation ? "true" : "false"}`,
		`planner.allowed_auto_schema=${compactReadFirst.filter((entry) => entry.includes("auto-schema-")).join(" | ") || "none"}`,
		"planner.owner_fk_policy=table_scoped_from_auto_schema_only",
		`planner.cross_system=${pack.planner.crossSystem ? pack.planner.targetSystems.join(",") : "no"}`,
		`planner.read_first=${compactReadFirst.length > 0 ? compactReadFirst.join(" | ") : "none"}`,
		`planner.wiki=${compactWiki.length > 0 ? compactWiki.join(" | ") : "none"}`,
		`planner.playbooks=${compactPlaybooks.length > 0 ? compactPlaybooks.join(" | ") : "none"}`,
		`planner.memory=${compactMemory.length > 0 ? compactMemory.join(",") : "none"}`,
		`planner.live=${compactLive.length > 0 ? compactLive.join(",") : "none"}`,
		`planner.presentation.optional_chart_requested=${pack.presentation.optional_chart_requested ? "true" : "false"}`,
		`planner.presentation.chart_render_allowed=${pack.presentation.chart_render_allowed ? "true" : "false"}`,
		`planner.presentation.max_chart_panels=${pack.presentation.max_chart_panels}`,
		`planner.presentation.chart_guardrail=${pack.presentation.chart_guardrail_reason ?? "none"}`,
		`planner.warnings=${pack.planner.warnings.length > 0 ? pack.planner.warnings.join(",") : "none"}`,
		`planner.blockers=${pack.planner.blockers.length > 0 ? pack.planner.blockers.join(",") : "none"}`,
		"Guidance:",
		...compactHints.map((hint) => `- ${hint}`),
		"[/Y-CRM Context Pack]",
	];

	return `${lines.join("\n")}\n\n${userMessage}`;
}
