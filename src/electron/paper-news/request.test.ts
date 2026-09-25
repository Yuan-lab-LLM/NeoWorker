import { describe, expect, it } from "vitest";
import { paperNewsHttpError, retryDeadline } from "./request";
import {
  DEFAULT_PAPER_NEWS_CONFIG,
  PAPER_NEWS_SOURCES,
  paperNewsNeedsRefresh,
  type PaperNewsSnapshot,
} from "../../shared/paper-news";
const now = Date.parse("2026-09-24T12:00:00Z");
describe("feed retry policy", () => {
  it("honors numeric and HTTP-date Retry-After and the later exhausted quota reset", () => {
    expect(retryDeadline(new Headers({ "Retry-After": "120" }), now)).toBe(now + 120_000);
    expect(
      retryDeadline(new Headers({ "Retry-After": new Date(now + 120_000).toUTCString() }), now),
    ).toBe(now + 120_000);
    expect(
      retryDeadline(
        new Headers({
          "Retry-After": "120",
          "x-ratelimit-remaining": "0",
          "x-ratelimit-reset": String((now + 3600_000) / 1000),
        }),
        now,
      ),
    ).toBe(now + 3600_000);
    expect(paperNewsHttpError(new Response(null, { status: 403 }), "arxiv", now).code).toBe(
      "accessDenied",
    );
    expect(paperNewsHttpError(new Response(null, { status: 429 }), "arxiv", now).code).toBe(
      "rateLimit",
    );
  });
  it("does not let one successful source suppress a due failed source", () => {
    const snapshot: PaperNewsSnapshot = {
      config: DEFAULT_PAPER_NEWS_CONFIG,
      items: [],
      saved: [],
      refreshing: false,
      sources: {
        ...(Object.fromEntries(
          PAPER_NEWS_SOURCES.map((s) => [s, { updatedAt: new Date(now).toISOString() }]),
        ) as PaperNewsSnapshot["sources"]),
        arxiv: {
          error: "network",
          attemptedAt: new Date(now).toISOString(),
          nextRetryAt: new Date(now + 60_000).toISOString(),
        },
        huggingface: { updatedAt: new Date(now).toISOString() },
        github: { updatedAt: new Date(now).toISOString() },
      },
    };
    expect(paperNewsNeedsRefresh(snapshot, now)).toBe(false);
    expect(paperNewsNeedsRefresh(snapshot, now + 60_000)).toBe(true);
    snapshot.sources.arxiv = { updatedAt: new Date(now + 60_000).toISOString() };
    expect(paperNewsNeedsRefresh(snapshot, now + 60_000)).toBe(false);
  });
});
