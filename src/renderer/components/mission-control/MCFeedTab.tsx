import type {
  MissionControlCategory,
  MissionControlSeverity,
} from "../../../shared/types";
import { translate, useLanguage } from "../../i18n";
import type { MissionControlData } from "./useMissionControlData";

interface MCFeedTabProps {
  data: MissionControlData;
}

const CATEGORY_FILTERS: Array<{
  id: "all" | MissionControlCategory;
  key: string;
  label: string;
}> = [
  { id: "all", key: "common.all", label: "All" },
  {
    id: "attention",
    key: "missionControl.category.attention",
    label: "Attention",
  },
  { id: "work", key: "missionControl.category.work", label: "Work" },
  { id: "reviews", key: "missionControl.category.reviews", label: "Reviews" },
  {
    id: "learnings",
    key: "missionControl.category.learnings",
    label: "Learnings",
  },
  {
    id: "awareness",
    key: "missionControl.category.awareness",
    label: "Awareness",
  },
  {
    id: "evidence",
    key: "missionControl.category.evidence",
    label: "Evidence",
  },
];

const SEVERITY_FILTERS: Array<{
  id: "all" | MissionControlSeverity;
  key: string;
  label: string;
}> = [
  { id: "all", key: "missionControl.feed.anyStatus", label: "Any status" },
  {
    id: "action_needed",
    key: "missionControl.severity.actionNeeded",
    label: "Action needed",
  },
  {
    id: "monitor_only",
    key: "missionControl.severity.monitorOnly",
    label: "Monitor only",
  },
  {
    id: "successful",
    key: "missionControl.severity.successful",
    label: "Successful",
  },
  { id: "failed", key: "missionControl.severity.failed", label: "Failed" },
];

const CATEGORY_LABELS: Record<
  MissionControlCategory,
  { key: string; label: string }
> = {
  attention: { key: "missionControl.category.attention", label: "Attention" },
  work: { key: "missionControl.category.work", label: "Work" },
  reviews: { key: "missionControl.category.reviews", label: "Reviews" },
  learnings: { key: "missionControl.category.learnings", label: "Learnings" },
  awareness: { key: "missionControl.category.awareness", label: "Awareness" },
  evidence: { key: "missionControl.category.evidence", label: "Evidence" },
};

const SEVERITY_LABELS: Record<
  MissionControlSeverity,
  { key: string; label: string }
> = {
  action_needed: {
    key: "missionControl.severity.actionNeeded",
    label: "Action needed",
  },
  monitor_only: {
    key: "missionControl.severity.monitorOnly",
    label: "Monitor only",
  },
  successful: {
    key: "missionControl.severity.successful",
    label: "Successful",
  },
  failed: { key: "missionControl.severity.failed", label: "Failed" },
};

function severityTone(severity: MissionControlSeverity): string {
  if (severity === "failed") return "danger";
  if (severity === "action_needed") return "attention";
  if (severity === "successful") return "healthy";
  return "";
}

