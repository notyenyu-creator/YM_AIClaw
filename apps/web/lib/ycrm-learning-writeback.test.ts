import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { writeYcrmLearningWikiDrafts } from "./ycrm-learning-writeback";

const originalCwd = process.cwd();

afterEach(() => {
	process.chdir(originalCwd);
});

const sampleDraft = {
	session_id: "session-12345678",
	status: "ready" as const,
	learning_focus: "entity_summary",
	summary: "summary",
	meta: {
		generated_at: 1710000000000,
		generation_mode: "minimal_evidence" as const,
		token_guardrails: ["single_session_single_draft"],
		cached: false,
		source: "fresh_generation" as const,
	},
	writeback: {
		status: "not_written" as const,
		updated_at: null,
		files: [],
		skipped_files: [],
		promoted_files: [],
		promotion_skipped_files: [],
		promotion_conflict_files: [],
		approved_at: null,
		approved_via: null,
	},
	evidence: {
		latest_user_message: "請幫我整理 Y-CRM 工作區裡面的 Calleen Hong 目前負責的客戶背景。",
		latest_assistant_reply: "已整理出該業務目前負責的客戶輪廓與下一步。",
		live_query_steps: ["read_real_data", "resolve_workspace_member_fk"],
	},
	drafts: {
		wiki: [
			{
				kind: "customer_summary" as const,
				suggested_path: "wiki/entities/customers/sample-customer-summary.md",
				title: "Y-CRM Customer Summary Draft",
				reason: "Reusable customer summary.",
				outline: ["客戶背景", "商機狀態", "下一步"],
			},
		],
		playbooks: [],
		memory: [],
	},
};

describe("writeYcrmLearningWikiDrafts", () => {
	it("writes markdown draft files with expected session evidence", () => {
		const root = mkdtempSync(join(tmpdir(), "dench-writeback-"));
		const appDir = join(root, "apps", "web");
		mkdirSync(appDir, { recursive: true });
		process.chdir(appDir);

		const result = writeYcrmLearningWikiDrafts("session-12345678", sampleDraft);
		const absolutePath = join(root, "wiki", "entities", "customers", "sample-customer-summary.md");

		expect(result.files).toEqual(["wiki/entities/customers/sample-customer-summary.md"]);
		expect(result.skipped_files).toEqual([]);
		expect(existsSync(absolutePath)).toBe(true);
		const content = readFileSync(absolutePath, "utf-8");
		expect(content).toContain("# Y-CRM Customer Summary Draft");
		expect(content).toContain("Source session: `session-12345678`");
		expect(content).toContain("Latest user message: 請幫我整理 Y-CRM 工作區裡面的 Calleen Hong 目前負責的客戶背景。");
		expect(content).toContain("Live query steps: read_real_data, resolve_workspace_member_fk");
		expect(content).toContain("This file was generated from the persisted Y-CRM learning draft flow.");
	});

	it("skips existing files unless overwrite is enabled", () => {
		const root = mkdtempSync(join(tmpdir(), "dench-writeback-skip-"));
		const appDir = join(root, "apps", "web");
		const targetDir = join(root, "wiki", "entities", "customers");
		mkdirSync(appDir, { recursive: true });
		mkdirSync(targetDir, { recursive: true });
		writeFileSync(
			join(targetDir, "sample-customer-summary.md"),
			"# Existing Human Draft\n\nKeep me.\n",
			"utf-8",
		);
		process.chdir(appDir);

		const skipped = writeYcrmLearningWikiDrafts("session-12345678", sampleDraft);
		expect(skipped.files).toEqual([]);
		expect(skipped.skipped_files).toEqual(["wiki/entities/customers/sample-customer-summary.md"]);
		expect(readFileSync(join(targetDir, "sample-customer-summary.md"), "utf-8")).toContain("Keep me.");

		const overwritten = writeYcrmLearningWikiDrafts("session-12345678", sampleDraft, { overwrite: true });
		expect(overwritten.files).toEqual(["wiki/entities/customers/sample-customer-summary.md"]);
		expect(overwritten.skipped_files).toEqual([]);
		expect(readFileSync(join(targetDir, "sample-customer-summary.md"), "utf-8")).toContain(
			"Source session: `session-12345678`",
		);
	});
});
