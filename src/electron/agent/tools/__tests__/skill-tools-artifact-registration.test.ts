import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Workspace } from "../../../../shared/types";

const mocks = vi.hoisted(() => ({
  createPresentation: vi.fn(),
  qualityCheck: vi.fn(),
}));

vi.mock("../../skills/spreadsheet", () => ({
  SpreadsheetBuilder: class {
    async create(): Promise<void> {}
  },
}));

vi.mock("../../skills/document", () => ({
  DocumentBuilder: class {
    async create(): Promise<void> {}
  },
}));

vi.mock("../../skills/presentation", () => ({
  PresentationBuilder: class {
    create = mocks.createPresentation;
  },
}));

vi.mock("../../skills/organizer", () => ({
  FolderOrganizer: class {
    async organize(): Promise<number> {
      return 0;
    }
  },
}));

vi.mock("../../../utils/office-document-quality", () => ({
  runOfficeDocumentQualityCheck: mocks.qualityCheck,
}));

import {
  buildPublishedOfficeArtifactReminder,
  shouldRetryOfficeArtifactBuild,
  SkillTools,
} from "../skill-tools";

describe("Office artifact retry policy", () => {
  it("never repeats integrity or quality failures without a source mutation", () => {
    expect(shouldRetryOfficeArtifactBuild("INTEGRITY_FAILED")).toBe(false);
    expect(shouldRetryOfficeArtifactBuild("QUALITY_FAILED")).toBe(false);
  });

  it("allows one caller-bounded retry for transient build failures", () => {
    expect(shouldRetryOfficeArtifactBuild("BUILD_FAILED")).toBe(true);
    expect(shouldRetryOfficeArtifactBuild("EMPTY_OUTPUT")).toBe(true);
  });

  it("does not instruct the model to regenerate a published artifact for advisory issues", () => {
    const reminder = buildPublishedOfficeArtifactReminder(
      {
        available: true,
        engine: "officecli",
        status: "issues",
        validation: { passed: true },
        issueCount: 9,
        issues: [{ severity: 1, message: "Formatting recommendation" }],
        warnings: [],
        durationMs: 1,
        summary: "advisory issues",
        modelGuidance: "repair",
      },
      {
        status: "published",
        quality: { score: { hardGatePassed: true } },
      },
    );

    expect(reminder).toContain("advisory recommendations");
    expect(reminder).toContain("do not regenerate unchanged content");
  });
});

describe("SkillTools artifact registration", () => {
  let tempDir = "";

  afterEach(async () => {
    vi.clearAllMocks();
    if (tempDir) await fs.rm(tempDir, { recursive: true, force: true });
    tempDir = "";
  });

  it("preserves managed subdirectories and registers a generated presentation", async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "neoworker-skill-tools-"));
    const visualEvidencePath = path.join(tempDir, "quality-evidence.png");
    await fs.writeFile(
      visualEvidencePath,
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAE/wJ/l2BNWAAAAABJRU5ErkJggg==",
        "base64",
      ),
    );
    mocks.createPresentation.mockImplementation(async (outputPath: string) => {
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      await fs.writeFile(outputPath, "pptx-bytes");
    });
    mocks.qualityCheck.mockResolvedValue({
      available: true,
      status: "passed",
      issueCount: 0,
      issues: [],
      warnings: [],
      durationMs: 1,
      summary: "validated",
      validation: { passed: true, message: "Validation passed" },
      engine: "officecli",
      modelGuidance: "verified",
      visual: {
        required: true,
        passed: true,
        renderer: "officecli",
        evidencePath: visualEvidencePath,
        summary: "Visual evidence captured",
      },
    });

    const workspace = {
      id: "workspace-1",
      name: "Workspace",
      path: tempDir,
      permissions: { read: true, write: true, shell: true },
    } as Workspace;
    const daemon = {
      logEvent: vi.fn(),
      registerArtifact: vi.fn(),
    };
    const tools = new SkillTools(workspace, daemon as never, "task-1");

    const result = await tools.createPresentation({
      filename: ".neoworker/report.pptx",
      slides: [{ title: "Title", content: ["Body"] }],
    });

    const absoluteOutputPath = path.join(tempDir, ".neoworker", "report.pptx");
    expect(result.path).toBe(".neoworker/report.pptx");
    expect(daemon.registerArtifact).toHaveBeenCalledWith(
      "task-1",
      absoluteOutputPath,
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    );
    expect(daemon.logEvent).toHaveBeenCalledWith(
      "task-1",
      "artifact_created",
      expect.objectContaining({
        path: ".neoworker/report.pptx",
        type: "presentation",
      }),
    );
  });
});
