import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AlertCircle,
  Archive,
  ArrowLeft,
  ArrowRight,
  Bot,
  CheckCircle2,
  CircleDot,
  ClipboardCheck,
  ChevronDown,
  File,
  FileOutput,
  Files,
  FolderKanban,
  FolderOpen,
  LoaderCircle,
  Link2,
  ListTodo,
  MessageSquareMore,
  RefreshCw,
  Search,
  Star,
  Unlink,
  Users,
} from "lucide-react";
import type {
  AgentRole,
  Project,
  ProjectWorkspaceLink,
  Task,
  TaskEvent,
  Workspace,
} from "../../shared/types";
import { resolveTaskOutputSummaryFromTask } from "../utils/task-outputs";
import { getMissionControlScopeName } from "../utils/mission-control-copy";
import { NeoWorkerSelectMenu } from "./NeoWorkerSelectMenu";
import { NeoWorkerPageHeader } from "./NeoWorkerPageHeader";
import "./project-workspace-view.css";
import { translate } from "../i18n/index";

type ProjectWorkspaceTab =
  "overview" | "tasks" | "files" | "artifacts" | "team";

type ProjectWorkspaceFile = {
  id?: string;
  name: string;
  path: string;
  isDirectory?: boolean;
  modifiedAt?: number;
  workspaceId: string;
  workspaceName: string;
};

type ProjectArtifact = {
  path: string;
  taskId: string;
  taskTitle: string;
  workspaceId: string;
  updatedAt: number;
};

type ProjectWorkspaceViewProps = {
  project: Project;
  links: ProjectWorkspaceLink[];
  workspaces: Workspace[];
  tasks: Task[];
  onBack: () => void;
  onOpenTask: (taskId: string) => void | Promise<void>;
  onStartWork: (
    project: Project,
    workspace: Workspace,
    options?: { draft?: string },
  ) => void;
  onCreateFollowUp: (project: Project) => void;
  onArchive: (project: Project) => void | Promise<void>;
  onLinkWorkspace: (workspaceId: string) => Promise<void>;
  onUnlinkWorkspace: (workspaceId: string) => Promise<void>;
  onSetPrimaryWorkspace: (workspaceId: string) => Promise<void>;
  archiveBusy?: boolean;
};

const projectWorkspaceStateCache = new Map<
  string,
  {
    tab: ProjectWorkspaceTab;
    workspaceId: string;
    query: string;
    scrollTop: number;
  }
>();

export function filterProjectWorkspaceTasks(
  tasks: Task[],
  projectId: string,
  workspaceId = "all",
): Task[] {
  return tasks
    .filter(
      (task) =>
        task.projectId === projectId &&
        (workspaceId === "all" || task.workspaceId === workspaceId),
    )
    .sort(
      (left, right) =>
        (right.updatedAt || right.createdAt) -
        (left.updatedAt || left.createdAt),
    );
}

export function groupProjectTasksBySession(
  tasks: Task[],
): Array<{ sessionId: string; tasks: Task[] }> {
  const groups = new Map<string, Task[]>();
  for (const task of tasks) {
    const sessionId = task.sessionId?.trim() || task.id;
    groups.set(sessionId, [...(groups.get(sessionId) || []), task]);
  }
  return [...groups.entries()]
    .map(([sessionId, sessionTasks]) => ({
      sessionId,
      tasks: [...sessionTasks].sort(
        (left, right) => left.createdAt - right.createdAt,
      ),
    }))
    .sort((left, right) => {
      const leftUpdated = Math.max(
        ...left.tasks.map((task) => task.updatedAt || task.createdAt),
      );
      const rightUpdated = Math.max(
        ...right.tasks.map((task) => task.updatedAt || task.createdAt),
      );
      return rightUpdated - leftUpdated;
    });
}

export function collectProjectRoleIds(tasks: Task[]): string[] {
  const ids = new Set<string>();
  for (const task of tasks) {
    if (task.assignedAgentRoleId) ids.add(task.assignedAgentRoleId);
    task.mentionedAgentRoleIds?.forEach((id) => ids.add(id));
  }
  return [...ids];
}

export interface ProjectProgressSummary {
  total: number;
  active: number;
  completed: number;
  attention: number;
  percent: number;
  label: string;
}

export function summarizeProjectProgress(
  tasks: Task[],
): ProjectProgressSummary {
  const rootTasks = tasks.filter((task) => !task.parentTaskId);
  const active = rootTasks.filter((task) =>
    ["queued", "planning", "executing"].includes(task.status),
  ).length;
  const completed = rootTasks.filter(
    (task) => task.status === "completed",
  ).length;
  const attention = rootTasks.filter((task) =>
    ["paused", "blocked", "failed", "interrupted"].includes(task.status),
  ).length;
  const total = rootTasks.length;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
  const label =
    total === 0
      ? translate(
          "generated.components.projectworkspaceview.174.0",
          "Waiting to start the first job",
        )
      : active > 0
        ? translate(
            "projects.workInProgressCount",
            "{count} jobs in progress",
            {
              count: active,
            },
          )
        : attention > 0
          ? translate(
              "projects.workNeedsAttentionCount",
              "{count} jobs need attention",
              { count: attention },
            )
          : completed === total
            ? translate(
                "generated.components.projectworkspaceview.180.1",
                "The current stage has been completed",
              )
            : translate(
                "projects.workCompletedRatio",
                "{completed}/{total} jobs completed",
                { completed, total },
              );

  return { total, active, completed, attention, percent, label };
}

export function isProjectStageComplete(
  progress: ProjectProgressSummary,
): boolean {
  return (
    progress.total > 0 &&
    progress.active === 0 &&
    progress.attention === 0 &&
    progress.completed === progress.total
  );
}

