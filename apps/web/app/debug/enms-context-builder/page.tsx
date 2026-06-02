"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { LearningReviewWorkspace } from "@/app/components/learning-review-workspace";
import { Button } from "@/app/components/ui/button";

type EnmsDebugDefaultsResponse = {
  ok?: boolean;
  defaults?: {
    request?: {
      user_message?: string;
      current_system_hint?: "enms" | "erp" | "ycrm" | "none" | null;
    };
  };
  sample_output?: {
    planner?: {
      intent?: string;
      confidence?: string;
      shouldRouteToEnms?: boolean;
      warnings?: string[];
    };
    pack?: {
      read_first?: string[];
      references?: string[];
      wiki?: string[];
      playbooks?: string[];
      live_query_steps?: string[];
      execution_hints?: string[];
    };
  };
};

type EnmsDebugRunResponse = {
  ok?: boolean;
  planner?: {
    intent?: string;
    confidence?: string;
    shouldRouteToEnms?: boolean;
    matchedKeywords?: string[];
    warnings?: string[];
  };
  pack?: {
    read_first?: string[];
    references?: string[];
    wiki?: string[];
    playbooks?: string[];
    memory_keys?: string[];
    live_query_steps?: string[];
    execution_hints?: string[];
    presentation?: {
      optional_chart_requested?: boolean;
      chart_render_allowed?: boolean;
      chart_guardrail_reason?: string | null;
      max_chart_panels?: number;
    };
  };
  error?: string;
};

type SessionSnapshotResponse = {
  id?: string;
  session?: {
    id?: string;
    enmsPlannerPreflight?: {
      system?: string;
      updatedAt?: number;
      intent?: string;
      confidence?: string;
      shouldRouteToEnms?: boolean;
      matchedKeywords?: string[];
      warnings?: string[];
    } | null;
    enmsPlannerContextPack?: {
      planner?: {
        intent?: string;
        confidence?: string;
        shouldRouteToEnms?: boolean;
      } | null;
      read_first?: string[];
      references?: string[];
      wiki?: string[];
      playbooks?: string[];
      memory_keys?: string[];
      live_query_steps?: string[];
      execution_hints?: string[];
      presentation?: {
        optional_chart_requested?: boolean;
        chart_render_allowed?: boolean;
        chart_guardrail_reason?: string | null;
        max_chart_panels?: number;
      };
    } | null;
  } | null;
  messages?: Array<{ id?: string; role?: string; content?: string }>;
  error?: string;
};

type FormState = {
  user_message: string;
  current_system_hint: "enms" | "erp" | "ycrm" | "none";
  session_id: string;
};

function JsonCard({
  title,
  value,
}: {
  title: string;
  value: unknown;
}) {
  return (
    <section
      className="rounded-xl border p-4"
      style={{
        borderColor: "var(--color-border)",
        background: "var(--color-surface)",
      }}
    >
      <h3 className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
        {title}
      </h3>
      <pre
        className="mt-3 overflow-x-auto rounded-lg p-3 text-xs leading-6"
        style={{
          background: "var(--color-chat-sidebar-active-bg)",
          color: "var(--color-text-muted)",
        }}
      >
        {JSON.stringify(value, null, 2)}
      </pre>
    </section>
  );
}

