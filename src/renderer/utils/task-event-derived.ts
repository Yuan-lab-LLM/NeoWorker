import type {
  PlanStep,
  SessionChecklistItem,
  SessionChecklistState,
  Task,
  TaskEvent,
  TaskOutputSummary,
  TaskStatus,
  Workspace,
} from "../../shared/types";
import { isVerificationStepDescription } from "../../shared/plan-utils";
import {
  buildParallelGroupProjection,
  type ParallelGroupProjectionResult,
} from "../components/timeline/parallel-group-projection";
import {
  deriveTaskOutputSummaryFromEvents,
  hasTaskOutputs,
  resolvePreferredTaskOutputSummary,
} from "./task-outputs";
import { hasAssistantMediaDirective } from "./assistant-media-directives";
import {
  filterAdjacentDuplicateTimelineFailures,
  filterVerboseTimelineNoise,
  isLlmRequestCancelledEvent,
  shouldShowTaskEventInSummaryMode,
} from "./task-event-visibility";
import { getEffectiveTaskEventType } from "./task-event-compat";
import { normalizeEventsForTimelineUi } from "./timeline-projection";
import {
  classifyLiveTaskEvent,
  getLiveTaskEventCoalesceFingerprint,
} from "./live-task-event-policy";
import { isUserVisibleTaskArtifactPath } from "./task-artifact-visibility";
import {
  isCanonicalTaskArtifactOutputPath,
  normalizeArtifactPathForWorkspace,
} from "./artifact-path-identity";
import { selectCompletionResultSummary } from "./task-completion-summary";

export type RendererEventVisibility = "live" | "inspect-only" | "debug-only";

export interface CommandOutputSession {
  id: string;
  command: string;
  output: string;
  isRunning: boolean;
  exitCode: number | null;
  startTimestamp: number;
  cwd?: string;
}

export interface FileInfo {
  path: string;
  action: "created" | "modified" | "deleted";
  timestamp: number;
}

function isProvisionalArtifactPayload(
  payload: Record<string, unknown>,
): boolean {
  return (
    String(payload.source || "").trim().toLowerCase() ===
      "artifact_bootstrap" || payload.provisional === true
  );
}

export interface ToolUsage {
  name: string;
  count: number;
  lastUsed: number;
}

export interface EventTimelineItem {
  kind: "event";
  event: TaskEvent;
  eventIndex: number;
  timestamp: number;
}

export interface ActionBlockTimelineItem {
  kind: "action_block";
  blockId: string;
  events: TaskEvent[];
  eventIndices: number[];
  timestamp: number;
}

export type BaseTimelineItem = EventTimelineItem | ActionBlockTimelineItem;

export interface ToolCallPairing {
  completions: Map<string, TaskEvent>;
  claimedResultIds: Set<string>;
}

export interface SharedTaskEventUiState {
  projectionMode: "live" | "inspect";
  rawEventCount: number;
  normalizedEvents: TaskEvent[];
  filteredEvents: TaskEvent[];
  liveEvents: TaskEvent[];
  inspectOnlyEvents: TaskEvent[];
  debugOnlyEvents: TaskEvent[];
  parallelGroupProjection: ParallelGroupProjectionResult;
  parallelGroupsByAnchorEventId: Map<
    string,
    ParallelGroupProjectionResult["groupsByAnchorEventId"] extends Map<
      string,
      infer T
    >
      ? T
      : never
  >;
  suppressedParallelEventIds: Set<string>;
  toolCallPairing: ToolCallPairing;
  baseTimelineItems: BaseTimelineItem[];
  commandOutputSessions: CommandOutputSession[];
  planSteps: PlanStep[];
  checklistState: SessionChecklistState | null;
  files: FileInfo[];
  outputSummary: TaskOutputSummary | null;
  toolUsage: ToolUsage[];
  referencedFiles: string[];
  usedToolNames: Set<string>;
  latestVisibleTaskEvent: TaskEvent | null;
}

export interface DeriveSharedTaskEventUiStateParams {
  rawEvents: TaskEvent[];
  task?: Task | null;
  workspace?: Workspace | null;
  verboseSteps?: boolean;
  projectionMode?: "live" | "inspect";
  liveWindowSize?: number;
}

const DEFAULT_LIVE_PROJECTION_WINDOW_SIZE = 160;
const MAX_COMMAND_OUTPUT_SESSION_CHARS = 50 * 1024;
const MAX_COMMAND_OUTPUT_SESSIONS = 12;

function appendCommandOutputTail(current: string, chunk: string): string {
  const next = current + chunk;
  if (next.length <= MAX_COMMAND_OUTPUT_SESSION_CHARS) return next;
  return `[... earlier output truncated ...]\n\n${next.slice(-MAX_COMMAND_OUTPUT_SESSION_CHARS)}`;
}

