import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  CircleDotDashed,
  Clock3,
  Flag,
  History,
  Layers3,
  List,
  ListChecks,
  RotateCcw,
  ShieldCheck,
  Trash2,
  Users,
  Workflow,
} from "lucide-react";
import { BOARD_COLUMNS, TASK_PRIORITY_OPTIONS } from "./useMissionControlData";
import type { MissionControlData } from "./useMissionControlData";
import { MCSelectMenu } from "./MCSelectMenu";
import {
  formatExactTaskTimestamp,
  MCTaskCalendarView,
} from "./MCTaskCalendarView";
import { translate, useLanguage } from "../../i18n";
import type { ArchivedTaskRecord, Task } from "../../../shared/types";
import {
  getTaskBoardView,
  shouldShowTaskInRunCenter,
  type TaskBoardView,
} from "./task-board-view";
import { VirtualList } from "../VirtualList";
import { getLocalizedAgentRoleText } from "../../utils/localized-agent-roles";

interface MCBoardTabProps {
  data: MissionControlData;
  searchQuery?: string;
  onSearchQueryChange?: (value: string) => void;
  onTasksChanged?: () => void | Promise<void>;
  onOpenAutomations?: () => void;
  onOpenTask?: (taskId: string) => void | Promise<void>;
}

type BoardViewMode = TaskBoardView;
type BoardDisplayMode = "list" | "calendar";
type BoardContentMode = "list" | "calendar" | "empty";

export function getTaskBoardContentMode(
  displayMode: BoardDisplayMode,
  taskCount: number,
): BoardContentMode {
  if (displayMode === "calendar") return "calendar";
  return taskCount === 0 ? "empty" : "list";
}
type AttentionFilter = "all" | "approval" | "abnormal";
type PriorityFilter = "all" | number;
type DeleteRequest = {
  taskIds: string[];
  mode: "single" | "batch";
};

const TASK_DELETE_BLOCKED_STATUSES = new Set([
  "executing",
  "planning",
  "running",
]);
export const TASK_LIST_VIRTUALIZATION_THRESHOLD = 500;
const VIRTUAL_TASK_ROW_HEIGHT = 132;

export function shouldVirtualizeTaskList(taskCount: number): boolean {
  return taskCount >= TASK_LIST_VIRTUALIZATION_THRESHOLD;
}

function renderTaskRows(
  tasks: Task[],
  totalFilteredTaskCount: number,
  renderTask: (task: Task) => ReactNode,
): ReactNode {
  if (tasks.length === 0) return null;
  if (!shouldVirtualizeTaskList(totalFilteredTaskCount)) {
    return tasks.map(renderTask);
  }
  return (
    <VirtualList
      items={tasks}
      getItemKey={(task) => task.id}
      getItemHeight={() => VIRTUAL_TASK_ROW_HEIGHT}
      estimatedItemHeight={VIRTUAL_TASK_ROW_HEIGHT}
      overscan={6}
      className="mc-task-virtual-list"
      style={{
        height: Math.min(
          760,
          Math.max(
            VIRTUAL_TASK_ROW_HEIGHT,
            tasks.length * VIRTUAL_TASK_ROW_HEIGHT,
          ),
        ),
      }}
      renderItem={(task) => renderTask(task)}
    />
  );
}

export function isTaskDeletionBlocked(status: string): boolean {
  return TASK_DELETE_BLOCKED_STATUSES.has(status);
}

const PRIORITY_LABELS: Record<number, string> = {
  0: translate(
    "generated.components.mission.control.mcboardtab.104.0",
    "not set",
  ),
  1: translate("generated.components.mission.control.mcboardtab.105.1", "low"),
  2: translate("generated.components.mission.control.mcboardtab.106.2", "in"),
  3: translate("generated.components.mission.control.mcboardtab.107.3", "high"),
  4: translate(
    "generated.components.mission.control.mcboardtab.108.4",
    "urgent",
  ),
};

const VIEW_COPY: Record<
  BoardViewMode,
  { title: string; description: string; empty: string }
> = {
  active: {
    title: translate(
      "generated.components.mission.control.mcboardtab.116.5",
      "Running",
    ),
    description: translate(
      "generated.components.mission.control.mcboardtab.117.6",
      "Long tasks and automations appear here when they are running, queued, or paused.",
    ),
    empty: translate(
      "generated.components.mission.control.mcboardtab.118.7",
      "There are currently no long tasks or automations running.",
    ),
  },
  attention: {
    title: translate(
      "generated.components.mission.control.mcboardtab.121.8",
      "Need to be processed",
    ),
    description: translate(
      "generated.components.mission.control.mcboardtab.122.9",
      "Approval, blocking, failed and overdue tasks are concentrated here.",
    ),
    empty: translate(
      "generated.components.mission.control.mcboardtab.123.10",
      "There are currently no tasks for you to handle.",
    ),
  },
  history: {
    title: translate(
      "generated.components.mission.control.mcboardtab.126.11",
      "Running history",
    ),
    description: translate(
      "generated.components.mission.control.mcboardtab.127.12",
      "Only keep records of automated and clearly managed work done.",
    ),
    empty: translate(
      "generated.components.mission.control.mcboardtab.128.13",
      "There is no running history yet.",
    ),
  },
};

const COLUMN_LABEL_KEYS: Record<string, string> = {
  inbox: "missionControl.board.column.inbox",
  assigned: "missionControl.board.column.assigned",
  in_progress: "missionControl.board.column.inProgress",
  review: "missionControl.board.column.review",
  done: "missionControl.board.column.done",
};

const TASK_STATUS_LABELS: Record<string, string> = {
  pending: translate(
    "generated.components.mission.control.mcboardtab.141.14",
    "Pending",
  ),
  planning: translate(
    "generated.components.mission.control.mcboardtab.142.15",
    "Under planning",
  ),
  executing: translate(
    "generated.components.mission.control.mcboardtab.143.16",
    "Executing",
  ),
  completed: translate(
    "generated.components.mission.control.mcboardtab.144.17",
    "Completed",
  ),
  failed: translate(
    "generated.components.mission.control.mcboardtab.145.18",
    "failed",
  ),
  cancelled: translate(
    "generated.components.mission.control.mcboardtab.146.19",
    "Canceled",
  ),
  interrupted: translate(
    "generated.components.mission.control.mcboardtab.147.20",
    "Interrupted",
  ),
  blocked: translate(
    "generated.components.mission.control.mcboardtab.148.21",
    "blocked",
  ),
  paused: translate(
    "generated.components.mission.control.mcboardtab.149.22",
    "Suspended",
  ),
  queued: translate(
    "generated.components.mission.control.mcboardtab.150.23",
    "Queuing",
  ),
  running: translate(
    "generated.components.mission.control.mcboardtab.151.24",
    "Running",
  ),
  awaiting_approval: translate(
    "generated.components.mission.control.mcboardtab.152.25",
    "Waiting for approval",
  ),
  needs_user_action: translate(
    "generated.components.mission.control.mcboardtab.153.26",
    "Requires user action",
  ),
};

const ATTENTION_REASON_LABELS: Record<string, string> = {
  "Awaiting approval": translate(
    "generated.components.mission.control.mcboardtab.157.27",
    "Waiting for approval",
  ),
  "Waiting on you": translate(
    "generated.components.mission.control.mcboardtab.158.28",
    "waiting for you to process",
  ),
  Blocked: translate(
    "generated.components.mission.control.mcboardtab.159.29",
    "blocked",
  ),
  Paused: translate(
    "generated.components.mission.control.mcboardtab.160.30",
    "Suspended",
  ),
  "Run failed": translate(
    "generated.components.mission.control.mcboardtab.161.31",
    "Run failed",
  ),
  Interrupted: translate(
    "generated.components.mission.control.mcboardtab.162.32",
    "Interrupted",
  ),
  "Dependency unavailable": translate(
    "generated.components.mission.control.mcboardtab.163.33",
    "Dependency is not available",
  ),
  "Provider quota issue": translate(
    "generated.components.mission.control.mcboardtab.164.34",
    "Service provider quota issue",
  ),
  "Needs decision": translate(
    "generated.components.mission.control.mcboardtab.165.35",
    "need decision",
  ),
  "Needs owner": translate(
    "generated.components.mission.control.mcboardtab.166.36",
    "Need someone in charge",
  ),
  Overdue: translate(
    "generated.components.mission.control.mcboardtab.167.37",
    "Overdue",
  ),
  "Needs review": translate(
    "generated.components.mission.control.mcboardtab.168.38",
    "Need review",
  ),
  Stale: translate(
    "generated.components.mission.control.mcboardtab.169.39",
    "stalled",
  ),
};

