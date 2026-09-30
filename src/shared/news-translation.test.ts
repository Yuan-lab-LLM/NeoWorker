import { describe, expect, it } from "vitest";
import { canTranslateNewsItem } from "./news-translation";
import { paperNewsPrompt, type PaperNewsItem } from "./paper-news";
import { newsTaskDraft } from "./news-task-draft";
const chinese: PaperNewsItem = {
  id: "eetimes:test", source: "eetimes", title: "中国四足机器人出货量增长，AI 与 GPU 成为焦点",
  summary: "报告指出，中国企业在全球市场贡献了九成以上份额。", url: "https://example.org/article",
  date: "2026-09-30", authors: [], tags: [], matchedTopics: [], score: 0,
};
describe("full article translation eligibility", () => {
  it("does not offer Chinese translation for Chinese originals containing technical English terms", () => {
    expect(canTranslateNewsItem(chinese, "zh-CN")).toBe(false);
    expect(canTranslateNewsItem(chinese, "en")).toBe(true);
    expect(() => paperNewsPrompt(chinese, "translate", "zh-CN")).toThrow("已是中文");
    expect(() => newsTaskDraft(chinese, "translate", "zh-CN")).toThrow("已是中文");
    expect(() => newsTaskDraft(chinese, "read", "zh-CN")).not.toThrow();
    expect(() => newsTaskDraft(chinese, "research", "zh-CN")).not.toThrow();
  });
  it.each([
    { title: "Do you really need a travel router?", summary: "Travel routers simplify connecting your devices." },
    { title: "Do you really need a travel router?", summary: "旅行路由器可以简化设备连接，但并非适合所有人，需要结合自己的使用场景选择。" },
    { title: "机器学习", summary: "This paper introduces a new approach to machine learning and presents detailed experiments." },
    { title: "人工知能の研究", summary: "新しい研究です" },
    { title: "인공지능", summary: "새로운 연구" },
    { title: "", summary: "" },
  ])("keeps foreign and undetermined original content translatable: $title", fields => {
    expect(canTranslateNewsItem({ ...chinese, ...fields }, "zh-CN")).toBe(true);
  });
  it.each(["github", "hf-models", "hf-datasets"] as const)("does not infer %s documentation language from its short description", source => {
    expect(canTranslateNewsItem({ ...chinese, source }, "zh-CN")).toBe(true);
  });
});
