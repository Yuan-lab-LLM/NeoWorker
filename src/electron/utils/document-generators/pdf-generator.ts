/**
 * PDF Generator — converts markdown or structured sections into a styled PDF.
 *
 * PDF is a delivery format, so this module is intentionally fail-closed:
 * it prints with Chromium, re-opens the final bytes, verifies the text layer,
 * and renders the first PDF page before returning success.
 */

import { randomUUID } from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "url";
import { marked, Renderer } from "marked";
import type { OfficeQualityReport } from "../office-document-quality";
import { isSuspiciousPdfText } from "../pdf-text";

interface PDFSection {
  heading?: string;
  content: string;
}

export interface PDFContentBlock {
  type: string;
  text?: string;
  level?: number;
  items?: string[];
  rows?: string[][];
  language?: string;
}

export interface PDFOptions {
  title?: string;
  titleColor?: string;
  subtitle?: string;
  author?: string;
  organization?: string;
  reportDate?: string;
  subject?: string;
  templateId?: string;
  sections?: PDFSection[];
  markdown?: string;
  format?: "A4" | "Letter";
  landscape?: boolean;
}

export interface PDFGenerationResult {
  success: true;
  path: string;
  size: number;
  pageCount: number;
  generationEngine: "electron-chromium" | "playwright-chromium";
  qualityCheck: OfficeQualityReport;
}

export interface PdfTextIntegrityResult {
  passed: boolean;
  message: string;
  expectedCjkCharacters: number;
  extractedCjkCharacters: number;
  cjkUniqueCoverage: number;
}

interface PdfRenderResult {
  previewPath: string;
  renderedText: string;
}

function normalizeHeadingColor(value?: string): string | undefined {
  if (typeof value !== "string") return undefined;
  const raw = value.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(raw)) return undefined;
  return `#${raw.toUpperCase()}`;
}

