import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { evaluateOfficeArtifactReleaseGate } from "../office-artifact-release-gate";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      fs.rm(directory, { recursive: true, force: true }),
    ),
  );
});

async function createManifest(
  workspacePath: string,
  format: "docx" | "pptx" | "xlsx",
  qualityStatus: "passed" | "failed" = "passed",
  includeVisualEvidence = true,
  requestId = "acceptance-run-1",
): Promise<void> {
  const artifactId = `artifact-${format}`;
  const finalPath = `report.${format}`;
  await fs.writeFile(path.join(workspacePath, finalPath), "published");
  const manifestDirectory = path.join(workspacePath, ".neoworker", "office-manifests");
  await fs.mkdir(manifestDirectory, { recursive: true });
  const visualEvidencePath = `.neoworker/office-quality/${artifactId}/visual-evidence.png`;
  if (format !== "xlsx" && includeVisualEvidence) {
    const absoluteEvidencePath = path.join(workspacePath, visualEvidencePath);
    await fs.mkdir(path.dirname(absoluteEvidencePath), { recursive: true });
    await fs.writeFile(absoluteEvidencePath, "visual-evidence");
  }
  await fs.writeFile(
    path.join(manifestDirectory, `${artifactId}.json`),
    JSON.stringify({
      artifactId,
      requestId,
      format,
      version: 1,
      finalPath,
      contentHash: `${format}-hash`,
      contentSnapshotId: "snapshot-1",
      generator: "officecli",
      generatorVersion: "test",
      skillVersion: "test",
      templateId: `template-${format}`,
      templateVersion: "1",
      deliveryPolicy: { enabled: true },
      fontPlan: {},
      quality: {
        status: qualityStatus,
        validationPassed: qualityStatus === "passed",
        issueCount: 0,
        integrityPassed: qualityStatus === "passed",
        visualRequired: format !== "xlsx",
        visualPassed: qualityStatus === "passed",
        visualEvidencePath: format !== "xlsx" ? visualEvidencePath : undefined,
        score: {
          total: qualityStatus === "passed" ? 100 : 0,
          threshold: 85,
          hardGatePassed: qualityStatus === "passed",
          dimensions: {
            structureCorrectness: qualityStatus === "passed" ? 25 : 0,
            contentCompleteness: qualityStatus === "passed" ? 30 : 0,
            visualQuality: qualityStatus === "passed" ? 25 : 0,
            usability: qualityStatus === "passed" ? 15 : 0,
            traceability: qualityStatus === "passed" ? 5 : 0,
          },
        },
      },
      timingsMs: { total: 10 },
      status: "published",
      repairAttempts: 0,
      createdAt: new Date().toISOString(),
      publishedAt: new Date().toISOString(),
    }),
  );
}

describe("Office artifact release gate", () => {
  it("passes a verified one-run acceptance fixture", async () => {
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), "office-gate-"));
    temporaryDirectories.push(workspacePath);
    await Promise.all([
      createManifest(workspacePath, "docx"),
      createManifest(workspacePath, "pptx"),
      createManifest(workspacePath, "xlsx"),
    ]);

    const report = await evaluateOfficeArtifactReleaseGate(workspacePath, {
      minimumPublishedPerFormat: 1,
    });

    expect(report.passed).toBe(true);
    expect(report.stats.published).toBe(3);
  });

  it("blocks rollout when a published artifact is unverified", async () => {
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), "office-gate-"));
    temporaryDirectories.push(workspacePath);
    await createManifest(workspacePath, "pptx", "failed");

    const report = await evaluateOfficeArtifactReleaseGate(workspacePath, {
      formats: ["pptx"],
      minimumPublishedPerFormat: 1,
    });

    expect(report.passed).toBe(false);
    expect(report.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "QUALITY_NOT_VERIFIED" }),
      ]),
    );
  });

  it("blocks rollout when a Word or PowerPoint manifest points to missing visual evidence", async () => {
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), "office-gate-"));
    temporaryDirectories.push(workspacePath);
    await createManifest(workspacePath, "pptx", "passed", false);

    const report = await evaluateOfficeArtifactReleaseGate(workspacePath, {
      formats: ["pptx"],
      minimumPublishedPerFormat: 1,
    });

    expect(report.passed).toBe(false);
    expect(report.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "QUALITY_NOT_VERIFIED" }),
      ]),
    );
  });

  it("blocks rollout when a manifest has no auditable 85-point quality score", async () => {
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), "office-gate-"));
    temporaryDirectories.push(workspacePath);
    await createManifest(workspacePath, "xlsx");
    const manifestPath = path.join(
      workspacePath,
      ".neoworker",
      "office-manifests",
      "artifact-xlsx.json",
    );
    const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
    delete manifest.quality.score;
    await fs.writeFile(manifestPath, JSON.stringify(manifest));

    const report = await evaluateOfficeArtifactReleaseGate(workspacePath, {
      formats: ["xlsx"],
      minimumPublishedPerFormat: 1,
    });

    expect(report.passed).toBe(false);
    expect(report.stats.belowQualityThreshold).toBe(1);
    expect(report.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "QUALITY_SCORE_BELOW_THRESHOLD" }),
      ]),
    );
  });

  it("requires multi-format acceptance artifacts to come from the same request", async () => {
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), "office-gate-"));
    temporaryDirectories.push(workspacePath);
    await Promise.all([
      createManifest(workspacePath, "docx", "passed", true, "request-docx"),
      createManifest(workspacePath, "pptx", "passed", true, "request-pptx"),
      createManifest(workspacePath, "xlsx", "passed", true, "request-xlsx"),
    ]);

    const report = await evaluateOfficeArtifactReleaseGate(workspacePath, {
      minimumPublishedPerFormat: 1,
    });

    expect(report.passed).toBe(false);
    expect(report.stats.completeFormatSets).toBe(0);
    expect(report.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "INSUFFICIENT_COMPLETE_FORMAT_SETS" }),
      ]),
    );
  });

  it("blocks rollout when fewer than 95 percent of terminal jobs publish within two repairs", async () => {
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), "office-gate-"));
    temporaryDirectories.push(workspacePath);
    await createManifest(workspacePath, "xlsx");
    const jobsDirectory = path.join(workspacePath, ".neoworker", "office-jobs");
    await fs.mkdir(jobsDirectory, { recursive: true });
    await fs.writeFile(
      path.join(jobsDirectory, "failed-job.json"),
      JSON.stringify({
        schemaVersion: "1",
        jobId: "failed-job",
        requestId: "failed-request",
        format: "xlsx",
        requestedPath: "failed.xlsx",
        stagingDirectory: ".neoworker/office-staging/failed-job",
        stagingPath: ".neoworker/office-staging/failed-job/failed-job.xlsx",
        phase: "failed",
        status: "failed",
        retryable: true,
        repairAttempts: 2,
        templateId: "template-xlsx",
        templateVersion: "1",
        generatorVersion: "test",
        deliveryPolicyVersion: "test",
        rolloutBucket: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
    );

    const report = await evaluateOfficeArtifactReleaseGate(workspacePath, {
      formats: ["xlsx"],
      minimumPublishedPerFormat: 1,
    });

    expect(report.passed).toBe(false);
    expect(report.stats.withinRepairPassRate).toBe(0);
    expect(report.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "TWO_REPAIR_PASS_RATE_LOW" }),
      ]),
    );
  });
});
