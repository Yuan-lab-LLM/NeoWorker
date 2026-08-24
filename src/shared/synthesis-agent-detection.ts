/**
 * Synthesis Agent Detection
 *
 * Identifies the Synthesis child task in collaborative runs. The Synthesis agent
 * is created by the orchestrator to gather and analyze sub-agent outputs — its
 * steps/output should be shown in the main view, not in a separate window.
 */

import type { Task } from "./types";

export const SYNTHESIS_TASK_TITLE = "Synthesis";

export function isSynthesisChildTask(task: Task): boolean {
  return task.title === SYNTHESIS_TASK_TITLE;
}
