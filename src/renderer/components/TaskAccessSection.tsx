import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FolderOpen,
  KeyRound,
  Plug,
  RefreshCw,
  ShieldCheck,
  Terminal,
  Wrench,
} from "lucide-react";
import type {
  PermissionMode,
  Task,
  TaskAccessCapabilityState,
  TaskAccessConnector,
  TaskAccessSummary,
  TaskEvent,
} from "../../shared/types";
import { deriveTaskAccessUsage } from "../../shared/task-access";
import { translate } from "../i18n";
import { getLocalizedSkillNameFromIdentifier } from "../utils/localized-skills";
import { IntegrationMentionIcon } from "./IntegrationMentionIcon";
import "./task-access-section.css";

const accessCache = new Map<string, TaskAccessSummary>();
const MAX_ACCESS_CACHE_ITEMS = 100;
export const TASK_ACCESS_POLICY_EDITING_FLAG_KEY =
  "neoworker.taskAccessPolicyEditing";

export function isTaskAccessPolicyEditingEnabled(): boolean {
  try {
    return (
      typeof localStorage !== "undefined" &&
      localStorage.getItem(TASK_ACCESS_POLICY_EDITING_FLAG_KEY) === "true"
    );
  } catch {
    return false;
  }
}

function cacheAccessSummary(taskId: string, summary: TaskAccessSummary): void {
  accessCache.delete(taskId);
  accessCache.set(taskId, summary);
  while (accessCache.size > MAX_ACCESS_CACHE_ITEMS) {
    const oldestKey = accessCache.keys().next().value as string | undefined;
    if (!oldestKey) break;
    accessCache.delete(oldestKey);
  }
}

function publishTaskAccessSummary(
  taskId: string,
  summary: TaskAccessSummary,
): void {
  window.setTimeout(() => {
    window.dispatchEvent(
      new CustomEvent("task-access-summary-updated", {
        detail: { taskId, summary },
      }),
    );
  }, 0);
}

const STATE_ORDER: TaskAccessCapabilityState[] = [
  "used",
  "allowed",
  "blocked",
  "available",
  "unavailable",
];

export function getTaskAccessStateLabel(
  state: TaskAccessCapabilityState,
): string {
  return translate(`task.access.state.${state}`, state);
}

function getTaskAccessReason(
  connector: TaskAccessConnector,
): string | undefined {
  return connector.reasonCode
    ? translate(`task.access.reason.${connector.reasonCode}`, connector.reason)
    : connector.reason;
}

export function groupTaskAccessConnectors(
  connectors: readonly TaskAccessConnector[],
): Array<{ state: TaskAccessCapabilityState; items: TaskAccessConnector[] }> {
  return STATE_ORDER.map((state) => ({
    state,
    items: connectors.filter((connector) => connector.state === state),
  })).filter((group) => group.items.length > 0);
}

function permissionModeLabel(mode: PermissionMode | undefined): string {
  if (!mode) return translate("task.access.permission.default", "Default");
  return translate(`task.access.permission.${mode}`, mode.replaceAll("_", " "));
}

function AccessConnectorRow({ connector }: { connector: TaskAccessConnector }) {
  const reason = getTaskAccessReason(connector);
  return (
    <li className="task-access-row">
      <span className="task-access-row-icon" aria-hidden="true">
        <IntegrationMentionIcon
          iconKey={connector.iconKey}
          label={connector.label}
          size={16}
        />
      </span>
      <span className="task-access-row-copy">
        <span className="task-access-row-label">{connector.label}</span>
        {reason ? (
          <span className="task-access-row-reason">{reason}</span>
        ) : null}
      </span>
      <span
        className={`task-access-state task-access-state-${connector.state}`}
      >
        {getTaskAccessStateLabel(connector.state)}
      </span>
    </li>
  );
}