function limitCommandOutputSessions(
  sessions: CommandOutputSession[],
): CommandOutputSession[] {
  if (sessions.length <= MAX_COMMAND_OUTPUT_SESSIONS) return sessions;
  const running = sessions.filter((session) => session.isRunning);
  const runningToKeep = running.slice(-MAX_COMMAND_OUTPUT_SESSIONS);
  const completedBudget = Math.max(
    0,
    MAX_COMMAND_OUTPUT_SESSIONS - runningToKeep.length,
  );
  const recentCompleted =
    completedBudget > 0
      ? sessions.filter((session) => !session.isRunning).slice(-completedBudget)
      : [];
  return [...recentCompleted, ...runningToKeep].sort(
    (a, b) => a.startTimestamp - b.startTimestamp,
  );
}
const LIVE_COALESCE_WINDOW_MS = 10_000;
const LIVE_PROJECTION_FORCE_VISIBLE_TYPES = new Set([
  "assistant_message",
  "user_message",
  "approval_requested",
  "input_request_created",
  "task_completed",
  "task_cancelled",
  "error",
  "timeline_error",
  "follow_up_failed",
  "step_failed",
]);

function isLiveAnchorEvent(event: TaskEvent): boolean {
  const effectiveType = getEffectiveTaskEventType(event);
  return (
    effectiveType === "user_message" ||
    effectiveType === "assistant_message" ||
    effectiveType === "approval_requested" ||
    effectiveType === "input_request_created" ||
    effectiveType === "task_completed" ||
    effectiveType === "task_cancelled" ||
    effectiveType === "error" ||
    effectiveType === "timeline_error" ||
    event.type === "timeline_error" ||
    effectiveType === "artifact_created" ||
    event.type === "timeline_artifact_emitted"
  );
}

function liveAnchorKey(event: TaskEvent): string | null {
  const effectiveType = getEffectiveTaskEventType(event);
  if (effectiveType === "user_message") return "latest-user";
  if (
    effectiveType === "assistant_message" &&
    event.payload?.internal !== true
  ) {
    return "latest-assistant";
  }
  if (effectiveType === "approval_requested") return "latest-approval";
  if (effectiveType === "input_request_created") return "latest-input";
  if (effectiveType === "task_completed" || effectiveType === "task_cancelled")
    return "terminal";
  if (
    effectiveType === "error" ||
    effectiveType === "timeline_error" ||
    event.type === "timeline_error"
  ) {
    return "latest-error";
  }
  if (
    effectiveType === "artifact_created" ||
    event.type === "timeline_artifact_emitted"
  ) {
    return "latest-artifact";
  }
  return null;
}

function getLivePlanStateEventIds(events: TaskEvent[]): Set<string> {
  const keepIds = new Set<string>();
  let latestPlanIndex = -1;
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (getEffectiveTaskEventType(events[index]) === "plan_created") {
      latestPlanIndex = index;
      break;
    }
  }
  if (latestPlanIndex < 0) return keepIds;

  const planEvent = events[latestPlanIndex];
  if (planEvent.id) keepIds.add(planEvent.id);
  const planPayload = asObject(planEvent.payload);
  const plan = asObject(planPayload.plan);
  const rawSteps = Array.isArray(plan.steps) ? plan.steps : [];
  const planStepIds = new Set(
    rawSteps
      .map((step) => asObject(step).id)
      .filter((id): id is string => typeof id === "string" && id.length > 0),
  );
  if (planStepIds.size === 0) return keepIds;

  // A long-running task can push the plan outside the bounded live window.
  // Retain the latest lifecycle event for each current-plan step so footer
  // progress stays mounted and accurate without retaining the full history.
  const latestLifecycleEventByStepId = new Map<string, TaskEvent>();
  for (let index = latestPlanIndex + 1; index < events.length; index += 1) {
    const event = events[index];
    const effectiveType = getEffectiveTaskEventType(event);
    if (
      effectiveType !== "step_started" &&
      effectiveType !== "step_completed" &&
      effectiveType !== "step_failed" &&
      effectiveType !== "step_skipped"
    ) {
      continue;
    }
    const payload = asObject(event.payload);
    const step = asObject(payload.step);
    const stepId = step.id ?? payload.stepId ?? event.stepId;
    if (typeof stepId === "string" && planStepIds.has(stepId)) {
      latestLifecycleEventByStepId.set(stepId, event);
    }
  }
  for (const event of latestLifecycleEventByStepId.values()) {
    if (event.id) keepIds.add(event.id);
  }
  return keepIds;
}

function selectLiveProjectionRawEvents(
  events: TaskEvent[],
  liveWindowSize: number,
): TaskEvent[] {
  if (events.length <= liveWindowSize) return events;

  const keepIds = getLivePlanStateEventIds(events);
  const anchorSeen = new Set<string>();
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    const key = liveAnchorKey(event);
    if (!key || anchorSeen.has(key)) continue;
    anchorSeen.add(key);
    keepIds.add(event.id);
    if (anchorSeen.size >= 7) break;
  }

  const startIndex = Math.max(0, events.length - liveWindowSize);
  const selected: TaskEvent[] = [];
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (index >= startIndex || keepIds.has(event.id)) {
      selected.push(event);
    }
  }
  return selected;
}

