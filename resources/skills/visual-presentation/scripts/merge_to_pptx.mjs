#!/usr/bin/env node

import { execFile } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import {
  createPresentationFontEnvironment,
  loadPresentationRuntime,
  parseArgs,
  resolveLibreOffice,
  resolvePlatformFonts,
  which,
} from "./runtime-utils.mjs";

const execFileAsync = promisify(execFile);

const args = parseArgs(process.argv.slice(2));
if (!args["project-dir"]) {
  console.error("Usage: node merge_to_pptx.mjs --project-dir <dir>");
  process.exit(2);
}

const projectDir = path.resolve(args["project-dir"]);
const deckPath = path.join(projectDir, "deck.json");
const outputDir = path.join(projectDir, "output");
const outputPath = resolveVersionedOutputPath(path.join(outputDir, "presentation.pptx"));
const previewDir = path.join(projectDir, "preview");
const qaPath = path.join(projectDir, "qa-report.json");

function resolveVersionedOutputPath(requestedPath) {
  if (!fs.existsSync(requestedPath)) return requestedPath;
  const extension = path.extname(requestedPath);
  const requestedStem = path.basename(requestedPath, extension);
  const versionMatch = requestedStem.match(/^(.*)-v(\d+)$/i);
  const baseStem = versionMatch?.[1] || requestedStem;
  let version = versionMatch ? Math.max(2, Number(versionMatch[2]) + 1) : 2;
  while (true) {
    const candidate = path.join(path.dirname(requestedPath), `${baseStem}-v${version}${extension}`);
    if (!fs.existsSync(candidate)) return candidate;
    version += 1;
  }
}

const { PptxGenJS } = loadPresentationRuntime(import.meta.url);
const deck = JSON.parse(await fsp.readFile(deckPath, "utf8"));
const slides = Array.isArray(deck.slides) ? deck.slides : [];
const language = String(deck.language || "auto");
const fallbackFonts = resolvePlatformFonts(language);
const theme = {
  heading: String(deck.style?.fontHeading || fallbackFonts.heading),
  body: String(deck.style?.fontBody || fallbackFonts.body),
  accent: color(deck.style?.accent, "2F6BFF"),
  bg: color(deck.style?.background, "0B1020"),
  fg: color(deck.style?.foreground, "FFFFFF"),
};

const report = {
  projectDir,
  output: outputPath,
  slideCount: slides.length,
  renderedSlideCount: 0,
  renderer: null,
  errors: [],
  warnings: [],
  generatedAt: new Date().toISOString(),
};

if (slides.length < 4) report.errors.push("A visual deck needs at least four slides.");
if (slides.length > 30) report.errors.push("Slide count exceeds the supported maximum of 30.");

const pptx = new PptxGenJS();
pptx.layout = "LAYOUT_WIDE";
pptx.author = "NeoWorker";
pptx.company = "NeoWorker";
pptx.subject = String(deck.purpose || deck.title || "Visual presentation");
pptx.title = String(deck.title || "Visual presentation");
pptx.lang = language.startsWith("zh") || language === "chinese" ? "zh-CN" : "en-US";
pptx.theme = {
  headFontFace: theme.heading,
  bodyFontFace: theme.body,
  lang: pptx.lang,
};

slides.forEach((model, index) => {
  validateSlide(model, index, report);
  renderSlide(pptx, model, index, projectDir, theme, report);
});

if (report.errors.length > 0) {
  await fsp.writeFile(qaPath, JSON.stringify(report, null, 2));
  console.error(`[visual-presentation] QA failed: ${report.errors.join(" | ")}`);
  process.exit(1);
}

await fsp.mkdir(outputDir, { recursive: true });
await fsp.mkdir(previewDir, { recursive: true });
await pptx.writeFile({ fileName: outputPath });
report.outputBytes = (await fsp.stat(outputPath)).size;
const previewFiles = await renderSlides(outputPath, previewDir, report);
report.renderedSlideCount = previewFiles.length;
if (report.renderer && previewFiles.length !== slides.length) {
  report.errors.push(
    `The renderer produced ${previewFiles.length}/${slides.length} slide images.`,
  );
}
report.status = report.warnings.length > 0 ? "passed-with-warnings" : "passed";
if (report.errors.length > 0) report.status = "failed";
await fsp.writeFile(qaPath, JSON.stringify(report, null, 2));

if (report.errors.length > 0) {
  console.error(`[visual-presentation] rendered QA failed: ${report.errors.join(" | ")}`);
  process.exit(1);
}

console.log(`[visual-presentation] wrote ${outputPath}`);
console.log(`[visual-presentation] QA: ${report.status}`);
if (report.warnings.length) console.log(`[visual-presentation] warnings: ${report.warnings.length}`);

