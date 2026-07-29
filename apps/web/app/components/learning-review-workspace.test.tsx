// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LearningReviewWorkspace } from "./learning-review-workspace";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const readyDraft = {
  session_id: "s-test",
  status: "ready" as const,
  learning_focus: "inventory_status",
  summary: "Generated draft",
  meta: { generated_at: 1710000000000, generation_mode: "minimal_evidence", token_guardrails: ["auto_trigger_post_run"], cached: false, source: "fresh_generation" },
  writeback: {
    status: "not_written" as const,
    updated_at: null,
    files: [],
    skipped_files: [],
    promoted_files: [],
    promotion_skipped_files: [],
    promotion_conflict_files: [],
  },
  evidence: {
    latest_user_message: "目前可用庫存最多的前 10 個商品",
    latest_assistant_reply: "整理出 10 個商品",
    live_query_steps: ["read_real_data"],
    matched_keywords: ["庫存"],
  },
  drafts: {
    wiki: [
      {
        kind: "inventory_snapshot",
        suggested_path: "wiki/entities/items/s-test-inventory-snapshot.md",
        title: "ERP Inventory Snapshot Draft",
        reason: "Reusable inventory snapshot.",
        outline: ["查詢範圍", "在手/可用摘要"],
      },
    ],
    playbooks: [],
    memory: [
      { key: "known_rule:inventory_available_vs_allocated", value: "Use available_qty.", reason: "reinforced" },
    ],
  },
};

const enmsReadyDraft = {
  ...readyDraft,
  learning_focus: "natural_language_query",
  drafts: {
    ...readyDraft.drafts,
    regression: [
      {
        kind: "chat_capability_regression",
        suggested_path: "wiki/regression/enms/s-test-device_lookup-regression.json",
        title: "EnMS device lookup regression",
        question: "迴路1是對應哪個設備？",
        expected_intent: "natural_language_query",
        expected_capabilities: ["device_lookup"],
        required_evidence: ["authorized_enms_scope", "meter_identity_mapping"],
        guardrails: ["must_use_authorized_scope"],
        reason: "Prevent device lookup questions from being answered as ranking questions.",
      },
    ],
  },
};

const writtenDraft = {
  ...readyDraft,
  writeback: { ...readyDraft.writeback, status: "written" as const, files: ["wiki/entities/items/s-test-inventory-snapshot.md"] },
};

const enmsWrittenDraft = {
  ...enmsReadyDraft,
  writeback: {
    ...enmsReadyDraft.writeback,
    status: "written" as const,
    files: ["wiki/entities/energy/s-test-summary.md"],
    skipped_files: [],
    regression_files: ["wiki/regression/enms/s-test-regression.json"],
    regression_skipped_files: [],
  },
};

const enmsWrittenDraftMissingRegressionArtifact = {
  ...enmsReadyDraft,
  writeback: {
    ...enmsReadyDraft.writeback,
    status: "written" as const,
    files: ["wiki/entities/energy/s-test-summary.md"],
    skipped_files: [],
    regression_files: [],
    regression_skipped_files: [],
  },
};

const conflictedDraft = {
  ...readyDraft,
  writeback: {
    ...readyDraft.writeback,
    status: "promotion_conflicted" as const,
    promotion_conflict_files: ["wiki/entities/items/s-test-inventory-snapshot.md"],
  },
};

function mockSessionResponse(
  draft: unknown,
  system: "ycrm" | "erp" | "enms" = "erp",
) {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () =>
      system === "erp"
        ? { id: "s-test", session: { erpPlannerLearningDraft: draft } }
        : system === "enms"
          ? { id: "s-test", session: { enmsPlannerLearningDraft: draft } }
          : { id: "s-test", session: { plannerLearningDraft: draft } },
  } as Response);
}

function mockEnmsReviewDraftResponse(draft: unknown) {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => ({ ok: true, session_id: "s-test", draft }),
  } as Response);
}

