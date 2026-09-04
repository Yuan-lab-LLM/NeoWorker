import { afterEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { Task, TaskEvent, Workspace } from "../../../shared/types";
import {
  collectEndOfTaskArtifactCardStacks,
  collectLatestEndOfTaskArtifactCards,
  resolveArtifactPathsAgainstTaskEvents,
  collectInlineRunCommandSessionIds,
  composeMessageWithAttachments,
  deriveAgentReasoningPanelState,
  deriveComposerTaskSettings,
  deriveTaskHeaderPresentation,
  estimateTaskFeedRowHeight,
  extractGeneratedArtifactPathsFromText,
  formatStepFailedTitleForDisplay,
  formatTimelineErrorTitleForDisplay,
  getWorkspaceStatusFolderLabel,
  getInlinePreviewKindForGeneratedFile,
  getInlinePreviewKindForTaskEvent,
  getAutoScrollTargetTop,
  pinScrollElementToBottom,
  getBootstrapProgressTitle,
  deriveProgressHeartbeat,
  getDefaultTranscriptMode,
  getVisibleEndOfTaskArtifactCards,
  getEndOfTaskArtifactStackAnchorEventId,
  getEarliestTaskEventStreamIndex,
  hasInactiveStringSetEntries,
  pruneStringSetToActiveIds,
  selectVisibleTaskFeedRows,
  selectVisibleCommandOutputSessions,
  shouldCreateFreshTaskForSend,
  shouldRenderOpenArtifactCardAtEvent,
  shouldSuppressInitialPromptUserEvent,
  shouldShowBootstrapProgressRow,
  shouldMarkActionBlockActiveForCurrentTurn,
  shouldBypassLiveTaskEventProjection,
  shouldIncludeExecutionRecordEvents,
  shouldShowChatTaskExecutionRows,
  shouldScheduleAutoScrollWrite,
  TaskAutomationModal,
  TaskSessionLineageFooter,
} from "../MainContent";
import { isTaskActivelyWorking } from "../../utils/task-working-state";
import {
  buildTaskAutomationCronJobCreate,
  buildTaskAutomationSchedule,
  buildTaskRoutineCreate,
  TASK_AUTOMATION_TEMPLATES,
} from "../task-automation-utils";

const mainContentPath = fileURLToPath(
  new URL("../MainContent/MainContent.tsx", import.meta.url),
);
const messageUiPath = fileURLToPath(
  new URL("../MainContent/message-ui.tsx", import.meta.url),
);
const appPath = fileURLToPath(new URL("../../App.tsx", import.meta.url));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("shouldCreateFreshTaskForSend", () => {
  it("forces a fresh task for deterministic app shortcut handling even when a task is selected", () => {
    expect(
      shouldCreateFreshTaskForSend({
        executionMode: "execute",
        selectedTaskId: "task-1",
        selectedTaskExecutionMode: "execute",
        forceFreshTask: true,
      }),
    ).toBe(true);
  });

  it("starts a new session after a collaborative team task has finished", () => {
    expect(
      shouldCreateFreshTaskForSend({
        executionMode: "execute",
        selectedTaskId: "team-task-1",
        selectedTaskExecutionMode: "execute",
        selectedTaskCollaborativeMode: true,
        selectedTaskStatus: "completed",
      }),
    ).toBe(true);

    expect(
      shouldCreateFreshTaskForSend({
        executionMode: "execute",
        selectedTaskId: "team-task-1",
        selectedTaskExecutionMode: "execute",
        selectedTaskCollaborativeMode: true,
        selectedTaskStatus: "executing",
      }),
    ).toBe(false);
  });

  it("keeps ordinary completed tasks in the current session", () => {
    expect(
      shouldCreateFreshTaskForSend({
        executionMode: "execute",
        selectedTaskId: "task-1",
        selectedTaskExecutionMode: "execute",
        selectedTaskCollaborativeMode: false,
        selectedTaskStatus: "completed",
      }),
    ).toBe(false);
  });

  it("starts Chat in a fresh task unless the selected task is already Chat", () => {
    expect(
      shouldCreateFreshTaskForSend({
        executionMode: "chat",
        selectedTaskId: "execute-task",
        selectedTaskExecutionMode: "execute",
      }),
    ).toBe(true);
    expect(
      shouldCreateFreshTaskForSend({
        executionMode: "chat",
        selectedTaskId: "chat-task",
        selectedTaskExecutionMode: "chat",
      }),
    ).toBe(false);
  });

  it("keeps an explicitly selected skill in the current task follow-up", () => {
    const mainContentSource = readFileSync(mainContentPath, "utf8");

    expect(mainContentSource).not.toContain("Boolean(composerSkillContext) ||");
    expect(mainContentSource).toContain(
      "requestedSkillId: composerSkillContext.skillId",
    );
  });
});

describe("deriveComposerTaskSettings", () => {
  it("restores the task mode, domain, automation flags, and selected skill", () => {
    expect(
      deriveComposerTaskSettings({
        executionMode: "chat",
        taskDomain: "research",
        autonomousMode: true,
        requestedSkillId: "web-research",
      }),
    ).toEqual(
      expect.objectContaining({
        executionMode: "chat",
        taskDomain: "research",
        autonomousModeEnabled: true,
        requestedSkillId: "web-research",
      }),
    );
  });

  it("uses stable defaults only when a task has no saved settings", () => {
    expect(deriveComposerTaskSettings(undefined)).toEqual(
      expect.objectContaining({
        executionMode: "execute",
        taskDomain: "auto",
        autonomousModeEnabled: false,
        requestedSkillId: null,
      }),
    );
  });

  it("migrates retired general and operations domains back to auto", () => {
    expect(
      deriveComposerTaskSettings({ taskDomain: "general" }).taskDomain,
    ).toBe("auto");
    expect(
      deriveComposerTaskSettings({ taskDomain: "operations" }).taskDomain,
    ).toBe("auto");
  });
});

describe("formatStepFailedTitleForDisplay", () => {
  it("uses a concise title when the failure reason duplicates the step description", () => {
    expect(
      formatStepFailedTitleForDisplay({
        step: { description: "Unable to access workspace path." },
        reason: "Unable to access workspace path.",
      }),
    ).toBe("Step failed");
  });

  it("summarizes completion guard failures instead of echoing the full detail", () => {
    expect(
      formatStepFailedTitleForDisplay({
        step: {
          description:
            "Task missing verification evidence: no completed review/verification step or review-backed conclusion was detected.",
        },
        reason:
          "Task missing verification evidence: no completed review/verification step or review-backed conclusion was detected.",
      }),
    ).toBe("Verification evidence missing");
  });

  it("keeps useful step context when the reason adds new detail", () => {
    expect(
      formatStepFailedTitleForDisplay({
        step: {
          description: "Run the browser QA pass and capture screenshots",
        },
        reason: "Playwright timed out waiting for localhost.",
      }),
    ).toBe("Step failed: Run the browser QA pass and capture screenshots");
  });
});

describe("formatTimelineErrorTitleForDisplay", () => {
  it("summarizes wrapped completion guard errors", () => {
    expect(
      formatTimelineErrorTitleForDisplay(
        "Task execution failed: Error: Task missing verification evidence: no completed review/verification step or review-backed conclusion was detected.",
      ),
    ).toBe("Verification evidence missing");
  });
});

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    title: "Test task",
    prompt: "Test prompt",
    status: "executing",
    createdAt: 0,
    updatedAt: 0,
    executionMode: "execute",
    ...overrides,
  } as Task;
}

function makeEvent(
  id: string,
  timestamp: number,
  type: TaskEvent["type"],
  payload: Record<string, unknown> = {},
): TaskEvent {
  return {
    id,
    taskId: "task-1",
    timestamp,
    type,
    payload,
  } as TaskEvent;
}

function makeWorkspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    id: "workspace-1",
    name: "Workspace",
    path: "/workspace",
    createdAt: 1,
    permissions: {
      read: true,
      write: true,
      delete: false,
      network: false,
      shell: false,
    },
    ...overrides,
  };
}

describe("getWorkspaceStatusFolderLabel", () => {
  it("shows only the final folder name for workspace paths", () => {
    expect(
      getWorkspaceStatusFolderLabel(
        makeWorkspace({
          path: "/Users/mesut/Downloads/app/neoworker",
          name: "Custom name",
        }),
      ),
    ).toBe("neoworker");
    expect(
      getWorkspaceStatusFolderLabel(
        makeWorkspace({ path: "C:\\Users\\mesut\\neoworker" }),
      ),
    ).toBe("neoworker");
  });

  it("keeps temp and missing workspace fallbacks", () => {
    expect(getWorkspaceStatusFolderLabel(makeWorkspace({ isTemp: true }))).toBe(
      "Work in a folder",
    );
    expect(getWorkspaceStatusFolderLabel(null)).toBe("No folder selected");
  });
});

describe("shouldSuppressInitialPromptUserEvent", () => {
  const initialPrompt =
    "Research and compare two GitHub repositories.\nStep 1: collect stats.";

  it("suppresses a timeline v2 user_message that repeats the anchored task prompt", () => {
    const event = makeEvent("user-event", 11_000, "timeline_step_updated", {
      legacyType: "user_message",
      message: initialPrompt,
    });

    expect(
      shouldSuppressInitialPromptUserEvent({
        event,
        initialPromptEventId: null,
        trimmedPrompt: initialPrompt,
        taskCreatedAt: 10_000,
      }),
    ).toBe(true);
  });

  it("keeps later follow-up messages even when they happen to repeat the original prompt", () => {
    const event = makeEvent("follow-up", 90_000, "timeline_step_updated", {
      legacyType: "user_message",
      message: initialPrompt,
    });

    expect(
      shouldSuppressInitialPromptUserEvent({
        event,
        initialPromptEventId: null,
        trimmedPrompt: initialPrompt,
        taskCreatedAt: 10_000,
      }),
    ).toBe(false);
  });
});

