import { useState } from "react";
import type { TaskEvent } from "../../../shared/types";

interface RawEventDrawerProps {
  rawEventIds: string[];
  /** All task events for this task (used to look up raw events by ID) */
  allEvents: TaskEvent[];
}

function formatTimestamp(ts: number): string {
  try {
    return new Date(ts).toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      fractionalSecondDigits: 3,
    });
  } catch {
    return String(ts);
  }
}

function truncatePayload(payload: unknown): string {
  try {
    const json = JSON.stringify(payload, null, 2);
    if (json.length <= 400) return json;
    return `${json.slice(0, 400)}\n  … (truncated)`;
  } catch {
    return String(payload);
  }
}

export function RawEventDrawer({
  rawEventIds,
  allEvents,
}: RawEventDrawerProps) {
  const [open, setOpen] = useState(false);

  const events = rawEventIds
    .map((id) => allEvents.find((e) => e.id === id))
    .filter((e): e is TaskEvent => Boolean(e));

  if (events.length === 0) return null;

  return (
    <div className="raw-event-drawer">
      <button
        type="button"
        className="raw-event-drawer-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {open ? "Hide" : "Show"} raw events ({rawEventIds.length})
      </button>
      {open && (
        <div className="raw-event-drawer-body" role="region">
          {events.map((event) => (
            <div key={event.id} className="raw-event-row">
              <span className="raw-event-time">
                {formatTimestamp(event.timestamp)}
              </span>
              <span className="raw-event-type">{event.type}</span>
              {event.status && (
                <span className={`raw-event-status status-${event.status}`}>
                  {event.status}
                </span>
              )}
              <pre className="raw-event-payload">
                {truncatePayload(event.payload)}
              </pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
