import {
	isGx10HermesModelId,
	isLikelyCloudModelId,
	isLikelyOpenAiModelId,
	normalizeDenchModelId,
} from "./chat-models";
import type {
	DomainAdapterId,
	DomainExecutionStrategy,
} from "./domain-adapter-contract";

export type SessionAnswerMode =
	| "model_run"
	| "verified_direct"
	| "system_direct";

export type SessionModelClass =
	| "local"
	| "cloud"
	| "unknown"
	| "none";

export type SessionExecutionTrace = {
	updatedAt: number;
	turnStartedAt: number;
	answerMode: SessionAnswerMode;
	requestedModelId: string | null;
	modelClass: SessionModelClass;
	domainId?: DomainAdapterId | null;
	executionStrategy?: DomainExecutionStrategy | null;
};

export function classifySessionModelClass(
	modelId: string | null | undefined,
): SessionModelClass {
	const normalized = normalizeDenchModelId(modelId)?.toLowerCase() ?? "";
	if (!normalized) {
		return "unknown";
	}
	if (
		isGx10HermesModelId(normalized) ||
		normalized.startsWith("ollama/")
	) {
		return "local";
	}
	if (
		isLikelyOpenAiModelId(normalized) ||
		normalized.startsWith("openai/") ||
		isLikelyCloudModelId(normalized)
	) {
		return "cloud";
	}
	return "unknown";
}

export function buildSessionExecutionTrace(params: {
	answerMode: SessionAnswerMode;
	requestedModelId?: string | null;
	turnStartedAt?: number;
	domainId?: DomainAdapterId | null;
	executionStrategy?: DomainExecutionStrategy | null;
}): SessionExecutionTrace {
	const requestedModelId = normalizeDenchModelId(params.requestedModelId) ?? null;
	return {
		updatedAt: Date.now(),
		turnStartedAt: params.turnStartedAt ?? Date.now(),
		answerMode: params.answerMode,
		requestedModelId,
		modelClass:
			params.answerMode === "model_run"
				? classifySessionModelClass(requestedModelId)
				: "none",
		domainId: params.domainId ?? null,
		executionStrategy: params.executionStrategy ?? deriveExecutionStrategy(params.answerMode),
	};
}

function deriveExecutionStrategy(
	answerMode: SessionAnswerMode,
): DomainExecutionStrategy {
	if (answerMode === "verified_direct") {
		return "verified_direct_query";
	}
	if (answerMode === "system_direct") {
		return "deterministic_direct_answer";
	}
	return "model_guided_live_query";
}

function formatDomainLabel(domainId: DomainAdapterId | null | undefined): string | null {
	if (domainId === "ycrm") {
		return "Y-CRM";
	}
	if (domainId === "erp") {
		return "ERP";
	}
	if (domainId === "enms") {
		return "EnMS";
	}
	return null;
}

function formatExecutionStrategyLabel(
	strategy: DomainExecutionStrategy | null | undefined,
): string | null {
	if (strategy === "verified_direct_query") {
		return "已驗證直查";
	}
	if (strategy === "deterministic_direct_answer") {
		return "規則直答";
	}
	if (strategy === "model_guided_live_query") {
		return "模型導引查詢";
	}
	if (strategy === "reference_guided_answer") {
		return "參考導引回答";
	}
	return null;
}

export function buildSessionExecutionBadge(
	trace: SessionExecutionTrace | null | undefined,
): {
	label: string;
	tone: "neutral" | "accent" | "warning" | "success";
} | null {
	if (!trace) {
		return null;
	}

	if (trace.answerMode === "verified_direct") {
		return { label: "直接查資料", tone: "neutral" };
	}

	if (trace.answerMode === "system_direct") {
		return { label: "系統回答", tone: "neutral" };
	}

	if (trace.modelClass === "local") {
		return { label: "本地模型", tone: "success" };
	}

	if (trace.modelClass === "cloud") {
		return { label: "雲端模型", tone: "accent" };
	}

	return { label: "未知模型", tone: "warning" };
}

export function buildSessionExecutionDomainBadge(
	trace: SessionExecutionTrace | null | undefined,
): {
	label: string;
	tone: "neutral" | "accent" | "warning" | "success";
} | null {
	const label = formatDomainLabel(trace?.domainId);
	if (!label) {
		return null;
	}
	return { label: `資料:${label}`, tone: "neutral" };
}

export function buildSessionExecutionTooltip(
	trace: SessionExecutionTrace | null | undefined,
): string | null {
	if (!trace) {
		return null;
	}

	const lines: string[] = [];

	if (trace.answerMode === "verified_direct") {
		lines.push("這次回覆：直接使用已驗證資料整理。");
		lines.push("這次沒有實際呼叫 AI 模型。");
		if (trace.requestedModelId) {
			lines.push(`Session 預設模型（本次未使用）：${trace.requestedModelId}`);
		}
	} else if (trace.answerMode === "system_direct") {
		lines.push("這次回覆：使用內建規則 / guardrail 直接回覆。");
		lines.push("這次沒有實際呼叫 AI 模型。");
		if (trace.requestedModelId) {
			lines.push(`Session 預設模型（本次未使用）：${trace.requestedModelId}`);
		}
	} else {
		lines.push("這次回覆：有實際呼叫 AI 模型。");
		lines.push(
			trace.modelClass === "local"
				? "模型類型：本地模型。"
				: trace.modelClass === "cloud"
					? "模型類型：雲端模型。"
					: "模型類型：未知來源模型。",
		);
		if (trace.requestedModelId) {
			lines.push(`本次請求模型：${trace.requestedModelId}`);
		}
	}

	const domainLabel = formatDomainLabel(trace.domainId);
	if (domainLabel) {
		lines.push(`資料域：${domainLabel}`);
	}

	const strategyLabel = formatExecutionStrategyLabel(trace.executionStrategy);
	if (strategyLabel) {
		lines.push(`執行策略：${strategyLabel}`);
	}

	return lines.join("\n");
}
