import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { OfficeArtifactFormat } from "./office-artifact-integrity";

export type OfficeArtifactJobPhase =
  | "staging"
  | "validating"
  | "repairing"
  | "ready_to_publish"
  | "published"
  | "cancelled"
  | "failed";

export interface OfficeArtifactStageTimings {
  planning: number;
  generation: number;
  integrityCheck: number;
  qualityCheck: number;
  repair: number;
  publish: number;
  total: number;
}

export interface OfficeArtifactJobRecord {
  schemaVersion: "1";
  jobId: string;
  requestId: string;
  format: OfficeArtifactFormat;
  requestedPath: string;
  stagingDirectory: string;
  stagingPath: string;
  phase: OfficeArtifactJobPhase;
  status: "active" | "published" | "cancelled" | "failed";
  retryable: boolean;
  repairAttempts: number;
  templateId: string;
  templateVersion: string;
  generatorVersion: string;
  deliveryPolicyVersion: string;
  rolloutBucket: number;
  timingsMs?: OfficeArtifactStageTimings;
  createdAt: string;
  updatedAt: string;
  finalPath?: string;
  manifestPath?: string;
  diagnosticCode?: string;
  recoveredAt?: string;
}

export interface OfficeArtifactRecoveryResult {
  recoveredPublished: string[];
  rolledBack: string[];
  ignored: string[];
  cleanedTransient: string[];
}

export interface OfficeArtifactCleanupOptions {
  now?: number;
  stagingTtlMs?: number;
  qualityTtlMs?: number;
}

const DEFAULT_STAGING_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_QUALITY_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const recoveryByWorkspace = new Map<string, Promise<OfficeArtifactRecoveryResult>>();

function normalizeRelativePath(workspacePath: string, candidatePath: string): string {
  const root = path.resolve(workspacePath);
  const candidate = path.resolve(candidatePath);
  const relative = path.relative(root, candidate);
  if (
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error("Office job path escapes the current workspace.");
  }
  return relative.split(path.sep).join("/");
}

function resolveWorkspaceRelative(workspacePath: string, relativePath: string): string {
  const absolutePath = path.resolve(workspacePath, relativePath);
  normalizeRelativePath(workspacePath, absolutePath);
  return absolutePath;
}

function jobsDirectory(workspacePath: string): string {
  return path.join(workspacePath, ".neoworker", "office-jobs");
}

function metricsPath(workspacePath: string): string {
  return path.join(workspacePath, ".neoworker", "office-metrics", "events.jsonl");
}

function jobPath(workspacePath: string, jobId: string): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(jobId)) {
    throw new Error("Invalid Office job id.");
  }
  return path.join(jobsDirectory(workspacePath), `${jobId}.json`);
}

async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    await fs.writeFile(temporaryPath, JSON.stringify(value, null, 2), "utf8");
    await fs.rename(temporaryPath, filePath);
  } finally {
    await fs.rm(temporaryPath, { force: true }).catch(() => undefined);
  }
}

async function appendMetric(
  workspacePath: string,
  record: OfficeArtifactJobRecord,
): Promise<void> {
  const destination = metricsPath(workspacePath);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  const durationMs = Math.max(
    0,
    Date.parse(record.updatedAt) - Date.parse(record.createdAt),
  );
  // Deliberately exclude filenames, content, prompts and source data. These
  // records are operational health signals only.
  const metric = {
    schemaVersion: 1,
    timestamp: record.updatedAt,
    jobId: record.jobId,
    requestId: record.requestId,
    format: record.format,
    phase: record.phase,
    status: record.status,
    retryable: record.retryable,
    repairAttempts: record.repairAttempts,
    diagnosticCode: record.diagnosticCode,
    durationMs,
    templateId: record.templateId,
    templateVersion: record.templateVersion,
    generatorVersion: record.generatorVersion,
    deliveryPolicyVersion: record.deliveryPolicyVersion,
    rolloutBucket: record.rolloutBucket,
    timingsMs: record.timingsMs,
  };
  await fs.appendFile(destination, `${JSON.stringify(metric)}\n`, "utf8");
}

