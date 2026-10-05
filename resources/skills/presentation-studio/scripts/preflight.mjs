#!/usr/bin/env node

import { pathToFileURL } from "node:url";
import { createAppRequire, loadPresentationRuntime, resolveLibreOffice, resolvePdfToPpm } from "./runtime-utils.mjs";

const status = {
  node: process.version,
  pptxgenjs: false,
  jszip: false,
  xml: false,
  renderedGeometry: false,
  libreoffice: resolveLibreOffice(),
  pdftoppm: resolvePdfToPpm(),
};

try {
  const runtime = loadPresentationRuntime(import.meta.url);
  status.pptxgenjs = Boolean(runtime.PptxGenJS);
  status.jszip = Boolean(runtime.JSZip);
} catch {
  // The structured status below is more useful than a raw module error.
}

const requireFromApp = createAppRequire(import.meta.url);
try { status.xml = Boolean(requireFromApp("@xmldom/xmldom").DOMParser); } catch {}
try { status.imageDimensions = typeof requireFromApp("image-size") === "function"; } catch {}
try {
  const canvas = requireFromApp("@napi-rs/canvas");
  globalThis.DOMMatrix ||= canvas.DOMMatrix;
  globalThis.ImageData ||= canvas.ImageData;
  globalThis.Path2D ||= canvas.Path2D;
  const pdf = await import(pathToFileURL(requireFromApp.resolve("pdfjs-dist/legacy/build/pdf.mjs")).href);
  status.renderedGeometry = Boolean(pdf.getDocument);
} catch {}
console.log(`[presentation-studio] XML validation: ${status.xml ? "ok" : "missing"}`);
console.log(`[presentation-studio] image dimensions: ${status.imageDimensions ? "ok" : "missing"}`);
console.log(`[presentation-studio] rendered geometry: ${status.renderedGeometry ? "ok" : "missing"}`);
console.log(`[presentation-studio] node: ${status.node}`);
console.log(`[presentation-studio] pptxgenjs: ${status.pptxgenjs ? "ok" : "missing"}`);
console.log(`[presentation-studio] jszip: ${status.jszip ? "ok" : "missing"}`);
console.log(
  `[presentation-studio] LibreOffice renderer: ${status.libreoffice || "not available"}`,
);
console.log(
  `[presentation-studio] pdftoppm renderer: ${status.pdftoppm || "not available"}`,
);

if (!status.pptxgenjs || !status.jszip || !status.xml || !status.renderedGeometry || !status.imageDimensions) process.exitCode = 1;
