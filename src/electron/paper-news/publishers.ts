import { createHash } from "node:crypto";
import { DOMParser } from "@xmldom/xmldom";
import {
  NEWS_PUBLISHERS,
  publisherArticleUrl,
  type NewsPublisher,
} from "../../shared/news-sources";
import type { PaperNewsItem } from "../../shared/paper-news";

const tidy = (value: string | null | undefined, limit = 1600) =>
  (value || "").replace(/\s+/g, " ").trim().slice(0, limit);
const htmlText = (html: string) => {
  const safe = html.replace(
    /<script\b[^>]*>[\s\S]*?<\/script\s*>|<style\b[^>]*>[\s\S]*?<\/style\s*>/gi,
    "",
  );
  return tidy(
    new DOMParser({
      errorHandler: { warning() {}, error() {}, fatalError() {} },
    }).parseFromString(`<div>${safe}</div>`, "text/html").documentElement.textContent,
  );
};
const iso = (value: string) =>
  value && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : "";

/** Restrict HTML extraction to article routes, never navigation, ads or subscription pages. */
const articlePaths: Partial<Record<NewsPublisher, RegExp>> = {
  trendforce: /^\/presscenter\/news\/\d{8}-\d+\.html$/,
  eetimes: /^\/news\/\d+\.html$/,
  yicai: /^\/(?:news|brief)\/\d+\.html$/,
  cls: /^\/detail\/\d+$/,
  wallstreetcn: /^\/articles\/\d+$/,
  pboc: /\/\d{14,}\/index\.html$/,
  nbs: /\/sj\/zxfb[^/]*\/\d{6}\/t\d{8}_\d+\.html$/,
  ndrc: /^\/xwdt\/[^?#]+\/t\d{8}_\d+\.html$/,
  miit: /^\/xwfb\/[^?#]+\/art\/\d{4}\/art_[a-f0-9]+\.html$/,
  csrc: /^\/csrc\/c\d+\/c\d+\/content\.shtml$/,
  huxiu: /^\/article\/\d+\.html$/,
  bcg: /^\/publications\/\d{4}\/[^/]+\/?$/,
};
function articleLink(source: NewsPublisher, raw: string): string | undefined {
  const url = publisherArticleUrl(source, raw);
  return url && (!articlePaths[source] || articlePaths[source]!.test(new URL(url).pathname))
    ? url
    : undefined;
}
function item(
  source: NewsPublisher,
  url: string,
  title: string,
  summary: string,
  date: string,
  author = "",
): PaperNewsItem {
  return {
    id: `${source}:${createHash("sha256").update(url).digest("hex").slice(0, 24)}`,
    source,
    title: tidy(title, 500),
    summary: tidy(summary),
    url,
    date,
    authors: author ? [tidy(author, 120)] : [],
    tags: [],
    matchedTopics: [],
    score: 0,
  };
}
function dateFromArticle(source: NewsPublisher, url: string, anchor: Element): string {
  // These publishers encode the publication date in the article path.
  if (["trendforce", "eetimes", "pboc", "nbs", "ndrc"].includes(source)) {
    const match = new URL(url).pathname.match(/(?:\/|t)((?:19|20)\d{2})(\d{2})(\d{2})/);
    if (match) return iso(`${match[1]}-${match[2]}-${match[3]}T00:00:00+08:00`);
  }
  let container: Element | null = anchor;
  for (
    let depth = 0;
    container && depth < 4;
    depth++,
      container = container.parentNode?.nodeType === 1 ? (container.parentNode as Element) : null
  ) {
    // A date on a neighbouring story must never become this story's publication date.
    const links = Array.from(container.getElementsByTagName("a"))
      .map((a) => articleLink(source, a.getAttribute("href") || ""))
      .filter(Boolean);
    if (new Set(links).size > 1) break;
    const time = container.getElementsByTagName("time")[0];
    const stamp = time?.getAttribute("datetime") || time?.textContent || "";
    if (stamp && iso(stamp)) return iso(stamp);
    const date = container.textContent?.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
    if (date)
      return iso(
        `${date[1]}-${date[2].padStart(2, "0")}-${date[3].padStart(2, "0")}T00:00:00+08:00`,
      );
  }
  // Unknown stays unknown; the fetch time must not masquerade as a publication date.
  return "";
}

export function parsePublisherNews(source: NewsPublisher, raw: string): PaperNewsItem[] {
  const spec = NEWS_PUBLISHERS[source];
  const result = new Map<string, PaperNewsItem>();
  if (spec.format === "rss") {
    if (/<!DOCTYPE|<!ENTITY/i.test(raw)) throw new Error("Invalid feed");
    let invalid = false;
    const doc = new DOMParser({
      errorHandler: {
        warning() {},
        error() {
          invalid = true;
        },
        fatalError() {
          invalid = true;
        },
      },
    }).parseFromString(raw, "application/xml");
    if (invalid || !["rss", "feed", "RDF"].includes(doc.documentElement.localName))
      throw new Error("Invalid feed");
    const rows = [
      ...Array.from(doc.getElementsByTagName("item")),
      ...Array.from(doc.getElementsByTagName("entry")),
    ];
    for (const row of rows.slice(0, 80)) {
      const value = (name: string) => row.getElementsByTagName(name)[0]?.textContent || "";
      const link = Array.from(row.getElementsByTagName("link")).find(
        (n) => !n.getAttribute("rel") || n.getAttribute("rel") === "alternate",
      );
      const url = articleLink(source, link?.getAttribute("href") || link?.textContent || "");
      const title = htmlText(value("title"));
      if (!url || !title) continue;
      result.set(
        url,
        item(
          source,
          url,
          title,
          htmlText(
            value("description") ||
              value("summary") ||
              value("content:encoded") ||
              value("content"),
          ),
          iso(value("pubDate") || value("published") || value("updated") || value("dc:date")),
          value("dc:creator") || value("author"),
        ),
      );
    }
  } else {
    const safe = raw.replace(
      /<script\b[^>]*>[\s\S]*?<\/script\s*>|<style\b[^>]*>[\s\S]*?<\/style\s*>/gi,
      "",
    );
    const doc = new DOMParser({
      errorHandler: { warning() {}, error() {}, fatalError() {} },
    }).parseFromString(safe, "text/html");
    for (const anchor of Array.from(doc.getElementsByTagName("a"))) {
      const url = articleLink(source, anchor.getAttribute("href") || "");
      if (!url) continue;
      const title = tidy(anchor.getAttribute("title") || anchor.textContent, 1800);
      if (title.length < 8 || /^(Learn more|Read more|查看详情|阅读全文|阅读更多)$/i.test(title))
        continue;
      const previous = result.get(url);
      if (previous) {
        if (!previous.summary && title.length > previous.title.length + 35)
          previous.summary = title.slice(0, 1600);
        continue;
      }
      if (title.length > 260) continue;
      result.set(url, item(source, url, title, "", dateFromArticle(source, url, anchor)));
    }
  }
  // A login/challenge page or changed markup is a failure, not a successful empty refresh.
  if (!result.size) throw new Error("Invalid feed: no public articles");
  return [...result.values()].slice(0, 40);
}
