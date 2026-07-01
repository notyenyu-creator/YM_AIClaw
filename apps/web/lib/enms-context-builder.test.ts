import { describe, expect, it } from "vitest";
import {
  buildEnmsContext,
  createDefaultEnmsContextInput,
  detectEnmsIntent,
  shouldPersistEnmsPlannerPreflight,
} from "./enms-context-builder";

describe("detectEnmsIntent", () => {
  it("detects demand_forecast intent", () => {
    const result = detectEnmsIntent(
      "請幫我看這個場域下週的需量預測與超約風險。",
    );
    expect(result.intent).toBe("demand_forecast");
    expect(result.matchedKeywords).toContain("需量");
  });

  it("detects anomaly_detection intent", () => {
    const result = detectEnmsIntent("今天功率因數異常，請做根因分析。");
    expect(result.intent).toBe("anomaly_detection");
    expect(result.matchedKeywords).toContain("功率因數");
  });

  it("detects raw_trace intent", () => {
    const result = detectEnmsIntent("請回溯 mqtt_raw_messages payload trace。");
    expect(result.intent).toBe("raw_trace");
    expect(result.matchedKeywords).toContain("mqtt_raw_messages");
  });

  it("detects efficiency_analysis intent on ROI / what-if phrasing", () => {
    const result = detectEnmsIntent("請做這個場域的節能 ROI 與 what-if 試算。");
    expect(result.intent).toBe("efficiency_analysis");
    expect(result.matchedKeywords).toContain("roi");
  });

  it("detects natural_language_query intent on energy trend phrasing", () => {
    const result = detectEnmsIntent(
      "請問我在2026年1月到今天的能源趨勢分析可以提供給我嗎？",
    );
    expect(result.intent).toBe("natural_language_query");
    expect(result.matchedKeywords).toContain("能源趨勢分析");
  });

  it("prefers site_benchmarking for power-factor comparison phrasing", () => {
    const result = detectEnmsIntent(
      "阿里山與洋銘資訊最近 30 天平均功率因數是否低於建議值？",
    );
    expect(result.intent).toBe("site_benchmarking");
    expect(result.matchedKeywords).toContain("功率因數");
  });

  it("returns unknown when no keywords match", () => {
    const result = detectEnmsIntent("今天天氣如何？");
    expect(result.intent).toBe("unknown");
    expect(result.totalMatches).toBe(0);
  });
});

