import { describe, expect, it, vi } from "vitest";

import { AgentDaemon } from "../daemon";

describe("AgentDaemon terminal lifecycle helpers", () => {
  it("does not resurrect a terminal parent task from a stale active cache entry on shutdown", () => {
    const daemonLike = Object.create(AgentDaemon.prototype) as Any;

    expect(
      daemonLike.shouldInterruptCachedTaskOnShutdown(
        { status: "active" },
        { id: "task-1", status: "completed", terminalStatus: "ok" },
      ),
    ).toBe(false);
    expect(
      daemonLike.shouldInterruptCachedTaskOnShutdown(
        { status: "active" },
        { id: "task-1", status: "failed", terminalStatus: "failed" },
      ),
    ).toBe(false);
    expect(
      daemonLike.shouldInterruptCachedTaskOnShutdown(
        { status: "active" },
        { id: "task-1", status: "executing" },
      ),
    ).toBe(true);
  });

  it("reopens a terminal task when a follow-up starts a new run", () => {
    const reopenedTask = {
      id: "task-follow-up",
      status: "executing",
      completedAt: undefined,
      terminalStatus: undefined,
      lastRunDurationMs: undefined,
    };
    const daemonLike = Object.assign(Object.create(AgentDaemon.prototype), {
      taskRepo: {
        findById: vi
          .fn()
          .mockReturnValueOnce({
            id: "task-follow-up",
            status: "completed",
            completedAt: 10_000,
            terminalStatus: "ok",
            lastRunDurationMs: 9_000,
          })
          .mockReturnValueOnce(reopenedTask),
        update: vi.fn(),
      },
      clearRetryState: vi.fn(),
      clearTimelineTaskState: vi.fn(),
      logEvent: vi.fn(),
    }) as Any;

    const result = AgentDaemon.prototype.beginFollowUpRun.call(daemonLike, "task-follow-up");

    expect(result).toBe(reopenedTask);
    expect(daemonLike.taskRepo.update).toHaveBeenCalledWith("task-follow-up", {
      status: "executing",
      error: undefined,
      completedAt: undefined,
      lastRunDurationMs: undefined,
      terminalStatus: undefined,
      failureClass: undefined,
      awaitingUserInputReasonCode: undefined,
      continuationCount: 0,
      continuationWindow: 1,
      lifetimeTurnsUsed: 0,
      lastProgressScore: undefined,
      autoContinueBlockReason: undefined,
      compactionCount: 0,
      lastCompactionAt: 0,
      lastCompactionTokensBefore: 0,
      lastCompactionTokensAfter: 0,
      noProgressStreak: 0,
      lastLoopFingerprint: undefined,
    });
    expect(daemonLike.clearRetryState).toHaveBeenCalledWith("task-follow-up");
    expect(daemonLike.clearTimelineTaskState).toHaveBeenCalledWith("task-follow-up");
    expect(daemonLike.logEvent).toHaveBeenCalledWith(
      "task-follow-up",
      "task_resumed",
      expect.objectContaining({
        newRunStarted: true,
        previousStatus: "completed",
      }),
    );
  });

  it("restores a completed parent task when only its active follow-up is cancelled", () => {
    const daemonLike = Object.assign(Object.create(AgentDaemon.prototype), {
      taskRepo: {
        findById: vi.fn().mockReturnValue({
          id: "task-follow-up-cancel",
          status: "executing",
          createdAt: 1_000,
          resultSummary: "Existing successful result",
        }),
        update: vi.fn(),
      },
      eventRepo: {
        findByTaskId: vi.fn().mockReturnValue([
          {
            id: "completed-before",
            taskId: "task-follow-up-cancel",
            type: "timeline_step_finished",
            timestamp: 10_000,
            payload: { legacyType: "task_completed" },
          },
          {
            id: "resume",
            taskId: "task-follow-up-cancel",
            type: "timeline_step_updated",
            timestamp: 20_000,
            payload: {
              legacyType: "task_resumed",
              newRunStarted: true,
              previousStatus: "completed",
              previousCompletedAt: 10_000,
              previousLastRunDurationMs: 9_000,
              previousTerminalStatus: "partial_success",
            },
          },
          {
            id: "follow-up-work",
            taskId: "task-follow-up-cancel",
            type: "timeline_step_started",
            timestamp: 21_000,
            payload: { legacyType: "tool_call" },
          },
        ]),
      },
      cleanupPendingApprovalsForTask: vi.fn(),
      clearRetryState: vi.fn(),
      clearTimelineTaskState: vi.fn(),
      activeTasks: new Map([
        [
          "task-follow-up-cancel",
          { status: "active", lastAccessed: 0 },
        ],
      ]),
      logEvent: vi.fn(),
    }) as Any;

    const restored = (AgentDaemon.prototype as Any).restoreTerminalParentAfterFollowUpCancellation.call(
      daemonLike,
      "task-follow-up-cancel",
      "Follow-up stopped",
    );

    expect(restored).toBe(true);
    expect(daemonLike.taskRepo.update).toHaveBeenCalledWith(
      "task-follow-up-cancel",
      expect.objectContaining({
        status: "completed",
        completedAt: 10_000,
        lastRunDurationMs: 9_000,
        error: null,
        terminalStatus: "partial_success",
        failureClass: undefined,
      }),
    );
    expect(daemonLike.logEvent).not.toHaveBeenCalledWith(
      "task-follow-up-cancel",
      "task_cancelled",
      expect.anything(),
    );
    expect(daemonLike.logEvent).toHaveBeenCalledWith(
      "task-follow-up-cancel",
      "task_status",
      expect.objectContaining({
        status: "completed",
        followUpCancelled: true,
      }),
    );
  });

  it("uses activity span when latest user message would make duration collapse to zero", () => {
    const daemonLike = Object.assign(Object.create(AgentDaemon.prototype), {
      eventRepo: {
        findByTaskId: vi.fn().mockReturnValue([
          { id: "u1", taskId: "task-duration", timestamp: 1_000, type: "user_message", payload: {} },
          { id: "t1", taskId: "task-duration", timestamp: 2_000, type: "tool_call", payload: {} },
          { id: "t2", taskId: "task-duration", timestamp: 326_000, type: "tool_result", payload: {} },
          { id: "u2", taskId: "task-duration", timestamp: 327_000, type: "user_message", payload: {} },
        ]),
      },
    }) as Any;

    const durationMs = (AgentDaemon.prototype as Any).calculateLatestRunDurationMs.call(
      daemonLike,
      "task-duration",
      327_000,
      1_000,
    );

    expect(durationMs).toBe(324_000);
  });

  it("wraps up a paused task as completed when the user accepts current progress", async () => {
    const cancel = vi.fn().mockResolvedValue(undefined);
    const daemonLike = Object.assign(Object.create(AgentDaemon.prototype), {
      taskRepo: {
        findById: vi.fn().mockReturnValue({
          id: "task-paused",
          status: "paused",
          createdAt: 1_000,
          terminalStatus: "needs_user_action",
          resultSummary: "Draft and analysis are already usable.",
          bestKnownOutcome: {
            capturedAt: Date.now(),
            resultSummary: "Draft and analysis are already usable.",
            confidence: "medium",
          },
        }),
        update: vi.fn(),
      },
      eventRepo: {
        findByTaskId: vi.fn().mockReturnValue([]),
      },
      inputRequestRepo: {
        findPendingByTaskId: vi.fn().mockReturnValue([]),
      },
      pendingInputRequests: new Map(),
      pendingContinuationTaskIds: new Set(["task-paused"]),
      activeTasks: new Map([
        [
          "task-paused",
          {
            status: "active",
            lastAccessed: 0,
            executor: { cancel },
          },
        ],
      ]),
      cleanupPendingApprovalsForTask: vi.fn(),
      clearRetryState: vi.fn(),
      clearTimelineTaskState: vi.fn(),
      finishTimelineDeliveryStage: vi.fn(),
      finishQueueSlot: vi.fn(),
      logEvent: vi.fn(),
      teamOrchestrator: null,
    }) as Any;

    await AgentDaemon.prototype.wrapUpTask.call(daemonLike, "task-paused");

    expect(cancel).toHaveBeenCalledWith("user");
    expect(daemonLike.pendingContinuationTaskIds.has("task-paused")).toBe(false);
    expect(daemonLike.taskRepo.update).toHaveBeenCalledWith(
      "task-paused",
      expect.objectContaining({
        status: "completed",
        error: null,
        terminalStatus: "ok",
        failureClass: undefined,
        resultSummary: "Draft and analysis are already usable.",
      }),
    );
    expect(daemonLike.logEvent).toHaveBeenCalledWith(
      "task-paused",
      "task_completed",
      expect.objectContaining({
        message: "Task stopped by user; current progress accepted.",
        terminalStatus: "ok",
        terminalStatusReason: "user_accepted_current_progress",
      }),
    );
    expect(daemonLike.clearRetryState).toHaveBeenCalledWith("task-paused");
    expect(daemonLike.finishTimelineDeliveryStage).toHaveBeenCalledWith("task-paused");
    expect(daemonLike.finishQueueSlot).toHaveBeenCalledWith("task-paused");
  });

  it("cancelTaskRecord persists cancelled status and emits canonical terminal events", () => {
    const daemonLike = Object.assign(Object.create(AgentDaemon.prototype), {
      taskRepo: {
        findById: vi.fn().mockReturnValue({
          id: "task-cancelled",
          status: "executing",
          createdAt: 1_000,
        }),
        update: vi.fn(),
      },
      eventRepo: {
        findByTaskId: vi.fn().mockReturnValue([]),
      },
      approvalRepo: {
        update: vi.fn(),
      },
      clearRetryState: vi.fn(),
      clearTimelineTaskState: vi.fn(),
      activeTasks: new Map([
        [
          "task-cancelled",
          {
            status: "active",
            lastAccessed: 0,
          },
        ],
      ]),
      pendingApprovals: new Map(),
      logEvent: vi.fn(),
      teamOrchestrator: null,
    }) as Any;

    AgentDaemon.prototype.cancelTaskRecord.call(
      daemonLike,
      "task-cancelled",
      "Task was stopped by user",
    );

    expect(daemonLike.taskRepo.update).toHaveBeenCalledWith(
      "task-cancelled",
      expect.objectContaining({
        status: "cancelled",
        completedAt: expect.any(Number),
        error: null,
        terminalStatus: undefined,
        failureClass: undefined,
      }),
    );
    expect(daemonLike.clearRetryState).toHaveBeenCalledWith("task-cancelled");
    expect(daemonLike.clearTimelineTaskState).toHaveBeenCalledWith("task-cancelled");
    expect(daemonLike.activeTasks.get("task-cancelled")).toEqual(
      expect.objectContaining({
        status: "completed",
        lastAccessed: expect.any(Number),
      }),
    );
    expect(daemonLike.logEvent).toHaveBeenNthCalledWith(
      1,
      "task-cancelled",
      "task_status",
      expect.objectContaining({
        status: "cancelled",
        message: "Task was stopped by user",
      }),
    );
    expect(daemonLike.logEvent).toHaveBeenNthCalledWith(
      2,
      "task-cancelled",
      "task_cancelled",
      expect.objectContaining({
        message: "Task was stopped by user",
      }),
    );
  });
});
