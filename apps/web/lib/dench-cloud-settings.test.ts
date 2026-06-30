import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const state = {
    configText: "{}\n",
  };

  const catalog = {
    source: "live" as const,
    models: [
      {
        id: "dench-claude-sonnet",
        stableId: "claude-sonnet-4.6",
        displayName: "Claude Sonnet 4.6",
        provider: "anthropic",
        transportProvider: "dench-cloud",
        api: "openai-completions" as const,
        input: ["text"] as Array<"text" | "image">,
        reasoning: true,
        contextWindow: 200000,
        maxTokens: 8192,
        supportsStreaming: true,
        supportsImages: false,
        supportsResponses: true,
        supportsReasoning: true,
        cost: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
        },
      },
    ],
  };

  return {
    state,
    existsSync: vi.fn(() => true),
    readFileSync: vi.fn(() => state.configText as never),
    writeFileSync: vi.fn((pathLike: unknown, content: unknown) => {
      if (String(pathLike).endsWith("openclaw.json")) {
        state.configText = String(content);
      }
    }),
    mkdirSync: vi.fn(),
    validateDenchCloudApiKey: vi.fn(async () => undefined),
    fetchDenchCloudCatalog: vi.fn(async () => catalog),
    buildDenchCloudConfigPatch: vi.fn((params: { gatewayUrl: string; apiKey: string }) => ({
      models: {
        providers: {
          "dench-cloud": {
            apiKey: params.apiKey,
            baseUrl: `${params.gatewayUrl}/v1`,
          },
        },
      },
      agents: {
        defaults: {
          models: {
            "dench-cloud/claude-sonnet-4.6": {
              name: "Claude Sonnet 4.6",
            },
          },
        },
      },
      messages: {
        tts: {
          provider: "elevenlabs",
          providers: {
            elevenlabs: {
              baseUrl: params.gatewayUrl,
              apiKey: params.apiKey,
            },
          },
        },
      },
      tools: {
        alsoAllow: [
          "dench_search_integrations",
          "dench_execute_integrations",
        ],
      },
    })),
    readConfiguredDenchCloudSettings: vi.fn(() => ({
      gatewayUrl: null,
      selectedModel: null,
    })),
    refreshIntegrationsRuntime: vi.fn(async () => ({
      attempted: true,
      restarted: true,
      error: null,
      profile: "dench",
    })),
  };
});

vi.mock("@/lib/workspace", () => ({
  resolveOpenClawStateDir: vi.fn(() => "/home/testuser/.openclaw-dench"),
}));

vi.mock("node:fs", () => ({
  existsSync: mocks.existsSync,
  readFileSync: mocks.readFileSync,
  writeFileSync: mocks.writeFileSync,
  mkdirSync: mocks.mkdirSync,
}));

vi.mock("../../../src/cli/dench-cloud", () => ({
  DEFAULT_DENCH_CLOUD_GATEWAY_URL: "https://gateway.merseoriginals.com",
  normalizeDenchGatewayUrl: (value: string) => value,
  buildDenchGatewayApiBaseUrl: (gatewayUrl: string) => `${gatewayUrl}/v1`,
  fetchDenchCloudCatalog: mocks.fetchDenchCloudCatalog,
  validateDenchCloudApiKey: mocks.validateDenchCloudApiKey,
  buildDenchCloudConfigPatch: mocks.buildDenchCloudConfigPatch,
  readConfiguredDenchCloudSettings: mocks.readConfiguredDenchCloudSettings,
  RECOMMENDED_DENCH_CLOUD_MODEL_ID: "claude-sonnet-4.6",
}));

vi.mock("./integrations", () => ({
  refreshIntegrationsRuntime: mocks.refreshIntegrationsRuntime,
}));

import {
  getCloudSettingsState,
  saveApiKey,
  saveVoiceId,
  selectModel,
} from "./dench-cloud-settings";

