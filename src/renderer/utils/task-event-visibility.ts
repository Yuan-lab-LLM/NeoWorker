import type { EventType, TaskEvent, TaskStatus } from "../../shared/types";
import {
  getEffectiveTaskEventType,
  getTimelineErrorText,
} from "./task-event-compat";
import { hasAssistantMediaDirective } from "./assistant-media-directives";
import { isUserVisibleTaskArtifactPath } from "./task-artifact-visibility";

export const IMPORTANT_EVENT_TYPES: EventType[] = [
  "task_created",
  "task_completed",
  "follow_up_completed",
  "task_cancelled",
  "plan_created",
  "step_started",
  "step_completed",
  "step_failed",
  "assistant_message",
  "user_message",
  "file_created",
  "file_modified",
  "file_deleted",
  "artifact_created",
  "diagram_created",
  "citations_collected",
  "error",
  "verification_started",
  "verification_passed",
  "verification_failed",
  "verification_pending_user_action",
  "retry_started",
  "auto_continuation_started",
  "auto_continuation_blocked",
  "context_compaction_started",
  "context_compaction_completed",
  "context_compaction_failed",
  "no_progress_circuit_breaker",
  "step_contract_escalated",
  "approval_requested",
  "input_request_created",
  "input_request_resolved",
  "input_request_dismissed",
  "task_list_created",
  "task_list_updated",
  "task_list_verification_nudged",
];

export const ALWAYS_VISIBLE_TECHNICAL_EVENT_TYPES: ReadonlySet<EventType> =
  new Set([
    "approval_requested",
    "approval_granted",
    "approval_denied",
    "input_request_created",
    "input_request_resolved",
    "input_request_dismissed",
    "error",
    "step_failed",
    "verification_failed",
    "verification_pending_user_action",
    "auto_continuation_started",
    "auto_continuation_blocked",
    "context_compaction_started",
    "context_compaction_completed",
    "context_compaction_failed",
    "no_progress_circuit_breaker",
    "step_contract_escalated",
    "task_completed",
    "artifact_created",
    "diagram_created",
    "task_list_created",
    "task_list_updated",
    "task_list_verification_nudged",
    "timeline_group_started",
    "timeline_group_finished",
    "timeline_evidence_attached",
    "timeline_artifact_emitted",
    "timeline_error",
  ]);

const SUMMARY_HIDDEN_STAGE_NAMES = new Set([
  "DISCOVER",
  "BUILD",
  "VERIFY",
  "FIX",
  "DELIVER",
]);
const SUMMARY_HIDDEN_STAGE_GROUP_IDS = new Set([
  "stage:discover",
  "stage:build",
  "stage:verify",
  "stage:fix",
  "stage:deliver",
]);
const TERMINAL_TASK_STATUSES = new Set<TaskStatus>([
  "completed",
  "failed",
  "cancelled",
  "interrupted",
]);
const FINAL_REPLY_STAGE_SUPPRESSION_WINDOW_MS = 120_000;
const SUMMARY_HIDDEN_GROUP_ID_PREFIXES = ["tools:"];

function isInjectedContextStepFailure(event: TaskEvent): boolean {
  if (getEffectiveTaskEventType(event) !== "step_failed") return false;

  const step = event.payload?.step;
  const description =
    step &&
    typeof step === "object" &&
    typeof (step as Record<string, unknown>).description === "string"
      ? (step as Record<string, string>).description.trim()
      : "";
  const reason = [
    event.payload?.reason,
    event.payload?.error,
    step && typeof step === "object"
      ? (step as Record<string, unknown>).error
      : "",
  ]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();

  // Older sessions can contain a relationship-memory line that a model copied
  // into the plan. It is not an executable step, and its file names should not
  // be shown as an artifact failure in the task timeline.
  return (
    /^completed task\s*:/i.test(description) &&
    /artifact reference\/presence/.test(reason)
  );
}
const SUMMARY_HIDDEN_GROUP_LABEL_PATTERN = /\b(?:follow-up\s+)?tool\s+batch\b/i;

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function getPayloadText(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  return typeof value === "string" ? value.trim() : "";
}

