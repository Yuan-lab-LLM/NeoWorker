import { useCallback, useEffect, useRef, useState } from "react";

export const DOCUMENT_ZOOM_MIN = 50;
export const DOCUMENT_ZOOM_MAX = 250;
export const DOCUMENT_ZOOM_STEP = 10;

export function clampDocumentZoom(value: number): number {
  return Math.min(
    DOCUMENT_ZOOM_MAX,
    Math.max(DOCUMENT_ZOOM_MIN, Math.round(value)),
  );
}

export function getWheelZoomDelta(deltaY: number): number {
  if (!Number.isFinite(deltaY) || deltaY === 0) return 0;
  const magnitude = Math.min(12, Math.max(1, Math.abs(deltaY) * 0.12));
  return deltaY < 0 ? magnitude : -magnitude;
}

type ZoomAnchor = {
  x: number;
  y: number;
};

export function useDocumentZoom(resetKey: string, initialZoom = 100) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const initialZoomValue = clampDocumentZoom(initialZoom);
  const zoomRef = useRef(initialZoomValue);
  const [zoomPercent, setZoomPercent] = useState(initialZoomValue);

  const applyZoom = useCallback(
    (requestedZoom: number, requestedAnchor?: ZoomAnchor) => {
      const currentZoom = zoomRef.current;
      const nextZoom = clampDocumentZoom(requestedZoom);
      if (nextZoom === currentZoom) return;

      const container = containerRef.current;
      const anchor = container
        ? requestedAnchor || {
            x: container.clientWidth / 2,
            y: container.clientHeight / 2,
          }
        : null;
      const previousScrollLeft = container?.scrollLeft || 0;
      const previousScrollTop = container?.scrollTop || 0;
      const zoomRatio = nextZoom / currentZoom;

      zoomRef.current = nextZoom;
      setZoomPercent(nextZoom);

      if (!container || !anchor) return;
      window.requestAnimationFrame(() => {
        container.scrollLeft =
          (previousScrollLeft + anchor.x) * zoomRatio - anchor.x;
        container.scrollTop =
          (previousScrollTop + anchor.y) * zoomRatio - anchor.y;
      });
    },
    [],
  );

  const changeZoom = useCallback(
    (delta: number) => {
      applyZoom(zoomRef.current + delta);
    },
    [applyZoom],
  );

  const zoomIn = useCallback(() => {
    changeZoom(DOCUMENT_ZOOM_STEP);
  }, [changeZoom]);

  const zoomOut = useCallback(() => {
    changeZoom(-DOCUMENT_ZOOM_STEP);
  }, [changeZoom]);

  const resetZoom = useCallback(() => {
    applyZoom(initialZoomValue);
  }, [applyZoom, initialZoomValue]);

  useEffect(() => {
    zoomRef.current = initialZoomValue;
    setZoomPercent(initialZoomValue);
  }, [initialZoomValue, resetKey]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (event: WheelEvent) => {
      if (!event.metaKey && !event.ctrlKey) return;
      const delta = getWheelZoomDelta(event.deltaY);
      if (delta === 0) return;
      event.preventDefault();
      const rect = container.getBoundingClientRect();
      applyZoom(zoomRef.current + delta, {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      });
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, [applyZoom]);

  return {
    containerRef,
    zoomPercent,
    changeZoom,
    zoomIn,
    zoomOut,
    resetZoom,
  };
}
