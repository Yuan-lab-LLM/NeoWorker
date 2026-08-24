import { useMemo, useState } from "react";
import {
  CalendarClock,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleDashed,
  Info,
} from "lucide-react";
import type { Task } from "../../../shared/types";
import type { MissionControlData } from "./useMissionControlData";
import {
  getCurrentLanguage,
  translate,
  useLanguage,
  type SupportedLanguage,
} from "../../i18n/index";

interface MCTaskCalendarViewProps {
  tasks: Task[];
  data: Pick<MissionControlData, "getTaskAttentionReason">;
  selectedTaskId: string | null;
  onSelectTask: (taskId: string) => void;
}

interface CalendarDay {
  date: Date;
  key: string;
  isCurrentMonth: boolean;
  isToday: boolean;
}

const WEEKDAY_LABELS = [
  translate(
    "generated.components.mission.control.mctaskcalendarview.27.0",
    "one",
  ),
  translate(
    "generated.components.mission.control.mctaskcalendarview.27.1",
    "Two",
  ),
  translate(
    "generated.components.mission.control.mctaskcalendarview.27.2",
    "three",
  ),
  translate(
    "generated.components.mission.control.mctaskcalendarview.27.3",
    "Four",
  ),
  translate(
    "generated.components.mission.control.mctaskcalendarview.27.4",
    "five",
  ),
  translate(
    "generated.components.mission.control.mctaskcalendarview.27.5",
    "Six",
  ),
  translate(
    "generated.components.mission.control.mctaskcalendarview.27.6",
    "day",
  ),
];
const MAX_VISIBLE_TASKS_PER_DAY = 3;
const TERMINAL_TASK_STATUSES = new Set<Task["status"]>([
  "completed",
  "failed",
  "cancelled",
  "interrupted",
]);

export type TaskCalendarTimeKind = "completed" | "updated" | "due";

export interface TaskCalendarPlacement {
  timestamp: number;
  kind: TaskCalendarTimeKind;
  label: string;
}

interface CalendarTaskEntry {
  task: Task;
  placement: TaskCalendarPlacement;
}

function startOfMonth(timestamp: number): Date {
  const date = new Date(timestamp);
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function dateKey(timestamp: number | Date): string {
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateFromKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function getTaskCalendarDays(
  anchorTimestamp: number,
  now = Date.now(),
): CalendarDay[] {
  const monthStart = startOfMonth(anchorTimestamp);
  const mondayOffset = (monthStart.getDay() + 6) % 7;
  const gridStart = new Date(
    monthStart.getFullYear(),
    monthStart.getMonth(),
    1 - mondayOffset,
  );
  const todayKey = dateKey(now);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(
      gridStart.getFullYear(),
      gridStart.getMonth(),
      gridStart.getDate() + index,
    );
    return {
      date,
      key: dateKey(date),
      isCurrentMonth: date.getMonth() === monthStart.getMonth(),
      isToday: dateKey(date) === todayKey,
    };
  });
}

export function getCalendarAnchorMonthForDay(
  anchorTimestamp: number,
  dayTimestamp: number,
): number {
  const anchor = new Date(anchorTimestamp);
  const day = new Date(dayTimestamp);
  if (
    anchor.getFullYear() === day.getFullYear() &&
    anchor.getMonth() === day.getMonth()
  ) {
    return anchorTimestamp;
  }
  return startOfMonth(dayTimestamp).getTime();
}

