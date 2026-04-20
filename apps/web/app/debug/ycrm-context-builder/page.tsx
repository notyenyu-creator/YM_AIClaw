"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { usePathname } from "next/navigation";
import { Button } from "@/app/components/ui/button";

type DebugRouteResponse = {
  ok: boolean;
  defaults?: {
    request?: {
      user_message?: string;
      current_system_hint?: string | null;
      requested_workspace?: string | null;
      user_locale?: string | null;
    };
  };
  sample_output?: {
    decision?: {
      intent?: string;
      confidence?: string;
      should_route_to_ycrm?: boolean;
    };
  };
  input?: {
    request?: {
      user_message?: string;
      current_system_hint?: string | null;
      requested_workspace?: string | null;
    };
  };
  plan?: {
    decision?: {
      intent?: string;
      confidence?: string;
      should_route_to_ycrm?: boolean;
    };
    handoff?: {
      cross_system?: boolean;
      target_systems?: string[];
    };
    notes?: {
      warnings?: string[];
      blockers?: string[];
    };
  };
  error?: string;
};

type SessionRouteResponse = {
  id?: string;
  session?: {
    id?: string;
    plannerPreflight?: {
      system?: string;
      updatedAt?: number;
      validationState?: "heuristic" | "validated" | "stale";
      intent?: string;
      confidence?: string;
      shouldRouteToYcrm?: boolean;
      workspaceId?: string | null;
      needsWorkspaceValidation?: boolean;
      warnings?: string[];
      blockers?: string[];
      crossSystem?: boolean;
      targetSystems?: string[];
    } | null;
    plannerContextPack?: {
      planner?: {
        system?: string;
        updatedAt?: number;
        validationState?: "heuristic" | "validated" | "stale";
        intent?: string;
        confidence?: string;
        shouldRouteToYcrm?: boolean;
        workspaceId?: string | null;
        needsWorkspaceValidation?: boolean;
        warnings?: string[];
        blockers?: string[];
        crossSystem?: boolean;
        targetSystems?: string[];
      } | null;
      read_first?: string[];
      references?: string[];
      wiki?: string[];
      playbooks?: string[];
      memory_keys?: string[];
      live_query_steps?: string[];
      execution_hints?: string[];
    } | null;
    plannerLearningDraft?: {
      session_id?: string;
      status?: string;
      learning_focus?: string;
      summary?: string;
      meta?: {
        generated_at?: number;
        generation_mode?: string;
        token_guardrails?: string[];
        cached?: boolean;
        source?: string;
      };
      writeback?: {
        status?: string;
        updated_at?: number | null;
        files?: string[];
        skipped_files?: string[];
        promoted_files?: string[];
        promotion_skipped_files?: string[];
        promotion_conflict_files?: string[];
        approved_at?: number | null;
        approved_via?: string | null;
        resolution_action?: string | null;
        resolved_at?: number | null;
        review_reason?: string | null;
        reviewer_note?: string | null;
        reviewer_actor?: string | null;
      };
      evidence?: {
        latest_user_message?: string | null;
        latest_assistant_reply?: string | null;
        live_query_steps?: string[];
      };
      drafts?: {
        wiki?: Array<{
          kind?: string;
          suggested_path?: string;
          title?: string;
          reason?: string;
          outline?: string[];
        }>;
        playbooks?: Array<{
          kind?: string;
          suggested_path?: string;
          title?: string;
          reason?: string;
          next_sections?: string[];
        }>;
        memory?: Array<{
          key?: string;
          value?: string;
          reason?: string;
        }>;
      };
      history?: Array<{
        at?: number;
        event?: string;
        tone?: "neutral" | "success" | "warning";
        summary?: string;
        files?: string[];
        review_reason?: string | null;
        reviewer_note?: string | null;
        reviewer_actor?: string | null;
      }>;
    } | null;
  } | null;
  messages?: Array<{ id?: string; role?: string; content?: string }>;
  error?: string;
};

type LearningDraftResponse = {
  ok?: boolean;
  cached?: boolean;
  promotion?: {
    promoted_files?: string[];
    skipped_files?: string[];
    conflict_files?: string[];
    conflict_details?: Array<{
      file_path?: string;
      reason?: string;
      current_title?: string | null;
      current_excerpt?: string | null;
      current_source_session?: string | null;
      proposed_title?: string | null;
      proposed_outline?: string[];
    }>;
    updated_supporting_files?: string[];
  };
  draft?: {
    status?: string;
    learning_focus?: string;
    summary?: string;
    meta?: {
      generated_at?: number;
      generation_mode?: string;
      token_guardrails?: string[];
      cached?: boolean;
      source?: string;
    };
    writeback?: {
      status?: string;
      updated_at?: number | null;
      files?: string[];
      skipped_files?: string[];
      promoted_files?: string[];
      promotion_skipped_files?: string[];
      promotion_conflict_files?: string[];
      approved_at?: number | null;
      approved_via?: string | null;
      resolution_action?: string | null;
      resolved_at?: number | null;
      review_reason?: string | null;
      reviewer_note?: string | null;
      reviewer_actor?: string | null;
    };
    evidence?: {
      latest_user_message?: string | null;
      latest_assistant_reply?: string | null;
      live_query_steps?: string[];
    };
    drafts?: {
      wiki?: Array<{
        kind?: string;
        suggested_path?: string;
        title?: string;
        reason?: string;
        outline?: string[];
      }>;
      playbooks?: Array<{
        kind?: string;
        suggested_path?: string;
        title?: string;
        reason?: string;
        next_sections?: string[];
      }>;
      memory?: Array<{
        key?: string;
        value?: string;
        reason?: string;
      }>;
    };
    history?: Array<{
      at?: number;
      event?: string;
      tone?: "neutral" | "success" | "warning";
      summary?: string;
      files?: string[];
      review_reason?: string | null;
      reviewer_note?: string | null;
      reviewer_actor?: string | null;
    }>;
  };
  error?: string;
};

type FormState = {
  user_message: string;
  current_system_hint: string;
  requested_workspace: string;
  session_id: string;
  force_regenerate: boolean;
  overwrite_writeback: boolean;
  review_reason: string;
  reviewer_note: string;
  reviewer_actor: string;
};

type TimelineFilter = "all" | "reviewed_only" | "conflicts_only";

const SAMPLE_PROMPTS = [
  "請幫我整理 Y-CRM 工作區裡面的 Calleen Hong 目前負責的客戶背景。",
  "幫我分析 Y-CRM 裡許子新的商機分布，順便做成圖表。",
  "這個客戶在 Y-CRM 裡商機很熱，但我想知道他的訂單現在到哪、庫存夠不夠、還有工單有沒有卡住。",
];

function JsonPanel({ data }: { data: unknown }) {
  const formatted = useMemo(() => JSON.stringify(data, null, 2), [data]);
  return (
    <pre
      className="overflow-x-auto rounded-2xl border p-4 text-xs leading-6"
      style={{
        background: "var(--color-surface)",
        borderColor: "var(--color-border)",
        color: "var(--color-text-secondary)",
      }}
    >
      {formatted}
    </pre>
  );
}

function StatusChip({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: "neutral" | "success" | "warning" | "error" | "accent";
}) {
  const toneStyles = {
    neutral: {
      background: "var(--color-surface)",
      color: "var(--color-text-secondary)",
      borderColor: "var(--color-border)",
    },
    success: {
      background: "rgba(22, 163, 74, 0.1)",
      color: "var(--color-success)",
      borderColor: "rgba(22, 163, 74, 0.18)",
    },
    warning: {
      background: "rgba(217, 119, 6, 0.1)",
      color: "var(--color-warning)",
      borderColor: "rgba(217, 119, 6, 0.18)",
    },
    error: {
      background: "rgba(220, 38, 38, 0.1)",
      color: "var(--color-error)",
      borderColor: "rgba(220, 38, 38, 0.18)",
    },
    accent: {
      background: "var(--color-accent-light)",
      color: "var(--color-accent)",
      borderColor: "rgba(0, 101, 162, 0.18)",
    },
  } as const;

  return (
    <span
      className="inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium"
      style={toneStyles[tone]}
    >
      {label}
    </span>
  );
}

