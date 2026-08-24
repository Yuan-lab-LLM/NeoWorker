import { useCallback, useEffect, useState } from "react";
import type { TaskEvent, TaskStatus } from "../../../shared/types";
import type { TaskAttentionState } from "../../../shared/task-attention";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Ban,
  ChevronDown,
  ChevronRight,
  Circle,
  CircleAlert,
  CircleCheck,
  CircleX,
  Clock3,
  Globe2,
  PencilLine,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  SquareTerminal,
} from "lucide-react";
import { getEffectiveTaskEventType } from "../../utils/task-event-compat";
import { isBrowserToolName } from "../../utils/timeline-tool-labels";
import { translate, useLanguage } from "../../i18n";
import {
  localizeProgressSummary,
  localizeProgressText,
} from "../../utils/localized-progress-text";
import {
  isRecoverableWebSourceFailure,
  isWebSourceTool,
} from "../../../shared/web-source-failure";

export type ActionBlockIconKind =
  | "explore"
  | "search"
  | "command"
  | "write"
  | "web"
  | "verify"
  | "approval"
  | "generate"
  | "work";

export type ActionBlockStatus =
  | TaskAttentionState
  | "partial"
  | "cancelled"
  | "recovering"
  | "recovered"
  | "attempt_failed";

export interface ActionBlockSummary {
  /** Short summary for collapsed header, e.g. "Explored 7 files, 6 searches" */
  summary: string;
  /** Semantic icon category for the collapsed header. */
  iconKind: ActionBlockIconKind;
  /** Total number of actions in the block */
  actionCount: number;
  /** Number of steps in the block */
  stepCount: number;
  /** Number of tool calls in the block */
  toolCallCount: number;
  /** Duration in ms from first to last event in the block */
  durationMs: number;
  /** Output tokens used in the block (from llm_usage deltas) */
  outputTokens: number;
  status: ActionBlockStatus;
  approvalCount: number;
  pendingApprovalCount: number;
  errorCount: number;
  /** Candidate web sources that were unavailable but did not stop the work. */
  sourceIssueCount: number;
  /** Failed attempts superseded by a later successful fallback. */
  recoveredErrorCount: number;
  artifactCount: number;
  sourceCount: number;
}

