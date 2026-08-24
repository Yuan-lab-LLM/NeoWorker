import { type CSSProperties, useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  Clock3,
  Link2,
  Pencil,
  Play,
  Plus,
  Save,
  Settings2,
  Trash2,
} from "lucide-react";
import { translate, useLanguage } from "../i18n";
import {
  getMissionControlScopeName,
  getMissionControlTaskTitle,
  getRoutineDescriptionForDisplay,
  getRoutineRunSummaryForDisplay,
} from "../utils/mission-control-copy";
import "./automation-settings.css";

type CronSchedule =
  | { kind: "cron"; expr: string; tz?: string }
  | { kind: "every"; everyMs: number; anchorMs?: number }
  | { kind: "at"; atMs: number };

type RoutineTrigger =
  | {
      id: string;
      type: "schedule";
      enabled: boolean;
      schedule: CronSchedule;
      managedCronJobId?: string;
    }
  | {
      id: string;
      type: "api";
      enabled: boolean;
      path?: string;
      token?: string;
      managedHookMappingId?: string;
    }
  | {
      id: string;
      type: "connector_event";
      enabled: boolean;
      connectorId: string;
      changeType?: string;
      resourceUriContains?: string;
      cooldownMs?: number;
      managedEventTriggerId?: string;
    }
  | {
      id: string;
      type: "channel_event";
      enabled: boolean;
      channelType?: string;
      chatId?: string;
      textContains?: string;
      senderContains?: string;
      cooldownMs?: number;
      managedEventTriggerId?: string;
    }
  | {
      id: string;
      type: "mailbox_event";
      enabled: boolean;
      eventType?: string;
      subjectContains?: string;
      provider?: string;
      labelContains?: string;
      cooldownMs?: number;
      managedEventTriggerId?: string;
    }
  | {
      id: string;
      type: "github_event";
      enabled: boolean;
      eventName?: string;
      repository?: string;
      action?: string;
      ref?: string;
      cooldownMs?: number;
      managedEventTriggerId?: string;
    }
  | {
      id: string;
      type: "manual";
      enabled: boolean;
    };

type RoutineOutput =
  | { kind: "task_only" }
  | {
      kind: "channel_message";
      channelType?: string;
      channelDbId?: string;
      channelId?: string;
      summaryOnly?: boolean;
      deliverOnSuccess?: boolean;
      deliverOnError?: boolean;
    }
  | {
      kind: "webhook_response";
      statusCode?: number;
      message?: string;
      includeTaskId?: boolean;
    };

type RoutineRun = {
  id: string;
  routineId: string;
  triggerType: RoutineTrigger["type"];
  status: string;
  outputStatus: string;
  startedAt: number;
  finishedAt?: number;
  sourceEventSummary?: string;
  backingTaskId?: string;
  backingManagedSessionId?: string;
  errorSummary?: string;
  artifactsSummary?: string;
};

type Routine = {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  workspaceId: string;
  instructions: string;
  prompt: string;
  executionTarget: {
    kind: "workspace" | "worktree" | "device" | "managed_environment";
    deviceId?: string;
    managedEnvironmentId?: string;
  };
  connectorPolicy: {
    mode: "prefer" | "allowlist";
    connectorIds: string[];
  };
  approvalPolicy: {
    mode: "inherit" | "auto_safe" | "confirm_external" | "strict_confirm";
  };
  outputs: RoutineOutput[];
  triggers: RoutineTrigger[];
  createdAt: number;
  updatedAt: number;
};

type Workspace = {
  id: string;
  name: string;
  path: string;
};

type HookStatus = {
  enabled: boolean;
  serverRunning: boolean;
  serverAddress?: { host: string; port: number };
};

type HookSettings = {
  path: string;
  host?: string;
  port?: number;
};

type MCPServerStatus = {
  id: string;
  name: string;
  status: string;
};

type RoutineFormState = {
  enabled: boolean;
  name: string;
  description: string;
  workspaceId: string;
  instructions: string;
  executionTargetKind: Routine["executionTarget"]["kind"];
  deviceId: string;
  managedEnvironmentId: string;
  connectorPolicyMode: Routine["connectorPolicy"]["mode"];
  connectorIds: string[];
  approvalMode: Routine["approvalPolicy"]["mode"];
  outputTaskOnly: boolean;
  outputChannelMessage: boolean;
  outputChannelType: string;
  outputChannelId: string;
  outputSummaryOnly: boolean;
  outputDeliverOnSuccess: boolean;
  outputDeliverOnError: boolean;
  outputWebhookResponse: boolean;
  outputWebhookStatusCode: number;
  outputWebhookMessage: string;
  outputWebhookIncludeTaskId: boolean;
  scheduleEnabled: boolean;
  scheduleKind: CronSchedule["kind"];
  scheduleExpr: string;
  scheduleTz: string;
  scheduleEveryMinutes: number;
  scheduleAt: string;
  apiEnabled: boolean;
  apiPath: string;
  connectorEventEnabled: boolean;
  connectorEventConnectorId: string;
  connectorEventChangeType: string;
  connectorEventResourceUriContains: string;
  channelEventEnabled: boolean;
  channelEventChannelType: string;
  channelEventChatId: string;
  channelEventTextContains: string;
  channelEventSenderContains: string;
  mailboxEventEnabled: boolean;
  mailboxEventType: string;
  mailboxEventProvider: string;
  mailboxEventSubjectContains: string;
  mailboxEventLabelContains: string;
  githubEventEnabled: boolean;
  githubEventName: string;
  githubEventRepository: string;
  githubEventAction: string;
  githubEventRef: string;
  manualEnabled: boolean;
};

type RoutineTimingPreset =
  "manual" | "weekdays" | "daily" | "hourly" | "custom";

const DEFAULT_CRON = "0 9 * * 1-5";
const DEFAULT_SCHEDULE_TZ =
  Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

const chipStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "6px 10px",
  borderRadius: 999,
  border: "1px solid var(--color-border, rgba(127, 127, 127, 0.2))",
  background: "var(--color-surface-secondary, rgba(127, 127, 127, 0.08))",
  color: "var(--color-text-primary)",
  fontSize: 12,
} as const;

const checkboxRowStyle = {
  display: "inline-flex",
  alignItems: "flex-start",
  gap: 10,
  width: "fit-content",
  maxWidth: "100%",
  color: "var(--color-text-primary)",
  lineHeight: 1.35,
} satisfies CSSProperties;

const checkboxInputStyle = {
  flex: "0 0 auto",
  width: 18,
  height: 18,
  marginTop: 1,
  accentColor: "var(--color-accent)",
} satisfies CSSProperties;

const nestedOptionsStyle = {
  display: "grid",
  gap: 12,
  marginLeft: 28,
  paddingLeft: 14,
  borderLeft: "1px solid var(--color-border, rgba(127, 127, 127, 0.2))",
} satisfies CSSProperties;

const compactInputGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 240px))",
  gap: 12,
  alignItems: "center",
} satisfies CSSProperties;

const compactCheckboxGroupStyle = {
  display: "flex",
  gap: 16,
  flexWrap: "wrap",
  alignItems: "center",
} satisfies CSSProperties;

type RoutineButtonTone = "primary" | "secondary" | "danger";

function routineButtonStyle(
  tone: RoutineButtonTone,
  disabled = false,
): CSSProperties {
  const toneStyle: Record<RoutineButtonTone, CSSProperties> = {
    primary: {
      background: "var(--color-accent)",
      borderColor: "var(--color-accent)",
      color: "#0f172a",
    },
    secondary: {
      background: "var(--color-bg-secondary, rgba(127, 127, 127, 0.08))",
      borderColor: "var(--color-border, rgba(127, 127, 127, 0.2))",
      color: "var(--color-text-primary)",
    },
    danger: {
      background: "var(--color-error-subtle, rgba(248, 113, 113, 0.12))",
      borderColor: "color-mix(in srgb, var(--color-error) 45%, transparent)",
      color: "var(--color-error)",
    },
  };

  return {
    appearance: "none",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 36,
    width: "fit-content",
    maxWidth: "100%",
    padding: "8px 14px",
    borderWidth: 1,
    borderStyle: "solid",
    borderRadius: 999,
    font: "inherit",
    fontSize: 14,
    fontWeight: 600,
    lineHeight: 1,
    whiteSpace: "nowrap",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.55 : 1,
    transition:
      "background-color 120ms ease, border-color 120ms ease, opacity 120ms ease",
    ...toneStyle[tone],
  };
}

function routineCompactButtonStyle(
  tone: RoutineButtonTone,
  disabled = false,
): CSSProperties {
  return {
    ...routineButtonStyle(tone, disabled),
    gap: 5,
    minHeight: 30,
    padding: "5px 10px",
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 560,
  };
}

