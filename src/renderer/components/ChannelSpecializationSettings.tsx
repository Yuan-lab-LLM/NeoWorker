import { useCallback, useEffect, useMemo, useState } from "react";
import type { AgentRoleData } from "../../electron/preload";
import type { ChannelSpecialization, Workspace } from "../../shared/types";
import { translate, useLanguage } from "../i18n";

const DEFAULT_TOOL_RESTRICTIONS = [
  "group:memory",
  "group:system",
  "group:network",
  "group:destructive",
];

interface ChannelSpecializationSettingsProps {
  channelId: string;
}

type ChatOption = { chatId: string; lastTimestamp: number };
type AgentRole = AgentRoleData;

function formatChatLabel(chat: ChatOption): string {
  const date = chat.lastTimestamp
    ? new Date(chat.lastTimestamp).toLocaleString()
    : "";
  return date ? `${chat.chatId} - ${date}` : chat.chatId;
}

function scopeKey(chatId?: string, threadId?: string): string {
  return `${chatId || ""}::${threadId || ""}`;
}

export function ChannelSpecializationSettings({
  channelId,
}: ChannelSpecializationSettingsProps) {
  useLanguage();
  const t = translate;
  const [specializations, setSpecializations] = useState<
    ChannelSpecialization[]
  >([]);
  const [chats, setChats] = useState<ChatOption[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [agentRoles, setAgentRoles] = useState<AgentRole[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [chatId, setChatId] = useState("");
  const [threadId, setThreadId] = useState("");
  const [name, setName] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");
  const [agentRoleId, setAgentRoleId] = useState("");
  const [systemGuidance, setSystemGuidance] = useState("");
  const [toolRestrictions, setToolRestrictions] = useState<string[]>([]);
  const [allowSharedContextMemory, setAllowSharedContextMemory] =
    useState(false);
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = useMemo(
    () => specializations.find((item) => item.id === selectedId) || null,
    [selectedId, specializations],
  );

  const load = useCallback(async () => {
    const [nextSpecializations, nextChats, nextWorkspaces, nextRoles] =
      await Promise.all([
        window.electronAPI.listChannelSpecializations(channelId),
        window.electronAPI.getGatewayChats(channelId),
        window.electronAPI.listWorkspaces(),
        window.electronAPI.getAgentRoles(true),
      ]);
    setSpecializations(nextSpecializations);
    setChats(nextChats);
    setWorkspaces(nextWorkspaces);
    setAgentRoles(
      nextRoles.filter((role: AgentRole) => role.isActive !== false),
    );
  }, [channelId]);

  useEffect(() => {
    void load().catch((err) => {
      console.error("Failed to load channel specializations:", err);
      setError(
        err instanceof Error
          ? err.message
          : t(
              "channelSpecialization.error.load",
              "Failed to load specializations",
            ),
      );
    });
  }, [load]);

  useEffect(() => {
    if (!selected) return;
    setChatId(selected.chatId || "");
    setThreadId(selected.threadId || "");
    setName(selected.name || "");
    setWorkspaceId(selected.workspaceId || "");
    setAgentRoleId(selected.agentRoleId || "");
    setSystemGuidance(selected.systemGuidance || "");
    setToolRestrictions(selected.toolRestrictions || []);
    setAllowSharedContextMemory(selected.allowSharedContextMemory);
    setEnabled(selected.enabled);
  }, [selected]);

  const resetForm = () => {
    setSelectedId("");
    setChatId("");
    setThreadId("");
    setName("");
    setWorkspaceId("");
    setAgentRoleId("");
    setSystemGuidance("");
    setToolRestrictions([]);
    setAllowSharedContextMemory(false);
    setEnabled(true);
    setError(null);
  };

  const toggleRestriction = (restriction: string) => {
    setToolRestrictions((current) =>
      current.includes(restriction)
        ? current.filter((item) => item !== restriction)
        : [...current, restriction],
    );
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      const payload = {
        chatId: chatId.trim() || undefined,
        threadId: threadId.trim() || undefined,
        name: name.trim() || undefined,
        workspaceId: workspaceId || undefined,
        agentRoleId: agentRoleId || undefined,
        systemGuidance: systemGuidance.trim() || undefined,
        toolRestrictions,
        allowSharedContextMemory,
        enabled,
      };
      if (selectedId) {
        await window.electronAPI.updateChannelSpecialization({
          id: selectedId,
          ...payload,
          chatId: payload.chatId ?? null,
          threadId: payload.threadId ?? null,
          name: payload.name ?? null,
          workspaceId: payload.workspaceId ?? null,
          agentRoleId: payload.agentRoleId ?? null,
          systemGuidance: payload.systemGuidance ?? null,
        });
      } else {
        await window.electronAPI.createChannelSpecialization({
          channelId,
          ...payload,
        });
      }
      await load();
      resetForm();
    } catch (err) {
      console.error("Failed to save channel specialization:", err);
      setError(
        err instanceof Error
          ? err.message
          : t(
              "channelSpecialization.error.save",
              "Failed to save specialization",
            ),
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedId) return;
    try {
      setSaving(true);
      setError(null);
      await window.electronAPI.deleteChannelSpecialization(selectedId);
      await load();
      resetForm();
    } catch (err) {
      console.error("Failed to delete channel specialization:", err);
      setError(
        err instanceof Error
          ? err.message
          : t(
              "channelSpecialization.error.delete",
              "Failed to delete specialization",
            ),
      );
    } finally {
      setSaving(false);
    }
  };

  const targetScope = scopeKey(chatId.trim(), threadId.trim());
  const duplicateScope = specializations.some(
    (item) =>
      item.id !== selectedId &&
      scopeKey(item.chatId, item.threadId) === targetScope,
  );

  return (
    <div className="settings-section">
      <h4>{t("channelSpecialization.title", "Channel Specialization")}</h4>
      <p className="settings-description">
        {t(
          "channelSpecialization.description",
          "Route a channel, group, or topic to a workspace and agent role with optional guidance.",
        )}
      </p>

      {specializations.length > 0 && (
        <div className="settings-field">
          <label>
            {t("channelSpecialization.existing", "Existing specialization")}
          </label>
          <select
            className="settings-select"
            value={selectedId}
            onChange={(event) => setSelectedId(event.target.value)}
          >
            <option value="">
              {t("channelSpecialization.new", "New specialization")}
            </option>
            {specializations.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name ||
                  item.threadId ||
                  item.chatId ||
                  t("channelSpecialization.channelDefault", "Channel default")}
                {!item.enabled
                  ? ` ${t("channelSpecialization.disabledSuffix", "(disabled)")}`
                  : ""}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="settings-field">
        <label>{t("channelSpecialization.chatOrGroup", "Chat or group")}</label>
        <select
          className="settings-select"
          value={chatId}
          onChange={(event) => setChatId(event.target.value)}
        >
          <option value="">
            {t(
              "channelSpecialization.wholeChannelDefault",
              "Whole channel default",
            )}
          </option>
          {chats.map((chat) => (
            <option key={chat.chatId} value={chat.chatId}>
              {formatChatLabel(chat)}
            </option>
          ))}
        </select>
        <input
          className="settings-input"
          value={chatId}
          onChange={(event) => setChatId(event.target.value)}
          placeholder={t(
            "channelSpecialization.placeholder.chatId",
            "Or paste chat/group ID",
          )}
        />
      </div>

      <div className="settings-field">
        <label>{t("channelSpecialization.threadId", "Topic/thread ID")}</label>
        <input
          className="settings-input"
          value={threadId}
          onChange={(event) => setThreadId(event.target.value)}
          placeholder={t(
            "channelSpecialization.placeholder.threadId",
            "Optional topic/thread ID",
          )}
        />
      </div>

      <div className="settings-field">
        <label>{t("channelSpecialization.displayName", "Display name")}</label>
        <input
          className="settings-input"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={t(
            "channelSpecialization.placeholder.displayName",
            "Support group, research topic, etc.",
          )}
        />
      </div>

      <div className="settings-field">
        <label>{t("common.workspace", "Workspace")}</label>
        <select
          className="settings-select"
          value={workspaceId}
          onChange={(event) => setWorkspaceId(event.target.value)}
        >
          <option value="">
            {t("channelSpecialization.channelDefault", "Channel default")}
          </option>
          {workspaces.map((workspace) => (
            <option key={workspace.id} value={workspace.id}>
              {workspace.name}
            </option>
          ))}
        </select>
      </div>

      <div className="settings-field">
        <label>{t("channelSpecialization.agentRole", "Agent role")}</label>
        <select
          className="settings-select"
          value={agentRoleId}
          onChange={(event) => setAgentRoleId(event.target.value)}
        >
          <option value="">
            {t("channelSpecialization.channelDefault", "Channel default")}
          </option>
          {agentRoles.map((role) => (
            <option key={role.id} value={role.id}>
              {role.displayName || role.name}
            </option>
          ))}
        </select>
      </div>

      <div className="settings-field">
        <label>{t("channelSpecialization.guidance", "Guidance")}</label>
        <textarea
          className="settings-textarea"
          value={systemGuidance}
          onChange={(event) => setSystemGuidance(event.target.value)}
          placeholder={t(
            "channelSpecialization.placeholder.guidance",
            "Instructions added to new tasks from this scope",
          )}
          rows={4}
        />
      </div>

      <div className="settings-field">
        <label>
          {t("channelSpecialization.toolRestrictions", "Tool restrictions")}
        </label>
        <div className="checkbox-group">
          {DEFAULT_TOOL_RESTRICTIONS.map((restriction) => (
            <label key={restriction} className="settings-checkbox">
              <input
                type="checkbox"
                checked={toolRestrictions.includes(restriction)}
                onChange={() => toggleRestriction(restriction)}
              />
              {restriction}
            </label>
          ))}
        </div>
      </div>

      <label className="settings-checkbox">
        <input
          type="checkbox"
          checked={allowSharedContextMemory}
          onChange={(event) =>
            setAllowSharedContextMemory(event.target.checked)
          }
        />
        {t(
          "channelSpecialization.allowSharedMemory",
          "Allow shared memory context for this group/topic",
        )}
      </label>

      <label className="settings-checkbox">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => setEnabled(event.target.checked)}
        />
        {t("common.enabled", "Enabled")}
      </label>

      {duplicateScope && (
        <p className="settings-hint warning">
          {t(
            "channelSpecialization.duplicateWarning",
            "Saving will replace the existing specialization for this scope.",
          )}
        </p>
      )}
      {error && <p className="settings-hint warning">{error}</p>}

      <div className="settings-actions">
        <button
          className="button-primary"
          onClick={handleSave}
          disabled={saving}
        >
          {saving
            ? t("common.saving", "Saving...")
            : selectedId
              ? t("channelSpecialization.update", "Update Specialization")
              : t("channelSpecialization.save", "Save Specialization")}
        </button>
        {selectedId && (
          <button
            className="button-danger"
            onClick={handleDelete}
            disabled={saving}
          >
            {t("common.delete", "Delete")}
          </button>
        )}
        <button
          className="button-secondary"
          onClick={resetForm}
          disabled={saving}
        >
          {t("common.reset", "Reset")}
        </button>
      </div>
    </div>
  );
}

export default ChannelSpecializationSettings;
