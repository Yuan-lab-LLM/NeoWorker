import { describe, expect, it } from "vitest";
import { isComposerSubmissionBusy } from "../composer-submission-state";

describe("composer submission state", () => {
  it("keeps the composer available while an earlier task turn is running", () => {
    expect(
      isComposerSubmissionBusy({
        isTaskWorking: true,
        isUploadingAttachments: false,
        isPreparingMessage: true,
        isQueueingFollowUp: false,
      }),
    ).toBe(false);
  });

  it("blocks duplicate queue clicks until the current enqueue finishes", () => {
    expect(
      isComposerSubmissionBusy({
        isTaskWorking: true,
        isUploadingAttachments: false,
        isPreparingMessage: true,
        isQueueingFollowUp: true,
      }),
    ).toBe(true);
  });

  it("still blocks overlapping preparation before a task has started", () => {
    expect(
      isComposerSubmissionBusy({
        isTaskWorking: false,
        isUploadingAttachments: false,
        isPreparingMessage: true,
        isQueueingFollowUp: false,
      }),
    ).toBe(true);
  });
});
