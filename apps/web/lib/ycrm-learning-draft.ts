import type { SessionPlannerPreflight } from "@/app/api/web-sessions/shared";
import type { YcrmContextPack } from "./ycrm-context-pack";

export type YcrmLearningDraftMessage = {
	id?: string;
	role: "user" | "assistant";
	content?: string;
};

export type YcrmLearningDraftInput = {
	session_id: string;
	planner_preflight: SessionPlannerPreflight | null;
	planner_context_pack: YcrmContextPack | null;
	messages: YcrmLearningDraftMessage[];
};

export type YcrmLearningDraft = {
	session_id: string;
	status: "ready" | "insufficient_context";
	learning_focus: string;
	summary: string;
	meta: {
		generated_at: number;
		generation_mode: "minimal_evidence";
		token_guardrails: string[];
		cached: boolean;
		source: "fresh_generation" | "session_cache";
	};
	writeback: {
		status: "not_written" | "written" | "promoted" | "promotion_conflicted" | "resolution_kept_current";
		updated_at: number | null;
		files: string[];
		skipped_files: string[];
		promoted_files: string[];
		promotion_skipped_files: string[];
		promotion_conflict_files: string[];
		approved_at?: number | null;
		approved_via?: "manual_promotion" | "manual_force_promotion" | null;
		resolution_action?: "keep_current_page" | "force_promote_override" | null;
		resolved_at?: number | null;
		review_reason?: string | null;
		reviewer_note?: string | null;
		reviewer_actor?: string | null;
	};
	evidence: {
		latest_user_message: string | null;
		latest_assistant_reply: string | null;
		live_query_steps: string[];
	};
	drafts: {
		wiki: Array<{
			kind: "customer_summary" | "opportunity_summary" | "line_interaction_summary";
			suggested_path: string;
			title: string;
			reason: string;
			outline: string[];
		}>;
		playbooks: Array<{
			kind: "sales_analysis" | "followup_playbook" | "cross_system_handoff";
			suggested_path: string;
			title: string;
			reason: string;
			next_sections: string[];
		}>;
		memory: Array<{
			key: string;
			value: string;
			reason: string;
		}>;
	};
	history?: YcrmLearningDraftHistoryEntry[];
};

export type YcrmLearningDraftHistoryEntry = {
	at: number;
	event:
		| "draft_generated"
		| "draft_skipped_insufficient_context"
		| "wiki_draft_written"
		| "promotion_conflicted"
		| "promotion_succeeded"
		| "resolution_kept_current";
	tone: "neutral" | "success" | "warning";
	summary: string;
	files: string[];
	review_reason?: string | null;
	reviewer_note?: string | null;
	reviewer_actor?: string | null;
};

function appendHistoryEntry(
	draft: YcrmLearningDraft,
	entry: Omit<YcrmLearningDraftHistoryEntry, "at"> & { at?: number },
): YcrmLearningDraftHistoryEntry[] {
	return [
		...(draft.history ?? []),
		{
			at: entry.at ?? Date.now(),
			event: entry.event,
			tone: entry.tone,
			summary: entry.summary,
			files: [...entry.files],
			review_reason: entry.review_reason ?? null,
			reviewer_note: entry.reviewer_note ?? null,
			reviewer_actor: entry.reviewer_actor ?? null,
		},
	];
}

function normalizeOptionalReviewText(value: string | null | undefined): string | null {
	if (typeof value !== "string") {
		return null;
	}
	const normalized = value.trim();
	return normalized.length > 0 ? normalized : null;
}

function compactText(value: string | null | undefined, max = 180): string | null {
	if (!value) {
		return null;
	}
	const normalized = value.replace(/\s+/g, " ").trim();
	if (!normalized) {
		return null;
	}
	return normalized.length > max ? `${normalized.slice(0, max - 3)}...` : normalized;
}

function latestMessage(
	messages: YcrmLearningDraftMessage[],
	role: "user" | "assistant",
): string | null {
	const message = [...messages].reverse().find((entry) => entry.role === role);
	return compactText(message?.content);
}

function workspaceSlug(workspaceId: string | null | undefined): string {
	if (!workspaceId) {
		return "unknown-workspace";
	}
	return workspaceId.slice(0, 12);
}

function titleSuffix(input: YcrmLearningDraftInput): string {
	const workspace = workspaceSlug(input.planner_preflight?.workspaceId);
	return `${workspace}-${input.session_id.slice(0, 8)}`;
}

