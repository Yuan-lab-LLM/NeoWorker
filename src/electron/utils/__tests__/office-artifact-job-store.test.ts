import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  cleanupOfficeArtifactTransientData,
  createOfficeArtifactJob,
  ensureOfficeArtifactWorkspaceRecovered,
  readOfficeArtifactJob,
  recoverOfficeArtifactJobs,
  resetOfficeArtifactRecoveryForTests,
  updateOfficeArtifactJob,
} from "../office-artifact-job-store";

const tempDirectories: string[] = [];

async function makeWorkspace(): Promise<string> {
  const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), "office-jobs-"));
  tempDirectories.push(workspacePath);
  return workspacePath;
}

async function createActiveJob(workspacePath: string, jobId: string) {
  const stagingDirectory = path.join(
    workspacePath,
    ".neoworker",
    "office-staging",
    jobId,
  );
  const stagingPath = path.join(stagingDirectory, `${jobId}.pptx`);
  await fs.mkdir(stagingDirectory, { recursive: true });
  await fs.writeFile(stagingPath, "incomplete");
  return createOfficeArtifactJob(workspacePath, {
    jobId,
    requestId: "request-1",
    format: "pptx",
    requestedPath: path.join(workspacePath, "report.pptx"),
    stagingDirectory,
    stagingPath,
    phase: "staging",
    status: "active",
    retryable: false,
    repairAttempts: 0,
    templateId: "neoworker-office-pptx",
    templateVersion: "1",
    generatorVersion: "test",
    deliveryPolicyVersion: "1",
    rolloutBucket: 0,
  });
}

afterEach(async () => {
  resetOfficeArtifactRecoveryForTests();
  await Promise.all(
    tempDirectories.splice(0).map((directory) =>
      fs.rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("office artifact job recovery", () => {
  it("rolls back staged and uncommitted final files after an app restart", async () => {
    const workspacePath = await makeWorkspace();
    const record = await createActiveJob(workspacePath, "job-orphan");
    const finalPath = path.join(workspacePath, "report.pptx");
    await fs.writeFile(finalPath, "half-published");
    await updateOfficeArtifactJob(workspacePath, record.jobId, {
      phase: "ready_to_publish",
      finalPath,
    });

    const recovery = await recoverOfficeArtifactJobs(workspacePath);

    expect(recovery.rolledBack).toEqual([record.jobId]);
    await expect(fs.stat(finalPath)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(
      fs.stat(path.join(workspacePath, record.stagingDirectory)),
    ).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readOfficeArtifactJob(workspacePath, record.jobId)).toMatchObject({
      status: "failed",
      phase: "failed",
      retryable: true,
      diagnosticCode: "APP_RESTARTED",
    });
  });

  it("recovers a manifest-committed artifact even when the journal update was interrupted", async () => {
    const workspacePath = await makeWorkspace();
    const record = await createActiveJob(workspacePath, "job-committed");
    const finalPath = path.join(workspacePath, "report.pptx");
    const manifestPath = path.join(
      workspacePath,
      ".neoworker",
      "office-manifests",
      `${record.jobId}.json`,
    );
    await fs.mkdir(path.dirname(manifestPath), { recursive: true });
    await fs.writeFile(finalPath, "valid-final");
    await fs.writeFile(
      manifestPath,
      JSON.stringify({ status: "published", artifactId: record.jobId }),
    );
    await updateOfficeArtifactJob(workspacePath, record.jobId, {
      phase: "ready_to_publish",
      finalPath,
    });

    const recovery = await ensureOfficeArtifactWorkspaceRecovered(workspacePath);

    expect(recovery.recoveredPublished).toEqual([record.jobId]);
    await expect(fs.stat(finalPath)).resolves.toMatchObject({
      size: expect.any(Number),
    });
    expect(await readOfficeArtifactJob(workspacePath, record.jobId)).toMatchObject({
      status: "published",
      phase: "published",
      retryable: false,
      manifestPath: expect.stringContaining(`${record.jobId}.json`),
    });
  });

  it("writes operational metrics without file paths or document content", async () => {
    const workspacePath = await makeWorkspace();
    await createActiveJob(workspacePath, "job-metric");
    const metricText = await fs.readFile(
      path.join(
        workspacePath,
        ".neoworker",
        "office-metrics",
        "events.jsonl",
      ),
      "utf8",
    );

    expect(metricText).toContain('"jobId":"job-metric"');
    expect(metricText).not.toContain("report.pptx");
    expect(metricText).not.toContain("office-staging");
  });

  it("removes only expired private staging and quality directories", async () => {
    const workspacePath = await makeWorkspace();
    const stagingRoot = path.join(workspacePath, ".neoworker", "office-staging");
    const qualityRoot = path.join(workspacePath, ".neoworker", "office-quality");
    const expiredStaging = path.join(stagingRoot, "expired-job-1234");
    const freshStaging = path.join(stagingRoot, "fresh-job-123456");
    const expiredQuality = path.join(qualityRoot, "expired-artifact-1");
    const unsafeName = path.join(stagingRoot, "x");
    await Promise.all([
      fs.mkdir(expiredStaging, { recursive: true }),
      fs.mkdir(freshStaging, { recursive: true }),
      fs.mkdir(expiredQuality, { recursive: true }),
      fs.mkdir(unsafeName, { recursive: true }),
    ]);
    const old = new Date(Date.now() - 10_000);
    await Promise.all([
      fs.utimes(expiredStaging, old, old),
      fs.utimes(expiredQuality, old, old),
      fs.utimes(unsafeName, old, old),
    ]);

    const removed = await cleanupOfficeArtifactTransientData(workspacePath, {
      now: Date.now(),
      stagingTtlMs: 1_000,
      qualityTtlMs: 1_000,
    });

    expect(removed.sort()).toEqual([
      ".neoworker/office-quality/expired-artifact-1",
      ".neoworker/office-staging/expired-job-1234",
    ]);
    await expect(fs.stat(freshStaging)).resolves.toBeDefined();
    await expect(fs.stat(unsafeName)).resolves.toBeDefined();
  });
});
