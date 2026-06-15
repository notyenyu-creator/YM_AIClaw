import type { ErpPlannerPreflight } from "./erp-context-builder";
import type { EnmsPlannerPreflight } from "./enms-context-builder";

export type OperationalSystemHint = "enms" | "erp" | "ycrm" | "none" | null | undefined;

export type OperationalDomainSelection = {
  domain: "enms" | "erp" | "none";
  reason:
    | "explicit_enms_hint"
    | "explicit_erp_hint"
    | "enms_signal_preferred"
    | "erp_signal_only"
    | "no_operational_route";
};

type OperationalRouteInput = {
  currentSystemHint: OperationalSystemHint;
  erpPreflight: ErpPlannerPreflight;
  enmsPreflight: EnmsPlannerPreflight;
};

export function selectOperationalDomainRoute(
  input: OperationalRouteInput,
): OperationalDomainSelection {
  const { currentSystemHint, erpPreflight, enmsPreflight } = input;

  if (currentSystemHint === "enms" && enmsPreflight.shouldRouteToEnms) {
    return {
      domain: "enms",
      reason: "explicit_enms_hint",
    };
  }

  if (currentSystemHint === "erp" && erpPreflight.shouldRouteToErp) {
    return {
      domain: "erp",
      reason: "explicit_erp_hint",
    };
  }

  if (enmsPreflight.shouldRouteToEnms) {
    return {
      domain: "enms",
      reason: "enms_signal_preferred",
    };
  }

  if (erpPreflight.shouldRouteToErp) {
    return {
      domain: "erp",
      reason: "erp_signal_only",
    };
  }

  return {
    domain: "none",
    reason: "no_operational_route",
  };
}
