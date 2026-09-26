import type { PaperNewsSource } from "./paper-news";

export const NEWS_IMAGE_SOURCES: readonly PaperNewsSource[] = [
  "mitai", "qbitai", "eetimes", "githubblog", "huxiu",
];

export function hasNewsImages(source: string): boolean {
  return NEWS_IMAGE_SOURCES.includes(source as PaperNewsSource);
}

/** Keep the aggregate feed text-only; individual supported sources may opt in. */
export function canShowNewsImages(category: string, source: string): boolean {
  return source === "all"
    ? category === "technology" || category === "business"
    : hasNewsImages(source);
}
