import { describe, expect, it } from "vitest";
import { buildYouTubeTranscriptFtsQuery } from "../YouTubeTranscriptStore";

describe("buildYouTubeTranscriptFtsQuery", () => {
  it("keeps meaningful terms from natural-language questions", () => {
    expect(buildYouTubeTranscriptFtsQuery("What is the implementation plan about APIs?")).toBe(
      '"implementation" OR "plan" OR "apis"',
    );
  });

  it("deduplicates and quotes tokens for FTS5", () => {
    expect(buildYouTubeTranscriptFtsQuery("transcript transcript search")).toBe(
      '"transcript" OR "search"',
    );
  });

  it("returns an empty query when only stop words remain", () => {
    expect(buildYouTubeTranscriptFtsQuery("what is this and how")).toBe("");
  });

  it("keeps non-English query terms", () => {
    expect(buildYouTubeTranscriptFtsQuery("実装 計画")).toBe('"実装" OR "計画"');
  });
});
