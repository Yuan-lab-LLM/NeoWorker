import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BriefcaseBusiness,
  FolderOpen,
  Link2,
  PanelsTopLeft,
  ShieldCheck,
} from "lucide-react";
import type {
  PermissionMode,
  Project,
  Task,
  TaskAccessSummary,
  Workspace,
} from "../../shared/types";
import { isTempWorkspaceId } from "../../shared/types";
import {
  deriveTaskAttentionState,
  getTaskAttentionCount,
  type TaskAttentionSignals,
} from "../../shared/task-attention";
import { translate } from "../i18n";
import { FEATURE_VISIBILITY } from "../feature-visibility";
import { IntegrationMentionIcon } from "./IntegrationMentionIcon";
import {
  getTaskAttentionLabel,
  TaskAttentionBadge,
} from "./TaskAttentionBadge";
import { AddTaskToProjectDialog } from "./AddTaskToProjectDialog";

const SOURCE_LABELS: Record<string, string> = {
  cron: "Scheduled task",
  hook: "Hook",
  api: "API",
  side_chat: "Side chat",
  improvement: "Improvement loop",
  subconscious: "Background agent",
  symphony: "Orchestration",
  managed_agent_panel: "Managed agent",
  bluebubbles: "BlueBubbles",
  dingtalk: "DingTalk",
  email: "Email",
  feishu: "Feishu",
  googlechat: "Google Chat",
  imessage: "iMessage",
  mattermost: "Mattermost",
  slack: "Slack",
  telegram: "Telegram",
  wecom: "WeCom",
  weixin: "Weixin",
  whatsapp: "WhatsApp",
};

function getSourceLabel(task: Task): string {
  const sourceKey = task.agentConfig?.originChannel || task.source || "manual";
  if (sourceKey === "manual" && (task.branchFromTaskId || task.parentTaskId)) {
    return translate("task.source.inherited", "Inherited source");
  }
  return (
    SOURCE_LABELS[sourceKey] ||
    translate("task.contextBar.manual", "Manual task")
  );
}

function getPermissionLabel(mode: PermissionMode | undefined): string {
  const effectiveMode = mode || "default";
  const labels: Record<string, [string, string]> = {
    default: ["task.contextBar.permissionDefault", "Default access"],
    plan: ["task.contextBar.permissionPlan", "Plan only"],
    dangerous_only: [
      "task.contextBar.permissionDangerous",
      "Confirm risky actions",
    ],
    accept_edits: ["task.contextBar.permissionEdits", "Edits allowed"],
    dont_ask: ["task.contextBar.permissionDontAsk", "No prompts"],
    bypass_permissions: ["task.contextBar.permissionFull", "Full access"],
  };
  const [key, fallback] = labels[effectiveMode] || labels.default;
  return translate(key, fallback);
}

