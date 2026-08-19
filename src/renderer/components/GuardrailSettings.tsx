import { useCallback, useEffect, useRef, useState } from "react";
import {
  GuardrailSettings as GuardrailSettingsType,
  DEFAULT_BLOCKED_COMMAND_PATTERNS,
  DEFAULT_TRUSTED_COMMAND_PATTERNS,
} from "../../shared/types";
import { translate, useLanguage } from "../i18n";
import "./guardrail-settings.css";

const serializeSettings = (settings: GuardrailSettingsType) =>
  JSON.stringify(settings);
const SHOW_COST_BUDGET_SETTINGS = false;
const SHOW_EXECUTION_CONTINUATION_SETTINGS = false;
const MAX_TOKENS_PER_TASK = 100_000_000;

export function GuardrailSettings() {
  useLanguage();
  const t = translate;
  const [settings, setSettings] = useState<GuardrailSettingsType | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [saveError, setSaveError] = useState("");
  const [newPattern, setNewPattern] = useState("");
  const [newTrustedPattern, setNewTrustedPattern] = useState("");
  const [newDomain, setNewDomain] = useState("");
  const [newWebSearchAllowedDomain, setNewWebSearchAllowedDomain] =
    useState("");
  const [newWebSearchBlockedDomain, setNewWebSearchBlockedDomain] =
    useState("");
  const [advancedCommandSettingsOpen, setAdvancedCommandSettingsOpen] =
    useState(false);
  const hasLoadedSettingsRef = useRef(false);
  const latestSettingsRef = useRef<GuardrailSettingsType | null>(null);
  const lastSavedSettingsRef = useRef<string | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const saveStatusTimerRef = useRef<number | null>(null);
  const activeSavesRef = useRef(0);
  const saveSequenceRef = useRef(0);

  const clearPendingSave = useCallback(() => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
  }, []);

  const showSaveStatus = useCallback((message: string, isError = false) => {
    if (saveStatusTimerRef.current !== null) {
      window.clearTimeout(saveStatusTimerRef.current);
    }
    if (isError) {
      setSaveMessage("");
      setSaveError(message);
    } else {
      setSaveError("");
      setSaveMessage(message);
    }
    saveStatusTimerRef.current = window.setTimeout(() => {
      setSaveMessage("");
      setSaveError("");
      saveStatusTimerRef.current = null;
    }, 3000);
  }, []);

  const loadSettings = useCallback(async () => {
    try {
      setLoading(true);
      const loaded = await window.electronAPI.getGuardrailSettings();
      const serialized = serializeSettings(loaded);
      latestSettingsRef.current = loaded;
      lastSavedSettingsRef.current = serialized;
      hasLoadedSettingsRef.current = true;
      setSettings(loaded);
    } catch (error) {
      console.error("Failed to load guardrail settings:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  const persistSettings = useCallback(
    async (
      nextSettings: GuardrailSettingsType,
      options: { manual?: boolean } = {},
    ) => {
      const serialized = serializeSettings(nextSettings);
      if (serialized === lastSavedSettingsRef.current) {
        if (options.manual) {
          showSaveStatus(t("guardrail.action.saved", "Settings saved"));
        }
        return;
      }

      const saveId = ++saveSequenceRef.current;
      activeSavesRef.current += 1;
      setSaving(true);
      setSaveError("");

      try {
        const result =
          await window.electronAPI.saveGuardrailSettings(nextSettings);
        const confirmedSettings = result.settings ?? nextSettings;
        const confirmedSerialized = serializeSettings(confirmedSettings);

        if (saveId === saveSequenceRef.current) {
          lastSavedSettingsRef.current = confirmedSerialized;

          if (
            serializeSettings(latestSettingsRef.current ?? nextSettings) ===
            serialized
          ) {
            latestSettingsRef.current = confirmedSettings;
            setSettings(confirmedSettings);
          }

          showSaveStatus(
            options.manual
              ? t("guardrail.action.saved", "Settings saved")
              : t(
                  "guardrail.action.autoSaved",
                  "Saved automatically; new checks will use these settings.",
                ),
          );
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error("Failed to save guardrail settings:", error);
        showSaveStatus(
          t(
            "guardrail.action.saveFailed",
            "Failed to save settings: {message}",
            { message },
          ),
          true,
        );
      } finally {
        activeSavesRef.current = Math.max(0, activeSavesRef.current - 1);
        if (activeSavesRef.current === 0) {
          setSaving(false);
        }
      }
    },
    [showSaveStatus, t],
  );

  useEffect(() => {
    void loadSettings();
    return () => {
      clearPendingSave();
      if (saveStatusTimerRef.current !== null) {
        window.clearTimeout(saveStatusTimerRef.current);
      }
    };
  }, [clearPendingSave, loadSettings]);

  useEffect(() => {
    latestSettingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    if (!settings || !hasLoadedSettingsRef.current) return;
    if (serializeSettings(settings) === lastSavedSettingsRef.current) return;

    clearPendingSave();
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      void persistSettings(settings);
    }, 700);

    return clearPendingSave;
  }, [clearPendingSave, persistSettings, settings]);

  const handleSave = async () => {
    if (!settings) return;
    clearPendingSave();
    await persistSettings(settings, { manual: true });
  };

  const handleReset = async () => {
    try {
      clearPendingSave();
      const defaults = await window.electronAPI.getGuardrailDefaults();
      latestSettingsRef.current = defaults;
      setSettings(defaults);
      await persistSettings(defaults, { manual: true });
    } catch (error) {
      console.error("Failed to reset guardrail settings:", error);
    }
  };

  const addCustomPattern = () => {
    if (!settings || !newPattern.trim()) return;
    if (settings.customBlockedPatterns.includes(newPattern.trim())) return;
    setSettings({
      ...settings,
      customBlockedPatterns: [
        ...settings.customBlockedPatterns,
        newPattern.trim(),
      ],
    });
    setNewPattern("");
  };

  const removeCustomPattern = (pattern: string) => {
    if (!settings) return;
    setSettings({
      ...settings,
      customBlockedPatterns: settings.customBlockedPatterns.filter(
        (p) => p !== pattern,
      ),
    });
  };

  const addTrustedPattern = () => {
    if (!settings || !newTrustedPattern.trim()) return;
    if (settings.trustedCommandPatterns.includes(newTrustedPattern.trim()))
      return;
    setSettings({
      ...settings,
      trustedCommandPatterns: [
        ...settings.trustedCommandPatterns,
        newTrustedPattern.trim(),
      ],
    });
    setNewTrustedPattern("");
  };

  const removeTrustedPattern = (pattern: string) => {
    if (!settings) return;
    setSettings({
      ...settings,
      trustedCommandPatterns: settings.trustedCommandPatterns.filter(
        (p) => p !== pattern,
      ),
    });
  };

  const addDomain = () => {
    if (!settings || !newDomain.trim()) return;
    if (settings.allowedDomains.includes(newDomain.trim())) return;
    setSettings({
      ...settings,
      allowedDomains: [...settings.allowedDomains, newDomain.trim()],
    });
    setNewDomain("");
  };

  const removeDomain = (domain: string) => {
    if (!settings) return;
    setSettings({
      ...settings,
      allowedDomains: settings.allowedDomains.filter((d) => d !== domain),
    });
  };

  const addWebSearchAllowedDomain = () => {
    if (!settings || !newWebSearchAllowedDomain.trim()) return;
    if (
      settings.webSearchAllowedDomains.includes(
        newWebSearchAllowedDomain.trim(),
      )
    )
      return;
    setSettings({
      ...settings,
      webSearchAllowedDomains: [
        ...settings.webSearchAllowedDomains,
        newWebSearchAllowedDomain.trim(),
      ],
    });
    setNewWebSearchAllowedDomain("");
  };

  const removeWebSearchAllowedDomain = (domain: string) => {
    if (!settings) return;
    setSettings({
      ...settings,
      webSearchAllowedDomains: settings.webSearchAllowedDomains.filter(
        (d) => d !== domain,
      ),
    });
  };

  const addWebSearchBlockedDomain = () => {
    if (!settings || !newWebSearchBlockedDomain.trim()) return;
    if (
      settings.webSearchBlockedDomains.includes(
        newWebSearchBlockedDomain.trim(),
      )
    )
      return;
    setSettings({
      ...settings,
      webSearchBlockedDomains: [
        ...settings.webSearchBlockedDomains,
        newWebSearchBlockedDomain.trim(),
      ],
    });
    setNewWebSearchBlockedDomain("");
  };

  const removeWebSearchBlockedDomain = (domain: string) => {
    if (!settings) return;
    setSettings({
      ...settings,
      webSearchBlockedDomains: settings.webSearchBlockedDomains.filter(
        (d) => d !== domain,
      ),
    });
  };

  if (loading || !settings) {
    return (
      <div className="settings-loading">
        {t("guardrail.loading", "Loading guardrail settings...")}
      </div>
    );
  }

  return (
    <div className="guardrail-settings guardrail-budget-panel">
      {saveMessage && (
        <div className="settings-save-indicator">{saveMessage}</div>
      )}
      {saveError && (
        <div className="settings-save-indicator error">{saveError}</div>
      )}

      {/* Token Budget Section */}
      <div className="settings-section guardrail-budget-primary">
        <div className="settings-section-header">
          <h3>{t("guardrail.tokenBudget.title", "Token Budget")}</h3>
          <div
            className="guardrail-budget-mode"
            role="radiogroup"
            aria-label={t("guardrail.tokenBudget.mode", "Token budget mode")}
          >
            <label className={settings.tokenBudgetEnabled ? "is-active" : ""}>
              <input
                type="radio"
                name="token-budget-mode"
                checked={settings.tokenBudgetEnabled}
                onChange={() =>
                  setSettings({ ...settings, tokenBudgetEnabled: true })
                }
              />
              <span>{t("guardrail.tokenBudget.limited", "Set limit")}</span>
            </label>
            <label className={!settings.tokenBudgetEnabled ? "is-active" : ""}>
              <input
                type="radio"
                name="token-budget-mode"
                checked={!settings.tokenBudgetEnabled}
                onChange={() =>
                  setSettings({
                    ...settings,
                    tokenBudgetEnabled: false,
                    maxTokensPerTask: Math.min(
                      settings.maxTokensPerTask,
                      MAX_TOKENS_PER_TASK,
                    ),
                  })
                }
              />
              <span>{t("guardrail.tokenBudget.unlimited", "Unlimited")}</span>
            </label>
          </div>
        </div>
        <p className="settings-description">
          {t(
            "guardrail.tokenBudget.description",
            "Limit the total tokens (input + output) used per task to prevent runaway costs.",
          )}
        </p>
        {settings.tokenBudgetEnabled ? (
          <>
            <div className="settings-inline-input">
              <label>
                {t("guardrail.tokenBudget.maxTokens", "Max tokens per task:")}
              </label>
              <input
                type="number"
                className="settings-input settings-input-number"
                value={settings.maxTokensPerTask}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    maxTokensPerTask: Math.min(
                      parseInt(e.target.value) || 100000,
                      MAX_TOKENS_PER_TASK,
                    ),
                  })
                }
                min={1000}
                max={MAX_TOKENS_PER_TASK}
                step={1000}
              />
            </div>
            <p className="settings-hint">
              {t(
                "guardrail.tokenBudget.hint",
                "Typical tasks use 5,000-50,000 tokens. Default: 100,000 (about $0.30-$7.50 depending on model)",
              )}
            </p>
          </>
        ) : (
          <div className="guardrail-budget-unlimited-note">
            <strong>
              {t("guardrail.tokenBudget.unlimitedActive", "No Token limit")}
            </strong>
            <span>
              {t(
                "guardrail.tokenBudget.unlimitedHint",
                "Tasks will not be stopped by the Token budget. Model or provider context limits still apply.",
              )}
            </span>
          </div>
        )}
        <p className="settings-hint">
          {t(
            "guardrail.tokenBudget.applyHint",
            "Changes are saved automatically and apply from the next budget check. Existing error cards will not disappear automatically.",
          )}
        </p>
      </div>

      {/* Cost Budget Section */}
      {SHOW_COST_BUDGET_SETTINGS && (
        <div className="settings-section guardrail-limit-card">
          <div className="settings-section-header">
            <h3>{t("guardrail.costBudget.title", "Cost Budget")}</h3>
            <label className="settings-toggle">
              <input
                type="checkbox"
                checked={settings.costBudgetEnabled}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    costBudgetEnabled: e.target.checked,
                  })
                }
              />
              <span className="toggle-slider"></span>
            </label>
          </div>
          <p className="settings-description">
            {t(
              "guardrail.costBudget.description",
              "Limit the estimated cost (USD) per task based on model pricing.",
            )}
          </p>
          <div className="settings-inline-input">
            <label>
              {t("guardrail.costBudget.maxCost", "Max cost per task: $")}
            </label>
            <input
              type="number"
              className="settings-input settings-input-number"
              value={settings.maxCostPerTask}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  maxCostPerTask: parseFloat(e.target.value) || 1.0,
                })
              }
              min={0.01}
              max={100}
              step={0.1}
              disabled={!settings.costBudgetEnabled}
            />
          </div>
          <p className="settings-hint">
            {t(
              "guardrail.costBudget.hint",
              "Cost is estimated based on model pricing tables. Default: $1.00",
            )}
          </p>
        </div>
      )}

      {/* Iteration Limit Section */}
      <div className="settings-section guardrail-limit-card">
        <div className="settings-section-header">
          <h3>{t("guardrail.iterationLimit.title", "Iteration Limit")}</h3>
          <label className="settings-toggle">
            <input
              type="checkbox"
              checked={settings.iterationLimitEnabled}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  iterationLimitEnabled: e.target.checked,
                })
              }
            />
            <span className="toggle-slider"></span>
          </label>
        </div>
        <p className="settings-description">
          {t(
            "guardrail.iterationLimit.description",
            "Limit the number of LLM calls per task to prevent infinite loops.",
          )}
        </p>
        {settings.iterationLimitEnabled ? (
          <>
            <div className="settings-inline-input">
              <label>
                {t(
                  "guardrail.iterationLimit.maxIterations",
                  "Max iterations per task:",
                )}
              </label>
              <input
                type="number"
                className="settings-input settings-input-number"
                value={settings.maxIterationsPerTask}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    maxIterationsPerTask: parseInt(e.target.value) || 100,
                  })
                }
                min={5}
                max={500}
                step={5}
              />
            </div>
            <p className="settings-hint">
              {t(
                "guardrail.iterationLimit.hint",
                "Each tool call and follow-up message counts as an iteration.",
              )}
            </p>
          </>
        ) : (
          <div className="guardrail-budget-unlimited-note">
            <strong>
              {t(
                "guardrail.iterationLimit.unlimitedActive",
                "No iteration limit",
              )}
            </strong>
            <span>
              {t(
                "guardrail.iterationLimit.unlimitedHint",
                "Tasks will not stop because of an iteration count, while loop and no-progress protections remain active.",
              )}
            </span>
          </div>
        )}
      </div>

      {/* Execution Continuation Section */}
      {SHOW_EXECUTION_CONTINUATION_SETTINGS && (
        <div className="settings-section guardrail-limit-card">
          <div className="settings-section-header">
            <h3>
              {t("guardrail.continuation.title", "Execution Continuation")}
            </h3>
            <label className="settings-toggle">
              <input
                type="checkbox"
                checked={settings.autoContinuationEnabled}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    autoContinuationEnabled: e.target.checked,
                  })
                }
              />
              <span className="toggle-slider"></span>
            </label>
          </div>
          <p className="settings-description">
            {t(
              "guardrail.continuation.description",
              "Automatically continue a task after turn-window exhaustion when recent progress is strong and loop risk is low.",
            )}
          </p>
          <div className="settings-inline-input">
            <label>
              {t("guardrail.continuation.maxAuto", "Max auto continuations:")}
            </label>
            <input
              type="number"
              className="settings-input settings-input-number"
              value={settings.defaultMaxAutoContinuations}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  defaultMaxAutoContinuations: parseInt(e.target.value) || 0,
                })
              }
              min={0}
              max={20}
              step={1}
              disabled={!settings.autoContinuationEnabled}
            />
          </div>
          <div className="settings-inline-input">
            <label>
              {t("guardrail.continuation.minProgress", "Min progress score:")}
            </label>
            <input
              type="number"
              className="settings-input settings-input-number"
              value={settings.defaultMinProgressScore}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  defaultMinProgressScore: parseFloat(e.target.value) || 0,
                })
              }
              min={-1}
              max={1}
              step={0.05}
              disabled={!settings.autoContinuationEnabled}
            />
          </div>
          <div className="settings-section-header">
            <h4>
              {t(
                "guardrail.continuation.compaction",
                "Continuation Compaction",
              )}
            </h4>
            <label className="settings-toggle">
              <input
                type="checkbox"
                checked={settings.compactOnContinuation}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    compactOnContinuation: e.target.checked,
                  })
                }
                disabled={!settings.autoContinuationEnabled}
              />
              <span className="toggle-slider"></span>
            </label>
          </div>
          <div className="settings-inline-input">
            <label>
              {t(
                "guardrail.continuation.compactionThreshold",
                "Compaction threshold ratio:",
              )}
            </label>
            <input
              type="number"
              className="settings-input settings-input-number"
              value={settings.compactionThresholdRatio}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  compactionThresholdRatio: parseFloat(e.target.value) || 0.75,
                })
              }
              min={0.5}
              max={0.95}
              step={0.01}
              disabled={
                !settings.autoContinuationEnabled ||
                !settings.compactOnContinuation
              }
            />
          </div>
          <div className="settings-inline-input">
            <label>
              {t(
                "guardrail.continuation.loopWarning",
                "Loop warning threshold:",
              )}
            </label>
            <input
              type="number"
              className="settings-input settings-input-number"
              value={settings.loopWarningThreshold}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  loopWarningThreshold: parseInt(e.target.value, 10) || 8,
                })
              }
              min={1}
              max={200}
              step={1}
              disabled={!settings.autoContinuationEnabled}
            />
          </div>
          <div className="settings-inline-input">
            <label>
              {t(
                "guardrail.continuation.loopCritical",
                "Loop critical threshold:",
              )}
            </label>
            <input
              type="number"
              className="settings-input settings-input-number"
              value={settings.loopCriticalThreshold}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  loopCriticalThreshold: parseInt(e.target.value, 10) || 14,
                })
              }
              min={1}
              max={400}
              step={1}
              disabled={!settings.autoContinuationEnabled}
            />
          </div>
          <div className="settings-inline-input">
            <label>
              {t(
                "guardrail.continuation.noProgressBreaker",
                "No-progress breaker:",
              )}
            </label>
            <input
              type="number"
              className="settings-input settings-input-number"
              value={settings.globalNoProgressCircuitBreaker}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  globalNoProgressCircuitBreaker:
                    parseInt(e.target.value, 10) || 20,
                })
              }
              min={1}
              max={1000}
              step={1}
              disabled={!settings.autoContinuationEnabled}
            />
          </div>
          <div className="settings-inline-input">
            <label>
              {t(
                "guardrail.continuation.sideChannel",
                "Side-channel during execution:",
              )}
            </label>
            <select
              className="settings-input"
              value={settings.sideChannelDuringExecution}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  sideChannelDuringExecution: e.target.value as
                    "paused" | "limited" | "enabled",
                })
              }
            >
              <option value="paused">
                {t("guardrail.option.paused", "Paused")}
              </option>
              <option value="limited">
                {t("guardrail.option.limited", "Limited")}
              </option>
              <option value="enabled">
                {t("guardrail.option.enabled", "Enabled")}
              </option>
            </select>
          </div>
          <div className="settings-inline-input">
            <label>
              {t(
                "guardrail.continuation.sideChannelMax",
                "Side-channel max calls/window:",
              )}
            </label>
            <input
              type="number"
              className="settings-input settings-input-number"
              value={settings.sideChannelMaxCallsPerWindow}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  sideChannelMaxCallsPerWindow:
                    parseInt(e.target.value, 10) || 2,
                })
              }
              min={0}
              max={100}
              step={1}
              disabled={settings.sideChannelDuringExecution !== "limited"}
            />
          </div>
          <div className="settings-section-header">
            <h4>
              {t("guardrail.continuation.lifetimeCap", "Lifetime Turn Cap")}
            </h4>
            <label className="settings-toggle">
              <input
                type="checkbox"
                checked={settings.lifetimeTurnCapEnabled}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    lifetimeTurnCapEnabled: e.target.checked,
                  })
                }
              />
              <span className="toggle-slider"></span>
            </label>
          </div>
          <div className="settings-inline-input">
            <label>
              {t(
                "guardrail.continuation.defaultLifetimeCap",
                "Default lifetime turn cap:",
              )}
            </label>
            <input
              type="number"
              className="settings-input settings-input-number"
              value={settings.defaultLifetimeTurnCap}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  defaultLifetimeTurnCap: parseInt(e.target.value) || 320,
                })
              }
              min={20}
              max={5000}
              step={10}
              disabled={!settings.lifetimeTurnCapEnabled}
            />
          </div>
          <p className="settings-hint">
            {t(
              "guardrail.continuation.hint",
              "Defaults: auto continuation on, max 3 windows, min score 0.25, lifetime cap 320 turns.",
            )}
          </p>
        </div>
      )}

      {/* File Size Limit Section */}
      <div className="settings-section guardrail-limit-card">
        <div className="settings-section-header">
          <h3>{t("guardrail.fileSize.title", "File Size Limit")}</h3>
          <label className="settings-toggle">
            <input
              type="checkbox"
              checked={settings.fileSizeLimitEnabled}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  fileSizeLimitEnabled: e.target.checked,
                })
              }
            />
            <span className="toggle-slider"></span>
          </label>
        </div>
        <p className="settings-description">
          {t(
            "guardrail.fileSize.description",
            "Limit the size of files the agent can write to prevent disk space abuse.",
          )}
        </p>
        {settings.fileSizeLimitEnabled ? (
          <>
            <div className="settings-inline-input">
              <label>
                {t("guardrail.fileSize.max", "Max file size (MB):")}
              </label>
              <input
                type="number"
                className="settings-input settings-input-number"
                value={settings.maxFileSizeMB}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    maxFileSizeMB: parseInt(e.target.value) || 50,
                  })
                }
                min={1}
                max={500}
                step={10}
              />
            </div>
            <p className="settings-hint">
              {t(
                "guardrail.fileSize.hint",
                "Increase the limit for projects that generate large assets.",
              )}
            </p>
          </>
        ) : (
          <div className="guardrail-budget-unlimited-note">
            <strong>
              {t("guardrail.fileSize.unlimitedActive", "No file size limit")}
            </strong>
            <span>
              {t(
                "guardrail.fileSize.unlimitedHint",
                "NeoWorker will not stop file output because of this configurable size limit.",
              )}
            </span>
          </div>
        )}
      </div>

      <div
        className={`guardrail-advanced-group ${
          advancedCommandSettingsOpen ? "is-open" : ""
        }`}
      >
        <button
          type="button"
          className="guardrail-advanced-summary"
          onClick={() => setAdvancedCommandSettingsOpen((open) => !open)}
          aria-expanded={advancedCommandSettingsOpen}
        >
          <span className="guardrail-advanced-copy">
            <strong>{t("guardrail.advanced.title", "Advanced")}</strong>
            <span>
              {t(
                "guardrail.advanced.description",
                "Command rules, web-search policy, and network-domain access. Usually no changes are needed.",
              )}
            </span>
          </span>
          <span className="guardrail-advanced-chevron" aria-hidden="true" />
        </button>

        {advancedCommandSettingsOpen && (
          <div className="guardrail-advanced-content">
            {/* Dangerous Commands Section */}
            <div className="settings-section guardrail-advanced-card guardrail-command-card">
              <div className="settings-section-header">
                <h3>
                  {t(
                    "guardrail.dangerousCommands.title",
                    "Dangerous Command Blocking",
                  )}
                </h3>
                <label className="settings-toggle">
                  <input
                    type="checkbox"
                    checked={settings.blockDangerousCommands}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        blockDangerousCommands: e.target.checked,
                      })
                    }
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>
              <p className="settings-description">
                {t(
                  "guardrail.dangerousCommands.description",
                  "Block shell commands that match dangerous patterns (e.g., rm -rf /, sudo, fork bombs).",
                )}
              </p>

              <div className="settings-subsection">
                <h4>
                  {t(
                    "guardrail.dangerousCommands.builtin",
                    "Built-in Blocked Patterns",
                  )}
                </h4>
                <div className="pattern-list">
                  {DEFAULT_BLOCKED_COMMAND_PATTERNS.map((pattern, index) => (
                    <span
                      key={index}
                      className="pattern-tag builtin"
                      title={pattern}
                    >
                      {pattern.length > 30
                        ? pattern.slice(0, 27) + "..."
                        : pattern}
                    </span>
                  ))}
                </div>
              </div>

              <div className="settings-subsection">
                <h4>
                  {t(
                    "guardrail.dangerousCommands.custom",
                    "Custom Blocked Patterns",
                  )}
                </h4>
                <p className="settings-description">
                  {t(
                    "guardrail.dangerousCommands.customDescription",
                    "Add your own regex patterns to block specific commands.",
                  )}
                </p>
                <div className="settings-input-group">
                  <input
                    type="text"
                    className="settings-input"
                    placeholder="e.g., npm publish|yarn publish"
                    value={newPattern}
                    onChange={(e) => setNewPattern(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addCustomPattern()}
                    disabled={!settings.blockDangerousCommands}
                  />
                  <button
                    className="button-small button-secondary"
                    onClick={addCustomPattern}
                    disabled={
                      !settings.blockDangerousCommands || !newPattern.trim()
                    }
                  >
                    {t("guardrail.action.add", "Add")}
                  </button>
                </div>
                {settings.customBlockedPatterns.length > 0 ? (
                  <div className="pattern-list">
                    {settings.customBlockedPatterns.map((pattern, index) => (
                      <span key={index} className="pattern-tag custom">
                        {pattern}
                        <button
                          className="pattern-remove"
                          onClick={() => removeCustomPattern(pattern)}
                          title={t(
                            "guardrail.action.removePattern",
                            "Remove pattern",
                          )}
                        >
                          x
                        </button>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="settings-hint">
                    {t(
                      "guardrail.dangerousCommands.noCustom",
                      "No custom patterns added.",
                    )}
                  </p>
                )}
              </div>
            </div>

            {/* Auto-Approve Trusted Commands Section */}
            <div className="settings-section guardrail-advanced-card guardrail-command-card">
              <div className="settings-section-header">
                <h3>
                  {t(
                    "guardrail.trustedCommands.title",
                    "Auto-Approve Trusted Commands",
                  )}
                </h3>
                <label className="settings-toggle">
                  <input
                    type="checkbox"
                    checked={settings.autoApproveTrustedCommands}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        autoApproveTrustedCommands: e.target.checked,
                      })
                    }
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>
              <p className="settings-description">
                {t(
                  "guardrail.trustedCommands.description",
                  "Automatically approve shell commands that match trusted patterns without asking for confirmation. This enables more autonomous operation while keeping dangerous commands blocked.",
                )}
              </p>

              {settings.autoApproveTrustedCommands && (
                <>
                  <div className="settings-subsection">
                    <h4>
                      {t(
                        "guardrail.trustedCommands.builtin",
                        "Built-in Trusted Patterns",
                      )}
                    </h4>
                    <p className="settings-description">
                      {t(
                        "guardrail.trustedCommands.builtinDescription",
                        "Common safe commands that are auto-approved by default.",
                      )}
                    </p>
                    <div className="pattern-list">
                      {DEFAULT_TRUSTED_COMMAND_PATTERNS.slice(0, 15).map(
                        (pattern, index) => (
                          <span
                            key={index}
                            className="pattern-tag builtin trusted"
                            title={pattern}
                          >
                            {pattern}
                          </span>
                        ),
                      )}
                      {DEFAULT_TRUSTED_COMMAND_PATTERNS.length > 15 && (
                        <span className="pattern-tag builtin trusted">
                          {t(
                            "guardrail.trustedCommands.more",
                            "+{count} more",
                            {
                              count:
                                DEFAULT_TRUSTED_COMMAND_PATTERNS.length - 15,
                            },
                          )}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="settings-subsection">
                    <h4>
                      {t(
                        "guardrail.trustedCommands.custom",
                        "Custom Trusted Patterns",
                      )}
                    </h4>
                    <p className="settings-description">
                      {t(
                        "guardrail.trustedCommands.customDescription",
                        "Add your own glob patterns for commands to auto-approve. Use * as wildcard.",
                      )}
                    </p>
                    <div className="settings-input-group">
                      <input
                        type="text"
                        className="settings-input"
                        placeholder="e.g., cargo build* or make *"
                        value={newTrustedPattern}
                        onChange={(e) => setNewTrustedPattern(e.target.value)}
                        onKeyDown={(e) =>
                          e.key === "Enter" && addTrustedPattern()
                        }
                      />
                      <button
                        className="button-small button-secondary"
                        onClick={addTrustedPattern}
                        disabled={!newTrustedPattern.trim()}
                      >
                        {t("guardrail.action.add", "Add")}
                      </button>
                    </div>
                    {settings.trustedCommandPatterns.length > 0 ? (
                      <div className="pattern-list">
                        {settings.trustedCommandPatterns.map(
                          (pattern, index) => (
                            <span
                              key={index}
                              className="pattern-tag custom trusted"
                            >
                              {pattern}
                              <button
                                className="pattern-remove"
                                onClick={() => removeTrustedPattern(pattern)}
                                title={t(
                                  "guardrail.action.removePattern",
                                  "Remove pattern",
                                )}
                              >
                                x
                              </button>
                            </span>
                          ),
                        )}
                      </div>
                    ) : (
                      <p className="settings-hint">
                        {t(
                          "guardrail.trustedCommands.noCustom",
                          "No custom trusted patterns added.",
                        )}
                      </p>
                    )}
                  </div>
                </>
              )}

              <p className="settings-hint warning">
                {t(
                  "guardrail.trustedCommands.priorityHint",
                  "Blocked patterns always take priority over trusted patterns for safety.",
                )}
              </p>
            </div>

            {/* Web Search Policy Section */}
            <div className="settings-section guardrail-advanced-card guardrail-web-search-card">
              <div className="settings-section-header">
                <h3>{t("guardrail.webSearch.title", "Web Search Policy")}</h3>
              </div>
              <p className="settings-description">
                {t(
                  "guardrail.webSearch.description",
                  "Control web_search mode, usage caps, and domain filtering for search results.",
                )}
              </p>
              <div className="guardrail-policy-fields">
                <div className="settings-inline-input">
                  <label>{t("guardrail.webSearch.mode", "Mode:")}</label>
                  <select
                    className="settings-input"
                    value={settings.webSearchMode}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        webSearchMode: e.target.value as
                          "disabled" | "cached" | "live",
                      })
                    }
                  >
                    <option value="disabled">
                      {t("guardrail.option.disabled", "Disabled")}
                    </option>
                    <option value="cached">
                      {t("guardrail.option.cached", "Cached")}
                    </option>
                    <option value="live">
                      {t("guardrail.option.live", "Live")}
                    </option>
                  </select>
                </div>
                <div className="settings-inline-input">
                  <label>
                    {t("guardrail.webSearch.maxPerTask", "Max uses per task:")}
                  </label>
                  <input
                    type="number"
                    className="settings-input settings-input-number"
                    value={settings.webSearchMaxUsesPerTask}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        webSearchMaxUsesPerTask:
                          parseInt(e.target.value, 10) || 1,
                      })
                    }
                    min={1}
                    max={500}
                    step={1}
                  />
                </div>
                <div className="settings-inline-input">
                  <label>
                    {t("guardrail.webSearch.maxPerStep", "Max uses per step:")}
                  </label>
                  <input
                    type="number"
                    className="settings-input settings-input-number"
                    value={settings.webSearchMaxUsesPerStep}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        webSearchMaxUsesPerStep:
                          parseInt(e.target.value, 10) || 1,
                      })
                    }
                    min={1}
                    max={100}
                    step={1}
                  />
                </div>
              </div>
              <div className="guardrail-domain-grid">
                <div className="settings-subsection">
                  <h4>
                    {t(
                      "guardrail.webSearch.allowedDomains",
                      "Allowed Domains (optional)",
                    )}
                  </h4>
                  <p className="settings-description">
                    {t(
                      "guardrail.webSearch.allowedDescription",
                      "If set, only search results from these domains are returned after blocked-domain filtering.",
                    )}
                  </p>
                  <div className="settings-input-group">
                    <input
                      type="text"
                      className="settings-input"
                      placeholder="e.g., reuters.com or *.openai.com"
                      value={newWebSearchAllowedDomain}
                      onChange={(e) =>
                        setNewWebSearchAllowedDomain(e.target.value)
                      }
                      onKeyDown={(e) =>
                        e.key === "Enter" && addWebSearchAllowedDomain()
                      }
                    />
                    <button
                      className="button-small button-secondary"
                      onClick={addWebSearchAllowedDomain}
                      disabled={!newWebSearchAllowedDomain.trim()}
                    >
                      {t("guardrail.action.add", "Add")}
                    </button>
                  </div>
                  {settings.webSearchAllowedDomains.length > 0 ? (
                    <div className="pattern-list">
                      {settings.webSearchAllowedDomains.map((domain, index) => (
                        <span key={index} className="pattern-tag domain">
                          {domain}
                          <button
                            className="pattern-remove"
                            onClick={() => removeWebSearchAllowedDomain(domain)}
                            title={t(
                              "guardrail.action.removeDomain",
                              "Remove domain",
                            )}
                          >
                            x
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="settings-hint">
                      {t(
                        "guardrail.webSearch.noAllowlist",
                        "No allowlist configured. All domains are eligible unless blocked.",
                      )}
                    </p>
                  )}
                </div>
                <div className="settings-subsection">
                  <h4>
                    {t("guardrail.webSearch.blockedDomains", "Blocked Domains")}
                  </h4>
                  <p className="settings-description">
                    {t(
                      "guardrail.webSearch.blockedDescription",
                      "Results from blocked domains are always removed first.",
                    )}
                  </p>
                  <div className="settings-input-group">
                    <input
                      type="text"
                      className="settings-input"
                      placeholder="e.g., example.com or *.spam.com"
                      value={newWebSearchBlockedDomain}
                      onChange={(e) =>
                        setNewWebSearchBlockedDomain(e.target.value)
                      }
                      onKeyDown={(e) =>
                        e.key === "Enter" && addWebSearchBlockedDomain()
                      }
                    />
                    <button
                      className="button-small button-secondary"
                      onClick={addWebSearchBlockedDomain}
                      disabled={!newWebSearchBlockedDomain.trim()}
                    >
                      {t("guardrail.action.add", "Add")}
                    </button>
                  </div>
                  {settings.webSearchBlockedDomains.length > 0 ? (
                    <div className="pattern-list">
                      {settings.webSearchBlockedDomains.map((domain, index) => (
                        <span key={index} className="pattern-tag custom">
                          {domain}
                          <button
                            className="pattern-remove"
                            onClick={() => removeWebSearchBlockedDomain(domain)}
                            title={t(
                              "guardrail.action.removeDomain",
                              "Remove domain",
                            )}
                          >
                            x
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="settings-hint">
                      {t(
                        "guardrail.webSearch.noBlocked",
                        "No blocked domains configured.",
                      )}
                    </p>
                  )}
                </div>
              </div>
              <p className="settings-hint">
                {t(
                  "guardrail.webSearch.precedence",
                  "Domain precedence: blocked domains are applied first, then allowed-domain allowlist.",
                )}
              </p>
            </div>

            {/* Network Domain Allowlist Section */}
            <div className="settings-section guardrail-advanced-card guardrail-network-card">
              <div className="settings-section-header">
                <h3>
                  {t("guardrail.network.title", "Network Domain Allowlist")}
                </h3>
                <label className="settings-toggle">
                  <input
                    type="checkbox"
                    checked={settings.enforceAllowedDomains}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        enforceAllowedDomains: e.target.checked,
                      })
                    }
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>
              <p className="settings-description">
                {t(
                  "guardrail.network.description",
                  "When enabled, browser automation will only navigate to allowed domains.",
                )}
              </p>

              {settings.enforceAllowedDomains && (
                <div className="settings-subsection">
                  <div className="settings-input-group">
                    <input
                      type="text"
                      className="settings-input"
                      placeholder="e.g., github.com or *.google.com"
                      value={newDomain}
                      onChange={(e) => setNewDomain(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addDomain()}
                    />
                    <button
                      className="button-small button-secondary"
                      onClick={addDomain}
                      disabled={!newDomain.trim()}
                    >
                      {t("guardrail.action.add", "Add")}
                    </button>
                  </div>
                  {settings.allowedDomains.length > 0 ? (
                    <div className="pattern-list">
                      {settings.allowedDomains.map((domain, index) => (
                        <span key={index} className="pattern-tag domain">
                          {domain}
                          <button
                            className="pattern-remove"
                            onClick={() => removeDomain(domain)}
                            title={t(
                              "guardrail.action.removeDomain",
                              "Remove domain",
                            )}
                          >
                            x
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="settings-hint warning">
                      {t(
                        "guardrail.network.noDomains",
                        "No domains configured. All browser navigation will be blocked!",
                      )}
                    </p>
                  )}
                  <p className="settings-hint">
                    {t(
                      "guardrail.network.hint",
                      "Use *.example.com to allow all subdomains. Without any domains, all navigation is blocked.",
                    )}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="settings-actions">
        <button
          className="button-secondary"
          onClick={handleReset}
          disabled={saving}
        >
          {t("guardrail.action.resetDefaults", "Reset to Defaults")}
        </button>
        <button
          className="button-primary"
          onClick={handleSave}
          disabled={saving}
        >
          {saving
            ? t("guardrail.action.saving", "Saving...")
            : t("guardrail.action.saveSettings", "Save Settings")}
        </button>
      </div>
    </div>
  );
}
