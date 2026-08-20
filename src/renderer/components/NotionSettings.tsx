import { useEffect, useState } from "react";
import { NotionSettingsData } from "../../shared/types";
import { translate, useLanguage } from "../i18n";

export function NotionSettings() {
  useLanguage();
  const [settings, setSettings] = useState<NotionSettingsData | null>(null);
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
      const loaded = await window.electronAPI.getNotionSettings();
      setSettings(loaded);
    } catch (error) {
      console.error("Failed to load Notion settings:", error);
    }
  };

  const updateSettings = (updates: Partial<NotionSettingsData>) => {
    if (!settings) return;
    setSettings({ ...settings, ...updates });
  };

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    setTestResult(null);
    try {
      const payload: NotionSettingsData = { ...settings };
      await window.electronAPI.saveNotionSettings(payload);
      setSettings(payload);
      await refreshStatus();
    } catch (error) {
      console.error("Failed to save Notion settings:", error);
    } finally {
      setSaving(false);
    }
  };

  const refreshStatus = async () => {
    try {
      setStatusLoading(true);
      const result = await window.electronAPI.getNotionStatus();
      setStatus(result);
    } catch (error) {
      console.error("Failed to load Notion status:", error);
    } finally {
      setStatusLoading(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await window.electronAPI.testNotionConnection();
      setTestResult(result);
      await refreshStatus();
    } catch (error: Any) {
      setTestResult({
        success: false,
        error:
          error.message ||
          translate("notion.error.testConnection", "Failed to test connection"),
      });
    } finally {
      setTesting(false);
    }
  };

  if (!settings) {
    return (
      <div className="settings-loading">
        {translate("notion.loading", "Loading Notion settings...")}
      </div>
    );
  }

  const statusLabel = !status?.configured
    ? translate("notion.status.missingKey", "Missing Key")
    : status.connected
      ? translate("notion.status.connected", "Connected")
      : translate("notion.status.configured", "Configured");

  const statusClass = !status?.configured
    ? "missing"
    : status.connected
      ? "connected"
      : "configured";

  return (
    <div className="notion-settings">
      <div className="settings-section">
        <div className="settings-section-header">
          <div className="settings-title-with-badge">
            <h3>{translate("notion.title", "Connect Notion")}</h3>
            {status && (
              <span
                className={`notion-status-badge ${statusClass}`}
                title={
                  !status.configured
                    ? translate(
                        "notion.statusTitle.missingKey",
                        "API key not configured",
                      )
                    : status.connected
                      ? translate(
                          "notion.statusTitle.connected",
                          "Connected to Notion",
                        )
                      : translate("notion.statusTitle.configured", "Configured")
                }
              >
                {statusLabel}
              </span>
            )}
            {statusLoading && !status && (
              <span className="notion-status-badge configured">
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
            "notion.description",
            "Connect the agent to Notion using an integration API key, then use the built-in `notion_action` tool to search, read, and update pages or data sources.",
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
              window.electronAPI.openExternal(
                "https://notion.so/my-integrations",
              )
            }
          >
            {translate("notion.openIntegrations", "Open Integrations")}
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
          <label>{translate("common.apiKey", "API Key")}</label>
          <input
            type="password"
            className="settings-input"
            placeholder="ntn_..."
            value={settings.apiKey || ""}
            onChange={(e) =>
              updateSettings({ apiKey: e.target.value || undefined })
            }
          />
          <p className="settings-hint">
            {translate(
              "notion.apiKeyHintPrefix",
              "Create an integration and copy the key that starts with",
            )}{" "}
            <code>ntn_</code> {translate("common.or", "or")}{" "}
            <code>secret_</code>.
          </p>
        </div>

        <div className="settings-field">
          <label>{translate("notion.version", "Notion Version")}</label>
          <input
            type="text"
            className="settings-input"
            placeholder="2025-09-03"
            value={settings.notionVersion || ""}
            onChange={(e) =>
              updateSettings({ notionVersion: e.target.value || undefined })
            }
          />
          <p className="settings-hint">
            {translate(
              "notion.versionHint",
              "Use the latest API version unless support requests a pin.",
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
        <h4>{translate("common.setupTips", "Setup Tips")}</h4>
        <ol className="settings-hint">
          <li>
            {translate(
              "notion.tip.createIntegration",
              "Create an integration and copy its API key.",
            )}
          </li>
          <li>
            {translate(
              "notion.tip.shareTargets",
              "Share the target pages or databases with the integration.",
            )}
          </li>
          <li>
            {translate(
              "notion.tip.saveAndTest",
              "Save settings, then click “Test Connection”.",
            )}
          </li>
        </ol>
      </div>

      <div className="settings-section">
        <h4>{translate("common.quickUsage", "Quick Usage")}</h4>
        <pre className="settings-info-box">{`// ${translate("notion.quick.search", "Search for pages or data sources")}
notion_action({
  action: "search",
  query: "Roadmap"
});

// ${translate("notion.quick.readPage", "Read a page")}
notion_action({
  action: "get_page",
  page_id: "YOUR_PAGE_ID"
});

// ${translate("notion.quick.createPage", "Create a page in a database")}
notion_action({
  action: "create_page",
  database_id: "YOUR_DATABASE_ID",
  properties: {
    Name: { title: [{ text: { content: "New item" } }] }
  }
});`}</pre>
      </div>
    </div>
  );
}
