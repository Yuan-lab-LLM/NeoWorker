import { useCallback, useEffect, useState } from "react";
import { Bot } from "lucide-react";
import {
  ChannelData,
  ChannelUserData,
  ContextPolicy,
  ContextType,
  SecurityMode,
} from "../../shared/types";
import { ContextPolicySettings } from "./ContextPolicySettings";
import { PairingCodeDisplay } from "./PairingCodeDisplay";
import { GuidedChannelSetup } from "./GuidedChannelSetup";
import { translate, useLanguage } from "../i18n";

interface FeishuSettingsProps {
  onStatusChange?: (connected: boolean) => void;
}

export function FeishuSettings({ onStatusChange }: FeishuSettingsProps) {
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
  const [channelName, setChannelName] = useState("Feishu / Lark Bot");
  const [appId, setAppId] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [verificationToken, setVerificationToken] = useState("");
  const [encryptKey, setEncryptKey] = useState("");
  const [webhookPort, setWebhookPort] = useState("3980");
  const [webhookPath, setWebhookPath] = useState("/feishu/webhook");
  const [securityMode, setSecurityMode] = useState<SecurityMode>("pairing");
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [pairingExpiresAt, setPairingExpiresAt] = useState<number>(0);
  const [generatingCode, setGeneratingCode] = useState(false);
  const [contextPolicies, setContextPolicies] = useState<
    Record<ContextType, ContextPolicy>
  >({} as Record<ContextType, ContextPolicy>);
  const [savingPolicy, setSavingPolicy] = useState(false);

  const loadChannel = useCallback(async () => {
    try {
      setLoading(true);
      const channels = await window.electronAPI.getGatewayChannels();
      const existing = channels.find(
        (entry: ChannelData) => entry.type === "feishu",
      );
      if (!existing) {
        setChannel(null);
        setUsers([]);
        onStatusChange?.(false);
        return;
      }

      setChannel(existing);
      setChannelName(existing.name);
      setSecurityMode(existing.securityMode);
      onStatusChange?.(existing.status === "connected");

      const [channelUsers, policies] = await Promise.all([
        window.electronAPI.getGatewayUsers(existing.id),
        window.electronAPI.listContextPolicies(existing.id),
      ]);
      setUsers(channelUsers);

      const policyMap: Record<ContextType, ContextPolicy> = {} as Record<
        ContextType,
        ContextPolicy
      >;
      for (const policy of policies) {
        policyMap[policy.contextType as ContextType] = policy;
      }
      setContextPolicies(policyMap);
    } catch (error) {
      console.error("Failed to load Feishu channel:", error);
    } finally {
      setLoading(false);
    }
  }, [onStatusChange]);

  useEffect(() => {
    loadChannel();
  }, [loadChannel]);

  useEffect(() => {
    const unsubscribe = window.electronAPI?.onGatewayUsersUpdated?.((data) => {
      if (data?.channelType !== "feishu") return;
      if (channel && data?.channelId && data.channelId !== channel.id) return;
      loadChannel();
    });
    return () => unsubscribe?.();
  }, [channel?.id, loadChannel]);

  const handleAddChannel = async () => {
    if (!appId.trim() || !appSecret.trim()) {
      setTestResult({
        success: false,
        error: t(
          "feishu.guided.requiredError",
          "Enter the App ID and App Secret before connecting.",
        ),
      });
      return;
    }
    try {
      setSaving(true);
      setTestResult(null);
      await window.electronAPI.addGatewayChannel({
        type: "feishu",
        name: channelName,
        feishuAppId: appId.trim(),
        feishuAppSecret: appSecret.trim(),
        feishuVerificationToken: verificationToken.trim() || undefined,
        feishuEncryptKey: encryptKey.trim() || undefined,
        webhookPort: parseInt(webhookPort, 10) || 3980,
        webhookPath: webhookPath.trim() || "/feishu/webhook",
        securityMode,
      });
      setAppId("");
      setAppSecret("");
      setVerificationToken("");
      setEncryptKey("");
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
          "feishu.confirm.remove",
          "Are you sure you want to remove the Feishu / Lark channel?",
        ),
      )
    )
      return;
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
    } catch (error) {
      console.error("Failed to update Feishu security mode:", error);
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
      setPairingExpiresAt(Date.now() + 5 * 60 * 1000);
    } catch (error) {
      console.error("Failed to generate Feishu pairing code:", error);
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
      setContextPolicies((prev) => ({ ...prev, [contextType]: updated }));
    } catch (error) {
      console.error("Failed to update Feishu context policy:", error);
    } finally {
      setSavingPolicy(false);
    }
  };

  const handleRevokeAccess = async (userId: string) => {
    if (!channel) return;
    try {
      await window.electronAPI.revokeGatewayAccess(channel.id, userId);
      await loadChannel();
    } catch (error) {
      console.error("Failed to revoke Feishu access:", error);
    }
  };

  if (loading) {
    return (
      <div className="settings-loading">
        {t("feishu.loading", "Loading Feishu / Lark settings...")}
      </div>
    );
  }

  if (!channel) {
    return (
      <div className="googlechat-settings guided-channel-host">
        <GuidedChannelSetup
          accent="#3370ff"
          brand={t("feishu.guided.brand", "Feishu / Lark")}
          brandIcon={<Bot size={19} />}
          title={t("feishu.guided.title", "Bring NeoWorker into Feishu")}
          description={t(
            "feishu.guided.description",
            "Start with the two application credentials. Callback security and local server settings stay out of the way unless you need them.",
          )}
          steps={[
            {
              title: t(
                "feishu.guided.step.create",
                "Create an internal application",
              ),
              description: t(
                "feishu.guided.step.createDescription",
                "Create an enterprise self-built app in Feishu Open Platform.",
              ),
            },
            {
              title: t("feishu.guided.step.bot", "Enable the Bot capability"),
              description: t(
                "feishu.guided.step.botDescription",
                "Add the Bot capability and subscribe to message events.",
              ),
            },
            {
              title: t(
                "feishu.guided.step.credentials",
                "Copy the credentials",
              ),
              description: t(
                "feishu.guided.step.credentialsDescription",
                "Find App ID and App Secret under Credentials and Basic Info.",
              ),
            },
          ]}
          portalLabel={t(
            "feishu.guided.openPortal",
            "Open Feishu Open Platform",
          )}
          onOpenPortal={() =>
            window.electronAPI.openExternal(
              "https://open.feishu.cn/app?lang=zh-CN",
            )
          }
          formTitle={t(
            "feishu.guided.formTitle",
            "Paste two application credentials",
          )}
          formDescription={t(
            "feishu.guided.formDescription",
            "NeoWorker uses these values to verify the application and send replies.",
          )}
          securityMode={securityMode}
          onSecurityModeChange={setSecurityMode}
          advanced={
            <>
              <div className="settings-field">
                <label>{t("channels.botName", "Bot name")}</label>
                <input
                  className="settings-input"
                  value={channelName}
                  onChange={(event) => setChannelName(event.target.value)}
                />
              </div>
              <div className="settings-field">
                <label>
                  {t(
                    "feishu.field.verificationTokenOptional",
                    "Verification Token (optional)",
                  )}
                </label>
                <input
                  className="settings-input"
                  value={verificationToken}
                  onChange={(event) => setVerificationToken(event.target.value)}
                />
              </div>
              <div className="settings-field">
                <label>
                  {t(
                    "feishu.field.encryptKeyOptional",
                    "Encrypt Key (optional)",
                  )}
                </label>
                <input
                  type="password"
                  className="settings-input"
                  value={encryptKey}
                  onChange={(event) => setEncryptKey(event.target.value)}
                />
                <p className="settings-hint">
                  {t(
                    "feishu.hint.encryptKey",
                    "If set, NeoWorker validates Feishu signatures and decrypts callback bodies.",
                  )}
                </p>
              </div>
              <div className="settings-field">
                <label>{t("channels.webhookPort", "Webhook port")}</label>
                <input
                  type="number"
                  className="settings-input"
                  value={webhookPort}
                  onChange={(event) => setWebhookPort(event.target.value)}
                />
              </div>
              <div className="settings-field guided-channel-field-full">
                <label>{t("channels.webhookPath", "Webhook path")}</label>
                <input
                  className="settings-input"
                  value={webhookPath}
                  onChange={(event) => setWebhookPath(event.target.value)}
                />
              </div>
            </>
          }
          submitLabel={t("feishu.guided.connect", "Verify and connect")}
          busyLabel={t("feishu.guided.connecting", "Verifying...")}
          onSubmit={handleAddChannel}
          submitting={saving}
          disabled={!appId.trim() || !appSecret.trim()}
          footerNote={t(
            "feishu.guided.footerNote",
            "After connecting, finish the event callback address in Feishu Open Platform.",
          )}
          result={
            testResult
              ? {
                  success: testResult.success,
                  message: testResult.success
                    ? t(
                        "channels.connectionSuccessfulPlain",
                        "Connection successful",
                      )
                    : testResult.error,
                }
              : null
          }
        >
          <div className="settings-field">
            <label>{t("feishu.field.appId", "App ID")} *</label>
            <input
              className="settings-input"
              value={appId}
              placeholder="cli_xxxxxxxxxxxxxxxx"
              autoComplete="off"
              onChange={(event) => setAppId(event.target.value)}
            />
            <p className="settings-hint">
              {t(
                "feishu.guided.appIdHint",
                "Credentials and Basic Info > App ID",
              )}
            </p>
          </div>
          <div className="settings-field">
            <label>{t("feishu.field.appSecret", "App Secret")} *</label>
            <input
              type="password"
              className="settings-input"
              value={appSecret}
              autoComplete="new-password"
              placeholder={t(
                "feishu.guided.secretPlaceholder",
                "Paste App Secret",
              )}
              onChange={(event) => setAppSecret(event.target.value)}
            />
          </div>
        </GuidedChannelSetup>
      </div>
    );
  }

  return (
    <div className="googlechat-settings">
      <div className="settings-section">
        <h3>{t("feishu.channel.title", "Feishu / Lark Channel")}</h3>
        <div className="settings-status-row">
          <span className={`settings-badge status-${channel.status}`}>
            {t(`channels.status.${channel.status}`, channel.status)}
          </span>
          <span className="settings-muted">{channel.name}</span>
        </div>
        <div className="settings-actions">
          <button
            className="settings-button"
            onClick={handleTestConnection}
            disabled={testing}
          >
            {testing
              ? t("channels.testing", "Testing...")
              : t("channels.testConnection", "Test connection")}
          </button>
          <button
            className="settings-button"
            onClick={handleToggleEnabled}
            disabled={saving}
          >
            {channel.enabled
              ? t("channels.disable", "Disable")
              : t("channels.enable", "Enable")}
          </button>
          <button
            className="settings-button settings-button-danger"
            onClick={handleRemoveChannel}
            disabled={saving}
          >
            {t("channels.remove", "Remove")}
          </button>
        </div>
        {testResult && (
          <div
            className={`settings-status ${testResult.success ? "success" : "error"}`}
          >
            {testResult.success
              ? t("channels.connectedAs", "Connected as {name}").replace(
                  "{name}",
                  testResult.botUsername || "bot",
                )
              : testResult.error}
          </div>
        )}
      </div>

      <div className="settings-section">
        <h3>{t("channels.accessControl", "Access Control")}</h3>
        <div className="settings-field">
          <label>{t("channels.securityMode", "Security Mode")}</label>
          <select
            className="settings-select"
            value={securityMode}
            onChange={(e) =>
              handleUpdateSecurityMode(e.target.value as SecurityMode)
            }
          >
            <option value="pairing">
              {t(
                "channels.security.pairingRequiredShort",
                "Pairing code required",
              )}
            </option>
            <option value="allowlist">
              {t("channels.security.allowlistOnly", "Allowlist only")}
            </option>
            <option value="open">
              {t("channels.security.openAccess", "Open access")}
            </option>
          </select>
        </div>

        {securityMode === "pairing" && (
          <div className="settings-field">
            <button
              className="settings-button"
              onClick={handleGeneratePairingCode}
              disabled={generatingCode}
            >
              {generatingCode
                ? t("channels.pairing.generating", "Generating...")
                : t("channels.pairing.generateTitle", "Generate pairing code")}
            </button>
            {pairingCode && (
              <PairingCodeDisplay
                code={pairingCode}
                expiresAt={pairingExpiresAt}
                onRegenerate={handleGeneratePairingCode}
                isRegenerating={generatingCode}
              />
            )}
          </div>
        )}
      </div>

      <div className="settings-section">
        <h3>{t("channels.contextPolicies", "Context Policies")}</h3>
        <ContextPolicySettings
          channelId={channel.id}
          channelType="feishu"
          policies={{
            dm: contextPolicies.dm,
            group: contextPolicies.group,
          }}
          onPolicyChange={handlePolicyChange}
          isSaving={savingPolicy}
        />
      </div>

      <div className="settings-section">
        <h3>{t("channels.authorizedUsers", "Authorized Users")}</h3>
        {users.length === 0 ? (
          <p className="settings-description">
            {t("channels.noPairedUsers", "No paired users yet.")}
          </p>
        ) : (
          <div className="settings-list">
            {users.map((user) => (
              <div key={user.id} className="settings-list-item">
                <div>
                  <strong>{user.displayName || user.channelUserId}</strong>
                  <div className="settings-hint">{user.channelUserId}</div>
                </div>
                <button
                  className="settings-button settings-button-danger"
                  onClick={() => handleRevokeAccess(user.channelUserId)}
                >
                  {t("channels.revoke", "Revoke")}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
