import {
  startTransition,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Copy,
  ExternalLink,
  FileText,
  History,
  Inbox,
  ListChecks,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  X,
} from "lucide-react";
import type {
  ListTaskTraceRunsRequest,
  TaskStatus,
  TaskTraceRow,
  TaskTraceRunDetail,
  TaskTraceRunSibling,
  TaskTraceRunSummary,
  TaskTraceTab,
  Workspace,
} from "../../shared/types";
import { translate, useLanguage, type SupportedLanguage } from "../i18n";
import {
  buildTaskTraceDebugRows,
  buildTaskTraceTranscriptRows,
  normalizeTaskTraceMarkdownDisplay,
  serializeTaskTraceRows,
} from "../utils/task-trace-debugger";
import { createRendererLogger } from "../utils/logger";
import "./task-trace-debugger.css";

interface TaskTraceDebuggerPanelProps {
  workspaceId?: string;
  onOpenTask?: (taskId: string) => void;
}

type TraceFilter = "all" | "critical" | "warning";
type TraceStageKey =
  "received" | "files" | "analysis" | "generation" | "delivered";

interface TraceStageDefinition {
  key: TraceStageKey;
  titleKey: string;
  titleFallback: string;
  summaryKey: string;
  summaryFallback: string;
  icon: typeof Inbox;
}

interface TraceStageGroup extends TraceStageDefinition {
  rows: TaskTraceRow[];
  warningRows: TaskTraceRow[];
  durationMs: number;
}

const ALL_WORKSPACES = "__all__";
const STATUS_OPTIONS = [
  "all",
  "pending",
  "executing",
  "interrupted",
  "completed",
  "failed",
  "cancelled",
] as const;

const STAGE_DEFINITIONS: TraceStageDefinition[] = [
  {
    key: "received",
    titleKey: "traces.stage.received",
    titleFallback: translate(
      "generated.components.tasktracedebuggerpanel.88.0",
      "Task received",
    ),
    summaryKey: "traces.stage.receivedSummary",
    summaryFallback: translate(
      "generated.components.tasktracedebuggerpanel.90.1",
      "The task has been successfully received and completed basic verification.",
    ),
    icon: Inbox,
  },
  {
    key: "files",
    titleKey: "traces.stage.files",
    titleFallback: translate(
      "generated.components.tasktracedebuggerpanel.96.2",
      "Documents and information",
    ),
    summaryKey: "traces.stage.filesSummary",
    summaryFallback: translate(
      "generated.components.tasktracedebuggerpanel.98.3",
      "The files and information required for the task have been read and organized.",
    ),
    icon: FileText,
  },
  {
    key: "analysis",
    titleKey: "traces.stage.analysis",
    titleFallback: translate(
      "generated.components.tasktracedebuggerpanel.104.4",
      "Analysis and processing",
    ),
    summaryKey: "traces.stage.analysisSummary",
    summaryFallback: translate(
      "generated.components.tasktracedebuggerpanel.106.5",
      "Understand content, extract key information, and advance processing.",
    ),
    icon: Sparkles,
  },
  {
    key: "generation",
    titleKey: "traces.stage.generation",
    titleFallback: translate(
      "generated.components.tasktracedebuggerpanel.112.6",
      "Generation and verification",
    ),
    summaryKey: "traces.stage.generationSummary",
    summaryFallback: translate(
      "generated.components.tasktracedebuggerpanel.114.7",
      "Generate task results and complete consistency and integrity checks.",
    ),
    icon: ShieldCheck,
  },
  {
    key: "delivered",
    titleKey: "traces.stage.delivered",
    titleFallback: translate(
      "generated.components.tasktracedebuggerpanel.120.8",
      "Delivered",
    ),
    summaryKey: "traces.stage.deliveredSummary",
    summaryFallback: translate(
      "generated.components.tasktracedebuggerpanel.122.9",
      "Results are generated and delivered, ready to review or continue processing.",
    ),
    icon: CheckCircle2,
  },
];

const logger = createRendererLogger("TaskTraceDebugger");

