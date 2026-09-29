import React from "react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  buildRelatedSessionTaskTitles,
  buildSessionConversationRounds,
  buildSessionTaskNodes,
  collapseSupersededTaskOutputFiles,
  deriveRecoveredTemporaryWorkspaceOutputs,
  derivePromotedWorkspaceOutputs,
  deriveCopiedSourceArtifactPathKeys,
  getProjectFileVisual,
  mergeWorkspaceBrowserFiles,
  ProjectContextPanel,
  scopeTaskOutputFilesToLatestTurn,
  shouldDisplayWorkspaceFile,
  shouldPublishTaskOutputs,
} from "../ProjectContextPanel";
import { deriveSharedTaskEventUiState } from "../../utils/task-event-derived";
import type { Task, TaskEvent, Workspace } from "../../../shared/types";

const stylesPath = fileURLToPath(
  new URL("../project-context-panel.css", import.meta.url),
);
const sourcePath = fileURLToPath(
  new URL("../ProjectContextPanel.tsx", import.meta.url),
);

const workspace = {
  id: "workspace-1",
  name: "金融团队",
  path: "/tmp/finance-workspace",
} as Workspace;

const task = {
  id: "task-1",
  title: "整理本周市场快报",
  workspaceId: workspace.id,
  status: "completed",
} as Task;

const events = [
  {
    id: "event-1",
    taskId: task.id,
    type: "file_created",
    createdAt: Date.now(),
    payload: {
      path: "/tmp/finance-workspace/本周市场快报.docx",
    },
  },
] as TaskEvent[];