export function isLlmRequestCancelledEvent(event: TaskEvent): boolean {
  const payload = asObject(event.payload);
  const message = [
    event.type === "timeline_error" ? getTimelineErrorText(event) : "",
    getPayloadText(payload, "message"),
    getPayloadText(payload, "error"),
    getPayloadText(payload, "reason"),
    getPayloadText(payload, "details"),
  ]
    .filter(Boolean)
    .join(" ");
  if (!/\brequest\s+cancell?ed\b/i.test(message)) return false;

  const effectiveType = getEffectiveTaskEventType(event);
  const legacyType =
    typeof event.legacyType === "string"
      ? event.legacyType
      : typeof payload.legacyType === "string"
        ? payload.legacyType
        : "";

  return (
    effectiveType === "llm_error" ||
    legacyType === "llm_error" ||
    /\bllm\s+api\s+error\b/i.test(message)
  );
}

function getTimelineGroupPayload(event: TaskEvent): Record<string, unknown> {
  return asObject(event.payload);
}

function getTimelineGroupId(event: TaskEvent): string {
  const payload = getTimelineGroupPayload(event);
  const fromEvent =
    typeof event.groupId === "string" ? event.groupId.trim() : "";
  if (fromEvent.length > 0) return fromEvent;
  return typeof payload.groupId === "string" ? payload.groupId.trim() : "";
}

function getTimelineGroupLabel(event: TaskEvent): string {
  const payload = getTimelineGroupPayload(event);
  return typeof payload.groupLabel === "string"
    ? payload.groupLabel.trim()
    : "";
}

function isSubStageTimelineGroupEvent(event: TaskEvent): boolean {
  const payload = getTimelineGroupPayload(event);
  const stage =
    typeof payload.stage === "string" ? payload.stage.trim().toUpperCase() : "";
  const groupLabel = getTimelineGroupLabel(event);
  return Boolean(stage && groupLabel && groupLabel.toUpperCase() !== stage);
}

function isStageBoundaryTimelineGroupEvent(event: TaskEvent): boolean {
  if (
    event.type !== "timeline_group_started" &&
    event.type !== "timeline_group_finished"
  ) {
    return false;
  }

  const payload = getTimelineGroupPayload(event);

  const stage = typeof payload.stage === "string" ? payload.stage.trim().toUpperCase() : "";
  if (stage && SUMMARY_HIDDEN_STAGE_NAMES.has(stage)) {
    return true;
  }

  const groupIdRaw = getTimelineGroupId(event);
  const normalizedGroupId =
    typeof groupIdRaw === "string" ? groupIdRaw.trim().toLowerCase() : "";
  return (
    normalizedGroupId.length > 0 &&
    SUMMARY_HIDDEN_STAGE_GROUP_IDS.has(normalizedGroupId)
  );
}

function isTerminalTaskStatus(taskStatus?: TaskStatus): boolean {
  return Boolean(taskStatus && TERMINAL_TASK_STATUSES.has(taskStatus));
}

function isDeliverStageBoundaryTimelineGroupEvent(event: TaskEvent): boolean {
  if (!isStageBoundaryTimelineGroupEvent(event)) return false;
  const payload = getTimelineGroupPayload(event);
  const stage =
    typeof payload.stage === "string" ? payload.stage.trim().toUpperCase() : "";
  if (stage === "DELIVER") return true;
  return getTimelineGroupId(event).trim().toLowerCase() === "stage:deliver";
}

function isUserFacingFinalReplyEvent(event: TaskEvent): boolean {
  const effectiveType = getEffectiveTaskEventType(event);
  if (
    effectiveType === "task_completed" ||
    effectiveType === "follow_up_completed"
  ) {
    return true;
  }
  if (effectiveType !== "assistant_message") return false;
  const payload = asObject(event.payload);
  const message = typeof payload.message === "string" ? payload.message : "";
  return payload.internal !== true || hasAssistantMediaDirective(message);
}

