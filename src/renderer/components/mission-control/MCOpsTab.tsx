import type {
  CoreEvalCase,
  CoreFailureCluster,
  CoreFailureRecord,
  CoreHarnessExperiment,
  CoreLearningsEntry,
} from "../../../shared/types";
import type { MissionControlData, OpsSubTab } from "./useMissionControlData";
import { translate, useLanguage } from "../../i18n";

interface MCOpsTabProps {
  data: MissionControlData;
}

const OPS_TABS: { id: OpsSubTab; labelKey: string; fallback: string }[] = [
  { id: "overview", labelKey: "mcOps.tabs.overview", fallback: "Overview" },
  { id: "harness", labelKey: "mcOps.tabs.harness", fallback: "Core Harness" },
  { id: "operators", labelKey: "mcOps.tabs.operators", fallback: "Operators" },
  {
    id: "outputs",
    labelKey: "mcOps.tabs.outputs",
    fallback: "Outputs & Review",
  },
  {
    id: "execution",
    labelKey: "mcOps.tabs.execution",
    fallback: "Execution Map",
  },
  { id: "planner", labelKey: "mcOps.tabs.planner", fallback: "Planner" },
  {
    id: "automation",
    labelKey: "mcOps.tabs.automation",
    fallback: "Automation",
  },
];

export function MCOpsTab({ data }: MCOpsTabProps) {
  useLanguage();
  const t = translate;
  const {
    opsSubTab,
    setOpsSubTab,
    selectedCompany,
    commandCenterSummary,
    commandCenterOutputs,
    commandCenterReviewQueue,
    commandCenterOperators,
    commandCenterExecutionMap,
    automationOutcomes,
    automationOutcomeSummary,
    coreFailureRecords,
    coreFailureClusters,
    coreEvalCases,
    coreExperiments,
    coreLearnings,
    plannerConfig,
    plannerRuns,
    plannerRunning,
    plannerSaving,
    plannerLoading,
    symphonyConfig,
    symphonyStatus,
    symphonySaving,
    symphonyRunning,
    selectedPlannerRunId,
    setSelectedPlannerRunId,
    selectedPlannerRun,
    plannerRunIssues,
    setSelectedIssueId,
    setDetailPanel,
    workspaces,
    agents,
    handlePlannerConfigChange,
    handleRunPlanner,
    handleSymphonyConfigChange,
    handleRunSymphony,
    formatRelativeTime,
  } = data;

  if (!selectedCompany && opsSubTab !== "harness") {
    return (
      <div className="mc-v2-empty">
        {t("mcOps.selectCompany", "Select a company to view operations.")}
      </div>
    );
  }

  return (
    <div className="mc-v2-ops">
      <nav className="mc-v2-ops-subtabs">
        {OPS_TABS.map((tab) => (
          <button
            key={tab.id}
            className={`mc-v2-ops-subtab ${opsSubTab === tab.id ? "active" : ""}`}
            onClick={() => setOpsSubTab(tab.id)}
          >
            {t(tab.labelKey, tab.fallback)}
          </button>
        ))}
      </nav>
      <div className="mc-v2-ops-content">
        {selectedCompany && opsSubTab === "overview" && (
          <OpsOverview
            company={selectedCompany}
            summary={commandCenterSummary}
          />
        )}
        {opsSubTab === "harness" && (
          <OpsHarness
            clusters={coreFailureClusters}
            failures={coreFailureRecords}
            evalCases={coreEvalCases}
            experiments={coreExperiments}
            learnings={coreLearnings}
            formatRelativeTime={formatRelativeTime}
          />
        )}
        {selectedCompany && opsSubTab === "operators" && (
          <OpsOperators
            operators={commandCenterOperators}
            formatRelativeTime={formatRelativeTime}
          />
        )}
        {selectedCompany && opsSubTab === "outputs" && (
          <OpsOutputs
            outputs={commandCenterOutputs}
            reviewQueue={commandCenterReviewQueue}
            setSelectedIssueId={setSelectedIssueId}
            setDetailPanel={setDetailPanel}
            formatRelativeTime={formatRelativeTime}
            selectedIssueId={data.selectedIssueId}
            symphonyConfig={symphonyConfig}
            symphonyStatus={symphonyStatus}
            symphonySaving={symphonySaving}
            symphonyRunning={symphonyRunning}
            onSymphonyConfigChange={handleSymphonyConfigChange}
            onRunSymphony={handleRunSymphony}
          />
        )}
        {selectedCompany && opsSubTab === "execution" && (
          <OpsExecutionMap
            executionMap={commandCenterExecutionMap}
            setSelectedIssueId={setSelectedIssueId}
            setDetailPanel={setDetailPanel}
            selectedIssueId={data.selectedIssueId}
          />
        )}
        {selectedCompany && opsSubTab === "planner" && (
          <OpsPlanner
            config={plannerConfig}
            runs={plannerRuns}
            running={plannerRunning}
            saving={plannerSaving}
            loading={plannerLoading}
            selectedRunId={selectedPlannerRunId}
            setSelectedRunId={setSelectedPlannerRunId}
            selectedRun={selectedPlannerRun}
            runIssues={plannerRunIssues}
            workspaces={workspaces}
            agents={agents}
            onConfigChange={handlePlannerConfigChange}
            onRun={handleRunPlanner}
            setSelectedIssueId={setSelectedIssueId}
            setDetailPanel={setDetailPanel}
            formatRelativeTime={formatRelativeTime}
            selectedIssueId={data.selectedIssueId}
          />
        )}
        {selectedCompany && opsSubTab === "automation" && (
          <OpsAutomation
            outcomes={automationOutcomes}
            summary={automationOutcomeSummary}
            formatRelativeTime={formatRelativeTime}
            setDetailPanel={setDetailPanel}
          />
        )}
      </div>
    </div>
  );
}

