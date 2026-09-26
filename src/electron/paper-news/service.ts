import type { NewsSummaryKind } from "../../shared/news-summary";
import { isHfHubSource, hfHubUrl } from "../../shared/news-hub";
import { newsSourceEnabled } from "../../shared/news-preferences";
import { NEWS_PUBLISHERS, isNewsPublisher, publisherArticleUrl } from "../../shared/news-sources";
import { PaperNewsRequestError, paperNewsHttpError } from "./request";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  DEFAULT_PAPER_NEWS_CONFIG,
  PAPER_NEWS_SOURCES,
  type PaperNewsItem,
  type PaperNewsSnapshot,
  type PaperNewsSource,
  type PaperNewsSourceState,
} from "../../shared/paper-news";
import {
  normalizePaperNewsConfig,
  paperNewsEndpoint,
  parsePaperNews,
  rankPaperNews,
} from "./adapters";

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;
const emptySources = () =>
  Object.fromEntries(PAPER_NEWS_SOURCES.map((source) => [source, {}])) as Record<
    PaperNewsSource,
    PaperNewsSourceState
  >;
const MAX_BYTES = 3 * 1024 * 1024;

/** Read streams with a bound as Content-Length is not guaranteed or trusted. */
export async function readPaperNewsResponse(
  response: Response,
  maxBytes = MAX_BYTES,
): Promise<string> {
  if (!response.body) throw new Error("invalidResponse");
  const reader = response.body.getReader();
  const charset =
    response.headers.get("content-type")?.match(/charset=["']?([\w-]+)/i)?.[1] || "utf-8";
  const decoder = new TextDecoder(charset);
  let bytes = 0,
    result = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) throw new Error("invalidResponse");
      result += decoder.decode(value, { stream: true });
    }
    return result + decoder.decode();
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

function validCachedItem(item: unknown): item is PaperNewsItem {
  if (!item || typeof item !== "object") return false;
  const i = item as PaperNewsItem;
  if (
    !PAPER_NEWS_SOURCES.includes(i.source) ||
    typeof i.id !== "string" ||
    !i.id.startsWith(`${i.source}:`) ||
    typeof i.title !== "string" ||
    typeof i.summary !== "string" ||
    (i.summaryKind !== undefined && !["description", "excerpt"].includes(i.summaryKind)) ||
    (i.popularity !== undefined &&
      (typeof i.popularity !== "number" || !Number.isFinite(i.popularity) || i.popularity < 0)) ||
    (!Number.isFinite(Date.parse(i.date)) && !(isNewsPublisher(i.source) && i.date === ""))
  )
    return false;
  if (
    ![i.authors, i.tags, i.matchedTopics].every(
      (a) => Array.isArray(a) && a.every((v) => typeof v === "string"),
    )
  )
    return false;
  if (isHfHubSource(i.source)) {
    const id = i.id.slice(i.source.length + 1);
    return (
      typeof i.url === "string" &&
      hfHubUrl(i.source, id) === i.url &&
      !i.pdfUrl &&
      (i.downloads === undefined ||
        (typeof i.downloads === "number" && Number.isFinite(i.downloads) && i.downloads >= 0)) &&
      [i.license, i.hubTask].every((v) => v === undefined || typeof v === "string") &&
      (i.gated === undefined || typeof i.gated === "boolean")
    );
  }
  if (isNewsPublisher(i.source))
    return typeof i.url === "string" && publisherArticleUrl(i.source, i.url) === i.url && !i.pdfUrl;
  const origins = {
    arxiv: "https://arxiv.org/abs/",
    huggingface: "https://huggingface.co/papers/",
    github: "https://github.com/",
  };
  return (
    typeof i.url === "string" &&
    i.url.startsWith(origins[i.source]) &&
    (!i.pdfUrl || /^https:\/\/arxiv\.org\/pdf\/[\w./-]+$/.test(i.pdfUrl))
  );
}

export class PaperNewsService {
  private state: PaperNewsSnapshot = {
    config: structuredClone(DEFAULT_PAPER_NEWS_CONFIG),
    items: [],
    saved: [],
    sources: emptySources(),
    refreshing: false,
  };
  private inflight?: Promise<PaperNewsSnapshot>;
  constructor(
    private readonly file: string,
    private readonly fetcher: Fetcher,
    private readonly now: () => number = Date.now,
    private readonly sleep: (ms: number) => Promise<void> = (ms) =>
      new Promise((resolve) => setTimeout(resolve, ms)),
  ) {
    try {
      if (fs.statSync(file).size > 12 * 1024 * 1024) return;
      const cached = JSON.parse(fs.readFileSync(file, "utf8"));
      if (![1, 2, 3, 4].includes(cached.version)) return;
      this.state.config = normalizePaperNewsConfig(cached.config);
      this.state.items = Array.isArray(cached.items)
        ? cached.items.filter(validCachedItem).slice(0, PAPER_NEWS_SOURCES.length * 100)
        : [];
      this.state.saved = Array.isArray(cached.saved)
        ? cached.saved.filter(validCachedItem).slice(0, 200)
        : [];
      for (const source of PAPER_NEWS_SOURCES) {
        const s = cached.sources?.[source];
        if (s && Number.isFinite(Date.parse(s.updatedAt)))
          this.state.sources[source].updatedAt = s.updatedAt;
        if (s && Number.isFinite(Date.parse(s.attemptedAt)))
          this.state.sources[source].attemptedAt = s.attemptedAt;
        if (s && Number.isFinite(Date.parse(s.nextRetryAt)))
          this.state.sources[source].nextRetryAt = s.nextRetryAt;
        if (s && Number.isInteger(s.httpStatus) && s.httpStatus >= 100 && s.httpStatus <= 599)
          this.state.sources[source].httpStatus = s.httpStatus;
        if (
          ["network", "rateLimit", "accessDenied", "unavailable", "invalidResponse"].includes(
            s?.error,
          )
        )
          this.state.sources[source].error = s.error;
      }
    } catch {
      /* A missing or damaged cache must not prevent opening the app. */
    }
  }
  snapshot(): PaperNewsSnapshot {
    return structuredClone({
      ...this.state,
      items: rankPaperNews(this.state.items, this.state.config, this.now()),
      saved: rankPaperNews(this.state.saved, this.state.config, this.now(), true),
      refreshing: Boolean(this.inflight),
    });
  }
  private persist(): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const temporary = `${this.file}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify({ ...this.state, version: 4, refreshing: false }), {
      mode: 0o600,
    });
    fs.renameSync(temporary, this.file);
  }
  saveConfig(input: unknown): PaperNewsSnapshot {
    if (this.inflight) throw new Error("Refresh in progress");
    const config = normalizePaperNewsConfig(input);
    if (JSON.stringify(config) !== JSON.stringify(this.state.config)) {
      const changed = PAPER_NEWS_SOURCES.filter(
        (source) => JSON.stringify(config[source]) !== JSON.stringify(this.state.config[source]),
      );
      const sources = structuredClone(this.state.sources);
      for (const source of changed) {
        const prior = this.state.sources[source];
        // Changing a query cannot bypass the source's persisted cooldown.
        sources[source] =
          prior.nextRetryAt && Date.parse(prior.nextRetryAt) > this.now()
            ? {
                attemptedAt: prior.attemptedAt,
                nextRetryAt: prior.nextRetryAt,
                error: prior.error,
                httpStatus: prior.httpStatus,
              }
            : {};
      }
      this.state = {
        ...this.state,
        config,
        // Hierarchical preferences re-rank cached results immediately; keep them during refresh/cooldown.
        items: config.preferences
          ? this.state.items
          : this.state.items.filter((item) => !changed.includes(item.source)),
        sources,
      };
      this.persist();
    }
    return this.snapshot();
  }
  findItem(id: unknown): PaperNewsItem | undefined {
    if (typeof id !== "string" || id.length > 240) return undefined;
    const item = [...this.state.items, ...this.state.saved].find((item) => item.id === id);
    return item ? structuredClone(item) : undefined;
  }
  applySummary(original: PaperNewsItem, result: { summary: string; kind: NewsSummaryKind }): void {
    const merge = (item: PaperNewsItem) => item.id === original.id && item.url === original.url &&
      item.title === original.title && !item.summary.trim()
      ? { ...item, summary: result.summary, summaryKind: result.kind } : item;
    this.state.items = this.state.items.map(merge);
    this.state.saved = this.state.saved.map(merge);
    this.persist();
  }
  setSaved(id: unknown, saved: unknown): PaperNewsSnapshot {
    if (typeof id !== "string" || typeof saved !== "boolean") throw new Error("Invalid bookmark");
    const item = [...this.state.items, ...this.state.saved].find((i) => i.id === id);
    if (!item) throw new Error("Item unavailable");
    if (saved && !this.state.saved.some((i) => i.id === id) && this.state.saved.length >= 200)
      throw new Error("Bookmark limit reached");
    this.state.saved = this.state.saved.filter((i) => i.id !== id);
    if (saved) this.state.saved.unshift(item);
    this.persist();
    return this.snapshot();
  }
  refresh(source?: PaperNewsSource | PaperNewsSource[]): Promise<PaperNewsSnapshot> {
    if (
      source !== undefined &&
      (!Array.isArray(source)
        ? !PAPER_NEWS_SOURCES.includes(source)
        : source.length > PAPER_NEWS_SOURCES.length ||
          source.some((s) => !PAPER_NEWS_SOURCES.includes(s)))
    )
      throw new Error("Invalid paper news source");
    if (this.inflight) return this.inflight;
    // One shared refresh; each source also enforces its persisted cooldown.
    this.inflight = this.runRefresh(source).then(
      () => {
        this.inflight = undefined;
        return this.snapshot();
      },
      (error) => {
        this.inflight = undefined;
        throw error;
      },
    );
    return this.inflight;
  }
  private async requestSource(source: PaperNewsSource): Promise<PaperNewsItem[]> {
    for (let attempt = 0; ; attempt++) {
      try {
        let url = paperNewsEndpoint(source, this.state.config, this.now());
        const signal = AbortSignal.timeout(25_000);
        let response: Response;
        for (let hop = 0; ; hop++) {
          response = await this.fetcher(url, {
            method: "GET",
            credentials: "omit",
            redirect: "manual",
            signal,
            headers: {
              "User-Agent": "NeoWorker-News/0.2 (+https://github.com/Yuan-lab-LLM/NeoWorker)",
              Accept: isNewsPublisher(source)
                ? "application/rss+xml, application/xml, text/html"
                : source === "arxiv"
                  ? "application/atom+xml"
                  : "application/json",
            },
          });
          if (![301, 302, 303, 307, 308].includes(response.status)) break;
          const location = response.headers.get("location");
          await response.body?.cancel().catch(() => {});
          const next =
            location && isNewsPublisher(source)
              ? publisherArticleUrl(source, new URL(location, url).href)
              : undefined;
          if (!next || hop >= 3) throw new PaperNewsRequestError("invalidResponse");
          url = next;
        }
        if (!response.ok) {
          const error = paperNewsHttpError(response, source, this.now());
          await response.body?.cancel().catch(() => {});
          throw error;
        }
        const raw = await readPaperNewsResponse(
          response,
          isNewsPublisher(source)
            ? (NEWS_PUBLISHERS[source].format === "rss" ? 16 : 4) * 1024 * 1024
            : MAX_BYTES,
        );
        try {
          return rankPaperNews(parsePaperNews(source, raw), this.state.config, this.now());
        } catch {
          throw new PaperNewsRequestError("invalidResponse");
        }
      } catch (error) {
        const typed = error instanceof PaperNewsRequestError;
        const message = error instanceof Error ? error.message : "";
        const retryable = typed
          ? error.code === "unavailable" && !error.retryAt
          : /ERR_CONNECTION_(?:CLOSED|RESET)|ECONNRESET|Response aborted|fetch failed/i.test(
              message,
            ) &&
            !/CERT|SSL|AUTH|DENIED|PROXY|TUNNEL|PAC/i.test(
              message + String((error as { cause?: { code?: string } })?.cause?.code || ""),
            );
        // At most one same-route retry for a transient failure. Never retry a denial or quota response here.
        if (attempt === 0 && retryable) {
          await this.sleep(3_100);
          continue;
        }
        if (typed) throw error;
        throw new PaperNewsRequestError(
          message === "invalidResponse" ? "invalidResponse" : "network",
        );
      }
    }
  }
  private async runRefresh(
    onlySource?: PaperNewsSource | PaperNewsSource[],
  ): Promise<PaperNewsSnapshot> {
    const due = PAPER_NEWS_SOURCES.filter((source) => {
      if (
        onlySource &&
        !(Array.isArray(onlySource) ? onlySource.includes(source) : source === onlySource)
      )
        return false;
      if (!newsSourceEnabled(this.state.config, source)) return false;
      const deadline = this.state.sources[source].nextRetryAt;
      return !deadline || Date.parse(deadline) <= this.now();
    });
    const previousStates = structuredClone(this.state.sources);
    const attemptedAt = new Date(this.now()).toISOString();
    for (const source of due) {
      this.state.sources[source] = {
        ...previousStates[source],
        attemptedAt,
        nextRetryAt: new Date(this.now() + 60_000).toISOString(),
      };
    }
    // Persist all throttles before starting requests. A disk failure must not
    // leave requests running after the shared refresh promise has rejected.
    if (due.length) this.persist();
    const queue = [...due];
    await Promise.all(
      Array.from({ length: Math.min(4, due.length) }, async () => {
        for (let source = queue.shift(); source; source = queue.shift()) {
          const previous = previousStates[source];
          try {
            const fetched = await this.requestSource(source);
            const previousItems = new Map([...this.state.saved, ...this.state.items].map((item) => [item.id, item]));
            const items = fetched.map((item) => {
              const previousItem = previousItems.get(item.id);
              return !item.summary.trim() && previousItem?.summaryKind && previousItem.title === item.title && previousItem.url === item.url
                ? { ...item, summary: previousItem.summary, summaryKind: previousItem.summaryKind } : item;
            });
            this.state.items = [...this.state.items.filter((i) => i.source !== source), ...items];
            this.state.sources[source] = {
              attemptedAt,
              updatedAt: new Date(this.now()).toISOString(),
              nextRetryAt: new Date(this.now() + 60_000).toISOString(),
            };
          } catch (error) {
            const failure =
              error instanceof PaperNewsRequestError ? error : new PaperNewsRequestError("network");
            const delay =
              failure.code === "rateLimit"
                ? 5 * 60_000
                : failure.code === "accessDenied" || failure.code === "invalidResponse"
                  ? 30 * 60_000
                  : 60_000;
            this.state.sources[source] = {
              ...previous,
              attemptedAt,
              error: failure.code,
              httpStatus: failure.httpStatus,
              nextRetryAt: new Date(
                Math.max(this.now() + delay, failure.retryAt || 0),
              ).toISOString(),
            };
          }
        }
      }),
    );
    if (due.length) this.persist();
    return this.snapshot();
  }
}
