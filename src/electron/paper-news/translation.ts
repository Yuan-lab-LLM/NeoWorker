import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import type { PaperNewsItem } from "../../shared/paper-news";
import {
  newsTranslationKey,
  needsNewsTranslation,
  preserveNewsTitle,
  type NewsTranslation,
  type NewsTranslationResult,
} from "../../shared/news-translation";

export type NewsTranslator = (item: PaperNewsItem) => Promise<string>;
const MAX_ENTRIES = 500;

/** Translates only trusted cached feed metadata, never arbitrary renderer prompts or URLs. */
export class NewsTranslations {
  private cache = new Map<string, NewsTranslation>();
  private pending = new Map<string, Promise<NewsTranslationResult>>();
  constructor(
    private file: string,
    private run: NewsTranslator,
  ) {
    try {
      if (fs.statSync(file).size > 8_000_000) return;
      const rows: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
      if (!Array.isArray(rows)) return;
      for (const row of rows.slice(-MAX_ENTRIES)) {
        if (!row || typeof row !== "object") continue;
        const { id, originalTitle, originalSummary, title, summary } = row;
        if (
          ![id, originalTitle, originalSummary, title, summary].every(
            (v) => typeof v === "string",
          )
        )
          continue;
        if (
          id.length > 240 ||
          title.length > 2000 ||
          originalTitle.length > 2000 ||
          summary.length > 20000 ||
          originalSummary.length > 20000
        )
          continue;
        const value = { id, originalTitle, originalSummary, title, summary };
        this.cache.set(
          this.key({ id, title: originalTitle, summary: originalSummary }),
          value,
        );
      }
    } catch {
      /* Missing or invalid optional translation cache: translate on demand. */
    }
  }
  private key(item: Pick<PaperNewsItem, "id" | "title" | "summary">): string {
    return createHash("sha256").update(newsTranslationKey(item)).digest("hex");
  }
  get(item: PaperNewsItem | undefined): Promise<NewsTranslationResult> {
    if (!item) return Promise.resolve({ error: "unavailable" });
    const key = this.key(item);
    const cached = this.cache.get(key);
    if (cached) return Promise.resolve({ translation: cached });
    const pending = this.pending.get(key);
    if (pending) return pending;
    if (!needsNewsTranslation(item))
      return Promise.resolve({
        translation: {
          id: item.id,
          originalTitle: item.title,
          originalSummary: item.summary,
          title: item.title,
          summary: item.summary,
        },
      });
    if (this.pending.size >= 2) return Promise.resolve({ error: "busy" });
    const promise = this.translate(item, key).finally(() =>
      this.pending.delete(key),
    );
    this.pending.set(key, promise);
    return promise;
  }
  private async translate(
    item: PaperNewsItem,
    key: string,
  ): Promise<NewsTranslationResult> {
    try {
      const raw = await this.run(item);
      const value: unknown = JSON.parse(
        raw
          .trim()
          .replace(/^```(?:json)?\s*/i, "")
          .replace(/\s*```$/, ""),
      );
      if (!value || typeof value !== "object")
        throw new Error("Invalid translation");
      const data = value as Record<string, unknown>;
      if (
        typeof data.title !== "string" ||
        typeof data.summary !== "string" ||
        !data.title.trim() ||
        data.title.length > 2000 ||
        data.summary.length > 20000 ||
        (item.summary.trim() && !data.summary.trim())
      )
        throw new Error("Invalid translation");
      const translation: NewsTranslation = {
        id: item.id,
        originalTitle: item.title,
        originalSummary: item.summary,
        title: preserveNewsTitle(item) ? item.title : data.title.trim(),
        summary: item.summary.trim() ? data.summary.trim() : "",
      };
      // Do not mark an unchanged English response as a successful Chinese translation.
      if (
        needsNewsTranslation({
          ...item,
          title: translation.title,
          summary: translation.summary,
        })
      )
        throw new Error("Translation is not Chinese");
      this.cache.set(key, translation);
      while (this.cache.size > MAX_ENTRIES)
        this.cache.delete(this.cache.keys().next().value!);
      try {
        fs.mkdirSync(path.dirname(this.file), { recursive: true });
        const temporary = `${this.file}.tmp`;
        let serialized = JSON.stringify([...this.cache.values()]);
        while (
          Buffer.byteLength(serialized) > 8_000_000 &&
          this.cache.size > 1
        ) {
          this.cache.delete(this.cache.keys().next().value!);
          serialized = JSON.stringify([...this.cache.values()]);
        }
        fs.writeFileSync(temporary, serialized, { mode: 0o600 });
        fs.renameSync(temporary, this.file);
      } catch {
        /* Keep the translation usable in memory if disk storage is unavailable. */
      }
      return { translation };
    } catch (error) {
      return {
        error:
          error instanceof Error && error.message === "NEWS_MODEL_UNAVAILABLE"
            ? "model"
            : "failed",
      };
    }
  }
}
