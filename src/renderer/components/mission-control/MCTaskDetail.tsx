import { useEffect, useState } from "react";
import { ActivityFeed } from "../ActivityFeed";
import {
  ArrowRight,
  BriefcaseBusiness,
  Bug,
  FileText,
  Folder,
  LockKeyhole,
  MessageSquareText,
  NotebookPen,
  Send,
  UserRound,
} from "lucide-react";
import { BOARD_COLUMNS } from "./useMissionControlData";
import type { MissionControlData } from "./useMissionControlData";
import { MCSelectMenu } from "./MCSelectMenu";
import { translate, useLanguage } from "../../i18n";
import { getLocalizedAgentRoleText } from "../../utils/localized-agent-roles";
import {
  getMissionControlTaskBrief,
  getMissionControlTaskTitle,
} from "../../utils/mission-control-copy";

interface MCTaskDetailProps {
  data: MissionControlData;
  taskId: string;
  onOpenTask?: (taskId: string) => void | Promise<void>;
}

const COLUMN_LABEL_KEYS: Record<string, string> = {
  inbox: "missionControl.board.column.inbox",
  assigned: "missionControl.board.column.assigned",
  in_progress: "missionControl.board.column.inProgress",
  review: "missionControl.board.column.review",
  done: "missionControl.board.column.done",
};

const TASK_STATUS_LABELS: Record<string, { key: string; fallback: string }> = {
  pending: { key: "mcTaskDetail.status.pending", fallback: "Pending" },
  planning: { key: "mcTaskDetail.status.planning", fallback: "Planning" },
  executing: { key: "mcTaskDetail.status.executing", fallback: "Executing" },
  completed: { key: "mcTaskDetail.status.completed", fallback: "Completed" },
  failed: { key: "mcTaskDetail.status.failed", fallback: "Failed" },
  cancelled: { key: "mcTaskDetail.status.cancelled", fallback: "Cancelled" },
  interrupted: {
    key: "mcTaskDetail.status.interrupted",
    fallback: "Interrupted",
  },
  blocked: { key: "mcTaskDetail.status.blocked", fallback: "Blocked" },
  paused: { key: "mcTaskDetail.status.paused", fallback: "Paused" },
  queued: { key: "mcTaskDetail.status.queued", fallback: "Queued" },
  running: { key: "mcTaskDetail.status.running", fallback: "Running" },
  awaiting_approval: {
    key: "mcTaskDetail.status.awaitingApproval",
    fallback: "Awaiting approval",
  },
  needs_user_action: {
    key: "mcTaskDetail.status.needsUserAction",
    fallback: "Needs your input",
  },
};

const ATTENTION_REASON_LABELS: Record<
  string,
  { key: string; fallback: string }
> = {
  "Awaiting approval": {
    key: "mcTaskDetail.attention.awaitingApproval",
    fallback: "Awaiting approval",
  },
  "Waiting on you": {
    key: "mcTaskDetail.attention.waitingOnYou",
    fallback: "Waiting on you",
  },
  Blocked: { key: "mcTaskDetail.attention.blocked", fallback: "Blocked" },
  Paused: { key: "mcTaskDetail.attention.paused", fallback: "Paused" },
  "Run failed": {
    key: "mcTaskDetail.attention.runFailed",
    fallback: "Run failed",
  },
  Interrupted: {
    key: "mcTaskDetail.attention.interrupted",
    fallback: "Interrupted",
  },
  "Dependency unavailable": {
    key: "mcTaskDetail.attention.dependencyUnavailable",
    fallback: "Dependency unavailable",
  },
  "Provider quota issue": {
    key: "mcTaskDetail.attention.providerQuota",
    fallback: "Provider quota issue",
  },
  "Needs decision": {
    key: "mcTaskDetail.attention.needsDecision",
    fallback: "Needs decision",
  },
  "Needs owner": {
    key: "mcTaskDetail.attention.needsOwner",
    fallback: "Needs owner",
  },
  Overdue: { key: "mcTaskDetail.attention.overdue", fallback: "Overdue" },
  "Needs review": {
    key: "mcTaskDetail.attention.needsReview",
    fallback: "Needs review",
  },
  Stale: { key: "mcTaskDetail.attention.stale", fallback: "Stale" },
};

