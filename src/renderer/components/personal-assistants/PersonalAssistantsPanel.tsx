import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  FileText,
  FolderOpen,
  MessageCircle,
  Plus,
  Presentation,
  Search,
  Settings2,
  Trash2,
  X,
  RefreshCw,
  Database,
} from "lucide-react";
import type {
  ManagedEnvironment,
  ManagedSession,
  ManagedSessionWorkpaperArtifact,
} from "../../../shared/types";
import { useLanguage } from "../../i18n";
import {
  assistantConversations,
  assistantProjects,
  assistantStudio,
  fileName,
  preferenceLines,
  type Assistant,
  type AssistantKind,
} from "./model";
import "./personal-assistants.css";

type Props = { onOpenTask: (id: string) => void | Promise<void>; children?: ReactNode };
type Draft = {
  id?: string;
  name: string;
  description: string;
  instructions: string;
  preferences: string;
  kind: AssistantKind;
};
type DialogState =
  | { type: "assistant"; draft: Draft }
  | { type: "project" }
  | { type: "conversation" };
const icons = { research: Search, documents: FileText, presentations: Presentation, custom: Bot };

export function AssistantDialog({
  title,
  busy,
  onClose,
  children,
}: {
  title: string;
  busy: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const language = useLanguage();
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="pa-dialog"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <header>
        <h2>{title}</h2>
        <button
          type="button"
          className="pa-icon-button"
          disabled={busy}
          onClick={onClose}
          aria-label={language === "zh-CN" ? "关闭" : "Close"}
        >
          <X size={20} />
        </button>
      </header>
      {children}
    </dialog>
  );
}

