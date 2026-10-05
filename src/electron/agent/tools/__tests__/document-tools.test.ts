import fs from "fs";
import os from "os";
import path from "path";
import { randomUUID, createHash } from "crypto";
import { describe, expect, it, vi } from "vitest";
import JSZip from "jszip";
import { DocumentTools } from "../document-tools";
import { ToolCallDeduplicator } from "../../executor-helpers";
import { inspectOfficeTranslation, verifyOfficeTranslationFidelity } from "../../../documents/office-translation";
import { fitPptxTranslation } from "../../../documents/pptx-translation-layout";
import { MAX_TRANSLATION_BATCH_UNITS } from "../../../documents/translation-batches";
import { compileLatex } from "../../../utils/document-generators/latex-compiler";
import { generatePDF } from "../../../utils/document-generators/pdf-generator";
import { runOfficeDocumentQualityCheck } from "../../../utils/office-document-quality";
import type { OfficeCliArtifactBuilder } from "../../skills/officecli-artifact-builder";

// Mock the generator modules since they depend on external packages
vi.mock("../../../documents/pptx-translation-layout", () => ({
  fitPptxTranslation: vi.fn(async (_source, output) => ({ output, checkedShapes: 1, adjustedShapes: 0, issues: [] })),
}));
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
    visual: {
      required: true,
      passed: true,
      evidencePath: `${process.cwd()}/resources/branding/neoworker-app-icon.png`,
      message: "Visual evidence available",
    },
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

    expect(defs).toHaveLength(9);
    const names = defs.map((d) => d.name);
    expect(names).toContain("compile_latex");
    expect(names).toContain("office_translation");
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

  it("migrates complete legacy passages without joining fragmented translations or changing old progress", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "translation-v3-migrate-"));
    try {
      const { default: PptxGenJS } = await import("pptxgenjs");
      const pptx = new PptxGenJS(); const slide = pptx.addSlide();
      slide.addText([{ text: "BCM", options: { lang: "en-US" } }, { text: "安装", options: { lang: "zh-CN" } }], { x: 1, y: 1, w: 4, h: 1 });
      slide.addText("A complete paragraph", { x: 1, y: 3, w: 4, h: 1 });
      const source = Buffer.from(await pptx.write({ outputType: "nodebuffer" }) as Buffer);
      fs.writeFileSync(path.join(directory, "source.pptx"), source);
      const legacy = await inspectOfficeTranslation(source, true);
      const saved = { ...legacy, targetLanguage: "german", completedUnitIds: legacy.units.map((unit) => unit.id),
        units: legacy.units.map((unit) => ({ ...unit, text: unit.text === "A complete paragraph" ? "Ein vollständiger Absatz" : `Fragment ${unit.text}` })) };
      const languageHash = createHash("sha256").update("german").digest("hex").slice(0, 16);
      const filename = path.join(directory, `.neoworker-translation-${legacy.sourceSha256.slice(0, 16)}-${languageHash}.json`);
      const bytes = JSON.stringify(saved); fs.writeFileSync(filename, bytes);
      const tools = new DocumentTools(directory, "translation-test");
      const result = await tools.officeTranslation({ action: "inspect", sourcePath: "source.pptx", targetLanguage: "German" });
      expect(result.translationId).toContain("-v3.json");
      expect(result.nextUnits.some((unit: { text: string }) => unit.text === "BCM安装")).toBe(true);
      expect(result.nextUnits.some((unit: { text: string }) => unit.text === "A complete paragraph")).toBe(false);
      expect(result.completed).toBeGreaterThan(0);
      expect(fs.readFileSync(filename, "utf8")).toBe(bytes);
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  });

  it.each(["translation_too_long", "translated_neighbor_text_overlap"])("repairs %s, retaining previous translations and publishing only after fitting", async reason => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "translation-fit-repair-"));
    const register = vi.fn();
    try {
      const { default: PptxGenJS } = await import("pptxgenjs");
      const pptx = new PptxGenJS();
      const slide = pptx.addSlide();
      slide.addText("A source sentence", { x: 1, y: 1, w: 2, h: 1 });
      slide.addText("Another sentence", { x: 1, y: 3, w: 2, h: 1 });
      fs.writeFileSync(path.join(directory, "source.pptx"), Buffer.from(await pptx.write({ outputType: "nodebuffer" }) as Buffer));
      const tools = new DocumentTools(directory, "translation-test", register);
      const inspection = await tools.officeTranslation({ action: "inspect", sourcePath: "source.pptx", targetLanguage: "German" });
      const id = inspection.nextUnits[0].id;
      await tools.officeTranslation({ action: "stage", translationId: inspection.translationId, batchId: inspection.batchId,
        translations: inspection.nextUnits.map((unit: { key: string; text: string }) => ({ key: unit.key, text: `Translated ${unit.text}` })) });
      vi.mocked(fitPptxTranslation).mockResolvedValueOnce({ output: undefined, checkedShapes: 2, adjustedShapes: 0,
        issues: [{ key: "box", slide: 1, text: "long", unitIds: [id], kind: "shape", reason }] });
      const blocked = await tools.officeTranslation({ action: "apply", translationId: inspection.translationId, filename: "German.pptx" });
      expect(blocked.success).toBe(false); expect(blocked.retryable).toBe(true);
      expect(blocked.repairIds).toEqual([id]); expect(blocked.nextUnits).toHaveLength(1);
      expect(blocked.nextUnits[0].previousTranslation).toBe("Translated A source sentence");
      expect(blocked.completed).toBe(inspection.total - 1);
      expect(register).not.toHaveBeenCalled(); expect(fs.existsSync(path.join(directory, "German.pptx"))).toBe(false);
      const resumed = await tools.officeTranslation({ action: "inspect", sourcePath: "source.pptx", targetLanguage: "German" });
      expect(resumed.nextUnits[0].previousTranslation).toBe(blocked.nextUnits[0].previousTranslation);
      await tools.officeTranslation({ action: "stage", translationId: resumed.translationId, batchId: resumed.batchId,
        translations: [{ key: resumed.nextUnits[0].key, text: "Ein Satz" }] });
      const delivered = await tools.officeTranslation({ action: "apply", translationId: resumed.translationId, filename: "German.pptx" });
      expect(delivered.success).toBe(true); expect(delivered.textFit.status).toBe("passed");
      expect(register).toHaveBeenCalledTimes(1);
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  });

  it("preserves completed translations and reports renderer failures without requesting retranslation", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "translation-render-failure-"));
    const register = vi.fn();
    try {
      const { default: PptxGenJS } = await import("pptxgenjs");
      const pptx = new PptxGenJS();
      pptx.addSlide().addText("Original", { x: 1, y: 1, w: 4, h: 1 });
      const source = Buffer.from(await pptx.write({ outputType: "nodebuffer" }) as Buffer);
      fs.writeFileSync(path.join(directory, "source.pptx"), source);
      const tools = new DocumentTools(directory, "render-failure", register);
      const inspection = await tools.officeTranslation({ action: "inspect", sourcePath: "source.pptx", targetLanguage: "German" });
      await tools.officeTranslation({ action: "stage", translationId: inspection.translationId, batchId: inspection.batchId,
        translations: inspection.nextUnits.map((unit: Any) => ({ key: unit.key, text: "Übersetzt" })) });
      vi.mocked(fitPptxTranslation).mockRejectedValueOnce(new Error("Office 版式渲染失败（退出码 1）：Could not find any recognizable digits."));
      const result = await tools.officeTranslation({ action: "apply", translationId: inspection.translationId, filename: "German.pptx" });
      expect(result).toMatchObject({ success: false, retryable: false, needsAttention: true, remaining: 0,
        textFit: { status: "renderer_failed" }, nextUnits: [] });
      expect(result.message).toContain("Could not find any recognizable digits.");
      expect(register).not.toHaveBeenCalled();
      expect(fs.existsSync(path.join(directory, "German.pptx"))).toBe(false);
      expect(fs.readFileSync(path.join(directory, "source.pptx"))).toEqual(source);
      const resumed = await tools.officeTranslation({ action: "inspect", sourcePath: "source.pptx", targetLanguage: "German" });
      expect(resumed.remaining).toBe(0);
      const delivered = await tools.officeTranslation({ action: "apply", translationId: inspection.translationId, filename: "German.pptx" });
      expect(delivered.success).toBe(true);
      expect(register).toHaveBeenCalledTimes(1);
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  });

  it("rejects unsupported PDF preservation without publishing a replacement report", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "office-translation-pdf-"));
    const register = vi.fn();
    try {
      const tools = new DocumentTools(directory, "translation-test", register);
      await expect(tools.officeTranslation({ action: "inspect", sourcePath: "source.pdf" })).rejects.toThrow("尚不支持");
      expect(register).not.toHaveBeenCalled();
      expect(fs.readdirSync(directory)).toEqual([]);
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  });

  it("continues beyond three layout passes while the repair set shrinks", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "translation-fit-progress-"));
    try {
      const { default: PptxGenJS } = await import("pptxgenjs");
      const pptx = new PptxGenJS(), slide = pptx.addSlide();
      for (let i = 0; i < 4; i++) slide.addText(`Source ${i}`, { x: 1, y: i + 1, w: 2, h: 0.5 });
      fs.writeFileSync(path.join(directory, "source.pptx"), Buffer.from(await pptx.write({ outputType: "nodebuffer" }) as Buffer));
      const register = vi.fn(), tools = new DocumentTools(directory, "progress-test", register);
      let progress = await tools.officeTranslation({ action: "inspect", sourcePath: "source.pptx", targetLanguage: "English" });
      const translationId = progress.translationId, ids = progress.nextUnits.map((u: Any) => u.id);
      for (let remaining = 4; remaining > 0; remaining--) {
        await tools.officeTranslation({ action: "stage", translationId, batchId: progress.batchId,
          translations: progress.nextUnits.map((u: Any) => ({ key: u.key, text: `Translated ${u.text.match(/\d+/)?.[0]}` })) });
        vi.mocked(fitPptxTranslation).mockResolvedValueOnce({ output: undefined, checkedShapes: 4, adjustedShapes: 0,
          issues: ids.slice(0, remaining).map((id: string) => ({ key: id, slide: 1, text: "Translated", unitIds: [id], kind: "shape", reason: "translation_too_long" })) });
        progress = await tools.officeTranslation({ action: "apply", translationId, filename: "translated.pptx" });
        expect(progress).toMatchObject({ retryable: true, needsAttention: false, remaining });
      }
      expect(register).not.toHaveBeenCalled();
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  });

  it.each(["text_box_not_rendered", "translation_too_long"])("stops with actionable diagnostics for %s after automatic repair is unavailable", async reason => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "translation-fit-stop-"));
    try {
      const { default: PptxGenJS } = await import("pptxgenjs");
      const pptx = new PptxGenJS();
      pptx.addSlide().addText("Source", { x: 1, y: 1, w: 2, h: 1 });
      fs.writeFileSync(path.join(directory, "source.pptx"), Buffer.from(await pptx.write({ outputType: "nodebuffer" }) as Buffer));
      const register = vi.fn(), tools = new DocumentTools(directory, "stop-test", register);
      let progress = await tools.officeTranslation({ action: "inspect", sourcePath: "source.pptx", targetLanguage: "Korean" });
      const translationId = progress.translationId, id = progress.nextUnits[0].id;
      const attempts = reason === "translation_too_long" ? 3 : 1;
      for (let attempt = 0; attempt < attempts; attempt++) {
        await tools.officeTranslation({ action: "stage", translationId, batchId: progress.batchId,
          translations: progress.nextUnits.map((unit: Any) => ({ key: unit.key, text: "번역" })) });
        vi.mocked(fitPptxTranslation).mockResolvedValueOnce({ output: undefined, checkedShapes: 1, adjustedShapes: 0,
          issues: [{ key: "box", slide: 1, text: "번역", unitIds: [id], kind: "shape", reason }] });
        progress = await tools.officeTranslation({ action: "apply", translationId, filename: "translated.pptx" });
      }
      expect(progress).toMatchObject({ success: false, retryable: false, needsAttention: true, nextUnits: [],
        textFit: { issues: [{ slide: 1, unitIds: [id], reason }] } });
      expect(progress.message).toContain("自动修复已停止");
      expect(progress.guidance).toContain("Stop automatic retries");
      expect(register).not.toHaveBeenCalled();
      if (reason === "translation_too_long") {
        const checkpointPath = path.join(directory, translationId);
        const old = JSON.parse(fs.readFileSync(checkpointPath, "utf8"));
        old.layoutRepairVersion = 2;
        fs.writeFileSync(checkpointPath, JSON.stringify(old));
        const resumed = await tools.officeTranslation({ action: "inspect", sourcePath: "source.pptx", targetLanguage: "Korean" });
        expect(resumed.remaining).toBe(0);
        expect(JSON.parse(fs.readFileSync(checkpointPath, "utf8")).units[0].text).toBe("번역");
        vi.mocked(fitPptxTranslation).mockResolvedValueOnce({ output: undefined, checkedShapes: 1, adjustedShapes: 0,
          issues: [{ key: "box", slide: 1, text: "번역", unitIds: [id], kind: "shape", reason }] });
        const checked = await tools.officeTranslation({ action: "apply", translationId, filename: "translated.pptx" });
        expect(checked.retryable).toBe(true);
        expect(checked.nextUnits[0].previousTranslation).toBe("번역");
      }
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  });

  it("does not publish incomplete manifests, overwrite sources, or accept source symlinks outside the workspace", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "office-translation-tool-"));
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "office-translation-outside-"));
    const register = vi.fn();
    try {
      const archive = new JSZip();
      archive.file("[Content_Types].xml", "<Types/>");
      archive.file("ppt/presentation.xml", "<presentation/>");
      archive.file("ppt/slides/slide1.xml", '<a:p xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:r><a:t>Hello</a:t></a:r></a:p>');
      const source = await archive.generateAsync({ type: "nodebuffer" });
      fs.writeFileSync(path.join(directory, "source.pptx"), source);
      const tools = new DocumentTools(directory, "translation-test", register);
      const inspection = await tools.officeTranslation({ action: "inspect", sourcePath: "source.pptx" });
      expect(register).not.toHaveBeenCalled();
      const manifest = JSON.parse(fs.readFileSync(path.join(directory, inspection.manifestPath), "utf8"));
      fs.writeFileSync(path.join(directory, "bad.json"), JSON.stringify({ ...manifest, units: [] }));
      await expect(tools.officeTranslation({ action: "apply", sourcePath: "source.pptx", translationsPath: "bad.json", filename: "source.pptx" })).rejects.toThrow("不完整");
      expect(register).not.toHaveBeenCalled();
      manifest.units[0].text = "你好";
      fs.writeFileSync(path.join(directory, "good.json"), JSON.stringify(manifest));
      const result = await tools.officeTranslation({ action: "apply", sourcePath: "source.pptx", translationsPath: "good.json", filename: "source.pptx" });
      expect(result.path).toBe("source-v2.pptx");
      expect(result.visualCheck).toBe("not_performed");
      expect(fs.readFileSync(path.join(directory, "source.pptx"))).toEqual(source);
      expect(register).toHaveBeenCalledTimes(1);
      fs.writeFileSync(path.join(outside, "external.pptx"), source);
      fs.symlinkSync(path.join(outside, "external.pptx"), path.join(directory, "link.pptx"));
      await expect(tools.officeTranslation({ action: "inspect", sourcePath: "link.pptx" })).rejects.toThrow("当前工作区");
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  it("resumes staged translations and never delivers a partial checkpoint", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "translation-resume-"));
    try {
      const { default: PptxGenJS } = await import("pptxgenjs");
      const deck = new PptxGenJS();
      deck.addSlide().addText("Hello", { x: 1, y: 1, w: 3, h: 1 });
      deck.addSlide().addText("World", { x: 1, y: 1, w: 3, h: 1 });
      deck.addSlide().addText("World", { x: 1, y: 1, w: 3, h: 1 });
      fs.writeFileSync(path.join(directory, "source.pptx"), Buffer.from(await deck.write({ outputType: "nodebuffer" }) as Buffer));
      const register = vi.fn();
      const tools = new DocumentTools(directory, "task", register);
      const inspect = await tools.officeTranslation({ action: "inspect", sourcePath: "source.pptx", targetLanguage: "Korean" });
      expect(inspect.remaining).toBeGreaterThan(1);
      const stageInput = { action: "stage", sourcePath: "source.pptx", translationsPath: inspect.translationsPath };
      const first = inspect.nextUnits[0];
      await tools.officeTranslation({ ...stageInput, units: [{ id: first.id, text: "Translated first" }] });
      const freshTools = new DocumentTools(directory, "task", register);
      const resumed = await freshTools.officeTranslation({ action: "inspect", sourcePath: "source.pptx", targetLanguage: "Korean" });
      expect(resumed.completed).toBe(1);
      expect(resumed.remaining).toBe(inspect.total - 1);
      expect(resumed.uniqueRemaining).toBe(resumed.remaining - 1);
      expect(resumed.nextUnits.filter((unit: Any) => unit.text === "World")).toHaveLength(1);
      expect(resumed.nextUnits.some((unit: Any) => unit.id === first.id)).toBe(false);
      await expect(freshTools.officeTranslation({ ...stageInput, action: "apply", filename: "translated.pptx" })).rejects.toThrow("尚未全部完成");
      expect(register).not.toHaveBeenCalled();
      await freshTools.officeTranslation({ ...stageInput, units: resumed.nextUnits.map((unit: Any) => ({ id: unit.id, text: `Translated ${unit.text}` })) });
      const result = await freshTools.officeTranslation({ ...stageInput, action: "apply", filename: "translated.pptx" });
      expect(result.success).toBe(true);
      expect(register).toHaveBeenCalledTimes(1);
      const english = await freshTools.officeTranslation({ action: "inspect", sourcePath: "source.pptx", targetLanguage: "English" });
      expect(english.completed).toBe(0);
      expect(english.translationsPath).not.toBe(inspect.translationsPath);
      register.mockImplementationOnce(() => { throw new Error("durable copy failed"); });
      await expect(freshTools.officeTranslation({ ...stageInput, action: "apply", filename: "retry.pptx" })).rejects.toThrow("durable copy failed");
      const retried = await freshTools.officeTranslation({ ...stageInput, action: "apply", filename: "retry.pptx" });
      expect(retried.reusedExistingArtifact).toBe(true);
      expect(retried.path).toBe("retry.pptx");
      expect(fs.existsSync(path.join(directory, "retry-v2.pptx"))).toBe(false);
      const checkpointPath = path.join(directory, english.translationsPath);
      const checkpoint = JSON.parse(fs.readFileSync(checkpointPath, "utf8"));
      checkpoint.completedUnitIds = ["unknown-id"];
      fs.writeFileSync(checkpointPath, JSON.stringify(checkpoint));
      await expect(freshTools.officeTranslation({ action: "inspect", sourcePath: "source.pptx", targetLanguage: "English" })).rejects.toThrow("进度损坏");
      expect(JSON.parse(fs.readFileSync(checkpointPath, "utf8"))).toEqual(checkpoint);
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  });

  it.each(["pptx", "docx", "xlsx"])("completes many %s batches through dedupe, rejected-input recovery and checkpoint resume", async (extension) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "translation-batches-"));
    const unitCount = extension === "pptx" ? 2661 : 161;
    let now = Date.now();
    const clock = vi.spyOn(Date, "now").mockImplementation(() => now);
    try {
      let source: Buffer;
      if (extension === "pptx") {
        const { default: PptxGenJS } = await import("pptxgenjs");
        const deck = new PptxGenJS();
        deck.defineSlideMaster({ title: "ORIGINAL", background: { color: "267A65" }, objects: [] });
        for (let offset = 0; offset < unitCount; offset += 69) {
          const slide = deck.addSlide("ORIGINAL");
          const text = Array.from({ length: Math.min(69, unitCount - offset) }, (_, i) => `Source ${offset + i}`).join("\n");
          slide.addText(text, { x: 1, y: 1, w: 7, h: 4, fontSize: 6 });
          if (offset === 0) slide.addImage({ data: "image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXuoAAAAASUVORK5CYII=", x: 0, y: 0, w: 1, h: 1 });
        }
        source = Buffer.from(await deck.write({ outputType: "nodebuffer" }) as Buffer);
      } else if (extension === "docx") {
        const { Document, Packer, Paragraph } = await import("docx");
        source = await Packer.toBuffer(new Document({ sections: [{ children: Array.from({ length: unitCount }, (_, i) => new Paragraph(`Source ${i}`)) }] }));
      } else {
        const { default: ExcelJS } = await import("exceljs");
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet("Original");
        for (let i = 0; i < unitCount; i++) sheet.getCell(`A${i + 1}`).value = `Source ${i}`;
        sheet.getCell("B1").value = 123;
        sheet.getCell("C1").value = { formula: "B1*2", result: 246 };
        source = Buffer.from(await workbook.xlsx.writeBuffer());
      }
      const sourcePath = `source.${extension}`;
      fs.writeFileSync(path.join(directory, sourcePath), source);
      const register = vi.fn();
      let tools = new DocumentTools(directory, "batch-test", register);
      const deduper = new ToolCallDeduplicator(3, 120_000, 4);
      const dispatch = async (input: Any) => {
        expect(deduper.checkDuplicate("office_translation", input).isDuplicate).toBe(false);
        try {
          const result = await tools.officeTranslation(input);
          deduper.recordCall("office_translation", input, JSON.stringify(result));
          return result;
        } catch (error) {
          deduper.recordCall("office_translation", input, JSON.stringify({ success: false, error: String(error) }));
          throw error;
        }
      };
      const inspection = { action: "inspect", sourcePath, targetLanguage: "Korean" };
      let progress = await dispatch(inspection);
      const originalManifest = await inspectOfficeTranslation(source);
      // PPTX libraries also add editable notes-master text to the package.
      expect(originalManifest.units.filter((unit) => unit.text.startsWith("Source "))).toHaveLength(unitCount);
      const total = originalManifest.units.length;
      expect(progress.total).toBe(total);
      let batchCount = 0;
      while (progress.remaining > 0) {
        const input = {
          action: "stage", sourcePath, translationsPath: progress.translationsPath,
          units: progress.nextUnits.map((unit: Any) => ({ id: unit.id, text: `Translated ${unit.text}` })),
        };
        if (batchCount === 1) {
          const checkpointPath = path.join(directory, progress.translationsPath);
          const saved = fs.readFileSync(checkpointPath);
          await expect(dispatch({ ...input, units: [{ id: "invalid-id", text: "bad" }, ...input.units.slice(1)] })).rejects.toThrow("无效的翻译单元");
          expect(fs.readFileSync(checkpointPath)).toEqual(saved);
          tools = new DocumentTools(directory, "batch-test", register);
          const resumed = await dispatch(inspection);
          expect(resumed.completed).toBe(progress.completed);
          expect(resumed.nextUnits).toEqual(progress.nextUnits);
          await expect(dispatch({ ...input, units: undefined, action: "apply", filename: `translated.${extension}` })).rejects.toThrow("尚未全部完成");
        }
        const compact = {
          action: "stage", sourcePath, translationsPath: progress.translationsPath,
          batchId: progress.batchId, translations: progress.nextUnits.map((unit: Any) => ({ key: unit.key, text: `Translated ${unit.text}` })).reverse(),
        };
        const next = await dispatch(compact);
        expect(next.completed).toBe(progress.completed + input.units.length);
        expect(next.remaining).toBe(total - next.completed);
        progress = next;
        batchCount++;
        // Advance simulated model time, not wall-clock sleeps or dedupe resets.
        now += 10_000;
        expect(register).not.toHaveBeenCalled();
      }
      expect(batchCount).toBeLessThanOrEqual(Math.ceil(total / MAX_TRANSLATION_BATCH_UNITS) + 1);
      const result = await dispatch({ action: "apply", sourcePath, translationsPath: progress.translationsPath, filename: `translated.${extension}` });
      expect(result.success).toBe(true);
      expect(register).toHaveBeenCalledTimes(1);
      expect(fs.readFileSync(path.join(directory, sourcePath))).toEqual(source);
      const output = fs.readFileSync(path.join(directory, result.path));
      await expect(verifyOfficeTranslationFidelity(source, output)).resolves.toBeUndefined();
      const manifest = await inspectOfficeTranslation(output);
      expect(manifest.units.map((unit) => unit.text)).toEqual(originalManifest.units.map((unit) => `Translated ${unit.text}`));
    } finally {
      clock.mockRestore();
      fs.rmSync(directory, { recursive: true, force: true });
    }
  }, 60_000);

  it("rejects malformed batch envelopes atomically and accepts legacy 41-unit batches", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "translation-compact-"));
    try {
      const { Document, Packer, Paragraph } = await import("docx");
      const source = await Packer.toBuffer(new Document({ sections: [{ children: Array.from({ length: 200 }, (_, i) => new Paragraph(`Source ${i}`)) }] }));
      fs.writeFileSync(path.join(directory, "source.docx"), source);
      const tools = new DocumentTools(directory, "compact-test");
      const inspectInput = { action: "inspect", sourcePath: "source.docx", targetLanguage: "Korean" };
      const first = await tools.officeTranslation(inspectInput);
      expect(first.batchSize).toBe(160);
      const checkpointPath = path.join(directory, first.translationsPath);
      const original = fs.readFileSync(checkpointPath);
      const compact = { action: "stage", sourcePath: "source.docx", translationsPath: first.translationsPath, batchId: first.batchId, translations: first.nextUnits.map((unit: Any) => ({ key: unit.key, text: `Translated ${unit.text}` })) };
      for (const invalid of [
        { ...compact, batchId: "wrong" },
        { ...compact, translations: [...compact.translations, "extra"] },
        { ...compact, translations: "not an array" },
        { ...compact, units: [] },
      ]) {
        await expect(tools.officeTranslation(invalid)).rejects.toThrow();
        expect(fs.readFileSync(checkpointPath)).toEqual(original);
      }
      const partial = await tools.officeTranslation({ action: "stage", sourcePath: "source.docx", translationsPath: first.translationsPath, units: first.nextUnits.slice(0, 41).map((unit: Any) => ({ id: unit.id, text: `Translated ${unit.text}` })) });
      expect(partial.completed).toBe(41);
      const saved = fs.readFileSync(checkpointPath);
      await expect(tools.officeTranslation(compact)).rejects.toThrow("批次已过期");
      expect(fs.readFileSync(checkpointPath)).toEqual(saved);
      const resumed = await new DocumentTools(directory, "compact-test").officeTranslation(inspectInput);
      expect(resumed.batchId).toBe(partial.batchId);
      const final = await tools.officeTranslation({ ...compact, batchId: resumed.batchId, translations: resumed.nextUnits.map((unit: Any) => ({ key: unit.key, text: `Translated ${unit.text}` })).reverse() });
      expect(final.remaining).toBe(0);
      expect(final.completed).toBe(200);
      const completed = JSON.parse(fs.readFileSync(checkpointPath, "utf8"));
      expect(completed.units.map((unit: Any) => unit.text)).toEqual(Array.from({ length: 200 }, (_, i) => `Translated Source ${i}`));
      expect(fs.readFileSync(path.join(directory, "source.docx"))).toEqual(source);
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  });

  it.each(["missing", "duplicate", "unknown", "empty", "unicode", "control", "legacy-empty"])("saves valid entries and repairs only %s entries, without model-managed paths", async (problem) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "translation-repair-"));
    try {
      const { Document, Packer, Paragraph } = await import("docx");
      fs.writeFileSync(path.join(directory, "source.docx"), await Packer.toBuffer(new Document({ sections: [{ children: Array.from({ length: 200 }, (_, i) => new Paragraph(`Source ${i}`)) }] })));
      let tools = new DocumentTools(directory, "repair-test");
      const first = await tools.officeTranslation({ action: "inspect", sourcePath: "source.docx", targetLanguage: "Arabic" });
      const entries = first.nextUnits.map((unit: Any) => ({ key: unit.key, text: `Translation ${unit.text}` }));
      if (problem === "missing") entries.shift();
      if (problem === "duplicate") entries[0] = entries[1];
      if (problem === "unknown") entries[0].key = "unknown";
      if (problem === "empty" || problem === "legacy-empty") entries[0].text = "";
      if (problem === "unicode") entries[0].text = "bad\uFFFD";
      if (problem === "control") entries[0].text = "bad\u0001";
      // Reproduce the live task's missing translationsPath, recovering by exact batch identity.
      const partial = await tools.officeTranslation({ action: "stage", sourcePath: "source.docx", batchId: first.batchId,
        ...(problem === "legacy-empty" ? { units: entries.map((entry: Any, index: number) => ({ id: first.nextUnits[index].id, text: entry.text })) } : { translations: entries }) });
      expect(partial.success).toBe(false);
      expect(partial.accepted).toBe(problem === "duplicate" ? 158 : 159);
      expect(partial.repairing).toBe(true);
      expect(partial.nextUnits).toHaveLength(problem === "duplicate" ? 2 : 1);
      expect(partial.issues.length).toBeGreaterThan(0);
      tools = new DocumentTools(directory, "repair-test");
      let current = partial;
      while (current.remaining) {
        current = await tools.officeTranslation({ action: "stage", translationId: current.translationId, batchId: current.batchId, translations: current.nextUnits.map((unit: Any) => ({ key: unit.key, text: `Translation ${unit.text}` })) });
        expect(current.success).toBe(true);
      }
      const result = await tools.officeTranslation({ action: "apply", translationId: current.translationId, filename: "output.docx" });
      expect(result.success).toBe(true);
      const manifest = await inspectOfficeTranslation(fs.readFileSync(path.join(directory, result.path)));
      expect(manifest.units.map((unit) => unit.text)).toEqual(Array.from({ length: 200 }, (_, i) => `Translation Source ${i}`));
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  });

  it("bounds no-progress replies and reopens only corrupted completed units on final apply", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "translation-corrupt-"));
    try {
      const { Document, Packer, Paragraph } = await import("docx");
      fs.writeFileSync(path.join(directory, "source.docx"), await Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph("Hello"), new Paragraph("World")] }] })));
      const register = vi.fn();
      const tools = new DocumentTools(directory, "repair-test", register);
      let current = await tools.officeTranslation({ action: "inspect", sourcePath: "source.docx", targetLanguage: "Arabic" });
      for (let i = 0; i < 3; i++) {
        current = await tools.officeTranslation({ action: "stage", translationId: current.translationId, batchId: current.batchId, translations: ["invalid"] });
      }
      expect(current.needsAttention).toBe(true);
      expect(current.retryable).toBe(false);
      expect(current.nextUnits).toEqual([]);
      current = await tools.officeTranslation({ action: "inspect", sourcePath: "source.docx", targetLanguage: "Arabic" });
      current = await tools.officeTranslation({ action: "stage", translationId: current.translationId, batchId: current.batchId, translations: current.nextUnits.map((unit: Any) => ({ key: unit.key, text: `Translated ${unit.text}` })) });
      const checkpointFile = path.join(directory, current.translationsPath);
      const saved = JSON.parse(fs.readFileSync(checkpointFile, "utf8"));
      saved.units[0].text = "bad\uFFFD";
      fs.writeFileSync(checkpointFile, JSON.stringify(saved));
      const repair = await tools.officeTranslation({ action: "apply", translationId: current.translationId, filename: "output.docx" });
      expect(repair.success).toBe(false);
      expect(repair.remaining).toBe(1);
      expect(repair.nextUnits[0].text).toBe("Hello");
      expect(register).not.toHaveBeenCalled();
      expect(fs.existsSync(path.join(directory, "output.docx"))).toBe(false);
      expect(JSON.parse(fs.readFileSync(checkpointFile, "utf8")).units[1].text).toBe("Translated World");
      await expect(tools.officeTranslation({ action: "stage", translationId: "../escape.json" })).rejects.toThrow("translationId");
      await expect(tools.officeTranslation({ action: "stage", translationId: current.translationId }, [path.join(directory, "unrelated.docx")])).rejects.toThrow("本轮指定的原附件");
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  });

  it("serializes overlapping compact replies across tool instances without overwriting progress", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "translation-overlap-"));
    try {
      const { Document, Packer, Paragraph } = await import("docx");
      fs.writeFileSync(path.join(directory, "source.docx"), await Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph("Hello")] }] })));
      const firstTools = new DocumentTools(directory, "first");
      const secondTools = new DocumentTools(directory, "second");
      const inspection = { action: "inspect", sourcePath: "source.docx", targetLanguage: "Korean" };
      const first = await firstTools.officeTranslation(inspection);
      const input = { action: "stage", sourcePath: "source.docx", translationsPath: first.translationsPath, batchId: first.batchId, translations: [{ key: first.nextUnits[0].key, text: "Translated" }] };
      const calls = [firstTools.officeTranslation(input), secondTools.officeTranslation({ ...input, translations: [{ key: first.nextUnits[0].key, text: "Stale overwrite" }] })];
      const results = await Promise.allSettled(calls);
      // Asynchronous realpath resolution may enqueue either caller first.
      // Exactly one may commit, and the losing batch must not overwrite it.
      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      const rejected = results.find((result) => result.status === "rejected") as PromiseRejectedResult;
      expect(String(rejected.reason)).toContain("批次已过期");
      const saved = JSON.parse(fs.readFileSync(path.join(directory, first.translationsPath), "utf8"));
      expect(saved.units[0].text).toBe(results[0].status === "fulfilled" ? "Translated" : "Stale overwrite");
      expect(saved.completedUnitIds).toHaveLength(1);
      expect((await secondTools.officeTranslation(inspection)).remaining).toBe(0);
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  });

  it("reports review hints on stage and delivery and clears corrected hints without certifying accuracy", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "translation-review-"));
    try {
      const { Document, Packer, Paragraph } = await import("docx");
      fs.writeFileSync(path.join(directory, "source.docx"), await Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph("The cluster contains 384 GPUs in total.")] }] })));
      const tools = new DocumentTools(directory, "review-test");
      const first = await tools.officeTranslation({ action: "inspect", sourcePath: "source.docx", targetLanguage: "Korean" });
      const base = { sourcePath: "source.docx", translationsPath: first.translationsPath };
      const staged = await tools.officeTranslation({ ...base, action: "stage", batchId: first.batchId, translations: [{ key: first.nextUnits[0].key, text: "Translated cluster with 38 GPUs." }] });
      expect(staged).toMatchObject({ success: true, remaining: 0, review: { status: "needs_review", semanticAccuracy: "not_verified", issueCount: 1 } });
      const flagged = await tools.officeTranslation({ ...base, action: "apply", filename: "flagged.docx" });
      expect(flagged.review).toMatchObject({ status: "needs_review", issueCount: 1 });
      await tools.officeTranslation({ ...base, action: "stage", units: [{ id: first.nextUnits[0].id, text: "Translated cluster with 384 GPUs." }] });
      const corrected = await tools.officeTranslation({ ...base, action: "apply", filename: "corrected.docx" });
      expect(corrected.review).toMatchObject({ status: "no_heuristic_flags", semanticAccuracy: "not_verified", issueCount: 0 });
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  });

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
      expect.objectContaining({ workspaceOutputPath: "/workspace/report.pdf", requestedOutputPath: path.join("/workspace", "report.pdf") }),
    );
  });

  it("exports a persisted manuscript and rejects paths outside the workspace", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pdf-manuscript-"));
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "pdf-outside-"));
    try {
      fs.writeFileSync(path.join(dir, "translation.md"), "# 全文译文\n\n正文与图注。", "utf8");
      fs.writeFileSync(path.join(outside, "private.md"), "private");
      fs.symlinkSync(path.join(outside, "private.md"), path.join(dir, "escape.md"));
      const tools = new DocumentTools(dir, "manuscript");
      await tools.generateDocument({ filename: "translated.pdf", markdown_path: "translation.md" });
      expect(generatePDF).toHaveBeenLastCalledWith(expect.any(String), expect.objectContaining({ markdown: "# 全文译文\n\n正文与图注。" }));
      await expect(tools.generateDocument({ markdown_path: "escape.md" })).rejects.toThrow("outside the workspace");
      await expect(tools.generateDocument({ markdown_path: "translation.md", markdown: "conflicting input" })).rejects.toThrow("not both");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  it.each([
    { filename: "diag_s21.pdf" },
    { filename: "equation-check.pdf", purpose: "diagnostic" },
  ])("keeps diagnostic PDFs out of the deliverable list: $filename", async (input) => {
    const registerArtifact = vi.fn();
    const tools = new DocumentTools("/workspace", "pdf-diagnostic", registerArtifact);
    const result = await tools.generateDocument({ ...input, markdown: "# Formula check" });
    expect(generatePDF).toHaveBeenLastCalledWith(
      path.join("/workspace/.neoworker/tmp/pdf-diagnostics", input.filename),
      expect.any(Object),
    );
    expect(registerArtifact).not.toHaveBeenCalled();
    expect(result.purpose).toBe("diagnostic");
    expect(result.message).toContain("not a deliverable");
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

    expect(result.success, JSON.stringify(result)).toBe(true);
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
