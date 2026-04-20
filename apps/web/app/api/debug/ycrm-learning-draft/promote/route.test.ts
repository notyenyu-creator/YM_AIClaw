import { describe, expect, it, vi } from "vitest";
import { POST } from "./route";

vi.mock("@/app/api/web-sessions/shared", () => ({
	getSessionMeta: vi.fn(),
	updateSessionPlannerLearningDraft: vi.fn(),
}));

vi.mock("@/lib/ycrm-learning-promotion", () => ({
	promoteYcrmLearningWikiDrafts: vi.fn(() => ({
		promoted_files: ["wiki/entities/customers/sample-customer-summary.md"],
		skipped_files: [],
		conflict_files: [],
		conflict_details: [],
		updated_supporting_files: ["wiki/index.md", "wiki/log.md"],
	})),
}));

describe("Y-CRM learning draft promotion debug API", () => {
	it("rejects invalid JSON", async () => {
		const request = new Request("http://localhost/api/debug/ycrm-learning-draft/promote", {
			method: "POST",
			body: "{bad-json",
		});

		const response = await POST(request);
		expect(response.status).toBe(400);
	});

	it("returns 404 when no persisted learning draft exists", async () => {
		const { getSessionMeta } = await import("@/app/api/web-sessions/shared");
		vi.mocked(getSessionMeta).mockReturnValue(undefined);

		const request = new Request("http://localhost/api/debug/ycrm-learning-draft/promote", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ session_id: "s-missing" }),
		});

		const response = await POST(request);
		expect(response.status).toBe(404);
	});

	it("requires reviewer identity and review reason before promotion", async () => {
		const { getSessionMeta } = await import("@/app/api/web-sessions/shared");
		vi.mocked(getSessionMeta).mockReturnValue({
			id: "s-review-fields",
			plannerLearningDraft: {
				writeback: {
					status: "written",
				},
			},
		} as never);

		const request = new Request("http://localhost/api/debug/ycrm-learning-draft/promote", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ session_id: "s-review-fields" }),
		});

		const response = await POST(request);
		expect(response.status).toBe(400);
	});

	it("promotes written wiki draft files into the wiki registry", async () => {
		const { getSessionMeta, updateSessionPlannerLearningDraft } = await import("@/app/api/web-sessions/shared");
		vi.mocked(getSessionMeta).mockReturnValue({
			id: "s1",
			title: "Learning Chat",
			createdAt: 1,
			updatedAt: 2,
			messageCount: 2,
			plannerLearningDraft: {
				session_id: "s1",
				status: "ready",
				learning_focus: "entity_summary",
				summary: "Generated draft.",
				meta: {
					generated_at: 1710000000000,
					generation_mode: "minimal_evidence",
					token_guardrails: ["single_session_single_draft"],
					cached: true,
					source: "session_cache",
				},
				writeback: {
					status: "written",
					updated_at: 1710000000100,
					files: ["wiki/entities/customers/sample-customer-summary.md"],
					skipped_files: [],
					promoted_files: [],
					promotion_skipped_files: [],
					promotion_conflict_files: [],
					approved_at: null,
					approved_via: null,
				},
				evidence: {
					latest_user_message: "hello",
					latest_assistant_reply: "hi",
					live_query_steps: ["read_real_data"],
				},
				drafts: {
					wiki: [
						{
							kind: "customer_summary",
							suggested_path: "wiki/entities/customers/sample-customer-summary.md",
							title: "Customer Summary Draft",
							reason: "Reusable summary.",
							outline: ["客戶背景"],
						},
					],
					playbooks: [],
					memory: [],
				},
				history: [
					{
						at: 1710000000000,
						event: "draft_generated",
						tone: "neutral",
						summary: "Generated draft.",
						files: [],
					},
				],
			},
		} as never);

		const request = new Request("http://localhost/api/debug/ycrm-learning-draft/promote", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				session_id: "s1",
				review_reason: "Approved after review",
				reviewer_note: "Looks safe to promote.",
				reviewer_actor: "YM",
			}),
		});

		const response = await POST(request);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.ok).toBe(true);
		expect(body.promotion.promoted_files).toContain("wiki/entities/customers/sample-customer-summary.md");
		expect(updateSessionPlannerLearningDraft).toHaveBeenCalledWith(
			"s1",
			expect.objectContaining({
				writeback: expect.objectContaining({
					status: "promoted",
					promoted_files: ["wiki/entities/customers/sample-customer-summary.md"],
					review_reason: "Approved after review",
					reviewer_note: "Looks safe to promote.",
					reviewer_actor: "YM",
				}),
				history: expect.arrayContaining([
					expect.objectContaining({
						event: "promotion_succeeded",
						review_reason: "Approved after review",
						reviewer_actor: "YM",
					}),
				]),
			}),
		);
	});

	it("marks promotion as conflicted when helper reports conflict files", async () => {
		const { getSessionMeta, updateSessionPlannerLearningDraft } = await import("@/app/api/web-sessions/shared");
		const { promoteYcrmLearningWikiDrafts } = await import("@/lib/ycrm-learning-promotion");

		vi.mocked(promoteYcrmLearningWikiDrafts).mockReturnValueOnce({
			promoted_files: [],
			skipped_files: [],
			conflict_files: ["wiki/entities/customers/sample-customer-summary.md"],
			conflict_details: [
				{
					file_path: "wiki/entities/customers/sample-customer-summary.md",
					reason: "manual_content_detected",
					current_title: "Manually Curated Customer Page",
					current_excerpt: "This page was edited by a human.",
					current_source_session: null,
					proposed_title: "Customer Summary Draft",
					proposed_outline: ["客戶背景"],
				},
			],
			updated_supporting_files: [],
		} as never);

		vi.mocked(getSessionMeta).mockReturnValue({
			id: "s-conflict",
			title: "Conflict Chat",
			createdAt: 1,
			updatedAt: 2,
			messageCount: 2,
			plannerLearningDraft: {
				session_id: "s-conflict",
				status: "ready",
				learning_focus: "entity_summary",
				summary: "Generated draft.",
				meta: {
					generated_at: 1710000000000,
					generation_mode: "minimal_evidence",
					token_guardrails: ["single_session_single_draft"],
					cached: true,
					source: "session_cache",
				},
				writeback: {
					status: "written",
					updated_at: 1710000000100,
					files: ["wiki/entities/customers/sample-customer-summary.md"],
					skipped_files: [],
					promoted_files: [],
					promotion_skipped_files: [],
					promotion_conflict_files: [],
					approved_at: null,
					approved_via: null,
				},
				evidence: {
					latest_user_message: "hello",
					latest_assistant_reply: "hi",
					live_query_steps: ["read_real_data"],
				},
				drafts: {
					wiki: [
						{
							kind: "customer_summary",
							suggested_path: "wiki/entities/customers/sample-customer-summary.md",
							title: "Customer Summary Draft",
							reason: "Reusable summary.",
							outline: ["客戶背景"],
						},
					],
					playbooks: [],
					memory: [],
				},
				history: [
					{
						at: 1710000000000,
						event: "draft_generated",
						tone: "neutral",
						summary: "Generated draft.",
						files: [],
					},
				],
			},
		} as never);

		const request = new Request("http://localhost/api/debug/ycrm-learning-draft/promote", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				session_id: "s-conflict",
				review_reason: "Need human review",
				reviewer_note: "This page may already be curated.",
				reviewer_actor: "YM",
			}),
		});

		const response = await POST(request);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.promotion.conflict_files).toContain("wiki/entities/customers/sample-customer-summary.md");
		expect(body.promotion.conflict_details[0].reason).toBe("manual_content_detected");
		expect(updateSessionPlannerLearningDraft).toHaveBeenCalledWith(
			"s-conflict",
			expect.objectContaining({
				writeback: expect.objectContaining({
					status: "promotion_conflicted",
					promotion_conflict_files: ["wiki/entities/customers/sample-customer-summary.md"],
					review_reason: "Need human review",
					reviewer_note: "This page may already be curated.",
					reviewer_actor: "YM",
				}),
				history: expect.arrayContaining([
					expect.objectContaining({
						event: "promotion_conflicted",
						reviewer_note: "This page may already be curated.",
						reviewer_actor: "YM",
					}),
				]),
			}),
		);
	});

	it("uses force-promote approval metadata when override is requested", async () => {
		const { getSessionMeta, updateSessionPlannerLearningDraft } = await import("@/app/api/web-sessions/shared");
		vi.mocked(getSessionMeta).mockReturnValue({
			id: "s-force",
			title: "Force Chat",
			createdAt: 1,
			updatedAt: 2,
			messageCount: 2,
			plannerLearningDraft: {
				session_id: "s-force",
				status: "ready",
				learning_focus: "entity_summary",
				summary: "Generated draft.",
				meta: {
					generated_at: 1710000000000,
					generation_mode: "minimal_evidence",
					token_guardrails: ["single_session_single_draft"],
					cached: true,
					source: "session_cache",
				},
				writeback: {
					status: "promotion_conflicted",
					updated_at: 1710000000100,
					files: ["wiki/entities/customers/sample-customer-summary.md"],
					skipped_files: [],
					promoted_files: [],
					promotion_skipped_files: [],
					promotion_conflict_files: ["wiki/entities/customers/sample-customer-summary.md"],
					approved_at: null,
					approved_via: null,
					resolution_action: null,
					resolved_at: null,
				},
				evidence: {
					latest_user_message: "hello",
					latest_assistant_reply: "hi",
					live_query_steps: ["read_real_data"],
				},
				drafts: {
					wiki: [
						{
							kind: "customer_summary",
							suggested_path: "wiki/entities/customers/sample-customer-summary.md",
							title: "Customer Summary Draft",
							reason: "Reusable summary.",
							outline: ["客戶背景"],
						},
					],
					playbooks: [],
					memory: [],
				},
				history: [
					{
						at: 1710000000000,
						event: "draft_generated",
						tone: "neutral",
						summary: "Generated draft.",
						files: [],
					},
				],
			},
		} as never);

		const request = new Request("http://localhost/api/debug/ycrm-learning-draft/promote", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				session_id: "s-force",
				force_conflict_override: true,
				review_reason: "Need a forced override",
				reviewer_actor: "YM",
			}),
		});

		const response = await POST(request);
		expect(response.status).toBe(200);
		expect(updateSessionPlannerLearningDraft).toHaveBeenCalledWith(
			"s-force",
			expect.objectContaining({
				writeback: expect.objectContaining({
					approved_via: "manual_force_promotion",
					resolution_action: "force_promote_override",
				}),
			}),
		);
	});

	it("rejects normal promotion when the draft is already conflicted", async () => {
		const { getSessionMeta } = await import("@/app/api/web-sessions/shared");
		vi.mocked(getSessionMeta).mockReturnValue({
			id: "s-conflicted",
			plannerLearningDraft: {
				writeback: {
					status: "promotion_conflicted",
				},
			},
		} as never);

		const request = new Request("http://localhost/api/debug/ycrm-learning-draft/promote", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				session_id: "s-conflicted",
				review_reason: "Need manual decision",
				reviewer_actor: "YM",
			}),
		});

		const response = await POST(request);
		expect(response.status).toBe(409);
	});

	it("rejects force promote when no conflict is recorded", async () => {
		const { getSessionMeta } = await import("@/app/api/web-sessions/shared");
		vi.mocked(getSessionMeta).mockReturnValue({
			id: "s-written",
			plannerLearningDraft: {
				writeback: {
					status: "written",
				},
			},
		} as never);

		const request = new Request("http://localhost/api/debug/ycrm-learning-draft/promote", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				session_id: "s-written",
				force_conflict_override: true,
				review_reason: "Override anyway",
				reviewer_actor: "YM",
			}),
		});

		const response = await POST(request);
		expect(response.status).toBe(409);
	});
});
