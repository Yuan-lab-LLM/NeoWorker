import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowUpRight, NotebookPen, Search, Trash2, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import type { ReadingNote } from "../../shared/browser-reading";
import { loadReadingNotes, persistNotes } from "./reading-notes-store";
import "./browser-reading.css";

export function ReadingNotesList({
  notes,
  currentUrl,
  onOpen,
  onDelete,
}: {
  notes: ReadingNote[];
  currentUrl?: string;
  onOpen: (note: ReadingNote) => void;
  onDelete: (id: string) => void;
}) {
  const [scope, setScope] = useState(currentUrl ? "current" : "all");
  const [query, setQuery] = useState("");
  const filtered = notes
    .filter(
      (n) =>
        (scope === "all" ||
          n.url.split("#")[0] === currentUrl?.split("#")[0]) &&
        [n.title, n.text, n.quote, n.url]
          .join(" ")
          .toLowerCase()
          .includes(query.trim().toLowerCase()),
    )
    .slice()
    .reverse();
  return (
    <div className="br-notes-list">
      <div className="br-notes-filters">
        {currentUrl && (
          <div className="br-note-scopes" aria-label="笔记范围">
            <button
              aria-pressed={scope === "current"}
              onClick={() => setScope("current")}
            >
              本篇笔记
            </button>
            <button
              aria-pressed={scope === "all"}
              onClick={() => setScope("all")}
            >
              全部笔记
            </button>
          </div>
        )}
        <label className="br-note-search">
          <Search size={15} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索笔记、标题或来源"
            aria-label="搜索阅读笔记"
          />
        </label>
        <small>{filtered.length} 条笔记 · 保存在本机</small>
      </div>
      {!filtered.length && (
        <div className="br-empty">
          <NotebookPen size={28} />
          <h3>{query ? "没有找到匹配的笔记" : "还没有笔记"}</h3>
          <p>
            {query
              ? "换个关键词试试。"
              : "选中原文，或把助手的回答存为笔记，之后可以在这里找回。"}
          </p>
        </div>
      )}
      {filtered.map((note) => (
        <article className="br-note" key={note.id}>
          <header>
            <time>{new Date(note.createdAt).toLocaleDateString()}</time>
            <button
              title="删除笔记"
              aria-label="删除笔记"
              onClick={() => onDelete(note.id)}
            >
              <Trash2 size={14} />
            </button>
          </header>
          <button
            className="br-note-source"
            onClick={() => onOpen(note)}
            title={note.url}
          >
            {note.title || note.url}
            <ArrowUpRight size={14} />
          </button>
          {note.quote && note.quote !== note.text && (
            <blockquote>{note.quote}</blockquote>
          )}
          <div className="br-answer">
            <ReactMarkdown
              components={{
                a: ({ children }) => <span>{children}</span>,
                img: () => null,
              }}
            >
              {note.text}
            </ReactMarkdown>
          </div>
          <button className="br-text-button" onClick={() => onOpen(note)}>
            <ArrowUpRight size={13} />
            {note.page ? `打开原文 · 第 ${note.page} 页` : "打开原文"}
          </button>
        </article>
      ))}
    </div>
  );
}

export function ReadingNotesWorkspace({
  notes,
  onOpen,
  onDelete,
}: {
  notes: ReadingNote[];
  onOpen: (note: ReadingNote) => void;
  onDelete: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const filtered = notes
    .filter((note) =>
      [note.title, note.text, note.quote, note.url]
        .join(" ")
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
    )
    .slice()
    .reverse();
  const selected =
    filtered.find((note) => note.id === selectedId) || filtered[0];
  return (
    <div className="br-library-workspace">
      <aside className="br-library-sidebar" aria-label="笔记目录">
        <div className="br-library-search">
          <label className="br-note-search">
            <Search size={17} />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索笔记、标题或来源"
              aria-label="搜索阅读笔记"
            />
          </label>
          <small>{filtered.length} 条笔记 · 保存在本机</small>
        </div>
        <nav className="br-library-index" aria-label="选择阅读笔记">
          {filtered.map((note) => (
            <button
              key={note.id}
              className="br-library-entry"
              aria-current={selected?.id === note.id ? "true" : undefined}
              onClick={() => setSelectedId(note.id)}
            >
              <strong>{note.title || note.url}</strong>
              <span>{note.text.replace(/[#*`>]/g, "").slice(0, 140)}</span>
              <time>{new Date(note.createdAt).toLocaleDateString()}</time>
            </button>
          ))}
          {!filtered.length && (
            <p className="br-empty">
              {query
                ? "没有匹配的笔记，换个关键词试试。"
                : "还没有笔记。阅读时可将选文或回答存为笔记。"}
            </p>
          )}
        </nav>
      </aside>
      {selected ? (
        <section
          key={selected.id}
          className="br-library-reader"
          aria-label="笔记正文"
          tabIndex={0}
        >
          <div className="br-library-document">
            <div className="br-library-document-meta">
              <time>{new Date(selected.createdAt).toLocaleDateString()}</time>
              <button
                aria-label="删除当前笔记"
                title="删除当前笔记"
                onClick={() => onDelete(selected.id)}
              >
                <Trash2 size={16} />
              </button>
            </div>
            <h2>{selected.title || "阅读笔记"}</h2>
            <button
              className="br-note-source"
              onClick={() => onOpen(selected)}
              title={selected.url}
            >
              <ArrowUpRight size={15} />
              {selected.page
                ? `在 NeoWorker 中打开原文 · 第 ${selected.page} 页`
                : "在 NeoWorker 中打开原文"}
            </button>
            {selected.quote && selected.quote !== selected.text && (
              <details className="br-library-quote">
                <summary>引用原文</summary>
                <blockquote>{selected.quote}</blockquote>
              </details>
            )}
            <div className="br-answer">
              <ReactMarkdown
                components={{
                  a: ({ children }) => <span>{children}</span>,
                  img: () => null,
                }}
              >
                {selected.text}
              </ReactMarkdown>
            </div>
          </div>
        </section>
      ) : (
        <div className="br-library-reader br-library-empty">
          <NotebookPen size={40} />
          <h2>{query ? "没有匹配的笔记" : "开始积累你的阅读笔记"}</h2>
          <p>文章与论文中的摘录和想法，都可以在这里整理和回看。</p>
        </div>
      )}
    </div>
  );
}

export function ReadingNotesLibrary({
  onClose,
  onOpen,
}: {
  onClose: () => void;
  onOpen: (note: ReadingNote) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [notes, setNotes] = useState(loadReadingNotes);
  const [error, setError] = useState("");
  useEffect(() => {
    const element = dialog.current;
    const opener = document.activeElement;
    element?.showModal();
    return () => {
      element?.close();
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);
  return createPortal(
    <dialog
      ref={dialog}
      className="br-library br-assistant"
      aria-label="阅读笔记"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header className="br-header">
        <span>
          <NotebookPen size={20} />
          <strong>阅读笔记</strong>
        </span>
        <button title="关闭笔记" aria-label="关闭笔记" onClick={onClose}>
          <X size={20} />
        </button>
      </header>
      {error && (
        <p className="br-library-error" role="alert">
          {error}
        </p>
      )}
      <ReadingNotesWorkspace
        notes={notes}
        onOpen={onOpen}
        onDelete={(id) => {
          try {
            const next = loadReadingNotes().filter((note) => note.id !== id);
            persistNotes(next);
            setNotes(next);
            setError("");
          } catch {
            setError("删除失败，请重试。");
          }
        }}
      />
    </dialog>,
    document.body,
  );
}
