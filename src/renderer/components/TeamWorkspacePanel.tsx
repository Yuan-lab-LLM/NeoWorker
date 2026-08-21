import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowRight,
  BadgeCheck,
  Bot,
  Clock3,
  FileSearch,
  FolderPlus,
  FolderOpen,
  GitCompareArrows,
  ListChecks,
  Sparkles,
  UsersRound,
  Workflow,
  X,
} from "lucide-react";
import {
  isTempWorkspaceId,
  type AgentRole,
  type Task,
  type Workspace,
} from "../../shared/types";
import { translate, useLanguage } from "../i18n";
import { getLocalizedAgentRoleText } from "../utils/localized-agent-roles";
import { getSemanticIconVisual } from "../utils/semantic-icon-map";
import { getMissionControlScopeName } from "../utils/mission-control-copy";
import { withRunOutputLanguage } from "../utils/run-output-language";
import { NeoWorkerSelectMenu } from "./NeoWorkerSelectMenu";
import { NeoWorkerPageHeader } from "./NeoWorkerPageHeader";
import { SimpleAgentBuilderPanel } from "./SimpleAgentBuilderPanel";
import "./team-workspace.css";

interface TeamWorkspacePanelProps {
  workspace: Workspace | null;
  onStartTask: (
    title: string,
    prompt: string,
    workspace: Workspace,
    agentRoleId?: string,
  ) => Promise<boolean>;
  onOpenTask: (taskId: string) => void | Promise<void>;
  onSelectWorkspace: (workspace: Workspace) => void | Promise<void>;
  onAddWorkspace: () => void | Promise<void>;
  selectedRole: AgentRole | null;
  onSelectedRoleChange: (role: AgentRole | null) => void;
}

const QUICK_TEAM_SUGGESTIONS = [
  {
    id: "research",
    icon: FileSearch,
    labelKey: "teamWorkspace.quick.suggestion.research",
    label: translate(
      "generated.components.teamworkspacepanel.61.0",
      "Research a topic and generate a report",
    ),
    promptKey: "teamWorkspace.quick.suggestion.researchPrompt",
    prompt: translate(
      "generated.components.teamworkspacepanel.63.1",
      "Research the enterprise AI workstation market, check sources and send me a shareable report.",
    ),
  },
  {
    id: "compare",
    icon: GitCompareArrows,
    labelKey: "teamWorkspace.quick.suggestion.compare",
    label: translate(
      "generated.components.teamworkspacepanel.69.2",
      "Compare several options and give recommendations",
    ),
    promptKey: "teamWorkspace.quick.suggestion.comparePrompt",
    prompt: translate(
      "generated.components.teamworkspacepanel.71.3",
      "Compare WorkBuddy, AionUI and OpenClaw to make clear selection recommendations.",
    ),
  },
  {
    id: "plan",
    icon: ListChecks,
    labelKey: "teamWorkspace.quick.suggestion.plan",
    label: translate(
      "generated.components.teamworkspacepanel.77.4",
      "Turn goals into executable plans",
    ),
    promptKey: "teamWorkspace.quick.suggestion.planPrompt",
    prompt: translate(
      "generated.components.teamworkspacepanel.79.5",
      "Develop release scenarios for NeoWorker and output plans, risk lists and presentations.",
    ),
  },
] as const;

const TEAM_WORKFLOW_STEPS = [
  {
    icon: ListChecks,
    title: translate(
      "generated.components.teamworkspacepanel.86.6",
      "Automatic disassembly",
    ),
    description: translate(
      "generated.components.teamworkspacepanel.87.7",
      "Break the goal into specific tasks that can be progressed in parallel.",
    ),
  },
  {
    icon: UsersRound,
    title: translate(
      "generated.components.teamworkspacepanel.91.8",
      "matching expert",
    ),
    description: translate(
      "generated.components.teamworkspacepanel.92.9",
      "Arrange research, execution and review roles according to task needs.",
    ),
  },
  {
    icon: BadgeCheck,
    title: translate(
      "generated.components.teamworkspacepanel.96.10",
      "Verify delivery",
    ),
    description: translate(
      "generated.components.teamworkspacepanel.97.11",
      "Aggregate team results, check quality and deliver final results.",
    ),
  },
] as const;

