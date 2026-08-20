/**
 * Debug execution mode — shared phase labels for UI and timeline payloads.
 */
export type DebugPhase =
  | "hypothesize"
  | "instrument"
  | "reproduce"
  | "analyze"
  | "fix"
  | "verify"
  | "cleanup";

export const DEBUG_PHASE_ORDER: DebugPhase[] = [
  "hypothesize",
  "instrument",
  "reproduce",
  "analyze",
  "fix",
  "verify",
  "cleanup",
];
