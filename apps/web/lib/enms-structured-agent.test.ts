import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AgentProcessHandle } from "./agent-runner";
import {
  filterEnmsStructuredNarrative,
  parseEnmsStructuredNarrative,
  runEnmsGeneralChatAgent,
  runEnmsStructuredAgent,
} from "./enms-structured-agent";

const ORIGINAL_ENV = { ...process.env };
const DOCUMENTS = [
  {
    path: "skills/enms/SKILL.md",
    sha256: "a".repeat(64),
    content: "只依 EnMS 已授權資料分析。",
  },
];
const FACTS = {
  metrics: {
    currentDemandKw: 82.3,
    contractCapacityKw: 100,
  },
};

function validOutput() {
  return JSON.stringify({
    summary: "目前負載接近契約警戒區，建議持續觀察。",
    findings: [
      {
        text: "目前需量相對契約容量偏高。",
        factRefs: [
          "metrics.currentDemandKw",
          "metrics.contractCapacityKw",
        ],
      },
    ],
    recommendations: [
      {
        text: "優先檢查可延後運轉的非關鍵設備。",
        factRefs: ["metrics.currentDemandKw"],
      },
    ],
    confidence: "high",
    knowledgeRefs: ["skills/enms/SKILL.md"],
  });
}

function createProcessHandle() {
  const emitter = new EventEmitter();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const kill = vi.fn(() => true);
  const handle = emitter as EventEmitter & AgentProcessHandle;
  Object.assign(handle, { stdout, stderr, kill });
  return { emitter, stdout, stderr, kill, handle };
}

function createGatewayRpcMock(options?: {
  deny?: string[];
  sandboxMode?: string;
}) {
  return vi.fn(async (method: string) => {
    if (method === "config.get") {
      return {
        type: "res" as const,
        id: "config",
        ok: true,
        payload: {
          config: {
            agents: {
              list: [
                {
                  id: "enms-bff",
                  skills: [],
                  tools: {
                    profile: "minimal",
                    allow: [],
                    deny: options?.deny ?? ["*"],
                    elevated: { enabled: false },
                  },
                  sandbox: {
                    mode: options?.sandboxMode ?? "all",
                    workspaceAccess: "none",
                    scope: "session",
                  },
                },
              ],
            },
          },
        },
      };
    }
    return { type: "res" as const, id: "1", ok: true };
  });
}

function buildInput(signal?: AbortSignal) {
  return {
    mode: "page" as const,
    pageKey: "demand" as const,
    intent: "demand_forecast",
    task: "分析目前需量風險",
    facts: FACTS,
    deterministicSummary: "目前需量為可信 EnMS facts。",
    documents: DOCUMENTS,
    signal,
  };
}

