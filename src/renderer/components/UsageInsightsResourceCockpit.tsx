import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  ChevronRight,
  CircleAlert,
  Clock3,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Wrench,
} from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import type { Workspace } from "../../shared/types";
import type { UsageInsightsData } from "./UsageInsightsPanel";
import type { UsageInsightsPeriodPreset } from "./usageInsightsPeriods";
import { formatUsageCount } from "./usageInsightsFormatting";
import "./usage-insights-resource-cockpit.css";
import { translate, useLanguage, type SupportedLanguage } from "../i18n/index";

interface UsageInsightsResourceCockpitProps {
  data: UsageInsightsData;
  workspaces: Workspace[];
  selectedWorkspaceId: string;
  onWorkspaceChange: (workspaceId: string) => void;
  selectedPreset: UsageInsightsPeriodPreset;
  onPresetChange: (preset: UsageInsightsPeriodPreset) => void;
  customStart: string;
  customEnd: string;
  onCustomStartChange: (value: string) => void;
  onCustomEndChange: (value: string) => void;
  onRefresh: () => void;
  refreshing: boolean;
}

const ALL_WORKSPACES = "__all__";
const ALLOCATION_COLORS = [
  "#2f6feb",
  "#5d8df2",
  "#8aacfa",
  "#bad1fd",
  "#dce8fd",
];

function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

function shortDate(
  timestamp: number,
  language: SupportedLanguage,
): string {
  return new Intl.DateTimeFormat(language === "zh-CN" ? "zh-CN" : "en-US", {
    month: "short",
    day: "numeric",
  }).format(timestamp);
}

function modelLabel(model: string): string {
  return model.length > 24 ? `${model.slice(0, 21)}…` : model;
}

