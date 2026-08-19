import React, { useState, useEffect, useCallback } from "react";
import {
  ArrowRight,
  Zap,
  Plus,
  Trash2,
  ToggleLeft,
  ToggleRight,
  History,
  ChevronDown,
} from "lucide-react";
import { translate, useLanguage } from "../i18n";

interface TriggerCondition {
  field: string;
  operator: string;
  value: string;
}

interface TriggerAction {
  type: string;
  config: Record<string, Any>;
}

interface EventTrigger {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  source: string;
  conditions: TriggerCondition[];
  conditionLogic?: string;
  action: TriggerAction;
  workspaceId: string;
  cooldownMs?: number;
  lastFiredAt?: number;
  fireCount: number;
  createdAt: number;
  updatedAt: number;
}

interface TriggerHistoryEntry {
  id: string;
  triggerId: string;
  firedAt: number;
  eventData: Record<string, unknown>;
  actionResult?: string;
  taskId?: string;
}

interface MCPServerOption {
  id: string;
  name: string;
  status: string;
}

const SOURCES = [
  { value: "mailbox_event", label: "Mailbox Event" },
  { value: "channel_message", label: "Channel Message" },
  { value: "email", label: "Legacy Email" },
  { value: "webhook", label: "Webhook" },
  { value: "connector_event", label: "Connector Event" },
];

const OPERATORS = [
  { value: "contains", label: "contains" },
  { value: "equals", label: "equals" },
  { value: "matches", label: "matches (regex)" },
  { value: "starts_with", label: "starts with" },
  { value: "ends_with", label: "ends with" },
  { value: "not_contains", label: "does not contain" },
  { value: "not_equals", label: "does not equal" },
];

const FIELDS_BY_SOURCE: Record<string, string[]> = {
  channel_message: ["text", "senderName", "chatId", "channelType"],
  mailbox_event: [
    "eventType",
    "subject",
    "summary",
    "workspaceId",
    "accountId",
    "provider",
    "threadId",
    "evidenceCount",
    "needsReply",
    "staleFollowup",
    "cleanupCandidate",
    "commitmentCount",
    "confidence",
    "primaryContactEmail",
    "primaryContactName",
    "company",
    "domain",
    "projectHint",
    "actionType",
    "draftId",
    "tone",
    "commitmentId",
    "dueAt",
    "ownerEmail",
  ],
  email: [
    "eventType",
    "subject",
    "summary",
    "workspaceId",
    "accountId",
    "provider",
    "threadId",
    "evidenceCount",
    "needsReply",
    "staleFollowup",
    "cleanupCandidate",
    "commitmentCount",
    "confidence",
    "primaryContactEmail",
    "primaryContactName",
    "company",
    "domain",
    "projectHint",
    "actionType",
    "draftId",
    "tone",
    "commitmentId",
    "dueAt",
    "ownerEmail",
  ],
  webhook: ["path", "method", "body"],
  connector_event: [
    "changeType",
    "serverId",
    "connectorId",
    "resourceUri",
    "data",
  ],
};

/** Example triggers shown when empty; clicking one populates the form */
type ExampleTrigger = {
  name: string;
  source: string;
  conditions: TriggerCondition[];
  actionTitle?: string;
  actionPrompt: string;
  actionType?: "create_task" | "wake_agent";
  agentRoleId?: string;
};

