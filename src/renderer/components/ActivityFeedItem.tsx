import { useState, type CSSProperties, type MouseEvent } from "react";
import {
  ActivityData,
  ActivityType,
  ActivityActorType,
} from "../../electron/preload";
import { ThemeIcon } from "./ThemeIcon";
import {
  AlertTriangleIcon,
  AtIcon,
  BotIcon,
  CheckIcon,
  ClipboardIcon,
  CodeIcon,
  FileIcon,
  InfoIcon,
  MessageIcon,
  PauseIcon,
  PlayIcon,
  SlidersIcon,
  TrashIcon,
  XIcon,
} from "./LineIcons";
import { getCurrentLanguage, translate, useLanguage } from "../i18n";
import { getLocalizedAgentRoleName } from "../utils/localized-agent-roles";

interface ActivityFeedItemProps {
  activity: ActivityData;
  onMarkRead: (id: string) => void;
  onPin: (id: string) => void;
  onDelete: (id: string) => void;
  compact?: boolean;
  showDescription?: boolean;
  showActions?: boolean;
  showUnreadState?: boolean;
}

const ACTIVITY_TITLE_COPY: Record<
  ActivityType,
  { key: string; fallback: string }
> = {
  task_created: { key: "activity.title.taskCreated", fallback: "Task created" },
  task_started: { key: "activity.title.taskStarted", fallback: "Task started" },
  task_completed: {
    key: "activity.title.taskCompleted",
    fallback: "Task completed",
  },
  task_failed: { key: "activity.title.taskFailed", fallback: "Task failed" },
  task_paused: {
    key: "activity.title.taskPaused",
    fallback: "Decision checkpoint",
  },
  task_resumed: { key: "activity.title.taskResumed", fallback: "Task resumed" },
  comment: { key: "activity.title.comment", fallback: "Task note" },
  file_created: { key: "activity.title.fileCreated", fallback: "File created" },
  file_modified: {
    key: "activity.title.fileModified",
    fallback: "File modified",
  },
  file_deleted: { key: "activity.title.fileDeleted", fallback: "File deleted" },
  command_executed: {
    key: "activity.title.commandExecuted",
    fallback: "Command executed",
  },
  tool_used: { key: "activity.title.toolUsed", fallback: "Tool used" },
  mention: { key: "activity.title.mention", fallback: "Mention" },
  supervisor_exchange: {
    key: "activity.title.supervisorExchange",
    fallback: "Supervisor exchange",
  },
  agent_assigned: {
    key: "activity.title.agentAssigned",
    fallback: "Agent assigned",
  },
  error: { key: "activity.title.error", fallback: "Execution error" },
  info: { key: "activity.title.info", fallback: "System update" },
};

const ACTIVITY_ICONS: Record<ActivityType, React.ReactNode> = {
  task_created: <ThemeIcon emoji="📋" icon={<ClipboardIcon size={16} />} />,
  task_started: <ThemeIcon emoji="▶️" icon={<PlayIcon size={16} />} />,
  task_completed: <ThemeIcon emoji="✅" icon={<CheckIcon size={16} />} />,
  task_failed: <ThemeIcon emoji="❌" icon={<XIcon size={16} />} />,
  task_paused: <ThemeIcon emoji="⏸️" icon={<PauseIcon size={16} />} />,
  task_resumed: <ThemeIcon emoji="▶️" icon={<PlayIcon size={16} />} />,
  comment: <ThemeIcon emoji="💬" icon={<MessageIcon size={16} />} />,
  file_created: <ThemeIcon emoji="📄" icon={<FileIcon size={16} />} />,
  file_modified: <ThemeIcon emoji="✏️" icon={<FileIcon size={16} />} />,
  file_deleted: <ThemeIcon emoji="🗑️" icon={<TrashIcon size={16} />} />,
  command_executed: <ThemeIcon emoji="💻" icon={<CodeIcon size={16} />} />,
  tool_used: <ThemeIcon emoji="🔧" icon={<SlidersIcon size={16} />} />,
  mention: <ThemeIcon emoji="@" icon={<AtIcon size={16} />} />,
  supervisor_exchange: <ThemeIcon emoji="🛰️" icon={<BotIcon size={16} />} />,
  agent_assigned: <ThemeIcon emoji="🤖" icon={<BotIcon size={16} />} />,
  error: <ThemeIcon emoji="⚠️" icon={<AlertTriangleIcon size={16} />} />,
  info: <ThemeIcon emoji="ℹ️" icon={<InfoIcon size={16} />} />,
};

