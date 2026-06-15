const BUILDER_ID = "ycrm_context_builder";
const BUILDER_VERSION = "v0.1";
const DEFAULT_WORKSPACE_ID = "workspace_3joxkr9ofo5hlxjan164egffx";
const AUTO_SCHEMA_PREFIX = "skills/ycrm/reference/auto-schema-";

export type YcrmIntent =
  | "product_help"
  | "entity_summary"
  | "opportunity_analysis"
  | "line_interaction_review"
  | "sales_report"
  | "write_intent"
  | "cross_system_request"
  | "unknown";

export type YcrmConfidence = "low" | "medium" | "high";
export type YcrmWorkspaceSource = "explicit" | "explicit_ycrm" | "default" | "unresolved";
export type YcrmRiskLevel = "L0" | "L1" | "L2" | "L3";

export type YcrmContextBuilderInput = {
  request: {
    user_message: string;
    current_system_hint: string | null;
    requested_workspace: string | null;
    prior_intent_hint: YcrmIntent | null;
    user_locale: string | null;
  };
  runtime_state: {
    available_wiki_pages: string[];
    available_playbooks: string[];
    known_memory_keys: string[];
    available_auto_schema_workspaces: string[];
  };
  defaults: {
    default_workspace_id: string;
  };
};

export const DEFAULT_YCRM_CONTEXT_RUNTIME_STATE: YcrmContextBuilderInput["runtime_state"] = {
  available_wiki_pages: [
    "wiki/entities/customers/YCRM_CUSTOMER_SUMMARY_TEMPLATE.md",
    "wiki/entities/opportunities/YCRM_OPPORTUNITY_SUMMARY_TEMPLATE.md",
    "wiki/operations/ycrm/YCRM_LINE_INTERACTION_SUMMARY_TEMPLATE.md",
  ],
  available_playbooks: [
    "wiki/playbooks/ycrm/YCRM_SALES_ANALYSIS_PLAYBOOK_TEMPLATE.md",
  ],
  known_memory_keys: [
    "known_rule:person_name_is_not_workspace",
    "preference:chart_style",
    "preference:followup_style",
  ],
  available_auto_schema_workspaces: [
    DEFAULT_WORKSPACE_ID,
  ],
};

export function createDefaultYcrmContextInput(
  userMessage = "",
): YcrmContextBuilderInput {
  return {
    request: {
      user_message: userMessage,
      current_system_hint: null,
      requested_workspace: null,
      prior_intent_hint: null,
      user_locale: "zh-TW",
    },
    runtime_state: {
      ...DEFAULT_YCRM_CONTEXT_RUNTIME_STATE,
      available_wiki_pages: [...DEFAULT_YCRM_CONTEXT_RUNTIME_STATE.available_wiki_pages],
      available_playbooks: [...DEFAULT_YCRM_CONTEXT_RUNTIME_STATE.available_playbooks],
      known_memory_keys: [...DEFAULT_YCRM_CONTEXT_RUNTIME_STATE.known_memory_keys],
      available_auto_schema_workspaces: [...DEFAULT_YCRM_CONTEXT_RUNTIME_STATE.available_auto_schema_workspaces],
    },
    defaults: {
      default_workspace_id: DEFAULT_WORKSPACE_ID,
    },
  };
}

export type YcrmContextBuilderOutput = {
  builder: {
    id: typeof BUILDER_ID;
    version: typeof BUILDER_VERSION;
  };
  decision: {
    should_route_to_ycrm: boolean;
    confidence: YcrmConfidence;
    intent: YcrmIntent;
  };
  workspace: {
    resolved_workspace_id: string | null;
    source: YcrmWorkspaceSource;
    needs_workspace_validation: boolean;
  };
  context_bundle: {
    rules: string[];
    references: string[];
    wiki: string[];
    playbooks: string[];
    memory_keys: string[];
  };
  live_requirements: {
    real_query_required: boolean;
    auto_schema_required: boolean;
    workspace_member_lookup_required: boolean;
    report_json_values_required: boolean;
    rest_write_required: boolean;
    readback_required: boolean;
  };
  risk: {
    level: YcrmRiskLevel;
    human_confirmation_required: boolean;
  };
  handoff: {
    cross_system: boolean;
    target_systems: string[];
  };
  presentation: {
    optional_chart_requested: boolean;
    chart_render_allowed: boolean;
    chart_guardrail_reason: string | null;
    max_chart_panels: number;
  };
  notes: {
    warnings: string[];
    blockers: string[];
  };
};

