const ENMS_CONNECTION_ENV_KEYS = [
  "ENMS_PG_CONNECTION",
  "OPENCLAW_ENMS_PG_CONNECTION",
  "ENMS_POSTGRES_CONNECTION",
] as const;

const REQUIRED_ENMS_HOST = "118.168.188.27";
const REQUIRED_ENMS_PORT = "55433";
const REQUIRED_ENMS_DB_NAME = "EnMS";
const USER_FACING_UNAVAILABLE_MESSAGE =
  "目前 EnMS 資料連線尚未啟用，已停止查詢以避免推測；請通知維運確認伺服器端連線設定。";

export class EnmsDbConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EnmsDbConfigurationError";
  }
}

export function isEnmsDbConfigurationError(
  error: unknown,
): error is EnmsDbConfigurationError {
  return error instanceof EnmsDbConfigurationError;
}

export function getUserFacingEnmsDbUnavailableMessage(): string {
  return USER_FACING_UNAVAILABLE_MESSAGE;
}

function parseConnectionParts(connectionString: string): Record<string, string> {
  const parts: Record<string, string> = {};
  for (const match of connectionString.matchAll(/(?:^|\s)([A-Za-z_][A-Za-z0-9_]*)=([^\s]+)/g)) {
    const key = match[1];
    const value = match[2];
    if (key && value) {
      parts[key.toLowerCase()] = value;
    }
  }
  return parts;
}

function assertOfficialEnmsConnection(connectionString: string) {
  const parts = parseConnectionParts(connectionString);
  if (
    parts.host !== REQUIRED_ENMS_HOST ||
    parts.port !== REQUIRED_ENMS_PORT ||
    parts.dbname !== REQUIRED_ENMS_DB_NAME
  ) {
    throw new EnmsDbConfigurationError(
      USER_FACING_UNAVAILABLE_MESSAGE,
    );
  }
}

export function getEnmsPostgresConnectionString(): string {
  for (const key of ENMS_CONNECTION_ENV_KEYS) {
    const value = process.env[key]?.trim();
    if (value) {
      assertOfficialEnmsConnection(value);
      return value;
    }
  }

  throw new EnmsDbConfigurationError(USER_FACING_UNAVAILABLE_MESSAGE);
}

export function describeEnmsPostgresConnectionConfig(): string {
  return ENMS_CONNECTION_ENV_KEYS.join(" / ");
}

export function redactDatabaseConnectionSecrets(message: string): string {
  return message
    .replace(
      /ATTACH\s+'(?:''|[^'])*'\s+AS\s+([A-Za-z_][A-Za-z0-9_]*)/gi,
      "ATTACH '<redacted-connection>' AS $1",
    )
    .replace(
      /((?:password|sslpassword|pgpassword)=)(?:'(?:''|[^'])*'|"[^"]*"|[^\s'";)]+)/gi,
      "$1<redacted>",
    )
    .replace(
      /([a-z][a-z0-9+.-]*:\/\/)([^:/@\s]+):([^@\s]+)@/gi,
      "$1<user>:<redacted>@",
    );
}
