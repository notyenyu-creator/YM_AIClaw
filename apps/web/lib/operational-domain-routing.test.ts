import { describe, expect, it } from "vitest";
import type { ErpPlannerPreflight } from "./erp-context-builder";
import type { EnmsPlannerPreflight } from "./enms-context-builder";
import { selectOperationalDomainRoute } from "./operational-domain-routing";

function makeErpPreflight(
  overrides: Partial<ErpPlannerPreflight> = {},
): ErpPlannerPreflight {
  return {
    system: "erp",
    updatedAt: Date.now(),
    intent: "inventory_status",
    confidence: "medium",
    shouldRouteToErp: false,
    matchedKeywords: [],
    warnings: [],
    presentation: {
      optional_chart_requested: false,
      chart_render_allowed: false,
      chart_guardrail_reason: null,
      max_chart_panels: 0,
    },
    ...overrides,
  };
}

function makeEnmsPreflight(
  overrides: Partial<EnmsPlannerPreflight> = {},
): EnmsPlannerPreflight {
  return {
    system: "enms",
    updatedAt: Date.now(),
    intent: "natural_language_query",
    confidence: "medium",
    shouldRouteToEnms: false,
    matchedKeywords: [],
    warnings: [],
    presentation: {
      optional_chart_requested: false,
      chart_render_allowed: false,
      chart_guardrail_reason: null,
      max_chart_panels: 0,
    },
    ...overrides,
  };
}

describe("selectOperationalDomainRoute", () => {
  it("prefers explicit EnMS hint when EnMS route is available", () => {
    const result = selectOperationalDomainRoute({
      currentSystemHint: "enms",
      erpPreflight: makeErpPreflight({ shouldRouteToErp: true }),
      enmsPreflight: makeEnmsPreflight({ shouldRouteToEnms: true }),
    });

    expect(result).toEqual({
      domain: "enms",
      reason: "explicit_enms_hint",
    });
  });

  it("prefers explicit ERP hint when ERP route is available", () => {
    const result = selectOperationalDomainRoute({
      currentSystemHint: "erp",
      erpPreflight: makeErpPreflight({ shouldRouteToErp: true }),
      enmsPreflight: makeEnmsPreflight({ shouldRouteToEnms: true }),
    });

    expect(result).toEqual({
      domain: "erp",
      reason: "explicit_erp_hint",
    });
  });

  it("prefers EnMS over ERP for mixed operational signals without explicit ERP hint", () => {
    const result = selectOperationalDomainRoute({
      currentSystemHint: null,
      erpPreflight: makeErpPreflight({ shouldRouteToErp: true }),
      enmsPreflight: makeEnmsPreflight({ shouldRouteToEnms: true }),
    });

    expect(result).toEqual({
      domain: "enms",
      reason: "enms_signal_preferred",
    });
  });

  it("falls back to ERP when only ERP matched", () => {
    const result = selectOperationalDomainRoute({
      currentSystemHint: null,
      erpPreflight: makeErpPreflight({ shouldRouteToErp: true }),
      enmsPreflight: makeEnmsPreflight({ shouldRouteToEnms: false }),
    });

    expect(result).toEqual({
      domain: "erp",
      reason: "erp_signal_only",
    });
  });

  it("returns none when neither ERP nor EnMS matched", () => {
    const result = selectOperationalDomainRoute({
      currentSystemHint: null,
      erpPreflight: makeErpPreflight(),
      enmsPreflight: makeEnmsPreflight(),
    });

    expect(result).toEqual({
      domain: "none",
      reason: "no_operational_route",
    });
  });
});
