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
import {
  collectEndOfTaskArtifactCardStacks,
  extractGeneratedArtifactPathsFromText,
  getInlinePreviewKindForGeneratedFile,
} from "./MainContent/artifact-logic";
import {
  deriveSharedTaskEventUiState,
  type FileInfo,
  type SharedTaskEventUiState,
} from "../utils/task-event-derived";
import {
  getArtifactPathIdentityKey,
  isCanonicalTaskArtifactOutputPath,
} from "../utils/artifact-path-identity";
import {
  isInternalWorkspaceProcessPath,
  isUserVisibleTaskArtifactPath,
} from "../utils/task-artifact-visibility";
import { hasTaskOutputs } from "../utils/task-outputs";
import { sanitizeHermesText } from "../utils/runtime-privacy";
import { compareWorkspaceFilesNewestFirst, getWorkspaceFileCreationTime } from "../../shared/workspace-file-order";
import { normalizeInitialPromptText } from "./MainContent/task-event-presentation";
import "./project-context-panel.css";
import { WorkspaceIdentity } from "./WorkspaceIdentity";
import { workspaceDisplayName } from "../utils/workspace-identity";
import type { WorkspaceContextDetails } from "../../shared/types";
import type { TaskWorkspaceError } from "../hooks/use-task-workspace";

type ProjectPanelTab = "outputs" | "files" | "changes" | "session";
const projectPanelStateCache = new Map<
  string,
  { activeTab: ProjectPanelTab; scrollTop: number }
>();

export type WorkspaceFile = {
  id: string;
  name: string;
  path: string;
  source?: string;
  mimeType?: string;
  size?: number;
  modifiedAt?: number;
  createdAt?: number;
  isDirectory?: boolean;
};

function normalizeWorkspaceFileEntry(
  entry: Any,
  fallbackSource: string,
): WorkspaceFile | null {
  const filePath = String(entry?.path || "");
  if (!filePath) return null;
  return {
    id: typeof entry?.id === "string" ? entry.id : filePath,
    name: String(entry?.name || fileName(filePath)),
    path: filePath,
    source: typeof entry?.source === "string" ? entry.source : fallbackSource,
    mimeType: typeof entry?.mimeType === "string" ? entry.mimeType : undefined,
    size: typeof entry?.size === "number" ? entry.size : undefined,
    modifiedAt:
      typeof entry?.modifiedAt === "number" ? entry.modifiedAt : undefined,
    createdAt:
      typeof entry?.createdAt === "number" ? entry.createdAt : undefined,
    isDirectory: Boolean(entry?.isDirectory),
  };
}

export function mergeWorkspaceBrowserFiles(
  localFiles: WorkspaceFile[],
  artifactFiles: WorkspaceFile[],
  workspacePath?: string,
): WorkspaceFile[] {
  const merged: WorkspaceFile[] = [];
  const seenKeys = new Set<string>();
  const add = (file: WorkspaceFile) => {
    const key =
      getArtifactPathIdentityKey(file.path, workspacePath) ||
      file.path.toLowerCase();
    if (!key || seenKeys.has(key)) return;
    seenKeys.add(key);
    merged.push(file);
  };

  localFiles.forEach(add);
  artifactFiles.forEach(add);
  return merged;
}

export function shouldDisplayWorkspaceFile(options: {
  file: WorkspaceFile;
  canGoBack: boolean;
  workspacePath?: string;
  copiedSourceFileKeys: Set<string>;
  canonicalOutputFileNames: Set<string>;
}): boolean {
  const { file, canGoBack, workspacePath } = options;
  if (isInternalWorkspaceProcessPath(file.path, workspacePath)) return false;
  return (
    canGoBack ||
    Boolean(file.isDirectory) ||
    file.source === "artifacts" ||
    (!options.copiedSourceFileKeys.has(
      getArtifactPathIdentityKey(file.path, workspacePath),
    ) &&
      !options.canonicalOutputFileNames.has(file.name.toLowerCase()))
  );
}

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

