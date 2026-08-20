import { useEffect, useState } from "react";
import { OneDriveSettingsData } from "../../shared/types";
import { translate, useLanguage } from "../i18n";

export function OneDriveSettings() {
  useLanguage();
  const [settings, setSettings] = useState<OneDriveSettingsData | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    error?: string;
    name?: string;
    userId?: string;
    driveId?: string;
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
      const loaded = await window.electronAPI.getOneDriveSettings();
      setSettings(loaded);
    } catch (error) {
      console.error("Failed to load OneDrive settings:", error);
    }
  };

  const updateSettings = (updates: Partial<OneDriveSettingsData>) => {
    if (!settings) return;
    setSettings({ ...settings, ...updates });
  };

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    setTestResult(null);
    try {
      const payload: OneDriveSettingsData = { ...settings };
      await window.electronAPI.saveOneDriveSettings(payload);
      setSettings(payload);
      await refreshStatus();
    } catch (error) {
      console.error("Failed to save OneDrive settings:", error);
    } finally {
      setSaving(false);
    }
  };

  const refreshStatus = async () => {
    try {
      setStatusLoading(true);
      const result = await window.electronAPI.getOneDriveStatus();
      setStatus(result);
    } catch (error) {
      console.error("Failed to load OneDrive status:", error);
    } finally {
      setStatusLoading(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await window.electronAPI.testOneDriveConnection();
      setTestResult(result);
      await refreshStatus();
    } catch (error: Any) {
      setTestResult({
        success: false,
        error:
          error.message ||
          translate(
            "oneDrive.error.testConnection",
            "Failed to test connection",
          ),
      });
    } finally {
      setTesting(false);
    }
  };

  if (!settings) {
    return (
      <div className="settings-loading">
        {translate("oneDrive.loading", "Loading OneDrive settings...")}
      </div>
    );
  }

  const statusLabel = !status?.configured
    ? translate("common.status.missingToken", "Missing Token")
    : status.connected
      ? translate("common.status.connected", "Connected")
      : translate("common.status.configured", "Configured");

  const statusClass = !status?.configured
    ? "missing"
    : status.connected
      ? "connected"
      : "configured";

  return (
    <div className="onedrive-settings">
      <div className="settings-section">
        <div className="settings-section-header">
          <div className="settings-title-with-badge">
            <h3>{translate("oneDrive.title", "Connect OneDrive")}</h3>
            {status && (
              <span
                className={`onedrive-status-badge ${statusClass}`}
                title={
                  !status.configured
                    ? translate(
                        "common.statusTitle.accessTokenMissing",
                        "Access token not configured",
                      )
                    : status.connected
                      ? translate(
                          "oneDrive.statusTitle.connected",
                          "Connected to OneDrive",
                        )
                      : translate("common.status.configured", "Configured")
                }
              >
                {statusLabel}
              </span>
            )}
            {statusLoading && !status && (
              <span className="onedrive-status-badge configured">
                {translate("common.status.checkingEllipsis", "Checking...")}
              </span>
            )}
          </div>
          <button
            className="btn-secondary btn-sm"
            onClick={refreshStatus}
            disabled={statusLoading}
          >
            {statusLoading
              ? translate("common.status.checking", "Checking...")
              : translate("common.action.refreshStatus", "Refresh Status")}
          </button>
        </div>
        <p className="settings-description">
          {translate(
            "oneDrive.description",
            "Connect the agent to OneDrive using a Microsoft Graph access token, then use the built-in `onedrive_action` tool to search and manage files.",
          )}
        </p>
        {status?.error && (
          <p className="settings-hint">
            {translate("common.statusCheck", "Status check:")} {status.error}
          </p>
        )}
        <div className="settings-actions">
          <button
            className="btn-secondary btn-sm"
            onClick={() =>
              window.electronAPI.openExternal("https://portal.azure.com")
            }
          >
            {translate("common.openAzurePortal", "Open Azure Portal")}
          </button>
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-field">
          <label>
            {translate("common.enableIntegration", "Enable Integration")}
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
          <label>{translate("common.accessToken", "Access Token")}</label>
          <input
            type="password"
            className="settings-input"
            placeholder="Microsoft Graph access token"
            value={settings.accessToken || ""}
            onChange={(e) =>
              updateSettings({ accessToken: e.target.value || undefined })
            }
          />
          <p className="settings-hint">
            {translate(
              "oneDrive.accessTokenHint",
              "Use an access token with Files.ReadWrite or Files.Read scope.",
            )}
          </p>
        </div>

        <div className="settings-field">
          <label>
            {translate("common.driveIdOptional", "Drive ID (optional)")}
          </label>
          <input
            type="text"
            className="settings-input"
            placeholder="Default: /me/drive"
            value={settings.driveId || ""}
            onChange={(e) =>
              updateSettings({ driveId: e.target.value || undefined })
            }
          />
          <p className="settings-hint">
            {translate(
              "oneDrive.driveHint",
              "Leave blank to use your default drive.",
            )}
          </p>
        </div>

        <div className="settings-field">
          <label>{translate("common.timeoutMs", "Timeout (ms)")}</label>
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
              ? translate("common.action.testing", "Testing...")
              : translate("common.action.testConnection", "Test Connection")}
          </button>
          <button
            className="btn-primary btn-sm"
            onClick={handleSave}
            disabled={saving}
          >
            {saving
              ? translate("common.action.saving", "Saving...")
              : translate("common.action.saveSettings", "Save Settings")}
          </button>
        </div>

        {testResult && (
          <div
            className={`test-result ${testResult.success ? "success" : "error"}`}
          >
            {testResult.success ? (
              <span>
                {testResult.name
                  ? translate("common.connectedAs", "Connected as {name}", {
                      name: testResult.name,
                    })
                  : translate("common.status.connected", "Connected")}
              </span>
            ) : (
              <span>
                {translate("common.connectionFailed", "Connection failed:")}{" "}
                {testResult.error}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="settings-section">
        <h4>{translate("common.quickUsage", "Quick Usage")}</h4>
        <pre className="settings-info-box">{`// ${translate("oneDrive.quick.listRoot", "List root items")}
onedrive_action({
  action: "list_children"
});

// ${translate("oneDrive.quick.uploadRoot", "Upload a file to root")}
onedrive_action({
  action: "upload_file",
  file_path: "reports/summary.pdf"
});`}</pre>
      </div>
    </div>
  );
}
