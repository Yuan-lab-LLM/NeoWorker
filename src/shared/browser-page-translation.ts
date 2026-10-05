export const PAGE_TRANSLATION_CHANNEL = "browser-reading:page-translation";

export interface PageTranslationRequest {
  taskId: string;
  sessionId: string;
  url: string;
  action: "translate" | "restore" | "status";
}

export interface PageTranslationStatus {
  status:
    | "idle"
    | "translating"
    | "translated"
    | "original"
    | "already-chinese"
    | "partial"
    | "error";
  completed: number;
  total: number;
  message?: string;
}

export interface PageTextSegment {
  id: number;
  text: string;
}

/** Bound each model request without truncating the captured document. */
export function pageTranslationBatches(segments: PageTextSegment[]): PageTextSegment[][] {
  const batches: PageTextSegment[][] = [];
  let batch: PageTextSegment[] = [];
  let size = 0;
  for (const segment of segments) {
    if (batch.length && (size + segment.text.length > 4500 || batch.length >= 50)) {
      batches.push(batch);
      batch = [];
      size = 0;
    }
    batch.push(segment);
    size += segment.text.length;
  }
  if (batch.length) batches.push(batch);
  return batches;
}

export function parsePageTranslations(raw: string, source: PageTextSegment[]): PageTextSegment[] {
  const value: unknown = JSON.parse(
    raw
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, ""),
  );
  if (!Array.isArray(value) || value.length !== source.length)
    throw new Error("翻译结果不完整，请重试");
  const expected = new Map(source.map((row) => [row.id, row.text]));
  const seen = new Set<number>();
  for (const row of value) {
    if (
      !row ||
      !Number.isInteger(row.id) ||
      !expected.has(row.id) ||
      seen.has(row.id) ||
      typeof row.text !== "string" ||
      !row.text.trim() ||
      row.text.length > Math.max(1000, expected.get(row.id)!.length * 6)
    ) {
      throw new Error("翻译结果格式异常，请重试");
    }
    seen.add(row.id);
  }
  if (
    source
      .map((row) => row.text)
      .join("")
      .replace(/[^a-z]/gi, "").length > 80 &&
    !/[\u3400-\u9fff]/u.test(value.map((row) => row.text).join(""))
  ) {
    throw new Error("模型未返回中文译文，请重试");
  }
  return value.map((row) => ({ id: row.id, text: row.text }));
}
