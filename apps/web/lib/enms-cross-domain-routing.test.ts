import { describe, expect, it } from "vitest";
import { buildEnmsContext } from "./enms-context-builder";
import { buildErpContext } from "./erp-context-builder";
import {
  buildYcrmContext,
  summarizeYcrmContextPlan,
} from "./ycrm-context-builder";

const ENMS_DEMO_HINTS = [
  {
    prompt:
      "請用 EnMS 資料分析阿里山過去 7 天最大需量、契約容量風險，並提供降載建議。",
    intent: "demand_forecast",
  },
  {
    prompt:
      "請用 EnMS 資料分析今天有哪些異常用電、功因或電力品質問題，並提供可能根因與排查建議。",
    intent: "anomaly_detection",
  },
  {
    prompt:
      "請找出最近 7 天最耗電的設備或迴路，列出場域、電表別名、耗電量與需優先關注的原因。",
    intent: "natural_language_query",
  },
  {
    prompt:
      "請比較阿里山與洋銘資訊最近 30 天的總用電、最大需量、平均功率因數，並做多場域 benchmarking 排名與差異說明。",
    intent: "site_benchmarking",
  },
  {
    prompt:
      "請整理最近 7 天的 EnMS 告警與預警摘要，區分需要立即處理、持續觀察與可抑制的項目，並提供治理建議。",
    intent: "alert_governance",
  },
  {
    prompt:
      "請用 EnMS 資料評估洋銘資訊最近 30 天的能效表現，並做 5% 與 10% 節電情境的 what-if 試算，說明可節省的電費與需要補哪些假設。",
    intent: "efficiency_analysis",
  },
] as const;

const ENMS_COMMON_QUESTIONS = [
  {
    prompt: "請問我在2026年1月到今天的能源趨勢分析可以提供給我嗎？",
    intent: "natural_language_query",
  },
  {
    prompt: "哪個場域最近 30 天功率因數最差？",
    intent: "site_benchmarking",
  },
  {
    prompt: "哪個電號最近最接近或超過契約容量？",
    intent: "demand_forecast",
  },
  {
    prompt: "某電號最近 6 期台電帳單趨勢如何？",
    intent: "efficiency_analysis",
  },
  {
    prompt: "最近 7 天最常見的告警類型是什麼？",
    intent: "alert_governance",
  },
  {
    prompt: "哪個場域最近 30 天最大需量最高？",
    intent: "demand_forecast",
  },
  {
    prompt: "某場域最近 7 天哪些時間點最接近超約？",
    intent: "demand_forecast",
  },
  {
    prompt: "各場域目前對應哪些主要電號？",
    intent: "natural_language_query",
  },
  {
    prompt: "某場域最近 7 天的設備耗電排行如何？",
    intent: "natural_language_query",
  },
  {
    prompt: "某場域最近 30 天平均功率因數是否低於建議值？",
    intent: "site_benchmarking",
  },
  {
    prompt: "告警有沒有重複噪音或可抑制項目？",
    intent: "alert_governance",
  },
  {
    prompt: "raw layer 與 summary layer 最近是否都有更新？",
    intent: "raw_trace",
  },
  {
    prompt: "某場域如果節電 5% 或 10%，大約能省多少電費？",
    intent: "efficiency_analysis",
  },
  {
    prompt: "請用 EnMS 資料比較阿里山與洋銘資訊最近 30 天總用電與功率因數，不要看 ERP 或 Y-CRM。",
    intent: "site_benchmarking",
  },
] as const;

function assertRoutesOnlyToEnms(prompt: string, expectedIntent: string) {
  const enms = buildEnmsContext({
    request: {
      user_message: prompt,
      current_system_hint: null,
    },
  });

  const erp = buildErpContext({
    request: {
      user_message: prompt,
      current_system_hint: null,
    },
  });

  const ycrmPlan = buildYcrmContext({
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
  });
  const ycrm = summarizeYcrmContextPlan(ycrmPlan);

  expect(enms.shouldRouteToEnms).toBe(true);
  expect(enms.intent).toBe(expectedIntent);

  expect(erp.shouldRouteToErp).toBe(false);
  expect(ycrm.shouldRouteToYcrm).toBe(false);
}

describe("EnMS demo hints route only into EnMS", () => {
  for (const hint of ENMS_DEMO_HINTS) {
    it(hint.intent, () => {
      assertRoutesOnlyToEnms(hint.prompt, hint.intent);

      const enms = buildEnmsContext({
        request: {
          user_message: hint.prompt,
          current_system_hint: null,
        },
      });
      expect(enms.confidence).toBe("high");
    });
  }
});

describe("Common EnMS questions stay inside EnMS", () => {
  for (const question of ENMS_COMMON_QUESTIONS) {
    it(question.prompt, () => {
      assertRoutesOnlyToEnms(question.prompt, question.intent);
    });
  }
});
