import { afterEach, describe, expect, it } from "vitest";

const ORIGINAL_ENV = { ...process.env };

describe("enms db config", () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("reads the EnMS postgres connection from server environment", async () => {
    process.env.ENMS_PG_CONNECTION =
      "host=118.168.188.27 port=55433 dbname=EnMS user=test password=secret sslmode=disable";
    delete process.env.OPENCLAW_ENMS_PG_CONNECTION;
    delete process.env.ENMS_POSTGRES_CONNECTION;

    const { getEnmsPostgresConnectionString } = await import("./enms-db-config");

    expect(getEnmsPostgresConnectionString()).toContain("dbname=EnMS");
    expect(getEnmsPostgresConnectionString()).toContain("password=secret");
  });

  it("falls back to the secondary EnMS postgres env keys", async () => {
    delete process.env.ENMS_PG_CONNECTION;
    process.env.OPENCLAW_ENMS_PG_CONNECTION =
      "host=118.168.188.27 port=55433 dbname=EnMS user=test password=secret sslmode=disable";
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

  it("rejects non-official EnMS postgres targets", async () => {
    process.env.ENMS_PG_CONNECTION =
      "host=127.0.0.1 port=55433 dbname=EnMS user=test password=secret sslmode=disable";

    const { getEnmsPostgresConnectionString } = await import("./enms-db-config");

    expect(() => getEnmsPostgresConnectionString()).toThrow(
      "目前 EnMS 資料連線尚未啟用",
    );
  });

  it("rejects wrong official source port or database name", async () => {
    process.env.ENMS_PG_CONNECTION =
      "host=118.168.188.27 port=5432 dbname=enms_27 user=test password=secret sslmode=disable";

    const { getEnmsPostgresConnectionString } = await import("./enms-db-config");

    expect(() => getEnmsPostgresConnectionString()).toThrow(
      "目前 EnMS 資料連線尚未啟用",
    );
  });

  it("redacts database connection secrets from error messages", async () => {
    const { redactDatabaseConnectionSecrets } = await import("./enms-db-config");

    expect(
      redactDatabaseConnectionSecrets(
        "ATTACH 'host=118.168.188.27 port=55433 dbname=EnMS user=sa password=secret sslmode=disable' AS enms failed",
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
        "mongodb://demo:demo-secret@118.168.188.27:27018/enms_mongo",
      ),
    ).toContain("mongodb://<user>:<redacted>@118.168.188.27");
    expect(
      redactDatabaseConnectionSecrets(
        "ATTACH 'host=118.168.188.27 port=55433 dbname=EnMS user=sa password=''secret''' AS enms failed",
      ),
    ).toContain("ATTACH '<redacted-connection>' AS enms");
  });
});
