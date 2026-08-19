#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const generatedDirectories = [
  "dist/cli",
  "dist/daemon",
  "dist/electron",
  "dist/renderer",
];

for (const relativePath of generatedDirectories) {
  const absolutePath = path.resolve(repositoryRoot, relativePath);
  const expectedPrefix = `${path.join(repositoryRoot, "dist")}${path.sep}`;
  if (!absolutePath.startsWith(expectedPrefix)) {
    throw new Error(`Refusing to clean unexpected path: ${absolutePath}`);
  }
  fs.rmSync(absolutePath, { recursive: true, force: true });
  process.stdout.write(`[clean:dist] Removed ${relativePath}\n`);
}
