import type { Task } from "./types";
import { isAutomatedTaskLike } from "./automated-task-detection";

/**
 * Format LLM provider errors for user display.
 * Rate limit errors get actionable guidance for manual tasks; shorter copy for automated/scheduled.
 */
export function formatProviderErrorForDisplay(
  errorMessage: string,
  options?: { task?: Task | null },
): string {
  const msg = String(errorMessage || "").trim();
  if (!msg) return "Provider error";
  if (/429|rate limit|too many requests|free-models-per-min/i.test(msg)) {
    const automated = isAutomatedTaskLike(options?.task);
    if (automated) {
      return "Rate limit exceeded. Will retry automatically.";
    }
    const hint = /free-models-per-min|free.*model/i.test(msg)
      ? " Free tier has strict limits — add an OpenRouter API key in Settings for higher limits, or wait a minute and try again."
      : " Wait a minute and try again, or add an API key in Settings for higher limits.";
    return `Rate limit exceeded.${hint}`;
  }
  return msg;
}