function cleanTraceText(value: string | undefined, maxLength = 180): string {
  if (!value) return "";
  const normalized = normalizeTaskTraceMarkdownDisplay(value)
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[`*_#>~-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}

function formatMetricNumber(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(value);
}

function formatDuration(ms: number, language: SupportedLanguage): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (language === "zh-CN") {
    if (minutes <= 0)
      return translate("duration.seconds", "{seconds}s", { seconds });
    return seconds > 0
      ? translate("duration.minutesSeconds", "{minutes}m {seconds}s", {
          minutes,
          seconds,
        })
      : translate("duration.minutes", "{minutes}m", { minutes });
  }
  if (minutes <= 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

function formatTime(timestamp: number, language: SupportedLanguage): string {
  return new Intl.DateTimeFormat(language === "zh-CN" ? "zh-CN" : "en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(timestamp);
}

function formatDateTime(
  timestamp: number,
  language: SupportedLanguage,
): string {
  return new Intl.DateTimeFormat(language === "zh-CN" ? "zh-CN" : "en-US", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(timestamp);
}

function formatRelativeTime(
  timestamp: number,
  language: SupportedLanguage,
): string {
  const diffMinutes = Math.max(
    0,
    Math.floor((Date.now() - timestamp) / 60_000),
  );
  if (language === "zh-CN") {
    if (diffMinutes < 1)
      return translate(
        "generated.components.tasktracedebuggerpanel.182.10",
        "Just now",
      );
    if (diffMinutes < 60)
      return translate("activity.time.minutesAgo", "{count} minutes ago", {
        count: diffMinutes,
      });
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24)
      return translate("activity.time.hoursAgo", "{count} hours ago", {
        count: diffHours,
      });
    return translate("activity.time.daysAgo", "{count} days ago", {
      count: Math.floor(diffHours / 24),
    });
  }
  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.floor(diffHours / 24)}d ago`;
}

function isLocalizedForLanguage(
  value: string,
  language: SupportedLanguage,
): boolean {
  if (language !== "zh-CN") return true;
  return /[\u4e00-\u9fff]/.test(value.slice(0, 48));
}

function localizeTaskStatus(status: TaskStatus): string {
  return translate(`traces.status.${status}`, status.replace(/_/g, " "));
}

function rowSearchText(row: TaskTraceRow): string {
  return [
    row.label,
    row.title,
    row.body,
    row.status,
    row.inspector.title,
    row.inspector.subtitle,
    row.inspector.content,
    ...row.inspector.fields.flatMap((field) => [field.label, field.value]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function isWarningRow(row: TaskTraceRow): boolean {
  const haystack = rowSearchText(row);
  return /failed|failure|error|warning|blocked|cancelled|skipped|retry|失败|错误|警告|阻止|取消|跳过|重试|不完整/.test(
    haystack,
  );
}

function isCriticalRow(row: TaskTraceRow): boolean {
  if (isWarningRow(row)) return true;
  if (row.actor === "user" || row.actor === "result") return true;
  return /complete|deliver|artifact|output|final|verification|完成|交付|产物|输出|核验/.test(
    rowSearchText(row),
  );
}

function classifyStage(row: TaskTraceRow): TraceStageKey {
  const haystack = rowSearchText(row);
  const headline = [row.label, row.title, row.status]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (
    row.actor === "user" ||
    /task.?start|task.?received|received|user.?input|user.?prompt|接收|收到任务|用户输入/.test(
      headline,
    )
  ) {
    return "received";
  }
  if (
    /read.?file|write.?file|list.?director|glob|search|upload|download|document|spreadsheet|attachment|文件|资料|目录|读取|搜索|上传|下载/.test(
      haystack,
    )
  ) {
    return "files";
  }
  if (
    isWarningRow(row) &&
    /blocked|missing|not available|source material|input|retry|阻止|缺失|不可用|输入|重试/.test(
      haystack,
    )
  ) {
    return "analysis";
  }
  if (
    /task.?complete|deliver|final.?result|artifact.?created|output.?ready|已完成|交付|最终结果|产物已生成/.test(
      haystack,
    )
  ) {
    return "delivered";
  }
  if (
    /generate|draft|write|summary|verify|validate|review|test|check|生成|总结|撰写|校验|核验|检查|测试/.test(
      haystack,
    )
  ) {
    return "generation";
  }
  return "analysis";
}

function getWarningTitle(
  row: TaskTraceRow,
  completed: boolean,
  language: SupportedLanguage,
): string {
  if (language !== "zh-CN") return localizeRowTitle(row);
  const raw = rowSearchText(row);
  if (/tool.*not available|工具.*不可用/.test(raw))
    return translate(
      "generated.components.tasktracedebuggerpanel.273.11",
      "The required tool is currently unavailable",
    );
  if (
    /source material|missing input|input.*missing|输入.*缺失|资料.*不完整/.test(
      raw,
    )
  ) {
    return translate(
      "generated.components.tasktracedebuggerpanel.275.12",
      "Incomplete information entered",
    );
  }
  return completed
    ? translate(
        "generated.components.tasktracedebuggerpanel.277.13",
        "The step was briefly blocked",
      )
    : translate(
        "generated.components.tasktracedebuggerpanel.277.14",
        "Step execution exception",
      );
}

function getWarningSummary(
  row: TaskTraceRow,
  completed: boolean,
  language: SupportedLanguage,
): string {
  const raw = cleanTraceText(row.body || row.inspector.content, 220);
  if (language !== "zh-CN" || /[\u4e00-\u9fff]/.test(raw)) {
    return (
      raw ||
      translate(
        "traces.warningRecovered",
        "An exception was detected and the task has continued to complete subsequent processing.",
      )
    );
  }
  if (/tool.*not available/.test(raw.toLowerCase())) {
    return completed
      ? translate(
          "generated.components.tasktracedebuggerpanel.291.15",
          "The system has switched to an available processing method and continues with the next steps.",
        )
      : translate(
          "generated.components.tasktracedebuggerpanel.292.16",
          "The required tools are currently unavailable. Please try again later or adjust the task method.",
        );
  }
  if (
    /source material|input|audience|presentation goal/.test(raw.toLowerCase())
  ) {
    return completed
      ? translate(
          "generated.components.tasktracedebuggerpanel.296.17",
          "If the complete input information is not received, this step has been automatically skipped and the subsequent process has been completed.",
        )
      : translate(
          "generated.components.tasktracedebuggerpanel.297.18",
          "The input information required to complete this step is missing, please provide additional information before continuing.",
        );
  }
  return completed
    ? translate(
        "generated.components.tasktracedebuggerpanel.300.19",
        "The system has automatically recovered and continues to complete subsequent processing.",
      )
    : translate(
        "generated.components.tasktracedebuggerpanel.301.20",
        "A phased exception has been detected. Please expand the technical log to view details.",
      );
}

function localizeRowTitle(row: TaskTraceRow): string {
  const title = cleanTraceText(row.title, 120);
  const lower = title.toLowerCase();
  if (/llm route selected/.test(lower))
    return translate("traces.event.modelSelected", "Execution model selected");
  if (/step in progress/.test(lower))
    return translate("traces.event.stepRunning", "Steps are being executed");
  if (/step completed/.test(lower))
    return translate("traces.event.stepCompleted", "step completed");
  if (/analyzing task/.test(lower))
    return translate("traces.event.analyzing", "Analyzing task");
  if (/task completed/.test(lower))
    return translate("traces.event.taskCompleted", "Task completed");
  if (row.actor === "tool" && title && !/[\u4e00-\u9fff]/.test(title)) {
    return translate("traces.event.toolCall", "Calling tool: {name}", {
      name: title,
    });
  }
  return title || translate("traces.event.activity", "Execute activities");
}

function stageDuration(rows: TaskTraceRow[]): number {
  const explicitDuration = rows.reduce(
    (sum, row) => sum + (row.durationMs || 0),
    0,
  );
  if (explicitDuration > 0) return explicitDuration;
  if (rows.length < 2) return 0;
  const timestamps = rows.map((row) => row.timestamp).filter(Number.isFinite);
  return Math.max(0, Math.max(...timestamps) - Math.min(...timestamps));
}

function buildStageGroups(rows: TaskTraceRow[]): TraceStageGroup[] {
  const grouped = new Map<TraceStageKey, TaskTraceRow[]>();
  STAGE_DEFINITIONS.forEach((stage) => grouped.set(stage.key, []));
  rows.forEach((row) => grouped.get(classifyStage(row))?.push(row));
  return STAGE_DEFINITIONS.map((definition) => {
    const stageRows = grouped.get(definition.key) || [];
    return {
      ...definition,
      rows: stageRows,
      warningRows: stageRows.filter(isWarningRow),
      durationMs: stageDuration(stageRows),
    };
  });
}

function getOutcomeSummary(
  detail: TaskTraceRunDetail,
  rows: TaskTraceRow[],
  language: SupportedLanguage,
): string {
  const rawTaskSummary =
    detail.task.semanticSummary || detail.task.resultSummary;
  const cleanedTaskSummary = cleanTraceText(rawTaskSummary, 360).replace(
    /\|+/g,
    " · ",
  );
  const chineseSentences =
    cleanedTaskSummary.match(/[^。！？]+[。！？]?/g) || [];
  const conciseTaskSummary = chineseSentences.slice(0, 2).join("").trim();
  const taskSummary = cleanTraceText(
    conciseTaskSummary || cleanedTaskSummary,
    180,
  );
  if (taskSummary && isLocalizedForLanguage(taskSummary, language)) {
    return taskSummary;
  }
  const resultRow = [...rows]
    .reverse()
    .find(
      (row) =>
        row.actor === "result" &&
        (cleanTraceText(row.body) || cleanTraceText(row.title)),
    );
  const resultText = cleanTraceText(resultRow?.body || resultRow?.title, 220);
  if (resultText && isLocalizedForLanguage(resultText, language)) {
    return resultText;
  }
  if (detail.task.status === "completed") {
    return translate(
      "traces.outcome.completed",
      "The task has been completed, the results have been generated and passed necessary verification, and you can continue to view or process them.",
    );
  }
  return translate(
    "traces.outcome.inProgress",
    "The task is being processed and key progress will be displayed below.",
  );
}

function stageHasActivity(stage: TraceStageGroup): boolean {
  return stage.rows.length > 0;
}

function summaryContainsTask(
  run: TaskTraceRunSummary,
  taskId: string | null,
): boolean {
  if (!taskId) return false;
  return (
    run.taskId === taskId ||
    run.siblingRuns.some((sibling) => sibling.taskId === taskId)
  );
}

export function resolveTaskTraceSiblingRuns(
  detailRuns: TaskTraceRunSibling[],
  summaryRuns: TaskTraceRunSibling[] = [],
): TaskTraceRunSibling[] {
  return summaryRuns.length > detailRuns.length ? summaryRuns : detailRuns;
}

function getInitialTaskId(): string | null {
  try {
    const taskId = new URL(window.location.href).searchParams
      .get("task")
      ?.trim();
    return taskId || null;
  } catch {
    return null;
  }
}

export function TaskTraceDebuggerPanel({
  onOpenTask,
}: TaskTraceDebuggerPanelProps) {
  const language = useLanguage();
  const t = translate;
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  // Task tracking is a global activity view. Starting from the workspace passed by
  // Settings made an otherwise healthy page look empty whenever the latest runs
  // belonged to temporary or recently-used workspaces.
  const [selectedWorkspaceId, setSelectedWorkspaceId] =
    useState(ALL_WORKSPACES);
  const [statusFilter, setStatusFilter] =
    useState<(typeof STATUS_OPTIONS)[number]>("all");
  const [runSearch, setRunSearch] = useState("");
  const [rowSearch, setRowSearch] = useState("");
  const [filter, setFilter] = useState<TraceFilter>("all");
  const [searchOpen, setSearchOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [technicalTab, setTechnicalTab] = useState<TaskTraceTab>("transcript");
  const [expandedStages, setExpandedStages] = useState<TraceStageKey[]>([]);
  const [runs, setRuns] = useState<TaskTraceRunSummary[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(
    getInitialTaskId,
  );
  const [detail, setDetail] = useState<TaskTraceRunDetail | null>(null);
  const [listLoading, setListLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [copiedKind, setCopiedKind] = useState<"link" | "logs" | null>(null);
  const listRequestSequence = useRef(0);
  const detailRequestSequence = useRef(0);
  const deferredRunSearch = useDeferredValue(runSearch);
  const deferredRowSearch = useDeferredValue(rowSearch);

  const workspaceMap = useMemo(
    () => new Map(workspaces.map((workspace) => [workspace.id, workspace])),
    [workspaces],
  );

  const loadWorkspaces = useCallback(async () => {
    try {
      const loaded = await window.electronAPI.listWorkspaces();
      startTransition(() => setWorkspaces(loaded || []));
    } catch (loadError) {
      logger.error("Failed to load workspaces for task trace:", loadError);
    }
  }, []);

  const loadRuns = useCallback(
    async (nextSelectedTaskId?: string | null) => {
      const requestSequence = ++listRequestSequence.current;
      setListLoading(true);
      setListError(null);
      try {
        const request: ListTaskTraceRunsRequest = {
          ...(selectedWorkspaceId !== ALL_WORKSPACES
            ? { workspaceId: selectedWorkspaceId }
            : {}),
          ...(statusFilter !== "all" ? { status: statusFilter } : {}),
          ...(deferredRunSearch.trim()
            ? { query: deferredRunSearch.trim() }
            : {}),
          limit: 80,
        };
        const loadedRuns =
          (await window.electronAPI.listTaskTraceRuns(request)) || [];
        if (requestSequence !== listRequestSequence.current) return;
        startTransition(() => {
          setRuns(loadedRuns);
          setSelectedTaskId((previous) => {
            const desired = nextSelectedTaskId ?? previous;
            if (
              desired &&
              loadedRuns.some((item) => summaryContainsTask(item, desired))
            ) {
              return desired;
            }
            return loadedRuns[0]?.taskId || null;
          });
        });
      } catch (loadError) {
        if (requestSequence !== listRequestSequence.current) return;
        logger.error("Failed to load task trace runs:", loadError);
        setListError(
          loadError instanceof Error
            ? loadError.message
            : t("traces.error.loadRuns", "Unable to load task running record."),
        );
        setRuns([]);
        setSelectedTaskId(null);
      } finally {
        if (requestSequence === listRequestSequence.current)
          setListLoading(false);
      }
    },
    [deferredRunSearch, selectedWorkspaceId, statusFilter, t],
  );

  const loadDetail = useCallback(
    async (taskId: string | null) => {
      const requestSequence = ++detailRequestSequence.current;
      if (!taskId) {
        setDetail(null);
        setDetailError(null);
        return;
      }
      setDetailLoading(true);
      setDetailError(null);
      setDetail((current) => (current?.task.id === taskId ? current : null));
      try {
        const loadedDetail = await window.electronAPI.getTaskTraceRun(taskId);
        if (requestSequence !== detailRequestSequence.current) return;
        startTransition(() => setDetail(loadedDetail || null));
      } catch (loadError) {
        if (requestSequence !== detailRequestSequence.current) return;
        logger.error("Failed to load task trace detail:", loadError);
        setDetailError(
          loadError instanceof Error
            ? loadError.message
            : t(
                "traces.error.loadDetail",
                "Unable to load task tracking details.",
              ),
        );
        setDetail(null);
      } finally {
        if (requestSequence === detailRequestSequence.current)
          setDetailLoading(false);
      }
    },
    [t],
  );

  useEffect(() => {
    void loadWorkspaces();
  }, [loadWorkspaces]);

  useEffect(() => {
    void loadRuns();
  }, [loadRuns]);

  useEffect(() => {
    void loadDetail(selectedTaskId);
  }, [loadDetail, selectedTaskId]);

  useEffect(() => {
    if (!historyOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setHistoryOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [historyOpen]);

  useEffect(() => {
    let reloadTimer: number | null = null;
    const unsubscribe = window.electronAPI.onTaskEvent((event) => {
      if (!event?.taskId) return;
      if (reloadTimer !== null) window.clearTimeout(reloadTimer);
      reloadTimer = window.setTimeout(() => {
        const taskToKeep = selectedTaskId || event.taskId;
        void loadRuns(taskToKeep);
        if (event.taskId === selectedTaskId) void loadDetail(event.taskId);
      }, 300);
    });
    return () => {
      if (reloadTimer !== null) window.clearTimeout(reloadTimer);
      unsubscribe();
    };
  }, [loadDetail, loadRuns, selectedTaskId]);

  const transcriptRows = useMemo(
    () =>
      detail
        ? buildTaskTraceTranscriptRows(
            detail.semanticTimeline || [],
            detail.rawEvents || [],
          )
        : [],
    [detail],
  );
  const debugRows = useMemo(
    () => (detail ? buildTaskTraceDebugRows(detail.rawEvents || []) : []),
    [detail],
  );
  const filteredRows = useMemo(() => {
    const query = deferredRowSearch.trim().toLowerCase();
    return transcriptRows.filter((row) => {
      if (filter === "critical" && !isCriticalRow(row)) return false;
      if (filter === "warning" && !isWarningRow(row)) return false;
      if (query && !rowSearchText(row).includes(query)) return false;
      return true;
    });
  }, [deferredRowSearch, filter, transcriptRows]);
  const stageGroups = useMemo(
    () => buildStageGroups(filteredRows),
    [filteredRows],
  );
  const visibleStageGroups = useMemo(() => {
    if (filter === "all" && !deferredRowSearch.trim()) return stageGroups;
    return stageGroups.filter(stageHasActivity);
  }, [deferredRowSearch, filter, stageGroups]);
  const outcomeSummary = useMemo(
    () => (detail ? getOutcomeSummary(detail, transcriptRows, language) : ""),
    [detail, language, transcriptRows],
  );

  const handleCopyLink = useCallback(async () => {
    if (!detail) return;
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("task", detail.task.id);
      await navigator.clipboard.writeText(url.toString());
      setCopiedKind("link");
      window.setTimeout(() => setCopiedKind(null), 1400);
    } catch (copyError) {
      logger.error("Failed to copy task trace link:", copyError);
      setDetailError(t("traces.error.copy", "Failed to copy task link."));
    }
  }, [detail, t]);

  const handleCopyLogs = useCallback(async () => {
    try {
      const rows = technicalTab === "transcript" ? transcriptRows : debugRows;
      await navigator.clipboard.writeText(
        serializeTaskTraceRows(rows, technicalTab),
      );
      setCopiedKind("logs");
      window.setTimeout(() => setCopiedKind(null), 1400);
    } catch (copyError) {
      logger.error("Failed to copy task trace logs:", copyError);
      setDetailError(
        t(
          "traces.error.copy",
          "Unable to access clipboard when copying trace output.",
        ),
      );
    }
  }, [debugRows, t, technicalTab, transcriptRows]);

  const toggleStage = useCallback((stageKey: TraceStageKey) => {
    setExpandedStages((previous) =>
      previous.includes(stageKey)
        ? previous.filter((key) => key !== stageKey)
        : [...previous, stageKey],
    );
  }, []);

  const selectRun = useCallback((taskId: string) => {
    setSelectedTaskId(taskId);
    setHistoryOpen(false);
    setExpandedStages([]);
  }, []);

  const taskTimestamp = detail
    ? detail.metrics.completedAt ||
      detail.metrics.updatedAt ||
      detail.task.updatedAt
    : 0;
  const activeRunSummary = detail
    ? runs.find((run) => summaryContainsTask(run, detail.task.id))
    : undefined;
  // Older task rows can resolve to the right session in the list projection while
  // their detail lookup only returns the selected row. The run summary already
  // contains the complete session family, so use it as a compatibility fallback.
  const siblingRuns = detail
    ? resolveTaskTraceSiblingRuns(
        detail.siblingRuns,
        activeRunSummary?.siblingRuns,
      )
    : [];
  const activeRunIndex = detail
    ? siblingRuns.findIndex((run) => run.taskId === detail.task.id)
    : -1;

  return (
    <div className="task-trace-debugger">
      <header className="task-trace-pagebar">
        <div>
          <h2>{t("traces.pageTitle", "Task tracking")}</h2>
          <p>
            {t(
              "traces.pageDescription",
              "View task results, key steps, and issues that need to be addressed.",
            )}
          </p>
        </div>
        <div className="task-trace-pagebar-actions">
          <button
            type="button"
            className={`task-trace-action-btn ${historyOpen ? "active" : ""}`}
            onClick={() => {
              void loadRuns(selectedTaskId);
              setHistoryOpen((value) => !value);
            }}
          >
            <History size={16} />
            <span>{t("traces.history", "Running history")}</span>
          </button>
        </div>
      </header>

      <div className="task-trace-workspace">
        <aside
          className={`task-trace-run-browser ${historyOpen ? "open" : ""}`}
          aria-label={t("traces.history", "Running history")}
        >
          <div className="task-trace-browser-header">
            <div>
              <ListChecks size={17} />
              <strong>{t("traces.recentRuns", "Recently run")}</strong>
              <span>{runs.length}</span>
            </div>
            <div className="task-trace-browser-actions">
              <button
                type="button"
                onClick={() => void loadRuns(selectedTaskId)}
                aria-label={t("traces.refreshRuns", "Refresh running records")}
                disabled={listLoading}
              >
                <RefreshCw
                  size={15}
                  className={listLoading ? "spinning" : ""}
                />
              </button>
              <button
                type="button"
                className="task-trace-browser-close"
                onClick={() => setHistoryOpen(false)}
                aria-label={t("traces.closeHistory", "Turn off run history")}
              >
                <X size={16} />
              </button>
            </div>
          </div>

          <div className="task-trace-browser-filters">
            <label>
              <Search size={15} />
              <input
                type="search"
                value={runSearch}
                onChange={(event) => setRunSearch(event.target.value)}
                placeholder={t("traces.searchRuns", "Search task title")}
              />
            </label>
            <div>
              <select
                value={selectedWorkspaceId}
                onChange={(event) => setSelectedWorkspaceId(event.target.value)}
                aria-label={t("traces.workspaceFilter", "Workspace filter")}
              >
                <option value={ALL_WORKSPACES}>
                  {t("traces.allWorkspaces", "All workspaces")}
                </option>
                {workspaces.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.name}
                  </option>
                ))}
              </select>
              <select
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(
                    event.target.value as (typeof STATUS_OPTIONS)[number],
                  )
                }
                aria-label={t("traces.statusFilter", "status filter")}
              >
                {STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {status === "all"
                      ? t("traces.allStatuses", "All status")
                      : localizeTaskStatus(status)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="task-trace-run-list">
            {listLoading && runs.length === 0 ? (
              <div
                className="task-trace-run-skeletons"
                aria-label={t(
                  "traces.loadingDebugger",
                  "Loading task tracking...",
                )}
              >
                <span />
                <span />
                <span />
                <span />
              </div>
            ) : (
              runs.map((run) => {
                const workspace = workspaceMap.get(run.workspaceId);
                return (
                  <button
                    key={run.taskId}
                    type="button"
                    className={
                      summaryContainsTask(run, selectedTaskId) ? "selected" : ""
                    }
                    onClick={() => selectRun(run.taskId)}
                  >
                    <span
                      className={`task-trace-history-status status-${run.status}`}
                    >
                      {run.status === "completed" ? <Check size={11} /> : null}
                    </span>
                    <span className="task-trace-history-copy">
                      <strong>{run.title}</strong>
                      <small>
                        {localizeTaskStatus(run.status)}
                        {workspace ? ` · ${workspace.name}` : ""}
                        {run.runCount > 1
                          ? translate(
                              "taskTrace.runCountSuffix",
                              " · {count} runs",
                              { count: run.runCount },
                            )
                          : ""}
                      </small>
                    </span>
                    <time>{formatRelativeTime(run.updatedAt, language)}</time>
                  </button>
                );
              })
            )}
            {!listLoading && runs.length === 0 && (
              <div className="task-trace-browser-empty">
                {listError ? (
                  <AlertTriangle size={21} />
                ) : (
                  <ListChecks size={21} />
                )}
                <strong>
                  {listError
                    ? t(
                        "traces.error.loadRuns",
                        "Unable to load task running record.",
                      )
                    : t(
                        "traces.empty.noMatches",
                        "There are no matching task records.",
                      )}
                </strong>
                {listError && <p>{listError}</p>}
                <button
                  type="button"
                  onClick={() => {
                    if (listError) {
                      void loadRuns();
                    } else {
                      setRunSearch("");
                      setStatusFilter("all");
                      setSelectedWorkspaceId(ALL_WORKSPACES);
                    }
                  }}
                >
                  {listError
                    ? t("traces.retry", "reload")
                    : t("traces.clearFilters", "Clear filters")}
                </button>
              </div>
            )}
          </div>
        </aside>

        <section className="task-trace-detail-pane">
          {detail ? (
            <main className="task-trace-main">
              <section
                className="task-trace-summary"
                aria-label={t("traces.summary", "Task summary")}
              >
                <div className="task-trace-summary-heading">
                  <div className="task-trace-title-block">
                    <div className="task-trace-title-line">
                      <span
                        className={`task-trace-status-icon status-${detail.task.status}`}
                        aria-hidden="true"
                      >
                        {detail.task.status === "completed" ? (
                          <Check size={15} />
                        ) : (
                          <CircleDot size={14} />
                        )}
                      </span>
                      <h1>{detail.task.title}</h1>
                    </div>
                    <div className="task-trace-title-meta">
                      <span
                        className={`task-trace-status-pill status-${detail.task.status}`}
                      >
                        {localizeTaskStatus(detail.task.status)}
                      </span>
                      <span>{formatDateTime(taskTimestamp, language)}</span>
                      <span>
                        {formatDuration(detail.metrics.runtimeMs, language)}
                      </span>
                      {siblingRuns.length > 1 && (
                        <label className="task-trace-run-switcher">
                          <span>
                            {t("traces.runPosition", "Run {current}/{total}", {
                              current: Math.max(1, activeRunIndex + 1),
                              total: siblingRuns.length,
                            })}
                          </span>
                          <select
                            value={detail.task.id}
                            onChange={(event) => selectRun(event.target.value)}
                            aria-label={t(
                              "traces.selectRun",
                              "Switch the running record of this session",
                            )}
                          >
                            {siblingRuns.map((run, index) => (
                              <option key={run.taskId} value={run.taskId}>
                                {t(
                                  "traces.runOption",
                                  "{index} times · {status} · {title}",
                                  {
                                    index: index + 1,
                                    status: localizeTaskStatus(run.status),
                                    title: run.title,
                                  },
                                )}
                              </option>
                            ))}
                          </select>
                          <ChevronDown size={13} aria-hidden="true" />
                        </label>
                      )}
                    </div>
                  </div>
                  <div className="task-trace-summary-actions">
                    <button
                      type="button"
                      className="task-trace-action-btn task-trace-action-primary"
                      onClick={() => onOpenTask?.(detail.task.id)}
                    >
                      <ExternalLink size={16} />
                      {t("traces.viewResult", "View results")}
                    </button>
                    <button
                      type="button"
                      className="task-trace-action-btn"
                      onClick={handleCopyLink}
                    >
                      {copiedKind === "link" ? (
                        <Check size={16} />
                      ) : (
                        <Copy size={16} />
                      )}
                      {copiedKind === "link"
                        ? t("traces.copied", "Copied")
                        : t("traces.copyLink", "Copy link")}
                    </button>
                    <button
                      type="button"
                      className="task-trace-action-btn"
                      onClick={() => onOpenTask?.(detail.task.id)}
                    >
                      <ExternalLink size={16} />
                      {t("traces.openTask", "Open task")}
                    </button>
                  </div>
                </div>
                <div className="task-trace-outcome">
                  <p>{outcomeSummary}</p>
                  <div className="task-trace-inline-metrics">
                    <span>
                      <strong>Token</strong>
                      {formatMetricNumber(detail.metrics.inputTokens)} /{" "}
                      {formatMetricNumber(detail.metrics.outputTokens)}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>
                      <strong>
                        {t("traces.metric.toolCalls", "Tool call")}
                      </strong>
                      {detail.metrics.toolCallCount}
                    </span>
                  </div>
                </div>
              </section>

              <div className="task-trace-filterbar">
                <div
                  className="task-trace-filter-group"
                  role="group"
                  aria-label={t("traces.filters", "Filter task steps")}
                >
                  {(
                    [
                      ["all", t("traces.filter.all", "All")],
                      ["critical", t("traces.filter.critical", "Key steps")],
                      ["warning", t("traces.filter.warning", "warning")],
                    ] as Array<[TraceFilter, string]>
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      className={filter === value ? "active" : ""}
                      onClick={() => setFilter(value)}
                      aria-pressed={filter === value}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div
                  className={`task-trace-step-search ${searchOpen ? "open" : ""}`}
                >
                  {searchOpen && (
                    <input
                      autoFocus
                      type="search"
                      value={rowSearch}
                      onChange={(event) => setRowSearch(event.target.value)}
                      placeholder={t("traces.searchSteps", "Search steps")}
                      aria-label={t("traces.searchSteps", "Search steps")}
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      if (searchOpen && rowSearch) {
                        setRowSearch("");
                      } else {
                        setSearchOpen((value) => !value);
                      }
                    }}
                    aria-label={
                      searchOpen
                        ? t("traces.closeSearch", "Close search")
                        : t("traces.searchSteps", "Search steps")
                    }
                  >
                    {searchOpen ? <X size={18} /> : <Search size={18} />}
                  </button>
                </div>
              </div>

              <section
                className="task-trace-timeline"
                aria-label={t("traces.executionTimeline", "execution timeline")}
              >
                {detailLoading ? (
                  <div className="task-trace-empty">
                    {t("traces.loadingDetail", "Loading tracking details…")}
                  </div>
                ) : visibleStageGroups.length === 0 ? (
                  <div className="task-trace-empty">
                    {t(
                      "traces.empty.noRows",
                      "There are no steps matching the current filter criteria.",
                    )}
                  </div>
                ) : (
                  visibleStageGroups.map((stage, index) => {
                    const expanded = expandedStages.includes(stage.key);
                    const StageIcon = stage.icon;
                    const hasActivity = stage.rows.length > 0;
                    const completedByTask =
                      stage.key === "delivered" &&
                      detail.task.status === "completed";
                    const stageState =
                      stage.warningRows.length > 0
                        ? "warning"
                        : hasActivity || completedByTask
                          ? "complete"
                          : "quiet";
                    const warning = stage.warningRows[0];
                    return (
                      <article
                        key={stage.key}
                        className={`task-trace-stage state-${stageState}`}
                      >
                        <div
                          className="task-trace-stage-marker"
                          aria-hidden="true"
                        >
                          {stageState === "warning" ? (
                            <AlertTriangle size={18} />
                          ) : stageState === "complete" ? (
                            <Check size={17} />
                          ) : (
                            <StageIcon size={17} />
                          )}
                        </div>
                        {index < visibleStageGroups.length - 1 && (
                          <div
                            className="task-trace-stage-line"
                            aria-hidden="true"
                          />
                        )}
                        <div className="task-trace-stage-content">
                          <button
                            type="button"
                            className="task-trace-stage-header"
                            onClick={() =>
                              hasActivity && toggleStage(stage.key)
                            }
                            disabled={!hasActivity}
                            aria-expanded={expanded}
                          >
                            <div className="task-trace-stage-copy">
                              <div className="task-trace-stage-title">
                                <h3>
                                  {t(stage.titleKey, stage.titleFallback)}
                                </h3>
                                {stage.durationMs > 0 && (
                                  <span>
                                    {formatDuration(stage.durationMs, language)}
                                  </span>
                                )}
                              </div>
                              <p>
                                {t(stage.summaryKey, stage.summaryFallback)}
                              </p>
                            </div>
                            <div className="task-trace-stage-details-link">
                              {hasActivity
                                ? t(
                                    "traces.viewEventCount",
                                    "View {count} detailed events",
                                    { count: stage.rows.length },
                                  )
                                : t(
                                    "traces.noStageEvents",
                                    "No detailed events yet",
                                  )}
                              {hasActivity &&
                                (expanded ? (
                                  <ChevronDown size={16} />
                                ) : (
                                  <ChevronRight size={16} />
                                ))}
                            </div>
                          </button>

                          {warning && (
                            <div className="task-trace-warning-notice">
                              <AlertTriangle size={17} />
                              <div>
                                <strong>
                                  {getWarningTitle(
                                    warning,
                                    detail.task.status === "completed",
                                    language,
                                  )}
                                </strong>
                                <p>
                                  {getWarningSummary(
                                    warning,
                                    detail.task.status === "completed",
                                    language,
                                  )}
                                </p>
                              </div>
                              {detail.task.status === "completed" && (
                                <span>{t("traces.recovered", "Restored")}</span>
                              )}
                            </div>
                          )}

                          {expanded && hasActivity && (
                            <div className="task-trace-stage-events">
                              {stage.rows.map((row) => (
                                <div
                                  key={row.id}
                                  className="task-trace-stage-event"
                                >
                                  <time>
                                    {formatTime(row.timestamp, language)}
                                  </time>
                                  <div>
                                    <strong>{localizeRowTitle(row)}</strong>
                                    {cleanTraceText(row.body, 180) && (
                                      <p>{cleanTraceText(row.body, 180)}</p>
                                    )}
                                  </div>
                                  <span
                                    className={
                                      isWarningRow(row) ? "warning" : "success"
                                    }
                                  >
                                    {isWarningRow(row)
                                      ? t(
                                          "traces.event.attention",
                                          "Need to pay attention",
                                        )
                                      : t("traces.event.success", "success")}
                                  </span>
                                  {row.durationMs ? (
                                    <span>
                                      {formatDuration(row.durationMs, language)}
                                    </span>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </article>
                    );
                  })
                )}
              </section>

              <details className="task-trace-technical">
                <summary>
                  <TerminalSquare size={17} />
                  <span>
                    {t("traces.technicalLogs", "Technical logs and raw events")}
                  </span>
                  <small>{t("traces.advanced", "Advanced")}</small>
                  <ChevronRight
                    className="task-trace-technical-chevron"
                    size={16}
                  />
                </summary>
                <div className="task-trace-technical-content">
                  <div className="task-trace-technical-toolbar">
                    <div className="task-trace-technical-tabs">
                      <button
                        type="button"
                        className={
                          technicalTab === "transcript" ? "active" : ""
                        }
                        onClick={() => setTechnicalTab("transcript")}
                      >
                        {t("traces.tab.transcript", "Transcribe")}
                      </button>
                      <button
                        type="button"
                        className={technicalTab === "debug" ? "active" : ""}
                        onClick={() => setTechnicalTab("debug")}
                      >
                        {t("traces.tab.debug", "original event")}
                      </button>
                    </div>
                    <button
                      type="button"
                      className="task-trace-action-btn"
                      onClick={handleCopyLogs}
                    >
                      {copiedKind === "logs" ? (
                        <Check size={15} />
                      ) : (
                        <Copy size={15} />
                      )}
                      {copiedKind === "logs"
                        ? t("traces.copied", "Copied")
                        : t("traces.copyLogs", "Copy log")}
                    </button>
                  </div>
                  <div className="task-trace-technical-list">
                    {(technicalTab === "transcript"
                      ? transcriptRows
                      : debugRows
                    ).map((row) => (
                      <details
                        key={row.id}
                        className="task-trace-technical-row"
                      >
                        <summary>
                          <time>{formatTime(row.timestamp, language)}</time>
                          <strong>{localizeRowTitle(row)}</strong>
                          <span>{row.rawEventIds.length} raw</span>
                        </summary>
                        <pre>
                          {JSON.stringify(
                            row.inspector.json || row.inspector,
                            null,
                            2,
                          )}
                        </pre>
                      </details>
                    ))}
                  </div>
                </div>
              </details>
            </main>
          ) : (
            <div className="task-trace-detail-empty">
              {detailLoading || listLoading ? (
                <>
                  <RefreshCw size={22} className="spinning" />
                  <strong>
                    {t("traces.loadingDebugger", "Loading task tracking...")}
                  </strong>
                </>
              ) : detailError || listError ? (
                <>
                  <AlertTriangle size={23} />
                  <strong>
                    {t(
                      "traces.error.title",
                      "Task tracking cannot be loaded temporarily",
                    )}
                  </strong>
                  <p>{detailError || listError}</p>
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedTaskId) void loadDetail(selectedTaskId);
                      void loadRuns(selectedTaskId);
                    }}
                  >
                    {t("traces.retry", "reload")}
                  </button>
                </>
              ) : (
                <>
                  <ListChecks size={25} />
                  <strong>
                    {runs.length > 0
                      ? t(
                          "traces.selectSession",
                          "Select a running record to view details",
                        )
                      : t(
                          "traces.empty.title",
                          "There are no tasks to track yet",
                        )}
                  </strong>
                  <p>
                    {runs.length > 0
                      ? t(
                          "traces.selectSessionHint",
                          "Select a task from the left to view results, critical steps, and exception information.",
                        )
                      : t(
                          "traces.empty.hint",
                          "After completing a task, the running record will be automatically displayed here.",
                        )}
                  </p>
                </>
              )}
            </div>
          )}
        </section>
      </div>

      {historyOpen && (
        <button
          type="button"
          className="task-trace-history-backdrop"
          onClick={() => setHistoryOpen(false)}
          aria-label={t("traces.closeHistory", "Turn off run history")}
        />
      )}
      {detailError && detail && (
        <div className="task-trace-error" role="status">
          {detailError}
        </div>
      )}
    </div>
  );
}
