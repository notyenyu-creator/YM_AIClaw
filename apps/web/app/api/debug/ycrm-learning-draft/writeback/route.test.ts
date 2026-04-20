import { describe, expect, it, vi } from "vitest";
import { POST } from "./route";

vi.mock("@/app/api/web-sessions/shared", () => ({
	getSessionMeta: vi.fn(),
	updateSessionPlannerLearningDraft: vi.fn(),
}));

vi.mock("@/lib/ycrm-learning-writeback", () => ({
	writeYcrmLearningWikiDrafts: vi.fn(() => ({
		files: ["wiki/entities/customers/sample-customer-summary.md"],
		skipped_files: [],
	})),
}));

describe("Y-CRM learning draft writeback debug API", () => {
	it("rejects invalid JSON", async () => {
		const request = new Request("http://localhost/api/debug/ycrm-learning-draft/writeback", {
			method: "POST",
			body: "{bad-json",
		});

		const response = await POST(request);
		expect(response.status).toBe(400);
	});

	it("returns 404 when no persisted learning draft exists", async () => {
		const { getSessionMeta } = await import("@/app/api/web-sessions/shared");
		vi.mocked(getSessionMeta).mockReturnValue(undefined);

		const request = new Request("http://localhost/api/debug/ycrm-learning-draft/writeback", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ session_id: "s-missing" }),
		});

		const response = await POST(request);
		expect(response.status).toBe(404);
	});

	it("writes wiki draft files from the persisted learning draft", async () => {
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
					status: "not_written",
					updated_at: null,
					files: [],
					skipped_files: [],
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
			},
		} as never);

		const request = new Request("http://localhost/api/debug/ycrm-learning-draft/writeback", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ session_id: "s1" }),
		});

		const response = await POST(request);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.ok).toBe(true);
		expect(body.writeback.files).toContain("wiki/entities/customers/sample-customer-summary.md");
		expect(updateSessionPlannerLearningDraft).toHaveBeenCalledWith(
			"s1",
			expect.objectContaining({
				writeback: expect.objectContaining({
					status: "written",
				}),
			}),
		);
	});
});
