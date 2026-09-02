import {
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  useMemo,
  useCallback,
  useDeferredValue,
  memo,
} from "react";
import { createPortal } from "react-dom";
import {
  ChevronDown,
  ChevronRight,
  SlidersHorizontal,
  EyeOff,
  AppWindow,
  Bell,
  HardDrive,
  Rows3,
  Search,
  Server,
  Workflow,
  UsersRound,
  ListFilter,
  EllipsisVertical,
  Plus,
  Sparkles,
  Repeat2,
  Pencil,
  Pin,
  PinOff,
  Trash2,
  Lightbulb,
  Wrench,
  Clock3,
} from "lucide-react";
import { resolveTwinIcon } from "../utils/twin-icons";
import { stripAllEmojis } from "../utils/emoji-replacer";
import { Task, Workspace, UiDensity, UpdateInfo } from "../../shared/types";
import { PRODUCT_DISPLAY_VERSION } from "../../shared/product-brand";
import { isAutomatedTaskLike } from "../../shared/automated-task-detection";
import {
  deriveTaskAttentionState,
  getTaskAttentionCount,
} from "../../shared/task-attention";
import { VirtualList } from "./VirtualList";
import { SidebarTaskSignals } from "./SidebarTaskSignals";
import { capitalizeSidebarSessionTitle } from "../utils/sidebar-title";
import { deriveSlashCommandTaskTitle } from "../utils/slash-command-title";
import { translate, useLanguage } from "../i18n";
import { getLocalizedAgentRoleName } from "../utils/localized-agent-roles";
import { getLocalizedSidebarSystemTitle } from "../utils/localized-sidebar-titles";

const SIDEBAR_ITEM_HEIGHT = 22;
const SIDEBAR_DATE_HEADER_HEIGHT = 20;
const SIDEBAR_FOCUSED_ITEM_HEIGHT = 28;
const SIDEBAR_FOCUSED_DATE_HEADER_HEIGHT = 26;
const SIDEBAR_LOAD_MORE_HEIGHT = 32;
const SIDEBAR_VIRTUALIZATION_MIN_ROWS = 30;
const SIDEBAR_LOAD_MORE_THRESHOLD_PX = 320;
const SIDEBAR_TASK_MENU_WIDTH = 136;
const SIDEBAR_TASK_MENU_ESTIMATED_HEIGHT = 102;
const SIDEBAR_TASK_MENU_GAP = 8;
const SIDEBAR_TASK_MENU_VIEWPORT_PADDING = 8;

interface AgentRoleInfo {
  id: string;
  displayName: string;
  color: string;
  icon?: string;
}

export function formatRelativeShort(timestamp?: number): string {
  if (!timestamp) return "";
  const diff = Date.now() - timestamp;
  const minutes = Math.max(1, Math.round(diff / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.round(days / 7);
  if (weeks < 4) return `${weeks}w`;
  const months = Math.round(days / 30);
  if (months < 12) return `${Math.max(1, months)}mo`;
  const years = Math.round(days / 365);
  return `${Math.max(1, years)}y`;
}

interface SidebarProps {
  workspace: Workspace | null;
  tasks: Task[];
  selectedTaskId: string | null;
  isEverydayAgentActive?: boolean;
  isAgentTeamActive?: boolean;
  isIdeasActive?: boolean;
  isAutomationsActive?: boolean;
  isToolsAndSkillsActive?: boolean;
  isLoadingSessions?: boolean;
  isLoadingMoreTasks?: boolean;
  completionAttentionTaskIds?: string[];
  onSelectTask: (id: string | null) => void;
  onOpenEverydayAgent?: () => void;
  onOpenAgentTeam?: () => void;
  onOpenIdeas?: () => void;
  onOpenToolsAndSkills?: () => void;
  onNewSession?: () => void;
  onOpenSettings: () => void;
  onOpenSetupGuide?: () => void;
  onOpenAutomations: () => void;
  onOpenDevices?: () => void;
  isDevicesActive?: boolean;

  onTasksChanged: () => void;
  onLoadMoreTasks?: () => void;
  hasMoreTasks?: boolean;
  uiDensity?: UiDensity;
  updateInfo?: UpdateInfo | null;
  onViewUpdate?: () => void;
}

/** Visual session mode derived from task metadata */
export type SessionMode =
  | "standard"
  | "autonomous"
  | "collab"
  | "multitask"
  | "multi-llm"
  | "scheduled"
  | "think"
  | "comparison"
  | "video";

const SESSION_MODE_META: Record<
  SessionMode,
  { label: string; shortLabel: string; color: string }
> = {
  standard: { label: "Standard", shortLabel: "STD", color: "standard" },
  autonomous: { label: "Autonomous", shortLabel: "AUTO", color: "autonomous" },
  collab: { label: "Collaborative", shortLabel: "COLLAB", color: "collab" },
  multitask: { label: "Multitask", shortLabel: "MULTI", color: "collab" },
  "multi-llm": { label: "Multi-LLM", shortLabel: "MULTI", color: "multi-llm" },
  scheduled: { label: "Scheduled", shortLabel: "SCHED", color: "scheduled" },
  think: { label: "Think", shortLabel: "THINK", color: "think" },
  comparison: { label: "Comparison", shortLabel: "CMP", color: "comparison" },
  video: { label: "Video", shortLabel: "VID", color: "video" },
};

/** Derive the primary session mode from task metadata */
export function getSessionMode(task: Task): SessionMode {
  if (
    task.agentConfig?.videoGenerationMode ||
    task.agentConfig?.taskDomain === "media"
  )
    return "video";
  if (task.agentConfig?.multitaskMode) return "multitask";
  if (task.agentConfig?.collaborativeMode) return "collab";
  if (task.agentConfig?.multiLlmMode) return "multi-llm";
  if (task.agentConfig?.autonomousMode) return "autonomous";
  if (task.agentConfig?.conversationMode === "think") return "think";
  if (task.comparisonSessionId) return "comparison";
  if (task.source === "cron" || task.title?.startsWith("Scheduled:"))
    return "scheduled";
  return "standard";
}

/** Returns true for sessions that were created automatically (not by the user
 *  directly). These are grouped into a collapsible "Automated" folder at the
 *  bottom of the sidebar so they don't push user sessions off screen. */
export function isAutomatedSession(task: Task): boolean {
  return isAutomatedTaskLike(task);
}

/** Returns true for conversations created by the one-click agent team flow. */
export function isTeamSession(task: Task): boolean {
  return task.agentConfig?.collaborativeMode === true;
}

const HIDDEN_FOCUSED_STATUSES: ReadonlySet<Task["status"]> = new Set([
  "failed",
  "cancelled",
]);
const ACTIVE_SESSION_STATUSES: ReadonlySet<Task["status"]> = new Set([
  "executing",
  "planning",
  "interrupted",
]);
const AWAITING_SESSION_STATUSES: ReadonlySet<Task["status"]> = new Set([
  "paused",
  "blocked",
]);

export function isActiveSessionStatus(status: Task["status"]): boolean {
  return ACTIVE_SESSION_STATUSES.has(status);
}

export function isAwaitingSessionStatus(status: Task["status"]): boolean {
  return AWAITING_SESSION_STATUSES.has(status);
}

export function shouldShowTaskInSidebarSessions(task: Task): boolean {
  if (task.source === "managed_agent_panel") return false;
  return !task.targetNodeId;
}

export function compareTasksByPinAndRecency(a: Task, b: Task): number {
  const pinnedDiff = Number(Boolean(b.pinned)) - Number(Boolean(a.pinned));
  if (pinnedDiff !== 0) return pinnedDiff;
  const recencyDiff =
    (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt);
  if (recencyDiff !== 0) return recencyDiff;
  return b.createdAt - a.createdAt;
}

export function getLatestUserSidebarTaskId(tasks: Task[]): string | null {
  let latest: Task | null = null;
  for (const task of tasks) {
    if (task.parentTaskId || !shouldShowTaskInSidebarSessions(task)) continue;
    if (isAutomatedSession(task)) continue;
    if (!latest) {
      latest = task;
      continue;
    }
    const taskActivityAt = task.updatedAt || task.createdAt;
    const latestActivityAt = latest.updatedAt || latest.createdAt;
    if (
      taskActivityAt > latestActivityAt ||
      (taskActivityAt === latestActivityAt && task.createdAt > latest.createdAt)
    ) {
      latest = task;
    }
  }
  return latest?.id ?? null;
}

export function getSidebarDateGroup(
  task: Pick<Task, "createdAt" | "updatedAt" | "pinned">,
  now = new Date(),
): string {
  if (task.pinned) return "Pinned";

  const date = new Date(task.updatedAt || task.createdAt);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  if (date >= today) return "Today";
  if (date >= yesterday) return "Yesterday";
  return "Earlier";
}

function translateSidebarDateGroup(label: string): string {
  return translate(`sidebar.date.${label.toLowerCase()}`, label);
}

function areStringSetsEqual(
  left: ReadonlySet<string>,
  right: ReadonlySet<string>,
): boolean {
  if (left.size !== right.size) return false;
  for (const value of left) {
    if (!right.has(value)) return false;
  }
  return true;
}

export function shouldShowRootTaskInSidebar(
  task: Task,
  uiDensity: UiDensity,
  showFailedSessions: boolean,
  hasPinnedDescendant = false,
  forceVisible = false,
): boolean {
  if (uiDensity !== "focused") return true;
  if (showFailedSessions) return true;
  if (forceVisible) return true;
  if (task.pinned) return true;
  if (hasPinnedDescendant) return true;
  return !HIDDEN_FOCUSED_STATUSES.has(task.status);
}

export function countHiddenFailedSessions(
  tasks: Task[],
  uiDensity: UiDensity,
  forceVisibleTaskIds: ReadonlySet<string> = new Set(),
): number {
  const cache = new Map<string, Task[]>();
  for (const task of tasks) {
    if (task.parentTaskId) {
      const siblings = cache.get(task.parentTaskId) || [];
      siblings.push(task);
      cache.set(task.parentTaskId, siblings);
    }
  }

  const hasPinnedDescendant = (taskId: string): boolean => {
    const stack = [...(cache.get(taskId) || [])];
    const seen = new Set<string>();

    while (stack.length > 0) {
      const task = stack.pop();
      if (!task || seen.has(task.id)) continue;
      seen.add(task.id);

      if (task.pinned) return true;

      const children = cache.get(task.id) || [];
      for (const child of children) {
        if (!seen.has(child.id)) {
          stack.push(child);
        }
      }
    }

    return false;
  };

  if (uiDensity !== "focused") return 0;
  return tasks.filter(
    (task) =>
      shouldShowTaskInSidebarSessions(task) &&
      !task.parentTaskId &&
      !task.pinned &&
      !forceVisibleTaskIds.has(task.id) &&
      !hasPinnedDescendant(task.id) &&
      HIDDEN_FOCUSED_STATUSES.has(task.status),
  ).length;
}

// Tree node structure for hierarchical display
export interface TaskTreeNode {
  task: Task;
  children: TaskTreeNode[];
  synthetic?: boolean;
  displayTitle?: string;
}

export type SidebarSessionCategory = "all" | "team" | "automated";

export function resolveSidebarSessionCategoryTrees(
  userTaskTree: TaskTreeNode[],
  automatedTaskTree: TaskTreeNode[],
  category: SidebarSessionCategory,
  revealAllForSearch = false,
): { user: TaskTreeNode[]; automated: TaskTreeNode[] } {
  if (revealAllForSearch) {
    return { user: userTaskTree, automated: automatedTaskTree };
  }
  if (category === "all") {
    return { user: userTaskTree, automated: [] };
  }
  if (category === "team") {
    return {
      user: userTaskTree.filter((node) => isTeamSession(node.task)),
      automated: [],
    };
  }
  return { user: [], automated: automatedTaskTree };
}

const GENERIC_SESSION_TITLES = new Set([
  "...",
  "new session",
  "new task",
  "run",
  "run...",
  "untitled",
  "untitled session",
  "untitled task",
]);

function normalizeSidebarTitleCandidate(value?: string | null): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  const userRequestMatch = trimmed.match(/(?:^|\n)User request:\s*([\s\S]+)/i);
  const candidate = (userRequestMatch?.[1] || trimmed)
    .replace(/\s+/g, " ")
    .trim();
  return deriveSlashCommandTaskTitle(candidate) || candidate;
}

function isGenericSidebarTitle(value: string): boolean {
  return GENERIC_SESSION_TITLES.has(normalizeSidebarSessionSearch(value));
}

export function getSidebarSessionTitle(
  node: Pick<TaskTreeNode, "displayTitle" | "task">,
): string {
  const primaryCandidates = [node.displayTitle, node.task.title];
  for (const candidate of primaryCandidates) {
    const normalized = normalizeSidebarTitleCandidate(candidate);
    if (normalized && !isGenericSidebarTitle(normalized))
      return capitalizeSidebarSessionTitle(normalized);
  }

  const fallbackCandidates = [
    node.task.sidebarPromptPreview,
    node.task.userPrompt,
    node.task.rawPrompt,
    node.task.prompt,
    node.task.semanticSummary,
    node.task.resultSummary,
    node.task.bestKnownOutcome?.resultSummary,
    node.task.branchLabel,
    ...primaryCandidates,
  ];
  for (const candidate of fallbackCandidates) {
    const normalized = normalizeSidebarTitleCandidate(candidate);
    if (normalized) return capitalizeSidebarSessionTitle(normalized);
  }

  return "Untitled session";
}

const SIDEBAR_TITLE_ELLIPSIS = "...";

type TextMeasurer = (value: string) => number;

export function truncateSidebarTitleToFit(
  value: string,
  maxWidth: number,
  measureText: TextMeasurer,
): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  if (maxWidth <= 0) return normalized;
  if (measureText(normalized) <= maxWidth) return normalized;

  const ellipsisWidth = measureText(SIDEBAR_TITLE_ELLIPSIS);
  if (ellipsisWidth > maxWidth) return "";

  let low = 0;
  let high = normalized.length;
  let best = "";

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const prefix = normalized.slice(0, mid).trimEnd();
    const candidate = `${prefix}${SIDEBAR_TITLE_ELLIPSIS}`;
    if (measureText(candidate) <= maxWidth) {
      best = candidate;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return best || SIDEBAR_TITLE_ELLIPSIS;
}

let sidebarTitleMeasureCanvas: HTMLCanvasElement | null = null;

function getSidebarTitleMeasureContext(): CanvasRenderingContext2D | null {
  if (typeof document === "undefined") return null;
  sidebarTitleMeasureCanvas ||= document.createElement("canvas");
  return sidebarTitleMeasureCanvas.getContext("2d");
}

function getElementFont(element: HTMLElement): string {
  const style = window.getComputedStyle(element);
  if (style.font) return style.font;
  return [
    style.fontStyle,
    style.fontVariant,
    style.fontWeight,
    style.fontSize,
    style.fontFamily,
  ].join(" ");
}

function SidebarWordBoundaryTitle({
  text,
  className,
  title,
}: {
  text: string;
  className: string;
  title: string;
}) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [displayText, setDisplayText] = useState(() =>
    text.replace(/\s+/g, " ").trim(),
  );

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || typeof window === "undefined") {
      setDisplayText(text.replace(/\s+/g, " ").trim());
      return;
    }

    const update = () => {
      const width = Math.floor(element.getBoundingClientRect().width);
      if (width <= 0) return;

      const context = getSidebarTitleMeasureContext();
      if (!context) {
        setDisplayText(text.replace(/\s+/g, " ").trim());
        return;
      }

      context.font = getElementFont(element);
      const next = truncateSidebarTitleToFit(
        text,
        width,
        (candidate) => context.measureText(candidate).width,
      );
      setDisplayText((current) => (current === next ? current : next));
    };

    update();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", update);
      return () => window.removeEventListener("resize", update);
    }

    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [text]);

  return (
    <span ref={ref} className={className} title={title}>
      {displayText}
    </span>
  );
}