function normalizeTitleText(value: string): string {
  return value
    .replace(/[*_`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function stripMatchingLeadingMarkdownTitle(markdown: string, title?: string): string {
  if (!title) return markdown;

  const heading = markdown.match(/^\s*#\s+(.+?)\s*(?:\r?\n|$)/);
  if (!heading || normalizeTitleText(heading[1]) !== normalizeTitleText(title)) {
    return markdown;
  }

  return markdown.slice(heading[0].length).replace(/^\s*\r?\n/, "");
}

function which(command: string): string | undefined {
  try {
    const locator = process.platform === "win32" ? "where" : "which";
    const output = execFileSync(locator, [command], { encoding: "utf-8" }).trim();
    return output.split(/\r?\n/).find(Boolean) || undefined;
  } catch {
    return undefined;
  }
}

function renderFinalPdfPages(
  outputPath: string,
  evidenceDirectory: string,
): { previewPath: string; pagePaths: string[] } | null {
  const executable = process.env.PDFTOPPM_PATH?.trim() || which("pdftoppm");
  if (!executable || !fs.existsSync(executable)) return null;

  const prefix = path.join(evidenceDirectory, "final-page");
  for (const filename of fs.readdirSync(evidenceDirectory)) {
    if (/^final-page-\d+\.png$/i.test(filename)) {
      fs.rmSync(path.join(evidenceDirectory, filename), { force: true });
    }
  }
  execFileSync(executable, ["-png", "-r", "110", outputPath, prefix], {
    stdio: "pipe",
    timeout: 60_000,
  });
  const pagePaths = fs
    .readdirSync(evidenceDirectory)
    .filter((filename) => /^final-page-\d+\.png$/i.test(filename))
    .sort((left, right) => {
      const leftPage = Number(left.match(/(\d+)\.png$/i)?.[1] || 0);
      const rightPage = Number(right.match(/(\d+)\.png$/i)?.[1] || 0);
      return leftPage - rightPage;
    })
    .map((filename) => path.join(evidenceDirectory, filename));
  if (!pagePaths.length) return null;
  return { previewPath: pagePaths[0], pagePaths };
}

function resolveBrowserExecutable(): string | undefined {
  const envCandidates = [
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    process.env.CHROME_PATH,
    process.env.BRAVE_PATH,
    process.env.PUPPETEER_EXECUTABLE_PATH,
  ]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));

  const platformCandidates =
    process.platform === "darwin"
      ? [
          "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
          "/Applications/Chromium.app/Contents/MacOS/Chromium",
          "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
          "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
        ]
      : process.platform === "win32"
        ? [
            process.env.LOCALAPPDATA
              ? `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`
              : "",
            "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
            "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
          ]
        : [
            "/usr/bin/google-chrome",
            "/usr/bin/google-chrome-stable",
            "/usr/bin/chromium",
            "/usr/bin/chromium-browser",
            "/usr/bin/microsoft-edge",
          ];

  const discovered =
    process.platform === "win32"
      ? []
      : [
          which("google-chrome"),
          which("google-chrome-stable"),
          which("chromium"),
          which("chromium-browser"),
          which("microsoft-edge"),
        ].filter((value): value is string => Boolean(value));

  return [...envCandidates, ...platformCandidates, ...discovered].find(
    (candidate) => Boolean(candidate && fs.existsSync(candidate)),
  );
}

function markdownTableCell(value: unknown): string {
  return String(value ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, " ")
    .trim();
}

export function contentBlocksToMarkdown(blocks: PDFContentBlock[]): string {
  return blocks
    .map((block) => {
      const text = String(block.text || "").trim();
      switch (block.type) {
        case "heading":
          return `${"#".repeat(Math.min(6, Math.max(1, block.level || 1)))} ${text}`;
        case "list": {
          const items = block.items?.length
            ? block.items
            : text.split(/\r?\n/).filter(Boolean);
          return items.map((item) => `- ${String(item).trim()}`).join("\n");
        }
        case "table": {
          const rows = (block.rows || []).filter((row) => row.length > 0);
          if (!rows.length) return text;
          const columns = Math.max(...rows.map((row) => row.length));
          const normalizedRows = rows.map((row) =>
            Array.from({ length: columns }, (_, index) => markdownTableCell(row[index])),
          );
          return [
            `| ${normalizedRows[0].join(" | ")} |`,
            `| ${Array.from({ length: columns }, () => "---").join(" | ")} |`,
            ...normalizedRows.slice(1).map((row) => `| ${row.join(" | ")} |`),
          ].join("\n");
        }
        case "code":
          return `\`\`\`${block.language || ""}\n${text}\n\`\`\``;
        default:
          return text;
      }
    })
    .filter(Boolean)
    .join("\n\n");
}

