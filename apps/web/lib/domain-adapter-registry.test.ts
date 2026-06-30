import { describe, expect, it } from "vitest";
import {
  domainAdapterSupportsVerifiedExecution,
  domainAdapterSupportsPhaseOneReadOnlyIntent,
  domainAdapterUsesDbFirst,
  getDomainAdapterContract,
  listDomainAdapterContracts,
} from "./domain-adapter-registry";
import { DOMAIN_EXECUTION_PIPELINE_CONTRACT } from "./domain-adapter-contract";

describe("domain-adapter-registry", () => {
  it("lists the current operational domain adapters", () => {
    expect(listDomainAdapterContracts().map((contract) => contract.id)).toEqual([
      "enms",
      "erp",
      "ycrm",
    ]);
  });

  it("marks all current adapters as db-first", () => {
    expect(domainAdapterUsesDbFirst("enms")).toBe(true);
    expect(domainAdapterUsesDbFirst("erp")).toBe(true);
    expect(domainAdapterUsesDbFirst("ycrm")).toBe(true);
  });

  it("shows verified direct execution for EnMS, ERP, and Y-CRM today", () => {
    expect(domainAdapterSupportsVerifiedExecution("enms")).toBe(true);
    expect(domainAdapterSupportsVerifiedExecution("erp")).toBe(true);
    expect(domainAdapterSupportsVerifiedExecution("ycrm")).toBe(true);
  });

  it("keeps chart rendering tied to verified aggregates across all domains", () => {
    for (const contract of listDomainAdapterContracts()) {
      expect(contract.executionPolicy.chartRequiresVerifiedAggregates).toBe(true);
    }
  });

  it("exposes the shared pipeline phases used by the target architecture", () => {
    expect(DOMAIN_EXECUTION_PIPELINE_CONTRACT.adapterIds).toEqual([
      "enms",
      "erp",
      "ycrm",
    ]);
    expect(DOMAIN_EXECUTION_PIPELINE_CONTRACT.sharedPhases).toContain(
      "structured_execution_plan",
    );
  });

  it("maps EnMS to the current verified query and direct-answer implementations", () => {
    const contract = getDomainAdapterContract("enms");
    expect(contract.implementation.verifiedDirectQuery).toBe(
      "apps/web/lib/enms-verified-direct-query.ts",
    );
    expect(contract.implementation.deterministicDirectAnswer).toBe(
      "apps/web/lib/enms-direct-answer.ts",
    );
    expect(contract.executionPolicy.currentVerifiedCoverage).toBe("partial");
  });

  it("tracks phase-one unified read-only coverage per adapter", () => {
    expect(
      domainAdapterSupportsPhaseOneReadOnlyIntent("enms", "natural_language_query"),
    ).toBe(true);
    expect(
      domainAdapterSupportsPhaseOneReadOnlyIntent("erp", "inventory_status"),
    ).toBe(true);
    expect(
      domainAdapterSupportsPhaseOneReadOnlyIntent("ycrm", "entity_summary"),
    ).toBe(true);
    expect(
      domainAdapterSupportsPhaseOneReadOnlyIntent("ycrm", "write_intent"),
    ).toBe(false);
  });
});
