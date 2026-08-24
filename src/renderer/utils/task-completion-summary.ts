import type { TaskEvent } from "../../shared/types";
import { getEffectiveTaskEventType } from "./task-event-compat";

function getTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function getAuthoritativeOutputCount(event: TaskEvent): number | null {
  const outputSummary = event.payload?.outputSummary;
  if (!outputSummary || typeof outputSummary !== "object") return null;
  const count = Number((outputSummary as { outputCount?: unknown }).outputCount);
  return Number.isFinite(count) && count >= 0 ? count : 0;
}

function looksLikeTransientExecutionNote(value: string): boolean {
  const text = value.trim();
  if (!text || text.length > 320) return false;
  return /(?:shell|command|tool|officecli|脚本|命令|工具).{0,80}(?:异常|失败|报错|未注册|not found|failed|error|exit\s*\d+)|(?:正在|继续)(?:检查|处理|生成|验证|重试)|(?:checking|processing|retrying|verifying|generating)\b/i.test(
    text,
  );
}

/**
 * Pick the user-facing completion message for one concrete completion event.
 *
 * The event's direct result belongs to that exact turn. A best-known outcome is
 * task-scoped and may contain either an earlier verbose analysis or an earlier
 * artifact delivery after a follow-up. Therefore the direct result is normally
 * authoritative. The durable fallback is used only for old events whose direct
 * result is clearly a short execution/error note rather than a final answer.
 */
export function selectCompletionResultSummary(event: TaskEvent): string {
  if (getEffectiveTaskEventType(event) !== "task_completed") return "";

  const direct = getTrimmedString(event.payload?.resultSummary);
  const durable = getTrimmedString(
    event.payload?.bestKnownOutcome?.resultSummary,
  );
  if (!direct) return durable;
  if (!durable) return direct;

  // Presence of outputSummary (including outputCount: 0) makes this a modern,
  // turn-authoritative completion contract. Never let task-scoped history
  // replace its result with content from another step or follow-up.
  if (getAuthoritativeOutputCount(event) !== null) return direct;

  return looksLikeTransientExecutionNote(direct) ? durable : direct;
}
