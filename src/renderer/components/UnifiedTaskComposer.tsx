import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import {
  ArrowUp,
  ChevronDown,
  FileText,
  FolderKanban,
  LoaderCircle,
  Plus,
  ShieldAlert,
  ShieldCheck,
  X,
} from "lucide-react";
import type {
  LLMModelInfo,
  LLMProviderInfo,
  LLMProviderType,
  LLMReasoningEffort,
  PermissionMode,
  Workspace,
} from "../../shared/types";
import {
  composeMessageWithAttachments,
  formatFileSize,
  type ImportedAttachment,
  type PendingAttachment,
} from "./MainContent/attachments";
import {
  PromptComposerInput,
  type IntegrationMentionSpan,
  type PromptComposerInputHandle,
} from "./PromptComposerInput";
import { ModelDropdown } from "./MainContent/ModelDropdown";
import type { SettingsTab } from "./MainContent/main-content-types";
import { AttachmentImagePreview, isPreviewableImageAttachment } from "./AttachmentImagePreview";
import "./unified-task-composer.css";
import { translate } from "../i18n/index";

const inlineDraftCache = new Map<string, string>();

interface UnifiedTaskComposerProps {
  cacheKey: string;
  workspace: Workspace | null;
  label: string;
  placeholder: string;
  submitLabel?: string;
  autoFocus?: boolean;
  showLabel?: boolean;
  idleHint?: string;
  draftRequest?: { id: number; value: string } | null;
  permissionMode?: PermissionMode;
  onPermissionModeChange?: (mode: PermissionMode) => void;
  onChangeWorkspace?: () => void;
  selectedModel?: string;
  selectedProvider?: LLMProviderType;
  selectedReasoningEffort?: LLMReasoningEffort;
  availableModels?: LLMModelInfo[];
  availableProviders?: LLMProviderInfo[];
  onModelChange?: (selection: {
    providerType?: LLMProviderType;
    modelKey: string;
    reasoningEffort?: LLMReasoningEffort;
  }) => void;
  onOpenSettings?: (tab?: SettingsTab) => void;
  onSubmit: (prompt: string) => boolean | void | Promise<boolean | void>;
}

