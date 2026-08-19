import React, { useState, useEffect } from "react";
import { Globe, Copy, Check } from "lucide-react";
import { translate, useLanguage } from "../i18n";

interface WebAccessConfig {
  enabled: boolean;
  port: number;
  host: string;
  token: string;
  allowedOrigins: string[];
}

interface WebAccessStatus {
  running: boolean;
  url?: string;
  port?: number;
  connectedClients: number;
  startedAt?: number;
}

export const WebAccessSettingsPanel: React.FC = () => {
  useLanguage();
  const t = translate;
  const [config, setConfig] = useState<WebAccessConfig>({
    enabled: false,
    port: 3847,
    host: "127.0.0.1",
    token: "",
    allowedOrigins: [],
  });
  const [status, setStatus] = useState<WebAccessStatus | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    loadSettings();
    const interval = setInterval(loadStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const loadSettings = async () => {
    try {
      const settings = await (window as Any).electronAPI.getWebAccessSettings();
      if (settings) setConfig(settings);
      await loadStatus();
    } catch {
      // Not available
    }
  };

  const loadStatus = async () => {
    try {
      const s = await (window as Any).electronAPI.getWebAccessStatus();
      if (s) setStatus(s);
    } catch {
      // Not available
    }
  };

  const saveSettings = async (updates: Partial<WebAccessConfig>) => {
    const newConfig = { ...config, ...updates };
    setConfig(newConfig);
    try {
      await (window as Any).electronAPI.saveWebAccessSettings(updates);
      await loadStatus();
    } catch {
      // Save failed
    }
  };

  const copyToken = () => {
    if (config.token) {
      navigator.clipboard.writeText(config.token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const accessUrl = status?.url || `http://${config.host}:${config.port}`;

  return (
    <div className="settings-section">
      <h2
        className="settings-title"
        style={{ display: "flex", alignItems: "center", gap: 8 }}
      >
        <Globe size={18} />
        {t("webAccess.title", "Web Access")}
      </h2>
      <p className="settings-description">
        {t(
          "webAccess.description",
          "Access NeoWorker from any browser on your network. When enabled, the UI is served over HTTP with token authentication.",
        )}
      </p>

      <div className="settings-group">
        <label className="settings-toggle-row">
          <span>{t("webAccess.enable", "Enable Web Access")}</span>
          <input
            type="checkbox"
            checked={config.enabled}
            onChange={(e) => saveSettings({ enabled: e.target.checked })}
          />
        </label>

        {config.enabled && (
          <>
            <div className="settings-field">
              <label>{t("webAccess.port", "Port")}</label>
              <input
                type="number"
                value={config.port}
                min={1024}
                max={65535}
                onChange={(e) => saveSettings({ port: Number(e.target.value) })}
                style={{ width: 100 }}
              />
            </div>

            <div className="settings-field">
              <label>{t("webAccess.accessUrl", "Access URL")}</label>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 13,
                }}
              >
                <code
                  style={{
                    padding: "4px 8px",
                    borderRadius: 4,
                    background: "var(--color-bg-secondary)",
                    border: "1px solid var(--color-border)",
                    color: "var(--color-text)",
                  }}
                >
                  {accessUrl}
                </code>
                {status?.running && (
                  <span style={{ color: "#22c55e", fontSize: 11 }}>
                    {t("webAccess.running", "Running")}
                  </span>
                )}
              </div>
            </div>

            {config.token && (
              <div className="settings-field">
                <label>{t("webAccess.accessToken", "Access Token")}</label>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <code
                    style={{
                      padding: "4px 8px",
                      borderRadius: 4,
                      background: "var(--color-bg-secondary)",
                      border: "1px solid var(--color-border)",
                      color: "var(--color-text)",
                      fontSize: 12,
                      maxWidth: 200,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {config.token.slice(0, 8)}...{config.token.slice(-4)}
                  </code>
                  <button
                    onClick={copyToken}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      padding: "4px 8px",
                      border: "1px solid var(--color-border)",
                      borderRadius: 4,
                      background: "var(--color-bg-glass)",
                      color: "var(--color-text-secondary)",
                      cursor: "pointer",
                      fontSize: 11,
                    }}
                  >
                    {copied ? <Check size={12} /> : <Copy size={12} />}
                    {copied
                      ? t("webAccess.copied", "Copied")
                      : t("webAccess.copy", "Copy")}
                  </button>
                </div>
              </div>
            )}

            {status && (
              <div className="settings-field">
                <label>{t("webAccess.status", "Status")}</label>
                <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                  {t(
                    "webAccess.connectedClients",
                    "{count} connected client(s)",
                    {
                      count: status.connectedClients,
                    },
                  )}
                  {status.startedAt && (
                    <>
                      {" "}
                      &middot;{" "}
                      {t("webAccess.started", "Started {time}", {
                        time: new Date(status.startedAt).toLocaleTimeString(),
                      })}
                    </>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
