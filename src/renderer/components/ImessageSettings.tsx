import { useState, useEffect, useCallback } from "react";
import { ChannelData, ChannelUserData, SecurityMode } from "../../shared/types";
import { translate, useLanguage } from "../i18n";

interface ImessageSettingsProps {
  onStatusChange?: (connected: boolean) => void;
}

type DmPolicy = "open" | "allowlist" | "pairing" | "disabled";
type GroupPolicy = "open" | "allowlist" | "disabled";

export function ImessageSettings({ onStatusChange }: ImessageSettingsProps) {
  useLanguage();
  const t = translate;
  const [channel, setChannel] = useState<ChannelData | null>(null);
  const [users, setUsers] = useState<ChannelUserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    error?: string;
  } | null>(null);

  // Form state
  const [channelName, setChannelName] = useState("iMessage");
  const [securityMode, setSecurityMode] = useState<SecurityMode>("pairing");
  const [cliPath, setCliPath] = useState("");
  const [dbPath, setDbPath] = useState("");
  const [allowedContacts, setAllowedContacts] = useState("");
  const [dmPolicy, setDmPolicy] = useState<DmPolicy>("pairing");
  const [groupPolicy, setGroupPolicy] = useState<GroupPolicy>("allowlist");
  const [ambientMode, setAmbientMode] = useState(false);
  const [silentUnauthorized, setSilentUnauthorized] = useState(false);
  const [captureSelfMessages, setCaptureSelfMessages] = useState(false);

  // Pairing code state
  const [pairingCode, setPairingCode] = useState<string | null>(null);

  // Check if we're on macOS
  const [isMacOS, setIsMacOS] = useState(true);

  const loadChannel = useCallback(async () => {
    try {
      setLoading(true);
      const channels = await window.electronAPI.getGatewayChannels();
      const imessageChannel = channels.find(
        (c: ChannelData) => c.type === "imessage",
      );

      if (imessageChannel) {
        setChannel(imessageChannel);
        setChannelName(imessageChannel.name);
        setSecurityMode(imessageChannel.securityMode);
        onStatusChange?.(imessageChannel.status === "connected");

        // Load config settings
        if (imessageChannel.config) {
          setCliPath((imessageChannel.config.cliPath as string) || "");
          setDbPath((imessageChannel.config.dbPath as string) || "");
          setDmPolicy(
            (imessageChannel.config.dmPolicy as DmPolicy) || "pairing",
          );
          setGroupPolicy(
            (imessageChannel.config.groupPolicy as GroupPolicy) || "allowlist",
          );
          const contacts =
            (imessageChannel.config.allowedContacts as string[]) || [];
          setAllowedContacts(contacts.join(", "));
          setAmbientMode(Boolean(imessageChannel.config.ambientMode));
          setSilentUnauthorized(
            Boolean(imessageChannel.config.silentUnauthorized),
          );
          setCaptureSelfMessages(
            Boolean(imessageChannel.config.captureSelfMessages),
          );
        }

        // Load users for this channel
        const channelUsers = await window.electronAPI.getGatewayUsers(
          imessageChannel.id,
        );
        setUsers(channelUsers);
      }
    } catch (error) {
      console.error("Failed to load iMessage channel:", error);
    } finally {
      setLoading(false);
    }
  }, [onStatusChange]);

  useEffect(() => {
    // Check platform
    const platform = navigator.platform.toLowerCase();
    setIsMacOS(platform.includes("mac"));

    loadChannel();
  }, [loadChannel]);

  useEffect(() => {
    const unsubscribe = window.electronAPI?.onGatewayUsersUpdated?.((data) => {
      if (data?.channelType !== "imessage") return;
      if (channel && data?.channelId && data.channelId !== channel.id) return;
      loadChannel();
    });
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [channel?.id, loadChannel]);

  const handleAddChannel = async () => {
    try {
      setSaving(true);
      setTestResult(null);

      await window.electronAPI.addGatewayChannel({
        type: "imessage",
        name: channelName,
        securityMode,
        cliPath: cliPath || undefined,
        dbPath: dbPath || undefined,
        dmPolicy,
        groupPolicy,
        allowedContacts: allowedContacts
          .split(",")
          .map((c) => c.trim())
          .filter(Boolean),
        ambientMode,
        silentUnauthorized,
        captureSelfMessages,
      });

      await loadChannel();
    } catch (error: Any) {
      setTestResult({ success: false, error: error.message });
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    if (!channel) return;

    try {
      setTesting(true);
      setTestResult(null);

      const result = await window.electronAPI.testGatewayChannel(channel.id);
      setTestResult(result);
    } catch (error: Any) {
      setTestResult({ success: false, error: error.message });
    } finally {
      setTesting(false);
    }
  };

  const handleToggleEnabled = async () => {
    if (!channel) return;

    try {
      setSaving(true);
      if (channel.enabled) {
        await window.electronAPI.disableGatewayChannel(channel.id);
      } else {
        await window.electronAPI.enableGatewayChannel(channel.id);
      }
      await loadChannel();
    } catch (error: Any) {
      setTestResult({ success: false, error: error.message });
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveChannel = async () => {
    if (!channel) return;

    if (
      !confirm(
        t(
          "imessage.confirm.remove",
          "Are you sure you want to remove the iMessage channel?",
        ),
      )
    ) {
      return;
    }

    try {
      setSaving(true);
      await window.electronAPI.removeGatewayChannel(channel.id);
      setChannel(null);
      setUsers([]);
      onStatusChange?.(false);
    } catch (error: Any) {
      setTestResult({ success: false, error: error.message });
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateSecurityMode = async (mode: SecurityMode) => {
    if (!channel) return;

    try {
      await window.electronAPI.updateGatewayChannel({
        id: channel.id,
        securityMode: mode,
      });
      setSecurityMode(mode);
      setChannel({ ...channel, securityMode: mode });
    } catch (error: Any) {
      console.error("Failed to update security mode:", error);
    }
  };

  const handleUpdateConfig = async (next: Record<string, unknown>) => {
    if (!channel) return;

    try {
      await window.electronAPI.updateGatewayChannel({
        id: channel.id,
        config: { ...channel.config, ...next },
      });
      setChannel({ ...channel, config: { ...channel.config, ...next } });
    } catch (error: Any) {
      console.error("Failed to update iMessage config:", error);
    }
  };

  const handleGeneratePairingCode = async () => {
    if (!channel) return;

    try {
      const code = await window.electronAPI.generateGatewayPairing(
        channel.id,
        "",
      );
      setPairingCode(code);
    } catch (error: Any) {
      console.error("Failed to generate pairing code:", error);
    }
  };

  const handleRevokeAccess = async (userId: string) => {
    if (!channel) return;

    try {
      await window.electronAPI.revokeGatewayAccess(channel.id, userId);
      await loadChannel();
    } catch (error: Any) {
      console.error("Failed to revoke access:", error);
    }
  };

  if (!isMacOS) {
    return (
      <div className="imessage-settings">
        <div className="settings-section">
          <h3>iMessage</h3>
          <div className="settings-warning">
            {t(
              "imessage.macOnly",
              "iMessage integration is only available on macOS.",
            )}
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="settings-loading">
        {t("imessage.loading", "Loading iMessage settings...")}
      </div>
    );
  }

  // No channel configured yet
  if (!channel) {
    return (
      <div className="imessage-settings">
        <div className="settings-section">
          <h3>{t("imessage.connect.title", "Connect iMessage")}</h3>
          <p className="settings-description">
            {t(
              "imessage.connect.description",
              "Connect iMessage to receive and send messages. Requires the imsg CLI tool and macOS permissions.",
            )}
          </p>

          <div className="settings-callout info">
            <strong>
              {t("channels.setupInstructions", "Setup Instructions")}:
            </strong>
            <ol style={{ margin: "8px 0 0 0", paddingLeft: "20px" }}>
              <li style={{ marginBottom: "8px" }}>
                <strong>
                  {t("imessage.setup.installCli", "Install imsg CLI")}:
                </strong>
                <br />
                <code style={{ display: "inline-block", marginTop: "4px" }}>
                  brew install steipete/tap/imsg
                </code>
              </li>
              <li style={{ marginBottom: "8px" }}>
                <strong>
                  {t("imessage.setup.fullDiskAccess", "Grant Full Disk Access")}
                  :
                </strong>
                <br />
                <span style={{ fontSize: "13px" }}>
                  {t(
                    "imessage.setup.fullDiskHint",
                    "imsg needs Full Disk Access to read the Messages database.",
                  )}
                  <br />
                  {t("imessage.setup.open", "Open")}{" "}
                  <strong>
                    {t(
                      "imessage.setup.fullDiskPath",
                      "System Settings → Privacy & Security → Full Disk Access",
                    )}
                  </strong>
                  <br />
                  {t(
                    "imessage.setup.enableAccessPrefix",
                    "Enable access for your",
                  )}{" "}
                  <strong>Terminal</strong>{" "}
                  {t(
                    "imessage.setup.enableAccessSuffix",
                    "application (or NeoWorker if running as app)",
                  )}
                </span>
              </li>
              <li style={{ marginBottom: "8px" }}>
                <strong>
                  {t("imessage.setup.signIn", "Sign into Messages")}:
                </strong>
                <br />
                <span style={{ fontSize: "13px" }}>
                  {t(
                    "imessage.setup.openMessages",
                    "Open the Messages app and sign in with your Apple ID",
                  )}
                </span>
              </li>
            </ol>
          </div>

          <div className="settings-field">
            <label>{t("channels.channelName", "Channel Name")}</label>
            <input
              type="text"
              className="settings-input"
              placeholder="My iMessage"
              value={channelName}
              onChange={(e) => setChannelName(e.target.value)}
            />
          </div>

          <div className="settings-field">
            <label>{t("channels.securityMode", "Security Mode")}</label>
            <select
              className="settings-select"
              value={securityMode}
              onChange={(e) => setSecurityMode(e.target.value as SecurityMode)}
            >
              <option value="open">
                {t("channels.security.openAny", "Open (anyone can message)")}
              </option>
              <option value="allowlist">
                {t(
                  "imessage.security.allowlistContacts",
                  "Allowlist (specific contacts only)",
                )}
              </option>
              <option value="pairing">
                {t(
                  "channels.security.pairingRequired",
                  "Pairing (require code to connect)",
                )}
              </option>
            </select>
            <p className="settings-hint">
              {t(
                "imessage.security.hint",
                "Controls who can interact with your bot via iMessage",
              )}
            </p>
          </div>

          <div className="settings-field">
            <label>{t("channels.dmPolicy", "DM Policy")}</label>
            <select
              className="settings-select"
              value={dmPolicy}
              onChange={(e) => setDmPolicy(e.target.value as DmPolicy)}
            >
              <option value="open">
                {t("channels.security.open", "Open")}
              </option>
              <option value="allowlist">
                {t("channels.security.allowlist", "Allowlist")}
              </option>
              <option value="pairing">
                {t("channels.security.pairingDefault", "Pairing (default)")}
              </option>
              <option value="disabled">
                {t("common.disabled", "Disabled")}
              </option>
            </select>
            <p className="settings-hint">
              {t("channels.dmPolicy.hint", "How to handle direct messages")}
            </p>
          </div>

          <div className="settings-field">
            <label>{t("channels.groupPolicy", "Group Policy")}</label>
            <select
              className="settings-select"
              value={groupPolicy}
              onChange={(e) => setGroupPolicy(e.target.value as GroupPolicy)}
            >
              <option value="open">
                {t("channels.security.open", "Open")}
              </option>
              <option value="allowlist">
                {t("channels.security.allowlistDefault", "Allowlist (default)")}
              </option>
              <option value="disabled">
                {t("common.disabled", "Disabled")}
              </option>
            </select>
            <p className="settings-hint">
              {t("channels.groupPolicy.hint", "How to handle group messages")}
            </p>
          </div>

          {(securityMode === "allowlist" ||
            dmPolicy === "allowlist" ||
            groupPolicy === "allowlist") && (
            <div className="settings-field">
              <label>{t("imessage.allowedContacts", "Allowed Contacts")}</label>
              <input
                type="text"
                className="settings-input"
                placeholder="+15551234567, user@example.com"
                value={allowedContacts}
                onChange={(e) => setAllowedContacts(e.target.value)}
              />
              <p className="settings-hint">
                {t(
                  "imessage.allowedContactsHint",
                  "Comma-separated phone numbers (E.164) or email addresses",
                )}
              </p>
            </div>
          )}

          <div className="settings-field">
            <label>{t("imessage.cliPath", "CLI Path (optional)")}</label>
            <input
              type="text"
              className="settings-input"
              placeholder="imsg (default)"
              value={cliPath}
              onChange={(e) => setCliPath(e.target.value)}
            />
            <p className="settings-hint">
              {t(
                "imessage.cliPathHint",
                "Path to the imsg CLI. Leave empty to use default.",
              )}
            </p>
          </div>

          <div className="settings-field">
            <label>{t("imessage.dbPath", "Database Path (optional)")}</label>
            <input
              type="text"
              className="settings-input"
              placeholder="~/Library/Messages/chat.db (default)"
              value={dbPath}
              onChange={(e) => setDbPath(e.target.value)}
            />
            <p className="settings-hint">
              {t(
                "imessage.dbPathHint",
                "Path to Messages database. Leave empty for default location.",
              )}
            </p>
          </div>

          <div className="settings-field">
            <div className="settings-checkbox-label">
              <span>
                {t("imessage.ambientMode", "Ambient Mode (Log-Only)")}
              </span>
              <label className="settings-toggle">
                <input
                  type="checkbox"
                  checked={ambientMode}
                  onChange={(e) => setAmbientMode(e.target.checked)}
                />
                <span className="toggle-slider" />
              </label>
            </div>
            <p className="settings-hint">
              {t(
                "imessage.ambientModeHint",
                'When enabled, iMessage messages are ingested into the local log but only commands (messages starting with "/") are processed.',
              )}
            </p>
          </div>

          <div className="settings-field">
            <div className="settings-checkbox-label">
              <span>
                {t("imessage.captureSelfMessages", "Capture Self Messages")}
              </span>
              <label className="settings-toggle">
                <input
                  type="checkbox"
                  checked={captureSelfMessages}
                  onChange={(e) => setCaptureSelfMessages(e.target.checked)}
                />
                <span className="toggle-slider" />
              </label>
            </div>
            <p className="settings-hint">
              {t(
                "imessage.captureSelfMessagesHint",
                "Ingest messages sent by the local Messages account into the log (as outgoing_user) for better follow-up extraction.",
              )}
            </p>
          </div>

          <div className="settings-field">
            <div className="settings-checkbox-label">
              <span>
                {t("channels.silentUnauthorized", "Silent Unauthorized")}
              </span>
              <label className="settings-toggle">
                <input
                  type="checkbox"
                  checked={silentUnauthorized}
                  onChange={(e) => setSilentUnauthorized(e.target.checked)}
                />
                <span className="toggle-slider" />
              </label>
            </div>
            <p className="settings-hint">
              {t(
                "channels.silentUnauthorizedHint",
                'Do not send "pairing required" or "unauthorized" replies (useful for ambient ingestion).',
              )}
            </p>
          </div>

          {testResult && (
            <div
              className={`settings-callout ${testResult.success ? "success" : "error"}`}
            >
              {testResult.success
                ? t(
                    "channels.connectionSuccessfulPlain",
                    "Connection successful!",
                  )
                : testResult.error}
            </div>
          )}

          <button
            className="settings-button primary"
            onClick={handleAddChannel}
            disabled={saving || !channelName.trim()}
          >
            {saving
              ? t("channels.connecting", "Connecting...")
              : t("imessage.connect.action", "Connect iMessage")}
          </button>
        </div>
      </div>
    );
  }

  // Channel exists - show management UI
  return (
    <div className="imessage-settings">
      <div className="settings-section">
        <h3>iMessage</h3>
        <p className="settings-description">
          {t(
            "imessage.manage.description",
            "Manage your iMessage connection and access settings.",
          )}
        </p>

        <div className="settings-status">
          <div className="status-row">
            <span className="status-label">
              {t("common.status", "Status")}:
            </span>
            <span className={`status-value status-${channel.status}`}>
              {channel.status === "connected"
                ? t("channels.status.connected", "Connected")
                : channel.status === "connecting"
                  ? t("channels.status.connecting", "Connecting...")
                  : channel.status === "error"
                    ? t("channels.status.error", "Error")
                    : t("channels.status.disconnected", "Disconnected")}
            </span>
          </div>
          {channel.botUsername && (
            <div className="status-row">
              <span className="status-label">
                {t("imessage.account", "Account")}:
              </span>
              <span className="status-value">{channel.botUsername}</span>
            </div>
          )}
        </div>

        <div className="settings-actions">
          <button
            className={`settings-button ${channel.enabled ? "danger" : "primary"}`}
            onClick={handleToggleEnabled}
            disabled={saving}
          >
            {saving
              ? t("channels.updating", "Updating...")
              : channel.enabled
                ? t("channels.disable", "Disable")
                : t("channels.enable", "Enable")}
          </button>

          <button
            className="settings-button"
            onClick={handleTestConnection}
            disabled={testing || !channel.enabled}
          >
            {testing
              ? t("channels.testing", "Testing...")
              : t("channels.testConnection", "Test Connection")}
          </button>

          <button
            className="settings-button danger"
            onClick={handleRemoveChannel}
            disabled={saving}
          >
            {t("channels.removeChannel", "Remove Channel")}
          </button>
        </div>

        {testResult && (
          <div
            className={`settings-callout ${testResult.success ? "success" : "error"}`}
          >
            {testResult.success
              ? t(
                  "channels.connectionTestSuccessful",
                  "Connection test successful!",
                )
              : testResult.error}
          </div>
        )}
      </div>

      <div className="settings-section">
        <h4>{t("channels.securitySettings", "Security Settings")}</h4>

        <div className="settings-field">
          <label>{t("channels.securityMode", "Security Mode")}</label>
          <select
            className="settings-select"
            value={securityMode}
            onChange={(e) =>
              handleUpdateSecurityMode(e.target.value as SecurityMode)
            }
          >
            <option value="open">
              {t("channels.security.openAny", "Open (anyone can message)")}
            </option>
            <option value="allowlist">
              {t(
                "imessage.security.allowlistContacts",
                "Allowlist (specific contacts only)",
              )}
            </option>
            <option value="pairing">
              {t(
                "channels.security.pairingRequired",
                "Pairing (require code to connect)",
              )}
            </option>
          </select>
        </div>

        {securityMode === "pairing" && (
          <div className="settings-field">
            <label>{t("channels.security.pairingCode", "Pairing Code")}</label>
            {pairingCode ? (
              <div className="pairing-code">
                <code>{pairingCode}</code>
                <p className="settings-hint">
                  {t(
                    "channels.pairing.shareCodeHint",
                    "Share this code with users who want to connect. It expires in 5 minutes.",
                  )}
                </p>
              </div>
            ) : (
              <button
                className="settings-button"
                onClick={handleGeneratePairingCode}
              >
                {t("channels.pairing.generateTitle", "Generate Pairing Code")}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="settings-section">
        <h4>{t("imessage.ambientInbox", "Ambient Inbox")}</h4>

        <div className="settings-field">
          <div className="settings-checkbox-label">
            <span>{t("imessage.ambientMode", "Ambient Mode (Log-Only)")}</span>
            <label className="settings-toggle">
              <input
                type="checkbox"
                checked={ambientMode}
                onChange={(e) => {
                  setAmbientMode(e.target.checked);
                  handleUpdateConfig({ ambientMode: e.target.checked });
                }}
              />
              <span className="toggle-slider" />
            </label>
          </div>
          <p className="settings-hint">
            {t(
              "imessage.ambientInboxHint",
              'Ingest messages into the local log, but only process explicit commands (messages starting with "/").',
            )}
          </p>
        </div>

        <div className="settings-field">
          <div className="settings-checkbox-label">
            <span>
              {t("imessage.captureSelfMessages", "Capture Self Messages")}
            </span>
            <label className="settings-toggle">
              <input
                type="checkbox"
                checked={captureSelfMessages}
                onChange={(e) => {
                  setCaptureSelfMessages(e.target.checked);
                  handleUpdateConfig({ captureSelfMessages: e.target.checked });
                }}
              />
              <span className="toggle-slider" />
            </label>
          </div>
          <p className="settings-hint">
            {t(
              "imessage.captureSelfMessagesManageHint",
              "Ingest messages sent by the local Messages account (direction=outgoing_user). These are log-only to avoid loops.",
            )}
          </p>
        </div>

        <div className="settings-field">
          <div className="settings-checkbox-label">
            <span>
              {t("channels.silentUnauthorized", "Silent Unauthorized")}
            </span>
            <label className="settings-toggle">
              <input
                type="checkbox"
                checked={silentUnauthorized}
                onChange={(e) => {
                  setSilentUnauthorized(e.target.checked);
                  handleUpdateConfig({ silentUnauthorized: e.target.checked });
                }}
              />
              <span className="toggle-slider" />
            </label>
          </div>
          <p className="settings-hint">
            {t(
              "channels.silentUnauthorizedShortHint",
              'Do not send "pairing required" / "unauthorized" replies.',
            )}
          </p>
        </div>
      </div>

      {users.length > 0 && (
        <div className="settings-section">
          <h4>{t("channels.authorizedUsers", "Authorized Users")}</h4>
          <div className="users-list">
            {users.map((user) => (
              <div key={user.id} className="user-item">
                <div className="user-info">
                  <span className="user-name">{user.displayName}</span>
                  <span className="user-id">{user.channelUserId}</span>
                </div>
                <button
                  className="settings-button small danger"
                  onClick={() => handleRevokeAccess(user.channelUserId)}
                >
                  {t("channels.revoke", "Revoke")}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
