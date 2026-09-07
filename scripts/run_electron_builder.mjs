#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = path.resolve(import.meta.dirname, "..");
const PACKAGE_JSON_PATH = path.join(ROOT, "package.json");
const ELECTRON_DEPS = ["electron", "@electron/rebuild"];

/**
 * OfficeCLI is an extraResource, so electron-builder silently omits it when
 * the platform-specific build tree has not been prepared. That produced
 * packages which opened successfully but could only fall back to the
 * dependency-poor PDF/Python path. Keep the builder self-contained: every
 * desktop build must materialize the matching verified OfficeCLI binary
 * before electron-builder starts copying resources.
 */
const OFFICECLI_TARGETS = {
  darwin: { x64: "mac-x64", arm64: "mac-arm64" },
  win32: { x64: "win-x64", arm64: "win-arm64" },
  linux: { x64: "linux-x64", arm64: "linux-arm64" },
};

function hasFlag(args, name) {
  return args.some((arg) => arg === name || arg.startsWith(`${name}=`));
}

function hasAnyFlag(args, names) {
  return names.some((name) => hasFlag(args, name));
}

function targetPlatforms(args) {
  const requested = [];
  if (hasAnyFlag(args, ["--mac", "--macos", "-m"])) requested.push("darwin");
  if (hasAnyFlag(args, ["--win", "--windows", "-w"])) requested.push("win32");
  if (hasAnyFlag(args, ["--linux", "-l"])) requested.push("linux");
  return requested.length > 0 ? requested : [process.platform];
}

function targetArchitectures(args, platform) {
  if (hasFlag(args, "--universal")) return ["x64", "arm64"];
  if (hasFlag(args, "--x64")) return ["x64"];
  if (hasFlag(args, "--arm64")) return ["arm64"];
  if (hasFlag(args, "--ia32")) return ["ia32"];
  // electron-builder defaults to the host architecture for desktop builds.
  return [process.arch === "arm64" ? "arm64" : "x64"];
}

function ensureOfficeCliBundles(args) {
  for (const platform of targetPlatforms(args)) {
    const targetMap = OFFICECLI_TARGETS[platform];
    if (!targetMap) continue;
    for (const arch of targetArchitectures(args, platform)) {
      const bundleKey = targetMap[arch];
      if (!bundleKey) {
        throw new Error(
          `OfficeCLI does not publish a ${platform}/${arch} runtime. Use x64 or arm64 for desktop packaging.`,
        );
      }
      const binaryName = platform === "win32" ? "officecli.exe" : "officecli";
      const binaryPath = path.join(ROOT, "build", "officecli", bundleKey, binaryName);
      if (fs.existsSync(binaryPath)) continue;

      console.log(`[electron-builder] Preparing verified OfficeCLI runtime for ${platform}-${arch}…`);
      const setup = spawnSync(
        process.execPath,
        ["scripts/setup_officecli.mjs", "--platform", platform, "--arch", arch],
        { cwd: ROOT, env: process.env, stdio: "inherit" },
      );
      if (setup.error) throw setup.error;
      if ((setup.status ?? 1) !== 0 || !fs.existsSync(binaryPath)) {
        throw new Error(`Failed to prepare OfficeCLI runtime at ${binaryPath}`);
      }
    }
  }
}

function isFalseEnv(value) {
  return ["0", "false", "no", "off"].includes(String(value || "").trim().toLowerCase());
}

function isMacBuild(args) {
  return hasAnyFlag(args, ["--mac", "--macos", "-m"]);
}

function isCrossPlatformBuild(args) {
  const hostPlatform = process.platform;
  return targetPlatforms(args).some((platform) => platform !== hostPlatform);
}

function readPackageJson() {
  return JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, "utf8"));
}

function writePackageJson(pkg) {
  fs.writeFileSync(PACKAGE_JSON_PATH, `${JSON.stringify(pkg, null, 2)}\n`);
}

function preparePackageJsonForElectronBuilder(args) {
  const pkg = readPackageJson();
  pkg.dependencies = pkg.dependencies || {};
  pkg.devDependencies = pkg.devDependencies || {};

  let changed = false;
  for (const dep of ELECTRON_DEPS) {
    if (pkg.dependencies[dep]) {
      pkg.devDependencies[dep] = pkg.dependencies[dep];
      delete pkg.dependencies[dep];
      changed = true;
    }
  }

  if (isMacBuild(args) && process.env.NEOWORKER_MAC_UNSIGNED === "1") {
    pkg.build = pkg.build || {};
    pkg.build.mac = pkg.build.mac || {};
    pkg.build.mac.identity = "-";
    pkg.build.mac.notarize = false;
    pkg.build.mac.gatekeeperAssess = false;
    pkg.build.mac.entitlements = "build/entitlements.mac.unsigned.plist";
    pkg.build.mac.entitlementsInherit = "build/entitlements.mac.unsigned.plist";
    process.env.CSC_IDENTITY_AUTO_DISCOVERY = "false";
    changed = true;
  } else if (isMacBuild(args) && isFalseEnv(process.env.CSC_IDENTITY_AUTO_DISCOVERY)) {
    pkg.build = pkg.build || {};
    pkg.build.mac = pkg.build.mac || {};
    pkg.build.mac.identity = null;
    pkg.build.mac.notarize = false;
    pkg.build.mac.gatekeeperAssess = false;
    changed = true;
  }

  // electron-builder cannot run node-gyp for a foreign OS on the host (for
  // example, macOS -> Windows). The native modules used by NeoWorker publish
  // N-API prebuilds for each supported desktop target, and electron-builder
  // already packages those prebuilds in app.asar.unpacked. Rebuilding here
  // would both fail the cross-build and discard the verified target binary.
  if (isCrossPlatformBuild(args) && pkg.build?.npmRebuild !== false) {
    pkg.build = pkg.build || {};
    pkg.build.npmRebuild = false;
    changed = true;
    console.log(
      `[electron-builder] Skipping native dependency rebuild for cross-platform target (${process.platform} -> ${targetPlatforms(args).join(", ")}); using published N-API prebuilds.`,
    );
  }

  // The Windows resource/signing helper runs through electron-builder's
  // foreign-platform toolchain on macOS/Linux. During that step the app.asar
  // file is briefly replaced while the embedded integrity resource is updated;
  // the normal post-pack sanity probe can observe that transient path and
  // report a false ENOENT. The final archive is checked by
  // smoke-desktop-artifacts.mjs after the build completes, so skip only this
  // duplicate probe for cross-platform builds.
  if (isCrossPlatformBuild(args) && pkg.build?.disableSanityCheckAsar !== true) {
    pkg.build = pkg.build || {};
    pkg.build.disableSanityCheckAsar = true;
    changed = true;
  }

  if (changed) {
    writePackageJson(pkg);
  }

  return changed;
}

function runElectronBuilder(args) {
  const result = spawnSync("npx", ["electron-builder", ...args], {
    cwd: ROOT,
    env: process.env,
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.error) {
    throw result.error;
  }

  return result.status ?? 1;
}

function main() {
  const originalPackageJson = fs.readFileSync(PACKAGE_JSON_PATH, "utf8");
  let status = 1;

  try {
    const args = process.argv.slice(2);
    ensureOfficeCliBundles(args);
    preparePackageJsonForElectronBuilder(args);
    status = runElectronBuilder(args);
  } finally {
    fs.writeFileSync(PACKAGE_JSON_PATH, originalPackageJson);
  }

  process.exit(status);
}

main();
