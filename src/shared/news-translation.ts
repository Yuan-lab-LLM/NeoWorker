import type { PaperNewsItem } from "./paper-news";

export interface NewsTranslation {
  id: string;
  originalTitle: string;
  originalSummary: string;
  title: string;
  summary: string;
}
export type NewsTranslationResult =
  | { translation: NewsTranslation }
  | { error: "unavailable" | "model" | "failed" | "busy" };

export function newsTranslationKey(
  item: Pick<PaperNewsItem, "id" | "title" | "summary">,
): string {
  return JSON.stringify([item.id, item.title, item.summary]);
}
export function preserveNewsTitle(
  item: Pick<PaperNewsItem, "source">,
): boolean {
  return ["github", "hf-models", "hf-datasets"].includes(item.source);
}
export function needsNewsTranslation(
  item: Pick<PaperNewsItem, "source" | "title" | "summary">,
): boolean {
  const text = `${preserveNewsTitle(item) ? "" : item.title} ${item.summary}`;
  const latin = text.match(/[a-zA-Z]/g)?.length || 0;
  const han = text.match(/\p{Script=Han}/gu)?.length || 0;
  return latin > 10 && (han === 0 || latin > han * 3);
}
