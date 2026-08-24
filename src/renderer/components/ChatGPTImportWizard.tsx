import { useState, useEffect, useRef } from "react";
import { translate, useLanguage } from "../i18n";

// Types inlined since preload types aren't directly importable in renderer
interface ChatGPTImportProgress {
  phase: "parsing" | "distilling" | "storing" | "done" | "error";
  current: number;
  total: number;
  conversationTitle?: string;
  memoriesCreated: number;
  error?: string;
}

interface ChatGPTImportResult {
  success: boolean;
  memoriesCreated: number;
  conversationsProcessed: number;
  skipped: number;
  errors: string[];
  sourceFileHash: string;
}

type WizardStep = "tutorial" | "select" | "options" | "importing" | "done";

// Cached model from LLM settings (same shape as CachedModelInfo)
interface CachedModel {
  key: string; // The actual model ID for the provider
  displayName: string;
  description: string;
}

// Map providerType → settings field that holds cached models
const CACHED_MODELS_KEY: Record<string, string> = {
  bedrock: "cachedBedrockModels",
  gemini: "cachedGeminiModels",
  openrouter: "cachedOpenRouterModels",
  ollama: "cachedOllamaModels",
  openai: "cachedOpenAIModels",
  groq: "cachedGroqModels",
  xai: "cachedXaiModels",
  kimi: "cachedKimiModels",
  pi: "cachedPiModels",
};

const PROVIDER_LABELS: Record<string, string> = {
  anthropic: "Anthropic",
  bedrock: "AWS Bedrock",
  openai: "OpenAI",
  gemini: "Google Gemini",
  groq: "Groq",
  openrouter: "OpenRouter",
  xai: "xAI",
  ollama: "Ollama",
  azure: "Azure OpenAI",
  kimi: "Kimi",
  pi: "Pi",
};

interface ChatGPTImportWizardProps {
  workspaceId: string;
  onClose: () => void;
  onImportComplete?: () => void;
}

