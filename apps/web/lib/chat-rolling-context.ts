import type { UIMessage } from "ai";

const RECENT_WINDOW_MESSAGES = 4;
const SUMMARY_SOURCE_MESSAGES = 6;
const MAX_SUMMARY_CHARS = 420;
const MAX_SNIPPET_CHARS = 140;

export type RollingContextMode = "none" | "window_only" | "window_plus_summary";

export type RollingChatContext = {
	mode: RollingContextMode;
	reason: string;
	recent_window: string[];
	rolling_summary: string | null;
};

function normalizeWhitespace(value: string): string {
	return value.replace(/\s+/g, " ").trim();
}

function truncate(value: string, maxChars: number): string {
	if (value.length <= maxChars) {
		return value;
	}
	return `${value.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...`;
}

function extractMessageText(message: UIMessage): string {
	if (!Array.isArray(message.parts)) {
		return "";
	}

	const text = message.parts
		.filter(
			(part): part is { type: "text"; text: string } =>
				part.type === "text" && typeof part.text === "string",
		)
		.map((part) => part.text)
		.join("\n");

	return normalizeWhitespace(text);
}

function formatHistoryLine(message: UIMessage): string | null {
	const text = extractMessageText(message);
	if (!text) {
		return null;
	}
	const label = message.role === "assistant" ? "A" : "U";
	return `${label}: ${truncate(text, MAX_SNIPPET_CHARS)}`;
}

function buildRollingSummary(historyLines: string[]): string | null {
	if (historyLines.length === 0) {
		return null;
	}

	let remaining = MAX_SUMMARY_CHARS;
	const summaryLines: string[] = [];

	for (const line of historyLines) {
		if (remaining <= 0) {
			break;
		}
		const clipped = truncate(line, Math.min(MAX_SNIPPET_CHARS, remaining));
		summaryLines.push(`- ${clipped}`);
		remaining -= clipped.length + 4;
	}

	if (summaryLines.length === 0) {
		return null;
	}

	return summaryLines.join("\n");
}

function needsFollowupContext(userMessage: string): boolean {
	const message = normalizeWhitespace(userMessage).toLowerCase();
	if (!message) {
		return false;
	}

	return [
		"再",
		"繼續",
		"延續",
		"剛剛",
		"上面",
		"這個",
		"那個",
		"前面",
		"同樣",
		"改成",
		"補充",
		"also",
		"continue",
		"follow up",
		"same",
	].some((keyword) => message.includes(keyword));
}

export function buildRollingChatContext(
	messages: UIMessage[],
	currentUserMessage: string,
): RollingChatContext {
	const previousMessages = messages.slice(0, -1);
	const historyLines = previousMessages
		.map(formatHistoryLine)
		.filter((value): value is string => Boolean(value));

	if (historyLines.length === 0) {
		return {
			mode: "none",
			reason: "no_previous_turns",
			recent_window: [],
			rolling_summary: null,
		};
	}

	const recentWindow = historyLines.slice(-RECENT_WINDOW_MESSAGES);
	const oldHistory = historyLines.slice(
		Math.max(0, historyLines.length - RECENT_WINDOW_MESSAGES - SUMMARY_SOURCE_MESSAGES),
		Math.max(0, historyLines.length - RECENT_WINDOW_MESSAGES),
	);
	const followupContextNeeded = needsFollowupContext(currentUserMessage);

	if (!followupContextNeeded && historyLines.length <= RECENT_WINDOW_MESSAGES) {
		return {
			mode: "none",
			reason: "gateway_session_memory_is_enough",
			recent_window: [],
			rolling_summary: null,
		};
	}

	if (
		oldHistory.length === 0
		|| (!followupContextNeeded && historyLines.length <= RECENT_WINDOW_MESSAGES + SUMMARY_SOURCE_MESSAGES)
	) {
		return {
			mode: "window_only",
			reason: followupContextNeeded ? "followup_reference_detected" : "light_followup_context",
			recent_window: recentWindow,
			rolling_summary: null,
		};
	}

	return {
		mode: "window_plus_summary",
		reason: followupContextNeeded
			? "followup_reference_detected"
			: "long_history_compacted",
		recent_window: recentWindow,
		rolling_summary: buildRollingSummary(oldHistory),
	};
}

export function compactRollingChatContext(
	context: RollingChatContext,
): RollingChatContext {
	if (context.mode === "none") {
		return context;
	}

	return {
		mode: "window_only",
		reason: `${context.reason}_compact_local_model`,
		recent_window: context.recent_window.slice(-2),
		rolling_summary: null,
	};
}

export function decorateMessageWithRollingContext(
	userMessage: string,
	context: RollingChatContext,
): string {
	if (context.mode === "none") {
		return userMessage;
	}

	const lines = [
		"[Rolling Context]",
		"runtime.history_strategy=rolling_window_plus_summary",
		`rolling.mode=${context.mode}`,
		`rolling.reason=${context.reason}`,
		`rolling.recent_window=${context.recent_window.length > 0 ? context.recent_window.join(" | ") : "none"}`,
		`rolling.summary=${context.rolling_summary ?? "none"}`,
		"Guidance:",
		"- Treat this rolling context as compact continuity hints from the web layer; do not override the gateway session memory with it.",
		"- Use recent_window first. Use rolling.summary only to recover older intent or unresolved follow-up references.",
		"- If the current user request is complete on its own, prioritize the current request and keep the response concise.",
		"[/Rolling Context]",
	];

	return `${lines.join("\n")}\n\n${userMessage}`;
}