describe("task automation creation", () => {
  it("renders the modal with task-derived defaults", () => {
    const task = makeTask({
      id: "task-123",
      title: "Task menu automation",
      prompt: "Turn this task into a recurring check",
      workspaceId: "workspace-1",
    });
    const html = renderToStaticMarkup(
      React.createElement(TaskAutomationModal, {
        task,
        workspace: makeWorkspace(),
        defaultName: "Task menu automation",
        defaultPrompt: "Turn this task into a recurring check",
        deeplink: "neoworker://tasks/task-123",
        onClose: vi.fn(),
      }),
    );

    expect(html).toContain("创建例行任务");
    expect(html).toContain("Task menu automation");
    expect(html).toContain("Turn this task into a recurring check");
    expect(html).toContain("手动");
  });

  it("builds the default Every 30m scheduled job payload from a task", () => {
    const before = Date.now();
    const task = makeTask({
      id: "task-123",
      title: "Review recent failures",
      prompt: "Look at the failing tests",
      workspaceId: "workspace-1",
    });
    const schedule = buildTaskAutomationSchedule("every30m", "");

    expect(schedule).toMatchObject({
      kind: "every",
      everyMs: 30 * 60 * 1000,
    });
    expect(
      schedule?.kind === "every" ? schedule.anchorMs : null,
    ).toBeGreaterThanOrEqual(before);
    expect(
      buildTaskAutomationCronJobCreate({
        task,
        workspace: makeWorkspace(),
        name: "Review recent failures",
        prompt: "Look at the failing tests",
        runMode: "chat",
        schedule: schedule!,
        deeplink: "neoworker://tasks/task-123",
      }),
    ).toMatchObject({
      name: "Review recent failures",
      description: "Created from task task-123 (neoworker://tasks/task-123)",
      enabled: true,
      shellAccess: false,
      allowUserInput: false,
      deleteAfterRun: false,
      schedule,
      workspaceId: "workspace-1",
      taskTitle: "Review recent failures",
    });
  });

  it("builds a routine payload from a task session", () => {
    const task = makeTask({
      id: "task-123",
      title: "Review recent failures",
      prompt: "Look at the failing tests",
      workspaceId: "workspace-1",
      sessionId: "session-1",
    });
    const schedule = buildTaskAutomationSchedule("daily", "")!;

    expect(
      buildTaskRoutineCreate({
        task,
        workspace: makeWorkspace(),
        name: "Review recent failures",
        prompt: "Look at the failing tests",
        runMode: "chat",
        triggerPreset: "daily",
        schedule,
        deeplink: "neoworker://tasks/task-123",
      }),
    ).toMatchObject({
      name: "Review recent failures",
      enabled: true,
      workspaceId: "workspace-1",
      executionTarget: { kind: "workspace" },
      contextBindings: {
        metadata: {
          source: "task_session",
          sourceTaskId: "task-123",
          sourceSessionId: "session-1",
        },
      },
      outputs: [{ kind: "task_only" }],
      triggers: [
        { type: "schedule", enabled: true, schedule },
        { type: "manual", enabled: true },
      ],
    });
  });

  it("builds thread follow-up automation payloads when requested", () => {
    const task = makeTask({
      id: "task-123",
      title: "Review recent failures",
      workspaceId: "workspace-1",
      sessionId: "session-1",
    });
    const schedule = buildTaskAutomationSchedule("hourly", "")!;

    expect(
      buildTaskRoutineCreate({
        task,
        workspace: makeWorkspace(),
        name: "Review recent failures",
        prompt: "Check again in this thread",
        runMode: "chat",
        targetMode: "thread_follow_up",
        triggerPreset: "hourly",
        schedule,
        deeplink: "neoworker://tasks/task-123",
      }),
    ).toMatchObject({
      contextBindings: {
        metadata: {
          automationRunMode: "thread_follow_up",
          runMode: "thread_follow_up",
          targetTaskId: "task-123",
          threadAutomation: "true",
        },
      },
    });

    expect(
      buildTaskAutomationCronJobCreate({
        task,
        workspace: makeWorkspace(),
        name: "Review recent failures",
        prompt: "Check again in this thread",
        runMode: "chat",
        targetMode: "thread_follow_up",
        schedule,
        deeplink: "neoworker://tasks/task-123",
      }),
    ).toMatchObject({
      runMode: "thread_follow_up",
      targetTaskId: "task-123",
      threadAutomation: {
        sourceTaskId: "task-123",
        sourceTaskTitle: "Review recent failures",
        sourceLink: "neoworker://tasks/task-123",
        wakeObjective: "Check again in this thread",
      },
    });
  });

  it("forces worktree automations to create a new task even when thread follow-up is requested", () => {
    const task = makeTask({
      id: "task-123",
      title: "Review recent failures",
      workspaceId: "workspace-1",
      sessionId: "session-1",
    });
    const schedule = buildTaskAutomationSchedule("hourly", "")!;

    expect(
      buildTaskRoutineCreate({
        task,
        workspace: makeWorkspace(),
        name: "Review recent failures",
        prompt: "Run in a worktree",
        runMode: "worktree",
        targetMode: "thread_follow_up",
        triggerPreset: "hourly",
        schedule,
        deeplink: "neoworker://tasks/task-123",
      }),
    ).toMatchObject({
      executionTarget: { kind: "worktree" },
      contextBindings: {
        metadata: {
          automationRunMode: "new_task",
        },
      },
    });

    expect(
      buildTaskAutomationCronJobCreate({
        task,
        workspace: makeWorkspace(),
        name: "Review recent failures",
        prompt: "Run in a worktree",
        runMode: "worktree",
        targetMode: "thread_follow_up",
        schedule,
        deeplink: "neoworker://tasks/task-123",
      }),
    ).toMatchObject({
      runMode: "new_task",
      targetTaskId: undefined,
      threadAutomation: undefined,
    });
  });

  it("enables shell access for Local run mode", () => {
    const task = makeTask({ workspaceId: "workspace-1" });
    const schedule = buildTaskAutomationSchedule("hourly", "")!;
    const job = buildTaskAutomationCronJobCreate({
      task,
      workspace: makeWorkspace(),
      name: "Local check",
      prompt: "Run the local health check",
      runMode: "local",
      schedule,
      deeplink: "neoworker://tasks/task-1",
    });

    expect(job.shellAccess).toBe(true);
  });

  it("templates provide prompt, name, and schedule defaults", () => {
    const template = TASK_AUTOMATION_TEMPLATES.find(
      (item) => item.id === "ci-failures",
    );

    expect(template).toMatchObject({
      name: "CI failure summary",
      schedulePreset: "hourly",
    });
    expect(template?.prompt).toContain("CI failures");
  });
});

describe("TaskSessionLineageFooter", () => {
  it("renders a source conversation link for forked tasks", () => {
    const html = renderToStaticMarkup(
      React.createElement(TaskSessionLineageFooter, {
        task: makeTask({ branchFromTaskId: "source-task" }),
        onSelectTask: vi.fn(),
      }),
    );

    expect(html).toContain("从会话分叉而来");
    expect(html).toContain("打开来源会话");
  });

  it("does not render for non-forked tasks", () => {
    const html = renderToStaticMarkup(
      React.createElement(TaskSessionLineageFooter, {
        task: makeTask(),
        onSelectTask: vi.fn(),
      }),
    );

    expect(html).toBe("");
  });
});

describe("message-level session forking", () => {
  it("keeps the assistant message fork action wired to event-specific forks", () => {
    const mainContentSource = readFileSync(mainContentPath, "utf8");
    const messageUiSource = readFileSync(messageUiPath, "utf8");

    expect(messageUiSource).toContain("MessageForkButton");
    expect(messageUiSource).toContain("message-fork-btn");
    expect(mainContentSource).toContain("onForkTaskSessionFromEvent");
    expect(mainContentSource).toContain("fromEventId: event.id");
    expect(mainContentSource).toContain("<MessageForkButton");
  });
});

describe("current query controls", () => {
  it("wires timeline controls to the latest follow-up query instead of leaving only Copy", () => {
    const mainContentSource = readFileSync(mainContentPath, "utf8");

    expect(mainContentSource).toContain("resolveTimelineControlsPlacement");
    expect(mainContentSource).toContain('timelineControlsPlacement === "latest-query"');
    expect(mainContentSource).toContain("renderLatestUserMessageActionRow");
    expect(mainContentSource).toContain("event.id === latestUserMessageEventId");
    expect(mainContentSource).toContain("renderActionRow={renderCurrentQueryActionRow}");
  });
});

describe("sidechat session forking", () => {
  it("does not expose the sidechat action in the task overflow menu", () => {
    const mainContentSource = readFileSync(mainContentPath, "utf8");
    const appSource = readFileSync(appPath, "utf8");

    expect(mainContentSource).toContain('"task.actions.forkSession"');
    expect(mainContentSource).not.toContain('"task.actions.openSideChat"');
    expect(mainContentSource).not.toContain("handleTaskHeaderSideChat");
    expect(mainContentSource).toContain('branchLabel: "fork"');
    expect(mainContentSource).toContain("initialMessage: sideQuestion");
    expect(appSource).toContain("sideChat: true");
    expect(appSource).toContain("initialMessage");
    expect(appSource).toContain("sideChatRequestSeqRef");
    expect(appSource).toContain("parentTask={sideChat.parentTask}");
    expect(appSource).toContain("<SideChatPanel");
    expect(appSource).not.toContain(".deleteTask(sideTaskId)");
  });
});

describe("task header browser action", () => {
  it("wires the task menu Open browser action to the sidebar Browser Workbench", () => {
    const mainContentSource = readFileSync(mainContentPath, "utf8");
    const appSource = readFileSync(appPath, "utf8");

    expect(mainContentSource).toContain('"task.actions.openBrowser"');
    expect(mainContentSource).toContain("onOpenBrowserWorkbenchSidebar()");
    expect(appSource).toContain("openEmptyBrowserWorkbenchSidebar");
    expect(appSource).toContain('sessionId: "default"');
    expect(appSource).toContain("onOpenBrowserWorkbenchSidebar=");
  });
});

