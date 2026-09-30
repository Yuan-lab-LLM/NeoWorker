export type NewsViewMode = "stream" | "cards";
export const NEWS_VIEW_STORAGE_KEY = "neoworker.news.view";
export function readNewsViewMode(): NewsViewMode {
  try { return window.localStorage.getItem(NEWS_VIEW_STORAGE_KEY) === "cards" ? "cards" : "stream"; }
  catch { return "stream"; }
}
export function saveNewsViewMode(mode: NewsViewMode) {
  try { window.localStorage.setItem(NEWS_VIEW_STORAGE_KEY, mode); } catch { /* Storage may be unavailable. */ }
}
