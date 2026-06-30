// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatSessionsSidebar, type WebSession } from "./chat-sessions-sidebar";

describe("ChatSessionsSidebar", () => {
  function renderSidebar(sessions: WebSession[]) {
    render(
      <ChatSessionsSidebar
        sessions={sessions}
        activeSessionId={sessions[0]?.id ?? null}
        onSelectSession={vi.fn()}
        onNewSession={vi.fn()}
        embedded
      />,
    );
  }

  it("renders planner preflight badges for Y-CRM-routed sessions", () => {
    renderSidebar([
      {
        id: "s-ycrm",
        title: "Y-CRM Planner Chat",
        createdAt: Date.now() - 1_000,
        updatedAt: Date.now(),
        messageCount: 3,
        plannerPreflight: {
          system: "ycrm",
          updatedAt: Date.now(),
          validationState: "heuristic",
          intent: "entity_summary",
          confidence: "high",
          shouldRouteToYcrm: true,
          workspaceId: "workspace_3jox",
          needsWorkspaceValidation: false,
          warnings: [],
          blockers: [],
          crossSystem: true,
          targetSystems: ["erp"],
        },
        plannerLearningDraft: {
          writeback: {
            status: "promotion_conflicted",
            reviewer_actor: "YM",
          },
        },
      },
    ]);

    expect(screen.getByText("Y-CRM")).toBeInTheDocument();
    expect(screen.getByText("Advisory")).toBeInTheDocument();
    expect(screen.getByText("Cross-system")).toBeInTheDocument();
    expect(screen.getByText("ws:workspace_3jox")).toBeInTheDocument();
    expect(screen.getByText("Y-CRM: Needs review")).toBeInTheDocument();
    expect(screen.getByText("by:YM")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to Y-CRM review for Y-CRM Planner Chat" })).toHaveAttribute(
      "href",
      "/review/ycrm?sessionId=s-ycrm",
    );
  });

  it("does not render planner badges for sessions without preflight metadata", () => {
    renderSidebar([
      {
        id: "s-plain",
        title: "Plain Chat",
        createdAt: Date.now() - 1_000,
        updatedAt: Date.now(),
        messageCount: 1,
      },
    ]);

    expect(screen.queryByText("Y-CRM")).not.toBeInTheDocument();
    expect(screen.queryByText("Cross-system")).not.toBeInTheDocument();
  });

  it("does not render review CTA for Y-CRM-routed sessions without review state", () => {
    renderSidebar([
      {
        id: "s-ycrm-route-only",
        title: "Y-CRM Route Only Chat",
        createdAt: Date.now() - 1_000,
        updatedAt: Date.now(),
        messageCount: 2,
        plannerPreflight: {
          system: "ycrm",
          updatedAt: Date.now(),
          validationState: "heuristic",
          intent: "entity_summary",
          confidence: "high",
          shouldRouteToYcrm: true,
          workspaceId: null,
          needsWorkspaceValidation: false,
          warnings: [],
          blockers: [],
          crossSystem: false,
          targetSystems: [],
        },
      },
    ]);

    expect(screen.getByText("Y-CRM")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Go to Y-CRM review for Y-CRM Route Only Chat" })).not.toBeInTheDocument();
  });

  it("renders ERP planner badges when the session routes into ERP", () => {
    renderSidebar([
      {
        id: "s-erp",
        title: "ERP Planner Chat",
        createdAt: Date.now() - 1_000,
        updatedAt: Date.now(),
        messageCount: 2,
        plannerPreflight: {
          system: "ycrm",
          updatedAt: Date.now(),
          validationState: "heuristic",
          intent: "cross_system_request",
          confidence: "medium",
          shouldRouteToYcrm: false,
          workspaceId: null,
          needsWorkspaceValidation: false,
          warnings: [],
          blockers: [],
          crossSystem: true,
          targetSystems: ["erp"],
        },
        erpPlannerPreflight: {
          system: "erp",
          updatedAt: Date.now(),
          intent: "sales_order",
          confidence: "high",
          shouldRouteToErp: true,
          matchedKeywords: ["訂單", "出貨"],
          warnings: [],
        },
      },
    ]);

    expect(screen.getByText("ERP")).toBeInTheDocument();
    expect(screen.getByText("Advisory")).toBeInTheDocument();
    expect(screen.getByText("Cross-system")).toBeInTheDocument();
    expect(screen.queryByText("Y-CRM")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Go to ERP review for ERP Planner Chat" })).not.toBeInTheDocument();
  });

  it("renders EnMS planner badges when the session routes into EnMS", () => {
    renderSidebar([
      {
        id: "s-enms",
        title: "EnMS Planner Chat",
        createdAt: Date.now() - 1_000,
        updatedAt: Date.now(),
        messageCount: 2,
        plannerPreflight: {
          system: "ycrm",
          updatedAt: Date.now(),
          validationState: "heuristic",
          intent: "cross_system_request",
          confidence: "medium",
          shouldRouteToYcrm: false,
          workspaceId: null,
          needsWorkspaceValidation: false,
          warnings: [],
          blockers: [],
          crossSystem: true,
          targetSystems: ["enms"],
        },
        enmsPlannerPreflight: {
          system: "enms",
          updatedAt: Date.now(),
          intent: "site_benchmarking",
          confidence: "high",
          shouldRouteToEnms: true,
          matchedKeywords: ["場域", "比較"],
          warnings: [],
        },
        enmsPlannerLearningDraft: {
          writeback: {
            status: "written",
            reviewer_actor: "Energy QA",
          },
        },
      },
    ]);

    expect(screen.getByText("EnMS")).toBeInTheDocument();
    expect(screen.getByText("Advisory")).toBeInTheDocument();
    expect(screen.getByText("Cross-system")).toBeInTheDocument();
    expect(screen.getByText("EnMS: Draft ready")).toBeInTheDocument();
    expect(screen.getByText("by:Energy QA")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to EnMS review for EnMS Planner Chat" })).toHaveAttribute(
      "href",
      "/review/enms?sessionId=s-enms",
    );
  });

  it("renders a direct-data tag when the latest answer did not use a model", () => {
    renderSidebar([
      {
        id: "s-direct",
        title: "Direct Data Chat",
        createdAt: Date.now() - 1_000,
        updatedAt: Date.now(),
        messageCount: 2,
        lastAnswerMeta: {
          updatedAt: Date.now(),
          answerMode: "verified_direct",
          requestedModelId: "gx10_hermes/hermes-agent",
          modelClass: "none",
          domainId: "ycrm",
        },
      },
    ]);

    expect(screen.getByLabelText("Latest answer source for Direct Data Chat")).toBeInTheDocument();
    const directBadge = screen.getByText("直接查資料");
    expect(directBadge).toBeInTheDocument();
    expect(directBadge.parentElement?.getAttribute("title")).toContain("這次沒有實際呼叫 AI 模型");
    expect(screen.getByText("資料:Y-CRM")).toBeInTheDocument();
  });

  it("renders a local-model tag when the latest answer used a local model", () => {
    renderSidebar([
      {
        id: "s-local",
        title: "Local Model Chat",
        createdAt: Date.now() - 1_000,
        updatedAt: Date.now(),
        messageCount: 2,
        lastAnswerMeta: {
          updatedAt: Date.now(),
          answerMode: "model_run",
          requestedModelId: "gx10_hermes/hermes-agent",
          modelClass: "local",
        },
      },
    ]);

    expect(screen.getByText("本地模型")).toBeInTheDocument();
  });

  it("renders a cloud-model tag for dench cloud providers", () => {
    renderSidebar([
      {
        id: "s-cloud",
        title: "Cloud Model Chat",
        createdAt: Date.now() - 1_000,
        updatedAt: Date.now(),
        messageCount: 2,
        lastAnswerMeta: {
          updatedAt: Date.now(),
          answerMode: "model_run",
          requestedModelId: "anthropic.claude-opus-4-6-v1",
          modelClass: "cloud",
          domainId: "erp",
        },
      },
    ]);

    expect(screen.getByText("雲端模型")).toBeInTheDocument();
    expect(screen.getByText("資料:ERP")).toBeInTheDocument();
  });

  it("renders a system-answer tag when the latest answer came from guardrails", () => {
    renderSidebar([
      {
        id: "s-system",
        title: "System Answer Chat",
        createdAt: Date.now() - 1_000,
        updatedAt: Date.now(),
        messageCount: 2,
        lastAnswerMeta: {
          updatedAt: Date.now(),
          answerMode: "system_direct",
          requestedModelId: "gpt-4.1-mini",
          modelClass: "none",
          domainId: "enms",
        },
      },
    ]);

    expect(screen.getByText("系統回答")).toBeInTheDocument();
    const systemBadge = screen.getByText("系統回答");
    expect(systemBadge.parentElement?.getAttribute("title")).toContain("Session 預設模型（本次未使用）：gpt-4.1-mini");
    expect(screen.getByText("資料:EnMS")).toBeInTheDocument();
  });

  it("renders distinct source-domain and planner-domain chips on the same row", () => {
    renderSidebar([
      {
        id: "s-both-ycrm",
        title: "Y-CRM Source And Planner Chat",
        createdAt: Date.now() - 1_000,
        updatedAt: Date.now(),
        messageCount: 3,
        plannerPreflight: {
          system: "ycrm",
          updatedAt: Date.now(),
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
        lastAnswerMeta: {
          updatedAt: Date.now(),
          turnStartedAt: Date.now(),
          answerMode: "verified_direct",
          requestedModelId: "gx10_hermes/hermes-agent",
          modelClass: "none",
          domainId: "ycrm",
        },
      },
    ]);

    expect(screen.getByText("資料:Y-CRM")).toBeInTheDocument();
    expect(screen.getByText("Y-CRM")).toBeInTheDocument();
  });

  it("renders reviewed badge for sessions that were manually resolved", () => {
    renderSidebar([
      {
        id: "s-reviewed",
        title: "Reviewed Chat",
        createdAt: Date.now() - 1_000,
        updatedAt: Date.now(),
        messageCount: 2,
        plannerLearningDraft: {
          writeback: {
            status: "resolution_kept_current",
            reviewer_actor: "Sales Ops",
          },
        },
      },
    ]);

    expect(screen.getByText("Y-CRM: Reviewed")).toBeInTheDocument();
    expect(screen.getByText("by:Sales Ops")).toBeInTheDocument();
  });

  it("filters sessions by review queue state", async () => {
    const user = userEvent.setup();
    renderSidebar([
      {
        id: "s-draft-ready",
        title: "Draft Ready Chat",
        createdAt: Date.now() - 4_000,
        updatedAt: Date.now(),
        messageCount: 2,
        plannerLearningDraft: {
          writeback: {
            status: "written",
            reviewer_actor: null,
          },
        },
      },
      {
        id: "s-needs-review",
        title: "Needs Review Chat",
        createdAt: Date.now() - 3_000,
        updatedAt: Date.now(),
        messageCount: 2,
        plannerLearningDraft: {
          writeback: {
            status: "promotion_conflicted",
            reviewer_actor: "YM",
          },
        },
      },
      {
        id: "s-reviewed",
        title: "Reviewed Chat",
        createdAt: Date.now() - 2_000,
        updatedAt: Date.now(),
        messageCount: 2,
        plannerLearningDraft: {
          writeback: {
            status: "resolution_kept_current",
            reviewer_actor: "Sales Ops",
          },
        },
      },
      {
        id: "s-plain",
        title: "Plain Chat",
        createdAt: Date.now() - 1_000,
        updatedAt: Date.now(),
        messageCount: 1,
      },
    ]);

    expect(screen.getByText("All (4)")).toBeInTheDocument();
    expect(screen.getByText("Draft ready (1)")).toBeInTheDocument();
    expect(screen.getByText("Needs review (1)")).toBeInTheDocument();
    expect(screen.getByText("Reviewed (1)")).toBeInTheDocument();
    expect(screen.getByText("Review Queue")).toBeInTheDocument();
    expect(screen.getByText("1 session currently needs manual review before promotion.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Draft ready (1)" }));
    expect(screen.getByText("Draft Ready Chat")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to Y-CRM review for Draft Ready Chat" })).toHaveAttribute(
      "href",
      "/review/ycrm?sessionId=s-draft-ready",
    );
    expect(screen.queryByText("Needs Review Chat")).not.toBeInTheDocument();
    expect(screen.queryByText("Reviewed Chat")).not.toBeInTheDocument();
    expect(screen.queryByText("Plain Chat")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Needs review (1)" }));
    expect(screen.getByText("Needs Review Chat")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to Y-CRM review for Needs Review Chat" })).toHaveAttribute(
      "href",
      "/review/ycrm?sessionId=s-needs-review",
    );
    expect(screen.queryByText("Reviewed Chat")).not.toBeInTheDocument();
    expect(screen.queryByText("Plain Chat")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Reviewed (1)" }));
    expect(screen.getByText("Reviewed Chat")).toBeInTheDocument();
    expect(screen.queryByText("Needs Review Chat")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "All (4)" }));
    expect(screen.getByText("Plain Chat")).toBeInTheDocument();
  });

  it("shows user-friendly empty state messages for review filters", async () => {
    const user = userEvent.setup();
    renderSidebar([
      {
        id: "s-reviewed",
        title: "Reviewed Chat",
        createdAt: Date.now() - 2_000,
        updatedAt: Date.now(),
        messageCount: 2,
        plannerLearningDraft: {
          writeback: {
            status: "resolution_kept_current",
            reviewer_actor: "Sales Ops",
          },
        },
      },
    ]);

    await user.click(screen.getByRole("button", { name: "Draft ready (0)" }));
    expect(screen.getByText("No sessions are waiting at the draft-ready checkpoint.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Needs review (0)" }));
    expect(screen.getByText("No sessions currently need manual review.")).toBeInTheDocument();
  });

  it("surfaces a reviewed-only queue summary when nothing is pending", () => {
    renderSidebar([
      {
        id: "s-reviewed",
        title: "Reviewed Chat",
        createdAt: Date.now() - 2_000,
        updatedAt: Date.now(),
        messageCount: 2,
        plannerLearningDraft: {
          writeback: {
            status: "promoted",
            reviewer_actor: "Sales Ops",
          },
        },
      },
    ]);

    expect(screen.getByText("Review Queue")).toBeInTheDocument();
    expect(screen.getByText("1 session has already been reviewed.")).toBeInTheDocument();
  });
});
