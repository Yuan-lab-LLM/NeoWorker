import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { TaskTraceRunSibling } from "../../../shared/types";
import {
  resolveTaskTraceSiblingRuns,
  TaskTraceDebuggerPanel,
} from "../TaskTraceDebuggerPanel";

describe("TaskTraceDebuggerPanel", () => {
  it("renders a persistent run browser instead of the old blank trace canvas", () => {
    const markup = renderToStaticMarkup(
      React.createElement(TaskTraceDebuggerPanel),
    );

    expect(markup).toContain("task-trace-run-browser");
    expect(markup).toContain("task-trace-detail-pane");
    expect(markup).toContain("最近运行");
    expect(markup).toContain("还没有可追踪的任务");
    expect(markup).not.toContain("task-trace-empty-large");
  });

  it("keeps the complete session run family when legacy detail data is partial", () => {
    const run = (taskId: string): TaskTraceRunSibling => ({
      taskId,
      title: taskId,
      status: "completed",
      createdAt: 1,
      updatedAt: 1,
    });
    const detailRuns = [run("child-1"), run("child-2")];
    const summaryRuns = [run("root"), ...detailRuns];

    expect(resolveTaskTraceSiblingRuns(detailRuns, summaryRuns)).toEqual(
      summaryRuns,
    );
    expect(resolveTaskTraceSiblingRuns(summaryRuns, detailRuns)).toEqual(
      summaryRuns,
    );
  });
});
