import { describe, expect, it } from "vitest";
import { collectDomainParityAudit } from "./domain-parity-audit";

describe("collectDomainParityAudit", () => {
  it("verifies Y-CRM, ERP, and EnMS against the PM/RD/QA/TPM parity manifest", () => {
    const report = collectDomainParityAudit();

    expect(report.commonAgentSkills.every((check) => check.exists)).toBe(true);
    expect(report.passed).toBe(true);

    for (const system of report.systems) {
      expect(system.passedChecks).toBe(system.totalChecks);
      expect(system.passed).toBe(true);
      for (const role of system.roles) {
        expect(role.passed).toBe(true);
        expect(role.checks.every((check) => check.exists)).toBe(true);
      }
    }
  });
});