function filterLiveProjectionEvents(events: TaskEvent[]): TaskEvent[] {
  const lastCoalescedByFingerprint = new Map<string, number>();
  const visible: TaskEvent[] = [];

  for (const event of events) {
    const lane = classifyLiveTaskEvent(event);
    if (lane === "hiddenLiveNoise" && !isLiveAnchorEvent(event)) {
      continue;
    }

    const fingerprint = getLiveTaskEventCoalesceFingerprint(event);
    if (fingerprint) {
      const previousTimestamp = lastCoalescedByFingerprint.get(fingerprint);
      if (
        typeof previousTimestamp === "number" &&
        event.timestamp - previousTimestamp <= LIVE_COALESCE_WINDOW_MS
      ) {
        continue;
      }
      lastCoalescedByFingerprint.set(fingerprint, event.timestamp);
    }

    visible.push(event);
  }

  return visible;
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function getAssistantStepDescription(event: TaskEvent): string {
  const payload = asObject(event.payload);
  if (typeof payload.stepDescription === "string")
    return payload.stepDescription;
  const step = asObject(payload.step);
  return typeof step.description === "string" ? step.description : "";
}

function shouldRevealInternalAssistantMessageInVerbose(
  event: TaskEvent,
): boolean {
  const payload = asObject(event.payload);
  if (
    getEffectiveTaskEventType(event) !== "assistant_message" ||
    payload.internal !== true
  ) {
    return false;
  }
  const message =
    typeof payload.message === "string" ? payload.message.trim() : "";
  const stepDescription = getAssistantStepDescription(event);
  if (!message) return false;
  if (hasAssistantMediaDirective(message)) return true;
  if (isVerificationStepDescription(stepDescription)) return false;
  if (/^ok[\s.!?]*$/i.test(message) || message.length <= 12) return false;
  return true;
}

function isVerificationNoiseEvent(event: TaskEvent): boolean {
  const effectiveType = getEffectiveTaskEventType(event);
  const payload = asObject(event.payload);
  if (effectiveType === "assistant_message") {
    const message = typeof payload.message === "string" ? payload.message : "";
    return payload.internal === true && !hasAssistantMediaDirective(message);
  }

  if (
    event.type === "timeline_step_started" ||
    event.type === "timeline_step_finished" ||
    effectiveType === "step_started" ||
    effectiveType === "step_completed"
  ) {
    const step = asObject(payload.step);
    return isVerificationStepDescription(
      typeof step.description === "string" ? step.description : undefined,
    );
  }

  return (
    effectiveType === "verification_started" ||
    effectiveType === "verification_passed"
  );
}

function classifyTaskEventForRenderer(
  event: TaskEvent,
  params: { taskStatus?: TaskStatus; verboseSteps?: boolean },
): RendererEventVisibility {
  if (
    event.type === "command_output" ||
    event.type === "timeline_command_output"
  ) {
    return "inspect-only";
  }

  if (params.verboseSteps) {
    if (shouldRevealInternalAssistantMessageInVerbose(event)) return "live";
    if (isVerificationNoiseEvent(event)) return "debug-only";
    return "live";
  }

  if (
    shouldShowTaskEventInSummaryMode(event, params.taskStatus) &&
    !isVerificationNoiseEvent(event)
  ) {
    return "live";
  }

  return "debug-only";
}

function getCompletionSummaryText(event: TaskEvent): string {
  if (getEffectiveTaskEventType(event) !== "task_completed") return "";
  const payload = asObject(event.payload);
  const resultSummary = selectCompletionResultSummary(event);
  const semanticSummary =
    typeof payload.semanticSummary === "string"
      ? payload.semanticSummary.trim()
      : "";
  const verificationVerdict =
    typeof payload.verificationVerdict === "string"
      ? payload.verificationVerdict.trim()
      : "";
  const verificationReport =
    typeof payload.verificationReport === "string"
      ? payload.verificationReport.trim()
      : "";
  // A semantic summary describes internal execution and may be a tool-batch
  // label. It must not be appended to the user-facing completion response.
  const summary = resultSummary || semanticSummary;
  if (!verificationVerdict && !verificationReport) return summary;
  const verification = [
    verificationVerdict ? `Verification: ${verificationVerdict}` : "",
    verificationReport,
  ]
    .filter((value) => value.length > 0)
    .join("\n");
  return [summary, verification]
    .filter((value) => value.length > 0)
    .join("\n\n");
}

function normalizeCompletionTextForComparison(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function getCompletionComparableTexts(event: TaskEvent): Set<string> {
  if (getEffectiveTaskEventType(event) !== "task_completed") return new Set();
  const payload = asObject(event.payload);
  const resultSummary =
    typeof payload.resultSummary === "string"
      ? payload.resultSummary.trim()
      : "";
  const semanticSummary =
    typeof payload.semanticSummary === "string"
      ? payload.semanticSummary.trim()
      : "";
  const fullSummary = getCompletionSummaryText(event);
  const comparableSummaries = resultSummary
    ? [resultSummary, fullSummary]
    : [semanticSummary, fullSummary];

  return new Set(
    comparableSummaries
      .map(normalizeCompletionTextForComparison)
      .filter((value) => value.length > 0),
  );
}

export function derivePlanSteps(events: TaskEvent[]): PlanStep[] {
  // Plans can be revised while a task is running. Step lifecycle events emitted after a
  // revision reference the latest plan's IDs, so projecting the original plan leaves the
  // footer progress stuck on its first pending item after the task has completed.
  // A follow-up message also starts a new execution turn. Until that turn emits its own
  // plan, the composer must not fall back to the completed plan from the previous turn.
  let latestTurnBoundaryIndex = -1;
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const effectiveType = getEffectiveTaskEventType(events[index]);
    if (
      effectiveType === "user_message" ||
      effectiveType === "follow_up_started"
    ) {
      latestTurnBoundaryIndex = index;
      break;
    }
  }

  let planEventIndex = -1;
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const effectiveType = getEffectiveTaskEventType(events[index]);
    const payload = asObject(events[index]?.payload);
    const candidatePlan = asObject(payload.plan);
    if (
      (effectiveType === "plan_created" ||
        effectiveType === "plan_updated" ||
        effectiveType === "plan_revised") &&
      Array.isArray(candidatePlan.steps)
    ) {
      planEventIndex = index;
      break;
    }
  }
  if (planEventIndex < latestTurnBoundaryIndex) return [];

  const planEvent = planEventIndex >= 0 ? events[planEventIndex] : undefined;
  const planPayload = asObject(planEvent?.payload);
  const plan = asObject(planPayload.plan);
  const rawSteps = Array.isArray(plan.steps) ? plan.steps : [];
  const steps: PlanStep[] = rawSteps
    .filter((step): step is PlanStep => !!step && typeof step === "object")
    .map((step) => ({ ...(step as PlanStep) }));

  // Only lifecycle events after the latest plan revision belong to these
  // steps. Plan IDs are often reused ("1", "2", ...), so replaying older
  // lifecycle events can otherwise mark a newly revised step as completed.
  for (let index = planEventIndex + 1; index < events.length; index += 1) {
    const event = events[index];
    const effectiveType = getEffectiveTaskEventType(event);
    const payload = asObject(event.payload);
    const stepPayload = asObject(payload.step);
    const rawStepId = stepPayload.id ?? payload.stepId ?? event.stepId;
    const stepId = typeof rawStepId === "string" ? rawStepId : "";
    if (!stepId) continue;
    const step = steps.find((candidate) => candidate.id === stepId);
    if (!step) continue;

    if (effectiveType === "step_started") {
      step.status = "in_progress";
    } else if (effectiveType === "step_completed") {
      step.status = "completed";
    } else if (effectiveType === "step_failed") {
      step.status = "failed";
      if (payload.reason && !step.error) step.error = String(payload.reason);
    } else if (effectiveType === "step_skipped") {
      step.status = "skipped";
    }
  }

  // The progress panel represents the complete plan. Hiding verification
  // steps makes totals disagree with the visible rows and leaves users unable
  // to understand what the worker is doing near completion.
  return steps;
}

