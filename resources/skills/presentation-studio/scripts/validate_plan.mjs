#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "./runtime-utils.mjs";
import { validatePresentationPlan } from "./planning-contract.mjs";
import { compileLayoutPlan } from "./layout-engine.mjs";
import { loadTemplateProject } from "./template-engine.mjs";
import { validateSourceVisuals } from "./source-assets.mjs";

const args = parseArgs(process.argv.slice(2));
const projectDir = args["project-dir"] ? path.resolve(args["project-dir"]) : null;
const planPath = path.resolve(
  args.plan || (projectDir ? path.join(projectDir, "presentation-plan.json") : ""),
);

if (!args.plan && !projectDir) {
  console.error("Usage: node validate_plan.mjs --project-dir <dir> [--strict]");
  process.exit(2);
}

const plan = JSON.parse(await fs.readFile(planPath, "utf-8"));
const result = validatePresentationPlan(plan);
const sourceVisuals = await validateSourceVisuals(plan, projectDir || path.dirname(planPath));
result.errors.push(...sourceVisuals.errors);
result.sourceVisuals = sourceVisuals;
if (plan.layoutEngine === "template-v1") {
  try {
    const { compiled } = await loadTemplateProject(plan, projectDir || path.dirname(planPath));
    result.errors.push(...compiled.errors);
    result.warnings.push(...compiled.warnings);
    result.layouts = compiled.slides.map(({ index, layoutId, sourceSlide }) => ({ index, layoutId, sourceSlide }));
  } catch (error) { result.errors.push(error.message); }
}
if (plan.layoutEngine === "catalog-v1") {
  const themePath = path.join(projectDir || path.dirname(planPath), "theme.json");
  const theme = JSON.parse(await fs.readFile(themePath, "utf-8"));
  const compiled = compileLayoutPlan(plan, theme);
  result.errors.push(...compiled.errors);
  result.warnings.push(...compiled.warnings);
  result.layouts = compiled.slides.map(({ index, layoutId }) => ({ index, layoutId }));
}
result.status = result.errors.length ? "failed" : result.warnings.length ? "warning" : "passed";
console.log(JSON.stringify(result, null, 2));

if (result.errors.length > 0 || (args.strict && result.warnings.length > 0)) {
  process.exitCode = 1;
}
