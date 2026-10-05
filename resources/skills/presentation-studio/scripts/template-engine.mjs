import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { which } from "./runtime-utils.mjs";
import { measureText } from "./layout-engine.mjs";

const exec = promisify(execFile);
const bridge = fileURLToPath(new URL("./template_bridge.py", import.meta.url));
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");

export async function runTemplateBridge(command, args) {
  const python = process.env.NEOWORKER_PYTHON || which("python3") || which("python") || which("py");
  if (!python) throw new Error("Native template support requires Python 3.10+ (NEOWORKER_PYTHON). No new deck was substituted.");
  try {
    await exec(python, [...(/^py(?:\.exe)?$/i.test(path.basename(python)) ? ["-3"] : []), bridge, command, ...args], { timeout: 120_000, maxBuffer: 8 * 1024 * 1024 });
  } catch (error) { throw new Error(String(error.stderr || error.message).trim()); }
}

export function initialTemplateLayouts(library) {
  return library.slides.map(slide => ({
    id: `template-${slide.slide_index}`, sourceSlide: slide.slide_index,
    text: Object.fromEntries(slide.slots.filter(s => !s.nativeObject).map(s => [s.slot_id, s.suggestedField ? { field: s.suggestedField } : { review: "Bind to a content field or explicitly preserve this brand/static text" }])),
    tables: Object.fromEntries(slide.tables.map(t => [t.table_id, { review: "Bind to a matrix field or explicitly preserve" }])),
    charts: Object.fromEntries(slide.charts.map(c => [c.chart_id, { review: "Bind to a chart field or explicitly preserve" }])),
    preserveObjects: [],
  }));
}

function classification(mapping, ids, label) {
  if (!object(mapping)) throw new Error(`${label}: expected a binding map`);
  for (const key of Object.keys(mapping)) if (!ids.includes(key)) throw new Error(`${label}.${key}: target does not exist`);
  for (const id of ids) {
    const binding = mapping[id];
    if (!object(binding) || Object.keys(binding).length !== 1 || !((typeof binding.field === "string" && /^[a-zA-Z][\w-]*$/.test(binding.field)) || binding.preserve === true)) {
      throw new Error(`${label}.${id}: classify as {field: "contentName"} or {preserve: true}; template sample text cannot be silently retained`);
    }
  }
}

function checkBox(text, metrics, field, boxes) {
  if (typeof text !== "string") throw new Error(`${field}: expected a string; content was not coerced or dropped`);
  if (/\{\{[^}]+\}\}|\b(?:lorem ipsum|placeholder|xxxx+)\b/i.test(text)) throw new Error(`${field}: unresolved sample text`);
  if (!text) return 0; // Explicit empty text clears an unused editable slot.
  if (!metrics || metrics.issues?.length || !metrics.fontSize || !metrics.bounds) throw new Error(`${field}: ${metrics?.issues?.join("; ") || "font/frame unavailable"}`);
  const { w, h } = metrics.bounds;
  if (!Object.values(metrics.bounds).every(Number.isFinite) || !Number.isFinite(metrics.fontSize) || w <= 0 || h <= 0) throw new Error(`${field}: invalid or empty text frame`);
  const measurement = measureText(text, w, metrics.fontSize, { leading: metrics.leading || 1.35 });
  measurement.height += (text.split(/\r?\n/).length - 1) * (metrics.paragraphSpacing || 0);
  if (measurement.height > h + 0.015) throw new Error(`${field}: text needs ${measurement.height.toFixed(2)} in, template has ${h.toFixed(2)} in at ${metrics.fontSize} pt. Choose another template layout or revise content; no truncation or font shrinking was applied`);
  boxes.push({ field, text, ...metrics.bounds, size: metrics.fontSize, measurement });
  return measurement.height / h;
}