function buildFinalReplyTimestampsByTask(
  events: TaskEvent[],
): Map<string, number[]> {
  const out = new Map<string, number[]>();
  for (const event of events) {
    if (!isUserFacingFinalReplyEvent(event)) continue;
    const timestamp = typeof event.timestamp === "number" ? event.timestamp : 0;
    const list = out.get(event.taskId) ?? [];
    list.push(timestamp);
    out.set(event.taskId, list);
  }
  return out;
}

function hasFinalReplyNearOrAfter(
  event: TaskEvent,
  finalReplyTimestampsByTask: Map<string, number[]>,
): boolean {
  const timestamps = finalReplyTimestampsByTask.get(event.taskId);
  if (!timestamps?.length) return false;
  const eventTimestamp =
    typeof event.timestamp === "number" ? event.timestamp : 0;
  return timestamps.some((timestamp) => {
    if (timestamp >= eventTimestamp) return true;
    return (
      eventTimestamp - timestamp <= FINAL_REPLY_STAGE_SUPPRESSION_WINDOW_MS
    );
  });
}

function isToolBatchTimelineGroupEvent(event: TaskEvent): boolean {
  if (
    event.type !== "timeline_group_started" &&
    event.type !== "timeline_group_finished"
  ) {
    return false;
  }

  const groupId = getTimelineGroupId(event).toLowerCase();
  if (groupId.length > 0) {
    for (const prefix of SUMMARY_HIDDEN_GROUP_ID_PREFIXES) {
      if (groupId.startsWith(prefix)) return true;
    }
  }

  const groupLabel = getTimelineGroupLabel(event);
  return SUMMARY_HIDDEN_GROUP_LABEL_PATTERN.test(groupLabel);
}

function isToolBatchLaneEvent(event: TaskEvent): boolean {
  const groupId = getTimelineGroupId(event).toLowerCase();
  if (!groupId || !groupId.startsWith("tools:")) return false;

  const effectiveType = getEffectiveTaskEventType(event);
  if (
    effectiveType === "tool_call" ||
    effectiveType === "tool_result" ||
    effectiveType === "tool_error"
  ) {
    return true;
  }

  return (
    event.type === "timeline_step_started" ||
    event.type === "timeline_step_updated" ||
    event.type === "timeline_step_finished"
  );
}

function isImplementationOnlyBrowserActionEvent(event: TaskEvent): boolean {
  return String(event.type) === "browser_action";
}

export function isUserVisibleTaskArtifactEvent(event: TaskEvent): boolean {
  const effectiveType = getEffectiveTaskEventType(event);
  if (
    effectiveType !== "file_created" &&
    effectiveType !== "file_modified" &&
    effectiveType !== "file_deleted" &&
    effectiveType !== "artifact_created"
  ) {
    return true;
  }

  const payload = asObject(event.payload);
  const source =
    typeof payload.source === "string" ? payload.source.toLowerCase() : "";
  if (source === "artifact_bootstrap" || source === "provisional") {
    return false;
  }
  const candidatePath =
    getPayloadText(payload, "path") ||
    getPayloadText(payload, "filePath") ||
    getPayloadText(payload, "fileName") ||
    getPayloadText(payload, "to") ||
    getPayloadText(payload, "from");
  return candidatePath ? isUserVisibleTaskArtifactPath(candidatePath) : true;
}

// In non-verbose mode, hide most tool traffic but keep user-facing schedule confirmations visible.
export function isImportantTaskEvent(event: TaskEvent): boolean {
  if (isImplementationOnlyBrowserActionEvent(event)) return false;
  if (!isUserVisibleTaskArtifactEvent(event)) return false;
  const effectiveType = getEffectiveTaskEventType(event);
  if (IMPORTANT_EVENT_TYPES.includes(effectiveType as EventType)) return true;
  if (effectiveType !== "tool_result") return false;
  return String((event as Any)?.payload?.tool || "") === "schedule_task";
}

function getEventMessage(event: TaskEvent): string {
  if (event.type === "timeline_error") {
    return getTimelineErrorText(event);
  }
  const raw =
    typeof event.payload?.message === "string"
      ? event.payload.message.trim()
      : "";
  return raw;
}