export interface BuildActionBlockSummaryOptions {
  /** When true, use in-progress phrasing (e.g. "Exploring files…") instead of past-tense totals */
  isActive?: boolean;
  /** Used to distinguish a failed attempt from a failed final delivery. */
  taskStatus?: TaskStatus;
  /**
   * True when a newer user turn/action block already exists. Historical blocks
   * are settled even while the task as a whole is executing a later turn.
   */
  isHistoricalBlock?: boolean;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function collectStepActionText(event: TaskEvent): string {
  const payload = asObject(event.payload);
  const step = asObject(payload.step);
  return [
    typeof payload.message === "string" ? payload.message : "",
    typeof payload.description === "string" ? payload.description : "",
    typeof payload.action === "string" ? payload.action : "",
    typeof step.description === "string" ? step.description : "",
    typeof step.action === "string" ? step.action : "",
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function eventCorrelationKey(
  event: TaskEvent,
  payload: Record<string, unknown>,
  step: Record<string, unknown>,
): string {
  const direct = [payload.toolUseId, payload.callId, payload.tool_use_id].find(
    (value) => typeof value === "string" && value.trim().length > 0,
  );
  if (typeof direct === "string") return direct.trim();

  const stepId =
    (typeof event.stepId === "string" && event.stepId.trim()) ||
    (typeof payload.stepId === "string" && payload.stepId.trim()) ||
    (typeof step.id === "string" && step.id.trim()) ||
    "";
  const laneMatch = /^tool_lane:(?:step|follow_up):(.+)$/i.exec(stepId);
  if (laneMatch?.[1]) return laneMatch[1].trim();
  return stepId || event.id;
}

function inferWebToolName(
  tool: string,
  payload: Record<string, unknown>,
  step: Record<string, unknown>,
): string {
  if (isWebSourceTool(tool)) return tool;
  const text = [payload.message, payload.description, step.description]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();
  if (/\bweb_fetch\b/.test(text)) return "web_fetch";
  if (/\bweb_search\b/.test(text)) return "web_search";
  if (/\bhttp_request\b/.test(text)) return "http_request";
  return tool;
}

function isWebRetrievalTool(toolName: unknown): boolean {
  return (
    isWebSourceTool(toolName) ||
    toolName === "web_search" ||
    (typeof toolName === "string" && isBrowserToolName(toolName))
  );
}

function hasSpecificToolCorrelation(
  event: TaskEvent,
  payload: Record<string, unknown>,
  step: Record<string, unknown>,
): boolean {
  if (
    [payload.toolUseId, payload.callId, payload.tool_use_id].some(
      (value) => typeof value === "string" && value.trim().length > 0,
    )
  ) {
    return true;
  }
  const stepId =
    (typeof event.stepId === "string" && event.stepId.trim()) ||
    (typeof payload.stepId === "string" && payload.stepId.trim()) ||
    (typeof step.id === "string" && step.id.trim()) ||
    "";
  return /^tool_lane:(?:step|follow_up):/i.test(stepId);
}

function isSuccessfulWebRetrievalResult(event: TaskEvent): boolean {
  if (getEffectiveTaskEventType(event) !== "tool_result") return false;
  const payload = asObject(event.payload);
  const result = asObject(payload.result);
  const step = asObject(payload.step);
  const tool = inferWebToolName(
    typeof payload.tool === "string" ? payload.tool : "",
    payload,
    step,
  );
  if (!isWebRetrievalTool(tool)) return false;
  const envelope = asObject(payload.envelope);
  return (
    payload.error === undefined &&
    result.error === undefined &&
    result.success !== false &&
    envelope.status !== "error"
  );
}

function isSuccessfulToolResult(event: TaskEvent): boolean {
  if (getEffectiveTaskEventType(event) !== "tool_result") return false;
  const payload = asObject(event.payload);
  const result = asObject(payload.result);
  const envelope = asObject(payload.envelope);
  return (
    payload.error === undefined &&
    payload.isError !== true &&
    result.error === undefined &&
    result.success !== false &&
    envelope.status !== "error"
  );
}

function isAggregateToolBatchFailure(
  event: TaskEvent,
  effectiveType: string,
  payload: Record<string, unknown>,
): boolean {
  if (
    event.type !== "timeline_group_finished" ||
    effectiveType !== "step_failed"
  )
    return false;
  const message = [payload.groupLabel, payload.semanticSummary, payload.message]
    .filter((value): value is string => typeof value === "string")
    .join(" ");
  return (
    /\b(?:follow-up\s+)?tool batch\b/i.test(message) ||
    /\b\d+\s+succeeded\s*,\s*\d+\s+failed\b/i.test(message)
  );
}

function isWebSearchBudgetLimit(reason: string): boolean {
  return /\bweb_search\b[^\n]*\bbudget exhausted\b/i.test(reason);
}

function isGenerativeStepText(text: string): boolean {
  return /\b(generate|generating|generated|draft|drafting|compose|composing|synthesize|synthesizing)\b/.test(
    text,
  );
}

function lowerBoundEventTimestamp(
  events: readonly TaskEvent[],
  timestamp: number,
): number {
  let low = 0;
  let high = events.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if ((events[middle]?.timestamp ?? 0) < timestamp) low = middle + 1;
    else high = middle;
  }
  return low;
}

function upperBoundEventTimestamp(
  events: readonly TaskEvent[],
  timestamp: number,
): number {
  let low = 0;
  let high = events.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if ((events[middle]?.timestamp ?? 0) <= timestamp) low = middle + 1;
    else high = middle;
  }
  return low;
}

const MAX_ACTION_BLOCK_IDLE_GAP_MS = 5 * 60 * 1000;

function calculateActiveDurationMs(events: readonly TaskEvent[]): number {
  let durationMs = 0;
  for (let index = 1; index < events.length; index += 1) {
    const previous = events[index - 1]?.timestamp ?? 0;
    const current = events[index]?.timestamp ?? 0;
    const gap = current - previous;
    if (gap > 0 && gap <= MAX_ACTION_BLOCK_IDLE_GAP_MS) {
      durationMs += gap;
    }
  }
  return durationMs;
}

/**
 * Build a human-readable summary for a block of tool/step events.
 * @param events - Events in this block (used for summary, step count, time range)
 * @param allEventsForLookup - Optional full event list for tool/token lookup when block events are filtered (e.g. summary mode excludes tool_call, llm_usage)
 */
export function buildActionBlockSummary(
  events: TaskEvent[],
  allEventsForLookup?: TaskEvent[],
  options?: BuildActionBlockSummaryOptions,
): ActionBlockSummary {
  const isActive = options?.isActive === true;
  const toolCounts = new Map<string, number>();
  const stepIds = new Set<string>();
  const approvalIds = new Set<string>();
  const resolvedApprovalIds = new Set<string>();
  const errorIds = new Set<string>();
  const sourceIssueIds = new Set<string>();
  const recoveredErrorIds = new Set<string>();
  const successfulCorrelationIds = new Set<string>();
  const failureRecords = new Map<
    string,
    {
      toolName: string;
      reason: string;
      explicitlyRecoverable: boolean;
      correlated: boolean;
      blocked: boolean;
    }
  >();
  const artifactIds = new Set<string>();
  const sourceIds = new Set<string>();
  let verificationSteps = 0;
  let generativeSteps = 0;
  let approvedRequests = 0;
  let outputTokens = 0;
  let sawPartial = false;
  let sawCancelled = false;
  let successfulWebSourceCount = 0;
  let successfulWebRetrievalCount = 0;
  let successfulToolResultCount = 0;

  const blockStart = events[0]?.timestamp ?? 0;
  let blockEnd = events[events.length - 1]?.timestamp ?? 0;

  // In summary mode, block may have few events; expand blockEnd to just before next boundary so we capture all tool calls and llm_usage in that phase
  if (allEventsForLookup && allEventsForLookup.length > 0 && blockStart > 0) {
    let nextBoundary: TaskEvent | undefined;
    for (
      let index = upperBoundEventTimestamp(allEventsForLookup, blockStart);
      index < allEventsForLookup.length;
      index += 1
    ) {
      const event = allEventsForLookup[index];
      const type = getEffectiveTaskEventType(event);
      if (type === "user_message" || type === "assistant_message") {
        nextBoundary = event;
        break;
      }
    }
    if (nextBoundary) {
      const nextTs = (nextBoundary.timestamp ?? 0) - 1;
      if (nextTs > blockEnd) blockEnd = nextTs;
    }
  }

  // In summary mode, block events may exclude tool_call and llm_usage; use full events in time range
  const eventsInRange =
    allEventsForLookup &&
    allEventsForLookup.length > 0 &&
    (blockStart > 0 || blockEnd > 0)
      ? allEventsForLookup.slice(
          lowerBoundEventTimestamp(allEventsForLookup, blockStart),
          upperBoundEventTimestamp(allEventsForLookup, blockEnd),
        )
      : events;

  for (const event of eventsInRange) {
    const effectiveType = getEffectiveTaskEventType(event);
    const payload = asObject(event.payload);
    const step = asObject(payload.step);
    const tool = typeof payload.tool === "string" ? payload.tool : "";
    const inferredTool = inferWebToolName(tool, payload, step);
    const correlationKey = eventCorrelationKey(event, payload, step);
    const hasToolCorrelation =
      [payload.toolUseId, payload.callId, payload.tool_use_id].some(
        (value) => typeof value === "string" && value.trim().length > 0,
      ) ||
      (typeof event.stepId === "string" && event.stepId.trim().length > 0) ||
      (typeof step.id === "string" && step.id.trim().length > 0);
    if (effectiveType === "tool_call" && tool) {
      toolCounts.set(tool, (toolCounts.get(tool) || 0) + 1);
    }

    const isStepEvent =
      effectiveType === "step_started" ||
      effectiveType === "step_completed" ||
      effectiveType === "step_failed" ||
      event.type === "timeline_step_started" ||
      event.type === "timeline_step_updated" ||
      event.type === "timeline_step_finished";
    if (isStepEvent) {
      const stepId =
        event.stepId ||
        (typeof payload.stepId === "string" ? payload.stepId : "") ||
        (typeof step.id === "string" ? step.id : "") ||
        event.id;
      stepIds.add(stepId);
      if (isGenerativeStepText(collectStepActionText(event)))
        generativeSteps += 1;
    }

    if (
      effectiveType === "verification_started" ||
      effectiveType === "verification_passed" ||
      effectiveType === "verification_failed" ||
      effectiveType === "verification_pending_user_action"
    ) {
      verificationSteps += 1;
    }

    const approval = asObject(payload.approval);
    const approvalId =
      (typeof payload.approvalId === "string" ? payload.approvalId : "") ||
      (typeof payload.requestId === "string" ? payload.requestId : "") ||
      (typeof approval.id === "string" ? approval.id : "") ||
      event.id;
    if (
      effectiveType === "approval_requested" &&
      payload.autoApproved !== true
    ) {
      approvalIds.add(approvalId);
    }
    if (
      effectiveType === "approval_granted" ||
      effectiveType === "approval_denied"
    ) {
      resolvedApprovalIds.add(approvalId);
      if (effectiveType === "approval_granted") approvedRequests += 1;
    }

    if (effectiveType === "tool_result" && isWebSourceTool(tool)) {
      const result = asObject(payload.result);
      const succeeded =
        payload.error === undefined &&
        result.error === undefined &&
        result.success !== false;
      if (succeeded) successfulWebSourceCount += 1;
      if (
        hasToolCorrelation &&
        result.success === false &&
        (result.recoverableFallback === true || result.nonBlocking === true)
      ) {
        sourceIssueIds.add(correlationKey);
      }
    }

    if (isSuccessfulToolResult(event)) {
      successfulToolResultCount += 1;
      if (hasSpecificToolCorrelation(event, payload, step)) {
        successfulCorrelationIds.add(correlationKey);
      }
    }

    if (isSuccessfulWebRetrievalResult(event)) {
      successfulWebRetrievalCount += 1;
    }

    if (
      effectiveType === "tool_warning" &&
      isWebSourceTool(inferredTool) &&
      (payload.recoverableFallback === true || payload.advisory === true)
    ) {
      sourceIssueIds.add(correlationKey);
    }

    const isExplicitFailure =
      effectiveType === "tool_error" ||
      effectiveType === "error" ||
      event.type === "timeline_error" ||
      effectiveType === "step_failed";
    if (
      isExplicitFailure &&
      !isAggregateToolBatchFailure(event, effectiveType, payload)
    ) {
      const existing = failureRecords.get(correlationKey);
      const reason =
        (typeof payload.error === "string" && payload.error) ||
        existing?.reason ||
        (typeof payload.message === "string" && payload.message) ||
        "";
      failureRecords.set(correlationKey, {
        toolName: inferredTool || existing?.toolName || "",
        reason,
        explicitlyRecoverable:
          payload.recoverableFallback === true ||
          payload.advisory === true ||
          existing?.explicitlyRecoverable === true,
        correlated:
          hasSpecificToolCorrelation(event, payload, step) ||
          existing?.correlated === true,
        blocked: payload.blocked === true || existing?.blocked === true,
      });
    }

    if (
      effectiveType === "artifact_created" ||
      event.type === "timeline_artifact_emitted" ||
      effectiveType === "image_generated" ||
      effectiveType === "diagram_created"
    ) {
      const artifactId =
        (typeof payload.artifactId === "string" ? payload.artifactId : "") ||
        event.id;
      artifactIds.add(artifactId);
    }

    if (event.type === "timeline_evidence_attached") {
      const refs = Array.isArray(payload.evidenceRefs)
        ? payload.evidenceRefs
        : [];
      for (const ref of refs) {
        const value = asObject(ref);
        const sourceId =
          (typeof value.evidenceId === "string" ? value.evidenceId : "") ||
          (typeof value.sourceUrlOrPath === "string"
            ? value.sourceUrlOrPath
            : "");
        if (sourceId) sourceIds.add(sourceId);
      }
    }

    const eventStatus =
      event.status ||
      (typeof payload.status === "string" ? payload.status : "");
    if (eventStatus === "cancelled") sawCancelled = true;
    if (eventStatus === "partial" || eventStatus === "partial_success")
      sawPartial = true;

    if (event.type === "llm_usage") {
      const delta = asObject(payload.delta);
      const out =
        typeof delta.outputTokens === "number" ? delta.outputTokens : 0;
      outputTokens += Number.isFinite(out) ? out : 0;
    }
  }

  let laterSuccessfulWebRetrievalCount = 0;
  if (allEventsForLookup && allEventsForLookup.length > 0) {
    for (
      let index = upperBoundEventTimestamp(allEventsForLookup, blockEnd);
      index < allEventsForLookup.length;
      index += 1
    ) {
      const event = allEventsForLookup[index];
      if (getEffectiveTaskEventType(event) === "user_message") break;
      if (isSuccessfulWebRetrievalResult(event)) {
        laterSuccessfulWebRetrievalCount += 1;
      }
    }
  }

  const correlatedFailureSignatures = new Set(
    Array.from(failureRecords.values())
      .filter((failure) => failure.correlated)
      .map(
        (failure) =>
          `${failure.toolName.trim().toLowerCase()}::${failure.reason.trim().toLowerCase()}`,
      ),
  );

  for (const [failureKey, failure] of failureRecords) {
    const signature = `${failure.toolName.trim().toLowerCase()}::${failure.reason.trim().toLowerCase()}`;
    // The runtime may emit a provider-level log in addition to one correlated
    // result per call. Count the actual calls, not that duplicate log row.
    if (!failure.correlated && correlatedFailureSignatures.has(signature)) {
      continue;
    }
    const recoverableSourceFailure =
      isWebSourceTool(failure.toolName) &&
      (failure.explicitlyRecoverable ||
        (successfulWebSourceCount > 0 &&
          isRecoverableWebSourceFailure(failure.reason)));
    const recoveredByLaterFallback =
      isWebRetrievalTool(failure.toolName) &&
      laterSuccessfulWebRetrievalCount > 0 &&
      isRecoverableWebSourceFailure(failure.reason);
    const recoveredInsideBlock =
      isWebRetrievalTool(failure.toolName) &&
      successfulWebRetrievalCount > 0 &&
      isRecoverableWebSourceFailure(failure.reason);
    const recoveredBySameCall = successfulCorrelationIds.has(failureKey);
    const recoveredByCompletedFallback =
      options?.taskStatus === "completed" &&
      failure.blocked &&
      (successfulToolResultCount > 0 || artifactIds.size > 0);
    const budgetLimitedSearch =
      isWebRetrievalTool(failure.toolName) &&
      isWebSearchBudgetLimit(failure.reason);
    if (
      recoveredByLaterFallback ||
      recoveredBySameCall ||
      recoveredByCompletedFallback
    ) {
      recoveredErrorIds.add(failureKey);
    } else if (
      recoverableSourceFailure ||
      recoveredInsideBlock ||
      budgetLimitedSearch
    ) {
      sourceIssueIds.add(failureKey);
    } else errorIds.add(failureKey);
  }

  const stepCount = stepIds.size;
  const totalTools = Array.from(toolCounts.values()).reduce((a, b) => a + b, 0);
  const pendingApprovalCount = Array.from(approvalIds).reduce(
    (count, id) => count + (resolvedApprovalIds.has(id) ? 0 : 1),
    0,
  );
  const approvalCount = Math.max(approvalIds.size, resolvedApprovalIds.size);
  const errorCount = errorIds.size;
  const sourceIssueCount = sourceIssueIds.size;
  const recoveredErrorCount = recoveredErrorIds.size;
  const artifactCount = artifactIds.size;
  const sourceCount = sourceIds.size;

  const parts: string[] = [];
  const readFiles =
    (toolCounts.get("read_file") || 0) +
    (toolCounts.get("read_files") || 0) +
    (toolCounts.get("list_directory") || 0) +
    (toolCounts.get("glob") || 0);
  const searches =
    (toolCounts.get("grep") || 0) +
    (toolCounts.get("search_files") || 0) +
    (toolCounts.get("context_grep") || 0);
  const createdFiles = toolCounts.get("write_file") || 0;
  const editedFiles = toolCounts.get("edit_file") || 0;
  const writes = createdFiles + editedFiles;
  const commands =
    (toolCounts.get("run_command") || 0) +
    (toolCounts.get("run_skill") || 0) +
    (toolCounts.get("execute_code") || 0);
  const webLookups =
    (toolCounts.get("web_fetch") || 0) +
    (toolCounts.get("web_search") || 0) +
    (toolCounts.get("http_request") || 0) +
    Array.from(toolCounts.entries()).reduce(
      (sum, [tool, count]) => sum + (isBrowserToolName(tool) ? count : 0),
      0,
    );
  const iconKind: ActionBlockIconKind =
    approvedRequests > 0
      ? "approval"
      : writes > 0
        ? "write"
        : commands > 0
          ? "command"
          : searches > 0 || readFiles > 0
            ? "search"
            : webLookups > 0
              ? "web"
              : verificationSteps > 0
                ? "verify"
                : generativeSteps > 0
                  ? "generate"
                  : "work";

  if (isActive) {
    if (approvedRequests > 0) {
      parts.push("Approved requests…");
    }
    if (readFiles > 0 && searches > 0) {
      parts.push("Exploring files and searching the codebase…");
    } else if (readFiles > 0) {
      parts.push("Reading files…");
    } else if (searches > 0) {
      parts.push("Searching the codebase…");
    }
    if (webLookups > 0) {
      parts.push("Gathering web sources…");
    }
    if (writes > 0) {
      if (createdFiles > 0 && editedFiles === 0) {
        parts.push("Creating files…");
      } else {
        parts.push("Editing files…");
      }
    }
    if (commands > 0) {
      parts.push("Running commands…");
    }
    if (parts.length === 0 && stepCount > 0) {
      parts.push("Working…");
    } else if (parts.length === 0 && totalTools > 0) {
      parts.push("Working…");
    }
  } else {
    if (approvedRequests > 0) {
      parts.push(
        `Approved ${approvedRequests} request${approvedRequests === 1 ? "" : "s"}`,
      );
    }
    if (createdFiles > 0 && editedFiles > 0) {
      parts.push(
        `Created ${createdFiles} file${createdFiles === 1 ? "" : "s"}, edited ${editedFiles} file${editedFiles === 1 ? "" : "s"}`,
      );
    } else if (createdFiles > 0) {
      parts.push(
        `Created ${createdFiles} file${createdFiles === 1 ? "" : "s"}`,
      );
    } else if (editedFiles > 0) {
      parts.push(`Edited ${editedFiles} file${editedFiles === 1 ? "" : "s"}`);
    }
    if (readFiles > 0 && searches > 0) {
      parts.push(
        `Explored ${readFiles} file${readFiles === 1 ? "" : "s"}, ${searches} search${searches === 1 ? "" : "es"}`,
      );
    } else if (readFiles > 0) {
      parts.push(`Explored ${readFiles} file${readFiles === 1 ? "" : "s"}`);
    } else if (searches > 0) {
      parts.push(`Searched ${searches} time${searches === 1 ? "" : "s"}`);
    }
    if (webLookups > 0) {
      parts.push(`${webLookups} web lookup${webLookups === 1 ? "" : "s"}`);
    }
    if (commands > 0) {
      parts.push(
        `${parts.length > 0 ? "ran" : "Ran"} ${commands} command${commands === 1 ? "" : "s"}`,
      );
    }
    if (stepCount > 0 && parts.length === 0)
      parts.push(`${stepCount} step${stepCount === 1 ? "" : "s"}`);
  }

  const summary =
    parts.length > 0
      ? localizeProgressSummary(parts)
      : totalTools > 0
        ? localizeProgressText(
            `${totalTools} action${totalTools === 1 ? "" : "s"}`,
          )
        : localizeProgressText(
            `${events.length} step${events.length === 1 ? "" : "s"}`,
          );

  // Duration: use full events in range when available for more accurate span (summary mode may have fewer block events)
  const rangeEvents = eventsInRange.length >= 2 ? eventsInRange : events;
  const durationMs = calculateActiveDurationMs(rangeEvents);

  const failedAttemptStatus: ActionBlockStatus =
    options?.isHistoricalBlock || options?.taskStatus === "completed"
      ? "attempt_failed"
      : options?.taskStatus &&
          !["failed", "cancelled", "blocked"].includes(options.taskStatus)
        ? "recovering"
        : "failed";
  const status: ActionBlockStatus =
    pendingApprovalCount > 0
      ? "needs_approval"
      : sawCancelled
        ? "cancelled"
        : errorCount > 0
          ? failedAttemptStatus
          : recoveredErrorCount > 0
            ? "recovered"
            : isActive
              ? "working"
              : sawPartial
                ? "partial"
                : "done";

  return {
    summary,
    iconKind,
    actionCount: totalTools + stepCount || events.length,
    stepCount,
    toolCallCount: totalTools,
    durationMs,
    outputTokens,
    status,
    approvalCount,
    pendingApprovalCount,
    errorCount,
    sourceIssueCount,
    recoveredErrorCount,
    artifactCount,
    sourceCount,
  };
}

function formatDurationMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "";
  if (ms > 0 && ms < 1000) return "<1s";
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${String(remainingSeconds).padStart(2, "0")}s`;
}

function formatTokenCount(count: number): string {
  if (!Number.isFinite(count) || count < 0) return "0";
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 10_000) return `${Math.round(count / 1_000)}k`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}k`;
  return count.toLocaleString();
}

