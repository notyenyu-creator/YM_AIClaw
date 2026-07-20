const ENMS_CONNECTION_ENV_KEYS = [
  "ENMS_PG_CONNECTION",
  "OPENCLAW_ENMS_PG_CONNECTION",
  "ENMS_POSTGRES_CONNECTION",
] as const;

const ENMS_ALLOWED_TARGET_ENV_KEYS = {
  host: "ENMS_PG_ALLOWED_HOST",
  port: "ENMS_PG_ALLOWED_PORT",
  dbname: "ENMS_PG_ALLOWED_DATABASE",
} as const;

const USER_FACING_UNAVAILABLE_MESSAGE =
  "目前 EnMS 資料連線尚未啟用，已停止查詢以避免推測；請通知維運確認伺服器端連線設定。";
const USER_FACING_TARGET_GUARD_MESSAGE =
  "目前 EnMS 資料來源尚未通過授權目標檢查，已停止查詢以避免使用錯誤資料源；請通知維運確認伺服器端 allowlist 設定。";

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

function getExpectedEnmsTarget(): Partial<Record<keyof typeof ENMS_ALLOWED_TARGET_ENV_KEYS, string>> {
  return {
    host: process.env[ENMS_ALLOWED_TARGET_ENV_KEYS.host]?.trim(),
    port: process.env[ENMS_ALLOWED_TARGET_ENV_KEYS.port]?.trim(),
    dbname: process.env[ENMS_ALLOWED_TARGET_ENV_KEYS.dbname]?.trim(),
  };
}

function allowUnscopedEnmsDbForTests() {
  return process.env.DENCHCLAW_ALLOW_UNSCOPED_ENMS_DB === "1";
}

function assertOfficialEnmsConnection(connectionString: string) {
  const parts = parseConnectionParts(connectionString);

  if (!parts.host || !parts.port || !parts.dbname) {
    throw new EnmsDbConfigurationError(
      USER_FACING_UNAVAILABLE_MESSAGE,
    );
  }

  const expected = getExpectedEnmsTarget();
  if (!expected.host || !expected.port || !expected.dbname) {
    if (allowUnscopedEnmsDbForTests()) {
      return;
    }
    throw new EnmsDbConfigurationError(
      USER_FACING_TARGET_GUARD_MESSAGE,
    );
  }

  for (const key of ["host", "port", "dbname"] as const) {
    if (parts[key] !== expected[key]) {
      throw new EnmsDbConfigurationError(
        USER_FACING_TARGET_GUARD_MESSAGE,
      );
    }
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
  return `${ENMS_CONNECTION_ENV_KEYS.join(" / ")}; required allowlist: ${Object.values(ENMS_ALLOWED_TARGET_ENV_KEYS).join(" / ")}`;
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
