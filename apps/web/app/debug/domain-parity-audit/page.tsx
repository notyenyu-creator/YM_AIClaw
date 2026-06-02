"use client";

import { useEffect, useState } from "react";

type AuditResponse = {
  ok?: boolean;
  audit?: {
    generatedAt?: number;
    passed?: boolean;
    commonAgentSkills?: Array<{ path: string; exists: boolean }>;
    systems?: Array<{
      system: string;
      passed: boolean;
      passedChecks: number;
      totalChecks: number;
      roles: Array<{
        role: string;
        agentSkillPath: string;
        goal: string;
        passed: boolean;
        checks: Array<{ path: string; exists: boolean }>;
      }>;
    }>;
  };
};

function StatusPill({ ok }: { ok: boolean }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium"
      style={{
        background: ok ? "rgba(22, 163, 74, 0.08)" : "rgba(217, 119, 6, 0.08)",
        color: ok ? "var(--color-success)" : "var(--color-warning)",
      }}
    >
      {ok ? "pass" : "needs work"}
    </span>
  );
}

export default function DomainParityAuditPage() {
  const [payload, setPayload] = useState<AuditResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    void fetch("/api/debug/domain-parity-audit")
      .then(async (response) => {
        const next = (await response.json()) as AuditResponse;
        if (!response.ok || !next.ok) {
          throw new Error("Failed to load domain parity audit");
        }
        if (isMounted) {
          setPayload(next);
        }
      })
      .catch((fetchError: unknown) => {
        if (isMounted) {
          setError(fetchError instanceof Error ? fetchError.message : "Failed to load domain parity audit");
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const audit = payload?.audit;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          <StatusPill ok={audit?.passed === true} />
          {audit?.generatedAt ? (
            <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
              generated {new Date(audit.generatedAt).toLocaleString()}
            </span>
          ) : null}
        </div>
        <h1 className="text-2xl font-semibold tracking-tight" style={{ color: "var(--color-text)" }}>
          Domain Parity Audit
        </h1>
        <p className="max-w-3xl text-sm leading-7" style={{ color: "var(--color-text-muted)" }}>
          用 PM / RD / QA / TPM 四種角色視角，檢查 Y-CRM、ERP、EnMS 是否都具備同一條 planner、context、learning、review runtime contract。
        </p>
      </header>

      {error ? (
        <p className="text-sm" style={{ color: "var(--color-warning)" }}>
          {error}
        </p>
      ) : null}

      <section className="rounded-2xl border p-5" style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}>
        <h2 className="text-lg font-semibold" style={{ color: "var(--color-text)" }}>
          Multi-Agent Verifiers
        </h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {(audit?.commonAgentSkills ?? []).map((check) => (
            <div
              key={check.path}
              className="rounded-xl border p-3"
              style={{ borderColor: "var(--color-border)", background: "var(--color-background)" }}
            >
              <div className="flex items-center justify-between gap-3">
                <code className="text-xs" style={{ color: "var(--color-text-muted)" }}>{check.path}</code>
                <StatusPill ok={check.exists} />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {(audit?.systems ?? []).map((system) => (
          <article
            key={system.system}
            className="rounded-2xl border p-5"
            style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold uppercase" style={{ color: "var(--color-text)" }}>
                {system.system}
              </h2>
              <StatusPill ok={system.passed} />
            </div>
            <p className="mt-2 text-xs" style={{ color: "var(--color-text-muted)" }}>
              {system.passedChecks} / {system.totalChecks} checks passed
            </p>

            <div className="mt-4 flex flex-col gap-4">
              {system.roles.map((role) => (
                <section
                  key={`${system.system}-${role.role}`}
                  className="rounded-xl border p-4"
                  style={{ borderColor: "var(--color-border)", background: "var(--color-background)" }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold uppercase" style={{ color: "var(--color-text)" }}>
                        {role.role}
                      </h3>
                      <p className="mt-1 text-xs leading-6" style={{ color: "var(--color-text-muted)" }}>
                        {role.goal}
                      </p>
                    </div>
                    <StatusPill ok={role.passed} />
                  </div>

                  <p className="mt-3 text-[11px]" style={{ color: "var(--color-text-muted)" }}>
                    agent: <code>{role.agentSkillPath}</code>
                  </p>

                  <div className="mt-3 flex flex-col gap-2">
                    {role.checks.map((check) => (
                      <div key={check.path} className="flex items-start justify-between gap-3">
                        <code className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>
                          {check.path}
                        </code>
                        <StatusPill ok={check.exists} />
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
