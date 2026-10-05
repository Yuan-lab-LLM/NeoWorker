import { Check, CircleAlert, Loader2 } from "lucide-react";
import { translate } from "../../i18n";
import type { LiveTaskProgressState } from "./live-task-progress";

export function LiveTaskProgress({ state }: { state: LiveTaskProgressState }) {
  const latestSettled = state.operations.filter(operation => operation.state !== "active").at(-1);
  return (
    <section className="live-task-progress" aria-label={translate("task.progress.title", "Execution progress")}>
      <div className="live-task-progress-current" role="status" aria-live="polite">
        <Loader2 size={16} className="live-task-progress-spinner" aria-hidden="true" />
        <span>{state.status}</span>
        {state.activeCount > 1 && <span className="live-task-progress-count">
          {translate("task.progress.parallel", "{count} operations in parallel", { count: state.activeCount })}
        </span>}
      </div>
      {latestSettled && <div className={`live-task-progress-recent is-${latestSettled.state}`}>
        {latestSettled.state === "completed" ? <Check size={13} aria-hidden="true" /> : <CircleAlert size={13} aria-hidden="true" />}
        <span>{latestSettled.label}</span>
        <span className="live-task-progress-state">{translate(`task.progress.${latestSettled.state}`, latestSettled.state)}</span>
      </div>}
      {state.silentSeconds >= 45 && (
        <div className="live-task-progress-silence">{translate("task.progress.silence", "No new progress received for {seconds}s", { seconds: state.silentSeconds })}</div>
      )}
    </section>
  );
}