function fillLayout(library, layout, requested, index) {
  const source = library.slides.find(s => s.slide_index === layout.sourceSlide);
  if (!source) throw new Error(`Unknown source slide ${layout.sourceSlide}`);
  classification(layout.text, source.slots.filter(s => !s.nativeObject).map(s => s.slot_id), "text");
  classification(layout.tables, source.tables.map(t => t.table_id), "tables");
  classification(layout.charts, source.charts.map(c => c.chart_id), "charts");
  const objectIds = [...source.pictures.map(p => `picture:${p.shapeId}`), ...source.diagrams.map((d, i) => `diagram:${d.diagram_id || i}`)];
  if (!Array.isArray(layout.preserveObjects) || layout.preserveObjects.length !== objectIds.length || new Set(layout.preserveObjects).size !== objectIds.length || objectIds.some(id => !layout.preserveObjects.includes(id))) {
    throw new Error(`Review source pictures/SmartArt and explicitly preserveObjects: ${objectIds.join(", ")}. They are not replaced by text fill`);
  }
  if (!object(requested.content) || typeof requested.title !== "string" || Object.hasOwn(requested.content, "title")) throw new Error("Provide title separately and a content object");
  if (requested.notes !== undefined && typeof requested.notes !== "string") throw new Error("notes must be a string");
  const values = { ...requested.content, title: requested.title }, consumed = new Set(), boxes = [], warnings = [];
  const read = binding => {
    if (!Object.hasOwn(values, binding.field)) throw new Error(`Missing content field ${binding.field}; use an explicit empty string to clear text`);
    consumed.add(binding.field); return values[binding.field];
  };
  const result = { source_slide: source.slide_index, purpose: requested.role || requested.type || "content", replacements: [], table_edits: [], chart_edits: [], notes: requested.notes || "" };
  let score = 0;
  for (const slot of source.slots.filter(s => !s.nativeObject)) {
    const binding = layout.text[slot.slot_id];
    if (binding.preserve) continue;
    const text = read(binding);
    score = Math.max(score, checkBox(text, slot.capacity, binding.field, boxes));
    result.replacements.push({ slot_id: slot.slot_id, text });
  }
  for (const table of source.tables) {
    const binding = layout.tables[table.table_id];
    if (binding.preserve) continue;
    const matrix = read(binding);
    if (!Array.isArray(matrix) || matrix.length !== table.row_count || matrix.some(row => !Array.isArray(row) || row.length !== table.column_count)) throw new Error(`${binding.field}: native table requires exactly ${table.row_count} rows × ${table.column_count} columns, including headers; no rows can be dropped`);
    const cells = [], g = table.geometry;
    let y = g.y / 96;
    for (const row of table.rows) {
      let x = g.x / 96;
      for (const cell of row.cells) {
        const value = matrix[cell.row][cell.col], width = table.columnWidths[cell.col];
        if (cell.is_merge_slave) {
          if (value !== null) throw new Error(`${binding.field}[${cell.row}][${cell.col}]: merged slave must be null; put content in its anchor`);
        } else {
          if (!(typeof value === "string" || (typeof value === "number" && Number.isFinite(value)))) throw new Error(`${binding.field}: table cells require text or finite numbers`);
          // Merged-cell capacities depend on span dimensions; use the renderer
          // as well, never replace a merge slave or flatten the table structure.
          const spanW = table.columnWidths.slice(cell.col, cell.col + (cell.col_span || 1)).reduce((a, b) => a + b, 0);
          const spanH = table.rows.slice(cell.row, cell.row + (cell.row_span || 1)).reduce((a, b) => a + b.height, 0);
          const m = cell.margins || { marL: .1, marR: .1, marT: .05, marB: .05 };
          checkBox(String(value), { fontSize: cell.fontSize, bounds: { x: x + m.marL, y: y + m.marT, w: spanW - m.marL - m.marR, h: spanH - m.marT - m.marB } }, `${binding.field}[${cell.row}][${cell.col}]`, boxes);
          cells.push({ row: cell.row, col: cell.col, text: String(value) });
        }
        x += width;
      }
      y += row.height;
    }
    result.table_edits.push({ table_id: table.table_id, cells });
  }
  for (const chart of source.charts) {
    const binding = layout.charts[chart.chart_id];
    if (binding.preserve) continue;
    if (!chart.edit_capability?.supported) throw new Error(`${binding.field}: ${chart.edit_capability?.message || "unsupported native chart type"}`);
    if (chart.edit_capability.warnings?.length) throw new Error(`${binding.field}: template data semantics would change (${chart.edit_capability.warnings.map(w => w.message).join("; ")}); choose a compatible single-level category chart`);
    const value = read(binding);
    if (!object(value) || Object.keys(value).some(k => !["categories", "series"].includes(k)) || !Array.isArray(value.categories) || !value.categories.length || value.categories.some(c => typeof c !== "string") || !Array.isArray(value.series) || !value.series.length || value.series.some(s => !object(s) || Object.keys(s).some(k => !["name", "values"].includes(k)) || typeof s.name !== "string" || !Array.isArray(s.values) || s.values.length !== value.categories.length || s.values.some(v => typeof v !== "number" || !Number.isFinite(v)))) throw new Error(`${binding.field}: provide categories and series of matching length, with finite numeric values`);
    result.chart_edits.push({ chart_id: chart.chart_id, ...value });
    warnings.push(`Slide ${index}: native chart data will be read back; inspect chart labels visually in the template preview.`);
  }
  for (const key of Object.keys(values)) if (!consumed.has(key)) throw new Error(`Unbound content field ${key}; content cannot be silently dropped`);
  return { fill: result, model: { index, layoutId: layout.id, sourceSlide: source.slide_index, textBoxes: boxes }, score, warnings };
}

