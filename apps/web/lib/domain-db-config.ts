export type ExternalDomainDb = "ycrm" | "erp";

const DOMAIN_DB_CONFIG: Record<
  ExternalDomainDb,
  {
    displayName: string;
    envKeys: readonly string[];
    unavailableMessage: string;
  }
> = {
  ycrm: {
    displayName: "Y-CRM",
    envKeys: [
      "YCRM_PG_CONNECTION",
      "Y_CRM_PG_CONNECTION",
      "OPENCLAW_YCRM_PG_CONNECTION",
      "YCRM_POSTGRES_CONNECTION",
    ],
    unavailableMessage:
      "目前 Y-CRM 資料連線尚未啟用，已停止查詢以避免推測；請通知維運確認伺服器端連線設定。",
  },
  erp: {
    displayName: "ERP",
    envKeys: [
      "ERP_PG_CONNECTION",
      "OPENCLAW_ERP_PG_CONNECTION",
      "ERP_POSTGRES_CONNECTION",
    ],
    unavailableMessage:
      "目前 ERP 資料連線尚未啟用，已停止查詢以避免推測；請通知維運確認伺服器端連線設定。",
  },
};

export class DomainDbConfigurationError extends Error {
  readonly domain: ExternalDomainDb;

  constructor(domain: ExternalDomainDb, message: string) {
    super(message);
    this.name = "DomainDbConfigurationError";
    this.domain = domain;
  }
}

export function isDomainDbConfigurationError(
  error: unknown,
): error is DomainDbConfigurationError {
  return error instanceof DomainDbConfigurationError;
}

function getDomainConnectionString(domain: ExternalDomainDb): string {
  const config = DOMAIN_DB_CONFIG[domain];
  for (const key of config.envKeys) {
    const value = process.env[key]?.trim();
    if (value) {
      return value;
    }
  }

  throw new DomainDbConfigurationError(domain, config.unavailableMessage);
}

export function getYcrmPostgresConnectionString(): string {
  return getDomainConnectionString("ycrm");
}

export function getErpPostgresConnectionString(): string {
  return getDomainConnectionString("erp");
}

export function getUserFacingDomainDbUnavailableMessage(
  domain: ExternalDomainDb,
): string {
  return DOMAIN_DB_CONFIG[domain].unavailableMessage;
}

export function describeDomainDbConnectionConfig(domain: ExternalDomainDb): string {
  return DOMAIN_DB_CONFIG[domain].envKeys.join(" / ");
}

export function redactDomainDatabaseConnectionSecrets(message: string): string {
  return message
    .replace(
      /ATTACH\s+'(?:''|[^'])*'\s+AS\s+([A-Za-z_][A-Za-z0-9_]*)/gi,
      "ATTACH '<redacted-connection>' AS $1",
    )
    .replace(
      /((?:password|sslpassword|pgpassword)\s*=\s*)(?:'(?:''|[^'])*'|"[^"]*"|[^\s'";)]+)/gi,
      "$1<redacted>",
    )
    .replace(
      /([a-z][a-z0-9+.-]*:\/\/)([^:/@\s]+):([^@\s]+)@/gi,
      "$1<user>:<redacted>@",
    );
}
