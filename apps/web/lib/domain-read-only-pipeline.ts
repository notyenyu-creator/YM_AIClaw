import type { DomainAdapterId } from "./domain-adapter-contract";
import type { DomainBootstrapSnapshot } from "./domain-bootstrap";
import type { EnmsPlannerPreflight } from "./enms-context-builder";
import type { EnmsContextPack } from "./enms-context-pack";
import type { ErpPlannerPreflight } from "./erp-context-builder";
import type { ErpContextPack } from "./erp-context-pack";
import {
  domainAdapterSupportsPhaseOneReadOnlyIntent,
  getDomainAdapterContract,
} from "./domain-adapter-registry";
import type { YcrmContextPack } from "./ycrm-context-pack";
import type { YcrmPlannerPreflight } from "./ycrm-context-builder";

type DomainReadOnlyPresentation = {
  chartRequested: boolean;
  chartRenderAllowed: boolean;
  maxChartPanels: number;
  chartGuardrailReason: string | null;
};

type DomainReadOnlyPlanBase = {
  pipelineVersion: "phase1-v1";
  domain: DomainAdapterId;
  displayName: string;
  sourceOfTruthLabels: string[];
  chartRequiresVerifiedAggregates: boolean;
  stopOnMissingData: true;
  externalInfoRequiresExplicitUserRequest: boolean;
  strategy:
    | "verified_direct_query"
    | "deterministic_direct_answer"
    | "model_guided_live_query";
  intent: string;
  presentation: DomainReadOnlyPresentation;
  liveQuerySteps: string[];
  executionHints: string[];
  blockedReason: string | null;
};

export type DomainReadOnlyExecutionPlan = DomainReadOnlyPlanBase & {
  eligible: true;
};

export type DomainReadOnlyExecutionIneligiblePlan = DomainReadOnlyPlanBase & {
  eligible: false;
};

type PlanWithEligibility =
  | DomainReadOnlyExecutionPlan
  | DomainReadOnlyExecutionIneligiblePlan;

type BuildEnmsPlanInput = {
  system: "enms";
  userMessage: string;
  preflight: EnmsPlannerPreflight;
  pack: EnmsContextPack;
  snapshot: DomainBootstrapSnapshot | null;
};

type BuildErpPlanInput = {
  system: "erp";
  userMessage: string;
  preflight: ErpPlannerPreflight;
  pack: ErpContextPack;
  snapshot: DomainBootstrapSnapshot | null;
};

type BuildYcrmPlanInput = {
  system: "ycrm";
  userMessage: string;
  preflight: YcrmPlannerPreflight;
  pack: YcrmContextPack;
  snapshot: DomainBootstrapSnapshot | null;
};

export type BuildDomainReadOnlyPlanInput =
  | BuildEnmsPlanInput
  | BuildErpPlanInput
  | BuildYcrmPlanInput;

function formatPresentation(
  presentation: {
    optional_chart_requested: boolean;
    chart_render_allowed: boolean;
    max_chart_panels: number;
    chart_guardrail_reason: string | null;
  },
): DomainReadOnlyPresentation {
  return {
    chartRequested: presentation.optional_chart_requested,
    chartRenderAllowed: presentation.chart_render_allowed,
    maxChartPanels: presentation.max_chart_panels,
    chartGuardrailReason: presentation.chart_guardrail_reason,
  };
}

function buildBasePlan(
  domain: DomainAdapterId,
  intent: string,
  strategy: DomainReadOnlyPlanBase["strategy"],
  presentation: DomainReadOnlyPresentation,
  liveQuerySteps: string[],
  executionHints: string[],
  blockedReason: string | null,
): DomainReadOnlyPlanBase {
  const contract = getDomainAdapterContract(domain);
  return {
    pipelineVersion: "phase1-v1",
    domain,
    displayName: contract.displayName,
    sourceOfTruthLabels: contract.sourceOfTruth
      .filter((source) => source.primary)
      .map((source) => source.label),
    chartRequiresVerifiedAggregates:
      contract.executionPolicy.chartRequiresVerifiedAggregates,
    stopOnMissingData: true,
    externalInfoRequiresExplicitUserRequest:
      contract.executionPolicy.externalInfoRequiresExplicitUserRequest,
    strategy,
    intent,
    presentation,
    liveQuerySteps,
    executionHints,
    blockedReason,
  };
}

function asEligible(plan: DomainReadOnlyPlanBase): DomainReadOnlyExecutionPlan {
  return { ...plan, eligible: true };
}

function asIneligible(
  plan: DomainReadOnlyPlanBase,
): DomainReadOnlyExecutionIneligiblePlan {
  return { ...plan, eligible: false };
}

function looksLikeErpWriteRequest(message: string): boolean {
  return /新增|建立|開立|更新|修改|變更|刪除|取消|關閉|核准|approve|create|update|delete|cancel|close|adjust|post|write/i.test(
    message,
  );
}

