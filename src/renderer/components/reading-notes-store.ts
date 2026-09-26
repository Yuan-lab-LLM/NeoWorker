import type { ReadingNote } from "../../shared/browser-reading";
const NOTES_KEY = "neoworker.reading-notes.v1";
export function loadReadingNotes(): ReadingNote[] {
  try {
    const data = JSON.parse(localStorage.getItem(NOTES_KEY) || "[]");
    return Array.isArray(data)
      ? data
          .filter(
            (n) =>
              n &&
              typeof n.id === "string" &&
              typeof n.url === "string" &&
              typeof n.text === "string",
          )
          .slice(-500)
      : [];
  } catch {
    return [];
  }
}
export function persistNotes(notes: ReadingNote[]) {
  localStorage.setItem(NOTES_KEY, JSON.stringify(notes.slice(-500)));
}
