import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const WEB_CHAT_DIR = "/virtual/webchat";
const OPENCLAW_DIR = "/virtual/openclaw";

const fileStore = new Map<string, string>();
const dirStore = new Set<string>();

function normalizePath(input: string): string {
	return input.replace(/\/+/g, "/").replace(/\/$/, "") || "/";
}

function ensureParentDirs(filePath: string) {
	const normalized = normalizePath(filePath);
	const parts = normalized.split("/").filter(Boolean);
	let current = "";
	for (let index = 0; index < parts.length - 1; index += 1) {
		current += `/${parts[index]}`;
		dirStore.add(current);
	}
}

function listDirEntries(target: string): string[] {
	const normalizedTarget = normalizePath(target);
	const prefix = normalizedTarget === "/" ? "/" : `${normalizedTarget}/`;
	const results = new Set<string>();

	for (const filePath of fileStore.keys()) {
		if (!filePath.startsWith(prefix)) {
			continue;
		}
		const rest = filePath.slice(prefix.length);
		if (!rest) {
			continue;
		}
		const [entry] = rest.split("/");
		if (entry) {
			results.add(entry);
		}
	}

	for (const dirPath of dirStore) {
		if (!dirPath.startsWith(prefix) || dirPath === normalizedTarget) {
			continue;
		}
		const rest = dirPath.slice(prefix.length);
		if (!rest) {
			continue;
		}
		const [entry] = rest.split("/");
		if (entry) {
			results.add(entry);
		}
	}

	return [...results];
}

vi.mock("node:fs", () => ({
	existsSync: vi.fn((target: string) => {
		const normalized = normalizePath(String(target));
		return fileStore.has(normalized) || dirStore.has(normalized);
	}),
	readFileSync: vi.fn((target: string) => {
		const normalized = normalizePath(String(target));
		const value = fileStore.get(normalized);
		if (value === undefined) {
			throw new Error(`ENOENT: ${normalized}`);
		}
		return value;
	}),
	writeFileSync: vi.fn((target: string, content: string) => {
		const normalized = normalizePath(String(target));
		ensureParentDirs(normalized);
		fileStore.set(normalized, String(content));
	}),
	mkdirSync: vi.fn((target: string) => {
		dirStore.add(normalizePath(String(target)));
	}),
	readdirSync: vi.fn((target: string, options?: { withFileTypes?: boolean }) => {
		const entries = listDirEntries(String(target));
		if (options?.withFileTypes) {
			const base = normalizePath(String(target));
			return entries.map((entry) => {
				const fullPath = normalizePath(`${base}/${entry}`);
				return {
					name: entry,
					isDirectory: () => dirStore.has(fullPath) && !fileStore.has(fullPath),
				};
			});
		}
		return entries;
	}),
	statSync: vi.fn((target: string) => {
		const normalized = normalizePath(String(target));
		if (!fileStore.has(normalized) && !dirStore.has(normalized)) {
			throw new Error(`ENOENT: ${normalized}`);
		}
		return {
			birthtimeMs: 1,
			mtimeMs: 2,
		};
	}),
}));

vi.mock("@/lib/workspace", () => ({
	duckdbQueryExternalPgAsync: vi.fn(async () => []),
	resolveActiveAgentId: vi.fn(() => "main"),
	resolveAgentWorkspacePrefix: vi.fn(() => null),
	resolveOpenClawStateDir: vi.fn(() => OPENCLAW_DIR),
	resolveWorkspaceRoot: vi.fn(() => "/virtual/workspace"),
	resolveWebChatDir: vi.fn(() => WEB_CHAT_DIR),
}));

vi.mock("@/lib/active-runs", () => ({
	startRun: vi.fn(),
	startSubscribeRun: vi.fn(),
	hasActiveRun: vi.fn(() => false),
	getActiveRun: vi.fn(() => null),
	subscribeToRun: vi.fn(() => () => {}),
	persistUserMessage: vi.fn(async (sessionId: string, payload: { id?: string; content?: string }) => {
		const filePath = normalizePath(`${WEB_CHAT_DIR}/${sessionId}.jsonl`);
		const existing = fileStore.get(filePath);
		const line = JSON.stringify({
			id: payload.id ?? `msg-${Date.now()}`,
			role: "user",
			content: payload.content ?? "",
		});
		fileStore.set(filePath, existing && existing.length > 0 ? `${existing}\n${line}` : line);
	}),
	persistSubscribeUserMessage: vi.fn(),
	reactivateSubscribeRun: vi.fn(),
}));

vi.mock("@/app/api/sessions/shared", () => ({
	getAgentSession: vi.fn(() => undefined),
}));

