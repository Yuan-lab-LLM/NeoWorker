import { createHash, randomUUID } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { OfficeQualityReport } from "./office-document-quality";
import {
  inspectOfficeArtifactIntegrity,
  type OfficeArtifactExpectation,
  type OfficeArtifactIntegrityReport,
} from "./office-artifact-integrity";
import {
  buildOfficeContentCoverageReport,
  inspectOfficeContentConsistency,
  persistCanonicalContentSnapshot,
  validateCanonicalContentSnapshot,
  type CanonicalContentSnapshot,
  type ContentConsumption,
  type ContentOmission,
  type FormatFactProjection,
  type OfficeContentConsistencyReport,
  type OfficeContentCoverageReport,
} from "./office-content-model";
import { reserveOfficeArtifactVersion } from "./office-artifact-version-store";
import {
  createOfficeArtifactJob,
  ensureOfficeArtifactWorkspaceRecovered,
  updateOfficeArtifactJob,
  type OfficeArtifactStageTimings,
} from "./office-artifact-job-store";
import {
  resolveOfficeArtifactRollout,
  type OfficeArtifactRolloutDecision,
} from "./office-artifact-rollout";
import { resolveOfficeFontPlan, type OfficeFontPlan } from "./office-font-resolver";

export type OfficeArtifactPublishPhase =
  | "staging"
  | "validating"
  | "repairing"
  | "ready_to_publish"
  | "published"
  | "cancelled"
  | "failed";

export interface OfficeArtifactPublishOptions {
  workspacePath: string;
  requestedPath: string;
  requestId?: string;
  contentSnapshotId?: string;
  contentSnapshot?: CanonicalContentSnapshot;
  contentConsumption?: ContentConsumption[];
  contentOmissions?: ContentOmission[];
  factProjections?: FormatFactProjection[];
  generatorVersion?: string;
  skillVersion?: string;
  templateId?: string;
  templateVersion?: string;
  planningDurationMs?: number;
  signal?: AbortSignal;
  expectation: OfficeArtifactExpectation;
  build: (stagingPath: string, attempt: number) => Promise<void>;
  inspect: (stagingPath: string) => Promise<OfficeQualityReport>;
  maxRepairAttempts?: number;
  repair?: (context: {
    attempt: number;
    code: "BUILD_FAILED" | "EMPTY_OUTPUT" | "INTEGRITY_FAILED" | "QUALITY_FAILED";
    stagingPath: string;
    qualityCheck?: OfficeQualityReport;
    integrityCheck?: OfficeArtifactIntegrityReport;
  }) => Promise<boolean> | boolean;
  rejectQualityIssues?: boolean;
  onPhase?: (
    phase: OfficeArtifactPublishPhase,
    details?: Record<string, unknown>,
  ) => void;
}

export interface PublishedOfficeArtifact {
  path: string;
  size: number;
  qualityCheck: OfficeQualityReport;
  integrityCheck: OfficeArtifactIntegrityReport;
  contentCoverage?: OfficeContentCoverageReport;
  contentConsistency?: OfficeContentConsistencyReport;
  manifest: OfficeArtifactManifest;
  manifestPath: string;
  deduplicated?: boolean;
}

export interface OfficeArtifactQualityScore {
  total: number;
  threshold: 85;
  hardGatePassed: boolean;
  dimensions: {
    structureCorrectness: number;
    contentCompleteness: number;
    visualQuality: number;
    usability: number;
    traceability: number;
  };
}

export interface OfficeArtifactManifest {
  artifactId: string;
  requestId: string;
  format: OfficeArtifactExpectation["format"];
  version: number;
  finalPath: string;
  contentHash: string;
  contentSnapshotId: string;
  contentSchemaVersion?: string;
  contentCoverage?: OfficeContentCoverageReport;
  contentConsistency?: OfficeContentConsistencyReport;
  generator: "officecli";
  generatorVersion: string;
  skillVersion: string;
  templateId: string;
  templateVersion: string;
  deliveryPolicy: OfficeArtifactRolloutDecision;
  fontPlan: OfficeFontPlan;
  quality: {
    status: OfficeQualityReport["status"];
    validationPassed: boolean;
    issueCount: number;
    integrityPassed: boolean;
    visualRequired: boolean;
    visualPassed: boolean;
    visualEvidencePath?: string;
    score: OfficeArtifactQualityScore;
  };
  timingsMs: OfficeArtifactStageTimings;
  status: "published";
  repairAttempts: number;
  createdAt: string;
  publishedAt: string;
}

