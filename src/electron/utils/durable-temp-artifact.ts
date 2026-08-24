import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

const DURABLE_TEMP_ARTIFACT_DIR = "temporary-workspaces";
const DURABLE_TASK_ATTACHMENT_DIR = "tasks";
const PRIVATE_DIRECTORY_MODE = 0o700;

function isPathInside(rootPath: string, candidatePath: string): boolean {
  const relative = path.relative(
    path.resolve(rootPath),
    path.resolve(candidatePath),
  );
  return (
    relative.length > 0 &&
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

function safeWorkspaceLabel(workspacePath: string): string {
  const basename =
    path
      .basename(path.resolve(workspacePath))
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "workspace";
  const identity = crypto
    .createHash("sha256")
    .update(path.resolve(workspacePath))
    .digest("hex")
    .slice(0, 16);
  return `${basename}-${identity}`;
}

function safeTaskLabel(taskId: string): string {
  const normalizedTaskId = String(taskId || "").trim();
  const readable =
    normalizedTaskId
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "task";
  const identity = crypto
    .createHash("sha256")
    .update(normalizedTaskId)
    .digest("hex")
    .slice(0, 16);
  return `${readable}-${identity}`;
}

function copyRegularFileAtomically(
  sourcePath: string,
  destinationPath: string,
  operation: "persist" | "restore",
): string | null {
  let sourceStat: fs.Stats;
  try {
    sourceStat = fs.lstatSync(sourcePath);
  } catch {
    return null;
  }
  if (
    sourceStat.isSymbolicLink() ||
    !sourceStat.isFile() ||
    sourceStat.size <= 0
  ) {
    return null;
  }

  if (path.resolve(sourcePath) === path.resolve(destinationPath)) {
    return destinationPath;
  }

  fs.mkdirSync(path.dirname(destinationPath), {
    recursive: true,
    mode: PRIVATE_DIRECTORY_MODE,
  });
  const temporaryDestination = path.join(
    path.dirname(destinationPath),
    `.${path.basename(destinationPath)}.${process.pid}.${crypto.randomUUID()}.${operation}.tmp`,
  );
  try {
    fs.copyFileSync(sourcePath, temporaryDestination);
    const copiedStat = fs.statSync(temporaryDestination);
    if (!copiedStat.isFile() || copiedStat.size !== sourceStat.size) {
      throw new Error(
        `${operation === "persist" ? "Durable" : "Restored"} artifact copy did not preserve the source size`,
      );
    }
    fs.renameSync(temporaryDestination, destinationPath);
  } finally {
    try {
      fs.rmSync(temporaryDestination, { force: true });
    } catch {
      // Best-effort cleanup for an interrupted copy.
    }
  }
  return destinationPath;
}

export function resolveDurableTempWorkspaceRoot(options: {
  userDataPath: string;
  workspacePath: string;
}): string {
  return path.join(
    path.resolve(options.userDataPath),
    "artifacts",
    DURABLE_TEMP_ARTIFACT_DIR,
    safeWorkspaceLabel(options.workspacePath),
  );
}

export function resolveDurableTaskAttachmentRoot(options: {
  userDataPath: string;
  taskId: string;
}): string {
  return path.join(
    path.resolve(options.userDataPath),
    "artifacts",
    DURABLE_TASK_ATTACHMENT_DIR,
    safeTaskLabel(options.taskId),
    "attachments",
  );
}

function resolveWorkspaceArtifactSource(
  workspacePath: string,
  artifactPath: string,
): { sourcePath: string; relativePath: string } | null {
  const workspaceRoot = path.resolve(workspacePath);
  const normalizedArtifactPath = String(artifactPath || "").trim();
  if (!normalizedArtifactPath) return null;

  const sourcePath = path.isAbsolute(normalizedArtifactPath)
    ? path.resolve(normalizedArtifactPath)
    : path.resolve(workspaceRoot, normalizedArtifactPath);
  if (!isPathInside(workspaceRoot, sourcePath)) return null;

  const relativePath = path.relative(workspaceRoot, sourcePath);
  if (!relativePath || relativePath.split(path.sep).includes("..")) return null;
  return { sourcePath, relativePath };
}

/**
 * Resolve the stable mirror path for an artifact produced inside a temporary
 * workspace. The result is deterministic, so preview/open/download can recover
 * an artifact even after the operating system or a cleanup job removes the
 * original temporary directory.
 */
export function resolveDurableTempArtifactPath(options: {
  userDataPath: string;
  workspacePath: string;
  artifactPath: string;
}): string | null {
  const source = resolveWorkspaceArtifactSource(
    options.workspacePath,
    options.artifactPath,
  );
  if (!source) return null;
  return path.join(
    resolveDurableTempWorkspaceRoot(options),
    source.relativePath,
  );
}

/**
 * Atomically mirror one completed artifact out of the system temp volume.
 * Only regular, non-symlink files inside the workspace are accepted.
 */
export function persistTempWorkspaceArtifactSync(options: {
  userDataPath: string;
  workspacePath: string;
  artifactPath: string;
}): string | null {
  const source = resolveWorkspaceArtifactSource(
    options.workspacePath,
    options.artifactPath,
  );
  if (!source) return null;

  const destination = resolveDurableTempArtifactPath(options);
  if (!destination) return null;
  return copyRegularFileAtomically(
    source.sourcePath,
    destination,
    "persist",
  );
}

/**
 * Restore a workspace-relative file from its durable mirror when the system
 * temp volume was cleared between task interruption and resume.
 *
 * The restored file keeps the original workspace-relative path so existing
 * prompts, provenance records, and workspace containment checks continue to
 * work without special cases in every file-reading tool.
 */
export function restoreTempWorkspaceArtifactSync(options: {
  userDataPath: string;
  workspacePath: string;
  artifactPath: string;
}): string | null {
  const source = resolveWorkspaceArtifactSource(
    options.workspacePath,
    options.artifactPath,
  );
  if (!source) return null;

  try {
    const existingStat = fs.lstatSync(source.sourcePath);
    if (
      !existingStat.isSymbolicLink() &&
      existingStat.isFile() &&
      existingStat.size > 0
    ) {
      return source.sourcePath;
    }
    return null;
  } catch {
    // The source is missing. Recover it from the durable mirror below.
  }

  const durablePath = resolveDurableTempArtifactPath(options);
  if (!durablePath) return null;

  return copyRegularFileAtomically(
    durablePath,
    source.sourcePath,
    "restore",
  );
}

function resolveTaskAttachmentPath(options: {
  userDataPath: string;
  taskId: string;
  workspacePath: string;
  artifactPath: string;
}): { sourcePath: string; relativePath: string; durablePath: string } | null {
  const source = resolveWorkspaceArtifactSource(
    options.workspacePath,
    options.artifactPath,
  );
  if (!source) return null;
  return {
    ...source,
    durablePath: path.join(
      resolveDurableTaskAttachmentRoot(options),
      source.relativePath,
    ),
  };
}

/**
 * Persist an uploaded workspace file under a task-stable identity. Unlike the
 * legacy workspace mirror, this path remains valid when a resumed task is
 * rebound to a newly created temporary workspace.
 */
export function persistTaskAttachmentSync(options: {
  userDataPath: string;
  taskId: string;
  workspacePath: string;
  artifactPath: string;
}): string | null {
  const resolved = resolveTaskAttachmentPath(options);
  if (!resolved) return null;
  return copyRegularFileAtomically(
    resolved.sourcePath,
    resolved.durablePath,
    "persist",
  );
}

function findLegacyWorkspaceMirror(options: {
  userDataPath: string;
  relativePath: string;
}): string | null {
  const legacyRoot = path.join(
    path.resolve(options.userDataPath),
    "artifacts",
    DURABLE_TEMP_ARTIFACT_DIR,
  );
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(legacyRoot, { withFileTypes: true });
  } catch {
    return null;
  }

  const candidates: Array<{ path: string; mtimeMs: number }> = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    const candidate = path.join(legacyRoot, entry.name, options.relativePath);
    if (!isPathInside(legacyRoot, candidate)) continue;
    try {
      const stat = fs.lstatSync(candidate);
      if (!stat.isSymbolicLink() && stat.isFile() && stat.size > 0) {
        candidates.push({ path: candidate, mtimeMs: stat.mtimeMs });
      }
    } catch {
      // The legacy mirror does not contain this attachment.
    }
  }
  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return candidates[0]?.path || null;
}

