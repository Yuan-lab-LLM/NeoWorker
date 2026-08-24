import fs from "fs";
import os from "os";
import path from "path";
import { randomUUID } from "crypto";
import { describe, expect, it, vi } from "vitest";
import JSZip from "jszip";
import { DocumentTools } from "../document-tools";
import { compileLatex } from "../../../utils/document-generators/latex-compiler";
import { generatePDF } from "../../../utils/document-generators/pdf-generator";
import { runOfficeDocumentQualityCheck } from "../../../utils/office-document-quality";
import type { OfficeCliArtifactBuilder } from "../../skills/officecli-artifact-builder";

// Mock the generator modules since they depend on external packages
vi.mock("../../../utils/document-generators/pdf-generator", () => ({
  generatePDF: vi.fn().mockResolvedValue({
    success: true,
    path: "/workspace/report.pdf",
    size: 12345,
  }),
}));
vi.mock("../../../utils/document-generators/epub-generator", () => ({
  generateEPUB: vi.fn().mockResolvedValue({
    success: true,
    path: "/workspace/novel.epub",
    size: 22222,
    chapterCount: 3,
  }),
}));
vi.mock("../../../utils/document-generators/html-page-generator", () => ({
  generateLandingPage: vi.fn().mockResolvedValue({
    success: true,
    path: "/workspace/index.html",
    size: 11111,
  }),
}));
vi.mock("../../../utils/document-generators/latex-compiler", () => ({
  compileLatex: vi.fn().mockResolvedValue({
    success: true,
    sourcePath: "/workspace/paper.tex",
    pdfPath: "/workspace/paper.pdf",
    path: "/workspace/paper.pdf",
    logPath: "/workspace/paper.log",
    engine: "tectonic",
    size: 33333,
    diagnostic: "ok",
  }),
}));
vi.mock("../../../utils/office-document-quality", () => ({
  runOfficeDocumentQualityCheck: vi.fn().mockResolvedValue({
    available: true,
    engine: "officecli",
    status: "passed",
    version: "officecli 1.0.136",
    validation: { passed: true, message: "Validation passed" },
    issueCount: 0,
    issues: [],
    previewPath: "/tmp/preview.html",
    warnings: [],
    durationMs: 10,
    summary: "Office 文件已通过结构检查，并完成可视化预览。",
    modelGuidance: "Office quality checks passed.",
  }),
}));
vi.mock("../../../voice", () => ({
  getVoiceService: vi.fn(() => ({
    speak: vi.fn().mockResolvedValue(Buffer.from("audio")),
  })),
}));

function escapeXml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function writeMinimalPresentation(
  outputPath: string,
  slides: Array<{ title?: string; content?: string[]; imagePath?: string }>,
): Promise<void> {
  const archive = new JSZip();
  archive.file("[Content_Types].xml", "<Types />");
  archive.file("ppt/presentation.xml", "<p:presentation />");
  slides.forEach((slide, index) => {
    const content = (slide.content || []).join(" ");
    const visual = slide.imagePath ? "<p:pic />" : "";
    archive.file(
      `ppt/slides/slide${index + 1}.xml`,
      `<p:sld><p:sp><a:t>${escapeXml(slide.title || `Slide ${index + 1}`)}</a:t>${content ? `<a:t>${escapeXml(content)}</a:t>` : ""}</p:sp>${visual}</p:sld>`,
    );
  });
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, await archive.generateAsync({ type: "nodebuffer" }));
}

function createPresentationBuilderDouble(): {
  builder: OfficeCliArtifactBuilder;
  createPresentation: ReturnType<typeof vi.fn>;
} {
  const createPresentation = vi.fn(
    async (outputPath: string, slides: Array<{ title?: string }>) => {
      await writeMinimalPresentation(outputPath, slides);
    },
  );
  return {
    builder: { createPresentation } as unknown as OfficeCliArtifactBuilder,
    createPresentation,
  };
}