const EXAMPLE_TRIGGERS: ExampleTrigger[] = [
  {
    name: "Urgent deploy alert",
    source: "channel_message" as const,
    conditions: [{ field: "text", operator: "contains", value: "urgent" }],
    actionTitle: "Review deploy request",
    actionPrompt:
      "Someone requested an urgent deploy. Review the message and create a task to handle it. Context: {{event.text}} from {{event.senderName}}",
  },
  {
    name: "Bug report triage",
    source: "channel_message" as const,
    conditions: [{ field: "text", operator: "contains", value: "bug" }],
    actionTitle: "Triage bug report",
    actionPrompt:
      "Triage this bug report and create a task with priority and steps. Message: {{event.text}}",
  },
  {
    name: "Urgent reply needed",
    source: "mailbox_event" as const,
    conditions: [
      { field: "eventType", operator: "equals", value: "thread_classified" },
      { field: "needsReply", operator: "equals", value: "true" },
      { field: "subject", operator: "contains", value: "urgent" },
    ],
    actionTitle: "Create follow-up task",
    actionPrompt:
      "Create a task for this inbox thread. Summarize the request, include the contact, and call out the next step.",
  },
  {
    name: "Commitment follow-up",
    source: "mailbox_event" as const,
    conditions: [
      {
        field: "eventType",
        operator: "equals",
        value: "commitments_extracted",
      },
      { field: "commitmentCount", operator: "gt", value: "0" },
    ],
    actionTitle: "Review commitment",
    actionPrompt:
      "Create a follow-up review task for the extracted commitment and include the due date if present.",
  },
  {
    name: "Stale follow-up wake",
    source: "mailbox_event" as const,
    conditions: [
      { field: "eventType", operator: "equals", value: "thread_classified" },
      { field: "staleFollowup", operator: "equals", value: "true" },
    ],
    actionType: "wake_agent",
    agentRoleId: "agent-founder",
    actionPrompt:
      "Wake the responsible agent for this stale inbox follow-up and summarize the thread context.",
  },
  {
    name: "Webhook deploy",
    source: "webhook" as const,
    conditions: [{ field: "path", operator: "equals", value: "/deploy" }],
    actionTitle: "Deploy triggered",
    actionPrompt:
      "A deploy was triggered via webhook. Verify and document the deployment.",
  },
  {
    name: "Jira issue changed",
    source: "connector_event" as const,
    conditions: [
      { field: "connectorId", operator: "equals", value: "jira" },
      { field: "changeType", operator: "equals", value: "resource_updated" },
    ],
    actionTitle: "Review Jira update",
    actionPrompt:
      "A Jira-connected MCP resource changed. Review the update and summarize what needs attention.",
  },
  {
    name: "Google doc changed",
    source: "connector_event" as const,
    conditions: [
      { field: "connectorId", operator: "equals", value: "google-workspace" },
      { field: "changeType", operator: "equals", value: "resource_updated" },
      { field: "resourceUri", operator: "contains", value: "docs.google.com" },
    ],
    actionTitle: "Review document changes",
    actionPrompt:
      "A tracked Google document changed through MCP. Review the update and capture the next action.",
  },
];

const EXAMPLE_TRIGGER_KEYS: Record<string, string> = {
  "Urgent deploy alert": "urgentDeploy",
  "Bug report triage": "bugTriage",
  "Urgent reply needed": "urgentReply",
  "Commitment follow-up": "commitmentFollowup",
  "Stale follow-up wake": "staleFollowup",
  "Webhook deploy": "webhookDeploy",
  "Jira issue changed": "jiraChanged",
  "Google doc changed": "googleDocChanged",
};