export function UsageInsightsResourceCockpit({
  data,
  workspaces,
  selectedWorkspaceId,
  onWorkspaceChange,
  selectedPreset,
  onPresetChange,
  customStart,
  customEnd,
  onCustomStartChange,
  onCustomEndChange,
  onRefresh,
  refreshing,
}: UsageInsightsResourceCockpitProps) {
  const language = useLanguage();
  const [showCustomDates, setShowCustomDates] = useState(false);
  const cockpitRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const scrollTimer = window.setTimeout(() => {
      cockpitRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 80);
    return () => window.clearTimeout(scrollTimer);
  }, []);
  const allocation = useMemo(() => {
    const models = [...data.costMetrics.costByModel]
      .filter((model) => model.calls > 0)
      .sort((a, b) => b.calls - a.calls)
      .slice(0, 5);
    const total = models.reduce((sum, model) => sum + model.calls, 0);
    return models.map((model, index) => ({
      ...model,
      name: modelLabel(model.model),
      percent: total > 0 ? Math.round((model.calls / total) * 100) : 0,
      color: ALLOCATION_COLORS[index],
    }));
  }, [data.costMetrics.costByModel]);

  const activity = useMemo(() => {
    const rows: Array<{
      title: string;
      meta: string;
      value: string;
      kind: "agent" | "skill" | "model";
    }> = [];
    for (const persona of data.personaMetrics ?? []) {
      rows.push({
        title: persona.personaName,
        meta: translate(
          "usage.agentSuccessRate",
          "Agent · {percent}% success rate",
          { percent: Math.round(persona.successRate) },
        ),
        value: translate("usage.taskCount", "{count} tasks", {
          count: formatUsageCount(persona.total),
        }),
        kind: "agent",
      });
    }
    for (const skill of data.topSkills) {
      rows.push({
        title: skill.skill,
        meta: translate(
          "generated.components.usageinsightsresourcecockpit.96.0",
          "Skill call",
        ),
        value: translate("usage.useCount", "{count} uses", {
          count: formatUsageCount(skill.count),
        }),
        kind: "skill",
      });
    }
    for (const model of allocation) {
      rows.push({
        title: model.name,
        meta: translate(
          "generated.components.usageinsightsresourcecockpit.99.1",
          "Model call",
        ),
        value: translate("usage.callCount", "{count} calls", {
          count: formatUsageCount(model.calls),
        }),
        kind: "model",
      });
    }
    return rows.slice(0, 6);
  }, [allocation, data.personaMetrics, data.topSkills]);

  const suggestions = useMemo(() => {
    const next: Array<{
      title: string;
      description: string;
      action: string;
      tone: "warning" | "neutral" | "success";
    }> = [];
    if (data.taskMetrics.failed > 0) {
      next.push({
        title: translate(
          "generated.components.usageinsightsresourcecockpit.108.2",
          "Check for unsuccessful tasks",
        ),
        description: translate(
          "usage.failedTasksSuggestion",
          "{count} tasks did not complete successfully in this period. Review a longer range to identify retry patterns.",
          { count: data.taskMetrics.failed },
        ),
        action: translate(
          "generated.components.usageinsightsresourcecockpit.110.3",
          "View 30-day trends",
        ),
        tone: "warning",
      });
    }
    if (data.executionMetrics.toolErrors > 0) {
      next.push({
        title: translate(
          "generated.components.usageinsightsresourcecockpit.116.4",
          "Convergence tool exception",
        ),
        description: translate(
          "usage.toolErrorsSuggestion",
          "Detected {count} tool errors. Check frequently used tools first.",
          { count: data.executionMetrics.toolErrors },
        ),
        action: translate(
          "generated.components.usageinsightsresourcecockpit.118.5",
          "View tool performance",
        ),
        tone: "warning",
      });
    }
    const cacheRate = data.llmSummary?.cacheReadRate;
    if (cacheRate !== null && cacheRate !== undefined && cacheRate < 20) {
      next.push({
        title: translate(
          "generated.components.usageinsightsresourcecockpit.125.6",
          "Pay attention to context reuse",
        ),
        description: translate(
          "usage.cacheRateSuggestion",
          "Cache read rate is {percent}%. Reuse stable context for consecutive tasks when appropriate.",
          { percent: Math.round(cacheRate) },
        ),
        action: translate(
          "generated.components.usageinsightsresourcecockpit.127.7",
          "Understand the composition of resources",
        ),
        tone: "neutral",
      });
    }
    if (next.length === 0) {
      next.push({
        title: translate(
          "generated.components.usageinsightsresourcecockpit.133.8",
          "Stable operation in this cycle",
        ),
        description: translate(
          "usage.completedTasksSuggestion",
          "Completed {count} tasks. There are no exceptions that need immediate attention.",
          { count: data.taskMetrics.completed },
        ),
        action: translate(
          "generated.components.usageinsightsresourcecockpit.135.9",
          "View event details",
        ),
        tone: "success",
      });
    }
    return next.slice(0, 3);
  }, [
    data.executionMetrics.toolErrors,
    data.llmSummary?.cacheReadRate,
    data.taskMetrics.completed,
    data.taskMetrics.failed,
  ]);

  const totalTokens = data.executionMetrics.totalTokens;
  const outputRatio =
    totalTokens > 0
      ? Math.round(
          (data.executionMetrics.totalCompletionTokens / totalTokens) * 100,
        )
      : 0;
  const periodLabel = `${shortDate(data.periodStart, language)} – ${shortDate(data.periodEnd, language)}`;
  const activeRange =
    selectedPreset === "custom"
      ? translate(
          "generated.components.usageinsightsresourcecockpit.145.10",
          "Customize",
        )
      : translate("usage.dayRange", "{count} days", {
          count: selectedPreset,
        });

  const chooseRange = (preset: UsageInsightsPeriodPreset) => {
    onPresetChange(preset);
    setShowCustomDates(preset === "custom");
  };

  return (
    <section
      ref={cockpitRef}
      className="settings-panel insights-panel insights-resource-cockpit"
    >
      <header className="resource-cockpit-header">
        <div>
          <div className="resource-cockpit-eyebrow">
            <Sparkles size={14} />{" "}
            {translate(
              "generated.components.usageinsightsresourcecockpit.156.11",
              "Workspace Usage Insights",
            )}
          </div>
          <h2>
            {translate(
              "generated.components.usageinsightsresourcecockpit.157.12",
              "Use insights",
            )}
            <span>
              {translate(
                "generated.components.usageinsightsresourcecockpit.157.13",
                "· Resource Cockpit",
              )}
            </span>
          </h2>
          <p>
            {translate(
              "generated.components.usageinsightsresourcecockpit.158.14",
              "Consolidate invocation, execution and resource consumption into a clear work context.",
            )}
          </p>
        </div>
        <button
          type="button"
          className="resource-refresh"
          onClick={onRefresh}
          disabled={refreshing}
        >
          <RefreshCw size={15} className={refreshing ? "is-spinning" : ""} />
          {refreshing
            ? translate(
                "generated.components.usageinsightsresourcecockpit.162.15",
                "Updating",
              )
            : translate(
                "generated.components.usageinsightsresourcecockpit.162.16",
                "Refresh data",
              )}
        </button>
      </header>

      <div
        className="resource-cockpit-filters"
        aria-label={translate(
          "generated.components.usageinsightsresourcecockpit.166.17",
          "Filter using insights",
        )}
      >
        <label className="resource-workspace-field">
          <span>
            {translate(
              "generated.components.usageinsightsresourcecockpit.168.18",
              "workspace",
            )}
          </span>
          <select
            value={selectedWorkspaceId}
            onChange={(event) => onWorkspaceChange(event.target.value)}
          >
            <option value={ALL_WORKSPACES}>
              {translate(
                "generated.components.usageinsightsresourcecockpit.170.19",
                "All workspaces",
              )}
            </option>
            {workspaces.map((workspace) => (
              <option key={workspace.id} value={workspace.id}>
                {workspace.name}
              </option>
            ))}
          </select>
        </label>
        <div className="resource-period-field">
          <span>
            {translate(
              "generated.components.usageinsightsresourcecockpit.175.20",
              "time range",
            )}
          </span>
          <div className="resource-period-controls">
            {([7, 30] as UsageInsightsPeriodPreset[]).map((preset) => (
              <button
                key={preset}
                type="button"
                className={selectedPreset === preset ? "is-active" : ""}
                onClick={() => chooseRange(preset)}
              >
                {preset}{" "}
                {translate(
                  "generated.components.usageinsightsresourcecockpit.178.21",
                  "day",
                )}
              </button>
            ))}
            <button
              type="button"
              className={selectedPreset === "custom" ? "is-active" : ""}
              onClick={() => chooseRange("custom")}
            >
              {translate(
                "generated.components.usageinsightsresourcecockpit.180.22",
                "Customize",
              )}
            </button>
          </div>
        </div>
        <div className="resource-period-summary">
          <Clock3 size={15} /> {periodLabel} <span>· {activeRange}</span>
        </div>
      </div>

      {showCustomDates && (
        <div className="resource-custom-dates">
          <label>
            {translate(
              "generated.components.usageinsightsresourcecockpit.188.23",
              "start date",
            )}
            <input
              type="date"
              value={customStart}
              max={customEnd}
              onChange={(event) => onCustomStartChange(event.target.value)}
            />
          </label>
          <label>
            {translate(
              "generated.components.usageinsightsresourcecockpit.189.24",
              "end date",
            )}
            <input
              type="date"
              value={customEnd}
              min={customStart}
              onChange={(event) => onCustomEndChange(event.target.value)}
            />
          </label>
          <button type="button" onClick={() => setShowCustomDates(false)}>
            {translate(
              "generated.components.usageinsightsresourcecockpit.190.25",
              "Application date",
            )}
          </button>
        </div>
      )}

      <div className="resource-cockpit-layout">
        <main className="resource-cockpit-main">
          <section className="resource-section resource-allocation-section">
            <div className="resource-section-heading">
              <div>
                <span className="resource-kicker">
                  {translate(
                    "generated.components.usageinsightsresourcecockpit.199.26",
                    "Resource view",
                  )}
                </span>
                <h3>
                  {translate(
                    "generated.components.usageinsightsresourcecockpit.200.27",
                    "attention allocation",
                  )}
                </h3>
              </div>
              <span>
                {formatUsageCount(data.executionMetrics.totalLlmCalls)}{" "}
                {translate(
                  "generated.components.usageinsightsresourcecockpit.202.28",
                  "model calls",
                )}
              </span>
            </div>
            {allocation.length > 0 ? (
              <div className="resource-allocation-body">
                <div
                  className="resource-donut-wrap"
                  aria-label={translate(
                    "generated.components.usageinsightsresourcecockpit.206.29",
                    "Model call proportion",
                  )}
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={allocation}
                        dataKey="calls"
                        nameKey="name"
                        innerRadius="67%"
                        outerRadius="100%"
                        paddingAngle={3}
                        stroke="none"
                      >
                        {allocation.map((item) => (
                          <Cell key={item.model} fill={item.color} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="resource-donut-center">
                    <strong>{allocation.length}</strong>
                    <span>
                      {translate(
                        "generated.components.usageinsightsresourcecockpit.214.30",
                        "active model",
                      )}
                    </span>
                  </div>
                </div>
                <div className="resource-allocation-list">
                  {allocation.map((item) => (
                    <div className="resource-allocation-row" key={item.model}>
                      <span
                        className="resource-allocation-dot"
                        style={{ backgroundColor: item.color }}
                      />
                      <div>
                        <strong title={item.model}>{item.name}</strong>
                        <span>
                          {formatUsageCount(item.calls)}{" "}
                          {translate(
                            "generated.components.usageinsightsresourcecockpit.220.31",
                            "calls",
                          )}
                        </span>
                      </div>
                      <b>{item.percent}%</b>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="resource-empty-state">
                {translate(
                  "generated.components.usageinsightsresourcecockpit.226.32",
                  "There are no model calls recorded for this time frame.",
                )}
              </div>
            )}
          </section>

          <section
            className="resource-section resource-activity-section"
            id="usage-activity"
          >
            <div className="resource-section-heading">
              <div>
                <span className="resource-kicker">
                  {translate(
                    "generated.components.usageinsightsresourcecockpit.231.33",
                    "Work flow",
                  )}
                </span>
                <h3>
                  {translate(
                    "generated.components.usageinsightsresourcecockpit.231.34",
                    "Recent activities",
                  )}
                </h3>
              </div>
              <span>{periodLabel}</span>
            </div>
            <div className="resource-activity-list">
              {activity.length > 0 ? (
                activity.map((item, index) => (
                  <button
                    type="button"
                    className="resource-activity-row"
                    onClick={() => chooseRange(30)}
                    key={`${item.kind}-${item.title}-${index}`}
                  >
                    <span className={`resource-activity-icon ${item.kind}`}>
                      {item.kind === "agent" ? (
                        <Sparkles size={16} />
                      ) : item.kind === "skill" ? (
                        <Wrench size={16} />
                      ) : (
                        <ArrowUpRight size={16} />
                      )}
                    </span>
                    <span className="resource-activity-copy">
                      <strong>{item.title}</strong>
                      <small>{item.meta}</small>
                    </span>
                    <span className="resource-activity-value">
                      {item.value}
                    </span>
                    <ChevronRight size={17} />
                  </button>
                ))
              ) : (
                <div className="resource-empty-state">
                  {translate(
                    "generated.components.usageinsightsresourcecockpit.244.35",
                    "There is no work activity to show for this time frame yet.",
                  )}
                </div>
              )}
            </div>
          </section>
        </main>

        <aside className="resource-cockpit-rail">
          <section className="resource-rail-section resource-advice-section">
            <div className="resource-rail-heading">
              <span>
                {translate(
                  "generated.components.usageinsightsresourcecockpit.251.36",
                  "Operation suggestions",
                )}
              </span>
              <h3>
                {translate(
                  "generated.components.usageinsightsresourcecockpit.251.37",
                  "Tips for the week",
                )}
              </h3>
            </div>
            {suggestions.map((suggestion, index) => (
              <div className="resource-advice" key={suggestion.title}>
                <span className={`resource-advice-icon ${suggestion.tone}`}>
                  {suggestion.tone === "success" ? (
                    <ShieldCheck size={17} />
                  ) : (
                    <CircleAlert size={17} />
                  )}
                </span>
                <div>
                  <strong>{suggestion.title}</strong>
                  <p>{suggestion.description}</p>
                  <button
                    type="button"
                    onClick={() =>
                      index === 0
                        ? chooseRange(30)
                        : document
                            .getElementById("usage-activity")
                            ?.scrollIntoView({
                              behavior: "smooth",
                              block: "start",
                            })
                    }
                  >
                    {suggestion.action} <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            ))}
          </section>

          <section className="resource-rail-section resource-budget-section">
            <div className="resource-rail-heading">
              <span>
                {translate(
                  "generated.components.usageinsightsresourcecockpit.261.38",
                  "Resource overview",
                )}
              </span>
              <h3>
                {translate(
                  "generated.components.usageinsightsresourcecockpit.261.39",
                  "Resources for this issue",
                )}
              </h3>
            </div>
            <div className="resource-token-summary">
              <div
                className="resource-token-ring"
                aria-label={translate(
                  "usage.outputTokenRatio",
                  "Output tokens account for {percent}%",
                  { percent: outputRatio },
                )}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={[
                        {
                          name: translate(
                            "generated.components.usageinsightsresourcecockpit.267.40",
                            "output",
                          ),
                          value: Math.max(outputRatio, 1),
                        },
                        {
                          name: translate(
                            "generated.components.usageinsightsresourcecockpit.267.41",
                            "The rest",
                          ),
                          value: Math.max(100 - outputRatio, 0),
                        },
                      ]}
                      dataKey="value"
                      innerRadius="73%"
                      outerRadius="100%"
                      startAngle={90}
                      endAngle={-270}
                      stroke="none"
                    >
                      <Cell fill="#4d7ee3" />
                      <Cell fill="#e8eef8" />
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <span>{outputRatio}%</span>
              </div>
              <div>
                <strong>
                  {translate(
                    "generated.components.usageinsightsresourcecockpit.282.42",
                    "Output Token Proportion",
                  )}
                </strong>
                <p>
                  {formatTokens(data.executionMetrics.totalCompletionTokens)} /{" "}
                  {formatTokens(totalTokens)} Token
                </p>
              </div>
            </div>
            <dl className="resource-usage-details">
              <div>
                <dt>
                  {translate(
                    "generated.components.usageinsightsresourcecockpit.286.44",
                    "Tool call",
                  )}
                </dt>
                <dd>
                  {formatUsageCount(data.executionMetrics.totalToolCalls)}{" "}
                  {translate(
                    "generated.components.usageinsightsresourcecockpit.286.45",
                    "times",
                  )}
                </dd>
              </div>
              <div>
                <dt>
                  {translate(
                    "generated.components.usageinsightsresourcecockpit.287.46",
                    "Complete the task",
                  )}
                </dt>
                <dd>
                  {formatUsageCount(data.taskMetrics.completed)}{" "}
                  {translate(
                    "generated.components.usageinsightsresourcecockpit.287.47",
                    "item",
                  )}
                </dd>
              </div>
            </dl>
            {data.executionMetrics.toolErrors > 0 && (
              <p className="resource-inline-warning">
                <CircleAlert size={14} />{" "}
                {translate(
                  "generated.components.usageinsightsresourcecockpit.289.48",
                  "Yes",
                )}
                {data.executionMetrics.toolErrors}{" "}
                {translate(
                  "generated.components.usageinsightsresourcecockpit.289.49",
                  "Need to pay attention to tool calls",
                )}
              </p>
            )}
          </section>
        </aside>
      </div>
    </section>
  );
}
