import { describe, expect, it } from "vitest";
import {
  buildErpContext,
  decorateMessageWithErpContext,
  detectErpIntent,
  shouldPersistErpPlannerPreflight,
} from "./erp-context-builder";

describe("detectErpIntent", () => {
  it("detects sales_order intent", () => {
    const result = detectErpIntent("OOCHAIN 公司本月訂單交期狀態？");
    expect(result.intent).toBe("sales_order");
    expect(result.matchedKeywords).toContain("訂單");
    expect(result.matchedKeywords).toContain("交期");
    expect(result.totalMatches).toBeGreaterThanOrEqual(2);
  });

  it("detects inventory_status intent", () => {
    const result = detectErpIntent("目前可用庫存最多的前 10 個商品？");
    expect(result.intent).toBe("inventory_status");
    expect(result.matchedKeywords).toContain("庫存");
  });

  it("detects production_status intent", () => {
    const result = detectErpIntent("這張工單做到哪了？工序進度如何？");
    expect(result.intent).toBe("production_status");
    expect(result.matchedKeywords).toContain("工單");
  });

  it("detects shipping_status intent", () => {
    const result = detectErpIntent("這張單已經出貨了嗎？揀貨完成沒？");
    expect(result.intent).toBe("shipping_status");
  });

  it("returns unknown when no keywords match", () => {
    const result = detectErpIntent("今天天氣如何？");
    expect(result.intent).toBe("unknown");
    expect(result.totalMatches).toBe(0);
  });
});

describe("buildErpContext", () => {
  it("routes to ERP with high confidence on multi-keyword match", () => {
    const result = buildErpContext({
      request: { user_message: "OOCHAIN 本月訂單還沒出貨的有哪些？" },
    });
    expect(result.shouldRouteToErp).toBe(true);
    expect(result.confidence).toBe("high");
    expect(result.warnings).toEqual([]);
  });

  it("routes with medium confidence on single keyword + no Y-CRM signal", () => {
    const result = buildErpContext({
      request: { user_message: "目前庫存有多少？" },
    });
    expect(result.shouldRouteToErp).toBe(true);
    expect(result.confidence).toBe("medium");
  });

  it("does not route when Y-CRM signal is equal-or-stronger than ERP signal", () => {
    // 「訂單」= 1 ERP keyword; 「LINE」+「聯絡人」= 2 Y-CRM keywords → Y-CRM wins
    const result = buildErpContext({
      request: { user_message: "Calleen 訂單跟 LINE 互動聯絡人怎麼對應？" },
    });
    expect(result.shouldRouteToErp).toBe(false);
    expect(result.warnings).toContain(
      "erp_keywords_present_but_ycrm_signal_stronger",
    );
  });

  it("does not route on pure Y-CRM question with no ERP keywords", () => {
    const result = buildErpContext({
      request: { user_message: "Calleen 公司的 LINE 互動紀錄？" },
    });
    expect(result.shouldRouteToErp).toBe(false);
    // No warning expected: this is pure Y-CRM territory, no ERP signal at all
    expect(result.warnings).toEqual([]);
  });

  it("respects explicit erp hint even with weak keywords", () => {
    const result = buildErpContext({
      request: { user_message: "幫我看一下", current_system_hint: "erp" },
    });
    expect(result.shouldRouteToErp).toBe(true);
    expect(result.confidence).toBe("medium");
  });

  it("does not route on unrelated questions", () => {
    const result = buildErpContext({
      request: { user_message: "今天天氣如何？" },
    });
    expect(result.shouldRouteToErp).toBe(false);
    expect(result.intent).toBe("unknown");
  });

  it("flags warning when routing without clear intent", () => {
    const result = buildErpContext({
      request: { user_message: "x", current_system_hint: "erp" },
    });
    expect(result.shouldRouteToErp).toBe(true);
    expect(result.warnings).toContain("routed_without_clear_intent");
  });
});

describe("decorateMessageWithErpContext", () => {
  it("injects ERP routing context block when routed", () => {
    const preflight = buildErpContext({
      request: { user_message: "OOCHAIN 本月訂單還沒出貨？" },
    });
    const decorated = decorateMessageWithErpContext("原始訊息", preflight);
    expect(decorated).toContain("[ERP Routing Context]");
    expect(decorated).toContain("intent: sales_order");
    expect(decorated).toContain("skills/erp/SKILL.md");
    expect(decorated).toContain("auto-schema-erp.md");
    expect(decorated).toContain("READ_ONLY");
    expect(decorated).toContain("原始訊息");
  });

  it("returns message unchanged when not routed", () => {
    const preflight = buildErpContext({
      request: { user_message: "天氣如何" },
    });
    const decorated = decorateMessageWithErpContext("原始訊息", preflight);
    expect(decorated).toBe("原始訊息");
  });
});

describe("shouldPersistErpPlannerPreflight", () => {
  it("persists when routed", () => {
    const preflight = buildErpContext({
      request: { user_message: "庫存查詢" },
    });
    expect(shouldPersistErpPlannerPreflight(preflight)).toBe(true);
  });

  it("does not persist when not routed", () => {
    const preflight = buildErpContext({
      request: { user_message: "天氣" },
    });
    expect(shouldPersistErpPlannerPreflight(preflight)).toBe(false);
  });
});