function AccessToolRows({ summary }: { summary: TaskAccessSummary }) {
  const rows = useMemo(() => {
    const used = new Set(summary.usedToolNames);
    const blocked = new Set(summary.policy.blockedTools || []);
    const allowed = new Set(summary.policy.allowedTools || []);
    const names = Array.from(new Set([...used, ...allowed, ...blocked])).slice(
      0,
      100,
    );
    return names.map((name) => ({
      name,
      state: used.has(name)
        ? "used"
        : blocked.has(name)
          ? "blocked"
          : "allowed",
    })) as Array<{ name: string; state: "used" | "blocked" | "allowed" }>;
  }, [summary]);

  if (rows.length === 0) return null;
  return (
    <div className="task-access-subsection">
      <h4>
        <Wrench size={14} aria-hidden="true" />
        {translate("task.access.tools", "Tools")}
      </h4>
      <ul className="task-access-compact-list">
        {rows.map((row) => (
          <li key={row.name}>
            <code>{row.name}</code>
            <span
              className={`task-access-state task-access-state-${row.state}`}
            >
              {getTaskAccessStateLabel(row.state)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export interface TaskAccessSectionProps {
  taskId: string;
  taskUpdatedAt?: number;
  fallbackTask?: Task;
  fallbackEvents?: TaskEvent[];
  onOpenReferencedFile?: (path: string) => void;
}

function TaskAccessUsagePreview({
  task,
  events,
}: {
  task?: Task;
  events: TaskEvent[];
}) {
  const usage = useMemo(
    () => deriveTaskAccessUsage(events, task),
    [events, task],
  );
  if (usage.usedSkillIds.length === 0 && usage.usedToolNames.length === 0)
    return null;
  return (
    <div className="task-access-usage-preview">
      <h4>{translate("rightPanel.context", "Context")}</h4>
      {usage.usedSkillIds.length > 0 && (
        <div>
          <span>{translate("rightPanel.skillsUsed", "Skills used")}</span>
          <ul>
            {usage.usedSkillIds.map((skill) => (
              <li key={skill}>{getLocalizedSkillNameFromIdentifier(skill)}</li>
            ))}
          </ul>
        </div>
      )}
      {usage.usedToolNames.length > 0 && (
        <div>
          <span>{translate("rightPanel.toolsUsed", "Tools used")}</span>
          <ul>
            {usage.usedToolNames.map((tool) => (
              <li key={tool}>
                <code>{tool}</code>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function TaskAccessSection({
  taskId,
  taskUpdatedAt,
  fallbackTask,
  fallbackEvents = [],
  onOpenReferencedFile,
}: TaskAccessSectionProps) {
  const cached = accessCache.get(taskId) || null;
  const [summary, setSummary] = useState<TaskAccessSummary | null>(cached);
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [draftConnectorIds, setDraftConnectorIds] = useState<string[]>([]);
  const [draftPermissionMode, setDraftPermissionMode] = useState<
    PermissionMode | undefined
  >();
  const [draftShellAccess, setDraftShellAccess] = useState(false);
  const [draftWorkspaceAccess, setDraftWorkspaceAccess] = useState<
    "read" | "write"
  >("read");
  const editingEnabled = isTaskAccessPolicyEditingEnabled();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await window.electronAPI.getTaskAccess(taskId);
      cacheAccessSummary(taskId, next);
      setSummary(next);
      publishTaskAccessSummary(taskId, next);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : String(loadError),
      );
      setSummary((current) =>
        current ? { ...current, stale: true } : current,
      );
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    const nextCached = accessCache.get(taskId) || null;
    setSummary(nextCached);
    setLoading(!nextCached);
    setError(null);
    void load();
  }, [load, taskId, taskUpdatedAt]);

  const connectorGroups = useMemo(
    () => groupTaskAccessConnectors(summary?.connectors || []),
    [summary?.connectors],
  );

  const beginEditing = useCallback(() => {
    if (!summary) return;
    setDraftConnectorIds([...summary.policy.connectorIds]);
    setDraftPermissionMode(summary.policy.permissionMode);
    setDraftShellAccess(summary.policy.shellAccess);
    setDraftWorkspaceAccess(
      summary.policy.workspaceScopes[0]?.access || "read",
    );
    setSaveError(null);
    setEditing(true);
  }, [summary]);

  const savePolicy = useCallback(async () => {
    if (!summary) return;
    setSaving(true);
    setSaveError(null);
    try {
      const next = await window.electronAPI.updateTaskAccess({
        taskId,
        expectedRevision: summary.policy.revision,
        patch: {
          connectorIds: draftConnectorIds,
          workspaceScopes: summary.policy.workspaceScopes.map(
            (scope, index) => ({
              ...scope,
              access: index === 0 ? draftWorkspaceAccess : scope.access,
            }),
          ),
          permissionMode: draftPermissionMode,
          shellAccess: draftShellAccess,
        },
      });
      cacheAccessSummary(taskId, next);
      setSummary(next);
      publishTaskAccessSummary(taskId, next);
      setEditing(false);
    } catch (saveFailure) {
      const message =
        saveFailure instanceof Error
          ? saveFailure.message
          : String(saveFailure);
      if (message.includes("TASK_ACCESS_REVISION_CONFLICT")) {
        try {
          const latest = await window.electronAPI.getTaskAccess(taskId);
          cacheAccessSummary(taskId, latest);
          setSummary(latest);
          publishTaskAccessSummary(taskId, latest);
          setEditing(false);
          setSaveError(
            translate(
              "task.access.conflict",
              "Access changed elsewhere. The latest version has been loaded.",
            ),
          );
        } catch {
          setSaveError(
            translate(
              "task.access.conflictReloadFailed",
              "Access changed elsewhere and the latest version could not be loaded.",
            ),
          );
        }
      } else {
        setSaveError(
          message ||
            translate("task.access.saveFailed", "Access could not be saved."),
        );
      }
    } finally {
      setSaving(false);
    }
  }, [
    draftConnectorIds,
    draftPermissionMode,
    draftShellAccess,
    draftWorkspaceAccess,
    summary,
    taskId,
  ]);

  if (!summary && loading) {
    return (
      <>
        <div
          className="task-access-loading"
          role="status"
          aria-label={translate("task.access.loading", "Loading access")}
        >
          <span />
          <span />
          <span />
        </div>
        <TaskAccessUsagePreview task={fallbackTask} events={fallbackEvents} />
      </>
    );
  }

  if (!summary) {
    return (
      <div className="task-access-error" role="alert">
        <ShieldCheck size={18} aria-hidden="true" />
        <p>
          {translate(
            "task.access.loadFailed",
            "Access status could not be loaded. Runtime permissions remain enforced.",
          )}
        </p>
        <button type="button" onClick={() => void load()}>
          <RefreshCw size={14} aria-hidden="true" />
          {translate("common.retry", "Retry")}
        </button>
      </div>
    );
  }

  return (
    <div className="task-access-summary" aria-busy={loading || undefined}>
      <div className="task-access-heading-row">
        <p className="task-access-explainer">
          {translate(
            "task.access.explainer",
            "Connected globally does not mean authorized for this task.",
          )}
        </p>
        {editingEnabled && !editing ? (
          <button
            type="button"
            className="task-access-edit-button"
            onClick={beginEditing}
          >
            {translate("common.edit", "Edit")}
          </button>
        ) : null}
      </div>
      {(summary.stale || error) && (
        <div className="task-access-stale" role="status">
          {translate(
            "task.access.stale",
            "Showing the last known access state; it may be out of date.",
          )}
          <button type="button" onClick={() => void load()}>
            {translate("common.retry", "Retry")}
          </button>
        </div>
      )}
      {saveError ? (
        <div className="task-access-save-error" role="alert">
          {saveError}
        </div>
      ) : null}

      {editing && (
        <div className="task-access-editor">
          <div className="task-access-next-turn-note">
            {translate(
              "task.access.nextTurn",
              "Changes take effect from the next turn and do not change tools already running.",
            )}
          </div>
          <fieldset>
            <legend>{translate("task.access.connectors", "Connectors")}</legend>
            {summary.connectors.map((connector) => {
              const checked = draftConnectorIds.includes(connector.id);
              const disabled =
                !checked &&
                (connector.state === "blocked" ||
                  connector.state === "unavailable");
              return (
                <label key={connector.id} className="task-access-editor-row">
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabled}
                    onChange={(event) =>
                      setDraftConnectorIds((current) =>
                        event.target.checked
                          ? Array.from(new Set([...current, connector.id]))
                          : current.filter((id) => id !== connector.id),
                      )
                    }
                  />
                  <span>{connector.label}</span>
                  <small>
                    {disabled
                      ? getTaskAccessReason(connector) ||
                        getTaskAccessStateLabel(connector.state)
                      : getTaskAccessStateLabel(connector.state)}
                  </small>
                </label>
              );
            })}
          </fieldset>
          <label className="task-access-editor-field">
            <span>
              {translate("task.access.workspaceMode", "Workspace access")}
            </span>
            <select
              value={draftWorkspaceAccess}
              onChange={(event) =>
                setDraftWorkspaceAccess(event.target.value as "read" | "write")
              }
            >
              <option value="read">
                {translate("task.access.readOnly", "Read only")}
              </option>
              <option value="write">
                {translate("task.access.readWrite", "Read & write")}
              </option>
            </select>
          </label>
          <label className="task-access-editor-field">
            <span>
              {translate("task.access.permissionMode", "Permission mode")}
            </span>
            <select
              value={draftPermissionMode || "default"}
              onChange={(event) =>
                setDraftPermissionMode(event.target.value as PermissionMode)
              }
            >
              {(
                [
                  "default",
                  "plan",
                  "dangerous_only",
                  "accept_edits",
                ] as PermissionMode[]
              ).map((mode) => (
                <option key={mode} value={mode}>
                  {permissionModeLabel(mode)}
                </option>
              ))}
              {draftPermissionMode === "dont_ask" ||
              draftPermissionMode === "bypass_permissions" ? (
                <option value={draftPermissionMode} disabled>
                  {permissionModeLabel(draftPermissionMode)}
                </option>
              ) : null}
            </select>
          </label>
          <label className="task-access-editor-row task-access-editor-shell">
            <input
              type="checkbox"
              checked={draftShellAccess}
              onChange={(event) => setDraftShellAccess(event.target.checked)}
            />
            <span>{translate("task.access.shell", "Shell")}</span>
            <small>
              {translate(
                "task.access.shellGuard",
                "Still limited by workspace and approval policies",
              )}
            </small>
          </label>
          <div className="task-access-editor-actions">
            <button
              type="button"
              onClick={() => setEditing(false)}
              disabled={saving}
            >
              {translate("common.cancel", "Cancel")}
            </button>
            <button
              type="button"
              className="primary"
              onClick={() => void savePolicy()}
              disabled={saving}
            >
              {saving
                ? translate("common.saving", "Saving…")
                : translate("common.save", "Save")}
            </button>
          </div>
        </div>
      )}

      <div className="task-access-policy-grid">
        <div>
          <KeyRound size={14} aria-hidden="true" />
          <span>
            {translate("task.access.permissionMode", "Permission mode")}
          </span>
          <strong>{permissionModeLabel(summary.policy.permissionMode)}</strong>
        </div>
        <div>
          <Terminal size={14} aria-hidden="true" />
          <span>{translate("task.access.shell", "Shell")}</span>
          <strong>
            {summary.policy.shellAccess
              ? translate("common.allowed", "Allowed")
              : translate("common.blocked", "Blocked")}
          </strong>
        </div>
      </div>

      {summary.policy.workspaceScopes.length > 0 && (
        <div className="task-access-subsection">
          <h4>
            <FolderOpen size={14} aria-hidden="true" />
            {translate("task.access.workspaces", "Workspaces")}
          </h4>
          <ul className="task-access-compact-list">
            {summary.policy.workspaceScopes.map((scope) => (
              <li key={scope.workspaceId}>
                <span title={scope.rootPath}>
                  {scope.rootPath || scope.workspaceId}
                </span>
                <span
                  className={`task-access-state task-access-state-${scope.access === "write" ? "allowed" : "available"}`}
                >
                  {scope.access === "write"
                    ? translate("task.access.readWrite", "Read & write")
                    : translate("task.access.readOnly", "Read only")}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="task-access-subsection">
        <h4>
          <Plug size={14} aria-hidden="true" />
          {translate("task.access.connectors", "Connectors")}
        </h4>
        {connectorGroups.length === 0 ? (
          <p className="task-access-empty">
            {translate(
              "task.access.noConnectors",
              "No connector access is recorded for this task.",
            )}
          </p>
        ) : (
          connectorGroups.map((group) => (
            <section className="task-access-capability-group" key={group.state}>
              <h5>
                {getTaskAccessStateLabel(group.state)}{" "}
                <span>{group.items.length}</span>
              </h5>
              <ul>
                {group.items.map((connector) => (
                  <AccessConnectorRow
                    key={connector.id}
                    connector={connector}
                  />
                ))}
              </ul>
            </section>
          ))
        )}
      </div>

      <AccessToolRows summary={summary} />

      {summary.usedSkillIds.length > 0 && (
        <div className="task-access-subsection">
          <h4>
            <ShieldCheck size={14} aria-hidden="true" />
            {translate("task.access.skillsUsed", "Skills used")}
          </h4>
          <ul className="task-access-chip-list">
            {summary.usedSkillIds.map((skillId) => (
              <li key={skillId}>{skillId}</li>
            ))}
          </ul>
        </div>
      )}

      {summary.referencedFiles.length > 0 && (
        <div className="task-access-subsection">
          <h4>
            <FolderOpen size={14} aria-hidden="true" />
            {translate("task.access.filesRead", "Files read")}
          </h4>
          <ul className="task-access-file-list">
            {summary.referencedFiles.map((filePath) => (
              <li key={filePath}>
                <button
                  type="button"
                  title={filePath}
                  onClick={() => onOpenReferencedFile?.(filePath)}
                >
                  {filePath.split(/[\\/]/).pop() || filePath}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
