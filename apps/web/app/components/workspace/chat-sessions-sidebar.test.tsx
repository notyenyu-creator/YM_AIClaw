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
    expect(screen.getByText("Needs review")).toBeInTheDocument();
    expect(screen.getByText("by:YM")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to review for Y-CRM Planner Chat" })).toHaveAttribute(
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
    expect(screen.getByRole("link", { name: "Go to ERP review for ERP Planner Chat" })).toHaveAttribute(
      "href",
      "/review/erp?sessionId=s-erp",
    );
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

    expect(screen.getByText("Reviewed")).toBeInTheDocument();
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
    expect(screen.getByRole("link", { name: "Go to review for Draft Ready Chat" })).toHaveAttribute(
      "href",
      "/review/ycrm?sessionId=s-draft-ready",
    );
    expect(screen.queryByText("Needs Review Chat")).not.toBeInTheDocument();
    expect(screen.queryByText("Reviewed Chat")).not.toBeInTheDocument();
    expect(screen.queryByText("Plain Chat")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Needs review (1)" }));
    expect(screen.getByText("Needs Review Chat")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to review for Needs Review Chat" })).toHaveAttribute(
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
