import * as fs from "node:fs/promises";
import * as path from "node:path";
import { createHash } from "node:crypto";
import type { PaperNewsItem, PaperNewsCover } from "../../shared/paper-news";
import { retryDeadline } from "./request";
import { hasNewsImages, NEWS_PUBLISHER_IMAGE_HOSTS } from "../../shared/news-images";
import { isNewsPublisher } from "../../shared/news-sources";
import { DOMParser } from "@xmldom/xmldom";

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;
type ImageRenderer = (bytes: Buffer) => Promise<Buffer | null>;
type PdfRenderer = (
  bytes: Buffer,
  signal: AbortSignal,
) => Promise<Buffer | null>;
const HOSTS = new Set([
  ...Object.values(NEWS_PUBLISHER_IMAGE_HOSTS).flat(),
  "arxiv.org",
  "export.arxiv.org",
  "huggingface.co",
  "cdn-thumbnails.huggingface.co",
  "cdn-uploads.huggingface.co",
  "github.com",
  "raw.githubusercontent.com",
  "repository-images.githubusercontent.com",
  "opengraph.githubassets.com",
  "user-images.githubusercontent.com",
  "camo.githubusercontent.com",
  "news.mit.edu",
  "github.blog",
  "www.qbitai.com",
  "qbitai.com",
  "i.qbitai.com",
  "www.eet-china.com",
  "www.huxiu.com",
  "img.huxiucdn.com",
]);
const DAY = 86_400_000;
const MAX_CACHE_FILES = 300;