describe("ProjectContextPanel", () => {
  it("scopes this-turn outputs away from stale files in a later completion summary", () => {
    const turnEvents = [
      {
        id: "pdf-user",
        taskId: task.id,
        type: "user_message",
        timestamp: 100,
        payload: { message: "输出 PDF" },
      },
      {
        id: "pdf-completed",
        taskId: task.id,
        type: "task_completed",
        timestamp: 200,
        payload: {
          resultSummary: "交付文件：安装指南_中文.pdf",
          outputSummary: {
            created: ["安装指南_中文.pdf"],
            primaryOutputPath: "安装指南_中文.pdf",
            outputCount: 1,
          },
        },
      },
      {
        id: "excel-user",
        taskId: task.id,
        type: "user_message",
        timestamp: 300,
        payload: { message: "翻译表格，输出 Excel" },
      },
      {
        id: "excel-assistant",
        taskId: task.id,
        type: "assistant_message",
        timestamp: 400,
        payload: { message: "完成。交付文件：项目进展_EN_KO.xlsx" },
      },
      {
        id: "excel-completed",
        taskId: task.id,
        type: "task_completed",
        timestamp: 500,
        payload: {
          resultSummary: "完成。交付文件：项目进展_EN_KO.xlsx",
          outputSummary: {
            created: ["安装指南_中文.pdf"],
            modifiedFallback: ["项目进展_EN_KO.xlsx"],
            primaryOutputPath: "安装指南_中文.pdf",
            outputCount: 1,
          },
        },
      },
    ] as TaskEvent[];

    expect(
      scopeTaskOutputFilesToLatestTurn({
        workspacePath: workspace.path,
        events: turnEvents,
        files: [
          { path: "安装指南_中文.pdf", action: "created", timestamp: 500 },
          { path: "项目进展_EN_KO.xlsx", action: "created", timestamp: 500 },
        ],
      }),
    ).toEqual([
      { path: "项目进展_EN_KO.xlsx", action: "created", timestamp: 500 },
    ]);
  });

  it("uses a four-column project navigation with an inset active indicator", () => {
    const source = readFileSync(stylesPath, "utf8");

    expect(source).toMatch(
      /\.project-context-tabs\s*\{[^}]*grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\);/s,
    );
    expect(source).toMatch(
      /\.project-context-tabs button\.active::after\s*\{[^}]*bottom:\s*4px;[^}]*border-radius:\s*999px;/s,
    );
  });

  it("keeps the full project label horizontal without overlapping the workspace name", () => {
    const source = readFileSync(stylesPath, "utf8");

    expect(source).toMatch(
      /\.project-context-title > div\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*max-content minmax\(0,\s*1fr\);/s,
    );
    expect(source).toMatch(
      /\.project-context-title \.project-context-label\s*\{[^}]*width:\s*auto;[^}]*min-width:\s*0;[^}]*white-space:\s*nowrap;[^}]*word-break:\s*keep-all;[^}]*writing-mode:\s*horizontal-tb;/s,
    );
    expect(source).not.toMatch(
      /@media\s*\(max-width:\s*1180px\)[\s\S]*?\.project-context-label\s*\{\s*display:\s*none;/,
    );
  });

  it("shows only the working close action in the panel header", () => {
    const markup = renderToStaticMarkup(
      React.createElement(ProjectContextPanel, {
        task,
        workspace,
        events,
        onCollapse: () => undefined,
      }),
    );

    expect(markup).toMatch(
      /aria-label="(?:关闭工作区面板|Close workspace panel)"/,
    );
    expect(markup).not.toMatch(
      /aria-label="(?:刷新工作区文件|Refresh workspace files)"/,
    );
    expect(markup).not.toContain('aria-label="更多工作区操作"');
    expect(markup).not.toContain('aria-label="More workspace actions"');
  });

  it("uses format-specific icons for common and compound file names", () => {
    expect(getProjectFileVisual("report.pdf")).toMatchObject({
      tone: "file-pdf",
      formatBadge: "PDF",
      accessibleLabel: "PDF 文件",
    });
    expect(getProjectFileVisual("deck.pptx")).toMatchObject({
      tone: "file-presentation",
      formatBadge: "P",
      accessibleLabel: "PowerPoint 演示文稿",
    });
    expect(getProjectFileVisual("notes.md")).toMatchObject({
      tone: "file-markdown",
      formatBadge: "MD",
      accessibleLabel: "Markdown 文件",
    });
    expect(getProjectFileVisual("deck.pptx.inspect.ndjson")).toMatchObject({
      tone: "file-json",
      accessibleLabel: "NDJSON 文件",
    });
  });

  it("optically centers the tiny file-format label inside its badge", () => {
    const styles = readFileSync(stylesPath, "utf8");
    const source = readFileSync(sourcePath, "utf8");

    expect(source).toContain('className="project-file-format-badge-label"');
    expect(styles).toMatch(
      /\.project-file-format-badge-label\s*\{[^}]*top:\s*1px;[^}]*line-height:\s*1;/s,
    );
  });

  it("puts the current task outputs ahead of the full workspace", () => {
    const markup = renderToStaticMarkup(
      React.createElement(ProjectContextPanel, {
        task,
        workspace,
        events,
        onOpenBrowser: () => undefined,
      }),
    );

    expect(markup).toContain("本次产物");
    expect(markup).toContain("工作区文件");
    expect(markup).toContain("变更");
    expect(markup).toContain("会话");
    expect(markup).not.toContain("浏览器");
    expect(markup).toContain("本周市场快报.docx");
    expect(markup).toContain("完整工作区");
  });

  it("promotes nested generated documents into the workspace root without duplicating root files", () => {
    const nestedOutput = {
      path: "artifacts/skills/task-1/ppt-master/output/presentation.pptx",
      action: "created" as const,
      timestamp: 200,
    };
    expect(
      derivePromotedWorkspaceOutputs({
        isWorkspaceRoot: true,
        outputFiles: [nestedOutput],
        workspaceFiles: [
          {
            id: "artifacts",
            name: "artifacts",
            path: "/tmp/finance-workspace/artifacts",
            isDirectory: true,
          },
        ],
        workspacePath: "/tmp/finance-workspace",
      }),
    ).toEqual([nestedOutput]);

    expect(
      derivePromotedWorkspaceOutputs({
        isWorkspaceRoot: true,
        outputFiles: [{ ...nestedOutput, path: "presentation.pptx" }],
        workspaceFiles: [
          {
            id: "presentation",
            name: "presentation.pptx",
            path: "/tmp/finance-workspace/presentation.pptx",
          },
        ],
        workspacePath: "/tmp/finance-workspace",
      }),
    ).toEqual([]);
  });

  it("keeps an event-backed generated file visible before task completion", () => {
    expect(
      derivePromotedWorkspaceOutputs({
        isWorkspaceRoot: true,
        outputFiles: [
          {
            path: ".neoworker/stock-dashboard.html",
            action: "created",
            timestamp: 200,
          },
        ],
        workspaceFiles: [],
        workspacePath: "/tmp/finance-workspace",
      }),
    ).toEqual([
      {
        path: ".neoworker/stock-dashboard.html",
        action: "created",
        timestamp: 200,
      },
    ]);
  });

  it("merges durable artifact records into the workspace browser without duplicating local files", () => {
    const localRootFile = {
      id: "local-report",
      name: "report.pdf",
      path: "/tmp/finance-workspace/report.pdf",
      source: "local",
    };
    const localArtifactDirectory = {
      id: "local-artifacts",
      name: "artifacts",
      path: "/tmp/finance-workspace/artifacts",
      source: "local",
      isDirectory: true,
    };
    const durableMirrorOutput = {
      id: "artifact-nested",
      name: "presentation.pptx",
      path: "/Users/test/Library/Application Support/NeoWorker/artifacts/temporary-workspaces/finance-workspace-1234/artifacts/skills/task-1/ppt-master/output/presentation.pptx",
      source: "artifacts",
    };
    const duplicateRootArtifact = {
      id: "artifact-report",
      name: "report.pdf",
      path: "/Users/test/Library/Application Support/NeoWorker/artifacts/temporary-workspaces/finance-workspace-1234/report.pdf",
      source: "artifacts",
    };

    expect(
      mergeWorkspaceBrowserFiles(
        [localRootFile, localArtifactDirectory],
        [durableMirrorOutput, duplicateRootArtifact],
        "/tmp/finance-workspace",
      ).map((file) => file.id),
    ).toEqual(["local-report", "local-artifacts", "artifact-nested"]);
  });

  it("hides process checkpoints and scratch folders from the workspace browser", () => {
    const visibleFiles = [
      {
        id: "final",
        name: "translated.xlsx",
        path: "/tmp/finance-workspace/translated.xlsx",
      },
      {
        id: "checkpoint",
        name: "s1_r01_05.json",
        path: "/tmp/finance-workspace/s1_r01_05.json",
      },
      {
        id: "pptxwork",
        name: "pptxwork",
        path: "/tmp/finance-workspace/pptxwork",
        isDirectory: true,
      },
      {
        id: "tr",
        name: "tr",
        path: "/tmp/finance-workspace/tr",
        isDirectory: true,
      },
      {
        id: "ordinary",
        name: "research-notes.json",
        path: "/tmp/finance-workspace/research-notes.json",
      },
    ].filter((file) =>
      shouldDisplayWorkspaceFile({
        file,
        canGoBack: false,
        copiedSourceFileKeys: new Set(),
        canonicalOutputFileNames: new Set(),
        workspacePath: "/tmp/finance-workspace",
      }),
    );

    expect(visibleFiles.map((file) => file.id)).toEqual([
      "final",
      "ordinary",
    ]);
  });

  it("recognizes source files superseded by a canonical delivery copy", () => {
    const copiedSourceKeys = deriveCopiedSourceArtifactPathKeys(
      [
        {
          id: "copy-event",
          taskId: "task-1",
          type: "file_created",
          timestamp: 200,
          payload: {
            path: "artifacts/skills/task-1/ppt-master/output/presentation.pptx",
            copiedFrom: "presentation.pptx",
          },
        } as TaskEvent,
      ],
      "/tmp/finance-workspace",
    );

    expect([...copiedSourceKeys]).toEqual(["presentation.pptx"]);
  });

  it("collapses a root draft when a canonical task output has the same name", () => {
    const canonical = {
      path: "artifacts/skills/task-1/ppt-master/output/presentation.pptx",
      action: "created" as const,
      timestamp: 300,
    };

    expect(
      collapseSupersededTaskOutputFiles(
        [
          {
            path: "presentation.pptx",
            action: "created",
            timestamp: 200,
          },
          canonical,
          { ...canonical },
        ],
        "/tmp/finance-workspace",
      ),
    ).toEqual([canonical]);
  });

  it("publishes artifacts only after the task completes", () => {
    expect(shouldPublishTaskOutputs({ ...task, status: "executing" })).toBe(
      false,
    );
    expect(shouldPublishTaskOutputs({ ...task, status: "failed" })).toBe(false);
    expect(shouldPublishTaskOutputs({ ...task, status: "completed" })).toBe(
      true,
    );

    const processingMarkup = renderToStaticMarkup(
      React.createElement(ProjectContextPanel, {
        task: { ...task, status: "executing" } as Task,
        workspace,
        events,
      }),
    );
    expect(processingMarkup).not.toContain("本周市场快报.docx");
    expect(processingMarkup).toContain("文件正在处理中");
    expect(processingMarkup).toContain(
      "处理完成并通过校验后，最终文件会统一显示在这里。",
    );

    const failedMarkup = renderToStaticMarkup(
      React.createElement(ProjectContextPanel, {
        task: { ...task, status: "failed" } as Task,
        workspace,
        events,
      }),
    );
    expect(failedMarkup).not.toContain("本周市场快报.docx");
    expect(failedMarkup).toContain("本次没有发布可交付产物");
  });

  it("explains when a completed task returned chat results without writing files", () => {
    const markup = renderToStaticMarkup(
      React.createElement(ProjectContextPanel, {
        task: { ...task, status: "completed" } as Task,
        workspace,
        events: [],
        onOpenBrowser: () => undefined,
      }),
    );

    expect(markup).toContain("本次任务没有写入文件");
    expect(markup).toContain(
      "结果已显示在对话中；只有实际生成或修改的文件才会出现在这里。",
    );
  });

  it("recovers current outputs from full events when shared state missed a late artifact", () => {
    const completedTask = { ...task, status: "completed" } as Task;
    const completed = {
      id: "completed",
      taskId: task.id,
      type: "task_completed",
      timestamp: 100,
      payload: {
        resultSummary: "已完成，正式 PPT 已生成。",
        outputSummary: {
          created: [],
          outputCount: 0,
          folders: [],
        },
      },
    } as TaskEvent;
    const artifact = {
      id: "artifact",
      taskId: task.id,
      type: "artifact_created",
      timestamp: 200,
      payload: {
        path: "上海-广州航班查询_2026-09-14.pptx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      },
    } as TaskEvent;
    const staleSharedState = deriveSharedTaskEventUiState({
      rawEvents: [completed],
      task: completedTask,
      workspace,
      projectionMode: "inspect",
    });

    const markup = renderToStaticMarkup(
      React.createElement(ProjectContextPanel, {
        task: completedTask,
        workspace,
        events: [completed, artifact],
        sharedTaskEventUi: staleSharedState,
        onOpenBrowser: () => undefined,
      }),
    );

    expect(markup).toContain("本次产物");
    expect(markup).toContain("上海-广州航班查询_2026-09-14.pptx");
    expect(markup).not.toContain("本次任务没有写入文件");
  });

  it("recovers a completed current-turn deliverable that exists on disk but missed its file event", () => {
    const completedTask = {
      ...task,
      status: "completed",
      createdAt: 100,
      updatedAt: 500,
      completedAt: 500,
      error: undefined,
    } as Task;
    const currentTurnEvents = [
      {
        id: "previous-user",
        taskId: task.id,
        type: "user_message",
        timestamp: 120,
        payload: { message: "翻译成韩文" },
      },
      {
        id: "previous-assistant",
        taskId: task.id,
        type: "assistant_message",
        timestamp: 180,
        payload: { message: "交付文件：previous-output.pptx" },
      },
      {
        id: "current-user",
        taskId: task.id,
        type: "user_message",
        timestamp: 300,
        payload: { message: "输出日文版，PDF文件，保留图片" },
      },
      {
        id: "current-assistant",
        taskId: task.id,
        type: "assistant_message",
        timestamp: 450,
        payload: {
          message: "已完成。交付文件：华为AI CloudMatrix 384-日英对照版.pdf",
        },
      },
      {
        id: "current-completed",
        taskId: task.id,
        type: "task_completed",
        timestamp: 500,
        payload: {
          resultSummary:
            "已完成。交付文件：华为AI CloudMatrix 384-日英对照版.pdf",
          outputSummary: { created: [], outputCount: 0, folders: [] },
        },
      },
    ] as TaskEvent[];

    expect(
      deriveRecoveredTemporaryWorkspaceOutputs({
        task: completedTask,
        workspace: { ...workspace, isTemp: true },
        events: currentTurnEvents,
        files: [
          {
            id: "previous-output",
            name: "previous-output.pptx",
            path: "/tmp/finance-workspace/previous-output.pptx",
            source: "local",
            modifiedAt: 180,
          },
          {
            id: "uploaded-source",
            name: "source.pdf",
            path: "/tmp/finance-workspace/source.pdf",
            source: "local",
            modifiedAt: 320,
          },
          {
            id: "current-output",
            name: "华为AI CloudMatrix 384-日英对照版.pdf",
            path:
              "/tmp/finance-workspace/华为AI CloudMatrix 384-日英对照版.pdf",
            source: "local",
            modifiedAt: 460,
          },
        ],
      }),
    ).toEqual([
      {
        path:
          "/tmp/finance-workspace/华为AI CloudMatrix 384-日英对照版.pdf",
        action: "created",
        timestamp: 460,
      },
    ]);
  });

  it("recovers only current-turn durable artifacts for the active task", () => {
    const completedTask = {
      ...task,
      status: "completed",
      createdAt: 100,
      updatedAt: 500,
      completedAt: 500,
      error: undefined,
    } as Task;
    const currentTurnEvents = [
      {
        id: "current-user",
        taskId: task.id,
        type: "user_message",
        timestamp: 300,
        payload: { message: "生成PDF" },
      },
      {
        id: "current-completed",
        taskId: task.id,
        type: "task_completed",
        timestamp: 500,
        payload: {
          resultSummary: "已经完成。",
          outputSummary: { created: [], outputCount: 0, folders: [] },
        },
      },
    ] as TaskEvent[];

    expect(
      deriveRecoveredTemporaryWorkspaceOutputs({
        task: completedTask,
        workspace: { ...workspace, isTemp: true },
        events: currentTurnEvents,
        files: [
          {
            id: "old-artifact",
            name: "old.pptx",
            path: "/tmp/finance-workspace/old.pptx",
            source: "artifacts",
            modifiedAt: 200,
          },
          {
            id: "current-artifact",
            name: "current.pdf",
            path: "/tmp/finance-workspace/current.pdf",
            source: "artifacts",
            modifiedAt: 450,
          },
        ],
      }),
    ).toEqual([
      {
        path: "/tmp/finance-workspace/current.pdf",
        action: "created",
        timestamp: 450,
      },
    ]);
  });

  it("scopes asynchronous recovered outputs to the active task and workspace", () => {
    const source = readFileSync(sourcePath, "utf8");

    expect(source).toContain(
      'const recoveredOutputScopeKey = `${task?.id || "no-task"}:${workspace?.path || "no-workspace"}`',
    );
    expect(source).toContain("const requestId = ++recoveredOutputsRequestRef.current");
    expect(source).toContain(
      "if (requestId !== recoveredOutputsRequestRef.current) return",
    );
    expect(source).toContain(
      "recoveredOutputState.scopeKey === recoveredOutputScopeKey",
    );
  });

  it("defaults to outputs and only restores scroll saved for that tab", () => {
    const source = readFileSync(sourcePath, "utf8");

    expect(source).toContain("const projectPanelStateCache = new Map<");
    expect(source).toContain('visibleProjectId || "no-project"');
    expect(source).toContain('workspace?.id || "no-workspace"');
    expect(source).toContain('task?.sessionId || task?.id || "no-task"');
    expect(source).toContain(
      'panelBodyRef.current.scrollTop = cached?.activeTab === "outputs" ? cached.scrollTop : 0',
    );
    expect(source).toContain('const nextTab = "outputs"');
    expect(source).toContain("scrollTop: event.currentTarget.scrollTop");
  });

  it("builds explicit parent and branch provenance for session task nodes", () => {
    const root = {
      ...task,
      id: "root",
      sessionId: "session-1",
      createdAt: 1,
    } as Task;
    const child = {
      ...task,
      id: "child",
      sessionId: "session-1",
      parentTaskId: "root",
      createdAt: 2,
    } as Task;
    const branch = {
      ...task,
      id: "branch",
      sessionId: "session-2",
      branchFromTaskId: "child",
      createdAt: 3,
    } as Task;

    expect(buildSessionTaskNodes([branch, child, root], "child")).toMatchObject(
      [
        { task: { id: "root" }, relation: "root", depth: 0 },
        {
          task: { id: "child" },
          relation: "child",
          sourceTaskId: "root",
          depth: 1,
        },
        {
          task: { id: "branch" },
          relation: "branch",
          sourceTaskId: "child",
          depth: 2,
        },
      ],
    );
  });

  it("localizes generated expert titles in related tasks and labels synthesis retries", () => {
    const nodes = [
      "Anansi (builder)",
      "Apollo (inspector)",
      "Ares (explorer)",
      "Synthesis",
      "Synthesis",
    ].map(
      (title, index) =>
        ({
          task: {
            ...task,
            id: `related-${index}`,
            title,
            createdAt: index,
          } as Task,
          depth: 1,
          relation: "child",
        }) as SessionTaskNode,
    );

    expect(
      Array.from(buildRelatedSessionTaskTitles(nodes, "zh-CN").values()),
    ).toEqual([
      "方案构建专家",
      "质量审查专家",
      "资料调研专家",
      "综合智能体",
      "综合智能体（重试 1）",
    ]);
  });

  it("builds one visible conversation round for every user follow-up", () => {
    const conversationEvents = [
      {
        id: "user-1",
        taskId: task.id,
        timestamp: 100,
        type: "user_message",
        payload: { message: "整理这个目录" },
      },
      {
        id: "assistant-1",
        taskId: task.id,
        timestamp: 200,
        type: "assistant_message",
        payload: { message: "目录已经整理完成。" },
      },
      {
        id: "completed-1",
        taskId: task.id,
        timestamp: 300,
        type: "task_completed",
        payload: {},
      },
      {
        id: "user-2",
        taskId: task.id,
        timestamp: 400,
        type: "user_message",
        payload: { message: "文件在哪里？" },
      },
      {
        id: "assistant-progress",
        taskId: task.id,
        timestamp: 500,
        type: "assistant_message",
        payload: { message: "正在确认路径。" },
      },
      {
        id: "assistant-2",
        taskId: task.id,
        timestamp: 600,
        type: "assistant_message",
        payload: { message: "文件位于工作区的产物目录。" },
      },
      {
        id: "completed-2",
        taskId: task.id,
        timestamp: 700,
        type: "follow_up_completed",
        payload: {},
      },
    ] as TaskEvent[];

    expect(
      buildSessionConversationRounds(conversationEvents, {
        ...task,
        prompt: "整理这个目录",
        createdAt: 50,
        status: "completed",
      } as Task),
    ).toEqual([
      {
        id: "user-1",
        turnId: "initial",
        userText: "整理这个目录",
        assistantText: "目录已经整理完成。",
        timestamp: 100,
        status: "completed",
      },
      {
        id: "user-2",
        turnId: "event:user-2",
        userText: "文件在哪里？",
        assistantText: "文件位于工作区的产物目录。",
        timestamp: 400,
        status: "completed",
      },
    ]);
  });

  it("recovers session rounds from follow-up boundaries and completion summaries", () => {
    const conversationEvents = [
      {
        id: "user-1",
        taskId: task.id,
        timestamp: 100,
        type: "user_message",
        payload: { message: "帮我查一下明天北京飞深圳的航班信息" },
      },
      {
        id: "completed-1",
        taskId: task.id,
        timestamp: 200,
        type: "task_completed",
        payload: {
          resultSummary: "北京到深圳航班查询完成，共找到多个直飞班次。",
        },
      },
      {
        id: "follow-up-started",
        taskId: task.id,
        timestamp: 300,
        type: "follow_up_started",
        payload: {
          followUpMessage: "帮我看一下本地磁盘情况",
          turnId: "turn-disk",
        },
      },
      {
        id: "follow-up-completed",
        taskId: task.id,
        timestamp: 400,
        type: "follow_up_completed",
        payload: {
          resultSummary: "磁盘情况我查完了，数据卷剩余空间较少。",
        },
      },
    ] as TaskEvent[];

    expect(
      buildSessionConversationRounds(conversationEvents, {
        ...task,
        prompt: "帮我查一下明天北京飞深圳的航班信息",
        createdAt: 50,
        status: "completed",
      } as Task),
    ).toEqual([
      {
        id: "user-1",
        turnId: "initial",
        userText: "帮我查一下明天北京飞深圳的航班信息",
        assistantText: "北京到深圳航班查询完成，共找到多个直飞班次。",
        timestamp: 100,
        status: "completed",
      },
      {
        id: "follow-up-started",
        turnId: "event:follow-up-started",
        userText: "帮我看一下本地磁盘情况",
        assistantText: "磁盘情况我查完了，数据卷剩余空间较少。",
        timestamp: 300,
        status: "completed",
      },
    ]);
  });

  it("coalesces the started and user-message events emitted for one follow-up", () => {
    const followUpText =
      "帮我翻译成中文和韩文，要中韩文对照，输出 PDF，保留图片";
    const conversationEvents = [
      {
        id: "initial-user",
        taskId: task.id,
        timestamp: 100,
        type: "user_message",
        payload: { message: "明天上海飞深圳的航班，帮我查一下" },
      },
      {
        id: "initial-completed",
        taskId: task.id,
        timestamp: 200,
        type: "task_completed",
        payload: { resultSummary: "航班查询完成。" },
      },
      {
        id: "follow-up-started",
        taskId: task.id,
        timestamp: 300,
        type: "follow_up_started",
        payload: { followUpMessage: followUpText },
      },
      {
        id: "follow-up-user",
        taskId: task.id,
        timestamp: 301,
        type: "user_message",
        payload: { message: followUpText },
      },
      {
        id: "follow-up-assistant",
        taskId: task.id,
        timestamp: 400,
        type: "assistant_message",
        payload: { message: "中韩文对照 PDF 已生成。" },
      },
      {
        id: "follow-up-completed",
        taskId: task.id,
        timestamp: 500,
        type: "task_completed",
        payload: {},
      },
    ] as TaskEvent[];

    expect(
      buildSessionConversationRounds(conversationEvents, {
        ...task,
        prompt: "明天上海飞深圳的航班，帮我查一下",
        createdAt: 50,
        status: "completed",
      } as Task),
    ).toEqual([
      {
        id: "initial-user",
        turnId: "initial",
        userText: "明天上海飞深圳的航班，帮我查一下",
        assistantText: "航班查询完成。",
        timestamp: 100,
        status: "completed",
      },
      {
        id: "follow-up-user",
        turnId: "event:follow-up-user",
        userText: followUpText,
        assistantText: "中韩文对照 PDF 已生成。",
        timestamp: 301,
        status: "completed",
      },
    ]);
  });

  it("keeps attachment metadata out of conversation round titles", () => {
    const message = [
      "输出日文版，PDF文件，保留图片",
      "",
      "Attached files (relative to workspace):",
      "- 华为AI CloudMatrix 384-中英对照版.pdf (.neoworker/uploads/123/source.pdf)",
      "  Attachment metadata: size=7892999; mime=application/pdf",
    ].join("\n");
    const conversationEvents = [
      {
        id: "follow-up-started",
        taskId: task.id,
        timestamp: 300,
        type: "follow_up_started",
        payload: { followUpMessage: message, turnId: "turn-pdf" },
      },
      {
        id: "follow-up-user",
        taskId: task.id,
        timestamp: 301,
        type: "user_message",
        payload: { message },
      },
      {
        id: "follow-up-completed",
        taskId: task.id,
        timestamp: 400,
        type: "task_completed",
        payload: { resultSummary: "日文 PDF 已完成。" },
      },
    ] as TaskEvent[];

    expect(
      buildSessionConversationRounds(conversationEvents, {
        ...task,
        prompt: "",
        rawPrompt: "",
        userPrompt: "",
        createdAt: 50,
        status: "completed",
      } as Task),
    ).toEqual([
      {
        id: "follow-up-user",
        turnId: "event:follow-up-user",
        userText: "输出日文版，PDF文件，保留图片",
        assistantText: "日文 PDF 已完成。",
        timestamp: 301,
        status: "completed",
      },
    ]);
  });

  it("keeps two intentional user messages even when their text is identical", () => {
    const conversationEvents = [
      {
        id: "user-1",
        taskId: task.id,
        timestamp: 100,
        type: "user_message",
        payload: { message: "继续" },
      },
      {
        id: "user-2",
        taskId: task.id,
        timestamp: 200,
        type: "user_message",
        payload: { message: "继续" },
      },
    ] as TaskEvent[];

    expect(
      buildSessionConversationRounds(conversationEvents, {
        ...task,
        prompt: "继续",
        createdAt: 50,
        status: "executing",
      } as Task),
    ).toMatchObject([
      { id: "user-1", userText: "继续", status: "waiting" },
      { id: "user-2", userText: "继续", status: "working" },
    ]);
  });

  it("combines conversation rounds from related main tasks without showing subagents", () => {
    const continuationTask = {
      ...task,
      id: "task-continuation",
      title: "继续整理本周市场快报",
      prompt: "继续整理本周市场快报",
      createdAt: 250,
      updatedAt: 450,
      sessionId: "session-1",
      agentType: "main",
    } as Task;
    const subTask = {
      ...task,
      id: "task-subagent",
      title: "资料调研专家",
      prompt: "搜索资料",
      createdAt: 150,
      updatedAt: 350,
      sessionId: "session-1",
      agentType: "sub",
      parentTaskId: task.id,
    } as Task;
    const conversationEvents = [
      {
        id: "current-user",
        taskId: task.id,
        timestamp: 100,
        type: "user_message",
        payload: { message: "整理本周市场快报" },
      },
      {
        id: "current-completed",
        taskId: task.id,
        timestamp: 200,
        type: "task_completed",
        payload: { resultSummary: "第一轮整理完成。" },
      },
      {
        id: "continuation-user",
        taskId: continuationTask.id,
        timestamp: 300,
        type: "user_message",
        payload: { message: "继续补充结论" },
      },
      {
        id: "continuation-completed",
        taskId: continuationTask.id,
        timestamp: 400,
        type: "task_completed",
        payload: { resultSummary: "结论已经补充。" },
      },
      {
        id: "subagent-user",
        taskId: subTask.id,
        timestamp: 350,
        type: "user_message",
        payload: { message: "搜索资料" },
      },
    ] as TaskEvent[];

    expect(
      buildSessionConversationRounds(
        conversationEvents,
        {
          ...task,
          prompt: "整理本周市场快报",
          createdAt: 50,
          sessionId: "session-1",
          status: "completed",
        } as Task,
        [task, continuationTask, subTask],
      ),
    ).toEqual([
      {
        id: "current-user",
        taskId: task.id,
        turnId: "initial",
        userText: "整理本周市场快报",
        assistantText: "第一轮整理完成。",
        timestamp: 100,
        status: "completed",
      },
      {
        id: "continuation-user",
        taskId: continuationTask.id,
        turnId: "event:continuation-user",
        userText: "继续补充结论",
        assistantText: "结论已经补充。",
        timestamp: 300,
        status: "completed",
      },
    ]);
  });

  it("ignores other task dialogue when building conversation rounds", () => {
    const conversationEvents = [
      {
        id: "other-user",
        taskId: "task-other",
        timestamp: 80,
        type: "user_message",
        payload: { message: "/ppt-master 帮我优化一下 PPT" },
      },
      {
        id: "user-current",
        taskId: task.id,
        timestamp: 100,
        type: "user_message",
        payload: { message: "你好" },
      },
      {
        id: "other-assistant",
        taskId: "task-other",
        timestamp: 150,
        type: "assistant_message",
        payload: { message: "这段内容属于另一个任务。" },
      },
      {
        id: "assistant-current",
        taskId: task.id,
        timestamp: 200,
        type: "assistant_message",
        payload: { message: "你好！我是 NeoWorker。" },
      },
      {
        id: "other-completed",
        taskId: "task-other",
        timestamp: 250,
        type: "task_completed",
        payload: {},
      },
      {
        id: "completed-current",
        taskId: task.id,
        timestamp: 300,
        type: "task_completed",
        payload: {},
      },
    ] as TaskEvent[];

    expect(
      buildSessionConversationRounds(conversationEvents, {
        ...task,
        prompt: "你好",
        createdAt: 50,
        status: "completed",
      } as Task),
    ).toEqual([
      {
        id: "user-current",
        turnId: "initial",
        userText: "你好",
        assistantText: "你好！我是 NeoWorker。",
        timestamp: 100,
        status: "completed",
      },
    ]);
  });

  it("recovers real files written shortly after a failed temporary-workspace artifact task", () => {
    const temporaryWorkspace = {
      ...workspace,
      id: "__temp_workspace__:session-1",
      isTemp: true,
    } as Workspace;
    const failedArtifactTask = {
      ...task,
      workspaceId: temporaryWorkspace.id,
      status: "failed",
      createdAt: 100_000,
      updatedAt: 200_000,
      completedAt: 200_000,
      error: "Task missing artifact evidence: expected an output file/document",
    } as Task;

    const recovered = deriveRecoveredTemporaryWorkspaceOutputs({
      task: failedArtifactTask,
      workspace: temporaryWorkspace,
      files: [
        {
          id: "report",
          name: "report.html",
          path: "/tmp/finance-workspace/report.html",
          modifiedAt: 220_000,
        },
        {
          id: "old",
          name: "old.md",
          path: "/tmp/finance-workspace/old.md",
          modifiedAt: 90_000,
        },
        {
          id: "folder",
          name: "assets",
          path: "/tmp/finance-workspace/assets",
          modifiedAt: 220_000,
          isDirectory: true,
        },
        {
          id: "unrelated-later-file",
          name: "later.md",
          path: "/tmp/finance-workspace/later.md",
          modifiedAt: 2_000_001,
        },
      ],
    });

    expect(recovered).toEqual([
      {
        path: "/tmp/finance-workspace/report.html",
        action: "created",
        timestamp: 220_000,
      },
    ]);
    expect(
      deriveRecoveredTemporaryWorkspaceOutputs({
        task: failedArtifactTask,
        workspace,
        files: [],
      }),
    ).toEqual([]);
  });
});