const ACTIVITY_COLORS: Record<ActivityType, string> = {
  task_created: "#3b82f6",
  task_started: "#22c55e",
  task_completed: "#22c55e",
  task_failed: "#ef4444",
  task_paused: "#f59e0b",
  task_resumed: "#22c55e",
  comment: "#ec4899",
  file_created: "#8b5cf6",
  file_modified: "#f59e0b",
  file_deleted: "#ef4444",
  command_executed: "#06b6d4",
  tool_used: "#6366f1",
  mention: "#ec4899",
  supervisor_exchange: "#14b8a6",
  agent_assigned: "#6366f1",
  error: "#ef4444",
  info: "#3b82f6",
};

const ACTOR_LABELS: Record<ActivityActorType, string> = {
  agent: "Agent",
  user: "User",
  system: "System",
};

function formatTimeAgo(
  timestamp: number,
  t: (key: string, fallback?: string) => string,
): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);

  if (seconds < 60) return t("activity.time.justNow", "just now");
  if (seconds < 3600) {
    return t("activity.time.minutesAgo", "{count}m ago").replace(
      "{count}",
      String(Math.floor(seconds / 60)),
    );
  }
  if (seconds < 86400) {
    return t("activity.time.hoursAgo", "{count}h ago").replace(
      "{count}",
      String(Math.floor(seconds / 3600)),
    );
  }
  if (seconds < 604800) {
    return t("activity.time.daysAgo", "{count}d ago").replace(
      "{count}",
      String(Math.floor(seconds / 86400)),
    );
  }

  return new Date(timestamp).toLocaleDateString(
    getCurrentLanguage() === "zh-CN" ? "zh-CN" : "en-US",
  );
}

function getActivityTitle(
  activity: ActivityData,
  t: (key: string, fallback?: string) => string,
): string {
  const normalizedTitle = activity.title.trim().toLowerCase();
  if (normalizedTitle.includes("model routing")) {
    return t("activity.title.modelRoutingUpdated", "Model routing updated");
  }
  if (normalizedTitle.includes("neoworker learned")) {
    return t("activity.title.neoworkerLearned", "What NeoWorker learned");
  }
  if (normalizedTitle === "task error") {
    return t("activity.title.taskError", "Task error");
  }
  const copy = ACTIVITY_TITLE_COPY[activity.activityType];
  return t(copy.key, copy.fallback);
}

function getToolDescription(name: string): string | undefined {
  const copy: Record<string, readonly [string, string]> = {
    glob: [
      "generated.components.activityfeeditem.154.0",
      "Find files by filename pattern",
    ],
    list_directory: [
      "generated.components.activityfeeditem.155.1",
      "View directory contents",
    ],
    parse_document: [
      "generated.components.activityfeeditem.156.2",
      "Parse document content",
    ],
    read_file: [
      "generated.components.activityfeeditem.157.3",
      "Read file contents",
    ],
    search_files: [
      "generated.components.activityfeeditem.158.4",
      "Search file contents",
    ],
  };
  const entry = copy[name];
  return entry ? translate(entry[0], entry[1]) : undefined;
}