export function buildYcrmLearningDraft(
	input: YcrmLearningDraftInput,
): YcrmLearningDraft {
	const latestUserMessage = latestMessage(input.messages, "user");
	const latestAssistantReply = latestMessage(input.messages, "assistant");
	const planner = input.planner_preflight;
	const pack = input.planner_context_pack;
	const suffix = titleSuffix(input);

	if (!planner || !planner.shouldRouteToYcrm) {
		return {
			session_id: input.session_id,
			status: "insufficient_context",
			learning_focus: "planner_not_available",
			summary: "This session does not yet have a persisted Y-CRM planner context, so no learning draft was generated.",
			meta: {
				generated_at: Date.now(),
				generation_mode: "minimal_evidence",
				token_guardrails: [
					"manual_trigger_only",
					"planner_context_only",
					"single_session_single_draft",
				],
				cached: false,
				source: "fresh_generation",
			},
			writeback: {
				status: "not_written",
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
				latest_user_message: latestUserMessage,
				latest_assistant_reply: latestAssistantReply,
				live_query_steps: [],
			},
			drafts: {
				wiki: [],
				playbooks: [],
				memory: [],
			},
			history: [
				{
					at: Date.now(),
					event: "draft_skipped_insufficient_context",
					tone: "warning",
					summary: "Skipped learning draft generation because the session does not yet have persisted Y-CRM planner context.",
					files: [],
				},
			],
		};
	}

	const wiki: YcrmLearningDraft["drafts"]["wiki"] = [];
	const playbooks: YcrmLearningDraft["drafts"]["playbooks"] = [];
	const memory: YcrmLearningDraft["drafts"]["memory"] = [];
	const liveQuerySteps = [...(pack?.live_query_steps ?? [])];

	if (planner.intent === "entity_summary" || planner.intent === "write_intent") {
		wiki.push({
			kind: "customer_summary",
			suggested_path: `wiki/entities/customers/${suffix}-customer-summary.md`,
			title: `Y-CRM Customer Summary Draft ${suffix}`,
			reason: "This session focused on customer/account context and is a good candidate for a durable customer summary page.",
			outline: [
				"客戶背景與關鍵利害關係人",
				"最新互動與商機狀態",
				"下一步跟進與待確認事項",
			],
		});
	}

	if (planner.intent === "sales_report" || planner.intent === "opportunity_analysis") {
		wiki.push({
			kind: "opportunity_summary",
			suggested_path: `wiki/entities/opportunities/${suffix}-opportunity-summary.md`,
			title: `Y-CRM Opportunity Summary Draft ${suffix}`,
			reason: "This session analyzed pipeline or opportunity health and should leave behind a reusable opportunity summary.",
			outline: [
				"商機概況與健康度",
				"主要風險與阻塞點",
				"建議下一步與需要補的資料",
			],
		});
		playbooks.push({
			kind: "sales_analysis",
			suggested_path: `wiki/playbooks/ycrm/${suffix}-sales-analysis-playbook.md`,
			title: `Y-CRM Sales Analysis Playbook Draft ${suffix}`,
			reason: "The session used sales-analysis style reasoning and can be turned into a repeatable analysis playbook.",
			next_sections: [
				"問題定義與分析目標",
				"必要查詢步驟與 guardrails",
				"圖表輸出與 follow-up 建議",
			],
		});
	}

	if (planner.intent === "line_interaction_review") {
		wiki.push({
			kind: "line_interaction_summary",
			suggested_path: `wiki/operations/ycrm/${suffix}-line-interaction-summary.md`,
			title: `Y-CRM LINE Interaction Summary Draft ${suffix}`,
			reason: "This session reviewed LINE interactions and should leave behind a reusable interaction summary.",
			outline: [
				"對話摘要與客戶情緒",
				"待回覆主題與承諾事項",
				"建議 follow-up 節奏",
			],
		});
		playbooks.push({
			kind: "followup_playbook",
			suggested_path: `wiki/playbooks/ycrm/${suffix}-followup-playbook.md`,
			title: `Y-CRM Follow-up Playbook Draft ${suffix}`,
			reason: "The session surfaced follow-up logic that can be reused for future Y-CRM LINE reviews.",
			next_sections: [
				"何時適合建立 follow-up 草稿",
				"回覆語氣與節奏規則",
				"需要人工確認的情境",
			],
		});
	}

	if (planner.crossSystem) {
		playbooks.push({
			kind: "cross_system_handoff",
			suggested_path: `wiki/playbooks/ycrm/${suffix}-cross-system-handoff.md`,
			title: `Y-CRM Cross-System Handoff Draft ${suffix}`,
			reason: "The session crossed into ERP / WMS / MES / EMS territory and should leave behind a handoff playbook.",
			next_sections: [
				"Y-CRM 提供的商業語義上下文",
				"需要 handoff 的系統與查詢責任",
				"source-of-truth 與回寫邊界",
			],
		});
	}

	if (liveQuerySteps.includes("resolve_workspace_member_fk")) {
		memory.push({
			key: "known_rule:person_name_requires_workspace_member_fk",
			value: "When a Y-CRM request references a salesperson by name, resolve workspaceMember first and then follow owner/assignee foreign keys.",
			reason: "This session required person-name disambiguation and reinforced the workspaceMember lookup rule.",
		});
	}

	if (liveQuerySteps.includes("emit_chart_from_report_json_values")) {
		memory.push({
			key: "known_rule:charts_use_report_json_values",
			value: "Build charts from real query results first, then emit report-json VALUES payloads for rendering.",
			reason: "This session involved chart output and reinforced the VALUES-based chart guardrail.",
		});
	}

	if (planner.crossSystem) {
		memory.push({
			key: "known_rule:ycrm_is_commercial_context_only_for_cross_system",
			value: "Keep Y-CRM as commercial context only when ERP, WMS, MES, or EMS source-of-truth systems are required.",
			reason: "This session crossed system boundaries and should preserve the source-of-truth handoff rule.",
		});
	}

	const focus = planner.crossSystem
		? "cross_system_handoff"
		: planner.intent;

	return {
		session_id: input.session_id,
		status: "ready",
		learning_focus: focus,
		summary: `Generated a first-pass Y-CRM learning draft from the persisted session context for intent "${planner.intent}".`,
		meta: {
			generated_at: Date.now(),
			generation_mode: "minimal_evidence",
			token_guardrails: [
				"manual_trigger_only",
				"planner_context_only",
				"single_session_single_draft",
			],
			cached: false,
			source: "fresh_generation",
		},
		writeback: {
			status: "not_written",
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
			latest_user_message: latestUserMessage,
			latest_assistant_reply: latestAssistantReply,
			live_query_steps: liveQuerySteps,
		},
		drafts: {
			wiki,
			playbooks,
			memory,
		},
		history: [
			{
				at: Date.now(),
				event: "draft_generated",
				tone: "neutral",
				summary: `Generated a Y-CRM learning draft for intent "${planner.intent}" using minimal-evidence mode.`,
				files: [],
			},
		],
	};
}

