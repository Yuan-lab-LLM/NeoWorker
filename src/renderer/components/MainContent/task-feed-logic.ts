import type { RefObject, MutableRefObject } from "react";
import type { TaskEvent, Task, CustomSkill } from "../../../shared/types";
import { getEffectiveTaskEventType } from "../../utils/task-event-compat";
import {
  getCompletionSummaryText,
  humanizeTimelineMessage,
} from "./task-event-presentation";
import { sanitizeToolCallTextFromAssistant } from "../../../shared/tool-call-text-sanitizer";
import {
  resolveTaskOutputSummaryFromCompletionEvent,
  hasTaskOutputs,
} from "../../utils/task-outputs";
import { localizeProgressText } from "../../utils/localized-progress-text";
import type { EndOfTaskArtifactCard } from "./artifact-logic";
import type { CommandOutputSession } from "../../utils/task-event-derived";
import { isHermesRuntimeEvent } from "../../utils/runtime-privacy";

export const STEP_WINDOW_SIZE = 7;
export const VIRTUALIZED_FEED_ROW_THRESHOLD = 18;

export type TaskFeedRow =
  | {
      kind: "execution-summary";
      key: string;
      estimatedHeight: number;
      rows: TaskFeedRow[];
      durationMs: number;
      revision: string;
      visiblePerfEventId: null;
    }
  | {
      kind: "history-control";
      key: string;
      estimatedHeight: number;
      hasMoreHistory: boolean;
      isLoading: boolean;
      error: string | null;
      revision: string;
      visiblePerfEventId: null;
    }
  | {
      kind: "leading-command-outputs";
      key: string;
      estimatedHeight: number;
      sessions: CommandOutputSession[];
      revision: string;
      visiblePerfEventId: null;
    }
  | {
      kind: "artifact-stack";
      key: string;
      estimatedHeight: number;
      artifacts: EndOfTaskArtifactCard[];
      revision: string;
      visiblePerfEventId: null;
    }
  | {
      kind: "timeline";
      key: string;
      estimatedHeight: number;
      timelineIndex: number;
      item: any;
      revision: string;
      visiblePerfEventId: string | null;
    };

export type SkillModalLaunchMode = "skill_menu" | "slash";

export type SelectedSkillModalState = {
  skill: CustomSkill;
  launchMode: SkillModalLaunchMode;
  commandName?: string;
};

export type TranscriptMode = "live" | "inspect" | "delivery";

export function shouldBypassLiveTaskEventProjection(args: {
  projectionMode?: "live" | "inspect" | null;
  transcriptModeOverride: TranscriptMode | null;
  verboseSteps: boolean;
}): boolean {
  // Both views need the conversation history; only execution details differ.
  return args.projectionMode === "live";
}

export function shouldShowChatTaskExecutionRows(args: {
  isChatTask: boolean;
  verboseSteps: boolean;
  isReplayMode: boolean;
}): boolean {
  // Chat is intentionally a conversation-only surface. Global transcript
  // verbosity and replay mode must not leak plans, tool calls, approvals, or
  // shell output back into a chat session.
  return !args.isChatTask;
}

export function shouldIncludeExecutionRecordEvents(args: {
  verboseSteps: boolean;
  isReplayMode: boolean;
}): boolean {
  return args.verboseSteps || args.isReplayMode;
}

export function getTaskFeedRowEventType(row: TaskFeedRow): string | null {
  if (row.kind === "artifact-stack" || row.kind === "history-control")
    return null;
  if (row.kind !== "timeline" || row.item.kind !== "event") return null;
  return getEffectiveTaskEventType(row.item.event as TaskEvent);
}

export function getTaskFeedRowEvent(row: TaskFeedRow): TaskEvent | null {
  if (row.kind === "artifact-stack" || row.kind === "history-control")
    return null;
  if (row.kind !== "timeline" || row.item.kind !== "event") return null;
  return row.item.event as TaskEvent;
}

function isConversationTranscriptRow(row: TaskFeedRow): boolean {
  const event = getTaskFeedRowEvent(row);
  if (!event) return false;
  const type = getEffectiveTaskEventType(event);
  if (type === "user_message" || type === "assistant_message") return true;
  return type === "task_completed" && getCompletionSummaryText(event).trim().length > 0;
}

export function getTaskFeedRowVisiblePerfEventId(
  row: TaskFeedRow,
): string | null {
  return row.visiblePerfEventId ?? null;
}

export const LIVE_TRANSCRIPT_TRANSIENT_RAW_EVENT_TYPES = new Set([
  "llm_output_budget",
  "llm_output_budget_escalation",
  "llm_output_budget_continuation",
  "llm_streaming",
]);
export const MAX_AGENT_REASONING_UPDATE_COUNT = 6;

const PROGRESS_HEARTBEAT_TEXT = {
  planning: "Understanding the request and planning...",
  search: "Searching reliable sources...",
  fetch: "Reading key material...",
  retry: "A source is responding slowly; switching or retrying...",
  synthesis: "Sources collected; preparing the conclusion...",
  analysis: "Analyzing the collected information...",
  work: "Working on the task...",
} as const;

/**
 * Derive the short, user-facing activity summary shown beside the live task
 * duration. Timeline rows remain the detailed source of truth; this helper is
 * deliberately conservative so the header never exposes tool payloads or
 * internal reasoning text.
 */