function statusLabel(status: Task["status"]): string {
  if (["executing", "planning", "queued"].includes(status))
    return translate(
      "generated.components.projectworkspaceview.187.2",
      "In progress",
    );
  if (status === "completed")
    return translate(
      "generated.components.projectworkspaceview.188.3",
      "Completed",
    );
  if (["paused", "blocked"].includes(status))
    return translate(
      "generated.components.projectworkspaceview.189.4",
      "Need attention",
    );
  if (["failed", "cancelled", "interrupted"].includes(status))
    return translate(
      "generated.components.projectworkspaceview.190.5",
      "ended",
    );
  return translate(
    "generated.components.projectworkspaceview.191.6",
    "To be started",
  );
}

function formatRelativeTime(timestamp?: number): string {
  if (!timestamp)
    return translate(
      "generated.components.projectworkspaceview.195.7",
      "No updates yet",
    );
  const elapsed = Math.max(0, Date.now() - timestamp);
  if (elapsed < 60_000)
    return translate(
      "generated.components.projectworkspaceview.197.8",
      "Just now",
    );
  if (elapsed < 3_600_000)
    return translate("activity.time.minutesAgo", "{count} minutes ago", {
      count: Math.floor(elapsed / 60_000),
    });
  if (elapsed < 86_400_000)
    return translate("activity.time.hoursAgo", "{count} hours ago", {
      count: Math.floor(elapsed / 3_600_000),
    });
  return translate("activity.time.daysAgo", "{count} days ago", {
    count: Math.floor(elapsed / 86_400_000),
  });
}

function pathName(path: string): string {
  return path.replace(/\\/g, "/").split("/").filter(Boolean).pop() || path;
}

