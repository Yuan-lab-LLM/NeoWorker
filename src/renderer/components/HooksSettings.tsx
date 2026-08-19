import { useState, useEffect } from "react";
import { Link2 } from "lucide-react";
import type {
  HooksSettingsData,
  HooksStatus,
  GmailHooksSettingsData,
  ResendHooksSettingsData,
} from "../../shared/types";
import { translate, useLanguage } from "../i18n";

export function HooksSettings() {
  useLanguage();
  const t = translate;
  const [settings, setSettings] = useState<HooksSettingsData | null>(null);
  const [status, setStatus] = useState<HooksStatus | null>(null);
  const [gmailStatus, setGmailStatus] = useState<{
    configured: boolean;
    running: boolean;
    account?: string;
    topic?: string;
    gogAvailable: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Gmail configuration state
  const [gmailAccount, setGmailAccount] = useState("");
  const [gmailTopic, setGmailTopic] = useState("");
  const [resendWebhookSecret, setResendWebhookSecret] = useState("");
  const [resendAllowUnsafe, setResendAllowUnsafe] = useState(false);

  useEffect(() => {
    loadSettings();
    loadStatus();
    loadGmailStatus();
  }, []);

  const loadSettings = async () => {
    try {
      const data = await window.electronAPI.getHooksSettings();
      setSettings(data);
      // A fresh profile may not have persisted hook settings yet. Treat that as
      // an unconfigured state instead of surfacing a load error in the UI.
      if (!data) {
        return;
      }
      if (data.gmail) {
        setGmailAccount(data.gmail.account || "");
        setGmailTopic(data.gmail.topic || "");
      }
      if (data.resend) {
        setResendWebhookSecret(data.resend.webhookSecret || "");
        setResendAllowUnsafe(Boolean(data.resend.allowUnsafeExternalContent));
      }
    } catch (err) {
      console.error("Failed to load hooks settings:", err);
      setError(t("hooks.error.loadSettings", "Failed to load hooks settings"));
    } finally {
      setLoading(false);
    }
  };

  const loadStatus = async () => {
    try {
      const data = await window.electronAPI.getHooksStatus();
      setStatus(data);
    } catch (err) {
      console.error("Failed to load hooks status:", err);
    }
  };

  const loadGmailStatus = async () => {
    try {
      const data = await window.electronAPI.getGmailHooksStatus();
      setGmailStatus(data);
    } catch (err) {
      console.error("Failed to load Gmail status:", err);
    }
  };

  const handleEnableHooks = async () => {
    setSaving(true);
    setError(null);
    try {
      const result = await window.electronAPI.enableHooks();
      if (result.gmailWatcherError) {
        setSuccess(
          t(
            "hooks.success.enabledWithGmailError",
            "Webhooks enabled, but Gmail watcher failed: {error}",
            { error: result.gmailWatcherError },
          ),
        );
      } else {
        setSuccess(t("hooks.success.enabled", "Webhooks enabled successfully"));
      }
      await loadSettings();
      await loadStatus();
    } catch (err: Any) {
      setError(
        err.message || t("hooks.error.enable", "Failed to enable webhooks"),
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDisableHooks = async () => {
    setSaving(true);
    setError(null);
    try {
      await window.electronAPI.disableHooks();
      setSuccess(t("hooks.success.disabled", "Webhooks disabled"));
      await loadSettings();
      await loadStatus();
      await loadGmailStatus();
    } catch (err: Any) {
      setError(
        err.message || t("hooks.error.disable", "Failed to disable webhooks"),
      );
    } finally {
      setSaving(false);
    }
  };

  const handleRegenerateToken = async () => {
    if (
      !confirm(
        t(
          "hooks.confirm.regenerateToken",
          "This will invalidate all existing webhook clients. Continue?",
        ),
      )
    ) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await window.electronAPI.regenerateHookToken();
      // Show the new token in an alert so user can copy it (it won't be visible after refresh)
      alert(
        t(
          "hooks.alert.newToken",
          "New token generated:\n\n{token}\n\nCopy this token now - it won't be shown again.",
          { token: result.token },
        ),
      );
      setSuccess(
        t("hooks.success.tokenRegenerated", "Token regenerated successfully."),
      );
      await loadSettings();
    } catch (err: Any) {
      setError(
        err.message ||
          t("hooks.error.regenerateToken", "Failed to regenerate token"),
      );
    } finally {
      setSaving(false);
    }
  };

  const handleConfigureGmail = async () => {
    if (!gmailAccount.trim()) {
      setError(
        t("hooks.error.gmailAccountRequired", "Gmail account is required"),
      );
      return;
    }
    if (!gmailTopic.trim()) {
      setError(
        t("hooks.error.pubsubTopicRequired", "Pub/Sub topic is required"),
      );
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const config: GmailHooksSettingsData = {
        account: gmailAccount.trim(),
        topic: gmailTopic.trim(),
      };
      await window.electronAPI.configureGmailHooks(config);
      setSuccess(t("hooks.success.gmailConfigured", "Gmail hooks configured"));
      await loadSettings();
      await loadGmailStatus();
    } catch (err: Any) {
      setError(
        err.message ||
          t("hooks.error.configureGmail", "Failed to configure Gmail hooks"),
      );
    } finally {
      setSaving(false);
    }
  };

  const handleConfigureResend = async () => {
    if (!settings?.enabled) {
      setError(t("hooks.error.enableFirst", "Enable webhooks first"));
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const resendConfig: ResendHooksSettingsData = {
        allowUnsafeExternalContent: resendAllowUnsafe,
      };

      const secret = resendWebhookSecret.trim();
      if (secret !== "***configured***") {
        resendConfig.webhookSecret = secret;
      }

      const presetSet = new Set(settings.presets || []);
      presetSet.add("resend");

      await window.electronAPI.saveHooksSettings({
        presets: Array.from(presetSet),
        resend: resendConfig,
      });

      setSuccess(
        t(
          "hooks.success.resendConfigured",
          "Resend inbound webhook preset configured",
        ),
      );
      await loadSettings();
      await loadStatus();
    } catch (err: Any) {
      setError(
        err.message ||
          t(
            "hooks.error.configureResend",
            "Failed to configure Resend webhook preset",
          ),
      );
    } finally {
      setSaving(false);
    }
  };

  const handleStartGmailWatcher = async () => {
    setSaving(true);
    setError(null);
    try {
      const result = await window.electronAPI.startGmailWatcher();
      if (result.ok) {
        setSuccess(
          t("hooks.success.gmailWatcherStarted", "Gmail watcher started"),
        );
      } else {
        setError(
          result.error ||
            t("hooks.error.startGmailWatcher", "Failed to start Gmail watcher"),
        );
      }
      await loadGmailStatus();
    } catch (err: Any) {
      setError(
        err.message ||
          t("hooks.error.startGmailWatcher", "Failed to start Gmail watcher"),
      );
    } finally {
      setSaving(false);
    }
  };

  const handleStopGmailWatcher = async () => {
    setSaving(true);
    setError(null);
    try {
      await window.electronAPI.stopGmailWatcher();
      setSuccess(
        t("hooks.success.gmailWatcherStopped", "Gmail watcher stopped"),
      );
      await loadGmailStatus();
    } catch (err: Any) {
      setError(
        err.message ||
          t("hooks.error.stopGmailWatcher", "Failed to stop Gmail watcher"),
      );
    } finally {
      setSaving(false);
    }
  };

  // Clear success/error messages after delay
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  if (loading) {
    return (
      <div className="settings-loading">
        {t("hooks.loading", "Loading hooks settings...")}
      </div>
    );
  }

  const isEnabled = settings?.enabled && status?.serverRunning;

  return (
    <div className="automation-page settings-subsection hooks-settings-page">
      <div className="automation-page-intro">
        <div className="automation-page-heading">
          <span className="automation-page-heading-icon" aria-hidden="true">
            <Link2 size={18} />
          </span>
          <h3>{t("hooks.page.title", "Webhook")}</h3>
          <p className="settings-description">
            {t(
              "hooks.page.description",
              "Receive external service events and hand verified requests to your automations.",
            )}
          </p>
        </div>
      </div>
      {/* Status Messages */}
      {success && (
        <div className="settings-message success">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
          {success}
        </div>
      )}
      {error && (
        <div className="settings-message error">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          {error}
        </div>
      )}

      {/* Webhooks Section */}
      <div className="settings-section hooks-core-section">
        <h3>{t("hooks.webhooks.title", "Webhooks")}</h3>
        <p className="settings-description">
          {t(
            "hooks.webhooks.description",
            "Enable webhook endpoints to trigger tasks from external services. The webhook server listens for HTTP requests and can create tasks based on incoming data.",
          )}
        </p>

        {/* Status Indicator */}
        <div className="hooks-status">
          <div className="status-indicator">
            <span
              className={`status-dot ${isEnabled ? "connected" : "disconnected"}`}
            />
            <span>
              {isEnabled
                ? t("hooks.status.serverRunning", "Server Running")
                : t("hooks.status.serverStopped", "Server Stopped")}
            </span>
          </div>
          {status?.serverAddress && (
            <span className="status-address">
              http://{status.serverAddress.host}:{status.serverAddress.port}
            </span>
          )}
        </div>

        {/* Enable/Disable Button */}
        <div className="settings-row">
          <button
            className={`settings-button ${isEnabled ? "danger" : "primary"}`}
            onClick={isEnabled ? handleDisableHooks : handleEnableHooks}
            disabled={saving}
          >
            {saving
              ? t("common.processing", "Processing...")
              : isEnabled
                ? t("hooks.action.disable", "Disable Webhooks")
                : t("hooks.action.enable", "Enable Webhooks")}
          </button>
        </div>

        {/* Token Configuration */}
        {settings?.enabled && (
          <div className="hooks-token-section">
            <div className="settings-row">
              <label>{t("hooks.token.label", "Authentication Token")}</label>
              <div className="token-display">
                <code>
                  {settings.token ||
                    t("hooks.token.notConfigured", "(not configured)")}
                </code>
                <button
                  className="settings-button small"
                  onClick={handleRegenerateToken}
                  disabled={saving}
                >
                  {t("hooks.token.regenerate", "Regenerate")}
                </button>
              </div>
            </div>
            <p className="settings-hint">
              {t(
                "hooks.token.includePrefix",
                "Include this token in webhook requests via",
              )}{" "}
              <code>Authorization: Bearer &lt;token&gt;</code>{" "}
              {t("hooks.token.authorizationHeaderOr", "header or")}{" "}
              <code>X-NeoWorker-Token</code>{" "}
              {t("hooks.token.headerSuffix", "header.")}
            </p>
          </div>
        )}
      </div>

      {/* Webhook Endpoints */}
      {settings?.enabled && (
        <div className="settings-section hooks-endpoints-section">
          <h3>{t("hooks.endpoints.title", "Available Endpoints")}</h3>
          <div className="endpoints-list">
            <div className="endpoint-item">
              <code>POST /hooks/wake</code>
              <span className="endpoint-desc">
                {t("hooks.endpoints.wake", "Enqueue a system event")}
              </span>
            </div>
            <div className="endpoint-item">
              <code>POST /hooks/agent</code>
              <span className="endpoint-desc">
                {t("hooks.endpoints.agent", "Run an isolated agent task")}
              </span>
            </div>
            {settings.presets.includes("gmail") && (
              <div className="endpoint-item">
                <code>POST /hooks/gmail</code>
                <span className="endpoint-desc">
                  {t(
                    "hooks.endpoints.gmail",
                    "Gmail Pub/Sub notifications (preset)",
                  )}
                </span>
              </div>
            )}
            {settings.presets.includes("resend") && (
              <div className="endpoint-item">
                <code>POST /hooks/resend</code>
                <span className="endpoint-desc">
                  {t(
                    "hooks.endpoints.resend",
                    "Inbound email events via Resend webhook preset",
                  )}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Gmail Pub/Sub Section */}
      <div className="settings-section hooks-provider-section hooks-gmail-section">
        <h3>{t("hooks.gmail.title", "Gmail Pub/Sub")}</h3>
        <p className="settings-description">
          {t(
            "hooks.gmail.descriptionPrefix",
            "Receive notifications when emails arrive in your Gmail inbox. Requires",
          )}{" "}
          <a
            href="https://gogcli.sh/"
            target="_blank"
            rel="noopener noreferrer"
          >
            gog (gogcli)
          </a>{" "}
          {t(
            "hooks.gmail.descriptionSuffix",
            "to be installed and configured.",
          )}
        </p>

        {/* gog availability status */}
        <div className="hooks-status">
          <div className="status-indicator">
            <span
              className={`status-dot ${gmailStatus?.gogAvailable ? "connected" : "error"}`}
            />
            <span>
              {gmailStatus?.gogAvailable
                ? t("hooks.gmail.gogAvailable", "gog CLI available")
                : t(
                    "hooks.gmail.gogMissing",
                    "gog CLI not found (install from gogcli.sh)",
                  )}
            </span>
          </div>
        </div>

        {/* Gmail Watcher Status */}
        {gmailStatus?.running && (
          <div className="hooks-status">
            <div className="status-indicator">
              <span className="status-dot connected" />
              <span>
                {t(
                  "hooks.gmail.watcherRunning",
                  "Gmail watcher running for {account}",
                  { account: gmailStatus.account || "" },
                )}
              </span>
            </div>
          </div>
        )}

        {/* Gmail Configuration */}
        <div className="settings-row">
          <label>{t("hooks.gmail.account", "Gmail Account")}</label>
          <input
            type="email"
            value={gmailAccount}
            onChange={(e) => setGmailAccount(e.target.value)}
            placeholder="your-email@gmail.com"
            disabled={saving || !settings?.enabled}
          />
        </div>

        <div className="settings-row">
          <label>{t("hooks.gmail.topic", "Pub/Sub Topic")}</label>
          <input
            type="text"
            value={gmailTopic}
            onChange={(e) => setGmailTopic(e.target.value)}
            placeholder="projects/your-project/topics/gmail-watch"
            disabled={saving || !settings?.enabled}
          />
          <p className="settings-hint">
            {t(
              "hooks.gmail.topicHint",
              "Full topic path from your GCP project.",
            )}
          </p>
        </div>

        {/* Gmail Actions */}
        <div className="settings-row button-row">
          <button
            className="settings-button"
            onClick={handleConfigureGmail}
            disabled={
              saving ||
              !settings?.enabled ||
              !gmailAccount.trim() ||
              !gmailTopic.trim()
            }
          >
            {saving
              ? t("common.saving", "Saving...")
              : t("hooks.gmail.saveConfiguration", "Save Gmail Configuration")}
          </button>

          {gmailStatus?.configured && (
            <>
              {gmailStatus.running ? (
                <button
                  className="settings-button danger"
                  onClick={handleStopGmailWatcher}
                  disabled={saving}
                >
                  {t("hooks.gmail.stopWatcher", "Stop Watcher")}
                </button>
              ) : (
                <button
                  className="settings-button primary"
                  onClick={handleStartGmailWatcher}
                  disabled={
                    saving || !settings?.enabled || !gmailStatus.gogAvailable
                  }
                >
                  {t("hooks.gmail.startWatcher", "Start Watcher")}
                </button>
              )}
            </>
          )}
        </div>

        {!settings?.enabled && (
          <p className="settings-hint warning">
            {t(
              "hooks.gmail.enableFirst",
              "Enable webhooks first to configure Gmail Pub/Sub.",
            )}
          </p>
        )}
      </div>

      {/* Resend Inbound Section */}
      <div className="settings-section hooks-provider-section hooks-resend-section">
        <h3>{t("hooks.resend.title", "Resend Inbound Webhook")}</h3>
        <p className="settings-description">
          {t(
            "hooks.resend.description",
            "Configure a preset mapping for inbound email webhooks. Use this endpoint when creating a webhook:",
          )}
        </p>
        <div className="hooks-status">
          <div className="status-indicator">
            <span
              className={`status-dot ${settings?.presets.includes("resend") ? "connected" : "disconnected"}`}
            />
            <span>
              {settings?.presets.includes("resend")
                ? t("hooks.resend.presetEnabled", "Preset enabled")
                : t("hooks.resend.presetDisabled", "Preset not enabled")}
            </span>
          </div>
          <span className="status-address">POST /hooks/resend</span>
        </div>

        <p className="settings-hint">
          {t(
            "hooks.resend.setupHint",
            "For provider setup, append your hooks token in the URL query:",
          )}
          <br />
          <code>https://YOUR_HOST/hooks/resend?token=YOUR_TOKEN</code>
        </p>

        <div className="settings-row">
          <label>
            {t(
              "hooks.resend.signingSecret",
              "Webhook Signing Secret (optional)",
            )}
          </label>
          <input
            type="password"
            value={resendWebhookSecret}
            onChange={(e) => setResendWebhookSecret(e.target.value)}
            placeholder="whsec_..."
            disabled={saving || !settings?.enabled}
          />
          <p className="settings-hint">
            {t(
              "hooks.resend.signingSecretHint",
              "If provided, NeoWorker verifies Svix signature headers before processing webhook events.",
            )}
          </p>
        </div>

        <div className="settings-row">
          <label className="registry-verified-checkbox">
            <input
              type="checkbox"
              checked={resendAllowUnsafe}
              onChange={(e) => setResendAllowUnsafe(e.target.checked)}
              disabled={saving || !settings?.enabled}
            />
            {t(
              "hooks.resend.allowUnsafe",
              "Allow unsafe external content in mapped tasks",
            )}
          </label>
        </div>

        <div className="settings-row button-row">
          <button
            className="settings-button"
            onClick={handleConfigureResend}
            disabled={saving || !settings?.enabled}
          >
            {saving
              ? t("common.saving", "Saving...")
              : t(
                  "hooks.resend.saveConfiguration",
                  "Save Resend Configuration",
                )}
          </button>
        </div>

        {!settings?.enabled && (
          <p className="settings-hint warning">
            {t(
              "hooks.resend.enableFirst",
              "Enable webhooks first to configure the Resend preset.",
            )}
          </p>
        )}
      </div>

      {/* Usage Examples */}
      <div className="settings-section hooks-examples-section">
        <h3>{t("hooks.examples.title", "Usage Examples")}</h3>
        <div className="code-example">
          <p className="example-title">
            {t("hooks.examples.triggerTask", "Trigger an agent task:")}
          </p>
          <pre>
            {`curl -X POST http://127.0.0.1:${settings?.port || 9877}/hooks/agent \\
  -H 'Authorization: Bearer YOUR_TOKEN' \\
  -H 'Content-Type: application/json' \\
  -d '{"message": "Summarize my inbox", "name": "Email"}'`}
          </pre>
        </div>

        <div className="code-example">
          <p className="example-title">
            {t("hooks.examples.wakeAgent", "Wake the agent:")}
          </p>
          <pre>
            {`curl -X POST http://127.0.0.1:${settings?.port || 9877}/hooks/wake \\
  -H 'X-NeoWorker-Token: YOUR_TOKEN' \\
  -H 'Content-Type: application/json' \\
  -d '{"text": "New event received", "mode": "now"}'`}
          </pre>
        </div>

        <div className="code-example">
          <p className="example-title">
            {t(
              "hooks.examples.resendWebhook",
              "Inbound email webhook (Resend preset):",
            )}
          </p>
          <pre>
            {`curl -X POST "http://127.0.0.1:${settings?.port || 9877}/hooks/resend?token=YOUR_TOKEN" \\
  -H 'Content-Type: application/json' \\
  -d '{"type":"email.received","data":{"from":"sender@example.com","to":"inbox@example.com","subject":"Hello","email_id":"abc123","text":"Hi there"}}'`}
          </pre>
        </div>
      </div>

      <style>{`
        .hooks-status {
          display: flex;
          align-items: center;
          gap: 16px;
          margin-bottom: 16px;
          padding: 8px 12px;
          background: var(--color-bg-secondary);
          border-radius: 6px;
        }

        .status-indicator {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }

        .status-dot.connected {
          background: #10b981;
        }

        .status-dot.disconnected {
          background: #6b7280;
        }

        .status-dot.error {
          background: #ef4444;
        }

        .status-address {
          font-family: var(--font-mono);
          font-size: 12px;
          color: var(--color-text-secondary);
        }

        .hooks-token-section {
          margin-top: 16px;
          padding: 12px;
          background: var(--color-bg-secondary);
          border-radius: 6px;
        }

        .token-display {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .token-display code {
          flex: 1;
          padding: 6px 10px;
          background: var(--color-bg-primary);
          border-radius: 4px;
          font-size: 12px;
          word-break: break-all;
        }

        .endpoints-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .endpoint-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 8px 12px;
          background: var(--color-bg-secondary);
          border-radius: 6px;
        }

        .endpoint-item code {
          font-family: var(--font-mono);
          font-size: 13px;
          color: var(--color-accent);
        }

        .endpoint-desc {
          font-size: 13px;
          color: var(--color-text-secondary);
        }

        .button-row {
          display: flex;
          gap: 12px;
        }

        .settings-button.small {
          padding: 4px 12px;
          font-size: 12px;
        }

        .settings-button.danger {
          background: #ef4444;
          color: white;
        }

        .settings-button.danger:hover {
          background: #dc2626;
        }

        .settings-hint.warning {
          color: #f59e0b;
        }

        .code-example {
          margin-bottom: 16px;
          padding: 12px;
          background: var(--color-bg-secondary);
          border-radius: 6px;
        }

        .example-title {
          margin-bottom: 8px;
          font-size: 13px;
          color: var(--color-text-secondary);
        }

        .code-example pre {
          margin: 0;
          padding: 10px;
          background: var(--color-bg-primary);
          border-radius: 4px;
          font-size: 12px;
          overflow-x: auto;
          white-space: pre-wrap;
          word-break: break-all;
        }

        .settings-message {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 12px;
          margin-bottom: 16px;
          border-radius: 6px;
          font-size: 13px;
        }

        .settings-message.success {
          background: rgba(16, 185, 129, 0.1);
          color: #10b981;
        }

        .settings-message.error {
          background: rgba(239, 68, 68, 0.1);
          color: #ef4444;
        }
      `}</style>
    </div>
  );
}
