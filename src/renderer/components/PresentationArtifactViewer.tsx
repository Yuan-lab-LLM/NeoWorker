import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUp,
  Copy,
  ExternalLink,
  FolderOpen,
  Maximize2,
  Mic,
  Minimize2,
  Plus,
  Square,
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
import { getPresentationFormatLabel } from "../../shared/presentation-formats";
import { useVoiceInput } from "../hooks/useVoiceInput";
import { translate, useLanguage } from "../i18n";
import { ModelDropdown } from "./MainContent";
import { ArtifactFileTypeIcon } from "./ArtifactFileTypeIcon";
import { ArtifactDownloadButton } from "./ArtifactDownloadButton";
import {
  ArtifactTurnProgressPanel,
  type SpreadsheetTurnContext,
} from "./ArtifactTurnProgressPanel";
import { PresentationArtifactCard } from "./PresentationArtifactCard";
import {
  PresentationViewer,
  type PresentationPreview,
} from "./PresentationViewer";
import "./artifact-viewers.css";

type PresentationArtifactViewerMode = "sidebar" | "fullscreen";
type PresentationSettingsTab = Any;
type PendingPresentationAttachment = {
  id: string;
  path: string;
  name: string;
  size: number;
  mimeType?: string;
};

type PresentationArtifactViewerProps = {
  filePath: string;
  workspacePath: string;
  mode: PresentationArtifactViewerMode;
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
  onOpenSettings?: (tab?: PresentationSettingsTab) => void;
  turnContext?: SpreadsheetTurnContext | null;
  refreshKey?: string | number | null;
};

type ViewerData = NonNullable<FileViewerResult["data"]>;

const presentationViewerDataCache = new Map<string, ViewerData>();

function getPresentationViewerCacheKey(args: {
  filePath: string;
  workspacePath: string;
  refreshKey?: string | number | null;
}): string {
  return `${args.workspacePath}::${args.filePath}::${args.refreshKey ?? ""}`;
}

function presentationPreviewNeedsRender(
  preview: PresentationPreview | null | undefined,
): boolean {
  return preview?.renderStatus === "rendering";
}

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

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function isImageAttachment(attachment: PendingPresentationAttachment): boolean {
  return ["image/jpeg", "image/png", "image/gif", "image/webp"].includes(
    attachment.mimeType || "",
  );
}

function buildPresentationText(preview: PresentationPreview | null): string {
  if (!preview) return "";
  return preview.slides
    .map((slide) => {
      const lines = [
        translate("artifactViewer.presentation.slideLabel", "Slide {index}", {
          index: slide.index,
        }) + (slide.title ? `: ${slide.title}` : ""),
      ];
      if (slide.text) lines.push(slide.text);
      if (slide.notes)
        lines.push(
          translate(
            "artifactViewer.presentation.speakerNotes",
            "Speaker notes:",
          ),
          slide.notes,
        );
      return lines.join("\n");
    })
    .join("\n\n");
}

