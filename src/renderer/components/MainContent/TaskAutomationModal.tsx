import { useState, useEffect, useCallback } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { Task, Workspace } from "../../../shared/types";
import {
  TASK_AUTOMATION_TEMPLATES,
  buildTaskAutomationSchedule,
  buildTaskRoutineCreate,
  type TaskAutomationRunMode,
  type TaskAutomationSchedulePreset,
  type TaskAutomationTemplate,
  type TaskRoutineTriggerPreset,
} from "../task-automation-utils";
import {
  Check as CheckIcon,
  ChevronDown,
  Clock,
  Folder,
  GitFork,
  MessageCircle,
  Pin,
  X,
} from "lucide-react";
import { translate, useLanguage } from "../../i18n";

export const TASK_AUTOMATION_SCHEDULE_LABEL: Record<
  TaskAutomationSchedulePreset,
  string
> = {
  every30m: "Every 30m",
  hourly: "Hourly",
  daily: "Daily",
  weekdays: "Weekdays",
  weekly: "Weekly",
  custom: "Custom",
};

export const TASK_ROUTINE_TRIGGER_LABEL: Record<
  TaskRoutineTriggerPreset,
  string
> = {
  manual: "Manual",
  ...TASK_AUTOMATION_SCHEDULE_LABEL,
};

export function isTurnThisIntoRoutinePrompt(value: string): boolean {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, " ");
  return /^(please\s+)?(turn|make|convert)\s+(this|that|it)\s+into\s+(a\s+)?routine[.!?]?$/.test(
    normalized,
  );
}

export function taskCanBecomeRoutineFromFollowUp(
  task: Task | null | undefined,
): boolean {
  if (!task) return false;
  if (task.status !== "completed") return false;
  return !task.terminalStatus || task.terminalStatus === "ok";
}

interface TaskAutomationModalProps {
  task: Task;
  workspace: Workspace | null;
  defaultName: string;
  defaultPrompt: string;
  deeplink: string;
  onClose: () => void;
  onCreated?: (routine: Any) => void | Promise<void>;
}

