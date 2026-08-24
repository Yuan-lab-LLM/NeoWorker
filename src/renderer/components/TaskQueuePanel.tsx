import { useState } from "react";
import { Task, QueueStatus } from "../../shared/types";
import { translate, useLanguage } from "../i18n";

interface TaskQueuePanelProps {
  tasks: Task[];
  queueStatus: QueueStatus;
  onSelectTask: (taskId: string) => void;
  onCancelTask: (taskId: string) => void;
}

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return translate("time.justNow", "just now");
  if (seconds < 3600)
    return translate("time.minutesAgoShort", "{count}m ago", {
      count: Math.floor(seconds / 60),
    });
  if (seconds < 86400)
    return translate("time.hoursAgoShort", "{count}h ago", {
      count: Math.floor(seconds / 3600),
    });
  return translate("time.daysAgoShort", "{count}d ago", {
    count: Math.floor(seconds / 86400),
  });
}

interface TaskQueueItemProps {
  task: Task;
  isRunning: boolean;
  position?: number;
  onSelect: () => void;
  onCancel: () => void;
}

function TaskQueueItem({
  task,
  isRunning,
  position,
  onSelect,
  onCancel,
}: TaskQueueItemProps) {
  useLanguage();
  const t = translate;
  return (
    <div className="queue-item">
      <div className="queue-item-header">
        <span
          className={`queue-item-status ${isRunning ? "running" : "queued"}`}
        >
          {isRunning ? (
            <span className="spinner" />
          ) : (
            <span className="queue-position">#{position}</span>
          )}
        </span>
        <span className="queue-item-time">{formatTimeAgo(task.createdAt)}</span>
      </div>
      <p className="queue-item-title" onClick={onSelect}>
        {task.title || task.prompt.slice(0, 50)}
      </p>
      <div className="queue-item-actions">
        <button className="queue-item-view" onClick={onSelect}>
          {t("common.view", "View")}
        </button>
        <button className="queue-item-cancel" onClick={onCancel}>
          {t("common.cancel", "Cancel")}
        </button>
      </div>
    </div>
  );
}

export function TaskQueuePanel({
  tasks,
  queueStatus,
  onSelectTask,
  onCancelTask,
}: TaskQueuePanelProps) {
  useLanguage();
  const t = translate;
  const [isExpanded, setIsExpanded] = useState(true);

  const runningTasks = tasks.filter((t) =>
    queueStatus.runningTaskIds.includes(t.id),
  );
  const queuedTasks = tasks.filter((t) =>
    queueStatus.queuedTaskIds.includes(t.id),
  );
  const totalActive = queueStatus.runningCount + queueStatus.queuedCount;

  if (totalActive === 0) {
    return null;
  }

  return (
    <div className="task-queue-panel">
      {/* Header */}
      <button
        className="queue-panel-header"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="queue-panel-title">
          <span className="queue-icon">|||</span>
          <span>{t("taskQueue.lineup", "Lineup")}</span>
          {totalActive > 0 && (
            <span className="queue-badge">
              {queueStatus.runningCount}/{queueStatus.maxConcurrent}
              {queueStatus.queuedCount > 0 && ` +${queueStatus.queuedCount}`}
            </span>
          )}
        </div>
        <span className={`queue-chevron ${isExpanded ? "expanded" : ""}`}>
          ^
        </span>
      </button>

      {/* Content */}
      {isExpanded && (
        <div className="queue-panel-content">
          {/* Active Sessions */}
          {runningTasks.length > 0 && (
            <div className="queue-section">
              <div className="queue-section-header">
                {t("taskQueue.active", "ACTIVE ({count})", {
                  count: runningTasks.length,
                })}
              </div>
              {runningTasks.map((task) => (
                <TaskQueueItem
                  key={task.id}
                  task={task}
                  isRunning={true}
                  onSelect={() => onSelectTask(task.id)}
                  onCancel={() => onCancelTask(task.id)}
                />
              ))}
            </div>
          )}

          {/* Next Up */}
          {queuedTasks.length > 0 && (
            <div className="queue-section">
              <div className="queue-section-header">
                {t("taskQueue.nextUp", "NEXT UP ({count})", {
                  count: queuedTasks.length,
                })}
              </div>
              {queuedTasks.map((task, index) => (
                <TaskQueueItem
                  key={task.id}
                  task={task}
                  isRunning={false}
                  position={index + 1}
                  onSelect={() => onSelectTask(task.id)}
                  onCancel={() => onCancelTask(task.id)}
                />
              ))}
            </div>
          )}

          {totalActive === 0 && (
            <div className="queue-empty">
              {t("taskQueue.allDone", "All done!")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default TaskQueuePanel;
