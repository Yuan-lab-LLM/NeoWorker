import type { Task, TaskEvent } from "../../shared/types";

function makeEvent(
  id: string,
  timestamp: number,
  type: string,
  payload: Record<string, unknown> = {},
): TaskEvent {
  return {
    id,
    eventId: id,
    taskId: "failure-storm-task-1",
    timestamp,
    type,
    payload,
    schemaVersion: 2,
  } as TaskEvent;
}

export const taskSurfaceFailureStormTask: Task = {
  id: "failure-storm-task-1",
  title: "Failure storm renderer fixture",
  prompt: "Replay a noisy provider/search/tool failure run.",
  status: "executing",
  workspaceId: "fixture-workspace-1",
  createdAt: 0,
  updatedAt: 0,
} as Task;

const events: TaskEvent[] = [
  makeEvent("user-1", 100, "user_message", {
    message: "Run a broad research task and keep going through failures.",
  }),
  makeEvent("assistant-1", 150, "assistant_message", {
    message: "I will start with search, then verify results with tools.",
  }),
  makeEvent("approval-1", 180, "approval_requested", {
    message: "Allow web search for this run?",
  }),
];

for (let index = 0; index < 596; index += 1) {
  const timestamp = 200 + index * 30;
  const cycle = index % 10;
  if (cycle === 0) {
    events.push(
      makeEvent(`tool-call-${index}`, timestamp, "tool_call", {
        tool: index % 20 === 0 ? "web_search" : "run_command",
        callId: `call-${index}`,
        input: { query: `storm query ${index}` },
      }),
    );
  } else if (cycle === 1) {
    events.push(
      makeEvent(`tool-result-${index}`, timestamp, "tool_result", {
        tool: "web_search",
        callId: `call-${index - 1}`,
        success: false,
        error: "fetch failed: network timeout while querying provider",
        code: "FETCH_FAILED",
      }),
    );
  } else if (cycle === 2 || cycle === 3) {
    events.push(
      makeEvent(`progress-${index}`, timestamp, "timeline_step_updated", {
        legacyType: "progress_update",
        message:
          cycle === 2
            ? "Retrying provider request after fetch failed"
            : `Collected partial result ${index}`,
      }),
    );
  } else if (cycle === 4) {
    events.push(
      makeEvent(`stream-${index}`, timestamp, "llm_streaming", {
        delta: "token",
      }),
    );
  } else if (cycle === 5) {
    events.push(
      makeEvent(`command-${index}`, timestamp, "command_output", {
        type: "stdout",
        sessionId: "cmd-storm",
        output: `line ${index}: retrying failed request\n`,
      }),
    );
  } else if (cycle === 6) {
    events.push(
      makeEvent(`network-error-${index}`, timestamp, "error", {
        provider: "search",
        code: "FETCH_FAILED",
        message: "fetch failed: network timeout while querying provider",
      }),
    );
  } else if (cycle === 7) {
    events.push(
      makeEvent(`child-${index}`, timestamp, "task_created", {
        childTaskId: `child-task-${index}`,
        title: `Child task ${index}`,
      }),
    );
  } else if (cycle === 8) {
    events.push(
      makeEvent(`step-finished-${index}`, timestamp, "timeline_step_finished", {
        legacyType: "step_completed",
        step: { id: `step-${index}`, description: `Recovered step ${index}` },
      }),
    );
  } else {
    events.push(
      makeEvent(`provider-failure-${index}`, timestamp, "progress_update", {
        message: "OpenAI provider network failure: fetch failed",
        code: "FETCH_FAILED",
      }),
    );
  }
}

events.push(
  makeEvent("artifact-1", 18_200, "artifact_created", {
    path: "artifacts/failure-storm-summary.md",
  }),
  makeEvent("assistant-2", 18_230, "assistant_message", {
    message: "The latest usable result is summarized in the artifact.",
  }),
  makeEvent("terminal-1", 18_260, "task_completed", {
    resultSummary:
      "Completed with repeated provider failures coalesced in live mode.",
  }),
);

export const taskSurfaceFailureStormEvents = events;
