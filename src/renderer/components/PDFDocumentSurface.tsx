import { useEffect, useMemo, useRef, useState } from "react";
import type { PDFPageProxy, RenderTask } from "pdfjs-dist";
import type { PdfRegionSelection } from "../../shared/types";
import { translate, useLanguage } from "../i18n";
import { recordRendererPerfSample } from "../utils/renderer-perf";

export const PDF_INLINE_PREVIEW_MAX_BYTES = 10 * 1024 * 1024;
export const PDF_FIRST_PAINT_TARGET_MS = 1_500;
export const PDF_PAINT_FRAME_FALLBACK_MS = 120;

export function waitForPdfPaintOpportunity(): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    let frameId: number | null = null;
    let timeoutId: number | null = null;
    const finish = () => {
      if (settled) return;
      settled = true;
      if (frameId !== null) window.cancelAnimationFrame(frameId);
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      resolve();
    };

    timeoutId = window.setTimeout(finish, PDF_PAINT_FRAME_FALLBACK_MS);
    frameId = window.requestAnimationFrame(finish);
  });
}

export function estimatePdfBase64Bytes(base64: string): number {
  const payload = base64.includes(",")
    ? base64.slice(base64.indexOf(",") + 1)
    : base64;
  const compact = payload.replace(/\s/g, "");
  const padding = compact.endsWith("==") ? 2 : compact.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((compact.length * 3) / 4) - padding);
}

export function getPdfFirstPaintMetricName(decodedBytes: number): string {
  return decodedBytes <= PDF_INLINE_PREVIEW_MAX_BYTES
    ? "pdf.preview.first_canvas_under_10mb_ms"
    : "pdf.preview.first_canvas_over_10mb_ms";
}

type PdfPageRender = {
  width: number;
  height: number;
};