export function deriveProgressHeartbeat(
  events: TaskEvent[],
  taskId?: string | null,
  now?: number,
): string {
  const scoped = taskId ? events.filter((event) => event.taskId === taskId) : events;
  const boundary = scoped.map(getEffectiveTaskEventType).lastIndexOf("user_message");
  const current = boundary >= 0 ? scoped.slice(boundary) : scoped;
  const label = deriveCurrentProgressHeartbeat(current);
  if (!label || now === undefined) return label;
  const lastSignal = current.filter((event) => [
    "user_message", "tool_call", "tool_result", "tool_error", "progress_update",
    "llm_streaming", "step_started", "step_completed", "approval_requested",
  ].includes(getEffectiveTaskEventType(event))).at(-1);
  const silentMs = lastSignal ? now - lastSignal.timestamp : 0;
  return silentMs >= 45_000
    ? `${label} ${localizeProgressText(`No new progress for ${Math.floor(silentMs / 1000)}s`)}`
    : label;
}

function deriveCurrentProgressHeartbeat(
  events: TaskEvent[],
  taskId?: string | null,
): string {
  const scopedEvents = taskId
    ? events.filter((event) => event.taskId === taskId)
    : events;
  const hasToolActivity = scopedEvents.some((event) => {
    if (isHermesRuntimeEvent(event)) return false;
    const type = getEffectiveTaskEventType(event);
    return type === "tool_call" || type === "tool_result";
  });
  let latestUserMessageIndex = -1;
  for (let index = scopedEvents.length - 1; index >= 0; index -= 1) {
    if (getEffectiveTaskEventType(scopedEvents[index]) === "user_message") {
      latestUserMessageIndex = index;
      break;
    }
  }

  for (let index = scopedEvents.length - 1; index >= 0; index -= 1) {
    const event = scopedEvents[index];
    if (isHermesRuntimeEvent(event)) continue;
    const effectiveType = getEffectiveTaskEventType(event);
    const payload =
      event.payload &&
      typeof event.payload === "object" &&
      !Array.isArray(event.payload)
        ? (event.payload as Record<string, unknown>)
        : {};
    const payloadStatus =
      typeof payload.status === "string" ? payload.status : "";
    const isTerminalEvent =
      effectiveType === "task_completed" ||
      effectiveType === "task_failed" ||
      effectiveType === "task_cancelled" ||
      effectiveType === "task_interrupted" ||
      effectiveType === "follow_up_completed" ||
      effectiveType === "follow_up_failed" ||
      (effectiveType === "task_status" &&
        ["completed", "failed", "cancelled", "paused", "blocked", "interrupted"].includes(
          payloadStatus,
        ));
    if (isTerminalEvent) {
      // A follow-up can reuse a task that already has a terminal event. In
      // that case the newer user message starts a fresh live window.
      return latestUserMessageIndex > index
        ? localizeProgressText(PROGRESS_HEARTBEAT_TEXT.planning)
        : "";
    }
    if (effectiveType === "progress_update" && payload.phase === "model_response") {
      return localizeProgressText("The model is responding...");
    }
    const result = payload.result && typeof payload.result === "object"
      ? payload.result as Record<string, unknown> : {};
    const progress = payload.phase === "translation" ? payload
      : payload.tool === "office_translation" && effectiveType === "tool_result" ? result : null;
    if (progress && Number.isSafeInteger(progress.completed) && Number.isSafeInteger(progress.total)
      && Number(progress.total) > 0 && Number(progress.completed) >= 0
      && Number(progress.completed) <= Number(progress.total)) {
      return localizeProgressText(`Translation saved: ${progress.completed}/${progress.total} text units`);
    }
    if (effectiveType === "tool_call") {
      const tool = String(payload.tool || "");
      const labels: Record<string, string> = {
        office_translation: "Processing the translation checkpoint...",
        read_file: "Reading files...", parse_document: "Reading files...",
        run_command: "Running commands...", write_file: "Writing files...", edit_file: "Editing files...",
        create_document: "Generating the document...", generate_document: "Generating the document...",
        create_presentation: "Generating the presentation...", generate_presentation: "Generating the presentation...",
        create_spreadsheet: "Processing the spreadsheet...", generate_spreadsheet: "Processing the spreadsheet...",
      };
      if (labels[tool]) return localizeProgressText(labels[tool]);
    }
    const step =
      payload.step && typeof payload.step === "object" && !Array.isArray(payload.step)
        ? (payload.step as Record<string, unknown>)
        : {};
    const details = [
      effectiveType,
      event.type,
      payload.message,
      payload.stepDescription,
      step.description,
      payload.tool,
      payload.operation,
    ]
      .filter((value): value is string => typeof value === "string")
      .join(" ");

    if (/temporary network|network failure|retrying|响应较慢|重试/i.test(details)) {
      return localizeProgressText(PROGRESS_HEARTBEAT_TEXT.retry);
    }
    if (
      /citations_collected|all steps completed|final user-facing synthesis|terminal_synthesis|starting deliver|整理结论/i.test(
        details,
      )
    ) {
      return localizeProgressText(PROGRESS_HEARTBEAT_TEXT.synthesis);
    }
    if (/web_fetch|http_request|fetching|读取关键|抓取网页/i.test(details)) {
      return localizeProgressText(PROGRESS_HEARTBEAT_TEXT.fetch);
    }
    if (/web_search|searching web|检索|搜索/i.test(details)) {
      return localizeProgressText(PROGRESS_HEARTBEAT_TEXT.search);
    }
    if (/plan|planning|task_analysis|creating execution|analyzing task|discover/i.test(details)) {
      return localizeProgressText(PROGRESS_HEARTBEAT_TEXT.planning);
    }
    if (/llm_|tool_result|step_completed/i.test(details)) {
      return localizeProgressText(
        hasToolActivity ? PROGRESS_HEARTBEAT_TEXT.analysis : PROGRESS_HEARTBEAT_TEXT.planning,
      );
    }
    if (/executing|step_started|build|fix/i.test(details)) {
      return localizeProgressText(PROGRESS_HEARTBEAT_TEXT.work);
    }
  }

  return localizeProgressText(PROGRESS_HEARTBEAT_TEXT.planning);
}

