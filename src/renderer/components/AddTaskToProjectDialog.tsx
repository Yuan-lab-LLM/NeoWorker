import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowRight,
  Check,
  FolderKanban,
  FolderOpen,
  LoaderCircle,
  Plus,
  X,
} from "lucide-react";
import type { Project, Task, Workspace } from "../../shared/types";
import "./add-task-to-project-dialog.css";
import { translate } from "../i18n/index";

interface AddTaskToProjectDialogProps {
  task: Task;
  workspace: Workspace | null;
  onClose: () => void;
  onAdded: (task: Task) => void;
  onOpenProjects?: () => void;
}

export function AddTaskToProjectDialog({
  task,
  workspace,
  onClose,
  onAdded,
  onOpenProjects,
}: AddTaskToProjectDialogProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [linkedProjectIds, setLinkedProjectIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const companies = await window.electronAPI.listCompanies();
        const groups = await Promise.all(
          companies.map((company) =>
            window.electronAPI.listCompanyProjects(company.id, {
              includeArchived: false,
            }),
          ),
        );
        const activeProjects = groups
          .flat()
          .filter((project) => project.status !== "archived")
          .sort((left, right) => right.updatedAt - left.updatedAt);
        const links = await Promise.all(
          activeProjects.map(async (project) => ({
            projectId: project.id,
            links: await window.electronAPI.listProjectWorkspaces(project.id),
          })),
        );
        if (!active) return;
        setProjects(activeProjects);
        setLinkedProjectIds(
          new Set(
            links
              .filter((entry) =>
                entry.links.some(
                  (link) => link.workspaceId === task.workspaceId,
                ),
              )
              .map((entry) => entry.projectId),
          ),
        );
        setSelectedProjectId(
          (current) => current || activeProjects[0]?.id || "",
        );
      } catch (loadError) {
        if (!active) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : translate(
                "generated.components.addtasktoprojectdialog.80.0",
                "The project cannot be loaded temporarily, please try again later.",
              ),
        );
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [task.workspaceId]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, saving]);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) || null,
    [projects, selectedProjectId],
  );

  const handleAdd = async () => {
    if (!selectedProject || saving) return;
    setSaving(true);
    setError(null);
    try {
      if (!linkedProjectIds.has(selectedProject.id)) {
        await window.electronAPI.linkProjectWorkspace({
          projectId: selectedProject.id,
          workspaceId: task.workspaceId,
          isPrimary: false,
        });
      }
      const updatedTask = (await window.electronAPI.updateTaskProject(
        task.id,
        selectedProject.id,
      )) as Task;
      onAdded(updatedTask);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : translate(
              "generated.components.addtasktoprojectdialog.126.1",
              "Failed to join the project, please try again later.",
            ),
      );
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div
      className="add-task-project-backdrop"
      role="presentation"
      onMouseDown={() => !saving && onClose()}
    >
      <section
        className="add-task-project-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-task-project-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="add-task-project-header">
          <span className="add-task-project-icon" aria-hidden="true">
            <FolderKanban size={20} />
          </span>
          <div>
            <span>
              {translate(
                "generated.components.addtasktoprojectdialog.151.2",
                "Organize current conversation",
              )}
            </span>
            <h2 id="add-task-project-title">
              {translate(
                "generated.components.addtasktoprojectdialog.152.3",
                "Join the project",
              )}
            </h2>
          </div>
          <button
            type="button"
            className="add-task-project-close"
            onClick={onClose}
            disabled={saving}
            aria-label={translate(
              "generated.components.addtasktoprojectdialog.159.4",
              "Close",
            )}
          >
            <X size={18} />
          </button>
        </header>

        <div className="add-task-project-intro">
          <strong>
            {task.title ||
              translate(
                "generated.components.addtasktoprojectdialog.166.5",
                "current session",
              )}
          </strong>
          <p>
            {translate(
              "generated.components.addtasktoprojectdialog.168.6",
              "After joining, you can continue conversations, view files, and accumulate results in the same place; existing content and file locations will not change.",
            )}
          </p>
          <span>
            <FolderOpen size={14} />
            {workspace?.name ||
              translate(
                "generated.components.addtasktoprojectdialog.172.7",
                "current workspace",
              )}
          </span>
        </div>

        <div className="add-task-project-list-heading">
          <strong>
            {translate(
              "generated.components.addtasktoprojectdialog.177.8",
              "Select item",
            )}
          </strong>
          <span>
            {projects.length > 0
              ? translate(
                  "projects.availableCount",
                  "{count} available projects",
                  { count: projects.length },
                )
              : ""}
          </span>
        </div>

        {loading ? (
          <div className="add-task-project-loading" aria-busy="true">
            <LoaderCircle size={19} className="is-spinning" />{" "}
            {translate(
              "generated.components.addtasktoprojectdialog.183.9",
              "Loading projects…",
            )}
          </div>
        ) : projects.length === 0 ? (
          <div className="add-task-project-empty">
            <span aria-hidden="true">
              <FolderKanban size={26} />
            </span>
            <strong>
              {translate(
                "generated.components.addtasktoprojectdialog.190.10",
                "No projects yet",
              )}
            </strong>
            <p>
              {translate(
                "generated.components.addtasktoprojectdialog.191.11",
                "Create a project first, then organize related conversations and results together.",
              )}
            </p>
            {onOpenProjects ? (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenProjects();
                }}
              >
                <Plus size={15} />{" "}
                {translate(
                  "generated.components.addtasktoprojectdialog.200.12",
                  "New project",
                )}
              </button>
            ) : null}
          </div>
        ) : (
          <div
            className="add-task-project-options"
            role="radiogroup"
            aria-label={translate(
              "generated.components.addtasktoprojectdialog.205.13",
              "Project",
            )}
          >
            {projects.map((project) => {
              const selected = project.id === selectedProjectId;
              const linked = linkedProjectIds.has(project.id);
              return (
                <button
                  key={project.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className={selected ? "is-selected" : ""}
                  onClick={() => setSelectedProjectId(project.id)}
                >
                  <span
                    className="add-task-project-option-icon"
                    aria-hidden="true"
                  >
                    <FolderKanban size={18} />
                  </span>
                  <span className="add-task-project-option-copy">
                    <strong>{project.name}</strong>
                    <span>
                      {project.description ||
                        translate(
                          "generated.components.addtasktoprojectdialog.223.14",
                          "Project goals have not been filled in yet",
                        )}
                    </span>
                    <small>
                      {linked
                        ? translate(
                            "generated.components.addtasktoprojectdialog.224.15",
                            "Current workspace is associated",
                          )
                        : translate(
                            "generated.components.addtasktoprojectdialog.224.16",
                            "Automatically associate with the current workspace when joining",
                          )}
                    </small>
                  </span>
                  <span className="add-task-project-radio" aria-hidden="true">
                    {selected ? <Check size={14} /> : null}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {error ? (
          <div className="add-task-project-error" role="alert">
            {error}
          </div>
        ) : null}

        <footer className="add-task-project-footer">
          <button
            type="button"
            className="is-secondary"
            onClick={onClose}
            disabled={saving}
          >
            {translate(
              "generated.components.addtasktoprojectdialog.243.17",
              "Cancel",
            )}
          </button>
          <button
            type="button"
            className="is-primary"
            onClick={() => void handleAdd()}
            disabled={!selectedProject || saving || loading}
          >
            {saving ? (
              <>
                <LoaderCircle size={15} className="is-spinning" />{" "}
                {translate(
                  "generated.components.addtasktoprojectdialog.253.18",
                  "Joining…",
                )}
              </>
            ) : (
              <>
                {translate(
                  "generated.components.addtasktoprojectdialog.257.19",
                  "Join the project",
                )}
                <ArrowRight size={15} />
              </>
            )}
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
