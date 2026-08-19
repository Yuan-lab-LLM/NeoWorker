import { useState, useEffect, useCallback } from "react";
import {
  ChannelData,
  ChannelUserData,
  SecurityMode,
  ContextType,
  ContextPolicy,
} from "../../shared/types";
import { PairingCodeDisplay } from "./PairingCodeDisplay";
import { ContextPolicySettings } from "./ContextPolicySettings";
import { translate, useLanguage } from "../i18n";

interface LineSettingsProps {
  onStatusChange?: (connected: boolean) => void;
}

export function LineSettings({ onStatusChange }: LineSettingsProps) {
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
    botUsername?: string;
  } | null>(null);

  // Form state
  const [channelName, setChannelName] = useState("LINE");
  const [securityMode, setSecurityMode] = useState<SecurityMode>("pairing");
  const [channelAccessToken, setChannelAccessToken] = useState("");
  const [channelSecret, setChannelSecret] = useState("");
  const [webhookPort, setWebhookPort] = useState(3100);

  // Pairing code state
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [pairingExpiresAt, setPairingExpiresAt] = useState<number>(0);
  const [generatingCode, setGeneratingCode] = useState(false);

  // Context policy state
  const [contextPolicies, setContextPolicies] = useState<
    Record<ContextType, ContextPolicy>
  >({} as Record<ContextType, ContextPolicy>);
  const [savingPolicy, setSavingPolicy] = useState(false);

  const loadChannel = useCallback(async () => {
    try {
      setLoading(true);
      const channels = await window.electronAPI.getGatewayChannels();
      const lineChannel = channels.find((c: ChannelData) => c.type === "line");

      if (lineChannel) {
        setChannel(lineChannel);
        setChannelName(lineChannel.name);
        setSecurityMode(lineChannel.securityMode);
        onStatusChange?.(lineChannel.status === "connected");

        // Load config settings
        if (lineChannel.config) {
          setChannelAccessToken(
            (lineChannel.config.channelAccessToken as string) || "",
          );
          setChannelSecret((lineChannel.config.channelSecret as string) || "");
          setWebhookPort((lineChannel.config.webhookPort as number) || 3100);
        }

        // Load users for this channel
        const channelUsers = await window.electronAPI.getGatewayUsers(
          lineChannel.id,
        );
        setUsers(channelUsers);

        // Load context policies
        const policies = await window.electronAPI.listContextPolicies(
          lineChannel.id,
        );
        const policyMap: Record<ContextType, ContextPolicy> = {} as Record<
          ContextType,
          ContextPolicy
        >;
        for (const policy of policies) {
          policyMap[policy.contextType as ContextType] = policy;
        }
        setContextPolicies(policyMap);
      }
    } catch (error) {
      console.error("Failed to load LINE channel:", error);
    } finally {
      setLoading(false);
    }
  }, [onStatusChange]);

  useEffect(() => {
    loadChannel();
  }, [loadChannel]);

  useEffect(() => {
    const unsubscribe = window.electronAPI?.onGatewayUsersUpdated?.((data) => {
      if (data?.channelType !== "line") return;
      if (channel && data?.channelId && data.channelId !== channel.id) return;
      loadChannel();
    });
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [channel?.id, loadChannel]);

  const handleAddChannel = async () => {
    if (!channelAccessToken.trim() || !channelSecret.trim()) {
      setTestResult({
        success: false,
        error: t(
          "line.error.required",
          "Channel access token and channel secret are required",
        ),
      });
      return;
    }

    try {
      setSaving(true);
      setTestResult(null);

      await window.electronAPI.addGatewayChannel({
        type: "line",
        name: channelName,
        securityMode,
        lineChannelAccessToken: channelAccessToken.trim(),
        lineChannelSecret: channelSecret.trim(),
        lineWebhookPort: webhookPort,
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
          "line.confirm.remove",
          "Are you sure you want to remove the LINE channel?",
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

  const handleUpdateSecurityMode = async (newMode: SecurityMode) => {
    if (!channel) return;

    try {
      await window.electronAPI.updateGatewayChannel({
        id: channel.id,
        securityMode: newMode,
      });
      setSecurityMode(newMode);
      setChannel({ ...channel, securityMode: newMode });
    } catch (error: Any) {
      console.error("Failed to update security mode:", error);
    }
  };

  const handleGeneratePairingCode = async () => {
    if (!channel) return;

    try {
      setGeneratingCode(true);
      const code = await window.electronAPI.generateGatewayPairing(
        channel.id,
        "",
      );
      setPairingCode(code);
      // Default TTL is 5 minutes (300 seconds)
      setPairingExpiresAt(Date.now() + 5 * 60 * 1000);
    } catch (error: Any) {
      console.error("Failed to generate pairing code:", error);
    } finally {
      setGeneratingCode(false);
    }
  };

  const handlePolicyChange = async (
    contextType: ContextType,
    updates: Partial<ContextPolicy>,
  ) => {
    if (!channel) return;

    try {
      setSavingPolicy(true);
      const updated = await window.electronAPI.updateContextPolicy(
        channel.id,
        contextType,
        {
          securityMode: updates.securityMode,
          toolRestrictions: updates.toolRestrictions,
        },
      );
      setContextPolicies((prev) => ({
        ...prev,
        [contextType]: updated,
      }));
    } catch (error: Any) {
      console.error("Failed to update context policy:", error);
    } finally {
      setSavingPolicy(false);
    }
  };

  const handleRevokeAccess = async (channelUserId: string) => {
    if (!channel) return;

    try {
      await window.electronAPI.revokeGatewayAccess(channel.id, channelUserId);
      await loadChannel();
    } catch (error: Any) {
      console.error("Failed to revoke access:", error);
    }
  };

  if (loading) {
    return (
      <div className="settings-loading">
        {t("line.loading", "Loading LINE settings...")}
      </div>
    );
  }

  // No channel configured yet
  if (!channel) {
    return (
      <div className="line-settings">
        <div className="settings-section">
          <h3>{t("line.connect.title", "Connect LINE")}</h3>
          <p className="settings-description">
            {t(
              "line.connect.description",
              "Connect to LINE Messaging API to receive and send messages. Popular in Asia with 200M+ users.",
            )}
          </p>

          <div className="settings-field">
            <label>{t("channels.channelName", "Channel Name")}</label>
            <input
              type="text"
              className="settings-input"
              placeholder="My LINE Bot"
              value={channelName}
              onChange={(e) => setChannelName(e.target.value)}
            />
          </div>

          <div className="settings-field">
            <label>
              {t("line.field.channelAccessToken", "Channel Access Token")}
            </label>
            <input
              type="password"
              className="settings-input"
              placeholder={t(
                "line.placeholder.channelAccessToken",
                "Your long-lived channel access token",
              )}
              value={channelAccessToken}
              onChange={(e) => setChannelAccessToken(e.target.value)}
            />
            <p className="settings-hint">
              {t(
                "line.hint.channelAccessToken",
                "Found in LINE Developers Console under Messaging API settings",
              )}
            </p>
          </div>

          <div className="settings-field">
            <label>{t("line.field.channelSecret", "Channel Secret")}</label>
            <input
              type="password"
              className="settings-input"
              placeholder={t(
                "line.placeholder.channelSecret",
                "Your channel secret",
              )}
              value={channelSecret}
              onChange={(e) => setChannelSecret(e.target.value)}
            />
            <p className="settings-hint">
              {t(
                "line.hint.channelSecret",
                "Used to verify webhook signatures",
              )}
            </p>
          </div>

          <div className="settings-field">
            <label>{t("line.field.webhookPort", "Webhook Port")}</label>
            <input
              type="number"
              className="settings-input"
              placeholder="3100"
              value={webhookPort}
              onChange={(e) => setWebhookPort(parseInt(e.target.value) || 3100)}
            />
            <p className="settings-hint">
              {t(
                "line.hint.webhookPort",
                "Port for the webhook server (default: 3100)",
              )}
            </p>
          </div>

          <div className="settings-field">
            <label>{t("channels.securityMode", "Security Mode")}</label>
            <select
              className="settings-select"
              value={securityMode}
              onChange={(e) => setSecurityMode(e.target.value as SecurityMode)}
            >
              <option value="pairing">
                {t(
                  "channels.security.pairingRecommended",
                  "Pairing Code (Recommended)",
                )}
              </option>
              <option value="allowlist">
                {t("channels.security.allowlistOnly", "Allowlist Only")}
              </option>
              <option value="open">
                {t("channels.security.openAnyone", "Open (Anyone can use)")}
              </option>
            </select>
            <p className="settings-hint">
              {securityMode === "pairing" &&
                t(
                  "channels.security.pairingHint",
                  "Users must enter a code generated in this app to use the bot",
                )}
              {securityMode === "allowlist" &&
                t(
                  "line.security.allowlistHint",
                  "Only pre-approved LINE user IDs can use the bot",
                )}
              {securityMode === "open" &&
                t(
                  "channels.security.openHint",
                  "Anyone who messages the bot can use it (not recommended)",
                )}
            </p>
          </div>

          {testResult && (
            <div
              className={`test-result ${testResult.success ? "success" : "error"}`}
            >
              {testResult.success ? (
                <>
                  {t("channels.connectedAs", "✓ Connected as {name}").replace(
                    "{name}",
                    testResult.botUsername || "",
                  )}
                </>
              ) : (
                <>✗ {testResult.error}</>
              )}
            </div>
          )}

          <button
            className="button-primary"
            onClick={handleAddChannel}
            disabled={
              saving || !channelAccessToken.trim() || !channelSecret.trim()
            }
          >
            {saving
              ? t("channels.adding", "Adding...")
              : t("line.add", "Add LINE")}
          </button>
        </div>

        <div className="settings-section">
          <h4>{t("channels.setupInstructions", "Setup Instructions")}</h4>
          <ol className="setup-instructions">
            <li>
              {t("line.setup.goTo", "Go to")}{" "}
              <a
                href="https://developers.line.biz/"
                target="_blank"
                rel="noopener noreferrer"
              >
                LINE Developers Console
              </a>
            </li>
            <li>
              {t("line.setup.createChannel", "Create a Messaging API channel")}
            </li>
            <li>
              {t(
                "line.setup.copyCredentials",
                "Copy the Channel Access Token and Channel Secret",
              )}
            </li>
            <li>
              {t(
                "line.setup.configureWebhook",
                "Configure your webhook URL in the console",
              )}
            </li>
            <li>
              {t("line.setup.useNgrok", "Use ngrok for development:")}{" "}
              <code>ngrok http 3100</code>
            </li>
          </ol>
        </div>

        <div className="settings-section">
          <h4>{t("line.features.title", "LINE Features")}</h4>
          <ul className="setup-instructions">
            <li>
              {t("line.features.webhooks", "Real-time messaging via webhooks")}
            </li>
            <li>
              {t(
                "line.features.rich",
                "Support for text, stickers, and rich messages",
              )}
            </li>
            <li>
              {t(
                "line.features.replyTokens",
                "Reply tokens for fast, free responses",
              )}
            </li>
            <li>{t("line.features.groups", "Group and room support")}</li>
          </ul>
        </div>
      </div>
    );
  }

  // Channel is configured
  return (
    <div className="line-settings">
      <div className="settings-section">
        <div className="channel-header">
          <div className="channel-info">
            <h3>
              {channel.name}
              {channel.botUsername && (
                <span className="bot-username">{channel.botUsername}</span>
              )}
            </h3>
            <div className={`channel-status ${channel.status}`}>
              {channel.status === "connected" &&
                t("channels.status.connectedDot", "● Connected")}
              {channel.status === "connecting" &&
                t("channels.status.connectingDot", "○ Connecting...")}
              {channel.status === "disconnected" &&
                t("channels.status.disconnectedDot", "○ Disconnected")}
              {channel.status === "error" &&
                t("channels.status.errorDot", "● Error")}
            </div>
          </div>
          <div className="channel-actions">
            <button
              className={
                channel.enabled ? "button-secondary" : "button-primary"
              }
              onClick={handleToggleEnabled}
              disabled={saving}
            >
              {channel.enabled
                ? t("channels.disable", "Disable")
                : t("channels.enable", "Enable")}
            </button>
            <button
              className="button-secondary"
              onClick={handleTestConnection}
              disabled={testing || !channel.enabled}
            >
              {testing
                ? t("channels.testing", "Testing...")
                : t("channels.test", "Test")}
            </button>
            <button
              className="button-danger"
              onClick={handleRemoveChannel}
              disabled={saving}
            >
              {t("channels.remove", "Remove")}
            </button>
          </div>
        </div>

        {testResult && (
          <div
            className={`test-result ${testResult.success ? "success" : "error"}`}
          >
            {testResult.success ? (
              <>
                {t("channels.connectionSuccessful", "✓ Connection successful")}
              </>
            ) : (
              <>✗ {testResult.error}</>
            )}
          </div>
        )}
      </div>

      <div className="settings-section">
        <h4>{t("channels.securityMode", "Security Mode")}</h4>
        <select
          className="settings-select"
          value={securityMode}
          onChange={(e) =>
            handleUpdateSecurityMode(e.target.value as SecurityMode)
          }
        >
          <option value="pairing">
            {t("channels.security.pairingCode", "Pairing Code")}
          </option>
          <option value="allowlist">
            {t("channels.security.allowlistOnly", "Allowlist Only")}
          </option>
          <option value="open">{t("channels.security.open", "Open")}</option>
        </select>
      </div>

      {securityMode === "pairing" && (
        <div className="settings-section">
          <h4>
            {t("channels.pairing.generateTitle", "Generate Pairing Code")}
          </h4>
          <p className="settings-description">
            {t(
              "line.pairing.description",
              "Generate a one-time code for a user to enter in LINE to gain access.",
            )}
          </p>
          {pairingCode && pairingExpiresAt > 0 ? (
            <PairingCodeDisplay
              code={pairingCode}
              expiresAt={pairingExpiresAt}
              onRegenerate={handleGeneratePairingCode}
              isRegenerating={generatingCode}
            />
          ) : (
            <button
              className="button-secondary"
              onClick={handleGeneratePairingCode}
              disabled={generatingCode}
            >
              {generatingCode
                ? t("channels.pairing.generating", "Generating...")
                : t("channels.pairing.generateCode", "Generate Code")}
            </button>
          )}
        </div>
      )}

      {/* Per-Context Security Policies (DM vs Group) */}
      <div className="settings-section">
        <h4>{t("channels.contextPolicies", "Context Policies")}</h4>
        <p className="settings-description">
          {t(
            "channels.contextPolicies.description",
            "Configure different security settings for direct messages vs group chats.",
          )}
        </p>
        <ContextPolicySettings
          channelId={channel.id}
          channelType="line"
          policies={contextPolicies}
          onPolicyChange={handlePolicyChange}
          isSaving={savingPolicy}
        />
      </div>

      <div className="settings-section">
        <h4>{t("channels.authorizedUsers", "Authorized Users")}</h4>
        {users.length === 0 ? (
          <p className="settings-description">
            {t("channels.users.empty", "No users have connected yet.")}
          </p>
        ) : (
          <div className="users-list">
            {users.map((user) => (
              <div key={user.id} className="user-item">
                <div className="user-info">
                  <span className="user-name">{user.displayName}</span>
                  {user.username && (
                    <span className="user-username">{user.username}</span>
                  )}
                  <span
                    className={`user-status ${user.allowed ? "allowed" : "pending"}`}
                  >
                    {user.allowed
                      ? t("channels.user.allowed", "✓ Allowed")
                      : t("channels.user.pending", "○ Pending")}
                  </span>
                </div>
                {user.allowed && (
                  <button
                    className="button-small button-danger"
                    onClick={() => handleRevokeAccess(user.channelUserId)}
                  >
                    {t("channels.revoke", "Revoke")}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
