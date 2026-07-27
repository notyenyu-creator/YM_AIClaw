// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { usePathname } from "next/navigation";
import Page from "./page";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/debug/ycrm-context-builder"),
}));

describe("Y-CRM context builder debug page", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.history.replaceState({}, "", "/debug/ycrm-context-builder");
    vi.mocked(usePathname).mockReturnValue("/debug/ycrm-context-builder");
  });

  it("renders sample output from the debug route", async () => {
    global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url === "/api/debug/ycrm-context-builder" && (!init || !init.method || init.method === "GET")) {
        return Promise.resolve(new Response(JSON.stringify({
          ok: true,
          defaults: {
            request: {
              user_message: "Y-CRM 的 LINE 自動回覆要怎麼設定？",
              current_system_hint: "ycrm",
            },
          },
          sample_output: {
            decision: {
              intent: "product_help",
              confidence: "high",
              should_route_to_ycrm: true,
            },
          },
        })));
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch;

    render(<Page />);

    await waitFor(() => {
      expect(screen.getByText("Y-CRM Context Builder")).toBeInTheDocument();
    });

    expect(screen.getAllByText(/product_help/i).length).toBeGreaterThan(0);
    expect(screen.getByDisplayValue("Y-CRM 的 LINE 自動回覆要怎麼設定？")).toBeInTheDocument();
  });

  it("renders review-mode heading when opened from the formal review route", async () => {
    vi.mocked(usePathname).mockReturnValue("/review/ycrm");

    global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url === "/api/debug/ycrm-context-builder" && (!init || !init.method || init.method === "GET")) {
        return Promise.resolve(new Response(JSON.stringify({
          ok: true,
          defaults: {
            request: {
              user_message: "seed",
              current_system_hint: "ycrm",
            },
          },
          sample_output: {
            decision: {
              intent: "product_help",
              confidence: "high",
              should_route_to_ycrm: true,
            },
          },
        })));
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch;

    render(<Page />);

    await waitFor(() => {
      expect(screen.getByText("Y-CRM Review Workspace")).toBeInTheDocument();
    });
    expect(screen.getByText("Review Queue")).toBeInTheDocument();
    expect(screen.getByText("Review route ready")).toBeInTheDocument();
  });

  it("submits a message and renders the returned plan", async () => {
    const user = userEvent.setup();
    global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

      if (url === "/api/debug/ycrm-context-builder" && (!init || !init.method || init.method === "GET")) {
        return Promise.resolve(new Response(JSON.stringify({
          ok: true,
          defaults: {
            request: {
              user_message: "seed",
              current_system_hint: "ycrm",
            },
          },
          sample_output: {
            decision: {
              intent: "product_help",
              confidence: "high",
              should_route_to_ycrm: true,
            },
          },
        })));
      }

      if (url === "/api/debug/ycrm-context-builder" && init?.method === "POST") {
        return Promise.resolve(new Response(JSON.stringify({
          ok: true,
          input: {
            request: {
              user_message: "請幫我整理 Y-CRM 工作區裡面的 Calleen Hong 目前負責的客戶背景。",
              current_system_hint: "ycrm",
              requested_workspace: null,
            },
          },
          plan: {
            decision: {
              intent: "entity_summary",
              confidence: "high",
              should_route_to_ycrm: true,
            },
            handoff: {
              cross_system: false,
              target_systems: [],
            },
            notes: {
              warnings: [],
              blockers: [],
            },
          },
        })));
      }

      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch;

    render(<Page />);

    const textarea = await screen.findByLabelText("User message");
    await user.clear(textarea);
    await user.type(textarea, "請幫我整理 Y-CRM 工作區裡面的 Calleen Hong 目前負責的客戶背景。");
    await user.click(screen.getByRole("button", { name: "Run Builder" }));

    await waitFor(() => {
      expect(screen.getAllByText(/entity_summary/i).length).toBeGreaterThan(0);
    });
    expect(screen.getAllByText(/Route: Y-CRM/i).length).toBeGreaterThan(0);
  });

  it("loads the latest planner preflight from a web session", async () => {
    const user = userEvent.setup();
    global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

      if (url === "/api/debug/ycrm-context-builder" && (!init || !init.method || init.method === "GET")) {
        return Promise.resolve(new Response(JSON.stringify({
          ok: true,
          defaults: {
            request: {
              user_message: "seed",
              current_system_hint: "ycrm",
            },
          },
          sample_output: {
            decision: {
              intent: "product_help",
              confidence: "high",
              should_route_to_ycrm: true,
            },
          },
        })));
      }

      if (url === "/api/web-sessions/s-preflight") {
        return Promise.resolve(new Response(JSON.stringify({
          id: "s-preflight",
          session: {
            id: "s-preflight",
            plannerPreflight: {
              system: "ycrm",
              updatedAt: 1710000000000,
              validationState: "heuristic",
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
            plannerContextPack: {
              planner: {
                system: "ycrm",
                updatedAt: 1710000000000,
                validationState: "heuristic",
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
              read_first: [
                "skills/ycrm/SKILL.md",
                "schema/integration-profiles/ycrm.md",
              ],
              references: [],
              wiki: ["wiki/entities/customers/YCRM_CUSTOMER_SUMMARY_TEMPLATE.md"],
              playbooks: [],
              memory_keys: ["known_rule:person_name_is_not_workspace"],
              live_query_steps: ["read_real_data", "read_auto_schema_first", "resolve_workspace_member_fk"],
              execution_hints: ["Read the matching auto-schema reference before writing SQL or assuming field names."],
            },
            plannerLearningDraft: {
              session_id: "s-preflight",
              status: "ready",
              learning_focus: "entity_summary",
              summary: "Stored learning draft summary.",
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
                promoted_files: [],
                promotion_skipped_files: [],
                promotion_conflict_files: [],
              },
              evidence: {
                latest_user_message: "請幫我整理 Y-CRM 工作區裡面的 Calleen Hong 目前負責的客戶背景。",
                latest_assistant_reply: "已整理出該業務目前負責的客戶輪廓與下一步。",
                live_query_steps: ["read_real_data", "resolve_workspace_member_fk"],
              },
              drafts: {
                wiki: [],
                playbooks: [],
                memory: [
                  {
                    key: "known_rule:person_name_requires_workspace_member_fk",
                    value: "Resolve workspaceMember first.",
                    reason: "This session used person-name lookup.",
                  },
                ],
              },
              history: [
                {
                  at: 1710000000000,
                  event: "draft_generated",
                  tone: "neutral",
                  summary: "Generated a Y-CRM learning draft.",
                  files: [],
                },
              ],
            },
          },
          messages: [],
        })));
      }

      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch;

    render(<Page />);

    const sessionInput = await screen.findByLabelText("Web session ID");
    await user.type(sessionInput, "s-preflight");
    await user.click(screen.getByRole("button", { name: "Load Session Preflight" }));

    await waitFor(() => {
      expect(screen.getAllByText(/entity_summary/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/workspace_3jox/i).length).toBeGreaterThan(0);
      expect(screen.getByText("Advisory planner state")).toBeInTheDocument();
    });
    expect(screen.getByDisplayValue("s-preflight")).toBeInTheDocument();
    expect(screen.getByText("heuristic")).toBeInTheDocument();
    expect(screen.getByText("Latest Session Context Pack")).toBeInTheDocument();
    expect(screen.getByText("Latest Session Learning Draft")).toBeInTheDocument();
    expect(screen.getAllByText(/resolve_workspace_member_fk/i).length).toBeGreaterThan(0);
  });

  it("auto-loads a session snapshot when sessionId is provided in the URL", async () => {
    const user = userEvent.setup();
    window.history.replaceState({}, "", "/debug/ycrm-context-builder?sessionId=s-autoload");

    global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

      if (url === "/api/debug/ycrm-context-builder" && (!init || !init.method || init.method === "GET")) {
        return Promise.resolve(new Response(JSON.stringify({
          ok: true,
          defaults: {
            request: {
              user_message: "seed",
              current_system_hint: "ycrm",
            },
          },
          sample_output: {
            decision: {
              intent: "product_help",
              confidence: "high",
              should_route_to_ycrm: true,
            },
          },
        })));
      }

      if (url === "/api/web-sessions/s-autoload") {
        return Promise.resolve(new Response(JSON.stringify({
          id: "s-autoload",
          session: {
            id: "s-autoload",
            plannerPreflight: {
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
          },
          messages: [],
        })));
      }

      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch;

    render(<Page />);

    expect(
      await screen.findByText("Loaded session snapshot from persisted metadata."),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue("s-autoload")).toBeInTheDocument();
    await user.clear(screen.getByLabelText("Web session ID"));
  });

  it("generates a Y-CRM learning draft from a loaded session", async () => {
    const user = userEvent.setup();
    const learningBodies: string[] = [];
    const writebackBodies: string[] = [];
    const resolutionBodies: string[] = [];
    const promotionBodies: string[] = [];
    let sessionLoadCount = 0;
    global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

      if (url === "/api/debug/ycrm-context-builder" && (!init || !init.method || init.method === "GET")) {
        return Promise.resolve(new Response(JSON.stringify({
          ok: true,
          defaults: {
            request: {
              user_message: "seed",
              current_system_hint: "ycrm",
            },
          },
          sample_output: {
            decision: {
              intent: "product_help",
              confidence: "high",
              should_route_to_ycrm: true,
            },
          },
        })));
      }

      if (url === "/api/web-sessions/s-learning") {
        sessionLoadCount += 1;
        const persistedDraft = sessionLoadCount > 1 ? {
          session_id: "s-learning",
          status: "ready",
          learning_focus: "entity_summary",
          summary: "Generated a first-pass Y-CRM learning draft.",
          meta: {
            generated_at: 1710000000000,
            generation_mode: "minimal_evidence",
            token_guardrails: ["single_session_single_draft", "manual_trigger_only"],
            cached: true,
            source: "session_cache",
          },
          writeback: {
            status: "resolution_kept_current",
            updated_at: 1710000002500,
            files: ["wiki/entities/customers/sample-customer-summary.md"],
            skipped_files: [],
            promoted_files: [],
            promotion_skipped_files: [],
            promotion_conflict_files: ["wiki/entities/customers/sample-customer-summary.md"],
            approved_at: 1710000002000,
            approved_via: "manual_promotion",
            resolution_action: "keep_current_page",
            resolved_at: 1710000002500,
            review_reason: "Keep curated page for now",
            reviewer_note: "Reviewed the compare view and decided not to overwrite.",
            reviewer_actor: "YM",
          },
          evidence: {
            latest_user_message: "請幫我整理 Y-CRM 工作區裡面的 Calleen Hong 目前負責的客戶背景。",
            latest_assistant_reply: "已整理出該業務目前負責的客戶輪廓與下一步。",
            live_query_steps: ["read_real_data", "resolve_workspace_member_fk"],
          },
          drafts: {
            wiki: [
              {
                kind: "customer_summary",
                suggested_path: "wiki/entities/customers/sample-customer-summary.md",
                title: "Customer Summary Draft",
                reason: "Reusable customer summary.",
                outline: ["客戶背景", "商機狀態", "下一步"],
              },
            ],
            playbooks: [],
            memory: [
              {
                key: "known_rule:person_name_requires_workspace_member_fk",
                value: "Resolve workspaceMember first.",
                reason: "This session used person-name lookup.",
              },
            ],
          },
          history: [
            {
              at: 1710000000000,
              event: "draft_generated",
              tone: "neutral",
              summary: "Generated a Y-CRM learning draft.",
              files: [],
              reviewer_actor: null,
            },
            {
              at: 1710000001000,
              event: "wiki_draft_written",
              tone: "success",
              summary: "Wrote 1 wiki draft file for review.",
              files: ["wiki/entities/customers/sample-customer-summary.md"],
              reviewer_actor: null,
            },
            {
              at: 1710000002000,
              event: "promotion_conflicted",
              tone: "warning",
              summary: "Promotion paused because 1 wiki page conflict needs review.",
              files: ["wiki/entities/customers/sample-customer-summary.md"],
              reviewer_actor: "YM",
            },
            {
              at: 1710000002500,
              event: "resolution_kept_current",
              tone: "warning",
              summary: "Kept the current wiki page and recorded the draft as reviewed without overwriting content.",
              files: ["wiki/entities/customers/sample-customer-summary.md"],
              review_reason: "Keep curated page for now",
              reviewer_note: "Reviewed the compare view and decided not to overwrite.",
              reviewer_actor: "YM",
            },
          ],
        } : undefined;
        return Promise.resolve(new Response(JSON.stringify({
          id: "s-learning",
          session: {
            id: "s-learning",
            plannerPreflight: {
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
            plannerContextPack: {
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
              read_first: ["skills/ycrm/SKILL.md"],
              references: [],
              wiki: ["wiki/entities/customers/YCRM_CUSTOMER_SUMMARY_TEMPLATE.md"],
              playbooks: [],
              memory_keys: ["known_rule:person_name_is_not_workspace"],
              live_query_steps: ["read_real_data", "read_auto_schema_first", "resolve_workspace_member_fk"],
              execution_hints: ["Resolve workspaceMember IDs before owner lookups."],
            },
            ...(persistedDraft ? { plannerLearningDraft: persistedDraft } : {}),
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
        })));
      }

      if (url === "/api/debug/ycrm-learning-draft" && init?.method === "POST") {
        learningBodies.push(String(init.body ?? ""));
        return Promise.resolve(new Response(JSON.stringify({
          ok: true,
          draft: {
            status: "ready",
            learning_focus: "entity_summary",
            summary: "Generated a first-pass Y-CRM learning draft.",
            meta: {
              generated_at: 1710000000000,
              generation_mode: "minimal_evidence",
              token_guardrails: ["single_session_single_draft", "manual_trigger_only"],
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
              review_reason: null,
              reviewer_note: null,
              reviewer_actor: null,
            },
            evidence: {
              latest_user_message: "請幫我整理 Y-CRM 工作區裡面的 Calleen Hong 目前負責的客戶背景。",
              latest_assistant_reply: "已整理出該業務目前負責的客戶輪廓與下一步。",
              live_query_steps: ["read_real_data", "resolve_workspace_member_fk"],
            },
            drafts: {
              wiki: [
                {
                  kind: "customer_summary",
                  suggested_path: "wiki/entities/customers/sample-customer-summary.md",
                  title: "Customer Summary Draft",
                  reason: "Reusable customer summary.",
                  outline: ["客戶背景", "商機狀態", "下一步"],
                },
              ],
              playbooks: [],
              memory: [
                {
                  key: "known_rule:person_name_requires_workspace_member_fk",
                  value: "Resolve workspaceMember first.",
                  reason: "This session used person-name lookup.",
                },
              ],
            },
            history: [
                {
                  at: 1710000000000,
                  event: "draft_generated",
                  tone: "neutral",
                  summary: "Generated a Y-CRM learning draft.",
                  files: [],
                  reviewer_actor: null,
                },
              ],
          },
        })));
      }

      if (url === "/api/debug/ycrm-learning-draft/writeback" && init?.method === "POST") {
        writebackBodies.push(String(init.body ?? ""));
        return Promise.resolve(new Response(JSON.stringify({
          ok: true,
          draft: {
            status: "ready",
            learning_focus: "entity_summary",
            summary: "Generated a first-pass Y-CRM learning draft.",
            meta: {
              generated_at: 1710000000000,
              generation_mode: "minimal_evidence",
              token_guardrails: ["single_session_single_draft", "manual_trigger_only"],
              cached: true,
              source: "session_cache",
            },
            writeback: {
              status: "written",
              updated_at: 1710000001000,
              files: ["wiki/entities/customers/sample-customer-summary.md"],
              skipped_files: [],
              promoted_files: [],
              promotion_skipped_files: [],
              promotion_conflict_files: [],
              review_reason: null,
              reviewer_note: null,
              reviewer_actor: null,
            },
            evidence: {
              latest_user_message: "請幫我整理 Y-CRM 工作區裡面的 Calleen Hong 目前負責的客戶背景。",
              latest_assistant_reply: "已整理出該業務目前負責的客戶輪廓與下一步。",
              live_query_steps: ["read_real_data", "resolve_workspace_member_fk"],
            },
            drafts: {
              wiki: [
                {
                  kind: "customer_summary",
                  suggested_path: "wiki/entities/customers/sample-customer-summary.md",
                  title: "Customer Summary Draft",
                  reason: "Reusable customer summary.",
                  outline: ["客戶背景", "商機狀態", "下一步"],
                },
              ],
              playbooks: [],
              memory: [
                {
                  key: "known_rule:person_name_requires_workspace_member_fk",
                  value: "Resolve workspaceMember first.",
                  reason: "This session used person-name lookup.",
                },
              ],
            },
            history: [
              {
                at: 1710000000000,
                event: "draft_generated",
                tone: "neutral",
                summary: "Generated a Y-CRM learning draft.",
                files: [],
                reviewer_actor: null,
              },
              {
                at: 1710000001000,
                event: "wiki_draft_written",
                tone: "success",
                summary: "Wrote 1 wiki draft file for review.",
                files: ["wiki/entities/customers/sample-customer-summary.md"],
                reviewer_actor: null,
              },
            ],
          },
        })));
      }

      if (url === "/api/debug/ycrm-learning-draft/promote" && init?.method === "POST") {
        promotionBodies.push(String(init.body ?? ""));
        const body = JSON.parse(String(init.body ?? "{}"));
        if (body.force_conflict_override === true) {
          return Promise.resolve(new Response(JSON.stringify({
            ok: true,
            promotion: {
              promoted_files: ["wiki/entities/customers/sample-customer-summary.md"],
              skipped_files: [],
              conflict_files: [],
              conflict_details: [],
              updated_supporting_files: [
                "wiki/index.md",
                "wiki/log.md",
                "wiki/entities/customers/sample-customer-summary.md",
              ],
            },
            draft: {
              status: "ready",
              learning_focus: "entity_summary",
              summary: "Generated a first-pass Y-CRM learning draft.",
              meta: {
                generated_at: 1710000000000,
                generation_mode: "minimal_evidence",
                token_guardrails: ["single_session_single_draft", "manual_trigger_only"],
                cached: true,
                source: "session_cache",
              },
              writeback: {
                status: "promoted",
                updated_at: 1710000003000,
                files: ["wiki/entities/customers/sample-customer-summary.md"],
                skipped_files: [],
                promoted_files: ["wiki/entities/customers/sample-customer-summary.md"],
                promotion_skipped_files: [],
                promotion_conflict_files: [],
                approved_at: 1710000003000,
                approved_via: "manual_force_promotion",
                resolution_action: "force_promote_override",
                resolved_at: 1710000003000,
                review_reason: "Override after comparing both versions",
                reviewer_note: "The generated draft is newer and should replace the stale page.",
                reviewer_actor: "YM",
              },
              evidence: {
                latest_user_message: "請幫我整理 Y-CRM 工作區裡面的 Calleen Hong 目前負責的客戶背景。",
                latest_assistant_reply: "已整理出該業務目前負責的客戶輪廓與下一步。",
                live_query_steps: ["read_real_data", "resolve_workspace_member_fk"],
              },
              drafts: {
                wiki: [
                  {
                    kind: "customer_summary",
                    suggested_path: "wiki/entities/customers/sample-customer-summary.md",
                    title: "Customer Summary Draft",
                    reason: "Reusable customer summary.",
                    outline: ["客戶背景", "商機狀態", "下一步"],
                  },
                ],
                playbooks: [],
                memory: [
                  {
                    key: "known_rule:person_name_requires_workspace_member_fk",
                    value: "Resolve workspaceMember first.",
                    reason: "This session used person-name lookup.",
                  },
                ],
              },
              history: [
                {
                  at: 1710000000000,
                  event: "draft_generated",
                  tone: "neutral",
                  summary: "Generated a Y-CRM learning draft.",
                  files: [],
                },
                {
                  at: 1710000001000,
                  event: "wiki_draft_written",
                  tone: "success",
                  summary: "Wrote 1 wiki draft file for review.",
                  files: ["wiki/entities/customers/sample-customer-summary.md"],
                },
                {
                  at: 1710000003000,
                  event: "promotion_succeeded",
                  tone: "success",
                  summary: "Force-promoted 1 wiki draft file after manual override.",
                  files: ["wiki/entities/customers/sample-customer-summary.md"],
                  review_reason: "Override after comparing both versions",
                  reviewer_note: "The generated draft is newer and should replace the stale page.",
                  reviewer_actor: "YM",
                },
              ],
            },
          })));
        }

        return Promise.resolve(new Response(JSON.stringify({
          ok: true,
          promotion: {
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
                proposed_outline: ["客戶背景", "商機狀態", "下一步"],
              },
            ],
            updated_supporting_files: [
              "wiki/index.md",
              "wiki/log.md",
              "wiki/entities/customers/sample-customer-summary.md",
            ],
          },
          draft: {
            status: "ready",
            learning_focus: "entity_summary",
            summary: "Generated a first-pass Y-CRM learning draft.",
            meta: {
              generated_at: 1710000000000,
              generation_mode: "minimal_evidence",
              token_guardrails: ["single_session_single_draft", "manual_trigger_only"],
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
                approved_at: 1710000002000,
                approved_via: "manual_promotion",
                review_reason: "Need human review before replacing curated page",
                reviewer_note: "This page looks manually maintained.",
                reviewer_actor: "YM",
              },
            evidence: {
              latest_user_message: "請幫我整理 Y-CRM 工作區裡面的 Calleen Hong 目前負責的客戶背景。",
              latest_assistant_reply: "已整理出該業務目前負責的客戶輪廓與下一步。",
              live_query_steps: ["read_real_data", "resolve_workspace_member_fk"],
            },
            drafts: {
              wiki: [
                {
                  kind: "customer_summary",
                  suggested_path: "wiki/entities/customers/sample-customer-summary.md",
                  title: "Customer Summary Draft",
                  reason: "Reusable customer summary.",
                  outline: ["客戶背景", "商機狀態", "下一步"],
                },
              ],
              playbooks: [],
              memory: [
                {
                  key: "known_rule:person_name_requires_workspace_member_fk",
                  value: "Resolve workspaceMember first.",
                  reason: "This session used person-name lookup.",
                },
              ],
            },
            history: [
              {
                at: 1710000000000,
                event: "draft_generated",
                tone: "neutral",
                summary: "Generated a Y-CRM learning draft.",
                files: [],
                reviewer_actor: null,
              },
              {
                at: 1710000001000,
                event: "wiki_draft_written",
                tone: "success",
                summary: "Wrote 1 wiki draft file for review.",
                files: ["wiki/entities/customers/sample-customer-summary.md"],
                reviewer_actor: null,
              },
                {
                  at: 1710000002000,
                  event: "promotion_conflicted",
                  tone: "warning",
                  summary: "Promotion paused because 1 wiki page conflict needs review.",
                  files: ["wiki/entities/customers/sample-customer-summary.md"],
                  review_reason: "Need human review before replacing curated page",
                  reviewer_note: "This page looks manually maintained.",
                  reviewer_actor: "YM",
                },
              ],
            },
        })));
      }

      if (url === "/api/debug/ycrm-learning-draft/resolve" && init?.method === "POST") {
        resolutionBodies.push(String(init.body ?? ""));
        return Promise.resolve(new Response(JSON.stringify({
          ok: true,
          resolution_action: "keep_current_page",
          draft: {
            status: "ready",
            learning_focus: "entity_summary",
            summary: "Generated a first-pass Y-CRM learning draft.",
            meta: {
              generated_at: 1710000000000,
              generation_mode: "minimal_evidence",
              token_guardrails: ["single_session_single_draft", "manual_trigger_only"],
              cached: true,
              source: "session_cache",
            },
            writeback: {
              status: "resolution_kept_current",
              updated_at: 1710000002500,
              files: ["wiki/entities/customers/sample-customer-summary.md"],
              skipped_files: [],
              promoted_files: [],
              promotion_skipped_files: [],
              promotion_conflict_files: ["wiki/entities/customers/sample-customer-summary.md"],
              approved_at: 1710000002000,
              approved_via: "manual_promotion",
              resolution_action: "keep_current_page",
              resolved_at: 1710000002500,
              review_reason: "Keep curated page for now",
              reviewer_note: "Reviewed the compare view and decided not to overwrite.",
              reviewer_actor: "YM",
            },
            evidence: {
              latest_user_message: "請幫我整理 Y-CRM 工作區裡面的 Calleen Hong 目前負責的客戶背景。",
              latest_assistant_reply: "已整理出該業務目前負責的客戶輪廓與下一步。",
              live_query_steps: ["read_real_data", "resolve_workspace_member_fk"],
            },
            drafts: {
              wiki: [
                {
                  kind: "customer_summary",
                  suggested_path: "wiki/entities/customers/sample-customer-summary.md",
                  title: "Customer Summary Draft",
                  reason: "Reusable customer summary.",
                  outline: ["客戶背景", "商機狀態", "下一步"],
                },
              ],
              playbooks: [],
              memory: [
                {
                  key: "known_rule:person_name_requires_workspace_member_fk",
                  value: "Resolve workspaceMember first.",
                  reason: "This session used person-name lookup.",
                },
              ],
            },
            history: [
              {
                at: 1710000000000,
                event: "draft_generated",
                tone: "neutral",
                summary: "Generated a Y-CRM learning draft.",
                files: [],
                reviewer_actor: null,
              },
              {
                at: 1710000001000,
                event: "wiki_draft_written",
                tone: "success",
                summary: "Wrote 1 wiki draft file for review.",
                files: ["wiki/entities/customers/sample-customer-summary.md"],
                reviewer_actor: null,
              },
              {
                at: 1710000002000,
                event: "promotion_conflicted",
                tone: "warning",
                summary: "Promotion paused because 1 wiki page conflict needs review.",
                files: ["wiki/entities/customers/sample-customer-summary.md"],
                reviewer_actor: "YM",
              },
              {
                at: 1710000002500,
                event: "resolution_kept_current",
                tone: "warning",
                summary: "Kept the current wiki page and recorded the draft as reviewed without overwriting content.",
                files: ["wiki/entities/customers/sample-customer-summary.md"],
                review_reason: "Keep curated page for now",
                reviewer_note: "Reviewed the compare view and decided not to overwrite.",
                reviewer_actor: "YM",
              },
            ],
          },
        })));
      }

      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch;

    render(<Page />);

    const sessionInput = await screen.findByLabelText("Web session ID");
    await user.type(sessionInput, "s-learning");
    await user.click(screen.getByRole("button", { name: "Load Session Preflight" }));

    await waitFor(() => {
      expect(screen.getByText("Latest Session Context Pack")).toBeInTheDocument();
    });

    await user.click(screen.getByLabelText("Force regenerate learning draft"));
    await user.type(screen.getByLabelText("Reviewer identity"), "YM");
    await user.type(screen.getByLabelText("Review reason"), "Keep curated page for now");
    await user.type(screen.getByLabelText("Reviewer note"), "Reviewed the compare view and decided not to overwrite.");
    await user.click(screen.getByRole("button", { name: "Generate Learning Draft" }));

    await waitFor(() => {
      expect(screen.getByText("Latest Session Learning Draft")).toBeInTheDocument();
    });
    expect(screen.getAllByText(/entity_summary/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Resolve workspaceMember first/i).length).toBeGreaterThan(0);
    expect(screen.getByText("Fresh draft")).toBeInTheDocument();
    expect(screen.getByText(/guardrail:single_session_single_draft/i)).toBeInTheDocument();
    expect(screen.getByText("Learning Timeline")).toBeInTheDocument();
    expect(screen.getByText("draft_generated")).toBeInTheDocument();
    expect(screen.getByText("Review state: pending")).toBeInTheDocument();
    expect(learningBodies.some((body) => body.includes("\"force_regenerate\":true"))).toBe(true);

    await user.click(screen.getByLabelText("Overwrite existing wiki draft files"));
    await user.click(screen.getByRole("button", { name: "Write Wiki Draft Files" }));

    await waitFor(() => {
      expect(screen.getByText("Writeback:written")).toBeInTheDocument();
    });
    expect(screen.getByText("Written Wiki Draft Files")).toBeInTheDocument();
    expect(screen.getAllByText("wiki/entities/customers/sample-customer-summary.md").length).toBeGreaterThan(0);
    expect(writebackBodies.some((body) => body.includes("\"overwrite\":true"))).toBe(true);

    await user.click(screen.getByRole("button", { name: "Promote Wiki Draft Files" }));

    await waitFor(() => {
      expect(screen.getByText("Writeback:promotion_conflicted")).toBeInTheDocument();
    });
    expect(screen.getAllByText("Promotion Conflicts").length).toBeGreaterThan(0);
    expect(screen.getByText("Promotion safety check")).toBeInTheDocument();
    expect(screen.getByText("Conflict Compare View")).toBeInTheDocument();
    expect(screen.getByText("Current Page")).toBeInTheDocument();
    expect(screen.getByText("Proposed From This Draft")).toBeInTheDocument();
    expect(screen.getByText("Manually Curated Customer Page")).toBeInTheDocument();
    expect(screen.getAllByText("Customer Summary Draft").length).toBeGreaterThan(0);
    expect(screen.getByText("manual_promotion")).toBeInTheDocument();
    expect(screen.getByText("Promotion is paused for manual review")).toBeInTheDocument();
    expect(screen.getAllByText("Need human review before replacing curated page").length).toBeGreaterThan(0);
    expect(screen.getByText("Review state: conflict")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show conflicts only" }));
    expect(screen.queryByText("draft_generated")).not.toBeInTheDocument();
    expect(screen.getByText("promotion_conflicted")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Keep Current Page" }));

    await waitFor(() => {
      expect(screen.getByText("Writeback:resolution_kept_current")).toBeInTheDocument();
    });
    expect(screen.getByText("keep_current_page")).toBeInTheDocument();
    expect(screen.getByText("resolution_kept_current")).toBeInTheDocument();
    expect(screen.getByText("Current wiki page was kept")).toBeInTheDocument();
    expect(screen.getByText("Review state: reviewed")).toBeInTheDocument();
    expect(screen.getByText("Review Context")).toBeInTheDocument();
    expect(screen.getAllByText("YM").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Keep curated page for now").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Reviewed the compare view and decided not to overwrite.").length).toBeGreaterThan(0);
    expect(writebackBodies.some((body) => body.includes("\"overwrite\":true"))).toBe(true);
    expect(promotionBodies.some((body) => body.includes("\"review_reason\":\"Keep curated page for now\""))).toBe(true);
    expect(resolutionBodies.some((body) => body.includes("\"reviewer_note\":\"Reviewed the compare view and decided not to overwrite.\""))).toBe(true);
    expect(resolutionBodies.some((body) => body.includes("\"reviewer_actor\":\"YM\""))).toBe(true);

    await user.click(screen.getByRole("button", { name: "Reload Session Snapshot" }));

    await waitFor(() => {
      expect(screen.getByText("Reloaded session snapshot from persisted metadata.")).toBeInTheDocument();
    });
    expect(screen.getByText("Review state: reviewed")).toBeInTheDocument();
    expect(screen.getAllByText("Keep curated page for now").length).toBeGreaterThan(0);
  });

  it("force promotes a conflicted draft and preserves the promoted state after reload", async () => {
    const user = userEvent.setup();
    const promotionBodies: string[] = [];
    let sessionLoadCount = 0;

    global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

      if (url === "/api/debug/ycrm-context-builder" && (!init || !init.method || init.method === "GET")) {
        return Promise.resolve(new Response(JSON.stringify({
          ok: true,
          defaults: {
            request: {
              user_message: "seed",
              current_system_hint: "ycrm",
            },
          },
          sample_output: {
            decision: {
              intent: "product_help",
              confidence: "high",
              should_route_to_ycrm: true,
            },
          },
        })));
      }

      if (url === "/api/web-sessions/s-force") {
        sessionLoadCount += 1;
        const persistedDraft = sessionLoadCount > 1
          ? {
              session_id: "s-force",
              status: "ready",
              learning_focus: "entity_summary",
              summary: "Generated a first-pass Y-CRM learning draft.",
              meta: {
                generated_at: 1710000000000,
                generation_mode: "minimal_evidence",
                token_guardrails: ["single_session_single_draft", "manual_trigger_only"],
                cached: true,
                source: "session_cache",
              },
              writeback: {
                status: "promoted",
                updated_at: 1710000003000,
                files: ["wiki/entities/customers/sample-customer-summary.md"],
                skipped_files: [],
                promoted_files: ["wiki/entities/customers/sample-customer-summary.md"],
                promotion_skipped_files: [],
                promotion_conflict_files: [],
                approved_at: 1710000003000,
                approved_via: "manual_force_promotion",
                resolution_action: "force_promote_override",
                resolved_at: 1710000003000,
                review_reason: "Override after comparing both versions",
                reviewer_note: "The generated draft is newer and should replace the stale page.",
                reviewer_actor: "YM",
              },
              evidence: {
                latest_user_message: "請幫我整理 Y-CRM 工作區裡面的 Calleen Hong 目前負責的客戶背景。",
                latest_assistant_reply: "已整理出該業務目前負責的客戶輪廓與下一步。",
                live_query_steps: ["read_real_data", "resolve_workspace_member_fk"],
              },
              drafts: {
                wiki: [
                  {
                    kind: "customer_summary",
                    suggested_path: "wiki/entities/customers/sample-customer-summary.md",
                    title: "Customer Summary Draft",
                    reason: "Reusable customer summary.",
                    outline: ["客戶背景", "商機狀態", "下一步"],
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
                  summary: "Generated a Y-CRM learning draft.",
                  files: [],
                  reviewer_actor: null,
                },
                {
                  at: 1710000001000,
                  event: "wiki_draft_written",
                  tone: "success",
                  summary: "Wrote 1 wiki draft file for review.",
                  files: ["wiki/entities/customers/sample-customer-summary.md"],
                  reviewer_actor: null,
                },
                {
                  at: 1710000002000,
                  event: "promotion_conflicted",
                  tone: "warning",
                  summary: "Promotion paused because 1 wiki page conflict needs review.",
                  files: ["wiki/entities/customers/sample-customer-summary.md"],
                  reviewer_actor: "YM",
                },
                {
                  at: 1710000003000,
                  event: "promotion_succeeded",
                  tone: "success",
                  summary: "Force-promoted 1 wiki draft file after manual override.",
                  files: ["wiki/entities/customers/sample-customer-summary.md"],
                  review_reason: "Override after comparing both versions",
                  reviewer_note: "The generated draft is newer and should replace the stale page.",
                  reviewer_actor: "YM",
                },
              ],
            }
          : undefined;

        return Promise.resolve(new Response(JSON.stringify({
          id: "s-force",
          session: {
            id: "s-force",
            plannerPreflight: {
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
            plannerContextPack: {
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
              read_first: ["skills/ycrm/SKILL.md"],
              references: [],
              wiki: ["wiki/entities/customers/YCRM_CUSTOMER_SUMMARY_TEMPLATE.md"],
              playbooks: [],
              memory_keys: ["known_rule:person_name_is_not_workspace"],
              live_query_steps: ["read_real_data", "read_auto_schema_first", "resolve_workspace_member_fk"],
              execution_hints: ["Resolve workspaceMember IDs before owner lookups."],
            },
            ...(persistedDraft ? { plannerLearningDraft: persistedDraft } : {}),
          },
          messages: [
            { id: "m1", role: "user", content: "請幫我整理 Y-CRM 工作區裡面的 Calleen Hong 目前負責的客戶背景。" },
            { id: "m2", role: "assistant", content: "已整理出該業務目前負責的客戶輪廓與下一步。" },
          ],
        })));
      }

      if (url === "/api/debug/ycrm-learning-draft" && init?.method === "POST") {
        return Promise.resolve(new Response(JSON.stringify({
          ok: true,
          draft: {
            status: "ready",
            learning_focus: "entity_summary",
            summary: "Generated a first-pass Y-CRM learning draft.",
            meta: {
              generated_at: 1710000000000,
              generation_mode: "minimal_evidence",
              token_guardrails: ["single_session_single_draft", "manual_trigger_only"],
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
              review_reason: null,
              reviewer_note: null,
              reviewer_actor: null,
            },
            evidence: {
              latest_user_message: "請幫我整理 Y-CRM 工作區裡面的 Calleen Hong 目前負責的客戶背景。",
              latest_assistant_reply: "已整理出該業務目前負責的客戶輪廓與下一步。",
              live_query_steps: ["read_real_data", "resolve_workspace_member_fk"],
            },
            drafts: {
              wiki: [
                {
                  kind: "customer_summary",
                  suggested_path: "wiki/entities/customers/sample-customer-summary.md",
                  title: "Customer Summary Draft",
                  reason: "Reusable customer summary.",
                  outline: ["客戶背景", "商機狀態", "下一步"],
                },
              ],
              playbooks: [],
              memory: [],
            },
            history: [],
          },
        })));
      }

      if (url === "/api/debug/ycrm-learning-draft/writeback" && init?.method === "POST") {
        return Promise.resolve(new Response(JSON.stringify({
          ok: true,
          draft: {
            status: "ready",
            learning_focus: "entity_summary",
            summary: "Generated a first-pass Y-CRM learning draft.",
            meta: {
              generated_at: 1710000000000,
              generation_mode: "minimal_evidence",
              token_guardrails: ["single_session_single_draft", "manual_trigger_only"],
              cached: true,
              source: "session_cache",
            },
            writeback: {
              status: "written",
              updated_at: 1710000001000,
              files: ["wiki/entities/customers/sample-customer-summary.md"],
              skipped_files: [],
              promoted_files: [],
              promotion_skipped_files: [],
              promotion_conflict_files: [],
              review_reason: null,
              reviewer_note: null,
              reviewer_actor: null,
            },
            evidence: {
              latest_user_message: "請幫我整理 Y-CRM 工作區裡面的 Calleen Hong 目前負責的客戶背景。",
              latest_assistant_reply: "已整理出該業務目前負責的客戶輪廓與下一步。",
              live_query_steps: ["read_real_data", "resolve_workspace_member_fk"],
            },
            drafts: {
              wiki: [
                {
                  kind: "customer_summary",
                  suggested_path: "wiki/entities/customers/sample-customer-summary.md",
                  title: "Customer Summary Draft",
                  reason: "Reusable customer summary.",
                  outline: ["客戶背景", "商機狀態", "下一步"],
                },
              ],
              playbooks: [],
              memory: [],
            },
            history: [],
          },
        })));
      }

      if (url === "/api/debug/ycrm-learning-draft/promote" && init?.method === "POST") {
        promotionBodies.push(String(init.body ?? ""));
        const body = JSON.parse(String(init.body ?? "{}"));

        if (body.force_conflict_override === true) {
          return Promise.resolve(new Response(JSON.stringify({
            ok: true,
            promotion: {
              promoted_files: ["wiki/entities/customers/sample-customer-summary.md"],
              skipped_files: [],
              conflict_files: [],
              conflict_details: [],
              updated_supporting_files: [
                "wiki/index.md",
                "wiki/log.md",
                "wiki/entities/customers/sample-customer-summary.md",
              ],
            },
            draft: {
              status: "ready",
              learning_focus: "entity_summary",
              summary: "Generated a first-pass Y-CRM learning draft.",
              meta: {
                generated_at: 1710000000000,
                generation_mode: "minimal_evidence",
                token_guardrails: ["single_session_single_draft", "manual_trigger_only"],
                cached: true,
                source: "session_cache",
              },
              writeback: {
                status: "promoted",
                updated_at: 1710000003000,
                files: ["wiki/entities/customers/sample-customer-summary.md"],
                skipped_files: [],
                promoted_files: ["wiki/entities/customers/sample-customer-summary.md"],
                promotion_skipped_files: [],
                promotion_conflict_files: [],
                approved_at: 1710000003000,
                approved_via: "manual_force_promotion",
                resolution_action: "force_promote_override",
                resolved_at: 1710000003000,
                review_reason: "Override after comparing both versions",
                reviewer_note: "The generated draft is newer and should replace the stale page.",
                reviewer_actor: "YM",
              },
              evidence: {
                latest_user_message: "請幫我整理 Y-CRM 工作區裡面的 Calleen Hong 目前負責的客戶背景。",
                latest_assistant_reply: "已整理出該業務目前負責的客戶輪廓與下一步。",
                live_query_steps: ["read_real_data", "resolve_workspace_member_fk"],
              },
              drafts: {
                wiki: [
                  {
                    kind: "customer_summary",
                    suggested_path: "wiki/entities/customers/sample-customer-summary.md",
                    title: "Customer Summary Draft",
                    reason: "Reusable customer summary.",
                    outline: ["客戶背景", "商機狀態", "下一步"],
                  },
                ],
                playbooks: [],
                memory: [],
              },
              history: [
                {
                  at: 1710000003000,
                  event: "promotion_succeeded",
                  tone: "success",
                  summary: "Force-promoted 1 wiki draft file after manual override.",
                  files: ["wiki/entities/customers/sample-customer-summary.md"],
                  review_reason: "Override after comparing both versions",
                  reviewer_note: "The generated draft is newer and should replace the stale page.",
                  reviewer_actor: "YM",
                },
              ],
            },
          })));
        }

        return Promise.resolve(new Response(JSON.stringify({
          ok: true,
          promotion: {
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
                proposed_outline: ["客戶背景", "商機狀態", "下一步"],
              },
            ],
            updated_supporting_files: [
              "wiki/index.md",
              "wiki/log.md",
              "wiki/entities/customers/sample-customer-summary.md",
            ],
          },
          draft: {
            status: "ready",
            learning_focus: "entity_summary",
            summary: "Generated a first-pass Y-CRM learning draft.",
            meta: {
              generated_at: 1710000000000,
              generation_mode: "minimal_evidence",
              token_guardrails: ["single_session_single_draft", "manual_trigger_only"],
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
              approved_at: 1710000002000,
              approved_via: "manual_promotion",
              review_reason: "Need human review before replacing curated page",
              reviewer_note: "This page looks manually maintained.",
              reviewer_actor: "YM",
            },
            evidence: {
              latest_user_message: "請幫我整理 Y-CRM 工作區裡面的 Calleen Hong 目前負責的客戶背景。",
              latest_assistant_reply: "已整理出該業務目前負責的客戶輪廓與下一步。",
              live_query_steps: ["read_real_data", "resolve_workspace_member_fk"],
            },
            drafts: {
              wiki: [
                {
                  kind: "customer_summary",
                  suggested_path: "wiki/entities/customers/sample-customer-summary.md",
                  title: "Customer Summary Draft",
                  reason: "Reusable customer summary.",
                  outline: ["客戶背景", "商機狀態", "下一步"],
                },
              ],
              playbooks: [],
              memory: [],
            },
            history: [
              {
                at: 1710000002000,
                event: "promotion_conflicted",
                tone: "warning",
                summary: "Promotion paused because 1 wiki page conflict needs review.",
                files: ["wiki/entities/customers/sample-customer-summary.md"],
                review_reason: "Need human review before replacing curated page",
                reviewer_note: "This page looks manually maintained.",
                reviewer_actor: "YM",
              },
            ],
          },
        })));
      }

      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch;

    render(<Page />);

    const sessionInput = await screen.findByLabelText("Web session ID");
    await user.type(sessionInput, "s-force");
    await user.click(screen.getByRole("button", { name: "Load Session Preflight" }));

    await waitFor(() => {
      expect(screen.getByText("Latest Session Context Pack")).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText("Reviewer identity"), "YM");
    await user.type(screen.getByLabelText("Review reason"), "Override after comparing both versions");
    await user.type(screen.getByLabelText("Reviewer note"), "The generated draft is newer and should replace the stale page.");

    await user.click(screen.getByRole("button", { name: "Generate Learning Draft" }));
    await waitFor(() => {
      expect(screen.getByText("Latest Session Learning Draft")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Write Wiki Draft Files" }));
    await waitFor(() => {
      expect(screen.getByText("Writeback:written")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Promote Wiki Draft Files" }));
    await waitFor(() => {
      expect(screen.getByText("Writeback:promotion_conflicted")).toBeInTheDocument();
    });
    expect(screen.getByText("Review state: conflict")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Force Promote This Draft" }));
    await waitFor(() => {
      expect(screen.getByText("Writeback:promoted")).toBeInTheDocument();
    });
    expect(screen.getByText("Draft was force-promoted after manual override")).toBeInTheDocument();
    expect(screen.getByText("Review state: promoted")).toBeInTheDocument();
    expect(screen.getByText("manual_force_promotion")).toBeInTheDocument();
    expect(screen.getByText("force_promote_override")).toBeInTheDocument();
    expect(screen.getByText("promotion_succeeded")).toBeInTheDocument();
    expect(screen.getAllByText("Override after comparing both versions").length).toBeGreaterThan(0);
    expect(promotionBodies.some((body) => body.includes("\"force_conflict_override\":true"))).toBe(true);
    expect(promotionBodies.some((body) => body.includes("\"reviewer_actor\":\"YM\""))).toBe(true);

    await user.click(screen.getByRole("button", { name: "Reload Session Snapshot" }));
    await waitFor(() => {
      expect(screen.getByText("Reloaded session snapshot from persisted metadata.")).toBeInTheDocument();
    });
    expect(screen.getByText("Review state: promoted")).toBeInTheDocument();
    expect(screen.getByText("manual_force_promotion")).toBeInTheDocument();
  });
});
