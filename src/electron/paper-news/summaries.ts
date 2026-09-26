import { DOMParser } from "@xmldom/xmldom";
import type { PaperNewsItem } from "../../shared/paper-news";
import type { NewsSummaryResult } from "../../shared/news-summary";
import { isNewsPublisher, publisherArticleUrl } from "../../shared/news-sources";
import { readPaperNewsResponse } from "./service";
import { retryDeadline } from "./request";

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;
const parser = () => new DOMParser({ errorHandler: { warning() {}, error() {}, fatalError() {} } });
const plain = (value: string) =>
  parser()
    .parseFromString(
      `<div>${value.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>|<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, "")}</div>`,
      "text/html",
    )
    .documentElement.textContent?.replace(/\s+/g, " ")
    .trim() || "";
const generic =
  /^(?:华尔街见闻[，,：:]|第一财经[，,：:]|财联社[，,：:])|enable javascript|access denied|just a moment|verify you are human|登录后(?:查看|阅读)|订阅后(?:查看|阅读)/i;

/** Extract public source text only. Do not render HTML or infer a summary from its headline. */
export function extractNewsSummary(html: string, title: string): NewsSummaryResult {
  const clean = (value: string) => {
    const text = plain(value);
    return text.length >= 25 && text !== title.trim() && !generic.test(text)
      ? text.slice(0, 1600)
      : "";
  };
  const metas = new Map<string, string>();
  for (const match of html.matchAll(/<meta\b[^>]{0,16384}>/gi)) {
    const attrs: Record<string, string> = {};
    for (const a of match[0].matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g))
      attrs[a[1].toLowerCase()] = a[2] ?? a[3] ?? a[4];
    metas.set((attrs.property || attrs.name || "").toLowerCase(), attrs.content || "");
  }
  for (const key of ["og:description", "description", "twitter:description"]) {
    const summary = clean(metas.get(key) || "");
    if (summary) return { summary, kind: "description" };
  }
  // A declared paywall may expose a public description, but we do not extract its hidden body.
  if (/"isAccessibleForFree"\s*:\s*(?:false|"false")/i.test(html)) return { error: "blocked" };
  const stripped = html.replace(/<(script|style|nav|footer|aside)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "");
  try {
    const doc = parser().parseFromString(stripped, "text/html");
    const roots = Array.from(doc.getElementsByTagName("*")).filter(
      (el) =>
        el.tagName.toLowerCase() === "article" ||
        /^(?:article[-_]?(?:body|content)|artibody|TRS_Editor|content-text|zoom)$/i.test(
          el.getAttribute("id") || "",
        ) ||
        /(?:^|\s)(?:article-body|article-content|TRS_Editor|rich_media_content)(?:\s|$)/.test(
          el.getAttribute("class") || "",
        ),
    );
    for (const root of roots) {
      const paragraphs = Array.from(root.getElementsByTagName("p"))
        .map((el) => clean(el.textContent || ""))
        .filter((text) => text && !/版权|免责声明|扫码|订阅|subscribe|sign in|log in/i.test(text));
      const summary = paragraphs.slice(0, 3).join(" ").slice(0, 1600);
      if (summary) return { summary, kind: "excerpt" };
    }
  } catch {
    /* Unrecognised markup stays unavailable. */
  }
  return { error: "unavailable" };
}

export class NewsSummaries {
  private pending = new Map<string, Promise<NewsSummaryResult>>();
  private cooldown = new Map<string, { until: number; result: NewsSummaryResult }>();
  constructor(
    private fetcher: Fetcher,
    private now = Date.now,
  ) {}
  get(item: PaperNewsItem | undefined): Promise<NewsSummaryResult> {
    if (!item || !isNewsPublisher(item.source)) return Promise.resolve({ error: "unavailable" });
    if (item.summary.trim())
      return Promise.resolve({ summary: item.summary, kind: item.summaryKind || "description" });
    const url = publisherArticleUrl(item.source, item.url);
    if (!url) return Promise.resolve({ error: "unavailable" });
    const pending = this.pending.get(url);
    if (pending) return pending;
    const host = new URL(url).hostname;
    const cooling = this.cooldown.get(host);
    if (cooling && cooling.until > this.now()) return Promise.resolve(cooling.result);
    if (this.pending.size >= 2) return Promise.resolve({ error: "busy" });
    const request = this.fetch(item, url).finally(() => this.pending.delete(url));
    this.pending.set(url, request);
    return request;
  }
  private async fetch(item: PaperNewsItem, initial: string): Promise<NewsSummaryResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    const host = new URL(initial).hostname;
    let cooldownMs = 1500;
    let result: NewsSummaryResult = { error: "failed" };
    try {
      let url = initial;
      for (let n = 0; n < 4; n++) {
        const response = await this.fetcher(url, {
          signal: controller.signal,
          redirect: "manual",
          credentials: "omit",
          headers: { Accept: "text/html,application/xhtml+xml" },
        });
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          await response.body?.cancel();
          const destination = response.headers.get("location");
          const next =
            destination && isNewsPublisher(item.source)
              ? publisherArticleUrl(item.source, new URL(destination, url).href)
              : undefined;
          if (!next) {
            result = { error: "blocked" };
            break;
          }
          url = next;
          continue;
        }
        if (!response.ok) {
          await response.body?.cancel();
          result = { error: [401, 403, 429].includes(response.status) ? "blocked" : "failed" };
          cooldownMs = Math.max(
            60_000,
            (retryDeadline(response.headers, this.now()) || 0) - this.now(),
          );
          break;
        }
        if (
          !/text\/html|application\/xhtml\+xml/i.test(response.headers.get("content-type") || "")
        ) {
          await response.body?.cancel();
          result = { error: "unavailable" };
          break;
        }
        result = extractNewsSummary(
          await readPaperNewsResponse(response, 2 * 1024 * 1024),
          item.title,
        );
        break;
      }
    } catch {
      result = { error: "failed" };
      cooldownMs = 15_000;
    } finally {
      clearTimeout(timeout);
    }
    // Host-wide backoff avoids hammering a publisher across different cards.
    this.cooldown.set(host, {
      until: this.now() + cooldownMs,
      result: "error" in result ? result : { error: "busy" },
    });
    return result;
  }
}