export class OfficeArtifactPublishError extends Error {
  constructor(
    message: string,
    readonly code:
      | "PATH_OUTSIDE_WORKSPACE"
      | "BUILD_FAILED"
      | "EMPTY_OUTPUT"
      | "INTEGRITY_FAILED"
      | "CONTENT_FAILED"
      | "QUALITY_FAILED"
      | "DELIVERY_NOT_ENABLED"
      | "CANCELLED"
      | "PUBLISH_FAILED",
    readonly details?: {
      qualityCheck?: OfficeQualityReport;
      integrityCheck?: OfficeArtifactIntegrityReport;
      contentCoverage?: OfficeContentCoverageReport;
      contentConsistency?: OfficeContentConsistencyReport;
    },
  ) {
    super(message);
    this.name = "OfficeArtifactPublishError";
  }
}

function isBlockingOfficeQualityIssue(
  issue: NonNullable<OfficeQualityReport["issues"]>[number],
): boolean {
  const message = String(issue.message || "").trim().toLowerCase();
  // OfficeCLI currently labels mixed CJK/Latin punctuation as severity 2.
  // In multilingual business documents this is an editorial recommendation
  // (for example "PM2.5", "Open-Meteo", times, and slash-separated terms),
  // not evidence of a corrupt or unusable Office file. Keep it visible in the
  // quality report, but do not discard an otherwise valid, fully rendered file.
  if (message.includes("mixed cjk/latin punctuation")) return false;
  if (typeof issue.severity === "number") {
    // OfficeCLI emits 1 for advisory formatting recommendations and reserves
    // 2+ for errors that should block publication.
    return issue.severity >= 2;
  }
  const severity = String(issue.severity || "").trim().toLowerCase();
  return ["error", "critical", "fatal", "major", "blocker", "high"].includes(
    severity,
  );
}

function blockingOfficeQualityIssueCount(
  qualityCheck: OfficeQualityReport,
): number {
  return (qualityCheck.issues || []).filter(isBlockingOfficeQualityIssue).length;
}

function assertWorkspacePath(workspacePath: string, candidatePath: string): void {
  const root = path.resolve(workspacePath);
  const candidate = path.resolve(candidatePath);
  const relative = path.relative(root, candidate);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new OfficeArtifactPublishError(
      "Office artifact output path escapes the current workspace.",
      "PATH_OUTSIDE_WORKSPACE",
    );
  }
}

function throwIfOfficePublishAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  throw new OfficeArtifactPublishError(
    "Office artifact generation was cancelled.",
    "CANCELLED",
  );
}

function officeRepairErrorSignature(error: OfficeArtifactPublishError): string {
  const quality = error.details?.qualityCheck;
  const integrity = error.details?.integrityCheck;
  const normalized = JSON.stringify({
    code: error.code,
    message: error.message,
    integrityErrors: integrity?.errors || [],
    qualityStatus: quality?.status,
    validationMessage: quality?.validation?.message,
    visualMessage: quality?.visual?.message,
    issues: (quality?.issues || []).map((issue) => ({
      type: issue.type,
      severity: issue.severity,
      message: issue.message,
      path: issue.path,
    })),
  });
  return createHash("sha256").update(normalized).digest("hex");
}

