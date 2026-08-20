import { describe, expect, it } from "vitest";

import type { TaskEvent } from "../../../shared/types";
import { findReplacementArtifactForCompletedFollowUp } from "../artifact-followup";

function makeArtifactEvent(
  id: string,
  timestamp: number,
  payload: Record<string, unknown>,
): TaskEvent {
  return {
    id,
    taskId: "task-1",
    timestamp,
    type: "timeline_artifact_emitted",
    payload,
    schemaVersion: 2,
  } as TaskEvent;
}

function makeCompletedEvent(
  id: string,
  timestamp: number,
  outputSummary?: Record<string, unknown>,
): TaskEvent {
  return {
    id,
    taskId: "task-1",
    timestamp,
    type: "task_completed",
    payload: outputSummary ? { outputSummary } : {},
  } as TaskEvent;
}

describe("findReplacementArtifactForCompletedFollowUp", () => {
  it("switches a stale PDF preview to a newly generated same-stem presentation", () => {
    const replacement = findReplacementArtifactForCompletedFollowUp({
      current: {
        kind: "document",
        path: "/workspace/商务部沟通材料_分析报告.pdf",
      },
      turnStartedAt: 200,
      events: [
        makeArtifactEvent("old-pdf", 100, {
          path: "/workspace/商务部沟通材料_分析报告.pdf",
          legacyType: "artifact_created",
        }),
        makeArtifactEvent("renamed-pptx", 300, {
          action: "rename",
          from: "商务部沟通材料_分析报告",
          to: "商务部沟通材料_分析报告.pptx",
          legacyType: "file_modified",
        }),
        makeCompletedEvent("completed", 310),
      ],
    });

    expect(replacement).toEqual({
      kind: "presentation",
      path: "商务部沟通材料_分析报告.pptx",
    });
  });

  it("does not switch to an unrelated artifact from the same turn", () => {
    const replacement = findReplacementArtifactForCompletedFollowUp({
      current: { kind: "document", path: "/workspace/report.pdf" },
      turnStartedAt: 200,
      events: [
        makeArtifactEvent("other", 300, {
          path: "/workspace/summary.pptx",
          legacyType: "artifact_created",
        }),
        makeCompletedEvent("completed", 310),
      ],
    });

    expect(replacement).toBeNull();
  });

  it("ignores same-stem artifacts created before the active follow-up", () => {
    const replacement = findReplacementArtifactForCompletedFollowUp({
      current: { kind: "document", path: "/workspace/report.pdf" },
      turnStartedAt: 200,
      events: [
        makeArtifactEvent("old-pptx", 100, {
          path: "/workspace/report.pptx",
          legacyType: "artifact_created",
        }),
        makeCompletedEvent("completed", 310),
      ],
    });

    expect(replacement).toBeNull();
  });

  it("moves a stale v2 Word preview to the canonical verified filename", () => {
    const replacement = findReplacementArtifactForCompletedFollowUp({
      current: {
        kind: "document",
        path: "/workspace/北京上周天气报告-20260803-0809-v2.docx",
      },
      turnStartedAt: 200,
      outputSummary: {
        created: ["北京上周天气报告-20260803-0809.docx"],
        primaryOutputPath: "北京上周天气报告-20260803-0809.docx",
        outputCount: 1,
        folders: [],
      },
      events: [
        makeArtifactEvent("canonical-docx", 300, {
          path: "北京上周天气报告-20260803-0809.docx",
          legacyType: "artifact_created",
        }),
        makeCompletedEvent("completed", 310, {
          created: ["北京上周天气报告-20260803-0809.docx"],
          primaryOutputPath: "北京上周天气报告-20260803-0809.docx",
          outputCount: 1,
          folders: [],
        }),
      ],
    });

    expect(replacement).toEqual({
      kind: "document",
      path: "北京上周天气报告-20260803-0809.docx",
    });
  });

  it("supports parenthesized version markers without matching ordinary numbers", () => {
    const replacement = findReplacementArtifactForCompletedFollowUp({
      current: { kind: "document", path: "/workspace/report（V3）.docx" },
      turnStartedAt: 200,
      events: [
        makeArtifactEvent("final", 300, {
          path: "/workspace/report.docx",
          legacyType: "artifact_created",
        }),
        makeCompletedEvent("completed", 310),
      ],
    });
    const unrelated = findReplacementArtifactForCompletedFollowUp({
      current: { kind: "document", path: "/workspace/report-2026.docx" },
      turnStartedAt: 200,
      events: [
        makeArtifactEvent("other-year", 300, {
          path: "/workspace/report.docx",
          legacyType: "artifact_created",
        }),
        makeCompletedEvent("completed", 310),
      ],
    });

    expect(replacement?.path).toBe("/workspace/report.docx");
    expect(unrelated).toBeNull();
  });

  it("uses the persisted final output contract when lifecycle events are absent", () => {
    const replacement = findReplacementArtifactForCompletedFollowUp({
      current: { kind: "document", path: "report-v2.docx" },
      turnStartedAt: 200,
      outputSummary: {
        created: ["report.docx"],
        primaryOutputPath: "report.docx",
        outputCount: 1,
        folders: [],
      },
      events: [
        makeCompletedEvent("completed", 310, {
          created: ["report.docx"],
          primaryOutputPath: "report.docx",
          outputCount: 1,
          folders: [],
        }),
      ],
    });

    expect(replacement).toEqual({ kind: "document", path: "report.docx" });
  });
});
