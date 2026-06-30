import { describe, expect, it } from "vitest";
import {
	buildSessionExecutionBadge,
	buildSessionExecutionDomainBadge,
	buildSessionExecutionTrace,
	buildSessionExecutionTooltip,
	classifySessionModelClass,
} from "./chat-execution-trace";

describe("chat-execution-trace", () => {
	it("classifies gx10 and ollama models as local", () => {
		expect(classifySessionModelClass("gx10_hermes/hermes-agent")).toBe("local");
		expect(classifySessionModelClass("ollama/gemma4:e2b")).toBe("local");
	});

	it("classifies openai models as cloud", () => {
		expect(classifySessionModelClass("openai/gpt-4.1-mini")).toBe("cloud");
		expect(classifySessionModelClass("gpt-4.1-mini")).toBe("cloud");
		expect(classifySessionModelClass("anthropic.claude-opus-4-6-v1")).toBe("cloud");
		expect(classifySessionModelClass("gemini-2.5-pro")).toBe("cloud");
	});

	it("marks direct answers as not using a model", () => {
		const trace = buildSessionExecutionTrace({
			answerMode: "verified_direct",
			requestedModelId: "gx10_hermes/hermes-agent",
			domainId: "ycrm",
		});

		expect(trace.modelClass).toBe("none");
		expect(trace.turnStartedAt).toBeGreaterThan(0);
		expect(buildSessionExecutionBadge(trace)).toEqual({
			label: "直接查資料",
			tone: "neutral",
		});
		expect(buildSessionExecutionTooltip(trace)).toContain("這次沒有實際呼叫 AI 模型");
		expect(buildSessionExecutionTooltip(trace)).toContain(
			"Session 預設模型（本次未使用）：gx10_hermes/hermes-agent",
		);
		expect(buildSessionExecutionTooltip(trace)).toContain("資料域：Y-CRM");
		expect(buildSessionExecutionTooltip(trace)).toContain("執行策略：已驗證直查");
			expect(buildSessionExecutionDomainBadge(trace)).toEqual({
				label: "資料:Y-CRM",
				tone: "neutral",
			});
	});

	it("marks model runs as local or cloud with human-readable badges", () => {
		const localTrace = buildSessionExecutionTrace({
			answerMode: "model_run",
			requestedModelId: "gx10_hermes/hermes-agent",
		});
		const cloudTrace = buildSessionExecutionTrace({
			answerMode: "model_run",
			requestedModelId: "openai/gpt-4.1-mini",
		});

		expect(buildSessionExecutionBadge(localTrace)).toEqual({
			label: "本地模型",
			tone: "success",
		});
		expect(buildSessionExecutionBadge(cloudTrace)).toEqual({
			label: "雲端模型",
			tone: "accent",
		});
	});

	it("uses an explicit unknown-model badge when the provider cannot be classified", () => {
		const trace = buildSessionExecutionTrace({
			answerMode: "model_run",
			requestedModelId: "custom-router/opaque-model",
		});

		expect(buildSessionExecutionBadge(trace)).toEqual({
			label: "未知模型",
			tone: "warning",
		});
		expect(buildSessionExecutionTooltip(trace)).toContain("本次請求模型：custom-router/opaque-model");
	});
});