function createDefaultFormState(workspaceId = ""): RoutineFormState {
  return {
    enabled: true,
    name: "",
    description: "",
    workspaceId,
    instructions: "",
    executionTargetKind: "workspace",
    deviceId: "",
    managedEnvironmentId: "",
    connectorPolicyMode: "prefer",
    connectorIds: [],
    approvalMode: "inherit",
    outputTaskOnly: true,
    outputChannelMessage: false,
    outputChannelType: "",
    outputChannelId: "",
    outputSummaryOnly: true,
    outputDeliverOnSuccess: true,
    outputDeliverOnError: true,
    outputWebhookResponse: false,
    outputWebhookStatusCode: 202,
    outputWebhookMessage: "Routine accepted",
    outputWebhookIncludeTaskId: true,
    scheduleEnabled: false,
    scheduleKind: "cron",
    scheduleExpr: DEFAULT_CRON,
    scheduleTz: DEFAULT_SCHEDULE_TZ,
    scheduleEveryMinutes: 60,
    scheduleAt: "",
    apiEnabled: false,
    apiPath: "",
    connectorEventEnabled: false,
    connectorEventConnectorId: "",
    connectorEventChangeType: "",
    connectorEventResourceUriContains: "",
    channelEventEnabled: false,
    channelEventChannelType: "",
    channelEventChatId: "",
    channelEventTextContains: "",
    channelEventSenderContains: "",
    mailboxEventEnabled: false,
    mailboxEventType: "",
    mailboxEventProvider: "",
    mailboxEventSubjectContains: "",
    mailboxEventLabelContains: "",
    githubEventEnabled: false,
    githubEventName: "",
    githubEventRepository: "",
    githubEventAction: "",
    githubEventRef: "",
    manualEnabled: true,
  };
}

function getTimingPreset(form: RoutineFormState): RoutineTimingPreset {
  if (!form.scheduleEnabled) return "manual";
  if (form.scheduleKind === "every" && form.scheduleEveryMinutes === 60)
    return "hourly";
  if (form.scheduleKind === "cron") {
    if (/^\d{1,2}\s+\d{1,2}\s+\*\s+\*\s+1-5$/.test(form.scheduleExpr.trim())) {
      return "weekdays";
    }
    if (/^\d{1,2}\s+\d{1,2}\s+\*\s+\*\s+\*$/.test(form.scheduleExpr.trim())) {
      return "daily";
    }
  }
  return "custom";
}

