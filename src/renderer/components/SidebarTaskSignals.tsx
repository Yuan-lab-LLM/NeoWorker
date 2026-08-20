import type { TaskAttentionState } from "../../shared/task-attention";
import type { TaskProvenanceSummary } from "../../shared/types";
import { translate } from "../i18n";
import { IntegrationMentionIcon } from "./IntegrationMentionIcon";
import {
  getTaskAttentionLabel,
  TaskAttentionBadge,
} from "./TaskAttentionBadge";
import "./sidebar-task-signals.css";

export function isSidebarAttentionSignal(state: TaskAttentionState): boolean {
  return (
    state === "needs_approval" ||
    state === "needs_attention" ||
    state === "failed"
  );
}

export function isSidebarLivenessSignal(state: TaskAttentionState): boolean {
  return state === "working" || state === "waiting";
}

export function SidebarTaskSignals({
  taskId,
  attentionState,
  attentionCount,
  provenance,
  onOpenSource,
}: {
  taskId: string;
  attentionState: TaskAttentionState;
  attentionCount: number;
  provenance?: TaskProvenanceSummary;
  onOpenSource?: (taskId: string) => void;
}) {
  const sourceLabel =
    provenance?.providerLabel ||
    translate("task.source.external", "External source");
  const sourceOverflow = Math.max(0, (provenance?.count || 0) - 1);

  return (
    <span className="sidebar-task-signals">
      {isSidebarAttentionSignal(attentionState) ? (
        <TaskAttentionBadge
          state={attentionState}
          count={attentionCount}
          compact
          className="cli-task-attention"
        />
      ) : null}
      {isSidebarLivenessSignal(attentionState) ? (
        <span
          className={`sidebar-task-liveness state-${attentionState}`}
          title={getTaskAttentionLabel(attentionState)}
          aria-label={getTaskAttentionLabel(attentionState)}
          role="status"
        >
          <span aria-hidden="true" />
        </span>
      ) : null}
      {provenance ? (
        <button
          type="button"
          className="cli-task-source-icon"
          title={sourceLabel}
          aria-label={translate(
            "task.source.openForTask",
            "Open task source: {source}",
            {
              source: sourceLabel,
            },
          )}
          onClick={(event) => {
            event.stopPropagation();
            onOpenSource?.(taskId);
          }}
        >
          <IntegrationMentionIcon
            iconKey={provenance.providerKey}
            label={sourceLabel}
            size="xs"
          />
          {sourceOverflow > 0 ? (
            <span className="sidebar-task-source-overflow" aria-hidden="true">
              +{sourceOverflow}
            </span>
          ) : null}
        </button>
      ) : null}
    </span>
  );
}