interface OpsHarnessProps {
  failures: CoreFailureRecord[];
  clusters: CoreFailureCluster[];
  evalCases: CoreEvalCase[];
  experiments: CoreHarnessExperiment[];
  learnings: CoreLearningsEntry[];
  formatRelativeTime: MissionControlData["formatRelativeTime"];
}

function OpsHarness({
  failures,
  clusters,
  evalCases,
  experiments,
  learnings,
  formatRelativeTime,
}: OpsHarnessProps) {
  useLanguage();
  const t = translate;
  return (
    <div className="mc-v2-ops-stack">
      <div className="mc-v2-ops-stats">
        {[
          {
            label: t("mcOps.harness.failureRecords", "Failure records"),
            value: failures.length,
          },
          {
            label: t("mcOps.harness.failureClusters", "Failure clusters"),
            value: clusters.length,
          },
          {
            label: t("mcOps.harness.livingEvals", "Living evals"),
            value: evalCases.length,
          },
          {
            label: t("mcOps.harness.experiments", "Experiments"),
            value: experiments.length,
          },
          {
            label: t("mcOps.harness.learnings", "Learnings"),
            value: learnings.length,
          },
        ].map((stat) => (
          <div key={stat.label} className="mc-v2-ops-stat-card">
            <span className="mc-v2-ops-stat-value">{stat.value}</span>
            <span className="mc-v2-ops-stat-label">{stat.label}</span>
          </div>
        ))}
      </div>
      <div>
        <h3 className="mc-v2-ops-heading">
          {t("mcOps.harness.recurringFailures", "Recurring failures")}
        </h3>
        <div className="mc-v2-ops-list">
          {clusters.length === 0 ? (
            <div className="mc-v2-empty mc-v2-empty-compact">
              {t(
                "mcOps.harness.emptyClusters",
                "No clustered core failures yet.",
              )}
            </div>
          ) : (
            clusters.slice(0, 8).map((cluster) => (
              <div key={cluster.id} className="mc-v2-ops-row">
                <div>
                  <div className="mc-v2-ops-row-title">
                    {cluster.rootCauseSummary}
                  </div>
                  <div className="mc-v2-ops-row-subtitle">
                    {cluster.category} ·{" "}
                    {t("mcOps.harness.recurred", "recurred {count}x", {
                      count: cluster.recurrenceCount,
                    })}
                  </div>
                </div>
                <span className="mc-v2-ops-pill">{cluster.status}</span>
              </div>
            ))
          )}
        </div>
      </div>
      <div>
        <h3 className="mc-v2-ops-heading">
          {t("mcOps.harness.recentFailures", "Recent failure records")}
        </h3>
        <div className="mc-v2-ops-list">
          {failures.length === 0 ? (
            <div className="mc-v2-empty mc-v2-empty-compact">
              {t(
                "mcOps.harness.emptyFailures",
                "No core failure records captured yet.",
              )}
            </div>
          ) : (
            failures.slice(0, 6).map((failure) => (
              <div key={failure.id} className="mc-v2-ops-row">
                <div>
                  <div className="mc-v2-ops-row-title">{failure.summary}</div>
                  <div className="mc-v2-ops-row-subtitle">
                    {failure.category} · {failure.severity} ·{" "}
                    {failure.sourceSurface}
                  </div>
                </div>
                <span className="mc-v2-ops-pill">
                  {formatRelativeTime(failure.createdAt)}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
      <div>
        <h3 className="mc-v2-ops-heading">
          {t("mcOps.harness.evalActivity", "Eval and experiment activity")}
        </h3>
        <div className="mc-v2-ops-list">
          {[...evalCases.slice(0, 4), ...experiments.slice(0, 4)].length ===
          0 ? (
            <div className="mc-v2-empty mc-v2-empty-compact">
              {t(
                "mcOps.harness.emptyEvalActivity",
                "No eval or experiment activity yet.",
              )}
            </div>
          ) : (
            <>
              {evalCases.slice(0, 4).map((item) => (
                <div key={item.id} className="mc-v2-ops-row">
                  <div>
                    <div className="mc-v2-ops-row-title">{item.title}</div>
                    <div className="mc-v2-ops-row-subtitle">
                      {t(
                        "mcOps.harness.evalCounts",
                        "passes {passes} · fails {fails}",
                        {
                          passes: item.passCount,
                          fails: item.failCount,
                        },
                      )}
                    </div>
                  </div>
                  <span className="mc-v2-ops-pill">{item.status}</span>
                </div>
              ))}
              {experiments.slice(0, 4).map((item) => (
                <div key={item.id} className="mc-v2-ops-row">
                  <div>
                    <div className="mc-v2-ops-row-title">
                      {item.summary || item.changeKind}
                    </div>
                    <div className="mc-v2-ops-row-subtitle">
                      {item.changeKind}
                    </div>
                  </div>
                  <span className="mc-v2-ops-pill">{item.status}</span>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
      <div>
        <h3 className="mc-v2-ops-heading">
          {t("mcOps.harness.recentLearnings", "Recent learnings")}
        </h3>
        <div className="mc-v2-ops-list">
          {learnings.length === 0 ? (
            <div className="mc-v2-empty mc-v2-empty-compact">
              {t(
                "mcOps.harness.emptyLearnings",
                "No core learnings recorded yet.",
              )}
            </div>
          ) : (
            learnings.slice(0, 8).map((entry) => (
              <div key={entry.id} className="mc-v2-ops-row">
                <div>
                  <div className="mc-v2-ops-row-title">{entry.summary}</div>
                  <div className="mc-v2-ops-row-subtitle">{entry.kind}</div>
                </div>
                <span className="mc-v2-ops-pill">
                  {formatRelativeTime(entry.createdAt)}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ── Ops Overview ──
function OpsOverview({ company, summary }: { company: any; summary: any }) {
  useLanguage();
  const t = translate;
  if (!summary)
    return (
      <div className="mc-v2-empty">
        {t("mcOps.overview.loading", "Loading operations data...")}
      </div>
    );
  return (
    <div className="mc-v2-ops-kpis">
      <div>
        <p className="mc-v2-ops-company-name">{company.name}</p>
        {company.description && (
          <p className="mc-v2-ops-company-desc">{company.description}</p>
        )}
      </div>
      <div className="mc-v2-ops-stats">
        {[
          {
            label: t("mcOps.overview.activeGoals", "Active goals"),
            value: summary.overview.activeGoalCount,
          },
          {
            label: t("mcOps.overview.activeProjects", "Active projects"),
            value: summary.overview.activeProjectCount,
          },
          {
            label: t("mcOps.overview.openIssues", "Open issues"),
            value: summary.overview.openIssueCount,
          },
          {
            label: t("mcOps.overview.pendingReview", "Pending review"),
            value: summary.overview.pendingReviewCount,
          },
          {
            label: t("mcOps.overview.valuableOutputs", "Valuable outputs"),
            value: summary.overview.valuableOutputCount,
          },
        ].map((stat) => (
          <div key={stat.label} className="mc-v2-ops-stat-card">
            <span className="mc-v2-ops-stat-value">{stat.value}</span>
            <span className="mc-v2-ops-stat-label">{stat.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function OpsAutomation({
  outcomes,
  summary,
  formatRelativeTime,
  setDetailPanel,
}: {
  outcomes: any[];
  summary: any;
  formatRelativeTime: (t?: number) => string;
  setDetailPanel: (panel: any) => void;
}) {
  useLanguage();
  const t = translate;
  const stats = summary || {
    total: 0,
    actionable: 0,
    informational: 0,
    lowValue: 0,
    failed: 0,
  };
  return (
    <div className="mc-v2-ops-stack">
      <div className="mc-v2-ops-stats">
        {[
          { label: t("mcOps.automation.runs", "Runs"), value: stats.total },
          {
            label: t("mcOps.automation.actionable", "Actionable"),
            value: stats.actionable,
          },
          {
            label: t("mcOps.automation.informational", "Informational"),
            value: stats.informational,
          },
          {
            label: t("mcOps.automation.lowValue", "Low value"),
            value: stats.lowValue,
          },
          {
            label: t("mcOps.automation.failed", "Failed"),
            value: stats.failed,
          },
        ].map((stat) => (
          <div key={stat.label} className="mc-v2-ops-stat-card">
            <span className="mc-v2-ops-stat-value">{stat.value}</span>
            <span className="mc-v2-ops-stat-label">{stat.label}</span>
          </div>
        ))}
      </div>
      <div>
        <h3 className="mc-v2-ops-heading">
          {t("mcOps.automation.recentOutcomes", "Recent Automation Outcomes")}
        </h3>
        <div className="mc-v2-ops-list">
          {outcomes.length === 0 ? (
            <div className="mc-v2-empty mc-v2-empty-compact">
              {t(
                "mcOps.automation.emptyOutcomes",
                "No automation outcomes recorded yet.",
              )}
            </div>
          ) : (
            outcomes.map((outcome) => {
              const clickable = Boolean(outcome.taskId);
              const RowTag = clickable ? "button" : "div";
              return (
                <RowTag
                  key={outcome.id}
                  type={clickable ? "button" : undefined}
                  className={`mc-v2-ops-row ${clickable ? "mc-v2-ops-row-btn" : ""}`}
                  onClick={() => {
                    if (outcome.taskId)
                      setDetailPanel({ kind: "task", taskId: outcome.taskId });
                  }}
                >
                  <div>
                    <div className="mc-v2-ops-row-title">{outcome.title}</div>
                    <div className="mc-v2-ops-row-subtitle">
                      {outcome.source} · {formatRelativeTime(outcome.createdAt)}
                    </div>
                    <div className="mc-v2-ops-row-subtitle">
                      {outcome.summary}
                    </div>
                    {outcome.nextAction && (
                      <div className="mc-v2-ops-row-subtitle">
                        {t("mcOps.automation.next", "Next: {action}", {
                          action: outcome.nextAction,
                        })}
                      </div>
                    )}
                  </div>
                  <span
                    className={`mc-v2-ops-pill status-${outcome.usefulness}`}
                  >
                    {String(outcome.usefulness).replace("_", " ")}
                  </span>
                </RowTag>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

// ── Ops Operators ──
function OpsOperators({
  operators,
  formatRelativeTime,
}: {
  operators: any[];
  formatRelativeTime: (t?: number) => string;
}) {
  useLanguage();
  const t = translate;
  if (operators.length === 0) {
    return (
      <div className="mc-v2-empty">
        {t("mcOps.operators.empty", "No operators linked to this company yet.")}
      </div>
    );
  }
  return (
    <div className="mc-v2-ops-operators">
      {operators.map((op: any) => (
        <div key={op.agentRoleId} className="mc-v2-ops-row">
          <div>
            <div className="mc-v2-ops-row-title">
              <span style={{ color: op.color }}>
                {op.icon} {op.displayName}
              </span>
            </div>
            <div className="mc-v2-ops-row-subtitle">
              {(op.operatorMandate ||
                t("mcOps.operators.noMandate", "No mandate set")) +
                (op.currentBottleneck
                  ? ` · ${t("mcOps.operators.bottleneck", "Bottleneck: {value}", { value: op.currentBottleneck })}`
                  : "")}
            </div>
            <div className="mc-v2-ops-row-subtitle">
              {t(
                "mcOps.operators.lastUsefulOutput",
                "Last useful output {time}",
                {
                  time: op.lastUsefulOutputAt
                    ? formatRelativeTime(op.lastUsefulOutputAt)
                    : t("common.never", "never"),
                },
              )}{" "}
              ·{" "}
              {t("mcOps.operators.heartbeat", "heartbeat {status}", {
                status: op.heartbeatStatus || "idle",
              })}
            </div>
          </div>
          <span className="mc-v2-ops-pill">
            {typeof op.operatorHealthScore === "number"
              ? t("mcOps.operators.health", "{percent} health", {
                  percent: Math.round(op.operatorHealthScore * 100),
                })
              : op.activeLoop || "idle"}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Ops Outputs & Review ──
function OpsOutputs({
  outputs,
  reviewQueue,
  setSelectedIssueId,
  setDetailPanel,
  formatRelativeTime,
  selectedIssueId,
}: any) {
  useLanguage();
  const t = translate;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <h3
          style={{
            margin: "0 0 10px",
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: 0.5,
            color: "var(--color-text-secondary)",
            textTransform: "uppercase" as const,
          }}
        >
          {t("mcOps.outputs.feed", "Operations Feed")}
        </h3>
        <div className="mc-v2-ops-list">
          {outputs.length === 0 ? (
            <div className="mc-v2-empty" style={{ padding: "12px 0" }}>
              {t("mcOps.outputs.empty", "No valuable outputs yet.")}
            </div>
          ) : (
            outputs.map((output: any) => (
              <button
                key={output.id}
                type="button"
                className={`mc-v2-ops-row mc-v2-ops-row-btn ${selectedIssueId === output.issueId ? "selected" : ""}`}
                onClick={() => {
                  if (output.issueId) {
                    setSelectedIssueId(output.issueId);
                    setDetailPanel({ kind: "issue", issueId: output.issueId });
                  }
                }}
              >
                <div>
                  <div className="mc-v2-ops-row-title">
                    {output.title}
                    {output.originLabel && (
                      <span
                        style={{ marginLeft: 8 }}
                        className="mc-v2-ops-pill"
                      >
                        {output.originLabel}
                      </span>
                    )}
                  </div>
                  <div className="mc-v2-ops-row-subtitle">
                    {output.outputType} · {output.valueReason}
                  </div>
                  {(output.whatChanged || output.nextStep) && (
                    <div className="mc-v2-ops-row-subtitle">
                      {[output.whatChanged, output.nextStep]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  )}
                </div>
                <span
                  className={`mc-v2-ops-pill status-${output.status || "idle"}`}
                >
                  {output.reviewRequired
                    ? t("mcOps.outputs.review", "review")
                    : output.outputType}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
      <div>
        <h3
          style={{
            margin: "0 0 10px",
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: 0.5,
            color: "var(--color-text-secondary)",
            textTransform: "uppercase" as const,
          }}
        >
          {t("mcOps.outputs.reviewQueue", "Review Queue")}
        </h3>
        <div className="mc-v2-ops-list">
          {reviewQueue.length === 0 ? (
            <div className="mc-v2-empty" style={{ padding: "12px 0" }}>
              {t(
                "mcOps.outputs.emptyReviewQueue",
                "No human review gates queued.",
              )}
            </div>
          ) : (
            reviewQueue.map((item: any) => (
              <button
                key={item.id}
                type="button"
                className={`mc-v2-ops-row mc-v2-ops-row-btn ${selectedIssueId === item.issueId ? "selected" : ""}`}
                onClick={() => {
                  if (item.issueId) {
                    setSelectedIssueId(item.issueId);
                    setDetailPanel({ kind: "issue", issueId: item.issueId });
                  }
                }}
              >
                <div>
                  <div className="mc-v2-ops-row-title">
                    {item.title}
                    {item.originLabel && (
                      <span
                        style={{ marginLeft: 8 }}
                        className="mc-v2-ops-pill"
                      >
                        {item.originLabel}
                      </span>
                    )}
                  </div>
                  <div className="mc-v2-ops-row-subtitle">
                    {item.reviewReason} · {item.outputType || item.sourceType}
                  </div>
                  {item.summary && (
                    <div className="mc-v2-ops-row-subtitle">{item.summary}</div>
                  )}
                </div>
                <span className="mc-v2-ops-pill">
                  {formatRelativeTime(item.createdAt)}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ── Ops Execution Map ──
function OpsExecutionMap({
  executionMap,
  setSelectedIssueId,
  setDetailPanel,
  selectedIssueId,
}: any) {
  useLanguage();
  const t = translate;
  if (executionMap.length === 0) {
    return (
      <div className="mc-v2-empty">
        {t("mcOps.execution.empty", "No execution lineage yet.")}
      </div>
    );
  }
  return (
    <div className="mc-v2-ops-execution-map">
      {executionMap.slice(0, 20).map((entry: any) => (
        <button
          key={entry.issueId}
          type="button"
          className={`mc-v2-ops-row mc-v2-ops-row-btn ${selectedIssueId === entry.issueId ? "selected" : ""}`}
          onClick={() => {
            setSelectedIssueId(entry.issueId);
            setDetailPanel({ kind: "issue", issueId: entry.issueId });
          }}
        >
          <div>
            <div className="mc-v2-ops-row-title">
              {entry.issueTitle}
              {entry.originLabel && (
                <span style={{ marginLeft: 8 }} className="mc-v2-ops-pill">
                  {entry.originLabel}
                </span>
              )}
            </div>
            <div className="mc-v2-ops-row-subtitle">
              {[
                entry.goalTitle,
                entry.projectName,
                entry.outputType,
                entry.taskStatus ? `task:${entry.taskStatus}` : undefined,
              ]
                .filter(Boolean)
                .join(" · ")}
            </div>
          </div>
          <span className={`mc-v2-ops-pill status-${entry.issueStatus}`}>
            {entry.stale
              ? t("mcOps.execution.stale", "stale")
              : entry.issueStatus}
          </span>
        </button>
      ))}
    </div>
  );
}

// ── Ops Planner ──
function OpsPlanner({
  config,
  runs,
  running,
  saving,
  loading,
  selectedRunId,
  setSelectedRunId,
  selectedRun,
  runIssues,
  workspaces,
  agents,
  onConfigChange,
  onRun,
  setSelectedIssueId,
  setDetailPanel,
  formatRelativeTime,
  selectedIssueId,
  symphonyConfig,
  symphonyStatus,
  symphonySaving,
  symphonyRunning,
  onSymphonyConfigChange,
  onRunSymphony,
}: any) {
  useLanguage();
  const t = translate;
  return (
    <div className="mc-v2-planner-config">
      <div className="mc-v2-detail-section">
        <div className="mc-v2-planner-status-row">
          <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>Symphony</h3>
          <span
            className={`mc-v2-planner-status-badge ${symphonyConfig?.enabled ? "enabled" : "disabled"}`}
          >
            {symphonyConfig?.enabled
              ? t("common.enabled", "Enabled")
              : t("common.disabled", "Disabled")}
          </span>
          {symphonySaving && (
            <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
              {t("common.saving", "Saving...")}
            </span>
          )}
          {symphonyRunning && (
            <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
              {t("common.running", "Running...")}
            </span>
          )}
        </div>
        {symphonyConfig && (
          <div className="mc-v2-planner-fields">
            <label className="mc-v2-planner-field checkbox">
              <input
                type="checkbox"
                checked={symphonyConfig.enabled}
                onChange={(e) =>
                  void onSymphonyConfigChange({ enabled: e.target.checked })
                }
              />
              <span>{t("mcOps.planner.watchIssues", "Watch issues")}</span>
            </label>
            <label className="mc-v2-planner-field">
              <span>{t("common.workspace", "Workspace")}</span>
              <select
                value={symphonyConfig.workspaceId || ""}
                onChange={(e) =>
                  void onSymphonyConfigChange({
                    workspaceId: e.target.value || null,
                  })
                }
              >
                <option value="">
                  {t("mcOps.planner.firstWorkspace", "First workspace")}
                </option>
                {workspaces.map((w: any) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="mc-v2-planner-field">
              <span>{t("mcOps.planner.runtime", "Runtime")}</span>
              <select
                value={symphonyConfig.runtimeMode}
                onChange={(e) =>
                  void onSymphonyConfigChange({ runtimeMode: e.target.value })
                }
              >
                <option value="native">Native</option>
                <option value="acpx">acpx</option>
              </select>
            </label>
            <label className="mc-v2-planner-field">
              <span>{t("mcOps.planner.parallel", "Parallel")}</span>
              <input
                type="number"
                min={1}
                max={20}
                value={symphonyConfig.maxConcurrentIssueRuns}
                onChange={(e) =>
                  void onSymphonyConfigChange({
                    maxConcurrentIssueRuns: Math.max(
                      1,
                      Number(e.target.value) || 1,
                    ),
                  })
                }
              />
            </label>
            <button
              className="mc-v2-icon-btn"
              onClick={() => void onRunSymphony()}
              disabled={symphonyRunning}
            >
              {symphonyRunning
                ? t("common.running", "Running...")
                : t("mcOps.planner.runSymphony", "Run Symphony")}
            </button>
          </div>
        )}
        {symphonyStatus && (
          <div className="mc-v2-planner-run-detail">
            <div className="mc-v2-planner-run-metrics">
              <span>
                {t("mcOps.planner.activeCount", "{count} active", {
                  count: symphonyStatus.activeRuns.length,
                })}
              </span>
              <span>
                {t("mcOps.planner.retryingCount", "{count} retrying", {
                  count: symphonyStatus.retryQueue.length,
                })}
              </span>
              <span>
                {symphonyStatus.workflow.error
                  ? t("mcOps.planner.workflowBlocked", "workflow blocked")
                  : t("mcOps.planner.workflowReady", "workflow ready")}
              </span>
            </div>
            {(symphonyStatus.workflow.error || symphonyStatus.lastError) && (
              <div className="mc-v2-empty" style={{ padding: "8px 0" }}>
                {symphonyStatus.workflow.error || symphonyStatus.lastError}
              </div>
            )}
            <div className="mc-v2-ops-list">
              {symphonyStatus.latestDispatches.length === 0 ? (
                <div className="mc-v2-empty" style={{ padding: "8px 0" }}>
                  {t(
                    "mcOps.planner.emptyDispatches",
                    "No Symphony dispatches yet.",
                  )}
                </div>
              ) : (
                symphonyStatus.latestDispatches.map((issue: any) => (
                  <button
                    key={issue.issueId}
                    type="button"
                    className={`mc-v2-ops-row mc-v2-ops-row-btn ${selectedIssueId === issue.issueId ? "selected" : ""}`}
                    onClick={() => {
                      setSelectedIssueId(issue.issueId);
                      setDetailPanel({ kind: "issue", issueId: issue.issueId });
                    }}
                  >
                    <div>
                      <div className="mc-v2-ops-row-title">{issue.title}</div>
                      <div className="mc-v2-ops-row-subtitle">
                        {issue.lastDispatchAt
                          ? formatRelativeTime(issue.lastDispatchAt)
                          : t("mcOps.planner.dispatched", "dispatched")}
                      </div>
                    </div>
                    <span className={`mc-v2-ops-pill status-${issue.status}`}>
                      {issue.status}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      <div className="mc-v2-planner-status-row">
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>
          {t("mcOps.planner.strategicPlanner", "Strategic Planner")}
        </h3>
        <span
          className={`mc-v2-planner-status-badge ${config?.enabled ? "enabled" : "disabled"}`}
        >
          {config?.enabled
            ? t("common.enabled", "Enabled")
            : t("common.disabled", "Disabled")}
        </span>
        {saving && (
          <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
            {t("common.saving", "Saving...")}
          </span>
        )}
        {loading && (
          <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
            {t("common.loading", "Loading...")}
          </span>
        )}
      </div>

      {config && (
        <div className="mc-v2-planner-fields">
          <label className="mc-v2-planner-field checkbox">
            <input
              type="checkbox"
              checked={config.enabled}
              onChange={(e) =>
                void onConfigChange({ enabled: e.target.checked })
              }
            />
            <span>{t("mcOps.planner.scheduleRuns", "Schedule runs")}</span>
          </label>
          <label className="mc-v2-planner-field checkbox">
            <input
              type="checkbox"
              checked={config.autoDispatch}
              onChange={(e) =>
                void onConfigChange({ autoDispatch: e.target.checked })
              }
            />
            <span>{t("mcOps.planner.autoDispatch", "Auto-dispatch")}</span>
          </label>
          <label className="mc-v2-planner-field">
            <span>{t("mcOps.planner.interval", "Interval")}</span>
            <input
              type="number"
              min={5}
              step={5}
              value={config.intervalMinutes}
              onChange={(e) =>
                void onConfigChange({
                  intervalMinutes: Math.max(5, Number(e.target.value) || 5),
                })
              }
            />
          </label>
          <label className="mc-v2-planner-field">
            <span>{t("common.workspace", "Workspace")}</span>
            <select
              value={config.planningWorkspaceId || ""}
              onChange={(e) =>
                void onConfigChange({
                  planningWorkspaceId: e.target.value || null,
                })
              }
            >
              <option value="">{t("common.none", "None")}</option>
              {workspaces.map((w: any) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>
          <label className="mc-v2-planner-field">
            <span>{t("mcOps.planner.agent", "Agent")}</span>
            <select
              value={config.plannerAgentRoleId || ""}
              onChange={(e) =>
                void onConfigChange({
                  plannerAgentRoleId: e.target.value || null,
                })
              }
            >
              <option value="">
                {t("mcOps.planner.autoPick", "Auto-pick")}
              </option>
              {agents
                .filter((a: any) => a.isActive)
                .map((a: any) => (
                  <option key={a.id} value={a.id}>
                    {a.displayName}
                  </option>
                ))}
            </select>
          </label>
          <label className="mc-v2-planner-field">
            <span>{t("mcOps.planner.approval", "Approval")}</span>
            <select
              value={config.approvalPreset}
              onChange={(e) =>
                void onConfigChange({ approvalPreset: e.target.value })
              }
            >
              <option value="manual">
                {t("mcOps.planner.approvalManual", "Manual")}
              </option>
              <option value="safe_autonomy">
                {t("mcOps.planner.approvalSafeAutonomy", "Safe autonomy")}
              </option>
              <option value="founder_edge">
                {t("mcOps.planner.approvalFounderEdge", "Founder edge")}
              </option>
            </select>
          </label>
          <button
            className="mc-v2-icon-btn"
            onClick={() => void onRun()}
            disabled={running}
          >
            {running
              ? t("common.running", "Running...")
              : t("mcOps.planner.runPlanner", "Run Planner")}
          </button>
        </div>
      )}

      <div className="mc-v2-detail-section">
        <h4>{t("mcOps.planner.recentRuns", "Recent Runs")}</h4>
        <div className="mc-v2-planner-runs">
          {runs.length === 0 ? (
            <div className="mc-v2-empty" style={{ padding: "12px 0" }}>
              {t("mcOps.planner.emptyRuns", "No planner runs yet.")}
            </div>
          ) : (
            runs.map((run: any) => (
              <button
                key={run.id}
                className={`mc-v2-planner-run ${selectedRunId === run.id ? "selected" : ""}`}
                onClick={() => {
                  setSelectedRunId(run.id);
                  const md = run.metadata as any;
                  const nextId =
                    md?.createdIssueIds?.[0] || md?.updatedIssueIds?.[0];
                  if (nextId) {
                    setSelectedIssueId(nextId);
                    setDetailPanel({ kind: "issue", issueId: nextId });
                  }
                }}
                type="button"
              >
                <div className="mc-v2-planner-run-main">
                  <span className={`mc-v2-planner-run-status ${run.status}`}>
                    {run.status}
                  </span>
                  <span className="mc-v2-planner-run-summary">
                    {run.summary ||
                      t(
                        "mcOps.planner.runSummary",
                        "{created} created, {dispatched} dispatched",
                        {
                          created: run.createdIssueCount,
                          dispatched: run.dispatchedTaskCount,
                        },
                      )}
                  </span>
                </div>
                <span className="mc-v2-planner-run-time">
                  {new Date(run.createdAt).toLocaleString([], {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </button>
            ))
          )}
        </div>
      </div>

      {selectedRun && (
        <div className="mc-v2-planner-run-detail">
          <div className="mc-v2-ops-row">
            <div>
              <div className="mc-v2-ops-row-title">
                {selectedRun.summary ||
                  t("mcOps.planner.cycle", "Planner cycle")}
              </div>
              <div className="mc-v2-ops-row-subtitle">
                {selectedRun.trigger} ·{" "}
                {formatRelativeTime(selectedRun.createdAt)}
              </div>
            </div>
            <span className={`mc-v2-ops-pill status-${selectedRun.status}`}>
              {selectedRun.status}
            </span>
          </div>
          <div className="mc-v2-planner-run-metrics">
            <span>
              {t("mcOps.planner.createdCount", "{count} created", {
                count: selectedRun.createdIssueCount,
              })}
            </span>
            <span>
              {t("mcOps.planner.updatedCount", "{count} updated", {
                count: selectedRun.updatedIssueCount,
              })}
            </span>
            <span>
              {t("mcOps.planner.dispatchedCount", "{count} dispatched", {
                count: selectedRun.dispatchedTaskCount,
              })}
            </span>
          </div>
          <div className="mc-v2-ops-list">
            {runIssues.length === 0 ? (
              <div className="mc-v2-empty" style={{ padding: "8px 0" }}>
                {t(
                  "mcOps.planner.emptyIssueDetails",
                  "No issue details for this planner cycle.",
                )}
              </div>
            ) : (
              runIssues.map((issue: any) => (
                <button
                  key={issue.id}
                  type="button"
                  className={`mc-v2-ops-row mc-v2-ops-row-btn ${selectedIssueId === issue.id ? "selected" : ""}`}
                  onClick={() => {
                    setSelectedIssueId(issue.id);
                    setDetailPanel({ kind: "issue", issueId: issue.id });
                  }}
                >
                  <div>
                    <div className="mc-v2-ops-row-title">{issue.title}</div>
                    <div className="mc-v2-ops-row-subtitle">
                      {issue.projectId
                        ? t("mcOps.planner.projectLinked", "Project-linked")
                        : t("mcOps.planner.goalLinked", "Goal-linked")}
                    </div>
                  </div>
                  <span className={`mc-v2-ops-pill status-${issue.status}`}>
                    {issue.status}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
