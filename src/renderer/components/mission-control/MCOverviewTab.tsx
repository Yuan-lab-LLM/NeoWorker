import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Clock3,
  FileCheck2,
  ListChecks,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useRef, useState } from "react";
import type { MissionControlItem, Task } from "../../../shared/types";
import { translate, useLanguage } from "../../i18n";
import { getLocalizedAgentRoleText } from "../../utils/localized-agent-roles";
import { getMissionControlTaskTitle } from "../../utils/mission-control-copy";
import type { MissionControlData } from "./useMissionControlData";

interface MCOverviewTabProps {
  data: MissionControlData;
  onCreateTask?: (title: string, prompt: string) => void | Promise<void>;
}

type AttentionRow = {
  id: string;
  priority: "critical" | "high" | "normal";
  priorityLabel: string;
  title: string;
  source: string;
  owner: string;
  waiting: string;
  updated: string;
  taskId?: string;
};

function dayStart(timestamp = Date.now()): number {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function formatUpdatedAt(timestamp: number): string {
  const date = new Date(timestamp);
  if (date.getTime() >= dayStart()) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString([], { month: "numeric", day: "numeric" });
}

function statusLabel(task: Task, column: string): string {
  if (column === "review")
    return translate(
      "generated.components.mission.control.mcoverviewtab.51.0",
      "Awaiting review",
    );
  if (task.status === "executing")
    return translate(
      "generated.components.mission.control.mcoverviewtab.52.1",
      "Executing",
    );
  if (task.status === "planning")
    return translate(
      "generated.components.mission.control.mcoverviewtab.53.2",
      "Under planning",
    );
  if (column === "in_progress")
    return translate(
      "generated.components.mission.control.mcoverviewtab.54.3",
      "Advancing",
    );
  if (column === "assigned")
    return translate(
      "generated.components.mission.control.mcoverviewtab.55.4",
      "To be started",
    );
  return translate(
    "generated.components.mission.control.mcoverviewtab.56.5",
    "Received",
  );
}

function attentionFromItem(
  item: MissionControlItem,
  formatRelativeTime: MissionControlData["formatRelativeTime"],
): AttentionRow {
  const isCritical = item.severity === "failed";
  const isHigh = item.severity === "action_needed";
  return {
    id: item.id,
    priority: isCritical ? "critical" : isHigh ? "high" : "normal",
    priorityLabel: isCritical
      ? translate(
          "generated.components.mission.control.mcoverviewtab.68.6",
          "urgent",
        )
      : isHigh
        ? translate(
            "generated.components.mission.control.mcoverviewtab.68.7",
            "high",
          )
        : translate(
            "generated.components.mission.control.mcoverviewtab.68.8",
            "Ordinary",
          ),
    title: item.title,
    source:
      item.workspaceName ||
      item.companyName ||
      translate(
        "generated.components.mission.control.mcoverviewtab.70.9",
        "mission center",
      ),
    owner:
      item.agentName ||
      translate(
        "generated.components.mission.control.mcoverviewtab.71.10",
        "To be allocated",
      ),
    waiting: formatRelativeTime(item.timestamp),
    updated: formatUpdatedAt(item.updatedAt || item.timestamp),
    taskId: item.taskId,
  };
}

export function MCOverviewTab({ data, onCreateTask }: MCOverviewTabProps) {
  useLanguage();
  const t = translate;
  const [taskRequest, setTaskRequest] = useState("");
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const dispatchInputRef = useRef<HTMLInputElement>(null);
  const {
    missionControlBrief,
    totalTasksInQueue,
    runtimeRunningTaskIds,
    formatRelativeTime,
    setActiveTab,
    setDetailPanel,
    loadMissionControlIntelligence,
    selectedWorkspaceId,
    tasks,
    getAgent,
    getWorkspaceName,
    getMissionColumnForTask,
    isTaskAttentionRequired,
    isTaskTerminal,
  } = data;

  const brief = missionControlBrief;
  const briefAttention =
    brief?.sections?.find((section) => section.title === "Needs attention")
      ?.items || [];
  const openTask = (taskId: string) => setDetailPanel({ kind: "task", taskId });

  const fallbackAttention: AttentionRow[] = tasks
    .filter((task) => !isTaskTerminal(task) && isTaskAttentionRequired(task))
    .sort(
      (a, b) =>
        (b.priority || 0) - (a.priority || 0) || b.updatedAt - a.updatedAt,
    )
    .slice(0, 6)
    .map((task) => {
      const priority =
        (task.priority || 0) >= 4
          ? "critical"
          : (task.priority || 0) >= 3
            ? "high"
            : "normal";
      return {
        id: task.id,
        priority,
        priorityLabel:
          priority === "critical"
            ? translate(
                "generated.components.mission.control.mcoverviewtab.126.11",
                "urgent",
              )
            : priority === "high"
              ? translate(
                  "generated.components.mission.control.mcoverviewtab.128.12",
                  "high",
                )
              : translate(
                  "generated.components.mission.control.mcoverviewtab.129.13",
                  "Ordinary",
                ),
        title: task.title,
        source: getWorkspaceName(task.workspaceId),
        owner:
          getAgent(task.assignedAgentRoleId)?.displayName ||
          translate(
            "generated.components.mission.control.mcoverviewtab.132.14",
            "To be allocated",
          ),
        waiting: formatRelativeTime(task.createdAt),
        updated: formatUpdatedAt(task.updatedAt || task.createdAt),
        taskId: task.id,
      };
    });
  const attentionRows =
    briefAttention.length > 0
      ? briefAttention
          .slice(0, 6)
          .map((item) => attentionFromItem(item, formatRelativeTime))
      : fallbackAttention;

  const activeTasks = tasks
    .filter((task) => {
      if (isTaskTerminal(task)) return false;
      const column = getMissionColumnForTask(task);
      return (
        column === "assigned" || column === "in_progress" || column === "review"
      );
    })
    .sort((a, b) => {
      const aRunning = runtimeRunningTaskIds.includes(a.id) ? 1 : 0;
      const bRunning = runtimeRunningTaskIds.includes(b.id) ? 1 : 0;
      return bRunning - aRunning || b.updatedAt - a.updatedAt;
    })
    .slice(0, 6);

  const decisions = brief?.latestDecisions?.slice(0, 5) || [];

  const refreshBrief = () =>
    void loadMissionControlIntelligence(selectedWorkspaceId);
  const openAttention = () => {
    if (attentionRows[0]?.taskId) openTask(attentionRows[0].taskId);
    else refreshBrief();
  };
  const openActiveWork = () => {
    if (activeTasks[0]) openTask(activeTasks[0].id);
    else refreshBrief();
  };
  const createTask = async (request = taskRequest) => {
    const prompt = request.trim();
    if (!prompt || !onCreateTask || isCreatingTask) return;
    setIsCreatingTask(true);
    try {
      await onCreateTask(prompt.slice(0, 48), prompt);
      setTaskRequest("");
    } finally {
      setIsCreatingTask(false);
    }
  };
  const isCompletelyEmpty =
    attentionRows.length === 0 &&
    activeTasks.length === 0 &&
    decisions.length === 0;

  return (
    <div className="mc-command-overview">
      <section className="mc-command-briefing">
        <div className="mc-command-brief-copy">
          <div className="mc-command-eyebrow">
            <Sparkles size={14} />
            {translate(
              "generated.components.mission.control.mcoverviewtab.194.15",
              "Today's briefing",
            )}
          </div>
          <h2>
            {attentionRows.length > 0
              ? t(
                  "missionControl.overview.attentionSummary",
                  "Today, there are {count} things worth doing right now",
                  { count: attentionRows.length },
                )
              : t(
                  "missionControl.overview.allClearSummary",
                  "Today’s work progress has been completed",
                )}
          </h2>
          <p>
            {attentionRows.length > 0
              ? translate(
                  "generated.components.mission.control.mcoverviewtab.210.16",
                  "Address important judgments first before deciding on next steps. The rest of the work will continue.",
                )
              : t(
                  "missionControl.overview.steadyOpenWork",
                  "Operations are steady, with {count} open items in progress.",
                  { count: totalTasksInQueue },
                )}
          </p>
        </div>
        <div
          className="mc-command-brief-stats"
          aria-label={translate(
            "generated.components.mission.control.mcoverviewtab.214.17",
            "Today’s work overview",
          )}
        >
          <div>
            <span>
              {translate(
                "generated.components.mission.control.mcoverviewtab.216.18",
                "Waiting for you to deal with",
              )}
            </span>
            <strong>{attentionRows.length}</strong>
          </div>
          <div>
            <span>
              {translate(
                "generated.components.mission.control.mcoverviewtab.220.19",
                "open job",
              )}
            </span>
            <strong>{totalTasksInQueue}</strong>
          </div>
          <div>
            <span>
              {translate(
                "generated.components.mission.control.mcoverviewtab.224.20",
                "Executing",
              )}
            </span>
            <strong>{activeTasks.length}</strong>
          </div>
        </div>
        <div className="mc-command-brief-actions">
          <button
            className="mc-command-secondary"
            onClick={refreshBrief}
            title={t(
              "missionControl.overview.refreshBrief",
              "Refresh briefing",
            )}
          >
            <RefreshCw size={15} />
          </button>
        </div>
      </section>

      <section
        className="mc-command-dispatch"
        aria-label={translate(
          "generated.components.mission.control.mcoverviewtab.239.21",
          "Create new task",
        )}
      >
        <div className="mc-command-dispatch-copy">
          <label htmlFor="mc-command-dispatch-input">
            {translate(
              "generated.components.mission.control.mcoverviewtab.241.22",
              "Assign a task",
            )}
          </label>
          <p>
            {translate(
              "generated.components.mission.control.mcoverviewtab.242.23",
              "State your goal in one sentence, and NeoWorker will start executing it and continuously update progress.",
            )}
          </p>
        </div>
        <div className="mc-command-dispatch-form">
          <input
            id="mc-command-dispatch-input"
            ref={dispatchInputRef}
            value={taskRequest}
            onChange={(event) => setTaskRequest(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.nativeEvent.isComposing)
                void createTask();
            }}
            placeholder={translate(
              "generated.components.mission.control.mcoverviewtab.254.24",
              "For example: Organize the project progress this week and mark the things that need my confirmation",
            )}
            aria-label={translate(
              "generated.components.mission.control.mcoverviewtab.255.25",
              "Assign work",
            )}
          />
          <button
            type="button"
            onClick={() => void createTask()}
            disabled={!taskRequest.trim() || !onCreateTask || isCreatingTask}
          >
            {isCreatingTask
              ? translate(
                  "generated.components.mission.control.mcoverviewtab.262.26",
                  "Being assigned",
                )
              : translate(
                  "generated.components.mission.control.mcoverviewtab.262.27",
                  "assigned",
                )}
            <ArrowRight size={15} />
          </button>
          <div className="mc-command-dispatch-suggestions">
            {[
              translate(
                "generated.components.mission.control.mcoverviewtab.266.28",
                "daily working day",
              ),
              translate(
                "generated.components.mission.control.mcoverviewtab.266.29",
                "Conference briefing",
              ),
              translate(
                "generated.components.mission.control.mcoverviewtab.266.30",
                "Project risk",
              ),
            ].map((label, index) => {
              const prompt = [
                translate(
                  "generated.components.mission.control.mcoverviewtab.267.31",
                  "Generate working daily report",
                ),
                translate(
                  "generated.components.mission.control.mcoverviewtab.267.32",
                  "Prepare meeting briefings",
                ),
                translate(
                  "generated.components.mission.control.mcoverviewtab.267.33",
                  "Sort out project risks",
                ),
              ][index];
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => void createTask(prompt)}
                  disabled={!onCreateTask || isCreatingTask}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {isCompletelyEmpty ? (
        <section className="mc-command-start-state">
          <div className="mc-command-start-copy">
            <span className="mc-command-start-icon">
              <Sparkles size={24} />
            </span>
            <div>
              <h2>
                {translate(
                  "generated.components.mission.control.mcoverviewtab.292.34",
                  "Start with a clear job",
                )}
              </h2>
              <p>
                {translate(
                  "generated.components.mission.control.mcoverviewtab.293.35",
                  "After the task is assigned, the execution progress, your judgment required and the final result will be automatically summarized here.",
                )}
              </p>
            </div>
          </div>
          <div className="mc-command-start-guide">
            <h3>
              {translate(
                "generated.components.mission.control.mcoverviewtab.297.36",
                "Once started, you will see here",
              )}
            </h3>
            <div>
              <span>
                <ShieldCheck size={18} />
              </span>
              <p>
                <strong>
                  {translate(
                    "generated.components.mission.control.mcoverviewtab.303.37",
                    "waiting for your judgment",
                  )}
                </strong>
                <small>
                  {translate(
                    "generated.components.mission.control.mcoverviewtab.304.38",
                    "Centralized processing of approvals, exceptions and critical selections",
                  )}
                </small>
              </p>
            </div>
            <div>
              <span>
                <Activity size={18} />
              </span>
              <p>
                <strong>
                  {translate(
                    "generated.components.mission.control.mcoverviewtab.312.39",
                    "work is progressing",
                  )}
                </strong>
                <small>
                  {translate(
                    "generated.components.mission.control.mcoverviewtab.313.40",
                    "Know where to go, whether you are blocked, and what the next step is.",
                  )}
                </small>
              </p>
            </div>
            <div>
              <span>
                <FileCheck2 size={18} />
              </span>
              <p>
                <strong>
                  {translate(
                    "generated.components.mission.control.mcoverviewtab.321.41",
                    "Results and execution records",
                  )}
                </strong>
                <small>
                  {translate(
                    "generated.components.mission.control.mcoverviewtab.322.42",
                    "Products, decisions and follow-up actions stay in one place",
                  )}
                </small>
              </p>
            </div>
          </div>
          <footer className="mc-command-start-footer">
            <span>
              <i />
              {translate(
                "generated.components.mission.control.mcoverviewtab.329.43",
                "After creating a task, the progress and results will automatically appear here",
              )}
            </span>
          </footer>
        </section>
      ) : (
        <div className="mc-command-layout">
          <main className="mc-command-main-column">
            <section className="mc-command-table-section mc-command-focus-section">
              <div className="mc-command-section-header">
                <div>
                  <h2>
                    {attentionRows.length > 0
                      ? translate(
                          "generated.components.mission.control.mcoverviewtab.340.44",
                          "Address priorities",
                        )
                      : translate(
                          "generated.components.mission.control.mcoverviewtab.340.45",
                          "No processing required currently",
                        )}
                  </h2>
                  <p>
                    {attentionRows.length > 0
                      ? t(
                          "missionControl.overview.attentionCount",
                          "{count} items, sorted by importance",
                          { count: attentionRows.length },
                        )
                      : translate(
                          "generated.components.mission.control.mcoverviewtab.345.46",
                          "Things that need to be judged will automatically appear here",
                        )}
                  </p>
                </div>
                {attentionRows.length > 0 && (
                  <button onClick={openAttention}>
                    {t(
                      "missionControl.overview.estimate",
                      "Estimated {count} minutes",
                      { count: Math.max(4, attentionRows.length * 4) },
                    )}
                    <ArrowRight size={14} />
                  </button>
                )}
              </div>
              {attentionRows.length === 0 ? (
                <div className="mc-command-empty mc-command-empty-action">
                  <CheckCircle2 size={20} />
                  <span>
                    <strong>
                      {translate(
                        "generated.components.mission.control.mcoverviewtab.363.47",
                        "There are currently no pending items",
                      )}
                    </strong>
                    <small>
                      {translate(
                        "generated.components.mission.control.mcoverviewtab.364.48",
                        "You will be reminded in time when your judgment is needed.",
                      )}
                    </small>
                  </span>
                </div>
              ) : (
                <div className="mc-command-focus-list">
                  {attentionRows.map((row, index) => (
                    <article
                      key={row.id}
                      className={`mc-command-focus-row ${row.priority}`}
                    >
                      <b>{String(index + 1).padStart(2, "0")}</b>
                      <div>
                        <span>
                          {row.priority === "critical"
                            ? translate(
                                "generated.components.mission.control.mcoverviewtab.378.49",
                                "Need decision",
                              )
                            : row.priority === "high"
                              ? translate(
                                  "generated.components.mission.control.mcoverviewtab.380.50",
                                  "Pending",
                                )
                              : translate(
                                  "generated.components.mission.control.mcoverviewtab.381.51",
                                  "Awaiting feedback",
                                )}
                        </span>
                        <h3>{getMissionControlTaskTitle(row.title)}</h3>
                        <p className="mc-command-focus-meta">
                          <span>{row.owner}</span>
                          <span>{row.source}</span>
                          <span>{row.waiting}</span>
                        </p>
                      </div>
                      <button
                        onClick={() =>
                          row.taskId ? openTask(row.taskId) : openAttention()
                        }
                      >
                        {row.taskId
                          ? translate(
                              "generated.components.mission.control.mcoverviewtab.395.52",
                              "Process",
                            )
                          : translate(
                              "generated.components.mission.control.mcoverviewtab.395.53",
                              "View",
                            )}
                        <ArrowRight size={14} />
                      </button>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section className="mc-command-table-section mc-command-schedule-section">
              <div className="mc-command-section-header">
                <div>
                  <h2>
                    {translate(
                      "generated.components.mission.control.mcoverviewtab.407.54",
                      "Advancing",
                    )}
                  </h2>
                  <p>
                    {translate(
                      "generated.components.mission.control.mcoverviewtab.408.55",
                      "Open jobs sorted by last updated",
                    )}
                  </p>
                </div>
                {activeTasks.length > 0 && (
                  <button onClick={openActiveWork}>
                    {t(
                      "missionControl.overview.viewWork",
                      "View today's advancement",
                    )}
                    <ArrowRight size={14} />
                  </button>
                )}
              </div>
              {activeTasks.length === 0 ? (
                <div className="mc-command-empty mc-command-empty-action">
                  <Clock3 size={20} />
                  <span>
                    <strong>
                      {translate(
                        "generated.components.mission.control.mcoverviewtab.421.56",
                        "No open jobs yet",
                      )}
                    </strong>
                    <small>
                      {translate(
                        "generated.components.mission.control.mcoverviewtab.422.57",
                        "After completing tasks above, the progress will appear here.",
                      )}
                    </small>
                  </span>
                </div>
              ) : (
                <div className="mc-command-schedule-list">
                  {activeTasks.slice(0, 3).map((task) => {
                    const agent = getAgent(task.assignedAgentRoleId);
                    return (
                      <button
                        key={task.id}
                        className="mc-command-schedule-row"
                        onClick={() => openTask(task.id)}
                      >
                        <time>
                          {formatUpdatedAt(task.updatedAt || task.createdAt)}
                        </time>
                        <span
                          className={`mc-command-schedule-state ${getMissionColumnForTask(task)}`}
                        />
                        <div>
                          <h3>{getMissionControlTaskTitle(task.title)}</h3>
                          <p>
                            <span>
                              {agent
                                ? getLocalizedAgentRoleText(agent).name
                                : translate(
                                    "generated.components.mission.control.mcoverviewtab.447.58",
                                    "To be allocated",
                                  )}
                            </span>
                            <span>
                              {statusLabel(task, getMissionColumnForTask(task))}
                            </span>
                          </p>
                        </div>
                        <ArrowRight size={15} />
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          </main>

          <aside className="mc-command-side-column">
            <section className="mc-command-side-section mc-command-pulse-section">
              <div className="mc-command-side-heading">
                <div>
                  <h2>
                    {translate(
                      "generated.components.mission.control.mcoverviewtab.467.59",
                      "Latest news",
                    )}
                  </h2>
                  <p>
                    {translate(
                      "generated.components.mission.control.mcoverviewtab.468.60",
                      "Latest decisions and implementation changes",
                    )}
                  </p>
                </div>
                <button onClick={() => setActiveTab("intelligence")}>
                  {translate(
                    "generated.components.mission.control.mcoverviewtab.471.61",
                    "View all",
                  )}
                  <ArrowRight size={14} />
                </button>
              </div>
              {decisions.length === 0 && activeTasks.length === 0 ? (
                <div className="mc-command-side-empty mc-command-pulse-empty">
                  <ListChecks size={20} />
                  <strong>
                    {translate(
                      "generated.components.mission.control.mcoverviewtab.478.62",
                      "No latest news",
                    )}
                  </strong>
                  <span>
                    {translate(
                      "generated.components.mission.control.mcoverviewtab.479.63",
                      "This will be updated as work begins.",
                    )}
                  </span>
                </div>
              ) : decisions.length > 0 ? (
                decisions.slice(0, 3).map((decision) => (
                  <button
                    key={decision.id}
                    className="mc-command-decision"
                    onClick={() =>
                      decision.taskId
                        ? openTask(decision.taskId)
                        : setActiveTab("intelligence")
                    }
                  >
                    <span>
                      <CheckCircle2 size={15} />
                    </span>
                    <div>
                      <small>
                        {decision.agentName ||
                          translate(
                            "generated.components.mission.control.mcoverviewtab.496.64",
                            "Work dynamics",
                          )}
                      </small>
                      <strong>
                        {getMissionControlTaskTitle(decision.title)}
                      </strong>
                      <em>{formatRelativeTime(decision.timestamp)}</em>
                    </div>
                  </button>
                ))
              ) : (
                activeTasks.slice(0, 3).map((task) => (
                  <button
                    key={task.id}
                    className="mc-command-decision"
                    onClick={() => openTask(task.id)}
                  >
                    <span>
                      <Clock3 size={15} />
                    </span>
                    <div>
                      <small>
                        {(() => {
                          const agent = getAgent(task.assignedAgentRoleId);
                          return agent
                            ? getLocalizedAgentRoleText(agent).name
                            : translate(
                                "generated.components.mission.control.mcoverviewtab.520.65",
                                "work in progress",
                              );
                        })()}
                      </small>
                      <strong>{getMissionControlTaskTitle(task.title)}</strong>
                      <em>
                        {formatUpdatedAt(task.updatedAt || task.createdAt)}
                      </em>
                    </div>
                  </button>
                ))
              )}
            </section>

            <div className="mc-command-team-summary">
              <span>
                <i />
                {activeTasks.length}{" "}
                {translate(
                  "generated.components.mission.control.mcoverviewtab.536.66",
                  "work in progress",
                )}
              </span>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
