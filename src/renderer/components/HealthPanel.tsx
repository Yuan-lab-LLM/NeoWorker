import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Brain,
  CalendarHeart,
  CheckCircle2,
  CircleAlert,
  Plus,
  RefreshCw,
  Sparkles,
  Upload,
  X,
  HeartPulse,
} from "lucide-react";
import {
  HEALTH_SOURCE_TEMPLATES,
  type HealthDashboard,
  type HealthSource,
  type HealthSourceInput,
  type HealthWritebackItem,
  type HealthWritebackPreview,
  type HealthWorkflow,
  type HealthWorkflowType,
} from "../../shared/health";
import type { ReactNode } from "react";
import { translate, useLanguage } from "../i18n";

interface HealthPanelProps {
  compact?: boolean;
  onOpenSettings?: () => void;
  onCreateTask?: (title: string, prompt: string) => void;
}

type SourceFormState = {
  provider: HealthSourceInput["provider"];
  kind: HealthSourceInput["kind"];
  name: string;
  description: string;
  accountLabel: string;
  notes: string;
};

const WORKFLOW_ACTIONS: Array<{
  workflowType: HealthWorkflowType;
  title: string;
  description: string;
  icon: ReactNode;
}> = [
  {
    workflowType: "marathon-training",
    title: "Marathon training",
    description: "Adaptive plan from recovery, steps, and training load.",
    icon: <ArrowRight size={14} />,
  },
  {
    workflowType: "visit-prep",
    title: "Visit prep",
    description: "Clinician-ready summary of the important signals.",
    icon: <CalendarHeart size={14} />,
  },
  {
    workflowType: "nutrition-plan",
    title: "Nutrition plan",
    description: "Food guidance that reflects your activity and labs.",
    icon: <Sparkles size={14} />,
  },
  {
    workflowType: "trend-analysis",
    title: "What changed",
    description: "A compact view of the biggest shifts in the data.",
    icon: <Brain size={14} />,
  },
];

