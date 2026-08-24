#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmod,
  copyFile,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const VERSION = "1.0.143";
const RELEASE_TAG = `v${VERSION}`;
const RELEASE_BASE = `https://github.com/iOfficeAI/OfficeCLI/releases/download/${RELEASE_TAG}`;
const ATTRIBUTION_DIR = path.join(ROOT, "resources", "third-party", "officecli");

const ASSETS = {
  "darwin-arm64": {
    bundleKey: "mac-arm64",
    asset: "officecli-mac-arm64",
    sha256: "2f158d46f9b6c5eb0dfe4eb02038114001e17acc47b67347417c56dcf9659096",
  },
  "darwin-x64": {
    bundleKey: "mac-x64",
    asset: "officecli-mac-x64",
    sha256: "693d243db616c74705fec9d92fdfc8a3db36acfcea378edb7264c2a30d339d9c",
  },
  "linux-arm64": {
    bundleKey: "linux-arm64",
    asset: "officecli-linux-arm64",
    sha256: "c50298e4698fcd1b15fe1a0f096405ad260b5c84d4440882582d0bba1e57bd49",
  },
  "linux-x64": {
    bundleKey: "linux-x64",
    asset: "officecli-linux-x64",
    sha256: "6a29c598a789b57c92c03e560907d3f131a4bd0a068785b1d338a86fc31a58a7",
  },
  "win32-arm64": {
    bundleKey: "win-arm64",
    asset: "officecli-win-arm64.exe",
    sha256: "51baf511fe136ee216fcc13cf0da9d18078da42212b22805c3a81f4163a4d7b9",
  },
  "win32-x64": {
    bundleKey: "win-x64",
    asset: "officecli-win-x64.exe",
    sha256: "d4d4c10fced307e209744cf98a56b003a6e613424fd651b08469274704afd2c6",
  },
};

function readFlag(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function log(message) {
  process.stdout.write(`[officecli] ${message}\n`);
}

async function sha256(filePath) {
  const content = await readFile(filePath);
  return createHash("sha256").update(content).digest("hex");
}

async function isValidBinary(filePath, expectedSha) {
  try {
    return (await stat(filePath)).isFile() && (await sha256(filePath)) === expectedSha;
  } catch {
    return false;
  }
}

async function download(url, destination) {
  const response = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) {
    throw new Error(`Download failed (${response.status} ${response.statusText}): ${url}`);
  }
  const tempPath = `${destination}.download`;
  await writeFile(tempPath, Buffer.from(await response.arrayBuffer()));
  await rename(tempPath, destination);
}

function localCandidates(platform, arch) {
  if (platform !== process.platform || arch !== process.arch) return [];
  const binaryName = platform === "win32" ? "officecli.exe" : "officecli";
  return [
    process.env.NEOWORKER_OFFICECLI_PATH,
    process.env.OFFICECLI_PATH,
    path.join(os.homedir(), ".local", "bin", binaryName),
    platform === "darwin" ? path.join("/opt/homebrew/bin", binaryName) : undefined,
    platform !== "win32" ? path.join("/usr/local/bin", binaryName) : undefined,
  ].filter(Boolean);
}

async function ensureAttribution(targetDir) {
  const files = ["LICENSE", "NOTICE"];
  for (const filename of files) {
    const source = path.join(ATTRIBUTION_DIR, filename);
    if (!(await stat(source)).isFile()) {
      throw new Error(`OfficeCLI attribution file is missing: ${source}`);
    }
    await copyFile(source, path.join(targetDir, filename));
  }
}

async function main() {
  if (["1", "true", "yes"].includes(String(process.env.NEOWORKER_SKIP_OFFICECLI || "").toLowerCase())) {
    log("Skipped because NEOWORKER_SKIP_OFFICECLI is enabled.");
    return;
  }

  const platform = readFlag("--platform") || process.platform;
  const arch = readFlag("--arch") || process.arch;
  const asset = ASSETS[`${platform}-${arch}`];
  if (!asset) {
    throw new Error(`OfficeCLI does not publish a NeoWorker bundle for ${platform}-${arch}.`);
  }

  const targetDir = path.join(ROOT, "build", "officecli", asset.bundleKey);
  const binaryName = platform === "win32" ? "officecli.exe" : "officecli";
  const destination = path.join(targetDir, binaryName);
  await mkdir(targetDir, { recursive: true });

  if (!(await isValidBinary(destination, asset.sha256))) {
    await rm(destination, { force: true });
    let copied = false;
    for (const candidate of localCandidates(platform, arch)) {
      if (!(await isValidBinary(candidate, asset.sha256))) continue;
      await copyFile(candidate, destination);
      copied = true;
      log(`Using the verified local OfficeCLI ${VERSION} binary.`);
      break;
    }
    if (!copied) {
      log(`Downloading OfficeCLI ${VERSION} for ${platform}-${arch}…`);
      await download(`${RELEASE_BASE}/${asset.asset}`, destination);
    }
  }

  const actualSha = await sha256(destination);
  if (actualSha !== asset.sha256) {
    await rm(destination, { force: true });
    throw new Error(`OfficeCLI checksum mismatch: expected ${asset.sha256}, received ${actualSha}.`);
  }
  if (platform !== "win32") await chmod(destination, 0o755);
  await ensureAttribution(targetDir);
  await writeFile(
    path.join(targetDir, "manifest.json"),
    `${JSON.stringify(
      {
        name: "OfficeCLI",
        version: VERSION,
        source: "https://github.com/iOfficeAI/OfficeCLI",
        release: `${RELEASE_BASE}/${asset.asset}`,
        license: "Apache-2.0",
        asset: asset.asset,
        sha256: asset.sha256,
      },
      null,
      2,
    )}\n`,
  );

  if (platform === process.platform && arch === process.arch) {
    try {
      const version = execFileSync(destination, ["--version"], { encoding: "utf8" }).trim();
      if (!version.includes(VERSION)) {
        throw new Error(`Unexpected version output: ${version}`);
      }
      log(`Ready: ${destination} (${version})`);
    } catch (error) {
      throw new Error(`Bundled OfficeCLI could not start: ${error instanceof Error ? error.message : error}`);
    }
  } else {
    log(`Ready: ${destination}`);
  }
}

main().catch((error) => {
  process.stderr.write(`[officecli] ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
