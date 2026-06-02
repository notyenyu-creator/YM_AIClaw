import type { UIMessage } from "ai";
import {
  resolveActiveAgentId,
  resolveAgentWorkspacePrefix,
  resolveOpenClawStateDir,
  resolveWorkspaceRoot,
} from "@/lib/workspace";
import {
  startRun,
  startSubscribeRun,
  hasActiveRun,
  getActiveRun,
  subscribeToRun,
  persistUserMessage,
  persistSubscribeUserMessage,
  reactivateSubscribeRun,
  type SseEvent,
} from "@/lib/active-runs";
import type { ImageAttachment } from "@/lib/agent-runner";
import { trackServer } from "@/lib/telemetry";
import { existsSync, readFileSync } from "node:fs";
import { join, basename, extname } from "node:path";
import {
  getSessionMeta,
  hasRotatedGatewayThread,
  invalidateSessionEnmsPlannerArtifacts,
  invalidateSessionErpPlannerArtifacts,
  invalidateSessionYcrmPlannerArtifacts,
  rotateGatewaySessionThreadForModelReset,
  updateSessionEnmsPlannerContextPack,
  updateSessionEnmsPlannerPreflight,
  updateSessionErpPlannerContextPack,
  updateSessionErpPlannerPreflight,
  updateSessionPlannerContextPack,
  updateSessionPlannerPreflight,
} from "@/app/api/web-sessions/shared";
import { getAgentSession } from "@/app/api/sessions/shared";
import {
  classifyOpenAiModelSwitch,
  isLikelyOpenAiModelId,
  needsOpenAiSwitchAcknowledgement,
} from "@/lib/chat-models";
import {
  buildYcrmContext,
  createDefaultYcrmContextInput,
  shouldPersistYcrmPlannerPreflight,
  summarizeYcrmContextPlan,
  type YcrmContextBuilderInput,
  type YcrmIntent,
} from "@/lib/ycrm-context-builder";
import {
  buildYcrmContextPack,
  decorateMessageWithYcrmContextPack,
} from "@/lib/ycrm-context-pack";
import {
  buildEnmsContext,
  shouldPersistEnmsPlannerPreflight,
} from "@/lib/enms-context-builder";
import {
  buildEnmsContextPack,
  decorateMessageWithEnmsContextPack,
} from "@/lib/enms-context-pack";
import {
  buildErpContext,
  shouldPersistErpPlannerPreflight,
} from "@/lib/erp-context-builder";
import {
  buildErpContextPack,
  decorateMessageWithErpContextPack,
} from "@/lib/erp-context-pack";
import {
  buildRollingChatContext,
  decorateMessageWithRollingContext,
} from "@/lib/chat-rolling-context";
import {
  buildDomainBootstrapSnapshot,
  decorateMessageWithDomainBootstrapSnapshot,
} from "@/lib/domain-bootstrap";

export const runtime = "nodejs";

const IMAGE_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".bmp",
  ".heic",
  ".tiff",
]);

const EXT_TO_MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".heic": "image/heic",
  ".tiff": "image/tiff",
};

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB per image

function extractImageAttachmentsFromMessage(text: string): ImageAttachment[] {
  const match = text.match(/\[Attached files: (.+?)\]/);
  if (!match) return [];
  const workspaceRoot = resolveWorkspaceRoot();
  const paths = match[1]
    .split(", ")
    .map((p) => p.trim())
    .filter(Boolean);
  const attachments: ImageAttachment[] = [];
  for (const filePath of paths) {
    const ext = extname(filePath).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(ext)) continue;
    const absPath = filePath.startsWith("/")
      ? filePath
      : workspaceRoot
        ? join(workspaceRoot, filePath)
        : filePath;
    if (!existsSync(absPath)) continue;
    try {
      const data = readFileSync(absPath);
      if (data.length > MAX_IMAGE_BYTES) continue;
      attachments.push({
        content: data.toString("base64"),
        mimeType: EXT_TO_MIME[ext] ?? "application/octet-stream",
        fileName: basename(filePath),
      });
    } catch {
      // skip unreadable files
    }
  }
  return attachments;
}

function extractTextParts(message: UIMessage | undefined): string {
  if (!message?.parts) {
    return "";
  }
  return message.parts
    .filter(
      (part): part is { type: "text"; text: string } => part.type === "text",
    )
    .map((part) => part.text)
    .join("\n")
    .trim();
}

