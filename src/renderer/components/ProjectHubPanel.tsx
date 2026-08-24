import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive,
  ArrowRight,
  Check,
  Clock3,
  FolderKanban,
  FolderOpen,
  Plus,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  X,
} from "lucide-react";
import type {
  Project,
  ProjectWorkspaceLink,
  Task,
  Workspace,
} from "../../shared/types";
import { isTempWorkspaceId } from "../../shared/types";
import { getMissionControlScopeName } from "../utils/mission-control-copy";
import { NeoWorkerSelectMenu } from "./NeoWorkerSelectMenu";
import { NeoWorkerPageHeader } from "./NeoWorkerPageHeader";
import { ProjectWorkspaceView } from "./ProjectWorkspaceView";
import "./project-hub-panel.css";
import { translate } from "../i18n/index";

interface ProjectHubPanelProps {
  currentWorkspace: Workspace | null;
  currentProjectId: string | null;
  tasks: Task[];
  onSelectProject: (project: Project, workspace: Workspace) => void;
  onOpenTask: (taskId: string) => void | Promise<void>;
  onStartWork: (
    project: Project,
    workspace: Workspace,
    options?: { draft?: string },
  ) => void;
  onProjectArchived?: (projectId: string) => void;
}

interface ProjectTemplate {
  id: string;
  label: string;
  name: string;
  goal: string;
}

const PROJECT_TEMPLATES: ProjectTemplate[] = [
  {
    id: "blank",
    label: translate(
      "generated.components.projecthubpanel.45.0",
      "start from blank",
    ),
    name: "",
    goal: "",
  },
  {
    id: "launch",
    label: translate(
      "generated.components.projecthubpanel.48.1",
      "product launch",
    ),
    name: translate(
      "generated.components.projecthubpanel.49.2",
      "product launch",
    ),
    goal: translate(
      "generated.components.projecthubpanel.50.3",
      "Complete the entire process from preparation, release to review.",
    ),
  },
  {
    id: "research",
    label: translate(
      "generated.components.projecthubpanel.54.4",
      "Continuous research",
    ),
    name: translate(
      "generated.components.projecthubpanel.55.5",
      "Special studies",
    ),
    goal: translate(
      "generated.components.projecthubpanel.56.6",
      "Form traceable research conclusions, data and deliverables.",
    ),
  },
];

export function sortProjectWorkspaces(workspaces: Workspace[]): Workspace[] {
  return [...workspaces]
    .filter(
      (workspace) => !workspace.isTemp && !isTempWorkspaceId(workspace.id),
    )
    .sort(
      (left, right) =>
        (right.lastUsedAt || right.createdAt) -
        (left.lastUsedAt || left.createdAt),
    );
}

export function countWorkspaceTasks(tasks: Task[], workspaceId: string) {
  return countRootTasks(
    tasks.filter((task) => task.workspaceId === workspaceId),
  );
}

export function countProjectTasks(tasks: Task[], projectId: string) {
  return countRootTasks(tasks.filter((task) => task.projectId === projectId));
}

function countRootTasks(tasks: Task[]) {
  return tasks.reduce(
    (counts, task) => {
      if (task.parentTaskId) return counts;
      counts.total += 1;
      if (
        ["executing", "planning", "queued", "paused", "blocked"].includes(
          task.status,
        )
      ) {
        counts.active += 1;
      }
      if (task.status === "completed") counts.completed += 1;
      return counts;
    },
    { total: 0, active: 0, completed: 0 },
  );
}

function formatProjectActivity(timestamp: number | undefined): string {
  if (!timestamp)
    return translate(
      "generated.components.projecthubpanel.102.7",
      "Not started work yet",
    );
  const diff = Math.max(0, Date.now() - timestamp);
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1)
    return translate(
      "generated.components.projecthubpanel.105.8",
      "Just updated",
    );
  if (minutes < 60)
    return translate(
      "projects.updatedMinutesAgo",
      "Updated {count} minutes ago",
      {
        count: minutes,
      },
    );
  const hours = Math.floor(minutes / 60);
  if (hours < 24)
    return translate("projects.updatedHoursAgo", "Updated {count} hours ago", {
      count: hours,
    });
  return translate("projects.updatedDaysAgo", "Updated {count} days ago", {
    count: Math.floor(hours / 24),
  });
}