export function scopeTaskOutputFilesToLatestTurn(options: {
  files: FileInfo[];
  events: TaskEvent[];
  workspacePath?: string;
}): FileInfo[] {
  if (options.files.length === 0 || options.events.length === 0) {
    return options.files;
  }

  let latestUserMessageIndex = -1;
  for (let index = options.events.length - 1; index >= 0; index -= 1) {
    if (getEffectiveTaskEventType(options.events[index]) === "user_message") {
      latestUserMessageIndex = index;
      break;
    }
  }
  // The initial task also has a final delivery contract. Previously only
  // follow-up turns were scoped, leaving stale cached exports in this panel.
  const hasCompletion = options.events.some((event) => getEffectiveTaskEventType(event) === "task_completed");
  if (latestUserMessageIndex < 0 && !hasCompletion) return options.files;

  const latestTurnOutputKeys = new Set<string>();
  const completion = [...options.events.slice(Math.max(0, latestUserMessageIndex))].reverse().find(
    (event) => getEffectiveTaskEventType(event) === "task_completed",
  );
  const finalSummary = completion?.payload?.outputSummary;
  if (latestUserMessageIndex < 0 && finalSummary && finalSummary.outputCount > 0) {
    const finalPaths: string[] = finalSummary.created?.length ? finalSummary.created : finalSummary.modifiedFallback || [];
    const finalKeys = new Set(finalPaths.map((p) => getArtifactPathIdentityKey(p, options.workspacePath)));
    return options.files.filter((file) => finalKeys.has(getArtifactPathIdentityKey(file.path, options.workspacePath)));
  }
  for (const stack of collectEndOfTaskArtifactCardStacks(options.events, 32)) {
    if (stack.anchorEventIndex < latestUserMessageIndex) continue;
    for (const artifact of stack.artifacts) {
      const identityKey = getArtifactPathIdentityKey(
        artifact.path,
        options.workspacePath,
      );
      if (identityKey) latestTurnOutputKeys.add(identityKey);
    }
  }

  return options.files.filter((file) =>
    latestTurnOutputKeys.has(
      getArtifactPathIdentityKey(file.path, options.workspacePath),
    ),
  );
}

