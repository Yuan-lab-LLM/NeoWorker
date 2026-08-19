import "./mission-control.css";
import "./task-workspace-june.css";
import { useState } from "react";
import { isTempWorkspaceId } from "../../../shared/types";
import { useMissionControlData, type MCTab } from "./useMissionControlData";
import { MCTopBar } from "./MCTopBar";
import { MCBoardTab } from "./MCBoardTab";
import { MCDetailPanel } from "./MCDetailPanel";
import { AgentRoleEditor } from "../AgentRoleEditor";
import { StandupReportViewer } from "../StandupReportViewer";
import { AgentTeamsPanel } from "../AgentTeamsPanel";
import { AgentPerformanceReviewViewer } from "../AgentPerformanceReviewViewer";
import { translate, useLanguage } from "../../i18n";

interface MissionControlPanelProps {
  onClose?: () => void;
  onOpenAutomations?: () => void;
  onOpenTask?: (taskId: string) => void | Promise<void>;
  onTasksChanged?: () => void | Promise<void>;
  initialCompanyId?: string | null;
  /** When opening from Inbox Agent (or elsewhere), focus this issue in Ops. */
  initialIssueId?: string | null;
  /** When opening from Everyday Agent, land on the supervision feed. */
  initialEverydayAgentFocus?: boolean;
  /** Choose the primary Task Hub view when arriving from another module. */
  initialTab?: Extract<MCTab, "overview" | "board" | "intelligence">;
  /** Changes for each external navigation so a retained panel can apply the requested destination. */
  navigationRequestId?: number;
  /** Pauses display-only work while the retained panel is hidden. */
  isActive?: boolean;
}

export function MissionControlPanel({
  onClose: _onClose,
  onOpenAutomations,
  onOpenTask,
  onTasksChanged,
  initialCompanyId = null,
  initialIssueId = null,
  initialEverydayAgentFocus = false,
  navigationRequestId = 0,
  isActive = true,
}: MissionControlPanelProps) {
  useLanguage();
  const t = translate;
  const [searchQuery, setSearchQuery] = useState("");
  const data = useMissionControlData(
    initialCompanyId,
    initialIssueId,
    initialEverydayAgentFocus,
    "board",
    navigationRequestId,
    isActive,
  );

  const {
    loading,
    editingAgent,
    setEditingAgent,
    isCreatingAgent,
    agentError,
    handleSaveAgent,
    standupOpen,
    setStandupOpen,
    selectedWorkspace,
    teamsOpen,
    setTeamsOpen,
    agents,
    tasks,
    setDetailPanel,
    reviewsOpen,
    setReviewsOpen,
    agentContext,
    detailPanel,
  } = data;
  const supportsWorkspaceReports =
    !!selectedWorkspace && !isTempWorkspaceId(selectedWorkspace.id);

  if (loading) {
    return (
      <div
        className="mc-v2 mc-task-loading-shell"
        aria-busy="true"
        aria-live="polite"
      >
        <span className="mc-task-loading-label">
          {agentContext.getUiCopy("mcLoading")}
        </span>
        <div className="mc-task-loading-preview" aria-hidden="true">
          <div className="mc-task-loading-top">
            <span />
            <span />
          </div>
          <div className="mc-task-loading-tabs">
            <span />
            <span />
            <span />
          </div>
          <div className="mc-task-loading-ledger">
            <div className="mc-task-loading-ledger-head" />
            <div />
            <div />
            <div />
          </div>
        </div>
      </div>
    );
  }

  if (editingAgent) {
    return (
      <div className="mc-v2">
        <div className="mc-v2-editor-overlay">
          <div className="mc-v2-editor-modal">
            <AgentRoleEditor
              role={editingAgent}
              isCreating={isCreatingAgent}
              onSave={handleSaveAgent}
              onCancel={() => {
                setEditingAgent(null);
              }}
              error={agentError}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mc-v2">
      <MCTopBar
        data={data}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
      />

      <div className="mc-v2-body">
        <div className="mc-v2-tab-content">
          <MCBoardTab
            data={data}
            searchQuery={searchQuery}
            onSearchQueryChange={setSearchQuery}
            onTasksChanged={onTasksChanged}
            onOpenAutomations={onOpenAutomations}
            onOpenTask={onOpenTask}
          />
        </div>
        {detailPanel && <MCDetailPanel data={data} onOpenTask={onOpenTask} />}
      </div>

      {/* Modals */}
      {standupOpen && supportsWorkspaceReports && selectedWorkspace && (
        <div className="mc-v2-editor-overlay">
          <div className="mc-v2-editor-modal mc-v2-standup-modal">
            <StandupReportViewer
              workspaceId={selectedWorkspace.id}
              onClose={() => setStandupOpen(false)}
            />
          </div>
        </div>
      )}

      {teamsOpen && selectedWorkspace && (
        <div className="mc-v2-editor-overlay">
          <div className="mc-v2-editor-modal mc-v2-standup-modal">
            <AgentTeamsPanel
              workspaceId={selectedWorkspace.id}
              agents={agents}
              tasks={tasks}
              onOpenTask={(taskId) => {
                setDetailPanel({ kind: "task", taskId });
                setTeamsOpen(false);
              }}
            />
            <div
              style={{
                marginTop: 10,
                display: "flex",
                justifyContent: "flex-end",
                padding: "0 16px 16px",
              }}
            >
              <button
                className="mc-v2-icon-btn"
                onClick={() => setTeamsOpen(false)}
              >
                {t("common.close", "Close")}
              </button>
            </div>
          </div>
        </div>
      )}

      {reviewsOpen && supportsWorkspaceReports && selectedWorkspace && (
        <div className="mc-v2-editor-overlay">
          <div className="mc-v2-editor-modal mc-v2-standup-modal">
            <AgentPerformanceReviewViewer
              workspaceId={selectedWorkspace.id}
              agents={agents}
              onClose={() => setReviewsOpen(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