function deriveChecklistState(
  events: TaskEvent[],
): SessionChecklistState | null {
  const normalizeChecklistState = (
    payload: unknown,
  ): SessionChecklistState | null => {
    const payloadObject = asObject(payload);
    const checklist = asObject(payloadObject.checklist);
    const rawItems = Array.isArray(checklist.items) ? checklist.items : [];
    if (rawItems.length === 0) return null;

    const items: SessionChecklistItem[] = rawItems
      .filter((item) => item && typeof item === "object")
      .map((item) => {
        const itemObject = item as Record<string, unknown>;
        const kind: SessionChecklistItem["kind"] =
          itemObject.kind === "verification" || itemObject.kind === "other"
            ? itemObject.kind
            : "implementation";
        const status: SessionChecklistItem["status"] =
          itemObject.status === "in_progress" ||
          itemObject.status === "completed" ||
          itemObject.status === "blocked"
            ? itemObject.status
            : "pending";
        return {
          id: typeof itemObject.id === "string" ? itemObject.id : "",
          title: typeof itemObject.title === "string" ? itemObject.title : "",
          kind,
          status,
          createdAt:
            typeof itemObject.createdAt === "number" ? itemObject.createdAt : 0,
          updatedAt:
            typeof itemObject.updatedAt === "number" ? itemObject.updatedAt : 0,
        };
      })
      .filter((item) => Boolean(item.id && item.title));

    if (items.length === 0) return null;

    return {
      items,
      updatedAt:
        typeof checklist.updatedAt === "number" ? checklist.updatedAt : 0,
      verificationNudgeNeeded: checklist.verificationNudgeNeeded === true,
      nudgeReason:
        typeof checklist.nudgeReason === "string" &&
        checklist.nudgeReason.trim().length > 0
          ? checklist.nudgeReason
          : null,
    };
  };

  for (const event of [...events].reverse()) {
    const effectiveType = getEffectiveTaskEventType(event);
    if (
      effectiveType === "task_list_created" ||
      effectiveType === "task_list_updated" ||
      effectiveType === "task_list_verification_nudged" ||
      event.type === "conversation_snapshot"
    ) {
      const state = normalizeChecklistState(event.payload);
      if (state) return state;
    }
  }

  return null;
}

function normalizeWorkspacePathKey(
  workspacePath: string | undefined,
  candidate: string,
): string {
  return normalizeArtifactPathForWorkspace(candidate, workspacePath);
}

