import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  CheckCircle2,
  ChevronDown,
  CirclePause,
  LoaderCircle,
  TriangleAlert,
} from "lucide-react";
import { translate } from "../i18n";

export type ArtifactTurnStatus =
  "working" | "completed" | "failed" | "waiting" | "paused" | "latest";

export type SpreadsheetTurnContext = {
  status?: ArtifactTurnStatus;
  statusLabel: string;
  summary: string;
  secondaryText?: string;
  artifactPath: string;
  artifactName: string;
  events?: Array<{
    id: string;
    kind: "step" | "assistant";
    text: string;
    tone?: "muted" | "active" | "done";
  }>;
};

type ArtifactTurnProgressPanelProps = {
  turnContext: SpreadsheetTurnContext;
  children?: ReactNode;
};

function TurnStatusIcon({ status }: { status: ArtifactTurnStatus }) {
  if (status === "working") return <LoaderCircle aria-hidden="true" />;
  if (status === "completed") return <CheckCircle2 aria-hidden="true" />;
  if (status === "failed" || status === "waiting") {
    return <TriangleAlert aria-hidden="true" />;
  }
  if (status === "paused") return <CirclePause aria-hidden="true" />;
  return <CheckCircle2 aria-hidden="true" />;
}

export function ArtifactTurnProgressPanel({
  turnContext,
  children,
}: ArtifactTurnProgressPanelProps) {
  const status = turnContext.status ?? "latest";
  const [expanded, setExpanded] = useState(
    () => status === "working" || status === "failed" || status === "waiting",
  );
  const previousStatusRef = useRef<ArtifactTurnStatus>(status);
  const eventsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const previousStatus = previousStatusRef.current;
    if (
      status !== previousStatus &&
      (status === "working" || status === "failed" || status === "waiting")
    ) {
      setExpanded(true);
    }
    previousStatusRef.current = status;
  }, [status]);

  useEffect(() => {
    if (!expanded || !eventsRef.current) return;
    eventsRef.current.scrollTop = eventsRef.current.scrollHeight;
  }, [expanded, turnContext.events]);

  const label = expanded
    ? translate("common.collapse", "Collapse")
    : translate("common.expand", "Expand");
  const latestEvent = turnContext.events?.[turnContext.events.length - 1];
  const compactUpdate = latestEvent?.text || turnContext.summary;

  return (
    <section
      className={`spreadsheet-viewer-turn-frame ${expanded ? "expanded" : "collapsed"} status-${status}`}
      aria-live="polite"
      aria-label={turnContext.statusLabel}
    >
      <button
        type="button"
        className="spreadsheet-viewer-turn-header"
        onClick={() => setExpanded((current) => !current)}
        aria-expanded={expanded}
        aria-label={label}
        title={label}
      >
        <span className="spreadsheet-viewer-turn-header-main">
          <span className="spreadsheet-viewer-turn-status-icon">
            <TurnStatusIcon status={status} />
          </span>
          <span className="spreadsheet-viewer-turn-status-label">
            {turnContext.statusLabel}
          </span>
          {!expanded && compactUpdate && (
            <span className="spreadsheet-viewer-turn-compact-update">
              {compactUpdate}
            </span>
          )}
        </span>
        <ChevronDown
          className="spreadsheet-viewer-turn-chevron"
          size={18}
          aria-hidden="true"
        />
      </button>

      {expanded && (
        <div className="spreadsheet-viewer-turn-body">
          <p className="spreadsheet-viewer-turn-summary">
            {turnContext.summary}
          </p>
          {turnContext.secondaryText && (
            <p className="spreadsheet-viewer-turn-secondary">
              {turnContext.secondaryText}
            </p>
          )}
          {turnContext.events && turnContext.events.length > 0 && (
            <div ref={eventsRef} className="spreadsheet-viewer-turn-events">
              {turnContext.events.map((event) => (
                <div
                  key={event.id}
                  className={`spreadsheet-viewer-turn-event kind-${event.kind} ${
                    event.tone ? `tone-${event.tone}` : ""
                  }`}
                >
                  <span className="spreadsheet-viewer-turn-event-text">
                    {event.text}
                  </span>
                </div>
              ))}
            </div>
          )}
          {status !== "working" && children}
        </div>
      )}
    </section>
  );
}
