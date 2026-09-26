import { describe, expect, it, vi } from "vitest";
import { extractPdfText } from "./pdf-text";
const document = (texts: string[]) => ({
  numPages: texts.length,
  getPage: vi.fn(async (n: number) => ({
    getTextContent: async () => ({ items: [{ str: texts[n - 1] }] }),
    cleanup: vi.fn(),
  })),
});
describe("PDF document context", () => {
  it("reads all pages with real page citations", async () => {
    const doc = document(["Introduction", "Method", "Results"]);
    const context = await extractPdfText(doc, new AbortController().signal);
    expect(context.truncated).toBe(false);
    expect(context.totalPages).toBe(3);
    expect(context.blocks.map((b) => [b.id, b.text])).toEqual([
      ["第1页", "Introduction"],
      ["第2页", "Method"],
      ["第3页", "Results"],
    ]);
  });
  it("reports limited or unreadable coverage rather than claiming full text", async () => {
    const signal = new AbortController().signal;
    expect(
      await extractPdfText(document(["abc", "def", "ghi"]), signal, 5),
    ).toMatchObject({
      truncated: true,
      totalPages: 3,
      blocks: [{ text: "abc" }, { text: "de" }],
    });
    expect(
      await extractPdfText(document(["abc", "", "ghi"]), signal),
    ).toMatchObject({ truncated: true });
    await expect(extractPdfText(document([""]), signal)).rejects.toThrow(
      "没有可提取",
    );
  });
  it("honors cancellation before extracting pages", async () => {
    const controller = new AbortController();
    controller.abort();
    const doc = document(["abc"]);
    await expect(extractPdfText(doc, controller.signal)).rejects.toThrow();
    expect(doc.getPage).not.toHaveBeenCalled();
  });
});
