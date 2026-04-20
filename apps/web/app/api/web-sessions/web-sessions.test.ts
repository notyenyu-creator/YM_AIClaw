import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock node:fs
vi.mock("node:fs", () => ({
  existsSync: vi.fn(() => false),
  readFileSync: vi.fn(() => "[]"),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  appendFileSync: vi.fn(),
}));

// Mock node:os
vi.mock("node:os", () => ({
  homedir: vi.fn(() => "/home/testuser"),
}));

// Mock node:crypto
vi.mock("node:crypto", () => ({
  randomUUID: vi.fn(() => "test-uuid-1234"),
}));

describe("Web Sessions API", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.mock("node:fs", () => ({
      existsSync: vi.fn(() => false),
      readFileSync: vi.fn(() => "[]"),
      writeFileSync: vi.fn(),
      mkdirSync: vi.fn(),
      appendFileSync: vi.fn(),
    }));
    vi.mock("node:os", () => ({
      homedir: vi.fn(() => "/home/testuser"),
    }));
    vi.mock("node:crypto", () => ({
      randomUUID: vi.fn(() => "test-uuid-1234"),
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─── GET /api/web-sessions ──────────────────────────────────────

  describe("GET /api/web-sessions", () => {
    it("returns empty sessions when no index exists", async () => {
      const { GET } = await import("./route.js");
      const req = new Request("http://localhost/api/web-sessions");
      const res = await GET(req);
      const json = await res.json();
      expect(json.sessions).toEqual([]);
    });

    it("returns global sessions when no filePath param", async () => {
      const { readFileSync: mockReadFile, existsSync: mockExists } = await import("node:fs");
      vi.mocked(mockExists).mockReturnValue(true);
      const sessions = [
        { id: "s1", title: "Chat 1", createdAt: 1, updatedAt: 1, messageCount: 0 },
        { id: "s2", title: "File Chat", createdAt: 2, updatedAt: 2, messageCount: 1, filePath: "doc.md" },
      ];
      vi.mocked(mockReadFile).mockReturnValue(JSON.stringify(sessions) as never);

      const { GET } = await import("./route.js");
      const req = new Request("http://localhost/api/web-sessions");
      const res = await GET(req);
      const json = await res.json();
      expect(json.sessions).toHaveLength(1);
      expect(json.sessions[0].id).toBe("s1");
    });

    it("filters sessions by filePath param", async () => {
      const { readFileSync: mockReadFile, existsSync: mockExists } = await import("node:fs");
      vi.mocked(mockExists).mockReturnValue(true);
      const sessions = [
        { id: "s1", title: "Global", createdAt: 1, updatedAt: 1, messageCount: 0 },
        { id: "s2", title: "Doc Chat", createdAt: 2, updatedAt: 2, messageCount: 1, filePath: "doc.md" },
      ];
      vi.mocked(mockReadFile).mockReturnValue(JSON.stringify(sessions) as never);

      const { GET } = await import("./route.js");
      const req = new Request("http://localhost/api/web-sessions?filePath=doc.md");
      const res = await GET(req);
      const json = await res.json();
      expect(json.sessions).toHaveLength(1);
      expect(json.sessions[0].filePath).toBe("doc.md");
    });

    it("returns empty when no matching filePath sessions", async () => {
      const { readFileSync: mockReadFile, existsSync: mockExists } = await import("node:fs");
      vi.mocked(mockExists).mockReturnValue(true);
      vi.mocked(mockReadFile).mockReturnValue("[]" as never);

      const { GET } = await import("./route.js");
      const req = new Request("http://localhost/api/web-sessions?filePath=nonexistent.md");
      const res = await GET(req);
      const json = await res.json();
      expect(json.sessions).toEqual([]);
    });

    it("returns planner learning draft queue metadata when includeAll=true", async () => {
      const { readFileSync: mockReadFile, existsSync: mockExists } = await import("node:fs");
      vi.mocked(mockExists).mockReturnValue(true);
      const sessions = [
        {
          id: "s-ycrm-review",
          title: "Needs review chat",
          createdAt: 10,
          updatedAt: 11,
          messageCount: 4,
          plannerPreflight: {
            system: "ycrm",
            updatedAt: 12,
            intent: "entity_summary",
            confidence: "high",
            shouldRouteToYcrm: true,
            workspaceId: "workspace_3jox",
            needsWorkspaceValidation: false,
            warnings: [],
            blockers: [],
            crossSystem: false,
            targetSystems: [],
          },
          plannerLearningDraft: {
            session_id: "s-ycrm-review",
            status: "ready",
            learning_focus: "entity_summary",
            summary: "Draft is ready for review.",
            meta: {
              generated_at: 1710000000000,
              generation_mode: "minimal_evidence",
              token_guardrails: ["single_session_single_draft"],
              cached: true,
              source: "session_cache",
            },
            writeback: {
              status: "promotion_conflicted",
              updated_at: 1710000001000,
              files: ["wiki/entities/customers/workspace_3jox-review-customer-summary.md"],
              skipped_files: [],
              promoted_files: [],
              promotion_skipped_files: [],
              promotion_conflict_files: ["wiki/entities/customers/workspace_3jox-review-customer-summary.md"],
              approved_at: null,
              approved_via: null,
              resolution_action: null,
              resolved_at: null,
              review_reason: "Needs manual merge",
              reviewer_note: "Customer summary overlaps with an existing page.",
              reviewer_actor: "qa-reviewer",
            },
            evidence: {
              latest_user_message: "整理 Calleen Hong 的客戶背景",
              latest_assistant_reply: "我先整理目前可見的 Y-CRM 客戶脈絡。",
              live_query_steps: ["read_real_data", "resolve_workspace_member_fk"],
            },
            drafts: {
              wiki: [],
              playbooks: [],
              memory: [],
            },
            history: [],
          },
        },
        {
          id: "s-file",
          title: "Scoped chat",
          createdAt: 20,
          updatedAt: 21,
          messageCount: 2,
          filePath: "docs/demo.md",
        },
      ];
      vi.mocked(mockReadFile).mockReturnValue(JSON.stringify(sessions) as never);

      const { GET } = await import("./route.js");
      const req = new Request("http://localhost/api/web-sessions?includeAll=true");
      const res = await GET(req);
      const json = await res.json();

      expect(json.sessions).toHaveLength(2);
      expect(json.sessions[0].id).toBe("s-ycrm-review");
      expect(json.sessions[0].plannerLearningDraft?.writeback?.status).toBe("promotion_conflicted");
      expect(json.sessions[0].plannerLearningDraft?.writeback?.reviewer_actor).toBe("qa-reviewer");
      expect(json.sessions[0].plannerLearningDraft?.writeback?.review_reason).toBe("Needs manual merge");
      expect(json.sessions[1].filePath).toBe("docs/demo.md");
    });
  });

  // ─── POST /api/web-sessions ────────────────────────────────────

  describe("POST /api/web-sessions", () => {
    it("creates a new session with default title", async () => {
      const { writeFileSync: mockWrite } = await import("node:fs");

      const { POST } = await import("./route.js");
      const req = new Request("http://localhost/api/web-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const res = await POST(req);
      const json = await res.json();
      expect(json.session.id).toBe("test-uuid-1234");
      expect(json.session.title).toBe("New Chat");
      expect(json.session.messageCount).toBe(0);
      expect(mockWrite).toHaveBeenCalled();
    });

    it("creates session with custom title", async () => {
      const { POST } = await import("./route.js");
      const req = new Request("http://localhost/api/web-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "My Chat" }),
      });
      const res = await POST(req);
      const json = await res.json();
      expect(json.session.title).toBe("My Chat");
    });

    it("creates file-scoped session with filePath", async () => {
      const { POST } = await import("./route.js");
      const req = new Request("http://localhost/api/web-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "File Chat", filePath: "readme.md" }),
      });
      const res = await POST(req);
      const json = await res.json();
      expect(json.session.filePath).toBe("readme.md");
    });

    it("handles invalid JSON body gracefully", async () => {
      const { POST } = await import("./route.js");
      const req = new Request("http://localhost/api/web-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not json",
      });
      const res = await POST(req);
      const json = await res.json();
      // Falls back to default title
      expect(json.session.title).toBe("New Chat");
    });

    it("creates jsonl file for new session", async () => {
      const { writeFileSync: mockWrite } = await import("node:fs");

      const { POST } = await import("./route.js");
      const req = new Request("http://localhost/api/web-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      await POST(req);
      // Should write at least the index.json and the empty .jsonl
      expect(mockWrite).toHaveBeenCalled();
      // Verify that one of the calls is to the jsonl file
      const calls = mockWrite.mock.calls.map((c) => String(c[0]));
      expect(calls.some((c) => c.endsWith(".jsonl"))).toBe(true);
    });
  });

  // ─── GET /api/web-sessions/[id] ────────────────────────────────

  describe("GET /api/web-sessions/[id]", () => {
    it("returns session messages", async () => {
      const { existsSync: mockExists, readFileSync: mockReadFile } = await import("node:fs");
      vi.mocked(mockExists).mockReturnValue(true);
      const lines = [
        JSON.stringify({ id: "m1", role: "user", content: "hello" }),
        JSON.stringify({ id: "m2", role: "assistant", content: "hi" }),
      ].join("\n");
      vi.mocked(mockReadFile).mockImplementation((path) => {
        const value = String(path);
        if (value.endsWith("index.json")) {
          return JSON.stringify([
            {
              id: "s1",
              title: "Planner Chat",
              createdAt: 1,
              updatedAt: 2,
              messageCount: 2,
              plannerPreflight: {
                system: "ycrm",
                updatedAt: 3,
                intent: "entity_summary",
                confidence: "high",
                shouldRouteToYcrm: true,
                workspaceId: "workspace_3jox",
                needsWorkspaceValidation: false,
                warnings: [],
                blockers: [],
                crossSystem: false,
                targetSystems: [],
              },
              plannerContextPack: {
                planner: {
                  system: "ycrm",
                  updatedAt: 3,
                  intent: "entity_summary",
                  confidence: "high",
                  shouldRouteToYcrm: true,
                  workspaceId: "workspace_3jox",
                  needsWorkspaceValidation: false,
                  warnings: [],
                  blockers: [],
                  crossSystem: false,
                  targetSystems: [],
                },
                read_first: [
                  "skills/ycrm/SKILL.md",
                  "schema/integration-profiles/ycrm.md",
                ],
                references: [],
                wiki: ["wiki/entities/customers/YCRM_CUSTOMER_SUMMARY_TEMPLATE.md"],
                playbooks: [],
                memory_keys: ["known_rule:person_name_is_not_workspace"],
                live_query_steps: ["read_real_data", "read_auto_schema_first", "resolve_workspace_member_fk"],
                execution_hints: ["Read the matching auto-schema reference before writing SQL or assuming field names."],
              },
              plannerLearningDraft: {
                session_id: "s1",
                status: "ready",
                learning_focus: "entity_summary",
                summary: "Generated a first-pass Y-CRM learning draft from the persisted session context for intent \"entity_summary\".",
                meta: {
                  generated_at: 1710000000000,
                  generation_mode: "minimal_evidence",
                  token_guardrails: ["single_session_single_draft"],
                  cached: true,
                  source: "session_cache",
                },
                writeback: {
                  status: "not_written",
                  updated_at: null,
                  files: [],
                  skipped_files: [],
                },
                evidence: {
                  latest_user_message: "hello",
                  latest_assistant_reply: "hi",
                  live_query_steps: ["read_real_data", "resolve_workspace_member_fk"],
                },
                drafts: {
                  wiki: [
                    {
                      kind: "customer_summary",
                      suggested_path: "wiki/entities/customers/workspace_3jo-s1-customer-summary.md",
                      title: "Y-CRM Customer Summary Draft",
                      reason: "Reusable customer summary.",
                      outline: ["客戶背景", "商機狀態", "下一步"],
                    },
                  ],
                  playbooks: [],
                  memory: [
                    {
                      key: "known_rule:person_name_requires_workspace_member_fk",
                      value: "Resolve workspaceMember first.",
                      reason: "This session used person-name lookup.",
                    },
                  ],
                },
              },
            },
          ]) as never;
        }
        return lines as never;
      });

      const { GET } = await import("./[id]/route.js");
      const res = await GET(
        new Request("http://localhost/api/web-sessions/s1"),
        { params: Promise.resolve({ id: "s1" }) },
      );
      const json = await res.json();
      expect(json.id).toBe("s1");
      expect(json.session?.plannerPreflight?.intent).toBe("entity_summary");
      expect(json.session?.plannerContextPack?.planner?.intent).toBe("entity_summary");
      expect(json.session?.plannerContextPack?.live_query_steps).toContain("resolve_workspace_member_fk");
      expect(json.session?.plannerLearningDraft?.learning_focus).toBe("entity_summary");
      expect(json.session?.plannerLearningDraft?.drafts?.memory?.[0]?.key).toContain("workspace_member_fk");
      expect(json.messages).toHaveLength(2);
    });

    it("returns 404 when session file does not exist", async () => {
      const { existsSync: mockExists } = await import("node:fs");
      vi.mocked(mockExists).mockReturnValue(false);

      const { GET } = await import("./[id]/route.js");
      const res = await GET(
        new Request("http://localhost/api/web-sessions/nonexistent"),
        { params: Promise.resolve({ id: "nonexistent" }) },
      );
      expect(res.status).toBe(404);
    });

    it("handles empty session file", async () => {
      const { existsSync: mockExists, readFileSync: mockReadFile } = await import("node:fs");
      vi.mocked(mockExists).mockReturnValue(true);
      vi.mocked(mockReadFile).mockReturnValue("" as never);

      const { GET } = await import("./[id]/route.js");
      const res = await GET(
        new Request("http://localhost/api/web-sessions/s1"),
        { params: Promise.resolve({ id: "s1" }) },
      );
      const json = await res.json();
      expect(json.messages).toEqual([]);
    });
  });

  // ─── POST /api/web-sessions/[id]/messages ──────────────────────

  describe("POST /api/web-sessions/[id]/messages", () => {
    it("appends messages to session file", async () => {
      const { existsSync: mockExists, readFileSync: mockReadFile, writeFileSync: _mockWrite } = await import("node:fs");
      vi.mocked(mockExists).mockReturnValue(true);
      vi.mocked(mockReadFile).mockImplementation((p) => {
        const s = String(p);
        if (s.endsWith("index.json")) {
          return JSON.stringify([{ id: "s1", title: "Chat", createdAt: 1, updatedAt: 1, messageCount: 0 }]) as never;
        }
        return "" as never;
      });

      const { POST } = await import("./[id]/messages/route.js");
      const req = new Request("http://localhost/api/web-sessions/s1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ id: "m1", role: "user", content: "hello" }],
        }),
      });
      const res = await POST(req, { params: Promise.resolve({ id: "s1" }) });
      const json = await res.json();
      expect(json.ok).toBe(true);
    });

    it("auto-creates session file if missing", async () => {
      const { existsSync: mockExists, readFileSync: mockReadFile, writeFileSync: _mockWrite } = await import("node:fs");
      vi.mocked(mockExists).mockImplementation((p) => {
        const s = String(p);
        if (s.endsWith(".jsonl")) {return false;}
        return true;
      });
      vi.mocked(mockReadFile).mockImplementation((p) => {
        const s = String(p);
        if (s.endsWith("index.json")) {return "[]" as never;}
        return "" as never;
      });

      const { POST } = await import("./[id]/messages/route.js");
      const req = new Request("http://localhost/api/web-sessions/new-s/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ id: "m1", role: "user", content: "first message" }],
        }),
      });
      const res = await POST(req, { params: Promise.resolve({ id: "new-s" }) });
      expect(res.status).toBe(200);
    });

    it("updates session title when provided", async () => {
      const { existsSync: mockExists, readFileSync: mockReadFile, writeFileSync: mockWrite } = await import("node:fs");
      vi.mocked(mockExists).mockReturnValue(true);
      vi.mocked(mockReadFile).mockImplementation((p) => {
        const s = String(p);
        if (s.endsWith("index.json")) {
          return JSON.stringify([{ id: "s1", title: "Old Title", createdAt: 1, updatedAt: 1, messageCount: 0 }]) as never;
        }
        return "" as never;
      });

      const { POST } = await import("./[id]/messages/route.js");
      const req = new Request("http://localhost/api/web-sessions/s1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ id: "m1", role: "user", content: "hello" }],
          title: "New Title",
        }),
      });
      const res = await POST(req, { params: Promise.resolve({ id: "s1" }) });
      expect(res.status).toBe(200);
      // Verify index was written with new title
      expect(mockWrite).toHaveBeenCalled();
    });
  });
});
