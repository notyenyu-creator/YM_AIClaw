import { describe, expect, it } from "vitest";
import {
	applyYcrmLearningDraftKeepCurrentResolution,
	applyYcrmLearningDraftPromotion,
	applyYcrmLearningDraftWriteback,
	buildYcrmLearningDraft,
} from "./ycrm-learning-draft";

describe("buildYcrmLearningDraft", () => {
	it("creates customer-summary and memory drafts for entity-summary sessions", () => {
		const draft = buildYcrmLearningDraft({
			session_id: "s-learning",
			planner_preflight: {
				system: "ycrm",
				updatedAt: 1710000000000,
				intent: "entity_summary",
				confidence: "high",
				shouldRouteToYcrm: true,
				workspaceId: "workspace_3joxkr9ofo5hlxjan164egffx",
				needsWorkspaceValidation: false,
				warnings: [],
				blockers: [],
				crossSystem: false,
				targetSystems: [],
			},
			planner_context_pack: {
				planner: {
					system: "ycrm",
					updatedAt: 1710000000000,
					intent: "entity_summary",
					confidence: "high",
					shouldRouteToYcrm: true,
					workspaceId: "workspace_3joxkr9ofo5hlxjan164egffx",
					needsWorkspaceValidation: false,
					warnings: [],
					blockers: [],
					crossSystem: false,
					targetSystems: [],
				},
				presentation: {
					optional_chart_requested: false,
					chart_render_allowed: false,
					chart_guardrail_reason: null,
					max_chart_panels: 0,
				},
				read_first: ["skills/ycrm/SKILL.md"],
				references: [],
				wiki: ["wiki/entities/customers/YCRM_CUSTOMER_SUMMARY_TEMPLATE.md"],
				playbooks: [],
				memory_keys: ["known_rule:person_name_is_not_workspace"],
				live_query_steps: ["read_real_data", "read_auto_schema_first", "resolve_workspace_member_fk"],
				execution_hints: ["Resolve workspaceMember IDs before owner lookups."],
			},
			messages: [
				{
					id: "m1",
					role: "user",
					content: "請幫我整理 Y-CRM 工作區裡面的 Calleen Hong 目前負責的客戶背景。",
				},
				{
					id: "m2",
					role: "assistant",
					content: "已整理出該業務目前負責的客戶輪廓與下一步。",
				},
			],
		});

		expect(draft.status).toBe("ready");
		expect(draft.learning_focus).toBe("entity_summary");
		expect(draft.drafts.wiki[0]?.kind).toBe("customer_summary");
		expect(draft.drafts.memory[0]?.key).toContain("workspace_member_fk");
		expect(draft.history?.[0]?.event).toBe("draft_generated");
	});

	it("returns insufficient context when no planner metadata exists", () => {
		const draft = buildYcrmLearningDraft({
			session_id: "s-empty",
			planner_preflight: null,
			planner_context_pack: null,
			messages: [],
		});

		expect(draft.status).toBe("insufficient_context");
		expect(draft.drafts.wiki).toEqual([]);
		expect(draft.drafts.playbooks).toEqual([]);
		expect(draft.drafts.memory).toEqual([]);
		expect(draft.history?.[0]?.event).toBe("draft_skipped_insufficient_context");
	});

	it("appends audit-trail history entries across writeback, conflict, and resolution", () => {
		const baseDraft = buildYcrmLearningDraft({
			session_id: "s-history",
			planner_preflight: {
				system: "ycrm",
				updatedAt: 1710000000000,
				intent: "entity_summary",
				confidence: "high",
				shouldRouteToYcrm: true,
				workspaceId: "workspace_3joxkr9ofo5hlxjan164egffx",
				needsWorkspaceValidation: false,
				warnings: [],
				blockers: [],
				crossSystem: false,
				targetSystems: [],
			},
			planner_context_pack: {
				planner: {
					system: "ycrm",
					updatedAt: 1710000000000,
					intent: "entity_summary",
					confidence: "high",
					shouldRouteToYcrm: true,
					workspaceId: "workspace_3joxkr9ofo5hlxjan164egffx",
					needsWorkspaceValidation: false,
					warnings: [],
					blockers: [],
					crossSystem: false,
					targetSystems: [],
				},
				presentation: {
					optional_chart_requested: false,
					chart_render_allowed: false,
					chart_guardrail_reason: null,
					max_chart_panels: 0,
				},
				read_first: ["skills/ycrm/SKILL.md"],
				references: [],
				wiki: ["wiki/entities/customers/YCRM_CUSTOMER_SUMMARY_TEMPLATE.md"],
				playbooks: [],
				memory_keys: [],
				live_query_steps: ["read_real_data"],
				execution_hints: [],
			},
			messages: [{ role: "user", content: "整理客戶摘要" }],
		});

		const writtenDraft = applyYcrmLearningDraftWriteback(baseDraft, {
			files: ["wiki/entities/customers/sample-customer-summary.md"],
			skipped_files: [],
		});
		const conflictedDraft = applyYcrmLearningDraftPromotion(writtenDraft, {
			promoted_files: [],
			skipped_files: [],
			conflict_files: ["wiki/entities/customers/sample-customer-summary.md"],
			review_reason: "Manual page already exists",
			reviewer_note: "Keep the curated customer page for now.",
			reviewer_actor: "YM",
		});
		const resolvedDraft = applyYcrmLearningDraftKeepCurrentResolution(conflictedDraft, {
			conflict_files: ["wiki/entities/customers/sample-customer-summary.md"],
			review_reason: "Keep curated page",
			reviewer_note: "Reviewed and accepted existing content.",
			reviewer_actor: "YM",
		});

		expect(resolvedDraft.history?.map((entry) => entry.event)).toEqual([
			"draft_generated",
			"wiki_draft_written",
			"promotion_conflicted",
			"resolution_kept_current",
		]);
		expect(resolvedDraft.writeback.review_reason).toBe("Keep curated page");
		expect(resolvedDraft.writeback.reviewer_note).toBe("Reviewed and accepted existing content.");
		expect(resolvedDraft.writeback.reviewer_actor).toBe("YM");
	});
});
