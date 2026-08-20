import { describe, expect, it } from "vitest";
import {
  getExpiredApprovalToastId,
  shouldDismissApprovalAfterResponse,
} from "../approval-response-state";

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
});
