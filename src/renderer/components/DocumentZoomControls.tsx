import { ZoomIn, ZoomOut } from "lucide-react";
import { DOCUMENT_ZOOM_MAX, DOCUMENT_ZOOM_MIN } from "../hooks/useDocumentZoom";
import { translate, useLanguage } from "../i18n";
import "./document-zoom-controls.css";

type DocumentZoomControlsProps = {
  value: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  compact?: boolean;
};

export function DocumentZoomControls({
  value,
  onZoomIn,
  onZoomOut,
  onReset,
  compact = false,
}: DocumentZoomControlsProps) {
  useLanguage();
  const t = translate;
  const gestureHint = t(
    "documentViewer.zoomGestureHint",
    "Hold down Command or Control to scroll, or pinch with two fingers on the trackpad",
  );

  return (
    <div
      className={`document-zoom-controls ${compact ? "is-compact" : ""}`}
      role="group"
      aria-label={`${t("documentViewer.zoomControls", "Document zoom control")}。${gestureHint}`}
      title={gestureHint}
    >
      <button
        type="button"
        className="document-zoom-button"
        onClick={onZoomOut}
        disabled={value <= DOCUMENT_ZOOM_MIN}
        title={t("documentViewer.zoomOut", "zoom out")}
        aria-label={t("documentViewer.zoomOut", "zoom out")}
      >
        <ZoomOut size={14} aria-hidden="true" />
      </button>
      <button
        type="button"
        className="document-zoom-value"
        onClick={onReset}
        title={t("documentViewer.resetZoom", "Recovery 100%")}
        aria-label={t(
          "documentViewer.resetZoomCurrent",
          "Reset to 100%; current zoom is {value}%",
          { value },
        )}
      >
        {value}%
      </button>
      <button
        type="button"
        className="document-zoom-button"
        onClick={onZoomIn}
        disabled={value >= DOCUMENT_ZOOM_MAX}
        title={t("documentViewer.zoomIn", "Zoom in")}
        aria-label={t("documentViewer.zoomIn", "Zoom in")}
      >
        <ZoomIn size={14} aria-hidden="true" />
      </button>
    </div>
  );
}
