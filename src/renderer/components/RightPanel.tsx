import {
  memo,
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
  useDeferredValue,
  type ComponentType,
} from "react";
import {
  Task,
  Workspace,
  TaskEvent,
  PlanStep,
  QueueStatus,
  SessionChecklistItem,
  SessionChecklistState,
} from "../../shared/types";
import { isVerificationStepDescription } from "../../shared/plan-utils";
import { deriveTaskAttentionState } from "../../shared/task-attention";
import { DocumentAwareFileModal } from "./DocumentAwareFileModal";
import { useAgentContext } from "../hooks/useAgentContext";
import { translate, useLanguage } from "../i18n";
import {
  deriveTaskOutputSummaryFromEvents,
  hasTaskOutputs,
  resolvePreferredTaskOutputSummary,
} from "../utils/task-outputs";
import { normalizeArtifactPathForWorkspace } from "../utils/artifact-path-identity";
import { normalizeEventsForTimelineUi } from "../utils/timeline-projection";
import { getEffectiveTaskEventType } from "../utils/task-event-compat";
import { isUserVisibleTaskArtifactPath } from "../utils/task-artifact-visibility";
import {
  type FileInfo,
  type SharedTaskEventUiState,
  type ToolUsage,
} from "../utils/task-event-derived";
import {
  getInlinePreviewKindForGeneratedFile,
  type GeneratedInlinePreviewKind,
} from "./MainContent/artifact-logic";
import { canPreviewWebPageInApp } from "../../shared/web-page-formats";
import { canOpenSpreadsheetInApp } from "../../shared/spreadsheet-formats";
import { canPreviewDocumentInApp } from "../../shared/document-formats";
import { canPreviewPresentationInApp } from "../../shared/presentation-formats";
import {
  getProgressSectionMaterialSignature,
  getQueueSectionMaterialSignature,
  getQueueStatusSignature,
  getPlanStepsSignature,
  getTaskListSignature,
  getVisibleProgressSteps,
} from "../utils/right-panel-progress";
import { localizeProgressText } from "../utils/localized-progress-text";
import { getLocalizedSubagentDisplay } from "../utils/localized-agent-roles";
import { getLocalizedSkillNameFromIdentifier } from "../utils/localized-skills";
import {
  deriveOfficeArtifactDelivery,
  mapOfficeVersionsByPath,
  type OfficeArtifactVersion,
  type OfficeDeliveryFormat,
  type OfficeDeliveryPhase,
  type OfficeDeliverySummary,
} from "../utils/office-artifact-delivery";
import { TaskAccessSection } from "./TaskAccessSection";
import { TaskAttentionBadge } from "./TaskAttentionBadge";
import {
  Cloud,
  Database,
  MessageCircle,
  Wrench,
  ClipboardList,
  KeyRound,
  Mail,
  Hash,
  Gamepad2,
  FileEdit,
  Github,
  GitBranch,
  FolderOpen,
  CreditCard,
  Phone,
  BarChart3,
  BookOpen,
  Calendar,
  Palette,
  Shield,
  Zap,
  Search,
  Plug,
  PenLine,
  Flame,
  Bell,
  Archive,
  Braces,
  File as FileIcon,
  FileCode2,
  type LucideProps,
  FileImage,
  FileSpreadsheet,
  FileText,
  Film,
  Music,
  Presentation,
} from "lucide-react";
import { getEmojiIcon } from "../utils/emoji-icon-map";
import {
  measureRendererPerf,
  recordRendererRender,
} from "../utils/renderer-perf";
import "./right-panel.css";

const NO_RUNNING_QUEUE_TASKS: Task[] = [];

type RightPanelTopSection = "overview" | "process" | "resources";
type RightPanelTopSectionState = Record<RightPanelTopSection, boolean>;

const rightPanelTopSectionCache = new Map<string, RightPanelTopSectionState>();
const MAX_RIGHT_PANEL_DISCLOSURE_ITEMS = 100;

function getDefaultTopSectionState(
  task: Task | undefined,
  hasOutputs: boolean,
): RightPanelTopSectionState {
  if (task?.status === "completed") {
    return { overview: true, process: false, resources: false };
  }
  if (task?.status === "failed") {
    return { overview: hasOutputs, process: true, resources: false };
  }
  if (task?.status === "executing" || task?.status === "planning") {
    return { overview: hasOutputs, process: true, resources: false };
  }
  return { overview: false, process: true, resources: true };
}

function rememberTopSectionState(
  taskId: string,
  state: RightPanelTopSectionState,
): void {
  rightPanelTopSectionCache.delete(taskId);
  rightPanelTopSectionCache.set(taskId, state);
  while (rightPanelTopSectionCache.size > MAX_RIGHT_PANEL_DISCLOSURE_ITEMS) {
    const oldest = rightPanelTopSectionCache.keys().next().value as
      string | undefined;
    if (!oldest) break;
    rightPanelTopSectionCache.delete(oldest);
  }
}

function RightPanelTopLevelSection({
  section,
  title,
  detail,
  expanded,
  onToggle,
  children,
}: {
  section: RightPanelTopSection;
  title: string;
  detail?: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const contentId = `right-panel-${section}-content`;
  return (
    <section
      className={`right-panel-top-section right-panel-top-${section}`}
      data-right-panel-section={section}
    >
      <button
        type="button"
        className="right-panel-top-header"
        aria-expanded={expanded}
        aria-controls={contentId}
        onClick={onToggle}
      >
        <span className="right-panel-top-title">{title}</span>
        {detail ? (
          <span className="right-panel-top-detail">{detail}</span>
        ) : null}
        <span className="right-panel-top-toggle" aria-hidden="true">
          {expanded ? "−" : "+"}
        </span>
      </button>
      <div
        id={contentId}
        className="right-panel-top-content"
        hidden={!expanded}
      >
        {children}
      </div>
    </section>
  );
}

/**
 * Map connector name patterns to Lucide icon components.
 * Matched against the lowercase connector name/ID.
 */
const CONNECTOR_LUCIDE_MAP: Record<string, ComponentType<LucideProps>> = {
  salesforce: Cloud,
  jira: ClipboardList,
  hubspot: MessageCircle,
  zendesk: MessageCircle,
  servicenow: Wrench,
  linear: PenLine,
  asana: ClipboardList,
  okta: KeyRound,
  resend: Mail,
  slack: Hash,
  discord: Gamepad2,
  notion: FileEdit,
  github: Github,
  gitlab: GitBranch,
  "google-drive": FolderOpen,
  "google drive": FolderOpen,
  gmail: Mail,
  bigquery: Database,
  intercom: MessageCircle,
  docusign: PenLine,
  stripe: CreditCard,
  twilio: Phone,
  sendgrid: Mail,
  datadog: BarChart3,
  pagerduty: Bell,
  confluence: BookOpen,
  trello: ClipboardList,
  monday: Calendar,
  airtable: Database,
  figma: Palette,
  sentry: Shield,
  supabase: Zap,
  firebase: Flame,
  postgres: Database,
  mongodb: Database,
  redis: Database,
  elasticsearch: Search,
};

/** Resolve a Lucide icon component for a connector by name, falling back to emoji map then Plug. */
function resolveConnectorLucideIcon(
  name: string,
  emoji: string,
): ComponentType<LucideProps> {
  const lower = name.toLowerCase();
  for (const [key, Icon] of Object.entries(CONNECTOR_LUCIDE_MAP)) {
    if (lower.includes(key)) return Icon;
  }
  return getEmojiIcon(emoji) || Plug;
}

const TOOL_FRIENDLY_LABELS: Record<string, string> = {
  glob: "Search for files",
  grep: "Search code",
  read: "Read file",
  edit: "Edit file",
  write: "Write file",
  bash: "Run command",
  agent: "Delegate to sub-agent",
  web_fetch: "Fetch web page",
  web_search: "Search the web",
  todo_write: "Update task list",
  skill: "Run skill",
  request_user_input: "Collect details from you",
};

const CODE_FILE_EXTENSIONS = new Set([
  "c",
  "cc",
  "cpp",
  "cs",
  "css",
  "go",
  "h",
  "hpp",
  "html",
  "java",
  "js",
  "jsx",
  "kt",
  "mjs",
  "php",
  "py",
  "rb",
  "rs",
  "sh",
  "sql",
  "swift",
  "toml",
  "ts",
  "tsx",
  "vue",
  "xml",
  "yaml",
  "yml",
]);
const TEXT_FILE_EXTENSIONS = new Set([
  "csv",
  "doc",
  "docx",
  "log",
  "md",
  "mdx",
  "pdf",
  "rtf",
  "txt",
]);
const SPREADSHEET_FILE_EXTENSIONS = new Set([
  "numbers",
  "ods",
  "tsv",
  "xls",
  "xlsm",
  "xlsx",
]);
const IMAGE_FILE_EXTENSIONS = new Set([
  "avif",
  "bmp",
  "gif",
  "heic",
  "ico",
  "jpg",
  "jpeg",
  "png",
  "svg",
  "webp",
]);
const PRESENTATION_FILE_EXTENSIONS = new Set([
  "key",
  "odp",
  "potx",
  "ppsx",
  "ppt",
  "pptm",
  "pptx",
]);
const VIDEO_FILE_EXTENSIONS = new Set([
  "avi",
  "m4v",
  "mov",
  "mp4",
  "mpeg",
  "mpg",
  "webm",
]);
const AUDIO_FILE_EXTENSIONS = new Set([
  "aac",
  "flac",
  "m4a",
  "mp3",
  "ogg",
  "wav",
]);
const ARCHIVE_FILE_EXTENSIONS = new Set([
  "7z",
  "bz2",
  "dmg",
  "gz",
  "rar",
  "tar",
  "tgz",
  "zip",
]);
type ArtifactOpeners = Partial<
  Record<GeneratedInlinePreviewKind, (path: string) => void>
>;

function getFileExtension(path: string): string {
  const fileName = path.split(/[\\/]/).pop() || path;
  const dotIndex = fileName.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === fileName.length - 1) return "";
  return fileName.slice(dotIndex + 1).toLowerCase();
}

function getFileTypeIcon(path: string): {
  Icon: ComponentType<LucideProps>;
  label: string;
} {
  if (path.endsWith("/") || path.endsWith("\\")) {
    return {
      Icon: FolderOpen,
      label: translate("rightPanel.fileType.folder", "Folder"),
    };
  }
  const extension = getFileExtension(path);
  if (extension === "json" || extension === "jsonl") {
    return {
      Icon: Braces,
      label: translate("rightPanel.fileType.json", "JSON file"),
    };
  }
  if (SPREADSHEET_FILE_EXTENSIONS.has(extension)) {
    return {
      Icon: FileSpreadsheet,
      label: translate("rightPanel.fileType.spreadsheet", "Spreadsheet file"),
    };
  }
  if (IMAGE_FILE_EXTENSIONS.has(extension)) {
    return {
      Icon: FileImage,
      label: translate("rightPanel.fileType.image", "Image file"),
    };
  }
  if (PRESENTATION_FILE_EXTENSIONS.has(extension)) {
    return {
      Icon: Presentation,
      label: translate("rightPanel.fileType.presentation", "Presentation file"),
    };
  }
  if (VIDEO_FILE_EXTENSIONS.has(extension)) {
    return {
      Icon: Film,
      label: translate("rightPanel.fileType.video", "Video file"),
    };
  }
  if (AUDIO_FILE_EXTENSIONS.has(extension)) {
    return {
      Icon: Music,
      label: translate("rightPanel.fileType.audio", "Audio file"),
    };
  }
  if (ARCHIVE_FILE_EXTENSIONS.has(extension)) {
    return {
      Icon: Archive,
      label: translate("rightPanel.fileType.archive", "Archive file"),
    };
  }
  if (CODE_FILE_EXTENSIONS.has(extension)) {
    return {
      Icon: FileCode2,
      label: translate("rightPanel.fileType.code", "Code file"),
    };
  }
  if (TEXT_FILE_EXTENSIONS.has(extension)) {
    return {
      Icon: FileText,
      label: translate("rightPanel.fileType.text", "Text file"),
    };
  }
  return {
    Icon: FileIcon,
    label: translate("rightPanel.fileType.generic", "File"),
  };
}

