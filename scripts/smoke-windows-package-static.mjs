#!/usr/bin/env node

/**
 * Cross-platform, non-executing validation for the Windows x64 desktop
 * package.  This intentionally runs on macOS/Linux: it inspects PE headers,
 * checks bundled hashes and ASAR entries, and never launches the installer or
 * a Windows binary.
 */

import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { extractFile } from "@electron/asar";

const ROOT = path.resolve(import.meta.dirname, "..");
const DEFAULT_RELEASE_DIR = path.join(ROOT, "release");
const MIN_INSTALLER_BYTES = 100 * 1024 * 1024;
const EXPECTED_OFFICECLI_ASSET = "officecli-win-x64.exe";
const EXPECTED_OFFICECLI_SHA256 =
  "d4d4c10fced307e209744cf98a56b003a6e613424fd651b08469274704afd2c6";

const REQUIRED_PPT_SKILL_PATHS = [
  "SKILL.md",
  "LICENSE",
  "SPONSORS.md",
  "SPONSORS_CN.md",
  "THIRD_PARTY_NOTICES.md",
  "requirements.txt",
  "scripts/attribution_guard.py",
  "scripts/neoworker_preflight.py",
  "workflows/routing.md",
  "workflows/generate-pptx.md",
  "templates/README.md",
];

function parseArgs(argv) {
  const result = {
    releaseDir: DEFAULT_RELEASE_DIR,
    unpackedDir: undefined,
    expectedVersion: undefined,
    json: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = String(argv[index] || "");
    if (arg === "--json") {
      result.json = true;
    } else if (arg === "--release-dir" && argv[index + 1]) {
      result.releaseDir = path.resolve(String(argv[++index]));
    } else if (arg.startsWith("--release-dir=")) {
      result.releaseDir = path.resolve(arg.slice("--release-dir=".length));
    } else if (arg === "--unpacked-dir" && argv[index + 1]) {
      result.unpackedDir = path.resolve(String(argv[++index]));
    } else if (arg.startsWith("--unpacked-dir=")) {
      result.unpackedDir = path.resolve(arg.slice("--unpacked-dir=".length));
    } else if (arg === "--expected-version" && argv[index + 1]) {
      result.expectedVersion = String(argv[++index]);
    } else if (arg.startsWith("--expected-version=")) {
      result.expectedVersion = arg.slice("--expected-version=".length);
    } else if (arg === "--help" || arg === "-h") {
      result.help = true;
    } else if (arg.trim()) {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return result;
}

function printUsage() {
  console.log(`Usage: node scripts/smoke-windows-package-static.mjs [options]

Options:
  --release-dir=<path>       Release directory (default: ./release)
  --unpacked-dir=<path>     Existing win-unpacked directory (default: <release>/win-unpacked)
  --expected-version=<ver>  Package version (default: package.json version)
  --json                     Print the result as JSON
`);
}

async function readJson(filePath, label) {
  let content;
  try {
    content = await fs.readFile(filePath, "utf8");
  } catch (error) {
    throw new Error(`Missing ${label}: ${filePath} (${error.message})`);
  }
  try {
    return JSON.parse(content);
  } catch (error) {
    throw new Error(`Invalid JSON in ${label}: ${filePath} (${error.message})`);
  }
}

async function assertFile(filePath, label, { nonEmpty = true } = {}) {
  let stat;
  try {
    stat = await fs.stat(filePath);
  } catch (error) {
    throw new Error(`Missing ${label}: ${filePath} (${error.message})`);
  }
  if (!stat.isFile()) throw new Error(`${label} is not a file: ${filePath}`);
  if (nonEmpty && stat.size <= 0) throw new Error(`${label} is empty: ${filePath}`);
  return stat;
}

async function sha256(filePath) {
  const hash = createHash("sha256");
  hash.update(await fs.readFile(filePath));
  return hash.digest("hex");
}

/** Return a small PE header summary without invoking file/objdump/Wine. */
async function inspectPe(filePath, label, { requireX64 = false } = {}) {
  const buffer = await fs.readFile(filePath);
  if (buffer.length < 0x40 || buffer.toString("ascii", 0, 2) !== "MZ") {
    throw new Error(`${label} is not a PE file (missing MZ): ${filePath}`);
  }
  const peOffset = buffer.readUInt32LE(0x3c);
  if (peOffset < 0x40 || peOffset + 0x28 > buffer.length) {
    throw new Error(`${label} has an invalid PE header offset: ${filePath}`);
  }
  if (buffer.toString("ascii", peOffset, peOffset + 4) !== "PE\0\0") {
    throw new Error(`${label} is not a PE file (missing PE signature): ${filePath}`);
  }
  const machine = buffer.readUInt16LE(peOffset + 4);
  const optionalMagic = buffer.readUInt16LE(peOffset + 24);
  const isX64 = machine === 0x8664 && optionalMagic === 0x20b;
  if (requireX64 && !isX64) {
    throw new Error(
      `${label} is not Windows x64 PE (machine=0x${machine.toString(16)}, optional=0x${optionalMagic.toString(16)}): ${filePath}`,
    );
  }
  return {
    size: buffer.length,
    machine: `0x${machine.toString(16)}`,
    optionalHeader: `0x${optionalMagic.toString(16)}`,
    x64: isX64,
  };
}

function versionPattern(version) {
  return new RegExp(`(^|[^0-9A-Za-z])${String(version).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=[^0-9A-Za-z]|$)`);
}

async function findWindowsInstaller(releaseDir, expectedVersion) {
  const entries = await fs.readdir(releaseDir, { withFileTypes: true });
  const pattern = versionPattern(expectedVersion);
  const candidates = entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) =>
      /\.exe$/i.test(name) &&
      !/\.blockmap$/i.test(name) &&
      !/^uninstall/i.test(name) &&
      /(?:windows|win)[-_]x64[-_]setup/i.test(name) &&
      pattern.test(name),
    )
    .map((name) => path.join(releaseDir, name));
  if (candidates.length !== 1) {
    throw new Error(
      `Expected exactly one Windows x64 installer for ${expectedVersion} in ${releaseDir}; found ${candidates.map((filePath) => path.basename(filePath)).join(", ") || "none"}`,
    );
  }
  return candidates[0];
}