export function formatActivityDescriptionForDisplay(
  activity: Pick<ActivityData, "activityType" | "description" | "title">,
  language = getCurrentLanguage(),
): string {
  const description = activity.description?.trim() || "";
  if (!description || language !== "zh-CN") return description;

  const normalized = description
    .replace(/^Task execution failed:\s*/i, "")
    .replace(/^Error:\s*/i, "")
    .trim();

  if (/^Task missing verification evidence\b/i.test(normalized)) {
    return translate(
      "generated.components.activityfeeditem.174.5",
      "If the review or verification step is not completed before the end of the task, the system cannot confirm whether the results are reliable.",
    );
  }
  if (/^Task missing direct answer\b/i.test(normalized)) {
    return translate(
      "generated.components.activityfeeditem.177.6",
      "The task does not give a direct conclusion, and the system cannot submit the current content as the final result.",
    );
  }
  if (/^Task missing artifact evidence\b/i.test(normalized)) {
    return translate(
      "generated.components.activityfeeditem.180.7",
      "The task requires production files or other deliverables, but no deliverable output files were detected.",
    );
  }
  if (/^Task missing execution evidence\b/i.test(normalized)) {
    return translate(
      "generated.components.activityfeeditem.183.8",
      "The task lacks actual execution records, and the system cannot confirm that the required operations have been completed.",
    );
  }
  if (/^Task missing required tool evidence\b/i.test(normalized)) {
    return translate(
      "generated.components.activityfeeditem.186.9",
      "The task requires the use of the specified tool, but no invocation of the tool is detected in the execution record.",
    );
  }

  const jsonLocation = normalized.match(/\(line\s+(\d+)\s+column\s+(\d+)\)/i);
  if (
    /after property value in JSON|Unexpected token.*JSON|JSON.*position/i.test(
      normalized,
    )
  ) {
    return jsonLocation
      ? translate(
          "activity.error.jsonLocation",
          "JSON data format error near line {line}, column {column}. Check commas, quotes, and brackets.",
          { line: jsonLocation[1], column: jsonLocation[2] },
        )
      : translate(
          "generated.components.activityfeeditem.199.10",
          "JSON data format error: The content structure is incomplete, please check for commas, quotes, or brackets.",
        );
  }

  if (activity.activityType === "tool_used") {
    const toolDescription = getToolDescription(normalized);
    return translate("activity.usedToolNamed", "Used tool: {tool}", {
      tool: toolDescription || normalized,
    });
  }

  const localizedRole = getLocalizedAgentRoleName(normalized, language);
  if (localizedRole !== normalized) {
    if (activity.activityType === "task_started") {
      return translate("activity.role.started", "{role} started the task.", {
        role: localizedRole,
      });
    }
    if (activity.activityType === "task_created") {
      return translate(
        "activity.role.created",
        "Task created and assigned to {role}.",
        { role: localizedRole },
      );
    }
    if (activity.title.toLowerCase().includes("model routing")) {
      return translate(
        "activity.role.changed",
        "The task role was changed to {role}.",
        { role: localizedRole },
      );
    }
    return localizedRole;
  }

  return normalized
    .replace(
      /\bVerification:\s*pass\b/gi,
      translate(
        "generated.components.activityfeeditem.224.11",
        "Verification result: passed",
      ),
    )
    .replace(
      /\bVerification:\s*warn_non_blocking\b/gi,
      translate(
        "generated.components.activityfeeditem.225.12",
        "Verification result: There is a non-blocking warning",
      ),
    )
    .replace(
      /\bVerification:\s*fail_blocking\b/gi,
      translate(
        "generated.components.activityfeeditem.226.13",
        "Verification result: failed",
      ),
    )
    .replace(
      /\bVerification:\s*pending_user_action\b/gi,
      translate(
        "generated.components.activityfeeditem.227.14",
        "Verification result: waiting for user operation",
      ),
    );
}