function getCronTime(expr: string): string {
  const match = expr
    .trim()
    .match(/^(\d{1,2})\s+(\d{1,2})\s+\*\s+\*\s+(?:\*|1-5)$/);
  if (!match) return "09:00";
  const minute = Math.min(59, Math.max(0, Number(match[1])));
  const hour = Math.min(23, Math.max(0, Number(match[2])));
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function RoutineSettingsPanel({
  onOpenTask,
  compact = false,
}: {
  onOpenTask?: (taskId: string) => void;
  compact?: boolean;
}) {
  useLanguage();
  const t = translate;
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [runs, setRuns] = useState<RoutineRun[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [mcpServers, setMcpServers] = useState<MCPServerStatus[]>([]);
  const [hooksStatus, setHooksStatus] = useState<HookStatus | null>(null);
  const [hooksSettings, setHooksSettings] = useState<HookSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingRoutineId, setEditingRoutineId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<RoutineFormState>(() =>
    createDefaultFormState(),
  );

  useEffect(() => {
    void loadAll();
  }, []);

  const runsByRoutine = useMemo(() => {
    const grouped = new Map<string, RoutineRun[]>();
    for (const run of runs) {
      const entries = grouped.get(run.routineId) || [];
      entries.push(run);
      grouped.set(run.routineId, entries);
    }
    return grouped;
  }, [runs]);

  const workspaceMap = useMemo(
    () => new Map(workspaces.map((workspace) => [workspace.id, workspace])),
    [workspaces],
  );

  const apiBaseUrl = useMemo(() => {
    const host =
      hooksStatus?.serverAddress?.host || hooksSettings?.host || "127.0.0.1";
    const port =
      hooksStatus?.serverAddress?.port || hooksSettings?.port || 9877;
    const path = hooksSettings?.path || "/hooks";
    return `http://${host}:${port}${path}`;
  }, [hooksSettings, hooksStatus]);

  const timingPreset = useMemo(() => getTimingPreset(form), [form]);
  const scheduleTime = useMemo(
    () => getCronTime(form.scheduleExpr),
    [form.scheduleExpr],
  );

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const [
        routineList,
        routineRuns,
        workspaceList,
        status,
        settings,
        servers,
      ] = await Promise.all([
        window.electronAPI.listRoutines(),
        window.electronAPI.listRoutineRuns?.(undefined, 200) ||
          Promise.resolve([]),
        window.electronAPI.listWorkspaces(),
        window.electronAPI.getHooksStatus(),
        window.electronAPI.getHooksSettings(),
        window.electronAPI.getMCPStatus?.() || Promise.resolve([]),
      ]);

      setRoutines((routineList || []) as Routine[]);
      setRuns((routineRuns || []) as RoutineRun[]);
      setWorkspaces(workspaceList || []);
      setHooksStatus(status);
      setHooksSettings(settings);
      setMcpServers(Array.isArray(servers) ? servers : []);

      if (!form.workspaceId && workspaceList?.length) {
        setForm((current) => ({
          ...current,
          workspaceId: workspaceList[0].id,
        }));
      }
    } catch (err: Any) {
      setError(
        err.message || t("routines.error.load", "Failed to load routines"),
      );
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setEditingRoutineId(null);
    setShowForm(false);
    setShowAdvanced(false);
    setForm(createDefaultFormState(workspaces[0]?.id || ""));
  }

  function startCreate() {
    setEditingRoutineId(null);
    setShowForm(true);
    setShowAdvanced(false);
    setForm(createDefaultFormState(workspaces[0]?.id || ""));
  }

  function startEdit(routine: Routine) {
    const scheduleTrigger = routine.triggers.find(
      (trigger) => trigger.type === "schedule",
    );
    const apiTrigger = routine.triggers.find(
      (trigger) => trigger.type === "api",
    );
    const connectorTrigger = routine.triggers.find(
      (trigger) => trigger.type === "connector_event",
    );
    const channelTrigger = routine.triggers.find(
      (trigger) => trigger.type === "channel_event",
    );
    const mailboxTrigger = routine.triggers.find(
      (trigger) => trigger.type === "mailbox_event",
    );
    const githubTrigger = routine.triggers.find(
      (trigger) => trigger.type === "github_event",
    );
    const manualTrigger = routine.triggers.find(
      (trigger) => trigger.type === "manual",
    );
    const channelOutput = routine.outputs.find(
      (output) => output.kind === "channel_message",
    );
    const webhookOutput = routine.outputs.find(
      (output) => output.kind === "webhook_response",
    );
    const hasTaskOnly =
      routine.outputs.some((output) => output.kind === "task_only") ||
      routine.outputs.length === 0;
    const hasAdvancedConfiguration =
      routine.executionTarget?.kind !== "workspace" ||
      routine.approvalPolicy?.mode !== "inherit" ||
      routine.connectorPolicy?.mode === "allowlist" ||
      (routine.connectorPolicy?.connectorIds?.length || 0) > 0 ||
      routine.outputs.some((output) => output.kind !== "task_only") ||
      routine.triggers.some((trigger) =>
        [
          "api",
          "connector_event",
          "channel_event",
          "mailbox_event",
          "github_event",
        ].includes(trigger.type),
      );

    setEditingRoutineId(routine.id);
    setShowForm(true);
    setShowAdvanced(hasAdvancedConfiguration);
    setForm({
      enabled: routine.enabled,
      name: routine.name,
      description: routine.description || "",
      workspaceId: routine.workspaceId,
      instructions: routine.instructions || routine.prompt,
      executionTargetKind: routine.executionTarget?.kind || "workspace",
      deviceId: routine.executionTarget?.deviceId || "",
      managedEnvironmentId: routine.executionTarget?.managedEnvironmentId || "",
      connectorPolicyMode: routine.connectorPolicy?.mode || "prefer",
      connectorIds: routine.connectorPolicy?.connectorIds || [],
      approvalMode: routine.approvalPolicy?.mode || "inherit",
      outputTaskOnly: hasTaskOnly,
      outputChannelMessage: Boolean(channelOutput),
      outputChannelType:
        channelOutput?.kind === "channel_message"
          ? channelOutput.channelType || ""
          : "",
      outputChannelId:
        channelOutput?.kind === "channel_message"
          ? channelOutput.channelId || ""
          : "",
      outputSummaryOnly:
        channelOutput?.kind === "channel_message"
          ? (channelOutput.summaryOnly ?? true)
          : true,
      outputDeliverOnSuccess:
        channelOutput?.kind === "channel_message"
          ? (channelOutput.deliverOnSuccess ?? true)
          : true,
      outputDeliverOnError:
        channelOutput?.kind === "channel_message"
          ? (channelOutput.deliverOnError ?? true)
          : true,
      outputWebhookResponse: Boolean(webhookOutput),
      outputWebhookStatusCode:
        webhookOutput?.kind === "webhook_response"
          ? (webhookOutput.statusCode ?? 202)
          : 202,
      outputWebhookMessage:
        webhookOutput?.kind === "webhook_response"
          ? webhookOutput.message || ""
          : "Routine accepted",
      outputWebhookIncludeTaskId:
        webhookOutput?.kind === "webhook_response"
          ? (webhookOutput.includeTaskId ?? true)
          : true,
      scheduleEnabled: Boolean(scheduleTrigger),
      scheduleKind:
        scheduleTrigger?.type === "schedule"
          ? scheduleTrigger.schedule.kind
          : "cron",
      scheduleExpr:
        scheduleTrigger?.type === "schedule" &&
        scheduleTrigger.schedule.kind === "cron"
          ? scheduleTrigger.schedule.expr
          : DEFAULT_CRON,
      scheduleTz:
        scheduleTrigger?.type === "schedule" &&
        scheduleTrigger.schedule.kind === "cron"
          ? scheduleTrigger.schedule.tz || DEFAULT_SCHEDULE_TZ
          : DEFAULT_SCHEDULE_TZ,
      scheduleEveryMinutes:
        scheduleTrigger?.type === "schedule" &&
        scheduleTrigger.schedule.kind === "every"
          ? Math.max(1, Math.floor(scheduleTrigger.schedule.everyMs / 60000))
          : 60,
      scheduleAt:
        scheduleTrigger?.type === "schedule" &&
        scheduleTrigger.schedule.kind === "at"
          ? toDateTimeLocal(scheduleTrigger.schedule.atMs)
          : "",
      apiEnabled: Boolean(apiTrigger),
      apiPath: apiTrigger?.type === "api" ? apiTrigger.path || "" : "",
      connectorEventEnabled: Boolean(connectorTrigger),
      connectorEventConnectorId:
        connectorTrigger?.type === "connector_event"
          ? connectorTrigger.connectorId
          : "",
      connectorEventChangeType:
        connectorTrigger?.type === "connector_event"
          ? connectorTrigger.changeType || ""
          : "",
      connectorEventResourceUriContains:
        connectorTrigger?.type === "connector_event"
          ? connectorTrigger.resourceUriContains || ""
          : "",
      channelEventEnabled: Boolean(channelTrigger),
      channelEventChannelType:
        channelTrigger?.type === "channel_event"
          ? channelTrigger.channelType || ""
          : "",
      channelEventChatId:
        channelTrigger?.type === "channel_event"
          ? channelTrigger.chatId || ""
          : "",
      channelEventTextContains:
        channelTrigger?.type === "channel_event"
          ? channelTrigger.textContains || ""
          : "",
      channelEventSenderContains:
        channelTrigger?.type === "channel_event"
          ? channelTrigger.senderContains || ""
          : "",
      mailboxEventEnabled: Boolean(mailboxTrigger),
      mailboxEventType:
        mailboxTrigger?.type === "mailbox_event"
          ? mailboxTrigger.eventType || ""
          : "",
      mailboxEventProvider:
        mailboxTrigger?.type === "mailbox_event"
          ? mailboxTrigger.provider || ""
          : "",
      mailboxEventSubjectContains:
        mailboxTrigger?.type === "mailbox_event"
          ? mailboxTrigger.subjectContains || ""
          : "",
      mailboxEventLabelContains:
        mailboxTrigger?.type === "mailbox_event"
          ? mailboxTrigger.labelContains || ""
          : "",
      githubEventEnabled: Boolean(githubTrigger),
      githubEventName:
        githubTrigger?.type === "github_event"
          ? githubTrigger.eventName || ""
          : "",
      githubEventRepository:
        githubTrigger?.type === "github_event"
          ? githubTrigger.repository || ""
          : "",
      githubEventAction:
        githubTrigger?.type === "github_event"
          ? githubTrigger.action || ""
          : "",
      githubEventRef:
        githubTrigger?.type === "github_event" ? githubTrigger.ref || "" : "",
      manualEnabled:
        manualTrigger?.type === "manual" ? manualTrigger.enabled : true,
    });
  }

  function applyTimingPreset(preset: RoutineTimingPreset) {
    setForm((current) => {
      if (preset === "manual") {
        return { ...current, scheduleEnabled: false, manualEnabled: true };
      }
      if (preset === "hourly") {
        return {
          ...current,
          scheduleEnabled: true,
          scheduleKind: "every",
          scheduleEveryMinutes: 60,
          manualEnabled: true,
        };
      }
      if (preset === "daily" || preset === "weekdays") {
        const dayPattern = preset === "weekdays" ? "1-5" : "*";
        return {
          ...current,
          scheduleEnabled: true,
          scheduleKind: "cron",
          scheduleExpr: `0 9 * * ${dayPattern}`,
          scheduleTz: current.scheduleTz || DEFAULT_SCHEDULE_TZ,
          manualEnabled: true,
        };
      }
      return {
        ...current,
        scheduleEnabled: true,
        scheduleKind: current.scheduleEnabled ? current.scheduleKind : "cron",
        scheduleExpr: current.scheduleExpr || DEFAULT_CRON,
        manualEnabled: true,
      };
    });
  }

  function updateScheduleTime(value: string) {
    const [hour = "9", minute = "0"] = value.split(":");
    const dayPattern = timingPreset === "weekdays" ? "1-5" : "*";
    setForm((current) => ({
      ...current,
      scheduleEnabled: true,
      scheduleKind: "cron",
      scheduleExpr: `${Number(minute)} ${Number(hour)} * * ${dayPattern}`,
      scheduleTz: current.scheduleTz || DEFAULT_SCHEDULE_TZ,
    }));
  }

  function toggleConnector(connectorId: string) {
    setForm((current) => ({
      ...current,
      connectorIds: current.connectorIds.includes(connectorId)
        ? current.connectorIds.filter((item) => item !== connectorId)
        : [...current.connectorIds, connectorId],
    }));
  }

  async function saveRoutine() {
    if (!form.name.trim()) {
      setError(t("routines.error.nameRequired", "Routine name is required"));
      return;
    }
    if (!form.workspaceId) {
      setError(t("routines.error.workspaceRequired", "Workspace is required"));
      return;
    }
    if (!form.instructions.trim()) {
      setError(
        t(
          "routines.error.instructionsRequired",
          "Routine instructions are required",
        ),
      );
      return;
    }
    if (form.executionTargetKind === "device" && !form.deviceId.trim()) {
      setError(
        t(
          "routines.error.deviceIdRequired",
          "Device ID is required for device-targeted routines",
        ),
      );
      return;
    }
    if (
      form.executionTargetKind === "managed_environment" &&
      !form.managedEnvironmentId.trim()
    ) {
      setError(
        t(
          "routines.error.managedEnvironmentIdRequired",
          "Managed environment ID is required for managed-environment routines",
        ),
      );
      return;
    }
    if (
      form.scheduleEnabled &&
      form.scheduleKind === "cron" &&
      !form.scheduleExpr.trim()
    ) {
      setError(
        t(
          "routines.error.cronRequired",
          "Cron expression is required when the schedule trigger is enabled",
        ),
      );
      return;
    }
    if (
      form.scheduleEnabled &&
      form.scheduleKind === "at" &&
      !form.scheduleAt
    ) {
      setError(
        t(
          "routines.error.runTimeRequired",
          "Choose a run time for one-shot schedules",
        ),
      );
      return;
    }
    if (form.connectorEventEnabled && !form.connectorEventConnectorId.trim()) {
      setError(
        t(
          "routines.error.connectorRequired",
          "Choose a connector for the connector event trigger",
        ),
      );
      return;
    }
    if (
      form.outputChannelMessage &&
      (!form.outputChannelType.trim() || !form.outputChannelId.trim())
    ) {
      setError(
        t(
          "routines.error.channelOutputRequired",
          "Channel outputs need both a channel type and channel ID",
        ),
      );
      return;
    }

    const existing = editingRoutineId
      ? routines.find((routine) => routine.id === editingRoutineId) || null
      : null;
    const triggers = buildTriggers(form, existing);
    const outputs = buildOutputs(form);

    const payload = {
      enabled: form.enabled,
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      workspaceId: form.workspaceId,
      instructions: form.instructions.trim(),
      executionTarget: {
        kind: form.executionTargetKind,
        deviceId: form.deviceId.trim() || undefined,
        managedEnvironmentId: form.managedEnvironmentId.trim() || undefined,
      },
      connectorPolicy: {
        mode: form.connectorPolicyMode,
        connectorIds: form.connectorIds,
      },
      connectors: form.connectorIds,
      approvalPolicy: { mode: form.approvalMode },
      outputs,
      triggers,
    };

    setSaving(true);
    setError(null);
    try {
      if (existing) {
        await window.electronAPI.updateRoutine(existing.id, payload);
      } else {
        await window.electronAPI.createRoutine(payload);
      }
      await loadAll();
      resetForm();
    } catch (err: Any) {
      setError(
        err.message || t("routines.error.save", "Failed to save routine"),
      );
    } finally {
      setSaving(false);
    }
  }

  async function deleteRoutine(routineId: string) {
    if (
      !confirm(
        t(
          "routines.confirm.delete",
          "Delete this routine and all of its generated triggers, hooks, and schedule jobs?",
        ),
      )
    ) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await window.electronAPI.removeRoutine(routineId);
      await loadAll();
      if (editingRoutineId === routineId) {
        resetForm();
      }
    } catch (err: Any) {
      setError(
        err.message || t("routines.error.delete", "Failed to delete routine"),
      );
    } finally {
      setSaving(false);
    }
  }

  async function runRoutineNow(routineId: string) {
    setSaving(true);
    setError(null);
    try {
      const run = (await window.electronAPI.runRoutineNow?.(routineId)) as
        RoutineRun | null | undefined;
      if (run?.backingTaskId && onOpenTask) {
        setSaving(false);
        onOpenTask(run.backingTaskId);
        return;
      }
      await loadAll();
    } catch (err: Any) {
      setError(err.message || t("routines.error.run", "Failed to run routine"));
    } finally {
      setSaving(false);
    }
  }

  async function regenerateApiToken(routine: Routine, triggerId: string) {
    setSaving(true);
    setError(null);
    try {
      await window.electronAPI.regenerateRoutineApiToken(routine.id, triggerId);
      await loadAll();
    } catch (err: Any) {
      setError(
        err.message ||
          t(
            "routines.error.regenerateApiToken",
            "Failed to regenerate API token",
          ),
      );
    } finally {
      setSaving(false);
    }
  }

  async function copyText(text: string) {
    await navigator.clipboard.writeText(text);
  }

  if (loading) {
    return (
      <div className="settings-loading">
        {t("routines.loading", "Loading routines...")}
      </div>
    );
  }

  return (
    <div
      className={`automation-page settings-subsection routines-panel automation-settings-content ${compact ? "routines-panel-compact" : ""}`}
    >
      <div className="settings-section automation-page-intro">
        <div className="automation-page-header">
          <div className="automation-page-heading">
            {compact ? (
              <p className="settings-description">
                {t(
                  "routines.compactDescription",
                  "Automate rules that execute by time, event, or manual trigger.",
                )}
              </p>
            ) : (
              <>
                <h3>{t("routines.title", "Routines")}</h3>
                <p className="settings-description">
                  {t(
                    "routines.description",
                    "Routines are NeoWorker's saved automations: one set of instructions, one execution target, and one or more triggers. Comparable to Claude Routines, but designed for NeoWorker's local-first runtime.",
                  )}
                </p>
              </>
            )}
          </div>
          <button
            className="button-secondary automation-create-button"
            onClick={startCreate}
          >
            <Plus size={16} />
            {t("routines.new", "New Routine")}
          </button>
        </div>

        {error && (
          <div className="settings-error" style={{ marginTop: 12 }}>
            {error}
          </div>
        )}
      </div>

      {showForm && (
        <div
          className="settings-section routine-editor"
          style={{ display: "grid", gap: 16 }}
        >
          <div className="routine-editor-header">
            <div>
              <h4>
                {editingRoutineId
                  ? t("routines.edit", "Edit automation")
                  : t("routines.create", "Create automation")}
              </h4>
              <p>
                {t(
                  "routines.editorHint",
                  "Tell NeoWorker what to do and when to run it. Safe defaults handle everything else.",
                )}
              </p>
            </div>
            <button className="button-secondary" onClick={resetForm}>
              {t("common.cancel", "Cancel")}
            </button>
          </div>

          <section className="routine-editor-section">
            <div className="routine-editor-section-heading">
              <h5>{t("routines.editor.basic", "Name and workspace")}</h5>
              <p>
                {t(
                  "routines.editor.basicHint",
                  "Choose a clear name and where this automation works.",
                )}
              </p>
            </div>
            <div className="routine-editor-grid routine-editor-grid--basic">
              <label className="settings-field">
                <span>{t("routines.field.name", "Name")}</span>
                <input
                  className="settings-input"
                  value={form.name}
                  onChange={(event) =>
                    setForm({ ...form, name: event.target.value })
                  }
                  placeholder={t("routines.placeholder.name", "PR triage")}
                />
              </label>
              <label className="settings-field">
                <span>{t("routines.field.workspace", "Workspace")}</span>
                <select
                  className="settings-select"
                  value={form.workspaceId}
                  onChange={(event) =>
                    setForm({ ...form, workspaceId: event.target.value })
                  }
                >
                  {workspaces.map((workspace) => (
                    <option key={workspace.id} value={workspace.id}>
                      {workspace.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          <section className="routine-editor-section routine-editor-section--instructions">
            <div className="routine-editor-section-heading">
              <h5>{t("routines.editor.what", "What should NeoWorker do?")}</h5>
              <p>
                {t(
                  "routines.editor.instructionsHint",
                  "Describe the result you want in plain language.",
                )}
              </p>
            </div>
            <label className="settings-field">
              <span className="sr-only">
                {t("routines.field.instructions", "Instructions")}
              </span>
              <textarea
                className="settings-textarea"
                rows={7}
                value={form.instructions}
                onChange={(event) =>
                  setForm({ ...form, instructions: event.target.value })
                }
                placeholder={t(
                  "routines.placeholder.instructions",
                  "Review PRs targeting main. Check missing tests, risky migrations, and auth changes. Leave a pass/flag/fail summary. Do not merge or push.",
                )}
              />
            </label>
          </section>

          <section className="routine-editor-section routine-editor-section--timing">
            <div className="routine-editor-section-heading">
              <h5>{t("routines.editor.when", "When should it run?")}</h5>
              <p>
                {t(
                  "routines.editor.whenHint",
                  "Start manually or choose a common schedule.",
                )}
              </p>
            </div>
            <div className="routine-timing-control">
              <div
                className="routine-timing-options"
                role="group"
                aria-label={t("routines.editor.when", "When should it run?")}
              >
                {(
                  [
                    ["manual", t("routines.schedule.manual", "Manually")],
                    ["weekdays", t("routines.schedule.weekdays", "Weekdays")],
                    ["daily", t("routines.schedule.daily", "Every day")],
                    ["hourly", t("routines.schedule.hourly", "Every hour")],
                    ["custom", t("routines.schedule.custom", "Custom")],
                  ] as Array<[RoutineTimingPreset, string]>
                ).map(([preset, label]) => (
                  <button
                    key={preset}
                    type="button"
                    className={`routine-timing-option ${timingPreset === preset ? "active" : ""}`}
                    onClick={() => applyTimingPreset(preset)}
                    aria-pressed={timingPreset === preset}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {(timingPreset === "weekdays" || timingPreset === "daily") && (
                <label className="routine-schedule-time">
                  <Clock3 size={17} aria-hidden="true" />
                  <span>{t("routines.schedule.atTime", "Run at")}</span>
                  <input
                    className="settings-input"
                    type="time"
                    value={scheduleTime}
                    onChange={(event) => updateScheduleTime(event.target.value)}
                  />
                  <small>{form.scheduleTz || DEFAULT_SCHEDULE_TZ}</small>
                </label>
              )}

              {timingPreset === "custom" && (
                <div className="routine-custom-schedule">
                  <select
                    className="settings-select"
                    value={form.scheduleKind}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        scheduleKind: event.target
                          .value as RoutineFormState["scheduleKind"],
                      })
                    }
                  >
                    <option value="cron">Cron</option>
                    <option value="every">
                      {t("routines.schedule.every", "Every N minutes")}
                    </option>
                    <option value="at">
                      {t("routines.schedule.once", "Run once")}
                    </option>
                  </select>
                  {form.scheduleKind === "cron" && (
                    <>
                      <input
                        className="settings-input"
                        value={form.scheduleExpr}
                        onChange={(event) =>
                          setForm({ ...form, scheduleExpr: event.target.value })
                        }
                        placeholder="0 9 * * 1-5"
                      />
                      <input
                        className="settings-input"
                        value={form.scheduleTz}
                        onChange={(event) =>
                          setForm({ ...form, scheduleTz: event.target.value })
                        }
                        placeholder="Asia/Shanghai"
                      />
                    </>
                  )}
                  {form.scheduleKind === "every" && (
                    <input
                      className="settings-input"
                      type="number"
                      min={1}
                      value={form.scheduleEveryMinutes}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          scheduleEveryMinutes: Math.max(
                            1,
                            Number(event.target.value || 1),
                          ),
                        })
                      }
                    />
                  )}
                  {form.scheduleKind === "at" && (
                    <input
                      className="settings-input"
                      type="datetime-local"
                      value={form.scheduleAt}
                      onChange={(event) =>
                        setForm({ ...form, scheduleAt: event.target.value })
                      }
                    />
                  )}
                </div>
              )}
            </div>
          </section>

          <button
            type="button"
            className="routine-advanced-toggle"
            onClick={() => setShowAdvanced((current) => !current)}
            aria-expanded={showAdvanced}
          >
            <span className="routine-advanced-toggle-icon">
              <Settings2 size={17} aria-hidden="true" />
            </span>
            <span>
              <strong>
                {t("routines.editor.advanced", "Advanced settings")}
              </strong>
              <small>
                {t(
                  "routines.editor.advancedHint",
                  "Execution, approvals, connectors, delivery, and event triggers",
                )}
              </small>
            </span>
            <ChevronDown size={18} aria-hidden="true" />
          </button>

          {showAdvanced && (
            <div className="routine-advanced-sections">
              <section className="routine-editor-section routine-editor-section--optional">
                <div className="routine-editor-section-heading">
                  <h5>
                    {t("routines.field.description", "Optional description")}
                  </h5>
                  <p>
                    {t(
                      "routines.editor.descriptionHint",
                      "Add context for teammates who manage this automation.",
                    )}
                  </p>
                </div>
                <label className="settings-field">
                  <span className="sr-only">
                    {t("routines.field.description", "Description")}
                  </span>
                  <input
                    className="settings-input"
                    value={form.description}
                    onChange={(event) =>
                      setForm({ ...form, description: event.target.value })
                    }
                    placeholder={t(
                      "routines.placeholder.description",
                      "Review repo events and draft next actions.",
                    )}
                  />
                </label>
              </section>

              <section className="routine-editor-section">
                <div className="routine-editor-section-heading">
                  <h5>
                    {t("routines.editor.execution", "Execution and Approval")}
                  </h5>
                  <p>
                    {t(
                      "routines.editor.executionHint",
                      "Select the environment in which the rule will run and the degree of confirmation required.",
                    )}
                  </p>
                </div>
                <div className="routine-editor-grid routine-editor-grid--settings">
                  <label className="settings-field">
                    <span>
                      {t("routines.field.executionTarget", "Execution Target")}
                    </span>
                    <select
                      className="settings-select"
                      value={form.executionTargetKind}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          executionTargetKind: event.target
                            .value as RoutineFormState["executionTargetKind"],
                        })
                      }
                    >
                      <option value="workspace">
                        {t("routines.execution.workspace", "Workspace")}
                      </option>
                      <option value="worktree">
                        {t("routines.execution.worktree", "Git Worktree")}
                      </option>
                      <option value="device">
                        {t("routines.execution.device", "Remote Device")}
                      </option>
                      <option value="managed_environment">
                        {t(
                          "routines.execution.managedEnvironment",
                          "Managed Environment",
                        )}
                      </option>
                    </select>
                  </label>

                  {form.executionTargetKind === "device" && (
                    <label className="settings-field">
                      <span>{t("routines.field.deviceId", "Device ID")}</span>
                      <input
                        className="settings-input"
                        value={form.deviceId}
                        onChange={(event) =>
                          setForm({ ...form, deviceId: event.target.value })
                        }
                        placeholder="remote-node-id"
                      />
                    </label>
                  )}

                  {form.executionTargetKind === "managed_environment" && (
                    <label className="settings-field">
                      <span>
                        {t(
                          "routines.field.managedEnvironmentId",
                          "Managed Environment ID",
                        )}
                      </span>
                      <input
                        className="settings-input"
                        value={form.managedEnvironmentId}
                        onChange={(event) =>
                          setForm({
                            ...form,
                            managedEnvironmentId: event.target.value,
                          })
                        }
                        placeholder="env_..."
                      />
                    </label>
                  )}

                  <label className="settings-field">
                    <span>
                      {t("routines.field.approvalPolicy", "Approval Policy")}
                    </span>
                    <select
                      className="settings-select"
                      value={form.approvalMode}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          approvalMode: event.target
                            .value as RoutineFormState["approvalMode"],
                        })
                      }
                    >
                      <option value="inherit">
                        {t(
                          "routines.approval.inherit",
                          "Inherit workspace defaults",
                        )}
                      </option>
                      <option value="auto_safe">
                        {t("routines.approval.autoSafe", "Auto-safe")}
                      </option>
                      <option value="confirm_external">
                        {t(
                          "routines.approval.confirmExternal",
                          "Confirm external actions",
                        )}
                      </option>
                      <option value="strict_confirm">
                        {t("routines.approval.strictConfirm", "Strict confirm")}
                      </option>
                    </select>
                  </label>
                </div>
              </section>

              <section className="routine-editor-section">
                <div className="routine-editor-section-heading">
                  <h5>
                    {t("routines.field.connectorPolicy", "Connector Policy")}
                  </h5>
                  <p>
                    {t(
                      "routines.editor.connectorHint",
                      "Select the connected tools that can be called when this rule is run.",
                    )}
                  </p>
                </div>
                <div className="settings-field routine-editor-field--plain">
                  <div style={{ display: "grid", gap: 12 }}>
                    <select
                      className="settings-select"
                      value={form.connectorPolicyMode}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          connectorPolicyMode: event.target
                            .value as RoutineFormState["connectorPolicyMode"],
                        })
                      }
                    >
                      <option value="prefer">
                        {t(
                          "routines.connector.prefer",
                          "Prefer connectors in prompt context",
                        )}
                      </option>
                      <option value="allowlist">
                        {t(
                          "routines.connector.allowlist",
                          "Enforce connector allowlist at runtime",
                        )}
                      </option>
                    </select>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {mcpServers.map((server) => {
                        const active = form.connectorIds.includes(server.id);
                        return (
                          <button
                            key={server.id}
                            type="button"
                            className={`settings-chip ${active ? "active" : ""}`}
                            onClick={() => toggleConnector(server.id)}
                          >
                            {server.name}
                          </button>
                        );
                      })}
                      {mcpServers.length === 0 && (
                        <div className="settings-help">
                          {t(
                            "routines.connector.empty",
                            "No MCP connectors found.",
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </section>

              <section className="routine-editor-section">
                <div className="routine-editor-section-heading">
                  <h5>{t("routines.outputs.title", "Outputs")}</h5>
                  <p>
                    {t(
                      "routines.editor.outputsHint",
                      "Choose where to keep or send the run results.",
                    )}
                  </p>
                </div>
                <div className="settings-field routine-editor-field--plain">
                  <div style={{ display: "grid", gap: 12 }}>
                    <RoutineCheckbox
                      checked={form.outputTaskOnly}
                      label={t(
                        "routines.outputs.taskOnly",
                        "Create a task and keep results in NeoWorker",
                      )}
                      onChange={(checked) =>
                        setForm({ ...form, outputTaskOnly: checked })
                      }
                    />
                    <RoutineCheckbox
                      checked={form.outputChannelMessage}
                      label={t(
                        "routines.outputs.channelSummary",
                        "Deliver a channel summary",
                      )}
                      onChange={(checked) =>
                        setForm({ ...form, outputChannelMessage: checked })
                      }
                    />
                    {form.outputChannelMessage && (
                      <div style={nestedOptionsStyle}>
                        <div style={compactInputGridStyle}>
                          <input
                            className="settings-input"
                            value={form.outputChannelType}
                            onChange={(event) =>
                              setForm({
                                ...form,
                                outputChannelType: event.target.value,
                              })
                            }
                            placeholder="slack"
                          />
                          <input
                            className="settings-input"
                            value={form.outputChannelId}
                            onChange={(event) =>
                              setForm({
                                ...form,
                                outputChannelId: event.target.value,
                              })
                            }
                            placeholder="C123456"
                          />
                        </div>
                        <div style={compactCheckboxGroupStyle}>
                          <RoutineCheckbox
                            checked={form.outputSummaryOnly}
                            label={t(
                              "routines.outputs.summaryOnly",
                              "Summary only",
                            )}
                            onChange={(checked) =>
                              setForm({ ...form, outputSummaryOnly: checked })
                            }
                          />
                          <RoutineCheckbox
                            checked={form.outputDeliverOnSuccess}
                            label={t(
                              "routines.outputs.sendOnSuccess",
                              "Send on success",
                            )}
                            onChange={(checked) =>
                              setForm({
                                ...form,
                                outputDeliverOnSuccess: checked,
                              })
                            }
                          />
                          <RoutineCheckbox
                            checked={form.outputDeliverOnError}
                            label={t(
                              "routines.outputs.sendOnError",
                              "Send on error",
                            )}
                            onChange={(checked) =>
                              setForm({
                                ...form,
                                outputDeliverOnError: checked,
                              })
                            }
                          />
                        </div>
                      </div>
                    )}

                    <RoutineCheckbox
                      checked={form.outputWebhookResponse}
                      label={t(
                        "routines.outputs.webhookResponse",
                        "Return a webhook response body for API-triggered runs",
                      )}
                      onChange={(checked) =>
                        setForm({ ...form, outputWebhookResponse: checked })
                      }
                    />
                    {form.outputWebhookResponse && (
                      <div style={nestedOptionsStyle}>
                        <div
                          style={{
                            ...compactInputGridStyle,
                            gridTemplateColumns: "140px minmax(220px, 360px)",
                          }}
                        >
                          <input
                            className="settings-input"
                            type="number"
                            min={100}
                            max={599}
                            value={form.outputWebhookStatusCode}
                            onChange={(event) =>
                              setForm({
                                ...form,
                                outputWebhookStatusCode: Number(
                                  event.target.value || 202,
                                ),
                              })
                            }
                          />
                          <input
                            className="settings-input"
                            value={form.outputWebhookMessage}
                            onChange={(event) =>
                              setForm({
                                ...form,
                                outputWebhookMessage: event.target.value,
                              })
                            }
                            placeholder={t(
                              "routines.placeholder.webhookMessage",
                              "Routine accepted",
                            )}
                          />
                        </div>
                        <RoutineCheckbox
                          checked={form.outputWebhookIncludeTaskId}
                          label={t(
                            "routines.outputs.includeTaskId",
                            "Include task ID",
                          )}
                          onChange={(checked) =>
                            setForm({
                              ...form,
                              outputWebhookIncludeTaskId: checked,
                            })
                          }
                        />
                      </div>
                    )}
                  </div>
                </div>
              </section>

              <section className="routine-editor-section">
                <div className="routine-editor-section-heading">
                  <h5>
                    {t("routines.editor.otherTriggers", "Other triggers")}
                  </h5>
                  <p>
                    {t(
                      "routines.editor.triggersHint",
                      "Run from an API, connector, channel, inbox, or GitHub event.",
                    )}
                  </p>
                </div>
                <div className="settings-field routine-editor-field--plain">
                  <div style={{ display: "grid", gap: 14 }}>
                    <TriggerToggle
                      checked={form.apiEnabled}
                      label="API"
                      description={t(
                        "routines.trigger.apiDescription",
                        "Generate a webhook path and token for external callers.",
                      )}
                      onChange={(checked) =>
                        setForm({ ...form, apiEnabled: checked })
                      }
                    />
                    {form.apiEnabled && (
                      <input
                        className="settings-input"
                        value={form.apiPath}
                        onChange={(event) =>
                          setForm({ ...form, apiPath: event.target.value })
                        }
                        placeholder="routines/pr-triage"
                      />
                    )}

                    <TriggerToggle
                      checked={form.connectorEventEnabled}
                      label={t(
                        "routines.trigger.connectorEvent",
                        "Connector Event",
                      )}
                      description={t(
                        "routines.trigger.connectorEventDescription",
                        "Watch MCP connector notifications.",
                      )}
                      onChange={(checked) =>
                        setForm({ ...form, connectorEventEnabled: checked })
                      }
                    />
                    {form.connectorEventEnabled && (
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns:
                            "repeat(auto-fit, minmax(180px, 1fr))",
                          gap: 12,
                        }}
                      >
                        <input
                          className="settings-input"
                          value={form.connectorEventConnectorId}
                          onChange={(event) =>
                            setForm({
                              ...form,
                              connectorEventConnectorId: event.target.value,
                            })
                          }
                          placeholder="github"
                        />
                        <input
                          className="settings-input"
                          value={form.connectorEventChangeType}
                          onChange={(event) =>
                            setForm({
                              ...form,
                              connectorEventChangeType: event.target.value,
                            })
                          }
                          placeholder="resource_updated"
                        />
                        <input
                          className="settings-input"
                          value={form.connectorEventResourceUriContains}
                          onChange={(event) =>
                            setForm({
                              ...form,
                              connectorEventResourceUriContains:
                                event.target.value,
                            })
                          }
                          placeholder="repo://..."
                        />
                      </div>
                    )}

                    <TriggerToggle
                      checked={form.channelEventEnabled}
                      label={t(
                        "routines.trigger.channelEvent",
                        "Channel Event",
                      )}
                      description={t(
                        "routines.trigger.channelEventDescription",
                        "Listen for incoming channel messages.",
                      )}
                      onChange={(checked) =>
                        setForm({ ...form, channelEventEnabled: checked })
                      }
                    />
                    {form.channelEventEnabled && (
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns:
                            "repeat(auto-fit, minmax(180px, 1fr))",
                          gap: 12,
                        }}
                      >
                        <input
                          className="settings-input"
                          value={form.channelEventChannelType}
                          onChange={(event) =>
                            setForm({
                              ...form,
                              channelEventChannelType: event.target.value,
                            })
                          }
                          placeholder="slack"
                        />
                        <input
                          className="settings-input"
                          value={form.channelEventChatId}
                          onChange={(event) =>
                            setForm({
                              ...form,
                              channelEventChatId: event.target.value,
                            })
                          }
                          placeholder="C123456"
                        />
                        <input
                          className="settings-input"
                          value={form.channelEventTextContains}
                          onChange={(event) =>
                            setForm({
                              ...form,
                              channelEventTextContains: event.target.value,
                            })
                          }
                          placeholder="contains text"
                        />
                        <input
                          className="settings-input"
                          value={form.channelEventSenderContains}
                          onChange={(event) =>
                            setForm({
                              ...form,
                              channelEventSenderContains: event.target.value,
                            })
                          }
                          placeholder="sender contains"
                        />
                      </div>
                    )}

                    <TriggerToggle
                      checked={form.mailboxEventEnabled}
                      label={t(
                        "routines.trigger.mailboxEvent",
                        "Mailbox Event",
                      )}
                      description={t(
                        "routines.trigger.mailboxEventDescription",
                        "Use normalized inbox events as a trigger source.",
                      )}
                      onChange={(checked) =>
                        setForm({ ...form, mailboxEventEnabled: checked })
                      }
                    />
                    {form.mailboxEventEnabled && (
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns:
                            "repeat(auto-fit, minmax(180px, 1fr))",
                          gap: 12,
                        }}
                      >
                        <input
                          className="settings-input"
                          value={form.mailboxEventType}
                          onChange={(event) =>
                            setForm({
                              ...form,
                              mailboxEventType: event.target.value,
                            })
                          }
                          placeholder="message_received"
                        />
                        <input
                          className="settings-input"
                          value={form.mailboxEventProvider}
                          onChange={(event) =>
                            setForm({
                              ...form,
                              mailboxEventProvider: event.target.value,
                            })
                          }
                          placeholder="gmail"
                        />
                        <input
                          className="settings-input"
                          value={form.mailboxEventSubjectContains}
                          onChange={(event) =>
                            setForm({
                              ...form,
                              mailboxEventSubjectContains: event.target.value,
                            })
                          }
                          placeholder="subject contains"
                        />
                        <input
                          className="settings-input"
                          value={form.mailboxEventLabelContains}
                          onChange={(event) =>
                            setForm({
                              ...form,
                              mailboxEventLabelContains: event.target.value,
                            })
                          }
                          placeholder="label contains"
                        />
                      </div>
                    )}

                    <TriggerToggle
                      checked={form.githubEventEnabled}
                      label={t("routines.trigger.githubEvent", "GitHub Event")}
                      description={t(
                        "routines.trigger.githubEventDescription",
                        "First-class GitHub trigger surface over connector events.",
                      )}
                      onChange={(checked) =>
                        setForm({ ...form, githubEventEnabled: checked })
                      }
                    />
                    {form.githubEventEnabled && (
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns:
                            "repeat(auto-fit, minmax(180px, 1fr))",
                          gap: 12,
                        }}
                      >
                        <input
                          className="settings-input"
                          value={form.githubEventName}
                          onChange={(event) =>
                            setForm({
                              ...form,
                              githubEventName: event.target.value,
                            })
                          }
                          placeholder="pull_request.opened"
                        />
                        <input
                          className="settings-input"
                          value={form.githubEventRepository}
                          onChange={(event) =>
                            setForm({
                              ...form,
                              githubEventRepository: event.target.value,
                            })
                          }
                          placeholder="owner/repo"
                        />
                        <input
                          className="settings-input"
                          value={form.githubEventAction}
                          onChange={(event) =>
                            setForm({
                              ...form,
                              githubEventAction: event.target.value,
                            })
                          }
                          placeholder="opened"
                        />
                        <input
                          className="settings-input"
                          value={form.githubEventRef}
                          onChange={(event) =>
                            setForm({
                              ...form,
                              githubEventRef: event.target.value,
                            })
                          }
                          placeholder="refs/heads/main"
                        />
                      </div>
                    )}
                  </div>
                </div>
              </section>
            </div>
          )}

          <div className="routine-editor-footer">
            <span>
              {t(
                "routines.editor.saveHint",
                "You can change these settings later.",
              )}
            </span>
            <button
              className="button-primary"
              style={routineButtonStyle("primary", saving)}
              onClick={saveRoutine}
              disabled={saving}
            >
              <Save size={16} />
              {saving
                ? t("common.saving", "Saving...")
                : editingRoutineId
                  ? t("routines.save", "Save changes")
                  : t("routines.createAction", "Create automation")}
            </button>
          </div>
        </div>
      )}

      <div className="settings-section" style={{ display: "grid", gap: 16 }}>
        {routines.length === 0 ? (
          <div className="settings-empty-state">
            {t(
              "routines.empty",
              "No routines yet. Create one to compile schedules, webhooks, and event triggers from a single top-level automation definition.",
            )}
          </div>
        ) : (
          routines.map((routine) => {
            const routineRuns = (runsByRoutine.get(routine.id) || []).slice(
              0,
              3,
            );
            const apiTrigger = routine.triggers.find(
              (trigger) => trigger.type === "api",
            );
            const workspace = workspaceMap.get(routine.workspaceId);
            const routineTitle = getMissionControlTaskTitle(
              routine.name,
            ).replace(/\s+manual run$/i, "");
            const routineDescription = routine.description
              ? getRoutineDescriptionForDisplay(routine.description)
              : translate(
                  "generated.components.routinesettingspanel.2025.0",
                  "This automation will be started according to the set conditions and the execution results will be saved in NeoWorker.",
                );
            const workspaceName = getMissionControlScopeName(
              workspace?.name || routine.workspaceId,
            );
            return (
              <article
                key={routine.id}
                className={`routine-card ${routine.enabled ? "is-enabled" : "is-disabled"}`}
              >
                <header className="routine-card-header">
                  <div className="routine-card-copy">
                    <div className="routine-card-title-row">
                      <strong>{routineTitle}</strong>
                      <span
                        className={`routine-enabled-status ${routine.enabled ? "is-on" : "is-off"}`}
                      >
                        {routine.enabled
                          ? t("common.enabled", "Enabled")
                          : t("common.disabled", "Disabled")}
                      </span>
                    </div>
                    <p className="routine-card-description">
                      {routineDescription}
                    </p>
                  </div>

                  <div className="routine-card-actions">
                    <button
                      className="routine-card-action is-primary"
                      onClick={() => runRoutineNow(routine.id)}
                      disabled={saving}
                    >
                      <Play size={13} strokeWidth={1.8} />
                      {t("routines.runNow", "Run Now")}
                    </button>
                    <button
                      className="routine-card-action"
                      onClick={() => startEdit(routine)}
                    >
                      <Pencil size={13} strokeWidth={1.8} />
                      {t("common.edit", "Edit")}
                    </button>
                    <button
                      className="routine-card-action is-danger"
                      onClick={() => deleteRoutine(routine.id)}
                      disabled={saving}
                    >
                      <Trash2 size={13} strokeWidth={1.8} />
                      {t("common.delete", "Delete")}
                    </button>
                  </div>
                </header>

                <div
                  className="routine-card-facts"
                  aria-label={translate(
                    "generated.components.routinesettingspanel.2078.1",
                    "Automation rules description",
                  )}
                >
                  <div className="routine-card-fact">
                    <span>
                      <Clock3 size={15} aria-hidden="true" />
                      {translate(
                        "generated.components.routinesettingspanel.2082.2",
                        "when to run",
                      )}
                    </span>
                    <strong>{formatRoutineTriggerSummary(routine, t)}</strong>
                  </div>
                  <div className="routine-card-fact">
                    <span>
                      <Settings2 size={15} aria-hidden="true" />
                      {translate(
                        "generated.components.routinesettingspanel.2089.3",
                        "where to execute",
                      )}
                    </span>
                    <strong>
                      {formatRoutineExecutionSummary(routine, workspaceName, t)}
                    </strong>
                  </div>
                  <div className="routine-card-fact">
                    <span>
                      <Save size={15} aria-hidden="true" />
                      {translate(
                        "generated.components.routinesettingspanel.2098.4",
                        "Save the results to",
                      )}
                    </span>
                    <strong>{formatRoutineOutputSummary(routine, t)}</strong>
                  </div>
                </div>

                {apiTrigger?.type === "api" && (
                  <div
                    className="routine-api-card"
                    style={{
                      border:
                        "1px solid var(--color-border, rgba(127, 127, 127, 0.2))",
                      borderRadius: 12,
                      padding: 12,
                      display: "grid",
                      gap: 8,
                    }}
                  >
                    <div
                      style={{ display: "flex", gap: 8, alignItems: "center" }}
                    >
                      <Link2 size={16} />
                      <strong>{t("routines.apiTrigger", "API Trigger")}</strong>
                    </div>
                    <code style={{ wordBreak: "break-all" }}>
                      {apiBaseUrl}/
                      {apiTrigger.path ||
                        `routines/${routine.id}/${apiTrigger.id}`}
                    </code>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button
                        style={routineButtonStyle("secondary")}
                        onClick={() =>
                          copyText(
                            `${apiBaseUrl}/${apiTrigger.path || `routines/${routine.id}/${apiTrigger.id}`}`,
                          )
                        }
                      >
                        {t("common.copyUrl", "Copy URL")}
                      </button>
                      {apiTrigger.token && (
                        <>
                          <button
                            style={routineButtonStyle("secondary")}
                            onClick={() => copyText(apiTrigger.token || "")}
                          >
                            {t("common.copyToken", "Copy Token")}
                          </button>
                          <button
                            style={routineButtonStyle("secondary", saving)}
                            onClick={() =>
                              regenerateApiToken(routine, apiTrigger.id)
                            }
                            disabled={saving}
                          >
                            {t("common.rotateToken", "Rotate Token")}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}

                <section className="routine-run-history">
                  <div className="routine-run-history-heading">
                    <strong>
                      {translate(
                        "generated.components.routinesettingspanel.2163.5",
                        "Recently run",
                      )}
                    </strong>
                    {routineRuns.length > 0 ? (
                      <span>
                        {translate(
                          "generated.components.routinesettingspanel.2164.6",
                          "Display up to 3 items",
                        )}
                      </span>
                    ) : null}
                  </div>
                  {routineRuns.length === 0 ? (
                    <div className="routine-run-empty">
                      {translate(
                        "generated.components.routinesettingspanel.2168.7",
                        'Not running yet. Click "Run now" to check the results first.',
                      )}
                    </div>
                  ) : (
                    routineRuns.map((run) => (
                      <div
                        key={run.id}
                        className={`routine-run-row is-${getRoutineRunTone(run)}`}
                      >
                        <div className="routine-run-row-header">
                          <span className="routine-run-outcome">
                            {getRoutineRunOutcomeLabel(run, t)}
                          </span>
                          <span>
                            {t(
                              `routines.triggerType.${run.triggerType}`,
                              run.triggerType.replace(/_/g, " "),
                            )}
                            {translate(
                              "generated.components.routinesettingspanel.2185.8",
                              "start",
                            )}
                          </span>
                          <span>
                            {translate(
                              "generated.components.routinesettingspanel.2188.9",
                              "Result:",
                            )}
                            {formatRoutineOutputStatus(run.outputStatus, t)}
                          </span>
                          <time>{formatTime(run.startedAt)}</time>
                        </div>
                        {run.sourceEventSummary &&
                          !/^Manual run$/i.test(
                            run.sourceEventSummary.trim(),
                          ) && (
                            <p>
                              {getRoutineRunSummaryForDisplay(
                                run.sourceEventSummary,
                              )}
                            </p>
                          )}
                        {run.errorSummary && (
                          <p className="routine-run-message is-error">
                            {getRoutineRunSummaryForDisplay(run.errorSummary)}
                          </p>
                        )}
                        {run.artifactsSummary && (
                          <p className="routine-run-message">
                            {getRoutineRunSummaryForDisplay(
                              run.artifactsSummary,
                            )}
                          </p>
                        )}
                        {(run.backingTaskId || run.backingManagedSessionId) && (
                          <details className="routine-run-technical">
                            <summary>
                              {translate(
                                "generated.components.routinesettingspanel.2217.10",
                                "View technical information",
                              )}
                            </summary>
                            <div>
                              {run.backingTaskId ? (
                                <span>
                                  {translate(
                                    "generated.components.routinesettingspanel.2220.11",
                                    "Task ID:",
                                  )}
                                  {run.backingTaskId}
                                </span>
                              ) : null}
                              {run.backingManagedSessionId ? (
                                <span>
                                  {translate(
                                    "generated.components.routinesettingspanel.2224.12",
                                    "Session ID:",
                                  )}
                                  {run.backingManagedSessionId}
                                </span>
                              ) : null}
                            </div>
                          </details>
                        )}
                      </div>
                    ))
                  )}
                </section>
              </article>
            );
          })
        )}
      </div>
    </div>
  );
}

function TriggerToggle(props: {
  checked: boolean;
  label: string;
  description: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="settings-checkbox" style={{ display: "grid", gap: 4 }}>
      <span style={checkboxRowStyle}>
        <input
          type="checkbox"
          checked={props.checked}
          onChange={(event) => props.onChange(event.target.checked)}
          style={checkboxInputStyle}
        />
        <span>{props.label}</span>
      </span>
      <span className="settings-help" style={{ marginLeft: 28 }}>
        {props.description}
      </span>
    </label>
  );
}

function RoutineCheckbox(props: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="settings-checkbox" style={checkboxRowStyle}>
      <input
        type="checkbox"
        checked={props.checked}
        onChange={(event) => props.onChange(event.target.checked)}
        style={checkboxInputStyle}
      />
      <span style={{ minWidth: 0 }}>{props.label}</span>
    </label>
  );
}

