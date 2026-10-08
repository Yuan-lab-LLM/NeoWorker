import { useEffect, useId, useState } from "react";
import { Bot, FileText, Settings2, X, Pencil } from "lucide-react";
import type { PersonalAssistantContext } from "../../../shared/types";
import { useLanguage } from "../../i18n";
import { assistantStudio, fileName, preferenceLines } from "./model";
import "./personal-assistants.css";

export function PersonalAssistantContextBar({ context }: { context: PersonalAssistantContext }) {
  const language = useLanguage();
  const drawerId = useId();
  const preferencesId = useId();
  const text = (zh: string, en: string) => (language === "zh-CN" ? zh : en);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [preferences, setPreferences] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    setOpen(false);
    setEditing(false);
    setError("");
    setSaved(false);
  }, [context.agentId, context.environmentId, context.agentVersion]);
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !editing) setOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open, editing]);
  const edit = async () => {
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      const detail = await window.electronAPI.getManagedAgent(context.agentId);
      if (!detail?.currentVersion) throw new Error(text("助手不可用", "Assistant unavailable"));
      setPreferences(
        assistantStudio(detail.currentVersion).personalAssistant?.preferences.join("\n") || "",
      );
      setEditing(true);
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    setBusy(true);
    setError("");
    try {
      const detail = await window.electronAPI.getManagedAgent(context.agentId);
      const version = detail?.currentVersion;
      const studio = version && assistantStudio(version);
      if (!version || !studio?.personalAssistant)
        throw new Error(text("助手不可用", "Assistant unavailable"));
      await window.electronAPI.updateManagedAgent({
        agentId: context.agentId,
        metadata: {
          ...version.metadata,
          studio: {
            ...studio,
            personalAssistant: {
              ...studio.personalAssistant,
              preferences: preferenceLines(preferences),
            },
          },
        },
      });
      setEditing(false);
      setSaved(true);
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <div className="pa-chat-context">
        <Bot size={17} />
        <strong>{context.agentName}</strong>
        <span className="pa-context-project">{context.projectName}</span>
        <button
          className="pa-text-button"
          aria-expanded={open}
          aria-controls={drawerId}
          onClick={() => setOpen(!open)}
        >
          <Settings2 size={16} />
          {text("资料与偏好", "Sources & preferences")}
        </button>
      </div>
      {open && (
        <aside
          className="pa-context-drawer"
          id={drawerId}
          aria-label={text("资料与偏好", "Sources & preferences")}
        >
          <header>
            <h2>{text("资料与偏好", "Sources & preferences")}</h2>
            <button
              className="pa-icon-button"
              onClick={() => setOpen(false)}
              aria-label={text("关闭", "Close")}
            >
              <X size={19} />
            </button>
          </header>
          <section>
            <h3>{text("当前项目", "Current project")}</h3>
            <p>{context.projectName}</p>
            <p className="pa-note">
              {text(
                "这些资料与设定在本次对话开始时关联。",
                "These sources and settings were linked when this conversation started.",
              )}
            </p>
          </section>
          <section>
            <h3>{text("本次使用的资料", "Sources for this conversation")}</h3>
            {context.referenceFiles.length ? (
              context.referenceFiles.map((path) => (
                <button
                  key={path}
                  className="pa-file-row"
                  title={path}
                  onClick={async () => {
                    try {
                      const failure = await window.electronAPI.openFile(path);
                      if (failure) throw new Error(failure);
                    } catch (cause) {
                      setError(String(cause));
                    }
                  }}
                >
                  <FileText size={17} />
                  <span>{fileName(path)}</span>
                </button>
              ))
            ) : (
              <p className="pa-note">
                {text(
                  "未关联本地资料。可在对话中添加附件。",
                  "No local sources linked. You can attach files in the conversation.",
                )}
              </p>
            )}
          </section>
          <section>
            <h3>{text("本次对话的偏好", "Preferences for this conversation")}</h3>
            {context.preferences.length ? (
              <ul>
                {context.preferences.map((preference, index) => (
                  <li key={index}>{preference}</li>
                ))}
              </ul>
            ) : (
              <p className="pa-note">{text("暂无偏好", "No preferences")}</p>
            )}
            {editing ? (
              <>
                <label className="pa-note" htmlFor={preferencesId}>
                  {text("每行一条；留空可清除。", "One per line; leave empty to clear.")}
                </label>
                <textarea
                  id={preferencesId}
                  rows={5}
                  maxLength={4000}
                  value={preferences}
                  onChange={(event) => setPreferences(event.target.value)}
                />
                <div className="pa-actions">
                  <button className="pa-button primary" disabled={busy} onClick={() => void save()}>
                    {text("保存", "Save")}
                  </button>
                  <button className="pa-button" disabled={busy} onClick={() => setEditing(false)}>
                    {text("取消", "Cancel")}
                  </button>
                </div>
              </>
            ) : (
              <button className="pa-text-button" disabled={busy} onClick={() => void edit()}>
                <Pencil size={15} />
                {text("编辑助手偏好", "Edit assistant preferences")}
              </button>
            )}
            <p className="pa-note">
              {text(
                "修改会用于下一次新对话；本次对话保持原设定。",
                "Changes apply to new conversations. This conversation keeps its original settings.",
              )}
            </p>
            {saved && <p role="status">{text("偏好已保存。", "Preferences saved.")}</p>}
          </section>
          {error && (
            <p role="alert" className="pa-error">
              {error}
            </p>
          )}
        </aside>
      )}
    </>
  );
}