export function calculateOfficeArtifactQualityScore(input: {
  format: OfficeArtifactExpectation["format"];
  qualityCheck: OfficeQualityReport;
  integrityCheck: OfficeArtifactIntegrityReport;
  contentCoverage?: OfficeContentCoverageReport;
  contentConsistency?: OfficeContentConsistencyReport;
  contentSnapshotId: string;
  generatorVersion: string;
  skillVersion: string;
  templateId: string;
  templateVersion: string;
}): OfficeArtifactQualityScore {
  const issueCount = input.qualityCheck.issueCount || 0;
  const blockingIssueCount = blockingOfficeQualityIssueCount(input.qualityCheck);
  const structureCorrectness =
    input.integrityCheck.passed &&
    input.qualityCheck.engine === "officecli" &&
    input.qualityCheck.validation?.passed === true &&
    blockingIssueCount === 0
      ? 25
      : 0;

  let contentCompleteness = 30;
  if (input.contentCoverage) {
    const critical = Math.max(
      0,
      Math.min(1, input.contentCoverage.criticalFactCoverage),
    );
    const general = Math.max(
      0,
      Math.min(1, input.contentCoverage.generalCoverage),
    );
    contentCompleteness = Math.round(critical * 20 + general * 10);
  }
  if (
    input.contentCoverage?.passed === false ||
    input.contentConsistency?.passed === false
  ) {
    contentCompleteness = 0;
  }

  const visualPassed =
    input.format === "xlsx"
      ? input.qualityCheck.status !== "failed" && blockingIssueCount === 0
      : input.qualityCheck.visual?.required === true &&
        input.qualityCheck.visual.passed === true &&
        Boolean(input.qualityCheck.visual.evidencePath);
  const visualQuality = visualPassed ? 25 : 0;
  const usability =
    input.qualityCheck.status !== "failed" && blockingIssueCount === 0
      ? Math.max(
          10,
          15 -
            Math.min(
              5,
              issueCount + input.qualityCheck.warnings.length,
            ),
        )
      : 0;
  const traceabilityFields = [
    input.contentSnapshotId,
    input.generatorVersion,
    input.skillVersion,
    input.templateId,
    input.templateVersion,
  ];
  const traceability = traceabilityFields.filter(
    (value) => typeof value === "string" && value.trim().length > 0,
  ).length;
  const hardGatePassed =
    structureCorrectness === 25 &&
    contentCompleteness >= 29 &&
    visualQuality === 25 &&
    input.contentCoverage?.passed !== false &&
    input.contentConsistency?.passed !== false;

  return {
    total:
      structureCorrectness +
      contentCompleteness +
      visualQuality +
      usability +
      traceability,
    threshold: 85,
    hardGatePassed,
    dimensions: {
      structureCorrectness,
      contentCompleteness,
      visualQuality,
      usability,
      traceability,
    },
  };
}

async function publishWithoutOverwrite(
  workspacePath: string,
  stagingPath: string,
  requestedPath: string,
): Promise<{ path: string; version: number }> {
  await fs.mkdir(path.dirname(requestedPath), { recursive: true });
  for (let attempt = 0; attempt < 10_000; attempt += 1) {
    const reservation = await reserveOfficeArtifactVersion(
      workspacePath,
      requestedPath,
    );
    const finalPath = reservation.path;
    try {
      // A hard link creates the final directory entry atomically and fails if
      // another concurrent publisher claimed the same version first.
      await fs.link(stagingPath, finalPath);
      return { path: finalPath, version: reservation.version };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "EEXIST") continue;
      if (code === "EXDEV" || code === "EPERM" || code === "ENOTSUP") {
        try {
          await fs.copyFile(stagingPath, finalPath, fsConstants.COPYFILE_EXCL);
          return { path: finalPath, version: reservation.version };
        } catch (copyError) {
          if ((copyError as NodeJS.ErrnoException).code === "EEXIST") continue;
          throw copyError;
        }
      }
      throw error;
    }
  }
  throw new Error("Could not reserve a unique Office artifact filename.");
}

async function calculateSha256(filePath: string): Promise<string> {
  const content = await fs.readFile(filePath);
  return createHash("sha256").update(content).digest("hex");
}

function logicalArtifactKey(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  const stem = path.basename(filePath, extension).replace(/-v\d+$/i, "");
  return path.join(path.dirname(filePath), `${stem}${extension}`).replace(/\\/g, "/");
}

async function findPublishedArtifactByHash(
  workspacePath: string,
  requestedPath: string,
  format: OfficeArtifactExpectation["format"],
  contentHash: string,
): Promise<{
  path: string;
  size: number;
  manifest: OfficeArtifactManifest;
  manifestPath: string;
} | null> {
  const directory = path.join(workspacePath, ".neoworker", "office-manifests");
  const names = await fs.readdir(directory).catch(() => [] as string[]);
  const requestedKey = logicalArtifactKey(
    path.relative(workspacePath, requestedPath),
  );
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    const manifestPath = path.join(directory, name);
    const manifest = await fs
      .readFile(manifestPath, "utf8")
      .then((text) => JSON.parse(text) as OfficeArtifactManifest)
      .catch(() => null);
    if (
      !manifest ||
      manifest.status !== "published" ||
      manifest.format !== format ||
      manifest.contentHash !== contentHash ||
      logicalArtifactKey(manifest.finalPath) !== requestedKey
    ) {
      continue;
    }
    const finalPath = path.resolve(workspacePath, manifest.finalPath);
    assertWorkspacePath(workspacePath, finalPath);
    const stat = await fs.stat(finalPath).catch(() => null);
    if (stat?.isFile() && stat.size > 0) {
      return { path: finalPath, size: stat.size, manifest, manifestPath };
    }
  }
  return null;
}