interface ActionBlockProps {
  blockId: string;
  summary: string;
  iconKind: ActionBlockIconKind;
  stepCount: number;
  toolCallCount: number;
  durationMs: number;
  outputTokens: number;
  status?: ActionBlockStatus;
  approvalCount?: number;
  pendingApprovalCount?: number;
  errorCount?: number;
  sourceIssueCount?: number;
  recoveredErrorCount?: number;
  artifactCount?: number;
  isActive: boolean;
  expanded: boolean;
  onToggle: () => void;
  showConnectorAbove?: boolean;
  showConnectorBelow?: boolean;
  /** Last step label shown centered in the header when collapsed */
  lastStepLabel?: string;
  children: React.ReactNode;
}

const ACTION_BLOCK_ICONS: Record<ActionBlockIconKind, LucideIcon> = {
  explore: Search,
  search: Search,
  command: SquareTerminal,
  write: PencilLine,
  web: Globe2,
  verify: ShieldCheck,
  approval: CircleCheck,
  generate: Sparkles,
  work: Activity,
};

const ACTION_BLOCK_ICON_LABELS: Record<ActionBlockIconKind, string> = {
  explore: "Exploration activity",
  search: "Search activity",
  command: "Command activity",
  write: "File change activity",
  web: "Web activity",
  verify: "Verification activity",
  approval: "Approved activity",
  generate: "Generation activity",
  work: "Agent activity",
};

