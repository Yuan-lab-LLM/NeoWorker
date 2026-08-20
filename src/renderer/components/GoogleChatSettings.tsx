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

interface GoogleChatSettingsProps {
  onStatusChange?: (connected: boolean) => void;
}

export function GoogleChatSettings({
  onStatusChange,
}: GoogleChatSettingsProps) {
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
  const [serviceAccountKeyPath, setServiceAccountKeyPath] = useState("");
  const [projectId, setProjectId] = useState("");
  const [webhookPort, setWebhookPort] = useState("3979");
  const [webhookPath, setWebhookPath] = useState("/googlechat/webhook");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [channelName, setChannelName] = useState("Google Chat Bot");
  const [securityMode, setSecurityMode] = useState<SecurityMode>("pairing");

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
      const googleChatChannel = channels.find(
        (c: ChannelData) => c.type === "googlechat",
      );

      if (googleChatChannel) {
        setChannel(googleChatChannel);
        setChannelName(googleChatChannel.name);
        setSecurityMode(googleChatChannel.securityMode);
        onStatusChange?.(googleChatChannel.status === "connected");

        // Load users for this channel
        const channelUsers = await window.electronAPI.getGatewayUsers(
          googleChatChannel.id,
        );
        setUsers(channelUsers);

        // Load context policies
        const policies = await window.electronAPI.listContextPolicies(
          googleChatChannel.id,
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
      console.error("Failed to load Google Chat channel:", error);
    } finally {
      setLoading(false);
    }
  }, [onStatusChange]);

  useEffect(() => {
    loadChannel();
  }, [loadChannel]);

  useEffect(() => {
    const unsubscribe = window.electronAPI?.onGatewayUsersUpdated?.((data) => {
      if (data?.channelType !== "googlechat") return;
      if (channel && data?.channelId && data.channelId !== channel.id) return;
      loadChannel();
    });
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [channel?.id, loadChannel]);

  const handleAddChannel = async () => {
    if (!serviceAccountKeyPath.trim() || !webhookSecret.trim()) return;

    try {
      setSaving(true);
      setTestResult(null);

      await window.electronAPI.addGatewayChannel({
        type: "googlechat",
        name: channelName,
        serviceAccountKeyPath: serviceAccountKeyPath.trim(),
        projectId: projectId.trim() || undefined,
        webhookPort: parseInt(webhookPort) || 3979,
        webhookPath: webhookPath.trim() || "/googlechat/webhook",
        webhookSecret: webhookSecret.trim(),
        securityMode,
      });

      setServiceAccountKeyPath("");
      setProjectId("");
      setWebhookSecret("");
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
          "googleChat.confirm.remove",
          "Are you sure you want to remove the Google Chat channel?",
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

  if (loading) {
    return (
      <div className="settings-loading">
        {t("googleChat.loading", "Loading Google Chat settings...")}
      </div>
    );
  }

  // No channel configured yet
  if (!channel) {
    return (
      <div className="googlechat-settings">
        <div className="settings-section">
          <h3>{t("googleChat.connect.title", "Connect Google Chat Bot")}</h3>
          <p className="settings-description">
            {t(
              "googleChat.connect.description",
              "Create a Google Cloud project with Chat API enabled and a service account, then configure the webhook.",
            )}
          </p>

          <div className="settings-field">
            <label>{t("googleChat.field.botName", "Bot Name")}</label>
            <input
              type="text"
              className="settings-input"
              placeholder="My NeoWorker Bot"
              value={channelName}
              onChange={(e) => setChannelName(e.target.value)}
            />
          </div>

          <div className="settings-field">
            <label>
              {t(
                "googleChat.field.serviceAccountKeyPath",
                "Service Account Key File Path",
              )}
            </label>
            <input
              type="text"
              className="settings-input"
              placeholder="/path/to/service-account-key.json"
              value={serviceAccountKeyPath}
              onChange={(e) => setServiceAccountKeyPath(e.target.value)}
            />
            <p className="settings-hint">
              {t(
                "googleChat.hint.serviceAccountKeyPath",
                "Full path to the JSON key file downloaded from Google Cloud Console",
              )}
            </p>
          </div>

          <div className="settings-field">
            <label>
              {t("googleChat.field.projectId", "Project ID (Optional)")}
            </label>
            <input
              type="text"
              className="settings-input"
              placeholder="my-project-id"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
            />
            <p className="settings-hint">
              {t(
                "googleChat.hint.projectId",
                "Leave empty to use the project ID from the service account key",
              )}
            </p>
          </div>

          <div className="settings-field">
            <label>{t("googleChat.field.webhookPort", "Webhook Port")}</label>
            <input
              type="number"
              className="settings-input"
              placeholder="3979"
              value={webhookPort}
              onChange={(e) => setWebhookPort(e.target.value)}
            />
            <p className="settings-hint">
              {t(
                "googleChat.hint.webhookPort",
                "Local port for receiving Google Chat events (default: 3979)",
              )}
            </p>
          </div>

          <div className="settings-field">
            <label>{t("googleChat.field.webhookPath", "Webhook Path")}</label>
            <input
              type="text"
              className="settings-input"
              placeholder="/googlechat/webhook"
              value={webhookPath}
              onChange={(e) => setWebhookPath(e.target.value)}
            />
            <p className="settings-hint">
              {t(
                "googleChat.hint.webhookPath",
                "URL path for the webhook endpoint",
              )}
            </p>
          </div>

          <div className="settings-field">
            <label>
              {t("googleChat.field.webhookSecret", "Webhook Secret")}
            </label>
            <input
              type="password"
              className="settings-input"
              placeholder={t(
                "googleChat.placeholder.webhookSecret",
                "Shared webhook secret",
              )}
              value={webhookSecret}
              onChange={(e) => setWebhookSecret(e.target.value)}
            />
            <p className="settings-hint">
              {t(
                "googleChat.hint.webhookSecret",
                "Require incoming Google Chat webhook requests to include this shared secret",
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
                  "googleChat.security.pairingHint",
                  "Users must enter a code generated in this app to use the bot",
                )}
              {securityMode === "allowlist" &&
                t(
                  "googleChat.security.allowlistHint",
                  "Only pre-approved Google user IDs can use the bot",
                )}
              {securityMode === "open" &&
                t(
                  "googleChat.security.openHint",
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
                  ✓{" "}
                  {t("channels.connectedAs", "Connected as {name}", {
                    name: testResult.botUsername || "",
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
            disabled={
              saving || !serviceAccountKeyPath.trim() || !webhookSecret.trim()
            }
          >
            {saving
              ? t("channels.adding", "Adding...")
              : t("googleChat.addBot", "Add Google Chat Bot")}
          </button>
        </div>

        <div className="settings-section">
          <h4>{t("googleChat.setup.title", "Setup Instructions")}</h4>
          <ol className="setup-instructions">
            <li>
              {t("googleChat.setup.goTo", "Go to")}{" "}
              <a
                href="https://console.cloud.google.com/apis/library/chat.googleapis.com"
                target="_blank"
                rel="noopener noreferrer"
              >
                Google Cloud Console
              </a>{" "}
              {t(
                "googleChat.setup.enableApi",
                "and enable the Google Chat API",
              )}
            </li>
            <li>
              {t(
                "googleChat.setup.createServiceAccount",
                "Create a service account:",
              )}
              <ul>
                <li>
                  {t("googleChat.setup.goToServiceAccountsPrefix", "Go to")}{" "}
                  <strong>
                    {t(
                      "googleChat.setup.serviceAccounts",
                      "IAM & Admin > Service Accounts",
                    )}
                  </strong>
                </li>
                <li>
                  {t("googleChat.setup.click", "Click")}{" "}
                  <strong>
                    {t(
                      "googleChat.setup.createServiceAccountButton",
                      "Create Service Account",
                    )}
                  </strong>
                </li>
                <li>
                  {t(
                    "googleChat.setup.downloadJsonKey",
                    "Create a JSON key and download it",
                  )}
                </li>
              </ul>
            </li>
            <li>
              {t(
                "googleChat.setup.configureChatApp",
                "Configure the Chat App:",
              )}
              <ul>
                <li>
                  Go to{" "}
                  <a
                    href="https://console.cloud.google.com/apis/api/chat.googleapis.com/hangouts-chat"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Chat API Configuration
                  </a>
                </li>
                <li>
                  {t("googleChat.setup.setAppStatus", "Set")}{" "}
                  <strong>
                    {t("googleChat.setup.appStatus", "App Status")}
                  </strong>{" "}
                  {t("googleChat.setup.toLive", 'to "Live"')}
                </li>
                <li>
                  {t("googleChat.setup.under", "Under")}{" "}
                  <strong>
                    {t(
                      "googleChat.setup.connectionSettings",
                      "Connection settings",
                    )}
                  </strong>
                  ,{" "}
                  {t(
                    "googleChat.setup.selectHttpEndpoint",
                    'select "HTTP endpoint URL"',
                  )}
                </li>
                <li>
                  {t(
                    "googleChat.setup.publicWebhook",
                    "Enter your public webhook URL (use ngrok for testing)",
                  )}
                </li>
              </ul>
            </li>
            <li>
              {t(
                "googleChat.setup.tunnel",
                "Set up ngrok or a tunnel to expose your local webhook:",
              )}
              <ul>
                <li>
                  <code>ngrok http 3979</code>
                </li>
                <li>
                  {t(
                    "googleChat.setup.useHttpsUrl",
                    "Use the HTTPS URL as your webhook endpoint",
                  )}
                </li>
              </ul>
            </li>
            <li>
              {t(
                "googleChat.setup.adminApprove",
                "In Google Admin Console, approve the app for your organization (if using Workspace)",
              )}
            </li>
          </ol>
        </div>

        <div className="settings-section">
          <h4>
            {t("googleChat.permissions.title", "Required APIs & Permissions")}
          </h4>
          <p className="settings-description">
            {t(
              "googleChat.permissions.enableApis",
              "Enable these APIs in Google Cloud Console:",
            )}
          </p>
          <ul className="permissions-list">
            <li>
              <code>Google Chat API</code> -{" "}
              {t(
                "googleChat.permissions.coreMessaging",
                "Core messaging functionality",
              )}
            </li>
            <li>
              <code>Cloud Pub/Sub API</code> -{" "}
              {t("googleChat.permissions.pubsub", "Optional, for Pub/Sub mode")}
            </li>
          </ul>
          <p className="settings-description" style={{ marginTop: "12px" }}>
            {t(
              "googleChat.permissions.rolesIntro",
              "The service account needs these roles:",
            )}
          </p>
          <ul className="permissions-list">
            <li>
              <code>Chat Bots Viewer</code> -{" "}
              {t("googleChat.permissions.readSpaces", "Read chat spaces")}
            </li>
            <li>
              <code>Chat Bots Admin</code> -{" "}
              {t("googleChat.permissions.sendMessages", "Send messages")}
            </li>
          </ul>
        </div>
      </div>
    );
  }

  // Channel is configured
  return (
    <div className="googlechat-settings">
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
              <>
                ✓ {t("channels.connectionSuccessful", "Connection successful")}
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
              "googleChat.pairing.description",
              "Generate a one-time code for a user to enter in Google Chat to gain access.",
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

      {/* Per-Context Security Policies (DM vs Space) */}
      <div className="settings-section">
        <h4>{t("teams.contextPolicies.title", "Context Policies")}</h4>
        <p className="settings-description">
          {t(
            "googleChat.contextPolicies.description",
            "Configure different security settings for direct messages vs spaces.",
          )}
        </p>
        <ContextPolicySettings
          channelId={channel.id}
          channelType="googlechat"
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

      <div className="settings-section">
        <h4>{t("googleChat.howToUse.title", "How to Use")}</h4>
        <div className="commands-list">
          <p className="settings-description">
            {t(
              "googleChat.howToUse.description",
              "Add the bot to a Google Chat space or send a direct message to start a task.",
            )}
          </p>
          <div className="command-item">
            <code>/start</code> -{" "}
            {t("teams.command.start", "Start the bot and get help")}
          </div>
          <div className="command-item">
            <code>/help</code> -{" "}
            {t("teams.command.help", "Show available commands")}
          </div>
          <div className="command-item">
            <code>/workspaces</code> -{" "}
            {t("teams.command.workspaces", "List available workspaces")}
          </div>
          <div className="command-item">
            <code>/workspace</code> -{" "}
            {t("teams.command.workspace", "Select or show current workspace")}
          </div>
          <div className="command-item">
            <code>/newtask</code> -{" "}
            {t("teams.command.newtask", "Start a fresh task/conversation")}
          </div>
          <div className="command-item">
            <code>/status</code> -{" "}
            {t("teams.command.status", "Check bot status")}
          </div>
          <div className="command-item">
            <code>/cancel</code> -{" "}
            {t("teams.command.cancel", "Cancel current task")}
          </div>
          <div className="command-item">
            <code>/pair</code> -{" "}
            {t("teams.command.pair", "Pair with a pairing code")}
          </div>
        </div>
      </div>
    </div>
  );
}
