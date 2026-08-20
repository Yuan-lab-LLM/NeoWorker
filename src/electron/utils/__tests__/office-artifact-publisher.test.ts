import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import JSZip from "jszip";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  buildAndPublishOfficeArtifact,
  calculateOfficeArtifactQualityScore,
  OfficeArtifactPublishError,
} from "../office-artifact-publisher";
import type { OfficeQualityReport } from "../office-document-quality";
import { createCanonicalContentSnapshot } from "../office-content-model";

const tempDirectories: string[] = [];
const visualEvidencePath = path.join(
  os.tmpdir(),
  `office-artifact-publisher-evidence-${process.pid}.png`,
);

function passedQuality(): OfficeQualityReport {
  return {
    available: true,
    engine: "officecli",
    status: "passed",
    validation: { passed: true },
    issueCount: 0,
    issues: [],
    visual: {
      required: true,
      passed: true,
      evidencePath: visualEvidencePath,
      message: "Every page was rendered.",
    },
    warnings: [],
    durationMs: 1,
    summary: "passed",
    modelGuidance: "passed",
  };
}

beforeAll(async () => {
  const onePixelPng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  );
  await fs.writeFile(visualEvidencePath, onePixelPng);
});

afterAll(async () => {
  await fs.rm(visualEvidencePath, { force: true });
});

