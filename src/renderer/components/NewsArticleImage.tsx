import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Maximize2, X, ZoomIn, ZoomOut } from "lucide-react";
import type { PaperNewsCover, PaperNewsItem } from "../../shared/paper-news";
import { useLanguage } from "../i18n";
import { NewsSourceBrand } from "./NewsSourceBrand";

function NewsImageDialog({
  cover,
  title,
  onClose,
}: {
  cover: PaperNewsCover;
  title: string;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [zoom, setZoom] = useState(false);
  const zh = useLanguage() === "zh-CN";
  useEffect(() => {
    const element = dialog.current;
    const opener = document.activeElement;
    element?.showModal();
    return () => {
      element?.close();
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);
  return createPortal(
    <dialog
      ref={dialog}
      className="pn-image-dialog"
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header>
        <strong>{title}</strong>
        <button
          onClick={() => setZoom((value) => !value)}
          aria-label={
            zh
              ? zoom
                ? "适应窗口"
                : "放大图片"
              : zoom
                ? "Fit image"
                : "Zoom image"
          }
        >
          {zoom ? <ZoomOut size={20} /> : <ZoomIn size={20} />}
        </button>
        <button
          autoFocus
          onClick={onClose}
          aria-label={zh ? "关闭图片" : "Close image"}
        >
          <X size={20} />
        </button>
      </header>
      <div className={`pn-image-dialog-body${zoom ? " is-zoomed" : ""}`}>
        <img src={cover.dataUrl} alt={title} />
      </div>
    </dialog>,
    document.body,
  );
}

/** Only display media retrieved from this article; never substitute category artwork. */
export function NewsArticleImage({
  item,
  sourceLabel,
  cover,
  loading = false,
  onError,
}: {
  item: PaperNewsItem;
  sourceLabel: string;
  cover: PaperNewsCover | null;
  loading?: boolean;
  onError: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const zh = useLanguage() === "zh-CN";
  if (!cover) {
    return (
      <div
        className={`pn-article-image pn-image-empty${loading ? " is-loading" : ""}`}
        aria-busy={loading}
      >
        <div className="pn-source-cover-identity">
          <NewsSourceBrand source={item.source} />
          <small>{sourceLabel}</small>
        </div>
      </div>
    );
  }
  return (
    <>
      <button
        className="pn-article-image"
        onClick={() => setExpanded(true)}
        aria-label={`${zh ? "放大配图" : "Enlarge image"} · ${item.title}`}
      >
        <img src={cover.dataUrl} alt="" loading="lazy" decoding="async" onError={() => {
          setExpanded(false);
          onError();
        }} />
        {cover.kind === "pdf-page" && <small className="pn-image-origin">{zh ? "论文首页" : "Paper first page"}</small>}
        <span>
          <Maximize2 size={14} />
          {zh ? "查看大图" : "Enlarge"}
        </span>
      </button>
      {expanded && (
        <NewsImageDialog
          cover={cover}
          title={item.title}
          onClose={() => setExpanded(false)}
        />
      )}
    </>
  );
}