export function formatExactTaskTimestamp(
  timestamp: number,
  language: SupportedLanguage = getCurrentLanguage(),
): string {
  return new Intl.DateTimeFormat(language === "zh-CN" ? "zh-CN" : "en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(new Date(timestamp))
    .replaceAll("/", "-");
}

function formatMonthLabel(timestamp: number, language: SupportedLanguage): string {
  return new Intl.DateTimeFormat(language === "zh-CN" ? "zh-CN" : "en-US", {
    year: "numeric",
    month: "long",
  }).format(new Date(timestamp));
}

function formatDueTime(timestamp: number, language: SupportedLanguage): string {
  return new Intl.DateTimeFormat(language === "zh-CN" ? "zh-CN" : "en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(timestamp));
}

function formatSelectedDateLabel(key: string, language: SupportedLanguage): string {
  return new Intl.DateTimeFormat(language === "zh-CN" ? "zh-CN" : "en-US", {
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(dateFromKey(key));
}

function getTaskTone(task: Task, attentionReason?: string | null): string {
  if (task.status === "failed" || task.status === "interrupted")
    return "danger";
  if (attentionReason) return "warning";
  if (task.status === "completed") return "success";
  if (task.status === "executing" || task.status === "running") return "active";
  return "neutral";
}

function getDisplayTaskTitle(title: string): string {
  return title.replace(/^@[^:]+:\s*/, "");
}

export function getTaskCalendarPlacement(
  task: Task,
): TaskCalendarPlacement | null {
  if (TERMINAL_TASK_STATUSES.has(task.status)) {
    if (task.completedAt) {
      return {
        timestamp: task.completedAt,
        kind: "completed",
        label:
          task.status === "completed"
            ? translate(
                "generated.components.mission.control.mctaskcalendarview.166.7",
                "Complete",
              )
            : translate(
                "generated.components.mission.control.mctaskcalendarview.166.8",
                "end",
              ),
      };
    }
    if (task.updatedAt) {
      return {
        timestamp: task.updatedAt,
        kind: "updated",
        label:
          task.status === "failed"
            ? translate(
                "generated.components.mission.control.mctaskcalendarview.173.9",
                "failed",
              )
            : translate(
                "generated.components.mission.control.mctaskcalendarview.173.10",
                "update",
              ),
      };
    }
  }

  if (task.dueDate) {
    return {
      timestamp: task.dueDate,
      kind: "due",
      label:
        task.source === "cron"
          ? translate(
              "generated.components.mission.control.mctaskcalendarview.182.11",
              "execute",
            )
          : translate(
              "generated.components.mission.control.mctaskcalendarview.182.12",
              "Deadline",
            ),
    };
  }

  return null;
}

export function MCTaskCalendarView({
  tasks,
  data,
  selectedTaskId,
  onSelectTask,
}: MCTaskCalendarViewProps) {
  const language = useLanguage();
  const { getTaskAttentionReason } = data;
  const [anchorMonth, setAnchorMonth] = useState(() =>
    startOfMonth(Date.now()).getTime(),
  );
  const [selectedDateKey, setSelectedDateKey] = useState(() =>
    dateKey(Date.now()),
  );
  const days = useMemo(() => getTaskCalendarDays(anchorMonth), [anchorMonth]);
  const tasksByDate = useMemo(() => {
    const grouped = new Map<string, CalendarTaskEntry[]>();
    tasks.forEach((task) => {
      const placement = getTaskCalendarPlacement(task);
      if (!placement) return;
      const key = dateKey(placement.timestamp);
      grouped.set(key, [...(grouped.get(key) || []), { task, placement }]);
    });
    grouped.forEach((items) => {
      items.sort(
        (a, b) =>
          a.placement.timestamp - b.placement.timestamp ||
          (b.task.priority ?? 0) - (a.task.priority ?? 0),
      );
    });
    return grouped;
  }, [tasks]);
  const unmappedTaskCount = useMemo(
    () => tasks.filter((task) => !getTaskCalendarPlacement(task)).length,
    [tasks],
  );
  const calendarRuleDetail =
    unmappedTaskCount > 0
      ? translate(
          "missionControl.calendar.unmappedTasks",
          "{count} in-progress tasks have no due date and only appear in the list.",
          { count: unmappedTaskCount },
        )
      : "";
  const monthlyTaskCount = useMemo(() => {
    const anchor = new Date(anchorMonth);
    return tasks.filter((task) => {
      const placement = getTaskCalendarPlacement(task);
      if (!placement) return false;
      const taskDate = new Date(placement.timestamp);
      return (
        taskDate.getFullYear() === anchor.getFullYear() &&
        taskDate.getMonth() === anchor.getMonth()
      );
    }).length;
  }, [anchorMonth, tasks]);
  const selectedDayTasks = tasksByDate.get(selectedDateKey) || [];

  const moveMonth = (offset: number) => {
    setAnchorMonth((current) => {
      const date = new Date(current);
      const nextMonth = new Date(
        date.getFullYear(),
        date.getMonth() + offset,
        1,
      );
      setSelectedDateKey(dateKey(nextMonth));
      return nextMonth.getTime();
    });
  };

  const goToToday = () => {
    const now = Date.now();
    setAnchorMonth(startOfMonth(now).getTime());
    setSelectedDateKey(dateKey(now));
  };

  const selectDay = (day: CalendarDay) => {
    setSelectedDateKey(day.key);
    setAnchorMonth((current) =>
      getCalendarAnchorMonthForDay(current, day.date.getTime()),
    );
  };

  return (
    <section
      className={`mc-task-calendar ${monthlyTaskCount === 0 ? "empty-month" : ""}`}
      aria-label={translate(
        "generated.components.mission.control.mctaskcalendarview.273.13",
        "task calendar",
      )}
    >
      <header className="mc-task-calendar-header">
        <div>
          <CalendarClock size={16} aria-hidden="true" />
          <strong>{formatMonthLabel(anchorMonth, language)}</strong>
          <span>
            {translate(
              "generated.components.mission.control.mctaskcalendarview.279.14",
              "this month",
            )}
            {monthlyTaskCount}{" "}
            {translate(
              "generated.components.mission.control.mctaskcalendarview.279.15",
              "item",
            )}
          </span>
          <span
            className="mc-task-calendar-rule-hint"
            aria-label={translate(
              "missionControl.calendar.displayRule",
              "Time display rule: completed tasks use completion time, and in-progress tasks use due date. {detail}",
              { detail: calendarRuleDetail },
            )}
            title={translate(
              "missionControl.calendar.displayRuleShort",
              "Completed tasks use completion time, and in-progress tasks use due date. {detail}",
              { detail: calendarRuleDetail },
            )}
            tabIndex={0}
          >
            <Info size={13} aria-hidden="true" />
          </span>
        </div>
        <div
          className="mc-task-calendar-navigation"
          aria-label={translate(
            "generated.components.mission.control.mctaskcalendarview.289.16",
            "Switch month",
          )}
        >
          <button
            type="button"
            aria-label={translate(
              "generated.components.mission.control.mctaskcalendarview.292.17",
              "last month",
            )}
            onClick={() => moveMonth(-1)}
          >
            <ChevronLeft size={15} />
          </button>
          <button
            type="button"
            className="mc-task-calendar-today"
            onClick={goToToday}
          >
            {translate(
              "generated.components.mission.control.mctaskcalendarview.302.18",
              "today",
            )}
          </button>
          <button
            type="button"
            aria-label={translate(
              "generated.components.mission.control.mctaskcalendarview.306.19",
              "next month",
            )}
            onClick={() => moveMonth(1)}
          >
            <ChevronRight size={15} />
          </button>
        </div>
      </header>

      <div className="mc-task-calendar-layout">
        <div className="mc-task-calendar-main">
          <div className="mc-task-calendar-weekdays" aria-hidden="true">
            {WEEKDAY_LABELS.map((label) => (
              <span key={label}>
                {translate(
                  "generated.components.mission.control.mctaskcalendarview.318.20",
                  "week",
                )}
                {label}
              </span>
            ))}
          </div>
          {monthlyTaskCount === 0 && (
            <div className="mc-task-calendar-empty-hint">
              <div className="mc-task-calendar-empty-copy">
                <CircleDashed size={15} aria-hidden="true" />
                <div>
                  <strong>
                    {translate(
                      "generated.components.mission.control.mctaskcalendarview.326.21",
                      "There are no task times to display this month",
                    )}
                  </strong>
                  <span>
                    {translate(
                      "generated.components.mission.control.mctaskcalendarview.328.22",
                      "Historical tasks are displayed by completion time, and ongoing tasks are displayed by deadline.",
                    )}
                  </span>
                </div>
              </div>
            </div>
          )}
          <div className="mc-task-calendar-grid">
            {days.map((day) => {
              const dayTasks = tasksByDate.get(day.key) || [];
              const hiddenTaskCount = Math.max(
                dayTasks.length - MAX_VISIBLE_TASKS_PER_DAY,
                0,
              );

              return (
                <section
                  key={day.key}
                  className={[
                    "mc-task-calendar-day",
                    day.isCurrentMonth ? "" : "outside-month",
                    day.isToday ? "today" : "",
                    day.key === selectedDateKey ? "selected-day" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <button
                    type="button"
                    className="mc-task-calendar-day-hit-area"
                    aria-label={translate(
                      "missionControl.calendar.dayTaskCount",
                      "{date}, {count} tasks",
                      {
                        date: new Intl.DateTimeFormat(undefined, {
                          month: "long",
                          day: "numeric",
                        }).format(day.date),
                        count: dayTasks.length,
                      },
                    )}
                    aria-pressed={day.key === selectedDateKey}
                    aria-current={day.isToday ? "date" : undefined}
                    onClick={() => selectDay(day)}
                  />
                  <time dateTime={day.key}>{day.date.getDate()}</time>
                  <div className="mc-task-calendar-day-tasks">
                    {dayTasks
                      .slice(0, MAX_VISIBLE_TASKS_PER_DAY)
                      .map(({ task, placement }) => {
                        const attentionReason = getTaskAttentionReason(task);
                        const tone = getTaskTone(task, attentionReason);

                        return (
                          <button
                            key={task.id}
                            type="button"
                            className={`mc-task-calendar-item tone-${tone} ${selectedTaskId === task.id ? "selected" : ""}`}
                            title={`${getDisplayTaskTitle(task.title)} · ${placement.label} ${formatExactTaskTimestamp(placement.timestamp, language)}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              setSelectedDateKey(day.key);
                              onSelectTask(task.id);
                            }}
                          >
                            <span>{formatDueTime(placement.timestamp, language)}</span>
                            <strong>{getDisplayTaskTitle(task.title)}</strong>
                          </button>
                        );
                      })}
                    {hiddenTaskCount > 0 && (
                      <span className="mc-task-calendar-more">
                        +{hiddenTaskCount}{" "}
                        {translate(
                          "generated.components.mission.control.mctaskcalendarview.389.23",
                          "item",
                        )}
                      </span>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </div>

        <aside className="mc-task-calendar-sidebar">
          <section className="mc-task-calendar-agenda" key={selectedDateKey}>
            <div className="mc-task-calendar-sidebar-heading">
              <CalendarDays size={15} aria-hidden="true" />
              <div>
                <span className="mc-task-calendar-selection-status">
                  {translate(
                    "generated.components.mission.control.mctaskcalendarview.404.24",
                    "Selected",
                  )}
                </span>
                <strong>{formatSelectedDateLabel(selectedDateKey, language)}</strong>
              </div>
              <span>{selectedDayTasks.length}</span>
            </div>
            <div className="mc-task-calendar-agenda-list">
              {selectedDayTasks.length === 0 ? (
                <div className="mc-task-calendar-agenda-empty">
                  <CalendarDays size={18} aria-hidden="true" />
                  <strong>
                    {translate(
                      "generated.components.mission.control.mctaskcalendarview.413.25",
                      "No tasks for the day",
                    )}
                  </strong>
                  <span>
                    {translate(
                      "generated.components.mission.control.mctaskcalendarview.414.26",
                      "Select another date to view schedule",
                    )}
                  </span>
                </div>
              ) : (
                selectedDayTasks.map(({ task, placement }) => (
                  <button
                    key={task.id}
                    type="button"
                    className={selectedTaskId === task.id ? "selected" : ""}
                    onClick={() => onSelectTask(task.id)}
                  >
                    <time>{formatDueTime(placement.timestamp, language)}</time>
                    <div>
                      <strong>{getDisplayTaskTitle(task.title)}</strong>
                      <span>
                        {placement.label}
                        {translate(
                          "generated.components.mission.control.mctaskcalendarview.427.27",
                          "time",
                        )}
                      </span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </section>
        </aside>
      </div>
    </section>
  );
}