export function ProjectWorkspaceView({
  project,
  links,
  workspaces,
  tasks,
  onBack,
  onOpenTask,
  onStartWork,
  onCreateFollowUp,
  onArchive,
  onLinkWorkspace,
  onUnlinkWorkspace,
  onSetPrimaryWorkspace,
  archiveBusy = false,
}: ProjectWorkspaceViewProps) {
  const cached = projectWorkspaceStateCache.get(project.id);
  const [tab, setTab] = useState<ProjectWorkspaceTab>(
    cached?.tab || "overview",
  );
  const [workspaceId, setWorkspaceId] = useState(cached?.workspaceId || "all");
  const [query, setQuery] = useState(cached?.query || "");
  const [files, setFiles] = useState<ProjectWorkspaceFile[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [filesError, setFilesError] = useState<string | null>(null);
  const [artifacts, setArtifacts] = useState<ProjectArtifact[]>([]);
  const [artifactsLoading, setArtifactsLoading] = useState(false);
  const [artifactsError, setArtifactsError] = useState<string | null>(null);
  const [roles, setRoles] = useState<AgentRole[]>([]);
  const [rolesLoading, setRolesLoading] = useState(false);
  const [rolesError, setRolesError] = useState<string | null>(null);
  const [workspaceToLink, setWorkspaceToLink] = useState("");
  const [workspaceMutation, setWorkspaceMutation] = useState<string | null>(
    null,
  );
  const [workspaceMutationError, setWorkspaceMutationError] = useState<
    string | null
  >(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const filesRequestRef = useRef(0);
  const artifactsRequestRef = useRef(0);
  const rolesRequestRef = useRef(0);

  const linkedWorkspaces = useMemo(() => {
    const byId = new Map(
      workspaces.map((workspace) => [workspace.id, workspace]),
    );
    return links
      .filter((link) => link.projectId === project.id)
      .sort((left, right) => Number(right.isPrimary) - Number(left.isPrimary))
      .map((link) => ({ link, workspace: byId.get(link.workspaceId) }))
      .filter(
        (item): item is { link: ProjectWorkspaceLink; workspace: Workspace } =>
          Boolean(item.workspace),
      );
  }, [links, project.id, workspaces]);

  const primaryWorkspace =
    linkedWorkspaces.find((item) => item.link.isPrimary)?.workspace ||
    linkedWorkspaces[0]?.workspace;
  const linkedWorkspaceIds = useMemo(
    () => new Set(linkedWorkspaces.map((item) => item.workspace.id)),
    [linkedWorkspaces],
  );
  const workspaceFilterOptions = useMemo(
    () => [
      {
        value: "all",
        label: translate(
          "generated.components.projectworkspaceview.274.9",
          "All associated workspaces",
        ),
        description: translate(
          "projects.workspaceCount",
          "{count} workspaces in this project",
          { count: linkedWorkspaces.length },
        ),
      },
      ...linkedWorkspaces.map(({ link, workspace }) => ({
        value: workspace.id,
        label: getMissionControlScopeName(workspace.name),
        description: workspace.path,
        badge: link.isPrimary
          ? translate(
              "generated.components.projectworkspaceview.281.10",
              "main",
            )
          : undefined,
      })),
    ],
    [linkedWorkspaces],
  );
  const unlinkedWorkspaces = useMemo(
    () =>
      workspaces.filter((workspace) => !linkedWorkspaceIds.has(workspace.id)),
    [linkedWorkspaceIds, workspaces],
  );
  const scopedTasks = useMemo(
    () => filterProjectWorkspaceTasks(tasks, project.id, workspaceId),
    [project.id, tasks, workspaceId],
  );
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleTasks = useMemo(
    () =>
      normalizedQuery
        ? scopedTasks.filter((task) =>
            [task.title, task.prompt, task.semanticSummary].some((value) =>
              String(value || "")
                .toLocaleLowerCase()
                .includes(normalizedQuery),
            ),
          )
        : scopedTasks,
    [normalizedQuery, scopedTasks],
  );
  const sessionGroups = useMemo(
    () => groupProjectTasksBySession(visibleTasks),
    [visibleTasks],
  );
  const roleIds = useMemo(
    () => collectProjectRoleIds(scopedTasks),
    [scopedTasks],
  );

  const saveState = useCallback(
    (scrollTop = bodyRef.current?.scrollTop || 0) => {
      projectWorkspaceStateCache.set(project.id, {
        tab,
        workspaceId,
        query,
        scrollTop,
      });
    },
    [project.id, query, tab, workspaceId],
  );

  useLayoutEffect(() => {
    const state = projectWorkspaceStateCache.get(project.id);
    const frame = window.requestAnimationFrame(() => {
      if (bodyRef.current) bodyRef.current.scrollTop = state?.scrollTop || 0;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [project.id]);

  useEffect(() => {
    if (workspaceId !== "all" && !linkedWorkspaceIds.has(workspaceId))
      setWorkspaceId("all");
  }, [linkedWorkspaceIds, workspaceId]);

  useEffect(() => {
    if (
      workspaceToLink &&
      unlinkedWorkspaces.some((workspace) => workspace.id === workspaceToLink)
    )
      return;
    setWorkspaceToLink(unlinkedWorkspaces[0]?.id || "");
  }, [unlinkedWorkspaces, workspaceToLink]);

  useEffect(() => () => saveState(), [saveState]);
  useEffect(() => saveState(), [query, saveState, tab, workspaceId]);

  const loadFiles = useCallback(async () => {
    const requestId = ++filesRequestRef.current;
    setFiles([]);
    setFilesError(null);
    setFilesLoading(true);
    try {
      const targets = linkedWorkspaces.filter(
        (item) => workspaceId === "all" || item.workspace.id === workspaceId,
      );
      const results = await Promise.all(
        targets.map(async ({ workspace }) => {
          const entries = await window.electronAPI.listHubFiles({
            source: "local",
            path: workspace.path,
            limit: 250,
          });
          return (Array.isArray(entries) ? entries : []).map((entry) => ({
            id: typeof entry.id === "string" ? entry.id : undefined,
            name: String(entry.name || pathName(String(entry.path || ""))),
            path: String(entry.path || ""),
            isDirectory: Boolean(entry.isDirectory),
            modifiedAt:
              typeof entry.modifiedAt === "number"
                ? entry.modifiedAt
                : undefined,
            workspaceId: workspace.id,
            workspaceName: workspace.name,
          }));
        }),
      );
      if (requestId === filesRequestRef.current) {
        setFiles(results.flat().filter((entry) => Boolean(entry.path)));
      }
    } catch (error) {
      console.error("Failed to load project workspace files:", error);
      if (requestId === filesRequestRef.current) {
        setFiles([]);
        setFilesError(
          translate(
            "generated.components.projectworkspaceview.392.11",
            "Failed to read the project file, please check the workspace permissions and try again.",
          ),
        );
      }
    } finally {
      if (requestId === filesRequestRef.current) setFilesLoading(false);
    }
  }, [linkedWorkspaces, workspaceId]);

  const loadArtifacts = useCallback(async () => {
    const requestId = ++artifactsRequestRef.current;
    setArtifacts([]);
    setArtifactsError(null);
    setArtifactsLoading(true);
    try {
      const rootTasks = scopedTasks
        .filter((task) => !task.parentTaskId)
        .slice(0, 120);
      const results = await Promise.all(
        rootTasks.map(async (task) => {
          const events = (await window.electronAPI.getTaskEvents(
            task.id,
          )) as TaskEvent[];
          const summary = resolveTaskOutputSummaryFromTask(task, events);
          const paths = summary?.created.length
            ? summary.created
            : summary?.modifiedFallback || [];
          return paths.map((path) => ({
            path,
            taskId: task.id,
            taskTitle:
              task.title ||
              task.prompt ||
              translate(
                "generated.components.projectworkspaceview.420.12",
                "Unnamed task",
              ),
            workspaceId: task.workspaceId,
            updatedAt: task.updatedAt || task.createdAt,
          }));
        }),
      );
      const deduped = new Map<string, ProjectArtifact>();
      for (const artifact of results.flat()) {
        const key = `${artifact.workspaceId}:${artifact.path}`;
        const current = deduped.get(key);
        if (!current || artifact.updatedAt > current.updatedAt)
          deduped.set(key, artifact);
      }
      if (requestId === artifactsRequestRef.current) {
        setArtifacts(
          [...deduped.values()].sort(
            (left, right) => right.updatedAt - left.updatedAt,
          ),
        );
      }
    } catch (error) {
      console.error("Failed to load project artifacts:", error);
      if (requestId === artifactsRequestRef.current) {
        setArtifacts([]);
        setArtifactsError(
          translate(
            "generated.components.projectworkspaceview.444.13",
            "Project product summary failed, please try again.",
          ),
        );
      }
    } finally {
      if (requestId === artifactsRequestRef.current) setArtifactsLoading(false);
    }
  }, [scopedTasks]);

  const loadRoles = useCallback(async () => {
    const requestId = ++rolesRequestRef.current;
    setRolesError(null);
    setRolesLoading(true);
    try {
      const loaded = (await window.electronAPI.getAgentRoles(
        true,
      )) as AgentRole[];
      if (requestId === rolesRequestRef.current)
        setRoles(Array.isArray(loaded) ? loaded : []);
    } catch (error) {
      console.error("Failed to load project team:", error);
      if (requestId === rolesRequestRef.current) {
        setRoles([]);
        setRolesError(
          translate(
            "generated.components.projectworkspaceview.465.14",
            "Project team failed to load, please try again.",
          ),
        );
      }
    } finally {
      if (requestId === rolesRequestRef.current) setRolesLoading(false);
    }
  }, []);

  const runWorkspaceMutation = useCallback(
    async (key: string, action: () => Promise<void>) => {
      if (workspaceMutation) return;
      setWorkspaceMutation(key);
      setWorkspaceMutationError(null);
      try {
        await action();
      } catch (error) {
        console.error("Failed to update project workspace links:", error);
        setWorkspaceMutationError(
          error instanceof Error
            ? error.message
            : translate(
                "generated.components.projectworkspaceview.484.15",
                "Workspace association update failed, please try again.",
              ),
        );
      } finally {
        setWorkspaceMutation(null);
      }
    },
    [workspaceMutation],
  );

  useEffect(() => {
    if (tab === "files") void loadFiles();
  }, [loadFiles, tab]);
  useEffect(() => {
    if (tab === "artifacts") void loadArtifacts();
  }, [loadArtifacts, tab]);
  useEffect(() => {
    if (tab === "team") void loadRoles();
  }, [loadRoles, tab]);

  const visibleFiles = useMemo(
    () =>
      files.filter((file) =>
        normalizedQuery
          ? `${file.name} ${file.path} ${file.workspaceName}`
              .toLocaleLowerCase()
              .includes(normalizedQuery)
          : true,
      ),
    [files, normalizedQuery],
  );
  const visibleArtifacts = useMemo(
    () =>
      artifacts.filter((artifact) =>
        normalizedQuery
          ? `${artifact.path} ${artifact.taskTitle}`
              .toLocaleLowerCase()
              .includes(normalizedQuery)
          : true,
      ),
    [artifacts, normalizedQuery],
  );
  const visibleRoles = useMemo(() => {
    const allowed = new Set(roleIds);
    return roles.filter(
      (role) =>
        allowed.has(role.id) &&
        (!normalizedQuery ||
          `${role.displayName} ${role.name} ${role.description || ""}`
            .toLocaleLowerCase()
            .includes(normalizedQuery)),
    );
  }, [normalizedQuery, roleIds, roles]);

  const progress = useMemo(
    () => summarizeProjectProgress(scopedTasks),
    [scopedTasks],
  );
  const stageComplete = isProjectStageComplete(progress);
  const rootTasks = useMemo(
    () => scopedTasks.filter((task) => !task.parentTaskId),
    [scopedTasks],
  );
  const nextActionTasks = useMemo(
    () =>
      rootTasks
        .filter((task) =>
          [
            "blocked",
            "paused",
            "failed",
            "interrupted",
            "executing",
            "planning",
            "queued",
            "pending",
          ].includes(task.status),
        )
        .sort((left, right) => {
          const priority = (task: Task) =>
            ["blocked", "paused", "failed", "interrupted"].includes(task.status)
              ? 0
              : 1;
          return (
            priority(left) - priority(right) ||
            (right.updatedAt || right.createdAt) -
              (left.updatedAt || left.createdAt)
          );
        })
        .slice(0, 3),
    [rootTasks],
  );
  const outcomeTasks = useMemo(
    () => rootTasks.filter((task) => task.status === "completed").slice(0, 3),
    [rootTasks],
  );

  return (
    <main className="main-content project-workspace-main">
      <NeoWorkerPageHeader
        icon={<FolderKanban size={20} strokeWidth={1.8} />}
        title={project.name}
        description={translate(
          "generated.components.projectworkspaceview.584.16",
          "Continuously review goals, progress, results, and next steps.",
        )}
        actions={
          <div className="project-workspace-header-actions">
            <button
              type="button"
              className="project-workspace-secondary"
              onClick={onBack}
            >
              <ArrowLeft size={15} />{" "}
              {translate(
                "generated.components.projectworkspaceview.592.17",
                "Return items",
              )}
            </button>
            <button
              type="button"
              className="project-workspace-primary"
              disabled={
                !primaryWorkspace ||
                project.status !== "active" ||
                Boolean(project.archivedAt)
              }
              title={
                project.status !== "active"
                  ? translate(
                      "generated.components.projectworkspaceview.604.18",
                      "Only ongoing projects can create new jobs",
                    )
                  : undefined
              }
              onClick={() => {
                if (!primaryWorkspace) return;
                onStartWork(
                  project,
                  primaryWorkspace,
                  stageComplete
                    ? {
                        draft: translate(
                          "projects.reviewPrompt",
                          "Review the current stage of this project. Summarize completed work, key decisions, deliverables, unresolved issues, and recommend the next phase.",
                        ),
                      }
                    : undefined,
                );
              }}
            >
              {stageComplete
                ? translate("projects.action.review", "Review this stage")
                : progress.total > 0
                  ? translate("projects.action.continue", "Continue")
                  : translate("projects.action.start", "Start first task")}{" "}
              <ArrowRight size={15} />
            </button>
          </div>
        }
      />

      <section
        className="project-workspace-scope"
        aria-label={translate(
          "generated.components.projectworkspaceview.620.21",
          "Unified filter conditions for projects",
        )}
      >
        <div className="project-workspace-scope-copy">
          <span>
            {translate(
              "generated.components.projectworkspaceview.623.22",
              "project context",
            )}
          </span>
          <strong>{project.name}</strong>
          <small>
            {translate(
              "generated.components.projectworkspaceview.625.23",
              "Tasks, files, products, and teams share the following filters",
            )}
          </small>
        </div>
        <div className="project-workspace-filter-field">
          <span>
            {translate(
              "generated.components.projectworkspaceview.628.24",
              "workspace",
            )}
          </span>
          <NeoWorkerSelectMenu
            ariaLabel={translate(
              "generated.components.projectworkspaceview.630.25",
              "Filter project content by workspace",
            )}
            className="project-workspace-filter-menu"
            icon={<FolderOpen size={14} strokeWidth={1.8} />}
            minMenuWidth={320}
            value={workspaceId}
            onValueChange={setWorkspaceId}
            options={workspaceFilterOptions}
          />
        </div>
        <label className="project-workspace-search">
          <Search size={15} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={translate(
              "generated.components.projectworkspaceview.644.26",
              "Search current project…",
            )}
          />
        </label>
      </section>

      <nav
        className="project-workspace-tabs"
        aria-label={translate(
          "generated.components.projectworkspaceview.649.27",
          "Project page",
        )}
      >
        {(
          [
            [
              "overview",
              translate(
                "generated.components.projectworkspaceview.652.28",
                "Overview",
              ),
              CircleDot,
            ],
            [
              "tasks",
              translate(
                "generated.components.projectworkspaceview.653.29",
                "Task",
              ),
              MessageSquareMore,
            ],
            [
              "files",
              translate(
                "generated.components.projectworkspaceview.654.30",
                "File",
              ),
              Files,
            ],
            [
              "artifacts",
              translate(
                "generated.components.projectworkspaceview.655.31",
                "product",
              ),
              FileOutput,
            ],
            [
              "team",
              translate(
                "generated.components.projectworkspaceview.656.32",
                "team",
              ),
              Users,
            ],
          ] as const
        ).map(([value, label, Icon]) => (
          <button
            type="button"
            key={value}
            className={tab === value ? "active" : ""}
            onClick={() => setTab(value)}
          >
            <Icon size={16} /> {label}
          </button>
        ))}
      </nav>

      <div
        className="project-workspace-body"
        ref={bodyRef}
        onScroll={(event) => saveState(event.currentTarget.scrollTop)}
      >
        {tab === "overview" ? (
          <section className="project-workspace-overview">
            <section
              className="project-workspace-progress-panel"
              aria-labelledby="project-goal-title"
            >
              <div className="project-workspace-goal-copy">
                <span>{translate("projects.goal.label", "Project goal")}</span>
                <h2 id="project-goal-title">
                  {project.description ||
                    translate(
                      "generated.components.projectworkspaceview.684.34",
                      "Project goals have not been filled in yet",
                    )}
                </h2>
                <p>
                  {stageComplete
                    ? translate(
                        "projects.stageComplete.description",
                        "The planned work for this stage is complete. Review the outcomes, begin a new phase, or archive the project.",
                      )
                    : translate(
                        "generated.components.projectworkspaceview.687.35",
                        "New jobs will automatically bring this target and main workspace, and there is no need to repeat the background.",
                      )}
                </p>
                <div className="project-workspace-goal-actions">
                  <button
                    type="button"
                    disabled={
                      !primaryWorkspace ||
                      project.status !== "active" ||
                      Boolean(project.archivedAt)
                    }
                    onClick={() => {
                      if (!primaryWorkspace) return;
                      onStartWork(
                        project,
                        primaryWorkspace,
                        stageComplete
                          ? {
                              draft: translate(
                                "projects.reviewPrompt",
                                "Review the current stage of this project. Summarize completed work, key decisions, deliverables, unresolved issues, and recommend the next phase.",
                              ),
                            }
                          : undefined,
                      );
                    }}
                  >
                    {stageComplete
                      ? translate("projects.action.review", "Review this stage")
                      : progress.total > 0
                        ? translate("projects.action.continue", "Continue")
                        : translate(
                            "projects.action.start",
                            "Start first task",
                          )}{" "}
                    <ArrowRight size={15} />
                  </button>
                  {stageComplete ? (
                    <>
                      <button
                        type="button"
                        className="secondary"
                        disabled={!primaryWorkspace}
                        onClick={() =>
                          primaryWorkspace &&
                          onStartWork(project, primaryWorkspace)
                        }
                      >
                        {translate(
                          "projects.action.nextPhase",
                          "Start next phase",
                        )}
                      </button>
                      <button
                        type="button"
                        className="quiet"
                        onClick={() => onCreateFollowUp(project)}
                      >
                        {translate(
                          "projects.action.createFollowUp",
                          "Create follow-up project",
                        )}
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
              <div className="project-workspace-progress-summary">
                <div>
                  <span>
                    {translate(
                      "generated.components.projectworkspaceview.706.38",
                      "Current progress",
                    )}
                  </span>
                  <strong>{progress.percent}%</strong>
                </div>
                <div
                  className="project-workspace-progress-line"
                  role="progressbar"
                  aria-label={translate(
                    "generated.components.projectworkspaceview.712.39",
                    "Project completion progress",
                  )}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={progress.percent}
                >
                  <span style={{ width: `${progress.percent}%` }} />
                </div>
                <p>{progress.label}</p>
                <dl>
                  <div>
                    <dt>
                      {translate(
                        "generated.components.projectworkspaceview.722.40",
                        "In progress",
                      )}
                    </dt>
                    <dd>{progress.active}</dd>
                  </div>
                  <div>
                    <dt>
                      {translate(
                        "generated.components.projectworkspaceview.726.41",
                        "Need to be processed",
                      )}
                    </dt>
                    <dd>{progress.attention}</dd>
                  </div>
                  <div>
                    <dt>
                      {translate(
                        "generated.components.projectworkspaceview.730.42",
                        "Completed",
                      )}
                    </dt>
                    <dd>{progress.completed}</dd>
                  </div>
                </dl>
              </div>
            </section>

            <div className="project-workspace-focus-grid">
              <section className="project-workspace-focus-section">
                <header>
                  <span>
                    <ListTodo size={17} />
                  </span>
                  <div>
                    <h2>
                      {translate(
                        "generated.components.projectworkspaceview.744.43",
                        "next steps",
                      )}
                    </h2>
                    <p>
                      {translate(
                        "generated.components.projectworkspaceview.745.44",
                        "Prioritize work that is in progress and needs to be processed.",
                      )}
                    </p>
                  </div>
                </header>
                {nextActionTasks.map((task) => (
                  <button
                    type="button"
                    className="project-workspace-focus-row"
                    key={task.id}
                    onClick={() => void onOpenTask(task.id)}
                  >
                    <span>
                      <strong>
                        {task.title ||
                          task.prompt ||
                          translate(
                            "generated.components.projectworkspaceview.757.45",
                            "Unnamed task",
                          )}
                      </strong>
                      <small>
                        {statusLabel(task.status)}，
                        {formatRelativeTime(task.updatedAt)}
                      </small>
                    </span>
                    <ArrowRight size={15} />
                  </button>
                ))}
                {nextActionTasks.length === 0 ? (
                  <div className="project-workspace-quiet-empty">
                    <CheckCircle2 size={18} />
                    <span>
                      {progress.total > 0
                        ? translate(
                            "generated.components.projectworkspaceview.772.46",
                            "There are currently no matters to be advanced",
                          )
                        : translate(
                            "generated.components.projectworkspaceview.773.47",
                            "After the first job is created, subsequent actions will appear here",
                          )}
                    </span>
                  </div>
                ) : null}
              </section>

              <section className="project-workspace-focus-section">
                <header>
                  <span>
                    <ClipboardCheck size={17} />
                  </span>
                  <div>
                    <h2>
                      {translate(
                        "generated.components.projectworkspaceview.785.48",
                        "key results",
                      )}
                    </h2>
                    <p>
                      {translate(
                        "generated.components.projectworkspaceview.786.49",
                        "Records of work completed and its delivery.",
                      )}
                    </p>
                  </div>
                </header>
                {outcomeTasks.map((task) => (
                  <button
                    type="button"
                    className="project-workspace-focus-row"
                    key={task.id}
                    onClick={() => void onOpenTask(task.id)}
                  >
                    <span>
                      <strong>
                        {task.title ||
                          task.prompt ||
                          translate(
                            "generated.components.projectworkspaceview.798.50",
                            "Unnamed task",
                          )}
                      </strong>
                      <small>
                        {translate(
                          "generated.components.projectworkspaceview.801.51",
                          "completed,",
                        )}
                        {formatRelativeTime(task.completedAt || task.updatedAt)}
                      </small>
                    </span>
                    <ArrowRight size={15} />
                  </button>
                ))}
                {outcomeTasks.length === 0 ? (
                  <div className="project-workspace-quiet-empty">
                    <FileOutput size={18} />
                    <span>
                      {translate(
                        "generated.components.projectworkspaceview.811.52",
                        "After completing the work, the key results will be deposited here",
                      )}
                    </span>
                  </div>
                ) : null}
                <button
                  type="button"
                  className="project-workspace-text-action"
                  onClick={() => setTab("artifacts")}
                >
                  {translate(
                    "generated.components.projectworkspaceview.819.53",
                    "View all products",
                  )}
                  <ArrowRight size={14} />
                </button>
              </section>
            </div>

            <details className="project-workspace-context-settings">
              <summary>
                <FolderOpen size={17} />
                <span>
                  <strong>
                    {translate(
                      "generated.components.projectworkspaceview.828.54",
                      "Workspace and context",
                    )}
                  </strong>
                  <small>
                    {linkedWorkspaces.length}{" "}
                    {translate(
                      "generated.components.projectworkspaceview.830.55",
                      "workspace, files remain in their original location",
                    )}
                  </small>
                </span>
                <ChevronDown size={16} />
              </summary>
              <div className="project-workspace-context-settings-body">
                <div className="project-workspace-context-list project-workspace-managed-links">
                  {linkedWorkspaces.map(({ link, workspace }) => (
                    <span key={workspace.id}>
                      <FolderOpen size={14} />
                      <b>{workspace.name}</b>
                      {link.isPrimary ? (
                        <em>
                          <Star size={11} />
                          {translate(
                            "generated.components.projectworkspaceview.844.56",
                            "main",
                          )}
                        </em>
                      ) : (
                        <button
                          type="button"
                          disabled={Boolean(workspaceMutation)}
                          onClick={() =>
                            void runWorkspaceMutation(
                              `primary:${workspace.id}`,
                              () => onSetPrimaryWorkspace(workspace.id),
                            )
                          }
                        >
                          {translate(
                            "generated.components.projectworkspaceview.857.57",
                            "Make primary",
                          )}
                        </button>
                      )}
                      <button
                        type="button"
                        className="danger"
                        disabled={
                          Boolean(workspaceMutation) ||
                          linkedWorkspaces.length <= 1 ||
                          link.isPrimary
                        }
                        title={
                          link.isPrimary
                            ? translate(
                                "generated.components.projectworkspaceview.870.58",
                                "Please make another workspace primary first",
                              )
                            : linkedWorkspaces.length <= 1
                              ? translate(
                                  "generated.components.projectworkspaceview.872.59",
                                  "Projects must maintain a workspace",
                                )
                              : undefined
                        }
                        onClick={() =>
                          void runWorkspaceMutation(
                            `unlink:${workspace.id}`,
                            () => onUnlinkWorkspace(workspace.id),
                          )
                        }
                      >
                        <Unlink size={12} />
                        {translate(
                          "generated.components.projectworkspaceview.883.60",
                          "Remove",
                        )}
                      </button>
                    </span>
                  ))}
                </div>
                <div className="project-workspace-link-form">
                  <NeoWorkerSelectMenu
                    ariaLabel={translate(
                      "generated.components.projectworkspaceview.890.61",
                      "Select the workspace to associate",
                    )}
                    className="project-workspace-link-menu"
                    disabled={
                      unlinkedWorkspaces.length === 0 ||
                      Boolean(workspaceMutation)
                    }
                    icon={<FolderOpen size={14} strokeWidth={1.8} />}
                    minMenuWidth={360}
                    value={workspaceToLink}
                    onValueChange={setWorkspaceToLink}
                    options={unlinkedWorkspaces.map((workspace) => ({
                      value: workspace.id,
                      label: getMissionControlScopeName(workspace.name),
                      description: workspace.path,
                    }))}
                    placeholder={
                      unlinkedWorkspaces.length === 0
                        ? translate(
                            "generated.components.projectworkspaceview.907.62",
                            "All workspaces are linked",
                          )
                        : translate(
                            "generated.components.projectworkspaceview.908.63",
                            "Select workspace",
                          )
                    }
                  />
                  <button
                    type="button"
                    disabled={!workspaceToLink || Boolean(workspaceMutation)}
                    onClick={() =>
                      void runWorkspaceMutation(`link:${workspaceToLink}`, () =>
                        onLinkWorkspace(workspaceToLink),
                      )
                    }
                  >
                    <Link2 size={13} />
                    {workspaceMutation?.startsWith("link:")
                      ? translate(
                          "generated.components.projectworkspaceview.922.64",
                          "Connecting…",
                        )
                      : translate(
                          "generated.components.projectworkspaceview.923.65",
                          "Associated workspace",
                        )}
                  </button>
                </div>
                {workspaceMutationError ? (
                  <div className="project-workspace-inline-error" role="alert">
                    <AlertCircle size={14} />
                    {workspaceMutationError}
                  </div>
                ) : null}
              </div>
            </details>
          </section>
        ) : null}

        {tab === "tasks" ? (
          <section className="project-workspace-list-section">
            <header>
              <div>
                <h2>
                  {translate(
                    "generated.components.projectworkspaceview.941.66",
                    "Project tasks and sessions",
                  )}
                </h2>
                <p>
                  {translate(
                    "generated.components.projectworkspaceview.942.67",
                    "Organized by session, task nodes of the same work are kept together.",
                  )}
                </p>
              </div>
              <span>{visibleTasks.length}</span>
            </header>
            {sessionGroups.map((group) => (
              <article className="project-session-group" key={group.sessionId}>
                <div className="project-session-group-heading">
                  <span>
                    {translate(
                      "generated.components.projectworkspaceview.949.68",
                      "session",
                    )}
                    {group.sessionId.slice(0, 8)}
                  </span>
                  <small>
                    {group.tasks.length}{" "}
                    {translate(
                      "generated.components.projectworkspaceview.950.69",
                      "nodes",
                    )}
                  </small>
                </div>
                {group.tasks.map((task) => (
                  <button
                    type="button"
                    className="project-workspace-task-row"
                    key={task.id}
                    onClick={() => void onOpenTask(task.id)}
                  >
                    <span
                      className={`project-task-status-dot status-${task.status}`}
                    />
                    <span>
                      <strong>
                        {task.title ||
                          task.prompt ||
                          translate(
                            "generated.components.projectworkspaceview.964.70",
                            "Unnamed task",
                          )}
                      </strong>
                      <small>
                        {statusLabel(task.status)} ·{" "}
                        {task.parentTaskId
                          ? translate(
                              "generated.components.projectworkspaceview.969.71",
                              "subtask",
                            )
                          : task.branchFromTaskId
                            ? translate(
                                "generated.components.projectworkspaceview.971.72",
                                "branch",
                              )
                            : translate(
                                "generated.components.projectworkspaceview.972.73",
                                "main task",
                              )}{" "}
                        · {formatRelativeTime(task.updatedAt)}
                      </small>
                    </span>
                    <ArrowRight size={15} />
                  </button>
                ))}
              </article>
            ))}
            {sessionGroups.length === 0 ? (
              <ProjectEmpty
                icon={MessageSquareMore}
                title={translate(
                  "generated.components.projectworkspaceview.984.74",
                  "There are no tasks under the current filter",
                )}
              />
            ) : null}
          </section>
        ) : null}

        {tab === "files" ? (
          <section className="project-workspace-list-section">
            <header>
              <div>
                <h2>
                  {translate(
                    "generated.components.projectworkspaceview.994.75",
                    "project files",
                  )}
                </h2>
                <p>
                  {translate(
                    "generated.components.projectworkspaceview.995.76",
                    "Only the associated workspace root is displayed, files remain in their original locations.",
                  )}
                </p>
              </div>
              <button type="button" onClick={() => void loadFiles()}>
                <RefreshCw size={14} />
                {translate(
                  "generated.components.projectworkspaceview.999.77",
                  "Refresh",
                )}
              </button>
            </header>
            {visibleFiles.map((file) => {
              const workspace = linkedWorkspaces.find(
                (item) => item.workspace.id === file.workspaceId,
              )?.workspace;
              return (
                <button
                  type="button"
                  className="project-workspace-file-row"
                  key={`${file.workspaceId}:${file.path}`}
                  onClick={() =>
                    workspace &&
                    void window.electronAPI
                      .openFile(file.path, workspace.path)
                      .catch(() =>
                        setFilesError(
                          translate(
                            "generated.components.projectworkspaceview.1017.78",
                            "This file cannot be opened, please check if it still exists.",
                          ),
                        ),
                      )
                  }
                >
                  {file.isDirectory ? (
                    <FolderOpen size={19} />
                  ) : (
                    <File size={19} />
                  )}
                  <span>
                    <strong>{file.name}</strong>
                    <small>
                      {file.workspaceName} ·{" "}
                      {formatRelativeTime(file.modifiedAt)}
                    </small>
                  </span>
                  <ArrowRight size={15} />
                </button>
              );
            })}
            {filesError ? (
              <ProjectError message={filesError} onRetry={loadFiles} />
            ) : filesLoading ? (
              <ProjectLoading
                label={translate(
                  "generated.components.projectworkspaceview.1041.79",
                  "Reading project file...",
                )}
              />
            ) : visibleFiles.length === 0 ? (
              <ProjectEmpty
                icon={Files}
                title={translate(
                  "generated.components.projectworkspaceview.1043.80",
                  "There are no files under the current filter",
                )}
              />
            ) : null}
          </section>
        ) : null}

        {tab === "artifacts" ? (
          <section className="project-workspace-list-section">
            <header>
              <div>
                <h2>
                  {translate(
                    "generated.components.projectworkspaceview.1052.81",
                    "Project products",
                  )}
                </h2>
                <p>
                  {translate(
                    "generated.components.projectworkspaceview.1053.82",
                    "Aggregate from the current project task events, retaining the association between the product and the source task.",
                  )}
                </p>
              </div>
              <button type="button" onClick={() => void loadArtifacts()}>
                <RefreshCw size={14} />
                {translate(
                  "generated.components.projectworkspaceview.1057.83",
                  "Refresh",
                )}
              </button>
            </header>
            {visibleArtifacts.map((artifact) => (
              <button
                type="button"
                className="project-workspace-file-row"
                key={`${artifact.workspaceId}:${artifact.path}`}
                onClick={() => void onOpenTask(artifact.taskId)}
              >
                <FileOutput size={19} />
                <span>
                  <strong>{pathName(artifact.path)}</strong>
                  <small>
                    {translate(
                      "generated.components.projectworkspaceview.1071.84",
                      "From:",
                    )}
                    {artifact.taskTitle} ·{" "}
                    {formatRelativeTime(artifact.updatedAt)}
                  </small>
                </span>
                <ArrowRight size={15} />
              </button>
            ))}
            {artifactsError ? (
              <ProjectError message={artifactsError} onRetry={loadArtifacts} />
            ) : artifactsLoading ? (
              <ProjectLoading
                label={translate(
                  "generated.components.projectworkspaceview.1081.85",
                  "Summarizing project products...",
                )}
              />
            ) : visibleArtifacts.length === 0 ? (
              <ProjectEmpty
                icon={FileOutput}
                title={translate(
                  "generated.components.projectworkspaceview.1083.86",
                  "There are no products currently filtered",
                )}
              />
            ) : null}
          </section>
        ) : null}

        {tab === "team" ? (
          <section className="project-workspace-list-section">
            <header>
              <div>
                <h2>
                  {translate(
                    "generated.components.projectworkspaceview.1092.87",
                    "project team",
                  )}
                </h2>
                <p>
                  {translate(
                    "generated.components.projectworkspaceview.1093.88",
                    "Automatic aggregation based on the person responsible for the task and the mentioning expert under the current filter.",
                  )}
                </p>
              </div>
              <span>{visibleRoles.length}</span>
            </header>
            <div className="project-team-grid">
              {visibleRoles.map((role) => (
                <article key={role.id}>
                  <span
                    className="project-team-avatar"
                    style={{ background: role.color || "#2563eb" }}
                  >
                    {role.icon || <Bot size={17} />}
                  </span>
                  <div>
                    <strong>{role.displayName || role.name}</strong>
                    <p>
                      {role.description ||
                        translate(
                          "generated.components.projectworkspaceview.1108.89",
                          "Participate in project tasks",
                        )}
                    </p>
                  </div>
                </article>
              ))}
            </div>
            {rolesError ? (
              <ProjectError message={rolesError} onRetry={loadRoles} />
            ) : rolesLoading ? (
              <ProjectLoading
                label={translate(
                  "generated.components.projectworkspaceview.1116.90",
                  "Loading project team...",
                )}
              />
            ) : visibleRoles.length === 0 ? (
              <ProjectEmpty
                icon={Users}
                title={translate(
                  "generated.components.projectworkspaceview.1118.91",
                  "There are no assigned experts under the current filter",
                )}
              />
            ) : null}
          </section>
        ) : null}
      </div>

      <footer className="project-workspace-footer">
        <span>
          {translate(
            "generated.components.projectworkspaceview.1125.92",
            "Filters will persist across pages of this project",
          )}
        </span>
        <button
          type="button"
          onClick={() => void onArchive(project)}
          disabled={
            archiveBusy ||
            project.status !== "active" ||
            Boolean(project.archivedAt)
          }
        >
          <Archive size={14} />{" "}
          {archiveBusy
            ? translate("projects.action.archiving", "Archiving...")
            : translate("projects.action.archive", "Archive project")}
        </button>
      </footer>
    </main>
  );
}

function ProjectLoading({ label }: { label: string }) {
  return (
    <div className="project-workspace-empty">
      <LoaderCircle className="is-spinning" size={22} />
      <strong>{label}</strong>
    </div>
  );
}

function ProjectEmpty({
  icon: Icon,
  title,
}: {
  icon: typeof Files;
  title: string;
}) {
  return (
    <div className="project-workspace-empty">
      <Icon size={22} />
      <strong>{title}</strong>
    </div>
  );
}

function ProjectError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void | Promise<void>;
}) {
  return (
    <div
      className="project-workspace-empty project-workspace-error"
      role="alert"
    >
      <AlertCircle size={22} />
      <strong>{message}</strong>
      <button type="button" onClick={() => void onRetry()}>
        <RefreshCw size={13} />
        {translate(
          "generated.components.projectworkspaceview.1184.97",
          "Try again",
        )}
      </button>
    </div>
  );
}
