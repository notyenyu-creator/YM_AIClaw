// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { usePathname, useSearchParams } from "next/navigation";
import Page from "./page";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/debug/erp-context-builder"),
  useSearchParams: vi.fn(() => new URLSearchParams() as never),
}));

describe("ERP context builder debug page", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.history.replaceState({}, "", "/debug/erp-context-builder");
    vi.mocked(usePathname).mockReturnValue("/debug/erp-context-builder");
    vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams() as never);
  });

  it("renders sample output from the debug route", async () => {
    global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url === "/api/debug/erp-context-builder" && (!init || !init.method || init.method === "GET")) {
        return Promise.resolve(new Response(JSON.stringify({
          ok: true,
          defaults: {
            request: {
              user_message: "請幫我查 OOCHAIN 本月還沒出貨的訂單。",
              current_system_hint: "erp",
            },
          },
          sample_output: {
            planner: {
              intent: "sales_order",
              confidence: "high",
              shouldRouteToErp: true,
            },
          },
        })));
      }
      if (url === "/api/web-sessions/erp-session-1") {
        return Promise.resolve(new Response(JSON.stringify({
          id: "erp-session-1",
          session: {
            erpPlannerLearningDraft: {
              session_id: "erp-session-1",
              status: "ready",
              writeback: { status: "not_written" },
            },
          },
        })));
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch;

    render(<Page />);

    await waitFor(() => {
      expect(screen.getByText("ERP Context Builder")).toBeInTheDocument();
    });

    expect(screen.getAllByText(/sales_order/i).length).toBeGreaterThan(0);
    expect(screen.getByDisplayValue("請幫我查 OOCHAIN 本月還沒出貨的訂單。")).toBeInTheDocument();
  });

  it("renders review-mode heading when opened from the formal review route", async () => {
    vi.mocked(usePathname).mockReturnValue("/review/erp");
    vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams("sessionId=erp-session-1") as never);

    global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url === "/api/debug/erp-context-builder" && (!init || !init.method || init.method === "GET")) {
        return Promise.resolve(new Response(JSON.stringify({
          ok: true,
          defaults: {
            request: {
              user_message: "seed",
              current_system_hint: "erp",
            },
          },
          sample_output: {
            planner: {
              intent: "sales_order",
              confidence: "high",
              shouldRouteToErp: true,
            },
          },
        })));
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch;

    render(<Page />);

    await waitFor(() => {
      expect(screen.getByText("ERP Review Workspace")).toBeInTheDocument();
    });
    expect(screen.getByText("Review Queue")).toBeInTheDocument();
    expect(screen.getByText("Review route ready")).toBeInTheDocument();
    expect(screen.getByDisplayValue("erp-session-1")).toBeInTheDocument();
    expect(screen.getByText("ERP Learning Review")).toBeInTheDocument();
  });

  it("submits a message and renders the returned ERP planner", async () => {
    const user = userEvent.setup();

    global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

      if (url === "/api/debug/erp-context-builder" && (!init || !init.method || init.method === "GET")) {
        return Promise.resolve(new Response(JSON.stringify({
          ok: true,
          defaults: {
            request: {
              user_message: "seed",
              current_system_hint: "erp",
            },
          },
          sample_output: {
            planner: {
              intent: "sales_order",
              confidence: "high",
              shouldRouteToErp: true,
            },
          },
        })));
      }

      if (url === "/api/debug/erp-context-builder" && init?.method === "POST") {
        return Promise.resolve(new Response(JSON.stringify({
          ok: true,
          planner: {
            intent: "inventory_status",
            confidence: "high",
            shouldRouteToErp: true,
            matchedKeywords: ["庫存", "可用量"],
            warnings: [],
          },
          pack: {
            read_first: ["skills/erp/SKILL.md"],
            references: ["skills/erp/reference/auto-schema-erp.md"],
          },
        })));
      }

      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch;

    render(<Page />);

    const textarea = await screen.findByLabelText("User message");
    await user.clear(textarea);
    await user.type(textarea, "目前可用庫存最多的前 10 個商品有哪些？");
    await user.click(screen.getByRole("button", { name: "Run Builder" }));

    await waitFor(() => {
      expect(screen.getAllByText(/inventory_status/i).length).toBeGreaterThan(0);
    });
  });

  it("loads the latest ERP planner snapshot from a web session", async () => {
    const user = userEvent.setup();

    global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

      if (url === "/api/debug/erp-context-builder" && (!init || !init.method || init.method === "GET")) {
        return Promise.resolve(new Response(JSON.stringify({
          ok: true,
          defaults: {
            request: {
              user_message: "seed",
              current_system_hint: "erp",
            },
          },
          sample_output: {
            planner: {
              intent: "sales_order",
              confidence: "high",
              shouldRouteToErp: true,
            },
          },
        })));
      }

      if (url === "/api/web-sessions/erp-session-2") {
        return Promise.resolve(new Response(JSON.stringify({
          id: "erp-session-2",
          session: {
            id: "erp-session-2",
            erpPlannerPreflight: {
              system: "erp",
              updatedAt: 1710000000000,
              intent: "sales_order",
              confidence: "high",
              shouldRouteToErp: true,
              matchedKeywords: ["訂單", "出貨"],
              warnings: [],
            },
            erpPlannerContextPack: {
              planner: {
                intent: "sales_order",
                confidence: "high",
                shouldRouteToErp: true,
              },
              read_first: ["skills/erp/SKILL.md"],
              references: ["skills/erp/reference/auto-schema-erp.md"],
              wiki: ["wiki/entities/orders/ERP_SALES_ORDER_SUMMARY_TEMPLATE.md"],
              playbooks: ["wiki/playbooks/erp/ERP_ORDER_FULFILLMENT_PLAYBOOK_TEMPLATE.md"],
              memory_keys: ["known_rule:erp_queries_must_be_read_only"],
              live_query_steps: ["read_real_data"],
              execution_hints: ["Use the OpenClaw Gateway session runtime"],
              presentation: {
                optional_chart_requested: false,
                chart_render_allowed: false,
                chart_guardrail_reason: null,
                max_chart_panels: 0,
              },
            },
          },
          messages: [
            {
              id: "msg-1",
              role: "user",
              content: "請幫我查 OOCHAIN 本月還沒出貨的訂單。",
            },
          ],
        })));
      }

      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch;

    render(<Page />);

    const sessionInput = await screen.findByLabelText("Web session ID");
    await user.clear(sessionInput);
    await user.type(sessionInput, "erp-session-2");
    await user.click(screen.getByRole("button", { name: "Load Session Snapshot" }));

    await waitFor(() => {
      expect(screen.getAllByText(/sales_order/i).length).toBeGreaterThan(0);
    });
    expect(screen.getByText("Latest Session ERP Planner")).toBeInTheDocument();
    expect(screen.getByText("Latest Session ERP Context Pack")).toBeInTheDocument();
  });
});
