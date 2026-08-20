import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowUpRight,
  Clipboard,
  ExternalLink,
  FolderOpen,
} from "lucide-react";
import {
  canPreviewWebPageInApp,
  getWebPageFormatLabel,
} from "../../shared/web-page-formats";
import { translate, useLanguage } from "../i18n";
import { ArtifactDownloadButton } from "./ArtifactDownloadButton";

type WebArtifactCardProps = {
  filePath: string;
  workspacePath?: string;
  onOpenViewer?: (path: string) => void;
};

function getFileName(filePath: string): string {
  return filePath.split(/[\\/]/).pop() || filePath;
}

export function WebArtifactCard({
  filePath,
  workspacePath,
  onOpenViewer,
}: WebArtifactCardProps) {
  useLanguage();
  const t = translate;
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const actionsRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const fileName = getFileName(filePath);
  const formatLabel = getWebPageFormatLabel(filePath);
  const canOpenInViewer = canPreviewWebPageInApp(filePath);

  useEffect(() => {
    if (!menuOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (actionsRef.current?.contains(event.target as Node)) return;
      if (menuRef.current?.contains(event.target as Node)) return;
      setMenuOpen(false);
    };
    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) {
      setMenuPosition(null);
      return;
    }
    const updateMenuPosition = () => {
      const rect = actionsRef.current?.getBoundingClientRect();
      if (!rect) return;
      const menuWidth = 196;
      const viewportPadding = 12;
      const left = Math.min(
        Math.max(viewportPadding, rect.right - menuWidth),
        window.innerWidth - menuWidth - viewportPadding,
      );
      setMenuPosition({ top: rect.bottom + 6, left });
    };
    updateMenuPosition();
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [menuOpen]);

  const handleOpenViewer = () => {
    setMenuOpen(false);
    if (canOpenInViewer && onOpenViewer) {
      onOpenViewer(filePath);
      return;
    }
    void window.electronAPI.openFile(filePath, workspacePath);
  };

  const handleOpenBrowser = () => {
    setMenuOpen(false);
    void window.electronAPI.openFile(filePath, workspacePath);
  };

  const handleShowInFinder = () => {
    setMenuOpen(false);
    void window.electronAPI.showInFinder(filePath, workspacePath);
  };

  const handleCopyPath = () => {
    setMenuOpen(false);
    void navigator.clipboard?.writeText(filePath);
  };

  return (
    <div className="web-artifact-card">
      <div className="web-artifact-icon" aria-hidden="true">
        <span>W</span>
      </div>
      <button
        type="button"
        className="web-artifact-file"
        onClick={handleOpenViewer}
        title={fileName}
      >
        <span className="web-artifact-name">{fileName}</span>
        <span className="web-artifact-meta">
          {t("artifactCard.webMeta", "Web page · {format}", {
            format: formatLabel,
          })}
        </span>
      </button>
      <div className="web-artifact-actions" ref={actionsRef}>
        <button
          type="button"
          className="web-artifact-open"
          onClick={handleOpenViewer}
          title={t("artifactCard.openWebPreview", "Open web page preview")}
        >
          <ArrowUpRight size={18} strokeWidth={2} />
          <span>{t("common.open", "Open")}</span>
        </button>
        <button
          type="button"
          className="web-artifact-menu-btn"
          onClick={() => setMenuOpen((current) => !current)}
          title={t("artifactCard.openOptions", "Open options")}
          aria-label={t("artifactCard.openOptions", "Open options")}
          aria-expanded={menuOpen}
          aria-haspopup="menu"
        >
          <svg
            className="web-artifact-chevron-down"
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M3.5 5.25L7 8.75L10.5 5.25"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <ArtifactDownloadButton
          filePath={filePath}
          workspacePath={workspacePath}
        />
      </div>
      {menuOpen &&
        menuPosition &&
        createPortal(
          <div
            className="web-artifact-menu"
            ref={menuRef}
            role="menu"
            style={{
              position: "fixed",
              top: menuPosition.top,
              left: menuPosition.left,
              right: "auto",
            }}
          >
            <button type="button" role="menuitem" onClick={handleOpenBrowser}>
              <span className="web-artifact-app-icon browser">
                <ExternalLink size={14} />
              </span>
              {t("artifactCard.openInBrowser", "Open in browser")}
            </button>
            <button type="button" role="menuitem" onClick={handleCopyPath}>
              <span className="web-artifact-app-icon copy">
                <Clipboard size={14} />
              </span>
              {t("fileViewer.copyPath", "Copy path")}
            </button>
            <div className="web-artifact-menu-separator" />
            <button type="button" role="menuitem" onClick={handleShowInFinder}>
              <span className="web-artifact-app-icon finder">
                <FolderOpen size={14} />
              </span>
              {t("common.openInFolder", "Open in folder")}
            </button>
          </div>,
          document.body,
        )}
    </div>
  );
}