export async function createOfficeArtifactJob(
  workspacePath: string,
  input: Omit<OfficeArtifactJobRecord, "schemaVersion" | "createdAt" | "updatedAt">,
): Promise<OfficeArtifactJobRecord> {
  const now = new Date().toISOString();
  const record: OfficeArtifactJobRecord = {
    ...input,
    schemaVersion: "1",
    requestedPath: normalizeRelativePath(workspacePath, input.requestedPath),
    stagingDirectory: normalizeRelativePath(workspacePath, input.stagingDirectory),
    stagingPath: normalizeRelativePath(workspacePath, input.stagingPath),
    finalPath: input.finalPath
      ? normalizeRelativePath(workspacePath, input.finalPath)
      : undefined,
    manifestPath: input.manifestPath
      ? normalizeRelativePath(workspacePath, input.manifestPath)
      : undefined,
    createdAt: now,
    updatedAt: now,
  };
  await writeJsonAtomic(jobPath(workspacePath, record.jobId), record);
  await appendMetric(workspacePath, record);
  return record;
}

export async function readOfficeArtifactJob(
  workspacePath: string,
  jobId: string,
): Promise<OfficeArtifactJobRecord | null> {
  try {
    const parsed = JSON.parse(
      await fs.readFile(jobPath(workspacePath, jobId), "utf8"),
    ) as OfficeArtifactJobRecord;
    return parsed?.schemaVersion === "1" && parsed.jobId === jobId ? parsed : null;
  } catch {
    return null;
  }
}

export async function updateOfficeArtifactJob(
  workspacePath: string,
  jobId: string,
  patch: Partial<
    Pick<
      OfficeArtifactJobRecord,
      | "phase"
      | "status"
      | "retryable"
      | "repairAttempts"
      | "finalPath"
      | "manifestPath"
      | "diagnosticCode"
      | "recoveredAt"
      | "timingsMs"
    >
  >,
): Promise<OfficeArtifactJobRecord> {
  const current = await readOfficeArtifactJob(workspacePath, jobId);
  if (!current) throw new Error(`Office artifact job ${jobId} does not exist.`);
  const next: OfficeArtifactJobRecord = {
    ...current,
    ...patch,
    finalPath: patch.finalPath
      ? normalizeRelativePath(workspacePath, patch.finalPath)
      : patch.finalPath === undefined
        ? current.finalPath
        : undefined,
    manifestPath: patch.manifestPath
      ? normalizeRelativePath(workspacePath, patch.manifestPath)
      : patch.manifestPath === undefined
        ? current.manifestPath
        : undefined,
    updatedAt: new Date().toISOString(),
  };
  await writeJsonAtomic(jobPath(workspacePath, jobId), next);
  await appendMetric(workspacePath, next);
  return next;
}

export async function listOfficeArtifactJobs(
  workspacePath: string,
): Promise<OfficeArtifactJobRecord[]> {
  const directory = jobsDirectory(workspacePath);
  const names = await fs.readdir(directory).catch(() => [] as string[]);
  const records = await Promise.all(
    names
      .filter((name) => name.endsWith(".json"))
      .map(async (name) =>
        readOfficeArtifactJob(workspacePath, name.slice(0, -5)),
      ),
  );
  return records
    .filter((record): record is OfficeArtifactJobRecord => Boolean(record))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

async function fileExists(filePath: string): Promise<boolean> {
  return fs
    .stat(filePath)
    .then((stat) => stat.isFile())
    .catch(() => false);
}

function isSafeTransientDirectoryName(name: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9_-]{7,127}$/.test(name);
}

