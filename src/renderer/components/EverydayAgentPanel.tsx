import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Ban,
  Bot,
  Brain,
  CalendarDays,
  CheckCircle2,
  CircleDot,
  Code2,
  Clock,
  Database,
  Eye,
  FileClock,
  FileText,
  FolderOpen,
  Globe2,
  KeyRound,
  Mail,
  MessageCircle,
  Monitor,
  PauseCircle,
  Play,
  ReceiptText,
  RefreshCw,
  RotateCcw,
  Settings as SettingsIcon,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Send,
  Trash2,
  Workflow,
  XCircle,
} from "lucide-react";
import {
  EVERYDAY_AGENT_CAPABILITY_BUNDLES,
  EVERYDAY_AGENT_CONSENT_VERSION,
  type ApprovalRequest,
  type EverydayActionPreview,
  type EverydayActionReceipt,
  type EverydayActionRisk,
  type EverydayAgentProfileResult,
  type EverydayCapabilityBundle,
  type EverydayPauseScope,
  type ProactiveSuggestion,
  type Task,
  type Workspace,
} from "../../shared/types";
import { translate, useLanguage } from "../i18n";
import "./everyday-agent.css";
import { NeoWorkerPageHeader } from "./NeoWorkerPageHeader";
import { UnifiedTaskComposer } from "./UnifiedTaskComposer";

interface EverydayAgentPanelProps {
  workspace?: Workspace | null;
  settingsMode?: boolean;
  onOpenSettings?: () => void;
  onOpenMissionControl?: () => void;
  onOpenApproval?: (approval: ApprovalRequest) => void;
  onCreateTask?: (
    title: string,
    prompt: string,
  ) => boolean | void | Promise<boolean | void>;
  onOpenComposerDraft?: (
    draft: string,
    workspace?: Workspace | null,
  ) => void | Promise<void>;
  onStartNewWork?: () => void;
  tasks?: Task[];
}

type PauseKind = EverydayPauseScope["kind"];
type PriorityTone = "danger" | "warn" | "quiet" | "success";
type EverydayAgentStatus =
  "loading" | "enabled" | "paused" | "disabled" | "blocked";
export type EverydayAgentTemporaryModes = {
  noMemory: boolean;
  disposableBrowser: boolean;
  readOnly: boolean;
};

export interface EverydayAgentPriorityItem {
  id: string;
  title: string;
  detail: string;
  tone: PriorityTone;
  meta?: string;
  actionKind?:
    "settings" | "resume" | "memory" | "receipt" | "suggestion" | "preview";
}

export function everydayArtworkUrl(path: string): string {
  return `${import.meta.env.BASE_URL}${path.replace(/^\/+/, "")}`;
}

const DAILY_ASSISTANT_HERO_ARTWORK = everydayArtworkUrl(
  "/everyday/daily-assistant-hero.webp",
);
const DAILY_APPROVAL_ARTWORK = everydayArtworkUrl(
  "/everyday/approval-review.webp",
);
const DAILY_FOCUS_ARTWORK = {
  "focus-priority": everydayArtworkUrl("/everyday/focus-priority.webp"),
  "focus-suggestion": everydayArtworkUrl("/everyday/focus-organize.webp"),
  "focus-routine": everydayArtworkUrl("/everyday/focus-follow-up.webp"),
} as const;

export function getApprovalTypeLabel(type: ApprovalRequest["type"]): string {
  const labels: Record<ApprovalRequest["type"], string> = {
    delete_file: translate(
      "generated.components.everydayagentpanel.89.0",
      "Delete files",
    ),
    delete_multiple: translate(
      "generated.components.everydayagentpanel.90.1",
      "Batch delete",
    ),
    bulk_rename: translate(
      "generated.components.everydayagentpanel.91.2",
      "Batch rename",
    ),
    network_access: translate(
      "generated.components.everydayagentpanel.92.3",
      "access network",
    ),
    data_export: translate(
      "generated.components.everydayagentpanel.93.4",
      "Export data",
    ),
    external_service: translate(
      "generated.components.everydayagentpanel.94.5",
      "Call external services",
    ),
    location_access: translate(
      "generated.components.everydayagentpanel.95.6",
      "Visit location",
    ),
    run_command: translate(
      "generated.components.everydayagentpanel.96.7",
      "Run command",
    ),
    risk_gate: translate(
      "generated.components.everydayagentpanel.97.8",
      "high risk operations",
    ),
    computer_use: translate(
      "generated.components.everydayagentpanel.98.9",
      "Work with native apps",
    ),
  };
  return (
    labels[type] ||
    translate(
      "generated.components.everydayagentpanel.100.10",
      "Sensitive operations",
    )
  );
}

interface EverydayRoutineSummary {
  id: string;
  name: string;
  detail: string;
  status: string;
  tone: PriorityTone;
  enabled: boolean;
  lastRunAt?: number;
}

export interface EverydayAgentPlanStep {
  id: string;
  title: string;
  detail: string;
  capability: EverydayCapabilityBundle;
  riskClass: EverydayActionRisk;
  posture: "read_only" | "preview" | "approval" | "trusted" | "blocked";
}

export interface EverydayAgentRecoveryItem {
  id: string;
  title: string;
  detail: string;
  actionLabel: string;
  tone: PriorityTone;
}

export function updateEverydayAgentTemporaryMode(
  current: EverydayAgentTemporaryModes,
  mode: keyof EverydayAgentTemporaryModes,
  checked: boolean,
): EverydayAgentTemporaryModes {
  return {
    ...current,
    [mode]: checked,
  };
}

interface EverydayAgentRecipe {
  id: string;
  title: string;
  description: string;
  capability: EverydayCapabilityBundle;
  riskClass: EverydayActionRisk;
  surfaces: string[];
  prompt: string;
}

interface EverydaySecureLane {
  id: string;
  title: string;
  description: string;
  capability: EverydayCapabilityBundle;
  status: "available" | "disabled" | "restricted";
}

const CAPABILITY_MAP_GROUPS: Array<{
  id: string;
  title: string;
  description: string;
  bundles: EverydayCapabilityBundle[];
}> = [
  {
    id: "read",
    title: translate("generated.components.everydayagentpanel.167.11", "read"),
    description: translate(
      "generated.components.everydayagentpanel.168.12",
      "Understand authorized information and context",
    ),
    bundles: ["inbox", "calendar", "browser", "files", "screen_context"],
  },
  {
    id: "create",
    title: translate(
      "generated.components.everydayagentpanel.173.13",
      "Create",
    ),
    description: translate(
      "generated.components.everydayagentpanel.174.14",
      "Generate drafts, knowledge, and reviewable suggestions",
    ),
    bundles: ["docs", "messages", "memory"],
  },
  {
    id: "act",
    title: translate(
      "generated.components.everydayagentpanel.179.15",
      "execute",
    ),
    description: translate(
      "generated.components.everydayagentpanel.180.16",
      "Follow approval boundaries before impacting external workflows",
    ),
    bundles: ["github_work", "remote_devices", "automations"],
  },
];

function CapabilityMapIcon({
  capability,
  size = 18,
}: {
  capability: EverydayCapabilityBundle;
  size?: number;
}) {
  switch (capability) {
    case "inbox":
      return <Mail size={size} />;
    case "calendar":
      return <CalendarDays size={size} />;
    case "browser":
      return <Globe2 size={size} />;
    case "files":
      return <FolderOpen size={size} />;
    case "docs":
      return <FileText size={size} />;
    case "messages":
      return <MessageCircle size={size} />;
    case "github_work":
      return <Code2 size={size} />;
    case "memory":
      return <Brain size={size} />;
    case "screen_context":
      return <Monitor size={size} />;
    case "remote_devices":
      return <Monitor size={size} />;
    case "automations":
      return <Workflow size={size} />;
  }
}

const RISK_LABELS: Record<EverydayActionRisk, string> = {
  read: "Read",
  draft: "Draft",
  stage: "Stage",
  execute_low_risk: "Low-risk execution",
  execute_sensitive: "Sensitive execution",
  destructive: "Destructive",
  data_export: "Data export",
  spend: "Spend",
  credential_sensitive: "Credential-sensitive",
};

const PAUSE_KINDS: PauseKind[] = [
  "global",
  "capability",
  "connector",
  "workspace",
  "device",
  "channel",
];

const EVERYDAY_AGENT_RECIPES: EverydayAgentRecipe[] = [
  {
    id: "daily-inbox-triage",
    title: "Daily inbox triage",
    description: "Group urgent mail, draft replies, and stage follow-up tasks.",
    capability: "inbox",
    riskClass: "execute_sensitive",
    surfaces: ["Inbox Agent", "Home", "Receipts"],
    prompt:
      "Run a review-first inbox triage and preview any drafts before sending.",
  },
  {
    id: "meeting-prep",
    title: "Meeting prep brief",
    description:
      "Build a calendar brief from approved docs, email, and recent tasks.",
    capability: "calendar",
    riskClass: "data_export",
    surfaces: ["Calendar", "Docs", "Memory"],
    prompt:
      "Prepare a meeting brief using approved sources and cite the evidence used.",
  },
  {
    id: "follow-up-detector",
    title: "Follow-up detector",
    description:
      "Find promised next steps and turn them into reviewable suggestions.",
    capability: "automations",
    riskClass: "stage",
    surfaces: ["Workflow Intelligence", "Routines"],
    prompt: "Detect open follow-ups and preview a trusted routine candidate.",
  },
  {
    id: "weekly-status-draft",
    title: "Weekly status draft",
    description:
      "Summarize completed work, blockers, and next actions for review.",
    capability: "docs",
    riskClass: "draft",
    surfaces: ["Docs", "Mission Control"],
    prompt:
      "Draft a weekly status update with source-backed bullets and no external posting.",
  },
];

export function isEverydayAgentUuid(
  value: string | undefined,
): value is string {
  return Boolean(
    value &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    ),
  );
}

function formatTime(value?: number): string {
  if (!value) return translate("common.never", "never");
  return new Date(value).toLocaleString();
}

function capabilityLabel(capability: EverydayCapabilityBundle): string {
  const translated = translate(`everyday.capability.${capability}.label`);
  if (translated !== `everyday.capability.${capability}.label`)
    return translated;
  return (
    EVERYDAY_AGENT_CAPABILITY_BUNDLES.find((bundle) => bundle.id === capability)
      ?.label || capability
  );
}

function capabilityDescription(
  capability: EverydayCapabilityBundle,
  fallback: string,
): string {
  return translate(`everyday.capability.${capability}.description`, fallback);
}

function surfaceLabel(surface: string): string {
  const key = `everyday.surface.${surface
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .toLowerCase()}`;
  return translate(key, surface);
}

function pauseKindLabel(kind: PauseKind): string {
  return translate(`everyday.pauseKind.${kind}`, kind.replace("_", " "));
}

function riskLabel(risk: EverydayActionRisk): string {
  return translate(`everyday.risk.${risk}`, RISK_LABELS[risk]);
}

