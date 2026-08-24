import { useEffect, useState } from "react";
import { SharePointSettingsData } from "../../shared/types";
import { translate, useLanguage } from "../i18n";

export function SharePointSettings() {
  useLanguage();
  const [settings, setSettings] = useState<SharePointSettingsData | null>(null);
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
      const loaded = await window.electronAPI.getSharePointSettings();
      setSettings(loaded);
    } catch (error) {
      console.error("Failed to load SharePoint settings:", error);
    }
  };

  const updateSettings = (updates: Partial<SharePointSettingsData>) => {
    if (!settings) return;
    setSettings({ ...settings, ...updates });
  };

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    setTestResult(null);
    try {
      const payload: SharePointSettingsData = { ...settings };
      await window.electronAPI.saveSharePointSettings(payload);
      setSettings(payload);
      await refreshStatus();
    } catch (error) {
      console.error("Failed to save SharePoint settings:", error);
    } finally {
      setSaving(false);
    }
  };

  const refreshStatus = async () => {
    try {
      setStatusLoading(true);
      const result = await window.electronAPI.getSharePointStatus();
      setStatus(result);
    } catch (error) {
      console.error("Failed to load SharePoint status:", error);
    } finally {
      setStatusLoading(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await window.electronAPI.testSharePointConnection();
      setTestResult(result);
      await refreshStatus();
    } catch (error: Any) {
      setTestResult({
        success: false,
        error:
          error.message ||
          translate(
            "sharePoint.error.testConnection",
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
        {translate("sharePoint.loading", "Loading SharePoint settings...")}
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
    <div className="sharepoint-settings">
      <div className="settings-section">
        <div className="settings-section-header">
          <div className="settings-title-with-badge">
            <h3>{translate("sharePoint.title", "Connect SharePoint")}</h3>
            {status && (
              <span
                className={`sharepoint-status-badge ${statusClass}`}
                title={
                  !status.configured
                    ? translate(
                        "common.statusTitle.accessTokenMissing",
                        "Access token not configured",
                      )
                    : status.connected
                      ? translate(
                          "sharePoint.statusTitle.connected",
                          "Connected to SharePoint",
                        )
                      : translate("common.status.configured", "Configured")
                }
              >
                {statusLabel}
              </span>
            )}
            {statusLoading && !status && (
              <span className="sharepoint-status-badge configured">
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
            "sharePoint.description",
            "Connect the agent to SharePoint using a Microsoft Graph access token, then use the built-in `sharepoint_action` tool to search sites and manage drive items.",
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
              "sharePoint.accessTokenHint",
              "Use a token with Sites.ReadWrite.All or Files.ReadWrite.All scope.",
            )}
          </p>
        </div>

        <div className="settings-field">
          <label>
            {translate("sharePoint.siteIdOptional", "Site ID (optional)")}
          </label>
          <input
            type="text"
            className="settings-input"
            placeholder="SharePoint site ID"
            value={settings.siteId || ""}
            onChange={(e) =>
              updateSettings({ siteId: e.target.value || undefined })
            }
          />
        </div>

        <div className="settings-field">
          <label>
            {translate("common.driveIdOptional", "Drive ID (optional)")}
          </label>
          <input
            type="text"
            className="settings-input"
            placeholder="Default drive ID"
            value={settings.driveId || ""}
            onChange={(e) =>
              updateSettings({ driveId: e.target.value || undefined })
            }
          />
          <p className="settings-hint">
            {translate(
              "sharePoint.driveHint",
              "Set a default drive to simplify tool calls.",
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
        <pre className="settings-info-box">{`// ${translate("sharePoint.quick.searchSites", "Search sites")}
sharepoint_action({
  action: "search_sites",
  query: "Marketing"
});

// ${translate("sharePoint.quick.uploadDefaultDrive", "Upload a file to the default drive")}
sharepoint_action({
  action: "upload_file",
  file_path: "reports/summary.pdf"
});`}</pre>
      </div>
    </div>
  );
}
