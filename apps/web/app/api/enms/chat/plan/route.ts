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

type EnmsChatPlanRequest = {
  message?: string;
  conversationId?: string | null;
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
      request: ["message", "conversationId"],
      response: [
        "strategy",
        "intent",
        "allowDbFacts",
        "allowGeneralAI",
        "primaryPageKey",
        "selectedPageKeys",
        "matchedRoutes",
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

  return Response.json(buildEnmsChatQueryPlan(message));
}
