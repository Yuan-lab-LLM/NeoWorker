import { describe, expect, it, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { PaperNewsCovers, boundedCoverBytes, newsImageUrl, newsPageImages, paperNewsCoverKey, publisherImageUrl, publisherArticleImages } from "./covers";
import type { PaperNewsItem } from "../../shared/paper-news";
const item = (suffix = "one"): PaperNewsItem => ({ id: `github:owner/${suffix}`, source: "github", title: suffix, summary: "Test", url: `https://github.com/owner/${suffix}`, date: "2026-09-24", authors: [], tags: [], score: 0, matchedTopics: [] });
const image = vi.fn(async () => Buffer.from("jpeg"));
const pdf = vi.fn(async () => Buffer.from("page"));
async function withCache(run: (dir: string) => Promise<void>) { const dir = await fs.mkdtemp(path.join(os.tmpdir(), "news-cover-test-")); try { await run(dir); } finally { await fs.rm(dir, { recursive: true, force: true }); } }
describe("dynamic news covers", () => {
  it("loads Qbit article images with a publisher origin referer", async () => withCache(async dir => {
    const story = { ...item(), source: "qbitai" as const, url: "https://www.qbitai.com/2026/09/123.html?campaign=example" };
    const photo = "https://i.qbitai.com/wp-content/uploads/2026/09/chip.jpeg";
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === story.url) {
        expect(new Headers(init?.headers).has("Referer")).toBe(false);
        return new Response(`<div class="article"><img src="${photo}" /></div>`);
      }
      const referer = new Headers(init?.headers).get("Referer");
      return referer === "https://www.qbitai.com/"
        ? new Response("image", { headers: { "content-type": "image/jpeg" } })
        : new Response("Forbidden", { status: 403 });
    });
    expect((await new PaperNewsCovers(dir, fetcher, image, pdf).get(story))?.sourceUrl).toBe(photo);
    expect(fetcher).toHaveBeenCalledTimes(2);
  }));
  it("rejects Qbit site icons and extracts only article body images", () => {
    expect(publisherImageUrl("qbitai", "https://www.qbitai.com/wp-content/uploads/imgs/qbitai_icon.png")).toBeUndefined();
    const raw = '<html><body><img src="https://i.qbitai.com/wp-content/uploads/2026/09/other.jpg"><div class="article"><img src="https://i.qbitai.com/wp-content/uploads/2026/09/story.jpg"></div></body></html>';
    expect(publisherArticleImages("qbitai", raw, "https://www.qbitai.com/2026/09/123.html")).toEqual(["https://i.qbitai.com/wp-content/uploads/2026/09/story.jpg"]);
  });
  it("restricts publisher images to their article media paths", () => {
    expect(publisherImageUrl("huxiu", "https://img.huxiucdn.com/article/content/story.jpg")).toBeTruthy();
    expect(publisherImageUrl("huxiu", "https://img.huxiucdn.com/auth/data/avatar/person.jpg")).toBeUndefined();
    expect(publisherImageUrl("githubblog", "https://github.blog/wp-content/uploads/2026/story.png")).toBeTruthy();
    expect(publisherImageUrl("qbitai", "https://github.blog/wp-content/uploads/2026/story.png")).toBeUndefined();
    expect(publisherImageUrl("eetimes", "https://www.eet-china.com/images/logo.png")).toBeUndefined();
    expect(publisherImageUrl("mitai", "https://news.mit.edu.evil.test/sites/default/files/story.jpg")).toBeUndefined();
  });
  it("uses article metadata for publisher covers and never substitutes a site logo", async () => withCache(async dir => {
    const story = { ...item(), source: "githubblog" as const, url: "https://github.blog/engineering/story/" };
    const fetcher = vi.fn(async (url: string) => url === story.url
      ? new Response('<meta property="og:image" content="https://github.blog/wp-content/uploads/2026/story.png">')
      : new Response("image", { headers: { "content-type": "image/png" } }));
    expect((await new PaperNewsCovers(dir, fetcher, image, pdf).get(story))?.kind).toBe("source-image");
    const logo = vi.fn(async () => new Response('<meta property="og:image" content="https://www.eet-china.com/images/logo.png">'));
    expect(await new PaperNewsCovers(dir, logo, image, pdf).get({ ...story, id: "eetimes:missing", source: "eetimes", url: "https://www.eet-china.com/news/123.html" })).toBeNull();
    expect(logo).toHaveBeenCalledTimes(1);
  }));
  it("extracts publisher metadata in either attribute order, decodes entities and rejects tracking images", () => {
    expect(newsPageImages(`<meta content='https://opengraph.githubassets.com/hash/o/repo?a=1&amp;b=2' property='og:image'>`, item().url)).toEqual(["https://opengraph.githubassets.com/hash/o/repo?a=1&b=2"]);
    expect(newsPageImages(`<img class='ltx_graphics' src='figure1.png'><img src='logo.svg' class='ltx_graphics'>`, "https://arxiv.org/html/2609.00001v1/", true)).toEqual(["https://arxiv.org/html/2609.00001v1/figure1.png"]);
    for (const url of ["http://arxiv.org/a.png", "https://arxiv.org.evil.test/a", "https://user:pass@github.com/a", "https://127.0.0.1/a", "file:///tmp/a", "https://github.com:444/a", "https://github.com/badge.svg", "https://unknown.example/image.png"]) expect(newsImageUrl(url)).toBeUndefined();
  });
  it("limits streamed bodies even when content length is missing or forged", async () => {
    await expect(boundedCoverBytes(new Response("123456"), 5)).rejects.toThrow("too large");
    await expect(boundedCoverBytes(new Response("small", { headers: { "content-length": "999" } }), 5)).rejects.toThrow("too large");
    expect((await boundedCoverBytes(new Response("123"), 5)).toString()).toBe("123");
  });
  it("uses per-item previews and reuses cache across concurrent calls and restarts", async () => withCache(async dir => {
    const fetcher = vi.fn(async (url: string) => url.startsWith("https://github.com/")
      ? new Response(`<meta property="og:image" content="https://opengraph.githubassets.com/key/${url.split('/').pop()}.png">`)
      : new Response("image", { headers: { "content-type": "image/png" } }));
    const cache = new PaperNewsCovers(dir, fetcher, image, pdf);
    const [a, same, b] = await Promise.all([cache.get(item()), cache.get(item()), cache.get(item("two"))]);
    expect(a).toEqual(same); expect(a?.sourceUrl).not.toBe(b?.sourceUrl); expect(fetcher).toHaveBeenCalledTimes(4);
    expect(await new PaperNewsCovers(dir, fetcher, image, pdf).get(item())).toEqual(a);
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(paperNewsCoverKey(item())).not.toBe(paperNewsCoverKey({ ...item(), date: "2026-09-25" }));
  }));
  it("uses the HF thumbnail without loading a page or PDF", async () => withCache(async dir => {
    const fetcher = vi.fn(async (_url: string, _init?: RequestInit) => new Response("image", { headers: { "content-type": "image/png" } }));
    const hf = { ...item(), source: "huggingface" as const, id: "huggingface:2609.00001", imageUrl: "https://cdn-thumbnails.huggingface.co/social-thumbnails/papers/2609.00001.png" };
    const result = await new PaperNewsCovers(dir, fetcher, image, pdf).get(hf);
    expect(result?.sourceUrl).toBe(hf.imageUrl); expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][1]).toMatchObject({ credentials: "omit", redirect: "error" });
  }));
  it("falls back to the actual PDF first page when a paper has no HTML figure", async () => withCache(async dir => {
    const fetcher = vi.fn(async (url: string) => new Response(url.includes("/pdf/") ? "%PDF-1.7 fake" : "<html></html>"));
    const render = vi.fn(async () => Buffer.from("page"));
    const paper = { ...item(), source: "arxiv" as const, id: "arxiv:2609.00001", url: "https://arxiv.org/abs/2609.00001v1", pdfUrl: "https://arxiv.org/pdf/2609.00001v1" };
    const result = await new PaperNewsCovers(dir, fetcher, image, render, Date.now, async () => {}).get(paper);
    expect(result?.kind).toBe("pdf-page"); expect(render).toHaveBeenCalledOnce();
    expect(result?.sourceUrl).toBe(paper.pdfUrl);
  }));
  it("caches misses, retries after expiry and never executes redirected HTML as an image", async () => withCache(async dir => {
    let now = 1000;
    const fetcher = vi.fn(async () => new Response("<html>blocked</html>", { status: 403 }));
    const cache = new PaperNewsCovers(dir, fetcher, image, pdf, () => now);
    expect(await cache.get(item())).toBeNull(); expect(await cache.get(item())).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(await cache.get(item("two"))).toBeNull(); expect(fetcher).toHaveBeenCalledTimes(1);
    now += 31 * 60_000;
    expect(await cache.get(item())).toBeNull(); expect(fetcher).toHaveBeenCalledTimes(2);
  }));
  it("rejects non-raster responses and recovers from damaged cache entries", async () => withCache(async dir => {
    const record = item();
    await fs.writeFile(path.join(dir, `${paperNewsCoverKey(record)}.json`), "broken");
    const fetcher = vi.fn(async (url: string) => url.startsWith("https://github.com/") ? new Response('<meta property="og:image" content="https://opengraph.githubassets.com/test">') : new Response("<script>bad</script>", { headers: { "content-type": "text/html" } }));
    const decode = vi.fn(async () => Buffer.from("jpeg"));
    expect(await new PaperNewsCovers(dir, fetcher, decode, pdf).get(record)).toBeNull();
    expect(decode).not.toHaveBeenCalled();
  }));
  it("bounds concurrent network work to two requests", async () => withCache(async dir => {
    let active = 0, peak = 0;
    const fetcher = vi.fn(async () => { active++; peak = Math.max(peak, active); await new Promise(r => setTimeout(r, 5)); active--; return new Response("<html></html>"); });
    const cache = new PaperNewsCovers(dir, fetcher, image, pdf);
    await Promise.all(Array.from({ length: 8 }, (_, i) => cache.get(item(String(i)))));
    expect(peak).toBe(2);
  }));
});
