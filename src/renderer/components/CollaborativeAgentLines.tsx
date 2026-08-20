/**
 * CollaborativeAgentLines
 *
 * Compact agent status lines shown above the message input when a collaborative
 * run is active. Each line shows agent name, latest status, and an Open button.
 * Matches the UX of "agents as lines over the input" with latest updates per agent.
 */

import { useEffect, useId, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type {
  Task,
  AgentTeamRun,
  AgentThought,
  TaskEvent,
  AgentRole,
} from "../../shared/types";
import { isSynthesisChildTask } from "../../shared/synthesis-agent-detection";
import { getEmojiIcon } from "../utils/emoji-icon-map";
import { stripLeadingEmoji } from "../utils/emoji-replacer";
import { getEffectiveTaskEventType } from "../utils/task-event-compat";
import { sanitizeToolCallTextFromAssistant } from "../../shared/tool-call-text-sanitizer";
import { translate, useLanguage } from "../i18n";
import { localizeProgressText } from "../utils/localized-progress-text";
import {
  getLocalizedSubagentDisplay,
  type AgentRoleDisplayLike,
} from "../utils/localized-agent-roles";

interface CollaborativeAgentLinesProps {
  collaborativeRun: AgentTeamRun;
  childTasks: Task[];
  childEvents?: TaskEvent[];
  onOpenAgent: (taskId: string) => void;
  onWrapUp?: () => void;
  isWrappingUp?: boolean;
  /** When true, main task is done — hide Wrap Up */
  mainTaskCompleted?: boolean;
}

interface AgentLine {
  id: string;
  title: string;
  status: string;
  statusKind: AgentLineStatusKind;
  statusLabel: string;
  isStreaming: boolean;
  taskId: string | null; // null when not yet spawned
  icon?: string;
  role?: AgentRoleDisplayLike;
  task?: Task | null;
}

type AgentLineStatusKind =
  | "completed"
  | "failed"
  | "partial"
  | "needs-action"
  | "approval"
  | "resumable"
  | "running"
  | "pending";

const STEP_EVENT_TYPES = new Set([
  "step_started",
  "step_completed",
  "step_failed",
  "progress_update",
]);

const FAILURE_EVENT_TYPES = new Set([
  "step_failed",
  "timeline_error",
  "agent_failed",
  "workflow_phase_failed",
  "orchestration_node_failed",
]);

const STAGE_NAMES = new Set(["DISCOVER", "BUILD", "VERIFY", "FIX", "DELIVER"]);

/** Exclude tool-batch summary events; prefer granular tool steps (grep done, Running glob, etc.) */
function isToolBatchSummaryEvent(event: TaskEvent): boolean {
  if (event.type === "timeline_group_finished") return true;
  const p = (event.payload || {}) as Record<string, unknown>;
  const msg = String(p?.message || "").trim();
  return /^Tool batch:\s*\d+\s+succeeded/i.test(msg);
}

function isStageBoundaryEvent(event: TaskEvent): boolean {
  if (
    event.type !== "timeline_group_started" &&
    event.type !== "timeline_group_finished"
  ) {
    return false;
  }
  const p = (event.payload || {}) as Record<string, unknown>;
  const stage = String(p?.stage || "").toUpperCase();
  if (!STAGE_NAMES.has(stage)) return false;
  const groupId = String(event.groupId || p?.groupId || "").toLowerCase();
  const message = String(p?.message || p?.groupLabel || "")
    .trim()
    .toUpperCase();
  return (
    groupId === `stage:${stage.toLowerCase()}` ||
    message === `STARTING ${stage}` ||
    message === stage
  );
}

/** Format tool/step labels for compact display (e.g. "grep done", "web search started") */
function formatStepLabel(type: string, desc: string): string {
  const d = desc.trim();
  if (!d)
    return localizeProgressText(
      type === "step_failed" ? "Step failed" : "Working on your request",
    );
  const running = /^Running\s+(.+)$/i.exec(d);
  const completed = /^(.+?)\s+completed$/i.exec(d);
  const failed = /^(.+?)\s+finished with issues$/i.exec(d);
  const humanize = (s: string) => s.trim().replace(/_/g, " ");
  if (running) return localizeProgressText(`${humanize(running[1])} started`);
  if (completed) return localizeProgressText(`${humanize(completed[1])} done`);
  if (failed) return localizeProgressText(`${humanize(failed[1])} failed`);
  if (type === "step_completed" && /^[a-z0-9_]+$/i.test(d))
    return localizeProgressText(`${humanize(d)} done`);
  if (type === "step_started" && /^[a-z0-9_]+$/i.test(d))
    return localizeProgressText(`${humanize(d)} started`);
  return localizeProgressText(humanize(d));
}

function getStepLabelFromEvent(event: TaskEvent): string {
  const type = getEffectiveTaskEventType(event);
  const p = (event.payload || {}) as Record<string, unknown>;
  const step = p?.step as Record<string, unknown> | undefined;
  const sanitize = (v: unknown) =>
    sanitizeToolCallTextFromAssistant(String(v || "")).text;
  const desc = sanitize(
    step?.description || p?.description || p?.message || "",
  ).trim();
  switch (type) {
    case "step_started":
      return (
        formatStepLabel(type, desc) ||
        localizeProgressText("Working on your request")
      );
    case "step_completed":
      return (
        formatStepLabel(type, desc) || localizeProgressText("Step completed")
      );
    case "step_failed": {
      if (!desc) return localizeProgressText("Step failed");
      const label = formatStepLabel(type, desc);
      return /\b(failed|error|issues|stopped|失败)\b/i.test(label)
        ? label
        : localizeProgressText(`Failed: ${label}`);
    }
    case "timeline_error":
    case "agent_failed":
    case "workflow_phase_failed":
    case "orchestration_node_failed":
      return localizeProgressText(desc ? `Failed: ${desc}` : "Failed");
    case "progress_update":
      return localizeProgressText(desc || "Working on your request");
    default:
      return "";
  }
}

function getFailureLabel(
  taskId: string,
  childEvents: TaskEvent[],
): string | null {
  const failure = childEvents
    .filter(
      (e) =>
        e.taskId === taskId &&
        FAILURE_EVENT_TYPES.has(getEffectiveTaskEventType(e)),
    )
    .sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))[0];
  if (!failure) return null;
  return getStepLabelFromEvent(failure) || localizeProgressText("Failed");
}

