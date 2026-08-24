import * as fs from "fs/promises";
import type { PdfReviewData } from "./pdf-review";
import { extractPdfReviewData } from "./pdf-review";
import { parsePdfBuffer } from "./pdf-parser";
import type { PdfReviewExtractionMode } from "../../shared/types";

export type PdfTextExtractionMode = "pdf-parse" | PdfReviewExtractionMode;

export type ExtractPdfTextOptions = {
  minChars?: number;
  minWords?: number;
  maxFallbackPages?: number;
  maxFallbackCharsPerPage?: number;
  maxFallbackOcrPages?: number;
  includeOcr?: boolean;
};

export type PdfTextData = {
  text: string;
  pageCount: number;
  extractionMode: PdfTextExtractionMode;
  usedFallback: boolean;
  previewLimited: boolean;
  extractionStatus: "complete" | "recovered" | "ocr" | "preview" | "empty";
  extractionNote: string;
};

const DEFAULT_MIN_TEXT_CHARS = 80;
const DEFAULT_MIN_TEXT_WORDS = 12;
const DEFAULT_FALLBACK_MAX_PAGES = 200;
const DEFAULT_FALLBACK_MAX_CHARS_PER_PAGE = 12_000;
const DEFAULT_FALLBACK_MAX_OCR_PAGES = 24;
const NO_PAGE_TEXT_PLACEHOLDER = "[No extractable text found on this page.]";
const NO_DOCUMENT_TEXT_PLACEHOLDER = "[No extractable text found in PDF.]";

function normalizeWhitespace(value: string): string {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function countWords(text: string): number {
  const normalized = normalizeWhitespace(text);
  if (!normalized) return 0;
  return normalized.split(/\s+/).filter(Boolean).length;
}

function countMatches(value: string, pattern: RegExp): number {
  return [...value.matchAll(pattern)].length;
}

export function isSuspiciousPdfText(text: string): boolean {
  const normalized = normalizeWhitespace(text);
  if (!normalized) return true;

  const visibleLength = normalized.length;
  const replacementChars = countMatches(normalized, /\uFFFD/g);
  if (visibleLength >= 120 && replacementChars / visibleLength >= 0.02) {
    return true;
  }

  // Common WinAnsi/Latin-1 mojibake produced when a PDF generator writes CJK
  // text through Helvetica instead of embedding a Unicode-capable font.
  // A valid Western-language PDF may contain one of these characters, but a
  // dense cluster of them is a strong signal that the text layer is corrupt.
  const mojibakeChars = countMatches(
    normalized,
    /[ÿÞþÆæŒœŠšŽžŸ™‰‹›¬¥¤¦¨´¸¿¡]/gu,
  );
  if (
    (mojibakeChars >= 6 && mojibakeChars / visibleLength >= 0.012) ||
    mojibakeChars >= 18
  ) {
    return true;
  }

  const controlLikePunctuation = countMatches(normalized, /[¬Þÿ][^\s]{0,4}/gu);
  if (controlLikePunctuation >= 4) return true;

  const contentChars = countMatches(normalized, /[\p{L}\p{N}]/gu);
  if (visibleLength >= 160 && contentChars / visibleLength < 0.45) {
    return true;
  }

  const lines = normalized
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length >= 6) {
    const uniqueLines = new Set(lines).size;
    if (uniqueLines / lines.length < 0.6) {
      return true;
    }
  }

  const tokens = normalized.split(/\s+/).filter(Boolean);
  if (tokens.length >= 10) {
    const uniqueTokens = new Set(tokens).size;
    if (uniqueTokens / tokens.length < 0.5) {
      return true;
    }
  }

  if (tokens.length >= 20) {
    const longTokens = tokens.filter((token) => token.length >= 80).length;
    if (longTokens / tokens.length >= 0.2) {
      return true;
    }
  }

  return false;
}

function isMeaningfulText(text: string, options: ExtractPdfTextOptions): boolean {
  const normalized = normalizeWhitespace(text);
  if (!normalized) return false;

  const minChars = Math.max(32, Math.floor(options.minChars ?? DEFAULT_MIN_TEXT_CHARS));
  const minWords = Math.max(6, Math.floor(options.minWords ?? DEFAULT_MIN_TEXT_WORDS));
  if (normalized.length < minChars && countWords(normalized) < minWords) {
    return false;
  }

  return !isSuspiciousPdfText(normalized);
}

function scoreText(text: string): number {
  const normalized = normalizeWhitespace(text);
  if (!normalized) return 0;
  return normalized.length + countWords(normalized) * 24;
}

function extractTextFromReview(review: PdfReviewData): string {
  const pageTexts = review.pages
    .map((page) => normalizeWhitespace(page.text || ""))
    .filter(
      (pageText) =>
        Boolean(pageText) &&
        pageText !== NO_PAGE_TEXT_PLACEHOLDER &&
        pageText !== NO_DOCUMENT_TEXT_PLACEHOLDER,
    );

  if (review.truncatedPages && review.pageCount > review.pages.length) {
    pageTexts.push(
      `[... ${review.pageCount - review.pages.length} additional page(s) omitted from extraction ...]`,
    );
  }

  return pageTexts.join("\n\n");
}

