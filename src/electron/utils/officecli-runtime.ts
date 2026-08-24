import * as fs from "fs";
import * as fsPromises from "fs/promises";
import { spawn } from "child_process";
import * as os from "os";
import * as path from "path";

export interface OfficeCliRuntimeContext {
  platform?: NodeJS.Platform;
  arch?: string;
  resourcesPath?: string;
  cwd?: string;
}

export interface OfficeCliHealthReport {
  ready: boolean;
  executable?: string;
  version?: string;
  checkedAt: string;
  diagnosticCode?: "OFFICE_TOOL_NOT_FOUND" | "OFFICE_TOOL_VERSION_FAILED" | "OFFICE_TOOL_SMOKE_FAILED";
  message: string;
}

type OfficeCliHealthRunner = (
  executable: string,
  args: string[],
) => Promise<{ stdout: string; stderr: string }>;

let cachedHealth: Promise<OfficeCliHealthReport> | undefined;

function runHealthCommand(executable: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      env: { ...process.env, OFFICECLI_NO_AUTO_RESIDENT: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Office tools health check timed out."));
    }, 20_000);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(stderr.trim() || `Office tools exited with code ${code}.`));
    });
  });
}

function officeCliOsName(platform: NodeJS.Platform): string {
  if (platform === "darwin") return "mac";
  if (platform === "win32") return "win";
  return "linux";
}

export function getOfficeCliBundleKey(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
): string {
  return `${officeCliOsName(platform)}-${arch}`;
}

export function getOfficeCliBinaryName(
  platform: NodeJS.Platform = process.platform,
): string {
  return platform === "win32" ? "officecli.exe" : "officecli";
}

/**
 * Returns the OfficeCLI copies owned by NeoWorker. The packaged copy comes
 * first; the build-tree copy makes the same runtime available in Electron dev.
 */
export function getBundledOfficeCliCandidates(
  context: OfficeCliRuntimeContext = {},
): string[] {
  const platform = context.platform || process.platform;
  const arch = context.arch || process.arch;
  const resourcesPath = context.resourcesPath ?? process.resourcesPath;
  const cwd = context.cwd || process.cwd();
  const binaryName = getOfficeCliBinaryName(platform);
  const bundleKey = getOfficeCliBundleKey(platform, arch);
  const candidates = [
    resourcesPath ? path.join(resourcesPath, "officecli", binaryName) : undefined,
    path.join(cwd, "build", "officecli", bundleKey, binaryName),
    path.join(path.resolve(__dirname, "../../../.."), "build", "officecli", bundleKey, binaryName),
  ].filter((value): value is string => Boolean(value));

  return Array.from(new Set(candidates));
}

export function getOfficeCliExecutableCandidates(explicit?: string): string[] {
  const platform = process.platform;
  const binaryName = getOfficeCliBinaryName(platform);
  const userOverrides = [explicit, process.env.NEOWORKER_OFFICECLI_PATH, process.env.OFFICECLI_PATH];
  const systemCandidates = [
    path.join(os.homedir(), ".local", "bin", binaryName),
    platform === "win32"
      ? path.join(process.env.LOCALAPPDATA || "", "officecli", binaryName)
      : undefined,
    platform === "darwin" ? path.join("/opt/homebrew/bin", binaryName) : undefined,
    platform !== "win32" ? path.join("/usr/local/bin", binaryName) : undefined,
    binaryName,
  ];

  return Array.from(
    new Set(
      [...userOverrides, ...getBundledOfficeCliCandidates(), ...systemCandidates].filter(
        (value): value is string => Boolean(value?.trim()),
      ),
    ),
  );
}

export function resolveBundledOfficeCliExecutable(
  context: OfficeCliRuntimeContext = {},
): string | null {
  for (const candidate of getBundledOfficeCliCandidates(context)) {
    try {
      if (fs.statSync(candidate).isFile()) return candidate;
    } catch {
      // Try the next development or packaged location.
    }
  }
  return null;
}

/**
 * Makes the NeoWorker-owned binary available to child shells and skill
 * eligibility checks. Explicit OFFICECLI_PATH overrides remain supported by
 * the quality runner, but the embedded copy is the default for normal use.
 */
export function installBundledOfficeCliRuntime(): string | null {
  const executable = resolveBundledOfficeCliExecutable();
  if (!executable) return null;

  const directory = path.dirname(executable);
  const currentPath = String(process.env.PATH || "")
    .split(path.delimiter)
    .filter(Boolean);
  process.env.PATH = [directory, ...currentPath.filter((entry) => entry !== directory)].join(
    path.delimiter,
  );
  process.env.NEOWORKER_BUNDLED_OFFICECLI_PATH = executable;
  return executable;
}

/**
 * Locates the executable, verifies its version, then creates and validates a
 * minimal OOXML file. The promise is cached for the process lifetime and can
 * be invalidated after an update or a runtime failure.
 */
export function checkOfficeCliHealth(options: {
  candidates?: string[];
  runner?: OfficeCliHealthRunner;
  force?: boolean;
} = {}): Promise<OfficeCliHealthReport> {
  if (cachedHealth && !options.force) return cachedHealth;
  const runner = options.runner || runHealthCommand;
  cachedHealth = (async () => {
    const checkedAt = new Date().toISOString();
    let executable: string | undefined;
    for (const candidate of options.candidates || getOfficeCliExecutableCandidates()) {
      if (candidate === getOfficeCliBinaryName()) {
        executable = candidate;
        break;
      }
      try {
        if (fs.statSync(candidate).isFile()) {
          executable = candidate;
          break;
        }
      } catch {
        // Try the next packaged or explicitly configured binary.
      }
    }
    if (!executable) {
      return {
        ready: false,
        checkedAt,
        diagnosticCode: "OFFICE_TOOL_NOT_FOUND",
        message: "Office工具未就绪：未找到本地运行文件。",
      };
    }
    let version = "";
    try {
      version = (await runner(executable, ["--version"])).stdout.trim().split(/\r?\n/)[0] || "unknown";
    } catch {
      return {
        ready: false,
        executable,
        checkedAt,
        diagnosticCode: "OFFICE_TOOL_VERSION_FAILED",
        message: "Office工具未就绪：版本检查失败。",
      };
    }
    const directory = await fsPromises.mkdtemp(path.join(os.tmpdir(), "neoworker-office-health-"));
    const smokePath = path.join(directory, "smoke.docx");
    try {
      await runner(executable, ["create", smokePath, "--locale", "zh-CN", "--force", "--json"]);
      await runner(executable, ["validate", smokePath, "--json"]);
      const stat = await fsPromises.stat(smokePath);
      if (!stat.isFile() || stat.size <= 0) throw new Error("Smoke file is empty.");
      return {
        ready: true,
        executable,
        version,
        checkedAt,
        message: "Office工具已就绪。",
      };
    } catch {
      return {
        ready: false,
        executable,
        version,
        checkedAt,
        diagnosticCode: "OFFICE_TOOL_SMOKE_FAILED",
        message: "Office工具未就绪：最小文件检查失败。",
      };
    } finally {
      await fsPromises.rm(directory, { recursive: true, force: true }).catch(() => undefined);
    }
  })();
  return cachedHealth;
}

export function invalidateOfficeCliHealthCache(): void {
  cachedHealth = undefined;
}
