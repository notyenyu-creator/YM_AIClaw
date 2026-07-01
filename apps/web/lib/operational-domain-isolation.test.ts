import { describe, expect, it } from "vitest";
import { buildEnmsContext } from "./enms-context-builder";
import { buildErpContext } from "./erp-context-builder";
import { selectOperationalDomainRoute } from "./operational-domain-routing";
import {
  buildYcrmContext,
  summarizeYcrmContextPlan,
} from "./ycrm-context-builder";

function buildYcrmSummary(prompt: string) {
  return summarizeYcrmContextPlan(
    buildYcrmContext({
      request: {
        user_message: prompt,
        current_system_hint: null,
        requested_workspace: null,
        prior_intent_hint: null,
        user_locale: "zh-TW",
      },
      runtime_state: {
        available_wiki_pages: [],
        available_playbooks: [],
        known_memory_keys: [],
        available_auto_schema_workspaces: [],
      },
      defaults: {
        default_workspace_id: "workspace_3joxkr9ofo5hlxjan164egffx",
      },
    }),
  );
}

function assertRoutesOnlyToErp(prompt: string) {
  const erp = buildErpContext({
    request: {
      user_message: prompt,
      current_system_hint: null,
    },
  });
  const enms = buildEnmsContext({
    request: {
      user_message: prompt,
      current_system_hint: null,
    },
  });
  const ycrm = buildYcrmSummary(prompt);

  expect(erp.shouldRouteToErp).toBe(true);
  expect(enms.shouldRouteToEnms).toBe(false);
  expect(ycrm.shouldRouteToYcrm).toBe(false);
}

function assertRoutesOnlyToYcrm(prompt: string) {
  const erp = buildErpContext({
    request: {
      user_message: prompt,
      current_system_hint: null,
    },
  });
  const enms = buildEnmsContext({
    request: {
      user_message: prompt,
      current_system_hint: null,
    },
  });
  const ycrm = buildYcrmSummary(prompt);

  expect(ycrm.shouldRouteToYcrm).toBe(true);
  expect(erp.shouldRouteToErp).toBe(false);
  expect(enms.shouldRouteToEnms).toBe(false);
}

function selectOperationalRoute(prompt: string, currentSystemHint: "enms" | "erp" | "ycrm" | "none" | null = null) {
  const erpSystemHint = currentSystemHint === "enms" ? null : currentSystemHint;
  const erp = buildErpContext({
    request: {
      user_message: prompt,
      current_system_hint: erpSystemHint,
    },
  });
  const enms = buildEnmsContext({
    request: {
      user_message: prompt,
      current_system_hint: currentSystemHint,
    },
  });

  return selectOperationalDomainRoute({
    currentSystemHint,
    erpPreflight: erp,
    enmsPreflight: enms,
  });
}

describe("ERP domain isolation", () => {
  it("keeps inventory ranking prompts inside ERP", () => {
    assertRoutesOnlyToErp("目前可用庫存最多的前 10 個商品？");
  });

  it("keeps sales-order status prompts inside ERP", () => {
    assertRoutesOnlyToErp("OOCHAIN 本月訂單還沒出貨的有哪些？");
  });

  it("lets an explicit ERP hint win even when the prompt mentions energy terms", () => {
    const selection = selectOperationalRoute(
      "請只看 ERP，不要看 EnMS。請整理庫存與訂單異常，先不要分析耗電、電表或場域能耗。",
      "erp",
    );

    expect(selection).toEqual({
      domain: "erp",
      reason: "explicit_erp_hint",
    });
  });

  it("does not let a stale ERP hint override an explicit ERP exclusion", () => {
    const selection = selectOperationalRoute(
      "ERP 先不要查，改看 EnMS 最近 7 天最耗電設備與迴路、總耗電與需量。",
      "enms",
    );

    expect(selection).toEqual({
      domain: "enms",
      reason: "explicit_enms_hint",
    });
  });
});

describe("Y-CRM domain isolation", () => {
  it("keeps customer background prompts inside Y-CRM", () => {
    assertRoutesOnlyToYcrm(
      "請幫我整理 Y-CRM 工作區裡面的 Calleen Hong 目前負責的客戶背景。",
    );
  });

  it("keeps opportunity trend prompts inside Y-CRM", () => {
    assertRoutesOnlyToYcrm(
      "請用 Y-CRM 工作區資料幫我做最近 12 個月的商機金額趨勢圖表。",
    );
  });

  it("keeps explicit Y-CRM customer questions out of ERP and EnMS", () => {
    assertRoutesOnlyToYcrm(
      "請只看 Y-CRM，不要看 ERP 或 EnMS。請整理 Calleen Hong 負責客戶背景，不要分析庫存或耗電。",
    );
  });
});

describe("EnMS domain isolation", () => {
  it("lets an explicit EnMS hint win even when the prompt mentions ERP and Y-CRM", () => {
    const selection = selectOperationalRoute(
      "請只看 EnMS，不要看 ERP 或 Y-CRM。請找最近 7 天最耗電設備，先不要整理訂單、庫存或客戶背景。",
      "enms",
    );

    expect(selection).toEqual({
      domain: "enms",
      reason: "explicit_enms_hint",
    });
  });

  it("prefers EnMS for ambiguous operational prompts only when EnMS has a real signal", () => {
    const selection = selectOperationalRoute(
      "請找最近 7 天最耗電的設備或迴路，列出場域、電表別名、耗電量與需優先關注的原因。",
    );

    expect(selection.domain).toBe("enms");
    expect(selection.reason).toBe("enms_signal_preferred");
  });

  it("does not route generic company/customer wording into EnMS by accident", () => {
    const selection = selectOperationalRoute("請整理目前公司與客戶資料狀態。");

    expect(selection.domain).not.toBe("enms");
  });
});
