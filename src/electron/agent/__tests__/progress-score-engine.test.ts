import { describe, expect, it } from "vitest";

import type { TaskEvent } from "../../../shared/types";
import { ProgressScoreEngine } from "../progress-score-engine";

let eventCounter = 0;

function makeEvent(
  type: TaskEvent["type"],
  payload: Record<string, unknown> = {},
  overrides: Partial<TaskEvent> = {},
): TaskEvent {
  return {
    id: `event-${type}-${eventCounter++}`,
    taskId: "task-1",
    timestamp: Date.now(),
    schemaVersion: 2,
    type,
    payload,
    ...overrides,
  };
}

describe("ProgressScoreEngine", () => {
  it("scores productive windows positively", () => {
    const assessment = ProgressScoreEngine.assessWindow([
      makeEvent("step_completed"),
      makeEvent("file_modified", { path: "src/app.ts" }),
      makeEvent("assistant_message", { message: "Implemented and verified." }),
    ]);

    expect(assessment.progressScore).toBeGreaterThanOrEqual(0.25);
    expect(assessment.loopRiskIndex).toBeLessThan(0.7);
    expect(assessment.windowSummary.stepCompleted).toBe(1);
    expect(assessment.windowSummary.writeMutations).toBe(1);
  });

  it("penalizes empty/no-op turns", () => {
    const assessment = ProgressScoreEngine.assessWindow([
      makeEvent("assistant_message", { message: "   " }),
    ]);

    expect(assessment.progressScore).toBeLessThan(0);
    expect(assessment.windowSummary.emptyNoOpTurns).toBe(1);
  });

  it("flags high loop risk for repeated identical tool failures", () => {
    const repeatedErrorPayload = {
      tool: "run_command",
      input: { cmd: "npm test" },
      error: "ENOENT: npm not found",
    };
    const assessment = ProgressScoreEngine.assessWindow([
      makeEvent("tool_error", repeatedErrorPayload),
      makeEvent("tool_error", repeatedErrorPayload),
      makeEvent("tool_error", repeatedErrorPayload),
    ]);

    expect(assessment.repeatedFingerprintCount).toBeGreaterThanOrEqual(3);
    expect(assessment.loopRiskIndex).toBeGreaterThanOrEqual(0.7);
    expect(assessment.progressScore).toBeLessThan(0);
  });

  it("credits error recovery when a failed window later completes a step", () => {
    const assessment = ProgressScoreEngine.assessWindow([
      makeEvent("tool_error", {
        tool: "web_search",
        input: { q: "foo" },
        error: "timeout",
      }),
      makeEvent("step_completed"),
    ]);

    expect(assessment.windowSummary.resolvedErrorRecoveries).toBe(1);
  });
});
