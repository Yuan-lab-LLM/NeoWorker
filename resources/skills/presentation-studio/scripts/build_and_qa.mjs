#!/usr/bin/env node

import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import {
  createPresentationFontEnvironment,
  loadPresentationRuntime,
  parseArgs,
  resolveLibreOffice,
  which,
} from "./runtime-utils.mjs";
import { validatePresentationPlan } from "./planning-contract.mjs";

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

const report = {
  status: "running",
  generatedAt: new Date().toISOString(),
  projectDir,
  outputPath,
  slideCount: 0,
  renderedSlideCount: 0,
  renderer: null,
  planning: null,
  slideTypes: [],
  errors: [],
  warnings: [],
  checks: [],
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
  const libreOffice = resolveLibreOffice();
  const pdftoppm = which("pdftoppm");
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
        outputPath,
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
  const slideFiles = slideEntries
    .filter((entry) => /^slide-\d+\.mjs$/i.test(entry))
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));

  if (slideFiles.length === 0) throw new Error("No slides/slide-NN.mjs modules were found.");
  report.slideCount = slideFiles.length;
  check("slide modules found", true, `${slideFiles.length} module(s)`);

  const planningValidation = validatePresentationPlan(plan, {
    slideModuleCount: slideFiles.length,
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
  pres.lang = String(plan.language || "en-US");
  pres.theme = {
    headFontFace: theme.fonts?.heading,
    bodyFontFace: theme.fonts?.body,
    lang: String(plan.language || "en-US"),
  };

  const allSource = [];
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

  await pres.writeFile({ fileName: outputPath });
  const outputBytes = await fs.readFile(outputPath);
  const zip = await JSZip.loadAsync(outputBytes);
  const packagedSlides = Object.keys(zip.files).filter((name) =>
    /^ppt\/slides\/slide\d+\.xml$/i.test(name),
  );
  if (packagedSlides.length !== slideFiles.length) {
    report.errors.push(
      `PPTX contains ${packagedSlides.length} slide package(s), expected ${slideFiles.length}.`,
    );
  }
  check(
    "PPTX package slide count",
    packagedSlides.length === slideFiles.length,
    `${packagedSlides.length}/${slideFiles.length}`,
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
  if (report.renderer && previewFiles.length !== slideFiles.length) {
    report.errors.push(
      `The renderer produced ${previewFiles.length}/${slideFiles.length} slide images.`,
    );
  }
  check(
    "rendered slide coverage",
    previewFiles.length === slideFiles.length,
    report.renderer
      ? `${previewFiles.length}/${slideFiles.length} via ${report.renderer}`
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
console.log(
  `[presentation-studio] rendered: ${report.renderedSlideCount}/${report.slideCount}`,
);
for (const warning of report.warnings) console.warn(`[presentation-studio] warning: ${warning}`);
for (const error of report.errors) console.error(`[presentation-studio] error: ${error}`);

if (report.errors.length > 0) process.exitCode = 1;
