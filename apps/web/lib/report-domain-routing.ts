export type ExternalPgReportDomain = "ycrm" | "erp" | "enms";

export type ReportSourceKind =
  | "workspace_duckdb"
  | "external_postgres"
  | "blocked_cross_domain";

export const EXTERNAL_PG_DOMAIN_LABELS: Record<ExternalPgReportDomain, string> = {
  ycrm: "Y-CRM",
  erp: "ERP",
  enms: "EnMS",
};

export function normalizeExternalPgReportDomain(
  value: unknown,
): ExternalPgReportDomain | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "ycrm" || normalized === "y-crm") {
    return "ycrm";
  }
  if (normalized === "erp") {
    return "erp";
  }
  if (normalized === "enms") {
    return "enms";
  }
  return null;
}

export function collectExternalPgReportDomains(sql: string): ExternalPgReportDomain[] {
  const domains: ExternalPgReportDomain[] = [];
  const sqlForRouting = maskSqlStringLiteralsAndComments(sql);
  if (hasExternalPgDomainReference(sqlForRouting, "ycrm")) {
    domains.push("ycrm");
  }
  if (hasExternalPgDomainReference(sqlForRouting, "erp")) {
    domains.push("erp");
  }
  if (hasExternalPgDomainReference(sqlForRouting, "enms")) {
    domains.push("enms");
  }
  return domains;
}

function hasExternalPgDomainReference(
  sql: string,
  domain: ExternalPgReportDomain,
): boolean {
  const identifier = String.raw`(?:"[^"]+"|[A-Za-z_][A-Za-z0-9_$]*)`;
  return new RegExp(
    String.raw`(?:\b${domain}|\"${domain}\")\s*\.\s*${identifier}\s*\.`,
    "i",
  ).test(sql);
}

function maskSqlStringLiteralsAndComments(sql: string): string {
  return sql
    .replace(/'(?:''|[^'])*'/g, "''")
    .replace(/--[^\n\r]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
}