function translateTaskStatus(status: string): string {
  return TASK_STATUS_LABELS[status] || status.replace(/_/g, " ");
}

function translateAttentionReason(reason: string): string {
  return ATTENTION_REASON_LABELS[reason] || reason;
}

function translateDueLabel(label: string): string {
  const overdueMatch = label.match(/^(\d+)([mhd]) overdue$/);
  if (overdueMatch) {
    const [, count, unit] = overdueMatch;
    const unitLabel =
      unit === "m"
        ? translate(
            "generated.components.mission.control.mcboardtab.184.40",
            "minutes",
          )
        : unit === "h"
          ? translate(
              "generated.components.mission.control.mcboardtab.184.41",
              "hours",
            )
          : translate(
              "generated.components.mission.control.mcboardtab.184.42",
              "day",
            );
    return translate(
      "missionControl.board.due.overdue",
      "{count}{unit}Expired",
      { count, unit: unitLabel },
    );
  }
  const dueInMatch = label.match(/^Due in (\d+)([mhd])$/);
  if (dueInMatch) {
    const [, count, unit] = dueInMatch;
    const unitLabel =
      unit === "m"
        ? translate(
            "generated.components.mission.control.mcboardtab.190.43",
            "minutes",
          )
        : unit === "h"
          ? translate(
              "generated.components.mission.control.mcboardtab.190.44",
              "hours",
            )
          : translate(
              "generated.components.mission.control.mcboardtab.190.45",
              "day",
            );
    return translate(
      "missionControl.board.due.in",
      "Expires after {count}{unit}",
      { count, unit: unitLabel },
    );
  }
  return label;
}

function translateEstimateLabel(label: string): string {
  const match = label.match(/^(\d+)([mhd])$/);
  if (!match) return label;
  const [, count, unit] = match;
  const unitLabel =
    unit === "m"
      ? translate(
          "generated.components.mission.control.mcboardtab.200.46",
          "minutes",
        )
      : unit === "h"
        ? translate(
            "generated.components.mission.control.mcboardtab.200.47",
            "hours",
          )
        : translate(
            "generated.components.mission.control.mcboardtab.200.48",
            "day",
          );
  return translate("missionControl.board.estimate", "{count}{unit}", {
    count,
    unit: unitLabel,
  });
}

function getDisplayTaskTitle(title: string): string {
  return title.replace(/^@[^:]+:\s*/, "");
}

function formatRestoreWindow(expiresAt: number, now = Date.now()): string {
  const remainingMs = Math.max(0, expiresAt - now);
  const remainingHours = Math.ceil(remainingMs / (60 * 60 * 1000));
  if (remainingHours <= 24)
    return translate(
      "missionControl.restore.withinHours",
      "Restorable within {count} hours",
      { count: Math.max(1, remainingHours) },
    );
  return translate(
    "missionControl.restore.withinDays",
    "Restorable within {count} days",
    { count: Math.ceil(remainingHours / 24) },
  );
}

