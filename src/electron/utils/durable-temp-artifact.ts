import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

const DURABLE_TEMP_ARTIFACT_DIR = "temporary-workspaces";
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

  const sourceStat = fs.lstatSync(source.sourcePath);
  if (
    sourceStat.isSymbolicLink() ||
    !sourceStat.isFile() ||
    sourceStat.size <= 0
  ) {
    return null;
  }

  const destination = resolveDurableTempArtifactPath(options);
  if (!destination) return null;
  if (path.resolve(destination) === source.sourcePath) return destination;

  fs.mkdirSync(path.dirname(destination), {
    recursive: true,
    mode: PRIVATE_DIRECTORY_MODE,
  });
  const temporaryDestination = path.join(
    path.dirname(destination),
    `.${path.basename(destination)}.${process.pid}.${crypto.randomUUID()}.tmp`,
  );
  try {
    fs.copyFileSync(source.sourcePath, temporaryDestination);
    const copiedStat = fs.statSync(temporaryDestination);
    if (!copiedStat.isFile() || copiedStat.size !== sourceStat.size) {
      throw new Error("Durable artifact copy did not preserve the source size");
    }
    fs.renameSync(temporaryDestination, destination);
  } finally {
    try {
      fs.rmSync(temporaryDestination, { force: true });
    } catch {
      // Best-effort cleanup for an interrupted copy.
    }
  }
  return destination;
}
