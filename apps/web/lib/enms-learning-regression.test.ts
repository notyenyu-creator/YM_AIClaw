import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";

import {
  buildEnmsLearningDraft,
  applyEnmsLearningDraftWriteback,
} from "./enms-learning-draft";
import { writeEnmsLearningRegressionDrafts } from "./enms-learning-regression";
import type { EnmsPlannerPreflight } from "./enms-context-builder";
import type { EnmsContextPack } from "./enms-context-pack";

const originalCwd = process.cwd();

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

afterEach(() => {
  process.chdir(originalCwd);
});

describe("writeEnmsLearningRegressionDrafts", () => {
  it("writes a reviewer-owned regression artifact without changing chat runtime", () => {
    const root = mkdtempSync(join(tmpdir(), "enms-regression-"));
    try {
      process.chdir(root);
      const draft = buildEnmsLearningDraft({
        session_id: "s-demand-regression",
        planner_preflight: makePreflight("demand_forecast"),
        planner_context_pack: makePack("demand_forecast"),
        messages: [
          { role: "user", content: "哪個迴路最費電，也請看需量風險" },
          { role: "assistant", content: "已依授權 scope 回答。" },
        ],
      });

      const result = writeEnmsLearningRegressionDrafts("s-demand-regression", draft);
      const regressionPath = join(root, result.files[0]);
      const content = JSON.parse(readFileSync(regressionPath, "utf-8"));
      const written = applyEnmsLearningDraftWriteback(draft, {
        files: [],
        skipped_files: [],
        regression_files: result.files,
        regression_skipped_files: result.skipped_files,
      });

      expect(result.files).toHaveLength(1);
      expect(result.skipped_files).toEqual([]);
      expect(content.contractVersion).toBe("enms.learning.regression.v1");
      expect(content.case.expectedIntent).toBe("demand_forecast");
      expect(content.case.expectedCapabilities).toContain("demand_risk");
      expect(content.case.expectedCapabilities).toContain("meter_ranking");
      expect(content.case.guardrails).toContain("must_use_authorized_scope");
      expect(written.writeback.regression_files).toEqual(result.files);
    } finally {
      process.chdir(originalCwd);
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("skips an existing regression artifact unless overwrite is requested", () => {
    const root = mkdtempSync(join(tmpdir(), "enms-regression-skip-"));
    try {
      process.chdir(root);
      const draft = buildEnmsLearningDraft({
        session_id: "s-demand-regression",
        planner_preflight: makePreflight("demand_forecast"),
        planner_context_pack: makePack("demand_forecast"),
        messages: [],
      });

      const first = writeEnmsLearningRegressionDrafts("s-demand-regression", draft);
      const second = writeEnmsLearningRegressionDrafts("s-demand-regression", draft);

      expect(existsSync(join(root, first.files[0]))).toBe(true);
      expect(second.files).toEqual([]);
      expect(second.skipped_files).toEqual(first.files);
    } finally {
      process.chdir(originalCwd);
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects regression artifact paths outside the EnMS regression allowlist", () => {
    const root = mkdtempSync(join(tmpdir(), "enms-regression-invalid-"));
    try {
      process.chdir(root);
      const draft = buildEnmsLearningDraft({
        session_id: "s-invalid-regression",
        planner_preflight: makePreflight("demand_forecast"),
        planner_context_pack: makePack("demand_forecast"),
        messages: [],
      });
      draft.drafts.regression[0].suggested_path = "/tmp/escape.json";

      expect(() =>
        writeEnmsLearningRegressionDrafts("s-invalid-regression", draft),
      ).toThrow(/Invalid EnMS learning artifact path/);
    } finally {
      process.chdir(originalCwd);
      rmSync(root, { recursive: true, force: true });
    }
  });
});
