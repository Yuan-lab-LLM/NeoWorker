import { useState } from "react";
import { FolderOpen, Pencil, Check, X, ChevronDown, Copy } from "lucide-react";
import { isTempWorkspaceId, type Task, type Workspace, type WorkspaceContextDetails } from "../../shared/types";
import { translate as t } from "../i18n";
import { workspaceDisplayName } from "../utils/workspace-identity";

export function WorkspaceIdentity({ workspace, task, context, onSelectWorkspace }: {
  workspace: Workspace;
  task?: Task;
  context: WorkspaceContextDetails | null;
  onSelectWorkspace?: (workspace: Workspace) => void;
}) {
  const title = workspaceDisplayName(workspace, context?.sessions[0]?.title || task?.title);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(title);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [choices, setChoices] = useState<Workspace[] | null>(null);
  const shared = (context?.sessionCount || 0) > 1;
  const temporary = workspace.isTemp || isTempWorkspaceId(workspace.id);
  const runAction = async (action: () => Promise<unknown>) => {
    setError("");
    try { await action(); } catch (e) { setError(String(e)); }
  };
  const save = async () => {
    if (!name.trim() || busy) return;
    setBusy(true); setError("");
    try {
      const updated = await window.electronAPI.renameWorkspace(workspace.id, name.trim());
      onSelectWorkspace?.(updated);
      setEditing(false);
    } catch (e) { setError(String(e)); }
    finally { setBusy(false); }
  };
  const toggleChoices = async () => {
    if (choices) { setChoices(null); return; }
    setBusy(true); setError("");
    try {
      setChoices((await window.electronAPI.listWorkspaces({ includeTemporary: true }))
        .filter(item => item.id !== workspace.id && (!item.availability || item.availability === "available")));
    } catch (e) { setError(String(e)); }
    finally { setBusy(false); }
  };
  return <div className="workspace-identity">
    <span className="workspace-ownership-label">{!context ? t("workspaceOwnership.name", "Workspace name") : shared
      ? t("workspaceOwnership.shared", "Shared workspace · {count} conversations", { count: context!.sessionCount })
      : temporary ? t("workspaceOwnership.private", "This conversation’s workspace")
      : t("workspaceOwnership.folder", "Folder workspace")}</span>
    {editing ? <form className="workspace-name-editor" onSubmit={event => { event.preventDefault(); void save(); }}>
      <input autoFocus maxLength={120} value={name} onChange={event => setName(event.target.value)} aria-label={t("workspaceOwnership.name", "Workspace name")} />
      <button className="project-icon-button" disabled={busy || !name.trim()} aria-label={t("common.save", "Save")}><Check size={15} /></button>
      <button className="project-icon-button" type="button" onClick={() => setEditing(false)} aria-label={t("common.cancel", "Cancel")}><X size={15} /></button>
    </form> : <div className="workspace-name-row">
      <strong title={title}>{title}</strong>
      <button className="project-icon-button" onClick={() => { setName(title); setEditing(true); }} title={t("workspaceOwnership.rename", "Rename workspace")} aria-label={t("workspaceOwnership.rename", "Rename workspace")}><Pencil size={14} /></button>
    </div>}
    <details className="workspace-location-details">
      <summary>{t("workspaceOwnership.location", "Location and sharing")}</summary>
      <p className="workspace-path" title={workspace.path}>{workspace.path}</p>
      <div className="workspace-location-actions">
        <button onClick={() => void runAction(() => window.electronAPI.openFile(workspace.path, workspace.path))}><FolderOpen size={14} />{t("workspaceOwnership.open", "Open folder")}</button>
        <button onClick={() => void runAction(() => navigator.clipboard.writeText(workspace.path))}><Copy size={14} />{t("workspaceOwnership.copy", "Copy path")}</button>
        {onSelectWorkspace && <button disabled={busy} onClick={() => void toggleChoices()} aria-expanded={choices !== null}><ChevronDown size={14} />{t("workspaceOwnership.choose", "Use an existing workspace")}</button>}
      </div>
      {choices && <div className="workspace-sharing-choices">
        <p>{t("workspaceOwnership.sharingHint", "This conversation will use the selected workspace. Existing files stay in their original folders.")}</p>
        {choices.length === 0 && <p>{t("workspaceOwnership.noChoices", "No other workspace is available.")}</p>}
        {choices.map(item => <button key={item.id} title={item.path} onClick={() => { onSelectWorkspace?.(item); setChoices(null); }}>
          <strong>{workspaceDisplayName(item)}</strong><small>{item.path}</small>
        </button>)}
      </div>}
    </details>
    {error && <p role="alert" className="workspace-action-error">{error}</p>}
  </div>;
}
