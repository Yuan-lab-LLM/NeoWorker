import { describe, expect, it, vi } from "vitest";
import { TaskExecutor } from "../executor";
import { DurableContextService } from "../../memory/DurableContextService";

vi.mock("electron", () => ({
  app: {
    getPath: vi.fn().mockReturnValue("/tmp"),
  },
}));

vi.mock("../custom-skill-loader", () => ({
  getCustomSkillLoader: () => ({
    getEnabledGuidelinesPrompt: () => "",
    rankModelInvocableSkillsForQuery: () => [],
  }),
}));

vi.mock("../../settings/memory-features-manager", () => ({
  MemoryFeaturesManager: {
    loadSettings: vi
      .fn()
      .mockReturnValue({ contextPackInjectionEnabled: false }),
  },
}));

vi.mock("../../memory/DurableContextService", () => ({
  DurableContextService: {
    recordHistory: vi.fn(),
  },
}));

vi.mock("../../settings/personality-manager", () => ({
  PersonalityManager: {
    getAgentName: vi.fn().mockReturnValue("NeoWorker"),
    getUserName: vi.fn().mockReturnValue(""),
    getGreeting: vi.fn().mockReturnValue("Hi there"),
    getPersonalityPrompt: vi.fn().mockReturnValue(""),
    getPersonalityPromptById: vi.fn().mockReturnValue(""),
    getIdentityPrompt: vi.fn().mockReturnValue(""),
  },
}));

