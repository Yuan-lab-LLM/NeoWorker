import { useCallback, useEffect, useState } from "react";
import { MousePointer2, RefreshCw } from "lucide-react";
import { translate, useLanguage } from "../i18n";

type ScreenStatus = "granted" | "denied" | "not-determined" | "unknown";

interface ComputerUseStatus {
  activeTaskId: string | null;
  platform: string;
  helperPath: string;
  sourcePath: string | null;
  installed: boolean;
  accessibilityTrusted: boolean;
  screenCaptureStatus: ScreenStatus;
  error: string | null;
}

function statusLabel(ok: boolean): string {
  return ok
    ? translate("computerUse.status.granted", "Granted")
    : translate("computerUse.status.notGranted", "Not granted");
}

function screenStatusLabel(s: ScreenStatus): string {
  switch (s) {
    case "granted":
      return translate("computerUse.status.granted", "Granted");
    case "denied":
      return translate("computerUse.status.denied", "Denied");
    case "not-determined":
      return translate(
        "computerUse.status.notDetermined",
        "Not determined - open System Settings to allow",
      );
    default:
      return translate("common.unknown", "Unknown");
  }
}

export function ComputerUseSettings() {
  useLanguage();
  const t = translate;
  const [platform, setPlatform] = useState<string>("");
  const [status, setStatus] = useState<ComputerUseStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [ending, setEnding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isMac = platform === "darwin";
  const isWindows = platform === "win32";

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const plat = await window.electronAPI.getPlatform();
      setPlatform(plat);
      const s = await window.electronAPI.getComputerUseStatus();
      setStatus({
        ...s,
        screenCaptureStatus: s.screenCaptureStatus as ScreenStatus,
      });
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : t("computerUse.error.load", "Failed to load computer use status"),
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const off = window.electronAPI.onComputerUseEvent(() => {
      void refresh();
    });
    return off;
  }, [refresh]);

  const openAccessibility = async () => {
    try {
      await window.electronAPI.openComputerUseAccessibilitySettings();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : t("computerUse.error.openSettings", "Could not open settings"),
      );
    }
  };

  const openScreen = async () => {
    try {
      await window.electronAPI.openComputerUseScreenRecordingSettings();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : t("computerUse.error.openSettings", "Could not open settings"),
      );
    }
  };

  const endSession = async () => {
    try {
      setEnding(true);
      await window.electronAPI.endComputerUseSession();
      await refresh();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : t("computerUse.error.endSession", "Could not end session"),
      );
    } finally {
      setEnding(false);
    }
  };

  if (loading) {
    return (
      <div className="settings-loading">
        {t("computerUse.loading", "Loading computer use...")}
      </div>
    );
  }

  return (
    <div className="computer-use-settings">
      <div className="settings-section computer-use-settings-heading">
        <h3>
          <span
            className="computer-use-settings-heading-icon"
            aria-hidden="true"
          >
            <MousePointer2 size={18} strokeWidth={1.5} />
          </span>
          {t("computerUse.title", "Computer use")}
        </h3>
        <p className="settings-description">
          {t(
            "computerUse.description",
            "Pi-style native desktop control for macOS and Windows. The agent targets one controlled window at a time through `screenshot()`, then uses screenshot-relative mouse, keyboard, scroll, and typing actions.",
          )}
        </p>
      </div>

      {error ? <div className="settings-error">{error}</div> : null}

      {!isMac && !isWindows ? (
        <div className="computer-use-platform-note">
          {t(
            "computerUse.platform.unavailablePrefix",
            "Computer use is available on",
          )}{" "}
          <strong>macOS</strong> {t("common.and", "and")}{" "}
          <strong>Windows</strong>{" "}
          {t(
            "computerUse.platform.unavailableSuffix",
            "desktop builds only. On this platform the controls below reflect limited or unavailable permission APIs.",
          )}
        </div>
      ) : null}

      {isWindows ? (
        <div className="computer-use-platform-note">
          {t(
            "computerUse.platform.windowsNote",
            "Windows computer use supports visible, non-minimized native windows in v1. It may fall back to foreground input for apps that block background capture or control.",
          )}
        </div>
      ) : null}

      <div className="computer-use-status-grid">
        <div className="computer-use-status-card">
          <div className="computer-use-status-title">
            {t("computerUse.helper", "Helper")}
          </div>
          <div
            className={`computer-use-status-value ${status?.installed ? "ok" : "bad"}`}
          >
            {status?.installed
              ? t("computerUse.status.installed", "Installed")
              : t("computerUse.status.notInstalled", "Not installed yet")}
          </div>
          <div className="computer-use-session-id">
            <code>{status?.helperPath}</code>
          </div>
        </div>

        <div className="computer-use-status-card">
          <div className="computer-use-status-title">
            {isWindows
              ? t("computerUse.inputControl", "Input control")
              : t("computerUse.accessibility", "Accessibility")}
          </div>
          <div
            className={`computer-use-status-value ${status?.accessibilityTrusted ? "ok" : "bad"}`}
          >
            {statusLabel(Boolean(status?.accessibilityTrusted))}
          </div>
          {isMac ? (
            <button
              type="button"
              className="button-secondary"
              onClick={() => void openAccessibility()}
            >
              {t(
                "computerUse.openAccessibility",
                "Open Accessibility settings",
              )}
            </button>
          ) : null}
        </div>

        <div className="computer-use-status-card">
          <div className="computer-use-status-title">
            {isWindows
              ? t("computerUse.windowCapture", "Window capture")
              : t("computerUse.screenRecording", "Screen Recording")}
          </div>
          <div
            className={`computer-use-status-value ${
              status?.screenCaptureStatus === "granted" ? "ok" : "bad"
            }`}
          >
            {screenStatusLabel(status?.screenCaptureStatus ?? "unknown")}
          </div>
          {isMac ? (
            <button
              type="button"
              className="button-secondary"
              onClick={() => void openScreen()}
            >
              {t(
                "computerUse.openScreenRecording",
                "Open Screen Recording settings",
              )}
            </button>
          ) : null}
        </div>
      </div>

      {isMac ? (
        <p className="computer-use-restart-hint">
          {t(
            "computerUse.restartHintPrefix",
            "Inline bootstrap will prompt for missing helper permissions at first use. After changing Screen Recording, macOS may still require",
          )}{" "}
          <strong>
            {t("computerUse.restartHintStrong", "restarting NeoWorker")}
          </strong>{" "}
          {t("computerUse.restartHintSuffix", "before capture works reliably.")}
        </p>
      ) : null}

      {status?.sourcePath ? (
        <div className="computer-use-platform-note">
          {t("computerUse.helperSource", "Helper source bundle:")}{" "}
          <code>{status.sourcePath}</code>
        </div>
      ) : null}

      {status?.error ? (
        <div className="settings-error">{status.error}</div>
      ) : null}

      <div className="computer-use-active-row">
        <div>
          <div className="computer-use-status-title">
            {t("computerUse.activeSession", "Active session")}
          </div>
          <div className="computer-use-session-id">
            {status?.activeTaskId ? (
              <>
                {t("common.task", "Task")} <code>{status.activeTaskId}</code>
              </>
            ) : (
              t("common.none", "None")
            )}
          </div>
        </div>
        <div className="computer-use-active-actions">
          <button
            type="button"
            className="button-secondary"
            onClick={() => void refresh()}
            title={t("computerUse.refreshStatus", "Refresh status")}
          >
            <RefreshCw size={16} strokeWidth={2} />
          </button>
          <button
            type="button"
            className="button-secondary"
            disabled={!status?.activeTaskId || ending}
            onClick={() => void endSession()}
          >
            {ending
              ? t("computerUse.ending", "Ending...")
              : t("computerUse.endSession", "End session")}
          </button>
        </div>
      </div>
    </div>
  );
}
