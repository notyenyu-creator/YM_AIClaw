import { describe, expect, it } from "vitest";
import { GET, POST } from "./route";

describe("ERP context builder debug API", () => {
  it("GET returns route metadata and a sample plan", async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.builder.id).toBe("erp_context_builder");
    expect(body.sample_output.planner.intent).toBe("sales_order");
    expect(body.sample_output.pack.read_first).toContain("skills/erp/SKILL.md");
  });

  it("POST rejects invalid JSON", async () => {
    const request = new Request("http://localhost/api/debug/erp-context-builder", {
      method: "POST",
      body: "{bad-json",
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("Invalid JSON");
  });

  it("POST rejects missing user_message", async () => {
    const request = new Request("http://localhost/api/debug/erp-context-builder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("user_message");
  });

  it("POST builds planner and pack for an ERP request", async () => {
    const request = new Request("http://localhost/api/debug/erp-context-builder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_message: "請幫我查 OOCHAIN 本月還沒出貨的訂單。",
        current_system_hint: "erp",
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.planner.intent).toBe("sales_order");
    expect(body.planner.shouldRouteToErp).toBe(true);
    expect(body.pack.planner.intent).toBe("sales_order");
    expect(body.pack.read_first).toContain("skills/erp/SKILL.md");
  });
});