describe("TaskExecutor chat mode", () => {
  const createInferredChatExecutor = (
    prompt: string,
    agentConfig: Record<string, unknown> = {},
  ) => {
    const executor = Object.create(TaskExecutor.prototype) as Any;
    executor.task = {
      id: "task-inferred-chat",
      title: prompt,
      prompt,
      userPrompt: prompt,
      rawPrompt: prompt,
      createdAt: Date.now(),
      agentConfig: {
        executionMode: "execute",
        executionModeSource: "strategy",
        conversationMode: "chat",
        taskIntent: "chat",
        ...agentConfig,
      },
    };
    return executor;
  };

  const createExecuteUnlockedRoutingExecutor = (
    prompt: string,
    agentConfig: Record<string, unknown> = {},
  ) => {
    const executor = createInferredChatExecutor(prompt, agentConfig);
    executor.workspace = {
      id: "ws-routing",
      path: "/tmp",
      isTemp: true,
      permissions: {
        read: true,
        write: true,
        delete: true,
        network: true,
        shell: true,
      },
    };
    executor.daemon = {
      updateTaskStatus: vi.fn(),
      updateTask: vi.fn(),
      getTransientRetryCount: vi.fn().mockReturnValue(0),
    };
    executor.toolRegistry = {
      cleanup: vi.fn().mockResolvedValue(undefined),
    };
    executor.emitEvent = vi.fn();
    executor.handleCompanionPrompt = vi.fn().mockResolvedValue(undefined);
    executor.maybeHandleExplicitClaudeCodeDelegation = vi
      .fn()
      .mockResolvedValue(false);
    executor.maybeHandleOnboardingSlashCommand = vi
      .fn()
      .mockResolvedValue(false);
    executor.maybePrepareInitialGoalSlashCommand = vi
      .fn()
      .mockResolvedValue(false);
    executor.maybeHandleScheduleSlashCommand = vi.fn().mockResolvedValue(false);
    executor.maybeHandleSkillSlashCommandOrInlineChain = vi
      .fn()
      .mockResolvedValue(false);
    executor.maybeHandleNaturalLlmWikiPrompt = vi
      .fn()
      .mockResolvedValue(undefined);
    executor.maybeAutoApplyExplicitSkillInvocation = vi
      .fn()
      .mockResolvedValue(undefined);
    executor.maybeHandleHighConfidenceSkillRouting = vi
      .fn()
      .mockResolvedValue(undefined);
    executor.analyzeTask = vi.fn().mockResolvedValue({ complexity: "simple" });
    executor.ensureVerificationOutcomeSets = vi.fn();
    executor.getBudgetConstrainedFailureStepIdSet = vi
      .fn()
      .mockReturnValue(new Set());
    executor.nonBlockingVerificationFailedStepIds = new Set();
    executor.blockingVerificationFailedStepIds = new Set();
    executor.stepStopReasons = new Map();
    executor.taskFailureDomains = new Set();
    executor.completionVerificationMetadata = null;
    executor.terminalStatus = "ok";
    executor.failureClass = undefined;
    executor.cancelled = false;
    executor.lastUserMessage = prompt;
    executor.cancelReason = undefined;
    return executor;
  };

  it("records executor conversation history into durable context", () => {
    const executor = Object.create(TaskExecutor.prototype) as Any;
    executor.task = { id: "task-durable-history" };
    executor.workspace = {
      id: "ws-durable-history",
      path: "/tmp",
      permissions: {
        read: true,
        write: true,
        delete: true,
        network: true,
        shell: true,
      },
    };
    vi.mocked(DurableContextService.recordHistory).mockClear();

    (TaskExecutor as Any).prototype.updateConversationHistory.call(executor, [
      { role: "user", content: "Project codename: Lantern Harbor" },
      {
        role: "assistant",
        content: [{ type: "text", text: "Rollback phrase: blue anchor" }],
      },
    ]);

    expect(DurableContextService.recordHistory).toHaveBeenCalledWith({
      workspaceId: "ws-durable-history",
      taskId: "task-durable-history",
      source: "executor_history",
      messages: [
        { role: "user", content: "Project codename: Lantern Harbor" },
        {
          role: "assistant",
          content: [{ type: "text", text: "Rollback phrase: blue anchor" }],
        },
      ],
    });
    expect(executor.conversationHistory).toHaveLength(2);
  });

  it("keeps explicit chat PDF attachment turns inside the Chat policy boundary", () => {
    const executor = Object.create(TaskExecutor.prototype) as Any;
    executor.task = {
      id: "task-chat-pdf",
      title: "PDF chat",
      prompt: [
        "Summarize this PDF",
        "",
        "Attached files (relative to workspace):",
        "- report.pdf (.neoworker/uploads/123/report.pdf)",
        "  Extracted content:",
        "    PDF attachment: report.pdf",
        "    Path: .neoworker/uploads/123/report.pdf",
      ].join("\n"),
      userPrompt: "Summarize this PDF",
      rawPrompt: "Summarize this PDF",
      createdAt: Date.now(),
      agentConfig: {
        executionMode: "chat",
        executionModeSource: "user",
        conversationMode: "hybrid",
      },
    };

    expect(
      (TaskExecutor as Any).prototype.getEffectiveExecutionMode.call(executor),
    ).toBe("chat");
    expect(
      (TaskExecutor as Any).prototype.getEffectiveExecutionModeSource.call(
        executor,
      ),
    ).toBe("user");
    expect(
      (TaskExecutor as Any).prototype.isExplicitChatExecutionMode.call(
        executor,
      ),
    ).toBe(true);
  });

  it("injects live parent status as a turn-scoped sidechat system block", () => {
    const executor = Object.create(TaskExecutor.prototype) as Any;
    executor.task = {
      id: "side-task",
      source: "side_chat",
      branchLabel: "side-chat",
      agentConfig: {
        conversationMode: "chat",
        executionMode: "chat",
        sideChatTurnContext:
          "LIVE_PARENT_STATUS\nParent task status: executing",
      },
    };
    executor.workspace = { path: "/tmp" };

    const blocks = (
      TaskExecutor as Any
    ).prototype.buildChatOrThinkSystemBlocks.call(executor, false, {
      identityPrompt: "",
      roleContext: "",
      profileContext: "",
      personalityPrompt: "",
      extraChatRules: [],
    });

    expect(
      blocks.some((block: Any) => block.text.includes("LIVE_PARENT_STATUS")),
    ).toBe(true);
    expect(
      blocks.some((block: Any) =>
        block.text.includes("authoritative for progress"),
      ),
    ).toBe(true);
  });

  it("returns a single chat response without entering the task pipeline", async () => {
    const executor = Object.create(TaskExecutor.prototype) as Any;
    const companionPrompt = vi.fn().mockResolvedValue(undefined);
    const schedule = vi.fn().mockResolvedValue(false);
    const skillRouting = vi.fn().mockResolvedValue(false);
    const highConfidenceRouting = vi.fn().mockResolvedValue(false);

    executor.task = {
      id: "task-chat",
      title: "Who are you?",
      prompt: "Who are you?",
      userPrompt: "Who are you?",
      rawPrompt: "Who are you?",
      createdAt: Date.now(),
      agentConfig: {
        executionMode: "chat",
        conversationMode: "hybrid",
      },
    };
    executor.workspace = {
      id: "ws-chat",
      path: "/tmp",
      isTemp: true,
      permissions: {
        read: true,
        write: true,
        delete: true,
        network: true,
        shell: true,
      },
    };
    executor.daemon = {
      updateTaskStatus: vi.fn(),
      updateTask: vi.fn(),
    };
    executor.toolRegistry = {
      cleanup: vi.fn().mockResolvedValue(undefined),
    };
    executor.emitEvent = vi.fn();
    executor.handleCompanionPrompt = companionPrompt;
    executor.maybeHandleScheduleSlashCommand = schedule;
    executor.maybeHandleSkillSlashCommandOrInlineChain = skillRouting;
    executor.maybeHandleHighConfidenceSkillRouting = highConfidenceRouting;
    executor.getEffectiveExecutionMode = vi.fn().mockReturnValue("chat");
    executor.ensureVerificationOutcomeSets = vi.fn();
    executor.getBudgetConstrainedFailureStepIdSet = vi
      .fn()
      .mockReturnValue(new Set());
    executor.nonBlockingVerificationFailedStepIds = new Set();
    executor.blockingVerificationFailedStepIds = new Set();
    executor.stepStopReasons = new Map();
    executor.taskFailureDomains = new Set();
    executor.completionVerificationMetadata = null;
    executor.terminalStatus = "ok";
    executor.failureClass = undefined;
    executor.cancelled = false;
    executor.lastUserMessage = "Who are you?";
    executor.cancelReason = undefined;
    executor.daemon.updateTaskStatus.mockClear();

    await (TaskExecutor as Any).prototype.executeUnlocked.call(executor);

    expect(companionPrompt).toHaveBeenCalledTimes(1);
    expect(schedule).not.toHaveBeenCalled();
    expect(skillRouting).not.toHaveBeenCalled();
    expect(highConfidenceRouting).not.toHaveBeenCalled();
    expect(executor.emitEvent).toHaveBeenCalledWith(
      "log",
      expect.objectContaining({
        reason: "initial_companion_prompt",
        explicitChat: true,
      }),
    );
  });

  it("does not mark a failed artifact task completed after a chat-only follow-up", async () => {
    const executor = Object.create(TaskExecutor.prototype) as Any;
    executor.task = {
      id: "task-failed-artifact-follow-up",
      agentType: "sub",
      agentConfig: { conversationMode: "chat" },
    };
    executor.workspace = { id: "ws-chat-follow-up", path: "/tmp" };
    executor.provider = { type: "openai" };
    executor.conversationHistory = [];
    executor.daemon = { updateTaskStatus: vi.fn() };
    executor.emitEvent = vi.fn();
    executor.getRoleContextPrompt = vi.fn().mockReturnValue("");
    executor.buildUserProfileBlock = vi.fn().mockReturnValue("");
    executor.isExplicitChatExecutionMode = vi.fn().mockReturnValue(false);
    executor.getEffectiveExecutionMode = vi.fn().mockReturnValue("chat");
    executor.getEffectiveTaskDomain = vi.fn().mockReturnValue("general");
    executor.setPromptCacheContext = vi.fn().mockReturnValue("system prompt");
    executor.buildChatOrThinkSystemBlocks = vi.fn().mockReturnValue([]);
    executor.generateCompanionFallbackResponse = vi
      .fn()
      .mockReturnValue("fallback");
    executor.runTextTurnKernel = vi.fn().mockResolvedValue({
      assistantText: "The file is still missing.",
      messages: [{ role: "assistant", content: "The file is still missing." }],
    });
    executor.updateConversationHistory = vi.fn();
    executor.saveConversationSnapshot = vi.fn();
    executor.finalizeFollowUpCompletion = vi.fn();

    await (TaskExecutor as Any).prototype.respondInChatMode.call(
      executor,
      "What happened?",
      "failed",
    );

    expect(executor.daemon.updateTaskStatus).toHaveBeenCalledWith(
      "task-failed-artifact-follow-up",
      "failed",
    );
    expect(executor.finalizeFollowUpCompletion).not.toHaveBeenCalled();
    expect(executor.emitEvent).toHaveBeenCalledWith(
      "task_status",
      expect.objectContaining({ status: "failed" }),
    );
  });

  it("does not treat inferred chat intent as explicit chat mode", async () => {
    const executor = Object.create(TaskExecutor.prototype) as Any;

    executor.task = {
      id: "task-inferred-chat",
      title: "hello",
      prompt: "hello",
      userPrompt: "hello",
      rawPrompt: "hello",
      createdAt: Date.now(),
      agentConfig: {
        executionMode: "execute",
        executionModeSource: "strategy",
        conversationMode: "chat",
        taskIntent: "chat",
      },
    };

    expect(
      (TaskExecutor as Any).prototype.isExplicitChatExecutionMode.call(
        executor,
      ),
    ).toBe(false);
    expect(
      (TaskExecutor as Any).prototype.shouldHandleInitialPromptAsCompanion.call(
        executor,
        "hello",
      ),
    ).toBe(true);

    executor.shouldEmitAnswerFirst = vi.fn().mockReturnValue(true);
    executor.hasDirectAnswerReady = vi.fn().mockReturnValue(true);
    executor.promptRequestsArtifactOutput = vi.fn().mockReturnValue(false);
    executor.isLikelyTaskRequest = vi.fn().mockReturnValue(false);

    expect(
      (
        TaskExecutor as Any
      ).prototype.shouldShortCircuitSimpleNonExecuteAnswer.call(executor),
    ).toBe(false);
  });

  it("routes Chinese greetings and identity questions through companion mode", () => {
    const prompts = [
      "你好",
      "您好啊",
      "你是谁？",
      "你好啊。你是谁啊",
      "介绍一下你自己",
    ];

    for (const prompt of prompts) {
      const executor = createInferredChatExecutor(prompt);
      expect(
        (
          TaskExecutor as Any
        ).prototype.shouldHandleInitialPromptAsCompanion.call(executor, prompt),
      ).toBe(true);
    }
  });

  it("returns a deterministic Chinese identity response", () => {
    const executor = createInferredChatExecutor("你好啊。你是谁啊");

    expect(
      (TaskExecutor as Any).prototype.getDeterministicCompanionResponse.call(
        executor,
        "你好啊。你是谁啊",
      ),
    ).toBe(
      "我是 NeoWorker，你的智能工作助手。你可以直接告诉我想完成什么，我会根据需要帮你处理信息和执行任务。",
    );
  });

  it("does not force deterministic replies for substantive chat prompts", () => {
    const executor = createInferredChatExecutor("你怎么看远程办公的利弊？");

    expect(
      (TaskExecutor as Any).prototype.getDeterministicCompanionResponse.call(
        executor,
        "你怎么看远程办公的利弊？",
      ),
    ).toBeNull();
  });

  it("does not route local walking errand prompts through companion mode", () => {
    const prompt =
      "My kid just fell into the duck pond and the wedding starts in 30 minutes. Where can I walk and buy her a new dress?";
    const executor = createInferredChatExecutor(prompt, {
      conversationMode: "chat",
      taskIntent: "chat",
    });

    expect(
      (TaskExecutor as Any).prototype.shouldHandleInitialPromptAsCompanion.call(
        executor,
        prompt,
      ),
    ).toBe(false);
  });

  it("prefers the latest follow-up assistant text over stale prior summaries", () => {
    const executor = Object.create(TaskExecutor.prototype) as Any;

    executor.task = {
      id: "task-follow-up-summary",
      title: "Research Analyst run",
      prompt: "Research prompt",
      resultSummary: "Research Analyst - Awaiting Input",
    };
    executor.bestKnownOutcome = {
      resultSummary: "Yo! What's up? How can I help you today?",
    };
    executor.lastNonVerificationOutput = "Research Analyst - Awaiting Input";
    executor.lastAssistantOutput = "Research Analyst - Awaiting Input";
    executor.lastAssistantText =
      "Premier League fixtures: Liverpool vs Chelsea; Brentford vs Manchester City.";
    executor.getContentFallback = vi.fn().mockReturnValue("");

    expect(
      (TaskExecutor as Any).prototype.buildFollowUpResultSummary.call(executor),
    ).toBe(
      "Premier League fixtures: Liverpool vs Chelsea; Brentford vs Manchester City.",
    );
  });

  it("does not reuse a pre-tool progress announcement as the follow-up result", () => {
    const executor = Object.create(TaskExecutor.prototype) as Any;

    executor.task = {
      id: "task-follow-up-progress-summary",
      title: "Verify an HTML report",
      prompt: "Open the HTML report in a browser and verify it.",
      resultSummary: "The prior report generation completed successfully.",
    };
    executor.conversationHistory = [
      {
        role: "assistant",
        content: [
          {
            type: "text",
            text: "脚本语法校验通过。AppleScript 无权限。再试 Playwright 做完整渲染检查。",
          },
        ],
      },
    ];
    executor.lastAssistantText =
      "脚本语法校验通过。AppleScript 无权限。再试 Playwright 做完整渲染检查。";
    executor.lastAssistantOutput = executor.lastAssistantText;
    executor.lastNonVerificationOutput =
      "The prior report generation completed successfully.";
    executor.bestKnownOutcome = null;
    executor.getContentFallback = vi.fn().mockReturnValue("");

    expect(
      (TaskExecutor as Any).prototype.buildFollowUpResultSummary.call(executor),
    ).toBe("The prior report generation completed successfully.");
  });

  it("accepts the exact OK verdict as a conclusive verification summary", () => {
    const executor = Object.create(TaskExecutor.prototype) as Any;
    executor.task = { id: "task-follow-up-ok", resultSummary: "Older result" };
    executor.conversationHistory = [
      {
        role: "assistant",
        content: [{ type: "text", text: "OK" }],
      },
    ];
    executor.getContentFallback = vi.fn().mockReturnValue("");

    expect(
      (TaskExecutor as Any).prototype.buildFollowUpResultSummary.call(executor),
    ).toBe("OK");
  });

  it("requires a text-only verdict after the latest follow-up tool results", () => {
    const executor = Object.create(TaskExecutor.prototype) as Any;

    expect(
      (TaskExecutor as Any).prototype.followUpNeedsToolFreeFinalResponse.call(
        executor,
        true,
        false,
      ),
    ).toBe(true);
    expect(
      (TaskExecutor as Any).prototype.followUpNeedsToolFreeFinalResponse.call(
        executor,
        true,
        true,
      ),
    ).toBe(false);
  });

  it("keeps browser verification inside NeoWorker when browser tools are available", () => {
    const executor = Object.create(TaskExecutor.prototype) as Any;
    executor.task = {
      id: "task-browser-verification-routing",
      title: "HTML report",
      prompt: "Create a standalone HTML report.",
    };
    executor.lastUserMessage = "请在浏览器中检查页面渲染是否正常";
    executor.lastAssistantOutput = "";
    executor.currentStepId = null;
    executor.plan = null;
    const tools = [
      { name: "browser_navigate" },
      { name: "browser_snapshot" },
      { name: "run_command" },
      { name: "run_applescript" },
      { name: "read_file" },
    ];

    const filtered = (
      TaskExecutor as Any
    ).prototype.filterToolsForBuiltInBrowserVerification.call(executor, tools);

    expect(filtered.map((tool: Any) => tool.name)).toEqual([
      "browser_navigate",
      "browser_snapshot",
      "read_file",
    ]);
  });

  it("preserves an explicitly requested Chrome CLI verification route", () => {
    const executor = Object.create(TaskExecutor.prototype) as Any;
    executor.task = {
      id: "task-browser-cli-routing",
      title: "HTML report",
      prompt: "Create a standalone HTML report.",
    };
    executor.lastUserMessage =
      "Use Chrome CLI headless to verify the HTML page";
    executor.lastAssistantOutput = "";
    executor.currentStepId = null;
    executor.plan = null;
    const tools = [
      { name: "browser_navigate" },
      { name: "run_command" },
      { name: "run_applescript" },
    ];

    const filtered = (
      TaskExecutor as Any
    ).prototype.filterToolsForBuiltInBrowserVerification.call(executor, tools);

    expect(filtered).toEqual(tools);
  });

  it("prefers the latest persisted follow-up assistant message over stale assistant text", () => {
    const executor = Object.create(TaskExecutor.prototype) as Any;

    executor.task = {
      id: "task-follow-up-history-summary",
      title: "Persistent goal",
      prompt: "Track release blockers",
      resultSummary: "Release blocker analysis from the prior run.",
    };
    executor.bestKnownOutcome = {
      resultSummary: "Older best-known release blocker summary.",
    };
    executor.conversationHistory = [
      { role: "user", content: [{ type: "text", text: "/goal status" }] },
      {
        role: "assistant",
        content: [
          {
            type: "text",
            text: "Goal active.\n\nObjective: Track release blockers",
          },
        ],
      },
    ];
    executor.lastAssistantText =
      "A stale assistant reply from before the follow-up.";
    executor.lastNonVerificationOutput =
      "Goal active.\n\nObjective: Track release blockers";
    executor.lastAssistantOutput =
      "Goal active.\n\nObjective: Track release blockers";
    executor.getContentFallback = vi.fn().mockReturnValue("");

    expect(
      (TaskExecutor as Any).prototype.buildFollowUpResultSummary.call(executor),
    ).toBe("Goal active.\n\nObjective: Track release blockers");
  });

  it("keeps local goal follow-up messages aligned with last assistant text", () => {
    const executor = Object.create(TaskExecutor.prototype) as Any;

    executor.task = {
      id: "task-goal-follow-up",
      title: "Persistent goal",
      prompt: "Track release blockers",
    };
    executor.workspace = {
      id: "ws-goal-follow-up",
      path: "/tmp",
      permissions: {
        read: true,
        write: true,
        delete: true,
        network: true,
        shell: true,
      },
    };
    executor.emitEvent = vi.fn();

    (TaskExecutor as Any).prototype.emitGoalAssistantMessage.call(
      executor,
      "/goal status",
      "Goal active.\n\nObjective: Track release blockers",
    );

    expect(executor.lastAssistantText).toBe(
      "Goal active.\n\nObjective: Track release blockers",
    );
    expect(
      (TaskExecutor as Any).prototype.buildFollowUpResultSummary.call(executor),
    ).toBe("Goal active.\n\nObjective: Track release blockers");
  });

  it("does not route inferred chat live-lookup prompts through companion mode", () => {
    const executor = createInferredChatExecutor(
      "please tell me which football clubs have games tomorrow in premier league",
    );

    expect(
      (TaskExecutor as Any).prototype.shouldHandleInitialPromptAsCompanion.call(
        executor,
        "please tell me which football clubs have games tomorrow in premier league",
      ),
    ).toBe(false);
  });

  it.each([
    "北京今天天气怎么样？",
    "帮我查看一下浪潮信息股票今天的情况",
    "你去查一下",
  ])(
    "routes explicit chat live lookups through the tool-capable task path: %s",
    (prompt) => {
      const executor = createInferredChatExecutor(prompt, {
        executionMode: "chat",
        executionModeSource: "user",
        conversationMode: "chat",
        taskIntent: "chat",
      });

      expect(
        (
          TaskExecutor as Any
        ).prototype.shouldHandleInitialPromptAsCompanion.call(executor, prompt),
      ).toBe(false);
      expect(
        (TaskExecutor as Any).prototype.resolveConversationMode.call(
          executor,
          prompt,
          true,
        ),
      ).toBe("task");
    },
  );

  it("uses a deterministic one-step plan for Chat live lookups", () => {
    const executor = createInferredChatExecutor("weather in Paris today", {
      executionMode: "chat",
      executionModeSource: "user",
      conversationMode: "chat",
      taskIntent: "chat",
    });
    executor.getTaskStrategySnapshot = vi
      .fn()
      .mockReturnValue({ workflowMode: "none" });
    executor.getContractPrompt = vi
      .fn()
      .mockReturnValue("weather in Paris today");
    executor.promptRequiresLiveLookup = vi.fn().mockReturnValue(true);
    executor.getEffectiveTaskDomain = vi.fn().mockReturnValue("general");
    executor.sanitizePlan = vi.fn((plan) => plan);

    const plan = (TaskExecutor as Any).prototype.buildDirectLookupPlan.call(
      executor,
    );

    expect(plan?.steps).toHaveLength(1);
    expect(plan?.steps[0]?.description).toBe("weather in Paris today");
  });

  it("uses a deterministic one-step plan for Chat attachments", () => {
    const executor = createInferredChatExecutor("Summarize the attached PDF", {
      executionMode: "chat",
      executionModeSource: "user",
      conversationMode: "chat",
      taskIntent: "chat",
    });
    executor.initialImages = [];
    executor.getContractPrompt = vi
      .fn()
      .mockReturnValue(
        "PDF attachment: report.pdf\nPath: .neoworker/uploads/123/report.pdf\nSummarize it",
      );
    executor.hasUploadedPdfAttachmentContext = vi.fn().mockReturnValue(true);
    executor.sanitizePlan = vi.fn((plan) => plan);

    const plan = (
      TaskExecutor as Any
    ).prototype.buildDirectChatAttachmentPlan.call(executor);

    expect(plan?.steps).toHaveLength(1);
    expect(plan?.description).toBe("Answer from the attached content");
  });

  it("stops execution requests at the explicit Chat boundary before planning", async () => {
    const executor = createExecuteUnlockedRoutingExecutor(
      "帮我生成一个 Excel 文件",
      {
        executionMode: "chat",
        executionModeSource: "user",
        conversationMode: "chat",
        taskIntent: "chat",
      },
    );
    executor.explicitChatRequestNeedsExecute = vi.fn().mockReturnValue(true);
    executor.finalizeExplicitChatExecutionBoundary = vi.fn();

    await (TaskExecutor as Any).prototype.executeUnlocked.call(executor);

    expect(executor.finalizeExplicitChatExecutionBoundary).toHaveBeenCalledWith(
      "帮我生成一个 Excel 文件",
    );
    expect(executor.handleCompanionPrompt).not.toHaveBeenCalled();
    expect(executor.analyzeTask).not.toHaveBeenCalled();
  });

  it("keeps ambiguous inferred chat prompts in the normal executor path", () => {
    const prompts = [
      "are there premier league games tomorrow",
      "weather in paris today",
      "is apple stock up today",
      "/schedule tomorrow remind me to send the report",
      "/goal keep an eye on deploy health",
      "/skill pdf summarize report.pdf",
      "Use the Codex CLI Agent skill to review this change",
      "answer_first=true explain the tradeoffs before planning",
      "summarize report.pdf",
      "describe this image",
      "Attached files:\n- photo.png\nWhat is in this image?",
      "PDF attachment: report.pdf\nPath: .neoworker/uploads/123/report.pdf\nSummarize it",
    ];

    for (const prompt of prompts) {
      const executor = createInferredChatExecutor(prompt);

      expect(
        (
          TaskExecutor as Any
        ).prototype.shouldHandleInitialPromptAsCompanion.call(executor, prompt),
      ).toBe(false);
    }
  });

  it("keeps external runtime tasks out of inferred companion routing", () => {
    const executor = createInferredChatExecutor("hello", {
      externalRuntime: {
        kind: "acpx",
        agent: "claude",
        sessionMode: "persistent",
        outputMode: "json",
        permissionMode: "approve-reads",
      },
    });

    expect(
      (TaskExecutor as Any).prototype.shouldHandleInitialPromptAsCompanion.call(
        executor,
        "hello",
      ),
    ).toBe(false);
  });

  it("keeps explicit chat ACP tasks on the external runtime path", async () => {
    const executor = createExecuteUnlockedRoutingExecutor("hello", {
      executionMode: "chat",
      executionModeSource: "user",
      conversationMode: "hybrid",
      externalRuntime: {
        kind: "acpx",
        agent: "claude",
        sessionMode: "persistent",
        outputMode: "json",
        permissionMode: "approve-reads",
      },
    });
    executor.executeWithAcpxRuntime = vi.fn().mockResolvedValue(undefined);

    await (TaskExecutor as Any).prototype.executeUnlocked.call(executor);

    expect(executor.executeWithAcpxRuntime).toHaveBeenCalledWith("hello");
    expect(executor.handleCompanionPrompt).not.toHaveBeenCalled();
    expect(executor.maybeHandleScheduleSlashCommand).not.toHaveBeenCalled();
  });

  it("keeps slash commands on the executor entrypoint path", async () => {
    const executor = createExecuteUnlockedRoutingExecutor(
      "/schedule tomorrow remind me to send the report",
    );
    executor.maybeHandleScheduleSlashCommand = vi.fn().mockResolvedValue(true);

    await (TaskExecutor as Any).prototype.executeUnlocked.call(executor);

    expect(executor.handleCompanionPrompt).not.toHaveBeenCalled();
    expect(executor.maybeHandleScheduleSlashCommand).toHaveBeenCalledTimes(1);
    expect(executor.analyzeTask).not.toHaveBeenCalled();
  });

  it("only exposes the last non-verification step as an assistant bubble", () => {
    const executor = Object.create(TaskExecutor.prototype) as Any;
    executor.plan = {
      description: "Hello plan",
      steps: [
        {
          id: "1",
          description: "Interpret the task as a simple chat greeting.",
          kind: "primary",
        },
        { id: "2", description: "Draft a concise reply.", kind: "primary" },
        {
          id: "3",
          description: "Send the greeting response.",
          kind: "primary",
        },
        {
          id: "4",
          description:
            "Verify: confirm the reply includes a greeting and help offer.",
          kind: "verification",
        },
      ],
    };

    expect(
      (TaskExecutor as Any).prototype.isLastVisibleAssistantStep.call(
        executor,
        executor.plan.steps[0],
      ),
    ).toBe(false);
    expect(
      (TaskExecutor as Any).prototype.isLastVisibleAssistantStep.call(
        executor,
        executor.plan.steps[1],
      ),
    ).toBe(false);
    expect(
      (TaskExecutor as Any).prototype.isLastVisibleAssistantStep.call(
        executor,
        executor.plan.steps[2],
      ),
    ).toBe(true);
    expect(
      (TaskExecutor as Any).prototype.isLastVisibleAssistantStep.call(
        executor,
        executor.plan.steps[3],
      ),
    ).toBe(false);
  });

  it("uses the 48K cap for explicit chat sessions", async () => {
    const executor = Object.create(TaskExecutor.prototype) as Any;
    const createMessageWithTimeout = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "reply" }],
      stopReason: "end_turn",
      usage: { inputTokens: 1, outputTokens: 1 },
    });

    executor.task = {
      id: "task-chat-cap",
      title: "Chat session",
      prompt: "Say hello",
      userPrompt: "Say hello",
      rawPrompt: "Say hello",
      createdAt: Date.now(),
      agentConfig: {
        executionMode: "chat",
        conversationMode: "hybrid",
      },
    };
    executor.workspace = {
      id: "ws-chat-cap",
      path: "/tmp",
      isTemp: true,
      permissions: {
        read: true,
        write: true,
        delete: true,
        network: true,
        shell: true,
      },
    };
    executor.daemon = {
      updateTaskStatus: vi.fn(),
      updateTask: vi.fn(),
    };
    executor.emitEvent = vi.fn();
    executor.buildChatOrThinkSystemPrompt = vi
      .fn()
      .mockReturnValue("system prompt");
    executor.getRoleContextPrompt = vi.fn().mockReturnValue("");
    executor.buildUserProfileBlock = vi.fn().mockReturnValue("");
    executor.buildUserContent = vi.fn().mockResolvedValue("Say hello");
    executor.callLLMWithRetry = vi.fn(async (fn: Any) => fn());
    executor.createMessageWithTimeout = createMessageWithTimeout;
    executor.updateTracking = vi.fn();
    executor.extractTextFromLLMContent = vi.fn().mockReturnValue("reply");
    executor.updateConversationHistory = vi.fn();
    executor.saveConversationSnapshot = vi.fn();
    executor.finalizeTaskBestEffort = vi.fn();
    executor.capturePlaybookOutcome = vi.fn();
    executor.generateCompanionFallbackResponse = vi
      .fn()
      .mockReturnValue("fallback");
    executor.getCumulativeInputTokens = vi.fn().mockReturnValue(0);
    executor.getCumulativeOutputTokens = vi.fn().mockReturnValue(0);
    executor.taskCompleted = false;
    executor.cancelled = false;

    await (TaskExecutor as Any).prototype.handleCompanionPrompt.call(executor);

    expect(createMessageWithTimeout).toHaveBeenCalled();
    expect(createMessageWithTimeout.mock.calls[0][0].maxTokens).toBe(48_000);
  });

  it("reuses a cached explicit chat summary instead of regenerating it every turn", async () => {
    const executor = Object.create(TaskExecutor.prototype) as Any;
    const buildCompactionSummaryBlock = vi
      .fn()
      .mockResolvedValue(
        "<neoworker_compaction_summary>\nsummary\n</neoworker_compaction_summary>",
      );

    executor.conversationHistory = Array.from({ length: 30 }, (_, index) => ({
      role: index % 2 === 0 ? "user" : "assistant",
      content: [
        {
          type: "text",
          text: `${index % 2 === 0 ? "User" : "Assistant"} turn ${index}`,
        },
      ],
    }));
    executor.buildCompactionSummaryBlock = buildCompactionSummaryBlock;
    executor.explicitChatSummaryBlock = null;
    executor.explicitChatSummaryCreatedAt = 0;
    executor.explicitChatSummarySourceMessageCount = 0;

    const first = await (
      TaskExecutor as Any
    ).prototype.buildExplicitChatMessages.call(
      executor,
      "Follow up question",
      "system prompt",
    );
    const second = await (
      TaskExecutor as Any
    ).prototype.buildExplicitChatMessages.call(
      executor,
      "Another follow up",
      "system prompt",
    );

    expect(buildCompactionSummaryBlock).toHaveBeenCalledTimes(1);
    expect(executor.explicitChatSummaryBlock).toContain("summary");
    expect(
      typeof first[0].content === "string"
        ? first[0].content
        : JSON.stringify(first[0].content),
    ).toContain("<neoworker_compaction_summary>");
    expect(
      typeof second[0].content === "string"
        ? second[0].content
        : JSON.stringify(second[0].content),
    ).toContain("<neoworker_compaction_summary>");
  });

  it("routes long sub-agent chat synthesis through the shared text turn kernel flow", async () => {
    const executor = Object.create(TaskExecutor.prototype) as Any;
    const runTextTurnKernel = vi.fn().mockResolvedValue({
      assistantText: "Part one. Part two.",
      messages: [
        { role: "user", content: [{ type: "text", text: "Synthesis prompt" }] },
        {
          role: "assistant",
          content: [{ type: "text", text: "Part one. Part two." }],
        },
      ],
    });

    executor.task = {
      id: "task-sub-chat",
      title: "Synthesis child",
      prompt: "x".repeat(2200),
      userPrompt: "x".repeat(2200),
      rawPrompt: "x".repeat(2200),
      parentTaskId: "parent-1",
      createdAt: Date.now(),
      agentType: "sub",
      agentConfig: {
        executionMode: "chat",
        conversationMode: "chat",
        maxTokens: 16000,
      },
    };
    executor.workspace = {
      id: "ws-sub-chat",
      path: "/tmp",
      isTemp: true,
      permissions: {
        read: true,
        write: true,
        delete: true,
        network: true,
        shell: true,
      },
    };
    executor.daemon = {
      updateTaskStatus: vi.fn(),
      updateTask: vi.fn(),
    };
    executor.emitEvent = vi.fn();
    executor.getRoleContextPrompt = vi.fn().mockReturnValue("");
    executor.buildUserContent = vi.fn().mockResolvedValue("Synthesis prompt");
    executor.runTextTurnKernel = runTextTurnKernel;
    executor.updateTracking = vi.fn();
    executor.updateConversationHistory = vi.fn();
    executor.buildResultSummary = vi.fn().mockReturnValue("summary");
    executor.finalizeTaskBestEffort = vi.fn();

    await (TaskExecutor as Any).prototype.handleSubAgentChatMode.call(
      executor,
      "x".repeat(2200),
    );

    expect(runTextTurnKernel).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          {
            role: "user",
            content: [{ type: "text", text: "Synthesis prompt" }],
          },
        ],
        systemPrompt: expect.stringContaining(
          "Respond thoroughly and completely",
        ),
        initialMaxTokens: 16000,
        continuationMaxTokens: 1200,
        mode: "follow_up",
        operationLabel: "Sub-agent chat response",
        allowContinuation: true,
      }),
    );
    expect(executor.updateConversationHistory).toHaveBeenCalledWith([
      { role: "user", content: [{ type: "text", text: "Synthesis prompt" }] },
      {
        role: "assistant",
        content: [{ type: "text", text: "Part one. Part two." }],
      },
    ]);
    expect(executor.finalizeTaskBestEffort).toHaveBeenCalledWith("summary");
  });
});
