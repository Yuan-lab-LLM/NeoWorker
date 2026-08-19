import { describe, expect, it } from "vitest";
import type { TaskEvent, TaskProvenanceRecord } from "../../../shared/types";
import {
  getVisibleTaskProvenance,
  isTaskProvenanceEvent,
} from "../TaskSourceCard";

function source(id: string): TaskProvenanceRecord {
  return {
    id,
    taskId: "task-1",
    relation: "direct",
    sourceKind: "gateway_message",
    providerKey: "slack",
    attachments: [],
    occurredAt: 1_000,
    createdAt: 1_000,
  };
}

describe("TaskSourceCard helpers", () => {
  it("shows the first and latest source when a long source chain is collapsed", () => {
    const records = [source("1"), source("2"), source("3"), source("4")];

    expect(
      getVisibleTaskProvenance(records, false).map((record) => record.id),
    ).toEqual(["1", "4"]);
    expect(getVisibleTaskProvenance(records, true)).toEqual(records);
  });

  it("recognizes only provenance evidence events for the selected task", () => {
    const event = {
      id: "event-1",
      taskId: "task-1",
      timestamp: 1_000,
      schemaVersion: 2,
      type: "timeline_evidence_attached",
      payload: {
        evidenceRefs: [
          {
            evidenceId: "source-1",
            sourceType: "user_input",
            sourceUrlOrPath: "provenance:source-1",
            capturedAt: 1_000,
          },
        ],
      },
    } as TaskEvent;

    expect(isTaskProvenanceEvent(event, "task-1")).toBe(true);
    expect(isTaskProvenanceEvent(event, "task-2")).toBe(false);
    expect(
      isTaskProvenanceEvent(
        {
          ...event,
          payload: {
            evidenceRefs: [
              {
                sourceUrlOrPath: "https://example.com",
              },
            ],
          },
        },
        "task-1",
      ),
    ).toBe(false);
  });
});