export type YcrmPlannerPreflight = {
  system: "ycrm";
  updatedAt: number;
  validationState?: "heuristic" | "validated" | "stale";
  intent: YcrmIntent;
  confidence: YcrmConfidence;
  shouldRouteToYcrm: boolean;
  workspaceId: string | null;
  needsWorkspaceValidation: boolean;
  warnings: string[];
  blockers: string[];
  crossSystem: boolean;
  targetSystems: string[];
};

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function lowerIncludes(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

function hasChineseNamePattern(message: string): boolean {
  return /[\u4e00-\u9fff]{2,4}(的商機|目前負責|負責的客戶|負責客戶)/.test(message);
}

function hasWesternNamePattern(message: string): boolean {
  return /\b[A-Z][a-z]+ [A-Z][a-z]+\b/.test(message);
}

function isPersonLookupMessage(message: string): boolean {
  return hasWesternNamePattern(message)
    || hasChineseNamePattern(message)
    || message.includes("負責")
    || message.includes("業務");
}

function hasChartRequest(message: string): boolean {
  return ["圖表", "chart", "報表", "分布", "pipeline"].some((keyword) => lowerIncludes(message, keyword));
}

function hasEntitySummaryVerb(message: string): boolean {
  return [
    "整理",
    "摘要",
    "概況",
    "背景",
    "介紹",
    "看看",
    "總結",
    "summary",
  ].some((keyword) => lowerIncludes(message, keyword));
}

function isShortFollowupExpansionMessage(message: string): boolean {
  const normalized = normalizeWhitespace(message).toLowerCase();
  if (!normalized || normalized.length > 80) {
    return false;
  }

  return [
    "圖表",
    "chart",
    "全部",
    "完整",
    "展開",
    "更多",
    "明細",
    "細節",
    "用圖",
    "畫圖",
    "分布",
    "總數",
    "金額",
    "件數",
  ].some((keyword) => normalized.includes(keyword.toLowerCase()));
}

function hasCrossSystemKeyword(message: string): boolean {
  return [
    "訂單", "order",
    "庫存", "inventory",
    "工單", "work order",
    "收款", "invoice",
    "出貨", "shipment",
    "批號", "lot",
    "設備", "machine",
    "能源", "energy",
  ].some((keyword) => lowerIncludes(message, keyword));
}

function detectIntent(message: string, priorIntentHint: YcrmIntent | null): YcrmIntent {
  if (priorIntentHint === "entity_summary" && isShortFollowupExpansionMessage(message)) {
    return "entity_summary";
  }
  if (hasCrossSystemKeyword(message)) {
    return "cross_system_request";
  }
  if (["新增", "建立", "create", "update", "更新", "修改", "備註", "note", "跟進"].some((keyword) => lowerIncludes(message, keyword))) {
    return "write_intent";
  }
  if (["line", "LINE", "對話", "聊天", "訊息", "互動"].some((keyword) => lowerIncludes(message, keyword))) {
    if (["設定", "怎麼", "auto reply", "自動回覆", "功能"].some((keyword) => lowerIncludes(message, keyword))) {
      return "product_help";
    }
    return "line_interaction_review";
  }
  if (["新商機", "最近一週", "工作區"].some((keyword) => lowerIncludes(message, keyword))
      && ["商機", "opportunity"].some((keyword) => lowerIncludes(message, keyword))) {
    return "entity_summary";
  }
  if ((lowerIncludes(message, "y-crm") || message.includes("Y-CRM"))
      && isPersonLookupMessage(message)
      && (hasEntitySummaryVerb(message)
        || lowerIncludes(message, "工作區")
        || lowerIncludes(message, "workspace"))) {
    return "entity_summary";
  }
  if (hasChartRequest(message) || ["分析", "analysis", "業績", "sales report"].some((keyword) => lowerIncludes(message, keyword))) {
    return "sales_report";
  }
  if (["商機", "opportunity", "pipeline"].some((keyword) => lowerIncludes(message, keyword))
      && ["風險", "健康度", "分析"].some((keyword) => lowerIncludes(message, keyword))) {
    return "opportunity_analysis";
  }
  if (["設定", "怎麼", "功能", "支援", "可以做什麼", "如何"].some((keyword) => lowerIncludes(message, keyword))
      && lowerIncludes(message, "y-crm")) {
    return "product_help";
  }
  if (["客戶", "公司", "聯絡人", "背景", "名單"].some((keyword) => lowerIncludes(message, keyword))) {
    return "entity_summary";
  }
  return "unknown";
}

function shouldRouteToYcrm(message: string, hint: string | null, intent: YcrmIntent): boolean {
  const mentionsYcrm = lowerIncludes(message, "y-crm") || message.includes("Y-CRM");
  const negativeYcrmMention = /(不要|別|勿|不用|不看|排除|不要查|不要用).{0,16}(Y-CRM|y-crm)|(Y-CRM|y-crm).{0,16}(不要|別|勿|不用|不看|排除)/i.test(message);

  if (hint === "ycrm") {
    return true;
  }

  if (negativeYcrmMention) {
    return false;
  }

  if (mentionsYcrm) {
    return true;
  }
  if (["客戶", "商機", "聯絡人", "公司", "業務", "line", "LINE"].some((keyword) => lowerIncludes(message, keyword))) {
    return intent !== "unknown";
  }
  return false;
}

function resolveWorkspace(
  message: string,
  requestedWorkspace: string | null,
  defaultWorkspaceId: string,
): YcrmContextBuilderOutput["workspace"] {
  if (requestedWorkspace) {
    return {
      resolved_workspace_id: requestedWorkspace,
      source: "explicit",
      needs_workspace_validation: false,
    };
  }

  const mentionsYcrm = lowerIncludes(message, "y-crm") || message.includes("Y-CRM");
  const explicitYcrmWorkspace = /Y-CRM\s*工作區|Y-CRM workspace|Y-CRM 裡/.test(message);
  const hasNamedWorkspaceLikeRef = /公司/.test(message) && mentionsYcrm && !explicitYcrmWorkspace;

  if (hasNamedWorkspaceLikeRef) {
    return {
      resolved_workspace_id: null,
      source: "unresolved",
      needs_workspace_validation: true,
    };
  }

  if (mentionsYcrm) {
    return {
      resolved_workspace_id: defaultWorkspaceId,
      source: "explicit_ycrm",
      needs_workspace_validation: false,
    };
  }

  return {
    resolved_workspace_id: defaultWorkspaceId,
    source: "default",
    needs_workspace_validation: false,
  };
}

function buildAutoSchemaReference(workspaceId: string | null, available: string[]): string[] {
  if (!workspaceId || !available.includes(workspaceId)) {
    return [];
  }
  return [`${AUTO_SCHEMA_PREFIX}${workspaceId}.md`];
}

function findAvailable(paths: string[], pattern: string): string[] {
  return paths.filter((path) => path.includes(pattern));
}

function buildContextBundle(
  input: YcrmContextBuilderInput,
  intent: YcrmIntent,
  workspaceId: string | null,
): YcrmContextBuilderOutput["context_bundle"] {
  const rules = [
    "skills/ycrm/SKILL.md",
    "schema/integration-profiles/ycrm.md",
  ];
  const references: string[] = [];
  const wiki: string[] = [];
  const playbooks: string[] = [];
  const memoryKeys: string[] = [];

  const autoSchemaRefs = buildAutoSchemaReference(workspaceId, input.runtime_state.available_auto_schema_workspaces);

  if (intent === "product_help" || intent === "line_interaction_review") {
    references.push("skills/ycrm/reference/feature-guide.md");
  }
  if (intent === "sales_report") {
    references.push("skills/ycrm/reference/analysis-templates.md");
  }
  if (intent !== "product_help" && autoSchemaRefs.length > 0) {
    references.push(...autoSchemaRefs);
  }

  if (intent === "entity_summary" || intent === "write_intent" || intent === "cross_system_request" || intent === "line_interaction_review") {
    wiki.push(...findAvailable(input.runtime_state.available_wiki_pages, "YCRM_CUSTOMER_SUMMARY_TEMPLATE.md"));
  }
  if (intent === "sales_report" || intent === "cross_system_request" || intent === "opportunity_analysis") {
    wiki.push(...findAvailable(input.runtime_state.available_wiki_pages, "YCRM_OPPORTUNITY_SUMMARY_TEMPLATE.md"));
  }
  if (intent === "line_interaction_review") {
    wiki.push(...findAvailable(input.runtime_state.available_wiki_pages, "YCRM_LINE_INTERACTION_SUMMARY_TEMPLATE.md"));
  }
  if (intent === "sales_report") {
    playbooks.push(...findAvailable(input.runtime_state.available_playbooks, "YCRM_SALES_ANALYSIS_PLAYBOOK_TEMPLATE.md"));
  }

  if (isPersonLookupMessage(input.request.user_message)
      && input.runtime_state.known_memory_keys.includes("known_rule:person_name_is_not_workspace")) {
    memoryKeys.push("known_rule:person_name_is_not_workspace");
  }
  if (intent === "sales_report" && input.runtime_state.known_memory_keys.includes("preference:chart_style")) {
    memoryKeys.push("preference:chart_style");
  }
  if (intent === "line_interaction_review" && input.runtime_state.known_memory_keys.includes("preference:followup_style")) {
    memoryKeys.push("preference:followup_style");
  }

  return {
    rules,
    references: Array.from(new Set(references)),
    wiki: Array.from(new Set(wiki)),
    playbooks: Array.from(new Set(playbooks)),
    memory_keys: Array.from(new Set(memoryKeys)),
  };
}

function buildLiveRequirements(message: string, intent: YcrmIntent): YcrmContextBuilderOutput["live_requirements"] {
  const realQueryRequired = !["product_help", "unknown"].includes(intent);
  const workspaceMemberLookupRequired = isPersonLookupMessage(message)
    && ["entity_summary", "sales_report", "opportunity_analysis"].includes(intent);
  const reportJsonValuesRequired = intent === "sales_report" && hasChartRequest(message);
  const restWriteRequired = intent === "write_intent";
  const readbackRequired = intent === "write_intent";

  return {
    real_query_required: realQueryRequired,
    auto_schema_required: realQueryRequired,
    workspace_member_lookup_required: workspaceMemberLookupRequired,
    report_json_values_required: reportJsonValuesRequired,
    rest_write_required: restWriteRequired,
    readback_required: readbackRequired,
  };
}

function buildHandoff(message: string, intent: YcrmIntent): YcrmContextBuilderOutput["handoff"] {
  if (intent !== "cross_system_request") {
    return { cross_system: false, target_systems: [] };
  }

  const targets = new Set<string>();
  if (["訂單", "order", "收款", "invoice"].some((keyword) => lowerIncludes(message, keyword))) {
    targets.add("erp");
  }
  if (["庫存", "inventory", "出貨", "shipment", "倉"].some((keyword) => lowerIncludes(message, keyword))) {
    targets.add("wms");
  }
  if (["工單", "work order", "設備", "machine"].some((keyword) => lowerIncludes(message, keyword))) {
    targets.add("mes");
  }
  if (["能源", "energy"].some((keyword) => lowerIncludes(message, keyword))) {
    targets.add("ems");
  }

  return {
    cross_system: true,
    target_systems: Array.from(targets),
  };
}

function buildPresentation(
  message: string,
  intent: YcrmIntent,
): YcrmContextBuilderOutput["presentation"] {
  const optionalChartRequested = hasChartRequest(message);

  if (!optionalChartRequested) {
    return {
      optional_chart_requested: false,
      chart_render_allowed: false,
      chart_guardrail_reason: null,
      max_chart_panels: 0,
    };
  }

  if (intent === "sales_report") {
    return {
      optional_chart_requested: true,
      chart_render_allowed: true,
      chart_guardrail_reason: null,
      max_chart_panels: 2,
    };
  }

  return {
    optional_chart_requested: true,
    chart_render_allowed: true,
    chart_guardrail_reason: "chart_optional_if_non_empty_aggregates_available",
    max_chart_panels: 2,
  };
}

function buildNotes(
  input: YcrmContextBuilderInput,
  intent: YcrmIntent,
  workspace: YcrmContextBuilderOutput["workspace"],
  contextBundle: YcrmContextBuilderOutput["context_bundle"],
  liveRequirements: YcrmContextBuilderOutput["live_requirements"],
  handoff: YcrmContextBuilderOutput["handoff"],
  presentation: YcrmContextBuilderOutput["presentation"],
): YcrmContextBuilderOutput["notes"] {
  const warnings: string[] = [];
  const blockers: string[] = [];

  if (workspace.needs_workspace_validation) {
    warnings.push("person_name_may_be_misread_as_workspace");
  }
  if (["entity_summary", "line_interaction_review", "cross_system_request"].includes(intent)
      && contextBundle.wiki.length === 0) {
    warnings.push("wiki_not_found_fallback_to_live_query");
  }
  if (intent === "sales_report" && liveRequirements.report_json_values_required) {
    warnings.push("chart_request_requires_real_data_first");
  }
  if (presentation.chart_guardrail_reason === "chart_optional_if_non_empty_aggregates_available") {
    warnings.push("chart_optional_requires_non_empty_aggregates");
  }
  if (intent === "unknown") {
    blockers.push("intent_unknown");
  }
  if (liveRequirements.auto_schema_required && workspace.resolved_workspace_id
      && !input.runtime_state.available_auto_schema_workspaces.includes(workspace.resolved_workspace_id)) {
    blockers.push("auto_schema_missing");
  }
  if (handoff.cross_system) {
    warnings.push("ycrm_provides_only_commercial_context_here");
    blockers.push("cross_system_required");
  }

  return {
    warnings: Array.from(new Set(warnings)),
    blockers: Array.from(new Set(blockers)),
  };
}

function confidenceFor(intent: YcrmIntent, shouldRoute: boolean, workspaceNeedsValidation: boolean): YcrmConfidence {
  if (!shouldRoute || intent === "unknown") {
    return "low";
  }
  if (workspaceNeedsValidation) {
    return "medium";
  }
  return "high";
}

function riskFor(intent: YcrmIntent): YcrmContextBuilderOutput["risk"] {
  if (intent === "write_intent") {
    return { level: "L1", human_confirmation_required: false };
  }
  return { level: "L0", human_confirmation_required: false };
}

export function buildYcrmContext(input: YcrmContextBuilderInput): YcrmContextBuilderOutput {
  const message = normalizeWhitespace(input.request.user_message);
  const defaultWorkspaceId = input.defaults.default_workspace_id || DEFAULT_WORKSPACE_ID;
  const intent = detectIntent(message, input.request.prior_intent_hint);
  const shouldRoute = shouldRouteToYcrm(message, input.request.current_system_hint, intent);
  const workspace = resolveWorkspace(message, input.request.requested_workspace, defaultWorkspaceId);
  const contextBundle = buildContextBundle(input, intent, workspace.resolved_workspace_id);
  const liveRequirements = buildLiveRequirements(message, intent);
  const handoff = buildHandoff(message, intent);
  const presentation = buildPresentation(message, intent);
  const notes = buildNotes(input, intent, workspace, contextBundle, liveRequirements, handoff, presentation);

  return {
    builder: {
      id: BUILDER_ID,
      version: BUILDER_VERSION,
    },
    decision: {
      should_route_to_ycrm: shouldRoute,
      confidence: confidenceFor(intent, shouldRoute, workspace.needs_workspace_validation),
      intent,
    },
    workspace,
    context_bundle: contextBundle,
    live_requirements: liveRequirements,
    risk: riskFor(intent),
    handoff,
    presentation,
    notes,
  };
}

export function summarizeYcrmContextPlan(
  plan: YcrmContextBuilderOutput,
): YcrmPlannerPreflight {
  return {
    system: "ycrm",
    updatedAt: Date.now(),
    validationState: "heuristic",
    intent: plan.decision.intent,
    confidence: plan.decision.confidence,
    shouldRouteToYcrm: plan.decision.should_route_to_ycrm,
    workspaceId: plan.workspace.resolved_workspace_id,
    needsWorkspaceValidation: plan.workspace.needs_workspace_validation,
    warnings: [...plan.notes.warnings],
    blockers: [...plan.notes.blockers],
    crossSystem: plan.handoff.cross_system,
    targetSystems: [...plan.handoff.target_systems],
  };
}

export function shouldPersistYcrmPlannerPreflight(
  summary: YcrmPlannerPreflight,
): boolean {
  return summary.shouldRouteToYcrm || summary.intent !== "unknown";
}

export function decorateMessageWithYcrmContextPlan(
  userMessage: string,
  plan: YcrmContextBuilderOutput,
): string {
  if (!plan.decision.should_route_to_ycrm) {
    return userMessage;
  }

  const needs: string[] = [];
  if (plan.live_requirements.auto_schema_required) {
    needs.push("auto_schema");
  }
  if (plan.live_requirements.workspace_member_lookup_required) {
    needs.push("workspace_member_lookup");
  }
  if (plan.live_requirements.report_json_values_required) {
    needs.push("report_json_values");
  }
  if (plan.live_requirements.rest_write_required) {
    needs.push("rest_write");
  }
  if (plan.live_requirements.readback_required) {
    needs.push("readback");
  }

  const plannerLines = [
    "[Y-CRM Planner Preflight]",
    `intent=${plan.decision.intent}`,
    `confidence=${plan.decision.confidence}`,
    `workspace=${plan.workspace.resolved_workspace_id ?? "unresolved"}`,
    `needs_workspace_validation=${plan.workspace.needs_workspace_validation ? "true" : "false"}`,
    `needs=${needs.length > 0 ? needs.join(",") : "none"}`,
    `presentation.optional_chart_requested=${plan.presentation.optional_chart_requested ? "true" : "false"}`,
    `presentation.chart_render_allowed=${plan.presentation.chart_render_allowed ? "true" : "false"}`,
    `presentation.max_chart_panels=${plan.presentation.max_chart_panels}`,
    `warnings=${plan.notes.warnings.length > 0 ? plan.notes.warnings.join(",") : "none"}`,
    `blockers=${plan.notes.blockers.length > 0 ? plan.notes.blockers.join(",") : "none"}`,
    `cross_system=${plan.handoff.cross_system ? plan.handoff.target_systems.join(",") : "no"}`,
    "Use the Y-CRM skill flow when relevant, keep source-of-truth boundaries explicit, and do not fabricate CRM data.",
    "[/Y-CRM Planner Preflight]",
  ];

  return `${plannerLines.join("\n")}\n\n${userMessage}`;
}