const ACTIVE_TEAM_TASK_STATUSES = new Set([
  "planning",
  "executing",
  "queued",
  "running",
]);

export function mergeTeamWorkspaceOptions(
  workspaces: Workspace[],
  currentWorkspace: Workspace | null,
  temporaryWorkspace: Workspace | null,
): Workspace[] {
  const merged = [
    ...(currentWorkspace ? [currentWorkspace] : []),
    ...workspaces,
    ...(temporaryWorkspace ? [temporaryWorkspace] : []),
  ];
  const seen = new Set<string>();
  return merged.filter((workspace) => {
    if (seen.has(workspace.id)) return false;
    seen.add(workspace.id);
    return true;
  });
}

function getTeamTaskStatus(task: Task): {
  label: string;
  tone: "active" | "done" | "issue" | "muted";
} {
  if (task.status === "completed")
    return {
      label: translate(
        "generated.components.teamworkspacepanel.146.12",
        "Completed",
      ),
      tone: "done",
    };
  if (["failed", "blocked", "interrupted"].includes(task.status)) {
    return {
      label: translate(
        "generated.components.teamworkspacepanel.148.13",
        "Need to be processed",
      ),
      tone: "issue",
    };
  }
  if (ACTIVE_TEAM_TASK_STATUSES.has(task.status)) {
    return {
      label: translate(
        "generated.components.teamworkspacepanel.151.14",
        "In progress",
      ),
      tone: "active",
    };
  }
  return {
    label: translate("generated.components.teamworkspacepanel.153.15", "ended"),
    tone: "muted",
  };
}

function formatTeamTaskTime(timestamp: number, language: "en" | "zh-CN"): string {
  return new Intl.DateTimeFormat(language === "zh-CN" ? "zh-CN" : "en-US", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(timestamp));
}

function deriveQuickTeamTaskTitle(goal: string): string {
  const normalized = goal.replace(/\s+/g, " ").trim();
  if (normalized.length <= 42) return normalized;
  return `${normalized.slice(0, 41).trimEnd()}…`;
}

