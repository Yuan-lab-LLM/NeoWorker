import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowUpRight,
  ChevronDown,
  Copy,
  FileText,
  RefreshCw,
} from "lucide-react";
import type { TaskEvent, TaskProvenanceRecord } from "../../shared/types";
import { translate, useLanguage } from "../i18n";
import { IntegrationMentionIcon } from "./IntegrationMentionIcon";

const CHANNEL_ICON_KEYS: Record<string, string> = {
  feishu: "lark",
  googlechat: "google-chat",
};
const TASK_SOURCE_PAGE_SIZE = 20;

function TaskSourceIcon({ record }: { record: TaskProvenanceRecord }) {
  const [failed, setFailed] = useState(false);
  const providerKey = record.providerKey?.toLowerCase() || "";
  const iconKey = CHANNEL_ICON_KEYS[providerKey] || providerKey;
  const isGateway = record.sourceKind === "gateway_message" && Boolean(iconKey);

  useEffect(() => setFailed(false), [iconKey]);

  if (isGateway && !failed) {
    return (
      <span className="task-source-brand-icon" aria-hidden="true">
        <img
          src={`/channel-icons/${iconKey}.svg`}
          alt=""
          onError={() => setFailed(true)}
        />
      </span>
    );
  }

  return (
    <IntegrationMentionIcon
      iconKey={iconKey || undefined}
      label={
        record.providerLabel ||
        translate("task.source.external", "External source")
      }
      size="sm"
    />
  );
}

function formatSourceTime(timestamp: number, language: "en" | "zh-CN"): string {
  const elapsedMs = Date.now() - timestamp;
  const absElapsedMs = Math.abs(elapsedMs);
  if (absElapsedMs > 7 * 24 * 60 * 60 * 1000) {
    return new Intl.DateTimeFormat(language, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(timestamp));
  }

  const relative = new Intl.RelativeTimeFormat(language, { numeric: "auto" });
  if (absElapsedMs < 60_000) return relative.format(0, "second");
  if (absElapsedMs < 60 * 60_000) {
    return relative.format(-Math.round(elapsedMs / 60_000), "minute");
  }
  if (absElapsedMs < 24 * 60 * 60_000) {
    return relative.format(-Math.round(elapsedMs / (60 * 60_000)), "hour");
  }
  return relative.format(-Math.round(elapsedMs / (24 * 60 * 60_000)), "day");
}

export function isTaskProvenanceEvent(
  event: TaskEvent,
  taskId: string,
): boolean {
  if (event.taskId !== taskId || event.type !== "timeline_evidence_attached")
    return false;
  const payload = event.payload as { evidenceRefs?: unknown };
  const refs: unknown[] = Array.isArray(payload.evidenceRefs)
    ? payload.evidenceRefs
    : [];
  return refs.some((ref) => {
    if (!ref || typeof ref !== "object") return false;
    const value = (ref as { sourceUrlOrPath?: unknown }).sourceUrlOrPath;
    return typeof value === "string" && value.startsWith("provenance:");
  });
}

export function getVisibleTaskProvenance(
  records: TaskProvenanceRecord[],
  expanded: boolean,
): TaskProvenanceRecord[] {
  if (expanded || records.length <= 3) return records;
  return [records[0], records[records.length - 1]];
}