describe("artifact sidebar open behavior", () => {
  it("keeps lazy artifact viewers inside a local sidebar suspense boundary", () => {
    const appSource = readFileSync(appPath, "utf8");

    expect(appSource).toContain("function ArtifactSidebarFallback()");
    expect(appSource).toContain(
      "<Suspense fallback={<ArtifactSidebarFallback />}>",
    );
    expect(appSource).toContain("onRevealRightSidebar?.();");
  });
});

describe("isTaskActivelyWorking", () => {
  it("composes uploaded PDF prompts with path and parse_document guidance", async () => {
    const readFileForViewer = vi.fn().mockResolvedValue({
      success: true,
      data: {
        path: "/workspace/.neoworker/uploads/123/report.pdf",
        fileName: "report.pdf",
        fileType: "pdf",
        content: null,
        size: 1024,
        pdfReviewSummary: {
          pageCount: 4,
          nativeTextPages: 4,
          ocrPages: 0,
          scannedPages: 0,
          truncatedPages: false,
          extractionMode: "native",
          pages: [
            {
              pageIndex: 0,
              text: "This contract renews annually unless cancelled.",
              usedOcr: false,
              truncated: false,
            },
          ],
        },
      },
    });
    vi.stubGlobal("window", {
      electronAPI: {
        readFileForViewer,
      },
    });

    const result = await composeMessageWithAttachments(
      "/workspace",
      "Summarize this PDF",
      [
        {
          relativePath: ".neoworker/uploads/123/report.pdf",
          fileName: "report.pdf",
          size: 1024,
          mimeType: "application/pdf",
        },
      ],
    );

    expect(readFileForViewer).toHaveBeenCalledWith(
      ".neoworker/uploads/123/report.pdf",
      "/workspace",
      expect.objectContaining({ imageOcrMaxChars: 6000 }),
    );
    expect(result.extractionWarnings).toEqual([]);
    expect(result.message).toContain(
      "- report.pdf (.neoworker/uploads/123/report.pdf)",
    );
    expect(result.message).toContain("PDF attachment: report.pdf");
    expect(result.message).toContain("Path: .neoworker/uploads/123/report.pdf");
    expect(result.message).toContain("call parse_document with the Path above");
    expect(result.message).toContain("Untrusted PDF content follows");
  });

  it("classifies generated html outputs as live html previews", () => {
    expect(
      getInlinePreviewKindForGeneratedFile({
        path: "artifacts/demo-animation.html",
        mimeType: "text/html",
      }),
    ).toBe("html");
  });

  it("classifies generated pptx outputs as presentation previews", () => {
    expect(
      getInlinePreviewKindForGeneratedFile({
        path: "artifacts/output.pptx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      }),
    ).toBe("presentation");
  });

  it("classifies generated PDF outputs as document previews", () => {
    expect(
      getInlinePreviewKindForGeneratedFile({
        path: "artifacts/report.pdf",
        mimeType: "application/pdf",
      }),
    ).toBe("document");
  });

  it("extracts generated office artifact paths from assistant text", () => {
    expect(
      extractGeneratedArtifactPathsFromText(
        "Validated:\n- File: `artifacts/sample_presentation.pptx`\n- Also saved reports/summary.docx, docs/channels.md, and sample.xlsx.",
      ),
    ).toEqual([
      "artifacts/sample_presentation.pptx",
      "reports/summary.docx",
      "docs/channels.md",
      "sample.xlsx",
    ]);
  });

  it("does not promote remote office links as local artifact cards", () => {
    expect(
      extractGeneratedArtifactPathsFromText(
        "Output ready: https://example.com/artifacts/sample_presentation.pptx and local/output.pptx",
      ),
    ).toEqual(["local/output.pptx"]);
  });

  it("does not promote compared source documents as generated artifact cards", () => {
    expect(
      extractGeneratedArtifactPathsFromText(
        [
          "## PPTX 对比报告",
          "Comparison basis: File 1 = `...(2).pptx`; File 2 = `...(1).pptx`.",
          "| | File 1 `(2).pptx` | File 2 `(1).pptx` |",
          "The two source presentations were compared successfully.",
        ].join("\n"),
      ),
    ).toEqual([]);
  });

  it("still promotes a file after an explicit generated-output statement", () => {
    expect(
      extractGeneratedArtifactPathsFromText(
        "对比完成。已生成文件：`artifacts/pptx-comparison-report.docx`",
      ),
    ).toEqual(["artifacts/pptx-comparison-report.docx"]);
  });

  it("does not turn an uncorroborated assistant filename into a clickable artifact", () => {
    const created = makeEvent("created", 100, "file_created", {
      path: ".neoworker/tmp/capability-test-report.html",
      mimeType: "text/html",
    });
    const assistant = makeEvent("assistant", 200, "assistant_message", {
      message: "文件已生成：`.neoworker/tmp/capability-test-card.html`",
    });

    expect(
      resolveArtifactPathsAgainstTaskEvents(
        [".neoworker/tmp/capability-test-card.html"],
        [created, assistant],
      ),
    ).toEqual([]);
    expect(collectLatestEndOfTaskArtifactCards([created, assistant])).toEqual(
      [],
    );
  });

  it("trusts an authoritative empty completion summary over assistant file mentions", () => {
    const assistant = makeEvent("assistant", 100, "assistant_message", {
      message: "File: `(2).pptx` and `(1).pptx`",
    });
    const completed = makeEvent("completed", 200, "task_completed", {
      outputSummary: {
        created: [],
        outputCount: 0,
        folders: [],
      },
    });

    expect(collectLatestEndOfTaskArtifactCards([assistant, completed])).toEqual(
      [],
    );
  });

  it("shows moved PDF outputs after the current assistant reply even when an older turn had an empty completion summary", () => {
    const previousCompleted = makeEvent(
      "previous-completed",
      100,
      "task_completed",
      {
        outputSummary: {
          created: [],
          outputCount: 0,
          folders: [],
        },
      },
    );
    const user = makeEvent("user", 200, "user_message", {
      message: "生成PDF文件",
    });
    const firstCreated = makeEvent("first-created", 300, "artifact_created", {
      path: "/tmp/epai-marketing-plan.pdf",
      mimeType: "application/pdf",
    });
    const firstMoved = makeEvent("first-moved", 400, "file_modified", {
      from: "epai-marketing-plan.pdf",
      to: ".neoworker/automated-outputs/task-123/output/marketing/epai-marketing-plan.pdf",
    });
    const secondCreated = makeEvent("second-created", 500, "artifact_created", {
      path: "/tmp/motusai-marketing-plan.pdf",
      mimeType: "application/pdf",
    });
    const secondMoved = makeEvent("second-moved", 600, "file_modified", {
      from: "motusai-marketing-plan.pdf",
      to: ".neoworker/automated-outputs/task-123/output/marketing/motusai-marketing-plan.pdf",
    });
    const assistant = makeEvent("assistant", 700, "assistant_message", {
      message: [
        "PDF 生成完成，输出文件：",
        "- output/marketing/epai-marketing-plan.pdf",
        "- output/marketing/motusai-marketing-plan.pdf",
      ].join("\n"),
    });
    const currentCompleted = makeEvent(
      "current-completed",
      800,
      "task_completed",
      {
        resultSummary: "PDF 生成完成",
      },
    );
    const stream = [
      previousCompleted,
      user,
      firstCreated,
      firstMoved,
      secondCreated,
      secondMoved,
      assistant,
      currentCompleted,
    ];

    expect(collectLatestEndOfTaskArtifactCards(stream)).toEqual([
      {
        path: ".neoworker/automated-outputs/task-123/output/marketing/epai-marketing-plan.pdf",
        kind: "document",
        eventId: "current-completed",
        lastReferenceIndex: 7,
        lastReferenceTimestamp: 800,
      },
      {
        path: ".neoworker/automated-outputs/task-123/output/marketing/motusai-marketing-plan.pdf",
        kind: "document",
        eventId: "current-completed",
        lastReferenceIndex: 7,
        lastReferenceTimestamp: 800,
      },
    ]);
    expect(collectEndOfTaskArtifactCardStacks(stream)).toHaveLength(1);
    expect(
      collectEndOfTaskArtifactCardStacks(stream)[0]?.anchorEventIndex,
    ).toBe(7);
  });

  it("does not promote planned or failed artifact paths as generated cards", () => {
    expect(
      extractGeneratedArtifactPathsFromText(
        [
          "This export step is defined, but not successfully written to disk.",
          "What I attempted:",
          "- Three.js `viewer.html`",
          "Intended export contract:",
          "```txt",
          "CityRepresentation -> neo-harbor.viewer.html browser-based Three.js preview",
          "```",
          "Planned artifacts:",
          "- `x-test/zoning-plan/neo-harbor.zoning-plan.json`",
        ].join("\n"),
      ),
    ).toEqual([]);
  });

  it("does not promote Chinese save-it-yourself output as a generated card", () => {
    expect(
      extractGeneratedArtifactPathsFromText(
        [
          "以下是完整文件内容，保存为 `ai-industry-report-2026-08-03.html` 即可：",
          "```html",
          "<!doctype html><html><body>report</body></html>",
          "```",
          "本环境无法直接落盘到工作区。",
        ].join("\n"),
      ),
    ).toEqual([]);
  });

  it("still promotes recovered artifact paths when text says they are now saved", () => {
    expect(
      extractGeneratedArtifactPathsFromText(
        [
          "The first write failed to create the preview.",
          "Saved files:",
          "- `artifacts/neo-harbor.viewer.html`",
          "Previously failed to write, now saved `artifacts/recovered-viewer.html`.",
        ].join("\n"),
      ),
    ).toEqual([
      "artifacts/neo-harbor.viewer.html",
      "artifacts/recovered-viewer.html",
    ]);
  });

  it("treats file lifecycle html events as previewable", () => {
    expect(
      getInlinePreviewKindForTaskEvent(
        makeEvent("html-created", 100, "file_created", {
          path: "artifacts/preview.html",
          mimeType: "text/html",
        }),
      ),
    ).toBe("html");
    expect(
      getInlinePreviewKindForTaskEvent(
        makeEvent("html-artifact", 100, "artifact_created", {
          path: "artifacts/preview.html",
          mimeType: "text/html",
        }),
      ),
    ).toBe("html");
  });

  it("only renders repeated office artifact cards at the last reference", () => {
    const created = makeEvent("created", 100, "file_created", {
      path: "artifacts/sample_presentation.pptx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    });
    const emitted = makeEvent("artifact", 200, "artifact_created", {
      path: "artifacts/sample_presentation.pptx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    });
    const completed = makeEvent("completed", 300, "task_completed", {
      outputSummary: {
        created: ["artifacts/sample_presentation.pptx"],
        primaryOutputPath: "artifacts/sample_presentation.pptx",
        outputCount: 1,
      },
    });
    const eventStream = [created, emitted, completed];

    expect(
      shouldRenderOpenArtifactCardAtEvent({
        path: "artifacts/sample_presentation.pptx",
        event: created,
        eventStream,
      }),
    ).toBe(false);
    expect(
      shouldRenderOpenArtifactCardAtEvent({
        path: "artifacts/sample_presentation.pptx",
        event: emitted,
        eventStream,
      }),
    ).toBe(false);
    expect(
      shouldRenderOpenArtifactCardAtEvent({
        path: "artifacts/sample_presentation.pptx",
        event: completed,
        eventStream,
      }),
    ).toBe(true);
  });

  it("does not render a formal document card before the current turn completes", () => {
    const created = makeEvent("created", 100, "artifact_created", {
      path: "reports/final-report.pptx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    });

    expect(
      shouldRenderOpenArtifactCardAtEvent({
        path: "reports/final-report.pptx",
        event: created,
        eventStream: [created],
      }),
    ).toBe(false);
    expect(collectLatestEndOfTaskArtifactCards([created])).toEqual([]);
  });

  it("shows only formal completion outputs and hides preview checks and superseded files", () => {
    const completed = makeEvent("completed", 300, "task_completed", {
      outputSummary: {
        created: [
          "交通银行近一周走势分析报告.pptx",
          ".neoworker/tmp/pptx-v3-preview-check.html",
        ],
        modifiedFallback: ["交通银行近一周走势分析报告-v2.pptx"],
        primaryOutputPath: "交通银行近一周走势分析报告.pptx",
        outputCount: 2,
      },
    });

    expect(collectLatestEndOfTaskArtifactCards([completed])).toEqual([
      {
        path: "交通银行近一周走势分析报告.pptx",
        kind: "presentation",
        eventId: "completed",
        lastReferenceIndex: 0,
        lastReferenceTimestamp: 300,
      },
    ]);
  });

  it("uses the persisted final delivery contract instead of intermediate repair versions", () => {
    const firstCompleted = makeEvent("first-completed", 100, "task_completed", {
      outputSummary: {
        created: ["交通银行近一周走势分析报告-v2.pptx"],
        primaryOutputPath: "交通银行近一周走势分析报告-v2.pptx",
        outputCount: 1,
      },
    });
    const secondCompleted = makeEvent(
      "second-completed",
      200,
      "task_completed",
      {
        outputSummary: {
          created: [
            "交通银行近一周走势分析报告-v3.pptx",
            ".neoworker/tmp/pptx-v3-preview-check.html",
          ],
          primaryOutputPath: "交通银行近一周走势分析报告-v3.pptx",
          outputCount: 2,
        },
      },
    );
    const finalCompleted = makeEvent("final-completed", 300, "task_completed", {
      outputSummary: {
        created: [
          "交通银行近一周走势分析报告.pptx",
          ".neoworker/tmp/pptx-v3-preview-check.html",
        ],
        modifiedFallback: ["交通银行近一周走势分析报告-v2.pptx"],
        primaryOutputPath: "交通银行近一周走势分析报告.pptx",
        outputCount: 2,
      },
    });
    const persistedFinalSummary = {
      created: ["交通银行近一周走势分析报告.pptx"],
      modifiedFallback: ["交通银行近一周走势分析报告-v2.pptx"],
      primaryOutputPath: "交通银行近一周走势分析报告.pptx",
      outputCount: 1,
      folders: ["."],
    };

    expect(
      collectLatestEndOfTaskArtifactCards(
        [firstCompleted, secondCompleted, finalCompleted],
        8,
        persistedFinalSummary,
      ),
    ).toEqual([
      {
        path: "交通银行近一周走势分析报告.pptx",
        kind: "presentation",
        eventId: "final-completed",
        lastReferenceIndex: 2,
        lastReferenceTimestamp: 300,
      },
    ]);
  });

  it("does not move a previous-turn artifact beneath a later user message", () => {
    const firstCompleted = makeEvent("first-completed", 100, "task_completed", {
      outputSummary: {
        created: ["广州-北京航班速览_2026-08-19.pptx"],
        primaryOutputPath: "广州-北京航班速览_2026-08-19.pptx",
        outputCount: 1,
        folders: ["."],
      },
    });
    const laterUser = makeEvent("later-user", 200, "user_message", {
      message: "/ppt-master 生成PPT",
    });
    const laterCompleted = makeEvent("later-completed", 300, "task_completed", {
      outputSummary: {
        created: [],
        outputCount: 0,
        folders: [],
      },
    });
    const persistedSummary = {
      created: ["广州-北京航班速览_2026-08-19.pptx"],
      primaryOutputPath: "广州-北京航班速览_2026-08-19.pptx",
      outputCount: 1,
      folders: ["."],
    };

    expect(
      collectEndOfTaskArtifactCardStacks(
        [firstCompleted, laterUser, laterCompleted],
        8,
        persistedSummary,
      ),
    ).toEqual([
      {
        anchorEventIndex: 0,
        artifacts: [
          {
            path: "广州-北京航班速览_2026-08-19.pptx",
            kind: "presentation",
            eventId: "first-completed",
            lastReferenceIndex: 0,
            lastReferenceTimestamp: 100,
          },
        ],
      },
    ]);
  });

  it("keeps completed-turn delivery cards visible while a later turn is working", () => {
    const mainContentSource = readFileSync(mainContentPath, "utf8");

    expect(mainContentSource).not.toContain(
      "const artifactStacks = isTaskWorking\n      ? []",
    );
    expect(mainContentSource).toContain(
      "const artifactStacks = collectEndOfTaskArtifactCardStacks(",
    );
    expect(mainContentSource).toContain(
      "if (!workspace?.path || isTaskWorking) return null;",
    );
    expect(mainContentSource).toContain("if (isTaskWorking) return false;");
    expect(mainContentSource).toContain(
      "pushPendingArtifactStacksBeforeTimelineItem(item);",
    );
  });

  it("does not duplicate a final delivery card inside the assistant summary", () => {
    const mainContentSource = readFileSync(mainContentPath, "utf8");

    expect(mainContentSource).toContain(
      "deliveryArtifactKeys.has(getArtifactCardDisplayKey(artifactPath, kind))",
    );
    expect(mainContentSource).not.toContain(
      "!deliveryArtifactKeys.has(getArtifactCardDisplayKey(artifactPath, kind))",
    );
    expect(mainContentSource).toContain(
      "const artifactProjectionRevision = visibleFeedRows",
    );
    expect(mainContentSource).toMatch(
      /getTaskEventPayloadRenderSignature\(event\),\s*artifactProjectionRevision,/,
    );
  });

  it("does not leave the previous turn action block active after a new queued message starts", () => {
    expect(
      shouldMarkActionBlockActiveForCurrentTurn({
        isLatestActionBlock: true,
        isTaskWorking: true,
        isReplayMode: false,
        actionBlockEventIndices: [4, 5, 6],
        latestUserMessageEventIndex: 7,
      }),
    ).toBe(false);
    expect(
      shouldMarkActionBlockActiveForCurrentTurn({
        isLatestActionBlock: true,
        isTaskWorking: true,
        isReplayMode: false,
        actionBlockEventIndices: [8, 9],
        latestUserMessageEventIndex: 7,
      }),
    ).toBe(true);
  });

  it("treats relative and absolute references to the same office file as one card", () => {
    const created = makeEvent("created", 100, "file_created", {
      path: "artifacts/sample.xlsx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const completed = makeEvent("completed", 200, "task_completed", {
      outputSummary: {
        created: ["/Users/demo/workspace/artifacts/sample.xlsx"],
        primaryOutputPath: "/Users/demo/workspace/artifacts/sample.xlsx",
        outputCount: 1,
      },
    });
    const eventStream = [created, completed];

    expect(
      shouldRenderOpenArtifactCardAtEvent({
        path: "artifacts/sample.xlsx",
        event: created,
        eventStream,
      }),
    ).toBe(false);
    expect(
      shouldRenderOpenArtifactCardAtEvent({
        path: "/Users/demo/workspace/artifacts/sample.xlsx",
        event: completed,
        eventStream,
      }),
    ).toBe(true);
  });

  it("collects the latest office artifact cards for bottom rendering", () => {
    const created = makeEvent("created", 100, "file_created", {
      path: "artifacts/sample.xlsx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const assistant = makeEvent("assistant", 200, "assistant_message", {
      message: "Done: artifacts/sample.xlsx",
    });
    const completed = makeEvent("completed", 300, "task_completed", {
      outputSummary: {
        created: ["artifacts/sample.xlsx"],
        primaryOutputPath: "artifacts/sample.xlsx",
        outputCount: 1,
      },
    });
    const laterUser = makeEvent("user", 400, "user_message", {
      message: "change Lisbon to Porto",
    });

    expect(
      collectLatestEndOfTaskArtifactCards([
        created,
        assistant,
        completed,
        laterUser,
      ]),
    ).toEqual([
      {
        path: "artifacts/sample.xlsx",
        kind: "spreadsheet",
        eventId: "completed",
        lastReferenceIndex: 2,
        lastReferenceTimestamp: 300,
      },
    ]);
  });

  it("anchors generated artifact stacks before later follow-up messages", () => {
    const completed = makeEvent("completed", 100, "task_completed", {
      outputSummary: {
        created: ["docs/managed-agents.md", "docs/getting-started.md"],
        primaryOutputPath: "docs/managed-agents.md",
        outputCount: 2,
      },
    });
    const laterUser = makeEvent("user", 200, "user_message", {
      message: "turn this into a routine",
    });

    expect(collectEndOfTaskArtifactCardStacks([completed, laterUser])).toEqual([
      {
        anchorEventIndex: 0,
        artifacts: [
          {
            path: "docs/managed-agents.md",
            kind: "document",
            eventId: "completed",
            lastReferenceIndex: 0,
            lastReferenceTimestamp: 100,
          },
          {
            path: "docs/getting-started.md",
            kind: "document",
            eventId: "completed",
            lastReferenceIndex: 0,
            lastReferenceTimestamp: 100,
          },
        ],
      },
    ]);
  });

  it("compares artifact anchors with full-stream indices after timeline filtering", () => {
    const hiddenBeforeCompletion = makeEvent(
      "hidden-before-completion",
      50,
      "timeline_step_updated",
      { message: "internal progress" },
    );
    const completed = makeEvent("completed", 100, "task_completed", {
      outputSummary: {
        created: ["artifacts/sample.pptx"],
        primaryOutputPath: "artifacts/sample.pptx",
        outputCount: 1,
      },
    });
    const hiddenAfterCompletion = makeEvent(
      "hidden-after-completion",
      150,
      "timeline_step_updated",
      { message: "internal cleanup" },
    );
    const laterUser = makeEvent("later-user", 200, "user_message", {
      message: "start another task",
    });
    const fullStream = [
      hiddenBeforeCompletion,
      completed,
      hiddenAfterCompletion,
      laterUser,
    ];

    // In a filtered timeline the user message may have local index 1, which
    // equals the artifact's full-stream anchor. It still belongs after it.
    expect(getEarliestTaskEventStreamIndex(fullStream, [laterUser])).toBe(3);
    expect(
      collectEndOfTaskArtifactCardStacks(fullStream)[0]?.anchorEventIndex,
    ).toBe(1);
  });

  it("recovers an Office artifact card from the persisted task output summary", () => {
    const completed = makeEvent("legacy-completed", 100, "task_completed", {
      message: "Follow-up completed",
    });
    const summary = {
      created: [".neoworker/minimax_ppt.pptx"],
      primaryOutputPath: ".neoworker/minimax_ppt.pptx",
      outputCount: 1,
      folders: [".neoworker"],
    };

    expect(collectEndOfTaskArtifactCardStacks([completed], 8, summary)).toEqual(
      [
        {
          anchorEventIndex: 0,
          artifacts: [
            {
              path: ".neoworker/minimax_ppt.pptx",
              kind: "presentation",
              eventId: "legacy-completed",
              lastReferenceIndex: 0,
              lastReferenceTimestamp: 100,
            },
          ],
        },
      ],
    );
  });

  it("anchors a recovered delivery card by event id when filtered indices diverge", () => {
    const noisy = makeEvent("noise", 50, "timeline_step_updated", {
      legacyType: "log",
      message: "internal noise",
    });
    const completed = makeEvent("completed", 100, "task_completed", {
      outputSummary: {
        created: ["report.pdf"],
        primaryOutputPath: "report.pdf",
        outputCount: 1,
      },
    });
    const [stack] = collectEndOfTaskArtifactCardStacks([noisy, completed]);

    expect(stack?.anchorEventIndex).toBe(1);
    expect(
      stack
        ? getEndOfTaskArtifactStackAnchorEventId(stack, [noisy, completed])
        : null,
    ).toBe("completed");
  });

  it("moves a persisted timeline-v2 document card to the final completion", () => {
    const created = makeEvent("created", 100, "artifact_created", {
      path: "final.docx",
    });
    const laterNarration = makeEvent("narration", 150, "assistant_message", {
      message: "文档已生成，正在复检。",
    });
    const completed = makeEvent(
      "wrapped-completed",
      200,
      "timeline_step_finished",
      {
        legacyType: "task_completed",
        resultSummary: "正式 DOCX 已生成并通过质检。",
        outputSummary: {
          created: ["final.docx"],
          primaryOutputPath: "final.docx",
          outputCount: 1,
          folders: ["."],
        },
      },
    );

    expect(
      collectLatestEndOfTaskArtifactCards([
        created,
        laterNarration,
        completed,
      ]),
    ).toEqual([
      {
        path: "final.docx",
        kind: "document",
        eventId: "wrapped-completed",
        lastReferenceIndex: 2,
        lastReferenceTimestamp: 200,
      },
    ]);
  });

  it("collects markdown artifacts as document cards for bottom rendering", () => {
    const created = makeEvent("created", 100, "file_created", {
      path: "docs/channels.md",
      mimeType: "text/markdown",
    });
    const assistant = makeEvent("assistant", 200, "assistant_message", {
      message: "Done: docs/channels.md",
    });
    const completed = makeEvent("completed", 300, "task_completed", {
      outputSummary: {
        created: ["docs/channels.md"],
        primaryOutputPath: "docs/channels.md",
        outputCount: 1,
      },
    });

    expect(
      collectLatestEndOfTaskArtifactCards([created, assistant, completed]),
    ).toEqual([
      {
        path: "docs/channels.md",
        kind: "document",
        eventId: "completed",
        lastReferenceIndex: 2,
        lastReferenceTimestamp: 300,
      },
    ]);
  });

  it("limits generated artifact stacks to five cards until expanded", () => {
    const artifacts = Array.from({ length: 7 }, (_, index) => ({
      path: `artifacts/output-${index + 1}.md`,
      kind: "document" as const,
      eventId: `event-${index + 1}`,
      lastReferenceIndex: index,
      lastReferenceTimestamp: 100 + index,
    }));

    expect(getVisibleEndOfTaskArtifactCards(artifacts, false)).toEqual({
      visibleArtifacts: artifacts.slice(0, 5),
      hiddenCount: 2,
    });
    expect(getVisibleEndOfTaskArtifactCards(artifacts, true)).toEqual({
      visibleArtifacts: artifacts,
      hiddenCount: 0,
    });
  });

  it("collapses matching artifact filenames to one bottom card", () => {
    const relative = makeEvent("relative", 100, "artifact_created", {
      path: "neoworker-presentation.pptx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    });
    const absolute = makeEvent("absolute", 200, "assistant_message", {
      message:
        "Updated /Users/mesut/Downloads/app/neoworker/neoworker-presentation.pptx and verified the deck.",
    });
    const completed = makeEvent("completed", 300, "task_completed", {
      outputSummary: {
        created: [
          "/Users/mesut/Downloads/app/neoworker/neoworker-presentation.pptx",
        ],
        primaryOutputPath:
          "/Users/mesut/Downloads/app/neoworker/neoworker-presentation.pptx",
        outputCount: 1,
      },
    });

    expect(
      collectLatestEndOfTaskArtifactCards([relative, absolute, completed]),
    ).toEqual([
      {
        path: "/Users/mesut/Downloads/app/neoworker/neoworker-presentation.pptx",
        kind: "presentation",
        eventId: "completed",
        lastReferenceIndex: 2,
        lastReferenceTimestamp: 300,
      },
    ]);
  });

  it("does not expose the provisional bootstrap file as a second artifact", () => {
    const provisional = makeEvent("bootstrap", 100, "file_created", {
      path: "/private/tmp/ui-session/.neoworker/generated-dashboard.html",
      source: "artifact_bootstrap",
      provisional: true,
    });
    const written = makeEvent("written", 200, "file_created", {
      path: ".neoworker/generated-dashboard.html",
      source: "write_file",
    });
    const completed = makeEvent("completed", 300, "task_completed", {
      outputSummary: {
        created: [".neoworker/generated-dashboard.html"],
        primaryOutputPath: ".neoworker/generated-dashboard.html",
        outputCount: 1,
      },
    });

    expect(
      collectLatestEndOfTaskArtifactCards([
        provisional,
        written,
        completed,
      ]),
    ).toEqual([
      {
        path: ".neoworker/generated-dashboard.html",
        kind: "html",
        eventId: "completed",
        lastReferenceIndex: 2,
        lastReferenceTimestamp: 300,
      },
    ]);
  });

  it("uses the workspace path instead of exposing a durable mirror path", () => {
    const relative = makeEvent("relative", 100, "file_created", {
      path: "artifacts/skills/task-1/ppt-master/output/presentation.pptx",
    });
    const durablePath =
      "/Users/test/Library/Application Support/neoworker/artifacts/temporary-workspaces/ui-session-abc-deadbeef/artifacts/skills/task-1/ppt-master/output/presentation.pptx";
    const durable = makeEvent("durable", 200, "artifact_created", {
      path: durablePath,
    });
    const completed = makeEvent("completed", 300, "task_completed", {
      outputSummary: {
        created: [durablePath],
        primaryOutputPath: durablePath,
        outputCount: 1,
      },
    });

    expect(
      collectLatestEndOfTaskArtifactCards([relative, durable, completed]),
    ).toEqual([
      {
        path: "artifacts/skills/task-1/ppt-master/output/presentation.pptx",
        kind: "presentation",
        eventId: "completed",
        lastReferenceIndex: 2,
        lastReferenceTimestamp: 300,
      },
    ]);
  });

  it("uses the moved destination path for filename-only artifact cards", () => {
    const moved = makeEvent("moved", 100, "file_modified", {
      action: "rename",
      from: "/outside/report.docx",
      to: "/outside/01-documents/report.docx",
    });
    const assistant = makeEvent("assistant", 200, "assistant_message", {
      message: "文件已生成：report.docx",
    });
    const completed = makeEvent("completed", 300, "task_completed", {
      outputSummary: {
        created: ["/outside/01-documents/report.docx"],
        primaryOutputPath: "/outside/01-documents/report.docx",
        outputCount: 1,
      },
    });

    expect(
      resolveArtifactPathsAgainstTaskEvents(
        ["report.docx"],
        [moved, assistant],
      ),
    ).toEqual(["/outside/01-documents/report.docx"]);
    expect(
      collectLatestEndOfTaskArtifactCards([moved, assistant, completed]),
    ).toEqual([
      {
        path: "/outside/01-documents/report.docx",
        kind: "document",
        eventId: "completed",
        lastReferenceIndex: 2,
        lastReferenceTimestamp: 300,
      },
    ]);
  });

  it("continues to render image artifact cards inline", () => {
    const created = makeEvent("image", 100, "file_created", {
      path: "artifacts/screenshot.png",
      mimeType: "image/png",
    });
    const completed = makeEvent("completed", 200, "task_completed", {
      outputSummary: {
        created: ["artifacts/screenshot.png"],
        primaryOutputPath: "artifacts/screenshot.png",
        outputCount: 1,
      },
    });

    expect(
      shouldRenderOpenArtifactCardAtEvent({
        path: "artifacts/screenshot.png",
        event: created,
        eventStream: [created, completed],
      }),
    ).toBe(true);
  });

  it("hides the header title when it only repeats the initial prompt", () => {
    const presentation = deriveTaskHeaderPresentation({
      title: "run command 'echo hello world'",
      prompt: "run command 'echo hello world'",
    });

    expect(presentation.showHeaderTitle).toBe(false);
    expect(presentation.trimmedPrompt).toBe("run command 'echo hello world'");
  });

  it("keeps the header title when it adds distinct context beyond the prompt", () => {
    const presentation = deriveTaskHeaderPresentation({
      title: "Shell reproduction",
      prompt: "run command 'echo hello world'",
    });

    expect(presentation.showHeaderTitle).toBe(true);
    expect(presentation.headerTitle).toBe("Shell reproduction");
  });

  it("keeps executing tasks active when newer progress follows an older completed follow-up", () => {
    const task = makeTask();
    const events = [
      makeEvent("follow-up-done", 1_000, "follow_up_completed"),
      makeEvent("step-progress", 2_000, "timeline_step_updated", {
        legacyType: "progress_update",
        message: "Working on your request",
      }),
    ];

    expect(isTaskActivelyWorking(task, events, false, 2_500)).toBe(true);
  });

  it("keeps pending fork drafts idle even when copied history contains recent active events", () => {
    const task = makeTask({
      status: "pending",
      branchFromTaskId: "source-task",
    });
    const events = [
      makeEvent("copied-step-progress", 2_000, "timeline_step_updated", {
        legacyType: "progress_update",
        message: "Copied work from the source session",
        forkedFromTaskId: "source-task",
      }),
    ];

    expect(isTaskActivelyWorking(task, events, false, 2_500)).toBe(false);
  });

  it("marks executing tasks idle when the latest relevant event is a completed follow-up", () => {
    const task = makeTask();
    const events = [makeEvent("follow-up-done", 2_000, "follow_up_completed")];

    expect(isTaskActivelyWorking(task, events, false, 2_500)).toBe(false);
  });

  it("marks executing tasks idle when the latest relevant event is a failed follow-up", () => {
    const task = makeTask();
    const events = [makeEvent("follow-up-failed", 2_000, "follow_up_failed")];

    expect(isTaskActivelyWorking(task, events, false, 2_500)).toBe(false);
  });

  it("does not treat generic error events as terminal while the task is still executing", () => {
    const task = makeTask();
    const events = [
      makeEvent("tool-side-error", 2_000, "error", {
        error: "Image generation failed",
      }),
    ];

    expect(isTaskActivelyWorking(task, events, false, 2_500)).toBe(true);
  });

  it("computes the correct bottom-scroll target", () => {
    expect(getAutoScrollTargetTop(1200, 400)).toBe(800);
    expect(getAutoScrollTargetTop(300, 400)).toBe(0);
  });

  it("pins the scroll container to its exact current bottom", () => {
    const container = {
      scrollTop: 125,
      scrollHeight: 1800,
      clientHeight: 500,
    };

    expect(pinScrollElementToBottom(container as HTMLElement)).toBe(1300);
    expect(container.scrollTop).toBe(1300);
  });

  it("skips auto-scroll writes when already pinned to the same bottom target", () => {
    expect(
      shouldScheduleAutoScrollWrite({
        scrollTop: 800,
        scrollHeight: 1200,
        clientHeight: 400,
        lastTargetTop: 800,
      }),
    ).toBe(false);
  });

  it("schedules auto-scroll writes when the bottom target materially changes", () => {
    expect(
      shouldScheduleAutoScrollWrite({
        scrollTop: 800,
        scrollHeight: 1400,
        clientHeight: 400,
        lastTargetTop: 800,
      }),
    ).toBe(true);
  });

  it("defaults transcript mode to live only while a non-chat task is actively working", () => {
    expect(
      getDefaultTranscriptMode({
        isTaskWorking: true,
        isReplayMode: false,
        verboseSteps: false,
        isChatTask: false,
      }),
    ).toBe("live");
    expect(
      getDefaultTranscriptMode({
        isTaskWorking: false,
        isReplayMode: false,
        verboseSteps: false,
        isChatTask: false,
      }),
    ).toBe("inspect");
    expect(
      getDefaultTranscriptMode({
        isTaskWorking: false,
        isReplayMode: false,
        verboseSteps: false,
        isChatTask: false,
        taskStatus: "completed",
      }),
    ).toBe("delivery");
    expect(
      getDefaultTranscriptMode({
        isTaskWorking: false,
        isReplayMode: false,
        verboseSteps: true,
        isChatTask: false,
        taskStatus: "completed",
      }),
    ).toBe("inspect");
    expect(
      getDefaultTranscriptMode({
        isTaskWorking: false,
        isReplayMode: true,
        verboseSteps: false,
        isChatTask: false,
        taskStatus: "completed",
      }),
    ).toBe("inspect");
    expect(
      getDefaultTranscriptMode({
        isTaskWorking: false,
        isReplayMode: false,
        verboseSteps: false,
        isChatTask: true,
        taskStatus: "completed",
      }),
    ).toBe("inspect");
  });

  it("bypasses the filtered live projection when execution records are enabled", () => {
    expect(
      shouldBypassLiveTaskEventProjection({
        projectionMode: "live",
        transcriptModeOverride: null,
        verboseSteps: true,
      }),
    ).toBe(true);
    expect(
      shouldBypassLiveTaskEventProjection({
        projectionMode: "live",
        transcriptModeOverride: null,
        verboseSteps: false,
      }),
    ).toBe(false);
    expect(
      shouldBypassLiveTaskEventProjection({
        projectionMode: "inspect",
        transcriptModeOverride: null,
        verboseSteps: true,
      }),
    ).toBe(false);
  });

  it("keeps execution records visible until the user explicitly chooses summary mode", () => {
    const mainContentSource = readFileSync(mainContentPath, "utf8");

    expect(mainContentSource).toContain(
      "const [verboseSteps, setVerboseSteps] = useState(true)",
    );
    expect(mainContentSource).not.toContain(
      "settings.timelineVerbosityConfigured !== true",
    );
    expect(mainContentSource).toContain("const hasExplicitVerbosityChoice =");
    expect(mainContentSource).toContain("timelineVerbosityConfigured: false");
    expect(mainContentSource).toContain("timelineVerbosityConfigured: true");
  });

  it("shows shell sessions only while execution records are enabled", () => {
    const sessions = [
      {
        id: "completed-command",
        command: "npm test",
        output: "ok",
        isRunning: false,
        exitCode: 0,
        startTimestamp: 100,
      },
      {
        id: "running-command",
        command: "npm run dev",
        output: "starting",
        isRunning: true,
        exitCode: null,
        startTimestamp: 200,
      },
    ];

    expect(
      selectVisibleCommandOutputSessions({
        sessions,
        verboseSteps: false,
        dismissedSessionIds: new Set(),
      }),
    ).toEqual([]);

    expect(
      selectVisibleCommandOutputSessions({
        sessions,
        verboseSteps: true,
        dismissedSessionIds: new Set(["completed-command"]),
      }).map((session) => session.id),
    ).toEqual(["running-command"]);
  });

  it("keeps chat conversation-only even when records or replay are active", () => {
    expect(
      shouldShowChatTaskExecutionRows({
        isChatTask: true,
        verboseSteps: false,
        isReplayMode: false,
      }),
    ).toBe(false);
    expect(
      shouldShowChatTaskExecutionRows({
        isChatTask: true,
        verboseSteps: true,
        isReplayMode: false,
      }),
    ).toBe(false);
    expect(
      shouldShowChatTaskExecutionRows({
        isChatTask: true,
        verboseSteps: false,
        isReplayMode: true,
      }),
    ).toBe(false);
    expect(
      shouldShowChatTaskExecutionRows({
        isChatTask: false,
        verboseSteps: false,
        isReplayMode: false,
      }),
    ).toBe(true);
  });

  it("uses execution-record events throughout replay even when the toggle is off", () => {
    expect(
      shouldIncludeExecutionRecordEvents({
        verboseSteps: false,
        isReplayMode: true,
      }),
    ).toBe(true);
    expect(
      shouldIncludeExecutionRecordEvents({
        verboseSteps: false,
        isReplayMode: false,
      }),
    ).toBe(false);
  });

  it("shows a bootstrap progress row while an active non-chat task has no visible feed rows", () => {
    expect(
      shouldShowBootstrapProgressRow({
        isTaskWorking: true,
        visibleRenderableFeedRowsLength: 0,
        isChatTask: false,
      }),
    ).toBe(true);
    expect(
      shouldShowBootstrapProgressRow({
        isTaskWorking: true,
        visibleRenderableFeedRowsLength: 1,
        isChatTask: false,
      }),
    ).toBe(false);
    expect(
      shouldShowBootstrapProgressRow({
        isTaskWorking: true,
        visibleRenderableFeedRowsLength: 0,
        isChatTask: true,
      }),
    ).toBe(false);
  });

  it("uses task status to label bootstrap progress", () => {
    expect(getBootstrapProgressTitle(makeTask({ status: "planning" }))).toBe(
      "Planning the approach",
    );
    expect(getBootstrapProgressTitle(makeTask({ status: "executing" }))).toBe(
      "Thinking",
    );
    expect(getBootstrapProgressTitle(makeTask({ status: "interrupted" }))).toBe(
      "Resuming work",
    );
  });

  it("surfaces the latest active reasoning stream text for the live panel", () => {
    const state = deriveAgentReasoningPanelState({
      events: [
        makeEvent("progress-1", 100, "timeline_step_updated", {
          legacyType: "progress_update",
          message: "Executing step 1/2: Inspect repository",
        }),
        makeEvent("stream-1", 200, "timeline_step_updated", {
          legacyType: "llm_streaming",
          text: "I'm checking the repo and runtime state first.",
          streaming: true,
        }),
      ],
      taskId: "task-1",
      isTaskWorking: true,
    });

    expect(state.activeStreamText).toBe(
      "I'm checking the repo and runtime state first.",
    );
    expect(state.isStreaming).toBe(true);
    expect(state.recentUpdates).toEqual(["Inspecting repository"]);
  });

  it("derives a localized live heartbeat from the current execution stage", () => {
    expect(
      deriveProgressHeartbeat([
        makeEvent("plan", 100, "timeline_step_updated", {
          legacyType: "progress_update",
          message: "Planning the approach",
        }),
        makeEvent("search", 200, "tool_call", { tool: "web_search" }),
      ], "task-1"),
    ).toBe("正在检索可靠来源...");
    expect(
      deriveProgressHeartbeat(
        [makeEvent("done", 300, "task_completed", {})],
        "task-1",
      ),
    ).toBe("");
  });

  it("falls back to recent user-facing progress updates when no reasoning stream is active", () => {
    const state = deriveAgentReasoningPanelState({
      events: [
        makeEvent("progress-hidden", 100, "timeline_step_updated", {
          legacyType: "progress_update",
          message: "Thinking...",
        }),
        makeEvent("progress-1", 200, "timeline_step_updated", {
          legacyType: "progress_update",
          message: "Analyzing task requirements...",
        }),
        makeEvent("progress-2", 300, "timeline_step_updated", {
          legacyType: "progress_update",
          message: "Executing step 1/2: Inspect repository",
        }),
        makeEvent("step-1", 400, "timeline_step_started", {
          step: { id: "step-1", description: "Inspect repository" },
        }),
      ],
      taskId: "task-1",
      isTaskWorking: true,
    });

    expect(state.activeStreamText).toBe("");
    expect(state.isStreaming).toBe(false);
    expect(state.recentUpdates).toEqual([
      "Understanding the request",
      "Inspecting repository",
    ]);
  });

  it("includes assistant messages in the reasoning fallback window", () => {
    const state = deriveAgentReasoningPanelState({
      events: [
        makeEvent("progress-1", 100, "timeline_step_updated", {
          legacyType: "progress_update",
          message: "Executing step 1/2: Inspect repository",
        }),
        makeEvent("assistant-1", 200, "timeline_step_updated", {
          legacyType: "assistant_message",
          message: "I’m checking the scaffolded Kami slide project first.",
        }),
        makeEvent("assistant-internal", 300, "timeline_step_updated", {
          legacyType: "assistant_message",
          internal: true,
          message: "OK",
        }),
      ],
      taskId: "task-1",
      isTaskWorking: true,
    });

    expect(state.activeStreamText).toBe("");
    expect(state.isStreaming).toBe(false);
    expect(state.recentUpdates).toEqual([
      "Inspecting repository",
      "I’m checking the scaffolded Kami slide project first.",
    ]);
  });

  it("detects when action block state contains stale ids", () => {
    expect(
      hasInactiveStringSetEntries(
        new Set(["block-1", "block-2"]),
        new Set(["block-2", "block-3"]),
      ),
    ).toBe(true);
    expect(
      hasInactiveStringSetEntries(
        new Set(["block-2"]),
        new Set(["block-2", "block-3"]),
      ),
    ).toBe(false);
  });

  it("prunes action block state down to active ids", () => {
    expect([
      ...pruneStringSetToActiveIds(
        new Set(["block-1", "block-2"]),
        new Set(["block-2", "block-3"]),
      ),
    ]).toEqual(["block-2"]);
  });

  it("projects a bounded live transcript row set while preserving hidden count", () => {
    const rows = [
      {
        kind: "timeline",
        key: "user-1",
        estimatedHeight: 100,
        timelineIndex: 0,
        visiblePerfEventId: "user-1",
        revision: "user-1",
        item: {
          kind: "event",
          event: makeEvent("user-1", 100, "user_message", { message: "User" }),
        },
      },
      {
        kind: "timeline",
        key: "assistant-1",
        estimatedHeight: 100,
        timelineIndex: 1,
        visiblePerfEventId: "assistant-1",
        revision: "assistant-1",
        item: {
          kind: "event",
          event: makeEvent("assistant-1", 200, "assistant_message", {
            message: "First answer",
          }),
        },
      },
      ...Array.from({ length: 8 }, (_, index) => ({
        kind: "timeline",
        key: `progress-${index}`,
        estimatedHeight: 100,
        timelineIndex: index + 2,
        visiblePerfEventId: `progress-${index}`,
        revision: `progress-${index}`,
        item: {
          kind: "event",
          event: makeEvent(
            `progress-${index}`,
            300 + index,
            "timeline_step_updated",
            {
              legacyType: "progress_update",
              message: `Progress ${index}`,
            },
          ),
        },
      })),
      {
        kind: "timeline",
        key: "action-block-1",
        estimatedHeight: 180,
        timelineIndex: 20,
        visiblePerfEventId: "step-2",
        revision: "action-block-1",
        item: {
          kind: "action_block",
          blockId: "action-block-1",
          events: [
            makeEvent("step-1", 500, "timeline_step_started", {
              legacyType: "step_started",
            }),
            makeEvent("step-2", 600, "timeline_step_updated", {
              legacyType: "progress_update",
              message: "Final meaningful step",
            }),
          ],
        },
      },
    ] as Any[];

    const result = selectVisibleTaskFeedRows(rows, "live");

    expect(result.visibleFeedRows.length).toBeLessThan(rows.length);
    expect(result.hiddenLiveFeedRowCount).toBe(
      rows.length - result.visibleFeedRows.length,
    );
    expect(
      result.visibleFeedRows.some((row) => row.key === "action-block-1"),
    ).toBe(true);
    expect(
      result.visibleFeedRows.some((row) => row.key === "assistant-1"),
    ).toBe(true);
  });

  it("keeps the full transcript visible in inspect mode", () => {
    const rows = [
      {
        kind: "history-control",
        key: "timeline-history-control",
        estimatedHeight: 44,
        hasMoreHistory: true,
        isLoading: false,
        error: null,
        revision: "more:idle:none",
        visiblePerfEventId: null,
      },
      {
        kind: "timeline",
        key: "budget-1",
        estimatedHeight: 100,
        timelineIndex: 0,
        visiblePerfEventId: "budget-1",
        revision: "budget-1",
        item: {
          kind: "event",
          event: makeEvent("budget-1", 100, "timeline_step_updated", {
            legacyType: "llm_output_budget",
            message: "Budget remaining: 82%",
          }),
        },
      },
      {
        kind: "timeline",
        key: "assistant-1",
        estimatedHeight: 100,
        timelineIndex: 1,
        visiblePerfEventId: "assistant-1",
        revision: "assistant-1",
        item: {
          kind: "event",
          event: makeEvent("assistant-1", 200, "assistant_message", {
            message: "Answer",
          }),
        },
      },
    ] as Any[];

    const result = selectVisibleTaskFeedRows(rows, "inspect");

    expect(result.visibleFeedRows).toHaveLength(rows.length);
    expect(result.hiddenLiveFeedRowCount).toBe(0);
    expect(result.visibleFeedRows[0]?.key).toBe("timeline-history-control");
  });

  it("keeps history controls out of the bounded live transcript", () => {
    const rows = [
      {
        kind: "history-control",
        key: "timeline-history-control",
        estimatedHeight: 44,
        hasMoreHistory: true,
        isLoading: false,
        error: null,
        revision: "more:idle:none",
        visiblePerfEventId: null,
      },
      ...Array.from({ length: 12 }, (_, index) => ({
        kind: "timeline",
        key: `progress-${index}`,
        estimatedHeight: 100,
        timelineIndex: index,
        visiblePerfEventId: `progress-${index}`,
        revision: `progress-${index}`,
        item: {
          kind: "event",
          event: makeEvent(
            `progress-${index}`,
            100 + index,
            "timeline_step_updated",
            {
              legacyType: "progress_update",
              message: `Progress ${index}`,
            },
          ),
        },
      })),
    ] as Any[];

    const result = selectVisibleTaskFeedRows(rows, "live");

    expect(
      result.visibleFeedRows.some(
        (row) => row.key === "timeline-history-control",
      ),
    ).toBe(false);
    expect(result.hiddenLiveFeedRowCount).toBe(
      rows.filter((row) => row.kind !== "history-control").length -
        result.visibleFeedRows.length,
    );
  });

  it("keeps history controls out of short live transcripts", () => {
    const rows = [
      {
        kind: "history-control",
        key: "timeline-history-control",
        estimatedHeight: 44,
        hasMoreHistory: true,
        isLoading: false,
        error: null,
        revision: "more:idle:none",
        visiblePerfEventId: null,
      },
      {
        kind: "timeline",
        key: "assistant-1",
        estimatedHeight: 100,
        timelineIndex: 0,
        visiblePerfEventId: "assistant-1",
        revision: "assistant-1",
        item: {
          kind: "event",
          event: makeEvent("assistant-1", 200, "assistant_message", {
            message: "Answer",
          }),
        },
      },
    ] as Any[];

    const result = selectVisibleTaskFeedRows(rows, "live");

    expect(result.visibleFeedRows.map((row) => row.key)).toEqual([
      "assistant-1",
    ]);
    expect(result.hiddenLiveFeedRowCount).toBe(0);
  });

  it("projects completed delivery mode to final output rows", () => {
    const rows = [
      {
        kind: "timeline",
        key: "user-1",
        estimatedHeight: 100,
        timelineIndex: 0,
        visiblePerfEventId: "user-1",
        revision: "user-1",
        item: {
          kind: "event",
          event: makeEvent("user-1", 100, "user_message", { message: "User" }),
        },
      },
      {
        kind: "timeline",
        key: "action-block-1",
        estimatedHeight: 180,
        timelineIndex: 1,
        visiblePerfEventId: "complete-1",
        revision: "action-block-1",
        item: {
          kind: "action_block",
          blockId: "action-block-1",
          eventIndices: [1, 2],
          events: [
            makeEvent("step-1", 200, "timeline_step_updated", {
              legacyType: "progress_update",
              message: "Working",
            }),
            makeEvent("complete-1", 300, "task_completed", {
              outputSummary: {
                created: ["sample.xlsx"],
                primaryOutputPath: "sample.xlsx",
                outputCount: 1,
                folders: ["."],
              },
            }),
          ],
        },
      },
      {
        kind: "timeline",
        key: "assistant-1",
        estimatedHeight: 100,
        timelineIndex: 2,
        visiblePerfEventId: "assistant-1",
        revision: "assistant-1",
        item: {
          kind: "event",
          event: makeEvent("assistant-1", 400, "assistant_message", {
            message: "Created sample.xlsx",
          }),
        },
      },
      {
        kind: "artifact-stack",
        key: "end-artifact-stack",
        estimatedHeight: 114,
        artifacts: [
          {
            path: "sample.xlsx",
            kind: "spreadsheet",
            eventId: "assistant-1",
            lastReferenceIndex: 2,
            lastReferenceTimestamp: 400,
          },
        ],
        revision: "sample.xlsx:spreadsheet:assistant-1",
        visiblePerfEventId: null,
      },
    ] as Any[];

    const result = selectVisibleTaskFeedRows(rows, "delivery");

    expect(result.visibleFeedRows.map((row) => row.key)).toEqual([
      "user-1",
      "delivery-event:complete-1:2",
      "assistant-1",
      "end-artifact-stack",
    ]);
    const completionRow = result.visibleFeedRows[1];
    expect(completionRow?.kind).toBe("timeline");
    if (completionRow?.kind !== "timeline") {
      throw new Error("Expected completion row to be a timeline event");
    }
    expect(completionRow.item.kind).toBe("event");
    expect(completionRow.item.event.id).toBe("complete-1");
    expect(result.hiddenLiveFeedRowCount).toBe(0);
  });

  it("keeps every follow-up question in delivery mode while hiding internal steps", () => {
    const rows = [
      {
        kind: "timeline",
        key: "user-2",
        estimatedHeight: 100,
        timelineIndex: 0,
        visiblePerfEventId: "user-2",
        revision: "user-2",
        item: {
          kind: "event",
          event: makeEvent("user-2", 100, "user_message", {
            message: "第二个问题",
          }),
        },
      },
      {
        kind: "timeline",
        key: "internal-step",
        estimatedHeight: 100,
        timelineIndex: 1,
        visiblePerfEventId: "internal-step",
        revision: "internal-step",
        item: {
          kind: "event",
          event: makeEvent("internal-step", 200, "timeline_step_updated", {
            legacyType: "progress_update",
            message: "Working",
          }),
        },
      },
      {
        kind: "timeline",
        key: "assistant-2",
        estimatedHeight: 100,
        timelineIndex: 2,
        visiblePerfEventId: "assistant-2",
        revision: "assistant-2",
        item: {
          kind: "event",
          event: makeEvent("assistant-2", 300, "assistant_message", {
            message: "第二个回答",
          }),
        },
      },
      {
        kind: "timeline",
        key: "complete-2",
        estimatedHeight: 100,
        timelineIndex: 3,
        visiblePerfEventId: "complete-2",
        revision: "complete-2",
        item: {
          kind: "event",
          event: makeEvent("complete-2", 400, "task_completed", {
            resultSummary: "第二个回答",
          }),
        },
      },
    ] as Any[];

    const result = selectVisibleTaskFeedRows(rows, "delivery");

    expect(result.visibleFeedRows.map((row) => row.key)).toEqual([
      "user-2",
      "complete-2",
    ]);
  });

  it("keeps three queued questions paired with their own three answers", () => {
    const rows = [1, 2, 3].flatMap((turn) => {
      const question = makeEvent(`user-${turn}`, turn * 1_000, "user_message", {
        message: `问题 ${turn}`,
      });
      const answer = makeEvent(
        `assistant-${turn}`,
        turn * 1_000 + 100,
        "assistant_message",
        { message: `回答 ${turn}` },
      );
      const completion = makeEvent(
        `complete-${turn}`,
        turn * 1_000 + 200,
        "task_completed",
        { resultSummary: `回答 ${turn}` },
      );
      return [question, answer, completion].map((event, eventIndex) => ({
        kind: "timeline",
        key: event.id,
        estimatedHeight: 100,
        timelineIndex: turn * 10 + eventIndex,
        visiblePerfEventId: event.id,
        revision: event.id,
        item: { kind: "event", event },
      }));
    }) as Any[];

    const result = selectVisibleTaskFeedRows(rows, "delivery");

    expect(result.visibleFeedRows.map((row) => row.key)).toEqual([
      "user-1",
      "complete-1",
      "user-2",
      "complete-2",
      "user-3",
      "complete-3",
    ]);
  });

  it("keeps action-required and critical terminal rows in delivery mode", () => {
    const rows = [
      {
        kind: "timeline",
        key: "step-1",
        estimatedHeight: 100,
        timelineIndex: 0,
        visiblePerfEventId: "step-1",
        revision: "step-1",
        item: {
          kind: "event",
          event: makeEvent("step-1", 100, "timeline_step_updated", {
            legacyType: "progress_update",
            message: "Working",
          }),
        },
      },
      {
        kind: "timeline",
        key: "needs-action",
        estimatedHeight: 100,
        timelineIndex: 1,
        visiblePerfEventId: "needs-action",
        revision: "needs-action",
        item: {
          kind: "event",
          event: makeEvent("needs-action", 200, "task_completed", {
            terminalStatus: "needs_user_action",
            pendingChecklist: ["Open the generated file"],
          }),
        },
      },
      {
        kind: "timeline",
        key: "error-1",
        estimatedHeight: 100,
        timelineIndex: 2,
        visiblePerfEventId: "error-1",
        revision: "error-1",
        item: {
          kind: "event",
          event: makeEvent("error-1", 300, "error", {
            message: "Verification failed",
          }),
        },
      },
    ] as Any[];

    const result = selectVisibleTaskFeedRows(rows, "delivery");

    expect(result.visibleFeedRows.map((row) => row.key)).toEqual([
      "needs-action",
      "error-1",
    ]);
  });

  it("keeps collapsed action block estimates compact for virtualized history views", () => {
    const height = estimateTaskFeedRowHeight(
      {
        kind: "action_block",
        blockId: "action-block-1",
        events: Array.from({ length: 40 }, (_, index) =>
          makeEvent(`step-${index}`, index, "timeline_step_updated", {
            legacyType: "progress_update",
            message: `Step ${index}`,
          }),
        ),
      },
      { expanded: false, visibleEventCount: 0, hasVisibilityToggle: false },
    );

    expect(height).toBe(34);
  });

  it("bases expanded action block estimates on visible rows instead of raw hidden events", () => {
    const height = estimateTaskFeedRowHeight(
      {
        kind: "action_block",
        blockId: "action-block-1",
        events: Array.from({ length: 40 }, (_, index) =>
          makeEvent(`step-${index}`, index, "timeline_step_updated", {
            legacyType: "progress_update",
            message: `Step ${index}`,
          }),
        ),
      },
      { expanded: true, visibleEventCount: 7, hasVisibilityToggle: true },
    );

    expect(height).toBeLessThan(520);
    expect(height).toBe(362);
  });

  it("keeps file and artifact event estimates close to compact step rows", () => {
    const fileModifiedHeight = estimateTaskFeedRowHeight({
      kind: "event",
      event: makeEvent("file-modified", 100, "file_modified", {
        path: "delivery_ops_unification_manager_deck.md",
        type: "edit",
        oldPreview: "- old",
        newPreview: "+ new",
      }),
    });
    const artifactHeight = estimateTaskFeedRowHeight({
      kind: "event",
      event: makeEvent("artifact", 200, "artifact_created", {
        path: "delivery_ops_unification_manager_deck.md",
        type: "markdown",
      }),
    });

    expect(fileModifiedHeight).toBe(58);
    expect(artifactHeight).toBe(42);
  });

  it("only suppresses run_command terminals for visible expanded rows", () => {
    const hiddenRunCommand = makeEvent(
      "tool-call-hidden",
      100,
      "timeline_step_updated",
      {
        legacyType: "tool_call",
        tool: "run_command",
      },
    );
    const visibleRead = makeEvent(
      "tool-call-visible",
      200,
      "timeline_step_updated",
      {
        legacyType: "tool_call",
        tool: "read_file",
      },
    );

    const sessionsByIndex = new Map([
      [
        0,
        [
          {
            id: "cmd-hidden",
            command: "npm test",
            output: "ok",
            isRunning: false,
            exitCode: 0,
            startTimestamp: 100,
          },
        ],
      ],
      [
        1,
        [
          {
            id: "cmd-visible",
            command: "cat file",
            output: "ok",
            isRunning: false,
            exitCode: 0,
            startTimestamp: 200,
          },
        ],
      ],
    ]);

    const hiddenIds = collectInlineRunCommandSessionIds({
      events: [visibleRead],
      eventIndices: [1],
      commandOutputSessionsByInsertIndex: sessionsByIndex as Any,
      isEventExpanded: (event) => event.id === "tool-call-hidden",
    });

    expect(hiddenIds.has("cmd-hidden")).toBe(false);
    expect(hiddenIds.has("cmd-visible")).toBe(false);

    const visibleIds = collectInlineRunCommandSessionIds({
      events: [hiddenRunCommand],
      eventIndices: [0],
      commandOutputSessionsByInsertIndex: sessionsByIndex as Any,
      isEventExpanded: (event) => event.id === "tool-call-hidden",
    });

    expect(visibleIds.has("cmd-hidden")).toBe(true);
  });
});