describe("EnMS structured agent", () => {
  beforeEach(() => {
    process.env.ENCLAW_ENMS_STRUCTURED_AGENT_ENABLED = "1";
    process.env.ENCLAW_ENMS_STRUCTURED_AGENT_ID = "enms-bff";
  });

  afterEach(() => {
    vi.useRealTimers();
    process.env = { ...ORIGINAL_ENV };
  });

  it("accepts exact JSON with allowlisted fact and knowledge references", () => {
    const result = parseEnmsStructuredNarrative(validOutput(), {
      facts: FACTS,
      documents: DOCUMENTS,
    });

    expect(result.confidence).toBe("high");
    expect(result.findings[0].factRefs).toContain(
      "metrics.currentDemandKw",
    );
  });

  it("drops benchmark improvement priority when normalization facts are missing", () => {
    const result = filterEnmsStructuredNarrative(
      "bench",
      [
        {
          text: "總用電排名可作為負載規模參考。",
          factRefs: ["metrics.currentDemandKw"],
        },
        {
          text: "建議優先改善最高用電場域。",
          factRefs: ["metrics.currentDemandKw"],
        },
      ],
      [{ key: "normalizationDimensions" }],
    );

    expect(result.map((item) => item.text)).toEqual([
      "總用電排名可作為負載規模參考。",
    ]);
  });

  it("extracts one validated JSON object and discards provider prose", () => {
    const result = parseEnmsStructuredNarrative(
      `分析過程不會回傳給 EnMS。\n${validOutput()}\n分析完成。`,
      {
        facts: FACTS,
        documents: DOCUMENTS,
      },
    );

    expect(result.summary).toContain("契約警戒區");
  });

  it("accepts repeated identical contract objects but rejects conflicting ones", () => {
    const repeated = `${validOutput()}\n${validOutput()}`;
    expect(
      parseEnmsStructuredNarrative(repeated, {
        facts: FACTS,
        documents: DOCUMENTS,
      }).confidence,
    ).toBe("high");

    const conflicting = JSON.parse(validOutput());
    conflicting.confidence = "low";
    expect(() =>
      parseEnmsStructuredNarrative(
        `${validOutput()}\n${JSON.stringify(conflicting)}`,
        {
          facts: FACTS,
          documents: DOCUMENTS,
        },
      ),
    ).toThrow("exactly one unique");
  });

  it.each([
    [
      "unknown top-level field",
      () => {
        const parsed = JSON.parse(validOutput());
        parsed.sql = "SELECT 1";
        return JSON.stringify(parsed);
      },
    ],
    [
      "unknown fact reference",
      () => {
        const parsed = JSON.parse(validOutput());
        parsed.findings[0].factRefs = ["metrics.secretValue"];
        parsed.recommendations[0].factRefs = ["metrics.secretValue"];
        return JSON.stringify(parsed);
      },
    ],
    [
      "HTML narrative",
      () => {
        const parsed = JSON.parse(validOutput());
        parsed.summary = "<b>目前需量偏高</b>";
        return JSON.stringify(parsed);
      },
    ],
  ])("rejects %s", (_name, buildRaw) => {
    expect(() =>
      parseEnmsStructuredNarrative(buildRaw(), {
        facts: FACTS,
        documents: DOCUMENTS,
      }),
    ).toThrow();
  });

  it("removes model-restated identifiers and numbers from narrative text", () => {
    const parsed = JSON.parse(validOutput());
    parsed.summary =
      "電號 04-82-1677-11-6 最近 30 日最高需量 82.3 kW，契約容量尚未設定。";

    const result = parseEnmsStructuredNarrative(
      JSON.stringify(parsed),
      {
        facts: FACTS,
        documents: DOCUMENTS,
      },
    );

    expect(result.summary).toContain("目前授權帳號");
    expect(result.summary).toContain("近期");
    expect(result.summary).toContain("已授權指標值");
    expect(result.summary).not.toMatch(/[0-9]/);
    expect(result.summary).not.toContain("04-82-1677-11-6");
  });

  it("redacts unlabeled MAC and account identifiers before numeric normalization", () => {
    const parsed = JSON.parse(validOutput());
    parsed.summary =
      "設備 02:81:2F:50:DE:4D 與 04043717102 的負載需要持續觀察。";

    const result = parseEnmsStructuredNarrative(
      JSON.stringify(parsed),
      {
        facts: FACTS,
        documents: DOCUMENTS,
      },
    );

    expect(result.summary).toContain("目前授權設備");
    expect(result.summary).toContain("目前授權帳號");
    expect(result.summary).not.toContain("2F");
    expect(result.summary).not.toMatch(/[0-9]/);
  });

  it("normalizes and removes full-width and textual measurement numbers", () => {
    const parsed = JSON.parse(validOutput());
    parsed.summary =
      "需量８２ kW，過去三十日應持續觀察。";

    const result = parseEnmsStructuredNarrative(
      JSON.stringify(parsed),
      {
        facts: FACTS,
        documents: DOCUMENTS,
      },
    );

    expect(result.summary).not.toMatch(/\p{N}/u);
    expect(result.summary).not.toContain("三十日");
  });

  it("drops unknown fact references while retaining supported evidence", () => {
    const parsed = JSON.parse(validOutput());
    parsed.findings[0].factRefs.push("metrics.notAuthorized");
    parsed.recommendations.push({
      text: "這項建議只有不存在的證據，不應出現在結果。",
      factRefs: ["metrics.notAuthorized"],
    });

    const result = parseEnmsStructuredNarrative(
      JSON.stringify(parsed),
      {
        facts: FACTS,
        documents: DOCUMENTS,
      },
    );

    expect(result.findings[0].factRefs).toEqual([
      "metrics.currentDemandKw",
      "metrics.contractCapacityKw",
    ]);
    expect(result.recommendations).toHaveLength(1);
  });

  it("canonicalizes safe fact-reference prefixes without inventing evidence", () => {
    const parsed = JSON.parse(validOutput());
    parsed.findings[0].factRefs = [
      "facts.metrics.currentDemandKw",
      "$.metrics.contractCapacityKw",
    ];
    parsed.recommendations[0].factRefs = ["currentDemandKw"];

    const result = parseEnmsStructuredNarrative(
      JSON.stringify(parsed),
      {
        facts: FACTS,
        documents: DOCUMENTS,
      },
    );

    expect(result.findings[0].factRefs).toEqual([
      "metrics.currentDemandKw",
      "metrics.contractCapacityKw",
    ]);
    expect(result.recommendations[0].factRefs).toEqual([
      "metrics.currentDemandKw",
    ]);
  });

  it("collects the provider response through an isolated agent session", async () => {
    const process = createProcessHandle();
    const spawn = vi.fn(() => process.handle);
    const callRpc = createGatewayRpcMock();
    const promise = runEnmsStructuredAgent(buildInput(), {
      spawn,
      callRpc,
      createId: () => "request-1",
    });

    process.stdout.write(
      `${JSON.stringify({
        event: "agent",
        stream: "assistant",
        data: { delta: validOutput() },
      })}\n`,
    );
    process.stdout.end();
    await new Promise((resolve) => setImmediate(resolve));
    process.emitter.emit("close", 0, null);

    const result = await promise;
    expect(result.summary).toContain("契約警戒區");
    expect(spawn).toHaveBeenCalledWith(
      expect.stringMatching(
        /<AUTHORIZED_FACTS_JSON>.*<FINAL_OUTPUT_RULES>/s,
      ),
      "enms-bff-request-1",
      "enms-bff",
      undefined,
      undefined,
      ["operator.read"],
      true,
    );
    expect(callRpc).toHaveBeenCalledWith(
      "config.get",
      {},
      {
        timeoutMs: 4_000,
        retries: 0,
        scopes: ["operator.read"],
      },
    );
  });

  it("runs unrelated general chat with read-only Gateway scopes", async () => {
    const process = createProcessHandle();
    const spawn = vi.fn(() => process.handle);
    const callRpc = createGatewayRpcMock();
    const promise = runEnmsGeneralChatAgent(
      { task: "今天天氣如何？" },
      {
        spawn,
        callRpc,
        createId: () => "general-1",
      },
    );

    process.stdout.write(
      `${JSON.stringify({
        event: "agent",
        stream: "assistant",
        data: {
          delta: JSON.stringify({
            answer: "我目前沒有即時天氣查詢工具，請改用天氣服務確認。",
            confidence: "high",
          }),
        },
      })}\n`,
    );
    process.stdout.end();
    await new Promise((resolve) => setImmediate(resolve));
    process.emitter.emit("close", 0, null);

    const result = await promise;
    expect(result.text).toContain("即時天氣查詢工具");
    expect(spawn).toHaveBeenCalledWith(
      expect.stringContaining("一般問題回答模式"),
      "enms-general-general-1",
      "enms-bff",
      undefined,
      undefined,
      ["operator.read"],
      true,
    );
  });

  it("fails closed before spawning when the Gateway agent policy drifts", async () => {
    const spawn = vi.fn(() => createProcessHandle().handle);

    await expect(
      runEnmsStructuredAgent(buildInput(), {
        spawn,
        callRpc: createGatewayRpcMock({ deny: [] }),
        createId: () => "request-policy-drift",
      }),
    ).rejects.toThrow("policy attestation failed");
    expect(spawn).not.toHaveBeenCalled();
  });

  it("uses provider JSON mode without exposing Gateway tools when explicitly configured", async () => {
    process.env.ENCLAW_ENMS_STRUCTURED_MODEL_TRANSPORT =
      "openai-compatible";
    process.env.ENCLAW_ENMS_STRUCTURED_MODEL_BASE_URL =
      "http://model.internal/v1";
    process.env.ENCLAW_ENMS_STRUCTURED_MODEL_API_KEY = "server-secret";
    process.env.ENCLAW_ENMS_STRUCTURED_MODEL_NAME = "gx10-router";
    const fetchImpl = vi.fn(async (_url: URL, _init?: RequestInit) => {
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: validOutput(),
              },
            },
          ],
        }),
        { status: 200 },
      );
    });
    const spawn = vi.fn(() => createProcessHandle().handle);

    const result = await runEnmsStructuredAgent(buildInput(), {
      spawn,
      callRpc: vi.fn(),
      createId: () => "unused",
      fetch: fetchImpl as typeof globalThis.fetch,
    });

    expect(result.confidence).toBe("high");
    expect(spawn).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(init).toBeDefined();
    const requestInit = init!;
    if (typeof requestInit.body !== "string") {
      throw new Error("Expected JSON string request body");
    }
    const requestBody = JSON.parse(requestInit.body);
    expect(String(url)).toBe("http://model.internal/v1/chat/completions");
    expect(requestBody.response_format).toEqual({ type: "json_object" });
    expect(requestBody.stream).toBe(false);
    expect(requestBody.messages[0].content).toContain(
      "<AUTHORIZED_FACTS_JSON>",
    );
    expect(requestBody.messages[0].content).toContain(
      "目前需量為可信 EnMS facts。",
    );
    expect(requestBody.messages[0].content).toContain(
      "不得推翻、弱化或產生與其矛盾的敘述",
    );
    expect((requestInit.headers as Record<string, string>).Authorization).toBe(
      "Bearer server-secret",
    );
    expect(requestInit.redirect).toBe("error");
  });

  it("fails closed when direct structured model configuration is incomplete", async () => {
    process.env.ENCLAW_ENMS_STRUCTURED_MODEL_TRANSPORT =
      "openai-compatible";
    delete process.env.ENCLAW_ENMS_STRUCTURED_MODEL_BASE_URL;
    delete process.env.ENCLAW_ENMS_STRUCTURED_MODEL_API_KEY;
    delete process.env.ENCLAW_ENMS_STRUCTURED_MODEL_NAME;

    await expect(
      runEnmsStructuredAgent(buildInput(), {
        spawn: vi.fn(() => createProcessHandle().handle),
        callRpc: vi.fn(),
        createId: () => "unused",
        fetch: vi.fn() as unknown as typeof globalThis.fetch,
      }),
    ).rejects.toThrow("not fully configured");
  });

  it("fails closed when the direct model violates HTTPS or host policy", async () => {
    process.env.ENCLAW_ENMS_STRUCTURED_MODEL_TRANSPORT =
      "openai-compatible";
    process.env.ENCLAW_ENMS_STRUCTURED_MODEL_BASE_URL =
      "http://unapproved.internal/v1";
    process.env.ENCLAW_ENMS_STRUCTURED_MODEL_API_KEY = "server-secret";
    process.env.ENCLAW_ENMS_STRUCTURED_MODEL_NAME = "gx10-router";
    process.env.ENCLAW_ENMS_REQUIRE_MODEL_HTTPS = "1";
    process.env.ENCLAW_ENMS_STRUCTURED_MODEL_ALLOWED_HOSTS =
      "model.internal";
    const fetchImpl = vi.fn();

    await expect(
      runEnmsStructuredAgent(buildInput(), {
        spawn: vi.fn(() => createProcessHandle().handle),
        callRpc: vi.fn(),
        createId: () => "unused",
        fetch: fetchImpl as unknown as typeof globalThis.fetch,
      }),
    ).rejects.toThrow("URL is invalid");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("fails closed and aborts the Gateway when any tool event appears", async () => {
    const process = createProcessHandle();
    const callRpc = createGatewayRpcMock();
    const promise = runEnmsStructuredAgent(buildInput(), {
      spawn: vi.fn(() => process.handle),
      callRpc,
      createId: () => "request-tool",
    });

    process.stdout.write(
      `${JSON.stringify({
        event: "agent",
        stream: "tool",
        data: { name: "exec" },
      })}\n`,
    );

    await expect(promise).rejects.toThrow("attempted a tool call");
    expect(callRpc).toHaveBeenCalledWith(
      "chat.abort",
      {
        sessionKey: "agent:enms-bff:web:enms-bff-request-tool",
      },
      {
        timeoutMs: 4_000,
        retries: 0,
        scopes: ["operator.read"],
      },
    );
    expect(process.kill).toHaveBeenCalled();
  });

  it("stops before spawning when the caller cancels during policy attestation", async () => {
    const controller = new AbortController();
    const process = createProcessHandle();
    const callRpc = createGatewayRpcMock();
    const spawn = vi.fn(() => process.handle);
    const promise = runEnmsStructuredAgent(buildInput(controller.signal), {
      spawn,
      callRpc,
      createId: () => "request-cancel",
    });

    controller.abort();

    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
    expect(spawn).not.toHaveBeenCalled();
  });

  it("aborts the Gateway when the model exceeds its bounded timeout", async () => {
    vi.useFakeTimers();
    process.env.ENCLAW_ENMS_PAGE_MODEL_TIMEOUT_MS = "5000";
    const agentProcess = createProcessHandle();
    const callRpc = createGatewayRpcMock();
    const promise = runEnmsStructuredAgent(buildInput(), {
      spawn: vi.fn(() => agentProcess.handle),
      callRpc,
      createId: () => "request-timeout",
    });
    const rejection = expect(promise).rejects.toThrow("timed out");

    await vi.advanceTimersByTimeAsync(5_000);

    await rejection;
    expect(callRpc).toHaveBeenCalledWith(
      "chat.abort",
      {
        sessionKey: "agent:enms-bff:web:enms-bff-request-timeout",
      },
      {
        timeoutMs: 4_000,
        retries: 0,
        scopes: ["operator.read"],
      },
    );
  });
});