export function ProjectHubPanel({
  currentWorkspace,
  currentProjectId,
  tasks,
  onSelectProject,
  onOpenTask,
  onStartWork,
  onProjectArchived,
}: ProjectHubPanelProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loadedProjectTasks, setLoadedProjectTasks] = useState<Task[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspaceLinks, setWorkspaceLinks] = useState<ProjectWorkspaceLink[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [archiveBusyId, setArchiveBusyId] = useState<string | null>(null);
  const [detailsProjectId, setDetailsProjectId] = useState<string | null>(
    currentProjectId,
  );
  const [showCreate, setShowCreate] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [workspaceBusy, setWorkspaceBusy] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createGoal, setCreateGoal] = useState("");
  const [createWorkspaceId, setCreateWorkspaceId] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  const persistentWorkspaces = useMemo(
    () => sortProjectWorkspaces(workspaces),
    [workspaces],
  );
  const selectableWorkspaces = useMemo(() => {
    const temporary = workspaces.filter(
      (workspace) => workspace.isTemp || isTempWorkspaceId(workspace.id),
    );
    return [...temporary, ...persistentWorkspaces];
  }, [persistentWorkspaces, workspaces]);
  const createWorkspaceOptions = useMemo(
    () =>
      selectableWorkspaces.map((workspace) => ({
        value: workspace.id,
        label: getMissionControlScopeName(workspace.name),
        description: workspace.path,
        badge:
          workspace.isTemp || isTempWorkspaceId(workspace.id)
            ? translate(
                "generated.components.projecthubpanel.157.9",
                "temporary",
              )
            : undefined,
      })),
    [selectableWorkspaces],
  );

  const loadProjects = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [companies, loadedWorkspaces, loadedTasks] = await Promise.all([
        window.electronAPI.listCompanies(),
        window.electronAPI.listWorkspaces({ includeArchived: false }),
        window.electronAPI.listTasks({ limit: 500 }),
      ]);
      const projectGroups = await Promise.all(
        companies.map((company) =>
          window.electronAPI.listCompanyProjects(company.id, {
            includeArchived: true,
          }),
        ),
      );
      const loadedProjects = projectGroups
        .flat()
        .sort((left, right) => right.updatedAt - left.updatedAt);
      const linkGroups = await Promise.all(
        loadedProjects.map((project) =>
          window.electronAPI.listProjectWorkspaces(project.id),
        ),
      );
      setProjects(loadedProjects);
      setLoadedProjectTasks(loadedTasks);
      setWorkspaceLinks(linkGroups.flat());
      setWorkspaces(loadedWorkspaces);
    } catch (loadError) {
      console.error("Failed to load projects:", loadError);
      setError(
        translate(
          "generated.components.projecthubpanel.193.10",
          "Project loading failed, please try again later.",
        ),
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    if (!detailsProjectId) return;
    let cancelled = false;
    void window.electronAPI
      .listTasks({ projectId: detailsProjectId, limit: 5000 })
      .then((projectTasks) => {
        if (cancelled) return;
        setLoadedProjectTasks((current) => {
          const byId = new Map(current.map((task) => [task.id, task]));
          projectTasks.forEach((task) => byId.set(task.id, task));
          return [...byId.values()];
        });
      })
      .catch((taskLoadError) => {
        if (!cancelled)
          console.error(
            "Failed to load complete project task inventory:",
            taskLoadError,
          );
      });
    return () => {
      cancelled = true;
    };
  }, [detailsProjectId]);

  useEffect(() => {
    if (!showCreate || createWorkspaceId || selectableWorkspaces.length === 0)
      return;
    const preferred = selectableWorkspaces.find(
      (workspace) => workspace.id === currentWorkspace?.id,
    );
    setCreateWorkspaceId((preferred || selectableWorkspaces[0]).id);
  }, [
    createWorkspaceId,
    currentWorkspace?.id,
    selectableWorkspaces,
    showCreate,
  ]);

  const workspaceById = useMemo(
    () => new Map(workspaces.map((workspace) => [workspace.id, workspace])),
    [workspaces],
  );
  const linksByProject = useMemo(() => {
    const map = new Map<string, ProjectWorkspaceLink[]>();
    for (const link of workspaceLinks) {
      map.set(link.projectId, [...(map.get(link.projectId) || []), link]);
    }
    return map;
  }, [workspaceLinks]);
  const activeProjects = useMemo(
    () =>
      projects.filter(
        (project) => project.status !== "archived" && !project.archivedAt,
      ),
    [projects],
  );
  const archivedProjects = useMemo(
    () =>
      projects.filter(
        (project) =>
          project.status === "archived" || Boolean(project.archivedAt),
      ),
    [projects],
  );
  const detailsProject = useMemo(
    () => projects.find((project) => project.id === detailsProjectId) || null,
    [detailsProjectId, projects],
  );
  const taskInventory = useMemo(() => {
    const byId = new Map(loadedProjectTasks.map((task) => [task.id, task]));
    tasks.forEach((task) => byId.set(task.id, task));
    return [...byId.values()];
  }, [loadedProjectTasks, tasks]);

  const getPrimaryWorkspace = useCallback(
    (projectId: string) => {
      const links = linksByProject.get(projectId) || [];
      const primary = links.find((link) => link.isPrimary) || links[0];
      return primary ? workspaceById.get(primary.workspaceId) || null : null;
    },
    [linksByProject, workspaceById],
  );

  const projectTaskMap = useMemo(() => {
    const map = new Map<string, ReturnType<typeof countProjectTasks>>();
    for (const project of projects)
      map.set(project.id, countProjectTasks(taskInventory, project.id));
    return map;
  }, [projects, taskInventory]);

  const recentTasksByProject = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const project of projects) {
      map.set(
        project.id,
        taskInventory
          .filter((task) => task.projectId === project.id && !task.parentTaskId)
          .sort(
            (left, right) =>
              (right.updatedAt || right.createdAt) -
              (left.updatedAt || left.createdAt),
          )
          .slice(0, 3),
      );
    }
    return map;
  }, [projects, taskInventory]);

  const openCreateDialog = useCallback(() => {
    setCreateError(null);
    setCreateName("");
    setCreateGoal("");
    setCreateWorkspaceId("");
    setShowCreate(true);
  }, []);

  const openFollowUpDialog = useCallback(
    (sourceProject: Project) => {
      const sourceWorkspace = getPrimaryWorkspace(sourceProject.id);
      const preferredWorkspace =
        sourceWorkspace ||
        persistentWorkspaces.find(
          (workspace) => workspace.id === currentWorkspace?.id,
        ) ||
        persistentWorkspaces[0];
      setCreateError(null);
      setCreateName(
        translate("projects.followUp.name", "{name} next phase", {
          name: sourceProject.name,
        }),
      );
      setCreateGoal(
        translate(
          "projects.followUp.goal",
          "Continue from the completed stage of {name}, keep the important context, and define the next milestone.",
          { name: sourceProject.name },
        ),
      );
      setCreateWorkspaceId(preferredWorkspace?.id || "");
      setDetailsProjectId(null);
      setShowCreate(true);
    },
    [currentWorkspace?.id, getPrimaryWorkspace, persistentWorkspaces],
  );

  const applyTemplate = useCallback((template: ProjectTemplate) => {
    setCreateName(template.name);
    setCreateGoal(template.goal);
    setCreateError(null);
  }, []);

  const handleAddWorkspace = useCallback(async () => {
    if (workspaceBusy) return;
    setWorkspaceBusy(true);
    setCreateError(null);
    try {
      const folderPath = await window.electronAPI.selectFolder();
      if (!folderPath) return;
      const existing = workspaces.find(
        (workspace) => workspace.path === folderPath,
      );
      if (existing) {
        setCreateWorkspaceId(existing.id);
        return;
      }
      const permissionSettings = await window.electronAPI
        .getPermissionSettings()
        .catch(() => null);
      const workspace = await window.electronAPI.createWorkspace({
        name: folderPath.split(/[\\/]/).filter(Boolean).pop() || "Workspace",
        path: folderPath,
        permissions: {
          read: true,
          write: true,
          delete: true,
          network: false,
          shell: permissionSettings?.defaultShellEnabled === true,
        },
      });
      setWorkspaces((current) => [workspace, ...current]);
      setCreateWorkspaceId(workspace.id);
    } catch (workspaceError) {
      console.error("Failed to add project workspace:", workspaceError);
      setCreateError(
        translate(
          "generated.components.projecthubpanel.358.11",
          "Unable to add this workspace, please check the folder permissions and try again.",
        ),
      );
    } finally {
      setWorkspaceBusy(false);
    }
  }, [workspaceBusy, workspaces]);

  const handleCreateProject = useCallback(async () => {
    const name = createName.trim();
    const goal = createGoal.trim();
    if (!name || !goal || !createWorkspaceId) {
      setCreateError(
        translate(
          "generated.components.projecthubpanel.368.12",
          "Please fill in the project name and project goals, and select a primary workspace.",
        ),
      );
      return;
    }
    const workspace = workspaceById.get(createWorkspaceId);
    if (!workspace) {
      setCreateError(
        translate(
          "generated.components.projecthubpanel.373.13",
          "The selected workspace is no longer available, please select again.",
        ),
      );
      return;
    }
    setCreateBusy(true);
    setCreateError(null);
    try {
      const { project, link } =
        await window.electronAPI.createProjectWithWorkspace({
          name,
          description: goal,
          workspaceId: workspace.id,
        });
      setProjects((current) => [project, ...current]);
      setWorkspaceLinks((current) => [
        link,
        ...current.filter((item) => item.id !== link.id),
      ]);
      setShowCreate(false);
      onSelectProject(project, workspace);
    } catch (projectError) {
      console.error("Failed to create project:", projectError);
      setCreateError(
        translate(
          "generated.components.projecthubpanel.394.14",
          "Project creation failed, please try again later.",
        ),
      );
    } finally {
      setCreateBusy(false);
    }
  }, [
    createGoal,
    createName,
    createWorkspaceId,
    onSelectProject,
    workspaceById,
  ]);

  const touchProject = useCallback((projectId: string) => {
    setProjects((current) =>
      current.map((project) =>
        project.id === projectId
          ? { ...project, updatedAt: Date.now() }
          : project,
      ),
    );
  }, []);

  const handleLinkWorkspace = useCallback(
    async (projectId: string, workspaceId: string) => {
      const link = await window.electronAPI.linkProjectWorkspace({
        projectId,
        workspaceId,
      });
      setWorkspaceLinks((current) => [
        link,
        ...current.filter(
          (item) =>
            !(item.projectId === projectId && item.workspaceId === workspaceId),
        ),
      ]);
      touchProject(projectId);
    },
    [touchProject],
  );

  const handleUnlinkWorkspace = useCallback(
    async (projectId: string, workspaceId: string) => {
      const removed = await window.electronAPI.unlinkProjectWorkspace({
        projectId,
        workspaceId,
      });
      if (!removed)
        throw new Error(
          translate(
            "generated.components.projecthubpanel.440.15",
            "Projects must maintain at least one associated workspace.",
          ),
        );
      setWorkspaceLinks((current) =>
        current.filter(
          (item) =>
            !(item.projectId === projectId && item.workspaceId === workspaceId),
        ),
      );
      touchProject(projectId);
    },
    [touchProject],
  );

  const handleSetPrimaryWorkspace = useCallback(
    async (projectId: string, workspaceId: string) => {
      const updated = await window.electronAPI.setPrimaryProjectWorkspace({
        projectId,
        workspaceId,
      });
      if (!updated)
        throw new Error(
          translate(
            "generated.components.projecthubpanel.458.16",
            "This workspace cannot be made the primary workspace.",
          ),
        );
      setWorkspaceLinks((current) =>
        current.map((link) =>
          link.projectId === projectId
            ? {
                ...link,
                isPrimary: link.workspaceId === workspaceId,
                updatedAt: Date.now(),
              }
            : link,
        ),
      );
      touchProject(projectId);
    },
    [touchProject],
  );

  const handleSetArchived = useCallback(
    async (project: Project, archived: boolean) => {
      if (archiveBusyId) return;
      setArchiveBusyId(project.id);
      setError(null);
      try {
        const updated = await window.electronAPI.updateProject({
          projectId: project.id,
          status: archived ? "archived" : "active",
          archivedAt: archived ? Date.now() : null,
        });
        if (updated) {
          setProjects((current) =>
            current.map((item) => (item.id === updated.id ? updated : item)),
          );
        }
        setDetailsProjectId(null);
        if (archived) onProjectArchived?.(project.id);
        if (!archived) setShowArchived(false);
      } catch (archiveError) {
        console.error("Failed to update project archive state:", archiveError);
        setError(
          archived
            ? translate(
                "generated.components.projecthubpanel.501.18",
                "Project archiving failed, please try again later.",
              )
            : translate(
                "generated.components.projecthubpanel.502.19",
                "Project recovery failed, please try again later.",
              ),
        );
      } finally {
        setArchiveBusyId(null);
      }
    },
    [archiveBusyId, onProjectArchived],
  );

  if (detailsProject) {
    return (
      <ProjectWorkspaceView
        project={detailsProject}
        links={linksByProject.get(detailsProject.id) || []}
        workspaces={workspaces}
        tasks={taskInventory}
        onBack={() => setDetailsProjectId(null)}
        onOpenTask={onOpenTask}
        onStartWork={onStartWork}
        onCreateFollowUp={openFollowUpDialog}
        onArchive={(project) => handleSetArchived(project, true)}
        onLinkWorkspace={(workspaceId) =>
          handleLinkWorkspace(detailsProject.id, workspaceId)
        }
        onUnlinkWorkspace={(workspaceId) =>
          handleUnlinkWorkspace(detailsProject.id, workspaceId)
        }
        onSetPrimaryWorkspace={(workspaceId) =>
          handleSetPrimaryWorkspace(detailsProject.id, workspaceId)
        }
        archiveBusy={archiveBusyId === detailsProject.id}
      />
    );
  }

  return (
    <main className="main-content project-hub-main">
      <NeoWorkerPageHeader
        icon={<FolderKanban size={20} strokeWidth={1.8} />}
        title={translate(
          "generated.components.projecthubpanel.541.20",
          "Project",
        )}
        description={translate(
          "generated.components.projecthubpanel.542.21",
          "Organize multiple sessions, workspaces, files and results in one space.",
        )}
        actions={
          <button
            className="project-hub-primary-action"
            type="button"
            onClick={openCreateDialog}
          >
            <Plus size={16} />{" "}
            {translate(
              "generated.components.projecthubpanel.549.22",
              "New project",
            )}
          </button>
        }
      />

      <div className="project-hub-body">
        <section
          className="project-hub-summary"
          aria-label={translate(
            "generated.components.projecthubpanel.555.23",
            "Project description",
          )}
        >
          <div>
            <span className="project-hub-eyebrow">
              {translate(
                "generated.components.projecthubpanel.557.24",
                "Suitable for continuous advancement of goals",
              )}
            </span>
            <h2>
              {translate(
                "generated.components.projecthubpanel.558.25",
                "A project to centrally save related sessions and results",
              )}
            </h2>
            <p>
              {translate(
                "generated.components.projecthubpanel.560.26",
                "Use projects when you need to advance multiple times; create a new session directly for one-time Q&A.",
              )}
            </p>
          </div>
          <div
            className="project-hub-summary-metrics"
            aria-label={translate(
              "generated.components.projecthubpanel.563.27",
              "Project statistics",
            )}
          >
            <span>
              <strong>{activeProjects.length}</strong>{" "}
              {translate(
                "generated.components.projecthubpanel.565.28",
                "items",
              )}
            </span>
            <span>
              <strong>
                {
                  taskInventory.filter(
                    (task) => Boolean(task.projectId) && !task.parentTaskId,
                  ).length
                }
              </strong>{" "}
              {translate(
                "generated.components.projecthubpanel.575.29",
                "work record",
              )}
            </span>
          </div>
        </section>

        <div className="project-hub-section-heading">
          <div>
            <h2>
              {translate(
                "generated.components.projecthubpanel.582.30",
                "ongoing projects",
              )}
            </h2>
            <p>
              {translate(
                "generated.components.projecthubpanel.583.31",
                "Continue from project goals, recent sessions, or results.",
              )}
            </p>
          </div>
          <div className="project-hub-heading-actions">
            {archivedProjects.length > 0 ? (
              <button
                type="button"
                className={`project-hub-refresh ${showArchived ? "is-active" : ""}`}
                onClick={() => setShowArchived((value) => !value)}
              >
                <Archive size={15} />{" "}
                {translate(
                  "generated.components.projecthubpanel.592.32",
                  "Archived",
                )}
                {archivedProjects.length}
              </button>
            ) : null}
            <button
              type="button"
              className="project-hub-refresh"
              onClick={() => void loadProjects()}
              disabled={loading}
            >
              <RefreshCw size={15} className={loading ? "is-spinning" : ""} />{" "}
              {translate(
                "generated.components.projecthubpanel.602.33",
                "Refresh",
              )}
            </button>
          </div>
        </div>

        {error ? (
          <div className="project-hub-error" role="alert">
            {error}
          </div>
        ) : null}

        {loading && projects.length === 0 ? (
          <div className="project-hub-loading" aria-busy="true">
            {translate(
              "generated.components.projecthubpanel.615.34",
              "Loading projects…",
            )}
          </div>
        ) : activeProjects.length === 0 ? (
          <section className="project-hub-empty">
            <div className="project-hub-empty-visual" aria-hidden="true">
              <img src="/home/project-empty-state.webp" alt="" />
            </div>
            <div className="project-hub-empty-copy">
              <span className="project-hub-empty-kicker">
                {translate(
                  "generated.components.projecthubpanel.624.35",
                  "Start with a clear goal",
                )}
              </span>
              <h2>
                {translate(
                  "generated.components.projecthubpanel.626.36",
                  "No projects yet",
                )}
              </h2>
              <p>
                {translate(
                  "generated.components.projecthubpanel.628.37",
                  "Bring goals, workspaces, and subsequent sessions into the same context, so important progress stays there.",
                )}
              </p>
              <button type="button" onClick={openCreateDialog}>
                <Plus size={16} />{" "}
                {translate(
                  "generated.components.projecthubpanel.631.38",
                  "Create first project",
                )}
              </button>
            </div>
          </section>
        ) : (
          <section
            className="project-hub-grid"
            aria-label={translate(
              "generated.components.projecthubpanel.636.39",
              "Project list",
            )}
          >
            {activeProjects.map((project) => {
              const workspace = getPrimaryWorkspace(project.id);
              const isCurrent = currentProjectId === project.id;
              const counts = projectTaskMap.get(project.id) || {
                total: 0,
                active: 0,
                completed: 0,
              };
              const recentTasks = recentTasksByProject.get(project.id) || [];
              const stageComplete =
                counts.total > 0 &&
                counts.active === 0 &&
                counts.completed === counts.total;
              return (
                <article
                  className={`project-hub-card ${isCurrent ? "is-current" : ""}`}
                  key={project.id}
                >
                  <div className="project-hub-card-accent" aria-hidden="true" />
                  <header>
                    <span className="project-hub-card-icon">
                      <FolderKanban size={20} />
                    </span>
                    <div className="project-hub-card-copy">
                      <div className="project-hub-card-title-row">
                        <h3>{project.name}</h3>
                        {isCurrent ? (
                          <span className="project-hub-current-badge">
                            <Check size={12} />{" "}
                            {translate(
                              "generated.components.projecthubpanel.661.40",
                              "Current project",
                            )}
                          </span>
                        ) : null}
                      </div>
                      <p title={project.description}>
                        {project.description ||
                          translate(
                            "generated.components.projecthubpanel.666.41",
                            "Project goals have not been filled in yet",
                          )}
                      </p>
                    </div>
                  </header>
                  <div
                    className="project-hub-card-workspace"
                    title={workspace?.path}
                  >
                    <FolderOpen size={13} />{" "}
                    {workspace
                      ? translate(
                          "projects.primaryWorkspaceNamed",
                          "Primary workspace: {name}",
                          { name: workspace.name },
                        )
                      : translate(
                          "generated.components.projecthubpanel.677.42",
                          "Main workspace is unavailable",
                        )}
                  </div>
                  <div className="project-hub-card-stats">
                    <span>
                      <strong>{counts.active}</strong>{" "}
                      {translate(
                        "generated.components.projecthubpanel.681.43",
                        "In progress",
                      )}
                    </span>
                    <span>
                      <strong>{counts.completed}</strong>{" "}
                      {translate(
                        "generated.components.projecthubpanel.684.44",
                        "Completed",
                      )}
                    </span>
                    <span>
                      <strong>{counts.total}</strong>{" "}
                      {translate(
                        "generated.components.projecthubpanel.687.45",
                        "all work",
                      )}
                    </span>
                  </div>
                  <div
                    className="project-hub-card-progress"
                    aria-label={translate(
                      "projects.currentProgressPercent",
                      "Current progress: {percent}%",
                      {
                        percent:
                          counts.total > 0
                            ? Math.round(
                                (counts.completed / counts.total) * 100,
                              )
                            : 0,
                      },
                    )}
                  >
                    <span>
                      {translate(
                        "generated.components.projecthubpanel.694.46",
                        "Current progress",
                      )}
                    </span>
                    <strong>
                      {counts.total > 0
                        ? Math.round((counts.completed / counts.total) * 100)
                        : 0}
                      %
                    </strong>
                    <span className="project-hub-card-progress-track">
                      <span
                        className="project-hub-card-progress-value"
                        style={{
                          width: `${counts.total > 0 ? Math.round((counts.completed / counts.total) * 100) : 0}%`,
                        }}
                      />
                    </span>
                  </div>
                  <div className="project-hub-recent">
                    <div className="project-hub-recent-label">
                      <span>
                        {translate(
                          "generated.components.projecthubpanel.712.47",
                          "recent work",
                        )}
                      </span>
                      <small>
                        <Clock3 size={12} />{" "}
                        {formatProjectActivity(project.updatedAt)}
                      </small>
                    </div>
                    {recentTasks.length > 0 ? (
                      <div className="project-hub-task-list">
                        {recentTasks.map((task) => (
                          <button
                            type="button"
                            key={task.id}
                            onClick={() => void onOpenTask(task.id)}
                          >
                            <span>
                              {task.title ||
                                task.prompt ||
                                translate(
                                  "generated.components.projecthubpanel.727.48",
                                  "unnamed session",
                                )}
                            </span>
                            <ArrowRight size={14} />
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="project-hub-no-task">
                        {translate(
                          "generated.components.projecthubpanel.735.49",
                          "There is no work record yet for this project.",
                        )}
                      </p>
                    )}
                  </div>
                  <footer>
                    <span className="project-hub-permission">
                      <ShieldCheck size={14} />{" "}
                      {translate(
                        "generated.components.projecthubpanel.741.50",
                        "Files stay in place",
                      )}
                    </span>
                    <div>
                      <button
                        type="button"
                        className="project-hub-secondary"
                        onClick={() => setDetailsProjectId(project.id)}
                      >
                        {translate(
                          "generated.components.projecthubpanel.749.51",
                          "View details",
                        )}
                      </button>
                      {!isCurrent && workspace ? (
                        <button
                          type="button"
                          className="project-hub-secondary"
                          onClick={() => onSelectProject(project, workspace)}
                        >
                          {translate(
                            "generated.components.projecthubpanel.757.52",
                            "Set as current",
                          )}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="project-hub-open"
                        disabled={!workspace}
                        onClick={() => {
                          if (stageComplete) {
                            setDetailsProjectId(project.id);
                            return;
                          }
                          if (workspace) onStartWork(project, workspace);
                        }}
                      >
                        {stageComplete
                          ? translate("projects.action.view", "View project")
                          : counts.total > 0
                            ? translate("projects.action.continue", "Continue")
                            : translate(
                                "projects.action.start",
                                "Start first task",
                              )}{" "}
                        <ArrowRight size={15} />
                      </button>
                    </div>
                  </footer>
                </article>
              );
            })}
          </section>
        )}

        {showArchived && archivedProjects.length > 0 ? (
          <section
            className="project-hub-archived"
            aria-label={translate(
              "generated.components.projecthubpanel.780.55",
              "Archived items",
            )}
          >
            <div className="project-hub-section-heading">
              <div>
                <h2>
                  {translate(
                    "generated.components.projecthubpanel.783.56",
                    "Archived items",
                  )}
                </h2>
                <p>
                  {translate(
                    "generated.components.projecthubpanel.784.57",
                    "Archiving only hides an item and does not delete its workspace, files, or sessions.",
                  )}
                </p>
              </div>
            </div>
            <div className="project-hub-archived-list">
              {archivedProjects.map((project) => (
                <article key={project.id}>
                  <span className="project-hub-card-icon">
                    <Archive size={18} />
                  </span>
                  <div>
                    <strong>{project.name}</strong>
                    <small>
                      {project.description ||
                        translate(
                          "generated.components.projecthubpanel.795.58",
                          "Project goal not filled in",
                        )}
                    </small>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleSetArchived(project, false)}
                    disabled={archiveBusyId === project.id}
                  >
                    <RotateCcw size={14} />{" "}
                    {translate(
                      "generated.components.projecthubpanel.802.59",
                      "restore items",
                    )}
                  </button>
                </article>
              ))}
            </div>
          </section>
        ) : null}
      </div>

      {showCreate ? (
        <div
          className="project-hub-dialog-backdrop"
          role="presentation"
          onMouseDown={() => !createBusy && setShowCreate(false)}
        >
          <section
            className="project-hub-dialog project-hub-create-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="project-create-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <span className="project-hub-card-icon">
                <Plus size={20} />
              </span>
              <div>
                <span className="project-hub-eyebrow">
                  {translate(
                    "generated.components.projecthubpanel.829.60",
                    "New project",
                  )}
                </span>
                <h2 id="project-create-title">
                  {translate(
                    "generated.components.projecthubpanel.830.61",
                    "Create a space for related work",
                  )}
                </h2>
              </div>
              <button
                type="button"
                className="project-hub-dialog-close"
                onClick={() => setShowCreate(false)}
                disabled={createBusy}
                aria-label={translate(
                  "generated.components.projecthubpanel.837.62",
                  "Close new project",
                )}
              >
                <X size={18} />
              </button>
            </header>
            <div
              className="project-hub-template-picker"
              aria-label={translate(
                "generated.components.projecthubpanel.844.63",
                "Project template",
              )}
            >
              {PROJECT_TEMPLATES.map((template) => (
                <button
                  type="button"
                  key={template.id}
                  onClick={() => applyTemplate(template)}
                >
                  {template.label}
                </button>
              ))}
            </div>
            <div className="project-hub-form">
              <label>
                {translate(
                  "generated.components.projecthubpanel.858.64",
                  "Project name",
                )}
                <span>
                  {translate(
                    "generated.components.projecthubpanel.858.65",
                    "Required",
                  )}
                </span>
                <input
                  autoFocus
                  value={createName}
                  onChange={(event) => setCreateName(event.target.value)}
                  placeholder={translate(
                    "generated.components.projecthubpanel.863.66",
                    "For example: NeoWorker V1.0 released",
                  )}
                />
              </label>
              <label>
                {translate(
                  "generated.components.projecthubpanel.867.67",
                  "Project goals",
                )}
                <span>
                  {translate(
                    "generated.components.projecthubpanel.867.68",
                    "Required",
                  )}
                </span>
                <textarea
                  value={createGoal}
                  onChange={(event) => setCreateGoal(event.target.value)}
                  placeholder={translate(
                    "generated.components.projecthubpanel.871.69",
                    "Describe what is ultimately to be accomplished and the criteria by which completion will be judged.",
                  )}
                  rows={4}
                />
              </label>
              <div className="project-hub-form-field">
                <div className="project-hub-form-label">
                  {translate(
                    "generated.components.projecthubpanel.877.70",
                    "main work area",
                  )}
                  <span>
                    {translate(
                      "generated.components.projecthubpanel.877.71",
                      "Required",
                    )}
                  </span>
                </div>
                <div className="project-hub-workspace-field">
                  <NeoWorkerSelectMenu
                    ariaLabel={translate(
                      "generated.components.projecthubpanel.881.72",
                      "Select the main workspace for your project",
                    )}
                    className="project-hub-workspace-menu"
                    icon={<FolderOpen size={15} strokeWidth={1.8} />}
                    minMenuWidth={380}
                    value={createWorkspaceId}
                    onValueChange={setCreateWorkspaceId}
                    options={createWorkspaceOptions}
                    placeholder={translate(
                      "generated.components.projecthubpanel.888.73",
                      "Select your main workspace",
                    )}
                  />
                  <button
                    type="button"
                    className="project-hub-secondary"
                    onClick={() => void handleAddWorkspace()}
                    disabled={workspaceBusy}
                  >
                    {workspaceBusy
                      ? translate(
                          "generated.components.projecthubpanel.896.74",
                          "Adding…",
                        )
                      : translate(
                          "generated.components.projecthubpanel.896.75",
                          "Add folder",
                        )}
                  </button>
                </div>
              </div>
            </div>
            {createError ? (
              <div className="project-hub-error" role="alert">
                {createError}
              </div>
            ) : null}
            <footer>
              <button
                type="button"
                className="project-hub-secondary"
                onClick={() => setShowCreate(false)}
                disabled={createBusy}
              >
                {translate(
                  "generated.components.projecthubpanel.913.76",
                  "Cancel",
                )}
              </button>
              <button
                type="button"
                className="project-hub-open"
                onClick={() => void handleCreateProject()}
                disabled={createBusy}
              >
                {createBusy
                  ? translate(
                      "generated.components.projecthubpanel.921.77",
                      "Creating…",
                    )
                  : translate(
                      "generated.components.projecthubpanel.921.78",
                      "Create project",
                    )}
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </main>
  );
}
