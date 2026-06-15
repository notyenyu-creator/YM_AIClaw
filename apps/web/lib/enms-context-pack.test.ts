import { describe, expect, it } from "vitest";
import { buildEnmsContext } from "./enms-context-builder";
import {
  buildEnmsContextPack,
  decorateMessageWithEnmsContextPack,
} from "./enms-context-pack";

describe("buildEnmsContextPack", () => {
  it("builds a compact EnMS pack with schema, wiki, and playbook references", () => {
    const preflight = buildEnmsContext({
      request: { user_message: "請幫我做需量預測與降載分析。" },
    });

    const pack = buildEnmsContextPack(preflight);

    expect(pack.planner.intent).toBe("demand_forecast");
    expect(pack.read_first).toContain("skills/enms/SKILL.md");
    expect(pack.references).toContain(
      "skills/enms/reference/auto-schema-enms.md",
    );
    expect(pack.wiki).toContain(
      "wiki/entities/energy/ENMS_DEMAND_FORECAST_TEMPLATE.md",
    );
    expect(pack.playbooks).toContain(
      "wiki/playbooks/enms/ENMS_LOAD_SHEDDING_PLAYBOOK_TEMPLATE.md",
    );
    expect(pack.live_query_steps).toContain("read_summary_view_first");
    expect(pack.live_query_steps).toContain("join_power_account_scope");
    expect(pack.execution_hints.join(" ")).toContain(
      "statistical demand forecast against contract capacity",
    );
    expect(pack.execution_hints.join(" ")).toContain(
      "host=118.168.188.27 port=55433 dbname=EnMS user=sa password=ym@mes42769778 sslmode=disable",
    );
    expect(pack.execution_hints.join(" ")).toContain("dbname=enms_27");
  });

  it("routes anomaly questions toward raw hypertable drill-down", () => {
    const preflight = buildEnmsContext({
      request: { user_message: "請幫我查今天功因異常的根因。" },
    });

    const pack = buildEnmsContextPack(preflight);

    expect(pack.planner.intent).toBe("anomaly_detection");
    expect(pack.wiki).toContain(
      "wiki/operations/enms/ENMS_ANOMALY_ROOT_CAUSE_TEMPLATE.md",
    );
    expect(pack.live_query_steps).toContain("fallback_to_raw_hypertable");
    expect(pack.live_query_steps).toContain(
      "verify_quality_and_connected_signals",
    );
    expect(pack.execution_hints.join(" ")).toContain(
      "rule-plus-statistical-baseline workflow",
    );
  });

  it("maps site benchmarking sessions to site comparison playbooks", () => {
    const preflight = buildEnmsContext({
      request: { user_message: "請比較各場域的能耗與排名。" },
    });

    const pack = buildEnmsContextPack(preflight);

    expect(pack.planner.intent).toBe("site_benchmarking");
    expect(pack.wiki).toContain(
      "wiki/entities/sites/ENMS_SITE_ENERGY_SUMMARY_TEMPLATE.md",
    );
    expect(pack.playbooks).toContain(
      "wiki/playbooks/enms/ENMS_SITE_BENCHMARKING_PLAYBOOK_TEMPLATE.md",
    );
    expect(pack.execution_hints.join(" ")).toContain(
      "aggregate the same time window across sites",
    );
  });

  it("adds ROI / what-if guidance for efficiency sessions", () => {
    const preflight = buildEnmsContext({
      request: { user_message: "請做這個場域的節能 ROI 與 what-if 試算。" },
    });

    const pack = buildEnmsContextPack(preflight);

    expect(pack.planner.intent).toBe("efficiency_analysis");
    expect(pack.playbooks).toContain(
      "wiki/playbooks/enms/ENMS_ROI_WHAT_IF_PLAYBOOK_TEMPLATE.md",
    );
    expect(pack.live_query_steps).toContain("join_billing_tariff_scope");
    expect(pack.execution_hints.join(" ")).toContain(
      "estimate 5% and 10% savings scenarios",
    );
  });

  it("adds VALUES-based chart guardrails for chart-style EnMS requests", () => {
    const preflight = buildEnmsContext({
      request: { user_message: "請用圖表比較各場域的能耗與排名。" },
    });

    const pack = buildEnmsContextPack(preflight);

    expect(pack.presentation.chart_render_allowed).toBe(true);
    expect(pack.execution_hints.join(" ")).toContain(
      "emit report-json using VALUES constants",
    );
  });
});

describe("decorateMessageWithEnmsContextPack", () => {
  it("injects Hermes-style EnMS context pack into the user message", () => {
    const preflight = buildEnmsContext({
      request: { user_message: "請查詢這個場域的能耗趨勢" },
    });
    const pack = buildEnmsContextPack(preflight);

    const decorated = decorateMessageWithEnmsContextPack("原始訊息", pack);

    expect(decorated).toContain("[EnMS Context Pack]");
    expect(decorated).toContain("runtime.gateway=openclaw_gateway");
    expect(decorated).toContain("runtime.orchestration=hermes_style");
    expect(decorated).toContain("runtime.knowledge_layer=ai_wiki");
    expect(decorated).toContain("planner.system_scope=enms");
    expect(decorated).toContain("planner.read_first=skills/enms/SKILL.md");
    expect(decorated).toContain("Treat EnMS questions as DB-first requests");
    expect(pack.execution_hints.join(" ")).toContain(
      "explicitly say what is missing",
    );
    expect(decorated).toContain("原始訊息");
  });

  it("returns the original message when EnMS should not route", () => {
    const preflight = buildEnmsContext({
      request: { user_message: "今天天氣如何？" },
    });
    const pack = buildEnmsContextPack(preflight);

    expect(decorateMessageWithEnmsContextPack("原始訊息", pack)).toBe(
      "原始訊息",
    );
  });
});
