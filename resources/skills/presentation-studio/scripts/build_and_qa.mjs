#!/usr/bin/env node

import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import {
  createPresentationFontEnvironment,
  loadPresentationRuntime,
  parseArgs,
  resolveLibreOffice,
  resolvePdfToPpm,
} from "./runtime-utils.mjs";
import { validatePresentationPlan } from "./planning-contract.mjs";
import { compileLayoutPlan, renderLayoutSlide } from "./layout-engine.mjs";
import { inspectRenderedLayout } from "./rendered-layout-check.mjs";
import { normalizeGeneratedPackage } from "./package-check.mjs";
import { loadTemplateProject, buildTemplate } from "./template-engine.mjs";
import { validateSourceVisuals } from "./source-assets.mjs";
import { createReviewQueue } from "./review-queue.mjs";

const execFileAsync = promisify(execFile);
const args = parseArgs(process.argv.slice(2));
if (!args["project-dir"]) {
  console.error(
    "Usage: node build_and_qa.mjs --project-dir <dir> [--output <pptx path>]",
  );
  process.exit(2);
}

const projectDir = path.resolve(args["project-dir"]);
const slidesDir = path.join(projectDir, "slides");
const outputDir = path.join(projectDir, "output");
const previewDir = path.join(projectDir, "preview");
const requestedOutputPath = path.resolve(
  args.output || path.join(outputDir, "presentation.pptx"),
);
const outputPath = await resolveVersionedOutputPath(requestedOutputPath);
const candidatePath = path.join(projectDir, ".build", path.basename(outputPath));
const reportPath = path.join(projectDir, "qa-report.json");

async function resolveVersionedOutputPath(requestedPath) {
  try {
    await fs.access(requestedPath);
  } catch {
    return requestedPath;
  }

  const extension = path.extname(requestedPath);
  const requestedStem = path.basename(requestedPath, extension);
  const versionMatch = requestedStem.match(/^(.*)-v(\d+)$/i);
  const baseStem = versionMatch?.[1] || requestedStem;
  let version = versionMatch ? Math.max(2, Number(versionMatch[2]) + 1) : 2;
  while (true) {
    const candidate = path.join(path.dirname(requestedPath), `${baseStem}-v${version}${extension}`);
    try {
      await fs.access(candidate);
      version += 1;
    } catch {
      return candidate;
    }
  }
}

await fs.mkdir(outputDir, { recursive: true });
await fs.mkdir(previewDir, { recursive: true });
await fs.mkdir(path.dirname(candidatePath), { recursive: true });

const report = {
  status: "running",
  generatedAt: new Date().toISOString(),
  projectDir,
  outputPath,
  candidatePath,
  slideCount: 0,
  renderedSlideCount: 0,
  renderer: null,
  planning: null,
  slideTypes: [],
  errors: [],
  warnings: [],
  checks: [],
  layout: null,
  visualInspection: "pending",
};

function check(name, ok, detail) {
  report.checks.push({ name, ok, detail });
}

