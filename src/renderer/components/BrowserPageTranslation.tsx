import { useEffect, useRef, useState, type RefObject } from "react";
import { Languages, LoaderCircle, RotateCcw, X } from "lucide-react";
import { useLanguage } from "../i18n";
import type { PageTranslationStatus } from "../../shared/browser-page-translation";

type TranslationWebview = {
  addEventListener: (name: string, listener: (event: any) => void) => void;
  removeEventListener: (name: string, listener: (event: any) => void) => void;
};
const idle: PageTranslationStatus = { status: "idle", completed: 0, total: 0 };

export function BrowserPageTranslation({
  taskId,
  sessionId,
  url,
  ready,
  webviewRef,
}: {
  taskId: string;
  sessionId: string;
  url: string;
  ready: boolean;
  webviewRef: RefObject<TranslationWebview | null>;
}) {
  const zh = useLanguage() === "zh-CN";
  const [state, setState] = useState<PageTranslationStatus>(idle);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  const epoch = useRef(0);
  const working = state.status === "translating";
  const translated = state.status === "translated" || state.status === "partial";
  const restored =
    state.status === "original" && state.total > 0 && state.completed === state.total;
  const chinese = state.status === "already-chinese";

  useEffect(() => {
    const current = ++epoch.current;
    setState(idle);
    setPending(false);
    setNotice("");
    const reset = (event?: { isMainFrame?: boolean }) => {
      if (event?.isMainFrame === false) return;
      epoch.current++;
      setState(idle);
      setPending(false);
      setNotice("");
    };
    const guest = webviewRef.current;
    guest?.addEventListener("dom-ready", reset);
    guest?.addEventListener("render-process-gone", reset);
    if (ready)
      void window.electronAPI
        .browserPageTranslation({ taskId, sessionId, url, action: "status" })
        .then((result) => {
          if (epoch.current === current) setState(result);
        })
        .catch(() => {});
    return () => {
      epoch.current++;
      guest?.removeEventListener("dom-ready", reset);
      guest?.removeEventListener("render-process-gone", reset);
    };
  }, [taskId, sessionId, url, ready, webviewRef]);

  useEffect(() => {
    if (!working) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const current = epoch.current;
    const poll = async () => {
      try {
        const result = await window.electronAPI.browserPageTranslation({
          taskId,
          sessionId,
          url,
          action: "status",
        });
        if (stopped || epoch.current !== current) return;
        setState(result);
        if (result.message) setNotice(result.message);
        if (result.status === "translating") timer = setTimeout(poll, 750);
      } catch {
        if (!stopped && epoch.current === current) setState(idle);
      }
    };
    timer = setTimeout(poll, 750);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [working, taskId, sessionId, url]);

  const label = working
    ? `${zh ? "翻译中" : "Translating"} ${state.total ? Math.round((state.completed / state.total) * 100) : 0}%`
    : translated
      ? zh
        ? "恢复原文"
        : "Show original"
      : restored
        ? zh
          ? "显示译文"
          : "Show translation"
        : chinese
          ? zh
            ? "已是中文"
            : "Already Chinese"
          : state.status === "error"
            ? zh
              ? "重试翻译"
              : "Retry translation"
            : zh
              ? "全文翻译"
              : "Translate page";
  return (
    <div className="br-page-translation">
      <button
        type="button"
        className="br-toggle"
        disabled={!ready || pending || chinese}
        aria-pressed={translated}
        aria-label={
          working ? (zh ? "停止翻译并恢复原文" : "Stop translation and restore original") : label
        }
        title={
          working
            ? zh
              ? "停止翻译并恢复原文"
              : "Stop and restore original"
            : zh
              ? "使用当前模型翻译网页文字，保留原有图片、链接和排版"
              : "Translate page text to Chinese with your current model, preserving images, links and layout"
        }
        onClick={async () => {
          const current = ++epoch.current;
          setPending(true);
          setNotice("");
          try {
            const result = await window.electronAPI.browserPageTranslation({
              taskId,
              sessionId,
              url,
              action: working || translated ? "restore" : "translate",
            });
            if (epoch.current === current) {
              setState(result);
              if (result.message) setNotice(result.message);
            }
          } catch (error) {
            if (epoch.current === current) {
              setState({ ...idle, status: "error" });
              setNotice(
                error instanceof Error
                  ? error.message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, "")
                  : zh
                    ? "翻译失败，请重试"
                    : "Translation failed. Try again.",
              );
            }
          } finally {
            if (epoch.current === current) setPending(false);
          }
        }}
      >
        {working ? (
          <LoaderCircle size={14} className="br-translation-spinner" aria-hidden="true" />
        ) : translated ? (
          <RotateCcw size={14} aria-hidden="true" />
        ) : (
          <Languages size={14} aria-hidden="true" />
        )}
        <span>{label}</span>
      </button>
      {notice && (
        <div className="br-translation-notice" role="status">
          <span>{notice}</span>
          <button
            type="button"
            onClick={() => setNotice("")}
            aria-label={zh ? "关闭提示" : "Dismiss notice"}
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
