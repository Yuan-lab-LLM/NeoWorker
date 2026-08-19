import { useState, useEffect, useCallback } from "react";
import {
  ArrowRight,
  BadgeCheck,
  BookOpenCheck,
  ChartNoAxesCombined,
  ClipboardCheck,
  Coffee,
  FolderSync,
  Handshake,
  Lightbulb,
  Milestone,
  Radar,
  Scale,
  ShieldAlert,
  Sprout,
  Target,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { useAgentContext } from "../hooks/useAgentContext";
import { translate, useLanguage } from "../i18n";
import { createRendererLogger } from "../utils/logger";
import {
  NeoWorkerSelectMenu,
  type NeoWorkerSelectOption,
} from "./NeoWorkerSelectMenu";

const logger = createRendererLogger("ScheduledTasks");

// Types from preload (duplicated for renderer use)
type CronSchedule =
  | { kind: "at"; atMs: number }
  | { kind: "every"; everyMs: number; anchorMs?: number }
  | { kind: "cron"; expr: string; tz?: string };

export interface ScheduledTaskTemplate {
  id: string;
  category?: string;
  name: string;
  description: string;
  taskPrompt: string;
  taskTitle?: string;
  schedule: CronSchedule;
}

const TEMPLATE_CATEGORY_ICONS: Record<string, LucideIcon> = {
  行动: Target,
  复盘: ClipboardCheck,
  进度: Milestone,
  风险: ShieldAlert,
  洞察: Radar,
  协作: UsersRound,
  知识: BookOpenCheck,
  质量: BadgeCheck,
  数据: ChartNoAxesCombined,
  创意: Lightbulb,
  决策: Scale,
  整理: FolderSync,
  成长: Sprout,
  关系: Handshake,
  生活: Coffee,
};

function getTemplateCategoryIcon(category?: string): LucideIcon {
  return (category && TEMPLATE_CATEGORY_ICONS[category]) || Target;
}

interface CronDeliveryConfig {
  enabled: boolean;
  channelType?: string;
  channelDbId?: string;
  channelId?: string;
  deliverOnSuccess?: boolean;
  deliverOnError?: boolean;
  summaryOnly?: boolean;
  deliverOnlyIfResult?: boolean;
}

interface CronJobState {
  nextRunAtMs?: number;
  runningAtMs?: number;
  lastRunAtMs?: number;
  lastStatus?:
    | "ok"
    | "partial_success"
    | "needs_user_action"
    | "awaiting_approval"
    | "resume_available"
    | "error"
    | "skipped"
    | "timeout";
  lastError?: string;
  lastDurationMs?: number;
  lastTaskId?: string;
  runHistory?: CronRunHistoryEntry[];
  totalRuns?: number;
  successfulRuns?: number;
  failedRuns?: number;
}

type CronDeliveryMode = "direct" | "outbox";
type CronDeliverableStatus = "none" | "queued" | "sent" | "dead_letter";
type CronJobRunMode = "new_task" | "thread_follow_up";

interface CronRunHistoryEntry {
  runAtMs: number;
  durationMs: number;
  status: NonNullable<CronJobState["lastStatus"]>;
  error?: string;
  taskId?: string;
  runMode?: CronJobRunMode;
  workspaceId?: string;
  runWorkspacePath?: string;
  deliveryStatus?: "success" | "failed" | "skipped";
  deliveryError?: string;
  deliveryMode?: CronDeliveryMode;
  deliveryAttempts?: number;
  deliverableStatus?: CronDeliverableStatus;
}

interface CronRunHistoryResult {
  jobId: string;
  jobName: string;
  entries: CronRunHistoryEntry[];
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
}

interface CronJob {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  shellAccess?: boolean;
  allowUserInput?: boolean;
  deleteAfterRun?: boolean;
  createdAtMs: number;
  updatedAtMs: number;
  schedule: CronSchedule;
  workspaceId: string;
  taskPrompt: string;
  taskTitle?: string;
  runMode?: CronJobRunMode;
  targetTaskId?: string;
  delivery?: CronDeliveryConfig;
  state: CronJobState;
}

interface CronStatusSummary {
  enabled: boolean;
  storePath: string;
  jobCount: number;
  enabledJobCount: number;
  runningJobCount?: number;
  maxConcurrentRuns?: number;
  nextWakeAtMs: number | null;
}

function isWarningLikeLastStatus(status?: CronJobState["lastStatus"]): boolean {
  return (
    status === "partial_success" ||
    status === "needs_user_action" ||
    status === "awaiting_approval" ||
    status === "resume_available"
  );
}

// Minimal Workspace type for the UI
interface Workspace {
  id: string;
  name: string;
  path: string;
}

// Schedule presets
const SCHEDULE_PRESETS = [
  {
    label: translate(
      "generated.components.scheduledtaskssettings.177.0",
      "every 5 minutes",
    ),
    schedule: { kind: "every" as const, everyMs: 5 * 60 * 1000 },
  },
  {
    label: translate(
      "generated.components.scheduledtaskssettings.181.1",
      "every 15 minutes",
    ),
    schedule: { kind: "every" as const, everyMs: 15 * 60 * 1000 },
  },
  {
    label: translate(
      "generated.components.scheduledtaskssettings.185.2",
      "every 30 minutes",
    ),
    schedule: { kind: "every" as const, everyMs: 30 * 60 * 1000 },
  },
  {
    label: translate(
      "generated.components.scheduledtaskssettings.189.3",
      "hourly",
    ),
    schedule: { kind: "every" as const, everyMs: 60 * 60 * 1000 },
  },
  {
    label: translate(
      "generated.components.scheduledtaskssettings.193.4",
      "every 2 hours",
    ),
    schedule: { kind: "every" as const, everyMs: 2 * 60 * 60 * 1000 },
  },
  {
    label: translate(
      "generated.components.scheduledtaskssettings.197.5",
      "every 6 hours",
    ),
    schedule: { kind: "every" as const, everyMs: 6 * 60 * 60 * 1000 },
  },
  {
    label: translate(
      "generated.components.scheduledtaskssettings.201.6",
      "every 12 hours",
    ),
    schedule: { kind: "every" as const, everyMs: 12 * 60 * 60 * 1000 },
  },
  {
    label: translate(
      "generated.components.scheduledtaskssettings.205.7",
      "every day",
    ),
    schedule: { kind: "every" as const, everyMs: 24 * 60 * 60 * 1000 },
  },
];

const CRON_PRESETS = [
  {
    label: translate(
      "generated.components.scheduledtaskssettings.211.8",
      "per minute",
    ),
    value: "* * * * *",
    desc: translate(
      "generated.components.scheduledtaskssettings.211.9",
      "Execute every minute",
    ),
  },
  {
    label: translate(
      "generated.components.scheduledtaskssettings.212.10",
      "every 5 minutes",
    ),
    value: "*/5 * * * *",
    desc: translate(
      "generated.components.scheduledtaskssettings.212.11",
      "Executed at minutes 0, 5, and 10",
    ),
  },
  {
    label: translate(
      "generated.components.scheduledtaskssettings.214.12",
      "every 15 minutes",
    ),
    value: "*/15 * * * *",
    desc: translate(
      "generated.components.scheduledtaskssettings.216.13",
      "Execute at 00, 15, 30, 45 minutes",
    ),
  },
  {
    label: translate(
      "generated.components.scheduledtaskssettings.218.14",
      "hourly",
    ),
    value: "0 * * * *",
    desc: translate(
      "generated.components.scheduledtaskssettings.218.15",
      "Executed on the hour every hour",
    ),
  },
  {
    label: translate(
      "generated.components.scheduledtaskssettings.219.16",
      "Every day 00:00",
    ),
    value: "0 0 * * *",
    desc: translate(
      "generated.components.scheduledtaskssettings.219.17",
      "Executed at 0:00 every day",
    ),
  },
  {
    label: translate(
      "generated.components.scheduledtaskssettings.220.18",
      "Everyday 09:00",
    ),
    value: "0 9 * * *",
    desc: translate(
      "generated.components.scheduledtaskssettings.220.19",
      "Executed daily at 9am",
    ),
  },
  {
    label: translate(
      "generated.components.scheduledtaskssettings.221.20",
      "Every day 18:00",
    ),
    value: "0 18 * * *",
    desc: translate(
      "generated.components.scheduledtaskssettings.221.21",
      "Executed daily at 6pm",
    ),
  },
  {
    label: translate(
      "generated.components.scheduledtaskssettings.223.22",
      "Weekdays 09:00",
    ),
    value: "0 9 * * 1-5",
    desc: translate(
      "generated.components.scheduledtaskssettings.225.23",
      "Performed Monday through Friday at 9 a.m.",
    ),
  },
  {
    label: translate(
      "generated.components.scheduledtaskssettings.228.24",
      "Weekdays 08:00",
    ),
    value: "0 8 * * 1-5",
    desc: translate(
      "generated.components.scheduledtaskssettings.230.25",
      "Performed Monday through Friday at 8 a.m.",
    ),
  },
  {
    label: translate(
      "generated.components.scheduledtaskssettings.233.26",
      "Weekdays 19:00",
    ),
    value: "0 19 * * 1-5",
    desc: translate(
      "generated.components.scheduledtaskssettings.235.27",
      "Performed Monday through Friday at 7 p.m.",
    ),
  },
  {
    label: translate(
      "generated.components.scheduledtaskssettings.237.28",
      "Every Monday 00:00",
    ),
    value: "0 0 * * 1",
    desc: translate(
      "generated.components.scheduledtaskssettings.237.29",
      "Executed every Monday at 0:00",
    ),
  },
  {
    label: translate(
      "generated.components.scheduledtaskssettings.238.30",
      "Every Monday 09:00",
    ),
    value: "0 9 * * 1",
    desc: translate(
      "generated.components.scheduledtaskssettings.238.31",
      "Executes every Monday at 9am",
    ),
  },
  {
    label: translate(
      "generated.components.scheduledtaskssettings.239.32",
      "Every Friday 17:00",
    ),
    value: "0 17 * * 5",
    desc: translate(
      "generated.components.scheduledtaskssettings.239.33",
      "Performed every Friday at 5 p.m.",
    ),
  },
  {
    label: translate(
      "generated.components.scheduledtaskssettings.240.34",
      "Every Friday 19:00",
    ),
    value: "0 19 * * 5",
    desc: translate(
      "generated.components.scheduledtaskssettings.240.35",
      "Performed every Friday at 7 p.m.",
    ),
  },
  {
    label: translate(
      "generated.components.scheduledtaskssettings.241.36",
      "Every Sunday 10:00",
    ),
    value: "0 10 * * 0",
    desc: translate(
      "generated.components.scheduledtaskssettings.241.37",
      "Performed every Sunday at 10am",
    ),
  },
  {
    label: translate(
      "generated.components.scheduledtaskssettings.242.38",
      "00:00 on the 1st of every month",
    ),
    value: "0 0 1 * *",
    desc: translate(
      "generated.components.scheduledtaskssettings.242.39",
      "Executed at 0:00 on the first day of each month",
    ),
  },
  {
    label: translate(
      "generated.components.scheduledtaskssettings.244.40",
      "10:00 on the 1st of every month",
    ),
    value: "0 10 1 * *",
    desc: translate(
      "generated.components.scheduledtaskssettings.246.41",
      "Executed at 10am on the first day of every month",
    ),
  },
  {
    label: translate(
      "generated.components.scheduledtaskssettings.248.42",
      "Every day 20:00",
    ),
    value: "0 20 * * *",
    desc: translate(
      "generated.components.scheduledtaskssettings.248.43",
      "Executed daily at 8pm",
    ),
  },
];

const SIMPLE_SCHEDULE_CHOICES = [
  {
    value: "cron:0 9 * * *",
    label: translate(
      "generated.components.scheduledtaskssettings.254.44",
      "Every day 9:00 am",
    ),
    description: translate(
      "generated.components.scheduledtaskssettings.255.45",
      "Suitable for daily reports, reminders and daily information organization",
    ),
  },
  {
    value: "cron:0 8 * * 1-5",
    label: translate(
      "generated.components.scheduledtaskssettings.259.46",
      "Weekdays 8:00 AM",
    ),
    description: translate(
      "generated.components.scheduledtaskssettings.260.47",
      "Prepare content for the day before work begins",
    ),
  },
  {
    value: "cron:0 9 * * 1-5",
    label: translate(
      "generated.components.scheduledtaskssettings.264.48",
      "Weekdays 9:00 am",
    ),
    description: translate(
      "generated.components.scheduledtaskssettings.265.49",
      "Executed at the beginning of every working day",
    ),
  },
  {
    value: "cron:0 9 * * 1",
    label: translate(
      "generated.components.scheduledtaskssettings.269.50",
      "Every Monday 9:00 am",
    ),
    description: translate(
      "generated.components.scheduledtaskssettings.270.51",
      "Ideal for weekly planning and weekly startup tasks",
    ),
  },
  {
    value: "cron:0 17 * * 5",
    label: translate(
      "generated.components.scheduledtaskssettings.274.52",
      "Every Friday 5:00 pm",
    ),
    description: translate(
      "generated.components.scheduledtaskssettings.275.53",
      "Suitable for weekly reports and weekly reviews",
    ),
  },
  {
    value: "cron:0 10 1 * *",
    label: translate(
      "generated.components.scheduledtaskssettings.279.54",
      "1st of every month 10:00 am",
    ),
    description: translate(
      "generated.components.scheduledtaskssettings.280.55",
      "Suitable for monthly reports and monthly organization",
    ),
  },
  {
    value: `every:${60 * 60 * 1000}`,
    label: translate(
      "generated.components.scheduledtaskssettings.284.56",
      "hourly",
    ),
    description: translate(
      "generated.components.scheduledtaskssettings.285.57",
      "Continuously check for changes that need to be addressed promptly",
    ),
  },
  {
    value: "at",
    label: translate(
      "generated.components.scheduledtaskssettings.289.58",
      "Execute only once",
    ),
    description: translate(
      "generated.components.scheduledtaskssettings.290.59",
      "Execute once at specified date and time",
    ),
  },
] as const;

const SIMPLE_SCHEDULE_OPTIONS = [
  ...SIMPLE_SCHEDULE_CHOICES,
  {
    value: "custom",
    label: translate(
      "generated.components.scheduledtaskssettings.298.60",
      "other times",
    ),
    description: translate(
      "generated.components.scheduledtaskssettings.299.61",
      "Custom execution intervals or precise time rules",
    ),
  },
];

function getSimpleScheduleValue(schedule: CronSchedule): string | null {
  if (schedule.kind === "at") return "at";
  const value =
    schedule.kind === "cron"
      ? `cron:${schedule.expr}`
      : `every:${schedule.everyMs}`;
  return SIMPLE_SCHEDULE_CHOICES.some((choice) => choice.value === value)
    ? value
    : null;
}

type FriendlyCronMode = "daily" | "weekly" | "monthly";

interface FriendlyCronRule {
  mode: FriendlyCronMode;
  time: string;
  weekdays: number[];
  monthDay: number;
}

const FRIENDLY_WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;
const DEFAULT_FRIENDLY_CRON_RULE: FriendlyCronRule = {
  mode: "weekly",
  time: "09:00",
  weekdays: [1, 2, 3, 4, 5],
  monthDay: 1,
};

function expandCronWeekdays(value: string): number[] | null {
  if (value === "*") return [...FRIENDLY_WEEKDAY_ORDER];

  const days = new Set<number>();
  for (const token of value.split(",")) {
    const range = token.match(/^(\d)-(\d)$/);
    if (range) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      if (start < 0 || start > 7 || end < 0 || end > 7 || start > end) {
        return null;
      }
      for (let day = start; day <= end; day += 1) days.add(day === 7 ? 0 : day);
      continue;
    }

    if (!/^\d$/.test(token)) return null;
    const day = Number(token);
    if (day < 0 || day > 7) return null;
    days.add(day === 7 ? 0 : day);
  }

  return FRIENDLY_WEEKDAY_ORDER.filter((day) => days.has(day));
}