function getTerminalTaskLabel(
  taskId: string,
  childEvents: TaskEvent[],
  task: Task,
): string | null {
  switch (task.terminalStatus) {
    case "partial_success":
      return localizeProgressText("Completed with warnings");
    case "needs_user_action":
      return localizeProgressText("Needs user action");
    case "awaiting_approval":
      return localizeProgressText("Awaiting approval");
    case "resume_available":
      return localizeProgressText("Paused");
    case "failed":
      return (
        getFailureLabel(taskId, childEvents) ||
        task.error ||
        localizeProgressText("Failed")
      );
    default:
      break;
  }

  switch (task.status) {
    case "completed":
      return localizeProgressText("Completed");
    case "failed":
      return (
        getFailureLabel(taskId, childEvents) ||
        task.error ||
        localizeProgressText("Failed")
      );
    case "cancelled":
      return localizeProgressText("Cancelled");
    default:
      return null;
  }
}

function getLatestStepLabel(
  taskId: string,
  childEvents: TaskEvent[],
  task: Task | null,
  isStreaming: boolean,
): string {
  if (isStreaming) return localizeProgressText("Working on your request");
  if (!task) return localizeProgressText("Awaiting instruction");
  const terminalLabel = getTerminalTaskLabel(taskId, childEvents, task);
  if (terminalLabel) return terminalLabel;
  const taskEvents = childEvents
    .filter(
      (e) =>
        e.taskId === taskId &&
        STEP_EVENT_TYPES.has(getEffectiveTaskEventType(e)) &&
        !isToolBatchSummaryEvent(e) &&
        !isStageBoundaryEvent(e),
    )
    .sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
  const latest = taskEvents[0];
  if (latest) {
    const label = getStepLabelFromEvent(latest);
    if (label) return label;
  }
  switch (task.status) {
    case "executing":
    case "planning":
      return localizeProgressText("Working on your request");
    case "completed":
      return localizeProgressText("Completed");
    case "failed":
    case "cancelled":
      return localizeProgressText("Stopped");
    default:
      return localizeProgressText("Awaiting instruction");
  }
}

function getAgentLineStatusKind(
  task: Task | null,
  status: string,
  isStreaming: boolean,
): AgentLineStatusKind {
  if (
    task?.terminalStatus === "failed" ||
    task?.status === "failed" ||
    task?.status === "cancelled"
  )
    return "failed";
  if (task?.terminalStatus === "partial_success") return "partial";
  if (task?.terminalStatus === "needs_user_action") return "needs-action";
  if (task?.terminalStatus === "awaiting_approval") return "approval";
  if (task?.terminalStatus === "resume_available") return "resumable";
  if (task?.status === "completed") return "completed";
  if (status.startsWith("Step failed") || status.startsWith("Failed"))
    return "failed";
  if (
    isStreaming ||
    task?.status === "executing" ||
    task?.status === "planning"
  )
    return "running";
  return "pending";
}