function SourceCard({ record }: { record: TaskProvenanceRecord }) {
  const language = useLanguage();
  const [openError, setOpenError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const providerLabel =
    record.providerLabel ||
    translate("task.source.external", "External source");
  const actorLabel = record.actor?.displayName || record.actor?.username;
  const conversationLabel = record.conversation?.label;
  const canOpen = Boolean(
    record.openTarget &&
    record.openTarget.kind !== "none" &&
    record.openTarget.available,
  );
  const metadataLabel = [actorLabel, conversationLabel]
    .filter(Boolean)
    .join(" • ");

  const handleOpen = async () => {
    if (!window.electronAPI?.openTaskProvenance) return;
    setOpening(true);
    setOpenError(null);
    try {
      const result = await window.electronAPI.openTaskProvenance({
        taskId: record.taskId,
        provenanceId: record.id,
      });
      if (!result.opened) {
        setOpenError(
          result.reason === "unsafe-url"
            ? translate(
                "task.source.unsafe",
                "This source link was blocked for safety.",
              )
            : translate(
                "task.source.openFailed",
                "The original source could not be opened.",
              ),
        );
      }
    } catch {
      setOpenError(
        translate(
          "task.source.openFailed",
          "The original source could not be opened.",
        ),
      );
    } finally {
      setOpening(false);
    }
  };

  const handleCopyId = async () => {
    const value = record.externalId || record.sourceRef || record.id;
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      setOpenError(
        translate(
          "task.source.copyFailed",
          "The source ID could not be copied.",
        ),
      );
    }
  };

  return (
    <article
      className="task-source-card"
      aria-labelledby={`task-source-title-${record.id}`}
      tabIndex={-1}
    >
      <header className="task-source-card-header">
        <TaskSourceIcon record={record} />
        <div className="task-source-card-heading">
          <div className="task-source-card-title-row">
            <h3 id={`task-source-title-${record.id}`}>
              {translate("task.source.from", "From {provider}", {
                provider: providerLabel,
              })}
            </h3>
            {record.relation === "inherited" && (
              <span className="task-source-relation">
                {translate("task.source.inherited", "Inherited source")}
              </span>
            )}
            {record.relation === "follow_up" && (
              <span className="task-source-relation">
                {translate("task.source.followUp", "Follow-up")}
              </span>
            )}
          </div>
          <div className="task-source-card-meta">
            {metadataLabel && <span>{metadataLabel}</span>}
            <time dateTime={new Date(record.occurredAt).toISOString()}>
              {formatSourceTime(record.occurredAt, language)}
            </time>
          </div>
        </div>
        {canOpen && (
          <button
            type="button"
            className="task-source-open-button"
            onClick={handleOpen}
            disabled={opening}
          >
            <span>{translate("task.source.open", "Open source")}</span>
            <ArrowUpRight size={14} aria-hidden="true" />
          </button>
        )}
      </header>

      {record.excerpt && (
        <p className="task-source-excerpt">
          {record.excerpt}
          {record.excerptTruncated && (
            <span className="task-source-truncated">
              {translate("task.source.truncated", "Source preview truncated")}
            </span>
          )}
        </p>
      )}

      {record.attachments.length > 0 && (
        <div
          className="task-source-attachments"
          aria-label={translate("task.source.attachments", "Attachments")}
        >
          <FileText size={14} aria-hidden="true" />
          <span>
            {translate(
              record.attachments.length === 1
                ? "task.source.attachmentCount.one"
                : "task.source.attachmentCount.other",
              record.attachments.length === 1
                ? "1 attachment"
                : "{count} attachments",
              { count: record.attachments.length },
            )}
          </span>
          <span className="task-source-attachment-names">
            {record.attachments
              .slice(0, 3)
              .map((attachment) => attachment.name)
              .join(", ")}
          </span>
        </div>
      )}

      <details className="task-source-technical-details">
        <summary>
          <ChevronDown size={13} aria-hidden="true" />
          {translate("task.source.technicalDetails", "Source details")}
        </summary>
        <dl>
          <div>
            <dt>{translate("task.source.provider", "Provider")}</dt>
            <dd>{providerLabel}</dd>
          </div>
          {record.conversation?.id && (
            <div>
              <dt>
                {translate("task.source.conversationId", "Conversation ID")}
              </dt>
              <dd>{record.conversation.id}</dd>
            </div>
          )}
          <div>
            <dt>{translate("task.source.sourceId", "Source ID")}</dt>
            <dd>{record.externalId || record.sourceRef || record.id}</dd>
          </div>
        </dl>
        <button
          type="button"
          className="task-source-copy-button"
          onClick={handleCopyId}
        >
          <Copy size={13} aria-hidden="true" />
          {translate("task.source.copyId", "Copy source ID")}
        </button>
      </details>

      {openError && (
        <div className="task-source-inline-error" role="status">
          <AlertCircle size={14} aria-hidden="true" />
          <span>{openError}</span>
        </div>
      )}
    </article>
  );
}

