#!/usr/bin/env node

import { loadPresentationRuntime, resolveLibreOffice, which } from "./runtime-utils.mjs";

const status = {
  node: process.version,
  pptxgenjs: false,
  jszip: false,
  libreoffice: resolveLibreOffice(),
  pdftoppm: which("pdftoppm"),
};

try {
  const runtime = loadPresentationRuntime(import.meta.url);
  status.pptxgenjs = Boolean(runtime.PptxGenJS);
  status.jszip = Boolean(runtime.JSZip);
} catch {
  // The structured status below is more useful than a raw module error.
}

console.log(`[presentation-studio] node: ${status.node}`);
console.log(`[presentation-studio] pptxgenjs: ${status.pptxgenjs ? "ok" : "missing"}`);
console.log(`[presentation-studio] jszip: ${status.jszip ? "ok" : "missing"}`);
console.log(
  `[presentation-studio] LibreOffice renderer: ${status.libreoffice || "not available"}`,
);
console.log(
  `[presentation-studio] pdftoppm renderer: ${status.pdftoppm || "not available"}`,
);

if (!status.pptxgenjs || !status.jszip) process.exitCode = 1;