describe("dench cloud settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.state.configText = "{}\n";
    mocks.validateDenchCloudApiKey.mockResolvedValue(undefined);
    mocks.fetchDenchCloudCatalog.mockResolvedValue({
      source: "live",
      models: [
        {
          id: "dench-claude-sonnet",
          stableId: "claude-sonnet-4.6",
          displayName: "Claude Sonnet 4.6",
          provider: "anthropic",
          transportProvider: "dench-cloud",
          api: "openai-completions",
          input: ["text"],
          reasoning: true,
          contextWindow: 200000,
          maxTokens: 8192,
          supportsStreaming: true,
          supportsImages: false,
          supportsResponses: true,
          supportsReasoning: true,
          cost: {
            input: 0,
            output: 0,
            cacheRead: 0,
            cacheWrite: 0,
          },
        },
      ],
    });
    mocks.refreshIntegrationsRuntime.mockResolvedValue({
      attempted: true,
      restarted: true,
      error: null,
      profile: "dench",
    });
  });

  it("refreshes integrations when saving the Dench Cloud API key", async () => {
    const result = await saveApiKey("dc-key");

    expect(mocks.refreshIntegrationsRuntime).toHaveBeenCalledTimes(1);
    expect(result).not.toHaveProperty("toolIndexRebuild");

    const written = JSON.parse(mocks.state.configText);
    expect(written.models.providers["dench-cloud"].apiKey).toBe("dc-key");
    expect(written.mcp).toBeUndefined();
    expect(written.tools.alsoAllow).toEqual([
      "dench_execute_integrations",
      "dench_search_integrations",
    ]);
  });

  it("refreshes integrations when switching the primary model to Dench Cloud", async () => {
    mocks.state.configText = JSON.stringify({
      models: {
        providers: {
          "dench-cloud": {
            apiKey: "dc-key",
          },
        },
      },
    });
    const result = await selectModel("claude-sonnet-4.6");

    expect(mocks.refreshIntegrationsRuntime).toHaveBeenCalledTimes(1);
    expect(result).not.toHaveProperty("toolIndexRebuild");

    const written = JSON.parse(mocks.state.configText);
    expect(written.agents.defaults.model.primary).toBe("dench-cloud/claude-sonnet-4.6");
    expect(written.mcp).toBeUndefined();
    expect(written.tools.alsoAllow).toEqual([
      "dench_execute_integrations",
      "dench_search_integrations",
    ]);
  });

  it("preserves a stored voiceId without re-enabling ElevenLabs during model changes", async () => {
    mocks.state.configText = JSON.stringify({
      models: {
        providers: {
          "dench-cloud": {
            apiKey: "dc-key",
          },
        },
      },
      messages: {
        tts: {
          providers: {
            elevenlabs: {
              voiceId: "voice_123",
            },
          },
        },
      },
    });

    await selectModel("claude-sonnet-4.6");

    const written = JSON.parse(mocks.state.configText);
    expect(written.messages.tts.provider).toBeUndefined();
    expect(written.messages.tts.providers.elevenlabs).toEqual({
      voiceId: "voice_123",
    });
    expect(written.messages.tts.elevenlabs).toBeUndefined();
  });

  it("stores the selected ElevenLabs voice without restarting the gateway", async () => {
    const result = await saveVoiceId("voice_456");

    expect(result.changed).toBe(true);
    expect(result.refresh).toEqual({
      attempted: false,
      restarted: false,
      error: null,
      profile: "default",
    });

    const written = JSON.parse(mocks.state.configText);
    expect(written.messages.tts.providers.elevenlabs.voiceId).toBe("voice_456");
  });

  it("exposes configured chat models for the chat UI without changing Dench Cloud settings behavior", async () => {
    mocks.state.configText = JSON.stringify({
      agents: {
        defaults: {
          model: {
            primary: "openai/gpt-4.1-mini",
          },
          models: {
            "openai/gpt-4.1-mini": {
              alias: "GPT",
            },
            "gx10_hermes/qwen3:30b": {
              alias: "GX10-Hermes",
            },
            "ollama/gemma4:e2b": {
              alias: "Gemma4-E2B",
            },
          },
        },
      },
      models: {
        providers: {
          gx10_hermes: {
            models: [
              {
                id: "qwen3:30b",
                name: "GX10 Hermes Qwen3 30B",
                reasoning: true,
              },
            ],
          },
          ollama: {
            models: [
              {
                id: "gemma4:e2b",
                name: "Gemma 4 E2B (Local)",
                reasoning: false,
              },
            ],
          },
        },
      },
    });

    const state = await getCloudSettingsState();

    expect(state.primaryModel).toBe("openai/gpt-4.1-mini");
    expect(state.chatModels).toEqual([
      {
        stableId: "openai/gpt-4.1-mini",
        displayName: "GPT",
        provider: "openai",
        reasoning: true,
      },
      {
        stableId: "gx10_hermes/qwen3:30b",
        displayName: "GX10-Hermes",
        provider: "hermes",
        reasoning: true,
      },
      {
        stableId: "ollama/gemma4:e2b",
        displayName: "Gemma4-E2B",
        provider: "ollama",
        reasoning: false,
      },
    ]);
    expect(state.models).toEqual([]);
  });
});