export function TaskContextBar({
  task,
  workspace,
  projectId,
  attentionSignals,
  onOpenProject,
  onProjectAssigned,
  onOpenProjects,
  onChangeWorkspace,
  onOpenAccess,
  primaryActionLabel,
  onPrimaryAction,
}: {
  task: Task;
  workspace: Workspace | null;
  projectId?: string | null;
  attentionSignals?: TaskAttentionSignals;
  onOpenProject?: (projectId: string) => void;
  onProjectAssigned?: (task: Task) => void;
  onOpenProjects?: () => void;
  onChangeWorkspace?: () => void;
  onOpenAccess?: () => void;
  primaryActionLabel?: string;
  onPrimaryAction?: () => void;
}) {
  const [project, setProject] = useState<Project | null>(null);
  const [projectLoading, setProjectLoading] = useState(false);
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  const [accessSummary, setAccessSummary] = useState<TaskAccessSummary | null>(
    null,
  );
  const attentionState = deriveTaskAttentionState(task, attentionSignals);
  const attentionCount = getTaskAttentionCount(
    attentionState,
    attentionSignals,
  );
  const attentionLabel =
    attentionState === "done" && task.terminalStatus === "partial_success"
      ? translate("task.attention.partial", "Partially completed")
      : getTaskAttentionLabel(attentionState);
  const allIntegrations = useMemo(() => {
    if (!accessSummary) return task.agentConfig?.integrationMentions || [];
    const selectedIds = new Set(accessSummary.policy.connectorIds);
    return accessSummary.connectors
      .filter((connector) => selectedIds.has(connector.id))
      .map((connector) => ({
        id: connector.id,
        label: connector.label,
        iconKey: connector.iconKey || connector.id,
      }));
  }, [accessSummary, task.agentConfig?.integrationMentions]);
  const integrations = allIntegrations.slice(0, 4);
  const integrationOverflow = Math.max(
    0,
    allIntegrations.length - integrations.length,
  );
  const hasExternalSource = Boolean(
    task.branchFromTaskId ||
    task.parentTaskId ||
    task.agentConfig?.originChannel ||
    (task.source && task.source !== "manual" && task.source !== "side_chat"),
  );
  const sourceLabel = getSourceLabel(task);
  const permissionMode =
    accessSummary?.policy.permissionMode ||
    task.agentConfig?.permissionMode ||
    "default";
  const isTemporaryWorkspace = Boolean(
    workspace?.isTemp || isTempWorkspaceId(workspace?.id),
  );
  const projectsVisible = FEATURE_VISIBILITY.projects;
  const showWorkspace = Boolean(
    workspace && (!projectsVisible || !projectId) && !isTemporaryWorkspace,
  );
  const showAddToProject = Boolean(
    projectsVisible && !projectId && onProjectAssigned,
  );
  const showSource = hasExternalSource;
  const showAccess = permissionMode !== "default" || integrations.length > 0;
  const hasContextDetails = Boolean(
    (projectsVisible && projectId) ||
      showWorkspace ||
      showAddToProject ||
      showSource ||
      showAccess,
  );

  useEffect(() => {
    let active = true;
    if (!projectsVisible || !projectId || !window.electronAPI?.getProject) {
      setProject(null);
      setProjectLoading(false);
      return () => {
        active = false;
      };
    }
    setProjectLoading(true);
    void window.electronAPI
      .getProject(projectId)
      .then((value) => {
        if (active) setProject(value || null);
      })
      .catch(() => {
        if (active) setProject(null);
      })
      .finally(() => {
        if (active) setProjectLoading(false);
      });
    return () => {
      active = false;
    };
  }, [projectId, projectsVisible]);

  useEffect(() => {
    setAccessSummary(null);
    const handleSummary = (event: Event) => {
      const detail = (
        event as CustomEvent<{ taskId?: string; summary?: TaskAccessSummary }>
      ).detail;
      if (detail?.taskId === task.id && detail.summary) {
        setAccessSummary(detail.summary);
      }
    };
    window.addEventListener("task-access-summary-updated", handleSummary);
    return () =>
      window.removeEventListener("task-access-summary-updated", handleSummary);
  }, [task.id]);

  const scrollToLatestSource = () => {
    const stack = document.getElementById(`task-source-stack-${task.id}`);
    const cards = stack?.querySelectorAll<HTMLElement>(".task-source-card");
    const target = cards && cards.length > 0 ? cards[cards.length - 1] : stack;
    const reduceMotion = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    target?.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "center",
    });
    target?.focus({ preventScroll: true });
  };

  const openAccess = () => {
    onOpenAccess?.();
    window.dispatchEvent(
      new CustomEvent("right-panel:open-section", {
        detail: { section: "access" },
      }),
    );
  };

  const openCompactContext = () => {
    if (projectsVisible && projectId && onOpenProject) {
      onOpenProject(projectId);
      return;
    }
    if (showAddToProject) {
      setProjectPickerOpen(true);
      return;
    }
    if (showWorkspace && onChangeWorkspace) {
      onChangeWorkspace();
      return;
    }
    openAccess();
  };

  if (!hasContextDetails && !onPrimaryAction) return null;

  return (
    <nav
      className={`task-context-bar${hasContextDetails ? "" : " is-action-only"}`}
      aria-label={translate("task.contextBar.aria", "Task context")}
    >
      {hasContextDetails ? (
        <div className="task-context-bar-details">
          {projectsVisible && projectId && (
            <button
              type="button"
              className="task-context-chip"
              onClick={() => onOpenProject?.(projectId)}
              disabled={!onOpenProject}
              aria-label={
                project?.name
                  ? translate(
                      "projects.context.openNamed",
                      "View project context for {name}",
                      { name: project.name },
                    )
                  : undefined
              }
              title={
                project?.name
                  ? translate(
                      "projects.context.openNamed",
                      "View project context for {name}",
                      { name: project.name },
                    )
                  : undefined
              }
            >
              <BriefcaseBusiness size={14} aria-hidden="true" />
              <span>
                {project?.name ||
                  (projectLoading
                    ? translate("common.loading", "Loading")
                    : translate("task.contextBar.project", "Project"))}
              </span>
            </button>
          )}
          {showWorkspace ? (
            <button
              type="button"
              className="task-context-chip"
              onClick={onChangeWorkspace}
              disabled={!onChangeWorkspace}
            >
              <FolderOpen size={14} aria-hidden="true" />
              <span>
                {workspace?.name ||
                  translate("task.contextBar.workspace", "Workspace")}
              </span>
            </button>
          ) : null}
          {showAddToProject ? (
            <button
              type="button"
              className="task-context-chip task-context-add-project"
              onClick={() => setProjectPickerOpen(true)}
            >
              <BriefcaseBusiness size={14} aria-hidden="true" />
              <span>
                {translate(
                  "generated.components.taskcontextbar.274.0",
                  "Join the project",
                )}
              </span>
            </button>
          ) : null}
          {showSource ? (
            <button
              type="button"
              className="task-context-chip"
              onClick={scrollToLatestSource}
            >
              <Link2 size={14} aria-hidden="true" />
              <span>{sourceLabel}</span>
            </button>
          ) : null}
          {showAccess ? (
            <button
              type="button"
              className="task-context-chip task-context-access-chip"
              onClick={openAccess}
            >
              <span className="task-context-integrations" aria-hidden="true">
                {integrations.map((integration) => (
                  <IntegrationMentionIcon
                    key={integration.id}
                    iconKey={integration.iconKey}
                    label={integration.label}
                    size="xs"
                  />
                ))}
                {integrations.length === 0 && <ShieldCheck size={14} />}
              </span>
              <span>{getPermissionLabel(permissionMode)}</span>
              {integrationOverflow > 0 && (
                <span className="task-context-overflow">
                  +{integrationOverflow}
                </span>
              )}
            </button>
          ) : null}
        </div>
      ) : null}

      {hasContextDetails ? (
        <button
          type="button"
          className="task-context-compact-trigger"
          onClick={openCompactContext}
        >
          <PanelsTopLeft size={14} aria-hidden="true" />
          <span>
            {project?.name ||
              (showAddToProject
                ? translate(
                    "generated.components.taskcontextbar.324.1",
                    "Join the project",
                  )
                : workspace?.name) ||
              translate("task.contextBar.context", "Context")}
          </span>
        </button>
      ) : null}
      {onPrimaryAction ? (
        <button
          type="button"
          className={`task-context-primary-action state-${attentionState}`}
          onClick={onPrimaryAction}
          aria-label={`${attentionLabel}: ${primaryActionLabel || translate("task.contextBar.open", "Open")}`}
        >
          <TaskAttentionBadge
            state={attentionState}
            count={attentionCount}
            compact
            labelOverride={attentionLabel}
            announce
          />
          <span>
            {primaryActionLabel || translate("task.contextBar.open", "Open")}
          </span>
          <ArrowRight size={13} aria-hidden="true" />
        </button>
      ) : (
        <TaskAttentionBadge
          state={attentionState}
          count={attentionCount}
          className="task-context-attention"
          labelOverride={attentionLabel}
          announce
        />
      )}
      {projectsVisible && projectPickerOpen ? (
        <AddTaskToProjectDialog
          task={task}
          workspace={workspace}
          onClose={() => setProjectPickerOpen(false)}
          onOpenProjects={onOpenProjects}
          onAdded={(updatedTask) => {
            setProjectPickerOpen(false);
            onProjectAssigned?.(updatedTask);
          }}
        />
      ) : null}
    </nav>
  );
}
