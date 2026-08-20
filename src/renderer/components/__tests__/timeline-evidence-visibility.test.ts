import { describe, expect, it } from "vitest";

import type { TaskEvent } from "../../../shared/types";
import { isRedundantTimelineEvidenceEvent } from "../MainContent/task-feed-logic";

function makeEvidenceEvent(id: string, sources: string[]): TaskEvent {
  return {
    id,
    taskId: "task-1",
    type: "timeline_evidence_attached",
    timestamp: 1,
    payload: {
      evidenceRefs: sources.map((sourceUrlOrPath, index) => ({
        evidenceId: `${id}-${index}`,
        sourceType: "url",
        sourceUrlOrPath,
        capturedAt: 1,
      })),
    },
  } as TaskEvent;
}

describe("timeline evidence visibility", () => {
  it("hides later evidence events that only repeat sources from an earlier larger event", () => {
    const fullEvent = makeEvidenceEvent("event-full", [
      "https://example.com/a",
      "https://example.com/b",
      "https://example.com/c",
    ]);
    const truncatedDuplicate = makeEvidenceEvent("event-truncated", [
      "https://example.com/a",
      "https://example.com/b",
    ]);
    const events = [fullEvent, truncatedDuplicate];

    expect(isRedundantTimelineEvidenceEvent(fullEvent, events)).toBe(false);
    expect(isRedundantTimelineEvidenceEvent(truncatedDuplicate, events)).toBe(
      true,
    );
  });

  it("matches the current evidence event by id when renderer events are normalized copies", () => {
    const fullEvent = makeEvidenceEvent("event-full", [
      "https://example.com/a",
      "https://example.com/b",
    ]);
    const clonedFullEvent = {
      ...fullEvent,
      payload: { ...fullEvent.payload },
    } as TaskEvent;

    expect(isRedundantTimelineEvidenceEvent(clonedFullEvent, [fullEvent])).toBe(
      false,
    );
  });

  it("keeps later evidence events when they add a new source", () => {
    const firstEvent = makeEvidenceEvent("event-first", [
      "https://example.com/a",
    ]);
    const nextEvent = makeEvidenceEvent("event-next", [
      "https://example.com/a",
      "https://example.com/new",
    ]);

    expect(
      isRedundantTimelineEvidenceEvent(nextEvent, [firstEvent, nextEvent]),
    ).toBe(false);
  });
});