describe("buildEnmsContext", () => {
  it("creates a default input with enms hint", () => {
    const input = createDefaultEnmsContextInput("測試");
    expect(input.request.current_system_hint).toBe("enms");
  });

  it("routes to EnMS with high confidence on multi-keyword match", () => {
    const result = buildEnmsContext({
      request: { user_message: "請分析這個場域的需量、超約與功因趨勢。" },
    });
    expect(result.shouldRouteToEnms).toBe(true);
    expect(result.confidence).toBe("high");
  });

  it("routes with medium confidence on single keyword + no competing system signal", () => {
    const result = buildEnmsContext({
      request: { user_message: "目前能耗如何？" },
    });
    expect(result.shouldRouteToEnms).toBe(true);
    expect(result.confidence).toBe("medium");
  });

  it("routes energy trend analysis wording into EnMS", () => {
    const result = buildEnmsContext({
      request: {
        user_message: "請問我在2026年1月到今天的能源趨勢分析可以提供給我嗎？",
      },
    });
    expect(result.shouldRouteToEnms).toBe(true);
    expect(result.intent).toBe("natural_language_query");
  });

  it("routes power-factor comparison wording into EnMS site benchmarking", () => {
    const result = buildEnmsContext({
      request: {
        user_message: "阿里山與洋銘資訊最近 30 天平均功率因數是否低於建議值？",
      },
    });
    expect(result.shouldRouteToEnms).toBe(true);
    expect(result.intent).toBe("site_benchmarking");
    expect(result.confidence).toBe("high");
  });

  it("does not route when other system signal is stronger", () => {
    const result = buildEnmsContext({
      request: { user_message: "這筆訂單的用電、聯絡人 LINE 互動與庫存有問題嗎？" },
    });
    expect(result.shouldRouteToEnms).toBe(false);
    expect(result.warnings).toContain(
      "enms_keywords_present_but_other_system_signal_stronger",
    );
  });

  it("respects explicit EnMS exclusion even when energy keywords are present", () => {
    const result = buildEnmsContext({
      request: {
        user_message:
          "請只看 Y-CRM，不要看 ERP 或 EnMS。請整理 Calleen Hong 負責客戶背景，不要分析庫存或耗電。",
      },
    });
    expect(result.shouldRouteToEnms).toBe(false);
    expect(result.warnings).toContain("enms_explicitly_excluded");
  });

  it("treats system-first EnMS exclusions as explicit exclusions", () => {
    const result = buildEnmsContext({
      request: {
        user_message:
          "EnMS 先不要看，請只整理 Y-CRM 客戶背景，不要分析耗電。",
      },
    });
    expect(result.shouldRouteToEnms).toBe(false);
    expect(result.warnings).toContain("enms_explicitly_excluded");
  });

  it("does not let negated energy wording steal Y-CRM or ERP turns", () => {
    const result = buildEnmsContext({
      request: {
        user_message:
          "請只看 Y-CRM。請整理 Calleen Hong 負責客戶背景，不要分析庫存或耗電。",
      },
    });
    expect(result.shouldRouteToEnms).toBe(false);
    expect(result.warnings).toContain("enms_explicitly_excluded");
  });

  it("does not route generic rewrite prompts from a negated energy keyword", () => {
    const result = buildEnmsContext({
      request: {
        user_message: "不要分析耗電，幫我把這段文字改寫得更清楚。",
      },
    });
    expect(result.shouldRouteToEnms).toBe(false);
    expect(result.warnings).toContain("enms_explicitly_excluded");
  });

  it("keeps EnMS route when EnMS is the explicit source and other systems are excluded", () => {
    const result = buildEnmsContext({
      request: {
        user_message:
          "請用 EnMS 資料比較阿里山與洋銘資訊最近 30 天總用電與功率因數，不要看 ERP 或 Y-CRM。",
      },
    });
    expect(result.shouldRouteToEnms).toBe(true);
    expect(result.intent).toBe("site_benchmarking");
  });

  it("respects explicit enms hint even with weak keywords", () => {
    const result = buildEnmsContext({
      request: { user_message: "幫我看一下", current_system_hint: "enms" },
    });
    expect(result.shouldRouteToEnms).toBe(true);
    expect(result.confidence).toBe("medium");
  });

  it("marks chart requests as optional guarded visuals", () => {
    const result = buildEnmsContext({
      request: { user_message: "請用圖表比較各場域的能耗與需量。" },
    });
    expect(result.presentation.optional_chart_requested).toBe(true);
    expect(result.presentation.chart_render_allowed).toBe(true);
    expect(result.presentation.chart_guardrail_reason).toBe(
      "chart_optional_if_non_empty_aggregates_available",
    );
  });

  it("does not auto-request charts for benchmark ranking prompts without explicit visual words", () => {
    const result = buildEnmsContext({
      request: {
        user_message:
          "請比較阿里山與洋銘資訊最近 30 天的總用電、最大需量、平均功率因數，並做多場域 benchmarking 排名與差異說明。",
      },
    });
    expect(result.intent).toBe("site_benchmarking");
    expect(result.presentation.optional_chart_requested).toBe(false);
    expect(result.presentation.chart_render_allowed).toBe(false);
  });
});

describe("shouldPersistEnmsPlannerPreflight", () => {
  it("persists when routed", () => {
    const preflight = buildEnmsContext({
      request: { user_message: "請查詢這個場域的需量。" },
    });
    expect(shouldPersistEnmsPlannerPreflight(preflight)).toBe(true);
  });

  it("does not persist when not routed", () => {
    const preflight = buildEnmsContext({
      request: { user_message: "天氣怎麼樣？" },
    });
    expect(shouldPersistEnmsPlannerPreflight(preflight)).toBe(false);
  });
});