/** Only publisher/CDN URLs, never arbitrary pages or local network URLs. */
export function newsImageUrl(
  value: unknown,
  base?: string,
): string | undefined {
  if (typeof value !== "string" || value.length > 2048) return undefined;
  try {
    const url = new URL(value, base);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      !HOSTS.has(url.hostname)
    )
      return undefined;
    if (
      /\.(?:svg|gif)(?:$|\?)/i.test(url.href) ||
      /(?:badge|shield|favicon|huggingface_logo|arxiv-logo)/i.test(url.href)
    )
      return undefined;
    url.hash = "";
    return url.href;
  } catch {
    return undefined;
  }
}
/** Validate article media separately from page URLs, excluding publisher UI assets. */
export function publisherImageUrl(source: string, value: unknown, base?: string): string | undefined {
  if (!isNewsPublisher(source)) return;
  const url = metadataImageUrl(value, base);
  if (!url) return;
  const parsed = new URL(url);
  if (/(?:logo|qrcode|\/avatars?\/|placeholder|default[-_]?(?:social|image)|tracking[-_]?pixel)/i.test(parsed.pathname)) return;
  if (!NEWS_PUBLISHER_IMAGE_HOSTS[source].includes(parsed.hostname)) return;
  const paths: Record<string, [string[], RegExp]> = {
    mitai: [["news.mit.edu"], /^\/sites\/default\/files\//],
    githubblog: [["github.blog"], /^\/wp-content\/uploads\//],
    qbitai: [["www.qbitai.com", "qbitai.com", "i.qbitai.com"], /^\/wp-content\/uploads\/\d{4}\/\d{2}\//],
    eetimes: [["www.eet-china.com"], /^\/d\/file\//],
    huxiu: [["img.huxiucdn.com"], /^\/article\//],
  };
  const restriction = paths[source];
  return !restriction || (restriction[0].includes(parsed.hostname) && restriction[1].test(parsed.pathname)) ? url : undefined;
}
/** Legacy feeds sometimes advertise HTTP media; fetch the same maintained CDN over HTTPS. */
function metadataImageUrl(value: unknown, base?: string): string | undefined {
  if (typeof value !== "string" || !value.trim() || value.length > 2048) return;
  try {
    const url = new URL(decode(value), base);
    if (url.protocol === "http:") url.protocol = "https:";
    return newsImageUrl(url.href);
  } catch { return; }
}

/** Extract only this article's body, excluding neighbouring stories and page chrome. */
export function publisherArticleImages(source: string, html: string, base: string): string[] {
  if (!isNewsPublisher(source)) return [];
  const safe = html.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>|<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, "");
  const doc = new DOMParser({ errorHandler: { warning() {}, error() {}, fatalError() {} } })
    .parseFromString(safe, "text/html");
  const body = doc.getElementsByTagName("article")[0] ||
    Array.from(doc.getElementsByTagName("div")).find(node =>
      /(?:^|\s)(?:article|article-body|article-content|entry-content|post-content|story-body|story-photo)(?:\s|$)/i.test(
        `${node.getAttribute("class") || ""} ${node.getAttribute("id") || ""}`));
  return [...new Set(Array.from(body?.getElementsByTagName("img") || [])
    .filter(img => {
      let parent = img.parentNode as Element | null;
      while (parent && parent !== body) {
        if (/related|recommend|sidebar|author|advert|promo/i.test(`${parent.getAttribute?.("class") || ""} ${parent.getAttribute?.("id") || ""}`)) return false;
        parent = parent.parentNode as Element | null;
      }
      return !["width", "height"].some(attr => Number(img.getAttribute(attr)) > 0 && Number(img.getAttribute(attr)) < 80);
    })
    .map((img) => publisherImageFromElement(source, img, base))
    .filter((url): url is string => Boolean(url)))].slice(0, 4);
}

export function publisherImageFromElement(source: string, img: Element, base: string): string | undefined {
  const set = img.getAttribute("data-srcset") || img.getAttribute("srcset") || "";
  const responsive = set.split(/,\s+/).slice(0, 12).map(entry => entry.trim().split(/\s+/))
    .sort((a, b) => (parseFloat(b[1]) || 0) - (parseFloat(a[1]) || 0)).map(entry => entry[0]);
  return [img.getAttribute("data-src"), img.getAttribute("data-original"), ...responsive, img.getAttribute("src")]
    .map(value => publisherImageUrl(source, value, base)).find(Boolean);
}

/** An RSS item's HTML is already scoped to one story, unlike a publisher landing page. */
export function publisherFeedImages(source: string, html: string, base: string): string[] {
  return publisherArticleImages(source, `<article>${html}</article>`, base);
}
function decode(value: string): string {
  return value.replace(
    /&(?:amp|quot|apos|lt|gt|#\d+|#x[\da-f]+);/gi,
    (entity) => {
      const named: Record<string, string> = {
        "&amp;": "&",
        "&quot;": '"',
        "&apos;": "'",
        "&lt;": "<",
        "&gt;": ">",
      };
      if (named[entity.toLowerCase()]) return named[entity.toLowerCase()];
      const hex = /^&#x/i.test(entity);
      const n = parseInt(entity.slice(hex ? 3 : 2, -1), hex ? 16 : 10);
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : "";
    },
  );
}
/** Inspect attributes only; remote HTML is never executed or displayed. */
export function newsPageImages(
  html: string,
  base: string,
  figuresOnly = false,
): string[] {
  const images: string[] = [];
  for (const match of html.matchAll(/<(meta|img)\b[^>]{0,8192}>/gi)) {
    const attrs: Record<string, string> = {};
    for (const a of match[0].matchAll(
      /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g,
    ))
      attrs[a[1].toLowerCase()] = decode(a[2] ?? a[3] ?? a[4]);
    const meta = match[1].toLowerCase() === "meta";
    const candidate =
      meta &&
      !figuresOnly &&
      /^(og:image(?::secure_url)?|twitter:image(?::src)?)$/i.test(
        attrs.property || attrs.name || "",
      )
        ? attrs.content
        : !meta && figuresOnly && /\bltx_graphics\b/.test(attrs.class || "")
          ? attrs.src
          : undefined;
    const url = metadataImageUrl(candidate, base);
    if (url && !images.includes(url)) images.push(url);
    if (images.length >= 3) break;
  }
  return images;
}

/** Read article/primary-image structured data, never organization logos or related-item images. */
export function newsStructuredImages(html: string, base: string): string[] {
  const images: string[] = [];
  const add = (value: unknown): void => {
    if (Array.isArray(value)) { value.slice(0, 8).forEach(add); return; }
    if (value && typeof value === "object") {
      const image = value as Record<string, unknown>;
      add(image.contentUrl || image.url);
      return;
    }
    const url = metadataImageUrl(value, base);
    if (url && !images.includes(url)) images.push(url);
  };
  const visit = (value: unknown, depth = 0): void => {
    if (depth > 5) return;
    if (Array.isArray(value)) { value.slice(0, 30).forEach(v => visit(v, depth + 1)); return; }
    if (!value || typeof value !== "object") return;
    const node = value as Record<string, unknown>;
    const types = Array.isArray(node["@type"]) ? node["@type"] : [node["@type"]];
    if (types.some(type => /^(?:NewsArticle|Article|BlogPosting|ScholarlyArticle|TechArticle|ReportageNewsArticle)$/.test(String(type)))) add(node.image);
    if (types.includes("WebPage")) add(node.primaryImageOfPage);
    visit(node["@graph"], depth + 1);
    visit(node.mainEntity, depth + 1);
  };
  for (const match of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi)) {
    try { visit(JSON.parse(match[1])); } catch { /* Malformed optional metadata is ignored. */ }
  }
  return images.slice(0, 4);
}
export async function boundedCoverBytes(
  response: Response,
  limit: number,
): Promise<Buffer> {
  if (!response.body) throw new Error("empty response");
  const reader = response.body.getReader();
  try {
    if (Number(response.headers.get("content-length")) > limit)
      throw new Error("response too large");
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new Error("response too large");
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
export function paperNewsCoverKey(item: PaperNewsItem): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        6,
        item.id,
        item.url,
        item.pdfUrl,
        item.imageUrl,
        item.date,
        item.title,
      ]),
    )
    .digest("hex");
}
interface CacheEntry {
  expires: number;
  cover: PaperNewsCover | null;
}

/** Lazy, bounded, restart-persistent cache. Two downloads at most; in-flight requests coalesce. */
export class PaperNewsCovers {
  private inflight = new Map<string, Promise<PaperNewsCover | null>>();
  private active = 0;
  private queue: Array<() => void> = [];
  private cooldown = new Map<string, number>();
  private nextArxiv = 0;
  private pruning?: Promise<void>;
  constructor(
    private directory: string,
    private fetcher: Fetcher,
    private image: ImageRenderer,
    private pdf: PdfRenderer,
    private now: () => number = Date.now,
    private sleep: (ms: number) => Promise<void> = (ms) =>
      new Promise((resolve) => setTimeout(resolve, ms)),
  ) {}
  get(item: PaperNewsItem): Promise<PaperNewsCover | null> {
    const key = paperNewsCoverKey(item);
    const existing = this.inflight.get(key);
    if (existing) return existing;
    // The UI only requests visible items. Bound queued work even if callers misbehave.
    if (this.inflight.size >= 24) return Promise.resolve(null);
    const task = this.load(key, item)
      .catch(() => null)
      .finally(() => this.inflight.delete(key));
    this.inflight.set(key, task);
    return task;
  }
  private async load(
    key: string,
    item: PaperNewsItem,
  ): Promise<PaperNewsCover | null> {
    const file = path.join(this.directory, `${key}.json`);
    try {
      const stat = await fs.stat(file);
      if (stat.size <= 1_700_000) {
        const cached = JSON.parse(
          await fs.readFile(file, "utf8"),
        ) as CacheEntry;
        if (
          cached.expires > this.now() &&
          (cached.cover === null ||
            (/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(
              cached.cover?.dataUrl || "",
            ) &&
              ["source-image", "pdf-page"].includes(cached.cover.kind) &&
              newsImageUrl(cached.cover.sourceUrl)))
        )
          return cached.cover;
      }
    } catch {
      /* Cache misses and corrupt entries recover independently of the feed. */
    }
    if (this.active >= 2)
      await new Promise<void>((resolve) => this.queue.push(resolve));
    else this.active++;
    let cover: PaperNewsCover | null = null;
    try {
      cover = await this.resolve(item);
      await fs.mkdir(this.directory, { recursive: true });
      const temporary = `${file}.tmp`;
      await fs.writeFile(
        temporary,
        JSON.stringify({
          expires: this.now() + (cover ? 7 * DAY : 30 * 60_000),
          cover,
        }),
        { mode: 0o600 },
      );
      await fs.rename(temporary, file);
      this.pruning ??= this.prune()
        .catch(() => {})
        .finally(() => {
          this.pruning = undefined;
        });
    } catch {
      /* A failed cover must never hide content or prevent reading. */
    } finally {
      const next = this.queue.shift();
      if (next) next();
      else this.active--;
    }
    return cover;
  }
  private async prune(): Promise<void> {
    const files = (await fs.readdir(this.directory)).filter((n) =>
      /^[a-f0-9]{64}\.json$/.test(n),
    );
    if (files.length <= MAX_CACHE_FILES) return;
    const entries = await Promise.all(
      files.map(async (name) => ({
        name,
        time: (await fs.stat(path.join(this.directory, name))).mtimeMs,
      })),
    );
    entries.sort((a, b) => b.time - a.time);
    await Promise.all(
      entries
        .slice(MAX_CACHE_FILES)
        .map((e) =>
          fs.unlink(path.join(this.directory, e.name)).catch(() => {}),
        ),
    );
  }
  private async request(
    url: string,
    limit: number,
    kind: "image" | "html" | "pdf",
    signal: AbortSignal,
    sourcePage?: string,
  ): Promise<Buffer> {
    if (!newsImageUrl(url)) throw new Error("unsupported source");
    const host = new URL(url).hostname;
    if ((this.cooldown.get(host) || 0) > this.now())
      throw new Error("cooldown");
    if (host.endsWith("arxiv.org")) {
      const delay = Math.max(0, this.nextArxiv - this.now());
      this.nextArxiv = Math.max(this.now(), this.nextArxiv) + 3100;
      if (delay) await this.sleep(delay);
    }
    // Inspect every redirect before requesting it; never follow a page to an arbitrary host.
    let response: Response;
    const originalHost = host;
    for (let hop = 0; ; hop++) {
      response = await this.fetcher(url, {
        credentials: "omit",
        redirect: "manual",
        signal,
        headers: {
          // Publisher CDNs may reject images without their public article origin.
          // Send only the validated origin, never article paths or query strings.
          ...(kind === "image" && sourcePage && newsImageUrl(sourcePage)
            ? { Referer: `${new URL(sourcePage).origin}/` }
            : {}),
          Accept:
            kind === "image"
              ? "image/png,image/jpeg,image/webp"
              : kind === "pdf"
                ? "application/pdf"
                : "text/html",
          "User-Agent":
            "NeoWorker-NewsFeed/0.2 (+https://github.com/Yuan-lab-LLM/NeoWorker)",
        },
      });
      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      const location = response.headers.get("location");
      await response.body?.cancel().catch(() => {});
      const next = location && newsImageUrl(location, url);
      if (!next || hop >= 3) throw new Error("unsupported redirect");
      const nextHost = new URL(next).hostname;
      const publisherHosts = Object.values(NEWS_PUBLISHER_IMAGE_HOSTS).find(hosts => hosts.includes(originalHost));
      if (nextHost !== originalHost && !publisherHosts?.includes(nextHost)) throw new Error("unsupported redirect host");
      url = next;
    }
    if (!response.ok) {
      if ([401, 403, 429, 503].includes(response.status))
        this.cooldown.set(
          host,
          Math.max(
            this.now() + 5 * 60_000,
            retryDeadline(response.headers, this.now()) || 0,
          ),
        );
      await response.body?.cancel().catch(() => {});
      throw new Error("source unavailable");
    }
    const type = response.headers.get("content-type") || "";
    if (kind === "image" && !/^image\/(png|jpeg|webp)(?:;|$)/i.test(type)) {
      await response.body?.cancel().catch(() => {});
      throw new Error("unsupported image");
    }
    const bytes = await boundedCoverBytes(response, limit);
    if (kind === "pdf" && !bytes.subarray(0, 5).equals(Buffer.from("%PDF-")))
      throw new Error("invalid PDF");
    return bytes;
  }
  private async resolve(item: PaperNewsItem): Promise<PaperNewsCover | null> {
    const signal = AbortSignal.timeout(35_000);
    const candidates: string[] = [];
    const validateImage = (value: unknown) => hasNewsImages(item.source)
      ? publisherImageUrl(item.source, value, item.url)
      : newsImageUrl(value);
    const fromFeed = validateImage(item.imageUrl);
    if (fromFeed) candidates.push(fromFeed);
    // Source URLs are derived from a cached, validated feed item at the IPC boundary.
    const paperId = item.pdfUrl?.match(
      /^https:\/\/arxiv\.org\/pdf\/([\w./-]+)$/,
    )?.[1];
    const page =
      item.source === "arxiv" && paperId
        ? `https://arxiv.org/html/${paperId}`
        : item.url;
    const tryImage = async (url: string): Promise<PaperNewsCover | null> => {
      try {
        const jpeg = await this.image(
          await this.request(url, 4 * 1024 * 1024, "image", signal, item.url),
        );
        return jpeg && jpeg.length <= 1_200_000
          ? {
              dataUrl: `data:image/jpeg;base64,${jpeg.toString("base64")}`,
              kind: "source-image",
              sourceUrl: url,
            }
          : null;
      } catch {
        return null;
      }
    };
    if (fromFeed) {
      const cover = await tryImage(fromFeed);
      if (cover) return cover;
    }
    try {
      const html = (
        await this.request(page, 2 * 1024 * 1024, "html", signal)
      ).toString("utf8");
      candidates.push(...newsStructuredImages(html, page).filter(url => validateImage(url)));
      candidates.push(...newsPageImages(html, page, item.source === "arxiv")
        .filter((url) => validateImage(url)));
      candidates.push(...publisherArticleImages(item.source, html, page));
    } catch {
      /* Paper HTML is not available for every paper. */
    }
    for (const url of [...new Set(candidates)]
      .filter((url) => url !== fromFeed)
      .slice(0, 4)) {
      const cover = await tryImage(url);
      if (cover) return cover;
    }
    if (paperId && item.pdfUrl) {
      try {
        const bytes = await this.request(
          item.pdfUrl,
          12 * 1024 * 1024,
          "pdf",
          signal,
        );
        const png = await this.pdf(bytes, signal);
        const jpeg = png && (await this.image(png));
        if (jpeg && jpeg.length <= 1_200_000)
          return {
            dataUrl: `data:image/jpeg;base64,${jpeg.toString("base64")}`,
            kind: "pdf-page",
            sourceUrl: item.pdfUrl,
          };
      } catch {
        /* Oversized, unavailable, or unrenderable PDFs use the text cover. */
      }
    }
    return null;
  }
}