const RECOVERED_OUTPUT_GRACE_MS = 30 * 60 * 1000;
const RECOVERED_OUTPUT_CLOCK_SKEW_MS = 5_000;
const DELIVERED_FILE_CONTEXT_RE =
  /(?:交付|产物|输出|文件|生成|保存|导出|deliver|artifact|output|file|generated|created|saved|exported)/i;

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
  events = [],
}: {
  task: Task | undefined;
  workspace: Workspace | null;
  files: WorkspaceFile[];
  events?: TaskEvent[];
}): FileInfo[] {
  if (!task || !workspace) return [];
  if (
    !workspace.isTemp &&
    !isTempWorkspaceId(workspace.id) &&
    !isTempWorkspaceId(task.workspaceId)
  ) {
    return [];
  }
  const taskEvents = events
    .filter((event) => !event.taskId || event.taskId === task.id)
    .sort((left, right) => left.timestamp - right.timestamp);
  let latestUserMessageIndex = -1;
  for (let index = taskEvents.length - 1; index >= 0; index -= 1) {
    if (getEffectiveTaskEventType(taskEvents[index]) === "user_message") {
      latestUserMessageIndex = index;
      break;
    }
  }
  const currentTurnEvents =
    latestUserMessageIndex >= 0
      ? taskEvents.slice(latestUserMessageIndex)
      : taskEvents;
  const currentTurnStartedAt =
    currentTurnEvents[0]?.timestamp || task.createdAt;
  const currentTurnCompletion = [...currentTurnEvents]
    .reverse()
    .find(
      (event) => getEffectiveTaskEventType(event) === "task_completed",
    );
  const startedAt = Math.max(
    0,
    currentTurnStartedAt -
      (latestUserMessageIndex >= 0 ? 0 : RECOVERED_OUTPUT_CLOCK_SKEW_MS),
  );
  const finishedAt =
    currentTurnCompletion?.timestamp ||
    task.completedAt ||
    task.updatedAt ||
    Date.now();
  const latestRecoveryAt = finishedAt + RECOVERED_OUTPUT_GRACE_MS;
  const expectedPathKeys = new Set<string>();
  const expectedFileNames = new Set<string>();
  const deliveryTexts: string[] = [];
  for (const event of currentTurnEvents) {
    const effectiveType = getEffectiveTaskEventType(event);
    if (
      effectiveType !== "assistant_message" &&
      effectiveType !== "task_completed" &&
      effectiveType !== "follow_up_completed"
    ) {
      continue;
    }
    const payload = event.payload || {};
    const texts = [
      payload.message,
      payload.resultSummary,
      payload.semanticSummary,
      payload.followUpMessage,
      payload.bestKnownOutcome?.resultSummary,
      payload.bestKnownOutcome?.semanticSummary,
    ];
    for (const text of texts) {
      if (typeof text !== "string") continue;
      deliveryTexts.push(text);
      for (const outputPath of extractGeneratedArtifactPathsFromText(text)) {
        const identityKey = getArtifactPathIdentityKey(
          outputPath,
          workspace.path,
        );
        if (identityKey) expectedPathKeys.add(identityKey);
        const outputName = fileName(outputPath).toLowerCase();
        if (outputName) expectedFileNames.add(outputName);
      }
    }
  }
  for (const text of [task.resultSummary, task.semanticSummary]) {
    if (typeof text === "string" && text.trim()) deliveryTexts.push(text);
  }
  const copiedSourceKeys = deriveCopiedSourceArtifactPathKeys(
    currentTurnEvents,
    workspace.path,
  );
  const allowUnreferencedLocalRecovery = /missing artifact evidence/i.test(
    String(task.error || ""),
  );

  return files
    .filter((file) => {
      if (file.isDirectory) return false;
      if (!file.path || !Number.isFinite(file.modifiedAt)) return false;
      if (!isUserVisibleTaskArtifactPath(file.path)) return false;
      const identityKey = getArtifactPathIdentityKey(file.path, workspace.path);
      if (!identityKey || copiedSourceKeys.has(identityKey)) return false;
      const isInCurrentTurn =
        Number(file.modifiedAt) >= startedAt &&
        Number(file.modifiedAt) <= latestRecoveryAt;
      if (!isInCurrentTurn) return false;
      if (file.source === "artifacts") return true;
      if (allowUnreferencedLocalRecovery) return true;
      const candidateName = fileName(file.path).toLowerCase();
      const explicitlyDelivered = deliveryTexts.some((text) => {
        const normalizedText = text.toLowerCase();
        const mentionIndex = normalizedText.indexOf(candidateName);
        if (mentionIndex < 0) return false;
        const lineStart = normalizedText.lastIndexOf("\n", mentionIndex) + 1;
        const lineEnd = normalizedText.indexOf("\n", mentionIndex);
        const line = normalizedText.slice(
          lineStart,
          lineEnd < 0 ? normalizedText.length : lineEnd,
        );
        return DELIVERED_FILE_CONTEXT_RE.test(line);
      });
      return (
        expectedPathKeys.has(identityKey) ||
        expectedFileNames.has(candidateName) ||
        explicitlyDelivered
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
  workspaceError?: TaskWorkspaceError | null;
  onRetryWorkspace?: () => void;
  onChangeWorkspace?: () => void;
  projectId?: string | null;
  sessionTasks?: Task[];
  events: TaskEvent[];
  sharedTaskEventUi?: SharedTaskEventUiState | null;
  onOpenSpreadsheetArtifact?: (path: string) => void;
  onOpenDocumentArtifact?: (path: string) => void;
  onOpenPresentationArtifact?: (path: string) => void;
  onOpenWebArtifact?: (path: string) => void;
  onSelectTask?: (taskId: string) => void;
  onSelectWorkspace?: (workspace: Workspace) => void;
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
  taskId?: string;
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
  boundaryType: "synthetic" | "user_message" | "follow_up_started";
};

function taskConversationPrompt(task?: Task): string {
  if (!task) return "";
  return normalizeInitialPromptText(
    String(task.userPrompt || task.rawPrompt || task.prompt || ""),
  );
}

function normalizeConversationText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function payloadString(
  payload: TaskEvent["payload"] | undefined,
  key: string,
): string {
  if (!payload || typeof payload !== "object") return "";
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "string" ? value.trim() : "";
}

function payloadNestedString(
  payload: TaskEvent["payload"] | undefined,
  key: string,
  nestedKey: string,
): string {
  if (!payload || typeof payload !== "object") return "";
  const nested = (payload as Record<string, unknown>)[key];
  if (!nested || typeof nested !== "object") return "";
  const value = (nested as Record<string, unknown>)[nestedKey];
  return typeof value === "string" ? value.trim() : "";
}

function eventConversationText(event: TaskEvent): string {
  const effectiveType = getEffectiveTaskEventType(event);
  if (effectiveType === "user_message") {
    return normalizeInitialPromptText(payloadString(event.payload, "message"));
  }
  if (effectiveType === "assistant_message") {
    return payloadString(event.payload, "message");
  }
  if (effectiveType === "follow_up_started") {
    return normalizeInitialPromptText(
      payloadString(event.payload, "followUpMessage") ||
        payloadString(event.payload, "message"),
    );
  }
  return "";
}

function eventCompletionConversationText(event: TaskEvent): string {
  const effectiveType = getEffectiveTaskEventType(event);
  if (
    effectiveType === "task_completed" ||
    effectiveType === "follow_up_completed"
  ) {
    return (
      sanitizeHermesText(
        payloadString(event.payload, "resultSummary") ||
          payloadString(event.payload, "semanticSummary") ||
          payloadNestedString(event.payload, "bestKnownOutcome", "resultSummary") ||
          payloadString(event.payload, "message"),
      )
    );
  }
  if (
    effectiveType === "task_failed" ||
    effectiveType === "follow_up_failed" ||
    effectiveType === "task_cancelled"
  ) {
    return (
      payloadString(event.payload, "error") ||
      payloadString(event.payload, "message") ||
      payloadString(event.payload, "reason")
    );
  }
  return "";
}

function buildTaskConversationRounds(
  events: TaskEvent[],
  task?: Task,
): SessionConversationRound[] {
  const taskId = task?.id;
  const sessionEvents = taskId
    ? events.filter((event) => event.taskId === taskId)
    : events;
  const orderedEvents = [...sessionEvents].sort(
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
        boundaryType: "synthetic",
      }
    : null;

  const finishCurrent = () => {
    if (!current?.userText.trim()) return;
    pendingRounds.push(current);
    current = null;
  };

  for (const event of orderedEvents) {
    const effectiveType = getEffectiveTaskEventType(event);
    if (
      effectiveType === "user_message" ||
      effectiveType === "follow_up_started"
    ) {
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
        if (effectiveType === "user_message") {
          current.id = event.id;
          current.timestamp = event.timestamp;
          current.synthetic = false;
          current.boundaryType = "user_message";
        }
        continue;
      }
      if (
        current?.synthetic &&
        !current.assistantText &&
        !current.completed &&
        !current.failed
      ) {
        current.id = event.id;
        current.turnId = `event:${event.id}`;
        current.userText = userText;
        current.timestamp = event.timestamp;
        current.synthetic = false;
        current.boundaryType = effectiveType;
        continue;
      }
      const repeatsPendingUserMessage =
        current &&
        !current.synthetic &&
        !current.assistantText &&
        !current.completed &&
        !current.failed &&
        current.boundaryType !== effectiveType &&
        normalizedCurrentText === normalizedUserText;
      if (repeatsPendingUserMessage) {
        // Follow-up execution records both follow_up_started and user_message.
        // Either event may arrive first, so treat equal adjacent boundaries as
        // one round and prefer the durable user_message identity when present.
        if (effectiveType === "user_message" && current) {
          current.id = event.id;
          current.turnId = `event:${event.id}`;
          current.timestamp = event.timestamp;
          current.boundaryType = "user_message";
        }
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
        boundaryType: effectiveType,
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
      if (!current.assistantText) {
        const completionText = eventCompletionConversationText(event);
        if (completionText) current.assistantText = completionText;
      }
      current.completed = true;
      continue;
    }
    if (
      effectiveType === "task_failed" ||
      effectiveType === "follow_up_failed" ||
      effectiveType === "task_cancelled"
    ) {
      if (!current.assistantText) {
        const failureText = eventCompletionConversationText(event);
        if (failureText) current.assistantText = failureText;
      }
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

export function buildSessionConversationRounds(
  events: TaskEvent[],
  task?: Task,
  sessionTasks: Task[] = [],
): SessionConversationRound[] {
  const uniqueSessionTasks = new Map(
    sessionTasks
      .filter(
        (sessionTask) =>
          Boolean(sessionTask?.id) &&
          sessionTask.agentType !== "sub" &&
          sessionTask.agentType !== "parallel",
      )
      .map((sessionTask) => [sessionTask.id, sessionTask]),
  );
  if (task?.id) {
    uniqueSessionTasks.set(task.id, task);
  }
  if (uniqueSessionTasks.size <= 1) {
    return buildTaskConversationRounds(events, task);
  }

  const rounds = Array.from(uniqueSessionTasks.values()).flatMap(
    (sessionTask) =>
      buildTaskConversationRounds(events, sessionTask).map((round) => ({
        ...round,
        taskId: sessionTask.id,
      })),
  );
  return rounds.sort((left, right) => {
    if (left.timestamp !== right.timestamp) {
      return left.timestamp - right.timestamp;
    }
    return left.id.localeCompare(right.id);
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

const SESSION_CONVERSATION_TASK_LIMIT = 24;
const SESSION_CONVERSATION_EVENT_LIMIT = 160;
const SESSION_CONVERSATION_BYTE_LIMIT = 512 * 1024;
const SESSION_CONVERSATION_SINGLE_EVENT_BYTE_LIMIT = 64 * 1024;

function SessionConversationRoundCard({
  round,
  index,
  initiallyOpen,
  onNavigate,
}: {
  round: SessionConversationRound;
  index: number;
  initiallyOpen: boolean;
  onNavigate: (round: SessionConversationRound) => void;
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
          onClick={() => onNavigate(round)}
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
  workspace: providedWorkspace,
  workspaceError = null,
  onRetryWorkspace,
  onChangeWorkspace,
  projectId = null,
  sessionTasks = [],
  events,
  sharedTaskEventUi = null,
  onOpenSpreadsheetArtifact,
  onOpenDocumentArtifact,
  onOpenPresentationArtifact,
  onOpenWebArtifact,
  onSelectTask,
  onSelectWorkspace,
  onCollapse,
}: ProjectContextPanelProps) {
  const workspace = task && providedWorkspace?.id !== task.workspaceId ? null : providedWorkspace;
  const [workspaceContext, setWorkspaceContext] = useState<WorkspaceContextDetails | null>(null);
  const context = workspaceContext?.workspaceId === workspace?.id ? workspaceContext : null;
  const projectsVisible = FEATURE_VISIBILITY.projects;
  const visibleProjectId = projectsVisible
    ? projectId || task?.projectId || null
    : null;
  const panelStateKey = `${visibleProjectId || "no-project"}:${workspace?.id || "no-workspace"}:${task?.sessionId || task?.id || "no-task"}`;
  const panelStateKeyRef = useRef(panelStateKey);
  const panelBodyRef = useRef<HTMLDivElement>(null);
  const activeTabRef = useRef<ProjectPanelTab>(
    "outputs",
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
  const recoveredOutputScopeKey = `${task?.id || "no-task"}:${workspace?.path || "no-workspace"}`;
  const recoveredOutputsRequestRef = useRef(0);
  const [recoveredOutputState, setRecoveredOutputState] = useState<{
    scopeKey: string;
    files: FileInfo[];
    loading: boolean;
  }>({ scopeKey: recoveredOutputScopeKey, files: [], loading: false });
  const recoveredOutputFiles =
    recoveredOutputState.scopeKey === recoveredOutputScopeKey
      ? recoveredOutputState.files
      : [];
  const isLoadingRecoveredOutputs =
    recoveredOutputState.scopeKey === recoveredOutputScopeKey &&
    recoveredOutputState.loading;
  const [viewerFilePath, setViewerFilePath] = useState<string | null>(null);
  const [hiddenOutputPaths, setHiddenOutputPaths] = useState<Set<string>>(
    () => new Set(),
  );
  const [projectName, setProjectName] = useState<string | null>(null);
  const [sessionTaskEvents, setSessionTaskEvents] = useState<
    Record<string, TaskEvent[]>
  >({});
  const handleNavigateConversationRound = useCallback(
    (round: SessionConversationRound) => {
      const targetTaskId = round.taskId || task?.id;
      if (!targetTaskId) return;
      if (targetTaskId !== task?.id) {
        onSelectTask?.(targetTaskId);
        return;
      }
      requestConversationTurnNavigation({
        taskId: targetTaskId,
        turnId: round.turnId,
      });
    },
    [onSelectTask, task?.id],
  );

  useLayoutEffect(() => {
    panelStateKeyRef.current = panelStateKey;
    const cached = projectPanelStateCache.get(panelStateKey);
    const nextTab = "outputs";
    ++workspaceFilesRequestRef.current;
    setWorkspaceFiles([]);
    setWorkspaceFilesError(null);
    setFolderPath(null);
    setQuery("");
    activeTabRef.current = nextTab;
    setActiveTab(nextTab);
    const frame = window.requestAnimationFrame(() => {
      if (panelBodyRef.current)
        panelBodyRef.current.scrollTop = cached?.activeTab === "outputs" ? cached.scrollTop : 0;
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

  const sessionConversationTasks = useMemo(() => {
    const candidates = sessionTasks.length > 0 ? sessionTasks : task ? [task] : [];
    const unique = new Map(
      candidates
        .filter(
          (candidate) =>
            candidate.agentType !== "sub" && candidate.agentType !== "parallel",
        )
        .map((candidate) => [candidate.id, candidate]),
    );
    if (task?.id && !unique.has(task.id)) unique.set(task.id, task);

    const ordered = [...unique.values()].sort(
      (left, right) => left.createdAt - right.createdAt,
    );
    if (ordered.length <= SESSION_CONVERSATION_TASK_LIMIT) return ordered;

    const recent = ordered.slice(-SESSION_CONVERSATION_TASK_LIMIT);
    if (task && !recent.some((candidate) => candidate.id === task.id)) {
      recent[0] = task;
      recent.sort((left, right) => left.createdAt - right.createdAt);
    }
    return recent;
  }, [sessionTasks, task]);

  const sessionConversationTaskKey = useMemo(
    () =>
      sessionConversationTasks
        .map(
          (sessionTask) =>
            `${sessionTask.id}:${sessionTask.updatedAt}:${sessionTask.status}`,
        )
        .join("|"),
    [sessionConversationTasks],
  );

  useEffect(() => {
    if (activeTab !== "session") return;
    const tasksToLoad = sessionConversationTasks.filter(
      (sessionTask) => sessionTask.id !== task?.id,
    );
    if (tasksToLoad.length === 0) return;
    if (
      !window.electronAPI?.getTaskTimelinePage &&
      !window.electronAPI?.getTaskEvents
    ) {
      return;
    }

    let cancelled = false;
    const loadSessionTaskEvents = async () => {
      const loadedEntries = await Promise.all(
        tasksToLoad.map(async (sessionTask) => {
          let loadedEvents: TaskEvent[] = [];
          if (window.electronAPI?.getTaskTimelinePage) {
            try {
              const timelinePage = await window.electronAPI.getTaskTimelinePage({
                taskId: sessionTask.id,
                limit: SESSION_CONVERSATION_EVENT_LIMIT,
                byteLimit: SESSION_CONVERSATION_BYTE_LIMIT,
                singleEventByteLimit:
                  SESSION_CONVERSATION_SINGLE_EVENT_BYTE_LIMIT,
              });
              loadedEvents = Array.isArray(timelinePage?.events)
                ? timelinePage.events
                : [];
            } catch {
              // Older preload/main pairs may not expose the projected page.
            }
          }
          if (loadedEvents.length === 0 && window.electronAPI?.getTaskEvents) {
            try {
              const legacyEvents = await window.electronAPI.getTaskEvents(
                sessionTask.id,
              );
              loadedEvents = Array.isArray(legacyEvents) ? legacyEvents : [];
            } catch {
              // Keep the task prompt visible even when history is unavailable.
            }
          }
          return [sessionTask.id, loadedEvents] as const;
        }),
      );
      if (cancelled) return;

      setSessionTaskEvents((previous) => {
        const allowedTaskIds = new Set(tasksToLoad.map((item) => item.id));
        const next = Object.fromEntries(
          Object.entries(previous).filter(([taskId]) =>
            allowedTaskIds.has(taskId),
          ),
        ) as Record<string, TaskEvent[]>;
        for (const [taskId, loadedEvents] of loadedEntries) {
          next[taskId] = loadedEvents;
        }
        return next;
      });
    };

    void loadSessionTaskEvents();
    return () => {
      cancelled = true;
    };
  }, [
    activeTab,
    sessionConversationTaskKey,
    sessionConversationTasks,
    task?.id,
  ]);

  const inspectedTaskUi = useMemo(
    () =>
      deriveSharedTaskEventUiState({
        rawEvents: events,
        task,
        workspace,
        projectionMode: "inspect",
      }),
    [events, task, workspace],
  );
  const taskUi = useMemo(() => {
    if (!sharedTaskEventUi) return inspectedTaskUi;
    const sharedHasOutputs =
      hasTaskOutputs(sharedTaskEventUi.outputSummary) ||
      sharedTaskEventUi.files.some((file) => file.action !== "deleted");
    if (sharedHasOutputs) return sharedTaskEventUi;

    const inspectedHasOutputs =
      hasTaskOutputs(inspectedTaskUi.outputSummary) ||
      inspectedTaskUi.files.some((file) => file.action !== "deleted");
    if (!inspectedHasOutputs) return sharedTaskEventUi;

    return {
      ...sharedTaskEventUi,
      files: inspectedTaskUi.files,
      outputSummary: inspectedTaskUi.outputSummary,
    };
  }, [inspectedTaskUi, sharedTaskEventUi]);
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
  const currentTurnIndexedOutputFiles = useMemo(
    () =>
      scopeTaskOutputFilesToLatestTurn({
        files: indexedOutputFiles,
        events,
        workspacePath: workspace?.path,
      }),
    [events, indexedOutputFiles, workspace?.path],
  );
  // File events are emitted as soon as tools write to disk. Keep drafts,
  // temporary validation files, and in-place edits out of "This turn's
  // artifacts" until the task reaches its verified terminal state.
  const outputFileCandidates = taskOutputsReady
    ? currentTurnIndexedOutputFiles.length > 0
      ? currentTurnIndexedOutputFiles
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
      const workspaceId = workspace?.id;
      const workspacePath = workspace?.path;
      const isWorkspaceRoot =
        Boolean(workspacePath) && currentFolderPath === workspacePath;
      const sessionArtifactTaskIds =
        isWorkspaceRoot &&
        workspaceId &&
        (workspace?.isTemp === true || isTempWorkspaceId(workspaceId))
          ? Array.from(
              new Set(
                (sessionTasks.length > 0 ? sessionTasks : task ? [task] : [])
                  .map((item) => item?.id)
                  .filter(
                    (id): id is string =>
                      typeof id === "string" && id.length > 0,
                  ),
              ),
            )
          : [];
      const localFilesRequest = window.electronAPI.listHubFiles({
        source: "local",
        path: currentFolderPath,
        limit: 250,
        sortBy: "createdAt",
      });
      const artifactRequests =
        isWorkspaceRoot && workspaceId
          ? [
              window.electronAPI.listHubFiles({
                source: "artifacts",
                workspaceId,
                path: workspacePath,
                limit: 250,
                sortBy: "createdAt",
              }),
              ...sessionArtifactTaskIds.map((taskId) =>
                window.electronAPI.listHubFiles({
                  source: "artifacts",
                  taskId,
                  limit: 50,
                  sortBy: "createdAt",
                }),
              ),
            ]
          : [];
      const [localEntries, artifactEntryGroups] = await Promise.all([
        localFilesRequest,
        artifactRequests.length > 0
          ? Promise.all(artifactRequests)
          : Promise.resolve([]),
      ]);
      const artifactEntries = artifactEntryGroups.flatMap((entries) =>
        Array.isArray(entries) ? entries : [],
      );
      const localFiles = (Array.isArray(localEntries) ? localEntries : [])
        .map((entry: Any) => normalizeWorkspaceFileEntry(entry, "local"))
        .filter((entry): entry is WorkspaceFile => Boolean(entry));
      const artifactFiles = artifactEntries
        .map((entry: Any) => normalizeWorkspaceFileEntry(entry, "artifacts"))
        .filter((entry): entry is WorkspaceFile => Boolean(entry));
      if (requestId !== workspaceFilesRequestRef.current) return;
      setWorkspaceFiles(
        mergeWorkspaceBrowserFiles(localFiles, artifactFiles, workspacePath),
      );
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
  }, [
    currentFolderPath,
    sessionTasks,
    task,
    workspace?.id,
    workspace?.isTemp,
    workspace?.path,
  ]);

  const workspaceArtifactRefreshKey = useMemo(
    () =>
      currentTurnIndexedOutputFiles
        .map((file) => `${file.action}:${file.path}:${file.timestamp}`)
        .join("|"),
    [currentTurnIndexedOutputFiles],
  );

  const loadRecoveredOutputFiles = useCallback(async () => {
    const requestId = ++recoveredOutputsRequestRef.current;
    if (
      !taskOutputsReady ||
      !workspace?.path ||
      currentTurnIndexedOutputFiles.length > 0
    ) {
      setRecoveredOutputState({
        scopeKey: recoveredOutputScopeKey,
        files: [],
        loading: false,
      });
      return;
    }
    setRecoveredOutputState({
      scopeKey: recoveredOutputScopeKey,
      files: [],
      loading: true,
    });
    try {
      const [localResult, artifactResult] = await Promise.allSettled([
        window.electronAPI.listHubFiles({
          source: "local",
          path: workspace.path,
          limit: 250,
        }),
        window.electronAPI.listHubFiles({
          source: "artifacts",
          taskId: task?.id,
          limit: 100,
        }),
      ]);
      if (requestId !== recoveredOutputsRequestRef.current) return;
      const localFiles =
        localResult.status === "fulfilled" && Array.isArray(localResult.value)
          ? localResult.value
              .map((entry: Any) => normalizeWorkspaceFileEntry(entry, "local"))
              .filter((entry): entry is WorkspaceFile => Boolean(entry))
          : [];
      const artifactFiles =
        artifactResult.status === "fulfilled" &&
        Array.isArray(artifactResult.value)
          ? artifactResult.value
              .map((entry: Any) =>
                normalizeWorkspaceFileEntry(entry, "artifacts"),
              )
              .filter((entry): entry is WorkspaceFile => Boolean(entry))
          : [];
      setRecoveredOutputState({
        scopeKey: recoveredOutputScopeKey,
        files: deriveRecoveredTemporaryWorkspaceOutputs({
          task,
          workspace,
          files: mergeWorkspaceBrowserFiles(
            artifactFiles,
            localFiles,
            workspace.path,
          ),
          events,
        }),
        loading: false,
      });
    } catch {
      if (requestId !== recoveredOutputsRequestRef.current) return;
      setRecoveredOutputState({
        scopeKey: recoveredOutputScopeKey,
        files: [],
        loading: false,
      });
    }
  }, [
    events,
    currentTurnIndexedOutputFiles.length,
    recoveredOutputScopeKey,
    task,
    taskOutputsReady,
    workspace,
  ]);

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
    if (!workspace?.id || !window.electronAPI?.getWorkspaceContext) return;
    let cancelled = false;
    void window.electronAPI.getWorkspaceContext(workspace.id).then(result => {
      if (!cancelled) setWorkspaceContext(result);
    }).catch(() => { if (!cancelled) setWorkspaceContext(null); });
    return () => { cancelled = true; };
  }, [workspace?.id, task?.id, workspaceArtifactRefreshKey]);

  useEffect(() => {
    if (activeTab !== "files" || !workspace) return;
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
      .filter((file) =>
        shouldDisplayWorkspaceFile({
          file,
          canGoBack,
          copiedSourceFileKeys,
          canonicalOutputFileNames,
          workspacePath: workspace?.path,
        }),
      )
      .sort(compareWorkspaceFilesNewestFirst);
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
      ? (workspace ? workspaceDisplayName(workspace, context?.sessions[0]?.title || task?.title) : "") ||
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
  const conversationEvents = useMemo(
    () =>
      sessionConversationTasks.flatMap((sessionTask) =>
        sessionTask.id === task?.id
          ? events
          : sessionTaskEvents[sessionTask.id] || [],
      ),
    [events, sessionConversationTasks, sessionTaskEvents, task?.id],
  );
  const conversationRounds = useMemo(
    () =>
      buildSessionConversationRounds(
        conversationEvents,
        task,
        sessionConversationTasks,
      ),
    [conversationEvents, sessionConversationTasks, task],
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

  const fileSourceLabel = (path: string) => {
    if (!context || context.sessionCount < 2) return undefined;
    const key = getArtifactPathIdentityKey(path, workspace?.path);
    const origin = context.fileOrigins.find(item => getArtifactPathIdentityKey(item.path, workspace?.path) === key);
    return origin ? translate("workspaceOwnership.from", "From: {title}", { title: origin.title })
      : translate("workspaceOwnership.unassigned", "Workspace file · origin unrecorded");
  };

  if (!workspace) {
    const detail = workspaceError === "missing"
      ? translate("workspaceOwnership.missingDetail", "The original workspace folder could not be found. Your conversation is still available. Restore the folder and retry, or choose another folder to continue.")
      : workspaceError === "unavailable"
        ? translate("workspaceOwnership.unavailableDetail", "The original workspace folder cannot be accessed. Check its location and permissions, then retry.")
        : workspaceError === "timeout"
          ? translate("workspaceOwnership.timeoutDetail", "The workspace did not respond in time. Retry or choose another folder to continue.")
          : workspaceError
            ? translate("workspaceOwnership.failedDetail", "The workspace could not be loaded. Your conversation is still available. Please retry.")
            : translate("workspaceOwnership.loadingDetail", "Files will appear when this conversation’s workspace is ready.");
    return (
      <aside className="project-context-panel" aria-label={translate("workspaceContext.panel.aria", "Workspace")}>
        <header className="project-context-header">
          <div className="project-context-title">
            <FolderOpen size={18} aria-hidden="true" />
            <strong>{translate("workspaceOwnership.private", "This conversation’s workspace")}</strong>
          </div>
          {onCollapse && <button className="project-icon-button" type="button" onClick={onCollapse}
            aria-label={translate("workspaceContext.panel.close", "Close workspace panel")}
            title={translate("workspaceContext.panel.close", "Close workspace panel")}><X size={17} /></button>}
        </header>
        <div className="project-context-body">
          <div role={workspaceError ? "alert" : "status"}>
            <EmptyPanel icon={FolderOpen}
              title={workspaceError
                ? translate("workspaceOwnership.loadFailed", "Workspace unavailable")
                : translate("workspaceOwnership.loading", "Loading workspace…")}
              detail={detail} />
          </div>
          {workspaceError && <div className="workspace-recovery-actions">
            {onRetryWorkspace && <button type="button" onClick={onRetryWorkspace}><RefreshCw size={14} />{translate("workspaceOwnership.retry", "Retry loading")}</button>}
            {onChangeWorkspace && <button type="button" onClick={onChangeWorkspace}><FolderOpen size={14} />{translate("workspaceOwnership.relocate", "Choose a working folder")}</button>}
          </div>}
        </div>
      </aside>
    );
  }

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
        {!projectsVisible ? <WorkspaceIdentity key={workspace.id} workspace={workspace} task={task} context={context} onSelectWorkspace={onSelectWorkspace} /> : <div className="project-context-title">
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
        </div>}
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
                "workspaceOwnership.allFiles",
                "All files",
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
                    sourceLabel={fileSourceLabel(file.path)}
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
                    sourceLabel={fileSourceLabel(file.path)}
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
  sourceLabel,
}: {
  file: FileInfo;
  onOpen: (path: string) => void;
  onShowInFinder?: (path: string) => void;
  showAction?: boolean;
  showActions?: boolean;
  sourceLabel?: string;
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
          {sourceLabel && <small className="workspace-file-origin" title={sourceLabel}>{sourceLabel}</small>}
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
  sourceLabel,
}: {
  file: WorkspaceFile;
  onOpen: () => void;
  onOpenFolder: () => void;
  onShowInFinder: () => void;
  sourceLabel?: string;
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
              : formatTime(getWorkspaceFileCreationTime(file))}
          </small>
          {sourceLabel && <small className="workspace-file-origin" title={sourceLabel}>{sourceLabel}</small>}
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
