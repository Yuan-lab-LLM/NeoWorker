import { useState, useEffect, useCallback } from "react";
import { ChannelData, ChannelUserData, SecurityMode } from "../../shared/types";
import { ChannelSpecializationSettings } from "./ChannelSpecializationSettings";
import { translate, useLanguage } from "../i18n";

interface DiscordSettingsProps {
  onStatusChange?: (connected: boolean) => void;
}

function parseCsvIds(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatCsvIds(value?: string[]): string {
  return (value || []).join(", ");
}

function getSupervisorConfigError(input: {
  enabled: boolean;
  coordinationChannelId: string;
  workerAgentRoleId: string;
  supervisorAgentRoleId: string;
  peerBotUserIds: string;
}): string | null {
  if (!input.enabled) return null;
  if (!input.coordinationChannelId.trim()) {
    return translate(
      "discord.supervisor.error.coordinationRequired",
      "Coordination channel ID is required when supervisor mode is enabled.",
    );
  }
  if (!parseCsvIds(input.peerBotUserIds).length) {
    return translate(
      "discord.supervisor.error.peerRequired",
      "At least one peer bot user ID is required when supervisor mode is enabled.",
    );
  }
  if (!input.workerAgentRoleId) {
    return translate(
      "discord.supervisor.error.workerRequired",
      "Worker agent role is required when supervisor mode is enabled.",
    );
  }
  if (!input.supervisorAgentRoleId) {
    return translate(
      "discord.supervisor.error.supervisorRequired",
      "Supervisor agent role is required when supervisor mode is enabled.",
    );
  }
  return null;
}

export function DiscordSettings({ onStatusChange }: DiscordSettingsProps) {
  useLanguage();
  const t = translate;
  const [channel, setChannel] = useState<ChannelData | null>(null);
  const [users, setUsers] = useState<ChannelUserData[]>([]);
  const [agentRoles, setAgentRoles] = useState<Any[]>([]);
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
  const [applicationId, setApplicationId] = useState("");
  const [guildIds, setGuildIds] = useState("");
  const [channelName, setChannelName] = useState("Discord Bot");
  const [securityMode, setSecurityMode] = useState<SecurityMode>("pairing");
  const [supervisorEnabled, setSupervisorEnabled] = useState(false);
  const [coordinationChannelId, setCoordinationChannelId] = useState("");
  const [watchedChannelIds, setWatchedChannelIds] = useState("");
  const [workerAgentRoleId, setWorkerAgentRoleId] = useState("");
  const [supervisorAgentRoleId, setSupervisorAgentRoleId] = useState("");
  const [humanEscalationChannelId, setHumanEscalationChannelId] = useState("");
  const [humanEscalationUserId, setHumanEscalationUserId] = useState("");
  const [peerBotUserIds, setPeerBotUserIds] = useState("");
  const [strictMode, setStrictMode] = useState(true);
  const supervisorValidationError = getSupervisorConfigError({
    enabled: supervisorEnabled,
    coordinationChannelId,
    workerAgentRoleId,
    supervisorAgentRoleId,
    peerBotUserIds,
  });

  // Pairing code state
  const [pairingCode, setPairingCode] = useState<string | null>(null);

  const loadChannel = useCallback(async () => {
    try {
      setLoading(true);
      const [channels, roles] = await Promise.all([
        window.electronAPI.getGatewayChannels(),
        window.electronAPI.getAgentRoles?.(true).catch(() => []),
      ]);
      setAgentRoles(roles || []);
      const discordChannel = channels.find(
        (c: ChannelData) => c.type === "discord",
      );

      if (discordChannel) {
        setChannel(discordChannel);
        setChannelName(discordChannel.name);
        setSecurityMode(discordChannel.securityMode);
        const supervisorConfig =
          discordChannel.config?.supervisor &&
          typeof discordChannel.config.supervisor === "object"
            ? discordChannel.config.supervisor
            : undefined;
        setSupervisorEnabled(supervisorConfig?.enabled === true);
        setCoordinationChannelId(supervisorConfig?.coordinationChannelId || "");
        setWatchedChannelIds(formatCsvIds(supervisorConfig?.watchedChannelIds));
        setWorkerAgentRoleId(supervisorConfig?.workerAgentRoleId || "");
        setSupervisorAgentRoleId(supervisorConfig?.supervisorAgentRoleId || "");
        setHumanEscalationChannelId(
          supervisorConfig?.humanEscalationChannelId || "",
        );
        setHumanEscalationUserId(supervisorConfig?.humanEscalationUserId || "");
        setPeerBotUserIds(formatCsvIds(supervisorConfig?.peerBotUserIds));
        setStrictMode(supervisorConfig?.strictMode !== false);
        onStatusChange?.(discordChannel.status === "connected");

        // Load users for this channel
        const channelUsers = await window.electronAPI.getGatewayUsers(
          discordChannel.id,
        );
        setUsers(channelUsers);
      }
    } catch (error) {
      console.error("Failed to load Discord channel:", error);
    } finally {
      setLoading(false);
    }
  }, [onStatusChange]);

  useEffect(() => {
    loadChannel();
  }, [loadChannel]);

  useEffect(() => {
    const unsubscribe = window.electronAPI?.onGatewayUsersUpdated?.((data) => {
      if (data?.channelType !== "discord") return;
      if (channel && data?.channelId && data.channelId !== channel.id) return;
      loadChannel();
    });
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [channel?.id, loadChannel]);

  const handleAddChannel = async () => {
    if (!botToken.trim() || !applicationId.trim()) return;
    if (supervisorValidationError) {
      setTestResult({ success: false, error: supervisorValidationError });
      return;
    }

    try {
      setSaving(true);
      setTestResult(null);

      // Parse guild IDs (comma-separated, optional)
      const parsedGuildIds = guildIds.trim()
        ? guildIds
            .split(",")
            .map((id) => id.trim())
            .filter((id) => id)
        : undefined;

      await window.electronAPI.addGatewayChannel({
        type: "discord",
        name: channelName,
        botToken: botToken.trim(),
        applicationId: applicationId.trim(),
        guildIds: parsedGuildIds,
        discordSupervisor: {
          enabled: supervisorEnabled,
          coordinationChannelId: coordinationChannelId.trim() || undefined,
          watchedChannelIds: parseCsvIds(watchedChannelIds),
          workerAgentRoleId: workerAgentRoleId || undefined,
          supervisorAgentRoleId: supervisorAgentRoleId || undefined,
          humanEscalationChannelId:
            humanEscalationChannelId.trim() || undefined,
          humanEscalationUserId: humanEscalationUserId.trim() || undefined,
          peerBotUserIds: parseCsvIds(peerBotUserIds),
          strictMode,
        },
        securityMode,
      });

      setBotToken("");
      setApplicationId("");
      setGuildIds("");
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
          "discord.confirm.remove",
          "Are you sure you want to remove the Discord channel?",
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

  const handleSaveSupervisorSettings = async () => {
    if (!channel) return;
    if (supervisorValidationError) {
      setTestResult({ success: false, error: supervisorValidationError });
      return;
    }

    try {
      setSaving(true);
      setTestResult(null);
      await window.electronAPI.updateGatewayChannel({
        id: channel.id,
        config: {
          supervisor: {
            enabled: supervisorEnabled,
            coordinationChannelId: coordinationChannelId.trim() || undefined,
            watchedChannelIds: parseCsvIds(watchedChannelIds),
            workerAgentRoleId: workerAgentRoleId || undefined,
            supervisorAgentRoleId: supervisorAgentRoleId || undefined,
            humanEscalationChannelId:
              humanEscalationChannelId.trim() || undefined,
            humanEscalationUserId: humanEscalationUserId.trim() || undefined,
            peerBotUserIds: parseCsvIds(peerBotUserIds),
            strictMode,
          },
        },
      });
      await loadChannel();
    } catch (error: Any) {
      setTestResult({
        success: false,
        error:
          error.message ||
          t("discord.error.saveSupervisor", "Failed to save supervisor mode"),
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="settings-loading">
        {t("discord.loading", "Loading Discord settings...")}
      </div>
    );
  }

  // No channel configured yet
  if (!channel) {
    return (
      <div className="discord-settings">
        <div className="settings-section">
          <h3>{t("discord.connect.title", "Connect Discord Bot")}</h3>
          <p className="settings-description">
            {t(
              "discord.connect.description",
              "Create a bot in the Discord Developer Portal, then enter the credentials here.",
            )}
          </p>

          <div className="settings-field">
            <label>{t("discord.field.botName", "Bot Name")}</label>
            <input
              type="text"
              className="settings-input"
              placeholder="My NeoWorker Bot"
              value={channelName}
              onChange={(e) => setChannelName(e.target.value)}
            />
          </div>

          <div className="settings-field">
            <label>{t("discord.field.applicationId", "Application ID")}</label>
            <input
              type="text"
              className="settings-input"
              placeholder="123456789012345678"
              value={applicationId}
              onChange={(e) => setApplicationId(e.target.value)}
            />
            <p className="settings-hint">
              {t(
                "discord.hint.applicationId",
                "Found in Discord Developer Portal under your application's General Information",
              )}
            </p>
          </div>

          <div className="settings-field">
            <label>{t("discord.field.botToken", "Bot Token")}</label>
            <input
              type="password"
              className="settings-input"
              placeholder="MTIz..."
              value={botToken}
              onChange={(e) => setBotToken(e.target.value)}
            />
            <p className="settings-hint">
              {t(
                "discord.hint.botToken",
                "Found in Discord Developer Portal under your application's Bot section",
              )}
            </p>
          </div>

          <div className="settings-field">
            <label>{t("discord.field.guildIds", "Guild IDs (Optional)")}</label>
            <input
              type="text"
              className="settings-input"
              placeholder="123456789012345678, 987654321098765432"
              value={guildIds}
              onChange={(e) => setGuildIds(e.target.value)}
            />
            <p className="settings-hint">
              {t(
                "discord.hint.guildIds",
                "Comma-separated server IDs for instant slash command registration. Leave empty for global commands (takes up to 1 hour to propagate).",
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
                  "discord.security.pairingHint",
                  "Users must enter a code generated in this app to use the bot",
                )}
              {securityMode === "allowlist" &&
                t(
                  "discord.security.allowlistHint",
                  "Only pre-approved Discord user IDs can use the bot",
                )}
              {securityMode === "open" &&
                t(
                  "discord.security.openHint",
                  "Anyone who messages the bot can use it (not recommended)",
                )}
            </p>
          </div>

          <div className="settings-section" style={{ marginTop: 24 }}>
            <h4>
              {t("discord.supervisor.title", "Supervisor Mode (Optional)")}
            </h4>
            <p className="settings-description">
              {t(
                "discord.supervisor.description",
                "Configure a dedicated Discord coordination lane where one NeoWorker agent supervises another.",
              )}
            </p>

            <label className="settings-checkbox">
              <input
                type="checkbox"
                checked={supervisorEnabled}
                onChange={(e) => setSupervisorEnabled(e.target.checked)}
              />
              {t(
                "discord.supervisor.enable",
                "Enable Discord supervisor protocol",
              )}
            </label>

            {supervisorEnabled && (
              <>
                <div className="settings-field">
                  <label>
                    {t(
                      "discord.supervisor.coordinationChannelId",
                      "Coordination Channel ID",
                    )}
                  </label>
                  <input
                    type="text"
                    className="settings-input"
                    placeholder="123456789012345678"
                    value={coordinationChannelId}
                    onChange={(e) => setCoordinationChannelId(e.target.value)}
                  />
                </div>

                <div className="settings-field">
                  <label>
                    {t(
                      "discord.supervisor.watchedChannelIds",
                      "Watched Output Channel IDs",
                    )}
                  </label>
                  <input
                    type="text"
                    className="settings-input"
                    placeholder="123..., 456..."
                    value={watchedChannelIds}
                    onChange={(e) => setWatchedChannelIds(e.target.value)}
                  />
                </div>

                <div className="settings-field">
                  <label>
                    {t(
                      "discord.supervisor.peerBotUserIds",
                      "Peer Bot User IDs",
                    )}
                  </label>
                  <input
                    type="text"
                    className="settings-input"
                    placeholder="987..., 654..."
                    value={peerBotUserIds}
                    onChange={(e) => setPeerBotUserIds(e.target.value)}
                  />
                  <p className="settings-hint">
                    {t(
                      "discord.supervisor.peerHint",
                      "These bot user IDs are allowed to participate in the strict coordination protocol.",
                    )}
                  </p>
                </div>

                <div className="settings-field">
                  <label>
                    {t("discord.supervisor.workerRole", "Worker Agent Role")}
                  </label>
                  <select
                    className="settings-select"
                    value={workerAgentRoleId}
                    onChange={(e) => setWorkerAgentRoleId(e.target.value)}
                  >
                    <option value="">
                      {t(
                        "discord.supervisor.selectWorkerRole",
                        "Select worker role",
                      )}
                    </option>
                    {agentRoles.map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.displayName || role.name || role.id}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="settings-field">
                  <label>
                    {t(
                      "discord.supervisor.supervisorRole",
                      "Supervisor Agent Role",
                    )}
                  </label>
                  <select
                    className="settings-select"
                    value={supervisorAgentRoleId}
                    onChange={(e) => setSupervisorAgentRoleId(e.target.value)}
                  >
                    <option value="">
                      {t(
                        "discord.supervisor.selectSupervisorRole",
                        "Select supervisor role",
                      )}
                    </option>
                    {agentRoles.map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.displayName || role.name || role.id}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="settings-field">
                  <label>
                    {t(
                      "discord.supervisor.humanEscalationChannelId",
                      "Human Escalation Channel ID",
                    )}
                  </label>
                  <input
                    type="text"
                    className="settings-input"
                    placeholder="123456789012345678"
                    value={humanEscalationChannelId}
                    onChange={(e) =>
                      setHumanEscalationChannelId(e.target.value)
                    }
                  />
                </div>

                <div className="settings-field">
                  <label>
                    {t(
                      "discord.supervisor.humanEscalationUserId",
                      "Human Escalation User ID",
                    )}
                  </label>
                  <input
                    type="text"
                    className="settings-input"
                    placeholder="123456789012345678"
                    value={humanEscalationUserId}
                    onChange={(e) => setHumanEscalationUserId(e.target.value)}
                  />
                </div>

                <label className="settings-checkbox">
                  <input
                    type="checkbox"
                    checked={strictMode}
                    onChange={(e) => setStrictMode(e.target.checked)}
                  />
                  {t(
                    "discord.supervisor.strictMode",
                    "Strict marker and peer-mention enforcement",
                  )}
                </label>

                {supervisorValidationError && (
                  <p className="settings-hint warning">
                    {supervisorValidationError}
                  </p>
                )}
              </>
            )}
          </div>

          {testResult && (
            <div
              className={`test-result ${testResult.success ? "success" : "error"}`}
            >
              {testResult.success ? (
                <>
                  {t("channels.connectedAs", "Connected as {name}", {
                    name: testResult.botUsername || "",
                  })}
                </>
              ) : (
                <>{testResult.error}</>
              )}
            </div>
          )}

          <button
            className="button-primary"
            onClick={handleAddChannel}
            disabled={
              saving ||
              !botToken.trim() ||
              !applicationId.trim() ||
              !!supervisorValidationError
            }
          >
            {saving
              ? t("channels.adding", "Adding...")
              : t("discord.addBot", "Add Discord Bot")}
          </button>
        </div>

        <div className="settings-section">
          <h4>{t("discord.setup.title", "Setup Instructions")}</h4>
          <ol className="setup-instructions">
            <li>
              {t("discord.setup.goTo", "Go to")}{" "}
              <a
                href="https://discord.com/developers/applications"
                target="_blank"
                rel="noopener noreferrer"
              >
                Discord Developer Portal
              </a>
            </li>
            <li>
              {t(
                "discord.setup.newApplication",
                'Click "New Application" and give it a name',
              )}
            </li>
            <li>
              {t(
                "discord.setup.copyApplicationId",
                "Copy the Application ID from General Information",
              )}
            </li>
            <li>
              {t(
                "discord.setup.addBot",
                'Go to the Bot section and click "Add Bot"',
              )}
            </li>
            <li>
              {t(
                "discord.setup.resetToken",
                'Click "Reset Token" and copy the bot token',
              )}
            </li>
            <li>
              {t(
                "discord.setup.messageContentIntent",
                'Under Privileged Gateway Intents, enable "Message Content Intent"',
              )}
            </li>
            <li>
              {t(
                "discord.setup.urlGenerator",
                'Go to OAuth2 > URL Generator, select "bot" and "applications.commands"',
              )}
            </li>
            <li>
              {t(
                "discord.setup.permissions",
                "Select permissions: Send Messages, Read Message History, Use Slash Commands",
              )}
            </li>
            <li>
              {t(
                "discord.setup.openUrl",
                "Copy the generated URL and open it to add the bot to your server",
              )}
            </li>
          </ol>
        </div>
      </div>
    );
  }

  // Channel is configured
  return (
    <div className="discord-settings">
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
                t("channels.status.connected", "Connected")}
              {channel.status === "connecting" &&
                t("channels.status.connecting", "Connecting...")}
              {channel.status === "disconnected" &&
                t("channels.status.disconnected", "Disconnected")}
              {channel.status === "error" &&
                t("channels.status.error", "Error")}
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
                ? t("common.disable", "Disable")
                : t("common.enable", "Enable")}
            </button>
            <button
              className="button-secondary"
              onClick={handleTestConnection}
              disabled={testing || !channel.enabled}
            >
              {testing
                ? t("common.testing", "Testing...")
                : t("common.test", "Test")}
            </button>
            <button
              className="button-danger"
              onClick={handleRemoveChannel}
              disabled={saving}
            >
              {t("common.remove", "Remove")}
            </button>
          </div>
        </div>

        {testResult && (
          <div
            className={`test-result ${testResult.success ? "success" : "error"}`}
          >
            {testResult.success ? (
              <>{t("channels.connectionSuccessful", "Connection successful")}</>
            ) : (
              <>{testResult.error}</>
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
              "discord.pairing.description",
              "Generate a one-time code for a user to enter in Discord to gain access.",
            )}
          </p>
          <button
            className="button-secondary"
            onClick={handleGeneratePairingCode}
          >
            {t("channels.pairing.generateCode", "Generate Code")}
          </button>
          {pairingCode && (
            <div className="pairing-code-display">
              <span className="pairing-code">{pairingCode}</span>
              <p className="settings-hint">
                {t(
                  "discord.pairing.commandHint",
                  "User should use /pair command with this code within 5 minutes",
                )}
              </p>
            </div>
          )}
        </div>
      )}

      <ChannelSpecializationSettings channelId={channel.id} />

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
                      ? t("channels.user.allowedPlain", "Allowed")
                      : t("channels.user.pendingPlain", "Pending")}
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

      <div className="settings-section">
        <h4>{t("discord.supervisor.titleManage", "Supervisor Mode")}</h4>
        <p className="settings-description">
          {t(
            "discord.supervisor.manageDescription",
            "Configure a strict coordination channel for worker and supervisor agents, plus the human escalation target.",
          )}
        </p>

        <label className="settings-checkbox">
          <input
            type="checkbox"
            checked={supervisorEnabled}
            onChange={(e) => setSupervisorEnabled(e.target.checked)}
          />
          {t("discord.supervisor.enable", "Enable Discord supervisor protocol")}
        </label>

        <div className="settings-field">
          <label>
            {t(
              "discord.supervisor.coordinationChannelId",
              "Coordination Channel ID",
            )}
          </label>
          <input
            type="text"
            className="settings-input"
            placeholder="123456789012345678"
            value={coordinationChannelId}
            onChange={(e) => setCoordinationChannelId(e.target.value)}
          />
        </div>

        <div className="settings-field">
          <label>
            {t(
              "discord.supervisor.watchedChannelIds",
              "Watched Output Channel IDs",
            )}
          </label>
          <input
            type="text"
            className="settings-input"
            placeholder="123..., 456..."
            value={watchedChannelIds}
            onChange={(e) => setWatchedChannelIds(e.target.value)}
          />
        </div>

        <div className="settings-field">
          <label>
            {t("discord.supervisor.peerBotUserIds", "Peer Bot User IDs")}
          </label>
          <input
            type="text"
            className="settings-input"
            placeholder="987..., 654..."
            value={peerBotUserIds}
            onChange={(e) => setPeerBotUserIds(e.target.value)}
          />
        </div>

        <div className="settings-field">
          <label>
            {t("discord.supervisor.workerRole", "Worker Agent Role")}
          </label>
          <select
            className="settings-select"
            value={workerAgentRoleId}
            onChange={(e) => setWorkerAgentRoleId(e.target.value)}
          >
            <option value="">
              {t("discord.supervisor.selectWorkerRole", "Select worker role")}
            </option>
            {agentRoles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.displayName || role.name || role.id}
              </option>
            ))}
          </select>
        </div>

        <div className="settings-field">
          <label>
            {t("discord.supervisor.supervisorRole", "Supervisor Agent Role")}
          </label>
          <select
            className="settings-select"
            value={supervisorAgentRoleId}
            onChange={(e) => setSupervisorAgentRoleId(e.target.value)}
          >
            <option value="">
              {t(
                "discord.supervisor.selectSupervisorRole",
                "Select supervisor role",
              )}
            </option>
            {agentRoles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.displayName || role.name || role.id}
              </option>
            ))}
          </select>
        </div>

        <div className="settings-field">
          <label>
            {t(
              "discord.supervisor.humanEscalationChannelId",
              "Human Escalation Channel ID",
            )}
          </label>
          <input
            type="text"
            className="settings-input"
            placeholder="123456789012345678"
            value={humanEscalationChannelId}
            onChange={(e) => setHumanEscalationChannelId(e.target.value)}
          />
        </div>

        <div className="settings-field">
          <label>
            {t(
              "discord.supervisor.humanEscalationUserId",
              "Human Escalation User ID",
            )}
          </label>
          <input
            type="text"
            className="settings-input"
            placeholder="123456789012345678"
            value={humanEscalationUserId}
            onChange={(e) => setHumanEscalationUserId(e.target.value)}
          />
        </div>

        <label className="settings-checkbox">
          <input
            type="checkbox"
            checked={strictMode}
            onChange={(e) => setStrictMode(e.target.checked)}
          />
          {t(
            "discord.supervisor.strictMode",
            "Strict marker and peer-mention enforcement",
          )}
        </label>

        {supervisorValidationError && (
          <p className="settings-hint warning">{supervisorValidationError}</p>
        )}

        <button
          className="button-primary"
          onClick={handleSaveSupervisorSettings}
          disabled={saving || !!supervisorValidationError}
        >
          {saving
            ? t("common.saving", "Saving...")
            : t("discord.supervisor.save", "Save Supervisor Mode")}
        </button>
      </div>

      <div className="settings-section">
        <h4>{t("discord.commands.title", "Available Commands")}</h4>
        <div className="commands-list">
          <div className="command-item">
            <code>/start</code> -{" "}
            {t("discord.commands.start", "Start the bot and get help")}
          </div>
          <div className="command-item">
            <code>/help</code> -{" "}
            {t("discord.commands.help", "Show available commands")}
          </div>
          <div className="command-item">
            <code>/workspaces</code> -{" "}
            {t("discord.commands.workspaces", "List available workspaces")}
          </div>
          <div className="command-item">
            <code>/workspace</code> -{" "}
            {t(
              "discord.commands.workspace",
              "Select or show current workspace",
            )}
          </div>
          <div className="command-item">
            <code>/addworkspace</code> -{" "}
            {t("discord.commands.addWorkspace", "Add a new workspace by path")}
          </div>
          <div className="command-item">
            <code>/newtask</code> -{" "}
            {t("discord.commands.newTask", "Start a fresh task/conversation")}
          </div>
          <div className="command-item">
            <code>/provider</code> -{" "}
            {t(
              "discord.commands.provider",
              "Change or show current LLM provider",
            )}
          </div>
          <div className="command-item">
            <code>/models</code> -{" "}
            {t("discord.commands.models", "List available AI models")}
          </div>
          <div className="command-item">
            <code>/model</code> -{" "}
            {t("discord.commands.model", "Change or show current model")}
          </div>
          <div className="command-item">
            <code>/status</code> -{" "}
            {t("discord.commands.status", "Check bot status")}
          </div>
          <div className="command-item">
            <code>/cancel</code> -{" "}
            {t("discord.commands.cancel", "Cancel current task")}
          </div>
          <div className="command-item">
            <code>/task</code> -{" "}
            {t("discord.commands.task", "Run a task directly")}
          </div>
          <div className="command-item">
            <code>/pair</code> -{" "}
            {t("discord.commands.pair", "Pair with a pairing code")}
          </div>
        </div>
      </div>
    </div>
  );
}
