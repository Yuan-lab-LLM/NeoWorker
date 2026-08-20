import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { ExternalLink } from "lucide-react";
import type { FileViewerResult } from "../../electron/preload";
import {
  applyRichFrameDesignLanguage,
  type RichFrameDesignOptions,
  type RichFrameTheme,
} from "../../shared/rich-frame-design-language";
import { repairHiddenHtmlContent } from "../../shared/html-content-visibility";
import { translate, useLanguage } from "../i18n";

type InlineHtmlPreviewVariant = "default" | "frame";

type InlineHtmlPreviewProps = {
  filePath: string;
  workspacePath: string;
  title?: string;
  className?: string;
  variant?: InlineHtmlPreviewVariant;
  frameHeight?: string;
  aspectRatio?: string;
  showChrome?: boolean;
  onOpenViewer?: (path: string) => void;
};

type InlineHtmlSourcePreviewProps = {
  htmlContent: string;
  title?: string;
  className?: string;
  variant?: InlineHtmlPreviewVariant;
  frameHeight?: string;
  aspectRatio?: string;
  showChrome?: boolean;
};

const formatFileSize = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
};

function extractHtmlTitle(htmlContent: string): string {
  const titleMatch = htmlContent.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch?.[1]
    ?.replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (title) return title;

  const headingMatch = htmlContent.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  const heading = headingMatch?.[1]
    ?.replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return heading || "Interactive HTML";
}

export function isBootstrapHtmlPlaceholder(htmlContent: string): boolean {
  const content = String(htmlContent || "").trim();
  return (
    content.length <= 1024 &&
    /<p\b[^>]*>\s*Bootstrap artifact stub\.\s*<\/p>/i.test(content)
  );
}

function normalizeCssLength(value?: string): string | undefined {
  const trimmed = String(value || "").trim();
  if (!trimmed) return undefined;
  if (/^\d{2,4}$/.test(trimmed)) return `${trimmed}px`;
  if (/^\d+(?:\.\d+)?(?:px|rem|em|vh|vw|%)$/.test(trimmed)) return trimmed;
  if (/^clamp\([a-z0-9.,\s%()+\-*/]{1,120}\)$/i.test(trimmed)) return trimmed;
  return undefined;
}

function normalizeAspectRatio(value?: string): string | undefined {
  const trimmed = String(value || "").trim();
  if (!trimmed) return undefined;
  if (/^\d+(?:\.\d+)?\s*\/\s*\d+(?:\.\d+)?$/.test(trimmed)) return trimmed;
  if (/^\d+(?:\.\d+)?$/.test(trimmed)) return trimmed;
  return undefined;
}

function getCurrentRichFrameTheme(): RichFrameTheme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.classList.contains("theme-light")
    ? "light"
    : "dark";
}

function getCurrentRichFrameHostBackground(): string {
  return "transparent";
}

