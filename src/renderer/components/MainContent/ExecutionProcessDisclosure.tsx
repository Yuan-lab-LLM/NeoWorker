import { useId, useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { formatDuration } from "../../hooks/useTaskDuration";
import { translate } from "../../i18n";

export function ExecutionProcessDisclosure({ durationMs, renderDetails }: {
  durationMs: number;
  renderDetails: () => ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();
  return (
    <section className="execution-process-disclosure">
      <button
        type="button"
        className="execution-process-toggle"
        aria-expanded={expanded}
        aria-controls={detailsId}
        onClick={() => setExpanded((value) => !value)}
      >
        <ChevronRight size={14} className={expanded ? "expanded" : ""} aria-hidden="true" />
        <span>{translate("task.executionProcess", "View execution process")}</span>
        {durationMs > 0 && <span className="execution-process-duration">{formatDuration(durationMs)}</span>}
      </button>
      {expanded && <div id={detailsId} className="execution-process-details">{renderDetails()}</div>}
    </section>
  );
}
