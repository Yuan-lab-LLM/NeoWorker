const DURABLE_TEMP_WORKSPACE_MARKER = "/artifacts/temporary-workspaces/";

/**
 * Convert every representation of a task artifact to the path users see in
 * the workspace. Temporary workspaces have a private durable mirror under the
 * application data directory; that mirror is recovery storage, not a second
 * user-facing file.
 */
export function normalizeArtifactPathForWorkspace(
  candidate: string,
  workspacePath?: string,
): string {
  const normalized = String(candidate || "")
    .trim()
    .replace(/\\/g, "/");
  if (!normalized) return "";

  if (workspacePath) {
    const workspaceRoot = workspacePath
      .trim()
      .replace(/\\/g, "/")
      .replace(/\/+$/, "");
    if (workspaceRoot && normalized.startsWith(`${workspaceRoot}/`)) {
      return normalized.slice(workspaceRoot.length + 1);
    }
  }

  const markerIndex = normalized
    .toLowerCase()
    .lastIndexOf(DURABLE_TEMP_WORKSPACE_MARKER);
  if (markerIndex >= 0) {
    const mirroredPath = normalized.slice(
      markerIndex + DURABLE_TEMP_WORKSPACE_MARKER.length,
    );
    const workspaceLabelEnd = mirroredPath.indexOf("/");
    if (workspaceLabelEnd > 0 && workspaceLabelEnd < mirroredPath.length - 1) {
      return mirroredPath.slice(workspaceLabelEnd + 1);
    }
  }

  return normalized.replace(/^\.\//, "");
}

export function getArtifactPathIdentityKey(
  candidate: string,
  workspacePath?: string,
): string {
  return normalizeArtifactPathForWorkspace(
    candidate,
    workspacePath,
  ).toLowerCase();
}

export function isCanonicalTaskArtifactOutputPath(candidate: string): boolean {
  const normalized = normalizeArtifactPathForWorkspace(candidate);
  return /(?:^|\/)artifacts\/skills\/[^/]+\/[^/]+\/output\/[^/]+$/i.test(
    normalized,
  );
}
