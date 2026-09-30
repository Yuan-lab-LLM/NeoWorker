import { describe, expect, it } from "vitest";
import { DEFAULT_PAPER_NEWS_CONFIG, type PaperNewsConfig } from "../../shared/paper-news";
import { getNewsPreferences, newsCategory, newsSourceEnabled } from "../../shared/news-preferences";
import { NEWS_PUBLISHERS } from "../../shared/news-sources";
import { normalizePaperNewsConfig, rankPaperNews } from "./adapters";
import { parsePublisherNews } from "./publishers";
import { newsSourcesForCategory } from "../../renderer/components/news-feed-catalog";

const sources = ["who", "sciencedailyhealth", "androidreviews", "engadget", "zapier", "learningresearch", "coursera"] as const;
describe("everyday news categories", () => {
  it("migrates a six-category cache while retaining existing choices and bookmarks' source settings", () => {
    const old = structuredClone(DEFAULT_PAPER_NEWS_CONFIG);
    const prefs = getNewsPreferences(old);
    prefs.categories.research.topics = ["robotics"];
    prefs.categories.finance.disabledSources = ["cls"];
    prefs.sources.qbitai = { days: 7 };
    const stored = { ...old, preferences: prefs } as unknown as Record<string, any>;
    for (const category of ["health", "consumer", "productivity", "learning"]) delete stored.preferences.categories[category];
    delete stored.preferences.followedCategories;
    for (const source of sources) delete stored[source];
    const config = normalizePaperNewsConfig(JSON.parse(JSON.stringify(stored)));
    expect(config.preferences?.categories.research.topics).toEqual(["robotics"]);
    expect(newsSourceEnabled(config, "cls")).toBe(false);
    expect(config.qbitai.days).toBe(7);
    expect(config.preferences?.followedCategories).toEqual(["research", "development", "technology", "finance"]);
    for (const source of sources) {
      expect(newsSourceEnabled(config, source)).toBe(true);
      expect(config[source]).toEqual({ topics: [], days: 365 });
      expect(newsSourcesForCategory(newsCategory(source))).toContain(source);
    }
  });
  it.each(sources)("parses, dates and ranks %s articles while rejecting off-site links", source => {
    const spec = NEWS_PUBLISHERS[source];
    const url = `https://${spec.hosts[0]}/article-example`;
    const raw = `<rss><channel><item><title>Practical guide &amp; new findings</title><link>${url}</link><description><![CDATA[<p>A public summary with useful context.</p>]]></description><pubDate>Mon, 28 Sep 2026 10:00:00 GMT</pubDate></item><item><title>External spam</title><link>https://untrusted.example/story</link></item></channel></rss>`;
    const items = parsePublisherNews(source, raw);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ source, summary: "A public summary with useful context.", date: "2026-09-28T10:00:00.000Z", url });
    expect(rankPaperNews(items, DEFAULT_PAPER_NEWS_CONFIG, Date.parse("2026-09-29T00:00:00Z"))).toHaveLength(1);
  });
  it("persists followed categories including an empty list and rejects invalid choices", () => {
    const config: PaperNewsConfig = structuredClone(DEFAULT_PAPER_NEWS_CONFIG);
    config.preferences = getNewsPreferences(config);
    config.preferences.followedCategories = ["health", "consumer", "productivity", "learning"];
    expect(normalizePaperNewsConfig(config).preferences?.followedCategories).toEqual(config.preferences.followedCategories);
    config.preferences.followedCategories = [];
    expect(normalizePaperNewsConfig(config).preferences?.followedCategories).toEqual([]);
    expect(() => normalizePaperNewsConfig({ ...config, preferences: { ...config.preferences, followedCategories: ["invalid"] } })).toThrow();
  });
});