function parseFriendlyCron(expr: string): FriendlyCronRule | null {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return null;

  const [minuteText, hourText, monthDayText, monthText, weekdayText] = parts;
  if (!/^\d{1,2}$/.test(minuteText) || !/^\d{1,2}$/.test(hourText)) {
    return null;
  }

  const minute = Number(minuteText);
  const hour = Number(hourText);
  if (minute > 59 || hour > 23 || monthText !== "*") return null;

  const time = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  if (monthDayText === "*" && weekdayText === "*") {
    return { ...DEFAULT_FRIENDLY_CRON_RULE, mode: "daily", time };
  }

  if (monthDayText === "*") {
    const weekdays = expandCronWeekdays(weekdayText);
    if (!weekdays?.length) return null;
    return { ...DEFAULT_FRIENDLY_CRON_RULE, mode: "weekly", time, weekdays };
  }

  if (/^\d{1,2}$/.test(monthDayText) && weekdayText === "*") {
    const monthDay = Number(monthDayText);
    if (monthDay < 1 || monthDay > 31) return null;
    return { ...DEFAULT_FRIENDLY_CRON_RULE, mode: "monthly", time, monthDay };
  }

  return null;
}

function buildFriendlyCron(rule: FriendlyCronRule): string {
  const [hourText, minuteText] = rule.time.split(":");
  const hour = Math.min(23, Math.max(0, Number(hourText) || 0));
  const minute = Math.min(59, Math.max(0, Number(minuteText) || 0));

  if (rule.mode === "daily") return `${minute} ${hour} * * *`;
  if (rule.mode === "monthly") {
    const monthDay = Math.min(31, Math.max(1, rule.monthDay || 1));
    return `${minute} ${hour} ${monthDay} * *`;
  }

  const weekdays = FRIENDLY_WEEKDAY_ORDER.filter((day) =>
    rule.weekdays.includes(day),
  );
  const weekdayExpr =
    weekdays.join(",") === "1,2,3,4,5" ? "1-5" : weekdays.join(",");
  return `${minute} ${hour} * * ${weekdayExpr || "1-5"}`;
}

// Icons as inline SVGs
const Icons = {
  clock: (
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
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  play: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  ),
  pause: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="4" width="4" height="16" />
      <rect x="14" y="4" width="4" height="16" />
    </svg>
  ),
  edit: (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  ),
  trash: (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  ),
  plus: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  ),
  check: (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  x: (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  calendar: (
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
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
  repeat: (
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
      <polyline points="17 1 21 5 17 9" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <polyline points="7 23 3 19 7 15" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  ),
  chevronDown: (
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
      <polyline points="6 9 12 15 18 9" />
    </svg>
  ),
  zap: (
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
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  ),
  activity: (
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
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  ),
  send: (
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
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  ),
};

function describeSchedule(schedule: CronSchedule): string {
  switch (schedule.kind) {
    case "at": {
      const date = new Date(schedule.atMs);
      return translate("scheduled.schedule.onceAt", "Once at {time}", {
        time: date.toLocaleString(),
      });
    }
    case "every": {
      const ms = schedule.everyMs;
      if (ms >= 86400000) {
        const days = Math.round(ms / 86400000);
        return translate(
          "scheduled.schedule.everyDays",
          "Every {count} day(s)",
          { count: days },
        );
      }
      if (ms >= 3600000) {
        const hours = Math.round(ms / 3600000);
        return translate(
          "scheduled.schedule.everyHours",
          "Every {count} hour(s)",
          { count: hours },
        );
      }
      if (ms >= 60000) {
        const minutes = Math.round(ms / 60000);
        return translate(
          "scheduled.schedule.everyMinutes",
          "Every {count} minute(s)",
          { count: minutes },
        );
      }
      return translate(
        "scheduled.schedule.everySeconds",
        "Every {count} seconds",
        { count: Math.round(ms / 1000) },
      );
    }
    case "cron": {
      // Try to find a matching preset for friendly name
      const preset = CRON_PRESETS.find((p) => p.value === schedule.expr);
      return preset
        ? translate(`scheduled.cronPreset.${preset.value}.label`, preset.label)
        : schedule.expr;
    }
  }
}

function getScheduleIcon(schedule: CronSchedule) {
  if (schedule.kind === "at") return Icons.calendar;
  return Icons.repeat;
}

function formatRelativeTime(ms: number): string {
  const now = Date.now();
  const diff = ms - now;
  const absDiff = Math.abs(diff);
  const isPast = diff < 0;

  if (absDiff < 60000) {
    return isPast
      ? translate("scheduled.time.justNow", "just now")
      : translate("scheduled.time.inUnderMinute", "in < 1 min");
  }
  if (absDiff < 3600000) {
    const minutes = Math.round(absDiff / 60000);
    return isPast
      ? translate("scheduled.time.minutesAgo", "{count}m ago", {
          count: minutes,
        })
      : translate("scheduled.time.inMinutes", "in {count}m", {
          count: minutes,
        });
  }
  if (absDiff < 86400000) {
    const hours = Math.round(absDiff / 3600000);
    return isPast
      ? translate("scheduled.time.hoursAgo", "{count}h ago", { count: hours })
      : translate("scheduled.time.inHours", "in {count}h", { count: hours });
  }
  const days = Math.round(absDiff / 86400000);
  return isPast
    ? translate("scheduled.time.daysAgo", "{count}d ago", { count: days })
    : translate("scheduled.time.inDays", "in {count}d", { count: days });
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.round((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

function formatStatusLabel(status?: CronJobState["lastStatus"]): string {
  switch (status) {
    case "ok":
      return translate("scheduled.status.completed", "Completed");
    case "partial_success":
      return translate("scheduled.status.partial", "Partial result");
    case "needs_user_action":
      return translate("scheduled.status.needsReply", "Needs reply");
    case "awaiting_approval":
      return translate(
        "scheduled.status.awaitingApproval",
        "Awaiting approval",
      );
    case "resume_available":
      return translate("scheduled.status.resumeAvailable", "Resume available");
    case "error":
      return translate("scheduled.status.failed", "Failed");
    case "skipped":
      return translate("scheduled.status.skipped", "Skipped");
    case "timeout":
      return translate("scheduled.status.timedOut", "Timed out");
    default:
      return translate("scheduled.status.noRunsYet", "No runs yet");
  }
}

function getStatusTone(
  status?: CronJobState["lastStatus"],
): "success" | "warning" | "error" | "muted" {
  if (!status || status === "skipped") return "muted";
  if (status === "ok") return "success";
  if (isWarningLikeLastStatus(status)) return "warning";
  return "error";
}

function getToneColors(tone: "success" | "warning" | "error" | "muted") {
  switch (tone) {
    case "success":
      return {
        bg: "var(--color-success-subtle)",
        fg: "var(--color-success)",
        border: "color-mix(in srgb, var(--color-success) 28%, transparent)",
      };
    case "warning":
      return {
        bg: "var(--color-warning-subtle)",
        fg: "var(--color-warning)",
        border: "color-mix(in srgb, var(--color-warning) 30%, transparent)",
      };
    case "error":
      return {
        bg: "var(--color-error-subtle)",
        fg: "var(--color-error)",
        border: "color-mix(in srgb, var(--color-error) 30%, transparent)",
      };
    default:
      return {
        bg: "var(--color-bg-secondary)",
        fg: "var(--color-text-muted)",
        border: "var(--color-border-subtle)",
      };
  }
}

function getDeliveryLabel(job: CronJob, entry?: CronRunHistoryEntry): string {
  if (!job.delivery?.enabled)
    return translate("scheduled.delivery.off", "Delivery off");
  if (!entry)
    return translate("scheduled.delivery.configured", "Delivery configured");
  if (entry.deliveryStatus === "success") {
    return entry.deliverableStatus === "queued"
      ? translate("scheduled.delivery.queued", "Delivery queued")
      : translate("scheduled.delivery.delivered", "Delivered");
  }
  if (entry.deliveryStatus === "failed")
    return translate("scheduled.delivery.failed", "Delivery failed");
  if (entry.deliverableStatus === "queued")
    return translate("scheduled.delivery.queued", "Delivery queued");
  if (entry.deliveryStatus === "skipped")
    return translate("scheduled.delivery.skipped", "Delivery skipped");
  return translate("scheduled.delivery.pending", "Delivery pending");
}

function getDeliveryTone(
  job: CronJob,
  entry?: CronRunHistoryEntry,
): "success" | "warning" | "error" | "muted" {
  if (!job.delivery?.enabled) return "muted";
  if (!entry) return "warning";
  if (entry.deliveryStatus === "success") return "success";
  if (entry.deliveryStatus === "failed") return "error";
  if (
    entry.deliverableStatus === "queued" ||
    entry.deliveryStatus === "skipped"
  )
    return "warning";
  return "warning";
}

function calculateSuccessRate(
  totalRuns?: number,
  successfulRuns?: number,
): number | null {
  if (!totalRuns) return null;
  return Math.round(((successfulRuns ?? 0) / totalRuns) * 100);
}

// Styles
const styles = {
  container: {
    padding: 0,
    maxWidth: "100%",
    width: "100%",
  } as React.CSSProperties,
  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
    gap: "12px",
    marginBottom: "24px",
  } as React.CSSProperties,
  statCard: {
    backgroundColor: "var(--color-bg-glass)",
    border: "1px solid var(--color-border-subtle)",
    borderRadius: "var(--radius-md)",
    padding: "16px",
    display: "flex",
    flexDirection: "column" as const,
    gap: "4px",
  } as React.CSSProperties,
  statLabel: {
    fontSize: "12px",
    color: "var(--color-text-muted)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.5px",
  } as React.CSSProperties,
  statValue: {
    fontSize: "24px",
    fontWeight: 600,
    color: "var(--color-text-primary)",
  } as React.CSSProperties,
  statHint: {
    fontSize: "12px",
    color: "var(--color-text-muted)",
    minHeight: "16px",
  } as React.CSSProperties,
  jobCard: {
    backgroundColor: "var(--color-bg-primary)",
    border: "1px solid var(--color-border)",
    borderRadius: "14px",
    marginBottom: "14px",
    overflow: "hidden",
    transition: "border-color 0.18s ease, box-shadow 0.18s ease",
  } as React.CSSProperties,
  jobHeader: {
    display: "flex",
    alignItems: "center",
    padding: "18px 20px",
    gap: "14px",
    cursor: "pointer",
  } as React.CSSProperties,
  statusDot: {
    width: "9px",
    height: "9px",
    borderRadius: "50%",
    flexShrink: 0,
  } as React.CSSProperties,
  jobInfo: {
    flex: 1,
    minWidth: 0,
  } as React.CSSProperties,
  jobName: {
    fontSize: "16px",
    fontWeight: 650,
    color: "var(--color-text-primary)",
    marginBottom: "4px",
    display: "flex",
    alignItems: "center",
    gap: "8px",
  } as React.CSSProperties,
  jobMeta: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    fontSize: "13px",
    color: "var(--color-text-muted)",
  } as React.CSSProperties,
  scheduleTag: {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    padding: 0,
    fontSize: "12px",
  } as React.CSSProperties,
  nextRun: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    padding: "7px 11px",
    backgroundColor: "var(--color-accent-subtle)",
    color: "var(--color-accent)",
    borderRadius: "9px",
    fontSize: "13px",
    fontWeight: 500,
  } as React.CSSProperties,
  actions: {
    display: "flex",
    gap: "4px",
  } as React.CSSProperties,
  actionBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "36px",
    height: "36px",
    padding: 0,
    backgroundColor: "transparent",
    border: "1px solid var(--color-border-subtle)",
    borderRadius: "9px",
    color: "var(--color-text-secondary)",
    cursor: "pointer",
    transition: "all 0.15s ease",
  } as React.CSSProperties,
  expandedContent: {
    borderTop: "1px solid var(--color-border)",
    padding: "20px",
    backgroundColor: "var(--color-bg-secondary)",
  } as React.CSSProperties,
  runResults: {
    display: "grid",
    gridTemplateColumns: "minmax(240px, 0.9fr) minmax(0, 1.4fr)",
    gap: "12px",
    marginBottom: "14px",
  } as React.CSSProperties,
  latestRunPanel: {
    border: "1px solid var(--color-border)",
    borderRadius: "12px",
    backgroundColor: "var(--color-bg-primary)",
    padding: "16px",
    display: "flex",
    flexDirection: "column" as const,
    gap: "12px",
  } as React.CSSProperties,
  panelEyebrow: {
    fontSize: "12px",
    fontWeight: 650,
    color: "var(--color-text-secondary)",
  } as React.CSSProperties,
  latestRunTitle: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
  } as React.CSSProperties,
  resultBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: "5px",
    width: "fit-content",
    padding: "4px 8px",
    borderRadius: "999px",
    border: "1px solid transparent",
    fontSize: "12px",
    fontWeight: 600,
  } as React.CSSProperties,
  resultMetrics: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 0,
  } as React.CSSProperties,
  resultMetric: {
    padding: "4px 12px",
    backgroundColor: "transparent",
    minWidth: 0,
  } as React.CSSProperties,
  resultMetricValue: {
    display: "block",
    fontSize: "20px",
    fontWeight: 650,
    color: "var(--color-text-primary)",
    lineHeight: 1.2,
  } as React.CSSProperties,
  resultMetricLabel: {
    display: "block",
    marginTop: "3px",
    fontSize: "11px",
    color: "var(--color-text-muted)",
  } as React.CSSProperties,
  runHistoryPanel: {
    border: "1px solid var(--color-border)",
    borderRadius: "12px",
    backgroundColor: "var(--color-bg-primary)",
    overflow: "hidden",
  } as React.CSSProperties,
  runHistoryHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    padding: "14px 16px",
    borderBottom: "1px solid var(--color-border)",
  } as React.CSSProperties,
  runHistoryList: {
    display: "flex",
    flexDirection: "column" as const,
    maxHeight: "280px",
    overflow: "auto",
  } as React.CSSProperties,
  runHistoryRow: {
    display: "grid",
    gridTemplateColumns:
      "minmax(92px, 0.6fr) minmax(90px, 0.7fr) minmax(100px, 0.8fr) minmax(0, 1.2fr) auto",
    alignItems: "center",
    gap: "10px",
    padding: "11px 16px",
    borderBottom: "1px solid var(--color-border-subtle)",
    fontSize: "12px",
  } as React.CSSProperties,
  runHistoryCell: {
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
    color: "var(--color-text-secondary)",
  } as React.CSSProperties,
  inlineTextButton: {
    border: "1px solid var(--color-border)",
    backgroundColor: "var(--color-bg-primary)",
    color: "var(--color-text-secondary)",
    borderRadius: "8px",
    padding: "6px 9px",
    fontSize: "12px",
    cursor: "pointer",
  } as React.CSSProperties,
  detailGrid: {
    display: "grid",
    gridTemplateColumns: "120px 1fr",
    gap: "12px 18px",
    fontSize: "13px",
    padding: "16px",
    border: "1px solid var(--color-border)",
    borderRadius: "12px",
    backgroundColor: "var(--color-bg-primary)",
  } as React.CSSProperties,
  detailLabel: {
    color: "var(--color-text-muted)",
  } as React.CSSProperties,
  detailValue: {
    color: "var(--color-text-primary)",
    wordBreak: "break-word" as const,
  } as React.CSSProperties,
  emptyState: {
    textAlign: "center" as const,
    padding: "60px 20px",
    color: "var(--color-text-muted)",
  } as React.CSSProperties,
  emptyIcon: {
    width: "64px",
    height: "64px",
    margin: "0 auto 16px",
    opacity: 0.3,
  } as React.CSSProperties,
  emptyTitle: {
    fontSize: "18px",
    fontWeight: 500,
    color: "var(--color-text-secondary)",
    marginBottom: "8px",
  } as React.CSSProperties,
  emptyDesc: {
    fontSize: "14px",
    maxWidth: "400px",
    margin: "0 auto",
  } as React.CSSProperties,
  errorBanner: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "12px 16px",
    backgroundColor: "var(--color-error-subtle)",
    border: "1px solid var(--color-error)",
    borderRadius: "var(--radius-md)",
    marginBottom: "16px",
    color: "var(--color-error)",
    fontSize: "14px",
  } as React.CSSProperties,
  lastRunBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
    padding: "2px 6px",
    borderRadius: "4px",
    fontSize: "11px",
    fontWeight: 500,
  } as React.CSSProperties,
};

