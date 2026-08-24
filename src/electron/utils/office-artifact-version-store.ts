import { createHash, randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";

export interface OfficeArtifactVersionReservation {
  logicalKey: string;
  version: number;
  path: string;
}

interface VersionIndexRecord {
  schemaVersion: 1;
  logicalKey: string;
  requestedPath: string;
  lastReservedVersion: number;
  updatedAt: string;
}

const LOCK_RETRY_MS = 10;
const LOCK_ATTEMPTS = 500;

function normalizeLogicalPath(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  const stem = path.basename(filePath, extension).replace(/-v\d+$/i, "");
  return path
    .join(path.dirname(filePath), `${stem}${extension}`)
    .split(path.sep)
    .join("/");
}

function versionedPath(basePath: string, version: number): string {
  if (version <= 1) return basePath;
  const extension = path.extname(basePath);
  const stem = path.basename(basePath, extension).replace(/-v\d+$/i, "");
  return path.join(path.dirname(basePath), `${stem}-v${version}${extension}`);
}

function assertWorkspacePath(workspacePath: string, candidatePath: string): void {
  const relative = path.relative(path.resolve(workspacePath), path.resolve(candidatePath));
  if (
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error("Office artifact version path escapes the current workspace.");
  }
}

async function acquireLock(lockPath: string): Promise<() => Promise<void>> {
  await fs.mkdir(path.dirname(lockPath), { recursive: true });
  for (let attempt = 0; attempt < LOCK_ATTEMPTS; attempt += 1) {
    try {
      await fs.mkdir(lockPath);
      return () => fs.rm(lockPath, { recursive: true, force: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      await new Promise((resolve) => setTimeout(resolve, LOCK_RETRY_MS));
    }
  }
  throw new Error("Timed out while reserving an Office artifact version.");
}

async function highestManifestVersion(
  workspacePath: string,
  logicalKey: string,
): Promise<number> {
  const directory = path.join(workspacePath, ".neoworker", "office-manifests");
  const names = await fs.readdir(directory).catch(() => [] as string[]);
  let highest = 0;
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    const manifest = await fs
      .readFile(path.join(directory, name), "utf8")
      .then((text) => JSON.parse(text) as { status?: string; finalPath?: string; version?: number })
      .catch(() => null);
    if (
      manifest?.status === "published" &&
      typeof manifest.finalPath === "string" &&
      normalizeLogicalPath(manifest.finalPath) === logicalKey &&
      Number.isInteger(manifest.version)
    ) {
      highest = Math.max(highest, manifest.version || 0);
    }
  }
  return highest;
}

async function highestFilesystemVersion(basePath: string): Promise<number> {
  const directory = path.dirname(basePath);
  const extension = path.extname(basePath);
  const stem = path.basename(basePath, extension).replace(/-v\d+$/i, "");
  const names = await fs.readdir(directory).catch(() => [] as string[]);
  let highest = 0;
  for (const name of names) {
    if (name === `${stem}${extension}`) {
      highest = Math.max(highest, 1);
      continue;
    }
    const match = name.match(
      new RegExp(`^${stem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-v(\\d+)${extension.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
    );
    if (match) highest = Math.max(highest, Number(match[1]) || 0);
  }
  return highest;
}

/**
 * Reserves a monotonically increasing version through a workspace transaction
 * index. Filesystem discovery is retained only as reconciliation for files
 * created before manifests existed or copied into the workspace externally.
 */
export async function reserveOfficeArtifactVersion(
  workspacePath: string,
  requestedPath: string,
): Promise<OfficeArtifactVersionReservation> {
  const root = path.resolve(workspacePath);
  const requested = path.resolve(requestedPath);
  assertWorkspacePath(root, requested);
  const relativeRequested = path.relative(root, requested);
  const logicalKey = normalizeLogicalPath(relativeRequested);
  const basePath = path.resolve(root, logicalKey);
  assertWorkspacePath(root, basePath);

  const indexDirectory = path.join(root, ".neoworker", "office-version-index");
  const indexName = createHash("sha256").update(logicalKey).digest("hex");
  const indexPath = path.join(indexDirectory, `${indexName}.json`);
  const lockPath = path.join(indexDirectory, `${indexName}.lock`);
  const release = await acquireLock(lockPath);
  try {
    const indexRecord = await fs
      .readFile(indexPath, "utf8")
      .then((text) => JSON.parse(text) as VersionIndexRecord)
      .catch(() => null);
    const [manifestVersion, filesystemVersion] = await Promise.all([
      highestManifestVersion(root, logicalKey),
      highestFilesystemVersion(basePath),
    ]);
    const highest = Math.max(
      indexRecord?.logicalKey === logicalKey
        ? indexRecord.lastReservedVersion || 0
        : 0,
      manifestVersion,
      filesystemVersion,
    );
    const version = Math.max(1, highest + 1);
    const record: VersionIndexRecord = {
      schemaVersion: 1,
      logicalKey,
      requestedPath: logicalKey,
      lastReservedVersion: version,
      updatedAt: new Date().toISOString(),
    };
    await fs.mkdir(indexDirectory, { recursive: true });
    const temporaryPath = `${indexPath}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await fs.writeFile(temporaryPath, JSON.stringify(record, null, 2), "utf8");
      await fs.rename(temporaryPath, indexPath);
    } finally {
      await fs.rm(temporaryPath, { force: true }).catch(() => undefined);
    }
    return { logicalKey, version, path: versionedPath(basePath, version) };
  } finally {
    await release();
  }
}

