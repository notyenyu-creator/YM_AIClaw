import { describe, expect, it } from "vitest";
import { GET, POST } from "./route";

describe("Y-CRM context builder debug API", () => {
  it("GET returns route metadata and a sample plan", async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.builder.id).toBe("ycrm_context_builder");
    expect(body.sample_output.decision.intent).toBe("product_help");
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

  it("POST rejects missing user_message", async () => {
    const request = new Request("http://localhost/api/debug/ycrm-context-builder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("user_message");
  });

  it("POST builds a plan for a Y-CRM entity summary request", async () => {
    const request = new Request("http://localhost/api/debug/ycrm-context-builder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_message: "請幫我整理 Y-CRM 工作區裡面的 Calleen Hong 目前負責的客戶背景。",
        current_system_hint: "ycrm",
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.plan.decision.intent).toBe("entity_summary");
    expect(body.plan.live_requirements.workspace_member_lookup_required).toBe(true);
    expect(body.plan.handoff.cross_system).toBe(false);
  });

  it("POST supports runtime overrides for missing auto-schema cases", async () => {
    const request = new Request("http://localhost/api/debug/ycrm-context-builder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_message: "幫我整理 HOPET 工作區裡最近一週的新商機。",
        current_system_hint: "ycrm",
        requested_workspace: "workspace_5sgeef4h8tfcbqihsmg9numuh",
        runtime_state: {
          available_auto_schema_workspaces: [
            "workspace_3joxkr9ofo5hlxjan164egffx",
          ],
        },
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.plan.notes.blockers).toContain("auto_schema_missing");
    expect(body.plan.workspace.resolved_workspace_id).toBe("workspace_5sgeef4h8tfcbqihsmg9numuh");
  });
});
