// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { usePathname, useSearchParams } from "next/navigation";
import Page from "./page";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/debug/enms-context-builder"),
  useSearchParams: vi.fn(() => new URLSearchParams() as never),
}));

describe("EnMS context builder debug page", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.history.replaceState({}, "", "/debug/enms-context-builder");
    vi.mocked(usePathname).mockReturnValue("/debug/enms-context-builder");
    vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams() as never);
  });

  it("renders sample output from the debug route", async () => {
    global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url === "/api/debug/enms-context-builder" && (!init || !init.method || init.method === "GET")) {
        return Promise.resolve(new Response(JSON.stringify({
          ok: true,
          defaults: {
            request: {
              user_message: "請幫我分析這週最大需量和超約風險。",
              current_system_hint: "enms",
            },
          },
          sample_output: {
            planner: {
              intent: "demand_forecast",
              confidence: "high",
              shouldRouteToEnms: true,
            },
          },
        })));
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch;

    render(<Page />);

    await waitFor(() => {
      expect(screen.getByText("EnMS Context Builder")).toBeInTheDocument();
    });

    expect(screen.getAllByText(/demand_forecast/i).length).toBeGreaterThan(0);
    expect(screen.getByDisplayValue("請幫我分析這週最大需量和超約風險。")).toBeInTheDocument();
  });

  it("renders review-mode heading when opened from the formal review route", async () => {
    vi.mocked(usePathname).mockReturnValue("/review/enms");
    vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams("sessionId=enms-session-1") as never);

    global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url === "/api/debug/enms-context-builder" && (!init || !init.method || init.method === "GET")) {
        return Promise.resolve(new Response(JSON.stringify({
          ok: true,
          defaults: {
            request: {
              user_message: "seed",
              current_system_hint: "enms",
            },
          },
          sample_output: {
            planner: {
              intent: "demand_forecast",
              confidence: "high",
              shouldRouteToEnms: true,
            },
          },
        })));
      }
      if (url === "/api/web-sessions/enms-session-1") {
        return Promise.resolve(new Response(JSON.stringify({
          id: "enms-session-1",
          session: {
            enmsPlannerLearningDraft: {
              session_id: "enms-session-1",
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
      expect(screen.getByText("EnMS Review Workspace")).toBeInTheDocument();
    });
    expect(screen.getByText("Review Queue")).toBeInTheDocument();
    expect(screen.getByText("Review route ready")).toBeInTheDocument();
    expect(screen.getByDisplayValue("enms-session-1")).toBeInTheDocument();
    expect(screen.getByText("EnMS Learning Review")).toBeInTheDocument();
  });

  it("loads the latest EnMS planner snapshot from a web session", async () => {
    const user = userEvent.setup();

    global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

      if (url === "/api/debug/enms-context-builder" && (!init || !init.method || init.method === "GET")) {
        return Promise.resolve(new Response(JSON.stringify({
          ok: true,
          defaults: {
            request: {
              user_message: "seed",
              current_system_hint: "enms",
            },
          },
          sample_output: {
            planner: {
              intent: "demand_forecast",
              confidence: "high",
              shouldRouteToEnms: true,
            },
          },
        })));
      }

      if (url === "/api/web-sessions/enms-session-2") {
        return Promise.resolve(new Response(JSON.stringify({
          id: "enms-session-2",
          session: {
            id: "enms-session-2",
            enmsPlannerPreflight: {
              system: "enms",
              updatedAt: 1710000000000,
              intent: "site_benchmarking",
              confidence: "high",
              shouldRouteToEnms: true,
              matchedKeywords: ["場域", "比較"],
              warnings: [],
            },
            enmsPlannerContextPack: {
              planner: {
                intent: "site_benchmarking",
                confidence: "high",
                shouldRouteToEnms: true,
              },
              read_first: ["skills/enms/SKILL.md"],
              references: ["skills/enms/reference/auto-schema-enms.md"],
              wiki: ["wiki/entities/sites/ENMS_SITE_ENERGY_SUMMARY_TEMPLATE.md"],
              playbooks: ["wiki/playbooks/enms/ENMS_SITE_BENCHMARKING_PLAYBOOK_TEMPLATE.md"],
              memory_keys: ["known_rule:enms_summary_view_before_raw_trace"],
              live_query_steps: ["read_summary_view_first"],
              execution_hints: ["Use the OpenClaw Gateway session runtime"],
              presentation: {
                optional_chart_requested: false,
                chart_render_allowed: false,
                chart_guardrail_reason: null,
                max_chart_panels: 0,
              },
            },
            enmsPlannerLearningDraft: {
              session_id: "enms-session-2",
              status: "ready",
              writeback: { status: "written" },
            },
          },
          messages: [
            {
              id: "msg-1",
              role: "user",
              content: "哪個場域這個月能耗最高？",
            },
          ],
        })));
      }

      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch;

    render(<Page />);

    const sessionInput = await screen.findByLabelText("Web session ID");
    await user.clear(sessionInput);
    await user.type(sessionInput, "enms-session-2");
    await user.click(screen.getByRole("button", { name: "Load Session Snapshot" }));

    await waitFor(() => {
      expect(screen.getAllByText(/site_benchmarking/i).length).toBeGreaterThan(0);
    });
    expect(screen.getByText("Latest Session EnMS Planner")).toBeInTheDocument();
    expect(screen.getByText("Latest Session EnMS Context Pack")).toBeInTheDocument();
    expect(screen.getByText("EnMS Learning Review")).toBeInTheDocument();
  });
});
