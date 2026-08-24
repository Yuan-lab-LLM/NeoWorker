import type { PlanStep, QueueStatus, Task } from "../../shared/types";

export type ProgressDisplayStep = PlanStep;

export function getQueueStatusSignature(
  queueStatus: QueueStatus | null | undefined,
): string {
  if (!queueStatus) return "none";
  return [
    queueStatus.runningCount,
    queueStatus.queuedCount,
    queueStatus.maxConcurrent,
    queueStatus.runningTaskIds.join(","),
    queueStatus.queuedTaskIds.join(","),
  ].join(":");
}

export function getPlanStepsSignature(planSteps: PlanStep[]): string {
  return planSteps
    .map(
      (step) =>
        `${step.id}:${step.status}:${step.error ?? ""}:${step.description}`,
    )
    .join("|");
}

export function getTaskListSignature(tasks: Task[]): string {
  return tasks
    .map((task) => `${task.id}:${task.status}:${task.title || task.prompt}`)
    .join("|");
}

export function shouldShowComposerProgress(args: {
  taskStatus: Task["status"];
  isTaskWorking: boolean;
  planStepCount: number;
}): boolean {
  if (args.planStepCount <= 0) return false;
  const taskHasEnded =
    !args.isTaskWorking &&
    ["completed", "failed", "cancelled"].includes(args.taskStatus);
  return !taskHasEnded;
}

export function getProgressSectionMaterialSignature(args: {
  expanded: boolean;
  planSteps: PlanStep[];
  taskStatus?: Task["status"];
  taskTerminalStatus?: Task["terminalStatus"];
  hasActiveChildren: boolean;
  emptyHintText: string;
}): string {
  return [
    args.expanded ? 1 : 0,
    getPlanStepsSignature(args.planSteps),
    args.taskStatus ?? "none",
    args.taskTerminalStatus ?? "none",
    args.hasActiveChildren ? 1 : 0,
    args.emptyHintText,
  ].join(":");
}

export function getQueueSectionMaterialSignature(args: {
  expanded: boolean;
  runningTasks: Task[];
  queuedTasks: Task[];
  activeLabel: string;
  nextLabel: string;
}): string {
  return [
    args.expanded ? 1 : 0,
    getTaskListSignature(args.runningTasks),
    getTaskListSignature(args.queuedTasks),
    args.activeLabel,
    args.nextLabel,
  ].join(":");
}

export function getVisibleProgressSteps(
  planSteps: PlanStep[],
): ProgressDisplayStep[] {
  // Plans are already bounded by the executor. Never replace real work with a
  // synthetic "N planned steps" row: users need the original descriptions to
  // understand what is running and to diagnose a stalled task.
  return planSteps.map((step) => ({ ...step }));
}
