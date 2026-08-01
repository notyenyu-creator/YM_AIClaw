import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const WEB_CHAT_DIR = "/virtual/webchat";
const OPENCLAW_DIR = "/virtual/openclaw";
const TEST_ENMS_CONNECTION =
	"host=enms-db.internal port=55433 dbname=EnMS user=test password=secret sslmode=disable";
const TEST_YCRM_CONNECTION =
	"dbname=default user=test password=secret host=localhost port=5432";
const TEST_ERP_CONNECTION =
	"host=118.168.188.27 port=5433 dbname=ErpUAT_local user=test password=secret sslmode=disable";
const ORIGINAL_ENV = { ...process.env };

function configureEnmsAllowlist() {
	process.env.ENMS_PG_ALLOWED_HOST = "enms-db.internal";
	process.env.ENMS_PG_ALLOWED_PORT = "55433";
	process.env.ENMS_PG_ALLOWED_DATABASE = "EnMS";
}

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

vi.mock("@/lib/workspace", () => {
	const duckdbQueryExternalPgAsync = vi.fn(async () => []);
	return {
		duckdbQueryExternalPgAsync,
		duckdbQueryExternalPgAsyncDetailed: vi.fn(async (connectionString: string, sql: string, alias?: string) => ({
			rows: await duckdbQueryExternalPgAsync(connectionString, sql, alias),
			error: null,
		})),
		resolveActiveAgentId: vi.fn(() => "main"),
		resolveAgentWorkspacePrefix: vi.fn(() => null),
		resolveOpenClawStateDir: vi.fn(() => OPENCLAW_DIR),
		resolveWorkspaceRoot: vi.fn(() => "/virtual/workspace"),
		resolveWebChatDir: vi.fn(() => WEB_CHAT_DIR),
	};
});

