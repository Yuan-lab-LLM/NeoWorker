import { translate } from "../i18n";

export function unwrapCreateTaskError(error: unknown): string {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";

  return raw
    .trim()
    .replace(/^Error invoking remote method ['"]task:create['"]:\s*/i, "")
    .replace(/^Error:\s*/i, "")
    .trim();
}

export function formatCreateTaskError(error: unknown): string {
  const message = unwrapCreateTaskError(error);
  if (/selected workspace is not linked to this project/i.test(message)) {
    return translate(
      "app.error.createTask.workspaceProjectMismatch",
      "The current workspace is not linked to the selected project. Choose the workspace or project again.",
    );
  }
  if (/new work can only be created in an active project/i.test(message)) {
    return translate(
      "app.error.createTask.inactiveProject",
      "This project is archived or inactive. Choose an active project and try again.",
    );
  }
  if (/project not found/i.test(message)) {
    return translate(
      "app.error.createTask.projectNotFound",
      "The selected project no longer exists. Choose another project and try again.",
    );
  }
  if (/workspace not found/i.test(message)) {
    return translate(
      "app.error.createTask.workspaceNotFound",
      "The current workspace no longer exists. Choose a workspace and try again.",
    );
  }
  return (
    message ||
    translate(
      "app.error.createTask",
      "The task could not be created. Please try again.",
    )
  );
}