const VERBOSE_VISIBLE_TIMELINE_UPDATE_TYPES = new Set([
  "executing",
  "llm_retry",
  "plan_created",
  "task_dequeued",
  "task_queued",
]);

function isMeaningfulVerboseLogMessage(message: string): boolean {
  return (
    /^Analyzing task requirements/i.test(message) ||
    /^Creating execution plan\b/i.test(message) ||
    /^\[planning\]/i.test(message) ||
    /^\[skill-routing\]\s+plan\.create\.start\b/i.test(message)
  );
}

function isMeaningfulVerboseProgressUpdate(
  event: TaskEvent,
  message: string,
): boolean {
  const payload = asObject(event.payload);
  if (!message || payload.heartbeat === true) return false;
  if (/^Paused\s*-\s*awaiting user input\.?$/i.test(message)) return false;
  if (/^(?:progress_update|progress update)$/i.test(message)) return false;

  return (
    message === "Thinking..." ||
    /^Starting execution(?: of \d+ steps?)?$/i.test(message) ||
    /^Executing step \d+\/\d+:/i.test(message) ||
    /^Completed step [^:]+:/i.test(message) ||
    /^Tackling:/i.test(message) ||
    /^(?:Gathering|Reading|Searching|Checking|Writing|Generating|Verifying)\b/i.test(
      message,
    )
  );
}

const VERBOSE_DUPLICATE_WINDOW_MS = 15_000;

function normalizeFailureTextForDedupe(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.。]+$/g, "")
    .trim();
}

function getComparableFailureText(event: TaskEvent): string {
  if (event.type === "timeline_error") {
    return normalizeFailureTextForDedupe(getTimelineErrorText(event));
  }

  const effectiveType = getEffectiveTaskEventType(event);
  if (effectiveType !== "step_failed") return "";

  const payload = asObject(event.payload);
  const step = asObject(payload.step);
  const raw =
    getPayloadText(payload, "reason") ||
    getPayloadText(step, "error") ||
    getPayloadText(payload, "error") ||
    getPayloadText(payload, "message") ||
    getPayloadText(step, "description");
  return normalizeFailureTextForDedupe(raw);
}

function isTimelineErrorStepFailureDuplicate(
  current: TaskEvent,
  previous: TaskEvent,
): boolean {
  const currentIsTimelineError = current.type === "timeline_error";
  const previousIsTimelineError = previous.type === "timeline_error";
  if (currentIsTimelineError === previousIsTimelineError) return false;
  if (current.taskId !== previous.taskId) return false;

  const currentEffectiveType = getEffectiveTaskEventType(current);
  const previousEffectiveType = getEffectiveTaskEventType(previous);
  const hasFailedStep =
    currentEffectiveType === "step_failed" ||
    previousEffectiveType === "step_failed";
  if (!hasFailedStep) return false;

  if (
    Math.abs((current.timestamp ?? 0) - (previous.timestamp ?? 0)) >
    VERBOSE_DUPLICATE_WINDOW_MS
  ) {
    return false;
  }

  const currentFailureText = getComparableFailureText(current);
  const previousFailureText = getComparableFailureText(previous);
  return Boolean(
    currentFailureText && currentFailureText === previousFailureText,
  );
}

export function filterAdjacentDuplicateTimelineFailures(
  events: TaskEvent[],
): TaskEvent[] {
  const out: TaskEvent[] = [];
  for (const event of events) {
    const previousVisibleEvent = out[out.length - 1];
    if (previousVisibleEvent && isTimelineErrorStepFailureDuplicate(event, previousVisibleEvent)) {
      if (event.type === "timeline_error") {
        continue;
      }
      out[out.length - 1] = event;
      continue;
    }
    out.push(event);
  }
  return out;
}

