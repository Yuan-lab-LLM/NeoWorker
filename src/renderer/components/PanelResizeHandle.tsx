import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./panel-resize.css";

export function usePanelWidth(key: string, fallback: number) {
  const [width, setWidth] = useState(() => {
    try {
      const value = Number(localStorage.getItem(key));
      return value >= 25 && value <= 85 ? value : fallback;
    } catch {
      return fallback;
    }
  });
  return [
    width,
    (value: number) => {
      setWidth(value);
      try {
        localStorage.setItem(key, String(value));
      } catch {
        /* Session resizing still works. */
      }
    },
  ] as const;
}

/** The handle belongs to the right pane; its parent is the split container. */
export function PanelResizeHandle({
  value,
  onChange,
  label,
  min = 30,
  max = 85,
}: {
  value: number;
  onChange: (value: number) => void;
  label: string;
  min?: number;
  max?: number;
}) {
  const [dragging, setDragging] = useState(false);
  const start = useRef({ x: 0, value: 0, width: 1 });
  const clamp = (n: number) =>
    Math.round(Math.max(min, Math.min(max, n)) * 10) / 10;
  return (
    <>
      <div
        className="nw-panel-resize"
        role="separator"
        aria-label={label}
        aria-orientation="vertical"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={Math.round(value)}
        tabIndex={0}
        title={`${label} · 拖动或使用左右方向键`}
        onKeyDown={(e) => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key))
            return;
          e.preventDefault();
          onChange(
            clamp(
              e.key === "Home"
                ? min
                : e.key === "End"
                  ? max
                  : value + (e.key === "ArrowLeft" ? 2 : -2),
            ),
          );
        }}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.preventDefault();
          start.current = {
            x: e.clientX,
            value,
            width:
              e.currentTarget.parentElement?.parentElement?.clientWidth || 1,
          };
          setDragging(true);
        }}
      >
        <span />
      </div>
      {dragging &&
        createPortal(
          <div
            className="nw-panel-resize-shield"
            onPointerMove={(e) =>
              onChange(
                clamp(
                  start.current.value +
                    ((start.current.x - e.clientX) / start.current.width) * 100,
                ),
              )
            }
            onPointerUp={() => setDragging(false)}
            onPointerCancel={() => setDragging(false)}
            onPointerLeave={() => setDragging(false)}
          />,
          document.body,
        )}
    </>
  );
}
