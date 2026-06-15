import { describe, expect, it } from "vitest";
import { buildEnmsDirectAnswer } from "./enms-direct-answer";
import type { DomainBootstrapSnapshot } from "./domain-bootstrap";
import type { EnmsPlannerPreflight } from "./enms-context-builder";

function makePreflight(
  intent: EnmsPlannerPreflight["intent"],
): EnmsPlannerPreflight {
  return {
    system: "enms",
    updatedAt: Date.now(),
    intent,
    confidence: "high",
    shouldRouteToEnms: true,
    matchedKeywords: [],
    warnings: [],
    presentation: {
      optional_chart_requested: false,
      chart_render_allowed: false,
      chart_guardrail_reason: null,
      max_chart_panels: 0,
    },
  };
}

function makeSnapshot(facts: string[]): DomainBootstrapSnapshot {
  return {
    system: "enms",
    source: "live_db",
    scope: "site=阿里山, 洋銘資訊",
    availability: "ready",
    facts,
    joins: [],
    cautions: [],
    gaps: [],
    stillAvailable: [],
  };
}

describe("buildEnmsDirectAnswer", () => {
  it("defers benchmarking prompts to the live query path", () => {
    const answer = buildEnmsDirectAnswer({
      userMessage:
        "請比較阿里山與洋銘資訊最近 30 天的總用電、最大需量、平均功率因數，並做多場域 benchmarking 排名與差異說明。",
      preflight: makePreflight("site_benchmarking"),
      snapshot: makeSnapshot([
        "site_match: 阿里山 -> site001 / companyA",
        "site_match: 洋銘資訊 -> site002 / companyA",
        "site_benchmark_30d: 阿里山 / total_kwh=24705.63 / peak_kw=12993.01 / avg_pf=0.676 / kwh_per_floor_area=123.53 / kwh_per_employee=1235.28",
        "site_benchmark_30d: 洋銘資訊 / total_kwh=1955.16 / peak_kw=2.37 / avg_pf=0.995 / kwh_per_floor_area=9.78 / kwh_per_employee=97.76",
        "power_factor_30d: site=阿里山 / avg_pf=0.6764 / min_pf=0.0020 / point_count=10348",
        "power_factor_30d: site=洋銘資訊 / avg_pf=0.9949 / min_pf=0.6660 / point_count=8461",
      ]),
    });

    expect(answer).toBeNull();
  });

  it("defers ROI prompts to the live query path", () => {
    const answer = buildEnmsDirectAnswer({
      userMessage: "可以查2025年 的節能ROI嗎？",
      preflight: makePreflight("efficiency_analysis"),
      snapshot: makeSnapshot([
        "billing_calendar_mapping: gregorian_year=2025 / billing_month_range=11401..11412",
        "roi_preview_fact: site=阿里山 / billed_accounts=1/1 / baseline_bill=299414.25 / baseline_kwh=83905.25 / avg_rate=3.5285 / savings_5pct=14803.05 / savings_10pct=29606.11",
        "roi_preview_fact: site=洋銘資訊 / billed_accounts=1/2 / baseline_bill=9606.33 / baseline_kwh=2862.83 / avg_rate=3.1508 / savings_5pct=451.02 / savings_10pct=902.03",
      ]),
    });

    expect(answer).toBeNull();
  });

  it("defers bill-trend prompts to the live query path", () => {
    const answer = buildEnmsDirectAnswer({
      userMessage: "電號 8888888888 最近 6 期台電帳單趨勢如何？",
      preflight: makePreflight("efficiency_analysis"),
      snapshot: makeSnapshot([
        "bill_trend_fact: account=8888888888 / billing_month=11412 / usage_kwh=74870.00 / total_amount=257240.00 / avg_rate=3.4358",
        "bill_trend_fact: account=8888888888 / billing_month=11411 / usage_kwh=79578.00 / total_amount=255299.00 / avg_rate=3.2082",
        "roi_preview_fact: site=阿里山 / billed_accounts=1/1 / baseline_bill=299414.25 / baseline_kwh=83905.25 / avg_rate=3.5285 / savings_5pct=14803.05 / savings_10pct=29606.11",
      ]),
    });

    expect(answer).toBeNull();
  });

  it("defers power-factor comparison prompts to the live query path", () => {
    const answer = buildEnmsDirectAnswer({
      userMessage: "哪個場域最近 30 天功率因數最差？",
      preflight: makePreflight("site_benchmarking"),
      snapshot: makeSnapshot([
        "power_factor_30d: site=阿里山 / avg_pf=0.6764 / min_pf=0.0020 / point_count=10348",
        "power_factor_30d: site=洋銘資訊 / avg_pf=0.9949 / min_pf=0.6660 / point_count=8461",
        "site_benchmark_30d: 阿里山 / total_kwh=24705.63 / peak_kw=12993.01 / avg_pf=0.676 / kwh_per_floor_area=123.53 / kwh_per_employee=1235.28",
      ]),
    });

    expect(answer).toBeNull();
  });

  it("does not force a canned ROI answer when direct facts are unavailable", () => {
    const answer = buildEnmsDirectAnswer({
      userMessage: "可以查2025年 的節能ROI嗎？",
      preflight: makePreflight("efficiency_analysis"),
      snapshot: {
        ...makeSnapshot([]),
        gaps: ['EnMS table "TaipowerBills" currently has 0 rows'],
        stillAvailable: ["Site/gateway topology lookup"],
      },
    });

    expect(answer).toBeNull();
  });

  it("returns a DB-backed freshness answer for raw and summary layers", () => {
    const answer = buildEnmsDirectAnswer({
      userMessage: "raw layer 與 summary layer 最近是否都有更新？",
      preflight: makePreflight("raw_trace"),
      snapshot: makeSnapshot([
        "freshness_raw: latest_raw_time=2026-06-10 03:55:15.560649+00 / rows_1d=3344",
        "freshness_summary: latest_summary_time=2026-06-10 03:45:00+00 / rows_1d=175",
      ]),
    });

    expect(answer).toContain("raw / summary layer 的更新狀態");
    expect(answer).toContain("raw layer：最新資料時間 2026-06-10 03:55:15.560649+00");
    expect(answer).toContain("summary layer：最新資料時間 2026-06-10 03:45:00+00");
    expect(answer).toContain("都");
  });

  it("returns a DB-backed anomaly summary instead of falling back to generic analysis", () => {
    const answer = buildEnmsDirectAnswer({
      userMessage: "請用 EnMS 資料分析今天有哪些異常用電、功因或電力品質問題，並提供可能根因與排查建議。",
      preflight: makePreflight("anomaly_detection"),
      snapshot: makeSnapshot([
        "today_anomaly_fact: site=阿里山 / min_pf=0.0510 / avg_pf=0.6798 / max_demand=77.40 / point_count=64 / alert_count=16 / max_util=773.98 / max_alert_demand=77.40 / disconnected_count=0 / low_pf_raw_count=826 / severe_low_pf_raw_count=721 / abnormal_quality_count=943",
      ]),
    });

    expect(answer).toContain("本地 EnMS DB 今日 summary / raw / alert 資料整理異常線索");
    expect(answer).toContain("阿里山");
    expect(answer).toContain("最低功率因數 0.0510");
    expect(answer).toContain("raw layer 嚴重低功因筆數 721");
  });

  it("defers exact count requests to the live query path", () => {
    const answer = buildEnmsDirectAnswer({
      userMessage: "電號 04043717102 目前有多少筆需量告警紀錄？",
      preflight: makePreflight("demand_forecast"),
      snapshot: makeSnapshot([
        "contract_risk_7d: site=洋銘資訊 / account=04043717102 / alert_time=2026-05-22 14:28:38.398116+08 / utilization=570.00 / current_demand=0.06 / contract_capacity=0.01 / alert_type=Alert_4",
      ]),
    });

    expect(answer).toBeNull();
  });

  it("defers chart-oriented trend requests to the live query path", () => {
    const answer = buildEnmsDirectAnswer({
      userMessage: "請問我在2026年1月到今天的能源趨勢分析可以提供給我嗎？也可以幫我用圖表呈現出來。",
      preflight: makePreflight("natural_language_query"),
      snapshot: makeSnapshot([
        "freshness_summary: latest_summary_time=2026-06-10 03:45:00+00 / rows_1d=175",
      ]),
    });

    expect(answer).toBeNull();
  });
});
