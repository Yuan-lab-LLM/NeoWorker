import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { extractPdfTextMock } = vi.hoisted(() => ({
  extractPdfTextMock: vi.fn(),
}));

vi.mock("../../../utils/pdf-text", () => ({
  extractPdfText: extractPdfTextMock,
}));

import { DocumentParserTools } from "../document-parser-tools";

describe("DocumentParserTools", () => {
  let tmpDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "neoworker-document-parser-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("uses the plain PDF text extractor for parse_document", async () => {
    const pdfPath = path.join(tmpDir, "book.pdf");
    fs.writeFileSync(pdfPath, Buffer.from("%PDF-1.7"));
    extractPdfTextMock.mockResolvedValue({
      text: "Le texte du livre est clair.",
      pageCount: 4,
      extractionMode: "pdf-parse",
      usedFallback: false,
      previewLimited: false,
      extractionStatus: "complete",
      extractionNote: "complete via embedded text layer; OCR not needed",
    });

    const tools = new DocumentParserTools({
      id: "ws-1",
      name: "Test Workspace",
      path: tmpDir,
      createdAt: Date.now(),
      permissions: {
        read: true,
        write: true,
        delete: true,
        network: false,
        shell: false,
        allowedPaths: [],
      },
    } as Any);

    const result = await tools.parseDocument({ path: "book.pdf" });

    expect(result.content).toBe("Le texte du livre est clair.");
    expect(result.detected_type).toBe("pdf");
    expect(result.pdf_extraction).toEqual({
      status: "complete",
      mode: "pdf-parse",
      used_fallback: false,
      preview_limited: false,
      note: "complete via embedded text layer; OCR not needed",
      page_count: 4,
    });
    expect(extractPdfTextMock).toHaveBeenCalledWith(fs.realpathSync(pdfPath), {
      includeOcr: true,
      maxFallbackPages: 16,
      maxFallbackCharsPerPage: 1600,
      maxFallbackOcrPages: 4,
    });
  });

  it("rejects missing documents with a clear error", async () => {
    const tools = new DocumentParserTools({
      id: "ws-1",
      name: "Test Workspace",
      path: tmpDir,
      createdAt: Date.now(),
      permissions: {
        read: true,
        write: true,
        delete: true,
        network: false,
        shell: false,
        allowedPaths: [],
      },
    } as Any);

    await expect(tools.parseDocument({ path: "missing.pdf" })).rejects.toThrow(/file not found/i);
  });

  it("reads plain text documents without using the PDF extractor", async () => {
    const textPath = path.join(tmpDir, "notes.txt");
    fs.writeFileSync(textPath, "Plain text note.");

    const tools = new DocumentParserTools({
      id: "ws-1",
      name: "Test Workspace",
      path: tmpDir,
      createdAt: Date.now(),
      permissions: {
        read: true,
        write: true,
        delete: true,
        network: false,
        shell: false,
        allowedPaths: [],
      },
    } as Any);

    const result = await tools.parseDocument({ path: "notes.txt" });

    expect(result.content).toBe("Plain text note.");
    expect(result.detected_type).toBe("txt");
    expect(extractPdfTextMock).toHaveBeenCalledTimes(0);
  });
});