function getAgentLineStatusLabel(
  kind: AgentLineStatusKind,
  task: Task | null,
): string {
  if (kind === "completed") return translate("collab.lines.done", "Done");
  if (kind === "failed")
    return task?.status === "cancelled"
      ? translate("collab.lines.cancelled", "Cancelled")
      : translate("collab.lines.failed", "Failed");
  if (kind === "partial")
    return translate("collab.lines.partial", "Partially completed");
  if (kind === "needs-action")
    return translate("collab.lines.needsAction", "Action needed");
  if (kind === "approval")
    return translate("collab.lines.awaitingApproval", "Awaiting approval");
  if (kind === "resumable")
    return translate("collab.lines.resumable", "Ready to resume");
  if (kind === "running") return translate("collab.lines.running", "Running");
  return translate("collab.lines.pending", "Pending");
}

function getAgentLineActionLabel(kind: AgentLineStatusKind): string {
  if (kind === "partial")
    return translate("collab.lines.action.viewIssues", "View issues");
  if (kind === "needs-action")
    return translate("collab.lines.action.handle", "Handle");
  if (kind === "approval")
    return translate("collab.lines.action.approve", "Review approval");
  if (kind === "resumable")
    return translate("collab.lines.action.resume", "Resume");
  return translate("common.open", "Open");
}

function getSummaryPart(count: number, label: string): string | null {
  return count > 0 ? `${count} ${label}` : null;
}

function formatAgentSummary(
  counts: Record<AgentLineStatusKind, number>,
): string {
  return [
    getSummaryPart(
      counts.completed,
      translate("collab.lines.summary.done", "done"),
    ),
    getSummaryPart(
      counts.failed,
      translate("collab.lines.summary.failed", "failed"),
    ),
    getSummaryPart(
      counts.partial,
      translate("collab.lines.summary.partial", "partially completed"),
    ),
    getSummaryPart(
      counts["needs-action"],
      translate("collab.lines.summary.needsAction", "need action"),
    ),
    getSummaryPart(
      counts.approval,
      translate("collab.lines.summary.awaitingApproval", "awaiting approval"),
    ),
    getSummaryPart(
      counts.resumable,
      translate("collab.lines.summary.resumable", "ready to resume"),
    ),
    getSummaryPart(
      counts.running,
      translate("collab.lines.summary.running", "running"),
    ),
    getSummaryPart(
      counts.pending,
      translate("collab.lines.summary.pending", "pending"),
    ),
  ]
    .filter(Boolean)
    .join(" · ");
}