export function PersonalAssistantsPanel({ onOpenTask, children }: Props) {
  const language = useLanguage();
  const text = (zh: string, en: string) => (language === "zh-CN" ? zh : en);
  const [tab, setTab] = useState<"assistants" | "daily">("assistants");
  const [assistants, setAssistants] = useState<Assistant[]>([]);
  const [environments, setEnvironments] = useState<ManagedEnvironment[]>([]);
  const [sessions, setSessions] = useState<ManagedSession[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [projectId, setProjectId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [projectName, setProjectName] = useState("");
  const [files, setFiles] = useState<string[]>([]);
  const [prompt, setPrompt] = useState("");
  const [artifacts, setArtifacts] = useState<ManagedSessionWorkpaperArtifact[]>([]);
  const [artifactError, setArtifactError] = useState("");
  const [historyLimit, setHistoryLimit] = useState(8);
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    const request = ++requestRef.current;
    setLoading(true);
    setError("");
    try {
      const [agents, projects, runs] = await Promise.all([
        window.electronAPI.listManagedAgents({ limit: 1000 }),
        window.electronAPI.listManagedEnvironments({ limit: 1000, status: "active" }),
        window.electronAPI.listManagedSessions({ limit: 1000, surface: "runtime" }),
      ]);
      const details = await Promise.all(
        agents
          .filter((agent) => agent.status !== "archived")
          .map(async (agent) => {
            const detail = await window.electronAPI.getManagedAgent(agent.id);
            const version = detail?.currentVersion;
            return version && assistantStudio(version).personalAssistant
              ? { agent, version }
              : null;
          }),
      );
      if (request !== requestRef.current) return;
      setAssistants(details.filter((item): item is Assistant => item !== null));
      setEnvironments(projects);
      setSessions(runs);
    } catch (cause) {
      if (request === requestRef.current)
        setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
    return () => {
      requestRef.current++;
    };
  }, [load]);

  const selected = assistants.find((item) => item.agent.id === selectedId);
  const studio = selected ? assistantStudio(selected.version) : undefined;
  const projects = selected ? assistantProjects(environments, selected.agent.id) : [];
  const project = projects.find((item) => item.id === projectId) || projects[0];
  const history =
    selected && project ? assistantConversations(sessions, selected.agent.id, project.id) : [];
  const recent = [...sessions]
    .filter(
      (item) =>
        item.backingTaskId && assistants.some((assistant) => assistant.agent.id === item.agentId),
    )
    .sort((a, b) => b.updatedAt - a.updatedAt)[0];
  const latest = history[0];
  useEffect(() => {
    setHistoryLimit(8);
  }, [selectedId, project?.id]);
  useEffect(() => {
    let live = true;
    setArtifacts([]);
    setArtifactError("");
    if (latest)
      void window.electronAPI
        .getManagedSessionWorkpaper(latest.id)
        .then((paper) => {
          if (live) setArtifacts(paper.artifacts);
        })
        .catch((cause) => {
          if (live) setArtifactError(String(cause));
        });
    return () => {
      live = false;
    };
  }, [latest?.id, latest?.updatedAt]);

  const run = async (action: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  const openTask = (session: ManagedSession) =>
    void run(async () => {
      if (session.backingTaskId) await onOpenTask(session.backingTaskId);
    });
  const status = (value: ManagedSession["status"]) =>
    ({
      pending: text("等待中", "Pending"),
      running: text("运行中", "Running"),
      awaiting_input: text("等你回复", "Needs input"),
      interrupted: text("已中断", "Interrupted"),
      completed: text("已完成", "Completed"),
      failed: text("失败", "Failed"),
      cancelled: text("已取消", "Cancelled"),
    })[value];
  const date = (timestamp: number) =>
    new Date(timestamp).toLocaleString(language, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  const templates: Draft[] = [
    {
      kind: "research",
      name: text("竞品研究助手", "Research assistant"),
      description: text("查证来源，整理竞品差异。", "Verify sources and compare competitors."),
      instructions: text(
        "帮助我调研产品和竞品，先明确研究对象，再查证原始来源。区分事实、推断和待验证信息，不编造数字。按用户要求交付报告。",
        "Research products and competitors using primary sources. Distinguish verified facts, inferences and unknowns. Never invent figures. Deliver the requested report.",
      ),
      preferences: text("回答使用中文\n结论附原始来源", "Answer in English\nCite original sources"),
    },
    {
      kind: "documents",
      name: text("产品资料助手", "Product documentation assistant"),
      description: text("按规范编写与审校产品文档。", "Write and review product documentation."),
      instructions: text(
        "根据项目资料编写和审校产品文档。遵循提供的写作规范，保留产品型号、参数与引用，不擅自补造规格。",
        "Write and review documentation from project sources. Follow supplied style guidelines and preserve model names, specifications and citations. Never invent specifications.",
      ),
      preferences: text(
        "回答使用中文\n列出修改依据",
        "Answer in English\nExplain the basis for changes",
      ),
    },
    {
      kind: "presentations",
      name: text("演示文稿助手", "Presentation assistant"),
      description: text(
        "沿用品牌风格，制作演示文稿。",
        "Create presentations using your brand style.",
      ),
      instructions: text(
        "根据当前项目材料制作演示文稿。优先使用原材料中的图表和品牌模板，确保主题一致，检查布局与输出文件后再交付。",
        "Create presentations from the current project's materials. Reuse source figures and supplied brand templates. Keep the topic consistent and verify layout and output files before delivery.",
      ),
      preferences: text(
        "回答使用中文\n优先使用原材料中的图片",
        "Answer in English\nReuse source images",
      ),
    },
  ];
  const openCreate = (draft?: Draft) => {
    setError("");
    setDialog({
      type: "assistant",
      draft: draft || {
        kind: "custom",
        name: "",
        description: "",
        instructions: "",
        preferences: text("回答使用中文", "Answer in English"),
      },
    });
  };
  const openEdit = () => {
    if (!selected) return;
    setError("");
    setDialog({
      type: "assistant",
      draft: {
        id: selected.agent.id,
        name: selected.agent.name,
        description: selected.agent.description || "",
        instructions: selected.version.systemPrompt,
        preferences: studio?.personalAssistant?.preferences.join("\n") || "",
        kind: studio?.personalAssistant?.kind || "custom",
      },
    });
  };
  const saveAssistant = (event: FormEvent) => {
    event.preventDefault();
    if (dialog?.type !== "assistant") return;
    const draft = dialog.draft;
    void run(async () => {
      const existing = draft.id ? await window.electronAPI.getManagedAgent(draft.id) : null;
      if (draft.id && !existing?.currentVersion)
        throw new Error(text("助手已不可用，请刷新。", "Assistant unavailable. Please refresh."));
      const previous = existing?.currentVersion;
      const data = {
        name: draft.name.trim(),
        description: draft.description.trim(),
        systemPrompt: draft.instructions.trim(),
        executionMode: "solo" as const,
        metadata: {
          ...previous?.metadata,
          studio: {
            ...(previous ? assistantStudio(previous) : {}),
            personalAssistant: {
              kind: draft.kind,
              preferences: preferenceLines(draft.preferences),
            },
            memoryConfig: { mode: "disabled" },
          },
        },
      };
      const saved = draft.id
        ? await window.electronAPI.updateManagedAgent({ ...data, agentId: draft.id })
        : await window.electronAPI.createManagedAgent(data);
      setSelectedId(saved.agent.id);
      setDialog(null);
      await load();
    });
  };
  const addFiles = () =>
    void run(async () => {
      const chosen = await window.electronAPI.selectFiles();
      setFiles((current) =>
        [...new Set([...current, ...chosen.map((file) => file.path)])].slice(0, 30),
      );
    });
  const saveProject = (event: FormEvent) => {
    event.preventDefault();
    if (!selected) return;
    void run(async () => {
      const saved = await window.electronAPI.createPersonalAssistantProject({
        agentId: selected.agent.id,
        name: projectName.trim(),
        filePaths: files,
      });
      setEnvironments((current) => [saved, ...current]);
      setProjectId(saved.id);
      setDialog(null);
      setPrompt("");
    });
  };
  const startConversation = (event: FormEvent) => {
    event.preventDefault();
    if (!selected || !project || !prompt.trim()) return;
    void run(async () => {
      const session = await window.electronAPI.createManagedSession({
        agentId: selected.agent.id,
        environmentId: project.id,
        title: prompt.trim().slice(0, 80),
        surface: "runtime",
        initialEvent: { type: "user.message", content: [{ type: "text", text: prompt.trim() }] },
      });
      setSessions((current) => [session, ...current]);
      setDialog(null);
      setPrompt("");
      if (session.backingTaskId) await onOpenTask(session.backingTaskId);
    });
  };
  const createProject = () => {
    setProjectName("");
    setFiles([]);
    setError("");
    setDialog({ type: "project" });
  };
  const errorBox = error && (
    <div className="pa-error" role="alert">
      {error}
    </div>
  );

  return (
    <section className="pa-root">
      {children && (
        <nav className="pa-tabs" aria-label={text("日常助理", "Daily assistant")}>
          <button
            className={tab === "assistants" ? "active" : ""}
            onClick={() => setTab("assistants")}
          >
            {text("我的助手", "My assistants")}
          </button>
          <button className={tab === "daily" ? "active" : ""} onClick={() => setTab("daily")}>
            {text("今日助理", "Daily overview")}
          </button>
        </nav>
      )}
      {tab === "daily" ? (
        children
      ) : (
        <main className="pa-content">
          <div className="pa-breadcrumb">
            {text("日常助理", "Daily assistant")}
            <span>/</span>
            <button onClick={() => setSelectedId(null)}>{text("我的助手", "My assistants")}</button>
            {selected && (
              <>
                <span>/</span>
                {selected.agent.name}
              </>
            )}
          </div>
          <header className="pa-page-header">
            <div>
              {selected && (
                <button className="pa-back" onClick={() => setSelectedId(null)}>
                  <ArrowLeft size={16} />
                  {text("全部助手", "All assistants")}
                </button>
              )}
              <h1>{selected ? selected.agent.name : text("我的助手", "My assistants")}</h1>
              <p>
                {selected
                  ? selected.agent.description
                  : text(
                      "把熟悉的工作，交给熟悉的助手。",
                      "Familiar work, with an assistant that knows your preferences.",
                    )}
              </p>
            </div>
            <div className="pa-actions">
              <button
                className="pa-icon-button"
                onClick={() => void load()}
                disabled={busy || loading}
                aria-label={text("刷新", "Refresh")}
              >
                <RefreshCw size={18} />
              </button>
              <button
                className="pa-button"
                onClick={selected ? openEdit : () => openCreate()}
                disabled={busy}
              >
                {selected ? <Settings2 size={17} /> : <Plus size={18} />}
                {selected
                  ? text("助手设置", "Assistant settings")
                  : text("创建助手", "Create assistant")}
              </button>
            </div>
          </header>
          {!dialog && errorBox}
          {loading ? (
            <p role="status" className="pa-muted">
              {text("正在加载助手…", "Loading assistants…")}
            </p>
          ) : !selected ? (
            <>
              {recent && (
                <section className="pa-resume">
                  <div>
                    <span className="pa-eyebrow">
                      {text("接着上次的工作", "Pick up where you left off")}
                    </span>
                    <h2>{recent.title}</h2>
                    <p>
                      {assistants.find((item) => item.agent.id === recent.agentId)?.agent.name} ·{" "}
                      {date(recent.updatedAt)}
                    </p>
                    <span className={`pa-status ${recent.status}`}>{status(recent.status)}</span>
                  </div>
                  <button
                    className="pa-button primary"
                    disabled={busy}
                    onClick={() => openTask(recent)}
                  >
                    {text("继续对话", "Continue conversation")}
                    <ArrowRight size={18} />
                  </button>
                </section>
              )}
              {!assistants.length && (
                <div className="pa-intro">
                  <span className="pa-eyebrow">
                    {text("从一个常用工作开始", "Start with something you do often")}
                  </span>
                  <h2>{text("设定一次，下次接着做。", "Set up once. Continue next time.")}</h2>
                  <p>
                    {text(
                      "选择下方模板创建助手，再添加一个项目和资料。助手会保留你的要求，每个项目分别保存对话与成果。",
                      "Choose a starter below, then add a project and its sources. Your assistant keeps your instructions; each project keeps its conversations and results.",
                    )}
                  </p>
                </div>
              )}
              <section className="pa-library">
                <h2>
                  {assistants.length
                    ? text("选择一个助手", "Choose an assistant")
                    : text("选择一个起点", "Choose a starting point")}
                </h2>
                <div className="pa-grid">
                  {assistants.map((item) => {
                    const config = assistantStudio(item.version).personalAssistant!;
                    const Icon = icons[config.kind] || Bot;
                    const count = assistantProjects(environments, item.agent.id).length;
                    return (
                      <article className="pa-card" key={item.agent.id}>
                        <span className="pa-card-icon">
                          <Icon size={29} />
                        </span>
                        <h3>{item.agent.name}</h3>
                        <p>{item.agent.description}</p>
                        <span className="pa-card-meta">
                          <Database size={15} />
                          {text(
                            `${count} 个项目 · ${config.preferences.length} 条偏好`,
                            `${count} projects · ${config.preferences.length} preferences`,
                          )}
                        </span>
                        <button
                          onClick={() => {
                            setSelectedId(item.agent.id);
                            setProjectId("");
                          }}
                          disabled={busy}
                        >
                          {text("打开助手", "Open assistant")}
                          <ArrowRight size={18} />
                        </button>
                      </article>
                    );
                  })}
                  {!assistants.length &&
                    templates.map((draft) => {
                      const Icon = icons[draft.kind];
                      return (
                        <article className="pa-card" key={draft.kind}>
                          <span className="pa-card-icon">
                            <Icon size={29} />
                          </span>
                          <h3>{draft.name}</h3>
                          <p>{draft.description}</p>
                          <span className="pa-card-meta">
                            {text("名称和要求都可以修改", "Customize the name and instructions")}
                          </span>
                          <button onClick={() => openCreate(draft)}>
                            {text("使用这个模板", "Use this starter")}
                            <ArrowRight size={18} />
                          </button>
                        </article>
                      );
                    })}
                </div>
              </section>
              <p className="pa-footnote">
                {text(
                  "助手设定会保留，每个研究主题都有独立的项目资料和对话。",
                  "Assistant settings persist. Keep each topic's materials and conversations in its own project.",
                )}
              </p>
            </>
          ) : (
            <div className="pa-workspace">
              <div className="pa-work-main">
                <div className="pa-project-picker">
                  <FolderOpen size={18} />
                  <label htmlFor="pa-project-select">{text("当前项目", "Project")}</label>
                  {project ? (
                    <select
                      id="pa-project-select"
                      value={project.id}
                      onChange={(event) => setProjectId(event.target.value)}
                    >
                      {projects.map((item) => (
                        <option value={item.id} key={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="pa-muted">{text("尚未添加", "No project yet")}</span>
                  )}
                  <button className="pa-text-button" onClick={createProject} disabled={busy}>
                    <Plus size={16} />
                    {text("新建项目", "New project")}
                  </button>
                </div>
                <section className="pa-project-hero">
                  <h2>
                    {project
                      ? latest
                        ? text("从上次停下的地方继续", "Continue where you left off")
                        : text("项目准备好了", "Your project is ready")
                      : text("先为这项工作建一个项目", "Give this work a project")}
                  </h2>
                  <p>
                    {latest
                      ? latest.title
                      : project
                        ? text(
                            "资料已单独保存。说说你想完成什么，助手就会在这个项目里工作。",
                            "Sources are saved separately. Tell your assistant what to work on in this project.",
                          )
                        : text(
                            "例如“EPAI 竞品研究”。关联资料后，后续对话与成果都会留在这里。",
                            "For example, “EPAI competitor research”. Add sources to keep this topic's conversations and results together.",
                          )}
                  </p>
                  {latest && (
                    <p className="pa-muted">
                      {date(latest.updatedAt)} · {status(latest.status)}
                    </p>
                  )}
                  <div className="pa-actions">
                    <button
                      className="pa-button primary"
                      disabled={busy || selected.agent.status === "suspended"}
                      onClick={() =>
                        project
                          ? latest
                            ? openTask(latest)
                            : (setError(""), setDialog({ type: "conversation" }))
                          : createProject()
                      }
                    >
                      {project
                        ? latest
                          ? text("继续对话", "Continue conversation")
                          : text("开始对话", "Start conversation")
                        : text("创建项目", "Create project")}
                      <ArrowRight size={18} />
                    </button>
                    {latest && (
                      <button
                        className="pa-button"
                        disabled={busy || selected.agent.status === "suspended"}
                        onClick={() => {
                          setError("");
                          setPrompt("");
                          setDialog({ type: "conversation" });
                        }}
                      >
                        {text("新对话", "New conversation")}
                      </button>
                    )}
                  </div>
                </section>
                <section className="pa-list-section">
                  <h2>{text("最近对话", "Recent conversations")}</h2>
                  {!history.length ? (
                    <p className="pa-muted">
                      {text("开始后，对话会保存在这里。", "Your conversations will appear here.")}
                    </p>
                  ) : (
                    history.slice(0, historyLimit).map((session) => (
                      <button
                        className="pa-history-row"
                        key={session.id}
                        onClick={() => openTask(session)}
                        disabled={busy}
                      >
                        <MessageCircle size={18} />
                        <span>
                          {session.title}
                          <small>{date(session.updatedAt)}</small>
                        </span>
                        <span className={`pa-status ${session.status}`}>
                          {status(session.status)}
                        </span>
                        <ArrowRight size={16} />
                      </button>
                    ))
                  )}
                  {history.length > historyLimit && (
                    <button
                      className="pa-text-button"
                      onClick={() => setHistoryLimit((limit) => limit + 12)}
                    >
                      {text("查看更多", "Show more")}
                    </button>
                  )}
                </section>
                <section className="pa-list-section">
                  <h2>{text("上次对话的成果", "Results from the last conversation")}</h2>
                  {artifactError ? (
                    <p className="pa-error" role="alert">
                      {artifactError}
                    </p>
                  ) : !artifacts.length ? (
                    <p className="pa-muted">
                      {text("还没有已记录的成果文件。", "No recorded output files yet.")}
                    </p>
                  ) : (
                    artifacts.map((artifact) => (
                      <button
                        className="pa-file-row"
                        key={artifact.artifactId}
                        onClick={() =>
                          void run(async () => {
                            const failure = await window.electronAPI.openFile(artifact.path);
                            if (failure) throw new Error(failure);
                          })
                        }
                      >
                        <FileText size={19} />
                        <span>{artifact.label || fileName(artifact.path)}</span>
                        <ArrowRight size={16} />
                      </button>
                    ))
                  )}
                </section>
              </div>
              <aside className="pa-context">
                <section>
                  <h2>{text("这个项目的资料", "Project sources")}</h2>
                  <p className="pa-muted">
                    {project?.name || text("创建项目后添加", "Create a project to add sources")}
                  </p>
                  {project?.config.filePaths?.length ? (
                    project.config.filePaths.map((path) => (
                      <button
                        key={path}
                        className="pa-file-row"
                        title={path}
                        onClick={() =>
                          void run(async () => {
                            const failure = await window.electronAPI.openFile(path);
                            if (failure) throw new Error(failure);
                          })
                        }
                      >
                        <FileText size={18} />
                        <span>{fileName(path)}</span>
                      </button>
                    ))
                  ) : (
                    <p className="pa-empty-copy">
                      {text(
                        "暂无资料。新建项目时可以选择本地文件。",
                        "No sources yet. Choose local files when creating a project.",
                      )}
                    </p>
                  )}
                </section>
                <section>
                  <h2>{text("保存的偏好", "Saved preferences")}</h2>
                  {studio?.personalAssistant?.preferences.length ? (
                    <ul>
                      {studio.personalAssistant.preferences.map((preference, index) => (
                        <li key={index}>{preference}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="pa-muted">{text("暂无偏好", "No saved preferences")}</p>
                  )}
                  <button className="pa-text-button" onClick={openEdit}>
                    <Settings2 size={16} />
                    {text("编辑偏好与要求", "Edit preferences and instructions")}
                  </button>
                  <p className="pa-note">
                    {text(
                      "由你填写并保存；修改会用于下一次新对话。已有对话保留开始时的设定。",
                      "Saved by you. Changes apply to new conversations; existing conversations keep their starting settings.",
                    )}
                  </p>
                </section>
              </aside>
            </div>
          )}
        </main>
      )}
      {dialog && (
        <AssistantDialog
          title={
            dialog.type === "assistant"
              ? dialog.draft.id
                ? text("助手设置", "Assistant settings")
                : text("创建助手", "Create assistant")
              : dialog.type === "project"
                ? text("新建项目", "New project")
                : text("开始新对话", "Start a new conversation")
          }
          busy={busy}
          onClose={() => {
            setDialog(null);
            setError("");
          }}
        >
          <form
            onSubmit={
              dialog.type === "assistant"
                ? saveAssistant
                : dialog.type === "project"
                  ? saveProject
                  : startConversation
            }
          >
            {dialog.type === "assistant" ? (
              <>
                <label>
                  {text("助手名称", "Assistant name")}
                  <input
                    autoFocus
                    required
                    maxLength={80}
                    value={dialog.draft.name}
                    onChange={(event) =>
                      setDialog({ ...dialog, draft: { ...dialog.draft, name: event.target.value } })
                    }
                  />
                </label>
                <label>
                  {text("一句话介绍", "Short description")}
                  <input
                    maxLength={180}
                    value={dialog.draft.description}
                    onChange={(event) =>
                      setDialog({
                        ...dialog,
                        draft: { ...dialog.draft, description: event.target.value },
                      })
                    }
                  />
                </label>
                <label>
                  {text("希望它怎么工作", "How should it work?")}
                  <textarea
                    required
                    rows={4}
                    maxLength={12000}
                    value={dialog.draft.instructions}
                    placeholder={text(
                      "它负责什么？应该遵循哪些要求？",
                      "What does it do? Which instructions should it follow?",
                    )}
                    onChange={(event) =>
                      setDialog({
                        ...dialog,
                        draft: { ...dialog.draft, instructions: event.target.value },
                      })
                    }
                  />
                </label>
                <label>
                  {text("保存的偏好（每行一条）", "Saved preferences (one per line)")}
                  <textarea
                    rows={3}
                    maxLength={4000}
                    value={dialog.draft.preferences}
                    onChange={(event) =>
                      setDialog({
                        ...dialog,
                        draft: { ...dialog.draft, preferences: event.target.value },
                      })
                    }
                  />
                </label>
                <p className="pa-note">
                  {text(
                    "模型和权限沿用应用当前设置；新对话使用最新助手设定。",
                    "Uses the app's model and permission settings. New conversations use the latest assistant configuration.",
                  )}
                </p>
              </>
            ) : dialog.type === "project" ? (
              <>
                <label>
                  {text("项目名称", "Project name")}
                  <input
                    autoFocus
                    required
                    maxLength={160}
                    value={projectName}
                    onChange={(event) => setProjectName(event.target.value)}
                    placeholder={text(
                      "例如：EPAI 竞品研究",
                      "For example: EPAI competitor research",
                    )}
                  />
                </label>
                <p className="pa-note">
                  {text(
                    "会创建独立的本地文件夹，并复制所选资料。原文件不会被修改。",
                    "Creates a separate local folder and copies selected sources. Original files stay unchanged.",
                  )}
                </p>
                <button
                  className="pa-button"
                  type="button"
                  onClick={addFiles}
                  disabled={busy || files.length >= 30}
                >
                  <Plus size={17} />
                  {text("选择资料", "Choose sources")}
                </button>
                <div className="pa-selected-files">
                  {files.map((path) => (
                    <div className="pa-file-row" key={path}>
                      <FileText size={17} />
                      <span title={path}>{fileName(path)}</span>
                      <button
                        type="button"
                        className="pa-icon-button"
                        onClick={() =>
                          setFiles((current) => current.filter((file) => file !== path))
                        }
                        disabled={busy}
                        aria-label={text(`移除 ${fileName(path)}`, `Remove ${fileName(path)}`)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <>
                <p className="pa-note">
                  <FolderOpen size={16} /> {project?.name} · {selected?.agent.name}
                </p>
                <label>
                  {text("这次想完成什么？", "What would you like to do?")}
                  <textarea
                    autoFocus
                    required
                    rows={5}
                    value={prompt}
                    maxLength={24000}
                    placeholder={text(
                      "例如：核对竞品资料，整理一份有来源的对比报告。",
                      "For example: verify competitor sources and prepare a cited comparison report.",
                    )}
                    onChange={(event) => setPrompt(event.target.value)}
                  />
                </label>
              </>
            )}
            {errorBox}
            <footer>
              <button
                className="pa-button"
                type="button"
                disabled={busy}
                onClick={() => {
                  setDialog(null);
                  setError("");
                }}
              >
                {text("取消", "Cancel")}
              </button>
              <button
                className="pa-button primary"
                type="submit"
                disabled={
                  busy ||
                  (dialog.type === "assistant"
                    ? !dialog.draft.name.trim() || !dialog.draft.instructions.trim()
                    : dialog.type === "project"
                      ? !projectName.trim()
                      : !prompt.trim())
                }
              >
                {busy
                  ? text("正在保存…", "Working…")
                  : dialog.type === "conversation"
                    ? text("开始", "Start")
                    : text("保存", "Save")}
              </button>
            </footer>
          </form>
        </AssistantDialog>
      )}
    </section>
  );
}
