import { describe, expect, it } from "vitest";
import {
  getExpiredApprovalToastId,
  reconcilePendingApprovalSnapshot,
  removePendingApprovalsForTask,
  shouldDismissApprovalAfterResponse,
} from "../approval-response-state";
import type { ApprovalRequest } from "../../../shared/types";

function approval(id: string, taskId: string): ApprovalRequest {
  return {
    id,
    taskId,
    type: "external_service",
    description: id,
    details: {},
    status: "pending",
    requestedAt: Date.now(),
  };
}

describe("approval response state", () => {
  it("dismisses stale approvals that no longer exist in the daemon", () => {
    expect(shouldDismissApprovalAfterResponse("not_found")).toBe(true);
  });

  it("keeps an approval visible only while its mutation is in progress", () => {
    expect(shouldDismissApprovalAfterResponse("handled")).toBe(true);
    expect(shouldDismissApprovalAfterResponse("duplicate")).toBe(true);
    expect(shouldDismissApprovalAfterResponse("in_progress")).toBe(false);
  });

  it("deduplicates expired notifications per approval", () => {
    expect(getExpiredApprovalToastId("approval-1")).toBe(
      "approval-expired:approval-1",
    );
  });

  it("removes all cached approvals when their task becomes terminal", () => {
    const pending = new Map([
      ["approval-1", approval("approval-1", "task-1")],
      ["approval-2", approval("approval-2", "task-1")],
      ["approval-3", approval("approval-3", "task-2")],
    ]);

    expect(removePendingApprovalsForTask(pending, "task-1")).toEqual([
      "approval-1",
      "approval-2",
    ]);
    expect(Array.from(pending.keys())).toEqual(["approval-3"]);
  });

  it("reconciles stale rows without dropping approvals received during IPC", () => {
    const stale = approval("approval-stale", "task-1");
    const arrivedDuringSync = approval("approval-new", "task-2");
    const local = new Map([[stale.id, stale]]);
    const knownBeforeSync = new Set(local.keys());
    local.set(arrivedDuringSync.id, arrivedDuringSync);

    const canonical = approval("approval-canonical", "task-1");
    const reconciled = reconcilePendingApprovalSnapshot(
      local,
      [canonical],
      knownBeforeSync,
    );

    expect(Array.from(reconciled.keys()).sort()).toEqual([
      "approval-canonical",
      "approval-new",
    ]);
  });
});
