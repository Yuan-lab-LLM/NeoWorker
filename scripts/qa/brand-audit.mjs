import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repositoryRoot = path.resolve(import.meta.dirname, "../..");
const legacyBrandPattern = /(?:nova[-_ ]?ready|co[- ]?work(?!er)|quiverready|crewwork)/i;

const contentAllowlist = new Set([
  "LICENSE",
  "README.md",
  "scripts/qa/brand-audit.mjs",
  "src/electron/migrations/legacy-brand-compat.ts",
  "src/electron/migrations/__tests__/legacy-brand-compat.test.ts",
  "src/electron/utils/__tests__/user-data-dir.test.ts",
  "src/electron/settings/__tests__/personality-manager.test.ts",
  "src/electron/settings/personality-manager.ts",
  "src/electron/settings/appearance-manager.ts",
  "src/electron/settings/__tests__/appearance-manager.test.ts",
  "src/renderer/utils/legacy-brand-storage-migration.ts",
  "src/renderer/utils/__tests__/legacy-brand-storage-migration.test.ts",
  "src/renderer/components/__tests__/main-content-markdown-normalization.test.ts",
  "src/shared/legacy-product-brand.ts",
  "src/shared/__tests__/legacy-product-brand.test.ts",
]);

const genericCoworkerAllowlist = new Set([
  "connectors/google-workspace-mcp/src/index.ts",
  "src/shared/mailbox.ts",
  "src/renderer/components/__tests__/task-pause-banner.test.ts",
]);

const gitResult = spawnSync(
  "git",
  ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
  { cwd: repositoryRoot, encoding: "buffer" },
);

if (gitResult.status !== 0) {
  process.stderr.write(gitResult.stderr?.toString("utf8") || "Unable to list repository files.\n");
  process.exit(1);
}

const files = gitResult.stdout
  .toString("utf8")
  .split("\0")
  .filter(Boolean);

const failures = [];

for (const relativePath of files) {
  if (
    relativePath.startsWith(".novaready/") ||
    relativePath.startsWith(".cowork/")
  ) continue;
  if (
    relativePath.startsWith("ref/") ||
    relativePath.startsWith("dist/") ||
    relativePath.startsWith("release/") ||
    relativePath.startsWith("node_modules/") ||
    relativePath.includes("/.build/")
  ) {
    continue;
  }

  const absolutePath = path.join(repositoryRoot, relativePath);
  let buffer;
  try {
    const stat = fs.statSync(absolutePath);
    if (!stat.isFile()) continue;
    buffer = fs.readFileSync(absolutePath);
  } catch {
    continue;
  }

  if (legacyBrandPattern.test(relativePath)) {
    failures.push(`${relativePath}: legacy brand in path`);
  }

  if (contentAllowlist.has(relativePath)) continue;

  if (buffer.includes(0)) continue;
  const text = buffer.toString("utf8");
  if (!legacyBrandPattern.test(text)) continue;

  if (
    genericCoworkerAllowlist.has(relativePath) &&
    !/(?:nova[-_ ]?ready|co[- ]?work(?!er)|quiverready|crewwork)/i.test(
      text.replace(/\bcoworker\b/gi, ""),
    )
  ) {
    continue;
  }

  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    if (legacyBrandPattern.test(lines[index])) {
      failures.push(`${relativePath}:${index + 1}: ${lines[index].trim()}`);
    }
  }
}

if (failures.length > 0) {
  process.stderr.write(`Legacy brand audit failed (${failures.length} finding(s)):\n`);
  process.stderr.write(`${failures.join("\n")}\n`);
  process.exit(1);
}

process.stdout.write(`NeoWorker brand audit passed (${files.length} repository files scanned).\n`);
