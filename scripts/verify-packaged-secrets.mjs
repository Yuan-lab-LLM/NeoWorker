#!/usr/bin/env node

import { extractAll } from "@electron/asar";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const ROOT = path.resolve(import.meta.dirname, "..");
const RELEASE_DIR = path.join(ROOT, "release");
const MAX_TEXT_BYTES = 64 * 1024 * 1024;

const RULES = [
  [
    "OpenAI-compatible API key",
    /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}\b/g,
  ],
  ["Anthropic API key", /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g],
  ["OpenRouter API key", /\bsk-or-v1-[A-Za-z0-9_-]{20,}\b/g],
  ["Groq API key", /\bgsk_[A-Za-z0-9_-]{20,}\b/g],
  ["Google API key", /\bAIza[0-9A-Za-z_-]{30,}\b/g],
  ["xAI API key", /\bxai-[A-Za-z0-9_-]{20,}\b/g],
  ["AWS access key", /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g],
];

const PUBLIC_DEPENDENCY_KEYS = new Map([
  [
    "node_modules/baileys/lib/WABinary/constants.js",
    new Set(["Google API key"]),
  ],
]);

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function findAsar() {
  const explicit = process.argv.find((arg) => arg.startsWith("--asar="));
  if (explicit) return path.resolve(explicit.slice("--asar=".length));

  const candidates = [
    path.join(RELEASE_DIR, "win-unpacked", "resources", "app.asar"),
    path.join(
      RELEASE_DIR,
      "mac-arm64",
      "NeoWorker.app",
      "Contents",
      "Resources",
      "app.asar",
    ),
    path.join(
      RELEASE_DIR,
      "mac",
      "NeoWorker.app",
      "Contents",
      "Resources",
      "app.asar",
    ),
  ];
  for (const candidate of candidates) {
    if (await exists(candidate)) return candidate;
  }
  throw new Error(`No packaged app.asar found under ${RELEASE_DIR}`);
}

async function walk(root) {
  const files = [];
  const pending = [root];
  while (pending.length > 0) {
    const directory = pending.pop();
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) pending.push(fullPath);
      else if (entry.isFile()) files.push(fullPath);
    }
  }
  return files;
}

function looksLikeText(buffer) {
  const sample = buffer.subarray(0, Math.min(buffer.length, 8192));
  return !sample.includes(0);
}

async function main() {
  const asarPath = await findAsar();
  const temporaryDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "neoworker-secret-audit-"),
  );
  const extractedDir = path.join(temporaryDir, "app");
  const findings = [];

  try {
    extractAll(asarPath, extractedDir);
    for (const filePath of await walk(extractedDir)) {
      const relativePath = path
        .relative(extractedDir, filePath)
        .split(path.sep)
        .join("/");
      const fileName = path.basename(filePath).toLowerCase();
      const stat = await fs.stat(filePath);
      if (stat.size === 0 || stat.size > MAX_TEXT_BYTES) continue;
      const buffer = await fs.readFile(filePath);
      if (!looksLikeText(buffer)) continue;
      const content = buffer.toString("utf8");
      if (fileName === ".env" || fileName.startsWith(".env.")) {
        const secretAssignment =
          /^(?:[A-Z0-9_]*(?:API_KEY|TOKEN|SECRET|PASSWORD|PRIVATE_KEY))\s*=\s*(?!example|replace|change|your[_-]|<)[^\s#]{8,}/gim;
        if (secretAssignment.test(content))
          findings.push(`${relativePath}: secret-bearing environment value`);
      }
      for (const [ruleName, pattern] of RULES) {
        pattern.lastIndex = 0;
        const allowedRules = PUBLIC_DEPENDENCY_KEYS.get(relativePath);
        if (pattern.test(content) && !allowedRules?.has(ruleName)) {
          findings.push(`${relativePath}: ${ruleName}`);
        }
      }
    }
  } finally {
    await fs.rm(temporaryDir, { recursive: true, force: true });
  }

  if (findings.length > 0) {
    throw new Error(`Packaged secret audit failed:\n${findings.join("\n")}`);
  }
  console.log(`Packaged secret audit passed: ${asarPath}`);
}

await main();
