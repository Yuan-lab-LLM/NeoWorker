import { beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { TaskExecutor } from "../executor";
import {
  buildCompletionContract,
  buildCompletionGuidancePrompt,
  detectReadOnlyConstraint,
  extractExplicitOutputExtensions,
  getExplicitArtifactToolNames,
  getFinalOutcomeGuardError,
  hasArtifactEvidence,
  responseHasExecutionReportEvidenceSignal,
} from "../executor-completion-utils";

type HarnessOptions = {
  prompt: string;
  rawPrompt?: string;
  title?: string;
  lastOutput: string;
  createdFiles?: string[];
  planStepDescription?: string;
  source?: "manual" | "cron" | "hook" | "api";
};

function createExecuteHarness(options: HarnessOptions) {
  const executor = Object.create(TaskExecutor.prototype) as Any;
  const stepDescription = options.planStepDescription || "Do the task";

  executor.task = {
    id: "task-1",
    title: options.title || "Test task",
    prompt: options.prompt,
    ...(options.rawPrompt ? { rawPrompt: options.rawPrompt } : {}),
    createdAt: Date.now() - 1000,
    currentAttempt: 0,
    maxAttempts: 1,
    ...(options.source ? { source: options.source } : {}),
  };
  executor.workspace = {
    id: "workspace-1",
    path: "/tmp",
    isTemp: false,
    permissions: {
      read: true,
      write: true,
      delete: true,
      network: true,
      shell: true,
    },
  };
  executor.daemon = {
    logEvent: vi.fn(),
    updateTaskStatus: vi.fn(),
    updateTask: vi.fn(),
    completeTask: vi.fn(),
    getTaskEvents: vi.fn().mockReturnValue([]),
    handleTransientTaskFailure: vi.fn().mockReturnValue(false),
    dispatchMentionedAgents: vi.fn(),
    getAgentRoleById: vi.fn().mockReturnValue(null),
  };
  executor.toolRegistry = {
    cleanup: vi.fn(async () => undefined),
  };
  executor.fileOperationTracker = {
    getCreatedFiles: vi.fn().mockReturnValue(options.createdFiles || []),
    getKnowledgeSummary: vi.fn().mockReturnValue(""),
  };
  executor.contextManager = {
    getAvailableTokens: vi.fn().mockReturnValue(1000000),
    compactMessagesWithMeta: vi.fn((messages: Any) => ({
      messages,
      meta: { kind: "none" },
    })),
  };
  executor.provider = { createMessage: vi.fn() };
  executor.abortController = new AbortController();
  executor.cancelled = false;
  executor.waitingForUserInput = false;
  executor.requiresTestRun = false;
  executor.testRunObserved = false;
  executor.testRunSuccessful = false;
  executor.requiresVisualQARun = false;
  executor.visualQARunObserved = false;
  executor.partialSuccessForCronEnabled = true;
  executor.shouldPauseForRequiredDecision = true;
  executor.taskCompleted = false;
  executor.lastAssistantOutput = options.lastOutput;
  executor.lastNonVerificationOutput = options.lastOutput;
  executor.lastAssistantText = options.lastOutput;
  executor.saveConversationSnapshot = vi.fn();
  executor.maybeHandleScheduleSlashCommand = vi.fn(async () => false);
  executor.isCompanionPrompt = vi.fn().mockReturnValue(false);
  executor.analyzeTask = vi.fn(async () => ({}));
  executor.dispatchMentionedAgentsAfterPlanning = vi.fn(async () => undefined);
  executor.verifySuccessCriteria = vi.fn(async () => ({
    success: true,
    message: "ok",
  }));
  executor.isTransientProviderError = vi.fn().mockReturnValue(false);
  executor.executePlan = vi.fn(async function executePlanStub(this: Any) {
    const current = this.plan?.steps?.[0];
    if (current) {
      current.status = "completed";
      current.completedAt = Date.now();
    }
  });
  executor.createPlan = vi.fn(async function createPlanStub(this: Any) {
    this.plan = {
      description: "Plan",
      steps: [
        {
          id: "1",
          description: stepDescription,
          status: "pending",
        },
      ],
    };
  });

  return executor as TaskExecutor & {
    daemon: {
      logEvent: ReturnType<typeof vi.fn>;
      updateTaskStatus: ReturnType<typeof vi.fn>;
      updateTask: ReturnType<typeof vi.fn>;
      completeTask: ReturnType<typeof vi.fn>;
      getTaskEvents: ReturnType<typeof vi.fn>;
    };
  };
}

function writeOfficeEvidence(
  workspacePath: string,
  relativePath: string,
  requiredPart: string,
): string {
  const outputPath = path.join(workspacePath, relativePath);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(
    outputPath,
    Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x03, 0x04]),
      Buffer.from(`[Content_Types].xml\0${requiredPart}\0`),
      Buffer.alloc(1024),
    ]),
  );
  return outputPath;
}

