import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import {
  ArrowRight,
  BriefcaseBusiness,
  Bot,
  CheckCircle2,
  ClipboardList,
  CircleDot,
  Clock3,
  FileCode2,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  Image as ImageIcon,
  Pause,
  Plus,
  Sparkles,
  TimerReset,
  ShieldCheck,
  UsersRound,
  Zap,
  Mail,
  Send,
} from "lucide-react";
import type { FileViewerResult } from "../../electron/preload";
import type {
  EverydayActionReceipt,
  EverydayAgentProfileResult,
  ProactiveSuggestion,
  Task,
  Workspace,
} from "../../shared/types";
import {
  formatOutputLocationLabel,
  getFileName,
  resolveTaskOutputSummaryFromTask,
} from "../utils/task-outputs";
import { buildCompletionOutputMessage } from "../utils/task-completion-ux";
import { normalizeMarkdownForCollab } from "../utils/markdown-inline-lists";
import {
  isActiveSessionStatus,
  isAutomatedSession,
  shouldShowTaskInSidebarSessions,
} from "./Sidebar";
import { translate, useLanguage } from "../i18n";
import { WorkSystemGuide } from "./WorkSystemGuide";
import { NeoWorkerPageHeader } from "./NeoWorkerPageHeader";
import { FEATURE_VISIBILITY } from "../feature-visibility";
import "./MainContent/main-content.css";

interface RecentHubFile {
  id: string;
  name: string;
  path: string;
  source: string;
  mimeType: string;
  size: number;
  modifiedAt: number;
  isDirectory?: boolean;
  thumbnailUrl?: string;
}

type PreviewableFileType = NonNullable<FileViewerResult["data"]>["fileType"];

type HomeFilePreviewState =
  | { status: "loading" }
  | {
      status: "ready";
      fileType: PreviewableFileType;
      content: string | null;
      pdfThumbnailDataUrl?: string;
    }
  | { status: "error" };

interface HomeDashboardProps {
  workspace: Workspace | null;
  tasks: Task[];
  onOpenTask: (taskId: string) => void;
  onCreateTask: (
    title: string,
    prompt: string,
  ) => void | Promise<void | boolean>;
  onOpenComposerDraft: (
    draft: string,
    workspace?: Workspace | null,
  ) => void | Promise<void>;
  onNewSession: () => void;
  onOpenScheduledTasks: () => void;
  onOpenMissionControl: () => void;
  onOpenEverydayAgent: () => void;
  onOpenAutomations: () => void;
  onOpenEventTriggers: () => void;
  onOpenSelfImprove: () => void;
  onOpenAgentManagement: () => void;
  automationInboxFocusTick?: number;
}

interface EverydayAgentHomeSnapshot {
  status: "enabled" | "paused" | "disabled" | "blocked" | "unavailable";
  activeCapabilities: number;
  attentionCount: number;
  suggestionCount: number;
}

interface CompanionSuggestion {
  id: string;
  kind: "notification" | "suggestion";
  type: string;
  title: string;
  description: string;
  actionPrompt?: string;
  confidence: number;
  createdAt: number;
  expiresAt: number;
  urgency?: "low" | "medium" | "high";
  recommendedDelivery?: "briefing" | "inbox" | "nudge";
  companionStyle?: "email" | "note";
  workspaceScope?: "single" | "all";
  sourceEntity?: string;
  sourceTaskId?: string;
  workspaceId?: string;
  notificationId?: string;
  read?: boolean;
  workspaceName?: string;
}

interface CompanionTaskResultItem {
  id: string;
  kind: "task_result";
  title: string;
  description: string;
  createdAt: number;
  sourceTaskId: string;
  workspaceId?: string;
  workspaceName?: string;
  sourceEntity: string;
  automationTag: string;
  terminalLabel: string;
  outputLabel?: string;
  outputLocationLabel?: string;
  outputCount?: number;
}

type CompanionInboxItem = CompanionSuggestion | CompanionTaskResultItem;

function isCompanionTaskResultItem(
  item: CompanionInboxItem,
): item is CompanionTaskResultItem {
  return item.kind === "task_result";
}

interface CompanionNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: number;
  taskId?: string;
  workspaceId?: string;
  suggestionId?: string;
  recommendedDelivery?: "briefing" | "inbox" | "nudge";
  companionStyle?: "email" | "note";
}

const inboxMarkdownPlugins = [remarkGfm, remarkBreaks];

