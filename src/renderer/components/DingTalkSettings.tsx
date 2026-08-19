import { useCallback, useEffect, useState } from "react";
import { RadioTower } from "lucide-react";
import type {
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

interface DingTalkSettingsProps {
  onStatusChange?: (connected: boolean) => void;
}

export function DingTalkSettings({ onStatusChange }: DingTalkSettingsProps) {
  useLanguage();
  const t = translate;
  const [channel, setChannel] = useState<ChannelData | null>(null);
  const [users, setUsers] = useState<ChannelUserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [channelName, setChannelName] = useState(
    translate(
      "generated.components.dingtalksettings.29.0",
      "NeoWorker DingTalk Assistant",
    ),
  );
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [securityMode, setSecurityMode] = useState<SecurityMode>("pairing");
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [pairingExpiresAt, setPairingExpiresAt] = useState(0);
  const [generatingCode, setGeneratingCode] = useState(false);
  const [contextPolicies, setContextPolicies] = useState<
    Record<ContextType, ContextPolicy>
  >({} as Record<ContextType, ContextPolicy>);
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    error?: string;
    botUsername?: string;
  } | null>(null);

  const loadChannel = useCallback(async () => {
    try {
      setLoading(true);
      const channels = await window.electronAPI.getGatewayChannels();
      const existing = channels.find(
        (entry: ChannelData) => entry.type === "dingtalk",
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
      const policyMap = {} as Record<ContextType, ContextPolicy>;
      for (const policy of policies) {
        policyMap[policy.contextType as ContextType] = policy;
      }
      setContextPolicies(policyMap);
    } catch (error) {
      console.error("Failed to load DingTalk channel:", error);
    } finally {
      setLoading(false);
    }
  }, [onStatusChange]);

  useEffect(() => {
    void loadChannel();
  }, [loadChannel]);

  useEffect(() => {
    const unsubscribe = window.electronAPI?.onGatewayUsersUpdated?.((data) => {
      if (data?.channelType !== "dingtalk") return;
      if (channel && data?.channelId && data.channelId !== channel.id) {
        return;
      }
      void loadChannel();
    });
    return () => unsubscribe?.();
  }, [channel, loadChannel]);

  const handleTestAndConnect = async () => {
    if (!clientId.trim() || !clientSecret.trim()) {
      setResult({
        success: false,
        error: translate(
          "generated.components.dingtalksettings.104.1",
          "Please fill in DingTalk Client ID and Client Secret.",
        ),
      });
      return;
    }

    try {
      setSaving(true);
      setResult(null);
      const created = await window.electronAPI.addGatewayChannel({
        type: "dingtalk",
        name:
          channelName.trim() ||
          translate(
            "generated.components.dingtalksettings.114.2",
            "NeoWorker DingTalk Assistant",
          ),
        dingtalkClientId: clientId.trim(),
        dingtalkClientSecret: clientSecret.trim(),
        securityMode,
      });
      setClientId("");
      setClientSecret("");
      setResult({
        success: true,
        botUsername: created?.botUsername || channelName,
      });
      await loadChannel();
    } catch (error: Any) {
      setResult({
        success: false,
        error:
          error?.message ||
          translate(
            "generated.components.dingtalksettings.129.3",
            "DingTalk connection failed",
          ),
      });
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    if (!channel) return;
    try {
      setTesting(true);
      setResult(null);
      setResult(await window.electronAPI.testGatewayChannel(channel.id));
    } catch (error: Any) {
      setResult({
        success: false,
        error:
          error?.message ||
          translate(
            "generated.components.dingtalksettings.145.4",
            "DingTalk connection test failed",
          ),
      });
    } finally {
      setTesting(false);
    }
  };

  const handleToggleEnabled = async () => {
    if (!channel) return;
    try {
      setSaving(true);
      setResult(null);
      if (channel.enabled) {
        await window.electronAPI.disableGatewayChannel(channel.id);
      } else {
        await window.electronAPI.enableGatewayChannel(channel.id);
      }
      await loadChannel();
    } catch (error: Any) {
      setResult({ success: false, error: error?.message });
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    if (!channel) return;
    if (
      !confirm(
        translate(
          "generated.components.dingtalksettings.172.5",
          "Are you sure you want to delete the DingTalk channel configuration?",
        ),
      )
    )
      return;
    try {
      setSaving(true);
      await window.electronAPI.removeGatewayChannel(channel.id);
      setChannel(null);
      setUsers([]);
      setResult(null);
      onStatusChange?.(false);
    } catch (error: Any) {
      setResult({ success: false, error: error?.message });
    } finally {
      setSaving(false);
    }
  };

  const handleSecurityMode = async (mode: SecurityMode) => {
    if (!channel) return;
    try {
      await window.electronAPI.updateGatewayChannel({
        id: channel.id,
        securityMode: mode,
      });
      setSecurityMode(mode);
      setChannel({ ...channel, securityMode: mode });
    } catch (error) {
      console.error("Failed to update DingTalk security mode:", error);
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
      setContextPolicies((current) => ({
        ...current,
        [contextType]: updated,
      }));
    } finally {
      setSavingPolicy(false);
    }
  };

  const handleRevoke = async (userId: string) => {
    if (!channel) return;
    await window.electronAPI.revokeGatewayAccess(channel.id, userId);
    await loadChannel();
  };

  const resultView = result ? (
    <div className={`settings-status ${result.success ? "success" : "error"}`}>
      {result.success
        ? translate(
            "channels.dingtalk.connected",
            "DingTalk Stream connected{account}",
            { account: result.botUsername ? `: ${result.botUsername}` : "" },
          )
        : result.error}
    </div>
  ) : null;

  if (loading) {
    return (
      <div className="settings-loading">
        {translate(
          "generated.components.dingtalksettings.257.6",
          "Loading DingTalk configuration...",
        )}
      </div>
    );
  }

  if (!channel) {
    return (
      <div className="googlechat-settings guided-channel-host">
        <GuidedChannelSetup
          accent="#1677ff"
          brand={t("dingtalk.guided.brand", "DingTalk")}
          brandIcon={<RadioTower size={18} />}
          title={t("dingtalk.guided.title", "Connect NeoWorker to DingTalk")}
          description={t(
            "dingtalk.guided.description",
            "DingTalk Stream connects directly from this computer. You do not need a public callback address.",
          )}
          steps={[
            {
              title: t(
                "dingtalk.guided.step.create",
                "Create an internal application",
              ),
              description: t(
                "dingtalk.guided.step.createDescription",
                "Create an app in DingTalk Open Platform and add the Bot capability.",
              ),
            },
            {
              title: t("dingtalk.guided.step.stream", "Choose Stream mode"),
              description: t(
                "dingtalk.guided.step.streamDescription",
                "Enable Stream mode in the bot's message receiving settings.",
              ),
            },
            {
              title: t("dingtalk.guided.step.connect", "Paste two credentials"),
              description: t(
                "dingtalk.guided.step.connectDescription",
                "NeoWorker verifies the credentials and opens the connection for you.",
              ),
            },
          ]}
          portalLabel={t(
            "dingtalk.guided.openPortal",
            "Open DingTalk Open Platform",
          )}
          onOpenPortal={() =>
            window.electronAPI.openExternal("https://open-dev.dingtalk.com/")
          }
          formTitle={t("dingtalk.guided.formTitle", "Paste two credentials")}
          formDescription={t(
            "dingtalk.guided.formDescription",
            "Both values are available on the application's credentials page.",
          )}
          securityMode={securityMode}
          onSecurityModeChange={setSecurityMode}
          advanced={
            <div className="settings-field guided-channel-field-full">
              <label>{t("channels.botName", "Bot name")}</label>
              <input
                className="settings-input"
                value={channelName}
                onChange={(event) => setChannelName(event.target.value)}
              />
            </div>
          }
          submitLabel={t("dingtalk.guided.connect", "Verify and connect")}
          busyLabel={t("dingtalk.guided.connecting", "Verifying...")}
          onSubmit={handleTestAndConnect}
          submitting={saving}
          disabled={!clientId.trim() || !clientSecret.trim()}
          footerNote={t(
            "dingtalk.guided.footerNote",
            "No public URL, server port or webhook setup is required.",
          )}
          result={
            result
              ? {
                  success: result.success,
                  message: result.success
                    ? t(
                        "dingtalk.guided.success",
                        "DingTalk Stream is connected",
                      )
                    : result.error,
                }
              : null
          }
        >
          <div className="settings-field">
            <label>Client ID *</label>
            <input
              className="settings-input"
              value={clientId}
              placeholder="dingxxxxxxxxxx"
              autoComplete="off"
              onChange={(event) => setClientId(event.target.value)}
            />
            <p className="settings-hint">
              {t(
                "dingtalk.guided.clientIdHint",
                "Also called AppKey on some DingTalk pages",
              )}
            </p>
          </div>
          <div className="settings-field">
            <label>Client Secret *</label>
            <input
              type="password"
              className="settings-input"
              value={clientSecret}
              autoComplete="new-password"
              placeholder={t(
                "dingtalk.guided.clientSecretPlaceholder",
                "Paste Client Secret",
              )}
              onChange={(event) => setClientSecret(event.target.value)}
            />
          </div>
        </GuidedChannelSetup>
      </div>
    );
  }

  return (
    <div className="googlechat-settings">
      <div className="settings-section">
        <h3>
          {translate(
            "generated.components.dingtalksettings.374.7",
            "DingTalk channel",
          )}
        </h3>
        <div className="settings-status-row">
          <span className={`settings-badge status-${channel.status}`}>
            {channel.status === "connected"
              ? translate(
                  "generated.components.dingtalksettings.378.8",
                  "Connected",
                )
              : channel.status === "connecting"
                ? translate(
                    "generated.components.dingtalksettings.380.9",
                    "Connecting",
                  )
                : channel.status === "error"
                  ? translate(
                      "generated.components.dingtalksettings.382.10",
                      "Connection error",
                    )
                  : translate(
                      "generated.components.dingtalksettings.383.11",
                      "Not connected",
                    )}
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
              ? translate(
                  "generated.components.dingtalksettings.393.12",
                  "Testing...",
                )
              : translate(
                  "generated.components.dingtalksettings.393.13",
                  "test connection",
                )}
          </button>
          <button
            className="settings-button"
            onClick={handleToggleEnabled}
            disabled={saving}
          >
            {channel.enabled
              ? translate(
                  "generated.components.dingtalksettings.400.14",
                  "deactivate",
                )
              : translate(
                  "generated.components.dingtalksettings.400.15",
                  "enable",
                )}
          </button>
          <button
            className="settings-button settings-button-danger"
            onClick={handleRemove}
            disabled={saving}
          >
            {translate(
              "generated.components.dingtalksettings.407.16",
              "Delete configuration",
            )}
          </button>
        </div>
        {resultView}
      </div>

      <div className="settings-section">
        <h3>
          {translate(
            "generated.components.dingtalksettings.414.17",
            "access control",
          )}
        </h3>
        <div className="settings-field">
          <label>
            {translate(
              "generated.components.dingtalksettings.416.18",
              "safe mode",
            )}
          </label>
          <select
            className="settings-select"
            value={securityMode}
            onChange={(event) =>
              void handleSecurityMode(event.target.value as SecurityMode)
            }
          >
            <option value="pairing">
              {translate(
                "generated.components.dingtalksettings.424.19",
                "Pairing code required (recommended)",
              )}
            </option>
            <option value="allowlist">
              {translate(
                "generated.components.dingtalksettings.425.20",
                "allow list only",
              )}
            </option>
            <option value="open">
              {translate(
                "generated.components.dingtalksettings.426.21",
                "Available to everyone",
              )}
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
                ? translate(
                    "generated.components.dingtalksettings.436.22",
                    "Generating...",
                  )
                : translate(
                    "generated.components.dingtalksettings.436.23",
                    "Generate pairing code",
                  )}
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
        <h3>
          {translate(
            "generated.components.dingtalksettings.451.24",
            "session policy",
          )}
        </h3>
        <ContextPolicySettings
          channelId={channel.id}
          channelType="dingtalk"
          policies={{
            dm: contextPolicies.dm,
            group: contextPolicies.group,
          }}
          onPolicyChange={handlePolicyChange}
          isSaving={savingPolicy}
        />
      </div>

      <div className="settings-section">
        <h3>
          {translate(
            "generated.components.dingtalksettings.465.25",
            "Authorized user",
          )}
        </h3>
        {users.length === 0 ? (
          <p className="settings-description">
            {translate(
              "generated.components.dingtalksettings.468.26",
              "There are currently no authorized users. When pairing is enabled, users gain access via a pairing code.",
            )}
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
                  onClick={() => void handleRevoke(user.channelUserId)}
                >
                  {translate(
                    "generated.components.dingtalksettings.486.27",
                    "Cancel",
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