export function TeamWorkspacePanel({
  workspace,
  onStartTask,
  onOpenTask,
  onSelectWorkspace,
  onAddWorkspace,
  selectedRole,
  onSelectedRoleChange,
}: TeamWorkspacePanelProps) {
  const language = useLanguage();
  const t = translate;
  const [goal, setGoal] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [availableWorkspaces, setAvailableWorkspaces] = useState<Workspace[]>(
    workspace ? [workspace] : [],
  );
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [isLoadingWorkspaces, setIsLoadingWorkspaces] = useState(true);
  const [isSwitchingWorkspace, setIsSwitchingWorkspace] = useState(false);
  const [isAddingWorkspace, setIsAddingWorkspace] = useState(false);
  const [showAgentBuilder, setShowAgentBuilder] = useState(false);
  const [recentTeamTasks, setRecentTeamTasks] = useState<Task[] | null>(null);
  const [recentTeamTasksError, setRecentTeamTasksError] = useState(false);
  const pageRef = useRef<HTMLElement>(null);
  const goalInputRef = useRef<HTMLTextAreaElement>(null);
  const localizedSelectedRole = selectedRole
    ? getLocalizedAgentRoleText(selectedRole)
    : null;
  const selectedRoleName = selectedRole
    ? localizedSelectedRole?.name ||
      selectedRole.displayName ||
      selectedRole.name
    : "";
  const selectedRoleVisual = selectedRole
    ? getSemanticIconVisual({
        id: selectedRole.id,
        name: selectedRoleName,
        description:
          localizedSelectedRole?.description || selectedRole.description,
        category: String(selectedRole.capabilities?.[0] || ""),
        fallback: Bot,
      })
    : null;
  const SelectedRoleIcon = selectedRoleVisual?.Icon || Bot;
  const workspaceOptions = useMemo(
    () =>
      availableWorkspaces.map((option) => ({
        value: option.id,
        label: getMissionControlScopeName(option.name),
        description:
          option.isTemp || isTempWorkspaceId(option.id)
            ? t(
                "teamWorkspace.workspace.temporaryDescription",
                "Temporary workspace for quick trials",
              )
            : option.path,
      })),
    [availableWorkspaces, language],
  );

  const loadWorkspaces = useCallback(async () => {
    setIsLoadingWorkspaces(true);
    setWorkspaceError(null);
    try {
      const [loaded, temporaryWorkspace] = await Promise.all([
        window.electronAPI.listWorkspaces(),
        window.electronAPI.getTempWorkspace().catch(() => null),
      ]);
      setAvailableWorkspaces(
        mergeTeamWorkspaceOptions(loaded, workspace, temporaryWorkspace),
      );
    } catch (loadError) {
      console.error("Failed to load team workspaces:", loadError);
      setAvailableWorkspaces((current) =>
        mergeTeamWorkspaceOptions(current, workspace, null),
      );
      setWorkspaceError(
        t(
          "teamWorkspace.workspace.loadError",
          "Unable to load workspace list, please try again later.",
        ),
      );
    } finally {
      setIsLoadingWorkspaces(false);
    }
  }, [workspace]);

  useEffect(() => {
    void loadWorkspaces();
  }, [loadWorkspaces]);

  const loadRecentTeamTasks = useCallback(async () => {
    setRecentTeamTasksError(false);
    try {
      const loaded = await window.electronAPI.listRecentTeamTasks(4);
      setRecentTeamTasks(loaded);
    } catch (loadError) {
      console.error("Failed to load recent team tasks:", loadError);
      setRecentTeamTasksError(true);
      setRecentTeamTasks([]);
    }
  }, []);

  useEffect(() => {
    void loadRecentTeamTasks();
    const unsubscribe = window.electronAPI.onTeamRunEvent?.((event) => {
      if (
        event?.type === "team_run_created" ||
        event?.type === "team_run_updated"
      ) {
        void loadRecentTeamTasks();
      }
    });
    return typeof unsubscribe === "function" ? unsubscribe : undefined;
  }, [loadRecentTeamTasks]);

  useLayoutEffect(() => {
    if (showAgentBuilder) return;
    const page = pageRef.current;
    if (!page) return;
    page.scrollTop = 0;
    page.scrollLeft = 0;
  }, [showAgentBuilder]);

  const handleWorkspaceChange = async (workspaceId: string) => {
    const nextWorkspace = availableWorkspaces.find(
      (option) => option.id === workspaceId,
    );
    if (!nextWorkspace || nextWorkspace.id === workspace?.id) return;

    setIsSwitchingWorkspace(true);
    setWorkspaceError(null);
    try {
      await onSelectWorkspace(nextWorkspace);
    } catch (switchError) {
      console.error("Failed to switch team workspace:", switchError);
      setWorkspaceError(
        t(
          "teamWorkspace.workspace.switchError",
          "Unable to switch workspaces, please try again.",
        ),
      );
    } finally {
      setIsSwitchingWorkspace(false);
    }
  };

  const handleAddWorkspace = async () => {
    if (isAddingWorkspace) return;
    setIsAddingWorkspace(true);
    setWorkspaceError(null);
    try {
      await onAddWorkspace();
      await loadWorkspaces();
    } catch (addError) {
      console.error("Failed to add team workspace:", addError);
      setWorkspaceError(
        t(
          "teamWorkspace.workspace.addError",
          "Unable to add workspace, please try again.",
        ),
      );
    } finally {
      setIsAddingWorkspace(false);
    }
  };

  const handleStart = async () => {
    const normalizedGoal = goal.trim();
    if (!workspace || !normalizedGoal || isStarting) return;

    setIsStarting(true);
    setError(null);
    try {
      const started = await onStartTask(
        deriveQuickTeamTaskTitle(normalizedGoal),
        withRunOutputLanguage(normalizedGoal, language),
        workspace,
        selectedRole?.id,
      );
      if (!started) return;
      setGoal("");
      onSelectedRoleChange(null);
    } catch (startError) {
      console.error("Failed to start an automatic team task:", startError);
      setError(
        t(
          "teamWorkspace.quick.error",
          "Unable to start the task, please check the model connection and try again.",
        ),
      );
    } finally {
      setIsStarting(false);
    }
  };

  if (showAgentBuilder) {
    return (
      <SimpleAgentBuilderPanel
        workspace={workspace}
        onBack={() => setShowAgentBuilder(false)}
        onSelectRole={(role) => {
          onSelectedRoleChange(role);
          setShowAgentBuilder(false);
          window.requestAnimationFrame(() => goalInputRef.current?.focus());
        }}
      />
    );
  }

  return (
    <main ref={pageRef} className="main-content team-workspace-main">
      <NeoWorkerPageHeader
        icon={<UsersRound size={20} strokeWidth={1.8} />}
        title={t("teamWorkspace.title", "Agent team")}
        description={t(
          "teamWorkspace.description",
          "Just say what you want, and NeoWorker will automatically do the work and get it done.",
        )}
      />

      {!workspace ? (
        <section className="team-workspace-empty">
          <UsersRound size={30} aria-hidden="true" />
          <h2>{t("teamWorkspace.noWorkspace.title", "Preparing workspace")}</h2>
          <p>
            {t(
              "teamWorkspace.noWorkspace.description",
              "Once the workspace is ready, tasks can be handed off directly to the team.",
            )}
          </p>
        </section>
      ) : (
        <section className="team-workspace-body">
          <div className="team-workspace-quick-view team-workspace-conversation-start">
            <div className="team-workspace-dashboard">
              <div className="team-workspace-current-context">
                <span className="team-workspace-context-label">
                  <FolderOpen size={16} aria-hidden="true" />
                  <span>
                    {t("teamWorkspace.workspace.current", "current workspace")}
                  </span>
                </span>
                <NeoWorkerSelectMenu
                  ariaLabel={t(
                    "teamWorkspace.workspace.selectAria",
                    "Choose the workspace your team uses",
                  )}
                  className="team-workspace-workspace-menu"
                  disabled={isSwitchingWorkspace}
                  icon={<FolderOpen size={14} aria-hidden="true" />}
                  minMenuWidth={360}
                  value={workspace.id}
                  onValueChange={(workspaceId) => {
                    void handleWorkspaceChange(workspaceId);
                  }}
                  options={workspaceOptions}
                  placeholder={
                    isLoadingWorkspaces
                      ? t(
                          "teamWorkspace.workspace.loading",
                          "Loading workspace...",
                        )
                      : t("teamWorkspace.workspace.select", "Select workspace")
                  }
                />
                <button
                  type="button"
                  className="team-workspace-add-workspace"
                  disabled={isAddingWorkspace || isSwitchingWorkspace}
                  onClick={() => void handleAddWorkspace()}
                >
                  <FolderPlus size={14} aria-hidden="true" />
                  {isAddingWorkspace
                    ? t("teamWorkspace.workspace.adding", "Adding...")
                    : t("teamWorkspace.workspace.add", "Add folder")}
                </button>
                <span className="team-workspace-context-note">
                  {t(
                    "teamWorkspace.workspace.note",
                    "Teams will prioritize files and context here",
                  )}
                </span>
              </div>
              {workspaceError ? (
                <div className="team-workspace-context-error" role="alert">
                  {workspaceError}
                  <button type="button" onClick={() => void loadWorkspaces()}>
                    {t("teamWorkspace.workspace.retry", "Try again")}
                  </button>
                </div>
              ) : null}

              <div className="team-workspace-start-layout">
                <form
                  className="team-workspace-quick-start team-workspace-quick-start-simple"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void handleStart();
                  }}
                >
                  <div className="team-workspace-quick-heading team-workspace-quick-heading-simple">
                    <span className="team-workspace-quick-icon">
                      <Sparkles size={20} aria-hidden="true" />
                    </span>
                    <div>
                      <h2>
                        {selectedRole
                          ? t(
                              "teamWorkspace.quick.selectedQuestion",
                              "What should {name} accomplish?",
                              { name: selectedRoleName },
                            )
                          : t(
                              "teamWorkspace.quick.question",
                              "What do you want the team to accomplish today?",
                            )}
                      </h2>
                      <p>
                        {selectedRole
                          ? translate(
                              "generated.components.teamworkspacepanel.459.16",
                              'Write down the specific tasks first, and the experts will only execute them after clicking "Start Task".',
                            )
                          : t(
                              "teamWorkspace.quick.helper",
                              "There is no need to choose a character, model or tool, just describe the task.",
                            )}
                      </p>
                    </div>
                  </div>

                  {selectedRole && selectedRoleVisual ? (
                    <div className="team-workspace-selected-expert">
                      <span className="team-workspace-selected-expert-icon">
                        <SelectedRoleIcon
                          size={18}
                          strokeWidth={1.8}
                          aria-hidden="true"
                        />
                      </span>
                      <span>
                        <small>
                          {translate(
                            "generated.components.teamworkspacepanel.478.17",
                            "Expert selected",
                          )}
                        </small>
                        <strong>{selectedRoleName}</strong>
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowAgentBuilder(true)}
                      >
                        {translate(
                          "generated.components.teamworkspacepanel.485.18",
                          "Replace",
                        )}
                      </button>
                      <button
                        type="button"
                        className="team-workspace-selected-expert-remove"
                        onClick={() => onSelectedRoleChange(null)}
                        aria-label={t(
                          "teamWorkspace.quick.deselectRole",
                          "Deselect {name}",
                          { name: selectedRoleName },
                        )}
                      >
                        <X size={15} aria-hidden="true" />
                      </button>
                    </div>
                  ) : null}

                  <label
                    className="team-workspace-goal"
                    htmlFor="team-quick-goal"
                  >
                    <span className="sr-only">
                      {t("teamWorkspace.quick.goalLabel", "Describe the task")}
                    </span>
                    <textarea
                      ref={goalInputRef}
                      id="team-quick-goal"
                      value={goal}
                      onChange={(event) => {
                        setGoal(event.target.value);
                        if (error) setError(null);
                      }}
                      onKeyDown={(event) => {
                        if (
                          (event.metaKey || event.ctrlKey) &&
                          event.key === "Enter"
                        ) {
                          event.preventDefault();
                          void handleStart();
                        }
                      }}
                      placeholder={t(
                        "teamWorkspace.quick.placeholder",
                        "For example: Analyze three major competitors, sort out the differences, and give me a recommendation that I can share directly.",
                      )}
                      rows={5}
                      autoFocus
                    />
                  </label>

                  <div
                    className="team-workspace-suggestions"
                    aria-label={t(
                      "teamWorkspace.quick.examples",
                      "Task example",
                    )}
                  >
                    {QUICK_TEAM_SUGGESTIONS.map((suggestion) => {
                      const SuggestionIcon = suggestion.icon;
                      return (
                        <button
                          key={suggestion.id}
                          type="button"
                          onClick={() => {
                            setGoal(t(suggestion.promptKey, suggestion.prompt));
                            setError(null);
                          }}
                        >
                          <SuggestionIcon size={15} aria-hidden="true" />
                          <span>
                            {t(suggestion.labelKey, suggestion.label)}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {error && (
                    <div className="team-workspace-quick-error" role="alert">
                      {error}
                    </div>
                  )}

                  <div className="team-workspace-quick-footer">
                    <span>
                      {selectedRole && selectedRoleVisual ? (
                        <SelectedRoleIcon size={14} aria-hidden="true" />
                      ) : (
                        <UsersRound size={14} aria-hidden="true" />
                      )}
                      {selectedRole
                        ? t(
                            "teamWorkspace.quick.selectedRoleHint",
                            "{name} will own this task. Selecting an expert does not start execution.",
                            { name: selectedRoleName },
                          )
                        : t(
                            "teamWorkspace.quick.autoHandling",
                            "NeoWorker automatically splits tasks, schedules collaboration, and aggregates results",
                          )}
                    </span>
                    <button type="submit" disabled={!goal.trim() || isStarting}>
                      <Sparkles size={16} aria-hidden="true" />
                      {isStarting
                        ? t("teamWorkspace.quick.starting", "Starting...")
                        : t("teamWorkspace.quick.start", "Start task")}
                    </button>
                  </div>
                </form>

                <aside
                  className="team-workspace-workflow"
                  aria-label={translate(
                    "generated.components.teamworkspacepanel.579.19",
                    "teamwork approach",
                  )}
                >
                  <div className="team-workspace-section-heading">
                    <span className="team-workspace-section-icon">
                      <Workflow size={17} aria-hidden="true" />
                    </span>
                    <div>
                      <h2>
                        {translate(
                          "generated.components.teamworkspacepanel.585.20",
                          "How will the team accomplish",
                        )}
                      </h2>
                      <p>
                        {translate(
                          "generated.components.teamworkspacepanel.586.21",
                          "You just confirm the target and the rest of the process is done automatically.",
                        )}
                      </p>
                    </div>
                  </div>
                  <ol>
                    {TEAM_WORKFLOW_STEPS.map((step) => {
                      const StepIcon = step.icon;
                      return (
                        <li key={step.title}>
                          <span>
                            <StepIcon size={16} aria-hidden="true" />
                          </span>
                          <div>
                            <strong>{step.title}</strong>
                            <p>{step.description}</p>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                  <button
                    type="button"
                    className="team-workspace-expert-entry"
                    onClick={() => setShowAgentBuilder(true)}
                    aria-label={t(
                      "teamWorkspace.agents.createAriaLabel",
                      "Create a long-lasting agent",
                    )}
                  >
                    <span className="team-workspace-expert-entry-icon">
                      <Bot size={18} aria-hidden="true" />
                    </span>
                    <span className="team-workspace-expert-entry-copy">
                      <strong>
                        {t("teamWorkspace.agents.open", "Create an agent")}
                      </strong>
                      <small>
                        {t(
                          "teamWorkspace.agents.description",
                          "Describe in one sentence the work that requires it to be completed over a long period of time",
                        )}
                      </small>
                    </span>
                    <span className="team-workspace-expert-entry-action">
                      {t("teamWorkspace.agents.createAction", "to create")}
                      <ArrowRight size={14} aria-hidden="true" />
                    </span>
                  </button>
                </aside>
              </div>

              <section
                className="team-workspace-recent"
                aria-labelledby="team-recent-title"
              >
                <div className="team-workspace-recent-heading">
                  <div>
                    <h2 id="team-recent-title">
                      {translate(
                        "generated.components.teamworkspacepanel.637.22",
                        "Recent team tasks",
                      )}
                    </h2>
                    <p>
                      {translate(
                        "generated.components.teamworkspacepanel.638.23",
                        "View team results that are being collaborated on or completed.",
                      )}
                    </p>
                  </div>
                  {(recentTeamTasks?.length ?? 0) > 0 && (
                    <span>
                      {recentTeamTasks?.length}{" "}
                      {translate(
                        "generated.components.teamworkspacepanel.641.24",
                        "recent tasks",
                      )}
                    </span>
                  )}
                </div>

                {recentTeamTasks === null ? (
                  <div className="team-workspace-recent-empty">
                    <Clock3 size={18} aria-hidden="true" />
                    <div>
                      <strong>
                        {t(
                          "teamWorkspace.recent.loading",
                          "Loading team tasks...",
                        )}
                      </strong>
                    </div>
                  </div>
                ) : recentTeamTasksError ? (
                  <div className="team-workspace-recent-empty">
                    <UsersRound size={18} aria-hidden="true" />
                    <div>
                      <strong>
                        {t(
                          "teamWorkspace.recent.loadError",
                          "Unable to load team tasks",
                        )}
                      </strong>
                      <p>
                        {t(
                          "teamWorkspace.recent.loadErrorDescription",
                          "The history is still saved. Please try loading it again.",
                        )}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void loadRecentTeamTasks()}
                    >
                      {t("common.retry", "Retry")}
                    </button>
                  </div>
                ) : recentTeamTasks.length > 0 ? (
                  <div className="team-workspace-recent-list">
                    {recentTeamTasks.map((task) => {
                      const status = getTeamTaskStatus(task);
                      return (
                        <button
                          key={task.id}
                          type="button"
                          onClick={() => void onOpenTask(task.id)}
                        >
                          <span
                            className={`team-workspace-task-status ${status.tone}`}
                          >
                            {status.label}
                          </span>
                          <span className="team-workspace-task-copy">
                            <strong>{task.title}</strong>
                            <small>
                              <Clock3 size={12} aria-hidden="true" />
                              {formatTeamTaskTime(task.updatedAt, language)}
                            </small>
                          </span>
                          <ArrowRight size={16} aria-hidden="true" />
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="team-workspace-recent-empty">
                    <UsersRound size={18} aria-hidden="true" />
                    <div>
                      <strong>
                        {translate(
                          "generated.components.teamworkspacepanel.674.25",
                          "There are no team tasks yet",
                        )}
                      </strong>
                      <p>
                        {translate(
                          "generated.components.teamworkspacepanel.675.26",
                          "Describe the goal above and it will appear here once the team starts working on it.",
                        )}
                      </p>
                    </div>
                  </div>
                )}
              </section>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