function getTaskStatusLabel(status: string): string {
  const statusCopy = TASK_STATUS_LABELS[status];
  return statusCopy
    ? translate(statusCopy.key, statusCopy.fallback)
    : status.replace(/_/g, " ");
}

function getAttentionReasonLabel(reason: string): string {
  const reasonCopy = ATTENTION_REASON_LABELS[reason];
  return reasonCopy ? translate(reasonCopy.key, reasonCopy.fallback) : reason;
}

function formatClock(timestamp: number, language: "en" | "zh-CN"): string {
  return new Intl.DateTimeFormat(language === "zh-CN" ? "zh-CN" : "en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(timestamp));
}

function getDisplayTaskTitle(title: string): string {
  return getMissionControlTaskTitle(title).replace(/^@[^:]+:\s*/, "");
}

export function MCTaskDetail({ data, taskId, onOpenTask }: MCTaskDetailProps) {
  const language = useLanguage();
  const t = translate;
  const {
    tasks,
    agents,
    selectedWorkspaceId,
    handleAssignTask,
    handleMoveTask,
    handleSetTaskDueDate,
    getMissionColumnForTask,
    getTaskAttentionReason,
    commentText,
    setCommentText,
    postingComment,
    sendingTaskMessage,
    commentActionError,
    handlePostComment,
    handleSendTaskMessage,
    formatRelativeTime,
    getWorkspaceName,
    setDetailPanel,
  } = data;

  const task = tasks.find((item) => item.id === taskId);
  const hasRunError =
    task?.status === "failed" || task?.status === "interrupted";
  const [isTechnicalLogOpen, setIsTechnicalLogOpen] = useState(hasRunError);
  const [taskUpdateMode, setTaskUpdateMode] = useState<"note" | "action">(
    "note",
  );

  useEffect(() => {
    setIsTechnicalLogOpen(hasRunError);
    setTaskUpdateMode("note");
  }, [hasRunError, taskId]);

  if (!task) {
    return (
      <div className="mc-v2-empty">
        {t("mcTaskDetail.empty", "Select a task to view details")}
      </div>
    );
  }

  const taskWorkspaceId = task.workspaceId || selectedWorkspaceId || undefined;
  const attentionReason = getTaskAttentionReason(task);
  const assignedAgent = agents.find(
    (agent) => agent.id === task.assignedAgentRoleId,
  );
  const agentName = assignedAgent
    ? getLocalizedAgentRoleText(assignedAgent).name
    : t("mcTaskDetail.unassigned", "Not assigned");
  const agentInitials = assignedAgent
    ? assignedAgent.displayName
        .split(/\s+/)
        .map((part) => part[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : translate(
        "generated.components.mission.control.mctaskdetail.149.0",
        "Not yet",
      );
  const workspaceName = getWorkspaceName(task.workspaceId);
  const statusLabel = attentionReason
    ? getAttentionReasonLabel(attentionReason)
    : getTaskStatusLabel(task.status);
  const isTerminalTask = [
    "completed",
    "failed",
    "cancelled",
    "interrupted",
  ].includes(task.status);
  const isApproval =
    task.terminalStatus === "awaiting_approval" ||
    attentionReason === "Awaiting approval";
  const decisionTitle = isApproval
    ? translate(
        "generated.components.mission.control.mctaskdetail.164.1",
        "Allow reading of local files",
      )
    : !task.assignedAgentRoleId
      ? translate(
          "generated.components.mission.control.mctaskdetail.166.2",
          "Assign task leaders",
        )
      : task.status === "failed" || task.status === "interrupted"
        ? translate(
            "generated.components.mission.control.mctaskdetail.168.3",
            "Handle running exceptions",
          )
        : translate(
            "generated.components.mission.control.mctaskdetail.169.4",
            "Work on current tasks",
          );
  const decisionDescription = isApproval
    ? t(
        "missionControl.task.agentNeedsLocalFiles",
        "{agent} needs to read local files to continue the analysis.",
        { agent: agentName },
      )
    : attentionReason
      ? t(
          "missionControl.task.pausedForStatus",
          "This task is paused for “{status}”. Open it to continue.",
          { status: statusLabel },
        )
      : translate(
          "generated.components.mission.control.mctaskdetail.174.5",
          "Open the complete task to view the execution and continue processing.",
        );
  const createdAt = task.createdAt;
  const updatedAt = task.updatedAt || task.createdAt;
  const dueDateValue = task.dueDate
    ? [
        new Date(task.dueDate).getFullYear(),
        String(new Date(task.dueDate).getMonth() + 1).padStart(2, "0"),
        String(new Date(task.dueDate).getDate()).padStart(2, "0"),
      ].join("-")
    : "";
  const timeline = [
    {
      time: formatClock(createdAt, language),
      title: translate(
        "generated.components.mission.control.mctaskdetail.187.6",
        "Mission starts",
      ),
      description: t(
        "missionControl.task.agentStarted",
        "{agent} started the task.",
        { agent: agentName },
      ),
    },
    ...(updatedAt > createdAt
      ? [
          {
            time: formatClock(updatedAt, language),
            title: isApproval
              ? translate(
                  "generated.components.mission.control.mctaskdetail.193.7",
                  "Request to read local file",
                )
              : translate(
                  "generated.components.mission.control.mctaskdetail.193.8",
                  "Task status updated",
                ),
            description: isApproval
              ? t(
                  "missionControl.task.agentRequestedFiles",
                  "{agent} requested access to workspace files to complete the analysis.",
                  { agent: agentName },
                )
              : t(
                  "missionControl.task.updatedRelative",
                  "Task last updated {time}.",
                  { time: formatRelativeTime(updatedAt) },
                ),
          },
        ]
      : []),
    ...(attentionReason
      ? [
          {
            time: formatClock(updatedAt, language),
            title: isApproval
              ? translate(
                  "generated.components.mission.control.mctaskdetail.202.9",
                  "Awaiting your approval",
                )
              : statusLabel,
            description: isApproval
              ? translate(
                  "generated.components.mission.control.mctaskdetail.204.10",
                  "Your approval is required to continue reading local files.",
                )
              : translate(
                  "generated.components.mission.control.mctaskdetail.205.11",
                  "Tasks are waiting for you to process.",
                ),
          },
        ]
      : []),
  ];

  return (
    <div className="mc-task-inspector">
      <div className="mc-task-inspector-overview">
        <section className="mc-task-inspector-hero">
          <div
            className="mc-task-inspector-avatar"
            style={
              assignedAgent
                ? { backgroundColor: assignedAgent.color }
                : undefined
            }
            aria-hidden="true"
          >
            {agentInitials}
          </div>
          <div className="mc-task-inspector-heading">
            <h3>{getDisplayTaskTitle(task.title)}</h3>
            <span className={`mc-v2-status-pill status-${task.status}`}>
              {statusLabel}
            </span>
          </div>
          <p>{getMissionControlTaskBrief(task.prompt)}</p>
        </section>

        <section
          className="mc-task-inspector-meta"
          aria-label={translate(
            "generated.components.mission.control.mctaskdetail.230.12",
            "Mission information",
          )}
        >
          <div>
            <UserRound size={16} />
            <span>
              {translate(
                "generated.components.mission.control.mctaskdetail.233.13",
                "person in charge",
              )}
            </span>
            <strong>{agentName}</strong>
          </div>
          <div>
            <Folder size={16} />
            <span>
              {translate(
                "generated.components.mission.control.mctaskdetail.238.14",
                "workspace",
              )}
            </span>
            <strong>{workspaceName}</strong>
          </div>
          <div className="mc-task-inspector-sources">
            <BriefcaseBusiness size={16} />
            <span>
              {translate(
                "generated.components.mission.control.mctaskdetail.243.15",
                "Source",
              )}
            </span>
            <em>
              <FileText size={14} />
              {translate(
                "generated.components.mission.control.mctaskdetail.244.16",
                "Mission statement",
              )}
            </em>
            <em>
              <MessageSquareText size={14} />
              {translate(
                "generated.components.mission.control.mctaskdetail.245.17",
                "workspace context",
              )}
            </em>
          </div>
        </section>
      </div>

      <section className="mc-task-timeline">
        <h4>
          {translate(
            "generated.components.mission.control.mctaskdetail.251.18",
            "activity record",
          )}
        </h4>
        <ol>
          {timeline.map((item, index) => (
            <li key={`${item.title}-${index}`}>
              <time>{item.time}</time>
              <span className="mc-task-timeline-dot" />
              <div>
                <strong>{item.title}</strong>
                <p>{item.description}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <details className="mc-task-detail-more">
        <summary>
          <span>
            {translate(
              "generated.components.mission.control.mctaskdetail.268.19",
              "Task settings and execution records",
            )}
          </span>
        </summary>
        <div className="mc-task-detail-more-content">
          <section
            className="mc-v2-task-core"
            aria-label={translate(
              "generated.components.mission.control.mctaskdetail.271.20",
              "Task settings",
            )}
          >
            <div className="mc-v2-task-core-fields">
              <div className="mc-v2-task-core-field">
                <span>{t("mcTaskDetail.assignee", "person in charge")}</span>
                <MCSelectMenu
                  ariaLabel={t("mcTaskDetail.assignee", "person in charge")}
                  className="mc-task-detail-select"
                  minMenuWidth={260}
                  value={task.assignedAgentRoleId || ""}
                  onValueChange={(nextValue) =>
                    handleAssignTask(task.id, nextValue || null)
                  }
                  options={[
                    {
                      value: "",
                      label: t("mcTaskDetail.unassigned", "Not assigned"),
                    },
                    ...agents
                      .filter((agent) => agent.isActive)
                      .map((agent) => ({
                        value: agent.id,
                        label: getLocalizedAgentRoleText(agent).name,
                      })),
                  ]}
                  searchPlaceholder={translate(
                    "generated.components.mission.control.mctaskdetail.295.21",
                    "Search leader",
                  )}
                />
              </div>

              <div className="mc-v2-task-core-field">
                <span>{t("mcTaskDetail.stage", "stage")}</span>
                <MCSelectMenu
                  ariaLabel={t("mcTaskDetail.stage", "stage")}
                  className="mc-task-detail-select"
                  minMenuWidth={220}
                  value={getMissionColumnForTask(task)}
                  onValueChange={(nextValue) =>
                    handleMoveTask(task.id, nextValue)
                  }
                  options={BOARD_COLUMNS.map((column) => ({
                    value: column.id,
                    label: t(COLUMN_LABEL_KEYS[column.id] || "", column.label),
                  }))}
                />
              </div>

              <div className="mc-v2-task-core-field mc-task-detail-due-field">
                <span>
                  {translate(
                    "generated.components.mission.control.mctaskdetail.320.22",
                    "Deadline",
                  )}
                </span>
                <div className="mc-task-detail-date-control">
                  <input
                    type="date"
                    aria-label={translate(
                      "generated.components.mission.control.mctaskdetail.324.23",
                      "Deadline",
                    )}
                    value={dueDateValue}
                    onChange={(event) => {
                      const value = event.target.value;
                      if (!value) {
                        void handleSetTaskDueDate(task.id, null);
                        return;
                      }
                      const [year, month, day] = value.split("-").map(Number);
                      const dueDate = new Date(
                        year,
                        month - 1,
                        day,
                        23,
                        59,
                        59,
                        999,
                      );
                      void handleSetTaskDueDate(task.id, dueDate.getTime());
                    }}
                  />
                  {task.dueDate && (
                    <button
                      type="button"
                      onClick={() => void handleSetTaskDueDate(task.id, null)}
                    >
                      {translate(
                        "generated.components.mission.control.mctaskdetail.354.24",
                        "Clear date",
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </section>

          <section className="mc-task-update-section">
            <label
              className="mc-task-update-label"
              htmlFor={`mc-task-update-${task.id}`}
            >
              {t("mcTaskDetail.taskUpdate", "Supplementary task information")}
            </label>
            <div
              className="mc-task-update-mode-switch"
              role="group"
              aria-label={translate(
                "generated.components.mission.control.mctaskdetail.372.25",
                "Choose how you want to use your supplemental information",
              )}
            >
              <button
                type="button"
                className={taskUpdateMode === "note" ? "active" : ""}
                aria-pressed={taskUpdateMode === "note"}
                onClick={() => setTaskUpdateMode("note")}
              >
                <NotebookPen size={14} aria-hidden="true" />
                <span>
                  <strong>
                    {translate(
                      "generated.components.mission.control.mctaskdetail.382.26",
                      "Record notes",
                    )}
                  </strong>
                  <small>
                    {translate(
                      "generated.components.mission.control.mctaskdetail.383.27",
                      "Only save, do not execute",
                    )}
                  </small>
                </span>
              </button>
              <button
                type="button"
                className={taskUpdateMode === "action" ? "active" : ""}
                aria-pressed={taskUpdateMode === "action"}
                title={
                  task.assignedAgentRoleId
                    ? t(
                        "missionControl.task.letAgentContinue",
                        "Let {agent} continue the task",
                        { agent: agentName },
                      )
                    : translate(
                        "generated.components.mission.control.mctaskdetail.393.28",
                        "Please assign a person in charge first",
                      )
                }
                disabled={!task.assignedAgentRoleId}
                onClick={() => setTaskUpdateMode("action")}
              >
                <Send size={14} aria-hidden="true" />
                <span>
                  <strong>
                    {translate(
                      "generated.components.mission.control.mctaskdetail.400.29",
                      "Let the person in charge handle it",
                    )}
                  </strong>
                  <small>
                    {translate(
                      "generated.components.mission.control.mctaskdetail.401.30",
                      "The task will continue to run",
                    )}
                  </small>
                </span>
              </button>
            </div>
            <p className="mc-task-update-mode-help">
              <strong>
                {translate(
                  "generated.components.mission.control.mctaskdetail.406.31",
                  "Purpose:",
                )}
              </strong>
              {taskUpdateMode === "note"
                ? translate(
                    "generated.components.mission.control.mctaskdetail.408.32",
                    "Saving background, conclusions or manual explanations in tasks will not notify the person in charge or trigger processing.",
                  )
                : isTerminalTask
                  ? t(
                      "missionControl.task.reopenWithAgent",
                      "Send the new request to {agent}, reopen the task, and return a new result.",
                      { agent: agentName },
                    )
                  : t(
                      "missionControl.task.continueWithAgent",
                      "Send the new request to {agent} and continue the current task.",
                      { agent: agentName },
                    )}
            </p>
            <div className="mc-task-update-composer">
              <textarea
                id={`mc-task-update-${task.id}`}
                aria-label={
                  taskUpdateMode === "note"
                    ? translate(
                        "generated.components.mission.control.mctaskdetail.418.33",
                        "Enter task notes",
                      )
                    : translate(
                        "generated.components.mission.control.mctaskdetail.419.34",
                        "Enter new requirements for the person in charge",
                      )
                }
                placeholder={
                  taskUpdateMode === "note"
                    ? translate(
                        "generated.components.mission.control.mctaskdetail.423.35",
                        "Enter any context, conclusion, or human explanation you want to retain",
                      )
                    : translate(
                        "generated.components.mission.control.mctaskdetail.424.36",
                        "Tell the person in charge what to do next, for example: supplement data sources and regenerate conclusions",
                      )
                }
                value={commentText}
                onChange={(event) => setCommentText(event.target.value)}
                rows={3}
              />
              <div className="mc-task-update-footer">
                <span>
                  {taskUpdateMode === "note"
                    ? translate(
                        "generated.components.mission.control.mctaskdetail.433.37",
                        "After saving, it will be displayed in the task notes below.",
                      )
                    : t(
                        "missionControl.task.agentHandlesAfterSubmit",
                        "{agent} will handle it after submission.",
                        { agent: agentName },
                      )}
                </span>
                {taskUpdateMode === "note" ? (
                  <button
                    type="button"
                    className="mc-task-update-save"
                    onClick={handlePostComment}
                    disabled={
                      postingComment ||
                      sendingTaskMessage ||
                      commentText.trim().length === 0
                    }
                  >
                    {postingComment
                      ? translate(
                          "generated.components.mission.control.mctaskdetail.447.38",
                          "Saving...",
                        )
                      : translate(
                          "generated.components.mission.control.mctaskdetail.447.39",
                          "Save task notes",
                        )}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="mc-task-update-submit"
                    onClick={handleSendTaskMessage}
                    disabled={
                      !task.assignedAgentRoleId ||
                      postingComment ||
                      sendingTaskMessage ||
                      commentText.trim().length === 0
                    }
                  >
                    {sendingTaskMessage
                      ? translate(
                          "generated.components.mission.control.mctaskdetail.462.40",
                          "Processing...",
                        )
                      : t(
                          "missionControl.task.assignToAgent",
                          "Assign to {agent}",
                          { agent: agentName },
                        )}
                  </button>
                )}
              </div>
            </div>
            {commentActionError && (
              <p className="mc-task-update-error" role="alert">
                {commentActionError}
              </p>
            )}
            {taskWorkspaceId && (
              <div
                className="mc-task-note-history"
                aria-label={translate(
                  "generated.components.mission.control.mctaskdetail.474.41",
                  "Saved task notes",
                )}
              >
                <ActivityFeed
                  workspaceId={taskWorkspaceId}
                  taskId={task.id}
                  compact
                  maxItems={8}
                  showFilters={false}
                  includeTypes={["comment"]}
                  showDescriptionsInCompact
                  showItemActions={false}
                  hideWhenEmpty
                />
              </div>
            )}
          </section>

          {taskWorkspaceId && (
            <details
              className={`mc-v2-execution-log ${
                hasRunError ? "has-error" : ""
              }`}
              open={isTechnicalLogOpen}
              onToggle={(event) =>
                setIsTechnicalLogOpen(event.currentTarget.open)
              }
            >
              <summary>
                <span>
                  <Bug size={14} aria-hidden="true" />
                  {hasRunError
                    ? t("mcTaskDetail.technicalLogError", "Abnormal operation")
                    : t("mcTaskDetail.technicalLog", "Technical log")}
                </span>
                <small>
                  {hasRunError
                    ? t(
                        "mcTaskDetail.technicalLogErrorHint",
                        "The error record has been expanded to view the execution steps before the failure.",
                      )
                    : t(
                        "mcTaskDetail.technicalLogHint",
                        "Used for troubleshooting when tasks are abnormal and does not require daily operations",
                      )}
                </small>
              </summary>
              {isTechnicalLogOpen && (
                <>
                  <div className="mc-task-technical-log-help">
                    <strong>
                      {hasRunError
                        ? translate(
                            "generated.components.mission.control.mctaskdetail.517.42",
                            "How to troubleshoot",
                          )
                        : translate(
                            "generated.components.mission.control.mctaskdetail.517.43",
                            "When do you need to see",
                          )}
                    </strong>
                    <span>
                      {hasRunError
                        ? translate(
                            "generated.components.mission.control.mctaskdetail.521.44",
                            "First check the red error record, and then combine the tools and execution records in front of it to locate the cause.",
                          )
                        : translate(
                            "generated.components.mission.control.mctaskdetail.522.45",
                            "Models, tools, and running steps are recorded here; only view if the task fails, gets stuck, or has abnormal results.",
                          )}
                    </span>
                  </div>
                  <ActivityFeed
                    workspaceId={taskWorkspaceId}
                    taskId={task.id}
                    compact
                    maxItems={20}
                    showFilters={false}
                    excludeTypes={["comment"]}
                    showDescriptionsInCompact
                    showItemActions={false}
                    showUnreadState={false}
                  />
                </>
              )}
            </details>
          )}
        </div>
      </details>

      <section className="mc-task-decision">
        <div className="mc-task-decision-copy">
          <h4>
            {translate(
              "generated.components.mission.control.mctaskdetail.545.46",
              "need your decision",
            )}
          </h4>
          <div>
            <LockKeyhole size={17} />
            <span>
              <strong>{decisionTitle}</strong>
              <small>{decisionDescription}</small>
            </span>
          </div>
        </div>
        <div className="mc-task-decision-actions">
          <button
            type="button"
            className="mc-task-decision-primary"
            onClick={() => void onOpenTask?.(task.id)}
          >
            {isApproval
              ? translate(
                  "generated.components.mission.control.mctaskdetail.560.47",
                  "View approvals",
                )
              : translate(
                  "generated.components.mission.control.mctaskdetail.560.48",
                  "Open task",
                )}
          </button>
          <button
            type="button"
            className="mc-task-decision-secondary"
            onClick={() => setDetailPanel(null)}
          >
            {translate(
              "generated.components.mission.control.mctaskdetail.567.49",
              "deal with it later",
            )}
          </button>
          <button
            type="button"
            className="mc-task-decision-link"
            onClick={() => void onOpenTask?.(task.id)}
          >
            {translate(
              "generated.components.mission.control.mctaskdetail.574.50",
              "View full task",
            )}
            <ArrowRight size={15} />
          </button>
        </div>
      </section>
    </div>
  );
}