function deriveOutputSummary(
  task: Task | null | undefined,
  events: TaskEvent[],
): TaskOutputSummary | null {
  const latestCompletionEvent = [...events]
    .reverse()
    .find((event) => getEffectiveTaskEventType(event) === "task_completed");

  return (
    resolvePreferredTaskOutputSummary({
      task,
      latestCompletionEvent,
      fallbackEvents: events,
    }) || deriveTaskOutputSummaryFromEvents(events)
  );
}

function deriveFiles(
  events: TaskEvent[],
  workspace: Workspace | null | undefined,
  outputSummary: TaskOutputSummary | null,
): FileInfo[] {
  const fileMap = new Map<string, FileInfo>();
  const directoryPaths = new Set<string>();
  const copiedSourcePaths = new Set<string>();

  for (const event of events) {
    const effectiveType = getEffectiveTaskEventType(event);
    const payload = asObject(event.payload);
    if (isProvisionalArtifactPayload(payload)) continue;
    if (effectiveType === "file_created" && typeof payload.path === "string") {
      const key = normalizeWorkspacePathKey(workspace?.path, payload.path);
      if (payload.type === "directory") {
        directoryPaths.add(key);
        continue;
      }
      if (!isUserVisibleTaskArtifactPath(key)) continue;
      fileMap.set(key, {
        path: key,
        action: "created",
        timestamp: event.timestamp,
      });
      if (typeof payload.copiedFrom === "string") {
        const sourceKey = normalizeWorkspacePathKey(
          workspace?.path,
          payload.copiedFrom,
        );
        if (sourceKey && sourceKey !== key) {
          copiedSourcePaths.add(sourceKey);
          fileMap.delete(sourceKey);
        }
      }
      continue;
    }

    if (effectiveType === "file_modified") {
      const destinationPath =
        typeof payload.path === "string"
          ? payload.path
          : typeof payload.to === "string"
            ? payload.to
            : typeof payload.from === "string"
              ? payload.from
              : "";
      if (!destinationPath) continue;
      const key = normalizeWorkspacePathKey(workspace?.path, destinationPath);
      if (!isUserVisibleTaskArtifactPath(key)) continue;

      if (typeof payload.from === "string" && typeof payload.to === "string") {
        const sourceKey = normalizeWorkspacePathKey(
          workspace?.path,
          payload.from,
        );
        if (sourceKey !== key && isUserVisibleTaskArtifactPath(sourceKey)) {
          fileMap.set(sourceKey, {
            path: sourceKey,
            action: "deleted",
            timestamp: event.timestamp,
          });
        }
      }
      fileMap.set(key, {
        path: key,
        action: "modified",
        timestamp: event.timestamp,
      });
      continue;
    }

    if (
      (effectiveType === "file_deleted" ||
        effectiveType === "artifact_created") &&
      typeof payload.path === "string"
    ) {
      const key = normalizeWorkspacePathKey(workspace?.path, payload.path);
      if (!isUserVisibleTaskArtifactPath(key)) continue;
      fileMap.set(key, {
        path: key,
        action: effectiveType === "file_deleted" ? "deleted" : "created",
        timestamp: event.timestamp,
      });
    }
  }

  if (hasTaskOutputs(outputSummary)) {
    const modifiedFallbackSet = new Set(outputSummary.modifiedFallback || []);
    const completionOutputPaths =
      outputSummary.created.length > 0
        ? outputSummary.created
        : outputSummary.modifiedFallback || [];
    completionOutputPaths.forEach((outputPath, index) => {
      const key = normalizeWorkspacePathKey(workspace?.path, outputPath);
      if (!isUserVisibleTaskArtifactPath(key)) return;
      if (copiedSourcePaths.has(key)) return;
      if (fileMap.has(key)) return;
      if (directoryPaths.has(key)) return;
      fileMap.set(key, {
        path: key,
        action: modifiedFallbackSet.has(outputPath) ? "modified" : "created",
        timestamp: Date.now() - index,
      });
    });
  }

  const canonicalOutputNames = new Set(
    [...fileMap.values()]
      .filter((file) => isCanonicalTaskArtifactOutputPath(file.path))
      .map((file) =>
        file.path.replace(/\\/g, "/").split("/").pop()?.toLowerCase(),
      )
      .filter((name): name is string => Boolean(name)),
  );

  return [...fileMap.values()]
    .filter((file) => !file.path.endsWith("/") && !file.path.endsWith("\\"))
    .filter((file) => {
      const name = file.path
        .replace(/\\/g, "/")
        .split("/")
        .pop()
        ?.toLowerCase();
      return (
        !name ||
        !canonicalOutputNames.has(name) ||
        isCanonicalTaskArtifactOutputPath(file.path)
      );
    })
    .sort((a, b) => b.timestamp - a.timestamp);
}

