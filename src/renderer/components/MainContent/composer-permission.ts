import type { PermissionMode } from "../../../shared/types";
import type { PermissionAccessMode } from "./main-content-constants";

export interface ComposerPermissionOverrides {
  permissionMode: PermissionMode;
  shellAccess: boolean;
}

/**
 * Keep the composer label aligned with the permission mode persisted on the
 * selected task. A task without an explicit override inherits the configured
 * composer default.
 */
export const resolveComposerPermissionAccessMode = (
  permissionMode: PermissionMode | undefined,
  fallback: PermissionAccessMode,
): PermissionAccessMode => {
  if (permissionMode === "bypass_permissions") return "full";
  if (permissionMode) return "default";
  return fallback;
};

export interface ComposerPermissionContext {
  selectedTaskId: string | null;
  taskId: string | null;
  permissionMode: PermissionMode | undefined;
  fallback: PermissionAccessMode;
  current: PermissionAccessMode;
  hasUserSelection: boolean;
}

/**
 * Preserve an explicit composer selection while the newly-created/selected
 * task is still being hydrated. Sidebar summaries intentionally omit the
 * permission fields, and a transient empty task must not overwrite the value
 * the user just chose before it is submitted.
 */
export const resolveComposerPermissionAccessModeForContext = (
  context: ComposerPermissionContext,
): PermissionAccessMode => {
  if (!context.selectedTaskId) {
    return context.hasUserSelection ? context.current : context.fallback;
  }
  if (context.taskId !== context.selectedTaskId) return context.current;
  if (!context.permissionMode && context.hasUserSelection) {
    return context.current;
  }
  return resolveComposerPermissionAccessMode(
    context.permissionMode,
    context.fallback,
  );
};

/**
 * Always send an explicit permission choice. This lets a follow-up both retain
 * full access and intentionally downgrade an existing full-access task.
 */
export const buildComposerPermissionOverrides = (
  accessMode: PermissionAccessMode,
  shellEnabled: boolean,
): ComposerPermissionOverrides =>
  accessMode === "full"
    ? { permissionMode: "bypass_permissions", shellAccess: true }
    : { permissionMode: "default", shellAccess: shellEnabled };