type PdfTextItem = {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

type PDFDocumentSurfaceProps = {
  fileName: string;
  pdfDataBase64: string;
  selection: PdfRegionSelection | null;
  onSelectionChange: (selection: PdfRegionSelection | null) => void;
  readOnly?: boolean;
  visiblePageIndex?: number | null;
  onPageCountChange?: (pageCount: number) => void;
  maxScale?: number;
  zoom?: number;
};

type DraftSelection = {
  pageIndex: number;
  x: number;
  y: number;
  w: number;
  h: number;
};

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function normalizeRect(x1: number, y1: number, x2: number, y2: number) {
  const left = Math.min(x1, x2);
  const top = Math.min(y1, y2);
  const width = Math.abs(x2 - x1);
  const height = Math.abs(y2 - y1);
  return { x: left, y: top, w: width, h: height };
}

export function PDFDocumentSurface({
  fileName,
  pdfDataBase64,
  selection,
  onSelectionChange,
  readOnly = false,
  visiblePageIndex = null,
  onPageCountChange,
  maxScale = 1.25,
  zoom = 1,
}: PDFDocumentSurfaceProps) {
  useLanguage();
  const t = translate;
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const pdfPages = useRef<PDFPageProxy[]>([]);
  const pageCanvases = useRef<Array<HTMLCanvasElement | null>>([]);
  const pageLayers = useRef<Array<HTMLDivElement | null>>([]);
  const pageTextItems = useRef<Array<PdfTextItem[]>>([]);
  const renderedPageKeys = useRef<string[]>([]);
  const previewStartedAtRef = useRef(0);
  const firstPagePaintRecordedRef = useRef(false);
  const dragStartRef = useRef<{
    pageIndex: number;
    x: number;
    y: number;
  } | null>(null);
  const [pageMetrics, setPageMetrics] = useState<PdfPageRender[]>([]);
  const [surfaceWidth, setSurfaceWidth] = useState(0);
  const [draftSelection, setDraftSelection] = useState<DraftSelection | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [renderablePageIndices, setRenderablePageIndices] = useState<
    Set<number>
  >(() => new Set([0]));

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;

    const measure = () => setSurfaceWidth(surface.clientWidth);
    measure();
    if (typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(measure);
    observer.observe(surface);
    return () => observer.disconnect();
  }, []);

  const pageRenders = useMemo(() => {
    const availableWidth =
      surfaceWidth > 0 ? surfaceWidth : Number.POSITIVE_INFINITY;
    return pageMetrics.map((page) => {
      const fitScale = Math.min(maxScale, availableWidth / page.width);
      const scale = fitScale * zoom;
      return {
        width: page.width * scale,
        height: page.height * scale,
      };
    });
  }, [maxScale, pageMetrics, surfaceWidth, zoom]);

  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => Promise<void>) | null = null;

    const renderPdf = async () => {
      previewStartedAtRef.current = performance.now();
      firstPagePaintRecordedRef.current = false;
      setLoading(true);
      setError(null);
      setPageMetrics([]);
      pdfPages.current = [];
      pageTextItems.current = [];
      renderedPageKeys.current = [];
      setRenderablePageIndices(new Set([0]));
      let firstPageReady = false;
      try {
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/legacy/build/pdf.worker.mjs",
          import.meta.url,
        ).toString();
        const loadingTask = pdfjs.getDocument({
          data: base64ToUint8Array(pdfDataBase64),
        });
        const document = await loadingTask.promise;
        if (!cancelled) {
          onPageCountChange?.(document.numPages);
        }
        cleanup = async () => {
          await loadingTask.destroy();
          if (typeof document.destroy === "function") {
            await document.destroy();
          }
        };

        const loadPage = async (pageIndex: number) => {
          const page = await document.getPage(pageIndex + 1);
          const viewport = page.getViewport({ scale: 1 });
          pdfPages.current[pageIndex] = page;
          const metric = { width: viewport.width, height: viewport.height };

          // Read-only preview surfaces do not support region selection, so text
          // extraction only adds latency without improving what the user sees.
          if (readOnly) {
            pageTextItems.current[pageIndex] = [];
            return metric;
          }

          const textContent = await page.getTextContent();
          const typedTextItems = (
            textContent.items as Array<{
              str?: unknown;
              transform: number[];
              width?: number;
              height?: number;
            }>
          )
            .filter(
              (item) =>
                typeof item.str === "string" && item.str.trim().length > 0,
            )
            .map((item) => {
              const text = item.str as string;
              const [x, y] = viewport.convertToViewportPoint(
                item.transform[4],
                item.transform[5],
              );
              return {
                str: text,
                x: x / viewport.width,
                y: y / viewport.height,
                width: Math.max(0, Number(item.width || 0)) / viewport.width,
                height: Math.max(0, Number(item.height || 0)) / viewport.height,
              };
            });
          pageTextItems.current[pageIndex] = typedTextItems;
          return metric;
        };

        // Make the first page available immediately. The previous implementation
        // waited for text extraction and metadata from every page before mounting
        // a single canvas, which made opening even small PDFs feel stalled.
        const firstMetric = await loadPage(0);
        if (cancelled) return;
        setPageMetrics([firstMetric]);
        setLoading(false);
        firstPageReady = true;

        if (document.numPages <= 1) return;

        // Give React a frame to mount and paint page one before preparing the
        // remaining page canvases in the background.
        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, 32);
        });

        const nextPages: PdfPageRender[] = [firstMetric];
        for (let pageIndex = 1; pageIndex < document.numPages; pageIndex += 1) {
          nextPages.push(await loadPage(pageIndex));
          if (cancelled) return;
        }
        if (!cancelled) {
          setPageMetrics(nextPages);
        }
      } catch (renderError: unknown) {
        if (!cancelled) {
          setError(
            renderError instanceof Error
              ? renderError.message
              : t("pdfSurface.error.render", "Failed to render PDF"),
          );
        }
      } finally {
        if (!cancelled && !firstPageReady) {
          setLoading(false);
        }
      }
    };

    void renderPdf();

    return () => {
      cancelled = true;
      if (cleanup) void cleanup();
    };
  }, [onPageCountChange, pdfDataBase64, readOnly]);

  useEffect(() => {
    if (pageRenders.length === 0) return;

    if (typeof visiblePageIndex === "number") {
      setRenderablePageIndices(new Set([visiblePageIndex]));
      return;
    }

    if (typeof IntersectionObserver === "undefined") {
      setRenderablePageIndices(new Set(pageRenders.map((_, index) => index)));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const newlyVisible = entries
          .filter((entry) => entry.isIntersecting)
          .map((entry) =>
            Number((entry.target as HTMLElement).dataset.pageIndex),
          )
          .filter(Number.isInteger);
        if (newlyVisible.length === 0) return;
        setRenderablePageIndices((current) => {
          const next = new Set(current);
          newlyVisible.forEach((pageIndex) => next.add(pageIndex));
          return next.size === current.size ? current : next;
        });
      },
      { rootMargin: "720px 0px" },
    );

    pageLayers.current.forEach((node, pageIndex) => {
      if (!node) return;
      node.dataset.pageIndex = String(pageIndex);
      observer.observe(node);
    });

    return () => observer.disconnect();
  }, [pageRenders.length, visiblePageIndex]);

  useEffect(() => {
    if (loading || pageRenders.length === 0) return;

    let cancelled = false;
    const renderTasks: RenderTask[] = [];

    const paintPages = async () => {
      // Electron can suspend requestAnimationFrame while a window is occluded.
      // Always retain a short timer fallback so a loaded PDF cannot remain a
      // permanently blank set of default-size canvases.
      await waitForPdfPaintOpportunity();
      for (let pageIndex = 0; pageIndex < pageRenders.length; pageIndex += 1) {
        if (cancelled) return;
        if (!renderablePageIndices.has(pageIndex)) continue;
        const page = pdfPages.current[pageIndex];
        const pageMetric = pageMetrics[pageIndex];
        const pageRender = pageRenders[pageIndex];
        const canvas = pageCanvases.current[pageIndex];
        if (!page || !pageMetric || !pageRender || !canvas) continue;

        const context = canvas.getContext("2d");
        if (!context) continue;
        const viewport = page.getViewport({
          scale: pageRender.width / pageMetric.width,
        });
        const devicePixelRatio = window.devicePixelRatio || 1;
        const renderKey = `${Math.round(viewport.width)}x${Math.round(viewport.height)}@${devicePixelRatio}`;
        if (renderedPageKeys.current[pageIndex] === renderKey) continue;
        canvas.width = Math.floor(viewport.width * devicePixelRatio);
        canvas.height = Math.floor(viewport.height * devicePixelRatio);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);

        const renderTask = page.render({
          canvas,
          canvasContext: context,
          viewport,
        });
        renderTasks.push(renderTask);
        try {
          await renderTask.promise;
          renderedPageKeys.current[pageIndex] = renderKey;
          if (pageIndex === 0 && !firstPagePaintRecordedRef.current) {
            firstPagePaintRecordedRef.current = true;
            recordRendererPerfSample(
              getPdfFirstPaintMetricName(estimatePdfBase64Bytes(pdfDataBase64)),
              performance.now() - previewStartedAtRef.current,
              true,
            );
          }
        } catch (renderError: unknown) {
          if (!cancelled) {
            setError(
              renderError instanceof Error
                ? renderError.message
                : t("pdfSurface.error.render", "Failed to render PDF"),
            );
          }
          return;
        }
      }
    };

    void paintPages();
    return () => {
      cancelled = true;
      renderTasks.forEach((task) => task.cancel());
    };
  }, [
    loading,
    pageMetrics,
    pageRenders,
    renderablePageIndices,
    visiblePageIndex,
  ]);

  const selectionStyle = useMemo(() => {
    const target = draftSelection || selection;
    if (!target) return null;
    return {
      left: `${target.x * 100}%`,
      top: `${target.y * 100}%`,
      width: `${target.w * 100}%`,
      height: `${target.h * 100}%`,
    };
  }, [draftSelection, selection]);

  const getSelectionExcerpt = (
    pageIndex: number,
    rect: DraftSelection,
  ): string => {
    const items = pageTextItems.current[pageIndex] || [];
    const page = pageRenders[pageIndex];
    if (!page) return "";
    const right = rect.x + rect.w;
    const bottom = rect.y + rect.h;
    const paddingX = 8 / page.width;
    const paddingY = 8 / page.height;
    const selected = items.filter((item) => {
      const itemRight = item.x + item.width;
      const itemBottom = item.y + item.height;
      return (
        item.x <= right + paddingX &&
        itemRight >= rect.x - paddingX &&
        item.y <= bottom + paddingY &&
        itemBottom >= rect.y - paddingY
      );
    });
    selected.sort((a, b) => a.y - b.y || a.x - b.x);
    return selected
      .map((item) => item.str)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  };

  const updateDraft = (pageIndex: number, clientX: number, clientY: number) => {
    const layer = pageLayers.current[pageIndex];
    const start = dragStartRef.current;
    if (!layer || !start || start.pageIndex !== pageIndex) return;
    const rect = layer.getBoundingClientRect();
    const currentX = (clientX - rect.left) / rect.width;
    const currentY = (clientY - rect.top) / rect.height;
    setDraftSelection({
      pageIndex,
      ...normalizeRect(start.x, start.y, currentX, currentY),
    });
  };

  const commitDraft = () => {
    if (readOnly) {
      dragStartRef.current = null;
      setDraftSelection(null);
      return;
    }
    if (!draftSelection || draftSelection.w < 0.01 || draftSelection.h < 0.01) {
      onSelectionChange(null);
      setDraftSelection(null);
      dragStartRef.current = null;
      return;
    }
    onSelectionChange({
      kind: "pdf",
      pageIndex: draftSelection.pageIndex,
      x: draftSelection.x,
      y: draftSelection.y,
      w: draftSelection.w,
      h: draftSelection.h,
      excerpt:
        getSelectionExcerpt(draftSelection.pageIndex, draftSelection) ||
        `${fileName} page ${draftSelection.pageIndex + 1}`,
    });
    setDraftSelection(null);
    dragStartRef.current = null;
  };

  return (
    <div className="pdf-document-surface" ref={surfaceRef} aria-busy={loading}>
      {loading ? (
        <div className="document-editor-empty">
          {t("pdfSurface.rendering", "Rendering PDF...")}
        </div>
      ) : error ? (
        <div className="document-editor-error">{error}</div>
      ) : (
        pageRenders.map((page, pageIndex) => {
          if (
            typeof visiblePageIndex === "number" &&
            pageIndex !== visiblePageIndex
          )
            return null;
          const showSelection =
            (draftSelection && draftSelection.pageIndex === pageIndex) ||
            (selection && selection.pageIndex === pageIndex);
          return (
            <div key={pageIndex} className="pdf-page-card">
              <div className="pdf-page-label">
                {t("pdfSurface.page", "Page {page}", { page: pageIndex + 1 })}
              </div>
              <div
                className="pdf-page-layer"
                ref={(node) => {
                  pageLayers.current[pageIndex] = node;
                }}
                style={{ width: `${page.width}px`, height: `${page.height}px` }}
                onPointerDown={
                  readOnly
                    ? undefined
                    : (event) => {
                        const rect =
                          event.currentTarget.getBoundingClientRect();
                        dragStartRef.current = {
                          pageIndex,
                          x: (event.clientX - rect.left) / rect.width,
                          y: (event.clientY - rect.top) / rect.height,
                        };
                        setDraftSelection({
                          pageIndex,
                          x: 0,
                          y: 0,
                          w: 0,
                          h: 0,
                        });
                        event.currentTarget.setPointerCapture(event.pointerId);
                        updateDraft(pageIndex, event.clientX, event.clientY);
                      }
                }
                onPointerMove={
                  readOnly
                    ? undefined
                    : (event) =>
                        updateDraft(pageIndex, event.clientX, event.clientY)
                }
                onPointerUp={
                  readOnly
                    ? undefined
                    : (event) => {
                        updateDraft(pageIndex, event.clientX, event.clientY);
                        event.currentTarget.releasePointerCapture(
                          event.pointerId,
                        );
                        commitDraft();
                      }
                }
              >
                <canvas
                  ref={(node) => {
                    pageCanvases.current[pageIndex] = node;
                  }}
                  className="pdf-page-canvas"
                />
                {!readOnly && showSelection && selectionStyle && (
                  <div className="pdf-selection-box" style={selectionStyle} />
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
