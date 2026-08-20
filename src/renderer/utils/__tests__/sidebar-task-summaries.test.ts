import { describe, expect, it } from "vitest";

import type { Task } from "../../../shared/types";
import {
  getTaskHydrationAttemptKey,
  hasTaskHydrationAttempted,
  mergeSidebarInitialPageWithSelectedTask,
  mergeSidebarTaskSummariesWithExisting,
  pruneTaskHydrationAttemptKeys,
  recordTaskHydrationAttemptSuccess,
  shouldHydrateTaskSummary,
} from "../sidebar-task-summaries";

function createTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    title: "Task one",
    prompt: "Full prompt",
    status: "pending",
    workspaceId: "workspace-1",
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  } as Task;
}

describe("sidebar task summaries", () => {
  it("preserves rich task fields when a lightweight sidebar summary refreshes", () => {
    const existing = createTask({
      rawPrompt: "Raw prompt",
      userPrompt: "User prompt",
      resultSummary: "Rich result",
      semanticSummary: "Rich semantic",
      bestKnownOutcome: { capturedAt: 1, resultSummary: "Rich outcome" },
      agentConfig: { autonomousMode: true },
    });
    const summary = createTask({
      prompt: "",
      rawPrompt: undefined,
      userPrompt: undefined,
      sidebarPromptPreview: "Preview",
      resultSummary: "Summary result",
      semanticSummary: "Summary semantic",
      bestKnownOutcome: undefined,
      agentConfig: { collaborativeMode: true },
    });

    const [merged] = mergeSidebarTaskSummariesWithExisting(
      [existing],
      [summary],
    );

    expect(merged.rawPrompt).toBe("Raw prompt");
    expect(merged.userPrompt).toBe("User prompt");
    expect(merged.resultSummary).toBe("Rich result");
    expect(merged.semanticSummary).toBe("Rich semantic");
    expect(merged.bestKnownOutcome).toMatchObject({
      resultSummary: "Rich outcome",
    });
    expect(merged.sidebarPromptPreview).toBe("Preview");
    expect(merged.agentConfig).toMatchObject({
      autonomousMode: true,
      collaborativeMode: true,
    });
  });

  it("keeps the selected task when a refreshed first sidebar page omits it", () => {
    const selected = createTask({
      id: "selected",
      title: "Selected",
      rawPrompt: "Keep me",
    });
    const firstPage = [
      createTask({ id: "newer-1", title: "Newer 1" }),
      createTask({ id: "newer-2", title: "Newer 2" }),
    ];

    const merged = mergeSidebarInitialPageWithSelectedTask(
      [selected],
      firstPage,
      "selected",
    );

    expect(merged.map((task) => task.id)).toEqual([
      "newer-1",
      "newer-2",
      "selected",
    ]);
    expect(merged.at(-1)?.rawPrompt).toBe("Keep me");
  });

  it("hydrates summary-only selected tasks but not already rich tasks", () => {
    expect(
      shouldHydrateTaskSummary(
        createTask({
          prompt: "",
          rawPrompt: undefined,
          userPrompt: undefined,
          sidebarPromptPreview: "Preview",
        }),
      ),
    ).toBe(true);

    expect(
      shouldHydrateTaskSummary(createTask({ rawPrompt: "Raw prompt" })),
    ).toBe(false);
  });

  it("records hydration attempts only through the success helper and prunes stale keys", () => {
    const summary = createTask({
      id: "task-1",
      prompt: "",
      rawPrompt: undefined,
      userPrompt: undefined,
      sidebarPromptPreview: "Preview",
    });
    const keys = new Set<string>([
      getTaskHydrationAttemptKey(
        "stale-task",
        createTask({ id: "stale-task" }),
      ),
    ]);

    expect(hasTaskHydrationAttempted(keys, "task-1", summary)).toBe(false);

    recordTaskHydrationAttemptSuccess(
      keys,
      "task-1",
      summary,
      new Set(["task-1"]),
    );

    expect(hasTaskHydrationAttempted(keys, "task-1", summary)).toBe(true);
    expect(
      Array.from(keys).every((key) => !key.startsWith("stale-task:")),
    ).toBe(true);
  });

  it("bounds hydration attempt keys by dropping oldest entries", () => {
    const keys = new Set<string>(["a:1:", "b:1:", "c:1:"]);

    pruneTaskHydrationAttemptKeys(keys, new Set(["a", "b", "c"]), 2);

    expect(Array.from(keys)).toEqual(["b:1:", "c:1:"]);
  });
});
