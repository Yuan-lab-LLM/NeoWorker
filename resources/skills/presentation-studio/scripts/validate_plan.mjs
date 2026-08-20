#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "./runtime-utils.mjs";
import { validatePresentationPlan } from "./planning-contract.mjs";

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
console.log(JSON.stringify(result, null, 2));

if (result.errors.length > 0 || (args.strict && result.warnings.length > 0)) {
  process.exitCode = 1;
}
