export type LoopBudgetStopReason =
  | "max_llm_calls"
  | "max_recovered_responses"
  | "max_repeated_iterations";

export interface StepLoopBudget {
  maxIterations: number;
  maxLlmCalls: number;
  maxRecoveredResponses: number;
  maxRepeatedIterations: number;
  maxContextRecoveries: number;
  maxMaxTokenRecoveries: number;
}

export function defaultStepLoopBudget(): StepLoopBudget {
  return {
    // A normal step should converge in a few tool/response turns. Large
    // budgets hide routing bugs and can turn one wrong step into a 40-minute
    // run. Complex work belongs in a bounded multi-step plan instead.
    maxIterations: 8,
    maxLlmCalls: 8,
    // Step execution can intentionally recover malformed tool arguments twice.
    // Keep the kernel budget aligned with that retry policy; otherwise the
    // second successful recovery is immediately converted into a loop-budget
    // failure before the model gets a chance to issue the corrected tool call.
    maxRecoveredResponses: 2,
    maxRepeatedIterations: 2,
    maxContextRecoveries: 1,
    maxMaxTokenRecoveries: 1,
  };
}
