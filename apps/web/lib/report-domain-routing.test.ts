import { describe, expect, it } from "vitest";
import {
  collectExternalPgReportDomains,
  normalizeExternalPgReportDomain,
} from "./report-domain-routing";

describe("report-domain-routing", () => {
  it("normalizes known external PostgreSQL domains", () => {
    expect(normalizeExternalPgReportDomain("ycrm")).toBe("ycrm");
    expect(normalizeExternalPgReportDomain("Y-CRM")).toBe("ycrm");
    expect(normalizeExternalPgReportDomain("erp")).toBe("erp");
    expect(normalizeExternalPgReportDomain("EnMS")).toBe("enms");
  });

  it("detects catalog-qualified external PostgreSQL references", () => {
    expect(
      collectExternalPgReportDomains(
        'SELECT * FROM ycrm.workspace_3joxkr9ofo5hlxjan164egffx."opportunity"',
      ),
    ).toEqual(["ycrm"]);
    expect(
      collectExternalPgReportDomains('SELECT * FROM erp.public."SO"'),
    ).toEqual(["erp"]);
    expect(
      collectExternalPgReportDomains('SELECT * FROM enms.public."DeviceDataSummaryView"'),
    ).toEqual(["enms"]);
  });

  it("detects quoted catalog identifiers", () => {
    expect(
      collectExternalPgReportDomains('SELECT * FROM "enms".public."DeviceDataSummaryView"'),
    ).toEqual(["enms"]);
    expect(
      collectExternalPgReportDomains('SELECT * FROM "erp".public."SO"'),
    ).toEqual(["erp"]);
  });

  it("does not mistake local table aliases for external domains", () => {
    expect(
      collectExternalPgReportDomains(
        'SELECT erp.amount FROM local_sales erp WHERE erp.status = \'open\'',
      ),
    ).toEqual([]);
    expect(
      collectExternalPgReportDomains(
        'SELECT ycrm.name FROM local_company ycrm JOIN local_user u ON u.id = ycrm.owner_id',
      ),
    ).toEqual([]);
  });

  it("ignores domain-looking text inside literals and comments", () => {
    expect(
      collectExternalPgReportDomains(
        "SELECT 'ycrm.public.company' AS label -- enms.public.sites\n",
      ),
    ).toEqual([]);
  });

  it("detects multiple real external domains", () => {
    expect(
      collectExternalPgReportDomains(
        'SELECT * FROM ycrm.public.company c JOIN enms.public."sites" s ON 1 = 1',
      ),
    ).toEqual(["ycrm", "enms"]);
  });
});