export function MCFeedTab({ data }: MCFeedTabProps) {
  useLanguage();
  const t = translate;
  const {
    missionControlItems,
    missionControlEvidence,
    expandedMissionControlItems,
    feedFilter,
    setFeedFilter,
    feedSeverityFilter,
    setFeedSeverityFilter,
    selectedAgent,
    setSelectedAgent,
    agents,
    everydayAgentFocus,
    formatRelativeTime,
    toggleMissionControlEvidence,
    setDetailPanel,
    isAllWorkspacesSelected,
  } = data;

  const activeAgents = agents.filter((agent) => agent.isActive);

  return (
    <div className="mc-v2-feed mc-v2-evidence-feed">
      <div className="mc-v2-feed-toolbar">
        <div className="mc-v2-feed-filter-stack">
          <div className="mc-v2-feed-filters">
            {CATEGORY_FILTERS.map((filter) => (
              <button
                key={filter.id}
                className={`mc-v2-filter-btn ${feedFilter === filter.id ? "active" : ""}`}
                onClick={() => setFeedFilter(filter.id)}
              >
                {t(filter.key, filter.label)}
              </button>
            ))}
          </div>
          <div className="mc-v2-feed-filters subtle">
            {SEVERITY_FILTERS.map((filter) => (
              <button
                key={filter.id}
                className={`mc-v2-filter-btn ${feedSeverityFilter === filter.id ? "active" : ""}`}
                onClick={() => setFeedSeverityFilter(filter.id)}
              >
                {t(filter.key, filter.label)}
              </button>
            ))}
          </div>
        </div>
        <div className="mc-v2-feed-agent-chips">
          {everydayAgentFocus && (
            <button className="mc-v2-agent-chip active" type="button" disabled>
              {t("missionControl.feed.everydayAgent", "Everyday Agent")}
            </button>
          )}
          {activeAgents.map((agent) => (
            <button
              key={agent.id}
              className={`mc-v2-agent-chip ${selectedAgent === agent.id ? "active" : ""}`}
              style={{ borderColor: agent.color }}
              onClick={() =>
                setSelectedAgent(selectedAgent === agent.id ? null : agent.id)
              }
            >
              {agent.displayName.split(" ")[0]}
            </button>
          ))}
        </div>
      </div>

      <div className="mc-v2-feed-list">
        {missionControlItems.length === 0 ? (
          <div className="mc-v2-empty">
            {t(
              "missionControl.feed.empty",
              "No grouped Mission Control items yet.",
            )}
          </div>
        ) : (
          missionControlItems.map((item) => {
            const expanded = Boolean(expandedMissionControlItems[item.id]);
            const evidence = missionControlEvidence[item.id] || [];
            return (
              <article
                key={item.id}
                className={`mc-v2-feed-item mc-v2-intel-item ${severityTone(item.severity)}`}
              >
                <div className="mc-v2-feed-item-header">
                  <div className="mc-v2-feed-item-meta">
                    <span
                      className={`mc-v2-status-pill ${severityTone(item.severity)}`}
                    >
                      {t(
                        SEVERITY_LABELS[item.severity].key,
                        SEVERITY_LABELS[item.severity].label,
                      )}
                    </span>
                    <span className="mc-v2-brief-kicker">
                      {t(
                        CATEGORY_LABELS[item.category].key,
                        CATEGORY_LABELS[item.category].label,
                      )}
                    </span>
                    {item.agentName && (
                      <span className="mc-v2-feed-agent">{item.agentName}</span>
                    )}
                    {isAllWorkspacesSelected && item.workspaceName ? (
                      <span className="mc-v2-workspace-tag">
                        {item.workspaceName}
                      </span>
                    ) : null}
                  </div>
                  <span className="mc-v2-feed-time">
                    {formatRelativeTime(item.timestamp)}
                  </span>
                </div>

                <div className="mc-v2-intel-body">
                  <h3>{item.title}</h3>
                  <p>{item.summary}</p>
                  {(item.decision || item.nextStep) && (
                    <div className="mc-v2-brief-disposition">
                      {item.decision && <span>{item.decision}</span>}
                      {item.nextStep && <strong>{item.nextStep}</strong>}
                    </div>
                  )}
                </div>

                <div className="mc-v2-intel-actions">
                  {item.taskId && (
                    <button
                      className="mc-v2-inline-action"
                      onClick={() =>
                        setDetailPanel({ kind: "task", taskId: item.taskId! })
                      }
                    >
                      {t("missionControl.feed.openTask", "Open task")}
                    </button>
                  )}
                  <button
                    className="mc-v2-inline-action"
                    onClick={() => toggleMissionControlEvidence(item.id)}
                  >
                    {expanded
                      ? t("missionControl.feed.hideEvidence", "Hide evidence")
                      : t(
                          "missionControl.feed.showEvidence",
                          "Show evidence ({count})",
                          { count: item.evidenceCount },
                        )}
                  </button>
                </div>

                {expanded && (
                  <div className="mc-v2-evidence-list">
                    {evidence.length === 0 ? (
                      <div className="mc-v2-empty mc-v2-empty-compact">
                        {t(
                          "missionControl.feed.noEvidenceRows",
                          "No evidence rows loaded.",
                        )}
                      </div>
                    ) : (
                      evidence.map((entry) => (
                        <div key={entry.id} className="mc-v2-evidence-row">
                          <div>
                            <strong>{entry.title}</strong>
                            {entry.summary && <p>{entry.summary}</p>}
                          </div>
                          <div className="mc-v2-evidence-meta">
                            <span>{entry.sourceType.replace(/_/g, " ")}</span>
                            <span>{formatRelativeTime(entry.timestamp)}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </article>
            );
          })
        )}
      </div>
    </div>
  );
}