function shouldAugmentPlannerMessageWithFollowupContext(
  currentUserText: string,
  previousUserText: string,
): boolean {
  const current = currentUserText.trim();
  const previous = previousUserText.trim();

  if (!current || !previous) {
    return false;
  }

  const currentLower = current.toLowerCase();
  const referencesYcrmDirectly =
    currentLower.includes("y-crm") || currentLower.includes("ycrm");
  const referencesChartOrExpansion = [
    "圖表",
    "chart",
    "全部",
    "完整",
    "展開",
    "更多",
    "明細",
    "細節",
    "用圖",
    "畫圖",
    "分布",
    "總數",
    "金額",
    "件數",
  ].some((keyword) => currentLower.includes(keyword.toLowerCase()));

  const shortFollowup = current.length <= 80;
  return !referencesYcrmDirectly && shortFollowup && referencesChartOrExpansion;
}

function shouldReusePriorYcrmScope(currentUserText: string): boolean {
  const current = currentUserText.trim().toLowerCase();
  if (!current) {
    return false;
  }

  return [
    "y-crm",
    "ycrm",
    "客戶",
    "公司",
    "聯絡人",
    "商機",
    "業務",
    "背景",
    "名單",
    "圖表",
    "chart",
    "報表",
    "分布",
    "pipeline",
    "line",
  ].some((keyword) => current.includes(keyword));
}

function isLikelyChartRequest(userText: string): boolean {
  const current = userText.trim().toLowerCase();
  if (!current) {
    return false;
  }

  return [
    "圖表",
    "chart",
    "報表",
    "長條圖",
    "折線圖",
    "圓餅圖",
    "趨勢圖",
    "測試圖表",
    "測試 chart",
  ].some((keyword) => current.includes(keyword.toLowerCase()));
}

function decorateMessageWithGenericChartGuardrail(userMessage: string): string {
  const lines = [
    "[Generic Chart Guardrail]",
    "If you render a report-json block, each panel must contain either a valid sql string or inline rows/data.",
    "If this is only a chart-render test, prefer inline rows/data or a VALUES-based sql block with 2-5 sample rows.",
    "Do not emit a report-json panel with missing sql and missing rows/data.",
    "If you cannot form a valid chart payload, explain the limitation in plain text instead of emitting a broken chart.",
    "[/Generic Chart Guardrail]",
  ];

  return `${userMessage}\n\n${lines.join("\n")}`;
}

function coercePriorYcrmIntent(value: string): YcrmIntent | null {
  const supportedIntents = new Set<YcrmIntent>([
    "product_help",
    "entity_summary",
    "opportunity_analysis",
    "line_interaction_review",
    "sales_report",
    "write_intent",
    "cross_system_request",
    "unknown",
  ]);

  return supportedIntents.has(value as YcrmIntent)
    ? (value as YcrmIntent)
    : null;
}

function buildPlannerInputFromSession(
  agentMessage: string,
  messages: UIMessage[],
  sessionMeta: ReturnType<typeof getSessionMeta>,
): YcrmContextBuilderInput {
  const input = createDefaultYcrmContextInput(agentMessage);
  const priorPreflight = sessionMeta?.plannerPreflight;

  if (priorPreflight?.system !== "ycrm" || !priorPreflight.shouldRouteToYcrm) {
    return input;
  }

  const previousUserMessage = [...messages]
    .slice(0, -1)
    .reverse()
    .find((message) => message.role === "user");
  const previousUserText = extractTextParts(previousUserMessage);
  const shouldAugmentWithPrevious =
    shouldAugmentPlannerMessageWithFollowupContext(
      agentMessage,
      previousUserText,
    );

  if (!shouldReusePriorYcrmScope(agentMessage) && !shouldAugmentWithPrevious) {
    return input;
  }

  input.request.current_system_hint = "ycrm";
  input.request.requested_workspace = priorPreflight.workspaceId ?? null;
  input.request.prior_intent_hint = coercePriorYcrmIntent(
    priorPreflight.intent,
  );

  if (
    priorPreflight.workspaceId &&
    !input.runtime_state.available_auto_schema_workspaces.includes(
      priorPreflight.workspaceId,
    )
  ) {
    input.runtime_state.available_auto_schema_workspaces.push(
      priorPreflight.workspaceId,
    );
  }

  if (shouldAugmentWithPrevious) {
    input.request.user_message = [
      "[Session follow-up context]",
      previousUserText,
      "[/Session follow-up context]",
      agentMessage,
    ].join("\n");
  }

  return input;
}

