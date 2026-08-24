import { afterEach, describe, expect, it, vi } from "vitest";

import {
  estimatePdfBase64Bytes,
  getPdfFirstPaintMetricName,
  PDF_FIRST_PAINT_TARGET_MS,
  PDF_INLINE_PREVIEW_MAX_BYTES,
  PDF_PAINT_FRAME_FALLBACK_MS,
  waitForPdfPaintOpportunity,
} from "../PDFDocumentSurface";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("PDF preview performance contract", () => {
  it("tracks the first painted canvas for PDFs up to 10 MB", () => {
    expect(PDF_INLINE_PREVIEW_MAX_BYTES).toBe(10 * 1024 * 1024);
    expect(PDF_FIRST_PAINT_TARGET_MS).toBe(1_500);
    expect(getPdfFirstPaintMetricName(PDF_INLINE_PREVIEW_MAX_BYTES)).toBe(
      "pdf.preview.first_canvas_under_10mb_ms",
    );
    expect(getPdfFirstPaintMetricName(PDF_INLINE_PREVIEW_MAX_BYTES + 1)).toBe(
      "pdf.preview.first_canvas_over_10mb_ms",
    );
  });

  it("estimates decoded bytes for raw and data-url base64", () => {
    expect(estimatePdfBase64Bytes("YQ==")).toBe(1);
    expect(estimatePdfBase64Bytes("data:application/pdf;base64,YWI=")).toBe(2);
  });

  it("falls back to a timer when Electron does not deliver an animation frame", async () => {
    vi.useFakeTimers();
    const cancelAnimationFrame = vi.fn();
    vi.stubGlobal("window", {
      requestAnimationFrame: vi.fn(() => 42),
      cancelAnimationFrame,
      setTimeout,
      clearTimeout,
    });

    let resolved = false;
    const pending = waitForPdfPaintOpportunity().then(() => {
      resolved = true;
    });
    await vi.advanceTimersByTimeAsync(PDF_PAINT_FRAME_FALLBACK_MS - 1);
    expect(resolved).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await pending;

    expect(resolved).toBe(true);
    expect(cancelAnimationFrame).toHaveBeenCalledWith(42);
  });
});
