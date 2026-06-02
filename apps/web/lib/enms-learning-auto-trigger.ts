import { existsSync, readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { resolveWebChatDir } from "./workspace";
import {
  getSessionMeta,
  updateSessionEnmsPlannerLearningDraft,
} from "@/app/api/web-sessions/shared";
import {
  buildEnmsLearningDraft,
  type EnmsLearningDraftMessage,
} from "./enms-learning-draft";

const HIGH_VALUE_INTENTS = new Set([
  "demand_forecast",
  "anomaly_detection",
  "site_benchmarking",
  "alert_governance",
  "efficiency_analysis",
]);

const MAX_TRANSCRIPT_MESSAGES = 4;
const MAX_MESSAGE_BODY_CHARS = 1200;
const RECENT_DRAFT_AGE_MS = 10_000;

type TranscriptLine = {
  id?: string;
  role?: "user" | "assistant" | string;
  content?: string;
  parts?: Array<{ type?: string; text?: string }>;
};

function safeReadTranscript(sessionId: string): TranscriptLine[] {
  try {
    const dir = resolve(resolveWebChatDir());
    const fp = resolve(dir, basename(sessionId) + ".jsonl");
    if (!fp.startsWith(dir + "/")) {
      return [];
    }
    if (!existsSync(fp)) {
      return [];
    }
    const content = readFileSync(fp, "utf-8");
    return content
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => {
        try {
          return JSON.parse(line) as TranscriptLine;
        } catch {
          return null;
        }
      })
      .filter((entry): entry is TranscriptLine => entry !== null);
  } catch {
    return [];
  }
}

function extractMessageText(entry: TranscriptLine): string {
  if (typeof entry.content === "string" && entry.content.trim().length > 0) {
    return entry.content.trim();
  }
  if (Array.isArray(entry.parts)) {
    return entry.parts
      .filter((part) => part?.type === "text")
      .map((part) => part?.text ?? "")
      .join("\n")
      .trim();
  }
  return "";
}

function takeLatestEligibleMessages(
  transcript: TranscriptLine[],
): EnmsLearningDraftMessage[] {
  const result: EnmsLearningDraftMessage[] = [];
  for (
    let i = transcript.length - 1;
    i >= 0 && result.length < MAX_TRANSCRIPT_MESSAGES;
    i--
  ) {
    const entry = transcript[i];
    if (entry.role !== "user" && entry.role !== "assistant") {
      continue;
    }
    const text = extractMessageText(entry);
    if (!text) {
      continue;
    }
    result.push({
      id: typeof entry.id === "string" ? entry.id : undefined,
      role: entry.role,
      content:
        text.length > MAX_MESSAGE_BODY_CHARS
          ? `${text.slice(0, MAX_MESSAGE_BODY_CHARS - 3)}...`
          : text,
    });
  }
  return result.reverse();
}

export type EnmsAutoTriggerSkipReason =
  | "subagent_session"
  | "no_planner_artifacts"
  | "not_routed_to_enms"
  | "intent_not_high_value"
  | "draft_already_reviewed"
  | "draft_too_recent"
  | "no_eligible_messages";

export type EnmsAutoTriggerOutcome =
  | { status: "skipped"; reason: EnmsAutoTriggerSkipReason }
  | { status: "generated"; sessionId: string };

export function runAutoEnmsLearningDraftEvaluation(
  sessionId: string,
  options: { now?: number } = {},
): EnmsAutoTriggerOutcome {
  if (!sessionId || sessionId.includes(":subagent:")) {
    return { status: "skipped", reason: "subagent_session" };
  }

  const meta = getSessionMeta(sessionId);
  if (!meta?.enmsPlannerPreflight || !meta.enmsPlannerContextPack) {
    return { status: "skipped", reason: "no_planner_artifacts" };
  }
  if (!meta.enmsPlannerPreflight.shouldRouteToEnms) {
    return { status: "skipped", reason: "not_routed_to_enms" };
  }
  if (!HIGH_VALUE_INTENTS.has(meta.enmsPlannerPreflight.intent)) {
    return { status: "skipped", reason: "intent_not_high_value" };
  }

  const existing = meta.enmsPlannerLearningDraft;
  if (existing && existing.writeback.status !== "not_written") {
    return { status: "skipped", reason: "draft_already_reviewed" };
  }

  const now = options.now ?? Date.now();
  if (existing && existing.status === "ready") {
    const ageMs = now - (existing.meta?.generated_at ?? 0);
    if (ageMs >= 0 && ageMs < RECENT_DRAFT_AGE_MS) {
      return { status: "skipped", reason: "draft_too_recent" };
    }
  }

  const transcript = safeReadTranscript(sessionId);
  const messages = takeLatestEligibleMessages(transcript);
  if (messages.length === 0) {
    return { status: "skipped", reason: "no_eligible_messages" };
  }

  const draft = buildEnmsLearningDraft({
    session_id: sessionId,
    planner_preflight: meta.enmsPlannerPreflight,
    planner_context_pack: meta.enmsPlannerContextPack,
    messages,
  });

  const annotated = {
    ...draft,
    meta: {
      ...draft.meta,
      token_guardrails: Array.from(
        new Set([
          ...draft.meta.token_guardrails,
          "auto_trigger_post_run",
          `transcript_window_${MAX_TRANSCRIPT_MESSAGES}`,
        ]),
      ),
    },
  };
  updateSessionEnmsPlannerLearningDraft(sessionId, annotated);
  return { status: "generated", sessionId };
}

export function triggerAutoEnmsLearningDraftIfEligible(sessionId: string): void {
  setTimeout(() => {
    try {
      runAutoEnmsLearningDraftEvaluation(sessionId);
    } catch (err) {
      console.warn(
        "[enms-learning-auto-trigger] Skipped due to unexpected error:",
        err,
      );
    }
  }, 0);
}