export function TaskAutomationModal({
  task,
  workspace,
  defaultName,
  defaultPrompt,
  deeplink,
  onClose,
  onCreated,
}: TaskAutomationModalProps) {
  useLanguage();
  const t = translate;
  const [name, setName] = useState(defaultName);
  const [prompt, setPrompt] = useState(defaultPrompt);
  const [runMode, setRunMode] = useState<TaskAutomationRunMode>("chat");
  const [triggerPreset, setTriggerPreset] =
    useState<TaskRoutineTriggerPreset>("manual");
  const [customCron, setCustomCron] = useState("*/30 * * * *");
  const [openMenu, setOpenMenu] = useState<"run" | "schedule" | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasWorktree = Boolean(task.worktreePath);
  const selectedSchedule =
    triggerPreset === "manual"
      ? null
      : buildTaskAutomationSchedule(triggerPreset, customCron);
  const workspaceId = task.workspaceId || workspace?.id || "";
  const canSave =
    name.trim().length > 0 &&
    prompt.trim().length > 0 &&
    workspaceId.trim().length > 0 &&
    (triggerPreset === "manual" || selectedSchedule !== null) &&
    !saving;

  useEffect(() => {
    setName(defaultName);
    setPrompt(defaultPrompt);
    setError(null);
    setTriggerPreset("manual");
    setCustomCron("*/30 * * * *");
    setRunMode("chat");
    setShowTemplates(false);
    setOpenMenu(null);
  }, [defaultName, defaultPrompt, task.id]);

  const handleBackdropClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (event.target === event.currentTarget && !saving) {
        onClose();
      }
    },
    [onClose, saving],
  );

  const templateName = useCallback(
    (template: TaskAutomationTemplate) =>
      t(`taskAutomation.template.${template.id}.name`, template.name),
    [t],
  );
  const templatePrompt = useCallback(
    (template: TaskAutomationTemplate) =>
      t(`taskAutomation.template.${template.id}.prompt`, template.prompt),
    [t],
  );

  const handleTemplateSelect = useCallback(
    (template: TaskAutomationTemplate) => {
      setName(templateName(template));
      setPrompt(templatePrompt(template));
      setTriggerPreset(template.schedulePreset);
      setShowTemplates(false);
      setError(null);
    },
    [templateName, templatePrompt],
  );

  const handleSave = useCallback(async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const routine = await window.electronAPI.createRoutine(
        buildTaskRoutineCreate({
          task,
          workspace,
          name,
          prompt,
          runMode,
          triggerPreset,
          schedule: selectedSchedule,
          deeplink,
        }),
      );
      if (!routine?.id) {
        setError(t("taskAutomation.error.create", "Could not create routine."));
        return;
      }
      await onCreated?.(routine);
      onClose();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : t("taskAutomation.error.create", "Could not create routine."),
      );
    } finally {
      setSaving(false);
    }
  }, [
    canSave,
    deeplink,
    name,
    onClose,
    onCreated,
    prompt,
    runMode,
    selectedSchedule,
    task,
    triggerPreset,
    workspace,
  ]);

  const scheduleOptions: TaskRoutineTriggerPreset[] = [
    "manual",
    "every30m",
    "hourly",
    "daily",
    "weekdays",
    "weekly",
    "custom",
  ];

  return (
    <div
      className="task-automation-modal-backdrop"
      role="presentation"
      onMouseDown={handleBackdropClick}
    >
      <section
        className="task-automation-modal"
        role="dialog"
        aria-modal="true"
        aria-label={
          showTemplates
            ? t("taskAutomation.templates.title", "Routine templates")
            : t("taskAutomation.create.title", "Create routine")
        }
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="task-automation-modal-header">
          <h2>
            {showTemplates
              ? t("taskAutomation.templates.title", "Routine templates")
              : t("taskAutomation.create.title", "Create routine")}
          </h2>
          <div className="task-automation-modal-header-actions">
            {!showTemplates && (
              <button
                type="button"
                className="task-automation-header-btn muted"
                onClick={() => {
                  setName(defaultName);
                  setPrompt("");
                  setError(null);
                }}
                disabled={saving}
              >
                {t("common.clear", "Clear")}
              </button>
            )}
            <button
              type="button"
              className="task-automation-header-btn"
              onClick={() => {
                setShowTemplates((value) => !value);
                setOpenMenu(null);
              }}
              disabled={saving}
            >
              {showTemplates
                ? t("taskAutomation.createNew", "Create new")
                : t("taskAutomation.useTemplate", "Use template")}
            </button>
            <button
              type="button"
              className="task-automation-close-btn"
              aria-label={t("common.close", "Close")}
              onClick={onClose}
              disabled={saving}
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        </header>

        {showTemplates ? (
          <div className="task-automation-template-grid">
            {TASK_AUTOMATION_TEMPLATES.map((template) => {
              const Icon = template.icon;
              const name = templateName(template);
              const prompt = templatePrompt(template);
              return (
                <button
                  key={template.id}
                  type="button"
                  className="task-automation-template-card"
                  onClick={() => handleTemplateSelect(template)}
                  title={name}
                >
                  <Icon size={22} aria-hidden="true" />
                  <span>{prompt}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <>
            <div className="task-automation-modal-body">
              <textarea
                className="task-automation-prompt-input"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder={t(
                  "taskAutomation.promptPlaceholder",
                  "Add prompt e.g. look for crashes in $sentry",
                )}
                disabled={saving}
              />
              {triggerPreset === "custom" && (
                <label className="task-automation-custom-schedule">
                  <span>
                    {t("taskAutomation.cronExpression", "Cron expression")}
                  </span>
                  <input
                    value={customCron}
                    onChange={(event) => setCustomCron(event.target.value)}
                    placeholder="*/30 * * * *"
                    disabled={saving}
                  />
                </label>
              )}
              {error && <div className="task-automation-error">{error}</div>}
            </div>

            <footer className="task-automation-modal-footer">
              <div className="task-automation-footer-controls">
                <div className="task-automation-select-wrap">
                  <button
                    type="button"
                    className="task-automation-pill-control"
                    aria-haspopup="menu"
                    aria-expanded={openMenu === "run"}
                    onClick={() =>
                      setOpenMenu((value) => (value === "run" ? null : "run"))
                    }
                    disabled={saving}
                  >
                    {runMode === "chat" && (
                      <MessageCircle size={16} aria-hidden="true" />
                    )}
                    {runMode === "local" && (
                      <Folder size={16} aria-hidden="true" />
                    )}
                    {runMode === "worktree" && (
                      <GitFork size={16} aria-hidden="true" />
                    )}
                    <span>
                      {runMode === "chat"
                        ? t("taskAutomation.run.chat", "Chat")
                        : runMode === "local"
                          ? t("taskAutomation.run.local", "Local")
                          : t("taskAutomation.run.worktree", "Worktree")}
                    </span>
                    <ChevronDown size={15} aria-hidden="true" />
                  </button>
                  {openMenu === "run" && (
                    <div className="task-automation-popover" role="menu">
                      <div className="task-automation-popover-title">
                        {t("taskAutomation.runIn", "Run in")}
                      </div>
                      <button
                        type="button"
                        className={`task-automation-popover-item ${runMode === "chat" ? "selected" : ""}`}
                        onClick={() => {
                          setRunMode("chat");
                          setOpenMenu(null);
                        }}
                      >
                        <MessageCircle size={16} aria-hidden="true" />
                        <span>{t("taskAutomation.run.chat", "Chat")}</span>
                        {runMode === "chat" && (
                          <CheckIcon size={16} aria-hidden="true" />
                        )}
                      </button>
                      <button
                        type="button"
                        className={`task-automation-popover-item ${runMode === "local" ? "selected" : ""}`}
                        onClick={() => {
                          setRunMode("local");
                          setOpenMenu(null);
                        }}
                      >
                        <Folder size={16} aria-hidden="true" />
                        <span>{t("taskAutomation.run.local", "Local")}</span>
                        {runMode === "local" && (
                          <CheckIcon size={16} aria-hidden="true" />
                        )}
                      </button>
                      {hasWorktree && (
                        <button
                          type="button"
                          className="task-automation-popover-item disabled"
                          disabled
                          title={t(
                            "taskAutomation.worktreeDisabled",
                            "Scheduled tasks cannot preserve task worktrees yet.",
                          )}
                        >
                          <GitFork size={16} aria-hidden="true" />
                          <span>
                            {t("taskAutomation.run.worktree", "Worktree")}
                          </span>
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <label className="task-automation-name-pill">
                  <Pin size={16} aria-hidden="true" />
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder={t(
                      "taskAutomation.namePlaceholder",
                      "Automation name",
                    )}
                    disabled={saving}
                    aria-label={t(
                      "taskAutomation.namePlaceholder",
                      "Automation name",
                    )}
                  />
                </label>

                <div className="task-automation-select-wrap">
                  <button
                    type="button"
                    className="task-automation-pill-control"
                    aria-haspopup="menu"
                    aria-expanded={openMenu === "schedule"}
                    onClick={() =>
                      setOpenMenu((value) =>
                        value === "schedule" ? null : "schedule",
                      )
                    }
                    disabled={saving}
                  >
                    <Clock size={16} aria-hidden="true" />
                    <span>
                      {t(
                        `taskAutomation.schedule.${triggerPreset}`,
                        TASK_ROUTINE_TRIGGER_LABEL[triggerPreset],
                      )}
                    </span>
                    <ChevronDown size={15} aria-hidden="true" />
                  </button>
                  {openMenu === "schedule" && (
                    <div
                      className="task-automation-popover schedule"
                      role="menu"
                    >
                      <div className="task-automation-popover-title">
                        {t("taskAutomation.trigger", "Trigger")}
                      </div>
                      {scheduleOptions.map((option) => (
                        <button
                          key={option}
                          type="button"
                          className={`task-automation-popover-item ${triggerPreset === option ? "selected" : ""}`}
                          onClick={() => {
                            setTriggerPreset(option);
                            setOpenMenu(null);
                          }}
                        >
                          <span>
                            {t(
                              `taskAutomation.schedule.${option}`,
                              TASK_ROUTINE_TRIGGER_LABEL[option],
                            )}
                          </span>
                          {triggerPreset === option && (
                            <CheckIcon size={16} aria-hidden="true" />
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="task-automation-footer-actions">
                <button
                  type="button"
                  className="task-automation-secondary-btn"
                  onClick={onClose}
                  disabled={saving}
                >
                  {t("common.cancel", "Cancel")}
                </button>
                <button
                  type="button"
                  className="task-automation-save-btn"
                  onClick={() => void handleSave()}
                  disabled={!canSave}
                >
                  {saving
                    ? t("common.savingShort", "Saving")
                    : t("taskAutomation.create.title", "Create routine")}
                </button>
              </div>
            </footer>
          </>
        )}
      </section>
    </div>
  );
}
