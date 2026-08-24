import type {
  ToolPolicyStage,
  ToolPolicyStageDecision,
  ToolPolicyTrace,
  ToolPolicyTraceEntry,
} from "../../../shared/types";

export class ToolPolicyTraceBuilder {
  private readonly entries: ToolPolicyTraceEntry[] = [];

  constructor(private readonly toolName: string) {}

  add(
    stage: ToolPolicyStage,
    decision: ToolPolicyStageDecision,
    reason?: string,
    metadata?: Record<string, unknown>,
  ): void {
    this.entries.push({
      stage,
      decision,
      reason,
      metadata,
      timestamp: Date.now(),
    });
  }

  build(finalDecision: Exclude<ToolPolicyStageDecision, "skip">): ToolPolicyTrace {
    return {
      toolName: this.toolName,
      finalDecision,
      entries: this.entries.slice(),
    };
  }
}