export function TaskSourceStack({ taskId }: { taskId: string }) {
  const [records, setRecords] = useState<TaskProvenanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const requestIdRef = useRef(0);

  const load = useCallback(
    async (showLoading: boolean, offset = 0) => {
      const requestId = ++requestIdRef.current;
      if (showLoading) setLoading(true);
      if (offset > 0) setLoadingMore(true);
      if (offset > 0) setLoadMoreError(false);
      else setError(false);
      try {
        const next = window.electronAPI?.listTaskProvenance
          ? await window.electronAPI.listTaskProvenance(
              taskId,
              TASK_SOURCE_PAGE_SIZE + 1,
              offset,
            )
          : [];
        if (requestId !== requestIdRef.current) return;
        const page = (
          next.length > TASK_SOURCE_PAGE_SIZE ? next.slice(1) : next
        ).filter((record) => record.sourceKind !== "manual");
        setHasMore(next.length > TASK_SOURCE_PAGE_SIZE);
        setRecords((current) => {
          const combined = offset > 0 ? [...page, ...current] : page;
          return Array.from(
            new Map(combined.map((record) => [record.id, record])).values(),
          );
        });
      } catch {
        if (requestId !== requestIdRef.current) return;
        if (offset > 0) setLoadMoreError(true);
        else setError(true);
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [taskId],
  );

  useEffect(() => {
    setRecords([]);
    setHasMore(false);
    setLoadMoreError(false);
    setExpanded(false);
    void load(true);
    return () => {
      requestIdRef.current += 1;
    };
  }, [load]);

  useEffect(() => {
    if (!window.electronAPI?.onTaskEvent) return;
    return window.electronAPI.onTaskEvent((event: TaskEvent) => {
      if (isTaskProvenanceEvent(event, taskId)) void load(false);
    });
  }, [load, taskId]);

  useEffect(() => {
    const focusLatestSource = (event: Event) => {
      const detail = (event as CustomEvent<{ taskId?: string }>).detail;
      if (detail?.taskId !== taskId) return;
      window.requestAnimationFrame(() => {
        const stack = document.getElementById(`task-source-stack-${taskId}`);
        const cards = stack?.querySelectorAll<HTMLElement>(".task-source-card");
        const target =
          cards && cards.length > 0 ? cards[cards.length - 1] : stack;
        const reduceMotion = window.matchMedia?.(
          "(prefers-reduced-motion: reduce)",
        ).matches;
        target?.scrollIntoView({
          behavior: reduceMotion ? "auto" : "smooth",
          block: "center",
        });
        target?.focus({ preventScroll: true });
      });
    };
    window.addEventListener("task-source:focus", focusLatestSource);
    return () =>
      window.removeEventListener("task-source:focus", focusLatestSource);
  }, [taskId]);

  const visibleRecords = useMemo(() => {
    return getVisibleTaskProvenance(records, expanded);
  }, [expanded, records]);

  if (loading) {
    return (
      <div
        className="task-source-skeleton"
        aria-label={translate("task.source.loading", "Loading source")}
      >
        <span />
        <div>
          <span />
          <span />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="task-source-load-error" role="status">
        <AlertCircle size={16} aria-hidden="true" />
        <span>
          {translate(
            "task.source.loadFailed",
            "Source information is temporarily unavailable.",
          )}
        </span>
        <button type="button" onClick={() => void load(true)}>
          <RefreshCw size={14} aria-hidden="true" />
          {translate("common.retry", "Retry")}
        </button>
      </div>
    );
  }

  if (records.length === 0) return null;

  return (
    <section
      id={`task-source-stack-${taskId}`}
      className="task-source-stack"
      aria-label={translate("task.source.title", "Task sources")}
    >
      {records.length > 1 && (
        <div className="task-source-stack-heading">
          <span>{translate("task.source.title", "Task sources")}</span>
          <span>{hasMore ? `${records.length}+` : records.length}</span>
        </div>
      )}
      {visibleRecords.map((record) => (
        <SourceCard key={record.id} record={record} />
      ))}
      {records.length > 3 && (
        <button
          type="button"
          className="task-source-stack-toggle"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
        >
          {expanded
            ? translate("task.source.showLess", "Show fewer sources")
            : translate(
                records.length - 2 === 1
                  ? "task.source.showMore.one"
                  : "task.source.showMore.other",
                records.length - 2 === 1
                  ? "Show 1 more source"
                  : "Show {count} more sources",
                { count: records.length - 2 },
              )}
          <ChevronDown size={14} aria-hidden="true" />
        </button>
      )}
      {expanded && hasMore && (
        <div className="task-source-load-more-row">
          <button
            type="button"
            className="task-source-stack-toggle task-source-load-more"
            onClick={() => void load(false, records.length)}
            disabled={loadingMore}
          >
            <RefreshCw size={14} aria-hidden="true" />
            {loadingMore
              ? translate("task.source.loadingMore", "Loading more sources")
              : translate("task.source.loadMore", "Load more sources")}
          </button>
          {loadMoreError && (
            <span className="task-source-load-more-error" role="status">
              {translate(
                "task.source.loadMoreFailed",
                "Could not load more sources. Try again.",
              )}
            </span>
          )}
        </div>
      )}
    </section>
  );
}
