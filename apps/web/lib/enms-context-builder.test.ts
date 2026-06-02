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

  it("does not route when other system signal is stronger", () => {
    const result = buildEnmsContext({
      request: { user_message: "這筆訂單的用電、聯絡人 LINE 互動與庫存有問題嗎？" },
    });
    expect(result.shouldRouteToEnms).toBe(false);
    expect(result.warnings).toContain(
      "enms_keywords_present_but_other_system_signal_stronger",
    );
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
