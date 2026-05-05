import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock active-runs module
vi.mock("@/lib/active-runs", () => ({
  startRun: vi.fn(),
  hasActiveRun: vi.fn(() => false),
  subscribeToRun: vi.fn(),
  persistUserMessage: vi.fn(),
  abortRun: vi.fn(() => false),
  getActiveRun: vi.fn(),
  getRunningSessionIds: vi.fn(() => []),
}));

// Mock workspace module
vi.mock("@/lib/workspace", () => ({
  ensureManagedWorkspaceRouting: vi.fn(),
  getActiveWorkspaceName: vi.fn(() => "default"),
  resolveActiveAgentId: vi.fn(() => "main"),
  resolveAgentWorkspacePrefix: vi.fn(() => null),
  resolveOpenClawStateDir: vi.fn(() => "/home/testuser/.openclaw-dench"),
  resolveWorkspaceDirForName: vi.fn((name: string) =>
    name === "default"
      ? "/home/testuser/.openclaw-dench/workspace"
      : `/home/testuser/.openclaw-dench/workspace-${name}`,
  ),
  resolveWorkspaceRoot: vi.fn(() => "/home/testuser/.openclaw-dench/workspace"),
}));

// Mock web-sessions shared module
vi.mock("@/app/api/web-sessions/shared", () => ({
  getSessionMeta: vi.fn(() => undefined),
  hasRotatedGatewayThread: vi.fn(() => false),
  invalidateSessionErpPlannerArtifacts: vi.fn(),
  invalidateSessionYcrmPlannerArtifacts: vi.fn(),
  rotateGatewaySessionThreadForModelReset: vi.fn(),
  updateSessionErpPlannerContextPack: vi.fn(),
  updateSessionErpPlannerPreflight: vi.fn(),
  updateSessionPlannerPreflight: vi.fn(),
  updateSessionPlannerContextPack: vi.fn(),
  resolveSessionKey: vi.fn(
    (sessionId: string, fallbackAgentId: string) =>
      `agent:${fallbackAgentId}:web:${sessionId}`,
  ),
  resolveSessionAgentId: vi.fn(
    (_sessionId: string, fallbackAgentId: string) => fallbackAgentId,
  ),
}));

vi.mock("@/app/api/sessions/shared", () => ({
  getAgentSession: vi.fn(() => undefined),
}));