export function compileTemplatePlan(plan, library) {
  const errors = [], warnings = [], slides = [], fillSlides = [];
  const layouts = plan.template?.layouts;
  if (!Array.isArray(layouts) || !layouts.length || layouts.some(l => !l.id || l.id === "auto") || new Set(layouts.map(l => l.id)).size !== layouts.length) return { errors: ["Provide template layouts with unique IDs"], warnings, slides };
  for (const [offset, slide] of (plan.slides || []).entries()) {
    const candidates = slide.layoutId && slide.layoutId !== "auto" ? layouts.filter(l => l.id === slide.layoutId) : layouts;
    const matches = [], failures = [];
    for (const layout of candidates) {
      try { matches.push(fillLayout(library, layout, slide, offset + 1)); }
      catch (error) { failures.push(`${layout.id}: ${error.message}`); }
    }
    matches.sort((a, b) => a.score - b.score);
    if (!matches.length) errors.push(`Slide ${offset + 1}: no compatible template layout. ${failures.join(" | ") || "Unknown layout ID"}`);
    else {
      const selected = matches[0]; slides.push(selected.model); fillSlides.push(selected.fill); warnings.push(...selected.warnings);
    }
  }
  if (!plan.slides?.length) errors.push("Template plan needs at least one slide");
  return { errors, warnings, slides, sourceSha256: library.sourceSha256, fillPlan: { schema: "template_fill_pptx_plan.v1", status: "confirmed", accepted_warnings: ["host_generated_plan"], source_pptx: library.source_pptx, slides: fillSlides } };
}

export async function loadTemplateProject(plan, projectDir) {
  const source = path.resolve(projectDir, plan.template?.source || "sources/template.pptx");
  const library = JSON.parse(await fs.readFile(path.join(projectDir, "template-library.json"), "utf8"));
  const hash = sha256(await fs.readFile(source));
  if (hash !== plan.template?.sha256 || hash !== library.sourceSha256) throw new Error("Source template changed since import; re-import into a new project");
  // Re-inspect the real source for authoritative frames/fonts instead of trusting
  // manually editable library metadata to approve overflow or unknown targets.
  const actualPath = path.join(projectDir, ".build", "template-library.json");
  await runTemplateBridge("inspect", ["--source", source, "--output", actualPath]);
  const actual = JSON.parse(await fs.readFile(actualPath, "utf8"));
  return { source, library: actual, compiled: compileTemplatePlan(plan, actual) };
}

export async function buildTemplate(compiled, source, candidatePath) {
  const payload = candidatePath + ".fill-plan.json";
  await fs.writeFile(payload, JSON.stringify(compiled, null, 2));
  await runTemplateBridge("fill", ["--source", source, "--plan", payload, "--output", candidatePath]);
  return JSON.parse(await fs.readFile(candidatePath.replace(/\.pptx$/i, ".template-report.json"), "utf8"));
}
