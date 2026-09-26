import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";

const { parsePdfBufferMock, extractPdfReviewDataMock } = vi.hoisted(() => ({
  parsePdfBufferMock: vi.fn(),
  extractPdfReviewDataMock: vi.fn(),
}));

vi.mock("../pdf-parser", () => ({
  parsePdfBuffer: parsePdfBufferMock,
}));

vi.mock("../pdf-review", () => ({
  extractPdfReviewData: extractPdfReviewDataMock,
}));

import { extractPdfText, isSuspiciousPdfText } from "../pdf-text";

describe("extractPdfText", () => {
  let tmpDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "neoworker-pdf-text-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  it("keeps the library-first path when pdf-parse already returns substantial text", async () => {
    const pdfPath = path.join(tmpDir, "sample.pdf");
    await fs.writeFile(pdfPath, Buffer.from("%PDF-1.7"));
    parsePdfBufferMock.mockResolvedValue({
      text: "Bonjour tout le monde.\nCeci est un PDF avec assez de texte pour une analyse normale.",
      numpages: 3,
    });

    const result = await extractPdfText(pdfPath);

    expect(result).toEqual({
      text: "Bonjour tout le monde.\nCeci est un PDF avec assez de texte pour une analyse normale.",
      pageCount: 3,
      extractionMode: "pdf-parse",
      usedFallback: false,
      previewLimited: false,
      extractionStatus: "complete",
      extractionNote: "complete via embedded text layer; OCR not needed",
    });
    expect(extractPdfReviewDataMock).not.toHaveBeenCalled();
  });

  it("falls back to review extraction when the library result is too thin", async () => {
    const pdfPath = path.join(tmpDir, "scan.pdf");
    await fs.writeFile(pdfPath, Buffer.from("%PDF-1.7"));
    parsePdfBufferMock.mockResolvedValue({
      text: "Page",
      numpages: 2,
    });
    extractPdfReviewDataMock.mockResolvedValue({
      pageCount: 5,
      nativeTextPages: 2,
      ocrPages: 0,
      scannedPages: 0,
      truncatedPages: true,
      extractionMode: "native",
      imageHeavy: false,
      pages: [
        { pageIndex: 0, text: "Premier paragraphe lisible.", usedOcr: false, truncated: false },
        { pageIndex: 1, text: "Deuxieme paragraphe lisible.", usedOcr: false, truncated: false },
      ],
      fullText: "",
      content: "",
    });

    const result = await extractPdfText(pdfPath);

    expect(result).toEqual({
      text:
        "Premier paragraphe lisible.\n\nDeuxieme paragraphe lisible.\n\n[... 3 additional page(s) omitted from extraction ...]",
      pageCount: 5,
      extractionMode: "native",
      usedFallback: true,
      previewLimited: true,
      extractionStatus: "preview",
      extractionNote: "partial preview extracted from fallback reader; some source text was omitted",
    });
    expect(extractPdfReviewDataMock).toHaveBeenCalledOnce();
  });

  it("falls back when the library text is long enough but clearly low quality", async () => {
    const pdfPath = path.join(tmpDir, "noisy.pdf");
    await fs.writeFile(pdfPath, Buffer.from("%PDF-1.7"));
    parsePdfBufferMock.mockResolvedValue({
      text: new Array(80).fill("A\uFFFDB").join(" "),
      numpages: 2,
    });
    extractPdfReviewDataMock.mockResolvedValue({
      pageCount: 2,
      nativeTextPages: 2,
      ocrPages: 0,
      scannedPages: 0,
      truncatedPages: false,
      extractionMode: "native",
      imageHeavy: false,
      pages: [
        { pageIndex: 0, text: "Texte propre de la premiere page.", usedOcr: false, truncated: false },
        { pageIndex: 1, text: "Texte propre de la deuxieme page.", usedOcr: false, truncated: false },
      ],
      fullText: "",
      content: "",
    });

    const result = await extractPdfText(pdfPath);

    expect(result).toEqual({
      text: "Texte propre de la premiere page.\n\nTexte propre de la deuxieme page.",
      pageCount: 2,
      extractionMode: "native",
      usedFallback: true,
      previewLimited: false,
      extractionStatus: "recovered",
      extractionNote: "complete via fallback PDF text reader",
    });
    expect(extractPdfReviewDataMock).toHaveBeenCalledOnce();
  });

  it("never reports WinAnsi CJK mojibake as complete or recovered", async () => {
    const pdfPath = path.join(tmpDir, "broken-cjk.pdf");
    await fs.writeFile(pdfPath, Buffer.from("%PDF-1.7"));
    const broken =
      "SN¬ !’ ^•]Þ‚*síf~Æb¥TJ gå‹âeågÿ2026 ^t 8 g 15 eåÿThQmÿÿ N0b¥TJi‚‰È NŒ0‚*síf~Æˆh";
    parsePdfBufferMock.mockResolvedValue({ text: broken, numpages: 1 });
    extractPdfReviewDataMock.mockResolvedValue({
      pageCount: 1,
      nativeTextPages: 1,
      ocrPages: 0,
      scannedPages: 0,
      truncatedPages: false,
      extractionMode: "native",
      imageHeavy: false,
      pages: [{ pageIndex: 0, text: broken, usedOcr: false, truncated: false }],
      fullText: broken,
      content: broken,
    });

    const result = await extractPdfText(pdfPath);

    expect(result.extractionStatus).toBe("empty");
    expect(result.extractionNote).toContain("corrupted or mojibake");
  });

  it("accepts long documents with repeated normal vocabulary", async () => {
    const pdfPath = path.join(tmpDir, "long-report.pdf");
    await fs.writeFile(pdfPath, Buffer.from("%PDF-1.7"));
    const text = Array.from({ length: 80 }, (_, i) =>
      `Section ${i}: The agent reads the document and checks each result before delivering the translated report to the user. Detail${i} explains scenario${i}.`,
    ).join("\n");
    parsePdfBufferMock.mockResolvedValue({ text, numpages: 12 });
    const result = await extractPdfText(pdfPath);
    expect(result.text).toBe(text);
    expect(result.extractionStatus).toBe("complete");
    expect(extractPdfReviewDataMock).not.toHaveBeenCalled();
  });

  it("marks extraction incomplete when text within a page was cut", async () => {
    const pdfPath = path.join(tmpDir, "dense.pdf");
    await fs.writeFile(pdfPath, Buffer.from("%PDF-1.7"));
    parsePdfBufferMock.mockRejectedValue(new Error("primary reader unavailable"));
    extractPdfReviewDataMock.mockResolvedValue({
      pageCount: 1, truncatedPages: false, extractionMode: "native",
      pages: [{ pageIndex: 0, text: "Only the start of this long page was extracted.", truncated: true }],
    });
    const result = await extractPdfText(pdfPath);
    expect(result.previewLimited).toBe(true);
    expect(result.extractionStatus).toBe("preview");
  });

  it("still rejects long repetitive garbage", () => {
    expect(isSuspiciousPdfText("garbled text ".repeat(300))).toBe(true);
  });

  it("does not count extraction whitespace as corrupt glyphs on a formula page", () => {
    const prose = "我们使用主角余弦谱比较视觉与文本子空间。矩阵分别经过主成分分析得到标准正交基，记录每层的视觉与文本对齐分数。";
    const formula = "U U = P diag ( σ 1 , … , σ k ) Q ⊤ , σ 1 ≥ ⋯ ≥ σ k ≥ 0";
    const text = `${[...prose].join(" ")} ${formula} ${formula} ${formula}`;
    expect(text.match(/[\p{L}\p{N}]/gu)!.length / text.length).toBeLessThan(0.45);
    expect(isSuspiciousPdfText(text)).toBe(false);
    expect(isSuspiciousPdfText(text.replace(/σ/g, "ÿÞ¬"))).toBe(true);
  });
});
