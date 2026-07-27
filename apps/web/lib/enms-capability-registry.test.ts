import { afterEach, describe, expect, it } from "vitest";

import {
  clearEnmsKnowledgeCacheForTests,
  ENMS_CAPABILITY_REGISTRY_VERSION,
  ENMS_FACTS_SCHEMA_VERSION,
  ENMS_INTEGRATION_CONTRACT_VERSION,
  buildEnmsScopedBundleContextMessage,
  getEnmsChatSemanticRoutes,
  getEnmsCapabilityRegistry,
  getEnmsPageDefinition,
  getEnmsPageKeys,
  getMissingRequiredFactGroups,
  isEnmsLatestDataQuestion,
  matchesEnmsChatSemanticRoute,
  loadEnmsKnowledgeBundle,
} from "./enms-capability-registry";
import { buildEnmsContext } from "./enms-context-builder";
import { buildEnmsContextPack } from "./enms-context-pack";

describe("EnMS capability registry", () => {
  afterEach(() => {
    clearEnmsKnowledgeCacheForTests();
  });

  it("registers the documented eight EnClaw capabilities", () => {
    const capabilities = getEnmsCapabilityRegistry();

    expect(capabilities).toHaveLength(8);
    expect(capabilities.map((capability) => capability.name)).toEqual([
      "EnMS-specific Runtime 擴充",
      "Context Builder",
      "Context Pack",
      "Review Flow",
      "資料治理",
      "分析模組整合",
      "圖表輸出",
      "Wiki Writeback 整合",
    ]);
    expect(
      capabilities.find((capability) => capability.key === "wiki_writeback")
        ?.readonlyMode,
    ).toBe("explicitly_disabled");
  });

  it("maps all six pages to a versioned intent and knowledge contract", () => {
    expect(getEnmsPageKeys()).toEqual([
      "demand",
      "anomaly",
      "nlq",
      "bench",
      "alert",
      "eff",
    ]);

    for (const pageKey of getEnmsPageKeys()) {
      const definition = getEnmsPageDefinition(pageKey);
      expect(definition.capabilityKeys).toHaveLength(8);
      expect(definition.skillPaths).toContain("skills/enms/SKILL.md");
      expect(definition.wikiPaths.length).toBeGreaterThan(0);
      expect(definition.requiredKnowledgePhrases.length).toBeGreaterThan(0);
    }
  });

  it("keeps EnMS chat semantic routes in the capability registry", () => {
    const routes = getEnmsChatSemanticRoutes();

    expect(routes.map((route) => route.key)).toEqual([
      "latest_data",
      "demand_risk",
      "anomaly_root_cause",
      "energy_usage_query",
      "site_benchmarking",
      "alert_governance",
      "efficiency_advice",
      "billing",
      "raw_trace",
    ]);
    expect(matchesEnmsChatSemanticRoute(
      "efficiency_advice",
      "可以給我一個省電建議嗎？",
    )).toBe(true);
    expect(isEnmsLatestDataQuestion("最新的一筆資料是幾月幾號？")).toBe(true);
    expect(isEnmsLatestDataQuestion("可以給我一個省電建議嗎？")).toBe(false);
  });

  it("builds scoped bundle hints without mixing latest-data or billing into efficiency advice", () => {
    const hint = buildEnmsScopedBundleContextMessage(
      "可以給我一個省電建議嗎？",
      "eff",
    );

    expect(hint).toContain("省電");
    expect(hint).toContain("quick win");
    expect(hint).not.toContain("最新一筆資料時間");
    expect(hint).not.toContain("台電帳單");
    expect(hint).not.toContain("ROI 投資回收");
  });

  it("does not add page-default hints for unrelated questions", () => {
    expect(buildEnmsScopedBundleContextMessage(
      "今天天氣如何？",
      "eff",
    )).toBe("今天天氣如何？");
    expect(buildEnmsScopedBundleContextMessage(
      "今天天氣如何？",
      "demand",
    )).toBe("今天天氣如何？");
  });

  it("keeps precise latest-data bundle hints isolated from other requested intents", () => {
    const hint = buildEnmsScopedBundleContextMessage(
      "我想知道最新的一筆資料時間，也請分析目前需量有沒有超約風險",
      "nlq",
    );

    expect(hint).toBe("最新一筆資料時間");
  });

  it.each(getEnmsPageKeys())(
    "loads and verifies real skill/wiki/playbook content for %s",
    async (pageKey) => {
      const definition = getEnmsPageDefinition(pageKey);
      const preflight = buildEnmsContext({
        request: {
          user_message: definition.prompt,
          current_system_hint: "enms",
        },
      });
      const pack = buildEnmsContextPack(preflight);
      const bundle = await loadEnmsKnowledgeBundle(pageKey, pack);

      expect(bundle.contractVersion).toBe(
        ENMS_INTEGRATION_CONTRACT_VERSION,
      );
      expect(bundle.factsSchemaVersion).toBe(
        ENMS_FACTS_SCHEMA_VERSION,
      );
      expect(bundle.registryVersion).toBe(
        ENMS_CAPABILITY_REGISTRY_VERSION,
      );
      expect(bundle.contextPack.intent).toBe(definition.intent);
      expect(bundle.verifiedPhrases).toEqual(
        definition.requiredKnowledgePhrases,
      );
      expect(bundle.documents).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: "skills/enms/SKILL.md",
            sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
          }),
        ]),
      );
      for (const path of [
        ...definition.wikiPaths,
        ...definition.playbookPaths,
      ]) {
        expect(bundle.documents.some((document) => document.path === path)).toBe(
          true,
        );
      }
    },
  );

  it("reports missing fact groups without accepting empty arrays", () => {
    expect(
      getMissingRequiredFactGroups("bench", {
        metrics: { siteCount: 2 },
        siteRankings: [],
      }),
    ).toEqual([["siteRankings"]]);

    expect(
      getMissingRequiredFactGroups("bench", {
        metrics: { siteCount: 2 },
        siteRankings: [{ name: "A", value: 10 }],
      }),
    ).toEqual([]);
  });

  it("rejects malformed fact values even when their paths exist", () => {
    expect(
      getMissingRequiredFactGroups("bench", {
        metrics: { siteCount: "2" },
        siteRankings: [{ name: "A", value: "10" }],
      }),
    ).toEqual([["siteRankings"], ["metrics.siteCount"]]);

    expect(
      getMissingRequiredFactGroups("demand", {
        metrics: { currentDemandKw: Number.NaN },
        analyticsInputs: {
          summaryPoints: [{ recordedAt: "", maxDemandKw: 10 }],
        },
      }),
    ).toEqual([
      ["metrics.currentDemandKw", "metrics.peakDemandKw"],
      ["analyticsInputs.summaryPoints"],
    ]);
  });
});
