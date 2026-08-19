import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { MCTaskDetail } from "./MCTaskDetail";
import { MCAgentDetail } from "./MCAgentDetail";
import { MCIssueDetail } from "./MCIssueDetail";
import { translate, useLanguage } from "../../i18n";
import type { MissionControlData } from "./useMissionControlData";

interface MCDetailPanelProps {
  data: MissionControlData;
  onOpenTask?: (taskId: string) => void | Promise<void>;
}

export function MCDetailPanel({ data, onOpenTask }: MCDetailPanelProps) {
  useLanguage();
  const t = translate;
  const { detailPanel, setDetailPanel } = data;
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDetailPanel(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [setDetailPanel]);

  // A newly opened task should always start with its next action, never with
  // a previously scrolled execution log from another detail view.
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
  }, [detailPanel]);

  if (!detailPanel) return null;

  const typeLabel =
    detailPanel.kind === "task"
      ? t("common.task", "Task")
      : detailPanel.kind === "agent"
        ? t("mcDetail.agent", "Agent")
        : t("mcDetail.issue", "Issue");

  return (
    <aside className="mc-v2-detail-panel">
      <div className="mc-v2-detail-header">
        <div className="mc-v2-detail-header-left">
          <span className="mc-v2-detail-type">{typeLabel}</span>
        </div>
        <button
          type="button"
          className="mc-v2-detail-close"
          onClick={() => setDetailPanel(null)}
          title={t("mcDetail.closeEsc", "Close (Esc)")}
          aria-label={t("mcDetail.closeEsc", "Close (Esc)")}
        >
          <X size={14} aria-hidden="true" />
        </button>
      </div>
      <div ref={bodyRef} className="mc-v2-detail-body">
        {detailPanel.kind === "task" && (
          <MCTaskDetail
            data={data}
            taskId={detailPanel.taskId}
            onOpenTask={onOpenTask}
          />
        )}
        {detailPanel.kind === "agent" && (
          <MCAgentDetail data={data} agentId={detailPanel.agentId} />
        )}
        {detailPanel.kind === "issue" && (
          <MCIssueDetail data={data} issueId={detailPanel.issueId} />
        )}
      </div>
    </aside>
  );
}
