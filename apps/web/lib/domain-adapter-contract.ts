export type DomainAdapterId = "enms" | "erp" | "ycrm";

export type DomainSourceOfTruthKind =
  | "postgres"
  | "timescaledb"
  | "workspace_db"
  | "workspace_auto_schema"
  | "reference_file"
  | "wiki";

export type DomainExecutionStrategy =
  | "verified_direct_query"
  | "deterministic_direct_answer"
  | "model_guided_live_query"
  | "reference_guided_answer";

export type DomainExecutionCoverage = "high" | "partial" | "low";
export type DomainReadOnlySupportLevel = "enabled" | "excluded";

export type DomainSourceOfTruth = {
  kind: DomainSourceOfTruthKind;
  label: string;
  primary: boolean;
  notes?: string[];
};

export type DomainExecutionPolicy = {
  dbFirst: boolean;
  chartRequiresVerifiedAggregates: boolean;
  externalInfoRequiresExplicitUserRequest: boolean;
  writeOperationsAllowed: boolean;
  defaultStrategy: DomainExecutionStrategy;
  fallbackStrategies: DomainExecutionStrategy[];
  currentVerifiedCoverage: DomainExecutionCoverage;
};

export type DomainReadOnlyIntentSupport = {
  phaseOneReadOnlyIntents: string[];
  excludedIntents: string[];
};

export type DomainPipelineImplementation = {
  routeDomain: DomainAdapterId;
  contextBuilder: string;
  contextPack: string;
  bootstrap: string;
  verifiedDirectQuery: string | null;
  deterministicDirectAnswer: string | null;
  learningDraft: string;
  learningAutoTrigger: string;
  learningPromotion: string;
  learningWriteback: string;
};

export type DomainAdapterContract = {
  id: DomainAdapterId;
  displayName: string;
  scope: string;
  summary: string;
  sourceOfTruth: DomainSourceOfTruth[];
  executionPolicy: DomainExecutionPolicy;
  readOnlySupport: DomainReadOnlyIntentSupport;
  implementation: DomainPipelineImplementation;
};

export type DomainExecutionPipelineContract = {
  version: string;
  summary: string;
  sharedPhases: string[];
  adapterIds: DomainAdapterId[];
};

export const DOMAIN_EXECUTION_PIPELINE_CONTRACT: DomainExecutionPipelineContract =
  {
    version: "v0",
    summary:
      "Shared DB-first execution pipeline contract for system routing, source-of-truth lookup, verified execution, chart rendering, and learning writeback.",
    sharedPhases: [
      "domain_route",
      "planner_preflight",
      "source_of_truth_scope",
      "context_pack",
      "bootstrap_snapshot",
      "structured_execution_plan",
      "read_only_execution",
      "evidence_verification",
      "answer_and_chart_render",
      "review_and_learning_writeback",
    ],
    adapterIds: ["enms", "erp", "ycrm"],
  };