function reconcileOutputSummaryWithPublishedFiles(
  outputSummary: TaskOutputSummary | null,
  files: FileInfo[],
  workspacePath?: string,
): TaskOutputSummary | null {
  if (!outputSummary) return null;

  const publishedFiles = files.filter((file) => file.action !== "deleted");
  const created = publishedFiles
    .filter((file) => file.action === "created")
    .map((file) => file.path);
  const modifiedFallback = publishedFiles
    .filter((file) => file.action === "modified")
    .map((file) => file.path);
  const primaryKey = outputSummary.primaryOutputPath
    ? normalizeWorkspacePathKey(workspacePath, outputSummary.primaryOutputPath)
    : "";
  const primaryOutputPath =
    publishedFiles.find((file) => file.path === primaryKey)?.path ||
    publishedFiles[0]?.path;
  const folders = [
    ...new Set(
      publishedFiles
        .map((file) => file.path.replace(/\\/g, "/"))
        .map((filePath) => filePath.slice(0, filePath.lastIndexOf("/")))
        .filter(Boolean),
    ),
  ];

  return {
    created,
    ...(modifiedFallback.length > 0 ? { modifiedFallback } : {}),
    ...(primaryOutputPath ? { primaryOutputPath } : {}),
    outputCount: publishedFiles.length,
    folders,
  };
}

function deriveToolUsage(events: TaskEvent[]): ToolUsage[] {
  const toolMap = new Map<string, ToolUsage>();

  for (const event of events) {
    const payload = asObject(event.payload);
    if (
      getEffectiveTaskEventType(event) !== "tool_call" ||
      typeof payload.tool !== "string"
    ) {
      continue;
    }
    const existing = toolMap.get(payload.tool);
    if (existing) {
      existing.count += 1;
      existing.lastUsed = event.timestamp;
    } else {
      toolMap.set(payload.tool, {
        name: payload.tool,
        count: 1,
        lastUsed: event.timestamp,
      });
    }
  }

  return [...toolMap.values()].sort((a, b) => b.lastUsed - a.lastUsed);
}

function deriveReferencedFiles(events: TaskEvent[]): string[] {
  const files = new Set<string>();
  for (const event of events) {
    const payload = asObject(event.payload);
    const input = asObject(payload.input);
    if (getEffectiveTaskEventType(event) !== "tool_call") continue;
    if (payload.tool === "read_file" && typeof input.path === "string") {
      files.add(input.path);
    }
    if (payload.tool === "search_files" && typeof input.path === "string") {
      files.add(input.path);
    }
  }
  return [...files].slice(0, 10);
}

function deriveUsedToolNames(events: TaskEvent[]): Set<string> {
  const names = new Set<string>();
  for (const event of events) {
    const payload = asObject(event.payload);
    if (
      getEffectiveTaskEventType(event) === "tool_call" &&
      typeof payload.tool === "string"
    ) {
      names.add(payload.tool);
    }
  }
  return names;
}

function deriveCommandOutputSessions(
  events: TaskEvent[],
): CommandOutputSession[] {
  const commandOutputEvents = events.filter(
    (event) => getEffectiveTaskEventType(event) === "command_output",
  );
  if (commandOutputEvents.length === 0) return [];

  const sessions: CommandOutputSession[] = [];
  let currentSession: CommandOutputSession | null = null;
  let syntheticIdCounter = 0;

  const finalizeCurrentSession = () => {
    if (!currentSession) return;
    sessions.push(currentSession);
    currentSession = null;
  };

  for (const event of commandOutputEvents) {
    const payload = asObject(event.payload);
    const payloadType = typeof payload.type === "string" ? payload.type : "";
    const payloadCommand =
      typeof payload.command === "string" ? payload.command : "";
    const payloadOutput =
      typeof payload.output === "string" ? payload.output : "";
    const payloadCwd =
      typeof payload.cwd === "string" ? payload.cwd : undefined;

    if (payloadType === "start") {
      finalizeCurrentSession();
      currentSession = {
        id: event.id || `command-${event.timestamp}-${syntheticIdCounter++}`,
        command: payloadCommand,
        output: payloadOutput,
        isRunning: true,
        exitCode: null,
        startTimestamp: event.timestamp,
        cwd: payloadCwd,
      };
      continue;
    }

    if (!currentSession) {
      currentSession = {
        id: event.id || `command-${event.timestamp}-${syntheticIdCounter++}`,
        command: payloadCommand,
        output: "",
        isRunning: payloadType !== "end",
        exitCode: null,
        startTimestamp: event.timestamp,
        cwd: payloadCwd,
      };
    } else {
      if (payloadCommand) currentSession.command = payloadCommand;
      if (payloadCwd) currentSession.cwd = payloadCwd;
    }

    if (
      payloadType === "stdout" ||
      payloadType === "stderr" ||
      payloadType === "stdin" ||
      payloadType === "error"
    ) {
      currentSession.output = appendCommandOutputTail(
        currentSession.output,
        payloadOutput,
      );
      continue;
    }

    if (payloadType === "end") {
      currentSession.isRunning = false;
      currentSession.exitCode =
        typeof payload.exitCode === "number" ? payload.exitCode : null;
      finalizeCurrentSession();
    }
  }

  if (currentSession) sessions.push(currentSession);

  return limitCommandOutputSessions(sessions);
}