export function UnifiedTaskComposer({
  cacheKey,
  workspace,
  label,
  placeholder,
  submitLabel = translate("generated.components.unifiedtaskcomposer.71.0", "send"),
  autoFocus = false,
  showLabel = true,
  idleHint = translate(
    "generated.components.unifiedtaskcomposer.74.1",
    "Enter to send · Shift+Enter to wrap",
  ),
  draftRequest = null,
  permissionMode = "default",
  onPermissionModeChange,
  onChangeWorkspace,
  selectedModel,
  selectedProvider,
  selectedReasoningEffort,
  availableModels = [],
  availableProviders = [],
  onModelChange,
  onOpenSettings,
  onSubmit,
}: UnifiedTaskComposerProps) {
  const inputRef = useRef<PromptComposerInputHandle>(null);
  const permissionMenuRef = useRef<HTMLDivElement>(null);
  const activeCacheKeyRef = useRef(cacheKey);
  const valueRef = useRef(inlineDraftCache.get(cacheKey) || "");
  const [value, setValue] = useState(valueRef.current);
  const [mentions, setMentions] = useState<IntegrationMentionSpan[]>([]);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [stage, setStage] = useState<"idle" | "selecting" | "importing" | "reading" | "sending">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);
  const [permissionMenuOpen, setPermissionMenuOpen] = useState(false);

  useEffect(() => {
    if (activeCacheKeyRef.current === cacheKey) return;
    inlineDraftCache.set(activeCacheKeyRef.current, valueRef.current);
    activeCacheKeyRef.current = cacheKey;
    const nextValue = inlineDraftCache.get(cacheKey) || "";
    valueRef.current = nextValue;
    setValue(nextValue);
    setMentions([]);
    setAttachments([]);
    setError(null);
  }, [cacheKey]);

  useEffect(() => {
    valueRef.current = value;
    if (value.length > 0) inlineDraftCache.set(activeCacheKeyRef.current, value);
    else inlineDraftCache.delete(activeCacheKeyRef.current);
  }, [value]);

  useEffect(
    () => () => {
      if (valueRef.current.length > 0) {
        inlineDraftCache.set(activeCacheKeyRef.current, valueRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (!autoFocus) return;
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [autoFocus]);

  useEffect(() => {
    if (!draftRequest) return;
    setValue(draftRequest.value);
    setMentions([]);
    setError(null);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [draftRequest?.id]);

  useEffect(() => {
    if (!permissionMenuOpen) return;
    const handleOutsideClick = (event: MouseEvent) => {
      if (!permissionMenuRef.current?.contains(event.target as Node)) {
        setPermissionMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [permissionMenuOpen]);

  const attachFiles = async () => {
    if (!workspace || stage !== "idle") return;
    setError(null);
    setStage("selecting");
    try {
      const selected = await window.electronAPI.selectFiles(
        workspace.isTemp ? undefined : workspace.path,
      );
      if (!selected?.length) return;
      setAttachments((current) => {
        const existing = new Set(current.map((item) => item.path));
        return [
          ...current,
          ...selected
            .filter((item) => !existing.has(item.path))
            .map((item) => ({
              ...item,
              id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            })),
        ].slice(0, 10);
      });
    } catch (attachmentError) {
      console.error("Failed to add inline composer attachments:", attachmentError);
      setError(
        translate(
          "generated.components.unifiedtaskcomposer.174.2",
          "Failed to add attachment, please try again.",
        ),
      );
    } finally {
      setStage("idle");
    }
  };

  const submit = async () => {
    if (stage !== "idle") return;
    const liveDraftSnapshot = inputRef.current?.getSnapshot();
    const liveValue = liveDraftSnapshot?.value ?? valueRef.current;
    valueRef.current = liveValue;
    if (liveValue !== value) setValue(liveValue);
    if (liveDraftSnapshot) setMentions(liveDraftSnapshot.mentions);
    const draft = liveValue.trim();
    if (!draft && attachments.length === 0) {
      setError(
        translate(
          "generated.components.unifiedtaskcomposer.184.3",
          "Please start by describing what is to be done.",
        ),
      );
      inputRef.current?.focus();
      return;
    }
    if (!workspace) {
      setError(
        translate(
          "generated.components.unifiedtaskcomposer.189.4",
          "Please select a workspace first.",
        ),
      );
      return;
    }

    setError(null);
    let imported: ImportedAttachment[] = [];
    try {
      if (attachments.length > 0) {
        setStage("importing");
        imported = await window.electronAPI.importFilesToWorkspace({
          workspaceId: workspace.id,
          files: attachments
            .map((attachment) => attachment.path)
            .filter((path): path is string => Boolean(path)),
        });
        setStage("reading");
      } else {
        setStage("sending");
      }

      const composed = await composeMessageWithAttachments(workspace.path, draft, imported);
      setStage("sending");
      const result = await Promise.resolve(onSubmit(composed.message));
      if (result === false) return;
      setValue("");
      setMentions([]);
      setAttachments([]);
      inlineDraftCache.delete(activeCacheKeyRef.current);
    } catch (submitError) {
      console.error("Failed to submit inline composer draft:", submitError);
      setError(
        submitError instanceof Error
          ? submitError.message
          : translate(
              "generated.components.unifiedtaskcomposer.223.5",
              "Submission failed, please try again.",
            ),
      );
    } finally {
      setStage("idle");
    }
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.currentTarget.blur();
      return;
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submit();
    }
  };

  const stageLabel =
    stage === "selecting"
      ? translate("generated.components.unifiedtaskcomposer.242.6", "Select attachment…")
      : stage === "importing"
        ? translate("generated.components.unifiedtaskcomposer.244.7", "Import attachments…")
        : stage === "reading"
          ? translate("generated.components.unifiedtaskcomposer.246.8", "Parse attachment…")
          : stage === "sending"
            ? translate("generated.components.unifiedtaskcomposer.248.9", "Submitting…")
            : null;

  return (
    <section className="unified-task-composer" aria-label={label}>
      <label className={showLabel ? "unified-task-composer-label" : "sr-only"}>{label}</label>
      {attachments.length > 0 ? (
        <div
          className="unified-task-composer-attachments"
          aria-label={translate(
            "generated.components.unifiedtaskcomposer.255.10",
            "Attachment added",
          )}
        >
          {attachments.map((attachment) =>
            isPreviewableImageAttachment(attachment.name, attachment.mimeType) ? (
              <AttachmentImagePreview
                key={attachment.id}
                name={attachment.name}
                filePath={attachment.path}
                workspacePath={workspace?.path}
                mimeType={attachment.mimeType}
                dataBase64={attachment.dataBase64}
                sizeLabel={formatFileSize(attachment.size)}
                onRemove={() =>
                  setAttachments((current) => current.filter((item) => item.id !== attachment.id))
                }
              />
            ) : (
              <span key={attachment.id}>
                <FileText size={14} aria-hidden="true" />
                <b>{attachment.name}</b>
                <small>{formatFileSize(attachment.size)}</small>
                <button
                  type="button"
                  onClick={() =>
                    setAttachments((current) => current.filter((item) => item.id !== attachment.id))
                  }
                  aria-label={translate("composer.removeAttachment", "Remove attachment {name}", {
                    name: attachment.name,
                  })}
                >
                  <X size={12} aria-hidden="true" />
                </button>
              </span>
            ),
          )}
        </div>
      ) : null}
      <div className="unified-task-composer-input-shell">
        <PromptComposerInput
          ref={inputRef}
          className="unified-task-composer-input"
          value={value}
          mentions={mentions}
          placeholder={placeholder}
          ariaLabel={label}
          onChange={(nextValue, _cursor, nextMentions) => {
            valueRef.current = nextValue;
            if (nextValue.length > 0) {
              inlineDraftCache.set(activeCacheKeyRef.current, nextValue);
            } else {
              inlineDraftCache.delete(activeCacheKeyRef.current);
            }
            setValue(nextValue);
            setMentions(nextMentions);
            if (error) setError(null);
          }}
          onKeyDown={handleKeyDown}
          onPaste={() => undefined}
          onCursorChange={() => undefined}
        />
        <div className="unified-task-composer-toolbar">
          <div className="unified-task-composer-toolbar-primary">
            <button
              type="button"
              onClick={() => void attachFiles()}
              disabled={!workspace || stage !== "idle"}
              aria-label={translate(
                "generated.components.unifiedtaskcomposer.297.11",
                "Upload files",
              )}
              title={translate("generated.components.unifiedtaskcomposer.298.12", "Upload files")}
            >
              <Plus size={17} aria-hidden="true" />
            </button>
            <div className="unified-task-composer-permission" ref={permissionMenuRef}>
              <button
                type="button"
                className={`unified-task-composer-pill ${permissionMode === "bypass_permissions" ? "is-full-access" : ""}`}
                onClick={() => setPermissionMenuOpen((open) => !open)}
                aria-haspopup="menu"
                aria-expanded={permissionMenuOpen}
                title={translate(
                  "generated.components.unifiedtaskcomposer.309.13",
                  "Set execution permissions for this team task",
                )}
              >
                {permissionMode === "bypass_permissions" ? (
                  <ShieldAlert size={15} aria-hidden="true" />
                ) : (
                  <ShieldCheck size={15} aria-hidden="true" />
                )}
                <span>
                  {permissionMode === "bypass_permissions"
                    ? translate("generated.components.unifiedtaskcomposer.316.14", "full access")
                    : translate(
                        "generated.components.unifiedtaskcomposer.316.15",
                        "Default permissions",
                      )}
                </span>
                <ChevronDown size={13} aria-hidden="true" />
              </button>
              {permissionMenuOpen ? (
                <div className="unified-task-composer-permission-menu" role="menu">
                  <button
                    type="button"
                    className={permissionMode !== "bypass_permissions" ? "selected" : ""}
                    onClick={() => {
                      onPermissionModeChange?.("default");
                      setPermissionMenuOpen(false);
                    }}
                    role="menuitemradio"
                    aria-checked={permissionMode !== "bypass_permissions"}
                  >
                    <ShieldCheck size={16} aria-hidden="true" />
                    <span>
                      <strong>
                        {translate(
                          "generated.components.unifiedtaskcomposer.332.16",
                          "Default permissions",
                        )}
                      </strong>
                      <small>
                        {translate(
                          "generated.components.unifiedtaskcomposer.332.17",
                          "You will be asked before sensitive operations",
                        )}
                      </small>
                    </span>
                  </button>
                  <button
                    type="button"
                    className={permissionMode === "bypass_permissions" ? "selected" : ""}
                    onClick={() => {
                      onPermissionModeChange?.("bypass_permissions");
                      setPermissionMenuOpen(false);
                    }}
                    role="menuitemradio"
                    aria-checked={permissionMode === "bypass_permissions"}
                  >
                    <ShieldAlert size={16} aria-hidden="true" />
                    <span>
                      <strong>
                        {translate(
                          "generated.components.unifiedtaskcomposer.345.18",
                          "full access",
                        )}
                      </strong>
                      <small>
                        {translate(
                          "generated.components.unifiedtaskcomposer.345.19",
                          "Can directly execute commands and modify files",
                        )}
                      </small>
                    </span>
                  </button>
                </div>
              ) : null}
            </div>
            {onChangeWorkspace ? (
              <button
                type="button"
                className="unified-task-composer-pill unified-task-composer-workspace"
                onClick={onChangeWorkspace}
                title={
                  workspace?.path ||
                  translate("generated.components.unifiedtaskcomposer.355.20", "Select workspace")
                }
              >
                <FolderKanban size={15} aria-hidden="true" />
                <span>
                  {workspace?.name ||
                    translate(
                      "generated.components.unifiedtaskcomposer.358.21",
                      "Select workspace",
                    )}
                </span>
                <ChevronDown size={13} aria-hidden="true" />
              </button>
            ) : (
              <span
                title={
                  workspace?.path ||
                  translate(
                    "generated.components.unifiedtaskcomposer.362.22",
                    "No workspace selected yet",
                  )
                }
              >
                <FolderKanban size={15} aria-hidden="true" />
                {workspace?.name ||
                  translate(
                    "generated.components.unifiedtaskcomposer.364.23",
                    "No workspace selected",
                  )}
              </span>
            )}
          </div>
          <div className="unified-task-composer-toolbar-secondary">
            {selectedModel && selectedProvider && onModelChange ? (
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
            ) : null}
            <button
              type="button"
              className="unified-task-composer-submit"
              onClick={() => void submit()}
              disabled={stage !== "idle" || (!value.trim() && attachments.length === 0)}
              aria-label={submitLabel}
              title={submitLabel}
            >
              {stageLabel ? (
                <LoaderCircle size={16} className="is-spinning" aria-hidden="true" />
              ) : (
                <ArrowUp size={17} aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
      </div>
      <div className="unified-task-composer-feedback" aria-live="polite">
        {error || stageLabel || idleHint}
      </div>
    </section>
  );
}