function choosePreferredText(
  primary: string,
  fallback: string,
): { text: string; source: "primary" | "fallback" } {
  const primaryScore = scoreText(primary);
  const fallbackScore = scoreText(fallback);
  if (primaryScore === 0 && fallbackScore === 0) {
    return { text: "", source: "primary" };
  }
  if (primaryScore === 0) {
    return { text: normalizeWhitespace(fallback), source: "fallback" };
  }
  if (fallbackScore === 0) {
    return { text: normalizeWhitespace(primary), source: "primary" };
  }
  if (fallbackScore > primaryScore + 80) {
    return { text: normalizeWhitespace(fallback), source: "fallback" };
  }
  return { text: normalizeWhitespace(primary), source: "primary" };
}

export async function extractPdfText(
  pdfPath: string,
  options: ExtractPdfTextOptions = {},
): Promise<PdfTextData> {
  const buffer = await fs.readFile(pdfPath);

  let parsedText = "";
  let parsedPageCount = 1;
  let parsedTextSuspicious = false;

  try {
    const parsed = await parsePdfBuffer(buffer);
    parsedText = normalizeWhitespace(parsed.text || "");
    parsedPageCount = Math.max(1, Math.floor(parsed.numpages || 1));
    parsedTextSuspicious = Boolean(parsedText) && isSuspiciousPdfText(parsedText);

    if (isMeaningfulText(parsedText, options)) {
      return {
        text: parsedText,
        pageCount: parsedPageCount,
        extractionMode: "pdf-parse",
        usedFallback: false,
        previewLimited: false,
        extractionStatus: "complete",
        extractionNote: "complete via embedded text layer; OCR not needed",
      };
    }
  } catch {
    parsedText = "";
    parsedTextSuspicious = false;
  }

  let reviewText = "";
  let reviewPageCount = parsedPageCount;
  let reviewMode: PdfReviewExtractionMode = "fallback";
  let reviewPreviewLimited = false;

  try {
    const review = await extractPdfReviewData(pdfPath, {
      maxPages: Math.max(1, Math.floor(options.maxFallbackPages ?? DEFAULT_FALLBACK_MAX_PAGES)),
      maxCharsPerPage: Math.max(
        500,
        Math.floor(options.maxFallbackCharsPerPage ?? DEFAULT_FALLBACK_MAX_CHARS_PER_PAGE),
      ),
      maxOcrPages: Math.max(
        0,
        Math.floor(options.maxFallbackOcrPages ?? DEFAULT_FALLBACK_MAX_OCR_PAGES),
      ),
      includeOcr: options.includeOcr !== false,
    });
    reviewText = extractTextFromReview(review);
    reviewPageCount = Math.max(1, Math.floor(review.pageCount || reviewPageCount || 1));
    reviewMode = review.extractionMode || "fallback";
    reviewPreviewLimited = Boolean(review.truncatedPages);
  } catch {
    reviewText = "";
    reviewPreviewLimited = false;
  }

  const chosen =
    parsedTextSuspicious && normalizeWhitespace(reviewText)
      ? { text: normalizeWhitespace(reviewText), source: "fallback" as const }
      : choosePreferredText(parsedText, reviewText);
  if (chosen.text && !isSuspiciousPdfText(chosen.text)) {
    const usingFallback = chosen.source === "fallback";
    return {
      text: chosen.text,
      pageCount: usingFallback ? reviewPageCount : parsedPageCount,
      extractionMode: usingFallback ? reviewMode : "pdf-parse",
      usedFallback: usingFallback,
      previewLimited: usingFallback ? reviewPreviewLimited : false,
      extractionStatus: usingFallback
        ? reviewPreviewLimited
          ? "preview"
          : reviewMode === "ocrmypdf" || reviewMode === "page-ocr"
            ? "ocr"
            : "recovered"
        : "complete",
      extractionNote: usingFallback
        ? reviewPreviewLimited
          ? "partial preview extracted from fallback reader; later pages were omitted"
          : reviewMode === "ocrmypdf"
            ? "complete via document OCR fallback"
            : reviewMode === "page-ocr"
              ? "complete via page OCR fallback"
              : "complete via fallback PDF text reader"
        : "complete via embedded text layer; OCR not needed",
    };
  }

  return {
    text: NO_DOCUMENT_TEXT_PLACEHOLDER,
    pageCount: Math.max(1, reviewPageCount || parsedPageCount || 1),
    extractionMode: reviewMode,
    usedFallback: true,
    previewLimited: reviewPreviewLimited,
    extractionStatus: "empty",
    extractionNote:
      parsedTextSuspicious || isSuspiciousPdfText(reviewText)
        ? "PDF text layer appears corrupted or mojibake; the file must be regenerated with an embedded Unicode font"
        : "no extractable PDF text found; OCR or alternate extraction may be required",
  };
}