/**
 * Restore an attachment into the task's current workspace. The task mirror is
 * authoritative. A legacy workspace mirror is accepted once and migrated so
 * tasks created by versions before task-scoped persistence can also recover.
 */
export function restoreTaskAttachmentSync(options: {
  userDataPath: string;
  taskId: string;
  workspacePath: string;
  artifactPath: string;
}): string | null {
  const resolved = resolveTaskAttachmentPath(options);
  if (!resolved) return null;

  try {
    const existing = fs.lstatSync(resolved.sourcePath);
    if (!existing.isSymbolicLink() && existing.isFile() && existing.size > 0) {
      persistTaskAttachmentSync(options);
      return resolved.sourcePath;
    }
  } catch {
    // Restore below.
  }

  let durableSource = resolved.durablePath;
  try {
    const stat = fs.lstatSync(durableSource);
    if (stat.isSymbolicLink() || !stat.isFile() || stat.size <= 0) {
      durableSource = "";
    }
  } catch {
    durableSource = "";
  }

  if (!durableSource) {
    durableSource =
      findLegacyWorkspaceMirror({
        userDataPath: options.userDataPath,
        relativePath: resolved.relativePath,
      }) || "";
    if (durableSource) {
      copyRegularFileAtomically(
        durableSource,
        resolved.durablePath,
        "persist",
      );
      durableSource = resolved.durablePath;
    }
  }
  if (!durableSource) return null;

  return copyRegularFileAtomically(
    durableSource,
    resolved.sourcePath,
    "restore",
  );
}

/** Extract only app-generated upload references, never arbitrary user paths. */
export function extractWorkspaceUploadPaths(text: string): string[] {
  const results = new Set<string>();
  const normalized = String(text || "");
  const pattern = /(?:^|[\s("'`])((?:\.neoworker[\\/]+uploads[\\/]+)[^)\]\r\n"'`]+)/gim;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(normalized)) !== null) {
    const candidate = match[1].trim().replace(/[.,;:]+$/, "");
    if (candidate) results.add(candidate);
  }
  return Array.from(results);
}
