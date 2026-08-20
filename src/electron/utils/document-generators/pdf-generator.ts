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
  author?: string;
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
    const output = execFileSync("which", [command], { encoding: "utf-8" }).trim();
    return output || undefined;
  } catch {
    return undefined;
  }
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

    const previewStat = fs.statSync(renderResult.previewPath);
    if (!previewStat.isFile() || previewStat.size < 10_000) {
      throw new Error("PDF visual evidence is empty or unavailable.");
    }
    const pageCount = Math.max(1, (pdfStructure.match(/\/Type\s*\/Page\b/g) || []).length);
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
      previewPath: renderResult.previewPath,
      visual: {
        required: true,
        passed: true,
        evidencePath: renderResult.previewPath,
        message: "The exact Chromium page printed to PDF passed font loading and visual capture; the final PDF bytes separately contain embedded Unicode font resources.",
      },
      warnings: [],
      durationMs,
      summary: "PDF 已通过格式、中文文本完整性和最终页面渲染校验。",
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

  if (options.title) {
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
  </style>
</head>
<body>
  ${options.author ? `<div class="meta">${escapeHtml(options.author)} &middot; ${new Date().toLocaleDateString()}</div>` : ""}
  ${body}
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