export function CollaborativeAgentLines({
  collaborativeRun,
  childTasks,
  childEvents = [],
  onOpenAgent,
  onWrapUp,
  isWrappingUp,
  mainTaskCompleted = false,
}: CollaborativeAgentLinesProps) {
  const language = useLanguage();
  const t = translate;
  const [isExpanded, setIsExpanded] = useState(true);
  const agentListId = useId();
  const [streamingByAgent, setStreamingByAgent] = useState<
    Map<string, AgentThought>
  >(new Map());
  const isMultiLlm = collaborativeRun.multiLlmMode === true;

  // Subscribe to streaming thoughts for "is thinking" indicator (maps agentRoleId -> thought)
  // Team items link child tasks to agent roles; we match via listTeamItems when needed
  const [teamItems, setTeamItems] = useState<
    Array<{
      id: string;
      title: string;
      sourceTaskId?: string;
      ownerAgentRoleId?: string;
      sortOrder?: number;
      icon?: string;
    }>
  >([]);
  const [agentRoles, setAgentRoles] = useState<
    Map<string, AgentRoleDisplayLike & { icon?: string }>
  >(new Map());
  useEffect(() => {
    window.electronAPI
      .listTeamItems(collaborativeRun.id)
      .then((items: Any[]) => setTeamItems(items))
      .catch(() => {});
  }, [collaborativeRun.id]);

  // Subscribe to team item events so sourceTaskId is updated as soon as tasks are spawned.
  // Without this, teamItems holds stale null sourceTaskIds, defeating the deduplication
  // check at render time and causing "ghost" agent lines alongside the real child task lines.
  useEffect(() => {
    const unsub = window.electronAPI.onTeamRunEvent(
      (event: { runId?: string; type?: string; item?: Any }) => {
        if (event.runId !== collaborativeRun.id) return;
        if (
          (event.type === "team_item_spawned" ||
            event.type === "team_item_updated") &&
          event.item
        ) {
          setTeamItems((prev) => {
            const idx = prev.findIndex((i) => i.id === event.item!.id);
            if (idx === -1) return [...prev, event.item!];
            const next = [...prev];
            next[idx] = event.item!;
            return next;
          });
        }
      },
    );
    return () => {
      if (typeof unsub === "function") unsub();
    };
  }, [collaborativeRun.id]);
  useEffect(() => {
    window.electronAPI
      .getAgentRoles(false)
      .then((roles: AgentRole[]) => {
        const map = new Map<string, AgentRoleDisplayLike & { icon?: string }>();
        for (const role of roles) map.set(role.id, role);
        setAgentRoles(map);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const unsub = window.electronAPI.onTeamThoughtEvent((event: Any) => {
      if (event.runId !== collaborativeRun.id) return;
      if (event.type === "team_thought_streaming" && event.thought) {
        const t = event.thought as AgentThought;
        setStreamingByAgent((prev) => {
          const next = new Map(prev);
          next.set(t.agentRoleId, t);
          return next;
        });
      } else if (
        (event.type === "team_thought_added" ||
          event.type === "team_thought_updated") &&
        event.thought
      ) {
        const t = event.thought as AgentThought;
        setStreamingByAgent((prev) => {
          if (!prev.has(t.agentRoleId)) return prev;
          const next = new Map(prev);
          next.delete(t.agentRoleId);
          return next;
        });
      }
    });
    return () => {
      if (typeof unsub === "function") unsub();
    };
  }, [collaborativeRun.id]);

  // Map taskId -> agentRoleId for streaming check
  const taskToRole = new Map<string, string>();
  for (const item of teamItems) {
    if (item.sourceTaskId && item.ownerAgentRoleId) {
      taskToRole.set(item.sourceTaskId, item.ownerAgentRoleId);
    }
  }

  // Build agent lines: prefer child tasks, fall back to team items (before spawn)
  const childByTaskId = new Map(childTasks.map((t) => [t.id, t]));
  const agentLines: AgentLine[] = [];

  // From child tasks (spawned agents)
  for (const t of childTasks
    .slice()
    .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))) {
    const roleId = t.assignedAgentRoleId ?? taskToRole.get(t.id);
    const isStreaming = !!roleId && streamingByAgent.has(roleId);
    const role = roleId ? agentRoles.get(roleId) : undefined;
    const status = getLatestStepLabel(t.id, childEvents, t, isStreaming);
    const statusKind = getAgentLineStatusKind(t, status, isStreaming);
    agentLines.push({
      id: t.id,
      title: t.title,
      status,
      statusKind,
      statusLabel: getAgentLineStatusLabel(statusKind, t),
      isStreaming,
      taskId: t.id,
      icon: role?.icon,
      role,
      task: t,
    });
  }

  // From team items not yet spawned (show as "awaiting instruction")
  for (const item of teamItems) {
    if (item.sourceTaskId && childByTaskId.has(item.sourceTaskId)) continue;
    const roleId = item.ownerAgentRoleId;
    const isStreaming = !!roleId && streamingByAgent.has(roleId);
    const role = roleId ? agentRoles.get(roleId) : undefined;
    const status = getLatestStepLabel("", childEvents, null, isStreaming);
    const statusKind = getAgentLineStatusKind(null, status, isStreaming);
    agentLines.push({
      id: item.id,
      title: item.title,
      status,
      statusKind,
      statusLabel: getAgentLineStatusLabel(statusKind, null),
      isStreaming,
      taskId: item.sourceTaskId || null,
      icon: role?.icon ?? item.icon,
      role,
      task: null,
    });
  }

  // Sort: spawned first (by createdAt), then unspawned (by sortOrder)
  agentLines.sort((a, b) => {
    const taskA = a.taskId ? childByTaskId.get(a.taskId) : null;
    const taskB = b.taskId ? childByTaskId.get(b.taskId) : null;
    if (taskA && taskB) return (taskA.createdAt ?? 0) - (taskB.createdAt ?? 0);
    if (taskA) return -1;
    if (taskB) return 1;
    return 0;
  });

  if (agentLines.length === 0) return null;

  const statusCounts = agentLines.reduce<Record<AgentLineStatusKind, number>>(
    (acc, line) => {
      acc[line.statusKind] += 1;
      return acc;
    },
    {
      completed: 0,
      failed: 0,
      partial: 0,
      "needs-action": 0,
      approval: 0,
      resumable: 0,
      running: 0,
      pending: 0,
    },
  );

  return (
    <div
      className={`collaborative-agent-lines${isExpanded ? "" : " is-collapsed"}`}
    >
      <div className="collab-lines-header">
        <span className="collab-lines-title">
          {isMultiLlm
            ? t("collab.lines.modelCount", "{count} models", {
                count: agentLines.length,
              })
            : t("collab.lines.agentCount", "{count} background agents", {
                count: agentLines.length,
              })}
        </span>
        <span className="collab-lines-summary">
          {formatAgentSummary(statusCounts)}
        </span>
        <span className="collab-lines-hint">
          {t("collab.lines.tagHint", "@ to tag agents")}
        </span>
        <button
          type="button"
          className="collab-lines-toggle"
          aria-expanded={isExpanded}
          aria-controls={agentListId}
          aria-label={
            isExpanded
              ? t("common.collapse", "Collapse")
              : t("common.expand", "Expand")
          }
          title={
            isExpanded
              ? t("common.collapse", "Collapse")
              : t("common.expand", "Expand")
          }
          onClick={() => setIsExpanded((expanded) => !expanded)}
        >
          {isExpanded ? (
            <ChevronUp size={15} strokeWidth={2} aria-hidden="true" />
          ) : (
            <ChevronDown size={15} strokeWidth={2} aria-hidden="true" />
          )}
        </button>
      </div>
      {isExpanded && (
        <div id={agentListId} className="collab-lines-details">
          <div className="collab-lines-list">
            {agentLines.map(
              ({
                id,
                title,
                status,
                statusKind,
                statusLabel,
                taskId,
                icon,
                role,
              }) => {
                const display = getLocalizedSubagentDisplay(
                  stripLeadingEmoji(title),
                  language,
                  role,
                );
                const actionLabel = getAgentLineActionLabel(statusKind);
                return (
                  <div
                    key={id}
                    className={`collab-agent-line collab-agent-line-${statusKind}`}
                  >
                    <span className="collab-agent-status-text">
                      <span className="collab-agent-icon">
                        {(() => {
                          const Icon = getEmojiIcon(icon || "🤖");
                          return <Icon size={14} strokeWidth={1.5} />;
                        })()}
                      </span>
                      <span className="collab-agent-identity">
                        <span className="collab-agent-name-row">
                          <span className="collab-agent-name">
                            {display.name}
                          </span>
                          {(display.profileName || display.codename) && (
                            <span className="collab-agent-codename">
                              {[display.profileName, display.codename]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                          )}
                        </span>
                        {display.description && (
                          <span className="collab-agent-duty">
                            {display.description}
                          </span>
                        )}
                      </span>
                    </span>
                    <span
                      className={`collab-agent-state collab-agent-state-${statusKind}`}
                      title={status}
                      aria-label={status}
                    >
                      {statusLabel}
                    </span>
                    {taskId ? (
                      (() => {
                        const t = childByTaskId.get(taskId);
                        return t && isSynthesisChildTask(t);
                      })() ? (
                        <span
                          className="collab-agent-open-empty"
                          title={t(
                            "collab.synthesisShownMain",
                            "Synthesis output is shown in main view",
                          )}
                        />
                      ) : (
                        <button
                          type="button"
                          className="collab-agent-open-btn"
                          onClick={() => onOpenAgent(taskId)}
                          title={actionLabel}
                        >
                          {actionLabel}
                        </button>
                      )
                    ) : (
                      <span className="collab-agent-open-disabled">—</span>
                    )}
                  </div>
                );
              },
            )}
          </div>
          {!mainTaskCompleted && onWrapUp && (
            <div className="collab-lines-actions">
              <span className="collab-lines-status">
                {isWrappingUp
                  ? t("collab.wrappingUp", "Wrapping up...")
                  : isMultiLlm
                    ? t("collab.modelsWorking", "Models are working...")
                    : t("collab.agentsWorking", "Agents are working...")}
              </span>
              <button
                type="button"
                className={`collab-wrap-up-inline-btn${isWrappingUp ? " active" : ""}`}
                onClick={onWrapUp}
                disabled={isWrappingUp}
              >
                {t("collab.wrapUp", "Wrap Up")}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