function deriveSubagentInfo(
  sessionKey: string,
): { parentSessionId: string; task: string } | null {
  const registryPath = join(
    resolveOpenClawStateDir(),
    "subagents",
    "runs.json",
  );
  if (!existsSync(registryPath)) {
    return null;
  }
  try {
    const raw = JSON.parse(readFileSync(registryPath, "utf-8")) as {
      runs?: Record<string, Record<string, unknown>>;
    };
    for (const entry of Object.values(raw.runs ?? {})) {
      if (entry.childSessionKey !== sessionKey) {
        continue;
      }
      const requester =
        typeof entry.requesterSessionKey === "string"
          ? entry.requesterSessionKey
          : "";
      const match = requester.match(/^agent:[^:]+:web:(.+)$/);
      const parentSessionId = match?.[1] ?? "";
      const task = typeof entry.task === "string" ? entry.task : "";
      return { parentSessionId, task };
    }
  } catch {
    // ignore
  }
  return null;
}

function normalizeLiveStreamEvent(event: SseEvent): SseEvent | null {
  // `user-message` events are internal bookkeeping for the reconnection
  // stream parser — they are not part of the AI SDK v6 wire format and
  // will fail validation in DefaultChatTransport.  Filter them out.
  if (event.type === "user-message") {
    return null;
  }

  // AI SDK's UI stream schema does not define `tool-output-partial`.
  // It expects repeated `tool-output-available` chunks with
  // `preliminary: true` while the tool is still running.
  if (event.type === "tool-output-partial") {
    return {
      type: "tool-output-available",
      toolCallId: event.toolCallId,
      output: event.output,
      preliminary: true,
    };
  }

  return event;
}

