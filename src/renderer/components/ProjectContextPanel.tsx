import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ComponentType, CSSProperties } from "react";
import type { LucideProps } from "lucide-react";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Eye,
  File,
  FileArchive,
  FileAudio,
  FileCode2,
  FileImage,
  FileJson2,
  FileSpreadsheet,
  FileText,
  FileType2,
  FileVideo,
  Folder,
  FolderOpen,
  Globe2,
  GitBranch,
  History,
  Presentation,
  RefreshCw,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import {
  isTempWorkspaceId,
  type Task,
  type TaskEvent,
  type Workspace,
} from "../../shared/types";
import { canPreviewDocumentInApp } from "../../shared/document-formats";
import { canPreviewPresentationInApp } from "../../shared/presentation-formats";
import { canOpenSpreadsheetInApp } from "../../shared/spreadsheet-formats";
import { canPreviewWebPageInApp } from "../../shared/web-page-formats";
import { getEffectiveTaskEventType } from "../utils/task-event-compat";
import { requestConversationTurnNavigation } from "../utils/conversation-turn-navigation";
import { getLocalizedSubagentDisplay } from "../utils/localized-agent-roles";
import { translate, getCurrentLanguage } from "../i18n";
import { FEATURE_VISIBILITY } from "../feature-visibility";
import { DocumentAwareFileModal } from "./DocumentAwareFileModal";
import { getInlinePreviewKindForGeneratedFile } from "./MainContent/artifact-logic";
import {
  deriveSharedTaskEventUiState,
  type FileInfo,
  type SharedTaskEventUiState,
} from "../utils/task-event-derived";
import {
  getArtifactPathIdentityKey,
  isCanonicalTaskArtifactOutputPath,
} from "../utils/artifact-path-identity";
import "./project-context-panel.css";

type ProjectPanelTab = "outputs" | "files" | "changes" | "session";
const projectPanelStateCache = new Map<
  string,
  { activeTab: ProjectPanelTab; scrollTop: number }
>();

export type WorkspaceFile = {
  id: string;
  name: string;
  path: string;
  mimeType?: string;
  size?: number;
  modifiedAt?: number;
  isDirectory?: boolean;
};

export function derivePromotedWorkspaceOutputs(options: {
  isWorkspaceRoot: boolean;
  outputFiles: FileInfo[];
  workspaceFiles: WorkspaceFile[];
  workspacePath?: string;
  query?: string;
}): FileInfo[] {
  // The workspace tab reflects files that already exist, not the task's
  // terminal status. A long-running task can emit a usable artifact before it
  // is completed, and an app restart can leave that task interrupted while
  // the file remains safely on disk. Keep the stricter completed-only gate on
  // "This turn's artifacts", but always promote event-backed files here.
  if (!options.isWorkspaceRoot) return [];

  const currentFolderFileKeys = new Set(
    options.workspaceFiles
      .filter((file) => !file.isDirectory)
      .map((file) =>
        getArtifactPathIdentityKey(file.path, options.workspacePath),
      ),
  );
  const normalizedQuery = String(options.query || "")
    .trim()
    .toLowerCase();
  return options.outputFiles.filter((file) => {
    const identityKey = getArtifactPathIdentityKey(
      file.path,
      options.workspacePath,
    );
    if (!identityKey || currentFolderFileKeys.has(identityKey)) return false;
    return (
      !normalizedQuery ||
      fileName(file.path).toLowerCase().includes(normalizedQuery)
    );
  });
}

export function deriveCopiedSourceArtifactPathKeys(
  events: TaskEvent[],
  workspacePath?: string,
): Set<string> {
  const copiedSourceKeys = new Set<string>();
  for (const event of events) {
    if (getEffectiveTaskEventType(event) !== "file_created") continue;
    const copiedFrom = event.payload?.copiedFrom;
    const destination = event.payload?.path;
    if (typeof copiedFrom !== "string" || typeof destination !== "string") {
      continue;
    }
    const sourceKey = getArtifactPathIdentityKey(copiedFrom, workspacePath);
    const destinationKey = getArtifactPathIdentityKey(
      destination,
      workspacePath,
    );
    if (sourceKey && sourceKey !== destinationKey) {
      copiedSourceKeys.add(sourceKey);
    }
  }
  return copiedSourceKeys;
}

export function collapseSupersededTaskOutputFiles(
  files: FileInfo[],
  workspacePath?: string,
): FileInfo[] {
  const canonicalFileNames = new Set(
    files
      .filter((file) => isCanonicalTaskArtifactOutputPath(file.path))
      .map((file) => fileName(file.path).toLowerCase()),
  );
  const seenPaths = new Set<string>();

  return files.filter((file) => {
    const isCanonical = isCanonicalTaskArtifactOutputPath(file.path);
    if (
      !isCanonical &&
      canonicalFileNames.has(fileName(file.path).toLowerCase())
    ) {
      return false;
    }
    const identityKey = getArtifactPathIdentityKey(file.path, workspacePath);
    if (!identityKey || seenPaths.has(identityKey)) return false;
    seenPaths.add(identityKey);
    return true;
  });
}

const RECOVERED_OUTPUT_GRACE_MS = 30 * 60 * 1000;
const RECOVERED_OUTPUT_CLOCK_SKEW_MS = 5_000;

export function shouldPublishTaskOutputs(task?: Task): boolean {
  return task?.status === "completed";
}

function taskOutputPublicationFailed(task?: Task): boolean {
  return (
    task?.status === "failed" ||
    task?.status === "cancelled" ||
    task?.status === "interrupted"
  );
}

export function deriveRecoveredTemporaryWorkspaceOutputs({
  task,
  workspace,
  files,
}: {
  task: Task | undefined;
  workspace: Workspace | null;
  files: WorkspaceFile[];
}): FileInfo[] {
  if (!task || !workspace) return [];
  if (
    !workspace.isTemp &&
    !isTempWorkspaceId(workspace.id) &&
    !isTempWorkspaceId(task.workspaceId)
  ) {
    return [];
  }
  if (!/missing artifact evidence/i.test(String(task.error || ""))) return [];

  const startedAt = Math.max(
    0,
    task.createdAt - RECOVERED_OUTPUT_CLOCK_SKEW_MS,
  );
  const finishedAt = task.completedAt || task.updatedAt || Date.now();
  const latestRecoveryAt = finishedAt + RECOVERED_OUTPUT_GRACE_MS;

  return files
    .filter((file) => {
      if (file.isDirectory) return false;
      if (!file.path || !Number.isFinite(file.modifiedAt)) return false;
      return (
        Number(file.modifiedAt) >= startedAt &&
        Number(file.modifiedAt) <= latestRecoveryAt
      );
    })
    .sort((left, right) => Number(right.modifiedAt) - Number(left.modifiedAt))
    .map((file) => ({
      path: file.path,
      action: "created" as const,
      timestamp: Number(file.modifiedAt),
    }));
}

interface ProjectContextPanelProps {
  task: Task | undefined;
  workspace: Workspace | null;
  projectId?: string | null;
  sessionTasks?: Task[];
  events: TaskEvent[];
  sharedTaskEventUi?: SharedTaskEventUiState | null;
  onOpenSpreadsheetArtifact?: (path: string) => void;
  onOpenDocumentArtifact?: (path: string) => void;
  onOpenPresentationArtifact?: (path: string) => void;
  onOpenWebArtifact?: (path: string) => void;
  onSelectTask?: (taskId: string) => void;
  onCollapse?: () => void;
}