export async function cleanupOfficeArtifactTransientData(
  workspacePath: string,
  options: OfficeArtifactCleanupOptions = {},
): Promise<string[]> {
  const root = path.resolve(workspacePath);
  const now = options.now ?? Date.now();
  const targets = [
    {
      root: path.join(root, ".neoworker", "office-staging"),
      ttlMs: options.stagingTtlMs ?? DEFAULT_STAGING_TTL_MS,
    },
    {
      root: path.join(root, ".neoworker", "office-quality"),
      ttlMs: options.qualityTtlMs ?? DEFAULT_QUALITY_TTL_MS,
    },
  ];
  const removed: string[] = [];
  for (const target of targets) {
    const entries = await fs
      .readdir(target.root, { withFileTypes: true })
      .catch(() => [] as import("node:fs").Dirent[]);
    for (const entry of entries) {
      if (!entry.isDirectory() || !isSafeTransientDirectoryName(entry.name)) {
        continue;
      }
      const candidate = path.join(target.root, entry.name);
      const stat = await fs.stat(candidate).catch(() => null);
      if (!stat || now - stat.mtimeMs < Math.max(0, target.ttlMs)) continue;
      // Candidate is a direct child of one of the two private Office roots and
      // has an artifact/job-shaped identifier. Never recurse from workspace
      // root or follow an arbitrary recorded path during TTL cleanup.
      await fs.rm(candidate, { recursive: true, force: true });
      removed.push(path.relative(root, candidate).split(path.sep).join("/"));
    }
  }
  return removed;
}

export async function recoverOfficeArtifactJobs(
  workspacePath: string,
): Promise<OfficeArtifactRecoveryResult> {
  const result: OfficeArtifactRecoveryResult = {
    recoveredPublished: [],
    rolledBack: [],
    ignored: [],
    cleanedTransient: [],
  };
  for (const record of await listOfficeArtifactJobs(workspacePath)) {
    if (record.status !== "active") {
      result.ignored.push(record.jobId);
      continue;
    }

    const manifestPath = record.manifestPath
      ? resolveWorkspaceRelative(workspacePath, record.manifestPath)
      : path.join(
          workspacePath,
          ".neoworker",
          "office-manifests",
          `${record.jobId}.json`,
        );
    const finalPath = record.finalPath
      ? resolveWorkspaceRelative(workspacePath, record.finalPath)
      : undefined;
    const manifest = manifestPath
      ? await fs
          .readFile(manifestPath, "utf8")
          .then((text) => JSON.parse(text) as { status?: string; artifactId?: string })
          .catch(() => null)
      : null;
    if (
      manifest?.status === "published" &&
      manifest.artifactId === record.jobId &&
      finalPath &&
      (await fileExists(finalPath))
    ) {
      await updateOfficeArtifactJob(workspacePath, record.jobId, {
        phase: "published",
        status: "published",
        retryable: false,
        diagnosticCode: undefined,
        manifestPath,
        recoveredAt: new Date().toISOString(),
      });
      result.recoveredPublished.push(record.jobId);
      continue;
    }

    // A final path recorded without a committed manifest belongs to this job
    // transaction and is not a deliverable. Remove it before it can be indexed.
    if (finalPath) {
      await fs.rm(finalPath, { force: true }).catch(() => undefined);
    }
    const stagingDirectory = resolveWorkspaceRelative(
      workspacePath,
      record.stagingDirectory,
    );
    const expectedStagingRoot = path.join(
      path.resolve(workspacePath),
      ".neoworker",
      "office-staging",
    );
    if (
      stagingDirectory === expectedStagingRoot ||
      stagingDirectory.startsWith(`${expectedStagingRoot}${path.sep}`)
    ) {
      await fs
        .rm(stagingDirectory, { recursive: true, force: true })
        .catch(() => undefined);
    }
    await updateOfficeArtifactJob(workspacePath, record.jobId, {
      phase: "failed",
      status: "failed",
      retryable: true,
      diagnosticCode: "APP_RESTARTED",
      recoveredAt: new Date().toISOString(),
    });
    result.rolledBack.push(record.jobId);
  }
  result.cleanedTransient = await cleanupOfficeArtifactTransientData(workspacePath);
  return result;
}

/**
 * Runs recovery exactly once per workspace in this process. Concurrent Office
 * requests share the same promise, so one request can never recover another
 * request that has just entered staging.
 */
export function ensureOfficeArtifactWorkspaceRecovered(
  workspacePath: string,
): Promise<OfficeArtifactRecoveryResult> {
  const key = path.resolve(workspacePath);
  const existing = recoveryByWorkspace.get(key);
  if (existing) return existing;
  const recovery = recoverOfficeArtifactJobs(key).catch((error) => {
    recoveryByWorkspace.delete(key);
    throw error;
  });
  recoveryByWorkspace.set(key, recovery);
  return recovery;
}

export function resetOfficeArtifactRecoveryForTests(): void {
  recoveryByWorkspace.clear();
}