export function normalizeSidebarSessionSearch(value: string): string {
  return stripAllEmojis(value).toLocaleLowerCase().replace(/\s+/g, " ").trim();
}

function getTaskTreeNodeSearchText(node: TaskTreeNode): string {
  return normalizeSidebarSessionSearch(
    [
      getSidebarSessionTitle(node),
      node.displayTitle,
      node.task.title,
      node.task.sidebarPromptPreview,
      node.task.userPrompt,
      node.task.rawPrompt,
      node.task.prompt,
      node.task.semanticSummary,
      node.task.resultSummary,
      node.task.branchLabel,
      node.task.id,
    ]
      .filter(
        (value): value is string =>
          typeof value === "string" && value.trim().length > 0,
      )
      .join(" "),
  );
}

function filterTaskTreeBySearchInternal(
  nodes: TaskTreeNode[],
  normalizedQuery: string,
): TaskTreeNode[] {
  return nodes.flatMap((node) => {
    const matchesSelf =
      getTaskTreeNodeSearchText(node).includes(normalizedQuery);
    if (matchesSelf) {
      return [node];
    }

    const filteredChildren = filterTaskTreeBySearchInternal(
      node.children,
      normalizedQuery,
    );

    if (filteredChildren.length === 0) {
      return [];
    }

    return [{ ...node, children: filteredChildren }];
  });
}

export function filterTaskTreeBySearch(
  nodes: TaskTreeNode[],
  query: string,
): TaskTreeNode[] {
  const normalizedQuery = normalizeSidebarSessionSearch(query);
  if (!normalizedQuery) return nodes;
  return filterTaskTreeBySearchInternal(nodes, normalizedQuery);
}

export interface SidebarVisibleRow {
  node: TaskTreeNode;
  depth: number;
  isLast: boolean;
  rootIndex: number;
}

export type SidebarVirtualRow =
  | {
      kind: "date-header";
      id: string;
      label: string;
    }
  | {
      kind: "task";
      row: SidebarVisibleRow;
      section?: "user" | "automated";
    }
  | {
      kind: "load-more";
      id: string;
      loading: boolean;
    };

export function flattenVisibleTaskRows(
  nodes: TaskTreeNode[],
  collapsedTaskIds: ReadonlySet<string>,
): SidebarVisibleRow[] {
  const rows: SidebarVisibleRow[] = [];

  const visit = (
    siblings: TaskTreeNode[],
    depth: number,
    rootIndex: number,
  ) => {
    siblings.forEach((node, siblingIndex) => {
      const resolvedRootIndex = depth === 0 ? siblingIndex : rootIndex;
      rows.push({
        node,
        depth,
        isLast: siblingIndex === siblings.length - 1,
        rootIndex: resolvedRootIndex,
      });

      if (node.children.length > 0 && !collapsedTaskIds.has(node.task.id)) {
        visit(node.children, depth + 1, resolvedRootIndex);
      }
    });
  };

  visit(nodes, 0, 0);
  return rows;
}

export function buildSidebarVirtualRows(
  taskRows: SidebarVisibleRow[],
  options: { showDateHeaders: boolean; now?: Date },
): SidebarVirtualRow[] {
  if (!options.showDateHeaders) {
    return taskRows.map((row) => ({ kind: "task", row, section: "user" }));
  }

  const rows: SidebarVirtualRow[] = [];
  const now = options.now ?? new Date();
  let previousRootGroup = "";

  taskRows.forEach((row, index) => {
    if (row.depth === 0) {
      const group = getSidebarDateGroup(row.node.task, now);
      if (group !== previousRootGroup) {
        rows.push({
          kind: "date-header",
          id: `date:${group}:${row.node.task.id}:${index}`,
          label: group,
        });
        previousRootGroup = group;
      }
    }
    rows.push({ kind: "task", row, section: "user" });
  });

  return rows;
}

function compareTaskTreeNodes(a: TaskTreeNode, b: TaskTreeNode): number {
  return compareTasksByPinAndRecency(a.task, b.task);
}

function getSidebarTaskListSignature(tasks: Task[]): string {
  if (tasks.length === 0) return "";
  const parts: string[] = [];
  for (let i = 0; i < Math.min(tasks.length, 100); i++) {
    const t = tasks[i];
    parts.push(
      `${t.id}:${t.status}:${t.terminalStatus || ""}:${t.updatedAt ?? 0}:` +
        `${t.provenanceSummary?.providerKey || ""}:${t.provenanceSummary?.count || 0}`,
    );
  }
  return `${tasks.length}|${parts.join(",")}`;
}

