import { useState } from "react";
import type { AgentUiEvent } from "../../../shared/timeline-events";
import type { TaskEvent } from "../../../shared/types";
import { EvidenceList } from "./EvidenceList";
import { RawEventDrawer } from "./RawEventDrawer";
import { SummaryEventCard } from "./SummaryEventCard";

interface AgentEventCardProps {
  event: AgentUiEvent;
  allEvents: TaskEvent[];
  showConnectorAbove?: boolean;
  showConnectorBelow?: boolean;
  defaultExpanded?: boolean;
}

function formatDuration(ms: number | undefined): string {
  if (!ms || ms <= 0) return "";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${String(s % 60).padStart(2, "0")}s`;
}

const STATUS_ICON: Record<string, string> = {
  running: "⟳",
  success: "✓",
  error: "✕",
  waiting: "⌛",
  blocked: "⊘",
};

export function AgentEventCard({
  event,
  allEvents,
  showConnectorAbove = false,
  showConnectorBelow = false,
  defaultExpanded = false,
}: AgentEventCardProps) {
  const [expanded, setExpanded] = useState(
    defaultExpanded || event.status === "running",
  );

  const hasChildren = (event.children?.length ?? 0) > 0;
  const hasDetails =
    event.evidence.length > 0 || event.rawEventIds.length > 0 || hasChildren;
  const duration = formatDuration(event.durationMs);

  return (
    <div
      className={`semantic-card agent-event-card status-${event.status} phase-${event.phase}`}
      data-event-id={event.id}
      data-testid="agent-event-card"
      data-actor={event.actor}
    >
      <div className="event-indicator">
        {showConnectorAbove && (
          <span
            className="event-connector event-connector-above"
            aria-hidden="true"
          />
        )}
        <span
          className={`event-indicator-icon agent-indicator status-${event.status}`}
          aria-label={`${event.actor} agent: ${event.status}`}
        >
          {STATUS_ICON[event.status] ?? "·"}
        </span>
        {showConnectorBelow && (
          <span
            className="event-connector event-connector-below"
            aria-hidden="true"
          />
        )}
      </div>
      <div className="event-content agent-event-content">
        <div
          className={`event-header agent-header ${hasDetails ? "expandable" : ""} ${expanded ? "expanded" : ""}`}
          onClick={hasDetails ? () => setExpanded((v) => !v) : undefined}
          role={hasDetails ? "button" : undefined}
          tabIndex={hasDetails ? 0 : undefined}
          onKeyDown={
            hasDetails
              ? (e) => {
                  if (e.key === "Enter" || e.key === " ")
                    setExpanded((v) => !v);
                }
              : undefined
          }
        >
          <div className="event-header-left">
            {hasDetails && (
              <svg
                className={`event-expand-icon ${expanded ? "rotated" : ""}`}
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path d="M9 18l6-6-6-6" />
              </svg>
            )}
            <div className="event-title">
              <span className="agent-name-badge">{event.actor}</span>
              <span className="event-summary-text">{event.summary}</span>
            </div>
          </div>
          <div className="event-meta">
            {duration && <span className="event-duration">{duration}</span>}
            <span className={`agent-status-chip status-${event.status}`}>
              {event.status}
            </span>
          </div>
        </div>
        {expanded && hasDetails && (
          <div className="event-details agent-details">
            {hasChildren && (
              <div className="agent-children">
                {event.children!.map((child, i) => (
                  <SummaryEventCard
                    key={child.id}
                    event={child}
                    allEvents={allEvents}
                    showConnectorAbove={i > 0}
                    showConnectorBelow={i < event.children!.length - 1}
                  />
                ))}
              </div>
            )}
            <EvidenceList evidence={event.evidence} />
            <RawEventDrawer
              rawEventIds={event.rawEventIds}
              allEvents={allEvents}
            />
          </div>
        )}
      </div>
    </div>
  );
}
