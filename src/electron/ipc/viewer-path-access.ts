import type { Workspace } from "../../shared/types";
import { isTempWorkspaceId } from "../../shared/types";
import * as path from "path";
import * as fs from "fs/promises";

/**
 * Viewer actions use the same external-file grant as agent file tools. A
 * regular workspace remains contained by default; temporary or explicitly
 * unrestricted workspaces may preview/open/download absolute external paths.
 */
export function shouldRequireViewerWorkspaceContainment(
  workspace: Pick<Workspace, "id" | "isTemp" | "permissions"> | undefined,
): boolean {
  if (!workspace) return true;
  return !(
    workspace.isTemp === true ||
    isTempWorkspaceId(workspace.id) ||
    workspace.permissions.unrestrictedFileAccess === true
  );
}

const RECOVERABLE_VIEWER_ROOTS = [
  [".neoworker", "tmp"],
  [".neoworker", "artifacts"],
  [".neoworker", "automated-outputs"],
  ["artifacts"],
] as const;
const RECOVERY_MAX_DEPTH = 5;
const RECOVERY_MAX_ENTRIES = 2_000;

/**
 * Recover a generated artifact after a safe in-workspace move. Resolution is
 * deliberately conservative: only generated-output roots are searched and a
 * basename is returned only when it has one unique match. This must never turn
 * a hallucinated filename into a different file merely because the extensions
 * happen to match.
 */
export async function findUniqueViewerArtifactByBasename(
  filePath: string,
  workspacePath: string,
): Promise<string | null> {
  const basename = path.basename(filePath.trim());
  if (!basename || basename === "." || basename === "..") return null;

  const workspaceRoot = path.resolve(workspacePath);
  const matches = new Set<string>();
  let visitedEntries = 0;

  const scan = async (directory: string, depth: number): Promise<boolean> => {
    if (depth > RECOVERY_MAX_DEPTH || visitedEntries >= RECOVERY_MAX_ENTRIES) {
      return false;
    }
    let entries: import("fs").Dirent[];
    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch {
      return true;
    }

    for (const entry of entries) {
      visitedEntries += 1;
      if (visitedEntries > RECOVERY_MAX_ENTRIES) return false;
      if (entry.isSymbolicLink()) continue;
      const entryPath = path.join(directory, entry.name);
      if (entry.isFile() && entry.name === basename) {
        matches.add(path.resolve(entryPath));
        if (matches.size > 1) return false;
        continue;
      }
      if (entry.isDirectory() && depth < RECOVERY_MAX_DEPTH) {
        const completed = await scan(entryPath, depth + 1);
        if (!completed || matches.size > 1) return false;
      }
    }
    return true;
  };

  for (const segments of RECOVERABLE_VIEWER_ROOTS) {
    const root = path.resolve(workspaceRoot, ...segments);
    const completed = await scan(root, 0);
    if (!completed || matches.size > 1) return null;
  }

  return matches.size === 1 ? Array.from(matches)[0] : null;
}