vi.mock("@/lib/active-runs", () => ({
	startRun: vi.fn(),
	startSubscribeRun: vi.fn(),
	hasActiveRun: vi.fn(() => false),
	getActiveRun: vi.fn(() => null),
	createSyntheticCompletedRun: vi.fn(async () => {}),
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

type DetailedQueryMock = {
	mockImplementation: (
		fn: (
			connectionString: string,
			sql: string,
			alias?: string,
		) => Promise<{ rows: Record<string, unknown>[]; error: null }>,
	) => unknown;
};

function mockEnmsDetailedQueryWithBootstrap(
	detailedQueryMock: DetailedQueryMock,
	targetRows: Record<string, unknown>[],
) {
	detailedQueryMock.mockImplementation(async (_connectionString, sql) => {
		const text = String(sql);
		if (text.includes("information_schema.columns")) {
			return {
				rows: [
					{ table_name: "DeviceDataSummaryView", column_name: "RecordTime" },
					{ table_name: "DeviceDataSummaryView", column_name: "TotalConsumption" },
					{ table_name: "ElectricityMeter", column_name: "PowerAccountId" },
					{ table_name: "PowerAccounts", column_name: "AccountId" },
					{ table_name: "sites", column_name: "site_id" },
					{ table_name: "TaipowerBills", column_name: "BillingMonth" },
				],
				error: null,
			};
		}
		if (text.includes("AS site_count") && text.includes("AS meter_count")) {
			return {
				rows: [
					{
						site_count: 2,
						gateway_count: 2,
						meter_count: 128,
						power_account_count: 2,
						demand_alert_count: 1,
						company_count: 1,
						taipower_bill_count: 12,
						price_plan_count: 1,
						price_rate_count: 4,
						latest_summary_time: "2026-06-15 01:45:00+08",
						latest_raw_time: "2026-06-15 01:45:00+08",
					},
				],
				error: null,
			};
		}
		return { rows: targetRows, error: null };
	});
}

function mockErpDetailedQueryWithBootstrap(
	detailedQueryMock: DetailedQueryMock,
	targetRows: Record<string, unknown>[],
) {
	detailedQueryMock.mockImplementation(async (_connectionString, sql) => {
		const text = String(sql);
		if (text.includes("information_schema.columns")) {
			return {
				rows: [
					{ table_name: "B_COMPANY", column_name: "company_id" },
					{ table_name: "B_SITE", column_name: "site_id" },
					{ table_name: "B_CUSTOMER", column_name: "customer_name" },
					{ table_name: "SO", column_name: "so_id" },
					{ table_name: "SO", column_name: "order_status" },
					{ table_name: "SO", column_name: "delivery_date" },
					{ table_name: "INVENTORY", column_name: "available_qty" },
				],
				error: null,
			};
		}
		if (text.includes("AS company_count") && text.includes("AS inventory_count")) {
			return {
				rows: [
					{
						company_count: 1,
						site_count: 1,
						customer_count: 42,
						so_count: 13,
						inventory_count: 4,
					},
				],
				error: null,
			};
		}
		return {
			rows: targetRows,
			error: null,
		};
	});
}

describe("Chat session planner persistence integration", () => {
	beforeEach(() => {
		fileStore.clear();
			dirStore.clear();
			dirStore.add("/");
			process.env.ENMS_PG_CONNECTION = TEST_ENMS_CONNECTION;
			configureEnmsAllowlist();
			process.env.YCRM_PG_CONNECTION = TEST_YCRM_CONNECTION;
		process.env.ERP_PG_CONNECTION = TEST_ERP_CONNECTION;
		delete process.env.OPENCLAW_ENMS_PG_CONNECTION;
		delete process.env.ENMS_POSTGRES_CONNECTION;
		delete process.env.OPENCLAW_YCRM_PG_CONNECTION;
		delete process.env.YCRM_POSTGRES_CONNECTION;
		delete process.env.OPENCLAW_ERP_PG_CONNECTION;
		delete process.env.ERP_POSTGRES_CONNECTION;
		vi.resetModules();
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
		process.env = { ...ORIGINAL_ENV };
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

	it("decorates ERP read-only requests with the unified execution plan", async () => {
		seedSession("s-erp-unified");

		const { POST } = await import("./route.js");
		const { startRun } = await import("@/lib/active-runs");
		const { duckdbQueryExternalPgAsync } = await import("@/lib/workspace");

		vi.mocked(duckdbQueryExternalPgAsync).mockImplementation(async (_conn, sql) => {
			if (String(sql).includes("information_schema.columns")) {
				return [{ table_name: "INVENTORY", column_name: "available_qty" }];
			}
			if (String(sql).includes("company_count")) {
				return [{
					company_count: 1,
					site_count: 1,
					customer_count: 2,
					so_count: 3,
					inventory_count: 4,
				}];
			}
			return [];
		});

		await POST(new Request("http://localhost/api/chat", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				sessionId: "s-erp-unified",
				messages: [
					{
						id: "m1",
						role: "user",
						parts: [
							{
								type: "text",
								text: "請幫我查 ERP 庫存狀態，並用圖表呈現。",
							},
						],
					},
				],
			}),
		}));

		expect(startRun).toHaveBeenCalledTimes(1);
		const payload = vi.mocked(startRun).mock.calls[0]?.[0];
		expect(payload?.message).toContain("[Unified Read-Only Execution Plan]");
		expect(payload?.message).toContain("pipeline.domain=erp");
	});

	it("keeps ERP write-like requests out of the unified read-only path", async () => {
		seedSession("s-erp-write");

		const { POST } = await import("./route.js");
		const { startRun } = await import("@/lib/active-runs");

		await POST(new Request("http://localhost/api/chat", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				sessionId: "s-erp-write",
				messages: [
					{
						id: "m1",
						role: "user",
						parts: [
							{
								type: "text",
								text: "請幫我更新 ERP 庫存數量，並建立一筆調整紀錄。",
							},
						],
					},
				],
			}),
		}));

		expect(startRun).toHaveBeenCalledTimes(1);
		const payload = vi.mocked(startRun).mock.calls[0]?.[0];
		expect(payload?.message).not.toContain("[Unified Read-Only Execution Plan]");
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
		expect(sessionJson.session?.enmsPlannerPreflight?.intent).toBe("site_benchmarking");
		expect(sessionJson.session?.enmsPlannerPreflight?.shouldRouteToEnms).toBe(true);
		expect(sessionJson.session?.enmsPlannerContextPack?.planner?.intent).toBe("site_benchmarking");
		expect(sessionJson.session?.enmsPlannerContextPack?.read_first).toContain("skills/enms/SKILL.md");
		expect(sessionJson.session?.enmsPlannerContextPack?.live_query_steps).toContain("join_site_gateway_company_scope");
	});

	it("keeps EnMS continuity for follow-up chart requests and emits verified report-json", async () => {
		seedSession("s-enms-chart-followup");

		const { POST } = await import("./route.js");
		const { startRun, createSyntheticCompletedRun } = await import("@/lib/active-runs");
		const { duckdbQueryExternalPgAsyncDetailed } = await import("@/lib/workspace");

		vi.mocked(duckdbQueryExternalPgAsyncDetailed).mockReset();
		mockEnmsDetailedQueryWithBootstrap(
			vi.mocked(duckdbQueryExternalPgAsyncDetailed),
			[
				{
					site_name: "大溪廠",
					meter_name: "MVCB 總電",
					circuit_seq: 1,
					peak_kw: 1386.44,
					peak_time: "2026-07-27 01:15:00+00",
				},
				{
					site_name: "(未對應場域)",
					meter_name: "Area_2_PUMP_2",
					circuit_seq: 1,
					peak_kw: 124,
					peak_time: "2026-07-13 06:15:00+00",
				},
			],
		);

		const firstQuestion =
			"請查詢最近 30 天場域最大需量排行，列出時間與來源電表。";

		await POST(new Request("http://localhost/api/chat", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				sessionId: "s-enms-chart-followup",
				messages: [
					{
						id: "m1",
						role: "user",
						parts: [
							{
								type: "text",
								text: firstQuestion,
							},
						],
					},
				],
			}),
		}));

		expect(createSyntheticCompletedRun).toHaveBeenCalledTimes(1);
		const firstAnswer =
			vi.mocked(createSyntheticCompletedRun).mock.calls[0]?.[0]?.text ?? "";
		expect(firstAnswer).toContain("最近 30 天場域最大需量排行");
		expect(firstAnswer).not.toContain("```report-json");

		vi.mocked(startRun).mockClear();
		vi.mocked(createSyntheticCompletedRun).mockClear();

		await POST(new Request("http://localhost/api/chat", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				sessionId: "s-enms-chart-followup",
				messages: [
					{
						id: "m1",
						role: "user",
						parts: [{ type: "text", text: firstQuestion }],
					},
					{
						id: "m2",
						role: "assistant",
						parts: [{ type: "text", text: firstAnswer }],
					},
					{
						id: "m3",
						role: "user",
						parts: [
							{
								type: "text",
								text: "可以幫我用圖表呈現嗎？",
							},
						],
					},
				],
			}),
		}));

		expect(startRun).not.toHaveBeenCalled();
		expect(createSyntheticCompletedRun).toHaveBeenCalledTimes(1);
		const followupAnswer =
			vi.mocked(createSyntheticCompletedRun).mock.calls[0]?.[0]?.text ?? "";
		expect(followupAnswer).toContain("```report-json");
		expect(followupAnswer).toContain("enms-site-peak-demand-ranking");
		expect(followupAnswer).toContain("大溪廠");
		expect(followupAnswer).not.toContain("Y-CRM 合約");
		expect(followupAnswer).not.toContain("請提供具體的查詢條件");
		expect(followupAnswer).not.toContain("使用者要求用圖表呈現");
	});

	it("decorates Y-CRM read-only requests with the unified execution plan but leaves write intents out", async () => {
		seedSession("s-ycrm-unified");
		fileStore.set(
			normalizePath("/virtual/workspace/skills/ycrm/reference/auto-schema-workspace_3joxkr9ofo5hlxjan164egffx.md"),
			[
				"- 掃描時間: 2026-06-16 09:00:00",
				"- 標準表: person, company, opportunity, workspaceMember",
				"### company",
				"| 欄位 | 型別 |",
				"| companyName | TEXT |",
				"| ownerId | TEXT |",
				"### person",
				"| 欄位 | 型別 |",
				"| fullName | TEXT |",
				"| companyId | TEXT |",
			].join("\n"),
		);

		const { POST } = await import("./route.js");
		const { startRun } = await import("@/lib/active-runs");

		await POST(new Request("http://localhost/api/chat", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				sessionId: "s-ycrm-unified",
				messages: [
					{
						id: "m1",
						role: "user",
						parts: [
							{
								type: "text",
								text: "請幫我整理 Y-CRM 客戶背景，並用圖表呈現。",
							},
						],
					},
				],
			}),
		}));

		const firstPayload = vi.mocked(startRun).mock.calls.at(-1)?.[0];
		expect(firstPayload?.message).toContain("[Unified Read-Only Execution Plan]");
		expect(firstPayload?.message).toContain("pipeline.domain=ycrm");

		vi.mocked(startRun).mockClear();

		await POST(new Request("http://localhost/api/chat", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				sessionId: "s-ycrm-unified",
				messages: [
					{
						id: "m2",
						role: "user",
						parts: [
							{
								type: "text",
								text: "請幫我在 Y-CRM 新增一筆跟進備註。",
							},
						],
					},
				],
			}),
		}));

		const secondPayload = vi.mocked(startRun).mock.calls.at(-1)?.[0];
		expect(secondPayload?.message).not.toContain("[Unified Read-Only Execution Plan]");
	});

	it("keeps Y-CRM product help on the original help/reference path", async () => {
		seedSession("s-ycrm-help");

		const { POST } = await import("./route.js");
		const { startRun } = await import("@/lib/active-runs");

		await POST(new Request("http://localhost/api/chat", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				sessionId: "s-ycrm-help",
				messages: [
					{
						id: "m1",
						role: "user",
						parts: [
							{
								type: "text",
								text: "Y-CRM 的 LINE 自動回覆要怎麼設定？",
							},
						],
					},
				],
			}),
		}));

		const payload = vi.mocked(startRun).mock.calls.at(-1)?.[0];
		expect(payload?.message).not.toContain("[Unified Read-Only Execution Plan]");
	});

	it("keeps Y-CRM cross-system requests out of the unified read-only path", async () => {
		seedSession("s-ycrm-cross");

		const { POST } = await import("./route.js");
		const { startRun, createSyntheticCompletedRun } = await import("@/lib/active-runs");

		await POST(new Request("http://localhost/api/chat", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				sessionId: "s-ycrm-cross",
				messages: [
					{
						id: "m1",
						role: "user",
						parts: [
							{
								type: "text",
								text: "這個客戶在 Y-CRM 裡商機很熱，但我想知道他的訂單現在到哪、庫存夠不夠、還有工單有沒有卡住。",
							},
						],
					},
				],
			}),
		}));

		const payload = vi.mocked(startRun).mock.calls.at(-1)?.[0];
		const directReply = vi.mocked(createSyntheticCompletedRun).mock.calls.at(-1)?.[0]?.text;
		expect(payload?.message ?? directReply).not.toContain("[Unified Read-Only Execution Plan]");
	});

	it("returns a blocked ERP reply without starting the generic run when source-of-truth is unavailable", async () => {
		seedSession("s-erp-blocked");

		const { POST } = await import("./route.js");
		const { startRun, createSyntheticCompletedRun } = await import("@/lib/active-runs");
		const { duckdbQueryExternalPgAsync } = await import("@/lib/workspace");

		vi.mocked(duckdbQueryExternalPgAsync).mockResolvedValue([]);

		await POST(new Request("http://localhost/api/chat", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				sessionId: "s-erp-blocked",
				messages: [
					{
						id: "m1",
						role: "user",
						parts: [
							{
								type: "text",
								text: "請幫我查 ERP 庫存狀態，並用圖表呈現。",
							},
						],
					},
				],
			}),
		}));

		expect(startRun).not.toHaveBeenCalled();
		expect(createSyntheticCompletedRun).toHaveBeenCalledTimes(1);
		expect(
			vi.mocked(createSyntheticCompletedRun).mock.calls[0]?.[0]?.text,
		).toContain("主要資料來源尚未就緒");
	});

	it("handles ERP company-count chart questions as direct DB-first replies", async () => {
		seedSession("s-erp-count");

		const { POST } = await import("./route.js");
		const { startRun, createSyntheticCompletedRun } = await import("@/lib/active-runs");
		const { duckdbQueryExternalPgAsyncDetailed, duckdbQueryExternalPgAsync } = await import("@/lib/workspace");

		vi.mocked(duckdbQueryExternalPgAsync).mockImplementation(async (_conn, sql) => {
			if (String(sql).includes("information_schema.columns")) {
				return [{ table_name: "B_CUSTOMER", column_name: "customer_id" }];
			}
			if (String(sql).includes("company_count")) {
				return [{
					company_count: 1,
					site_count: 1,
					customer_count: 42,
					so_count: 3,
					inventory_count: 4,
				}];
			}
			return [];
		});
		vi.mocked(duckdbQueryExternalPgAsyncDetailed).mockReset();
		mockErpDetailedQueryWithBootstrap(
			vi.mocked(duckdbQueryExternalPgAsyncDetailed),
			[{ total_count: 7 }],
		);

		await POST(new Request("http://localhost/api/chat", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				sessionId: "s-erp-count",
				currentSystemHint: "erp",
				messages: [
					{
						id: "m1",
						role: "user",
						parts: [
							{
								type: "text",
								text: "請用 ERP 資料幫我用圖表呈現一下目前有多少公司，不要看 Y-CRM。",
							},
						],
					},
				],
			}),
		}));

		expect(startRun).not.toHaveBeenCalled();
		expect(createSyntheticCompletedRun).toHaveBeenCalledTimes(1);
		expect(
			vi.mocked(createSyntheticCompletedRun).mock.calls[0]?.[0]?.text,
		).toContain("目前共有 7 家公司");
	});

	it("keeps explicit ERP mixed-signal prompts inside ERP and does not persist EnMS planner state", async () => {
		seedSession("s-erp-mixed-signal");

		const { POST } = await import("./route.js");
		const { GET } = await import("../web-sessions/[id]/route.js");
		const { startRun, createSyntheticCompletedRun } = await import("@/lib/active-runs");
		const { duckdbQueryExternalPgAsyncDetailed, duckdbQueryExternalPgAsync } = await import("@/lib/workspace");

		vi.mocked(duckdbQueryExternalPgAsync).mockImplementation(async (_conn, sql) => {
			if (String(sql).includes("information_schema.columns")) {
				return [{ table_name: "B_CUSTOMER", column_name: "customer_id" }];
			}
			if (String(sql).includes("company_count")) {
				return [{
					company_count: 1,
					site_count: 1,
					customer_count: 42,
					so_count: 3,
					inventory_count: 4,
				}];
			}
			return [];
		});
		vi.mocked(duckdbQueryExternalPgAsyncDetailed).mockReset();
		mockErpDetailedQueryWithBootstrap(
			vi.mocked(duckdbQueryExternalPgAsyncDetailed),
			[{ total_count: 7 }],
		);

		await POST(new Request("http://localhost/api/chat", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				sessionId: "s-erp-mixed-signal",
				currentSystemHint: "erp",
				messages: [
					{
						id: "m1",
						role: "user",
						parts: [
							{
								type: "text",
								text: "請只看 ERP，不要看 EnMS。ERP 目前有多少公司？先不要分析耗電異常或場域電表。",
							},
						],
					},
				],
			}),
		}));

		expect(startRun).not.toHaveBeenCalled();
		expect(createSyntheticCompletedRun).toHaveBeenCalledTimes(1);
		expect(
			vi.mocked(createSyntheticCompletedRun).mock.calls[0]?.[0]?.text,
		).toContain("目前共有 7 家公司");

		const sessionResponse = await GET(
			new Request("http://localhost/api/web-sessions/s-erp-mixed-signal"),
			{ params: Promise.resolve({ id: "s-erp-mixed-signal" }) },
		);
		const sessionJson = await sessionResponse.json();

		expect(sessionJson.session?.erpPlannerPreflight?.system).toBe("erp");
		expect(sessionJson.session?.erpPlannerPreflight?.shouldRouteToErp).toBe(true);
		expect(sessionJson.session?.enmsPlannerPreflight ?? null).toBeNull();
		expect(sessionJson.session?.plannerPreflight ?? null).toBeNull();
		expect(sessionJson.session?.plannerContextPack ?? null).toBeNull();
	});

	it("lets an explicit ERP tab switch override prior Y-CRM follow-up scope reuse", async () => {
		seedSession("s-followup-override");

		const { POST } = await import("./route.js");
		const { GET } = await import("../web-sessions/[id]/route.js");
		const { startRun, createSyntheticCompletedRun } = await import("@/lib/active-runs");
		const { duckdbQueryExternalPgAsyncDetailed, duckdbQueryExternalPgAsync } = await import("@/lib/workspace");

		await POST(new Request("http://localhost/api/chat", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				sessionId: "s-followup-override",
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

		vi.mocked(duckdbQueryExternalPgAsync).mockImplementation(async (_conn, sql) => {
			if (String(sql).includes("information_schema.columns")) {
				return [{ table_name: "B_CUSTOMER", column_name: "customer_id" }];
			}
			if (String(sql).includes("company_count")) {
				return [{
					company_count: 1,
					site_count: 1,
					customer_count: 42,
					so_count: 3,
					inventory_count: 4,
				}];
			}
			return [];
		});
		vi.mocked(duckdbQueryExternalPgAsyncDetailed).mockReset();
		mockErpDetailedQueryWithBootstrap(
			vi.mocked(duckdbQueryExternalPgAsyncDetailed),
			[{ total_count: 7 }],
		);
		vi.mocked(startRun).mockClear();
		vi.mocked(createSyntheticCompletedRun).mockClear();

		await POST(new Request("http://localhost/api/chat", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				sessionId: "s-followup-override",
				currentSystemHint: "erp",
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
								text: "目前有多少公司？請用圖表呈現，只看 ERP。",
							},
						],
					},
				],
			}),
		}));

		expect(startRun).not.toHaveBeenCalled();
		expect(createSyntheticCompletedRun).toHaveBeenCalledTimes(1);
		expect(
			vi.mocked(createSyntheticCompletedRun).mock.calls[0]?.[0]?.text,
		).toContain("目前共有 7 家公司");

		const sessionResponse = await GET(
			new Request("http://localhost/api/web-sessions/s-followup-override"),
			{ params: Promise.resolve({ id: "s-followup-override" }) },
		);
		const sessionJson = await sessionResponse.json();

		expect(sessionJson.session?.erpPlannerPreflight?.system).toBe("erp");
		expect(sessionJson.session?.erpPlannerPreflight?.shouldRouteToErp).toBe(true);
		expect(sessionJson.session?.plannerPreflight ?? null).toBeNull();
		expect(sessionJson.session?.plannerContextPack ?? null).toBeNull();
	});

	it("keeps explicit EnMS mixed-signal prompts inside EnMS and does not persist Y-CRM planner state", async () => {
		seedSession("s-enms-mixed-signal");

		const { POST } = await import("./route.js");
		const { GET } = await import("../web-sessions/[id]/route.js");
		const { startRun, createSyntheticCompletedRun } = await import("@/lib/active-runs");
		const { duckdbQueryExternalPgAsyncDetailed } = await import("@/lib/workspace");

		vi.mocked(duckdbQueryExternalPgAsyncDetailed).mockReset();
		mockEnmsDetailedQueryWithBootstrap(
			vi.mocked(duckdbQueryExternalPgAsyncDetailed),
			[{ total_count: 128 }],
		);

		await POST(new Request("http://localhost/api/chat", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				sessionId: "s-enms-mixed-signal",
				currentSystemHint: "enms",
				messages: [
					{
						id: "m1",
						role: "user",
						parts: [
							{
								type: "text",
								text: "請只看 EnMS，不要看 ERP 或 Y-CRM。請用圖表呈現目前有多少電表，先不要整理客戶或公司背景。",
							},
						],
					},
				],
			}),
		}));

		expect(startRun).not.toHaveBeenCalled();
		expect(createSyntheticCompletedRun).toHaveBeenCalledTimes(1);
		expect(
			vi.mocked(createSyntheticCompletedRun).mock.calls[0]?.[0]?.text,
		).toContain("目前共有 128 個電表");

		const sessionResponse = await GET(
			new Request("http://localhost/api/web-sessions/s-enms-mixed-signal"),
			{ params: Promise.resolve({ id: "s-enms-mixed-signal" }) },
		);
		const sessionJson = await sessionResponse.json();

		expect(sessionJson.session?.enmsPlannerPreflight?.system).toBe("enms");
		expect(sessionJson.session?.enmsPlannerPreflight?.shouldRouteToEnms).toBe(true);
		expect(sessionJson.session?.plannerPreflight ?? null).toBeNull();
		expect(sessionJson.session?.plannerContextPack ?? null).toBeNull();
	});

	it("handles ERP single sales-order summary questions as direct DB-first replies", async () => {
		seedSession("s-erp-so-summary");

		const { POST } = await import("./route.js");
		const { startRun, createSyntheticCompletedRun } = await import("@/lib/active-runs");
		const { duckdbQueryExternalPgAsyncDetailed, duckdbQueryExternalPgAsync } = await import("@/lib/workspace");

		vi.mocked(duckdbQueryExternalPgAsync).mockImplementation(async (_conn, sql) => {
			if (String(sql).includes("information_schema.columns")) {
				return [{ table_name: "SO", column_name: "so_id" }];
			}
			if (String(sql).includes("so_count")) {
				return [{
					company_count: 1,
					site_count: 1,
					customer_count: 42,
					so_count: 13,
					inventory_count: 4,
				}];
			}
			return [];
		});
		vi.mocked(duckdbQueryExternalPgAsyncDetailed).mockReset();
		mockErpDetailedQueryWithBootstrap(
			vi.mocked(duckdbQueryExternalPgAsyncDetailed),
			[
				{
					company_id: "C01",
					site_id: "S01",
					so_id: "SO20260101",
					customer_id: "CU001",
					customer_name: "OOCHAIN",
					so_date: "2026-01-01",
					so_delivery_date: "2026-01-15",
					subtotal_amt: 1000,
					tax_amt: 50,
					freight_amt: 20,
					total_amt: 1070,
					order_status: "10",
					picking_status: "READY",
					shipping_status: "PARTIAL",
					invoice_status: "PENDING",
					line_count: 3,
					ordered_qty: 120,
					picked_qty: 80,
					shipped_qty: 60,
					returned_qty: 0,
					remaining_qty: 60,
					shipment_progress_bucket: "PARTIALLY_SHIPPED",
				},
			],
		);

		await POST(new Request("http://localhost/api/chat", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				sessionId: "s-erp-so-summary",
				currentSystemHint: "erp",
				messages: [
					{
						id: "m1",
						role: "user",
						parts: [
							{
								type: "text",
								text: "請摘要 SO20260101 的訂單狀態、總金額、訂購/已揀/已出/未出數量。",
							},
						],
					},
				],
			}),
		}));

		expect(startRun).not.toHaveBeenCalled();
		expect(createSyntheticCompletedRun).toHaveBeenCalledTimes(1);
		expect(
			vi.mocked(createSyntheticCompletedRun).mock.calls[0]?.[0]?.text,
		).toContain("訂單 SO20260101 的摘要如下");
	});

	it("handles ERP available-inventory ranking questions as direct DB-first replies", async () => {
		seedSession("s-erp-inventory-ranking");

		const { POST } = await import("./route.js");
		const { startRun, createSyntheticCompletedRun } = await import("@/lib/active-runs");
		const { duckdbQueryExternalPgAsyncDetailed, duckdbQueryExternalPgAsync } = await import("@/lib/workspace");

		vi.mocked(duckdbQueryExternalPgAsync).mockImplementation(async (_conn, sql) => {
			if (String(sql).includes("information_schema.columns")) {
				return [{ table_name: "INVENTORY", column_name: "available_qty" }];
			}
			if (String(sql).includes("inventory_count")) {
				return [{
					company_count: 1,
					site_count: 1,
					customer_count: 42,
					so_count: 3,
					inventory_count: 4,
				}];
			}
			return [];
		});
		vi.mocked(duckdbQueryExternalPgAsyncDetailed).mockReset();
		mockErpDetailedQueryWithBootstrap(
			vi.mocked(duckdbQueryExternalPgAsyncDetailed),
			[
				{
					item_name: "A100 測試品",
					available_qty: 150,
					on_hand_qty: 160,
					reserved_qty: 10,
				},
				{
					item_name: "B200 第二品",
					available_qty: 90,
					on_hand_qty: 95,
					reserved_qty: 5,
				},
			],
		);

		await POST(new Request("http://localhost/api/chat", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				sessionId: "s-erp-inventory-ranking",
				currentSystemHint: "erp",
				messages: [
					{
						id: "m1",
						role: "user",
						parts: [
							{
								type: "text",
								text: "ERP 目前可用庫存最多的前 10 個商品是哪些？請用圖表呈現。",
							},
						],
					},
				],
			}),
		}));

		expect(startRun).not.toHaveBeenCalled();
		expect(createSyntheticCompletedRun).toHaveBeenCalledTimes(1);
		expect(
			vi.mocked(createSyntheticCompletedRun).mock.calls[0]?.[0]?.text,
		).toContain("可用庫存最高的前 10 個商品");
	});

	it("handles ERP customer-order ranking questions as direct DB-first replies", async () => {
		seedSession("s-erp-customer-ranking");

		const { POST } = await import("./route.js");
		const { startRun, createSyntheticCompletedRun } = await import("@/lib/active-runs");
		const { duckdbQueryExternalPgAsyncDetailed, duckdbQueryExternalPgAsync } = await import("@/lib/workspace");

		vi.mocked(duckdbQueryExternalPgAsync).mockImplementation(async (_conn, sql) => {
			if (String(sql).includes("information_schema.columns")) {
				return [{ table_name: "B_CUSTOMER", column_name: "customer_name" }];
			}
			if (String(sql).includes("so_count")) {
				return [{
					company_count: 1,
					site_count: 1,
					customer_count: 42,
					so_count: 13,
					inventory_count: 4,
				}];
			}
			return [];
		});
		vi.mocked(duckdbQueryExternalPgAsyncDetailed).mockReset();
		mockErpDetailedQueryWithBootstrap(
			vi.mocked(duckdbQueryExternalPgAsyncDetailed),
			[
				{ customer_name: "OOCHAIN", order_count: 8, total_amt: 15230 },
				{ customer_name: "MAODING", order_count: 5, total_amt: 9200 },
			],
		);

		await POST(new Request("http://localhost/api/chat", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				sessionId: "s-erp-customer-ranking",
				currentSystemHint: "erp",
				messages: [
					{
						id: "m1",
						role: "user",
						parts: [
							{
								type: "text",
								text: "請只看 ERP，不要看 Y-CRM。ERP 訂單最多的前 10 個客戶是哪些？請用圖表呈現。",
							},
						],
					},
				],
			}),
		}));

		expect(startRun).not.toHaveBeenCalled();
		expect(createSyntheticCompletedRun).toHaveBeenCalledTimes(1);
		expect(
			vi.mocked(createSyntheticCompletedRun).mock.calls[0]?.[0]?.text,
		).toContain("OOCHAIN：8 筆訂單");
	});

	it("handles ERP order-status distribution questions as direct DB-first replies", async () => {
		seedSession("s-erp-order-status");

		const { POST } = await import("./route.js");
		const { startRun, createSyntheticCompletedRun } = await import("@/lib/active-runs");
		const { duckdbQueryExternalPgAsyncDetailed, duckdbQueryExternalPgAsync } = await import("@/lib/workspace");

		vi.mocked(duckdbQueryExternalPgAsync).mockImplementation(async (_conn, sql) => {
			if (String(sql).includes("information_schema.columns")) {
				return [{ table_name: "SO", column_name: "order_status" }];
			}
			if (String(sql).includes("so_count")) {
				return [{
					company_count: 1,
					site_count: 1,
					customer_count: 42,
					so_count: 13,
					inventory_count: 4,
				}];
			}
			return [];
		});
		vi.mocked(duckdbQueryExternalPgAsyncDetailed).mockReset();
		mockErpDetailedQueryWithBootstrap(
			vi.mocked(duckdbQueryExternalPgAsyncDetailed),
			[
				{ status_code: "10", total_count: 8 },
				{ status_code: "20", total_count: 5 },
			],
		);

		await POST(new Request("http://localhost/api/chat", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				sessionId: "s-erp-order-status",
				currentSystemHint: "erp",
				messages: [
					{
						id: "m1",
						role: "user",
						parts: [
							{
								type: "text",
								text: "請幫我用圖表呈現 ERP 訂單狀態分布。",
							},
						],
					},
				],
			}),
		}));

		expect(startRun).not.toHaveBeenCalled();
		expect(createSyntheticCompletedRun).toHaveBeenCalledTimes(1);
		expect(
			vi.mocked(createSyntheticCompletedRun).mock.calls[0]?.[0]?.text,
		).toContain("10：8 筆");
	});

	it("handles ERP overdue-summary questions as direct DB-first replies", async () => {
		seedSession("s-erp-overdue");

		const { POST } = await import("./route.js");
		const { startRun, createSyntheticCompletedRun } = await import("@/lib/active-runs");
		const { duckdbQueryExternalPgAsyncDetailed, duckdbQueryExternalPgAsync } = await import("@/lib/workspace");

		vi.mocked(duckdbQueryExternalPgAsync).mockImplementation(async (_conn, sql) => {
			if (String(sql).includes("information_schema.columns")) {
				return [{ table_name: "SO", column_name: "delivery_date" }];
			}
			if (String(sql).includes("so_count")) {
				return [{
					company_count: 1,
					site_count: 1,
					customer_count: 42,
					so_count: 13,
					inventory_count: 4,
				}];
			}
			return [];
		});
		vi.mocked(duckdbQueryExternalPgAsyncDetailed).mockReset();
		mockErpDetailedQueryWithBootstrap(
			vi.mocked(duckdbQueryExternalPgAsyncDetailed),
			[
				{ due_status: "已逾期", total_count: 6 },
				{ due_status: "未逾期", total_count: 9 },
			],
		);

		await POST(new Request("http://localhost/api/chat", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				sessionId: "s-erp-overdue",
				currentSystemHint: "erp",
				messages: [
					{
						id: "m1",
						role: "user",
						parts: [
							{
								type: "text",
								text: "請幫我用圖表呈現 ERP 訂單交期逾期概況。",
							},
						],
					},
				],
			}),
		}));

		expect(startRun).not.toHaveBeenCalled();
		expect(createSyntheticCompletedRun).toHaveBeenCalledTimes(1);
		expect(
			vi.mocked(createSyntheticCompletedRun).mock.calls[0]?.[0]?.text,
		).toContain("已逾期：6 筆");
	});

	it("handles ERP overdue-unshipped exception questions as direct DB-first replies", async () => {
		seedSession("s-erp-overdue-list");

		const { POST } = await import("./route.js");
		const { startRun, createSyntheticCompletedRun } = await import("@/lib/active-runs");
		const { duckdbQueryExternalPgAsyncDetailed, duckdbQueryExternalPgAsync } = await import("@/lib/workspace");

		vi.mocked(duckdbQueryExternalPgAsync).mockImplementation(async (_conn, sql) => {
			if (String(sql).includes("information_schema.columns")) {
				return [{ table_name: "SO", column_name: "delivery_date" }];
			}
			if (String(sql).includes("so_count")) {
				return [{
					company_count: 1,
					site_count: 1,
					customer_count: 42,
					so_count: 13,
					inventory_count: 4,
				}];
			}
			return [];
		});
		vi.mocked(duckdbQueryExternalPgAsyncDetailed).mockReset();
		mockErpDetailedQueryWithBootstrap(
			vi.mocked(duckdbQueryExternalPgAsyncDetailed),
			[
				{
					company_id: "C01",
					site_id: "S01",
					so_id: "SO20260109",
					customer_name: "OOCHAIN",
					delivery_date: "2026-01-15",
					shipping_status: "PARTIAL",
					order_status: "20",
					total_amt: 1200,
					ordered_qty: 100,
					shipped_qty: 40,
					remaining_qty: 60,
					days_overdue: 7,
				},
			],
		);

		await POST(new Request("http://localhost/api/chat", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				sessionId: "s-erp-overdue-list",
				currentSystemHint: "erp",
				messages: [
					{
						id: "m1",
						role: "user",
						parts: [
							{
								type: "text",
								text: "ERP 現在有哪些訂單已過交期還沒出貨？請列前 10 筆。",
							},
						],
					},
				],
			}),
		}));

		expect(startRun).not.toHaveBeenCalled();
		expect(createSyntheticCompletedRun).toHaveBeenCalledTimes(1);
		expect(
			vi.mocked(createSyntheticCompletedRun).mock.calls[0]?.[0]?.text,
		).toContain("SO20260109 / OOCHAIN：逾期 7 天，待出 60");
	});

	it("handles ERP picking-status distribution questions as direct DB-first replies", async () => {
		seedSession("s-erp-picking-status");

		const { POST } = await import("./route.js");
		const { startRun, createSyntheticCompletedRun } = await import("@/lib/active-runs");
		const { duckdbQueryExternalPgAsyncDetailed, duckdbQueryExternalPgAsync } = await import("@/lib/workspace");

		vi.mocked(duckdbQueryExternalPgAsync).mockImplementation(async (_conn, sql) => {
			if (String(sql).includes("information_schema.columns")) {
				return [{ table_name: "SO", column_name: "picking_status" }];
			}
			if (String(sql).includes("so_count")) {
				return [{
					company_count: 1,
					site_count: 1,
					customer_count: 42,
					so_count: 13,
					inventory_count: 4,
				}];
			}
			return [];
		});
		vi.mocked(duckdbQueryExternalPgAsyncDetailed).mockReset();
		mockErpDetailedQueryWithBootstrap(
			vi.mocked(duckdbQueryExternalPgAsyncDetailed),
			[
				{ status_code: "READY", total_count: 5 },
				{ status_code: "PICKED", total_count: 3 },
			],
		);

		await POST(new Request("http://localhost/api/chat", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				sessionId: "s-erp-picking-status",
				currentSystemHint: "erp",
				messages: [
					{
						id: "m1",
						role: "user",
						parts: [
							{
								type: "text",
								text: "請幫我用圖表呈現 ERP 揀貨狀態分布。",
							},
						],
					},
				],
			}),
		}));

		expect(startRun).not.toHaveBeenCalled();
		expect(createSyntheticCompletedRun).toHaveBeenCalledTimes(1);
		expect(
			vi.mocked(createSyntheticCompletedRun).mock.calls[0]?.[0]?.text,
		).toContain("READY：5 筆");
	});

	it("handles ERP invoice-status distribution questions as direct DB-first replies", async () => {
		seedSession("s-erp-invoice-status");

		const { POST } = await import("./route.js");
		const { startRun, createSyntheticCompletedRun } = await import("@/lib/active-runs");
		const { duckdbQueryExternalPgAsyncDetailed, duckdbQueryExternalPgAsync } = await import("@/lib/workspace");

		vi.mocked(duckdbQueryExternalPgAsync).mockImplementation(async (_conn, sql) => {
			if (String(sql).includes("information_schema.columns")) {
				return [{ table_name: "SO", column_name: "invoice_status" }];
			}
			if (String(sql).includes("so_count")) {
				return [{
					company_count: 1,
					site_count: 1,
					customer_count: 42,
					so_count: 13,
					inventory_count: 4,
				}];
			}
			return [];
		});
		vi.mocked(duckdbQueryExternalPgAsyncDetailed).mockReset();
		mockErpDetailedQueryWithBootstrap(
			vi.mocked(duckdbQueryExternalPgAsyncDetailed),
			[
				{ status_code: "PENDING", total_count: 4 },
				{ status_code: "ISSUED", total_count: 2 },
			],
		);

		await POST(new Request("http://localhost/api/chat", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				sessionId: "s-erp-invoice-status",
				currentSystemHint: "erp",
				messages: [
					{
						id: "m1",
						role: "user",
						parts: [
							{
								type: "text",
								text: "請幫我用圖表呈現 ERP 開票狀態分布。",
							},
						],
					},
				],
			}),
		}));

		expect(startRun).not.toHaveBeenCalled();
		expect(createSyntheticCompletedRun).toHaveBeenCalledTimes(1);
		expect(
			vi.mocked(createSyntheticCompletedRun).mock.calls[0]?.[0]?.text,
		).toContain("PENDING：4 筆");
	});

	it("returns a blocked Y-CRM reply without starting the generic run when auto-schema is missing", async () => {
		seedSession("s-ycrm-blocked");

		const { POST } = await import("./route.js");
		const { startRun, createSyntheticCompletedRun } = await import("@/lib/active-runs");

		await POST(new Request("http://localhost/api/chat", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				sessionId: "s-ycrm-blocked",
				messages: [
					{
						id: "m1",
						role: "user",
						parts: [
							{
								type: "text",
								text: "幫我整理 HOPET 工作區裡最近一週的新商機。",
							},
						],
					},
				],
			}),
		}));

		expect(startRun).not.toHaveBeenCalled();
		expect(createSyntheticCompletedRun).toHaveBeenCalledTimes(1);
		expect(
			vi.mocked(createSyntheticCompletedRun).mock.calls[0]?.[0]?.text,
		).toMatch(/auto-schema|主要資料來源尚未就緒/);
	});

	it("handles Y-CRM customer-count chart questions as direct DB-first replies", async () => {
		seedSession("s-ycrm-count");
		fileStore.set(
			normalizePath("/virtual/workspace/skills/ycrm/reference/auto-schema-workspace_3joxkr9ofo5hlxjan164egffx.md"),
			[
				"- 掃描時間: 2026-06-16 09:00:00",
				"- 標準表: person, company, opportunity, workspaceMember",
				"### company",
				"| 欄位 | 型別 |",
				"| name | TEXT |",
				"| deletedAt | TIMESTAMP |",
			].join("\n"),
		);

		const { POST } = await import("./route.js");
		const { startRun, createSyntheticCompletedRun } = await import("@/lib/active-runs");
		const { duckdbQueryExternalPgAsyncDetailed } = await import("@/lib/workspace");

		vi.mocked(duckdbQueryExternalPgAsyncDetailed).mockReset();
		vi.mocked(duckdbQueryExternalPgAsyncDetailed).mockResolvedValueOnce({
			rows: [{ total_count: 23 }],
			error: null,
		});

		await POST(new Request("http://localhost/api/chat", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				sessionId: "s-ycrm-count",
				currentSystemHint: "ycrm",
				messages: [
					{
						id: "m1",
						role: "user",
						parts: [
							{
								type: "text",
								text: "請用 Y-CRM 資料幫我用圖表呈現一下目前有多少客戶，不要看 ERP。",
							},
						],
					},
				],
			}),
		}));

		expect(startRun).not.toHaveBeenCalled();
		expect(createSyntheticCompletedRun).toHaveBeenCalledTimes(1);
		expect(
			vi.mocked(createSyntheticCompletedRun).mock.calls[0]?.[0]?.text,
		).toContain("目前共有 23 家客戶公司");
	});

	it("handles Y-CRM opportunity-amount trend questions as direct DB-first replies", async () => {
		seedSession("s-ycrm-opp-amount");
		fileStore.set(
			normalizePath("/virtual/workspace/skills/ycrm/reference/auto-schema-workspace_3joxkr9ofo5hlxjan164egffx.md"),
			[
				"- 掃描時間: 2026-06-16 09:00:00",
				"- 標準表: person, company, opportunity, workspaceMember, task",
				"### opportunity",
				"| 欄位 | 型別 |",
				"| createdAt | TIMESTAMP |",
				"| amountAmountMicros | NUMERIC |",
				"| deletedAt | TIMESTAMP |",
			].join("\n"),
		);

		const { POST } = await import("./route.js");
		const { startRun, createSyntheticCompletedRun } = await import("@/lib/active-runs");
		const { duckdbQueryExternalPgAsyncDetailed } = await import("@/lib/workspace");

		vi.mocked(duckdbQueryExternalPgAsyncDetailed).mockReset();
		vi.mocked(duckdbQueryExternalPgAsyncDetailed).mockResolvedValueOnce({
			rows: [
				{ month: "2026-01", currency: "TWD", total_amount: 120.5 },
				{ month: "2026-02", currency: "TWD", total_amount: 88 },
				{ month: "2026-02", currency: "USD", total_amount: 25 },
			],
			error: null,
		});

		await POST(new Request("http://localhost/api/chat", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				sessionId: "s-ycrm-opp-amount",
				currentSystemHint: "ycrm",
				messages: [
					{
						id: "m1",
						role: "user",
						parts: [
							{
								type: "text",
								text: "請用 Y-CRM 工作區資料幫我做最近 12 個月的商機金額趨勢圖表。",
							},
						],
					},
				],
			}),
		}));

		expect(startRun).not.toHaveBeenCalled();
		expect(createSyntheticCompletedRun).toHaveBeenCalledTimes(1);
		expect(
			vi.mocked(createSyntheticCompletedRun).mock.calls[0]?.[0]?.text,
		).toContain("TWD：最近一個月份 2026-02 的新增商機總金額為 88 TWD");
	});

	it("handles Y-CRM explicit date-range opportunity-amount trend questions as direct DB-first replies", async () => {
		seedSession("s-ycrm-opp-amount-range");
		fileStore.set(
			normalizePath("/virtual/workspace/skills/ycrm/reference/auto-schema-workspace_3joxkr9ofo5hlxjan164egffx.md"),
			[
				"- 掃描時間: 2026-06-16 09:00:00",
				"- 標準表: person, company, opportunity, workspaceMember, task",
				"### opportunity",
				"| 欄位 | 型別 |",
				"| createdAt | TIMESTAMP |",
				"| amountAmountMicros | NUMERIC |",
				"| amountCurrencyCode | TEXT |",
				"| deletedAt | TIMESTAMP |",
			].join("\n"),
		);

		const { POST } = await import("./route.js");
		const { startRun, createSyntheticCompletedRun } = await import("@/lib/active-runs");
		const { duckdbQueryExternalPgAsyncDetailed } = await import("@/lib/workspace");

		vi.mocked(duckdbQueryExternalPgAsyncDetailed).mockReset();
		vi.mocked(duckdbQueryExternalPgAsyncDetailed).mockResolvedValueOnce({
			rows: [
				{ month: "2026-01-01", currency: "TWD", total_amount: 120.5 },
				{ month: "2026-01-02", currency: "TWD", total_amount: 88 },
			],
			error: null,
		});

		await POST(new Request("http://localhost/api/chat", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				sessionId: "s-ycrm-opp-amount-range",
				currentSystemHint: "ycrm",
				messages: [
					{
						id: "m1",
						role: "user",
						parts: [
							{
								type: "text",
								text: "請用 Y-CRM 工作區資料幫我做 2026-01-01 到 2026-01-02 的商機金額趨勢圖表。",
							},
						],
					},
				],
			}),
		}));

		expect(startRun).not.toHaveBeenCalled();
		expect(createSyntheticCompletedRun).toHaveBeenCalledTimes(1);
		expect(
			vi.mocked(createSyntheticCompletedRun).mock.calls[0]?.[0]?.text,
		).toContain("2026-01-01 到 2026-01-02 商機金額趨勢已整理完成");
	});

	it("handles Y-CRM no-data opportunity-amount trend questions as direct DB-first replies with explicit fallback guidance", async () => {
		seedSession("s-ycrm-opp-amount-no-data");
		fileStore.set(
			normalizePath("/virtual/workspace/skills/ycrm/reference/auto-schema-workspace_3joxkr9ofo5hlxjan164egffx.md"),
			[
				"- 掃描時間: 2026-06-16 09:00:00",
				"- 標準表: person, company, opportunity, workspaceMember, task",
				"### opportunity",
				"| 欄位 | 型別 |",
				"| createdAt | TIMESTAMP |",
				"| amountAmountMicros | NUMERIC |",
				"| amountCurrencyCode | TEXT |",
				"| deletedAt | TIMESTAMP |",
			].join("\n"),
		);

		const { POST } = await import("./route.js");
		const { startRun, createSyntheticCompletedRun } = await import("@/lib/active-runs");
		const { duckdbQueryExternalPgAsyncDetailed } = await import("@/lib/workspace");

		vi.mocked(duckdbQueryExternalPgAsyncDetailed).mockReset();
		vi.mocked(duckdbQueryExternalPgAsyncDetailed)
			.mockResolvedValueOnce({
				rows: [],
				error: null,
			})
			.mockResolvedValueOnce({
				rows: [
					{
						requested_window_start: "2026-06-16",
						requested_window_end: "2026-06-23",
						earliest_created_at: "2026-05-01 09:00:00+08",
						latest_created_at: "2026-06-15 18:30:00+08",
						fallback_window_start: "2026-06-08",
						fallback_window_end: "2026-06-15",
						rows_in_requested_window: 0,
					},
				],
				error: null,
			});

		await POST(new Request("http://localhost/api/chat", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				sessionId: "s-ycrm-opp-amount-no-data",
				currentSystemHint: "ycrm",
				messages: [
					{
						id: "m1",
						role: "user",
						parts: [
							{
								type: "text",
								text: "請用 Y-CRM 工作區資料幫我做最近 7 天的商機金額趨勢圖表。",
							},
						],
					},
				],
			}),
		}));

		expect(startRun).not.toHaveBeenCalled();
		expect(createSyntheticCompletedRun).toHaveBeenCalledTimes(1);
		const text = vi.mocked(createSyntheticCompletedRun).mock.calls[0]?.[0]?.text ?? "";
		expect(text).toContain("最近 7 天商機金額趨勢查詢");
		expect(text).toContain("實際查詢區間：2026-06-16 至 2026-06-23");
		expect(text).toContain("目前工作區 workspace_3joxkr9ofo5hlxjan164egffx 的 opportunity.createdAt 可見資料時間帶為 2026-05-01 09:00:00+08 至 2026-06-15 18:30:00+08");
		expect(text).toContain("因此我不會輸出空圖表，也不會直接把答案改成其他區間");
		expect(text).toContain("請查 2026-06-08 到 2026-06-15 的商機金額趨勢圖表");
		expect(text).not.toContain("```report-json");
	});

	it("handles Y-CRM opportunity stage-amount chart questions as direct DB-first replies", async () => {
		seedSession("s-ycrm-stage-amount");
		fileStore.set(
			normalizePath("/virtual/workspace/skills/ycrm/reference/auto-schema-workspace_3joxkr9ofo5hlxjan164egffx.md"),
			[
				"- 掃描時間: 2026-06-16 09:00:00",
				"- 標準表: person, company, opportunity, workspaceMember, task",
				"### opportunity",
				"| 欄位 | 型別 |",
				"| stage | TEXT |",
				"| amountAmountMicros | NUMERIC |",
				"| amountCurrencyCode | TEXT |",
				"| deletedAt | TIMESTAMP |",
			].join("\n"),
		);

		const { POST } = await import("./route.js");
		const { startRun, createSyntheticCompletedRun } = await import("@/lib/active-runs");
		const { duckdbQueryExternalPgAsyncDetailed } = await import("@/lib/workspace");

		vi.mocked(duckdbQueryExternalPgAsyncDetailed).mockReset();
		vi.mocked(duckdbQueryExternalPgAsyncDetailed).mockResolvedValueOnce({
			rows: [
				{ stage: "OPT0_XU_QIU_QUE_REN", currency: "TWD", total_amount: 250.5 },
				{ stage: "OPT2_YI_BAO_JIA", currency: "USD", total_amount: 88 },
			],
			error: null,
		});

		await POST(new Request("http://localhost/api/chat", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				sessionId: "s-ycrm-stage-amount",
				currentSystemHint: "ycrm",
				messages: [
					{
						id: "m1",
						role: "user",
						parts: [
							{
								type: "text",
								text: "請用 Y-CRM 工作區資料幫我做各階段商機金額分布圖表。",
							},
						],
					},
				],
			}),
		}));

		expect(startRun).not.toHaveBeenCalled();
		expect(createSyntheticCompletedRun).toHaveBeenCalledTimes(1);
		expect(
			vi.mocked(createSyntheticCompletedRun).mock.calls[0]?.[0]?.text,
		).toContain("需求確認（TWD）：250.5 TWD");
	});

	it("handles Y-CRM overview chart questions as direct DB-first replies", async () => {
		seedSession("s-ycrm-overview");
		fileStore.set(
			normalizePath("/virtual/workspace/skills/ycrm/reference/auto-schema-workspace_3joxkr9ofo5hlxjan164egffx.md"),
			[
				"- 掃描時間: 2026-06-16 09:00:00",
				"- 標準表: person, company, opportunity, workspaceMember, task",
				"### company",
				"| 欄位 | 型別 |",
				"| name | TEXT |",
				"| deletedAt | TIMESTAMP |",
			].join("\n"),
		);

		const { POST } = await import("./route.js");
		const { startRun, createSyntheticCompletedRun } = await import("@/lib/active-runs");
		const { duckdbQueryExternalPgAsyncDetailed } = await import("@/lib/workspace");

		vi.mocked(duckdbQueryExternalPgAsyncDetailed).mockReset();
		vi.mocked(duckdbQueryExternalPgAsyncDetailed).mockResolvedValueOnce({
			rows: [
				{ category: "聯絡人", count: 120 },
				{ category: "公司", count: 23 },
				{ category: "商機", count: 14 },
				{ category: "任務", count: 31 },
			],
			error: null,
		});

		await POST(new Request("http://localhost/api/chat", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				sessionId: "s-ycrm-overview",
				currentSystemHint: "ycrm",
				messages: [
					{
						id: "m1",
						role: "user",
						parts: [
							{
								type: "text",
								text: "請用 Y-CRM 工作區資料幫我做一個聯絡人、客戶公司、商機、任務的總覽圖表。",
							},
						],
					},
				],
			}),
		}));

		expect(startRun).not.toHaveBeenCalled();
		expect(createSyntheticCompletedRun).toHaveBeenCalledTimes(1);
		expect(
			vi.mocked(createSyntheticCompletedRun).mock.calls[0]?.[0]?.text,
		).toContain("聯絡人 120 位");
	});

	it("handles Y-CRM opportunity-stage chart questions as direct DB-first replies", async () => {
		seedSession("s-ycrm-stage");
		fileStore.set(
			normalizePath("/virtual/workspace/skills/ycrm/reference/auto-schema-workspace_3joxkr9ofo5hlxjan164egffx.md"),
			[
				"- 掃描時間: 2026-06-16 09:00:00",
				"- 標準表: person, company, opportunity, workspaceMember, task",
				"### opportunity",
				"| 欄位 | 型別 |",
				"| stage | TEXT |",
				"| deletedAt | TIMESTAMP |",
			].join("\n"),
		);

		const { POST } = await import("./route.js");
		const { startRun, createSyntheticCompletedRun } = await import("@/lib/active-runs");
		const { duckdbQueryExternalPgAsyncDetailed } = await import("@/lib/workspace");

		vi.mocked(duckdbQueryExternalPgAsyncDetailed).mockReset();
		vi.mocked(duckdbQueryExternalPgAsyncDetailed).mockResolvedValueOnce({
			rows: [
				{ stage: "OPT0_XU_QIU_QUE_REN", total_count: 9 },
				{ stage: "OPT2_YI_BAO_JIA", total_count: 4 },
			],
			error: null,
		});

		await POST(new Request("http://localhost/api/chat", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				sessionId: "s-ycrm-stage",
				currentSystemHint: "ycrm",
				messages: [
					{
						id: "m1",
						role: "user",
						parts: [
							{
								type: "text",
								text: "請用 Y-CRM 工作區資料幫我做商機階段分布圖表。",
							},
						],
					},
				],
			}),
		}));

		expect(startRun).not.toHaveBeenCalled();
		expect(createSyntheticCompletedRun).toHaveBeenCalledTimes(1);
		expect(
			vi.mocked(createSyntheticCompletedRun).mock.calls[0]?.[0]?.text,
		).toContain("需求確認：9 筆");
	});

	it("handles Y-CRM task-status chart questions as direct DB-first replies", async () => {
		seedSession("s-ycrm-task-status");
		fileStore.set(
			normalizePath("/virtual/workspace/skills/ycrm/reference/auto-schema-workspace_3joxkr9ofo5hlxjan164egffx.md"),
			[
				"- 掃描時間: 2026-06-16 09:00:00",
				"- 標準表: person, company, opportunity, workspaceMember, task",
				"### task",
				"| 欄位 | 型別 |",
				"| status | TEXT |",
				"| deletedAt | TIMESTAMP |",
			].join("\n"),
		);

		const { POST } = await import("./route.js");
		const { startRun, createSyntheticCompletedRun } = await import("@/lib/active-runs");
		const { duckdbQueryExternalPgAsyncDetailed } = await import("@/lib/workspace");

		vi.mocked(duckdbQueryExternalPgAsyncDetailed).mockReset();
		vi.mocked(duckdbQueryExternalPgAsyncDetailed).mockResolvedValueOnce({
			rows: [
				{ status: "TODO", total_count: 12 },
				{ status: "YI_WAN_CHENG", total_count: 7 },
			],
			error: null,
		});

		await POST(new Request("http://localhost/api/chat", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				sessionId: "s-ycrm-task-status",
				currentSystemHint: "ycrm",
				messages: [
					{
						id: "m1",
						role: "user",
						parts: [
							{
								type: "text",
								text: "請用 Y-CRM 工作區資料幫我做任務狀態分布圖表。",
							},
						],
					},
				],
			}),
		}));

		expect(startRun).not.toHaveBeenCalled();
		expect(createSyntheticCompletedRun).toHaveBeenCalledTimes(1);
		expect(
			vi.mocked(createSyntheticCompletedRun).mock.calls[0]?.[0]?.text,
		).toContain("待辦：12 筆");
	});

	it("handles Y-CRM task-due chart questions as direct DB-first replies", async () => {
		seedSession("s-ycrm-task-due");
		fileStore.set(
			normalizePath("/virtual/workspace/skills/ycrm/reference/auto-schema-workspace_3joxkr9ofo5hlxjan164egffx.md"),
			[
				"- 掃描時間: 2026-06-16 09:00:00",
				"- 標準表: person, company, opportunity, workspaceMember, task",
				"### task",
				"| 欄位 | 型別 |",
				"| dueAt | TIMESTAMP |",
				"| status | TEXT |",
				"| deletedAt | TIMESTAMP |",
			].join("\n"),
		);

		const { POST } = await import("./route.js");
		const { startRun, createSyntheticCompletedRun } = await import("@/lib/active-runs");
		const { duckdbQueryExternalPgAsyncDetailed } = await import("@/lib/workspace");

		vi.mocked(duckdbQueryExternalPgAsyncDetailed).mockReset();
		vi.mocked(duckdbQueryExternalPgAsyncDetailed).mockResolvedValueOnce({
			rows: [
				{ due_status: "已逾期", total_count: 4 },
				{ due_status: "正常", total_count: 11 },
			],
			error: null,
		});

		await POST(new Request("http://localhost/api/chat", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				sessionId: "s-ycrm-task-due",
				currentSystemHint: "ycrm",
				messages: [
					{
						id: "m1",
						role: "user",
						parts: [
							{
								type: "text",
								text: "請用 Y-CRM 工作區資料幫我做任務到期概況圖表。",
							},
						],
					},
				],
			}),
		}));

		expect(startRun).not.toHaveBeenCalled();
		expect(createSyntheticCompletedRun).toHaveBeenCalledTimes(1);
		expect(
			vi.mocked(createSyntheticCompletedRun).mock.calls[0]?.[0]?.text,
		).toContain("已逾期：4 筆");
	});

	it("handles EnMS meter-count chart questions as direct DB-first replies", async () => {
		seedSession("s-enms-meter-count");

		const { POST } = await import("./route.js");
		const { startRun, createSyntheticCompletedRun } = await import("@/lib/active-runs");
		const { duckdbQueryExternalPgAsyncDetailed } = await import("@/lib/workspace");

		vi.mocked(duckdbQueryExternalPgAsyncDetailed).mockReset();
		mockEnmsDetailedQueryWithBootstrap(
			vi.mocked(duckdbQueryExternalPgAsyncDetailed),
			[{ total_count: 128 }],
		);

		await POST(new Request("http://localhost/api/chat", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				sessionId: "s-enms-meter-count",
				currentSystemHint: "enms",
				messages: [
					{
						id: "m1",
						role: "user",
						parts: [
							{
								type: "text",
								text: "可以幫我用圖表呈現一下目前有多少電表嗎？",
							},
						],
					},
				],
			}),
		}));

		expect(startRun).not.toHaveBeenCalled();
		expect(createSyntheticCompletedRun).toHaveBeenCalledTimes(1);
		expect(
			vi.mocked(createSyntheticCompletedRun).mock.calls[0]?.[0]?.text,
		).toContain("目前共有 128 個電表");
	});

	it("returns a blocked EnMS reply without starting the generic run when DB config is missing", async () => {
		seedSession("s-enms-missing-config");
		delete process.env.ENMS_PG_CONNECTION;
		delete process.env.OPENCLAW_ENMS_PG_CONNECTION;
		delete process.env.ENMS_POSTGRES_CONNECTION;

		const { POST } = await import("./route.js");
		const { startRun, createSyntheticCompletedRun } = await import("@/lib/active-runs");

		await POST(new Request("http://localhost/api/chat", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				sessionId: "s-enms-missing-config",
				currentSystemHint: "enms",
				messages: [
					{
						id: "m1",
						role: "user",
						parts: [
							{
								type: "text",
								text: "請找最近 7 天最耗電的設備或迴路。",
							},
						],
					},
				],
			}),
		}));

		expect(startRun).not.toHaveBeenCalled();
		expect(createSyntheticCompletedRun).toHaveBeenCalledTimes(1);
		expect(
			vi.mocked(createSyntheticCompletedRun).mock.calls[0]?.[0]?.text,
		).toContain("主要資料來源尚未就緒");
	});

	it("returns a blocked EnMS reply without starting the generic run when live introspection fails", async () => {
		seedSession("s-enms-introspection-fails");

		const { POST } = await import("./route.js");
		const { startRun, createSyntheticCompletedRun } = await import("@/lib/active-runs");
		const { duckdbQueryExternalPgAsyncDetailed } = await import("@/lib/workspace");

		vi.mocked(duckdbQueryExternalPgAsyncDetailed).mockReset();
			vi.mocked(duckdbQueryExternalPgAsyncDetailed).mockResolvedValueOnce({
				rows: [],
				error:
					"ATTACH 'host=enms-redaction.internal port=55433 dbname=EnMS user=sa password=secret sslmode=disable' AS enms failed",
			});

		await POST(new Request("http://localhost/api/chat", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				sessionId: "s-enms-introspection-fails",
				currentSystemHint: "enms",
				messages: [
					{
						id: "m1",
						role: "user",
						parts: [
							{
								type: "text",
								text: "請找最近 7 天最耗電的設備或迴路。",
							},
						],
					},
				],
			}),
		}));

		expect(startRun).not.toHaveBeenCalled();
		expect(createSyntheticCompletedRun).toHaveBeenCalledTimes(1);
		const reply = vi.mocked(createSyntheticCompletedRun).mock.calls[0]?.[0]?.text ?? "";
		expect(reply).toContain("主要資料來源尚未就緒");
		expect(reply).not.toContain("password=secret");
	});

	it("handles EnMS site-bill ranking questions as direct DB-first replies", async () => {
		seedSession("s-enms-bill-ranking");

		const { POST } = await import("./route.js");
		const { startRun, createSyntheticCompletedRun } = await import("@/lib/active-runs");
		const { duckdbQueryExternalPgAsyncDetailed } = await import("@/lib/workspace");

		vi.mocked(duckdbQueryExternalPgAsyncDetailed).mockReset();
		mockEnmsDetailedQueryWithBootstrap(
			vi.mocked(duckdbQueryExternalPgAsyncDetailed),
			[
				{
					site_name: "阿里山",
					gregorian_year: 2025,
					billed_accounts: 1,
					bill_count: 12,
					baseline_kwh: 1006863,
					baseline_bill: 3592971,
					savings_5pct_kwh: 50343.15,
					savings_10pct_kwh: 100686.3,
					savings_5pct_ntd: 179648.55,
					savings_10pct_ntd: 359297.1,
				},
				{
					site_name: "洋銘資訊",
					gregorian_year: 2025,
					billed_accounts: 2,
					bill_count: 12,
					baseline_kwh: 17177,
					baseline_bill: 57638,
					savings_5pct_kwh: 858.85,
					savings_10pct_kwh: 1717.7,
					savings_5pct_ntd: 2881.9,
					savings_10pct_ntd: 5763.8,
				},
			],
		);

		await POST(new Request("http://localhost/api/chat", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				sessionId: "s-enms-bill-ranking",
				currentSystemHint: "enms",
				messages: [
					{
						id: "m1",
						role: "user",
						parts: [
							{
								type: "text",
								text: "哪個場域最新年度電費最高？請用圖表呈現各場域電費排行。",
							},
						],
					},
				],
			}),
		}));

		expect(startRun).not.toHaveBeenCalled();
		expect(createSyntheticCompletedRun).toHaveBeenCalledTimes(1);
		expect(
			vi.mocked(createSyntheticCompletedRun).mock.calls[0]?.[0]?.text,
		).toContain("2025 年台電帳單 baseline 的電費 / 用電排行");
	});

	it("handles EnMS bill-trend questions as direct DB-first replies", async () => {
		seedSession("s-enms-bill-trend");

		const { POST } = await import("./route.js");
		const { startRun, createSyntheticCompletedRun } = await import("@/lib/active-runs");
		const { duckdbQueryExternalPgAsyncDetailed } = await import("@/lib/workspace");

		vi.mocked(duckdbQueryExternalPgAsyncDetailed).mockReset();
		mockEnmsDetailedQueryWithBootstrap(
			vi.mocked(duckdbQueryExternalPgAsyncDetailed),
			[
				{
					period: "2026-01",
					bill_count: 1,
					account_count: 1,
					total_kwh: 1200.5,
					total_bill: 4200,
					avg_rate: 3.4985,
				},
				{
					period: "2026-02",
					bill_count: 1,
					account_count: 1,
					total_kwh: 1188.2,
					total_bill: 4310,
					avg_rate: 3.6273,
				},
			],
		);

		await POST(new Request("http://localhost/api/chat", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				sessionId: "s-enms-bill-trend",
				currentSystemHint: "enms",
				messages: [
					{
						id: "m1",
						role: "user",
						parts: [
							{
								type: "text",
								text: "電號 8888888888 最近 6 期台電帳單趨勢如何？請用圖表呈現。",
							},
						],
					},
				],
			}),
		}));

		expect(startRun).not.toHaveBeenCalled();
		expect(createSyntheticCompletedRun).toHaveBeenCalledTimes(1);
		expect(
			vi.mocked(createSyntheticCompletedRun).mock.calls[0]?.[0]?.text,
		).toContain("最近 6 期台電帳單趨勢已整理完成");
	});

	it("handles EnMS energy-trend questions as direct DB-first replies", async () => {
		seedSession("s-enms-energy-trend");

		const { POST } = await import("./route.js");
		const { startRun, createSyntheticCompletedRun } = await import("@/lib/active-runs");
		const { duckdbQueryExternalPgAsyncDetailed } = await import("@/lib/workspace");

		vi.mocked(duckdbQueryExternalPgAsyncDetailed).mockReset();
		mockEnmsDetailedQueryWithBootstrap(
			vi.mocked(duckdbQueryExternalPgAsyncDetailed),
			[
				{ period: "2026-01", total_kwh: 5707.52, peak_kw: 57, avg_pf: 0.9821 },
				{ period: "2026-02", total_kwh: 5696.46, peak_kw: 55, avg_pf: 0.9784 },
				{ period: "2026-03", total_kwh: 6033.12, peak_kw: 58, avg_pf: 0.9812 },
			],
		);

		await POST(new Request("http://localhost/api/chat", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				sessionId: "s-enms-energy-trend",
				currentSystemHint: "enms",
				messages: [
					{
						id: "m1",
						role: "user",
						parts: [
							{
								type: "text",
								text: "請問我在2026年1月到今天的能源趨勢分析可以提供給我嗎？也可以幫我用圖表呈現出來。",
							},
						],
					},
				],
			}),
		}));

		expect(startRun).not.toHaveBeenCalled();
		expect(createSyntheticCompletedRun).toHaveBeenCalledTimes(1);
		expect(
			vi.mocked(createSyntheticCompletedRun).mock.calls[0]?.[0]?.text,
		).toContain("能源趨勢已整理完成");
	});

	it("handles EnMS explicit date-range trend questions as direct DB-first replies", async () => {
		seedSession("s-enms-energy-trend-range");

		const { POST } = await import("./route.js");
		const { startRun, createSyntheticCompletedRun } = await import("@/lib/active-runs");
		const { duckdbQueryExternalPgAsyncDetailed } = await import("@/lib/workspace");

		vi.mocked(duckdbQueryExternalPgAsyncDetailed).mockReset();
		mockEnmsDetailedQueryWithBootstrap(
			vi.mocked(duckdbQueryExternalPgAsyncDetailed),
			[
				{ period: "2026-01-01", total_kwh: 5707.52, peak_kw: 57, avg_pf: 0.9821 },
				{ period: "2026-01-02", total_kwh: 5696.46, peak_kw: 55, avg_pf: 0.9784 },
			],
		);

		await POST(new Request("http://localhost/api/chat", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				sessionId: "s-enms-energy-trend-range",
				currentSystemHint: "enms",
				messages: [
					{
						id: "m1",
						role: "user",
						parts: [
							{
								type: "text",
								text: "請用 EnMS 資料分析 2026-01-01 到 2026-01-02 的能源趨勢，並用圖表呈現。",
							},
						],
					},
				],
			}),
		}));

		expect(startRun).not.toHaveBeenCalled();
		expect(createSyntheticCompletedRun).toHaveBeenCalledTimes(1);
		expect(
			vi.mocked(createSyntheticCompletedRun).mock.calls[0]?.[0]?.text,
		).toContain("能源趨勢已整理完成");
	});
});
