export interface ComposerSubmissionState {
  isTaskWorking: boolean;
  isUploadingAttachments: boolean;
  isPreparingMessage: boolean;
  isQueueingFollowUp: boolean;
}

/**
 * A started task can keep the original send promise open for the whole turn.
 * That promise must not disable the composer: while the task is working, the
 * user is allowed to add another message to its FIFO follow-up queue.
 */
export function isComposerSubmissionBusy({
  isTaskWorking,
  isUploadingAttachments,
  isPreparingMessage,
  isQueueingFollowUp,
}: ComposerSubmissionState): boolean {
  if (isQueueingFollowUp) return true;
  if (isTaskWorking) return false;
  return isUploadingAttachments || isPreparingMessage;
}