describe("TaskExecutor completion contract integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("recognizes Chinese Word artifact requests", () => {
    expect(extractExplicitOutputExtensions("", "生成word文件，对比报告")).toEqual([".docx"]);
    expect(extractExplicitOutputExtensions("", "生成对比报告，Word")).toEqual([".docx"]);

    const contract = buildCompletionContract({
      taskTitle: "",
      taskPrompt: "生成对比报告，Word",
      requiresDirectAnswer: false,
      requiresDecisionSignal: false,
      isWatchSkipRecommendationTask: false,
    });

    expect(contract.requiresArtifactEvidence).toBe(true);
    expect(contract.requiredArtifactExtensions).toEqual([".docx"]);
    expect(contract.artifactKind).toBe("file");
  });

  it("rejects empty or mislabeled Word evidence before completion", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "neoworker-word-gate-"));
    const emptyPath = path.join(tempDir, "empty.docx");
    const markdownPath = path.join(tempDir, "renamed.docx");
    const packagePath = path.join(tempDir, "report.docx");
    fs.writeFileSync(emptyPath, "");
    fs.writeFileSync(markdownPath, "# not a Word document");
    const packageBytes = Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x03, 0x04]),
      Buffer.from("[Content_Types].xml\0word/document.xml\0"),
      Buffer.alloc(1024),
    ]);
    fs.writeFileSync(packagePath, packageBytes);

    const executor = createExecuteHarness({
      prompt: "生成word文件",
      lastOutput: "Word 文件已生成。",
    }) as Any;
    executor.workspace.path = tempDir;
    const contract = executor.buildCompletionContract();

    expect(executor.isUsableArtifactEvidencePath(emptyPath)).toBe(false);
    expect(executor.isUsableArtifactEvidencePath(markdownPath)).toBe(false);
    expect(executor.isUsableArtifactEvidencePath(packagePath)).toBe(true);
    expect(
      executor.getMissingArtifactExtensions(contract, [emptyPath, markdownPath]),
    ).toEqual([".docx"]);
    expect(
      executor.getMissingArtifactExtensions(contract, [packagePath]),
    ).toEqual([]);

    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("appends a concrete DOCX creation step when a generated plan omits delivery", () => {
    const executor = createExecuteHarness({
      title: "半年总结",
      prompt: "基于附件生成word文件",
      lastOutput: "",
    });
    const result = (executor as Any).ensureRequiredPlanSteps({
      description: "Execution plan",
      steps: [
        {
          id: "1",
          description: "分析附件中的总结与规划内容",
          kind: "primary",
          status: "pending",
        },
      ],
    });

    expect(result.steps).toHaveLength(2);
    expect(result.steps[1]).toEqual(
      expect.objectContaining({
        kind: "primary",
        status: "pending",
        description: expect.stringContaining('create_document（format="docx"）'),
      }),
    );
  });

  it("replaces bare PDF and Excel deliverable headings with executable file steps", () => {
    const executor = createExecuteHarness({
      title: "例会汇总",
      prompt: "基于三份附件生成 PDF 和 Excel 文档",
      lastOutput: "",
    });
    const result = (executor as Any).sanitizePlan(
      {
        description: "Execution plan",
        steps: [
          {
            id: "1",
            description: "**Excel 工作簿（.xlsx）**：结构化例会数据表。",
            kind: "primary",
            status: "pending",
          },
          {
            id: "2",
            description: "**PDF 报告**：三场例会的汇总文档。",
            kind: "primary",
            status: "pending",
          },
          {
            id: "3",
            description: "读取并解析三份会议纪要附件",
            kind: "primary",
            status: "pending",
          },
          {
            id: "4",
            description: "提取每份材料的会议日期、项目和行动项",
            kind: "primary",
            status: "pending",
          },
        ],
      },
      { enforceInitialStepLimit: true },
    );

    expect(result.steps).toHaveLength(4);
    expect(result.steps[0].description).toContain("读取并解析");
    expect(result.steps[1].description).toContain("提取每份材料");
    expect(result.steps[2].description).toContain("create_spreadsheet");
    expect(result.steps[2].description).not.toContain("scratchpad 代替");
    expect(result.steps[3].description).toContain(
      'create_document（format="pdf"）',
    );
    expect(result.steps[3].description).toContain("全部来源");
    expect(result.steps.every((step: Any) => !step.compactedFromSteps)).toBe(
      true,
    );
  });

  it("requires every explicitly requested artifact format", () => {
    const prompt = "基于内容，分别生成word和PDF文档";
    expect(extractExplicitOutputExtensions("", prompt)).toEqual([
      ".docx",
      ".pdf",
    ]);

    const contract = buildCompletionContract({
      taskTitle: "",
      taskPrompt: prompt,
      requiresDirectAnswer: false,
      requiresDecisionSignal: false,
      isWatchSkipRecommendationTask: false,
    });

    expect(contract.requiredArtifactExtensions).toEqual([".docx", ".pdf"]);
    expect(
      hasArtifactEvidence({ contract, createdFiles: ["report.docx"] }),
    ).toBe(false);
    expect(
      hasArtifactEvidence({
        contract,
        createdFiles: ["report.docx", "report.pdf"],
      }),
    ).toBe(true);
  });

  it("recognizes 生动PDF文档 as an explicit PDF deliverable", () => {
    const prompts = [
      "基于材料内容，生动PDF文档",
      "基于材料内容，生动 PDF 文档",
      "请给我一份生动pdf报告",
    ];
    for (const prompt of prompts) {
      expect(extractExplicitOutputExtensions("", prompt)).toEqual([".pdf"]);
      expect(getExplicitArtifactToolNames("", prompt)).toEqual([
        "create_document",
        "generate_document",
      ]);
    }

    const contract = buildCompletionContract({
      taskTitle: prompts[0],
      taskPrompt: prompts[0],
      requiresDirectAnswer: false,
      requiresDecisionSignal: false,
      isWatchSkipRecommendationTask: false,
    });

    expect(contract.requiredArtifactExtensions).toEqual([".pdf"]);
  });

  it("does not mistake pdf wording inside an xlsx filename for PDF delivery", () => {
    const executor = createExecuteHarness({
      title: "基于材料内容，分别生成excel、PDF文档",
      prompt: "基于材料内容，分别生成excel、PDF文档",
      lastOutput: "",
    });
    const result = (executor as Any).sanitizePlan(
      {
        description: "Execution plan",
        steps: [
          ...Array.from({ length: 6 }, (_, index) => ({
            id: String(index + 1),
            description: `整理第 ${index + 1} 组来源数据`,
            kind: "primary" as const,
            status: "pending" as const,
          })),
          {
            id: "7",
            description:
              "根据用户要求，调用 create_spreadsheet 创建最终 Excel 工作簿 `.neoworker/基于材料内容_分别生成excel_pdf文档.xlsx` 并交付。",
            kind: "primary",
            status: "pending",
          },
        ],
      },
      { enforceInitialStepLimit: true },
    );

    const spreadsheetSteps = result.steps.filter((step: Any) =>
      step.description.includes("create_spreadsheet"),
    );
    const pdfSteps = result.steps.filter((step: Any) =>
      step.description.includes('create_document（format="pdf"）'),
    );
    expect(spreadsheetSteps).toHaveLength(1);
    expect(pdfSteps).toHaveLength(1);
    expect(spreadsheetSteps[0].id).not.toBe(pdfSteps[0].id);
    expect(result.steps).toHaveLength(5);
  });

  it("adds one bounded recovery step for a required artifact omitted at execution", () => {
    const executor = createExecuteHarness({
      title: "基于材料内容，分别生成excel、PDF文档",
      prompt: "基于材料内容，分别生成excel、PDF文档",
      lastOutput: "Excel 已生成",
    }) as Any;
    executor.plan = {
      description: "Execution plan",
      steps: [
        {
          id: "1",
          description: executor.buildXlsxArtifactPlanStepDescription(),
          kind: "primary",
          status: "completed",
        },
      ],
    };
    executor.getAllArtifactEvidencePaths = vi
      .fn()
      .mockReturnValue([".neoworker/report.xlsx"]);
    executor.getMissingArtifactExtensions = vi
      .fn()
      .mockReturnValue([".pdf"]);

    expect(executor.appendMissingArtifactRecoveryStepsIfNeeded()).toBe(true);
    expect(executor.plan.steps).toHaveLength(2);
    expect(executor.plan.steps[1]).toEqual(
      expect.objectContaining({
        kind: "recovery",
        status: "pending",
        description: expect.stringContaining(
          'create_document（format="pdf"）',
        ),
      }),
    );
    expect(executor.appendMissingArtifactRecoveryStepsIfNeeded()).toBe(false);
  });

  it("recognizes terse Chinese and English HTML artifact requests", () => {
    expect(extractExplicitOutputExtensions("", "生成一个html")).toEqual([".html"]);
    expect(extractExplicitOutputExtensions("", "生成一个网页")).toEqual([".html"]);
    expect(extractExplicitOutputExtensions("", "Create an HTML page")).toEqual([".html"]);

    for (const taskPrompt of ["生成一个html", "生成一个网页", "Create an HTML page"]) {
      const contract = buildCompletionContract({
        taskTitle: "",
        taskPrompt,
        requiresDirectAnswer: false,
        requiresDecisionSignal: false,
        isWatchSkipRecommendationTask: false,
      });

      expect(contract.requiresArtifactEvidence).toBe(true);
      expect(contract.requiredArtifactExtensions).toEqual([".html"]);
      expect(contract.artifactKind).toBe("file");
    }
  });

  it("recognizes Chinese HTML presentation-form wording as an artifact request", () => {
    expect(
      extractExplicitOutputExtensions(
        "钱学森弹道动画",
        "内容以 HTML 形式展现运行，使用 Three.js 制作 3D 模拟。",
      ),
    ).toContain(".html");
  });

  it("uses a deterministic artifact plan for an interactive HTML request", () => {
    const executor = createExecuteHarness({
      title: "钱学森弹道动画",
      prompt:
        "请以动画形式介绍钱学森弹道，内容以 HTML 形式展现运行，使用 Three.js 制作 3D 模拟。",
      lastOutput: "",
    });
    (executor as Any).task.agentConfig = {
      executionMode: "execute",
      conversationMode: "task",
      taskIntent: "execution",
    };

    const plan = (executor as Any).buildDirectHtmlArtifactPlan();

    expect(plan.steps).toHaveLength(2);
    expect(plan.steps[0]).toEqual(
      expect.objectContaining({
        kind: "primary",
        description: expect.stringContaining(".html"),
      }),
    );
    expect(plan.steps[1]).toEqual(
      expect.objectContaining({
        kind: "verification",
        description: expect.stringContaining("in a browser"),
      }),
    );
    expect(plan.steps[0].description).toContain("exactly one usable .html file");
    expect((executor as Any).resolveVerificationModeForStep(plan.steps[1])).toBe(
      "browser_session",
    );
  });

  it("keys incremental edits by anchor instead of treating the whole HTML file as done", () => {
    const executor = createExecuteHarness({
      prompt: "生成一个 HTML 动画页面",
      lastOutput: "",
    });

    const physicsKey = (executor as Any).buildMutationGuardKey("edit_file", {
      file_path: "lesson.html",
      old_string: "<!-- ##PHYSICS## -->",
      new_string: "<section>物理小课堂</section>",
    });
    const scriptsKey = (executor as Any).buildMutationGuardKey("edit_file", {
      file_path: "lesson.html",
      old_string: "<!-- ##SCRIPTS## -->",
      new_string: "<script>start()</script>",
    });

    expect(physicsKey).not.toBe(scriptsKey);
    expect(physicsKey).toContain("anchor:");
    expect(scriptsKey).toContain("anchor:");
  });

  it("appends a final HTML delivery step to a research-only plan", () => {
    const executor = createExecuteHarness({
      title: "AI Coding 商业模式演变研究",
      prompt:
        "做一个深度研究，分析 AI Coding 行业从 2023 年至今的商业模式演变，生成 HTML 格式文档。",
      lastOutput: "",
    });
    (executor as Any).task.agentConfig = {
      executionMode: "execute",
      conversationMode: "chat",
      taskIntent: "chat",
    };
    const plan = {
      description: "Execution plan",
      steps: [
        {
          id: "1",
          description: "研究 2023 年商业化验证阶段",
          kind: "primary",
          status: "pending",
        },
        {
          id: "2",
          description: "梳理 2024 年关键转折点",
          kind: "primary",
          status: "pending",
        },
      ],
    };

    const result = (executor as Any).ensureRequiredPlanSteps(plan);

    expect(result.steps).toHaveLength(4);
    expect(result.steps[2]).toEqual(
      expect.objectContaining({
        kind: "primary",
        status: "pending",
        description: expect.stringContaining(".html"),
      }),
    );
    expect(result.steps[2].description).toContain("exactly one usable .html file");
    expect(result.steps[2].description).toContain("ai_coding_商业模式演变研究.html");
    expect(result.steps[3]).toEqual(
      expect.objectContaining({ kind: "verification", status: "pending" }),
    );
  });

  it("does not append a duplicate HTML step when the plan already owns delivery", () => {
    const executor = createExecuteHarness({
      title: "AI Coding research",
      prompt: "Research the market and generate an HTML report.",
      lastOutput: "",
    });
    const plan = {
      description: "Execution plan",
      steps: [
        {
          id: "1",
          description:
            "Assemble and write the final HTML report `ai-coding-report.html`, then verify it opens.",
          kind: "primary",
          status: "pending",
        },
      ],
    };

    const result = (executor as Any).ensureRequiredPlanSteps(plan);

    expect(result.steps).toHaveLength(2);
    expect(result.steps[1]).toEqual(
      expect.objectContaining({ kind: "verification", status: "pending" }),
    );
  });

  it("repairs a persisted research-only plan when it is restored", () => {
    const executor = createExecuteHarness({
      title: "AI Coding 商业模式演变研究",
      prompt: "完成深度研究并生成 html 格式文档",
      lastOutput: "",
    });
    (executor as Any).task.agentConfig = {
      executionMode: "execute",
      conversationMode: "chat",
      taskIntent: "chat",
    };

    (executor as Any).setPlan({
      description: "Persisted research plan",
      steps: [
        {
          id: "10",
          description: "完成 2025 年 Agent 商业模式研究",
          kind: "primary",
          status: "completed",
        },
      ],
    });

    expect((executor as Any).plan.steps).toHaveLength(3);
    expect((executor as Any).plan.steps[1]).toEqual(
      expect.objectContaining({
        status: "pending",
        description: expect.stringContaining(".html"),
      }),
    );
    expect((executor as Any).plan.steps[2]).toEqual(
      expect.objectContaining({ kind: "verification", status: "pending" }),
    );
  });

  it("does not report timeout recovery success when a required HTML file is missing", async () => {
    const executor = createExecuteHarness({
      title: "生成 HTML 动画",
      prompt: "生成一个 HTML 文件并使用 Three.js 展示动画。",
      lastOutput: "# 动画\n\n**",
      createdFiles: [],
    });
    (executor as Any).task.agentConfig = {
      executionMode: "execute",
      conversationMode: "task",
      taskIntent: "execution",
    };

    const recovered = await (executor as Any).finalizeWithTimeoutRecovery(
      new Error("Plan creation timed out after 120s"),
    );

    expect(recovered).toBe(false);
    expect(executor.daemon.completeTask).not.toHaveBeenCalled();
  });

  it.each(["chat", "plan", "analyze"] as const)(
    "promotes an artifact follow-up from %s mode to executable mode",
    (executionMode) => {
    const executor = createExecuteHarness({
      prompt: "先讨论页面结构",
      lastOutput: "可以继续。",
    });
    (executor as Any).task.agentConfig = {
      executionMode,
      executionModeSource: executionMode === "chat" ? "user" : "strategy",
      conversationMode: executionMode === "chat" ? "chat" : "task",
      taskIntent: executionMode === "plan" ? "planning" : executionMode === "analyze" ? "advice" : "chat",
    };
    (executor as Any).systemPrompt = "old chat prompt";
    (executor as Any).updateTaskAgentConfig = vi.fn(function updateConfig(
      this: Any,
      agentConfig: Any,
    ) {
      this.task.agentConfig = agentConfig;
    });
    (executor as Any).emitEvent = vi.fn();
    const contract = (executor as Any).buildFollowUpCompletionContract("生成一个html");

    const promoted = (executor as Any).promoteFollowUpExecutionModeForArtifact(
      "生成一个html",
      contract,
    );

    expect(promoted).toBe(true);
    expect((executor as Any).task.agentConfig).toEqual(
      expect.objectContaining({
        executionMode: "execute",
        executionModeSource: "auto_promote",
        taskIntent: "execution",
      }),
    );
    expect((executor as Any).systemPrompt).toBe("");
    expect(executor.daemon.updateTask).toHaveBeenCalledWith(
      "task-1",
      expect.objectContaining({
        agentConfig: expect.objectContaining({ executionMode: "execute" }),
      }),
    );
    expect((executor as Any).emitEvent).toHaveBeenCalledWith(
      "execution_mode_auto_promoted",
      expect.objectContaining({ reason: "follow_up_requires_artifact" }),
    );
    },
  );

  it("does not accept an HTML follow-up until a new HTML file exists", () => {
    const executor = createExecuteHarness({
      prompt: "先讨论页面结构",
      lastOutput: "页面已生成。",
      createdFiles: [],
    });
    const contract = (executor as Any).buildFollowUpCompletionContract("生成一个html");

    const error = (executor as Any).getFollowUpArtifactGuardError(
      contract,
      Date.now() - 100,
      new Set<string>(),
    );

    expect(error).toContain("expected a newly created or updated .html artifact");
    expect(
      (executor as Any).buildFollowUpTurnGuidancePrompt("生成一个html"),
    ).toContain("convert_markdown_to_html");
    expect(
      (executor as Any).buildFollowUpArtifactRetryInstruction(contract),
    ).toContain("convert_markdown_to_html");
  });

  it("inherits the original HTML contract for an incomplete repair follow-up", () => {
    const executor = createExecuteHarness({
      title: "钱学森弹道动画",
      prompt:
        "生成 HTML 页面，使用 Three.js 和 JavaScript 动画模拟钱学森弹道轨迹。",
      lastOutput: "页面已生成。",
    });

    const contract = (executor as Any).buildFollowUpCompletionContract(
      "生成得不完整啊！",
    );

    expect(contract.requiresArtifactEvidence).toBe(true);
    expect(contract.requiredArtifactExtensions).toContain(".html");
  });

  it("keeps an Excel continuation scoped to Excel when attachment text mentions PPT", () => {
    const workspacePath = fs.mkdtempSync(
      path.join(os.tmpdir(), "neoworker-xlsx-continuation-"),
    );
    const outputPath = writeOfficeEvidence(
      workspacePath,
      "AI-HPC例会台账.xlsx",
      "xl/workbook.xml",
    );
    const prompt = `基于材料内容，生成excel

Attached files (relative to workspace):
- meeting.docx (.neoworker/uploads/meeting.docx)
  Attachment metadata: mime=application/vnd.openxmlformats-officedocument.wordprocessingml.document
  Extracted content:
  [[ATTACHMENT_EXTRACTED_CONTENT_START]]
  已完成方案PPT，后续继续制作演示文稿。
  [[ATTACHMENT_EXTRACTED_CONTENT_END]]`;
    const executor = createExecuteHarness({
      title: "基于材料内容，生成excel",
      prompt,
      rawPrompt: prompt,
      lastOutput: "Excel 已生成。",
      createdFiles: [outputPath],
    });
    (executor as Any).workspace.path = workspacePath;
    (executor as Any).emitEvent = vi.fn();

    const rootContract = (executor as Any).buildCompletionContract();
    const followUpContract = (executor as Any).buildFollowUpCompletionContract("继续");

    expect(rootContract.requiredArtifactExtensions).toEqual([".xlsx"]);
    expect((executor as Any).inferRequiredArtifactExtensions()).toEqual([".xlsx"]);
    expect(followUpContract.requiredArtifactExtensions).toEqual([".xlsx"]);
    expect(followUpContract.allowExistingArtifactEvidence).toBe(true);
    expect(
      (executor as Any).getFollowUpArtifactGuardError(
        followUpContract,
        Date.now(),
        new Set([outputPath]),
      ),
    ).toBeNull();
    fs.rmSync(workspacePath, { recursive: true, force: true });
  });

  it("drops a stale recovered PPT requirement from an Excel continuation", () => {
    const executor = createExecuteHarness({
      title: "生成excel",
      prompt: "基于材料内容，生成excel",
      rawPrompt: "基于材料内容，生成excel",
      lastOutput: "Excel 已生成。",
    });
    (executor as Any).emitEvent = vi.fn();
    const contract = (executor as Any).buildFollowUpCompletionContract("继续");

    const reconciled = (executor as Any).reconcileRecoveredFollowUpCompletionContract(
      contract,
      [".xlsx", ".pptx"],
    );

    expect(reconciled.requiredArtifactExtensions).toEqual([".xlsx"]);
    expect((executor as Any).emitEvent).toHaveBeenCalledWith(
      "log",
      expect.objectContaining({
        reason: "stale_recovered_artifact_contract",
        droppedExtensions: [".pptx"],
      }),
    );
  });

  it("reports only the actually missing format for multi-artifact follow-ups", () => {
    const workspacePath = fs.mkdtempSync(
      path.join(os.tmpdir(), "neoworker-pptx-follow-up-"),
    );
    const outputPath = writeOfficeEvidence(
      workspacePath,
      "report.pptx",
      "ppt/presentation.xml",
    );
    const executor = createExecuteHarness({
      prompt: "先整理材料",
      lastOutput: "材料已整理。",
      createdFiles: [outputPath],
    });
    (executor as Any).workspace.path = workspacePath;
    const contract = buildCompletionContract({
      taskTitle: "",
      taskPrompt: "分别生成 Excel 和 PPT 文件",
      requiresDirectAnswer: false,
      requiresDecisionSignal: false,
      isWatchSkipRecommendationTask: false,
    });
    executor.daemon.getTaskEvents.mockReturnValue([
      {
        timestamp: Date.now(),
        type: "artifact_created",
        payload: { path: outputPath },
      },
    ]);

    const error = (executor as Any).getFollowUpArtifactGuardError(
      contract,
      Date.now() - 100,
      new Set<string>(),
    );

    expect(error).toContain("updated .xlsx artifact");
    expect(error).not.toContain(".xlsx, .pptx");
    fs.rmSync(workspacePath, { recursive: true, force: true });
  });

  it("rejects an updated HTML follow-up artifact while script placeholders remain", () => {
    const workspacePath = fs.mkdtempSync(
      path.join(os.tmpdir(), "neoworker-html-guard-"),
    );
    const outputPath = path.join(workspacePath, "lesson.html");
    fs.writeFileSync(
      outputPath,
      '<!doctype html><html><body><canvas></canvas><!-- ##SCRIPTS## --></body></html>',
      "utf8",
    );

    const executor = createExecuteHarness({
      title: "钱学森弹道动画",
      prompt:
        "生成 HTML 页面，使用 Three.js 和 JavaScript 动画模拟钱学森弹道轨迹。",
      lastOutput: "页面已生成。",
      createdFiles: ["lesson.html"],
    });
    (executor as Any).workspace.path = workspacePath;
    executor.daemon.getTaskEvents.mockReturnValue([
      {
        timestamp: Date.now(),
        type: "file_modified",
        payload: { path: "lesson.html" },
      },
    ]);
    (executor as Any).emitEvent = vi.fn();

    const contract = (executor as Any).buildFollowUpCompletionContract(
      "生成得不完整啊！",
    );
    const error = (executor as Any).getFollowUpArtifactGuardError(
      contract,
      Date.now() - 100,
      new Set<string>(),
    );

    expect(error).toContain("HTML artifact is incomplete");
    expect(error).toContain("unresolved staging placeholders");
  });

  it("rejects a structurally valid HTML conversion that omits later source documents", () => {
    const workspacePath = fs.mkdtempSync(
      path.join(os.tmpdir(), "neoworker-html-source-coverage-"),
    );
    const outputPath = path.join(workspacePath, "meetings.html");
    fs.writeFileSync(
      outputPath,
      `<!doctype html><html><body>
        <nav>2026/06/13 · 2026/06/26 · 2026/07/05</nav>
        <section>2026/06/13 第一份纪要</section>
      </body></html>`,
      "utf8",
    );
    const prompt = `基于附件生成 PDF

Attached files (relative to workspace):
- 例会-20260613.docx (.neoworker/uploads/例会-20260613.docx)
- 例会-20260626.docx (.neoworker/uploads/例会-20260626.docx)
- 例会-20260705.docx (.neoworker/uploads/例会-20260705.docx)
[[ATTACHMENT_EXTRACTED_CONTENT_START]]
业务说明里出现点击和运行，但用户没有要求网页交互。
[[ATTACHMENT_EXTRACTED_CONTENT_END]]`;
    const executor = createExecuteHarness({
      title: "基于附件生成 PDF",
      prompt,
      rawPrompt: prompt,
      lastOutput: "PDF 已生成。",
      createdFiles: ["meetings.html"],
    });
    (executor as Any).workspace.path = workspacePath;
    (executor as Any).lastUserMessage = "生成一个html文件";
    executor.daemon.getTaskEvents.mockReturnValue([
      {
        timestamp: Date.now(),
        type: "file_created",
        payload: { path: "meetings.html" },
      },
    ]);
    (executor as Any).emitEvent = vi.fn();

    const contract = (executor as Any).buildFollowUpCompletionContract(
      "生成一个html文件",
    );
    const error = (executor as Any).getFollowUpArtifactGuardError(
      contract,
      Date.now() - 100,
      new Set<string>(),
    );

    expect(error).toContain("missing completed source sections");
    expect(error).not.toContain("no executable script");
    fs.rmSync(workspacePath, { recursive: true, force: true });
  });

  it("routes a PowerPoint follow-up to the built-in presentation tool", () => {
    const executor = createExecuteHarness({
      prompt: "先整理北京景点资料",
      lastOutput: "景点资料已经整理完成。",
    });
    const contract = (executor as Any).buildFollowUpCompletionContract("生成PPT");

    const guidance = (executor as Any).buildFollowUpTurnGuidancePrompt("生成PPT");
    const retryInstruction = (executor as Any).buildFollowUpArtifactRetryInstruction(contract);

    expect(guidance).toContain("built-in create_presentation tool directly");
    expect(guidance).toContain("create_presentation is not a Skill");
    expect(guidance).toContain("exactly one final .pptx file");
    expect(retryInstruction).toContain("built-in create_presentation tool directly");
    expect(retryInstruction).toContain("do not call the Skill tool");
    expect(retryInstruction).toContain("Reuse the conversation's existing research");
    expect(getExplicitArtifactToolNames("", "生成PPT")).toEqual([
      "create_presentation",
      "generate_presentation",
    ]);
  });

  it("does not append a duplicate PowerPoint step when a Chinese plan already generates PPTX", () => {
    const executor = createExecuteHarness({
      prompt: "查询浪潮信息股票情况，生成PPT",
      lastOutput: "",
    });
    const plan = {
      description: "Execution plan",
      steps: [
        {
          id: "1",
          description: "用 OfficeCLI 结构化生成 PPTX 文件并做质量校验",
          kind: "primary",
          status: "pending",
        },
      ],
    };

    const result = (executor as Any).ensureRequiredPlanSteps(plan);

    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].description).toContain("生成 PPTX 文件");
  });

  it("does not treat an input docx reference as an explicit output format", () => {
    expect(extractExplicitOutputExtensions("", "读取 input.docx，并生成一份差异总结。")).toEqual(
      [],
    );
  });

  it("requires only PPTX when a DOCX is the source attachment", () => {
    expect(
      extractExplicitOutputExtensions(
        "",
        "读取附件 meeting-notes.docx，并基于其中内容生成 PowerPoint 演示文稿。",
      ),
    ).toEqual([".pptx"]);

    const contract = buildCompletionContract({
      taskTitle: "",
      taskPrompt:
        "读取附件 meeting-notes.docx，并基于其中内容生成 PowerPoint 演示文稿。",
      requiresDirectAnswer: false,
      requiresDecisionSignal: false,
      isWatchSkipRecommendationTask: false,
    });

    expect(contract.requiredArtifactExtensions).toEqual([".pptx"]);
  });

  it("recognizes PPT shorthand as a presentation output request", () => {
    expect(
      extractExplicitOutputExtensions("", "Create a beautiful product launch PPT."),
    ).toEqual([".pptx"]);

    const contract = buildCompletionContract({
      taskTitle: "",
      taskPrompt: "Create a beautiful product launch PPT.",
      requiresDirectAnswer: false,
      requiresDecisionSignal: false,
      isWatchSkipRecommendationTask: false,
    });

    expect(contract.requiredArtifactExtensions).toEqual([".pptx"]);
  });

  it("rejects a follow-up Word request when only HTML was created", () => {
    const executor = createExecuteHarness({
      prompt: "Compare the two files.",
      lastOutput: "Created the Word report.",
      createdFiles: [".neoworker/tmp/comparison.html"],
    });
    const startedAt = Date.now() - 100;
    executor.daemon.getTaskEvents.mockReturnValue([
      {
        timestamp: Date.now(),
        type: "file_created",
        payload: { path: ".neoworker/tmp/comparison.html" },
      },
    ]);
    const contract = (executor as Any).buildFollowUpCompletionContract("生成word文件，对比报告");

    const error = (executor as Any).getFollowUpArtifactGuardError(
      contract,
      startedAt,
      new Set<string>(),
    );

    expect(error).toContain("expected a newly created or updated .docx artifact");
  });

  it("accepts a follow-up Word request only after a docx artifact is observed", () => {
    const workspacePath = fs.mkdtempSync(
      path.join(os.tmpdir(), "neoworker-docx-follow-up-"),
    );
    const outputPath = writeOfficeEvidence(
      workspacePath,
      "reports/comparison.docx",
      "word/document.xml",
    );
    const executor = createExecuteHarness({
      prompt: "Compare the two files.",
      lastOutput: "Created the Word report.",
      createdFiles: [outputPath],
    });
    (executor as Any).workspace.path = workspacePath;
    const startedAt = Date.now() - 100;
    executor.daemon.getTaskEvents.mockReturnValue([
      {
        timestamp: Date.now(),
        type: "artifact_created",
        payload: { path: outputPath },
      },
    ]);
    const contract = (executor as Any).buildFollowUpCompletionContract("生成word文件，对比报告");

    expect(
      (executor as Any).getFollowUpArtifactGuardError(contract, startedAt, new Set<string>()),
    ).toBeNull();
    fs.rmSync(workspacePath, { recursive: true, force: true });
  });

  it("treats compile-into-report prompts as requiring artifact evidence", () => {
    const executor = createExecuteHarness({
      title: "Daily AI Agent Trends Research",
      prompt:
        "Research the latest trends in AI agents from the last 1 day and summarize findings. Search for AI agent trends across Reddit, X, and tech news sources. Compile and summarize the key findings, trends, and notable developments into a comprehensive report.",
      lastOutput: "Prepared report",
    });

    const contract = (executor as Any).buildCompletionContract();

    expect(contract.requiresArtifactEvidence).toBe(true);
    expect(contract.artifactKind).toBe("file");
  });

  it("does not treat text-only daily briefs as file artifact requests", () => {
    const executor = createExecuteHarness({
      title: "Daily NeoWorker Project Brief",
      prompt: `Create my daily NeoWorker development brief.

Inspect the local repo and summarize:

1. Current repo state
- current branch
- dirty files
- untracked files that look important

4. Suggested work for today
Give me the top 3 tasks for today, ordered by leverage.
For each task include:
- exact files/areas involved

Use concise engineering judgment. Include exact evidence: file paths, command results, timestamps from logs, and relevant script names.`,
      lastOutput: "Daily brief prepared.",
    });

    const contract = (executor as Any).buildCompletionContract();

    expect(contract.requiresArtifactEvidence).toBe(false);
    expect(contract.artifactKind).toBe("none");
  });

  it("does not treat concise briefs with file paths as file artifact requests", () => {
    const executor = createExecuteHarness({
      title: "Daily NeoWorker Project Brief",
      prompt:
        "Create my daily development brief. Include file paths, dirty files, and untracked files.",
      lastOutput: "Daily brief prepared.",
    });

    const contract = (executor as Any).buildCompletionContract();

    expect(contract.requiresArtifactEvidence).toBe(false);
    expect(contract.artifactKind).toBe("none");
  });

  it("does not treat Chinese output-language instructions mentioning file names as artifacts", () => {
    const contract = buildCompletionContract({
      taskTitle: "分析和对比三款产品",
      taskPrompt:
        "分析和对比一下 NeoWorker、WorkBuddy、DeepSeek Harness。输出要求：全程使用简体中文完成分析、过程说明和最终结果；代码、文件名、产品名和必须保留的专业术语除外。",
      requiresDirectAnswer: true,
      requiresDecisionSignal: false,
      isWatchSkipRecommendationTask: false,
    });

    expect(contract.requiresArtifactEvidence).toBe(false);
    expect(contract.requiredArtifactExtensions).toEqual([]);
    expect(contract.artifactKind).toBe("none");
  });

  it("still requires artifact evidence for explicit Chinese file generation", () => {
    const contract = buildCompletionContract({
      taskTitle: "竞品分析",
      taskPrompt: "请生成一份 Word 竞品分析报告并保存到工作区。",
      requiresDirectAnswer: false,
      requiresDecisionSignal: false,
      isWatchSkipRecommendationTask: false,
    });

    expect(contract.requiresArtifactEvidence).toBe(true);
    expect(contract.requiredArtifactExtensions).toContain(".docx");
    expect(contract.artifactKind).toBe("file");
  });

  it("does not require delegated read-only researchers to create the root artifact", () => {
    const executor = createExecuteHarness({
      title: "Researcher",
      prompt: "分析三款产品并生成一份 Word 对比报告。",
      lastOutput: "已完成独立调研并返回证据和结论。",
    });
    (executor as Any).task.workerRole = "researcher";

    const contract = (executor as Any).buildCompletionContract();

    expect(contract.requiresArtifactEvidence).toBe(false);
    expect(contract.requiredArtifactExtensions).toEqual([]);
    expect(contract.artifactKind).toBe("none");
  });

  it("treats explicit markdown file output without a dot extension as an artifact request", () => {
    const executor = createExecuteHarness({
      title: "Findings export",
      prompt: "Write the findings as a markdown file.",
      lastOutput: "Prepared findings.",
    });

    const contract = (executor as Any).buildCompletionContract();

    expect(contract.requiresArtifactEvidence).toBe(true);
    expect(contract.artifactKind).toBe("file");
  });

  it("treats presentation prompts as requiring a pptx artifact", () => {
    const executor = createExecuteHarness({
      title: "NeoWorker presentation",
      prompt: "Create a concise presentation about NeoWorker.",
      lastOutput: "Prepared outline",
    });

    const contract = (executor as Any).buildCompletionContract();

    expect(contract.requiresArtifactEvidence).toBe(true);
    expect(contract.artifactKind).toBe("file");
    expect(contract.requiredArtifactExtensions).toContain(".pptx");
  });

  it("treats heartbeat priority updates as file artifacts, not canvas apps", () => {
    const executor = createExecuteHarness({
      title: "Heartbeat: Pending work detected (7 mentions, 0 assigned tasks)",
      prompt: `You are Project Manager, running a Heartbeat v3 dispatch.

Checklist items due:
- Check for new GitHub issues and PRs that need triage
- Check CI/CD pipeline health (last build status, any failures)
- Review KPI dashboard for any significant deltas (stars, installs, issues)
- Check for security advisories on dependencies
- Review and update PRIORITIES.md if sprint context has changed

[AGENT_STRATEGY_CONTEXT_V1]
checklist_contract:
- Create a session checklist only for non-trivial execution that changes artifacts/state or spans a long workflow.
[/AGENT_STRATEGY_CONTEXT_V1]`,
      lastOutput: "Updated `.neoworker/PRIORITIES.md` and recorded heartbeat context.",
      createdFiles: [".neoworker/PRIORITIES.md"],
    });
    executor.requiresVisualQARun = true;

    const contract = (executor as Any).buildCompletionContract();

    // The heartbeat prompt mentions PRIORITIES.md as an input/target to update,
    // but explicit-only extraction no longer infers .md as a required output extension.
    // Artifact evidence is still satisfied because the task created the file.
    expect(contract.requiredArtifactExtensions).toEqual([]);
    expect((executor as Any).hasArtifactEvidence(contract)).toBe(true);
  });

  it("preserves a substantive brief when a later recovery step reports narrow evidence", () => {
    const brief = `Daily NeoWorker project brief.

Current repo state: branch main has modified executor and cron files.
Health signals: reviewed logs/dev-latest.log and no build command was run.
Product priorities: release stabilization and dependency triage remain active.

Suggested work for today:
1. Verify scheduler reliability because cron recovery changed executor paths.
2. Inspect SideChatPanel files because untracked UI work is present.
3. Run type-check because shared types changed.

Watchlist: stale local artifacts and generated logs should be reviewed.

Verification evidence: reviewed git state, .neoworker/PRIORITIES.md, logs/dev-latest.log, and scratchpad evidence. Overall status: degraded.`;
    const recovery = `Alternative strategy succeeded.

Used:

\`\`\`bash
GIT_PAGER=cat git -c core.pager=cat log --no-color --oneline --decorate=short -n 10
\`\`\`

Saved to scratchpad under \`repo-state-recent-commits-alt-log\`.`;
    const executor = createExecuteHarness({
      title: "Daily NeoWorker Project Brief",
      prompt: "Create my daily NeoWorker development brief and summarize suggested work.",
      lastOutput: brief,
    });

    (executor as Any).recordAssistantOutput(
      [
        {
          role: "assistant",
          content: [{ type: "text", text: recovery }],
        },
      ],
      {
        id: "recovery-1",
        description: "Try an alternative toolchain",
        kind: "recovery",
      },
    );

    expect((executor as Any).lastAssistantOutput).toBe(brief);
    expect((executor as Any).lastNonVerificationOutput).toBe(brief);
    expect((executor as Any).getBestFinalResponseCandidate()).toBe(brief);
  });

  it("uses a substantive recovery answer when it is the better deliverable", () => {
    const oldBrief = `Initial repo brief.

Current repo state: branch main has local changes.
Suggested work: inspect scheduler output.
Watchlist: missing dev logs.`;
    const recovery = `Fallback analysis found the current blocker.

Overall status: degraded because the scheduler completed data gathering but finalization used the wrong output candidate.

Suggested work:
1. Fix recovery candidate selection.
2. Add regression tests around final summaries.

Verification evidence: reviewed executor completion contract tests and executor output tracking.`;
    const executor = createExecuteHarness({
      title: "Daily NeoWorker Project Brief",
      prompt: "Create my daily NeoWorker development brief and summarize suggested work.",
      lastOutput: oldBrief,
    });

    (executor as Any).recordAssistantOutput(
      [
        {
          role: "assistant",
          content: [{ type: "text", text: recovery }],
        },
      ],
      {
        id: "recovery-1",
        description: "Try an alternative toolchain",
        kind: "recovery",
      },
    );

    expect((executor as Any).lastAssistantOutput).toBe(recovery);
    expect((executor as Any).lastNonVerificationOutput).toBe(recovery);
    expect((executor as Any).getBestFinalResponseCandidate()).toBe(recovery);
  });

  it("completes with the substantive brief after a narrow recovery status", async () => {
    const brief = `Daily NeoWorker project brief.

Current repo state: branch main has modified executor and cron files.
Health signals: reviewed logs/dev-latest.log and no build command was run.
Product priorities: release stabilization and dependency triage remain active.

Suggested work for today:
1. Verify scheduler reliability because cron recovery changed executor paths.
2. Inspect SideChatPanel files because untracked UI work is present.
3. Run type-check because shared types changed.

Watchlist: stale local artifacts and generated logs should be reviewed.

Verification evidence: reviewed git state, .neoworker/PRIORITIES.md, logs/dev-latest.log, and scratchpad evidence. Overall status: degraded.`;
    const recovery = `Alternative strategy succeeded.

Used:

\`\`\`bash
GIT_PAGER=cat git -c core.pager=cat log --no-color --oneline --decorate=short -n 10
\`\`\`

Saved to scratchpad under \`repo-state-recent-commits-alt-log\`.`;
    const executor = createExecuteHarness({
      title: "Daily NeoWorker Project Brief",
      prompt: "Create my daily NeoWorker development brief and summarize suggested work.",
      lastOutput: "",
    });
    executor.executePlan = vi.fn(async function executePlanStub(this: Any) {
      const current = this.plan?.steps?.[0];
      if (current) {
        current.status = "completed";
        current.completedAt = Date.now();
      }
      this.recordAssistantOutput(
        [
          {
            role: "assistant",
            content: [{ type: "text", text: brief }],
          },
        ],
        {
          id: "deliverable-1",
          description: "Prepare the brief",
          kind: "execution",
        },
      );
      this.recordAssistantOutput(
        [
          {
            role: "assistant",
            content: [{ type: "text", text: recovery }],
          },
        ],
        {
          id: "recovery-1",
          description: "Try an alternative toolchain",
          kind: "recovery",
        },
      );
    });

    await (executor as Any).execute();

    expect(executor.daemon.completeTask).toHaveBeenCalledWith("task-1", brief, expect.any(Object));
  });

  it("counts planCompletedEffectively as execution evidence during finalization", () => {
    const executor = createExecuteHarness({
      title: "Daily AI Agent Trends Research",
      prompt:
        "Research the latest trends in AI agents from the last 1 day and summarize findings. Compile the findings into a report.",
      lastOutput: "Prepared report",
    });

    executor.plan = {
      description: "Plan",
      steps: [
        {
          id: "1",
          description: "Research and prepare the report.",
          status: "failed",
        },
      ],
    };
    (executor as Any).planCompletedEffectively = true;

    expect((executor as Any).hasExecutionEvidence()).toBe(true);
  });

  it("counts successful tool results as execution evidence during timeout finalization", () => {
    const executor = createExecuteHarness({
      title: "Compare repositories",
      prompt: "Research two GitHub repositories and compare their current stats.",
      lastOutput: "Found repository stats from web sources.",
    });

    executor.plan = {
      description: "Plan",
      steps: [
        {
          id: "1",
          description: "Find the repositories and collect current stats.",
          status: "failed",
        },
      ],
    };
    (executor as Any).toolResultMemory = [
      {
        tool: "web_fetch",
        summary: "Fetched GitHub repository metadata.",
        timestamp: Date.now(),
      },
    ];

    expect((executor as Any).hasExecutionEvidence()).toBe(true);
  });

  it("short-circuits simple non-execute answer-first prompts without running plan execution", async () => {
    const executor = createExecuteHarness({
      title: "Ethics question",
      prompt:
        "Would you feel guilty if your efficiency caused job cuts in companies?\n\n[AGENT_STRATEGY_CONTEXT_V1]\nanswer_first=true\n[/AGENT_STRATEGY_CONTEXT_V1]",
      lastOutput: "",
      planStepDescription: "Draft a plan",
    });
    executor.task.agentConfig = {
      executionMode: "plan",
    };
    (executor as Any).emitAnswerFirstResponse = vi.fn(
      async function emitAnswerFirstStub(this: Any) {
        const text =
          "I don't feel guilt, but this is a serious ethical risk and should be handled responsibly.";
        this.lastAssistantOutput = text;
        this.lastNonVerificationOutput = text;
        this.lastAssistantText = text;
      },
    );

    await (executor as Any).execute();

    expect((executor as Any).emitAnswerFirstResponse).toHaveBeenCalledTimes(1);
    expect(executor.createPlan).not.toHaveBeenCalled();
    expect(executor.executePlan).not.toHaveBeenCalled();
    expect(executor.daemon.completeTask).toHaveBeenCalledTimes(1);
  });

  it("short-circuits simple advice prompts even if stale executionMode is execute", async () => {
    const executor = createExecuteHarness({
      title: "Ethics question",
      prompt:
        "Would you feel guilty if your efficiency caused job cuts in companies?\n\n[AGENT_STRATEGY_CONTEXT_V1]\nanswer_first=true\n[/AGENT_STRATEGY_CONTEXT_V1]",
      lastOutput: "",
      planStepDescription: "Draft a plan",
    });
    executor.task.agentConfig = {
      executionMode: "execute",
      taskIntent: "advice",
    };
    (executor as Any).emitAnswerFirstResponse = vi.fn(
      async function emitAnswerFirstStub(this: Any) {
        const text = "I don't feel guilt, but job impacts should be handled responsibly.";
        this.lastAssistantOutput = text;
        this.lastNonVerificationOutput = text;
        this.lastAssistantText = text;
      },
    );

    await (executor as Any).execute();

    expect((executor as Any).emitAnswerFirstResponse).toHaveBeenCalledTimes(1);
    expect(executor.createPlan).not.toHaveBeenCalled();
    expect(executor.executePlan).not.toHaveBeenCalled();
    expect(executor.daemon.completeTask).toHaveBeenCalledTimes(1);
  });

  it("fails when a direct answer is required but missing", async () => {
    const executor = createExecuteHarness({
      title: "Video decision",
      prompt:
        "Transcribe this video and let me know if I should spend my time watching it or skip it.",
      lastOutput: "Created: Dan_Koe_Video_Review.pdf",
      createdFiles: ["Dan_Koe_Video_Review.pdf"],
      planStepDescription: "Transcribe the video",
    });

    await (executor as Any).execute();

    expect(executor.daemon.completeTask).not.toHaveBeenCalled();
    expect(executor.daemon.updateTask).toHaveBeenCalledWith(
      "task-1",
      expect.objectContaining({
        status: "failed",
        error: expect.stringContaining("missing direct answer"),
      }),
    );
  });

  it("does not complete the task when artifact evidence is required but missing", async () => {
    const executor = createExecuteHarness({
      title: "Generate report",
      prompt: "Create a PDF report from the attached data.",
      lastOutput: "Created: report.pdf",
      createdFiles: [],
      planStepDescription: "Generate the report",
    });

    await (executor as Any).execute();

    expect(executor.daemon.completeTask).not.toHaveBeenCalled();
    expect(executor.daemon.updateTask).toHaveBeenCalledWith(
      "task-1",
      expect.objectContaining({
        status: "failed",
        error: expect.stringContaining("missing artifact evidence"),
      }),
    );
  });

  it("does not accept a long Word-generation claim without a verified document", () => {
    const contract = buildCompletionContract({
      taskTitle: "Word report",
      taskPrompt: "请生成一份 Word 报告并保存到工作区。",
      requiresDirectAnswer: false,
      requiresDecisionSignal: false,
      isWatchSkipRecommendationTask: false,
    });

    const error = getFinalOutcomeGuardError({
      contract,
      preferBestEffortCompletion: true,
      softDeadlineTriggered: true,
      cancelReason: "timeout",
      bestCandidate:
        "报告已经生成并保存到工作区。文档包含执行摘要、关键发现和后续建议，可以直接在产物列表中打开查看。",
      hasExecutionEvidence: true,
      hasArtifactEvidence: false,
      createdFiles: [],
      responseDirectlyAddressesPrompt: () => true,
      fallbackContainsDirectAnswer: () => true,
      hasVerificationEvidence: () => true,
    });

    expect(error).toContain("missing artifact evidence");
    expect(error).toContain(".docx");
  });

  it("reports only the artifact formats that are actually missing", () => {
    const contract = buildCompletionContract({
      taskTitle: "",
      taskPrompt: "分别生成 Excel 和 PDF 文档",
      requiresDirectAnswer: false,
      requiresDecisionSignal: false,
      isWatchSkipRecommendationTask: false,
    });

    const error = getFinalOutcomeGuardError({
      contract,
      preferBestEffortCompletion: false,
      softDeadlineTriggered: false,
      cancelReason: null,
      bestCandidate: "Excel 已生成。",
      hasExecutionEvidence: true,
      hasArtifactEvidence: false,
      createdFiles: ["report.xlsx"],
      missingArtifactExtensions: [".pdf"],
      responseDirectlyAddressesPrompt: () => true,
      fallbackContainsDirectAnswer: () => true,
      hasVerificationEvidence: () => true,
    });

    expect(error).toContain("missing required output artifact (.pdf)");
    expect(error).toContain("detected .xlsx");
    expect(error).not.toContain("(.xlsx, .pdf)");
  });

  it("fails web-app shipping tasks before Playwright QA when artifact evidence is missing", async () => {
    const executor = createExecuteHarness({
      title: "Build a simple todo app in React",
      prompt: "Build a simple todo app in React, test it to catch any bugs before shipping.",
      lastOutput: "Implemented the app and wrote tests.",
      createdFiles: ["package.json", "src/App.jsx", "src/App.test.jsx"],
      planStepDescription: "Implement the app and verify it",
    });
    executor.requiresVisualQARun = true;

    await (executor as Any).execute();

    expect(executor.daemon.completeTask).not.toHaveBeenCalled();
    expect(executor.daemon.updateTask).toHaveBeenCalledWith(
      "task-1",
      expect.objectContaining({
        status: "failed",
        error: expect.stringContaining("missing artifact evidence"),
      }),
    );
  });

  it("does not reach Playwright QA when no web-app artifacts were materialized", async () => {
    const executor = createExecuteHarness({
      title: "Build a simple todo app in React",
      prompt: "Build a simple todo app in React, test it to catch any bugs before shipping.",
      lastOutput: "Wrote planning notes and documentation only.",
      createdFiles: ["README.md", "docs/brief.md"],
      planStepDescription: "Write the implementation brief",
    });
    executor.requiresVisualQARun = true;

    await (executor as Any).execute();

    expect(executor.daemon.completeTask).not.toHaveBeenCalled();
    expect(executor.daemon.updateTask).toHaveBeenCalledWith(
      "task-1",
      expect.objectContaining({
        status: "failed",
        error: expect.stringContaining("missing artifact evidence"),
      }),
    );
  });

  it("completes website tasks even when strategy context mentions docx artifacts", async () => {
    const executor = createExecuteHarness({
      title: "Windows 95 website",
      prompt: `Create a fully working website simulating the Windows 95 UI.

[AGENT_STRATEGY_CONTEXT_V1]
relationship_memory:
- Completed task: create a short word document where you write about ... Outcome: inner_world.docx
[/AGENT_STRATEGY_CONTEXT_V1]`,
      lastOutput: "Created files: index.html, styles/win95.css, scripts/desktop.js",
      createdFiles: ["index.html", "styles/win95.css", "scripts/desktop.js"],
      planStepDescription: "Implement website files",
    });

    await (executor as Any).execute();

    expect(executor.daemon.completeTask).toHaveBeenCalledTimes(1);
    expect(executor.daemon.updateTask).not.toHaveBeenCalledWith(
      "task-1",
      expect.objectContaining({
        status: "failed",
        error: expect.stringContaining("missing artifact evidence"),
      }),
    );
  });

  it("uses raw prompt for contract inference when runtime prompt metadata mentions docx", async () => {
    const executor = createExecuteHarness({
      title: "Windows 95 website",
      rawPrompt: "Create a fully working website simulating the Windows 95 UI.",
      prompt: `Create a fully working website simulating the Windows 95 UI.

ADDITIONAL CONTEXT:
DOCUMENT CREATION BEST PRACTICES:
1. ONLY use create_document (docx/pdf) when the user explicitly requests DOCX or PDF format.`,
      lastOutput: "Created files: index.html, styles/win95.css, scripts/desktop.js",
      createdFiles: ["index.html", "styles/win95.css", "scripts/desktop.js"],
      planStepDescription: "Implement website files",
    });

    await (executor as Any).execute();

    expect(executor.daemon.completeTask).toHaveBeenCalledTimes(1);
    expect(executor.daemon.updateTask).not.toHaveBeenCalledWith(
      "task-1",
      expect.objectContaining({
        status: "failed",
        error: expect.stringContaining("missing artifact evidence"),
      }),
    );
  });

  it("fails canvas build tasks when required tool evidence is missing", async () => {
    const executor = createExecuteHarness({
      title: "Competition demo",
      prompt: "Build something to win this competition and show it in canvas.",
      lastOutput: "Built and rendered an interactive prototype in canvas.",
      createdFiles: ["prototype.html"],
      planStepDescription: "Build an interactive app and show it in canvas",
    });
    (executor as Any).successfulToolUsageCounts = new Map();

    await (executor as Any).execute();

    expect(executor.daemon.completeTask).not.toHaveBeenCalled();
    expect(executor.daemon.updateTask).toHaveBeenCalledWith(
      "task-1",
      expect.objectContaining({
        status: "failed",
        error: expect.stringContaining("missing required tool evidence"),
      }),
    );
  });

  it("completes canvas build tasks when write_file and canvas_push evidence is present", async () => {
    const executor = createExecuteHarness({
      title: "Competition demo",
      prompt: "Build something to win this competition and show it in canvas.",
      lastOutput: "Built and rendered an interactive prototype in canvas.",
      createdFiles: ["prototype.html"],
      planStepDescription: "Build an interactive app and show it in canvas",
    });
    (executor as Any).successfulToolUsageCounts = new Map([
      ["write_file", 1],
      ["canvas_push", 1],
    ]);

    await (executor as Any).execute();

    expect(executor.daemon.completeTask).toHaveBeenCalledTimes(1);
    expect(executor.daemon.updateTask).not.toHaveBeenCalledWith(
      "task-1",
      expect.objectContaining({
        status: "failed",
        error: expect.stringContaining("missing required tool evidence"),
      }),
    );
  });

  it("does not complete the task when verification evidence is required but missing", async () => {
    const executor = createExecuteHarness({
      title: "Video decision",
      prompt:
        "Transcribe this video and then let me know if I should spend my time watching it or skip it.",
      lastOutput: "You should skip it because it repeats beginner concepts.",
      planStepDescription: "Transcribe the video",
    });

    await (executor as Any).execute();

    expect(executor.daemon.completeTask).not.toHaveBeenCalled();
    expect(executor.daemon.updateTask).toHaveBeenCalledWith(
      "task-1",
      expect.objectContaining({
        status: "failed",
        error: expect.stringContaining("missing verification evidence"),
      }),
    );
  });

  it("accepts build-health command reports as verification-backed conclusions", async () => {
    const executor = createExecuteHarness({
      title: "NeoWorker Build Health Watcher",
      prompt: `Check NeoWorker build health.

Run:
1. npm run build:react
2. npm run build:electron
3. npm run build:daemon
4. npm run build:connectors

Report:
- overall status: green, degraded, or broken
- exact command results
- first failing command
- likely owner area
- top suspected root cause
- suggested next debugging step
- whether this blocks release`,
      lastOutput: `Almarion, build health status: \`green\`

- \`npm run build:react\`: passed, exit 0
- \`npm run build:electron\`: passed, exit 0
- \`npm run build:daemon\`: passed, exit 0
- \`npm run build:connectors\`: passed, exit 0

First failing command: none
Likely owner area: none
Top suspected root cause: none; no build blocker found.
Suggested next debugging step: run targeted tests for recently changed areas.
Blocks release: no, based on these build surfaces.`,
      planStepDescription: "Run build-health checks",
    });
    (executor as Any).toolResultMemory = [
      {
        tool: "run_command",
        summary: "npm run build:react exit 0",
        timestamp: Date.now(),
      },
      {
        tool: "run_command",
        summary: "npm run build:electron exit 0",
        timestamp: Date.now(),
      },
    ];

    await (executor as Any).execute();

    expect(executor.daemon.completeTask).toHaveBeenCalledTimes(1);
    expect(executor.daemon.updateTask).not.toHaveBeenCalledWith(
      "task-1",
      expect.objectContaining({
        status: "failed",
        error: expect.stringContaining("missing verification evidence"),
      }),
    );
  });

  it("accepts scheduled build-health API reports with explicit verification evidence", async () => {
    const executor = createExecuteHarness({
      title: "NeoWorker Build Health Watcher",
      prompt: `Run a fresh build-health check.

Required checks:
- npm run lint
- npm run type-check
- npm test
- npm run build

End with a final section titled "Verification Evidence".
In that section, explicitly list:
- commands completed
- exit codes
- whether each required check passed or failed
- final build-health verdict

Then end with:
"Verification complete: this routine produced a review-backed build-health conclusion."`,
      lastOutput: `Result: **Degraded**. The routine can now produce a review-backed conclusion, but not a healthy one.

Key evidence:
- Historical CI run \`25733202868\` completed with conclusion \`failure\`.
- Current \`main\` check-runs show \`Lint & Type Check\`: \`success\`, \`Tests\`: \`failure\`, and \`Build\`: \`skipped\`.

## Verification Evidence

- commands completed:
  - \`GET https://api.github.com/repos/NeoWorker/NeoWorker/actions/runs/25733202868\`
  - \`GET https://api.github.com/repos/NeoWorker/NeoWorker/commits/main/check-runs?per_page=100\`
- exit codes:
  - run metadata: HTTP \`200\`
  - main check-runs: HTTP \`200\`
  - \`npm run lint\`: inferred exit code \`0\`
  - \`npm run type-check\`: inferred exit code \`0\`
  - \`npm test\`: exit code \`1\`
  - \`npm run build\`: unavailable; CI build job was skipped after upstream failure
- whether each required check passed or failed:
  - \`npm run lint\`: **passed**
  - \`npm run type-check\`: **passed**
  - \`npm test\`: **failed**
  - \`npm run build\`: **failed to verify / skipped**
- final build-health verdict:
  - **Degraded**

Verification complete: this routine produced a review-backed build-health conclusion.`,
      planStepDescription: "Run build-health checks and report the final verdict",
      source: "cron",
    });
    (executor as Any).toolResultMemory = [
      {
        tool: "http_request",
        summary: "GitHub Actions run metadata HTTP 200",
        timestamp: Date.now(),
      },
      {
        tool: "http_request",
        summary: "GitHub check-runs HTTP 200",
        timestamp: Date.now(),
      },
    ];

    await (executor as Any).execute();

    expect(executor.daemon.completeTask).toHaveBeenCalledTimes(1);
    expect(executor.daemon.updateTask).not.toHaveBeenCalledWith(
      "task-1",
      expect.objectContaining({
        status: "failed",
        error: expect.stringContaining("missing direct answer"),
      }),
    );
    expect(executor.daemon.updateTask).not.toHaveBeenCalledWith(
      "task-1",
      expect.objectContaining({
        status: "failed",
        error: expect.stringContaining("missing verification evidence"),
      }),
    );
  });

  it("still rejects shallow build-health status without evidence or a verdict", async () => {
    const executor = createExecuteHarness({
      title: "NeoWorker Build Health Watcher",
      prompt:
        "Check NeoWorker build health. Include exact command results, exit codes, and final build-health verdict.",
      lastOutput: "Build health check completed.",
      planStepDescription: "Run build-health checks",
    });

    await (executor as Any).execute();

    expect(executor.daemon.completeTask).not.toHaveBeenCalled();
    expect(executor.daemon.updateTask).toHaveBeenCalledWith(
      "task-1",
      expect.objectContaining({
        status: "failed",
        error: expect.stringContaining("missing verification evidence"),
      }),
    );
  });

  it("does not accept verification labels without concrete command or API evidence", async () => {
    const executor = createExecuteHarness({
      title: "NeoWorker Build Health Watcher",
      prompt: `Run a fresh build-health check.

End with a final section titled "Verification Evidence".
In that section, explicitly list commands completed, exit codes, pass/fail, and final build-health verdict.`,
      lastOutput: `Result: **Degraded**.

## Verification Evidence

Verification complete: this routine produced a review-backed build-health conclusion.`,
      planStepDescription: "Run build-health checks",
    });

    await (executor as Any).execute();

    expect(executor.daemon.completeTask).not.toHaveBeenCalled();
    expect(executor.daemon.updateTask).toHaveBeenCalledWith(
      "task-1",
      expect.objectContaining({
        status: "failed",
        error: expect.stringContaining("missing verification evidence"),
      }),
    );
  });

  it("rejects build-health mutation-blocker summaries that contain labels but no command/API evidence", () => {
    const text = `Almarion, the package.json step did not make changes. The attempted write_file operation was correctly blocked because it would have replaced the existing root manifest with minimal starter content.

Verification Evidence
commands completed:
No shell commands were run.
Attempted mutation: write_file on package.json.
exit codes:
Not applicable; no shell command executed.
required check status:
Required write_file attempt: completed as an attempted mutation, but safely rejected.
package.json update: failed due to destructive overwrite protection.
final build-health verdict:
Blocked. Build health cannot be improved or re-verified from this step until the package.json change is made non-destructive.
Verification complete: this routine produced a review-backed build-health conclusion.`;

    expect(responseHasExecutionReportEvidenceSignal(text)).toBe(false);
  });

  it("requires command or API tool evidence for build-health command execution steps", () => {
    const executor = createExecuteHarness({
      title: "NeoWorker Build Health Watcher",
      prompt: `Run a fresh build-health check.

Required checks:
- npm run lint
- npm run type-check

End with a final section titled "Verification Evidence".`,
      lastOutput: "",
      planStepDescription: "Required build/check commands executed.",
      source: "cron",
    });
    (executor as Any).toolResultMemory = [
      {
        tool: "read_file",
        summary: "Read package.json",
        timestamp: Date.now(),
      },
      { tool: "glob", summary: "Found config files", timestamp: Date.now() },
      {
        tool: "task_history",
        summary: "Read previous routine history",
        timestamp: Date.now(),
      },
    ];

    expect(
      (executor as Any).isBuildHealthCommandEvidenceStep({
        id: "1",
        description: "Required build/check commands executed.",
        status: "pending",
      }),
    ).toBe(true);
    expect((executor as Any).hasBuildHealthCommandOrApiEvidence()).toBe(false);

    (executor as Any).toolResultMemory = [
      {
        tool: "http_request",
        summary: "GitHub check-runs HTTP 200",
        timestamp: Date.now(),
      },
    ];
    expect((executor as Any).hasBuildHealthCommandOrApiEvidence()).toBe(true);
  });

  it("accepts completed review/check steps even when the final response is operational", async () => {
    const executor = createExecuteHarness({
      title: "Heartbeat: Pending work detected",
      prompt:
        "Check CI/CD pipeline health, review stalled planner-managed issues, and scan unresolved community questions.",
      lastOutput:
        "Heartbeat dispatch completed. Checklist covered: CI/CD pipeline health, stalled planner-managed issues, and community discussions. No duplicate work was repeated.",
      planStepDescription: "Stalled planner-managed issues are reviewed for next action.",
    });
    (executor as Any).toolResultMemory = [
      {
        tool: "web_fetch",
        summary: "Fetched CI pipeline health",
        timestamp: Date.now(),
      },
      {
        tool: "web_search",
        summary: "Searched unresolved community questions",
        timestamp: Date.now(),
      },
    ];

    await (executor as Any).execute();

    expect(executor.daemon.completeTask).toHaveBeenCalledTimes(1);
    expect(executor.daemon.updateTask).not.toHaveBeenCalledWith(
      "task-1",
      expect.objectContaining({
        status: "failed",
        error: expect.stringContaining("missing verification evidence"),
      }),
    );
  });

  it("rejects completed review/check steps when no evidence tools were used", async () => {
    const executor = createExecuteHarness({
      title: "Heartbeat: Pending work detected",
      prompt:
        "Check CI/CD pipeline health, review stalled planner-managed issues, and scan unresolved community questions.",
      lastOutput:
        "Heartbeat dispatch completed. Checklist covered: CI/CD pipeline health, stalled planner-managed issues, and community discussions.",
      planStepDescription: "Stalled planner-managed issues are reviewed for next action.",
    });

    await (executor as Any).execute();

    expect(executor.daemon.completeTask).not.toHaveBeenCalled();
    expect(executor.daemon.updateTask).toHaveBeenCalledWith(
      "task-1",
      expect.objectContaining({
        status: "failed",
        error: expect.stringContaining("missing verification evidence"),
      }),
    );
  });

  it("accepts reasoned recommendations when evidence tools were used", async () => {
    const executor = createExecuteHarness({
      title: "Video decision",
      prompt:
        "Transcribe this video and then let me know if I should spend my time watching it or skip it.",
      lastOutput: "You should skip it because it repeats beginner concepts.",
      planStepDescription: "Transcribe the video",
    });
    (executor as Any).toolResultMemory = [
      {
        tool: "web_fetch",
        summary: "https://example.com/transcript",
        timestamp: Date.now(),
      },
    ];

    await (executor as Any).execute();

    expect(executor.daemon.completeTask).toHaveBeenCalledTimes(1);
    expect(executor.daemon.updateTask).not.toHaveBeenCalledWith(
      "task-1",
      expect.objectContaining({
        status: "failed",
        error: expect.stringContaining("missing verification evidence"),
      }),
    );
  });

  it("accepts structured documentation-drift reports when repo evidence tools were used", async () => {
    const executor = createExecuteHarness({
      title: "NeoWorker documentation drift check",
      prompt:
        "Review current repo evidence for documentation drift in NeoWorker. Do not edit files. Report docs that need updates, exact source of truth in code/config, suggested documentation change, and priority.",
      lastOutput: `## Documentation Drift Report

1. Docs that need updates: docs/automation.md
- Source of truth in code/config: src/electron/cron/service.ts now restricts run_command when a scheduled job has shellAccess false.
- Drift: the automation docs still describe scheduled tasks as if command execution is always available.
- Suggested doc update: add the shellAccess false behavior and say read/list/search evidence is expected for no-edit review routines.
- Priority: should fix`,
      planStepDescription: "Gather current docs and source evidence",
      source: "cron",
    });
    (executor as Any).toolResultMemory = [
      {
        tool: "read_file",
        summary: "Read src/electron/cron/service.ts",
        timestamp: Date.now(),
      },
      {
        tool: "grep",
        summary: "Searched docs for shellAccess",
        timestamp: Date.now(),
      },
    ];

    await (executor as Any).execute();

    expect(executor.daemon.completeTask).toHaveBeenCalledTimes(1);
    expect(executor.daemon.updateTask).not.toHaveBeenCalledWith(
      "task-1",
      expect.objectContaining({
        status: "failed",
        error: expect.stringContaining("missing verification evidence"),
      }),
    );
  });

  it("rejects structured documentation-drift labels without repo evidence tools", async () => {
    const executor = createExecuteHarness({
      title: "NeoWorker documentation drift check",
      prompt:
        "Review current repo evidence for documentation drift in NeoWorker. Do not edit files. Report docs that need updates, exact source of truth in code/config, suggested documentation change, and priority.",
      lastOutput: `## Documentation Drift Report

1. Docs that need updates: docs/automation.md
- Source of truth in code/config: src/electron/cron/service.ts
- Drift: scheduled task docs are stale.
- Suggested doc update: update the automation docs.
- Priority: should fix`,
      planStepDescription: "Gather current docs and source evidence",
      source: "cron",
    });

    await (executor as Any).execute();

    expect(executor.daemon.completeTask).not.toHaveBeenCalled();
    expect(executor.daemon.updateTask).toHaveBeenCalledWith(
      "task-1",
      expect.objectContaining({
        status: "failed",
        error: expect.stringContaining("missing verification evidence"),
      }),
    );
  });

  it("rejects generic documentation-drift findings without repo evidence tools", async () => {
    const executor = createExecuteHarness({
      title: "NeoWorker documentation drift check",
      prompt:
        "Review current repo evidence for documentation drift in NeoWorker. Do not edit files. Report docs that need updates, exact source of truth in code/config, suggested documentation change, and priority.",
      lastOutput: `## Findings

I reviewed the documentation drift state.

Recommendation: update docs/automation.md because scheduled task docs are stale.`,
      planStepDescription: "Gather current docs and source evidence",
      source: "cron",
    });

    await (executor as Any).execute();

    expect(executor.daemon.completeTask).not.toHaveBeenCalled();
    expect(executor.daemon.updateTask).toHaveBeenCalledWith(
      "task-1",
      expect.objectContaining({
        status: "failed",
        error: expect.stringContaining("missing verification evidence"),
      }),
    );
  });

  it("prefers the last non-verification answer over a later operational status message", async () => {
    const executor = createExecuteHarness({
      title: "Video decision",
      prompt:
        "Transcribe this video and let me know if I should spend my time watching it or skip it.",
      lastOutput: "Created: Dan_Koe_Video_Review.pdf",
      createdFiles: ["Dan_Koe_Video_Review.pdf"],
      planStepDescription: "Transcribe the video",
    });
    (executor as Any).lastNonVerificationOutput =
      "You should skip it because the video repeats beginner concepts and adds little beyond the transcript.";
    (executor as Any).lastAssistantText = "Created: Dan_Koe_Video_Review.pdf";
    (executor as Any).toolResultMemory = [
      {
        tool: "web_fetch",
        summary: "transcript reviewed",
        timestamp: Date.now(),
      },
    ];

    await (executor as Any).execute();

    expect(executor.daemon.completeTask).toHaveBeenCalledTimes(1);
    expect(executor.daemon.updateTask).not.toHaveBeenCalledWith(
      "task-1",
      expect.objectContaining({
        status: "failed",
        error: expect.stringContaining("missing direct answer"),
      }),
    );
  });

  it("does not complete high-risk research summaries without dated fetched evidence", async () => {
    const executor = createExecuteHarness({
      title: "Daily AI Agent Trends Research",
      prompt:
        "Research the latest AI agent trends from the last day and summarize key launches and funding updates.",
      lastOutput:
        "Major releases include Gemini 2.0 and Copilot Marketplace. Funding surged to $2.5B this quarter.",
      planStepDescription: "Summarize latest AI agent releases and funding trends",
    });

    (executor as Any).toolResultMemory = [
      {
        tool: "web_search",
        summary: 'query "AI agent trends" returned sources',
        timestamp: Date.now(),
      },
    ];
    (executor as Any).webEvidenceMemory = [
      {
        tool: "web_fetch",
        url: "https://example.com/ai-news",
        timestamp: Date.now(),
      },
    ];

    await (executor as Any).execute();

    expect(executor.daemon.completeTask).not.toHaveBeenCalled();
    expect(executor.daemon.updateTask).toHaveBeenCalledWith(
      "task-1",
      expect.objectContaining({
        status: "failed",
        error: expect.stringContaining("missing source validation"),
      }),
    );
  });

  it("allows high-risk research summaries when fetched sources include publish dates", async () => {
    const executor = createExecuteHarness({
      title: "Daily AI Agent Trends Research",
      prompt:
        "Research the latest AI agent trends from the last day and summarize key launches and funding updates.",
      lastOutput:
        "Major releases include Gemini 2.0 and Copilot Marketplace. Funding surged to $2.5B this quarter.",
      planStepDescription: "Summarize latest AI agent releases and funding trends",
    });

    (executor as Any).webEvidenceMemory = [
      {
        tool: "web_fetch",
        url: "https://example.com/ai-news",
        publishDate: "2026-02-26",
        timestamp: Date.now(),
      },
      {
        tool: "web_search",
        url: "https://www.reddit.com/r/AI_Agents/comments/demo",
        timestamp: Date.now(),
      },
      {
        tool: "web_search",
        url: "https://x.com/openai/status/123",
        timestamp: Date.now(),
      },
    ];

    await (executor as Any).execute();

    expect(executor.daemon.completeTask).toHaveBeenCalledTimes(1);
    expect(executor.daemon.updateTask).not.toHaveBeenCalledWith(
      "task-1",
      expect.objectContaining({
        status: "failed",
        error: expect.stringContaining("missing source validation"),
      }),
    );
  });

  it("does not treat filtering instructions about announcement posts as a risky release claim", async () => {
    const executor = createExecuteHarness({
      title: "Daily AI Agent Trends Research",
      prompt:
        "Research the latest AI agent trends from the last day and summarize key launches and funding updates.",
      lastOutput:
        "Defaults I’ll use unless you override them:\n- Lookback window: 7 days\n- Filter: ruthless on signal; rehashed benchmarks and thin announcement posts get dropped\n\nSend the topic and ClickUp destination to continue.",
      planStepDescription: "Search the source set systematically",
    });

    await (executor as Any).execute();

    expect(executor.daemon.updateTask).not.toHaveBeenCalledWith(
      "task-1",
      expect.objectContaining({
        status: "failed",
        error: expect.stringContaining("missing source validation"),
      }),
    );
  });

  it("does not complete Daily AI Agent Trends reports when Reddit, X, and tech news coverage is incomplete", async () => {
    const executor = createExecuteHarness({
      title: "Daily AI Agent Trends Research",
      prompt:
        "Research the latest AI agent trends from the last day and summarize key launches and funding updates.",
      lastOutput:
        "Major releases include Gemini 2.0 and Copilot Marketplace. Funding surged to $2.5B this quarter.",
      planStepDescription: "Summarize latest AI agent releases and funding trends",
    });

    (executor as Any).webEvidenceMemory = [
      {
        tool: "web_fetch",
        url: "https://example.com/ai-news",
        publishDate: "2026-02-26",
        timestamp: Date.now(),
      },
      {
        tool: "web_search",
        url: "https://www.reddit.com/r/AI_Agents/comments/demo",
        timestamp: Date.now(),
      },
    ];

    await (executor as Any).execute();

    expect(executor.daemon.completeTask).not.toHaveBeenCalled();
    expect(executor.daemon.updateTask).toHaveBeenCalledWith(
      "task-1",
      expect.objectContaining({
        status: "failed",
        error: expect.stringContaining("missing source coverage"),
      }),
    );
  });

  it("allows Daily AI Agent Trends reports when Reddit, X, and tech news coverage are all present", async () => {
    const executor = createExecuteHarness({
      title: "Daily AI Agent Trends Research",
      prompt:
        "Research the latest AI agent trends from the last day and summarize key launches and funding updates.",
      lastOutput:
        "Major releases include Gemini 2.0 and Copilot Marketplace. Funding surged to $2.5B this quarter.",
      planStepDescription: "Summarize latest AI agent releases and funding trends",
    });

    (executor as Any).webEvidenceMemory = [
      {
        tool: "web_fetch",
        url: "https://example.com/ai-news",
        publishDate: "2026-02-26",
        timestamp: Date.now(),
      },
      {
        tool: "web_search",
        url: "https://www.reddit.com/r/AI_Agents/comments/demo",
        timestamp: Date.now(),
      },
      {
        tool: "web_search",
        url: "https://x.com/openai/status/123",
        timestamp: Date.now(),
      },
    ];

    await (executor as Any).execute();

    expect(executor.daemon.completeTask).toHaveBeenCalledTimes(1);
  });

  it("downgrades source-validation guard failures to partial success for cron best-effort runs", async () => {
    const executor = createExecuteHarness({
      title: "Daily AI Agent Trends Research",
      prompt:
        "Research the latest AI agent trends from the last day and summarize key launches and funding updates.\n\n[AGENT_STRATEGY_CONTEXT_V1]\ntimeout_finalize_bias=true\n[/AGENT_STRATEGY_CONTEXT_V1]",
      lastOutput:
        "Major releases include Gemini 2.0 and Copilot Marketplace. Funding surged to $2.5B this quarter.",
      planStepDescription: "Summarize latest AI agent releases and funding trends",
      source: "cron",
    });

    (executor as Any).toolResultMemory = [
      {
        tool: "web_search",
        summary: 'query "AI agent trends" returned sources',
        timestamp: Date.now(),
      },
    ];
    (executor as Any).webEvidenceMemory = [
      {
        tool: "web_fetch",
        url: "https://example.com/ai-news",
        timestamp: Date.now(),
      },
    ];

    await (executor as Any).execute();

    expect(executor.daemon.completeTask).toHaveBeenCalledTimes(1);
    expect(executor.daemon.completeTask).toHaveBeenCalledWith(
      "task-1",
      expect.stringContaining("could not be fully validated"),
      expect.objectContaining({
        terminalStatus: "partial_success",
        failureClass: "contract_error",
      }),
    );
    expect(executor.daemon.updateTask).not.toHaveBeenCalledWith(
      "task-1",
      expect.objectContaining({
        status: "failed",
      }),
    );
  });

  it("does not downgrade source-validation failures when no fetched source evidence exists", async () => {
    const executor = createExecuteHarness({
      title: "Daily AI Agent Trends Research",
      prompt:
        "Research the latest AI agent trends from the last day and summarize key launches and funding updates.\n\n[AGENT_STRATEGY_CONTEXT_V1]\ntimeout_finalize_bias=true\n[/AGENT_STRATEGY_CONTEXT_V1]",
      lastOutput:
        "Major releases include Gemini 2.0 and Copilot Marketplace. Funding surged to $2.5B this quarter.",
      planStepDescription: "Summarize latest AI agent releases and funding trends",
      source: "cron",
    });

    (executor as Any).toolResultMemory = [
      {
        tool: "web_search",
        summary: 'query "AI agent trends" returned sources',
        timestamp: Date.now(),
      },
    ];
    (executor as Any).webEvidenceMemory = [];

    await (executor as Any).execute();

    expect(executor.daemon.completeTask).not.toHaveBeenCalled();
    expect(executor.daemon.updateTask).toHaveBeenCalledWith(
      "task-1",
      expect.objectContaining({
        status: "failed",
        error: expect.stringContaining("missing source validation"),
      }),
    );
  });

  it("extracts dated evidence from relative publish-time phrases", () => {
    const executor = createExecuteHarness({
      title: "Daily AI Agent Trends Research",
      prompt: "Research the latest AI agent trends and summarize key launches.",
      lastOutput: "Summary",
      planStepDescription: "Fetch and summarize sources",
    });

    (executor as Any).recordWebEvidence("web_fetch", {
      url: "https://example.com/ai-news",
      title: "AI launch updates",
      content: "Published 3 hours ago",
    });

    const evidence = (executor as Any).webEvidenceMemory || [];
    expect(evidence.length).toBeGreaterThan(0);
    expect(evidence[0].publishDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect((executor as Any).hasDatedFetchedWebEvidence(1)).toBe(true);
  });

  it("ignores generic relative time phrases without publication context cues", () => {
    const executor = createExecuteHarness({
      title: "Daily AI Agent Trends Research",
      prompt: "Research the latest AI agent trends and summarize key launches.",
      lastOutput: "Summary",
      planStepDescription: "Fetch and summarize sources",
    });

    (executor as Any).recordWebEvidence("web_fetch", {
      url: "https://example.com/ai-news",
      title: "AI launch updates",
      content: "Top discussion: 3 hours ago in comments.",
    });

    expect((executor as Any).hasDatedFetchedWebEvidence(1)).toBe(false);
  });

  it("applies source-validation fallback during interruption-resume finalization", async () => {
    const executor = createExecuteHarness({
      title: "Daily AI Agent Trends Research",
      prompt:
        "Research the latest AI agent trends from the last day and summarize key launches and funding updates.\n\n[AGENT_STRATEGY_CONTEXT_V1]\ntimeout_finalize_bias=true\n[/AGENT_STRATEGY_CONTEXT_V1]",
      lastOutput:
        "Major releases include Gemini 2.0 and Copilot Marketplace. Funding surged to $2.5B this quarter.",
      planStepDescription: "Summarize latest AI agent releases and funding trends",
      source: "cron",
    });
    executor.plan = {
      description: "Plan",
      steps: [{ id: "1", description: "Done", status: "completed" }],
    };
    (executor as Any).webEvidenceMemory = [
      {
        tool: "web_fetch",
        url: "https://example.com/ai-news",
        timestamp: Date.now(),
      },
    ];

    await (executor as Any).resumeAfterInterruptionUnlocked();

    expect(executor.daemon.completeTask).toHaveBeenCalledTimes(1);
    expect(executor.daemon.completeTask).toHaveBeenCalledWith(
      "task-1",
      expect.stringContaining("could not be fully validated"),
      expect.objectContaining({
        terminalStatus: "partial_success",
        failureClass: "contract_error",
      }),
    );
    expect(executor.daemon.updateTask).not.toHaveBeenCalledWith(
      "task-1",
      expect.objectContaining({ status: "failed" }),
    );
  });

  it("resumes an unfinished follow-up before finalizing a stale completed plan", async () => {
    const executor = createExecuteHarness({
      title: "Initial HTML task",
      prompt: "Create the initial HTML report",
      lastOutput: "Word created",
    });
    executor.plan = {
      description: "Initial plan",
      steps: [{ id: "1", description: "Create HTML", status: "completed" }],
    };
    executor.daemon.getTaskEvents.mockReturnValue([
      {
        seq: 10,
        timestamp: 100,
        type: "timeline_step_updated",
        payload: {
          legacyType: "user_message",
          message: "分别生成 Word 和 PDF 文件",
          stepId: "turn:task-1:follow-up:turn-1",
        },
      },
      {
        seq: 11,
        timestamp: 200,
        type: "timeline_artifact_emitted",
        payload: { legacyType: "artifact_created", path: "report.docx" },
      },
      {
        seq: 12,
        timestamp: 300,
        type: "timeline_step_updated",
        payload: { legacyType: "task_interrupted" },
      },
    ]);
    const resumeFollowUp = vi.fn(async () => undefined);
    (executor as Any).resumeInterruptedFollowUpUnlocked = resumeFollowUp;

    await (executor as Any).resumeAfterInterruptionUnlocked();

    expect(resumeFollowUp).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "分别生成 Word 和 PDF 文件",
        startedAt: 100,
      }),
    );
    expect(executor.daemon.completeTask).not.toHaveBeenCalled();
  });

  it("pauses interruption resume when the final candidate is still a required-input request", async () => {
    const executor = createExecuteHarness({
      title: "You track a fast-moving technical field.",
      prompt:
        "Search the latest technical field sources and post the digest to ClickUp once the topic and destination are known.",
      lastOutput:
        "I can start the source sweep now; I’m only missing the topic.\n\nSend:\n1. the topic\n2. the ClickUp destination\n3. optionally, a non-default lookback window",
      planStepDescription: "Search the source set systematically",
    });
    executor.plan = {
      description: "Plan",
      steps: [{ id: "1", description: "Done", status: "completed" }],
    };

    await (executor as Any).resumeAfterInterruptionUnlocked();

    expect(executor.daemon.updateTaskStatus).toHaveBeenCalledWith("task-1", "paused");
    expect((executor as Any).saveConversationSnapshot).toHaveBeenCalled();
    expect(executor.daemon.completeTask).not.toHaveBeenCalled();
    expect(executor.daemon.updateTask).not.toHaveBeenCalledWith(
      "task-1",
      expect.objectContaining({ status: "failed" }),
    );
  });

  it("applies source-validation fallback during manual continuation finalization", async () => {
    const executor = createExecuteHarness({
      title: "Daily AI Agent Trends Research",
      prompt:
        "Research the latest AI agent trends from the last day and summarize key launches and funding updates.\n\n[AGENT_STRATEGY_CONTEXT_V1]\ntimeout_finalize_bias=true\n[/AGENT_STRATEGY_CONTEXT_V1]",
      lastOutput:
        "Major releases include Gemini 2.0 and Copilot Marketplace. Funding surged to $2.5B this quarter.",
      planStepDescription: "Summarize latest AI agent releases and funding trends",
      source: "cron",
    });

    executor.continuationCount = 0;
    executor.continuationWindow = 1;
    executor.continuationStrategy = "adaptive_progress";
    executor.maxAutoContinuations = 3;
    executor.minProgressScoreForAutoContinue = 0.25;
    executor.maxLifetimeTurns = 320;
    executor.lifetimeTurnCount = 10;
    executor.globalTurnCount = 60;
    executor.iterationCount = 2;
    executor.totalInputTokens = 0;
    executor.totalOutputTokens = 0;
    executor.totalCost = 0;
    executor.usageOffsetInputTokens = 0;
    executor.usageOffsetOutputTokens = 0;
    executor.usageOffsetCost = 0;
    executor.windowStartEventCount = 0;
    executor.noProgressStreak = 0;
    executor.pendingLoopStrategySwitchMessage = "";
    executor.appendConversationHistory = vi.fn();
    executor.executePlan = vi.fn(async () => undefined);
    executor.maybeCompactBeforeContinuation = vi.fn(async () => undefined);
    executor.assessContinuationWindow = vi.fn(() => ({
      progressScore: 0.6,
      loopRiskIndex: 0.2,
      repeatedFingerprintCount: 0,
      dominantFingerprint: "tool::input::ok",
      windowSummary: {
        stepCompleted: 1,
        writeMutations: 0,
        resolvedErrorRecoveries: 0,
        repeatedErrorPenalty: 0,
        emptyNoOpTurns: 0,
      },
    }));
    executor.plan = {
      description: "Plan",
      steps: [{ id: "1", description: "Done", status: "completed" }],
    };
    (executor as Any).webEvidenceMemory = [
      {
        tool: "web_fetch",
        url: "https://example.com/ai-news",
        timestamp: Date.now(),
      },
    ];

    await (executor as Any).continueAfterBudgetExhaustedUnlocked({
      mode: "manual",
    });

    expect(executor.daemon.completeTask).toHaveBeenCalledTimes(1);
    expect(executor.daemon.completeTask).toHaveBeenCalledWith(
      "task-1",
      expect.stringContaining("could not be fully validated"),
      expect.objectContaining({
        terminalStatus: "partial_success",
        failureClass: "contract_error",
      }),
    );
    expect(executor.daemon.updateTask).not.toHaveBeenCalledWith(
      "task-1",
      expect.objectContaining({ status: "failed" }),
    );
  });

  it("downgrades output-backed mutation checkpoint failures to partial success for manual tasks", async () => {
    const executor = createExecuteHarness({
      title: "Build dashboard",
      prompt: "Implement the dashboard, save the deliverables, and summarize the current state.",
      lastOutput:
        "Created the dashboard implementation and supporting notes. One mutation-required step still reported an artifact checkpoint failure, so the remaining blocker is limited to that unfinished write path rather than the rest of the completed deliverables.",
      createdFiles: ["src/dashboard.tsx", "docs/dashboard-notes.md"],
      planStepDescription: "Implement dashboard deliverables",
      source: "manual",
    });

    executor.executePlan = vi.fn(async function executePlanStub(this: Any) {
      this.plan = {
        description: "Plan",
        steps: [
          {
            id: "1",
            description: "Create dashboard deliverables",
            status: "completed",
          },
          {
            id: "2",
            description: "Write the remaining validation artifact",
            status: "failed",
            error:
              "Step contract failure [contract_unmet_write_required][artifact_write_checkpoint_failed]: iteration 7 reached without successful file/canvas mutation.",
          },
        ],
      };
      throw new Error(
        "Task failed: mutation-required contract unmet - Write the remaining validation artifact",
      );
    });

    await (executor as Any).execute();

    expect(executor.daemon.completeTask).toHaveBeenCalledWith(
      "task-1",
      expect.any(String),
      expect.objectContaining({
        terminalStatus: "partial_success",
        failureClass: "contract_unmet_write_required",
      }),
    );
    expect(executor.daemon.updateTask).not.toHaveBeenCalledWith(
      "task-1",
      expect.objectContaining({ status: "failed" }),
    );
  });

  it("completes only when the completion contract requirements are satisfied", async () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "neoworker-pdf-completion-gate-"),
    );
    const pdfPath = path.join(tempDir, "video_review.pdf");
    fs.writeFileSync(pdfPath, "%PDF-1.7\n%%EOF\n");
    const executor = createExecuteHarness({
      title: "Video review",
      prompt:
        "Create a PDF review document for this video and let me know whether I should watch it.",
      lastOutput:
        "Based on my review, recommendation: You should skip this unless you need beginner-level context.",
      createdFiles: [pdfPath],
      planStepDescription: "Verify: review transcript and provide recommendation",
    });
    executor.workspace.path = tempDir;

    await (executor as Any).execute();

    expect(executor.daemon.completeTask).toHaveBeenCalledTimes(1);
    expect(executor.daemon.updateTask).not.toHaveBeenCalledWith(
      "task-1",
      expect.objectContaining({ status: "failed" }),
    );
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("allows watch/skip recommendation tasks without creating an artifact when no file is generated", async () => {
    const executor = createExecuteHarness({
      title: "Video review",
      prompt:
        "Transcribe this YouTube video and create a document for me to review, then tell me if I should watch it.",
      lastOutput:
        "You should watch this only if you specifically need practical examples of creator-income positioning.",
      createdFiles: [],
      planStepDescription: "Review transcript and recommend",
    });
    (executor as Any).toolResultMemory = [
      {
        tool: "web_fetch",
        summary: "Fetched transcript evidence",
        timestamp: Date.now(),
      },
    ];

    await (executor as Any).execute();

    expect(executor.daemon.completeTask).toHaveBeenCalledTimes(1);
    expect(executor.daemon.updateTask).not.toHaveBeenCalledWith(
      "task-1",
      expect.objectContaining({ status: "failed" }),
    );
  });

  it("routes provider request-cancelled errors through timeout recovery instead of failing", async () => {
    const executor = createExecuteHarness({
      title: "Draft whitepaper",
      prompt: "Create a detailed whitepaper draft.",
      lastOutput: "Initial summary",
      planStepDescription: "Write the draft",
    });
    const recoverySpy = vi.fn(async () => true);

    (executor as Any).executePlan = vi.fn(async () => {
      throw new Error("Request cancelled");
    });
    (executor as Any).finalizeWithTimeoutRecovery = recoverySpy;

    await (executor as Any).execute();

    expect(recoverySpy).toHaveBeenCalledTimes(1);
    expect(executor.daemon.updateTask).not.toHaveBeenCalledWith(
      "task-1",
      expect.objectContaining({ status: "failed" }),
    );
  });

  it("waives non-mutation failed steps when soft-deadline best-effort finalization is used", () => {
    const executor = createExecuteHarness({
      title: "Build a website",
      prompt: "Create a fully working website with a few working apps.",
      lastOutput: "Refined the app shell.",
      createdFiles: ["package.json", "src/App.jsx"],
      planStepDescription: "Refine the experience",
    });
    executor.plan = {
      description: "Plan",
      steps: [
        {
          id: "1",
          description: "Implement the app shell",
          status: "completed",
        },
        { id: "2", description: "Refine the experience", status: "failed" },
      ],
    };
    (executor as Any).softDeadlineTriggered = true;
    (executor as Any).buildResultSummary = vi.fn().mockReturnValue("Refined the app shell.");

    (executor as Any).finalizeTaskWithFallback("Refined the app shell.");

    expect(executor.daemon.completeTask).toHaveBeenCalledWith(
      "task-1",
      "Refined the app shell.",
      expect.objectContaining({
        waiveFailedStepIds: expect.arrayContaining(["2"]),
      }),
    );
  });

  it("reports timed out research when tool evidence exists but no substantive answer was produced", () => {
    const executor = createExecuteHarness({
      title: "Compare repositories",
      prompt: "Research two GitHub repositories and compare their current stats.",
      lastOutput: "Found repository stats from web sources.",
      planStepDescription: "Find the repositories and collect current stats.",
    });
    executor.plan = {
      description: "Plan",
      steps: [
        {
          id: "1",
          description: "Find the repositories and collect current stats.",
          status: "failed",
          error: "Step soft-deadline reached after 810s",
        },
      ],
    };
    (executor as Any).softDeadlineTriggered = true;
    (executor as Any).toolResultMemory = [
      {
        tool: "web_fetch",
        summary: "Fetched GitHub repository metadata.",
        timestamp: Date.now(),
      },
    ];
    (executor as Any).buildResultSummary = vi
      .fn()
      .mockReturnValue("Found repository stats from web sources.");

    (executor as Any).finalizeTaskBestEffort(
      "Found repository stats from web sources.",
      "Soft deadline reached during execution. Finalizing with best-effort answer.",
    );

    expect(executor.daemon.completeTask).toHaveBeenCalledWith(
      "task-1",
      "Found repository stats from web sources.",
      expect.objectContaining({
        terminalKind: "timed_out",
        terminalStatus: "partial_success",
        failureClass: "budget_exhausted",
        waiveFailedStepIds: [],
      }),
    );
  });

  it("finalizes soft-deadline runs without waiting on LLM recovery", async () => {
    const executor = createExecuteHarness({
      title: "Compare repositories",
      prompt: "Research two GitHub repositories and compare their current stats.",
      lastOutput: "",
      planStepDescription: "Find the repositories and collect current stats.",
    });
    const recoverySpy = vi.fn();

    (executor as Any).buildTimeoutRecoveryAnswer = recoverySpy;
    (executor as Any).executePlan = vi.fn(async function executePlanSoftDeadlineStub(this: Any) {
      this.plan = {
        description: "Plan",
        steps: [
          {
            id: "1",
            description: "Find the repositories and collect current stats.",
            status: "failed",
            error: "Step soft-deadline reached after 810s",
          },
        ],
      };
      this.softDeadlineTriggered = true;
      this.toolResultMemory = [
        {
          tool: "web_search",
          summary: "Found candidate GitHub repositories.",
          timestamp: Date.now(),
        },
        {
          tool: "http_request",
          summary: "Fetched GitHub repository stats.",
          timestamp: Date.now(),
        },
      ];
    });

    await (executor as Any).execute();

    expect(recoverySpy).not.toHaveBeenCalled();
    expect(executor.daemon.completeTask).toHaveBeenCalledWith(
      "task-1",
      expect.stringContaining("Captured tool progress:"),
      expect.objectContaining({
        terminalKind: "timed_out",
        terminalStatus: "partial_success",
        failureClass: "budget_exhausted",
        waiveFailedStepIds: [],
      }),
    );
  });

  it("suppresses artifact requirements when prompt has read-only constraint", () => {
    const executor = createExecuteHarness({
      title: "Daily NeoWorker Project Brief",
      prompt: [
        "Create my daily NeoWorker development brief.",
        "Do not edit files, commit, push, publish, post externally, or change settings.",
        "This routine is for situational awareness and prioritization only.",
        "read .neoworker/PRIORITIES.md if present",
        "compare current repo state against the active priorities",
      ].join("\n"),
      lastOutput: "Daily brief prepared.",
    });

    const contract = (executor as Any).buildCompletionContract();

    expect(contract.requiresArtifactEvidence).toBe(false);
    expect(contract.requiredArtifactExtensions).toEqual([]);
    expect(contract.artifactKind).toBe("none");
  });

  it("suppresses artifact requirements with don't edit variant", () => {
    const executor = createExecuteHarness({
      title: "Architecture review",
      prompt:
        "Analyze the codebase architecture. Don't edit any files. Report back with a summary.",
      lastOutput: "Architecture summary.",
    });

    const contract = (executor as Any).buildCompletionContract();

    expect(contract.requiresArtifactEvidence).toBe(false);
    expect(contract.requiredArtifactExtensions).toEqual([]);
    expect(contract.artifactKind).toBe("none");
  });

  it("still requires artifacts when read-only constraint is absent", () => {
    const executor = createExecuteHarness({
      title: "Research report",
      prompt: "Research AI agent trends and compile a comprehensive report.",
      lastOutput: "Report prepared.",
    });

    const contract = (executor as Any).buildCompletionContract();

    expect(contract.requiresArtifactEvidence).toBe(true);
  });

  it("does not false-positive on 'fix the read-only permission issue'", () => {
    expect(detectReadOnlyConstraint("Fix the read-only permission issue on the database.")).toBe(
      false,
    );
  });

  it("does not false-positive on 'database is in read-only mode, fix it'", () => {
    expect(
      detectReadOnlyConstraint("The database is in read-only mode, fix it so writes work again."),
    ).toBe(false);
  });

  it("does not false-positive on 'debug the read-only access error'", () => {
    expect(detectReadOnlyConstraint("Debug the read-only access error users are reporting.")).toBe(
      false,
    );
  });

  it("detects read-only constraint in 'this task is read-only'", () => {
    expect(detectReadOnlyConstraint("This task is read-only. Just analyze and report.")).toBe(true);
  });
});