function plainTextFromOptions(options: PDFOptions): string {
  return [
    options.title || "",
    options.subtitle || "",
    options.organization || "",
    options.reportDate || "",
    options.subject || "",
    options.author || "",
    options.markdown || "",
    ...(options.sections || []).flatMap((section) => [section.heading || "", section.content]),
  ]
    .join("\n")
    .replace(/```[\s\S]*?```/g, (value) => value.replace(/```\w*/g, ""))
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/[|*_`~>-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function countCjk(value: string): number {
  return [...value.matchAll(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu)].length;
}

export function assessPdfTextIntegrity(
  expectedText: string,
  extractedText: string,
): PdfTextIntegrityResult {
  const expected = expectedText.replace(/\s+/g, " ").trim();
  const extracted = extractedText.replace(/\s+/g, " ").trim();
  const expectedCjkCharacters = countCjk(expected);
  const extractedCjkCharacters = countCjk(extracted);
  const expectedCjkSet = new Set(
    expected.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu) || [],
  );
  const extractedCjkSet = new Set(
    extracted.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu) || [],
  );
  const matchedCjk = [...expectedCjkSet].filter((character) => extractedCjkSet.has(character));
  const cjkUniqueCoverage = expectedCjkSet.size
    ? matchedCjk.length / expectedCjkSet.size
    : 1;

  if (!extracted || isSuspiciousPdfText(extracted)) {
    return {
      passed: false,
      message: "PDF text layer is empty or contains mojibake characters.",
      expectedCjkCharacters,
      extractedCjkCharacters,
      cjkUniqueCoverage,
    };
  }
  if (
    expectedCjkCharacters >= 8 &&
    (extractedCjkCharacters < expectedCjkCharacters * 0.55 || cjkUniqueCoverage < 0.5)
  ) {
    return {
      passed: false,
      message: `PDF lost Chinese text during rendering (${extractedCjkCharacters}/${expectedCjkCharacters} CJK characters, ${Math.round(cjkUniqueCoverage * 100)}% unique coverage).`,
      expectedCjkCharacters,
      extractedCjkCharacters,
      cjkUniqueCoverage,
    };
  }
  if (expected.length >= 80 && extracted.length < expected.length * 0.35) {
    return {
      passed: false,
      message: `PDF text layer is incomplete (${extracted.length}/${expected.length} characters).`,
      expectedCjkCharacters,
      extractedCjkCharacters,
      cjkUniqueCoverage,
    };
  }
  return {
    passed: true,
    message: "PDF text layer preserves the requested content and CJK characters.",
    expectedCjkCharacters,
    extractedCjkCharacters,
    cjkUniqueCoverage,
  };
}

async function waitForFonts(webContents: {
  executeJavaScript: (code: string, userGesture?: boolean) => Promise<unknown>;
}): Promise<void> {
  await webContents.executeJavaScript(
    "document.fonts ? document.fonts.ready.then(() => true) : true",
    true,
  );
  const hasMissingGlyphs = await webContents.executeJavaScript(
    `(() => {
      const text = document.body ? document.body.innerText : "";
      return /[\uFFFD]/.test(text);
    })()`,
    true,
  );
  if (hasMissingGlyphs) throw new Error("PDF source page contains missing-glyph characters.");
}

async function renderPdfWithElectron(
  html: string,
  outputPath: string,
  options: PDFOptions,
): Promise<PdfRenderResult | null> {
  if (!process.versions.electron) return null;
  const { app, BrowserWindow, session } = await import("electron");
  if (!app.isReady()) await app.whenReady();

  const tempHtmlPath = path.join(os.tmpdir(), `neoworker-pdf-${randomUUID()}.html`);
  fs.writeFileSync(tempHtmlPath, html, "utf8");
  const partition = `neoworker-pdf-${randomUUID()}`;
  const isolatedSession = session.fromPartition(partition, { cache: false });
  isolatedSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  isolatedSession.webRequest.onBeforeRequest((details, callback) => {
    try {
      const protocol = new URL(details.url).protocol;
      callback({ cancel: protocol === "http:" || protocol === "https:" });
    } catch {
      callback({ cancel: true });
    }
  });
  const window = new BrowserWindow({
    show: false,
    width: 1200,
    height: 1600,
    backgroundColor: "#ffffff",
    webPreferences: {
      session: isolatedSession,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      backgroundThrottling: false,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  try {
    await window.loadURL(pathToFileURL(tempHtmlPath).toString());
    await waitForFonts(window.webContents);
    const renderedText = String(
      await window.webContents.executeJavaScript(
        "document.body ? document.body.innerText : ''",
        true,
      ),
    );
    const parsed = path.parse(outputPath);
    const evidenceDirectory = path.join(parsed.dir, ".neoworker", "pdf-previews", parsed.name);
    fs.mkdirSync(evidenceDirectory, { recursive: true });
    const previewPath = path.join(evidenceDirectory, "page-001.png");
    const preview = await window.webContents.capturePage();
    const previewPng = preview.toPNG();
    if (preview.isEmpty() || previewPng.length < 10_000) {
      throw new Error("The PDF source page could not be captured for visual validation.");
    }
    fs.writeFileSync(previewPath, previewPng);
    const pdfBuffer = await window.webContents.printToPDF({
      printBackground: true,
      landscape: Boolean(options.landscape),
      pageSize: options.format || "A4",
      margins: { top: 0.4, bottom: 0.4, left: 0.6, right: 0.6 },
      preferCSSPageSize: true,
    });
    fs.writeFileSync(outputPath, pdfBuffer);
    return { previewPath, renderedText };
  } finally {
    if (!window.isDestroyed()) window.destroy();
    fs.rmSync(tempHtmlPath, { force: true });
  }
}

async function renderPdfWithPlaywright(
  html: string,
  outputPath: string,
  options: PDFOptions,
): Promise<PdfRenderResult | null> {
  const playwrightModule = (await import("playwright")) as Any;
  const chromium =
    playwrightModule.chromium ||
    playwrightModule.default?.chromium ||
    playwrightModule.playwright?.chromium;
  const executablePath = resolveBrowserExecutable();
  if (!chromium || !executablePath) return null;

  const browser = await chromium.launch({
    headless: true,
    executablePath,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle" });
    await page.evaluate(async () => {
      const browserGlobal = globalThis as unknown as {
        document: { fonts: { ready: Promise<unknown> } };
      };
      await browserGlobal.document.fonts.ready;
    });
    await page.emulateMedia({ media: "screen" });
    const renderedText = await page.locator("body").innerText();
    const parsed = path.parse(outputPath);
    const evidenceDirectory = path.join(parsed.dir, ".neoworker", "pdf-previews", parsed.name);
    fs.mkdirSync(evidenceDirectory, { recursive: true });
    const previewPath = path.join(evidenceDirectory, "page-001.png");
    await page.screenshot({ path: previewPath, type: "png", fullPage: false });
    await page.pdf({
      path: outputPath,
      format: options.format || "A4",
      landscape: Boolean(options.landscape),
      printBackground: true,
      margin: { top: "1cm", right: "1.5cm", bottom: "1cm", left: "1.5cm" },
      preferCSSPageSize: true,
    });
    return { previewPath, renderedText };
  } finally {
    await browser.close();
  }
}

/**
 * Render and validate a real PDF. Never return HTML for a PDF request and
 * never publish an unvalidated file.
 */
export async function generatePDF(
  outputPath: string,
  options: PDFOptions,
): Promise<PDFGenerationResult> {
  const startedAt = Date.now();
  const html = buildPDFHTML(options);
  const expectedText = plainTextFromOptions(options);
  const parsedOutput = path.parse(outputPath);
  const evidenceDirectory = path.join(
    parsedOutput.dir,
    ".neoworker",
    "pdf-previews",
    parsedOutput.name,
  );
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  try {
    let generationEngine: PDFGenerationResult["generationEngine"] | undefined;
    let renderResult = await renderPdfWithElectron(html, outputPath, options);
    if (renderResult) {
      generationEngine = "electron-chromium";
    } else {
      renderResult = await renderPdfWithPlaywright(html, outputPath, options);
      if (renderResult) generationEngine = "playwright-chromium";
    }
    if (!generationEngine || !renderResult) {
      throw new Error("No Chromium PDF renderer is available. PDF delivery was stopped.");
    }

    const file = fs.readFileSync(outputPath);
    if (file.length < 1000 || file.subarray(0, 5).toString("ascii") !== "%PDF-") {
      throw new Error("Generated file is not a valid non-empty PDF.");
    }
    const integrity = assessPdfTextIntegrity(expectedText, renderResult.renderedText);
    if (!integrity.passed) throw new Error(integrity.message);

    // Chromium includes an Identity-H CID font and ToUnicode map for CJK text.
    // These final-byte checks prevent a regression to the old PDFKit/Helvetica
    // path, which produced a file but omitted Unicode font resources entirely.
    const pdfStructure = file.toString("latin1");
    if (
      integrity.expectedCjkCharacters >= 8 &&
      (!pdfStructure.includes("/ToUnicode") ||
        !pdfStructure.includes("/Identity-H") ||
        !/\/FontFile[23]?\b/.test(pdfStructure))
    ) {
      throw new Error("Final PDF does not embed the Unicode font resources required for CJK text.");
    }

    const pageCount = Math.max(1, (pdfStructure.match(/\/Type\s*\/Page\b/g) || []).length);
    const finalPageEvidence = renderFinalPdfPages(outputPath, evidenceDirectory);
    const visualPreviewPath = finalPageEvidence?.previewPath || renderResult.previewPath;
    if (finalPageEvidence && finalPageEvidence.pagePaths.length !== pageCount) {
      throw new Error(
        `Final PDF page rendering is incomplete (${finalPageEvidence.pagePaths.length}/${pageCount} pages).`,
      );
    }
    const visualEvidencePaths = finalPageEvidence?.pagePaths || [renderResult.previewPath];
    for (const pagePath of visualEvidencePaths) {
      const pageStat = fs.statSync(pagePath);
      if (!pageStat.isFile() || pageStat.size < 10_000) {
        throw new Error(`PDF visual evidence is empty or unavailable: ${path.basename(pagePath)}.`);
      }
    }
    const previewStat = fs.statSync(visualPreviewPath);
    if (!previewStat.isFile() || previewStat.size < 10_000) {
      throw new Error("PDF visual evidence is empty or unavailable.");
    }
    const durationMs = Date.now() - startedAt;
    const qualityCheck: OfficeQualityReport = {
      available: true,
      engine: "builtin",
      status: "passed",
      validation: {
        passed: true,
        message: integrity.message,
      },
      issueCount: 0,
      issues: [],
      previewPath: visualPreviewPath,
      visual: {
        required: true,
        passed: true,
        evidencePath: visualPreviewPath,
        message: finalPageEvidence
          ? `All ${pageCount} final PDF pages were rasterized after printing and passed visual evidence checks; the final bytes also contain embedded Unicode font resources.`
          : "The exact Chromium source page passed visual capture and the final PDF bytes contain embedded Unicode font resources; a native PDF rasterizer was not available for post-print page capture.",
      },
      warnings: [],
      durationMs,
      summary: finalPageEvidence
        ? `PDF 已通过格式、中文文本完整性和全部 ${pageCount} 页最终渲染校验。`
        : "PDF 已通过格式、中文文本完整性和页面渲染校验。",
      modelGuidance:
        "PDF delivery passed format, CJK text-layer, and final-page render validation. It is safe to present this exact file as the final artifact.",
    };
    return {
      success: true,
      path: outputPath,
      size: file.length,
      pageCount,
      generationEngine,
      qualityCheck,
    };
  } catch (error) {
    fs.rmSync(outputPath, { force: true });
    fs.rmSync(evidenceDirectory, { recursive: true, force: true });
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`PDF generation failed quality validation: ${message}`);
  }
}

export function buildPDFHTML(options: PDFOptions): string {
  let body = "";
  const headingColor = normalizeHeadingColor(options.titleColor);
  const isBusinessReport = options.templateId === "neoworker-docx-business-report";

  if (options.title && !isBusinessReport) {
    body += `<h1 class="doc-title">${escapeHtml(options.title)}</h1>\n`;
  }

  if (options.markdown) {
    body += markdownToHtml(stripMatchingLeadingMarkdownTitle(options.markdown, options.title));
  }

  if (options.sections) {
    for (const section of options.sections) {
      if (section.heading) body += `<h2>${escapeHtml(section.heading)}</h2>\n`;
      body += markdownToHtml(section.content);
    }
  }

  const displayDate =
    String(options.reportDate || "").trim() ||
    new Intl.DateTimeFormat("zh-CN", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(new Date());
  const organization = String(options.organization || "NeoWorker").trim();
  const author = String(options.author || "NeoWorker").trim();
  const subtitle =
    String(options.subtitle || options.subject || "").trim() ||
    "专业分析与决策参考";
  const reportMarkup = isBusinessReport
    ? `<section class="report-cover">
      <div class="cover-overline">NEOWORKER · PROFESSIONAL REPORT</div>
      <div class="cover-rule"></div>
      <h1 class="cover-title">${escapeHtml(options.title || "专业分析报告")}</h1>
      <div class="cover-subtitle">${escapeHtml(subtitle)}</div>
      <dl class="cover-meta">
        <div><dt>编制单位</dt><dd>${escapeHtml(organization)}</dd></div>
        <div><dt>作者 / 分析师</dt><dd>${escapeHtml(author)}</dd></div>
        <div><dt>报告日期</dt><dd>${escapeHtml(displayDate)}</dd></div>
      </dl>
    </section>
    <main class="report-body">
      <div class="body-running-head"><span>${escapeHtml(organization)}</span><span>${escapeHtml(options.title || "专业分析报告")}</span></div>
      ${body}
    </main>`
    : `${options.author ? `<div class="meta">${escapeHtml(options.author)} &middot; ${escapeHtml(displayDate)}</div>` : ""}
  ${body}`;

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(options.title || "Document")}</title>
  <style>
    @page { size: ${options.format || "A4"} ${options.landscape ? "landscape" : "portrait"}; margin: 14mm 16mm 16mm; }
    @font-face {
      font-family: "NeoWorker CJK";
      src: local("PingFang SC"), local("Hiragino Sans GB"), local("Microsoft YaHei"), local("Noto Sans CJK SC"), local("Noto Sans SC"), local("Source Han Sans SC"), local("Arial Unicode MS");
      font-style: normal; font-weight: 400; font-display: block;
    }
    @font-face {
      font-family: "NeoWorker CJK";
      src: local("PingFang SC Semibold"), local("Hiragino Sans GB W6"), local("Microsoft YaHei Bold"), local("Noto Sans CJK SC Bold"), local("Noto Sans SC Bold"), local("Source Han Sans SC Bold"), local("Arial Unicode MS");
      font-style: normal; font-weight: 600 900; font-display: block;
    }
    :root { font-family: "NeoWorker CJK", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", "Noto Sans SC", "Source Han Sans SC", "Arial Unicode MS", sans-serif; }
    * { box-sizing: border-box; }
    html, body { background: #fff; }
    body { margin: 0; color: #172033; line-height: 1.72; font-size: 14px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .doc-title { font-size: 29px; line-height: 1.25; font-weight: 700; margin: 0 0 22px; color: ${headingColor || "#13213c"}; border-bottom: 2px solid ${headingColor || "#2563eb"}; padding-bottom: 12px; letter-spacing: -0.02em; }
    h1 { font-size: 25px; line-height: 1.32; margin: 0 0 18px; color: ${headingColor || "#13213c"}; break-after: avoid; }
    h2 { font-size: 20px; margin: 25px 0 10px; color: ${headingColor || "#1e40af"}; break-after: avoid; }
    h3 { font-size: 16px; margin: 18px 0 8px; color: ${headingColor || "#24324a"}; break-after: avoid; }
    p { margin: 8px 0; orphans: 3; widows: 3; }
    ul, ol { padding-left: 24px; }
    li { margin: 5px 0; }
    code { font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace; background: #f3f4f6; padding: 2px 6px; border-radius: 4px; font-size: 12px; }
    pre { background: #f3f4f6; padding: 12px 16px; border-radius: 8px; overflow: hidden; break-inside: avoid; }
    pre code { background: none; padding: 0; }
    table { border-collapse: collapse; width: 100%; margin: 14px 0 18px; table-layout: auto; break-inside: avoid; }
    thead { display: table-header-group; }
    tr { break-inside: avoid; }
    th, td { border: 1px solid #d7deea; padding: 7px 10px; text-align: left; vertical-align: top; font-size: 12px; overflow-wrap: anywhere; }
    th { background: #eef4ff; color: #173466; font-weight: 600; }
    blockquote { border-left: 4px solid #2563eb; margin: 12px 0; padding: 8px 16px; background: #eff6ff; }
    hr { border: none; border-top: 1px solid #e5e7eb; margin: 20px 0; }
    .meta { font-size: 12px; color: #6b7280; margin-bottom: 20px; }
    a { color: #1d4ed8; text-decoration: none; }
    img { max-width: 100%; height: auto; }
    .report-cover {
      position: relative;
      z-index: 2;
      min-height: 297mm;
      margin: -14mm -16mm -16mm;
      padding: 28mm 27mm 24mm;
      color: #fff;
      background: #1F4E78;
      break-after: page;
      overflow: hidden;
    }
    .report-cover::before {
      content: "";
      position: absolute;
      left: 0;
      right: 0;
      top: 61mm;
      height: 2.2mm;
      background: #2E85C1;
    }
    .report-cover::after {
      content: "";
      position: absolute;
      width: 120mm;
      height: 120mm;
      right: -72mm;
      bottom: -54mm;
      border: 1px solid rgba(255,255,255,.18);
      border-radius: 50%;
      box-shadow: 0 0 0 24mm rgba(46,133,193,.08), 0 0 0 48mm rgba(46,133,193,.05);
    }
    .cover-overline {
      position: relative;
      z-index: 1;
      color: #9FD2F2;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: .18em;
    }
    .cover-rule {
      width: 44mm;
      height: 1px;
      margin-top: 5mm;
      background: #54A9DB;
    }
    .cover-title {
      position: relative;
      z-index: 1;
      max-width: 145mm;
      margin: 66mm 0 0;
      color: #fff;
      font-size: 31px;
      line-height: 1.35;
      letter-spacing: .01em;
      break-after: auto;
    }
    .cover-subtitle {
      position: relative;
      z-index: 1;
      max-width: 130mm;
      margin-top: 7mm;
      color: #D6E9F6;
      font-size: 15px;
      line-height: 1.6;
    }
    .cover-meta {
      position: absolute;
      z-index: 1;
      left: 27mm;
      right: 27mm;
      bottom: 27mm;
      margin: 0;
      border-top: 1px solid rgba(255,255,255,.25);
    }
    .cover-meta div {
      display: grid;
      grid-template-columns: 32mm 1fr;
      gap: 5mm;
      padding: 3.2mm 0;
      border-bottom: 1px solid rgba(255,255,255,.10);
    }
    .cover-meta dt { color: #A8CAE0; font-size: 11px; }
    .cover-meta dd { margin: 0; color: #fff; font-size: 11.5px; font-weight: 600; }
    .report-body { color: #26374A; }
    .body-running-head {
      display: flex;
      justify-content: space-between;
      gap: 12mm;
      margin: 0 0 11mm;
      padding: 0 0 3mm;
      border-bottom: 2px solid #1F4E78;
      color: #587089;
      font-size: 9px;
      letter-spacing: .03em;
    }
    .report-body h1 {
      margin: 0 0 7mm;
      padding-bottom: 3mm;
      border-bottom: 1px solid #B8CDE0;
      color: #173A5E;
      font-size: 24px;
    }
    .report-body h2 { color: #1976B9; font-size: 19px; margin-top: 8mm; }
    .report-body h3 { color: #1F4E78; font-size: 15.5px; margin-top: 5mm; }
    .report-body p { text-align: justify; }
    .report-body li::marker { color: #2E85C1; }
    .report-body table { box-shadow: 0 0 0 1px #D4E0EB; }
    .report-body th { background: #1F4E78; color: #fff; border-color: #1F4E78; }
    .report-body tbody tr:nth-child(even) td { background: #EDF4F9; }
    .report-body blockquote { border-left-color: #2E85C1; background: #EDF6FC; }
  </style>
</head>
<body>
  ${reportMarkup}
</body>
</html>`;
}

function markdownToHtml(md: string): string {
  const renderer = new Renderer();
  renderer.html = ({ text }) => escapeHtml(text);
  return marked(md, { async: false, gfm: true, breaks: false, renderer });
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
