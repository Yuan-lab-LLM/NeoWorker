import { spawn } from "node:child_process";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { chromium } from "playwright";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../..");
const targetMs = 1_500;
const maxInlineBytes = 10 * 1024 * 1024;

function parseArgs(argv) {
  const options = { runs: 12, headed: false, baseUrl: "", output: "" };
  for (const arg of argv) {
    if (arg === "--headed") options.headed = true;
    else if (arg.startsWith("--runs=")) options.runs = Math.max(3, Number.parseInt(arg.slice(7), 10) || 12);
    else if (arg.startsWith("--base-url=")) options.baseUrl = arg.slice(11).replace(/\/$/, "");
    else if (arg.startsWith("--output=")) options.output = path.resolve(repoRoot, arg.slice(9));
  }
  return options;
}

function percentile(values, ratio) {
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index] || 0;
}

async function getAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

async function waitForServer(url, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Vite is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for Vite at ${url}`);
}

async function findChromiumExecutable() {
  const candidates = [
    process.env.NEOWORKER_PDF_BENCHMARK_BROWSER,
    process.platform === "darwin" ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" : "",
    process.platform === "darwin" ? "/Applications/Chromium.app/Contents/MacOS/Chromium" : "",
    process.platform === "win32" ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" : "",
    process.platform === "linux" ? "/usr/bin/google-chrome" : "",
    process.platform === "linux" ? "/usr/bin/chromium" : "",
    chromium.executablePath(),
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      await access(candidate, fsConstants.X_OK);
      return candidate;
    } catch {
      // Try the next installed browser.
    }
  }
  throw new Error("No Chromium browser found. Set NEOWORKER_PDF_BENCHMARK_BROWSER to a Chrome/Chromium executable.");
}

function replaceStartXref(buffer, value) {
  const source = buffer.toString("latin1");
  const matches = [...source.matchAll(/startxref\s+(\d+)/g)];
  const last = matches[matches.length - 1];
  if (!last || typeof last.index !== "number") throw new Error("Generated PDF has no startxref marker");
  const numberStart = last.index + last[0].lastIndexOf(last[1]);
  return Buffer.concat([
    buffer.subarray(0, numberStart),
    Buffer.from(String(value), "latin1"),
    buffer.subarray(numberStart + last[1].length),
  ]);
}

function padPdfToExactSize(input, targetBytes) {
  const xrefMarker = Buffer.from("\nxref\n", "latin1");
  const markerIndex = input.lastIndexOf(xrefMarker);
  if (markerIndex < 0) throw new Error("Generated PDF does not use a classic xref table");
  const xrefOffset = markerIndex + 1;
  let fillerLength = Math.max(0, targetBytes - input.length - 4);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const filler = Buffer.concat([
      Buffer.from("\n%", "latin1"),
      Buffer.alloc(fillerLength, 88),
      Buffer.from("\n", "latin1"),
    ]);
    const combined = Buffer.concat([input.subarray(0, xrefOffset), filler, input.subarray(xrefOffset)]);
    const updated = replaceStartXref(combined, xrefOffset + filler.length);
    const delta = targetBytes - updated.length;
    if (delta === 0) return updated;
    fillerLength = Math.max(0, fillerLength + delta);
  }
  throw new Error(`Could not pad PDF to ${targetBytes} bytes`);
}

async function createSample(targetBytes, label) {
  const document = await PDFDocument.create();
  const page = document.addPage([612, 792]);
  const font = await document.embedFont(StandardFonts.Helvetica);
  page.drawText(`NeoWorker PDF preview benchmark · ${label}`, {
    x: 48,
    y: 724,
    size: 18,
    font,
    color: rgb(0.08, 0.24, 0.52),
  });
  page.drawText("Measures component mount to the first fully painted PDF canvas.", {
    x: 48,
    y: 690,
    size: 11,
    font,
    color: rgb(0.25, 0.29, 0.36),
  });
  const bytes = Buffer.from(await document.save({ useObjectStreams: false }));
  return padPdfToExactSize(bytes, targetBytes);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const publicTmpDir = path.join(repoRoot, "src/renderer/public/tmp");
  await mkdir(publicTmpDir, { recursive: true });
  const runDir = await mkdtemp(path.join(publicTmpDir, "pdf-preview-benchmark-"));
  const sampleSpecs = [
    { label: "1MB", bytes: 1 * 1024 * 1024 },
    { label: "5MB", bytes: 5 * 1024 * 1024 },
    { label: "10MB", bytes: maxInlineBytes },
  ];
  const samples = [];
  for (const spec of sampleSpecs) {
    const fileName = `sample-${spec.label.toLowerCase()}.pdf`;
    const bytes = await createSample(spec.bytes, spec.label);
    const filePath = path.join(runDir, fileName);
    await writeFile(filePath, bytes);
    samples.push({ ...spec, fileName, filePath });
  }

  let viteProcess = null;
  let baseUrl = options.baseUrl;
  if (!baseUrl) {
    const port = await getAvailablePort();
    baseUrl = `http://127.0.0.1:${port}`;
    viteProcess = spawn(process.execPath, [path.join(repoRoot, "node_modules/vite/bin/vite.js"), "--config", path.join(repoRoot, "config/vite.config.ts"), "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let viteError = "";
    viteProcess.stderr.on("data", (chunk) => { viteError += chunk.toString(); });
    viteProcess.on("exit", (code) => {
      if (code && code !== 0) process.stderr.write(viteError);
    });
    await waitForServer(`${baseUrl}/pdf-preview-benchmark.html`);
  }

  const executablePath = await findChromiumExecutable();
  const browser = await chromium.launch({ executablePath, headless: !options.headed });
  const results = [];
  try {
    for (const sample of samples) {
      const publicSamplePath = `/tmp/${path.basename(runDir)}/${sample.fileName}`;
      const durations = [];
      for (let run = -1; run < options.runs; run += 1) {
        const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
        const pageErrors = [];
        page.on("pageerror", (error) => pageErrors.push(error.message));
        page.on("console", (message) => {
          if (message.type() === "error") pageErrors.push(message.text());
        });
        const sampleUrl = `${publicSamplePath}?cache=${Date.now()}-${run}`;
        const fixtureUrl = `${baseUrl}/pdf-preview-benchmark.html?sample=${encodeURIComponent(sampleUrl)}&run=${run}`;
        await page.goto(fixtureUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
        try {
          await page.waitForFunction(
            () => window.__pdfPreviewBenchmark?.status === "complete" || window.__pdfPreviewBenchmark?.status === "error",
            undefined,
            { timeout: 20_000 },
          );
        } catch (error) {
          const state = await page.evaluate(() => ({
            benchmark: window.__pdfPreviewBenchmark,
            bodyText: document.body.innerText.slice(0, 500),
            canvasCount: document.querySelectorAll("canvas").length,
          }));
          throw new Error(`${sample.label} run ${run} timed out: ${JSON.stringify(state)}; page errors: ${pageErrors.join(" | ")}; ${error instanceof Error ? error.message : String(error)}`);
        }
        const measurement = await page.evaluate(() => window.__pdfPreviewBenchmark);
        await page.close();
        if (!measurement || measurement.status !== "complete") {
          throw new Error(`${sample.label} run ${run} failed: ${measurement?.error || "unknown benchmark error"}`);
        }
        if (run >= 0) durations.push(Number(measurement.durationMs));
      }
      const p50 = percentile(durations, 0.5);
      const p95 = percentile(durations, 0.95);
      const max = Math.max(...durations);
      results.push({
        label: sample.label,
        bytes: sample.bytes,
        runs: durations.length,
        p50Ms: Number(p50.toFixed(1)),
        p95Ms: Number(p95.toFixed(1)),
        maxMs: Number(max.toFixed(1)),
        targetMs,
        passed: p95 <= targetMs,
      });
    }
  } finally {
    await browser.close();
    if (viteProcess) viteProcess.kill("SIGTERM");
    await rm(runDir, { recursive: true, force: true });
  }

  const report = {
    generatedAt: new Date().toISOString(),
    benchmark: "PDFDocumentSurface first painted canvas",
    browser: executablePath,
    platform: `${process.platform}-${process.arch}`,
    target: { maxBytes: maxInlineBytes, p95Ms: targetMs },
    samples: results,
    passed: results.every((result) => result.passed),
  };
  const outputPath = options.output || path.join(repoRoot, "tmp/pdf-preview-benchmark-latest.json");
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf-8");

  process.stdout.write("PDF preview benchmark (first painted canvas)\n");
  for (const result of results) {
    process.stdout.write(`${result.label.padEnd(4)} n=${result.runs} p50=${result.p50Ms.toFixed(1)}ms p95=${result.p95Ms.toFixed(1)}ms max=${result.maxMs.toFixed(1)}ms ${result.passed ? "PASS" : "FAIL"}\n`);
  }
  process.stdout.write(`Report: ${outputPath}\n`);
  if (!report.passed) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exitCode = 1;
});