it("shows only the final PDF in both delivery surfaces after generation and shell rename", async () => {
  const { collectEndOfTaskArtifactCardStacks } = await import("../MainContent/artifact-logic");
  const files = ["manuscript.md", "report.pdf", "report-v2.pdf", "final.pdf"].map((p) => ({ path: p, action: "created" as const, timestamp: 10 }));
  const events = files.slice(0, 3).map((file, i) => ({ id: String(i), taskId: "task", type: "artifact_created", timestamp: i + 1, payload: { path: file.path } })) as TaskEvent[];
  events.push({ id: "done", taskId: "task", type: "task_completed", timestamp: 10, payload: {
    resultSummary: "交付文件：`final.pdf`", outputSummary: { created: [], modifiedFallback: ["final.pdf"], primaryOutputPath: "final.pdf", outputCount: 1, folders: ["."] },
  } } as TaskEvent);
  const stacks = collectEndOfTaskArtifactCardStacks(events);
  expect(stacks.flatMap((s) => s.artifacts.map((a) => a.path))).toEqual(["final.pdf"]);
  expect(scopeTaskOutputFilesToLatestTurn({ files, events })).toEqual([files[3]]);
  const derived = deriveSharedTaskEventUiState({ task: { id: "task", status: "completed" } as Task, rawEvents: events, workspacePath: "/workspace" } as Any);
  // Both projections must work after event history rehydration too.
  expect(scopeTaskOutputFilesToLatestTurn({ files: derived.files, events })).toHaveLength(1);
  expect(scopeTaskOutputFilesToLatestTurn({ files: derived.files, events })[0].path).toBe("final.pdf");
});
