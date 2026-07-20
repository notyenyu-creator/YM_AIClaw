import { afterEach, describe, expect, it } from "vitest";

const ORIGINAL_ENV = { ...process.env };
const OFFICIAL_ENMS_HOST = "enms-db.internal";
const OFFICIAL_ENMS_PORT = "55433";
const OFFICIAL_ENMS_DB = "EnMS";

function configureEnmsAllowlist() {
  process.env.ENMS_PG_ALLOWED_HOST = OFFICIAL_ENMS_HOST;
  process.env.ENMS_PG_ALLOWED_PORT = OFFICIAL_ENMS_PORT;
  process.env.ENMS_PG_ALLOWED_DATABASE = OFFICIAL_ENMS_DB;
}

function officialConnection(password = "secret") {
  return `host=${OFFICIAL_ENMS_HOST} port=${OFFICIAL_ENMS_PORT} dbname=${OFFICIAL_ENMS_DB} user=test password=${password} sslmode=disable`;
}

describe("enms db config", () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("reads the EnMS postgres connection from server environment", async () => {
    configureEnmsAllowlist();
    process.env.ENMS_PG_CONNECTION = officialConnection();
    delete process.env.OPENCLAW_ENMS_PG_CONNECTION;
    delete process.env.ENMS_POSTGRES_CONNECTION;

    const { getEnmsPostgresConnectionString } = await import("./enms-db-config");

    expect(getEnmsPostgresConnectionString()).toContain("dbname=EnMS");
    expect(getEnmsPostgresConnectionString()).toContain("password=secret");
  });

  it("falls back to the secondary EnMS postgres env keys", async () => {
    configureEnmsAllowlist();
    delete process.env.ENMS_PG_CONNECTION;
    process.env.OPENCLAW_ENMS_PG_CONNECTION = officialConnection();
    delete process.env.ENMS_POSTGRES_CONNECTION;

    const { getEnmsPostgresConnectionString } = await import("./enms-db-config");

    expect(getEnmsPostgresConnectionString()).toContain("dbname=EnMS");
  });

  it("fails with an actionable message when EnMS postgres config is missing", async () => {
    delete process.env.ENMS_PG_CONNECTION;
    delete process.env.OPENCLAW_ENMS_PG_CONNECTION;
    delete process.env.ENMS_POSTGRES_CONNECTION;

    const { getEnmsPostgresConnectionString } = await import("./enms-db-config");

    expect(() => getEnmsPostgresConnectionString()).toThrow(
      "目前 EnMS 資料連線尚未啟用",
    );
    expect(() => getEnmsPostgresConnectionString()).not.toThrow("password=");
  });

  it("rejects EnMS postgres targets outside the configured allowlist", async () => {
    configureEnmsAllowlist();
    process.env.ENMS_PG_CONNECTION =
      "host=127.0.0.1 port=55433 dbname=EnMS user=test password=secret sslmode=disable";

    const { getEnmsPostgresConnectionString } = await import("./enms-db-config");

    expect(() => getEnmsPostgresConnectionString()).toThrow(
      "目前 EnMS 資料來源尚未通過授權目標檢查",
    );
  });

  it("rejects wrong official source port or database name", async () => {
    configureEnmsAllowlist();
    process.env.ENMS_PG_CONNECTION =
      `host=${OFFICIAL_ENMS_HOST} port=5432 dbname=enms_27 user=test password=secret sslmode=disable`;

    const { getEnmsPostgresConnectionString } = await import("./enms-db-config");

    expect(() => getEnmsPostgresConnectionString()).toThrow(
      "目前 EnMS 資料來源尚未通過授權目標檢查",
    );
  });

  it("redacts database connection secrets from error messages", async () => {
    const { redactDatabaseConnectionSecrets } = await import("./enms-db-config");

    expect(
      redactDatabaseConnectionSecrets(
        "ATTACH 'host=enms-redaction.internal port=55433 dbname=EnMS user=sa password=secret sslmode=disable' AS enms failed",
      ),
    ).not.toContain("password=secret");
    expect(redactDatabaseConnectionSecrets("connection password=secret failed")).toContain(
      "password=<redacted>",
    );
    expect(redactDatabaseConnectionSecrets("connection sslpassword=secret failed")).toContain(
      "sslpassword=<redacted>",
    );
    expect(redactDatabaseConnectionSecrets("connection password='secret with space' failed")).toContain(
      "password=<redacted>",
    );
    expect(redactDatabaseConnectionSecrets('connection password="secret with space" failed')).toContain(
      "password=<redacted>",
    );
    expect(
      redactDatabaseConnectionSecrets(
        "mongodb://demo:mongo-test-secret@enms-mongo.internal:27018/enms_mongo",
      ),
    ).toContain("mongodb://<user>:<redacted>@enms-mongo.internal");
    expect(
      redactDatabaseConnectionSecrets(
        "ATTACH 'host=enms-redaction.internal port=55433 dbname=EnMS user=sa password=''secret''' AS enms failed",
      ),
    ).toContain("ATTACH '<redacted-connection>' AS enms");
  });

  it("rejects structurally valid EnMS postgres config without a target allowlist", async () => {
    delete process.env.ENMS_PG_ALLOWED_HOST;
    delete process.env.ENMS_PG_ALLOWED_PORT;
    delete process.env.ENMS_PG_ALLOWED_DATABASE;
    process.env.ENMS_PG_CONNECTION =
      "host=runtime-enms-db port=55433 dbname=EnMS user=test password=secret sslmode=disable";

    const { getEnmsPostgresConnectionString } = await import("./enms-db-config");

    expect(() => getEnmsPostgresConnectionString()).toThrow(
      "目前 EnMS 資料來源尚未通過授權目標檢查",
    );
  });

  it("allows unscoped EnMS postgres config only when an explicit test override is set", async () => {
    delete process.env.ENMS_PG_ALLOWED_HOST;
    delete process.env.ENMS_PG_ALLOWED_PORT;
    delete process.env.ENMS_PG_ALLOWED_DATABASE;
    process.env.DENCHCLAW_ALLOW_UNSCOPED_ENMS_DB = "1";
    process.env.ENMS_PG_CONNECTION =
      "host=runtime-enms-db port=55433 dbname=EnMS user=test password=secret sslmode=disable";

    const { getEnmsPostgresConnectionString } = await import("./enms-db-config");

    expect(getEnmsPostgresConnectionString()).toContain("host=runtime-enms-db");
  });
});