function formatTime(timestamp?: number): string {
  if (!timestamp) return "Just now";
  return new Date(timestamp).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function workflowPrompt(workflow: HealthWorkflow): string {
  const sections = workflow.sections
    .map(
      (section) =>
        `## ${section.title}\n${section.items.map((item) => `- ${item}`).join("\n")}`,
    )
    .join("\n\n");
  return [`${workflow.title}`, workflow.summary, sections, workflow.disclaimer]
    .filter(Boolean)
    .join("\n\n");
}

function healthSourceTemplateName(
  template: (typeof HEALTH_SOURCE_TEMPLATES)[number],
): string {
  return translate(
    `health.sourceTemplate.${template.provider}.name`,
    template.name,
  );
}

function healthSourceTemplateDescription(
  template: (typeof HEALTH_SOURCE_TEMPLATES)[number],
): string {
  return translate(
    `health.sourceTemplate.${template.provider}.description`,
    template.description,
  );
}

function healthSourceName(
  source: HealthSource,
  template?: (typeof HEALTH_SOURCE_TEMPLATES)[number],
): string {
  if (!template || source.name !== template.name) return source.name;
  return healthSourceTemplateName(template);
}

function healthSourceDescription(
  source: HealthSource,
  template?: (typeof HEALTH_SOURCE_TEMPLATES)[number],
): string {
  if (!template || source.description !== template.description)
    return source.description;
  return healthSourceTemplateDescription(template);
}

function buildDefaultForm(): SourceFormState {
  const first = HEALTH_SOURCE_TEMPLATES[0];
  return {
    provider: first.provider,
    kind: first.kind,
    name: healthSourceTemplateName(first),
    description: healthSourceTemplateDescription(first),
    accountLabel: "",
    notes: "",
  };
}

export function HealthPanel({
  compact = false,
  onOpenSettings,
  onCreateTask,
}: HealthPanelProps) {
  useLanguage();
  const t = translate;
  const [dashboard, setDashboard] = useState<HealthDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sourceForm, setSourceForm] =
    useState<SourceFormState>(buildDefaultForm);
  const [showSourceForm, setShowSourceForm] = useState(false);
  const [workflowBusy, setWorkflowBusy] = useState<HealthWorkflowType | null>(
    null,
  );
  const [workingSourceId, setWorkingSourceId] = useState<string | null>(null);
  const [selectedWorkflow, setSelectedWorkflow] =
    useState<HealthWorkflow | null>(null);
  const [writebackPreview, setWritebackPreview] =
    useState<HealthWritebackPreview | null>(null);
  const [writebackItems, setWritebackItems] = useState<HealthWritebackItem[]>(
    [],
  );
  const [writebackSource, setWritebackSource] = useState<HealthSource | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = async () => {
    try {
      setError(null);
      const next = await window.electronAPI.getHealthDashboard();
      setDashboard(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadDashboard();
  }, []);

  const templateMap = useMemo(
    () =>
      new Map(
        HEALTH_SOURCE_TEMPLATES.map((template) => [
          template.provider,
          template,
        ]),
      ),
    [],
  );

  const topMetrics = useMemo(() => {
    if (!dashboard) return [];
    const seen = new Set<string>();
    const result: HealthDashboard["metrics"] = [];
    for (const metric of dashboard.metrics) {
      if (seen.has(metric.key)) continue;
      seen.add(metric.key);
      result.push(metric);
      if (result.length >= 5) break;
    }
    return result;
  }, [dashboard]);

  const handleTemplateSelect = (provider: HealthSourceInput["provider"]) => {
    const template = templateMap.get(provider);
    if (!template) return;
    setSourceForm((current) => ({
      ...current,
      provider,
      kind: template.kind,
      name: healthSourceTemplateName(template),
      description: healthSourceTemplateDescription(template),
    }));
  };

  const handleCreateSource = async () => {
    try {
      setWorkingSourceId("new");
      const source = await window.electronAPI.upsertHealthSource({
        provider: sourceForm.provider,
        kind: sourceForm.kind,
        name: sourceForm.name,
        description: sourceForm.description,
        accountLabel: sourceForm.accountLabel,
        notes: sourceForm.notes,
      });
      if (source.provider === "apple-health") {
        const result = await window.electronAPI.connectAppleHealth({
          sourceId: source.id,
        });
        if (!result.success) {
          throw new Error(result.error || "Unable to connect Apple Health.");
        }
      } else {
        await window.electronAPI.syncHealthSource(source.id);
      }
      setShowSourceForm(false);
      setSourceForm(buildDefaultForm());
      await loadDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setWorkingSourceId(null);
    }
  };

  const handleSyncSource = async (sourceId: string) => {
    try {
      setWorkingSourceId(sourceId);
      await window.electronAPI.syncHealthSource(sourceId);
      await loadDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setWorkingSourceId(null);
    }
  };

  const handleConnectAppleHealth = async (source: HealthSource) => {
    try {
      setWorkingSourceId(source.id);
      const result = await window.electronAPI.connectAppleHealth({
        sourceId: source.id,
        connectionMode: source.connectionMode || "native",
      });
      if (!result.success) {
        throw new Error(result.error || "Unable to connect Apple Health.");
      }
      await loadDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setWorkingSourceId(null);
    }
  };

  const handleDisableSource = async (source: HealthSource) => {
    try {
      setWorkingSourceId(source.id);
      if (source.provider === "apple-health") {
        await window.electronAPI.resetAppleHealth(source.id);
      } else {
        await window.electronAPI.removeHealthSource(source.id);
      }
      await loadDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setWorkingSourceId(null);
    }
  };

  const handleImportFiles = async (sourceId: string) => {
    try {
      setWorkingSourceId(sourceId);
      const files = await window.electronAPI.selectFiles();
      if (!files?.length) return;
      await window.electronAPI.importHealthFiles(
        sourceId,
        files.map((file) => file.path),
      );
      await loadDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setWorkingSourceId(null);
    }
  };

  const handleGenerateWorkflow = async (workflowType: HealthWorkflowType) => {
    try {
      setWorkflowBusy(workflowType);
      const result = await window.electronAPI.generateHealthWorkflow({
        workflowType,
      });
      if (result.workflow) {
        setSelectedWorkflow(result.workflow);
        if (onCreateTask) {
          onCreateTask(result.workflow.title, workflowPrompt(result.workflow));
        }
      }
      await loadDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setWorkflowBusy(null);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadDashboard();
  };

  const buildAppleHealthWritebackItems = (
    source: HealthSource,
  ): HealthWritebackItem[] => {
    if (!dashboard) return [];
    const sourceMetrics = dashboard.metrics.filter(
      (metric) => metric.sourceId === source.id,
    );
    return sourceMetrics.slice(0, 4).map((metric, index) => ({
      id: `${source.id}-writeback-${index}`,
      type:
        metric.key === "steps"
          ? "steps"
          : metric.key === "sleep_minutes"
            ? "sleep"
            : metric.key === "resting_hr"
              ? "heart_rate"
              : metric.key === "hrv"
                ? "hrv"
                : metric.key === "weight"
                  ? "weight"
                  : metric.key === "glucose"
                    ? "glucose"
                    : "custom",
      label: metric.label,
      value: metric.value.toFixed(metric.value % 1 === 0 ? 0 : 1),
      unit: metric.unit || undefined,
      sourceId: source.id,
    }));
  };

  const handlePreviewWriteback = async (source: HealthSource) => {
    try {
      setWorkingSourceId(source.id);
      const items = buildAppleHealthWritebackItems(source);
      setWritebackItems(items);
      const result = await window.electronAPI.previewAppleHealthWriteback({
        sourceId: source.id,
        items,
      });
      if (!result.success || !result.preview) {
        throw new Error(
          result.error || "Unable to preview Apple Health writeback.",
        );
      }
      setWritebackSource(source);
      setWritebackPreview(result.preview);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setWorkingSourceId(null);
    }
  };

  const handleApplyWriteback = async () => {
    if (!writebackSource) return;
    try {
      setWorkingSourceId(writebackSource.id);
      const result = await window.electronAPI.applyAppleHealthWriteback({
        sourceId: writebackSource.id,
        items: writebackItems,
      });
      if (!result.success) {
        throw new Error(
          result.error || "Unable to apply Apple Health writeback.",
        );
      }
      setWritebackPreview(null);
      setWritebackSource(null);
      setWritebackItems([]);
      await loadDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setWorkingSourceId(null);
    }
  };

  const sourceCount = dashboard?.stats.sourceCount || 0;
  const connectedCount = dashboard?.stats.connectedCount || 0;
  const recordCount = dashboard?.stats.recordsCount || 0;
  const insightCount = dashboard?.stats.insightsCount || 0;

  if (loading) {
    return (
      <div className="health-panel">
        <div className="devices-loading">
          {t("health.loading", "Loading health dashboard…")}
        </div>
      </div>
    );
  }

  return (
    <div className={`health-panel ${compact ? "compact" : ""}`}>
      <div className="dp-header">
        <h1 className="dp-title">{t("health.title", "Health")}</h1>
      </div>

      <div className="dp-input-box health-hero-box">
        <div className="health-hero-grid">
          <div className="health-hero-copy">
            <h2 className="health-hero-title">
              {t(
                "health.hero.title",
                "Personal health data, organized for action",
              )}
            </h2>
            <p className="health-hero-desc">
              {t(
                "health.hero.description",
                "Connect wearables, lab results, and medical records. Track what changed, review the important signals, and turn the data into grounded workflows.",
              )}
            </p>
            <div className="health-hero-actions">
              <button
                className="dp-primary-btn"
                onClick={() => setShowSourceForm(true)}
              >
                <Plus size={14} />
                {t("health.addSource", "Add source")}
              </button>
              <button
                className="dp-secondary-btn"
                onClick={handleRefresh}
                disabled={refreshing}
              >
                <RefreshCw size={14} className={refreshing ? "dp-spin" : ""} />
                {t("health.refresh", "Refresh")}
              </button>
              {onOpenSettings && (
                <button className="dp-secondary-btn" onClick={onOpenSettings}>
                  {t("health.openSettings", "Open settings")}
                </button>
              )}
            </div>
          </div>
          <div className="health-summary-grid">
            <div className="health-stat-cell">
              <span className="health-stat-label">
                {t("health.stats.sources", "Sources")}
              </span>
              <strong>{sourceCount}</strong>
            </div>
            <div className="health-stat-cell">
              <span className="health-stat-label">
                {t("health.stats.connected", "Connected")}
              </span>
              <strong>{connectedCount}</strong>
            </div>
            <div className="health-stat-cell">
              <span className="health-stat-label">
                {t("health.stats.records", "Records")}
              </span>
              <strong>{recordCount}</strong>
            </div>
            <div className="health-stat-cell">
              <span className="health-stat-label">
                {t("health.stats.insights", "Insights")}
              </span>
              <strong>{insightCount}</strong>
            </div>
            <p className="health-summary-note">
              {dashboard?.isDemo
                ? t(
                    "health.demoNote",
                    "Demo data is shown until you connect your own sources.",
                  )
                : t(
                    "health.localNote",
                    "All source data is stored locally and encrypted in the app database.",
                  )}
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="health-banner health-banner-error">
          <CircleAlert size={14} />
          <span>{error}</span>
        </div>
      )}

      {dashboard?.isDemo && (
        <div className="health-banner health-banner-info">
          <Sparkles size={14} />
          <span>
            {t(
              "health.demoBanner",
              "This view is seeded with demo data so the dashboard is useful on first launch.",
            )}
          </span>
        </div>
      )}

      <div className="dp-section">
        <div className="dp-section-header">
          <span className="dp-section-label">
            {t("health.currentSignals", "Current signals")}
          </span>
          <span className="health-section-desc">
            {t(
              "health.currentSignalsDesc",
              "Latest metrics from your connected sources",
            )}
          </span>
        </div>
        <div className="health-metric-grid">
          {topMetrics.map((metric) => (
            <article
              key={`${metric.sourceId}:${metric.key}`}
              className="dp-task-card health-metric-card"
            >
              <span className="health-metric-label">{metric.label}</span>
              <strong>
                {Number.isFinite(metric.value)
                  ? metric.value.toFixed(metric.value % 1 === 0 ? 0 : 1)
                  : "—"}{" "}
                <span>{metric.unit}</span>
              </strong>
              <span className={`health-trend ${metric.trend || "stable"}`}>
                {metric.trend === "up"
                  ? t("health.trend.up", "Up")
                  : metric.trend === "down"
                    ? t("health.trend.down", "Down")
                    : t("health.trend.stable", "Stable")}
              </span>
              <small>{metric.sourceLabel}</small>
            </article>
          ))}
          {topMetrics.length === 0 && (
            <div className="dp-placeholder health-empty-wide">
              <CircleAlert size={20} />
              <span>
                {t(
                  "health.empty.metrics",
                  "No health metrics yet. Add a source or import a file to begin.",
                )}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="dp-section">
        <div className="dp-section-header">
          <span className="dp-section-label">
            {t("health.sources", "Sources")}
          </span>
          <span className="health-section-desc">
            {t("health.sourcesDesc", "Wearables, labs, and records")}
          </span>
        </div>
        <div className="health-source-grid">
          {(dashboard?.sources || []).map((source) => (
            <article
              key={source.id}
              className={`dp-task-card health-source-card ${source.status}`}
            >
              <div className="health-source-top">
                <div>
                  <h3>
                    {healthSourceName(source, templateMap.get(source.provider))}
                  </h3>
                  <p>
                    {healthSourceDescription(
                      source,
                      templateMap.get(source.provider),
                    )}
                  </p>
                </div>
                <div className="health-source-badges">
                  <div className="health-source-status">
                    <span
                      className={`dp-status-dot ${
                        source.status === "connected"
                          ? "online"
                          : source.status === "syncing"
                            ? "syncing"
                            : "off"
                      }`}
                    />
                    <span
                      className={`health-source-status-label ${
                        source.status === "connected"
                          ? "online"
                          : source.status === "syncing"
                            ? "syncing"
                            : "off"
                      }`}
                    >
                      {source.status === "connected"
                        ? t("health.status.connected", "Connected")
                        : source.status === "syncing"
                          ? t("health.status.syncing", "Syncing")
                          : source.status.replace("-", " ")}
                    </span>
                  </div>
                  {source.provider === "apple-health" && (
                    <span className="health-pill accent">
                      {source.connectionMode === "native"
                        ? "HealthKit"
                        : t("health.importOnly", "Import only")}
                    </span>
                  )}
                </div>
              </div>
              <div className="health-source-meta">
                <span>{source.accountLabel || source.provider}</span>
                <span>
                  {formatTime(source.lastSyncedAt || source.updatedAt)}
                </span>
              </div>
              {source.provider === "apple-health" && (
                <div className="health-source-details">
                  <span>{source.permissionState || "not-determined"}</span>
                  <span>{source.readableTypes?.length || 0} read types</span>
                  <span>{source.writableTypes?.length || 0} write types</span>
                </div>
              )}
              {source.syncHistory?.[0] && (
                <p className="health-source-history">
                  Latest {source.syncHistory[0].action} ·{" "}
                  {source.syncHistory[0].status}
                </p>
              )}
              <div className="health-source-actions">
                {source.provider === "apple-health" &&
                source.connectionMode === "native" ? (
                  <>
                    {source.permissionState !== "authorized" &&
                    source.permissionState !== "import-only" ? (
                      <button
                        className="dp-secondary-btn"
                        onClick={() => handleConnectAppleHealth(source)}
                        disabled={workingSourceId === source.id}
                      >
                        {workingSourceId === source.id
                          ? t("health.working", "Working...")
                          : t("health.connect", "Connect")}
                      </button>
                    ) : null}
                    <button
                      className="dp-secondary-btn"
                      onClick={() => handlePreviewWriteback(source)}
                      disabled={
                        workingSourceId === source.id ||
                        source.permissionState !== "authorized"
                      }
                    >
                      <HeartPulse size={14} />
                      {t("health.writeback", "Writeback")}
                    </button>
                    <button
                      className="dp-secondary-btn"
                      onClick={() => handleSyncSource(source.id)}
                      disabled={
                        workingSourceId === source.id ||
                        source.permissionState !== "authorized"
                      }
                    >
                      {workingSourceId === source.id
                        ? t("health.working", "Working...")
                        : t("health.sync", "Sync")}
                    </button>
                  </>
                ) : (
                  <button
                    className="dp-secondary-btn"
                    onClick={() => handleImportFiles(source.id)}
                    disabled={workingSourceId === source.id}
                  >
                    <Upload size={14} />
                    {t("health.import", "Import")}
                  </button>
                )}
                <button
                  className="dp-ghost-btn"
                  onClick={() => handleDisableSource(source)}
                  disabled={workingSourceId === source.id}
                >
                  {source.provider === "apple-health"
                    ? t("health.remove", "Remove")
                    : t("health.disable", "Disable")}
                </button>
              </div>
              {source.provider === "apple-health" &&
                source.connectionMode !== "native" && (
                  <p className="health-source-note">
                    {t(
                      "health.appleHealthMacHint",
                      "Native Apple Health requires macOS. On this device, use export import instead.",
                    )}
                  </p>
                )}
            </article>
          ))}
          {(dashboard?.sources || []).length === 0 && (
            <div className="dp-placeholder health-empty-wide">
              <CheckCircle2 size={20} />
              <span>
                {t(
                  "health.empty.sources",
                  "No sources yet. Add a wearable, lab feed, or medical record source.",
                )}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="dp-section">
        <div className="dp-section-header">
          <span className="dp-section-label">
            {t("health.workflowStudio", "Workflow studio")}
          </span>
          <span className="health-section-desc">
            {t(
              "health.workflowStudioDesc",
              "Generate an actionable summary from the current health state",
            )}
          </span>
        </div>
        <div className="health-workflow-grid">
          {WORKFLOW_ACTIONS.map((action) => (
            <button
              key={action.workflowType}
              type="button"
              className="dp-task-card health-workflow-card"
              onClick={() => handleGenerateWorkflow(action.workflowType)}
              disabled={workflowBusy !== null}
            >
              <div className="health-workflow-icon">{action.icon}</div>
              <div className="health-workflow-copy">
                <strong>
                  {t(
                    `health.workflow.${action.workflowType}.title`,
                    action.title,
                  )}
                </strong>
                <span>
                  {t(
                    `health.workflow.${action.workflowType}.description`,
                    action.description,
                  )}
                </span>
              </div>
              <span className="health-workflow-go">
                {workflowBusy === action.workflowType
                  ? t("health.working", "Working...")
                  : t("health.generate", "Generate")}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="health-columns">
        <div className="dp-section">
          <div className="dp-section-header">
            <span className="dp-section-label">
              {t("health.insights", "Insights")}
            </span>
            <span className="health-section-desc">
              {t("health.insightsDesc", "What the data suggests right now")}
            </span>
          </div>
          <div className="health-list">
            {(dashboard?.insights || []).slice(0, 5).map((insight) => (
              <div
                key={insight.id}
                className={`dp-task-card health-list-item ${insight.severity}`}
              >
                <div>
                  <strong>{insight.title}</strong>
                  <p>{insight.summary}</p>
                </div>
                <small>{formatTime(insight.createdAt)}</small>
              </div>
            ))}
            {(dashboard?.insights || []).length === 0 && (
              <div className="dp-placeholder">
                {t("health.empty.insights", "No derived insights yet.")}
              </div>
            )}
          </div>
        </div>

        <div className="dp-section">
          <div className="dp-section-header">
            <span className="dp-section-label">
              {t("health.recentRecords", "Recent records")}
            </span>
            <span className="health-section-desc">
              {t(
                "health.recentRecordsDesc",
                "Imported notes, labs, and summaries",
              )}
            </span>
          </div>
          <div className="health-list">
            {(dashboard?.records || []).slice(0, 5).map((record) => (
              <div
                key={record.id}
                className="dp-task-card health-list-item record"
              >
                <div>
                  <strong>{record.title}</strong>
                  <p>{record.summary}</p>
                </div>
                <small>{formatTime(record.recordedAt)}</small>
              </div>
            ))}
            {(dashboard?.records || []).length === 0 && (
              <div className="dp-placeholder">
                {t("health.empty.records", "No records imported yet.")}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="dp-section">
        <div className="dp-section-header">
          <span className="dp-section-label">
            {t("health.latestWorkflow", "Latest workflow")}
          </span>
          <span className="health-section-desc">
            {t("health.latestWorkflowDesc", "Last generated health plan")}
          </span>
        </div>
        {selectedWorkflow || dashboard?.workflows?.[0] ? (
          <WorkflowCard
            workflow={selectedWorkflow || dashboard!.workflows[0]}
            onCreateTask={onCreateTask}
          />
        ) : (
          <div className="dp-placeholder health-empty-wide">
            <Sparkles size={20} />
            <span>
              {t(
                "health.empty.workflow",
                "Generate a workflow to see a personalized training or visit-prep plan here.",
              )}
            </span>
          </div>
        )}
      </div>

      <div className="dp-section health-footer-note">
        <p>
          {t(
            "health.disclaimer",
            "Health guidance is informational only. It should not be used as a diagnosis or a replacement for professional care.",
          )}
        </p>
      </div>

      {showSourceForm && (
        <div
          className="health-modal-backdrop"
          onClick={() => setShowSourceForm(false)}
        >
          <div
            className="dp-input-box health-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="health-modal-head">
              <div>
                <h3 className="dp-section-label">
                  {t("health.addSource", "Add source")}
                </h3>
                <p className="health-modal-desc">
                  {t(
                    "health.addSourceDesc",
                    "Connect a wearable, lab feed, or record source.",
                  )}
                </p>
              </div>
              <button
                type="button"
                className="dp-ghost-btn health-icon-btn"
                onClick={() => setShowSourceForm(false)}
                aria-label={t("common.close", "Close")}
              >
                <X size={14} />
              </button>
            </div>

            <div className="health-form-grid">
              <label>
                {t("health.source", "Source")}
                <select
                  value={sourceForm.provider}
                  onChange={(event) =>
                    handleTemplateSelect(
                      event.target.value as HealthSourceInput["provider"],
                    )
                  }
                >
                  {HEALTH_SOURCE_TEMPLATES.map((template) => (
                    <option key={template.provider} value={template.provider}>
                      {healthSourceTemplateName(template)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t("health.type", "Type")}
                <select
                  value={sourceForm.kind}
                  onChange={(event) =>
                    setSourceForm((current) => ({
                      ...current,
                      kind: event.target.value as HealthSourceInput["kind"],
                    }))
                  }
                >
                  <option value="wearable">
                    {t("health.sourceType.wearable", "Wearable")}
                  </option>
                  <option value="lab">
                    {t("health.sourceType.lab", "Lab")}
                  </option>
                  <option value="record">
                    {t("health.sourceType.record", "Medical record")}
                  </option>
                  <option value="manual">
                    {t("health.sourceType.manual", "Manual")}
                  </option>
                </select>
              </label>
              <label className="span-2">
                {t("health.displayName", "Display name")}
                <input
                  value={sourceForm.name}
                  onChange={(event) =>
                    setSourceForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  placeholder={t(
                    "health.displayNamePlaceholder",
                    "My Apple Health",
                  )}
                />
              </label>
              <label className="span-2">
                {t("health.accountLabel", "Account label")}
                <input
                  value={sourceForm.accountLabel}
                  onChange={(event) =>
                    setSourceForm((current) => ({
                      ...current,
                      accountLabel: event.target.value,
                    }))
                  }
                  placeholder={t(
                    "health.accountLabelPlaceholder",
                    "Optional label",
                  )}
                />
              </label>
              <label className="span-2">
                {t("health.description", "Description")}
                <textarea
                  value={sourceForm.description}
                  onChange={(event) =>
                    setSourceForm((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                  rows={3}
                />
              </label>
              <label className="span-2">
                {t("health.notes", "Notes")}
                <textarea
                  value={sourceForm.notes}
                  onChange={(event) =>
                    setSourceForm((current) => ({
                      ...current,
                      notes: event.target.value,
                    }))
                  }
                  rows={3}
                  placeholder={t(
                    "health.notesPlaceholder",
                    "Optional context, such as a clinician or device note.",
                  )}
                />
              </label>
            </div>

            <div className="health-modal-actions">
              <button
                className="dp-secondary-btn"
                onClick={() => setShowSourceForm(false)}
              >
                {t("common.cancel", "Cancel")}
              </button>
              <button className="dp-primary-btn" onClick={handleCreateSource}>
                {t("health.addSource", "Add source")}
              </button>
            </div>
          </div>
        </div>
      )}

      {writebackPreview && writebackSource && (
        <div
          className="health-modal-backdrop"
          onClick={() => setWritebackPreview(null)}
        >
          <div
            className="dp-input-box health-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="health-modal-head">
              <div>
                <h3 className="dp-section-label">
                  {t("health.reviewWriteback", "Review Apple Health writeback")}
                </h3>
                <p className="health-modal-desc">
                  {t(
                    "health.reviewWritebackDesc",
                    "Confirm the items that will be written to {source}.",
                    { source: writebackPreview.sourceLabel },
                  )}
                </p>
              </div>
              <button
                type="button"
                className="dp-ghost-btn health-icon-btn"
                onClick={() => setWritebackPreview(null)}
                aria-label={t("common.close", "Close")}
              >
                <X size={14} />
              </button>
            </div>

            <div className="health-writeback-preview">
              <div className="health-writeback-summary">
                <span
                  className={`health-pill ${writebackPreview.connectionMode}`}
                >
                  {writebackPreview.connectionMode === "native"
                    ? t("health.healthKitWriteback", "HealthKit writeback")
                    : t("health.importOnly", "Import only")}
                </span>
                <p>
                  {t(
                    "health.writebackItemsPrepared",
                    "{count} item(s) prepared for Apple Health.",
                    { count: writebackPreview.items.length },
                  )}
                </p>
              </div>
              {writebackPreview.warnings.length > 0 && (
                <div className="health-writeback-warnings">
                  {writebackPreview.warnings.map((warning) => (
                    <div
                      key={warning}
                      className="health-banner health-banner-info"
                    >
                      <CircleAlert size={14} />
                      <span>{warning}</span>
                    </div>
                  ))}
                </div>
              )}
              <ul className="health-writeback-items">
                {writebackPreview.items.map((item) => (
                  <li key={item.id}>
                    <strong>{item.label}</strong>
                    <span>
                      {item.value}
                      {item.unit ? ` ${item.unit}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="health-modal-actions">
              <button
                className="dp-secondary-btn"
                onClick={() => setWritebackPreview(null)}
              >
                {t("common.cancel", "Cancel")}
              </button>
              <button className="dp-primary-btn" onClick={handleApplyWriteback}>
                {t("health.applyWriteback", "Apply writeback")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function WorkflowCard({
  workflow,
  onCreateTask,
}: {
  workflow: HealthWorkflow;
  onCreateTask?: (title: string, prompt: string) => void;
}) {
  return (
    <article className="dp-task-card health-workflow-preview">
      <div className="health-workflow-preview-head">
        <div>
          <span className="health-pill accent">
            {workflow.workflowType.replace("-", " ")}
          </span>
          <h3>{workflow.title}</h3>
          <p>{workflow.summary}</p>
        </div>
        <span className="health-workflow-time">
          {formatTime(workflow.createdAt)}
        </span>
      </div>
      <div className="health-workflow-sections">
        {workflow.sections.map((section) => (
          <section key={section.title} className="health-workflow-section">
            <h4>{section.title}</h4>
            <ul>
              {section.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <div className="health-workflow-footer">
        <span>{workflow.disclaimer}</span>
        {onCreateTask && (
          <button
            className="dp-secondary-btn"
            onClick={() =>
              onCreateTask(workflow.title, workflowPrompt(workflow))
            }
          >
            {translate("health.createTask", "Create task")}
          </button>
        )}
      </div>
    </article>
  );
}