export const LIVE_TRANSCRIPT_URGENT_EFFECTIVE_EVENT_TYPES = new Set([
  "approval_requested",
  "error",
  "input_request_created",
  "step_failed",
  "task_cancelled",
  "task_completed",
  "verification_failed",
  "verification_pending_user_action",
]);
export const LIVE_TRANSCRIPT_MAX_VISIBLE_ROWS = 12;

export function getDefaultTranscriptMode(args: {
  isTaskWorking: boolean;
  isReplayMode: boolean;
  verboseSteps: boolean;
  isChatTask: boolean;
  taskStatus?: Task["status"] | null;
}): TranscriptMode {
  if (args.isReplayMode || (args.verboseSteps && !args.isChatTask)) {
    return "inspect";
  }
  return "delivery";
}

export function selectVisibleCommandOutputSessions(args: {
  sessions: CommandOutputSession[];
  verboseSteps: boolean;
  dismissedSessionIds: ReadonlySet<string>;
}): CommandOutputSession[] {
  // Shell output is execution-record evidence, not conversation content. When
  // the user turns execution records off it must disappear with the rest of
  // the execution details instead of being promoted into standalone cards.
  if (!args.verboseSteps) return [];
  return args.sessions.filter(
    (session) =>
      session.isRunning || !args.dismissedSessionIds.has(session.id),
  );
}

export function shouldShowBootstrapProgressRow(args: {
  isTaskWorking: boolean;
  visibleRenderableFeedRowsLength: number;
  isChatTask: boolean;
}): boolean {
  return (
    args.isTaskWorking &&
    args.visibleRenderableFeedRowsLength === 0 &&
    !args.isChatTask
  );
}

export function shouldMarkActionBlockActiveForCurrentTurn(args: {
  isLatestActionBlock: boolean;
  isTaskWorking: boolean;
  isReplayMode: boolean;
  actionBlockEventIndices: number[];
  latestUserMessageEventIndex: number;
  actionBlockEvents?: TaskEvent[];
  latestUserMessageEvent?: TaskEvent | null;
}): boolean {
  if (!args.isLatestActionBlock) return false;
  if (args.isReplayMode) return true;
  if (!args.isTaskWorking) return false;
  return isActionBlockInCurrentTurn(args);
}

export function isActionBlockInCurrentTurn(args: {
  isLatestActionBlock: boolean;
  actionBlockEventIndices: number[];
  latestUserMessageEventIndex: number;
  actionBlockEvents?: TaskEvent[];
  latestUserMessageEvent?: TaskEvent | null;
}): boolean {
  if (!args.isLatestActionBlock) return false;
  if (!args.latestUserMessageEvent) {
    if (args.latestUserMessageEventIndex < 0) return true;
    return args.actionBlockEventIndices.some(
      (eventIndex) => eventIndex > args.latestUserMessageEventIndex,
    );
  }

  const latestUserMessage = args.latestUserMessageEvent;
  return (args.actionBlockEvents ?? []).some((event) => {
    if (
      typeof event.seq === "number" &&
      Number.isFinite(event.seq) &&
      typeof latestUserMessage.seq === "number" &&
      Number.isFinite(latestUserMessage.seq)
    ) {
      return event.seq > latestUserMessage.seq;
    }
    if (event.timestamp !== latestUserMessage.timestamp) {
      return event.timestamp > latestUserMessage.timestamp;
    }
    return event.id !== latestUserMessage.id;
  });
}

export function getBootstrapProgressTitle(
  task: Task | null | undefined,
): string {
  switch (task?.status) {
    case "planning":
      return "Planning the approach";
    case "executing":
      return "Thinking";
    case "interrupted":
      return "Resuming work";
    default:
      return "Thinking";
  }
}

export function isUserFacingProgressMessage(message: string): boolean {
  const trimmed = message.trim();
  if (!trimmed) return false;
  if (/^thinking(?:\.\.\.)?$/i.test(trimmed)) return false;
  if (/^executing$/i.test(trimmed)) return false;
  if (/^progress_update$/i.test(trimmed)) return false;
  return true;
}

export interface AgentReasoningPanelState {
  activeStreamText: string;
  isStreaming: boolean;
  recentUpdates: string[];
}

