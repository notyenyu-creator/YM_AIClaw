import { describe, expect, it, vi } from "vitest";
import { POST } from "./route";

vi.mock("@/app/api/web-sessions/shared", () => ({
	getSessionMeta: vi.fn(),
	updateSessionPlannerLearningDraft: vi.fn(),
}));

describe("Y-CRM learning draft resolve debug API", () => {
	it("rejects invalid JSON", async () => {
		const request = new Request("http://localhost/api/debug/ycrm-learning-draft/resolve", {
			method: "POST",
			body: "{bad-json",
		});

		const response = await POST(request);
		expect(response.status).toBe(400);
	});

	it("rejects unsupported actions", async () => {
		const request = new Request("http://localhost/api/debug/ycrm-learning-draft/resolve", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ session_id: "s1", resolution_action: "nope" }),
		});

		const response = await POST(request);
		expect(response.status).toBe(400);
	});

	it("requires reviewer identity and review reason before resolving a conflict", async () => {
		const { getSessionMeta } = await import("@/app/api/web-sessions/shared");
		vi.mocked(getSessionMeta).mockReturnValue({
			id: "s-review-fields",
			plannerLearningDraft: {
				writeback: {
					status: "promotion_conflicted",
				},
			},
		} as never);

		const request = new Request("http://localhost/api/debug/ycrm-learning-draft/resolve", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				session_id: "s-review-fields",
				resolution_action: "keep_current_page",
			}),
		});

		const response = await POST(request);
		expect(response.status).toBe(400);
	});

	it("records keep-current resolution on the session draft", async () => {
		const { getSessionMeta, updateSessionPlannerLearningDraft } = await import("@/app/api/web-sessions/shared");
		vi.mocked(getSessionMeta).mockReturnValue({
			id: "s1",
			title: "Conflict Chat",
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
					status: "promotion_conflicted",
					updated_at: 1710000002000,
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
					wiki: [],
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
					{
						at: 1710000002000,
						event: "promotion_conflicted",
						tone: "warning",
						summary: "Promotion paused.",
						files: ["wiki/entities/customers/sample-customer-summary.md"],
					},
				],
			},
		} as never);

		const request = new Request("http://localhost/api/debug/ycrm-learning-draft/resolve", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				session_id: "s1",
				resolution_action: "keep_current_page",
				review_reason: "Keep curated page",
				reviewer_note: "Reviewed by operator and accepted the existing content.",
				reviewer_actor: "YM",
			}),
		});

		const response = await POST(request);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.resolution_action).toBe("keep_current_page");
		expect(updateSessionPlannerLearningDraft).toHaveBeenCalledWith(
			"s1",
			expect.objectContaining({
				writeback: expect.objectContaining({
					status: "resolution_kept_current",
					resolution_action: "keep_current_page",
					review_reason: "Keep curated page",
					reviewer_note: "Reviewed by operator and accepted the existing content.",
					reviewer_actor: "YM",
				}),
				history: expect.arrayContaining([
					expect.objectContaining({
						event: "resolution_kept_current",
						review_reason: "Keep curated page",
						reviewer_actor: "YM",
					}),
				]),
			}),
		);
	});

	it("rejects keep-current when the draft is not in conflicted state", async () => {
		const { getSessionMeta } = await import("@/app/api/web-sessions/shared");
		vi.mocked(getSessionMeta).mockReturnValue({
			id: "s-written",
			plannerLearningDraft: {
				writeback: {
					status: "written",
				},
			},
		} as never);

		const request = new Request("http://localhost/api/debug/ycrm-learning-draft/resolve", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				session_id: "s-written",
				resolution_action: "keep_current_page",
				review_reason: "No conflict to resolve",
				reviewer_actor: "YM",
			}),
		});

		const response = await POST(request);
		expect(response.status).toBe(409);
	});
});