export async function POST(req: Request) {
  const {
    messages,
    sessionId,
    sessionKey,
    distinctId,
    userHtml,
    modelOverride,
    acknowledgeUnsafeOpenAiSwitch,
    hasAssistantHistory: hasAssistantHistoryHint,
  }: {
    messages: UIMessage[];
    sessionId?: string;
    sessionKey?: string;
    distinctId?: string;
    userHtml?: string;
    modelOverride?: string;
    acknowledgeUnsafeOpenAiSwitch?: boolean;
    hasAssistantHistory?: boolean;
  } = await req.json();

  const lastUserMessage = messages.filter((m) => m.role === "user").pop();
  const userText =
    lastUserMessage?.parts
      ?.filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join("\n") ?? "";

  if (!userText.trim()) {
    return new Response("No message provided", { status: 400 });
  }

  trackServer(
    "chat_message_sent",
    {
      message_length: userText.length,
      is_subagent:
        typeof sessionKey === "string" && sessionKey.includes(":subagent:"),
    },
    distinctId,
  );

  const isSubagentSession =
    typeof sessionKey === "string" && sessionKey.includes(":subagent:");
  const normalizedModelOverride =
    typeof modelOverride === "string" && modelOverride.trim()
      ? modelOverride.trim()
      : undefined;

  if (
    sessionId &&
    normalizedModelOverride &&
    isLikelyOpenAiModelId(normalizedModelOverride) &&
    !isSubagentSession
  ) {
    const hasAssistantHistory =
      hasAssistantHistoryHint ?? messages.some((m) => m.role === "assistant");
    const runtimeSession = getAgentSession(sessionId);
    const meta = getSessionMeta(sessionId);
    const kind = classifyOpenAiModelSwitch({
      sessionModel: runtimeSession?.model ?? null,
      sessionModelProvider: runtimeSession?.modelProvider ?? null,
      targetModel: normalizedModelOverride,
    });
    const alreadyReset = hasRotatedGatewayThread(meta, sessionId);
    const needsAck =
      !alreadyReset &&
      needsOpenAiSwitchAcknowledgement(kind, hasAssistantHistory);

    if (needsAck && !acknowledgeUnsafeOpenAiSwitch) {
      return Response.json(
        {
          code: "openai_unsafe_switch",
          message:
            "Switching this chat to ChatGPT can invalidate earlier tool-call history from other models. Confirm below to continue with a fresh model context for this thread.",
        },
        { status: 409 },
      );
    }
    if (needsAck && acknowledgeUnsafeOpenAiSwitch) {
      rotateGatewaySessionThreadForModelReset(sessionId);
    }
  }

  if (!isSubagentSession && sessionId && hasActiveRun(sessionId)) {
    return new Response("Active run in progress", { status: 409 });
  }
  if (isSubagentSession && sessionKey) {
    const existingRun = getActiveRun(sessionKey);
    if (existingRun?.status === "running") {
      return new Response("Active subagent run in progress", { status: 409 });
    }
  }

  let agentMessage = userText;
  const wsPrefix = resolveAgentWorkspacePrefix();
  if (wsPrefix) {
    agentMessage = userText.replace(
      /\[Context: workspace file '([^']+)'\]/,
      `[Context: workspace file '${wsPrefix}/$1']`,
    );
  }

  const runKey =
    isSubagentSession && sessionKey ? sessionKey : (sessionId as string);

  if (isSubagentSession && sessionKey && lastUserMessage) {
    let run = getActiveRun(sessionKey);
    if (!run) {
      const info = deriveSubagentInfo(sessionKey);
      if (!info) {
        return new Response("Subagent not found", { status: 404 });
      }
      run = startSubscribeRun({
        sessionKey,
        parentSessionId: info.parentSessionId,
        task: info.task,
      });
    }
    await persistSubscribeUserMessage(sessionKey, {
      id: lastUserMessage.id,
      text: userText,
    });
    reactivateSubscribeRun(sessionKey, agentMessage);
  } else if (sessionId && lastUserMessage) {
    await persistUserMessage(sessionId, {
      id: lastUserMessage.id,
      content: userText,
      parts: lastUserMessage.parts as unknown[],
      html: userHtml,
    });

    const sessionMeta = getSessionMeta(sessionId);
    const effectiveAgentId =
      sessionMeta?.workspaceAgentId ?? resolveActiveAgentId();
    const gatewayThreadId = sessionMeta?.gatewaySessionId ?? sessionId;
    const ycrmPlannerInput = buildPlannerInputFromSession(
      agentMessage,
      messages,
      sessionMeta,
    );
    const ycrmPlannerPlan = buildYcrmContext(ycrmPlannerInput);
    const ycrmPlannerSummary = summarizeYcrmContextPlan(ycrmPlannerPlan);
    const ycrmContextPack = buildYcrmContextPack(ycrmPlannerPlan);

    if (shouldPersistYcrmPlannerPreflight(ycrmPlannerSummary)) {
      updateSessionPlannerPreflight(sessionId, ycrmPlannerSummary);
      updateSessionPlannerContextPack(sessionId, ycrmContextPack);
      invalidateSessionErpPlannerArtifacts(sessionId, {
        preserveReviewedLearningDraft: true,
      });
      invalidateSessionEnmsPlannerArtifacts(sessionId, {
        preserveReviewedLearningDraft: true,
      });
    } else {
      invalidateSessionYcrmPlannerArtifacts(sessionId, {
        preserveReviewedLearningDraft: true,
      });
    }

    if (ycrmPlannerSummary.shouldRouteToYcrm) {
      agentMessage = decorateMessageWithYcrmContextPack(
        agentMessage,
        ycrmContextPack,
      );
      const ycrmBootstrapSnapshot = await buildDomainBootstrapSnapshot({
        system: "ycrm",
        userMessage: userText,
        pack: ycrmContextPack,
      });
      agentMessage = decorateMessageWithDomainBootstrapSnapshot(
        agentMessage,
        ycrmBootstrapSnapshot,
      );
    }

    // ERP routing: only attempt when Y-CRM did not claim the message.
    // This keeps the system mutually exclusive at the routing layer
    // while still letting future cross-system flows pull multiple
    // source-of-truth systems in explicitly.
    let routedToErp = false;
    let routedToEnms = false;

    if (!ycrmPlannerSummary.shouldRouteToYcrm) {
      const erpPreflight = buildErpContext({
        request: { user_message: agentMessage },
      });
      if (shouldPersistErpPlannerPreflight(erpPreflight)) {
        routedToErp = true;
        const erpContextPack = buildErpContextPack(erpPreflight);
        updateSessionErpPlannerPreflight(sessionId, erpPreflight);
        updateSessionErpPlannerContextPack(sessionId, erpContextPack);
        invalidateSessionEnmsPlannerArtifacts(sessionId, {
          preserveReviewedLearningDraft: true,
        });
        agentMessage = decorateMessageWithErpContextPack(
          agentMessage,
          erpContextPack,
        );
        const erpBootstrapSnapshot = await buildDomainBootstrapSnapshot({
          system: "erp",
          userMessage: userText,
          pack: erpContextPack,
        });
        agentMessage = decorateMessageWithDomainBootstrapSnapshot(
          agentMessage,
          erpBootstrapSnapshot,
        );
      } else {
        invalidateSessionErpPlannerArtifacts(sessionId, {
          preserveReviewedLearningDraft: true,
        });

        const enmsPreflight = buildEnmsContext({
          request: { user_message: agentMessage },
        });
        if (shouldPersistEnmsPlannerPreflight(enmsPreflight)) {
          routedToEnms = true;
          const enmsContextPack = buildEnmsContextPack(enmsPreflight);
          updateSessionEnmsPlannerPreflight(sessionId, enmsPreflight);
          updateSessionEnmsPlannerContextPack(sessionId, enmsContextPack);
          agentMessage = decorateMessageWithEnmsContextPack(
            agentMessage,
            enmsContextPack,
          );
          const enmsBootstrapSnapshot = await buildDomainBootstrapSnapshot({
            system: "enms",
            userMessage: userText,
            pack: enmsContextPack,
          });
          agentMessage = decorateMessageWithDomainBootstrapSnapshot(
            agentMessage,
            enmsBootstrapSnapshot,
          );
        } else {
          invalidateSessionEnmsPlannerArtifacts(sessionId, {
            preserveReviewedLearningDraft: true,
          });
        }
      }
    }

    if (
      isLikelyChartRequest(userText) &&
      !ycrmPlannerSummary.shouldRouteToYcrm &&
      !routedToErp &&
      !routedToEnms
    ) {
      agentMessage = decorateMessageWithGenericChartGuardrail(agentMessage);
    }

    const rollingContext = buildRollingChatContext(messages, userText);
    agentMessage = decorateMessageWithRollingContext(
      agentMessage,
      rollingContext,
    );

    const imageAttachments = extractImageAttachmentsFromMessage(agentMessage);

    try {
      startRun({
        sessionId,
        message: agentMessage,
        agentSessionId: gatewayThreadId,
        overrideAgentId: effectiveAgentId,
        modelOverride: normalizedModelOverride,
        imageAttachments:
          imageAttachments.length > 0 ? imageAttachments : undefined,
      });
    } catch (err) {
      return new Response(err instanceof Error ? err.message : String(err), {
        status: 500,
      });
    }
  }

  const encoder = new TextEncoder();
  let closed = false;
  let unsubscribe: (() => void) | null = null;
  let keepalive: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      if (!runKey) {
        controller.close();
        return;
      }

      keepalive = setInterval(() => {
        if (closed) {
          return;
        }
        try {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch {
          /* ignore enqueue errors on closed stream */
        }
      }, 15_000);

      unsubscribe = subscribeToRun(
        runKey,
        (event: SseEvent | null) => {
          if (closed) {
            return;
          }
          if (event === null) {
            closed = true;
            if (keepalive) {
              clearInterval(keepalive);
              keepalive = null;
            }
            try {
              controller.close();
            } catch {
              /* already closed */
            }
            return;
          }
          try {
            const normalized = normalizeLiveStreamEvent(event);
            if (normalized) {
              const json = JSON.stringify(normalized);
              controller.enqueue(encoder.encode(`data: ${json}\n\n`));
            }
          } catch {
            /* ignore */
          }
        },
        { replay: true },
      );

      if (!unsubscribe) {
        closed = true;
        if (keepalive) {
          clearInterval(keepalive);
          keepalive = null;
        }
        controller.close();
      }
    },
    cancel() {
      closed = true;
      if (keepalive) {
        clearInterval(keepalive);
        keepalive = null;
      }
      unsubscribe?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
