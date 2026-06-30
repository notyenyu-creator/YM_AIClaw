export type ChatModelOption = {
	stableId: string;
	/** Gateway catalog `id` when it differs from `stableId` (session rows may use either). */
	catalogId?: string;
	displayName: string;
	provider: string;
	reasoning: boolean;
};

const GX10_PUBLIC_MODEL_IDS = new Set([
	"gx10_hermes/hermes-agent",
]);

export function findChatModelByStableOrCatalogId(
	models: ChatModelOption[],
	id: string | null | undefined,
): ChatModelOption | undefined {
	const trimmed = typeof id === "string" ? id.trim() : "";
	if (!trimmed) {
		return undefined;
	}
	return models.find(
		(m) =>
			m.stableId === trimmed ||
			(typeof m.catalogId === "string" && m.catalogId.trim() === trimmed),
	);
}

export function normalizeDenchModelId(
	model: string | null | undefined,
): string | null {
	if (typeof model !== "string" || !model.trim()) {
		return null;
	}
	const normalized = model.trim();
	return normalized.startsWith("dench-cloud/")
		? normalized.slice("dench-cloud/".length)
		: normalized;
}

export function isGx10HermesModelId(
	model: string | null | undefined,
): boolean {
	const normalized = normalizeDenchModelId(model)?.toLowerCase() ?? "";
	return normalized.startsWith("gx10_hermes/");
}

export function isPublicChatModel(model: ChatModelOption): boolean {
	const stableId = model.stableId.trim().toLowerCase();
	if (!stableId.startsWith("gx10_hermes/")) {
		return true;
	}
	return GX10_PUBLIC_MODEL_IDS.has(stableId);
}

export function filterPublicChatModels(
	models: ChatModelOption[],
): ChatModelOption[] {
	const visible = models.filter(isPublicChatModel);
	return visible.length > 0 ? visible : models;
}

export function isLikelyOpenAiModelId(
	model: string | null | undefined,
): boolean {
	const normalized = normalizeDenchModelId(model)?.toLowerCase() ?? "";
	return (
		normalized.startsWith("gpt-") ||
		normalized.startsWith("chatgpt") ||
		normalized.startsWith("o1") ||
		normalized.startsWith("o3") ||
		normalized.startsWith("o4") ||
		normalized.includes("openai")
	);
}

export function isLikelyCloudModelId(
	model: string | null | undefined,
): boolean {
	const normalized = normalizeDenchModelId(model)?.toLowerCase() ?? "";
	if (!normalized) {
		return false;
	}

	if (isGx10HermesModelId(normalized) || normalized.startsWith("ollama/")) {
		return false;
	}

	if (isLikelyOpenAiModelId(normalized)) {
		return true;
	}

	return [
		"anthropic.",
		"anthropic/",
		"claude",
		"gemini",
		"google/",
		"google.",
		"deepseek",
		"xai/",
		"grok",
		"mistral/",
		"mistral-",
		"cohere/",
		"command-",
		"bedrock/",
	].some((prefix) => normalized.startsWith(prefix));
}

export function resolveActiveChatModelId({
	modelOverride,
	sessionModel,
	selectedDenchModel,
	models,
}: {
	modelOverride: string | null;
	sessionModel: string | null;
	selectedDenchModel: string | null;
	models: ChatModelOption[];
}): string | null {
	return (
		modelOverride ??
		selectedDenchModel ??
		normalizeDenchModelId(sessionModel) ??
		models[0]?.stableId ??
		null
	);
}

/** Whether switching `targetModel` (OpenAI) can reuse existing gateway tool-call history safely. */
export type OpenAiSwitchClassification = "safe" | "unsafe" | "unknown";

export function classifyOpenAiModelSwitch({
	sessionModel,
	sessionModelProvider,
	targetModel,
}: {
	sessionModel: string | null | undefined;
	sessionModelProvider: string | null | undefined;
	targetModel: string | null | undefined;
}): OpenAiSwitchClassification {
	if (!isLikelyOpenAiModelId(targetModel)) {
		return "safe";
	}

	const provider = sessionModelProvider?.trim().toLowerCase();
	if (provider) {
		return provider === "openai" ? "safe" : "unsafe";
	}

	const currentModel = normalizeDenchModelId(sessionModel);
	if (!currentModel) {
		return "unknown";
	}

	return isLikelyOpenAiModelId(currentModel) ? "safe" : "unsafe";
}

/**
 * If true, the user should acknowledge a fresh gateway context before sending
 * with an OpenAI model override.
 */
export function needsOpenAiSwitchAcknowledgement(
	kind: OpenAiSwitchClassification,
	hasAssistantHistory: boolean,
): boolean {
	if (kind === "unsafe") {
		return true;
	}
	if (kind === "unknown") {
		return hasAssistantHistory;
	}
	return false;
}
