import { useEffect, useMemo, useState } from "react";
import { BrainCircuit } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { translate, useLanguage } from "../i18n";
import type {
  SubconsciousBrainSummary,
  SubconsciousRun,
  SubconsciousSettings,
  SubconsciousTargetDetail,
  SubconsciousTargetSummary,
} from "../../shared/subconscious";
import {
  DEFAULT_SUBCONSCIOUS_SETTINGS,
  SUBCONSCIOUS_TARGET_KINDS,
} from "../../shared/subconscious";

function formatTimestamp(value?: number): string {
  if (!value) return translate("common.never", "Never");
  return new Date(value).toLocaleString();
}

function formatOutcome(value?: string): string {
  return value ? value.replace(/_/g, " ") : translate("common.none", "none");
}

function isUsefulOutcome(value?: string): boolean {
  return value === "dispatch" || value === "notify" || value === "suggest";
}

function formatPercent(value?: number): string {
  if (typeof value !== "number") return "n/a";
  return `${Math.round(value * 100)}%`;
}

function runImpactLabel(run?: SubconsciousRun): string {
  if (!run) return translate("subconscious.impact.noRuns", "No runs yet");
  if (run.dispatchStatus === "dispatched") {
    return translate("subconscious.impact.followUp", "Created follow-up work");
  }
  if (run.dispatchStatus === "completed") {
    return translate(
      "subconscious.impact.delivered",
      "Delivered a visible outcome",
    );
  }
  if (run.permissionDecision === "escalated") {
    return translate("subconscious.impact.waiting", "Waiting for your input");
  }
  if (run.outcome === "sleep")
    return translate("subconscious.impact.quiet", "Correctly stayed quiet");
  if (run.outcome === "failed")
    return translate("subconscious.impact.attention", "Needs attention");
  if (isUsefulOutcome(run.outcome)) {
    return translate(
      "subconscious.impact.recommendation",
      "Produced a recommendation",
    );
  }
  return translate("subconscious.impact.context", "Recorded context only");
}

const mdPlugins = [remarkGfm, remarkBreaks];

function Md({ text }: { text: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={mdPlugins}
      components={{ p: ({ children }) => <span>{children}</span> }}
    >
      {text}
    </ReactMarkdown>
  );
}

