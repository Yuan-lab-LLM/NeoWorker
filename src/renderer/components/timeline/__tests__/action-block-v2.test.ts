import { createElement } from "react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { TaskEvent } from "../../../../shared/types";
import { applyPersistedLanguage } from "../../../i18n";
import { ActionBlock, buildActionBlockSummary } from "../ActionBlock";

const timelineStyles = readFileSync(
  fileURLToPath(new URL("../../MainContent/main-content.css", import.meta.url)),
  "utf8",
);

function event(
  id: string,
  type: TaskEvent["type"],
  timestamp: number,
  payload: Record<string, unknown> = {},
  fields: Partial<TaskEvent> = {},
): TaskEvent {
  return {
    id,
    taskId: "task-v2",
    type,
    timestamp,
    payload,
    schemaVersion: 2,
    ...fields,
  };
}

describe("ActionBlock V2 projection", () => {
  it("counts a step once across started, updated, and finished events", () => {
    const summary = buildActionBlockSummary([
      event("start", "timeline_step_started", 1000, {}, { stepId: "step-1" }),
      event("update", "timeline_step_updated", 1200, {}, { stepId: "step-1" }),
      event("finish", "timeline_step_finished", 1400, {}, { stepId: "step-1" }),
    ]);

    expect(summary.stepCount).toBe(1);
    expect(summary.status).toBe("done");
  });

  it("keeps a late approval resolution in the original group", () => {
    const pending = buildActionBlockSummary([
      event("request", "approval_requested", 1000, {
        approval: { id: "approval-1" },
      }),
      event("tool", "tool_call", 1100, { tool: "run_command" }),
    ]);
    expect(pending.approvalCount).toBe(1);
    expect(pending.pendingApprovalCount).toBe(1);
    expect(pending.status).toBe("needs_approval");

    const resolved = buildActionBlockSummary([
      event("request", "approval_requested", 1000, {
        approval: { id: "approval-1" },
      }),
      event("tool", "tool_call", 1100, { tool: "run_command" }),
      event("granted", "approval_granted", 1300, { approvalId: "approval-1" }),
    ]);
    expect(resolved.approvalCount).toBe(1);
    expect(resolved.pendingApprovalCount).toBe(0);
    expect(resolved.status).toBe("done");
  });

  it("projects errors, artifacts, and sub-second duration in the collapsed header", () => {
    const summary = buildActionBlockSummary([
      event("tool", "tool_call", 1000, { tool: "write_file" }),
      event("artifact", "timeline_artifact_emitted", 1300, {
        artifactId: "artifact-1",
      }),
      event("error", "timeline_error", 1500, {
        message: "Write verification failed",
      }),
    ]);

    expect(summary.errorCount).toBe(1);
    expect(summary.artifactCount).toBe(1);
    expect(summary.status).toBe("failed");

    const html = renderToStaticMarkup(
      createElement(ActionBlock, {
        blockId: "block-v2",
        summary: summary.summary,
        iconKind: summary.iconKind,
        stepCount: summary.stepCount,
        toolCallCount: summary.toolCallCount,
        durationMs: summary.durationMs,
        outputTokens: summary.outputTokens,
        status: summary.status,
        approvalCount: summary.approvalCount,
        pendingApprovalCount: summary.pendingApprovalCount,
        errorCount: summary.errorCount,
        artifactCount: summary.artifactCount,
        isActive: false,
        expanded: false,
        onToggle: () => {},
        children: createElement("span", null, "details"),
      }),
    );
    expect(html).toContain("status-failed");
    expect(html).toContain("&lt;1s");
    expect(html).toContain('aria-expanded="false"');
  });

  it("treats unavailable candidate pages as skipped when another web source succeeds", () => {
    const summary = buildActionBlockSummary([
      event("call-1", "tool_call", 1000, {
        tool: "web_fetch",
        toolUseId: "source-1",
      }),
      event("error-1", "tool_error", 1100, {
        tool: "web_fetch",
        toolUseId: "source-1",
        error: "HTTP 404: Not Found",
      }),
      event(
        "finish-1",
        "timeline_step_finished",
        1200,
        {
          legacyType: "step_failed",
          message: "web_fetch finished with issues",
          step: { id: "tool_lane:step:source-1", description: "web_fetch" },
        },
        { status: "failed", stepId: "tool_lane:step:source-1" },
      ),
      event("call-2", "tool_call", 1300, {
        tool: "web_fetch",
        toolUseId: "source-2",
      }),
      event("result-2", "tool_result", 1400, {
        tool: "web_fetch",
        toolUseId: "source-2",
        result: { url: "https://example.com", title: "Example" },
      }),
    ]);

    expect(summary.errorCount).toBe(0);
    expect(summary.sourceIssueCount).toBe(1);
    expect(summary.status).toBe("done");
  });

  it("keeps an unrecovered web failure visible when no source succeeds", () => {
    const summary = buildActionBlockSummary([
      event("call", "tool_call", 1000, {
        tool: "web_fetch",
        toolUseId: "source-1",
      }),
      event("error", "tool_error", 1100, {
        tool: "web_fetch",
        toolUseId: "source-1",
        error: "HTTP 404: Not Found",
      }),
      event(
        "finish",
        "timeline_step_finished",
        1200,
        {
          legacyType: "step_failed",
          step: { id: "tool_lane:step:source-1", description: "web_fetch" },
        },
        { status: "failed", stepId: "tool_lane:step:source-1" },
      ),
    ]);

    expect(summary.errorCount).toBe(1);
    expect(summary.sourceIssueCount).toBe(0);
    expect(summary.status).toBe("failed");
  });

  it("marks a failed web attempt as recovered when a later fallback succeeds", () => {
    const failedAttempt = [
      event("call", "tool_call", 1000, {
        tool: "web_search",
        toolUseId: "search-1",
      }),
      event("error", "tool_error", 1100, {
        tool: "web_search",
        toolUseId: "search-1",
        error: "Search provider failed: fetch failed",
      }),
    ];
    const allEvents = [
      ...failedAttempt,
      event("progress", "assistant_message", 1200, {
        internal: true,
        message: "Trying a direct request instead",
      }),
      event("fallback-call", "tool_call", 1300, {
        tool: "http_request",
        toolUseId: "request-1",
      }),
      event("fallback-result", "tool_result", 1400, {
        tool: "http_request",
        toolUseId: "request-1",
        result: { success: true, status: 200 },
      }),
    ];

    const summary = buildActionBlockSummary(failedAttempt, allEvents, {
      taskStatus: "completed",
    });

    expect(summary.errorCount).toBe(0);
    expect(summary.recoveredErrorCount).toBe(1);
    expect(summary.status).toBe("recovered");
  });

  it("keeps an attempt-level error amber when the overall task completed", () => {
    const summary = buildActionBlockSummary(
      [
        event("call", "tool_call", 1000, {
          tool: "run_command",
          toolUseId: "command-1",
        }),
        event("error", "tool_error", 1100, {
          tool: "run_command",
          toolUseId: "command-1",
          error: "Command exited with code 1",
        }),
      ],
      undefined,
      { taskStatus: "completed" },
    );

    expect(summary.errorCount).toBe(1);
    expect(summary.status).toBe("attempt_failed");
  });

  it("clears a failed attempt when the same tool call later succeeds", () => {
    const summary = buildActionBlockSummary([
      event("call", "tool_call", 1000, {
        tool: "read_file",
        toolUseId: "read-1",
      }),
      event("error", "tool_error", 1100, {
        tool: "read_file",
        toolUseId: "read-1",
        error: "Temporary file lock",
      }),
      event("result", "tool_result", 1200, {
        tool: "read_file",
        toolUseId: "read-1",
        result: { success: true, content: "ok" },
      }),
    ]);

    expect(summary.errorCount).toBe(0);
    expect(summary.recoveredErrorCount).toBe(1);
    expect(summary.status).toBe("recovered");
  });

  it("does not count a failed tool-batch summary in addition to its tool failures", () => {
    const summary = buildActionBlockSummary([
      event("error-1", "tool_error", 1000, {
        tool: "read_file",
        toolUseId: "read-1",
        error: "File not found",
      }),
      event("error-2", "tool_error", 1100, {
        tool: "run_command",
        toolUseId: "command-1",
        error: "Command exited with code 1",
      }),
      event(
        "batch-failed",
        "timeline_group_finished",
        1200,
        {
          legacyType: "step_failed",
          groupLabel: "Follow-up tool batch",
          message: "Follow-up tool batch: 0 succeeded, 2 failed",
        },
        { status: "failed", legacyType: "step_failed" },
      ),
    ]);

    expect(summary.errorCount).toBe(2);
  });

  it("treats an exhausted web-search budget as a source limitation, not a broken tool", () => {
    const summary = buildActionBlockSummary([
      event("budget", "tool_error", 1000, {
        tool: "web_search",
        toolUseId: "search-4",
        error: "web_search step budget exhausted: 3/3",
        blocked: true,
        failureClass: "budget_exhausted",
      }),
    ]);

    expect(summary.errorCount).toBe(0);
    expect(summary.sourceIssueCount).toBe(1);
    expect(summary.status).toBe("done");
  });

  it("marks an unavailable optional preview as recovered after a file fallback completes", () => {
    const summary = buildActionBlockSummary(
      [
        event("write", "tool_result", 1000, {
          tool: "write_file",
          toolUseId: "write-1",
          result: { success: true, path: "report.html" },
        }),
        event("artifact", "timeline_artifact_emitted", 1050, {
          artifactId: "report.html",
        }),
        event("preview", "tool_error", 1100, {
          tool: "canvas_create",
          toolUseId: "canvas-1",
          error: "Tool canvas_create is not available in the current context",
          blocked: true,
        }),
      ],
      undefined,
      { taskStatus: "completed" },
    );

    expect(summary.errorCount).toBe(0);
    expect(summary.recoveredErrorCount).toBe(1);
    expect(summary.status).toBe("recovered");
  });

  it("keeps non-blocking action errors calm in summaries while preserving details", () => {
    applyPersistedLanguage("zh-CN");
    const failedAction = [
      event("call", "tool_call", 1000, {
        tool: "run_command",
        toolUseId: "command-1",
      }),
      event("error", "tool_error", 1100, {
        tool: "run_command",
        toolUseId: "command-1",
        error: "Command exited with code 1",
      }),
    ];

    const recovering = buildActionBlockSummary(failedAction, undefined, {
      taskStatus: "executing",
    });
    const recoveringHtml = renderToStaticMarkup(
      createElement(ActionBlock, {
        blockId: "recovering-block",
        ...recovering,
        isActive: false,
        expanded: false,
        onToggle: () => {},
        children: createElement("span", null, "details"),
      }),
    );
    expect(recoveringHtml).toContain("继续处理中");
    expect(recoveringHtml).toContain("正在自动调整，任务继续进行");
    expect(recoveringHtml).toContain("任务仍在正常推进");
    expect(recoveringHtml).not.toContain("部分工具操作未成功");
    expect(recoveringHtml).not.toContain("有操作未成功");
    expect(recoveringHtml).not.toContain("尝试未完成");

    const historical = buildActionBlockSummary(failedAction, undefined, {
      taskStatus: "executing",
      isHistoricalBlock: true,
    });
    const historicalHtml = renderToStaticMarkup(
      createElement(ActionBlock, {
        blockId: "historical-block",
        ...historical,
        isActive: false,
        expanded: false,
        onToggle: () => {},
        children: createElement("span", null, "details"),
      }),
    );
    expect(historical.status).toBe("attempt_failed");
    expect(historicalHtml).toContain("本轮已结束");
    expect(historicalHtml).not.toContain("部分工具操作未成功");
    expect(historicalHtml).not.toContain("有操作未成功");
    expect(historicalHtml).not.toContain("任务仍在继续");

    const completed = buildActionBlockSummary(failedAction, undefined, {
      taskStatus: "completed",
    });
    const completedHtml = renderToStaticMarkup(
      createElement(ActionBlock, {
        blockId: "completed-block",
        ...completed,
        isActive: false,
        expanded: false,
        onToggle: () => {},
        children: createElement("span", null, "details"),
      }),
    );
    expect(completedHtml).toContain("本轮已结束");
    expect(completedHtml).not.toContain("部分工具操作未成功");
    expect(completedHtml).not.toContain("有操作未成功");
  });

  it("projects 1,000 events within the warm-cache budget", () => {
    const events = Array.from({ length: 1_000 }, (_, index) =>
      event(`tool-${index}`, "tool_call", 1_000 + index, {
        tool:
          index % 3 === 0
            ? "read_file"
            : index % 3 === 1
              ? "grep"
              : "run_command",
      }),
    );
    buildActionBlockSummary(events);
    const startedAt = performance.now();
    const summary = buildActionBlockSummary(events);
    const elapsedMs = performance.now() - startedAt;

    expect(summary.toolCallCount).toBe(1_000);
    expect(elapsedMs).toBeLessThan(25);
  });

  it("keeps the execution transcript at a readable medium density", () => {
    expect(timelineStyles).toMatch(/\.conversation-flow\s*\{[^}]*gap: 3px;/);
    expect(timelineStyles).toMatch(
      /\.action-block-header\s*\{[^}]*min-height: 34px;/,
    );
    expect(timelineStyles).toMatch(
      /\.chat-message\.assistant-message\.assistant-process-message\s*\{[^}]*margin: 0 0 4px;/,
    );
    expect(timelineStyles).toMatch(
      /\.conversation-flow \.action-block \+ \.chat-message,[\s\S]*?margin-top: 8px;/,
    );
  });
});
