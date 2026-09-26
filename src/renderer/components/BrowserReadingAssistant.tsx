import { ReadingNotesList } from "./ReadingNotesLibrary";
import { loadReadingNotes, persistNotes } from "./reading-notes-store";
import { PanelResizeHandle, usePanelWidth } from "./PanelResizeHandle";
import { readingToolbarPosition } from "./reading-toolbar-position";
import { useEffect, useRef, useState, type RefObject } from "react";
import {
  ArrowUp,
  BookOpen,
  Check,
  Languages,
  LoaderCircle,
  MessageSquare,
  NotebookPen,
  Plus,
  Quote,
  Square,
  X,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import {
  scopeLabel,
  type ReadingAction,
  type ReadingAnswer,
  type ReadingBlock,
} from "../../shared/browser-reading";
import "./browser-reading.css";

function sourceKey(url: string) {
  return url.split("#")[0];
}
// Chromium PDF selection is probed through the owned viewer in the main process.
// HTML pages also support a lightweight selection probe; never send it to a model automatically.
function selectionProbe() {
  if (
    document.activeElement?.matches("input,textarea,[contenteditable='true']")
  )
    return null;
  const selection = window.getSelection();
  const text = selection?.toString().trim();
  if (!text || !selection?.rangeCount || text.length > 12000) return null;
  const rect = selection.getRangeAt(0).getBoundingClientRect();
  return { text, x: rect.left + Math.min(rect.width / 2, 160), y: rect.bottom };
}
interface Guest {
  executeJavaScript: (code: string) => Promise<unknown>;
  addEventListener: (name: string, listener: (event: any) => void) => void;
  removeEventListener: (name: string, listener: (event: any) => void) => void;
  findInPage: (text: string) => void;
  loadURL: (url: string) => void;
  getBoundingClientRect: () => DOMRect;
}
interface Props {
  taskId: string;
  sessionId: string;
  url: string;
  title: string;
  ready: boolean;
  open: boolean;
  onOpen: (open: boolean) => void;
  webviewRef: RefObject<Guest | null>;
}
interface Turn {
  id: string;
  question: string;
  result: ReadingAnswer;
  saved?: boolean;
}
interface Selection {
  text: string;
  x: number;
  y: number;
  coordinateSpace?: "guest" | "host";
}
export function BrowserReadingAssistant({
  taskId,
  sessionId,
  url,
  title,
  ready,
  open,
  onOpen,
  webviewRef,
}: Props) {
  const [panelWidth, setPanelWidth] = usePanelWidth(
    "neoworker.reading-width",
    38,
  );
  const [tab, setTab] = useState<"ask" | "notes">("ask");
  const [selection, setSelection] = useState<Selection | null>(null);
  const [quote, setQuote] = useState("");
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");
  const [notes, setNotes] = useState(loadReadingNotes);
  const [draft, setDraft] = useState("");
  const [popover, setPopover] = useState<ReadingAnswer | null>(null);
  const requestRef = useRef<string | null>(null);
  const dismissedSelection = useRef("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const pdf = /\.pdf(?:$|[?#])|arxiv\.org\/pdf\//i.test(url);
  const sourceNotes = notes.filter((n) => sourceKey(n.url) === sourceKey(url));
  const latest = turns.at(-1)?.result;

  const stop = () => {
    if (requestRef.current)
      void window.electronAPI
        .cancelBrowserReading(requestRef.current)
        .catch(() => {});
    requestRef.current = null;
    setPending("");
  };
  useEffect(
    () => () => {
      if (requestRef.current)
        void window.electronAPI
          .cancelBrowserReading(requestRef.current)
          .catch(() => {});
      requestRef.current = null;
    },
    [],
  );
  useEffect(() => {
    if (open && tab === "notes") setNotes(loadReadingNotes());
  }, [open, tab]);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "nearest" });
  }, [turns.length, pending]);
  useEffect(() => {
    const guest = webviewRef.current;
    if (!guest) return;
    let live = true,
      probing = false;
    const offer = (value: Selection | null) => {
      if (!live || requestRef.current) return;
      if (!value) {
        dismissedSelection.current = "";
        setSelection(null);
        return;
      }
      if (value.text !== dismissedSelection.current) {
        const bounds = guest.getBoundingClientRect();
        const x =
          value.x - (value.coordinateSpace === "host" ? bounds.left : 0);
        const y = value.y - (value.coordinateSpace === "host" ? bounds.top : 0);
        if (x < 0 || y < 0 || x > bounds.width || y > bounds.height) {
          setSelection(null);
          return;
        }
        setSelection({
          ...value,
          ...readingToolbarPosition(x, y, bounds.width, bounds.height),
        });
      }
    };
    const contextMenu = (event: {
      params?: {
        selectionText?: string;
        x: number;
        y: number;
        isEditable?: boolean;
      };
    }) => {
      const p = event.params;
      if (!p?.isEditable && p?.selectionText?.trim()) {
        dismissedSelection.current = "";
        offer({ text: p.selectionText.slice(0, 12000), x: p.x, y: p.y });
      }
    };
    guest.addEventListener("context-menu", contextMenu);
    const unsubscribe = window.electronAPI.onBrowserReadingSelection?.(
      (data) => {
        if (
          !pdf ||
          (sourceKey(data.pageURL) !== sourceKey(url) &&
            sourceKey(data.frameURL) !== sourceKey(url) &&
            !data.frameURL.startsWith(
              "chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai/",
            ))
        )
          return;
        const bounds = guest.getBoundingClientRect();
        if (
          data.x < bounds.left ||
          data.x > bounds.right ||
          data.y < bounds.top ||
          data.y > bounds.bottom
        )
          return;
        dismissedSelection.current = "";
        offer({
          text: data.text,
          x: data.x - bounds.left,
          y: data.y - bounds.top,
        });
      },
    );
    const timer = setInterval(
      async () => {
        if (probing || document.hidden) return;
        probing = true;
        try {
          offer(
            pdf
              ? ((await window.electronAPI.getBrowserReadingSelection?.({
                  taskId,
                  sessionId,
                  url,
                })) ?? null)
              : ((await guest.executeJavaScript(
                  `(${selectionProbe.toString()})()`,
                )) as Selection | null),
          );
        } catch {
          /* Loading or restricted guest. */
        } finally {
          probing = false;
        }
      },
      pdf ? 250 : 750,
    );
    return () => {
      live = false;
      clearInterval(timer);
      unsubscribe?.();
      guest.removeEventListener("context-menu", contextMenu);
    };
  }, [webviewRef, pdf, ready, taskId, sessionId, url]);

  function dismissSelection() {
    dismissedSelection.current = selection?.text || "";
    setSelection(null);
  }
  function saveNote(text: string, cited?: string, notePage?: number) {
    const cleaned = text.trim();
    if (!cleaned) return;
    const existingNotes = loadReadingNotes();
    if (cleaned.length > 20000 || existingNotes.length >= 500) {
      setError("笔记已达到保存上限，请删除一些旧笔记后重试。");
      return;
    }
    const next = [
      ...existingNotes,
      {
        id: crypto.randomUUID(),
        url: sourceKey(url),
        title: title || new URL(url).hostname,
        text: cleaned,
        quote: cited,
        page: notePage,
        createdAt: Date.now(),
      },
    ];
    try {
      persistNotes(next);
      setNotes(next);
      setDraft("");
      setError("");
      return true;
    } catch {
      setError("本机存储空间不足，笔记未保存。请先复制内容。");
      return false;
    }
  }
  function locate(block: ReadingBlock) {
    if (block.page)
      webviewRef.current?.loadURL(`${sourceKey(url)}#page=${block.page}`);
    else webviewRef.current?.findInPage(block.text.slice(0, 100));
  }
  async function ask(
    action: ReadingAction,
    text: string,
    selected = quote,
    floating = false,
  ) {
    if (!text.trim() || requestRef.current) return;
    const id = crypto.randomUUID();
    requestRef.current = id;
    setPending(text);
    setError("");
    setPopover(null);
    dismissSelection();
    if (selected) setQuote(selected);
    if (!floating) {
      onOpen(true);
      setTab("ask");
    }
    try {
      const result = await window.electronAPI.askBrowserReading({
        requestId: id,
        taskId,
        sessionId,
        url,
        action,
        question: text,
        selection: selected || undefined,
        history: turns.slice(-3).map((t) => ({
          question: t.question,
          answer: t.result.text.slice(0, 12000),
        })),
      });
      if (requestRef.current !== id) return;
      if (floating) setPopover(result);
      setTurns((old) => [...old, { id, question: text, result }]);
      setQuestion("");
    } catch (e) {
      if (requestRef.current === id) {
        setError(
          e instanceof Error
            ? e.message.replace(
                /^Error invoking remote method '[^']+': (Error: )?/,
                "",
              )
            : "读取失败，请重试",
        );
        onOpen(true);
        setTab("ask");
      }
    } finally {
      if (requestRef.current === id) {
        requestRef.current = null;
        setPending("");
      }
    }
  }
  return (
    <>
      {selection && (
        <div
          className="br-selection-tools"
          style={{
            left: Math.max(12, selection.x),
            top: selection.y,
          }}
          role="toolbar"
          aria-label="选文操作"
        >
          <button
            onClick={() =>
              void ask("translate", "翻译这段文字", selection.text, true)
            }
          >
            <Languages size={15} />
            翻译
          </button>
          <button
            onClick={() => {
              setQuote(selection.text);
              void ask("explain", "解释这段文字", selection.text);
            }}
          >
            <BookOpen size={15} />
            解释
          </button>
          <button
            onClick={() => {
              setQuote(selection.text);
              onOpen(true);
              setTab("ask");
              dismissSelection();
              setTimeout(() => inputRef.current?.focus(), 0);
            }}
          >
            <MessageSquare size={15} />
            提问
          </button>
          <button
            onClick={() => {
              if (saveNote(selection.text, selection.text)) {
                onOpen(true);
                setTab("notes");
                dismissSelection();
              }
            }}
          >
            <NotebookPen size={15} />
            记笔记
          </button>
          <button aria-label="关闭选文操作" onClick={dismissSelection}>
            <X size={14} />
          </button>
        </div>
      )}
      {!open && pending && (
        <div className="br-floating br-working" role="status">
          <LoaderCircle className="br-spin" size={16} />
          正在翻译选文…<button onClick={stop}>停止</button>
        </div>
      )}
      {!open && popover && (
        <div className="br-floating br-translation">
          <header>
            <Languages size={16} />
            <strong>选文翻译</strong>
            <button aria-label="关闭翻译" onClick={() => setPopover(null)}>
              <X size={16} />
            </button>
          </header>
          <div className="br-answer">
            <ReactMarkdown
              components={{
                a: ({ children }) => <span>{children}</span>,
                img: () => null,
              }}
            >
              {popover.text}
            </ReactMarkdown>
          </div>
          <button
            className="br-text-button"
            onClick={() => {
              onOpen(true);
              setPopover(null);
            }}
          >
            在阅读助手中继续提问
          </button>
        </div>
      )}
      {open && (
        <aside
          className="br-assistant"
          style={{ "--reading-width": `${panelWidth}%` } as React.CSSProperties}
          aria-label="阅读助手"
        >
          <PanelResizeHandle
            value={panelWidth}
            onChange={setPanelWidth}
            label="调整阅读助手宽度"
            min={25}
            max={70}
          />
          <header className="br-header">
            <span>
              <BookOpen size={18} />
              <strong>阅读助手</strong>
            </span>
            <div className="br-header-actions">
              <button
                title="关闭阅读助手"
                aria-label="收起阅读助手"
                onClick={() => {
                  onOpen(false);
                }}
              >
                <X size={17} />
              </button>
            </div>
          </header>
          <div className="br-tabs" role="tablist" aria-label="阅读工具">
            <button
              role="tab"
              aria-selected={tab === "ask"}
              onClick={() => setTab("ask")}
            >
              <MessageSquare size={15} />
              问答
            </button>
            <button
              role="tab"
              aria-selected={tab === "notes"}
              onClick={() => setTab("notes")}
            >
              <NotebookPen size={15} />
              笔记
              {sourceNotes.length > 0 && <small>{sourceNotes.length}</small>}
            </button>
          </div>
          <div className="br-source">
            <span className="br-source-dot" />
            <span title={title || url}>{title || new URL(url).hostname}</span>
          </div>
          {tab === "ask" ? (
            <>
              <div className="br-scope">
                <Quote size={13} />
                {quote
                  ? "已选中段落"
                  : pdf
                    ? "基于 PDF 全文提问"
                    : "基于网页已加载正文"}
              </div>
              <div className="br-conversation" role="log" aria-label="阅读问答">
                {!turns.length && !pending && (
                  <div className="br-empty">
                    <BookOpen size={28} />
                    <h3>边读，边弄明白</h3>
                    <p>
                      {pdf
                        ? "围绕整篇论文提问，也可以选中文字，翻译、解释和记笔记。"
                        : "选中原文即可翻译、解释，也可以直接问这篇文章。"}
                    </p>
                    {[
                      "这篇内容主要讲了什么？",
                      "有哪些关键观点和依据？",
                      "有哪些值得注意的局限？",
                    ].map((q) => (
                      <button
                        key={q}
                        onClick={() =>
                          void ask(
                            "ask",
                            pdf
                              ? q
                                  .replace("这篇内容", "这篇论文")
                                  .replace("这篇文章", "这篇论文")
                              : q,
                          )
                        }
                      >
                        {q}
                        <Plus size={14} />
                      </button>
                    ))}
                  </div>
                )}
                {turns.map((turn) => (
                  <div className="br-turn" key={turn.id}>
                    <div className="br-question">{turn.question}</div>
                    <div className="br-answer">
                      <ReactMarkdown
                        components={{
                          a: ({ children }) => <span>{children}</span>,
                          img: () => null,
                        }}
                      >
                        {turn.result.text}
                      </ReactMarkdown>
                    </div>
                    <div className="br-references">
                      <span>{scopeLabel(turn.result.context)}</span>
                      {turn.result.context.blocks
                        .filter((b) => turn.result.text.includes(`[${b.id}]`))
                        .slice(0, 6)
                        .map((b) => (
                          <button
                            title="定位到原文"
                            key={b.id}
                            onClick={() => locate(b)}
                          >
                            {b.id}
                          </button>
                        ))}
                    </div>
                    <button
                      className="br-text-button"
                      disabled={turn.saved}
                      onClick={() => {
                        if (
                          saveNote(
                            turn.result.text,
                            (
                              turn.result.context.blocks.find((b) =>
                                turn.result.text.includes(`[${b.id}]`),
                              ) || turn.result.context.blocks[0]
                            )?.text,
                            turn.result.context.blocks.find((b) =>
                              turn.result.text.includes(`[${b.id}]`),
                            )?.page,
                          )
                        )
                          setTurns((old) =>
                            old.map((t) =>
                              t.id === turn.id ? { ...t, saved: true } : t,
                            ),
                          );
                      }}
                    >
                      {turn.saved ? (
                        <Check size={14} />
                      ) : (
                        <NotebookPen size={14} />
                      )}
                      {turn.saved ? "已存为笔记" : "存为笔记"}
                    </button>
                  </div>
                ))}
                {pending && (
                  <div className="br-pending" role="status">
                    <div className="br-question">{pending}</div>
                    <p>
                      <LoaderCircle className="br-spin" size={16} />
                      正在读取并整理回答<span className="br-dots">…</span>
                    </p>
                    <small>使用当前配置的模型</small>
                  </div>
                )}
                {error && (
                  <div className="br-error" role="alert">
                    {error}
                    <button
                      onClick={() => {
                        setError("");
                        inputRef.current?.focus();
                      }}
                    >
                      继续提问
                    </button>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>
              <form
                className="br-compose"
                onSubmit={(e) => {
                  e.preventDefault();
                  void ask("ask", question);
                }}
              >
                {quote && (
                  <div className="br-quote">
                    <Quote size={13} />
                    <span title={quote}>{quote}</span>
                    <button
                      type="button"
                      aria-label="取消引用段落"
                      onClick={() => setQuote("")}
                    >
                      <X size={13} />
                    </button>
                  </div>
                )}
                <textarea
                  ref={inputRef}
                  aria-label="向阅读助手提问"
                  placeholder={
                    quote
                      ? "问问这段话…"
                      : pdf
                        ? "问问这篇论文…"
                        : "问问这篇文章…"
                  }
                  maxLength={4000}
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={(e) => {
                    if (
                      e.key === "Enter" &&
                      !e.shiftKey &&
                      !e.nativeEvent.isComposing
                    ) {
                      e.preventDefault();
                      void ask("ask", question);
                    }
                  }}
                />
                <div>
                  <small>
                    {latest ? `模型 · ${latest.model}` : "使用当前配置的模型"}
                  </small>
                  {pending ? (
                    <button type="button" aria-label="停止回答" onClick={stop}>
                      <Square size={15} />
                    </button>
                  ) : (
                    <button
                      type="submit"
                      aria-label="发送问题"
                      disabled={!question.trim()}
                    >
                      <ArrowUp size={17} />
                    </button>
                  )}
                </div>
              </form>
              <p className="br-footnote">
                回答仅依据已读取文字，可点击引用核对原文
              </p>
            </>
          ) : (
            <div className="br-notes">
              <p className="br-note-intro">
                保存在本机 · 也可在「资讯动态 → 阅读笔记」查看
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  saveNote(draft, quote || undefined);
                }}
              >
                <textarea
                  aria-label="写下阅读笔记"
                  placeholder="写下你的想法…"
                  value={draft}
                  maxLength={20000}
                  onChange={(e) => setDraft(e.target.value)}
                />
                <button disabled={!draft.trim()}>
                  <Plus size={14} />
                  保存笔记
                </button>
              </form>
              <ReadingNotesList
                notes={notes}
                currentUrl={url}
                onDelete={(id) => {
                  try {
                    const next = loadReadingNotes().filter((n) => n.id !== id);
                    persistNotes(next);
                    setNotes(next);
                  } catch {
                    setError("删除失败，请重试");
                  }
                }}
                onOpen={(note) => {
                  if (sourceKey(note.url) === sourceKey(url))
                    locate({
                      id: "note",
                      text: note.quote || note.text,
                      page: note.page,
                    });
                  else if (/^https?:\/\//.test(note.url))
                    webviewRef.current?.loadURL(
                      note.url + (note.page ? `#page=${note.page}` : ""),
                    );
                }}
              />
              {error && (
                <p className="br-error" role="alert">
                  {error}
                </p>
              )}
            </div>
          )}
        </aside>
      )}
    </>
  );
}
