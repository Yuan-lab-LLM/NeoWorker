import { useEffect, useState } from "react";
import { DropboxSettingsData } from "../../shared/types";
import { translate, useLanguage } from "../i18n";

export function DropboxSettings() {
  useLanguage();
  const t = translate;
  const [settings, setSettings] = useState<DropboxSettingsData | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    error?: string;
    name?: string;
    userId?: string;
    email?: string;
  } | null>(null);
  const [status, setStatus] = useState<{
    configured: boolean;
    connected: boolean;
    name?: string;
    error?: string;
  } | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);

  useEffect(() => {
    loadSettings();
    refreshStatus();
  }, []);

  const loadSettings = async () => {
    try {
      const loaded = await window.electronAPI.getDropboxSettings();
      setSettings(loaded);
    } catch (error) {
      console.error("Failed to load Dropbox settings:", error);
    }
  };

  const updateSettings = (updates: Partial<DropboxSettingsData>) => {
    if (!settings) return;
    setSettings({ ...settings, ...updates });
  };

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    setTestResult(null);
    try {
      const payload: DropboxSettingsData = { ...settings };
      await window.electronAPI.saveDropboxSettings(payload);
      setSettings(payload);
      await refreshStatus();
    } catch (error) {
      console.error("Failed to save Dropbox settings:", error);
    } finally {
      setSaving(false);
    }
  };

  const refreshStatus = async () => {
    try {
      setStatusLoading(true);
      const result = await window.electronAPI.getDropboxStatus();
      setStatus(result);
    } catch (error) {
      console.error("Failed to load Dropbox status:", error);
    } finally {
      setStatusLoading(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await window.electronAPI.testDropboxConnection();
      setTestResult(result);
      await refreshStatus();
    } catch (error: Any) {
      setTestResult({
        success: false,
        error:
          error.message ||
          t("cloudStorage.error.testConnection", "Failed to test connection"),
      });
    } finally {
      setTesting(false);
    }
  };

  if (!settings) {
    return (
      <div className="settings-loading">
        {t("cloudStorage.dropbox.loading", "Loading Dropbox settings...")}
      </div>
    );
  }

  const statusLabel = !status?.configured
    ? t("cloudStorage.status.missingToken", "Missing Token")
    : status.connected
      ? t("cloudStorage.status.connected", "Connected")
      : t("cloudStorage.status.configured", "Configured");

  const statusClass = !status?.configured
    ? "missing"
    : status.connected
      ? "connected"
      : "configured";

  return (
    <div className="dropbox-settings">
      <div className="settings-section">
        <div className="settings-section-header">
          <div className="settings-title-with-badge">
            <h3>{t("cloudStorage.dropbox.title", "Connect Dropbox")}</h3>
            {status && (
              <span
                className={`dropbox-status-badge ${statusClass}`}
                title={
                  !status.configured
                    ? t(
                        "cloudStorage.status.tokenNotConfigured",
                        "Access token not configured",
                      )
                    : status.connected
                      ? t(
                          "cloudStorage.dropbox.connectedTitle",
                          "Connected to Dropbox",
                        )
                      : t("cloudStorage.status.configured", "Configured")
                }
              >
                {statusLabel}
              </span>
            )}
            {statusLoading && !status && (
              <span className="dropbox-status-badge configured">
                {t("cloudStorage.status.checkingEllipsis", "Checking…")}
              </span>
            )}
          </div>
          <button
            className="btn-secondary btn-sm"
            onClick={refreshStatus}
            disabled={statusLoading}
          >
            {statusLoading
              ? t("cloudStorage.status.checking", "Checking...")
              : t("cloudStorage.status.refresh", "Refresh Status")}
          </button>
        </div>
        <p className="settings-description">
          {t(
            "cloudStorage.dropbox.description",
            "Connect the agent to Dropbox using an access token, then use the built-in `dropbox_action` tool to search and manage files.",
          )}
        </p>
        {status?.error && (
          <p className="settings-hint">
            {t("cloudStorage.status.checkResult", "Status check: {error}", {
              error: status.error,
            })}
          </p>
        )}
        <div className="settings-actions">
          <button
            className="btn-secondary btn-sm"
            onClick={() =>
              window.electronAPI.openExternal(
                "https://www.dropbox.com/developers/apps",
              )
            }
          >
            {t("cloudStorage.dropbox.openConsole", "Open Dropbox App Console")}
          </button>
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-field">
          <label>
            {t("cloudStorage.enableIntegration", "Enable Integration")}
          </label>
          <label className="settings-toggle">
            <input
              type="checkbox"
              checked={settings.enabled}
              onChange={(e) => updateSettings({ enabled: e.target.checked })}
            />
            <span className="toggle-slider" />
          </label>
        </div>

        <div className="settings-field">
          <label>{t("cloudStorage.accessToken", "Access Token")}</label>
          <input
            type="password"
            className="settings-input"
            placeholder={t(
              "cloudStorage.dropbox.tokenPlaceholder",
              "Dropbox access token",
            )}
            value={settings.accessToken || ""}
            onChange={(e) =>
              updateSettings({ accessToken: e.target.value || undefined })
            }
          />
          <p className="settings-hint">
            {t(
              "cloudStorage.dropbox.tokenHint",
              "Use a token with files.content.read/write or full access scopes.",
            )}
          </p>
        </div>

        <div className="settings-field">
          <label>{t("cloudStorage.timeoutMs", "Timeout (ms)")}</label>
          <input
            type="number"
            className="settings-input"
            min={1000}
            max={120000}
            value={settings.timeoutMs ?? 20000}
            onChange={(e) =>
              updateSettings({ timeoutMs: Number(e.target.value) })
            }
          />
        </div>

        <div className="settings-actions">
          <button
            className="btn-secondary btn-sm"
            onClick={handleTestConnection}
            disabled={testing}
          >
            {testing
              ? t("common.testing", "Testing...")
              : t("cloudStorage.testConnection", "Test Connection")}
          </button>
          <button
            className="btn-primary btn-sm"
            onClick={handleSave}
            disabled={saving}
          >
            {saving
              ? t("common.saving", "Saving...")
              : t("cloudStorage.saveSettings", "Save Settings")}
          </button>
        </div>

        {testResult && (
          <div
            className={`test-result ${testResult.success ? "success" : "error"}`}
          >
            {testResult.success ? (
              <span>
                {testResult.name
                  ? t("cloudStorage.test.connectedAs", "Connected as {name}", {
                      name: testResult.name,
                    })
                  : t("cloudStorage.status.connected", "Connected")}
              </span>
            ) : (
              <span>
                {t("cloudStorage.test.failed", "Connection failed: {error}", {
                  error: testResult.error || "",
                })}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="settings-section">
        <h4>{t("cloudStorage.quickUsage", "Quick Usage")}</h4>
        <pre className="settings-info-box">{`// List folder contents
dropbox_action({
  action: "list_folder",
  path: "/Projects"
});

// Upload a file
dropbox_action({
  action: "upload_file",
  file_path: "reports/summary.pdf",
  path: "/Reports/summary.pdf"
});`}</pre>
      </div>
    </div>
  );
}