describe("LearningReviewWorkspace", () => {
  it("shows missing-sessionId error when none provided", async () => {
    render(<LearningReviewWorkspace system="erp" sessionId={null} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/Missing sessionId/i);
  });

  it("shows the empty-state message when no draft is persisted", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ id: "s-test", session: {} }),
    } as Response);
    render(<LearningReviewWorkspace system="erp" sessionId="s-test" />);
    expect(await screen.findByText(/No learning draft persisted/i)).toBeInTheDocument();
  });

  it("renders draft body, evidence, and disables promote when status is not_written", async () => {
    mockSessionResponse(readyDraft);
    render(<LearningReviewWorkspace system="erp" sessionId="s-test" />);

    expect(await screen.findByText(/ERP Inventory Snapshot Draft/)).toBeInTheDocument();
    expect(screen.queryByText("Draft ready")).not.toBeInTheDocument();
    expect(screen.getByText("Not written")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Writeback to disk/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Promote to wiki/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Force promote/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Keep current/ })).toBeDisabled();
  });

  it("enables Promote when status is written and reviewer/reason filled", async () => {
    mockSessionResponse(writtenDraft);
    render(<LearningReviewWorkspace system="erp" sessionId="s-test" />);
    await screen.findByText("Draft ready");

    const user = userEvent.setup();
    const promoteBtn = screen.getByRole("button", { name: /Promote to wiki/ });
    expect(promoteBtn).toBeDisabled(); // requires audit fields

    await user.type(screen.getByLabelText("Reviewer"), "Yen");
    await user.type(screen.getByLabelText("Reason"), "Numbers verified");
    expect(promoteBtn).toBeEnabled();
  });

  it("highlights conflicted state and unlocks Force/Keep", async () => {
    mockSessionResponse(conflictedDraft);
    render(<LearningReviewWorkspace system="erp" sessionId="s-test" />);
    await screen.findByText("Needs review");

    expect(screen.getByText(/Promotion conflicts/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Writeback to disk/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Promote to wiki/ })).toBeDisabled();

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Reviewer"), "Yen");
    await user.type(screen.getByLabelText("Reason"), "Manual review done");
    expect(screen.getByRole("button", { name: /Force promote/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Keep current/ })).toBeEnabled();
  });

  it("uses the Y-CRM endpoint and key when system=ycrm", async () => {
    mockSessionResponse(readyDraft, "ycrm");
    render(<LearningReviewWorkspace system="ycrm" sessionId="s-test" />);
    await screen.findByText("Y-CRM · Learning Review");
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/web-sessions/s-test");
    });
  });

  it("uses the EnMS endpoint and key when system=enms", async () => {
    mockEnmsReviewDraftResponse(enmsReadyDraft);
    render(<LearningReviewWorkspace system="enms" sessionId="s-test" />);
    await screen.findByText("EnMS · Learning Review");
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Reviewer token"), "review-secret");
    await user.click(screen.getByRole("button", { name: /Load secured draft/ }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/internal/enms-learning-draft?session_id=s-test",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer review-secret",
          }),
        }),
      );
    });
  });

  it("keeps EnMS review locked until a reviewer token is provided", async () => {
    render(<LearningReviewWorkspace system="enms" sessionId="s-test" />);

    expect(
      await screen.findByText(/Enter the internal EnMS reviewer token/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows token authorization errors distinctly for EnMS secured reads", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: "Unauthorized" }),
    } as Response);

    render(<LearningReviewWorkspace system="enms" sessionId="s-test" />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Reviewer token"), "bad-token");
    await user.click(screen.getByRole("button", { name: /Load secured draft/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /Reviewer token is invalid or unauthorized \(401\)/,
    );
  });

  it("renders EnMS regression case drafts for reviewer validation", async () => {
    mockEnmsReviewDraftResponse(enmsReadyDraft);
    render(<LearningReviewWorkspace system="enms" sessionId="s-test" />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Reviewer token"), "review-secret");
    await user.click(screen.getByRole("button", { name: /Load secured draft/ }));

    expect(await screen.findByText(/Regression cases \(1\)/)).toBeInTheDocument();
    expect(screen.getByText("迴路1是對應哪個設備？")).toBeInTheDocument();
    expect(screen.getByText("device_lookup")).toBeInTheDocument();
    expect(screen.getByText(/meter_identity_mapping/)).toBeInTheDocument();
  });

  it("disables EnMS promotion and shows missing regression artifact gate", async () => {
    mockEnmsReviewDraftResponse(enmsWrittenDraftMissingRegressionArtifact);
    render(<LearningReviewWorkspace system="enms" sessionId="s-test" />);

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Reviewer token"), "review-secret");
    await user.click(screen.getByRole("button", { name: /Load secured draft/ }));
    await screen.findByText(/Promotion gate checklist/);
    await user.type(screen.getByLabelText("Reviewer"), "Yen");
    await user.type(screen.getByLabelText("Reason"), "Regression artifact check");

    expect(
      screen.getByText(/Regression case artifact must be written or already exist/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: /Promote to wiki after regression gate/,
      }),
    ).toBeDisabled();
  });

  it("enables EnMS promotion only when regression gate data is present", async () => {
    mockEnmsReviewDraftResponse(enmsWrittenDraft);
    render(<LearningReviewWorkspace system="enms" sessionId="s-test" />);

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Reviewer token"), "review-secret");
    await user.click(screen.getByRole("button", { name: /Load secured draft/ }));
    await screen.findByText("Draft ready");
    await user.type(screen.getByLabelText("Reviewer"), "Yen");
    await user.type(screen.getByLabelText("Reason"), "Regression artifact ready");

    expect(
      screen.getByRole("button", {
        name: /Promote to wiki after regression gate/,
      }),
    ).toBeEnabled();
  });

  it("uses the internal EnMS review endpoint for writeback", async () => {
    mockEnmsReviewDraftResponse(enmsReadyDraft);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        writeback: {
          files: ["wiki/x.md"],
          skipped_files: [],
          regression_files: ["wiki/regression/enms/x.json"],
          regression_skipped_files: [],
        },
      }),
    } as Response);
    mockEnmsReviewDraftResponse(writtenDraft);

    render(<LearningReviewWorkspace system="enms" sessionId="s-test" />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Reviewer token"), "review-secret");
    await user.click(screen.getByRole("button", { name: /Load secured draft/ }));
    await screen.findByRole("button", { name: /Writeback to disk/ });
    await user.click(screen.getByRole("button", { name: /Writeback to disk/ }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/internal/enms-learning-draft/writeback",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer review-secret",
          }),
        }),
      );
    });
    expect(
      await screen.findByText(/Wrote 1 wiki draft file and 1 regression case file/i),
    ).toBeInTheDocument();
  });

  it("calls writeback endpoint with session_id and refreshes on success", async () => {
    mockSessionResponse(readyDraft);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, writeback: { files: ["wiki/x.md"], skipped_files: [] } }),
    } as Response);
    mockSessionResponse(writtenDraft); // refetch returns updated draft

    render(<LearningReviewWorkspace system="erp" sessionId="s-test" />);
    await screen.findByRole("button", { name: /Writeback to disk/ });

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Writeback to disk/ }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/debug/erp-learning-draft/writeback",
        expect.objectContaining({ method: "POST" }),
      );
    });
    expect(await screen.findByText(/Wrote 1 wiki draft file/i)).toBeInTheDocument();
  });
});