function getToolCorrelationId(payload: Record<string, unknown>): string {
  const toolUseId =
    typeof payload.toolUseId === "string" && payload.toolUseId.trim().length > 0
      ? payload.toolUseId.trim()
      : "";
  if (toolUseId) return toolUseId;
  const callId =
    typeof payload.callId === "string" && payload.callId.trim().length > 0
      ? payload.callId.trim()
      : "";
  if (callId) return callId;
  const id =
    typeof payload.id === "string" && payload.id.trim().length > 0 ? payload.id.trim() : "";
  return id;
}

function getStepId(event: TaskEvent, payload: Record<string, unknown>): string {
  if (typeof event.stepId === "string" && event.stepId.trim().length > 0) {
    return event.stepId.trim();
  }
  if (typeof payload.stepId === "string" && payload.stepId.trim().length > 0) {
    return payload.stepId.trim();
  }
  const step = asObject(payload.step);
  return typeof step.id === "string" && step.id.trim().length > 0
    ? step.id.trim()
    : "";
}

function getStepDescription(payload: Record<string, unknown>): string {
  const step = asObject(payload.step);
  return typeof step.description === "string" &&
    step.description.trim().length > 0
    ? step.description.trim()
    : "";
}

function buildVerboseDuplicateKey(event: TaskEvent): string | null {
  const payload = asObject(event.payload);
  const effectiveType = getEffectiveTaskEventType(event);
  const message = getEventMessage(event);
  const groupId = getTimelineGroupId(event);
  const stepId = getStepId(event, payload);

  if (
    event.type === "timeline_group_started" ||
    event.type === "timeline_group_finished"
  ) {
    const stage =
      typeof payload.stage === "string"
        ? payload.stage.trim().toUpperCase()
        : "";
    const groupLabel = getTimelineGroupLabel(event);
    const basis = groupId || stage || groupLabel || message;
    return basis ? `${event.type}|${basis}|${event.status || ""}` : null;
  }

  if (
    effectiveType === "tool_call" ||
    effectiveType === "tool_result" ||
    effectiveType === "tool_error"
  ) {
    const input = asObject(payload.input);
    const result = asObject(payload.result);
    const tool = typeof payload.tool === "string" ? payload.tool.trim() : "";
    const correlationId = getToolCorrelationId(payload);
    const url =
      (typeof result.url === "string" && result.url.trim()) ||
      (typeof input.url === "string" && input.url.trim()) ||
      "";
    const path =
      (typeof result.path === "string" && result.path.trim()) ||
      (typeof input.path === "string" && input.path.trim()) ||
      (typeof input.file_path === "string" && input.file_path.trim()) ||
      "";
    const query =
      (typeof result.query === "string" && result.query.trim()) ||
      (typeof input.query === "string" && input.query.trim()) ||
      (typeof input.pattern === "string" && input.pattern.trim()) ||
      "";
    const basis = correlationId || url || path || query || message;
    return basis ? `${effectiveType}|${tool}|${basis}|${groupId}` : null;
  }

  if (
    effectiveType === "step_started" ||
    effectiveType === "step_completed" ||
    effectiveType === "step_failed"
  ) {
    const description = getStepDescription(payload);
    const basis = stepId || description || message;
    return basis
      ? `${effectiveType}|${basis}|${groupId}|${event.status || ""}`
      : null;
  }

  if (effectiveType === "artifact_created") {
    const path = typeof payload.path === "string" ? payload.path.trim() : "";
    const label = typeof payload.label === "string" ? payload.label.trim() : "";
    const basis = path || label || message;
    return basis ? `${effectiveType}|${basis}` : null;
  }

  if (effectiveType === "error" || event.type === "timeline_error") {
    return message ? `error|${message}` : null;
  }

  if (event.type === "log") {
    return message ? `log|${message}` : null;
  }

  return null;
}

