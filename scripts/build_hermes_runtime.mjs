#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const SOURCE = path.join(ROOT, "scripts", "hermes-acp-neoworker-host.py");
const OUTPUT_ROOT = path.join(ROOT, "build", "hermes-runtime");
const HERMES_VERSION = "0.18.0";
const PYINSTALLER_VERSION = "6.22.2";
const EXECUTABLE_BASENAME = "hermes-acp-neoworker-host";

function log(message) {
  process.stdout.write(`[hermes-runtime] ${message}\n`);
}

function fail(message) {
  throw new Error(message);
}

function readFlag(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function readTarget() {
  const target = readFlag("--target") || process.argv.find((arg) => arg.startsWith("--target="))?.slice("--target=".length);
  if (target) {
    const separator = target.lastIndexOf("-");
    if (separator <= 0) fail(`Invalid Hermes runtime target: ${target}`);
    return {
      platform: target.slice(0, separator),
      arch: target.slice(separator + 1),
      name: target,
    };
  }
  const platform = readFlag("--platform") || process.platform;
  const arch = readFlag("--arch") || process.arch;
  return { platform, arch, name: `${platform}-${arch}` };
}

function hostTarget() {
  return `${process.platform}-${process.arch}`;
}

function executableFilename(platform) {
  return platform === "win32" ? `${EXECUTABLE_BASENAME}.exe` : EXECUTABLE_BASENAME;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || ROOT,
    env: options.env || process.env,
    encoding: "utf8",
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    shell: false,
  });
  if (result.error) fail(`${command} failed: ${result.error.message}`);
  if (result.status !== 0) {
    const detail = options.capture
      ? `\n${result.stdout || ""}${result.stderr || ""}`.trimEnd()
      : "";
    fail(`${command} exited with code ${result.status}${detail}`);
  }
  return result;
}

function tryRun(command, args) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    env: process.env,
    encoding: "utf8",
    stdio: "pipe",
    shell: false,
  });
  return result.error || result.status !== 0 ? undefined : result;
}

function resolveUv() {
  const configured = process.env.NEOWORKER_HERMES_UV?.trim();
  if (configured && tryRun(configured, ["--version"])) return configured;
  if (tryRun("uv", ["--version"])) return "uv";
  return undefined;
}

function resolvePython() {
  const configured = process.env.NEOWORKER_HERMES_BUILD_PYTHON?.trim();
  if (configured && tryRun(configured, ["--version"])) {
    return { command: configured, args: [] };
  }

  const candidates = process.platform === "win32"
    ? [
        { command: "py", args: ["-3.11"] },
        { command: "python", args: [] },
      ]
    : [
        { command: "python3.11", args: [] },
        { command: "python3", args: [] },
        { command: "python", args: [] },
      ];
  return candidates.find((candidate) => tryRun(candidate.command, [...candidate.args, "--version"]));
}

function pythonInVenv(venv, platform) {
  return path.join(
    venv,
    platform === "win32" ? "Scripts" : "bin",
    platform === "win32" ? "python.exe" : "python",
  );
}

async function installBuildDependencies(tempRoot, targetPlatform) {
  const venv = path.join(tempRoot, "venv");
  const uv = resolveUv();
  if (uv) {
    log(`Creating isolated Python 3.11 build environment with ${uv}.`);
    run(uv, ["venv", "--python", "3.11", venv]);
  } else {
    const python = resolvePython();
    if (!python) {
      fail(
        "Cannot build the embedded Hermes runtime: install uv or Python 3.11. " +
          "The end-user app still does not require either dependency.",
      );
    }
    log(`Creating isolated Python build environment with ${python.command}.`);
    run(python.command, [...python.args, "-m", "venv", venv]);
  }

  const python = pythonInVenv(venv, targetPlatform);
  if (!fs.existsSync(python)) fail(`Python virtual environment is missing ${python}`);
  const dependencies = [
    `hermes-agent[acp,mcp,anthropic,bedrock]==${HERMES_VERSION}`,
    `pyinstaller==${PYINSTALLER_VERSION}`,
  ];
  if (uv) {
    run(uv, ["pip", "install", "--python", python, ...dependencies]);
  } else {
    run(python, ["-m", "pip", "install", "--upgrade", ...dependencies]);
  }
  return python;
}

