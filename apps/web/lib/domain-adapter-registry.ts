import type { DomainAdapterContract, DomainAdapterId } from "./domain-adapter-contract";

const DOMAIN_ADAPTER_REGISTRY: Record<DomainAdapterId, DomainAdapterContract> = {
  enms: {
    id: "enms",
    displayName: "EnMS",
    scope: "energy_management",
    summary:
      "Energy management adapter grounded in local EnMS PostgreSQL / TimescaleDB facts, with partial verified direct-query coverage for high-value question types.",
    sourceOfTruth: [
      {
        kind: "postgres",
        label: "EnMS PostgreSQL (.27)",
        primary: true,
        notes: ["Read-only operational source for master data, accounts, sites, and billing tables."],
      },
      {
        kind: "timescaledb",
        label: "EnMS TimescaleDB summary/raw layers",
        primary: true,
        notes: [
          "Primary source for demand, consumption, power-factor, anomaly, and freshness analytics.",
        ],
      },
      {
        kind: "wiki",
        label: "EnMS AI Wiki / playbooks",
        primary: false,
        notes: ["Used as durable operational knowledge, never as the measurement source-of-truth."],
      },
    ],
    executionPolicy: {
      dbFirst: true,
      chartRequiresVerifiedAggregates: true,
      externalInfoRequiresExplicitUserRequest: true,
      writeOperationsAllowed: false,
      defaultStrategy: "model_guided_live_query",
      fallbackStrategies: [
        "verified_direct_query",
        "deterministic_direct_answer",
        "reference_guided_answer",
      ],
      currentVerifiedCoverage: "partial",
    },
    readOnlySupport: {
      phaseOneReadOnlyIntents: [
        "demand_forecast",
        "anomaly_detection",
        "natural_language_query",
        "site_benchmarking",
        "alert_governance",
        "efficiency_analysis",
        "raw_trace",
      ],
      excludedIntents: ["unknown"],
    },
    implementation: {
      routeDomain: "enms",
      contextBuilder: "apps/web/lib/enms-context-builder.ts",
      contextPack: "apps/web/lib/enms-context-pack.ts",
      bootstrap: "apps/web/lib/domain-bootstrap.ts",
      verifiedDirectQuery: "apps/web/lib/enms-verified-direct-query.ts",
      deterministicDirectAnswer: "apps/web/lib/enms-direct-answer.ts",
      learningDraft: "apps/web/lib/enms-learning-draft.ts",
      learningAutoTrigger: "apps/web/lib/enms-learning-auto-trigger.ts",
      learningPromotion: "apps/web/lib/enms-learning-promotion.ts",
      learningWriteback: "apps/web/lib/enms-learning-writeback.ts",
    },
  },
  erp: {
    id: "erp",
    displayName: "ERP",
    scope: "enterprise_resource_planning",
    summary:
      "ERP adapter grounded in ERP PostgreSQL rows and schema references, currently relying on model-guided live queries rather than a dedicated verified direct-query layer.",
    sourceOfTruth: [
      {
        kind: "postgres",
        label: "ERP PostgreSQL",
        primary: true,
        notes: ["Read-only transaction source for company, customer, order, inventory, and finance data."],
      },
      {
        kind: "reference_file",
        label: "ERP auto-schema reference",
        primary: false,
        notes: ["Fallback structure guide when live introspection is partial or unavailable."],
      },
      {
        kind: "wiki",
        label: "ERP AI Wiki / playbooks",
        primary: false,
        notes: ["Operating knowledge layer, not the transaction source-of-truth."],
      },
    ],
    executionPolicy: {
      dbFirst: true,
      chartRequiresVerifiedAggregates: true,
      externalInfoRequiresExplicitUserRequest: true,
      writeOperationsAllowed: false,
      defaultStrategy: "model_guided_live_query",
      fallbackStrategies: ["verified_direct_query", "reference_guided_answer"],
      currentVerifiedCoverage: "partial",
    },
    readOnlySupport: {
      phaseOneReadOnlyIntents: [
        "sales_order",
        "purchase_order",
        "inventory_status",
        "shipping_status",
        "production_status",
        "service_ticket",
        "finance_doc",
      ],
      excludedIntents: ["unknown"],
    },
    implementation: {
      routeDomain: "erp",
      contextBuilder: "apps/web/lib/erp-context-builder.ts",
      contextPack: "apps/web/lib/erp-context-pack.ts",
      bootstrap: "apps/web/lib/domain-bootstrap.ts",
      verifiedDirectQuery: "apps/web/lib/erp-verified-direct-query.ts",
      deterministicDirectAnswer: null,
      learningDraft: "apps/web/lib/erp-learning-draft.ts",
      learningAutoTrigger: "apps/web/lib/erp-learning-auto-trigger.ts",
      learningPromotion: "apps/web/lib/erp-learning-promotion.ts",
      learningWriteback: "apps/web/lib/erp-learning-writeback.ts",
    },
  },
  ycrm: {
    id: "ycrm",
    displayName: "Y-CRM",
    scope: "customer_relationship_management",
    summary:
      "Y-CRM adapter grounded in workspace data plus matching auto-schema references, with partial verified direct-query coverage for safe count/chart questions and schema-constrained routing.",
    sourceOfTruth: [
      {
        kind: "workspace_db",
        label: "Y-CRM workspace live data",
        primary: true,
        notes: ["Primary source for customer, contact, opportunity, and interaction facts."],
      },
      {
        kind: "workspace_auto_schema",
        label: "Y-CRM workspace auto-schema",
        primary: true,
        notes: ["Primary source for field names, owner foreign keys, and safe join semantics."],
      },
      {
        kind: "wiki",
        label: "Y-CRM AI Wiki / playbooks",
        primary: false,
        notes: ["Durable knowledge layer used after workspace truth is confirmed."],
      },
    ],
    executionPolicy: {
      dbFirst: true,
      chartRequiresVerifiedAggregates: true,
      externalInfoRequiresExplicitUserRequest: true,
      writeOperationsAllowed: false,
      defaultStrategy: "model_guided_live_query",
      fallbackStrategies: ["verified_direct_query", "reference_guided_answer"],
      currentVerifiedCoverage: "partial",
    },
    readOnlySupport: {
      phaseOneReadOnlyIntents: [
        "product_help",
        "entity_summary",
        "opportunity_analysis",
        "line_interaction_review",
        "sales_report",
      ],
      excludedIntents: ["write_intent", "cross_system_request", "unknown"],
    },
    implementation: {
      routeDomain: "ycrm",
      contextBuilder: "apps/web/lib/ycrm-context-builder.ts",
      contextPack: "apps/web/lib/ycrm-context-pack.ts",
      bootstrap: "apps/web/lib/domain-bootstrap.ts",
      verifiedDirectQuery: "apps/web/lib/ycrm-verified-direct-query.ts",
      deterministicDirectAnswer: null,
      learningDraft: "apps/web/lib/ycrm-learning-draft.ts",
      learningAutoTrigger: "apps/web/lib/ycrm-learning-auto-trigger.ts",
      learningPromotion: "apps/web/lib/ycrm-learning-promotion.ts",
      learningWriteback: "apps/web/lib/ycrm-learning-writeback.ts",
    },
  },
};

export function listDomainAdapterContracts(): DomainAdapterContract[] {
  return Object.values(DOMAIN_ADAPTER_REGISTRY);
}

export function getDomainAdapterContract(
  id: DomainAdapterId,
): DomainAdapterContract {
  return DOMAIN_ADAPTER_REGISTRY[id];
}

export function domainAdapterSupportsVerifiedExecution(
  id: DomainAdapterId,
): boolean {
  return Boolean(DOMAIN_ADAPTER_REGISTRY[id].implementation.verifiedDirectQuery);
}

export function domainAdapterUsesDbFirst(id: DomainAdapterId): boolean {
  return DOMAIN_ADAPTER_REGISTRY[id].executionPolicy.dbFirst;
}

export function domainAdapterSupportsPhaseOneReadOnlyIntent(
  id: DomainAdapterId,
  intent: string | null | undefined,
): boolean {
  if (!intent) {
    return false;
  }
  return DOMAIN_ADAPTER_REGISTRY[id].readOnlySupport.phaseOneReadOnlyIntents.includes(
    intent,
  );
}
