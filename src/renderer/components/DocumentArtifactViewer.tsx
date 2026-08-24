import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  AlignLeft,
  ArrowUp,
  Bold,
  Copy,
  ExternalLink,
  FolderOpen,
  Italic,
  List,
  ListOrdered,
  Maximize2,
  Mic,
  Minimize2,
  Plus,
  Redo2,
  Save,
  Square,
  Underline,
  Undo2,
  X,
} from "lucide-react";
import type { FileViewerResult } from "../../electron/preload";
import type {
  ImageAttachment,
  LLMModelInfo,
  LLMProviderInfo,
  LLMProviderType,
  LLMReasoningEffort,
} from "../../shared/types";
import type {
  DocumentPreview,
  EditableDocumentBlock,
  EditableDocumentRun,
} from "../../shared/document-preview";
import { getDocumentFormatLabel } from "../../shared/document-formats";
import { useDocumentZoom } from "../hooks/useDocumentZoom";
import { useVoiceInput } from "../hooks/useVoiceInput";
import { translate, useLanguage } from "../i18n";
import { ModelDropdown } from "./MainContent";
import { ArtifactFileTypeIcon } from "./ArtifactFileTypeIcon";
import { ArtifactDownloadButton } from "./ArtifactDownloadButton";
import {
  ArtifactTurnProgressPanel,
  type SpreadsheetTurnContext,
} from "./ArtifactTurnProgressPanel";
import { DocumentArtifactCard } from "./DocumentArtifactCard";
import { DocumentZoomControls } from "./DocumentZoomControls";
import { PDFDocumentSurface } from "./PDFDocumentSurface";
import "./artifact-viewers.css";

type DocumentArtifactViewerMode = "sidebar" | "fullscreen";
type DocumentSettingsTab = Any;
type PendingDocumentAttachment = {
  id: string;
  path: string;
  name: string;
  size: number;
  mimeType?: string;
};

type DocumentArtifactViewerProps = {
  filePath: string;
  workspacePath: string;
  mode: DocumentArtifactViewerMode;
  onClose: () => void;
  onFullscreen: () => void;
  onExitFullscreen: () => void;
  onSendMessage?: (
    message: string,
    images?: ImageAttachment[],
  ) => Promise<void>;
  selectedModelLabel?: string;
  selectedModel?: string;
  selectedProvider?: LLMProviderType;
  selectedReasoningEffort?: LLMReasoningEffort;
  availableModels?: LLMModelInfo[];
  availableProviders?: LLMProviderInfo[];
  workspaceId?: string;
  onModelChange?: (selection: {
    providerType?: LLMProviderType;
    modelKey: string;
    reasoningEffort?: LLMReasoningEffort;
  }) => void;
  onOpenSettings?: (tab?: DocumentSettingsTab) => void;
  turnContext?: SpreadsheetTurnContext | null;
  refreshKey?: string | number | null;
};

type ViewerData = NonNullable<FileViewerResult["data"]>;

function getFileName(filePath: string): string {
  return filePath.split(/[\\/]/).pop() || filePath;
}

function formatAttachmentSize(size: number): string {
  if (size < 1024) return `${size} B`;
  const kb = size / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}

function isImageAttachment(attachment: PendingDocumentAttachment): boolean {
  return ["image/jpeg", "image/png", "image/gif", "image/webp"].includes(
    attachment.mimeType || "",
  );
}

function buildFallbackPreview(data: ViewerData): DocumentPreview {
  const format = getDocumentFormatLabel(data.fileName);
  if (data.htmlContent) {
    return {
      format,
      previewMode: "html",
      text: data.content || "",
      htmlContent: data.htmlContent,
      canEdit: data.fileType === "docx",
      conversionStatus: "native",
    };
  }
  return {
    format,
    previewMode: data.content ? "text" : "unavailable",
    text: data.content || "",
    canEdit: data.fileType === "docx",
    conversionStatus: data.content ? "native" : "unavailable",
    conversionMessage: undefined,
  };
}

function textToHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map(
      (paragraph) =>
        `<p>${paragraph
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/\n/g, "<br>")}</p>`,
    )
    .join("");
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function blockText(block: EditableDocumentBlock): string {
  return block.runs?.map((run) => run.text).join("") || block.text || "";
}