export function cleanAgentReasoningText(text: string): string {
  const sanitized = sanitizeToolCallTextFromAssistant(
    String(text || "")
      .replace(/\[\[speak\]\]([\s\S]*?)\[\[\/speak\]\]/gi, "$1")
      .replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, "")
      .replace(/<tool_result>[\s\S]*?<\/tool_result>/gi, ""),
  ).text;
  return sanitized.replace(/\n{3,}/g, "\n\n").trim();
}

export function isAgentReasoningStreamingEvent(event: TaskEvent): boolean {
  if (event.type === "llm_streaming") return true;
  const payload =
    event.payload &&
    typeof event.payload === "object" &&
    !Array.isArray(event.payload)
      ? (event.payload as Record<string, unknown>)
      : null;
  return (
    event.type === "timeline_step_updated" &&
    payload?.legacyType === "llm_streaming"
  );
}

export function deriveAgentReasoningPanelState(args: {
  events: TaskEvent[];
  taskId?: string | null;
  isTaskWorking: boolean;
}): AgentReasoningPanelState {
  if (!args.taskId || !args.isTaskWorking) {
    return { activeStreamText: "", isStreaming: false, recentUpdates: [] };
  }

  const recentUpdates: string[] = [];
  let lastVisibleUpdate = "";

  for (const event of args.events) {
    if (event.taskId !== args.taskId || isAgentReasoningStreamingEvent(event))
      continue;
    if (isHermesRuntimeEvent(event)) continue;
    const effectiveType = getEffectiveTaskEventType(event);
    if (
      effectiveType !== "progress_update" &&
      effectiveType !== "assistant_message"
    )
      continue;
    if (
      effectiveType === "assistant_message" &&
      event.payload?.internal === true
    )
      continue;
    const rawMessage =
      typeof event.payload?.message === "string" ? event.payload.message : "";
    if (!isUserFacingProgressMessage(rawMessage)) continue;
    const message = cleanAgentReasoningText(
      effectiveType === "progress_update"
        ? humanizeTimelineMessage(rawMessage)
        : rawMessage,
    );
    if (!message || message === lastVisibleUpdate) continue;
    lastVisibleUpdate = message;
    recentUpdates.push(message);
    if (recentUpdates.length > MAX_AGENT_REASONING_UPDATE_COUNT) {
      recentUpdates.shift();
    }
  }

  let activeStreamText = "";
  let isStreaming = false;
  for (let index = args.events.length - 1; index >= 0; index -= 1) {
    const event = args.events[index];
    if (event.taskId !== args.taskId) continue;
    if (isHermesRuntimeEvent(event)) continue;
    const effectiveType = getEffectiveTaskEventType(event);
    if (
      effectiveType === "log" ||
      effectiveType === "llm_usage" ||
      effectiveType === "command_output"
    ) {
      continue;
    }
    if (isAgentReasoningStreamingEvent(event)) {
      const rawText =
        typeof event.payload?.text === "string"
          ? event.payload.text
          : typeof event.payload?.message === "string"
            ? event.payload.message
            : "";
      const cleaned = cleanAgentReasoningText(rawText);
      if (cleaned && !/^thinking(?:\.\.\.)?$/i.test(cleaned)) {
        activeStreamText = cleaned;
        isStreaming = event.payload?.streaming === true;
      }
    }
    break;
  }

  return { activeStreamText, isStreaming, recentUpdates };
}

export function hasAgentReasoningPanelContent(
  state: AgentReasoningPanelState,
): boolean {
  return (
    state.activeStreamText.trim().length > 0 || state.recentUpdates.length > 0
  );
}

export function isTransientLiveTranscriptRow(row: TaskFeedRow): boolean {
  const event = getTaskFeedRowEvent(row);
  if (!event) return false;
  if (isHermesRuntimeEvent(event)) return true;
  if (LIVE_TRANSCRIPT_TRANSIENT_RAW_EVENT_TYPES.has(event.type)) return true;

  const effectiveType = getEffectiveTaskEventType(event);
  if (effectiveType === "executing" || effectiveType === "llm_streaming") {
    return true;
  }
  if (effectiveType !== "progress_update") return false;

  const payloadMessage =
    typeof event.payload?.message === "string" ? event.payload.message : "";
  return !isUserFacingProgressMessage(payloadMessage);
}

export function isUrgentLiveTranscriptRow(row: TaskFeedRow): boolean {
  const effectiveType = getTaskFeedRowEventType(row);
  return effectiveType
    ? LIVE_TRANSCRIPT_URGENT_EFFECTIVE_EVENT_TYPES.has(effectiveType)
    : false;
}

export function getTaskFeedRowEvents(row: TaskFeedRow): Array<{
  event: TaskEvent;
  eventIndex?: number;
  eventOrder: number;
}> {
  if (row.kind === "artifact-stack" || row.kind === "history-control")
    return [];
  if (row.kind !== "timeline") return [];
  if (row.item.kind === "event") {
    return [
      {
        event: row.item.event as TaskEvent,
        eventIndex: row.item.eventIndex,
        eventOrder: 0,
      },
    ];
  }
  if (row.item.kind !== "action_block" || !Array.isArray(row.item.events))
    return [];
  return row.item.events.map((event: TaskEvent, eventOrder: number) => ({
    event,
    eventIndex: Array.isArray(row.item.eventIndices)
      ? row.item.eventIndices[eventOrder]
      : undefined,
    eventOrder,
  }));
}

