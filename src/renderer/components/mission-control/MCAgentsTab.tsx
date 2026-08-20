import { Plus } from "lucide-react";
import type { CSSProperties, KeyboardEvent } from "react";
import { getEmojiIcon } from "../../utils/emoji-icon-map";
import { AUTONOMY_BADGES } from "./useMissionControlData";
import type { MissionControlData } from "./useMissionControlData";
import { translate, useLanguage } from "../../i18n";
import { getLocalizedAgentRoleText } from "../../utils/localized-agent-roles";
import { getMissionControlTaskTitle } from "../../utils/mission-control-copy";

interface MCAgentsTabProps {
  data: MissionControlData;
}

const TERMINAL_AGENT_TASK_STATUSES = new Set([
  "completed",
  "failed",
  "cancelled",
  "interrupted",
]);

function formatAgentTaskStatus(status: string): string {
  return translate(
    `missionControl.agent.taskStatus.${status}`,
    status.replace(/_/g, " "),
  );
}

export function MCAgentsTab({ data }: MCAgentsTabProps) {
  useLanguage();
  const t = translate;
  const {
    agents,
    heartbeatStatuses,
    tasksByAgent,
    detailPanel,
    setDetailPanel,
    getAgentStatus,
    handleTriggerHeartbeat,
    handleCreateAgent,
    handleEditAgent,
    runtimeRunningTaskIds,
    formatRelativeTime,
    agentContext,
    isAllWorkspacesSelected,
    getWorkspaceName,
  } = data;

  const activeAgents = agents.filter((a) => a.isActive);

  return (
    <div className="mc-v2-agents">
      {activeAgents.map((agent) => {
        const status = getAgentStatus(agent.id);
        const badge = AUTONOMY_BADGES[agent.autonomyLevel || "specialist"];
        const statusInfo = heartbeatStatuses.find(
          (s) => s.agentRoleId === agent.id,
        );
        const agentTasks = tasksByAgent.get(agent.id) || [];
        const currentTask = agentTasks.find(
          (task) =>
            runtimeRunningTaskIds.includes(task.id) ||
            task.status === "executing" ||
            task.status === "planning",
        );
        const trackedTask =
          currentTask ||
          agentTasks.find(
            (task) => !TERMINAL_AGENT_TASK_STATUSES.has(task.status),
          );
        const isSelected =
          detailPanel?.kind === "agent" && detailPanel.agentId === agent.id;
        const heartbeatLabel = statusInfo?.heartbeatEnabled
          ? t("missionControl.agent.heartbeatEnabled", "Heartbeat is enabled")
          : t("missionControl.agent.heartbeatOff", "Heartbeat not enabled");
        const taskLabel = currentTask
          ? t("missionControl.agent.running", "Executing: {title}", {
              title: getMissionControlTaskTitle(currentTask.title),
            })
          : trackedTask
            ? t(
                "missionControl.agent.tracked",
                "Following up ({status}): {title}",
                {
                  status: formatAgentTaskStatus(trackedTask.status),
                  title: getMissionControlTaskTitle(trackedTask.title),
                },
              )
            : agentContext.getUiCopy("mcNoActiveTask");
        const autonomyLabel = t(
          `missionControl.agent.autonomy.${agent.autonomyLevel || "specialist"}`,
          badge.label,
        );
        const statusLabel = t(`missionControl.agent.status.${status}`, status);
        const toggleAgentDetails = () => {
          setDetailPanel(
            isSelected ? null : { kind: "agent", agentId: agent.id },
          );
        };
        const handleCardKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          toggleAgentDetails();
        };
        const cardStyle = {
          "--mc-agent-color": agent.color,
          "--mc-agent-badge-color": badge.color,
        } as CSSProperties;

        return (
          <div
            key={agent.id}
            className={`mc-v2-agent-card ${isSelected ? "selected" : ""}`}
            style={cardStyle}
            onClick={toggleAgentDetails}
            onDoubleClick={() => handleEditAgent(agent)}
            onKeyDown={handleCardKeyDown}
            role="button"
            tabIndex={0}
            aria-pressed={isSelected}
          >
            <header className="mc-v2-agent-card-header">
              <div className="mc-v2-agent-avatar">
                {(() => {
                  const Icon = getEmojiIcon(agent.icon || "🤖");
                  return <Icon size={20} strokeWidth={1.9} />;
                })()}
              </div>
              <div className="mc-v2-agent-info">
                <div className="mc-v2-agent-name-row">
                  <span className="mc-v2-agent-name">
                    {getLocalizedAgentRoleText(agent).name}
                  </span>
                  <span className="mc-v2-autonomy-badge">{autonomyLabel}</span>
                </div>
                <span className="mc-v2-agent-desc">
                  {getLocalizedAgentRoleText(agent).description || agent.name}
                </span>
              </div>
              <div className={`mc-v2-status-dot-row ${status}`}>
                <span className={`mc-v2-status-dot ${status}`}></span>
                <span className="mc-v2-status-text">{statusLabel}</span>
              </div>
            </header>

            <div className="mc-v2-agent-work">
              <span className="mc-v2-agent-task">{taskLabel}</span>
            </div>

            <footer className="mc-v2-agent-footer">
              <div className="mc-v2-agent-meta">
                <span className="mc-v2-agent-task-workspace">
                  {heartbeatLabel}
                </span>
                {isAllWorkspacesSelected && trackedTask ? (
                  <span className="mc-v2-agent-task-workspace">
                    {getWorkspaceName(trackedTask.workspaceId)}
                  </span>
                ) : null}
                {statusInfo?.nextHeartbeatAt && (
                  <span className="mc-v2-agent-next-review">
                    {t(
                      "missionControl.agent.nextReview",
                      "Check next time: {time}",
                      { time: formatRelativeTime(statusInfo.nextHeartbeatAt) },
                    )}
                  </span>
                )}
              </div>
              {statusInfo?.heartbeatEnabled && (
                <button
                  className="mc-v2-wake-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleTriggerHeartbeat(agent.id);
                  }}
                >
                  {agentContext.getUiCopy("mcWakeAgent")}
                </button>
              )}
            </footer>
          </div>
        );
      })}
      <button className="mc-v2-add-agent-btn" onClick={handleCreateAgent}>
        <Plus size={16} strokeWidth={2} />
        {agentContext.getUiCopy("mcAddAgent")}
      </button>
    </div>
  );
}
