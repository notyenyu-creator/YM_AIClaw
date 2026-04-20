import { describe, expect, it, vi } from "vitest";
import { GET, POST } from "./route";

vi.mock("@/app/api/web-sessions/shared", () => ({
  getSessionMeta: vi.fn(),
  updateSessionPlannerLearningDraft: vi.fn(),
}));

describe("Y-CRM learning draft debug API", () => {
  it("GET returns route metadata and a sample draft", async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.sample_output.learning_focus).toBe("entity_summary");
    expect(body.sample_output.drafts.wiki.length).toBeGreaterThan(0);
  });

  it("POST rejects invalid JSON", async () => {
    const request = new Request("http://localhost/api/debug/ycrm-context-builder", {
      method: "POST",
      body: "{bad-json",
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("Invalid JSON");
  });

  it("POST rejects missing session_id", async () => {
    const request = new Request("http://localhost/api/debug/ycrm-learning-draft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("session_id");
  });

  it("POST builds a learning draft for a Y-CRM entity-summary session", async () => {
    const request = new Request("http://localhost/api/debug/ycrm-learning-draft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: "s1",
        planner_preflight: {
          system: "ycrm",
          updatedAt: 1710000000000,
          intent: "entity_summary",
          confidence: "high",
          shouldRouteToYcrm: true,
          workspaceId: "workspace_3jox",
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
            workspaceId: "workspace_3jox",
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
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.draft.learning_focus).toBe("entity_summary");
    expect(body.draft.drafts.wiki[0].kind).toBe("customer_summary");
    expect(body.draft.drafts.memory[0].key).toContain("workspace_member_fk");
  });

  it("POST reuses the persisted learning draft when force_regenerate is not set", async () => {
    const { getSessionMeta } = await import("@/app/api/web-sessions/shared");
    vi.mocked(getSessionMeta).mockReturnValue({
      id: "s-cache",
      title: "Cached Draft Chat",
      createdAt: 1,
      updatedAt: 2,
      messageCount: 2,
      plannerLearningDraft: {
        session_id: "s-cache",
        status: "ready",
        learning_focus: "entity_summary",
        summary: "Cached draft.",
        meta: {
          generated_at: 1710000000000,
          generation_mode: "minimal_evidence",
          token_guardrails: ["single_session_single_draft"],
          cached: false,
          source: "fresh_generation",
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
          wiki: [],
          playbooks: [],
          memory: [],
        },
      },
    } as never);

    const request = new Request("http://localhost/api/debug/ycrm-learning-draft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: "s-cache",
      }),
    });

    const response = await POST(request);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.cached).toBe(true);
    expect(body.draft.meta.cached).toBe(true);
    expect(body.draft.meta.source).toBe("session_cache");
  });

  it("POST returns insufficient_context when planner metadata is missing", async () => {
    const { getSessionMeta } = await import("@/app/api/web-sessions/shared");
    vi.mocked(getSessionMeta).mockReturnValue(undefined);

    const request = new Request("http://localhost/api/debug/ycrm-learning-draft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: "s-empty",
        messages: [],
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.draft.status).toBe("insufficient_context");
  });
});