function deriveReviewState(learningDraft: LearningDraftResponse["draft"] | null): {
  label: string;
  tone: "neutral" | "success" | "warning" | "error" | "accent";
} {
  const status = learningDraft?.writeback?.status;
  if (status === "promotion_conflicted") {
    return { label: "Review state: conflict", tone: "warning" };
  }
  if (status === "resolution_kept_current") {
    return { label: "Review state: reviewed", tone: "success" };
  }
  if (status === "promoted") {
    return { label: "Review state: promoted", tone: "success" };
  }
  if (status === "written") {
    return { label: "Review state: draft written", tone: "accent" };
  }
  return { label: "Review state: pending", tone: "neutral" };
}

function deriveReviewGuidance(learningDraft: LearningDraftResponse["draft"] | null): {
  title: string;
  body: string;
  tone: "neutral" | "success" | "warning" | "accent";
} | null {
  const status = learningDraft?.writeback?.status;
  if (status === "written") {
    return {
      title: "Draft files are ready for review",
      body: "Wiki draft files have been written, but they have not been promoted yet. This is the safest checkpoint to review wording and scope before touching the shared wiki registry.",
      tone: "accent",
    };
  }
  if (status === "promotion_conflicted") {
    return {
      title: "Promotion is paused for manual review",
      body: "The target wiki page looks manually curated or already promoted by another session, so DenchClaw stopped before overwriting it. Use the compare view below to decide whether to keep the current page or force-promote this draft.",
      tone: "warning",
    };
  }
  if (status === "resolution_kept_current") {
    return {
      title: "Current wiki page was kept",
      body: "This draft is now marked as reviewed without overwriting the existing wiki page. The session audit trail still keeps the reason, reviewer, and note so the decision stays traceable.",
      tone: "success",
    };
  }
  if (status === "promoted") {
    return {
      title: learningDraft?.writeback?.approved_via === "manual_force_promotion"
        ? "Draft was force-promoted after manual override"
        : "Draft was promoted into the wiki registry",
      body: learningDraft?.writeback?.approved_via === "manual_force_promotion"
        ? "A reviewer manually approved replacing the conflicted page, and the promoted state is now persisted back into the session metadata."
        : "Promotion completed successfully and the wiki registry files were updated. Reloading the session should keep this promoted state.",
      tone: "success",
    };
  }
  return null;
}

