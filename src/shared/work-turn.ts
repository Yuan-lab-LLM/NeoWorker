import type { TaskOutputSummary } from "./types";

/** A user request has its own outcome even when Task preserves an older result. */
export type WorkTurnState = "queued" | "running" | "waiting" | "completed" | "partial" | "failed" | "cancelled" | "interrupted";

export interface WorkTurn {
  id: string;
  taskId: string;
  ordinal: number;
  revision: number;
  parentTurnId?: string;
  state: WorkTurnState;
  startedAt: number;
  finishedAt?: number;
  outputSummary?: TaskOutputSummary;
}

export interface ArtifactRevision {
  id: string;
  turnId: string;
  taskId: string;
  path: string;
  sha256: string;
  size: number;
  previousRevisionId?: string;
  createdAt: number;
}

export function isWorkTurnTerminal(state: WorkTurnState): boolean {
  return state !== "running" && state !== "waiting" && state !== "queued";
}
