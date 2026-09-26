import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { extractNewsSummary, NewsSummaries } from "./summaries";
import { PaperNewsService } from "./service";
import { DEFAULT_PAPER_NEWS_CONFIG, type PaperNewsItem } from "../../shared/paper-news";
const text = "这是一段来自公开文章页面的真实摘要，介绍事件背景、公开信息及具体变化。";
const item: PaperNewsItem = {
  id: `wallstreetcn:${createHash("sha256").update("https://wallstreetcn.com/articles/1234567").digest("hex").slice(0,24)}`,
  source: "wallstreetcn",
  url: "https://wallstreetcn.com/articles/1234567",
  title: "这是一条公开的新闻标题",
  summary: "",
  authors: [],
  date: "",
  tags: [],
  matchedTopics: [],
  score: 0,
};
const dirs: string[] = [];
afterEach(() => {
  vi.useRealTimers();
  dirs.splice(0).forEach((dir) => fs.rmSync(dir, { recursive: true, force: true }));
});
const htmlResponse = (html: string) =>
  new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
describe("public news summaries", () => {
  it("prefers decoded page descriptions and never invents headline summaries", () => {
    expect(
      extractNewsSummary(
        `<meta content="${text} &amp; detail" property="og:description"><article><p>Other content</p></article>`,
        item.title,
      ),
    ).toEqual({ summary: `${text} & detail`, kind: "description" });
    expect(
      extractNewsSummary(`<title>${item.title}</title><nav><p>${text}</p></nav>`, item.title),
    ).toEqual({ error: "unavailable" });
    expect(
      extractNewsSummary(
        '<meta name="description" content="Please enable JavaScript to continue using this website">',
        item.title,
      ),
    ).toEqual({ error: "unavailable" });
  });
  it("labels visible body paragraphs as excerpts, skips scripts/navigation and declared paywalls", () => {
    expect(
      extractNewsSummary(
        `<article><script><p>bad</p></script><p>${text}</p></article>`,
        item.title,
      ),
    ).toEqual({ summary: text, kind: "excerpt" });
    expect(
      extractNewsSummary(
        `<script type="application/ld+json">{"isAccessibleForFree":false}</script><article><p>${text}</p></article>`,
        item.title,
      ),
    ).toEqual({ error: "blocked" });
  });
  it("deduplicates fetches and respects host Retry-After", async () => {
    const fetcher = vi.fn(
      async () => new Response("", { status: 429, headers: { "Retry-After": "120" } }),
    );
    let now = 0;
    const service = new NewsSummaries(fetcher, () => now);
    expect(await Promise.all([service.get(item), service.get(item)])).toEqual([
      { error: "blocked" },
      { error: "blocked" },
    ]);
    now = 100_000;
    expect(await service.get({ ...item, url: item.url + "8" })).toEqual({ error: "blocked" });
    expect(fetcher).toHaveBeenCalledTimes(1);
    now = 121_000;
    await service.get(item);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("accepts only cached publisher URLs and refuses off-site redirects", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(null, { status: 302, headers: { location: "http://127.0.0.1/private" } }),
    );
    const service = new NewsSummaries(fetcher);
    expect(await service.get(undefined)).toEqual({ error: "unavailable" });
    expect(await service.get({ ...item, url: "https://evil.example/" })).toEqual({
      error: "unavailable",
    });
    expect(fetcher).not.toHaveBeenCalled();
    expect(await service.get(item)).toEqual({ error: "blocked" });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][1]).toMatchObject({ redirect: "manual", credentials: "omit" });
  });
  it("bounds response bytes, rejects non-HTML and uses a timeout signal", async () => {
    expect(
      await new NewsSummaries(async () => htmlResponse("x".repeat(2 * 1024 * 1024 + 1))).get(item),
    ).toEqual({ error: "failed" });
    expect(
      await new NewsSummaries(
        async () => new Response("PDF", { headers: { "content-type": "application/pdf" } }),
      ).get(item),
    ).toEqual({ error: "unavailable" });
    vi.useFakeTimers();
    const fetcher = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) =>
          init!.signal!.addEventListener("abort", () => reject(new Error("aborted"))),
        ),
    );
    const pending = new NewsSummaries(fetcher).get(item);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(await pending).toEqual({ error: "failed" });
  });
  it("saves fetched summaries and bookmarks across restart without changing existing descriptions", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "news-summary-"));
    dirs.push(dir);
    const file = path.join(dir, "news.json");
    fs.writeFileSync(
      file,
      JSON.stringify({
        version: 4,
        config: DEFAULT_PAPER_NEWS_CONFIG,
        items: [item],
        saved: [item],
        sources: {},
      }),
    );
    const service = new PaperNewsService(file, async () => htmlResponse(""));
    service.applySummary(item, { summary: text, kind: "description" });
    const restored = new PaperNewsService(file, async () => htmlResponse(""));
    expect(restored.findItem(item.id)).toMatchObject({ summary: text, summaryKind: "description" });
    expect(restored.snapshot().saved[0].summary).toBe(text);
    restored.applySummary(item, { summary: "do not overwrite", kind: "excerpt" });
    expect(restored.findItem(item.id)?.summary).toBe(text);
    const refreshing = new PaperNewsService(file, async () => htmlResponse(`<a href="/articles/1234567">${item.title}</a>`));
    await refreshing.refresh("wallstreetcn");
    expect(refreshing.findItem(item.id)?.summary).toBe(text);
  });
});
