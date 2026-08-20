import { useEffect, useMemo, useState } from "react";
import type {
  PermissionMode,
  PermissionRule,
  PermissionRuleScope,
  PermissionSettingsData,
  PersistedPermissionRule,
} from "../../shared/types";
import type { BuiltinToolsSettings as BuiltinToolsSettingsData } from "../../electron/agent/tools/builtin-settings";
import { translate, useLanguage } from "../i18n";

type RuleDraft = {
  effect: "allow" | "deny" | "ask";
  scopeKind: PermissionRuleScope["kind"];
  toolName: string;
  domain: string;
  path: string;
  prefix: string;
  serverName: string;
};

type ApprovalExperiencePreset = "standard" | "fewer_prompts" | "custom";

const DEFAULT_SETTINGS: PermissionSettingsData = {
  version: 1,
  defaultMode: "dangerous_only",
  defaultShellEnabled: false,
  defaultPermissionAccess: "default",
  rules: [],
};

const DEFAULT_RULE_DRAFT: RuleDraft = {
  effect: "allow",
  scopeKind: "tool",
  toolName: "run_command",
  domain: "",
  path: "",
  prefix: "",
  serverName: "",
};

interface PermissionSettingsPanelProps {
  workspaceId?: string;
}

export function scopeToLabel(scope: PermissionRuleScope): string {
  switch (scope.kind) {
    case "tool":
      return translate("permissions.scope.tool", "Tool: {tool}", {
        tool: scope.toolName,
      });
    case "domain":
      if (scope.toolName) {
        return translate(
          "permissions.scope.domainTool",
          "Domain: {domain} ({tool})",
          {
            domain: scope.domain,
            tool: scope.toolName,
          },
        );
      }
      if (scope.toolPrefix) {
        return translate(
          "permissions.scope.domainPrefix",
          "Domain: {domain} ({prefix}*)",
          {
            domain: scope.domain,
            prefix: scope.toolPrefix,
          },
        );
      }
      return translate("permissions.scope.domain", "Domain: {domain}", {
        domain: scope.domain,
      });
    case "path":
      return scope.toolName
        ? translate("permissions.scope.pathTool", "Path: {path} ({tool})", {
            path: scope.path,
            tool: scope.toolName,
          })
        : translate("permissions.scope.path", "Path: {path}", {
            path: scope.path,
          });
    case "command_prefix":
      return translate(
        "permissions.scope.commandPrefix",
        "Command prefix: {prefix}",
        {
          prefix: scope.prefix,
        },
      );
    case "mcp_server":
      return translate("permissions.scope.mcpServer", "MCP server: {server}", {
        server: scope.serverName,
      });
  }
  const exhaustiveCheck: never = scope;
  return exhaustiveCheck;
}

export function buildScope(draft: RuleDraft): PermissionRuleScope {
  switch (draft.scopeKind) {
    case "domain":
      return {
        kind: "domain",
        domain: draft.domain.trim(),
        ...(draft.toolName.trim() ? { toolName: draft.toolName.trim() } : {}),
      };
    case "path":
      return {
        kind: "path",
        path: draft.path.trim(),
        ...(draft.toolName.trim() ? { toolName: draft.toolName.trim() } : {}),
      };
    case "command_prefix":
      return { kind: "command_prefix", prefix: draft.prefix.trim() };
    case "mcp_server":
      return { kind: "mcp_server", serverName: draft.serverName.trim() };
    case "tool":
    default:
      return { kind: "tool", toolName: draft.toolName.trim() };
  }
}

export function applyFewerApprovalPromptsPreset<
  T extends BuiltinToolsSettingsData,
>(
  permissionSettings: PermissionSettingsData,
  builtinSettings: T,
): {
  permissionSettings: PermissionSettingsData;
  builtinSettings: T;
} {
  return {
    permissionSettings: {
      ...DEFAULT_SETTINGS,
      ...permissionSettings,
      defaultMode: "dangerous_only",
    },
    builtinSettings: {
      ...builtinSettings,
      runCommandApprovalMode: "single_bundle",
    },
  };
}

export function applyStandardApprovalPromptsPreset<
  T extends BuiltinToolsSettingsData,