export type SessionTaskNode = {
  task: Task;
  depth: number;
  relation: "root" | "continuation" | "child" | "branch";
  sourceTaskId?: string;
};

export type SessionConversationRound = {
  id: string;
  turnId: string;
  userText: string;
  assistantText?: string;
  timestamp: number;
  status: "completed" | "working" | "failed" | "waiting";
};

type PendingSessionConversationRound = Omit<
  SessionConversationRound,
  "status"
> & {
  completed: boolean;
  failed: boolean;
  synthetic: boolean;
};

function taskConversationPrompt(task?: Task): string {
  if (!task) return "";
  return String(task.userPrompt || task.rawPrompt || task.prompt || "").trim();
}

function normalizeConversationText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function eventConversationText(event: TaskEvent): string {
  const effectiveType = getEffectiveTaskEventType(event);
  if (
    effectiveType === "user_message" ||
    effectiveType === "assistant_message"
  ) {
    return typeof event.payload?.message === "string"
      ? event.payload.message.trim()
      : "";
  }
  return "";
}

export function buildSessionConversationRounds(
  events: TaskEvent[],
  task?: Task,
): SessionConversationRound[] {
  const orderedEvents = [...events].sort(
    (left, right) => left.timestamp - right.timestamp,
  );
  const taskPrompt = taskConversationPrompt(task);
  const pendingRounds: PendingSessionConversationRound[] = [];
  let current: PendingSessionConversationRound | null = taskPrompt
    ? {
        id: `task-prompt-${task?.id || "current"}`,
        turnId: "initial",
        userText: taskPrompt,
        timestamp: task?.createdAt || orderedEvents[0]?.timestamp || 0,
        completed: false,
        failed: false,
        synthetic: true,
      }
    : null;

  const finishCurrent = () => {
    if (!current?.userText.trim()) return;
    pendingRounds.push(current);
    current = null;
  };

  for (const event of orderedEvents) {
    const effectiveType = getEffectiveTaskEventType(event);
    if (effectiveType === "user_message") {
      const userText = eventConversationText(event);
      if (!userText) continue;
      const normalizedCurrentText = normalizeConversationText(
        current?.userText || "",
      );
      const normalizedUserText = normalizeConversationText(userText);
      const repeatsSyntheticPrompt =
        current?.synthetic &&
        (normalizedCurrentText === normalizedUserText ||
          normalizedCurrentText.startsWith(normalizedUserText) ||
          normalizedUserText.startsWith(normalizedCurrentText));
      if (repeatsSyntheticPrompt && current) {
        current.id = event.id;
        current.timestamp = event.timestamp;
        current.synthetic = false;
        continue;
      }
      finishCurrent();
      current = {
        id: event.id,
        turnId: `event:${event.id}`,
        userText,
        timestamp: event.timestamp,
        completed: false,
        failed: false,
        synthetic: false,
      };
      continue;
    }

    if (!current) continue;
    if (effectiveType === "assistant_message") {
      const assistantText = eventConversationText(event);
      if (assistantText) current.assistantText = assistantText;
      continue;
    }
    if (
      effectiveType === "task_completed" ||
      effectiveType === "follow_up_completed"
    ) {
      current.completed = true;
      continue;
    }
    if (
      effectiveType === "task_failed" ||
      effectiveType === "follow_up_failed" ||
      effectiveType === "task_cancelled"
    ) {
      current.failed = true;
    }
  }
  finishCurrent();

  return pendingRounds.map((round, index) => {
    const isLatest = index === pendingRounds.length - 1;
    const isWorking =
      isLatest &&
      Boolean(
        task && ["queued", "planning", "executing"].includes(task.status),
      );
    return {
      id: round.id,
      turnId: round.turnId,
      userText: round.userText,
      ...(round.assistantText ? { assistantText: round.assistantText } : {}),
      timestamp: round.timestamp,
      status: round.completed
        ? "completed"
        : round.failed
          ? "failed"
          : isWorking
            ? "working"
            : "waiting",
    };
  });
}

export function buildSessionTaskNodes(
  tasks: Task[],
  currentTaskId?: string,
): SessionTaskNode[] {
  const unique = new Map(tasks.map((task) => [task.id, task]));
  const ordered = [...unique.values()].sort(
    (left, right) => left.createdAt - right.createdAt,
  );
  const depthCache = new Map<string, number>();
  const depthFor = (task: Task, seen = new Set<string>()): number => {
    const cached = depthCache.get(task.id);
    if (typeof cached === "number") return cached;
    if (seen.has(task.id)) return 0;
    seen.add(task.id);
    const sourceId = task.branchFromTaskId || task.parentTaskId;
    const source = sourceId ? unique.get(sourceId) : undefined;
    const depth = source ? Math.min(6, depthFor(source, seen) + 1) : 0;
    depthCache.set(task.id, depth);
    return depth;
  };
  const rootSessionId = ordered.find(
    (task) => task.id === currentTaskId,
  )?.sessionId;
  return ordered.map((task, index) => {
    const sourceTaskId = task.branchFromTaskId || task.parentTaskId;
    const relation: SessionTaskNode["relation"] = task.branchFromTaskId
      ? "branch"
      : task.parentTaskId
        ? "child"
        : index === 0 || (rootSessionId && task.sessionId !== rootSessionId)
          ? "root"
          : "continuation";
    return {
      task,
      depth: depthFor(task),
      relation,
      ...(sourceTaskId ? { sourceTaskId } : {}),
    };
  });
}

export function buildRelatedSessionTaskTitles(
  nodes: SessionTaskNode[],
  language = getCurrentLanguage(),
): Map<string, string> {
  const titleOccurrences = new Map<string, number>();

  return new Map(
    nodes.map((node) => {
      const rawTitle =
        node.task.title?.trim() ||
        node.task.prompt?.trim() ||
        (language === "zh-CN"
          ? translate(
              "generated.components.projectcontextpanel.341.0",
              "Unnamed task",
            )
          : "Untitled task");
      const localizedTitle = getLocalizedSubagentDisplay(
        rawTitle,
        language,
      ).name;
      const occurrence = (titleOccurrences.get(localizedTitle) || 0) + 1;
      titleOccurrences.set(localizedTitle, occurrence);

      const displayTitle =
        occurrence > 1
          ? translate("projectContext.retryTitle", "{title} (retry {count})", {
              title: localizedTitle,
              count: occurrence - 1,
            })
          : localizedTitle;

      return [node.task.id, displayTitle];
    }),
  );
}

function sessionNodeStatusLabel(status: Task["status"]): string {
  if (["executing", "planning", "queued"].includes(status))
    return translate(
      "generated.components.projectcontextpanel.362.1",
      "In progress",
    );
  if (status === "completed")
    return translate(
      "generated.components.projectcontextpanel.363.2",
      "Completed",
    );
  if (["paused", "blocked"].includes(status))
    return translate(
      "generated.components.projectcontextpanel.364.3",
      "Need attention",
    );
  if (["failed", "cancelled", "interrupted"].includes(status))
    return translate("generated.components.projectcontextpanel.365.4", "ended");
  return translate(
    "generated.components.projectcontextpanel.366.5",
    "To be started",
  );
}

