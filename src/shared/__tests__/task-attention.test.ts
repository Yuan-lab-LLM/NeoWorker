import { describe, expect, it } from "vitest";
import type { Task } from "../types";
import { deriveTaskAttentionState, getTaskAttentionCount } from "../task-attention";

const task = (status: Task["status"], terminalStatus?: Task["terminalStatus"]) => ({
  status,
  terminalStatus,
});

describe("deriveTaskAttentionState", () => {
  it("uses the documented priority order", () => {
    expect(
      deriveTaskAttentionState(task("failed", "needs_user_action"), {
        pendingApprovalCount: 1,
      }),
    ).toBe("needs_approval");
    expect(deriveTaskAttentionState(task("failed", "needs_user_action"))).toBe("needs_attention");
    expect(deriveTaskAttentionState(task("failed"))).toBe("failed");
  });

  it("distinguishes active and queued work without extra queries", () => {
    expect(deriveTaskAttentionState(task("executing"))).toBe("working");
    expect(deriveTaskAttentionState(task("queued"))).toBe("waiting");
    expect(deriveTaskAttentionState(task("queued"), { hasActiveRuntime: true })).toBe("working");
    expect(deriveTaskAttentionState(task("completed"), { hasActiveRuntime: true })).toBe("working");
    expect(deriveTaskAttentionState(task("completed", "partial_success"))).toBe("done");
  });

  it("provides meaningful counts only for actionable states", () => {
    expect(getTaskAttentionCount("needs_approval", { pendingApprovalCount: 3 })).toBe(3);
    expect(getTaskAttentionCount("needs_attention")).toBe(1);
    expect(getTaskAttentionCount("working")).toBe(0);
  });
});
