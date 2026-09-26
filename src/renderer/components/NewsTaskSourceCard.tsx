import { BookOpen, ChevronRight, ExternalLink, FlaskConical, Languages, X } from "lucide-react";
import type { NewsTaskContext } from "../../shared/news-task-draft";
import { NEWS_PUBLISHERS, isNewsPublisher } from "../../shared/news-sources";
import { useLanguage } from "../i18n";
import { NewsSourceBrand } from "./NewsSourceBrand";
import "./news-task-source-card.css";

export function NewsTaskSourceCard({
  context,
  onRemove,
}: {
  context: NewsTaskContext;
  onRemove?: () => void;
}) {
  const zh = useLanguage() === "zh-CN";
  const { source, action } = context;
  const Icon = action === "read" ? BookOpen : action === "translate" ? Languages : FlaskConical;
  const actionName = zh
    ? { read: "AI 解读", translate: "全文翻译", research: "深入研究" }[action]
    : { read: "AI explanation", translate: "Full translation", research: "In-depth research" }[
        action
      ];
  const names: Record<string, string> = {
    arxiv: "arXiv",
    huggingface: "Hugging Face Papers",
    github: "GitHub",
    "hf-models": "Hugging Face Models",
    "hf-datasets": "Hugging Face Datasets",
  };
  const name = isNewsPublisher(source.id)
    ? NEWS_PUBLISHERS[source.id][zh ? "name" : "nameEn"]
    : names[source.id];
  const open = (url: string) => {
    void window.electronAPI.openExternal(url).catch(() => {});
  };
  return (
    <section className="news-task-source" aria-label={zh ? "任务来源" : "Task source"}>
      <div className="news-task-source-heading">
        <span className="news-task-source-action">
          <Icon size={14} />
          {actionName}
        </span>
        <span className="news-task-source-provider">
          <NewsSourceBrand source={source.id} />
          {name}
        </span>
        {onRemove && (
          <button
            type="button"
            className="news-task-source-remove"
            aria-label={zh ? "移除来源与任务要求" : "Remove source and task requirements"}
            onClick={onRemove}
          >
            <X size={14} />
          </button>
        )}
      </div>
      <button
        type="button"
        className="news-task-source-title"
        title={source.title}
        onClick={() => open(source.url)}
      >
        {source.title}
        <ExternalLink size={13} />
      </button>
      <details className="news-task-source-details">
        <summary>
          <ChevronRight size={13} />
          {zh ? "任务要求" : "Task requirements"}
        </summary>
        <div className="news-task-source-requirements">
          <p className="news-task-source-note">
            {zh
              ? "这些任务要求和来源信息会随消息一起发送。"
              : "These task requirements and source information accompany the message."}
          </p>
          {context.requirements.split(/\n\n+/).map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
          <div className="news-task-source-links">
            <button type="button" onClick={() => open(source.url)}>
              {zh ? "原文" : "Source"}
              <ExternalLink size={12} />
            </button>
            {source.pdfUrl && (
              <button type="button" onClick={() => open(source.pdfUrl!)}>
                PDF
                <ExternalLink size={12} />
              </button>
            )}
          </div>
        </div>
      </details>
    </section>
  );
}
