import { useState, useEffect, type ComponentType } from "react";
import {
  MessageCircle,
  Wrench,
  Bot,
  Plug,
  Package,
  type LucideProps,
} from "lucide-react";
import { ExtensionData, TunnelStatusData } from "../../shared/types";
import { translate, useLanguage } from "../i18n";
import { getEmojiIcon } from "../utils/emoji-icon-map";
import { getSemanticIconVisual } from "../utils/semantic-icon-map";
import {
  isPluginPackVisibleForCurrentProductSupport,
  isProductIntegrationVisible,
} from "../utils/product-availability";

type ExtensionType = "channel" | "tool" | "provider" | "integration" | "pack";
type ExtensionState =
  "loading" | "loaded" | "registered" | "active" | "error" | "disabled";

export function ExtensionsSettings() {
  useLanguage();
  const t = translate;
  const [extensions, setExtensions] = useState<ExtensionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedExtension, setSelectedExtension] = useState<string | null>(
    null,
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Tunnel state
  const [tunnelStatus, setTunnelStatus] = useState<TunnelStatusData | null>(
    null,
  );
  const [tunnelProvider, setTunnelProvider] = useState<"ngrok" | "localtunnel">(
    "ngrok",
  );
  const [tunnelPort, setTunnelPort] = useState(3000);
  const [ngrokAuthToken, setNgrokAuthToken] = useState("");

  useEffect(() => {
    loadExtensions();
    loadTunnelStatus();
  }, []);

  const loadExtensions = async () => {
    try {
      setLoading(true);
      const data = await window.electronAPI.getExtensions();
      setExtensions(data || []);
    } catch (error) {
      console.error("Failed to load extensions:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadTunnelStatus = async () => {
    try {
      const status = await window.electronAPI.getTunnelStatus();
      setTunnelStatus(status);
    } catch (error) {
      console.error("Failed to load tunnel status:", error);
    }
  };

  const handleSelectExtension = (name: string) => {
    setSelectedExtension(selectedExtension === name ? null : name);
  };

  const handleEnableExtension = async (name: string) => {
    try {
      setSaving(true);
      const result = await window.electronAPI.enableExtension(name);
      if (result.success) {
        setMessage({
          type: "success",
          text: t("extensions.message.enabled", 'Extension "{name}" enabled', {
            name,
          }),
        });
        await loadExtensions();
      } else {
        setMessage({
          type: "error",
          text:
            result.error ||
            t("extensions.error.enable", "Failed to enable extension"),
        });
      }
    } catch (error: Any) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setSaving(false);
    }
  };

  const handleDisableExtension = async (name: string) => {
    try {
      setSaving(true);
      const result = await window.electronAPI.disableExtension(name);
      if (result.success) {
        setMessage({
          type: "success",
          text: t(
            "extensions.message.disabled",
            'Extension "{name}" disabled',
            { name },
          ),
        });
        await loadExtensions();
      } else {
        setMessage({
          type: "error",
          text:
            result.error ||
            t("extensions.error.disable", "Failed to disable extension"),
        });
      }
    } catch (error: Any) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setSaving(false);
    }
  };

  const handleReloadExtension = async (name: string) => {
    try {
      setSaving(true);
      const result = await window.electronAPI.reloadExtension(name);
      if (result.success) {
        setMessage({
          type: "success",
          text: t(
            "extensions.message.reloaded",
            'Extension "{name}" reloaded',
            { name },
          ),
        });
        await loadExtensions();
      } else {
        setMessage({
          type: "error",
          text:
            result.error ||
            t("extensions.error.reload", "Failed to reload extension"),
        });
      }
    } catch (error: Any) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setSaving(false);
    }
  };

  const handleDiscoverExtensions = async () => {
    try {
      setSaving(true);
      await window.electronAPI.discoverExtensions();
      setMessage({
        type: "success",
        text: t(
          "extensions.message.discovered",
          "Extensions discovered and loaded",
        ),
      });
      await loadExtensions();
    } catch (error: Any) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setSaving(false);
    }
  };

  const handleStartTunnel = async () => {
    try {
      setSaving(true);
      const result = await window.electronAPI.startTunnel({
        provider: tunnelProvider,
        port: tunnelPort,
        ngrokAuthToken: ngrokAuthToken || undefined,
      });
      if (result.success) {
        setMessage({
          type: "success",
          text: t("extensions.message.tunnelStarted", "Tunnel started: {url}", {
            url: result.url || "",
          }),
        });
        await loadTunnelStatus();
      } else {
        setMessage({
          type: "error",
          text:
            result.error ||
            t("extensions.error.startTunnel", "Failed to start tunnel"),
        });
      }
    } catch (error: Any) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setSaving(false);
    }
  };

  const handleStopTunnel = async () => {
    try {
      setSaving(true);
      const result = await window.electronAPI.stopTunnel();
      if (result.success) {
        setMessage({
          type: "success",
          text: t("extensions.message.tunnelStopped", "Tunnel stopped"),
        });
        await loadTunnelStatus();
      } else {
        setMessage({
          type: "error",
          text:
            result.error ||
            t("extensions.error.stopTunnel", "Failed to stop tunnel"),
        });
      }
    } catch (error: Any) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setSaving(false);
    }
  };

  const getStateColor = (state: ExtensionState): string => {
    switch (state) {
      case "active":
        return "#237348";
      case "registered":
      case "loaded":
        return "#3b6ea8";
      case "error":
        return "#b42318";
      case "disabled":
        return "#7a8492";
      default:
        return "#7a8492";
    }
  };

  const getTypeIcon = (type: ExtensionType): ComponentType<LucideProps> => {
    switch (type) {
      case "channel":
        return MessageCircle;
      case "tool":
        return Wrench;
      case "provider":
        return Bot;
      case "integration":
        return Plug;
      case "pack":
        return Package;
      default:
        return Package;
    }
  };

  const normalizeAuthor = (author?: string): string | undefined => {
    if (typeof author !== "string") return undefined;
    const trimmed = author.trim();
    if (!trimmed) return undefined;
    return /^neoworker$/i.test(trimmed) ? "NeoWorker" : trimmed;
  };

  const visibleExtensions = extensions.filter((extension) => {
    const shouldKeepConfiguredExtension =
      extension.state === "active" ||
      extension.state === "registered" ||
      extension.state === "error";
    if (shouldKeepConfiguredExtension) return true;

    if (
      extension.type === "pack" &&
      !isPluginPackVisibleForCurrentProductSupport(extension.name)
    ) {
      return false;
    }

    return (
      isProductIntegrationVisible(extension.name) &&
      isProductIntegrationVisible(extension.displayName || extension.name)
    );
  });

  if (loading) {
    return (
      <div className="settings-loading">
        {t("extensions.loading", "Loading extensions...")}
      </div>
    );
  }

  const enabledExtensionCount = visibleExtensions.filter(
    (extension) =>
      extension.state === "active" || extension.state === "registered",
  ).length;
  const disabledExtensionCount = visibleExtensions.filter(
    (extension) => extension.state === "disabled",
  ).length;

  return (
    <div className="extensions-settings">
      <section className="settings-section extensions-catalog">
        <div className="extensions-catalog-header">
          <div>
            <h3>{t("extensions.title", "Extensions")}</h3>
            <p className="settings-description">
              {t(
                "extensions.description",
                "Manage installed extensions that add new channels, tools, and integrations.",
              )}
            </p>
          </div>
          <div className="extensions-discovery">
            <button
              className="settings-button extension-scan-button"
              onClick={handleDiscoverExtensions}
              disabled={saving}
            >
              {saving
                ? t("extensions.scanning", "Scanning...")
                : t("extensions.scan", "Scan for Extensions")}
            </button>
            <p className="settings-hint">
              {t(
                "extensions.scanHint",
                "Scan extension directories for new plugins",
              )}
            </p>
          </div>
        </div>

        <dl
          className="extensions-catalog-summary"
          aria-label={t("extensions.summary.aria", "Extension summary")}
        >
          <div>
            <dt>{t("extensions.summary.installed", "Installed")}</dt>
            <dd>{visibleExtensions.length}</dd>
          </div>
          <div>
            <dt>{t("extensions.summary.enabled", "Enabled")}</dt>
            <dd>{enabledExtensionCount}</dd>
          </div>
          <div>
            <dt>{t("extensions.summary.disabled", "Disabled")}</dt>
            <dd>{disabledExtensionCount}</dd>
          </div>
        </dl>

        {message && (
          <div className={`settings-callout ${message.type}`}>
            {message.text}
          </div>
        )}

        {visibleExtensions.length === 0 ? (
          <div className="settings-callout info">
            <strong>
              {t("extensions.empty.title", "No extensions installed")}
            </strong>
            <p style={{ marginTop: "8px" }}>
              {t("extensions.empty.paths", "Extensions can be installed in:")}
            </p>
            <ul style={{ margin: "8px 0 0 20px", padding: 0 }}>
              <li>
                <code>~/.neoworker/extensions/</code>
              </li>
              <li>
                <code>~/Library/Application Support/neoworker/extensions/</code>
              </li>
            </ul>
            <p style={{ marginTop: "8px", fontSize: "13px" }}>
              {t(
                "extensions.empty.manifestPrefix",
                "Each extension should have a",
              )}{" "}
              <code>neoworker.plugin.json</code>{" "}
              {t("extensions.empty.manifestSuffix", "manifest file.")}
            </p>
          </div>
        ) : (
          <div className="extensions-directory">
            <div className="extensions-directory-heading">
              <h4>{t("extensions.directory.title", "Installed extensions")}</h4>
              <span>
                {t("extensions.directory.count", "{count} extensions", {
                  count: visibleExtensions.length,
                })}
              </span>
            </div>
            <div className="extensions-list">
              {visibleExtensions.map((ext) => {
                const normalizedAuthor = normalizeAuthor(ext.author);
                const localizedName = t(
                  `extensions.catalog.${ext.name}.name`,
                  ext.displayName || ext.name,
                );
                const localizedDescription = t(
                  `extensions.catalog.${ext.name}.description`,
                  ext.description,
                );
                const localizedState = t(
                  `extensions.state.${ext.state}`,
                  ext.state,
                );
                const localizedType = t(
                  `extensions.type.${ext.type}`,
                  ext.type,
                );
                const fallbackIcon = ext.icon
                  ? getEmojiIcon(ext.icon)
                  : getTypeIcon(ext.type);
                const extensionVisual = getSemanticIconVisual({
                  name: ext.displayName || ext.name,
                  description: ext.description,
                  category: ext.type,
                  fallback: fallbackIcon,
                });
                const ExtensionIcon = extensionVisual.Icon;
                return (
                  <div
                    key={ext.name}
                    className={`extension-item ${selectedExtension === ext.name ? "selected" : ""}`}
                    onClick={() => handleSelectExtension(ext.name)}
                  >
                    <div
                      className="extension-icon semantic-icon"
                      data-icon-tone={extensionVisual.tone}
                    >
                      <ExtensionIcon size={17} strokeWidth={1.7} />
                    </div>
                    <div className="extension-info">
                      <div className="extension-name">
                        {localizedName}
                        <span className="extension-version">
                          v{ext.version}
                        </span>
                      </div>
                      <div className="extension-description">
                        {localizedDescription}
                      </div>
                      <div className="extension-meta">
                        <span
                          className="extension-state"
                          style={{ color: getStateColor(ext.state) }}
                        >
                          {localizedState}
                        </span>
                        <span className="extension-type">{localizedType}</span>
                        {normalizedAuthor && (
                          <span className="extension-author">
                            {t("extensions.byAuthor", "by {author}", {
                              author: normalizedAuthor,
                            })}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="extension-actions">
                      {ext.state === "active" || ext.state === "registered" ? (
                        <button
                          className="settings-button small extension-row-action"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDisableExtension(ext.name);
                          }}
                          disabled={saving}
                        >
                          {t("extensions.disable", "Disable")}
                        </button>
                      ) : ext.state === "disabled" ? (
                        <button
                          className="settings-button small primary extension-row-action"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEnableExtension(ext.name);
                          }}
                          disabled={saving}
                        >
                          {t("extensions.enable", "Enable")}
                        </button>
                      ) : null}
                      <button
                        className="settings-button small extension-row-action"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleReloadExtension(ext.name);
                        }}
                        disabled={saving}
                      >
                        {t("extensions.reload", "Reload")}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>

      <section className="settings-section extensions-tunnel-section">
        <h3>{t("extensions.tunnel.title", "Webhook Tunnel")}</h3>
        <p className="settings-description">
          {t(
            "extensions.tunnel.description",
            "Create a public URL for webhook-based channels (Telegram, Discord, Slack).",
          )}
        </p>

        {tunnelStatus && tunnelStatus.status !== "stopped" && (
          <div className="settings-status">
            <div className="status-row">
              <span className="status-label">
                {t("extensions.status", "Status")}:
              </span>
              <span className={`status-value status-${tunnelStatus.status}`}>
                {tunnelStatus.status === "running"
                  ? t("extensions.status.running", "Running")
                  : tunnelStatus.status === "starting"
                    ? t("extensions.status.starting", "Starting...")
                    : tunnelStatus.status === "error"
                      ? t("extensions.status.error", "Error")
                      : t("extensions.status.stopped", "Stopped")}
              </span>
            </div>
            {tunnelStatus.url && (
              <div className="status-row">
                <span className="status-label">
                  {t("extensions.url", "URL:")}
                </span>
                <code className="status-value">{tunnelStatus.url}</code>
              </div>
            )}
            {tunnelStatus.provider && (
              <div className="status-row">
                <span className="status-label">
                  {t("extensions.provider", "Provider")}:
                </span>
                <span className="status-value">{tunnelStatus.provider}</span>
              </div>
            )}
            {tunnelStatus.error && (
              <div className="status-row">
                <span className="status-label">
                  {t("extensions.error", "Error")}:
                </span>
                <span className="status-value error">{tunnelStatus.error}</span>
              </div>
            )}
          </div>
        )}

        {(!tunnelStatus || tunnelStatus.status === "stopped") && (
          <>
            <div className="settings-field">
              <label>
                {t("extensions.tunnel.provider", "Tunnel Provider")}
              </label>
              <select
                className="settings-select"
                value={tunnelProvider}
                onChange={(e) =>
                  setTunnelProvider(e.target.value as "ngrok" | "localtunnel")
                }
              >
                <option value="ngrok">ngrok</option>
                <option value="localtunnel">localtunnel</option>
              </select>
              <p className="settings-hint">
                {t(
                  "extensions.tunnel.providerHint",
                  "ngrok requires an account for persistent URLs. localtunnel is free but less reliable.",
                )}
              </p>
            </div>

            <div className="settings-field">
              <label>{t("extensions.tunnel.localPort", "Local Port")}</label>
              <input
                type="number"
                className="settings-input"
                value={tunnelPort}
                onChange={(e) =>
                  setTunnelPort(parseInt(e.target.value) || 3000)
                }
              />
              <p className="settings-hint">
                {t(
                  "extensions.tunnel.localPortHint",
                  "The local port to tunnel (default: 3000)",
                )}
              </p>
            </div>

            {tunnelProvider === "ngrok" && (
              <div className="settings-field">
                <label>
                  {t(
                    "extensions.tunnel.ngrokToken",
                    "ngrok Auth Token (optional)",
                  )}
                </label>
                <input
                  type="password"
                  className="settings-input"
                  value={ngrokAuthToken}
                  onChange={(e) => setNgrokAuthToken(e.target.value)}
                  placeholder={t(
                    "extensions.tunnel.ngrokTokenPlaceholder",
                    "Your ngrok auth token",
                  )}
                />
                <p className="settings-hint">
                  {t("extensions.tunnel.ngrokHint", "Get your auth token from")}{" "}
                  <a
                    href="https://dashboard.ngrok.com/get-started/your-authtoken"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    ngrok dashboard
                  </a>
                </p>
              </div>
            )}
          </>
        )}

        <div className="settings-actions">
          {tunnelStatus?.status === "running" ? (
            <button
              className="settings-button danger"
              onClick={handleStopTunnel}
              disabled={saving}
            >
              {saving
                ? t("extensions.tunnel.stopping", "Stopping...")
                : t("extensions.tunnel.stop", "Stop Tunnel")}
            </button>
          ) : (
            <button
              className="settings-button primary"
              onClick={handleStartTunnel}
              disabled={saving}
            >
              {saving
                ? t("extensions.tunnel.starting", "Starting...")
                : t("extensions.tunnel.start", "Start Tunnel")}
            </button>
          )}
        </div>
      </section>

      <style>{`
        .extensions-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
          margin-top: 16px;
        }

        .extension-item {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          padding: 16px;
          background: var(--color-bg-secondary);
          border-radius: 8px;
          cursor: pointer;
          transition: background 0.2s;
        }

        .extension-item:hover {
          background: var(--color-bg-tertiary);
        }

        .extension-item.selected {
          border: 1px solid var(--color-accent);
        }

        .extension-icon {
          font-size: 24px;
          line-height: 1;
        }

        .extension-info {
          flex: 1;
          min-width: 0;
        }

        .extension-name {
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .extension-version {
          font-size: 12px;
          color: var(--color-text-secondary);
          font-weight: normal;
        }

        .extension-description {
          font-size: 13px;
          color: var(--color-text-secondary);
          margin-top: 4px;
        }

        .extension-meta {
          display: flex;
          gap: 12px;
          margin-top: 8px;
          font-size: 12px;
        }

        .extension-state {
          font-weight: 500;
          text-transform: capitalize;
        }

        .extension-type {
          color: var(--color-text-secondary);
          text-transform: capitalize;
        }

        .extension-author {
          color: var(--color-text-secondary);
        }

        .extension-actions {
          display: flex;
          gap: 8px;
          flex-shrink: 0;
        }

        .settings-button.small {
          padding: 4px 12px;
          font-size: 12px;
        }

        .settings-status {
          background: var(--color-bg-secondary);
          border-radius: 8px;
          padding: 16px;
          margin-bottom: 16px;
        }

        .status-row {
          display: flex;
          gap: 12px;
          margin-bottom: 8px;
        }

        .status-row:last-child {
          margin-bottom: 0;
        }

        .status-label {
          color: var(--color-text-secondary);
          min-width: 80px;
        }

        .status-value {
          font-weight: 500;
        }

        .status-value.status-running {
          color: var(--color-success);
        }

        .status-value.status-starting {
          color: var(--color-warning);
        }

        .status-value.status-error {
          color: var(--color-error);
        }

        .status-value.error {
          color: var(--color-error);
        }

        .settings-actions {
          display: flex;
          gap: 12px;
          margin-top: 16px;
        }

        /* Extension directory: compact rows and controls, without the grey card wall. */
        .settings-page .extensions-settings {
          display: flex;
          width: min(100%, 1180px);
          flex-direction: column;
          gap: 42px;
        }

        .settings-page .extensions-settings .settings-section {
          margin: 0;
          padding: 0;
          border: 0;
          border-radius: 0;
          background: transparent;
          box-shadow: none;
        }

        .settings-page .extensions-catalog-header {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 28px;
          padding: var(--settings-section-intro-inset, 14px) 0 24px;
          border-bottom: 1px solid #e3e8ee;
        }

        .settings-page .extensions-catalog-header h3,
        .settings-page .extensions-tunnel-section h3 {
          margin: 0;
          color: #1d2939;
          font-size: 19px;
          font-weight: 650;
          letter-spacing: -0.015em;
          line-height: 1.25;
        }

        .settings-page .extensions-catalog-header .settings-description,
        .settings-page .extensions-tunnel-section > .settings-description {
          max-width: 670px;
          margin: 7px 0 0;
          color: #667085;
          font-size: 13px;
          line-height: 1.6;
        }

        .settings-page .extensions-discovery {
          flex: 0 0 auto;
          text-align: right;
        }

        .settings-page .extension-scan-button {
          min-height: 32px;
          padding: 0 12px;
          border: 1px solid #d5dde7;
          border-radius: 7px;
          background: #ffffff;
          box-shadow: none;
          color: #344054;
          font-size: 12px;
          font-weight: 600;
        }

        .settings-page .extension-scan-button:hover:not(:disabled) {
          border-color: #b9c8d9;
          background: #f7f9fc;
          color: #242f3d;
          transform: none;
        }

        .settings-page .extensions-discovery .settings-hint {
          margin: 6px 0 0;
          color: #98a2b3;
          font-size: 10.5px;
        }

        .settings-page .extensions-catalog-summary {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          max-width: 390px;
          margin: 22px 0 0;
          border-left: 1px solid #e3e8ee;
        }

        .settings-page .extensions-catalog-summary > div {
          display: flex;
          flex-direction: column;
          gap: 3px;
          padding-left: 16px;
        }

        .settings-page .extensions-catalog-summary dt {
          color: #98a2b3;
          font-size: 10.5px;
          font-weight: 600;
          line-height: 1.2;
        }

        .settings-page .extensions-catalog-summary dd {
          margin: 0;
          color: #344054;
          font-size: 19px;
          font-weight: 650;
          font-variant-numeric: tabular-nums;
          line-height: 1.15;
        }

        .settings-page .extensions-directory {
          margin-top: 28px;
        }

        .settings-page .extensions-directory-heading {
          display: flex;
          align-items: center;
          justify-content: space-between;
          min-height: 30px;
          border-bottom: 1px solid #dfe6ee;
        }

        .settings-page .extensions-directory-heading h4 {
          margin: 0;
          color: #344054;
          font-size: 12px;
          font-weight: 650;
        }

        .settings-page .extensions-directory-heading span {
          color: #98a2b3;
          font-size: 10.5px;
          font-variant-numeric: tabular-nums;
        }

        .settings-page .extensions-list {
          gap: 0;
          margin-top: 0;
          border: 0;
        }

        .settings-page .extension-item {
          display: grid;
          grid-template-columns: 32px minmax(0, 1fr) auto;
          align-items: center;
          gap: 12px;
          min-height: 76px;
          padding: 13px 8px;
          border: 0;
          border-bottom: 1px solid #edf0f4;
          border-radius: 0;
          background: transparent;
          box-shadow: none;
          cursor: pointer;
          transition: background-color 0.16s ease;
        }

        .settings-page .extension-item:hover {
          background: #f8fafc;
        }

        .settings-page .extension-item.selected {
          border: 0;
          border-bottom: 1px solid #edf0f4;
          background: #f4f8fc;
          box-shadow: inset 3px 0 0 #7aa4d0;
        }

        .settings-page .extension-icon {
          display: inline-flex;
          width: 30px;
          height: 30px;
          align-items: center;
          justify-content: center;
          border: 1px solid #dbe6f1;
          border-radius: 8px;
          background: #edf4fb;
          color: #3b6ea8;
          font-size: 0;
          line-height: 1;
        }

        .settings-page .extension-icon svg {
          width: 16px;
          height: 16px;
        }

        .settings-page .extension-name {
          gap: 7px;
          color: #344054;
          font-size: 12.5px;
          font-weight: 650;
          line-height: 1.35;
        }

        .settings-page .extension-version {
          color: #98a2b3;
          font-size: 10.5px;
          font-weight: 500;
        }

        .settings-page .extension-description {
          display: -webkit-box;
          max-width: 720px;
          margin-top: 3px;
          overflow: hidden;
          color: #667085;
          font-size: 11px;
          line-height: 1.45;
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 2;
        }

        .settings-page .extension-meta {
          gap: 0;
          margin-top: 6px;
          color: #7a8492;
          font-size: 10.5px;
          line-height: 1.2;
        }

        .settings-page .extension-meta span + span {
          margin-left: 8px;
          padding-left: 8px;
          border-left: 1px solid #dfe6ee;
        }

        .settings-page .extension-state {
          font-weight: 650;
          text-transform: capitalize;
        }

        .settings-page .extension-type,
        .settings-page .extension-author {
          color: #7a8492;
        }

        .settings-page .extension-actions {
          align-items: center;
          gap: 6px;
          padding-left: 12px;
        }

        .settings-page .extension-row-action {
          min-height: 28px;
          padding: 0 9px;
          border: 1px solid #dbe3ec;
          border-radius: 7px;
          background: #ffffff;
          box-shadow: none;
          color: #475467;
          font-size: 11px;
          font-weight: 600;
        }

        .settings-page .extension-row-action:hover:not(:disabled) {
          border-color: #b9c8d9;
          background: #f7f9fc;
          color: #242f3d;
          transform: none;
        }

        .settings-page .extension-row-action.primary {
          border-color: var(--color-action-primary);
          background: var(--color-action-primary);
          color: #ffffff;
        }

        .settings-page .extension-row-action.primary:hover:not(:disabled) {
          border-color: var(--color-action-primary-hover);
          background: var(--color-action-primary-hover);
          color: #ffffff;
        }

        .settings-page .extensions-tunnel-section {
          padding-top: 32px !important;
          border-top: 1px solid #e3e8ee !important;
        }

        .theme-dark .settings-page .extensions-catalog-header,
        .theme-dark .settings-page .extensions-catalog-summary,
        .theme-dark .settings-page .extensions-directory-heading,
        .theme-dark .settings-page .extension-item,
        .theme-dark .settings-page .extensions-tunnel-section {
          border-color: rgba(255, 255, 255, 0.1) !important;
        }

        .theme-dark .settings-page .extensions-catalog-header h3,
        .theme-dark .settings-page .extensions-tunnel-section h3,
        .theme-dark .settings-page .extensions-directory-heading h4,
        .theme-dark .settings-page .extension-name {
          color: rgba(255, 255, 255, 0.9);
        }

        .theme-dark .settings-page .extensions-catalog-summary dt,
        .theme-dark .settings-page .extensions-directory-heading span,
        .theme-dark .settings-page .extension-description,
        .theme-dark .settings-page .extension-type,
        .theme-dark .settings-page .extension-author {
          color: rgba(255, 255, 255, 0.54);
        }

        .theme-dark .settings-page .extensions-catalog-summary dd {
          color: rgba(255, 255, 255, 0.88);
        }

        .theme-dark .settings-page .extension-item:hover {
          background: rgba(255, 255, 255, 0.055);
        }

        .theme-dark .settings-page .extension-item.selected {
          border-bottom-color: rgba(255, 255, 255, 0.1);
          background: rgba(76, 151, 255, 0.1);
          box-shadow: inset 3px 0 0 #6eaaf0;
        }

        .theme-dark .settings-page .extension-icon {
          border-color: rgba(76, 151, 255, 0.24);
          background: rgba(76, 151, 255, 0.15);
          color: #9ecbff;
        }

        .theme-dark .settings-page .extension-row-action,
        .theme-dark .settings-page .extension-scan-button {
          border-color: rgba(255, 255, 255, 0.14);
          background: rgba(255, 255, 255, 0.07);
          color: rgba(255, 255, 255, 0.82);
        }

        @media (max-width: 760px) {
          .settings-page .extensions-catalog-header {
            align-items: flex-start;
            flex-direction: column;
            gap: 18px;
          }

          .settings-page .extensions-discovery {
            text-align: left;
          }

          .settings-page .extension-item {
            grid-template-columns: 32px minmax(0, 1fr);
          }

          .settings-page .extension-actions {
            grid-column: 2;
            padding: 0;
          }
        }

        @media (max-width: 520px) {
          .settings-page .extensions-catalog-summary {
            width: 100%;
          }

          .settings-page .extension-meta {
            align-items: flex-start;
            flex-direction: column;
            gap: 4px;
          }

          .settings-page .extension-meta span + span {
            margin-left: 0;
            padding-left: 0;
            border-left: 0;
          }
        }
      `}</style>
    </div>
  );
}