export function getEverydayAgentStatus(
  result: EverydayAgentProfileResult | null,
): EverydayAgentStatus {
  if (!result) return "loading";
  if (result.compiledPolicy.adminPolicy.blocked) return "blocked";
  if (!result.profile.enabled) return "disabled";
  if (!result.compiledPolicy.enabled) return "paused";
  return "enabled";
}

function statusLabel(result: EverydayAgentProfileResult | null): string {
  const status = getEverydayAgentStatus(result);
  if (status === "blocked")
    return translate("everyday.status.blocked", "blocked by admin");
  if (status === "disabled")
    return translate("everyday.status.disabled", "Deactivated");
  if (status === "paused")
    return translate("everyday.status.paused", "Suspended");
  if (status === "enabled")
    return translate("everyday.status.enabled", "Enabled");
  return translate("everyday.status.loading", "Loading");
}

export function isEverydayAgentConsentRequired(
  result: EverydayAgentProfileResult | null,
): boolean {
  if (!result) return false;
  const declinedCurrentConsent =
    (result.profile.declinedConsentVersion ?? 0) >=
    EVERYDAY_AGENT_CONSENT_VERSION;
  return (
    !declinedCurrentConsent &&
    result.profile.acceptedConsentVersion < EVERYDAY_AGENT_CONSENT_VERSION
  );
}

function riskTone(risk: EverydayActionRisk): "quiet" | "warn" | "danger" {
  if (
    risk === "destructive" ||
    risk === "spend" ||
    risk === "credential_sensitive"
  ) {
    return "danger";
  }
  if (risk === "execute_sensitive" || risk === "data_export") return "warn";
  return "quiet";
}

function receiptTone(status: EverydayActionReceipt["status"]): PriorityTone {
  if (status === "blocked" || status === "failed") return "danger";
  if (status === "paused" || status === "previewed") return "warn";
  return "quiet";
}

function suggestionDescription(suggestion: ProactiveSuggestion): string {
  return (
    suggestion.actionPrompt ||
    suggestion.description ||
    translate(
      "everyday.suggestion.defaultAction",
      "Next steps for review recommendations",
    )
  );
}

function inferSuggestionCapability(
  suggestion: ProactiveSuggestion,
): EverydayCapabilityBundle {
  const haystack =
    `${suggestion.title} ${suggestion.description} ${suggestion.actionPrompt || ""} ${suggestion.sourceEntity || ""}`.toLowerCase();
  if (haystack.includes("mail") || haystack.includes("inbox")) return "inbox";
  if (haystack.includes("calendar") || haystack.includes("meeting"))
    return "calendar";
  if (haystack.includes("browser") || haystack.includes("web"))
    return "browser";
  if (haystack.includes("file")) return "files";
  if (haystack.includes("doc")) return "docs";
  if (haystack.includes("message") || haystack.includes("slack"))
    return "messages";
  if (haystack.includes("github") || haystack.includes("pull request"))
    return "github_work";
  if (haystack.includes("memory")) return "memory";
  if (haystack.includes("device")) return "remote_devices";
  return "automations";
}

function previewTargetLabel(preview: EverydayActionPreview): string {
  return (
    preview.target.connectorAccountId ||
    preview.target.destination ||
    preview.target.targetIdentity ||
    preview.target.channelId ||
    preview.target.deviceId ||
    preview.target.browserProfileId ||
    preview.target.workspaceId ||
    translate("everyday.preview.scopedTarget", "scoped goals")
  );
}

export function buildEverydayAgentPriorityItems({
  result,
  receipts,
  suggestions,
  memoryCandidateCount,
  preview,
}: {
  result: EverydayAgentProfileResult | null;
  receipts: EverydayActionReceipt[];
  suggestions: ProactiveSuggestion[];
  memoryCandidateCount: number | null;
  preview?: EverydayActionPreview | null;
}): EverydayAgentPriorityItem[] {
  const items: EverydayAgentPriorityItem[] = [];
  const status = getEverydayAgentStatus(result);

  if (status === "blocked") {
    items.push({
      id: "admin-blocked",
      title: translate(
        "everyday.priority.blocked.title",
        "Everyday agents have been blocked",
      ),
      detail: translate(
        "everyday.priority.blocked.detail",
        "Organizational policies are preventing all day-to-day agent work.",
      ),
      tone: "danger",
      actionKind: "settings",
    });
  } else if (status === "disabled") {
    items.push({
      id: "disabled",
      title: translate(
        "everyday.priority.disabled.title",
        "Start working after enabling",
      ),
      detail: translate(
        "everyday.priority.disabled.detail",
        "Before the agent observes the signal, please confirm the authorization and capability scope.",
      ),
      tone: "warn",
      actionKind: "settings",
    });
  } else if (status === "paused") {
    items.push({
      id: "paused",
      title: translate(
        "everyday.priority.paused.title",
        "Daily agent has been suspended",
      ),
      detail: translate(
        "everyday.priority.paused.detail",
        "No new work will be started until the current pause range is cleared.",
      ),
      tone: "warn",
      actionKind: "resume",
    });
  }

  if (
    preview &&
    (preview.status === "pending" || preview.status === "blocked")
  ) {
    items.push({
      id: `preview-${preview.id}`,
      title:
        preview.status === "blocked"
          ? translate("everyday.priority.previewBlocked", "Preview blocked")
          : translate(
              "everyday.priority.previewApproval",
              "Action preview requires approval",
            ),
      detail: preview.proposedMutation,
      tone: preview.status === "blocked" ? "danger" : "warn",
      meta: riskLabel(preview.riskClass),
      actionKind: "preview",
    });
  }

  receipts
    .filter((receipt) =>
      ["blocked", "failed", "paused", "previewed"].includes(receipt.status),
    )
    .slice(0, 3)
    .forEach((receipt) => {
      items.push({
        id: `receipt-${receipt.id}`,
        title: receipt.title,
        detail: receipt.summary,
        tone: receiptTone(receipt.status),
        meta: `${receipt.status} - ${capabilityLabel(receipt.capability)}`,
        actionKind: "receipt",
      });
    });

  if (memoryCandidateCount && memoryCandidateCount > 0) {
    items.push({
      id: "memory-review",
      title: translate(
        "everyday.priority.memory.title",
        "{count} candidate memories need review",
        {
          count: memoryCandidateCount,
        },
      ),
      detail: translate(
        "everyday.priority.memory.detail",
        "Memories with review priority need to be approved before they can enter the visible memory of prompt words.",
      ),
      tone: "quiet",
      actionKind: "memory",
    });
  }

  suggestions
    .filter((suggestion) => !suggestion.dismissed && !suggestion.actedOn)
    .slice(0, 2)
    .forEach((suggestion) => {
      items.push({
        id: `suggestion-${suggestion.id}`,
        title: suggestion.title,
        detail: suggestionDescription(suggestion),
        tone: suggestion.urgency === "high" ? "warn" : "quiet",
        meta: suggestion.urgency,
        actionKind: "suggestion",
      });
    });

  if (items.length === 0) {
    items.push({
      id: "clear",
      title: translate(
        "everyday.priority.clear.title",
        "No approvals pending or failed",
      ),
      detail: translate(
        "everyday.priority.clear.detail",
        "Currently idle, observing authorized signals and trusted routine tasks.",
      ),
      tone: "success",
    });
  }

  return items.slice(0, 7);
}

export function classifyEverydayAgentRecovery(
  receipt: EverydayActionReceipt,
): EverydayAgentRecoveryItem | null {
  if (!["blocked", "failed", "paused"].includes(receipt.status)) return null;
  const text =
    `${receipt.title} ${receipt.summary} ${receipt.retryState?.lastError || ""}`.toLowerCase();

  if (
    text.includes("oauth") ||
    text.includes("auth") ||
    text.includes("scope")
  ) {
    return {
      id: `recovery-${receipt.id}`,
      title: translate(
        "everyday.recovery.connector.title",
        "Connector access needs fixing",
      ),
      detail: receipt.retryState?.lastError || receipt.summary,
      actionLabel: translate(
        "everyday.recovery.connector.action",
        "Reconnect app",
      ),
      tone: "warn",
    };
  }
  if (
    text.includes("network") ||
    text.includes("timeout") ||
    text.includes("offline")
  ) {
    return {
      id: `recovery-${receipt.id}`,
      title: translate("everyday.recovery.network.title", "Network outage"),
      detail: translate(
        "everyday.recovery.network.detail",
        "Try again as a drill first to avoid repeating side effects.",
      ),
      actionLabel: translate(
        "everyday.recovery.network.action",
        "Walkthrough retry",
      ),
      tone: "warn",
    };
  }
  if (text.includes("duplicate") || text.includes("idempotency")) {
    return {
      id: `recovery-${receipt.id}`,
      title: translate(
        "everyday.recovery.duplicate.title",
        "Possibility of recurring side effects",
      ),
      detail: translate(
        "everyday.recovery.duplicate.detail",
        "Check external ID and idempotent key {key}.",
        {
          key: receipt.idempotencyKey,
        },
      ),
      actionLabel: translate(
        "everyday.recovery.duplicate.action",
        "View receipt",
      ),
      tone: "danger",
    };
  }
  if (text.includes("policy") || receipt.status === "blocked") {
    return {
      id: `recovery-${receipt.id}`,
      title: translate(
        "everyday.recovery.policy.title",
        "Strategy blocks action",
      ),
      detail: receipt.summary,
      actionLabel: translate("everyday.recovery.policy.action", "open policy"),
      tone: "danger",
    };
  }
  return {
    id: `recovery-${receipt.id}`,
    title: translate(
      "everyday.recovery.generic.title",
      "Recoverable action failed",
    ),
    detail: receipt.retryState?.lastError || receipt.summary,
    actionLabel: translate(
      "everyday.recovery.generic.action",
      "Check and try again",
    ),
    tone: "warn",
  };
}

