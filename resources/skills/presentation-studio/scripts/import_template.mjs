#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { parseArgs } from "./runtime-utils.mjs";
import { runTemplateBridge, initialTemplateLayouts } from "./template-engine.mjs";

const args = parseArgs(process.argv.slice(2));
if (!args.source || !args["project-dir"]) throw new Error("Usage: node import_template.mjs --source company.pptx --project-dir new-project [--title title] [--language chinese]");
const source = path.resolve(args.source), destination = path.resolve(args["project-dir"]);
if (path.extname(source).toLowerCase() !== ".pptx") throw new Error("Import a native PPTX template");
await fs.access(source);
if (await fs.stat(destination).catch(() => null)) throw new Error(`Project already exists: ${destination}. Use a new directory; no project or template was overwritten.`);
await fs.mkdir(path.dirname(destination), { recursive: true });
const staging = await fs.mkdtemp(path.join(path.dirname(destination), ".template-import-"));
try {
  await promisify(execFile)(process.execPath, [fileURLToPath(new URL("./bootstrap_project.mjs", import.meta.url)), "--project-dir", staging, "--title", args.title || path.basename(source, ".pptx"), "--language", args.language || "auto"]);
  await fs.mkdir(path.join(staging, "sources"));
  const localSource = path.join(staging, "sources/template.pptx"), libraryPath = path.join(staging, "template-library.json");
  await fs.copyFile(source, localSource);
  await runTemplateBridge("inspect", ["--source", localSource, "--output", libraryPath]);
  const library = JSON.parse(await fs.readFile(libraryPath, "utf8"));
  if (!library.slide_count) throw new Error("Template contains no reusable slides");
  library.source_pptx = "sources/template.pptx";
  await fs.writeFile(libraryPath, JSON.stringify(library, null, 2));
  const planPath = path.join(staging, "presentation-plan.json");
  const plan = JSON.parse(await fs.readFile(planPath, "utf8"));
  plan.schemaVersion = "3.1"; plan.layoutEngine = "template-v1";
  delete plan.designFamily;
  plan.template = { source: "sources/template.pptx", sha256: library.sourceSha256, layouts: initialTemplateLayouts(library) };
  plan.slides = [];
  await fs.writeFile(planPath, JSON.stringify(plan, null, 2));
  await fs.writeFile(path.join(staging, "theme.json"), JSON.stringify({ mode: "preserve-template", canvas: library.canvas_px, themes: library.themes }, null, 2));
  await fs.writeFile(path.join(staging, "README.md"), "# Native template project\n\nRead the bundled presentation-studio references/template-library.md.\nReview template-library.json, classify each layout's text and native objects in presentation-plan.json, then add the requested slides. The copied source template is immutable.\n\nBuild with build_and_qa.mjs and inspect every rendered page. Fonts, dimensions, images, masters and colors come from the original template.\n");
  await fs.rename(staging, destination);
  console.log(JSON.stringify({ projectDir: destination, slides: library.slide_count, sourceSha256: library.sourceSha256, status: "imported; content bindings require review" }, null, 2));
} finally { await fs.rm(staging, { recursive: true, force: true }); }