describe("Chat API routes", () => {
  beforeEach(() => {
    vi.resetModules();
    // Re-wire mocks
    vi.mock("@/lib/active-runs", () => ({
      startRun: vi.fn(),
      hasActiveRun: vi.fn(() => false),
      subscribeToRun: vi.fn(),
      persistUserMessage: vi.fn(),
      abortRun: vi.fn(() => false),
      getActiveRun: vi.fn(),
      getRunningSessionIds: vi.fn(() => []),
    }));
    vi.mock("@/lib/workspace", () => ({
      ensureManagedWorkspaceRouting: vi.fn(),
      getActiveWorkspaceName: vi.fn(() => "default"),
      resolveActiveAgentId: vi.fn(() => "main"),
      resolveAgentWorkspacePrefix: vi.fn(() => null),
      resolveOpenClawStateDir: vi.fn(() => "/home/testuser/.openclaw-dench"),
      resolveWorkspaceDirForName: vi.fn((name: string) =>
        name === "default"
          ? "/home/testuser/.openclaw-dench/workspace"
          : `/home/testuser/.openclaw-dench/workspace-${name}`,
      ),
      resolveWorkspaceRoot: vi.fn(() => "/home/testuser/.openclaw-dench/workspace"),
    }));
    vi.mock("@/app/api/web-sessions/shared", () => ({
      getSessionMeta: vi.fn(() => undefined),
      hasRotatedGatewayThread: vi.fn(() => false),
      invalidateSessionErpPlannerArtifacts: vi.fn(),
      invalidateSessionYcrmPlannerArtifacts: vi.fn(),
      rotateGatewaySessionThreadForModelReset: vi.fn(),
      updateSessionErpPlannerContextPack: vi.fn(),
      updateSessionErpPlannerPreflight: vi.fn(),
      updateSessionPlannerPreflight: vi.fn(),
      updateSessionPlannerContextPack: vi.fn(),
      resolveSessionKey: vi.fn(
        (sessionId: string, fallbackAgentId: string) =>
          `agent:${fallbackAgentId}:web:${sessionId}`,
      ),
      resolveSessionAgentId: vi.fn(
        (_sessionId: string, fallbackAgentId: string) => fallbackAgentId,
      ),
    }));
    vi.mock("@/app/api/sessions/shared", () => ({
      getAgentSession: vi.fn(() => undefined),
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─── POST /api/chat ──────────────────────────────────────────────

  describe("POST /api/chat", () => {
    it("returns 400 when no user message text", async () => {
      const { POST } = await import("./route.js");
      const req = new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", parts: [{ type: "text", text: "" }] }],
        }),
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    it("returns 409 when active run exists for session", async () => {
      const { hasActiveRun } = await import("@/lib/active-runs");
      vi.mocked(hasActiveRun).mockReturnValue(true);

      const { POST } = await import("./route.js");
      const req = new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", parts: [{ type: "text", text: "hello" }] }],
          sessionId: "s1",
        }),
      });
      const res = await POST(req);
      expect(res.status).toBe(409);
    });

    it("starts a run and returns streaming response", async () => {
      const { startRun, hasActiveRun, subscribeToRun } = await import("@/lib/active-runs");
      vi.mocked(hasActiveRun).mockReturnValue(false);
      vi.mocked(subscribeToRun).mockReturnValue(() => {});

      const { POST } = await import("./route.js");
      const req = new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            { id: "m1", role: "user", parts: [{ type: "text", text: "hello" }] },
          ],
          sessionId: "s1",
        }),
      });
      const res = await POST(req);
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("text/event-stream");
      expect(startRun).toHaveBeenCalled();
      expect(subscribeToRun).toHaveBeenCalledWith(
        "s1",
        expect.any(Function),
        { replay: true },
      );
    });

    it("clears stale planner artifacts when the latest turn no longer persists Y-CRM routing state", async () => {
      const { hasActiveRun, subscribeToRun } = await import("@/lib/active-runs");
      const {
        invalidateSessionYcrmPlannerArtifacts,
        updateSessionPlannerPreflight,
        updateSessionPlannerContextPack,
      } = await import("@/app/api/web-sessions/shared");
      vi.mocked(hasActiveRun).mockReturnValue(false);
      vi.mocked(subscribeToRun).mockReturnValue(() => {});

      const { POST } = await import("./route.js");
      const req = new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            { id: "m1", role: "user", parts: [{ type: "text", text: "hello" }] },
          ],
          sessionId: "s-stale",
        }),
      });

      const res = await POST(req);

      expect(res.status).toBe(200);
      expect(invalidateSessionYcrmPlannerArtifacts).toHaveBeenCalledWith("s-stale", {
        preserveReviewedLearningDraft: true,
      });
      expect(updateSessionPlannerPreflight).not.toHaveBeenCalled();
      expect(updateSessionPlannerContextPack).not.toHaveBeenCalled();
    });

    it("forwards a chat model override to the run starter", async () => {
      const { startRun, hasActiveRun, subscribeToRun } = await import("@/lib/active-runs");
      vi.mocked(hasActiveRun).mockReturnValue(false);
      vi.mocked(subscribeToRun).mockReturnValue(() => {});

      const { POST } = await import("./route.js");
      const req = new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            { id: "m1", role: "user", parts: [{ type: "text", text: "hello" }] },
          ],
          sessionId: "s1",
          modelOverride: "gpt-5.4",
        }),
      });

      await POST(req);

      expect(startRun).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: "s1",
          modelOverride: "gpt-5.4",
        }),
      );
    });

    it("returns JSON when an unsafe OpenAI switch needs acknowledgement", async () => {
      const { getAgentSession } = await import("@/app/api/sessions/shared");
      const { startRun } = await import("@/lib/active-runs");
      vi.mocked(startRun).mockClear();
      vi.mocked(getAgentSession).mockReturnValue({
        key: "agent:main:web:s1",
        sessionId: "s1",
        updatedAt: Date.now(),
        model: "dench-cloud/anthropic.claude-opus-4-6-v1",
        modelProvider: "anthropic",
      } as never);

      const { POST } = await import("./route.js");
      const req = new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            { id: "m0", role: "assistant", parts: [{ type: "text", text: "hi" }] },
            { id: "m1", role: "user", parts: [{ type: "text", text: "switch me" }] },
          ],
          sessionId: "s1",
          modelOverride: "gpt-5.4",
        }),
      });

      const res = await POST(req);

      expect(res.status).toBe(409);
      const body = await res.json() as { code?: string };
      expect(body.code).toBe("openai_unsafe_switch");
      expect(startRun).not.toHaveBeenCalled();
    });

    it("rotates gateway thread and starts run when unsafe switch is acknowledged", async () => {
      const { getAgentSession } = await import("@/app/api/sessions/shared");
      const {
        getSessionMeta,
        rotateGatewaySessionThreadForModelReset,
      } = await import("@/app/api/web-sessions/shared");
      const { startRun } = await import("@/lib/active-runs");
      vi.mocked(startRun).mockClear();
      vi.mocked(rotateGatewaySessionThreadForModelReset).mockClear();
      vi.mocked(getAgentSession).mockReturnValue({
        key: "agent:main:web:s1",
        sessionId: "s1",
        updatedAt: Date.now(),
        model: "dench-cloud/anthropic.claude-opus-4-6-v1",
        modelProvider: "anthropic",
      } as never);

      let gatewayThread = "s1";
      vi.mocked(getSessionMeta).mockImplementation(
        () =>
          ({
            id: "s1",
            workspaceAgentId: "main",
            gatewaySessionId: gatewayThread === "s1" ? undefined : gatewayThread,
          }) as never,
      );
      vi.mocked(rotateGatewaySessionThreadForModelReset).mockImplementation(() => {
        gatewayThread = "fresh-thread-id";
      });

      const { POST } = await import("./route.js");
      const req = new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            { id: "m0", role: "assistant", parts: [{ type: "text", text: "hi" }] },
            { id: "m1", role: "user", parts: [{ type: "text", text: "go" }] },
          ],
          sessionId: "s1",
          modelOverride: "gpt-5.4",
          acknowledgeUnsafeOpenAiSwitch: true,
        }),
      });

      const res = await POST(req);
      expect(res.ok).toBe(true);
      expect(rotateGatewaySessionThreadForModelReset).toHaveBeenCalledWith("s1");
      expect(startRun).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: "s1",
          agentSessionId: "fresh-thread-id",
          modelOverride: "gpt-5.4",
        }),
      );
    });

    it("allows first user message with OpenAI override when session metadata is unknown", async () => {
      const { getAgentSession } = await import("@/app/api/sessions/shared");
      const { startRun } = await import("@/lib/active-runs");
      vi.mocked(startRun).mockClear();
      vi.mocked(getAgentSession).mockReturnValue(undefined);

      const { POST } = await import("./route.js");
      const req = new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            { id: "m1", role: "user", parts: [{ type: "text", text: "hello" }] },
          ],
          sessionId: "s1",
          modelOverride: "gpt-5.4",
        }),
      });

      await POST(req);
      expect(startRun).toHaveBeenCalled();
    });

    it("maps partial tool output into AI SDK preliminary output chunks", async () => {
      const { hasActiveRun, subscribeToRun } = await import("@/lib/active-runs");
      vi.mocked(hasActiveRun).mockReturnValue(false);
      vi.mocked(subscribeToRun).mockImplementation(((_sessionId, callback) => {
        callback({
          type: "tool-output-partial",
          toolCallId: "tool-1",
          output: { text: "partial output" },
        } as never);
        callback(null);
        return () => {};
      }) as never);

      const { POST } = await import("./route.js");
      const req = new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            { id: "m1", role: "user", parts: [{ type: "text", text: "hello" }] },
          ],
          sessionId: "s1",
        }),
      });
      const res = await POST(req);
      const body = await res.text();

      expect(body).toContain('"type":"tool-output-available"');
      expect(body).toContain('"toolCallId":"tool-1"');
      expect(body).toContain('"preliminary":true');
      expect(body).toContain('"text":"partial output"');
      expect(body).not.toContain("tool-output-partial");
    });

    it("does not reuse an old run when sessionId is absent", async () => {
      const { startRun, hasActiveRun, subscribeToRun, persistUserMessage } = await import("@/lib/active-runs");
      vi.mocked(hasActiveRun).mockReturnValue(true);
      vi.mocked(subscribeToRun).mockReturnValue(() => {});
      vi.mocked(hasActiveRun).mockClear();
      vi.mocked(startRun).mockClear();
      vi.mocked(persistUserMessage).mockClear();

      const { POST } = await import("./route.js");
      const req = new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            { id: "m1", role: "user", parts: [{ type: "text", text: "new workspace question" }] },
          ],
        }),
      });
      const res = await POST(req);
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("text/event-stream");
      expect(hasActiveRun).not.toHaveBeenCalled();
      expect(startRun).not.toHaveBeenCalled();
      expect(persistUserMessage).not.toHaveBeenCalled();
    });

    it("persists user message when sessionId provided", async () => {
      const { hasActiveRun, subscribeToRun, persistUserMessage } = await import("@/lib/active-runs");
      vi.mocked(hasActiveRun).mockReturnValue(false);
      vi.mocked(subscribeToRun).mockReturnValue(() => {});

      const { POST } = await import("./route.js");
      const req = new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            { id: "m1", role: "user", parts: [{ type: "text", text: "hi" }] },
          ],
          sessionId: "s1",
        }),
      });
      await POST(req);
      expect(persistUserMessage).toHaveBeenCalledWith("s1", expect.objectContaining({ id: "m1" }));
    });

    it("uses the persisted workspace agent id when available", async () => {
      const { getSessionMeta } = await import("@/app/api/web-sessions/shared");
      const { startRun, hasActiveRun, subscribeToRun } = await import("@/lib/active-runs");
      vi.mocked(hasActiveRun).mockReturnValue(false);
      vi.mocked(subscribeToRun).mockReturnValue(() => {});
      vi.mocked(getSessionMeta).mockReturnValue({
        id: "s1",
        title: "Chat",
        createdAt: 1,
        updatedAt: 1,
        messageCount: 1,
        workspaceName: "default",
        workspaceRoot: "/home/testuser/.openclaw-dench/workspace",
        workspaceAgentId: "main",
      } as never);

      const { POST } = await import("./route.js");
      const req = new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            { id: "m1", role: "user", parts: [{ type: "text", text: "repair routing" }] },
          ],
          sessionId: "s1",
        }),
      });
      await POST(req);
      expect(startRun).toHaveBeenCalledWith(
        expect.objectContaining({
          overrideAgentId: "main",
        }),
      );
    });

    it("resolves workspace file paths in message", async () => {
      const { resolveAgentWorkspacePrefix } = await import("@/lib/workspace");
      vi.mocked(resolveAgentWorkspacePrefix).mockReturnValue("workspace");
      const { startRun, hasActiveRun, subscribeToRun } = await import("@/lib/active-runs");
      vi.mocked(hasActiveRun).mockReturnValue(false);
      vi.mocked(subscribeToRun).mockReturnValue(() => {});

      const { POST } = await import("./route.js");
      const req = new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            {
              id: "m1",
              role: "user",
              parts: [{ type: "text", text: "[Context: workspace file 'doc.md']" }],
            },
          ],
          sessionId: "s1",
        }),
      });
      await POST(req);
      expect(startRun).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining("workspace/doc.md"),
        }),
      );
    });

    it("injects Y-CRM planner preflight into the agent message and stores planner metadata", async () => {
      const { startRun, hasActiveRun, subscribeToRun } = await import("@/lib/active-runs");
      const {
        updateSessionPlannerPreflight,
        updateSessionPlannerContextPack,
      } = await import("@/app/api/web-sessions/shared");
      vi.mocked(hasActiveRun).mockReturnValue(false);
      vi.mocked(subscribeToRun).mockReturnValue(() => {});

      const { POST } = await import("./route.js");
      const req = new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            {
              id: "m1",
              role: "user",
              parts: [{ type: "text", text: "請幫我整理 Y-CRM 工作區裡面的 Calleen Hong 目前負責的客戶背景。" }],
            },
          ],
          sessionId: "s1",
        }),
      });

      await POST(req);

      expect(updateSessionPlannerPreflight).toHaveBeenCalledWith(
        "s1",
        expect.objectContaining({
          system: "ycrm",
          intent: "entity_summary",
          shouldRouteToYcrm: true,
        }),
      );
      expect(updateSessionPlannerContextPack).toHaveBeenCalledWith(
        "s1",
        expect.objectContaining({
          planner: expect.objectContaining({
            system: "ycrm",
            intent: "entity_summary",
          }),
          live_query_steps: expect.arrayContaining(["read_real_data", "read_auto_schema_first", "resolve_workspace_member_fk"]),
        }),
      );
      expect(startRun).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining("[Y-CRM Context Pack]"),
        }),
      );
      expect(startRun).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining("planner.intent=entity_summary"),
        }),
      );
      expect(startRun).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining("resolve_workspace_member_fk"),
        }),
      );
    });

    it("injects ERP context pack when ERP keywords are present and Y-CRM does not claim the message", async () => {
      const { startRun, hasActiveRun, subscribeToRun } = await import("@/lib/active-runs");
      const {
        invalidateSessionYcrmPlannerArtifacts,
        updateSessionErpPlannerContextPack,
        updateSessionErpPlannerPreflight,
        updateSessionPlannerPreflight,
        updateSessionPlannerContextPack,
      } = await import("@/app/api/web-sessions/shared");
      vi.mocked(hasActiveRun).mockReturnValue(false);
      vi.mocked(subscribeToRun).mockReturnValue(() => {});
      vi.mocked(invalidateSessionYcrmPlannerArtifacts).mockClear();
      vi.mocked(updateSessionErpPlannerPreflight).mockClear();
      vi.mocked(updateSessionErpPlannerContextPack).mockClear();
      vi.mocked(updateSessionPlannerPreflight).mockClear();
      vi.mocked(updateSessionPlannerContextPack).mockClear();

      const { POST } = await import("./route.js");
      const req = new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            {
              id: "m1",
              role: "user",
              parts: [{ type: "text", text: "請幫我查 OOCHAIN 本月還沒出貨的訂單。" }],
            },
          ],
          sessionId: "s-erp",
        }),
      });

      await POST(req);

      expect(updateSessionPlannerPreflight).toHaveBeenCalledWith(
        "s-erp",
        expect.objectContaining({
          system: "ycrm",
          intent: "cross_system_request",
          shouldRouteToYcrm: false,
          crossSystem: true,
        }),
      );
      expect(updateSessionPlannerContextPack).toHaveBeenCalledWith(
        "s-erp",
        expect.objectContaining({
          planner: expect.objectContaining({
            system: "ycrm",
            intent: "cross_system_request",
            shouldRouteToYcrm: false,
          }),
        }),
      );
      expect(invalidateSessionYcrmPlannerArtifacts).not.toHaveBeenCalled();
      expect(updateSessionErpPlannerPreflight).toHaveBeenCalledWith(
        "s-erp",
        expect.objectContaining({
          system: "erp",
          intent: "sales_order",
          shouldRouteToErp: true,
        }),
      );
      expect(updateSessionErpPlannerContextPack).toHaveBeenCalledWith(
        "s-erp",
        expect.objectContaining({
          planner: expect.objectContaining({
            system: "erp",
            intent: "sales_order",
            shouldRouteToErp: true,
          }),
          read_first: expect.arrayContaining([
            "skills/erp/SKILL.md",
            "skills/erp/reference/auto-schema-erp.md",
          ]),
        }),
      );
      expect(startRun).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining("[ERP Context Pack]"),
        }),
      );
      expect(startRun).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining("planner.intent=sales_order"),
        }),
      );
      expect(startRun).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining("runtime.orchestration=hermes_style"),
        }),
      );
    });

    it("adds compact rolling context only for follow-up turns that need continuity", async () => {
      const { startRun, hasActiveRun, subscribeToRun } = await import("@/lib/active-runs");
      vi.mocked(hasActiveRun).mockReturnValue(false);
      vi.mocked(subscribeToRun).mockReturnValue(() => {});

      const { POST } = await import("./route.js");
      const req = new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            { id: "m1", role: "user", parts: [{ type: "text", text: "先幫我整理 Calleen Hong 的客戶背景" }] },
            { id: "m2", role: "assistant", parts: [{ type: "text", text: "我已經整理出三家重點客戶與目前商機階段。" }] },
            { id: "m3", role: "user", parts: [{ type: "text", text: "再幫我把剛剛那三家排成優先順序" }] },
          ],
          sessionId: "s-followup",
        }),
      });

      await POST(req);

      expect(startRun).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining("[Rolling Context]"),
        }),
      );
      expect(startRun).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining("rolling.mode=window_only"),
        }),
      );
    });
  });

  // ─── POST /api/chat/stop ────────────────────────────────────────

  describe("POST /api/chat/stop", () => {
    it("returns 400 when sessionId missing", async () => {
      const { POST } = await import("./stop/route.js");
      const req = new Request("http://localhost/api/chat/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    it("aborts run and returns result", async () => {
      const { abortRun, getActiveRun } = await import("@/lib/active-runs");
      vi.mocked(getActiveRun).mockReturnValue({ status: "running" } as never);
      vi.mocked(abortRun).mockReturnValue(true);

      const { POST } = await import("./stop/route.js");
      const req = new Request("http://localhost/api/chat/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: "s1" }),
      });
      const res = await POST(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.aborted).toBe(true);
    });

    it("returns aborted=false for unknown session", async () => {
      const { abortRun } = await import("@/lib/active-runs");
      vi.mocked(abortRun).mockReturnValue(false);

      const { POST } = await import("./stop/route.js");
      const req = new Request("http://localhost/api/chat/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: "nonexistent" }),
      });
      const res = await POST(req);
      const json = await res.json();
      expect(json.aborted).toBe(false);
    });

    it("handles invalid JSON body gracefully", async () => {
      const { POST } = await import("./stop/route.js");
      const req = new Request("http://localhost/api/chat/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not json",
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
    });
  });

  // ─── GET /api/chat/active ────────────────────────────────────────

  describe("GET /api/chat/active", () => {
    it("returns empty sessionIds when no active runs", async () => {
      const { GET } = await import("./active/route.js");
      const res = GET();
      const json = await res.json();
      expect(json.sessionIds).toEqual([]);
    });

    it("returns active session IDs", async () => {
      const { getRunningSessionIds } = await import("@/lib/active-runs");
      vi.mocked(getRunningSessionIds).mockReturnValue(["s1", "s2"]);

      const { GET } = await import("./active/route.js");
      const res = GET();
      const json = await res.json();
      expect(json.sessionIds).toEqual(["s1", "s2"]);
    });
  });

  // ─── GET /api/chat/stream ───────────────────────────────────────

  describe("GET /api/chat/stream", () => {
    it("returns 400 when sessionId is missing", async () => {
      const { GET } = await import("./stream/route.js");
      const req = new Request("http://localhost/api/chat/stream");
      const res = await GET(req);
      expect(res.status).toBe(400);
    });

    it("returns 404 when no run exists for session", async () => {
      const { getActiveRun } = await import("@/lib/active-runs");
      vi.mocked(getActiveRun).mockReturnValue(undefined);

      const { GET } = await import("./stream/route.js");
      const req = new Request("http://localhost/api/chat/stream?sessionId=nonexistent");
      const res = await GET(req);
      expect(res.status).toBe(404);
    });

    it("returns SSE stream for active run", async () => {
      const { getActiveRun, subscribeToRun } = await import("@/lib/active-runs");
      vi.mocked(getActiveRun).mockReturnValue({ status: "running" } as never);
      vi.mocked(subscribeToRun).mockReturnValue(() => {});

      const { GET } = await import("./stream/route.js");
      const req = new Request("http://localhost/api/chat/stream?sessionId=s1");
      const res = await GET(req);
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("text/event-stream");
      expect(res.headers.get("X-Run-Active")).toBe("true");
    });

    it("returns X-Run-Active=false for completed run", async () => {
      const { getActiveRun, subscribeToRun } = await import("@/lib/active-runs");
      vi.mocked(getActiveRun).mockReturnValue({ status: "completed" } as never);
      vi.mocked(subscribeToRun).mockReturnValue(() => {});

      const { GET } = await import("./stream/route.js");
      const req = new Request("http://localhost/api/chat/stream?sessionId=s1");
      const res = await GET(req);
      expect(res.headers.get("X-Run-Active")).toBe("false");
    });
  });
});
