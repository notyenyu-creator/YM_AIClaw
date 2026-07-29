"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";

// ─── Shared types ────────────────────────────────────────────────────────────

type LearningSystem = "ycrm" | "erp" | "enms";

type WritebackStatus =
  | "not_written"
  | "written"
  | "promoted"
  | "promotion_conflicted"
  | "resolution_kept_current";

type LearningDraftSnapshot = {
  session_id?: string;
  status?: "ready" | "insufficient_context";
  learning_focus?: string;
  summary?: string;
  meta?: {
    generated_at?: number;
    generation_mode?: string;
    cached?: boolean;
    source?: string;
    token_guardrails?: string[];
  };
  writeback?: {
    status?: WritebackStatus;
    updated_at?: number | null;
    files?: string[];
    skipped_files?: string[];
    regression_files?: string[];
    regression_skipped_files?: string[];
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
    matched_keywords?: string[];
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
    regression?: Array<{
      kind?: string;
      suggested_path?: string;
      title?: string;
      question?: string;
      expected_intent?: string;
      expected_capabilities?: string[];
      required_evidence?: string[];
      guardrails?: string[];
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

type SessionResponse = {
  id?: string;
  session?: {
    plannerLearningDraft?: LearningDraftSnapshot | null;
    enmsPlannerLearningDraft?: LearningDraftSnapshot | null;
    erpPlannerLearningDraft?: LearningDraftSnapshot | null;
  };
};

// ─── System config ───────────────────────────────────────────────────────────

const SYSTEM_CONFIG: Record<
  LearningSystem,
  {
    title: string;
    accentLabel: string;
    draftKey:
      | "plannerLearningDraft"
      | "erpPlannerLearningDraft"
      | "enmsPlannerLearningDraft";
    apiBase: string;
  }
> = {
  ycrm: {
    title: "Y-CRM Learning Draft Review",
    accentLabel: "Y-CRM",
    draftKey: "plannerLearningDraft",
    apiBase: "/api/debug/ycrm-learning-draft",
  },
  erp: {
    title: "ERP Learning Draft Review",
    accentLabel: "ERP",
    draftKey: "erpPlannerLearningDraft",
    apiBase: "/api/debug/erp-learning-draft",
  },
  enms: {
    title: "EnMS Learning Draft Review",
    accentLabel: "EnMS",
    draftKey: "enmsPlannerLearningDraft",
    apiBase: "/api/internal/enms-learning-draft",
  },
};

// ─── Status pill ─────────────────────────────────────────────────────────────

function StatusPill({ status }: { status: WritebackStatus | undefined }) {
  const styles: Record<
    WritebackStatus | "fallback",
    { label: string; bg: string; color: string }
  > = {
    not_written: { label: "Not written", bg: "rgba(148,163,184,0.12)", color: "var(--color-text-muted)" },
    written: { label: "Draft ready", bg: "var(--color-accent-light)", color: "var(--color-accent)" },
    promoted: { label: "Promoted", bg: "rgba(22,163,74,0.12)", color: "var(--color-success)" },
    promotion_conflicted: { label: "Needs review", bg: "rgba(217,119,6,0.12)", color: "var(--color-warning)" },
    resolution_kept_current: { label: "Reviewed", bg: "rgba(22,163,74,0.12)", color: "var(--color-success)" },
    fallback: { label: "Unknown", bg: "rgba(148,163,184,0.12)", color: "var(--color-text-muted)" },
  };
  const s = styles[status ?? "fallback"] ?? styles.fallback;
  return (
    <span
      className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium"
      style={{ background: s.bg, color: s.color }}
    >
      {s.label}
    </span>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTimestamp(value: number | null | undefined): string {
  if (!value) {
    return "—";
  }
  try {
    return new Date(value).toLocaleString();
  } catch {
    return "—";
  }
}

// ─── Workspace ───────────────────────────────────────────────────────────────

export type LearningReviewWorkspaceProps = {
  system: LearningSystem;
  sessionId: string | null;
};

export function LearningReviewWorkspace({ system, sessionId }: LearningReviewWorkspaceProps) {
  const config = SYSTEM_CONFIG[system];
  const [draft, setDraft] = useState<LearningDraftSnapshot | null>(null);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "writeback" | "promote" | "force" | "keep">(null);
  const [reviewerActor, setReviewerActor] = useState("");
  const [reviewReason, setReviewReason] = useState("");
  const [reviewerNote, setReviewerNote] = useState("");
  const [reviewerToken, setReviewerToken] = useState("");
  const reviewerTokenRef = useRef("");
  const [feedback, setFeedback] = useState<{ tone: "success" | "warning" | "error"; message: string } | null>(null);

  const buildActionHeaders = useCallback(() => {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (system === "enms" && reviewerTokenRef.current.trim().length > 0) {
      headers.Authorization = `Bearer ${reviewerTokenRef.current.trim()}`;
    }
    return headers;
  }, [system]);

  const refetch = useCallback(async () => {
    if (!sessionId) {
      setLoadingError("Missing sessionId in URL (?sessionId=...)");
      setDraft(null);
      return;
    }
    if (system === "enms" && reviewerTokenRef.current.trim().length === 0) {
      setLoadingError(null);
      setDraft(null);
      return;
    }
    setLoadingError(null);
    try {
      const res = system === "enms"
        ? await fetch(
          `${config.apiBase}?session_id=${encodeURIComponent(sessionId)}`,
          { headers: buildActionHeaders() },
        )
        : await fetch(`/api/web-sessions/${encodeURIComponent(sessionId)}`);
      if (!res.ok) {
        setLoadingError(
          system === "enms" && (res.status === 401 || res.status === 403)
            ? `Reviewer token is invalid or unauthorized (${res.status}).`
            : `Session not found (${res.status})`,
        );
        setDraft(null);
        return;
      }
      const data = (await res.json()) as SessionResponse & {
        draft?: LearningDraftSnapshot | null;
      };
      const next = system === "enms"
        ? (data.draft ?? null)
        : (data.session?.[config.draftKey] ?? null);
      setDraft(next);
    } catch (err) {
      setLoadingError(err instanceof Error ? err.message : String(err));
    }
  }, [sessionId, system, config.apiBase, config.draftKey, buildActionHeaders]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const status = draft?.writeback?.status;
  const auditValid = reviewerActor.trim().length > 0 && reviewReason.trim().length > 0;
  const hasReviewerToken =
    system !== "enms" || reviewerToken.trim().length > 0;
  const enmsPromotionMissingGates = useMemo(() => {
    if (system !== "enms" || !draft) {
      return [];
    }

    const missing: string[] = [];
    if (draft.status !== "ready") {
      missing.push("Draft status must be ready.");
    }
    if (
      !draft.evidence?.latest_user_message ||
      !draft.evidence?.latest_assistant_reply ||
      (draft.evidence?.live_query_steps?.length ?? 0) === 0
    ) {
      missing.push("Reviewable evidence is required.");
    }
    if ((draft.drafts?.wiki?.length ?? 0) === 0) {
      missing.push("Wiki draft candidate is required.");
    }
    if ((draft.drafts?.regression?.length ?? 0) === 0) {
      missing.push("Regression case candidate is required.");
    }
    if (draft.writeback?.status !== "written") {
      missing.push("Writeback status must be written before promotion.");
    }
    if (
      (draft.writeback?.files?.length ?? 0) +
      (draft.writeback?.skipped_files?.length ?? 0) ===
      0
    ) {
      missing.push("Wiki draft artifact must be written or already exist.");
    }
    if (
      (draft.writeback?.regression_files?.length ?? 0) +
      (draft.writeback?.regression_skipped_files?.length ?? 0) ===
      0
    ) {
      missing.push("Regression case artifact must be written or already exist.");
    }
    return missing;
  }, [system, draft]);
  const canWriteback =
    hasReviewerToken && status === "not_written" && draft?.status === "ready";
  const canPromote =
    hasReviewerToken &&
    status === "written" &&
    (system !== "enms" || enmsPromotionMissingGates.length === 0);
  const canForcePromote =
    hasReviewerToken && status === "promotion_conflicted";
  const canKeepCurrent = hasReviewerToken && status === "promotion_conflicted";

  // ─── Actions ──────────────────────────────────────────────────────────────

  const performWriteback = useCallback(async () => {
    if (!sessionId) {
      return;
    }
    setBusy("writeback");
    setFeedback(null);
    try {
      const res = await fetch(`${config.apiBase}/writeback`, {
        method: "POST",
        headers: buildActionHeaders(),
        body: JSON.stringify({ session_id: sessionId }),
      });
      const body = await res.json();
      if (!res.ok) {
        setFeedback({ tone: "error", message: body.error ?? `HTTP ${res.status}` });
      } else {
        const wroteWiki = body.writeback?.files?.length ?? 0;
        const wroteRegression = body.writeback?.regression_files?.length ?? 0;
        const skippedWiki = body.writeback?.skipped_files?.length ?? 0;
        const skippedRegression = body.writeback?.regression_skipped_files?.length ?? 0;
        const wrote = wroteWiki + wroteRegression;
        const skipped = skippedWiki + skippedRegression;
        setFeedback({
          tone: wrote > 0 ? "success" : "warning",
          message:
            wrote > 0
              ? `Wrote ${wroteWiki} wiki draft file${wroteWiki === 1 ? "" : "s"} and ${wroteRegression} regression case file${wroteRegression === 1 ? "" : "s"} to disk${skipped > 0 ? `; skipped ${skipped} existing target${skipped === 1 ? "" : "s"}` : ""}.`
              : `No new draft files written (${skipped} target${skipped === 1 ? "" : "s"} already existed).`,
        });
        await refetch();
      }
    } catch (err) {
      setFeedback({ tone: "error", message: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(null);
    }
  }, [sessionId, config.apiBase, buildActionHeaders, refetch]);

  const performPromote = useCallback(
    async (force: boolean) => {
      if (!sessionId) {
        return;
      }
      setBusy(force ? "force" : "promote");
      setFeedback(null);
      try {
        const res = await fetch(`${config.apiBase}/promote`, {
          method: "POST",
          headers: buildActionHeaders(),
          body: JSON.stringify({
            session_id: sessionId,
            force_conflict_override: force,
            reviewer_actor: reviewerActor.trim(),
            review_reason: reviewReason.trim(),
            reviewer_note: reviewerNote.trim() || undefined,
          }),
        });
        const body = await res.json();
        if (!res.ok) {
          setFeedback({ tone: "error", message: body.error ?? `HTTP ${res.status}` });
        } else {
          const promoted = body.promotion?.promoted_files?.length ?? 0;
          const conflicts = body.promotion?.conflict_files?.length ?? 0;
          if (conflicts > 0) {
            setFeedback({
              tone: "warning",
              message: `${conflicts} conflict${conflicts === 1 ? "" : "s"} detected. Review and pick keep-current or force-promote.`,
            });
          } else {
            setFeedback({
              tone: "success",
              message: `Promoted ${promoted} file${promoted === 1 ? "" : "s"} into wiki/index.md + log.md.`,
            });
          }
          await refetch();
        }
      } catch (err) {
        setFeedback({ tone: "error", message: err instanceof Error ? err.message : String(err) });
      } finally {
        setBusy(null);
      }
    },
    [
      sessionId,
      config.apiBase,
      buildActionHeaders,
      refetch,
      reviewerActor,
      reviewReason,
      reviewerNote,
    ],
  );

  const performKeepCurrent = useCallback(async () => {
    if (!sessionId) {
      return;
    }
    setBusy("keep");
    setFeedback(null);
    try {
      const res = await fetch(`${config.apiBase}/resolve`, {
        method: "POST",
        headers: buildActionHeaders(),
        body: JSON.stringify({
          session_id: sessionId,
          resolution_action: "keep_current_page",
          reviewer_actor: reviewerActor.trim(),
          review_reason: reviewReason.trim(),
          reviewer_note: reviewerNote.trim() || undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setFeedback({ tone: "error", message: body.error ?? `HTTP ${res.status}` });
      } else {
        setFeedback({ tone: "success", message: "Recorded: kept current wiki page; draft marked as reviewed." });
        await refetch();
      }
    } catch (err) {
      setFeedback({ tone: "error", message: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(null);
    }
  }, [
    sessionId,
    config.apiBase,
    buildActionHeaders,
    refetch,
    reviewerActor,
    reviewReason,
    reviewerNote,
  ]);

  // ─── Render ───────────────────────────────────────────────────────────────

  const wikiDrafts = useMemo(() => draft?.drafts?.wiki ?? [], [draft]);
  const playbookDrafts = useMemo(() => draft?.drafts?.playbooks ?? [], [draft]);
  const memoryDrafts = useMemo(() => draft?.drafts?.memory ?? [], [draft]);
  const regressionDrafts = useMemo(() => draft?.drafts?.regression ?? [], [draft]);
  const history = useMemo(() => draft?.history ?? [], [draft]);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-8">
      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>
            {config.accentLabel} · Learning Review
          </p>
          <h1 className="text-2xl font-semibold" style={{ color: "var(--color-text)" }}>
            {config.title}
          </h1>
          <p className="mt-1 text-xs" style={{ color: "var(--color-text-muted)" }}>
            Session: <code>{sessionId ?? "(missing)"}</code>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill status={status} />
          <Button variant="outline" onClick={refetch} disabled={!sessionId || !hasReviewerToken}>
            Refresh
          </Button>
          {system !== "enms" && (
            <Link
              href={`/api/web-sessions/${encodeURIComponent(sessionId ?? "")}`}
              target="_blank"
              className="text-xs underline"
              style={{ color: "var(--color-text-muted)" }}
            >
              Raw session JSON
            </Link>
          )}
        </div>
      </header>

      {system === "enms" && (
        <section
          className="rounded-md border p-4"
          style={{ borderColor: "var(--color-border)" }}
        >
          <h2 className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
            Secured EnMS Review Access
          </h2>
          <p className="mt-1 text-xs" style={{ color: "var(--color-text-muted)" }}>
            EnMS learning review evidence is token-gated. The token is sent only as an Authorization header to the internal review endpoint; it is not stored in localStorage or written into the frontend bundle.
          </p>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="grow">
              <Label htmlFor="reviewer_token">Reviewer token</Label>
              <Input
                id="reviewer_token"
                type="password"
                autoComplete="off"
                value={reviewerToken}
                onChange={(e) => {
                  reviewerTokenRef.current = e.target.value;
                  setReviewerToken(e.target.value);
                }}
                placeholder="Internal EnMS review token"
              />
            </div>
            <Button
              variant="outline"
              onClick={refetch}
              disabled={!sessionId || !hasReviewerToken}
            >
              Load secured draft
            </Button>
          </div>
        </section>
      )}

      {/* Error banner */}
      {loadingError && (
        <div
          role="alert"
          className="rounded-md border px-4 py-3 text-sm"
          style={{ borderColor: "rgba(220,38,38,0.3)", background: "rgba(220,38,38,0.06)", color: "var(--color-error, #b91c1c)" }}
        >
          {loadingError}
        </div>
      )}

      {/* Feedback banner */}
      {feedback && (
        <div
          role="status"
          className="rounded-md border px-4 py-3 text-sm"
          style={{
            borderColor:
              feedback.tone === "success"
                ? "rgba(22,163,74,0.3)"
                : feedback.tone === "warning"
                  ? "rgba(217,119,6,0.3)"
                  : "rgba(220,38,38,0.3)",
            background:
              feedback.tone === "success"
                ? "rgba(22,163,74,0.06)"
                : feedback.tone === "warning"
                  ? "rgba(217,119,6,0.06)"
                  : "rgba(220,38,38,0.06)",
            color:
              feedback.tone === "success"
                ? "var(--color-success)"
                : feedback.tone === "warning"
                  ? "var(--color-warning)"
                  : "var(--color-error, #b91c1c)",
          }}
        >
          {feedback.message}
        </div>
      )}

      {/* No draft yet */}
      {system === "enms" && !draft && !loadingError && sessionId && !hasReviewerToken && (
        <div className="rounded-md border p-6 text-sm" style={{ borderColor: "var(--color-border)" }}>
          <p>Enter the internal EnMS reviewer token to load secured learning draft evidence.</p>
          <p className="mt-2" style={{ color: "var(--color-text-muted)" }}>
            This locked state avoids loading session evidence until review access is explicitly provided.
          </p>
        </div>
      )}

      {!draft && !loadingError && sessionId && (system !== "enms" || hasReviewerToken) && (
        <div className="rounded-md border p-6 text-sm" style={{ borderColor: "var(--color-border)" }}>
          <p>No learning draft persisted for this session yet.</p>
          <p className="mt-2" style={{ color: "var(--color-text-muted)" }}>
            Ask a high-value {config.accentLabel} question in chat and wait for the auto-trigger,
            or POST to <code>{config.apiBase}</code> manually.
          </p>
        </div>
      )}

      {/* Draft body */}
      {draft && (
        <>
          {/* Meta panel */}
          <section
            className="grid gap-3 rounded-md border p-4 text-xs"
            style={{ borderColor: "var(--color-border)" }}
          >
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <MetaCell label="Learning focus" value={draft.learning_focus ?? "—"} />
              <MetaCell label="Status" value={draft.status ?? "—"} />
              <MetaCell label="Generated" value={formatTimestamp(draft.meta?.generated_at)} />
              <MetaCell label="Source" value={draft.meta?.source ?? "—"} />
            </div>
            {draft.meta?.token_guardrails && draft.meta.token_guardrails.length > 0 && (
              <p style={{ color: "var(--color-text-muted)" }}>
                Token guardrails: {draft.meta.token_guardrails.join(", ")}
              </p>
            )}
            {draft.summary && <p style={{ color: "var(--color-text-muted)" }}>{draft.summary}</p>}
          </section>

          {/* Evidence */}
          {draft.evidence && (
            <section
              className="rounded-md border p-4"
              style={{ borderColor: "var(--color-border)" }}
            >
              <h2 className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
                Session Evidence
              </h2>
              <dl className="mt-3 grid gap-3 text-xs">
                <EvidenceRow label="Latest user message" value={draft.evidence.latest_user_message} />
                <EvidenceRow label="Latest assistant reply" value={draft.evidence.latest_assistant_reply} />
                {draft.evidence.matched_keywords && draft.evidence.matched_keywords.length > 0 && (
                  <EvidenceRow label="Matched keywords" value={draft.evidence.matched_keywords.join(", ")} />
                )}
                {draft.evidence.live_query_steps && draft.evidence.live_query_steps.length > 0 && (
                  <EvidenceRow label="Live query steps" value={draft.evidence.live_query_steps.join(", ")} />
                )}
              </dl>
            </section>
          )}

          {/* Draft items */}
          {(wikiDrafts.length > 0 ||
            playbookDrafts.length > 0 ||
            memoryDrafts.length > 0 ||
            regressionDrafts.length > 0) && (
            <section
              className="rounded-md border p-4"
              style={{ borderColor: "var(--color-border)" }}
            >
              <h2 className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
                Proposed Drafts
              </h2>
              {wikiDrafts.length > 0 && (
                <DraftItemList title="Wiki pages" items={wikiDrafts} fileKey="suggested_path" outlineKey="outline" />
              )}
              {playbookDrafts.length > 0 && (
                <DraftItemList
                  title="Playbooks"
                  items={playbookDrafts}
                  fileKey="suggested_path"
                  outlineKey="next_sections"
                />
              )}
              {memoryDrafts.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-semibold" style={{ color: "var(--color-text-muted)" }}>
                    Memory rules ({memoryDrafts.length})
                  </p>
                  <ul className="mt-2 space-y-1 text-xs">
                    {memoryDrafts.map((item, idx) => (
                      <li key={idx}>
                        <code>{item.key ?? "—"}</code> — {item.value ?? ""}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {regressionDrafts.length > 0 && (
                <RegressionDraftList items={regressionDrafts} />
              )}
            </section>
          )}

          {/* Conflict panel */}
          {status === "promotion_conflicted" &&
            draft.writeback?.promotion_conflict_files &&
            draft.writeback.promotion_conflict_files.length > 0 && (
              <section
                className="rounded-md border p-4"
                style={{
                  borderColor: "rgba(217,119,6,0.3)",
                  background: "rgba(217,119,6,0.04)",
                }}
              >
                <h2 className="text-sm font-semibold" style={{ color: "var(--color-warning)" }}>
                  ⚠️ Promotion conflicts
                </h2>
                <ul className="mt-2 list-disc pl-5 text-xs">
                  {draft.writeback.promotion_conflict_files.map((file) => (
                    <li key={file}>
                      <code>{file}</code>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs" style={{ color: "var(--color-text-muted)" }}>
                  Inspect the file on disk. Pick <em>Force promote</em> to overwrite, or <em>Keep current</em> to
                  preserve the existing page and mark the draft reviewed.
                </p>
              </section>
            )}

          {/* Reviewer form */}
          {system === "enms" && enmsPromotionMissingGates.length > 0 && (
            <section
              className="rounded-md border p-4"
              style={{
                borderColor: "rgba(217,119,6,0.3)",
                background: "rgba(217,119,6,0.04)",
              }}
            >
              <h2 className="text-sm font-semibold" style={{ color: "var(--color-warning)" }}>
                Promotion gate checklist
              </h2>
              <p className="mt-1 text-xs" style={{ color: "var(--color-text-muted)" }}>
                EnMS promotion requires both wiki and regression artifacts before a reviewer can promote it.
              </p>
              <ul className="mt-2 list-disc pl-5 text-xs">
                {enmsPromotionMissingGates.map((gate) => (
                  <li key={gate}>{gate}</li>
                ))}
              </ul>
            </section>
          )}

          {/* Reviewer form */}
          <section
            className="rounded-md border p-4"
            style={{ borderColor: "var(--color-border)" }}
          >
            <h2 className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
              Reviewer Audit Fields
            </h2>
            <p className="mt-1 text-xs" style={{ color: "var(--color-text-muted)" }}>
              Required for promote / force-promote / keep-current actions.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="reviewer_actor">Reviewer</Label>
                <Input
                  id="reviewer_actor"
                  value={reviewerActor}
                  onChange={(e) => setReviewerActor(e.target.value)}
                  placeholder="e.g. Yen / sales-ops"
                />
              </div>
              <div>
                <Label htmlFor="review_reason">Reason</Label>
                <Input
                  id="review_reason"
                  value={reviewReason}
                  onChange={(e) => setReviewReason(e.target.value)}
                  placeholder="e.g. Numbers match production ERP"
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="reviewer_note">Note (optional)</Label>
                <Input
                  id="reviewer_note"
                  value={reviewerNote}
                  onChange={(e) => setReviewerNote(e.target.value)}
                  placeholder="Free text"
                />
              </div>
            </div>
            {!auditValid && (status === "written" || status === "promotion_conflicted") && (
              <p className="mt-2 text-xs" style={{ color: "var(--color-warning)" }}>
                Reviewer and reason are required before promoting or resolving.
              </p>
            )}
          </section>

          {/* Actions */}
          <section className="flex flex-wrap gap-2">
            <Button
              onClick={performWriteback}
              disabled={!canWriteback || busy !== null}
              variant={canWriteback ? "default" : "outline"}
            >
              {busy === "writeback" ? "Writing…" : "Writeback to disk"}
            </Button>
            <Button
              onClick={() => performPromote(false)}
              disabled={!canPromote || busy !== null || !auditValid}
              variant={canPromote ? "default" : "outline"}
            >
              {busy === "promote" ? "Promoting…" : "Promote to wiki after regression gate"}
            </Button>
            <Button
              onClick={() => performPromote(true)}
              disabled={!canForcePromote || busy !== null || !auditValid}
              variant="outline"
            >
              {busy === "force" ? "Force-promoting…" : "Force promote (override)"}
            </Button>
            <Button
              onClick={performKeepCurrent}
              disabled={!canKeepCurrent || busy !== null || !auditValid}
              variant="outline"
            >
              {busy === "keep" ? "Resolving…" : "Keep current page"}
            </Button>
          </section>

          {/* History */}
          {history.length > 0 && (
            <section
              className="rounded-md border p-4"
              style={{ borderColor: "var(--color-border)" }}
            >
              <h2 className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
                Audit Trail
              </h2>
              <ol className="mt-3 space-y-2 text-xs">
                {history.map((entry, idx) => (
                  <li key={idx} className="flex gap-3">
                    <span
                      className="mt-0.5 inline-block min-w-[2px] shrink-0 self-stretch rounded-full"
                      style={{
                        background:
                          entry.tone === "success"
                            ? "var(--color-success)"
                            : entry.tone === "warning"
                              ? "var(--color-warning)"
                              : "var(--color-text-muted)",
                      }}
                    />
                    <div className="grow">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="font-semibold">{entry.event}</span>
                        <span style={{ color: "var(--color-text-muted)" }}>{formatTimestamp(entry.at)}</span>
                      </div>
                      <p>{entry.summary}</p>
                      {entry.reviewer_actor && (
                        <p style={{ color: "var(--color-text-muted)" }}>
                          By {entry.reviewer_actor}
                          {entry.review_reason ? ` — ${entry.review_reason}` : ""}
                          {entry.reviewer_note ? ` (${entry.reviewer_note})` : ""}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </>
      )}
    </main>
  );
}

function RegressionDraftList({
  items,
}: {
  items: NonNullable<LearningDraftSnapshot["drafts"]>["regression"];
}) {
  return (
    <div className="mt-3">
      <p className="text-xs font-semibold" style={{ color: "var(--color-text-muted)" }}>
        Regression cases ({items?.length ?? 0})
      </p>
      <ul className="mt-2 space-y-3 text-xs">
        {(items ?? []).map((item, idx) => (
          <li
            key={idx}
            className="rounded-md border p-3"
            style={{ borderColor: "var(--color-border)" }}
          >
            <p className="font-semibold">{item.title ?? "—"}</p>
            <p style={{ color: "var(--color-text-muted)" }}>
              <code>{item.suggested_path ?? "—"}</code>
            </p>
            <dl className="mt-2 grid gap-2">
              <EvidenceRow label="Question" value={item.question} />
              <EvidenceRow label="Expected intent" value={item.expected_intent} />
              <EvidenceRow
                label="Expected capabilities"
                value={(item.expected_capabilities ?? []).join(", ") || "—"}
              />
              <EvidenceRow
                label="Required evidence"
                value={(item.required_evidence ?? []).join(", ") || "—"}
              />
              <EvidenceRow
                label="Guardrails"
                value={(item.guardrails ?? []).join(", ") || "—"}
              />
            </dl>
            {item.reason && (
              <p className="mt-2" style={{ color: "var(--color-text)" }}>
                {item.reason}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function MetaCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>
        {label}
      </p>
      <p className="text-xs" style={{ color: "var(--color-text)" }}>
        {value}
      </p>
    </div>
  );
}

function EvidenceRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>
        {label}
      </dt>
      <dd className="mt-1 whitespace-pre-wrap" style={{ color: "var(--color-text)" }}>
        {value ?? "—"}
      </dd>
    </div>
  );
}

function DraftItemList<
  T extends {
    title?: string;
    suggested_path?: string;
    reason?: string;
    outline?: string[];
    next_sections?: string[];
  },
>({
  title,
  items,
  fileKey,
  outlineKey,
}: {
  title: string;
  items: T[];
  fileKey: "suggested_path";
  outlineKey: "outline" | "next_sections";
}) {
  return (
    <div className="mt-3">
      <p className="text-xs font-semibold" style={{ color: "var(--color-text-muted)" }}>
        {title} ({items.length})
      </p>
      <ul className="mt-2 space-y-3 text-xs">
        {items.map((item, idx) => {
          const outline = (item[outlineKey] ?? []) as string[];
          return (
            <li
              key={idx}
              className="rounded-md border p-3"
              style={{ borderColor: "var(--color-border)" }}
            >
              <p className="font-semibold">{item.title ?? "—"}</p>
              <p style={{ color: "var(--color-text-muted)" }}>
                <code>{item[fileKey] ?? "—"}</code>
              </p>
              {item.reason && (
                <p className="mt-1" style={{ color: "var(--color-text)" }}>
                  {item.reason}
                </p>
              )}
              {outline.length > 0 && (
                <ul className="mt-2 list-disc pl-5">
                  {outline.map((section, sidx) => (
                    <li key={sidx}>{section}</li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
