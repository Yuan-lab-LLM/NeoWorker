#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

function readFlag(name) {
  const prefix = `--${name}=`;
  const match = process.argv.slice(2).find((argument) => argument.startsWith(prefix));
  return match ? match.slice(prefix.length) : undefined;
}

function parsePositiveInteger(value, fallback) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`Expected a non-negative integer, received: ${value}`);
  }
  return parsed;
}

async function main() {
  const repositoryRoot = path.resolve(__dirname, "..", "..");
  const modulePath = path.join(
    repositoryRoot,
    "dist",
    "electron",
    "electron",
    "utils",
    "office-artifact-release-gate.js",
  );
  if (!fs.existsSync(modulePath)) {
    throw new Error("Office release gate is not built. Run npm run build:electron first.");
  }

  const workspacePath = path.resolve(
    readFlag("workspace") ||
      process.env.NEOWORKER_OFFICE_ACCEPTANCE_WORKSPACE ||
      process.cwd(),
  );
  const minimumPublishedPerFormat = parsePositiveInteger(
    readFlag("minimum") || process.env.NEOWORKER_OFFICE_MINIMUM_ACCEPTANCE_RUNS,
    20,
  );
  const json = process.argv.includes("--json");
  const { evaluateOfficeArtifactReleaseGate } = require(modulePath);
  const report = await evaluateOfficeArtifactReleaseGate(workspacePath, {
    minimumPublishedPerFormat,
  });

  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`Office artifact release gate: ${report.passed ? "PASSED" : "BLOCKED"}`);
    console.log(`Workspace: ${workspacePath}`);
    console.log(
      `Published: ${report.stats.published} (DOCX ${report.stats.publishedByFormat.docx}, PPTX ${report.stats.publishedByFormat.pptx}, XLSX ${report.stats.publishedByFormat.xlsx})`,
    );
    console.log(`First-pass quality rate: ${(report.stats.firstPassRate * 100).toFixed(1)}%`);
    for (const blocker of report.blockers) {
      console.error(`- [${blocker.code}] ${blocker.message}`);
    }
  }
  if (!report.passed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`Office artifact release gate failed to run: ${error.message || error}`);
  process.exitCode = 2;
});