function pyInstallerArguments(python, target, tempRoot) {
  const distPath = path.join(tempRoot, "dist");
  const workPath = path.join(tempRoot, "work");
  const specPath = path.join(tempRoot, "spec");
  const hiddenImports = [
    "run_agent",
    "model_tools",
    "toolsets",
    "toolset_distributions",
    "hermes_constants",
    "hermes_bootstrap",
    "hermes_cli.env_loader",
    "hermes_cli.timeouts",
    "mcp.server.fastmcp",
    "mcp.client.stdio",
    "mcp.client.session",
    "mcp.types",
    "boto3",
    "botocore",
  ];
  const collectedPackages = [
    "acp_adapter",
    "acp",
    "agent",
    "tools",
    "providers",
    "anthropic",
    "boto3",
    "botocore",
    "s3transfer",
  ];
  const excludedModules = [
    "mcp.cli",
    "pandas",
    "numpy",
    "scipy",
    "torch",
    "matplotlib",
    "google",
    "azure",
  ];
  return [
    "-m",
    "PyInstaller",
    // Team members start separate ACP processes. A one-file executable unpacks
    // the entire Python runtime for every member before initialize can reply.
    // Ship the runtime alongside the launcher so parallel starts share files.
    "--onedir",
    "--noconfirm",
    "--clean",
    "--name",
    EXECUTABLE_BASENAME,
    "--distpath",
    distPath,
    "--workpath",
    workPath,
    "--specpath",
    specPath,
    "--copy-metadata",
    "hermes-agent",
    ...collectedPackages.flatMap((name) => ["--collect-submodules", name]),
    ...hiddenImports.flatMap((name) => ["--hidden-import", name]),
    ...excludedModules.flatMap((name) => ["--exclude-module", name]),
    SOURCE,
  ];
}

async function copyHermesLicense(python) {
  const result = run(
    python,
    [
      "-c",
      [
        "from importlib.metadata import distribution",
        "dist = distribution('hermes-agent')",
        "print(dist.locate_file(next(file for file in dist.files or [] if str(file).endswith('.dist-info/licenses/LICENSE'))))",
      ].join(";"),
    ],
    { capture: true },
  );
  const licenseSource = String(result.stdout || "").trim();
  if (!licenseSource || !fs.existsSync(licenseSource)) {
    fail(`Hermes Agent license was not found at ${licenseSource || "<empty path>"}`);
  }
  await fsp.copyFile(licenseSource, path.join(OUTPUT_ROOT, "HERMES_AGENT_LICENSE.txt"));
}

function sha256(filePath) {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

async function main() {
  if (!fs.existsSync(SOURCE)) fail(`Hermes host source is missing: ${SOURCE}`);
  const target = readTarget();
  if (target.name !== hostTarget()) {
    fail(
      `PyInstaller must run on the target platform and architecture. ` +
        `Requested ${target.name}, build host is ${hostTarget()}.`,
    );
  }

  const tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "neoworker-hermes-build-"));
  const keepTemp = process.env.NEOWORKER_KEEP_HERMES_BUILD === "1";
  try {
    const python = await installBuildDependencies(tempRoot, target.platform);
    log(`Building Hermes Agent ${HERMES_VERSION} ACP host for ${target.name}.`);
    run(python, pyInstallerArguments(python, target, tempRoot));

    const builtDistribution = path.join(tempRoot, "dist", EXECUTABLE_BASENAME);
    const builtBinary = path.join(builtDistribution, executableFilename(target.platform));
    if (!fs.existsSync(builtBinary)) fail(`PyInstaller did not produce ${builtBinary}`);
    const probe = run(builtBinary, ["--neoworker-runtime-check"], { capture: true });
    let probeResult;
    try {
      probeResult = JSON.parse(String(probe.stdout || "").trim());
    } catch (error) {
      fail(`Embedded Hermes runtime check returned invalid JSON: ${error}`);
    }
    if (
      probeResult?.ok !== true ||
      probeResult?.frozen !== true ||
      probeResult?.hostIdentity !== "NeoWorker" ||
      probeResult?.hermesAgentVersion !== HERMES_VERSION
    ) {
      fail(`Embedded Hermes runtime check failed: ${JSON.stringify(probeResult)}`);
    }

    await fsp.rm(OUTPUT_ROOT, { recursive: true, force: true });
    // Preserve relative framework/library symlinks when relocating the bundle.
    await fsp.cp(builtDistribution, OUTPUT_ROOT, { recursive: true, verbatimSymlinks: true });
    const destination = path.join(OUTPUT_ROOT, executableFilename(target.platform));
    if (target.platform !== "win32") await fsp.chmod(destination, 0o755);
    run(destination, ["--neoworker-runtime-check"], { capture: true });
    await copyHermesLicense(python);
    const manifest = {
      name: "NeoWorker embedded Hermes ACP runtime",
      hermesAgentVersion: HERMES_VERSION,
      pyInstallerVersion: PYINSTALLER_VERSION,
      platform: target.platform,
      arch: target.arch,
      distribution: "onedir",
      executable: executableFilename(target.platform),
      sha256: sha256(destination),
      license: "MIT",
      source: "https://github.com/NousResearch/hermes-agent",
      builtAt: new Date().toISOString(),
    };
    await fsp.writeFile(
      path.join(OUTPUT_ROOT, "manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
    log(`Ready: ${destination} (${Math.round(fs.statSync(destination).size / 1024 / 1024)} MB).`);
  } finally {
    if (keepTemp) {
      log(`Keeping temporary build directory: ${tempRoot}`);
    } else {
      await fsp.rm(tempRoot, { recursive: true, force: true });
    }
  }
}

main().catch((error) => {
  process.stderr.write(`[hermes-runtime] ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
