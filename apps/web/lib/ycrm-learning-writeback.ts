import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import type { YcrmLearningDraft } from "./ycrm-learning-draft";

function resolveDenchClawRoot(): string {
	const cwd = process.cwd();
	if (cwd.endsWith("/apps/web")) {
		return resolve(cwd, "..", "..");
	}
	return cwd;
}

function resolveTargetPath(suggestedPath: string): string {
	if (isAbsolute(suggestedPath)) {
		return suggestedPath;
	}
	return join(resolveDenchClawRoot(), suggestedPath);
}

function renderWikiDraftMarkdown(
	sessionId: string,
	item: YcrmLearningDraft["drafts"]["wiki"][number],
	draft: YcrmLearningDraft,
): string {
	return [
		`# ${item.title}`,
		"",
		`> Source session: \`${sessionId}\``,
		`> Learning focus: \`${draft.learning_focus}\``,
		`> Generated at: ${new Date(draft.meta.generated_at).toISOString()}`,
		"",
		"## Why This Draft Exists",
		"",
		item.reason,
		"",
		"## Suggested Outline",
		"",
		...item.outline.map((section) => `- ${section}`),
		"",
		"## Session Evidence",
		"",
		`- Latest user message: ${draft.evidence.latest_user_message ?? "n/a"}`,
		`- Latest assistant reply: ${draft.evidence.latest_assistant_reply ?? "n/a"}`,
		`- Live query steps: ${draft.evidence.live_query_steps.length > 0 ? draft.evidence.live_query_steps.join(", ") : "none"}`,
		"",
		"## Draft Notes",
		"",
		"- This file was generated from the persisted Y-CRM learning draft flow.",
		"- Review and refine before promoting it into a formal wiki page.",
		"",
	].join("\n");
}

export function writeYcrmLearningWikiDrafts(
	sessionId: string,
	draft: YcrmLearningDraft,
	options?: { overwrite?: boolean },
): {
	files: string[];
	skipped_files: string[];
} {
	const files: string[] = [];
	const skippedFiles: string[] = [];
	const overwrite = options?.overwrite === true;

	for (const item of draft.drafts.wiki) {
		const targetPath = resolveTargetPath(item.suggested_path);
		if (existsSync(targetPath) && !overwrite) {
			skippedFiles.push(item.suggested_path);
			continue;
		}

		mkdirSync(dirname(targetPath), { recursive: true });
		writeFileSync(targetPath, renderWikiDraftMarkdown(sessionId, item, draft), "utf-8");
		files.push(item.suggested_path);
	}

	return {
		files,
		skipped_files: skippedFiles,
	};
}
