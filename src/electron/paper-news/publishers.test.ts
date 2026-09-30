import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  NEWS_PUBLISHERS,
  NEWS_PUBLISHER_IDS,
  type NewsPublisher,
  publisherArticleUrl,
} from "../../shared/news-sources";
import {
  DEFAULT_PAPER_NEWS_CONFIG,
  PAPER_NEWS_SOURCES,
  paperNewsPrompt,
} from "../../shared/paper-news";
import { parsePublisherNews } from "./publishers";
import { normalizePaperNewsConfig, rankPaperNews } from "./adapters";
import { PaperNewsService, readPaperNewsResponse } from "./service";
const now = Date.parse("2026-09-25T12:00:00Z");
const paths: Partial<Record<NewsPublisher, string>> = {
  eeo: "/2026/0925/123.shtml",
  hackernews: "/item?id=123",
  cnblogs: "https://www.cnblogs.com/example/p/123.html",
  trendforce: "/presscenter/news/20260925-123.html",
  eetimes: "/news/20260925123.html",
  yicai: "/news/123.html",
  cls: "/detail/123",
  wallstreetcn: "/articles/123",
  pboc: "/goutongjiaoliu/20260925123456/index.html",
  nbs: "/sj/zxfb/202609/t20260925_123.html",
  ndrc: "/xwdt/xwfb/202609/t20260925_123.html",
  miit: "/xwfb/bldhd/art/2026/art_abc123.html",
  csrc: "/csrc/c100028/c123/content.shtml",
  huxiu: "/article/123.html",
  bcg: "/publications/2026/research-outlook",
};
function fixture(source: NewsPublisher) {
  const url = new URL(paths[source] || "/public-story", NEWS_PUBLISHERS[source].endpoint).href;
  return NEWS_PUBLISHERS[source].format === "rss"
    ? `<rss><channel><item><title>Public research update</title><link>${url}</link><comments>${url}</comments><description><![CDATA[<p>Summary &amp; context</p>]]></description><pubDate>Fri, 25 Sep 2026 00:00:00 GMT</pubDate></item></channel></rss>`
    : `<html><body><a href="${url}">Public research update</a></body></html>`;
}
const dirs: string[] = [];
const cache = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "publishers-test-"));
  dirs.push(dir);
  return path.join(dir, "news.json");
};
afterEach(() => dirs.splice(0).forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

describe("public publisher adapters", () => {
  it.each([
    '<media:thumbnail url="https://www.engadget.com/img/gallery/story.jpg" />',
    '<media:content url="https://www.engadget.com/img/gallery/story.jpg" />',
    '<enclosure type="image/jpeg" url="https://www.engadget.com/img/gallery/story.jpg" />',
    '<link rel="enclosure" type="image/jpeg" href="https://www.engadget.com/img/gallery/story.jpg" />',
    '<content:encoded><![CDATA[<p>Article</p><img data-src="https://www.engadget.com/img/gallery/story.jpg" />]]></content:encoded>',
  ])("retains per-story RSS media: %s", media => {
    const feed = fixture("engadget").replace("</item>", media + "</item>");
    expect(parsePublisherNews("engadget", feed)[0].imageUrl).toBe("https://www.engadget.com/img/gallery/story.jpg");
  });
  it("keeps MIT article media and excludes unrelated media hosts", () => {
    const image = '<media:content medium="image" url="https://news.mit.edu/sites/default/files/story.jpg"/>';
    const feed = fixture("mitai").replace("</item>", image + "</item>");
    expect(parsePublisherNews("mitai", feed)[0].imageUrl).toBe("https://news.mit.edu/sites/default/files/story.jpg");
    expect(parsePublisherNews("mitai", feed.replace("news.mit.edu/sites/default/files/story.jpg", "evil.test/story.jpg"))[0].imageUrl).toBeUndefined();
  });
  it("associates a sibling thumbnail only with its own article, never an avatar or neighbour", () => {
    const html = `<html><body><div><a href="/article/123.html"><img src="https://img.huxiucdn.com/article/story.jpg" /></a><a href="/article/123.html">Article with its own thumbnail</a></div>
      <div><a href="/article/456.html">A second article without a thumbnail</a><img src="https://img.huxiucdn.com/auth/data/avatar/me.jpg" /></div></body></html>`;
    const rows = parsePublisherNews("huxiu", html);
    expect(rows[0].imageUrl).toBe("https://img.huxiucdn.com/article/story.jpg");
    expect(rows[1].imageUrl).toBeUndefined();
  });
  it.each(NEWS_PUBLISHER_IDS)("extracts an owned article from %s", (source) => {
    const [item] = parsePublisherNews(source, fixture(source));
    expect(item.source).toBe(source);
    expect(item.title).toBe("Public research update");
    expect(item.pdfUrl).toBeUndefined();
    expect(item.id).toMatch(new RegExp(`^${source}:`));
    expect(publisherArticleUrl(source, item.url)).toBe(item.url);
  });
  it("reads Atom entries and treats embedded HTML doctypes as text, while rejecting real DTDs", () => {
    const atom = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Engineering update</title><link rel="alternate" href="https://www.cnblogs.com/demo/p/123"/><author><name>Writer</name><uri>https://www.cnblogs.com/writer/</uri></author><summary>Public summary</summary><published>2026-09-25T00:00:00Z</published></entry></feed>`;
    expect(parsePublisherNews("cnblogs", atom)[0]).toMatchObject({
      summary: "Public summary",
      authors: ["Writer"],
    });
    const raw = fixture("githubblog").replace(
      "<p>Summary",
      '<!DOCTYPE html PUBLIC "example"><p>Summary',
    );
    expect(parsePublisherNews("githubblog", raw)[0].summary).toContain("Summary");
    expect(() =>
      parsePublisherNews("githubblog", '<!DOCTYPE rss SYSTEM "https://evil.example/dtd">' + raw),
    ).toThrow();
  });
  it("uses HN discussion URLs without inventing summaries or admitting external destinations", () => {
    const raw = fixture("hackernews").replace(
      "<link>https://news.ycombinator.com/item?id=123</link>",
      "<link>https://external.example/article</link>",
    );
    expect(parsePublisherNews("hackernews", raw)[0]).toMatchObject({
      url: "https://news.ycombinator.com/item?id=123",
      summary: "",
    });
    expect(() =>
      parsePublisherNews(
        "hackernews",
        raw.replace(
          "<comments>https://news.ycombinator.com/item?id=123</comments>",
          "<comments>https://external.example/article</comments>",
        ),
      ),
    ).toThrow();
    expect(() => parsePublisherNews("hackernews", raw.replace("id=123", "id=invalid"))).toThrow();
  });
  it("extracts Economic Observer dates from article paths", () => {
    expect(parsePublisherNews("eeo", fixture("eeo"))[0].date).toBe("2026-09-24T16:00:00.000Z");
    const raw = fixture("eeo").replace(
      "Public research update",
      "<h5>Public research update</h5><p>Separate introduction</p>",
    );
    expect(parsePublisherNews("eeo", raw)[0]).toMatchObject({
      title: "Public research update",
      summary: "Separate introduction",
    });
  });
  it("rejects challenge pages, external links and XML entities", () => {
    expect(() =>
      parsePublisherNews("qbitai", '<!DOCTYPE x [<!ENTITY y SYSTEM "file:///etc/passwd">]><rss/>'),
    ).toThrow();
    expect(() => parsePublisherNews("yicai", "<html>Please log in</html>")).toThrow();
    expect(() =>
      parsePublisherNews(
        "qbitai",
        fixture("qbitai").replace(
          "https://www.qbitai.com/public-story",
          "https://evil.example/story",
        ),
      ),
    ).toThrow();
    expect(publisherArticleUrl("qbitai", "https://www.qbitai.com.evil.example/a")).toBeUndefined();
    expect(publisherArticleUrl("qbitai", "javascript:alert(1)")).toBeUndefined();
  });
  it("deduplicates article links and leaves absent publication dates unknown", () => {
    const raw = fixture("cls").replace(
      "</body>",
      '<a href="/detail/123?utm_source=test">Public research update</a><a href="/about">About the organization</a></body>',
    );
    const items = parsePublisherNews("cls", raw);
    expect(items).toHaveLength(1);
    expect(items[0].date).toBe("");
    expect(rankPaperNews(items, DEFAULT_PAPER_NEWS_CONFIG, now)).toHaveLength(1);
    expect(Number.isFinite(rankPaperNews(items, DEFAULT_PAPER_NEWS_CONFIG, now)[0].score)).toBe(
      true,
    );
  });
  it("does not borrow the date of a neighbouring article", () => {
    const raw =
      '<html><section><a href="/detail/123">First public research update</a><article><a href="/detail/456">Second public research update</a><time datetime="2026-09-25">Today</time></article></section></html>';
    const items = parsePublisherNews("cls", raw);
    expect(items[0].date).toBe("");
    expect(items[1].date).toBe("2026-09-25T00:00:00.000Z");
  });
  it("migrates existing settings with optional per-publisher interests", () => {
    const { arxiv, huggingface, github } = DEFAULT_PAPER_NEWS_CONFIG;
    const config = normalizePaperNewsConfig({ arxiv, huggingface, github });
    expect(config.arxiv).toEqual(arxiv);
    expect(config.qbitai.topics).toEqual([]);
    expect(
      normalizePaperNewsConfig({ ...config, qbitai: { topics: ["芯片"], days: 90 } }).qbitai,
    ).toEqual({ topics: ["芯片"], days: 90 });
  });
  it("uses article tasks and public content boundaries for news", () => {
    const item = parsePublisherNews("semianalysis", fixture("semianalysis"))[0];
    const prompt = paperNewsPrompt(item, "translate", "zh-CN");
    expect(prompt).toContain(item.url);
    expect(prompt).toContain("Markdown");
    expect(prompt).not.toContain("输出中文 PDF");
  });
  it("decodes declared encodings and enforces the selected response budget", async () => {
    expect(
      await readPaperNewsResponse(
        new Response(new Uint8Array([0xd6, 0xd0, 0xce, 0xc4]), {
          headers: { "content-type": "text/html; charset=gbk" },
        }),
      ),
    ).toBe("中文");
    await expect(readPaperNewsResponse(new Response("12345"), 4)).rejects.toThrow(
      "invalidResponse",
    );
    expect(await readPaperNewsResponse(new Response("12345"), 5)).toBe("12345");
  });
});

describe("publisher refresh integration", () => {
  it("refreshes only the requested category, limits concurrency and retains cache on failure", async () => {
    let running = 0,
      peak = 0,
      fail = false,
      clock = now;
    const tech = NEWS_PUBLISHER_IDS.filter((s) => NEWS_PUBLISHERS[s].category === "technology");
    const fetcher = vi.fn(async (url: string) => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 5));
      running--;
      const source = tech.find((s) => NEWS_PUBLISHERS[s].endpoint === url)!;
      return fail && source === "qbitai"
        ? new Response(null, { status: 429 })
        : new Response(fixture(source));
    });
    const file = cache();
    const service = new PaperNewsService(file, fetcher, () => clock);
    const [first, joined] = await Promise.all([service.refresh(tech), service.refresh(tech)]);
    expect(fetcher).toHaveBeenCalledTimes(5);
    expect(peak).toBe(4);
    expect(first.items).toHaveLength(5);
    expect(joined.items).toHaveLength(5);
    service.setSaved(first.items.find((i) => i.source === "eetimes")!.id, true);
    fail = true;
    clock += 61000;
    const second = await service.refresh(tech);
    expect(second.items).toHaveLength(5);
    expect(second.sources.qbitai.error).toBe("rateLimit");
    expect(second.sources.chinatalk.error).toBeUndefined();
    const restored = new PaperNewsService(file, fetcher, () => clock).snapshot();
    expect(restored.items).toHaveLength(5);
    expect(restored.saved).toHaveLength(1);
    expect(restored.sources.qbitai.nextRetryAt).toBe(second.sources.qbitai.nextRetryAt);
  });
  it("refreshes all registered sources by default and shows publisher results before the batch ends", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const file = cache();
    const fetcher = vi.fn(async (url: string) => {
      if (url.includes("export.arxiv.org")) await gate;
      const publisher = NEWS_PUBLISHER_IDS.find((s) => NEWS_PUBLISHERS[s].endpoint === url);
      return publisher ? new Response(fixture(publisher)) : new Response(null, { status: 403 });
    });
    const service = new PaperNewsService(file, fetcher, () => now);
    const task = service.refresh();
    await vi.waitFor(() => expect(service.snapshot().items.length).toBe(NEWS_PUBLISHER_IDS.length));
    expect(service.snapshot().refreshing).toBe(true);
    release();
    const result = await task;
    expect(fetcher).toHaveBeenCalledTimes(PAPER_NEWS_SOURCES.length);
    expect(result.refreshing).toBe(false);
    const restored = new PaperNewsService(file, fetcher, () => now).snapshot();
    expect(restored.items).toHaveLength(NEWS_PUBLISHER_IDS.length);
    expect(restored.items.find((i) => i.source === "cls")?.date).toBe("");
  });
  it("restores larger multi-source caches without silently dropping their tail", () => {
    const file = cache();
    const template = parsePublisherNews("eeo", fixture("eeo"))[0];
    const items = Array.from({ length: 1250 }, (_, i) => ({
      ...template,
      id: `eeo:${i}`,
      url: `https://www.eeo.com.cn/2026/0925/${i}.shtml`,
    }));
    fs.writeFileSync(
      file,
      JSON.stringify({
        version: 4,
        config: DEFAULT_PAPER_NEWS_CONFIG,
        items,
        sources: {},
        saved: [],
      }),
    );
    const restored = new PaperNewsService(file, fetch, () => now).snapshot();
    expect(restored.items).toHaveLength(1250);
    expect(restored.items.some((i) => i.id === "eeo:1249")).toBe(true);
  });
  it("allows only owned publisher redirects", async () => {
    const fetcher = vi.fn(async (url: string) =>
      url.endsWith("/feed")
        ? new Response(null, { status: 302, headers: { location: "https://evil.example/feed" } })
        : new Response(fixture("qbitai")),
    );
    const service = new PaperNewsService(cache(), fetcher, () => now);
    expect((await service.refresh("qbitai")).sources.qbitai.error).toBe("invalidResponse");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
