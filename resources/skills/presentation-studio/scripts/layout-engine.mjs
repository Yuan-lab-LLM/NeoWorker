import fs from "node:fs";
import path from "node:path";
import { DESIGN_FAMILIES, LAYOUT_CATALOG, layoutCandidates, recommendDesignFamily } from "./layout-catalog.mjs";
import { createAppRequire } from "./runtime-utils.mjs";
import { buildVisualModel, validateVisualContent } from "./visual-layouts.mjs";

const imageSize = createAppRequire(import.meta.url)("image-size");

const W = 13.333333, H = 7.5;
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const present = value => value !== undefined && value !== null && value !== "";

function requireText(value, field, optional = false) {
  if (optional && value === undefined) return;
  if (typeof value !== "string" || (!optional && !value.trim())) throw new Error(`${field}: provide non-empty text.`);
}

function keys(value, allowed, field) {
  if (!object(value)) throw new Error(`${field}: expected an object.`);
  for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new Error(`${field}.${key}: unsupported field; allowed fields: ${allowed.join(", ")}. Move the content to a compatible layout instead of dropping it.`);
}

function list(value, min, max, field) {
  if (!Array.isArray(value) || value.length < min || value.length > max) throw new Error(`${field}: expected ${min}–${max} entries. Split the slide without removing evidence.`);
}

function labelled(value, min, max, field) {
  list(value, min, max, field);
  value.forEach((item, i) => {
    keys(item, ["label", "body"], `${field}[${i}]`);
    requireText(item.label, `${field}[${i}].label`);
    requireText(item.body, `${field}[${i}].body`);
  });
}