>(
  permissionSettings: PermissionSettingsData,
  builtinSettings: T,
): {
  permissionSettings: PermissionSettingsData;
  builtinSettings: T;
} {
  return {
    permissionSettings: {
      ...DEFAULT_SETTINGS,
      ...permissionSettings,
      defaultMode: "default",
    },
    builtinSettings: {
      ...builtinSettings,
      runCommandApprovalMode: "per_command",
    },
  };
}

export function detectApprovalExperiencePreset(
  permissionSettings: PermissionSettingsData,
  builtinSettings: Pick<BuiltinToolsSettingsData, "runCommandApprovalMode">,
): ApprovalExperiencePreset {
  if (
    permissionSettings.defaultMode === "dangerous_only" &&
    builtinSettings.runCommandApprovalMode === "single_bundle"
  ) {
    return "fewer_prompts";
  }
  if (
    permissionSettings.defaultMode === "default" &&
    builtinSettings.runCommandApprovalMode === "per_command"
  ) {
    return "standard";
  }
  return "custom";
}

export function PermissionSettingsPanel({
  workspaceId,
}: PermissionSettingsPanelProps) {
  useLanguage();
  const t = translate;
  const [settings, setSettings] =
    useState<PermissionSettingsData>(DEFAULT_SETTINGS);
  const [builtinSettings, setBuiltinSettings] =
    useState<BuiltinToolsSettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [ruleDraft, setRuleDraft] = useState<RuleDraft>(DEFAULT_RULE_DRAFT);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [workspaceRules, setWorkspaceRules] = useState<
    PersistedPermissionRule[]
  >([]);
  const [workspaceRulesLoading, setWorkspaceRulesLoading] = useState(false);
  const [deletingRuleId, setDeletingRuleId] = useState<string | null>(null);

  useEffect(() => {
    void loadSettings();
  }, []);

  useEffect(() => {
    void loadBuiltinSettings();
  }, []);

  useEffect(() => {
    void loadWorkspaceRules(workspaceId);
  }, [workspaceId]);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const loaded = await window.electronAPI.getPermissionSettings();
      setSettings(loaded || DEFAULT_SETTINGS);
    } catch (error) {
      console.error("Failed to load permission settings:", error);
      setSettings(DEFAULT_SETTINGS);
    } finally {
      setLoading(false);
    }
  };

  const loadBuiltinSettings = async () => {
    try {
      const loaded = await window.electronAPI.getBuiltinToolsSettings();
      setBuiltinSettings(loaded);
    } catch (error) {
      console.error("Failed to load built-in tools settings:", error);
      setBuiltinSettings(null);
    }
  };

  const saveSettings = async (next: PermissionSettingsData) => {
    try {
      setSaving(true);
      await window.electronAPI.savePermissionSettings(next);
      setSettings(next);
      window.dispatchEvent(
        new CustomEvent("neoworker:permission-settings-updated", {
          detail: next,
        }),
      );
      setStatusMessage(
        t("permissions.status.saved", "Permission settings saved."),
      );
    } catch (error) {
      console.error("Failed to save permission settings:", error);
      setStatusMessage(
        t(
          "permissions.status.saveFailed",
          "Failed to save permission settings.",
        ),
      );
    } finally {
      setSaving(false);
    }
  };

  const approvalPreset = useMemo(() => {
    if (!builtinSettings) return "custom";
    return detectApprovalExperiencePreset(settings, builtinSettings);
  }, [builtinSettings, settings]);

  const applyApprovalPreset = async (
    preset: Exclude<ApprovalExperiencePreset, "custom">,
  ) => {
    if (!builtinSettings) {
      setStatusMessage(
        t(
          "permissions.status.builtinUnavailable",
          "Built-in tools settings are unavailable right now.",
        ),
      );
      return;
    }

    const next =
      preset === "fewer_prompts"
        ? applyFewerApprovalPromptsPreset(settings, builtinSettings)
        : applyStandardApprovalPromptsPreset(settings, builtinSettings);

    try {
      setSaving(true);
      await Promise.all([
        window.electronAPI.savePermissionSettings(next.permissionSettings),
        window.electronAPI.saveBuiltinToolsSettings(next.builtinSettings),
      ]);
      setSettings(next.permissionSettings);
      setBuiltinSettings(next.builtinSettings);
      setStatusMessage(
        preset === "fewer_prompts"
          ? t(
              "permissions.status.fewerPrompts",
              "Fewer approval prompts enabled.",
            )
          : t(
              "permissions.status.standardPrompts",
              "Standard approval prompts restored.",
            ),
      );
    } catch (error) {
      console.error("Failed to apply approval preset:", error);
      setStatusMessage(
        t(
          "permissions.status.approvalFailed",
          "Failed to update approval settings.",
        ),
      );
    } finally {
      setSaving(false);
    }
  };

  const loadWorkspaceRules = async (nextWorkspaceId?: string) => {
    if (!nextWorkspaceId) {
      setWorkspaceRules([]);
      return;
    }
    try {
      setWorkspaceRulesLoading(true);
      const rules =
        await window.electronAPI.getWorkspacePermissionRules(nextWorkspaceId);
      setWorkspaceRules(rules || []);
    } catch (error) {
      console.error("Failed to load workspace permission rules:", error);
      setWorkspaceRules([]);
    } finally {
      setWorkspaceRulesLoading(false);
    }
  };

  const addRule = () => {
    const scope = buildScope(ruleDraft);
    const nextRule: PermissionRule = {
      source: "profile",
      effect: ruleDraft.effect,
      scope,
    };
    const nextSettings: PermissionSettingsData = {
      ...settings,
      rules: [...settings.rules, nextRule],
    };
    setSettings(nextSettings);
    setRuleDraft(DEFAULT_RULE_DRAFT);
    setStatusMessage(
      t(
        "permissions.status.ruleAdded",
        "Rule added locally. Save to persist it.",
      ),
    );
  };

  const removeRule = (index: number) => {
    const nextSettings: PermissionSettingsData = {
      ...settings,
      rules: settings.rules.filter((_, ruleIndex) => ruleIndex !== index),
    };
    setSettings(nextSettings);
    setStatusMessage(
      t(
        "permissions.status.ruleRemoved",
        "Rule removed locally. Save to persist it.",
      ),
    );
  };

  const removeWorkspaceRule = async (ruleId: string) => {
    if (!workspaceId) return;
    try {
      setDeletingRuleId(ruleId);
      const result = await window.electronAPI.deleteWorkspacePermissionRule({
        workspaceId,
        ruleId,
      });
      if (result.success && result.removed) {
        setStatusMessage(
          result.manifestRemoved
            ? t(
                "permissions.status.workspaceRuleRemovedWithManifest",
                "Workspace rule removed from the database and manifest.",
              )
            : result.manifestError
              ? t(
                  "permissions.status.workspaceRuleManifestFailed",
                  "Workspace rule removed from the database. Manifest removal failed: {error}",
                  { error: result.manifestError },
                )
              : t(
                  "permissions.status.workspaceRuleRemoved",
                  "Workspace rule removed.",
                ),
        );
        await loadWorkspaceRules(workspaceId);
      } else {
        setStatusMessage(
          t(
            "permissions.status.workspaceRuleRemoveFailed",
            "Failed to remove workspace rule.",
          ),
        );
      }
    } catch (error) {
      console.error("Failed to delete workspace permission rule:", error);
      setStatusMessage(
        t(
          "permissions.status.workspaceRuleRemoveFailed",
          "Failed to remove workspace rule.",
        ),
      );
    } finally {
      setDeletingRuleId(null);
    }
  };

  const canAddRule = useMemo(() => {
    switch (ruleDraft.scopeKind) {
      case "tool":
        return !!ruleDraft.toolName.trim();
      case "domain":
        return !!ruleDraft.domain.trim();
      case "path":
        return !!ruleDraft.path.trim();
      case "command_prefix":
        return !!ruleDraft.prefix.trim();
      case "mcp_server":
        return !!ruleDraft.serverName.trim();
      default:
        return false;
    }
  }, [ruleDraft]);

  if (loading) {
    return (
      <div className="settings-loading">
        {t("permissions.loading", "Loading permission settings...")}
      </div>
    );
  }

  return (
    <div className="settings-section permission-settings-panel">
      <div className="settings-section-header">
        <h3>{t("permissions.title", "Permissions")}</h3>
      </div>
      <p className="settings-description">
        {t(
          "permissions.description",
          "Configure the default permission mode, global profile rules, and browse or remove workspace-local rules for the current workspace.",
        )}
      </p>

      <div className="settings-subsection">
        <h4 style={{ margin: "0 0 8px" }}>
          {t("permissions.approval.title", "Approval experience")}
        </h4>
        <p className="settings-hint">
          {t(
            "permissions.approval.description",
            "Fewer prompts keeps approvals for deletes, risky shell commands, browser/system actions, and external side effects, while letting routine repo work proceed with less friction.",
          )}
        </p>
        <p className="settings-hint" style={{ marginTop: "6px" }}>
          {t("permissions.approval.current", "Current:")}{" "}
          {approvalPreset === "fewer_prompts"
            ? t("permissions.approval.fewer", "Fewer prompts")
            : approvalPreset === "standard"
              ? t("permissions.approval.standard", "Standard prompts")
              : t("permissions.approval.custom", "Custom")}
        </p>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "8px",
            marginTop: "10px",
          }}
        >
          <button
            className="button-small button-secondary"
            onClick={() => void applyApprovalPreset("fewer_prompts")}
            disabled={saving || !builtinSettings}
          >
            {t("permissions.approval.useFewer", "Use fewer prompts")}
          </button>
          <button
            className="button-small button-secondary"
            onClick={() => void applyApprovalPreset("standard")}
            disabled={saving || !builtinSettings}
          >
            {t(
              "permissions.approval.restoreStandard",
              "Restore standard prompts",
            )}
          </button>
        </div>
      </div>

      <div className="settings-subsection">
        <label className="settings-label">
          {t("permissions.defaultMode.title", "Default permission mode")}
        </label>
        <select
          className="settings-select"
          value={settings.defaultMode}
          onChange={(e) =>
            setSettings({
              ...settings,
              defaultMode: e.target.value as PermissionMode,
            })
          }
        >
          <option value="default">
            {t("permissions.mode.default", "Default")}
          </option>
          <option value="plan">{t("permissions.mode.plan", "Plan")}</option>
          <option value="dangerous_only">
            {t("permissions.mode.dangerousOnly", "Dangerous only")}
          </option>
          <option value="accept_edits">
            {t("permissions.mode.acceptEdits", "Accept edits")}
          </option>
          <option value="dont_ask">
            {t("permissions.mode.dontAsk", "Don't ask")}
          </option>
          <option value="bypass_permissions">
            {t("permissions.mode.bypass", "Bypass permissions")}
          </option>
        </select>
        <p className="settings-hint">
          {t(
            "permissions.defaultMode.hint",
            "This mode applies when no explicit permission rule matches. For everyday repo work, `dangerous_only` is the lower-noise option.",
          )}
        </p>
      </div>

      <div className="settings-subsection">
        <h4 style={{ margin: "0 0 8px" }}>
          {t("permissions.defaultAccess.title", "Default access")}
        </h4>
        <label className="settings-checkbox">
          <input
            type="checkbox"
            checked={settings.defaultShellEnabled}
            onChange={(e) =>
              setSettings({
                ...settings,
                defaultShellEnabled: e.target.checked,
              })
            }
          />
          <span>
            {t(
              "permissions.defaultAccess.enableShell",
              "Enable Shell for new workspaces",
            )}
          </span>
        </label>
        <p className="settings-hint">
          {t(
            "permissions.defaultAccess.shellHint",
            "New workspaces will start with the Shell toggle on. Existing workspaces keep their current Shell setting.",
          )}
        </p>

        <label className="settings-label" style={{ marginTop: "12px" }}>
          {t("permissions.defaultAccess.newTaskAccess", "New task access")}
        </label>
        <select
          className="settings-select"
          value={settings.defaultPermissionAccess}
          onChange={(e) =>
            setSettings({
              ...settings,
              defaultPermissionAccess:
                e.target.value === "full" ? "full" : "default",
            })
          }
        >
          <option value="default">
            {t("permissions.defaultAccess.default", "Default permissions")}
          </option>
          <option value="full">
            {t("permissions.defaultAccess.full", "Full access")}
          </option>
        </select>
        <p className="settings-hint">
          {t(
            "permissions.defaultAccess.fullHint",
            "Full access starts new tasks with permission bypass and Shell access enabled.",
          )}
        </p>
      </div>

      <div className="settings-subsection">
        <h4 style={{ margin: "0 0 8px" }}>
          {t("permissions.profileRules.title", "Profile rules")}
        </h4>
        {settings.rules.length === 0 ? (
          <p className="settings-hint">
            {t("permissions.profileRules.empty", "No profile rules saved yet.")}
          </p>
        ) : (
          <div style={{ display: "grid", gap: "8px" }}>
            {settings.rules.map((rule, index) => (
              <div
                key={`${rule.source}:${index}:${scopeToLabel(rule.scope)}`}
                className="permission-rule-row"
              >
                <div className="permission-rule-content">
                  <div
                    className="settings-label"
                    style={{ marginBottom: "4px" }}
                  >
                    {t("permissions.ruleSummary", "{effect} via {source}", {
                      effect: rule.effect.toUpperCase(),
                      source: t(
                        `permissions.source.${rule.source}`,
                        rule.source,
                      ),
                    })}
                  </div>
                  <div className="settings-hint">
                    {scopeToLabel(rule.scope)}
                  </div>
                </div>
                <button
                  className="permission-rule-remove button-small button-secondary"
                  onClick={() => removeRule(index)}
                >
                  {t("permissions.action.remove", "Remove")}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="settings-subsection">
        <h4 style={{ margin: "0 0 8px" }}>
          {t("permissions.addRule.title", "Add rule")}
        </h4>
        <div className="settings-inline-input">
          <label>{t("permissions.addRule.effect", "Effect")}</label>
          <select
            className="settings-select"
            value={ruleDraft.effect}
            onChange={(e) =>
              setRuleDraft((prev) => ({
                ...prev,
                effect: e.target.value as RuleDraft["effect"],
              }))
            }
          >
            <option value="allow">
              {t("permissions.effect.allow", "Allow")}
            </option>
            <option value="deny">{t("permissions.effect.deny", "Deny")}</option>
            <option value="ask">{t("permissions.effect.ask", "Ask")}</option>
          </select>
        </div>

        <div className="settings-inline-input">
          <label>{t("permissions.addRule.scope", "Scope")}</label>
          <select
            className="settings-select"
            value={ruleDraft.scopeKind}
            onChange={(e) =>
              setRuleDraft((prev) => ({
                ...prev,
                scopeKind: e.target.value as RuleDraft["scopeKind"],
              }))
            }
          >
            <option value="tool">
              {t("permissions.scopeKind.tool", "Tool")}
            </option>
            <option value="domain">
              {t("permissions.scopeKind.domain", "Domain")}
            </option>
            <option value="path">
              {t("permissions.scopeKind.path", "Path")}
            </option>
            <option value="command_prefix">
              {t("permissions.scopeKind.commandPrefix", "Command prefix")}
            </option>
            <option value="mcp_server">
              {t("permissions.scopeKind.mcpServer", "MCP server")}
            </option>
          </select>
        </div>

        {ruleDraft.scopeKind === "tool" && (
          <div className="settings-inline-input">
            <label>{t("permissions.addRule.toolName", "Tool name")}</label>
            <input
              className="settings-input"
              value={ruleDraft.toolName}
              onChange={(e) =>
                setRuleDraft((prev) => ({ ...prev, toolName: e.target.value }))
              }
              placeholder="run_command"
            />
          </div>
        )}

        {ruleDraft.scopeKind === "path" && (
          <>
            <div className="settings-inline-input">
              <label>{t("permissions.addRule.toolName", "Tool name")}</label>
              <input
                className="settings-input"
                value={ruleDraft.toolName}
                onChange={(e) =>
                  setRuleDraft((prev) => ({
                    ...prev,
                    toolName: e.target.value,
                  }))
                }
                placeholder="edit_file"
              />
            </div>
            <div className="settings-inline-input">
              <label>
                {t("permissions.addRule.pathPrefix", "Path prefix")}
              </label>
              <input
                className="settings-input"
                value={ruleDraft.path}
                onChange={(e) =>
                  setRuleDraft((prev) => ({ ...prev, path: e.target.value }))
                }
                placeholder="/Users/you/project/src"
              />
            </div>
          </>
        )}

        {ruleDraft.scopeKind === "domain" && (
          <>
            <div className="settings-inline-input">
              <label>{t("permissions.addRule.toolName", "Tool name")}</label>
              <input
                className="settings-input"
                value={ruleDraft.toolName}
                onChange={(e) =>
                  setRuleDraft((prev) => ({
                    ...prev,
                    toolName: e.target.value,
                  }))
                }
                placeholder="http_request"
              />
            </div>
            <div className="settings-inline-input">
              <label>{t("permissions.addRule.domain", "Domain")}</label>
              <input
                className="settings-input"
                value={ruleDraft.domain}
                onChange={(e) =>
                  setRuleDraft((prev) => ({ ...prev, domain: e.target.value }))
                }
                placeholder="api.example.com"
              />
            </div>
          </>
        )}

        {ruleDraft.scopeKind === "command_prefix" && (
          <div className="settings-inline-input">
            <label>
              {t("permissions.addRule.commandPrefix", "Command prefix")}
            </label>
            <input
              className="settings-input"
              value={ruleDraft.prefix}
              onChange={(e) =>
                setRuleDraft((prev) => ({ ...prev, prefix: e.target.value }))
              }
              placeholder="git status"
            />
          </div>
        )}

        {ruleDraft.scopeKind === "mcp_server" && (
          <div className="settings-inline-input">
            <label>
              {t("permissions.addRule.mcpServerName", "MCP server name")}
            </label>
            <input
              className="settings-input"
              value={ruleDraft.serverName}
              onChange={(e) =>
                setRuleDraft((prev) => ({
                  ...prev,
                  serverName: e.target.value,
                }))
              }
              placeholder="github"
            />
          </div>
        )}

        <div className="settings-actions">
          <button
            className="button-secondary"
            onClick={() => setRuleDraft(DEFAULT_RULE_DRAFT)}
          >
            {t("permissions.action.resetDraft", "Reset Draft")}
          </button>
          <button className="button-secondary" onClick={loadSettings}>
            {t("permissions.action.reload", "Reload")}
          </button>
          <button
            className="button-primary"
            onClick={addRule}
            disabled={!canAddRule}
          >
            {t("permissions.action.addRule", "Add Rule")}
          </button>
        </div>
      </div>

      {statusMessage && <div className="settings-hint">{statusMessage}</div>}

      <div className="settings-subsection">
        <h4 style={{ margin: "0 0 8px" }}>
          {t("permissions.workspaceRules.title", "Workspace-local rules")}
        </h4>
        <p className="settings-hint">
          {t(
            "permissions.workspaceRules.description",
            "These rules are persisted for the current workspace and can be removed directly here.",
          )}
        </p>
        {!workspaceId ? (
          <p className="settings-hint">
            {t(
              "permissions.workspaceRules.openWorkspace",
              "Open a workspace to manage its local rules.",
            )}
          </p>
        ) : workspaceRulesLoading ? (
          <p className="settings-hint">
            {t(
              "permissions.workspaceRules.loading",
              "Loading workspace rules...",
            )}
          </p>
        ) : workspaceRules.length === 0 ? (
          <p className="settings-hint">
            {t(
              "permissions.workspaceRules.empty",
              "No workspace-local rules saved yet.",
            )}
          </p>
        ) : (
          <div style={{ display: "grid", gap: "8px" }}>
            {workspaceRules.map((rule) => (
              <div
                key={rule.id || `${rule.source}:${scopeToLabel(rule.scope)}`}
                className="permission-rule-row"
              >
                <div className="permission-rule-content">
                  <div
                    className="settings-label"
                    style={{ marginBottom: "4px" }}
                  >
                    {t("permissions.ruleSummary", "{effect} via {source}", {
                      effect: rule.effect.toUpperCase(),
                      source: t("permissions.source.workspace", "workspace"),
                    })}
                  </div>
                  <div className="settings-hint">
                    {scopeToLabel(rule.scope)}
                  </div>
                </div>
                <button
                  className="permission-rule-remove button-small button-secondary"
                  onClick={() => void removeWorkspaceRule(rule.id || "")}
                  disabled={!rule.id || deletingRuleId === rule.id}
                >
                  {deletingRuleId === rule.id
                    ? t("permissions.action.removing", "Removing...")
                    : t("permissions.action.remove", "Remove")}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="settings-actions" style={{ marginTop: "12px" }}>
        <button
          className="button-primary"
          onClick={() => void saveSettings(settings)}
          disabled={saving}
        >
          {saving
            ? t("permissions.action.saving", "Saving...")
            : t("permissions.action.saveSettings", "Save Settings")}
        </button>
      </div>
    </div>
  );
}