export function PresentationArtifactViewer({
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
}: PresentationArtifactViewerProps) {
  useLanguage();
  const t = translate;
  const [loading, setLoading] = useState(true);
  const [renderingImages, setRenderingImages] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileData, setFileData] = useState<ViewerData | null>(null);
  const [copyMessage, setCopyMessage] = useState("");
  const [fullscreenMessage, setFullscreenMessage] = useState("");
  const [fullscreenSending, setFullscreenSending] = useState(false);
  const [fullscreenAttachments, setFullscreenAttachments] = useState<
    PendingPresentationAttachment[]
  >([]);
  const [attachmentError, setAttachmentError] = useState("");
  const [voiceNotice, setVoiceNotice] = useState("");
  const copyTimerRef = useRef<number | null>(null);
  const fileName = fileData?.fileName || getFileName(filePath);
  const formatLabel = getPresentationFormatLabel(fileName);
  const fullscreenLabel =
    mode === "fullscreen"
      ? t("artifactViewer.exitFullscreen", "Exit full screen")
      : t(
          "artifactViewer.presentation.openFullscreen",
          "Open presentation in full screen",
        );
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

  const cacheKey = useMemo(
    () =>
      getPresentationViewerCacheKey({ filePath, workspacePath, refreshKey }),
    [filePath, workspacePath, refreshKey],
  );
  const canReuseCachedViewerData =
    refreshKey !== null && refreshKey !== undefined;

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setCopyMessage("");

    const applyViewerData = (data: ViewerData) => {
      if (canReuseCachedViewerData) {
        presentationViewerDataCache.set(cacheKey, data);
      }
      setFileData(data);
    };

    const loadFullPreview = () => {
      setRenderingImages(true);
      window.electronAPI
        .readFileForViewer(filePath, workspacePath, {
          presentationRenderMode: "full",
        })
        .then((result) => {
          if (cancelled) return;
          if (
            result.success &&
            result.data?.fileType === "pptx" &&
            result.data.presentationPreview
          ) {
            applyViewerData(result.data);
          }
        })
        .catch(() => {
          // The fast text preview remains usable if high-fidelity rendering fails.
        })
        .finally(() => {
          if (!cancelled) setRenderingImages(false);
        });
    };

    const cached = canReuseCachedViewerData
      ? presentationViewerDataCache.get(cacheKey)
      : undefined;
    if (cached?.fileType === "pptx" && cached.presentationPreview) {
      setLoading(false);
      applyViewerData(cached);
      if (presentationPreviewNeedsRender(cached.presentationPreview)) {
        loadFullPreview();
      } else {
        setRenderingImages(false);
      }
      return () => {
        cancelled = true;
      };
    }

    setLoading(true);
    setRenderingImages(true);
    setFileData(null);

    let bestPreviewQuality = 0;
    let lastLoadError = t(
      "artifactViewer.presentation.loadFailed",
      "Failed to load presentation",
    );

    const validateViewerResult = (result: FileViewerResult): ViewerData => {
      if (!result.success || !result.data) {
        throw new Error(result.error || lastLoadError);
      }
      if (result.data.fileType !== "pptx" || !result.data.presentationPreview) {
        throw new Error(
          t(
            "artifactViewer.presentation.powerPointOnly",
            "In-app preview is only available for PowerPoint presentations.",
          ),
        );
      }
      return result.data;
    };

    const applyBestViewerData = (data: ViewerData) => {
      if (cancelled || !data.presentationPreview) return;
      const status = data.presentationPreview.renderStatus;
      const quality = status === "rendered" || status === "cached" ? 2 : 1;
      if (quality < bestPreviewQuality) return;
      bestPreviewQuality = quality;
      applyViewerData(data);
      setLoading(false);
    };

    // Start the high-fidelity renderer immediately. The fast request runs in
    // parallel only to provide metadata while the slide images are generated.
    // The main-process service deduplicates extraction and render work.
    const fullRequest = window.electronAPI
      .readFileForViewer(filePath, workspacePath, {
        presentationRenderMode: "full",
      })
      .then(validateViewerResult)
      .then((data) => {
        applyBestViewerData(data);
        return data;
      })
      .catch((err: unknown) => {
        lastLoadError = err instanceof Error ? err.message : lastLoadError;
        throw err;
      });

    const fastRequest = window.electronAPI
      .readFileForViewer(filePath, workspacePath, {
        presentationRenderMode: "fast",
      })
      .then(validateViewerResult)
      .then((data) => {
        applyBestViewerData(data);
        return data;
      })
      .catch((err: unknown) => {
        lastLoadError = err instanceof Error ? err.message : lastLoadError;
        throw err;
      });

    void Promise.allSettled([fastRequest, fullRequest]).then((results) => {
      if (cancelled) return;
      setRenderingImages(false);
      setLoading(false);
      if (results.every((result) => result.status === "rejected")) {
        setError(lastLoadError);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [cacheKey, canReuseCachedViewerData, filePath, workspacePath]);

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

  const preview = useMemo(
    () => fileData?.presentationPreview || null,
    [fileData],
  );
  const slideCount = preview?.slideCount ?? 0;
  const renderNotice =
    renderingImages || preview?.renderStatus === "rendering"
      ? t(
          "artifactViewer.presentation.rendering",
          "Rendering slide previews...",
        )
      : "";

  const handleCopyText = async () => {
    const text = buildPresentationText(preview);
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

  const renderBody = () => {
    if (loading && !preview) {
      return (
        <div className="presentation-artifact-state">
          {t("artifactViewer.presentation.loading", "Loading presentation...")}
        </div>
      );
    }
    if (error)
      return (
        <div className="presentation-artifact-state presentation-artifact-error">
          {error}
        </div>
      );
    if (!preview) {
      return (
        <div className="presentation-artifact-state">
          {t(
            "artifactViewer.presentation.noPreview",
            "No presentation preview available.",
          )}
        </div>
      );
    }
    return (
      <PresentationViewer
        fileName={fileName}
        sizeLabel={fileData ? formatFileSize(fileData.size) : undefined}
        preview={preview}
        onOpenExternal={handleOpenExternal}
        onShowInFinder={handleShowInFinder}
        showExternalActions={false}
        className="presentation-artifact-inner-viewer"
      />
    );
  };

  return (
    <section
      className={`presentation-artifact-viewer presentation-artifact-viewer-${mode}`}
    >
      <div className="presentation-artifact-viewer-tabbar">
        <div className="presentation-artifact-viewer-tab">
          <ArtifactFileTypeIcon
            filePath={filePath}
            className="presentation-viewer-file-icon"
          />
          <div className="presentation-artifact-viewer-tab-copy">
            <span className="presentation-artifact-viewer-tab-title">
              {fileName}
            </span>
            <span className="presentation-artifact-viewer-tab-meta">
              {formatLabel}
              {slideCount ? (
                <span>
                  {t("fileViewer.meta.slides", "{count} slides", {
                    count: slideCount,
                  })}
                </span>
              ) : null}
            </span>
          </div>
        </div>
        <button
          type="button"
          className="presentation-artifact-viewer-tool-btn"
          onClick={() => void handleCopyText()}
          disabled={!preview}
          title={t(
            "artifactViewer.presentation.copyText",
            "Copy slide text and notes",
          )}
        >
          <Copy size={14} />
          <span className="presentation-artifact-viewer-tool-label">
            {t("common.copy", "Copy")}
          </span>
        </button>
        <button
          type="button"
          className="presentation-artifact-viewer-tool-btn"
          onClick={handleOpenExternal}
          title={t("artifactViewer.openExternally", "Open externally")}
        >
          <ExternalLink size={14} />
          <span className="presentation-artifact-viewer-tool-label">
            {t("common.open", "Open")}
          </span>
        </button>
        <button
          type="button"
          className="presentation-artifact-viewer-tool-btn"
          onClick={handleShowInFinder}
          title={t("common.openInFolder", "Open in folder")}
        >
          <FolderOpen size={14} />
          <span className="presentation-artifact-viewer-tool-label">
            {t("common.folder", "Folder")}
          </span>
        </button>
        <ArtifactDownloadButton
          filePath={filePath}
          workspacePath={workspacePath}
          className="presentation-artifact-viewer-download-btn"
        />
        {(copyMessage || renderNotice) && (
          <div className="presentation-artifact-viewer-message">
            {copyMessage || renderNotice}
          </div>
        )}
        <button
          type="button"
          className="presentation-artifact-viewer-header-fullscreen"
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
          className="presentation-artifact-viewer-close"
          onClick={onClose}
          title={t("artifactViewer.presentation.close", "Close presentation")}
        >
          <X size={17} />
        </button>
      </div>

      <div className="presentation-artifact-viewer-content">{renderBody()}</div>

      {mode === "fullscreen" && onSendMessage && (
        <div className="spreadsheet-viewer-fullscreen-controls">
          {turnContext && (
            <ArtifactTurnProgressPanel turnContext={turnContext}>
              <PresentationArtifactCard
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
                      "artifactViewer.presentation.editPlaceholder",
                      "Describe how you want to change this presentation",
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
                {t("artifactViewer.workInFolder", "Work in a folder")}
              </span>
              <span className="shell-toggle shell-toggle-inline enabled">
                Shell
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
