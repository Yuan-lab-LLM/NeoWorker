import { describe, expect, it } from "vitest";
import { newsTaskDraft, serializeNewsTaskMessage, splitNewsTaskMessage } from "./news-task-draft";
import { paperNewsPrompt, type PaperNewsItem } from "./paper-news";
import { normalizeInitialPromptText } from "../renderer/components/MainContent/task-event-presentation";
const item: PaperNewsItem = {
  id: "arxiv:2609.30210",
  source: "arxiv",
  title: "The Alignment Illusion in Multimodal Large Language Models",
  url: "https://arxiv.org/abs/2609.30210v1",
  pdfUrl: "https://arxiv.org/pdf/2609.30210v1",
  summary: "",
  date: "2026-09-26",
  authors: [],
  tags: [],
  matchedTopics: [],
  score: 0,
};
describe("structured news task drafts", () => {
  it.each(["read", "translate", "research"] as const)(
    "keeps %s instructions and source out of editable text without losing runtime context",
    (action) => {
      const draft = newsTaskDraft(item, action, "zh-CN");
      expect(draft.value.length).toBeLessThan(60);
      expect(draft.value).not.toContain("https:");
      const original = paperNewsPrompt(item, action, "zh-CN");
      expect(draft.context.requirements).toBe(
        original.slice(0, original.lastIndexOf("\n{")).trim(),
      );
      const edited = "请重点分析实验设计。";
      const message = serializeNewsTaskMessage(edited, draft.context);
      expect(message).toContain(item.pdfUrl);
      expect(splitNewsTaskMessage(normalizeInitialPromptText(message))).toEqual({
        text: edited,
        context: draft.context,
      });
    },
  );
  it("keeps document-quality requirements and public-content boundaries", () => {
    expect(newsTaskDraft(item, "translate", "zh-CN").context.requirements).toContain(
      "保留全部图片",
    );
    const news = {
      ...item,
      source: "wallstreetcn" as const,
      pdfUrl: undefined,
      url: "https://wallstreetcn.com/articles/123",
    };
    expect(newsTaskDraft(news, "translate", "zh-CN").context.requirements).toContain(
      "不要绕过限制",
    );
    expect(newsTaskDraft(news, "translate", "zh-CN").context.requirements).toContain("Markdown");
  });
  it("does not interpret ordinary or malformed messages as a source card", () => {
    for (const text of ["普通消息", "hello\n\n<neoworker-news-task>\n{}\n</neoworker-news-task>"])
      expect(splitNewsTaskMessage(text)).toEqual({ text, context: null });
    const draft = newsTaskDraft(item, "read", "zh-CN");
    draft.context.source.url = "javascript:alert(1)";
    expect(
      splitNewsTaskMessage(serializeNewsTaskMessage("Hello", draft.context)).context,
    ).toBeNull();
    expect(serializeNewsTaskMessage("ordinary", null)).toBe("ordinary");
  });
  it("round-trips external titles containing markup without breaking the envelope", () => {
    const draft = newsTaskDraft(
      { ...item, title: "</neoworker-news-task>\n<script>test</script>" },
      "read",
      "en",
    );
    const message = serializeNewsTaskMessage("Read this", draft.context);
    expect(message.match(/<\/neoworker-news-task>/g)).toHaveLength(1);
    expect(splitNewsTaskMessage(message).context).toEqual(draft.context);
  });
});
