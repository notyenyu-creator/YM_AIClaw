import { describe, expect, it } from "vitest";
import type { UIMessage } from "ai";
import {
	buildRollingChatContext,
	compactRollingChatContext,
	decorateMessageWithRollingContext,
} from "./chat-rolling-context";

function textMessage(id: string, role: "user" | "assistant", text: string): UIMessage {
	return {
		id,
		role,
		parts: [{ type: "text", text }],
	} as UIMessage;
}

describe("chat rolling context", () => {
	it("stays out of the way for a short first-turn request", () => {
		const context = buildRollingChatContext(
			[
				textMessage("u1", "user", "請幫我整理 Y-CRM 工作區裡面的 Calleen Hong 目前負責的客戶背景"),
			],
			"請幫我整理 Y-CRM 工作區裡面的 Calleen Hong 目前負責的客戶背景",
		);

		expect(context.mode).toBe("none");
		expect(decorateMessageWithRollingContext("原始訊息", context)).toBe("原始訊息");
	});

	it("adds a rolling window for lightweight follow-up continuity", () => {
		const context = buildRollingChatContext(
			[
				textMessage("u1", "user", "先幫我整理 Calleen Hong 的客戶背景"),
				textMessage("a1", "assistant", "我已經整理出三家重點客戶與目前商機階段。"),
				textMessage("u2", "user", "再幫我把剛剛那三家排成優先順序"),
			],
			"再幫我把剛剛那三家排成優先順序",
		);

		expect(context.mode).toBe("window_only");
		const decorated = decorateMessageWithRollingContext("原始訊息", context);
		expect(decorated).toContain("[Rolling Context]");
		expect(decorated).toContain("rolling.mode=window_only");
		expect(decorated).toContain("rolling.reason=followup_reference_detected");
		expect(decorated).toContain("U: 先幫我整理 Calleen Hong 的客戶背景");
	});

	it("adds a compact rolling summary when history is long", () => {
		const messages: UIMessage[] = [
			textMessage("u1", "user", "先整理 Calleen Hong 的客戶名單"),
			textMessage("a1", "assistant", "已整理出幾家重點客戶"),
			textMessage("u2", "user", "補充商機階段"),
			textMessage("a2", "assistant", "已補上階段"),
			textMessage("u3", "user", "再補金額"),
			textMessage("a3", "assistant", "已補金額"),
			textMessage("u4", "user", "再補是否既有客戶"),
			textMessage("a4", "assistant", "已補既有客戶欄位"),
			textMessage("u5", "user", "延續上面內容，幫我做一版簡潔摘要"),
		];

		const context = buildRollingChatContext(
			messages,
			"延續上面內容，幫我做一版簡潔摘要",
		);

		expect(context.mode).toBe("window_plus_summary");
		expect(context.rolling_summary).toContain("- U:");
		const decorated = decorateMessageWithRollingContext("原始訊息", context);
		expect(decorated).toContain("runtime.history_strategy=rolling_window_plus_summary");
		expect(decorated).toContain("rolling.mode=window_plus_summary");
	});

	it("compacts long rolling context for local models without losing recent continuity", () => {
		const messages: UIMessage[] = [
			textMessage("u1", "user", "先整理 Calleen Hong 的客戶名單"),
			textMessage("a1", "assistant", "已整理出幾家重點客戶"),
			textMessage("u2", "user", "補充商機階段"),
			textMessage("a2", "assistant", "已補上階段"),
			textMessage("u3", "user", "再補金額"),
			textMessage("a3", "assistant", "已補金額"),
			textMessage("u4", "user", "再補是否既有客戶"),
			textMessage("a4", "assistant", "已補既有客戶欄位"),
			textMessage("u5", "user", "延續上面內容，幫我做一版簡潔摘要"),
		];

		const compacted = compactRollingChatContext(
			buildRollingChatContext(messages, "延續上面內容，幫我做一版簡潔摘要"),
		);

		expect(compacted.mode).toBe("window_only");
		expect(compacted.rolling_summary).toBeNull();
		expect(compacted.recent_window).toHaveLength(2);
		expect(compacted.reason).toContain("compact_local_model");
	});
});