export function MCBoardTab({
  data,
  searchQuery = "",
  onSearchQueryChange,
  onTasksChanged,
  onOpenAutomations,
  onOpenTask,
}: MCBoardTabProps) {
  const language = useLanguage();
  const t = translate;
  const {
    agents,
    tasks,
    workspaces,
    getAgent,
    detailPanel,
    setDetailPanel,
    handleMoveTask,
    dragOverColumn,
    setDragOverColumn,
    handleSetTaskPriority,
    formatRelativeTime,
    formatTaskEstimate,
    getTaskDueInfo,
    getMissionColumnForTask,
    getTaskLabels,
    getTaskAttentionReason,
    isTaskTerminal,
    isTaskStale,
    isTaskAttentionRequired,
    isAllWorkspacesSelected,
    getWorkspaceName,
  } = data;

  const [viewMode, setViewMode] = useState<BoardViewMode>("active");
  const [displayMode, setDisplayMode] = useState<BoardDisplayMode>("list");
  const [attentionFilter, setAttentionFilter] =
    useState<AttentionFilter>("all");
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("all");
  const [ownerFilter, setOwnerFilter] = useState("");
  const [workspaceFilter, setWorkspaceFilter] = useState("");
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [deleteRequest, setDeleteRequest] = useState<DeleteRequest | null>(
    null,
  );
  const [deletingTasks, setDeletingTasks] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [recentlyDeletedOpen, setRecentlyDeletedOpen] = useState(false);
  const [archivedTasks, setArchivedTasks] = useState<ArchivedTaskRecord[]>([]);
  const [loadingArchivedTasks, setLoadingArchivedTasks] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [restoringTaskIds, setRestoringTaskIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [permanentDeleteRequest, setPermanentDeleteRequest] =
    useState<ArchivedTaskRecord | null>(null);
  const [permanentlyDeleting, setPermanentlyDeleting] = useState(false);
  const [permanentDeleteError, setPermanentDeleteError] = useState<
    string | null
  >(null);
  const [archiveNoticeTaskIds, setArchiveNoticeTaskIds] = useState<string[]>(
    [],
  );

  const selectedTaskId =
    detailPanel?.kind === "task" ? detailPanel.taskId : null;
  const query = searchQuery.trim().toLowerCase();

  const runCenterTasks = useMemo(
    () => tasks.filter(shouldShowTaskInRunCenter),
    [tasks],
  );

  const filteredTasks = useMemo(() => {
    return runCenterTasks.filter((task) => {
      const assignee = getAgent(task.assignedAgentRoleId);
      const attentionReason = getTaskAttentionReason(task)?.toLowerCase() || "";
      const localizedAttentionReason = getTaskAttentionReason(task)
        ? translateAttentionReason(getTaskAttentionReason(task)!).toLowerCase()
        : "";
      const labels = getTaskLabels(task).map((label) =>
        label.name.toLowerCase(),
      );
      const workspaceName = getWorkspaceName(task.workspaceId).toLowerCase();
      const assigneeName =
        assignee?.displayName.toLowerCase() ||
        translate(
          "generated.components.mission.control.mcboardtab.271.49",
          "Not assigned",
        );
      const localizedAssigneeName = assignee
        ? getLocalizedAgentRoleText(assignee, language).name.toLowerCase()
        : translate(
            "generated.components.mission.control.mcboardtab.274.50",
            "Not assigned",
          );

      if (
        getTaskBoardView(task, isTaskTerminal, isTaskAttentionRequired) !==
        viewMode
      ) {
        return false;
      }

      if (viewMode === "attention" && attentionFilter !== "all") {
        const reason = getTaskAttentionReason(task);
        const isApproval =
          task.terminalStatus === "awaiting_approval" ||
          reason === "Awaiting approval";
        const isAbnormal =
          task.status === "failed" ||
          task.status === "interrupted" ||
          task.status === "blocked" ||
          [
            "Blocked",
            "Run failed",
            "Interrupted",
            "Dependency unavailable",
            "Provider quota issue",
          ].includes(reason || "");

        if (attentionFilter === "approval" && !isApproval) return false;
        if (attentionFilter === "abnormal" && !isAbnormal) return false;
      }
      if (priorityFilter !== "all" && (task.priority ?? 0) !== priorityFilter) {
        return false;
      }
      if (
        ownerFilter &&
        !assigneeName.includes(ownerFilter.trim().toLowerCase())
      ) {
        return false;
      }
      if (
        workspaceFilter &&
        !workspaceName.includes(workspaceFilter.trim().toLowerCase())
      ) {
        return false;
      }
      if (!query) return true;

      return [
        task.title,
        task.prompt,
        assignee?.displayName || "",
        localizedAssigneeName,
        attentionReason,
        localizedAttentionReason,
        workspaceName,
        ...labels,
      ].some((value) => value.toLowerCase().includes(query));
    });
  }, [
    getAgent,
    getTaskAttentionReason,
    getTaskLabels,
    getWorkspaceName,
    attentionFilter,
    isTaskAttentionRequired,
    isTaskTerminal,
    language,
    ownerFilter,
    priorityFilter,
    query,
    runCenterTasks,
    viewMode,
    workspaceFilter,
  ]);

  const sortedTasks = useMemo(() => {
    const compareByDue = (
      a: (typeof tasks)[number],
      b: (typeof tasks)[number],
    ) => {
      if (a.dueDate && b.dueDate) return a.dueDate - b.dueDate;
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;
      return 0;
    };

    return [...filteredTasks].sort((a, b) => {
      if (viewMode === "attention") {
        const approvalCompare =
          Number(
            b.terminalStatus === "awaiting_approval" ||
              getTaskAttentionReason(b) === "Awaiting approval",
          ) -
          Number(
            a.terminalStatus === "awaiting_approval" ||
              getTaskAttentionReason(a) === "Awaiting approval",
          );
        if (approvalCompare !== 0) return approvalCompare;
      }
      const attentionCompare =
        Number(isTaskAttentionRequired(b)) - Number(isTaskAttentionRequired(a));
      if (attentionCompare !== 0) return attentionCompare;
      const overdueCompare =
        Number(Boolean(getTaskDueInfo(b.dueDate)?.isOverdue)) -
        Number(Boolean(getTaskDueInfo(a.dueDate)?.isOverdue));
      if (overdueCompare !== 0) return overdueCompare;
      const priorityCompare = (b.priority ?? 0) - (a.priority ?? 0);
      if (priorityCompare !== 0) return priorityCompare;
      const staleCompare = Number(isTaskStale(b)) - Number(isTaskStale(a));
      if (staleCompare !== 0) return staleCompare;
      return (
        compareByDue(a, b) ||
        (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt)
      );
    });
  }, [
    filteredTasks,
    getTaskAttentionReason,
    getTaskDueInfo,
    isTaskAttentionRequired,
    isTaskStale,
    tasks,
    viewMode,
  ]);
  const boardContentMode = getTaskBoardContentMode(
    displayMode,
    filteredTasks.length,
  );

  const selectableVisibleTasks = useMemo(
    () => sortedTasks.filter((task) => !isTaskDeletionBlocked(task.status)),
    [sortedTasks],
  );
  const allVisibleTasksSelected =
    selectableVisibleTasks.length > 0 &&
    selectableVisibleTasks.every((task) => selectedTaskIds.has(task.id));

  const leaveSelectionMode = () => {
    setSelectionMode(false);
    setSelectedTaskIds(new Set());
  };

  const refreshTaskViews = useCallback(async () => {
    await Promise.all([
      data.handleManualRefresh(),
      Promise.resolve(onTasksChanged?.()),
    ]);
  }, [data, onTasksChanged]);

  const loadArchivedTasks = useCallback(async () => {
    if (!window.electronAPI?.listArchivedTasks) return;
    setLoadingArchivedTasks(true);
    setArchiveError(null);
    try {
      const records = await window.electronAPI.listArchivedTasks();
      setArchivedTasks(records);
    } catch (error) {
      console.error("Failed to load recently deleted tasks:", error);
      setArchiveError(
        translate(
          "generated.components.mission.control.mcboardtab.410.51",
          "Unable to load recently deleted tasks, please try again later.",
        ),
      );
    } finally {
      setLoadingArchivedTasks(false);
    }
  }, []);

  const restoreArchivedTasks = useCallback(
    async (taskIds: string[]) => {
      if (!window.electronAPI?.unarchiveTask || taskIds.length === 0) return;
      setArchiveError(null);
      setRestoringTaskIds((current) => new Set([...current, ...taskIds]));
      const failedTaskIds: string[] = [];
      for (const taskId of taskIds) {
        try {
          await window.electronAPI.unarchiveTask(taskId);
        } catch (error) {
          console.error("Failed to restore task:", error);
          failedTaskIds.push(taskId);
        }
      }
      setRestoringTaskIds((current) => {
        const next = new Set(current);
        taskIds.forEach((taskId) => next.delete(taskId));
        return next;
      });
      const restoredTaskIds = taskIds.filter(
        (taskId) => !failedTaskIds.includes(taskId),
      );
      if (restoredTaskIds.length > 0) {
        setArchiveNoticeTaskIds([]);
        await refreshTaskViews();
        await loadArchivedTasks();
      }
      if (failedTaskIds.length > 0) {
        setArchiveError(
          translate(
            "missionControl.restore.failedCount",
            "Failed to restore {count} tasks. They may be beyond the 7-day recovery window.",
            { count: failedTaskIds.length },
          ),
        );
      }
    },
    [loadArchivedTasks, refreshTaskViews],
  );

  const confirmPermanentDeletion = useCallback(async () => {
    if (!permanentDeleteRequest || permanentlyDeleting) return;
    setPermanentlyDeleting(true);
    setPermanentDeleteError(null);
    try {
      await window.electronAPI.purgeArchivedTask(
        permanentDeleteRequest.task.id,
      );
      setPermanentDeleteRequest(null);
      await refreshTaskViews();
      await loadArchivedTasks();
    } catch (error) {
      console.error("Failed to permanently delete task:", error);
      setPermanentDeleteError(
        translate(
          "missionControl.trash.permanentDeleteFailed",
          "Unable to permanently delete this task. Try again.",
        ),
      );
    } finally {
      setPermanentlyDeleting(false);
    }
  }, [
    loadArchivedTasks,
    permanentDeleteRequest,
    permanentlyDeleting,
    refreshTaskViews,
  ]);

  useEffect(() => {
    if (!recentlyDeletedOpen) return;
    void loadArchivedTasks();
  }, [loadArchivedTasks, recentlyDeletedOpen]);

  const toggleTaskSelection = (taskId: string) => {
    setSelectedTaskIds((current) => {
      const next = new Set(current);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  const toggleSelectAllVisibleTasks = () => {
    setSelectedTaskIds((current) => {
      const next = new Set(current);
      if (allVisibleTasksSelected) {
        selectableVisibleTasks.forEach((task) => next.delete(task.id));
      } else {
        selectableVisibleTasks.forEach((task) => next.add(task.id));
      }
      return next;
    });
  };

  const requestTaskDeletion = (
    taskIds: string[],
    mode: DeleteRequest["mode"],
  ) => {
    const deletableIds = taskIds.filter((taskId) => {
      const task = tasks.find((candidate) => candidate.id === taskId);
      return task && !isTaskDeletionBlocked(task.status);
    });
    if (deletableIds.length === 0) return;
    setDeleteError(null);
    setDeleteRequest({ taskIds: deletableIds, mode });
  };

  const confirmTaskDeletion = async () => {
    if (!deleteRequest || deletingTasks) return;
    setDeletingTasks(true);
    setDeleteError(null);

    const failedTaskIds: string[] = [];
    for (const taskId of deleteRequest.taskIds) {
      try {
        await window.electronAPI.archiveTask(taskId);
      } catch (error) {
        console.error("Failed to delete task from Mission Control:", error);
        failedTaskIds.push(taskId);
      }
    }

    const deletedTaskIds = deleteRequest.taskIds.filter(
      (taskId) => !failedTaskIds.includes(taskId),
    );
    if (
      detailPanel?.kind === "task" &&
      deletedTaskIds.includes(detailPanel.taskId)
    ) {
      setDetailPanel(null);
    }
    setSelectedTaskIds((current) => {
      const next = new Set(current);
      deletedTaskIds.forEach((taskId) => next.delete(taskId));
      return next;
    });

    await refreshTaskViews();

    setDeletingTasks(false);
    if (failedTaskIds.length > 0) {
      setDeleteRequest({ taskIds: failedTaskIds, mode: deleteRequest.mode });
      setDeleteError(
        translate(
          "missionControl.delete.failedCount",
          "Failed to move {count} tasks to Recently Deleted. Try again.",
          { count: failedTaskIds.length },
        ),
      );
      return;
    }

    setArchiveNoticeTaskIds(deletedTaskIds);
    setDeleteRequest(null);
    if (deleteRequest.mode === "batch") leaveSelectionMode();
  };

  const tasksByColumn = useMemo(() => {
    const grouped = new Map<string, typeof tasks>();
    BOARD_COLUMNS.forEach((column) => grouped.set(column.id, []));
    if (viewMode === "attention") {
      grouped.set("inbox", sortedTasks);
      return grouped;
    }
    sortedTasks.forEach((task) => {
      const columnId = getMissionColumnForTask(task);
      grouped.set(columnId, [...(grouped.get(columnId) || []), task]);
    });
    return grouped;
  }, [getMissionColumnForTask, sortedTasks, tasks, viewMode]);

  const summary = useMemo(() => {
    const overdue = filteredTasks.filter((task) =>
      Boolean(getTaskDueInfo(task.dueDate)?.isOverdue),
    ).length;
    const stale = filteredTasks.filter((task) => isTaskStale(task)).length;
    const attention = filteredTasks.filter((task) =>
      isTaskAttentionRequired(task),
    ).length;
    const completed = filteredTasks.filter(
      (task) => task.status === "completed",
    ).length;
    const cancelled = filteredTasks.filter(
      (task) => task.status === "cancelled",
    ).length;
    const running = filteredTasks.filter((task) =>
      ["planning", "executing", "running"].includes(task.status),
    ).length;
    const waiting = filteredTasks.filter((task) =>
      ["pending", "queued"].includes(task.status),
    ).length;
    const paused = filteredTasks.filter(
      (task) => task.status === "paused",
    ).length;
    return {
      overdue,
      stale,
      attention,
      completed,
      cancelled,
      running,
      waiting,
      paused,
    };
  }, [filteredTasks, getTaskDueInfo, isTaskAttentionRequired, isTaskStale]);

  const tabCounts = useMemo(() => {
    return runCenterTasks.reduce<Record<BoardViewMode, number>>(
      (counts, task) => {
        counts[
          getTaskBoardView(task, isTaskTerminal, isTaskAttentionRequired)
        ] += 1;
        return counts;
      },
      { active: 0, attention: 0, history: 0 },
    );
  }, [isTaskAttentionRequired, isTaskTerminal, runCenterTasks]);

  const attentionCounts = useMemo(() => {
    const attentionTasks = runCenterTasks.filter(
      (task) =>
        getTaskBoardView(task, isTaskTerminal, isTaskAttentionRequired) ===
        "attention",
    );

    return {
      all: attentionTasks.length,
      approval: attentionTasks.filter(
        (task) =>
          task.terminalStatus === "awaiting_approval" ||
          getTaskAttentionReason(task) === "Awaiting approval",
      ).length,
      abnormal: attentionTasks.filter(
        (task) =>
          task.status === "failed" ||
          task.status === "interrupted" ||
          task.status === "blocked" ||
          [
            "Blocked",
            "Run failed",
            "Interrupted",
            "Dependency unavailable",
            "Provider quota issue",
          ].includes(getTaskAttentionReason(task) || ""),
      ).length,
    };
  }, [
    getTaskAttentionReason,
    isTaskAttentionRequired,
    isTaskTerminal,
    runCenterTasks,
  ]);

  const visibleColumns = useMemo(() => {
    return BOARD_COLUMNS.filter(
      (column) => (tasksByColumn.get(column.id) || []).length > 0,
    );
  }, [tasksByColumn]);

  const tabs = [
    {
      id: "active" as const,
      label: t("missionControl.board.view.active", "In progress"),
      Icon: CircleDotDashed,
    },
    {
      id: "attention" as const,
      label: t("missionControl.board.view.attention", "Need to be processed"),
      Icon: ShieldCheck,
    },
    {
      id: "history" as const,
      label: t("missionControl.board.history", "history"),
      Icon: History,
    },
  ];
  const currentViewCopy = VIEW_COPY[viewMode];
  const hasActiveFilters =
    Boolean(query) ||
    Boolean(ownerFilter) ||
    Boolean(workspaceFilter) ||
    priorityFilter !== "all" ||
    (viewMode === "attention" && attentionFilter !== "all");
  const viewMetrics =
    viewMode === "history"
      ? [
          {
            label: translate(
              "generated.components.mission.control.mcboardtab.622.52",
              "Completed",
            ),
            description: translate(
              "generated.components.mission.control.mcboardtab.623.53",
              "Successfully delivered tasks",
            ),
            value: summary.completed,
            tone: "success",
            icon: CheckCircle2,
          },
          {
            label: translate(
              "generated.components.mission.control.mcboardtab.629.54",
              "Canceled",
            ),
            description: translate(
              "generated.components.mission.control.mcboardtab.630.55",
              "Ended and no need to continue processing",
            ),
            value: summary.cancelled,
            tone: "neutral",
            icon: Layers3,
          },
          {
            label: translate(
              "generated.components.mission.control.mcboardtab.636.56",
              "Overdue",
            ),
            description: translate(
              "generated.components.mission.control.mcboardtab.637.57",
              "Exceeded planned completion time",
            ),
            value: summary.overdue,
            tone: "warning",
            icon: Clock3,
          },
        ]
      : [
          {
            label:
              viewMode === "attention"
                ? translate(
                    "generated.components.mission.control.mcboardtab.645.58",
                    "Need to be processed",
                  )
                : translate(
                    "generated.components.mission.control.mcboardtab.645.59",
                    "Executing",
                  ),
            description:
              viewMode === "attention"
                ? translate(
                    "generated.components.mission.control.mcboardtab.648.60",
                    "waiting for your decision",
                  )
                : translate(
                    "generated.components.mission.control.mcboardtab.649.61",
                    "The model or tool is working",
                  ),
            value:
              viewMode === "attention" ? summary.attention : summary.running,
            tone: viewMode === "attention" ? "warning" : "active",
            icon: viewMode === "attention" ? ShieldCheck : CircleDotDashed,
          },
          {
            label:
              viewMode === "attention"
                ? translate(
                    "generated.components.mission.control.mcboardtab.655.62",
                    "Waiting for approval",
                  )
                : translate(
                    "generated.components.mission.control.mcboardtab.655.63",
                    "Waiting to begin",
                  ),
            description:
              viewMode === "attention"
                ? translate(
                    "generated.components.mission.control.mcboardtab.658.64",
                    "Confirmation is required to continue",
                  )
                : translate(
                    "generated.components.mission.control.mcboardtab.659.65",
                    "Queuing for resources",
                  ),
            value:
              viewMode === "attention"
                ? attentionCounts.approval
                : summary.waiting,
            tone: viewMode === "attention" ? "active" : "warning",
            icon: viewMode === "attention" ? ShieldCheck : Clock3,
          },
          {
            label:
              viewMode === "attention"
                ? translate(
                    "generated.components.mission.control.mcboardtab.668.66",
                    "Abnormal tasks",
                  )
                : translate(
                    "generated.components.mission.control.mcboardtab.668.67",
                    "pause / stall",
                  ),
            description:
              viewMode === "attention"
                ? translate(
                    "generated.components.mission.control.mcboardtab.671.68",
                    "failed, blocked or interrupted",
                  )
                : translate(
                    "generated.components.mission.control.mcboardtab.672.69",
                    "Paused or no progress for an extended period of time",
                  ),
            value:
              viewMode === "attention"
                ? attentionCounts.abnormal
                : summary.paused + summary.stale,
            tone: "danger",
            icon: AlertTriangle,
          },
        ];

  return (
    <div className={`mc-v2-board mc-task-workspace view-${viewMode}`}>
      <div className="mc-v2-board-header">
        <div className="mc-v2-board-toolbar">
          <div
            className="mc-task-tabs"
            role="tablist"
            aria-label={t("missionControl.board.tabs.label", "task view")}
          >
            {tabs.map((tab) => (
              <button
                key={tab.id}
                id={`mc-task-tab-${tab.id}`}
                type="button"
                role="tab"
                aria-selected={viewMode === tab.id}
                aria-controls="mc-task-tabpanel"
                tabIndex={viewMode === tab.id ? 0 : -1}
                className={`mc-task-tab ${viewMode === tab.id ? "active" : ""}`}
                onClick={() => {
                  setViewMode(tab.id);
                  leaveSelectionMode();
                }}
                onKeyDown={(event) => {
                  const currentIndex = tabs.findIndex(
                    (candidate) => candidate.id === tab.id,
                  );
                  const nextIndex =
                    event.key === "ArrowRight"
                      ? (currentIndex + 1) % tabs.length
                      : event.key === "ArrowLeft"
                        ? (currentIndex - 1 + tabs.length) % tabs.length
                        : event.key === "Home"
                          ? 0
                          : event.key === "End"
                            ? tabs.length - 1
                            : null;
                  if (nextIndex === null) return;

                  event.preventDefault();
                  const nextTab = tabs[nextIndex];
                  setViewMode(nextTab.id);
                  leaveSelectionMode();
                  event.currentTarget.parentElement
                    ?.querySelector<HTMLButtonElement>(
                      `#mc-task-tab-${nextTab.id}`,
                    )
                    ?.focus();
                }}
              >
                <tab.Icon size={14} strokeWidth={1.9} aria-hidden="true" />
                <span>{tab.label}</span>
                <span className="mc-task-tab-count">{tabCounts[tab.id]}</span>
              </button>
            ))}
          </div>
          <div
            className="mc-task-board-filters"
            aria-label={translate(
              "generated.components.mission.control.mcboardtab.734.70",
              "Task filter",
            )}
          >
            <div
              className="mc-task-display-switch"
              role="group"
              aria-label={translate(
                "generated.components.mission.control.mcboardtab.738.71",
                "Task presentation method",
              )}
            >
              <button
                type="button"
                aria-label={translate(
                  "generated.components.mission.control.mcboardtab.742.72",
                  "list view",
                )}
                aria-pressed={displayMode === "list"}
                className={displayMode === "list" ? "active" : ""}
                onClick={() => setDisplayMode("list")}
              >
                <List size={14} />
                <span>
                  {translate(
                    "generated.components.mission.control.mcboardtab.748.73",
                    "list",
                  )}
                </span>
              </button>
              <button
                type="button"
                aria-label={translate(
                  "generated.components.mission.control.mcboardtab.752.74",
                  "calendar view",
                )}
                aria-pressed={displayMode === "calendar"}
                className={displayMode === "calendar" ? "active" : ""}
                onClick={() => {
                  setDisplayMode("calendar");
                  leaveSelectionMode();
                }}
              >
                <CalendarDays size={14} />
                <span>
                  {translate(
                    "generated.components.mission.control.mcboardtab.761.75",
                    "Calendar",
                  )}
                </span>
              </button>
            </div>

            <MCSelectMenu
              ariaLabel={translate(
                "generated.components.mission.control.mcboardtab.766.76",
                "Filter by person in charge",
              )}
              className={`mc-task-filter-menu ${ownerFilter ? "active" : ""}`}
              icon={<Users size={14} />}
              minMenuWidth={248}
              value={ownerFilter}
              onValueChange={setOwnerFilter}
              searchPlaceholder={translate(
                "generated.components.mission.control.mcboardtab.772.77",
                "Search leader",
              )}
              options={[
                {
                  value: "",
                  label: translate(
                    "generated.components.mission.control.mcboardtab.774.78",
                    "All persons in charge",
                  ),
                },
                {
                  value: translate(
                    "generated.components.mission.control.mcboardtab.775.79",
                    "Not assigned",
                  ),
                  label: translate(
                    "generated.components.mission.control.mcboardtab.775.80",
                    "Not assigned",
                  ),
                },
                ...agents.map((agent) => ({
                  value: agent.displayName,
                  label: getLocalizedAgentRoleText(agent, language).name,
                  keywords: `${agent.displayName} ${agent.name}`,
                })),
              ]}
            />

            <MCSelectMenu
              ariaLabel={translate(
                "generated.components.mission.control.mcboardtab.785.81",
                "Filter by workspace",
              )}
              className={`mc-task-filter-menu ${workspaceFilter ? "active" : ""}`}
              icon={<Layers3 size={14} />}
              minMenuWidth={236}
              value={workspaceFilter}
              onValueChange={setWorkspaceFilter}
              options={[
                {
                  value: "",
                  label: translate(
                    "generated.components.mission.control.mcboardtab.792.82",
                    "All workspaces",
                  ),
                },
                ...workspaces.map((workspace) => ({
                  value: getWorkspaceName(workspace.id),
                  label: getWorkspaceName(workspace.id),
                })),
              ]}
            />

            <MCSelectMenu
              ariaLabel={translate(
                "generated.components.mission.control.mcboardtab.801.83",
                "Filter by priority",
              )}
              className={`mc-task-filter-menu ${priorityFilter !== "all" ? "active" : ""}`}
              icon={<Flag size={14} />}
              minMenuWidth={210}
              value={String(priorityFilter)}
              onValueChange={(nextValue) => {
                setPriorityFilter(
                  nextValue === "all" ? "all" : Number(nextValue),
                );
              }}
              options={[
                {
                  value: "all",
                  label: translate(
                    "generated.components.mission.control.mcboardtab.812.84",
                    "All priorities",
                  ),
                },
                ...[...TASK_PRIORITY_OPTIONS].reverse().map((option) => ({
                  value: String(option.value),
                  label:
                    option.value === 0
                      ? PRIORITY_LABELS[option.value]
                      : `${option.shortLabel} ${PRIORITY_LABELS[option.value]}`,
                })),
              ]}
            />

            {(ownerFilter || workspaceFilter || priorityFilter !== "all") && (
              <button
                type="button"
                className="mc-task-clear-filters"
                onClick={() => {
                  setOwnerFilter("");
                  setWorkspaceFilter("");
                  setPriorityFilter("all");
                }}
              >
                {translate(
                  "generated.components.mission.control.mcboardtab.833.85",
                  "Clear",
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      <section
        id="mc-task-tabpanel"
        className="mc-task-ledger"
        role="tabpanel"
        aria-labelledby={`mc-task-tab-${viewMode}`}
      >
        <header className="mc-task-view-header">
          <div className="mc-task-view-copy">
            <h2>{currentViewCopy.title}</h2>
            <p>{currentViewCopy.description}</p>
          </div>
          <div className="mc-task-view-tools">
            {viewMode === "history" && (
              <button
                type="button"
                className="mc-task-recently-deleted-trigger"
                onClick={() => setRecentlyDeletedOpen(true)}
              >
                <Trash2 size={14} />
                {translate(
                  "generated.components.mission.control.mcboardtab.859.86",
                  "Recently deleted",
                )}
              </button>
            )}
            {displayMode === "list" &&
              filteredTasks.length > 0 &&
              (selectionMode ? (
                <div
                  className="mc-task-batch-toolbar"
                  role="toolbar"
                  aria-label={translate(
                    "generated.components.mission.control.mcboardtab.864.87",
                    "Batch management tasks",
                  )}
                >
                  <label className="mc-task-select-all">
                    <input
                      type="checkbox"
                      checked={allVisibleTasksSelected}
                      onChange={toggleSelectAllVisibleTasks}
                    />
                    <span>
                      {translate(
                        "generated.components.mission.control.mcboardtab.871.88",
                        "Select all current results",
                      )}
                    </span>
                  </label>
                  <span className="mc-task-selection-count">
                    {translate(
                      "generated.components.mission.control.mcboardtab.874.89",
                      "Selected",
                    )}
                    {selectedTaskIds.size}{" "}
                    {translate(
                      "generated.components.mission.control.mcboardtab.874.90",
                      "item",
                    )}
                  </span>
                  <button
                    type="button"
                    className="mc-task-batch-delete"
                    disabled={selectedTaskIds.size === 0}
                    onClick={() =>
                      requestTaskDeletion(Array.from(selectedTaskIds), "batch")
                    }
                  >
                    <Trash2 size={14} />
                    {translate(
                      "generated.components.mission.control.mcboardtab.885.91",
                      "Move to recently deleted",
                    )}
                  </button>
                  <button
                    type="button"
                    className="mc-task-batch-cancel"
                    onClick={leaveSelectionMode}
                  >
                    {translate(
                      "generated.components.mission.control.mcboardtab.892.92",
                      "Cancel",
                    )}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="mc-task-batch-trigger"
                  onClick={() => setSelectionMode(true)}
                >
                  <ListChecks size={14} />
                  {translate(
                    "generated.components.mission.control.mcboardtab.902.93",
                    "Batch management",
                  )}
                </button>
              ))}
            {viewMode === "active" && onOpenAutomations && (
              <div className="mc-task-view-actions">
                <button
                  type="button"
                  className="mc-task-create-button"
                  onClick={onOpenAutomations}
                >
                  <Workflow size={15} />
                  {translate(
                    "generated.components.mission.control.mcboardtab.914.94",
                    "Timing and automation",
                  )}
                </button>
              </div>
            )}
          </div>
        </header>

        <div
          className="mc-task-summary-grid"
          aria-label={translate(
            "generated.components.mission.control.mcboardtab.921.95",
            "Mission overview",
          )}
        >
          {viewMetrics.map((metric, index) => {
            const MetricIcon = metric.icon;
            const attentionFilterId: AttentionFilter =
              index === 0 ? "all" : index === 1 ? "approval" : "abnormal";
            const isFilterCard = viewMode === "attention";
            const isActive =
              isFilterCard && attentionFilter === attentionFilterId;

            return (
              <button
                key={metric.label}
                type="button"
                className={`mc-task-summary-card tone-${metric.tone} ${isActive ? "active" : ""}`}
                aria-pressed={isFilterCard ? isActive : undefined}
                disabled={!isFilterCard}
                onClick={() => {
                  if (isFilterCard) setAttentionFilter(attentionFilterId);
                }}
              >
                <span className="mc-task-summary-icon" aria-hidden="true">
                  <MetricIcon size={16} strokeWidth={1.8} />
                </span>
                <span className="mc-task-summary-copy">
                  <strong>{metric.label}</strong>
                  <small>{metric.description}</small>
                </span>
                <b>{metric.value}</b>
              </button>
            );
          })}
        </div>

        {displayMode === "list" && visibleColumns.length > 0 && (
          <div
            className={`mc-task-ledger-columns ${selectionMode ? "is-selecting" : ""}`}
          >
            <span className="mc-task-column-title">
              {selectionMode && (
                <input
                  type="checkbox"
                  checked={allVisibleTasksSelected}
                  onChange={toggleSelectAllVisibleTasks}
                  aria-label={translate(
                    "generated.components.mission.control.mcboardtab.966.96",
                    "Select all deletable tasks in the current results",
                  )}
                />
              )}
              {translate(
                "generated.components.mission.control.mcboardtab.969.97",
                "Task",
              )}
            </span>
            <span>
              {translate(
                "generated.components.mission.control.mcboardtab.971.98",
                "Responsible person / work area",
              )}
            </span>
            <span>
              {translate(
                "generated.components.mission.control.mcboardtab.972.99",
                "Update time",
              )}
            </span>
            <span>
              {translate(
                "generated.components.mission.control.mcboardtab.973.100",
                "priority",
              )}
            </span>
            <span>
              {translate(
                "generated.components.mission.control.mcboardtab.974.101",
                "Operation",
              )}
            </span>
          </div>
        )}

        {boardContentMode === "calendar" ? (
          <MCTaskCalendarView
            tasks={sortedTasks}
            data={data}
            selectedTaskId={selectedTaskId}
            onSelectTask={(taskId) => setDetailPanel({ kind: "task", taskId })}
          />
        ) : boardContentMode === "empty" ? (
          <div className="mc-task-empty-state">
            <div>
              <strong>
                {hasActiveFilters
                  ? t(
                      "missionControl.board.noMatches",
                      "There are currently no matching tasks.",
                    )
                  : currentViewCopy.empty}
              </strong>
              <span>
                {hasActiveFilters
                  ? translate(
                      "generated.components.mission.control.mcboardtab.997.102",
                      "Adjust the filters, or clear the filters and try again.",
                    )
                  : viewMode === "active"
                    ? translate(
                        "generated.components.mission.control.mcboardtab.999.103",
                        "Normal conversations are still in the conversation list on the left; after you create an automation, its runs will appear here.",
                      )
                    : translate(
                        "generated.components.mission.control.mcboardtab.1000.104",
                        "It will automatically appear here when you need to confirm or handle exceptions.",
                      )}
              </span>
            </div>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={() => {
                  onSearchQueryChange?.("");
                  setOwnerFilter("");
                  setWorkspaceFilter("");
                  setPriorityFilter("all");
                  setAttentionFilter("all");
                }}
              >
                {translate(
                  "generated.components.mission.control.mcboardtab.1014.105",
                  "Clear filters",
                )}
              </button>
            )}
            {!hasActiveFilters &&
              viewMode === "active" &&
              onOpenAutomations && (
                <button type="button" onClick={onOpenAutomations}>
                  <Workflow size={14} />
                  {translate(
                    "generated.components.mission.control.mcboardtab.1020.106",
                    "Create a scheduled task",
                  )}
                </button>
              )}
          </div>
        ) : (
          <div className="mc-task-groups">
            {visibleColumns.map((column) => {
              const columnTasks = tasksByColumn.get(column.id) || [];
              const attentionCount = columnTasks.filter((task) =>
                isTaskAttentionRequired(task),
              ).length;
              const overdueCount = columnTasks.filter((task) =>
                Boolean(getTaskDueInfo(task.dueDate)?.isOverdue),
              ).length;
              const staleCount = columnTasks.filter((task) =>
                isTaskStale(task),
              ).length;

              return (
                <section
                  key={column.id}
                  className={`mc-task-group ${dragOverColumn === column.id ? "drag-over" : ""}`}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDragOverColumn(column.id);
                  }}
                  onDragLeave={() => setDragOverColumn(null)}
                  onDrop={(event) => {
                    event.preventDefault();
                    const taskId = event.dataTransfer.getData("text/plain");
                    if (taskId) void handleMoveTask(taskId, column.id);
                    setDragOverColumn(null);
                  }}
                >
                  <header className="mc-task-group-header">
                    <div className="mc-task-group-name">
                      <span
                        className="mc-task-group-mark"
                        style={{ backgroundColor: column.color }}
                      />
                      <h3>{t(COLUMN_LABEL_KEYS[column.id], column.label)}</h3>
                      <span>{columnTasks.length}</span>
                    </div>
                    <div className="mc-task-group-signals">
                      {attentionCount > 0 && (
                        <span>
                          {attentionCount}{" "}
                          {translate(
                            "generated.components.mission.control.mcboardtab.1062.107",
                            "Need to be processed",
                          )}
                        </span>
                      )}
                      {overdueCount > 0 && (
                        <span>
                          {overdueCount}{" "}
                          {translate(
                            "generated.components.mission.control.mcboardtab.1063.108",
                            "overdue",
                          )}
                        </span>
                      )}
                      {staleCount > 0 && (
                        <span>
                          {staleCount}{" "}
                          {translate(
                            "generated.components.mission.control.mcboardtab.1064.109",
                            "stagnation",
                          )}
                        </span>
                      )}
                    </div>
                  </header>

                  <div className="mc-task-rows">
                    {renderTaskRows(
                      columnTasks,
                      filteredTasks.length,
                      (task) => {
                        const assignedAgent = getAgent(
                          task.assignedAgentRoleId,
                        );
                        const labels = getTaskLabels(task);
                        const dueInfo = getTaskDueInfo(task.dueDate);
                        const attentionReason = getTaskAttentionReason(task);
                        const stale = isTaskStale(task);
                        const estimate = formatTaskEstimate(
                          task.estimatedMinutes,
                        );
                        const taskUpdatedAt = formatRelativeTime(
                          task.updatedAt || task.createdAt,
                        );
                        const taskUpdatedAtExact = formatExactTaskTimestamp(
                          task.updatedAt || task.createdAt,
                        );
                        const tone =
                          task.status === "failed" ||
                          task.status === "interrupted"
                            ? "danger"
                            : dueInfo?.isOverdue || attentionReason
                              ? "warning"
                              : isTaskTerminal(task)
                                ? "success"
                                : task.status === "executing"
                                  ? "active"
                                  : "neutral";
                        const ToneIcon =
                          tone === "danger"
                            ? AlertTriangle
                            : tone === "success"
                              ? CheckCircle2
                              : tone === "active"
                                ? CircleDotDashed
                                : Clock3;
                        const deletionBlocked = isTaskDeletionBlocked(
                          task.status,
                        );
                        const selectedForDeletion = selectedTaskIds.has(
                          task.id,
                        );

                        return (
                          <article
                            key={task.id}
                            className={`mc-task-row tone-${tone} ${selectedTaskId === task.id ? "selected" : ""} ${selectionMode ? "is-selecting" : ""} ${selectedForDeletion ? "is-selected-for-delete" : ""}`}
                            draggable={!selectionMode}
                            tabIndex={0}
                            onDragStart={(event) => {
                              if (selectionMode) {
                                event.preventDefault();
                                return;
                              }
                              event.dataTransfer.setData("text/plain", task.id);
                              event.dataTransfer.effectAllowed = "move";
                            }}
                            onClick={() => {
                              if (selectionMode) {
                                if (!deletionBlocked)
                                  toggleTaskSelection(task.id);
                                return;
                              }
                              setDetailPanel({ kind: "task", taskId: task.id });
                            }}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                if (selectionMode) {
                                  if (!deletionBlocked)
                                    toggleTaskSelection(task.id);
                                } else {
                                  setDetailPanel({
                                    kind: "task",
                                    taskId: task.id,
                                  });
                                }
                              }
                            }}
                          >
                            {selectionMode && (
                              <label
                                className="mc-task-row-select"
                                title={
                                  deletionBlocked
                                    ? translate(
                                        "generated.components.mission.control.mcboardtab.1138.110",
                                        "Running tasks cannot be deleted",
                                      )
                                    : undefined
                                }
                                onClick={(event) => event.stopPropagation()}
                              >
                                <input
                                  type="checkbox"
                                  checked={selectedForDeletion}
                                  disabled={deletionBlocked}
                                  onChange={() => toggleTaskSelection(task.id)}
                                  aria-label={translate(
                                    "missionControl.task.selectNamed",
                                    "Select “{name}”",
                                    { name: getDisplayTaskTitle(task.title) },
                                  )}
                                />
                              </label>
                            )}
                            <div className="mc-task-row-main">
                              <span
                                className={`mc-task-row-signal tone-${tone}`}
                                aria-hidden="true"
                              >
                                <ToneIcon size={15} strokeWidth={1.9} />
                              </span>
                              <div className="mc-task-row-copy">
                                <div className="mc-task-row-title-line">
                                  <h4>{getDisplayTaskTitle(task.title)}</h4>
                                </div>
                                <div className="mc-task-row-context">
                                  <span
                                    className={`mc-task-status tone-${tone}`}
                                  >
                                    {attentionReason
                                      ? translateAttentionReason(
                                          attentionReason,
                                        )
                                      : translateTaskStatus(task.status)}
                                  </span>
                                  {attentionReason &&
                                    viewMode !== "attention" && (
                                      <span className="mc-task-attention-reason">
                                        {translateAttentionReason(
                                          attentionReason,
                                        )}
                                      </span>
                                    )}
                                  {labels.slice(0, 2).map((label) => (
                                    <span
                                      key={label.id}
                                      className="mc-task-label"
                                    >
                                      {label.name}
                                    </span>
                                  ))}
                                  {labels.length > 2 && (
                                    <span className="mc-task-label">
                                      +{labels.length - 2}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="mc-task-row-scope">
                              <strong
                                className={
                                  !assignedAgent ? "unassigned" : undefined
                                }
                              >
                                {assignedAgent
                                  ? getLocalizedAgentRoleText(
                                      assignedAgent,
                                      language,
                                    ).name
                                  : t(
                                      "missionControl.board.unassigned",
                                      "Not assigned",
                                    )}
                              </strong>
                              {isAllWorkspacesSelected && (
                                <span>
                                  {getWorkspaceName(task.workspaceId)}
                                </span>
                              )}
                            </div>

                            <div className="mc-task-row-time">
                              {dueInfo ? (
                                <strong className={dueInfo.tone}>
                                  {translateDueLabel(dueInfo.label)}
                                </strong>
                              ) : estimate ? (
                                <strong>
                                  {translateEstimateLabel(estimate)}
                                </strong>
                              ) : null}
                              <span title={taskUpdatedAtExact}>
                                {t(
                                  "missionControl.board.updated",
                                  "Updated {time}",
                                  {
                                    time: taskUpdatedAt,
                                  },
                                )}
                              </span>
                              <time
                                className="mc-task-row-time-exact"
                                dateTime={new Date(
                                  task.updatedAt || task.createdAt,
                                ).toISOString()}
                              >
                                {taskUpdatedAtExact}
                              </time>
                              {stale && (
                                <small>
                                  {t("missionControl.board.stale", "Stale")}
                                </small>
                              )}
                            </div>

                            <div className="mc-task-row-priority">
                              <MCSelectMenu
                                ariaLabel={translate(
                                  "missionControl.task.setPriorityNamed",
                                  "Set priority for “{name}”",
                                  { name: getDisplayTaskTitle(task.title) },
                                )}
                                className="mc-task-row-priority-menu"
                                icon={<Flag size={13} />}
                                minMenuWidth={168}
                                value={String(task.priority ?? 0)}
                                onValueChange={(nextValue) => {
                                  void handleSetTaskPriority(
                                    task.id,
                                    Number(nextValue),
                                  );
                                }}
                                options={[...TASK_PRIORITY_OPTIONS]
                                  .reverse()
                                  .map((option) => ({
                                    value: String(option.value),
                                    label: PRIORITY_LABELS[option.value],
                                    keywords: option.shortLabel,
                                  }))}
                              />
                            </div>
                            <div className="mc-v2-task-card-actions mc-task-row-actions">
                              {onOpenTask && (
                                <button
                                  type="button"
                                  className="mc-task-row-open-button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    void onOpenTask(task.id);
                                  }}
                                >
                                  {task.terminalStatus === "awaiting_approval"
                                    ? translate(
                                        "generated.components.mission.control.mcboardtab.1254.111",
                                        "View approvals",
                                      )
                                    : task.status === "failed" ||
                                        task.status === "interrupted"
                                      ? translate(
                                          "generated.components.mission.control.mcboardtab.1256.112",
                                          "reprocess",
                                        )
                                      : isTaskTerminal(task)
                                        ? translate(
                                            "generated.components.mission.control.mcboardtab.1258.113",
                                            "View results",
                                          )
                                        : translate(
                                            "generated.components.mission.control.mcboardtab.1259.114",
                                            "Open task",
                                          )}
                                </button>
                              )}
                              <button
                                type="button"
                                className="mc-task-row-delete-button"
                                disabled={deletionBlocked}
                                title={
                                  deletionBlocked
                                    ? translate(
                                        "generated.components.mission.control.mcboardtab.1268.115",
                                        "Running tasks cannot be deleted",
                                      )
                                    : translate(
                                        "missionControl.task.moveToDeletedNamed",
                                        "Move “{name}” to Recently Deleted",
                                        {
                                          name: getDisplayTaskTitle(task.title),
                                        },
                                      )
                                }
                                aria-label={translate(
                                  "missionControl.task.moveToDeletedNamed",
                                  "Move “{name}” to Recently Deleted",
                                  { name: getDisplayTaskTitle(task.title) },
                                )}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  requestTaskDeletion([task.id], "single");
                                }}
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </article>
                        );
                      },
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </section>

      {archiveNoticeTaskIds.length > 0 && (
        <div
          className="mc-task-archive-notice"
          role="status"
          aria-live="polite"
        >
          <div>
            <strong>
              {archiveNoticeTaskIds.length === 1
                ? translate(
                    "generated.components.mission.control.mcboardtab.1296.116",
                    "Task has been moved to recently deleted",
                  )
                : translate(
                    "missionControl.delete.movedCount",
                    "{count} tasks moved to Recently Deleted",
                    { count: archiveNoticeTaskIds.length },
                  )}
            </strong>
            <span>
              {translate(
                "generated.components.mission.control.mcboardtab.1299.117",
                "Recovery is possible within 7 days.",
              )}
            </span>
          </div>
          <button
            type="button"
            disabled={archiveNoticeTaskIds.some((taskId) =>
              restoringTaskIds.has(taskId),
            )}
            onClick={() => void restoreArchivedTasks(archiveNoticeTaskIds)}
          >
            <RotateCcw size={14} />
            {translate(
              "generated.components.mission.control.mcboardtab.1307.118",
              "Cancel",
            )}
          </button>
          <button
            type="button"
            className="mc-task-archive-notice-dismiss"
            aria-label={translate(
              "generated.components.mission.control.mcboardtab.1312.119",
              "Close prompt",
            )}
            onClick={() => setArchiveNoticeTaskIds([])}
          >
            ×
          </button>
        </div>
      )}

      {recentlyDeletedOpen && (
        <div
          className="mc-task-delete-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget)
              setRecentlyDeletedOpen(false);
          }}
        >
          <section
            className="mc-task-delete-dialog mc-task-trash-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mc-task-trash-title"
          >
            <header className="mc-task-trash-header">
              <div>
                <span className="mc-task-delete-icon" aria-hidden="true">
                  <Trash2 size={19} />
                </span>
                <div>
                  <h2 id="mc-task-trash-title">
                    {translate(
                      "generated.components.mission.control.mcboardtab.1340.120",
                      "Recently deleted",
                    )}
                  </h2>
                  <p>
                    {translate(
                      "generated.components.mission.control.mcboardtab.1341.121",
                      "Tasks deleted in the last 7 days are retained here, and will return to the original task list after restoration.",
                    )}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setRecentlyDeletedOpen(false)}
              >
                {translate(
                  "generated.components.mission.control.mcboardtab.1345.122",
                  "Complete",
                )}
              </button>
            </header>

            {archiveError && (
              <div className="mc-task-delete-error">{archiveError}</div>
            )}
            {loadingArchivedTasks ? (
              <div className="mc-task-trash-empty">
                {translate(
                  "generated.components.mission.control.mcboardtab.1351.123",
                  "Loading recently deleted tasks...",
                )}
              </div>
            ) : archivedTasks.length === 0 ? (
              <div className="mc-task-trash-empty">
                <strong>
                  {translate(
                    "generated.components.mission.control.mcboardtab.1354.124",
                    "Recently deleted is empty",
                  )}
                </strong>
                <span>
                  {translate(
                    "generated.components.mission.control.mcboardtab.1355.125",
                    "Items removed from the task list remain here for 7 days.",
                  )}
                </span>
              </div>
            ) : (
              <div className="mc-task-trash-list">
                {archivedTasks.map((record) => {
                  const isRestoring = restoringTaskIds.has(record.task.id);
                  return (
                    <article
                      key={record.sessionId}
                      className="mc-task-trash-row"
                    >
                      <div>
                        <strong>
                          {getDisplayTaskTitle(record.task.title)}
                        </strong>
                        <span>
                          {translate(
                            "generated.components.mission.control.mcboardtab.1366.126",
                            "Deleted at",
                          )}
                          {formatExactTaskTimestamp(record.archivedAt)} ·{" "}
                          {formatRestoreWindow(record.expiresAt)}
                        </span>
                      </div>
                      <div className="mc-task-trash-row-actions">
                        <button
                          type="button"
                          disabled={isRestoring || permanentlyDeleting}
                          onClick={() =>
                            void restoreArchivedTasks([record.task.id])
                          }
                        >
                          <RotateCcw size={14} />
                          {isRestoring
                            ? translate(
                                "generated.components.mission.control.mcboardtab.1375.127",
                                "Recovering…",
                              )
                            : translate(
                                "generated.components.mission.control.mcboardtab.1375.128",
                                "recovery task",
                              )}
                        </button>
                        <button
                          type="button"
                          className="mc-task-trash-permanent-delete"
                          disabled={isRestoring || permanentlyDeleting}
                          onClick={() => {
                            setPermanentDeleteError(null);
                            setPermanentDeleteRequest(record);
                          }}
                        >
                          <Trash2 size={14} />
                          {translate(
                            "missionControl.trash.permanentDelete",
                            "Delete permanently",
                          )}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}

      {permanentDeleteRequest && (
        <div
          className="mc-task-delete-backdrop mc-task-permanent-delete-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !permanentlyDeleting) {
              setPermanentDeleteRequest(null);
              setPermanentDeleteError(null);
            }
          }}
        >
          <section
            className="mc-task-delete-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mc-task-permanent-delete-title"
          >
            <span className="mc-task-delete-icon" aria-hidden="true">
              <Trash2 size={19} />
            </span>
            <div className="mc-task-delete-copy">
              <h2 id="mc-task-permanent-delete-title">
                {translate(
                  "missionControl.trash.permanentDeleteTitle",
                  "Permanently delete “{name}”?",
                  {
                    name: getDisplayTaskTitle(
                      permanentDeleteRequest.task.title,
                    ),
                  },
                )}
              </h2>
              <p>
                {translate(
                  "missionControl.trash.permanentDeleteDescription",
                  "The task, its execution records, and local worktree data will be removed immediately. This action cannot be undone.",
                )}
              </p>
              {permanentDeleteError && (
                <div className="mc-task-delete-error">
                  {permanentDeleteError}
                </div>
              )}
            </div>
            <div className="mc-task-delete-actions">
              <button
                type="button"
                className="mc-task-delete-cancel"
                disabled={permanentlyDeleting}
                onClick={() => {
                  setPermanentDeleteRequest(null);
                  setPermanentDeleteError(null);
                }}
              >
                {translate(
                  "generated.components.mission.control.mcboardtab.1427.131",
                  "Cancel",
                )}
              </button>
              <button
                type="button"
                className="mc-task-delete-confirm"
                disabled={permanentlyDeleting}
                onClick={() => void confirmPermanentDeletion()}
              >
                {permanentlyDeleting
                  ? translate(
                      "missionControl.trash.permanentlyDeleting",
                      "Deleting…",
                    )
                  : translate(
                      "missionControl.trash.permanentDelete",
                      "Delete permanently",
                    )}
              </button>
            </div>
          </section>
        </div>
      )}

      {deleteRequest && (
        <div
          className="mc-task-delete-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !deletingTasks) {
              setDeleteRequest(null);
              setDeleteError(null);
            }
          }}
        >
          <section
            className="mc-task-delete-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mc-task-delete-title"
          >
            <span className="mc-task-delete-icon" aria-hidden="true">
              <Trash2 size={19} />
            </span>
            <div className="mc-task-delete-copy">
              <h2 id="mc-task-delete-title">
                {deleteRequest.taskIds.length === 1
                  ? translate(
                      "generated.components.mission.control.mcboardtab.1409.129",
                      "Move this task to recent and delete?",
                    )
                  : translate(
                      "missionControl.delete.confirmCount",
                      "Move the selected {count} tasks to Recently Deleted?",
                      { count: deleteRequest.taskIds.length },
                    )}
              </h2>
              <p>
                {translate(
                  "generated.components.mission.control.mcboardtab.1413.130",
                  "Tasks and their execution records are hidden from the list and remain in Recently Deleted for 7 days; they can be restored at any time during this time.",
                )}
              </p>
              {deleteError && (
                <div className="mc-task-delete-error">{deleteError}</div>
              )}
            </div>
            <div className="mc-task-delete-actions">
              <button
                type="button"
                className="mc-task-delete-cancel"
                disabled={deletingTasks}
                onClick={() => {
                  setDeleteRequest(null);
                  setDeleteError(null);
                }}
              >
                {translate(
                  "generated.components.mission.control.mcboardtab.1427.131",
                  "Cancel",
                )}
              </button>
              <button
                type="button"
                className="mc-task-delete-confirm"
                disabled={deletingTasks}
                onClick={() => void confirmTaskDeletion()}
              >
                {deletingTasks
                  ? translate(
                      "generated.components.mission.control.mcboardtab.1435.132",
                      "Moving…",
                    )
                  : translate(
                      "generated.components.mission.control.mcboardtab.1435.133",
                      "Move to recently deleted",
                    )}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
