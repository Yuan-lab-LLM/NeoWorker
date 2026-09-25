import { describe, it, expect, vi, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  DEFAULT_PAPER_NEWS_CONFIG,
  PAPER_NEWS_SOURCES,
  paperNewsNeedsRefresh,
  type PaperNewsItem,
} from "../../shared/paper-news";
import {
  getNewsPreferences,
  effectiveNewsSettings,
  newsDefaultSort,
} from "../../shared/news-preferences";
import { normalizePaperNewsConfig, paperNewsEndpoint, rankPaperNews } from "./adapters";
import { PaperNewsService } from "./service";
const now = Date.parse("2026-09-25T12:00:00Z");
const base = () => structuredClone(DEFAULT_PAPER_NEWS_CONFIG);
const dirs: string[] = [];
const file = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "news-preferences-"));
  dirs.push(d);
  return path.join(d, "news.json");
};
afterEach(() => dirs.splice(0).forEach((d) => fs.rmSync(d, { recursive: true, force: true })));
const article: PaperNewsItem = {
  id: "qbitai:test",
  source: "qbitai",
  title: "AI research",
  summary: "chips",
  url: "https://www.qbitai.com/2026/09/123.html",
  date: new Date(now).toISOString(),
  authors: [],
  tags: [],
  matchedTopics: [],
  score: 0,
};
describe("news preference inheritance", () => {
  it("migrates non-default choices as source overrides without changing effective settings", () => {
    const config = base();
    config.arxiv.topics = ["robotics"];
    config.qbitai.days = 7;
    config.github.language = "Python";
    config.github.minStars = 500;
    const preferences = getNewsPreferences(config);
    expect(preferences.sources.arxiv?.topics).toEqual(["robotics"]);
    expect(preferences.sources.qbitai?.days).toBe(7);
    expect(preferences.sources.yicai).toBeUndefined();
    const migrated = normalizePaperNewsConfig({ ...config, preferences });
    for (const source of PAPER_NEWS_SOURCES) expect(migrated[source]).toEqual(config[source]);
  });
  it("resolves source fields independently above category and general defaults", () => {
    const p = getNewsPreferences(base());
    p.general.days = 90;
    p.categories.technology.topics = ["AI"];
    p.sources.qbitai = { topics: ["chips"], days: 7 };
    expect(effectiveNewsSettings(p, "qbitai")).toEqual({ topics: ["chips"], days: 7 });
    expect(effectiveNewsSettings(p, "semianalysis")).toEqual({ topics: ["AI"], days: 90 });
    p.categories.technology.days = 30;
    delete p.sources.qbitai.days;
    expect(effectiveNewsSettings(p, "qbitai")).toEqual({ topics: ["chips"], days: 30 });
    delete p.sources.qbitai;
    expect(effectiveNewsSettings(p, "qbitai")).toEqual({ topics: ["AI"], days: 30 });
  });
  it("keeps category interests separate and derives sorting from category/general", () => {
    const config = base(),
      p = getNewsPreferences(config);
    p.categories.technology.topics = ["chips"];
    p.categories.finance.topics = ["rates"];
    p.general.sort = "newest";
    p.categories.research.sort = "recommended";
    const result = normalizePaperNewsConfig({ ...config, preferences: p });
    expect(result.qbitai.topics).toEqual(["chips"]);
    expect(result.cls.topics).toEqual(["rates"]);
    expect(newsDefaultSort(result, "finance")).toBe("newest");
    expect(newsDefaultSort(result, "research")).toBe("recommended");
    expect(newsDefaultSort(result, "all")).toBe("newest");
  });
  it("supports empty inherited research/development topics without malformed requests", () => {
    const config = base(),
      p = getNewsPreferences(config);
    p.categories.research.topics = [];
    p.categories.development.topics = [];
    p.categories.research.days = 365;
    p.categories.development.days = 90;
    const result = normalizePaperNewsConfig({ ...config, preferences: p });
    const arxiv = new URL(paperNewsEndpoint("arxiv", result, now)).searchParams.get(
      "search_query",
    )!;
    expect(arxiv).toMatch(/^submittedDate:/);
    expect(arxiv).not.toContain("()");
    const github = new URL(paperNewsEndpoint("github", result, now)).searchParams.get("q")!;
    expect(github).toContain("pushed:>=");
    expect(github).not.toMatch(/NaN|Infinity|undefined/);
  });
  it("validates scope boundaries and ignores stale flattened source values", () => {
    const config = base(),
      p = getNewsPreferences(config);
    p.categories.finance.topics = ["rates"];
    config.yicai.topics = ["old"];
    expect(normalizePaperNewsConfig({ ...config, preferences: p }).yicai.topics).toEqual(["rates"]);
    p.categories.finance.disabledSources = ["qbitai"];
    expect(() => normalizePaperNewsConfig({ ...config, preferences: p })).toThrow(
      "Invalid disabled source",
    );
    p.categories.finance.disabledSources = [];
    p.general.days = 999;
    expect(() => normalizePaperNewsConfig({ ...config, preferences: p })).toThrow();
  });
  it("does not hide bookmarks from disabled sources", () => {
    const config = base(),
      p = getNewsPreferences(config);
    p.categories.technology.disabledSources = ["qbitai"];
    const result = normalizePaperNewsConfig({ ...config, preferences: p });
    expect(rankPaperNews([article], result, now)).toEqual([]);
    expect(rankPaperNews([article], result, now, true)).toHaveLength(1);
  });
  it("persists inherited settings and caches through disabling and re-enabling", async () => {
    const cache = file(),
      fetcher = vi.fn(
        async () =>
          new Response(
            "<rss><channel><item><title>AI research</title><link>https://www.qbitai.com/2026/09/123.html</link><pubDate>Fri, 25 Sep 2026 00:00:00 GMT</pubDate></item></channel></rss>",
          ),
      );
    const service = new PaperNewsService(cache, fetcher, () => now);
    const first = await service.refresh("qbitai");
    service.setSaved(first.items[0].id, true);
    const p = getNewsPreferences(first.config);
    p.categories.technology.disabledSources = ["qbitai"];
    p.categories.technology.topics = ["AI"];
    service.saveConfig({ ...first.config, preferences: p });
    await service.refresh("qbitai");
    expect(fetcher).toHaveBeenCalledTimes(1);
    const restored = new PaperNewsService(cache, fetcher, () => now);
    expect(restored.snapshot().items).toEqual([]);
    expect(restored.snapshot().saved).toHaveLength(1);
    expect(restored.snapshot().config.preferences).toEqual(p);
    p.categories.technology.disabledSources = [];
    const enabled = restored.saveConfig({ ...first.config, preferences: p });
    expect(enabled.items).toHaveLength(1);
    expect(enabled.items[0].matchedTopics).toEqual(["AI"]);
  });
  it("does not request disabled sources even when explicitly refreshed after cooldown", async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 403 }));
    const service = new PaperNewsService(file(), fetcher, () => now);
    const config = service.snapshot().config,
      p = getNewsPreferences(config);
    for (const source of PAPER_NEWS_SOURCES) {
      const category =
        source === "arxiv" || source === "huggingface"
          ? "research"
          : source === "github" || source === "hf-models" || source === "hf-datasets"
            ? "development"
            : undefined;
      if (category) p.categories[category].disabledSources.push(source);
    }
    p.categories.technology.disabledSources = [
      "qbitai",
      "semianalysis",
      "trendforce",
      "eetimes",
      "chinatalk",
    ];
    p.categories.finance.disabledSources = ["yicai", "cls", "wallstreetcn"];
    p.categories.policy.disabledSources = ["pboc", "nbs", "ndrc", "miit", "csrc", "fed"];
    p.categories.business.disabledSources = ["huxiu", "stratechery", "benevans", "bcg"];
    service.saveConfig({ ...config, preferences: p });
    expect(paperNewsNeedsRefresh(service.snapshot(), now)).toBe(false);
    await service.refresh();
    await service.refresh("qbitai");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
