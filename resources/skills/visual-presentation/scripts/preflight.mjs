#!/usr/bin/env node

import {
  loadPresentationRuntime,
  resolveLibreOffice,
  resolvePlatformFonts,
  which,
} from "./runtime-utils.mjs";

const status = {
  node: process.version,
  pptxgenjs: false,
  fonts: resolvePlatformFonts("auto"),
  libreoffice: resolveLibreOffice(),
  pdftoppm: which("pdftoppm"),
};

try {
  status.pptxgenjs = Boolean(loadPresentationRuntime(import.meta.url).PptxGenJS);
} catch {
  // The structured output below is more useful than a raw module error.
}

console.log(`[visual-presentation] node: ${status.node}`);
console.log(`[visual-presentation] pptxgenjs: ${status.pptxgenjs ? "ok" : "missing"}`);
console.log(`[visual-presentation] heading font: ${status.fonts.heading}`);
console.log(`[visual-presentation] body font: ${status.fonts.body}`);
console.log(`[visual-presentation] LibreOffice renderer: ${status.libreoffice || "not available"}`);
console.log(`[visual-presentation] pdftoppm renderer: ${status.pdftoppm || "not available"}`);

if (!status.pptxgenjs) process.exitCode = 1;