export function markYcrmLearningDraftAsCached(
	draft: YcrmLearningDraft,
): YcrmLearningDraft {
	return {
		...draft,
		meta: {
			...draft.meta,
			cached: true,
			source: "session_cache",
		},
	};
}

export function applyYcrmLearningDraftWriteback(
	draft: YcrmLearningDraft,
	result: {
		files: string[];
		skipped_files: string[];
	},
): YcrmLearningDraft {
	return {
		...draft,
		writeback: {
			status: "written",
			updated_at: Date.now(),
			files: [...result.files],
			skipped_files: [...result.skipped_files],
			promoted_files: [...(draft.writeback.promoted_files ?? [])],
			promotion_skipped_files: [...(draft.writeback.promotion_skipped_files ?? [])],
			promotion_conflict_files: [...(draft.writeback.promotion_conflict_files ?? [])],
			approved_at: draft.writeback.approved_at ?? null,
			approved_via: draft.writeback.approved_via ?? null,
			resolution_action: draft.writeback.resolution_action ?? null,
			resolved_at: draft.writeback.resolved_at ?? null,
			review_reason: draft.writeback.review_reason ?? null,
			reviewer_note: draft.writeback.reviewer_note ?? null,
			reviewer_actor: draft.writeback.reviewer_actor ?? null,
		},
		history: appendHistoryEntry(draft, {
			event: "wiki_draft_written",
			tone: result.files.length > 0 ? "success" : "warning",
			summary: result.files.length > 0
				? `Wrote ${result.files.length} wiki draft file${result.files.length === 1 ? "" : "s"} for review.`
				: "Writeback completed without creating new wiki draft files.",
			files: [...result.files, ...result.skipped_files],
		}),
	};
}

