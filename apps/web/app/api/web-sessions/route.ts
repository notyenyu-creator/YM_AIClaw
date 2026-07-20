import { writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { trackServer } from "@/lib/telemetry";
import { type WebSessionMeta, ensureDir, readIndex, writeIndex } from "./shared";
import {
  getActiveWorkspaceName,
  resolveActiveAgentId,
  resolveWorkspaceDirForName,
  resolveWorkspaceRoot,
} from "@/lib/workspace";

export { type WebSessionMeta };

export const dynamic = "force-dynamic";

type LearningDraftWithWriteback = {
  writeback?: {
    status?: string;
    reviewer_actor?: string | null;
    review_reason?: string | null;
    approved_via?: string | null;
  };
};

type LearningDraftListSummary = {
  writeback?: {
    status?: string;
    reviewer_actor?: string | null;
    review_reason?: string | null;
    approved_via?: string | null;
  };
};

type WebSessionListItem = Omit<
  WebSessionMeta,
  | "plannerContextPack"
  | "plannerLearningDraft"
  | "erpPlannerContextPack"
  | "erpPlannerLearningDraft"
  | "enmsPlannerContextPack"
  | "enmsPlannerLearningDraft"
> & {
  plannerLearningDraft?: LearningDraftListSummary;
  erpPlannerLearningDraft?: LearningDraftListSummary;
  enmsPlannerLearningDraft?: LearningDraftListSummary;
};

function compactLearningDraft<T extends LearningDraftWithWriteback | undefined>(
  draft: T,
): LearningDraftListSummary | undefined {
  if (!draft?.writeback) {
    return undefined;
  }

  const { status, reviewer_actor, review_reason, approved_via } = draft.writeback;
  return {
    writeback: {
      ...(status ? { status } : {}),
      ...(reviewer_actor ? { reviewer_actor } : {}),
      ...(review_reason ? { review_reason } : {}),
      ...(approved_via ? { approved_via } : {}),
    },
  };
}

function compactSessionForList(session: WebSessionMeta): WebSessionListItem {
  return {
    id: session.id,
    title: session.title,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    messageCount: session.messageCount,
    ...(session.filePath ? { filePath: session.filePath } : {}),
    ...(session.workspaceName ? { workspaceName: session.workspaceName } : {}),
    ...(session.workspaceRoot ? { workspaceRoot: session.workspaceRoot } : {}),
    ...(session.workspaceAgentId ? { workspaceAgentId: session.workspaceAgentId } : {}),
    ...(session.chatAgentId ? { chatAgentId: session.chatAgentId } : {}),
    ...(session.gatewaySessionKey ? { gatewaySessionKey: session.gatewaySessionKey } : {}),
    ...(session.gatewaySessionId ? { gatewaySessionId: session.gatewaySessionId } : {}),
    ...(session.agentMode ? { agentMode: session.agentMode } : {}),
    ...(session.lastActiveAt ? { lastActiveAt: session.lastActiveAt } : {}),
    ...(session.plannerPreflight ? { plannerPreflight: session.plannerPreflight } : {}),
    ...(session.enmsPlannerPreflight ? { enmsPlannerPreflight: session.enmsPlannerPreflight } : {}),
    ...(session.erpPlannerPreflight ? { erpPlannerPreflight: session.erpPlannerPreflight } : {}),
    ...(session.lastAnswerMeta ? { lastAnswerMeta: session.lastAnswerMeta } : {}),
    ...(session.plannerLearningDraft
      ? { plannerLearningDraft: compactLearningDraft(session.plannerLearningDraft) }
      : {}),
    ...(session.erpPlannerLearningDraft
      ? { erpPlannerLearningDraft: compactLearningDraft(session.erpPlannerLearningDraft) }
      : {}),
    ...(session.enmsPlannerLearningDraft
      ? { enmsPlannerLearningDraft: compactLearningDraft(session.enmsPlannerLearningDraft) }
      : {}),
  };
}

/** GET /api/web-sessions — list web chat sessions.
 *  ?filePath=... → returns only sessions scoped to that file.
 *  ?includeAll=true → returns all sessions (including file-scoped).
 *  ?summary=true → returns compact metadata for sidebar lists.
 *  No filePath   → returns only global (non-file) sessions. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const filePath = url.searchParams.get("filePath");
  const includeAll = url.searchParams.get("includeAll") === "true";
  const summary = url.searchParams.get("summary") === "true";

  const all = readIndex();
  const sessions = includeAll
    ? all
    : filePath
      ? all.filter((s) => s.filePath === filePath)
      : all.filter((s) => !s.filePath);

  return Response.json({ sessions: summary ? sessions.map(compactSessionForList) : sessions });
}

/** POST /api/web-sessions — create a new web chat session */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const id = randomUUID();
  const now = Date.now();

  const workspaceName = getActiveWorkspaceName() ?? "default";
  const workspaceRoot = resolveWorkspaceRoot() ?? resolveWorkspaceDirForName(workspaceName);
  const workspaceAgentId = resolveActiveAgentId();
  const gatewaySessionKey = `agent:${workspaceAgentId}:web:${id}`;

  const session: WebSessionMeta = {
    id,
    title: body.title || "New Chat",
    createdAt: now,
    updatedAt: now,
    messageCount: 0,
    ...(body.filePath ? { filePath: body.filePath } : {}),
    workspaceName: workspaceName || undefined,
    workspaceRoot,
    workspaceAgentId,
    gatewaySessionKey,
    agentMode: "workspace",
    lastActiveAt: now,
  };

  const sessions = readIndex();
  sessions.unshift(session);
  writeIndex(sessions);

  const dir = ensureDir();
  writeFileSync(`${dir}/${id}.jsonl`, "");

  trackServer("session_created");

  return Response.json({ session });
}