function seedSession(sessionId: string) {
	dirStore.add(WEB_CHAT_DIR);
	dirStore.add(OPENCLAW_DIR);
	fileStore.set(
		normalizePath(`${WEB_CHAT_DIR}/index.json`),
		JSON.stringify([
			{
				id: sessionId,
				title: "Seed Chat",
				createdAt: 1,
				updatedAt: 1,
				messageCount: 0,
			},
		]),
	);
	fileStore.set(normalizePath(`${WEB_CHAT_DIR}/${sessionId}.jsonl`), "");
}

describe("Chat session planner persistence integration", () => {
	beforeEach(() => {
		fileStore.clear();
		dirStore.clear();
		dirStore.add("/");
		vi.resetModules();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("persists Y-CRM planner metadata and reads it back through the session route", async () => {
		seedSession("s-ycrm");

		const { POST } = await import("./route.js");
		const { GET } = await import("../web-sessions/[id]/route.js");

		const chatResponse = await POST(new Request("http://localhost/api/chat", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				sessionId: "s-ycrm",
				messages: [
					{
						id: "m1",
						role: "user",
						parts: [
							{
								type: "text",
								text: "請幫我整理 Y-CRM 工作區裡面的 Calleen Hong 目前負責的客戶背景。",
							},
						],
					},
				],
			}),
		}));

		expect(chatResponse.status).toBe(200);

		const sessionResponse = await GET(
			new Request("http://localhost/api/web-sessions/s-ycrm"),
			{ params: Promise.resolve({ id: "s-ycrm" }) },
		);
		const sessionJson = await sessionResponse.json();

		expect(sessionJson.session?.plannerPreflight?.intent).toBe("entity_summary");
		expect(sessionJson.session?.plannerPreflight?.validationState).toBe("heuristic");
		expect(sessionJson.session?.plannerPreflight?.shouldRouteToYcrm).toBe(true);
		expect(sessionJson.session?.plannerContextPack?.planner?.intent).toBe("entity_summary");
		expect(sessionJson.session?.plannerContextPack?.planner?.validationState).toBe("heuristic");
		expect(sessionJson.session?.plannerContextPack?.live_query_steps).toContain("resolve_workspace_member_fk");
		expect(sessionJson.messages).toHaveLength(1);
		expect(sessionJson.messages[0].content).toContain("Calleen Hong");
	});

	it("clears stale planner metadata after a later non-Y-CRM turn", async () => {
		seedSession("s-stale");

		const { POST } = await import("./route.js");
		const { GET } = await import("../web-sessions/[id]/route.js");

		await POST(new Request("http://localhost/api/chat", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				sessionId: "s-stale",
				messages: [
					{
						id: "m1",
						role: "user",
						parts: [
							{
								type: "text",
								text: "請幫我整理 Y-CRM 工作區裡面的 Calleen Hong 目前負責的客戶背景。",
							},
						],
					},
				],
			}),
		}));

		await POST(new Request("http://localhost/api/chat", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				sessionId: "s-stale",
				messages: [
					{
						id: "m2",
						role: "user",
						parts: [
							{
								type: "text",
								text: "hello",
							},
						],
					},
				],
			}),
		}));

		const sessionResponse = await GET(
			new Request("http://localhost/api/web-sessions/s-stale"),
			{ params: Promise.resolve({ id: "s-stale" }) },
		);
		const sessionJson = await sessionResponse.json();

		expect(sessionJson.session?.plannerPreflight ?? null).toBeNull();
		expect(sessionJson.session?.plannerContextPack ?? null).toBeNull();
		expect(sessionJson.messages).toHaveLength(2);
		expect(sessionJson.messages[1].content).toBe("hello");
	});

	it("keeps Y-CRM continuity for follow-up chart requests in the same session", async () => {
		seedSession("s-followup");

		const { POST } = await import("./route.js");
		const { GET } = await import("../web-sessions/[id]/route.js");

		await POST(new Request("http://localhost/api/chat", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				sessionId: "s-followup",
				messages: [
					{
						id: "m1",
						role: "user",
						parts: [
							{
								type: "text",
								text: "請幫我整理 Y-CRM 工作區裡面的 Calleen Hong 目前負責的客戶背景。",
							},
						],
					},
				],
			}),
		}));

		await POST(new Request("http://localhost/api/chat", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				sessionId: "s-followup",
				messages: [
					{
						id: "m1",
						role: "user",
						parts: [
							{
								type: "text",
								text: "請幫我整理 Y-CRM 工作區裡面的 Calleen Hong 目前負責的客戶背景。",
							},
						],
					},
					{
						id: "m2",
						role: "assistant",
						parts: [
							{
								type: "text",
								text: "以下是初步摘要。",
							},
						],
					},
					{
						id: "m3",
						role: "user",
						parts: [
							{
								type: "text",
								text: "好，我需要全部資料，然後用圖表呈現。",
							},
						],
					},
				],
			}),
		}));

		const sessionResponse = await GET(
			new Request("http://localhost/api/web-sessions/s-followup"),
			{ params: Promise.resolve({ id: "s-followup" }) },
		);
		const sessionJson = await sessionResponse.json();

		expect(sessionJson.session?.plannerPreflight?.shouldRouteToYcrm).toBe(true);
		expect(sessionJson.session?.plannerPreflight?.intent).toBe("entity_summary");
		expect(sessionJson.session?.plannerPreflight?.workspaceId).toBe("workspace_3joxkr9ofo5hlxjan164egffx");
		expect(sessionJson.session?.plannerPreflight?.confidence).toBe("high");
		expect(sessionJson.session?.plannerPreflight?.warnings ?? []).not.toContain("person_name_may_be_misread_as_workspace");
		expect(sessionJson.session?.plannerContextPack?.planner?.workspaceId).toBe("workspace_3joxkr9ofo5hlxjan164egffx");
		expect(sessionJson.session?.plannerContextPack?.planner?.shouldRouteToYcrm).toBe(true);
		expect(sessionJson.messages).toHaveLength(2);
		expect(sessionJson.messages[1].content).toContain("好，我需要全部資料");
	});

	it("persists ERP planner metadata while leaving Y-CRM learning artifacts untouched", async () => {
		seedSession("s-erp");

		const { POST } = await import("./route.js");
		const { GET } = await import("../web-sessions/[id]/route.js");

		await POST(new Request("http://localhost/api/chat", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				sessionId: "s-erp",
				messages: [
					{
						id: "m1",
						role: "user",
						parts: [
							{
								type: "text",
								text: "請幫我查 OOCHAIN 本月還沒出貨的訂單。",
							},
						],
					},
				],
			}),
		}));

		const sessionResponse = await GET(
			new Request("http://localhost/api/web-sessions/s-erp"),
			{ params: Promise.resolve({ id: "s-erp" }) },
		);
		const sessionJson = await sessionResponse.json();

		expect(sessionJson.session?.plannerPreflight?.system).toBe("ycrm");
		expect(sessionJson.session?.plannerPreflight?.intent).toBe("cross_system_request");
		expect(sessionJson.session?.erpPlannerPreflight?.system).toBe("erp");
		expect(sessionJson.session?.erpPlannerPreflight?.intent).toBe("sales_order");
		expect(sessionJson.session?.erpPlannerPreflight?.shouldRouteToErp).toBe(true);
		expect(sessionJson.session?.erpPlannerContextPack?.planner?.intent).toBe("sales_order");
		expect(sessionJson.session?.erpPlannerContextPack?.read_first).toContain("skills/erp/SKILL.md");
		expect(sessionJson.session?.plannerLearningDraft ?? null).toBeNull();
	});

	it("persists EnMS planner metadata when the request belongs to the energy domain", async () => {
		seedSession("s-enms");

		const { POST } = await import("./route.js");
		const { GET } = await import("../web-sessions/[id]/route.js");

		await POST(new Request("http://localhost/api/chat", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				sessionId: "s-enms",
				messages: [
					{
						id: "m1",
						role: "user",
						parts: [
							{
								type: "text",
								text: "請分析這週各場域的最大需量、功因異常和可能的超約風險。",
							},
						],
					},
				],
			}),
		}));

		const sessionResponse = await GET(
			new Request("http://localhost/api/web-sessions/s-enms"),
			{ params: Promise.resolve({ id: "s-enms" }) },
		);
		const sessionJson = await sessionResponse.json();

		expect(sessionJson.session?.plannerPreflight?.shouldRouteToYcrm ?? false).toBe(false);
		expect(sessionJson.session?.erpPlannerPreflight ?? null).toBeNull();
		expect(sessionJson.session?.enmsPlannerPreflight?.system).toBe("enms");
		expect(sessionJson.session?.enmsPlannerPreflight?.intent).toBe("demand_forecast");
		expect(sessionJson.session?.enmsPlannerPreflight?.shouldRouteToEnms).toBe(true);
		expect(sessionJson.session?.enmsPlannerContextPack?.planner?.intent).toBe("demand_forecast");
		expect(sessionJson.session?.enmsPlannerContextPack?.read_first).toContain("skills/enms/SKILL.md");
		expect(sessionJson.session?.enmsPlannerContextPack?.live_query_steps).toContain("join_power_account_scope");
	});
});