function deriveToolCallPairing(
  filteredEvents: TaskEvent[],
  suppressedParallelEventIds: Set<string>,
): ToolCallPairing {
  const callIdToEvent = new Map<string, TaskEvent>();
  const completions = new Map<string, TaskEvent>();
  const claimedResultIds = new Set<string>();

  for (const event of filteredEvents) {
    if (suppressedParallelEventIds.has(event.id)) continue;
    const effectiveType = getEffectiveTaskEventType(event);
    const payload = asObject(event.payload);
    if (effectiveType === "tool_call") {
      const ids = [
        typeof payload.id === "string" ? payload.id : "",
        typeof payload.callId === "string" ? payload.callId : "",
        typeof payload.toolUseId === "string" ? payload.toolUseId : "",
      ]
        .map((value) => value.trim())
        .filter((value) => value.length > 0);
      for (const id of ids) {
        callIdToEvent.set(id, event);
      }
      continue;
    }

    if (effectiveType !== "tool_result") continue;
    const ids = [
      typeof payload.callId === "string" ? payload.callId : "",
      typeof payload.toolUseId === "string" ? payload.toolUseId : "",
    ]
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
    for (const id of ids) {
      const callEvent = callIdToEvent.get(id);
      if (!callEvent) continue;
      completions.set(callEvent.id, event);
      claimedResultIds.add(event.id);
      break;
    }
  }

  return { completions, claimedResultIds };
}

function deriveBaseTimelineItems(
  filteredEvents: TaskEvent[],
): BaseTimelineItem[] {
  const eventItems: BaseTimelineItem[] = [];
  let currentBlock: TaskEvent[] = [];
  let currentBlockIndices: number[] = [];

  const flushBlock = () => {
    if (currentBlock.length === 0) return;
    const firstBlockEvent = currentBlock[0];
    const firstBlockIndex = currentBlockIndices[0] ?? 0;
    const stableEventId =
      typeof firstBlockEvent?.id === "string" ? firstBlockEvent.id.trim() : "";
    const blockId =
      stableEventId.length > 0
        ? `action-block:${stableEventId}`
        : `action-block:${firstBlockEvent?.timestamp ?? 0}:${firstBlockIndex}`;
    eventItems.push({
      kind: "action_block",
      blockId,
      events: [...currentBlock],
      eventIndices: [...currentBlockIndices],
      timestamp: currentBlock[0].timestamp,
    });
    currentBlock = [];
    currentBlockIndices = [];
  };

  const isBoundaryEvent = (event: TaskEvent) => {
    const effectiveType = getEffectiveTaskEventType(event);
    return (
      effectiveType === "user_message" ||
      effectiveType === "assistant_message" ||
      effectiveType === "follow_up_completed" ||
      (effectiveType === "task_completed" &&
        getCompletionSummaryText(event).length > 0) ||
      effectiveType === "artifact_created" ||
      effectiveType === "diagram_created" ||
      event.type === "timeline_artifact_emitted"
    );
  };

  // A completed turn persists both the assistant reply and its completion
  // summary. Only suppress the reply when its *own* following completion has
  // the same text. Looking at the last completion for the entire task breaks
  // multi-turn chats and makes earlier replies appear twice.
  const isReplyDuplicatedByFollowingCompletion = (
    eventIndex: number,
  ): boolean => {
    const event = filteredEvents[eventIndex];
    if (getEffectiveTaskEventType(event) !== "assistant_message") return false;
    const payload = asObject(event.payload);
    const message =
      typeof payload.message === "string" ? payload.message.trim() : "";
    if (!message) return false;

    for (
      let index = eventIndex + 1;
      index < filteredEvents.length;
      index += 1
    ) {
      const candidate = filteredEvents[index];
      const candidateType = getEffectiveTaskEventType(candidate);
      if (
        candidateType === "user_message" ||
        candidateType === "assistant_message"
      ) {
        return false;
      }
      if (candidateType === "task_completed") {
        return getCompletionSummaryText(candidate).trim() === message;
      }
    }

    return false;
  };

  /**
   * Timeline v2 stores turn-level narration ("I am checking…", "Now generating
   * the PDF…") as assistant_message updates. They are execution progress, not
   * separate chat replies. When a later assistant message exists in the same
   * user turn, keep only the last turn-level message in the transcript.
   *
   * Numbered/revised plan-step results are intentionally left alone because
   * they can contain distinct deliverables that should remain visible.
   */
  const isSupersededTurnProgressReply = (eventIndex: number): boolean => {
    const event = filteredEvents[eventIndex];
    if (
      event.type !== "timeline_step_updated" ||
      getEffectiveTaskEventType(event) !== "assistant_message"
    ) {
      return false;
    }

    const payload = asObject(event.payload);
    const stepId =
      typeof payload.stepId === "string"
        ? payload.stepId.trim()
        : typeof event.stepId === "string"
          ? event.stepId.trim()
          : "";
    if (!stepId.startsWith("turn:") || payload.internal === true) return false;

    for (
      let index = eventIndex + 1;
      index < filteredEvents.length;
      index += 1
    ) {
      const candidate = filteredEvents[index];
      const candidateType = getEffectiveTaskEventType(candidate);
      if (candidateType === "user_message") return false;
      if (
        candidateType === "assistant_message" &&
        candidate.payload?.internal !== true
      ) {
        return true;
      }
    }

    return false;
  };

  for (let index = 0; index < filteredEvents.length; index += 1) {
    const event = filteredEvents[index];
    if (isBoundaryEvent(event)) {
      if (isSupersededTurnProgressReply(index)) continue;
      if (isReplyDuplicatedByFollowingCompletion(index)) continue;
      flushBlock();
      eventItems.push({
        kind: "event",
        event,
        eventIndex: index,
        timestamp: event.timestamp,
      });
      continue;
    }

    currentBlock.push(event);
    currentBlockIndices.push(index);
  }

  flushBlock();
  return eventItems;
}

