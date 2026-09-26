import {
  PAPER_NEWS_SOURCES,
  paperNewsPrompt,
  type PaperNewsAction,
  type PaperNewsItem,
  type PaperNewsSource,
} from "./paper-news";

export interface NewsTaskContext {
  version: 1;
  action: PaperNewsAction;
  language: string;
  source: { id: PaperNewsSource; title: string; url: string; pdfUrl?: string };
  requirements: string;
}
const START = "\n\n<neoworker-news-task>\n";
const END = "\n</neoworker-news-task>";
export function newsTaskDraft(item: PaperNewsItem, action: PaperNewsAction, language: string) {
  const zh = language === "zh-CN";
  const prompt = paperNewsPrompt(item, action, language);
  return {
    value: zh
      ? {
          read: "帮我解读这篇内容，说明重点和背景。",
          translate: "将这篇内容完整翻译成中文，保留原文结构。",
          research: "围绕这篇内容开展深入研究，生成带来源的报告。",
        }[action]
      : {
          read: "Explain this source and its key ideas and context.",
          translate: "Translate this source into English, preserving its structure.",
          research: "Research this source in depth and produce a report with citations.",
        }[action],
    context: {
      version: 1,
      action,
      language,
      source: {
        id: item.source,
        title: item.title,
        url: item.url,
        ...(item.pdfUrl ? { pdfUrl: item.pdfUrl } : {}),
      },
      // The existing task builder ends with a serialized metadata object. Keep
      // its execution requirements, but render metadata as a source card.
      requirements: prompt.slice(0, prompt.lastIndexOf("\n{")).trim(),
    } satisfies NewsTaskContext,
  };
}
export function serializeNewsTaskMessage(text: string, context?: NewsTaskContext | null): string {
  if (!context) return text;
  return text + START + JSON.stringify(context, null, 2).replace(/</g, "\\u003c") + END;
}
/** Strict, trailing envelope: ordinary messages and malformed data remain untouched. */
export function splitNewsTaskMessage(text: string): {
  text: string;
  context: NewsTaskContext | null;
} {
  const unchanged = { text, context: null };
  const trimmed = text.trimEnd();
  const index = trimmed.lastIndexOf(START);
  if (index < 0 || !trimmed.endsWith(END)) return unchanged;
  try {
    const value = JSON.parse(trimmed.slice(index + START.length, -END.length));
    const url = (s: unknown) =>
      typeof s === "string" &&
      s.length < 4096 &&
      /^https?:\/\//i.test(s) &&
      !new URL(s).username &&
      !new URL(s).password;
    if (
      value.version !== 1 ||
      !["read", "translate", "research"].includes(value.action) ||
      typeof value.language !== "string" ||
      !PAPER_NEWS_SOURCES.includes(value.source?.id) ||
      typeof value.source.title !== "string" ||
      value.source.title.length > 2000 ||
      !url(value.source.url) ||
      (value.source.pdfUrl !== undefined && !url(value.source.pdfUrl)) ||
      typeof value.requirements !== "string" ||
      value.requirements.length > 20000
    )
      return unchanged;
    return { text: trimmed.slice(0, index), context: value };
  } catch {
    return unchanged;
  }
}