/**
 * Strips technical tool-call language from LLM-generated plan step descriptions.
 * Converts e.g. "Use the `Skill` tool with skill ID `novelist`..." into
 * "Run the Novelist skill" so the Progress panel stays readable.
 */
function humanizeStepDescription(description: string): string {
  if (!description) return description;

  // "Use the `Skill` tool with skill ID `<id>`..." → "Run the <Id> skill"
  const useSkillMatch = description.match(
    /use\s+the\s+`?Skill`?\s+tool\s+with\s+skill\s+(?:ID\s+)?`?([a-z0-9_-]+)`?/i,
  );
  if (useSkillMatch) {
    const skillId = useSkillMatch[1];
    const skillName = skillId
      .replace(/[-_]/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
    // Append any meaningful context after the skill ID match
    const rest = description
      .slice(description.indexOf(useSkillMatch[0]) + useSkillMatch[0].length)
      .trim();
    const suffix = rest
      .replace(/^[^a-zA-Z]*/, "")
      .split(/[.]/)[0]
      .trim();
    const humanized =
      suffix.length > 4
        ? `Run the ${skillName} skill — ${suffix}`
        : `Run the ${skillName} skill`;
    return localizeProgressText(stripInlineMarkdownFormatting(humanized));
  }

  // "Use request_user_input to collect..." → "Collect details from you"
  if (/use\s+request_user_input\b/i.test(description)) {
    const rest = description
      .replace(/use\s+request_user_input\s+(to\s+)?/i, "")
      .trim();
    const clean = rest.replace(/`[^`]+`/g, "").trim();
    const humanized =
      clean.length > 4 ? capitalize(clean) : "Collect details from you";
    return localizeProgressText(stripInlineMarkdownFormatting(humanized));
  }

  // Detect raw tool-call text leaking into descriptions: "to=glob 】【..." or "assistant to=read ..."
  const rawToolCallMatch = description.match(
    /^\s*(?:assistant\s+)?to=([a-z_][\w-]*)\b/i,
  );
  if (rawToolCallMatch) {
    const toolName = rawToolCallMatch[1].toLowerCase();
    const humanized =
      TOOL_FRIENDLY_LABELS[toolName] ?? capitalize(toolName.replace(/_/g, " "));
    return localizeProgressText(stripInlineMarkdownFormatting(humanized));
  }

  return localizeProgressText(stripInlineMarkdownFormatting(description));
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function stripInlineMarkdownFormatting(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1$2")
    .replace(/(^|[^_])_([^_\n]+)_(?!_)/g, "$1$2")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

type CollaborativeAgentStatusKind =
  "completed" | "warning" | "failed" | "running" | "pending";

type CollaborativeAgentUsage = {
  inputTokens: number;
  outputTokens: number;
  cost: number;
};

type CollaborativeAgentRow = {
  task: Task;
  statusKind: CollaborativeAgentStatusKind;
  statusLabel: string;
  eventCount: number;
  toolCallCount: number;
  llmCallCount: number;
  usage: CollaborativeAgentUsage;
  durationMs: number;
};

type CollaborativeAgentTotals = {
  total: number;
  completed: number;
  warning: number;
  failed: number;
  running: number;
  pending: number;
  eventCount: number;
  toolCallCount: number;
  llmCallCount: number;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  wallDurationMs: number;
  rows: CollaborativeAgentRow[];
};

function toFiniteNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function formatCompactNumber(value: number): string {
  if (value >= 1_000_000)
    return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`;
  if (value >= 1_000)
    return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}K`;
  return String(Math.round(value));
}

function formatRightPanelDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "0s";
  const totalSeconds = Math.max(1, Math.round(ms / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60)
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

function formatCost(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "$0";
  if (value < 0.01) return `$${value.toFixed(4)}`;
  if (value < 1) return `$${value.toFixed(3)}`;
  return `$${value.toFixed(2)}`;
}

function getCollaborativeAgentStatusKind(
  task: Task,
): CollaborativeAgentStatusKind {
  if (
    task.terminalStatus === "failed" ||
    task.status === "failed" ||
    task.status === "cancelled"
  ) {
    return "failed";
  }
  if (
    task.terminalStatus === "partial_success" ||
    task.terminalStatus === "needs_user_action" ||
    task.terminalStatus === "awaiting_approval" ||
    task.terminalStatus === "resume_available"
  ) {
    return "warning";
  }
  if (task.status === "completed") return "completed";
  if (
    task.status === "executing" ||
    task.status === "planning" ||
    task.status === "interrupted"
  ) {
    return "running";
  }
  return "pending";
}

function getCollaborativeAgentStatusLabel(
  kind: CollaborativeAgentStatusKind,
  task: Task,
): string {
  if (kind === "completed") return translate("rightPanel.status.done", "Done");
  if (kind === "failed") {
    return task.status === "cancelled"
      ? translate("rightPanel.status.cancelled", "Cancelled")
      : translate("rightPanel.status.failed", "Failed");
  }
  if (kind === "warning")
    return translate("rightPanel.status.needsReview", "Needs review");
  if (kind === "running")
    return translate("rightPanel.status.running", "Running");
  return translate("rightPanel.status.pending", "Pending");
}

function getLatestUsageTotals(events: TaskEvent[]): CollaborativeAgentUsage {
  const latest = [...events]
    .reverse()
    .find((event) => getEffectiveTaskEventType(event) === "llm_usage");
  const payload =
    latest?.payload &&
    typeof latest.payload === "object" &&
    !Array.isArray(latest.payload)
      ? (latest.payload as Record<string, unknown>)
      : {};
  const totals =
    payload.totals &&
    typeof payload.totals === "object" &&
    !Array.isArray(payload.totals)
      ? (payload.totals as Record<string, unknown>)
      : payload;
  return {
    inputTokens: toFiniteNumber(totals.inputTokens ?? totals.input_tokens),
    outputTokens: toFiniteNumber(totals.outputTokens ?? totals.output_tokens),
    cost: toFiniteNumber(totals.cost ?? totals.totalCost ?? payload.totalCost),
  };
}

function getCollaborativeAgentTotals(
  childTasks: Task[],
  childEvents: TaskEvent[],
): CollaborativeAgentTotals | null {
  if (childTasks.length === 0) return null;
  const eventsByTaskId = new Map<string, TaskEvent[]>();
  for (const event of childEvents) {
    const list = eventsByTaskId.get(event.taskId) || [];
    list.push(event);
    eventsByTaskId.set(event.taskId, list);
  }

  const rows = childTasks
    .slice()
    .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))
    .map((task): CollaborativeAgentRow => {
      const taskEvents = eventsByTaskId.get(task.id) || [];
      const statusKind = getCollaborativeAgentStatusKind(task);
      const usage = getLatestUsageTotals(taskEvents);
      const endMs = task.completedAt ?? task.updatedAt ?? task.createdAt;
      return {
        task,
        statusKind,
        statusLabel: getCollaborativeAgentStatusLabel(statusKind, task),
        eventCount: taskEvents.length,
        toolCallCount: taskEvents.filter(
          (event) => getEffectiveTaskEventType(event) === "tool_call",
        ).length,
        llmCallCount: taskEvents.filter(
          (event) => getEffectiveTaskEventType(event) === "llm_usage",
        ).length,
        usage,
        durationMs: Math.max(0, endMs - task.createdAt),
      };
    });

  const firstStartedAt = Math.min(...rows.map((row) => row.task.createdAt));
  const lastEndedAt = Math.max(
    ...rows.map(
      (row) => row.task.completedAt ?? row.task.updatedAt ?? row.task.createdAt,
    ),
  );
  const counts = rows.reduce(
    (acc, row) => {
      acc[row.statusKind] += 1;
      acc.eventCount += row.eventCount;
      acc.toolCallCount += row.toolCallCount;
      acc.llmCallCount += row.llmCallCount;
      acc.inputTokens += row.usage.inputTokens;
      acc.outputTokens += row.usage.outputTokens;
      acc.cost += row.usage.cost;
      return acc;
    },
    {
      completed: 0,
      warning: 0,
      failed: 0,
      running: 0,
      pending: 0,
      eventCount: 0,
      toolCallCount: 0,
      llmCallCount: 0,
      inputTokens: 0,
      outputTokens: 0,
      cost: 0,
    },
  );

  return {
    total: rows.length,
    ...counts,
    wallDurationMs: Math.max(0, lastEndedAt - firstStartedAt),
    rows,
  };
}

function areTaskEventListsEqual(a: TaskEvent[], b: TaskEvent[]): boolean {
  if (a.length !== b.length) return false;
  if (a.length === 0) return true;
  const lastA = a[a.length - 1];
  const lastB = b[b.length - 1];
  return lastA.id === lastB.id && lastA.timestamp === lastB.timestamp;
}

function areChildTaskStatsEqual(a: Task[], b: Task[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (
      a[i].id !== b[i].id ||
      a[i].status !== b[i].status ||
      a[i].updatedAt !== b[i].updatedAt
    ) {
      return false;
    }
  }
  return true;
}

function getTaskEventActivityText(event: TaskEvent | null): string | null {
  if (!event) return null;
  const effectiveType = getEffectiveTaskEventType(event);
  const payload =
    event.payload &&
    typeof event.payload === "object" &&
    !Array.isArray(event.payload)
      ? (event.payload as Record<string, unknown>)
      : {};

  if (
    (effectiveType === "skill_applied" || effectiveType === "skill_used") &&
    typeof payload.skillName === "string" &&
    payload.skillName.trim().length > 0
  ) {
    return translate("rightPanel.activity.usingSkill", "Using {skill}", {
      skill: getLocalizedSkillNameFromIdentifier(payload.skillName.trim()),
    });
  }

  if (effectiveType === "tool_call" && typeof payload.tool === "string") {
    if (payload.tool === "skill") {
      const input =
        payload.input &&
        typeof payload.input === "object" &&
        !Array.isArray(payload.input)
          ? (payload.input as Record<string, unknown>)
          : {};
      const rawSkillName =
        typeof input.skill_name === "string"
          ? input.skill_name
          : typeof input.skillName === "string"
            ? input.skillName
            : typeof input.skill_id === "string"
              ? input.skill_id
              : typeof input.skillId === "string"
                ? input.skillId
                : typeof input.skill === "string"
                  ? input.skill
                  : "";
      if (rawSkillName.trim().length > 0) {
        return translate(
          "rightPanel.activity.runningSkill",
          "Running {skill} skill",
          {
            skill: getLocalizedSkillNameFromIdentifier(rawSkillName.trim()),
          },
        );
      }
    }
    return TOOL_FRIENDLY_LABELS[payload.tool] ?? `Using ${payload.tool}`;
  }

  const step =
    payload.step &&
    typeof payload.step === "object" &&
    !Array.isArray(payload.step)
      ? (payload.step as Record<string, unknown>)
      : null;
  if (
    (effectiveType === "step_started" ||
      effectiveType === "progress_update" ||
      effectiveType === "step_completed") &&
    typeof step?.description === "string" &&
    step.description.trim().length > 0
  ) {
    return humanizeStepDescription(step.description.trim());
  }

  if (
    (effectiveType === "step_started" || effectiveType === "progress_update") &&
    typeof payload.message === "string" &&
    payload.message.trim().length > 0
  ) {
    return stripInlineMarkdownFormatting(payload.message.trim());
  }

  if (
    (effectiveType === "file_created" ||
      effectiveType === "file_modified" ||
      effectiveType === "artifact_created") &&
    typeof payload.path === "string" &&
    payload.path.trim().length > 0
  ) {
    const name = payload.path.split("/").pop() || payload.path;
    return `${effectiveType === "file_modified" ? "Updated" : "Created"} ${name}`;
  }

  return null;
}

// Clickable file path component - opens file viewer on click, shows in Finder on right-click
function ClickableFilePath({
  path,
  workspacePath,
  className = "",
  onOpenViewer,
}: {
  path: string;
  workspacePath?: string;
  className?: string;
  onOpenViewer?: (path: string) => void;
}) {
  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // If viewer callback is provided and we have a workspace, use the in-app viewer
    if (onOpenViewer && workspacePath) {
      onOpenViewer(path);
      return;
    }

    // Fallback to external app
    try {
      const error = await window.electronAPI.openFile(path, workspacePath);
      if (error) {
        console.error("Failed to open file:", error);
      }
    } catch (err) {
      console.error("Error opening file:", err);
    }
  };

  const handleContextMenu = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await window.electronAPI.showInFinder(path, workspacePath);
    } catch (err) {
      console.error("Error showing in Finder:", err);
    }
  };

  const fileName = path.split("/").pop() || path;

  return (
    <span
      className={`clickable-file-path ${className}`}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      title={`${path}\n\nClick to preview • Right-click to show in Finder`}
    >
      {fileName}
    </span>
  );
}

interface RightPanelProps {
  task: Task | undefined;
  workspace: Workspace | null;
  events: TaskEvent[];
  sharedTaskEventUi?: SharedTaskEventUiState | null;
  hasActiveChildren?: boolean;
  childTasks?: Task[];
  childEvents?: TaskEvent[];
  runningTasks?: Task[];
  queuedTasks?: Task[];
  queueStatus?: QueueStatus | null;
  onSelectTask?: (taskId: string) => void;
  onCancelTask?: (taskId: string) => void;
  onOpenSpreadsheetArtifact?: (path: string) => void;
  onOpenDocumentArtifact?: (path: string) => void;
  onOpenPresentationArtifact?: (path: string) => void;
  onOpenWebArtifact?: (path: string) => void;
  rendererPerfLoggingEnabled?: boolean;
  highlightOutputPath?: string | null;
  onHighlightConsumed?: () => void;
}

export function openPreviewableFileInSidebar(
  filePath: string,
  openers: ArtifactOpeners,
  fallback: (path: string) => void,
): void {
  const kind = getInlinePreviewKindForGeneratedFile({ path: filePath });
  switch (kind) {
    case "html":
      if (canPreviewWebPageInApp(filePath) && openers.html) {
        openers.html(filePath);
        return;
      }
      break;
    case "spreadsheet":
      if (canOpenSpreadsheetInApp(filePath) && openers.spreadsheet) {
        openers.spreadsheet(filePath);
        return;
      }
      break;
    case "document":
      if (canPreviewDocumentInApp(filePath) && openers.document) {
        openers.document(filePath);
        return;
      }
      break;
    case "presentation":
      if (canPreviewPresentationInApp(filePath) && openers.presentation) {
        openers.presentation(filePath);
        return;
      }
      break;
  }
  fallback(filePath);
}

function getRightPanelTaskSignature(task: Task | undefined): string {
  if (!task) return "none";
  return [
    task.id,
    task.status,
    task.terminalStatus ?? "",
    task.updatedAt,
    task.completedAt ?? "",
    task.error ?? "",
  ].join(":");
}

function getChecklistSignature(
  checklistState: SessionChecklistState | null,
): string {
  if (!checklistState) return "none";
  return [
    checklistState.updatedAt,
    checklistState.verificationNudgeNeeded ? 1 : 0,
    checklistState.nudgeReason ?? "",
    checklistState.items
      .map(
        (item) =>
          `${item.id}:${item.status}:${item.kind}:${item.updatedAt}:${item.title}`,
      )
      .join("|"),
  ].join(":");
}

function getFilesSignature(files: FileInfo[]): string {
  return files
    .map((file) => `${file.path}:${file.action}:${file.timestamp}`)
    .join("|");
}

function getConnectorsSignature(
  connectors: {
    id: string;
    name: string;
    icon: string;
    status: string;
    tools: string[];
  }[],
): string {
  return connectors
    .map(
      (connector) =>
        `${connector.id}:${connector.status}:${connector.name}:${connector.tools.join(",")}`,
    )
    .join("|");
}

function getActiveContextSignature(
  activeContext:
    | {
        connectors: {
          id: string;
          name: string;
          icon: string;
          status: string;
          tools: string[];
        }[];
        skills: { id: string; name: string; icon: string }[];
      }
    | null
    | undefined,
): string {
  if (!activeContext) return "none";
  return [
    getConnectorsSignature(activeContext.connectors),
    activeContext.skills
      .map((skill) => `${skill.id}:${skill.name}:${skill.icon}`)
      .join("|"),
  ].join("::");
}

function getToolUsageSignature(toolUsage: ToolUsage[]): string {
  return toolUsage
    .map((tool) => `${tool.name}:${tool.count}:${tool.lastUsed}`)
    .join("|");
}

function getStringListSignature(values: string[]): string {
  return values.join("|");
}

function useStableSnapshotBySignature<T>(value: T, signature: string): T {
  const snapshotRef = useRef<{ signature: string; value: T }>({
    signature,
    value,
  });
  if (snapshotRef.current.signature !== signature) {
    snapshotRef.current = { signature, value };
  }
  return snapshotRef.current.value;
}

const ProgressSectionContent = memo(
  function ProgressSectionContent({
    expanded,
    planSteps,
    taskStatus,
    taskTerminalStatus,
    hasActiveChildren,
    emptyHintText,
    fallbackActivityText,
    rendererPerfLoggingEnabled,
    getStatusIndicator,
  }: {
    expanded: boolean;
    planSteps: PlanStep[];
    taskStatus?: Task["status"];
    taskTerminalStatus?: Task["terminalStatus"];
    hasActiveChildren: boolean;
    emptyHintText: string;
    fallbackActivityText: string | null;
    rendererPerfLoggingEnabled: boolean;
    getStatusIndicator: (status: string) => React.ReactNode;
  }) {
    useLanguage();
    recordRendererRender(
      "RightPanel.section",
      "progress",
      rendererPerfLoggingEnabled,
    );
    if (!expanded) return null;
    const visiblePlanSteps = getVisibleProgressSteps(planSteps);
    const attentionState = deriveTaskAttentionState(
      {
        status: taskStatus || "pending",
        terminalStatus: taskTerminalStatus,
      },
      {
        hasActiveRuntime:
          hasActiveChildren ||
          taskStatus === "planning" ||
          taskStatus === "executing",
      },
    );
    return (
      <div className="cli-section-content">
        {planSteps.length > 0 ? (
          <div className="cli-progress-list">
            {visiblePlanSteps.map((step, index) => {
              const displayDescription =
                humanizeStepDescription(step.description) ||
                localizeProgressText(`Step ${index + 1}`);
              return (
                <div
                  key={step.id || index}
                  className={`cli-progress-item ${step.status}`}
                >
                  <span className="cli-progress-num">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className={`cli-progress-status ${step.status}`}>
                    {getStatusIndicator(step.status)}
                  </span>
                  <span
                    className="cli-progress-text"
                    title={displayDescription}
                  >
                    {displayDescription}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="cli-empty-state">
            <TaskAttentionBadge
              state={attentionState}
              className="right-panel-progress-attention"
              announce
            />
            <p className="cli-hint">
              <span className="terminal-only">
                {fallbackActivityText || emptyHintText}
              </span>
              <span className="modern-only">
                {fallbackActivityText ||
                  (hasActiveChildren
                    ? translate(
                        "rightPanel.subTaskStillWorking",
                        "Sub-task is still working...",
                      )
                    : translate(
                        "rightPanel.standingBy",
                        "Standing by when you are ready.",
                      ))}
              </span>
            </p>
          </div>
        )}
      </div>
    );
  },
  (prev, next) =>
    prev.expanded === next.expanded &&
    getPlanStepsSignature(prev.planSteps) ===
      getPlanStepsSignature(next.planSteps) &&
    prev.taskStatus === next.taskStatus &&
    prev.taskTerminalStatus === next.taskTerminalStatus &&
    prev.hasActiveChildren === next.hasActiveChildren &&
    prev.emptyHintText === next.emptyHintText &&
    prev.fallbackActivityText === next.fallbackActivityText &&
    prev.rendererPerfLoggingEnabled === next.rendererPerfLoggingEnabled,
);

const QueueSectionContent = memo(
  function QueueSectionContent({
    expanded,
    runningTasks,
    queuedTasks,
    activeLabel,
    nextLabel,
    activeModernLabel,
    nextModernLabel,
    cancelLabel,
    onSelectTask,
    onCancelTask,
    rendererPerfLoggingEnabled,
  }: {
    expanded: boolean;
    runningTasks: Task[];
    queuedTasks: Task[];
    activeLabel: string;
    nextLabel: string;
    activeModernLabel: string;
    nextModernLabel: string;
    cancelLabel: string;
    onSelectTask?: (taskId: string) => void;
    onCancelTask?: (taskId: string) => void;
    rendererPerfLoggingEnabled: boolean;
  }) {
    recordRendererRender(
      "RightPanel.section",
      "queue",
      rendererPerfLoggingEnabled,
    );
    if (!expanded) return null;
    return (
      <div className="cli-section-content">
        {runningTasks.length > 0 && (
          <div className="cli-queue-group">
            <div className="cli-context-label">
              <span className="terminal-only">{activeLabel}</span>
              <span className="modern-only">{activeModernLabel}</span>
            </div>
            {runningTasks.map((t) => (
              <div key={t.id} className="cli-queue-item running">
                <span className="cli-queue-status">
                  <span className="terminal-only">[~]</span>
                  <span className="modern-only">
                    <span className="queue-status-dot running" />
                  </span>
                </span>
                <span
                  className="cli-queue-title"
                  onClick={() => onSelectTask?.(t.id)}
                >
                  {t.title || t.prompt}
                </span>
                <button
                  className="cli-queue-cancel"
                  onClick={() => onCancelTask?.(t.id)}
                  title={cancelLabel}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        {queuedTasks.length > 0 && (
          <div className="cli-queue-group">
            <div className="cli-context-label">
              <span className="terminal-only">{nextLabel}</span>
              <span className="modern-only">{nextModernLabel}</span>
            </div>
            {queuedTasks.map((t, i) => (
              <div key={t.id} className="cli-queue-item queued">
                <span className="cli-queue-status">
                  <span className="terminal-only">[{i + 1}]</span>
                  <span className="modern-only">
                    <span className="queue-status-pill">{i + 1}</span>
                  </span>
                </span>
                <span
                  className="cli-queue-title"
                  onClick={() => onSelectTask?.(t.id)}
                >
                  {t.title || t.prompt}
                </span>
                <button
                  className="cli-queue-cancel"
                  onClick={() => onCancelTask?.(t.id)}
                  title={cancelLabel}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  },
  (prev, next) =>
    prev.expanded === next.expanded &&
    getTaskListSignature(prev.runningTasks) ===
      getTaskListSignature(next.runningTasks) &&
    getTaskListSignature(prev.queuedTasks) ===
      getTaskListSignature(next.queuedTasks) &&
    prev.activeLabel === next.activeLabel &&
    prev.nextLabel === next.nextLabel &&
    prev.activeModernLabel === next.activeModernLabel &&
    prev.nextModernLabel === next.nextModernLabel &&
    prev.cancelLabel === next.cancelLabel &&
    prev.rendererPerfLoggingEnabled === next.rendererPerfLoggingEnabled,
);

const ProgressSection = memo(
  function ProgressSection({
    expanded,
    planSteps,
    taskStatus,
    taskTerminalStatus,
    hasActiveChildren,
    progressTitleText,
    emptyHintText,
    fallbackActivityText,
    toggleSection,
    rendererPerfLoggingEnabled,
    getStatusIndicator,
  }: {
    expanded: boolean;
    planSteps: PlanStep[];
    taskStatus?: Task["status"];
    taskTerminalStatus?: Task["terminalStatus"];
    hasActiveChildren: boolean;
    progressTitleText: string;
    emptyHintText: string;
    fallbackActivityText: string | null;
    toggleSection: () => void;
    rendererPerfLoggingEnabled: boolean;
    getStatusIndicator: (status: string) => React.ReactNode;
  }) {
    return (
      <div className="right-panel-section cli-section right-panel-progress-section">
        <button
          type="button"
          className="cli-section-header"
          onClick={toggleSection}
          aria-expanded={expanded}
        >
          <span className="cli-section-prompt">&gt;</span>
          <span className="cli-section-title">
            <span className="terminal-only">{progressTitleText}</span>
            <span className="modern-only">{progressTitleText}</span>
          </span>
          <span className="cli-section-toggle">
            <span className="terminal-only">{expanded ? "[-]" : "[+]"}</span>
            <span className="modern-only">{expanded ? "−" : "+"}</span>
          </span>
        </button>
        <ProgressSectionContent
          expanded={expanded}
          planSteps={planSteps}
          taskStatus={taskStatus}
          taskTerminalStatus={taskTerminalStatus}
          hasActiveChildren={hasActiveChildren}
          emptyHintText={emptyHintText}
          fallbackActivityText={fallbackActivityText}
          rendererPerfLoggingEnabled={rendererPerfLoggingEnabled}
          getStatusIndicator={getStatusIndicator}
        />
      </div>
    );
  },
  (prev, next) =>
    getProgressSectionMaterialSignature({
      expanded: prev.expanded,
      planSteps: prev.planSteps,
      taskStatus: prev.taskStatus,
      taskTerminalStatus: prev.taskTerminalStatus,
      hasActiveChildren: prev.hasActiveChildren,
      emptyHintText: prev.emptyHintText,
    }) ===
      getProgressSectionMaterialSignature({
        expanded: next.expanded,
        planSteps: next.planSteps,
        taskStatus: next.taskStatus,
        taskTerminalStatus: next.taskTerminalStatus,
        hasActiveChildren: next.hasActiveChildren,
        emptyHintText: next.emptyHintText,
      }) &&
    prev.progressTitleText === next.progressTitleText &&
    prev.rendererPerfLoggingEnabled === next.rendererPerfLoggingEnabled,
);

const QueueSection = memo(
  function QueueSection({
    visible,
    expanded,
    runningTasks,
    queuedTasks,
    queueBadgeText,
    queueTitleText,
    activeLabel,
    nextLabel,
    activeModernLabel,
    nextModernLabel,
    cancelLabel,
    toggleSection,
    onSelectTask,
    onCancelTask,
    rendererPerfLoggingEnabled,
  }: {
    visible: boolean;
    expanded: boolean;
    runningTasks: Task[];
    queuedTasks: Task[];
    queueBadgeText: string;
    queueTitleText: string;
    activeLabel: string;
    nextLabel: string;
    activeModernLabel: string;
    nextModernLabel: string;
    cancelLabel: string;
    toggleSection: () => void;
    onSelectTask?: (taskId: string) => void;
    onCancelTask?: (taskId: string) => void;
    rendererPerfLoggingEnabled: boolean;
  }) {
    if (!visible) return null;
    return (
      <div className="right-panel-section cli-section">
        <button
          type="button"
          className="cli-section-header"
          onClick={toggleSection}
          aria-expanded={expanded}
        >
          <span className="cli-section-prompt">&gt;</span>
          <span className="cli-section-title">
            <span className="terminal-only">{queueTitleText}</span>
            <span className="modern-only">{queueTitleText}</span>
          </span>
          <span className="cli-queue-badge">{queueBadgeText}</span>
          <span className="cli-section-toggle">
            <span className="terminal-only">{expanded ? "[-]" : "[+]"}</span>
            <span className="modern-only">{expanded ? "−" : "+"}</span>
          </span>
        </button>
        <QueueSectionContent
          expanded={expanded}
          runningTasks={runningTasks}
          queuedTasks={queuedTasks}
          activeLabel={activeLabel}
          nextLabel={nextLabel}
          activeModernLabel={activeModernLabel}
          nextModernLabel={nextModernLabel}
          cancelLabel={cancelLabel}
          onSelectTask={onSelectTask}
          onCancelTask={onCancelTask}
          rendererPerfLoggingEnabled={rendererPerfLoggingEnabled}
        />
      </div>
    );
  },
  (prev, next) =>
    prev.visible === next.visible &&
    prev.queueBadgeText === next.queueBadgeText &&
    prev.queueTitleText === next.queueTitleText &&
    getQueueSectionMaterialSignature({
      expanded: prev.expanded,
      runningTasks: prev.runningTasks,
      queuedTasks: prev.queuedTasks,
      activeLabel: prev.activeLabel,
      nextLabel: prev.nextLabel,
    }) ===
      getQueueSectionMaterialSignature({
        expanded: next.expanded,
        runningTasks: next.runningTasks,
        queuedTasks: next.queuedTasks,
        activeLabel: next.activeLabel,
        nextLabel: next.nextLabel,
      }) &&
    prev.activeModernLabel === next.activeModernLabel &&
    prev.nextModernLabel === next.nextModernLabel &&
    prev.cancelLabel === next.cancelLabel &&
    prev.rendererPerfLoggingEnabled === next.rendererPerfLoggingEnabled,
);

const ChecklistSection = memo(
  function ChecklistSection({
    visible,
    expanded,
    checklistState,
    toggleSection,
    rendererPerfLoggingEnabled,
    getStatusIndicator,
    getChecklistStatusLabel,
  }: {
    visible: boolean;
    expanded: boolean;
    checklistState: SessionChecklistState | null;
    toggleSection: () => void;
    rendererPerfLoggingEnabled: boolean;
    getStatusIndicator: (status: string) => React.ReactNode;
    getChecklistStatusLabel: (status: string) => string;
  }) {
    useLanguage();
    if (!visible || !checklistState) return null;
    recordRendererRender(
      "RightPanel.section",
      "checklist",
      rendererPerfLoggingEnabled,
    );
    return (
      <div className="right-panel-section cli-section">
        <button
          type="button"
          className="cli-section-header"
          onClick={toggleSection}
          aria-expanded={expanded}
        >
          <span className="cli-section-prompt">&gt;</span>
          <span className="cli-section-title">
            <span className="terminal-only">
              {translate("rightPanel.checklist.terminalTitle", "CHECKLIST")}
            </span>
            <span className="modern-only">
              {translate("rightPanel.checklist.title", "Checklist")}
            </span>
          </span>
          <span className="cli-section-toggle">
            <span className="terminal-only">{expanded ? "[-]" : "[+]"}</span>
            <span className="modern-only">{expanded ? "−" : "+"}</span>
          </span>
        </button>
        {expanded && (
          <div className="cli-section-content">
            <div className="cli-progress-list">
              {checklistState.items.map((item, index) => (
                <div
                  key={item.id}
                  className={`cli-progress-item ${item.status}`}
                >
                  <span className="cli-progress-num">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span
                    className={`cli-progress-status ${item.status === "blocked" ? "failed" : item.status}`}
                  >
                    {getStatusIndicator(
                      item.status === "blocked" ? "failed" : item.status,
                    )}
                  </span>
                  <span className="cli-progress-text" title={item.title}>
                    {item.title}
                    {item.kind === "verification" ? " [Verification]" : ""}
                  </span>
                  <span className="cli-context-key">
                    {getChecklistStatusLabel(item.status)}
                  </span>
                </div>
              ))}
            </div>
            {checklistState.verificationNudgeNeeded && (
              <p className="cli-hint">
                <span className="terminal-only">
                  {checklistState.nudgeReason ||
                    "Add and run a verification checklist item before finishing."}
                </span>
                <span className="modern-only">
                  {checklistState.nudgeReason ||
                    "Add and run a verification checklist item before finishing."}
                </span>
              </p>
            )}
          </div>
        )}
      </div>
    );
  },
  (prev, next) =>
    prev.visible === next.visible &&
    prev.expanded === next.expanded &&
    getChecklistSignature(prev.checklistState) ===
      getChecklistSignature(next.checklistState) &&
    prev.rendererPerfLoggingEnabled === next.rendererPerfLoggingEnabled,
);

const FolderSection = memo(
  function FolderSection({
    visible,
    expanded,
    files,
    outputSummary,
    highlightedOutputPath,
    workspace,
    filesTitleText,
    toggleSection,
    fileItemRefs,
    onOpenFile,
    rendererPerfLoggingEnabled,
    getFileActionSymbol,
    officeVersionsByPath,
  }: {
    visible: boolean;
    expanded: boolean;
    files: FileInfo[];
    outputSummary: ReturnType<typeof deriveTaskOutputSummaryFromEvents> | null;
    highlightedOutputPath: string | null;
    workspace: Workspace | null;
    filesTitleText: string;
    toggleSection: () => void;
    fileItemRefs: React.MutableRefObject<Map<string, HTMLDivElement | null>>;
    onOpenFile: (path: string) => void;
    rendererPerfLoggingEnabled: boolean;
    getFileActionSymbol: (action: FileInfo["action"]) => string;
    officeVersionsByPath: Map<string, OfficeArtifactVersion>;
  }) {
    useLanguage();
    if (!visible) return null;
    recordRendererRender(
      "RightPanel.section",
      "folder",
      rendererPerfLoggingEnabled,
    );
    const fileCount = files.length || outputSummary?.outputCount || 0;
    const fileCountLabel = translate(
      "rightPanel.files.countLabel",
      "{count} file(s)",
      {
        count: fileCount,
      },
    );
    return (
      <div className="right-panel-section cli-section">
        <button
          type="button"
          className="cli-section-header"
          onClick={toggleSection}
          aria-expanded={expanded}
        >
          <span className="cli-section-prompt">&gt;</span>
          <span className="cli-section-title">
            <span className="terminal-only">{filesTitleText}</span>
            <span className="modern-only">
              {translate("rightPanel.files.title", "Files")}
            </span>
          </span>
          {fileCount > 0 && (
            <span
              className="cli-output-count-badge cli-file-count-badge"
              aria-label={fileCountLabel}
              title={fileCountLabel}
            >
              <span className="cli-file-count-number">{fileCount}</span>
            </span>
          )}
          <span className="cli-section-toggle">
            <span className="terminal-only">{expanded ? "[-]" : "[+]"}</span>
            <span className="modern-only">{expanded ? "−" : "+"}</span>
          </span>
        </button>
        {expanded && (
          <div className="cli-section-content">
            <div className="cli-file-list">
              {files.map((file, index) => {
                const { Icon, label } = getFileTypeIcon(file.path);
                const officeVersion = officeVersionsByPath.get(
                  file.path.replace(/\\/g, "/"),
                );
                return (
                  <div
                    key={`${file.path}-${index}`}
                    ref={(el) => {
                      fileItemRefs.current.set(file.path, el);
                    }}
                    className={`cli-file-item ${file.action} ${outputSummary?.primaryOutputPath === file.path ? "primary-output" : ""} ${highlightedOutputPath === file.path ? "highlight-output" : ""}`}
                  >
                    <span className={`cli-file-action ${file.action}`}>
                      <span className="terminal-only">
                        {getFileActionSymbol(file.action)}
                      </span>
                      <span
                        className="modern-only cli-file-type-icon"
                        aria-label={label}
                        title={label}
                      >
                        <Icon size={16} strokeWidth={2.15} aria-hidden="true" />
                      </span>
                    </span>
                    <ClickableFilePath
                      path={file.path}
                      workspacePath={workspace?.path}
                      className="cli-file-name"
                      onOpenViewer={onOpenFile}
                    />
                    {officeVersion ? (
                      <span
                        className="office-file-delivery-meta"
                        title={translate(
                          "rightPanel.office.generatedBy",
                          "Generated by Office tools",
                        )}
                      >
                        <span>v{officeVersion.version}</span>
                        <span className="office-file-quality-pass">
                          {translate(
                            "rightPanel.office.qualityPassed",
                            "Checked",
                          )}
                        </span>
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>
            {workspace && (
              <div
                className="cli-workspace-path"
                style={{ cursor: "pointer" }}
                onClick={() =>
                  window.electronAPI.openFile(workspace.path, workspace.path)
                }
                title={workspace.path}
              >
                <span className="cli-label">
                  <span className="terminal-only">
                    {translate("rightPanel.files.pwd", "PWD:")}
                  </span>
                  <span className="modern-only">
                    {translate("common.workspace", "Workspace")}
                  </span>
                </span>
                <span className="cli-path">{workspace.name}/</span>
              </div>
            )}
          </div>
        )}
      </div>
    );
  },
  (prev, next) =>
    prev.visible === next.visible &&
    prev.expanded === next.expanded &&
    prev.highlightedOutputPath === next.highlightedOutputPath &&
    prev.workspace?.path === next.workspace?.path &&
    prev.filesTitleText === next.filesTitleText &&
    prev.outputSummary?.primaryOutputPath ===
      next.outputSummary?.primaryOutputPath &&
    prev.outputSummary?.outputCount === next.outputSummary?.outputCount &&
    getFilesSignature(prev.files) === getFilesSignature(next.files) &&
    prev.officeVersionsByPath === next.officeVersionsByPath &&
    prev.onOpenFile === next.onOpenFile &&
    prev.rendererPerfLoggingEnabled === next.rendererPerfLoggingEnabled,
);

function getOfficeFormatPresentation(format: OfficeDeliveryFormat): {
  label: string;
  Icon: ComponentType<LucideProps>;
} {
  switch (format) {
    case "docx":
      return { label: "Word", Icon: FileText };
    case "pptx":
      return { label: "PowerPoint", Icon: Presentation };
    case "xlsx":
      return { label: "Excel", Icon: FileSpreadsheet };
  }
}

function getOfficePhaseLabel(phase: OfficeDeliveryPhase): string {
  const labels: Record<OfficeDeliveryPhase, [string, string]> = {
    planning: ["rightPanel.office.phase.planning", "Planning content"],
    generating: [
      "rightPanel.office.phase.generating",
      "Office tools are generating",
    ],
    validating: ["rightPanel.office.phase.validating", "Checking file"],
    repairing: [
      "rightPanel.office.phase.repairing",
      "Fixing layout or content",
    ],
    ready_to_publish: ["rightPanel.office.phase.ready", "Preparing delivery"],
    published: ["rightPanel.office.phase.published", "Delivered"],
    failed: ["rightPanel.office.phase.failed", "Generation failed"],
    cancelled: ["rightPanel.office.phase.cancelled", "Cancelled"],
  };
  const [key, fallback] = labels[phase];
  return translate(key, fallback);
}

const OfficeDeliveryStatusCard = memo(function OfficeDeliveryStatusCard({
  summary,
  taskId,
  onOpenFile,
}: {
  summary: OfficeDeliverySummary;
  taskId?: string;
  onOpenFile: (path: string) => void;
}) {
  useLanguage();
  const [retrying, setRetrying] = useState(false);
  const failedFormats = summary.formats.filter(
    (item) => item.phase === "failed",
  );
  const title =
    summary.status === "published"
      ? translate("rightPanel.office.group.delivered", "Office files delivered")
      : summary.status === "partial"
        ? translate(
            "rightPanel.office.group.partial",
            "{delivered}/{total} delivered, {failed} failed",
            {
              delivered: summary.deliveredCount,
              total: summary.totalCount,
              failed: summary.failedCount,
            },
          )
        : summary.status === "failed"
          ? translate(
              "rightPanel.office.group.failed",
              "Office file generation failed",
            )
          : summary.status === "cancelled"
            ? translate(
                "rightPanel.office.group.cancelled",
                "Office generation cancelled",
              )
            : translate(
                "rightPanel.office.group.working",
                "Generating {count} Office file(s)",
                { count: summary.totalCount },
              );

  const retryFailed = async () => {
    if (!taskId || failedFormats.length === 0 || retrying) return;
    setRetrying(true);
    const formatNames = failedFormats
      .map((item) => getOfficeFormatPresentation(item.format).label)
      .join(", ");
    try {
      await window.electronAPI.sendMessage(
        taskId,
        translate(
          "rightPanel.office.retryPrompt",
          "Retry only the failed Office formats: {formats}. Reuse the same frozen content snapshot and keep the delivered formats unchanged.",
          { formats: formatNames },
        ),
      );
    } finally {
      setRetrying(false);
    }
  };

  return (
    <section className={`office-delivery-group status-${summary.status}`}>
      <div className="office-delivery-group-header">
        <div>
          <strong>{title}</strong>
          <span>
            {translate(
              "rightPanel.office.generatedBy",
              "Generated by Office tools",
            )}
          </span>
        </div>
        {failedFormats.length > 0 ? (
          <button
            type="button"
            className="office-delivery-retry"
            disabled={!taskId || retrying}
            onClick={() => void retryFailed()}
          >
            {retrying
              ? translate("rightPanel.office.retrying", "Retrying")
              : translate("rightPanel.office.retryFailed", "Retry failed only")}
          </button>
        ) : null}
      </div>
      <div className="office-delivery-formats">
        {summary.formats.map((item) => {
          const { Icon, label } = getOfficeFormatPresentation(item.format);
          return (
            <div
              key={item.format}
              className={`office-delivery-format phase-${item.phase}`}
            >
              <Icon size={15} strokeWidth={1.9} aria-hidden="true" />
              <span className="office-delivery-format-name">{label}</span>
              <span className="office-delivery-phase">
                {getOfficePhaseLabel(item.phase)}
              </span>
              {item.version ? (
                <span className="office-delivery-version">v{item.version}</span>
              ) : null}
              {item.diagnosticCode ? (
                <span
                  className="office-delivery-diagnostic"
                  title={item.diagnosticCode}
                >
                  {translate("rightPanel.office.diagnostic", "Diagnostic")}:{" "}
                  {item.diagnosticCode}
                </span>
              ) : null}
              {item.versions.length > 1 ? (
                <details className="office-delivery-version-menu">
                  <summary>
                    {translate("rightPanel.office.versions", "Versions")}
                  </summary>
                  <div className="office-delivery-version-list">
                    {item.versions.map((version) => (
                      <button
                        type="button"
                        key={version.artifactId}
                        onClick={() => onOpenFile(version.path)}
                        title={version.path}
                      >
                        <span>v{version.version}</span>
                        <span>{version.path.split(/[\\/]/).pop()}</span>
                      </button>
                    ))}
                  </div>
                </details>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
});

const ActiveContextSection = memo(
  function ActiveContextSection({
    visible,
    expanded,
    connectedActiveConnectors,
    activeContextTitleText,
    connectorsLabel,
    toggleSection,
    rendererPerfLoggingEnabled,
  }: {
    visible: boolean;
    expanded: boolean;
    connectedActiveConnectors: {
      id: string;
      name: string;
      icon: string;
      status: string;
      tools: string[];
    }[];
    activeContextTitleText: string;
    connectorsLabel: string;
    toggleSection: () => void;
    rendererPerfLoggingEnabled: boolean;
  }) {
    useLanguage();
    if (!visible || connectedActiveConnectors.length === 0) return null;
    recordRendererRender(
      "RightPanel.section",
      "activeContext",
      rendererPerfLoggingEnabled,
    );
    return (
      <div className="right-panel-section cli-section">
        <button
          type="button"
          className="cli-section-header"
          onClick={toggleSection}
          aria-expanded={expanded}
        >
          <span className="cli-section-prompt">&gt;</span>
          <span className="cli-section-title">
            <span className="terminal-only">
              {translate("rightPanel.activeContext.terminalTitle", "ACTIVE")}
            </span>
            <span className="modern-only">{activeContextTitleText}</span>
          </span>
          <span className="cli-active-context-badge">
            {connectedActiveConnectors.length}
          </span>
          <span className="cli-section-toggle">
            <span className="terminal-only">{expanded ? "[-]" : "[+]"}</span>
            <span className="modern-only">{expanded ? "−" : "+"}</span>
          </span>
        </button>
        {expanded && (
          <div className="cli-section-content">
            <div className="cli-context-list">
              <div className="cli-context-group">
                <div className="cli-context-label">
                  <span className="terminal-only"># connectors:</span>
                  <span className="modern-only">{connectorsLabel}</span>
                </div>
                <div className="cli-active-context-scroll">
                  {connectedActiveConnectors.map((connector) => {
                    const ConnectorIcon = resolveConnectorLucideIcon(
                      connector.name,
                      connector.icon,
                    );
                    return (
                      <div key={connector.id} className="cli-context-item">
                        <span className="cli-active-context-icon">
                          <ConnectorIcon size={14} />
                        </span>
                        <span className="cli-context-key">
                          {connector.name}
                        </span>
                        <span className="cli-active-context-status connected" />
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  },
  (prev, next) =>
    prev.visible === next.visible &&
    prev.expanded === next.expanded &&
    prev.activeContextTitleText === next.activeContextTitleText &&
    prev.connectorsLabel === next.connectorsLabel &&
    getConnectorsSignature(prev.connectedActiveConnectors) ===
      getConnectorsSignature(next.connectedActiveConnectors) &&
    prev.rendererPerfLoggingEnabled === next.rendererPerfLoggingEnabled,
);

const ContextSection = memo(
  function ContextSection({
    visible,
    expanded,
    usedSkills,
    toolUsage,
    referencedFiles,
    workspace,
    contextTitleText,
    skillsUsedLabel,
    toolsUsedLabel,
    filesReadLabel,
    toggleSection,
    setViewerFilePath,
    rendererPerfLoggingEnabled,
  }: {
    visible: boolean;
    expanded: boolean;
    usedSkills: string[];
    toolUsage: ToolUsage[];
    referencedFiles: string[];
    workspace: Workspace | null;
    contextTitleText: string;
    skillsUsedLabel: string;
    toolsUsedLabel: string;
    filesReadLabel: string;
    toggleSection: () => void;
    setViewerFilePath: React.Dispatch<React.SetStateAction<string | null>>;
    rendererPerfLoggingEnabled: boolean;
  }) {
    if (!visible) return null;
    recordRendererRender(
      "RightPanel.section",
      "context",
      rendererPerfLoggingEnabled,
    );
    return (
      <div className="right-panel-section cli-section">
        <button
          type="button"
          className="cli-section-header"
          onClick={toggleSection}
          aria-expanded={expanded}
        >
          <span className="cli-section-prompt">&gt;</span>
          <span className="cli-section-title">
            <span className="terminal-only">{contextTitleText}</span>
            <span className="modern-only">{contextTitleText}</span>
          </span>
          <span className="cli-section-toggle">
            <span className="terminal-only">{expanded ? "[-]" : "[+]"}</span>
            <span className="modern-only">{expanded ? "−" : "+"}</span>
          </span>
        </button>
        {expanded && (
          <div className="cli-section-content">
            <div className="cli-context-list">
              {usedSkills.length > 0 && (
                <div className="cli-context-group">
                  <div className="cli-context-label">
                    <span className="terminal-only"># skills_used:</span>
                    <span className="modern-only">{skillsUsedLabel}</span>
                  </div>
                  {usedSkills.map((skill, index) => (
                    <div key={`${skill}-${index}`} className="cli-context-item">
                      <span className="cli-context-key">{skill}</span>
                    </div>
                  ))}
                </div>
              )}
              {toolUsage.length > 0 && (
                <div className="cli-context-group">
                  <div className="cli-context-label">
                    <span className="terminal-only"># tools_used:</span>
                    <span className="modern-only">{toolsUsedLabel}</span>
                  </div>
                  <div className="cli-context-tool-usage-list">
                    {toolUsage.map((tool, index) => (
                      <div
                        key={`${tool.name}-${index}`}
                        className="cli-context-item"
                      >
                        <span className="cli-context-key">{tool.name}</span>
                        <span className="cli-context-sep">:</span>
                        <span className="cli-context-val">{tool.count}x</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {referencedFiles.length > 0 && (
                <div className="cli-context-group">
                  <div className="cli-context-label">
                    <span className="terminal-only"># files_read:</span>
                    <span className="modern-only">{filesReadLabel}</span>
                  </div>
                  {referencedFiles.map((file, index) => (
                    <div key={`${file}-${index}`} className="cli-context-item">
                      <ClickableFilePath
                        path={file}
                        workspacePath={workspace?.path}
                        className="cli-context-file"
                        onOpenViewer={setViewerFilePath}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  },
  (prev, next) =>
    prev.visible === next.visible &&
    prev.expanded === next.expanded &&
    prev.workspace?.path === next.workspace?.path &&
    prev.contextTitleText === next.contextTitleText &&
    prev.skillsUsedLabel === next.skillsUsedLabel &&
    prev.toolsUsedLabel === next.toolsUsedLabel &&
    prev.filesReadLabel === next.filesReadLabel &&
    getStringListSignature(prev.usedSkills) ===
      getStringListSignature(next.usedSkills) &&
    getToolUsageSignature(prev.toolUsage) ===
      getToolUsageSignature(next.toolUsage) &&
    getStringListSignature(prev.referencedFiles) ===
      getStringListSignature(next.referencedFiles) &&
    prev.rendererPerfLoggingEnabled === next.rendererPerfLoggingEnabled,
);

const CollaborativeAgentsSection = memo(
  function CollaborativeAgentsSection({
    visible,
    expanded,
    totals,
    toggleSection,
    onSelectTask,
    rendererPerfLoggingEnabled,
  }: {
    visible: boolean;
    expanded: boolean;
    totals: CollaborativeAgentTotals | null;
    toggleSection: () => void;
    onSelectTask?: (taskId: string) => void;
    rendererPerfLoggingEnabled?: boolean;
  }) {
    useLanguage();
    recordRendererRender(
      "CollaborativeAgentsSection",
      `visible:${visible}:expanded:${expanded}`,
      rendererPerfLoggingEnabled,
    );
    if (!visible || !totals) return null;

    const totalTokens = totals.inputTokens + totals.outputTokens;
    const statusSummary = [
      totals.completed > 0
        ? translate("rightPanel.subAgents.status.done", "{count} done", {
            count: totals.completed,
          })
        : null,
      totals.warning > 0
        ? translate("rightPanel.subAgents.status.warning", "{count} warning", {
            count: totals.warning,
          })
        : null,
      totals.failed > 0
        ? translate("rightPanel.subAgents.status.failed", "{count} failed", {
            count: totals.failed,
          })
        : null,
      totals.running > 0
        ? translate("rightPanel.subAgents.status.running", "{count} running", {
            count: totals.running,
          })
        : null,
      totals.pending > 0
        ? translate("rightPanel.subAgents.status.pending", "{count} pending", {
            count: totals.pending,
          })
        : null,
    ]
      .filter(Boolean)
      .join(" · ");

    return (
      <div className="right-panel-section cli-section collaborative-agents-section">
        <button
          type="button"
          className="cli-section-header"
          onClick={toggleSection}
          aria-expanded={expanded}
        >
          <span className="cli-section-prompt">&gt;</span>
          <span className="cli-section-title">
            <span className="terminal-only">
              {translate("rightPanel.subAgents.terminalTitle", "SUB_AGENTS")}
            </span>
            <span className="modern-only">
              {translate("rightPanel.subAgents.title", "Sub Agents")}
            </span>
          </span>
          <span className="cli-active-context-badge">{totals.total}</span>
          <span className="cli-section-toggle">
            <span className="terminal-only">{expanded ? "[-]" : "[+]"}</span>
            <span className="modern-only">{expanded ? "−" : "+"}</span>
          </span>
        </button>
        {expanded && (
          <div className="cli-section-content">
            <div className="collab-agents-summary-card">
              <div className="collab-agents-summary-head">
                <strong>
                  {translate(
                    "rightPanel.subAgents.backgroundCount",
                    "{count} background agents",
                    {
                      count: totals.total,
                    },
                  )}
                </strong>
                <span>
                  {statusSummary ||
                    translate("rightPanel.subAgents.noStatus", "No status yet")}
                </span>
              </div>
              <div
                className="collab-agents-stat-grid"
                aria-label={translate(
                  "rightPanel.subAgents.totalsAria",
                  "Sub-agent totals",
                )}
              >
                <div>
                  <span>
                    {translate("rightPanel.subAgents.runtime", "Runtime")}
                  </span>
                  <strong>
                    {formatRightPanelDuration(totals.wallDurationMs)}
                  </strong>
                </div>
                <div>
                  <span>
                    {translate("rightPanel.subAgents.events", "Events")}
                  </span>
                  <strong>{formatCompactNumber(totals.eventCount)}</strong>
                </div>
                <div>
                  <span>
                    {translate("rightPanel.subAgents.tools", "Tools")}
                  </span>
                  <strong>{formatCompactNumber(totals.toolCallCount)}</strong>
                </div>
                <div>
                  <span>
                    {translate("rightPanel.subAgents.llmCalls", "LLM calls")}
                  </span>
                  <strong>{formatCompactNumber(totals.llmCallCount)}</strong>
                </div>
                <div>
                  <span>
                    {translate("rightPanel.subAgents.tokens", "Tokens")}
                  </span>
                  <strong>{formatCompactNumber(totalTokens)}</strong>
                </div>
                <div>
                  <span>{translate("rightPanel.subAgents.cost", "Cost")}</span>
                  <strong>{formatCost(totals.cost)}</strong>
                </div>
              </div>
            </div>
            <div className="collab-agents-list">
              {totals.rows.map((row) => (
                <div
                  key={row.task.id}
                  className={`collab-agent-summary-row ${row.statusKind}`}
                >
                  <div className="collab-agent-summary-main">
                    <span
                      className="collab-agent-summary-title"
                      title={row.task.title}
                    >
                      {
                        getLocalizedSubagentDisplay(
                          stripInlineMarkdownFormatting(
                            row.task.title ||
                              row.task.prompt ||
                              translate(
                                "rightPanel.subAgents.fallbackName",
                                "Sub agent",
                              ),
                          ),
                        ).name
                      }
                    </span>
                  </div>
                  <div className="collab-agent-summary-meta">
                    <span>{formatRightPanelDuration(row.durationMs)}</span>
                    <span>
                      {translate(
                        "rightPanel.subAgents.toolCount",
                        "{count} tools",
                        {
                          count: formatCompactNumber(row.toolCallCount),
                        },
                      )}
                    </span>
                    <span>
                      {translate(
                        "rightPanel.subAgents.tokenShortCount",
                        "{count} tok",
                        {
                          count: formatCompactNumber(
                            row.usage.inputTokens + row.usage.outputTokens,
                          ),
                        },
                      )}
                    </span>
                  </div>
                  <span
                    className={`collab-agent-summary-status ${row.statusKind}`}
                  >
                    {row.statusLabel}
                  </span>
                  {onSelectTask ? (
                    <button
                      type="button"
                      className="collab-agent-open-task"
                      onClick={() => onSelectTask(row.task.id)}
                    >
                      {translate("common.open", "Open")}
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  },
  (prev, next) =>
    prev.visible === next.visible &&
    prev.expanded === next.expanded &&
    prev.totals === next.totals &&
    prev.onSelectTask === next.onSelectTask &&
    prev.rendererPerfLoggingEnabled === next.rendererPerfLoggingEnabled,
);

function RightPanelComponent({
  task,
  workspace,
  events: rawEvents,
  sharedTaskEventUi = null,
  hasActiveChildren = false,
  childTasks = [],
  childEvents = [],
  runningTasks = [],
  queuedTasks = [],
  queueStatus,
  onSelectTask,
  onCancelTask,
  onOpenSpreadsheetArtifact,
  onOpenDocumentArtifact,
  onOpenPresentationArtifact,
  onOpenWebArtifact,
  rendererPerfLoggingEnabled = false,
  highlightOutputPath = null,
  onHighlightConsumed,
}: RightPanelProps) {
  recordRendererRender(
    "RightPanel",
    task?.id ? `task:${task.id}` : "task:none",
    rendererPerfLoggingEnabled,
  );
  const events = useMemo(() => {
    if (sharedTaskEventUi) {
      return sharedTaskEventUi.normalizedEvents;
    }
    return measureRendererPerf(
      "RightPanel.normalizeEvents",
      rendererPerfLoggingEnabled,
      () => normalizeEventsForTimelineUi(rawEvents),
    );
  }, [rawEvents, rendererPerfLoggingEnabled, sharedTaskEventUi]);
  const officeDeliverySummary = useMemo(
    () => deriveOfficeArtifactDelivery(events),
    [events],
  );
  const officeVersionsByPath = useMemo(
    () => mapOfficeVersionsByPath(officeDeliverySummary),
    [officeDeliverySummary],
  );
  const [expandedSections, setExpandedSections] = useState({
    progress: true,
    checklist: true,
    collaborativeAgents: true,
    queue: true,
    folder: true,
    activeContext: true,
    context: true,
  });
  const [expandedTopSections, setExpandedTopSections] =
    useState<RightPanelTopSectionState>(() =>
      task?.id
        ? rightPanelTopSectionCache.get(task.id) ||
          getDefaultTopSectionState(task, false)
        : getDefaultTopSectionState(task, false),
    );
  const [viewerFilePath, setViewerFilePath] = useState<string | null>(null);
  const [highlightedOutputPath, setHighlightedOutputPath] = useState<
    string | null
  >(null);
  const [taskFeedbackDecision, setTaskFeedbackDecision] = useState<
    "accepted" | "rejected" | null
  >(null);
  const [taskFeedbackDismissed, setTaskFeedbackDismissed] = useState(false);
  const fileItemRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());
  useLanguage();
  const agentContext = useAgentContext();
  const openFileFromFilesSection = useCallback(
    (filePath: string) => {
      openPreviewableFileInSidebar(
        filePath,
        {
          html: onOpenWebArtifact,
          spreadsheet: onOpenSpreadsheetArtifact,
          document: onOpenDocumentArtifact,
          presentation: onOpenPresentationArtifact,
        },
        setViewerFilePath,
      );
    },
    [
      onOpenDocumentArtifact,
      onOpenPresentationArtifact,
      onOpenSpreadsheetArtifact,
      onOpenWebArtifact,
    ],
  );

  // Queue data
  const progressTitleText = agentContext.getUiCopy("rightProgressTitle");
  const progressEmptyHintText = agentContext.getUiCopy(
    "rightProgressEmptyHint",
  );
  const queueTitleText = translate("rightPanel.waitingQueue", "Waiting queue");
  const queueActiveLabel = agentContext.getUiCopy("rightQueueActiveLabel");
  const queueNextLabel = agentContext.getUiCopy("rightQueueNextLabel");
  const filesTitleText = agentContext.getUiCopy("rightFilesTitle");
  const activeModernLabel = translate("rightPanel.active", "Active");
  const nextModernLabel = translate("rightPanel.upNext", "Up next");
  const cancelLabel = translate("rightPanel.cancel", "Cancel");
  const queueBadgeText = String(queuedTasks.length);

  const toggleSection = useCallback(
    (section: keyof typeof expandedSections) => {
      setExpandedSections((prev) => ({
        ...prev,
        [section]: !prev[section],
      }));
    },
    [],
  );

  const toggleTopSection = useCallback(
    (section: RightPanelTopSection) => {
      setExpandedTopSections((previous) => {
        const next = { ...previous, [section]: !previous[section] };
        if (task?.id) rememberTopSectionState(task.id, next);
        return next;
      });
    },
    [task?.id],
  );

  // Extract plan steps from events
  const planSteps = useMemo((): PlanStep[] => {
    if (sharedTaskEventUi) return sharedTaskEventUi.planSteps;
    return measureRendererPerf(
      "RightPanel.planSteps",
      rendererPerfLoggingEnabled,
      () => {
        const planEvent = events.find(
          (event) => getEffectiveTaskEventType(event) === "plan_created",
        );
        if (!planEvent?.payload?.plan?.steps) return [];

        const steps = [...planEvent.payload.plan.steps];

        events.forEach((event) => {
          const effectiveType = getEffectiveTaskEventType(event);
          if (effectiveType === "step_started" && event.payload.step) {
            const step = steps.find((s) => s.id === event.payload.step.id);
            if (step) step.status = "in_progress";
          }
          if (effectiveType === "step_completed" && event.payload.step) {
            const step = steps.find((s) => s.id === event.payload.step.id);
            if (step) step.status = "completed";
          }
          if (effectiveType === "step_failed" && event.payload.step) {
            const step = steps.find((s) => s.id === event.payload.step.id);
            if (step) {
              step.status = "failed";
              if (event.payload.reason && !step.error)
                step.error = String(event.payload.reason);
            }
          }
          if (effectiveType === "step_skipped" && event.payload.step) {
            const step = steps.find((s) => s.id === event.payload.step.id);
            if (step) step.status = "skipped";
          }
        });

        return steps.filter(
          (step) =>
            !isVerificationStepDescription(step.description) ||
            step.status === "failed",
        );
      },
    );
  }, [events, sharedTaskEventUi, rendererPerfLoggingEnabled]);
  const progressMaterialSignature = useMemo(
    () =>
      getProgressSectionMaterialSignature({
        expanded: expandedSections.progress,
        planSteps,
        taskStatus: task?.status,
        taskTerminalStatus: task?.terminalStatus,
        hasActiveChildren,
        emptyHintText: progressEmptyHintText,
      }),
    [
      expandedSections.progress,
      planSteps,
      task?.status,
      task?.terminalStatus,
      hasActiveChildren,
      progressEmptyHintText,
    ],
  );
  const deferredProgressMaterialSignature = useDeferredValue(
    progressMaterialSignature,
  );
  const stableProgressPlanSteps = useStableSnapshotBySignature(
    planSteps,
    deferredProgressMaterialSignature,
  );

  const checklistState = useMemo((): SessionChecklistState | null => {
    if (sharedTaskEventUi) return sharedTaskEventUi.checklistState;
    return measureRendererPerf(
      "RightPanel.checklistState",
      rendererPerfLoggingEnabled,
      () => {
        const normalizeChecklistState = (
          payload: Any,
        ): SessionChecklistState | null => {
          const checklist =
            payload?.checklist && typeof payload.checklist === "object"
              ? payload.checklist
              : null;
          if (!checklist || !Array.isArray(checklist.items)) return null;

          const items: SessionChecklistItem[] = checklist.items
            .filter((item: Any) => item && typeof item === "object")
            .map((item: Any) => ({
              id: typeof item.id === "string" ? item.id : "",
              title: typeof item.title === "string" ? item.title : "",
              kind:
                item.kind === "verification" || item.kind === "other"
                  ? item.kind
                  : "implementation",
              status:
                item.status === "in_progress" ||
                item.status === "completed" ||
                item.status === "blocked"
                  ? item.status
                  : "pending",
              createdAt:
                typeof item.createdAt === "number" ? item.createdAt : 0,
              updatedAt:
                typeof item.updatedAt === "number" ? item.updatedAt : 0,
            }))
            .filter((item: SessionChecklistItem) =>
              Boolean(item.id && item.title),
            );

          return {
            items,
            updatedAt:
              typeof checklist.updatedAt === "number" ? checklist.updatedAt : 0,
            verificationNudgeNeeded: checklist.verificationNudgeNeeded === true,
            nudgeReason:
              typeof checklist.nudgeReason === "string" &&
              checklist.nudgeReason.trim().length > 0
                ? checklist.nudgeReason
                : null,
          };
        };

        for (const event of [...events].reverse()) {
          const effectiveType = getEffectiveTaskEventType(event);
          if (
            effectiveType === "task_list_created" ||
            effectiveType === "task_list_updated" ||
            effectiveType === "task_list_verification_nudged" ||
            event.type === "conversation_snapshot"
          ) {
            const state = normalizeChecklistState(event.payload);
            if (state) return state;
          }
        }

        return null;
      },
    );
  }, [events, sharedTaskEventUi, rendererPerfLoggingEnabled]);

  // Extract files from events
  const files = useMemo((): FileInfo[] => {
    if (sharedTaskEventUi) return sharedTaskEventUi.files;
    const fileMap = new Map<string, FileInfo>();

    // Normalize to a consistent relative path key for deduplication.
    // Two events may emit the same file as an absolute path and a relative path.
    const normalizePathKey = (p: string): string => {
      return normalizeArtifactPathForWorkspace(p, workspace?.path);
    };

    events.forEach((event) => {
      const effectiveType = getEffectiveTaskEventType(event);
      if (
        String(event.payload?.source || "").trim().toLowerCase() ===
          "artifact_bootstrap" ||
        event.payload?.provisional === true
      ) {
        return;
      }
      if (effectiveType === "file_created" && event.payload.path) {
        if (event.payload.type === "directory") return;
        const key = normalizePathKey(event.payload.path);
        if (!isUserVisibleTaskArtifactPath(key)) return;
        fileMap.set(key, {
          path: key,
          action: "created",
          timestamp: event.timestamp,
        });
      }
      if (
        effectiveType === "file_modified" &&
        (event.payload.path || event.payload.from)
      ) {
        const raw = event.payload.path || event.payload.from;
        const key = normalizePathKey(raw);
        if (!isUserVisibleTaskArtifactPath(key)) return;
        fileMap.set(key, {
          path: key,
          action: "modified",
          timestamp: event.timestamp,
        });
      }
      if (effectiveType === "file_deleted" && event.payload.path) {
        const key = normalizePathKey(event.payload.path);
        if (!isUserVisibleTaskArtifactPath(key)) return;
        fileMap.set(key, {
          path: key,
          action: "deleted",
          timestamp: event.timestamp,
        });
      }
      if (effectiveType === "artifact_created" && event.payload.path) {
        const key = normalizePathKey(event.payload.path);
        if (!isUserVisibleTaskArtifactPath(key)) return;
        fileMap.set(key, {
          path: key,
          action: "created",
          timestamp: event.timestamp,
        });
      }
    });

    const latestCompletionEvent = [...events]
      .reverse()
      .find((event) => getEffectiveTaskEventType(event) === "task_completed");
    const completionOutputSummary = resolvePreferredTaskOutputSummary({
      task,
      latestCompletionEvent,
      fallbackEvents: events,
    });
    if (hasTaskOutputs(completionOutputSummary)) {
      const modifiedFallbackSet = new Set(
        completionOutputSummary.modifiedFallback || [],
      );
      const completionOutputPaths =
        completionOutputSummary.created.length > 0
          ? completionOutputSummary.created
          : completionOutputSummary.modifiedFallback || [];
      completionOutputPaths.forEach((outputPath, index) => {
        const key = normalizePathKey(outputPath);
        if (!isUserVisibleTaskArtifactPath(key)) return;
        if (fileMap.has(key)) return;
        fileMap.set(key, {
          path: key,
          action: modifiedFallbackSet.has(outputPath) ? "modified" : "created",
          timestamp: (latestCompletionEvent?.timestamp || Date.now()) - index,
        });
      });
    }

    return Array.from(fileMap.values())
      .filter((f) => !f.path.endsWith("/") && !f.path.endsWith("\\"))
      .sort((a, b) => b.timestamp - a.timestamp);
  }, [events, sharedTaskEventUi, task, workspace]);
  const outputSummary = useMemo(() => {
    if (sharedTaskEventUi) return sharedTaskEventUi.outputSummary;
    const latestCompletionEvent = [...events]
      .reverse()
      .find((event) => getEffectiveTaskEventType(event) === "task_completed");
    return (
      resolvePreferredTaskOutputSummary({
        task,
        latestCompletionEvent,
        fallbackEvents: events,
      }) || deriveTaskOutputSummaryFromEvents(events)
    );
  }, [events, sharedTaskEventUi, task]);

  useEffect(() => {
    if (!task?.id) return;
    const remembered = rightPanelTopSectionCache.get(task.id);
    setExpandedTopSections(
      remembered ||
        getDefaultTopSectionState(task, hasTaskOutputs(outputSummary)),
    );
  }, [
    task?.id,
    task?.status,
    task?.terminalStatus,
    outputSummary?.outputCount,
  ]);

  useEffect(() => {
    const onOpenSection = (event: Event) => {
      const requested = (event as CustomEvent<{ section?: string }>).detail
        ?.section;
      const section: RightPanelTopSection =
        requested === "progress" || requested === "process"
          ? "process"
          : requested === "artifacts" || requested === "overview"
            ? "overview"
            : "resources";
      setExpandedTopSections((previous) => {
        if (previous[section]) return previous;
        const next = { ...previous, [section]: true };
        if (task?.id) rememberTopSectionState(task.id, next);
        return next;
      });
      window.setTimeout(() => {
        document
          .querySelector<HTMLElement>(`[data-right-panel-section="${section}"]`)
          ?.scrollIntoView({ block: "nearest" });
      }, 0);
    };
    window.addEventListener("right-panel:open-section", onOpenSection);
    return () =>
      window.removeEventListener("right-panel:open-section", onOpenSection);
  }, [task?.id]);

  useEffect(() => {
    if (!highlightOutputPath) return;

    setExpandedSections((prev) =>
      prev.folder ? prev : { ...prev, folder: true },
    );
    setExpandedTopSections((previous) => {
      if (previous.overview) return previous;
      const next = { ...previous, overview: true };
      if (task?.id) rememberTopSectionState(task.id, next);
      return next;
    });
    const targetEl = fileItemRefs.current.get(highlightOutputPath);
    if (!targetEl) return;

    const reduceMotion = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    targetEl.scrollIntoView({
      block: "nearest",
      behavior: reduceMotion ? "auto" : "smooth",
    });
    setHighlightedOutputPath(highlightOutputPath);
    onHighlightConsumed?.();

    const timer = setTimeout(() => {
      setHighlightedOutputPath((prev) =>
        prev === highlightOutputPath ? null : prev,
      );
    }, 2200);
    return () => clearTimeout(timer);
  }, [highlightOutputPath, files.length, task?.id]);

  useEffect(() => {
    setTaskFeedbackDecision(null);
    setTaskFeedbackDismissed(false);
  }, [task?.id]);

  const handleTaskFeedback = useCallback(
    async (decision: "accepted" | "rejected") => {
      if (!task?.id) return;
      setTaskFeedbackDecision(decision);
      try {
        await window.electronAPI.submitMessageFeedback({
          taskId: task.id,
          decision,
          kind: "task",
        });
      } catch (err) {
        console.error("[Feedback] Failed to submit task feedback:", err);
      }
    },
    [task?.id],
  );

  const isLiveExecutionMode =
    task?.status === "executing" ||
    (task?.status === "completed" && hasActiveChildren);
  const checklistSignature = useMemo(
    () => getChecklistSignature(checklistState),
    [checklistState],
  );
  const deferredChecklistSignature = useDeferredValue(checklistSignature);
  const stableChecklistState = useStableSnapshotBySignature(
    checklistState,
    isLiveExecutionMode ? deferredChecklistSignature : checklistSignature,
  );
  const filesSignature = useMemo(() => getFilesSignature(files), [files]);
  const deferredFilesSignature = useDeferredValue(filesSignature);
  const stableFiles = useStableSnapshotBySignature(
    files,
    isLiveExecutionMode ? deferredFilesSignature : filesSignature,
  );
  const showChecklistSection =
    !!stableChecklistState && stableChecklistState.items.length > 0;
  const collaborativeAgentTotals = useMemo(
    () => getCollaborativeAgentTotals(childTasks, childEvents),
    [childTasks, childEvents],
  );
  const showCollaborativeAgentsSection = Boolean(
    collaborativeAgentTotals &&
    (childTasks.length > 0 ||
      task?.agentConfig?.collaborativeMode ||
      task?.agentConfig?.multiLlmMode),
  );
  const showQueueSection = queuedTasks.length > 0;
  const showFolderSection = stableFiles.length > 0;
  const fallbackProgressText = useMemo(() => {
    const activeChecklistItem = stableChecklistState?.items.find(
      (item) => item.status === "in_progress",
    );
    if (activeChecklistItem) return activeChecklistItem.title;

    const latestActivityText = getTaskEventActivityText(
      sharedTaskEventUi?.latestVisibleTaskEvent ?? null,
    );
    if (latestActivityText) return latestActivityText;

    const pendingChecklistItem = stableChecklistState?.items.find(
      (item) => item.status === "pending",
    );
    if (pendingChecklistItem) {
      return translate("rightPanel.upNextItem", "Up next: {title}", {
        title: pendingChecklistItem.title,
      });
    }

    return null;
  }, [sharedTaskEventUi?.latestVisibleTaskEvent, stableChecklistState]);
  const queueMaterialSignature = useMemo(
    () =>
      getQueueSectionMaterialSignature({
        expanded: expandedSections.queue,
        runningTasks: NO_RUNNING_QUEUE_TASKS,
        queuedTasks,
        activeLabel: queueActiveLabel,
        nextLabel: queueNextLabel,
      }),
    [expandedSections.queue, queuedTasks, queueActiveLabel, queueNextLabel],
  );
  const deferredQueueMaterialSignature = useDeferredValue(
    queueMaterialSignature,
  );
  const stableQueuedTasks = useStableSnapshotBySignature(
    queuedTasks,
    deferredQueueMaterialSignature,
  );

  // Get status indicator (terminal vs modern)
  const getStatusIndicator = (status: string) => {
    switch (status) {
      case "completed":
        return (
          <>
            <span className="terminal-only">[✓]</span>
            <span className="modern-only">
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </span>
          </>
        );
      case "in_progress":
        return (
          <>
            <span className="terminal-only">[~]</span>
            <span className="modern-only">
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
              </svg>
            </span>
          </>
        );
      case "failed":
        return (
          <>
            <span className="terminal-only">[✗]</span>
            <span className="modern-only">
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </span>
          </>
        );
      case "skipped":
        return (
          <>
            <span className="terminal-only">[→]</span>
            <span className="modern-only">
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="5 4 15 12 5 20" />
                <line x1="19" y1="4" x2="19" y2="20" />
              </svg>
            </span>
          </>
        );
      default:
        return (
          <>
            <span className="terminal-only">[ ]</span>
            <span className="modern-only">
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" opacity="0.3" />
              </svg>
            </span>
          </>
        );
    }
  };

  const getFileActionSymbol = (action: FileInfo["action"]) => {
    switch (action) {
      case "created":
        return "+";
      case "modified":
        return "~";
      case "deleted":
        return "-";
    }
  };

  const getChecklistStatusLabel = (status: string) => {
    switch (status) {
      case "in_progress":
        return translate("rightPanel.status.inProgress", "In progress");
      case "completed":
        return translate("rightPanel.status.completed", "Completed");
      case "blocked":
        return translate("rightPanel.status.blocked", "Blocked");
      default:
        return translate("rightPanel.status.pending", "Pending");
    }
  };

  const preservedOutputsTooltip = translate(
    "rightPanel.preserved.tooltip",
    "Completed with preserved outputs. NeoWorker kept the files and summary it produced, even though some checks or steps did not fully finish.",
  );
  const overviewSummary = task?.semanticSummary || task?.resultSummary || null;
  const artifactCount = outputSummary?.outputCount || stableFiles.length;
  const completedProcessSteps = stableProgressPlanSteps.filter(
    (step) => step.status === "completed",
  ).length;
  const processDetail =
    stableProgressPlanSteps.length > 0
      ? `${completedProcessSteps}/${stableProgressPlanSteps.length}`
      : undefined;

  return (
    <div className="right-panel cli-panel right-panel-v2">
      <RightPanelTopLevelSection
        section="overview"
        title={translate("rightPanel.overview", "Overview")}
        detail={
          artifactCount > 0
            ? translate("rightPanel.artifactCount", "{count} artifacts", {
                count: artifactCount,
              })
            : undefined
        }
        expanded={expandedTopSections.overview}
        onToggle={() => toggleTopSection("overview")}
      >
        <div className="right-panel-overview-summary">
          <span className="right-panel-overview-kicker">
            {translate("rightPanel.resultSummary", "Result summary")}
          </span>
          <p>
            {overviewSummary ||
              translate(
                "rightPanel.resultPending",
                "The result summary will appear here as the task progresses.",
              )}
          </p>
          {outputSummary?.primaryOutputPath ? (
            <button
              type="button"
              onClick={() =>
                openFileFromFilesSection(outputSummary.primaryOutputPath!)
              }
              title={outputSummary.primaryOutputPath}
            >
              <FileIcon size={14} aria-hidden="true" />
              <span>
                {outputSummary.primaryOutputPath.split(/[\\/]/).pop()}
              </span>
            </button>
          ) : null}
          {task?.verificationVerdict ? (
            <div className="right-panel-verification-result">
              <Shield size={14} aria-hidden="true" />
              <span>
                {translate("rightPanel.verification", "Verification")}
              </span>
              <strong>
                {String(task.verificationVerdict).replaceAll("_", " ")}
              </strong>
            </div>
          ) : null}
        </div>

        {officeDeliverySummary ? (
          <OfficeDeliveryStatusCard
            summary={officeDeliverySummary}
            taskId={task?.id}
            onOpenFile={openFileFromFilesSection}
          />
        ) : null}

        <FolderSection
          visible={showFolderSection}
          expanded={expandedSections.folder}
          files={stableFiles}
          outputSummary={outputSummary}
          highlightedOutputPath={highlightedOutputPath}
          workspace={workspace}
          filesTitleText={filesTitleText}
          toggleSection={() => toggleSection("folder")}
          fileItemRefs={fileItemRefs}
          onOpenFile={openFileFromFilesSection}
          rendererPerfLoggingEnabled={rendererPerfLoggingEnabled}
          getFileActionSymbol={getFileActionSymbol}
          officeVersionsByPath={officeVersionsByPath}
        />

        {task?.status === "completed" &&
          !hasActiveChildren &&
          !taskFeedbackDismissed && (
            <div className="right-panel-section cli-section right-panel-feedback-section">
              <div className="cli-section-content">
                <div className="right-panel-feedback-card">
                  <div className="right-panel-feedback-copy">
                    <strong>
                      {translate(
                        "rightPanel.feedback.title",
                        "Rate this result",
                      )}
                    </strong>
                    <span className="right-panel-feedback-detail">
                      {translate(
                        "rightPanel.feedback.detail",
                        "Helps improve this agent and persona.",
                      )}
                    </span>
                  </div>
                  <div className="right-panel-feedback-actions">
                    <button
                      type="button"
                      className={`message-feedback-btn right-panel-feedback-btn${taskFeedbackDecision === "accepted" ? " active" : ""}`}
                      onClick={() => void handleTaskFeedback("accepted")}
                      title={translate(
                        "rightPanel.feedback.upTitle",
                        "This task result was helpful",
                      )}
                    >
                      {translate("rightPanel.feedback.up", "Up")}
                    </button>
                    <button
                      type="button"
                      className={`message-feedback-btn right-panel-feedback-btn${taskFeedbackDecision === "rejected" ? " active" : ""}`}
                      onClick={() => void handleTaskFeedback("rejected")}
                      title={translate(
                        "rightPanel.feedback.downTitle",
                        "This task result needs improvement",
                      )}
                    >
                      {translate("rightPanel.feedback.down", "Down")}
                    </button>
                    <button
                      type="button"
                      className="message-feedback-btn right-panel-feedback-btn right-panel-feedback-dismiss"
                      onClick={() => setTaskFeedbackDismissed(true)}
                      title={translate(
                        "rightPanel.feedback.dismissTitle",
                        "Close without rating",
                      )}
                    >
                      {translate("rightPanel.feedback.dismiss", "Dismiss")}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

        {task?.status === "completed" &&
          !hasActiveChildren &&
          task?.terminalStatus === "partial_success" && (
            <div
              className="right-panel-preserved-line"
              title={preservedOutputsTooltip}
            >
              {translate(
                "rightPanel.preserved.partial",
                "Completed with preserved outputs",
              )}
            </div>
          )}
        {task?.status === "failed" &&
          outputSummary &&
          outputSummary.outputCount > 0 && (
            <div
              className="right-panel-preserved-line"
              title={preservedOutputsTooltip}
            >
              {translate(
                "rightPanel.preserved.failed",
                "Output created, final verification failed",
              )}
            </div>
          )}
      </RightPanelTopLevelSection>

      <RightPanelTopLevelSection
        section="process"
        title={translate("rightPanel.process", "Process")}
        detail={processDetail}
        expanded={expandedTopSections.process}
        onToggle={() => toggleTopSection("process")}
      >
        <ProgressSection
          expanded={expandedSections.progress}
          planSteps={stableProgressPlanSteps}
          taskStatus={task?.status}
          taskTerminalStatus={task?.terminalStatus}
          hasActiveChildren={hasActiveChildren}
          progressTitleText={progressTitleText}
          emptyHintText={progressEmptyHintText}
          fallbackActivityText={fallbackProgressText}
          toggleSection={() => toggleSection("progress")}
          rendererPerfLoggingEnabled={rendererPerfLoggingEnabled}
          getStatusIndicator={getStatusIndicator}
        />
        <ChecklistSection
          visible={showChecklistSection}
          expanded={expandedSections.checklist}
          checklistState={stableChecklistState}
          toggleSection={() => toggleSection("checklist")}
          rendererPerfLoggingEnabled={rendererPerfLoggingEnabled}
          getStatusIndicator={getStatusIndicator}
          getChecklistStatusLabel={getChecklistStatusLabel}
        />
        <CollaborativeAgentsSection
          visible={showCollaborativeAgentsSection}
          expanded={expandedSections.collaborativeAgents}
          totals={collaborativeAgentTotals}
          toggleSection={() => toggleSection("collaborativeAgents")}
          onSelectTask={onSelectTask}
          rendererPerfLoggingEnabled={rendererPerfLoggingEnabled}
        />
        <QueueSection
          visible={showQueueSection}
          expanded={expandedSections.queue}
          runningTasks={NO_RUNNING_QUEUE_TASKS}
          queuedTasks={stableQueuedTasks}
          queueBadgeText={queueBadgeText}
          queueTitleText={queueTitleText}
          activeLabel={queueActiveLabel}
          nextLabel={queueNextLabel}
          activeModernLabel={activeModernLabel}
          nextModernLabel={nextModernLabel}
          cancelLabel={cancelLabel}
          toggleSection={() => toggleSection("queue")}
          onSelectTask={onSelectTask}
          onCancelTask={onCancelTask}
          rendererPerfLoggingEnabled={rendererPerfLoggingEnabled}
        />
      </RightPanelTopLevelSection>

      <RightPanelTopLevelSection
        section="resources"
        title={translate("rightPanel.resources", "Resources")}
        detail={translate("rightPanel.access", "Access")}
        expanded={expandedTopSections.resources}
        onToggle={() => toggleTopSection("resources")}
      >
        {task ? (
          <TaskAccessSection
            taskId={task.id}
            taskUpdatedAt={task.updatedAt}
            fallbackTask={task}
            fallbackEvents={events}
            onOpenReferencedFile={openFileFromFilesSection}
          />
        ) : null}
      </RightPanelTopLevelSection>

      {/* Footer note */}
      <div className="cli-panel-footer">
        <span className="cli-footer-prompt">
          <span className="terminal-only">$</span>
          <span className="modern-only">•</span>
        </span>
        <span className="cli-footer-text">
          <span className="terminal-only">
            {agentContext.getUiCopy("rightFooterText")}
          </span>
          <span className="modern-only">
            {translate("rightPanel.localWorkOnly", "Local work only")}
          </span>
        </span>
      </div>

      {/* File Viewer Modal */}
      {viewerFilePath && workspace?.path && (
        <DocumentAwareFileModal
          filePath={viewerFilePath}
          workspacePath={workspace.path}
          onClose={() => setViewerFilePath(null)}
        />
      )}
    </div>
  );
}

function areRightPanelPropsEqual(
  prev: RightPanelProps,
  next: RightPanelProps,
): boolean {
  const sharedEventsEqual =
    prev.sharedTaskEventUi || next.sharedTaskEventUi
      ? prev.sharedTaskEventUi === next.sharedTaskEventUi
      : prev.events === next.events;

  return (
    getRightPanelTaskSignature(prev.task) ===
      getRightPanelTaskSignature(next.task) &&
    prev.workspace?.path === next.workspace?.path &&
    sharedEventsEqual &&
    prev.hasActiveChildren === next.hasActiveChildren &&
    areChildTaskStatsEqual(prev.childTasks || [], next.childTasks || []) &&
    areTaskEventListsEqual(prev.childEvents || [], next.childEvents || []) &&
    getTaskListSignature(prev.runningTasks || []) ===
      getTaskListSignature(next.runningTasks || []) &&
    getTaskListSignature(prev.queuedTasks || []) ===
      getTaskListSignature(next.queuedTasks || []) &&
    getQueueStatusSignature(prev.queueStatus) ===
      getQueueStatusSignature(next.queueStatus) &&
    prev.onOpenSpreadsheetArtifact === next.onOpenSpreadsheetArtifact &&
    prev.onOpenDocumentArtifact === next.onOpenDocumentArtifact &&
    prev.onOpenPresentationArtifact === next.onOpenPresentationArtifact &&
    prev.onOpenWebArtifact === next.onOpenWebArtifact &&
    prev.rendererPerfLoggingEnabled === next.rendererPerfLoggingEnabled &&
    prev.highlightOutputPath === next.highlightOutputPath &&
    prev.onSelectTask === next.onSelectTask &&
    prev.onCancelTask === next.onCancelTask &&
    prev.onHighlightConsumed === next.onHighlightConsumed
  );
}

export const RightPanel = memo(RightPanelComponent, areRightPanelPropsEqual);
