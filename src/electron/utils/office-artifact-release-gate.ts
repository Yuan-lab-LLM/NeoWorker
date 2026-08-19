import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { OfficeArtifactFormat } from "./office-artifact-integrity";
import type { OfficeArtifactManifest } from "./office-artifact-publisher";
import { listOfficeArtifactJobs } from "./office-artifact-job-store";

export interface OfficeArtifactReleaseGateOptions {
  formats?: OfficeArtifactFormat[];
  minimumPublishedPerFormat?: number;
  maximumFirstPassDurationMs?: Partial<Record<OfficeArtifactFormat, number>>;
}

export interface OfficeArtifactReleaseGateReport {
  passed: boolean;
  evaluatedAt: string;
  blockers: Array<{ code: string; message: string; artifactId?: string }>;
  stats: {
    published: number;
    publishedByFormat: Record<OfficeArtifactFormat, number>;
    corruptOrUnverified: number;
    belowQualityThreshold: number;
    completeFormatSets: number;
    duplicateRequestFormats: number;
    missingFinalFiles: number;
    firstPassRate: number;
    withinRepairPassRate: number;
    terminalMismatchCount: number;
  };
}

const DEFAULT_FORMATS: OfficeArtifactFormat[] = ["docx", "pptx", "xlsx"];
const DEFAULT_DURATION_BUDGETS: Record<OfficeArtifactFormat, number> = {
  docx: 120_000,
  xlsx: 120_000,
  pptx: 300_000,
};

async function readPublishedManifests(
  workspacePath: string,
): Promise<OfficeArtifactManifest[]> {
  const directory = path.join(workspacePath, ".neoworker", "office-manifests");
  const names = await fs.readdir(directory).catch(() => [] as string[]);
  const manifests = await Promise.all(
    names
      .filter((name) => name.endsWith(".json"))
      .map((name) =>
        fs
          .readFile(path.join(directory, name), "utf8")
          .then((text) => JSON.parse(text) as OfficeArtifactManifest)
          .catch(() => null),
      ),
  );
  return manifests.filter(
    (manifest): manifest is OfficeArtifactManifest =>
      Boolean(manifest?.artifactId && manifest.status === "published"),
  );
}

function p95(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] || 0;
}

/**
 * Audits committed manifests and job journals. It is intentionally read-only:
 * this gate can stop rollout, but it can never delete or rewrite a user's file.
 */
