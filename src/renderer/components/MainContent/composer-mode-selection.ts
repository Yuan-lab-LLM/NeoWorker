import type { ExecutionMode, TaskDomain } from "../../../shared/types";

export type ComposerModeSelection = "auto" | "execute" | "research";

export const COMPOSER_MODE_ORDER: ComposerModeSelection[] = [
  "auto",
  "execute",
  "research",
];

export const COMPOSER_MODE_LABEL: Record<ComposerModeSelection, string> = {
  auto: "Auto",
  execute: "Execute",
  research: "Research",
};

export const COMPOSER_MODE_HINT: Record<ComposerModeSelection, string> = {
  auto: "Automatically chooses the best way to handle each request",
  execute: "Forces full task execution with tools",
  research: "Optimizes the task for research and synthesis",
};

export interface ComposerModeState {
  executionMode: ExecutionMode;
  executionModeDirty: boolean;
  taskDomain: TaskDomain;
  taskDomainDirty: boolean;
}

export function deriveComposerModeSelection(
  state: ComposerModeState,
): ComposerModeSelection {
  if (state.taskDomainDirty && state.taskDomain === "research") {
    return "research";
  }
  if (
    state.executionModeDirty &&
    state.executionMode === "execute" &&
    state.taskDomain === "auto"
  ) {
    return "execute";
  }
  return "auto";
}

export function resolveComposerModeSelection(
  selection: ComposerModeSelection,
): ComposerModeState {
  switch (selection) {
    case "execute":
      return {
        executionMode: "execute",
        executionModeDirty: true,
        taskDomain: "auto",
        taskDomainDirty: true,
      };
    case "research":
      return {
        executionMode: "execute",
        executionModeDirty: false,
        taskDomain: "research",
        taskDomainDirty: true,
      };
    case "auto":
    default:
      return {
        executionMode: "execute",
        executionModeDirty: false,
        taskDomain: "auto",
        taskDomainDirty: false,
      };
  }
}
