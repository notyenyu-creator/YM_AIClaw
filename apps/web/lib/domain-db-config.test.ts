import { afterEach, describe, expect, it } from "vitest";

const ORIGINAL_ENV = { ...process.env };

describe("domain db config", () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("reads Y-CRM postgres connection from server environment", async () => {
    process.env.YCRM_PG_CONNECTION =
      "dbname=default user=test password=secret host=localhost port=5432";

    const { getYcrmPostgresConnectionString } = await import("./domain-db-config");

    expect(getYcrmPostgresConnectionString()).toContain("dbname=default");
    expect(getYcrmPostgresConnectionString()).toContain("password=secret");
  });

  it("falls back to secondary Y-CRM env keys", async () => {
    delete process.env.YCRM_PG_CONNECTION;
    process.env.OPENCLAW_YCRM_PG_CONNECTION =
      "dbname=default user=test password=secret host=localhost port=5432";

    const { getYcrmPostgresConnectionString } = await import("./domain-db-config");

    expect(getYcrmPostgresConnectionString()).toContain("dbname=default");
  });

  it("fails with an actionable Y-CRM message when config is missing", async () => {
    delete process.env.YCRM_PG_CONNECTION;
    delete process.env.Y_CRM_PG_CONNECTION;
    delete process.env.OPENCLAW_YCRM_PG_CONNECTION;
    delete process.env.YCRM_POSTGRES_CONNECTION;

    const { getYcrmPostgresConnectionString } = await import("./domain-db-config");

    expect(() => getYcrmPostgresConnectionString()).toThrow(
      "目前 Y-CRM 資料連線尚未啟用",
    );
    expect(() => getYcrmPostgresConnectionString()).not.toThrow("password=");
  });

  it("reads ERP postgres connection from server environment", async () => {
    process.env.ERP_PG_CONNECTION =
      "host=118.168.188.27 port=5433 dbname=ErpUAT_local user=test password=secret sslmode=disable";

    const { getErpPostgresConnectionString } = await import("./domain-db-config");

    expect(getErpPostgresConnectionString()).toContain("dbname=ErpUAT_local");
    expect(getErpPostgresConnectionString()).toContain("password=secret");
  });

  it("falls back to secondary ERP env keys", async () => {
    delete process.env.ERP_PG_CONNECTION;
    process.env.OPENCLAW_ERP_PG_CONNECTION =
      "host=118.168.188.27 port=5433 dbname=ErpUAT_local user=test password=secret sslmode=disable";

    const { getErpPostgresConnectionString } = await import("./domain-db-config");

    expect(getErpPostgresConnectionString()).toContain("dbname=ErpUAT_local");
  });

  it("fails with an actionable ERP message when config is missing", async () => {
    delete process.env.ERP_PG_CONNECTION;
    delete process.env.OPENCLAW_ERP_PG_CONNECTION;
    delete process.env.ERP_POSTGRES_CONNECTION;

    const { getErpPostgresConnectionString } = await import("./domain-db-config");

    expect(() => getErpPostgresConnectionString()).toThrow(
      "目前 ERP 資料連線尚未啟用",
    );
    expect(() => getErpPostgresConnectionString()).not.toThrow("password=");
  });

  it("redacts connection strings before user-facing error messages", async () => {
    const { redactDomainDatabaseConnectionSecrets } = await import("./domain-db-config");

    const message = redactDomainDatabaseConnectionSecrets(
      "DuckDB error: ATTACH 'host=127.0.0.1 port=5432 dbname=erp user=postgres password=super-secret' AS erp; detail password = another-secret; postgres://admin:secret@example.local/db",
    );

    expect(message).toContain("ATTACH '<redacted-connection>' AS erp");
    expect(message).toContain("password = <redacted>");
    expect(message).toContain("postgres://<user>:<redacted>@example.local/db");
    expect(message).not.toContain("super-secret");
    expect(message).not.toContain("another-secret");
    expect(message).not.toContain("admin:secret");
  });
});