export async function evaluateOfficeArtifactReleaseGate(
  workspacePath: string,
  options: OfficeArtifactReleaseGateOptions = {},
): Promise<OfficeArtifactReleaseGateReport> {
  const root = path.resolve(workspacePath);
  const formats = options.formats || DEFAULT_FORMATS;
  const minimumPublishedPerFormat = Math.max(
    0,
    options.minimumPublishedPerFormat ?? 20,
  );
  const manifests = await readPublishedManifests(root);
  const jobs = await listOfficeArtifactJobs(root);
  const blockers: OfficeArtifactReleaseGateReport["blockers"] = [];
  const publishedByFormat: Record<OfficeArtifactFormat, number> = {
    docx: 0,
    pptx: 0,
    xlsx: 0,
  };
  let corruptOrUnverified = 0;
  let belowQualityThreshold = 0;
  let missingFinalFiles = 0;
  const requestFormatCounts = new Map<string, number>();

  for (const manifest of manifests) {
    publishedByFormat[manifest.format] += 1;
    const key = `${manifest.requestId}:${manifest.format}`;
    requestFormatCounts.set(key, (requestFormatCounts.get(key) || 0) + 1);
    const finalPath = path.resolve(root, manifest.finalPath);
    const relative = path.relative(root, finalPath);
    const fileExists =
      relative !== ".." &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative) &&
      (await fs.stat(finalPath).then((stat) => stat.isFile() && stat.size > 0).catch(() => false));
    if (!fileExists) {
      missingFinalFiles += 1;
      blockers.push({
        code: "MISSING_FINAL_FILE",
        message: `Published manifest ${manifest.artifactId} has no readable final file.`,
        artifactId: manifest.artifactId,
      });
    }
    const requiresVisualEvidence = manifest.format !== "xlsx";
    const visualEvidencePath = manifest.quality?.visualEvidencePath
      ? path.resolve(root, manifest.quality.visualEvidencePath)
      : undefined;
    const visualEvidenceRelative = visualEvidencePath
      ? path.relative(root, visualEvidencePath)
      : undefined;
    let visualEvidenceExists = !requiresVisualEvidence;
    if (
      requiresVisualEvidence &&
      visualEvidencePath &&
      visualEvidenceRelative &&
      visualEvidenceRelative !== ".." &&
      !visualEvidenceRelative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(visualEvidenceRelative)
    ) {
      visualEvidenceExists = await fs
        .stat(visualEvidencePath)
        .then((stat) => stat.isFile() && stat.size > 0)
        .catch(() => false);
    }
    const qualityScore = manifest.quality?.score;
    const qualityScoreVerified =
      typeof qualityScore?.total === "number" &&
      qualityScore.total >= qualityScore.threshold &&
      qualityScore.threshold === 85 &&
      qualityScore.hardGatePassed === true;
    const verified =
      manifest.generator === "officecli" &&
      manifest.quality?.status === "passed" &&
      manifest.quality.validationPassed === true &&
      manifest.quality.integrityPassed === true &&
      manifest.quality.issueCount === 0 &&
      (manifest.format === "xlsx" ||
        (manifest.quality.visualRequired === true &&
          manifest.quality.visualPassed === true &&
          visualEvidenceExists));
    if (!qualityScoreVerified) {
      belowQualityThreshold += 1;
      blockers.push({
        code: "QUALITY_SCORE_BELOW_THRESHOLD",
        message: `Artifact ${manifest.artifactId} has no valid 85-point quality score and hard-gate attestation.`,
        artifactId: manifest.artifactId,
      });
    }
    if (!verified || !qualityScoreVerified) {
      corruptOrUnverified += 1;
    }
    if (!verified) {
      blockers.push({
        code: "QUALITY_NOT_VERIFIED",
        message: `Artifact ${manifest.artifactId} is not backed by a clean Office quality report.`,
        artifactId: manifest.artifactId,
      });
    }
    if (
      manifest.contentCoverage?.passed === false ||
      manifest.contentConsistency?.passed === false
    ) {
      blockers.push({
        code: "CONTENT_GATE_FAILED",
        message: `Artifact ${manifest.artifactId} failed content coverage or consistency.`,
        artifactId: manifest.artifactId,
      });
    }
  }

  for (const format of formats) {
    if (publishedByFormat[format] < minimumPublishedPerFormat) {
      blockers.push({
        code: "INSUFFICIENT_ACCEPTANCE_RUNS",
        message: `${format.toUpperCase()} has ${publishedByFormat[format]}/${minimumPublishedPerFormat} required published acceptance artifacts.`,
      });
    }
    const durations = manifests
      .filter((manifest) => manifest.format === format)
      .map((manifest) => manifest.timingsMs?.total || 0)
      .filter((duration) => duration > 0);
    const budget =
      options.maximumFirstPassDurationMs?.[format] ||
      DEFAULT_DURATION_BUDGETS[format];
    if (durations.length > 0 && p95(durations) > budget) {
      blockers.push({
        code: "P95_DURATION_EXCEEDED",
        message: `${format.toUpperCase()} P95 duration ${p95(durations)}ms exceeds ${budget}ms.`,
      });
    }
  }

  const duplicateRequestFormats = Array.from(requestFormatCounts.values()).filter(
    (count) => count > 1,
  ).length;
  if (duplicateRequestFormats > 0) {
    blockers.push({
      code: "DUPLICATE_REQUEST_FORMAT",
      message: `${duplicateRequestFormats} request/format keys published more than one artifact.`,
    });
  }

  const formatsByRequest = new Map<string, Set<OfficeArtifactFormat>>();
  for (const manifest of manifests) {
    const requestFormats = formatsByRequest.get(manifest.requestId) || new Set();
    requestFormats.add(manifest.format);
    formatsByRequest.set(manifest.requestId, requestFormats);
  }
  const completeFormatSets = Array.from(formatsByRequest.values()).filter(
    (requestFormats) => formats.every((format) => requestFormats.has(format)),
  ).length;
  if (formats.length > 1 && completeFormatSets < minimumPublishedPerFormat) {
    blockers.push({
      code: "INSUFFICIENT_COMPLETE_FORMAT_SETS",
      message: `Only ${completeFormatSets}/${minimumPublishedPerFormat} requests published the complete ${formats.map((format) => format.toUpperCase()).join(" + ")} set from one request id.`,
    });
  }

  const manifestIds = new Set(manifests.map((manifest) => manifest.artifactId));
  const terminalMismatchCount = jobs.filter(
    (job) =>
      (job.status === "published" && !manifestIds.has(job.jobId)) ||
      (job.status !== "published" && manifestIds.has(job.jobId)),
  ).length;
  if (terminalMismatchCount > 0) {
    blockers.push({
      code: "TERMINAL_STATE_MISMATCH",
      message: `${terminalMismatchCount} Office jobs disagree with their committed manifests.`,
    });
  }

  const firstPassCount = manifests.filter(
    (manifest) => manifest.repairAttempts === 0,
  ).length;
  const firstPassRate = manifests.length > 0 ? firstPassCount / manifests.length : 0;
  if (manifests.length > 0 && firstPassRate < 0.7) {
    blockers.push({
      code: "FIRST_PASS_RATE_LOW",
      message: `First-pass quality rate ${(firstPassRate * 100).toFixed(1)}% is below 70%.`,
    });
  }
  const qualityTerminalJobs = jobs.filter(
    (job) => job.status === "published" || job.status === "failed",
  );
  const withinRepairPassRate =
    qualityTerminalJobs.length > 0
      ? qualityTerminalJobs.filter(
          (job) => job.status === "published" && job.repairAttempts <= 2,
        ).length / qualityTerminalJobs.length
      : manifests.length > 0
        ? 1
        : 0;
  if (qualityTerminalJobs.length > 0 && withinRepairPassRate < 0.95) {
    blockers.push({
      code: "TWO_REPAIR_PASS_RATE_LOW",
      message: `Two-repair quality pass rate ${(withinRepairPassRate * 100).toFixed(1)}% is below 95%.`,
    });
  }

  return {
    passed: blockers.length === 0,
    evaluatedAt: new Date().toISOString(),
    blockers,
    stats: {
      published: manifests.length,
      publishedByFormat,
      corruptOrUnverified,
      belowQualityThreshold,
      completeFormatSets,
      duplicateRequestFormats,
      missingFinalFiles,
      firstPassRate,
      withinRepairPassRate,
      terminalMismatchCount,
    },
  };
}