export function ActivityFeedItem({
  activity,
  onMarkRead,
  onPin,
  onDelete,
  compact = false,
  showDescription = false,
  showActions = true,
  showUnreadState = true,
}: ActivityFeedItemProps) {
  useLanguage();
  const t = translate;
  const icon = ACTIVITY_ICONS[activity.activityType];
  const color = ACTIVITY_COLORS[activity.activityType];
  const displayDescription = formatActivityDescriptionForDisplay(activity);
  const exchangeId =
    activity.metadata && typeof activity.metadata.exchangeId === "string"
      ? activity.metadata.exchangeId
      : null;
  const exchangeStatus =
    activity.metadata && typeof activity.metadata.exchangeStatus === "string"
      ? activity.metadata.exchangeStatus
      : null;
  const canResolveSupervisorExchange =
    activity.activityType === "supervisor_exchange" &&
    !!exchangeId &&
    exchangeStatus === "escalated";
  const [isResolvingSupervisorExchange, setIsResolvingSupervisorExchange] =
    useState(false);
  const [resolvedSupervisorExchange, setResolvedSupervisorExchange] =
    useState(false);

  const handleClick = () => {
    if (showUnreadState && !activity.isRead) {
      onMarkRead(activity.id);
    }
  };

  const handleResolveSupervisorExchange = async (
    event: MouseEvent<HTMLButtonElement>,
  ) => {
    event.stopPropagation();
    if (!exchangeId) return;

    const resolution = window.prompt(
      t("activity.resolveEscalation", "Resolve supervisor escalation"),
      "",
    );
    if (!resolution || !resolution.trim()) {
      return;
    }

    try {
      setIsResolvingSupervisorExchange(true);
      const mirrorToDiscord = window.confirm(
        t(
          "activity.mirrorResolutionToDiscord",
          "Mirror this resolution back to Discord?",
        ),
      );
      await window.electronAPI.resolveSupervisorExchange({
        id: exchangeId,
        resolution: resolution.trim(),
        mirrorToDiscord,
      });
      setResolvedSupervisorExchange(true);
      if (!activity.isRead) {
        onMarkRead(activity.id);
      }
    } catch (error) {
      console.error("Failed to resolve supervisor exchange:", error);
      window.alert(
        error instanceof Error
          ? error.message
          : t(
              "activity.error.resolveSupervisor",
              "Failed to resolve supervisor exchange",
            ),
      );
    } finally {
      setIsResolvingSupervisorExchange(false);
    }
  };

  return (
    <div
      className={`activity-feed-item ${showUnreadState && !activity.isRead ? "unread" : ""} ${showUnreadState ? "" : "read-state-disabled"} ${activity.isPinned ? "pinned" : ""} ${compact ? "compact" : ""} ${activity.activityType === "error" || activity.activityType === "task_failed" ? "is-alert" : ""}`}
      onClick={showUnreadState ? handleClick : undefined}
    >
      <div
        className="activity-icon"
        style={{ "--activity-color": color } as CSSProperties}
      >
        {icon}
      </div>

      <div className="activity-content">
        <div className="activity-header">
          <span className="activity-title">
            {getActivityTitle(activity, t)}
          </span>
          <span className="activity-time">
            {formatTimeAgo(activity.createdAt, t)}
          </span>
        </div>

        {(!compact || showDescription) && displayDescription && (
          <p className="activity-description">{displayDescription}</p>
        )}

        <div className="activity-meta">
          <span className="activity-actor">
            {t(
              `activity.actor.${activity.actorType}`,
              ACTOR_LABELS[activity.actorType],
            )}
          </span>
          {activity.taskId && (
            <span className="activity-task">{t("activity.task", "Task")}</span>
          )}
        </div>
      </div>

      {showActions && (
        <div className="activity-actions">
          {canResolveSupervisorExchange && !resolvedSupervisorExchange && (
            <button
              className="activity-action-btn resolve"
              onClick={handleResolveSupervisorExchange}
              title={t("activity.resolveEscalation", "Resolve escalation")}
              disabled={isResolvingSupervisorExchange}
            >
              {isResolvingSupervisorExchange
                ? t("activity.resolving", "Resolving...")
                : t("activity.resolve", "Resolve")}
            </button>
          )}
          <button
            className={`activity-action-btn ${activity.isPinned ? "active" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              onPin(activity.id);
            }}
            title={
              activity.isPinned
                ? t("activity.unpin", "Unpin")
                : t("activity.pin", "Pin")
            }
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill={activity.isPinned ? "currentColor" : "none"}
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M12 2l3 6h6l-5 5 2 9-6-4-6 4 2-9-5-5h6l3-6z" />
            </svg>
          </button>
          <button
            className="activity-action-btn"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(activity.id);
            }}
            title={t("common.delete", "Delete")}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      )}

      {showUnreadState && !activity.isRead && (
        <div className="unread-indicator" />
      )}

      <style>{`
        .activity-feed-item {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          padding: 13px 12px 13px 20px;
          border-radius: 0;
          border-bottom: 1px solid var(--color-border-light);
          background: transparent;
          cursor: pointer;
          transition: background 0.15s ease;
          position: relative;
        }

        .activity-feed-item:hover {
          background: var(--color-bg-hover);
        }

        .activity-feed-item.unread {
          background: color-mix(in srgb, var(--color-accent) 5%, transparent);
        }

        .activity-feed-item.is-alert {
          background: color-mix(in srgb, var(--color-error) 5%, transparent);
        }

        .activity-feed-item.read-state-disabled {
          cursor: default;
        }

        .activity-feed-item.read-state-disabled:hover {
          background: transparent;
        }

        .activity-feed-item.read-state-disabled.is-alert:hover {
          background: color-mix(in srgb, var(--color-error) 5%, transparent);
        }

        .activity-feed-item.pinned {
          box-shadow: inset 2px 0 0 var(--color-accent);
        }

        .activity-feed-item.compact {
          padding: 11px 10px 11px 20px;
        }

        .activity-icon {
          width: 28px;
          height: 28px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: color-mix(in srgb, var(--activity-color) 14%, var(--color-bg-primary));
          color: var(--activity-color);
          font-size: 13px;
          flex-shrink: 0;
        }

        .activity-feed-item.compact .activity-icon {
          width: 28px;
          height: 28px;
          font-size: 13px;
        }

        .activity-content {
          flex: 1;
          min-width: 0;
        }

        .activity-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }

        .activity-title {
          font-size: 12px;
          font-weight: 650;
          color: var(--color-text-primary);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .activity-time {
          font-size: 10px;
          color: var(--color-text-muted);
          flex-shrink: 0;
        }

        .activity-description {
          font-size: 12px;
          color: var(--color-text-secondary);
          margin: 4px 0 0 0;
          overflow: hidden;
          text-overflow: ellipsis;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
        }

        .activity-meta {
          display: flex;
          gap: 0;
          margin-top: 4px;
        }

        .activity-actor,
        .activity-task {
          font-size: 10px;
          padding: 0;
          color: var(--color-text-muted);
        }

        .activity-task::before { content: "·"; margin: 0 5px; }

        .activity-actions {
          display: flex;
          gap: 4px;
          opacity: 0;
          transition: opacity 0.15s ease;
        }

        .activity-feed-item:hover .activity-actions {
          opacity: 1;
        }

        .activity-action-btn {
          width: 24px;
          height: 24px;
          border: 1px solid transparent;
          background: transparent;
          color: var(--color-text-muted);
          cursor: pointer;
          border-radius: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.15s ease;
        }

        .activity-action-btn.resolve {
          width: auto;
          padding: 0 8px;
          border: 1px solid var(--color-border);
          font-size: 11px;
          font-weight: 600;
        }

        .activity-action-btn:hover {
          border-color: var(--color-border-light);
          background: var(--color-bg-primary);
          color: var(--color-text-primary);
        }

        .activity-action-btn.active {
          color: var(--color-accent);
        }

        .unread-indicator {
          position: absolute;
          top: 24px;
          left: 8px;
          width: 5px;
          height: 5px;
          background: var(--color-accent);
          border-radius: 50%;
        }
      `}</style>
    </div>
  );
}
