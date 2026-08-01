import { timingSafeEqual } from "crypto";

import {
  buildEnmsChatQueryPlan,
  ENMS_CHAT_PLAN_CONTRACT_VERSION,
  ENMS_CAPABILITY_REGISTRY_VERSION,
} from "@/lib/enms-capability-registry";
import { getEnmsS2sApiKey } from "@/lib/enms-s2s-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_MESSAGE_LENGTH = 2000;
const MAX_HISTORY_ITEMS = 4;
const MAX_HISTORY_CONTENT_LENGTH = 600;

type EnmsChatPlanRequest = {
  message?: string;
  conversationId?: string | null;
  history?: EnmsChatPlanHistoryItem[];
};

type EnmsChatPlanHistoryItem = {
  role?: string;
  content?: string;
};

function isAuthorized(req: Request): boolean {
  const expected = getEnmsS2sApiKey();
  if (!expected) {
    return false;
  }

  const match = (req.headers.get("authorization") ?? "").match(
    /^Bearer\s+(.+)$/i,
  );
  const actual = match?.[1] ?? "";
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);

  return (
    expectedBuffer.length === actualBuffer.length &&
    timingSafeEqual(expectedBuffer, actualBuffer)
  );
}

function trimText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") {
    return "";
  }

  const text = value.trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function normalizeHistory(history: unknown): EnmsChatPlanHistoryItem[] {
  if (!Array.isArray(history)) {
    return [];
  }

  return history
    .map((item): EnmsChatPlanHistoryItem | null => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const record = item as Record<string, unknown>;
      const role = trimText(record.role, 20);
      const content = trimText(record.content, MAX_HISTORY_CONTENT_LENGTH);
      if (!role || !content) {
        return null;
      }
      return {
        role: role === "assistant" ? "assistant" : "user",
        content,
      };
    })
    .filter((item): item is EnmsChatPlanHistoryItem => item !== null)
    .slice(-MAX_HISTORY_ITEMS);
}

function isContextualFollowUpQuestion(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  if (
    /什麼是|是什麼|何謂|定義|概念|what is|definition|meaning/i.test(
      normalized,
    )
  ) {
    return false;
  }

  const asksPresentation =
    /圖表|圖形|畫成圖|用圖|長條圖|折線圖|排行榜|排名圖|表格|整理成表|chart|graph|visual/i
      .test(normalized);
  const hasFollowUpMarker =
    /^(那|這|上面|剛剛|前面|上一題|上一個|同樣|也|再|順便|可以|請|麻煩)/i
      .test(normalized) ||
    /呢|也|再|補|呈現|整理|轉成|換成/i.test(normalized);

  return asksPresentation && (normalized.length <= 80 || hasFollowUpMarker);
}

function buildPlannerMessage(
  message: string,
  history: EnmsChatPlanHistoryItem[],
): string {
  if (!isContextualFollowUpQuestion(message) || history.length === 0) {
    return message;
  }

  const conversationContext = history
    .map((item) => `${item.role === "assistant" ? "assistant" : "user"}: ${item.content}`)
    .join("\n");

  return [
    "[Conversation Context]",
    conversationContext,
    "[/Conversation Context]",
    message,
  ].join("\n");
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  return Response.json({
    ok: true,
    adapter: "enms-ai-assistant-chat-planner",
    contract: {
      contractVersion: ENMS_CHAT_PLAN_CONTRACT_VERSION,
      registryVersion: ENMS_CAPABILITY_REGISTRY_VERSION,
      request: ["message", "conversationId", "history"],
      response: [
        "strategy",
        "intent",
        "selectedCapabilities",
        "allowDbFacts",
        "allowGeneralAI",
        "needClarification",
        "primaryPageKey",
        "selectedPageKeys",
        "matchedRoutes",
        "answerObligations",
      ],
    },
    security: {
      apiKeyPolicy: "required",
      dataPolicy:
        "planner only; does not query EnMS DB, DuckDB, semantic views, or external tools",
    },
  });
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: EnmsChatPlanRequest;
  try {
    body = (await req.json()) as EnmsChatPlanRequest;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const message = trimText(body.message, MAX_MESSAGE_LENGTH);
  if (!message) {
    return Response.json({ error: "Missing 'message' field" }, { status: 400 });
  }

  const history = normalizeHistory(body.history);
  return Response.json(buildEnmsChatQueryPlan(buildPlannerMessage(message, history)));
}