// Conservative preflight, not a substitute for a rendered slide inspection.
// CJK/full-width glyphs are one em; Latin words wrap as units. Hard newlines,
// punctuation and very long tokens all contribute to capacity.
export function measureText(text, width, fontSize, { bold = false, leading = 1.35 } = {}) {
  const glyph = ch => /[\u2E80-\uA4CF\uAC00-\uD7AF\uF900-\uFAFF\uFF00-\uFFEF]|\p{Extended_Pictographic}/u.test(ch) ? 1 : /\s/u.test(ch) ? 0.3 : /[MW@%]/.test(ch) ? 0.9 : /[il.,:;'!|]/.test(ch) ? 0.3 : 0.57;
  const factor = bold ? 1.06 : 1.02;
  const capacity = width * 72 / (fontSize * factor);
  let lines = 0;
  for (const paragraph of String(text).split(/\r?\n/)) {
    let used = 0;
    lines += 1;
    const tokens = paragraph.match(/[A-Za-z0-9_./:@%+\-]+|[^\r\n]/gu) || [];
    for (const token of tokens) {
      const size = Array.from(token).reduce((n, ch) => n + glyph(ch), 0);
      if (size > capacity) {
        for (const ch of token) {
          const unit = glyph(ch);
          if (used && used + unit > capacity) { lines += 1; used = 0; }
          used += unit;
        }
      } else {
        if (used && used + size > capacity) { lines += 1; used = 0; }
        used += size;
      }
    }
  }
  return { lines, height: lines * fontSize * leading / 72 + 0.04 };
}

function validateContent(slide, layout) {
  requireText(slide.title, "title");
  const c = slide.content;
  keys(c, layout.fields, "content");
  for (const field of layout.required) if (!present(c[field])) throw new Error(`content.${field}: required for ${layout.id}.`);
  for (const field of ["subtitle", "body", "sourceNote", "notes"]) if (own(c, field)) requireText(c[field], `content.${field}`, true);
  if (c.items !== undefined) labelled(c.items, 1, layout.id === "closing-statement" ? 3 : 5, "content.items");
  if (c.layers !== undefined) labelled(c.layers, 2, 4, "content.layers");
  if (c.steps !== undefined) labelled(c.steps, 2, 6, "content.steps");
  if (c.columns !== undefined) labelled(c.columns, 2, 3, "content.columns");
  if (c.metrics !== undefined) {
    list(c.metrics, 2, 4, "content.metrics");
    c.metrics.forEach((m, i) => {
      keys(m, ["value", "label", "detail"], `content.metrics[${i}]`);
      requireText(m.value, `metrics[${i}].value`);
      if (!/^(?:[~≈><≥≤+#-]\s*)?\d/.test(m.value.trim())) throw new Error(`metrics[${i}].value: use a sourced numeric value with units. Prose labels or model names belong in items, comparisons or an evidence image, not a metric.`);
      requireText(m.label, `metrics[${i}].label`);
      requireText(m.detail, `metrics[${i}].detail`, true);
    });
  }
  if (c.table !== undefined) {
    keys(c.table, ["columns", "rows", "columnWeights"], "content.table");
    list(c.table.columns, 2, 5, "table.columns");
    list(c.table.rows, 1, 7, "table.rows");
    c.table.columns.forEach((s, i) => requireText(s, `table.columns[${i}]`));
    c.table.rows.forEach((row, i) => {
      list(row, c.table.columns.length, c.table.columns.length, `table.rows[${i}]`);
      row.forEach((v, j) => { if (typeof v !== "string" && !(typeof v === "number" && Number.isFinite(v))) throw new Error(`table.rows[${i}][${j}]: expected text or a finite number.`); });
    });
    if (c.table.columnWeights !== undefined) {
      list(c.table.columnWeights, c.table.columns.length, c.table.columns.length, "table.columnWeights");
      if (c.table.columnWeights.some(v => typeof v !== "number" || !Number.isFinite(v) || v <= 0)) throw new Error("table.columnWeights: use positive finite numbers.");
    }
  }
  if (c.chart !== undefined) {
    keys(c.chart, ["type", "labels", "series", "unit"], "content.chart");
    if (!["bar", "line"].includes(c.chart.type)) throw new Error("chart.type: use bar or line.");
    list(c.chart.labels, 2, 8, "chart.labels");
    c.chart.labels.forEach((s, i) => requireText(s, `chart.labels[${i}]`));
    list(c.chart.series, 1, 3, "chart.series");
    requireText(c.chart.unit, "chart.unit");
    c.chart.series.forEach((series, i) => {
      keys(series, ["name", "values"], `chart.series[${i}]`);
      requireText(series.name, `chart.series[${i}].name`);
      list(series.values, c.chart.labels.length, c.chart.labels.length, `chart.series[${i}].values`);
      if (series.values.some(n => typeof n !== "number" || !Number.isFinite(n))) throw new Error("chart: values must be finite numbers; missing observations must not become zero.");
    });
  }
  if (c.image !== undefined) {
    keys(c.image, ["path", "alt", "source", "fit"], "content.image");
    for (const field of ["path", "alt", "source"]) requireText(c.image[field], `image.${field}`);
    if (c.image.fit && !["contain", "cover"].includes(c.image.fit)) throw new Error("image.fit: use contain or cover.");
  }
  if (c.images !== undefined) {
    list(c.images, 2, 4, "content.images");
    c.images.forEach((image, i) => {
      keys(image, ["path", "alt", "source", "caption", "fit"], `content.images[${i}]`);
      for (const field of ["path", "alt", "source", "caption"]) requireText(image[field], `images[${i}].${field}`);
      if (image.fit && image.fit !== "contain") throw new Error(`images[${i}].fit: evidence galleries require contain; do not crop source labels.`);
    });
  }
  validateVisualContent(c, { keys, requireText, list, labelled });
}

function buildModel(slide, layout, family, theme, index) {
  validateContent(slide, layout);
  const c = slide.content, colors = { ...family, ...(theme.layoutColors || {}) };
  for (const value of Object.values(colors)) if (typeof value === "string" && value !== family.name && !/^[\da-f]{6}$/i.test(value)) throw new Error("theme.layoutColors: use six-digit hex colors.");
  const visual = buildVisualModel(slide, layout, colors, index, measureText);
  if (visual) return visual;
  const dark = layout.id === "cover-type" || layout.id === "closing-statement";
  const ink = dark ? "FFFFFF" : colors.primary;
  const muted = dark ? "C8D9E4" : colors.muted;
  const model = { index, layoutId: layout.id, composition: layout.composition, background: dark ? colors.primary : colors.background, objects: [], textBoxes: [], notes: [c.notes, c.image?.source, ...(c.images || []).map(i => i.source)].filter(Boolean).join("\n"), image: c.image };
  const text = (field, value, x, y, w, h, size = 18, opts = {}) => {
    if (!present(value)) return;
    const content = String(value);
    const measurement = measureText(content, w, size, opts);
    const box = { kind: "text", field, text: content, x, y, w, h, size, color: ink, ...opts, measurement };
    model.objects.push(box); model.textBoxes.push(box);
  };
  const rect = (x, y, w, h, fill, line) => model.objects.push({ kind: "rect", x, y, w, h, fill, line });
  const line = (x, y, w, h = 0) => model.objects.push({ kind: "line", x, y, w, h, color: dark ? "486075" : "D2DCE2" });
  const image = (x, y, w, h, asset = c.image) => model.objects.push({ kind: "image", x, y, w, h, ...asset });
  const footerY = 7.01;
  text("sourceNote", c.sourceNote, 0.64, footerY, 11.35, 0.28, 10, { color: muted, leading: 1.1 });
  text("page", String(index).padStart(2, "0"), 12.02, footerY, 0.64, 0.25, 10, { color: muted, align: "right", leading: 1.1 });

  if (layout.id.startsWith("cover")) {
    const withImage = Boolean(c.image), textW = withImage ? 6.3 : 10.95;
    const titleH = Math.min(2.78, Math.max(1.15, measureText(slide.title, textW, 43, { bold: true, leading: 1.45 }).height + 0.08));
    const subtitleY = Math.max(3.2, 1.13 + titleH + 0.18);
    text("title", slide.title, 0.74, 1.13, textW, titleH, 43, { bold: true, leading: 1.45 });
    text("subtitle", c.subtitle, 0.78, subtitleY, textW, 0.9, 22, { color: dark ? "83DCE7" : colors.accent });
    text("body", c.body, 0.78, subtitleY + 1.18, textW, 1.35, 18, { color: muted });
    if (withImage) image(7.05, 2.55, 5.57, 3.55);
    return model;
  }
  if (layout.id === "closing-statement") {
    const titleH = Math.min(1.62, Math.max(0.82, measureText(slide.title, 11.6, 36, { bold: true, leading: 1.45 }).height + 0.08));
    const subtitleY = Math.max(2.02, 0.77 + titleH + 0.17);
    const bodyY = Math.max(2.8, subtitleY + 0.76);
    text("title", slide.title, 0.74, 0.77, 11.6, titleH, 36, { bold: true, leading: 1.45 });
    text("subtitle", c.subtitle, 0.78, subtitleY, 11.5, 0.48, 18, { color: "83DCE7" });
    text("body", c.body, 0.78, bodyY, 5.45, 6.6 - bodyY, 23);
    (c.items || []).forEach((item, i) => {
      const y = bodyY + 0.1 + i * 1.05;
      text(`items[${i}].label`, item.label, 7.13, y, 5.1, 0.42, 20, { bold: true });
      text(`items[${i}].body`, item.body, 7.13, y + 0.5, 5.1, 0.6, 16, { color: muted });
    });
    return model;
  }

  const titleHeight = Math.max(0.74, Math.min(1.43, measureText(slide.title, 11.95, 32, { bold: true, leading: 1.45 }).height + 0.08));
  text("title", slide.title, 0.64, 0.55, 11.95, titleHeight, 32, { bold: true, leading: 1.45 });
  const subtitleY = 0.55 + titleHeight + 0.2;
  text("subtitle", c.subtitle, 0.66, subtitleY, 11.8, 0.52, 17, { color: muted });
  const top = subtitleY + (c.subtitle ? 0.79 : 0.33), bottom = 6.64, height = bottom - top;
  if (layout.id === "editorial-split") {
    text("body", c.body, 0.67, top, 4.08, height, 24, { color: colors.accent });
    const row = height / c.items.length;
    c.items.forEach((item, i) => {
      const y = top + i * row;
      text(`items[${i}].label`, item.label, 5.28, y, 7.3, 0.45, 20, { bold: true });
      text(`items[${i}].body`, item.body, 5.28, y + 0.5, 7.3, row - 0.58, 17, { color: muted });
    });
  } else if (layout.id === "editorial-rows") {
    const offset = c.body ? 0.76 : 0;
    text("body", c.body, 0.67, top, 11.9, 0.6, 18, { color: colors.accent });
    const row = (height - offset) / c.items.length;
    c.items.forEach((item, i) => {
      const y = top + offset + i * row;
      text(`items[${i}].label`, item.label, 0.67, y, 3.1, row - 0.18, 20, { bold: true });
      text(`items[${i}].body`, item.body, 4.07, y, 8.52, row - 0.18, 18, { color: muted });
      if (i < c.items.length - 1) line(0.67, y + row - 0.1, 11.9);
    });
  } else if (layout.id === "image-wide") {
    const captionH = c.body ? 0.68 : 0;
    image(0.67, top, 11.95, height - captionH);
    text("body", c.body, 0.67, bottom - 0.5, 11.9, 0.5, 17, { color: muted });
  } else if (layout.id === "image-gallery") {
    const gap = 0.24, cell = (11.95 - gap * (c.images.length - 1)) / c.images.length;
    const captionH = Math.max(...c.images.map(i => measureText(i.caption, cell, 17, { bold: true }).height)) + 0.08;
    const bodyH = c.body ? 0.68 : 0;
    c.images.forEach((asset, i) => {
      const x = 0.67 + i * (cell + gap);
      text(`images[${i}].caption`, asset.caption, x, top, cell, captionH, 17, { bold: true, color: colors.accent });
      image(x, top + captionH + 0.12, cell, height - captionH - 0.12 - bodyH, { ...asset, fit: "contain" });
    });
    text("body", c.body, 0.67, bottom - 0.5, 11.9, 0.5, 17, { color: muted });
  } else if (layout.id.startsWith("image-")) {
    const left = layout.id === "image-left";
    image(left ? 0.67 : 6.22, top, 6.42, height);
    text("body", c.body, left ? 7.62 : 0.67, top + 0.12, 5.0, height - 0.25, 22);
  } else if (layout.id === "metrics-row") {
    text("body", c.body, 0.67, top, 11.9, 0.85, 20, { color: muted });
    const cell = 11.95 / c.metrics.length;
    const valueY = top + 1.3;
    c.metrics.forEach((m, i) => {
      const x = 0.67 + i * cell;
      text(`metrics[${i}].value`, m.value, x, valueY, cell - 0.33, 1.0, 48, { bold: true, color: colors.accent });
      text(`metrics[${i}].label`, m.label, x, valueY + 1.18, cell - 0.33, 0.6, 20, { bold: true });
      text(`metrics[${i}].detail`, m.detail, x, valueY + 1.99, cell - 0.33, 0.95, 16, { color: muted });
      if (i) line(x - 0.18, valueY, 0, 2.85);
    });
  } else if (layout.id === "comparison-columns") {
    const offset = c.body ? 0.7 : 0;
    text("body", c.body, 0.67, top, 11.9, 0.54, 18, { color: muted });
    const cell = 11.95 / c.columns.length;
    c.columns.forEach((item, i) => {
      const x = 0.67 + i * cell;
      text(`columns[${i}].label`, item.label, x, top + offset, cell - 0.5, 0.9, 25, { bold: true, color: colors.accent });
      text(`columns[${i}].body`, item.body, x, top + offset + 1.08, cell - 0.5, height - offset - 1.14, 19);
      if (i) line(x - 0.23, top + offset, 0, height - offset);
    });
  } else if (layout.id === "table-focus") {
    const offset = c.body ? 0.62 : 0;
    text("body", c.body, 0.67, top, 11.9, 0.52, 17, { color: muted });
    const table = c.table;
    const weights = table.columnWeights || table.columns.map((_, i) => i === 0 ? 0.75 : 1.25);
    const widths = weights.map(n => n / weights.reduce((a, b) => a + b, 0) * 11.95);
    const rows = [table.columns, ...table.rows];
    // Uneven rows (e.g. a long model identifier next to short category labels)
    // need different heights. Uniform rows can reject a table despite ample
    // room elsewhere, sending authors through repeated, lossy shortening.
    const minimumHeights = rows.map((row, r) => Math.max(0.5, ...row.map((value, col) =>
      measureText(value, widths[col] - 0.24, r === 0 ? 16 : 17, { bold: r === 0 }).height + 0.18)));
    const requiredHeight = minimumHeights.reduce((sum, h) => sum + h, 0);
    if (requiredHeight > height - offset + 0.002) throw new Error(`table: content needs ${requiredHeight.toFixed(2)} in, available ${(height - offset).toFixed(2)} in at 17 pt. Widen columns or split rows without dropping values.`);
    const extraPerRow = Math.max(0, height - offset - requiredHeight) / rows.length;
    const rowH = minimumHeights.map(h => h + extraPerRow);
    const native = { kind: "table", x: 0.67, y: top + offset, w: 11.95, h: height - offset, rows, widths, rowH, colors };
    model.objects.push(native);
    rows.forEach((row, r) => row.forEach((value, col) => {
      const size = r === 0 ? 16 : 17;
      model.textBoxes.push({ field: `table.${r === 0 ? "columns" : `rows[${r - 1}]`}[${col}]`, text: String(value), x: native.x + widths.slice(0, col).reduce((a, b) => a + b, 0) + 0.12, y: native.y + rowH.slice(0, r).reduce((a, b) => a + b, 0) + 0.09, w: widths[col] - 0.24, h: rowH[r] - 0.18, size, measurement: measureText(value, widths[col] - 0.24, size, { bold: r === 0 }) });
    }));
  } else if (layout.id === "chart-focus") {
    const withBody = Boolean(c.body), chartW = withBody ? 8.2 : 11.8;
    model.objects.push({ kind: "chart", x: 0.72, y: top, w: chartW, h: height, chart: c.chart, colors });
    text("body", c.body, 9.47, top + 0.15, 3.1, height - 0.2, 20);
    text("chart.unit", c.chart.unit, 0.77, top - 0.32, chartW, 0.28, 11, { color: muted });
    c.chart.labels.forEach((label, i) => model.textBoxes.push({ field: `chart.labels[${i}]`, text: label, x: 1.17 + i * (chartW - 0.9) / c.chart.labels.length, y: bottom - 0.55, w: (chartW - 0.9) / c.chart.labels.length, h: 0.52, size: 13, renderBounds: { x: 0.72, y: top, w: chartW, h: height }, measurement: measureText(label, (chartW - 0.9) / c.chart.labels.length, 13) }));
    c.chart.series.forEach((series, i) => {
      if (measureText(series.name, chartW / c.chart.series.length - 0.5, 13).height > 0.4) throw new Error(`chart.series[${i}].name: legend is too long.`);
    });
  } else if (layout.id === "architecture-layers") {
    text("body", c.body, 0.67, top + 0.08, 3.4, height, 23, { color: colors.accent });
    const cell = height / c.layers.length;
    c.layers.forEach((layer, i) => {
      const y = top + i * cell;
      rect(4.65, y, 7.99, cell - 0.17, i % 2 ? "F6F8FA" : colors.light);
      text(`layers[${i}].label`, layer.label, 4.89, y + 0.12, 2.34, cell - 0.4, 18, { bold: true });
      text(`layers[${i}].body`, layer.body, 7.46, y + 0.12, 4.9, cell - 0.4, 17);
    });
  } else if (layout.id === "process-steps") {
    if (c.steps.length > 4) {
      // Longer processes need two readable rows, not tiny labels on one rail.
      // Row order remains left-to-right, then top-to-bottom, with every stage
      // retained as editable text and an explicit sequence number.
      const bodyHeight = c.body ? 0.58 : 0;
      text("body", c.body, 0.67, top, 11.9, bodyHeight, 19, { color: muted });
      const start = top + bodyHeight + 0.22;
      const rowHeight = (bottom - start) / 2;
      const cell = 11.95 / 3;
      c.steps.forEach((step, i) => {
        const x = 0.67 + (i % 3) * cell, y = start + Math.floor(i / 3) * rowHeight;
        text(`stepNumber[${i}]`, String(i + 1).padStart(2, "0"), x, y, 0.62, 0.45, 20, { color: colors.accent });
        text(`steps[${i}].label`, step.label, x + 0.74, y, cell - 1.04, 0.5, 21, { bold: true });
        text(`steps[${i}].body`, step.body, x + 0.74, y + 0.65, cell - 1.04, rowHeight - 0.85, 17);
        if (i % 3 < 2 && i < c.steps.length - 1) model.objects.push({ kind: "line", x: x + cell - 0.34, y: y + 0.25, w: 0.2, h: 0, color: colors.accent, arrow: true });
      });
      return model;
    }
    text("body", c.body, 0.67, top, 11.9, 0.83, 21, { color: muted });
    const cell = 11.95 / c.steps.length;
    c.steps.forEach((step, i) => {
      const x = 0.67 + i * cell;
      text(`stepNumber[${i}]`, String(i + 1).padStart(2, "0"), x, 3.72, 0.72, 0.62, 28, { color: colors.accent });
      text(`steps[${i}].label`, step.label, x, 4.6, cell - 0.4, 0.8, 22, { bold: true });
      text(`steps[${i}].body`, step.body, x, 5.57, cell - 0.4, 1.05, 17);
      if (i < c.steps.length - 1) model.objects.push({ kind: "line", x: x + 0.88, y: 4.05, w: cell - 1.3, h: 0, color: colors.accent, arrow: true });
    });
  }
  return model;
}

export function auditModel(model) {
  const errors = [];
  for (const box of model.textBoxes) {
    if (box.measurement.height > box.h + 0.002) {
      const lineHeight = (box.measurement.height - 0.04) / box.measurement.lines;
      const maxLines = Math.max(0, Math.floor((box.h - 0.04 + 0.002) / lineHeight));
      const cjkPerLine = Math.floor(box.w * 72 / (box.size * (box.bold ? 1.06 : 1.02)));
      errors.push(`${box.field}: ${box.measurement.lines} estimated lines need ${box.measurement.height.toFixed(2)} in, available ${box.h.toFixed(2)} in at ${box.size} pt. This frame fits at most ${maxLines} line(s), approximately ${cjkPerLine} CJK characters per line (mixed Latin and explicit newlines change wrapping). Patch this field without changing facts, choose another layout, or explicitly split this slide. Text was not truncated or shrunk.`);
    }
  }
  for (const box of [...model.objects, ...model.textBoxes]) {
    if (![box.x, box.y, box.w, box.h].every(Number.isFinite) || box.x < 0 || box.y < 0 || box.w < 0 || box.h < 0 || box.x + box.w > W + 0.005 || box.y + box.h > H + 0.005) errors.push(`${box.field || box.kind}: outside the 16:9 slide bounds.`);
  }
  return errors;
}

export function compileLayoutPlan(plan, theme = {}) {
  const familyId = recommendDesignFamily(plan);
  const family = DESIGN_FAMILIES[familyId];
  if (!family) return { errors: [`Unknown designFamily '${familyId}'.`], warnings: [], slides: [], family: familyId };
  const errors = [], warnings = [], slides = [], chosen = [];
  for (const [offset, slide] of (plan.slides || []).entries()) {
    const failures = [], candidates = layoutCandidates(slide, chosen);
    let selected;
    for (const id of candidates) {
      const layout = LAYOUT_CATALOG.find(l => l.id === id);
      if (!layout) { failures.push(`Unknown layoutId '${id}'.`); continue; }
      try {
        const model = buildModel(slide, layout, family, theme, offset + 1);
        const issues = auditModel(model);
        if (issues.length) { failures.push(`${id}: ${issues.join(" ")}`); continue; }
        selected = model; break;
      } catch (error) { failures.push(`${id}: ${error.message}`); }
    }
    if (!selected) errors.push(`Slide ${offset + 1}: ${failures.join("\n")}`);
    else {
      slides.push(selected); chosen.push(selected.layoutId);
      if (chosen.length >= 3 && chosen.slice(-3).every(id => id === selected.layoutId)) warnings.push(`Slides ${offset - 1}–${offset + 1} repeat ${selected.layoutId}; preserve the data but review visual pacing.`);
    }
  }
  return { family: familyId, errors, warnings, slides, measurement: "conservative CJK/Latin estimate; rendered visual inspection required" };
}

export function renderLayoutSlide(pres, model, theme, projectDir) {
  const slide = pres.addSlide();
  slide.background = { color: model.background };
  if (model.notes) slide.addNotes(model.notes);
  const font = theme.fonts?.body || "Arial";
  for (const o of model.objects) {
    const box = { x: o.x, y: o.y, w: o.w, h: o.h };
    if (o.kind === "text") slide.addText(o.text, { ...box, fontFace: o.bold ? (theme.fonts?.heading || font) : font, fontSize: o.size, color: o.color, bold: Boolean(o.bold), align: o.align || "left", valign: "top", margin: 0, breakLine: false, lineSpacingMultiple: 1.15, paraSpaceAfterPt: 0 });
    else if (o.kind === "rect" || o.kind === "ellipse") slide.addShape(pres.ShapeType[o.kind], { ...box, fill: { color: o.fill, transparency: o.transparency || 0 }, line: { color: o.line || o.fill, width: o.lineWidth || 1, transparency: o.line ? 0 : 100 } });
    else if (o.kind === "line") slide.addShape(pres.ShapeType.line, { ...box, flipV: Boolean(o.flipV), line: { color: o.color, width: o.width || 1, ...(o.dash ? { dashType: "dash" } : {}), ...(o.arrow ? { endArrowType: "triangle" } : {}) } });
    else if (o.kind === "image") {
      const imagePath = path.resolve(projectDir, o.path);
      if (!fs.existsSync(imagePath)) throw new Error(`Slide ${model.index}: image does not exist: ${o.path}`);
      const dimensions = imageSize(fs.readFileSync(imagePath));
      if (!(dimensions.width > 0 && dimensions.height > 0)) throw new Error(`Slide ${model.index}: cannot measure image: ${o.path}`);
      if (o.fit === "cover") {
        // PptxGenJS uses top-level w/h as the source aspect ratio, not the
        // actual file dimensions. sizing.w/h is the final cropped viewport.
        slide.addImage({ path: imagePath, ...box, h: box.w * dimensions.height / dimensions.width,
          sizing: { type: "cover", w: box.w, h: box.h }, altText: o.alt });
      } else {
        // Explicit geometry also avoids negative srcRect padding, which some
        // PPTX preview engines render differently from PowerPoint.
        const scale = Math.min(box.w / dimensions.width, box.h / dimensions.height);
        const w = dimensions.width * scale, h = dimensions.height * scale;
        slide.addImage({ path: imagePath, x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h, altText: o.alt });
      }
    } else if (o.kind === "table") {
      const rows = o.rows.map((row, i) => row.map(value => ({ text: String(value), options: { bold: i === 0, color: i === 0 ? "FFFFFF" : o.colors.primary, fill: { color: i === 0 ? o.colors.primary : i % 2 ? "F3F6F8" : "FFFFFF" }, fontSize: i === 0 ? 16 : 17 } })));
      slide.addTable(rows, { ...box, colW: o.widths, rowH: o.rowH, fontFace: font, fontSize: 17, margin: [6, 8, 6, 8], border: { type: "solid", pt: 0.4, color: "D7E0E5" }, valign: "middle", autoPage: false, paraSpaceAfterPt: 0 });
    } else if (o.kind === "chart") {
      slide.addChart(pres.ChartType[o.chart.type], o.chart.series.map(series => ({ name: series.name, labels: [...o.chart.labels], values: [...series.values] })), {
        ...box, barDir: "col", fontFace: font, dataLabelFontFace: font, catAxisLabelFontFace: font, valAxisLabelFontFace: font, legendFontFace: font,
        catAxisLabelFontSize: 13, valAxisLabelFontSize: 13, legendFontSize: 13,
        showLegend: o.chart.series.length > 1, legendPos: "b", showTitle: false,
        showValue: false, chartColors: [o.colors.accent, "5F7891", "92B8C4"],
        ...(o.chart.type === "bar" ? { valAxisMinVal: Math.min(0, ...o.chart.series.flatMap(s => s.values)), ...(o.chart.series.every(s => s.values.every(n => n <= 0)) ? { valAxisMaxVal: 0 } : {}) } : {}),
        catAxisLabelColor: o.colors.primary, valAxisLabelColor: o.colors.muted,
        showBorder: false, showMarker: true,
        showCatName: false, showShadow: false, valGridLine: { color: "E0E7EB", width: 0.5 },
      });
    }
  }
  return slide;
}
