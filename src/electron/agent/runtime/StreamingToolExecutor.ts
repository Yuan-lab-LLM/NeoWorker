import type { LLMToolUse } from "../llm/types";
import type { ToolExecutionCoordinator } from "./ToolExecutionCoordinator";
import type { ToolInvocationContext } from "./ToolInvocationContext";
import type { RuntimeToolSchedulerSpec } from "./runtime-tool-scheduler-spec";

export interface StreamingToolExecutionUpdate {
  toolUse: LLMToolUse;
  outcome: Awaited<ReturnType<ToolExecutionCoordinator["executeTool"]>>;
}

export class StreamingToolExecutor {
  private readonly queue: LLMToolUse[] = [];
  private readonly completed: StreamingToolExecutionUpdate[] = [];
  private discarded = false;
  private running = false;

  constructor(
    private readonly coordinator: ToolExecutionCoordinator,
    private readonly context: ToolInvocationContext,
    private readonly resolveSchedulerSpec?: (
      toolName: string,
      input: Any,
    ) => RuntimeToolSchedulerSpec,
  ) {}

  discard(): void {
    this.discarded = true;
    this.queue.length = 0;
  }

  addToolUse(toolUse: LLMToolUse): void {
    if (this.discarded) return;
    if (this.queue.length > 0 && this.resolveSchedulerSpec) {
      const spec = this.resolveSchedulerSpec(toolUse.name, toolUse.input);
      if (spec.concurrencyClass !== "read_parallel" || !spec.idempotent) {
        this.discard();
        return;
      }
    }
    this.queue.push(toolUse);
  }

  async flush(): Promise<StreamingToolExecutionUpdate[]> {
    if (this.discarded || this.running) return this.completed.splice(0);
    this.running = true;
    try {
      while (this.queue.length > 0 && !this.discarded) {
        const toolUse = this.queue.shift()!;
        const outcome = await this.coordinator.executeTool(
          toolUse.name,
          toolUse.input,
          this.context,
          toolUse.id,
        );
        this.completed.push({ toolUse, outcome });
      }
      return this.completed.splice(0);
    } finally {
      this.running = false;
    }
  }
}
