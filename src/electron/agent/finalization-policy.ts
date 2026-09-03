/**
 * Output limits used by the tool-free turn that closes a task after tool
 * execution.  Keep these values in source so packaged builds receive the
 * same limits as development builds; runtime hotfix scripts are only a
 * recovery mechanism and are not part of the release contract.
 */
export const POST_TOOL_FINALIZATION_INITIAL_MAX_TOKENS = 4000;
export const POST_TOOL_FINALIZATION_CONTINUATION_MAX_TOKENS = 4000;
export const RESULT_SUMMARY_MAX_CHARS = 20_000;

export function truncateResultSummary(text: string): string {
  const normalized = String(text ?? "");
  return normalized.length > RESULT_SUMMARY_MAX_CHARS
    ? `${normalized.slice(0, RESULT_SUMMARY_MAX_CHARS)}...`
    : normalized;
}
