import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { promoteYcrmLearningWikiDrafts } from "./ycrm-learning-promotion";

const originalCwd = process.cwd();

afterEach(() => {
	process.chdir(originalCwd);
});

describe("promoteYcrmLearningWikiDrafts", () => {
	it("registers written wiki draft files into wiki index and log", () => {
		const root = mkdtempSync(join(tmpdir(), "dench-promotion-"));
		const appDir = join(root, "apps", "web");
		const wikiDir = join(root, "wiki", "entities", "customers");
		mkdirSync(appDir, { recursive: true });
		mkdirSync(wikiDir, { recursive: true });

		writeFileSync(
			join(root, "wiki", "index.md"),
			[
				"# DenchClaw Wiki Index",
				"",
				"### Entities",
				"",
				"| 頁面 | 摘要 | 來源系統 | 最後更新 |",
				"|------|------|----------|----------|",
				"",
				"### Operations",
				"",
				"| 頁面 | 摘要 | 來源系統 | 最後更新 |",
				"|------|------|----------|----------|",
				"",
			].join("\n"),
			"utf-8",
		);
		writeFileSync(join(root, "wiki", "log.md"), "# DenchClaw Wiki Log\n", "utf-8");
		writeFileSync(
			join(root, "wiki", "entities", "customers", "sample-customer-summary.md"),
			[
				"# Customer Summary Draft",
				"",
				"## Draft Notes",
				"",
				"- This file was generated from the persisted Y-CRM learning draft flow.",
				"- Review and refine before promoting it into a formal wiki page.",
				"",
			].join("\n"),
			"utf-8",
		);

		process.chdir(appDir);

		const result = promoteYcrmLearningWikiDrafts("session-12345678", {
			session_id: "session-12345678",
			status: "ready",
			learning_focus: "entity_summary",
			summary: "summary",
			meta: {
				generated_at: 1710000000000,
				generation_mode: "minimal_evidence",
				token_guardrails: ["single_session_single_draft"],
				cached: false,
				source: "fresh_generation",
			},
			writeback: {
				status: "written",
				updated_at: 1710000000100,
				files: ["wiki/entities/customers/sample-customer-summary.md"],
				skipped_files: [],
				promoted_files: [],
				promotion_skipped_files: [],
				promotion_conflict_files: [],
				approved_at: null,
				approved_via: null,
			},
			evidence: {
				latest_user_message: "hello",
				latest_assistant_reply: "hi",
				live_query_steps: [],
			},
			drafts: {
				wiki: [
					{
						kind: "customer_summary",
						suggested_path: "wiki/entities/customers/sample-customer-summary.md",
						title: "Customer Summary Draft",
						reason: "reason",
						outline: ["one"],
					},
				],
				playbooks: [],
				memory: [],
			},
		});

		expect(result.promoted_files).toContain("wiki/entities/customers/sample-customer-summary.md");
		expect(result.updated_supporting_files).toContain("wiki/index.md");
		expect(result.updated_supporting_files).toContain("wiki/log.md");
		expect(result.updated_supporting_files).toContain("wiki/entities/customers/sample-customer-summary.md");
		expect(readFileSync(join(root, "wiki", "index.md"), "utf-8")).toContain("sample-customer-summary.md");
		expect(readFileSync(join(root, "wiki", "log.md"), "utf-8")).toContain("promotion | Y-CRM learning draft session-");
		expect(readFileSync(join(root, "wiki", "entities", "customers", "sample-customer-summary.md"), "utf-8")).toContain("## Promotion Metadata");
		expect(readFileSync(join(root, "wiki", "entities", "customers", "sample-customer-summary.md"), "utf-8")).toContain("Approved via: manual_promotion");
		expect(readFileSync(join(root, "wiki", "entities", "customers", "sample-customer-summary.md"), "utf-8")).toContain("Source session: `session-12345678`");
		expect(result.conflict_details).toEqual([]);
	});

	it("flags conflict when the target page no longer looks like a generated draft", () => {
		const root = mkdtempSync(join(tmpdir(), "dench-promotion-conflict-"));
		const appDir = join(root, "apps", "web");
		const wikiDir = join(root, "wiki", "entities", "customers");
		mkdirSync(appDir, { recursive: true });
		mkdirSync(wikiDir, { recursive: true });

		writeFileSync(join(root, "wiki", "index.md"), "# DenchClaw Wiki Index\n", "utf-8");
		writeFileSync(join(root, "wiki", "log.md"), "# DenchClaw Wiki Log\n", "utf-8");
		writeFileSync(
			join(root, "wiki", "entities", "customers", "sample-customer-summary.md"),
			[
				"# Manually Curated Customer Page",
				"",
				"## Executive Summary",
				"",
				"This page was edited by a human and is no longer a raw generated draft.",
				"",
			].join("\n"),
			"utf-8",
		);

		process.chdir(appDir);

		const result = promoteYcrmLearningWikiDrafts("session-12345678", {
			session_id: "session-12345678",
			status: "ready",
			learning_focus: "entity_summary",
			summary: "summary",
			meta: {
				generated_at: 1710000000000,
				generation_mode: "minimal_evidence",
				token_guardrails: ["single_session_single_draft"],
				cached: false,
				source: "fresh_generation",
			},
			writeback: {
				status: "written",
				updated_at: 1710000000100,
				files: ["wiki/entities/customers/sample-customer-summary.md"],
				skipped_files: [],
				promoted_files: [],
				promotion_skipped_files: [],
				promotion_conflict_files: [],
				approved_at: null,
				approved_via: null,
			},
			evidence: {
				latest_user_message: "hello",
				latest_assistant_reply: "hi",
				live_query_steps: [],
			},
			drafts: {
				wiki: [
					{
						kind: "customer_summary",
						suggested_path: "wiki/entities/customers/sample-customer-summary.md",
						title: "Customer Summary Draft",
						reason: "reason",
						outline: ["one"],
					},
				],
				playbooks: [],
				memory: [],
			},
		});

		expect(result.promoted_files).toEqual([]);
		expect(result.conflict_files).toContain("wiki/entities/customers/sample-customer-summary.md");
		expect(result.conflict_details[0]?.reason).toBe("manual_content_detected");
		expect(result.conflict_details[0]?.current_title).toBe("Manually Curated Customer Page");
		expect(result.conflict_details[0]?.proposed_title).toBe("Customer Summary Draft");
		expect(result.conflict_details[0]?.proposed_outline).toEqual(["one"]);
		expect(result.updated_supporting_files).toEqual([]);
	});

	it("flags conflict when the target page was already promoted by a different session", () => {
		const root = mkdtempSync(join(tmpdir(), "dench-promotion-source-session-"));
		const appDir = join(root, "apps", "web");
		const wikiDir = join(root, "wiki", "entities", "customers");
		mkdirSync(appDir, { recursive: true });
		mkdirSync(wikiDir, { recursive: true });

		writeFileSync(join(root, "wiki", "index.md"), "# DenchClaw Wiki Index\n", "utf-8");
		writeFileSync(join(root, "wiki", "log.md"), "# DenchClaw Wiki Log\n", "utf-8");
		writeFileSync(
			join(root, "wiki", "entities", "customers", "sample-customer-summary.md"),
			[
				"# Previously Promoted Customer Page",
				"",
				"## Promotion Metadata",
				"",
				"- Promotion status: approved",
				"- Approved via: manual_promotion",
				"- Approved at: 2026-04-18T11:59:00.000Z",
				"- Source session: `session-other-9999`",
				"- Learning focus: `entity_summary`",
				"- Generation mode: `minimal_evidence`",
				"- Registry references: `wiki/index.md`, `wiki/log.md`",
				"",
			].join("\n"),
			"utf-8",
		);

		process.chdir(appDir);

		const result = promoteYcrmLearningWikiDrafts("session-12345678", {
			session_id: "session-12345678",
			status: "ready",
			learning_focus: "entity_summary",
			summary: "summary",
			meta: {
				generated_at: 1710000000000,
				generation_mode: "minimal_evidence",
				token_guardrails: ["single_session_single_draft"],
				cached: false,
				source: "fresh_generation",
			},
			writeback: {
				status: "written",
				updated_at: 1710000000100,
				files: ["wiki/entities/customers/sample-customer-summary.md"],
				skipped_files: [],
				promoted_files: [],
				promotion_skipped_files: [],
				promotion_conflict_files: [],
				approved_at: null,
				approved_via: null,
			},
			evidence: {
				latest_user_message: "hello",
				latest_assistant_reply: "hi",
				live_query_steps: [],
			},
			drafts: {
				wiki: [
					{
						kind: "customer_summary",
						suggested_path: "wiki/entities/customers/sample-customer-summary.md",
						title: "Customer Summary Draft",
						reason: "reason",
						outline: ["one"],
					},
				],
				playbooks: [],
				memory: [],
			},
		});

		expect(result.promoted_files).toEqual([]);
		expect(result.conflict_files).toContain("wiki/entities/customers/sample-customer-summary.md");
		expect(result.conflict_details[0]?.reason).toBe("different_source_session");
		expect(result.conflict_details[0]?.current_source_session).toBe("session-other-9999");
		expect(result.conflict_details[0]?.current_title).toBe("Previously Promoted Customer Page");
	});
});
