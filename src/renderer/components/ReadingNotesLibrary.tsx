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
    element?.showModal();
    return () => element?.close();
  }, []);
  return createPortal(
    <dialog
      ref={dialog}
      className="br-library br-assistant"
      aria-label="阅读笔记"
      onCancel={onClose}
    >
      <header className="br-header">
        <span>
          <NotebookPen size={20} />
          <strong>阅读笔记</strong>
        </span>
        <button
          autoFocus
          title="关闭笔记"
          aria-label="关闭笔记"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </header>
      <div className="br-library-body">
        <p className="br-note-intro">
          所有文章与论文的笔记，都在这里。点击来源可回到 NeoWorker 浏览器阅读。
        </p>
        {error && <p role="alert">{error}</p>}
        <ReadingNotesList
          notes={notes}
          onOpen={onOpen}
          onDelete={(id) => {
            try {
              const next = loadReadingNotes().filter((n) => n.id !== id);
              persistNotes(next);
              setNotes(next);
            } catch {
              setError("删除失败，请重试。");
            }
          }}
        />
      </div>
    </dialog>,
    document.body,
  );
}