function buildTriggers(
  form: RoutineFormState,
  existing: Routine | null,
): RoutineTrigger[] {
  const findExisting = <T extends RoutineTrigger["type"]>(type: T) =>
    existing?.triggers.find(
      (trigger): trigger is Extract<RoutineTrigger, { type: T }> =>
        trigger.type === type,
    );

  const triggers: RoutineTrigger[] = [];
  const scheduleExisting = findExisting("schedule");
  const apiExisting = findExisting("api");
  const connectorExisting = findExisting("connector_event");
  const channelExisting = findExisting("channel_event");
  const mailboxExisting = findExisting("mailbox_event");
  const githubExisting = findExisting("github_event");
  const manualExisting = findExisting("manual");

  if (form.scheduleEnabled) {
    const schedule: CronSchedule =
      form.scheduleKind === "every"
        ? { kind: "every", everyMs: form.scheduleEveryMinutes * 60_000 }
        : form.scheduleKind === "at"
          ? { kind: "at", atMs: new Date(form.scheduleAt).getTime() }
          : {
              kind: "cron",
              expr: form.scheduleExpr.trim(),
              tz: form.scheduleTz.trim() || undefined,
            };
    triggers.push({
      ...(scheduleExisting || { id: window.crypto.randomUUID() }),
      type: "schedule",
      enabled: true,
      schedule,
    });
  }

  if (form.apiEnabled) {
    triggers.push({
      ...(apiExisting || { id: window.crypto.randomUUID() }),
      type: "api",
      enabled: true,
      path: form.apiPath.trim() || undefined,
    });
  }

  if (form.connectorEventEnabled) {
    triggers.push({
      ...(connectorExisting || { id: window.crypto.randomUUID() }),
      type: "connector_event",
      enabled: true,
      connectorId: form.connectorEventConnectorId.trim(),
      changeType: form.connectorEventChangeType.trim() || undefined,
      resourceUriContains:
        form.connectorEventResourceUriContains.trim() || undefined,
    });
  }

  if (form.channelEventEnabled) {
    triggers.push({
      ...(channelExisting || { id: window.crypto.randomUUID() }),
      type: "channel_event",
      enabled: true,
      channelType: form.channelEventChannelType.trim() || undefined,
      chatId: form.channelEventChatId.trim() || undefined,
      textContains: form.channelEventTextContains.trim() || undefined,
      senderContains: form.channelEventSenderContains.trim() || undefined,
    });
  }

  if (form.mailboxEventEnabled) {
    triggers.push({
      ...(mailboxExisting || { id: window.crypto.randomUUID() }),
      type: "mailbox_event",
      enabled: true,
      eventType: form.mailboxEventType.trim() || undefined,
      provider: form.mailboxEventProvider.trim() || undefined,
      subjectContains: form.mailboxEventSubjectContains.trim() || undefined,
      labelContains: form.mailboxEventLabelContains.trim() || undefined,
    });
  }

  if (form.githubEventEnabled) {
    triggers.push({
      ...(githubExisting || { id: window.crypto.randomUUID() }),
      type: "github_event",
      enabled: true,
      eventName: form.githubEventName.trim() || undefined,
      repository: form.githubEventRepository.trim() || undefined,
      action: form.githubEventAction.trim() || undefined,
      ref: form.githubEventRef.trim() || undefined,
    });
  }

  if (form.manualEnabled) {
    triggers.push({
      ...(manualExisting || { id: window.crypto.randomUUID() }),
      type: "manual",
      enabled: true,
    });
  }

  return triggers;
}

