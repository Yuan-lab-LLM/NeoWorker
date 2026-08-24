import { useCallback, useEffect, useState } from "react";
import {
  ChevronDown,
  History,
  PauseCircle,
  PlayCircle,
  RefreshCw,
} from "lucide-react";
import type {
  ChronicleCaptureScope,
  ChronicleCaptureStatus,
  ChronicleSettings,
} from "../../shared/types";
import { translate, useLanguage } from "../i18n";

const INTERVAL_OPTIONS = [10, 15, 30, 60];
const RETENTION_OPTIONS = [5, 10, 15, 30];
const MAX_FRAME_OPTIONS = [30, 60, 90, 120];

const DEFAULT_SETTINGS: ChronicleSettings = {
  enabled: false,
  mode: "hybrid",
  paused: false,
  captureIntervalSeconds: 10,
  retentionMinutes: 5,
  maxFrames: 60,
  captureScope: "frontmost_display",
  backgroundGenerationEnabled: true,
  respectWorkspaceMemory: true,
  consentAcceptedAt: null,
};

function formatScreenStatus(
  status: ChronicleCaptureStatus["screenCaptureStatus"],
): string {
  switch (status) {
    case "granted":
      return translate("chronicle.status.granted", "Granted");
    case "denied":
      return translate("chronicle.status.denied", "Denied");
    case "not-determined":
      return translate("chronicle.status.notDetermined", "Not determined");
    default:
      return translate("chronicle.status.unknown", "Unknown");
  }
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTimestamp(timestamp?: number | null): string {
  if (!timestamp) return translate("chronicle.never", "Never");
  return new Date(timestamp).toLocaleString();
}

function captureScopeLabel(scope: ChronicleCaptureScope): string {
  return scope === "all_displays"
    ? translate("chronicle.captureScope.allDisplays", "All displays")
    : translate("chronicle.captureScope.frontmostDisplay", "Frontmost display");
}

export function ChronicleSettingsCard() {
  useLanguage();
  const t = translate;
  const [settings, setSettings] = useState<ChronicleSettings>(DEFAULT_SETTINGS);
  const [status, setStatus] = useState<ChronicleCaptureStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [loadedSettings, loadedStatus] = await Promise.all([
        window.electronAPI.getChronicleSettings(),
        window.electronAPI.getChronicleStatus(),
      ]);
      setSettings(loadedSettings || DEFAULT_SETTINGS);
      setStatus(loadedStatus);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : t("chronicle.error.load", "Failed to load Chronicle settings"),
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const persist = async (patch: Partial<ChronicleSettings>) => {
    let next = { ...settings, ...patch };
    if (patch.enabled && !settings.enabled && !settings.consentAcceptedAt) {
      const accepted = window.confirm(
        t(
          "chronicle.enableConfirm",
          "Chronicle captures recent on-screen context on this desktop. Keep it off before opening sensitive content you do not want used as context. Screen-derived text is untrusted and can contain prompt-injection attempts. Enable Chronicle?",
        ),
      );
      if (!accepted) {
        return;
      }
      next = {
        ...next,
        enabled: true,
        paused: false,
        consentAcceptedAt: Date.now(),
      };
    }
    setSettings(next);
    try {
      setSaving(true);
      setError(null);
      const result = await window.electronAPI.saveChronicleSettings(next);
      setSettings(result.settings || next);
      setStatus(await window.electronAPI.getChronicleStatus());
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : t("chronicle.error.save", "Failed to save Chronicle settings"),
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="settings-loading">
        {t("chronicle.loading", "Loading Chronicle...")}
      </div>
    );
  }

  return (
    <div className="computer-use-settings chronicle-settings">
      <div className="settings-section computer-use-settings-heading">
        <h3>
          <span
            className="computer-use-settings-heading-icon"
            aria-hidden="true"
          >
            <History size={18} strokeWidth={1.5} />
          </span>
          Chronicle
        </h3>
        <p className="settings-description">
          {t(
            "chronicle.description",
            "Research preview for local passive screen context. Chronicle keeps a short recent-screen buffer on this desktop and promotes only task-used observations into recall and memories.",
          )}
        </p>
      </div>

      {error ? <div className="settings-error">{error}</div> : null}

      <div className="computer-use-status-grid">
        <div className="computer-use-status-card">
          <div className="computer-use-status-title">
            {t("chronicle.previewStatus", "Preview status")}
          </div>
          <div
            className={`computer-use-status-value ${
              settings.enabled && !settings.paused ? "ok" : "bad"
            }`}
          >
            {!settings.enabled
              ? t("chronicle.disabled", "Disabled")
              : settings.paused
                ? t("chronicle.paused", "Paused")
                : t("chronicle.enabled", "Enabled")}
          </div>
          <label className="settings-checkbox">
            <input
              type="checkbox"
              checked={settings.enabled}
              disabled={saving}
              onChange={(event) =>
                void persist({ enabled: event.target.checked })
              }
            />
            <span>
              {t("chronicle.turnOn", "Turn on Chronicle (Research Preview)")}
            </span>
          </label>
          {settings.enabled ? (
            <button
              type="button"
              className="button-secondary"
              disabled={saving}
              onClick={() => void persist({ paused: !settings.paused })}
            >
              {settings.paused ? (
                <>
                  <PlayCircle size={16} strokeWidth={2} />{" "}
                  {t("chronicle.resume", "Resume Chronicle")}
                </>
              ) : (
                <>
                  <PauseCircle size={16} strokeWidth={2} />{" "}
                  {t("chronicle.pause", "Pause Chronicle")}
                </>
              )}
            </button>
          ) : null}
        </div>

        <div className="computer-use-status-card">
          <div className="computer-use-status-title">
            {t("chronicle.screenRecording", "Screen Recording")}
          </div>
          <div
            className={`computer-use-status-value ${
              status?.screenCaptureStatus === "granted" ? "ok" : "bad"
            }`}
          >
            {formatScreenStatus(status?.screenCaptureStatus || "unknown")}
          </div>
          <button
            type="button"
            className="button-secondary"
            onClick={() =>
              void window.electronAPI.openComputerUseScreenRecordingSettings()
            }
          >
            {t(
              "chronicle.openScreenRecordingSettings",
              "Open Screen Recording settings",
            )}
          </button>
        </div>

        <div className="computer-use-status-card">
          <div className="computer-use-status-title">
            {t("chronicle.accessibility", "Accessibility")}
          </div>
          <div
            className={`computer-use-status-value ${
              status?.accessibilityTrusted ? "ok" : "bad"
            }`}
          >
            {status?.accessibilityTrusted
              ? t("chronicle.trusted", "Trusted")
              : t("chronicle.notGranted", "Not granted")}
          </div>
          <button
            type="button"
            className="button-secondary"
            onClick={() =>
              void window.electronAPI.openComputerUseAccessibilitySettings()
            }
          >
            {t(
              "chronicle.openAccessibilitySettings",
              "Open Accessibility settings",
            )}
          </button>
        </div>

        <div className="computer-use-status-card">
          <div className="computer-use-status-title">OCR</div>
          <div
            className={`computer-use-status-value ${status?.ocrAvailable ? "ok" : "bad"}`}
          >
            {status?.ocrAvailable
              ? t("chronicle.available", "Available")
              : t("chronicle.unavailable", "Unavailable")}
          </div>
          <div className="computer-use-session-id">
            {status?.ocrAvailable
              ? t(
                  "chronicle.ocrAvailableHint",
                  "Local OCR will enrich Chronicle matches.",
                )
              : t(
                  "chronicle.ocrUnavailableHint",
                  "Install tesseract for OCR-backed Chronicle matches.",
                )}
          </div>
        </div>
      </div>

      {status?.reason ? (
        <p className="computer-use-restart-hint">{status.reason}</p>
      ) : null}

      <div className="settings-section chronicle-settings-config">
        <div className="computer-use-active-row">
          <div>
            <div className="computer-use-status-title">
              {t("chronicle.recentScreenBuffer", "Recent-screen buffer")}
            </div>
            <div className="computer-use-session-id">
              {t("chronicle.frameCount", "{count} frame(s)", {
                count: status?.frameCount ?? 0,
              })}{" "}
              • {formatBytes(status?.bufferBytes || 0)} •{" "}
              {captureScopeLabel(status?.captureScope || settings.captureScope)}
            </div>
            <div className="computer-use-session-id">
              {t("chronicle.lastCapture", "Last capture:")}{" "}
              {formatTimestamp(status?.lastCaptureAt)} •{" "}
              {t("chronicle.lastMemoryGeneration", "Last memory generation:")}{" "}
              {formatTimestamp(status?.lastGeneratedAt)}
            </div>
          </div>
          <div className="computer-use-active-actions">
            <button
              type="button"
              className="button-secondary chronicle-settings-refresh"
              aria-label={t("chronicle.refresh", "Refresh Chronicle status")}
              title={t("chronicle.refresh", "Refresh Chronicle status")}
              onClick={() => void refresh()}
            >
              <RefreshCw size={16} strokeWidth={2} />
            </button>
          </div>
        </div>

        <div className="settings-grid chronicle-settings-grid">
          <label className="settings-field chronicle-settings-field">
            <span>{t("chronicle.captureInterval", "Capture interval")}</span>
            <span className="chronicle-settings-select">
              <select
                value={settings.captureIntervalSeconds}
                disabled={saving}
                onChange={(event) =>
                  void persist({
                    captureIntervalSeconds: Number(event.target.value),
                  })
                }
              >
                {INTERVAL_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {t("chronicle.seconds", "{count} seconds", {
                      count: option,
                    })}
                  </option>
                ))}
              </select>
              <ChevronDown size={16} strokeWidth={1.75} aria-hidden="true" />
            </span>
          </label>

          <label className="settings-field chronicle-settings-field">
            <span>{t("chronicle.retentionWindow", "Retention window")}</span>
            <span className="chronicle-settings-select">
              <select
                value={settings.retentionMinutes}
                disabled={saving}
                onChange={(event) =>
                  void persist({ retentionMinutes: Number(event.target.value) })
                }
              >
                {RETENTION_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {t("chronicle.minutes", "{count} minutes", {
                      count: option,
                    })}
                  </option>
                ))}
              </select>
              <ChevronDown size={16} strokeWidth={1.75} aria-hidden="true" />
            </span>
          </label>

          <label className="settings-field chronicle-settings-field">
            <span>{t("chronicle.frameCap", "Frame cap")}</span>
            <span className="chronicle-settings-select">
              <select
                value={settings.maxFrames}
                disabled={saving}
                onChange={(event) =>
                  void persist({ maxFrames: Number(event.target.value) })
                }
              >
                {MAX_FRAME_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {t("chronicle.frames", "{count} frames", { count: option })}
                  </option>
                ))}
              </select>
              <ChevronDown size={16} strokeWidth={1.75} aria-hidden="true" />
            </span>
          </label>

          <label className="settings-field chronicle-settings-field">
            <span>{t("chronicle.captureScope", "Capture scope")}</span>
            <span className="chronicle-settings-select">
              <select
                value={settings.captureScope}
                disabled={saving}
                onChange={(event) =>
                  void persist({
                    captureScope: event.target.value as ChronicleCaptureScope,
                  })
                }
              >
                <option value="frontmost_display">
                  {t(
                    "chronicle.captureScope.frontmostDisplay",
                    "Frontmost display",
                  )}
                </option>
                <option value="all_displays">
                  {t("chronicle.captureScope.allDisplays", "All displays")}
                </option>
              </select>
              <ChevronDown size={16} strokeWidth={1.75} aria-hidden="true" />
            </span>
          </label>
        </div>

        <div className="settings-grid chronicle-settings-options">
          <label className="settings-checkbox">
            <input
              type="checkbox"
              checked={settings.backgroundGenerationEnabled}
              disabled={saving}
              onChange={(event) =>
                void persist({
                  backgroundGenerationEnabled: event.target.checked,
                })
              }
            />
            <span>
              {t(
                "chronicle.generateMemories",
                "Generate Chronicle-backed memories in the background",
              )}
            </span>
          </label>

          <label className="settings-checkbox">
            <input
              type="checkbox"
              checked={settings.respectWorkspaceMemory}
              disabled={saving}
              onChange={(event) =>
                void persist({ respectWorkspaceMemory: event.target.checked })
              }
            />
            <span>
              {t(
                "chronicle.respectPrivacy",
                "Respect workspace memory privacy and auto-capture settings",
              )}
            </span>
          </label>
        </div>

        <p className="settings-description">
          {t(
            "chronicle.privacyNote",
            "Passive frames stay local and are aggressively pruned. Chronicle does not send screenshots to external providers by itself. Screen-derived text is untrusted and may contain prompt injection attempts, so verify it before acting on it.",
          )}
        </p>
      </div>
    </div>
  );
}