interface ScheduledTasksSettingsProps {
  onOpenTask?: (taskId: string) => void;
  embedded?: boolean;
  templates?: ScheduledTaskTemplate[];
}

export function ScheduledTasksSettings({
  onOpenTask,
  embedded = false,
  templates = [],
}: ScheduledTasksSettingsProps) {
  useLanguage();
  const [status, setStatus] = useState<CronStatusSummary | null>(null);
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingJob, setEditingJob] = useState<CronJob | null>(null);
  const [selectedTemplate, setSelectedTemplate] =
    useState<ScheduledTaskTemplate | null>(null);
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [showAllTemplates, setShowAllTemplates] = useState(false);
  const [runHistoryByJobId, setRunHistoryByJobId] = useState<
    Record<string, CronRunHistoryResult>
  >({});
  const [historyLoadingJobId, setHistoryLoadingJobId] = useState<string | null>(
    null,
  );

  const loadData = useCallback(async () => {
    if (!window.electronAPI?.getCronStatus) {
      setStatus({
        enabled: false,
        storePath: "",
        jobCount: 0,
        enabledJobCount: 0,
        runningJobCount: 0,
        nextWakeAtMs: null,
      });
      setJobs([]);
      setWorkspaces([]);
      setError(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const [statusResult, jobsResult, workspacesResult] = await Promise.all([
        window.electronAPI.getCronStatus(),
        window.electronAPI.listCronJobs({ includeDisabled: true }),
        window.electronAPI.listWorkspaces(),
      ]);
      setStatus(statusResult);
      setJobs(jobsResult);
      setWorkspaces(workspacesResult);
      setRunHistoryByJobId((prev) => {
        const next = { ...prev };
        for (const job of jobsResult) {
          if (next[job.id]) {
            next[job.id] = {
              jobId: job.id,
              jobName: job.name,
              entries: job.state.runHistory ?? next[job.id].entries,
              totalRuns: job.state.totalRuns ?? next[job.id].totalRuns,
              successfulRuns:
                job.state.successfulRuns ?? next[job.id].successfulRuns,
              failedRuns: job.state.failedRuns ?? next[job.id].failedRuns,
            };
          }
        }
        return next;
      });
    } catch (err: Any) {
      setError(
        err.message ||
          translate("scheduled.error.load", "Failed to load scheduled tasks"),
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const loadRunHistory = useCallback(
    async (job: CronJob, force = false) => {
      if (!force && runHistoryByJobId[job.id]) return;
      try {
        setHistoryLoadingJobId(job.id);
        const history = await window.electronAPI.getCronRunHistory(job.id);
        setRunHistoryByJobId((prev) => ({
          ...prev,
          [job.id]: history ?? {
            jobId: job.id,
            jobName: job.name,
            entries: job.state.runHistory ?? [],
            totalRuns: job.state.totalRuns ?? 0,
            successfulRuns: job.state.successfulRuns ?? 0,
            failedRuns: job.state.failedRuns ?? 0,
          },
        }));
      } catch (err: Any) {
        setError(
          err.message ||
            translate(
              "scheduled.error.loadRunHistory",
              "Failed to load run history",
            ),
        );
      } finally {
        setHistoryLoadingJobId((current) =>
          current === job.id ? null : current,
        );
      }
    },
    [runHistoryByJobId],
  );

  const handleExpandJob = (job: CronJob) => {
    const nextExpanded = expandedJobId === job.id ? null : job.id;
    setExpandedJobId(nextExpanded);
    if (nextExpanded) {
      void loadRunHistory(job);
    }
  };

  useEffect(() => {
    void loadData();

    // Subscribe to cron events
    if (!window.electronAPI?.onCronEvent) return;
    const unsubscribe = window.electronAPI.onCronEvent((event) => {
      logger.info("Cron event:", event);
      void loadData();
    });

    return unsubscribe;
  }, [loadData]);

  const handleToggleJob = async (job: CronJob, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const result = await window.electronAPI.updateCronJob(job.id, {
        enabled: !job.enabled,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      await loadData();
    } catch (err: Any) {
      setError(err.message);
    }
  };

  const handleDeleteJob = async (job: CronJob, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Delete "${job.name}"?\n\nThis action cannot be undone.`))
      return;

    try {
      const result = await window.electronAPI.removeCronJob(job.id);
      if (!result.ok) {
        setError(
          (result as Any).error ||
            translate("scheduled.error.delete", "Failed to delete job"),
        );
        return;
      }
      await loadData();
    } catch (err: Any) {
      setError(err.message);
    }
  };

  const handleRunNow = async (job: CronJob, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      setExpandedJobId(job.id);
      const result = await window.electronAPI.runCronJob(job.id, "force");
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (result.ran) {
        logger.info(`Created task: ${result.taskId}`);
      }
      await loadData();
      await loadRunHistory(job, true);
    } catch (err: Any) {
      setError(err.message);
    }
  };

  const handleClearRunHistory = async (job: CronJob) => {
    if (
      !confirm(
        `Clear run history for "${job.name}"?\n\nThis only clears the scheduled task history, not task sessions.`,
      )
    ) {
      return;
    }
    try {
      const ok = await window.electronAPI.clearCronRunHistory(job.id);
      if (!ok) {
        setError(
          translate(
            "scheduled.error.clearRunHistory",
            "Failed to clear run history",
          ),
        );
        return;
      }
      setRunHistoryByJobId((prev) => {
        const next = { ...prev };
        next[job.id] = {
          jobId: job.id,
          jobName: job.name,
          entries: [],
          totalRuns: 0,
          successfulRuns: 0,
          failedRuns: 0,
        };
        return next;
      });
      await loadData();
    } catch (err: Any) {
      setError(
        err.message ||
          translate(
            "scheduled.error.clearRunHistory",
            "Failed to clear run history",
          ),
      );
    }
  };

  const handleEditJob = (job: CronJob, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingJob(job);
    setSelectedTemplate(null);
    setShowCreateModal(true);
  };

  if (loading) {
    return (
      <div className="settings-loading">
        {translate("scheduled.loading", "Loading scheduled tasks...")}
      </div>
    );
  }

  const lastRunJob = jobs.reduce<CronJob | null>((latest, job) => {
    if (!job.state.lastRunAtMs) return latest;
    if (!latest || !latest.state.lastRunAtMs) return job;
    return job.state.lastRunAtMs > latest.state.lastRunAtMs ? job : latest;
  }, null);
  const runStats = jobs.reduce(
    (acc, job) => {
      acc.totalRuns += job.state.totalRuns ?? 0;
      acc.successfulRuns += job.state.successfulRuns ?? 0;
      acc.failedRuns += job.state.failedRuns ?? 0;
      if (
        job.state.lastStatus === "error" ||
        job.state.lastStatus === "timeout" ||
        isWarningLikeLastStatus(job.state.lastStatus)
      ) {
        acc.needsAttention += 1;
      }
      return acc;
    },
    { totalRuns: 0, successfulRuns: 0, failedRuns: 0, needsAttention: 0 },
  );
  const aggregateSuccessRate = calculateSuccessRate(
    runStats.totalRuns,
    runStats.successfulRuns,
  );

  return (
    <div
      className={`automation-page scheduled-tasks-page${embedded ? " scheduled-tasks-page--embedded" : ""}`}
      style={styles.container}
    >
      <div className="settings-section automation-page-intro">
        <div className="automation-page-header">
          <div className="automation-page-heading">
            <h3>
              {embedded
                ? translate(
                    "generated.components.scheduledtaskssettings.1290.62",
                    "my automation",
                  )
                : translate("scheduled.title", "Scheduled Tasks")}
            </h3>
            <p className="settings-description">
              {embedded
                ? translate(
                    "generated.components.scheduledtaskssettings.1295.63",
                    "View and manage created automation tasks.",
                  )
                : translate(
                    "scheduled.description",
                    "Automate tasks to run on a schedule. Results appear in your workspace.",
                  )}
            </p>
          </div>
          <button
            className="button-secondary button-with-icon automation-create-button"
            onClick={() => {
              setEditingJob(null);
              setSelectedTemplate(null);
              setShowCreateModal(true);
            }}
          >
            {Icons.plus}
            <span>
              {embedded
                ? translate(
                    "generated.components.scheduledtaskssettings.1313.64",
                    "New automation",
                  )
                : translate("scheduled.newTask", "New Scheduled Task")}
            </span>
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div style={styles.errorBanner}>
          {Icons.x}
          <span style={{ flex: 1 }}>{error}</span>
          <button
            onClick={() => setError(null)}
            style={{
              background: "none",
              border: "none",
              color: "inherit",
              cursor: "pointer",
              padding: "4px",
            }}
          >
            {Icons.x}
          </button>
        </div>
      )}

      {/* Stats Cards */}
      {!embedded && (
        <div className="automation-metrics" style={styles.statsGrid}>
          <div className="automation-metric" style={styles.statCard}>
            <span style={styles.statLabel}>
              {translate("scheduled.stats.scheduled", "Scheduled")}
            </span>
            <span style={styles.statValue}>{status?.jobCount || 0}</span>
            <span style={styles.statHint}>
              {translate("scheduled.stats.activeCount", "{count} active", {
                count: status?.enabledJobCount || 0,
              })}
            </span>
          </div>
          <div className="automation-metric" style={styles.statCard}>
            <span style={styles.statLabel}>
              {translate("scheduled.stats.runSuccess", "Run Success")}
            </span>
            <span
              style={{ ...styles.statValue, color: "var(--color-success)" }}
            >
              {aggregateSuccessRate === null ? "-" : `${aggregateSuccessRate}%`}
            </span>
            <span style={styles.statHint}>
              {translate(
                "scheduled.stats.successFailure",
                "{ok} ok / {failed} failed",
                {
                  ok: runStats.successfulRuns,
                  failed: runStats.failedRuns,
                },
              )}
            </span>
          </div>
          <div className="automation-metric" style={styles.statCard}>
            <span style={styles.statLabel}>
              {translate("scheduled.stats.nextRun", "Next Run")}
            </span>
            <span style={{ ...styles.statValue, fontSize: "16px" }}>
              {status?.nextWakeAtMs
                ? formatRelativeTime(status.nextWakeAtMs)
                : "-"}
            </span>
            <span style={styles.statHint}>
              {status?.runningJobCount
                ? translate(
                    "scheduled.stats.runningNow",
                    "{count} running now",
                    { count: status.runningJobCount },
                  )
                : translate("scheduled.stats.noActiveRun", "No active run")}
            </span>
          </div>
          <div className="automation-metric" style={styles.statCard}>
            <span style={styles.statLabel}>
              {translate("scheduled.stats.attention", "Attention")}
            </span>
            <span
              style={{
                ...styles.statValue,
                color: runStats.needsAttention
                  ? "var(--color-warning)"
                  : "var(--color-text-primary)",
              }}
            >
              {runStats.needsAttention}
            </span>
            <span style={styles.statHint}>
              {lastRunJob?.state.lastRunAtMs
                ? translate("scheduled.stats.lastRun", "Last run {time}", {
                    time: formatRelativeTime(lastRunJob.state.lastRunAtMs),
                  })
                : translate("scheduled.status.noRunsYet", "No runs yet")}
            </span>
          </div>
        </div>
      )}

      {/* Jobs List */}
      {jobs.length === 0 ? (
        <div className="scheduled-empty-state" style={styles.emptyState}>
          <div style={styles.emptyIcon}>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>
          <div style={styles.emptyTitle}>
            {embedded
              ? translate(
                  "generated.components.scheduledtaskssettings.1434.65",
                  "There are no automated tasks yet",
                )
              : translate("scheduled.empty.title", "No scheduled tasks yet")}
          </div>
          <div style={styles.emptyDesc}>
            {embedded
              ? translate(
                  "generated.components.scheduledtaskssettings.1439.66",
                  "After creation, NeoWorker will complete the work according to the set time and save the results in the corresponding workspace.",
                )
              : translate(
                  "scheduled.empty.description",
                  "Create a scheduled task to automatically run prompts on a schedule. Great for daily reports, periodic checks, and automated workflows.",
                )}
          </div>
          {embedded && (
            <button
              type="button"
              className="button-secondary button-with-icon scheduled-empty-create"
              onClick={() => {
                setEditingJob(null);
                setSelectedTemplate(null);
                setShowCreateModal(true);
              }}
            >
              {Icons.plus}
              {translate(
                "generated.components.scheduledtaskssettings.1456.67",
                "New automation",
              )}
            </button>
          )}
        </div>
      ) : (
        <div>
          {jobs.map((job) => {
            const isExpanded = expandedJobId === job.id;
            const workspace = workspaces.find((w) => w.id === job.workspaceId);
            const lastStatus = job.state.lastStatus;
            const isInboxAutomation = Boolean(
              job.description?.includes("mailbox-automation:"),
            );
            const threadMatch = job.description?.match(/thread:([^·]+)/i);
            const threadId = threadMatch?.[1]?.trim();
            const runHistory = runHistoryByJobId[job.id] ?? {
              jobId: job.id,
              jobName: job.name,
              entries: job.state.runHistory ?? [],
              totalRuns: job.state.totalRuns ?? 0,
              successfulRuns: job.state.successfulRuns ?? 0,
              failedRuns: job.state.failedRuns ?? 0,
            };
            const latestRun = runHistory.entries[0];
            const successRate = calculateSuccessRate(
              runHistory.totalRuns,
              runHistory.successfulRuns,
            );
            const latestTone = getStatusTone(latestRun?.status ?? lastStatus);
            const latestToneColors = getToneColors(latestTone);
            const deliveryToneColors = getToneColors(
              getDeliveryTone(job, latestRun),
            );

            return (
              <div
                key={job.id}
                className="scheduled-job-card"
                style={{
                  ...styles.jobCard,
                  borderColor: job.enabled
                    ? "var(--color-border-subtle)"
                    : "transparent",
                  opacity: job.enabled ? 1 : 0.6,
                }}
              >
                {/* Job Header */}
                <div
                  className="scheduled-job-header"
                  style={styles.jobHeader}
                  onClick={() => handleExpandJob(job)}
                >
                  {/* Status Indicator */}
                  <div
                    className="scheduled-job-status"
                    style={{
                      ...styles.statusDot,
                      backgroundColor: !job.enabled
                        ? "var(--color-text-muted)"
                        : job.state.runningAtMs
                          ? "var(--color-warning)"
                          : lastStatus === "error"
                            ? "var(--color-error)"
                            : isWarningLikeLastStatus(lastStatus)
                              ? "var(--color-warning)"
                              : "var(--color-success)",
                      boxShadow:
                        job.enabled && !job.state.runningAtMs
                          ? `0 0 8px ${
                              lastStatus === "error"
                                ? "var(--color-error)"
                                : isWarningLikeLastStatus(lastStatus)
                                  ? "var(--color-warning)"
                                  : "var(--color-success)"
                            }`
                          : "none",
                    }}
                  />

                  {/* Job Info */}
                  <div className="scheduled-job-info" style={styles.jobInfo}>
                    <div className="scheduled-job-name" style={styles.jobName}>
                      <span>{job.name}</span>
                      {lastStatus && (
                        <span
                          style={{
                            ...styles.lastRunBadge,
                            backgroundColor:
                              lastStatus === "ok"
                                ? "var(--color-success-subtle)"
                                : isWarningLikeLastStatus(lastStatus)
                                  ? "var(--color-warning-subtle)"
                                  : "var(--color-error-subtle)",
                            color:
                              lastStatus === "ok"
                                ? "var(--color-success)"
                                : isWarningLikeLastStatus(lastStatus)
                                  ? "var(--color-warning)"
                                  : "var(--color-error)",
                          }}
                        >
                          {lastStatus === "ok"
                            ? Icons.check
                            : isWarningLikeLastStatus(lastStatus)
                              ? Icons.clock
                              : Icons.x}
                          {formatStatusLabel(lastStatus)}
                        </span>
                      )}
                    </div>
                    <div className="scheduled-job-meta" style={styles.jobMeta}>
                      <span className="scheduled-job-schedule" style={styles.scheduleTag}>
                        {getScheduleIcon(job.schedule)}
                        {describeSchedule(job.schedule)}
                      </span>
                      {isInboxAutomation && (
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                            padding: "2px 8px",
                            borderRadius: "999px",
                            backgroundColor: "var(--color-accent-subtle)",
                            color: "var(--color-accent)",
                            fontSize: "12px",
                            fontWeight: 600,
                          }}
                        >
                          {translate("sidebar.inbox", "Inbox")}
                        </span>
                      )}
                      {workspace && (
                        <span style={{ opacity: 0.7 }}>{workspace.name}</span>
                      )}
                    </div>
                  </div>

                  {/* Next Run */}
                  {job.enabled && job.state.nextRunAtMs && (
                    <div className="scheduled-job-next-run" style={styles.nextRun}>
                      {Icons.zap}
                      <span>{formatRelativeTime(job.state.nextRunAtMs)}</span>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="scheduled-job-actions" style={styles.actions}>
                    <button
                      className="scheduled-job-action scheduled-job-action-toggle"
                      style={{
                        ...styles.actionBtn,
                        backgroundColor: job.enabled
                          ? "var(--color-success-subtle)"
                          : "transparent",
                        color: job.enabled
                          ? "var(--color-success)"
                          : "var(--color-text-muted)",
                      }}
                      onClick={(e) => handleToggleJob(job, e)}
                      title={
                        job.enabled
                          ? translate("common.disable", "Disable")
                          : translate("common.enable", "Enable")
                      }
                    >
                      {job.enabled ? Icons.pause : Icons.play}
                    </button>
                    <button
                      className="scheduled-job-action"
                      style={styles.actionBtn}
                      onClick={(e) => handleRunNow(job, e)}
                      title={translate("scheduled.actions.runNow", "Run now")}
                    >
                      {Icons.play}
                    </button>
                    <button
                      className="scheduled-job-action"
                      style={styles.actionBtn}
                      onClick={(e) => handleEditJob(job, e)}
                      title={translate("common.edit", "Edit")}
                    >
                      {Icons.edit}
                    </button>
                    <button
                      className="scheduled-job-action scheduled-job-action-delete"
                      style={{
                        ...styles.actionBtn,
                        color: "var(--color-error)",
                      }}
                      onClick={(e) => handleDeleteJob(job, e)}
                      title={translate("common.delete", "Delete")}
                    >
                      {Icons.trash}
                    </button>
                  </div>

                  {/* Expand Arrow */}
                  <span
                    className="scheduled-job-chevron"
                    style={{
                      color: "var(--color-text-muted)",
                      transform: isExpanded ? "rotate(180deg)" : "rotate(0)",
                      transition: "transform 0.2s ease",
                    }}
                  >
                    {Icons.chevronDown}
                  </span>
                </div>

                {/* Expanded Content */}
                {isExpanded && (
                  <div className="scheduled-job-expanded" style={styles.expandedContent}>
                    <div className="scheduled-job-summary-grid" style={styles.runResults}>
                      <div className="scheduled-job-panel scheduled-job-latest-panel" style={styles.latestRunPanel}>
                        <div style={styles.latestRunTitle}>
                          <span style={styles.panelEyebrow}>
                            {translate(
                              "scheduled.latestResult",
                              "Latest result",
                            )}
                          </span>
                          <span
                            style={{
                              ...styles.resultBadge,
                              backgroundColor: latestToneColors.bg,
                              color: latestToneColors.fg,
                              borderColor: latestToneColors.border,
                            }}
                          >
                            {latestTone === "success"
                              ? Icons.check
                              : latestTone === "warning"
                                ? Icons.clock
                                : latestTone === "error"
                                  ? Icons.x
                                  : Icons.activity}
                            {formatStatusLabel(latestRun?.status ?? lastStatus)}
                          </span>
                        </div>
                        <div className="scheduled-job-result-metrics" style={styles.resultMetrics}>
                          <div className="scheduled-job-result-metric" style={styles.resultMetric}>
                            <span style={styles.resultMetricValue}>
                              {runHistory.totalRuns || 0}
                            </span>
                            <span style={styles.resultMetricLabel}>
                              {translate(
                                "scheduled.metrics.totalRuns",
                                "Total runs",
                              )}
                            </span>
                          </div>
                          <div className="scheduled-job-result-metric" style={styles.resultMetric}>
                            <span style={styles.resultMetricValue}>
                              {successRate === null ? "-" : `${successRate}%`}
                            </span>
                            <span style={styles.resultMetricLabel}>
                              {translate(
                                "scheduled.metrics.successRate",
                                "Success rate",
                              )}
                            </span>
                          </div>
                          <div className="scheduled-job-result-metric" style={styles.resultMetric}>
                            <span style={styles.resultMetricValue}>
                              {latestRun?.durationMs
                                ? formatDuration(latestRun.durationMs)
                                : job.state.lastDurationMs
                                  ? formatDuration(job.state.lastDurationMs)
                                  : "-"}
                            </span>
                            <span style={styles.resultMetricLabel}>
                              {translate(
                                "scheduled.metrics.lastDuration",
                                "Last duration",
                              )}
                            </span>
                          </div>
                        </div>
                        <div
                          style={{
                            display: "flex",
                            flexWrap: "wrap",
                            gap: "8px",
                            alignItems: "center",
                          }}
                        >
                          <span
                            style={{
                              ...styles.resultBadge,
                              backgroundColor: deliveryToneColors.bg,
                              color: deliveryToneColors.fg,
                              borderColor: deliveryToneColors.border,
                            }}
                          >
                            {Icons.send}
                            {getDeliveryLabel(job, latestRun)}
                          </span>
                          {latestRun?.runWorkspacePath && (
                            <span
                              title={latestRun.runWorkspacePath}
                              style={{
                                ...styles.resultBadge,
                                backgroundColor: "var(--color-bg-secondary)",
                                color: "var(--color-text-secondary)",
                                borderColor: "var(--color-border-subtle)",
                                maxWidth: "100%",
                              }}
                            >
                              {translate(
                                "scheduled.runFolderSaved",
                                "Run folder saved",
                              )}
                            </span>
                          )}
                        </div>
                        {(latestRun?.error || job.state.lastError) && (
                          <div
                            style={{
                              padding: "10px",
                              borderRadius: "8px",
                              backgroundColor: "var(--color-error-subtle)",
                              color: "var(--color-error)",
                              fontSize: "12px",
                              lineHeight: 1.45,
                            }}
                          >
                            {latestRun?.error || job.state.lastError}
                          </div>
                        )}
                        {onOpenTask &&
                          (latestRun?.taskId || job.state.lastTaskId) && (
                            <button
                              type="button"
                              style={{
                                ...styles.inlineTextButton,
                                alignSelf: "flex-start",
                                color: "var(--color-accent)",
                                borderColor:
                                  "color-mix(in srgb, var(--color-accent) 35%, transparent)",
                              }}
                              onClick={(event) => {
                                event.stopPropagation();
                                onOpenTask?.(
                                  (latestRun?.taskId ||
                                    job.state.lastTaskId) as string,
                                );
                              }}
                            >
                              {translate(
                                "scheduled.openGeneratedTask",
                                "Open generated task",
                              )}
                            </button>
                          )}
                      </div>

                      <div className="scheduled-job-panel scheduled-job-history-panel" style={styles.runHistoryPanel}>
                        <div className="scheduled-job-history-header" style={styles.runHistoryHeader}>
                          <div>
                            <span style={styles.panelEyebrow}>
                              {translate("scheduled.runHistory", "Run history")}
                            </span>
                            <div
                              style={{
                                marginTop: "4px",
                                color: "var(--color-text-muted)",
                                fontSize: "12px",
                              }}
                            >
                              {translate(
                                "scheduled.runHistorySummary",
                                "{completed} completed, {failed} failed",
                                {
                                  completed: runHistory.successfulRuns,
                                  failed: runHistory.failedRuns,
                                },
                              )}
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: "8px" }}>
                            <button
                              type="button"
                              style={styles.inlineTextButton}
                              onClick={(event) => {
                                event.stopPropagation();
                                void loadRunHistory(job, true);
                              }}
                            >
                              {translate("common.refresh", "Refresh")}
                            </button>
                            {runHistory.entries.length > 0 && (
                              <button
                                type="button"
                                style={styles.inlineTextButton}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void handleClearRunHistory(job);
                                }}
                              >
                                {translate("common.clear", "Clear")}
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="scheduled-job-history-list" style={styles.runHistoryList}>
                          {historyLoadingJobId === job.id &&
                          runHistory.entries.length === 0 ? (
                            <div
                              style={{
                                padding: "18px 14px",
                                color: "var(--color-text-muted)",
                                fontSize: "13px",
                              }}
                            >
                              {translate(
                                "scheduled.loadingRunHistory",
                                "Loading run history...",
                              )}
                            </div>
                          ) : runHistory.entries.length === 0 ? (
                            <div
                              style={{
                                padding: "18px 14px",
                                color: "var(--color-text-muted)",
                                fontSize: "13px",
                              }}
                            >
                              {translate(
                                "scheduled.noFinishedRuns",
                                "No automated runs have finished yet.",
                              )}
                            </div>
                          ) : (
                            runHistory.entries.slice(0, 8).map((entry) => {
                              const rowToneColors = getToneColors(
                                getStatusTone(entry.status),
                              );
                              const rowDeliveryColors = getToneColors(
                                getDeliveryTone(job, entry),
                              );
                              return (
                                <div
                                  key={`${entry.runAtMs}-${entry.taskId || entry.status}`}
                                  className="scheduled-job-history-row"
                                  style={styles.runHistoryRow}
                                >
                                  <span style={styles.runHistoryCell}>
                                    {formatRelativeTime(entry.runAtMs)}
                                  </span>
                                  <span
                                    style={{
                                      ...styles.resultBadge,
                                      backgroundColor: rowToneColors.bg,
                                      color: rowToneColors.fg,
                                      borderColor: rowToneColors.border,
                                    }}
                                  >
                                    {formatStatusLabel(entry.status)}
                                  </span>
                                  <span style={styles.runHistoryCell}>
                                    {formatDuration(entry.durationMs)}
                                  </span>
                                  <span
                                    style={{
                                      ...styles.resultBadge,
                                      backgroundColor: rowDeliveryColors.bg,
                                      color: rowDeliveryColors.fg,
                                      borderColor: rowDeliveryColors.border,
                                    }}
                                    title={entry.deliveryError}
                                  >
                                    {getDeliveryLabel(job, entry)}
                                  </span>
                                  {entry.taskId && onOpenTask ? (
                                    <button
                                      type="button"
                                      style={styles.inlineTextButton}
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        onOpenTask?.(entry.taskId as string);
                                      }}
                                    >
                                      {translate("common.open", "Open")}
                                    </button>
                                  ) : (
                                    <span
                                      style={{
                                        ...styles.runHistoryCell,
                                        color: "var(--color-text-muted)",
                                      }}
                                    >
                                      {translate("scheduled.noTask", "No task")}
                                    </span>
                                  )}
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    </div>

                    {isInboxAutomation && (
                      <div
                        style={{
                          marginBottom: "16px",
                          padding: "12px",
                          backgroundColor: "var(--color-accent-subtle)",
                          borderRadius: "6px",
                          fontSize: "13px",
                          color: "var(--color-text-secondary)",
                        }}
                      >
                        {translate(
                          "scheduled.inboxAutomation",
                          "Inbox automation",
                        )}
                        {threadId
                          ? translate(
                              "scheduled.threadSuffix",
                              " · Thread {threadId}",
                              { threadId },
                            )
                          : ""}
                      </div>
                    )}
                    {job.runMode === "thread_follow_up" && (
                      <div
                        style={{
                          marginBottom: "16px",
                          padding: "12px",
                          backgroundColor: "var(--color-accent-subtle)",
                          borderRadius: "6px",
                          fontSize: "13px",
                          color: "var(--color-text-secondary)",
                        }}
                      >
                        {translate(
                          "scheduled.threadAutomation",
                          "Thread automation",
                        )}
                        {job.targetTaskId
                          ? translate(
                              "scheduled.continuesTaskSuffix",
                              " · Continues task {taskId}",
                              { taskId: job.targetTaskId },
                            )
                          : ""}
                      </div>
                    )}
                    {job.description && (
                      <div
                        style={{
                          marginBottom: "16px",
                          padding: "12px",
                          backgroundColor: "var(--color-bg-glass)",
                          borderRadius: "6px",
                          fontSize: "13px",
                          color: "var(--color-text-secondary)",
                        }}
                      >
                        {job.description}
                      </div>
                    )}

                    <div className="scheduled-job-detail-grid" style={styles.detailGrid}>
                      <span style={styles.detailLabel}>
                        {translate("common.workspace", "Workspace")}
                      </span>
                      <span style={styles.detailValue}>
                        {workspace?.name || job.workspaceId}
                      </span>

                      <span style={styles.detailLabel}>
                        {translate("common.prompt", "Prompt")}
                      </span>
                      <span
                        style={{
                          ...styles.detailValue,
                          fontFamily: "monospace",
                          fontSize: "12px",
                          backgroundColor: "var(--color-bg-glass)",
                          padding: "8px",
                          borderRadius: "4px",
                        }}
                      >
                        {job.taskPrompt}
                      </span>

                      {job.schedule.kind === "cron" && (
                        <>
                          <span style={styles.detailLabel}>
                            {translate(
                              "scheduled.cronExpression",
                              "Cron Expression",
                            )}
                          </span>
                          <span
                            style={{
                              ...styles.detailValue,
                              fontFamily: "monospace",
                            }}
                          >
                            {job.schedule.expr}
                          </span>
                        </>
                      )}

                      <span style={styles.detailLabel}>
                        {translate("common.created", "Created")}
                      </span>
                      <span style={styles.detailValue}>
                        {new Date(job.createdAtMs).toLocaleString()}
                      </span>

                      {job.state.totalRuns !== undefined &&
                        job.state.totalRuns > 0 && (
                          <>
                            <span style={styles.detailLabel}>
                              {translate(
                                "scheduled.metrics.totalRuns",
                                "Total Runs",
                              )}
                            </span>
                            <span style={styles.detailValue}>
                              {job.state.totalRuns}
                            </span>
                          </>
                        )}

                      {job.state.lastRunAtMs && (
                        <>
                          <span style={styles.detailLabel}>
                            {translate("scheduled.lastRun", "Last Run")}
                          </span>
                          <span style={styles.detailValue}>
                            {new Date(job.state.lastRunAtMs).toLocaleString()}
                            {job.state.lastDurationMs && (
                              <span
                                style={{
                                  color: "var(--color-text-muted)",
                                  marginLeft: "8px",
                                }}
                              >
                                ({formatDuration(job.state.lastDurationMs)})
                              </span>
                            )}
                          </span>
                        </>
                      )}

                      {job.state.lastError && (
                        <>
                          <span style={styles.detailLabel}>
                            {translate("scheduled.lastError", "Last Error")}
                          </span>
                          <span
                            style={{
                              ...styles.detailValue,
                              color: "var(--color-error)",
                            }}
                          >
                            {job.state.lastError}
                          </span>
                        </>
                      )}

                      {job.delivery?.enabled && (
                        <>
                          <span style={styles.detailLabel}>
                            {translate("scheduled.delivery.title", "Delivery")}
                          </span>
                          <span style={styles.detailValue}>
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                                padding: "2px 8px",
                                backgroundColor: "var(--color-success-subtle)",
                                color: "var(--color-success)",
                                borderRadius: "4px",
                                fontSize: "12px",
                                fontWeight: 500,
                              }}
                            >
                              {Icons.send}
                              {job.delivery.channelType}
                            </span>
                            <span
                              style={{
                                marginLeft: "8px",
                                fontSize: "12px",
                                color: "var(--color-text-muted)",
                              }}
                            >
                              &rarr; {job.delivery.channelId}
                            </span>
                          </span>
                          <span style={styles.detailLabel}>
                            {translate(
                              "scheduled.delivery.deliverWhen",
                              "Deliver When",
                            )}
                          </span>
                          <span style={styles.detailValue}>
                            {[
                              job.delivery.deliverOnSuccess !== false
                                ? translate(
                                    "scheduled.delivery.onSuccess",
                                    "Success",
                                  )
                                : null,
                              job.delivery.deliverOnError !== false
                                ? translate(
                                    "scheduled.delivery.onError",
                                    "Error",
                                  )
                                : null,
                            ]
                              .filter(Boolean)
                              .join(", ")}
                            {job.delivery.summaryOnly
                              ? translate(
                                  "scheduled.delivery.summaryOnlySuffix",
                                  " (summary only)",
                                )
                              : ""}
                            {job.delivery.deliverOnlyIfResult
                              ? translate(
                                  "scheduled.delivery.onlyIfResultSuffix",
                                  " (only if result)",
                                )
                              : ""}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {templates.length > 0 && (
        <section
          className="scheduled-template-section"
          aria-labelledby="scheduled-template-title"
        >
          <div className="scheduled-template-heading">
            <div>
              <span className="scheduled-template-kicker">
                {translate(
                  "generated.components.scheduledtaskssettings.2202.68",
                  "NeoWorker auto-advance",
                )}
              </span>
              <h4 id="scheduled-template-title">
                {translate(
                  "generated.components.scheduledtaskssettings.2203.69",
                  "Pick something worth continuing to do",
                )}
              </h4>
              <p>
                {translate(
                  "generated.components.scheduledtaskssettings.2204.70",
                  "Once selected just confirm the execution time; the target, inspection method and delivery format are all ready.",
                )}
              </p>
            </div>
          </div>
          <div className="scheduled-template-grid">
            {(showAllTemplates ? templates : templates.slice(0, 6)).map(
              (template) => {
                const TemplateIcon = getTemplateCategoryIcon(template.category);
                return (
                  <button
                    key={template.id}
                    type="button"
                    className="scheduled-template-card"
                    onClick={() => {
                      setEditingJob(null);
                      setSelectedTemplate(template);
                      setShowCreateModal(true);
                    }}
                  >
                    <span
                      className="scheduled-template-icon"
                      aria-hidden="true"
                    >
                      <TemplateIcon size={18} strokeWidth={1.9} />
                    </span>
                    <span className="scheduled-template-copy">
                      <span className="scheduled-template-category">
                        {template.category ||
                          translate(
                            "generated.components.scheduledtaskssettings.2229.71",
                            "Automation",
                          )}
                      </span>
                      <strong>{template.name}</strong>
                      <small>{template.description}</small>
                    </span>
                    <span className="scheduled-template-add">
                      {translate(
                        "generated.components.scheduledtaskssettings.2235.72",
                        "start with this",
                      )}
                      <ArrowRight
                        size={13}
                        strokeWidth={2}
                        aria-hidden="true"
                      />
                    </span>
                  </button>
                );
              },
            )}
          </div>
          {templates.length > 6 && (
            <button
              type="button"
              className="scheduled-template-more"
              onClick={() => setShowAllTemplates((value) => !value)}
            >
              {showAllTemplates
                ? translate(
                    "generated.components.scheduledtaskssettings.2250.73",
                    "Collapse template",
                  )
                : translate(
                    "automations.viewAllTemplates",
                    "View all {count} templates",
                    { count: templates.length },
                  )}
            </button>
          )}
        </section>
      )}

      {/* Create/Edit Modal */}
      {showCreateModal && (
        <JobModal
          job={editingJob}
          template={selectedTemplate}
          workspaces={workspaces}
          onClose={() => {
            setShowCreateModal(false);
            setEditingJob(null);
            setSelectedTemplate(null);
          }}
          onSave={async () => {
            await loadData();
            setShowCreateModal(false);
            setEditingJob(null);
            setSelectedTemplate(null);
          }}
        />
      )}
    </div>
  );
}

interface JobModalProps {
  job: CronJob | null;
  template?: ScheduledTaskTemplate | null;
  workspaces: Workspace[];
  onClose: () => void;
  onSave: () => void;
}

function JobModal({
  job,
  template,
  workspaces,
  onClose,
  onSave,
}: JobModalProps) {
  const language = useLanguage();
  const isEditing = job !== null;
  const agentContext = useAgentContext();

  const [name, setName] = useState(job?.name || template?.name || "");
  const [description] = useState(
    job?.description || template?.description || "",
  );
  const [workspaceId, setWorkspaceId] = useState(
    job?.workspaceId || workspaces[0]?.id || "",
  );
  const [taskPrompt, setTaskPrompt] = useState(
    job?.taskPrompt || template?.taskPrompt || "",
  );
  const [taskTitle, setTaskTitle] = useState(
    job?.taskTitle || template?.taskTitle || "",
  );
  const [enabled, setEnabled] = useState(job?.enabled ?? true);
  const [shellAccess, setShellAccess] = useState(job?.shellAccess ?? false);
  const [allowUserInput, setAllowUserInput] = useState(
    job?.allowUserInput ?? false,
  );
  const [deleteAfterRun, setDeleteAfterRun] = useState(
    job?.deleteAfterRun ?? false,
  );

  // Delivery config
  const [deliveryEnabled, setDeliveryEnabled] = useState(
    job?.delivery?.enabled ?? false,
  );
  const [deliveryChannelDbId, setDeliveryChannelDbId] = useState(
    job?.delivery?.channelDbId || "",
  );
  const [deliveryChannelType, setDeliveryChannelType] = useState(
    job?.delivery?.channelType || "",
  );
  const [deliveryChatId, setDeliveryChatId] = useState(
    job?.delivery?.channelId || "",
  );
  const [deliverOnSuccess, setDeliverOnSuccess] = useState(
    job?.delivery?.deliverOnSuccess ?? true,
  );
  const [deliverOnError, setDeliverOnError] = useState(
    job?.delivery?.deliverOnError ?? true,
  );
  const [summaryOnly, setSummaryOnly] = useState(
    job?.delivery?.summaryOnly ?? false,
  );
  const [deliverOnlyIfResult, setDeliverOnlyIfResult] = useState(
    job?.delivery?.deliverOnlyIfResult ?? false,
  );
  const [deliveryExpanded, setDeliveryExpanded] = useState(
    job?.delivery?.enabled ?? false,
  );
  const [connectedChannels, setConnectedChannels] = useState<
    Array<{
      id: string;
      type: string;
      name: string;
      enabled: boolean;
      status: string;
    }>
  >([]);
  const [knownChatIds, setKnownChatIds] = useState<
    Array<{ chatId: string; lastTimestamp: number }>
  >([]);
  const [testingDelivery, setTestingDelivery] = useState(false);
  const [testDeliveryResult, setTestDeliveryResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  useEffect(() => {
    const loadChannels = async () => {
      try {
        const channels = await window.electronAPI.getGatewayChannels();
        // Show all enabled channels (including disconnected ones) so editing works
        // even when a channel is temporarily offline
        setConnectedChannels(
          channels.filter((c: { enabled: boolean }) => c.enabled),
        );
      } catch (err) {
        logger.error("Failed to load gateway channels:", err);
      }
    };
    loadChannels();
  }, []);

  // Load known chat IDs when selected channel changes
  useEffect(() => {
    if (!deliveryChannelDbId) {
      setKnownChatIds([]);
      return;
    }
    const loadChats = async () => {
      try {
        const chats =
          await window.electronAPI.getGatewayChats(deliveryChannelDbId);
        setKnownChatIds(chats);
      } catch {
        setKnownChatIds([]);
      }
    };
    loadChats();
  }, [deliveryChannelDbId]);

  // Schedule type and values
  const [scheduleType, setScheduleType] = useState<"every" | "cron" | "at">(
    job?.schedule.kind || template?.schedule.kind || "every",
  );
  const [everyMs, setEveryMs] = useState(
    job?.schedule.kind === "every"
      ? job.schedule.everyMs
      : template?.schedule.kind === "every"
        ? template.schedule.everyMs
        : 60 * 60 * 1000,
  );
  const initialCronExpression =
    job?.schedule.kind === "cron"
      ? job.schedule.expr
      : template?.schedule.kind === "cron"
        ? template.schedule.expr
        : "0 9 * * *";
  const initialFriendlyCronRule =
    parseFriendlyCron(initialCronExpression) || DEFAULT_FRIENDLY_CRON_RULE;
  const [cronExpr, setCronExpr] = useState(initialCronExpression);
  const [customCron, setCustomCron] = useState(
    !CRON_PRESETS.some(
      (preset) =>
        preset.value === initialCronExpression,
    ),
  );
  const [friendlyCronMode, setFriendlyCronMode] = useState<FriendlyCronMode>(
    initialFriendlyCronRule.mode,
  );
  const [friendlyCronTime, setFriendlyCronTime] = useState(
    initialFriendlyCronRule.time,
  );
  const [friendlyCronWeekdays, setFriendlyCronWeekdays] = useState<number[]>(
    initialFriendlyCronRule.weekdays,
  );
  const [friendlyCronMonthDay, setFriendlyCronMonthDay] = useState(
    initialFriendlyCronRule.monthDay,
  );
  const [atDateTime, setAtDateTime] = useState(
    job?.schedule.kind === "at"
      ? new Date(job.schedule.atMs).toISOString().slice(0, 16)
      : template?.schedule.kind === "at"
        ? new Date(template.schedule.atMs).toISOString().slice(0, 16)
        : "",
  );
  const initialSimpleScheduleValue = getSimpleScheduleValue(
    job?.schedule || template?.schedule || { kind: "cron", expr: "0 9 * * *" },
  );
  const [simpleSchedule, setSimpleSchedule] = useState(
    initialSimpleScheduleValue || "custom",
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const intervalScheduleOptions: NeoWorkerSelectOption[] =
    SCHEDULE_PRESETS.map((preset) => ({
      value: String(preset.schedule.everyMs),
      label: translate(
        `scheduled.schedulePreset.${preset.label}`,
        preset.label,
      ),
    }));
  const cronScheduleOptions: NeoWorkerSelectOption[] = [
    ...CRON_PRESETS.map((preset) => ({
      value: preset.value,
      label: translate(
        `scheduled.cronPreset.${preset.value}.label`,
        preset.label,
      ),
      description: translate(
        `scheduled.cronPreset.${preset.value}.desc`,
        preset.desc,
      ),
    })),
    {
      value: "custom",
      label: translate(
        "scheduled.customRule.menuLabel",
        "Custom time rules",
      ),
      description: translate(
        "scheduled.customRule.menuDescription",
        "Choose a repeat pattern, weekdays, and execution time.",
      ),
    },
  ];
  const workspaceOptions: NeoWorkerSelectOption[] = workspaces.map(
    (workspace) => ({
      value: workspace.id,
      label: workspace.name,
      description: workspace.path,
    }),
  );
  const deliveryChannelOptions: NeoWorkerSelectOption[] = [
    {
      value: "",
      label: translate(
        "generated.components.scheduledtaskssettings.3081.110",
        "Please select a message channel",
      ),
    },
    ...connectedChannels.map((channel) => ({
      value: channel.id,
      label: channel.name,
      description: channel.type,
    })),
  ];

  const friendlyWeekdayOptions = [
    { value: 1, label: translate("scheduled.customRule.weekday.mon", "Mon") },
    { value: 2, label: translate("scheduled.customRule.weekday.tue", "Tue") },
    { value: 3, label: translate("scheduled.customRule.weekday.wed", "Wed") },
    { value: 4, label: translate("scheduled.customRule.weekday.thu", "Thu") },
    { value: 5, label: translate("scheduled.customRule.weekday.fri", "Fri") },
    { value: 6, label: translate("scheduled.customRule.weekday.sat", "Sat") },
    { value: 0, label: translate("scheduled.customRule.weekday.sun", "Sun") },
  ];

  const applyFriendlyCronRule = (rule: FriendlyCronRule) => {
    setFriendlyCronMode(rule.mode);
    setFriendlyCronTime(rule.time);
    setFriendlyCronWeekdays(rule.weekdays);
    setFriendlyCronMonthDay(rule.monthDay);
    setCronExpr(buildFriendlyCron(rule));
    setCustomCron(true);
  };

  const currentFriendlyCronRule: FriendlyCronRule = {
    mode: friendlyCronMode,
    time: friendlyCronTime,
    weekdays: friendlyCronWeekdays,
    monthDay: friendlyCronMonthDay,
  };

  const selectedWeekdayLabels = friendlyWeekdayOptions
    .filter((option) => friendlyCronWeekdays.includes(option.value))
    .map((option) => option.label);
  const weekdaySummary =
    friendlyCronWeekdays.join(",") === "1,2,3,4,5"
      ? translate(
          "scheduled.customRule.weekdays.workdays",
          "Monday to Friday",
        )
      : selectedWeekdayLabels.join(language === "zh-CN" ? "、" : ", ");
  const friendlyCronSummary =
    friendlyCronMode === "daily"
      ? translate(
          "scheduled.customRule.summary.daily",
          "Runs every day at {time}",
          { time: friendlyCronTime },
        )
      : friendlyCronMode === "monthly"
        ? translate(
            "scheduled.customRule.summary.monthly",
            "Runs on day {day} of every month at {time}",
            { day: friendlyCronMonthDay, time: friendlyCronTime },
          )
        : translate(
            "scheduled.customRule.summary.weekly",
            "Runs on {days} at {time}",
            { days: weekdaySummary, time: friendlyCronTime },
          );

  const handleSimpleScheduleChange = (value: string) => {
    setSimpleSchedule(value);
    if (value === "custom") return;
    if (value === "at") {
      setScheduleType("at");
      return;
    }
    if (value.startsWith("cron:")) {
      setScheduleType("cron");
      setCronExpr(value.slice("cron:".length));
      setCustomCron(false);
      return;
    }
    setScheduleType("every");
    setEveryMs(Number(value.slice("every:".length)));
  };

  const handleSave = async () => {
    if (!workspaceId) {
      setError(
        translate(
          "generated.components.scheduledtaskssettings.2466.74",
          "Please select a workspace",
        ),
      );
      return;
    }
    if (!taskPrompt.trim()) {
      setError(
        translate(
          "generated.components.scheduledtaskssettings.2470.75",
          "Please explain what you want to automate",
        ),
      );
      return;
    }

    if (deliveryEnabled) {
      if (!deliveryChannelDbId) {
        setError(
          translate(
            "generated.components.scheduledtaskssettings.2476.76",
            "Please select a messaging channel to use to push results",
          ),
        );
        return;
      }
      if (!deliveryChatId.trim()) {
        setError(
          translate(
            "generated.components.scheduledtaskssettings.2480.77",
            "Please enter target session ID",
          ),
        );
        return;
      }
    }

    let schedule: CronSchedule;
    if (scheduleType === "every") {
      schedule = { kind: "every", everyMs, anchorMs: Date.now() };
    } else if (scheduleType === "cron") {
      schedule = { kind: "cron", expr: cronExpr };
    } else {
      const atMs = new Date(atDateTime).getTime();
      if (isNaN(atMs) || atMs < Date.now()) {
        setError(
          translate(
            "generated.components.scheduledtaskssettings.2493.78",
            "Please select a future date and time",
          ),
        );
        return;
      }
      schedule = { kind: "at", atMs };
    }

    const delivery = deliveryEnabled
      ? {
          enabled: true as const,
          channelType: (deliveryChannelType || undefined) as Any,
          channelDbId: deliveryChannelDbId || undefined,
          channelId: deliveryChatId.trim() || undefined,
          deliverOnSuccess,
          deliverOnError,
          summaryOnly,
          deliverOnlyIfResult,
        }
      : { enabled: false as const };

    try {
      setSaving(true);
      setError(null);
      const automaticName = taskPrompt.trim().replace(/\s+/g, " ").slice(0, 26);
      const resolvedName =
        name.trim() ||
        template?.name ||
        automaticName ||
        translate(
          "generated.components.scheduledtaskssettings.2517.79",
          "Automate tasks",
        );

      if (isEditing && job) {
        const result = await window.electronAPI.updateCronJob(job.id, {
          name: resolvedName,
          description: description.trim() || undefined,
          workspaceId,
          taskPrompt: taskPrompt.trim(),
          taskTitle: taskTitle.trim() || undefined,
          enabled,
          shellAccess,
          allowUserInput,
          deleteAfterRun,
          schedule,
          delivery,
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
      } else {
        const result = await window.electronAPI.addCronJob({
          name: resolvedName,
          description: description.trim() || undefined,
          workspaceId,
          taskPrompt: taskPrompt.trim(),
          taskTitle: taskTitle.trim() || undefined,
          enabled,
          shellAccess,
          allowUserInput,
          deleteAfterRun,
          schedule,
          delivery,
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
      }

      onSave();
    } catch (err: Any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const modalStyles = {
    overlay: {
      position: "fixed" as const,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: "rgba(0, 0, 0, 0.6)",
      backdropFilter: "blur(4px)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 1000,
    },
    content: {
      backgroundColor: "var(--color-bg-elevated)",
      border: "1px solid var(--color-border)",
      borderRadius: "var(--radius-lg)",
      padding: "0",
      width: "680px",
      maxWidth: "90vw",
      maxHeight: "85vh",
      overflow: "auto",
      boxShadow: "var(--shadow-lg)",
    },
    title: {
      fontSize: "20px",
      fontWeight: 600,
      color: "var(--color-text-primary)",
      marginBottom: "0",
      display: "flex",
      alignItems: "center",
      gap: "10px",
    },
    field: {
      marginBottom: "20px",
    },
    label: {
      display: "block",
      marginBottom: "6px",
      fontSize: "13px",
      fontWeight: 500,
      color: "var(--color-text-secondary)",
    },
    input: {
      width: "100%",
      padding: "10px 12px",
      backgroundColor: "var(--color-bg-input)",
      border: "1px solid var(--color-border)",
      borderRadius: "var(--radius-sm)",
      color: "var(--color-text-primary)",
      fontSize: "14px",
      outline: "none",
      transition: "border-color 0.2s",
    },
    textarea: {
      width: "100%",
      padding: "10px 12px",
      backgroundColor: "var(--color-bg-input)",
      border: "1px solid var(--color-border)",
      borderRadius: "var(--radius-sm)",
      color: "var(--color-text-primary)",
      fontSize: "14px",
      outline: "none",
      resize: "vertical" as const,
      minHeight: "100px",
      fontFamily: "inherit",
    },
    select: {
      width: "100%",
      padding: "10px 12px",
      backgroundColor: "var(--color-bg-input)",
      border: "1px solid var(--color-border)",
      borderRadius: "var(--radius-sm)",
      color: "var(--color-text-primary)",
      fontSize: "14px",
      outline: "none",
    },
    scheduleToggle: {
      display: "flex",
      gap: "8px",
      marginBottom: "12px",
    },
    toggleBtn: (active: boolean) => ({
      flex: 1,
      padding: "10px",
      backgroundColor: active
        ? "var(--color-accent-subtle)"
        : "var(--color-bg-glass)",
      border: `1px solid ${active ? "var(--color-accent)" : "var(--color-border-subtle)"}`,
      borderRadius: "var(--radius-sm)",
      color: active ? "var(--color-accent)" : "var(--color-text-secondary)",
      fontSize: "13px",
      fontWeight: 500,
      cursor: "pointer",
      transition: "all 0.15s ease",
    }),
    checkbox: {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      cursor: "pointer",
      fontSize: "14px",
      color: "var(--color-text-secondary)",
    },
    actions: {
      display: "flex",
      gap: "12px",
      justifyContent: "flex-end",
      marginTop: "24px",
      paddingTop: "20px",
      borderTop: "1px solid var(--color-border-subtle)",
    },
    cancelBtn: {
      padding: "10px 20px",
      backgroundColor: "transparent",
      border: "1px solid var(--color-border)",
      borderRadius: "var(--radius-sm)",
      color: "var(--color-text-secondary)",
      fontSize: "14px",
      fontWeight: 500,
      cursor: "pointer",
    },
    saveBtn: {
      padding: "10px 24px",
      backgroundColor: "var(--color-accent)",
      border: "none",
      borderRadius: "var(--radius-sm)",
      color: "#fff",
      fontSize: "14px",
      fontWeight: 600,
      cursor: "pointer",
    },
    error: {
      padding: "10px 12px",
      backgroundColor: "var(--color-error-subtle)",
      border: "1px solid var(--color-error)",
      borderRadius: "var(--radius-sm)",
      color: "var(--color-error)",
      fontSize: "13px",
      marginBottom: "16px",
    },
  };

  return (
    <div
      style={modalStyles.overlay}
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={modalStyles.content}
        className="automation-job-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="automation-job-modal-title"
      >
        <header className="automation-job-modal-header">
          <div>
            <div id="automation-job-modal-title" style={modalStyles.title}>
              <span className="automation-job-modal-icon">{Icons.clock}</span>
              {isEditing
                ? translate(
                    "generated.components.scheduledtaskssettings.2728.80",
                    "Edit automation",
                  )
                : translate(
                    "generated.components.scheduledtaskssettings.2728.81",
                    "New automation",
                  )}
            </div>
            <p>
              {translate(
                "generated.components.scheduledtaskssettings.2730.82",
                "Just explain what is to be done and when.",
              )}
            </p>
          </div>
          <button
            type="button"
            className="automation-job-modal-close"
            onClick={onClose}
            aria-label={translate(
              "generated.components.scheduledtaskssettings.2736.83",
              "Close",
            )}
          >
            {Icons.x}
          </button>
        </header>

        <div className="automation-job-modal-body">
          {error && <div style={modalStyles.error}>{error}</div>}

          <div style={modalStyles.field}>
            <label style={modalStyles.label}>
              {translate(
                "generated.components.scheduledtaskssettings.2746.84",
                "What to automate?",
              )}
            </label>
            <textarea
              value={taskPrompt}
              onChange={(e) => setTaskPrompt(e.target.value)}
              placeholder={translate(
                "generated.components.scheduledtaskssettings.2750.85",
                "For example: Summarize this week's tasks and progress and compile it into a weekly report that can be sent directly to the team.",
              )}
              style={modalStyles.textarea}
            />
            <p className="automation-job-field-help">
              {translate(
                "generated.components.scheduledtaskssettings.2754.86",
                "For example: summarize this week's progress and generate a weekly report that can be sent directly.",
              )}
            </p>
          </div>

          <div style={modalStyles.field}>
            <label style={modalStyles.label}>
              {translate(
                "generated.components.scheduledtaskssettings.2759.87",
                "When will it be executed?",
              )}
            </label>
            <NeoWorkerSelectMenu
              ariaLabel={translate(
                "generated.components.scheduledtaskssettings.2761.88",
                "Select automation execution time",
              )}
              className="automation-job-schedule-select"
              icon={Icons.clock}
              minMenuWidth={340}
              onValueChange={handleSimpleScheduleChange}
              options={SIMPLE_SCHEDULE_OPTIONS}
              value={simpleSchedule}
            />

            {simpleSchedule === "at" && (
              <input
                className="automation-job-schedule-detail"
                type="datetime-local"
                value={atDateTime}
                onChange={(e) => setAtDateTime(e.target.value)}
                style={modalStyles.input}
              />
            )}

            {simpleSchedule === "custom" && (
              <div className="automation-job-custom-schedule">
                <div style={modalStyles.scheduleToggle}>
                  <button
                    type="button"
                    style={modalStyles.toggleBtn(scheduleType === "every")}
                    onClick={() => setScheduleType("every")}
                  >
                    {translate(
                      "generated.components.scheduledtaskssettings.2788.89",
                      "fixed interval",
                    )}
                  </button>
                  <button
                    type="button"
                    style={modalStyles.toggleBtn(scheduleType === "cron")}
                    onClick={() => setScheduleType("cron")}
                  >
                    {translate(
                      "generated.components.scheduledtaskssettings.2795.90",
                      "fixed time",
                    )}
                  </button>
                  <button
                    type="button"
                    style={modalStyles.toggleBtn(scheduleType === "at")}
                    onClick={() => setScheduleType("at")}
                  >
                    {translate(
                      "generated.components.scheduledtaskssettings.2802.91",
                      "Execute only once",
                    )}
                  </button>
                </div>
                {scheduleType === "every" && (
                  <NeoWorkerSelectMenu
                    ariaLabel={translate(
                      "generated.components.scheduledtaskssettings.2761.88",
                      "Select automation execution time",
                    )}
                    className="automation-job-schedule-select automation-job-preset-select"
                    icon={Icons.repeat}
                    minMenuWidth={360}
                    onValueChange={(value) => setEveryMs(Number(value))}
                    options={intervalScheduleOptions}
                    value={String(everyMs)}
                  />
                )}

                {scheduleType === "cron" && (
                  <div>
                    <NeoWorkerSelectMenu
                      ariaLabel={translate(
                        "generated.components.scheduledtaskssettings.2761.88",
                        "Select automation execution time",
                      )}
                      className="automation-job-schedule-select automation-job-preset-select"
                      icon={Icons.calendar}
                      minMenuWidth={430}
                      value={customCron ? "custom" : cronExpr}
                      onValueChange={(value) => {
                        if (value === "custom") {
                          const parsedRule = parseFriendlyCron(cronExpr);
                          applyFriendlyCronRule(
                            parsedRule || DEFAULT_FRIENDLY_CRON_RULE,
                          );
                          return;
                        }
                        setCustomCron(false);
                        setCronExpr(value);
                      }}
                      options={cronScheduleOptions}
                    />
                    {customCron && (
                      <div className="automation-job-friendly-cron">
                        <div className="automation-job-friendly-cron-row">
                          <div className="automation-job-friendly-cron-field automation-job-friendly-cron-repeat">
                            <span className="automation-job-friendly-cron-label">
                              {translate(
                                "scheduled.customRule.repeat",
                                "Repeat",
                              )}
                            </span>
                            <div
                              className="automation-job-friendly-cron-modes"
                              role="group"
                              aria-label={translate(
                                "scheduled.customRule.repeat",
                                "Repeat",
                              )}
                            >
                              {(["daily", "weekly", "monthly"] as const).map(
                                (mode) => (
                                  <button
                                    key={mode}
                                    type="button"
                                    aria-pressed={friendlyCronMode === mode}
                                    onClick={() =>
                                      applyFriendlyCronRule({
                                        ...currentFriendlyCronRule,
                                        mode,
                                      })
                                    }
                                  >
                                    {translate(
                                      `scheduled.customRule.mode.${mode}`,
                                      mode === "daily"
                                        ? "Daily"
                                        : mode === "weekly"
                                          ? "Weekly"
                                          : "Monthly",
                                    )}
                                  </button>
                                ),
                              )}
                            </div>
                          </div>

                          <label className="automation-job-friendly-cron-field automation-job-friendly-cron-time">
                            <span className="automation-job-friendly-cron-label">
                              {translate(
                                "scheduled.customRule.time",
                                "Execution time",
                              )}
                            </span>
                            <input
                              type="time"
                              value={friendlyCronTime}
                              onChange={(event) =>
                                applyFriendlyCronRule({
                                  ...currentFriendlyCronRule,
                                  time: event.target.value || "09:00",
                                })
                              }
                            />
                          </label>
                        </div>

                        {friendlyCronMode === "weekly" && (
                          <div className="automation-job-friendly-cron-field">
                            <span className="automation-job-friendly-cron-label">
                              {translate(
                                "scheduled.customRule.weekdays",
                                "Execution days",
                              )}
                            </span>
                            <div
                              className="automation-job-friendly-cron-weekdays"
                              role="group"
                              aria-label={translate(
                                "scheduled.customRule.weekdays",
                                "Execution days",
                              )}
                            >
                              {friendlyWeekdayOptions.map((option) => {
                                const selected = friendlyCronWeekdays.includes(
                                  option.value,
                                );
                                return (
                                  <button
                                    key={option.value}
                                    type="button"
                                    aria-pressed={selected}
                                    disabled={
                                      selected && friendlyCronWeekdays.length === 1
                                    }
                                    onClick={() => {
                                      const nextWeekdays =
                                        friendlyWeekdayOptions
                                          .filter((weekday) =>
                                            weekday.value === option.value
                                              ? !selected
                                              : friendlyCronWeekdays.includes(
                                                  weekday.value,
                                                ),
                                          )
                                          .map((weekday) => weekday.value);
                                      if (!nextWeekdays.length) return;
                                      applyFriendlyCronRule({
                                        ...currentFriendlyCronRule,
                                        weekdays: nextWeekdays,
                                      });
                                    }}
                                  >
                                    {option.label}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {friendlyCronMode === "monthly" && (
                          <label className="automation-job-friendly-cron-field automation-job-friendly-cron-monthday">
                            <span className="automation-job-friendly-cron-label">
                              {translate(
                                "scheduled.customRule.monthDay",
                                "Day of month",
                              )}
                            </span>
                            <span className="automation-job-friendly-cron-number">
                              <input
                                type="number"
                                min="1"
                                max="31"
                                value={friendlyCronMonthDay}
                                onChange={(event) =>
                                  applyFriendlyCronRule({
                                    ...currentFriendlyCronRule,
                                    monthDay: Math.min(
                                      31,
                                      Math.max(1, Number(event.target.value) || 1),
                                    ),
                                  })
                                }
                              />
                              <span>
                                {translate(
                                  "scheduled.customRule.dayUnit",
                                  "day",
                                )}
                              </span>
                            </span>
                          </label>
                        )}

                        <div
                          className="automation-job-friendly-cron-summary"
                          aria-live="polite"
                        >
                          <span aria-hidden="true">{Icons.clock}</span>
                          <span>{friendlyCronSummary}</span>
                        </div>

                        <details className="automation-job-cron-advanced">
                          <summary>
                            <span>
                              {translate(
                                "scheduled.customRule.advanced",
                                "Advanced settings",
                              )}
                            </span>
                            <small>
                              {translate(
                                "scheduled.customRule.advancedHint",
                                "For users familiar with Cron only",
                              )}
                            </small>
                          </summary>
                          <div className="automation-job-cron-advanced-body">
                            <label>
                              <span>
                                {translate(
                                  "scheduled.cronExpression",
                                  "Cron expression",
                                )}
                              </span>
                              <input
                                type="text"
                                value={cronExpr}
                                onChange={(event) => {
                                  const nextExpression = event.target.value;
                                  setCronExpr(nextExpression);
                                  const parsedRule =
                                    parseFriendlyCron(nextExpression);
                                  if (parsedRule) {
                                    setFriendlyCronMode(parsedRule.mode);
                                    setFriendlyCronTime(parsedRule.time);
                                    setFriendlyCronWeekdays(
                                      parsedRule.weekdays,
                                    );
                                    setFriendlyCronMonthDay(
                                      parsedRule.monthDay,
                                    );
                                  }
                                }}
                                placeholder="0 9 * * 1-5"
                              />
                            </label>
                            <p className="automation-job-field-help">
                              {translate(
                                "scheduled.customRule.advancedHelp",
                                "Editing this value directly overrides the visual settings above.",
                              )}
                            </p>
                          </div>
                        </details>
                      </div>
                    )}
                  </div>
                )}

                {scheduleType === "at" && (
                  <input
                    type="datetime-local"
                    value={atDateTime}
                    onChange={(e) => setAtDateTime(e.target.value)}
                    style={modalStyles.input}
                  />
                )}
              </div>
            )}
          </div>

          <details className="automation-job-advanced">
            <summary>
              <span>
                <strong>
                  {translate(
                    "generated.components.scheduledtaskssettings.2889.95",
                    "More settings",
                  )}
                </strong>
                <small>
                  {translate(
                    "generated.components.scheduledtaskssettings.2890.96",
                    "Name, workspace, permissions and results push",
                  )}
                </small>
              </span>
              {Icons.chevronDown}
            </summary>
            <div className="automation-job-advanced-body">
              <div className="automation-job-modal-grid">
                <div style={modalStyles.field}>
                  <label style={modalStyles.label}>
                    {translate(
                      "generated.components.scheduledtaskssettings.2897.97",
                      "Task name (optional)",
                    )}
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={translate(
                      "generated.components.scheduledtaskssettings.2902.98",
                      "If left blank, it will be automatically named according to the task content.",
                    )}
                    style={modalStyles.input}
                  />
                </div>
                <div style={modalStyles.field}>
                  <label style={modalStyles.label}>
                    {translate(
                      "generated.components.scheduledtaskssettings.2907.99",
                      "workspace",
                    )}
                  </label>
                  <NeoWorkerSelectMenu
                    ariaLabel={translate(
                      "generated.components.scheduledtaskssettings.2907.99",
                      "workspace",
                    )}
                    className="automation-job-schedule-select automation-job-workspace-select"
                    disabled={workspaces.length === 0}
                    icon={<FolderSync size={16} strokeWidth={1.8} />}
                    minMenuWidth={360}
                    value={workspaceId}
                    onValueChange={setWorkspaceId}
                    options={workspaceOptions}
                    placeholder={agentContext.getUiCopy(
                      "scheduledNoWorkspaces",
                    )}
                  />
                </div>
              </div>
              <div style={modalStyles.field}>
                <label style={modalStyles.label}>
                  {translate(
                    "generated.components.scheduledtaskssettings.2927.100",
                    "Task title (optional)",
                  )}
                </label>
                <input
                  type="text"
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  placeholder={translate(
                    "generated.components.scheduledtaskssettings.2932.101",
                    "Use automation task name when left blank",
                  )}
                  style={modalStyles.input}
                />
              </div>

              <div style={modalStyles.field}>
                <label style={modalStyles.checkbox}>
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(e) => setEnabled(e.target.checked)}
                  />
                  {translate(
                    "generated.components.scheduledtaskssettings.2944.102",
                    "Activate immediately after saving",
                  )}
                </label>
                <label style={{ ...modalStyles.checkbox, marginTop: "8px" }}>
                  <input
                    type="checkbox"
                    checked={shellAccess}
                    onChange={(e) => setShellAccess(e.target.checked)}
                  />
                  {translate(
                    "generated.components.scheduledtaskssettings.2952.103",
                    "Allow terminal commands",
                  )}
                </label>
                <label style={{ ...modalStyles.checkbox, marginTop: "8px" }}>
                  <input
                    type="checkbox"
                    checked={allowUserInput}
                    onChange={(e) => setAllowUserInput(e.target.checked)}
                  />
                  {translate(
                    "generated.components.scheduledtaskssettings.2960.104",
                    "Pause and wait when confirmation or additional information is needed",
                  )}
                </label>
                {scheduleType === "at" && (
                  <label style={{ ...modalStyles.checkbox, marginTop: "8px" }}>
                    <input
                      type="checkbox"
                      checked={deleteAfterRun}
                      onChange={(e) => setDeleteAfterRun(e.target.checked)}
                    />
                    {translate(
                      "generated.components.scheduledtaskssettings.2969.105",
                      "Automatically delete after execution once",
                    )}
                  </label>
                )}
              </div>

              {/* Delivery Configuration */}
              <div
                style={{
                  marginBottom: "20px",
                  border: "1px solid var(--color-border-subtle)",
                  borderRadius: "var(--radius-sm)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "12px 14px",
                    backgroundColor: "var(--color-bg-glass)",
                    cursor: "pointer",
                    gap: "10px",
                  }}
                  onClick={() => setDeliveryExpanded(!deliveryExpanded)}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    {Icons.send}
                    <span
                      style={{
                        fontSize: "14px",
                        fontWeight: 500,
                        color: "var(--color-text-primary)",
                      }}
                    >
                      {translate(
                        "generated.components.scheduledtaskssettings.3010.106",
                        "Result push",
                      )}
                    </span>
                    {deliveryEnabled && (
                      <span
                        style={{
                          fontSize: "11px",
                          padding: "2px 6px",
                          borderRadius: "4px",
                          backgroundColor: "var(--color-success-subtle)",
                          color: "var(--color-success)",
                          fontWeight: 500,
                        }}
                      >
                        {translate(
                          "generated.components.scheduledtaskssettings.3023.107",
                          "Already turned on",
                        )}
                      </span>
                    )}
                  </div>
                  <span
                    style={{
                      color: "var(--color-text-muted)",
                      transform: deliveryExpanded
                        ? "rotate(180deg)"
                        : "rotate(0)",
                      transition: "transform 0.2s ease",
                    }}
                  >
                    {Icons.chevronDown}
                  </span>
                </div>

                {deliveryExpanded && (
                  <div
                    style={{
                      padding: "14px",
                      borderTop: "1px solid var(--color-border-subtle)",
                    }}
                  >
                    <label style={modalStyles.checkbox}>
                      <input
                        type="checkbox"
                        checked={deliveryEnabled}
                        onChange={(e) => setDeliveryEnabled(e.target.checked)}
                      />
                      {translate(
                        "generated.components.scheduledtaskssettings.3053.108",
                        "Send results to message channel",
                      )}
                    </label>

                    {deliveryEnabled && (
                      <div
                        style={{
                          marginTop: "14px",
                          display: "flex",
                          flexDirection: "column",
                          gap: "14px",
                        }}
                      >
                        {/* Channel dropdown */}
                        <div>
                          <label style={modalStyles.label}>
                            {translate(
                              "generated.components.scheduledtaskssettings.3067.109",
                              "Message channel *",
                            )}
                          </label>
                          {connectedChannels.length > 0 ? (
                            <NeoWorkerSelectMenu
                              ariaLabel={translate(
                                "generated.components.scheduledtaskssettings.3067.109",
                                "Message channel *",
                              )}
                              className="automation-job-schedule-select automation-job-channel-select"
                              icon={Icons.send}
                              minMenuWidth={360}
                              value={deliveryChannelDbId}
                              onValueChange={(selectedId) => {
                                setDeliveryChannelDbId(selectedId);
                                const ch = connectedChannels.find(
                                  (c) => c.id === selectedId,
                                );
                                setDeliveryChannelType(ch?.type || "");
                              }}
                              options={deliveryChannelOptions}
                            />
                          ) : (
                            <div
                              style={{
                                padding: "10px 12px",
                                backgroundColor: "var(--color-bg-input)",
                                border: "1px solid var(--color-border)",
                                borderRadius: "var(--radius-sm)",
                                fontSize: "13px",
                                color: "var(--color-text-muted)",
                              }}
                            >
                              {translate(
                                "generated.components.scheduledtaskssettings.3099.111",
                                "The message channel has not been configured yet. You can add it in the settings first.",
                              )}
                            </div>
                          )}
                        </div>

                        {/* Chat ID */}
                        <div>
                          <label style={modalStyles.label}>
                            {translate(
                              "generated.components.scheduledtaskssettings.3106.112",
                              "Target session ID *",
                            )}
                          </label>
                          <input
                            type="text"
                            value={deliveryChatId}
                            onChange={(e) => setDeliveryChatId(e.target.value)}
                            placeholder={translate(
                              "generated.components.scheduledtaskssettings.3111.113",
                              "Select a recent session or enter a session ID",
                            )}
                            list="delivery-chat-ids"
                            style={modalStyles.input}
                          />
                          {knownChatIds.length > 0 && (
                            <datalist id="delivery-chat-ids">
                              {knownChatIds.map((c) => (
                                <option key={c.chatId} value={c.chatId}>
                                  {c.chatId}
                                  {translate(
                                    "generated.components.scheduledtaskssettings.3119.114",
                                    "(Latest news:",
                                  )}{" "}
                                  {new Date(
                                    c.lastTimestamp,
                                  ).toLocaleDateString()}
                                  ）
                                </option>
                              ))}
                            </datalist>
                          )}
                          <div
                            style={{
                              marginTop: "4px",
                              fontSize: "12px",
                              color: "var(--color-text-muted)",
                            }}
                          >
                            {knownChatIds.length > 0
                              ? translate(
                                  "generated.components.scheduledtaskssettings.3136.115",
                                  "Choose from recent conversations or enter manually",
                                )
                              : translate(
                                  "generated.components.scheduledtaskssettings.3137.116",
                                  "Fill in the target conversation ID from the selected message channel",
                                )}
                          </div>
                        </div>

                        {/* Delivery options */}
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "8px",
                          }}
                        >
                          <label style={modalStyles.checkbox}>
                            <input
                              type="checkbox"
                              checked={deliverOnSuccess}
                              onChange={(e) =>
                                setDeliverOnSuccess(e.target.checked)
                              }
                            />
                            {translate(
                              "generated.components.scheduledtaskssettings.3157.117",
                              "Push on success",
                            )}
                          </label>
                          <label style={modalStyles.checkbox}>
                            <input
                              type="checkbox"
                              checked={deliverOnError}
                              onChange={(e) =>
                                setDeliverOnError(e.target.checked)
                              }
                            />
                            {translate(
                              "generated.components.scheduledtaskssettings.3167.118",
                              "push on failure",
                            )}
                          </label>
                          <label style={modalStyles.checkbox}>
                            <input
                              type="checkbox"
                              checked={summaryOnly}
                              onChange={(e) => setSummaryOnly(e.target.checked)}
                            />
                            {translate(
                              "generated.components.scheduledtaskssettings.3175.119",
                              "Push summary only",
                            )}
                          </label>
                          <label style={modalStyles.checkbox}>
                            <input
                              type="checkbox"
                              checked={deliverOnlyIfResult}
                              onChange={(e) =>
                                setDeliverOnlyIfResult(e.target.checked)
                              }
                            />
                            {translate(
                              "generated.components.scheduledtaskssettings.3185.120",
                              "Only push when results are available",
                            )}
                          </label>
                        </div>

                        {/* Test Delivery */}
                        {deliveryChannelDbId && deliveryChatId.trim() && (
                          <div
                            style={{
                              paddingTop: "10px",
                              borderTop: "1px solid var(--color-border-subtle)",
                            }}
                          >
                            <button
                              style={{
                                padding: "8px 14px",
                                fontSize: "13px",
                                fontWeight: 500,
                                color: testingDelivery
                                  ? "var(--color-text-muted)"
                                  : "var(--color-text-primary)",
                                backgroundColor: "var(--color-bg-input)",
                                border: "1px solid var(--color-border)",
                                borderRadius: "var(--radius-sm)",
                                cursor: testingDelivery
                                  ? "not-allowed"
                                  : "pointer",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "6px",
                              }}
                              disabled={testingDelivery}
                              onClick={async () => {
                                setTestingDelivery(true);
                                setTestDeliveryResult(null);
                                try {
                                  await window.electronAPI.sendGatewayTestMessage(
                                    {
                                      channelType: deliveryChannelType,
                                      channelDbId: deliveryChannelDbId,
                                      chatId: deliveryChatId.trim(),
                                    },
                                  );
                                  setTestDeliveryResult({
                                    ok: true,
                                    message: translate(
                                      "generated.components.scheduledtaskssettings.3229.121",
                                      "Test message sent successfully",
                                    ),
                                  });
                                } catch (err: Any) {
                                  setTestDeliveryResult({
                                    ok: false,
                                    message:
                                      err.message ||
                                      translate(
                                        "generated.components.scheduledtaskssettings.3234.122",
                                        "Test message sending failed",
                                      ),
                                  });
                                } finally {
                                  setTestingDelivery(false);
                                }
                              }}
                            >
                              {Icons.send}
                              {testingDelivery
                                ? translate(
                                    "generated.components.scheduledtaskssettings.3242.123",
                                    "Sending...",
                                  )
                                : translate(
                                    "generated.components.scheduledtaskssettings.3242.124",
                                    "Send test message",
                                  )}
                            </button>
                            {testDeliveryResult && (
                              <div
                                style={{
                                  marginTop: "8px",
                                  fontSize: "12px",
                                  color: testDeliveryResult.ok
                                    ? "var(--color-success)"
                                    : "var(--color-error)",
                                }}
                              >
                                {testDeliveryResult.message}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </details>

          {/* Actions */}
          <div
            className="automation-job-modal-actions"
            style={modalStyles.actions}
          >
            <button
              style={modalStyles.cancelBtn}
              onClick={onClose}
              disabled={saving}
            >
              {translate(
                "generated.components.scheduledtaskssettings.3277.125",
                "Cancel",
              )}
            </button>
            <button
              style={modalStyles.saveBtn}
              onClick={handleSave}
              disabled={saving}
            >
              {saving
                ? translate(
                    "generated.components.scheduledtaskssettings.3284.126",
                    "Saving...",
                  )
                : isEditing
                  ? translate(
                      "generated.components.scheduledtaskssettings.3284.127",
                      "Save changes",
                    )
                  : translate(
                      "generated.components.scheduledtaskssettings.3284.128",
                      "Create automation",
                    )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
