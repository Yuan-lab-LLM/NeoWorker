import { beforeEach, describe, expect, it, vi } from "vitest";

const rankModelInvocableSkillsForQuery = vi.fn();
const listSkills = vi.fn();
const getSkill = vi.fn();

vi.mock("../custom-skill-loader", () => ({
  getCustomSkillLoader: () => ({
    rankModelInvocableSkillsForQuery,
    listSkills,
    getSkill,
  }),
}));

import { TaskExecutor } from "../executor";

describe("TaskExecutor skill shortlist routing", () => {
  function createExecutor(prompt: string, taskOverrides: Any = {}) {
    const executor = Object.create(TaskExecutor.prototype) as Any;
    const resolvedInvocations = new Map<string, Any>();
    let pending: Any = null;
    let primaryHandled = false;
    const runtime = {
      getPendingSkillParameterCollection: vi.fn(() => (pending ? { ...pending } : null)),
      setPendingSkillParameterCollection: vi.fn((next: Any) => {
        pending = next ? { ...next } : null;
        return pending ? { ...pending } : null;
      }),
      markPrimarySlashCommandHandled: vi.fn(() => {
        primaryHandled = true;
      }),
      hasHandledPrimarySlashCommand: vi.fn(() => primaryHandled),
      get pending() {
        return pending;
      },
    };

    executor.task = {
      id: "task-skill-route-1",
      title: "Routing test",
      prompt,
      rawPrompt: taskOverrides.rawPrompt ?? prompt,
      userPrompt: taskOverrides.userPrompt ?? prompt,
      createdAt: Date.now() - 1000,
      ...taskOverrides,
    };
    executor.appliedSkills = [];
    executor.taskContextNotes = [];
    executor.workspace = {
      id: "workspace-1",
      name: "Workspace",
      path: "/tmp/workspace",
      createdAt: Date.now() - 1000,
      permissions: {
        read: true,
        write: true,
        delete: false,
        shell: true,
        network: false,
        unrestrictedFileAccess: false,
      },
      isTemp: false,
    };
    executor.emitEvent = vi.fn();
    executor.appendConversationHistory = vi.fn();
    executor.saveConversationSnapshot = vi.fn();
    executor.daemon = {
      updateTask: vi.fn(),
    };
    executor.getSessionRuntime = vi.fn(() => runtime);
    executor.getAvailableTools = vi.fn(() => [{ name: "Skill" }]);
    executor.toolRegistry = {
      executeTool: vi.fn(async (_name: string, _input: Any) => {
        throw new Error("Unexpected tool execution");
      }),
      takeResolvedSkillInvocation: vi.fn((invocationId: string) => {
        const resolved = resolvedInvocations.get(invocationId) || null;
        resolvedInvocations.delete(invocationId);
        return resolved;
      }),
    };
    executor.__resolvedInvocations = resolvedInvocations;
    executor.__runtime = runtime;

    return executor as TaskExecutor & {
      emitEvent: ReturnType<typeof vi.fn>;
      appendConversationHistory: ReturnType<typeof vi.fn>;
      saveConversationSnapshot: ReturnType<typeof vi.fn>;
      daemon: {
        updateTask: ReturnType<typeof vi.fn>;
      };
      getSessionRuntime: ReturnType<typeof vi.fn>;
      getAvailableTools: ReturnType<typeof vi.fn>;
      toolRegistry: {
        executeTool: ReturnType<typeof vi.fn>;
        takeResolvedSkillInvocation: ReturnType<typeof vi.fn>;
      };
      __resolvedInvocations: Map<string, Any>;
      __runtime: typeof runtime;
    };
  }

  beforeEach(() => {
    rankModelInvocableSkillsForQuery.mockReset();
    listSkills.mockReset();
    getSkill.mockReset();
    listSkills.mockReturnValue([]);
    getSkill.mockReturnValue(undefined);
  });

  it("ranks candidate skills for planning but does not auto-apply them", async () => {
    rankModelInvocableSkillsForQuery.mockReturnValue([
      {
        skill: {
          id: "codex-cli",
          name: "Codex CLI Agent",
          description: "Review a PR with Codex CLI.",
          metadata: { routing: { useWhen: "Use when a coding task needs Codex." } },
        },
        score: 0.93,
      },
      {
        skill: {
          id: "code-review",
          name: "Code Review",
          description: "Review a code change.",
          metadata: { routing: { useWhen: "Use when reviewing code." } },
        },
        score: 0.61,
      },
    ]);

    const prompt = "We need to review PR #55 on neoworker os repo. Spin up Codex to review it.";
    const executor = createExecutor(prompt);

    const handled = await (TaskExecutor as Any).prototype.maybeHandleHighConfidenceSkillRouting.call(
      executor,
    );

    expect(handled).toBe(false);
    expect(executor.toolRegistry.executeTool).not.toHaveBeenCalled();
    expect(executor.task.prompt).toBe(prompt);
    expect(executor.emitEvent).toHaveBeenCalledWith(
      "skill_candidates_ranked",
      expect.objectContaining({
        candidates: expect.arrayContaining([
          expect.objectContaining({
            skillId: "codex-cli",
            score: 0.93,
          }),
        ]),
      }),
    );
  });

  it("routes ordinary PowerPoint creation through Presentation Studio", async () => {
    rankModelInvocableSkillsForQuery.mockReturnValue([
      {
        skill: {
          id: "presentation-studio",
          name: "Presentation Studio",
          description: "Build and visually verify editable PowerPoint decks.",
          metadata: {
            routing: {
              useWhen: "Use for PowerPoint creation and editing.",
            },
          },
        },
        score: 0.92,
      },
    ]);
    const executor = createExecutor("分析 MiniMax 股票，并生成一个 PPT。");
    executor.toolRegistry.executeTool.mockImplementation(async (name: string, input: Any) => {
      expect(name).toBe("Skill");
      expect(input).toEqual({
        skill: "presentation-studio",
        args: "",
        trigger: "model",
      });
      const invocationId = "skill-invocation-presentation-studio";
      executor.__resolvedInvocations.set(invocationId, {
        skillId: "presentation-studio",
        skillName: "Presentation Studio",
        trigger: "model",
        args: "",
        parameters: {},
        content: "Expanded Presentation Studio instructions",
        reason: "Applied as the default PowerPoint workflow.",
        appliedAt: Date.now(),
      });
      return {
        success: true,
        skill: "presentation-studio",
        skill_name: "Presentation Studio",
        skill_invocation_id: invocationId,
        message: "Loaded Presentation Studio.",
      };
    });

    const handled = await (TaskExecutor as Any).prototype.maybeHandleHighConfidenceSkillRouting.call(
      executor,
    );

    expect(handled).toBe(true);
    expect(executor.appliedSkills).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          skillId: "presentation-studio",
          trigger: "model",
        }),
      ]),
    );
  });

  it("chooses Visual Presentation instead of Presentation Studio for explicit visual creation", async () => {
    rankModelInvocableSkillsForQuery.mockReturnValue([
      {
        skill: {
          id: "visual-presentation",
          name: "Visual Presentation",
          description: "Build image-led PowerPoint decks with editable native text.",
          metadata: {
            routing: {
              useWhen: "Use for beautiful visual PowerPoint creation.",
            },
          },
        },
        score: 0.97,
      },
      {
        skill: {
          id: "presentation-studio",
          name: "Presentation Studio",
          description: "Build editable PowerPoint decks.",
          metadata: {
            routing: {
              useWhen: "Use for PowerPoint creation and editing.",
            },
          },
        },
        score: 0.91,
      },
    ]);

    const executor = createExecutor("帮我做一份好看、有发布会质感的产品介绍 PPT。");
    executor.appliedSkills = [
      {
        skillId: "presentation-studio",
        skillName: "Presentation Studio",
        trigger: "model",
        parameters: {},
        content: "Old presentation instructions",
        reason: "Restored from an earlier turn.",
        appliedAt: Date.now() - 1_000,
      },
    ];
    executor.taskContextNotes = [
      "ACTIVE PRESENTATION WORKFLOW:\nPresentation Studio is active.",
    ];
    executor.toolRegistry.executeTool.mockImplementation(async (name: string, input: Any) => {
      expect(name).toBe("Skill");
      expect(input).toEqual({
        skill: "visual-presentation",
        args: "",
        trigger: "model",
      });
      const invocationId = "skill-invocation-visual-presentation";
      executor.__resolvedInvocations.set(invocationId, {
        skillId: "visual-presentation",
        skillName: "Visual Presentation",
        trigger: "model",
        args: "",
        parameters: {},
        content: "Expanded Visual Presentation instructions",
        reason: "Applied as the visual PowerPoint workflow.",
        appliedAt: Date.now(),
      });
      return {
        success: true,
        skill: "visual-presentation",
        skill_name: "Visual Presentation",
        skill_invocation_id: invocationId,
        message: "Loaded Visual Presentation.",
      };
    });

    const handled = await (TaskExecutor as Any).prototype.maybeHandleHighConfidenceSkillRouting.call(
      executor,
    );

    expect(handled).toBe(true);
    expect(executor.appliedSkills).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          skillId: "visual-presentation",
          trigger: "model",
        }),
      ]),
    );
    expect(executor.appliedSkills).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ skillId: "presentation-studio" })]),
    );
    expect(executor.taskContextNotes).toEqual(
      expect.arrayContaining([expect.stringContaining("exactly one final PPTX")]),
    );
  });

  it("keeps existing-deck visual edits on Presentation Studio", async () => {
    const executor = createExecutor("把这个现有 PPTX 美化一下，修复第三页。");
    expect(
      (TaskExecutor as Any).prototype.taskRequestsVisualPresentationWorkflow.call(
        executor,
        executor.task.prompt,
      ),
    ).toBe(false);
    expect(
      (TaskExecutor as Any).prototype.taskRequestsPresentationStudioWorkflow.call(
        executor,
        executor.task.prompt,
      ),
    ).toBe(true);
  });

  it("routes data-heavy deck creation through Presentation Studio", async () => {
    const executor = createExecutor("生成一份包含大量可编辑财务图表的季度分析 PPT。");
    expect(
      (TaskExecutor as Any).prototype.taskRequestsVisualPresentationWorkflow.call(
        executor,
        executor.task.prompt,
      ),
    ).toBe(false);
    expect(
      (TaskExecutor as Any).prototype.taskRequestsPresentationStudioWorkflow.call(
        executor,
        executor.task.prompt,
      ),
    ).toBe(true);
  });

  it("does not let quoted pasted text hijack the task into a skill", async () => {
    rankModelInvocableSkillsForQuery.mockReturnValue([
      {
        skill: {
          id: "frontend",
          name: "Frontend",
          description: "Implement frontend work.",
          metadata: { routing: { useWhen: "Use for UI implementation tasks." } },
        },
        score: 0.21,
      },
    ]);

    const prompt = [
      "Summarize Karpathy's post and extract the repo names he mentioned.",
      "",
      'Pasted text: I use Obsidian as the IDE "frontend" for most notes.',
    ].join("\n");
    const executor = createExecutor(prompt);

    const handled = await (TaskExecutor as Any).prototype.maybeHandleHighConfidenceSkillRouting.call(
      executor,
    );

    expect(handled).toBe(false);
    expect(executor.toolRegistry.executeTool).not.toHaveBeenCalled();
    expect(executor.task.prompt).toBe(prompt);
    expect(executor.emitEvent).toHaveBeenCalledWith(
      "skill_candidates_ranked",
      expect.objectContaining({
        candidates: expect.any(Array),
      }),
    );
  });

  it("auto-applies explicitly requested skills from plain-English step text", async () => {
    listSkills.mockReturnValue([
      {
        id: "novelist",
        name: "Novelist",
        description: "Write a novel end-to-end.",
        enabled: true,
      },
    ]);

    const executor = createExecutor("Write a novel from this brief.");
    executor.currentStepId = "step-3";
    executor.toolRegistry.executeTool.mockImplementation(async (name: string, input: Any) => {
      expect(name).toBe("Skill");
      expect(input).toEqual({
        skill: "novelist",
        args: "",
        trigger: "explicit_hint",
      });
      const invocationId = "skill-invocation-1";
      executor.__resolvedInvocations.set(invocationId, {
        skillId: "novelist",
        skillName: "Novelist",
        trigger: "explicit_hint",
        args: "",
        parameters: {},
        content: "Expanded novelist instructions",
        reason: "Applied as additive skill context while preserving the original task.",
        appliedAt: Date.now(),
      });
      return {
        success: true,
        skill: "novelist",
        skill_name: "Novelist",
        skill_invocation_id: invocationId,
        message: "Loaded skill 'Novelist' for this task.",
      };
    });

    const handled = await (
      TaskExecutor as Any
    ).prototype.maybeAutoApplyExplicitSkillInvocation.call(
      executor,
      "Apply the 'novelist' skill to draft and package the novel from the approved brief.",
      "step",
      "the skill requested by step",
    );

    expect(handled).toBe(true);
    expect(executor.appliedSkills).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          skillId: "novelist",
          trigger: "explicit_hint",
          content: "Expanded novelist instructions",
        }),
      ]),
    );
    expect(executor.taskContextNotes).toEqual(
      expect.arrayContaining([
        expect.stringContaining("The explicitly requested skill 'novelist' is already active"),
      ]),
    );
  });

  it("auto-applies explicitly requested skills from the task prompt before planning", async () => {
    listSkills.mockReturnValue([
      {
        id: "novelist",
        name: "Novelist",
        description: "Write a novel end-to-end.",
        enabled: true,
      },
    ]);

    const prompt =
      "Use the novelist skill to develop, draft, revise, and package a novel from the approved brief.";
    const executor = createExecutor(prompt);
    executor.toolRegistry.executeTool.mockImplementation(async (name: string, input: Any) => {
      expect(name).toBe("Skill");
      expect(input).toEqual({
        skill: "novelist",
        args: "",
        trigger: "explicit_hint",
      });
      const invocationId = "skill-invocation-task";
      executor.__resolvedInvocations.set(invocationId, {
        skillId: "novelist",
        skillName: "Novelist",
        trigger: "explicit_hint",
        args: "",
        parameters: {},
        content: "Expanded novelist instructions",
        reason: "Applied as additive skill context while preserving the original task.",
        appliedAt: Date.now(),
      });
      return {
        success: true,
        skill: "novelist",
        skill_name: "Novelist",
        skill_invocation_id: invocationId,
        message: "Loaded skill 'Novelist' for this task.",
      };
    });

    const handled = await (
      TaskExecutor as Any
    ).prototype.maybeAutoApplyExplicitSkillInvocation.call(
      executor,
      executor.task.prompt,
      "task",
      "the explicitly requested task skill",
    );

    expect(handled).toBe(true);
    expect(executor.appliedSkills).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          skillId: "novelist",
          trigger: "explicit_hint",
        }),
      ]),
    );
  });

  it("auto-applies a structured task skill without adding an invocation to the user prompt", async () => {
    listSkills.mockReturnValue([
      {
        id: "dcf-valuation",
        name: "DCF Valuation",
        description: "Build a discounted cash-flow valuation.",
        enabled: true,
      },
    ]);

    const prompt = "我会提供公司或财务假设。请建立折现现金流模型。";
    const executor = createExecutor(prompt, {
      agentConfig: { requestedSkillId: "dcf-valuation" },
    });
    executor.toolRegistry.executeTool.mockImplementation(async (name: string, input: Any) => {
      expect(name).toBe("Skill");
      expect(input).toEqual({
        skill: "dcf-valuation",
        args: "",
        trigger: "explicit_hint",
      });
      const invocationId = "skill-invocation-configured";
      executor.__resolvedInvocations.set(invocationId, {
        skillId: "dcf-valuation",
        skillName: "DCF Valuation",
        trigger: "explicit_hint",
        args: "",
        parameters: {},
        content: "Expanded DCF valuation instructions",
        reason: "Applied as hidden structured task context.",
        appliedAt: Date.now(),
      });
      return {
        success: true,
        skill: "dcf-valuation",
        skill_name: "DCF Valuation",
        skill_invocation_id: invocationId,
        message: "Loaded skill 'DCF Valuation' for this task.",
      };
    });

    const handled = await (
      TaskExecutor as Any
    ).prototype.maybeAutoApplyConfiguredTaskSkill.call(executor);

    expect(handled).toBe(true);
    expect(executor.task.prompt).toBe(prompt);
    expect(executor.task.prompt).not.toContain("dcf-valuation");
    expect(executor.appliedSkills).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          skillId: "dcf-valuation",
          skillName: "DCF Valuation",
          trigger: "explicit_hint",
        }),
      ]),
    );
  });

  it("continues a structured task when its optional skill is unavailable", async () => {
    listSkills.mockReturnValue([
      {
        id: "stock-analysis",
        name: "Stock Analysis",
        description: "Analyze a listed company.",
        enabled: true,
      },
    ]);

    const prompt = "股票代码：[000977]。请获取实时行情、基本面、技术指标和分析师情绪。";
    const executor = createExecutor(prompt, {
      agentConfig: { requestedSkillId: "stock-analysis" },
    });
    executor.toolRegistry.executeTool.mockResolvedValue({
      success: false,
      error: "Skill 'stock-analysis' is not currently executable",
      reason: "Missing or invalid skill prerequisites.",
      missing_requirements: { bins: ["python"] },
    });

    const handled = await (
      TaskExecutor as Any
    ).prototype.maybeAutoApplyConfiguredTaskSkill.call(executor);

    expect(handled).toBe(true);
    expect(executor.emitEvent).toHaveBeenCalledWith(
      "tool_result",
      expect.objectContaining({
        tool: "Skill",
        result: expect.objectContaining({
          success: false,
          nonBlocking: true,
          recoverableFallback: true,
          fallback: "continue_without_skill",
        }),
      }),
    );
    expect(executor.emitEvent).toHaveBeenCalledWith(
      "skill_invocation_fallback",
      expect.objectContaining({
        skillId: "stock-analysis",
        fallback: "continue_without_skill",
      }),
    );
    expect(executor.taskContextNotes).toEqual([
      expect.stringContaining("Continue the original task with the standard tools"),
    ]);
    expect(executor.taskContextNotes).not.toEqual([
      expect.stringContaining("already active as hidden task context"),
    ]);
  });

  it("auto-applies explicitly requested hyphenated skill ids from the task prompt", async () => {
    listSkills.mockReturnValue([
      {
        id: "imagegen-frontend-web",
        name: "Imagegen Frontend Web",
        description: "Generate frontend website section reference images.",
        enabled: true,
      },
    ]);

    const prompt =
      "Use imagegen-frontend-web skill and with that skill generate images for a website.";
    const executor = createExecutor(prompt);
    executor.toolRegistry.executeTool.mockImplementation(async (name: string, input: Any) => {
      expect(name).toBe("Skill");
      expect(input).toEqual({
        skill: "imagegen-frontend-web",
        args: "",
        trigger: "explicit_hint",
      });
      const invocationId = "skill-invocation-imagegen";
      executor.__resolvedInvocations.set(invocationId, {
        skillId: "imagegen-frontend-web",
        skillName: "Imagegen Frontend Web",
        trigger: "explicit_hint",
        args: "",
        parameters: {},
        content: "Expanded imagegen frontend web instructions",
        reason: "Applied as additive skill context while preserving the original task.",
        appliedAt: Date.now(),
      });
      return {
        success: true,
        skill: "imagegen-frontend-web",
        skill_name: "Imagegen Frontend Web",
        skill_invocation_id: invocationId,
        message: "Loaded skill 'Imagegen Frontend Web' for this task.",
      };
    });

    const handled = await (
      TaskExecutor as Any
    ).prototype.maybeAutoApplyExplicitSkillInvocation.call(
      executor,
      executor.task.prompt,
      "task",
      "the explicitly requested task skill",
    );

    expect(handled).toBe(true);
    expect(executor.appliedSkills).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          skillId: "imagegen-frontend-web",
          skillName: "Imagegen Frontend Web",
          trigger: "explicit_hint",
          content: "Expanded imagegen frontend web instructions",
        }),
      ]),
    );
  });

  it("blocks code review skill invocation in a temporary workspace", async () => {
    const executor = createExecutor("/review all uncommitted fixes");
    executor.workspace = {
      ...executor.workspace,
      id: "__temp_workspace__",
      name: "Temporary Workspace",
      isTemp: true,
    };

    await expect(
      (TaskExecutor as Any).prototype.executeSkillInvocation.call(
        executor,
        "code-reviewer",
        "all uncommitted fixes",
        "/review",
        "slash",
      ),
    ).rejects.toThrow("requires a regular workspace");

    expect(executor.toolRegistry.executeTool).not.toHaveBeenCalled();
  });

  it("deterministically routes natural research-vault prompts into llm-wiki", async () => {
    listSkills.mockReturnValue([
      {
        id: "llm-wiki",
        name: "LLM Wiki",
        description: "Build and maintain a persistent research vault.",
        enabled: true,
        parameters: [
          { name: "objective", type: "string", required: false, default: "" },
          { name: "mode", type: "string", required: false, default: "auto" },
          { name: "path", type: "string", required: false, default: "research/wiki" },
          { name: "obsidian", type: "string", required: false, default: "auto" },
        ],
      },
    ]);

    const prompt = "Build a persistent Obsidian-friendly research vault for agent memory systems.";
    const executor = createExecutor(prompt);
    executor.toolRegistry.executeTool.mockImplementation(async (name: string, input: Any) => {
      expect(name).toBe("Skill");
      expect(input).toEqual({
        skill: "llm-wiki",
        args: '"agent memory systems" --obsidian on',
        trigger: "explicit_hint",
      });
      const invocationId = "skill-invocation-llm-wiki";
      executor.__resolvedInvocations.set(invocationId, {
        skillId: "llm-wiki",
        skillName: "LLM Wiki",
        trigger: "explicit_hint",
        args: '"agent memory systems" --obsidian on',
        parameters: {
          objective: "agent memory systems",
          obsidian: "on",
        },
        content: "Expanded llm-wiki instructions",
        reason: "Applied as additive skill context while preserving the original task.",
        appliedAt: Date.now(),
      });
      return {
        success: true,
        skill: "llm-wiki",
        skill_name: "LLM Wiki",
        skill_invocation_id: invocationId,
        message: "Loaded skill 'LLM Wiki' for this task.",
      };
    });

    const handled = await (
      TaskExecutor as Any
    ).prototype.maybeHandleNaturalLlmWikiPrompt.call(executor);

    expect(handled).toBe(true);
    expect(executor.appliedSkills).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          skillId: "llm-wiki",
          trigger: "explicit_hint",
          parameters: expect.objectContaining({
            objective: "agent memory systems",
            obsidian: "on",
          }),
        }),
      ]),
    );
  });

  it("routes starter-style research-vault prompts even before the user supplies a topic", async () => {
    listSkills.mockReturnValue([
      {
        id: "llm-wiki",
        name: "LLM Wiki",
        description: "Build and maintain a persistent research vault.",
        enabled: true,
        parameters: [
          { name: "objective", type: "string", required: false, default: "" },
          { name: "mode", type: "string", required: false, default: "auto" },
          { name: "path", type: "string", required: false, default: "research/wiki" },
          { name: "obsidian", type: "string", required: false, default: "auto" },
        ],
      },
    ]);
    getSkill.mockReturnValue({
      id: "llm-wiki",
      name: "LLM Wiki",
      description: "Build and maintain a persistent research vault.",
      parameters: [
        {
          name: "objective",
          type: "string",
          description: "The topic, question, or research objective for the wiki run",
          required: false,
        },
      ],
    });

    const prompt =
      "Build a persistent Obsidian-friendly research vault in this workspace. If I have not given the topic yet, ask me for it first.";
    const executor = createExecutor(prompt);

    const handled = await (
      TaskExecutor as Any
    ).prototype.maybeHandleNaturalLlmWikiPrompt.call(executor);

    expect(handled).toBe(true);
    expect(executor.toolRegistry.executeTool).not.toHaveBeenCalled();
    expect(executor.appliedSkills).toEqual([]);
    expect(executor.__runtime.pending).toEqual(
      expect.objectContaining({
        skillId: "llm-wiki",
        skillName: "LLM Wiki",
        trigger: "explicit_hint",
        parameters: {
          obsidian: "on",
        },
        requiredParameterNames: ["objective"],
        currentParameterIndex: 0,
      }),
    );
    expect(executor.daemon.updateTask).toHaveBeenCalledWith(
      "task-skill-route-1",
      expect.objectContaining({
        status: "paused",
        awaitingUserInputReasonCode: "skill_parameters",
      }),
    );
    expect(executor.emitEvent).toHaveBeenCalledWith(
      "assistant_message",
      expect.objectContaining({
        message: expect.stringContaining("Reply with objective"),
      }),
    );
  });

  it("does not auto-apply a skill from planner tool transcript text embedded in a step", async () => {
    listSkills.mockReturnValue([
      {
        id: "twitter",
        name: "Twitter / X Writer",
        description: "Write optimized X content.",
        enabled: true,
      },
    ]);

    const executor = createExecutor("Research AI agent trends.");
    executor.currentStepId = "step-1";

    const handled = await (
      TaskExecutor as Any
    ).prototype.maybeAutoApplyExplicitSkillInvocation.call(
      executor,
      [
        "I'll create an execution plan for researching daily AI agent trends across Reddit, X, and tech news sources.",
        "<minimax:tool_call>",
        "task_list_create",
        'goal: "Complete Daily AI Agent Trends Research"',
        '{ ActiveForm: "Searching X/Twitter for AI agent trends" }',
      ].join("\n"),
      "step",
      "the skill requested by step",
    );

    expect(handled).toBe(false);
    expect(executor.toolRegistry.executeTool).not.toHaveBeenCalled();
    expect(executor.appliedSkills).toEqual([]);
  });

  it("does not auto-apply a skill from unrelated activation and skill words inside pasted content", async () => {
    listSkills.mockReturnValue([
      {
        id: "learn",
        name: "Learn",
        description: "Record a durable insight.",
        enabled: true,
        parameters: [{ name: "what", type: "string", required: true }],
      },
    ]);

    const executor = createExecutor("Summarize this article.");

    const handled = await (
      TaskExecutor as Any
    ).prototype.maybeAutoApplyExplicitSkillInvocation.call(
      executor,
      [
        "I need 3-4 diagrams to be added to this article in related places, write me text to image prompts for each so that I can create them one by one.",
        "",
        "You can swap providers, change models, or run local models.",
        "A lot of agent systems learn only from success stories.",
      ].join("\n"),
      "task",
      "the explicitly requested task skill",
    );

    expect(handled).toBe(false);
    expect(executor.toolRegistry.executeTool).not.toHaveBeenCalled();
    expect(executor.appliedSkills).toEqual([]);
  });

  it("does not auto-apply explicit skills that require mandatory parameters", async () => {
    listSkills.mockReturnValue([
      {
        id: "learn",
        name: "Learn",
        description: "Record a durable insight.",
        enabled: true,
        parameters: [{ name: "what", type: "string", required: true }],
      },
    ]);

    const executor = createExecutor("Use the learn skill for this request.");

    const handled = await (
      TaskExecutor as Any
    ).prototype.maybeAutoApplyExplicitSkillInvocation.call(
      executor,
      executor.task.prompt,
      "task",
      "the explicitly requested task skill",
    );

    expect(handled).toBe(false);
    expect(executor.toolRegistry.executeTool).not.toHaveBeenCalled();
    expect(executor.appliedSkills).toEqual([]);
  });
});
