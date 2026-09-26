import * as fs from "node:fs/promises";
import * as path from "node:path";
import { createHash } from "node:crypto";
import type { PaperNewsItem, PaperNewsCover } from "../../shared/paper-news";
import { retryDeadline } from "./request";
import { hasNewsImages } from "../../shared/news-images";
import { DOMParser } from "@xmldom/xmldom";

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;
type ImageRenderer = (bytes: Buffer) => Promise<Buffer | null>;
type PdfRenderer = (
  bytes: Buffer,
  signal: AbortSignal,
) => Promise<Buffer | null>;
const HOSTS = new Set([
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
  if (!hasNewsImages(source)) return;
  const url = newsImageUrl(value, base);
  if (!url) return;
  const parsed = new URL(url);
  if (/(?:logo|qrcode|\/avatar\/)/i.test(parsed.pathname)) return;
  const paths: Record<string, [string[], RegExp]> = {
    mitai: [["news.mit.edu"], /^\/sites\/default\/files\//],
    githubblog: [["github.blog"], /^\/wp-content\/uploads\//],
    qbitai: [["www.qbitai.com", "qbitai.com", "i.qbitai.com"], /^\/wp-content\/uploads\/\d{4}\/\d{2}\//],
    eetimes: [["www.eet-china.com"], /^\/d\/file\//],
    huxiu: [["img.huxiucdn.com"], /^\/article\//],
  };
  const [hosts, route] = paths[source];
  return hosts.includes(parsed.hostname) && route.test(parsed.pathname) ? url : undefined;
}
/** Qbit's social metadata is a fixed site icon. Use only images inside its article. */
export function publisherArticleImages(source: string, html: string, base: string): string[] {
  if (source !== "qbitai") return [];
  const safe = html.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>|<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, "");
  const doc = new DOMParser({ errorHandler: { warning() {}, error() {}, fatalError() {} } })
    .parseFromString(safe, "text/html");
  const body = Array.from(doc.getElementsByTagName("div"))
    .find((node) => (node.getAttribute("class") || "").split(/\s+/).includes("article"));
  return [...new Set(Array.from(body?.getElementsByTagName("img") || [])
    .map((img) => publisherImageUrl(source, img.getAttribute("data-src") || img.getAttribute("src"), base))
    .filter((url): url is string => Boolean(url)))].slice(0, 2);
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
    const url = newsImageUrl(candidate, base);
    if (url && !images.includes(url)) images.push(url);
    if (images.length >= 3) break;
  }
  return images;
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
        4,
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
      if (stat.size <= 600_000) {
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
    // Reject redirects rather than allowing publisher pages to redirect to arbitrary hosts.
    const response = await this.fetcher(url, {
      credentials: "omit",
      redirect: "error",
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
        return jpeg && jpeg.length <= 400_000
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
      candidates.push(...newsPageImages(html, page, item.source === "arxiv")
        .filter((url) => validateImage(url)));
      candidates.push(...publisherArticleImages(item.source, html, page));
    } catch {
      /* Paper HTML is not available for every paper. */
    }
    for (const url of [...new Set(candidates)]
      .filter((url) => url !== fromFeed)
      .slice(0, 2)) {
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
        if (jpeg && jpeg.length <= 400_000)
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
