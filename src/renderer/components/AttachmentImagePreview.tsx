import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Download, ImageIcon, Minus, Plus, X } from "lucide-react";
import { translate, useLanguage } from "../i18n";
import "./attachment-image-preview.css";

const IMAGE_EXTENSION_MIME_TYPES: Record<string, string> = {
  avif: "image/avif",
  bmp: "image/bmp",
  gif: "image/gif",
  heic: "image/heic",
  heif: "image/heif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  svg: "image/svg+xml",
  tif: "image/tiff",
  tiff: "image/tiff",
  webp: "image/webp",
};

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.25;

export type AttachmentImagePreviewProps = {
  name: string;
  filePath?: string;
  workspacePath?: string;
  mimeType?: string;
  dataBase64?: string;
  sizeLabel?: string;
  variant?: "composer" | "message";
  onRemove?: () => void;
  removeDisabled?: boolean;
  onOpenFallback?: () => void;
};

const getFileExtension = (fileName: string): string => {
  const cleanName = fileName.split(/[?#]/, 1)[0] || "";
  const dotIndex = cleanName.lastIndexOf(".");
  return dotIndex >= 0 ? cleanName.slice(dotIndex + 1).toLowerCase() : "";
};

export const resolveImageMimeType = (fileName: string, mimeType?: string): string | null => {
  const normalizedMimeType = mimeType?.trim().toLowerCase();
  if (normalizedMimeType?.startsWith("image/")) return normalizedMimeType;
  return IMAGE_EXTENSION_MIME_TYPES[getFileExtension(fileName)] || null;
};

export const isPreviewableImageAttachment = (fileName: string, mimeType?: string): boolean =>
  Boolean(resolveImageMimeType(fileName, mimeType));

function clampZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

export function AttachmentImagePreview({
  name,
  filePath,
  workspacePath,
  mimeType,
  dataBase64,
  sizeLabel,
  variant = "composer",
  onRemove,
  removeDisabled = false,
  onOpenFallback,
}: AttachmentImagePreviewProps) {
  useLanguage();
  const imageMimeType = resolveImageMimeType(name, mimeType);
  const embeddedSource = useMemo(
    () => (dataBase64 && imageMimeType ? `data:${imageMimeType};base64,${dataBase64}` : ""),
    [dataBase64, imageMimeType],
  );
  const [displaySrc, setDisplaySrc] = useState(embeddedSource);
  const [loading, setLoading] = useState(Boolean(!embeddedSource && filePath && workspacePath));
  const [previewUnavailable, setPreviewUnavailable] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    if (embeddedSource) {
      setDisplaySrc(embeddedSource);
      setLoading(false);
      setPreviewUnavailable(false);
      return;
    }

    if (!filePath || !workspacePath || !imageMimeType) {
      setDisplaySrc("");
      setLoading(false);
      setPreviewUnavailable(true);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setPreviewUnavailable(false);
    setDisplaySrc("");

    window.electronAPI
      .readFileForViewer(filePath, workspacePath, {
        includeImageContent: true,
        enableImageOcr: false,
        includePdfAnalysis: false,
      })
      .then((response) => {
        if (cancelled) return;
        if (response.success && response.data?.fileType === "image" && response.data.content) {
          setDisplaySrc(response.data.content);
          return;
        }
        setPreviewUnavailable(true);
      })
      .catch(() => {
        if (!cancelled) setPreviewUnavailable(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [embeddedSource, filePath, imageMimeType, workspacePath]);

  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
      if (event.key === "+" || event.key === "=") {
        setZoom((current) => clampZoom(current + ZOOM_STEP));
      }
      if (event.key === "-") {
        setZoom((current) => clampZoom(current - ZOOM_STEP));
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const openPreview = () => {
    if (!displaySrc) {
      onOpenFallback?.();
      return;
    }
    setZoom(1);
    setIsOpen(true);
  };

  const meta = [imageMimeType?.split("/")[1]?.toUpperCase(), sizeLabel].filter(Boolean).join(" · ");
  const previewLabel = translate("attachmentImagePreview.openNamed", "Preview {name}", { name });

  return (
    <>
      <div className={`attachment-image-preview attachment-image-preview--${variant}`}>
        <button
          type="button"
          className="attachment-image-preview-trigger"
          onClick={openPreview}
          aria-label={previewLabel}
          title={previewLabel}
        >
          <span className="attachment-image-preview-media" aria-hidden="true">
            {displaySrc ? (
              <img src={displaySrc} alt="" draggable={false} />
            ) : (
              <span
                className={`attachment-image-preview-placeholder ${loading ? "is-loading" : ""}`}
              >
                <ImageIcon size={22} strokeWidth={1.8} />
              </span>
            )}
          </span>
          <span className="attachment-image-preview-copy">
            <span className="attachment-image-preview-name">{name}</span>
            <span className="attachment-image-preview-meta">
              {loading
                ? translate("attachmentImagePreview.loading", "Loading preview…")
                : previewUnavailable
                  ? translate("attachmentImagePreview.unavailable", "Preview unavailable")
                  : meta}
            </span>
          </span>
        </button>
        {onRemove ? (
          <button
            type="button"
            className="attachment-image-preview-remove"
            onClick={onRemove}
            disabled={removeDisabled}
            aria-label={translate("composer.removeAttachmentNamed", "Remove attachment {name}", {
              name,
            })}
            title={translate("composer.removeAttachment", "Remove attachment")}
          >
            <X size={15} strokeWidth={2} aria-hidden="true" />
          </button>
        ) : null}
      </div>

      {isOpen &&
        displaySrc &&
        createPortal(
          <div
            className="attachment-image-lightbox"
            role="dialog"
            aria-modal="true"
            aria-label={previewLabel}
            onClick={() => setIsOpen(false)}
          >
            <div className="attachment-image-lightbox-actions">
              <a
                className="attachment-image-lightbox-action"
                href={displaySrc}
                download={name || "image"}
                aria-label={translate("fileViewer.downloadImageNamed", "Download {name}", { name })}
                title={translate("fileViewer.downloadImage", "Download image")}
                onClick={(event) => event.stopPropagation()}
              >
                <Download size={21} strokeWidth={2} aria-hidden="true" />
              </a>
              <button
                type="button"
                className="attachment-image-lightbox-action"
                onClick={() => setIsOpen(false)}
                aria-label={translate("attachmentImagePreview.close", "Close image preview")}
                title={translate("common.close", "Close")}
              >
                <X size={23} strokeWidth={2} aria-hidden="true" />
              </button>
            </div>
            <div
              className="attachment-image-lightbox-stage"
              onClick={(event) => event.stopPropagation()}
            >
              <img
                src={displaySrc}
                alt={name}
                draggable={false}
                style={{ transform: `scale(${zoom})` }}
              />
            </div>
            <div
              className="attachment-image-lightbox-zoom"
              onClick={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setZoom((current) => clampZoom(current - ZOOM_STEP))}
                disabled={zoom <= MIN_ZOOM}
                aria-label={translate("common.zoomOut", "Zoom out")}
              >
                <Minus size={19} aria-hidden="true" />
              </button>
              <span aria-live="polite">{Math.round(zoom * 100)}%</span>
              <button
                type="button"
                onClick={() => setZoom((current) => clampZoom(current + ZOOM_STEP))}
                disabled={zoom >= MAX_ZOOM}
                aria-label={translate("common.zoomIn", "Zoom in")}
              >
                <Plus size={19} aria-hidden="true" />
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
