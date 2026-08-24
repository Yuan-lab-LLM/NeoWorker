import { describe, expect, it } from "vitest";

import {
  getCompletionSummaryText,
  resolveTimelineControlsPlacement,
  shouldShowTimelineControls,
} from "../MainContent/task-event-presentation";

describe("getCompletionSummaryText", () => {
  it("does not append an internal semantic tool summary to a delivered answer", () => {
    const text = getCompletionSummaryText({
      id: "completed-1",
      taskId: "task-1",
      timestamp: 1,
      type: "timeline_step_finished",
      payload: {
        legacyType: "task_completed",
        resultSummary: "这是正式回复。",
        semanticSummary: "Let Me Check The Workspace",
      },
    } as any);

    expect(text).toBe("这是正式回复。");
  });

  it("uses the semantic summary only when no delivery message is available", () => {
    const text = getCompletionSummaryText({
      id: "completed-2",
      taskId: "task-1",
      timestamp: 1,
      type: "timeline_step_finished",
      payload: {
        legacyType: "task_completed",
        semanticSummary: "任务已完成。",
      },
    } as any);

    expect(text).toBe("任务已完成。");
  });

  it("prefers the durable delivery when a late progress line overwrote the direct summary", () => {
    const text = getCompletionSummaryText({
      id: "completed-3",
      taskId: "task-1",
      timestamp: 1,
      type: "timeline_step_finished",
      payload: {
        legacyType: "task_completed",
        resultSummary: "中文文件名导致 shell 执行异常。",
        bestKnownOutcome: {
          resultSummary: "Excel 已生成，共 5 个工作表、85 行数据。",
        },
      },
    } as any);

    expect(text).toBe("Excel 已生成，共 5 个工作表、85 行数据。");
  });

  it("keeps the turn-authoritative delivery when an older verbose analysis is longer", () => {
    const text = getCompletionSummaryText({
      id: "completed-4",
      taskId: "task-1",
      timestamp: 1,
      type: "timeline_step_finished",
      payload: {
        legacyType: "task_completed",
        resultSummary: "✅ 正式 DOCX 已生成并通过质检。",
        outputSummary: {
          created: ["final.docx"],
          primaryOutputPath: "final.docx",
          outputCount: 1,
          folders: ["."],
        },
        bestKnownOutcome: {
          resultSummary:
            "本步骤完成（只读分析，未产出交付文件）。这是更长但已经过时的中间分析。",
        },
      },
    } as any);

    expect(text).toBe("✅ 正式 DOCX 已生成并通过质检。");
  });
});

describe("shouldShowTimelineControls", () => {
  it("keeps task status controls visible while a conversational task is running", () => {
    expect(
      shouldShowTimelineControls({
        hasNonConversationEvents: false,
        isTaskWorking: true,
        isTaskFinished: false,
      }),
    ).toBe(true);
  });

  it("keeps task status controls visible after completion", () => {
    expect(
      shouldShowTimelineControls({
        hasNonConversationEvents: false,
        isTaskWorking: false,
        isTaskFinished: true,
      }),
    ).toBe(true);
  });

  it("does not show task controls for an idle prompt without execution state", () => {
    expect(
      shouldShowTimelineControls({
        hasNonConversationEvents: false,
        isTaskWorking: false,
        isTaskFinished: false,
      }),
    ).toBe(false);
  });
});

describe("resolveTimelineControlsPlacement", () => {
  it("moves controls from the initial prompt to the latest follow-up query", () => {
    expect(
      resolveTimelineControlsPlacement({
        showTimelineControls: true,
        hasInitialPrompt: true,
        hasUserFollowUp: true,
      }),
    ).toBe("latest-query");
  });

  it("keeps controls on the initial query before any follow-up", () => {
    expect(
      resolveTimelineControlsPlacement({
        showTimelineControls: true,
        hasInitialPrompt: true,
        hasUserFollowUp: false,
      }),
    ).toBe("initial-query");
  });

  it("falls back to a standalone row only when no query bubble exists", () => {
    expect(
      resolveTimelineControlsPlacement({
        showTimelineControls: true,
        hasInitialPrompt: false,
        hasUserFollowUp: false,
      }),
    ).toBe("standalone");
  });
});
