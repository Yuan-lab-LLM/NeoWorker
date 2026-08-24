import { describe, expect, it } from "vitest";

import {
  taskSurfaceFailureStormEvents,
  taskSurfaceFailureStormTask,
} from "../../perf-fixtures/task-surface-failure-storm.fixture";
import { deriveSharedTaskEventUiState } from "../task-event-derived";

function makeEvent(
  id: string,
  timestamp: number,
  type: string,
  payload: Record<string, unknown> = {},
  overrides: Record<string, unknown> = {},
): Any {
  return {
    id,
    taskId: "task-1",
    timestamp,
    type,
    payload,
    ...overrides,
  };
}

describe("deriveSharedTaskEventUiState action blocks", () => {
  it("keeps deterministic bootstrap placeholders out of workspace outputs", () => {
    const shared = deriveSharedTaskEventUiState({
      rawEvents: [
        makeEvent("bootstrap", 100, "file_created", {
          path: "agent.md/soul.md/user.md",
          source: "artifact_bootstrap",
        }),
        makeEvent("spreadsheet", 200, "artifact_created", {
          path: "report.xlsx",
        }),
      ],
      task: { id: "task-1", status: "completed" } as Any,
      workspace: { id: "workspace-1", path: "/workspace" } as Any,
      verboseSteps: false,
    });

    expect(shared.files.map((file) => file.path)).toEqual(["report.xlsx"]);
    expect(shared.outputSummary?.created).toEqual(["report.xlsx"]);
    expect(shared.liveEvents.map((event) => event.id)).toEqual(["spreadsheet"]);
  });

  it("keeps diagnostic artifacts out of the project output panel", () => {
    const shared = deriveSharedTaskEventUiState({
      rawEvents: [
        makeEvent("diag-local", 100, "file_created", {
          path: "__diag-zh-short.pdf",
        }),
        makeEvent("diag-durable", 110, "artifact_created", {
          path: "/durable/__diag-zh-short.pdf",
        }),
        makeEvent("final", 200, "artifact_created", {
          path: "会议纪要.pdf",
        }),
      ],
      task: { id: "task-1", status: "completed" } as Any,
      workspace: { id: "workspace-1", path: "/workspace" } as Any,
      verboseSteps: false,
    });

    expect(shared.files.map((file) => file.path)).toEqual(["会议纪要.pdf"]);
    expect(shared.outputSummary?.created).toEqual(["会议纪要.pdf"]);
  });

  it("projects the affected PDF task as final deliverables only", () => {
    const durableRoot =
      "/Users/test/Library/Application Support/neoworker/artifacts/temporary-workspaces/ui-session-real-deadbeef";
    const shared = deriveSharedTaskEventUiState({
      rawEvents: [
        makeEvent("diag", 10, "file_created", { path: "__diag-en.pdf" }),
        makeEvent("diag-mirror", 11, "artifact_created", {
          path: `${durableRoot}/__diag-en.pdf`,
        }),
        makeEvent("bootstrap", 20, "file_created", {
          path: "/workspace/agent.md/soul.md/user.md",
          source: "artifact_bootstrap",
        }),
        makeEvent("combined", 30, "file_created", {
          path: "会议纪要合集.pdf",
        }),
        makeEvent("first-version", 40, "file_created", {
          path: "会议纪要-0626.pdf",
        }),
        makeEvent("replacement", 50, "file_created", {
          path: "会议纪要-0626-full.pdf",
        }),
        makeEvent("retire-first", 60, "file_modified", {
          action: "rename",
          from: "会议纪要-0626.pdf",
          to: "__partial-0626.pdf",
        }),
        makeEvent("publish-replacement", 70, "file_modified", {
          action: "rename",
          from: "会议纪要-0626-full.pdf",
          to: "会议纪要-0626.pdf",
        }),
        makeEvent("delete-partial", 80, "file_deleted", {
          path: "__partial-0626.pdf",
        }),
        makeEvent("june", 90, "file_created", { path: "会议纪要-0613.pdf" }),
        makeEvent("july", 100, "file_created", { path: "会议纪要-0705.pdf" }),
      ],
      task: { id: "task-1", status: "completed" } as Any,
      workspace: { id: "workspace-1", path: "/workspace" } as Any,
      verboseSteps: false,
    });

    expect(
      shared.files
        .filter((file) => file.action !== "deleted")
        .map((file) => file.path)
        .sort(),
    ).toEqual(
      [
        "会议纪要-0613.pdf",
        "会议纪要-0626.pdf",
        "会议纪要-0705.pdf",
        "会议纪要合集.pdf",
      ].sort(),
    );
  });

  it("deduplicates a workspace artifact and its durable mirror", () => {
    const relative =
      "artifacts/skills/task-1/ppt-master/output/presentation.pptx";
    const durable =
      "/Users/test/Library/Application Support/neoworker/artifacts/temporary-workspaces/ui-session-abc-deadbeef/artifacts/skills/task-1/ppt-master/output/presentation.pptx";
    const shared = deriveSharedTaskEventUiState({
      rawEvents: [
        makeEvent("workspace-copy", 100, "file_created", { path: relative }),
        makeEvent("durable-copy", 200, "artifact_created", { path: durable }),
      ],
      task: { id: "task-1", status: "completed" } as Any,
      workspace: { id: "workspace-1", path: "/workspace" } as Any,
      verboseSteps: false,
    });

    expect(shared.files).toEqual([
      { path: relative, action: "created", timestamp: 200 },
    ]);
  });

  it("projects a copied delivery as one final file and retires its source", () => {
    const source = "presentation.pptx";
    const destination =
      "artifacts/skills/task-1/ppt-master/output/presentation.pptx";
    const shared = deriveSharedTaskEventUiState({
      rawEvents: [
        makeEvent("source", 100, "file_created", { path: source }),
        makeEvent("delivery", 200, "file_created", {
          path: destination,
          copiedFrom: source,
        }),
        makeEvent("completed", 300, "task_completed", {
          outputSummary: {
            created: [destination, source],
            primaryOutputPath: destination,
            outputCount: 2,
          },
        }),
      ],
      task: { id: "task-1", status: "completed" } as Any,
      workspace: { id: "workspace-1", path: "/workspace" } as Any,
      verboseSteps: false,
    });

    expect(shared.files).toEqual([
      { path: destination, action: "created", timestamp: 200 },
    ]);
    expect(shared.outputSummary).toMatchObject({
      created: [destination],
      primaryOutputPath: destination,
      outputCount: 1,
    });
  });

  it("prefers a canonical output when truncated history omits copy provenance", () => {
    const source = "presentation.pptx";
    const destination =
      "artifacts/skills/task-1/ppt-master/output/presentation.pptx";
    const shared = deriveSharedTaskEventUiState({
      rawEvents: [
        makeEvent("source", 100, "file_created", { path: source }),
        makeEvent("delivery", 200, "file_created", { path: destination }),
      ],
      task: { id: "task-1", status: "completed" } as Any,
      workspace: { id: "workspace-1", path: "/workspace" } as Any,
      verboseSteps: false,
    });

    expect(shared.files).toEqual([
      { path: destination, action: "created", timestamp: 200 },
    ]);
  });

  it("keeps presentation source projects out of user-facing task artifacts", () => {
    const shared = deriveSharedTaskEventUiState({
      rawEvents: [
        makeEvent("plan", 100, "file_created", {
          path: "artifacts/skills/task-1/presentation-studio/presentation-studio/presentation-plan.json",
        }),
        makeEvent("slide", 200, "file_created", {
          path: "artifacts/skills/task-1/presentation-studio/presentation-studio/slides/slide-01.mjs",
        }),
        makeEvent("temp-slide", 300, "file_created", {
          path: "artifacts/.neoworker/tmp/s16.mjs",
        }),
        makeEvent("deck", 400, "artifact_created", {
          path: "artifacts/skills/task-1/presentation-studio/presentation-studio/output/presentation.pptx",
        }),
      ],
      task: { id: "task-1", status: "completed" } as Any,
      workspace: { id: "workspace-1", path: "/workspace" } as Any,
      verboseSteps: false,
    });

    expect(shared.files.map((file) => file.path)).toEqual([
      "artifacts/skills/task-1/presentation-studio/presentation-studio/output/presentation.pptx",
    ]);
    expect(shared.outputSummary?.created).toEqual([
      "artifacts/skills/task-1/presentation-studio/presentation-studio/output/presentation.pptx",
    ]);
  });

  it("projects a renamed artifact at its destination and retires the source", () => {
    const shared = deriveSharedTaskEventUiState({
      rawEvents: [
        makeEvent("draft", 100, "file_created", {
          path: "北京上周天气报告-20260803-0809-v2.docx",
        }),
        makeEvent("publish", 200, "file_modified", {
          action: "rename",
          from: "北京上周天气报告-20260803-0809-v2.docx",
          to: "北京上周天气报告-20260803-0809.docx",
        }),
      ],
      task: { id: "task-1", status: "completed" } as Any,
      workspace: { id: "workspace-1", path: "/workspace" } as Any,
      verboseSteps: false,
    });

    expect(shared.files).toEqual([
      {
        path: "北京上周天气报告-20260803-0809-v2.docx",
        action: "deleted",
        timestamp: 200,
      },
      {
        path: "北京上周天气报告-20260803-0809.docx",
        action: "modified",
        timestamp: 200,
      },
    ]);
  });

  it("projects planning, retry, progress, and terminal error rows for a failed provider run", () => {
    const shared = deriveSharedTaskEventUiState({
      rawEvents: [
        makeEvent("analyzing", 100, "timeline_step_updated", {
          legacyType: "log",
          message: "Analyzing task requirements...",
        }),
        makeEvent("create-plan", 200, "timeline_step_updated", {
          legacyType: "log",
          message: "Creating execution plan (model: deepseek-v4-flash)...",
        }),
        makeEvent("provider-outage", 300, "timeline_step_updated", {
          legacyType: "llm_routing_changed",
          currentProvider: "deepseek",
          routeReason: "provider_outage",
          fallbackOccurred: true,
        }),
        makeEvent("model-retry", 400, "timeline_step_updated", {
          legacyType: "llm_retry",
          operation: "Plan creation",
          attempt: 1,
          maxRetries: 5,
          delayMs: 1000,
        }),
        makeEvent("plan", 500, "timeline_step_updated", {
          legacyType: "plan_created",
          plan: {
            description: "Execution plan",
            steps: [
              { id: "1", description: "Research sources", status: "pending" },
            ],
          },
        }),
        makeEvent("progress", 600, "timeline_step_updated", {
          legacyType: "progress_update",
          message: "Executing step 1/1: Research sources",
        }),
        makeEvent(
          "terminal-error",
          700,
          "timeline_error",
          {
            legacyType: "error",
            message: "DeepSeek API error: 503 Service Temporarily Unavailable",
            terminal_failure_fingerprint: "provider-busy|unknown|",
          },
          { status: "failed" },
        ),
      ],
      task: { id: "task-1", status: "failed" } as Any,
      workspace: null,
      verboseSteps: true,
    });

    const projectedIds = shared.baseTimelineItems.flatMap((item) =>
      item.kind === "event"
        ? [item.event.id]
        : item.events.map((event) => event.id),
    );
    expect(projectedIds).toEqual([
      "analyzing",
      "create-plan",
      "provider-outage",
      "model-retry",
      "plan",
      "progress",
      "terminal-error",
    ]);
  });

  it("keeps tool action blocks in a verbose replay frame before the first assistant reply", () => {
    const shared = deriveSharedTaskEventUiState({
      rawEvents: [
        makeEvent("step-start", 100, "timeline_step_started", {
          legacyType: "step_started",
          message: "Check the product owner",
        }),
        makeEvent("tool-batch", 200, "timeline_group_started", {
          legacyType: "step_started",
          message: "Starting Tool batch (2)",
        }),
        makeEvent("tool-call-1", 300, "timeline_step_updated", {
          legacyType: "tool_call",
          tool: "http_request",
          callId: "call-1",
          input: { url: "https://example.com/one" },
        }),
        makeEvent("tool-result-1", 400, "timeline_step_updated", {
          legacyType: "tool_result",
          tool: "http_request",
          callId: "call-1",
          result: { success: true, status: 200 },
        }),
        makeEvent("tool-call-2", 500, "timeline_step_updated", {
          legacyType: "tool_call",
          tool: "http_request",
          callId: "call-2",
          input: { url: "https://example.com/two" },
        }),
        makeEvent("tool-result-2", 600, "timeline_step_updated", {
          legacyType: "tool_result",
          tool: "http_request",
          callId: "call-2",
          result: { success: true, status: 200 },
        }),
      ],
      task: { id: "task-1", status: "cancelled" } as Any,
      workspace: null,
      verboseSteps: true,
    });

    const toolActionBlock = shared.baseTimelineItems.find(
      (item) =>
        item.kind === "action_block" &&
        item.events.some((event) => event.payload?.legacyType === "tool_call"),
    );
    expect(
      toolActionBlock?.kind === "action_block"
        ? toolActionBlock.events
            .map((event) => event.payload?.legacyType)
            .filter((type) => type === "tool_call" || type === "tool_result")
        : [],
    ).toEqual(["tool_call", "tool_result", "tool_call", "tool_result"]);
  });

  it("projects progress from the latest revised plan", () => {
    const shared = deriveSharedTaskEventUiState({
      rawEvents: [
        makeEvent("initial-plan", 100, "plan_created", {
          plan: {
            steps: [
              {
                id: "initial-step",
                description: "Initial draft",
                status: "pending",
              },
            ],
          },
        }),
        makeEvent("revised-plan", 200, "plan_created", {
          plan: {
            steps: [
              {
                id: "revised-step",
                description: "Final draft",
                status: "pending",
              },
            ],
          },
        }),
        makeEvent("revised-step-completed", 300, "timeline_step_finished", {
          legacyType: "step_completed",
          step: { id: "revised-step", description: "Final draft" },
        }),
      ],
      task: { id: "task-1", status: "completed" } as Any,
      workspace: null,
      verboseSteps: false,
    });

    expect(shared.planSteps).toEqual([
      expect.objectContaining({ id: "revised-step", status: "completed" }),
    ]);
  });

  it("does not apply lifecycle state from an older plan that reused step IDs", () => {
    const shared = deriveSharedTaskEventUiState({
      rawEvents: [
        makeEvent("initial-plan", 100, "plan_created", {
          plan: {
            steps: [
              { id: "1", description: "Initial draft", status: "pending" },
            ],
          },
        }),
        makeEvent("initial-completed", 200, "step_completed", {
          step: { id: "1", description: "Initial draft" },
        }),
        makeEvent("revised-plan", 300, "plan_created", {
          plan: {
            steps: [
              { id: "1", description: "Revised draft", status: "pending" },
            ],
          },
        }),
      ],
      task: { id: "task-1", status: "executing" } as Any,
      workspace: null,
      verboseSteps: false,
    });

    expect(shared.planSteps).toEqual([
      expect.objectContaining({
        id: "1",
        description: "Revised draft",
        status: "pending",
      }),
    ]);
  });

  it("hides the previous turn plan as soon as a follow-up starts", () => {
    const shared = deriveSharedTaskEventUiState({
      rawEvents: [
        makeEvent("user-1", 100, "user_message", {
          message: "Create a report",
        }),
        makeEvent("plan-1", 200, "plan_created", {
          plan: {
            steps: [
              {
                id: "step-1",
                description: "Collect sources",
                status: "pending",
              },
              { id: "step-2", description: "Write report", status: "pending" },
            ],
          },
        }),
        makeEvent("step-1-completed", 300, "step_completed", {
          step: { id: "step-1", description: "Collect sources" },
        }),
        makeEvent("step-2-completed", 400, "step_completed", {
          step: { id: "step-2", description: "Write report" },
        }),
        makeEvent("complete-1", 500, "task_completed", {
          resultSummary: "Report ready",
        }),
        makeEvent("user-2", 600, "user_message", { message: "Generate HTML" }),
        makeEvent("turn-2-started", 700, "timeline_step_started", {
          legacyType: "step_started",
          message: "Starting the work",
        }),
      ],
      task: { id: "task-1", status: "executing" } as Any,
      workspace: null,
      verboseSteps: false,
    });

    expect(shared.planSteps).toEqual([]);
  });

  it("hides the previous plan when follow_up_started is the only new-turn boundary", () => {
    const shared = deriveSharedTaskEventUiState({
      rawEvents: [
        makeEvent("plan-1", 100, "plan_created", {
          plan: {
            steps: [
              {
                id: "old",
                description: "Old analysis",
                status: "completed",
              },
            ],
          },
        }),
        makeEvent("follow-up", 200, "follow_up_started", {
          followUpMessage: "输出中文",
          turnId: "turn-2",
        }),
        makeEvent("answer", 300, "assistant_message", {
          message: "已经切换为中文。",
        }),
      ],
      task: { id: "task-1", status: "executing" } as Any,
      workspace: null,
      verboseSteps: false,
    });

    expect(shared.planSteps).toEqual([]);
  });

  it("projects the newest durable plan_revised snapshot", () => {
    const shared = deriveSharedTaskEventUiState({
      rawEvents: [
        makeEvent("original", 100, "plan_created", {
          plan: {
            steps: [
              { id: "old", description: "Obsolete step", status: "pending" },
            ],
          },
        }),
        makeEvent("revision", 200, "plan_revised", {
          plan: {
            steps: [
              {
                id: "new-1",
                description: "Current step one",
                status: "pending",
              },
              {
                id: "new-2",
                description: "Current step two",
                status: "pending",
              },
            ],
          },
        }),
        makeEvent("new-1-done", 300, "step_completed", {
          step: { id: "new-1", description: "Current step one" },
        }),
      ],
      task: { id: "task-1", status: "executing" } as Any,
      workspace: null,
      verboseSteps: false,
    });

    expect(shared.planSteps).toEqual([
      expect.objectContaining({ id: "new-1", status: "completed" }),
      expect.objectContaining({ id: "new-2", status: "pending" }),
    ]);
  });

  it("shows only the plan created for the latest follow-up turn", () => {
    const shared = deriveSharedTaskEventUiState({
      rawEvents: [
        makeEvent("user-1", 100, "user_message", {
          message: "Create a report",
        }),
        makeEvent("plan-1", 200, "plan_created", {
          plan: {
            steps: [
              {
                id: "step-1",
                description: "Write report",
                status: "completed",
              },
            ],
          },
        }),
        makeEvent("complete-1", 300, "task_completed", {
          resultSummary: "Report ready",
        }),
        makeEvent("user-2", 400, "user_message", { message: "Generate HTML" }),
        makeEvent("plan-2", 500, "plan_created", {
          plan: {
            steps: [
              { id: "html-1", description: "Generate HTML", status: "pending" },
            ],
          },
        }),
        makeEvent("html-started", 600, "step_started", {
          step: { id: "html-1", description: "Generate HTML" },
        }),
      ],
      task: { id: "task-1", status: "executing" } as Any,
      workspace: null,
      verboseSteps: false,
    });

    expect(shared.planSteps).toEqual([
      expect.objectContaining({
        id: "html-1",
        description: "Generate HTML",
        status: "in_progress",
      }),
    ]);
  });

  it("keeps verification steps visible so the displayed rows match the plan total", () => {
    const events = [
      makeEvent("plan", 100, "plan_created", {
        plan: {
          steps: [
            { id: "1", description: "生成 Excel 台账", status: "pending" },
            {
              id: "2",
              description: "Verify the final Excel workbook",
              kind: "verification",
              status: "pending",
            },
          ],
        },
      }),
    ];

    const shared = deriveSharedTaskEventUiState({
      rawEvents: events,
      task: { id: "task-1", status: "executing" } as Any,
      workspace: null,
      verboseSteps: false,
    });

    expect(shared.planSteps.map((step) => step.id)).toEqual(["1", "2"]);
  });

  it("keeps a stable action-block id while the same block grows", () => {
    const baseEvents = [
      makeEvent("user-1", 100, "user_message", { message: "check steps" }),
      makeEvent("step-1", 200, "timeline_step_started", {
        legacyType: "step_started",
        message: "first",
      }),
      makeEvent("step-2", 300, "timeline_step_updated", {
        legacyType: "progress_update",
        message: "second",
      }),
    ];

    const initial = deriveSharedTaskEventUiState({
      rawEvents: baseEvents,
      task: null,
      workspace: null,
      verboseSteps: false,
    });
    const initialBlock = initial.baseTimelineItems.find(
      (item) => item.kind === "action_block",
    );

    const grown = deriveSharedTaskEventUiState({
      rawEvents: [
        ...baseEvents,
        makeEvent("step-3", 400, "timeline_step_updated", {
          legacyType: "progress_update",
          message: "third",
        }),
      ],
      task: null,
      workspace: null,
      verboseSteps: false,
    });
    const grownBlock = grown.baseTimelineItems.find(
      (item) => item.kind === "action_block",
    );

    expect(initialBlock?.kind).toBe("action_block");
    expect(grownBlock?.kind).toBe("action_block");
    expect(initialBlock?.blockId).toBe("action-block:step-1");
    expect(grownBlock?.blockId).toBe(initialBlock?.blockId);
  });

  it("keeps every turn once in a multi-turn chat transcript", () => {
    const shared = deriveSharedTaskEventUiState({
      rawEvents: [
        makeEvent("user-1", 100, "user_message", { message: "你好" }),
        makeEvent("assistant-1", 200, "assistant_message", {
          message: "你好，有什么可以帮你？",
        }),
        makeEvent("complete-1", 300, "task_completed", {
          resultSummary: "你好，有什么可以帮你？",
        }),
        makeEvent("user-2", 400, "user_message", { message: "你是谁？" }),
        makeEvent("assistant-2", 500, "assistant_message", {
          message: "我是 NeoWorker。",
        }),
        makeEvent("complete-2", 600, "task_completed", {
          resultSummary: "我是 NeoWorker。",
        }),
      ],
      task: { id: "task-1", status: "completed" } as Any,
      workspace: null,
      verboseSteps: false,
    });

    expect(
      shared.baseTimelineItems
        .filter((item) => item.kind === "event")
        .map((item) => (item.kind === "event" ? item.event.id : "")),
    ).toEqual(["user-1", "complete-1", "user-2", "complete-2"]);
  });

  it("collapses turn-level assistant progress narration into the final reply", () => {
    const shared = deriveSharedTaskEventUiState({
      rawEvents: [
        makeEvent("user-1", 100, "user_message", { message: "请重写这份报告" }),
        makeEvent("progress-1", 200, "timeline_step_updated", {
          legacyType: "assistant_message",
          stepId: "turn:task-1",
          status: "in_progress",
          actor: "agent",
          message: "我先重新核对报告里的核心结论。",
        }),
        makeEvent("progress-2", 300, "timeline_step_updated", {
          legacyType: "assistant_message",
          stepId: "turn:task-1",
          status: "in_progress",
          actor: "agent",
          message: "现在生成 PDF 版本。",
        }),
        makeEvent("assistant-final", 400, "timeline_step_updated", {
          legacyType: "assistant_message",
          stepId: "turn:task-1",
          status: "in_progress",
          actor: "agent",
          message: "报告已经重写并生成 PDF。",
        }),
      ],
      task: { id: "task-1", status: "completed" } as Any,
      workspace: null,
      verboseSteps: false,
    });

    expect(
      shared.baseTimelineItems
        .filter((item) => item.kind === "event")
        .map((item) => (item.kind === "event" ? item.event.id : "")),
    ).toEqual(["user-1", "assistant-final"]);
  });

  it("keeps internal assistant media directives visible and exposes them as files", () => {
    const shared = deriveSharedTaskEventUiState({
      rawEvents: [
        makeEvent("assistant-preview", 200, "timeline_step_updated", {
          legacyType: "assistant_message",
          internal: true,
          message:
            'Rendered.\n\n::video{path="artifacts/hyperframes-demo.mp4" title="HyperFrames Demo" muted=true loop=true}',
        }),
        makeEvent("task-complete", 300, "task_completed", {
          resultSummary: "Completed without output summary metadata.",
        }),
      ],
      task: {
        id: "task-1",
        status: "completed",
      } as Any,
      workspace: {
        id: "workspace-1",
        path: "/workspace",
      } as Any,
      verboseSteps: false,
    });

    expect(shared.filteredEvents.map((event) => event.id)).toContain(
      "assistant-preview",
    );
    expect(shared.outputSummary?.primaryOutputPath).toBe(
      "artifacts/hyperframes-demo.mp4",
    );
    expect(shared.files.map((file) => file.path)).toContain(
      "artifacts/hyperframes-demo.mp4",
    );
  });

  it("bounds live projection while retaining required anchors", () => {
    const shared = deriveSharedTaskEventUiState({
      rawEvents: taskSurfaceFailureStormEvents,
      task: taskSurfaceFailureStormTask,
      workspace: null,
      verboseSteps: false,
      projectionMode: "live",
      liveWindowSize: 160,
    });

    const ids = new Set(shared.normalizedEvents.map((event) => event.id));
    expect(shared.projectionMode).toBe("live");
    expect(shared.rawEventCount).toBeGreaterThan(600);
    expect(shared.normalizedEvents.length).toBeLessThanOrEqual(167);
    expect(ids.has("user-1")).toBe(true);
    expect(ids.has("assistant-2")).toBe(true);
    expect(ids.has("artifact-1")).toBe(true);
    expect(ids.has("terminal-1")).toBe(true);
  });

  it("keeps composer plan progress after the live event window moves past the plan", () => {
    const shared = deriveSharedTaskEventUiState({
      rawEvents: [
        makeEvent("plan-1", 100, "plan_created", {
          plan: {
            steps: [
              {
                id: "step-1",
                description: "Collect sources",
                status: "pending",
              },
              { id: "step-2", description: "Write report", status: "pending" },
            ],
          },
        }),
        makeEvent("step-1-completed", 200, "step_completed", {
          step: { id: "step-1", description: "Collect sources" },
        }),
        makeEvent("step-2-started", 300, "step_started", {
          step: { id: "step-2", description: "Write report" },
        }),
        ...Array.from({ length: 30 }, (_, index) =>
          makeEvent(`noise-${index}`, 400 + index, "timeline_step_updated", {
            legacyType: "progress_update",
            message: `Working ${index}`,
          }),
        ),
      ],
      task: { id: "task-1", status: "executing" } as Any,
      workspace: null,
      verboseSteps: false,
      projectionMode: "live",
      liveWindowSize: 10,
    });

    expect(shared.normalizedEvents.map((event) => event.id)).toContain(
      "plan-1",
    );
    expect(shared.planSteps).toEqual([
      expect.objectContaining({ id: "step-1", status: "completed" }),
      expect.objectContaining({ id: "step-2", status: "in_progress" }),
    ]);
  });

  it("coalesces identical provider failures in live projection", () => {
    const shared = deriveSharedTaskEventUiState({
      rawEvents: [
        makeEvent("user-1", 100, "user_message", { message: "search" }),
        makeEvent("error-1", 1_000, "error", {
          provider: "search",
          code: "FETCH_FAILED",
          message: "fetch failed: network timeout",
        }),
        makeEvent("error-2", 5_000, "error", {
          provider: "search",
          code: "FETCH_FAILED",
          message: "fetch failed: network timeout",
        }),
        makeEvent("error-3", 13_000, "error", {
          provider: "search",
          code: "FETCH_FAILED",
          message: "fetch failed: network timeout",
        }),
      ],
      task: { id: "task-1", status: "executing" } as Any,
      workspace: null,
      verboseSteps: false,
      projectionMode: "live",
    });

    expect(shared.filteredEvents.map((event) => event.id)).toEqual([
      "user-1",
      "error-1",
      "error-3",
    ]);
  });

  it("deduplicates matching visible failed-step and timeline error events", () => {
    const reason =
      "Step contract failure [contract_unmet_write_required][artifact_write_checkpoint_failed]: iteration 5 reached without successful file/canvas mutation.";
    const shared = deriveSharedTaskEventUiState({
      rawEvents: [
        makeEvent(
          "step-failed",
          1_000,
          "timeline_step_finished",
          {
            legacyType: "step_failed",
            message: reason,
            reason,
            step: {
              id: "step-1",
              description: "Applying fixes",
              error: reason,
            },
          },
          { status: "failed", stepId: "step-1" },
        ),
        makeEvent("hidden-progress", 1_001, "timeline_step_updated", {
          legacyType: "progress_update",
          message: "Internal progress",
        }),
        makeEvent("matching-error", 1_002, "timeline_error", {
          message: reason,
        }),
      ],
      task: { id: "task-1", status: "failed" } as Any,
      workspace: null,
      verboseSteps: false,
    });

    expect(shared.filteredEvents.map((event) => event.id)).toEqual([
      "step-failed",
    ]);
  });

  it("keeps substantive internal narration in the execution-record projection", () => {
    const shared = deriveSharedTaskEventUiState({
      rawEvents: [
        makeEvent("execution-note", 1_000, "timeline_step_updated", {
          legacyType: "assistant_message",
          internal: true,
          stepId: "3",
          message: "正在核对来源并生成最终报告。",
        }),
        makeEvent("short-beacon", 1_100, "timeline_step_updated", {
          legacyType: "assistant_message",
          internal: true,
          stepId: "3",
          message: "OK",
        }),
      ],
      task: { id: "task-1", status: "failed" } as Any,
      workspace: null,
      verboseSteps: true,
      projectionMode: "inspect",
    });

    expect(shared.filteredEvents.map((event) => event.id)).toEqual([
      "execution-note",
    ]);
    expect(
      shared.baseTimelineItems
        .filter((item) => item.kind === "event")
        .map((item) => (item.kind === "event" ? item.event.id : "")),
    ).toEqual(["execution-note"]);
  });

  it("limits command output sessions when more sessions are running than the UI budget", () => {
    const shared = deriveSharedTaskEventUiState({
      rawEvents: Array.from({ length: 20 }, (_, index) =>
        makeEvent(`command-${index}`, 1_000 + index, "command_output", {
          type: "start",
          command: `node script-${index}.js`,
          output: `$ node script-${index}.js\n`,
        }),
      ),
      task: { id: "task-1", status: "executing" } as Any,
      workspace: null,
      verboseSteps: false,
    });

    expect(shared.commandOutputSessions).toHaveLength(12);
    expect(
      shared.commandOutputSessions.every((session) => session.isRunning),
    ).toBe(true);
    expect(shared.commandOutputSessions[0].command).toBe("node script-8.js");
  });
});
