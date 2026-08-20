import { useCallback, useEffect, useState } from "react";
import { Building2, Copy, RefreshCw } from "lucide-react";
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

interface WeComSettingsProps {
  onStatusChange?: (connected: boolean) => void;
}

function createCallbackToken(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

export function WeComSettings({ onStatusChange }: WeComSettingsProps) {
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
  const [channelName, setChannelName] = useState("WeCom Bot");
  const [corpId, setCorpId] = useState("");
  const [agentId, setAgentId] = useState("");
  const [secret, setSecret] = useState("");
  const [token, setToken] = useState(createCallbackToken);
  const [tokenCopied, setTokenCopied] = useState(false);
  const [encodingAESKey, setEncodingAESKey] = useState("");
  const [webhookPort, setWebhookPort] = useState("3981");
  const [webhookPath, setWebhookPath] = useState("/wecom/webhook");
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
        (entry: ChannelData) => entry.type === "wecom",
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
      console.error("Failed to load WeCom channel:", error);
    } finally {
      setLoading(false);
    }
  }, [onStatusChange]);

  useEffect(() => {
    loadChannel();
  }, [loadChannel]);

  useEffect(() => {
    const unsubscribe = window.electronAPI?.onGatewayUsersUpdated?.((data) => {
      if (data?.channelType !== "wecom") return;
      if (channel && data?.channelId && data.channelId !== channel.id) return;
      loadChannel();
    });
    return () => unsubscribe?.();
  }, [channel?.id, loadChannel]);

  const handleAddChannel = async () => {
    if (!corpId.trim() || !agentId.trim() || !secret.trim() || !token.trim()) {
      setTestResult({
        success: false,
        error: t(
          "wecom.guided.requiredError",
          "Enter the Corp ID, Agent ID and Secret before connecting.",
        ),
      });
      return;
    }
    try {
      setSaving(true);
      setTestResult(null);
      await window.electronAPI.addGatewayChannel({
        type: "wecom",
        name: channelName,
        wecomCorpId: corpId.trim(),
        wecomAgentId: parseInt(agentId, 10),
        wecomSecret: secret.trim(),
        wecomToken: token.trim(),
        wecomEncodingAESKey: encodingAESKey.trim() || undefined,
        webhookPort: parseInt(webhookPort, 10) || 3981,
        webhookPath: webhookPath.trim() || "/wecom/webhook",
        securityMode,
      });
      setCorpId("");
      setAgentId("");
      setSecret("");
      setToken(createCallbackToken());
      setEncodingAESKey("");
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
          "wecom.confirm.remove",
          "Are you sure you want to remove the WeCom channel?",
        ),
      )
    )
      return;
    try {
      setSaving(true);
      await window.electronAPI.removeGatewayChannel(channel.id);
      setChannel(null);
      setUsers([]);
      setToken(createCallbackToken());
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
      console.error("Failed to update WeCom security mode:", error);
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
      console.error("Failed to generate WeCom pairing code:", error);
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
      console.error("Failed to update WeCom context policy:", error);
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
      console.error("Failed to revoke WeCom access:", error);
    }
  };

  const handleCopyToken = async () => {
    await navigator.clipboard.writeText(token);
    setTokenCopied(true);
    window.setTimeout(() => setTokenCopied(false), 1600);
  };

  if (loading) {
    return (
      <div className="settings-loading">
        {t("wecom.loading", "Loading WeCom settings...")}
      </div>
    );
  }

  if (!channel) {
    return (
      <div className="teams-settings guided-channel-host">
        <GuidedChannelSetup
          accent="#2778e6"
          brand={t("wecom.guided.brand", "WeCom")}
          brandIcon={<Building2 size={18} />}
          title={t("wecom.guided.title", "Bring NeoWorker into WeCom")}
          description={t(
            "wecom.guided.description",
            "Copy the application details from WeCom Admin. NeoWorker prepares the callback token for you.",
          )}
          steps={[
            {
              title: t(
                "wecom.guided.step.create",
                "Create an internal application",
              ),
              description: t(
                "wecom.guided.step.createDescription",
                "Open App Management and create an internal application.",
              ),
            },
            {
              title: t(
                "wecom.guided.step.credentials",
                "Copy the application details",
              ),
              description: t(
                "wecom.guided.step.credentialsDescription",
                "Find the Corp ID, Agent ID and Secret in the admin console.",
              ),
            },
            {
              title: t(
                "wecom.guided.step.callback",
                "Finish the callback setup",
              ),
              description: t(
                "wecom.guided.step.callbackDescription",
                "Paste the generated Token into the application's message callback settings.",
              ),
            },
          ]}
          portalLabel={t("wecom.guided.openPortal", "Open WeCom Admin")}
          onOpenPortal={() =>
            window.electronAPI.openExternal(
              "https://work.weixin.qq.com/wework_admin/frame#apps",
            )
          }
          formTitle={t(
            "wecom.guided.formTitle",
            "Paste the application details",
          )}
          formDescription={t(
            "wecom.guided.formDescription",
            "These values are shown in the application's details page. NeoWorker will verify them when connecting.",
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
                    "wecom.field.encodingAesKeyOptional",
                    "Encoding AES Key (optional)",
                  )}
                </label>
                <input
                  className="settings-input"
                  value={encodingAESKey}
                  onChange={(event) => setEncodingAESKey(event.target.value)}
                />
                <p className="settings-hint">
                  {t(
                    "wecom.hint.encodingAesKey",
                    "Use the 43-character callback key if encrypted callbacks are enabled.",
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
              <div className="settings-field">
                <label>{t("channels.webhookPath", "Webhook path")}</label>
                <input
                  className="settings-input"
                  value={webhookPath}
                  onChange={(event) => setWebhookPath(event.target.value)}
                />
              </div>
            </>
          }
          submitLabel={t("wecom.guided.connect", "Verify and connect")}
          busyLabel={t("wecom.guided.connecting", "Verifying...")}
          onSubmit={handleAddChannel}
          submitting={saving}
          disabled={!corpId.trim() || !agentId.trim() || !secret.trim()}
          footerNote={t(
            "wecom.guided.footerNote",
            "The default access mode protects new contacts with a pairing code.",
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
            <label>{t("wecom.field.corpId", "Corp ID")} *</label>
            <input
              className="settings-input"
              value={corpId}
              placeholder={t(
                "wecom.guided.corpIdPlaceholder",
                "Example: ww1234567890",
              )}
              onChange={(event) => setCorpId(event.target.value)}
            />
            <p className="settings-hint">
              {t(
                "wecom.guided.corpIdHint",
                "WeCom Admin > My Enterprise > Enterprise Information",
              )}
            </p>
          </div>
          <div className="settings-field">
            <label>{t("wecom.field.agentId", "Agent ID")} *</label>
            <input
              inputMode="numeric"
              className="settings-input"
              value={agentId}
              placeholder={t(
                "wecom.guided.agentIdPlaceholder",
                "A numeric Agent ID",
              )}
              onChange={(event) => setAgentId(event.target.value)}
            />
            <p className="settings-hint">
              {t(
                "wecom.guided.agentIdHint",
                "Shown on the application's details page",
              )}
            </p>
          </div>
          <div className="settings-field full-width">
            <label>{t("wecom.field.secret", "Secret")} *</label>
            <input
              type="password"
              className="settings-input"
              value={secret}
              autoComplete="new-password"
              placeholder={t(
                "wecom.guided.secretPlaceholder",
                "Paste the application Secret",
              )}
              onChange={(event) => setSecret(event.target.value)}
            />
          </div>
          <div className="settings-field full-width">
            <label>{t("wecom.guided.callbackToken", "Callback Token")}</label>
            <div className="guided-channel-inline-control">
              <input className="settings-input" value={token} readOnly />
              <button type="button" onClick={handleCopyToken}>
                <Copy size={14} />
                {tokenCopied
                  ? t("channels.guided.copied", "Copied")
                  : t("channels.guided.copy", "Copy")}
              </button>
              <button
                type="button"
                onClick={() => setToken(createCallbackToken())}
              >
                <RefreshCw size={14} />
                {t("channels.guided.regenerate", "Regenerate")}
              </button>
            </div>
            <p className="settings-hint">
              {t(
                "wecom.guided.callbackTokenHint",
                "NeoWorker generated this value. Paste the same Token into WeCom callback settings.",
              )}
            </p>
          </div>
        </GuidedChannelSetup>
      </div>
    );
  }

  return (
    <div className="teams-settings">
      <div className="settings-section">
        <h3>{t("wecom.channel.title", "WeCom Channel")}</h3>
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
          channelType="wecom"
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