function renderEditableDocumentHtml(
  blocks: EditableDocumentBlock[] | undefined,
): string {
  if (!blocks?.length) return "";
  return blocks
    .map((block) => {
      const attrs = [
        block.id ? `data-block-id="${escapeHtml(block.id)}"` : "",
        typeof block.order === "number"
          ? `data-block-order="${block.order}"`
          : "",
      ]
        .filter(Boolean)
        .join(" ");
      if (block.type === "table") {
        const rows = block.rows || [];
        return `<table ${attrs}>${rows
          .map(
            (row) =>
              `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`,
          )
          .join("")}</table>`;
      }
      if (block.type === "heading") {
        const level = Math.min(Math.max(block.level || 1, 1), 6);
        return `<h${level} ${attrs}>${escapeHtml(blockText(block))}</h${level}>`;
      }
      return `<p ${attrs}>${escapeHtml(blockText(block))}</p>`;
    })
    .join("");
}

function extractRunsFromNode(
  node: Node,
  inherited: Omit<EditableDocumentRun, "text"> = {},
): EditableDocumentRun[] {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent || "";
    return text ? [{ ...inherited, text }] : [];
  }
  if (!(node instanceof HTMLElement)) return [];
  const tagName = node.tagName.toUpperCase();
  const next = {
    ...inherited,
    bold: inherited.bold || tagName === "B" || tagName === "STRONG",
    italic: inherited.italic || tagName === "I" || tagName === "EM",
    underline: inherited.underline || tagName === "U",
  };
  if (tagName === "BR") return [{ ...next, text: "\n" }];
  return Array.from(node.childNodes).flatMap((child) =>
    extractRunsFromNode(child, next),
  );
}

function collapseRuns(runs: EditableDocumentRun[]): EditableDocumentRun[] {
  const collapsed: EditableDocumentRun[] = [];
  for (const run of runs) {
    if (!run.text) continue;
    const previous = collapsed[collapsed.length - 1];
    if (
      previous &&
      Boolean(previous.bold) === Boolean(run.bold) &&
      Boolean(previous.italic) === Boolean(run.italic) &&
      Boolean(previous.underline) === Boolean(run.underline)
    ) {
      previous.text += run.text;
    } else {
      collapsed.push({ ...run });
    }
  }
  return collapsed;
}

function blockFromElement(element: HTMLElement): EditableDocumentBlock[] {
  const tagName = element.tagName.toUpperCase();
  const blockIdentity = {
    id: element.dataset.blockId || undefined,
    order: element.dataset.blockOrder
      ? Number(element.dataset.blockOrder)
      : undefined,
  };
  if (tagName === "UL" || tagName === "OL") {
    return Array.from(element.children)
      .filter((child): child is HTMLElement => child instanceof HTMLElement)
      .filter((child) => child.tagName.toUpperCase() === "LI")
      .map((child) => ({
        id: child.dataset.blockId || undefined,
        order: child.dataset.blockOrder
          ? Number(child.dataset.blockOrder)
          : undefined,
        type: tagName === "UL" ? "bullet" : "numbered",
        runs: collapseRuns(extractRunsFromNode(child)),
      }));
  }
  if (tagName === "TABLE") {
    return [
      {
        ...blockIdentity,
        type: "table",
        rows: Array.from(element.querySelectorAll("tr")).map((row) =>
          Array.from(row.querySelectorAll("th,td")).map((cell) =>
            (cell.textContent || "").replace(/\s+/g, " ").trim(),
          ),
        ),
      },
    ];
  }
  if (
    tagName === "DIV" &&
    Array.from(element.children).some((child) =>
      ["P", "H1", "H2", "H3", "H4", "H5", "H6", "UL", "OL", "TABLE"].includes(
        child.tagName.toUpperCase(),
      ),
    )
  ) {
    return Array.from(element.children)
      .filter((child): child is HTMLElement => child instanceof HTMLElement)
      .flatMap(blockFromElement);
  }
  if (/^H[1-6]$/.test(tagName)) {
    return [
      {
        ...blockIdentity,
        type: "heading",
        level: Number(tagName.slice(1)),
        runs: collapseRuns(extractRunsFromNode(element)),
      },
    ];
  }
  return [
    {
      ...blockIdentity,
      type: "paragraph",
      runs: collapseRuns(extractRunsFromNode(element)),
    },
  ];
}

