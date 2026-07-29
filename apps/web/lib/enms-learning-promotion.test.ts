import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "vitest";

import {
  applyEnmsLearningDraftWriteback,
  buildEnmsLearningDraft,
} from "./enms-learning-draft";
import { validateEnmsLearningPromotionReadiness } from "./enms-learning-promotion";
import type { EnmsPlannerPreflight } from "./enms-context-builder";
import type { EnmsContextPack } from "./enms-context-pack";

const originalCwd = process.cwd();
const DRAFT_MARKER =
  "- This file was generated from the persisted EnMS learning draft flow.";

const basePresentation = {
  optional_chart_requested: false,
  chart_render_allowed: false,
  chart_guardrail_reason: null,
  max_chart_panels: 0,
};

function makePreflight(intent: EnmsPlannerPreflight["intent"]): EnmsPlannerPreflight {
  return {
    system: "enms",
    updatedAt: 1710000000000,
    intent,
    confidence: "high",
    shouldRouteToEnms: true,
    matchedKeywords: ["需量"],
    warnings: [],
    presentation: basePresentation,
  };
}

function makePack(intent: EnmsPlannerPreflight["intent"]): EnmsContextPack {
  return {
    planner: makePreflight(intent),
    presentation: basePresentation,
    read_first: ["skills/enms/SKILL.md"],
    references: [],
    wiki: [],
    playbooks: [],
    memory_keys: [],
    live_query_steps: ["read_summary_view_first"],
    execution_hints: [],
  };
}

function makeDraft() {
  return buildEnmsLearningDraft({
    session_id: "s-promotion-ready",
    planner_preflight: makePreflight("demand_forecast"),
    planner_context_pack: makePack("demand_forecast"),
    messages: [
      { role: "user", content: "請分析最大需量與超約風險" },
      { role: "assistant", content: "已依授權資料回答。" },
    ],
  });
}

function writeFileUnderRoot(root: string, filePath: string, content: string) {
  const absolutePath = join(root, filePath);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, content, "utf-8");
}

afterEach(() => {
  process.chdir(originalCwd);
});

describe("validateEnmsLearningPromotionReadiness", () => {
  it("blocks promotion before the regression artifact is written", () => {
    const draft = applyEnmsLearningDraftWriteback(makeDraft(), {
      files: ["wiki/entities/energy/s-promot-demand-forecast-summary.md"],
      skipped_files: [],
    });

    const readiness = validateEnmsLearningPromotionReadiness(draft);

    expect(readiness.ready).toBe(false);
    expect(readiness.missing_gates).toContain(
      "regression_artifact_written_or_skipped",
    );
    expect(readiness.missing_gates).not.toContain("regression_case_candidate");
  });

  it("blocks promotion when recorded artifacts are missing from disk", () => {
    const root = mkdtempSync(join(tmpdir(), "enms-promotion-missing-"));
    try {
      process.chdir(root);
      const draft = applyEnmsLearningDraftWriteback(makeDraft(), {
        files: ["wiki/entities/energy/s-promot-demand-forecast-summary.md"],
        skipped_files: [],
        regression_files: ["wiki/regression/enms/s-promot-demand_forecast-regression.json"],
        regression_skipped_files: [],
      });

      const readiness = validateEnmsLearningPromotionReadiness(draft);

      expect(readiness.ready).toBe(false);
      expect(readiness.missing_gates).toEqual(
        expect.arrayContaining([
          "wiki_artifact_exists_on_disk",
          "regression_artifact_exists_on_disk",
        ]),
      );
    } finally {
      process.chdir(originalCwd);
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("allows promotion only after evidence, wiki artifact, and regression artifact are present", () => {
    const root = mkdtempSync(join(tmpdir(), "enms-promotion-ready-"));
    const wikiPath = "wiki/entities/energy/s-promot-demand-forecast-summary.md";
    const regressionPath = "wiki/regression/enms/s-promot-demand_forecast-regression.json";
    try {
      process.chdir(root);
      writeFileUnderRoot(root, wikiPath, `# Draft\n\n${DRAFT_MARKER}\n`);
      writeFileUnderRoot(root, regressionPath, "{}\n");
      const draft = applyEnmsLearningDraftWriteback(makeDraft(), {
        files: [wikiPath],
        skipped_files: [],
        regression_files: [regressionPath],
        regression_skipped_files: [],
      });

      const readiness = validateEnmsLearningPromotionReadiness(draft);

      expect(readiness).toEqual({ ready: true, missing_gates: [] });
    } finally {
      process.chdir(originalCwd);
      rmSync(root, { recursive: true, force: true });
    }
  });
});