function plainXmlText(xml) {
  return String(xml)
    .replace(/<a:br\s*\/>/g, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function removeOldPreviewImages() {
  const entries = await fs.readdir(previewDir).catch(() => []);
  await Promise.all(
    entries
      .filter((entry) => /^slide-?\d+\.png$/i.test(entry) || entry === "index.html")
      .map((entry) => fs.rm(path.join(previewDir, entry), { force: true })),
  );
}

async function renderSlides() {
  if (args["skip-render"]) {
    report.warnings.push("Rendering explicitly skipped; visual QA is incomplete.");
    return [];
  }
  const libreOffice = resolveLibreOffice();
  const pdftoppm = resolvePdfToPpm();
  if (!libreOffice || !pdftoppm) {
    report.warnings.push(
      "Rendered-slide QA was skipped because LibreOffice and pdftoppm are not both available.",
    );
    return [];
  }

  let tempDir;
  try {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "neoworker-presentation-qa-"));
    const fontEnvironment = await createPresentationFontEnvironment(tempDir);
    const profileDir = path.join(tempDir, "libreoffice-profile");
    await fs.mkdir(profileDir, { recursive: true });
    await execFileAsync(
      libreOffice,
      [
        `-env:UserInstallation=${pathToFileURL(profileDir).href}`,
        "--headless",
        "--convert-to",
        "pdf",
        "--outdir",
        tempDir,
        candidatePath,
      ],
      {
        timeout: 90_000,
        maxBuffer: 8 * 1024 * 1024,
        env: fontEnvironment,
      },
    );

    const converted = (await fs.readdir(tempDir)).find((entry) =>
      entry.toLowerCase().endsWith(".pdf"),
    );
    if (!converted) throw new Error("LibreOffice did not produce a PDF.");
    const renderedPdf = path.join(tempDir, converted);
    await fs.copyFile(renderedPdf, path.join(previewDir, "rendered.pdf"));
    if (report.layout?.slides) {
      try {
        const geometry = await inspectRenderedLayout(renderedPdf, report.layout.slides);
        report.renderedGeometry = geometry;
        report.errors.push(...geometry.errors);
        report.warnings.push(...geometry.warnings);
        check("rendered text coverage and geometry", geometry.errors.length === 0, `${geometry.slides.length} slide(s) measured in the rendered PDF`);
      } catch (error) {
        report.warnings.push(`Rendered text measurement unavailable: ${error.message}. Visual QA remains required.`);
      }
    }

    await execFileAsync(
      pdftoppm,
      [
        "-png",
        "-scale-to-x",
        "1600",
        "-scale-to-y",
        "-1",
        path.join(tempDir, converted),
        path.join(previewDir, "slide"),
      ],
      { timeout: 90_000, maxBuffer: 8 * 1024 * 1024 },
    );
    report.renderer = "libreoffice+pdftoppm";
    return (await fs.readdir(previewDir))
      .filter((entry) => /^slide-\d+\.png$/i.test(entry))
      .sort((left, right) => {
        const a = Number(left.match(/(\d+)/)?.[1] || 0);
        const b = Number(right.match(/(\d+)/)?.[1] || 0);
        return a - b;
      });
  } catch (error) {
    report.warnings.push(
      `Rendered-slide QA failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return [];
  } finally {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

try {
  const [themeRaw, planRaw, slideEntries] = await Promise.all([
    fs.readFile(path.join(projectDir, "theme.json"), "utf-8"),
    fs.readFile(path.join(projectDir, "presentation-plan.json"), "utf-8"),
    fs.readdir(slidesDir),
  ]);
  const theme = JSON.parse(themeRaw);
  const plan = JSON.parse(planRaw);
  report.sourceVisuals = await validateSourceVisuals(plan, projectDir);
  report.errors.push(...report.sourceVisuals.errors);
  check("source figure review", !report.sourceVisuals.errors.length, `${report.sourceVisuals.reusedFigureCount}/${report.sourceVisuals.sourceFigureCount} originals retained; ${report.sourceVisuals.excludedFigureCount} individually reviewed exclusions; redraws do not replace originals`);
  const slideFiles = slideEntries
    .filter((entry) => /^slide-\d+\.mjs$/i.test(entry))
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));

  const catalogMode = plan.layoutEngine === "catalog-v1";
  const templateMode = plan.layoutEngine === "template-v1";
  if (plan.layoutEngine && !["catalog-v1", "modules", "template-v1"].includes(plan.layoutEngine)) throw new Error(`Unknown layout engine: ${plan.layoutEngine}`);
  if ((catalogMode || templateMode) && slideFiles.length) throw new Error("Structured content and slide modules are both present. Keep one explicit source of truth; no source has been discarded.");
  if (!catalogMode && !templateMode && slideFiles.length === 0) throw new Error("No slides/slide-NN.mjs modules were found.");
  report.slideCount = catalogMode || templateMode ? (plan.slides || []).length : slideFiles.length;
  check("slide sources found", true, `${report.slideCount} ${catalogMode || templateMode ? "content records" : "module(s)"}`);

  const planningValidation = validatePresentationPlan(plan, {
    slideModuleCount: report.slideCount,
  });
  report.planning = planningValidation.summary;
  report.errors.push(
    ...planningValidation.errors.map((item) => `Presentation plan: ${item}`),
  );
  report.warnings.push(
    ...planningValidation.warnings.map((item) => `Presentation plan: ${item}`),
  );
  for (const item of planningValidation.checks) {
    check(`plan: ${item.name}`, item.ok, item.detail);
  }

  const { PptxGenJS, JSZip } = loadPresentationRuntime(import.meta.url);
  const pres = new PptxGenJS();
  pres.layout = "LAYOUT_WIDE";
  pres.author = String(plan.author || "NeoWorker");
  pres.company = String(plan.company || "NeoWorker");
  pres.subject = String(plan.purpose || "Presentation Studio deck");
  pres.title = String(plan.title || "Presentation");
  const language = String(plan.language || "auto");
  const documentLanguage = /^(chinese|mixed|zh|zh-cn)$/i.test(language) ? "zh-CN"
    : /^(english|en|auto)$/i.test(language) ? "en-US" : language;
  pres.lang = documentLanguage;
  pres.theme = {
    headFontFace: theme.fonts?.heading,
    bodyFontFace: theme.fonts?.body,
    lang: documentLanguage,
  };

  const allSource = [];
  let templateProject;
  if (templateMode) {
    templateProject = await loadTemplateProject(plan, projectDir);
    const { compiled } = templateProject;
    report.errors.push(...compiled.errors);
    report.warnings.push(...compiled.warnings);
    report.layout = { engine: "template-v1", slides: compiled.slides };
    report.slideTypes = compiled.slides.map(s => s.layoutId);
    allSource.push(JSON.stringify(plan.slides.map(s => ({ title: s.title, content: s.content }))));
    check("native template content and capacity", compiled.errors.length === 0, `${compiled.slides.length}/${report.slideCount} slides bind all requested content without changing template fonts or frames`);
  }
  if (catalogMode) {
    const compiled = compileLayoutPlan(plan, theme);
    report.errors.push(...compiled.errors);
    report.warnings.push(...compiled.warnings);
    report.layout = {
      engine: "catalog-v1", family: compiled.family, measurement: compiled.measurement,
      slides: compiled.slides.map(model => ({ index: model.index, layoutId: model.layoutId, composition: model.composition,
        textBoxes: model.textBoxes.map(({ field, text, x, y, w, h, size, measurement, renderBounds }) => ({ field, text, x, y, w, h, size, measurement, renderBounds })) })),
    };
    check("layout content and capacity", compiled.errors.length === 0, `${compiled.slides.length}/${report.slideCount} layouts fit without shrinking or truncating text`);
    if (report.errors.length === 0) for (const model of compiled.slides) {
      renderLayoutSlide(pres, model, theme, projectDir);
      report.slideTypes.push(model.layoutId);
    }
    allSource.push(JSON.stringify(plan.slides.map(slide => ({ title: slide.title, content: slide.content }))));
  }
  for (const slideFile of slideFiles) {
    const slidePath = path.join(slidesDir, slideFile);
    const source = await fs.readFile(slidePath, "utf-8");
    allSource.push(source);
    if (/async\s+function\s+createSlide|createSlide\s*=\s*async/.test(source)) {
      report.errors.push(`${slideFile}: createSlide must be synchronous.`);
    }

    const href = `${pathToFileURL(slidePath).href}?qa=${Date.now()}`;
    const slideModule = await import(href);
    const createSlide = slideModule.createSlide || slideModule.default?.createSlide;
    const config = slideModule.slideConfig || slideModule.default?.slideConfig || {};
    if (typeof createSlide !== "function") {
      report.errors.push(`${slideFile}: missing exported createSlide function.`);
      continue;
    }
    const result = createSlide(pres, theme);
    if (result && typeof result.then === "function") {
      report.errors.push(`${slideFile}: createSlide returned a Promise.`);
      await result;
    }
    report.slideTypes.push(String(config.type || "unspecified"));
  }

  const sourceText = allSource.join("\n");
  const placeholders = Array.from(
    new Set(sourceText.match(/\{\{[^}]+\}\}|\b(?:lorem ipsum|placeholder|xxxx+)\b/gi) || []),
  );
  if (placeholders.length > 0) {
    report.errors.push(`Unresolved placeholders: ${placeholders.join(", ")}`);
  }
  check("placeholder scan", placeholders.length === 0, placeholders.join(", ") || "clean");

  for (let index = 2; index < report.slideTypes.length; index += 1) {
    if (
      report.slideTypes[index] === report.slideTypes[index - 1] &&
      report.slideTypes[index] === report.slideTypes[index - 2]
    ) {
      report.warnings.push(
        `Slides ${index - 1}-${index + 1} repeat the same '${report.slideTypes[index]}' page type. Verify that their compositions differ.`,
      );
    }
  }

  if (report.errors.length > 0) {
    throw new Error("Slide source validation failed before PPTX compilation.");
  }

  if (templateMode) {
    report.template = await buildTemplate(templateProject.compiled, templateProject.source, candidatePath);
    check("template fidelity and native read-back", true, `${report.template.preservedParts.length} original master/layout/theme/media parts retained byte-for-byte`);
  } else await pres.writeFile({ fileName: candidatePath });
  const outputBytes = await fs.readFile(candidatePath);
  const zip = await JSZip.loadAsync(outputBytes);
  report.packageRepairs = templateMode ? [] : await normalizeGeneratedPackage(zip);
  if (report.packageRepairs.length) {
    await fs.writeFile(candidatePath, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
  }
  check(templateMode ? "native template package" : "generated package normalization", true, templateMode ? "Template parts preserved; generated-deck normalizers were not applied" : `${report.packageRepairs.length} manifest/cache repairs; referenced parts and chart values preserved`);
  const packagedSlides = Object.keys(zip.files).filter((name) =>
    /^ppt\/slides\/slide\d+\.xml$/i.test(name),
  );
  if (packagedSlides.length !== report.slideCount) {
    report.errors.push(
      `PPTX contains ${packagedSlides.length} slide package(s), expected ${report.slideCount}.`,
    );
  }
  check(
    "PPTX package slide count",
    packagedSlides.length === report.slideCount,
    `${packagedSlides.length}/${report.slideCount}`,
  );

  const extractedText = [];
  for (const fileName of packagedSlides) {
    const xml = await zip.file(fileName)?.async("string");
    if (xml) extractedText.push(plainXmlText(xml));
  }
  const extracted = extractedText.join("\n");
  const packagePlaceholders = extracted.match(/\{\{[^}]+\}\}|\b(?:lorem ipsum|placeholder|xxxx+)\b/gi) || [];
  if (packagePlaceholders.length > 0) {
    report.errors.push("The generated PPTX still contains placeholder text.");
  }
  check("generated content scan", packagePlaceholders.length === 0, "PPTX text extracted");

  await removeOldPreviewImages();
  const previewFiles = await renderSlides();
  report.renderedSlideCount = previewFiles.length;
  if (report.renderer && previewFiles.length !== report.slideCount) {
    report.errors.push(
      `The renderer produced ${previewFiles.length}/${report.slideCount} slide images.`,
    );
  }
  check(
    "rendered slide coverage",
    previewFiles.length === report.slideCount,
    report.renderer
      ? `${previewFiles.length}/${report.slideCount} via ${report.renderer}`
      : "renderer unavailable",
  );

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>${escapeHtml(plan.title || "Presentation QA")}</title>
<style>body{margin:0;background:#eef1f5;color:#172033;font:14px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}header{position:sticky;top:0;padding:16px 24px;background:#fff;border-bottom:1px solid #dce2ea;z-index:2}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(420px,1fr));gap:24px;padding:24px}figure{margin:0;background:#fff;border:1px solid #dce2ea;border-radius:12px;overflow:hidden;box-shadow:0 8px 24px #25324a14}img{display:block;width:100%;height:auto}figcaption{padding:10px 14px;color:#647087}</style></head>
<body><header><strong>${escapeHtml(plan.title || "Presentation QA")}</strong> · ${previewFiles.length} rendered slide(s)</header><main>
${previewFiles.map((file, index) => `<figure><img src="${encodeURIComponent(file)}" alt="Slide ${index + 1}"><figcaption>Slide ${index + 1}</figcaption></figure>`).join("\n")}
</main></body></html>`;
  await fs.writeFile(path.join(previewDir, "index.html"), html, "utf-8");
  // Do not publish a PPTX rejected by the renderer into the delivery directory.
  // Keep the failed candidate privately for diagnosis and preserve earlier decks.
  if (report.errors.length === 0) {
    await fs.copyFile(candidatePath, outputPath, fsConstants.COPYFILE_EXCL);
    report.outputSha256 = createHash("sha256").update(await fs.readFile(outputPath)).digest("hex");
    report.visualReviewQueue = path.join(projectDir, "visual-review-queue.json");
    await fs.writeFile(report.visualReviewQueue, JSON.stringify(await createReviewQueue({
      outputPath, outputSha256: report.outputSha256, previewDir, previewFiles,
    }), null, 2));
  }
} catch (error) {
  if (!report.errors.some((item) => item.includes("validation failed"))) {
    report.errors.push(error instanceof Error ? error.message : String(error));
  }
}

report.status = report.errors.length > 0 ? "failed" : report.warnings.length > 0 ? "warning" : "passed";
await fs.writeFile(reportPath, JSON.stringify(report, null, 2), "utf-8");

console.log(`[presentation-studio] status: ${report.status}`);
console.log(`[presentation-studio] output: ${outputPath}`);
console.log(`[presentation-studio] QA report: ${reportPath}`);
if (report.visualReviewQueue) console.log(`[presentation-studio] Review the existing PNG batches: ${report.visualReviewQueue} (analyze_image paths, max_dimension 960; do not re-render the PDF)`);
console.log(
  `[presentation-studio] rendered: ${report.renderedSlideCount}/${report.slideCount}`,
);
for (const warning of report.warnings) console.warn(`[presentation-studio] warning: ${warning}`);
for (const error of report.errors) console.error(`[presentation-studio] error: ${error}`);

if (report.errors.length > 0) process.exitCode = 1;