function isLowValueVerboseLifecycleEvent(event: TaskEvent): boolean {
  const message = getEventMessage(event);
  const effectiveType = getEffectiveTaskEventType(event);

  // timeline_step_updated events are internal executor status beacons.
  // Preserve user-visible chat messages, which are persisted as
  // timeline_step_updated + legacyType=user_message/assistant_message in timeline v2.
  if (event.type === "timeline_step_updated") {
    if (effectiveType === "user_message") {
      return false;
    }
    // Tool calls and their results are also persisted as timeline_step_updated
    // records in timeline v2. They are the substance of execution-record and
    // replay views, so treating every updated event as a lifecycle beacon
    // leaves tool-heavy sessions with an empty timeline.
    if (
      effectiveType === "tool_call" ||
      effectiveType === "tool_result" ||
      effectiveType === "tool_error"
    ) {
      return false;
    }
    if (effectiveType === "assistant_message") {
      const payload = asObject(event.payload);
      const message =
        typeof payload.message === "string" ? payload.message : "";
      if (payload.internal !== true) return false;
      // Execution-record mode intentionally exposes substantive internal
      // narration. Keep it in the verbose stream so the later presentation
      // layer can distinguish useful work notes from short beacons such as
      // "OK". Dropping it here made the execution-record toggle render an
      // empty transcript for tool-heavy tasks.
      if (hasAssistantMediaDirective(message)) return false;
      if (message.trim().length > 12 && !/^ok[\s.!?]*$/i.test(message.trim())) {
        return false;
      }
      return true;
    }
    if (VERBOSE_VISIBLE_TIMELINE_UPDATE_TYPES.has(effectiveType)) {
      return false;
    }
    if (effectiveType === "progress_update") {
      return !isMeaningfulVerboseProgressUpdate(event, message);
    }
    if (effectiveType === "llm_routing_changed") {
      const payload = asObject(event.payload);
      return (
        payload.fallbackOccurred !== true &&
        payload.routeReason !== "provider_outage"
      );
    }
    if (effectiveType === "log") {
      return !isMeaningfulVerboseLogMessage(message);
    }
    return true;
  }

  if (event.type === "timeline_group_started") {
    return false;
  }

  // timeline_step_finished events echo tool/step completion that is already
  // visible from tool_result or timeline_group_finished events.
  // Keep terminal task outcomes as well: task_completed carries the final
  // resultSummary that Verbose mode must render as the assistant response.
  if (event.type === "timeline_step_finished") {
    const payload = asObject(event.payload);
    const legacyType = typeof payload.legacyType === "string" ? payload.legacyType : "";
    if (
      effectiveType === "task_completed" ||
      legacyType === "task_cancelled" ||
      event.status === "failed"
    ) {
      return false;
    }
    return true;
  }

  if (
    event.type === "timeline_group_finished" &&
    isStageBoundaryTimelineGroupEvent(event) &&
    event.status !== "failed"
  ) {
    return true;
  }

  if (event.type === "log") {
    return !isMeaningfulVerboseLogMessage(message);
  }

  return false;
}

function isVerbosePostFailureCutoffEvent(event: TaskEvent): boolean {
  const effectiveType = getEffectiveTaskEventType(event);
  return (
    event.type === "timeline_error" ||
    effectiveType === "error" ||
    effectiveType === "step_failed" ||
    effectiveType === "verification_failed" ||
    effectiveType === "verification_pending_user_action"
  );
}

/**
 * In verbose mode, hide internal lifecycle chatter while retaining the
 * user-facing execution record: planning, provider retries, plan creation,
 * step progress, queue retries, tools, and terminal errors.
 */