const ACTION_BLOCK_STATUS_ICONS: Record<ActionBlockStatus, LucideIcon> = {
  idle: Circle,
  working: Activity,
  waiting: Clock3,
  needs_approval: ShieldAlert,
  needs_attention: CircleAlert,
  done: CircleCheck,
  failed: CircleX,
  partial: CircleAlert,
  cancelled: Ban,
  recovering: RefreshCw,
  recovered: CircleCheck,
  attempt_failed: CircleCheck,
};

function getActionBlockStatusLabel(status: ActionBlockStatus): string {
  const labels: Record<ActionBlockStatus, [string, string]> = {
    idle: ["task.attention.idle", "Not started"],
    working: ["task.attention.working", "In progress"],
    waiting: ["task.attention.waiting", "Waiting"],
    needs_approval: ["task.attention.needsApproval", "Needs approval"],
    needs_attention: ["task.attention.needsAttention", "Needs attention"],
    done: ["task.attention.done", "Completed"],
    failed: ["task.attention.failed", "Failed"],
    partial: ["task.attention.partial", "Partially completed"],
    cancelled: ["task.attention.cancelled", "Cancelled"],
    recovering: ["task.attention.recovering", "Trying another way"],
    recovered: ["task.attention.recovered", "Recovered"],
    attempt_failed: ["task.attention.attemptFailed", "Run ended"],
  };
  const [key, fallback] = labels[status];
  return translate(key, fallback);
}