function extractEditableDocumentBlocks(
  root: HTMLElement,
): EditableDocumentBlock[] {
  const blocks = Array.from(root.children)
    .filter((child): child is HTMLElement => child instanceof HTMLElement)
    .flatMap(blockFromElement)
    .filter((block) => {
      if (block.type === "table") return Boolean(block.rows?.length);
      return Boolean(block.runs?.some((run) => run.text.trim().length > 0));
    });
  return blocks.length > 0
    ? blocks
    : [{ type: "paragraph", runs: [{ text: "" }] }];
}

export function DocumentArtifactViewer({
  filePath,
  workspacePath,
  mode,
  onClose,
  onFullscreen,
  onExitFullscreen,
  onSendMessage,
  selectedModelLabel,
  selectedModel,
  selectedProvider,
  selectedReasoningEffort,
  availableModels = [],
  availableProviders = [],
  workspaceId,
  onModelChange,
  onOpenSettings,
  turnContext,
  refreshKey,
}: DocumentArtifactViewerProps) {
  useLanguage();
  const t = translate;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fileData, setFileData] = useState<ViewerData | null>(null);
  const [copyMessage, setCopyMessage] = useState("");
  const [pdfPageCount, setPdfPageCount] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editorInitializedKey, setEditorInitializedKey] = useState("");
  const [fullscreenMessage, setFullscreenMessage] = useState("");
  const [fullscreenSending, setFullscreenSending] = useState(false);
  const [fullscreenAttachments, setFullscreenAttachments] = useState<
    PendingDocumentAttachment[]
  >([]);
  const [attachmentError, setAttachmentError] = useState("");
  const [voiceNotice, setVoiceNotice] = useState("");
  const documentZoom = useDocumentZoom(filePath);
  const copyTimerRef = useRef<number | null>(null);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const fileName = fileData?.fileName || getFileName(filePath);
  const fullscreenLabel =
    mode === "fullscreen"
      ? t("documentViewer.exitFullscreen", "Exit full screen")
      : t("documentViewer.openFullscreen", "Open document in full screen");
  const voiceInput = useVoiceInput({
    onTranscript: (text) => {
      setVoiceNotice("");
      setFullscreenMessage((current) =>
        current ? `${current} ${text}` : text,
      );
    },
    onError: (message) => setVoiceNotice(message),
    onNotConfigured: () => {
      setVoiceNotice(
        t("common.voiceInputNotConfigured", "Voice input is not configured."),
      );
      onOpenSettings?.("voice");
    },
  });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setFileData(null);
    setCopyMessage("");
    setPdfPageCount(0);
    setDirty(false);
    setEditorInitializedKey("");

    window.electronAPI
      .readFileForViewer(filePath, workspacePath, {
        includePdfBase64: true,
        includePdfAnalysis: false,
      })
      .then((result) => {
        if (cancelled) return;
        if (!result.success || !result.data) {
          setError(
            result.error ||
              t("documentViewer.error.load", "Failed to load document"),
          );
          return;
        }
        if (
          result.data.fileType !== "docx" &&
          result.data.fileType !== "document" &&
          result.data.fileType !== "markdown" &&
          result.data.fileType !== "pdf"
        ) {
          setError(
            t(
              "documentViewer.error.notDocument",
              "File is not a Word-style document.",
            ),
          );
          return;
        }
        setFileData(result.data);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : t("documentViewer.error.load", "Failed to load document"),
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [filePath, workspacePath, refreshKey]);

  useEffect(() => {
    if (!copyMessage) return;
    if (copyTimerRef.current !== null)
      window.clearTimeout(copyTimerRef.current);
    copyTimerRef.current = window.setTimeout(() => setCopyMessage(""), 2200);
    return () => {
      if (copyTimerRef.current !== null)
        window.clearTimeout(copyTimerRef.current);
    };
  }, [copyMessage]);

  const preview = useMemo(() => {
    if (!fileData) return null;
    return fileData.documentPreview || buildFallbackPreview(fileData);
  }, [fileData]);

  const formatLabel = preview?.format || getDocumentFormatLabel(fileName);
  const isPdfDocument =
    fileData?.fileType === "pdf" || filePath.toLowerCase().endsWith(".pdf");
  const resolvedPdfPageCount =
    fileData?.pdfReviewSummary?.pageCount || pdfPageCount;
  const canEditDirectly = Boolean(
    preview?.canEdit && fileData?.fileType === "docx",
  );
  const isMarkdownDocument = fileData?.fileType === "markdown";

  useEffect(() => {
    if (!canEditDirectly || !preview || !editorRef.current) return;
    const key = `${filePath}:${preview.htmlContent || preview.text}`;
    if (editorInitializedKey === key) return;
    editorRef.current.innerHTML =
      renderEditableDocumentHtml(
        preview.blocks as EditableDocumentBlock[] | undefined,
      ) ||
      preview.htmlContent ||
      textToHtml(preview.text || "");
    setEditorInitializedKey(key);
    setDirty(false);
  }, [canEditDirectly, editorInitializedKey, filePath, preview]);

  const handleCopyText = async () => {
    const text = preview?.text || "";
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopyMessage(t("common.copied", "Copied"));
    } catch {
      setCopyMessage(t("common.copyFailed", "Copy failed"));
    }
  };

  const handleOpenExternal = () => {
    void window.electronAPI.openFile(filePath, workspacePath);
  };

  const handleShowInFinder = () => {
    void window.electronAPI.showInFinder(filePath, workspacePath);
  };

  const runEditorCommand = (command: string, value?: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    setDirty(true);
  };

  const handleSaveDocument = async () => {
    if (!editorRef.current || saving || !canEditDirectly) return;
    setSaving(true);
    setCopyMessage("");
    try {
      const blocks = extractEditableDocumentBlocks(editorRef.current);
      const result = await window.electronAPI.updateDocumentFile({
        filePath,
        workspacePath,
        blocks,
      });
      if (!result.success || !result.data) {
        setCopyMessage(
          result.error || t("documentViewer.saveFailed", "Save failed"),
        );
        return;
      }
      setFileData(result.data);
      setDirty(false);
      setCopyMessage(t("common.saved", "Saved"));
      setEditorInitializedKey("");
    } catch (err: unknown) {
      setCopyMessage(
        err instanceof Error
          ? err.message
          : t("documentViewer.saveFailed", "Save failed"),
      );
    } finally {
      setSaving(false);
    }
  };

  const handleAttachFiles = useCallback(async () => {
    try {
      setAttachmentError("");
      const files = await window.electronAPI.selectFiles(workspacePath);
      if (!files || files.length === 0) return;
      setFullscreenAttachments((current) => [
        ...current,
        ...files.map((file) => ({
          ...file,
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        })),
      ]);
    } catch {
      setAttachmentError(
        t(
          "common.attachments.addFailed",
          "Failed to add attachments. Please try again.",
        ),
      );
    }
  }, [workspacePath]);

  const removeAttachment = useCallback((id: string) => {
    setFullscreenAttachments((current) =>
      current.filter((attachment) => attachment.id !== id),
    );
  }, []);

  const buildMessageWithAttachments = useCallback(
    async (message: string) => {
      if (fullscreenAttachments.length === 0) {
        return { message, images: undefined as ImageAttachment[] | undefined };
      }

      const importedAttachments = workspaceId
        ? await window.electronAPI.importFilesToWorkspace({
            workspaceId,
            files: fullscreenAttachments.map((attachment) => attachment.path),
          })
        : [];
      const attachmentLines =
        importedAttachments.length > 0
          ? importedAttachments.map(
              (attachment) =>
                `- ${attachment.fileName} (${attachment.relativePath})`,
            )
          : fullscreenAttachments.map(
              (attachment) => `- ${attachment.name} (${attachment.path})`,
            );
      const base =
        message ||
        t(
          "common.attachments.reviewAttached",
          "Please review the attached files.",
        );
      const images = fullscreenAttachments
        .filter(isImageAttachment)
        .map((attachment) => ({
          filePath: attachment.path,
          mimeType: attachment.mimeType as ImageAttachment["mimeType"],
          filename: attachment.name,
          sizeBytes: attachment.size,
        }));
      return {
        message: `${base}\n\n${t("common.attachments.attachedFiles", "Attached files:")}\n${attachmentLines.join("\n")}`,
        images: images.length > 0 ? images : undefined,
      };
    },
    [fullscreenAttachments, workspaceId],
  );

  const handleFullscreenSend = async () => {
    const message = fullscreenMessage.trim();
    if (
      (!message && fullscreenAttachments.length === 0) ||
      !onSendMessage ||
      fullscreenSending
    )
      return;
    const previousMessage = fullscreenMessage;
    const previousAttachments = fullscreenAttachments;
    setFullscreenSending(true);
    setFullscreenMessage("");
    setFullscreenAttachments([]);
    try {
      setAttachmentError("");
      const payload = await buildMessageWithAttachments(message);
      await onSendMessage(payload.message, payload.images);
    } catch {
      setFullscreenMessage(previousMessage);
      setFullscreenAttachments(previousAttachments);
      setAttachmentError(
        t(
          "common.sendFailedRetry",
          "Failed to send message. Please try again.",
        ),
      );
    } finally {
      setFullscreenSending(false);
    }
  };

  const renderDocumentBody = () => {
    if (loading)
      return (
        <div className="document-viewer-state">
          {t("documentViewer.loading", "Loading document...")}
        </div>
      );
    if (error)
      return (
        <div className="document-viewer-state document-viewer-error">
          {error}
        </div>
      );
    if (isPdfDocument) {
      if (!fileData?.pdfDataBase64) {
        return (
          <div className="document-viewer-state">
            <strong>
              {t("documentViewer.previewUnavailable", "Preview unavailable")}
            </strong>
            <p>
              {t("fileViewer.pdf.noPreview", "PDF preview is not available.")}
            </p>
            <button
              type="button"
              className="document-viewer-tool-btn"
              onClick={handleOpenExternal}
            >
              <ExternalLink size={14} />
              {t("documentViewer.openExternally", "Open externally")}
            </button>
          </div>
        );
      }
      return (
        <PDFDocumentSurface
          fileName={fileName}
          pdfDataBase64={fileData.pdfDataBase64}
          selection={null}
          onSelectionChange={() => {}}
          readOnly
          onPageCountChange={setPdfPageCount}
          maxScale={1.25}
          zoom={documentZoom.zoomPercent / 100}
        />
      );
    }
    if (!preview)
      return (
        <div className="document-viewer-state">
          {t("documentViewer.noPreview", "No document preview available.")}
        </div>
      );
    if (preview.previewMode === "unavailable") {
      return (
        <div className="document-viewer-state">
          <strong>
            {t("documentViewer.previewUnavailable", "Preview unavailable")}
          </strong>
          <p>
            {preview.conversionMessage ||
              t(
                "documentViewer.openNativeHint",
                "Open this document in its native app to review it.",
              )}
          </p>
          <button
            type="button"
            className="document-viewer-tool-btn"
            onClick={handleOpenExternal}
          >
            <ExternalLink size={14} />
            {t("documentViewer.openExternally", "Open externally")}
          </button>
        </div>
      );
    }
    if (canEditDirectly) {
      return (
        <div className="document-editor-canvas">
          <div
            ref={editorRef}
            className="document-editor-page"
            style={{ zoom: `${documentZoom.zoomPercent}%` }}
            contentEditable
            suppressContentEditableWarning
            spellCheck
            onInput={() => setDirty(true)}
            onBlur={() => setDirty(true)}
          />
        </div>
      );
    }
    if (preview.previewMode === "html" && preview.htmlContent) {
      return (
        <div
          className="document-viewer-html"
          style={{ zoom: `${documentZoom.zoomPercent}%` }}
          dangerouslySetInnerHTML={{ __html: preview.htmlContent }}
        />
      );
    }
    if (isMarkdownDocument) {
      return (
        <div
          className="document-viewer-markdown markdown-content"
          style={{ zoom: `${documentZoom.zoomPercent}%` }}
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {preview.text || ""}
          </ReactMarkdown>
        </div>
      );
    }
    return (
      <pre
        className="document-viewer-text"
        style={{ zoom: `${documentZoom.zoomPercent}%` }}
      >
        {preview.text || t("documentViewer.empty", "Empty document.")}
      </pre>
    );
  };

  return (
    <section
      className={`document-viewer document-viewer-${mode} ${isPdfDocument ? "document-viewer-pdf" : ""}`}
    >
      <div
        className={`document-viewer-tabbar ${isPdfDocument ? "is-compact" : ""}`}
      >
        <div className="document-viewer-tab">
          <ArtifactFileTypeIcon
            filePath={filePath}
            className="document-viewer-file-icon"
            size={19}
          />
          {isPdfDocument ? (
            <div className="document-viewer-tab-copy">
              <span className="document-viewer-tab-title">{fileName}</span>
              <span className="document-viewer-tab-meta">
                {formatLabel}
                {resolvedPdfPageCount ? (
                  <span>
                    {t("fileViewer.meta.pages", "{count} pages", {
                      count: resolvedPdfPageCount,
                    })}
                  </span>
                ) : null}
              </span>
            </div>
          ) : (
            <span className="document-viewer-tab-title">{fileName}</span>
          )}
        </div>
        {isPdfDocument ? (
          <>
            <DocumentZoomControls
              value={documentZoom.zoomPercent}
              onZoomIn={documentZoom.zoomIn}
              onZoomOut={documentZoom.zoomOut}
              onReset={documentZoom.resetZoom}
              compact
            />
            <button
              type="button"
              className="document-viewer-tool-btn"
              onClick={() => void handleCopyText()}
              disabled={!preview?.text}
              title={t("documentViewer.copyText", "Copy document text")}
            >
              <Copy size={14} />
              <span className="document-viewer-tool-label">
                {t("common.copy", "Copy")}
              </span>
            </button>
            <button
              type="button"
              className="document-viewer-tool-btn"
              onClick={handleOpenExternal}
              title={t("documentViewer.openExternally", "Open externally")}
            >
              <ExternalLink size={14} />
              <span className="document-viewer-tool-label">
                {t("common.open", "Open")}
              </span>
            </button>
            {copyMessage && (
              <div className="document-viewer-save-message">{copyMessage}</div>
            )}
          </>
        ) : null}
        <button
          type="button"
          className="document-viewer-tool-btn"
          onClick={handleShowInFinder}
          title={t("common.openInFolder", "Open in folder")}
        >
          <FolderOpen size={14} />
          <span className="document-viewer-tool-label">
            {t("common.folder", "Folder")}
          </span>
        </button>
        <ArtifactDownloadButton
          filePath={filePath}
          workspacePath={workspacePath}
          className="document-viewer-download-btn"
        />
        <button
          type="button"
          className="document-viewer-header-fullscreen"
          onClick={mode === "fullscreen" ? onExitFullscreen : onFullscreen}
          title={fullscreenLabel}
          aria-label={fullscreenLabel}
        >
          {mode === "fullscreen" ? (
            <Minimize2 size={16} />
          ) : (
            <Maximize2 size={16} />
          )}
        </button>
        <button
          type="button"
          className="document-viewer-close"
          onClick={onClose}
          title={t("documentViewer.close", "Close document")}
        >
          <X size={17} />
        </button>
      </div>

      {!isPdfDocument && (
        <div
          className={`document-viewer-titlebar ${canEditDirectly ? "is-editor-toolbar" : ""}`}
        >
          {canEditDirectly ? (
            <>
              <button
                type="button"
                className="document-viewer-icon-tool"
                onClick={() => runEditorCommand("undo")}
                title={t("common.undo", "Undo")}
              >
                <Undo2 size={15} />
              </button>
              <button
                type="button"
                className="document-viewer-icon-tool"
                onClick={() => runEditorCommand("redo")}
                title={t("common.redo", "Redo")}
              >
                <Redo2 size={15} />
              </button>
              <select
                className="document-viewer-select"
                defaultValue="p"
                onChange={(event) =>
                  runEditorCommand("formatBlock", event.target.value)
                }
                title={t("documentViewer.textStyle", "Text style")}
              >
                <option value="p">
                  {t("documentViewer.normalText", "Normal text")}
                </option>
                <option value="h1">
                  {t("documentViewer.titleStyle", "Title")}
                </option>
                <option value="h2">
                  {t("documentViewer.heading", "Heading")}
                </option>
                <option value="h3">
                  {t("documentViewer.subheading", "Subheading")}
                </option>
              </select>
              <select
                className="document-viewer-select"
                defaultValue="Arial"
                onChange={(event) =>
                  runEditorCommand("fontName", event.target.value)
                }
                title={t("documentViewer.font", "Font")}
              >
                <option value="Arial">Arial</option>
                <option value="Helvetica">Helvetica</option>
                <option value="Times New Roman">Times New Roman</option>
                <option value="Georgia">Georgia</option>
                <option value="Courier New">Courier New</option>
              </select>
              <button
                type="button"
                className="document-viewer-icon-tool"
                onClick={() => runEditorCommand("fontSize", "2")}
                title={t("documentViewer.smallerText", "Smaller text")}
              >
                -
              </button>
              <button
                type="button"
                className="document-viewer-icon-tool"
                onClick={() => runEditorCommand("fontSize", "3")}
                title={t("documentViewer.normalSize", "Normal size")}
              >
                11
              </button>
              <button
                type="button"
                className="document-viewer-icon-tool"
                onClick={() => runEditorCommand("fontSize", "4")}
                title={t("documentViewer.largerText", "Larger text")}
              >
                +
              </button>
              <button
                type="button"
                className="document-viewer-icon-tool"
                onClick={() => runEditorCommand("bold")}
                title={t("documentViewer.bold", "Bold")}
              >
                <Bold size={15} />
              </button>
              <button
                type="button"
                className="document-viewer-icon-tool"
                onClick={() => runEditorCommand("italic")}
                title={t("documentViewer.italic", "Italic")}
              >
                <Italic size={15} />
              </button>
              <button
                type="button"
                className="document-viewer-icon-tool"
                onClick={() => runEditorCommand("underline")}
                title={t("documentViewer.underline", "Underline")}
              >
                <Underline size={15} />
              </button>
              <button
                type="button"
                className="document-viewer-icon-tool"
                onClick={() => runEditorCommand("justifyLeft")}
                title={t("documentViewer.alignLeft", "Align left")}
              >
                <AlignLeft size={15} />
              </button>
              <button
                type="button"
                className="document-viewer-icon-tool"
                onClick={() => runEditorCommand("insertUnorderedList")}
                title={t("documentViewer.bulletedList", "Bulleted list")}
              >
                <List size={15} />
              </button>
              <button
                type="button"
                className="document-viewer-icon-tool"
                onClick={() => runEditorCommand("insertOrderedList")}
                title={t("documentViewer.numberedList", "Numbered list")}
              >
                <ListOrdered size={15} />
              </button>
              <button
                type="button"
                className="document-viewer-save-btn"
                onClick={() => void handleSaveDocument()}
                disabled={!dirty || saving}
                title={t("documentViewer.saveDocument", "Save document")}
              >
                <Save size={15} />
                {saving
                  ? t("common.savingShort", "Saving")
                  : t("common.save", "Save")}
              </button>
              <DocumentZoomControls
                value={documentZoom.zoomPercent}
                onZoomIn={documentZoom.zoomIn}
                onZoomOut={documentZoom.zoomOut}
                onReset={documentZoom.resetZoom}
              />
              {copyMessage && (
                <div className="document-viewer-save-message">
                  {copyMessage}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="document-viewer-format">{formatLabel}</div>
              <DocumentZoomControls
                value={documentZoom.zoomPercent}
                onZoomIn={documentZoom.zoomIn}
                onZoomOut={documentZoom.zoomOut}
                onReset={documentZoom.resetZoom}
              />
              <button
                type="button"
                className="document-viewer-tool-btn"
                onClick={() => void handleCopyText()}
                disabled={!preview?.text}
                title={t("documentViewer.copyText", "Copy document text")}
              >
                <Copy size={14} />
                {t("common.copy", "Copy")}
              </button>
              <button
                type="button"
                className="document-viewer-tool-btn"
                onClick={handleOpenExternal}
                title={t("documentViewer.openExternally", "Open externally")}
              >
                <ExternalLink size={14} />
                {t("common.open", "Open")}
              </button>
              {copyMessage && (
                <div className="document-viewer-save-message">
                  {copyMessage}
                </div>
              )}
            </>
          )}
        </div>
      )}

      <div
        ref={documentZoom.containerRef}
        className="document-viewer-content"
        data-zoom-percent={documentZoom.zoomPercent}
      >
        {renderDocumentBody()}
      </div>

      {mode === "fullscreen" && onSendMessage && (
        <div className="spreadsheet-viewer-fullscreen-controls">
          {turnContext && (
            <ArtifactTurnProgressPanel turnContext={turnContext}>
              <DocumentArtifactCard
                filePath={turnContext.artifactPath}
                workspacePath={workspacePath}
                onOpenViewer={onExitFullscreen}
              />
            </ArtifactTurnProgressPanel>
          )}
          <div className="spreadsheet-viewer-composer">
            {(fullscreenAttachments.length > 0 ||
              attachmentError ||
              voiceNotice) && (
              <div className="attachment-panel spreadsheet-viewer-attachment-panel">
                {attachmentError && (
                  <div className="attachment-error">{attachmentError}</div>
                )}
                {voiceNotice && (
                  <div className="attachment-error">{voiceNotice}</div>
                )}
                {fullscreenAttachments.length > 0 && (
                  <div className="attachment-list">
                    {fullscreenAttachments.map((attachment) => (
                      <div className="attachment-chip" key={attachment.id}>
                        <span
                          className="attachment-name"
                          title={attachment.name}
                        >
                          {attachment.name}
                        </span>
                        <span className="attachment-size">
                          {formatAttachmentSize(attachment.size)}
                        </span>
                        <button
                          type="button"
                          className="attachment-remove"
                          onClick={() => removeAttachment(attachment.id)}
                          title={t(
                            "common.attachments.remove",
                            "Remove attachment",
                          )}
                          disabled={fullscreenSending}
                        >
                          <X size={12} aria-hidden="true" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className="input-container spreadsheet-viewer-composer-input">
              <div className="input-row">
                <button
                  type="button"
                  className="attachment-btn attachment-btn-left"
                  title={t("common.attachments.attachFiles", "Attach files")}
                  aria-label={t(
                    "common.attachments.attachFiles",
                    "Attach files",
                  )}
                  onClick={() => void handleAttachFiles()}
                  disabled={fullscreenSending}
                >
                  <Plus size={22} aria-hidden="true" />
                </button>
                <div className="mention-autocomplete-wrapper">
                  <textarea
                    className="input-field input-textarea"
                    placeholder={t(
                      "artifactViewer.document.editPlaceholder",
                      "Describe how you want to change this document",
                    )}
                    value={fullscreenMessage}
                    rows={1}
                    onChange={(event) =>
                      setFullscreenMessage(event.target.value)
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        void handleFullscreenSend();
                      }
                    }}
                  />
                </div>
                <div className="input-actions">
                  {selectedModel &&
                  selectedProvider &&
                  onModelChange &&
                  availableModels.length > 0 ? (
                    <ModelDropdown
                      models={availableModels}
                      selectedModel={selectedModel}
                      selectedProvider={selectedProvider}
                      selectedReasoningEffort={selectedReasoningEffort}
                      providers={availableProviders}
                      onModelChange={onModelChange}
                      onOpenSettings={onOpenSettings}
                      variant="label"
                      align="right"
                    />
                  ) : selectedModelLabel ? (
                    <span className="spreadsheet-viewer-composer-model">
                      {selectedModelLabel}
                    </span>
                  ) : null}
                  <button
                    type="button"
                    className={`voice-input-btn ${voiceInput.state}`}
                    onClick={() => void voiceInput.toggleRecording()}
                    disabled={
                      voiceInput.state === "processing" || fullscreenSending
                    }
                    title={t("common.voiceInput", "Voice input")}
                  >
                    {voiceInput.state === "recording" ? (
                      <Square
                        size={12}
                        fill="currentColor"
                        strokeWidth={0}
                        aria-hidden="true"
                      />
                    ) : (
                      <Mic size={16} aria-hidden="true" />
                    )}
                  </button>
                  <button
                    type="button"
                    className="lets-go-btn lets-go-btn-sm"
                    onClick={() => void handleFullscreenSend()}
                    disabled={
                      (!fullscreenMessage.trim() &&
                        fullscreenAttachments.length === 0) ||
                      fullscreenSending
                    }
                    title={t("common.sendMessage", "Send message")}
                  >
                    <ArrowUp size={16} aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>
            <div className="input-below-actions spreadsheet-viewer-composer-actions">
              <span className="input-status-workspace">
                {t("composer.workInFolder", "Work in a folder")}
              </span>
              <span className="shell-toggle shell-toggle-inline enabled">
                {t("composer.shell", "Shell")}
                <span className="goal-mode-switch-track on">
                  <span className="goal-mode-switch-thumb" />
                </span>
              </span>
              <span className="input-status-mode">
                {t("composer.mode.execute", "Execute")}
              </span>
              <span className="input-status-mode">
                {t("composer.mode.auto", "Auto")}
              </span>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
