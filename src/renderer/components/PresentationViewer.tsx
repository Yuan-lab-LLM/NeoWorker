import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FolderOpen,
  LoaderCircle,
  ZoomIn,
} from "lucide-react";
import type { FileViewerResult } from "../../electron/preload";
import { translate, useLanguage } from "../i18n";
import "./artifact-viewers.css";

export type PresentationPreview = NonNullable<
  NonNullable<FileViewerResult["data"]>["presentationPreview"]
>;

type PresentationViewerProps = {
  fileName: string;
  sizeLabel?: string;
  preview: PresentationPreview;
  onOpenExternal: () => void;
  onShowInFinder: () => void;
  showExternalActions?: boolean;
  extraActions?: ReactNode;
  className?: string;
};

const ZOOM_LEVELS = [75, 100, 125, 150] as const;

export function PresentationViewer({
  fileName,
  sizeLabel,
  preview,
  onOpenExternal,
  onShowInFinder,
  showExternalActions = true,
  extraActions,
  className,
}: PresentationViewerProps) {
  useLanguage();
  const t = translate;
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const [zoom, setZoom] = useState<(typeof ZOOM_LEVELS)[number]>(100);
  const slides = preview.slides;
  const activeSlide = slides[activeSlideIndex] || slides[0] || null;
  const renderedCount = useMemo(
    () =>
      slides.filter((slide) => Boolean(slide.imageUrl || slide.imageDataUrl))
        .length,
    [slides],
  );
  const isRenderingHighFidelity =
    preview.renderStatus === "rendering" && renderedCount === 0;
  const getSlideImageSource = (
    slide: PresentationPreview["slides"][number] | null | undefined,
  ) => slide?.imageUrl || slide?.imageDataUrl || "";

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") {
        setActiveSlideIndex((current) => Math.max(0, current - 1));
      }
      if (event.key === "ArrowRight") {
        setActiveSlideIndex((current) =>
          Math.min(slides.length - 1, current + 1),
        );
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [slides.length]);

  const canGoBack = activeSlideIndex > 0;
  const canGoForward = activeSlideIndex < slides.length - 1;
  const subtitle = [
    t("presentationViewer.slideCount", "{count} slides", {
      count: preview.slideCount,
    }),
    sizeLabel,
    preview.renderStatus === "rendered" || preview.renderStatus === "cached"
      ? t("presentationViewer.renderedCount", "{count} rendered", {
          count: renderedCount,
        })
      : preview.renderStatus === "rendering"
        ? t("presentationViewer.renderingPreviews", "Rendering previews")
        : t("presentationViewer.textPreview", "Text preview"),
  ]
    .filter(Boolean)
    .join(" • ");

  const goBack = () =>
    setActiveSlideIndex((current) => Math.max(0, current - 1));
  const goForward = () =>
    setActiveSlideIndex((current) => Math.min(slides.length - 1, current + 1));

  return (
    <div
      className={`presentation-viewer presentation-viewer-zoom-${zoom}${isRenderingHighFidelity ? " presentation-viewer-rendering" : ""}${className ? ` ${className}` : ""}`}
    >
      <aside
        className="presentation-viewer-sidebar"
        aria-label={t("presentationViewer.slides", "Slides")}
      >
        <div className="presentation-viewer-file">
          <div className="presentation-viewer-file-name" title={fileName}>
            {preview.title || fileName}
          </div>
          <div className="presentation-viewer-file-meta">{subtitle}</div>
        </div>
        <div className="presentation-viewer-thumbnails">
          {slides.map((slide, index) => (
            <button
              key={slide.index}
              type="button"
              className={`presentation-viewer-thumb ${index === activeSlideIndex ? "active" : ""}`}
              onClick={() => setActiveSlideIndex(index)}
              title={t("presentationViewer.slideTitle", "Slide {index}", {
                index: slide.index,
              })}
            >
              <span className="presentation-viewer-thumb-number">
                {slide.index}
              </span>
              {getSlideImageSource(slide) ? (
                <img
                  src={getSlideImageSource(slide)}
                  alt={t("presentationViewer.slideTitle", "Slide {index}", {
                    index: slide.index,
                  })}
                />
              ) : isRenderingHighFidelity ? (
                <span
                  className="presentation-viewer-thumb-placeholder"
                  aria-hidden="true"
                >
                  <span />
                  <span />
                  <span />
                </span>
              ) : (
                <span className="presentation-viewer-thumb-text">
                  {slide.title ||
                    slide.text ||
                    t("presentationViewer.blankSlide", "Blank slide")}
                </span>
              )}
            </button>
          ))}
        </div>
      </aside>

      <section
        className={`presentation-viewer-main${isRenderingHighFidelity ? " presentation-viewer-main-rendering" : ""}`}
      >
        <div className="presentation-viewer-toolbar">
          <div className="presentation-viewer-nav">
            <button
              type="button"
              className="presentation-viewer-icon-btn"
              onClick={goBack}
              disabled={!canGoBack}
              title={t("presentationViewer.previousSlide", "Previous slide")}
            >
              <ChevronLeft size={16} />
            </button>
            <span className="presentation-viewer-counter">
              {activeSlide ? activeSlideIndex + 1 : 0}/{slides.length}
            </span>
            <button
              type="button"
              className="presentation-viewer-icon-btn"
              onClick={goForward}
              disabled={!canGoForward}
              title={t("presentationViewer.nextSlide", "Next slide")}
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="presentation-viewer-actions">
            <label
              className="presentation-viewer-zoom"
              title={t("presentationViewer.zoom", "Zoom")}
            >
              <ZoomIn size={15} />
              <select
                value={zoom}
                onChange={(event) =>
                  setZoom(
                    Number(event.target.value) as (typeof ZOOM_LEVELS)[number],
                  )
                }
              >
                {ZOOM_LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {level}%
                  </option>
                ))}
              </select>
            </label>
            {extraActions}
            {showExternalActions && (
              <>
                <button
                  type="button"
                  className="presentation-viewer-icon-btn"
                  onClick={onShowInFinder}
                  title={t("presentationViewer.showInFinder", "Show in Finder")}
                >
                  <FolderOpen size={16} />
                </button>
                <button
                  type="button"
                  className="presentation-viewer-icon-btn"
                  onClick={onOpenExternal}
                  title={t(
                    "presentationViewer.openExternal",
                    "Open in external app",
                  )}
                >
                  <ExternalLink size={16} />
                </button>
              </>
            )}
          </div>
        </div>

        <div className="presentation-viewer-slide-stage">
          {getSlideImageSource(activeSlide) ? (
            <img
              src={getSlideImageSource(activeSlide)}
              alt={t("presentationViewer.slideTitle", "Slide {index}", {
                index: activeSlide.index,
              })}
              className="presentation-viewer-slide-image"
            />
          ) : isRenderingHighFidelity ? (
            <div
              className="presentation-viewer-loading-preview"
              role="status"
              aria-live="polite"
            >
              <LoaderCircle size={24} aria-hidden="true" />
              <strong>
                {t(
                  "presentationViewer.preparingPreview",
                  "Preparing slide preview",
                )}
              </strong>
              <span>
                {t(
                  "presentationViewer.firstRenderHint",
                  "The first render may take a moment. This presentation will open faster next time.",
                )}
              </span>
            </div>
          ) : (
            <div className="presentation-viewer-slide-text">
              <div className="presentation-viewer-slide-text-kicker">
                {t("presentationViewer.slideTitle", "Slide {index}", {
                  index: activeSlide?.index ?? 0,
                })}
              </div>
              <h3>
                {activeSlide?.title ||
                  t("presentationViewer.untitledSlide", "Untitled slide")}
              </h3>
              <pre>
                {activeSlide?.text ||
                  t(
                    "presentationViewer.noSlideText",
                    "No extractable slide text.",
                  )}
              </pre>
            </div>
          )}
        </div>

        {!isRenderingHighFidelity ? (
          <div className="presentation-viewer-notes">
            <div className="presentation-viewer-notes-title">
              {t("presentationViewer.speakerNotes", "Speaker notes")}
            </div>
            <pre>
              {activeSlide?.notes ||
                t("presentationViewer.noSpeakerNotes", "No speaker notes")}
            </pre>
          </div>
        ) : null}

        {preview.renderStatus !== "rendered" &&
        preview.renderStatus !== "cached" &&
        preview.renderMessage ? (
          <div className="presentation-viewer-render-note">
            {preview.renderMessage}
          </div>
        ) : null}
      </section>
    </div>
  );
}