function formatRelativeTime(timestamp?: number): string {
  if (!timestamp) return "Just now";
  const diff = Date.now() - timestamp;
  const minutes = Math.max(1, Math.round(diff / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

function formatFileSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return "File";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function stripHtml(html: string): string {
  if (!html) return "";
  try {
    const parsed = new DOMParser().parseFromString(html, "text/html");
    return parsed.body?.textContent || "";
  } catch {
    return html.replace(/<[^>]+>/g, " ");
  }
}

function normalizePreviewText(value: string | null | undefined): string {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\s+/g, " ")
    .trim();
}

function getPreviewLabel(
  fileType?: PreviewableFileType,
  filePath?: string,
): string {
  switch (fileType) {
    case "image":
      return "Image";
    case "pdf":
      return "PDF";
    case "docx":
      return "Word";
    case "xlsx":
      return "Sheet";
    case "pptx":
      return "Slides";
    case "markdown":
      return "Markdown";
    case "code":
      return "Code";
    case "html":
      return "HTML";
    case "text":
      return "Text";
    case "json":
      return "JSON";
    case "csv":
      return "CSV";
    case "audio":
      return "Audio";
    case "video":
      return "Video";
    case "latex":
      return "LaTeX";
    default:
      return filePath?.split(".").pop()?.toUpperCase() || "File";
  }
}

function getTextPreviewContent(preview: HomeFilePreviewState): string {
  if (preview.status !== "ready") return "";
  if (preview.fileType === "docx")
    return normalizePreviewText(stripHtml(preview.content || ""));
  return normalizePreviewText(preview.content);
}

function HomeFilePreview({
  filePath,
  workspacePath,
  fileName,
  isDirectory,
  cloudThumbnailUrl,
}: {
  filePath: string;
  workspacePath?: string;
  fileName: string;
  isDirectory?: boolean;
  cloudThumbnailUrl?: string;
}) {
  const [preview, setPreview] = useState<HomeFilePreviewState>(() =>
    isDirectory ? { status: "error" } : { status: "loading" },
  );

  useEffect(() => {
    let cancelled = false;

    if (isDirectory) {
      setPreview({ status: "error" });
      return () => {
        cancelled = true;
      };
    }

    if (cloudThumbnailUrl) {
      setPreview({
        status: "ready",
        fileType: "image",
        content: cloudThumbnailUrl,
      });
      return () => {
        cancelled = true;
      };
    }

    setPreview({ status: "loading" });

    void window.electronAPI
      .readFileForViewer(filePath, workspacePath, { includeImageContent: true })
      .then((result) => {
        if (cancelled) return;
        if (!result.success || !result.data) {
          setPreview({ status: "error" });
          return;
        }

        const content =
          result.data.fileType === "docx"
            ? result.data.htmlContent || ""
            : result.data.content;

        setPreview({
          status: "ready",
          fileType: result.data.fileType,
          content,
          pdfThumbnailDataUrl: result.data.pdfThumbnailDataUrl,
        });
      })
      .catch(() => {
        if (!cancelled) setPreview({ status: "error" });
      });

    return () => {
      cancelled = true;
    };
  }, [cloudThumbnailUrl, filePath, isDirectory, workspacePath]);

  if (isDirectory) {
    return (
      <div className="home-file-thumb-preview home-file-thumb-preview-fallback">
        <FolderOpen size={28} />
        <span>{translate("home.files.folder", "Folder")}</span>
      </div>
    );
  }

  if (
    preview.status === "ready" &&
    preview.fileType === "image" &&
    preview.content
  ) {
    return (
      <div className="home-file-thumb-preview home-file-thumb-preview-media">
        <img
          src={preview.content}
          alt={fileName}
          className="home-file-thumb-preview-image"
        />
        <span className="home-file-thumb-preview-badge">
          {getPreviewLabel(preview.fileType, filePath)}
        </span>
      </div>
    );
  }

  if (
    preview.status === "ready" &&
    preview.fileType === "pdf" &&
    preview.pdfThumbnailDataUrl
  ) {
    return (
      <div className="home-file-thumb-preview home-file-thumb-preview-media">
        <img
          src={preview.pdfThumbnailDataUrl}
          alt={`${fileName} preview`}
          className="home-file-thumb-preview-image"
        />
        <span className="home-file-thumb-preview-badge">
          {getPreviewLabel(preview.fileType, filePath)}
        </span>
      </div>
    );
  }

  const textPreview = getTextPreviewContent(preview);
  if (preview.status === "ready" && textPreview) {
    return (
      <div className="home-file-thumb-preview home-file-thumb-preview-text">
        <span className="home-file-thumb-preview-badge">
          {getPreviewLabel(preview.fileType, filePath)}
        </span>
        <p>{textPreview}</p>
      </div>
    );
  }

  return (
    <div className="home-file-thumb-preview home-file-thumb-preview-fallback">
      {preview.status === "loading" ? (
        <>
          <div className="home-file-thumb-preview-skeleton" />
          <div className="home-file-thumb-preview-skeleton home-file-thumb-preview-skeleton-short" />
        </>
      ) : (
        <>
          {filePath.endsWith(".xlsx") || filePath.endsWith(".xls") ? (
            <FileSpreadsheet size={28} />
          ) : filePath.match(/\.(png|jpe?g|gif|webp|svg|bmp|ico)$/i) ? (
            <ImageIcon size={28} />
          ) : filePath.match(
              /\.(ts|tsx|js|jsx|json|css|html|py|go|rs|java|sh|sql|yml|yaml)$/i,
            ) ? (
            <FileCode2 size={28} />
          ) : (
            <FileText size={28} />
          )}
          <span>{getPreviewLabel(undefined, filePath)}</span>
        </>
      )}
    </div>
  );
}

function getTaskStatusInfo(task: Task): {
  icon: "live" | "complete" | "paused";
  label: string;
} {
  if (isActiveSessionStatus(task.status)) {
    if (task.source === "cron")
      return {
        icon: "live",
        label: translate("home.taskStatus.scheduledRun", "Scheduled run"),
      };
    if (task.source === "improvement" || task.source === "subconscious") {
      return {
        icon: "live",
        label: translate(
          "home.taskStatus.workflowRun",
          "Workflow Intelligence run",
        ),
      };
    }
    return {
      icon: "live",
      label: translate("home.taskStatus.working", "Working"),
    };
  }
  if (task.status === "paused" || task.status === "blocked")
    return {
      icon: "paused",
      label: translate("home.taskStatus.awaitingReply", "Awaiting reply"),
    };
  if (task.status === "completed")
    return {
      icon: "complete",
      label: translate("home.taskStatus.complete", "Complete"),
    };
  if (task.status === "failed")
    return {
      icon: "paused",
      label: translate("home.taskStatus.needsAttention", "Needs attention"),
    };
  if (task.status === "cancelled")
    return {
      icon: "complete",
      label: translate("home.taskStatus.cancelled", "Cancelled"),
    };
  return {
    icon: "complete",
    label: translate("home.taskStatus.complete", "Complete"),
  };
}

function getTaskTone(task: Task): "live" | "queued" | "done" | "attention" {
  if (isActiveSessionStatus(task.status)) return "live";
  if (task.status === "paused" || task.status === "blocked") return "queued";
  if (task.status === "failed" || task.status === "cancelled")
    return "attention";
  return "done";
}

function getAutomationSender(task: Task): string {
  if (task.heartbeatRunId)
    return translate("home.automation.sender.heartbeat", "Heartbeat");
  if (task.source === "cron")
    return translate("home.automation.sender.scheduledTask", "Scheduled task");
  if (task.source === "improvement" || task.source === "subconscious")
    return translate(
      "home.automation.sender.workflowIntelligence",
      "Workflow Intelligence",
    );
  if (task.source === "hook")
    return translate("home.automation.sender.eventTrigger", "Event trigger");
  if (task.source === "api") return "API";
  return translate("home.automation.sender.manual", "Manual");
}

function getAutomationPreview(task: Task): string {
  const text =
    task.resultSummary?.trim() ||
    task.bestKnownOutcome?.resultSummary?.trim() ||
    task.prompt?.trim() ||
    task.userPrompt?.trim() ||
    "";
  if (!text)
    return translate("home.automation.noSummary", "No summary available yet.");
  return text.length > 180 ? `${text.slice(0, 177).trimEnd()}...` : text;
}

function getAutomationTag(task: Task): string {
  if (task.heartbeatRunId)
    return translate("home.companionInbox.companion", "Companion");
  if (task.source === "cron")
    return translate("home.automation.tag.recurring", "Recurring");
  if (task.source === "improvement" || task.source === "subconscious")
    return translate(
      "home.automation.sender.workflowIntelligence",
      "Workflow Intelligence",
    );
  if (task.source === "hook")
    return translate("home.automation.tag.triggered", "Triggered");
  if (task.source === "api") return "API";
  return translate("home.automation.sender.manual", "Manual");
}

export function HomeDashboard({
  workspace,
  tasks,
  onOpenTask,
  onCreateTask,
  onOpenComposerDraft,
  onNewSession,
  onOpenScheduledTasks,
  onOpenMissionControl,
  onOpenEverydayAgent,
  onOpenAutomations,
  onOpenEventTriggers,
  onOpenSelfImprove,
  onOpenAgentManagement,
  automationInboxFocusTick,
}: HomeDashboardProps) {
  useLanguage();
  const t = translate;
  const AUTOMATION_VISIBLE_ROWS = 4;
  const AUTOMATION_ROW_HEIGHT = 72;
  const AUTOMATION_ROW_GAP = 8;
  const AUTOMATION_ROW_PITCH = AUTOMATION_ROW_HEIGHT + AUTOMATION_ROW_GAP;
  const AUTOMATION_OVERSCAN = 2;
  const AUTOMATION_BATCH_SIZE = 10;
  const [recentHubFiles, setRecentHubFiles] = useState<RecentHubFile[]>([]);
  const [automationLoadedCount, setAutomationLoadedCount] = useState(
    AUTOMATION_BATCH_SIZE,
  );
  const [automationScrollTop, setAutomationScrollTop] = useState(0);
  const [knownWorkspaces, setKnownWorkspaces] = useState<Workspace[]>([]);
  const [companionSuggestions, setCompanionSuggestions] = useState<
    CompanionSuggestion[]
  >([]);
  const [companionLoading, setCompanionLoading] = useState(false);
  const [companionError, setCompanionError] = useState<string | null>(null);
  const [selectedCompanionItemId, setSelectedCompanionItemId] = useState<
    string | null
  >(null);
  const [everydayAgentSnapshot, setEverydayAgentSnapshot] =
    useState<EverydayAgentHomeSnapshot | null>(null);
  const [agentTaskPrompt, setAgentTaskPrompt] = useState("");
  const [agentTaskError, setAgentTaskError] = useState("");
  const [isLaunchingAgentTask, setIsLaunchingAgentTask] = useState(false);
  const agentTaskInputRef = useRef<HTMLInputElement>(null);
  const automationInboxRef = useRef<HTMLDivElement>(null);
  const currentWorkspaceName = workspace?.name || "Workspace";
  const everydayAgentStatusText = everydayAgentSnapshot
    ? everydayAgentSnapshot.status === "enabled"
      ? everydayAgentSnapshot.attentionCount > 0 ||
        everydayAgentSnapshot.suggestionCount > 0
        ? t(
            "home.automation.status.needsAttention",
            "{attention} needs attention, {suggestions} suggestions",
          )
            .replace(
              "{attention}",
              String(everydayAgentSnapshot.attentionCount),
            )
            .replace(
              "{suggestions}",
              String(everydayAgentSnapshot.suggestionCount),
            )
        : t(
            "home.automation.status.capabilitiesActive",
            "{count} capabilities active",
          ).replace("{count}", String(everydayAgentSnapshot.activeCapabilities))
      : everydayAgentSnapshot.status === "paused"
        ? t("home.automation.status.paused", "Paused")
        : everydayAgentSnapshot.status === "blocked"
          ? t("home.automation.status.blockedByPolicy", "Blocked by policy")
          : everydayAgentSnapshot.status === "disabled"
            ? t("home.automation.status.notEnabled", "Not enabled")
            : t("home.automation.status.unavailable", "Unavailable")
    : t("home.automation.status.loading", "Loading status");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const electronApi = (window as any).electronAPI;
        const recent = await electronApi.getRecentHubFiles(8);
        if (cancelled) return;
        setRecentHubFiles(
          Array.isArray(recent) ? (recent as RecentHubFile[]) : [],
        );
      } catch {
        if (cancelled) return;
        setRecentHubFiles([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const profileResult =
          (await window.electronAPI.everydayAgentGetProfile()) as EverydayAgentProfileResult;
        const receiptRows = (await window.electronAPI.everydayAgentListReceipts(
          {
            profileId: profileResult.profile.id,
            workspaceId: workspace?.id,
            limit: 20,
          },
        )) as EverydayActionReceipt[];
        const suggestionRows =
          workspace?.id && window.electronAPI.listSuggestions
            ? (((await window.electronAPI.listSuggestions(workspace.id)) ||
                []) as ProactiveSuggestion[])
            : [];

        if (cancelled) return;

        const status: EverydayAgentHomeSnapshot["status"] = profileResult
          .compiledPolicy.adminPolicy.blocked
          ? "blocked"
          : !profileResult.profile.enabled
            ? "disabled"
            : !profileResult.compiledPolicy.enabled
              ? "paused"
              : "enabled";
        const attentionCount = receiptRows.filter((receipt) =>
          ["blocked", "failed", "paused", "previewed"].includes(receipt.status),
        ).length;
        const suggestionCount = suggestionRows.filter(
          (suggestion) => !suggestion.dismissed && !suggestion.actedOn,
        ).length;

        setEverydayAgentSnapshot({
          status,
          activeCapabilities:
            profileResult.compiledPolicy.allowedCapabilities.length,
          attentionCount,
          suggestionCount,
        });
      } catch {
        if (!cancelled) {
          setEverydayAgentSnapshot({
            status: "unavailable",
            activeCapabilities: 0,
            attentionCount: 0,
            suggestionCount: 0,
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [workspace?.id]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setCompanionLoading(true);
        setCompanionError(null);

        const loadedWorkspaces = await window.electronAPI.listWorkspaces();
        const visibleWorkspaces = (
          Array.isArray(loadedWorkspaces) ? loadedWorkspaces : []
        ).filter(
          (item) => !String(item.id || "").startsWith("__temp_workspace__"),
        );
        setKnownWorkspaces(visibleWorkspaces as Workspace[]);

        const notificationResults =
          await window.electronAPI.listNotifications();
        const companionNotifications = (
          Array.isArray(notificationResults) ? notificationResults : []
        ).filter(
          (item: CompanionNotification) => item.type === "companion_suggestion",
        );

        const suggestionResults = visibleWorkspaces.length
          ? await window.electronAPI.listSuggestionsForWorkspaces(
              visibleWorkspaces.map((item) => item.id),
            )
          : [];

        if (cancelled) return;

        const merged = new Map<string, CompanionSuggestion>();

        for (const notification of companionNotifications as CompanionNotification[]) {
          const workspaceName =
            visibleWorkspaces.find(
              (item) => item.id === notification.workspaceId,
            )?.name || "Workspace";
          merged.set(notification.suggestionId || notification.id, {
            id: notification.suggestionId || notification.id,
            type: notification.type,
            title: notification.title,
            description: notification.message,
            actionPrompt: undefined,
            confidence:
              notification.recommendedDelivery === "nudge" ? 0.95 : 0.75,
            createdAt: notification.createdAt,
            expiresAt: notification.createdAt + 7 * 24 * 60 * 60 * 1000,
            urgency:
              notification.recommendedDelivery === "nudge" ? "high" : "medium",
            recommendedDelivery: notification.recommendedDelivery,
            companionStyle: notification.companionStyle,
            workspaceScope: "single",
            sourceEntity: workspaceName,
            sourceTaskId: notification.taskId,
            workspaceId: notification.workspaceId,
            notificationId: notification.id,
            read: notification.read,
            workspaceName,
            kind: "notification",
          });
        }

        for (const entry of suggestionResults) {
          const workspaceName =
            visibleWorkspaces.find((item) => item.id === entry.workspaceId)
              ?.name || "Workspace";
          for (const suggestion of entry.suggestions as CompanionSuggestion[]) {
            const existing = merged.get(suggestion.id);
            merged.set(suggestion.id, {
              ...(existing || suggestion),
              ...suggestion,
              workspaceName,
              sourceEntity: suggestion.sourceEntity || workspaceName,
              workspaceId: entry.workspaceId,
              kind: "suggestion",
              notificationId: existing?.notificationId,
              read: existing?.read,
            });
          }
        }

        setCompanionSuggestions(
          Array.from(merged.values()).sort((a, b) => {
            const aUrgency =
              a.urgency === "high" ? 0 : a.urgency === "medium" ? 1 : 2;
            const bUrgency =
              b.urgency === "high" ? 0 : b.urgency === "medium" ? 1 : 2;
            if (aUrgency !== bUrgency) return aUrgency - bUrgency;
            return (b.createdAt || 0) - (a.createdAt || 0);
          }),
        );
      } catch (error) {
        if (cancelled) return;
        setCompanionError(
          error instanceof Error ? error.message : "Failed to load inbox",
        );
        setCompanionSuggestions([]);
      } finally {
        if (!cancelled) setCompanionLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!automationInboxFocusTick) return;
    automationInboxRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, [automationInboxFocusTick]);

  const handleDismissCompanionSuggestion = async (id: string) => {
    const suggestion = companionSuggestions.find((item) => item.id === id);
    const workspaceId = suggestion?.workspaceId || workspace?.id;
    if (!workspaceId) return;
    try {
      await window.electronAPI.dismissSuggestion(workspaceId, id);
      setCompanionSuggestions((prev) => prev.filter((s) => s.id !== id));
      setSelectedCompanionItemId((current) =>
        current === id ? null : current,
      );
    } catch {
      // best-effort
    }
  };

  const handleSnoozeCompanionSuggestion = async (id: string) => {
    const suggestion = companionSuggestions.find((item) => item.id === id);
    const workspaceId = suggestion?.workspaceId || workspace?.id;
    if (!workspaceId) return;
    try {
      await window.electronAPI.snoozeSuggestion(
        workspaceId,
        id,
        Date.now() + 24 * 60 * 60 * 1000,
      );
      setCompanionSuggestions((prev) => prev.filter((s) => s.id !== id));
      setSelectedCompanionItemId((current) =>
        current === id ? null : current,
      );
    } catch {
      // best-effort
    }
  };

  const handleActOnCompanionSuggestion = async (
    suggestion: CompanionSuggestion,
  ) => {
    const prompt = suggestion.actionPrompt?.trim();
    if (!prompt) return;
    const targetWorkspace = suggestion.workspaceId
      ? knownWorkspaces.find((item) => item.id === suggestion.workspaceId) ||
        workspace
      : workspace;
    await Promise.resolve(onOpenComposerDraft(prompt, targetWorkspace));
    setSelectedCompanionItemId(null);
  };

  const workspaceNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of knownWorkspaces) {
      map.set(item.id, item.name);
    }
    if (workspace?.id && workspace.name) {
      map.set(workspace.id, workspace.name);
    }
    return map;
  }, [knownWorkspaces, workspace?.id, workspace?.name]);

  useEffect(() => {
    if (!workspace?.id) return;
    setCompanionSuggestions((prev) =>
      prev.map((item) =>
        item.workspaceName && item.workspaceName !== currentWorkspaceName
          ? item
          : {
              ...item,
              workspaceName: currentWorkspaceName,
            },
      ),
    );
  }, [workspace?.id, currentWorkspaceName]);

  const rootTasks = useMemo(
    () =>
      tasks
        .filter(
          (task) => !task.parentTaskId && shouldShowTaskInSidebarSessions(task),
        )
        .sort((a, b) => b.updatedAt - a.updatedAt),
    [tasks],
  );

  const activeTasks = useMemo(
    () =>
      rootTasks.filter(
        (task) =>
          isActiveSessionStatus(task.status) ||
          task.status === "paused" ||
          task.status === "blocked",
      ),
    [rootTasks],
  );

  const automatedTasks = useMemo(
    () => rootTasks.filter((task) => isAutomatedSession(task)),
    [rootTasks],
  );

  const completedAutomationInboxItems = useMemo<
    CompanionTaskResultItem[]
  >(() => {
    return automatedTasks
      .filter((task) => task.status === "completed")
      .map((task) => {
        const outputSummary = resolveTaskOutputSummaryFromTask(task);
        const outputLabel = outputSummary
          ? buildCompletionOutputMessage(outputSummary)
          : undefined;
        const resultSummary =
          task.resultSummary?.trim() ||
          task.bestKnownOutcome?.resultSummary?.trim() ||
          "";
        const description = resultSummary
          ? resultSummary
          : outputLabel
            ? translate(
                "home.companionInbox.completedWith",
                "Completed with {output}.",
                { output: outputLabel },
              )
            : getAutomationPreview(task);
        const status = getTaskStatusInfo(task);
        return {
          id: `task-result:${task.id}`,
          kind: "task_result" as const,
          title: `Automation completed: ${task.title}`,
          description,
          createdAt: task.completedAt || task.updatedAt || task.createdAt,
          sourceTaskId: task.id,
          workspaceId: task.workspaceId,
          workspaceName:
            workspaceNameById.get(task.workspaceId) || currentWorkspaceName,
          sourceEntity: getAutomationSender(task),
          automationTag: getAutomationTag(task),
          terminalLabel: status.label,
          ...(outputLabel ? { outputLabel } : {}),
          ...(outputSummary
            ? { outputLocationLabel: formatOutputLocationLabel(outputSummary) }
            : {}),
          ...(outputSummary?.outputCount
            ? { outputCount: outputSummary.outputCount }
            : {}),
        };
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [automatedTasks, currentWorkspaceName, workspaceNameById]);

  const companionInboxItems = useMemo(() => {
    const urgencyRank: Record<
      NonNullable<CompanionSuggestion["urgency"]>,
      number
    > = {
      high: 0,
      medium: 1,
      low: 2,
    };

    return [...companionSuggestions, ...completedAutomationInboxItems].sort(
      (a, b) => {
        const urgencyA =
          a.kind === "task_result" ? 3 : a.urgency ? urgencyRank[a.urgency] : 3;
        const urgencyB =
          b.kind === "task_result" ? 3 : b.urgency ? urgencyRank[b.urgency] : 3;
        if (urgencyA !== urgencyB) return urgencyA - urgencyB;
        return (b.createdAt || 0) - (a.createdAt || 0);
      },
    );
  }, [companionSuggestions, completedAutomationInboxItems]);

  const selectedCompanionItem = useMemo<CompanionInboxItem | null>(() => {
    if (companionInboxItems.length === 0) return null;
    if (!selectedCompanionItemId) return companionInboxItems[0];
    return (
      companionInboxItems.find((item) => item.id === selectedCompanionItemId) ||
      companionInboxItems[0]
    );
  }, [companionInboxItems, selectedCompanionItemId]);

  useEffect(() => {
    if (companionInboxItems.length === 0) {
      if (selectedCompanionItemId !== null) {
        setSelectedCompanionItemId(null);
      }
      return;
    }

    if (
      !selectedCompanionItemId ||
      !companionInboxItems.some((item) => item.id === selectedCompanionItemId)
    ) {
      setSelectedCompanionItemId(companionInboxItems[0].id);
    }
  }, [companionInboxItems, selectedCompanionItemId]);

  useEffect(() => {
    setAutomationLoadedCount(
      Math.min(automatedTasks.length, AUTOMATION_BATCH_SIZE),
    );
    setAutomationScrollTop(0);
  }, [AUTOMATION_BATCH_SIZE, automatedTasks.length]);

  const automationVisibleStart = Math.max(
    0,
    Math.floor(automationScrollTop / AUTOMATION_ROW_PITCH),
  );
  const automationRenderStart = Math.max(
    0,
    automationVisibleStart - AUTOMATION_OVERSCAN,
  );
  const automationRenderEnd = Math.min(
    automationLoadedCount,
    automationVisibleStart + AUTOMATION_VISIBLE_ROWS + AUTOMATION_OVERSCAN,
  );
  const visibleAutomatedTasks = automatedTasks.slice(
    automationRenderStart,
    automationRenderEnd,
  );
  const automationTopSpacer = automationRenderStart * AUTOMATION_ROW_PITCH;
  const automationBottomSpacer = Math.max(
    0,
    (automationLoadedCount - automationRenderEnd) * AUTOMATION_ROW_PITCH,
  );

  const recentOutputs = useMemo(() => {
    const items = rootTasks
      .map((task) => {
        const summary = resolveTaskOutputSummaryFromTask(task);
        if (!summary?.primaryOutputPath) return null;
        return {
          taskId: task.id,
          taskTitle: task.title,
          fileName: getFileName(summary.primaryOutputPath),
          filePath: summary.primaryOutputPath,
          updatedAt: task.completedAt || task.updatedAt || task.createdAt,
          outputCount: summary.outputCount,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort((a, b) => b.updatedAt - a.updatedAt);

    const seen = new Set<string>();
    return items.filter((item) => {
      if (seen.has(item.filePath)) return false;
      seen.add(item.filePath);
      return true;
    });
  }, [rootTasks]);

  const automationGroups = useMemo(() => {
    const counts = {
      cron: 0,
      improvement: 0,
      hook: 0,
      api: 0,
      heartbeat: 0,
    };
    for (const task of rootTasks) {
      if (!isAutomatedSession(task)) continue;
      if (task.heartbeatRunId) counts.heartbeat += 1;
      else if (task.source === "cron") counts.cron += 1;
      else if (task.source === "improvement" || task.source === "subconscious")
        counts.improvement += 1;
      else if (task.source === "hook") counts.hook += 1;
      else if (task.source === "api") counts.api += 1;
    }
    return counts;
  }, [rootTasks]);

  const displayTasks = activeTasks.filter(isAutomatedSession).slice(0, 4);

  const loadMoreAutomationTasks = (element?: HTMLDivElement | null) => {
    if (automationLoadedCount >= automatedTasks.length) return;
    if (element) {
      const hasOverflow = element.scrollHeight > element.clientHeight + 1;
      const remaining =
        element.scrollHeight - element.scrollTop - element.clientHeight;
      if (hasOverflow && remaining > 120) return;
    }
    setAutomationLoadedCount((count) =>
      Math.min(automatedTasks.length, count + AUTOMATION_BATCH_SIZE),
    );
  };

  const handleAutomationListScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const element = event.currentTarget;
    setAutomationScrollTop(element.scrollTop);
    loadMoreAutomationTasks(element);
  };

  const featuredTask = displayTasks[0];
  const attentionTasks = useMemo(
    () =>
      rootTasks
        .filter((task) => ["paused", "blocked", "failed"].includes(task.status))
        .slice(0, 3),
    [rootTasks],
  );

  const launchAgentTask = async (prompt: string, title?: string) => {
    const normalizedPrompt = prompt.trim();
    if (!normalizedPrompt) {
      setAgentTaskError(
        translate(
          "generated.components.homedashboard.905.0",
          "Please first describe the task to be given to the agent",
        ),
      );
      agentTaskInputRef.current?.focus();
      return;
    }
    if (isLaunchingAgentTask) return;

    setAgentTaskError("");
    setIsLaunchingAgentTask(true);
    try {
      await Promise.resolve(
        onCreateTask(title || normalizedPrompt.slice(0, 48), normalizedPrompt),
      );
      setAgentTaskPrompt("");
    } catch (error) {
      console.error("Failed to hand task to agent:", error);
      setAgentTaskError(
        translate(
          "generated.components.homedashboard.918.1",
          "Task creation failed, please try again later",
        ),
      );
    } finally {
      setIsLaunchingAgentTask(false);
    }
  };

  if (true) {
    return (
      <main className="main-content home-main-content">
        <div className="workspace-landing">
          <NeoWorkerPageHeader
            className="workspace-product-header"
            title={t("sidebar.agentTeam", "Agent team")}
            description={translate(
              "generated.components.homedashboard.931.2",
              "Configure team division of labor, collaboration portal, and running status so that someone can take over each task and continue to advance it.",
            )}
            icon={<UsersRound size={18} strokeWidth={2} />}
            actions={
              <span className="crew-page-context">
                <UsersRound size={16} strokeWidth={2} />
                {workspace?.name ||
                  t("home.workspaceHero.defaultWorkspace", "Financial team")}
              </span>
            }
          />
          <section
            className="workspace-hero"
            aria-label={t("home.workspaceHero.aria", "Workspace overview")}
          >
            <div className="workspace-hero-copy">
              <div className="workspace-hero-eyebrow">
                <UsersRound size={17} strokeWidth={2} />
                <span>
                  {workspace?.name ||
                    t(
                      "home.workspaceHero.defaultWorkspace",
                      "Financial team",
                    )}{" "}
                  · {t("home.workspaceHero.agentTeam", "Workspace agents")}
                </span>
              </div>
              <h1>
                {t("home.workspaceHero.titleStart", "From ideas to results,")}
                <br />
                {t("home.workspaceHero.titleEnd", "keep work")}{" "}
                <em>
                  {t("home.workspaceHero.titleAccent", "moving forward.")}
                </em>
              </h1>
              <p>
                {t(
                  "home.workspaceHero.description",
                  "Configure who does the work, then assign it directly or let automation and the everyday assistant start it. Every run is tracked in Task Hub.",
                )}
              </p>
              <div className="workspace-agent-composer">
                <label htmlFor="workspace-agent-task">
                  {translate(
                    "generated.components.homedashboard.958.3",
                    "Give it to the agent immediately",
                  )}
                </label>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void launchAgentTask(agentTaskPrompt);
                  }}
                >
                  <input
                    ref={agentTaskInputRef}
                    id="workspace-agent-task"
                    value={agentTaskPrompt}
                    onChange={(event) => {
                      setAgentTaskPrompt(event.target.value);
                      if (agentTaskError) setAgentTaskError("");
                    }}
                    placeholder={translate(
                      "generated.components.homedashboard.973.4",
                      "For example: Organize the project progress this week and list the things that need my confirmation",
                    )}
                    aria-invalid={Boolean(agentTaskError)}
                    aria-describedby={
                      agentTaskError
                        ? "workspace-agent-task-feedback"
                        : undefined
                    }
                  />
                  <button
                    type="submit"
                    disabled={isLaunchingAgentTask}
                    aria-busy={isLaunchingAgentTask}
                  >
                    {isLaunchingAgentTask
                      ? translate(
                          "generated.components.homedashboard.978.5",
                          "Creating",
                        )
                      : translate(
                          "generated.components.homedashboard.978.6",
                          "Leave it to the agent",
                        )}{" "}
                    <Send size={17} strokeWidth={2.2} />
                  </button>
                </form>
                {agentTaskError && (
                  <p
                    id="workspace-agent-task-feedback"
                    className="workspace-agent-composer-feedback"
                    role="status"
                  >
                    {agentTaskError}
                  </p>
                )}
                <div
                  className="workspace-agent-quick-actions"
                  aria-label={translate(
                    "generated.components.homedashboard.986.7",
                    "Intelligent agent quick operation",
                  )}
                >
                  <button
                    type="button"
                    disabled={isLaunchingAgentTask}
                    onClick={() =>
                      void onOpenComposerDraft(
                        translate(
                          "generated.components.homedashboard.987.8",
                          "Summarize the progress of this week's work, listing completed items, risks and next steps by project.",
                        ),
                        workspace,
                      )
                    }
                  >
                    {translate(
                      "generated.components.homedashboard.987.9",
                      "Generate weekly report",
                    )}
                  </button>
                  <button
                    type="button"
                    disabled={isLaunchingAgentTask}
                    onClick={() =>
                      void onOpenComposerDraft(
                        translate(
                          "generated.components.homedashboard.988.10",
                          "Sort out the current to-do list and list the three most important things today in order of priority.",
                        ),
                        workspace,
                      )
                    }
                  >
                    {translate(
                      "generated.components.homedashboard.988.11",
                      "Organize to-do",
                    )}
                  </button>
                  <button
                    type="button"
                    disabled={isLaunchingAgentTask}
                    onClick={() =>
                      void onOpenComposerDraft(
                        translate(
                          "generated.components.homedashboard.989.12",
                          "Collect and summarize recent industry trends related to current work and give executable suggestions.",
                        ),
                        workspace,
                      )
                    }
                  >
                    {translate(
                      "generated.components.homedashboard.989.13",
                      "Research updates",
                    )}
                  </button>
                </div>
              </div>
            </div>

            <div
              className="workspace-activity-stack"
              aria-label={t("home.workspaceHero.activity", "Agent activity")}
            >
              <button
                type="button"
                className="workspace-activity-card workspace-activity-note"
                onClick={onOpenEverydayAgent}
              >
                <span className="workspace-activity-icon">
                  <Bot size={25} strokeWidth={1.9} />
                </span>
                <span className="workspace-activity-copy">
                  <strong>
                    {t("home.workspaceHero.everydayAgent", "Everyday Agent")}{" "}
                    <b>
                      {t(
                        "home.workspaceHero.initiated",
                        "initiated collaboration",
                      )}
                    </b>
                  </strong>
                  <small>{t("home.workspaceHero.today", "Today 09:30")}</small>
                  <span>
                    {t(
                      "home.workspaceHero.note",
                      "The daily data and market brief is ready. Please review it before sending.",
                    )}
                  </span>
                  <i>
                    {t("home.workspaceHero.handoff", "Hand off to")} ·{" "}
                    {t("home.workspaceHero.projectManager", "Project manager")}
                  </i>
                </span>
                <span className="workspace-activity-button">
                  {t("home.workspaceHero.view", "View details")}
                </span>
              </button>

              <button
                type="button"
                className="workspace-activity-card workspace-activity-deliverable"
                onClick={() =>
                  featuredTask ? onOpenTask(featuredTask.id) : onNewSession()
                }
              >
                <span className="workspace-activity-icon">
                  <ClipboardList size={25} strokeWidth={1.9} />
                </span>
                <span className="workspace-activity-copy">
                  <strong>
                    {t("home.workspaceHero.projectManager", "Project manager")}{" "}
                    <b>{t("home.workspaceHero.ready", "ready for you")}</b>
                  </strong>
                  <small>
                    {featuredTask
                      ? formatRelativeTime(
                          featuredTask.updatedAt || featuredTask.createdAt,
                        )
                      : t("home.workspaceHero.today", "Today 11:42")}
                  </small>
                  <span className="workspace-deliverable-title">
                    {featuredTask?.title ||
                      t(
                        "home.workspaceHero.deliverable",
                        "Prepare a macro-data and market brief",
                      )}
                  </span>
                  <i className="workspace-status-chip">
                    {featuredTask
                      ? getTaskStatusInfo(featuredTask).label
                      : t(
                          "home.workspaceHero.awaitingReview",
                          "Awaiting review",
                        )}
                  </i>
                </span>
                <span className="workspace-activity-aside">
                  <img
                    className="workspace-report-preview"
                    src={`${import.meta.env.BASE_URL}home/work-report-preview.webp`}
                    alt={t(
                      "home.workspaceHero.reportPreview",
                      "Report preview",
                    )}
                  />
                  <span className="workspace-activity-button">
                    {t("home.workspaceHero.openDraft", "Open draft")}
                  </span>
                </span>
              </button>

              <button
                type="button"
                className="workspace-activity-card workspace-activity-complete"
                onClick={onOpenMissionControl}
              >
                <span className="workspace-activity-icon">
                  <CheckCircle2 size={27} strokeWidth={2} />
                </span>
                <span className="workspace-activity-copy">
                  <strong>
                    {t(
                      "home.workspaceHero.generalAssistant",
                      "General assistant",
                    )}{" "}
                    <b>{t("home.workspaceHero.completed", "completed")}</b>
                  </strong>
                  <small>
                    {t("home.workspaceHero.todayAfternoon", "Today 14:28")}
                  </small>
                  <span>
                    {t(
                      "home.workspaceHero.completeNote",
                      "The industry information list has been updated and synced to the knowledge base",
                    )}
                  </span>
                  <i>
                    {t("home.workspaceHero.synced", "Synced to knowledge base")}
                  </i>
                </span>
                <span className="workspace-activity-button">
                  {t("home.workspaceHero.viewUpdates", "View updates")}
                </span>
              </button>
            </div>
          </section>

          {FEATURE_VISIBILITY.automations && (
            <div className="workspace-work-system-guide">
              <WorkSystemGuide
                current="team"
                onOpenAutomation={onOpenAutomations}
                onOpenAssistant={onOpenEverydayAgent}
                onOpenMission={onOpenMissionControl}
              />
            </div>
          )}

          <section
            className="workspace-agent-workbench"
            aria-label={translate(
              "generated.components.homedashboard.1053.14",
              "Team task dynamics",
            )}
          >
            <div className="workspace-workbench-heading">
              <div>
                <span className="workspace-workbench-kicker">
                  <Sparkles size={16} />{" "}
                  {translate(
                    "generated.components.homedashboard.1056.15",
                    "Team task dynamics",
                  )}
                </span>
                <h2>
                  {translate(
                    "generated.components.homedashboard.1057.16",
                    "Keep track of your team's progress and jump into tasks when needed.",
                  )}
                </h2>
                <p>
                  {translate(
                    "generated.components.homedashboard.1058.17",
                    "A summary of tasks initiated or participated by the agent is displayed here. Complete records, approvals and delivery history can be viewed in the task.",
                  )}
                </p>
              </div>
              <button
                type="button"
                className="workspace-workbench-link"
                onClick={onOpenMissionControl}
              >
                {translate(
                  "generated.components.homedashboard.1061.18",
                  "View tasks",
                )}
                <ArrowRight size={17} />
              </button>
            </div>
            <div className="workspace-workbench-grid">
              <section className="workspace-workbench-panel workspace-workbench-queue">
                <div className="workspace-workbench-lanes">
                  <div className="workspace-workbench-lane">
                    <div className="workspace-workbench-panel-heading">
                      <span>
                        <Clock3 size={18} />{" "}
                        {translate(
                          "generated.components.homedashboard.1069.19",
                          "The team is moving forward",
                        )}
                      </span>
                      <small>
                        {activeTasks.length}{" "}
                        {translate(
                          "generated.components.homedashboard.1070.20",
                          "item",
                        )}
                      </small>
                    </div>
                    {activeTasks.length > 0 ? (
                      <div className="workspace-workbench-list">
                        {activeTasks.slice(0, 3).map((task) => {
                          const status = getTaskStatusInfo(task);
                          return (
                            <button
                              key={task.id}
                              type="button"
                              className="workspace-workbench-task"
                              onClick={() => onOpenTask(task.id)}
                            >
                              <span
                                className={`workspace-task-dot ${getTaskTone(task)}`}
                              />
                              <span>
                                <strong>{task.title}</strong>
                                <small>
                                  {status.label} ·{" "}
                                  {formatRelativeTime(
                                    task.updatedAt || task.createdAt,
                                  )}
                                </small>
                              </span>
                              <ArrowRight size={17} />
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="workspace-workbench-empty"
                        onClick={onNewSession}
                      >
                        <Plus size={18} />{" "}
                        {translate(
                          "generated.components.homedashboard.1087.21",
                          "Create first job",
                        )}
                      </button>
                    )}
                  </div>

                  <div className="workspace-workbench-lane workspace-workbench-attention">
                    <div className="workspace-workbench-panel-heading">
                      <span>
                        <CircleDot size={18} />{" "}
                        {translate(
                          "generated.components.homedashboard.1094.22",
                          "need you to deal with",
                        )}
                      </span>
                      <small>
                        {attentionTasks.length +
                          (everydayAgentSnapshot?.attentionCount || 0)}{" "}
                        {translate(
                          "generated.components.homedashboard.1095.23",
                          "item",
                        )}
                      </small>
                    </div>
                    {attentionTasks.length > 0 ? (
                      <div className="workspace-workbench-list">
                        {attentionTasks.map((task) => (
                          <button
                            key={task.id}
                            type="button"
                            className="workspace-workbench-task"
                            onClick={() => onOpenTask(task.id)}
                          >
                            <span className="workspace-task-dot attention" />
                            <span>
                              <strong>{task.title}</strong>
                              <small>{getTaskStatusInfo(task).label}</small>
                            </span>
                            <ArrowRight size={17} />
                          </button>
                        ))}
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="workspace-workbench-empty"
                        onClick={onOpenEverydayAgent}
                      >
                        <CheckCircle2 size={18} />{" "}
                        {translate(
                          "generated.components.homedashboard.1109.24",
                          "No pending items",
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </section>

              <section className="workspace-workbench-panel workspace-workbench-control">
                <div className="workspace-workbench-panel-heading">
                  <span>
                    <Bot size={18} />{" "}
                    {translate(
                      "generated.components.homedashboard.1118.25",
                      "daily assistant",
                    )}
                  </span>
                  <small>{everydayAgentStatusText}</small>
                </div>
                <p>
                  {translate(
                    "generated.components.homedashboard.1121.26",
                    "Configure the execution boundaries of capabilities such as inbox, calendar, files, and browsers to proactively collaborate when appropriate.",
                  )}
                </p>
                <button
                  type="button"
                  className="workspace-workbench-control-button"
                  onClick={onOpenEverydayAgent}
                >
                  {translate(
                    "generated.components.homedashboard.1123.27",
                    "Management daily assistant",
                  )}
                  <ArrowRight size={17} />
                </button>
              </section>
            </div>
          </section>

          <section className="workspace-team-section">
            <div className="workspace-team-heading">
              <div>
                <h2>{t("home.workspaceTeam.title", "Your agent team")}</h2>
                <p>
                  {t(
                    "home.workspaceTeam.description",
                    "Divide the work by role and complete complex work together.",
                  )}
                </p>
              </div>
              {FEATURE_VISIBILITY.capabilityCenter && (
                <button
                  type="button"
                  className="workspace-team-manage"
                  onClick={onOpenAgentManagement}
                >
                  {translate(
                    "generated.components.homedashboard.1137.28",
                    "Management agent",
                  )}
                  <ArrowRight size={17} />
                </button>
              )}
            </div>
            <div className="workspace-team-grid">
              <button
                type="button"
                className="workspace-team-card"
                onClick={onOpenEverydayAgent}
              >
                <span className="workspace-team-icon">
                  <Bot size={32} strokeWidth={1.8} />
                </span>
                <span className="workspace-team-copy">
                  <strong>
                    {t("home.workspaceHero.everydayAgent", "Everyday Agent")}
                  </strong>
                  <small>
                    {t(
                      "home.workspaceTeam.everydayRole",
                      "All-day collaboration specialist",
                    )}
                  </small>
                  <span>
                    {t(
                      "home.workspaceTeam.everydayDescription",
                      "Continuously collects and tracks key materials, turning them into actionable work.",
                    )}
                  </span>
                </span>
                <ArrowRight size={20} strokeWidth={1.8} />
              </button>
              <button
                type="button"
                className="workspace-team-card"
                onClick={onOpenMissionControl}
              >
                <span className="workspace-team-icon">
                  <ClipboardList size={32} strokeWidth={1.8} />
                </span>
                <span className="workspace-team-copy">
                  <strong>
                    {t("home.workspaceHero.projectManager", "Project manager")}
                  </strong>
                  <small>
                    {t(
                      "home.workspaceTeam.projectRole",
                      "Project coordination specialist",
                    )}
                  </small>
                  <span>
                    {t(
                      "home.workspaceTeam.projectDescription",
                      "Organizes material, produces structured outcomes, and keeps work on pace.",
                    )}
                  </span>
                </span>
                <ArrowRight size={20} strokeWidth={1.8} />
              </button>
              <button
                type="button"
                className="workspace-team-card"
                onClick={onNewSession}
              >
                <span className="workspace-team-icon">
                  <BriefcaseBusiness size={32} strokeWidth={1.8} />
                </span>
                <span className="workspace-team-copy">
                  <strong>
                    {t(
                      "home.workspaceHero.generalAssistant",
                      "General assistant",
                    )}
                  </strong>
                  <small>
                    {t(
                      "home.workspaceTeam.generalRole",
                      "Multi-task execution specialist",
                    )}
                  </small>
                  <span>
                    {t(
                      "home.workspaceTeam.generalDescription",
                      "Handles daily tasks, schedules, and the work that needs attention now.",
                    )}
                  </span>
                </span>
                <ArrowRight size={20} strokeWidth={1.8} />
              </button>
              {FEATURE_VISIBILITY.capabilityCenter && (
                <button
                  type="button"
                  className="workspace-team-card workspace-team-management-card"
                  onClick={onOpenAgentManagement}
                >
                  <span className="workspace-team-icon">
                    <Sparkles size={32} strokeWidth={1.8} />
                  </span>
                  <span className="workspace-team-copy">
                    <strong>
                      {translate(
                        "generated.components.homedashboard.1173.29",
                        "Agent Catalog and Templates",
                      )}
                    </strong>
                    <small>
                      {translate(
                        "generated.components.homedashboard.1174.30",
                        "Create, configure and run management",
                      )}
                    </small>
                    <span>
                      {translate(
                        "generated.components.homedashboard.1175.31",
                        "View existing agents, create from templates, and manage skills, tools, triggers, approvals, and sharing settings.",
                      )}
                    </span>
                  </span>
                  <ArrowRight size={20} strokeWidth={1.8} />
                </button>
              )}
            </div>
            <div className="workspace-team-promises">
              <span>
                <ShieldCheck size={17} />{" "}
                {t(
                  "home.workspaceTeam.approval",
                  "Automatic execution · human approval · safe by design",
                )}
              </span>
              <span>
                <CheckCircle2 size={17} />{" "}
                {t(
                  "home.workspaceTeam.review",
                  "Key outputs stay under human review",
                )}
              </span>
              <span>
                <UsersRound size={17} />{" "}
                {t(
                  "home.workspaceTeam.sharing",
                  "Share with the team with permissions in control",
                )}
              </span>
              <span>
                <Sparkles size={17} />{" "}
                {t(
                  "home.workspaceTeam.integration",
                  "Seamless collaboration across work",
                )}
              </span>
            </div>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="main-content home-main-content">
      <div className="home-dashboard">
        <section className="home-new-task-section">
          <button
            type="button"
            className="home-new-task-btn"
            onClick={onNewSession}
          >
            <Plus size={20} strokeWidth={2.5} />
            <span>{t("home.newTask", "Start a new Task")}</span>
          </button>
        </section>

        {/* Running Tasks */}
        <section className="home-section">
          <div className="home-section-header">
            <h2>{t("home.runningTasks.title", "Running Tasks")}</h2>
            <button
              type="button"
              className="home-section-link"
              onClick={onNewSession}
            >
              {t("home.runningTasks.viewAll", "View all tasks")}{" "}
              <ArrowRight size={14} />
            </button>
          </div>
          <div className="home-task-grid">
            {displayTasks.map((task) => {
              const status = getTaskStatusInfo(task);
              const tone = getTaskTone(task);
              return (
                <button
                  type="button"
                  key={task.id}
                  className={`home-task-card tone-${tone}`}
                  onClick={() => onOpenTask(task.id)}
                >
                  <strong className="home-task-title">{task.title}</strong>
                  <div className="home-task-status-row">
                    <span className="home-task-status">
                      {status.icon === "live" && <CircleDot size={14} />}
                      {status.icon === "complete" && <CheckCircle2 size={14} />}
                      {status.icon === "paused" && <Pause size={14} />}
                      {status.label}
                    </span>
                    <span className="home-task-time">
                      {formatRelativeTime(task.updatedAt || task.createdAt)}
                    </span>
                  </div>
                </button>
              );
            })}
            {displayTasks.length === 0 && (
              <div className="home-empty-state home-empty-wide">
                <FileText size={18} />
                <span>
                  {t("home.runningTasks.empty", "No running tasks right now.")}
                </span>
              </div>
            )}
          </div>
        </section>

        {/* Automation */}
        <section className="home-section">
          <div className="home-section-header">
            <h2>{t("home.automations.title", "Automations")}</h2>
          </div>
          <div ref={automationInboxRef} className="home-automation-inbox">
            <div className="home-automation-inbox-header">
              <div>
                <h3>{t("home.companionInbox.title", "Companion Inbox")}</h3>
                <p>
                  {t(
                    "home.companionInbox.description",
                    "Suggestions, summaries, and completed outputs from the automation core.",
                  )}
                </p>
              </div>
              <button
                type="button"
                className="home-section-link"
                onClick={() => {
                  if (automationInboxRef.current) {
                    automationInboxRef.current.scrollIntoView({
                      behavior: "smooth",
                      block: "start",
                    });
                  }
                }}
              >
                <Mail size={14} /> {t("home.companionInbox.open", "Open inbox")}
              </button>
            </div>
            {companionLoading && companionInboxItems.length === 0 ? (
              <div className="home-automation-inbox-empty">
                {t("home.companionInbox.loading", "Loading companion inbox...")}
              </div>
            ) : companionError && companionInboxItems.length === 0 ? (
              <div className="home-automation-inbox-empty">
                {companionError}
              </div>
            ) : companionInboxItems.length === 0 ? (
              <div className="home-automation-inbox-empty">
                {t(
                  "home.companionInbox.empty",
                  "No automation messages yet. When heartbeat, reflection, or memory produce suggestions or completed work, they will surface here like an inbox.",
                )}
              </div>
            ) : (
              <>
                {selectedCompanionItem && (
                  <div className="home-automation-inbox-reader">
                    <div className="home-automation-inbox-reader-header">
                      <div className="home-automation-inbox-reader-from">
                        <span className="home-automation-inbox-pill">
                          {isCompanionTaskResultItem(selectedCompanionItem)
                            ? t("home.companionInbox.completed", "Completed")
                            : selectedCompanionItem.recommendedDelivery ===
                                "nudge"
                              ? t("home.companionInbox.nudge", "Nudge")
                              : selectedCompanionItem.companionStyle === "email"
                                ? t("home.companionInbox.inbox", "Inbox")
                                : t(
                                    "home.companionInbox.companion",
                                    "Companion",
                                  )}
                        </span>
                        <div>
                          <strong>
                            {selectedCompanionItem.sourceEntity ||
                              selectedCompanionItem.workspaceName ||
                              "Heartbeat"}
                          </strong>
                          <span>
                            {t("home.companionInbox.toYou", "to you")}
                          </span>
                        </div>
                      </div>
                      <span className="home-automation-inbox-time">
                        {formatRelativeTime(selectedCompanionItem.createdAt)}
                      </span>
                    </div>
                    <div className="home-automation-inbox-reader-subject">
                      {t("home.companionInbox.subject", "Subject")}:{" "}
                      {selectedCompanionItem.title}
                    </div>
                    <div className="home-automation-inbox-reader-body markdown-content">
                      <ReactMarkdown remarkPlugins={inboxMarkdownPlugins}>
                        {normalizeMarkdownForCollab(
                          selectedCompanionItem.description || "",
                        )}
                      </ReactMarkdown>
                    </div>
                    {!isCompanionTaskResultItem(selectedCompanionItem) &&
                      selectedCompanionItem.actionPrompt && (
                        <div className="home-automation-inbox-reader-box">
                          <span>
                            {t(
                              "home.companionInbox.suggestedAction",
                              "Suggested action",
                            )}
                          </span>
                          <p>{selectedCompanionItem.actionPrompt}</p>
                        </div>
                      )}
                    {isCompanionTaskResultItem(selectedCompanionItem) &&
                      selectedCompanionItem.outputLabel && (
                        <div className="home-automation-inbox-reader-box">
                          <span>
                            {t(
                              "home.companionInbox.outputSummary",
                              "What came out of it",
                            )}
                          </span>
                          <p>
                            {selectedCompanionItem.outputLabel}
                            {selectedCompanionItem.outputLocationLabel
                              ? ` ${t("home.companionInbox.inLocation", "in")} ${selectedCompanionItem.outputLocationLabel}`
                              : ""}
                          </p>
                        </div>
                      )}
                    <div className="home-automation-inbox-meta">
                      <span>
                        {isCompanionTaskResultItem(selectedCompanionItem)
                          ? selectedCompanionItem.terminalLabel
                          : selectedCompanionItem.urgency
                            ? `${t("home.companionInbox.priority", "Priority")}: ${selectedCompanionItem.urgency}`
                            : t("home.companionInbox.item", "Inbox item")}
                      </span>
                      {isCompanionTaskResultItem(selectedCompanionItem) && (
                        <span>{selectedCompanionItem.automationTag}</span>
                      )}
                      <span>
                        {!isCompanionTaskResultItem(selectedCompanionItem) &&
                        selectedCompanionItem.workspaceScope === "all"
                          ? t(
                              "home.companionInbox.allWorkspaces",
                              "All workspaces",
                            )
                          : selectedCompanionItem.workspaceName ||
                            t(
                              "home.companionInbox.currentWorkspace",
                              "Current workspace",
                            )}
                      </span>
                      {isCompanionTaskResultItem(selectedCompanionItem) &&
                        selectedCompanionItem.outputCount && (
                          <span>
                            {t(
                              "home.companionInbox.outputCount",
                              "{count} output(s)",
                            ).replace(
                              "{count}",
                              String(selectedCompanionItem.outputCount),
                            )}
                          </span>
                        )}
                      {selectedCompanionItem.sourceTaskId && (
                        <span>
                          {t(
                            "home.companionInbox.relatedTaskAvailable",
                            "Related task available",
                          )}
                        </span>
                      )}
                    </div>
                    <div className="home-automation-inbox-actions">
                      {selectedCompanionItem.sourceTaskId && (
                        <button
                          type="button"
                          className="home-automation-inbox-action"
                          onClick={() => {
                            if (selectedCompanionItem.sourceTaskId) {
                              onOpenTask(selectedCompanionItem.sourceTaskId);
                            }
                          }}
                        >
                          {isCompanionTaskResultItem(selectedCompanionItem)
                            ? t("home.companionInbox.openTask", "Open task")
                            : t(
                                "home.companionInbox.openRelatedTask",
                                "Open related task",
                              )}
                        </button>
                      )}
                      {!isCompanionTaskResultItem(selectedCompanionItem) && (
                        <>
                          <button
                            type="button"
                            className="home-automation-inbox-action primary"
                            onClick={() =>
                              void handleActOnCompanionSuggestion(
                                selectedCompanionItem,
                              )
                            }
                            disabled={!selectedCompanionItem.actionPrompt}
                          >
                            {t("home.companionInbox.act", "Act")}
                          </button>
                          <button
                            type="button"
                            className="home-automation-inbox-action"
                            onClick={() =>
                              void handleSnoozeCompanionSuggestion(
                                selectedCompanionItem.id,
                              )
                            }
                          >
                            {t("home.companionInbox.snooze", "Snooze")}
                          </button>
                          <button
                            type="button"
                            className="home-automation-inbox-action"
                            onClick={() =>
                              void handleDismissCompanionSuggestion(
                                selectedCompanionItem.id,
                              )
                            }
                          >
                            {t("home.companionInbox.dismiss", "Dismiss")}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}
                <div className="home-automation-inbox-list">
                  {companionInboxItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`home-automation-inbox-item ${
                        selectedCompanionItem?.id === item.id ? "selected" : ""
                      }`}
                      onClick={() => setSelectedCompanionItemId(item.id)}
                    >
                      <div className="home-automation-inbox-item-body">
                        <div className="home-automation-inbox-item-top">
                          <div className="home-automation-inbox-item-sender">
                            <span className="home-automation-inbox-pill">
                              {isCompanionTaskResultItem(item)
                                ? t(
                                    "home.companionInbox.completed",
                                    "Completed",
                                  )
                                : item.recommendedDelivery === "nudge"
                                  ? t("home.companionInbox.nudge", "Nudge")
                                  : item.companionStyle === "email"
                                    ? t("home.companionInbox.inbox", "Inbox")
                                    : t(
                                        "home.companionInbox.companion",
                                        "Companion",
                                      )}
                            </span>
                            <strong className="home-automation-inbox-item-sender-name">
                              {item.sourceEntity ||
                                item.workspaceName ||
                                t(
                                  "home.automation.sender.heartbeat",
                                  "Heartbeat",
                                )}
                            </strong>
                          </div>
                          <span className="home-automation-inbox-time">
                            {formatRelativeTime(item.createdAt)}
                          </span>
                        </div>
                        <div className="home-automation-inbox-item-subject">
                          {item.title}
                        </div>
                        <p className="home-automation-inbox-preview">
                          {item.description}
                        </p>
                      </div>
                      <div className="home-automation-inbox-meta">
                        <span>
                          {isCompanionTaskResultItem(item)
                            ? item.terminalLabel
                            : item.urgency
                              ? `${t("home.companionInbox.priority", "Priority")}: ${item.urgency}`
                              : t("home.companionInbox.item", "Inbox item")}
                        </span>
                        {isCompanionTaskResultItem(item) && (
                          <span>{item.automationTag}</span>
                        )}
                        <span>
                          {!isCompanionTaskResultItem(item) &&
                          item.workspaceScope === "all"
                            ? t(
                                "home.companionInbox.allWorkspaces",
                                "All workspaces",
                              )
                            : item.workspaceName ||
                              t(
                                "home.companionInbox.currentWorkspace",
                                "Current workspace",
                              )}
                        </span>
                        {isCompanionTaskResultItem(item) &&
                          item.outputLabel && <span>{item.outputLabel}</span>}
                        {item.sourceTaskId && (
                          <span>
                            {t("home.companionInbox.taskLinked", "Task linked")}
                          </span>
                        )}
                        {!isCompanionTaskResultItem(item) &&
                          item.read === false && (
                            <span>
                              {t("home.companionInbox.unread", "Unread")}
                            </span>
                          )}
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <div className="home-automation-strip">
            <button
              type="button"
              className="home-auto-card"
              onClick={onOpenEverydayAgent}
            >
              <div className="home-auto-card-icon">
                <Sparkles size={20} />
              </div>
              <div className="home-auto-card-copy">
                <strong>
                  {t("home.automation.everydayAgent", "Everyday Agent")}
                </strong>
                <span>{everydayAgentStatusText}</span>
              </div>
            </button>
            <button
              type="button"
              className="home-auto-card"
              onClick={onOpenScheduledTasks}
            >
              <div className="home-auto-card-icon">
                <TimerReset size={20} />
              </div>
              <div className="home-auto-card-copy">
                <strong>
                  {t("home.automation.triggeredWork", "Triggered Work")}
                </strong>
                <span>
                  {t(
                    "home.automation.recurringCount",
                    "{count} recurring",
                  ).replace("{count}", String(automationGroups.cron))}
                </span>
              </div>
            </button>
            <button
              type="button"
              className="home-auto-card"
              onClick={onOpenMissionControl}
            >
              <div className="home-auto-card-icon">
                <Bot size={20} />
              </div>
              <div className="home-auto-card-copy">
                <strong>
                  {t("home.automation.coreAutomation", "Core automation")}
                </strong>
                <span>
                  {t(
                    "home.automation.heartbeatReviews",
                    "{count} heartbeat reviews",
                  ).replace("{count}", String(automationGroups.heartbeat))}
                </span>
              </div>
            </button>
            <button
              type="button"
              className="home-auto-card"
              onClick={onOpenEventTriggers}
            >
              <div className="home-auto-card-icon">
                <Zap size={20} />
              </div>
              <div className="home-auto-card-copy">
                <strong>{t("home.automation.triggers", "Triggers")}</strong>
                <span>
                  {t(
                    "home.automation.triggerCount",
                    "{count} triggers",
                  ).replace(
                    "{count}",
                    String(automationGroups.hook + automationGroups.api),
                  )}
                </span>
              </div>
            </button>
            <button
              type="button"
              className="home-auto-card"
              onClick={onOpenSelfImprove}
            >
              <div className="home-auto-card-icon">
                <Sparkles size={20} />
              </div>
              <div className="home-auto-card-copy">
                <strong>
                  {t(
                    "home.automation.workflowIntelligence",
                    "Workflow Intelligence",
                  )}
                </strong>
                <span>
                  {t(
                    "home.automation.coreRunCount",
                    "{count} core runs",
                  ).replace("{count}", String(automationGroups.improvement))}
                </span>
              </div>
            </button>
          </div>
          {automatedTasks.length > 0 && (
            <div className="home-automation-panel">
              <div className="home-automation-panel-header">
                <span>
                  {t(
                    "home.automation.automatedTaskCount",
                    "{count} automated tasks",
                  ).replace("{count}", String(automatedTasks.length))}
                </span>
              </div>
              <div
                className="home-automation-list"
                onScroll={handleAutomationListScroll}
              >
                {automationTopSpacer > 0 && (
                  <div
                    aria-hidden="true"
                    style={{
                      height: `${automationTopSpacer}px`,
                      flexShrink: 0,
                    }}
                  />
                )}
                {visibleAutomatedTasks.map((task) => {
                  const status = getTaskStatusInfo(task);
                  const sender = getAutomationSender(task);
                  const tag = getAutomationTag(task);
                  const preview = getAutomationPreview(task);
                  return (
                    <button
                      type="button"
                      key={task.id}
                      className="home-automation-row home-automation-mail-row"
                      onClick={() => onOpenTask(task.id)}
                    >
                      <div className="home-automation-mail-row-top">
                        <div className="home-automation-mail-row-sender">
                          <span className="home-automation-inbox-pill">
                            {tag}
                          </span>
                          <strong>{sender}</strong>
                        </div>
                        <span className="home-automation-row-time">
                          {formatRelativeTime(task.updatedAt || task.createdAt)}
                        </span>
                      </div>
                      <div className="home-automation-mail-row-subject">
                        {task.title}
                      </div>
                      <div className="home-automation-mail-row-preview">
                        {preview}
                      </div>
                      <div className="home-automation-mail-row-meta">
                        <span>{status.label}</span>
                        {task.resultSummary?.trim() && (
                          <span>
                            {t("home.automation.resultReady", "Result ready")}
                          </span>
                        )}
                        {resolveTaskOutputSummaryFromTask(task)?.outputCount ? (
                          <span>
                            {t(
                              "home.companionInbox.outputCount",
                              "{count} outputs",
                            ).replace(
                              "{count}",
                              String(
                                resolveTaskOutputSummaryFromTask(task)
                                  ?.outputCount || 0,
                              ),
                            )}
                          </span>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
                {automationBottomSpacer > 0 && (
                  <div
                    aria-hidden="true"
                    style={{
                      height: `${automationBottomSpacer}px`,
                      flexShrink: 0,
                    }}
                  />
                )}
              </div>
              <div className="home-automation-panel-footer">
                <span>
                  {t(
                    "home.automation.openTaskHint",
                    "Click a row to open the task in normal task view.",
                  )}
                </span>
              </div>
            </div>
          )}
        </section>

        {/* Files */}
        <section className="home-section">
          <div className="home-section-header">
            <h2>{t("home.files.title", "Files")}</h2>
            <button
              type="button"
              className="home-section-link"
              onClick={() => {
                const firstFile = recentHubFiles[0];
                if (firstFile?.path) {
                  void (window as any).electronAPI.openFile(
                    firstFile.path,
                    workspace?.path,
                  );
                }
              }}
              disabled={
                recentHubFiles.length === 0 && recentOutputs.length === 0
              }
            >
              {t("home.files.viewAll", "View all files")}{" "}
              <ArrowRight size={14} />
            </button>
          </div>
          <div className="home-files-scroll">
            {recentOutputs.slice(0, 6).map((output) => (
              <button
                type="button"
                key={output.filePath}
                className="home-file-thumb"
                onClick={() => onOpenTask(output.taskId)}
              >
                <HomeFilePreview
                  filePath={output.filePath}
                  workspacePath={workspace?.path}
                  fileName={output.fileName}
                />
                <div className="home-file-thumb-label">
                  <strong>{output.fileName}</strong>
                  <span>{output.taskTitle}</span>
                </div>
              </button>
            ))}
            {recentHubFiles.slice(0, 4).map((file) => (
              <button
                type="button"
                key={file.id}
                className="home-file-thumb"
                onClick={() =>
                  void (window as any).electronAPI.openFile(
                    file.path,
                    workspace?.path,
                  )
                }
              >
                <HomeFilePreview
                  filePath={file.path}
                  workspacePath={workspace?.path}
                  fileName={file.name}
                  isDirectory={file.isDirectory}
                  cloudThumbnailUrl={file.thumbnailUrl}
                />
                <div className="home-file-thumb-label">
                  <strong>{file.name}</strong>
                  <span>
                    {file.isDirectory
                      ? t("home.files.folder", "Folder")
                      : formatFileSize(file.size)}
                  </span>
                </div>
              </button>
            ))}
            {recentOutputs.length === 0 && recentHubFiles.length === 0 && (
              <div className="home-empty-state home-empty-wide">
                <FileText size={18} />
                <span>
                  {t(
                    "home.files.empty",
                    "No files yet. Completed sessions with artifacts will show up here.",
                  )}
                </span>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