export function filterVerboseTimelineNoise(
  events: TaskEvent[],
  options?: { taskStatus?: TaskStatus },
): TaskEvent[] {
  const out: TaskEvent[] = [];
  const seenExactIds = new Set<string>();
  const lastSeenByKey = new Map<string, number>();
  const hideTerminalStageBoundaries = isTerminalTaskStatus(options?.taskStatus);
  const finalReplyTimestampsByTask = buildFinalReplyTimestampsByTask(events);
  const cancelledTaskIds = new Set(
    events
      .filter((event) => getEffectiveTaskEventType(event) === "task_cancelled")
      .map((event) => event.taskId),
  );
  const taskIdsAfterBlockingFailure = new Set<string>();
  const completedTaskIds = new Set<string>();
  for (const event of events) {
    if (!isUserVisibleTaskArtifactEvent(event)) continue;
    const effectiveType = getEffectiveTaskEventType(event);
    if (effectiveType === "task_started" || effectiveType === "user_message") {
      completedTaskIds.delete(event.taskId);
      taskIdsAfterBlockingFailure.delete(event.taskId);
    }
    if (cancelledTaskIds.has(event.taskId) && isLlmRequestCancelledEvent(event))
      continue;
    if (
      completedTaskIds.has(event.taskId) &&
      isStageBoundaryTimelineGroupEvent(event)
    ) {
      continue;
    }
    if (
      isStageBoundaryTimelineGroupEvent(event) &&
      (hideTerminalStageBoundaries ||
        (isDeliverStageBoundaryTimelineGroupEvent(event) &&
          hasFinalReplyNearOrAfter(event, finalReplyTimestampsByTask)))
    ) {
      continue;
    }
    if (
      taskIdsAfterBlockingFailure.has(event.taskId) &&
      event.type === "timeline_group_started" &&
      isStageBoundaryTimelineGroupEvent(event)
    ) {
      continue;
    }
    if (isLowValueVerboseLifecycleEvent(event)) continue;
    if (
      effectiveType === "progress_update" &&
      !isMeaningfulVerboseProgressUpdate(event, getEventMessage(event))
    ) {
      continue;
    }
    const exactId =
      typeof event.eventId === "string" && event.eventId.trim().length > 0
        ? event.eventId.trim()
        : typeof event.id === "string" && event.id.trim().length > 0
          ? event.id.trim()
          : "";
    if (exactId) {
      if (seenExactIds.has(exactId)) continue;
      seenExactIds.add(exactId);
    }
    const duplicateKey = buildVerboseDuplicateKey(event);
    if (duplicateKey) {
      const previousTs = lastSeenByKey.get(duplicateKey);
      if (
        typeof previousTs === "number" &&
        Math.abs((event.timestamp ?? 0) - previousTs) <=
          VERBOSE_DUPLICATE_WINDOW_MS
      ) {
        continue;
      }
      lastSeenByKey.set(duplicateKey, event.timestamp ?? 0);
    }
    out.push(event);
    if (effectiveType === "task_completed") {
      completedTaskIds.add(event.taskId);
    }
    if (isVerbosePostFailureCutoffEvent(event)) {
      taskIdsAfterBlockingFailure.add(event.taskId);
    }
  }
  return filterAdjacentDuplicateTimelineFailures(out);
}

export function shouldShowTaskEventInSummaryMode(
  event: TaskEvent,
  taskStatus?: TaskStatus,
): boolean {
  if (!isUserVisibleTaskArtifactEvent(event)) return false;
  if (isInjectedContextStepFailure(event)) return false;
  if (taskStatus === "cancelled" && isLlmRequestCancelledEvent(event))
    return false;
  if (!isImportantTaskEvent(event)) return false;
  if (isToolBatchTimelineGroupEvent(event)) return false;
  if (isToolBatchLaneEvent(event)) return false;

  if (isStageBoundaryTimelineGroupEvent(event)) {
    if (event.type === "timeline_group_finished") return false;
    if (taskStatus === "completed") return false;
    return isSubStageTimelineGroupEvent(event);
  }

  return true;
}

export function shouldShowTaskEventInStepFeed(
  event: TaskEvent,
  options?: { verboseSteps?: boolean; taskStatus?: TaskStatus },
): boolean {
  if (!isUserVisibleTaskArtifactEvent(event)) return false;
  if (isInjectedContextStepFailure(event)) return false;
  if (isImplementationOnlyBrowserActionEvent(event)) return false;
  if (isToolBatchTimelineGroupEvent(event)) return false;
  if (isToolBatchLaneEvent(event)) return false;

  if (isStageBoundaryTimelineGroupEvent(event)) {
    if (isTerminalTaskStatus(options?.taskStatus)) return false;
    if (options?.verboseSteps) return true;
    return isSubStageTimelineGroupEvent(event);
  }

  return true;
}
