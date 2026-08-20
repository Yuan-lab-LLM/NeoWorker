import type { ApprovalResponseStatus } from "../../shared/types";

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
