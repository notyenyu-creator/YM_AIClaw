import { randomUUID } from "node:crypto";
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
} from "node:fs";
import { join } from "node:path";
import type { EnmsPlannerPreflight } from "@/lib/enms-context-builder";
import type { EnmsContextPack } from "@/lib/enms-context-pack";
import type { EnmsLearningDraft } from "@/lib/enms-learning-draft";
import type { ErpPlannerPreflight } from "@/lib/erp-context-builder";
import type { ErpContextPack } from "@/lib/erp-context-pack";
import type { ErpLearningDraft } from "@/lib/erp-learning-draft";
import type { SessionExecutionTrace } from "@/lib/chat-execution-trace";
import type { YcrmContextPack } from "@/lib/ycrm-context-pack";
import type { YcrmLearningDraft } from "@/lib/ycrm-learning-draft";
import { resolveActiveAgentId, resolveWebChatDir } from "@/lib/workspace";

export type SessionPlannerPreflight = {
  system: "ycrm";
  updatedAt: number;
  validationState?: "heuristic" | "validated" | "stale";
  intent: string;
  confidence: string;
  shouldRouteToYcrm: boolean;
  workspaceId: string | null;
  needsWorkspaceValidation: boolean;
  warnings: string[];
  blockers: string[];
  crossSystem: boolean;
  targetSystems: string[];
};

export type WebSessionMeta = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  /** When set, this session is scoped to a specific workspace file. */
  filePath?: string;
  /** Workspace name at session creation time (pinned). */
  workspaceName?: string;
  /** Workspace root directory at session creation time. */
  workspaceRoot?: string;
  /** The workspace's durable agent ID (e.g. "main"). */
  workspaceAgentId?: string;
  /** Ephemeral chat-specific agent ID, if one was allocated. */
  chatAgentId?: string;
  /** The full gateway session key used for this chat. */
  gatewaySessionKey?: string;
  /**
   * Optional gateway thread id (suffix of `agent:{agentId}:web:{id}`).
   * When unset, the web session `id` is used. Rotating this gives the gateway a
   * fresh context without changing the web chat id or transcript file.
   */
  gatewaySessionId?: string;
  /** Which agent model is in use: "workspace" (shared) or "ephemeral" (per-chat). */
  agentMode?: "workspace" | "ephemeral";
  /** Last time the session had active traffic. */
  lastActiveAt?: number;
  /** Latest planner preflight summary captured before a chat run starts. */
  plannerPreflight?: SessionPlannerPreflight;
  /** Latest planner context pack captured before a chat run starts. */
  plannerContextPack?: YcrmContextPack;
  /** Latest learning draft generated from the persisted planner context and session transcript. */
  plannerLearningDraft?: YcrmLearningDraft;
  /** Latest EnMS planner preflight captured before a chat run starts. */
  enmsPlannerPreflight?: EnmsPlannerPreflight;
  /** Latest EnMS planner context pack captured before a chat run starts. */
  enmsPlannerContextPack?: EnmsContextPack;
  /** Latest EnMS learning draft generated from the persisted planner context and session transcript. */
  enmsPlannerLearningDraft?: EnmsLearningDraft;
  /** Latest ERP planner preflight captured before a chat run starts. */
  erpPlannerPreflight?: ErpPlannerPreflight;
  /** Latest ERP planner context pack captured before a chat run starts. */
  erpPlannerContextPack?: ErpContextPack;
  /** Latest ERP learning draft generated from the persisted planner context and session transcript. */
  erpPlannerLearningDraft?: ErpLearningDraft;
  /** Last assistant answer execution mode for quick UX verification. */
  lastAnswerMeta?: SessionExecutionTrace;
};