export function collectTaskFeedRowEventStream(
  feedRows: TaskFeedRow[],
): TaskEvent[] {
  return feedRows.flatMap((row) =>
    getTaskFeedRowEvents(row).map((entry) => entry.event),
  );
}

export function isDeliveryCompletionEvent(
  event: TaskEvent,
  eventStream: TaskEvent[],
): boolean {
  if (getEffectiveTaskEventType(event) !== "task_completed") return false;
  const outputSummary = resolveTaskOutputSummaryFromCompletionEvent(
    event,
    eventStream,
  );
  if (hasTaskOutputs(outputSummary)) return true;
  if (getCompletionSummaryText(event).length > 0) return true;
  return (
    event.payload?.terminalStatus === "needs_user_action" ||
    event.payload?.terminalStatus === "partial_success"
  );
}

export function isDeliveryCriticalEvent(event: TaskEvent): boolean {
  const effectiveType = getEffectiveTaskEventType(event);
  return (
    effectiveType === "error" ||
    effectiveType === "step_failed" ||
    effectiveType === "verification_failed" ||
    effectiveType === "verification_pending_user_action" ||
    effectiveType === "input_request_created" ||
    (effectiveType === "approval_requested" && event.payload?.autoApproved !== true) ||
    effectiveType === "task_paused" ||
    effectiveType === "task_cancelled" ||
    effectiveType === "task_failed" ||
    event.type === "timeline_error"
  );
}

export function isDeliveryEvent(
  event: TaskEvent,
  eventStream: TaskEvent[],
): boolean {
  return (
    isDeliveryCompletionEvent(event, eventStream) ||
    isDeliveryCriticalEvent(event)
  );
}

function isAssistantReplyDuplicatedByCompletion(
  event: TaskEvent,
  eventStream: TaskEvent[],
): boolean {
  if (getEffectiveTaskEventType(event) !== "assistant_message") return false;
  const message =
    typeof event.payload?.message === "string"
      ? event.payload.message.trim()
      : "";
  if (!message) return false;

  const eventIndex = eventStream.indexOf(event);
  if (eventIndex < 0) return false;
  for (let index = eventIndex + 1; index < eventStream.length; index += 1) {
    const candidate = eventStream[index];
    const type = getEffectiveTaskEventType(candidate);
    if (type === "user_message" || type === "assistant_message") return false;
    if (type === "task_completed") {
      return getCompletionSummaryText(candidate).trim() === message;
    }
  }
  return false;
}

export function createDeliveryEventRow(
  row: TaskFeedRow,
  event: TaskEvent,
  eventIndex: number | undefined,
  eventOrder: number,
): TaskFeedRow {
  if (row.kind === "timeline" && row.item.kind === "event") return row;
  return {
    kind: "timeline",
    key: `delivery-event:${event.id || row.key}:${eventIndex ?? eventOrder}`,
    estimatedHeight: estimateTaskFeedRowHeight({ kind: "event", event }),
    timelineIndex: row.kind === "timeline" ? row.timelineIndex : eventOrder,
    item: {
      kind: "event",
      event,
      eventIndex,
    },
    revision: `${row.revision}:${event.id}:${eventIndex ?? eventOrder}`,
    visiblePerfEventId: event.id ?? row.visiblePerfEventId,
  };
}

export function isMeaningfulLiveTranscriptRow(row: TaskFeedRow): boolean {
  if (row.kind === "history-control") return false;
  if (row.kind === "leading-command-outputs") return false;
  if (row.kind !== "timeline") return true;
  if (row.item.kind !== "event") return true;
  return !isTransientLiveTranscriptRow(row);
}

export function isUserFacingLiveStatusRow(row: TaskFeedRow): boolean {
  const event = getTaskFeedRowEvent(row);
  if (!event || isTransientLiveTranscriptRow(row)) return false;

  const effectiveType = getEffectiveTaskEventType(event);
  if (effectiveType === "step_started") return true;
  if (effectiveType !== "progress_update") return false;

  const payloadMessage =
    typeof event.payload?.message === "string" ? event.payload.message : "";
  return isUserFacingProgressMessage(payloadMessage);
}