function buildOutputs(form: RoutineFormState): RoutineOutput[] {
  const outputs: RoutineOutput[] = [];
  if (
    form.outputTaskOnly ||
    (!form.outputChannelMessage && !form.outputWebhookResponse)
  ) {
    outputs.push({ kind: "task_only" });
  }
  if (form.outputChannelMessage) {
    outputs.push({
      kind: "channel_message",
      channelType: form.outputChannelType.trim() || undefined,
      channelId: form.outputChannelId.trim() || undefined,
      summaryOnly: form.outputSummaryOnly,
      deliverOnSuccess: form.outputDeliverOnSuccess,
      deliverOnError: form.outputDeliverOnError,
    });
  }
  if (form.outputWebhookResponse) {
    outputs.push({
      kind: "webhook_response",
      statusCode: form.outputWebhookStatusCode,
      message: form.outputWebhookMessage.trim() || undefined,
      includeTaskId: form.outputWebhookIncludeTaskId,
    });
  }
  return outputs;
}

function toDateTimeLocal(timestampMs: number): string {
  const date = new Date(timestampMs);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatTime(timestampMs: number): string {
  return new Date(timestampMs).toLocaleString();
}

function formatRoutineTriggerSummary(
  routine: Routine,
  t: typeof translate,
): string {
  const enabledTriggers = routine.triggers.filter((trigger) => trigger.enabled);
  if (enabledTriggers.length === 0)
    return translate(
      "generated.components.routinesettingspanel.2435.13",
      "No startup conditions have been set yet",
    );

  return enabledTriggers
    .map((trigger) => {
      if (trigger.type === "manual")
        return translate(
          "generated.components.routinesettingspanel.2439.14",
          "Manually start when needed",
        );
      if (trigger.type === "schedule") {
        const schedule = trigger.schedule;
        if (schedule.kind === "every") {
          const minutes = Math.max(1, Math.round(schedule.everyMs / 60_000));
          return minutes % 60 === 0
            ? translate(
                "routines.schedule.everyHours",
                "Run automatically every {count} hours",
                { count: Math.max(1, minutes / 60) },
              )
            : translate(
                "routines.schedule.everyMinutes",
                "Run automatically every {count} minutes",
                { count: minutes },
              );
        }
        if (schedule.kind === "at") {
          return translate(
            "routines.schedule.runOnceAt",
            "Run automatically once at {time}",
            { time: formatTime(schedule.atMs) },
          );
        }
        const expr = schedule.expr.trim();
        const parts = expr.split(/\s+/);
        if (parts.length === 5) {
          const minute = parts[0].padStart(2, "0");
          const hour = parts[1].padStart(2, "0");
          if (parts[2] === "*" && parts[3] === "*" && parts[4] === "1-5") {
            return translate(
              "routines.schedule.weekdaysAt",
              "Run automatically on weekdays at {time}",
              { time: `${hour}:${minute}` },
            );
          }
          if (parts[2] === "*" && parts[3] === "*" && parts[4] === "*") {
            return translate(
              "routines.schedule.dailyAt",
              "Run automatically every day at {time}",
              { time: `${hour}:${minute}` },
            );
          }
        }
        return translate(
          "generated.components.routinesettingspanel.2463.15",
          "Run automatically at custom time",
        );
      }
      return translate("routines.trigger.named", "Triggered by {trigger}", {
        trigger: t(
          `routines.triggerType.${trigger.type}`,
          trigger.type.replace(/_/g, " "),
        ),
      });
    })
    .join(
      translate(
        "generated.components.routinesettingspanel.2470.16",
        ", also available",
      ),
    );
}

function formatRoutineExecutionSummary(
  routine: Routine,
  workspaceName: string,
  t: typeof translate,
): string {
  const target = t(
    `routines.execution.${routine.executionTarget.kind}`,
    routine.executionTarget.kind.replace(/_/g, " "),
  );
  return `${workspaceName}，${target}`;
}

function formatRoutineOutputSummary(
  routine: Routine,
  t: typeof translate,
): string {
  if (routine.outputs.length === 0)
    return translate(
      "generated.components.routinesettingspanel.2489.17",
      "NeoWorker task record",
    );
  return routine.outputs
    .map((output) => {
      if (output.kind === "task_only")
        return translate(
          "generated.components.routinesettingspanel.2492.18",
          "NeoWorker task record",
        );
      if (output.kind === "channel_message")
        return translate(
          "generated.components.routinesettingspanel.2493.19",
          "designated channel",
        );
      if (output.kind === "webhook_response")
        return translate(
          "generated.components.routinesettingspanel.2494.20",
          "The caller's webhook response",
        );
      return t(
        `routines.outputType.${(output as RoutineOutput).kind}`,
        (output as RoutineOutput).kind.replace(/_/g, " "),
      );
    })
    .join("、");
}

function getRoutineRunTone(run: RoutineRun): "success" | "warning" | "active" {
  const summary = `${run.errorSummary || ""} ${run.artifactsSummary || ""}`;
  if (
    run.status === "failed" ||
    /\b(?:failed|blocked|error)\b/i.test(summary)
  ) {
    return "warning";
  }
  if (
    ["pending", "queued", "running"].includes(normalizeStatusKey(run.status))
  ) {
    return "active";
  }
  return "success";
}

function getRoutineRunOutcomeLabel(
  run: RoutineRun,
  t: typeof translate,
): string {
  if (
    getRoutineRunTone(run) === "warning" &&
    normalizeStatusKey(run.status) === "completed"
  ) {
    return translate(
      "generated.components.routinesettingspanel.2527.21",
      "partially completed",
    );
  }
  return formatRoutineStatus(run.status, t);
}

function formatRoutineStatus(status: string, t: typeof translate): string {
  const key = normalizeStatusKey(status);
  return t(`routines.runStatus.${key}`, status);
}

function formatRoutineOutputStatus(
  status: string,
  t: typeof translate,
): string {
  const key = normalizeStatusKey(status);
  return t(`routines.outputStatus.${key}`, status);
}

function normalizeStatusKey(value: string): string {
  return String(value || "unknown")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_");
}