function getLatestVisibleTaskEvent(
  baseTimelineItems: BaseTimelineItem[],
  filteredEvents: TaskEvent[],
): TaskEvent | null {
  for (let index = baseTimelineItems.length - 1; index >= 0; index -= 1) {
    const item = baseTimelineItems[index];
    if (item.kind === "event") return item.event;
    if (item.events.length > 0) return item.events[item.events.length - 1];
  }
  return filteredEvents[filteredEvents.length - 1] ?? null;
}

export function deriveSharedTaskEventUiState(
  params: DeriveSharedTaskEventUiStateParams,
): SharedTaskEventUiState {
  const projectionMode = params.projectionMode ?? "inspect";
  const rawEvents =
    projectionMode === "live"
      ? selectLiveProjectionRawEvents(
          params.rawEvents,
          Math.max(
            1,
            params.liveWindowSize ?? DEFAULT_LIVE_PROJECTION_WINDOW_SIZE,
          ),
        )
      : params.rawEvents;
  const normalizedEvents = normalizeEventsForTimelineUi(rawEvents);
  const candidateEvents = params.verboseSteps
    ? filterVerboseTimelineNoise(normalizedEvents, {
        taskStatus: params.task?.status,
      })
    : filterAdjacentDuplicateTimelineFailures(normalizedEvents);

  const liveEvents: TaskEvent[] = [];
  const inspectOnlyEvents: TaskEvent[] = [];
  const debugOnlyEvents: TaskEvent[] = [];

  const projectedEvents =
    projectionMode === "live" && !params.verboseSteps
      ? filterLiveProjectionEvents(candidateEvents)
      : candidateEvents;

  for (const event of projectedEvents) {
    if (
      params.task?.status === "cancelled" &&
      isLlmRequestCancelledEvent(event)
    ) {
      debugOnlyEvents.push(event);
      continue;
    }

    const forceLive =
      projectionMode === "live" &&
      LIVE_PROJECTION_FORCE_VISIBLE_TYPES.has(getEffectiveTaskEventType(event));
    const visibility = forceLive
      ? "live"
      : classifyTaskEventForRenderer(event, {
          taskStatus: params.task?.status,
          verboseSteps: params.verboseSteps,
        });
    if (visibility === "live") {
      liveEvents.push(event);
    } else if (visibility === "inspect-only") {
      inspectOnlyEvents.push(event);
    } else {
      debugOnlyEvents.push(event);
    }
  }

  const dedupedLiveEvents = filterAdjacentDuplicateTimelineFailures(liveEvents);
  const parallelGroupProjection =
    buildParallelGroupProjection(normalizedEvents);
  const suppressedParallelEventIds = parallelGroupProjection.suppressedEventIds;
  const toolCallPairing = deriveToolCallPairing(
    dedupedLiveEvents,
    suppressedParallelEventIds,
  );
  const baseTimelineItems = deriveBaseTimelineItems(dedupedLiveEvents);
  const commandOutputSessions = deriveCommandOutputSessions(normalizedEvents);
  // Timeline rendering is windowed for performance, but plan progress is
  // state and must be folded from the full renderer event history.
  const planSteps = derivePlanSteps(params.rawEvents);
  const checklistState = deriveChecklistState(normalizedEvents);
  const derivedOutputSummary = deriveOutputSummary(
    params.task,
    normalizedEvents,
  );
  const files = deriveFiles(
    normalizedEvents,
    params.workspace,
    derivedOutputSummary,
  );
  const outputSummary = reconcileOutputSummaryWithPublishedFiles(
    derivedOutputSummary,
    files,
    params.workspace?.path,
  );
  const toolUsage = deriveToolUsage(normalizedEvents);
  const referencedFiles = deriveReferencedFiles(normalizedEvents);
  const usedToolNames = deriveUsedToolNames(normalizedEvents);
  const latestVisibleTaskEvent = getLatestVisibleTaskEvent(
    baseTimelineItems,
    dedupedLiveEvents,
  );

  return {
    projectionMode,
    rawEventCount: params.rawEvents.length,
    normalizedEvents,
    filteredEvents: dedupedLiveEvents,
    liveEvents: dedupedLiveEvents,
    inspectOnlyEvents,
    debugOnlyEvents,
    parallelGroupProjection,
    parallelGroupsByAnchorEventId:
      parallelGroupProjection.groupsByAnchorEventId,
    suppressedParallelEventIds,
    toolCallPairing,
    baseTimelineItems,
    commandOutputSessions,
    planSteps,
    checklistState,
    files,
    outputSummary,
    toolUsage,
    referencedFiles,
    usedToolNames,
    latestVisibleTaskEvent,
  };
}
