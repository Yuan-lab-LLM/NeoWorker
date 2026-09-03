#!/usr/bin/env node

import { readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const connectorsRoot = path.join(root, "connectors");
const tsc = path.join(root, "node_modules", "typescript", "bin", "tsc");

if (!existsSync(tsc)) {
  throw new Error("TypeScript is not installed; run npm ci before building connectors.");
}

const entries = (await readdir(connectorsRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

for (const name of entries) {
  const config = path.join(connectorsRoot, name, "tsconfig.json");
  if (!existsSync(config)) continue;
  const result = spawnSync(process.execPath, [tsc, "-p", config], {
    cwd: root,
    stdio: "inherit",
  });
  if ((result.status ?? 1) !== 0) {
    throw new Error(`Connector build failed: ${name}`);
  }
}

console.log(`[connectors] Built ${entries.length} connector packages.`);