export default function YcrmContextBuilderDebugPage() {
  const pathname = usePathname();
  const isReviewMode = pathname?.startsWith("/review/ycrm") ?? false;
  const [isPending, startTransition] = useTransition();
  const [bootLoading, setBootLoading] = useState(true);
  const [form, setForm] = useState<FormState>({
    user_message: SAMPLE_PROMPTS[0],
    current_system_hint: "ycrm",
    requested_workspace: "",
    session_id: "",
    force_regenerate: false,
    overwrite_writeback: false,
    review_reason: "",
    reviewer_note: "",
    reviewer_actor: "",
  });
  const [result, setResult] = useState<DebugRouteResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [sessionInfo, setSessionInfo] = useState<string | null>(null);
  const [sessionResult, setSessionResult] = useState<SessionRouteResponse | null>(null);
  const [learningError, setLearningError] = useState<string | null>(null);
  const [learningResult, setLearningResult] = useState<LearningDraftResponse | null>(null);
  const [writebackError, setWritebackError] = useState<string | null>(null);
  const [promotionError, setPromotionError] = useState<string | null>(null);
  const [resolutionError, setResolutionError] = useState<string | null>(null);
  const [timelineFilter, setTimelineFilter] = useState<TimelineFilter>("all");
  const [autoLoadSessionId, setAutoLoadSessionId] = useState<string | null>(null);

  function requireReviewDecisionContext(actionLabel: string): boolean {
    const reviewerActor = form.reviewer_actor.trim();
    const reviewReason = form.review_reason.trim();

    if (!reviewerActor) {
      setResolutionError(`${actionLabel} 前請先填寫 Reviewer identity。`);
      setPromotionError(`${actionLabel} 前請先填寫 Reviewer identity。`);
      return false;
    }

    if (!reviewReason) {
      setResolutionError(`${actionLabel} 前請先填寫 Review reason。`);
      setPromotionError(`${actionLabel} 前請先填寫 Review reason。`);
      return false;
    }

    return true;
  }

  useEffect(() => {
    let alive = true;

    async function bootstrap() {
      try {
        const res = await fetch("/api/debug/ycrm-context-builder");
        const data = await res.json() as DebugRouteResponse;
        if (!alive) {return;}

        startTransition(() => {
          setResult(data);
          setForm((prev) => ({
            user_message: data.defaults?.request?.user_message || prev.user_message,
            current_system_hint: data.defaults?.request?.current_system_hint || prev.current_system_hint,
            requested_workspace: data.defaults?.request?.requested_workspace || "",
            session_id: prev.session_id,
            force_regenerate: prev.force_regenerate,
            overwrite_writeback: prev.overwrite_writeback,
            review_reason: prev.review_reason,
            reviewer_note: prev.reviewer_note,
            reviewer_actor: prev.reviewer_actor,
          }));
        });
      } catch (err) {
        if (!alive) {return;}
        setError(err instanceof Error ? err.message : "Failed to load debug route.");
      } finally {
        if (alive) {setBootLoading(false);}
      }
    }

    void bootstrap();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const sessionId = new URLSearchParams(window.location.search).get("sessionId")?.trim() ?? "";
    if (!sessionId) {
      return;
    }
    setAutoLoadSessionId(sessionId);
    setForm((prev) => ({ ...prev, session_id: sessionId }));
  }, []);

  async function handleSubmit() {
    setError(null);
    try {
      const res = await fetch("/api/debug/ycrm-context-builder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_message: form.user_message,
          current_system_hint: form.current_system_hint || null,
          requested_workspace: form.requested_workspace || null,
        }),
      });
      const data = await res.json() as DebugRouteResponse;
      if (!res.ok) {
        throw new Error(data.error || "Failed to build Y-CRM context plan.");
      }
      startTransition(() => {
        setResult(data);
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to build Y-CRM context plan.");
    }
  }

  async function loadSessionSnapshot(sessionId: string, mode: "load" | "reload" = "load") {
    setSessionError(null);
    setSessionInfo(null);

    try {
      const res = await fetch(`/api/web-sessions/${encodeURIComponent(sessionId)}`);
      const data = await res.json() as SessionRouteResponse;
      if (!res.ok) {
        throw new Error(data.error || "Failed to load web session.");
      }
      startTransition(() => {
        setSessionResult(data);
        setLearningResult(data.session?.plannerLearningDraft ? { ok: true, draft: data.session.plannerLearningDraft } : null);
        setSessionInfo(
          mode === "reload"
            ? "Reloaded session snapshot from persisted metadata."
            : "Loaded session snapshot from persisted metadata.",
        );
      });
    } catch (err) {
      setSessionError(err instanceof Error ? err.message : "Failed to load session planner preflight.");
    }
  }

  async function handleLoadSessionPreflight(mode: "load" | "reload" = "load") {
    const sessionId = form.session_id.trim();

    if (!sessionId) {
      setSessionError("Please enter a web session ID before loading planner preflight.");
      return;
    }

    await loadSessionSnapshot(sessionId, mode);
  }

  useEffect(() => {
    if (bootLoading || !autoLoadSessionId) {
      return;
    }
    void loadSessionSnapshot(autoLoadSessionId, "load");
    setAutoLoadSessionId(null);
  }, [autoLoadSessionId, bootLoading]);

  async function handleGenerateLearningDraft() {
    if (!sessionResult?.session?.id && !sessionResult?.id) {
      setLearningError("Please load a web session before generating a learning draft.");
      return;
    }

    setLearningError(null);
    setWritebackError(null);
    setPromotionError(null);
    setResolutionError(null);
    try {
      const res = await fetch("/api/debug/ycrm-learning-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionResult?.session?.id || sessionResult?.id,
          force_regenerate: form.force_regenerate,
          planner_preflight: sessionResult?.session?.plannerPreflight ?? null,
          planner_context_pack: sessionResult?.session?.plannerContextPack ?? null,
          messages: (sessionResult as { messages?: Array<{ id?: string; role?: string; content?: string }> })?.messages ?? [],
        }),
      });
      const data = await res.json() as LearningDraftResponse;
      if (!res.ok) {
        throw new Error(data.error || "Failed to generate Y-CRM learning draft.");
      }
      startTransition(() => {
        setLearningResult(data);
        setSessionResult((prev) => prev ? {
          ...prev,
          session: prev.session ? {
            ...prev.session,
            plannerLearningDraft: data.draft ?? null,
          } : prev.session,
        } : prev);
      });
    } catch (err) {
      setLearningError(err instanceof Error ? err.message : "Failed to generate Y-CRM learning draft.");
    }
  }

  async function handleWriteWikiDraftFiles() {
    if (!sessionResult?.session?.id && !sessionResult?.id) {
      setWritebackError("Please load a web session before writing wiki draft files.");
      return;
    }

    setWritebackError(null);
    setPromotionError(null);
    setResolutionError(null);
    try {
      const res = await fetch("/api/debug/ycrm-learning-draft/writeback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionResult?.session?.id || sessionResult?.id,
          overwrite: form.overwrite_writeback,
        }),
      });
      const data = await res.json() as LearningDraftResponse;
      if (!res.ok) {
        throw new Error(data.error || "Failed to write Y-CRM wiki draft files.");
      }
      startTransition(() => {
        setLearningResult(data);
        setSessionResult((prev) => prev ? {
          ...prev,
          session: prev.session ? {
            ...prev.session,
            plannerLearningDraft: data.draft ?? null,
          } : prev.session,
        } : prev);
      });
    } catch (err) {
      setWritebackError(err instanceof Error ? err.message : "Failed to write Y-CRM wiki draft files.");
    }
  }

  async function handlePromoteWikiDraftFiles() {
    if (!sessionResult?.session?.id && !sessionResult?.id) {
      setPromotionError("Please load a web session before promoting wiki draft files.");
      return;
    }
    if (!requireReviewDecisionContext("Promote Wiki Draft Files")) {
      return;
    }

    setPromotionError(null);
    setResolutionError(null);
    try {
      const res = await fetch("/api/debug/ycrm-learning-draft/promote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionResult?.session?.id || sessionResult?.id,
          review_reason: form.review_reason || null,
          reviewer_note: form.reviewer_note || null,
          reviewer_actor: form.reviewer_actor || null,
        }),
      });
      const data = await res.json() as LearningDraftResponse;
      if (!res.ok) {
        throw new Error(data.error || "Failed to promote Y-CRM wiki draft files.");
      }
      startTransition(() => {
        setLearningResult(data);
        setSessionResult((prev) => prev ? {
          ...prev,
          session: prev.session ? {
            ...prev.session,
            plannerLearningDraft: data.draft ?? null,
          } : prev.session,
        } : prev);
      });
    } catch (err) {
      setPromotionError(err instanceof Error ? err.message : "Failed to promote Y-CRM wiki draft files.");
    }
  }

  async function handleKeepCurrentPage() {
    if (!sessionResult?.session?.id && !sessionResult?.id) {
      setResolutionError("Please load a web session before resolving a promotion conflict.");
      return;
    }
    if (!requireReviewDecisionContext("Keep Current Page")) {
      return;
    }

    setResolutionError(null);
    try {
      const res = await fetch("/api/debug/ycrm-learning-draft/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionResult?.session?.id || sessionResult?.id,
          resolution_action: "keep_current_page",
          review_reason: form.review_reason || null,
          reviewer_note: form.reviewer_note || null,
          reviewer_actor: form.reviewer_actor || null,
        }),
      });
      const data = await res.json() as LearningDraftResponse;
      if (!res.ok) {
        throw new Error(data.error || "Failed to keep the current page as the chosen resolution.");
      }
      startTransition(() => {
        setLearningResult(data);
        setSessionResult((prev) => prev ? {
          ...prev,
          session: prev.session ? {
            ...prev.session,
            plannerLearningDraft: data.draft ?? null,
          } : prev.session,
        } : prev);
      });
    } catch (err) {
      setResolutionError(err instanceof Error ? err.message : "Failed to keep the current page as the chosen resolution.");
    }
  }

  async function handleForcePromoteThisDraft() {
    if (!sessionResult?.session?.id && !sessionResult?.id) {
      setResolutionError("Please load a web session before force-promoting a draft.");
      return;
    }
    if (!requireReviewDecisionContext("Force Promote This Draft")) {
      return;
    }

    setResolutionError(null);
    try {
      const res = await fetch("/api/debug/ycrm-learning-draft/promote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionResult?.session?.id || sessionResult?.id,
          force_conflict_override: true,
          review_reason: form.review_reason || null,
          reviewer_note: form.reviewer_note || null,
          reviewer_actor: form.reviewer_actor || null,
        }),
      });
      const data = await res.json() as LearningDraftResponse;
      if (!res.ok) {
        throw new Error(data.error || "Failed to force-promote this draft.");
      }
      startTransition(() => {
        setLearningResult(data);
        setSessionResult((prev) => prev ? {
          ...prev,
          session: prev.session ? {
            ...prev.session,
            plannerLearningDraft: data.draft ?? null,
          } : prev.session,
        } : prev);
      });
    } catch (err) {
      setResolutionError(err instanceof Error ? err.message : "Failed to force-promote this draft.");
    }
  }

  const plan = result?.plan ?? result?.sample_output;
  const warnings = result?.plan?.notes?.warnings ?? [];
  const blockers = result?.plan?.notes?.blockers ?? [];
  const targets = result?.plan?.handoff?.target_systems ?? [];
  const sessionPreflight = sessionResult?.session?.plannerPreflight ?? null;
  const sessionContextPack = sessionResult?.session?.plannerContextPack ?? null;
  const learningDraft = learningResult?.draft ?? sessionResult?.session?.plannerLearningDraft ?? null;
  const learningHistory = learningDraft?.history ?? [];
  const reviewState = deriveReviewState(learningDraft);
  const reviewGuidance = deriveReviewGuidance(learningDraft);
  const filteredLearningHistory = [...learningHistory]
    .slice()
    .reverse()
    .filter((entry) => {
      if (timelineFilter === "reviewed_only") {
        return Boolean(entry.review_reason || entry.reviewer_note || entry.reviewer_actor);
      }
      if (timelineFilter === "conflicts_only") {
        return entry.event === "promotion_conflicted" || entry.event === "resolution_kept_current";
      }
      return true;
    });

  return (
    <main
      className="min-h-screen px-6 py-8 md:px-10"
      style={{ background: "linear-gradient(180deg, var(--color-bg) 0%, var(--color-main-bg) 100%)" }}
    >
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <section
          className="rounded-[28px] border px-6 py-6 shadow-sm"
          style={{
            background: "var(--color-surface)",
            borderColor: "var(--color-border)",
            boxShadow: "var(--shadow-lg)",
          }}
        >
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="max-w-3xl">
              <p
                className="mb-2 text-xs font-semibold uppercase tracking-[0.24em]"
                style={{ color: "var(--color-accent)" }}
              >
                {isReviewMode ? "Review Queue" : "Debug Workspace"}
              </p>
              <h1
                className="text-3xl font-semibold md:text-4xl"
                style={{ color: "var(--color-text)", fontFamily: "\"Instrument Serif\", serif" }}
              >
                {isReviewMode ? "Y-CRM Review Workspace" : "Y-CRM Context Builder"}
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-7" style={{ color: "var(--color-text-secondary)" }}>
                {isReviewMode
                  ? "從正常工作流帶入 session 後，這裡可以直接延續 Y-CRM learning draft 的 review、promotion、conflict compare 與 resolution。需要更深的技術細節時，下面也保留完整 session snapshot 與 planner 資訊。"
                  : "直接輸入一句需求，按一下就能看到目前 builder 會如何分類、抓哪些上下文、要不要 live query、要不要升級成跨系統 handoff。"}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <StatusChip
                label={bootLoading ? "Loading route..." : isReviewMode ? "Review route ready" : "Debug route ready"}
                tone={bootLoading ? "warning" : "success"}
              />
              <StatusChip
                label={plan?.decision?.intent ? `Intent: ${plan.decision.intent}` : "Intent: sample"}
                tone="accent"
              />
              <StatusChip
                label={plan?.decision?.should_route_to_ycrm ? "Route: Y-CRM" : "Route: not Y-CRM"}
                tone={plan?.decision?.should_route_to_ycrm ? "success" : "neutral"}
              />
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.25fr)]">
          <div
            className="rounded-[28px] border p-6 shadow-sm"
            style={{
              background: "var(--color-surface)",
              borderColor: "var(--color-border)",
              boxShadow: "var(--shadow-md)",
            }}
          >
            <div className="mb-5">
              <h2 className="text-lg font-semibold" style={{ color: "var(--color-text)" }}>
                Builder Input
              </h2>
              <p className="mt-2 text-sm leading-6" style={{ color: "var(--color-text-secondary)" }}>
                這一版先提供最常用的 3 個欄位。後續如果你要，我們再把 `runtime_state` overrides 也放到 UI 裡。
              </p>
            </div>

            <div className="mb-5 flex flex-wrap gap-2">
              {SAMPLE_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  className="cursor-pointer rounded-full border px-3 py-1.5 text-xs transition-colors"
                  style={{
                    background: "var(--color-accent-light)",
                    color: "var(--color-accent)",
                    borderColor: "rgba(0, 101, 162, 0.18)",
                  }}
                  onClick={() => setForm((prev) => ({ ...prev, user_message: prompt }))}
                >
                  Sample
                </button>
              ))}
            </div>

            <div className="space-y-5">
              <label className="block">
                <span className="mb-2 block text-sm font-medium" style={{ color: "var(--color-text)" }}>
                  User message
                </span>
                <textarea
                  aria-label="User message"
                  value={form.user_message}
                  onChange={(event) => setForm((prev) => ({ ...prev, user_message: event.target.value }))}
                  rows={8}
                  className="w-full resize-y rounded-2xl border px-4 py-3 text-sm leading-6 outline-none"
                  style={{
                    background: "var(--color-main-bg)",
                    borderColor: "var(--color-border)",
                    color: "var(--color-text)",
                  }}
                  placeholder="輸入你想測試的 Y-CRM 問題..."
                />
              </label>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-sm font-medium" style={{ color: "var(--color-text)" }}>
                    Current system hint
                  </span>
                  <input
                    aria-label="Current system hint"
                    value={form.current_system_hint}
                    onChange={(event) => setForm((prev) => ({ ...prev, current_system_hint: event.target.value }))}
                    className="w-full rounded-2xl border px-4 py-3 text-sm outline-none"
                    style={{
                      background: "var(--color-main-bg)",
                      borderColor: "var(--color-border)",
                      color: "var(--color-text)",
                    }}
                    placeholder="例如 ycrm"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-medium" style={{ color: "var(--color-text)" }}>
                    Requested workspace
                  </span>
                  <input
                    aria-label="Requested workspace"
                    value={form.requested_workspace}
                    onChange={(event) => setForm((prev) => ({ ...prev, requested_workspace: event.target.value }))}
                    className="w-full rounded-2xl border px-4 py-3 text-sm outline-none"
                    style={{
                      background: "var(--color-main-bg)",
                      borderColor: "var(--color-border)",
                      color: "var(--color-text)",
                    }}
                    placeholder="例如 workspace_3jox..."
                  />
                </label>
              </div>

              <div
                className="rounded-2xl border px-4 py-4 text-sm leading-6"
                style={{
                  background: "rgba(217, 119, 6, 0.06)",
                  borderColor: "rgba(217, 119, 6, 0.18)",
                  color: "var(--color-text-secondary)",
                }}
              >
                <p className="mb-1 font-semibold" style={{ color: "var(--color-text)" }}>
                  Promotion safety check
                </p>
                <p>
                  `Promote Wiki Draft Files` 會先檢查頁面是不是仍然像系統產生的 draft。若頁面看起來已被人工整理，或已由別的 session 升格過，系統會停下來並列出 conflict，不會直接覆蓋。
                </p>
              </div>

              <label className="block">
                <span className="mb-2 block text-sm font-medium" style={{ color: "var(--color-text)" }}>
                  Web session ID
                </span>
                <div className="flex flex-col gap-3 md:flex-row">
                  <input
                    aria-label="Web session ID"
                    value={form.session_id}
                    onChange={(event) => setForm((prev) => ({ ...prev, session_id: event.target.value }))}
                    className="w-full rounded-2xl border px-4 py-3 text-sm outline-none"
                    style={{
                      background: "var(--color-main-bg)",
                      borderColor: "var(--color-border)",
                      color: "var(--color-text)",
                    }}
                    placeholder="例如 2f2d8f4d-..."
                  />
                  <Button variant="outline" onClick={() => void handleLoadSessionPreflight()} disabled={isPending || bootLoading}>
                    Load Session Preflight
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => void handleLoadSessionPreflight("reload")}
                    disabled={isPending || bootLoading || !sessionResult}
                  >
                    Reload Session Snapshot
                  </Button>
                  <Button variant="outline" onClick={() => void handleGenerateLearningDraft()} disabled={isPending || bootLoading || !sessionResult}>
                    Generate Learning Draft
                  </Button>
                  <Button variant="outline" onClick={() => void handleWriteWikiDraftFiles()} disabled={isPending || bootLoading || !learningDraft}>
                    Write Wiki Draft Files
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => void handlePromoteWikiDraftFiles()}
                    disabled={isPending || bootLoading || !learningDraft || learningDraft.writeback?.status === "not_written"}
                  >
                    Promote Wiki Draft Files
                  </Button>
                </div>
              </label>

              <div className="flex flex-wrap gap-3">
                <Button onClick={() => void handleSubmit()} disabled={isPending || bootLoading}>
                  {isPending ? "Building..." : "Run Builder"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setForm({
                    user_message: SAMPLE_PROMPTS[0],
                    current_system_hint: "ycrm",
                    requested_workspace: "",
                    session_id: "",
                    force_regenerate: false,
                    overwrite_writeback: false,
                    review_reason: "",
                    reviewer_note: "",
                    reviewer_actor: "",
                  })}
                >
                  Reset
                </Button>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label
                  className="flex items-start gap-3 rounded-2xl border px-4 py-3"
                  style={{
                    background: "var(--color-main-bg)",
                    borderColor: "var(--color-border)",
                  }}
                >
                  <input
                    aria-label="Force regenerate learning draft"
                    type="checkbox"
                    checked={form.force_regenerate}
                    onChange={(event) => setForm((prev) => ({ ...prev, force_regenerate: event.target.checked }))}
                    className="mt-1"
                  />
                  <span>
                    <span className="block text-sm font-medium" style={{ color: "var(--color-text)" }}>
                      Force regenerate learning draft
                    </span>
                    <span className="mt-1 block text-xs leading-6" style={{ color: "var(--color-text-secondary)" }}>
                      預設會優先重用同一個 session 已存在的 draft，只有你明確勾選時才重新生成。
                    </span>
                  </span>
                </label>

                <label
                  className="flex items-start gap-3 rounded-2xl border px-4 py-3"
                  style={{
                    background: "var(--color-main-bg)",
                    borderColor: "var(--color-border)",
                  }}
                >
                  <input
                    aria-label="Overwrite existing wiki draft files"
                    type="checkbox"
                    checked={form.overwrite_writeback}
                    onChange={(event) => setForm((prev) => ({ ...prev, overwrite_writeback: event.target.checked }))}
                    className="mt-1"
                  />
                  <span>
                    <span className="block text-sm font-medium" style={{ color: "var(--color-text)" }}>
                      Overwrite existing wiki draft files
                    </span>
                    <span className="mt-1 block text-xs leading-6" style={{ color: "var(--color-text-secondary)" }}>
                      預設不會覆蓋既有 draft 檔。只有你明確勾選時，writeback 才會覆蓋同路徑檔案。
                    </span>
                  </span>
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <label className="block">
                  <span className="mb-2 block text-sm font-medium" style={{ color: "var(--color-text)" }}>
                    Reviewer identity
                  </span>
                  <input
                    aria-label="Reviewer identity"
                    value={form.reviewer_actor}
                    onChange={(event) => setForm((prev) => ({ ...prev, reviewer_actor: event.target.value }))}
                    className="w-full rounded-2xl border px-4 py-3 text-sm outline-none"
                    style={{
                      background: "var(--color-main-bg)",
                      borderColor: "var(--color-border)",
                      color: "var(--color-text)",
                    }}
                    placeholder="例如：YM / Sales Ops / Dench Reviewer"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-medium" style={{ color: "var(--color-text)" }}>
                    Review reason
                  </span>
                  <input
                    aria-label="Review reason"
                    value={form.review_reason}
                    onChange={(event) => setForm((prev) => ({ ...prev, review_reason: event.target.value }))}
                    className="w-full rounded-2xl border px-4 py-3 text-sm outline-none"
                    style={{
                      background: "var(--color-main-bg)",
                      borderColor: "var(--color-border)",
                      color: "var(--color-text)",
                    }}
                    placeholder="例如：這頁已人工整理，先保留現況"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-medium" style={{ color: "var(--color-text)" }}>
                    Reviewer note
                  </span>
                  <textarea
                    aria-label="Reviewer note"
                    value={form.reviewer_note}
                    onChange={(event) => setForm((prev) => ({ ...prev, reviewer_note: event.target.value }))}
                    rows={3}
                    className="w-full resize-y rounded-2xl border px-4 py-3 text-sm leading-6 outline-none"
                    style={{
                      background: "var(--color-main-bg)",
                      borderColor: "var(--color-border)",
                      color: "var(--color-text)",
                    }}
                    placeholder="可選填這次 promotion 或 resolution 的人工判斷補充。"
                  />
                </label>
              </div>

              {error ? (
                <div
                  className="rounded-2xl border px-4 py-3 text-sm"
                  style={{
                    background: "rgba(220, 38, 38, 0.08)",
                    color: "var(--color-error)",
                    borderColor: "rgba(220, 38, 38, 0.18)",
                  }}
                >
                  {error}
                </div>
              ) : null}

              {sessionError ? (
                <div
                  className="rounded-2xl border px-4 py-3 text-sm"
                  style={{
                    background: "rgba(217, 119, 6, 0.08)",
                    color: "var(--color-warning)",
                    borderColor: "rgba(217, 119, 6, 0.18)",
                  }}
                >
                  {sessionError}
                </div>
              ) : null}

              {sessionInfo ? (
                <div
                  className="rounded-2xl border px-4 py-3 text-sm"
                  style={{
                    background: "rgba(22, 163, 74, 0.08)",
                    color: "var(--color-success)",
                    borderColor: "rgba(22, 163, 74, 0.18)",
                  }}
                >
                  {sessionInfo}
                </div>
              ) : null}

              {learningError ? (
                <div
                  className="rounded-2xl border px-4 py-3 text-sm"
                  style={{
                    background: "rgba(220, 38, 38, 0.08)",
                    color: "var(--color-error)",
                    borderColor: "rgba(220, 38, 38, 0.18)",
                  }}
                >
                  {learningError}
                </div>
              ) : null}

              {writebackError ? (
                <div
                  className="rounded-2xl border px-4 py-3 text-sm"
                  style={{
                    background: "rgba(220, 38, 38, 0.08)",
                    color: "var(--color-error)",
                    borderColor: "rgba(220, 38, 38, 0.18)",
                  }}
                >
                  {writebackError}
                </div>
              ) : null}

              {promotionError ? (
                <div
                  className="rounded-2xl border px-4 py-3 text-sm"
                  style={{
                    background: "rgba(220, 38, 38, 0.08)",
                    color: "var(--color-error)",
                    borderColor: "rgba(220, 38, 38, 0.18)",
                  }}
                >
                  {promotionError}
                </div>
              ) : null}

              {resolutionError ? (
                <div
                  className="rounded-2xl border px-4 py-3 text-sm"
                  style={{
                    background: "rgba(220, 38, 38, 0.08)",
                    color: "var(--color-error)",
                    borderColor: "rgba(220, 38, 38, 0.18)",
                  }}
                >
                  {resolutionError}
                </div>
              ) : null}
            </div>
          </div>

          <div className="flex flex-col gap-6">
            <section
              className="rounded-[28px] border p-6 shadow-sm"
              style={{
                background: "var(--color-surface)",
                borderColor: "var(--color-border)",
                boxShadow: "var(--shadow-md)",
              }}
            >
              <div className="mb-5">
                <h2 className="text-lg font-semibold" style={{ color: "var(--color-text)" }}>
                  Plan Summary
                </h2>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <SummaryCard label="Intent" value={plan?.decision?.intent || "-"} />
                <SummaryCard label="Confidence" value={plan?.decision?.confidence || "-"} />
                <SummaryCard
                  label="Route"
                  value={plan?.decision?.should_route_to_ycrm ? "Y-CRM" : "No"}
                />
                <SummaryCard
                  label="Cross-system"
                  value={result?.plan?.handoff?.cross_system ? "Yes" : "No"}
                />
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                {warnings.length === 0 ? <StatusChip label="No warnings" tone="success" /> : warnings.map((warning) => (
                  <StatusChip key={warning} label={warning} tone="warning" />
                ))}
                {blockers.map((blocker) => (
                  <StatusChip key={blocker} label={blocker} tone="error" />
                ))}
                {targets.map((target) => (
                  <StatusChip key={target} label={`handoff:${target}`} tone="accent" />
                ))}
              </div>
            </section>

            <section
              className="rounded-[28px] border p-6 shadow-sm"
              style={{
                background: "var(--color-surface)",
                borderColor: "var(--color-border)",
                boxShadow: "var(--shadow-md)",
              }}
            >
              <div className="mb-4">
                <h2 className="text-lg font-semibold" style={{ color: "var(--color-text)" }}>
                  Latest Plan JSON
                </h2>
              </div>
              <JsonPanel data={result?.plan ?? result?.sample_output ?? { loading: bootLoading }} />
            </section>

            <section
              className="rounded-[28px] border p-6 shadow-sm"
              style={{
                background: "var(--color-surface)",
                borderColor: "var(--color-border)",
                boxShadow: "var(--shadow-md)",
              }}
            >
              <div className="mb-4">
                <h2 className="text-lg font-semibold" style={{ color: "var(--color-text)" }}>
                  Effective Input
                </h2>
              </div>
              <JsonPanel data={result?.input ?? result?.defaults ?? form} />
            </section>

            <section
              className="rounded-[28px] border p-6 shadow-sm"
              style={{
                background: "var(--color-surface)",
                borderColor: "var(--color-border)",
                boxShadow: "var(--shadow-md)",
              }}
            >
              <div className="mb-4">
                <h2 className="text-lg font-semibold" style={{ color: "var(--color-text)" }}>
                  Latest Session Preflight
                </h2>
                <p className="mt-2 text-sm leading-6" style={{ color: "var(--color-text-secondary)" }}>
                  輸入 web session ID 後，這裡會顯示真正寫進 session metadata 的最新 planner preflight。
                </p>
              </div>

              {sessionPreflight ? (
                <div className="space-y-5">
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <SummaryCard label="Session" value={sessionResult?.session?.id || sessionResult?.id || "-"} />
                    <SummaryCard label="Planner state" value={sessionPreflight.validationState || "heuristic"} />
                    <SummaryCard label="Intent" value={sessionPreflight.intent || "-"} />
                    <SummaryCard label="Route" value={sessionPreflight.shouldRouteToYcrm ? "Y-CRM" : "No"} />
                    <SummaryCard label="Workspace" value={sessionPreflight.workspaceId || "-"} />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <StatusChip
                      label={
                        sessionPreflight.validationState === "validated"
                          ? "Validated planner state"
                          : "Advisory planner state"
                      }
                      tone={sessionPreflight.validationState === "validated" ? "success" : "warning"}
                    />
                    {(sessionPreflight.warnings ?? []).map((warning) => (
                      <StatusChip key={warning} label={warning} tone="warning" />
                    ))}
                    {(sessionPreflight.blockers ?? []).map((blocker) => (
                      <StatusChip key={blocker} label={blocker} tone="error" />
                    ))}
                    {(sessionPreflight.targetSystems ?? []).map((target) => (
                      <StatusChip key={target} label={`handoff:${target}`} tone="accent" />
                    ))}
                    {(sessionPreflight.warnings ?? []).length === 0 && (sessionPreflight.blockers ?? []).length === 0
                      ? <StatusChip label="No session warnings" tone="success" />
                      : null}
                  </div>
                  <JsonPanel data={sessionPreflight} />
                </div>
              ) : (
                <div
                  className="rounded-2xl border px-4 py-4 text-sm"
                  style={{
                    background: "var(--color-main-bg)",
                    borderColor: "var(--color-border)",
                    color: "var(--color-text-secondary)",
                  }}
                >
                  Session preflight 尚未載入。先送一則 chat，或輸入一個已存在的 web session ID 來查看。
                </div>
              )}
            </section>

            <section
              className="rounded-[28px] border p-6 shadow-sm"
              style={{
                background: "var(--color-surface)",
                borderColor: "var(--color-border)",
                boxShadow: "var(--shadow-md)",
              }}
            >
              <div className="mb-4">
                <h2 className="text-lg font-semibold" style={{ color: "var(--color-text)" }}>
                  Latest Session Context Pack
                </h2>
                <p className="mt-2 text-sm leading-6" style={{ color: "var(--color-text-secondary)" }}>
                  這裡會顯示真正寫進 session metadata 的 Y-CRM context pack，方便你看這次 chat 前置到底帶了哪些 read-first、wiki、live steps 與 execution hints。
                </p>
              </div>

              {sessionContextPack ? (
                <div className="space-y-5">
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <SummaryCard label="Planner Intent" value={sessionContextPack.planner?.intent || "-"} />
                    <SummaryCard label="Read First" value={String(sessionContextPack.read_first?.length ?? 0)} />
                    <SummaryCard label="Live Steps" value={String(sessionContextPack.live_query_steps?.length ?? 0)} />
                    <SummaryCard label="Hints" value={String(sessionContextPack.execution_hints?.length ?? 0)} />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(sessionContextPack.live_query_steps ?? []).map((step) => (
                      <StatusChip key={step} label={`live:${step}`} tone="accent" />
                    ))}
                    {(sessionContextPack.memory_keys ?? []).map((memoryKey) => (
                      <StatusChip key={memoryKey} label={`memory:${memoryKey}`} tone="neutral" />
                    ))}
                    {(sessionContextPack.live_query_steps ?? []).length === 0 && (sessionContextPack.memory_keys ?? []).length === 0
                      ? <StatusChip label="No stored pack steps" tone="success" />
                      : null}
                  </div>
                  <JsonPanel data={sessionContextPack} />
                </div>
              ) : (
                <div
                  className="rounded-2xl border px-4 py-4 text-sm"
                  style={{
                    background: "var(--color-main-bg)",
                    borderColor: "var(--color-border)",
                    color: "var(--color-text-secondary)",
                  }}
                >
                  Session context pack 尚未載入。先送一則 Y-CRM chat，或輸入一個已存在的 web session ID 來查看。
                </div>
              )}
            </section>

            <section
              className="rounded-[28px] border p-6 shadow-sm"
              style={{
                background: "var(--color-surface)",
                borderColor: "var(--color-border)",
                boxShadow: "var(--shadow-md)",
              }}
            >
              <div className="mb-4">
                <h2 className="text-lg font-semibold" style={{ color: "var(--color-text)" }}>
                  Latest Session Learning Draft
                </h2>
                <p className="mt-2 text-sm leading-6" style={{ color: "var(--color-text-secondary)" }}>
                  這一版先安全地產生 draft，並把結果存回 session metadata，不會自動寫回 wiki 或 memory。你可以先看 session 是否值得沉澱，再決定之後要不要做自動化。
                </p>
              </div>

              {learningDraft ? (
                <div className="space-y-5">
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <SummaryCard label="Status" value={learningDraft.status || "-"} />
                    <SummaryCard label="Focus" value={learningDraft.learning_focus || "-"} />
                    <SummaryCard label="Wiki Drafts" value={String(learningDraft.drafts?.wiki?.length ?? 0)} />
                    <SummaryCard label="Memory Drafts" value={String(learningDraft.drafts?.memory?.length ?? 0)} />
                  </div>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <SummaryCard label="Writeback Files" value={String(learningDraft.writeback?.files?.length ?? 0)} />
                    <SummaryCard label="Skipped Files" value={String(learningDraft.writeback?.skipped_files?.length ?? 0)} />
                    <SummaryCard label="Draft Source" value={learningDraft.meta?.source || "-"} />
                    <SummaryCard label="Updated" value={learningDraft.writeback?.updated_at ? new Date(learningDraft.writeback.updated_at).toLocaleString() : "-"} />
                  </div>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <SummaryCard label="Approved Via" value={learningDraft.writeback?.approved_via || "-"} />
                    <SummaryCard label="Approved At" value={learningDraft.writeback?.approved_at ? new Date(learningDraft.writeback.approved_at).toLocaleString() : "-"} />
                    <SummaryCard label="Promoted Files" value={String(learningDraft.writeback?.promoted_files?.length ?? 0)} />
                    <SummaryCard label="Promotion Skips" value={String(learningDraft.writeback?.promotion_skipped_files?.length ?? 0)} />
                    <SummaryCard label="Promotion Conflicts" value={String(learningDraft.writeback?.promotion_conflict_files?.length ?? 0)} />
                    <SummaryCard label="Resolution" value={learningDraft.writeback?.resolution_action || "-"} />
                    <SummaryCard label="Resolved At" value={learningDraft.writeback?.resolved_at ? new Date(learningDraft.writeback.resolved_at).toLocaleString() : "-"} />
                    <SummaryCard label="History Events" value={String(learningHistory.length)} />
                    <SummaryCard label="Review Reason" value={learningDraft.writeback?.review_reason || "-"} />
                    <SummaryCard label="Reviewer" value={learningDraft.writeback?.reviewer_actor || "-"} />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <StatusChip
                      label={learningDraft.meta?.cached ? "Cache hit" : "Fresh draft"}
                      tone={learningDraft.meta?.cached ? "warning" : "success"}
                    />
                    <StatusChip
                      label={`Mode:${learningDraft.meta?.generation_mode || "unknown"}`}
                      tone="accent"
                    />
                    <StatusChip
                      label={`Writeback:${learningDraft.writeback?.status || "not_written"}`}
                      tone={
                        learningDraft.writeback?.status === "written" || learningDraft.writeback?.status === "promoted"
                          ? "success"
                          : learningDraft.writeback?.status === "promotion_conflicted"
                            ? "warning"
                            : "neutral"
                      }
                    />
                    <StatusChip label={reviewState.label} tone={reviewState.tone} />
                  </div>
                  {reviewGuidance ? (
                    <div
                      className="rounded-2xl border px-4 py-4 text-sm leading-6"
                      style={{
                        background:
                          reviewGuidance.tone === "warning"
                            ? "rgba(217, 119, 6, 0.08)"
                            : reviewGuidance.tone === "success"
                              ? "rgba(22, 163, 74, 0.08)"
                              : "var(--color-main-bg)",
                        borderColor:
                          reviewGuidance.tone === "warning"
                            ? "rgba(217, 119, 6, 0.18)"
                            : reviewGuidance.tone === "success"
                              ? "rgba(22, 163, 74, 0.18)"
                              : "var(--color-border)",
                        color:
                          reviewGuidance.tone === "warning"
                            ? "var(--color-warning)"
                            : reviewGuidance.tone === "success"
                              ? "var(--color-success)"
                              : "var(--color-text-secondary)",
                      }}
                    >
                      <p className="mb-1 font-semibold" style={{ color: "var(--color-text)" }}>
                        {reviewGuidance.title}
                      </p>
                      <p>{reviewGuidance.body}</p>
                    </div>
                  ) : null}
                  <div
                    className="rounded-2xl border px-4 py-4 text-sm leading-6"
                    style={{
                      background: "var(--color-main-bg)",
                      borderColor: "var(--color-border)",
                      color: "var(--color-text-secondary)",
                    }}
                  >
                    {learningDraft.summary || "No summary"}
                  </div>
                  {learningDraft.writeback?.review_reason || learningDraft.writeback?.reviewer_note || learningDraft.writeback?.reviewer_actor ? (
                    <div
                      className="rounded-2xl border px-4 py-4 text-sm leading-6"
                      style={{
                        background: "var(--color-main-bg)",
                        borderColor: "var(--color-border)",
                        color: "var(--color-text-secondary)",
                      }}
                    >
                      <p className="mb-1 font-semibold" style={{ color: "var(--color-text)" }}>
                        Review Context
                      </p>
                      {learningDraft.writeback?.reviewer_actor ? (
                        <p><span style={{ color: "var(--color-text)" }}>Reviewer:</span> {learningDraft.writeback.reviewer_actor}</p>
                      ) : null}
                      {learningDraft.writeback?.review_reason ? (
                        <p><span style={{ color: "var(--color-text)" }}>Reason:</span> {learningDraft.writeback.review_reason}</p>
                      ) : null}
                      {learningDraft.writeback?.reviewer_note ? (
                        <p className="mt-2"><span style={{ color: "var(--color-text)" }}>Note:</span> {learningDraft.writeback.reviewer_note}</p>
                      ) : null}
                    </div>
                  ) : null}
                  {learningHistory.length > 0 ? (
                    <div
                      className="rounded-2xl border px-4 py-4"
                      style={{
                        background: "var(--color-main-bg)",
                        borderColor: "var(--color-border)",
                      }}
                    >
                      <div className="mb-4">
                        <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
                          Learning Timeline
                        </p>
                        <p className="mt-1 text-sm leading-6" style={{ color: "var(--color-text-secondary)" }}>
                          這裡會留下這個 session 的 learning draft 曾經發生過哪些關鍵動作，方便之後回頭看 promotion、conflict 與人工 resolution 的脈絡。
                        </p>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="cursor-pointer rounded-full border px-3 py-1.5 text-xs transition-colors"
                            style={{
                              background: timelineFilter === "all" ? "var(--color-accent-light)" : "var(--color-surface)",
                              color: timelineFilter === "all" ? "var(--color-accent)" : "var(--color-text-secondary)",
                              borderColor: timelineFilter === "all" ? "rgba(0, 101, 162, 0.18)" : "var(--color-border)",
                            }}
                            onClick={() => setTimelineFilter("all")}
                          >
                            Show all events
                          </button>
                          <button
                            type="button"
                            className="cursor-pointer rounded-full border px-3 py-1.5 text-xs transition-colors"
                            style={{
                              background: timelineFilter === "reviewed_only" ? "rgba(22, 163, 74, 0.1)" : "var(--color-surface)",
                              color: timelineFilter === "reviewed_only" ? "var(--color-success)" : "var(--color-text-secondary)",
                              borderColor: timelineFilter === "reviewed_only" ? "rgba(22, 163, 74, 0.18)" : "var(--color-border)",
                            }}
                            onClick={() => setTimelineFilter("reviewed_only")}
                          >
                            Show reviewed only
                          </button>
                          <button
                            type="button"
                            className="cursor-pointer rounded-full border px-3 py-1.5 text-xs transition-colors"
                            style={{
                              background: timelineFilter === "conflicts_only" ? "rgba(217, 119, 6, 0.1)" : "var(--color-surface)",
                              color: timelineFilter === "conflicts_only" ? "var(--color-warning)" : "var(--color-text-secondary)",
                              borderColor: timelineFilter === "conflicts_only" ? "rgba(217, 119, 6, 0.18)" : "var(--color-border)",
                            }}
                            onClick={() => setTimelineFilter("conflicts_only")}
                          >
                            Show conflicts only
                          </button>
                        </div>
                      </div>
                      <div className="mb-4 flex flex-wrap gap-2">
                        <StatusChip label={`Visible events:${filteredLearningHistory.length}`} tone="neutral" />
                        <StatusChip label={`Total events:${learningHistory.length}`} tone="neutral" />
                      </div>
                      <div className="space-y-3">
                        {filteredLearningHistory.map((entry, index) => (
                          <div
                            key={`${entry.event ?? "event"}-${entry.at ?? index}-${index}`}
                            className="rounded-2xl border px-4 py-4"
                            style={{
                              background: "var(--color-surface)",
                              borderColor: "var(--color-border)",
                            }}
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <StatusChip label={entry.event || "unknown_event"} tone={entry.tone || "neutral"} />
                              <StatusChip
                                label={entry.at ? new Date(entry.at).toLocaleString() : "Unknown time"}
                                tone="neutral"
                              />
                            </div>
                            <p className="mt-3 text-sm leading-6" style={{ color: "var(--color-text)" }}>
                              {entry.summary || "No history summary."}
                            </p>
                            {entry.review_reason || entry.reviewer_note || entry.reviewer_actor ? (
                              <div className="mt-3 space-y-2 text-sm leading-6" style={{ color: "var(--color-text-secondary)" }}>
                                {entry.reviewer_actor ? (
                                  <div><span style={{ color: "var(--color-text)" }}>Reviewer:</span> {entry.reviewer_actor}</div>
                                ) : null}
                                {entry.review_reason ? (
                                  <div><span style={{ color: "var(--color-text)" }}>Reason:</span> {entry.review_reason}</div>
                                ) : null}
                                {entry.reviewer_note ? (
                                  <div><span style={{ color: "var(--color-text)" }}>Note:</span> {entry.reviewer_note}</div>
                                ) : null}
                              </div>
                            ) : null}
                            {(entry.files ?? []).length > 0 ? (
                              <div className="mt-3 flex flex-wrap gap-2">
                                {(entry.files ?? []).map((filePath) => (
                                  <StatusChip key={`${entry.event}-${filePath}`} label={filePath} tone="accent" />
                                ))}
                              </div>
                            ) : null}
                          </div>
                        ))}
                        {filteredLearningHistory.length === 0 ? (
                          <div
                            className="rounded-2xl border px-4 py-4 text-sm leading-6"
                            style={{
                              background: "var(--color-surface)",
                              borderColor: "var(--color-border)",
                              color: "var(--color-text-secondary)",
                            }}
                          >
                            目前這個 filter 底下沒有符合的 timeline 事件。
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    {(learningDraft.evidence?.live_query_steps ?? []).map((step) => (
                      <StatusChip key={step} label={`evidence:${step}`} tone="accent" />
                    ))}
                    {(learningDraft.meta?.token_guardrails ?? []).map((guardrail) => (
                      <StatusChip key={guardrail} label={`guardrail:${guardrail}`} tone="neutral" />
                    ))}
                    {(learningDraft.evidence?.live_query_steps ?? []).length === 0
                      ? <StatusChip label="No live-step evidence" tone="neutral" />
                      : null}
                  </div>
                  {(learningDraft.writeback?.files?.length ?? 0) > 0 ? (
                    <div
                      className="rounded-2xl border px-4 py-4 text-sm leading-7"
                      style={{
                        background: "var(--color-main-bg)",
                        borderColor: "var(--color-border)",
                        color: "var(--color-text-secondary)",
                      }}
                    >
                      <p className="mb-2 text-sm font-semibold" style={{ color: "var(--color-text)" }}>
                        Written Wiki Draft Files
                      </p>
                      {(learningDraft.writeback?.files ?? []).map((filePath) => (
                        <div key={filePath}>{filePath}</div>
                      ))}
                    </div>
                  ) : null}
                  {(learningDraft.writeback?.skipped_files?.length ?? 0) > 0 ? (
                    <div
                      className="rounded-2xl border px-4 py-4 text-sm leading-7"
                      style={{
                        background: "rgba(217, 119, 6, 0.08)",
                        borderColor: "rgba(217, 119, 6, 0.18)",
                        color: "var(--color-warning)",
                      }}
                    >
                      <p className="mb-2 text-sm font-semibold" style={{ color: "var(--color-text)" }}>
                        Skipped Existing Draft Files
                      </p>
                      {(learningDraft.writeback?.skipped_files ?? []).map((filePath) => (
                        <div key={filePath}>{filePath}</div>
                      ))}
                    </div>
                  ) : null}
                  {(learningDraft.writeback?.promoted_files?.length ?? 0) > 0 ? (
                    <div
                      className="rounded-2xl border px-4 py-4 text-sm leading-7"
                      style={{
                        background: "rgba(22, 163, 74, 0.08)",
                        borderColor: "rgba(22, 163, 74, 0.18)",
                        color: "var(--color-success)",
                      }}
                    >
                      <p className="mb-2 text-sm font-semibold" style={{ color: "var(--color-text)" }}>
                        Promoted Wiki Files
                      </p>
                      {(learningDraft.writeback?.promoted_files ?? []).map((filePath) => (
                        <div key={filePath}>{filePath}</div>
                      ))}
                      {(learningResult?.promotion?.updated_supporting_files ?? []).map((filePath) => (
                        <div key={filePath}>registry:{filePath}</div>
                      ))}
                    </div>
                  ) : null}
                  {(learningDraft.writeback?.promotion_skipped_files?.length ?? 0) > 0 ? (
                    <div
                      className="rounded-2xl border px-4 py-4 text-sm leading-7"
                      style={{
                        background: "rgba(217, 119, 6, 0.08)",
                        borderColor: "rgba(217, 119, 6, 0.18)",
                        color: "var(--color-warning)",
                      }}
                    >
                      <p className="mb-2 text-sm font-semibold" style={{ color: "var(--color-text)" }}>
                        Promotion Skipped Files
                      </p>
                      {(learningDraft.writeback?.promotion_skipped_files ?? []).map((filePath) => (
                        <div key={filePath}>{filePath}</div>
                      ))}
                    </div>
                  ) : null}
                  {(learningDraft.writeback?.promotion_conflict_files?.length ?? 0) > 0 ? (
                    <div
                      className="rounded-2xl border px-4 py-4 text-sm leading-7"
                      style={{
                        background: "rgba(217, 119, 6, 0.08)",
                        borderColor: "rgba(217, 119, 6, 0.18)",
                        color: "var(--color-warning)",
                      }}
                    >
                      <p className="mb-2 text-sm font-semibold" style={{ color: "var(--color-text)" }}>
                        Promotion Conflicts
                      </p>
                      <p className="mb-2">
                        這些頁面目前看起來已不只是單純 draft，或已被其他 session 升格過，所以系統沒有自動 promotion。
                      </p>
                      {(learningDraft.writeback?.promotion_conflict_files ?? []).map((filePath) => (
                        <div key={filePath}>{filePath}</div>
                      ))}
                    </div>
                  ) : null}
                  {(learningResult?.promotion?.conflict_details?.length ?? 0) > 0 ? (
                    <div className="space-y-4">
                      <div
                        className="rounded-2xl border px-4 py-4 text-sm leading-6"
                        style={{
                          background: "var(--color-main-bg)",
                          borderColor: "var(--color-border)",
                          color: "var(--color-text-secondary)",
                        }}
                      >
                        <p className="mb-1 font-semibold" style={{ color: "var(--color-text)" }}>
                          Conflict Compare View
                        </p>
                        <p>
                          這裡會把目前頁面的狀態，和本次 learning draft 想推進的內容並排整理，方便你人工判斷要保留哪一版。
                        </p>
                        <div className="mt-4 flex flex-wrap gap-3">
                          <Button variant="outline" onClick={() => void handleKeepCurrentPage()} disabled={isPending}>
                            Keep Current Page
                          </Button>
                          <Button onClick={() => void handleForcePromoteThisDraft()} disabled={isPending}>
                            Force Promote This Draft
                          </Button>
                        </div>
                      </div>
                      {(learningResult?.promotion?.conflict_details ?? []).map((detail) => (
                        <div
                          key={detail.file_path}
                          className="grid gap-4 rounded-2xl border p-4 md:grid-cols-2"
                          style={{
                            background: "var(--color-main-bg)",
                            borderColor: "var(--color-border)",
                          }}
                        >
                          <div>
                            <p className="mb-2 text-sm font-semibold" style={{ color: "var(--color-text)" }}>
                              Current Page
                            </p>
                            <p className="text-xs uppercase tracking-[0.16em]" style={{ color: "var(--color-text-muted)" }}>
                              {detail.file_path}
                            </p>
                            <p className="mt-3 text-sm font-semibold" style={{ color: "var(--color-text)" }}>
                              {detail.current_title || "Untitled"}
                            </p>
                            <p className="mt-2 text-sm leading-6" style={{ color: "var(--color-text-secondary)" }}>
                              {detail.current_excerpt || "No readable excerpt."}
                            </p>
                            <div className="mt-3 flex flex-wrap gap-2">
                              <StatusChip
                                label={detail.reason === "different_source_session" ? "Conflict: other session" : "Conflict: manual content"}
                                tone="warning"
                              />
                              {detail.current_source_session ? (
                                <StatusChip label={`current-session:${detail.current_source_session}`} tone="neutral" />
                              ) : null}
                            </div>
                          </div>
                          <div>
                            <p className="mb-2 text-sm font-semibold" style={{ color: "var(--color-text)" }}>
                              Proposed From This Draft
                            </p>
                            <p className="text-xs uppercase tracking-[0.16em]" style={{ color: "var(--color-text-muted)" }}>
                              {detail.file_path}
                            </p>
                            <p className="mt-3 text-sm font-semibold" style={{ color: "var(--color-text)" }}>
                              {detail.proposed_title || "No proposed title"}
                            </p>
                            <div className="mt-2 space-y-1 text-sm leading-6" style={{ color: "var(--color-text-secondary)" }}>
                              {(detail.proposed_outline ?? []).length > 0 ? (
                                (detail.proposed_outline ?? []).map((item) => (
                                  <div key={item}>- {item}</div>
                                ))
                              ) : (
                                <div>No proposed outline.</div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <JsonPanel data={learningDraft} />
                </div>
              ) : (
                <div
                  className="rounded-2xl border px-4 py-4 text-sm"
                  style={{
                    background: "var(--color-main-bg)",
                    borderColor: "var(--color-border)",
                    color: "var(--color-text-secondary)",
                  }}
                >
                  Session learning draft 尚未載入。先載入一個 Y-CRM session，再按 `Generate Learning Draft`。
                </div>
              )}
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-2xl border px-4 py-4"
      style={{
        background: "var(--color-main-bg)",
        borderColor: "var(--color-border)",
      }}
    >
      <p className="text-xs uppercase tracking-[0.18em]" style={{ color: "var(--color-text-muted)" }}>
        {label}
      </p>
      <p className="mt-2 text-sm font-semibold" style={{ color: "var(--color-text)" }}>
        {value}
      </p>
    </div>
  );
}
