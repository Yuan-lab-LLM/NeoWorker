import { useEffect, useState } from "react";
import { BoxSettingsData } from "../../shared/types";
import { translate, useLanguage } from "../i18n";

export function BoxSettings() {
  useLanguage();
  const t = translate;
  const [settings, setSettings] = useState<BoxSettingsData | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    error?: string;
    name?: string;
    userId?: string;
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
      const loaded = await window.electronAPI.getBoxSettings();
      setSettings(loaded);
    } catch (error) {
      console.error("Failed to load Box settings:", error);
    }
  };

  const updateSettings = (updates: Partial<BoxSettingsData>) => {
    if (!settings) return;
    setSettings({ ...settings, ...updates });
  };

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    setTestResult(null);
    try {
      const payload: BoxSettingsData = { ...settings };
      await window.electronAPI.saveBoxSettings(payload);
      setSettings(payload);
      await refreshStatus();
    } catch (error) {
      console.error("Failed to save Box settings:", error);
    } finally {
      setSaving(false);
    }
  };

  const refreshStatus = async () => {
    try {
      setStatusLoading(true);
      const result = await window.electronAPI.getBoxStatus();
      setStatus(result);
    } catch (error) {
      console.error("Failed to load Box status:", error);
    } finally {
      setStatusLoading(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await window.electronAPI.testBoxConnection();
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
        {t("cloudStorage.box.loading", "Loading Box settings...")}
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
    <div className="box-settings">
      <div className="settings-section">
        <div className="settings-section-header">
          <div className="settings-title-with-badge">
            <h3>{t("cloudStorage.box.title", "Connect Box")}</h3>
            {status && (
              <span
                className={`box-status-badge ${statusClass}`}
                title={
                  !status.configured
                    ? t(
                        "cloudStorage.status.tokenNotConfigured",
                        "Access token not configured",
                      )
                    : status.connected
                      ? t("cloudStorage.box.connectedTitle", "Connected to Box")
                      : t("cloudStorage.status.configured", "Configured")
                }
              >
                {statusLabel}
              </span>
            )}
            {statusLoading && !status && (
              <span className="box-status-badge configured">
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
            "cloudStorage.box.description",
            "Connect the agent to Box using a developer token or OAuth access token, then use the built-in `box_action` tool to search and manage files.",
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
                "https://app.box.com/developers/console",
              )
            }
          >
            {t("cloudStorage.box.openConsole", "Open Box Console")}
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
              "cloudStorage.box.tokenPlaceholder",
              "Box access token",
            )}
            value={settings.accessToken || ""}
            onChange={(e) =>
              updateSettings({ accessToken: e.target.value || undefined })
            }
          />
          <p className="settings-hint">
            {t(
              "cloudStorage.box.tokenHint",
              "Use a developer token or OAuth access token with required scopes.",
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
        <pre className="settings-info-box">{`// List root folder items
box_action({
  action: "list_folder_items",
  folder_id: "0",
  limit: 25
});

// Upload a file to root
box_action({
  action: "upload_file",
  file_path: "reports/summary.pdf",
  parent_id: "0"
});`}</pre>
      </div>
    </div>
  );
}