function assertSafeChild(root, candidate, label) {
  const resolvedRoot = path.resolve(root);
  const resolvedCandidate = path.resolve(candidate);
  if (
    resolvedCandidate !== resolvedRoot &&
    !resolvedCandidate.startsWith(`${resolvedRoot}${path.sep}`)
  ) {
    throw new Error(`${label} escapes its package resource directory: ${candidate}`);
  }
  return resolvedCandidate;
}

async function assertAsarEntry(asarPath, entryPath, label, predicate) {
  let data;
  try {
    // @electron/asar traverses archive entries with the host platform's path
    // separator. Forward-slash package paths work on macOS/Linux but are read
    // as one directory name on Windows unless normalized first.
    data = extractFile(asarPath, path.normalize(entryPath));
  } catch (error) {
    throw new Error(`Missing ${label} in app.asar at ${entryPath}: ${error.message}`);
  }
  if (!data || data.length === 0) throw new Error(`${label} is empty in app.asar: ${entryPath}`);
  if (predicate && !predicate(data)) throw new Error(`${label} failed content validation in app.asar: ${entryPath}`);
  return data;
}

async function validateNativePrebuilds(unpackedDir) {
  const unpackedRoot = path.join(unpackedDir, "resources", "app.asar.unpacked");
  const nativeFiles = [
    [
      "better-sqlite3 Windows x64 prebuild",
      path.join(unpackedRoot, "node_modules", "better-sqlite3", "prebuilds", "win32-x64.node"),
    ],
    [
      "node-pty Windows x64 pty prebuild",
      path.join(unpackedRoot, "node_modules", "node-pty", "prebuilds", "win32-x64", "pty.node"),
    ],
    [
      "node-pty Windows x64 conpty prebuild",
      path.join(unpackedRoot, "node_modules", "node-pty", "prebuilds", "win32-x64", "conpty.node"),
    ],
  ];
  const result = [];
  for (const [label, filePath] of nativeFiles) {
    await assertFile(filePath, label);
    result.push({ label, path: filePath, pe: await inspectPe(filePath, label, { requireX64: true }) });
  }
  return result;
}