function useRichFrameDesignOptions(enabled: boolean): RichFrameDesignOptions {
  const [options, setOptions] = useState<RichFrameDesignOptions>(() => ({
    theme: getCurrentRichFrameTheme(),
    hostBackground: getCurrentRichFrameHostBackground(),
  }));

  useEffect(() => {
    if (!enabled || typeof document === "undefined") return;

    const root = document.documentElement;
    const updateOptions = () =>
      setOptions({
        theme: getCurrentRichFrameTheme(),
        hostBackground: getCurrentRichFrameHostBackground(),
      });
    updateOptions();

    const observer = new MutationObserver(updateOptions);
    observer.observe(root, { attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, [enabled]);

  return options;
}

function buildFrameStyle({
  frameHeight,
  aspectRatio,
}: {
  frameHeight?: string;
  aspectRatio?: string;
}): CSSProperties | undefined {
  const height = normalizeCssLength(frameHeight);
  const ratio = normalizeAspectRatio(aspectRatio);
  if (!height && !ratio) return undefined;
  return {
    ...(height || ratio
      ? ({ "--inline-html-frame-height": height || "auto" } as CSSProperties)
      : {}),
    ...(ratio
      ? ({ "--inline-html-frame-aspect-ratio": ratio } as CSSProperties)
      : {}),
  };
}

function InlineHtmlHeader({
  displayTitle,
  subtitle,
  onOpen,
}: {
  displayTitle: string;
  subtitle?: string;
  onOpen?: () => void;
}) {
  useLanguage();
  const t = translate;
  return (
    <div className="inline-html-header">
      <div className="inline-html-header-left">
        <div className="inline-html-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M4 4h16v16H4z" stroke="currentColor" strokeWidth="2" />
            <path
              d="m9 10-2 2 2 2M15 10l2 2-2 2M13 8l-2 8"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <div className="inline-html-name-wrap">
          <div className="inline-html-filename" title={displayTitle}>
            {displayTitle}
          </div>
          {subtitle && <div className="inline-html-subtitle">{subtitle}</div>}
        </div>
      </div>
      {onOpen && (
        <div className="inline-html-header-actions">
          <button
            className="inline-html-action-btn"
            type="button"
            onClick={onOpen}
            title={t("inlinePreview.openPreview", "Open preview")}
            aria-label={t(
              "inlinePreview.html.openPreview",
              "Open HTML preview",
            )}
          >
            <ExternalLink size={16} strokeWidth={2.25} aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}

export function InlineHtmlSourcePreview({
  htmlContent,
  title,
  className = "",
  variant = "default",
  frameHeight,
  aspectRatio,
  showChrome = false,
}: InlineHtmlSourcePreviewProps) {
  useLanguage();
  const t = translate;
  const displayTitle = title || extractHtmlTitle(htmlContent);
  const isFrame = variant === "frame";
  const hideChrome = isFrame && !showChrome;
  const style = buildFrameStyle({ frameHeight, aspectRatio });
  const frameDesignOptions = useRichFrameDesignOptions(isFrame);
  const previewHtmlContent = useMemo(
    () => {
      const designedContent = isFrame
        ? applyRichFrameDesignLanguage(htmlContent, frameDesignOptions)
        : htmlContent;
      return repairHiddenHtmlContent(designedContent).content;
    },
    [frameDesignOptions, htmlContent, isFrame],
  );
  const isBootstrapPlaceholder = isBootstrapHtmlPlaceholder(htmlContent);

  return (
    <div
      className={`inline-html-preview inline-html-preview-source ${isFrame ? "inline-html-preview-frame" : ""} ${className}`.trim()}
      style={style}
    >
      {!hideChrome && (
        <InlineHtmlHeader
          displayTitle={displayTitle}
          subtitle={
            isFrame
              ? t("inlinePreview.html.frame", "Frame")
              : t("inlinePreview.html.form", "HTML form")
          }
        />
      )}
      {isBootstrapPlaceholder ? (
        <div className="inline-html-loading" role="status">
          {t("inlinePreview.html.preparing", "Preparing HTML preview…")}
        </div>
      ) : (
        <div className="inline-html-frame-wrap">
          <iframe
            className="inline-html-frame"
            srcDoc={previewHtmlContent}
            sandbox="allow-scripts allow-forms"
            title={displayTitle}
          />
        </div>
      )}
    </div>
  );
}

export function InlineHtmlPreview({
  filePath,
  workspacePath,
  title,
  className = "",
  variant = "default",
  frameHeight,
  aspectRatio,
  showChrome = false,
  onOpenViewer,
}: InlineHtmlPreviewProps) {
  useLanguage();
  const t = translate;
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<FileViewerResult["data"] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const subtitle = useMemo(() => {
    if (!result) return "";
    return ["HTML", formatFileSize(result.size)].filter(Boolean).join(" • ");
  }, [result]);

  const displayTitle =
    title || result?.fileName || filePath.split("/").pop() || filePath;
  const isFrame = variant === "frame";
  const hideChrome = isFrame && !showChrome;
  const style = buildFrameStyle({ frameHeight, aspectRatio });
  const frameDesignOptions = useRichFrameDesignOptions(isFrame);
  const previewHtmlContent = useMemo(() => {
    const htmlContent = result?.htmlContent || "";
    const designedContent = isFrame
      ? applyRichFrameDesignLanguage(htmlContent, frameDesignOptions)
      : htmlContent;
    return repairHiddenHtmlContent(designedContent).content;
  }, [frameDesignOptions, isFrame, result?.htmlContent]);
  const isBootstrapPlaceholder = isBootstrapHtmlPlaceholder(
    result?.htmlContent || "",
  );

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setLoading(true);
      setError(null);
      setResult(null);

      try {
        const response = await window.electronAPI.readFileForViewer(
          filePath,
          workspacePath,
        );
        if (cancelled) return;
        if (!response.success || !response.data) {
          setError(response.error || "Failed to load HTML preview");
          return;
        }
        if (response.data.fileType !== "html" || !response.data.htmlContent) {
          setError("File is not a previewable HTML document.");
          return;
        }
        setResult(response.data);
      } catch (e: unknown) {
        if (cancelled) return;
        setError(
          e instanceof Error ? e.message : "Failed to load HTML preview",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    if (filePath && workspacePath) {
      void run();
    } else {
      setLoading(false);
    }

    return () => {
      cancelled = true;
    };
  }, [filePath, workspacePath]);

  useEffect(() => {
    if (!isBootstrapPlaceholder || !filePath || !workspacePath) return;

    let cancelled = false;
    const interval = window.setInterval(() => {
      if (document.visibilityState === "hidden") return;
      void window.electronAPI
        .readFileForViewer(filePath, workspacePath)
        .then((response) => {
          if (
            cancelled ||
            !response.success ||
            !response.data?.htmlContent ||
            isBootstrapHtmlPlaceholder(response.data.htmlContent)
          ) {
            return;
          }
          setResult(response.data);
        })
        .catch(() => {
          // The normal error surface remains authoritative. A transient refresh
          // failure should not replace the compact "preparing" state.
        });
    }, 2000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [filePath, isBootstrapPlaceholder, workspacePath]);

  const handleOpen = async () => {
    if (onOpenViewer) {
      onOpenViewer(filePath);
      return;
    }
    try {
      await window.electronAPI.openFile(filePath, workspacePath);
    } catch (e) {
      console.error("Failed to open HTML preview:", e);
    }
  };

  return (
    <div
      className={`inline-html-preview ${isFrame ? "inline-html-preview-frame" : ""} ${className}`.trim()}
      style={style}
    >
      {loading && (
        <div className="inline-html-loading">Loading HTML preview…</div>
      )}

      {!loading && error && <div className="inline-html-error">{error}</div>}

      {!loading && !error && isBootstrapPlaceholder && (
        <div className="inline-html-loading" role="status">
          {t("inlinePreview.html.preparing", "Preparing HTML preview…")}
        </div>
      )}

      {!loading && !error && !isBootstrapPlaceholder && previewHtmlContent && (
        <>
          {!hideChrome && (
            <InlineHtmlHeader
              displayTitle={displayTitle}
              subtitle={subtitle}
              onOpen={handleOpen}
            />
          )}

          <div className="inline-html-frame-wrap">
            <iframe
              className="inline-html-frame"
              srcDoc={previewHtmlContent}
              sandbox="allow-scripts allow-forms"
              title={displayTitle}
            />
          </div>
        </>
      )}
    </div>
  );
}
