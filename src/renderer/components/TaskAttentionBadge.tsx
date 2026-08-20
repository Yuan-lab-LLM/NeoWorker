import {
  Circle,
  CircleAlert,
  CircleCheck,
  CircleX,
  Clock3,
  LoaderCircle,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react";
import type { TaskAttentionState } from "../../shared/task-attention";
import { translate } from "../i18n";
import "./task-attention-badge.css";

const ATTENTION_ICONS: Record<TaskAttentionState, LucideIcon> = {
  idle: Circle,
  working: LoaderCircle,
  waiting: Clock3,
  needs_approval: ShieldAlert,
  needs_attention: CircleAlert,
  done: CircleCheck,
  failed: CircleX,
};

export function getTaskAttentionLabel(state: TaskAttentionState): string {
  const labels: Record<TaskAttentionState, [string, string]> = {
    idle: ["task.attention.idle", "Not started"],
    working: ["task.attention.working", "In progress"],
    waiting: ["task.attention.waiting", "Waiting"],
    needs_approval: ["task.attention.needsApproval", "Needs approval"],
    needs_attention: ["task.attention.needsAttention", "Needs attention"],
    done: ["task.attention.done", "Completed"],
    failed: ["task.attention.failed", "Failed"],
  };
  const [key, fallback] = labels[state];
  return translate(key, fallback);
}

export function TaskAttentionBadge({
  state,
  count = 0,
  compact = false,
  className = "",
  labelOverride,
  announce = false,
}: {
  state: TaskAttentionState;
  count?: number;
  compact?: boolean;
  className?: string;
  labelOverride?: string;
  announce?: boolean;
}) {
  const Icon = ATTENTION_ICONS[state];
  const label = labelOverride || getTaskAttentionLabel(state);
  return (
    <span
      className={`task-attention-badge state-${state}${compact ? " compact" : ""}${className ? ` ${className}` : ""}`}
      title={label}
      aria-label={count > 0 ? `${label}, ${count}` : label}
      aria-live={announce ? "polite" : undefined}
      aria-atomic={announce || undefined}
    >
      <Icon size={compact ? 13 : 14} strokeWidth={2.1} aria-hidden="true" />
      {!compact && <span>{label}</span>}
      {count > 0 && <span className="task-attention-count">{count}</span>}
    </span>
  );
}
