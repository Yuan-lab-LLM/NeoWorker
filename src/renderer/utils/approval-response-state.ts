import type {
  ApprovalRequest,
  ApprovalResponseStatus,
} from "../../shared/types";

/**
 * A missing approval is terminal from the renderer's perspective: the daemon
 * can no longer act on it, so retaining its modal only traps the user.
 */
export function shouldDismissApprovalAfterResponse(
  status: ApprovalResponseStatus,
): boolean {
  return status === "handled" || status === "duplicate" || status === "not_found";
}

export function getExpiredApprovalToastId(approvalId: string): string {
  return `approval-expired:${approvalId}`;
}

/**
 * Remove every renderer-cached approval owned by a task that has reached a
 * terminal state. The returned IDs let callers dismiss matching toasts too.
 */
export function removePendingApprovalsForTask(
  pending: Map<string, ApprovalRequest>,
  taskId: string,
): string[] {
  const removedIds: string[] = [];
  for (const [approvalId, approval] of pending) {
    if (approval.taskId !== taskId) continue;
    pending.delete(approvalId);
    removedIds.push(approvalId);
  }
  return removedIds;
}

/**
 * Reconcile a daemon snapshot without deleting approvals that arrived after
 * the snapshot request started. `knownBeforeSync` is captured by the caller
 * before awaiting IPC, which closes that race window.
 */
export function reconcilePendingApprovalSnapshot(
  local: Map<string, ApprovalRequest>,
  snapshot: ApprovalRequest[],
  knownBeforeSync: Set<string>,
): Map<string, ApprovalRequest> {
  const next = new Map(local);
  const canonical = new Map(
    snapshot
      .filter((approval) => approval.status === "pending")
      .map((approval) => [approval.id, approval] as const),
  );

  for (const approvalId of knownBeforeSync) {
    if (!canonical.has(approvalId)) next.delete(approvalId);
  }
  for (const [approvalId, approval] of canonical) {
    next.set(approvalId, approval);
  }
  return next;
}