export function selectVisibleTaskFeedRows(
  feedRows: TaskFeedRow[],
  transcriptMode: TranscriptMode,
): { visibleFeedRows: TaskFeedRow[]; hiddenLiveFeedRowCount: number } {
  const getHiddenContentRowCount = (visibleRows: TaskFeedRow[]) => {
    const totalContentRows = feedRows.filter(
      (row) => row.kind !== "history-control",
    ).length;
    const visibleContentRows = visibleRows.filter(
      (row) => row.kind !== "history-control",
    ).length;
    return Math.max(0, totalContentRows - visibleContentRows);
  };

  if (transcriptMode === "delivery") {
    const eventStream = collectTaskFeedRowEventStream(feedRows);
    const candidates: Array<{ order: number; row: TaskFeedRow }> = [];
    const pushCandidate = (order: number, row: TaskFeedRow) => {
      candidates.push({ order, row });
    };

    for (const [rowIndex, row] of feedRows.entries()) {
      if (row.kind === "artifact-stack" || row.kind === "history-control") {
        pushCandidate(rowIndex, row);
        continue;
      }
      const rowEvents = getTaskFeedRowEvents(row);
      for (const { event, eventIndex, eventOrder } of rowEvents) {
        const order = rowIndex + eventOrder / 1000;
        const effectiveType = getEffectiveTaskEventType(event);
        if (effectiveType === "llm_streaming") {
          pushCandidate(order, createDeliveryEventRow(row, event, eventIndex, eventOrder));
          continue;
        }
        // Delivery mode hides internal work, not the conversation itself. Keep
        // every follow-up question and one visible reply for each turn.
        if (effectiveType === "user_message") {
          pushCandidate(
            order,
            createDeliveryEventRow(row, event, eventIndex, eventOrder),
          );
          continue;
        }
        if (
          effectiveType === "assistant_message" &&
          event.payload?.internal !== true &&
          !isAssistantReplyDuplicatedByCompletion(event, eventStream)
        ) {
          pushCandidate(
            order,
            createDeliveryEventRow(row, event, eventIndex, eventOrder),
          );
          continue;
        }
        if (isDeliveryEvent(event, eventStream)) {
          pushCandidate(
            order,
            createDeliveryEventRow(row, event, eventIndex, eventOrder),
          );
        }
      }
    }

    const seenKeys = new Set<string>();
    const visibleFeedRows = candidates
      .sort((a, b) => a.order - b.order)
      .map((candidate) => candidate.row)
      .filter((row) => {
        if (seenKeys.has(row.key)) return false;
        seenKeys.add(row.key);
        return true;
      });

    return {
      visibleFeedRows,
      hiddenLiveFeedRowCount: getHiddenContentRowCount(visibleFeedRows),
    };
  }

  if (transcriptMode !== "live") {
    return { visibleFeedRows: feedRows, hiddenLiveFeedRowCount: 0 };
  }
  const userMessageRowCount = feedRows.filter(
    (row) => getTaskFeedRowEventType(row) === "user_message",
  ).length;
  if (feedRows.length <= 8 && userMessageRowCount <= 1) {
    const visibleFeedRows = feedRows.filter(
      (row) => row.kind !== "history-control",
    );
    return {
      visibleFeedRows,
      hiddenLiveFeedRowCount: getHiddenContentRowCount(visibleFeedRows),
    };
  }

  const keepIndexes = new Set<number>();
  // Live mode is a focused work view. Keep the current turn visible, but leave
  // older conversation turns to inspect/delivery mode so historical queries do
  // not stack above the active execution trace without their matching results.
  const currentConversationIndexes = new Set<number>();
  let latestUserMessageIndex = -1;
  for (let index = feedRows.length - 1; index >= 0; index -= 1) {
    if (getTaskFeedRowEventType(feedRows[index]) === "user_message") {
      latestUserMessageIndex = index;
      break;
    }
  }
  if (latestUserMessageIndex >= 0) {
    for (let index = latestUserMessageIndex; index < feedRows.length; index += 1) {
      if (isConversationTranscriptRow(feedRows[index])) {
        currentConversationIndexes.add(index);
        keepIndexes.add(index);
      }
    }
  }
  const keepLastMatch = (predicate: (row: TaskFeedRow, index: number) => boolean) => {
    for (let index = feedRows.length - 1; index >= 0; index -= 1) {
      if (predicate(feedRows[index], index)) {
        keepIndexes.add(index);
        return;
      }
    }
  };
  if (currentConversationIndexes.size === 0) {
    for (let index = feedRows.length - 1; index >= 0; index -= 1) {
      if (isConversationTranscriptRow(feedRows[index])) {
        currentConversationIndexes.add(index);
        keepIndexes.add(index);
        break;
      }
    }
  }

  let meaningfulRowsKept = 0;
  for (
    let index = feedRows.length - 1;
    index >= 0 && meaningfulRowsKept < 4;
    index -= 1
  ) {
    const row = feedRows[index];
    if (
      isConversationTranscriptRow(row) &&
      !currentConversationIndexes.has(index)
    ) {
      continue;
    }
    if (!isMeaningfulLiveTranscriptRow(row)) continue;
    keepIndexes.add(index);
    meaningfulRowsKept += 1;
  }

  keepLastMatch(
    (row) => row.kind === "timeline" && row.item.kind === "action_block",
  );
  keepLastMatch(
    (row, index) =>
      getTaskFeedRowEventType(row) === "assistant_message" &&
      (currentConversationIndexes.size === 0 ||
        currentConversationIndexes.has(index)),
  );
  keepLastMatch(
    (row, index) =>
      getTaskFeedRowEventType(row) === "user_message" &&
      (currentConversationIndexes.size === 0 ||
        currentConversationIndexes.has(index)),
  );
  keepLastMatch(
    (row) => row.kind === "timeline" && row.item.kind === "dispatched-agents",
  );
  keepLastMatch(
    (row) => row.kind === "timeline" && row.item.kind === "cli-agent-frame",
  );
  keepLastMatch((row) => row.kind === "timeline" && row.item.kind === "canvas");
  keepLastMatch((row) => isUserFacingLiveStatusRow(row));
  keepLastMatch((row) => isUrgentLiveTranscriptRow(row));

  const visibleIndexes = [...keepIndexes].sort((a, b) => a - b);
  const nonConversationIndexes = visibleIndexes.filter(
    (index) => !currentConversationIndexes.has(index),
  );
  const nonConversationBudget = Math.max(
    0,
    LIVE_TRANSCRIPT_MAX_VISIBLE_ROWS - currentConversationIndexes.size,
  );
  const cappedIndexes =
    nonConversationIndexes.length > nonConversationBudget
      ? [
          ...currentConversationIndexes,
          ...nonConversationIndexes.slice(-nonConversationBudget),
        ].sort((a, b) => a - b)
      : visibleIndexes;
  const cappedKeepIndexes = new Set(cappedIndexes);
  const visibleFeedRows = feedRows.filter((_, index) =>
    cappedKeepIndexes.has(index),
  );
  return {
    visibleFeedRows,
    hiddenLiveFeedRowCount: getHiddenContentRowCount(visibleFeedRows),
  };
}

