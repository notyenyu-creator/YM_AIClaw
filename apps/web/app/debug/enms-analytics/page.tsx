"use client";

import { useEffect, useState } from "react";

type AnalyticsResponse = {
  ok?: boolean;
  analytics?: {
    id?: string;
    scope?: string;
    description?: string;
  };
  sampleInput?: unknown;
  output?: unknown;
};

function JsonCard({ title, value }: { title: string; value: unknown }) {
  return (
    <section
      className="rounded-xl border p-4"
      style={{
        borderColor: "var(--color-border)",
        background: "var(--color-surface)",
      }}
    >
      <h2 className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
        {title}
      </h2>
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

export default function EnmsAnalyticsPage() {
  const [payload, setPayload] = useState<AnalyticsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    void fetch("/api/debug/enms-analytics")
      .then(async (response) => {
        const next = (await response.json()) as AnalyticsResponse;
        if (!response.ok || !next.ok) {
          throw new Error("Failed to load EnMS analytics sample");
        }
        if (isMounted) {
          setPayload(next);
        }
      })
      .catch((fetchError: unknown) => {
        if (isMounted) {
          setError(fetchError instanceof Error ? fetchError.message : "Failed to load EnMS analytics sample");
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8">
      <header className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-[0.28em]" style={{ color: "var(--color-text-muted)" }}>
          EnMS Analytics Workbench
        </p>
        <h1 className="text-2xl font-semibold tracking-tight" style={{ color: "var(--color-text)" }}>
          Demand Forecast, Anomaly Detection, and Alert Governance
        </h1>
        <p className="max-w-3xl text-sm leading-7" style={{ color: "var(--color-text-muted)" }}>
          這個工作台直接展示 EnMS 對能管資料的第一版數值分析模組，包含需量預警、異常偵測與告警分級，不是單靠 LLM 臨場組句。
        </p>
      </header>

      {error ? (
        <p className="text-sm" style={{ color: "var(--color-warning)" }}>
          {error}
        </p>
      ) : null}

      <section
        className="rounded-2xl border p-5"
        style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
      >
        <h2 className="text-lg font-semibold" style={{ color: "var(--color-text)" }}>
          Runtime Notes
        </h2>
        <div className="mt-3 flex flex-col gap-2 text-sm leading-7" style={{ color: "var(--color-text-muted)" }}>
          <p>{"資料主線：DeviceDataSummaryView 先做需量與 KPI 判讀，mqtt_raw_data 再做異常與電力品質 drill-down。"}</p>
          <p>{"風險治理：forecast -> anomaly -> alert governance 三段式分流，先做預警，再決定是否升級成 alert。"}</p>
          <p>{"能力邊界：目前是統計 + 規則式 engine，正式精度仍取決於歷史資料量、契約容量語意與場域校準。"}</p>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <JsonCard title="Sample Input" value={payload?.sampleInput ?? {}} />
        <JsonCard title="Sample Output" value={payload?.output ?? {}} />
      </div>
    </main>
  );
}