function areSidebarPropsEqual(prev: SidebarProps, next: SidebarProps): boolean {
  return (
    prev.workspace?.id === next.workspace?.id &&
    prev.selectedTaskId === next.selectedTaskId &&
    prev.isEverydayAgentActive === next.isEverydayAgentActive &&
    prev.isAgentTeamActive === next.isAgentTeamActive &&
    prev.isIdeasActive === next.isIdeasActive &&
    prev.isAutomationsActive === next.isAutomationsActive &&
    prev.isToolsAndSkillsActive === next.isToolsAndSkillsActive &&
    prev.isDevicesActive === next.isDevicesActive &&
    prev.isLoadingSessions === next.isLoadingSessions &&
    prev.isLoadingMoreTasks === next.isLoadingMoreTasks &&
    prev.hasMoreTasks === next.hasMoreTasks &&
    prev.uiDensity === next.uiDensity &&
    getSidebarTaskListSignature(prev.tasks) ===
      getSidebarTaskListSignature(next.tasks) &&
    (prev.completionAttentionTaskIds || []).join(",") ===
      (next.completionAttentionTaskIds || []).join(",") &&
    prev.updateInfo?.latestVersion === next.updateInfo?.latestVersion &&
    prev.onSelectTask === next.onSelectTask &&
    prev.onTasksChanged === next.onTasksChanged &&
    prev.onOpenSettings === next.onOpenSettings &&
    prev.onOpenSetupGuide === next.onOpenSetupGuide &&
    prev.onOpenAgentTeam === next.onOpenAgentTeam &&
    prev.onOpenIdeas === next.onOpenIdeas &&
    prev.onOpenToolsAndSkills === next.onOpenToolsAndSkills &&
    prev.onOpenAutomations === next.onOpenAutomations
  );
}