export function applyYcrmLearningDraftPromotion(
	draft: YcrmLearningDraft,
	result: {
		promoted_files: string[];
		skipped_files: string[];
		conflict_files?: string[];
		approved_via?: "manual_promotion" | "manual_force_promotion";
		resolution_action?: "force_promote_override" | null;
		review_reason?: string | null;
		reviewer_note?: string | null;
		reviewer_actor?: string | null;
	},
): YcrmLearningDraft {
	const hasPromotedFiles = result.promoted_files.length > 0;
	const hasConflicts = (result.conflict_files?.length ?? 0) > 0;
	const approvedAt = hasPromotedFiles ? Date.now() : (draft.writeback.approved_at ?? null);
	const approvedVia = hasPromotedFiles ? (result.approved_via ?? "manual_promotion") : (draft.writeback.approved_via ?? null);
	const resolutionAction = hasPromotedFiles ? (result.resolution_action ?? null) : (draft.writeback.resolution_action ?? null);
	const resolvedAt = hasPromotedFiles && result.resolution_action ? Date.now() : (draft.writeback.resolved_at ?? null);
	const reviewReason = normalizeOptionalReviewText(result.review_reason) ?? (draft.writeback.review_reason ?? null);
	const reviewerNote = normalizeOptionalReviewText(result.reviewer_note) ?? (draft.writeback.reviewer_note ?? null);
	const reviewerActor = normalizeOptionalReviewText(result.reviewer_actor) ?? (draft.writeback.reviewer_actor ?? null);

	return {
		...draft,
		writeback: {
			...draft.writeback,
			status: hasConflicts ? "promotion_conflicted" : "promoted",
			updated_at: Date.now(),
			promoted_files: [...result.promoted_files],
			promotion_skipped_files: [...result.skipped_files],
			promotion_conflict_files: [...(result.conflict_files ?? [])],
			approved_at: approvedAt,
			approved_via: approvedVia,
			resolution_action: resolutionAction,
			resolved_at: resolvedAt,
			review_reason: reviewReason,
			reviewer_note: reviewerNote,
			reviewer_actor: reviewerActor,
		},
		history: appendHistoryEntry(draft, {
			event: hasConflicts ? "promotion_conflicted" : "promotion_succeeded",
			tone: hasConflicts ? "warning" : "success",
			summary: hasConflicts
				? `Promotion paused because ${result.conflict_files?.length ?? 0} wiki page conflict${(result.conflict_files?.length ?? 0) === 1 ? "" : "s"} need review.`
				: result.approved_via === "manual_force_promotion"
					? `Force-promoted ${result.promoted_files.length} wiki draft file${result.promoted_files.length === 1 ? "" : "s"} after manual override.`
					: `Promoted ${result.promoted_files.length} wiki draft file${result.promoted_files.length === 1 ? "" : "s"} into the wiki registry.`,
			files: hasConflicts
				? [...(result.conflict_files ?? [])]
				: [...result.promoted_files, ...result.skipped_files],
			review_reason: reviewReason,
			reviewer_note: reviewerNote,
			reviewer_actor: reviewerActor,
		}),
	};
}

export function applyYcrmLearningDraftKeepCurrentResolution(
	draft: YcrmLearningDraft,
	result: {
		conflict_files: string[];
		review_reason?: string | null;
		reviewer_note?: string | null;
		reviewer_actor?: string | null;
	},
): YcrmLearningDraft {
	const reviewReason = normalizeOptionalReviewText(result.review_reason) ?? (draft.writeback.review_reason ?? null);
	const reviewerNote = normalizeOptionalReviewText(result.reviewer_note) ?? (draft.writeback.reviewer_note ?? null);
	const reviewerActor = normalizeOptionalReviewText(result.reviewer_actor) ?? (draft.writeback.reviewer_actor ?? null);

	return {
		...draft,
		writeback: {
			...draft.writeback,
			status: "resolution_kept_current",
			updated_at: Date.now(),
			promotion_conflict_files: [...result.conflict_files],
			resolution_action: "keep_current_page",
			resolved_at: Date.now(),
			review_reason: reviewReason,
			reviewer_note: reviewerNote,
			reviewer_actor: reviewerActor,
		},
		history: appendHistoryEntry(draft, {
			event: "resolution_kept_current",
			tone: "warning",
			summary: "Kept the current wiki page and recorded the draft as reviewed without overwriting content.",
			files: [...result.conflict_files],
			review_reason: reviewReason,
			reviewer_note: reviewerNote,
			reviewer_actor: reviewerActor,
		}),
	};
}
