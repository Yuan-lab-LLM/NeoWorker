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
import { ResearchChannelsSettings } from "./ResearchChannelsSettings";
import { ChannelSpecializationSettings } from "./ChannelSpecializationSettings";
import { translate, useLanguage } from "../i18n";

interface TelegramSettingsProps {
  onStatusChange?: (connected: boolean) => void;
}

export function TelegramSettings({ onStatusChange }: TelegramSettingsProps) {
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
  const [botToken, setBotToken] = useState("");
  const [channelName, setChannelName] = useState("Telegram Bot");
  const [securityMode, setSecurityMode] = useState<SecurityMode>("pairing");
  const [groupRoutingMode, setGroupRoutingMode] = useState<
    "all" | "mentionsOnly" | "mentionsOrCommands" | "commandsOnly"
  >("mentionsOrCommands");
  const [allowedGroupChatIds, setAllowedGroupChatIds] = useState("");

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
      const telegramChannel = channels.find(
        (c: ChannelData) => c.type === "telegram",
      );

      if (telegramChannel) {
        setChannel(telegramChannel);
        setChannelName(telegramChannel.name);
        setSecurityMode(telegramChannel.securityMode);
        setGroupRoutingMode(
          ((telegramChannel.config.groupRoutingMode as
            "all" | "mentionsOnly" | "mentionsOrCommands" | "commandsOnly") ||
            "mentionsOrCommands") as
            "all" | "mentionsOnly" | "mentionsOrCommands" | "commandsOnly",
        );
        setAllowedGroupChatIds(
          Array.isArray(telegramChannel.config.allowedGroupChatIds)
            ? (telegramChannel.config.allowedGroupChatIds as string[]).join(
                ", ",
              )
            : "",
        );
        onStatusChange?.(telegramChannel.status === "connected");

        // Load users for this channel
        const channelUsers = await window.electronAPI.getGatewayUsers(
          telegramChannel.id,
        );
        setUsers(channelUsers);

        // Load context policies
        const policies = await window.electronAPI.listContextPolicies(
          telegramChannel.id,
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
      console.error("Failed to load Telegram channel:", error);
    } finally {
      setLoading(false);
    }
  }, [onStatusChange]);

  useEffect(() => {
    loadChannel();
  }, [loadChannel]);

  useEffect(() => {
    const unsubscribe = window.electronAPI?.onGatewayUsersUpdated?.((data) => {
      if (data?.channelType !== "telegram") return;
      if (channel && data?.channelId && data.channelId !== channel.id) return;
      loadChannel();
    });
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [channel?.id, loadChannel]);

  const handleAddChannel = async () => {
    if (!botToken.trim()) return;

    try {
      setSaving(true);
      setTestResult(null);

      await window.electronAPI.addGatewayChannel({
        type: "telegram",
        name: channelName,
        botToken: botToken.trim(),
        groupRoutingMode,
        telegramAllowedGroupChatIds: allowedGroupChatIds
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
        securityMode,
      });

      setBotToken("");
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
          "telegram.confirm.remove",
          "Are you sure you want to remove the Telegram channel?",
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

  const handleUpdateRoutingSettings = async () => {
    if (!channel) return;
    try {
      setSaving(true);
      const nextConfig = {
        ...channel.config,
        groupRoutingMode,
        allowedGroupChatIds: allowedGroupChatIds
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
      };
      await window.electronAPI.updateGatewayChannel({
        id: channel.id,
        config: nextConfig,
      });
      setChannel({ ...channel, config: nextConfig });
    } catch (error: Any) {
      setTestResult({ success: false, error: error.message });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="settings-loading">
        {t("telegram.loading", "Loading Telegram settings...")}
      </div>
    );
  }

  // No channel configured yet
  if (!channel) {
    return (
      <div className="telegram-settings">
        <div className="settings-section">
          <h3>{t("telegram.connect.title", "Connect Telegram Bot")}</h3>
          <p className="settings-description">
            {t(
              "telegram.connect.description",
              "Create a bot with @BotFather on Telegram, then enter the bot token here.",
            )}
          </p>

          <div className="settings-field">
            <label>{t("telegram.botName", "Bot Name")}</label>
            <input
              type="text"
              className="settings-input"
              placeholder="My NeoWorker Bot"
              value={channelName}
              onChange={(e) => setChannelName(e.target.value)}
            />
          </div>

          <div className="settings-field">
            <label>{t("telegram.botToken", "Bot Token")}</label>
            <input
              type="password"
              className="settings-input"
              placeholder="1234567890:ABCdefGHI..."
              value={botToken}
              onChange={(e) => setBotToken(e.target.value)}
            />
            <p className="settings-hint">
              {t(
                "telegram.botTokenHint",
                "Get this from @BotFather after creating your bot",
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
                  "telegram.security.pairingHint",
                  "Users must enter a code generated in this app to use the bot",
                )}
              {securityMode === "allowlist" &&
                t(
                  "telegram.security.allowlistHint",
                  "Only pre-approved Telegram user IDs can use the bot",
                )}
              {securityMode === "open" &&
                t(
                  "telegram.security.openHint",
                  "Anyone who messages the bot can use it (not recommended)",
                )}
            </p>
          </div>

          <div className="settings-field">
            <label>{t("telegram.groupRouting", "Group Routing")}</label>
            <select
              className="settings-select"
              value={groupRoutingMode}
              onChange={(e) =>
                setGroupRoutingMode(
                  e.target.value as
                    | "all"
                    | "mentionsOnly"
                    | "mentionsOrCommands"
                    | "commandsOnly",
                )
              }
            >
              <option value="mentionsOrCommands">
                {t(
                  "telegram.routing.mentionsOrCommands",
                  "Mentions or slash commands",
                )}
              </option>
              <option value="mentionsOnly">
                {t("telegram.routing.mentionsOnly", "Mentions or replies only")}
              </option>
              <option value="commandsOnly">
                {t("telegram.routing.commandsOnly", "Slash commands only")}
              </option>
              <option value="all">
                {t("telegram.routing.all", "All group messages")}
              </option>
            </select>
            <p className="settings-hint">
              {t(
                "telegram.groupRoutingHint",
                "Use stricter routing in busy Telegram groups.",
              )}
            </p>
          </div>

          <div className="settings-field">
            <label>
              {t(
                "telegram.allowedGroupIdsOptional",
                "Allowed Group Chat IDs (Optional)",
              )}
            </label>
            <input
              type="text"
              className="settings-input"
              placeholder="-10012345, -10067890"
              value={allowedGroupChatIds}
              onChange={(e) => setAllowedGroupChatIds(e.target.value)}
            />
            <p className="settings-hint">
              {t(
                "telegram.allowedGroupIdsHint",
                "Comma-separated group IDs allowed to trigger the bot. Leave blank to allow any group.",
              )}
            </p>
          </div>

          {testResult && (
            <div
              className={`test-result ${testResult.success ? "success" : "error"}`}
            >
              {testResult.success ? (
                <>
                  {t("channels.connectedAs", "Connected as {name}", {
                    name: `@${testResult.botUsername || ""}`,
                  })}
                </>
              ) : (
                <>✗ {testResult.error}</>
              )}
            </div>
          )}

          <button
            className="button-primary"
            onClick={handleAddChannel}
            disabled={saving || !botToken.trim()}
          >
            {saving
              ? t("channels.adding", "Adding...")
              : t("telegram.addBot", "Add Telegram Bot")}
          </button>
        </div>
      </div>
    );
  }

  // Channel is configured
  return (
    <div className="telegram-settings">
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

      <div className="settings-section">
        <h4>{t("telegram.groupRouting", "Group Routing")}</h4>
        <div className="settings-field">
          <label>{t("telegram.routingRule", "Routing Rule")}</label>
          <select
            className="settings-select"
            value={groupRoutingMode}
            onChange={(e) =>
              setGroupRoutingMode(
                e.target.value as
                  | "all"
                  | "mentionsOnly"
                  | "mentionsOrCommands"
                  | "commandsOnly",
              )
            }
          >
            <option value="mentionsOrCommands">
              {t(
                "telegram.routing.mentionsOrCommands",
                "Mentions or slash commands",
              )}
            </option>
            <option value="mentionsOnly">
              {t("telegram.routing.mentionsOnly", "Mentions or replies only")}
            </option>
            <option value="commandsOnly">
              {t("telegram.routing.commandsOnly", "Slash commands only")}
            </option>
            <option value="all">
              {t("telegram.routing.all", "All group messages")}
            </option>
          </select>
        </div>
        <div className="settings-field">
          <label>
            {t("telegram.allowedGroupIds", "Allowed Group Chat IDs")}
          </label>
          <input
            type="text"
            className="settings-input"
            placeholder="-10012345, -10067890"
            value={allowedGroupChatIds}
            onChange={(e) => setAllowedGroupChatIds(e.target.value)}
          />
          <p className="settings-hint">
            {t(
              "telegram.allowedGroupIdsRestrictHint",
              "Restrict routing to specific groups if you want tighter control.",
            )}
          </p>
        </div>
        <button
          className="button-secondary"
          onClick={handleUpdateRoutingSettings}
          disabled={saving}
        >
          {saving
            ? t("channels.saving", "Saving...")
            : t("telegram.saveRouting", "Save Routing Settings")}
        </button>
      </div>

      {securityMode === "pairing" && (
        <div className="settings-section">
          <h4>
            {t("channels.pairing.generateTitle", "Generate Pairing Code")}
          </h4>
          <p className="settings-description">
            {t(
              "telegram.pairing.description",
              "Generate a one-time code for a user to enter in Telegram to gain access.",
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

      <ResearchChannelsSettings
        channelId={channel.id}
        channelConfig={(channel.config || {}) as Record<string, unknown>}
        onConfigChange={async (config) => {
          await window.electronAPI.updateGatewayChannel({
            id: channel.id,
            config: { ...channel.config, ...config },
          });
          setChannel({ ...channel, config: { ...channel.config, ...config } });
        }}
        channelType="telegram"
      />

      <ChannelSpecializationSettings channelId={channel.id} />

      {/* Per-Context Security Policies (DM vs Group) */}
      <div className="settings-section">
        <h4>{t("channels.contextPolicies", "Context Policies")}</h4>
        <p className="settings-description">
          {t(
            "telegram.contextPoliciesHint",
            "Configure different security settings for direct messages vs group chats.",
          )}
        </p>
        <ContextPolicySettings
          channelId={channel.id}
          channelType="telegram"
          policies={contextPolicies}
          onPolicyChange={handlePolicyChange}
          isSaving={savingPolicy}
        />
      </div>

      <div className="settings-section">
        <h4>{t("channels.authorizedUsers", "Authorized Users")}</h4>
        {users.length === 0 ? (
          <p className="settings-description">
            {t("channels.noUsers", "No users have connected yet.")}
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
