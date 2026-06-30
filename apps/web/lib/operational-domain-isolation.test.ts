import { describe, expect, it } from "vitest";
import { buildEnmsContext } from "./enms-context-builder";
import { buildErpContext } from "./erp-context-builder";
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

describe("ERP domain isolation", () => {
  it("keeps inventory ranking prompts inside ERP", () => {
    assertRoutesOnlyToErp("目前可用庫存最多的前 10 個商品？");
  });

  it("keeps sales-order status prompts inside ERP", () => {
    assertRoutesOnlyToErp("OOCHAIN 本月訂單還沒出貨的有哪些？");
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
});
