import { describe, expect, it } from "vitest";
import { findInterruptedFollowUp } from "../follow-up-recovery";

describe("findInterruptedFollowUp", () => {
  it("recovers a legacy follow-up interrupted after its first artifact", () => {
    expect(
      findInterruptedFollowUp([
        {
          seq: 1,
          timestamp: 100,
          type: "timeline_step_updated",
          payload: {
            legacyType: "user_message",
            message: "分别生成 Word 和 PDF 文件",
            stepId: "turn:task-1:follow-up:turn-1",
          },
        },
        {
          seq: 2,
          timestamp: 200,
          type: "timeline_artifact_emitted",
          payload: { legacyType: "artifact_created", path: "report.docx" },
        },
        {
          seq: 3,
          timestamp: 300,
          type: "timeline_step_updated",
          payload: { legacyType: "task_interrupted" },
        },
      ]),
    ).toEqual({
      message: "分别生成 Word 和 PDF 文件",
      startedAt: 100,
      turnId: "turn:task-1:follow-up:turn-1",
      requiredArtifactExtensions: [],
    });
  });

  it("does not recover a follow-up that already completed", () => {
    expect(
      findInterruptedFollowUp([
        {
          seq: 1,
          timestamp: 100,
          payload: {
            legacyType: "follow_up_started",
            message: "分别生成 Word 和 PDF 文件",
            turnId: "turn-1",
            artifactEvidenceStartedAt: 90,
            requiredArtifactExtensions: [".docx", ".pdf"],
          },
        },
        {
          seq: 2,
          timestamp: 200,
          payload: { legacyType: "follow_up_completed", turnId: "turn-1" },
        },
      ]),
    ).toBeNull();
  });

  it("ignores the initial task user message", () => {
    expect(
      findInterruptedFollowUp([
        {
          seq: 1,
          timestamp: 100,
          payload: {
            legacyType: "user_message",
            message: "Create the initial HTML report",
            stepId: "turn:task-1:initial",
          },
        },
      ]),
    ).toBeNull();
  });

  it("does not treat a queued follow-up as an already-started turn", () => {
    expect(
      findInterruptedFollowUp([
        {
          seq: 1,
          timestamp: 100,
          payload: {
            legacyType: "user_message",
            message: "排队中的追问",
            followUp: true,
            queued: true,
            queueId: "queue-1",
          },
        },
        {
          seq: 2,
          timestamp: 200,
          payload: {
            legacyType: "follow_up_completed",
            message: "上一轮追问完成",
          },
        },
      ]),
    ).toBeNull();
  });

  it("recovers a queued follow-up whose dispatch started before shutdown", () => {
    expect(
      findInterruptedFollowUp([
        {
          seq: 1,
          timestamp: 100,
          payload: {
            legacyType: "user_message",
            message: "排队中的追问",
            followUp: true,
            queued: true,
            queueId: "queue-1",
          },
        },
        {
          seq: 2,
          timestamp: 200,
          payload: {
            legacyType: "follow_up_dispatch_started",
            queueId: "queue-1",
            message: "排队中的追问",
            dispatchStartedAt: 190,
          },
        },
      ]),
    ).toEqual({
      message: "排队中的追问",
      startedAt: 190,
      requiredArtifactExtensions: [],
    });
  });

  it("treats a persisted dispatch-finished marker as terminal", () => {
    expect(
      findInterruptedFollowUp([
        {
          seq: 1,
          timestamp: 100,
          payload: {
            legacyType: "follow_up_dispatch_started",
            queueId: "queue-1",
            message: "已发送",
          },
        },
        {
          seq: 2,
          timestamp: 200,
          payload: {
            legacyType: "follow_up_dispatch_finished",
            queueId: "queue-1",
          },
        },
      ]),
    ).toBeNull();
  });

  it("preserves the explicit multi-artifact contract", () => {
    expect(
      findInterruptedFollowUp([
        {
          seq: 1,
          timestamp: 100,
          payload: {
            legacyType: "follow_up_started",
            message: "分别生成 Word 和 PDF 文件",
            turnId: "turn-1",
            artifactEvidenceStartedAt: 80,
            requiredArtifactExtensions: [".DOCX", ".PDF"],
          },
        },
      ]),
    ).toEqual({
      message: "分别生成 Word 和 PDF 文件",
      startedAt: 80,
      turnId: "turn-1",
      requiredArtifactExtensions: [".docx", ".pdf"],
    });
  });
});
