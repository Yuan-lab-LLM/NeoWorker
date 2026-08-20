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

interface MattermostSettingsProps {
  onStatusChange?: (connected: boolean) => void;
}

export function MattermostSettings({
  onStatusChange,
}: MattermostSettingsProps) {
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
  const [channelName, setChannelName] = useState("Mattermost");
  const [securityMode, setSecurityMode] = useState<SecurityMode>("pairing");
  const [serverUrl, setServerUrl] = useState("");
  const [token, setToken] = useState("");
  const [teamId, setTeamId] = useState("");

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
      const mattermostChannel = channels.find(
        (c: ChannelData) => c.type === "mattermost",
      );

      if (mattermostChannel) {
        setChannel(mattermostChannel);
        setChannelName(mattermostChannel.name);
        setSecurityMode(mattermostChannel.securityMode);
        onStatusChange?.(mattermostChannel.status === "connected");

        // Load config settings
        if (mattermostChannel.config) {
          setServerUrl((mattermostChannel.config.serverUrl as string) || "");
          setToken((mattermostChannel.config.token as string) || "");
          setTeamId((mattermostChannel.config.teamId as string) || "");
        }

        // Load users for this channel
        const channelUsers = await window.electronAPI.getGatewayUsers(
          mattermostChannel.id,
        );
        setUsers(channelUsers);

        // Load context policies
        const policies = await window.electronAPI.listContextPolicies(
          mattermostChannel.id,
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
      console.error("Failed to load Mattermost channel:", error);
    } finally {
      setLoading(false);
    }
  }, [onStatusChange]);

  useEffect(() => {
    loadChannel();
  }, [loadChannel]);

  useEffect(() => {
    const unsubscribe = window.electronAPI?.onGatewayUsersUpdated?.((data) => {
      if (data?.channelType !== "mattermost") return;
      if (channel && data?.channelId && data.channelId !== channel.id) return;
      loadChannel();
    });
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [channel?.id, loadChannel]);

  const handleAddChannel = async () => {
    if (!serverUrl.trim() || !token.trim()) {
      setTestResult({
        success: false,
        error: t(
          "mattermost.error.required",
          "Server URL and access token are required",
        ),
      });
      return;
    }

    try {
      setSaving(true);
      setTestResult(null);

      await window.electronAPI.addGatewayChannel({
        type: "mattermost",
        name: channelName,
        securityMode,
        mattermostServerUrl: serverUrl.trim(),
        mattermostToken: token.trim(),
        mattermostTeamId: teamId.trim() || undefined,
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
          "mattermost.confirm.remove",
          "Are you sure you want to remove the Mattermost channel?",
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

  const handleRevokeAccess = async (userId: string) => {
    if (!channel) return;

    try {
      await window.electronAPI.revokeGatewayAccess(channel.id, userId);
      await loadChannel();
    } catch (error: Any) {
      console.error("Failed to revoke access:", error);
    }
  };

  if (loading) {
    return (
      <div className="settings-loading">
        {t("mattermost.loading", "Loading Mattermost settings...")}
      </div>
    );
  }

  // No channel configured yet
  if (!channel) {
    return (
      <div className="mattermost-settings">
        <div className="settings-section">
          <h3>{t("mattermost.connect.title", "Connect Mattermost")}</h3>
          <p className="settings-description">
            {t(
              "mattermost.connect.description",
              "Connect to your Mattermost server to receive and send messages. Supports both self-hosted and cloud instances.",
            )}
          </p>

          <div className="settings-field">
            <label>{t("channels.channelName", "Channel Name")}</label>
            <input
              type="text"
              className="settings-input"
              placeholder="My Mattermost"
              value={channelName}
              onChange={(e) => setChannelName(e.target.value)}
            />
          </div>

          <div className="settings-field">
            <label>{t("mattermost.field.serverUrl", "Server URL")}</label>
            <input
              type="text"
              className="settings-input"
              placeholder="https://your-team.mattermost.com"
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
            />
            <p className="settings-hint">
              {t(
                "mattermost.hint.serverUrl",
                "Your Mattermost server URL (include https://)",
              )}
            </p>
          </div>

          <div className="settings-field">
            <label>
              {t("mattermost.field.token", "Personal Access Token")}
            </label>
            <input
              type="password"
              className="settings-input"
              placeholder="Enter your access token"
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
            <p className="settings-hint">
              {t(
                "mattermost.hint.token",
                "Generate a token in Account Settings > Security > Personal Access Tokens",
              )}
            </p>
          </div>

          <div className="settings-field">
            <label>
              {t("mattermost.field.teamIdOptional", "Team ID (Optional)")}
            </label>
            <input
              type="text"
              className="settings-input"
              placeholder={t(
                "mattermost.placeholder.teamId",
                "Leave empty to use default team",
              )}
              value={teamId}
              onChange={(e) => setTeamId(e.target.value)}
            />
            <p className="settings-hint">
              {t(
                "mattermost.hint.teamId",
                "Specific team to operate in (optional)",
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
                  "mattermost.security.allowlistHint",
                  "Only pre-approved Mattermost user IDs can use the bot",
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
            disabled={saving || !serverUrl.trim() || !token.trim()}
          >
            {saving
              ? t("channels.adding", "Adding...")
              : t("mattermost.add", "Add Mattermost")}
          </button>
        </div>

        <div className="settings-section">
          <h4>{t("channels.setupInstructions", "Setup Instructions")}</h4>
          <ol className="setup-instructions">
            <li>
              {t("mattermost.setup.goToServer", "Go to your Mattermost server")}
            </li>
            <li>
              {t(
                "mattermost.setup.accountSettings",
                "Click on your profile picture > Account Settings",
              )}
            </li>
            <li>
              {t(
                "mattermost.setup.personalTokens",
                "Go to Security > Personal Access Tokens",
              )}
            </li>
            <li>
              {t(
                "mattermost.setup.createToken",
                'Click "Create Token" and copy the token',
              )}
            </li>
            <li>
              {t(
                "mattermost.setup.enterCredentials",
                "Enter the server URL and token above",
              )}
            </li>
          </ol>
        </div>
      </div>
    );
  }

  // Channel is configured
  return (
    <div className="mattermost-settings">
      <div className="settings-section">
        <div className="channel-header">
          <div className="channel-info">
            <h3>
              {channel.name}
              {channel.botUsername && (
                <span className="bot-username">@{channel.botUsername}</span>
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
              "mattermost.pairing.description",
              "Generate a one-time code for a user to enter in Mattermost to gain access.",
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
          channelType="mattermost"
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
                    <span className="user-username">@{user.username}</span>
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