export function buildEverydayAgentPlanSteps({
  status,
  busy,
  preview,
  suggestions,
  receipts,
}: {
  status: EverydayAgentStatus;
  busy: string | null;
  preview: EverydayActionPreview | null;
  suggestions: ProactiveSuggestion[];
  receipts: EverydayActionReceipt[];
}): EverydayAgentPlanStep[] {
  if (status === "blocked") {
    return [
      {
        id: "blocked",
        title: translate("everyday.plan.blocked.title", "stop before start"),
        detail: translate(
          "everyday.plan.blocked.detail",
          "Administrator policy blocks this operator interface.",
        ),
        capability: "automations",
        riskClass: "read",
        posture: "blocked",
      },
    ];
  }

  const firstSuggestion = suggestions.find(
    (suggestion) => !suggestion.dismissed && !suggestion.actedOn,
  );
  const firstReceipt = receipts[0];
  const targetCapability =
    preview?.capability ||
    (firstSuggestion
      ? inferSuggestionCapability(firstSuggestion)
      : firstReceipt?.capability) ||
    "automations";
  const targetRisk = preview?.riskClass || firstReceipt?.riskClass || "stage";

  return [
    {
      id: "collect",
      title:
        busy ||
        translate("everyday.plan.collect.title", "Observe authorized signals"),
      detail: translate(
        "everyday.plan.collect.detail",
        "Read-only collection of evidence from enabled capabilities.",
      ),
      capability: targetCapability,
      riskClass: "read",
      posture: "read_only",
    },
    {
      id: "compose",
      title: preview
        ? translate("everyday.plan.compose.preview", "Review proposed changes")
        : firstSuggestion
          ? translate(
              "everyday.plan.compose.suggestion",
              "Next steps for organizing suggestions",
            )
          : translate(
              "everyday.plan.compose.wait",
              "Waiting for valuable work",
            ),
      detail:
        preview?.proposedMutation ||
        firstSuggestion?.description ||
        translate(
          "everyday.plan.compose.empty",
          "No side effects have been prepared.",
        ),
      capability: targetCapability,
      riskClass: targetRisk,
      posture: preview ? "preview" : "read_only",
    },
    {
      id: "approval",
      title: translate(
        "everyday.plan.approval.title",
        "Ask before important actions",
      ),
      detail: translate(
        "everyday.plan.approval.detail",
        "Send, publish, export, credential, consume, delete, and move across workspaces all require approval.",
      ),
      capability: targetCapability,
      riskClass: targetRisk,
      posture:
        targetRisk === "read" ||
        targetRisk === "draft" ||
        targetRisk === "stage"
          ? "preview"
          : "approval",
    },
    {
      id: "receipt",
      title: translate(
        "everyday.plan.receipt.title",
        "Write a receipt and review it before learning",
      ),
      detail: translate(
        "everyday.plan.receipt.detail",
        "Receipts are checkable; memory and trusted modes keep review priority.",
      ),
      capability: "memory",
      riskClass: "stage",
      posture: "trusted",
    },
  ];
}

function buildSecureLanes(
  enabledCapabilities: EverydayCapabilityBundle[],
  connectedAppsCount: number,
  pausedScopes: EverydayPauseScope[],
): EverydaySecureLane[] {
  const hasPause = (capability: EverydayCapabilityBundle) =>
    pausedScopes.some(
      (scope) => scope.kind === "capability" && scope.capability === capability,
    );
  const laneFor = (
    id: string,
    title: string,
    description: string,
    capability: EverydayCapabilityBundle,
  ): EverydaySecureLane => ({
    id,
    title,
    description,
    capability,
    status: hasPause(capability)
      ? "restricted"
      : enabledCapabilities.includes(capability) || connectedAppsCount > 0
        ? "available"
        : "disabled",
  });

  return [
    laneFor(
      "browser",
      translate("everyday.lane.browser.title", "Visible browser channel"),
      translate(
        "everyday.lane.browser.description",
        "Prioritize the browser workbench; takeover will be paused before side effects occur.",
      ),
      "browser",
    ),
    laneFor(
      "mail",
      translate("everyday.lane.mail.title", "Mail channel"),
      translate(
        "everyday.lane.mail.description",
        "Both drafting and sending are bound to accounts, goals, approvals and receipts.",
      ),
      "inbox",
    ),
    laneFor(
      "files",
      translate("everyday.lane.files.title", "file channel"),
      translate(
        "everyday.lane.files.description",
        "Local files are used as evidence only by default; deletion and export always ask first.",
      ),
      "files",
    ),
    laneFor(
      "connectors",
      translate("everyday.lane.connectors.title", "connector channel"),
      translate(
        "everyday.lane.connectors.description",
        "The scope of the connected application remains account bound and can be revoked at any time.",
      ),
      "docs",
    ),
    laneFor(
      "devices",
      translate("everyday.lane.devices.title", "device channel"),
      translate(
        "everyday.lane.devices.description",
        "Remote device dispatch remains visible, pauseable, and auditable.",
      ),
      "remote_devices",
    ),
  ];
}

function routineTriggerSummary(routine: Any): string {
  if (Array.isArray(routine?.triggers) && routine.triggers.length > 0) {
    return routine.triggers
      .map((trigger: Any) => trigger.type || "trigger")
      .join(", ");
  }
  if (routine?.trigger?.type) return routine.trigger.type;
  return translate("everyday.routine.trusted", "Trusted routine tasks");
}

function routineRunFor(routineId: string, runs: Any[]): Any | undefined {
  return runs.find((run) => run.routineId === routineId);
}

function summarizeRoutine(
  routine: Any,
  latestRun?: Any,
): EverydayRoutineSummary {
  const enabled = routine.enabled !== false;
  const failed =
    latestRun?.status === "failed" || latestRun?.status === "error";
  return {
    id: String(routine.id),
    name:
      routine.name ||
      translate("everyday.routine.untitled", "Unnamed routine tasks"),
    detail:
      latestRun?.errorSummary ||
      routine.description ||
      routineTriggerSummary(routine),
    enabled,
    lastRunAt: latestRun?.finishedAt || latestRun?.startedAt,
    status: !enabled
      ? translate("everyday.routine.paused", "Suspended")
      : failed
        ? translate("everyday.routine.needsAttention", "Need attention")
        : translate("everyday.routine.monitoring", "Monitoring"),
    tone: !enabled ? "quiet" : failed ? "danger" : "success",
  };
}

async function loadRoutineSummaries(
  profile: EverydayAgentProfileResult["profile"],
  workspaceId?: string,
): Promise<EverydayRoutineSummary[]> {
  const summaries: EverydayRoutineSummary[] = [];

  if (profile.managedAgentId && window.electronAPI.listManagedAgentRoutines) {
    const managedRows = await window.electronAPI
      .listManagedAgentRoutines(profile.managedAgentId)
      .catch(() => []);
    for (const row of managedRows || []) {
      summaries.push(summarizeRoutine(row));
    }
  }

  const routineRows = window.electronAPI.listRoutines
    ? await window.electronAPI.listRoutines().catch(() => [])
    : [];
  const runRows = window.electronAPI.listRoutineRuns
    ? await window.electronAPI.listRoutineRuns(undefined, 50).catch(() => [])
    : [];

  for (const routine of routineRows || []) {
    if (
      workspaceId &&
      routine.workspaceId &&
      routine.workspaceId !== workspaceId
    )
      continue;
    if (summaries.some((summary) => summary.id === String(routine.id)))
      continue;
    summaries.push(
      summarizeRoutine(
        routine,
        routineRunFor(String(routine.id), runRows || []),
      ),
    );
  }

  return summaries.slice(0, 5);
}

