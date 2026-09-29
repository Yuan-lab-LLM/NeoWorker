import { isTempWorkspaceId, TEMP_WORKSPACE_NAME, type Workspace } from "../../shared/types";
import { translate } from "../i18n";

export function workspaceDisplayName(workspace: Workspace, title?: string): string {
  if (!workspace.isTemp && !isTempWorkspaceId(workspace.id)) return workspace.name;
  if (workspace.name && workspace.name !== TEMP_WORKSPACE_NAME) return workspace.name;
  return title?.trim() || translate("workspaceOwnership.unnamed", "Conversation {id}", {
    id: workspace.id.slice(-6),
  });
}
