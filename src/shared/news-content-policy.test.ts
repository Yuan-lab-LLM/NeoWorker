import { describe, expect, it } from "vitest";
import { filterNewsSnapshot, isNewsContentAllowed } from "./news-content-policy";
import { PAPER_NEWS_SOURCES, paperNewsPrompt, type PaperNewsItem } from "./paper-news";
import { NEWS_FEED_CATEGORIES } from "../renderer/components/news-feed-catalog";
const article = { source: "qbitai", title: "New GPU architecture", summary: "Improved inference throughput", tags: [], url: "https://www.qbitai.com/2026/09/123" };
describe("curated news content scope", () => {
  it("retires ChinaTalk from fetching and all source menus and rejects historical aliases", () => {
    expect(PAPER_NEWS_SOURCES).not.toContain("chinatalk");
    expect(NEWS_FEED_CATEGORIES.flatMap(c => c.providers.map(p => p.id))).not.toContain("chinatalk");
    for (const candidate of [
      { ...article, source: "chinatalk", title: "Logan Wright on Broken China" },
      { ...article, id: "chinatalk:old", source: "qbitai" },
      { ...article, url: "https://www.chinatalk.media/p/story" },
      { ...article, imageUrl: "https://chinatalk.substack.com/cover.jpg" },
    ]) expect(isNewsContentAllowed(candidate)).toBe(false);
  });
  it.each([
    "习近平会见外国领导人", "總統大選最新消息", "党政会议召开", "地缘政治影响芯片行业",
    "特朗普竞选主张", "俄乌战事最新进展", "两岸关系与台海局势", "外交部回应记者提问",
    "Logan Wright on Broken China", "China is broken", "中国崩溃论",
    "US presidential election results", "Xi Jinping state visit", "Donald Trump announces tariffs",
    "Democrats and Republicans debate the bill", "Geopolitics and semiconductor export sanctions",
    "Military conflict disrupts shipping", "Human rights report", "NATO leaders hold a summit",
    "Ｘｉ Ｊｉｎｐｉｎｇ state visit", "Poli\u200btics today", "&#25919;&#27835;新闻",
  ])("excludes political reporting regardless of viewpoint/language: %s", title => {
    expect(isNewsContentAllowed({ ...article, title })).toBe(false);
  });
  it("checks summaries, tags and decoded URL paths even with an innocuous title", () => {
    expect(isNewsContentAllowed({ ...article, summary: "The prime minister spoke about foreign policy." })).toBe(false);
    expect(isNewsContentAllowed({ ...article, tags: ["Politics"] })).toBe(false);
    expect(isNewsContentAllowed({ ...article, url: "https://www.qbitai.com/p/%E6%94%BF%E6%B2%BB" })).toBe(false);
    expect(isNewsContentAllowed({ ...article, imageUrl: "https://i.qbitai.com/xi-jinping.jpg" })).toBe(false);
  });
  it.each([
    "中国企业推出新一代 GPU", "新款无线音箱评测", "央行公布利率数据", "制造业 PMI 与上市公司财报",
    "Policy gradient improves reinforcement learning", "Leader election in Raft and election timeouts",
    "Random forest voting classifiers", "Star Wars game graphics performance", "Distributed systems 领导者选举",
  ])("retains in-scope technical, economic and lifestyle content: %s", title => {
    expect(isNewsContentAllowed({ ...article, title })).toBe(true);
  });
  it("does not let technical vocabulary exempt a political article", () => {
    expect(isNewsContentAllowed({ ...article, title: "Leader election and presidential elections" })).toBe(false);
  });
  it("filters legacy snapshots before counts and bookmarks are displayed", () => {
    const snapshot={items:[article,{...article,source:"chinatalk"}],saved:[article,{...article,title:"Political reporting"}],refreshing:false};
    const clean=filterNewsSnapshot(snapshot);
    expect(clean.items).toEqual([article]);expect(clean.saved).toEqual([article]);expect(clean.refreshing).toBe(false);
    expect(snapshot.saved).toHaveLength(2);
  });
  it("blocks the AI draft entry for excluded items", () => {
    const item = { ...article, id: "qbitai:1", title: "Political debate", authors: [], date: "", matchedTopics: [], score: 0 } as PaperNewsItem;
    for (const action of ["read", "translate", "research"] as const) expect(() => paperNewsPrompt(item, action, "zh-CN")).toThrow("资讯展示范围");
  });
});