export const EventTriggersPanel: React.FC<{ workspaceId?: string }> = ({
  workspaceId,
}) => {
  useLanguage();
  const t = translate;
  const [triggers, setTriggers] = useState<EventTrigger[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [expandedHistory, setExpandedHistory] = useState<string | null>(null);
  const [history, setHistory] = useState<TriggerHistoryEntry[]>([]);
  const [mcpServers, setMcpServers] = useState<MCPServerOption[]>([]);

  // Form state
  const [name, setName] = useState("");
  const [source, setSource] = useState("mailbox_event");
  const [conditions, setConditions] = useState<TriggerCondition[]>([
    { field: "eventType", operator: "equals", value: "thread_classified" },
  ]);
  const [actionType, setActionType] = useState<"create_task" | "wake_agent">(
    "create_task",
  );
  const [actionPrompt, setActionPrompt] = useState("");
  const [actionTitle, setActionTitle] = useState("");
  const [actionAgentRoleId, setActionAgentRoleId] = useState("");

  const loadTriggers = useCallback(async () => {
    try {
      const result = await (window as Any).electronAPI.listTriggers(
        workspaceId || "",
      );
      setTriggers(result || []);
    } catch {
      // API not available yet
    }
  }, [workspaceId]);

  useEffect(() => {
    loadTriggers();
  }, [loadTriggers]);

  useEffect(() => {
    const loadMcpServers = async () => {
      try {
        const statuses = await (window as Any).electronAPI.getMCPStatus?.();
        if (Array.isArray(statuses)) {
          setMcpServers(
            statuses.map((status) => ({
              id: status.id,
              name: status.name,
              status: status.status,
            })),
          );
        }
      } catch {
        // API not available yet
      }
    };
    void loadMcpServers();
  }, []);

  const getConditionValue = useCallback(
    (field: string) =>
      conditions.find((condition) => condition.field === field)?.value || "",
    [conditions],
  );

  const upsertCondition = useCallback(
    (field: string, value: string, operator = "equals") => {
      setConditions((prev) => {
        const existing = prev.findIndex(
          (condition) => condition.field === field,
        );
        if (!value.trim()) {
          return existing >= 0
            ? prev.filter((condition) => condition.field !== field)
            : prev;
        }
        if (existing >= 0) {
          return prev.map((condition, idx) =>
            idx === existing ? { ...condition, operator, value } : condition,
          );
        }
        return [...prev, { field, operator, value }];
      });
    },
    [],
  );

  const addCondition = () => {
    const fields = FIELDS_BY_SOURCE[source] || ["text"];
    setConditions([
      ...conditions,
      { field: fields[0], operator: "contains", value: "" },
    ]);
  };

  const removeCondition = (idx: number) => {
    setConditions(conditions.filter((_, i) => i !== idx));
  };

  const updateCondition = (idx: number, updates: Partial<TriggerCondition>) => {
    setConditions(
      conditions.map((c, i) => (i === idx ? { ...c, ...updates } : c)),
    );
  };

  const handleAdd = async () => {
    if (!name.trim()) return;
    try {
      await (window as Any).electronAPI.addTrigger({
        name: name.trim(),
        enabled: true,
        source,
        conditions,
        conditionLogic: "all",
        action: {
          type: actionType,
          config:
            actionType === "wake_agent"
              ? {
                  prompt: actionPrompt,
                  agentRoleId: actionAgentRoleId.trim(),
                }
              : {
                  prompt: actionPrompt,
                  title:
                    actionTitle ||
                    t("eventTriggers.defaultTaskTitle", "Trigger: {name}", {
                      name: name.trim(),
                    }),
                  workspaceId,
                },
        },
        workspaceId: workspaceId || "",
      });
      setShowForm(false);
      setName("");
      setConditions([{ field: "text", operator: "contains", value: "" }]);
      setActionType("create_task");
      setActionPrompt("");
      setActionTitle("");
      setActionAgentRoleId("");
      loadTriggers();
    } catch (err) {
      console.error("Failed to add trigger:", err);
    }
  };

  const toggleTrigger = async (id: string, enabled: boolean) => {
    try {
      await (window as Any).electronAPI.updateTrigger(id, { enabled });
      loadTriggers();
    } catch {
      // ignore
    }
  };

  const deleteTrigger = async (id: string) => {
    try {
      await (window as Any).electronAPI.removeTrigger(id);
      loadTriggers();
    } catch {
      // ignore
    }
  };

  const getExampleKey = (ex: ExampleTrigger) =>
    EXAMPLE_TRIGGER_KEYS[ex.name] || "custom";
  const getExampleName = (ex: ExampleTrigger) =>
    t(`eventTriggers.example.${getExampleKey(ex)}.name`, ex.name);
  const getExampleActionTitle = (ex: ExampleTrigger) =>
    ex.actionTitle
      ? t(
          `eventTriggers.example.${getExampleKey(ex)}.actionTitle`,
          ex.actionTitle,
        )
      : "";
  const getExamplePrompt = (ex: ExampleTrigger) =>
    t(`eventTriggers.example.${getExampleKey(ex)}.prompt`, ex.actionPrompt);
  const getSourceLabel = (value: string, fallback?: string) =>
    t(`eventTriggers.source.${value}`, fallback || value.replace(/_/g, " "));
  const getOperatorLabel = (value: string, fallback?: string) =>
    t(`eventTriggers.operator.${value}`, fallback || value.replace(/_/g, " "));
  const formatTriggerMeta = (trigger: EventTrigger) =>
    t(
      "eventTriggers.card.meta",
      "{source} · {conditions} conditions · fired {count}x",
      {
        source: getSourceLabel(trigger.source),
        conditions: trigger.conditions.length,
        count: trigger.fireCount,
      },
    );

  const applyExample = (ex: (typeof EXAMPLE_TRIGGERS)[0]) => {
    setName(getExampleName(ex));
    setSource(ex.source);
    setConditions(ex.conditions.map((c) => ({ ...c })));
    setActionType(ex.actionType || "create_task");
    setActionTitle(getExampleActionTitle(ex));
    setActionPrompt(getExamplePrompt(ex));
    setActionAgentRoleId(ex.agentRoleId || "");
    setShowForm(true);
  };

  const loadHistory = async (triggerId: string) => {
    if (expandedHistory === triggerId) {
      setExpandedHistory(null);
      return;
    }
    try {
      const result = await (window as Any).electronAPI.getTriggerHistory(
        triggerId,
      );
      setHistory(result || []);
      setExpandedHistory(triggerId);
    } catch {
      setExpandedHistory(triggerId);
    }
  };

  const fields = FIELDS_BY_SOURCE[source] || ["text"];

  return (
    <div className="automation-page event-triggers-page">
      <div className="automation-page-toolbar automation-page-header">
        <div className="automation-page-heading">
          <span className="automation-page-heading-icon" aria-hidden="true">
            <Zap size={18} />
          </span>
          <h3>{t("eventTriggers.title", "Event Triggers")}</h3>
          <p className="settings-description">
            {t("eventTriggers.triggerCount", "{count} triggers", {
              count: triggers.length,
            })}
          </p>
        </div>
        <button
          className="button-secondary automation-create-button"
          onClick={() => setShowForm(!showForm)}
        >
          <Plus size={14} /> {t("eventTriggers.addTrigger", "Add Trigger")}
        </button>
      </div>

      {showForm && (
        <div
          className="event-triggers-form automation-editor-card"
          style={{
            border: "1px solid var(--color-border)",
            borderRadius: 8,
            padding: 16,
            marginBottom: 16,
            background: "var(--color-bg-elevated)",
          }}
        >
          <div style={{ marginBottom: 12 }}>
            <label
              style={{
                fontSize: 12,
                color: "var(--color-text-secondary)",
                display: "block",
                marginBottom: 4,
              }}
            >
              {t("common.name", "Name")}
            </label>
            <input
              type="text"
              className="settings-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t(
                "eventTriggers.placeholder.name",
                "e.g. Urgent deploy alert",
              )}
              style={{ marginBottom: 0 }}
            />
          </div>

          <div style={{ marginBottom: 12 }}>
            <label
              style={{
                fontSize: 12,
                color: "var(--color-text-secondary)",
                display: "block",
                marginBottom: 4,
              }}
            >
              {t("eventTriggers.whenSource", "When (source)")}
            </label>
            <select
              value={source}
              onChange={(e) => {
                setSource(e.target.value);
                setConditions([
                  {
                    field: FIELDS_BY_SOURCE[e.target.value]?.[0] || "text",
                    operator: "contains",
                    value: "",
                  },
                ]);
              }}
              className="event-triggers-select"
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--color-border)",
                background: "var(--color-bg-input)",
                color: "var(--color-text)",
                fontSize: 13,
              }}
            >
              {SOURCES.map((s) => (
                <option key={s.value} value={s.value}>
                  {getSourceLabel(s.value, s.label)}
                </option>
              ))}
            </select>
          </div>

          {source === "connector_event" && (
            <div
              style={{
                display: "grid",
                gap: 8,
                gridTemplateColumns: "1fr 1fr",
                marginBottom: 12,
              }}
            >
              <div>
                <label
                  style={{
                    fontSize: 12,
                    color: "var(--color-text-secondary)",
                    display: "block",
                    marginBottom: 4,
                  }}
                >
                  {t("eventTriggers.mcpServer", "MCP server")}
                </label>
                <select
                  value={getConditionValue("serverId")}
                  onChange={(e) => upsertCondition("serverId", e.target.value)}
                  className="event-triggers-select"
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: 6,
                    border: "1px solid var(--color-border)",
                    background: "var(--color-bg-input)",
                    color: "var(--color-text)",
                    fontSize: 12,
                  }}
                >
                  <option value="">
                    {t(
                      "eventTriggers.anyConnectedServer",
                      "Any connected server",
                    )}
                  </option>
                  {mcpServers.map((server) => (
                    <option key={server.id} value={server.id}>
                      {server.name} ({server.status})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  style={{
                    fontSize: 12,
                    color: "var(--color-text-secondary)",
                    display: "block",
                    marginBottom: 4,
                  }}
                >
                  {t("eventTriggers.resourceUriFilter", "Resource URI filter")}
                </label>
                <input
                  type="text"
                  className="settings-input"
                  value={getConditionValue("resourceUri")}
                  onChange={(e) =>
                    upsertCondition("resourceUri", e.target.value, "contains")
                  }
                  placeholder={t(
                    "eventTriggers.placeholder.resourceUri",
                    "e.g. jira://issue/PROJ-123",
                  )}
                  style={{ marginBottom: 0 }}
                />
              </div>
            </div>
          )}

          <div style={{ marginBottom: 12 }}>
            <label
              style={{
                fontSize: 12,
                color: "var(--color-text-secondary)",
                display: "block",
                marginBottom: 4,
              }}
            >
              {t("eventTriggers.conditionsAll", "Conditions (all must match)")}
            </label>
            {conditions.map((c, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  gap: 6,
                  marginBottom: 6,
                  alignItems: "center",
                }}
              >
                <select
                  value={c.field}
                  onChange={(e) =>
                    updateCondition(i, { field: e.target.value })
                  }
                  className="event-triggers-select"
                  style={{
                    flex: 1,
                    padding: "8px 10px",
                    borderRadius: 6,
                    border: "1px solid var(--color-border)",
                    background: "var(--color-bg-input)",
                    color: "var(--color-text)",
                    fontSize: 12,
                  }}
                >
                  {fields.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
                <select
                  value={c.operator}
                  onChange={(e) =>
                    updateCondition(i, { operator: e.target.value })
                  }
                  className="event-triggers-select"
                  style={{
                    flex: 1,
                    padding: "8px 10px",
                    borderRadius: 6,
                    border: "1px solid var(--color-border)",
                    background: "var(--color-bg-input)",
                    color: "var(--color-text)",
                    fontSize: 12,
                  }}
                >
                  {OPERATORS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {getOperatorLabel(o.value, o.label)}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  className="settings-input"
                  value={c.value}
                  onChange={(e) =>
                    updateCondition(i, { value: e.target.value })
                  }
                  placeholder={t("eventTriggers.placeholder.value", "value")}
                  style={{ flex: 2, marginBottom: 0 }}
                />
                {conditions.length > 1 && (
                  <button
                    onClick={() => removeCondition(i)}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: "var(--color-text-muted)",
                      padding: 2,
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
            <button
              onClick={addCondition}
              style={{
                fontSize: 11,
                color: "var(--color-accent)",
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: "2px 0",
              }}
            >
              {t("eventTriggers.addCondition", "+ Add condition")}
            </button>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label
              style={{
                fontSize: 12,
                color: "var(--color-text-secondary)",
                display: "block",
                marginBottom: 4,
              }}
            >
              {t("eventTriggers.thenAction", "Then (action)")}
            </label>
            <select
              value={actionType}
              onChange={(e) =>
                setActionType(
                  e.target.value === "wake_agent"
                    ? "wake_agent"
                    : "create_task",
                )
              }
              className="event-triggers-select"
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--color-border)",
                background: "var(--color-bg-input)",
                color: "var(--color-text)",
                fontSize: 13,
                marginBottom: 6,
              }}
            >
              <option value="create_task">
                {t("eventTriggers.action.createTask", "Create task")}
              </option>
              <option value="wake_agent">
                {t("eventTriggers.action.wakeAgent", "Wake agent")}
              </option>
            </select>
            <input
              type="text"
              className="settings-input"
              value={actionTitle}
              onChange={(e) => setActionTitle(e.target.value)}
              placeholder={t(
                "eventTriggers.placeholder.taskTitle",
                "Task title",
              )}
              style={{ marginBottom: 6 }}
              disabled={actionType === "wake_agent"}
            />
            {actionType === "wake_agent" && (
              <input
                type="text"
                className="settings-input"
                value={actionAgentRoleId}
                onChange={(e) => setActionAgentRoleId(e.target.value)}
                placeholder={t(
                  "eventTriggers.placeholder.agentRoleId",
                  "Agent role ID",
                )}
                style={{ marginBottom: 6 }}
              />
            )}
            <textarea
              className="settings-input"
              value={actionPrompt}
              onChange={(e) => setActionPrompt(e.target.value)}
              placeholder={t(
                "eventTriggers.placeholder.taskPrompt",
                "Task prompt (use {{event.subject}}, {{event.threadId}}, {{event.primaryContactEmail}} for variables)",
              )}
              rows={3}
              style={{
                resize: "vertical",
                minHeight: 72,
              }}
            />
          </div>

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button
              onClick={() => setShowForm(false)}
              style={{
                padding: "6px 12px",
                borderRadius: 6,
                border: "1px solid var(--color-border)",
                background: "none",
                color: "var(--color-text-secondary)",
                cursor: "pointer",
                fontSize: 12,
              }}
            >
              {t("common.cancel", "Cancel")}
            </button>
            <button
              onClick={handleAdd}
              disabled={
                !name.trim() ||
                (actionType === "wake_agent" && !actionAgentRoleId.trim())
              }
              style={{
                padding: "6px 12px",
                borderRadius: 6,
                border: "none",
                background: "var(--color-accent)",
                color: "#fff",
                cursor: "pointer",
                fontSize: 12,
                opacity:
                  name.trim() &&
                  (actionType !== "wake_agent" || actionAgentRoleId.trim())
                    ? 1
                    : 0.5,
              }}
            >
              {t("eventTriggers.createTrigger", "Create Trigger")}
            </button>
          </div>
        </div>
      )}

      {triggers.length === 0 && !showForm && (
        <div className="event-trigger-empty">
          <p className="event-trigger-empty-copy">
            {t(
              "eventTriggers.empty",
              "No triggers configured yet. Try an example below or create your own.",
            )}
          </p>
          <div className="event-trigger-template-grid">
            {EXAMPLE_TRIGGERS.map((ex, i) => (
              <button
                key={i}
                type="button"
                className="event-trigger-template"
                onClick={() => applyExample(ex)}
              >
                <div className="event-trigger-template-title">
                  {getExampleName(ex)}
                </div>
                <div className="event-trigger-template-meta">
                  {getSourceLabel(ex.source)} · {ex.conditions[0].field}{" "}
                  {getOperatorLabel(ex.conditions[0].operator)} "
                  {ex.conditions[0].value}"
                </div>
                <div className="event-trigger-template-action">
                  {t("eventTriggers.useAsTemplate", "Use as template")}
                  <ArrowRight size={13} aria-hidden="true" />
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {triggers.map((trigger) => (
        <div
          key={trigger.id}
          className={`event-trigger-row${trigger.enabled ? " is-enabled" : ""}`}
        >
          <div className="event-trigger-row-main">
            <button
              className="event-trigger-icon-button"
              onClick={() => toggleTrigger(trigger.id, !trigger.enabled)}
            >
              {trigger.enabled ? (
                <ToggleRight
                  size={20}
                  style={{ color: "var(--color-success)" }}
                />
              ) : (
                <ToggleLeft
                  size={20}
                  style={{ color: "var(--color-text-muted)" }}
                />
              )}
            </button>
            <div className="event-trigger-row-copy">
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: trigger.enabled
                    ? "var(--color-text)"
                    : "var(--color-text-muted)",
                }}
              >
                {trigger.name}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--color-text-muted)",
                  marginTop: 2,
                }}
              >
                {formatTriggerMeta(trigger)}
              </div>
            </div>
            <button
              className="event-trigger-icon-button"
              onClick={() => loadHistory(trigger.id)}
            >
              {expandedHistory === trigger.id ? (
                <ChevronDown size={14} />
              ) : (
                <History size={14} />
              )}
            </button>
            <button
              className="event-trigger-icon-button event-trigger-delete"
              onClick={() => deleteTrigger(trigger.id)}
            >
              <Trash2 size={14} />
            </button>
          </div>

          {expandedHistory === trigger.id && (
            <div className="event-trigger-history">
              {history.length === 0 ? (
                <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
                  {t("eventTriggers.noHistory", "No history yet")}
                </div>
              ) : (
                history.slice(0, 10).map((h) => (
                  <div
                    key={h.id}
                    style={{
                      fontSize: 11,
                      color: "var(--color-text-secondary)",
                      padding: "3px 0",
                      display: "flex",
                      gap: 8,
                    }}
                  >
                    <span style={{ color: "var(--color-text-muted)" }}>
                      {new Date(h.firedAt).toLocaleString()}
                    </span>
                    <span>
                      {h.actionResult || t("eventTriggers.fired", "fired")}
                    </span>
                    {h.taskId && (
                      <span style={{ color: "var(--color-accent)" }}>
                        {t("eventTriggers.toTask", "-> task")}
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};
