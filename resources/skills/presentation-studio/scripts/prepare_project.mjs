#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { parseArgs } from "./runtime-utils.mjs";

// Keep the same runtime/preflight as standalone builds. Preparation does not
// install dependencies or ask the model to discover internal compiler APIs.
const argv = process.argv.slice(2);
const args = parseArgs(argv);
if (!args["project-dir"]) {
  console.error("Usage: node prepare_project.mjs --project-dir <new dir> [bootstrap arguments]");
  process.exit(2);
}
const base = path.dirname(fileURLToPath(import.meta.url));
for (const [script, scriptArgs] of [["preflight.mjs", []], ["bootstrap_project.mjs", argv]]) {
  const result = spawnSync(process.execPath, [path.join(base, script), ...scriptArgs], {
    encoding: "utf8", timeout: 60_000, maxBuffer: 8 * 1024 * 1024,
  });
  if (result.status !== 0 || result.error) {
    process.stderr.write(result.stderr || result.stdout || String(result.error));
    process.exit(result.status || 1);
  }
}
const projectDir = path.resolve(args["project-dir"]);
const planPath = path.join(projectDir, "presentation-plan.json");
const plan = JSON.parse(await fs.readFile(planPath, "utf8"));
const manifests = await Promise.all((plan.sourceAssetManifests || []).map(async name =>
  JSON.parse(await fs.readFile(path.join(projectDir, name), "utf8"))));
const figures = manifests.flatMap(manifest => manifest.assets || []);
const sourceInspectionBatches = [];
for (let i = 0; i < figures.length; i += 5) {
  sourceInspectionBatches.push({
    paths: figures.slice(i, i + 5).map(asset => path.resolve(projectDir, asset.path)),
    prompt: "Identify the source figure's labels, relationships, numeric evidence and readability limits concisely. Do not infer unreadable text. Keep each image identity.",
  });
}
console.log(JSON.stringify({
  status: "prepared", projectDir, planPath,
  authoringGuide: path.resolve(base, "../references/catalog-authoring.md"),
  sourceManifests: (plan.sourceAssetManifests || []).map(name => path.join(projectDir, name)),
  sourceFigureCount: figures.length, sourceInspectionBatches,
  next: "Read the authoring guide and scaffold once. Inspect these original images in batches. Complete the source-grounded plan, then run build_and_qa.mjs directly; it includes validation. Preserve original images and all sourceAssetManifests.",
}, null, 2));