async function writePublishedManifest(
  workspacePath: string,
  manifest: OfficeArtifactManifest,
): Promise<string> {
  const manifestDirectory = path.join(
    workspacePath,
    ".neoworker",
    "office-manifests",
  );
  await fs.mkdir(manifestDirectory, { recursive: true });
  const manifestPath = path.join(manifestDirectory, `${manifest.artifactId}.json`);
  const temporaryPath = `${manifestPath}.tmp`;
  try {
    await fs.writeFile(temporaryPath, JSON.stringify(manifest, null, 2), {
      encoding: "utf8",
      flag: "wx",
    });
    await fs.rename(temporaryPath, manifestPath);
    return manifestPath;
  } finally {
    await fs.rm(temporaryPath, { force: true }).catch(() => undefined);
  }
}

const MAX_VISUAL_EVIDENCE_FILE_BYTES = 50 * 1024 * 1024;
const MAX_VISUAL_EVIDENCE_PAGES = 200;

async function assertReadableVisualEvidenceFile(filePath: string): Promise<void> {
  const stat = await fs.stat(filePath).catch(() => null);
  if (
    !stat?.isFile() ||
    stat.size <= 0 ||
    stat.size > MAX_VISUAL_EVIDENCE_FILE_BYTES
  ) {
    throw new Error(`Visual evidence is missing, empty, or too large: ${filePath}`);
  }
}

async function persistOfficeQualityEvidence(
  workspacePath: string,
  artifactId: string,
  sourcePath: string,
): Promise<{ directory: string; relativePath: string }> {
  const resolvedSource = path.resolve(sourcePath);
  await assertReadableVisualEvidenceFile(resolvedSource);
  const directory = path.join(
    workspacePath,
    ".neoworker",
    "office-quality",
    artifactId,
  );
  await fs.mkdir(directory, { recursive: true });
  const extension = path.extname(resolvedSource).toLowerCase();

  if (extension === ".png") {
    const destination = path.join(directory, "visual-evidence.png");
    await fs.copyFile(resolvedSource, destination);
    return {
      directory,
      relativePath: path.relative(workspacePath, destination).split(path.sep).join("/"),
    };
  }

  if (extension !== ".json") {
    throw new Error(`Unsupported visual evidence format: ${extension || "none"}`);
  }

  const payload = JSON.parse(await fs.readFile(resolvedSource, "utf8")) as {
    schemaVersion?: number;
    renderer?: string;
    sourceHtml?: string;
    createdAt?: string;
    pageCount?: number;
    pages?: Array<{ page?: number; imagePath?: string }>;
  };
  const pages = Array.isArray(payload.pages) ? payload.pages : [];
  if (
    pages.length === 0 ||
    pages.length > MAX_VISUAL_EVIDENCE_PAGES ||
    payload.pageCount !== pages.length
  ) {
    throw new Error("Visual evidence manifest has an invalid page count.");
  }

  const persistedPages: Array<{ page: number; imagePath: string }> = [];
  for (let index = 0; index < pages.length; index += 1) {
    const imageSource = path.resolve(String(pages[index]?.imagePath || ""));
    if (path.extname(imageSource).toLowerCase() !== ".png") {
      throw new Error(`Visual evidence page ${index + 1} is not a PNG image.`);
    }
    await assertReadableVisualEvidenceFile(imageSource);
    const fileName = `page-${String(index + 1).padStart(3, "0")}.png`;
    await fs.copyFile(imageSource, path.join(directory, fileName));
    persistedPages.push({ page: index + 1, imagePath: fileName });
  }

  const destination = path.join(directory, "evidence.json");
  await fs.writeFile(
    destination,
    JSON.stringify(
      {
        schemaVersion: payload.schemaVersion || 1,
        renderer: payload.renderer || "unknown",
        createdAt: payload.createdAt || new Date().toISOString(),
        pageCount: persistedPages.length,
        pages: persistedPages,
      },
      null,
      2,
    ),
    "utf8",
  );
  return {
    directory,
    relativePath: path.relative(workspacePath, destination).split(path.sep).join("/"),
  };
}

/**
 * Builds into an invisible task-scoped staging directory. Only artifacts that
 * pass package integrity and OfficeCLI quality gates receive a final workspace
 * filename. Failed/intermediate files are always removed and never registered.
 */