/** One disclosure per settled user turn, regardless of how many retries ran. */
export function collapseSettledExecutionRows(
  feedRows: TaskFeedRow[],
  options: { isTaskWorking: boolean; isReplayMode: boolean },
): TaskFeedRow[] {
  if (options.isReplayMode) return feedRows;
  const result: TaskFeedRow[] = [];
  let turn: TaskFeedRow[] = [];
  let turnId = "initial";
  const flush = (settled: boolean) => {
    if (!settled) { result.push(...turn); turn = []; return; }
    const process: TaskFeedRow[] = [];
    const visible: TaskFeedRow[] = [];
    const eventStream = collectTaskFeedRowEventStream(turn);
    const newestFirst = [...eventStream].reverse();
    const lastCompletion = newestFirst.find((event) => getEffectiveTaskEventType(event) === "task_completed");
    const lastCritical = newestFirst.find((event) =>
      isDeliveryCriticalEvent(event) &&
      event.payload?.recoveredIntermediateFailure !== true &&
      (!lastCompletion || event.timestamp > lastCompletion.timestamp),
    );
    for (const row of turn) {
      if (row.kind === "history-control" || row.kind === "artifact-stack" ||
        isConversationTranscriptRow(row) ||
        (row.kind === "timeline" && ["canvas", "cli-agent-frame", "dispatched-agents"].includes(row.item.kind))) {
        visible.push(row);
      } else {
        process.push(row);
      }
    }
    if (lastCompletion && getCompletionSummaryText(lastCompletion).trim() &&
      !visible.some((row) => getTaskFeedRowEvent(row)?.id === lastCompletion.id)) {
      const owner = turn.find((row) => getTaskFeedRowEvents(row).some(({ event }) => event.id === lastCompletion.id));
      if (owner) visible.unshift(createDeliveryEventRow(owner, lastCompletion, undefined, 0));
    }
    if (process.length) {
      const times = eventStream.map((event) => event.timestamp).filter(Number.isFinite);
      result.push({
        kind: "execution-summary", key: `execution:${turnId}`, rows: process,
        estimatedHeight: 32, durationMs: times.length ? Math.max(...times) - Math.min(...times) : 0,
        revision: process.map((row) => `${row.key}:${row.revision}`).join("|"),
        visiblePerfEventId: null,
      });
    }
    // Surface the last unresolved problem/action even when it is nested in a
    // collapsed block. Recovered attempt failures remain inside the process.
    if (lastCritical && !visible.some((row) => getTaskFeedRowEvent(row)?.id === lastCritical.id)) {
      const owner = turn.find((row) => getTaskFeedRowEvents(row).some(({ event }) => event.id === lastCritical.id));
      if (owner) visible.push(createDeliveryEventRow(owner, lastCritical, undefined, 0));
    }
    result.push(...visible);
    turn = [];
  };
  for (const row of feedRows) {
    if (getTaskFeedRowEventType(row) === "user_message") {
      flush(true);
      result.push(row);
      turnId = row.key;
    } else if (row.kind === "history-control") {
      result.push(row);
    } else turn.push(row);
  }
  flush(!options.isTaskWorking);
  return result;
}

export function hasInactiveStringSetEntries(
  selectedIds: ReadonlySet<string>,
  activeIds: ReadonlySet<string>,
): boolean {
  for (const id of selectedIds) {
    if (!activeIds.has(id)) return true;
  }
  return false;
}

export function pruneStringSetToActiveIds(
  selectedIds: ReadonlySet<string>,
  activeIds: ReadonlySet<string>,
): Set<string> {
  const next = new Set<string>();
  for (const id of selectedIds) {
    if (activeIds.has(id)) next.add(id);
  }
  return next;
}

export function getCommandOutputSessionsRevision(
  sessions: CommandOutputSession[] | undefined,
): string {
  if (!sessions || sessions.length === 0) return "none";
  return sessions
    .map(
      (session) =>
        `${session.id}:${session.isRunning ? 1 : 0}:${session.exitCode ?? "null"}:${session.output.length}`,
    )
    .join("|");
}

export function collectInlineRunCommandSessionIds(args: {
  events: TaskEvent[];
  eventIndices: number[];
  commandOutputSessionsByInsertIndex: Map<number, CommandOutputSession[]>;
  isEventExpanded: (event: TaskEvent) => boolean;
}): Set<string> {
  const inlineRunCommandSessionIds = new Set<string>();
  for (let idx = 0; idx < args.events.length; idx++) {
    const event = args.events[idx];
    const eventIndex = args.eventIndices[idx];
    if (
      getEffectiveTaskEventType(event) === "tool_call" &&
      event.payload?.tool === "run_command" &&
      args.isEventExpanded(event)
    ) {
      for (const session of args.commandOutputSessionsByInsertIndex.get(
        eventIndex,
      ) ?? []) {
        inlineRunCommandSessionIds.add(session.id);
      }
    }
  }
  return inlineRunCommandSessionIds;
}

