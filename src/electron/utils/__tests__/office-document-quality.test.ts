import { describe, expect, it, vi } from "vitest";
import {
  OfficeCliRunner,
  parseOfficeCliJsonOutput,
  runOfficeDocumentQualityCheck,
} from "../office-document-quality";
import {
  getBundledOfficeCliCandidates,
  getOfficeCliBundleKey,
  getOfficeCliExecutableCandidates,
} from "../officecli-runtime";

describe("office-document-quality", () => {
  it("prefers NeoWorker's packaged OfficeCLI before system installations", () => {
    expect(getOfficeCliBundleKey("darwin", "arm64")).toBe("mac-arm64");
    expect(
      getBundledOfficeCliCandidates({
        platform: "darwin",
        arch: "arm64",
        resourcesPath: "/Applications/NeoWorker.app/Contents/Resources",
        cwd: "/repo",
      }),
    ).toEqual(
      expect.arrayContaining([
        "/Applications/NeoWorker.app/Contents/Resources/officecli/officecli",
        "/repo/build/officecli/mac-arm64/officecli",
      ]),
    );

    const candidates = getOfficeCliExecutableCandidates();
    const bundledIndex = candidates.findIndex((candidate) =>
      candidate.includes("build/officecli/mac-arm64/officecli"),
    );
    const systemIndex = candidates.indexOf("/usr/local/bin/officecli");
    if (process.platform === "darwin") {
      expect(bundledIndex).toBeGreaterThanOrEqual(0);
      expect(systemIndex).toBeGreaterThan(bundledIndex);
    }
  });

  it("parses JSON even when a command prefixes a diagnostic line", () => {
    expect(
      parseOfficeCliJsonOutput(
        'resident ready\n{"success":true,"data":{"count":0,"issues":[]}}',
      ),
    ).toEqual({
      success: true,
      data: { count: 0, issues: [] },
    });
  });

  it("validates, scans, and renders supported Office files", async () => {
    const runner: OfficeCliRunner = vi.fn(async (_executable, args) => {
      if (args[0] === "--version") {
        return { stdout: "officecli 1.0.136", stderr: "" };
      }
      if (args[0] === "validate") {
        return {
          stdout: JSON.stringify({ success: true, data: "Validation passed" }),
          stderr: "",
        };
      }
      if (args[0] === "view" && args[2] === "issues") {
        return {
          stdout: JSON.stringify({
            success: true,
            data: {
              count: 1,
              issues: [{ severity: "warning", message: "Text may overflow" }],
            },
          }),
          stderr: "",
        };
      }
      if (args[0] === "view" && args[2] === "html") {
        return {
          stdout: JSON.stringify({ success: true, data: "/tmp/report-preview.html" }),
          stderr: "",
        };
      }
      if (args[0] === "view" && args[2] === "screenshot") {
        return {
          stdout: JSON.stringify({ success: true, data: "/tmp/report-preview.png" }),
          stderr: "",
        };
      }
      throw new Error(`Unexpected args: ${args.join(" ")}`);
    });
    const onPhase = vi.fn();

    const report = await runOfficeDocumentQualityCheck("/workspace/report.docx", {
      executable: "/fake/officecli",
      runner,
      onPhase,
    });

    expect(report).toEqual(
      expect.objectContaining({
        available: true,
        engine: "officecli",
        status: "issues",
        issueCount: 1,
        previewPath: "/tmp/report-preview.html",
        visual: expect.objectContaining({
          required: true,
          passed: true,
          evidencePath: "/tmp/report-preview.png",
        }),
      }),
    );
    expect(report.validation?.passed).toBe(true);
    expect(report.modelGuidance).toContain("1 issue");
    expect(onPhase).toHaveBeenCalledWith("validating", expect.any(String));
    expect(onPhase).toHaveBeenCalledWith("rendering", expect.any(String));
  });

  it("fails the delivery gate when a Word or PowerPoint cannot render every page", async () => {
    const runner: OfficeCliRunner = vi.fn(async (_executable, args) => {
      if (args[0] === "--version") return { stdout: "officecli 1.0.136", stderr: "" };
      if (args[0] === "validate") {
        return { stdout: JSON.stringify({ success: true }), stderr: "" };
      }
      if (args[0] === "view" && args[2] === "issues") {
        return {
          stdout: JSON.stringify({ success: true, data: { count: 0, issues: [] } }),
          stderr: "",
        };
      }
      if (args[0] === "view" && args[2] === "html") {
        return { stdout: JSON.stringify({ success: true }), stderr: "" };
      }
      if (args[0] === "view" && args[2] === "screenshot") {
        throw new Error("headless renderer unavailable");
      }
      throw new Error(`Unexpected args: ${args.join(" ")}`);
    });

    const report = await runOfficeDocumentQualityCheck("/workspace/deck.pptx", {
      executable: "/fake/officecli",
      runner,
    });

    expect(report.status).toBe("failed");
    expect(report.visual).toMatchObject({ required: true, passed: false });
    expect(report.modelGuidance).toContain("Do not publish");
  });

  it("uses NeoWorker's embedded renderer when OfficeCLI has no standalone browser", async () => {
    const runner: OfficeCliRunner = vi.fn(async (_executable, args) => {
      if (args[0] === "--version") return { stdout: "officecli 1.0.136", stderr: "" };
      if (args[0] === "validate") {
        return { stdout: JSON.stringify({ success: true }), stderr: "" };
      }
      if (args[0] === "view" && args[2] === "issues") {
        return {
          stdout: JSON.stringify({ success: true, data: { count: 0, issues: [] } }),
          stderr: "",
        };
      }
      if (args[0] === "view" && args[2] === "html") {
        return {
          stdout: JSON.stringify({ success: true, data: "/tmp/deck-preview.html" }),
          stderr: "",
        };
      }
      if (args[0] === "view" && args[2] === "screenshot") {
        throw new Error("No headless browser available");
      }
      throw new Error(`Unexpected args: ${args.join(" ")}`);
    });
    const visualRenderer = vi.fn(async () => ({
      evidencePath: "/tmp/deck-preview-pages/evidence.json",
      pageCount: 9,
      imagePaths: Array.from({ length: 9 }, (_, index) => `/tmp/page-${index + 1}.png`),
      renderer: "electron-chromium" as const,
    }));

    const report = await runOfficeDocumentQualityCheck("/workspace/deck.pptx", {
      executable: "/fake/officecli",
      runner,
      visualRenderer,
    });

    expect(report.status).toBe("passed");
    expect(report.visual).toEqual(
      expect.objectContaining({
        required: true,
        passed: true,
        evidencePath: "/tmp/deck-preview-pages/evidence.json",
        message: expect.stringContaining("9 page(s)"),
      }),
    );
    expect(visualRenderer).toHaveBeenCalledWith({
      htmlPath: "/tmp/deck-preview.html",
      outputPath: expect.stringMatching(/\.png$/),
    });
  });

  it("falls back without failing generation when OfficeCLI is unavailable", async () => {
    const runner: OfficeCliRunner = vi.fn(async () => {
      throw new Error("ENOENT");
    });

    const report = await runOfficeDocumentQualityCheck("/workspace/report.xlsx", {
      executable: "/missing/officecli",
      runner,
    });

    expect(report.status).toBe("skipped");
    expect(report.available).toBe(false);
    expect(report.engine).toBe("builtin");
    expect(report.modelGuidance).toContain("unavailable");
  });

  it("skips non-Office formats", async () => {
    const runner: OfficeCliRunner = vi.fn();

    const report = await runOfficeDocumentQualityCheck("/workspace/report.pdf", { runner });

    expect(report.status).toBe("skipped");
    expect(runner).not.toHaveBeenCalled();
  });
});