export async function buildAndPublishOfficeArtifact(
  options: OfficeArtifactPublishOptions,
): Promise<PublishedOfficeArtifact> {
  const workspacePath = path.resolve(options.workspacePath);
  const requestedPath = path.resolve(options.requestedPath);
  assertWorkspacePath(workspacePath, requestedPath);
  throwIfOfficePublishAborted(options.signal);
  await ensureOfficeArtifactWorkspaceRecovered(workspacePath);

  const jobId = randomUUID();
  const pipelineStartedAt = Date.now();
  const createdAt = new Date().toISOString();
  const requestId = options.requestId || jobId;
  const deliveryPolicy = resolveOfficeArtifactRollout(requestId);
  if (!deliveryPolicy.enabled) {
    throw new OfficeArtifactPublishError(
      deliveryPolicy.reason === "emergency-halt"
        ? "Office delivery is temporarily paused by the safety switch."
        : "Office delivery is not enabled for this rollout cohort.",
      "DELIVERY_NOT_ENABLED",
    );
  }
  const generatorVersion = options.generatorVersion || "unknown";
  const skillVersion = options.skillVersion || generatorVersion;
  const templateId =
    options.templateId || `neoworker-office-${options.expectation.format}`;
  const templateVersion = options.templateVersion || "1";
  const timingsMs: OfficeArtifactStageTimings = {
    planning: Math.max(0, options.planningDurationMs || 0),
    generation: 0,
    integrityCheck: 0,
    qualityCheck: 0,
    repair: 0,
    publish: 0,
    total: 0,
  };
  const stagingDirectory = path.join(
    workspacePath,
    ".neoworker",
    "office-staging",
    jobId,
  );
  // Staging files deliberately use an internal identifier instead of the
  // requested user-facing filename. Workspace/indexing code must never be
  // able to mistake an incomplete build for a deliverable artifact.
  const stagingPath = path.join(
    stagingDirectory,
    `${jobId}${path.extname(requestedPath).toLowerCase()}`,
  );
  await fs.mkdir(stagingDirectory, { recursive: true });
  try {
    await createOfficeArtifactJob(workspacePath, {
      jobId,
      requestId,
      format: options.expectation.format,
      requestedPath,
      stagingDirectory,
      stagingPath,
      phase: "staging",
      status: "active",
      retryable: false,
      repairAttempts: 0,
      templateId,
      templateVersion,
      generatorVersion,
      deliveryPolicyVersion: deliveryPolicy.policyVersion,
      rolloutBucket: deliveryPolicy.bucket,
      timingsMs,
    });
  } catch (error) {
    await fs.rm(stagingDirectory, { recursive: true, force: true });
    throw error;
  }
  options.onPhase?.("staging", { jobId });

  let qualityCheck: OfficeQualityReport | undefined;
  let integrityCheck: OfficeArtifactIntegrityReport | undefined;
  let contentCoverage: OfficeContentCoverageReport | undefined;
  let contentConsistency: OfficeContentConsistencyReport | undefined;
  let qualityScore: OfficeArtifactQualityScore | undefined;
  let repairAttempts = 0;
  let qualityEvidenceDirectory: string | undefined;
  let persistedVisualEvidencePath: string | undefined;
  let qualityEvidenceCommitted = false;
  let previousRepairErrorSignature: string | undefined;
  try {
    throwIfOfficePublishAborted(options.signal);
    if (options.contentSnapshot) {
      const snapshot = validateCanonicalContentSnapshot(options.contentSnapshot);
      if (
        options.contentSnapshotId &&
        options.contentSnapshotId !== snapshot.snapshotId
      ) {
        throw new OfficeArtifactPublishError(
          `Content snapshot id mismatch: expected "${options.contentSnapshotId}", received "${snapshot.snapshotId}".`,
          "CONTENT_FAILED",
        );
      }
      contentCoverage = buildOfficeContentCoverageReport(
        snapshot,
        options.expectation.format,
        options.contentConsumption || [],
        options.contentOmissions || [],
      );
      contentConsistency = inspectOfficeContentConsistency(
        snapshot,
        options.factProjections || [],
      );
      if (!contentCoverage.passed || !contentConsistency.passed) {
        throw new OfficeArtifactPublishError(
          [...contentCoverage.issues, ...contentConsistency.issues].join(" ") ||
            "Office artifact content gate failed.",
          "CONTENT_FAILED",
          { contentCoverage, contentConsistency },
        );
      }
    }
    const maxRepairAttempts = Math.min(2, Math.max(0, options.maxRepairAttempts || 0));
    while (true) {
      throwIfOfficePublishAborted(options.signal);
      let attemptError: OfficeArtifactPublishError | undefined;
      try {
        try {
          const generationStartedAt = Date.now();
          try {
            await options.build(stagingPath, repairAttempts);
          } finally {
            timingsMs.generation += Date.now() - generationStartedAt;
          }
        } catch (error) {
          if (
            options.signal?.aborted ||
            (error instanceof Error && error.name === "AbortError")
          ) {
            throw new OfficeArtifactPublishError(
              "Office artifact generation was cancelled.",
              "CANCELLED",
            );
          }
          throw new OfficeArtifactPublishError(
            `Office artifact generation failed: ${error instanceof Error ? error.message : String(error)}`,
            "BUILD_FAILED",
          );
        }

        const stat = await fs.stat(stagingPath).catch(() => null);
        throwIfOfficePublishAborted(options.signal);
        if (!stat?.isFile() || stat.size <= 0) {
          throw new OfficeArtifactPublishError(
            "Office artifact generation completed without a non-empty output file.",
            "EMPTY_OUTPUT",
          );
        }

        await updateOfficeArtifactJob(workspacePath, jobId, {
          phase: "validating",
          repairAttempts,
        });
        options.onPhase?.("validating", {
          jobId,
          size: stat.size,
          attempt: repairAttempts + 1,
        });
        const integrityStartedAt = Date.now();
        try {
          integrityCheck = await inspectOfficeArtifactIntegrity(
            stagingPath,
            options.expectation,
          );
        } finally {
          timingsMs.integrityCheck += Date.now() - integrityStartedAt;
        }
        if (!integrityCheck.passed) {
          throw new OfficeArtifactPublishError(
            integrityCheck.errors.join(" ") || "Office artifact integrity check failed.",
            "INTEGRITY_FAILED",
            { integrityCheck },
          );
        }

        const qualityStartedAt = Date.now();
        try {
          qualityCheck = await options.inspect(stagingPath);
        } finally {
          timingsMs.qualityCheck += Date.now() - qualityStartedAt;
        }
        const requiresVisualEvidence =
          options.expectation.format === "docx" ||
          options.expectation.format === "pptx";
        const visualEvidencePassed =
          !requiresVisualEvidence ||
          (qualityCheck.visual?.required === true &&
            qualityCheck.visual.passed === true &&
            Boolean(qualityCheck.visual.evidencePath));
        const blockingIssueCount =
          blockingOfficeQualityIssueCount(qualityCheck);
        const qualityPassed =
          qualityCheck.engine === "officecli" &&
          qualityCheck.validation?.passed === true &&
          qualityCheck.status !== "failed" &&
          visualEvidencePassed &&
          blockingIssueCount === 0 &&
          (options.rejectQualityIssues !== true ||
            (qualityCheck.status !== "issues" &&
              (qualityCheck.issueCount || 0) === 0));
        if (!qualityPassed) {
          throw new OfficeArtifactPublishError(
            qualityCheck.summary || "Office artifact quality gate failed.",
            "QUALITY_FAILED",
            { qualityCheck, integrityCheck },
          );
        }
        qualityScore = calculateOfficeArtifactQualityScore({
          format: options.expectation.format,
          qualityCheck,
          integrityCheck,
          contentCoverage,
          contentConsistency,
          contentSnapshotId:
            options.contentSnapshot?.snapshotId ||
            options.contentSnapshotId ||
            requestId,
          generatorVersion,
          skillVersion,
          templateId,
          templateVersion,
        });
        if (!qualityScore.hardGatePassed || qualityScore.total < qualityScore.threshold) {
          throw new OfficeArtifactPublishError(
            `Office artifact quality score ${qualityScore.total}/100 did not satisfy the ${qualityScore.threshold}-point release threshold and all hard gates.`,
            "QUALITY_FAILED",
            { qualityCheck, integrityCheck, contentCoverage, contentConsistency },
          );
        }
        break;
      } catch (error) {
        attemptError =
          error instanceof OfficeArtifactPublishError
            ? error
            : new OfficeArtifactPublishError(
                error instanceof Error ? error.message : String(error),
                "BUILD_FAILED",
              );
      }

      const repairable = [
        "BUILD_FAILED",
        "EMPTY_OUTPUT",
        "INTEGRITY_FAILED",
        "QUALITY_FAILED",
      ].includes(attemptError.code);
      const currentRepairErrorSignature = officeRepairErrorSignature(attemptError);
      if (
        !repairable ||
        currentRepairErrorSignature === previousRepairErrorSignature ||
        repairAttempts >= maxRepairAttempts ||
        !options.repair
      ) {
        throw attemptError;
      }
      previousRepairErrorSignature = currentRepairErrorSignature;
      const repairCode = attemptError.code as
        | "BUILD_FAILED"
        | "EMPTY_OUTPUT"
        | "INTEGRITY_FAILED"
        | "QUALITY_FAILED";
      const nextAttempt = repairAttempts + 1;
      await updateOfficeArtifactJob(workspacePath, jobId, {
        phase: "repairing",
        repairAttempts: nextAttempt,
        diagnosticCode: repairCode,
      });
      options.onPhase?.("repairing", {
        jobId,
        attempt: nextAttempt,
        code: repairCode,
        integrityCheck: attemptError.details?.integrityCheck,
        qualityCheck: attemptError.details?.qualityCheck,
      });
      const repairStartedAt = Date.now();
      throwIfOfficePublishAborted(options.signal);
      const shouldRetry = await Promise.resolve(
        options.repair({
          attempt: nextAttempt,
          code: repairCode,
          stagingPath,
          integrityCheck: attemptError.details?.integrityCheck,
          qualityCheck: attemptError.details?.qualityCheck,
        }),
      ).finally(() => {
        timingsMs.repair += Date.now() - repairStartedAt;
      });
      if (!shouldRetry) throw attemptError;
      repairAttempts = nextAttempt;
      qualityCheck = undefined;
      integrityCheck = undefined;
      qualityScore = undefined;
      await fs.rm(stagingPath, { force: true });
    }

    // Commit the immutable snapshot only after the artifact has passed its
    // content, integrity, and quality gates. A failed draft must not reserve a
    // snapshotId and poison a corrected retry with a false conflict.
    if (options.contentSnapshot) {
      await persistCanonicalContentSnapshot(workspacePath, options.contentSnapshot);
    }

    const contentHash = await calculateSha256(stagingPath);
    throwIfOfficePublishAborted(options.signal);
    const existingArtifact = await findPublishedArtifactByHash(
      workspacePath,
      requestedPath,
      options.expectation.format,
      contentHash,
    );
    if (existingArtifact) {
      timingsMs.total = Date.now() - pipelineStartedAt + timingsMs.planning;
      await updateOfficeArtifactJob(workspacePath, jobId, {
        phase: "published",
        status: "published",
        retryable: false,
        finalPath: existingArtifact.path,
        manifestPath: existingArtifact.manifestPath,
        repairAttempts,
        diagnosticCode: "RESULT_UNCHANGED",
        timingsMs,
      });
      options.onPhase?.("published", {
        jobId,
        path: existingArtifact.path,
        size: existingArtifact.size,
        manifestPath: existingArtifact.manifestPath,
        deduplicated: true,
        diagnosticCode: "RESULT_UNCHANGED",
      });
      return {
        path: existingArtifact.path,
        size: existingArtifact.size,
        qualityCheck,
        integrityCheck,
        contentCoverage,
        contentConsistency,
        manifest: existingArtifact.manifest,
        manifestPath: existingArtifact.manifestPath,
        deduplicated: true,
      };
    }

    await updateOfficeArtifactJob(workspacePath, jobId, {
      phase: "ready_to_publish",
      repairAttempts,
      diagnosticCode: undefined,
    });
    options.onPhase?.("ready_to_publish", { jobId });
    throwIfOfficePublishAborted(options.signal);
    if (qualityCheck.visual?.required === true) {
      try {
        const persistedEvidence = await persistOfficeQualityEvidence(
          workspacePath,
          jobId,
          qualityCheck.visual.evidencePath!,
        );
        qualityEvidenceDirectory = persistedEvidence.directory;
        persistedVisualEvidencePath = persistedEvidence.relativePath;
      } catch (error) {
        throw new OfficeArtifactPublishError(
          `Office visual evidence could not be committed: ${error instanceof Error ? error.message : String(error)}`,
          "QUALITY_FAILED",
          { qualityCheck, integrityCheck },
        );
      }
    }
    const publishStartedAt = Date.now();
    let finalPath: string;
    let publishedVersion: number;
    try {
      const publication = await publishWithoutOverwrite(
        workspacePath,
        stagingPath,
        requestedPath,
      );
      finalPath = publication.path;
      publishedVersion = publication.version;
      await updateOfficeArtifactJob(workspacePath, jobId, {
        phase: "ready_to_publish",
        finalPath,
        repairAttempts,
      });
    } catch (error) {
      throw new OfficeArtifactPublishError(
        `Office artifact could not be published: ${error instanceof Error ? error.message : String(error)}`,
        "PUBLISH_FAILED",
        { qualityCheck, integrityCheck },
      );
    }
    const finalStat = await fs.stat(finalPath);
    let manifest: OfficeArtifactManifest;
    let manifestPath: string | undefined;
    try {
      const publishedAt = new Date().toISOString();
      manifest = {
        artifactId: jobId,
        requestId,
        format: options.expectation.format,
        version: publishedVersion,
        finalPath: path.relative(workspacePath, finalPath).split(path.sep).join("/"),
        contentHash,
        contentSnapshotId:
          options.contentSnapshot?.snapshotId ||
          options.contentSnapshotId ||
          requestId,
        contentSchemaVersion: options.contentSnapshot?.schemaVersion,
        contentCoverage,
        contentConsistency,
        generator: "officecli",
        generatorVersion,
        skillVersion,
        templateId,
        templateVersion,
        deliveryPolicy,
        fontPlan: resolveOfficeFontPlan(),
        quality: {
          status: qualityCheck.status,
          validationPassed: qualityCheck.validation?.passed === true,
          issueCount: qualityCheck.issueCount || 0,
          integrityPassed: integrityCheck.passed,
          visualRequired: qualityCheck.visual?.required === true,
          visualPassed:
            qualityCheck.visual?.required !== true || qualityCheck.visual?.passed === true,
          visualEvidencePath: persistedVisualEvidencePath,
          score: qualityScore!,
        },
        timingsMs: {
          ...timingsMs,
          publish: Date.now() - publishStartedAt,
          total: Date.now() - pipelineStartedAt + timingsMs.planning,
        },
        status: "published",
        repairAttempts,
        createdAt,
        publishedAt,
      };
      manifestPath = await writePublishedManifest(workspacePath, manifest);
      qualityEvidenceCommitted = true;
      await updateOfficeArtifactJob(workspacePath, jobId, {
        phase: "published",
        status: "published",
        retryable: false,
        finalPath,
        manifestPath,
        repairAttempts,
        diagnosticCode: undefined,
        timingsMs: manifest.timingsMs,
      });
    } catch (error) {
      // The final directory entry belongs to this transaction. If its
      // manifest cannot be committed, roll it back so the UI cannot discover
      // a half-published Office file.
      await fs.rm(finalPath, { force: true }).catch(() => undefined);
      if (manifestPath) {
        await fs.rm(manifestPath, { force: true }).catch(() => undefined);
      }
      throw new OfficeArtifactPublishError(
        `Office artifact manifest could not be committed: ${error instanceof Error ? error.message : String(error)}`,
        "PUBLISH_FAILED",
        { qualityCheck, integrityCheck },
      );
    }
    options.onPhase?.("published", {
      jobId,
      path: finalPath,
      size: finalStat.size,
      manifestPath,
    });
    return {
      path: finalPath,
      size: finalStat.size,
      qualityCheck,
      integrityCheck,
      contentCoverage,
      contentConsistency,
      manifest,
      manifestPath: manifestPath!,
    };
  } catch (error) {
    timingsMs.total = Date.now() - pipelineStartedAt + timingsMs.planning;
    const cancelled =
      error instanceof OfficeArtifactPublishError && error.code === "CANCELLED";
    await updateOfficeArtifactJob(workspacePath, jobId, {
      phase: cancelled ? "cancelled" : "failed",
      status: cancelled ? "cancelled" : "failed",
      retryable: !cancelled,
      repairAttempts,
      diagnosticCode:
        error instanceof OfficeArtifactPublishError
          ? error.code
          : "PUBLISH_FAILED",
      timingsMs,
    }).catch(() => undefined);
    options.onPhase?.(cancelled ? "cancelled" : "failed", {
      jobId,
      code:
        error instanceof OfficeArtifactPublishError ? error.code : "PUBLISH_FAILED",
    });
    throw error;
  } finally {
    if (qualityEvidenceDirectory && !qualityEvidenceCommitted) {
      await fs
        .rm(qualityEvidenceDirectory, { recursive: true, force: true })
        .catch(() => undefined);
    }
    await fs.rm(stagingDirectory, { recursive: true, force: true }).catch(() => {
      // Cleanup is best-effort; stale staging directories are never artifacts.
    });
  }
}
