import fs from "node:fs";
import path from "node:path";
import { LEGACY_WORKSPACE_KIT_DIRECTORIES } from "./legacy-brand-compat";

const CURRENT_KIT_DIRECTORY = ".neoworker";
const MIGRATION_MARKER = ".legacy-brand-migration.json";

export interface WorkspaceKitMigrationResult {
  workspacePath: string;
  sources: string[];
  copiedFiles: number;
}

function copyMissingFiles(source: string, destination: string): number {
  if (!fs.existsSync(source) || !fs.statSync(source).isDirectory()) return 0;
  fs.mkdirSync(destination, { recursive: true });
  let copiedFiles = 0;

  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const destinationPath = path.join(destination, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      copiedFiles += copyMissingFiles(sourcePath, destinationPath);
    } else if (entry.isFile() && !fs.existsSync(destinationPath)) {
      fs.copyFileSync(sourcePath, destinationPath);
      copiedFiles += 1;
    }
  }

  return copiedFiles;
}

/**
 * Preserve existing workspace memory and context after the directory rename.
 * Legacy directories remain untouched so the migration is reversible.
 */
export function migrateLegacyWorkspaceKits(
  workspaces: Array<{ path?: string | null }>,
): WorkspaceKitMigrationResult[] {
  const results: WorkspaceKitMigrationResult[] = [];

  for (const workspace of workspaces) {
    const workspacePath = typeof workspace.path === "string" ? workspace.path.trim() : "";
    if (!workspacePath || !fs.existsSync(workspacePath)) continue;

    const destination = path.join(workspacePath, CURRENT_KIT_DIRECTORY);
    const markerPath = path.join(destination, MIGRATION_MARKER);
    if (fs.existsSync(markerPath)) {
      try {
        const marker = JSON.parse(fs.readFileSync(markerPath, "utf8")) as {
          version?: number;
        };
        if (Number(marker.version ?? 0) >= 1) continue;
      } catch {
        // A missing or invalid marker is safe to retry.
      }
    }

    const sources: string[] = [];
    let copiedFiles = 0;
    for (const directoryName of LEGACY_WORKSPACE_KIT_DIRECTORIES) {
      const source = path.join(workspacePath, directoryName);
      if (!fs.existsSync(source) || !fs.statSync(source).isDirectory()) continue;
      const copied = copyMissingFiles(source, destination);
      copiedFiles += copied;
      sources.push(directoryName);
    }

    if (sources.length === 0) continue;
    fs.mkdirSync(destination, { recursive: true });
    fs.writeFileSync(
      markerPath,
      JSON.stringify(
        {
          version: 1,
          migratedAt: new Date().toISOString(),
          sources,
          copiedFiles,
        },
        null,
        2,
      ),
      { mode: 0o600 },
    );
    results.push({ workspacePath, sources, copiedFiles });
  }

  return results;
}