export function ChatGPTImportWizard({
  workspaceId,
  onClose,
  onImportComplete,
}: ChatGPTImportWizardProps) {
  useLanguage();
  const t = translate;
  const [step, setStep] = useState<WizardStep>("tutorial");
  const [filePath, setFilePath] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [fileSize, setFileSize] = useState<number>(0);
  const [forcePrivate, setForcePrivate] = useState(true);
  const [maxConversations, setMaxConversations] = useState(0);
  const [distillPreset, setDistillPreset] = useState("default");
  const [customModel, setCustomModel] = useState("");
  const [currentProvider, setCurrentProvider] = useState<string>("");
  const [currentModelName, setCurrentModelName] = useState<string>("");
  const [availableModels, setAvailableModels] = useState<CachedModel[]>([]);
  const [progress, setProgress] = useState<ChatGPTImportProgress | null>(null);
  const [result, setResult] = useState<ChatGPTImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  // Load available models for the current provider on mount
  useEffect(() => {
    (async () => {
      try {
        const settings = await window.electronAPI.getLLMSettings();
        const providerType = settings?.providerType || "";
        setCurrentProvider(providerType);

        // Get human-readable current model name from DB models
        const dbModels = await window.electronAPI.getLLMModels();
        const current = dbModels?.find(
          (m: { key: string }) => m.key === settings?.modelKey,
        );
        if (current) setCurrentModelName(current.displayName);

        // Get cached models for the current provider (fetched via "Refresh Models" in settings)
        const cacheKey = CACHED_MODELS_KEY[providerType];
        const cached: CachedModel[] | undefined = cacheKey
          ? settings?.[cacheKey]
          : undefined;
        if (cached && cached.length > 0) {
          setAvailableModels(cached);
        }
      } catch {
        // Non-critical — defaults will work fine
      }
    })();
  }, []);

  useEffect(() => {
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
    };
  }, []);

  const handleSelectFile = async () => {
    try {
      const files = await window.electronAPI.selectFiles();
      if (files && files.length > 0) {
        const file = files[0];
        if (!file.name.endsWith(".json")) {
          setError(
            t(
              "chatgptImport.error.selectJson",
              "Please select a JSON file. The ChatGPT export contains a file called conversations.json.",
            ),
          );
          return;
        }
        setFilePath(file.path);
        setFileName(file.name);
        setFileSize(file.size);
        setError(null);
        setStep("options");
      }
    } catch {
      setError(
        t(
          "chatgptImport.error.selectFile",
          "Failed to select file. Please try again.",
        ),
      );
    }
  };

  const handleStartImport = async () => {
    if (!filePath) return;

    setStep("importing");
    setError(null);

    // Subscribe to progress
    unsubscribeRef.current = window.electronAPI.onChatGPTImportProgress((p) => {
      setProgress(p);
    });

    try {
      // Resolve distillation model from preset or custom field
      const distillOpts: { distillProvider?: string; distillModel?: string } =
        {};
      if (distillPreset === "custom") {
        if (customModel.trim()) distillOpts.distillModel = customModel.trim();
      } else if (distillPreset !== "default") {
        // Preset value = the actual model ID from the provider's cached model list
        distillOpts.distillModel = distillPreset;
      }

      const importResult = await window.electronAPI.importChatGPT({
        workspaceId,
        filePath,
        maxConversations,
        minMessages: 2,
        forcePrivate,
        ...distillOpts,
      });

      setResult(importResult);
      setStep("done");
      if (importResult.success) {
        onImportComplete?.();
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t("chatgptImport.error.unexpected", "Import failed unexpectedly."),
      );
      setStep("done");
    } finally {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    }
  };

  const handleCancel = async () => {
    setCancelling(true);
    try {
      await window.electronAPI.cancelChatGPTImport();
    } catch {
      // Best-effort cancel
    }
  };

  const formatSize = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  return (
    <div className="settings-section">
      <h3 className="settings-section-title">
        {t("chatgptImport.title", "Import ChatGPT History")}
      </h3>
      <p className="settings-section-description">
        {t(
          "chatgptImport.description",
          "Bring your ChatGPT conversations into NeoWorker to build a richer memory. Your data is processed locally and never leaves your machine.",
        )}
      </p>

      {/* Step 1: Tutorial */}
      {step === "tutorial" && (
        <div className="chatgpt-import-step">
          <div className="chatgpt-import-tutorial">
            <h4
              style={{
                margin: "0 0 12px 0",
                color: "var(--color-text-primary)",
              }}
            >
              {t(
                "chatgptImport.tutorial.title",
                "How to export your ChatGPT data",
              )}
            </h4>

            <div className="chatgpt-import-steps">
              <div className="chatgpt-import-step-item">
                <span className="chatgpt-import-step-number">1</span>
                <div>
                  <strong>
                    {t(
                      "chatgptImport.tutorial.openSettings",
                      "Open ChatGPT Settings",
                    )}
                  </strong>
                  <p>
                    {t(
                      "chatgptImport.tutorial.openSettingsBodyBefore",
                      "Go to",
                    )}{" "}
                    <span style={{ color: "var(--color-accent)" }}>
                      chatgpt.com
                    </span>{" "}
                    {t(
                      "chatgptImport.tutorial.openSettingsBodyAfter",
                      "and click your profile icon in the top-right corner, then select",
                    )}{" "}
                    <strong>{t("common.settings", "Settings")}</strong>.
                  </p>
                </div>
              </div>

              <div className="chatgpt-import-step-item">
                <span className="chatgpt-import-step-number">2</span>
                <div>
                  <strong>
                    {t(
                      "chatgptImport.tutorial.requestExport",
                      "Request your data export",
                    )}
                  </strong>
                  <p>
                    {t(
                      "chatgptImport.tutorial.requestExportBody1",
                      "Navigate to",
                    )}{" "}
                    <strong>
                      {t("chatgptImport.dataControls", "Data Controls")}
                    </strong>{" "}
                    {t(
                      "chatgptImport.tutorial.requestExportBody2",
                      "and click",
                    )}{" "}
                    <strong>
                      {t("chatgptImport.exportData", "Export data")}
                    </strong>
                    . {t("chatgptImport.tutorial.requestExportBody3", "Click")}{" "}
                    <strong>
                      {t("chatgptImport.confirmExport", "Confirm export")}
                    </strong>
                    .
                  </p>
                </div>
              </div>

              <div className="chatgpt-import-step-item">
                <span className="chatgpt-import-step-number">3</span>
                <div>
                  <strong>
                    {t(
                      "chatgptImport.tutorial.downloadZip",
                      "Download the ZIP",
                    )}
                  </strong>
                  <p>
                    {t(
                      "chatgptImport.tutorial.downloadZipBody",
                      "OpenAI will email you a download link. This can vary from a few minutes to a couple of hours. Download and unzip the file.",
                    )}
                  </p>
                </div>
              </div>

              <div className="chatgpt-import-step-item">
                <span className="chatgpt-import-step-number">4</span>
                <div>
                  <strong>
                    {t(
                      "chatgptImport.tutorial.selectJson",
                      "Select conversations.json",
                    )}
                  </strong>
                  <p>
                    {t(
                      "chatgptImport.tutorial.selectJsonBodyBefore",
                      "Inside the unzipped folder, find the file called",
                    )}{" "}
                    <code
                      style={{
                        background: "var(--color-bg-tertiary)",
                        padding: "2px 6px",
                        borderRadius: "4px",
                      }}
                    >
                      conversations.json
                    </code>
                    .{" "}
                    {t(
                      "chatgptImport.tutorial.selectJsonBodyAfter",
                      "You will select this file in the next step.",
                    )}
                  </p>
                </div>
              </div>
            </div>

            <div className="chatgpt-import-security-note">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                style={{ flexShrink: 0, marginTop: "2px" }}
              >
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              <div>
                <strong>
                  {t(
                    "chatgptImport.privacy.title",
                    "Your privacy is protected",
                  )}
                </strong>
                <p style={{ margin: "4px 0 0" }}>
                  {t(
                    "chatgptImport.privacy.body",
                    "Your chat history is processed entirely on your device. The raw file is read once, key insights are extracted using your configured LLM, and only the distilled memories are stored. The original file is never copied or retained by NeoWorker. We strongly recommend deleting the export file after import.",
                  )}
                </p>
              </div>
            </div>
          </div>

          <div className="chatgpt-import-actions">
            <button
              className="chatgpt-import-btn chatgpt-import-btn-primary"
              onClick={() => setStep("select")}
            >
              {t("chatgptImport.action.ready", "I have my export ready")}
            </button>
            <button
              className="chatgpt-import-btn chatgpt-import-btn-secondary"
              onClick={onClose}
            >
              {t("common.cancel", "Cancel")}
            </button>
          </div>
        </div>
      )}

      {/* Step 2: File selection */}
      {step === "select" && (
        <div className="chatgpt-import-step">
          <div className="chatgpt-import-dropzone" onClick={handleSelectFile}>
            <svg
              width="40"
              height="40"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <p
              style={{
                margin: "12px 0 4px",
                color: "var(--color-text-primary)",
                fontWeight: 500,
              }}
            >
              {t(
                "chatgptImport.select.click",
                "Click to select conversations.json",
              )}
            </p>
            <p
              style={{
                margin: 0,
                fontSize: "13px",
                color: "var(--color-text-tertiary)",
              }}
            >
              {t(
                "chatgptImport.select.fromExport",
                "From your ChatGPT data export",
              )}
            </p>
          </div>

          {error && <div className="chatgpt-import-error">{error}</div>}

          <div className="chatgpt-import-actions">
            <button
              className="chatgpt-import-btn chatgpt-import-btn-secondary"
              onClick={() => {
                setStep("tutorial");
                setError(null);
              }}
            >
              {t("common.back", "Back")}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Options */}
      {step === "options" && (
        <div className="chatgpt-import-step">
          <div className="chatgpt-import-file-info">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              style={{ color: "var(--color-accent)", flexShrink: 0 }}
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            <div>
              <div
                style={{ fontWeight: 500, color: "var(--color-text-primary)" }}
              >
                {fileName}
              </div>
              <div
                style={{
                  fontSize: "12px",
                  color: "var(--color-text-tertiary)",
                }}
              >
                {formatSize(fileSize)}
              </div>
            </div>
          </div>

          <div className="settings-form-group" style={{ marginTop: "16px" }}>
            <label className="settings-label">
              {t(
                "chatgptImport.options.maxConversations",
                "Max conversations to import",
              )}
            </label>
            <select
              value={maxConversations}
              onChange={(e) => setMaxConversations(parseInt(e.target.value))}
              className="settings-select"
            >
              <option value="0">
                {t(
                  "chatgptImport.options.allConversations",
                  "All conversations",
                )}
              </option>
              <option value="50">
                {t("chatgptImport.options.quickTest", "50 (quick test)")}
              </option>
              <option value="200">200</option>
              <option value="500">500</option>
              <option value="1000">1000</option>
              <option value="2000">2000</option>
            </select>
            <p className="settings-form-hint">
              {t(
                "chatgptImport.options.maxHint",
                "More conversations means better memory, but takes longer to process. Each conversation requires an LLM call to distil key insights.",
              )}
            </p>
          </div>

          <div className="settings-form-group">
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: "12px",
              }}
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    fontWeight: 500,
                    color: "var(--color-text-primary)",
                  }}
                >
                  {t(
                    "chatgptImport.options.privateTitle",
                    "Mark all imported memories as private",
                  )}
                </div>
                <p
                  className="settings-form-hint"
                  style={{ marginTop: "4px", marginBottom: 0 }}
                >
                  {t(
                    "chatgptImport.options.privateHint",
                    "Recommended. Private memories are never exposed through gateway channels or shared contexts. Personal chat history should stay private.",
                  )}
                </p>
              </div>
              <label
                className="settings-toggle"
                style={{ flexShrink: 0, marginTop: "2px" }}
              >
                <input
                  type="checkbox"
                  checked={forcePrivate}
                  onChange={(e) => setForcePrivate(e.target.checked)}
                />
                <span className="toggle-slider" />
              </label>
            </div>
          </div>

          <div className="settings-form-group">
            <label className="settings-label">
              {t(
                "chatgptImport.options.distillationModel",
                "Distillation model",
              )}
            </label>
            <select
              value={distillPreset}
              onChange={(e) => setDistillPreset(e.target.value)}
              className="settings-select"
            >
              <option value="default">
                {t(
                  "chatgptImport.options.useCurrentModel",
                  "Use current model",
                )}
                {currentModelName ? ` (${currentModelName})` : ""}
              </option>
              {/* Show cached models from the user's provider (fetched via Refresh Models in settings) */}
              {availableModels.length > 0 && (
                <optgroup
                  label={`${PROVIDER_LABELS[currentProvider] || currentProvider} models`}
                >
                  {availableModels.map((m) => (
                    <option key={m.key} value={m.key}>
                      {m.displayName}
                      {m.description ? ` — ${m.description}` : ""}
                    </option>
                  ))}
                </optgroup>
              )}
              <option value="custom">
                {t(
                  "chatgptImport.options.customModel",
                  "Enter model ID manually...",
                )}
              </option>
            </select>
            {availableModels.length === 0 &&
              currentProvider &&
              CACHED_MODELS_KEY[currentProvider] && (
                <p
                  className="settings-form-hint"
                  style={{ color: "var(--color-warning, #f59e0b)" }}
                >
                  {t(
                    "chatgptImport.options.noCachedModels",
                    'No cached models found. Go to Settings → LLM Provider and click "Refresh Models" to load available models.',
                  )}
                </p>
              )}
            <p className="settings-form-hint">
              {t(
                "chatgptImport.options.costHint",
                "Each conversation requires an LLM call. For large imports, pick a cheaper/faster model to reduce cost.",
              )}
            </p>
          </div>

          {distillPreset === "custom" && (
            <div className="settings-form-group">
              <label className="settings-label">
                {t("aiModels.common.modelId", "Model ID")}
              </label>
              <input
                type="text"
                value={customModel}
                onChange={(e) => setCustomModel(e.target.value)}
                placeholder={
                  currentProvider === "bedrock"
                    ? "e.g. us.anthropic.claude-haiku-4-5-20251001-v1:0"
                    : "e.g. claude-haiku-4-5"
                }
                className="settings-input"
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: "6px",
                  border: "1px solid var(--color-border)",
                  background: "var(--color-bg-secondary)",
                  color: "var(--color-text-primary)",
                  fontSize: "13px",
                }}
              />
              <p className="settings-form-hint">
                {t(
                  "chatgptImport.options.modelIdHint",
                  "Enter the exact model ID for your {provider} provider.",
                  {
                    provider: PROVIDER_LABELS[currentProvider] || "LLM",
                  },
                )}
              </p>
            </div>
          )}

          {error && <div className="chatgpt-import-error">{error}</div>}

          <div className="chatgpt-import-actions">
            <button
              className="chatgpt-import-btn chatgpt-import-btn-primary"
              onClick={handleStartImport}
            >
              {t("chatgptImport.action.startImport", "Start Import")}
            </button>
            <button
              className="chatgpt-import-btn chatgpt-import-btn-secondary"
              onClick={() => {
                setStep("select");
                setFilePath(null);
                setError(null);
              }}
            >
              {t("common.back", "Back")}
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Importing */}
      {step === "importing" && (
        <div className="chatgpt-import-step">
          <div className="chatgpt-import-progress">
            <div className="chatgpt-import-progress-header">
              <span
                style={{ fontWeight: 500, color: "var(--color-text-primary)" }}
              >
                {progress?.phase === "parsing" &&
                  t("chatgptImport.progress.parsing", "Parsing export file...")}
                {progress?.phase === "distilling" &&
                  t(
                    "chatgptImport.progress.distilling",
                    "Distilling conversations...",
                  )}
                {progress?.phase === "storing" &&
                  t("chatgptImport.progress.storing", "Storing memories...")}
                {!progress &&
                  t("chatgptImport.progress.starting", "Starting import...")}
              </span>
              {progress && progress.total > 0 && (
                <span
                  style={{
                    color: "var(--color-text-tertiary)",
                    fontSize: "13px",
                  }}
                >
                  {progress.current} / {progress.total}
                </span>
              )}
            </div>

            {progress && progress.total > 0 && (
              <div className="chatgpt-import-progress-bar-container">
                <div
                  className="chatgpt-import-progress-bar"
                  style={{
                    width: `${Math.round((progress.current / progress.total) * 100)}%`,
                  }}
                />
              </div>
            )}

            {progress?.conversationTitle && (
              <p
                style={{
                  margin: "8px 0 0",
                  fontSize: "13px",
                  color: "var(--color-text-tertiary)",
                }}
              >
                {t("chatgptImport.progress.processing", "Processing: {title}", {
                  title: progress.conversationTitle,
                })}
              </p>
            )}

            <div className="chatgpt-import-progress-stats">
              <div>
                <div
                  style={{
                    fontSize: "20px",
                    fontWeight: 600,
                    color: "var(--color-text-primary)",
                  }}
                >
                  {progress?.memoriesCreated ?? 0}
                </div>
                <div
                  style={{
                    fontSize: "12px",
                    color: "var(--color-text-tertiary)",
                  }}
                >
                  {t("chatgptImport.stats.memoriesCreated", "Memories created")}
                </div>
              </div>
              <div>
                <div
                  style={{
                    fontSize: "20px",
                    fontWeight: 600,
                    color: "var(--color-text-primary)",
                  }}
                >
                  {progress?.current ?? 0}
                </div>
                <div
                  style={{
                    fontSize: "12px",
                    color: "var(--color-text-tertiary)",
                  }}
                >
                  {t(
                    "chatgptImport.stats.conversationsProcessed",
                    "Conversations processed",
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="chatgpt-import-actions" style={{ marginTop: "16px" }}>
            <button
              className="chatgpt-import-btn chatgpt-import-btn-secondary"
              onClick={handleCancel}
              disabled={cancelling}
              style={{ opacity: cancelling ? 0.5 : 1 }}
            >
              {cancelling
                ? t("chatgptImport.action.cancelling", "Cancelling...")
                : t("chatgptImport.action.cancelImport", "Cancel Import")}
            </button>
          </div>

          <p
            style={{
              fontSize: "13px",
              color: "var(--color-text-tertiary)",
              textAlign: "center",
              margin: "12px 0 0",
            }}
          >
            {t(
              "chatgptImport.progress.timeHint",
              "This may take a while depending on your export size and LLM provider speed.",
            )}
          </p>
        </div>
      )}

      {/* Step 5: Done */}
      {step === "done" && (
        <div className="chatgpt-import-step">
          {result?.success ? (
            <div className="chatgpt-import-result chatgpt-import-result-success">
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                style={{ color: "var(--color-success, #22c55e)" }}
              >
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
              <h4
                style={{
                  margin: "12px 0 8px",
                  color: "var(--color-text-primary)",
                }}
              >
                {t("chatgptImport.done.complete", "Import complete")}
              </h4>
              <div className="chatgpt-import-result-stats">
                <div className="chatgpt-import-result-stat">
                  <strong>{result.memoriesCreated}</strong>
                  <span>
                    {t(
                      "chatgptImport.stats.memoriesCreatedLower",
                      "memories created",
                    )}
                  </span>
                </div>
                <div className="chatgpt-import-result-stat">
                  <strong>{result.conversationsProcessed}</strong>
                  <span>
                    {t(
                      "chatgptImport.stats.conversationsProcessedLower",
                      "conversations processed",
                    )}
                  </span>
                </div>
                {result.skipped > 0 && (
                  <div className="chatgpt-import-result-stat">
                    <strong>{result.skipped}</strong>
                    <span>
                      {t(
                        "chatgptImport.stats.skippedShort",
                        "skipped (too short)",
                      )}
                    </span>
                  </div>
                )}
              </div>

              <div
                className="chatgpt-import-security-note"
                style={{ marginTop: "16px" }}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  style={{ flexShrink: 0, marginTop: "2px" }}
                >
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
                <div>
                  <strong>
                    {t("chatgptImport.security.title", "Security reminder")}
                  </strong>
                  <p style={{ margin: "4px 0 0" }}>
                    {t(
                      "chatgptImport.security.body",
                      "Please delete the conversations.json file and the ChatGPT export ZIP from your computer now. NeoWorker has extracted all useful information and no longer needs the source file.",
                    )}
                  </p>
                </div>
              </div>

              {result.errors.length > 0 && (
                <details style={{ marginTop: "12px", fontSize: "13px" }}>
                  <summary
                    style={{
                      cursor: "pointer",
                      color: "var(--color-text-secondary)",
                    }}
                  >
                    {t(
                      "chatgptImport.done.issues",
                      "{count} conversation(s) had issues",
                      { count: result.errors.length },
                    )}
                  </summary>
                  <ul
                    style={{
                      margin: "8px 0",
                      paddingLeft: "20px",
                      color: "var(--color-text-tertiary)",
                    }}
                  >
                    {result.errors.slice(0, 10).map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                    {result.errors.length > 10 && (
                      <li>
                        {t(
                          "chatgptImport.done.moreErrors",
                          "...and {count} more",
                          { count: result.errors.length - 10 },
                        )}
                      </li>
                    )}
                  </ul>
                </details>
              )}
            </div>
          ) : (
            <div className="chatgpt-import-result chatgpt-import-result-error">
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                style={{ color: "var(--color-error, #ef4444)" }}
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
              <h4
                style={{
                  margin: "12px 0 8px",
                  color: "var(--color-text-primary)",
                }}
              >
                {t("chatgptImport.done.failed", "Import failed")}
              </h4>
              <p style={{ color: "var(--color-text-secondary)", margin: 0 }}>
                {error ||
                  result?.errors?.[0] ||
                  t(
                    "chatgptImport.error.unexpectedOccurred",
                    "An unexpected error occurred.",
                  )}
              </p>
              {result && result.memoriesCreated > 0 && (
                <p
                  style={{
                    color: "var(--color-text-tertiary)",
                    fontSize: "13px",
                    marginTop: "8px",
                  }}
                >
                  {t(
                    "chatgptImport.done.partialCreated",
                    "{count} memories were created before the error occurred.",
                    {
                      count: result.memoriesCreated,
                    },
                  )}
                </p>
              )}
            </div>
          )}

          <div className="chatgpt-import-actions">
            <button
              className="chatgpt-import-btn chatgpt-import-btn-primary"
              onClick={onClose}
            >
              {t("common.done", "Done")}
            </button>
            {!result?.success && (
              <button
                className="chatgpt-import-btn chatgpt-import-btn-secondary"
                onClick={() => {
                  setStep("select");
                  setResult(null);
                  setError(null);
                  setProgress(null);
                }}
              >
                {t("common.tryAgain", "Try Again")}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
