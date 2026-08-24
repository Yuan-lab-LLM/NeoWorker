import { useEffect, useMemo, useState } from "react";
import type { FileViewerResult } from "../../electron/preload";
import { translate, useLanguage } from "../i18n";
import { PDFDocumentSurface } from "./PDFDocumentSurface";

type LatexArtifactWorkbenchProps = {
  sourcePath: string;
  pdfPath: string;
  workspacePath: string;
  onOpenViewer?: (path: string) => void;
};

type ActiveTab = "summary" | "source" | "pdf";

function fileName(filePath: string): string {
  return filePath.split(/[\\/]/).pop() || filePath;
}

function formatFileSize(bytes: number | undefined): string {
  if (!Number.isFinite(bytes) || !bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

export function LatexArtifactWorkbench({
  sourcePath,
  pdfPath,
  workspacePath,
  onOpenViewer,
}: LatexArtifactWorkbenchProps) {
  useLanguage();
  const t = translate;
  const [activeTab, setActiveTab] = useState<ActiveTab>("summary");
  const [sourceData, setSourceData] = useState<FileViewerResult["data"] | null>(
    null,
  );
  const [pdfData, setPdfData] = useState<FileViewerResult["data"] | null>(null);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [loadingSource, setLoadingSource] = useState(false);
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [pdfPageIndex, setPdfPageIndex] = useState(0);
  const [pdfPageCount, setPdfPageCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoadingSource(true);
      setSourceError(null);
      setSourceData(null);
      try {
        const response = await window.electronAPI.readFileForViewer(
          sourcePath,
          workspacePath,
        );
        if (cancelled) return;
        if (!response.success || !response.data) {
          setSourceError(
            response.error ||
              t(
                "latexArtifact.error.loadSource",
                "Failed to load LaTeX source",
              ),
          );
          return;
        }
        setSourceData(response.data);
      } catch (error: unknown) {
        if (!cancelled) {
          setSourceError(
            error instanceof Error
              ? error.message
              : t(
                  "latexArtifact.error.loadSource",
                  "Failed to load LaTeX source",
                ),
          );
        }
      } finally {
        if (!cancelled) setLoadingSource(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [sourcePath, workspacePath]);

  useEffect(() => {
    if (activeTab !== "pdf" && activeTab !== "summary") return;
    let cancelled = false;
    const run = async () => {
      setLoadingPdf(true);
      setPdfError(null);
      try {
        const response = await window.electronAPI.readFileForViewer(
          pdfPath,
          workspacePath,
          {
            includePdfBase64: true,
          },
        );
        if (cancelled) return;
        if (!response.success || !response.data) {
          setPdfError(
            response.error ||
              t("latexArtifact.error.loadPdf", "Failed to load compiled PDF"),
          );
          return;
        }
        if (response.data.fileType !== "pdf") {
          setPdfError(
            t(
              "latexArtifact.error.notPdf",
              "Compiled output is not a previewable PDF.",
            ),
          );
          return;
        }
        setPdfData(response.data);
        setPdfPageIndex(0);
      } catch (error: unknown) {
        if (!cancelled) {
          setPdfError(
            error instanceof Error
              ? error.message
              : t("latexArtifact.error.loadPdf", "Failed to load compiled PDF"),
          );
        }
      } finally {
        if (!cancelled) setLoadingPdf(false);
      }
    };
    if (!pdfData) void run();
    return () => {
      cancelled = true;
    };
  }, [activeTab, pdfData, pdfPath, workspacePath]);

  const sourceLineCount = useMemo(() => {
    const content = sourceData?.content || "";
    return content ? content.split("\n").length : 0;
  }, [sourceData?.content]);

  const openPath = (targetPath: string) => {
    if (onOpenViewer) {
      onOpenViewer(targetPath);
      return;
    }
    void window.electronAPI.openFile(targetPath, workspacePath);
  };

  const showPath = (targetPath: string) => {
    void window.electronAPI.showInFinder(targetPath, workspacePath);
  };

  return (
    <div className="latex-artifact-workbench">
      <div className="latex-artifact-header">
        <div className="latex-artifact-title-block">
          <div className="latex-artifact-title">{fileName(pdfPath)}</div>
          <div className="latex-artifact-subtitle">
            {t("latexArtifact.subtitle", "{source} -> compiled PDF", {
              source: fileName(sourcePath),
            })}
          </div>
        </div>
        <div className="latex-artifact-actions">
          <button
            type="button"
            onClick={() => openPath(pdfPath)}
            className="latex-artifact-action"
          >
            {t("latexArtifact.openPdf", "Open PDF")}
          </button>
          <button
            type="button"
            onClick={() => showPath(pdfPath)}
            className="latex-artifact-action secondary"
          >
            {t("common.show", "Show")}
          </button>
        </div>
      </div>

      <div
        className="latex-artifact-tabs"
        role="tablist"
        aria-label={t("latexArtifact.tabs.aria", "LaTeX artifact tabs")}
      >
        {(["summary", "source", "pdf"] as ActiveTab[]).map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            className={`latex-artifact-tab ${activeTab === tab ? "active" : ""}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === "summary"
              ? t("latexArtifact.tab.summary", "Summary")
              : tab === "source"
                ? t("latexArtifact.tab.source", ".tex source")
                : "PDF"}
          </button>
        ))}
      </div>

      {activeTab === "summary" && (
        <div className="latex-artifact-summary">
          <div className="latex-artifact-summary-row">
            <span>{t("common.source", "Source")}</span>
            <button type="button" onClick={() => openPath(sourcePath)}>
              {fileName(sourcePath)}
            </button>
          </div>
          <div className="latex-artifact-summary-row">
            <span>PDF</span>
            <button type="button" onClick={() => openPath(pdfPath)}>
              {fileName(pdfPath)}
            </button>
          </div>
          <div className="latex-artifact-summary-row">
            <span>{t("latexArtifact.size", "Size")}</span>
            <strong>
              {formatFileSize(pdfData?.size) || t("common.unknown", "Unknown")}
            </strong>
          </div>
          <div className="latex-artifact-summary-row">
            <span>{t("latexArtifact.sourceLines", "Source lines")}</span>
            <strong>{sourceLineCount || t("common.unknown", "Unknown")}</strong>
          </div>
          {loadingPdf && (
            <div className="latex-artifact-loading">
              {t("latexArtifact.loadingMetadata", "Loading PDF metadata...")}
            </div>
          )}
          {pdfError && <div className="latex-artifact-error">{pdfError}</div>}
        </div>
      )}

      {activeTab === "source" && (
        <div className="latex-artifact-source">
          {loadingSource && (
            <div className="latex-artifact-loading">
              {t("latexArtifact.loadingSource", "Loading LaTeX source...")}
            </div>
          )}
          {sourceError && (
            <div className="latex-artifact-error">{sourceError}</div>
          )}
          {!loadingSource && !sourceError && (
            <pre className="latex-artifact-source-code">
              {sourceData?.content || ""}
            </pre>
          )}
        </div>
      )}

      {activeTab === "pdf" && (
        <div className="latex-artifact-pdf">
          {loadingPdf && (
            <div className="latex-artifact-loading">
              {t("latexArtifact.renderingPdf", "Rendering PDF...")}
            </div>
          )}
          {pdfError && <div className="latex-artifact-error">{pdfError}</div>}
          {!loadingPdf && !pdfError && pdfData?.pdfDataBase64 && (
            <>
              <div className="latex-artifact-pdf-toolbar">
                <button
                  type="button"
                  onClick={() =>
                    setPdfPageIndex((current) => Math.max(0, current - 1))
                  }
                  disabled={pdfPageIndex <= 0}
                >
                  {t("common.previous", "Previous")}
                </button>
                <span>
                  {t(
                    "latexArtifact.pageIndicator",
                    "Page {current} / {total}",
                    {
                      current: pdfPageCount > 0 ? pdfPageIndex + 1 : "-",
                      total: pdfPageCount || "-",
                    },
                  )}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setPdfPageIndex((current) =>
                      pdfPageCount > 0
                        ? Math.min(pdfPageCount - 1, current + 1)
                        : current,
                    )
                  }
                  disabled={
                    pdfPageCount <= 0 || pdfPageIndex >= pdfPageCount - 1
                  }
                >
                  {t("common.next", "Next")}
                </button>
                <strong>{t("latexArtifact.zoomToFit", "Zoom to fit")}</strong>
              </div>
              <PDFDocumentSurface
                fileName={pdfData.fileName}
                pdfDataBase64={pdfData.pdfDataBase64}
                selection={null}
                onSelectionChange={() => {}}
                readOnly
                visiblePageIndex={pdfPageIndex}
                onPageCountChange={setPdfPageCount}
              />
            </>
          )}
          {!loadingPdf && !pdfError && pdfData && !pdfData.pdfDataBase64 && (
            <div className="latex-artifact-error">
              {t(
                "latexArtifact.error.tooLarge",
                "PDF is too large for inline rendering. Open it externally to inspect the full document.",
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