function sessionNodeRelationLabel(
  relation: SessionTaskNode["relation"],
): string {
  if (relation === "branch")
    return translate(
      "generated.components.projectcontextpanel.372.6",
      "Branch tasks",
    );
  if (relation === "child")
    return translate(
      "generated.components.projectcontextpanel.373.7",
      "subtask",
    );
  if (relation === "continuation")
    return translate(
      "generated.components.projectcontextpanel.374.8",
      "continuous tasks",
    );
  return translate(
    "generated.components.projectcontextpanel.375.9",
    "conversation starting point",
  );
}

function sessionRoundStatusLabel(
  status: SessionConversationRound["status"],
): string {
  if (status === "completed")
    return translate(
      "generated.components.projectcontextpanel.381.10",
      "Completed",
    );
  if (status === "working")
    return translate(
      "generated.components.projectcontextpanel.382.11",
      "Replying",
    );
  if (status === "failed")
    return translate(
      "generated.components.projectcontextpanel.383.12",
      "Not completed",
    );
  return translate(
    "generated.components.projectcontextpanel.384.13",
    "Waiting for reply",
  );
}

function sessionTextPreview(text: string, limit = 220): string {
  const cleaned = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[`#>*_~|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length > limit
    ? `${cleaned.slice(0, limit).trim()}…`
    : cleaned;
}

function SessionConversationRoundCard({
  round,
  index,
  initiallyOpen,
  onNavigate,
}: {
  round: SessionConversationRound;
  index: number;
  initiallyOpen: boolean;
  onNavigate: (turnId: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(initiallyOpen);
  const answerId = `project-session-round-answer-${round.id.replace(
    /[^a-zA-Z0-9_-]/g,
    "-",
  )}`;
  return (
    <article
      className={`project-session-round status-${round.status}`}
      data-expanded={isOpen ? "true" : "false"}
    >
      <div className="project-session-round-header">
        <button
          type="button"
          className="project-session-round-jump"
          title={translate(
            "projectContext.jumpToRound",
            "Jump to conversation round {round}",
            { round: index + 1 },
          )}
          onClick={() => onNavigate(round.turnId)}
        >
          <span className="project-session-round-index">{index + 1}</span>
          <span className="project-session-round-copy">
            <strong>{sessionTextPreview(round.userText, 110)}</strong>
            <small>
              {sessionRoundStatusLabel(round.status)} ·{" "}
              {formatTime(round.timestamp)}
            </small>
          </span>
        </button>
        <button
          type="button"
          className="project-session-round-toggle"
          aria-expanded={isOpen}
          aria-controls={answerId}
          aria-label={translate(
            "projectContext.toggleRoundReply",
            "{action} reply for round {round}",
            {
              action: isOpen
                ? translate(
                    "generated.components.projectcontextpanel.438.14",
                    "Close",
                  )
                : translate(
                    "generated.components.projectcontextpanel.438.15",
                    "Expand",
                  ),
              round: index + 1,
            },
          )}
          onClick={() => setIsOpen((currentValue) => !currentValue)}
        >
          <ChevronDown size={15} aria-hidden="true" />
        </button>
      </div>
      {isOpen ? (
        <div className="project-session-round-answer" id={answerId}>
          <span>
            {translate(
              "generated.components.projectcontextpanel.446.16",
              "Reply",
            )}
          </span>
          <p>
            {round.assistantText
              ? sessionTextPreview(round.assistantText)
              : round.status === "working"
                ? translate(
                    "generated.components.projectcontextpanel.451.17",
                    "NeoWorker is handling this round.",
                  )
                : translate(
                    "generated.components.projectcontextpanel.452.18",
                    "There has been no final response this round.",
                  )}
          </p>
        </div>
      ) : null}
    </article>
  );
}

const CODE_EXTENSIONS = new Set([
  "css",
  "go",
  "html",
  "java",
  "js",
  "jsx",
  "py",
  "rs",
  "sh",
  "sql",
  "ts",
  "tsx",
  "xml",
  "yaml",
  "yml",
]);
const SPREADSHEET_EXTENSIONS = new Set([
  "csv",
  "ods",
  "tsv",
  "xls",
  "xlsm",
  "xlsx",
]);
const IMAGE_EXTENSIONS = new Set([
  "avif",
  "gif",
  "heic",
  "ico",
  "jpeg",
  "jpg",
  "png",
  "svg",
  "webp",
]);
const PRESENTATION_EXTENSIONS = new Set(["key", "odp", "ppt", "pptx"]);
const JSON_EXTENSIONS = new Set(["geojson", "json", "jsonl", "ndjson"]);
const MARKDOWN_EXTENSIONS = new Set(["markdown", "md", "mdx"]);
const WORD_EXTENSIONS = new Set(["doc", "docx", "odt", "pages", "rtf"]);
const ARCHIVE_EXTENSIONS = new Set([
  "7z",
  "bz2",
  "gz",
  "rar",
  "tar",
  "tgz",
  "zip",
]);
const AUDIO_EXTENSIONS = new Set(["aac", "flac", "m4a", "mp3", "ogg", "wav"]);
const VIDEO_EXTENSIONS = new Set(["avi", "m4v", "mkv", "mov", "mp4", "webm"]);

type ProjectFileVisual = {
  Icon: ComponentType<LucideProps>;
  tone: string;
  formatBadge?: string;
  accessibleLabel: string;
};

function fileName(path: string): string {
  return path.replace(/\\/g, "/").split("/").filter(Boolean).pop() || path;
}

function extension(path: string): string {
  const name = fileName(path);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

export function getProjectFileVisual(
  path: string,
  isDirectory = false,
): ProjectFileVisual {
  if (isDirectory) {
    return {
      Icon: Folder,
      tone: "folder",
      accessibleLabel: translate(
        "generated.components.projectcontextpanel.537.19",
        "folder",
      ),
    };
  }
  const ext = extension(path);
  if (ext === "pdf") {
    return {
      Icon: FileText,
      tone: "file-pdf",
      formatBadge: "PDF",
      accessibleLabel: translate(
        "generated.components.projectcontextpanel.546.20",
        "PDF file",
      ),
    };
  }
  if (MARKDOWN_EXTENSIONS.has(ext)) {
    return {
      Icon: FileType2,
      tone: "file-markdown",
      formatBadge: "MD",
      accessibleLabel: translate(
        "generated.components.projectcontextpanel.554.21",
        "Markdown file",
      ),
    };
  }
  if (PRESENTATION_EXTENSIONS.has(ext)) {
    return {
      Icon: Presentation,
      tone: "file-presentation",
      formatBadge: ext === "key" ? "KEY" : "P",
      accessibleLabel:
        ext === "key"
          ? translate(
              "generated.components.projectcontextpanel.563.22",
              "Keynote presentation",
            )
          : translate(
              "generated.components.projectcontextpanel.563.23",
              "PowerPoint presentation",
            ),
    };
  }
  if (SPREADSHEET_EXTENSIONS.has(ext)) {
    return {
      Icon: FileSpreadsheet,
      tone: "file-spreadsheet",
      formatBadge: ["csv", "tsv"].includes(ext) ? ext.toUpperCase() : "X",
      accessibleLabel: ["csv", "tsv"].includes(ext)
        ? translate("files.type.generic", "{extension} file", {
            extension: ext.toUpperCase(),
          })
        : translate(
            "generated.components.projectcontextpanel.573.24",
            "spreadsheet",
          ),
    };
  }
  if (WORD_EXTENSIONS.has(ext)) {
    return {
      Icon: FileText,
      tone: "file-word",
      formatBadge: ["doc", "docx"].includes(ext) ? "W" : ext.toUpperCase(),
      accessibleLabel: ["doc", "docx"].includes(ext)
        ? translate(
            "generated.components.projectcontextpanel.582.25",
            "Word document",
          )
        : translate("files.type.document", "{extension} document", {
            extension: ext.toUpperCase(),
          }),
    };
  }
  if (JSON_EXTENSIONS.has(ext)) {
    return {
      Icon: FileJson2,
      tone: "file-json",
      accessibleLabel:
        ext === "ndjson"
          ? translate(
              "generated.components.projectcontextpanel.592.26",
              "NDJSON file",
            )
          : ext === "jsonl"
            ? translate(
                "generated.components.projectcontextpanel.594.27",
                "JSON Lines file",
              )
            : translate(
                "generated.components.projectcontextpanel.595.28",
                "JSON file",
              ),
    };
  }
  if (IMAGE_EXTENSIONS.has(ext)) {
    return {
      Icon: FileImage,
      tone: "file-image",
      accessibleLabel: translate("files.type.image", "{extension} image", {
        extension: ext.toUpperCase(),
      }),
    };
  }
  if (AUDIO_EXTENSIONS.has(ext)) {
    return {
      Icon: FileAudio,
      tone: "file-audio",
      accessibleLabel: translate("files.type.audio", "{extension} audio", {
        extension: ext.toUpperCase(),
      }),
    };
  }
  if (VIDEO_EXTENSIONS.has(ext)) {
    return {
      Icon: FileVideo,
      tone: "file-video",
      accessibleLabel: translate("files.type.video", "{extension} video", {
        extension: ext.toUpperCase(),
      }),
    };
  }
  if (ARCHIVE_EXTENSIONS.has(ext)) {
    return {
      Icon: FileArchive,
      tone: "file-archive",
      accessibleLabel: translate("files.type.archive", "{extension} archive", {
        extension: ext.toUpperCase(),
      }),
    };
  }
  if (["html", "htm"].includes(ext)) {
    return {
      Icon: Globe2,
      tone: "file-web",
      accessibleLabel: translate(
        "generated.components.projectcontextpanel.630.29",
        "HTML web page",
      ),
    };
  }
  if (CODE_EXTENSIONS.has(ext)) {
    return {
      Icon: FileCode2,
      tone: "file-code",
      formatBadge: ext.toUpperCase().slice(0, 3),
      accessibleLabel: translate("files.type.code", "{extension} code file", {
        extension: ext.toUpperCase(),
      }),
    };
  }
  if (ext === "txt") {
    return {
      Icon: FileText,
      tone: "file-document",
      formatBadge: "TXT",
      accessibleLabel: translate(
        "generated.components.projectcontextpanel.646.30",
        "text file",
      ),
    };
  }
  return {
    Icon: File,
    tone: "file-generic",
    formatBadge: ext ? ext.toUpperCase().slice(0, 4) : undefined,
    accessibleLabel: ext
      ? translate("files.type.generic", "{extension} file", {
          extension: ext.toUpperCase(),
        })
      : translate("generated.components.projectcontextpanel.653.31", "File"),
  };
}

function ProjectFileTypeIcon({
  path,
  isDirectory = false,
}: {
  path: string;
  isDirectory?: boolean;
}) {
  const { Icon, tone, formatBadge, accessibleLabel } = getProjectFileVisual(
    path,
    isDirectory,
  );
  return (
    <span
      className={`project-file-icon ${tone}`}
      aria-label={accessibleLabel}
      title={accessibleLabel}
    >
      <Icon size={19} strokeWidth={1.8} aria-hidden="true" />
      {formatBadge ? (
        <span className="project-file-format-badge" aria-hidden="true">
          <span className="project-file-format-badge-label">{formatBadge}</span>
        </span>
      ) : null}
    </span>
  );
}

function actionLabel(action: FileInfo["action"]): string {
  if (action === "created")
    return translate("generated.components.projectcontextpanel.685.32", "New");
  if (action === "modified")
    return translate(
      "generated.components.projectcontextpanel.686.33",
      "Modified",
    );
  return translate(
    "generated.components.projectcontextpanel.687.34",
    "Deleted",
  );
}

function formatTime(timestamp?: number): string {
  if (!timestamp) return "";
  const elapsed = Math.max(0, Date.now() - timestamp);
  if (elapsed < 60_000)
    return translate(
      "generated.components.projectcontextpanel.693.35",
      "Just now",
    );
  if (elapsed < 3_600_000)
    return translate("activity.time.minutesAgo", "{count} minutes ago", {
      count: Math.max(1, Math.floor(elapsed / 60_000)),
    });
  if (elapsed < 86_400_000)
    return translate("activity.time.hoursAgo", "{count} hours ago", {
      count: Math.floor(elapsed / 3_600_000),
    });
  return translate("activity.time.daysAgo", "{count} days ago", {
    count: Math.floor(elapsed / 86_400_000),
  });
}

export function ProjectContextPanel({
  task,
  workspace,
  projectId = null,
  sessionTasks = [],
  events,
  sharedTaskEventUi = null,
  onOpenSpreadsheetArtifact,
  onOpenDocumentArtifact,
  onOpenPresentationArtifact,
  onOpenWebArtifact,
  onSelectTask,
  onCollapse,
}: ProjectContextPanelProps) {
  const projectsVisible = FEATURE_VISIBILITY.projects;
  const visibleProjectId = projectsVisible
    ? projectId || task?.projectId || null
    : null;
  const panelStateKey = `${visibleProjectId || "no-project"}:${workspace?.id || "no-workspace"}:${task?.sessionId || task?.id || "no-task"}`;
  const panelStateKeyRef = useRef(panelStateKey);
  const panelBodyRef = useRef<HTMLDivElement>(null);
  const activeTabRef = useRef<ProjectPanelTab>(
    projectPanelStateCache.get(panelStateKey)?.activeTab || "outputs",
  );
  const [activeTab, setActiveTab] = useState<ProjectPanelTab>(
    activeTabRef.current,
  );
  const [query, setQuery] = useState("");
  const [folderPath, setFolderPath] = useState<string | null>(null);
  const [workspaceFiles, setWorkspaceFiles] = useState<WorkspaceFile[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [workspaceFilesError, setWorkspaceFilesError] = useState<string | null>(
    null,
  );
  const workspaceFilesRequestRef = useRef(0);
  const [recoveredOutputFiles, setRecoveredOutputFiles] = useState<FileInfo[]>(
    [],
  );
  const [isLoadingRecoveredOutputs, setIsLoadingRecoveredOutputs] =
    useState(false);
  const [viewerFilePath, setViewerFilePath] = useState<string | null>(null);
  const [hiddenOutputPaths, setHiddenOutputPaths] = useState<Set<string>>(
    () => new Set(),
  );
  const [projectName, setProjectName] = useState<string | null>(null);
  const handleNavigateConversationRound = useCallback(
    (turnId: string) => {
      if (!task?.id) return;
      requestConversationTurnNavigation({ taskId: task.id, turnId });
    },
    [task?.id],
  );

  useLayoutEffect(() => {
    panelStateKeyRef.current = panelStateKey;
    const cached = projectPanelStateCache.get(panelStateKey);
    const nextTab = cached?.activeTab || "outputs";
    activeTabRef.current = nextTab;
    setActiveTab(nextTab);
    const frame = window.requestAnimationFrame(() => {
      if (panelBodyRef.current)
        panelBodyRef.current.scrollTop = cached?.scrollTop || 0;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [panelStateKey]);

  useEffect(() => {
    activeTabRef.current = activeTab;
    const cached = projectPanelStateCache.get(panelStateKeyRef.current);
    projectPanelStateCache.set(panelStateKeyRef.current, {
      activeTab,
      scrollTop: cached?.scrollTop || 0,
    });
  }, [activeTab]);

  useEffect(
    () => () => {
      projectPanelStateCache.set(panelStateKeyRef.current, {
        activeTab: activeTabRef.current,
        scrollTop: panelBodyRef.current?.scrollTop || 0,
      });
    },
    [],
  );

  const taskUi = useMemo(
    () =>
      sharedTaskEventUi ||
      deriveSharedTaskEventUiState({
        rawEvents: events,
        task,
        workspace,
        projectionMode: "inspect",
      }),
    [events, sharedTaskEventUi, task, workspace],
  );
  const currentFolderPath = folderPath || workspace?.path || null;
  const taskFiles = taskUi.files;
  const taskOutputsReady = shouldPublishTaskOutputs(task);
  const taskOutputsFailed = taskOutputPublicationFailed(task);
  const taskOutputsPending = Boolean(
    task && !taskOutputsReady && !taskOutputsFailed,
  );
  const indexedOutputFiles = useMemo(
    () =>
      collapseSupersededTaskOutputFiles(
        taskFiles.filter((file) => file.action !== "deleted"),
        workspace?.path,
      ),
    [taskFiles, workspace?.path],
  );
  // File events are emitted as soon as tools write to disk. Keep drafts,
  // temporary validation files, and in-place edits out of "This turn's
  // artifacts" until the task reaches its verified terminal state.
  const outputFileCandidates = taskOutputsReady
    ? indexedOutputFiles.length > 0
      ? indexedOutputFiles
      : recoveredOutputFiles
    : [];
  const outputFiles = useMemo(
    () =>
      outputFileCandidates.filter((file) => !hiddenOutputPaths.has(file.path)),
    [hiddenOutputPaths, outputFileCandidates],
  );
  const taskFinishedWithoutFiles =
    !isLoadingRecoveredOutputs && outputFiles.length === 0 && taskOutputsReady;

  const loadWorkspaceFiles = useCallback(async () => {
    const requestId = ++workspaceFilesRequestRef.current;
    if (!currentFolderPath) {
      setWorkspaceFiles([]);
      setWorkspaceFilesError(null);
      return;
    }
    setIsLoadingFiles(true);
    try {
      const files = await window.electronAPI.listHubFiles({
        source: "local",
        path: currentFolderPath,
        limit: 250,
      });
      if (requestId !== workspaceFilesRequestRef.current) return;
      setWorkspaceFiles(Array.isArray(files) ? files : []);
      setWorkspaceFilesError(null);
    } catch (error) {
      if (requestId !== workspaceFilesRequestRef.current) return;
      console.error("Failed to load workspace files:", error);
      // Preserve the last successful snapshot. A transient IPC/filesystem
      // error must not make existing files appear to have been deleted.
      setWorkspaceFilesError(
        error instanceof Error && error.message
          ? error.message
          : translate(
              "projectContext.files.readErrorDetail",
              "Please check the workspace permissions and try again.",
            ),
      );
    } finally {
      if (requestId === workspaceFilesRequestRef.current) {
        setIsLoadingFiles(false);
      }
    }
  }, [currentFolderPath]);

  const workspaceArtifactRefreshKey = useMemo(
    () =>
      indexedOutputFiles
        .map((file) => `${file.action}:${file.path}:${file.timestamp}`)
        .join("|"),
    [indexedOutputFiles],
  );

  const loadRecoveredOutputFiles = useCallback(async () => {
    if (
      !taskOutputsReady ||
      !workspace?.path ||
      indexedOutputFiles.length > 0
    ) {
      setRecoveredOutputFiles([]);
      return;
    }
    setIsLoadingRecoveredOutputs(true);
    try {
      const files = await window.electronAPI.listHubFiles({
        source: "local",
        path: workspace.path,
        limit: 250,
      });
      setRecoveredOutputFiles(
        deriveRecoveredTemporaryWorkspaceOutputs({
          task,
          workspace,
          files: Array.isArray(files) ? files : [],
        }),
      );
    } catch {
      setRecoveredOutputFiles([]);
    } finally {
      setIsLoadingRecoveredOutputs(false);
    }
  }, [indexedOutputFiles.length, task, taskOutputsReady, workspace]);

  useEffect(() => {
    setFolderPath(null);
    setQuery("");
  }, [workspace?.path]);

  useEffect(() => {
    setHiddenOutputPaths(new Set());
  }, [task?.id]);

  useEffect(() => {
    const resolvedProjectId = visibleProjectId;
    if (!resolvedProjectId || !window.electronAPI?.getProject) {
      setProjectName(null);
      return;
    }
    let cancelled = false;
    void window.electronAPI
      .getProject(resolvedProjectId)
      .then((project) => {
        if (!cancelled) setProjectName(project?.name || null);
      })
      .catch(() => {
        if (!cancelled) setProjectName(null);
      });
    return () => {
      cancelled = true;
    };
  }, [visibleProjectId]);

  useEffect(() => {
    if (activeTab !== "files") return;
    void loadWorkspaceFiles();
    const refreshOnFocus = () => void loadWorkspaceFiles();
    window.addEventListener("focus", refreshOnFocus);
    return () => window.removeEventListener("focus", refreshOnFocus);
  }, [activeTab, loadWorkspaceFiles, workspaceArtifactRefreshKey]);

  useEffect(() => {
    if (activeTab !== "outputs") return;
    void loadRecoveredOutputFiles();
  }, [activeTab, loadRecoveredOutputFiles]);

  const openFile = useCallback(
    (path: string) => {
      const kind = getInlinePreviewKindForGeneratedFile({ path });
      if (
        kind === "html" &&
        canPreviewWebPageInApp(path) &&
        onOpenWebArtifact
      ) {
        onOpenWebArtifact(path);
        return;
      }
      if (
        kind === "spreadsheet" &&
        canOpenSpreadsheetInApp(path) &&
        onOpenSpreadsheetArtifact
      ) {
        onOpenSpreadsheetArtifact(path);
        return;
      }
      if (
        kind === "document" &&
        canPreviewDocumentInApp(path) &&
        onOpenDocumentArtifact
      ) {
        onOpenDocumentArtifact(path);
        return;
      }
      if (
        kind === "presentation" &&
        canPreviewPresentationInApp(path) &&
        onOpenPresentationArtifact
      ) {
        onOpenPresentationArtifact(path);
        return;
      }
      setViewerFilePath(path);
    },
    [
      onOpenDocumentArtifact,
      onOpenPresentationArtifact,
      onOpenSpreadsheetArtifact,
      onOpenWebArtifact,
    ],
  );

  const showFileInFinder = useCallback(
    (path: string) => {
      if (!workspace?.path) return;
      void window.electronAPI.showInFinder(path, workspace.path);
    },
    [workspace?.path],
  );

  const canGoBack = Boolean(
    workspace?.path &&
    currentFolderPath &&
    currentFolderPath !== workspace.path,
  );

  const copiedSourceFileKeys = useMemo(
    () => deriveCopiedSourceArtifactPathKeys(events, workspace?.path),
    [events, workspace?.path],
  );
  const canonicalOutputFileNames = useMemo(
    () =>
      new Set(
        indexedOutputFiles
          .filter((file) => isCanonicalTaskArtifactOutputPath(file.path))
          .map((file) => fileName(file.path).toLowerCase()),
      ),
    [indexedOutputFiles],
  );

  const displayedWorkspaceFiles = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const sorted = workspaceFiles
      .filter(
        (file) =>
          canGoBack ||
          file.isDirectory ||
          (!copiedSourceFileKeys.has(
            getArtifactPathIdentityKey(file.path, workspace?.path),
          ) &&
            !canonicalOutputFileNames.has(file.name.toLowerCase())),
      )
      .sort((a, b) => {
        if (Boolean(a.isDirectory) !== Boolean(b.isDirectory))
          return a.isDirectory ? -1 : 1;
        return a.name.localeCompare(b.name, "zh-CN");
      });
    return normalizedQuery
      ? sorted.filter((file) =>
          file.name.toLowerCase().includes(normalizedQuery),
        )
      : sorted;
  }, [
    canGoBack,
    canonicalOutputFileNames,
    copiedSourceFileKeys,
    query,
    workspace?.path,
    workspaceFiles,
  ]);

  const promotedWorkspaceOutputs = useMemo(() => {
    return derivePromotedWorkspaceOutputs({
      isWorkspaceRoot: !canGoBack,
      outputFiles: indexedOutputFiles,
      workspaceFiles,
      workspacePath: workspace?.path,
      query,
    });
  }, [
    canGoBack,
    indexedOutputFiles,
    query,
    taskOutputsReady,
    workspace?.path,
    workspaceFiles,
  ]);
  const folderLabel = currentFolderPath
    ? currentFolderPath === workspace?.path
      ? workspace?.name ||
        translate(
          "generated.components.projectcontextpanel.959.36",
          "workspace",
        )
      : fileName(currentFolderPath)
    : translate("generated.components.projectcontextpanel.961.37", "workspace");
  const sessionNodes = useMemo(
    () =>
      buildSessionTaskNodes(
        sessionTasks.length > 0 ? sessionTasks : task ? [task] : [],
        task?.id,
      ),
    [sessionTasks, task],
  );
  const conversationRounds = useMemo(
    () => buildSessionConversationRounds(events, task),
    [events, task],
  );
  const relatedSessionNodes = useMemo(
    () => sessionNodes.filter((node) => node.task.id !== task?.id),
    [sessionNodes, task?.id],
  );
  const currentLanguage = getCurrentLanguage();
  const relatedSessionTaskTitles = useMemo(
    () => buildRelatedSessionTaskTitles(relatedSessionNodes, currentLanguage),
    [currentLanguage, relatedSessionNodes],
  );

  return (
    <aside
      className="project-context-panel"
      aria-label={translate(
        projectsVisible
          ? "generated.components.projectcontextpanel.985.38"
          : "workspaceContext.panel.aria",
        projectsVisible ? "Project" : "Workspace",
      )}
    >
      <header className="project-context-header">
        <div className="project-context-title">
          <div>
            <span className="project-context-label">
              {translate(
                projectsVisible
                  ? "generated.components.projectcontextpanel.989.39"
                  : "workspaceContext.panel.label",
                projectsVisible ? "Project:" : "Workspace:",
              )}
            </span>
            <strong
              title={
                (projectsVisible
                  ? projectName || task?.title
                  : workspace?.name || task?.title) ||
                translate(
                  "generated.components.projectcontextpanel.992.40",
                  "No workspace selected",
                )
              }
            >
              {(projectsVisible
                ? projectName || task?.title
                : workspace?.name || task?.title) ||
                translate(
                  "generated.components.projectcontextpanel.995.41",
                  "No workspace selected",
                )}
            </strong>
          </div>
        </div>
        <div className="project-header-actions">
          {onCollapse ? (
            <button
              className="project-icon-button"
              type="button"
              onClick={onCollapse}
              title={translate(
                projectsVisible
                  ? "generated.components.projectcontextpanel.1035.46"
                  : "workspaceContext.panel.close",
                projectsVisible
                  ? "Close project panel"
                  : "Close workspace panel",
              )}
              aria-label={translate(
                projectsVisible
                  ? "generated.components.projectcontextpanel.1036.47"
                  : "workspaceContext.panel.close",
                projectsVisible
                  ? "Close project panel"
                  : "Close workspace panel",
              )}
            >
              <X size={17} />
            </button>
          ) : null}
        </div>
      </header>

      <nav
        className="project-context-tabs"
        aria-label={translate(
          projectsVisible
            ? "generated.components.projectcontextpanel.1044.48"
            : "workspaceContext.panel.content",
          projectsVisible ? "Project content" : "Workspace content",
        )}
      >
        {(
          [
            [
              "outputs",
              translate(
                "generated.components.projectcontextpanel.1047.49",
                "This product",
              ),
              Sparkles,
            ],
            [
              "files",
              translate(
                "generated.components.projectcontextpanel.1048.50",
                "workspace file",
              ),
              FolderOpen,
            ],
            [
              "changes",
              translate(
                "generated.components.projectcontextpanel.1049.51",
                "change",
              ),
              History,
            ],
            [
              "session",
              translate(
                "generated.components.projectcontextpanel.1050.52",
                "session",
              ),
              GitBranch,
            ],
          ] as const
        ).map(([tab, label, Icon]) => (
          <button
            key={tab}
            type="button"
            className={activeTab === tab ? "active" : ""}
            onClick={() => setActiveTab(tab)}
            aria-current={activeTab === tab ? "page" : undefined}
          >
            <Icon size={15} aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <div
        ref={panelBodyRef}
        className="project-context-body"
        onScroll={(event) => {
          projectPanelStateCache.set(panelStateKeyRef.current, {
            activeTab: activeTabRef.current,
            scrollTop: event.currentTarget.scrollTop,
          });
        }}
      >
        {activeTab === "outputs" ? (
          <section
            className="project-tab-section"
            aria-labelledby="task-outputs-title"
          >
            <div className="project-section-heading">
              <div>
                <h2 id="task-outputs-title">
                  <ChevronDown aria-hidden="true" size={16} strokeWidth={2} />
                  {translate(
                    "generated.components.projectcontextpanel.1085.53",
                    "The product of this dialogue",
                  )}
                </h2>
              </div>
              {outputFiles.length > 0 ? (
                <button
                  className="project-clear-button"
                  type="button"
                  onClick={() =>
                    setHiddenOutputPaths(
                      new Set(outputFiles.map((file) => file.path)),
                    )
                  }
                  title={translate(
                    "generated.components.projectcontextpanel.1097.54",
                    "Only clears the current panel display and does not delete workspace files",
                  )}
                >
                  {translate(
                    "generated.components.projectcontextpanel.1099.55",
                    "Clear",
                  )}
                </button>
              ) : null}
            </div>
            {outputFiles.length > 0 ? (
              <div className="project-file-list">
                {outputFiles.map((file) => (
                  <TaskFileRow
                    key={`${file.path}-${file.action}`}
                    file={file}
                    onOpen={openFile}
                    onShowInFinder={
                      workspace?.path ? showFileInFinder : undefined
                    }
                    showAction
                    showActions
                  />
                ))}
              </div>
            ) : (
              <EmptyPanel
                icon={Sparkles}
                title={
                  taskOutputsPending
                    ? translate(
                        "projectContext.outputs.pendingTitle",
                        "Processing files",
                      )
                    : taskOutputsFailed
                      ? translate(
                          "projectContext.outputs.unpublishedTitle",
                          "No deliverable artifact was published",
                        )
                      : isLoadingRecoveredOutputs
                        ? translate(
                            "generated.components.projectcontextpanel.1120.56",
                            "Checking recovery files…",
                          )
                        : taskFinishedWithoutFiles
                          ? translate(
                              "generated.components.projectcontextpanel.1122.57",
                              "No files were written in this task",
                            )
                          : translate(
                              "generated.components.projectcontextpanel.1123.58",
                              "Products will be displayed here",
                            )
                }
                detail={
                  taskOutputsPending
                    ? translate(
                        "projectContext.outputs.pendingDetail",
                        "Final files will appear here together after processing and validation are complete.",
                      )
                    : taskOutputsFailed
                      ? translate(
                          "projectContext.outputs.unpublishedDetail",
                          "Drafts and incomplete files are kept out of artifacts. Retry the task after resolving the failure.",
                        )
                      : taskFinishedWithoutFiles
                        ? translate(
                            "generated.components.projectcontextpanel.1127.59",
                            "The results are already shown in the dialog; only files that were actually generated or modified will appear here.",
                          )
                        : translate(
                            "generated.components.projectcontextpanel.1128.60",
                            "After the file is generated or modified, it can be previewed directly or viewed in the workspace.",
                          )
                }
              />
            )}
            {workspace ? (
              <button
                className="project-workspace-summary"
                type="button"
                onClick={() => setActiveTab("files")}
              >
                <ChevronRight size={16} aria-hidden="true" />
                <span>
                  <strong>
                    {translate(
                      "generated.components.projectcontextpanel.1140.61",
                      "Complete workspace",
                    )}
                  </strong>
                  <small>
                    {translate(
                      "generated.components.projectcontextpanel.1141.62",
                      "View all files and folders",
                    )}
                  </small>
                </span>
                <FolderOpen size={17} aria-hidden="true" />
              </button>
            ) : null}
          </section>
        ) : null}

        {activeTab === "files" ? (
          <section
            className="project-tab-section"
            aria-labelledby="workspace-files-title"
          >
            <div className="project-files-toolbar">
              <div className="project-search-field">
                <Search size={16} aria-hidden="true" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={translate(
                    "generated.components.projectcontextpanel.1160.63",
                    "Search current folder…",
                  )}
                  aria-label={translate(
                    "generated.components.projectcontextpanel.1161.64",
                    "Search files",
                  )}
                />
              </div>
              <button
                className="project-icon-button"
                type="button"
                onClick={() => void loadWorkspaceFiles()}
                title={translate(
                  "generated.components.projectcontextpanel.1168.65",
                  "refresh file",
                )}
                aria-label={translate(
                  "generated.components.projectcontextpanel.1169.66",
                  "refresh file",
                )}
              >
                <RefreshCw
                  size={16}
                  className={isLoadingFiles ? "project-spinning" : ""}
                />
              </button>
            </div>
            <div className="project-file-location">
              {canGoBack ? (
                <button
                  type="button"
                  onClick={() => setFolderPath(workspace?.path || null)}
                  aria-label={translate(
                    "generated.components.projectcontextpanel.1182.67",
                    "Return to workspace root directory",
                  )}
                >
                  <ArrowLeft size={15} />
                </button>
              ) : null}
              <FolderOpen size={15} aria-hidden="true" />
              <span title={currentFolderPath || undefined}>{folderLabel}</span>
            </div>
            <h2 className="sr-only" id="workspace-files-title">
              {translate(
                "generated.components.projectcontextpanel.1191.68",
                "workspace file",
              )}
            </h2>
            {promotedWorkspaceOutputs.length > 0 ||
            displayedWorkspaceFiles.length > 0 ? (
              <div className="project-file-list project-workspace-file-list">
                {promotedWorkspaceOutputs.map((file) => (
                  <TaskFileRow
                    key={`task-output:${file.path}`}
                    file={file}
                    onOpen={openFile}
                    onShowInFinder={
                      workspace?.path ? showFileInFinder : undefined
                    }
                    showActions
                  />
                ))}
                {displayedWorkspaceFiles.map((file) => (
                  <WorkspaceFileRow
                    key={file.id || file.path}
                    file={file}
                    onOpen={() => openFile(file.path)}
                    onOpenFolder={() => setFolderPath(file.path)}
                    onShowInFinder={() => showFileInFinder(file.path)}
                  />
                ))}
              </div>
            ) : (
              <EmptyPanel
                icon={FolderOpen}
                title={
                  isLoadingFiles
                    ? translate(
                        "generated.components.projectcontextpanel.1208.69",
                        "Reading file…",
                      )
                    : workspaceFilesError
                      ? translate(
                          "projectContext.files.readErrorTitle",
                          "Unable to read workspace files",
                        )
                      : translate(
                          "generated.components.projectcontextpanel.1208.70",
                          "There are no files to display here",
                        )
                }
                detail={
                  workspaceFilesError
                    ? workspaceFilesError
                    : query
                      ? translate(
                          "generated.components.projectcontextpanel.1212.71",
                          "Try changing the keywords.",
                        )
                      : translate(
                          "generated.components.projectcontextpanel.1213.72",
                          "Files in the workspace root directory appear here.",
                        )
                }
              />
            )}
          </section>
        ) : null}

        {activeTab === "changes" ? (
          <section
            className="project-tab-section"
            aria-labelledby="task-changes-title"
          >
            <div className="project-section-heading">
              <div>
                <h2 id="task-changes-title">
                  {translate(
                    "generated.components.projectcontextpanel.1227.73",
                    "This change",
                  )}
                </h2>
                <p>
                  {translate(
                    "generated.components.projectcontextpanel.1228.74",
                    "File changes resulting from the current session",
                  )}
                </p>
              </div>
              <span>{taskFiles.length}</span>
            </div>
            {taskFiles.length > 0 ? (
              <div className="project-file-list">
                {taskFiles.map((file) => (
                  <TaskFileRow
                    key={`${file.path}-${file.action}`}
                    file={file}
                    onOpen={openFile}
                    onShowInFinder={
                      workspace?.path ? showFileInFinder : undefined
                    }
                    showAction
                    showActions
                  />
                ))}
              </div>
            ) : (
              <EmptyPanel
                icon={History}
                title={translate(
                  "generated.components.projectcontextpanel.1247.75",
                  "No file changes yet",
                )}
                detail={translate(
                  "generated.components.projectcontextpanel.1248.76",
                  "When a file is created, modified, or deleted, a record appears here.",
                )}
              />
            )}
          </section>
        ) : null}

        {activeTab === "session" ? (
          <section
            className="project-tab-section"
            aria-labelledby="session-task-nodes-title"
          >
            <div className="project-section-heading">
              <div>
                <h2 id="session-task-nodes-title">
                  {translate(
                    "generated.components.projectcontextpanel.1261.77",
                    "Conversation record",
                  )}
                </h2>
                <p>
                  {translate(
                    "generated.components.projectcontextpanel.1262.78",
                    "Click the record to navigate to the main conversation, arrows to expand replies",
                  )}
                </p>
              </div>
              <span>{conversationRounds.length}</span>
            </div>
            {conversationRounds.length > 0 ? (
              <div className="project-session-round-list">
                {conversationRounds.map((round, index) => (
                  <SessionConversationRoundCard
                    key={round.id}
                    round={round}
                    index={index}
                    initiallyOpen={index === conversationRounds.length - 1}
                    onNavigate={handleNavigateConversationRound}
                  />
                ))}
              </div>
            ) : (
              <EmptyPanel
                icon={GitBranch}
                title={translate(
                  "generated.components.projectcontextpanel.1281.79",
                  "There is no conversation record yet",
                )}
                detail={translate(
                  "generated.components.projectcontextpanel.1282.80",
                  "After sending the first message, the conversation turns will appear here.",
                )}
              />
            )}
            {relatedSessionNodes.length > 0 ? (
              <div className="project-related-session-tasks">
                <div className="project-related-session-heading">
                  <strong>
                    {translate(
                      "generated.components.projectcontextpanel.1288.81",
                      "Associated tasks",
                    )}
                  </strong>
                  <span>{relatedSessionNodes.length}</span>
                </div>
                <div className="project-session-node-list">
                  {relatedSessionNodes.map((node) => (
                    <button
                      type="button"
                      className="project-session-node"
                      key={node.task.id}
                      style={
                        { "--session-node-depth": node.depth } as CSSProperties
                      }
                      onClick={() => onSelectTask?.(node.task.id)}
                    >
                      <span
                        className={`project-session-node-dot status-${node.task.status}`}
                        aria-hidden="true"
                      />
                      <span className="project-session-node-copy">
                        <strong>
                          {relatedSessionTaskTitles.get(node.task.id) ||
                            node.task.title ||
                            node.task.prompt ||
                            translate(
                              "generated.components.projectcontextpanel.1311.82",
                              "Unnamed task",
                            )}
                        </strong>
                        <small>
                          {sessionNodeRelationLabel(node.relation)} ·{" "}
                          {sessionNodeStatusLabel(node.task.status)}
                        </small>
                      </span>
                      <ChevronRight size={15} />
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </section>
        ) : null}
      </div>

      {viewerFilePath && workspace?.path ? (
        <DocumentAwareFileModal
          filePath={viewerFilePath}
          workspacePath={workspace.path}
          onClose={() => setViewerFilePath(null)}
        />
      ) : null}
    </aside>
  );
}

function TaskFileRow({
  file,
  onOpen,
  onShowInFinder,
  showAction = false,
  showActions = false,
}: {
  file: FileInfo;
  onOpen: (path: string) => void;
  onShowInFinder?: (path: string) => void;
  showAction?: boolean;
  showActions?: boolean;
}) {
  const name = fileName(file.path);
  const previewLabel = translate("inlinePreview.openPreview", "Open preview");
  const showInFinderLabel = translate(
    "fileViewer.showInFinder",
    "Show in Finder",
  );

  return (
    <div className="project-file-row project-task-file-row">
      <button
        type="button"
        className="project-task-file-main"
        onClick={() => onOpen(file.path)}
        title={`${previewLabel}: ${name}`}
        aria-label={`${previewLabel}: ${name}`}
      >
        <ProjectFileTypeIcon path={file.path} />
        <span className="project-file-copy">
          <strong title={file.path}>{name}</strong>
          <small>
            {file.timestamp
              ? formatTime(file.timestamp)
              : translate(
                  "generated.components.projectcontextpanel.1360.83",
                  "Generated",
                )}
            {showAction ? (
              <>
                <span aria-hidden="true"> · </span>
                <span className={`project-file-status ${file.action}`}>
                  {actionLabel(file.action)}
                </span>
              </>
            ) : null}
          </small>
        </span>
      </button>
      {showActions ? (
        <span className="project-file-actions">
          <button
            type="button"
            className="project-file-action-button"
            onClick={() => onOpen(file.path)}
            title={previewLabel}
            aria-label={`${previewLabel}: ${name}`}
          >
            <Eye size={17} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="project-file-action-button"
            onClick={() => onShowInFinder?.(file.path)}
            title={showInFinderLabel}
            aria-label={`${showInFinderLabel}: ${name}`}
            disabled={!onShowInFinder}
          >
            <FolderOpen size={17} aria-hidden="true" />
          </button>
        </span>
      ) : (
        <button
          type="button"
          className="project-file-action-button project-file-single-action"
          onClick={() => onOpen(file.path)}
          title={previewLabel}
          aria-label={`${previewLabel}: ${name}`}
        >
          <Eye size={16} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

function WorkspaceFileRow({
  file,
  onOpen,
  onOpenFolder,
  onShowInFinder,
}: {
  file: WorkspaceFile;
  onOpen: () => void;
  onOpenFolder: () => void;
  onShowInFinder: () => void;
}) {
  const handleClick = file.isDirectory ? onOpenFolder : onOpen;
  const name = file.name || fileName(file.path);
  const previewLabel = file.isDirectory
    ? translate("common.open", "Open")
    : translate("inlinePreview.openPreview", "Open preview");
  const showInFinderLabel = translate(
    "fileViewer.showInFinder",
    "Show in Finder",
  );

  return (
    <div className="project-file-row project-task-file-row">
      <button
        type="button"
        className="project-task-file-main"
        onClick={handleClick}
        title={`${previewLabel}: ${name}`}
        aria-label={`${previewLabel}: ${name}`}
      >
        <ProjectFileTypeIcon path={file.path} isDirectory={file.isDirectory} />
        <span className="project-file-copy">
          <strong title={file.path}>{name}</strong>
          <small>
            {file.isDirectory
              ? translate(
                  "generated.components.projectcontextpanel.1399.84",
                  "folder",
                )
              : formatTime(file.modifiedAt)}
          </small>
        </span>
      </button>
      <span className="project-file-actions">
        {!file.isDirectory ? (
          <button
            type="button"
            className="project-file-action-button"
            onClick={onOpen}
            title={previewLabel}
            aria-label={`${previewLabel}: ${name}`}
          >
            <Eye size={17} aria-hidden="true" />
          </button>
        ) : null}
        <button
          type="button"
          className="project-file-action-button"
          onClick={onShowInFinder}
          title={showInFinderLabel}
          aria-label={`${showInFinderLabel}: ${name}`}
        >
          <FolderOpen size={17} aria-hidden="true" />
        </button>
      </span>
    </div>
  );
}

function EmptyPanel({
  icon: Icon,
  title,
  detail,
}: {
  icon: ComponentType<LucideProps>;
  title: string;
  detail: string;
}) {
  return (
    <div className="project-empty-state">
      <Icon size={22} aria-hidden="true" />
      <strong>{title}</strong>
      <p>{detail}</p>
    </div>
  );
}
