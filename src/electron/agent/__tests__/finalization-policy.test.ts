import { describe, expect, it } from "vitest";
import {
  POST_TOOL_FINALIZATION_CONTINUATION_MAX_TOKENS,
  POST_TOOL_FINALIZATION_INITIAL_MAX_TOKENS,
  RESULT_SUMMARY_MAX_CHARS,
  truncateResultSummary,
} from "../finalization-policy";

describe("finalization output policy", () => {
  it("keeps enough budget for a complete post-tool answer", () => {
    expect(POST_TOOL_FINALIZATION_INITIAL_MAX_TOKENS).toBe(4000);
    expect(POST_TOOL_FINALIZATION_CONTINUATION_MAX_TOKENS).toBe(4000);
  });

  it("truncates only summaries longer than the display safety limit", () => {
    const short = "complete answer";
    expect(truncateResultSummary(short)).toBe(short);

    const long = "x".repeat(RESULT_SUMMARY_MAX_CHARS + 25);
    const truncated = truncateResultSummary(long);
    expect(truncated).toHaveLength(RESULT_SUMMARY_MAX_CHARS + 3);
    expect(truncated.endsWith("...")).toBe(true);
  });
});