export default function EnmsContextBuilderPage() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isReviewRoute = pathname.startsWith("/review/enms");
  const initialSessionId = searchParams.get("sessionId") ?? "";

  const [form, setForm] = useState<FormState>({
    user_message: "",
    current_system_hint: "enms",
    session_id: initialSessionId,
  });
  const [defaults, setDefaults] = useState<EnmsDebugDefaultsResponse | null>(null);
  const [runResult, setRunResult] = useState<EnmsDebugRunResponse | null>(null);
  const [sessionSnapshot, setSessionSnapshot] = useState<SessionSnapshotResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isLoadingSession, startSessionTransition] = useTransition();

  useEffect(() => {
    let isMounted = true;

    void fetch("/api/debug/enms-context-builder")
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Failed to load EnMS debug defaults");
        }
        const payload = (await response.json()) as EnmsDebugDefaultsResponse;
        if (!isMounted) {
          return;
        }
        setDefaults(payload);
        setForm((current) => ({
          ...current,
          user_message: current.user_message || payload.defaults?.request?.user_message || "",
          current_system_hint:
            current.current_system_hint
            || payload.defaults?.request?.current_system_hint
            || "enms",
        }));
      })
      .catch((fetchError: unknown) => {
        if (!isMounted) {
          return;
        }
        setError(fetchError instanceof Error ? fetchError.message : "Failed to load EnMS defaults");
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!initialSessionId) {
      return;
    }

    setForm((current) => (
      current.session_id === initialSessionId
        ? current
        : { ...current, session_id: initialSessionId }
    ));
  }, [initialSessionId]);

  const heading = isReviewRoute ? "EnMS Review Workspace" : "EnMS Context Builder";
  const subtitle = isReviewRoute
    ? "用正式 review 入口檢查 EnMS planner metadata、context pack 與 session transcript。"
    : "檢查 EnMS routing、Hermes-style context pack 與 session metadata 的工作台。";
  const activeReviewSessionId = sessionSnapshot?.id ?? (isReviewRoute ? form.session_id.trim() : null);

  const quickPrompts = useMemo(
    () => [
      "請幫我分析這週最大需量和超約風險。",
      "哪個場域這個月能耗最高？",
      "請追一下這個 gateway 的 raw trace 與 power quality 異常。",
    ],
    [],
  );

  async function handleRunBuilder() {
    setError(null);
    startTransition(() => {
      void fetch("/api/debug/enms-context-builder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_message: form.user_message,
          current_system_hint: form.current_system_hint,
        }),
      })
        .then(async (response) => {
          const payload = (await response.json()) as EnmsDebugRunResponse;
          if (!response.ok || payload.error) {
            throw new Error(payload.error || "EnMS builder failed");
          }
          setRunResult(payload);
        })
        .catch((runError: unknown) => {
          setError(runError instanceof Error ? runError.message : "EnMS builder failed");
        });
    });
  }

  async function handleLoadSession() {
    const sessionId = form.session_id.trim();
    if (!sessionId) {
      setError("請先輸入 Web session ID。");
      return;
    }

    setError(null);
    startSessionTransition(() => {
      void fetch(`/api/web-sessions/${encodeURIComponent(sessionId)}`)
        .then(async (response) => {
          const payload = (await response.json()) as SessionSnapshotResponse;
          if (!response.ok || payload.error) {
            throw new Error(payload.error || "Failed to load EnMS session snapshot");
          }
          setSessionSnapshot(payload);
        })
        .catch((sessionError: unknown) => {
          setError(sessionError instanceof Error ? sessionError.message : "Failed to load EnMS session snapshot");
        });
    });
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8">
      <header className="flex flex-col gap-2">
        {isReviewRoute ? (
          <div className="flex flex-wrap gap-2">
            <span
              className="inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium"
              style={{
                borderColor: "rgba(0, 101, 162, 0.18)",
                background: "rgba(0, 101, 162, 0.08)",
                color: "var(--color-accent)",
              }}
            >
              Review Queue
            </span>
            <span
              className="inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium"
              style={{
                borderColor: "rgba(22, 163, 74, 0.18)",
                background: "rgba(22, 163, 74, 0.08)",
                color: "var(--color-success)",
              }}
            >
              Review route ready
            </span>
          </div>
        ) : null}
        <h1 className="text-2xl font-semibold tracking-tight" style={{ color: "var(--color-text)" }}>
          {heading}
        </h1>
        <p className="max-w-3xl text-sm leading-7" style={{ color: "var(--color-text-muted)" }}>
          {subtitle}
        </p>
      </header>

      <section
        className="rounded-2xl border p-5"
        style={{
          borderColor: "var(--color-border)",
          background: "var(--color-surface)",
        }}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-2 text-sm font-medium" style={{ color: "var(--color-text)" }}>
            User message
            <textarea
              aria-label="User message"
              value={form.user_message}
              onChange={(event) => setForm((current) => ({ ...current, user_message: event.target.value }))}
              rows={5}
              className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
              style={{
                borderColor: "var(--color-border)",
                background: "var(--color-background)",
                color: "var(--color-text)",
              }}
            />
          </label>

          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-2 text-sm font-medium" style={{ color: "var(--color-text)" }}>
              System hint
              <select
                aria-label="System hint"
                value={form.current_system_hint}
                onChange={(event) => setForm((current) => ({
                  ...current,
                  current_system_hint: event.target.value as FormState["current_system_hint"],
                }))}
                className="rounded-xl border px-3 py-2 text-sm outline-none"
                style={{
                  borderColor: "var(--color-border)",
                  background: "var(--color-background)",
                  color: "var(--color-text)",
                }}
              >
                <option value="enms">enms</option>
                <option value="erp">erp</option>
                <option value="ycrm">ycrm</option>
                <option value="none">none</option>
              </select>
            </label>

            <label className="flex flex-col gap-2 text-sm font-medium" style={{ color: "var(--color-text)" }}>
              Web session ID
              <input
                aria-label="Web session ID"
                value={form.session_id}
                onChange={(event) => setForm((current) => ({ ...current, session_id: event.target.value }))}
                className="rounded-xl border px-3 py-2 text-sm outline-none"
                style={{
                  borderColor: "var(--color-border)",
                  background: "var(--color-background)",
                  color: "var(--color-text)",
                }}
              />
            </label>

            <div className="flex flex-wrap gap-3 pt-1">
              <Button onClick={handleRunBuilder} disabled={isPending}>
                {isPending ? "Running..." : "Run Builder"}
              </Button>
              <Button variant="outline" onClick={handleLoadSession} disabled={isLoadingSession}>
                {isLoadingSession ? "Loading..." : "Load Session Snapshot"}
              </Button>
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {quickPrompts.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => setForm((current) => ({ ...current, user_message: prompt }))}
              className="rounded-full border px-3 py-1.5 text-xs transition-colors hover:opacity-90"
              style={{
                borderColor: "var(--color-border)",
                color: "var(--color-text-muted)",
                background: "var(--color-background)",
              }}
            >
              {prompt}
            </button>
          ))}
        </div>

        {error ? (
          <p className="mt-4 text-sm" style={{ color: "var(--color-warning)" }}>
            {error}
          </p>
        ) : null}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <JsonCard title="Defaults & Sample Output" value={defaults ?? { status: "loading" }} />
        <JsonCard title="Latest EnMS Builder Result" value={runResult ?? { status: "not_run" }} />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <JsonCard
          title="Latest Session EnMS Planner"
          value={sessionSnapshot?.session?.enmsPlannerPreflight ?? { status: "not_loaded" }}
        />
        <JsonCard
          title="Latest Session EnMS Context Pack"
          value={sessionSnapshot?.session?.enmsPlannerContextPack ?? { status: "not_loaded" }}
        />
      </section>

      <JsonCard
        title="Latest Session Messages"
        value={sessionSnapshot?.messages?.slice(-8) ?? { status: "not_loaded" }}
      />

      {activeReviewSessionId ? (
        <section className="rounded-2xl border p-5" style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}>
          <div className="mb-4">
            <h2 className="text-lg font-semibold" style={{ color: "var(--color-text)" }}>
              EnMS Learning Review
            </h2>
            <p className="mt-1 text-sm leading-7" style={{ color: "var(--color-text-muted)" }}>
              同一個 session 可以直接在這裡完成 learning draft writeback、promotion、force promote 與 keep current resolution。
            </p>
          </div>
          <LearningReviewWorkspace system="enms" sessionId={activeReviewSessionId} />
        </section>
      ) : null}
    </main>
  );
}