async function writeDocument(filePath: string, text = "Report"): Promise<void> {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", "<Types/>");
  zip.file(
    "word/document.xml",
    `<w:document><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`,
  );
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, await zip.generateAsync({ type: "nodebuffer" }));
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    tempDirectories.splice(0).map((directory) =>
      fs.rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("buildAndPublishOfficeArtifact", () => {
  it("blocks publication when frozen critical facts are not consumed", async () => {
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), "office-publish-"));
    tempDirectories.push(workspacePath);
    const requestedPath = path.join(workspacePath, "report.docx");
    const contentSnapshot = createCanonicalContentSnapshot({
      title: "Report",
      executiveSummary: [],
      sources: [],
      facts: [
        {
          id: "fact-1",
          statement: "Revenue reached 100",
          value: 100,
          unit: "USD",
          sourceIds: [],
          confidence: "high",
          critical: true,
        },
      ],
      sections: [],
      datasets: [],
      caveats: [],
    });

    await expect(
      buildAndPublishOfficeArtifact({
        workspacePath,
        requestedPath,
        contentSnapshot,
        expectation: { format: "docx" },
        build: (stagingPath) => writeDocument(stagingPath),
        inspect: async () => passedQuality(),
      }),
    ).rejects.toMatchObject<Partial<OfficeArtifactPublishError>>({
      code: "CONTENT_FAILED",
    });
    await expect(fs.stat(requestedPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("publishes only after integrity and quality gates pass", async () => {
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), "office-publish-"));
    tempDirectories.push(workspacePath);
    const requestedPath = path.join(workspacePath, "report.docx");
    const phases: string[] = [];

    const result = await buildAndPublishOfficeArtifact({
      workspacePath,
      requestedPath,
      expectation: { format: "docx", minimumTextCharacters: 1 },
      build: (stagingPath) => writeDocument(stagingPath),
      inspect: async () => passedQuality(),
      onPhase: (phase) => phases.push(phase),
    });

    expect(result.path).toBe(requestedPath);
    expect((await fs.stat(requestedPath)).size).toBeGreaterThan(0);
    expect(result.manifest).toMatchObject({
      format: "docx",
      version: 1,
      finalPath: "report.docx",
      generator: "officecli",
      status: "published",
      quality: {
        visualRequired: true,
        visualPassed: true,
        score: {
          total: 100,
          threshold: 85,
          hardGatePassed: true,
        },
        visualEvidencePath: expect.stringMatching(
          /^\.neoworker\/office-quality\/.+\/visual-evidence\.png$/,
        ),
      },
    });
    expect(result.manifest.contentHash).toMatch(/^[a-f0-9]{64}$/);
    await expect(fs.stat(result.manifestPath)).resolves.toMatchObject({
      size: expect.any(Number),
    });
    await expect(
      fs.stat(path.resolve(workspacePath, result.manifest.quality.visualEvidencePath!)),
    ).resolves.toMatchObject({ size: expect.any(Number) });
    expect(phases).toEqual([
      "staging",
      "validating",
      "ready_to_publish",
      "published",
    ]);
    expect(
      await fs.readdir(path.join(workspacePath, ".neoworker", "office-staging")),
    ).toEqual([]);
  });

  it("publishes structurally valid output with non-blocking OfficeCLI recommendations", async () => {
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), "office-publish-"));
    tempDirectories.push(workspacePath);
    const requestedPath = path.join(workspacePath, "report.docx");

    const result = await buildAndPublishOfficeArtifact({
      workspacePath,
      requestedPath,
      expectation: { format: "docx", minimumTextCharacters: 1 },
      build: (stagingPath) => writeDocument(stagingPath),
      inspect: async () => ({
        ...passedQuality(),
        status: "issues",
        issueCount: 1,
        issues: [
          {
            severity: 1,
            message: "Body paragraph missing first-line indent",
          },
        ],
      }),
    });

    expect(result.qualityCheck.status).toBe("issues");
    expect(result.manifest.quality.score.hardGatePassed).toBe(true);
    expect(result.manifest.quality.score.total).toBeGreaterThanOrEqual(85);
    await expect(fs.stat(requestedPath)).resolves.toMatchObject({
      size: expect.any(Number),
    });
  });

  it("treats mixed CJK and Latin punctuation as advisory even when OfficeCLI reports severity 2", async () => {
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), "office-publish-"));
    tempDirectories.push(workspacePath);
    const requestedPath = path.join(workspacePath, "weather-report.docx");

    const result = await buildAndPublishOfficeArtifact({
      workspacePath,
      requestedPath,
      expectation: { format: "docx", minimumTextCharacters: 1 },
      build: (stagingPath) => writeDocument(stagingPath, "PM2.5 与 Open-Meteo"),
      inspect: async () => ({
        ...passedQuality(),
        status: "issues",
        issueCount: 2,
        issues: [
          {
            id: "C2",
            severity: 2,
            message: "Mixed CJK/Latin punctuation",
          },
          {
            id: "F1",
            severity: 1,
            message: "Body paragraph missing first-line indent",
          },
        ],
      }),
    });

    expect(result.path).toBe(requestedPath);
    expect(result.qualityCheck.status).toBe("issues");
    expect(result.manifest.quality.score.hardGatePassed).toBe(true);
    await expect(fs.stat(requestedPath)).resolves.toMatchObject({
      size: expect.any(Number),
    });
  });

  it("does not reserve a snapshot id when a draft fails its quality gate", async () => {
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), "office-publish-"));
    tempDirectories.push(workspacePath);
    const snapshotPath = path.join(
      workspacePath,
      ".neoworker",
      "office-snapshots",
      "retry-snapshot.json",
    );
    const makeSnapshot = (title: string) =>
      createCanonicalContentSnapshot({
        snapshotId: "retry-snapshot",
        frozenAt: "2026-08-15T00:00:00.000Z",
        title,
        executiveSummary: [],
        sources: [],
        facts: [],
        sections: [],
        datasets: [],
        caveats: [],
      });

    await expect(
      buildAndPublishOfficeArtifact({
        workspacePath,
        requestedPath: path.join(workspacePath, "failed-report.docx"),
        contentSnapshot: makeSnapshot("Failed draft"),
        expectation: { format: "docx", minimumTextCharacters: 1 },
        build: (stagingPath) => writeDocument(stagingPath),
        inspect: async () => ({
          ...passedQuality(),
          status: "issues",
          issueCount: 1,
          issues: [{ severity: 2, message: "Blocking document issue" }],
        }),
      }),
    ).rejects.toMatchObject<Partial<OfficeArtifactPublishError>>({
      code: "QUALITY_FAILED",
    });
    await expect(fs.stat(snapshotPath)).rejects.toMatchObject({ code: "ENOENT" });

    const recovered = await buildAndPublishOfficeArtifact({
      workspacePath,
      requestedPath: path.join(workspacePath, "recovered-report.docx"),
      contentSnapshot: makeSnapshot("Corrected draft"),
      expectation: { format: "docx", minimumTextCharacters: 1 },
      build: (stagingPath) => writeDocument(stagingPath, "Corrected report"),
      inspect: async () => passedQuality(),
    });

    expect(recovered.path).toBe(path.join(workspacePath, "recovered-report.docx"));
    await expect(fs.stat(snapshotPath)).resolves.toMatchObject({
      size: expect.any(Number),
    });
  });

  it("still blocks high-severity OfficeCLI issues", async () => {
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), "office-publish-"));
    tempDirectories.push(workspacePath);
    const requestedPath = path.join(workspacePath, "report.docx");

    await expect(
      buildAndPublishOfficeArtifact({
        workspacePath,
        requestedPath,
        expectation: { format: "docx", minimumTextCharacters: 1 },
        build: (stagingPath) => writeDocument(stagingPath),
        inspect: async () => ({
          ...passedQuality(),
          status: "issues",
          issueCount: 1,
          issues: [{ severity: 2, message: "Blocking document issue" }],
        }),
      }),
    ).rejects.toMatchObject<Partial<OfficeArtifactPublishError>>({
      code: "QUALITY_FAILED",
    });
    await expect(fs.stat(requestedPath)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("supports an explicitly strict zero-issue release policy", async () => {
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), "office-publish-"));
    tempDirectories.push(workspacePath);
    const requestedPath = path.join(workspacePath, "report.docx");

    await expect(
      buildAndPublishOfficeArtifact({
        workspacePath,
        requestedPath,
        expectation: { format: "docx", minimumTextCharacters: 1 },
        rejectQualityIssues: true,
        build: (stagingPath) => writeDocument(stagingPath),
        inspect: async () => ({
          ...passedQuality(),
          status: "issues",
          issueCount: 1,
          issues: [{ severity: 1, message: "Formatting recommendation" }],
        }),
      }),
    ).rejects.toMatchObject<Partial<OfficeArtifactPublishError>>({
      code: "QUALITY_FAILED",
    });
  });

  it("calculates the PRD five-dimension quality score and preserves hard gates", () => {
    const score = calculateOfficeArtifactQualityScore({
      format: "pptx",
      qualityCheck: passedQuality(),
      integrityCheck: {
        passed: true,
        format: "pptx",
        errors: [],
        warnings: [],
        observed: {},
      },
      contentSnapshotId: "snapshot-1",
      generatorVersion: "officecli-test",
      skillVersion: "presentation-test",
      templateId: "research",
      templateVersion: "1",
    });

    expect(score).toEqual({
      total: 100,
      threshold: 85,
      hardGatePassed: true,
      dimensions: {
        structureCorrectness: 25,
        contentCompleteness: 30,
        visualQuality: 25,
        usability: 15,
        traceability: 5,
      },
    });
  });

  it("repairs and revalidates a failed staged build at most twice", async () => {
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), "office-publish-"));
    tempDirectories.push(workspacePath);
    const requestedPath = path.join(workspacePath, "report.docx");
    const phases: string[] = [];
    let builds = 0;
    const repair = vi.fn(async () => true);

    const result = await buildAndPublishOfficeArtifact({
      workspacePath,
      requestedPath,
      expectation: { format: "docx", minimumTextCharacters: 1 },
      maxRepairAttempts: 2,
      build: async (stagingPath) => {
        builds += 1;
        if (builds === 1) {
          await fs.writeFile(stagingPath, "");
          return;
        }
        await writeDocument(stagingPath, "Repaired report");
      },
      inspect: async () => passedQuality(),
      repair,
      onPhase: (phase) => phases.push(phase),
    });

    expect(builds).toBe(2);
    expect(repair).toHaveBeenCalledTimes(1);
    expect(result.manifest.repairAttempts).toBe(1);
    expect(phases).toContain("repairing");
    expect(result.path).toBe(requestedPath);
  });

  it("stops early when the same repair failure signature appears twice", async () => {
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), "office-publish-"));
    tempDirectories.push(workspacePath);
    let builds = 0;
    const repair = vi.fn(async () => true);

    await expect(
      buildAndPublishOfficeArtifact({
        workspacePath,
        requestedPath: path.join(workspacePath, "report.docx"),
        expectation: { format: "docx" },
        maxRepairAttempts: 2,
        build: async (stagingPath) => {
          builds += 1;
          await fs.writeFile(stagingPath, "");
        },
        inspect: async () => passedQuality(),
        repair,
      }),
    ).rejects.toMatchObject<Partial<OfficeArtifactPublishError>>({
      code: "EMPTY_OUTPUT",
    });
    expect(builds).toBe(2);
    expect(repair).toHaveBeenCalledTimes(1);
  });

  it("never overwrites an existing artifact", async () => {
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), "office-publish-"));
    tempDirectories.push(workspacePath);
    const requestedPath = path.join(workspacePath, "report.docx");
    await fs.writeFile(requestedPath, "original");

    const result = await buildAndPublishOfficeArtifact({
      workspacePath,
      requestedPath,
      expectation: { format: "docx" },
      build: (stagingPath) => writeDocument(stagingPath, "New report"),
      inspect: async () => passedQuality(),
    });

    expect(await fs.readFile(requestedPath, "utf8")).toBe("original");
    expect(result.path).toBe(path.join(workspacePath, "report-v2.docx"));
  });

  it("returns the published artifact when regeneration produces the same content hash", async () => {
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), "office-publish-"));
    tempDirectories.push(workspacePath);
    const requestedPath = path.join(workspacePath, "report.docx");
    const publish = () =>
      buildAndPublishOfficeArtifact({
        workspacePath,
        requestedPath,
        requestId: `request-${Math.random()}`,
        expectation: { format: "docx", minimumTextCharacters: 1 },
        build: (stagingPath) => writeDocument(stagingPath, "Same report"),
        inspect: async () => passedQuality(),
      });

    const first = await publish();
    const repeated = await publish();

    expect(repeated.deduplicated).toBe(true);
    expect(repeated.path).toBe(first.path);
    expect(repeated.manifest.artifactId).toBe(first.manifest.artifactId);
    await expect(
      fs.stat(path.join(workspacePath, "report-v2.docx")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("publishes concurrent writers to unique versions without overwriting", async () => {
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), "office-publish-"));
    tempDirectories.push(workspacePath);
    const requestedPath = path.join(workspacePath, "report.docx");

    const publish = (text: string) =>
      buildAndPublishOfficeArtifact({
        workspacePath,
        requestedPath,
        expectation: { format: "docx", minimumTextCharacters: 1 },
        build: (stagingPath) => writeDocument(stagingPath, text),
        inspect: async () => passedQuality(),
      });

    const results = await Promise.all([
      publish("First concurrent report"),
      publish("Second concurrent report"),
    ]);
    const publishedPaths = results.map((result) => result.path).sort();

    expect(publishedPaths).toEqual(
      [requestedPath, path.join(workspacePath, "report-v2.docx")].sort(),
    );
    expect(results.map((result) => result.manifest.version).sort()).toEqual([1, 2]);
    await expect(fs.stat(requestedPath)).resolves.toMatchObject({ size: expect.any(Number) });
    await expect(
      fs.stat(path.join(workspacePath, "report-v2.docx")),
    ).resolves.toMatchObject({ size: expect.any(Number) });
  });

  it("removes failed output and leaves no visible artifact", async () => {
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), "office-publish-"));
    tempDirectories.push(workspacePath);
    const requestedPath = path.join(workspacePath, "report.docx");

    await expect(
      buildAndPublishOfficeArtifact({
        workspacePath,
        requestedPath,
        expectation: { format: "docx" },
        build: (stagingPath) => writeDocument(stagingPath),
        inspect: async () => ({
          ...passedQuality(),
          status: "failed",
          validation: { passed: false },
          summary: "invalid package",
        }),
      }),
    ).rejects.toMatchObject<Partial<OfficeArtifactPublishError>>({
      code: "QUALITY_FAILED",
    });

    await expect(fs.stat(requestedPath)).rejects.toMatchObject({ code: "ENOENT" });
    expect(
      await fs.readdir(path.join(workspacePath, ".neoworker", "office-staging")),
    ).toEqual([]);
  });

  it("blocks Word and PowerPoint publication when full-document visual evidence is missing", async () => {
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), "office-publish-"));
    tempDirectories.push(workspacePath);
    const requestedPath = path.join(workspacePath, "report.docx");

    await expect(
      buildAndPublishOfficeArtifact({
        workspacePath,
        requestedPath,
        expectation: { format: "docx", minimumTextCharacters: 1 },
        build: (stagingPath) => writeDocument(stagingPath),
        inspect: async () => {
          const report = passedQuality();
          delete report.visual;
          return report;
        },
      }),
    ).rejects.toMatchObject<Partial<OfficeArtifactPublishError>>({
      code: "QUALITY_FAILED",
    });

    await expect(fs.stat(requestedPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rolls back the final file when the manifest transaction fails", async () => {
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), "office-publish-"));
    tempDirectories.push(workspacePath);
    const requestedPath = path.join(workspacePath, "report.docx");
    const internalRoot = path.join(workspacePath, ".neoworker");
    await fs.mkdir(internalRoot, { recursive: true });
    await fs.writeFile(path.join(internalRoot, "office-manifests"), "blocked");

    await expect(
      buildAndPublishOfficeArtifact({
        workspacePath,
        requestedPath,
        expectation: { format: "docx", minimumTextCharacters: 1 },
        build: (stagingPath) => writeDocument(stagingPath),
        inspect: async () => passedQuality(),
      }),
    ).rejects.toMatchObject<Partial<OfficeArtifactPublishError>>({
      code: "PUBLISH_FAILED",
    });

    await expect(fs.stat(requestedPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("cancels generation, removes staging data, and never publishes a file", async () => {
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), "office-publish-"));
    tempDirectories.push(workspacePath);
    const requestedPath = path.join(workspacePath, "cancelled.docx");
    const controller = new AbortController();
    const phases: string[] = [];

    await expect(
      buildAndPublishOfficeArtifact({
        workspacePath,
        requestedPath,
        signal: controller.signal,
        expectation: { format: "docx", minimumTextCharacters: 1 },
        build: async (stagingPath) => {
          await writeDocument(stagingPath, "This file must remain invisible");
          controller.abort();
        },
        inspect: async () => passedQuality(),
        onPhase: (phase) => phases.push(phase),
      }),
    ).rejects.toMatchObject<Partial<OfficeArtifactPublishError>>({
      code: "CANCELLED",
    });

    expect(phases).toEqual(["staging", "cancelled"]);
    await expect(fs.stat(requestedPath)).rejects.toMatchObject({ code: "ENOENT" });
    expect(
      await fs.readdir(path.join(workspacePath, ".neoworker", "office-staging")),
    ).toEqual([]);
    const jobFiles = await fs.readdir(
      path.join(workspacePath, ".neoworker", "office-jobs"),
    );
    const job = JSON.parse(
      await fs.readFile(
        path.join(workspacePath, ".neoworker", "office-jobs", jobFiles[0]),
        "utf8",
      ),
    ) as { status: string; phase: string; retryable: boolean; diagnosticCode?: string };
    expect(job).toMatchObject({
      status: "cancelled",
      phase: "cancelled",
      retryable: false,
      diagnosticCode: "CANCELLED",
    });
  });
});