export function EverydayAgentPanel({
  workspace,
  settingsMode = false,
  onOpenSettings,
  onOpenMissionControl,
  onOpenApproval,
  onCreateTask,
  onOpenComposerDraft,
  onStartNewWork,
  tasks = [],
}: EverydayAgentPanelProps) {
  const language = useLanguage();
  const t = translate;
  const [result, setResult] = useState<EverydayAgentProfileResult | null>(null);
  const [receipts, setReceipts] = useState<EverydayActionReceipt[]>([]);
  const [suggestions, setSuggestions] = useState<ProactiveSuggestion[]>([]);
  const [routines, setRoutines] = useState<EverydayRoutineSummary[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<ApprovalRequest[]>(
    [],
  );
  const [memoryCandidateCount, setMemoryCandidateCount] = useState<
    number | null
  >(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<EverydayActionPreview | null>(null);
  const [pauseKind, setPauseKind] = useState<PauseKind>("global");
  const [pauseTarget, setPauseTarget] = useState("");
  const [temporaryModes, setTemporaryModes] =
    useState<EverydayAgentTemporaryModes>({
      noMemory: false,
      disposableBrowser: true,
      readOnly: false,
    });
  const [showInlineComposer, setShowInlineComposer] = useState(false);
  const [showDailyActivity, setShowDailyActivity] = useState(false);
  const updateTemporaryMode = (
    mode: keyof EverydayAgentTemporaryModes,
    checked: boolean,
  ) => {
    setTemporaryModes((current) =>
      updateEverydayAgentTemporaryMode(current, mode, checked),
    );
  };
  const [previewForm, setPreviewForm] = useState({
    title: t(
      "everyday.previewForm.defaultTitle",
      "Organize follow-up items in your inbox",
    ),
    action: t(
      "everyday.previewForm.defaultAction",
      "Draft responses and hold follow-up tasks",
    ),
    capability: "inbox" as EverydayCapabilityBundle,
    toolName: "mailbox.generateDraft",
    destination: "",
  });

  const loadPendingApprovals = useCallback(async () => {
    if (!window.electronAPI.listPendingApprovals) {
      setPendingApprovals([]);
      return;
    }
    const rows = await window.electronAPI
      .listPendingApprovals(100)
      .catch(() => []);
    setPendingApprovals(
      rows
        .filter((approval) => approval.status === "pending")
        .sort((left, right) => left.requestedAt - right.requestedAt),
    );
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const profileResult = await window.electronAPI.everydayAgentGetProfile();
      setResult(profileResult);
      const [receiptRows, routineRows] = await Promise.all([
        window.electronAPI.everydayAgentListReceipts({
          profileId: profileResult.profile.id,
          workspaceId: workspace?.id,
          limit: 25,
        }),
        loadRoutineSummaries(profileResult.profile, workspace?.id),
      ]);
      setReceipts(receiptRows);
      setRoutines(routineRows);
      if (workspace?.id && window.electronAPI.listSuggestions) {
        const suggestionRows = await window.electronAPI.listSuggestions(
          workspace.id,
        );
        setSuggestions((suggestionRows || []).slice(0, 8));
      } else {
        setSuggestions([]);
      }
      if (window.electronAPI.listCoreMemoryCandidates) {
        if (
          isEverydayAgentUuid(profileResult.profile.id) &&
          isEverydayAgentUuid(workspace?.id)
        ) {
          const candidates = await window.electronAPI
            .listCoreMemoryCandidates({
              profileId: profileResult.profile.id,
              workspaceId: workspace.id,
              status: "proposed",
              limit: 50,
            })
            .catch(() => []);
          setMemoryCandidateCount(candidates.length);
        } else {
          setMemoryCandidateCount(0);
        }
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t("everyday.error.load", "Failed to load daily agent"),
      );
    } finally {
      setLoading(false);
    }
  }, [workspace?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadPendingApprovals();
    if (!window.electronAPI.onTaskEvent) return;
    return window.electronAPI.onTaskEvent((event) => {
      if (
        event.type === "approval_requested" ||
        event.type === "approval_granted" ||
        event.type === "approval_denied"
      ) {
        void loadPendingApprovals();
      }
    });
  }, [loadPendingApprovals]);

  const consentRequired = isEverydayAgentConsentRequired(result);
  const enabledCapabilities = result?.compiledPolicy.allowedCapabilities || [];
  const pausedScopes = result?.compiledPolicy.pausedScopes || [];
  const adminBlocked = result?.compiledPolicy.adminPolicy.blocked === true;
  const status = getEverydayAgentStatus(result);
  const canResume = Boolean(
    result && !adminBlocked && (status === "paused" || status === "disabled"),
  );

  const connectedApps = useMemo(() => {
    if (!result) return [];
    return Object.values(result.profile.connectorAllowlists).filter(
      (entry) => entry.enabled,
    );
  }, [result]);

  const priorityItems = useMemo(
    () =>
      buildEverydayAgentPriorityItems({
        result,
        receipts,
        suggestions,
        memoryCandidateCount,
        preview,
      }),
    [memoryCandidateCount, preview, receipts, result, suggestions],
  );

  const activeSuggestions = useMemo(
    () =>
      suggestions
        .filter((suggestion) => !suggestion.dismissed && !suggestion.actedOn)
        .slice(0, 4),
    [suggestions],
  );

  const recentReceipts = receipts.slice(0, 6);
  const recoveryItems = useMemo(
    () =>
      receipts
        .map((receipt) => classifyEverydayAgentRecovery(receipt))
        .filter((item): item is EverydayAgentRecoveryItem => Boolean(item))
        .slice(0, 4),
    [receipts],
  );
  const planSteps = useMemo(
    () =>
      buildEverydayAgentPlanSteps({
        status,
        busy,
        preview,
        suggestions,
        receipts,
      }),
    [busy, preview, receipts, status, suggestions],
  );
  const secureLanes = useMemo(
    () =>
      buildSecureLanes(enabledCapabilities, connectedApps.length, pausedScopes),
    [connectedApps.length, enabledCapabilities, pausedScopes],
  );
  const dailyFocusItems = useMemo(() => {
    const attention = priorityItems.find((item) => item.tone !== "success");
    const suggestion = activeSuggestions[0];
    const routine = routines.find((item) => item.enabled);
    return [
      {
        id: "focus-priority",
        index: "01",
        label: attention
          ? translate(
              "generated.components.everydayagentpanel.964.17",
              "Prioritize processing",
            )
          : translate(
              "generated.components.everydayagentpanel.964.18",
              "The beginning of today",
            ),
        title:
          attention?.title ||
          translate(
            "generated.components.everydayagentpanel.965.19",
            "Make a clear focus for today",
          ),
        detail:
          attention?.detail ||
          translate(
            "generated.components.everydayagentpanel.966.20",
            "Pick out the most important items from your current workspace and establish actionable next steps.",
          ),
        action:
          attention?.actionKind === "settings"
            ? !onOpenSettings && status === "disabled"
              ? translate(
                  "generated.components.everydayagentpanel.970.21",
                  "Enable daily assistant",
                )
              : translate(
                  "generated.components.everydayagentpanel.971.22",
                  "View treatment suggestions",
                )
            : attention?.actionKind === "resume"
              ? translate(
                  "generated.components.everydayagentpanel.973.23",
                  "resume operation",
                )
              : translate(
                  "generated.components.everydayagentpanel.974.24",
                  "Enter the task",
                ),
        actionKind:
          attention?.actionKind === "settings"
            ? "settings"
            : attention?.actionKind === "resume"
              ? "resume"
              : "mission",
      },
      {
        id: "focus-suggestion",
        index: "02",
        label: suggestion
          ? translate(
              "generated.components.everydayagentpanel.985.25",
              "new suggestions",
            )
          : translate(
              "generated.components.everydayagentpanel.985.26",
              "Assign work",
            ),
        title:
          suggestion?.title ||
          translate(
            "generated.components.everydayagentpanel.986.27",
            "Let your assistant help you sort out today’s to-do list",
          ),
        detail: suggestion
          ? suggestionDescription(suggestion)
          : translate(
              "generated.components.everydayagentpanel.989.28",
              "It creates a trackable job; external actions will still check with you first.",
            ),
        action: suggestion
          ? translate(
              "generated.components.everydayagentpanel.990.29",
              "View recommendations",
            )
          : translate(
              "generated.components.everydayagentpanel.990.30",
              "Start combing",
            ),
        actionKind: suggestion ? "suggestion" : "task",
        suggestion,
      },
      {
        id: "focus-routine",
        index: "03",
        label: routine
          ? translate(
              "generated.components.everydayagentpanel.997.31",
              "Routine advancement",
            )
          : translate(
              "generated.components.everydayagentpanel.997.32",
              "keep pace",
            ),
        title:
          routine?.name ||
          translate(
            "generated.components.everydayagentpanel.998.33",
            "Continuously follow up on work in progress",
          ),
        detail:
          routine?.detail ||
          translate(
            "generated.components.everydayagentpanel.999.34",
            "When work requires ongoing advancement, approval, or delivery, view the complete process in the task.",
          ),
        action: routine
          ? translate(
              "generated.components.everydayagentpanel.1000.35",
              "View running records",
            )
          : translate(
              "generated.components.everydayagentpanel.1000.36",
              "Open task",
            ),
        actionKind: routine ? "activity" : "mission",
      },
    ] as const;
  }, [activeSuggestions, onOpenSettings, priorityItems, routines, status]);
  const approvalItem = pendingApprovals[0] || null;
  const approvalTask = approvalItem
    ? tasks.find((task) => task.id === approvalItem.taskId) || null
    : null;

  const run = async <T,>(
    label: string,
    action: () => Promise<T>,
  ): Promise<T | null> => {
    setBusy(label);
    setError(null);
    try {
      const value = await action();
      await load();
      return value;
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${label}`);
      return null;
    } finally {
      setBusy(null);
    }
  };

  const updateCapability = (
    capability: EverydayCapabilityBundle,
    enabled: boolean,
  ) =>
    run(t("everyday.busy.updateCapability", "Update capability"), () =>
      window.electronAPI.everydayAgentUpdateProfile({
        capabilitySettings: {
          [capability]: { enabled, paused: false },
        },
      }),
    );

  const acceptConsent = (enabled: boolean) =>
    run(
      enabled
        ? t("everyday.busy.enable", "Enable daily assistant")
        : t("everyday.busy.decline", "Daily assistant is not enabled yet"),
      () =>
        window.electronAPI.everydayAgentAcceptConsent({
          enabled,
          accepted: enabled,
          workspaceId: workspace?.id,
        }),
    );

  const pause = (scope: Partial<EverydayPauseScope>) =>
    run(t("everyday.busy.pause", "Pause everyday agents"), () =>
      window.electronAPI.everydayAgentPause(scope),
    );

  const resume = () =>
    run(
      t("everyday.busy.resume", "Restoring everyday intelligence"),
      async () => {
        let next = result;
        if (!next?.profile.enabled) {
          next = await window.electronAPI.everydayAgentUpdateProfile({
            enabled: true,
          });
        }
        if (
          next?.compiledPolicy.pausedScopes.length ||
          next?.profile.pauseScopes.length
        ) {
          next = await window.electronAPI.everydayAgentClearData({
            pauseScopes: true,
          });
        }
        return next;
      },
    );

  const revokeCapability = (capability: EverydayCapabilityBundle) =>
    run(t("everyday.busy.revokeCapability", "Undo ability"), () =>
      window.electronAPI.everydayAgentRevokeCapability(capability),
    );

  const clearActivity = () =>
    run(t("everyday.busy.clearData", "Clear daily agent data"), () =>
      window.electronAPI.everydayAgentClearData({
        receipts: true,
        previews: true,
        cachedConnectorSummaries: true,
        browserProfileMetadata: true,
      }),
    );

  const deleteLocalAgentData = () =>
    run(t("everyday.busy.deleteData", "Delete local daily agent data"), () =>
      window.electronAPI.everydayAgentClearData({
        receipts: true,
        previews: true,
        trustPatterns: true,
        consentHistory: true,
        pauseScopes: true,
        memoryCandidates: true,
        routineProvenance: true,
        cachedConnectorSummaries: true,
        browserProfileMetadata: true,
      }),
    );

  const createPreview = async () => {
    const created = await run(
      t("everyday.busy.previewAction", "Preview action"),
      () =>
        window.electronAPI.everydayAgentPreviewAction({
          title: previewForm.title,
          action: previewForm.action,
          capability: previewForm.capability,
          toolName: previewForm.toolName,
          workspaceId: workspace?.id,
          destination: previewForm.destination || undefined,
          sourceEvidence: [
            t("everyday.source.consolePreview", "Daily agent console preview"),
          ],
          proposedMutation: previewForm.action,
        }),
    );
    if (created) setPreview(created);
  };

  const previewSuggestion = async (
    suggestion: ProactiveSuggestion,
    trustPattern = false,
  ) => {
    const capability = inferSuggestionCapability(suggestion);
    const created = await run(
      trustPattern
        ? t("everyday.busy.previewTrustedPattern", "Preview trusted mode")
        : t("everyday.busy.previewSuggestion", "Preview suggestions"),
      () =>
        window.electronAPI.everydayAgentPreviewAction({
          title: trustPattern
            ? t("everyday.preview.trustPatternTitle", "Trusted mode: {title}", {
                title: suggestion.title,
              })
            : suggestion.title,
          action: trustPattern
            ? t(
                "everyday.preview.promoteTrustedPattern",
                "Promote this accepted suggestion to scoped trusted mode: {description}",
                {
                  description: suggestionDescription(suggestion),
                },
              )
            : suggestionDescription(suggestion),
          capability,
          toolName: trustPattern
            ? "workflow.promoteTrustedPattern"
            : "workflow.previewSuggestion",
          workspaceId: suggestion.workspaceId || workspace?.id,
          destination: suggestion.sourceEntity,
          sourceEvidence: [suggestion.description],
          proposedMutation: trustPattern
            ? t(
                "everyday.preview.trustedPatternMutation",
                "Create scoped trusted schema after approval",
              )
            : suggestionDescription(suggestion),
        }),
    );
    if (created) setPreview(created);
  };

  const previewRecipe = async (recipe: EverydayAgentRecipe) => {
    if (!enabledCapabilities.includes(recipe.capability)) {
      onOpenSettings?.();
      return;
    }
    const recipeTitle = t(`everyday.recipe.${recipe.id}.title`, recipe.title);
    const recipeDescription = t(
      `everyday.recipe.${recipe.id}.description`,
      recipe.description,
    );
    const recipePrompt = t(
      `everyday.recipe.${recipe.id}.prompt`,
      recipe.prompt,
    );
    const created = await run(
      t("everyday.busy.previewRecipe", "Preview recipe"),
      () =>
        window.electronAPI.everydayAgentPreviewAction({
          title: recipeTitle,
          action: recipePrompt,
          capability: recipe.capability,
          toolName: "everyday.recipe.preview",
          workspaceId: workspace?.id,
          sourceEvidence: recipe.surfaces.map(surfaceLabel),
          proposedMutation: temporaryModes.readOnly
            ? t(
                "everyday.preview.readOnlyRecipe",
                "Run recipe settings in read-only mode: {description}",
                {
                  description: recipeDescription,
                },
              )
            : recipePrompt,
          metadata: {
            recipeId: recipe.id,
            temporaryModes,
          },
        }),
    );
    if (created) setPreview(created);
  };

  const approvePreview = async () => {
    if (!preview) return;
    const receipt = await run(
      t("everyday.busy.approvePreview", "Approve preview"),
      () =>
        window.electronAPI.everydayAgentApproveAction({
          previewId: preview.id,
        }),
    );
    if (receipt) setPreview(null);
  };

  const startSuggestion = async (suggestion: ProactiveSuggestion) => {
    const prompt = (suggestion.actionPrompt || suggestion.description).trim();
    if (!prompt || !onOpenComposerDraft) return;
    await Promise.resolve(onOpenComposerDraft(prompt, workspace));
  };

  const handleDailyFocusAction = (item: (typeof dailyFocusItems)[number]) => {
    if (item.actionKind === "settings") {
      if (onOpenSettings) return onOpenSettings();
      if (status === "disabled") return void acceptConsent(true);
      return onOpenMissionControl?.();
    }
    if (item.actionKind === "resume") return void resume();
    if (item.actionKind === "suggestion" && item.suggestion)
      return void startSuggestion(item.suggestion);
    if (item.actionKind === "activity") {
      setShowDailyActivity(true);
      return;
    }
    if (item.actionKind === "task") {
      return onOpenComposerDraft?.(
        translate(
          "generated.components.everydayagentpanel.1205.37",
          "Organize the unfinished tasks in the current workspace, sort them into three types of output: the most important today, those that can be delegated, and those that need to be confirmed, and give the next step for each item.",
        ),
        workspace,
      );
    }
    return onOpenMissionControl?.();
  };

  const consentModal = consentRequired && !settingsMode && (
    <div className="ea-consent-backdrop">
      <div className="ea-consent-modal">
        <div className="ea-consent-mark">
          <Sparkles size={30} />
        </div>
        <h2>{t("everyday.consent.title", "Enable daily assistant")}</h2>
        <p>
          {t(
            "everyday.consent.description",
            "Allows NeoWorker to make recommendations and perform actions on approved routines, with all browser executions, memories, connector scopes, and receipts visible and auditable.",
          )}
        </p>
        <div className="ea-consent-list">
          <div>
            <ShieldCheck size={18} />
            <span>
              {t(
                "everyday.consent.localFirst",
                "Data remains local-first unless explicitly approved by the connected application.",
              )}
            </span>
          </div>
          <div>
            <Eye size={18} />
            <span>
              {t(
                "everyday.consent.browser",
                "Browser work preferentially uses the visible browser workbench; the real browser add-on is turned off by default.",
              )}
            </span>
          </div>
          <div>
            <KeyRound size={18} />
            <span>
              {t(
                "everyday.consent.approval",
                "Send, publish, export, destructive operations, consume, credential and cross-workspace moves always ask first.",
              )}
            </span>
          </div>
          <div>
            <ReceiptText size={18} />
            <span>
              {t(
                "everyday.consent.receipts",
                "Each preview, block, approval, skip, and execution writes a receipt that can be checked or deleted.",
              )}
            </span>
          </div>
        </div>
        <div className="ea-consent-actions">
          <button
            type="button"
            className="ea-secondary-button"
            onClick={() => void acceptConsent(false)}
            disabled={Boolean(busy)}
          >
            {t("common.noThanks", "No need")}
          </button>
          <button
            type="button"
            className="ea-primary-button"
            onClick={() => void acceptConsent(true)}
            disabled={Boolean(busy) || adminBlocked}
          >
            {t("everyday.action.enable", "Enable daily assistant")}
          </button>
        </div>
      </div>
    </div>
  );

  if (loading && !result) {
    return (
      <main className="main-content everyday-agent-main">
        <div className="everyday-agent-panel">
          <div className="everyday-agent-loading">
            {t("everyday.loading", "Loading daily agents...")}
          </div>
        </div>
      </main>
    );
  }

  if (settingsMode) {
    return (
      <main className="main-content everyday-agent-main settings-mode">
        <div className="everyday-agent-panel ea-policy-workspace">
          <header className="ea-policy-header">
            <div>
              <div className="ea-kicker">
                <Sparkles size={16} />
                {t("everyday.title", "Everyday agents")}
              </div>
              <h1>{t("everyday.settings.title", "Daily agent settings")}</h1>
              <p>
                {t(
                  "everyday.settings.description",
                  "Configure capability packages, limited scopes, and strategies to allow the agent to complete daily tasks safely under your control.",
                )}
              </p>
            </div>
            <div className="ea-policy-header-actions">
              <button
                type="button"
                className="ea-icon-button"
                onClick={() => void load()}
                title={t("common.refresh", "Refresh")}
                disabled={Boolean(busy)}
              >
                <RefreshCw size={16} />
              </button>
              {canResume ? (
                <button
                  type="button"
                  className="ea-primary-button"
                  onClick={() => void resume()}
                  disabled={Boolean(busy)}
                >
                  <Play size={16} />
                  {t("everyday.action.resume", "resume operation")}
                </button>
              ) : (
                <button
                  type="button"
                  className="ea-secondary-button"
                  onClick={() =>
                    void pause({
                      kind: "global",
                      reason: t(
                        "everyday.pause.reason.settings",
                        "Pause from daily agent settings",
                      ),
                    })
                  }
                  disabled={Boolean(busy) || !result?.profile.enabled}
                >
                  <PauseCircle size={16} />
                  {t("everyday.action.pauseAll", "Pause the agent")}
                </button>
              )}
            </div>
          </header>

          {error && (
            <div className="ea-alert danger">
              <ShieldAlert size={16} />
              {error}
            </div>
          )}
          {adminBlocked && (
            <div className="ea-alert danger">
              <Ban size={16} />
              {t(
                "everyday.blockedByPolicy",
                "Everyday agents have been blocked by organizational policies.",
              )}
            </div>
          )}

          <div className="ea-policy-layout">
            <aside className="ea-policy-rail">
              <section className="ea-policy-status-card">
                <span className={`ea-policy-presence ${status}`} />
                <div>
                  <span className="ea-policy-label">
                    {translate(
                      "generated.components.everydayagentpanel.1369.38",
                      "Agent state",
                    )}
                  </span>
                  <strong>{statusLabel(result)}</strong>
                  <p>
                    {status === "enabled"
                      ? translate(
                          "generated.components.everydayagentpanel.1372.39",
                          "Core capabilities are operating according to strategy",
                        )
                      : translate(
                          "generated.components.everydayagentpanel.1372.40",
                          "After resuming operation, it will be executed according to the current policy.",
                        )}
                  </p>
                </div>
                <div className="ea-policy-rail-actions">
                  <button
                    type="button"
                    className="ea-secondary-button"
                    onClick={() =>
                      void pause({
                        kind: "global",
                        reason: t(
                          "everyday.pause.reason.settings",
                          "Pause from daily agent settings",
                        ),
                      })
                    }
                    disabled={Boolean(busy) || !result?.profile.enabled}
                  >
                    <PauseCircle size={15} />
                    {translate(
                      "generated.components.everydayagentpanel.1388.41",
                      "pause",
                    )}
                  </button>
                  <button
                    type="button"
                    className="ea-secondary-button"
                    onClick={() => void resume()}
                    disabled={Boolean(busy) || !canResume}
                  >
                    <RotateCcw size={15} />
                    {translate(
                      "generated.components.everydayagentpanel.1397.42",
                      "restore",
                    )}
                  </button>
                </div>
              </section>
              <section className="ea-policy-activity">
                <div className="ea-policy-section-title">
                  <h2>
                    {translate(
                      "generated.components.everydayagentpanel.1403.43",
                      "activity record",
                    )}
                  </h2>
                  <span>
                    {receipts.length}{" "}
                    {translate(
                      "generated.components.everydayagentpanel.1404.44",
                      "Article",
                    )}
                  </span>
                </div>
                {recentReceipts.length === 0 ? (
                  <div className="ea-policy-empty">
                    {translate(
                      "generated.components.everydayagentpanel.1407.45",
                      "There is no auditable agent activity yet.",
                    )}
                  </div>
                ) : (
                  recentReceipts.slice(0, 5).map((receipt) => (
                    <article
                      className="ea-policy-activity-item"
                      key={receipt.id}
                    >
                      <span className={`ea-activity-dot ${receipt.status}`} />
                      <div>
                        <time>{formatTime(receipt.createdAt)}</time>
                        <strong>{receipt.title}</strong>
                        <p>{receipt.summary}</p>
                        <span>{capabilityLabel(receipt.capability)}</span>
                      </div>
                    </article>
                  ))
                )}
              </section>
            </aside>

            <div className="ea-policy-content">
              <section className="ea-policy-editor">
                <div className="ea-policy-editor-copy">
                  <div className="ea-policy-section-title">
                    <h2>
                      {translate(
                        "generated.components.everydayagentpanel.1428.46",
                        "Current running strategy",
                      )}
                    </h2>
                    <span className="ea-policy-published">
                      {translate(
                        "generated.components.everydayagentpanel.1429.47",
                        "Already effective",
                      )}
                    </span>
                  </div>
                  <p>
                    {translate(
                      "generated.components.everydayagentpanel.1432.48",
                      "Prioritize clear, reversible and authorized work; seek your confirmation first for operations that may affect external systems or are irreversible. After completion, auditable results and evidence will be retained.",
                    )}
                  </p>
                </div>
                <div className="ea-policy-controls">
                  <label>
                    <span>
                      {translate(
                        "generated.components.everydayagentpanel.1437.49",
                        "operating mode",
                      )}
                    </span>
                    <select defaultValue="balanced">
                      <option value="balanced">
                        {translate(
                          "generated.components.everydayagentpanel.1439.50",
                          "Balanced (recommended)",
                        )}
                      </option>
                      <option value="careful">
                        {translate(
                          "generated.components.everydayagentpanel.1440.51",
                          "Caution first",
                        )}
                      </option>
                      <option value="efficient">
                        {translate(
                          "generated.components.everydayagentpanel.1441.52",
                          "Efficiency first",
                        )}
                      </option>
                    </select>
                    <small>
                      {translate(
                        "generated.components.everydayagentpanel.1443.53",
                        "Strike a balance between efficiency and validation",
                      )}
                    </small>
                  </label>
                  <label>
                    <span>
                      {translate(
                        "generated.components.everydayagentpanel.1446.54",
                        "Confirm strategy",
                      )}
                    </span>
                    <select defaultValue="sensitive">
                      <option value="sensitive">
                        {translate(
                          "generated.components.everydayagentpanel.1448.55",
                          "Ask when it may affect",
                        )}
                      </option>
                      <option value="always">
                        {translate(
                          "generated.components.everydayagentpanel.1449.56",
                          "Ask before each operation",
                        )}
                      </option>
                      <option value="trusted">
                        {translate(
                          "generated.components.everydayagentpanel.1450.57",
                          "Ask only for sensitive operations",
                        )}
                      </option>
                    </select>
                    <small>
                      {translate(
                        "generated.components.everydayagentpanel.1452.58",
                        "You can ask for confirmation at any time before operating",
                      )}
                    </small>
                  </label>
                  <label>
                    <span>
                      {translate(
                        "generated.components.everydayagentpanel.1455.59",
                        "Effective scope",
                      )}
                    </span>
                    <select defaultValue="workspace">
                      <option value="workspace">
                        {translate(
                          "generated.components.everydayagentpanel.1457.60",
                          "personal workspace",
                        )}
                      </option>
                      <option value="project">
                        {translate(
                          "generated.components.everydayagentpanel.1458.61",
                          "Current project",
                        )}
                      </option>
                    </select>
                    <small>
                      {translate(
                        "generated.components.everydayagentpanel.1460.62",
                        "Only effective in authorized space",
                      )}
                    </small>
                  </label>
                </div>
                <div className="ea-policy-toggles">
                  <label>
                    <input
                      type="checkbox"
                      checked={temporaryModes.readOnly}
                      onChange={(event) =>
                        updateTemporaryMode(
                          "readOnly",
                          event.currentTarget.checked,
                        )
                      }
                    />
                    <span>
                      <strong>
                        {translate(
                          "generated.components.everydayagentpanel.1473.63",
                          "Read only until approved",
                        )}
                      </strong>
                      <small>
                        {translate(
                          "generated.components.everydayagentpanel.1474.64",
                          "Generate preview first, do not write directly to external system",
                        )}
                      </small>
                    </span>
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={temporaryModes.noMemory}
                      onChange={(event) =>
                        updateTemporaryMode(
                          "noMemory",
                          event.currentTarget.checked,
                        )
                      }
                    />
                    <span>
                      <strong>
                        {translate(
                          "generated.components.everydayagentpanel.1486.65",
                          "Sensitive tasks are not written to memory",
                        )}
                      </strong>
                      <small>
                        {translate(
                          "generated.components.everydayagentpanel.1487.66",
                          "Do not generate visible memory candidates",
                        )}
                      </small>
                    </span>
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={temporaryModes.disposableBrowser}
                      onChange={(event) =>
                        updateTemporaryMode(
                          "disposableBrowser",
                          event.currentTarget.checked,
                        )
                      }
                    />
                    <span>
                      <strong>
                        {translate(
                          "generated.components.everydayagentpanel.1499.67",
                          "disposable browser",
                        )}
                      </strong>
                      <small>
                        {translate(
                          "generated.components.everydayagentpanel.1500.68",
                          "Online tasks use temporary browser configuration",
                        )}
                      </small>
                    </span>
                  </label>
                </div>
                <aside className="ea-policy-overview">
                  <h3>
                    {translate(
                      "generated.components.everydayagentpanel.1505.69",
                      "Strategy overview",
                    )}
                  </h3>
                  <div>
                    <Sparkles size={16} />
                    <span>
                      {translate(
                        "generated.components.everydayagentpanel.1509.70",
                        "Automatic execution",
                      )}
                      <strong>
                        {enabledCapabilities.length}{" "}
                        {translate(
                          "generated.components.everydayagentpanel.1509.71",
                          "capability is enabled",
                        )}
                      </strong>
                    </span>
                  </div>
                  <div>
                    <Clock size={16} />
                    <span>
                      {translate(
                        "generated.components.everydayagentpanel.1515.72",
                        "Need confirmation",
                      )}
                      <strong>
                        {temporaryModes.readOnly
                          ? translate(
                              "generated.components.everydayagentpanel.1517.73",
                              "All external writes",
                            )
                          : translate(
                              "generated.components.everydayagentpanel.1517.74",
                              "When it may affect external systems",
                            )}
                      </strong>
                    </span>
                  </div>
                  <div>
                    <ShieldCheck size={16} />
                    <span>
                      {translate(
                        "generated.components.everydayagentpanel.1524.75",
                        "restricted range",
                      )}
                      <strong>
                        {connectedApps.length
                          ? translate(
                              "everydayAgent.authorizedConnectorCount",
                              "{count} authorized connectors",
                              { count: connectedApps.length },
                            )
                          : translate(
                              "generated.components.everydayagentpanel.1528.76",
                              "personal workspace",
                            )}
                      </strong>
                    </span>
                  </div>
                </aside>
              </section>

              <section className="ea-capability-map-section">
                <div className="ea-section-header">
                  <div>
                    <h2>
                      {translate(
                        "generated.components.everydayagentpanel.1538.77",
                        "Capability map",
                      )}
                    </h2>
                    <p>
                      {translate(
                        "generated.components.everydayagentpanel.1539.78",
                        "Use clear boundaries to manage what your agent can read, create, and execute.",
                      )}
                    </p>
                  </div>
                  <span className="ea-map-count">
                    {enabledCapabilities.length} /{" "}
                    {EVERYDAY_AGENT_CAPABILITY_BUNDLES.length}{" "}
                    {translate(
                      "generated.components.everydayagentpanel.1542.79",
                      "Enabled",
                    )}
                  </span>
                </div>
                <div className="ea-capability-map">
                  {CAPABILITY_MAP_GROUPS.map((group) => (
                    <section
                      className="ea-capability-map-column"
                      key={group.id}
                    >
                      <header>
                        <h3>{group.title}</h3>
                        <p>{group.description}</p>
                      </header>
                      {group.bundles.map((capability) => {
                        const bundle = EVERYDAY_AGENT_CAPABILITY_BUNDLES.find(
                          (item) => item.id === capability,
                        );
                        if (!bundle) return null;
                        const setting =
                          result?.profile.capabilitySettings[capability];
                        const blocked =
                          result?.compiledPolicy.adminPolicy.blockedBundles.includes(
                            capability,
                          );
                        const revoked =
                          result?.profile.revokedCapabilities.includes(
                            capability,
                          );
                        return (
                          <div
                            className={`ea-map-row ${blocked || revoked ? "is-blocked" : ""}`}
                            key={capability}
                          >
                            <span className="ea-map-icon">
                              <CapabilityMapIcon capability={capability} />
                            </span>
                            <div>
                              <strong>{capabilityLabel(capability)}</strong>
                              <small>
                                {capabilityDescription(
                                  capability,
                                  bundle.description,
                                )}
                              </small>
                              <span className="ea-map-scope">
                                {bundle.surfaces
                                  .slice(0, 2)
                                  .map(surfaceLabel)
                                  .join(" · ")}
                              </span>
                            </div>
                            <label className="ea-switch">
                              <input
                                type="checkbox"
                                checked={Boolean(setting?.enabled)}
                                disabled={Boolean(
                                  blocked || revoked || busy || adminBlocked,
                                )}
                                onChange={(event) =>
                                  void updateCapability(
                                    capability,
                                    event.currentTarget.checked,
                                  )
                                }
                              />
                              <span />
                            </label>
                          </div>
                        );
                      })}
                    </section>
                  ))}
                </div>
              </section>

              <section className="ea-audit-section">
                <div className="ea-section-header">
                  <div>
                    <h2>
                      {translate(
                        "generated.components.everydayagentpanel.1598.80",
                        "Audit log",
                      )}
                    </h2>
                    <p>
                      {translate(
                        "generated.components.everydayagentpanel.1599.81",
                        "Every review, suggestion and execution leaves an auditable record.",
                      )}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="ea-secondary-button danger"
                    onClick={() => void clearActivity()}
                    disabled={Boolean(busy)}
                  >
                    <Trash2 size={15} />
                    {translate(
                      "generated.components.everydayagentpanel.1608.82",
                      "Clear activity",
                    )}
                  </button>
                </div>
                <div className="ea-audit-table" role="table">
                  <div className="ea-audit-head" role="row">
                    <span>
                      {translate(
                        "generated.components.everydayagentpanel.1613.83",
                        "time",
                      )}
                    </span>
                    <span>
                      {translate(
                        "generated.components.everydayagentpanel.1614.84",
                        "Operation",
                      )}
                    </span>
                    <span>
                      {translate(
                        "generated.components.everydayagentpanel.1615.85",
                        "Source",
                      )}
                    </span>
                    <span>
                      {translate(
                        "generated.components.everydayagentpanel.1616.86",
                        "result",
                      )}
                    </span>
                    <span>
                      {translate(
                        "generated.components.everydayagentpanel.1617.87",
                        "Status",
                      )}
                    </span>
                  </div>
                  {recentReceipts.length === 0 ? (
                    <div className="ea-policy-empty">
                      {translate(
                        "generated.components.everydayagentpanel.1621.88",
                        "There is no audit record yet. After the agent is run, the process and results will be displayed here.",
                      )}
                    </div>
                  ) : (
                    recentReceipts.map((receipt) => (
                      <div className="ea-audit-row" role="row" key={receipt.id}>
                        <time>{formatTime(receipt.createdAt)}</time>
                        <strong>{receipt.title}</strong>
                        <span>{capabilityLabel(receipt.capability)}</span>
                        <span>{receipt.summary}</span>
                        <span className={`ea-audit-status ${receipt.status}`}>
                          <CheckCircle2 size={14} />
                          {receipt.status}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </section>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="main-content everyday-agent-main">
      <div className="everyday-agent-panel ea-console">
        <NeoWorkerPageHeader
          className="ea-console-header"
          title={t("everyday.proactive.title", "daily assistant")}
          description={t(
            "everyday.proactive.description",
            "It organizes today's important items, makes suggestions, and requests confirmation. The created job will start executing and enter the task list.",
          )}
          icon={<Sparkles size={18} strokeWidth={2} />}
          actions={
            <div className="ea-console-actions">
              <span className={`ea-status ${status}`}>
                {statusLabel(result)}
              </span>
              {canResume ? (
                <button
                  type="button"
                  className="ea-secondary-button"
                  onClick={() => void resume()}
                  disabled={Boolean(busy)}
                >
                  <RotateCcw size={16} />
                  {t("everyday.action.resume", "restore")}
                </button>
              ) : (
                <button
                  type="button"
                  className="ea-secondary-button"
                  onClick={() =>
                    void pause({
                      kind: "global",
                      reason: t(
                        "everyday.pause.reason.console",
                        "Pause from daily agent console",
                      ),
                    })
                  }
                  disabled={
                    Boolean(busy) || !result?.profile.enabled || adminBlocked
                  }
                >
                  <PauseCircle size={16} />
                  {t("everyday.action.pauseAll", "Pause all")}
                </button>
              )}
              <button
                type="button"
                className="ea-icon-button"
                onClick={() => void load()}
                title={t("common.refresh", "Refresh")}
                disabled={Boolean(busy)}
              >
                <RefreshCw size={16} />
              </button>
              {onOpenSettings && (
                <button
                  type="button"
                  className="ea-secondary-button"
                  onClick={onOpenSettings}
                >
                  <SettingsIcon size={16} />
                  {t("common.settings", "settings")}
                </button>
              )}
            </div>
          }
        />

        {error && (
          <div className="ea-alert danger">
            <ShieldAlert size={16} />
            {error}
          </div>
        )}

        {adminBlocked && (
          <div className="ea-alert danger">
            <Ban size={16} />
            {t(
              "everyday.blockedByPolicy",
              "Everyday agents have been blocked by organizational policies.",
            )}
          </div>
        )}

        {consentModal}

        {showDailyActivity && (
          <section
            className="ea-activity-view"
            aria-label={t("everyday.activity.title", "Run records")}
          >
            <header className="ea-activity-header">
              <button
                type="button"
                className="ea-activity-back"
                onClick={() => setShowDailyActivity(false)}
              >
                <ArrowLeft size={16} aria-hidden="true" />
                {t("everyday.activity.back", "Back to today's overview")}
              </button>
              <div>
                <span>{t("everyday.proactive.title", "Daily assistant")}</span>
                <h2>{t("everyday.activity.title", "Run records")}</h2>
                <p>
                  {t(
                    "everyday.activity.description",
                    "Review routine runs, confirmations, and receipts from the daily assistant without mixing them with automation tasks.",
                  )}
                </p>
              </div>
              <button
                type="button"
                className="ea-activity-refresh"
                onClick={() => void load()}
                disabled={Boolean(busy)}
              >
                <RefreshCw size={16} aria-hidden="true" />
                {t("common.refresh", "刷新")}
              </button>
            </header>

            <div
              className="ea-activity-stats"
              aria-label={t("everyday.activity.summary", "Run record summary")}
            >
              <div>
                <strong>{routines.length}</strong>
                <span>{t("everyday.activity.routines", "Routine runs")}</span>
              </div>
              <div>
                <strong>{recentReceipts.length}</strong>
                <span>{t("everyday.activity.receipts", "Daily receipts")}</span>
              </div>
            </div>

            {routines.length === 0 && recentReceipts.length === 0 ? (
              <div className="ea-activity-empty">
                <FileClock size={30} aria-hidden="true" />
                <strong>{t("everyday.activity.empty", "No run records yet")}</strong>
                <span>
                  {t(
                    "everyday.activity.emptyDescription",
                    "Records will appear here after the daily assistant completes work.",
                  )}
                </span>
              </div>
            ) : (
              <div className="ea-activity-list">
                {routines.map((routine) => (
                  <article className="ea-activity-row" key={`routine:${routine.id}`}>
                    <span className={`ea-activity-icon ${routine.tone}`}>
                      <RotateCcw size={17} aria-hidden="true" />
                    </span>
                    <div>
                      <small>{t("everyday.activity.routine", "Routine run")}</small>
                      <strong>{routine.name}</strong>
                      <p>{routine.detail}</p>
                    </div>
                    <div className="ea-activity-meta">
                      <span className={`is-${routine.tone}`}>{routine.status}</span>
                      {routine.lastRunAt && <time>{formatTime(routine.lastRunAt)}</time>}
                    </div>
                  </article>
                ))}
                {recentReceipts.map((receipt) => (
                  <article className="ea-activity-row" key={`receipt:${receipt.id}`}>
                    <span className={`ea-activity-icon is-${receipt.status}`}>
                      <CheckCircle2 size={17} aria-hidden="true" />
                    </span>
                    <div>
                      <small>{t("everyday.activity.receipt", "Daily receipt")}</small>
                      <strong>{receipt.title}</strong>
                      <p>{receipt.summary}</p>
                    </div>
                    <div className="ea-activity-meta">
                      <span className={`is-${receipt.status}`}>{receipt.status}</span>
                      <time>{formatTime(receipt.createdAt)}</time>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        <section
          className={`ea-daily-desk ${showDailyActivity ? "is-hidden" : ""}`}
          aria-label={translate(
            "generated.components.everydayagentpanel.1721.89",
            "Today's work desktop",
          )}
        >
          <div className="ea-daily-intro">
            <div>
              <span className="ea-daily-greeting">
                {status === "enabled"
                  ? translate(
                      "generated.components.everydayagentpanel.1726.90",
                      "Now, focus on pushing forward.",
                    )
                  : translate(
                      "generated.components.everydayagentpanel.1726.91",
                      "First finish where you started today.",
                    )}
              </span>
              <span className="ea-daily-date">
                {new Date().toLocaleDateString(
                  language === "zh-CN" ? "zh-CN" : "en-US",
                  {
                    month: "long",
                    day: "numeric",
                    weekday: "long",
                  },
                )}
              </span>
            </div>
            <p>
              {status === "enabled"
                ? translate(
                    "generated.components.everydayagentpanel.1739.92",
                    "The Assistant has narrowed down today's context to the matters most worthy of moving forward.",
                  )
                : translate(
                    "generated.components.everydayagentpanel.1740.93",
                    "Once enabled, the daily assistant will organize work based on the authorized scope, suggest next steps, and retain receipts.",
                  )}
            </p>
          </div>
          <div className="ea-daily-layout">
            <section className="ea-focus-column">
              <header className="ea-focus-header">
                <div>
                  <h2>
                    {translate(
                      "generated.components.everydayagentpanel.1749.95",
                      "Today, let’s advance these three things first",
                    )}
                  </h2>
                  <p>
                    {translate(
                      "generated.components.everydayagentpanel.1750.96",
                      "Work is not more lists, but clear next steps.",
                    )}
                  </p>
                </div>
                <figure className="ea-focus-hero" aria-hidden="true">
                  <img
                    src={DAILY_ASSISTANT_HERO_ARTWORK}
                    alt=""
                    decoding="async"
                  />
                </figure>
              </header>
              <div className="ea-focus-list">
                {dailyFocusItems.map((item) => (
                  <article className="ea-focus-row" key={item.id}>
                    <figure className="ea-focus-art" aria-hidden="true">
                      <img
                        src={DAILY_FOCUS_ARTWORK[item.id]}
                        alt=""
                        loading="lazy"
                        decoding="async"
                      />
                    </figure>
                    <div className="ea-focus-copy">
                      <span>{item.label}</span>
                      <h3>{item.title}</h3>
                      <p>{item.detail}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDailyFocusAction(item)}
                    >
                      {item.action}
                      <ArrowRight size={15} aria-hidden="true" />
                    </button>
                  </article>
                ))}
              </div>
              {(onCreateTask || onOpenComposerDraft || onStartNewWork) && (
                <button
                  type="button"
                  className="ea-new-work"
                  aria-expanded={showInlineComposer}
                  onClick={() => {
                    if (onCreateTask || onOpenComposerDraft)
                      setShowInlineComposer(true);
                    else onStartNewWork?.();
                  }}
                >
                  <span aria-hidden="true">+</span>
                  {translate(
                    "generated.components.everydayagentpanel.1789.97",
                    "Create work",
                  )}
                </button>
              )}
              {showInlineComposer && (
                <UnifiedTaskComposer
                  cacheKey={`everyday:${workspace?.id || "no-workspace"}`}
                  workspace={workspace || null}
                  label={translate(
                    "generated.components.everydayagentpanel.1796.98",
                    "Create a new job",
                  )}
                  placeholder={translate(
                    "generated.components.everydayagentpanel.1797.99",
                    "Describe the work to be done today...",
                  )}
                  autoFocus
                  onSubmit={async (prompt) => {
                    if (!onCreateTask) {
                      if (!onOpenComposerDraft) return false;
                      await Promise.resolve(
                        onOpenComposerDraft(prompt, workspace),
                      );
                      return true;
                    }
                    const summary = prompt.replace(/\s+/g, " ").trim();
                    const title =
                      summary.length > 26
                        ? `${summary.slice(0, 26)}…`
                        : summary;
                    return Promise.resolve(
                      onCreateTask(
                        translate(
                          "everydayAgent.taskTitle",
                          "Daily assistant: {title}",
                          { title },
                        ),
                        prompt,
                      ),
                    );
                  }}
                />
              )}
            </section>
            <aside className="ea-daily-rail">
              {approvalItem && (
                <section className="ea-approval-note">
                  <header>
                    <h2>
                      {translate(
                        "generated.components.everydayagentpanel.1816.100",
                        "Awaiting my approval",
                      )}
                    </h2>
                    <span>{pendingApprovals.length}</span>
                  </header>
                  <figure className="ea-approval-art" aria-hidden="true">
                    <img
                      src={DAILY_APPROVAL_ARTWORK}
                      alt=""
                      loading="lazy"
                      decoding="async"
                    />
                  </figure>
                  <>
                    <small className="ea-approval-kind">
                      {getApprovalTypeLabel(approvalItem.type)}
                    </small>
                    <h3>
                      {approvalTask?.title ||
                        translate(
                          "generated.components.everydayagentpanel.1823.101",
                          "The task requires your confirmation",
                        )}
                    </h3>
                    <p>
                      {approvalItem.description ||
                        translate(
                          "generated.components.everydayagentpanel.1824.102",
                          "This task requires confirmation before proceeding.",
                        )}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        if (onOpenApproval) onOpenApproval(approvalItem);
                        else onOpenMissionControl?.();
                      }}
                    >
                      {translate(
                        "generated.components.everydayagentpanel.1832.103",
                        "View and approve",
                      )}
                      <span>→</span>
                    </button>
                    {pendingApprovals.length > 1 && (
                      <small className="ea-approval-more">
                        {translate(
                          "generated.components.everydayagentpanel.1836.104",
                          "Also",
                        )}
                        {pendingApprovals.length - 1}{" "}
                        {translate(
                          "generated.components.everydayagentpanel.1836.105",
                          "Item awaits confirmation",
                        )}
                      </small>
                    )}
                  </>
                </section>
              )}
              <section className="ea-run-log">
                <header>
                  <h2>
                    {translate(
                      "generated.components.everydayagentpanel.1846.106",
                      "Run log",
                    )}
                  </h2>
                  <button
                    type="button"
                    onClick={() => setShowDailyActivity(true)}
                  >
                    {translate(
                      "generated.components.everydayagentpanel.1849.107",
                      "View all",
                    )}
                  </button>
                </header>
                {recentReceipts.length ? (
                  recentReceipts.slice(0, 4).map((receipt) => (
                    <div className="ea-log-row" key={receipt.id}>
                      <time>{formatTime(receipt.createdAt)}</time>
                      <p>
                        {receipt.title}
                        <small>{receipt.summary}</small>
                      </p>
                    </div>
                  ))
                ) : (
                  <div className="ea-log-row is-empty">
                    <time>
                      {translate(
                        "generated.components.everydayagentpanel.1864.108",
                        "Now",
                      )}
                    </time>
                    <p>
                      {translate(
                        "generated.components.everydayagentpanel.1866.109",
                        "Waiting for the first work record",
                      )}
                      <small>
                        {translate(
                          "generated.components.everydayagentpanel.1867.110",
                          "Every suggestion, confirmation and implementation will leave a verifiable record here.",
                        )}
                      </small>
                    </p>
                  </div>
                )}
              </section>
            </aside>
          </div>
          <section className="ea-completed-ledger">
            <header>
              <h2>
                {translate(
                  "generated.components.everydayagentpanel.1878.111",
                  "Completed",
                )}
              </h2>
              <span>
                {recentReceipts.length}{" "}
                {translate(
                  "generated.components.everydayagentpanel.1880.112",
                  "recent records",
                )}
              </span>
              <button type="button" onClick={() => setShowDailyActivity(true)}>
                {translate(
                  "generated.components.everydayagentpanel.1882.113",
                  "View all",
                )}
              </button>
            </header>
            {recentReceipts.length ? (
              recentReceipts.slice(0, 3).map((receipt) => (
                <div className="ea-completed-row" key={receipt.id}>
                  <CheckCircle2 size={16} />
                  <span>{receipt.title}</span>
                  <time>{formatTime(receipt.createdAt)}</time>
                </div>
              ))
            ) : (
              <div className="ea-completed-row">
                <CheckCircle2 size={16} />
                <span>
                  {translate(
                    "generated.components.everydayagentpanel.1896.114",
                    "The completed work will quietly settle here.",
                  )}
                </span>
              </div>
            )}
          </section>
        </section>

        <div className="ea-console-grid">
          <div className="ea-console-main">
            <section className="ea-section ea-priority-section">
              <div className="ea-section-header">
                <div>
                  <h2>{t("everyday.priority.title", "priority queue")}</h2>
                  <p>
                    {t(
                      "everyday.priority.description",
                      "Approvals, blocked actions, and recoverable failures are displayed first.",
                    )}
                  </p>
                </div>
              </div>
              <div className="ea-priority-list">
                {priorityItems.map((item) => (
                  <article
                    className={`ea-priority-item ${item.tone}`}
                    key={item.id}
                  >
                    <div className="ea-priority-icon">
                      {item.tone === "danger" ? (
                        <AlertTriangle size={17} />
                      ) : item.tone === "warn" ? (
                        <ShieldAlert size={17} />
                      ) : item.tone === "success" ? (
                        <CheckCircle2 size={17} />
                      ) : (
                        <CircleDot size={17} />
                      )}
                    </div>
                    <div>
                      <div className="ea-priority-title">
                        <strong>{item.title}</strong>
                        {item.meta && <span>{item.meta}</span>}
                      </div>
                      <p>{item.detail}</p>
                    </div>
                    {item.actionKind === "resume" && (
                      <button
                        type="button"
                        className="ea-secondary-button"
                        onClick={() => void resume()}
                        disabled={Boolean(busy) || !canResume}
                      >
                        {t("everyday.action.resume", "restore")}
                      </button>
                    )}
                    {(item.actionKind === "settings" ||
                      item.actionKind === "memory") &&
                      onOpenSettings && (
                        <button
                          type="button"
                          className="ea-secondary-button"
                          onClick={onOpenSettings}
                        >
                          {t("common.settings", "settings")}
                        </button>
                      )}
                    {item.actionKind === "receipt" && onOpenMissionControl && (
                      <button
                        type="button"
                        className="ea-secondary-button"
                        onClick={onOpenMissionControl}
                      >
                        {t("everyday.action.missionControl", "task console")}
                      </button>
                    )}
                  </article>
                ))}
              </div>
            </section>

            {preview && (
              <section className="ea-section">
                <div className="ea-section-header">
                  <div>
                    <h2>{t("everyday.preview.title", "action preview")}</h2>
                    <p>
                      {t(
                        "everyday.preview.description",
                        "Review provenance, targets, changes, risks, rollbacks, and idempotence.",
                      )}
                    </p>
                  </div>
                </div>
                <div className="ea-preview-card">
                  <div className="ea-card-topline">
                    <div>
                      <h3>{preview.title}</h3>
                      <p>{preview.proposedMutation}</p>
                    </div>
                    <span className={`ea-risk ${riskTone(preview.riskClass)}`}>
                      {riskLabel(preview.riskClass)}
                    </span>
                  </div>
                  <div className="ea-preview-details">
                    <span>
                      {t("everyday.preview.target", "target")}：
                      {previewTargetLabel(preview)}
                    </span>
                    <span>
                      {t("everyday.preview.approval", "Approval")}：
                      {preview.approvalRequired
                        ? t("common.required", "need")
                        : t("common.notRequired", "No need")}
                    </span>
                    <span>
                      {t("everyday.preview.rollback", "rollback")}：
                      {preview.rollbackAvailable
                        ? t("common.available", "Available")
                        : t("common.unavailable", "Not available")}
                    </span>
                    <span>
                      {t("everyday.preview.idempotency", "idempotent keys")}：
                      {preview.idempotencyKey}
                    </span>
                  </div>
                  <p className="ea-preview-reason">{preview.approvalReason}</p>
                  <button
                    type="button"
                    className="ea-primary-button"
                    onClick={() => void approvePreview()}
                    disabled={Boolean(busy || preview.status === "blocked")}
                  >
                    {t("everyday.action.approvePreview", "Approve preview")}
                  </button>
                </div>
              </section>
            )}

            <section className="ea-section">
              <div className="ea-section-header">
                <div>
                  <h2>{t("everyday.suggestions.title", "Suggestions")}</h2>
                  <p>
                    {t(
                      "everyday.suggestions.description",
                      "Accepted, Rejected, Remind Later, and Trusted modes all remain scoped.",
                    )}
                  </p>
                </div>
              </div>
              <div className="ea-list ea-suggestion-list">
                {activeSuggestions.length === 0 ? (
                  <div className="ea-empty">
                    {t("everyday.suggestions.empty", "No suggestions pending")}
                  </div>
                ) : (
                  activeSuggestions.map((suggestion) => (
                    <div className="ea-list-item" key={suggestion.id}>
                      <Sparkles size={16} />
                      <div>
                        <strong>{suggestion.title}</strong>
                        <span>{suggestion.description}</span>
                        <div className="ea-evidence-row">
                          <span>
                            {t("everyday.suggestions.whyNow", "current cause")}
                            ：
                            {suggestion.urgency || t("common.normal", "normal")}{" "}
                            {t("everyday.suggestions.urgency", "Urgency")}
                          </span>
                          <span>
                            {t("everyday.suggestions.confidence", "Confidence")}
                            ：{Math.round(suggestion.confidence * 100)}%
                          </span>
                          {suggestion.sourceEntity && (
                            <span>
                              {t("common.source", "Source")}：
                              {suggestion.sourceEntity}
                            </span>
                          )}
                          {suggestion.snoozedUntil && (
                            <span>
                              {t(
                                "everyday.suggestions.snoozedUntil",
                                "Remind later to {time}",
                                {
                                  time: formatTime(suggestion.snoozedUntil),
                                },
                              )}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="ea-row-actions">
                        <button
                          type="button"
                          onClick={() => void previewSuggestion(suggestion)}
                          disabled={Boolean(busy)}
                        >
                          {t("everyday.action.preview", "Preview")}
                        </button>
                        <button
                          type="button"
                          onClick={() => void startSuggestion(suggestion)}
                          disabled={Boolean(busy || !onOpenComposerDraft)}
                        >
                          {t("everyday.action.start", "start")}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            void previewSuggestion(suggestion, true)
                          }
                          disabled={Boolean(busy)}
                        >
                          {t("everyday.action.trustPattern", "trust model")}
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="ea-section">
              <div className="ea-section-header">
                <div>
                  <h2>{t("everyday.receipts.title", "latest receipt")}</h2>
                  <p>
                    {t(
                      "everyday.receipts.description",
                      "Executed, skipped, blocked, previewed, and approved work remains available for inspection.",
                    )}
                  </p>
                </div>
                {onOpenMissionControl && (
                  <button
                    type="button"
                    className="ea-secondary-button"
                    onClick={onOpenMissionControl}
                  >
                    <Play size={16} />
                    {t("everyday.action.missionControl", "task console")}
                  </button>
                )}
              </div>
              <div className="ea-receipts compact">
                {recentReceipts.length === 0 ? (
                  <div className="ea-empty">
                    {t("everyday.receipts.empty", "No reply yet")}
                  </div>
                ) : (
                  recentReceipts.map((receipt) => (
                    <article className="ea-receipt" key={receipt.id}>
                      <div className="ea-receipt-icon">
                        {receipt.status === "blocked" ||
                        receipt.status === "failed" ? (
                          <XCircle size={16} />
                        ) : receipt.status === "paused" ? (
                          <PauseCircle size={16} />
                        ) : (
                          <ReceiptText size={16} />
                        )}
                      </div>
                      <div>
                        <div className="ea-receipt-title">
                          <strong>{receipt.title}</strong>
                          <span
                            className={`ea-risk ${riskTone(receipt.riskClass)}`}
                          >
                            {riskLabel(receipt.riskClass)}
                          </span>
                        </div>
                        <p>{receipt.summary}</p>
                        <div className="ea-receipt-meta">
                          <span>{receipt.status}</span>
                          <span>{capabilityLabel(receipt.capability)}</span>
                          <span>
                            <Clock size={12} />
                            {formatTime(receipt.createdAt)}
                          </span>
                        </div>
                      </div>
                    </article>
                  ))
                )}
              </div>
            </section>

            <section className="ea-section">
              <div className="ea-section-header">
                <div>
                  <h2>{t("everyday.recovery.title", "Recoverable failure")}</h2>
                  <p>
                    {t(
                      "everyday.recovery.description",
                      "Authentication, policy, network, duplicate and partial failure status become explicit actions.",
                    )}
                  </p>
                </div>
              </div>
              <div className="ea-recovery-list">
                {recoveryItems.length === 0 ? (
                  <div className="ea-empty">
                    {t(
                      "everyday.recovery.empty",
                      "No recovery actions pending",
                    )}
                  </div>
                ) : (
                  recoveryItems.map((item) => (
                    <article
                      className={`ea-recovery-item ${item.tone}`}
                      key={item.id}
                    >
                      <div className="ea-recovery-icon">
                        {item.tone === "danger" ? (
                          <AlertTriangle size={16} />
                        ) : (
                          <RefreshCw size={16} />
                        )}
                      </div>
                      <div>
                        <strong>{item.title}</strong>
                        <span>{item.detail}</span>
                      </div>
                      <button
                        type="button"
                        className="ea-secondary-button"
                        onClick={() => {
                          if (
                            item.actionLabel.includes(
                              translate(
                                "generated.components.everydayagentpanel.2197.115",
                                "Strategy",
                              ),
                            ) ||
                            item.actionLabel.includes("policy")
                          ) {
                            onOpenSettings?.();
                          } else {
                            onOpenMissionControl?.();
                          }
                        }}
                        disabled={
                          Boolean(busy) ||
                          (!onOpenSettings && !onOpenMissionControl)
                        }
                      >
                        {item.actionLabel}
                      </button>
                    </article>
                  ))
                )}
              </div>
            </section>

            <section className="ea-section">
              <div className="ea-section-header">
                <div>
                  <h2>
                    {t("everyday.routines.title", "active routine tasks")}
                  </h2>
                  <p>
                    {t(
                      "everyday.routines.description",
                      "Trusted routine tasks, drills, pauses, and failures.",
                    )}
                  </p>
                </div>
              </div>
              <div className="ea-routine-list">
                {routines.length === 0 ? (
                  <div className="ea-empty">
                    {t(
                      "everyday.routines.empty",
                      "No trusted routine tasks yet",
                    )}
                  </div>
                ) : (
                  routines.map((routine) => (
                    <article
                      className={`ea-routine ${routine.tone}`}
                      key={routine.id}
                    >
                      <div>
                        <strong>{routine.name}</strong>
                        <span>{routine.detail}</span>
                      </div>
                      <div className="ea-routine-meta">
                        <span>{routine.status}</span>
                        {routine.lastRunAt && (
                          <span>{formatTime(routine.lastRunAt)}</span>
                        )}
                      </div>
                    </article>
                  ))
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}

export function EverydayAgentSettingsPanel({
  workspaceId,
  onCreateTask,
}: {
  workspaceId?: string;
  onCreateTask?: (
    title: string,
    prompt: string,
  ) => boolean | void | Promise<boolean | void>;
}) {
  return (
    <EverydayAgentPanel
      settingsMode
      workspace={workspaceId ? ({ id: workspaceId } as Workspace) : null}
      onCreateTask={onCreateTask}
    />
  );
}
