export type WorkspaceNeed = "none" | "new_ok" | "ambiguous" | "needs_existing";

type WorkspaceSignals = {
  hasEntries: boolean;
  hasProjectMarkers: boolean;
  hasCodeFiles: boolean;
  hasAppDirs: boolean;
  /** True when readdirSync threw (permission denied, not a directory, etc.) */
  readFailed?: boolean;
};

type WorkspaceLike = {
  id: string;
  path?: string;
  isTemp?: boolean;
  name?: string;
  [key: string]: Any;
};

export function preflightWorkspaceCheck<W extends WorkspaceLike>(opts: {
  shouldPauseForQuestions: boolean;
  workspacePreflightAcknowledged: boolean;
  capabilityUpgradeRequested: boolean;
  taskPrompt: string;
  workspace: W;
  isTempWorkspaceId: (workspaceId: string) => boolean;
  preflightShellExecutionCheck: () => boolean;
  isInternalAppOrToolChangeIntent: (prompt: string) => boolean;
  classifyWorkspaceNeed: (prompt: string) => WorkspaceNeed;
  getWorkspaceSignals: () => WorkspaceSignals;
  tryAutoSwitchToPreferredWorkspaceForAmbiguousTask: (reason: string) => boolean;
  pauseForUserInput: (message: string, reason: string) => void;
}): boolean {
  if (!opts.shouldPauseForQuestions) {
    return false;
  }

  if (opts.preflightShellExecutionCheck()) {
    return true;
  }

  if (opts.workspacePreflightAcknowledged) {
    return false;
  }

  if (opts.capabilityUpgradeRequested || opts.isInternalAppOrToolChangeIntent(opts.taskPrompt)) {
    return false;
  }

  const workspaceNeed = opts.classifyWorkspaceNeed(opts.taskPrompt);
  if (workspaceNeed === "none" || workspaceNeed === "new_ok") return false;

  const signals = opts.getWorkspaceSignals();
  const looksLikeProject = signals.hasProjectMarkers || signals.hasCodeFiles || signals.hasAppDirs;
  const isTemp = Boolean(opts.workspace.isTemp) || opts.isTempWorkspaceId(opts.workspace.id);

  // When user is in temp workspace (no workspace selected), never auto-switch to another workspace.
  // The user explicitly chose temp; silently switching to neoworker/other would be surprising.
  // For "ambiguous" prompts, stay in temp. For "needs_existing", pause and ask instead of auto-switching.
  if (isTemp && !looksLikeProject && workspaceNeed === "ambiguous") {
    return false;
  }

  if (isTemp && !looksLikeProject && workspaceNeed === "needs_existing") {
    opts.pauseForUserInput(
      "I am in the temporary workspace, but this task looks like it targets an existing project. " +
        "Please select the project folder or provide its path so I can switch to it. " +
        "If you want a new project created here instead, say so.",
      "workspace_required",
    );
    return true;
  }

  if (!isTemp && workspaceNeed === "needs_existing" && !looksLikeProject) {
    if (signals.readFailed) {
      opts.pauseForUserInput(
        "I couldn't read the workspace directory (permission denied or invalid path). " +
          "Please check the folder path and permissions, or select a different workspace.",
        "workspace_read_failed",
      );
      return true;
    }
    return false;
  }

  return false;
}

export function tryAutoSwitchToPreferredWorkspaceForAmbiguousTask<W extends WorkspaceLike>(opts: {
  reason: string;
  currentWorkspace: W;
  getMostRecentNonTempWorkspace: () => W | null | undefined;
  getWorkspaceSignalsForPath: (workspacePath: string) => WorkspaceSignals;
  pathExists: (workspacePath: string) => boolean;
  isDirectory: (workspacePath: string) => boolean;
  applyWorkspaceSwitch: (workspace: W) => string | undefined;
  emitWorkspaceSwitched?: (payload: Record<string, unknown>) => void;
}): boolean {
  try {
    const preferred = opts.getMostRecentNonTempWorkspace();
    if (!preferred) return false;
    if (preferred.id === opts.currentWorkspace.id) return false;
    if (!preferred.path || !opts.pathExists(preferred.path) || !opts.isDirectory(preferred.path)) {
      return false;
    }

    const preferredSignals = opts.getWorkspaceSignalsForPath(preferred.path);
    if (preferredSignals.readFailed) return false;
    const preferredLooksLikeProject =
      preferredSignals.hasProjectMarkers ||
      preferredSignals.hasCodeFiles ||
      preferredSignals.hasAppDirs;
    if (!preferredLooksLikeProject) {
      return false;
    }

    const oldWorkspacePath = opts.applyWorkspaceSwitch(preferred);
    if (opts.emitWorkspaceSwitched) {
      opts.emitWorkspaceSwitched({
        oldWorkspace: oldWorkspacePath,
        newWorkspace: preferred.path,
        newWorkspaceId: preferred.id,
        newWorkspaceName: preferred.name,
        autoSelected: true,
        reason: opts.reason,
      });
    }

    return true;
  } catch {
    return false;
  }
}