function color(value, fallback) {
  const normalized = String(value || "").replace(/^#/, "").toUpperCase();
  return /^[0-9A-F]{6}$/.test(normalized) ? normalized : fallback;
}

function validateSlide(model, index, target) {
  const slideNumber = index + 1;
  if (!model || typeof model !== "object") {
    target.errors.push(`Slide ${slideNumber} is not an object.`);
    return;
  }
  if (!String(model.title || "").trim()) {
    target.errors.push(`Slide ${slideNumber} has no title.`);
  }
  const titleLength = String(model.title || "").length;
  if (titleLength > 80) target.warnings.push(`Slide ${slideNumber} title is long (${titleLength}).`);
  const bodyLength = (Array.isArray(model.body) ? model.body : []).join(" ").length;
  if (bodyLength > 420) target.warnings.push(`Slide ${slideNumber} body is dense (${bodyLength}).`);
}

function renderSlide(pres, model, index, root, style, target) {
  const slide = pres.addSlide();
  const tone = model.textTone === "dark" ? "dark" : "light";
  const placement = ["left", "right", "top", "bottom", "center"].includes(model.textPlacement)
    ? model.textPlacement
    : index % 2 === 0 ? "left" : "right";
  const fg = tone === "light" ? "FFFFFF" : "101828";
  const muted = tone === "light" ? "E8ECF5" : "475467";
  const panelColor = tone === "light" ? "08101F" : "FFFFFF";

  slide.background = { color: tone === "light" ? style.bg : "F4F6FA" };
  const imageName = String(model.image || "").trim();
  const imagePath = imageName ? path.resolve(root, "images", imageName) : "";
  if (imagePath && fs.existsSync(imagePath)) {
    slide.addImage({ path: imagePath, x: 0, y: 0, w: 13.333, h: 7.5 });
  } else {
    target.warnings.push(`Slide ${index + 1} has no generated image: ${imageName || "unset"}.`);
    addFallbackArtwork(slide, pres, index, style);
  }

  const box = textBoxFor(placement, model.type);
  slide.addShape(pres.ShapeType.roundRect, {
    x: box.x,
    y: box.y,
    w: box.w,
    h: box.h,
    rectRadius: 0.06,
    fill: { color: panelColor, transparency: tone === "light" ? 18 : 10 },
    line: { color: panelColor, transparency: 100 },
    shadow: { type: "outer", color: "000000", opacity: 0.16, blur: 2, angle: 45, distance: 1 },
  });

  const padX = 0.34;
  const contentX = box.x + padX;
  const contentW = box.w - padX * 2;
  let cursorY = box.y + 0.28;

  const kicker = String(model.kicker || sectionLabel(model.type, index)).trim();
  if (kicker) {
    slide.addText(kicker.toUpperCase(), {
      x: contentX,
      y: cursorY,
      w: contentW,
      h: 0.2,
      fontFace: style.body,
      fontSize: 8.5,
      bold: true,
      color: style.accent,
      charSpacing: 1.3,
      margin: 0,
      breakLine: false,
    });
    cursorY += 0.34;
  }

  const titleSize = model.type === "statement" ? 31 : model.type === "cover" ? 30 : 24;
  const titleHeight = model.type === "statement" || model.type === "cover" ? 1.25 : 0.82;
  slide.addText(String(model.title || ""), {
    x: contentX,
    y: cursorY,
    w: contentW,
    h: titleHeight,
    fontFace: style.heading,
    fontSize: titleSize,
    bold: true,
    color: fg,
    margin: 0,
    breakLine: false,
    fit: "shrink",
    valign: "mid",
  });
  cursorY += titleHeight + 0.12;

  if (model.subtitle) {
    slide.addText(String(model.subtitle), {
      x: contentX,
      y: cursorY,
      w: contentW,
      h: 0.52,
      fontFace: style.body,
      fontSize: 14,
      color: muted,
      margin: 0,
      breakLine: false,
      fit: "shrink",
    });
    cursorY += 0.64;
  }

  if (Array.isArray(model.metrics) && model.metrics.length > 0) {
    const count = Math.min(model.metrics.length, 4);
    const metricW = (contentW - (count - 1) * 0.16) / count;
    model.metrics.slice(0, count).forEach((metric, metricIndex) => {
      const x = contentX + metricIndex * (metricW + 0.16);
      slide.addText(String(metric?.value || ""), {
        x, y: cursorY, w: metricW, h: 0.48,
        fontFace: style.heading, fontSize: 22, bold: true,
        color: fg, margin: 0, fit: "shrink",
      });
      slide.addText(String(metric?.label || ""), {
        x, y: cursorY + 0.46, w: metricW, h: 0.34,
        fontFace: style.body, fontSize: 9.5,
        color: muted, margin: 0, fit: "shrink",
      });
    });
    cursorY += 0.95;
  }

  const body = Array.isArray(model.body) ? model.body.filter(Boolean).slice(0, 5) : [];
  if (body.length > 0) {
    slide.addText(
      body.map((text) => ({
        text: String(text),
        options: { bullet: { indent: 13 }, hanging: 3, breakLine: true },
      })),
      {
        x: contentX,
        y: cursorY,
        w: contentW,
        h: Math.max(0.65, box.y + box.h - cursorY - 0.34),
        fontFace: style.body,
        fontSize: 12.5,
        color: fg,
        margin: 0,
        breakLine: false,
        fit: "shrink",
        paraSpaceAfterPt: 8,
      },
    );
  }

  if (model.source) {
    slide.addText(String(model.source), {
      x: 0.42, y: 7.12, w: 11.4, h: 0.15,
      fontFace: style.body, fontSize: 7.5,
      color: tone === "light" ? "D0D5DD" : "667085",
      margin: 0, fit: "shrink",
    });
  }
  slide.addText(String(index + 1).padStart(2, "0"), {
    x: 12.26, y: 7.08, w: 0.48, h: 0.16,
    fontFace: style.body, fontSize: 8, bold: true,
    color: tone === "light" ? "FFFFFF" : "344054",
    align: "right", margin: 0,
  });
}

function textBoxFor(placement, type) {
  if (type === "cover" && placement === "right") return { x: 6.55, y: 1.05, w: 5.9, h: 4.85 };
  if (type === "cover") return { x: 0.72, y: 1.05, w: 6.0, h: 4.85 };
  if (placement === "right") return { x: 7.05, y: 0.68, w: 5.55, h: 5.92 };
  if (placement === "top") return { x: 0.65, y: 0.48, w: 12.03, h: 2.65 };
  if (placement === "bottom") return { x: 0.65, y: 4.18, w: 12.03, h: 2.62 };
  if (placement === "center") return { x: 2.18, y: 1.35, w: 8.98, h: 4.72 };
  return { x: 0.72, y: 0.68, w: 5.55, h: 5.92 };
}

function sectionLabel(type, index) {
  if (type === "cover") return "PRESENTATION";
  if (type === "closing") return "NEXT STEP";
  if (type === "metrics") return "KEY NUMBERS";
  if (type === "quote") return "PERSPECTIVE";
  if (type === "section") return `SECTION ${String(index + 1).padStart(2, "0")}`;
  return "INSIGHT";
}

function addFallbackArtwork(slide, pres, index, style) {
  slide.background = { color: index % 2 === 0 ? style.bg : "F0F4FF" };
  slide.addShape(pres.ShapeType.arc, {
    x: index % 2 === 0 ? 8.2 : -0.8,
    y: -0.85,
    w: 5.7,
    h: 5.7,
    adjustPoint: 0.24,
    rotate: 18 + index * 7,
    fill: { color: style.accent, transparency: 22 },
    line: { color: style.accent, transparency: 70, width: 1.2 },
  });
  slide.addShape(pres.ShapeType.ellipse, {
    x: index % 2 === 0 ? 9.6 : 1.1,
    y: 4.7,
    w: 2.1,
    h: 2.1,
    fill: { color: index % 2 === 0 ? "7C3AED" : "12B76A", transparency: 15 },
    line: { color: "FFFFFF", transparency: 100 },
  });
}

async function renderSlides(pptxPath, targetDir, target) {
  const libreOffice = resolveLibreOffice();
  const pdftoppm = which("pdftoppm");
  if (!libreOffice || !pdftoppm) {
    target.warnings.push(
      "Rendered-slide QA was skipped because LibreOffice and pdftoppm are not both available.",
    );
    return [];
  }

  let tempDir;
  try {
    const oldEntries = await fsp.readdir(targetDir).catch(() => []);
    await Promise.all(
      oldEntries
        .filter((entry) => /^slide-\d+\.png$/i.test(entry))
        .map((entry) => fsp.rm(path.join(targetDir, entry), { force: true })),
    );
    tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), "neoworker-visual-ppt-qa-"));
    const fontEnvironment = await createPresentationFontEnvironment(tempDir);
    const profileDir = path.join(tempDir, "libreoffice-profile");
    await fsp.mkdir(profileDir, { recursive: true });
    await execFileAsync(
      libreOffice,
      [
        `-env:UserInstallation=${pathToFileURL(profileDir).href}`,
        "--headless",
        "--convert-to",
        "pdf",
        "--outdir",
        tempDir,
        pptxPath,
      ],
      { timeout: 90_000, maxBuffer: 8 * 1024 * 1024, env: fontEnvironment },
    );
    const pdfName = (await fsp.readdir(tempDir)).find((entry) => entry.endsWith(".pdf"));
    if (!pdfName) throw new Error("LibreOffice did not produce a PDF.");
    await execFileAsync(
      pdftoppm,
      [
        "-png",
        "-scale-to-x",
        "1600",
        "-scale-to-y",
        "-1",
        path.join(tempDir, pdfName),
        path.join(targetDir, "slide"),
      ],
      { timeout: 90_000, maxBuffer: 8 * 1024 * 1024 },
    );
    target.renderer = "libreoffice+pdftoppm";
    return (await fsp.readdir(targetDir))
      .filter((entry) => /^slide-\d+\.png$/i.test(entry))
      .sort((left, right) => Number(left.match(/\d+/)?.[0]) - Number(right.match(/\d+/)?.[0]));
  } catch (error) {
    target.warnings.push(
      `Rendered-slide QA failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return [];
  } finally {
    if (tempDir) await fsp.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}