async function validateWindowsPackage(options) {
  const releaseDir = path.resolve(options.releaseDir);
  const expectedVersion = options.expectedVersion ||
    (await readJson(path.join(ROOT, "package.json"), "package.json")).version;
  const unpackedDir = path.resolve(options.unpackedDir || path.join(releaseDir, "win-unpacked"));
  const resourcesRoot = path.join(unpackedDir, "resources");

  const installerPath = await findWindowsInstaller(releaseDir, expectedVersion);
  const installerStat = await assertFile(installerPath, "Windows x64 installer");
  if (installerStat.size < MIN_INSTALLER_BYTES) {
    throw new Error(
      `Windows x64 installer is unexpectedly small (${installerStat.size} bytes; minimum ${MIN_INSTALLER_BYTES}): ${installerPath}`,
    );
  }
  const installerPe = await inspectPe(installerPath, "Windows x64 installer");

  await assertFile(path.join(unpackedDir, "NeoWorker.exe"), "Windows unpacked NeoWorker executable");
  const neoWorkerPe = await inspectPe(path.join(unpackedDir, "NeoWorker.exe"), "NeoWorker.exe", { requireX64: true });

  const officeRoot = path.join(resourcesRoot, "officecli");
  const officeManifest = await readJson(path.join(officeRoot, "manifest.json"), "OfficeCLI manifest");
  if (officeManifest.asset !== EXPECTED_OFFICECLI_ASSET) {
    throw new Error(`OfficeCLI asset mismatch: expected ${EXPECTED_OFFICECLI_ASSET}, got ${officeManifest.asset || "<missing>"}`);
  }
  if (String(officeManifest.sha256 || "").toLowerCase() !== EXPECTED_OFFICECLI_SHA256) {
    throw new Error(`OfficeCLI manifest SHA256 mismatch: expected ${EXPECTED_OFFICECLI_SHA256}, got ${officeManifest.sha256 || "<missing>"}`);
  }
  const officeBinary = path.join(officeRoot, "officecli.exe");
  await assertFile(officeBinary, "OfficeCLI Windows x64 executable");
  const officePe = await inspectPe(officeBinary, "OfficeCLI", { requireX64: true });
  const officeHash = await sha256(officeBinary);
  if (officeHash !== EXPECTED_OFFICECLI_SHA256) {
    throw new Error(`OfficeCLI SHA256 mismatch: expected ${EXPECTED_OFFICECLI_SHA256}, got ${officeHash}`);
  }

  const numbatRoot = path.join(resourcesRoot, "numbat");
  const numbatManifest = await readJson(path.join(numbatRoot, "manifest.json"), "Numbat manifest");
  const numbatTarget = numbatManifest.targets?.["win32-x64"];
  if (!numbatTarget?.path || !numbatTarget?.sha256) {
    throw new Error("Numbat manifest is missing the win32-x64 target and SHA256");
  }
  const numbatBinary = assertSafeChild(numbatRoot, path.join(numbatRoot, numbatTarget.path), "Numbat target");
  await assertFile(numbatBinary, "Numbat Windows x64 executable");
  const numbatPe = await inspectPe(numbatBinary, "Numbat", { requireX64: true });
  const numbatHash = await sha256(numbatBinary);
  if (numbatHash.toLowerCase() !== String(numbatTarget.sha256).toLowerCase()) {
    throw new Error(`Numbat SHA256 mismatch: expected ${numbatTarget.sha256}, got ${numbatHash}`);
  }

  const asarPath = path.join(resourcesRoot, "app.asar");
  await assertFile(asarPath, "packaged app.asar");
  const packageJsonBuffer = await assertAsarEntry(asarPath, "package.json", "packaged package.json");
  const packagedPackage = JSON.parse(packageJsonBuffer.toString("utf8"));
  if (String(packagedPackage.version || "") !== String(expectedVersion)) {
    throw new Error(`Packaged app version mismatch: expected ${expectedVersion}, got ${packagedPackage.version || "<missing>"}`);
  }
  await assertAsarEntry(asarPath, "dist/electron/electron/main.js", "Electron main.js", (data) => data.includes(Buffer.from("app.whenReady")) || data.includes(Buffer.from("electron")));
  await assertAsarEntry(asarPath, "dist/renderer/index.html", "renderer index.html", (data) => /<html[\s>]/i.test(data.toString("utf8")));

  const nativePrebuilds = await validateNativePrebuilds(unpackedDir);

  const skillRoot = path.join(resourcesRoot, "skills", "ppt-master");
  const missingSkillPaths = [];
  for (const relativePath of REQUIRED_PPT_SKILL_PATHS) {
    try {
      await assertFile(path.join(skillRoot, relativePath), `PPT Master resource ${relativePath}`);
    } catch {
      missingSkillPaths.push(relativePath);
    }
  }
  if (missingSkillPaths.length > 0) {
    throw new Error(`PPT Master skill is incomplete; missing: ${missingSkillPaths.join(", ")}`);
  }
  await assertFile(path.join(resourcesRoot, "skills", "ppt-master.json"), "PPT Master skill manifest");

  return {
    platform: "win32",
    architecture: "x64",
    host: process.platform,
    expectedVersion,
    installer: { path: installerPath, bytes: installerStat.size, pe: installerPe },
    unpacked: unpackedDir,
    neoWorker: neoWorkerPe,
    officeCli: { path: officeBinary, sha256: officeHash, pe: officePe, asset: officeManifest.asset },
    numbat: { path: numbatBinary, sha256: numbatHash, pe: numbatPe },
    appAsar: asarPath,
    nativePrebuilds,
    pptMasterResources: REQUIRED_PPT_SKILL_PATHS.length + 1,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printUsage();
    return;
  }
  const result = await validateWindowsPackage(options);
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`[windows-static-smoke] passed on ${process.platform}:`);
    console.log(`  installer: ${path.basename(result.installer.path)} (${result.installer.bytes} bytes, PE)`);
    console.log(`  NeoWorker/OfficeCLI/Numbat: PE x64`);
    console.log(`  OfficeCLI: ${result.officeCli.asset}, sha256=${result.officeCli.sha256}`);
    console.log(`  app.asar: main.js + renderer/index.html present`);
    console.log(`  native prebuilds: ${result.nativePrebuilds.length} Windows x64 modules`);
    console.log(`  PPT Master resources: ${result.pptMasterResources} required paths`);
    console.log("  no Windows executable or installer was launched");
  }
}

main().catch((error) => {
  console.error(`[windows-static-smoke] ${error instanceof Error ? error.stack || error.message : String(error)}`);
  process.exitCode = 1;
});