function getEvidenceSourceSet(event: TaskEvent): Set<string> {
  const refs = Array.isArray(event.payload?.evidenceRefs)
    ? event.payload.evidenceRefs
    : [];
  const sources = new Set<string>();
  for (const ref of refs) {
    if (!ref || typeof ref !== "object") continue;
    const source = (ref as { sourceUrlOrPath?: unknown }).sourceUrlOrPath;
    if (typeof source === "string" && source.trim().length > 0) {
      sources.add(source.trim());
    }
  }
  return sources;
}

export function isRedundantTimelineEvidenceEvent(
  event: TaskEvent,
  events: TaskEvent[],
): boolean {
  if (event.type !== "timeline_evidence_attached") return false;
  const sources = getEvidenceSourceSet(event);
  if (sources.size === 0) return false;

  const eventIndex = events.findIndex(
    (candidate) =>
      candidate === event ||
      (event.id.trim().length > 0 && candidate.id === event.id),
  );
  const previousEvents = (
    eventIndex >= 0 ? events.slice(0, eventIndex) : events
  ).filter((candidate) => candidate.type === "timeline_evidence_attached");

  for (const previousEvent of previousEvents) {
    const previousSources = getEvidenceSourceSet(previousEvent);
    if (previousSources.size < sources.size) continue;
    let covered = true;
    for (const source of sources) {
      if (!previousSources.has(source)) {
        covered = false;
        break;
      }
    }
    if (covered) return true;
  }

  return false;
}

export function estimateTaskFeedRowHeight(
  item: any,
  options?: {
    expanded?: boolean;
    visibleEventCount?: number;
    hasVisibilityToggle?: boolean;
  },
): number {
  const estimateEventHeight = (event: TaskEvent): number => {
    const effectiveType = getEffectiveTaskEventType(event);
    if (
      effectiveType === "assistant_message" ||
      effectiveType === "user_message"
    ) {
      const message =
        typeof event.payload?.message === "string" ? event.payload.message : "";
      const lineCount = message ? message.split("\n").length : 0;
      // Assistant output can contain long tables and code blocks. Keep the
      // completed-history estimate conservative so an unmeasured virtual row
      // never starts on top of the next message.
      return Math.min(
        1800,
        120 +
          Math.ceil(message.length / 110) * 28 +
          Math.min(lineCount, 80) * 12,
      );
    }

    if (
      effectiveType === "artifact_created" ||
      event.type === "timeline_artifact_emitted"
    ) {
      return 42;
    }

    if (effectiveType === "file_modified") {
      return event.payload?.oldPreview || event.payload?.newPreview ? 58 : 42;
    }

    if (effectiveType === "file_created") {
      return event.payload?.contentPreview ? 64 : 42;
    }

    return 84;
  };

  if (item.kind === "canvas") return 320;
  if (item.kind === "cli-agent-frame") return 240;
  if (item.kind === "dispatched-agents") return 220;
  if (item.kind === "action_block") {
    const expanded = options?.expanded === true;
    const visibleEventCount = Math.max(0, options?.visibleEventCount ?? 0);
    const hasVisibilityToggle = options?.hasVisibilityToggle === true;

    // Virtualized history views should estimate against the collapsed/windowed
    // action block that is actually rendered, not the raw hidden event count.
    if (!expanded) return 34;

    const headerHeight = 30;
    const controlsHeight = hasVisibilityToggle ? 28 : 0;
    const eventsHeight = visibleEventCount * 42;
    const paddingHeight = visibleEventCount > 0 ? 10 : 4;
    return Math.min(
      520,
      headerHeight + controlsHeight + eventsHeight + paddingHeight,
    );
  }

  const event = item.event as TaskEvent;
  return estimateEventHeight(event);
}

export function assignTimelineRef(
  ref: RefObject<HTMLDivElement | null> | undefined,
  node: HTMLDivElement | null,
) {
  if (!ref) return;
  (ref as MutableRefObject<HTMLDivElement | null>).current = node;
}

export function getAutoScrollTargetTop(
  scrollHeight: number,
  clientHeight: number,
): number {
  return Math.max(0, scrollHeight - clientHeight);
}

export function pinScrollElementToBottom(
  element: Pick<HTMLElement, "scrollTop" | "scrollHeight" | "clientHeight">,
): number {
  const targetTop = getAutoScrollTargetTop(
    element.scrollHeight,
    element.clientHeight,
  );
  element.scrollTop = targetTop;
  return targetTop;
}

export function shouldScheduleAutoScrollWrite(args: {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  lastTargetTop: number | null;
}): boolean {
  const targetTop = getAutoScrollTargetTop(
    args.scrollHeight,
    args.clientHeight,
  );
  const alreadyAtTarget = Math.abs(args.scrollTop - targetTop) < 2;
  return !(
    alreadyAtTarget &&
    args.lastTargetTop !== null &&
    Math.abs(args.lastTargetTop - targetTop) < 2
  );
}
