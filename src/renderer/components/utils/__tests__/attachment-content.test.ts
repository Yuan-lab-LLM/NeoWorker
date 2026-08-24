import { describe, expect, it } from "vitest";

import {
  ATTACHMENT_CONTENT_END_MARKER,
  ATTACHMENT_CONTENT_START_MARKER,
  PDF_ATTACHMENT_EXCERPT_MAX_CHARS,
  PDF_UNTRUSTED_CONTENT_NOTICE,
  buildPdfAttachmentContent,
  extractAttachmentDetails,
  extractAttachmentNames,
  stripPptxBubbleContent,
  stripStrategyContextBlock,
} from "../attachment-content";

describe("attachment-content helpers", () => {
  it("strips strategy metadata blocks from rendered prompt text", () => {
    const input = `Build me a live dashboard showing system metrics

[AGENT_STRATEGY_CONTEXT_V1]
intent=execution
conversation_mode=task
[/AGENT_STRATEGY_CONTEXT_V1]`;

    expect(stripStrategyContextBlock(input)).toBe(
      "Build me a live dashboard showing system metrics",
    );
  });

  it("can remove strategy metadata after attachment cleanup", () => {
    const input = `Build me a live dashboard showing system metrics

[AGENT_STRATEGY_CONTEXT_V1]
intent=execution
[/AGENT_STRATEGY_CONTEXT_V1]

Attached files (relative to workspace):
- metrics.csv (text/csv)`;

    const cleaned = stripStrategyContextBlock(stripPptxBubbleContent(input));
    expect(cleaned).toBe("Build me a live dashboard showing system metrics");
  });

  it("formats text-layer PDF attachments with stable parse_document cues", () => {
    const content = buildPdfAttachmentContent({
      fileName: "report.pdf",
      relativePath: ".neoworker/uploads/123/report.pdf",
      summary: {
        pageCount: 2,
        nativeTextPages: 2,
        ocrPages: 0,
        scannedPages: 0,
        truncatedPages: false,
        extractionMode: "native",
        pages: [
          {
            pageIndex: 0,
            text: "Executive summary and financial highlights.",
            usedOcr: false,
            truncated: false,
          },
        ],
      },
    });

    expect(content).toContain("PDF attachment: report.pdf");
    expect(content).toContain("Path: .neoworker/uploads/123/report.pdf");
    expect(content).toContain("Pages: 2");
    expect(content).toContain("Extraction status: native text; mode=native");
    expect(content).toContain("call parse_document with the Path above");
    expect(content).toContain("Use read_pdf_visual only for layout");
    expect(content).toContain(PDF_UNTRUSTED_CONTENT_NOTICE);
    expect(content).toContain("[Page 1]");
    expect(content).toContain("Executive summary and financial highlights.");
  });

  it("formats scanned or OCR PDF attachments with OCR status", () => {
    const content = buildPdfAttachmentContent({
      fileName: "scan.pdf",
      relativePath: ".neoworker/uploads/123/scan.pdf",
      summary: {
        pageCount: 3,
        nativeTextPages: 0,
        ocrPages: 2,
        scannedPages: 3,
        truncatedPages: false,
        extractionMode: "page-ocr",
        imageHeavy: true,
        pages: [
          {
            pageIndex: 1,
            text: "Recognized receipt text.",
            usedOcr: true,
            truncated: false,
          },
        ],
      },
    });

    expect(content).toContain("Extraction status: ocr; mode=page-ocr");
    expect(content).toContain("[Page 2] [OCR]");
    expect(content).toContain("scanned_pages=3");
  });

  it("does not label zero-native-page image-heavy PDFs as native text", () => {
    const content = buildPdfAttachmentContent({
      fileName: "image-heavy.pdf",
      relativePath: ".neoworker/uploads/123/image-heavy.pdf",
      summary: {
        pageCount: 2,
        nativeTextPages: 0,
        ocrPages: 0,
        scannedPages: 1,
        truncatedPages: false,
        extractionMode: "native",
        imageHeavy: true,
        pages: [
          {
            pageIndex: 0,
            text: "[No extractable text found on this page.]",
            usedOcr: false,
            truncated: false,
          },
        ],
      },
    });

    expect(content).toContain("Extraction status: scan preview; mode=native");
    expect(content).not.toContain("Extraction status: native text");
  });

  it("truncates long PDF excerpts without losing the path", () => {
    const content = buildPdfAttachmentContent({
      fileName: "long.pdf",
      relativePath: ".neoworker/uploads/123/long.pdf",
      summary: {
        pageCount: 20,
        nativeTextPages: 20,
        ocrPages: 0,
        scannedPages: 0,
        truncatedPages: true,
        extractionMode: "native",
        pages: [
          {
            pageIndex: 0,
            text: "A".repeat(PDF_ATTACHMENT_EXCERPT_MAX_CHARS + 500),
            usedOcr: false,
            truncated: true,
          },
        ],
      },
    });

    expect(content).toContain("Path: .neoworker/uploads/123/long.pdf");
    expect(content).toContain("PDF excerpt truncated");
    expect(content.length).toBeLessThan(
      PDF_ATTACHMENT_EXCERPT_MAX_CHARS + 1000,
    );
  });

  it("extracts multiple attachment names when content blocks are present", () => {
    const input = `Read these files

Attached files (relative to workspace):
- report.pdf (.neoworker/uploads/123/report.pdf)
  Extracted content:
  ${ATTACHMENT_CONTENT_START_MARKER}
    PDF attachment: report.pdf
    Path: .neoworker/uploads/123/report.pdf
  ${ATTACHMENT_CONTENT_END_MARKER}

- data.csv (.neoworker/uploads/123/data.csv)
  Extracted content:
  ${ATTACHMENT_CONTENT_START_MARKER}
    a,b
  ${ATTACHMENT_CONTENT_END_MARKER}`;

    expect(extractAttachmentNames(input)).toEqual(["report.pdf", "data.csv"]);
  });

  it("extracts attachment paths, sizes, and MIME types for rich file cards", () => {
    const input = `分析一下

Attached files (relative to workspace):
- 项目说明.docx (.neoworker/inbox/attachments/weixin/项目说明.docx)
  Attachment metadata: size=27864; mime=application/vnd.openxmlformats-officedocument.wordprocessingml.document`;

    expect(extractAttachmentDetails(input)).toEqual([
      {
        name: "项目说明.docx",
        relativePath: ".neoworker/inbox/attachments/weixin/项目说明.docx",
        size: 27864,
        mimeType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      },
    ]);
  });

  it("keeps parenthesized image names intact so persisted thumbnails can be loaded", () => {
    const input = `这个是什么软件的logo，这个logo形象怎么样

Attached files (relative to workspace):
- ChatGPT Image 2026年8月17日 14_48_46 (1).png (.neoworker/uploads/1787390024805/ChatGPT Image 2026年8月17日 14_48_46 (1).png)
  Attachment metadata: size=1430232; mime=image/png`;

    expect(extractAttachmentDetails(input)).toEqual([
      {
        name: "ChatGPT Image 2026年8月17日 14_48_46 (1).png",
        relativePath:
          ".neoworker/uploads/1787390024805/ChatGPT Image 2026年8月17日 14_48_46 (1).png",
        size: 1430232,
        mimeType: "image/png",
      },
    ]);
  });

  it("resolves parenthesized attachment names stored at the workspace root", () => {
    const input = `Review the attachment

Attached files (relative to workspace):
- image (draft) (2).png (image (draft) (2).png)
  Attachment metadata: size=42; mime=image/png`;

    expect(extractAttachmentDetails(input)).toEqual([
      {
        name: "image (draft) (2).png",
        relativePath: "image (draft) (2).png",
        size: 42,
        mimeType: "image/png",
      },
    ]);
  });
});