export function buildDomainReadOnlyExecutionPlan(
  input: BuildDomainReadOnlyPlanInput,
): PlanWithEligibility {
  if (input.system === "enms") {
    const base = buildBasePlan(
      "enms",
      input.preflight.intent,
      "model_guided_live_query",
      formatPresentation(input.pack.presentation),
      input.pack.live_query_steps,
      input.pack.execution_hints,
      input.snapshot?.availability === "blocked"
        ? "source_of_truth_unavailable"
        : null,
    );
    const eligible =
      input.preflight.shouldRouteToEnms &&
      domainAdapterSupportsPhaseOneReadOnlyIntent("enms", input.preflight.intent);
    return eligible ? asEligible(base) : asIneligible(base);
  }

  if (input.system === "erp") {
    const base = buildBasePlan(
      "erp",
      input.preflight.intent,
      "model_guided_live_query",
      formatPresentation(input.pack.presentation),
      input.pack.live_query_steps,
      input.pack.execution_hints,
      input.snapshot?.availability === "blocked"
        ? "source_of_truth_unavailable"
        : null,
    );
    const eligible =
      input.preflight.shouldRouteToErp &&
      !looksLikeErpWriteRequest(input.userMessage) &&
      domainAdapterSupportsPhaseOneReadOnlyIntent("erp", input.preflight.intent);
    return eligible ? asEligible(base) : asIneligible(base);
  }

  const ycrmBlockedReason =
    input.preflight.blockers.includes("auto_schema_missing")
      ? "auto_schema_missing"
      : input.snapshot?.availability === "blocked"
        ? "source_of_truth_unavailable"
        : null;
  const ycrmBase = buildBasePlan(
    "ycrm",
    input.preflight.intent,
    "model_guided_live_query",
    formatPresentation(input.pack.presentation),
    input.pack.live_query_steps,
    input.pack.execution_hints,
    ycrmBlockedReason,
  );
  const ycrmEligible =
    input.preflight.shouldRouteToYcrm &&
    !input.preflight.crossSystem &&
    input.preflight.intent !== "product_help" &&
    domainAdapterSupportsPhaseOneReadOnlyIntent("ycrm", input.preflight.intent);
  return ycrmEligible ? asEligible(ycrmBase) : asIneligible(ycrmBase);
}

export function decorateMessageWithReadOnlyExecutionPlan(
  userMessage: string,
  plan: DomainReadOnlyExecutionPlan,
): string {
  const lines = [
    "[Unified Read-Only Execution Plan]",
    `pipeline.version=${plan.pipelineVersion}`,
    `pipeline.domain=${plan.domain}`,
    `pipeline.intent=${plan.intent}`,
    `pipeline.strategy=${plan.strategy}`,
    `pipeline.source_of_truth=${plan.sourceOfTruthLabels.join(" | ") || "none"}`,
    `pipeline.stop_on_missing_data=${plan.stopOnMissingData ? "true" : "false"}`,
    `pipeline.chart_requires_verified_aggregates=${plan.chartRequiresVerifiedAggregates ? "true" : "false"}`,
    `pipeline.external_info_requires_explicit_user_request=${plan.externalInfoRequiresExplicitUserRequest ? "true" : "false"}`,
    `pipeline.presentation.chart_requested=${plan.presentation.chartRequested ? "true" : "false"}`,
    `pipeline.presentation.chart_render_allowed=${plan.presentation.chartRenderAllowed ? "true" : "false"}`,
    `pipeline.presentation.max_chart_panels=${plan.presentation.maxChartPanels}`,
    `pipeline.presentation.chart_guardrail=${plan.presentation.chartGuardrailReason ?? "none"}`,
    `pipeline.live_query_steps=${plan.liveQuerySteps.join(",") || "none"}`,
    "Rules:",
    "- First narrow to the declared source-of-truth and build an internal execution plan before answering.",
    "- Use only read-only DB/API execution for factual claims. Do not answer from generic model knowledge first.",
    "- If verified rows or required joins are missing, explicitly say what data is missing and stop.",
    "- Never invent counts, KPI values, table rows, chart payloads, or external facts.",
    "- If a chart is requested, only emit report-json from verified aggregate rows or verified inline rows/data.",
    "- If chart data is empty or insufficient, omit the chart and return a plain-text missing-data explanation.",
    "- Keep the final user-facing answer concise and grounded in executed evidence only.",
    "Execution hints:",
    ...plan.executionHints.slice(0, 12).map((hint) => `- ${hint}`),
    "[/Unified Read-Only Execution Plan]",
  ];

  return `${lines.join("\n")}\n\n${userMessage}`;
}

export function buildReadOnlyExecutionBlockedReply(
  plan: DomainReadOnlyExecutionPlan,
): string | null {
  if (!plan.blockedReason) {
    return null;
  }

  switch (plan.blockedReason) {
    case "auto_schema_missing":
      return [
        `我判斷這題屬於 ${plan.displayName} 的唯讀查詢，但目前缺少對應 workspace 的 auto-schema，因此無法安全確認欄位與 join。`,
        "我會先停在這裡，不會改用模型猜答案。請先補上對應 workspace 的 auto-schema 後再查詢。",
      ].join("\n");
    case "source_of_truth_unavailable":
      return [
        `我判斷這題屬於 ${plan.displayName} 的唯讀查詢，但目前 source-of-truth 無法使用或查詢被阻擋。`,
        "我會先停在這裡，不會改用模型自由回答。請先確認資料來源、連線或必要資料表是否可讀。",
      ].join("\n");
    default:
      return null;
  }
}
