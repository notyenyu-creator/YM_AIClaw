import { describe, expect, it } from "vitest";

const DEFAULT_API_KEY = "server-secret";

function buildRequest(body: unknown, headers?: HeadersInit) {
  const requestHeaders = new Headers(headers);
  requestHeaders.set("Content-Type", "application/json");
  if (!requestHeaders.has("Authorization")) {
    requestHeaders.set("Authorization", `Bearer ${DEFAULT_API_KEY}`);
  }

  return new Request("http://localhost/api/enms/chat/plan", {
    method: "POST",
    headers: requestHeaders,
    body: JSON.stringify(body),
  });
}

function buildGetRequest(headers?: HeadersInit) {
  const requestHeaders = new Headers(headers);
  if (!requestHeaders.has("Authorization")) {
    requestHeaders.set("Authorization", `Bearer ${DEFAULT_API_KEY}`);
  }

  return new Request("http://localhost/api/enms/chat/plan", {
    method: "GET",
    headers: requestHeaders,
  });
}

describe("POST /api/enms/chat/plan", () => {
  it("requires server-to-server authorization for the contract description", async () => {
    process.env.ENCLAW_ENMS_API_KEY = DEFAULT_API_KEY;
    const { GET } = await import("./route.js");

    const unauthorized = await GET(buildGetRequest({ Authorization: "Bearer wrong" }));
    const authorized = await GET(buildGetRequest());
    const json = await authorized.json();

    expect(unauthorized.status).toBe(401);
    expect(authorized.status).toBe(200);
    expect(json.contract.contractVersion).toBe("enms.ai.chat-plan.v1");
    expect(json.security.apiKeyPolicy).toBe("required");
  });

  it("requires server-to-server authorization", async () => {
    process.env.ENCLAW_ENMS_API_KEY = DEFAULT_API_KEY;
    const { POST } = await import("./route.js");

    const response = await POST(
      buildRequest({ message: "請分析需量" }, { Authorization: "Bearer wrong" }),
    );

    expect(response.status).toBe(401);
  });

  it("routes unrelated questions to general AI without DB facts", async () => {
    process.env.ENCLAW_ENMS_API_KEY = DEFAULT_API_KEY;
    const { POST } = await import("./route.js");

    const response = await POST(
      buildRequest({ message: "請用一句話解釋什麼是資料治理" }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.strategy).toBe("general_ai");
    expect(json.intent).toBe("general_question");
    expect(json.allowDbFacts).toBe(false);
    expect(json.allowGeneralAI).toBe(true);
    expect(json.selectedPageKeys).toEqual([]);
  });

  it("routes EnMS multi-intent questions to scoped facts bundles", async () => {
    process.env.ENCLAW_ENMS_API_KEY = DEFAULT_API_KEY;
    const { POST } = await import("./route.js");

    const response = await POST(
      buildRequest({
        message: "最新資料時間，也分析需量超約風險與節能建議",
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.strategy).toBe("multi_scoped_facts_bundle");
    expect(json.allowDbFacts).toBe(true);
    expect(json.primaryPageKey).toBe("nlq");
    expect(json.selectedPageKeys).toEqual(["nlq", "demand", "eff"]);
  });

  it("keeps site benchmarking ahead of generic usage but not ahead of earlier explicit intents", async () => {
    process.env.ENCLAW_ENMS_API_KEY = DEFAULT_API_KEY;
    const { POST } = await import("./route.js");

    const siteFirstResponse = await POST(
      buildRequest({ message: "用電場域比較一下" }),
    );
    const siteFirstJson = await siteFirstResponse.json();

    expect(siteFirstResponse.status).toBe(200);
    expect(siteFirstJson.primaryPageKey).toBe("bench");
    expect(siteFirstJson.selectedPageKeys[0]).toBe("bench");

    const multiIntentResponse = await POST(
      buildRequest({
        message:
          "最新資料、異常根因、告警治理、場域用電比較、節能電費、需量超約都幫我看",
      }),
    );
    const multiIntentJson = await multiIntentResponse.json();

    expect(multiIntentResponse.status).toBe(200);
    expect(multiIntentJson.primaryPageKey).toBe("nlq");
    expect(multiIntentJson.selectedPageKeys).toEqual([
      "nlq",
      "anomaly",
      "alert",
      "bench",
    ]);
  });

  it("routes regex-only latest-data questions to scoped facts", async () => {
    process.env.ENCLAW_ENMS_API_KEY = DEFAULT_API_KEY;
    const { POST } = await import("./route.js");

    for (const message of [
      "最近讀值是什麼時間？",
      "最後紀錄時間？",
      "目前 DB 是幾月幾號？",
    ]) {
      const response = await POST(buildRequest({ message }));
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.strategy).toBe("single_scoped_facts");
      expect(json.allowDbFacts).toBe(true);
      expect(json.primaryPageKey).toBe("nlq");
      expect(json.selectedPageKeys).toEqual(["nlq"]);
    }
  });
});