export function SubconsciousSettingsPanel(props?: {
  initialWorkspaceId?: string;
  onOpenTask?: (taskId: string) => void;
}) {
  useLanguage();
  const t = translate;
  const [settings, setSettings] = useState<SubconsciousSettings>(
    DEFAULT_SUBCONSCIOUS_SETTINGS,
  );
  const [brain, setBrain] = useState<SubconsciousBrainSummary | null>(null);
  const [targets, setTargets] = useState<SubconsciousTargetSummary[]>([]);
  const [selectedTargetKey, setSelectedTargetKey] = useState("");
  const [detail, setDetail] = useState<SubconsciousTargetDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const activeRuns = useMemo(
    () =>
      detail?.recentRuns.filter((run) =>
        [
          "collecting_evidence",
          "ideating",
          "critiquing",
          "synthesizing",
          "dispatching",
        ].includes(run.stage),
      ) || [],
    [detail],
  );
  const valueLedger = useMemo(() => {
    const recentCutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const recentTargets = targets.filter(
      (target) =>
        (target.lastRunAt || target.lastActionAt || 0) >= recentCutoff,
    );
    const dispatched = recentTargets.filter(
      (target) => target.lastDispatchStatus === "dispatched",
    ).length;
    const suggested = recentTargets.filter(
      (target) => target.lastMeaningfulOutcome === "suggest",
    ).length;
    const quiet = recentTargets.filter(
      (target) => target.lastMeaningfulOutcome === "sleep",
    ).length;
    const attention = targets.filter(
      (target) =>
        target.health === "blocked" || target.lastMeaningfulOutcome === "defer",
    ).length;
    return {
      dispatched,
      suggested,
      quiet,
      attention,
      useful: dispatched + suggested,
    };
  }, [targets]);
  const selectedValue = useMemo(() => {
    const latestRun = detail?.recentRuns[0];
    const dispatch = detail?.dispatchHistory[0];
    const topEvidence =
      detail?.latestEvidence.slice(0, 3).map((item) => item.summary) || [];
    return {
      latestRun,
      dispatch,
      topEvidence,
      impact: runImpactLabel(latestRun),
      confidence: formatPercent(latestRun?.confidence),
      evidenceFreshness: formatPercent(latestRun?.evidenceFreshness),
    };
  }, [detail]);

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!selectedTargetKey) return;
    void loadTargetDetail(selectedTargetKey);
  }, [selectedTargetKey]);

  const load = async () => {
    try {
      setLoading(true);
      const [nextSettings, nextBrain, nextTargets] = await Promise.all([
        window.electronAPI
          .getSubconsciousSettings()
          .catch(() => DEFAULT_SUBCONSCIOUS_SETTINGS),
        window.electronAPI.getSubconsciousBrain().catch(() => null),
        window.electronAPI
          .listSubconsciousTargets(props?.initialWorkspaceId)
          .catch(() => [] as SubconsciousTargetSummary[]),
      ]);
      setSettings(nextSettings || DEFAULT_SUBCONSCIOUS_SETTINGS);
      setBrain(nextBrain);
      setTargets(nextTargets);
      const preferred =
        nextTargets.find((target) => target.key === selectedTargetKey)?.key ||
        nextTargets[0]?.key ||
        "";
      setSelectedTargetKey(preferred);
      if (preferred) {
        await loadTargetDetail(preferred);
      } else {
        setDetail(null);
      }
    } finally {
      setLoading(false);
    }
  };

  const loadTargetDetail = async (targetKey: string) => {
    const next =
      await window.electronAPI.getSubconsciousTargetDetail(targetKey);
    setDetail(next);
  };

  const saveSettings = async (updates: Partial<SubconsciousSettings>) => {
    const next: SubconsciousSettings = {
      ...settings,
      ...updates,
      dispatchDefaults: {
        ...settings.dispatchDefaults,
        ...updates.dispatchDefaults,
        defaultKinds: {
          ...settings.dispatchDefaults.defaultKinds,
          ...updates.dispatchDefaults?.defaultKinds,
        },
      },
      perExecutorPolicy: {
        ...settings.perExecutorPolicy,
        ...updates.perExecutorPolicy,
        codeChangeTask: {
          ...settings.perExecutorPolicy.codeChangeTask,
          ...updates.perExecutorPolicy?.codeChangeTask,
        },
      },
    };
    try {
      setBusy(true);
      const saved = await window.electronAPI.saveSubconsciousSettings(next);
      setSettings(saved);
      setMessage(
        t(
          "subconscious.message.saved",
          "Workflow Intelligence settings saved.",
        ),
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const runNow = async (targetKey?: string) => {
    try {
      setBusy(true);
      const run = await window.electronAPI.runSubconsciousNow(targetKey);
      setMessage(
        run
          ? t(
              "subconscious.message.runCompleted",
              "Run {id} completed at stage {stage}.",
              {
                id: run.id,
                stage: run.stage,
              },
            )
          : t(
              "subconscious.message.noEligibleTarget",
              "No eligible target was selected.",
            ),
      );
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const refresh = async () => {
    try {
      setBusy(true);
      const result = await window.electronAPI.refreshSubconsciousTargets();
      setMessage(
        t(
          "subconscious.message.refreshed",
          "Refreshed {targets} targets from {evidence} evidence signal(s).",
          {
            targets: result.targetCount,
            evidence: result.evidenceCount,
          },
        ),
      );
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const dismissTarget = async () => {
    if (!selectedTargetKey) return;
    try {
      setBusy(true);
      await window.electronAPI.dismissSubconsciousTarget(selectedTargetKey);
      setMessage(
        t(
          "subconscious.message.dismissed",
          "Target dismissed from the active queue.",
        ),
      );
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const resetHistory = async () => {
    const confirmed = window.confirm(
      t(
        "subconscious.confirm.reset",
        "Delete workflow intelligence history, hypotheses, critiques, decisions, backlog, and dispatch records?",
      ),
    );
    if (!confirmed) return;
    try {
      setBusy(true);
      const result = await window.electronAPI.resetSubconsciousHistory();
      const total =
        result.deleted.targets +
        result.deleted.runs +
        result.deleted.hypotheses +
        result.deleted.critiques +
        result.deleted.decisions +
        result.deleted.backlogItems +
        result.deleted.dispatchRecords;
      setMessage(
        t(
          "subconscious.message.reset",
          "Reset workflow intelligence history. Removed {count} record(s).",
          {
            count: total,
          },
        ),
      );
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="sc-loading">
        {t("subconscious.loading", "Loading workflow intelligence settings...")}
      </div>
    );
  }

  return (
    <div className="automation-page sc-panel">
      {/* Header */}
      <div>
        <span className="automation-page-heading-icon" aria-hidden="true">
          <BrainCircuit size={18} />
        </span>
        <div className="sc-header">
          <h2 className="sc-title">
            {t("subconscious.title", "Workflow Intelligence")}
          </h2>
        </div>
        <p className="sc-subtitle">
          {t(
            "subconscious.subtitle",
            "Memory, heartbeat, and reflection working together to surface useful next actions across workflows.",
          )}
        </p>
      </div>

      {message ? <div className="sc-message">{message}</div> : null}

      {/* Status cards */}
      <div className="sc-status-row">
        <div className="sc-status-card">
          <div className="sc-status-label">
            {t("subconscious.status.workflow", "Workflow Intelligence")}
          </div>
          <div className="sc-status-value">
            {brain?.status || t("common.idle", "idle")}
          </div>
          <div className="sc-status-meta">
            {t(
              "subconscious.status.triggeredByHeartbeat",
              "Triggered by heartbeat",
            )}{" "}
            | {settings.autonomyMode.replace(/_/g, " ")}
          </div>
        </div>
        <div className="sc-status-card">
          <div className="sc-status-label">
            {t("subconscious.status.targets", "Targets")}
          </div>
          <div className="sc-status-value">
            {brain?.targetCount || targets.length}
          </div>
          <div className="sc-status-meta">
            {t("subconscious.status.activeRuns", "Active runs: {count}", {
              count: brain?.activeRunCount || 0,
            })}
          </div>
        </div>
        <div className="sc-status-card">
          <div className="sc-status-label">
            {t("subconscious.status.latestRun", "Latest Run / Reflection")}
          </div>
          <div className="sc-status-value" style={{ fontSize: 16 }}>
            {formatTimestamp(brain?.lastRunAt)}
          </div>
          <div className="sc-status-meta">
            {t("subconscious.status.reflection", "Reflection: {time}", {
              time: formatTimestamp(brain?.lastDreamAt),
            })}
          </div>
        </div>
      </div>

      <div>
        <div className="sc-card-title">
          {t("subconscious.week.title", "What Changed This Week")}
        </div>
        <div className="sc-status-row">
          <div className="sc-status-card">
            <div className="sc-status-label">
              {t("subconscious.week.usefulOutputs", "Useful Outputs")}
            </div>
            <div className="sc-status-value">{valueLedger.useful}</div>
            <div className="sc-status-meta">
              {t(
                "subconscious.week.usefulMeta",
                "{tasks} task(s), {suggestions} suggestion(s)",
                {
                  tasks: valueLedger.dispatched,
                  suggestions: valueLedger.suggested,
                },
              )}
            </div>
          </div>
          <div className="sc-status-card">
            <div className="sc-status-label">
              {t("subconscious.week.noiseAvoided", "Noise Avoided")}
            </div>
            <div className="sc-status-value">{valueLedger.quiet}</div>
            <div className="sc-status-meta">
              {t("subconscious.week.noiseMeta", "targets intentionally slept")}
            </div>
          </div>
          <div className="sc-status-card">
            <div className="sc-status-label">
              {t("subconscious.week.needsAttention", "Needs Attention")}
            </div>
            <div className="sc-status-value">{valueLedger.attention}</div>
            <div className="sc-status-meta">
              {t(
                "subconscious.week.attentionMeta",
                "blocked or waiting targets",
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Policy controls */}
      <div className="sc-card">
        <div className="sc-card-title">
          {t("subconscious.policy.title", "Policy Controls")}
        </div>
        <div className="sc-controls-grid">
          <label className="sc-checkbox">
            <input
              type="checkbox"
              checked={settings.enabled}
              disabled={busy}
              onChange={(event) =>
                void saveSettings({ enabled: event.target.checked })
              }
            />
            <span>
              {t("subconscious.policy.enable", "Enable Workflow Intelligence")}
            </span>
          </label>
          <label className="sc-checkbox">
            <input
              type="checkbox"
              checked={settings.autoRun}
              disabled={busy}
              onChange={(event) =>
                void saveSettings({ autoRun: event.target.checked })
              }
            />
            <span>
              {t(
                "subconscious.policy.heartbeatReflection",
                "Heartbeat-triggered reflection",
              )}
            </span>
          </label>
          <label className="sc-checkbox">
            <input
              type="checkbox"
              checked={settings.dispatchDefaults.autoDispatch}
              disabled={busy}
              onChange={(event) =>
                void saveSettings({
                  dispatchDefaults: {
                    ...settings.dispatchDefaults,
                    autoDispatch: event.target.checked,
                  },
                })
              }
            />
            <span>
              {t(
                "subconscious.policy.autoCreate",
                "Auto-create after trusted patterns",
              )}
            </span>
          </label>
          <label className="sc-checkbox">
            <input
              type="checkbox"
              checked={settings.journalingEnabled}
              disabled={busy}
              onChange={(event) =>
                void saveSettings({ journalingEnabled: event.target.checked })
              }
            />
            <span>
              {t("subconscious.policy.dailyJournaling", "Daily journaling")}
            </span>
          </label>
          <label className="sc-checkbox">
            <input
              type="checkbox"
              checked={settings.dreamsEnabled}
              disabled={busy}
              onChange={(event) =>
                void saveSettings({ dreamsEnabled: event.target.checked })
              }
            />
            <span>
              {t(
                "subconscious.policy.reflectionDistillation",
                "Reflection distillation",
              )}
            </span>
          </label>
          <label className="sc-checkbox">
            <input
              type="checkbox"
              checked={settings.catchUpOnRestart}
              disabled={busy}
              onChange={(event) =>
                void saveSettings({ catchUpOnRestart: event.target.checked })
              }
            />
            <span>
              {t(
                "subconscious.policy.catchUp",
                "Catch up on restart through heartbeat",
              )}
            </span>
          </label>
          <label className="sc-input-group">
            <span className="sc-input-label">
              {t(
                "subconscious.policy.reviewWindow",
                "Heartbeat review window (minutes)",
              )}
            </span>
            <input
              type="number"
              min={15}
              value={settings.cadenceMinutes}
              disabled={busy}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  cadenceMinutes: Number(event.target.value || 15),
                }))
              }
              onBlur={() =>
                void saveSettings({ cadenceMinutes: settings.cadenceMinutes })
              }
            />
          </label>
          <label className="sc-input-group">
            <span className="sc-input-label">
              {t(
                "subconscious.policy.synthesisCadence",
                "Synthesis cadence (hours)",
              )}
            </span>
            <input
              type="number"
              min={1}
              value={settings.dreamCadenceHours}
              disabled={busy}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  dreamCadenceHours: Number(event.target.value || 24),
                }))
              }
              onBlur={() =>
                void saveSettings({
                  dreamCadenceHours: settings.dreamCadenceHours,
                })
              }
            />
          </label>
          <label className="sc-input-group">
            <span className="sc-input-label">
              {t("subconscious.policy.hypotheses", "Hypotheses per run")}
            </span>
            <input
              type="number"
              min={3}
              max={5}
              value={settings.maxHypothesesPerRun}
              disabled={busy}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  maxHypothesesPerRun: Number(event.target.value || 3),
                }))
              }
              onBlur={() =>
                void saveSettings({
                  maxHypothesesPerRun: settings.maxHypothesesPerRun,
                })
              }
            />
          </label>
          <label className="sc-input-group">
            <span className="sc-input-label">
              {t("subconscious.policy.retention", "Artifact retention (days)")}
            </span>
            <input
              type="number"
              min={1}
              value={settings.artifactRetentionDays}
              disabled={busy}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  artifactRetentionDays: Number(event.target.value || 1),
                }))
              }
              onBlur={() =>
                void saveSettings({
                  artifactRetentionDays: settings.artifactRetentionDays,
                })
              }
            />
          </label>
          <label className="sc-input-group">
            <span className="sc-input-label">
              {t("subconscious.policy.autonomyMode", "Autonomy mode")}
            </span>
            <select
              value={settings.autonomyMode}
              disabled={busy}
              onChange={(event) =>
                void saveSettings({
                  autonomyMode: event.target
                    .value as SubconsciousSettings["autonomyMode"],
                })
              }
            >
              <option value="recommendation_first">
                {t(
                  "subconscious.autonomy.recommendationFirst",
                  "recommendation first",
                )}
              </option>
              <option value="balanced_autopilot">
                {t(
                  "subconscious.autonomy.balancedAutopilot",
                  "balanced autopilot",
                )}
              </option>
              <option value="strong_autonomy">
                {t("subconscious.autonomy.strongAutonomy", "strong autonomy")}
              </option>
            </select>
          </label>
        </div>
        <div className="sc-target-kinds">
          <div className="sc-target-kinds-label">
            {t(
              "subconscious.policy.enabledTargetKinds",
              "Enabled target kinds",
            )}
          </div>
          <div className="sc-target-kinds-row">
            {SUBCONSCIOUS_TARGET_KINDS.map((kind) => {
              const isActive = settings.enabledTargetKinds.includes(kind);
              return (
                <label
                  key={kind}
                  className={`sc-kind-chip${isActive ? " active" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={isActive}
                    disabled={busy}
                    onChange={(event) => {
                      const nextKinds = event.target.checked
                        ? [...settings.enabledTargetKinds, kind]
                        : settings.enabledTargetKinds.filter(
                            (entry) => entry !== kind,
                          );
                      void saveSettings({
                        enabledTargetKinds: nextKinds.length
                          ? nextKinds
                          : [kind],
                      });
                    }}
                  />
                  <span>{kind}</span>
                </label>
              );
            })}
          </div>
        </div>
        <div className="sc-target-kinds">
          <div className="sc-target-kinds-label">
            {t(
              "subconscious.policy.durableTargetKinds",
              "Durable target kinds",
            )}
          </div>
          <div className="sc-target-kinds-row">
            {SUBCONSCIOUS_TARGET_KINDS.map((kind) => {
              const isActive = settings.durableTargetKinds.includes(kind);
              return (
                <label
                  key={`durable-${kind}`}
                  className={`sc-kind-chip${isActive ? " active" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={isActive}
                    disabled={busy}
                    onChange={(event) => {
                      const nextKinds = event.target.checked
                        ? [...new Set([...settings.durableTargetKinds, kind])]
                        : settings.durableTargetKinds.filter(
                            (entry) => entry !== kind,
                          );
                      void saveSettings({ durableTargetKinds: nextKinds });
                    }}
                  />
                  <span>{kind}</span>
                </label>
              );
            })}
          </div>
        </div>
        <div className="sc-target-kinds">
          <div className="sc-target-kinds-label">
            {t(
              "subconscious.policy.notificationIntents",
              "Notification intents",
            )}
          </div>
          <div className="sc-target-kinds-row">
            {[
              [
                "inputNeeded",
                t("subconscious.notification.inputNeeded", "input needed"),
              ],
              [
                "importantActionTaken",
                t(
                  "subconscious.notification.importantAction",
                  "important action",
                ),
              ],
              [
                "completedWhileAway",
                t(
                  "subconscious.notification.completedWhileAway",
                  "completed while away",
                ),
              ],
            ].map(([key, label]) => (
              <label key={key} className="sc-kind-chip active">
                <input
                  type="checkbox"
                  checked={
                    settings.notificationPolicy[
                      key as keyof SubconsciousSettings["notificationPolicy"]
                    ] as boolean
                  }
                  disabled={busy}
                  onChange={(event) =>
                    void saveSettings({
                      notificationPolicy: {
                        ...settings.notificationPolicy,
                        [key]: event.target.checked,
                      },
                    })
                  }
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="sc-actions">
        <button
          className="sc-btn primary"
          disabled={busy}
          onClick={() => void refresh()}
        >
          {t("subconscious.action.refreshEvidence", "Refresh Evidence")}
        </button>
        <button
          className="sc-btn primary"
          disabled={busy}
          onClick={() => void runNow()}
        >
          {t("subconscious.action.runGlobal", "Run Global Reflection")}
        </button>
        <button
          className="sc-btn"
          disabled={busy || !selectedTargetKey}
          onClick={() => void runNow(selectedTargetKey)}
        >
          {t("subconscious.action.runSelected", "Run Selected Target")}
        </button>
        <button
          className="sc-btn"
          disabled={busy || !selectedTargetKey}
          onClick={() => void dismissTarget()}
        >
          {t("subconscious.action.dismissTarget", "Dismiss Target")}
        </button>
        <button
          className="sc-btn danger"
          disabled={busy}
          onClick={() => void resetHistory()}
        >
          {t("subconscious.action.resetHistory", "Reset History")}
        </button>
      </div>

      {/* Targets + detail */}
      <div className="sc-body">
        {/* Left: target list */}
        <div className="sc-card">
          <div className="sc-card-title">
            {t("subconscious.targets.title", "Targets")}
          </div>
          <div className="sc-targets-list">
            {targets.map((target) => (
              <button
                key={target.key}
                type="button"
                onClick={() => setSelectedTargetKey(target.key)}
                className={`sc-target-btn${selectedTargetKey === target.key ? " selected" : ""}`}
              >
                <div className="sc-target-top">
                  <span className="sc-target-name">{target.target.label}</span>
                  <span className={`sc-target-health ${target.health}`}>
                    <span className="sc-health-dot" />
                    {target.health}
                  </span>
                </div>
                <div className="sc-target-meta">
                  {target.target.kind} | {target.persistence} |{" "}
                  {t("subconscious.targets.backlogMeta", "backlog {count}", {
                    count: target.backlogCount,
                  })}{" "}
                  |{" "}
                  {t("subconscious.targets.outcomeMeta", "outcome {outcome}", {
                    outcome: formatOutcome(target.lastMeaningfulOutcome),
                  })}
                </div>
              </button>
            ))}
            {targets.length === 0 ? (
              <div className="sc-target-empty">
                {t("subconscious.targets.empty", "No targets discovered yet.")}
              </div>
            ) : null}
          </div>
        </div>

        {/* Right: detail pane */}
        <div className="sc-detail-stack">
          <div className="sc-card">
            <div className="sc-card-title">
              {t("subconscious.detail.selectedTarget", "Selected Target")}
            </div>
            {detail ? (
              <div className="sc-detail-stack">
                <div className="sc-detail-header">
                  <div className="sc-detail-name">
                    {detail.target.target.label}
                  </div>
                  <div className="sc-detail-meta">
                    {detail.target.target.kind} | {detail.target.persistence} |{" "}
                    {t("subconscious.detail.healthMeta", "health {health}", {
                      health: detail.target.health,
                    })}{" "}
                    |{" "}
                    {t("subconscious.detail.lastRunMeta", "last run {time}", {
                      time: formatTimestamp(detail.target.lastRunAt),
                    })}{" "}
                    |{" "}
                    {t("subconscious.detail.outcomeMeta", "outcome {outcome}", {
                      outcome: formatOutcome(
                        detail.target.lastMeaningfulOutcome,
                      ),
                    })}
                  </div>
                </div>
                <label className="sc-checkbox">
                  <input
                    type="checkbox"
                    checked={settings.trustedTargetKeys.includes(
                      detail.target.key,
                    )}
                    disabled={busy}
                    onChange={(event) => {
                      const next = event.target.checked
                        ? [
                            ...new Set([
                              ...settings.trustedTargetKeys,
                              detail.target.key,
                            ]),
                          ]
                        : settings.trustedTargetKeys.filter(
                            (key) => key !== detail.target.key,
                          );
                      void saveSettings({ trustedTargetKeys: next });
                    }}
                  />
                  <span>
                    {t(
                      "subconscious.detail.trusted",
                      "Trusted for auto-create",
                    )}
                  </span>
                </label>
                <div>
                  <div className="sc-detail-section-title">
                    {t("subconscious.detail.benefitSummary", "Benefit summary")}
                  </div>
                  <div className="sc-detail-winner">
                    <div className="sc-detail-winner-text">
                      <Md text={`**${selectedValue.impact}**`} />
                    </div>
                    <div className="sc-detail-winner-rec">
                      {t(
                        "subconscious.detail.confidenceMeta",
                        "Confidence {confidence}",
                        {
                          confidence: selectedValue.confidence,
                        },
                      )}{" "}
                      |{" "}
                      {t(
                        "subconscious.detail.freshnessMeta",
                        "Freshness {freshness}",
                        {
                          freshness: selectedValue.evidenceFreshness,
                        },
                      )}{" "}
                      |{" "}
                      {t(
                        "subconscious.detail.dispatchMeta",
                        "Dispatch {status}",
                        {
                          status:
                            selectedValue.dispatch?.status ||
                            t("common.none", "none"),
                        },
                      )}
                    </div>
                    {selectedValue.topEvidence.length ? (
                      <ul className="sc-detail-list">
                        {selectedValue.topEvidence.map((item, index) => (
                          <li key={`${index}-${item}`}>
                            <Md text={item} />
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="sc-detail-empty">
                        {t(
                          "subconscious.detail.noActionableEvidence",
                          "No actionable evidence currently selected.",
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <div className="sc-detail-section-title">
                    {t("subconscious.detail.latestEvidence", "Latest evidence")}
                  </div>
                  <ul className="sc-detail-list">
                    {detail.latestEvidence.slice(0, 5).map((item) => (
                      <li key={item.id}>
                        <Md
                          text={
                            item.summary +
                            (item.details ? ` — ${item.details}` : "")
                          }
                        />
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div className="sc-detail-section-title">
                    {t("subconscious.detail.hypotheses", "Hypotheses")}
                  </div>
                  <ul className="sc-detail-list">
                    {detail.latestHypotheses.map((item) => (
                      <li key={item.id}>
                        <Md text={`**${item.title}:** ${item.summary}`} />
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div className="sc-detail-section-title">
                    {t("subconscious.detail.critique", "Critique")}
                  </div>
                  <ul className="sc-detail-list">
                    {detail.latestCritiques.map((item) => (
                      <li key={item.id}>
                        <Md text={`**${item.verdict}:** ${item.objection}`} />
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div className="sc-detail-section-title">
                    {t("subconscious.detail.winner", "Winner")}
                  </div>
                  {detail.latestDecision ? (
                    <div className="sc-detail-winner">
                      <div className="sc-detail-winner-text">
                        <Md text={detail.latestDecision.winnerSummary} />
                      </div>
                      {detail.latestDecision.recommendation ? (
                        <div className="sc-detail-winner-rec">
                          <Md text={detail.latestDecision.recommendation} />
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="sc-detail-empty">
                      {t("subconscious.detail.noWinner", "No winner yet.")}
                    </div>
                  )}
                </div>
                <div>
                  <div className="sc-detail-section-title">
                    {t(
                      "subconscious.detail.operatorTimeline",
                      "Operator Timeline",
                    )}
                  </div>
                  {detail.journal.length ? (
                    <ul className="sc-detail-list">
                      {detail.journal.slice(0, 8).map((entry) => (
                        <li key={entry.id}>
                          <Md
                            text={`**${entry.kind}** · ${formatTimestamp(entry.createdAt)} · ${entry.summary}${entry.details ? ` — ${entry.details}` : ""}`}
                          />
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="sc-detail-empty">
                      {t(
                        "subconscious.detail.noJournal",
                        "No journal entries yet.",
                      )}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="sc-detail-empty">
                {t(
                  "subconscious.detail.selectTarget",
                  "Select a target to inspect its reflective history.",
                )}
              </div>
            )}
          </div>

          <div className="sc-bottom-grid">
            <div className="sc-card">
              <div className="sc-card-title">
                {t("subconscious.backlog.title", "Namespaced Backlog")}
              </div>
              {detail?.backlog.length ? (
                <ul className="sc-detail-list">
                  {detail.backlog.slice(0, 8).map((item) => (
                    <li key={item.id}>
                      <Md text={`**${item.title}**: ${item.summary}`} />
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="sc-detail-empty">
                  {t("subconscious.backlog.empty", "No backlog items.")}
                </div>
              )}
            </div>

            <div className="sc-card">
              <div className="sc-card-title">
                {t("subconscious.learning.title", "Learning Candidates")}
              </div>
              {detail?.memory.length ? (
                <ul className="sc-detail-list">
                  {detail.memory.slice(0, 8).map((item) => (
                    <li key={item.id}>
                      <Md
                        text={`**${item.bucket}**: ${item.summary}${item.stale ? " _(stale)_" : ""}`}
                      />
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="sc-detail-empty">
                  {t(
                    "subconscious.learning.empty",
                    "No learning candidates yet.",
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="sc-bottom-grid">
            <div className="sc-card">
              <div className="sc-card-title">
                {t("subconscious.dispatch.title", "Dispatch History")}
              </div>
              {detail?.dispatchHistory.length ? (
                <ul className="sc-detail-list">
                  {detail.dispatchHistory.slice(0, 8).map((item) => (
                    <li key={item.id}>
                      <Md text={`**${item.kind}**: ${item.summary}`} />
                      {item.taskId && props?.onOpenTask ? (
                        <>
                          {" "}
                          <button
                            type="button"
                            onClick={() => props.onOpenTask?.(item.taskId!)}
                            className="sc-link-btn"
                          >
                            {t("subconscious.dispatch.openTask", "Open task")}
                          </button>
                        </>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="sc-detail-empty">
                  {t("subconscious.dispatch.empty", "No dispatches yet.")}
                </div>
              )}
            </div>

            <div className="sc-card">
              <div className="sc-card-title">
                {t("subconscious.reflections.title", "Reflections")}
              </div>
              {detail?.dreams.length ? (
                <ul className="sc-detail-list">
                  {detail.dreams.slice(0, 5).map((dream) => (
                    <li key={dream.id}>
                      <Md
                        text={`**${formatTimestamp(dream.createdAt)}**: ${dream.digest.join(" | ")}`}
                      />
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="sc-detail-empty">
                  {t(
                    "subconscious.reflections.empty",
                    "No reflection distillations yet.",
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="sc-card">
            <div className="sc-card-title">
              {t("subconscious.activeRuns.title", "Active Runs")}
            </div>
            {activeRuns.length ? (
              <ul className="sc-detail-list">
                {activeRuns.map((run: SubconsciousRun) => (
                  <li key={run.id}>
                    {run.id} — {run.stage}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="sc-detail-empty">
                {t(
                  "subconscious.activeRuns.empty",
                  "No active runs for this target.",
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