function SidebarComponent({
  workspace: _workspace,
  tasks,
  selectedTaskId,
  isEverydayAgentActive = false,
  isAgentTeamActive = false,
  isIdeasActive = false,
  isAutomationsActive = false,
  isToolsAndSkillsActive = false,
  isLoadingSessions = false,
  completionAttentionTaskIds = [],
  onSelectTask,
  onOpenEverydayAgent,
  onOpenAgentTeam,
  onOpenIdeas,
  onOpenToolsAndSkills,
  onNewSession,
  onOpenSettings,
  onOpenSetupGuide,
  onOpenAutomations,
  onOpenDevices: _onOpenDevices,
  isDevicesActive = false,
  isLoadingMoreTasks = false,

  onTasksChanged,
  onLoadMoreTasks,
  hasMoreTasks = false,
  uiDensity = "focused",
  updateInfo,
  onViewUpdate,
}: SidebarProps) {
  useLanguage();
  const [updateDismissed, setUpdateDismissed] = useState(false);
  const [menuOpenTaskId, setMenuOpenTaskId] = useState<string | null>(null);
  const [renameTaskId, setRenameTaskId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [collapsedTasks, setCollapsedTasks] = useState<Set<string>>(new Set());
  const [agentRoles, setAgentRoles] = useState<Map<string, AgentRoleInfo>>(
    new Map(),
  );
  // Failure is a task status, not a top-level conversation category. Failed
  // sessions remain visible in history and carry their status marker there.
  const [sessionCategory, setSessionCategory] =
    useState<SidebarSessionCategory>("all");
  const [showSessionSearch, setShowSessionSearch] = useState(false);
  const [showSessionFilters, setShowSessionFilters] = useState(false);
  const [pinActionError, setPinActionError] = useState<string | null>(null);
  const [archiveActionError, setArchiveActionError] = useState<string | null>(
    null,
  );
  const [menuPosition, setMenuPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const [activeModeFilters, setActiveModeFilters] = useState<Set<SessionMode>>(
    new Set(),
  );
  const [showFilterBar] = useState(false);
  const [sessionsCollapsed, setSessionsCollapsed] = useState(false);
  const [sessionSearch, setSessionSearch] = useState("");
  const pinActionErrorTimeoutRef = useRef<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<Map<string, HTMLButtonElement>>(new Map());
  const renameInputRef = useRef<HTMLInputElement>(null);
  const taskListRef = useRef<HTMLDivElement>(null);
  const completionAttentionSet = useMemo(
    () => new Set(completionAttentionTaskIds),
    [completionAttentionTaskIds],
  );
  const deferredSessionSearch = useDeferredValue(sessionSearch);
  const normalizedSessionSearch = useMemo(
    () => normalizeSidebarSessionSearch(deferredSessionSearch),
    [deferredSessionSearch],
  );
  const hasSessionSearch = normalizedSessionSearch.length > 0;

  useEffect(() => {
    window.electronAPI
      .getAgentRoles(false)
      .then(
        (
          roles: {
            id: string;
            displayName: string;
            color?: string;
            icon?: string;
          }[],
        ) => {
          const map = new Map<string, AgentRoleInfo>();
          for (const r of roles) {
            map.set(r.id, {
              id: r.id,
              displayName: r.displayName,
              color: r.color || "#6366f1",
              icon: r.icon,
            });
          }
          setAgentRoles(map);
        },
      )
      .catch(() => {});
  }, []);

  const forceVisibleSessionIds = useMemo(() => {
    const ids = new Set<string>();
    const latestTaskId = getLatestUserSidebarTaskId(tasks);
    if (latestTaskId) ids.add(latestTaskId);
    if (selectedTaskId) ids.add(selectedTaskId);
    return ids;
  }, [selectedTaskId, tasks]);

  // Build task tree from flat list
  const taskTree = useMemo(() => {
    const childrenMap = new Map<string, Task[]>();

    // Index all tasks
    for (const task of tasks) {
      if (task.parentTaskId) {
        const siblings = childrenMap.get(task.parentTaskId) || [];
        siblings.push(task);
        childrenMap.set(task.parentTaskId, siblings);
      }
    }

    const hasPinnedDescendant = (taskId: string): boolean => {
      const stack = [...(childrenMap.get(taskId) || [])];
      const seen = new Set<string>();

      while (stack.length > 0) {
        const task = stack.pop();
        if (!task || seen.has(task.id)) continue;
        seen.add(task.id);

        if (task.pinned) return true;

        const children = childrenMap.get(task.id) || [];
        for (const child of children) {
          if (!seen.has(child.id)) {
            stack.push(child);
          }
        }
      }

      return false;
    };

    // Build tree nodes recursively
    const buildNode = (task: Task): TaskTreeNode => {
      const children = childrenMap.get(task.id) || [];
      // Sort children: pinned sessions first, then newest first
      children.sort(compareTasksByPinAndRecency);
      return {
        task,
        children: children.map(buildNode),
      };
    };

    // Get root tasks (no parent) and sort by creation time (newest first)
    let rootTasks = tasks
      .filter((t) => !t.parentTaskId && shouldShowTaskInSidebarSessions(t))
      .filter((t) =>
        shouldShowRootTaskInSidebar(
          t,
          uiDensity,
          true,
          hasPinnedDescendant(t.id),
          forceVisibleSessionIds.has(t.id),
        ),
      )
      .sort(compareTasksByPinAndRecency);

    const groupedNodes: TaskTreeNode[] = [];
    const consumed = new Set<string>();
    const improvementRoots = rootTasks.filter(
      (task) => task.source === "improvement" || task.source === "subconscious",
    );

    for (const task of improvementRoots) {
      if (consumed.has(task.id)) continue;
      const match = task.title.match(/^Improve \(([^)]+)\):\s*(.+)$/);
      if (!match) continue;
      const suffix = match[2].trim();
      const siblings = improvementRoots.filter((candidate) => {
        if (consumed.has(candidate.id)) return false;
        const candidateMatch = candidate.title.match(
          /^Improve \(([^)]+)\):\s*(.+)$/,
        );
        if (!candidateMatch) return false;
        if (candidateMatch[2].trim() !== suffix) return false;
        return Math.abs(candidate.createdAt - task.createdAt) <= 60_000;
      });
      if (siblings.length < 2) continue;

      siblings.sort(compareTasksByPinAndRecency);
      for (const sibling of siblings) consumed.add(sibling.id);

      const syntheticTask: Task = {
        ...siblings[0],
        id: `improvement-group:${suffix}:${task.createdAt}`,
        title: `Improve campaign: ${suffix}`,
        status: siblings.some((item) => isActiveSessionStatus(item.status))
          ? "executing"
          : siblings.some((item) => isAwaitingSessionStatus(item.status))
            ? "paused"
            : siblings.every((item) => item.status === "completed")
              ? "completed"
              : siblings.every(
                    (item) =>
                      item.status === "failed" || item.status === "cancelled",
                  )
                ? "failed"
                : siblings[0].status,
        createdAt: Math.min(...siblings.map((item) => item.createdAt)),
        updatedAt: Math.max(...siblings.map((item) => item.updatedAt)),
      };

      groupedNodes.push({
        task: syntheticTask,
        synthetic: true,
        displayTitle: syntheticTask.title,
        children: siblings.map((child) => buildNode(child)),
      });
    }

    const remainingNodes = rootTasks
      .filter((task) => !consumed.has(task.id))
      .map(buildNode);
    return [...groupedNodes, ...remainingNodes].sort(compareTaskTreeNodes);
  }, [forceVisibleSessionIds, tasks, uiDensity]);

  // Split root tasks into user-created vs automated sessions.
  // Automated sessions (improvement, cron, hook, api, heartbeat) are rendered
  // in a separate collapsible folder so they don't crowd out user sessions.
  const { userTaskTree, automatedTaskTree } = useMemo(() => {
    const user: TaskTreeNode[] = [];
    const automated: TaskTreeNode[] = [];
    for (const node of taskTree) {
      if (isAutomatedSession(node.task)) {
        automated.push(node);
      } else {
        user.push(node);
      }
    }
    return { userTaskTree: user, automatedTaskTree: automated };
  }, [taskTree]);

  const teamSessionCount = useMemo(
    () => userTaskTree.filter((node) => isTeamSession(node.task)).length,
    [userTaskTree],
  );

  useEffect(() => {
    if (
      (sessionCategory === "team" && teamSessionCount === 0) ||
      (sessionCategory === "automated" && automatedTaskTree.length === 0)
    ) {
      setSessionCategory("all");
    }
  }, [automatedTaskTree.length, sessionCategory, teamSessionCount]);

  const categoryTrees = useMemo(
    () =>
      resolveSidebarSessionCategoryTrees(
        userTaskTree,
        automatedTaskTree,
        sessionCategory,
        hasSessionSearch,
      ),
    [automatedTaskTree, hasSessionSearch, sessionCategory, userTaskTree],
  );

  // Count root tasks per session mode (for filter badge counts).
  // Automated sessions live in their own folder, so they're excluded from
  // the mode-filter bar counts.
  const modeCounts = useMemo(() => {
    const counts = new Map<SessionMode, number>();
    for (const node of userTaskTree) {
      const mode = getSessionMode(node.task);
      counts.set(mode, (counts.get(mode) || 0) + 1);
    }
    return counts;
  }, [userTaskTree]);

  // Which modes are actually present in current sessions
  const availableModes = useMemo(() => {
    const modes: SessionMode[] = [];
    for (const mode of Object.keys(SESSION_MODE_META) as SessionMode[]) {
      if ((modeCounts.get(mode) || 0) > 0) modes.push(mode);
    }
    return modes;
  }, [modeCounts]);
  const availableModeSet = useMemo(
    () => new Set(availableModes),
    [availableModes],
  );

  // Remove stale filters when workspace/task data changes and previously
  // selected modes are no longer available.
  useEffect(() => {
    if (activeModeFilters.size === 0) return;

    let hasStaleFilter = false;
    for (const mode of activeModeFilters) {
      if (!availableModeSet.has(mode)) {
        hasStaleFilter = true;
        break;
      }
    }
    if (!hasStaleFilter) return;

    setActiveModeFilters((prev) => {
      let changed = false;
      const next = new Set<SessionMode>();
      for (const mode of prev) {
        if (availableModeSet.has(mode)) {
          next.add(mode);
        } else {
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [activeModeFilters, availableModeSet]);

  // Apply mode filter to user sessions only; automated sessions are always
  // shown in their own folder regardless of the active mode filter.
  const modeFilteredTaskTree = useMemo(() => {
    if (activeModeFilters.size === 0) return categoryTrees.user;
    return categoryTrees.user.filter((node) =>
      activeModeFilters.has(getSessionMode(node.task)),
    );
  }, [activeModeFilters, categoryTrees.user]);

  const filteredTaskTree = useMemo(
    () => filterTaskTreeBySearch(modeFilteredTaskTree, normalizedSessionSearch),
    [modeFilteredTaskTree, normalizedSessionSearch],
  );

  const filteredAutomatedTaskTree = useMemo(
    () =>
      filterTaskTreeBySearch(categoryTrees.automated, normalizedSessionSearch),
    [categoryTrees.automated, normalizedSessionSearch],
  );
  const visibleAutomatedTaskTree = filteredAutomatedTaskTree;

  const effectiveCollapsedTasks = useMemo(
    () => (hasSessionSearch ? new Set<string>() : collapsedTasks),
    [collapsedTasks, hasSessionSearch],
  );

  const toggleModeFilter = useCallback((mode: SessionMode) => {
    setActiveModeFilters((prev) => {
      const next = new Set(prev);
      if (next.has(mode)) {
        next.delete(mode);
      } else {
        next.add(mode);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    return () => {
      if (pinActionErrorTimeoutRef.current !== null) {
        window.clearTimeout(pinActionErrorTimeoutRef.current);
      }
    };
  }, []);

  const visibleCategoryTaskTree = useMemo(
    () =>
      [...filteredTaskTree, ...visibleAutomatedTaskTree].sort(
        compareTaskTreeNodes,
      ),
    [filteredTaskTree, visibleAutomatedTaskTree],
  );
  const visibleCategoryTaskRows = useMemo(
    () =>
      flattenVisibleTaskRows(visibleCategoryTaskTree, effectiveCollapsedTasks),
    [effectiveCollapsedTasks, visibleCategoryTaskTree],
  );
  const sidebarVirtualRows = useMemo(() => {
    const rows = buildSidebarVirtualRows(visibleCategoryTaskRows, {
      showDateHeaders: uiDensity === "focused",
    }).map((row): SidebarVirtualRow =>
      row.kind === "task" && isAutomatedSession(row.row.node.task)
        ? { ...row, section: "automated" }
        : row,
    );
    if (hasMoreTasks) {
      rows.push({
        kind: "load-more",
        id: "load-more",
        loading: isLoadingMoreTasks,
      });
    }
    return rows;
  }, [hasMoreTasks, isLoadingMoreTasks, uiDensity, visibleCategoryTaskRows]);

  const useVirtualizedTaskRows =
    sidebarVirtualRows.length > SIDEBAR_VIRTUALIZATION_MIN_ROWS;

  // Auto-collapse sub-agent trees in focused mode
  const hasInitializedCollapse = useRef(false);
  useEffect(() => {
    const parentByTaskId = new Map<string, string>();
    const parentsWithChildren = new Set<string>();

    for (const task of tasks) {
      if (task.parentTaskId) {
        parentByTaskId.set(task.id, task.parentTaskId);
        parentsWithChildren.add(task.parentTaskId);
      }
    }

    const expandAncestorsForImportantTasks = (collapsed: Set<string>): void => {
      for (const task of tasks) {
        if (!task.pinned && task.id !== selectedTaskId) continue;

        let currentParent = task.parentTaskId;
        const seen = new Set<string>();
        while (currentParent && !seen.has(currentParent)) {
          seen.add(currentParent);
          collapsed.delete(currentParent);
          const nextParent = parentByTaskId.get(currentParent);
          if (!nextParent) break;
          currentParent = nextParent;
        }
      }
    };

    if (uiDensity === "focused") {
      if (!hasInitializedCollapse.current) {
        expandAncestorsForImportantTasks(parentsWithChildren);
        if (parentsWithChildren.size > 0) {
          setCollapsedTasks((prev) =>
            areStringSetsEqual(prev, parentsWithChildren)
              ? prev
              : parentsWithChildren,
          );
        }
        hasInitializedCollapse.current = true;
      } else {
        setCollapsedTasks((prev) => {
          const next = new Set(prev);
          expandAncestorsForImportantTasks(next);
          return areStringSetsEqual(prev, next) ? prev : next;
        });
      }
    }
    if (uiDensity === "full") {
      hasInitializedCollapse.current = false;
    }
  }, [selectedTaskId, uiDensity, tasks]);

  // Infinite scroll — load the next page when the user scrolls near the bottom
  useEffect(() => {
    if (useVirtualizedTaskRows) return;
    const el = taskListRef.current;
    if (!el || !onLoadMoreTasks) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = el;
      if (
        scrollHeight - scrollTop - clientHeight <
        SIDEBAR_LOAD_MORE_THRESHOLD_PX
      ) {
        onLoadMoreTasks();
      }
    };

    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [onLoadMoreTasks, useVirtualizedTaskRows]);

  // If the first page does not fill the scroll container (for example because
  // focused mode hides failed sessions), keep paging until the list can scroll.
  useEffect(() => {
    if (
      useVirtualizedTaskRows ||
      sessionsCollapsed ||
      !hasMoreTasks ||
      !onLoadMoreTasks
    )
      return;

    const frame = window.requestAnimationFrame(() => {
      const el = taskListRef.current;
      if (!el) return;
      if (el.scrollHeight <= el.clientHeight + SIDEBAR_LOAD_MORE_THRESHOLD_PX) {
        onLoadMoreTasks();
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [
    filteredTaskTree.length,
    hasMoreTasks,
    onLoadMoreTasks,
    sessionsCollapsed,
    useVirtualizedTaskRows,
    visibleAutomatedTaskTree.length,
  ]);

  const updateMenuPosition = useCallback((taskId: string) => {
    const button = menuButtonRef.current.get(taskId);
    if (!button) return;

    const rect = button.getBoundingClientRect();
    const menuWidth = SIDEBAR_TASK_MENU_WIDTH;
    const menuHeight =
      menuRef.current?.offsetHeight || SIDEBAR_TASK_MENU_ESTIMATED_HEIGHT;
    const viewportPadding = SIDEBAR_TASK_MENU_VIEWPORT_PADDING;

    let left = rect.right + SIDEBAR_TASK_MENU_GAP;
    if (left + menuWidth > window.innerWidth - viewportPadding) {
      left = Math.max(
        viewportPadding,
        rect.left - menuWidth - SIDEBAR_TASK_MENU_GAP,
      );
    }

    let top = rect.top - 4;
    if (top + menuHeight > window.innerHeight - viewportPadding) {
      top = Math.max(
        viewportPadding,
        window.innerHeight - menuHeight - viewportPadding,
      );
    }
    top = Math.max(viewportPadding, top);

    setMenuPosition({ top, left });
  }, []);

  useLayoutEffect(() => {
    if (!menuOpenTaskId) {
      setMenuPosition(null);
      return;
    }

    updateMenuPosition(menuOpenTaskId);
    const handleReposition = () => updateMenuPosition(menuOpenTaskId);
    window.addEventListener("resize", handleReposition);
    window.addEventListener("scroll", handleReposition, true);
    return () => {
      window.removeEventListener("resize", handleReposition);
      window.removeEventListener("scroll", handleReposition, true);
    };
  }, [menuOpenTaskId, updateMenuPosition]);

  // Close menu when clicking outside the floating menu or its trigger.
  useEffect(() => {
    if (!menuOpenTaskId) return;

    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      const trigger = menuButtonRef.current.get(menuOpenTaskId);
      if (menuRef.current?.contains(target) || trigger?.contains(target))
        return;
      setMenuOpenTaskId(null);
      setMenuPosition(null);
    };

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [menuOpenTaskId]);

  // Focus rename input when entering rename mode
  useEffect(() => {
    if (renameTaskId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renameTaskId]);

  const handleMenuToggle = (e: React.MouseEvent, taskId: string) => {
    e.stopPropagation();
    const nextOpen = menuOpenTaskId === taskId ? null : taskId;
    if (nextOpen) {
      updateMenuPosition(nextOpen);
    } else {
      setMenuPosition(null);
    }
    setMenuOpenTaskId(nextOpen);
  };

  const handleTaskContextMenu = (e: React.MouseEvent, taskId: string) => {
    e.preventDefault();
    e.stopPropagation();
    updateMenuPosition(taskId);
    setMenuOpenTaskId(taskId);
  };

  const focusMenuButton = (taskId: string) => {
    const button = menuButtonRef.current.get(taskId);
    if (button) {
      button.focus();
    }
  };

  const focusFirstMenuItem = () => {
    const menu = menuRef.current;
    const first = menu?.querySelector<HTMLButtonElement>(
      "button[data-menu-option]",
    );
    first?.focus();
  };

  const focusMenuItem = (offset: 1 | -1) => {
    const menu = menuRef.current;
    if (!menu) return;

    const options = Array.from(
      menu.querySelectorAll<HTMLButtonElement>("button[data-menu-option]"),
    );
    if (options.length === 0) return;

    const currentIndex = options.indexOf(
      document.activeElement as HTMLButtonElement,
    );
    const nextIndex = (currentIndex + offset + options.length) % options.length;
    const next = options[nextIndex];
    next?.focus();
  };

  const closeMenu = (taskId: string) => {
    setMenuOpenTaskId(null);
    setMenuPosition(null);
    focusMenuButton(taskId);
  };

  const handleMenuButtonKeyDown = (e: React.KeyboardEvent, taskId: string) => {
    if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
      e.preventDefault();
      const nextOpen = menuOpenTaskId === taskId ? null : taskId;
      if (nextOpen) {
        updateMenuPosition(nextOpen);
      } else {
        setMenuPosition(null);
      }
      setMenuOpenTaskId(nextOpen);
      if (nextOpen) {
        requestAnimationFrame(() => focusFirstMenuItem());
      }
      return;
    }

    if (e.key === "Escape") {
      closeMenu(taskId);
    }
  };

  const handleMenuItemKeyDown = (e: React.KeyboardEvent, taskId: string) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      focusMenuItem(1);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      focusMenuItem(-1);
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      closeMenu(taskId);
      return;
    }
  };

  const handleRenameClick = (e: React.MouseEvent, task: Task) => {
    e.stopPropagation();
    e.preventDefault();
    setMenuOpenTaskId(null);
    setMenuPosition(null);
    setRenameTaskId(task.id);
    setRenameValue(task.title);
  };

  const handleRenameSubmit = async (taskId: string) => {
    if (renameValue.trim()) {
      await window.electronAPI.renameTask(taskId, renameValue.trim());
      onTasksChanged();
    }
    setRenameTaskId(null);
    setRenameValue("");
  };

  const handlePinClick = async (e: React.MouseEvent, task: Task) => {
    e.stopPropagation();
    e.preventDefault();
    setMenuOpenTaskId(null);
    setMenuPosition(null);
    setPinActionError(null);
    try {
      await window.electronAPI.toggleTaskPin(task.id);
      onTasksChanged();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to update pin state. Please try again.";
      console.error("Failed to toggle pin:", error);
      setPinActionError(message);
      if (pinActionErrorTimeoutRef.current !== null) {
        window.clearTimeout(pinActionErrorTimeoutRef.current);
      }
      pinActionErrorTimeoutRef.current = window.setTimeout(() => {
        setPinActionError(null);
      }, 2500);
    }
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent, taskId: string) => {
    if (e.key === "Enter") {
      handleRenameSubmit(taskId);
    } else if (e.key === "Escape") {
      setRenameTaskId(null);
      setRenameValue("");
    }
  };

  const handleArchiveClick = async (e: React.MouseEvent, taskId: string) => {
    e.stopPropagation();
    e.preventDefault();
    setMenuOpenTaskId(null);
    setMenuPosition(null);
    setArchiveActionError(null);
    try {
      await window.electronAPI.archiveTask(taskId);
      if (selectedTaskId === taskId) {
        onSelectTask(null);
      }
      onTasksChanged();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : translate(
              "generated.components.sidebar.1395.0",
              "Unable to move to recently deleted, please try again.",
            );
      console.error("Failed to archive task:", error);
      setArchiveActionError(message);
      if (pinActionErrorTimeoutRef.current !== null) {
        window.clearTimeout(pinActionErrorTimeoutRef.current);
      }
      pinActionErrorTimeoutRef.current = window.setTimeout(() => {
        setArchiveActionError(null);
      }, 2500);
    }
  };

  const toggleCollapse = (e: React.MouseEvent, taskId: string) => {
    e.stopPropagation();
    setCollapsedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  };

  const getSubagentIcon = (task: Task) => {
    if (!task.parentTaskId) return null;
    const role = task.assignedAgentRoleId
      ? agentRoles.get(task.assignedAgentRoleId)
      : undefined;
    if (role?.icon) {
      const Icon = resolveTwinIcon(role.icon);
      return (
        <span
          className="cli-subagent-icon-shell"
          title={getLocalizedAgentRoleName(role.displayName)}
          style={
            {
              "--subagent-accent": role.color || "var(--color-accent)",
            } as React.CSSProperties
          }
        >
          <Icon className="cli-subagent-icon" size={13} strokeWidth={1.8} />
        </span>
      );
    }
    if (task.agentType === "parallel") {
      return (
        <span
          className="cli-subagent-icon-shell"
          title={translate("sidebar.parallelAgent", "Parallel agent")}
        >
          <Workflow
            className="cli-subagent-icon cli-subagent-icon-parallel"
            size={13}
            strokeWidth={1.8}
          />
        </span>
      );
    }
    return (
      <span
        className="cli-subagent-icon-shell"
        title={translate("sidebar.subagent", "Collaborating agent")}
      >
        <UsersRound className="cli-subagent-icon" size={13} strokeWidth={1.8} />
      </span>
    );
  };

  const getSubagentState = (status: Task["status"]) => {
    if (isActiveSessionStatus(status)) {
      return {
        key: "working",
        label: translate("sidebar.subagent.working", "Working"),
      };
    }
    if (isAwaitingSessionStatus(status)) {
      return {
        key: "waiting",
        label: translate("sidebar.subagent.waiting", "Waiting for review"),
      };
    }
    if (status === "completed") {
      return {
        key: "done",
        label: translate("sidebar.subagent.completed", "Completed"),
      };
    }
    if (status === "failed" || status === "cancelled") {
      return {
        key: "failed",
        label: translate("sidebar.subagent.stopped", "Needs attention"),
      };
    }
    return {
      key: "idle",
      label: translate("sidebar.subagent.ready", "Ready"),
    };
  };

  const handleNewTask = () => {
    if (onNewSession) {
      onNewSession();
      return;
    }
    // Fallback: deselect current task to show the welcome/new task screen
    onSelectTask(null);
  };

  const navigateDevicesSection = useCallback(
    (
      section: "overview" | "tasks" | "devices" | "apps" | "storage" | "alerts",
    ) => {
      window.dispatchEvent(
        new CustomEvent("devices:navigate", { detail: { section } }),
      );
    },
    [],
  );

  const triggerDevicesAction = useCallback((action: "pairing") => {
    window.dispatchEvent(
      new CustomEvent("devices:action", { detail: { action } }),
    );
  }, []);

  const remoteTasks = useMemo(
    () => tasks.filter((task) => !!task.targetNodeId),
    [tasks],
  );

  const remoteDeviceIds = useMemo(() => {
    const ids = new Set<string>();
    for (const task of remoteTasks) {
      if (task.targetNodeId) ids.add(task.targetNodeId);
    }
    return ids;
  }, [remoteTasks]);

  const remoteAttentionCount = useMemo(
    () =>
      remoteTasks.filter(
        (task) =>
          task.status === "blocked" ||
          task.status === "failed" ||
          task.terminalStatus === "awaiting_approval" ||
          task.terminalStatus === "needs_user_action",
      ).length,
    [remoteTasks],
  );

  // Render a task node and its children recursively
  const renderTaskRow = (
    node: TaskTreeNode,
    rootIndex: number,
    depth: number = 0,
    isLast: boolean = true,
  ): React.ReactNode => {
    const { task, children } = node;
    const hasChildren = children.length > 0;
    const isCollapsed = !hasSessionSearch && collapsedTasks.has(task.id);
    const isSubAgent = !!task.parentTaskId;

    // Tree connector prefix based on depth
    const treePrefix = depth > 0 ? (isLast ? "└─" : "├─") : "";
    const taskMode = depth === 0 ? getSessionMode(task) : null;
    const modeClass =
      taskMode && taskMode !== "standard" ? `session-mode-${taskMode}` : "";
    const showCompletionMarker = task.status === "completed";
    const showCompletionAttention =
      showCompletionMarker &&
      selectedTaskId !== task.id &&
      completionAttentionSet.has(task.id);
    const attentionState = deriveTaskAttentionState(task);
    const attentionCount = getTaskAttentionCount(attentionState);
    const isAwaitingSession =
      attentionState === "waiting" ||
      attentionState === "needs_approval" ||
      attentionState === "needs_attention";
    const isAutomatedTask = isAutomatedSession(task);
    const sessionTitle = getSidebarSessionTitle(node);
    const subagentState = getSubagentState(task.status);
    const sessionActions = !node.synthetic ? (
      <div className="task-item-actions cli-task-actions">
        <button
          type="button"
          className="task-item-more cli-more-btn"
          aria-haspopup="menu"
          aria-expanded={menuOpenTaskId === task.id}
          aria-controls={`task-menu-${task.id}`}
          aria-label={translate(
            "sidebar.sessionActionsFor",
            "Session actions for {title}",
            {
              title: sessionTitle,
            },
          )}
          onClick={(e) => handleMenuToggle(e, task.id)}
          onKeyDown={(e) => handleMenuButtonKeyDown(e, task.id)}
          ref={(el) => {
            if (el) {
              menuButtonRef.current.set(task.id, el);
            } else {
              menuButtonRef.current.delete(task.id);
            }
          }}
        >
          <EllipsisVertical size={16} strokeWidth={2.2} aria-hidden="true" />
        </button>
        {menuOpenTaskId === task.id &&
          menuPosition &&
          createPortal(
            <div
              id={`task-menu-${task.id}`}
              className="task-item-menu task-item-menu-floating cli-task-menu"
              role="menu"
              aria-label={translate(
                "sidebar.sessionActions",
                "Session actions",
              )}
              ref={menuRef}
              style={{
                position: "fixed",
                top: menuPosition.top,
                left: menuPosition.left,
                right: "auto",
              }}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                className="task-item-menu-option cli-menu-option"
                role="menuitem"
                data-menu-option="rename"
                onMouseDown={(e) => {
                  if (e.button === 0) {
                    e.preventDefault();
                    handleRenameClick(e as unknown as React.MouseEvent, task);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleRenameClick(e as unknown as React.MouseEvent, task);
                  }
                  handleMenuItemKeyDown(e, task.id);
                }}
              >
                <Pencil size={15} strokeWidth={1.9} aria-hidden="true" />
                <span>{translate("sidebar.sessions.rename", "Rename")}</span>
              </button>
              <button
                type="button"
                className="task-item-menu-option cli-menu-option"
                role="menuitem"
                data-menu-option="pin"
                onMouseDown={(e) => {
                  if (e.button === 0) {
                    e.preventDefault();
                    handlePinClick(e as unknown as React.MouseEvent, task);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handlePinClick(e as unknown as React.MouseEvent, task);
                  }
                  handleMenuItemKeyDown(e, task.id);
                }}
              >
                {task.pinned ? (
                  <PinOff size={15} strokeWidth={1.9} aria-hidden="true" />
                ) : (
                  <Pin size={15} strokeWidth={1.9} aria-hidden="true" />
                )}
                <span>
                  {task.pinned
                    ? translate("sidebar.sessions.unpin", "Unpin")
                    : translate("sidebar.sessions.pin", "Pin")}
                </span>
              </button>
              <button
                type="button"
                className="task-item-menu-option task-item-menu-option-danger cli-menu-option cli-menu-danger"
                role="menuitem"
                data-menu-option="archive"
                onMouseDown={(e) => {
                  if (e.button === 0) {
                    e.preventDefault();
                    handleArchiveClick(
                      e as unknown as React.MouseEvent,
                      task.id,
                    );
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleArchiveClick(
                      e as unknown as React.MouseEvent,
                      task.id,
                    );
                  }
                  handleMenuItemKeyDown(e, task.id);
                }}
              >
                <Trash2 size={15} strokeWidth={1.9} aria-hidden="true" />
                <span>
                  {translate(
                    "sidebar.sessions.archive",
                    "Delete",
                  )}
                </span>
              </button>
            </div>,
            document.body,
          )}
      </div>
    ) : null;

    return (
      <div
        className={`task-item cli-task-item ${selectedTaskId === task.id ? "task-item-selected" : ""} ${isSubAgent ? `task-item-subagent subagent-state-${subagentState.key}` : ""} ${node.synthetic ? "task-item-group-root" : ""} ${modeClass} ${hasChildren ? "task-item-has-children" : ""} ${showCompletionAttention ? "task-completion-unread" : ""}`}
        data-task-id={node.synthetic ? undefined : task.id}
        onClick={() => {
          if (node.synthetic) return;
          if (renameTaskId === task.id) return;
          onSelectTask(task.id);
        }}
        onContextMenu={(e) => {
          if (node.synthetic) return;
          handleTaskContextMenu(e, task.id);
        }}
        style={
          {
            "--cli-task-padding-left":
              depth === 0 ? "12px" : `${4 + depth * 12}px`,
          } as React.CSSProperties
        }
        title={
          taskMode && taskMode !== "standard"
            ? SESSION_MODE_META[taskMode].label
            : undefined
        }
      >
        {/* Tree connector for sub-agents */}
        {depth > 0 && <span className="cli-tree-prefix">{treePrefix}</span>}

        <span className="cli-task-num">
          {depth === 0 ? String(rootIndex + 1).padStart(2, "0") : "··"}
        </span>

        <SidebarTaskSignals
          taskId={task.id}
          attentionState={attentionState}
          attentionCount={attentionCount}
          provenance={task.provenanceSummary}
          onOpenSource={(taskId) => {
            onSelectTask(taskId);
            window.setTimeout(() => {
              window.dispatchEvent(
                new CustomEvent("task-source:focus", { detail: { taskId } }),
              );
            }, 0);
          }}
        />

        {task.pinned && (
          <span
            className="cli-task-pinned"
            title={translate("sidebar.pinned", "Pinned")}
          >
            <Pin size={11} strokeWidth={2} aria-hidden="true" />
          </span>
        )}

        {/* Lucide icon for sub-agents */}
        {getSubagentIcon(task)}

        {/* Git branch indicator for worktree-isolated tasks */}
        {task.worktreeBranch && (
          <span
            className="cli-task-branch"
            title={task.worktreeBranch}
            style={{
              display: "inline-flex",
              alignItems: "center",
              marginRight: "4px",
              color: "var(--color-accent)",
              opacity: 0.7,
              flexShrink: 0,
            }}
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <line x1="6" y1="3" x2="6" y2="15" />
              <circle cx="18" cy="6" r="3" />
              <circle cx="6" cy="18" r="3" />
              <path d="M18 9a9 9 0 0 1-9 9" />
            </svg>
          </span>
        )}

        <div className="task-item-content cli-task-content">
          {renameTaskId === task.id ? (
            <input
              ref={renameInputRef}
              type="text"
              className="task-item-rename-input cli-rename-input"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => handleRenameKeyDown(e, task.id)}
              onBlur={() => handleRenameSubmit(task.id)}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <div
              className={`cli-task-title-row ${isAwaitingSession ? "cli-task-title-row-awaiting" : ""}`}
            >
              {isSubAgent && task.assignedAgentRoleId ? (
                <span
                  className="cli-task-title cli-task-title-with-agent cli-task-title-subagent-role"
                  title={`${sessionTitle} - ${subagentState.label}`}
                >
                  {(() => {
                    const role = agentRoles.get(task.assignedAgentRoleId!);
                    const label = role
                      ? getLocalizedAgentRoleName(
                          stripAllEmojis(role.displayName),
                        )
                      : getLocalizedSidebarSystemTitle(
                          stripAllEmojis(sessionTitle),
                        );
                    return <span className="cli-task-agent-name">{label}</span>;
                  })()}
                </span>
              ) : (
                <SidebarWordBoundaryTitle
                  text={getLocalizedSidebarSystemTitle(sessionTitle)}
                  className="cli-task-title"
                  title={getLocalizedSidebarSystemTitle(sessionTitle)}
                />
              )}
              {hasChildren && !hasSessionSearch && (
                <button
                  type="button"
                  className="cli-collapse-btn cli-collapse-btn-inline"
                  onClick={(e) => toggleCollapse(e, task.id)}
                  aria-expanded={!isCollapsed}
                  aria-label={
                    isCollapsed
                      ? translate("common.expand", "Expand")
                      : translate("common.collapse", "Collapse")
                  }
                  title={
                    isCollapsed
                      ? translate("common.expand", "Expand")
                      : translate("common.collapse", "Collapse")
                  }
                >
                  {isCollapsed ? (
                    <ChevronRight
                      size={14}
                      strokeWidth={2}
                      aria-hidden="true"
                    />
                  ) : (
                    <ChevronDown size={14} strokeWidth={2} aria-hidden="true" />
                  )}
                </button>
              )}
              {!isAwaitingSession && (
                <span className="cli-task-time-wrap">
                  {showCompletionMarker && (
                    <span
                      className="task-completion-dot"
                      title={
                        showCompletionAttention
                          ? translate(
                              "sidebar.sessions.completedWithNewResultHint",
                              "Completed · There are new completion results, marked as viewed after opening",
                            )
                          : translate("sidebar.sessions.completed", "Completed")
                      }
                      aria-label={
                        showCompletionAttention
                          ? translate(
                              "sidebar.sessions.newResult",
                              "new results",
                            )
                          : translate("sidebar.sessions.completed", "Completed")
                      }
                    />
                  )}
                  <span
                    className="cli-task-automation-slot"
                    aria-hidden={!isAutomatedTask}
                  >
                    {isAutomatedTask && (
                      <span
                        className="cli-task-automation-icon"
                        title={translate(
                          "sidebar.sessions.automated",
                          "Automated task",
                        )}
                        aria-label={translate(
                          "sidebar.sessions.automated",
                          "Automated task",
                        )}
                      >
                        <Repeat2 size={13} strokeWidth={2} />
                      </span>
                    )}
                  </span>
                  <span className="cli-task-time" aria-hidden="true">
                    {formatRelativeShort(task.updatedAt || task.createdAt)}
                  </span>
                  {sessionActions ?? (
                    <span
                      className="cli-task-actions cli-task-actions-placeholder"
                      aria-hidden="true"
                    />
                  )}
                </span>
              )}
              {isAwaitingSession && sessionActions && (
                <span className="cli-task-action-wrap">{sessionActions}</span>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderTaskNode = (
    node: TaskTreeNode,
    index: number,
    depth: number = 0,
    isLast: boolean = true,
  ): React.ReactNode => {
    const { task, children } = node;
    const isCollapsed = !hasSessionSearch && collapsedTasks.has(task.id);
    const hasChildren = children.length > 0;
    const isSubagentRoster =
      hasChildren &&
      children.every((child) => Boolean(child.task.parentTaskId));

    return (
      <div
        key={task.id}
        className={`task-tree-node ${menuOpenTaskId === task.id ? "task-item-menu-open" : ""}`}
      >
        {renderTaskRow(node, index, depth, isLast)}

        {/* Render children if not collapsed */}
        {hasChildren && !isCollapsed && (
          <div
            className={`task-tree-children${isSubagentRoster ? " task-tree-subagent-roster" : ""}`}
          >
            {children.map((child, childIndex) =>
              renderTaskNode(
                child,
                childIndex,
                depth + 1,
                childIndex === children.length - 1,
              ),
            )}
          </div>
        )}
      </div>
    );
  };

  const renderSidebarVirtualRow = (row: SidebarVirtualRow): React.ReactNode => {
    if (row.kind === "date-header") {
      return (
        <div className="sidebar-date-group">
          {translateSidebarDateGroup(row.label)}
        </div>
      );
    }
    if (row.kind === "load-more") {
      return (
        <button
          type="button"
          className={`task-list-load-more ${row.loading ? "loading" : "idle"}`}
          onClick={row.loading ? undefined : onLoadMoreTasks}
          disabled={row.loading || !onLoadMoreTasks}
          aria-busy={row.loading}
        >
          <span className="terminal-only">
            {row.loading ? "loading more..." : "load more sessions"}
          </span>
          <span className="modern-only">
            {row.loading
              ? translate(
                  "sidebar.sessions.loadingMore",
                  "Loading more sessions...",
                )
              : translate("sidebar.sessions.loadMore", "Load more sessions")}
          </span>
        </button>
      );
    }

    return (
      <div
        className={`task-tree-node ${row.row.depth > 0 ? "task-tree-node-child" : ""} ${row.section === "automated" ? "task-tree-node-automated" : ""} ${menuOpenTaskId === row.row.node.task.id ? "task-item-menu-open" : ""}`}
      >
        {renderTaskRow(
          row.row.node,
          row.row.rootIndex,
          row.row.depth,
          row.row.isLast,
        )}
      </div>
    );
  };

  return (
    <div className="sidebar cli-sidebar">
      {updateInfo?.available && !updateDismissed && (
        <div className="sidebar-update-slot">
          <button
            type="button"
            className="update-banner"
            aria-label={translate(
              "sidebar.update.openSettings",
              "Open update settings",
            )}
            onMouseDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onClick={(event) => {
              event.stopPropagation();
              onViewUpdate?.();
            }}
          >
            {translate("sidebar.update", "Update")}
          </button>
          <button
            type="button"
            className="update-banner-dismiss"
            aria-label={translate(
              "sidebar.update.dismiss",
              "Dismiss update banner",
            )}
            onClick={(event) => {
              event.stopPropagation();
              setUpdateDismissed(true);
            }}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M9 3L3 9M3 3L9 9"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      )}

      <div className="sidebar-brand-row">
        <div
          className="sidebar-brand-identity"
          aria-label={`NeoWorker ${PRODUCT_DISPLAY_VERSION}`}
        >
          <span className="sidebar-brand-name">NeoWorker</span>
          <span className="sidebar-brand-version">
            {PRODUCT_DISPLAY_VERSION}
          </span>
        </div>
      </div>

      {/* New Session Button */}
      <div className="sidebar-header">
        <div className="cli-header-actions sidebar-nav">
          <div className="sidebar-top-actions-row">
            <button
              className="new-task-btn cli-new-task-btn cli-action-btn sidebar-new-session-btn"
              onClick={handleNewTask}
            >
              <span className="terminal-only">
                <span className="cli-btn-bracket">[</span>
                <span className="cli-btn-plus">+</span>
                <span className="cli-btn-bracket">]</span>
              </span>
              <span className="cli-btn-text">
                <span className="terminal-only">new_session</span>
                <span className="modern-only cli-new-task-modern-label">
                  <span
                    className="sidebar-home-btn-icon sidebar-new-session-icon"
                    aria-hidden="true"
                  >
                    <Plus
                      size={16}
                      strokeWidth={2}
                      style={{ display: "block" }}
                    />
                  </span>
                  <span>{translate("sidebar.newWork", "New job")}</span>
                </span>
              </span>
            </button>
          </div>

          <div
            className="sidebar-nav-group"
            role="group"
            aria-label={translate("sidebar.group.work", "Work")}
          >
            <button
              type="button"
              className={`new-task-btn cli-new-task-btn cli-action-btn sidebar-home-btn sidebar-nav-item ${isEverydayAgentActive ? "active" : ""}`}
              onClick={onOpenEverydayAgent}
              aria-pressed={isEverydayAgentActive}
              title={translate("sidebar.proactiveAgent", "Daily assistant")}
            >
              <span className="cli-btn-text">
                <span className="terminal-only">everyday_agent</span>
                <span className="modern-only cli-new-task-modern-label">
                  <span
                    className="sidebar-home-btn-icon"
                    aria-hidden="true"
                    style={{ display: "flex" }}
                  >
                    <Sparkles
                      size={16}
                      strokeWidth={2}
                      style={{ display: "block" }}
                    />
                  </span>
                  <span>
                    {translate("sidebar.proactive", "Daily assistant")}
                  </span>
                </span>
              </span>
            </button>

            <button
              type="button"
              className={`new-task-btn cli-new-task-btn cli-action-btn sidebar-home-btn sidebar-nav-item ${isAgentTeamActive ? "active" : ""}`}
              onClick={onOpenAgentTeam}
              aria-pressed={isAgentTeamActive}
              title={translate("sidebar.agentTeam", "Agent team")}
            >
              <span className="cli-btn-text">
                <span className="terminal-only">agent_team</span>
                <span className="modern-only cli-new-task-modern-label">
                  <span
                    className="sidebar-home-btn-icon"
                    aria-hidden="true"
                    style={{ display: "flex" }}
                  >
                    <UsersRound
                      size={16}
                      strokeWidth={2}
                      style={{ display: "block" }}
                    />
                  </span>
                  <span>{translate("sidebar.agentTeam", "Agent team")}</span>
                </span>
              </span>
            </button>

            <button
              type="button"
              className={`new-task-btn cli-new-task-btn cli-action-btn sidebar-home-btn sidebar-nav-item ${isIdeasActive ? "active" : ""}`}
              onClick={onOpenIdeas}
              aria-pressed={isIdeasActive}
              title={translate("sidebar.ideas", "Inspiration")}
            >
              <span className="cli-btn-text">
                <span className="terminal-only">ideas</span>
                <span className="modern-only cli-new-task-modern-label">
                  <span
                    className="sidebar-home-btn-icon"
                    aria-hidden="true"
                    style={{ display: "flex" }}
                  >
                    <Lightbulb
                      size={16}
                      strokeWidth={2}
                      style={{ display: "block" }}
                    />
                  </span>
                  <span>{translate("sidebar.ideas", "Inspiration")}</span>
                </span>
              </span>
            </button>

            <button
              type="button"
              className={`new-task-btn cli-new-task-btn cli-action-btn sidebar-home-btn sidebar-nav-item ${isAutomationsActive ? "active" : ""}`}
              onClick={onOpenAutomations}
              aria-pressed={isAutomationsActive}
              title={translate("sidebar.automations", "Automation")}
            >
              <span className="cli-btn-text">
                <span className="terminal-only">automations</span>
                <span className="modern-only cli-new-task-modern-label">
                  <span
                    className="sidebar-home-btn-icon"
                    aria-hidden="true"
                    style={{ display: "flex" }}
                  >
                    <Clock3
                      size={16}
                      strokeWidth={2}
                      style={{ display: "block" }}
                    />
                  </span>
                  <span>{translate("sidebar.automations", "Automation")}</span>
                </span>
              </span>
            </button>

            <button
              type="button"
              className={`new-task-btn cli-new-task-btn cli-action-btn sidebar-home-btn sidebar-nav-item ${isToolsAndSkillsActive ? "active" : ""}`}
              onClick={onOpenToolsAndSkills}
              aria-pressed={isToolsAndSkillsActive}
              title={translate("sidebar.toolsAndSkills", "Tools and Skills")}
            >
              <span className="cli-btn-text">
                <span className="terminal-only">tools_and_skills</span>
                <span className="modern-only cli-new-task-modern-label">
                  <span
                    className="sidebar-home-btn-icon"
                    aria-hidden="true"
                    style={{ display: "flex" }}
                  >
                    <Wrench
                      size={16}
                      strokeWidth={2}
                      style={{ display: "block" }}
                    />
                  </span>
                  <span>
                    {translate("sidebar.toolsAndSkills", "Tools and Skills")}
                  </span>
                </span>
              </span>
            </button>
          </div>
        </div>
      </div>

      {isDevicesActive ? (
        <div className="devices-sidebar-panel">
          <div className="devices-sidebar-header">
            <div className="devices-sidebar-home">
              <button
                type="button"
                className="devices-sidebar-home-btn active"
                onClick={() => navigateDevicesSection("overview")}
              >
                <span className="devices-sidebar-home-icon">
                  <Server size={14} />
                </span>
                <span>
                  {translate("devices.sidebar.fleetHome", "Fleet Home")}
                </span>
                {remoteDeviceIds.size > 0 ? (
                  <span className="devices-sidebar-home-count">
                    {remoteDeviceIds.size}
                  </span>
                ) : null}
              </button>
            </div>
            <div className="devices-sidebar-grid">
              <button
                type="button"
                className="devices-sidebar-link"
                onClick={() => triggerDevicesAction("pairing")}
              >
                <Server size={14} />
                <span>
                  {translate("devices.sidebar.pairRemote", "Pair remote")}
                </span>
                <strong>+</strong>
              </button>
              <button
                type="button"
                className="devices-sidebar-link"
                onClick={() => navigateDevicesSection("alerts")}
              >
                <Bell size={14} />
                <span>
                  {translate(
                    "devices.sidebar.attentionQueue",
                    "Attention queue",
                  )}
                </span>
                <strong>{remoteAttentionCount}</strong>
              </button>
              <button
                type="button"
                className="devices-sidebar-link"
                onClick={() => navigateDevicesSection("apps")}
              >
                <AppWindow size={14} />
                <span>
                  {translate("devices.sidebar.setupInbox", "Setup inbox")}
                </span>
              </button>
              <button
                type="button"
                className="devices-sidebar-link"
                onClick={() => navigateDevicesSection("storage")}
              >
                <HardDrive size={14} />
                <span>
                  {translate(
                    "devices.sidebar.isolationCheck",
                    "Isolation check",
                  )}
                </span>
              </button>
            </div>
          </div>

          <div className="devices-sidebar-subhead">
            <span>{translate("devices.sidebar.observer", "Observer")}</span>
            <button
              type="button"
              className="devices-sidebar-sort"
              onClick={() => navigateDevicesSection("alerts")}
            >
              {translate("devices.sidebar.attention", "Attention")}{" "}
              {remoteAttentionCount > 0 ? `(${remoteAttentionCount})` : ""}
            </button>
          </div>

          <div className="devices-sidebar-list">
            <button
              type="button"
              className="devices-sidebar-item featured"
              onClick={() => navigateDevicesSection("tasks")}
            >
              <div className="devices-sidebar-item-top">
                <Rows3 size={14} />
                <span className="devices-sidebar-item-label">
                  {translate("devices.sidebar.executionLane", "Execution lane")}
                </span>
                <span className="devices-sidebar-item-dot" />
              </div>
              <strong>
                {remoteTasks.length > 0
                  ? translate(
                      "devices.sidebar.remoteRunsInView",
                      "{count} remote runs in view",
                    ).replace("{count}", String(remoteTasks.length))
                  : translate(
                      "devices.sidebar.noRemoteRuns",
                      "No remote runs yet",
                    )}
              </strong>
              <span>
                {translate(
                  "devices.sidebar.executionLaneHint",
                  "Use this page to launch and supervise work happening on paired remotes.",
                )}
              </span>
            </button>
            <button
              type="button"
              className="devices-sidebar-item"
              onClick={() => triggerDevicesAction("pairing")}
            >
              <div className="devices-sidebar-item-top">
                <Server size={14} />
                <span>
                  {translate("devices.sidebar.fleetShape", "Fleet shape")}
                </span>
              </div>
              <strong>
                {remoteDeviceIds.size > 0
                  ? translate(
                      "devices.sidebar.remotesPaired",
                      "{count} remotes paired or active",
                    ).replace("{count}", String(remoteDeviceIds.size))
                  : translate(
                      "devices.sidebar.startFirstRemote",
                      "Start with your first remote",
                    )}
              </strong>
              <span>
                {translate(
                  "devices.sidebar.fleetShapeHint",
                  "Separate work, personal, archive, or automation machines without mixing disks.",
                )}
              </span>
            </button>
            <button
              type="button"
              className="devices-sidebar-item"
              onClick={() => navigateDevicesSection("alerts")}
            >
              <div className="devices-sidebar-item-top">
                <Bell size={14} />
                <span>
                  {translate("devices.sidebar.observerFeed", "Observer feed")}
                </span>
              </div>
              <strong>
                {remoteAttentionCount > 0
                  ? translate(
                      "devices.sidebar.issuesWaiting",
                      "{count} issues waiting",
                    ).replace("{count}", String(remoteAttentionCount))
                  : translate(
                      "devices.sidebar.observerQuiet",
                      "Observer is quiet",
                    )}
              </strong>
              <span>
                {translate(
                  "devices.sidebar.observerFeedHint",
                  "Approvals, failed app connections, and offline remotes surface here.",
                )}
              </span>
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Sessions List Header */}
          <div className="sidebar-header-sessions">
            <div className="new-task-btn cli-new-task-btn cli-action-btn cli-sessions-header">
              <button
                type="button"
                className="cli-list-header-toggle"
                onClick={() => setSessionsCollapsed((value) => !value)}
                aria-expanded={!sessionsCollapsed}
                title={
                  sessionsCollapsed
                    ? translate("sidebar.sessions.expand", "Expand sessions")
                    : translate(
                        "sidebar.sessions.collapse",
                        "Collapse sessions",
                      )
                }
              >
                <span className="cli-section-prompt terminal-only">
                  {sessionsCollapsed ? "▸" : "▾"}
                </span>
                <span className="terminal-only">
                  {translate("sidebar.sessions.terminalTitle", "SESSIONS")}
                </span>
                <span className="modern-only cli-new-task-modern-label">
                  <span
                    className="sidebar-home-btn-icon cli-sessions-icon"
                    aria-hidden="true"
                  >
                    <SlidersHorizontal
                      size={16}
                      strokeWidth={2}
                      style={{ display: "block" }}
                    />
                  </span>
                  <span className="cli-sessions-title">
                    {translate("sidebar.sessions", "Sessions")}
                  </span>
                  <span
                    className="cli-sessions-collapse-indicator"
                    aria-hidden="true"
                  >
                    {sessionsCollapsed ? (
                      <ChevronRight size={14} strokeWidth={2.5} />
                    ) : (
                      <ChevronDown size={14} strokeWidth={2.5} />
                    )}
                  </span>
                </span>
              </button>
              <div className="cli-list-header-actions">
                <button
                  type="button"
                  className={`sidebar-session-action ${showSessionSearch ? "active" : ""}`}
                  onClick={() => {
                    setSessionsCollapsed(false);
                    setShowSessionSearch((value) => {
                      if (value) setSessionSearch("");
                      return !value;
                    });
                  }}
                  aria-pressed={showSessionSearch}
                  title={
                    showSessionSearch
                      ? translate("sidebar.sessions.hideSearch", "Hide search")
                      : translate("sidebar.sessions.search", "Search sessions")
                  }
                  aria-label={
                    showSessionSearch
                      ? translate("sidebar.sessions.hideSearch", "Hide search")
                      : translate("sidebar.sessions.search", "Search sessions")
                  }
                >
                  <Search size={16} strokeWidth={2} />
                </button>
                <button
                  type="button"
                  className={`sidebar-session-action ${showSessionFilters ? "active" : ""}`}
                  onClick={() => {
                    setSessionsCollapsed(false);
                    setShowSessionFilters((value) => !value);
                  }}
                  aria-pressed={showSessionFilters}
                  title={
                    showSessionFilters
                      ? translate(
                          "sidebar.sessions.hideFilters",
                          "Hide filters",
                        )
                      : translate("sidebar.sessions.filter", "Filter sessions")
                  }
                >
                  <ListFilter size={16} strokeWidth={2} />
                </button>
              </div>
            </div>

            {(pinActionError || archiveActionError) && (
              <div
                className="cli-sidebar-error"
                role="alert"
                style={{
                  marginTop: "4px",
                  marginLeft: "4px",
                  marginRight: "4px",
                }}
              >
                {pinActionError || archiveActionError}
              </div>
            )}

            {!sessionsCollapsed && showSessionFilters && (
              <div className="sidebar-session-filter-panel">
                <button
                  type="button"
                  className={`sidebar-session-filter-option ${sessionCategory === "all" ? "active" : ""}`}
                  onClick={() => setSessionCategory("all")}
                  aria-pressed={sessionCategory === "all"}
                >
                  <span>
                    {translate(
                      "sidebar.sessions.conversations",
                      "Conversations",
                    )}
                  </span>
                  {userTaskTree.length > 0 && (
                    <span>{userTaskTree.length}</span>
                  )}
                </button>
                <button
                  type="button"
                  className={`sidebar-session-filter-option ${sessionCategory === "team" ? "active" : ""}`}
                  onClick={() => setSessionCategory("team")}
                  disabled={teamSessionCount === 0}
                  aria-pressed={sessionCategory === "team"}
                >
                  <span>{translate("sidebar.sessions.team", "Team")}</span>
                  {teamSessionCount > 0 && <span>{teamSessionCount}</span>}
                </button>
                <button
                  type="button"
                  className={`sidebar-session-filter-option ${sessionCategory === "automated" ? "active" : ""}`}
                  onClick={() => setSessionCategory("automated")}
                  disabled={automatedTaskTree.length === 0}
                  aria-pressed={sessionCategory === "automated"}
                >
                  <span>
                    {translate("sidebar.sessions.automated", "Automated")}
                  </span>
                  {automatedTaskTree.length > 0 && (
                    <span>{automatedTaskTree.length}</span>
                  )}
                </button>
              </div>
            )}

            {!sessionsCollapsed && showSessionSearch && (
              <label className="sidebar-sessions-search">
                <Search size={14} />
                <input
                  type="search"
                  aria-label={translate(
                    "sidebar.sessions.search",
                    "Search sessions",
                  )}
                  placeholder={translate("sidebar.sessions.search", "Search")}
                  value={sessionSearch}
                  onChange={(event) => setSessionSearch(event.target.value)}
                />
              </label>
            )}

            {showFilterBar && (
              <div className="session-filters-bar cli-session-filters">
                <div className="session-filters-scroll">
                  <button
                    type="button"
                    className={`session-filter-chip standard ${activeModeFilters.size === 0 ? "active" : ""}`}
                    onClick={() => setActiveModeFilters(new Set())}
                  >
                    {translate("sidebar.sessions.all", "All")}
                  </button>
                  {availableModes.map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      className={`session-filter-chip ${mode} ${activeModeFilters.has(mode) ? "active" : ""}`}
                      onClick={() => toggleModeFilter(mode)}
                    >
                      <span className="filter-chip-dot" />
                      {mode}
                    </button>
                  ))}
                </div>
                {activeModeFilters.size > 0 && (
                  <button
                    type="button"
                    className="session-filter-clear"
                    onClick={() => setActiveModeFilters(new Set())}
                    title={translate(
                      "sidebar.sessions.clearFilters",
                      "Clear filters",
                    )}
                  >
                    {translate("sidebar.sessions.clearFilters", "Clear")}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Sessions Scrollable List */}
          <div
            className={`task-list cli-task-list ${useVirtualizedTaskRows ? "task-list-virtualized" : ""}`}
            ref={taskListRef}
          >
            {!sessionsCollapsed && (
              <>
                {filteredTaskTree.length === 0 &&
                visibleAutomatedTaskTree.length === 0 ? (
                  isLoadingSessions &&
                  !hasSessionSearch &&
                  activeModeFilters.size === 0 ? (
                    <div
                      className="sidebar-session-skeleton"
                      aria-label={translate(
                        "sidebar.sessions.loading",
                        "Loading sessions",
                      )}
                    >
                      <span className="sidebar-session-skeleton-line" />
                      <span className="sidebar-session-skeleton-line" />
                      <span className="sidebar-session-skeleton-line" />
                    </div>
                  ) : hasSessionSearch ? (
                    <div
                      className={`sidebar-empty cli-empty ${uiDensity === "focused" ? "sidebar-empty-focused" : ""}`}
                    >
                      <div className="sidebar-empty-message sidebar-search-empty-message">
                        <Search size={32} style={{ opacity: 0.3 }} />
                        <p>
                          {translate(
                            "sidebar.sessions.noMatches",
                            "No matching sessions",
                          )}
                        </p>
                        <span>
                          {translate(
                            "sidebar.sessions.noMatchesHint",
                            "Try a different title, prompt, or session id",
                          )}
                        </span>
                      </div>
                    </div>
                  ) : activeModeFilters.size > 0 ? null : (
                    <div
                      className={`sidebar-empty cli-empty ${uiDensity === "focused" ? "sidebar-empty-focused" : ""}`}
                    >
                      <pre className="cli-tree terminal-only">{`├── (no sessions yet)
└── ...`}</pre>
                      {uiDensity === "focused" ? (
                        <div className="sidebar-empty-message">
                          <EyeOff size={32} style={{ opacity: 0.3 }} />
                          <p>
                            {translate(
                              "sidebar.sessions.emptyTitle",
                              "Your conversations will appear here",
                            )}
                          </p>
                          <span>
                            {translate(
                              "sidebar.sessions.emptyHint",
                              "Start a new session to get going",
                            )}
                          </span>
                        </div>
                      ) : (
                        <p className="cli-hint">
                          <span className="terminal-only">
                            # start a new session above
                          </span>
                          <span className="modern-only">
                            {translate(
                              "sidebar.sessions.emptyModern",
                              "Start a new session to begin",
                            )}
                          </span>
                        </p>
                      )}
                    </div>
                  )
                ) : useVirtualizedTaskRows ? (
                  <VirtualList
                    items={sidebarVirtualRows}
                    getItemKey={(row) => {
                      if (row.kind === "task")
                        return `${row.section ?? "user"}:${row.row.node.task.id}`;
                      return row.id;
                    }}
                    getItemHeight={(row) =>
                      row.kind === "date-header"
                        ? uiDensity === "focused"
                          ? SIDEBAR_FOCUSED_DATE_HEADER_HEIGHT
                          : SIDEBAR_DATE_HEADER_HEIGHT
                        : row.kind === "load-more"
                          ? SIDEBAR_LOAD_MORE_HEIGHT
                          : uiDensity === "focused"
                            ? SIDEBAR_FOCUSED_ITEM_HEIGHT
                            : SIDEBAR_ITEM_HEIGHT
                    }
                    renderItem={(row) => renderSidebarVirtualRow(row)}
                    estimatedItemHeight={
                      uiDensity === "focused"
                        ? SIDEBAR_FOCUSED_ITEM_HEIGHT
                        : SIDEBAR_ITEM_HEIGHT
                    }
                    overscan={10}
                    enabled
                    className="sidebar-virtual-list"
                    style={{ height: "100%" }}
                    role="list"
                    onScrollNearEnd={onLoadMoreTasks}
                    suppressAutoScrollOnItemsChange
                  />
                ) : (
                  sidebarVirtualRows.map((row) => (
                    <div
                      key={
                        row.kind === "task"
                          ? `${row.section ?? "user"}:${row.row.node.task.id}`
                          : row.id
                      }
                    >
                      {renderSidebarVirtualRow(row)}
                    </div>
                  ))
                )}
              </>
            )}
          </div>
        </>
      )}

      {/* Footer */}
      <div className="sidebar-footer cli-sidebar-footer">
        <div className="cli-footer-actions">
          <button
            className="settings-btn cli-settings-btn"
            onClick={onOpenSettings}
            title={translate("sidebar.settings", "Settings")}
          >
            <span className="terminal-only">[cfg]</span>
            <span className="modern-only">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              {translate("sidebar.settings", "Settings")}
            </span>
          </button>
          {onOpenSetupGuide && (
            <button
              className="settings-btn cli-settings-btn cli-onboarding-btn"
              onClick={onOpenSetupGuide}
              title={translate("sidebar.setupWizard.title", "Open setup guide")}
              aria-label={translate(
                "sidebar.setupWizard.aria",
                "Open setup guide",
              )}
            >
              <span className="terminal-only">[guide]</span>
              <span className="modern-only">
                <Sparkles size={15} strokeWidth={2} />
                {translate("sidebar.setupWizard", "Setup Guide")}
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export const Sidebar = memo(SidebarComponent, areSidebarPropsEqual);