describe("DocumentTools", () => {
  // ── Tool definitions ──────────────────────────────────────────

  it("getToolDefinitions returns all tool definitions", () => {
    const defs = DocumentTools.getToolDefinitions();

    expect(defs).toHaveLength(8);
    const names = defs.map((d) => d.name);
    expect(names).toContain("compile_latex");
    expect(names).toContain("generate_document");
    expect(names).toContain("generate_presentation");
    expect(names).toContain("generate_spreadsheet");
    expect(names).toContain("generate_epub");
    expect(names).toContain("generate_landing_page");
    expect(names).toContain("convert_markdown_to_html");
    expect(names).toContain("generate_narration_audio");
  });

  it("tool definitions have required input_schema", () => {
    const defs = DocumentTools.getToolDefinitions();

    for (const def of defs) {
      expect(def.input_schema).toBeDefined();
      expect(def.input_schema.type).toBe("object");
      expect(def.input_schema.required).toBeDefined();
      expect(def.input_schema.required!.length).toBeGreaterThan(0);
    }
  });

  // ── setWorkspace ──────────────────────────────────────────────

  it("setWorkspace updates the internal workspace path", async () => {
    const tools = new DocumentTools("/original/path", "task-1");

    tools.setWorkspace({ path: "/new/path" });

    // Verify by generating a document — the path should use the new workspace
    const result = await tools.generateDocument({ filename: "test.pdf" });
    expect(result.success).toBe(true);
  });

  // ── generateDocument ──────────────────────────────────────────

  it("generateDocument calls PDF generator and returns result", async () => {
    const registerArtifact = vi.fn();
    const tools = new DocumentTools("/workspace", "task-1", registerArtifact);

    const result = await tools.generateDocument({
      filename: "report.pdf",
      title: "Quarterly Report",
      markdown: "# Report\nContent here",
    });

    expect(result.success).toBe(true);
    expect(result.message).toContain("report.pdf");
    expect(registerArtifact).toHaveBeenCalledWith(
      "task-1",
      "/workspace/report.pdf",
      "application/pdf",
    );
  });

  it("generateDocument sanitizes filenames", async () => {
    const tools = new DocumentTools("/workspace", "task-1");

    const result = await tools.generateDocument({
      filename: "../../../etc/evil.pdf",
    });

    // sanitizeFilename should strip path traversal via path.basename
    expect(result.success).toBe(true);
  });

  it("generateDocument preserves Chinese filenames", async () => {
    const tools = new DocumentTools("/workspace", "task-1");

    await tools.generateDocument({
      filename: "商务部沟通材料_分析报告.pdf",
      markdown: "# 分析报告",
    });

    expect(generatePDF).toHaveBeenLastCalledWith(
      path.join("/workspace", "商务部沟通材料_分析报告.pdf"),
      expect.objectContaining({ markdown: "# 分析报告" }),
    );
  });

  it("compileLatex calls the compiler and registers the PDF artifact with source metadata", async () => {
    const registerArtifact = vi.fn();
    const tools = new DocumentTools("/workspace", "task-1", registerArtifact);

    const result = await tools.compileLatex({
      sourcePath: "paper.tex",
      outputPath: "paper.pdf",
      engine: "auto",
    });

    expect(result.success).toBe(true);
    expect(result.path).toBe("/workspace/paper.pdf");
    expect(compileLatex).toHaveBeenCalledWith({
      workspacePath: "/workspace",
      sourcePath: "paper.tex",
      outputPath: "paper.pdf",
      engine: "auto",
    });
    expect(registerArtifact).toHaveBeenCalledWith(
      "task-1",
      "/workspace/paper.pdf",
      "application/pdf",
      expect.objectContaining({
        sourcePath: "/workspace/paper.tex",
        logPath: "/workspace/paper.log",
        engine: "tectonic",
        type: "latex_pdf",
      }),
    );
  });

  it("compileLatex does not register an artifact when compilation fails", async () => {
    vi.mocked(compileLatex).mockResolvedValueOnce({
      success: false,
      sourcePath: "/workspace/paper.tex",
      pdfPath: "/workspace/paper.pdf",
      path: "/workspace/paper.pdf",
      logPath: "/workspace/paper.log",
      error: "No LaTeX engine found",
      diagnostic: "No LaTeX engine found",
    } as Any);
    const registerArtifact = vi.fn();
    const tools = new DocumentTools("/workspace", "task-1", registerArtifact);

    const result = await tools.compileLatex({ sourcePath: "paper.tex" });

    expect(result.success).toBe(false);
    expect(result.message).toContain("No LaTeX engine");
    expect(registerArtifact).not.toHaveBeenCalled();
  });

  // ── generatePresentation ──────────────────────────────────────

  it("generatePresentation uses the unified OfficeCLI route and registers one deck", async () => {
    const workspace = path.join(
      os.tmpdir(),
      `neoworker-ppt-route-${randomUUID()}`,
    );
    fs.mkdirSync(workspace, { recursive: true });
    const registerArtifact = vi.fn();
    const builderDouble = createPresentationBuilderDouble();
    const tools = new DocumentTools(
      workspace,
      "task-1",
      registerArtifact,
      undefined,
      async () => builderDouble.builder,
    );

    const result = await tools.generatePresentation({
      filename: "deck.pptx",
      slides: [
        { title: "Intro", layout: "title" },
        { title: "Data", bullets: ["Point 1", "Point 2"] },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.slideCount).toBe(2);
    expect(result.generationEngine).toBe("officecli");
    expect(builderDouble.createPresentation).toHaveBeenCalledTimes(1);
    expect(registerArtifact).toHaveBeenCalledTimes(1);
    expect(fs.existsSync(path.join(workspace, "deck.pptx"))).toBe(true);
    fs.rmSync(workspace, { recursive: true, force: true });
  });

  it("generatePresentation exposes richer design fields and passes them through", async () => {
    const defs = DocumentTools.getToolDefinitions();
    const presentationDef = defs.find(
      (def) => def.name === "generate_presentation",
    );
    expect(presentationDef?.input_schema.properties).toEqual(
      expect.objectContaining({
        audience: expect.any(Object),
        visualMode: expect.any(Object),
        styleBrief: expect.any(Object),
        titleColor: expect.any(Object),
        brand: expect.any(Object),
        template: expect.any(Object),
        assets: expect.any(Object),
      }),
    );

    const workspace = path.join(
      os.tmpdir(),
      `neoworker-ppt-design-${randomUUID()}`,
    );
    fs.mkdirSync(workspace, { recursive: true });
    const builderDouble = createPresentationBuilderDouble();
    const tools = new DocumentTools(
      workspace,
      "task-1",
      undefined,
      undefined,
      async () => builderDouble.builder,
    );
    await tools.generatePresentation({
      filename: "designed-deck.pptx",
      title: "Designed Deck",
      audience: "executive buyers",
      tone: "premium",
      visualMode: "premium",
      styleBrief:
        "Use a restrained editorial rhythm with varied slide structures.",
      brand: { name: "Acme", primaryColor: "#111111", accentColor: "#14B8A6" },
      template: { id: "presenton-like", description: "Reusable design system" },
      assets: [{ id: "hero", path: path.join(workspace, "hero.png"), alt: "Hero image" }],
      slides: [
        { title: "A sharper opener", slideType: "cover" },
        {
          title: "The data has a shape",
          slideType: "chart",
          data: {
            categories: ["A", "B"],
            series: [{ name: "Growth", values: [2, 5] }],
          },
        },
        {
          title: "The table stays editable",
          slideType: "table",
          data: {
            headers: ["Item", "Status"],
            rows: [["Narrative", "Clear"]],
          },
        },
        {
          title: "Show the product",
          slideType: "product",
          image: { id: "hero" },
        },
      ],
    });

    expect(builderDouble.createPresentation).toHaveBeenLastCalledWith(
      expect.stringMatching(/\.neoworker[\\/]office-staging[\\/].+\.pptx$/),
      expect.arrayContaining([
        expect.objectContaining({ slideType: "chart" }),
        expect.objectContaining({ slideType: "table" }),
        expect.objectContaining({
          slideType: "product",
          imagePath: path.join(workspace, "hero.png"),
        }),
      ]),
      expect.objectContaining({
        audience: "executive buyers",
        visualMode: "premium",
        styleBrief: expect.stringContaining("editorial rhythm"),
        themeColor: "#111111",
        accentColor: "#14B8A6",
      }),
    );
    fs.rmSync(workspace, { recursive: true, force: true });
  });

  it("generatePresentation appends the PPTX extension when the requested name omits it", async () => {
    const workspace = path.join(
      os.tmpdir(),
      `neoworker-ppt-extension-${randomUUID()}`,
    );
    fs.mkdirSync(workspace, { recursive: true });
    const builderDouble = createPresentationBuilderDouble();
    const tools = new DocumentTools(
      workspace,
      "task-1",
      undefined,
      undefined,
      async () => builderDouble.builder,
    );
    const result = await tools.generatePresentation({
      filename: "quarterly-review",
      slides: [{ title: "Overview", layout: "title" }],
    });

    expect(result.path).toBe(path.join(workspace, "quarterly-review.pptx"));
    expect(fs.existsSync(result.path)).toBe(true);
    fs.rmSync(workspace, { recursive: true, force: true });
  });

  it("generatePresentation preserves an existing deck and increments the filename", async () => {
    const workspace = path.join(
      os.tmpdir(),
      `neoworker-ppt-version-${randomUUID()}`,
    );
    fs.mkdirSync(workspace, { recursive: true });
    fs.writeFileSync(path.join(workspace, "deck.pptx"), "existing deck");
    const builderDouble = createPresentationBuilderDouble();
    const tools = new DocumentTools(
      workspace,
      "task-1",
      undefined,
      undefined,
      async () => builderDouble.builder,
    );

    const result = await tools.generatePresentation({
      filename: "deck.pptx",
      slides: [{ title: "New deck", layout: "title" }],
    });

    expect(result.path).toBe(path.join(workspace, "deck-v2.pptx"));
    expect(fs.existsSync(result.path)).toBe(true);
    expect(fs.readFileSync(path.join(workspace, "deck.pptx"), "utf8")).toBe(
      "existing deck",
    );
    fs.rmSync(workspace, { recursive: true, force: true });
  });

  // ── generateSpreadsheet ───────────────────────────────────────

  it("generateSpreadsheet creates and registers a validated OfficeCLI workbook", async () => {
    const workspace = path.join(
      os.tmpdir(),
      `neoworker-officecli-alias-${randomUUID()}`,
    );
    fs.mkdirSync(workspace, { recursive: true });
    const registerArtifact = vi.fn();
    const tools = new DocumentTools(workspace, "task-1", registerArtifact);

    const result = await tools.generateSpreadsheet({
      filename: "data.xlsx",
      sheets: [
        {
          name: "Sales",
          headers: ["Product", "Revenue"],
          rows: [
            ["Widget", 1000],
            ["Gadget", 2000],
          ],
        },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.sheetCount).toBe(1);
    expect(result.generationEngine).toBe("officecli");
    expect(result.message).toContain("data.xlsx");
    expect(registerArtifact).toHaveBeenCalledWith(
      "task-1",
      path.join(workspace, "data.xlsx"),
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      expect.objectContaining({
        generationEngine: "officecli",
        qualityStatus: "passed",
      }),
    );
    expect(fs.existsSync(path.join(workspace, "data.xlsx"))).toBe(true);
    fs.rmSync(workspace, { recursive: true, force: true });
  });

  it("does not register and removes an OfficeCLI workbook that fails validation", async () => {
    vi.mocked(runOfficeDocumentQualityCheck).mockResolvedValueOnce({
      available: true,
      engine: "officecli",
      status: "failed",
      validation: { passed: false, message: "Schema validation failed" },
      issueCount: 0,
      issues: [],
      warnings: [],
      durationMs: 10,
      summary: "Structural validation failed.",
      modelGuidance: "Do not deliver this workbook.",
    });
    const workspace = path.join(
      os.tmpdir(),
      `neoworker-officecli-invalid-${randomUUID()}`,
    );
    fs.mkdirSync(workspace, { recursive: true });
    const registerArtifact = vi.fn();
    const tools = new DocumentTools(workspace, "task-1", registerArtifact);

    const result = await tools.generateSpreadsheet({
      filename: "invalid.xlsx",
      sheets: [{ name: "Data", headers: ["Name"], rows: [["Moonshot"]] }],
    });

    expect(result.success).toBe(false);
    expect(result.generationEngine).toBe("officecli");
    expect(registerArtifact).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(workspace, "invalid.xlsx"))).toBe(false);
    fs.rmSync(workspace, { recursive: true, force: true });
  });

  // ── generateEPUB ──────────────────────────────────────────────

  it("generateEPUB calls EPUB generator", async () => {
    const registerArtifact = vi.fn();
    const tools = new DocumentTools("/workspace", "task-1", registerArtifact);

    const result = await tools.generateEPUB({
      filename: "novel.epub",
      title: "Novel",
      chapters: [
        { title: "Chapter 1", content: "Hello world" },
        { title: "Chapter 2", content: "Next chapter" },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.chapterCount).toBe(3);
    expect(result.message).toContain("novel.epub");
    expect(registerArtifact).toHaveBeenCalledWith(
      "task-1",
      "/workspace/novel.epub",
      "application/epub+zip",
    );
  });

  // ── generateLandingPage ───────────────────────────────────────

  it("generateLandingPage calls landing page generator", async () => {
    const registerArtifact = vi.fn();
    const tools = new DocumentTools("/workspace", "task-1", registerArtifact);

    const result = await tools.generateLandingPage({
      filename: "index.html",
      title: "Novel Landing Page",
      subtitle: "A story project",
      description: "A polished page for the novel.",
    });

    expect(result.success).toBe(true);
    expect(result.message).toContain("index.html");
    expect(registerArtifact).toHaveBeenCalledWith(
      "task-1",
      "/workspace/index.html",
      "text/html",
    );
  });

  it("convertMarkdownToHtml produces a versioned UTF-8 HTML artifact from Markdown", async () => {
    const workspace = path.join(
      os.tmpdir(),
      `neoworker-html-tools-${randomUUID()}`,
    );
    fs.mkdirSync(workspace, { recursive: true });
    fs.writeFileSync(
      path.join(workspace, "report.md"),
      "# 中文研究报告\n\n| 指标 | 数值 |\n| --- | ---: |\n| 收入 | 100 |",
      "utf8",
    );
    fs.writeFileSync(path.join(workspace, "report.html"), "old", "utf8");
    const registerArtifact = vi.fn();
    const tools = new DocumentTools(workspace, "task-1", registerArtifact);

    try {
      const result = await tools.convertMarkdownToHtml({
        sourcePaths: ["report.md"],
        filename: "report.html",
      });

      expect(result.success).toBe(true);
      expect(result.path).not.toBe(path.join(workspace, "report.html"));
      expect(path.basename(result.path)).toMatch(/^report-v\d+\.html$/);
      const html = fs.readFileSync(result.path, "utf8");
      expect(html).toContain('<meta charset="utf-8">');
      expect(html).toContain("中文研究报告");
      expect(html).toContain("<table>");
      expect(registerArtifact).toHaveBeenCalledWith(
        "task-1",
        result.path,
        "text/html",
        expect.objectContaining({ conversion: "markdown_to_html" }),
      );
    } finally {
      fs.rmSync(workspace, { recursive: true, force: true });
    }
  });

  it("convertMarkdownToHtml rejects source files outside the workspace", async () => {
    const workspace = path.join(
      os.tmpdir(),
      `neoworker-html-workspace-${randomUUID()}`,
    );
    const outside = path.join(
      os.tmpdir(),
      `neoworker-html-outside-${randomUUID()}.md`,
    );
    fs.mkdirSync(workspace, { recursive: true });
    fs.writeFileSync(outside, "# Outside", "utf8");
    const tools = new DocumentTools(workspace, "task-1");

    try {
      await expect(
        tools.convertMarkdownToHtml({
          sourcePath: outside,
          filename: "report.html",
        }),
      ).rejects.toThrow("outside the workspace");
    } finally {
      fs.rmSync(workspace, { recursive: true, force: true });
      fs.rmSync(outside, { force: true });
    }
  });

  // ── generateNarrationAudio ────────────────────────────────────

  it("generateNarrationAudio calls voice service and saves mp3", async () => {
    const registerArtifact = vi.fn();
    const workspace = path.join(
      os.tmpdir(),
      `neoworker-doc-tools-${randomUUID()}`,
    );
    fs.mkdirSync(workspace, { recursive: true });
    const tools = new DocumentTools(workspace, "task-1", registerArtifact);

    const result = await tools.generateNarrationAudio({
      filename: "chapter-01.mp3",
      text: "Narration text",
    });

    expect(result.success).toBe(true);
    expect(result.message).toContain("chapter-01.mp3");
    expect(registerArtifact).toHaveBeenCalledWith(
      "task-1",
      path.join(workspace, "chapter-01.mp3"),
      "audio/mpeg",
    );
  });

  // ── No artifact registration when callback not provided ────────

  it("skips artifact registration when no callback provided", async () => {
    const tools = new DocumentTools("/workspace", "task-1"); // no registerArtifact

    const result = await tools.generateDocument({ filename: "test.pdf" });
    expect(result.success).toBe(true);
    // No crash — registerArtifact is undefined and guarded
  });
});
