import { describe, expect, it, vi } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { TaskExecutor } from "../executor";
import { AcpxRuntimeUnavailableError } from "../AcpxRuntimeRunner";
import { PlaybookService } from "../../memory/PlaybookService";
import { SessionRecallService } from "../../memory/SessionRecallService";
import type { Task, TaskBestKnownOutcome } from "../../../shared/types";

describe("TaskExecutor entrypoint guards", () => {
  it("serializes execute/sendMessage via lifecycle mutex wrappers", async () => {
    const executor = Object.create(TaskExecutor.prototype) as Any;
    const runExclusive = vi.fn(async (fn: () => Promise<void>) => fn());

    executor.lifecycleMutex = { runExclusive };
    executor.executeUnlocked = vi.fn(async () => undefined);
    executor.sendMessageUnlocked = vi.fn(async () => undefined);
    executor.task = { id: "test-task" };
    executor.daemon = { getTask: vi.fn(() => undefined) };

    await executor.execute();
    await executor.sendMessage("hi");

    expect(runExclusive).toHaveBeenCalledTimes(2);
    expect(executor.executeUnlocked).toHaveBeenCalledTimes(1);
    expect(executor.sendMessageUnlocked).toHaveBeenCalledWith("hi", undefined, undefined, undefined);
  });

  it("assigns every follow-up a distinct conversation turn id", async () => {
    const executor = Object.create(TaskExecutor.prototype) as Any;
    const capturedTurnIds: string[] = [];
    executor.lifecycleMutex = {
      runExclusive: vi.fn(async (fn: () => Promise<void>) => fn()),
    };
    executor.task = { id: "task-turns", agentConfig: {} };
    executor.activeConversationTurnId = null;
    executor.daemon = { getTask: vi.fn(() => executor.task) };
    executor.sendMessageUnlocked = vi.fn(async () => {
      capturedTurnIds.push(executor.activeConversationTurnId);
    });

    await executor.sendMessage("生成PPT");
    await executor.sendMessage("再生成一次PPT");

    expect(capturedTurnIds).toHaveLength(2);
    expect(capturedTurnIds[0]).toMatch(/^turn:task-turns:follow-up:/);
    expect(capturedTurnIds[1]).toMatch(/^turn:task-turns:follow-up:/);
    expect(capturedTurnIds[0]).not.toBe(capturedTurnIds[1]);
    expect(executor.activeConversationTurnId).toBeNull();
  });

  it("starts an explicit user follow-up with fresh tool retry state", async () => {
    const executor = Object.create(TaskExecutor.prototype) as Any;
    executor.lifecycleMutex = {
      runExclusive: vi.fn(async (fn: () => Promise<void>) => fn()),
    };
    executor.task = { id: "task-retry", agentConfig: {} };
    executor.activeConversationTurnId = null;
    executor.daemon = { getTask: vi.fn(() => executor.task) };
    executor.crossStepToolFailures = new Map([["create_presentation", 6]]);
    executor.toolFailureTracker = {
      isDisabled: vi.fn(() => true),
    };
    executor.toolCallDeduplicator = {};
    executor.sendMessageUnlocked = vi.fn(async () => {
      expect(executor.crossStepToolFailures.size).toBe(0);
      expect(executor.toolFailureTracker.isDisabled("create_presentation")).toBe(false);
      expect(executor.toolCallDeduplicator).toBeDefined();
    });

    await executor.sendMessage("再生成一次PPT");

    expect(executor.sendMessageUnlocked).toHaveBeenCalledTimes(1);
  });

  it("resets in-memory lifetime counters for a new terminal-task follow-up run", () => {
    const executor = Object.create(TaskExecutor.prototype) as Any;
    const resetTurnBudgetWindow = vi.fn();
    executor.getSessionRuntime = vi.fn(() => ({ resetTurnBudgetWindow }));
    executor.lifetimeTurnCount = 32;
    executor.continuationCount = 3;
    executor.continuationWindow = 4;
    executor.compactionCount = 2;
    executor.lastCompactionAt = 123;
    executor.lastCompactionTokensBefore = 1000;
    executor.lastCompactionTokensAfter = 500;
    executor.noProgressStreak = 6;
    executor.lastLoopFingerprint = "stale-loop";
    executor.budgetSoftLandingInjected = true;
    executor.taskCompleted = true;
    executor.cancelled = true;
    executor.cancelReason = "stale";

    (TaskExecutor.prototype as Any).resetRuntimeForNewFollowUpRun.call(
      executor,
    );

    expect(executor.lifetimeTurnCount).toBe(0);
    expect(executor.continuationCount).toBe(0);
    expect(executor.continuationWindow).toBe(1);
    expect(executor.compactionCount).toBe(0);
    expect(executor.noProgressStreak).toBe(0);
    expect(executor.lastLoopFingerprint).toBe("");
    expect(resetTurnBudgetWindow).toHaveBeenCalledWith({
      mode: "follow_up",
      reason: "new_terminal_follow_up_run",
    });
    expect(executor.budgetSoftLandingInjected).toBe(false);
    expect(executor.taskCompleted).toBe(false);
    expect(executor.cancelled).toBe(false);
    expect(executor.cancelReason).toBeNull();
  });

  it("routes executeStep through the unified branch", async () => {
    const executor = Object.create(TaskExecutor.prototype) as Any;
    const step = { id: "s1", description: "do work", status: "pending" };

    executor.executeStepUnified = vi.fn(async () => undefined);
    executor.executeStepLegacy = vi.fn(async () => undefined);
    await executor.executeStep(step);
    expect(executor.executeStepUnified).toHaveBeenCalledWith(step);
    expect(executor.executeStepLegacy).not.toHaveBeenCalled();
  });

  it("maps loop budget stops to precise step failure telemetry reasons", () => {
    const executor = Object.create(TaskExecutor.prototype) as Any;
    const taskStopReasons: Pick<Task, "stopReasons"> = {
      stopReasons: ["max_llm_calls", "max_recovered_responses", "max_repeated_iterations"],
    };

    expect(
      (TaskExecutor.prototype as Any).deriveStepStopReason.call(executor, {
        stepFailed: true,
        failureReason: "Step loop budget exhausted: reached the total LLM call limit.",
        awaitingUserInput: false,
        iterationCount: 4,
        maxIterations: 32,
        loopBudgetStopReason: "max_llm_calls",
      }),
    ).toBe("max_llm_calls");

    expect(
      (TaskExecutor.prototype as Any).getStepLoopBudgetFailureReason.call(
        executor,
        "max_recovered_responses",
      ),
    ).toBe("Step loop budget exhausted: reached the recovered response limit.");
    expect(taskStopReasons.stopReasons).toEqual([
      "max_llm_calls",
      "max_recovered_responses",
      "max_repeated_iterations",
    ]);
  });

  it("routes sendMessageUnlocked through the unified branch", async () => {
    const executor = Object.create(TaskExecutor.prototype) as Any;

    executor.sendMessageUnified = vi.fn(async () => undefined);
    executor.sendMessageLegacy = vi.fn(async () => undefined);
    await executor.sendMessageUnlocked("hello");
    expect(executor.sendMessageUnified).toHaveBeenCalledWith("hello", undefined, undefined);
    expect(executor.sendMessageLegacy).not.toHaveBeenCalled();
  });

  it("routes sendMessageUnlocked through the acpx runtime branch when configured", async () => {
    const executor = Object.create(TaskExecutor.prototype) as Any;

    executor.task = {
      agentConfig: {
        externalRuntime: {
          kind: "acpx",
          agent: "codex",
          sessionMode: "persistent",
          outputMode: "json",
          permissionMode: "approve-reads",
        },
      },
    };
    executor.isAcpxExternalRuntimeTask = vi.fn(() => true);
    executor.sendMessageWithAcpxRuntime = vi.fn(async () => undefined);
    executor.disableExternalRuntimeForFallback = vi.fn();
    executor.sendMessageUnified = vi.fn(async () => undefined);
    executor.sendMessageLegacy = vi.fn(async () => undefined);

    await executor.sendMessageUnlocked("hello");

    expect(executor.sendMessageWithAcpxRuntime).toHaveBeenCalledWith("hello", undefined, undefined);
    expect(executor.sendMessageUnified).not.toHaveBeenCalled();
    expect(executor.sendMessageLegacy).not.toHaveBeenCalled();
  });

  it("falls back to native sendMessage flow when acpx is unavailable", async () => {
    const executor = Object.create(TaskExecutor.prototype) as Any;

    executor.task = {
      agentConfig: {
        externalRuntime: {
          kind: "acpx",
          agent: "codex",
          sessionMode: "persistent",
          outputMode: "json",
          permissionMode: "approve-reads",
        },
      },
    };
    executor.isAcpxExternalRuntimeTask = vi.fn(() => true);
    executor.sendMessageWithAcpxRuntime = vi.fn(async () => {
      throw new AcpxRuntimeUnavailableError();
    });
    executor.disableExternalRuntimeForFallback = vi.fn();
    executor.sendMessageUnified = vi.fn(async () => undefined);
    executor.sendMessageLegacy = vi.fn(async () => undefined);

    await executor.sendMessageUnlocked("hello");

    expect(executor.disableExternalRuntimeForFallback).toHaveBeenCalledTimes(1);
    expect(executor.sendMessageUnified).toHaveBeenCalledWith("hello", undefined, undefined);
  });

  it("preserves quoted assistant metadata when routing user messages through the timeline emitter", () => {
    const executor = Object.create(TaskExecutor.prototype) as Any;
    const updateStep = vi.fn();

    executor.task = { id: "task-1", agentConfig: {} };
    executor.timelineEmitter = { startStep: vi.fn(), updateStep };
    executor.getExternalRuntimeEventMetadata = vi.fn(() => null);

    (TaskExecutor.prototype as Any).emitEvent.call(executor, "user_message", {
      message: "Can you revise that?",
      quotedAssistantMessage: {
        eventId: "assistant-1",
        taskId: "11111111-1111-1111-1111-111111111111",
        message: "Original assistant reply",
      },
    });

    expect(updateStep).toHaveBeenCalledWith(
      {
        id: "turn:task-1",
        description: "Can you revise that?",
      },
      expect.objectContaining({
        actor: "user",
        legacyType: "user_message",
        message: "Can you revise that?",
        extraPayload: expect.objectContaining({
          quotedAssistantMessage: expect.objectContaining({
            eventId: "assistant-1",
            message: "Original assistant reply",
          }),
        }),
      }),
    );
  });

  it("deterministically delegates explicit Claude child-task requests via spawn_agent", async () => {
    const executor = Object.create(TaskExecutor.prototype) as Any;

    executor.task = {
      id: "task-1",
      title: "Use Claude Code for this task. Create a child task...",
      prompt:
        "Use Claude Code for this task. Create a child task via acpx, have it inspect the repo and tell me what NeoWorker is at a high level. Read-only only, no edits.",
      rawPrompt:
        "Use Claude Code for this task. Create a child task via acpx, have it inspect the repo and tell me what NeoWorker is at a high level. Read-only only, no edits.",
      agentConfig: {},
    };
    executor.isAcpxExternalRuntimeTask = vi.fn(() => false);
    executor.toolRegistry = {
      executeTool: vi.fn(async () => ({
        success: true,
        task_id: "child-1",
        message: "Agent completed successfully",
        result: "NeoWorker is an Electron desktop app with agent orchestration.",
      })),
    };
    executor.emitEvent = vi.fn();
    executor.finalizeTaskBestEffort = vi.fn();

    const handled = await (TaskExecutor as Any).prototype.maybeHandleExplicitClaudeCodeDelegation.call(
      executor,
    );

    expect(handled).toBe(true);
    expect(executor.toolRegistry.executeTool).toHaveBeenCalledWith(
      "spawn_agent",
      expect.objectContaining({
        runtime: "acpx",
        runtime_agent: "claude",
        wait: true,
      }),
    );
    expect(executor.emitEvent).toHaveBeenCalledWith("assistant_message", {
      message: "NeoWorker is an Electron desktop app with agent orchestration.",
    });
    expect(executor.finalizeTaskBestEffort).toHaveBeenCalledWith(
      "NeoWorker is an Electron desktop app with agent orchestration.",
      "Explicit Claude child-task delegation completed.",
    );
  });

  it("does not delegate to Claude when the user prompt does not explicitly say Claude Code", async () => {
    const executor = Object.create(TaskExecutor.prototype) as Any;

    executor.task = {
      id: "task-1",
      title: "Create an executive brief",
      prompt: "Internal prompt may mention Claude Code, but the user did not ask for it.",
      rawPrompt:
        "Create an executive brief on the competitive landscape and list the top 5 risks and actions by priority.",
      userPrompt:
        "Create an executive brief on the competitive landscape and list the top 5 risks and actions by priority.",
      agentConfig: {},
    };
    executor.isAcpxExternalRuntimeTask = vi.fn(() => false);
    executor.toolRegistry = {
      executeTool: vi.fn(),
    };
    executor.emitEvent = vi.fn();

    const handled = await (TaskExecutor as Any).prototype.maybeHandleExplicitClaudeCodeDelegation.call(
      executor,
    );

    expect(handled).toBe(false);
    expect(executor.toolRegistry.executeTool).not.toHaveBeenCalled();
  });

  it("does not delegate to Claude when only internal or title text mentions Claude Code", async () => {
    const executor = Object.create(TaskExecutor.prototype) as Any;

    executor.task = {
      id: "task-1",
      title: "Use Claude Code for this task",
      prompt:
        "Use Claude Code for this task. Create a child task via acpx and do the work automatically.",
      rawPrompt: "Create an executive brief about the market and prioritize the main risks.",
      userPrompt: "Create an executive brief about the market and prioritize the main risks.",
      agentConfig: {},
    };
    executor.isAcpxExternalRuntimeTask = vi.fn(() => false);
    executor.toolRegistry = {
      executeTool: vi.fn(),
    };
    executor.emitEvent = vi.fn();

    const handled = await (TaskExecutor as Any).prototype.maybeHandleExplicitClaudeCodeDelegation.call(
      executor,
    );

    expect(handled).toBe(false);
    expect(executor.toolRegistry.executeTool).not.toHaveBeenCalled();
  });

  it("normalizes explicit Claude child task prompts into imperative instructions", () => {
    const executor = Object.create(TaskExecutor.prototype) as Any;
    executor.extractCurrentTaskText = (value: unknown) =>
      typeof value === "string" ? value.trim() : "";

    const prompt = (TaskExecutor as Any).prototype.deriveClaudeChildTaskPrompt.call(
      executor,
      "Use Claude Code for this task. Create a child task via acpx that returns a single word: hello world.\n\n[AGENT_STRATEGY_CONTEXT_V1]\nintent=execution\n[/AGENT_STRATEGY_CONTEXT_V1]",
      "Use Claude Code for this task. Create a child task...",
    );

    expect(prompt).toBe("Return a single word: hello world.");
  });

  it("does not fall back when Claude acpx is unavailable", async () => {
    const executor = Object.create(TaskExecutor.prototype) as Any;

    executor.task = {
      agentConfig: {
        externalRuntime: {
          kind: "acpx",
          agent: "claude",
          sessionMode: "persistent",
          outputMode: "json",
          permissionMode: "approve-reads",
        },
      },
    };
    executor.isAcpxExternalRuntimeTask = vi.fn(() => true);
    executor.sendMessageWithAcpxRuntime = vi.fn(async () => {
      throw new AcpxRuntimeUnavailableError();
    });
    executor.disableExternalRuntimeForFallback = vi.fn();
    executor.sendMessageUnified = vi.fn(async () => undefined);
    executor.sendMessageLegacy = vi.fn(async () => undefined);
    executor.getAcpxExternalRuntimeConfig = vi.fn(
      () => executor.task.agentConfig.externalRuntime,
    );

    await expect(executor.sendMessageUnlocked("hello")).rejects.toThrow(
      "Claude Code acpx runtime unavailable for follow-up",
    );
    expect(executor.disableExternalRuntimeForFallback).not.toHaveBeenCalled();
    expect(executor.sendMessageUnified).not.toHaveBeenCalled();
  });

  it("finalizeFollowUpCompletion syncs task row and in-memory task state", () => {
    const executor = Object.create(TaskExecutor.prototype) as Any;
    executor.task = {
      id: "task-follow-up",
      status: "executing",
      error: "old error",
      terminalStatus: "failed",
      failureClass: "contract_error",
      resultSummary: "older summary",
      semanticSummary: "Opened canvas",
    };
    const freshSummary = "Fresh follow-up summary with useful completion details.";
    executor.bestKnownOutcome = {
      capturedAt: 1,
      resultSummary: freshSummary,
      terminalStatus: "ok",
      failureClass: undefined,
      outputSummary: { outputCount: 1, fileCount: 1, files: [] },
    } satisfies TaskBestKnownOutcome;
    executor.buildResultSummary = vi.fn(() => freshSummary);
    executor.getContentFallback = vi.fn(() => "");
    const followUpOutputSummary = {
      created: [".neoworker/fresh-report.pptx"],
      primaryOutputPath: ".neoworker/fresh-report.pptx",
      outputCount: 1,
      folders: [".neoworker"],
    };
    executor.buildTaskOutputSummary = vi.fn(() => followUpOutputSummary);
    executor.daemon = {
      updateTask: vi.fn(),
    };
    executor.emitEvent = vi.fn();

    (TaskExecutor as Any).prototype.finalizeFollowUpCompletion.call(
      executor,
      "Follow-up completed (24 tool calls)",
      { clearTerminalFailure: true, outputEvidenceStartedAt: 1234 },
    );

    expect(executor.task.status).toBe("completed");
    expect(typeof executor.task.completedAt).toBe("number");
    expect(executor.task.error).toBeUndefined();
    expect(executor.task.terminalStatus).toBeUndefined();
    expect(executor.task.failureClass).toBeUndefined();
    expect(executor.task.resultSummary).toBe(freshSummary);
    expect(executor.daemon.updateTask).toHaveBeenCalledWith(
      "task-follow-up",
      expect.objectContaining({
        status: "completed",
        error: null,
        terminalStatus: undefined,
        failureClass: undefined,
        resultSummary: freshSummary,
        semanticSummary: "Opened canvas",
        bestKnownOutcome: expect.objectContaining({
          resultSummary: freshSummary,
          outputSummary: followUpOutputSummary,
        }),
      }),
    );
    expect(executor.emitEvent).toHaveBeenCalledWith(
      "task_completed",
      expect.objectContaining({
        message: "Follow-up completed (24 tool calls)",
        resultSummary: freshSummary,
        semanticSummary: "Opened canvas",
        outputSummary: followUpOutputSummary,
        bestKnownOutcome: expect.objectContaining({
          resultSummary: freshSummary,
          outputSummary: followUpOutputSummary,
        }),
      }),
    );
    expect(executor.buildTaskOutputSummary).toHaveBeenCalledWith(1234);
  });

  it("scopes follow-up outputs and tracks a generated file through its final rename", () => {
    const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), "neoworker-output-summary-"));
    try {
      fs.mkdirSync(path.join(workspacePath, ".neoworker"), { recursive: true });
      fs.writeFileSync(path.join(workspacePath, ".neoworker", "report.pptx"), "new deck");
      fs.writeFileSync(path.join(workspacePath, ".neoworker", "report-old.pptx"), "old deck");

      const executor = Object.create(TaskExecutor.prototype) as Any;
      executor.task = { id: "task-output-summary" };
      executor.workspace = { path: workspacePath };
      executor.fileOperationTracker = { getCreatedFiles: vi.fn(() => ["old-root.pptx"]) };
      executor.resolveWorkspaceMutationPathCandidate = (candidate: string) =>
        path.resolve(workspacePath, candidate);
      executor.getReplayEventType = (event: Any) => event.type;
      executor.daemon = {
        getTaskEvents: vi.fn(() => [
          {
            type: "file_created",
            timestamp: 10,
            payload: { path: ".neoworker/report-v2.pptx" },
          },
          {
            type: "file_modified",
            timestamp: 20,
            payload: {
              from: ".neoworker/previous.pptx",
              to: ".neoworker/report-old.pptx",
            },
          },
          {
            type: "file_modified",
            timestamp: 30,
            payload: {
              from: ".neoworker/report-v2.pptx",
              to: ".neoworker/report.pptx",
            },
          },
        ]),
      };

      const summary = (TaskExecutor as Any).prototype.buildTaskOutputSummary.call(executor, 5);

      expect(summary).toEqual({
        created: [".neoworker/report.pptx"],
        modifiedFallback: [".neoworker/report-old.pptx"],
        primaryOutputPath: ".neoworker/report.pptx",
        outputCount: 1,
        folders: [".neoworker"],
      });
      expect(executor.fileOperationTracker.getCreatedFiles).not.toHaveBeenCalled();
    } finally {
      fs.rmSync(workspacePath, { recursive: true, force: true });
    }
  });

  it("excludes diagnostic PDFs and injected context placeholders from PDF outputs", () => {
    const workspacePath = fs.mkdtempSync(
      path.join(os.tmpdir(), "neoworker-pdf-output-summary-"),
    );
    try {
      fs.writeFileSync(path.join(workspacePath, "final-report.pdf"), "pdf");
      fs.writeFileSync(path.join(workspacePath, "__diag-zh.pdf"), "diag");
      fs.mkdirSync(path.join(workspacePath, "agent.md", "soul.md"), {
        recursive: true,
      });
      fs.writeFileSync(
        path.join(workspacePath, "agent.md", "soul.md", "user.md"),
        "internal",
      );

      const executor = Object.create(TaskExecutor.prototype) as Any;
      executor.task = { id: "task-pdf-output-summary" };
      executor.workspace = { path: workspacePath };
      executor.fileOperationTracker = { getCreatedFiles: vi.fn(() => []) };
      executor.buildCompletionContract = vi.fn(() => ({
        requiredArtifactExtensions: [".pdf"],
      }));
      executor.resolveWorkspaceMutationPathCandidate = (candidate: string) =>
        path.resolve(workspacePath, candidate);
      executor.getReplayEventType = (event: Any) => event.type;
      executor.daemon = {
        getTaskEvents: vi.fn(() => [
          {
            type: "file_created",
            timestamp: 10,
            payload: { path: "agent.md/soul.md/user.md" },
          },
          {
            type: "artifact_created",
            timestamp: 20,
            payload: { path: "__diag-zh.pdf" },
          },
          {
            type: "artifact_created",
            timestamp: 30,
            payload: { path: "final-report.pdf" },
          },
        ]),
      };

      const summary = (
        TaskExecutor as Any
      ).prototype.buildTaskOutputSummary.call(executor);

      expect(summary).toEqual({
        created: ["final-report.pdf"],
        primaryOutputPath: "final-report.pdf",
        outputCount: 1,
        folders: ["."],
      });
    } finally {
      fs.rmSync(workspacePath, { recursive: true, force: true });
    }
  });

  it("finalizeFollowUpFailure syncs task row and emits a terminal failed status", () => {
    const executor = Object.create(TaskExecutor.prototype) as Any;
    executor.task = {
      id: "task-follow-up-failed",
      status: "executing",
      error: undefined,
      semanticSummary: "Verified markdown targets",
    };
    executor.bestKnownOutcome = {
      capturedAt: 1,
      resultSummary: "Verification failed after follow-up",
      terminalStatus: "failed",
      failureClass: "contract_error",
      outputSummary: { outputCount: 1, fileCount: 1, files: [] },
    } satisfies TaskBestKnownOutcome;
    executor.applyRuntimeTaskProjectionToTask = vi.fn(() => ({
      continuationCount: 1,
      continuationWindow: 1,
      lifetimeTurnsUsed: 24,
      compactionCount: 0,
      noProgressStreak: 0,
    }));
    executor.getCompletionProjectionFields = vi.fn(() => ({
      semanticSummary: "Verified markdown targets",
    }));
    executor.daemon = {
      failTask: vi.fn(),
    };
    executor.emitEvent = vi.fn();
    executor.buildFollowUpFailureMessage = vi.fn(
      () => "任务未能完成，请重试。",
    );

    (TaskExecutor as Any).prototype.finalizeFollowUpFailure.call(
      executor,
      new Error("Task failed: verification mismatch"),
    );

    expect(executor.task.status).toBe("failed");
    expect(typeof executor.task.completedAt).toBe("number");
    expect(executor.task.error).toBe("Task failed: verification mismatch");
    expect(executor.daemon.failTask).toHaveBeenCalledWith(
      "task-follow-up-failed",
      "Task failed: verification mismatch",
      expect.objectContaining({
        completedAt: expect.any(Number),
        semanticSummary: "Verified markdown targets",
        bestKnownOutcome: executor.bestKnownOutcome,
        continuationCount: 1,
        continuationWindow: 1,
        lifetimeTurnsUsed: 24,
      }),
    );
    expect(executor.emitEvent).toHaveBeenCalledWith(
      "task_status",
      expect.objectContaining({
        status: "failed",
        message: "任务未能完成，请重试。",
        terminalStatus: "failed",
        semanticSummary: "Verified markdown targets",
      }),
    );
  });

  it("releases the renderer when terminal failure persistence throws", () => {
    const executor = Object.create(TaskExecutor.prototype) as Any;
    executor.task = {
      id: "task-retry-exhausted",
      status: "executing",
      error: undefined,
    };
    executor.activeConversationTurnId = "turn:task-retry-exhausted:follow-up:2";
    executor.applyRuntimeTaskProjectionToTask = vi.fn(() => ({}));
    executor.getCompletionProjectionFields = vi.fn(() => ({}));
    executor.buildFollowUpFailureMessage = vi.fn(
      () =>
        "模型连接中断，本轮已结束，当前上下文已保留。请重试，我会从这里继续。",
    );
    executor.daemon = {
      failTask: vi.fn(() => {
        throw new Error("database unavailable");
      }),
    };
    executor.emitEvent = vi.fn();

    expect(() =>
      (TaskExecutor as Any).prototype.finalizeFollowUpFailure.call(
        executor,
        new Error("DeepSeek API request failed: fetch failed"),
      ),
    ).not.toThrow();

    expect(executor.task.status).toBe("failed");
    expect(executor.emitEvent).toHaveBeenCalledWith(
      "follow_up_failed",
      expect.objectContaining({
        taskId: "task-retry-exhausted",
        turnId: "turn:task-retry-exhausted:follow-up:2",
        parentTaskStatus: "failed",
        userMessage:
          "模型连接中断，本轮已结束，当前上下文已保留。请重试，我会从这里继续。",
      }),
    );
    expect(executor.emitEvent).toHaveBeenCalledWith(
      "task_status",
      expect.objectContaining({
        status: "failed",
        message:
          "模型连接中断，本轮已结束，当前上下文已保留。请重试，我会从这里继续。",
      }),
    );
  });

  it("keeps the completed parent task when only a PPT follow-up fails", () => {
    const executor = Object.create(TaskExecutor.prototype) as Any;
    executor.task = {
      id: "task-ppt-follow-up-failed",
      status: "executing",
      completedAt: undefined,
      error: undefined,
    };
    executor.activeConversationTurnId = "turn:task-ppt-follow-up-failed:follow-up:1";
    executor.daemon = {
      updateTask: vi.fn(),
      failTask: vi.fn(),
    };
    executor.emitEvent = vi.fn();
    executor.appendConversationHistory = vi.fn();
    executor.saveConversationSnapshot = vi.fn();

    (TaskExecutor as Any).prototype.finalizeArtifactFollowUpFailure.call(
      executor,
      "expected a newly created or updated .pptx artifact",
      "completed",
      [".pptx"],
      12345,
    );

    expect(executor.task.status).toBe("completed");
    expect(executor.task.completedAt).toBe(12345);
    expect(executor.daemon.failTask).not.toHaveBeenCalled();
    expect(executor.daemon.updateTask).toHaveBeenCalledWith(
      "task-ppt-follow-up-failed",
      expect.objectContaining({ status: "completed", completedAt: 12345, error: null }),
    );
    expect(executor.emitEvent).toHaveBeenCalledWith(
      "follow_up_failed",
      expect.objectContaining({
        parentTaskStatus: "completed",
        turnId: "turn:task-ppt-follow-up-failed:follow-up:1",
        userMessage: expect.stringContaining("尚未检测到要求的PPT文件"),
      }),
    );
  });

  it("reports a detected incomplete HTML draft instead of claiming no file exists", () => {
    const executor = Object.create(TaskExecutor.prototype) as Any;
    executor.task = {
      id: "task-html-follow-up-incomplete",
      status: "executing",
    };
    executor.activeConversationTurnId =
      "turn:task-html-follow-up-incomplete:follow-up:1";
    executor.daemon = { updateTask: vi.fn() };
    executor.emitEvent = vi.fn();
    executor.appendConversationHistory = vi.fn();
    executor.saveConversationSnapshot = vi.fn();

    (TaskExecutor as Any).prototype.finalizeArtifactFollowUpFailure.call(
      executor,
      "HTML artifact is incomplete: meetings.html missing a complete </html> document",
      "completed",
      [".html"],
      12345,
    );

    expect(executor.emitEvent).toHaveBeenCalledWith(
      "follow_up_failed",
      expect.objectContaining({
        userMessage: expect.stringContaining("已经生成HTML草稿"),
      }),
    );
    expect(executor.emitEvent).toHaveBeenCalledWith(
      "follow_up_failed",
      expect.objectContaining({
        userMessage: expect.not.stringContaining("尚未检测到"),
      }),
    );
  });

  it("requires create_document immediately for a PDF follow-up", () => {
    const executor = Object.create(TaskExecutor.prototype) as Any;
    const instruction = (
      TaskExecutor as Any
    ).prototype.buildFollowUpArtifactRetryInstruction.call(executor, {
      requiresArtifactEvidence: true,
      requiredArtifactExtensions: [".pdf"],
    });

    expect(instruction).toContain('create_document with format="pdf"');
    expect(instruction).toContain("before performing any unrelated validation");
    expect(instruction).toContain("do not spend this turn rechecking an older Excel");
  });

  it("treats a new PDF request after an Excel task as an artifact format switch", () => {
    const executor = Object.create(TaskExecutor.prototype) as Any;
    executor.buildCompletionContract = vi.fn(() => ({
      requiresArtifactEvidence: true,
      requiredArtifactExtensions: [".xlsx"],
    }));

    const switched = (
      TaskExecutor as Any
    ).prototype.isArtifactFormatSwitchFollowUp.call(executor, {
      requiresArtifactEvidence: true,
      requiredArtifactExtensions: [".pdf"],
    });

    expect(switched).toBe(true);
  });

  it("restores the completed parent task after a provider connection failure", () => {
    const executor = Object.create(TaskExecutor.prototype) as Any;
    executor.task = {
      id: "task-network-follow-up-failed",
      status: "executing",
      completedAt: undefined,
      error: undefined,
    };
    executor.activeConversationTurnId =
      "turn:task-network-follow-up-failed:follow-up:2";
    executor.daemon = { updateTask: vi.fn() };
    executor.emitEvent = vi.fn();
    executor.appendConversationHistory = vi.fn();
    executor.saveConversationSnapshot = vi.fn();

    (TaskExecutor as Any).prototype.finalizeRecoverableFollowUpFailure.call(
      executor,
      new Error("DeepSeek API request failed: fetch failed"),
      "completed",
      24680,
    );

    expect(executor.task.status).toBe("completed");
    expect(executor.task.completedAt).toBe(24680);
    expect(executor.daemon.updateTask).toHaveBeenCalledWith(
      "task-network-follow-up-failed",
      expect.objectContaining({
        status: "completed",
        completedAt: 24680,
        error: null,
      }),
    );
    expect(executor.emitEvent).toHaveBeenCalledWith(
      "assistant_message",
      expect.objectContaining({
        followUpFailed: true,
        message: "模型连接中断，本轮已结束，当前上下文已保留。请重试，我会从这里继续。",
      }),
    );
    expect(executor.emitEvent).toHaveBeenCalledWith(
      "follow_up_failed",
      expect.objectContaining({
        parentTaskStatus: "completed",
        technicalError: "DeepSeek API request failed: fetch failed",
      }),
    );
    expect(executor.emitEvent).toHaveBeenCalledWith(
      "task_status",
      expect.objectContaining({ status: "completed", followUpFailed: true }),
    );
  });

  it("ends the follow-up in the renderer even when failure persistence throws", () => {
    const executor = Object.create(TaskExecutor.prototype) as Any;
    executor.task = {
      id: "task-network-persistence-failed",
      status: "executing",
      completedAt: undefined,
      error: undefined,
    };
    executor.activeConversationTurnId =
      "turn:task-network-persistence-failed:follow-up:1";
    executor.daemon = {
      updateTask: vi.fn(() => {
        throw new Error("database unavailable");
      }),
    };
    executor.emitEvent = vi.fn();
    executor.appendConversationHistory = vi.fn(() => {
      throw new Error("history unavailable");
    });
    executor.saveConversationSnapshot = vi.fn(() => {
      throw new Error("snapshot unavailable");
    });

    expect(() =>
      (TaskExecutor as Any).prototype.finalizeRecoverableFollowUpFailure.call(
        executor,
        new Error("DeepSeek API request failed: fetch failed"),
        "completed",
        13579,
      ),
    ).not.toThrow();

    expect(executor.task.status).toBe("completed");
    expect(executor.emitEvent).toHaveBeenCalledWith(
      "follow_up_failed",
      expect.objectContaining({
        parentTaskStatus: "completed",
        turnId: "turn:task-network-persistence-failed:follow-up:1",
      }),
    );
    expect(executor.emitEvent).toHaveBeenCalledWith(
      "task_status",
      expect.objectContaining({ status: "completed", followUpFailed: true }),
    );
  });

  it("does not restore a queued parent status after a follow-up connection failure", () => {
    const executor = Object.create(TaskExecutor.prototype) as Any;
    executor.task = {
      id: "task-queued-follow-up-failed",
      status: "executing",
      completedAt: undefined,
      error: undefined,
    };
    executor.activeConversationTurnId =
      "turn:task-queued-follow-up-failed:follow-up:1";
    executor.daemon = { updateTask: vi.fn() };
    executor.emitEvent = vi.fn();
    executor.appendConversationHistory = vi.fn();
    executor.saveConversationSnapshot = vi.fn();

    (TaskExecutor as Any).prototype.finalizeRecoverableFollowUpFailure.call(
      executor,
      new Error("DeepSeek API request failed: fetch failed"),
      "queued",
    );

    expect(executor.task.status).toBe("completed");
    expect(executor.task.completedAt).toEqual(expect.any(Number));
    expect(executor.daemon.updateTask).toHaveBeenCalledWith(
      "task-queued-follow-up-failed",
      expect.objectContaining({
        status: "completed",
        completedAt: expect.any(Number),
        error: null,
      }),
    );
  });

  it("prefers explicit step artifact extensions over broader task-level artifact hints", () => {
    const executor = Object.create(TaskExecutor.prototype) as Any;
    executor.task = {
      title: "KB verification",
      prompt:
        'Reference text may mention markdown files, slide decks, and ".pptx" outputs, but this step verifies explicit Markdown targets only.',
      rawPrompt:
        'Reference text may mention markdown files, slide decks, and ".pptx" outputs, but this step verifies explicit Markdown targets only.',
    };
    executor.inferRequiredArtifactExtensions = vi.fn(() => [".md", ".pptx"]);

    const required = (TaskExecutor as Any).prototype.getRequiredArtifactExtensionsForStep.call(
      executor,
      {
        requiredExtensions: [".md"],
      },
    );

    expect(required).toEqual([".md"]);
    expect(executor.inferRequiredArtifactExtensions).not.toHaveBeenCalled();
  });

  it("does not re-inject the same pre-finalization reminder in a follow-up loop", () => {
    const executor = Object.create(TaskExecutor.prototype) as Any;

    const first = (TaskExecutor as Any).prototype.shouldInjectPreFinalizationReminder.call(
      executor,
      "\n\nPRE-FINALIZATION REMINDER:\n- Pending verification checklist items remain: Verify manuscript word count / completion state.",
      null,
    );
    const second = (TaskExecutor as Any).prototype.shouldInjectPreFinalizationReminder.call(
      executor,
      "\n\nPRE-FINALIZATION REMINDER:\n- Pending verification checklist items remain: Verify manuscript word count / completion state.",
      "\n\nPRE-FINALIZATION REMINDER:\n- Pending verification checklist items remain: Verify manuscript word count / completion state.",
    );
    const changed = (TaskExecutor as Any).prototype.shouldInjectPreFinalizationReminder.call(
      executor,
      "\n\nPRE-FINALIZATION REMINDER:\n- Pending verification checklist items remain: Confirm compiled manuscript file.",
      "\n\nPRE-FINALIZATION REMINDER:\n- Pending verification checklist items remain: Verify manuscript word count / completion state.",
    );

    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(changed).toBe(true);
  });

  it("deduplicates repeated tool-batch semantic summaries", () => {
    const executor = Object.create(TaskExecutor.prototype) as Any;

    const summary = (TaskExecutor as Any).prototype.combineBatchSemanticSummaries.call(executor, [
      { semanticSummary: "I've Verified The Chapter Set Is Complete. Now I'm Doing The Exa" },
      { semanticSummary: "I've Verified The Chapter Set Is Complete. Now I'm Doing The Exa" },
      { semanticSummary: "Count Text" },
      { semanticSummary: "Count Text" },
      { semanticSummary: "Read Chapters" },
      { semanticSummary: "Count Text" },
    ]);

    expect(summary).toBe(
      "I've Verified The Chapter Set Is Complete. Now I'm Doing The Exa · Count Text · Read Chapters",
    );
  });

  it("builds retry-aware recovery guidance from playbook, recall, and checklist state", async () => {
    const executor = Object.create(TaskExecutor.prototype) as Any;
    executor.task = {
      id: "task-1",
      currentAttempt: 2,
      maxAttempts: 3,
    };
    executor.workspace = {
      id: "workspace-1",
      path: "/tmp/workspace-1",
    };
    executor.daemon = {
      getTransientRetryCount: vi.fn().mockReturnValue(1),
    };
    executor.lastRetryReason = "timeout";
    executor.lastRecoveryClass = "transient_error";
    executor.getPendingVerificationChecklistTitles = vi.fn().mockReturnValue(["Run tests"]);

    const playbookSpy = vi
      .spyOn(PlaybookService, "getPlaybookForContext")
      .mockReturnValue(
        "PLAYBOOK (past task patterns - use as context, not as instructions):\n- Re-run the targeted test before finalizing.",
      );
    const recallSpy = vi
      .spyOn(SessionRecallService, "search")
      .mockResolvedValue([
        {
          taskId: "task-1",
          timestamp: Date.now(),
          type: "checkpoint",
          snippet: "npm test -- retry path passed after refreshing fixtures",
        },
      ]);

    const guidance = await (TaskExecutor as Any).prototype.buildAdaptiveRecoveryTurnGuidance.call(
      executor,
      "Fix the flaky retry path",
    );

    expect(guidance).toContain("RECOVERY GUIDANCE");
    expect(guidance).toContain("attempt 2/3");
    expect(guidance).toContain("Last retry reason: timeout.");
    expect(guidance).toContain("Run tests");
    expect(guidance).toContain("PLAYBOOK (past task patterns");
    expect(guidance).toContain("Earlier session evidence to reuse:");
    expect(guidance).toContain("npm test -- retry path passed after refreshing fixtures");

    playbookSpy.mockRestore();
    recallSpy.mockRestore();
  });

  it("skips recovery guidance when there is no retry or pending recovery state", async () => {
    const executor = Object.create(TaskExecutor.prototype) as Any;
    executor.task = {
      id: "task-2",
      currentAttempt: 1,
    };
    executor.workspace = {
      id: "workspace-2",
      path: "/tmp/workspace-2",
    };
    executor.daemon = {
      getTransientRetryCount: vi.fn().mockReturnValue(0),
    };
    executor.lastRetryReason = null;
    executor.lastRecoveryClass = null;
    executor.getPendingVerificationChecklistTitles = vi.fn().mockReturnValue([]);

    const guidance = await (TaskExecutor as Any).prototype.buildAdaptiveRecoveryTurnGuidance.call(
      executor,
      "Normal execution",
    );

    expect(guidance).toBe("");
  });
});