/**
 * Collapsible block for actions (tool calls, steps) between assistant messages.
 * Cursor-style: expanded while active, collapsed when next assistant message arrives.
 */
export function ActionBlock({
  blockId,
  summary,
  iconKind,
  stepCount,
  toolCallCount,
  durationMs,
  outputTokens,
  isActive,
  status = isActive ? "working" : "done",
  approvalCount = 0,
  pendingApprovalCount = 0,
  errorCount = 0,
  sourceIssueCount = 0,
  recoveredErrorCount = 0,
  artifactCount = 0,
  expanded,
  onToggle,
  showConnectorAbove = false,
  showConnectorBelow = false,
  lastStepLabel,
  children,
}: ActionBlockProps) {
  useLanguage();
  const t = translate;
  const [localExpanded, setLocalExpanded] = useState(expanded);
  const ActivityIcon = ACTION_BLOCK_ICONS[iconKind];
  const StatusIcon = ACTION_BLOCK_STATUS_ICONS[status];
  const statusLabel = getActionBlockStatusLabel(status);

  useEffect(() => {
    setLocalExpanded(expanded);
  }, [blockId, expanded]);

  const visibleExpanded = localExpanded;

  const handleToggle = useCallback(() => {
    setLocalExpanded((prev) => !prev);
    onToggle();
  }, [onToggle]);

  return (
    <div
      className={`action-block timeline-event ${visibleExpanded ? "expanded" : "collapsed"} ${isActive ? "active" : ""}`}
    >
      <div className="event-indicator action-block-indicator">
        {showConnectorAbove && (
          <span
            className="event-connector event-connector-above"
            aria-hidden="true"
          />
        )}
        <span className="action-block-dot" aria-hidden="true" />
        {showConnectorBelow && (
          <span
            className="event-connector event-connector-below"
            aria-hidden="true"
          />
        )}
      </div>
      <div className="action-block-body event-content">
        <button
          type="button"
          className="action-block-header"
          onClick={handleToggle}
          aria-expanded={visibleExpanded}
          aria-controls={`action-block-content-${blockId}`}
          id={`action-block-toggle-${blockId}`}
        >
          <span className="action-block-chevron" aria-hidden="true">
            {visibleExpanded ? (
              <ChevronDown size={14} strokeWidth={2.5} />
            ) : (
              <ChevronRight size={14} strokeWidth={2.5} />
            )}
          </span>
          <span
            className={`action-block-kind-icon kind-${iconKind}`}
            title={t(
              `timeline.actionBlock.${iconKind}`,
              ACTION_BLOCK_ICON_LABELS[iconKind],
            )}
          >
            <ActivityIcon size={16} strokeWidth={1.8} aria-hidden="true" />
          </span>
          <span className="action-block-summary">{summary}</span>
          <span
            className={`action-block-status status-${status}`}
            title={statusLabel}
          >
            <StatusIcon size={13} strokeWidth={2.2} aria-hidden="true" />
            <span>{statusLabel}</span>
          </span>
          {!visibleExpanded && lastStepLabel && (
            <span
              className="action-block-last-step-label"
              aria-label={t("timeline.lastStep", "Last step")}
            >
              {lastStepLabel}
            </span>
          )}
          <span className="action-block-meta">
            {stepCount > 0 && (
              <span className="action-block-count">
                {t("timeline.stepCount", "{count} steps", { count: stepCount })}
              </span>
            )}
            {toolCallCount > 0 && (
              <span className="action-block-count">
                {stepCount > 0 && (
                  <span className="action-block-stats-sep"> · </span>
                )}
                {t("timeline.toolCallCount", "{count} tool calls", {
                  count: toolCallCount,
                })}
              </span>
            )}
            {approvalCount > 0 && (
              <span className="action-block-count">
                {(stepCount > 0 || toolCallCount > 0) && (
                  <span className="action-block-stats-sep"> · </span>
                )}
                {pendingApprovalCount > 0
                  ? t(
                      "task.actionGroup.pendingApproval",
                      "{count} awaiting approval",
                      {
                        count: pendingApprovalCount,
                      },
                    )
                  : t("task.actionGroup.approvals", "{count} approvals", {
                      count: approvalCount,
                    })}
              </span>
            )}
            {errorCount > 0 && status !== "attempt_failed" && (
              <span
                className={`action-block-count${status === "failed" ? " action-block-count-error" : ""}`}
                title={
                  status === "failed"
                    ? undefined
                    : t(
                        "task.actionGroup.nonBlockingErrorHint",
                        "The task is continuing normally. Expand to review the action log.",
                        { count: errorCount },
                      )
                }
              >
                <span className="action-block-stats-sep"> · </span>
                {status === "failed"
                  ? t("task.actionGroup.errors", "{count} errors", {
                      count: errorCount,
                    })
                  : status === "recovering"
                    ? t(
                        "task.actionGroup.unsuccessfulActionsContinuing",
                        "Adjusting automatically; the task is continuing",
                        { count: errorCount },
                      )
                    : t(
                        "task.actionGroup.unsuccessfulActionsNonBlocking",
                        "Necessary adjustments were completed automatically",
                        { count: errorCount },
                      )}
              </span>
            )}
            {recoveredErrorCount > 0 && (
              <span className="action-block-count action-block-count-recovered">
                <span className="action-block-stats-sep"> · </span>
                {t(
                  "task.actionGroup.attemptsRecovered",
                  "{count} attempts recovered",
                  {
                    count: recoveredErrorCount,
                  },
                )}
              </span>
            )}
            {sourceIssueCount > 0 && (
              <span className="action-block-count action-block-count-source-issue">
                <span className="action-block-stats-sep"> · </span>
                {t(
                  "task.actionGroup.sourcesSkipped",
                  "{count} sources skipped",
                  {
                    count: sourceIssueCount,
                  },
                )}
              </span>
            )}
            {artifactCount > 0 && (
              <span className="action-block-count">
                <span className="action-block-stats-sep"> · </span>
                {t("task.actionGroup.artifacts", "{count} artifacts", {
                  count: artifactCount,
                })}
              </span>
            )}
            {(durationMs > 0 || outputTokens > 0) && (
              <span className="action-block-stats">
                {(stepCount > 0 || toolCallCount > 0) &&
                  (durationMs > 0 || outputTokens > 0) && (
                    <span className="action-block-stats-sep"> · </span>
                  )}
                {durationMs > 0 && formatDurationMs(durationMs)}
                {durationMs > 0 && outputTokens > 0 && (
                  <span className="action-block-stats-sep"> · </span>
                )}
                {outputTokens > 0 && (
                  <span title={t("timeline.outputTokens", "Output tokens")}>
                    {t("timeline.outputTokensValue", "↓ {count} tokens", {
                      count: formatTokenCount(outputTokens),
                    })}
                  </span>
                )}
              </span>
            )}
          </span>
        </button>
        <div
          id={`action-block-content-${blockId}`}
          className="action-block-content"
          role="region"
          aria-labelledby={`action-block-toggle-${blockId}`}
          hidden={!visibleExpanded}
        >
          {visibleExpanded && (
            <div className="action-block-events">{children}</div>
          )}
        </div>
      </div>
    </div>
  );
}
