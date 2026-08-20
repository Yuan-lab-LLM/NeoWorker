import { describe, expect, it } from "vitest";
import { transformReleaseNotesUrl } from "../release-notes-markdown";

describe("transformReleaseNotesUrl", () => {
  it("keeps safe external urls unchanged", () => {
    expect(transformReleaseNotesUrl("https://example.com/docs")).toBe(
      "https://example.com/docs",
    );
    expect(transformReleaseNotesUrl("mailto:team@example.com")).toBe(
      "mailto:team@example.com",
    );
  });

  it("resolves repo-relative links from GitHub release pages against the tagged blob path", () => {
    expect(
      transformReleaseNotesUrl(
        "docs/release-notes-0.5.23.md",
        "https://github.com/NeoWorker/NeoWorker/releases/tag/v0.5.23",
      ),
    ).toBe(
      "https://github.com/NeoWorker/NeoWorker/blob/v0.5.23/docs/release-notes-0.5.23.md",
    );
  });

  it("resolves GitHub root-relative links against github.com", () => {
    expect(
      transformReleaseNotesUrl(
        "/NeoWorker/NeoWorker/pull/123",
        "https://github.com/NeoWorker/NeoWorker/releases/tag/v0.5.23",
      ),
    ).toBe("https://github.com/NeoWorker/NeoWorker/pull/123");
  });

  it("rejects unsafe protocols", () => {
    expect(transformReleaseNotesUrl("javascript:alert(1)")).toBe("");
    expect(transformReleaseNotesUrl("data:text/html;base64,abc")).toBe("");
  });
});
