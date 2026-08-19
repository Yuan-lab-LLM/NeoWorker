import React, { useState, useEffect, useCallback } from "react";
import {
  Sun,
  CheckCircle,
  Clock,
  Brain,
  Lightbulb,
  AlertTriangle,
  Calendar,
  RefreshCw,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import type { Workspace } from "../../shared/types";
import { translate, useLanguage } from "../i18n";

interface BriefingSection {
  type: string;
  title: string;
  items: BriefingItem[];
  enabled: boolean;
}

interface BriefingItem {
  label: string;
  detail?: string;
  status?: "success" | "warning" | "error" | "info" | "pending";
  meta?: Record<string, unknown>;
}

interface Briefing {
  id: string;
  workspaceId: string;
  generatedAt: number;
  sections: BriefingSection[];
}

const ALL_WORKSPACES_ID = "__all__";

const SECTION_ICONS: Record<string, React.ReactNode> = {
  task_summary: <CheckCircle size={14} />,
  memory_highlights: <Brain size={14} />,
  active_suggestions: <Lightbulb size={14} />,
  priority_review: <AlertTriangle size={14} />,
  upcoming_jobs: <Calendar size={14} />,
  open_loops: <Clock size={14} />,
  awareness_digest: <Sun size={14} />,
};

const STATUS_COLORS: Record<string, string> = {
  success: "#22c55e",
  warning: "#f59e0b",
  error: "#ef4444",
  info: "#3b82f6",
  pending: "#6b7280",
};

function StatusDot({ status }: { status?: string }) {
  const color = STATUS_COLORS[status || "info"] || STATUS_COLORS.info;
  return <span className="briefing-status-dot" style={{ background: color }} />;
}

export const BriefingPanel: React.FC<{ workspaceId?: string }> = ({
  workspaceId,
}) => {
  useLanguage();
  const t = translate;
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(),
  );
  const [error, setError] = useState<string | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] =
    useState<string>(ALL_WORKSPACES_ID);
  const [workspacesLoading, setWorkspacesLoading] = useState(true);

  const loadWorkspaces = useCallback(async () => {
    try {
      setWorkspacesLoading(true);
      const loaded = await (window as Any).electronAPI.listWorkspaces();
      const nonTemp: Workspace[] = (loaded || []).filter(
        (workspace: Workspace) =>
          !workspace.id.startsWith("__temp_workspace__"),
      );
      setWorkspaces(nonTemp);
      setSelectedWorkspaceId((prev) => {
        if (prev === ALL_WORKSPACES_ID) return ALL_WORKSPACES_ID;
        if (prev && nonTemp.some((workspace) => workspace.id === prev))
          return prev;
        if (
          workspaceId &&
          nonTemp.some((workspace) => workspace.id === workspaceId)
        ) {
          return workspaceId;
        }
        return ALL_WORKSPACES_ID;
      });
    } catch {
      setWorkspaces([]);
    } finally {
      setWorkspacesLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    void loadWorkspaces();
  }, [loadWorkspaces]);

  const effectiveWorkspaceId = selectedWorkspaceId;

  const loadBriefing = useCallback(async () => {
    if (!effectiveWorkspaceId) return;
    try {
      const latest = await (window as Any).electronAPI.getLatestBriefing(
        effectiveWorkspaceId,
      );
      if (latest) {
        setBriefing(latest);
        // Auto-expand all sections
        setExpandedSections(
          new Set(latest.sections.map((s: BriefingSection) => s.type)),
        );
      }
    } catch {
      // Not available yet
    }
  }, [effectiveWorkspaceId]);

  useEffect(() => {
    loadBriefing();
  }, [loadBriefing]);

  const generateBriefing = async () => {
    if (!effectiveWorkspaceId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await (window as Any).electronAPI.generateDailyBriefing?.(
        effectiveWorkspaceId,
      );
      if (result) {
        setBriefing(result);
        setExpandedSections(
          new Set(result.sections.map((s: BriefingSection) => s.type)),
        );
      }
    } catch (e: Any) {
      setError(
        e?.message ||
          t("briefing.error.generate", "Failed to generate briefing"),
      );
    } finally {
      setLoading(false);
    }
  };

  const toggleSection = (type: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  return (
    <div className="automation-page briefing-page">
      <div className="automation-page-toolbar briefing-page-toolbar">
        <div className="briefing-page-title">
          <span className="briefing-page-title-icon">
            <Sun size={17} />
          </span>
          <div>
            <h3>{t("briefing.title", "Daily Briefing")}</h3>
            <p>
              {t(
                "briefing.subtitle",
                "Summarize what needs your attention today and create a briefing that you can work on immediately.",
              )}
            </p>
          </div>
        </div>
        <button
          onClick={generateBriefing}
          disabled={loading || !effectiveWorkspaceId}
          className="button-primary briefing-generate-button"
        >
          <RefreshCw size={14} className={loading ? "spinning" : ""} />
          {loading
            ? t("briefing.generating", "Generating...")
            : t("briefing.generateNow", "Generate Now")}
        </button>
      </div>

      <div className="briefing-scope">
        <label className="briefing-scope-label">
          {t("briefing.workspace", "Workspace")}
        </label>
        {workspacesLoading ? (
          <div className="briefing-scope-loading">
            {t("briefing.loadingWorkspaces", "Loading workspaces...")}
          </div>
        ) : workspaces.length > 0 ? (
          <select
            value={effectiveWorkspaceId}
            onChange={(event) => setSelectedWorkspaceId(event.target.value)}
            className="briefing-workspace-select"
          >
            <option value={ALL_WORKSPACES_ID}>
              {t("briefing.allWorkspaces", "All Workspaces")}
            </option>
            {workspaces.map((workspace) => (
              <option key={workspace.id} value={workspace.id}>
                {workspace.name}
              </option>
            ))}
          </select>
        ) : (
          <div className="briefing-scope-loading">
            {t(
              "briefing.noWorkspace",
              "No workspace found. Create or select a workspace first.",
            )}
          </div>
        )}
      </div>

      <div className="briefing-content">
        {error && <div className="briefing-error">{error}</div>}

        {!briefing && !loading && (
          <div className="briefing-empty-state">
            <span className="briefing-empty-icon">
              <Sun size={23} />
            </span>
            <strong>{t("briefing.empty.title", "No briefing yet")}</strong>
            <p>
              {effectiveWorkspaceId
                ? t(
                    "briefing.empty.generateHint",
                    'Click "Generate Now" to create your daily briefing',
                  )
                : t(
                    "briefing.empty.selectWorkspace",
                    "Select a workspace to create a daily briefing",
                  )}
            </p>
          </div>
        )}

        {briefing && (
          <>
            <div className="briefing-generated-at">
              {t("briefing.generated", "Generated")}{" "}
              {new Date(briefing.generatedAt).toLocaleString()}
            </div>
            <div className="briefing-sections">
              {briefing.sections
                .filter((section) => section.enabled !== false)
                .map((section) => (
                  <section key={section.type} className="briefing-section">
                    <button
                      onClick={() => toggleSection(section.type)}
                      className="briefing-section-toggle"
                    >
                      {expandedSections.has(section.type) ? (
                        <ChevronDown size={14} />
                      ) : (
                        <ChevronRight size={14} />
                      )}
                      <span className="briefing-section-icon">
                        {SECTION_ICONS[section.type] || <Sun size={15} />}
                      </span>
                      <span className="briefing-section-title">
                        {t(`briefing.section.${section.type}`, section.title)}
                      </span>
                      <span className="briefing-section-count">
                        {section.items.length}
                      </span>
                    </button>
                    {expandedSections.has(section.type) && (
                      <div className="briefing-section-items">
                        {section.items.length === 0 ? (
                          <div className="briefing-nothing-to-report">
                            {t("briefing.nothingToReport", "Nothing to report")}
                          </div>
                        ) : (
                          section.items.map((item, idx) => (
                            <div key={idx} className="briefing-item">
                              <StatusDot status={item.status} />
                              <div className="briefing-item-copy">
                                <div className="briefing-item-label">
                                  {item.label}
                                </div>
                                {item.detail && (
                                  <div className="briefing-item-detail">
                                    {item.detail}
                                  </div>
                                )}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </section>
                ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
