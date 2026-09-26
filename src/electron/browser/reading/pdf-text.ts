import type { ReadingBlock } from "../../../shared/browser-reading";

/** Extract every page, retaining page citations and explicitly reporting incomplete coverage. */
export async function extractPdfText(
  doc: {
    numPages: number;
    getPage(
      n: number,
    ): Promise<{
      getTextContent(): Promise<{ items: Array<unknown> }>;
      cleanup(): unknown;
    }>;
  },
  signal: AbortSignal,
  limit = 200000,
) {
  const blocks: ReadingBlock[] = [];
  let length = 0;
  let truncated = false;
  for (let n = 1; n <= doc.numPages; n++) {
    signal.throwIfAborted();
    if (length >= limit) {
      truncated = true;
      break;
    }
    const page = await doc.getPage(n);
    try {
      const content = await page.getTextContent();
      const text = content.items
        .map((item) => {
          const value = item as { str?: string; hasEOL?: boolean };
          return typeof value.str === "string"
            ? value.str + (value.hasEOL ? "\n" : " ")
            : "";
        })
        .join("")
        .trim();
      if (!text) {
        truncated = true;
        continue;
      }
      const clipped = text.slice(0, limit - length);
      if (clipped.length < text.length) truncated = true;
      blocks.push({ id: `第${n}页`, page: n, text: clipped });
      length += clipped.length;
    } finally {
      page.cleanup();
    }
  }
  if (!blocks.length)
    throw new Error(
      "PDF 没有可提取的文字，可能是扫描文件；请使用可复制文字的 PDF",
    );
  return { blocks, totalPages: doc.numPages, truncated };
}
