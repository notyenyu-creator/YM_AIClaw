// ERP Learning Auto-Trigger — Phase 2b
//
// Mirrors ycrm-learning-auto-trigger. After a chat run completes,
// the active-runs handler calls triggerAutoErpLearningDraftIfEligible
// to generate a learning draft from the persisted ERP planner artifacts
// and the recent transcript window.

import { existsSync, readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { resolveWebChatDir } from "./workspace";
import {
  getSessionMeta,
  updateSessionErpPlannerLearningDraft,
} from "@/app/api/web-sessions/shared";
import {
  buildErpLearningDraft,
  type ErpLearningDraftMessage,
} from "./erp-learning-draft";

// High-value ERP intents worth a learning draft. Other intents (unknown)
// stay manual-trigger only.
const HIGH_VALUE_INTENTS = new Set([
  "sales_order",
  "inventory_status",
  "shipping_status",
  "production_status",
  "purchase_order",
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
): ErpLearningDraftMessage[] {
  const result: ErpLearningDraftMessage[] = [];
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

export type ErpAutoTriggerSkipReason =
  | "subagent_session"
  | "no_planner_artifacts"
  | "not_routed_to_erp"
  | "intent_not_high_value"
  | "draft_already_reviewed"
  | "draft_too_recent"
  | "no_eligible_messages";

export type ErpAutoTriggerOutcome =
  | { status: "skipped"; reason: ErpAutoTriggerSkipReason }
  | { status: "generated"; sessionId: string };

export function runAutoErpLearningDraftEvaluation(
  sessionId: string,
  options: { now?: number } = {},
): ErpAutoTriggerOutcome {
  if (!sessionId || sessionId.includes(":subagent:")) {
    return { status: "skipped", reason: "subagent_session" };
  }

  const meta = getSessionMeta(sessionId);
  if (!meta?.erpPlannerPreflight || !meta.erpPlannerContextPack) {
    return { status: "skipped", reason: "no_planner_artifacts" };
  }
  if (!meta.erpPlannerPreflight.shouldRouteToErp) {
    return { status: "skipped", reason: "not_routed_to_erp" };
  }
  if (!HIGH_VALUE_INTENTS.has(meta.erpPlannerPreflight.intent)) {
    return { status: "skipped", reason: "intent_not_high_value" };
  }

  const existing = meta.erpPlannerLearningDraft;
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

  const draft = buildErpLearningDraft({
    session_id: sessionId,
    planner_preflight: meta.erpPlannerPreflight,
    planner_context_pack: meta.erpPlannerContextPack,
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
  updateSessionErpPlannerLearningDraft(sessionId, annotated);
  return { status: "generated", sessionId };
}

export function triggerAutoErpLearningDraftIfEligible(sessionId: string): void {
  setTimeout(() => {
    try {
      runAutoErpLearningDraftEvaluation(sessionId);
    } catch (err) {
      console.warn(
        "[erp-learning-auto-trigger] Skipped due to unexpected error:",
        err,
      );
    }
  }, 0);
}