describe("buildCompletionGuidancePrompt", () => {
  it("includes read-only warning when hasReadOnlyConstraint is true", () => {
    const result = buildCompletionGuidancePrompt({
      hasReadOnlyConstraint: true,
      explicitOutputExtensions: [],
      likelyRequiresExecution: false,
    });
    expect(result).toContain("read-only constraints");
    expect(result).toContain("Do NOT create, modify, or delete files");
  });

  it("includes extension format guidance when extensions are specified", () => {
    const result = buildCompletionGuidancePrompt({
      hasReadOnlyConstraint: false,
      explicitOutputExtensions: [".pdf", ".xlsx"],
      likelyRequiresExecution: false,
    });
    expect(result).toContain(".pdf, .xlsx");
    expect(result).toContain("built into NeoWorker");
    expect(result).toContain("never probe guessed ports");
    expect(result).toContain('create_document with format="pdf"');
    expect(result).toContain("create_spreadsheet");
  });

  it("names the built-in PowerPoint tool for PPTX artifact tasks", () => {
    const result = buildCompletionGuidancePrompt({
      hasReadOnlyConstraint: false,
      explicitOutputExtensions: [".pptx"],
      likelyRequiresExecution: false,
    });
    expect(result).toContain("create_presentation");
    expect(result).toContain("exactly one final .pptx file");
    expect(result).not.toContain("localhost HTTP services, so probe");
  });

  it("includes execution guidance when likelyRequiresExecution is true", () => {
    const result = buildCompletionGuidancePrompt({
      hasReadOnlyConstraint: false,
      explicitOutputExtensions: [],
      likelyRequiresExecution: true,
    });
    expect(result).toContain("run_command");
  });

  it("omits execution guidance when hasReadOnlyConstraint is true", () => {
    const result = buildCompletionGuidancePrompt({
      hasReadOnlyConstraint: true,
      explicitOutputExtensions: [],
      likelyRequiresExecution: true,
    });
    expect(result).not.toContain("run_command");
  });

  it("always includes core guidance", () => {
    const result = buildCompletionGuidancePrompt({
      hasReadOnlyConstraint: false,
      explicitOutputExtensions: [],
      likelyRequiresExecution: false,
    });
    expect(result).toContain("TASK COMPLETION GUIDANCE");
    expect(result).toContain("Never fabricate tool output");
  });
});