export function ensureDir() {
  const dir = resolveWebChatDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Read the session index, auto-discovering any orphaned .jsonl files
 * that aren't in the index (e.g. from profile switches or missing index).
 */
export function readIndex(): WebSessionMeta[] {
  const dir = ensureDir();
  const indexFile = join(dir, "index.json");
  let index: WebSessionMeta[] = [];
  if (existsSync(indexFile)) {
    try {
      index = JSON.parse(readFileSync(indexFile, "utf-8"));
    } catch {
      index = [];
    }
  }

  // Scan for orphaned .jsonl files not in the index
  try {
    const indexed = new Set(index.map((s) => s.id));
    const files = readdirSync(dir).filter((f) => f.endsWith(".jsonl"));
    let dirty = false;
    for (const file of files) {
      const id = file.replace(/\.jsonl$/, "");
      if (indexed.has(id)) {
        continue;
      }

      const fp = join(dir, file);
      const stat = statSync(fp);
      let title = "New Chat";
      let messageCount = 0;
      try {
        const content = readFileSync(fp, "utf-8");
        const lines = content.split("\n").filter((l) => l.trim());
        messageCount = lines.length;
        for (const line of lines) {
          const parsed = JSON.parse(line);
          if (parsed.role === "user" && parsed.content) {
            const text = String(parsed.content);
            title = text.length > 60 ? text.slice(0, 60) + "..." : text;
            break;
          }
        }
      } catch {
        /* best-effort */
      }

      index.push({
        id,
        title,
        createdAt: stat.birthtimeMs || stat.mtimeMs,
        updatedAt: stat.mtimeMs,
        messageCount,
      });
      dirty = true;
    }

    if (dirty) {
      index.sort((a, b) => b.updatedAt - a.updatedAt);
      writeFileSync(indexFile, JSON.stringify(index, null, 2));
    }
  } catch {
    /* best-effort */
  }

  return index;
}

export function writeIndex(sessions: WebSessionMeta[]) {
  const dir = ensureDir();
  writeFileSync(join(dir, "index.json"), JSON.stringify(sessions, null, 2));
}

/** Look up a session's pinned metadata by ID. Returns undefined for unknown sessions. */
export function getSessionMeta(sessionId: string): WebSessionMeta | undefined {
  return readIndex().find((s) => s.id === sessionId);
}

/** Resolve the effective agent ID for a session.
 *  Uses pinned metadata when available, falls back to workspace-global resolution. */
export function resolveSessionAgentId(
  sessionId: string,
  fallbackAgentId: string,
): string {
  const meta = getSessionMeta(sessionId);
  return meta?.workspaceAgentId ?? fallbackAgentId;
}

/** Effective gateway thread id (defaults to the web session id). */
export function resolveGatewayThreadId(sessionId: string): string {
  const meta = getSessionMeta(sessionId);
  return meta?.gatewaySessionId ?? sessionId;
}

/** True when the gateway thread was rotated away from the web session id (fresh gateway context). */
export function hasRotatedGatewayThread(
  meta: WebSessionMeta | undefined,
  webSessionId: string,
): boolean {
  return (
    typeof meta?.gatewaySessionId === "string" &&
    meta.gatewaySessionId !== webSessionId
  );
}

/** Allocate a new gateway thread id and persist it (same web chat id and transcript path). */
export function rotateGatewaySessionThreadForModelReset(
  webSessionId: string,
): void {
  const sessions = readIndex();
  const session = sessions.find((s) => s.id === webSessionId);
  if (!session) {
    return;
  }
  const agentId = session.workspaceAgentId ?? resolveActiveAgentId();
  const newThreadId = randomUUID();
  session.gatewaySessionId = newThreadId;
  session.gatewaySessionKey = `agent:${agentId}:web:${newThreadId}`;
  session.updatedAt = Date.now();
  writeIndex(sessions);
}

/** Resolve the gateway session key for a session. */
export function resolveSessionKey(
  sessionId: string,
  fallbackAgentId: string,
): string {
  const meta = getSessionMeta(sessionId);
  const agentId = meta?.workspaceAgentId ?? fallbackAgentId;
  const threadId = meta?.gatewaySessionId ?? sessionId;
  return `agent:${agentId}:web:${threadId}`;
}

export function updateSessionPlannerPreflight(
  sessionId: string,
  plannerPreflight: SessionPlannerPreflight,
): void {
  const sessions = readIndex();
  const session = sessions.find((entry) => entry.id === sessionId);
  if (!session) {
    return;
  }
  session.plannerPreflight = plannerPreflight;
  session.updatedAt = Date.now();
  writeIndex(sessions);
}

export function updateSessionErpPlannerPreflight(
  sessionId: string,
  plannerPreflight: ErpPlannerPreflight,
): void {
  const sessions = readIndex();
  const session = sessions.find((entry) => entry.id === sessionId);
  if (!session) {
    return;
  }
  session.erpPlannerPreflight = plannerPreflight;
  session.updatedAt = Date.now();
  writeIndex(sessions);
}

export function updateSessionEnmsPlannerPreflight(
  sessionId: string,
  plannerPreflight: EnmsPlannerPreflight,
): void {
  const sessions = readIndex();
  const session = sessions.find((entry) => entry.id === sessionId);
  if (!session) {
    return;
  }
  session.enmsPlannerPreflight = plannerPreflight;
  session.updatedAt = Date.now();
  writeIndex(sessions);
}

export function updateSessionLastAnswerMeta(
  sessionId: string,
  lastAnswerMeta: SessionExecutionTrace,
): void {
  const sessions = readIndex();
  const session = sessions.find((entry) => entry.id === sessionId);
  if (!session) {
    return;
  }
  session.lastAnswerMeta = lastAnswerMeta;
  session.updatedAt = Date.now();
  writeIndex(sessions);
}

function isTerminalLearningDraftStatus(
  status:
    | YcrmLearningDraft["writeback"]["status"]
    | EnmsLearningDraft["writeback"]["status"]
    | ErpLearningDraft["writeback"]["status"]
    | undefined,
): boolean {
  return status === "promoted" || status === "resolution_kept_current";
}

export function invalidateSessionPlannerArtifacts(
  sessionId: string,
  options?: {
    preserveReviewedLearningDraft?: boolean;
  },
): void {
  invalidateSessionYcrmPlannerArtifacts(sessionId, options);
}

export function invalidateSessionYcrmPlannerArtifacts(
  sessionId: string,
  options?: {
    preserveReviewedLearningDraft?: boolean;
  },
): void {
  const sessions = readIndex();
  const session = sessions.find((entry) => entry.id === sessionId);
  if (!session) {
    return;
  }

  const preserveReviewedLearningDraft =
    options?.preserveReviewedLearningDraft === true &&
    isTerminalLearningDraftStatus(
      session.plannerLearningDraft?.writeback?.status,
    );

  const hadPlannerArtifacts = Boolean(
    session.plannerPreflight ||
    session.plannerContextPack ||
    (!preserveReviewedLearningDraft && session.plannerLearningDraft),
  );

  if (!hadPlannerArtifacts) {
    return;
  }

  delete session.plannerPreflight;
  delete session.plannerContextPack;
  if (!preserveReviewedLearningDraft) {
    delete session.plannerLearningDraft;
  }
  session.updatedAt = Date.now();
  writeIndex(sessions);
}

export function updateSessionPlannerContextPack(
  sessionId: string,
  plannerContextPack: YcrmContextPack,
): void {
  const sessions = readIndex();
  const session = sessions.find((entry) => entry.id === sessionId);
  if (!session) {
    return;
  }
  session.plannerContextPack = plannerContextPack;
  session.updatedAt = Date.now();
  writeIndex(sessions);
}

export function updateSessionErpPlannerContextPack(
  sessionId: string,
  plannerContextPack: ErpContextPack,
): void {
  const sessions = readIndex();
  const session = sessions.find((entry) => entry.id === sessionId);
  if (!session) {
    return;
  }
  session.erpPlannerContextPack = plannerContextPack;
  session.updatedAt = Date.now();
  writeIndex(sessions);
}

export function updateSessionEnmsPlannerContextPack(
  sessionId: string,
  plannerContextPack: EnmsContextPack,
): void {
  const sessions = readIndex();
  const session = sessions.find((entry) => entry.id === sessionId);
  if (!session) {
    return;
  }
  session.enmsPlannerContextPack = plannerContextPack;
  session.updatedAt = Date.now();
  writeIndex(sessions);
}

export function updateSessionPlannerLearningDraft(
  sessionId: string,
  plannerLearningDraft: YcrmLearningDraft,
): void {
  const sessions = readIndex();
  const session = sessions.find((entry) => entry.id === sessionId);
  if (!session) {
    return;
  }
  session.plannerLearningDraft = plannerLearningDraft;
  session.updatedAt = Date.now();
  writeIndex(sessions);
}

export function updateSessionErpPlannerLearningDraft(
  sessionId: string,
  erpPlannerLearningDraft: ErpLearningDraft,
): void {
  const sessions = readIndex();
  const session = sessions.find((entry) => entry.id === sessionId);
  if (!session) {
    return;
  }
  session.erpPlannerLearningDraft = erpPlannerLearningDraft;
  session.updatedAt = Date.now();
  writeIndex(sessions);
}

export function updateSessionEnmsPlannerLearningDraft(
  sessionId: string,
  enmsPlannerLearningDraft: EnmsLearningDraft,
): void {
  const sessions = readIndex();
  const session = sessions.find((entry) => entry.id === sessionId);
  if (!session) {
    return;
  }
  session.enmsPlannerLearningDraft = enmsPlannerLearningDraft;
  session.updatedAt = Date.now();
  writeIndex(sessions);
}

export function invalidateSessionErpPlannerArtifacts(
  sessionId: string,
  options?: {
    preserveReviewedLearningDraft?: boolean;
  },
): void {
  const sessions = readIndex();
  const session = sessions.find((entry) => entry.id === sessionId);
  if (!session) {
    return;
  }

  const preserveReviewedLearningDraft =
    options?.preserveReviewedLearningDraft === true &&
    isTerminalLearningDraftStatus(
      session.erpPlannerLearningDraft?.writeback?.status,
    );

  const hadPlannerArtifacts = Boolean(
    session.erpPlannerPreflight ||
    session.erpPlannerContextPack ||
    (!preserveReviewedLearningDraft && session.erpPlannerLearningDraft),
  );

  if (!hadPlannerArtifacts) {
    return;
  }

  delete session.erpPlannerPreflight;
  delete session.erpPlannerContextPack;
  if (!preserveReviewedLearningDraft) {
    delete session.erpPlannerLearningDraft;
  }
  session.updatedAt = Date.now();
  writeIndex(sessions);
}

export function invalidateSessionEnmsPlannerArtifacts(
  sessionId: string,
  options?: {
    preserveReviewedLearningDraft?: boolean;
  },
): void {
  const sessions = readIndex();
  const session = sessions.find((entry) => entry.id === sessionId);
  if (!session) {
    return;
  }

  const preserveReviewedLearningDraft =
    options?.preserveReviewedLearningDraft === true &&
    isTerminalLearningDraftStatus(
      session.enmsPlannerLearningDraft?.writeback?.status,
    );

  const hadPlannerArtifacts = Boolean(
    session.enmsPlannerPreflight ||
    session.enmsPlannerContextPack ||
    (!preserveReviewedLearningDraft && session.enmsPlannerLearningDraft),
  );

  if (!hadPlannerArtifacts) {
    return;
  }

  delete session.enmsPlannerPreflight;
  delete session.enmsPlannerContextPack;
  if (!preserveReviewedLearningDraft) {
    delete session.enmsPlannerLearningDraft;
  }
  session.updatedAt = Date.now();
  writeIndex(sessions);
}
