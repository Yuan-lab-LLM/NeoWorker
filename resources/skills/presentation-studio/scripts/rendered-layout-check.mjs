import fs from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { createAppRequire } from "./runtime-utils.mjs";

const normalize = value => String(value).normalize("NFKC").replace(/[\s\u200B-\u200D\uFEFF]/gu, "");

// Read actual rendered PDF text, rather than accepting only an estimated text
// capacity. Text runs retain the renderer's geometry and font metrics. This
// detects missing/clipped content but does not replace a visual design review.
export function compareRenderedText(boxes, items, styles, pageHeight) {
  const chars = [], rects = [];
  for (const item of items) {
    if (!item.str) continue;
    const string = normalize(item.str);
    const style = styles[item.fontName] || {};
    const size = Math.hypot(item.transform[2], item.transform[3]);
    const ascent = Number.isFinite(style.ascent) ? style.ascent : 0.85;
    const descent = Number.isFinite(style.descent) ? style.descent : -0.2;
    const rect = { left: item.transform[4], right: item.transform[4] + item.width, top: pageHeight - item.transform[5] - size * ascent, bottom: pageHeight - item.transform[5] - size * descent };
    // All characters of a run share its conservative bounding rectangle. When a
    // match cuts through a run we report that ambiguity instead of claiming fit.
    for (const ch of string) { chars.push(ch); rects.push(rect); }
  }
  const stream = chars.join(""), errors = [], warnings = [], measurements = [];
  for (const box of boxes) {
    const expected = normalize(box.text);
    if (!expected) continue;
    const bounds = box.renderBounds || box;
    const frame = { left: bounds.x * 72, top: bounds.y * 72, right: (bounds.x + bounds.w) * 72, bottom: (bounds.y + bounds.h) * 72 };
    const matches = [];
    let at = stream.indexOf(expected);
    while (at >= 0) {
      // PDF text is primarily BMP. Indexing the joined stream by UTF-16 offset
      // must still map correctly when an earlier run contained an emoji.
      const start = Array.from(stream.slice(0, at)).length;
      const end = start + Array.from(expected).length;
      const runs = [...new Set(rects.slice(start, end))];
      const ink = { left: Math.min(...runs.map(r => r.left)), right: Math.max(...runs.map(r => r.right)), top: Math.min(...runs.map(r => r.top)), bottom: Math.max(...runs.map(r => r.bottom)) };
      const distance = Math.abs((ink.left + ink.right) - (frame.left + frame.right)) + Math.abs((ink.top + ink.bottom) - (frame.top + frame.bottom));
      matches.push({ ink, distance, partialRun: (start > 0 && rects[start - 1] === rects[start]) || (end < rects.length && rects[end - 1] === rects[end]) });
      at = stream.indexOf(expected, at + expected.length);
    }
    matches.sort((a, b) => a.distance - b.distance);
    const match = matches[0];
    if (!match) { errors.push(`${box.field}: content missing from the rendered PDF.`); continue; }
    if (match.partialRun) {
      warnings.push(`${box.field}: shares a PDF text run; inspect its geometry visually.`);
      continue;
    }
    const { ink } = match;
    const tolerance = 3; // Font ascent/descent can extend slightly into padding.
    const fits = ink.left >= frame.left - tolerance && ink.right <= frame.right + tolerance && ink.top >= frame.top - tolerance && ink.bottom <= frame.bottom + tolerance;
    measurements.push({ field: box.field, fits, frame, ink });
    if (!fits) {
      const inches = r => [r.left, r.top, r.right - r.left, r.bottom - r.top].map(n => (n / 72).toFixed(3)).join(', ');
      errors.push(`${box.field}: rendered text extends outside its assigned box. Rendered x/y/w/h in inches: [${inches(ink)}]; assigned: [${inches(frame)}]. Reflow or resize this frame without deleting text, then render again.`);
    }
  }
  for (let i = 0; i < measurements.length; i += 1) {
    for (let j = i + 1; j < measurements.length; j += 1) {
      const a = measurements[i], b = measurements[j];
      const width = Math.min(a.ink.right, b.ink.right) - Math.max(a.ink.left, b.ink.left);
      const height = Math.min(a.ink.bottom, b.ink.bottom) - Math.max(a.ink.top, b.ink.top);
      if (width > 3 && height > 3) errors.push(`${a.field} and ${b.field}: rendered text overlaps.`);
    }
  }
  return { errors, warnings, measurements };
}

export async function inspectRenderedLayout(pdfPath, layoutSlides) {
  const require = createAppRequire(import.meta.url);
  // pdfjs uses these only as platform geometry primitives during extraction.
  const canvas = require("@napi-rs/canvas");
  globalThis.DOMMatrix ||= canvas.DOMMatrix;
  globalThis.ImageData ||= canvas.ImageData;
  globalThis.Path2D ||= canvas.Path2D;
  const pdfjs = await import(pathToFileURL(require.resolve("pdfjs-dist/legacy/build/pdf.mjs")).href);
  const task = pdfjs.getDocument({ data: new Uint8Array(await fs.readFile(pdfPath)), useSystemFonts: true, isEvalSupported: false, verbosity: 0 });
  const pdf = await task.promise;
  try {
    const result = { errors: [], warnings: [], slides: [] };
    for (const model of layoutSlides) {
      const page = await pdf.getPage(model.index);
      const text = await page.getTextContent();
      const check = compareRenderedText(model.textBoxes, text.items, text.styles, page.view[3] - page.view[1]);
      result.errors.push(...check.errors.map(s => `Slide ${model.index}: ${s}`));
      result.warnings.push(...check.warnings.map(s => `Slide ${model.index}: ${s}`));
      result.slides.push({ index: model.index, measurements: check.measurements });
    }
    return result;
  } finally { await task.destroy(); }
}
