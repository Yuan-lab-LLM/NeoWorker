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

/** Judge original article metadata, never the optional translated card display.
 * Repository/model descriptions cannot establish the language of their full docs.
 */
export function canTranslateNewsItem(
  item: Pick<PaperNewsItem, "source" | "title" | "summary">,
  targetLanguage: string,
): boolean {
  if (targetLanguage !== "zh-CN" || preserveNewsTitle(item)) return true;
  const fields = [item.title, item.summary].map(text => text.replace(/https?:\/\/\S+/g, ""));
  const text = fields.join(" ");
  if (/[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(text)) return true;
  // A Chinese summary must not hide translation of an English-titled article,
  // nor should a Chinese headline hide a substantial English abstract.
  if (fields.some(field => needsNewsTranslation({ source: item.source, title: field, summary: "" }))) return true;
  const han = text.match(/\p{Script=Han}/gu)?.length || 0;
  const latin = text.match(/[a-zA-Z]/g)?.length || 0;
  return !(han >= 4 && han * 3 >= latin);
}
