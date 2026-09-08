/**
 * Sandbox Factory
 *
 * Provides a unified interface for sandbox implementations and factory
 * function to create the appropriate sandbox based on platform and availability.
 *
 * Supports:
 * - macOS sandbox-exec (native, preferred on macOS)
 * - Docker containers (cross-platform)
 * - No sandbox (fallback)
 */

import { Workspace } from "../../../shared/types";
import { MacOSSandbox } from "./macos-sandbox";
import { DockerSandbox } from "./docker-sandbox";
import { spawn, type ChildProcess } from "child_process";
import * as os from "os";
import * as path from "path";
import { createSecureTempFile } from "./security-utils";
import { existsSync } from "fs";

/**
 * Sandbox type enumeration
 */
export type SandboxType = "macos" | "docker" | "none";

/**
 * Sandbox execution options
 */
export interface SandboxOptions {
  /** Working directory for command execution */
  cwd?: string;
  /** Command execution timeout in milliseconds */
  timeout?: number;
  /** Maximum output size in bytes */
  maxOutputSize?: number;
  /** Allow network access */
  allowNetwork?: boolean;
  /** Additional allowed paths for read access */
  allowedReadPaths?: string[];
  /** Additional allowed paths for write access */
  allowedWritePaths?: string[];
  /** Environment variables to pass through */
  envPassthrough?: string[];
  /** Called with the backing process once the sandbox starts it. */
  onProcess?: (process: ChildProcess) => void;
}

/**
 * Sandbox execution result
 */
export interface SandboxResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  killed: boolean;
  timedOut: boolean;
  signal?: string | null;
  error?: string;
}

/**
 * Unified sandbox interface
 * All sandbox implementations must implement this interface
 */
export interface ISandbox {
  /** The type of sandbox implementation */
  readonly type: SandboxType;

  /**
   * Initialize the sandbox environment
   * Must be called before execute()
   */
  initialize(): Promise<void>;

  /**
   * Execute a command in the sandbox
   */
  execute(command: string, args?: string[], options?: SandboxOptions): Promise<SandboxResult>;

  /**
   * Execute code in the sandbox (Python or JavaScript)
   */
  executeCode(code: string, language: "python" | "javascript"): Promise<SandboxResult>;

  /**
   * Cleanup sandbox resources
   */
  cleanup(): void;
}

/**
 * Windows command helpers.
 *
 * `child_process.spawn()` does not invoke a command interpreter when
 * `shell:false` is used.  That is correct for an .exe, but it breaks Windows
 * builtins (`echo`, `dir`, `where`, ...), .cmd/.bat shims, and the common
 * `python3` spelling.  Keep the conversion in one place so the no-sandbox
 * fallback behaves like the sandboxed shell path.
 */
function resolveWindowsCmd(): string {
  const systemRoot = process.env.SystemRoot || process.env.WINDIR || "C:\\Windows";
  return process.env.ComSpec || path.join(systemRoot, "System32", "cmd.exe");
}

function resolveWindowsPowerShell(): string {
  const systemRoot = process.env.SystemRoot || process.env.WINDIR || "C:\\Windows";
  const windowsPowerShell = path.join(
    systemRoot,
    "System32",
    "WindowsPowerShell",
    "v1.0",
    "powershell.exe",
  );
  // PowerShell 7 is useful for Unix-style command syntax, but do not require
  // it: Windows PowerShell ships with supported Windows versions.
  const programFiles =
    process.env.ProgramW6432 || process.env.ProgramFiles || "C:\\Program Files";
  const pwsh = path.join(programFiles, "PowerShell", "7", "pwsh.exe");
  return existsSync(pwsh) ? pwsh : windowsPowerShell;
}

const WINDOWS_SHELL_BUILTINS = new Set([
  "assoc",
  "break",
  "call",
  "cd",
  "chcp",
  "cls",
  "color",
  "copy",
  "date",
  "del",
  "dir",
  "echo",
  "endlocal",
  "erase",
  "exit",
  "for",
  "ftype",
  "if",
  "md",
  "mkdir",
  "move",
  "path",
  "pause",
  "popd",
  "prompt",
  "pushd",
  "rd",
  "ren",
  "rename",
  "rmdir",
  "set",
  "setlocal",
  "shift",
  "start",
  "time",
  "title",
  "type",
  "ver",
  "verify",
  "vol",
]);

function stripWindowsOuterQuotes(value: string): string {
  const trimmed = String(value || "").trim();
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function windowsCommandBasename(command: string): string {
  const unquoted = stripWindowsOuterQuotes(command);
  return path.win32.basename(unquoted).toLowerCase();
}

type WindowsScriptInvocation = {
  scriptPath: string;
  inlineArguments: string;
};

function parseWindowsScriptInvocation(command: string): WindowsScriptInvocation | null {
  const text = String(command || "").trim();
  if (!text) return null;

  // Accept both a quoted path (required when the path contains spaces) and a
  // plain path. Keep the remainder as PowerShell source so quoted arguments,
  // switches, and paths are parsed by the native Windows command line parser.
  const match = text.match(
    /^(?:"([^"]+\.(?:ps1|psm1))"|'([^']+\.(?:ps1|psm1))'|([^\s"']+\.(?:ps1|psm1)))(?:\s+([\s\S]*))?$/i,
  );
  if (!match) return null;
  return {
    scriptPath: match[1] ?? match[2] ?? match[3] ?? "",
    inlineArguments: match[4] ?? "",
  };
}

function quotePowerShellLiteral(value: string): string {
  return `'${String(value || "").replaceAll("'", "''")}'`;
}

function isWindowsPythonAlias(command: string): boolean {
  const normalized = stripWindowsOuterQuotes(command);
  // Preserve an explicitly selected interpreter path. Only rewrite the bare
  // Unix spelling that Windows users commonly encounter in skill docs.
  if (/[\\/]/.test(normalized)) return false;
  return /^(?:python3(?:\.\d+)?|python3\.exe)$/i.test(normalized);
}

function isWindowsShellBuiltin(command: string): boolean {
  return WINDOWS_SHELL_BUILTINS.has(windowsCommandBasename(command));
}

function shouldUseWindowsPowerShell(command: string): boolean {
  const text = String(command || "").trim();
  if (!text) return false;
  // Inspect the first token after each command separator. This avoids
  // accidentally wrapping an explicit `powershell -Command ...` invocation
  // in a second PowerShell process just because its payload contains a
  // cmdlet such as `Write-Output`.
  return text.split(/[;&|]/).some((segment) => {
    const token = segment.trim().match(/^(?:"([^"]*)"|'([^']*)'|(\S+))/);
    const executable = token?.[1] ?? token?.[2] ?? token?.[3] ?? "";
    if (/^(?:powershell|pwsh)(?:\.exe)?$/i.test(executable)) return false;
    return (
      /^(?:Get|Set|Add|Remove|Write|Read|Invoke|Select|Test|New|Join|Split|Convert|ForEach|Where)-[A-Za-z]+$/i.test(
        executable,
      ) ||
      /^(?:ls|pwd|cat|grep|head|tail|which|touch)$/i.test(executable) ||
      /\$env:|\$\(|`[^`]*`/.test(segment)
    );
  });
}

function quoteWindowsCommandPart(value: string): string {
  const text = String(value ?? "");
  if (!text) return '""';
  // cmd's /s /c parser needs paths containing spaces quoted.  Escape embedded
  // quotes in the same form Node uses for Windows command-line arguments.
  if (/\s|[&|<>^()]/.test(text) || /["']/g.test(text)) {
    return `"${text.replace(/(\\*)"/g, "$1$1\\\"").replace(/(\\+)$/g, "$1$1")}"`;
  }
  return text;
}

function buildWindowsShellCommand(command: string, args: string[]): string {
  const commandText = String(command || "").trim();
  // A command passed without an argument array is already a complete command
  // line (`echo hi`, `python script.py`, or a pipeline). Quoting it as one
  // token changes its meaning in cmd.exe, so preserve it verbatim.
  const commandPart = args.length === 0 ? commandText : quoteWindowsCommandPart(commandText);
  return [commandPart, ...args.map(quoteWindowsCommandPart)].filter(Boolean).join(" ");
}

function normalizeWindowsShellCommand(command: string): string {
  const match = String(command || "").match(/^(\s*)(?:"([^"]+)"|'([^']+)'|(\S+))(.*)$/s);
  if (!match) return command;
  const token = match[2] ?? match[3] ?? match[4] ?? "";
  if (!isWindowsPythonAlias(token)) return command;
  // Keep the remainder exactly as supplied; it may contain shell operators or
  // quoted paths that must be interpreted by the selected shell.
  return `${match[1]}python${match[5] || ""}`;
}

function buildWindowsInvocation(command: string, args: string[]): {
  executable: string;
  args: string[];
  shell: false;
} {
  const normalizedCommand = stripWindowsOuterQuotes(command);
  const scriptInvocation = parseWindowsScriptInvocation(command);
  if (scriptInvocation) {
    if (args.length > 0 || !scriptInvocation.inlineArguments) {
      return {
        executable: resolveWindowsPowerShell(),
        args: [
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          scriptInvocation.scriptPath,
          ...args,
        ],
        shell: false,
      };
    }
    return {
      executable: resolveWindowsPowerShell(),
      args: [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        `& ${quotePowerShellLiteral(scriptInvocation.scriptPath)} ${scriptInvocation.inlineArguments}`.trim(),
      ],
      shell: false,
    };
  }

  // With no argument array, `command` is already a complete command line.
  // Do not quote it as a single executable token (`"echo test"`), which makes
  // cmd.exe look for a file literally named "echo test".
  if (args.length === 0) {
    const shellCommand = normalizeWindowsShellCommand(command);
    const shell = shouldUseWindowsPowerShell(shellCommand)
      ? resolveWindowsPowerShell()
      : resolveWindowsCmd();
    if (shell.toLowerCase().includes("powershell") || shell.toLowerCase().includes("pwsh")) {
      return { executable: shell, args: ["-NoProfile", "-Command", shellCommand], shell: false };
    }
    return { executable: shell, args: ["/d", "/s", "/c", shellCommand], shell: false };
  }

  // `python3` is a Unix convention.  Windows Python installations normally
  // expose python.exe (or the `py` launcher), so run it through the command
  // interpreter instead of trying to spawn a non-existent python3.exe.
  const commandForShell = isWindowsPythonAlias(normalizedCommand) ? "python" : normalizedCommand;
  const needsShell = isWindowsShellBuiltin(commandForShell) ||
    /\.(?:cmd|bat)$/i.test(normalizedCommand) ||
    !/\.(?:exe|com)$/i.test(normalizedCommand) ||
    isWindowsPythonAlias(normalizedCommand);
  if (!needsShell) {
    return { executable: normalizedCommand, args, shell: false };
  }

  const shellCommand = buildWindowsShellCommand(commandForShell, args);
  const shell = shouldUseWindowsPowerShell(commandForShell) ? resolveWindowsPowerShell() : resolveWindowsCmd();
  if (shell.toLowerCase().includes("powershell") || shell.toLowerCase().includes("pwsh")) {
    return { executable: shell, args: ["-NoProfile", "-Command", shellCommand], shell: false };
  }
  return { executable: shell, args: ["/d", "/s", "/c", shellCommand], shell: false };
}

/**
 * No-op sandbox implementation for when sandboxing is unavailable
 * Still enforces timeouts and output limits, but no OS-level isolation
 */
export class NoSandbox implements ISandbox {
  readonly type: SandboxType = "none";
  private workspace: Workspace;

  constructor(workspace: Workspace) {
    this.workspace = workspace;
  }

  async initialize(): Promise<void> {
    // No initialization needed
  }

  async execute(
    command: string,
    args: string[] = [],
    options: SandboxOptions = {},
  ): Promise<SandboxResult> {
    const timeout = options.timeout ?? 5 * 60 * 1000;
    const maxOutputSize = options.maxOutputSize ?? 100 * 1024;
    const cwd = options.cwd || this.workspace.path;

    return new Promise((resolve) => {
      let stdout = "";
      let stderr = "";
      let killed = false;
      let timedOut = false;

      let executable = command;
      let spawnArgs = args;
      if (process.platform === "win32") {
        const invocation = buildWindowsInvocation(command, args);
        executable = invocation.executable;
        spawnArgs = invocation.args;
      } else if (args.length === 0) {
        executable = "/bin/sh";
        spawnArgs = ["-c", command];
      }
      const proc = spawn(executable, spawnArgs, {
        cwd,
        shell: false,
        stdio: ["pipe", "pipe", "pipe"],
      });
      options.onProcess?.(proc);

      const timeoutHandle = setTimeout(() => {
        timedOut = true;
        killed = true;
        proc.kill("SIGKILL");
      }, timeout);

      proc.stdout?.on("data", (data: Buffer) => {
        const chunk = data.toString();
        if (stdout.length + chunk.length <= maxOutputSize) {
          stdout += chunk;
        } else if (stdout.length < maxOutputSize) {
          stdout += chunk.slice(0, maxOutputSize - stdout.length);
          stdout += "\n[Output truncated]";
        }
      });

      proc.stderr?.on("data", (data: Buffer) => {
        const chunk = data.toString();
        if (stderr.length + chunk.length <= maxOutputSize) {
          stderr += chunk;
        } else if (stderr.length < maxOutputSize) {
          stderr += chunk.slice(0, maxOutputSize - stderr.length);
          stderr += "\n[Output truncated]";
        }
      });

      proc.on("close", (code, signal) => {
        clearTimeout(timeoutHandle);
        const terminationError = signal ? `Process terminated by signal ${signal}` : undefined;
        resolve({
          exitCode: code ?? 1,
          stdout,
          stderr: stderr || terminationError || "",
          killed,
          timedOut,
          signal,
          error: terminationError,
        });
      });

      proc.on("error", (err) => {
        clearTimeout(timeoutHandle);
        resolve({
          exitCode: 1,
          stdout,
          stderr: err.message,
          killed,
          timedOut,
          error: err.message,
        });
      });
    });
  }

  async executeCode(code: string, language: "python" | "javascript"): Promise<SandboxResult> {
    const ext = language === "python" ? ".py" : ".js";
    const { filePath, cleanup } = createSecureTempFile(ext, code);

    try {
      // Windows installs expose the interpreter as `python.exe`; `python3`
      // is a Unix convention and commonly does not exist on PATH.
      const interpreter =
        language === "python"
          ? process.platform === "win32"
            ? "python"
            : "python3"
          : "node";
      return await this.execute(interpreter, [filePath], {
        timeout: 60 * 1000,
        allowNetwork: false,
      });
    } finally {
      cleanup();
    }
  }

  cleanup(): void {
    // No cleanup needed
  }
}

/**
 * Cached Docker availability status
 */
let dockerAvailable: boolean | null = null;
let dockerCheckPromise: Promise<boolean> | null = null;
let macOSSandboxAvailable: boolean | null = null;
let macOSSandboxCheckPromise: Promise<boolean> | null = null;

/**
 * Check if Docker is available and running
 */
export async function isDockerAvailable(): Promise<boolean> {
  // Return cached result if available
  if (dockerAvailable !== null) {
    return dockerAvailable;
  }

  // Return existing promise if check is in progress
  if (dockerCheckPromise) {
    return dockerCheckPromise;
  }

  dockerCheckPromise = new Promise((resolve) => {
    const proc = spawn("docker", ["info"], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let resolved = false;

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        proc.kill();
        dockerAvailable = false;
        resolve(false);
      }
    }, 5000);

    proc.on("close", (code) => {
      clearTimeout(timeout);
      if (!resolved) {
        resolved = true;
        dockerAvailable = code === 0;
        resolve(dockerAvailable);
      }
    });

    proc.on("error", () => {
      clearTimeout(timeout);
      if (!resolved) {
        resolved = true;
        dockerAvailable = false;
        resolve(false);
      }
    });
  });

  return dockerCheckPromise;
}

/**
 * Check whether macOS sandbox-exec can actually apply a trivial profile.
 * Some local/dev launches have the binary present but sandbox_apply fails or
 * aborts immediately; treating that as available causes every shell command to
 * enter a broken execution path.
 */
export async function isMacOSSandboxAvailable(): Promise<boolean> {
  if (process.platform !== "darwin") return false;
  if (macOSSandboxAvailable !== null) {
    return macOSSandboxAvailable;
  }
  if (macOSSandboxCheckPromise) {
    return macOSSandboxCheckPromise;
  }

  macOSSandboxCheckPromise = new Promise((resolve) => {
    const probeSandbox = new MacOSSandbox({
      id: "__macos_sandbox_probe__",
      name: "macOS sandbox probe",
      path: os.tmpdir(),
      createdAt: Date.now(),
      permissions: {
        read: true,
        write: true,
        delete: false,
        network: false,
        shell: true,
        unrestrictedFileAccess: false,
        allowedPaths: [],
      },
    });
    let proc: ChildProcess | null = null;
    let resolved = false;
    const finish = (available: boolean) => {
      if (resolved) return;
      resolved = true;
      probeSandbox.cleanup();
      macOSSandboxAvailable = available;
      resolve(available);
    };

    const timeout = setTimeout(() => {
      proc?.kill();
      finish(false);
    }, 3_000);

    void probeSandbox
      .execute("/bin/echo", ["ok"], {
        cwd: os.tmpdir(),
        timeout: 3_000,
        maxOutputSize: 16 * 1024,
        allowNetwork: false,
        onProcess: (child) => {
          proc = child;
        },
      })
      .then((result) => {
        clearTimeout(timeout);
        const combined = `${result.stdout}\n${result.stderr}\n${result.error ?? ""}`;
        const failedRuntime =
          /Operation not permitted|Abort trap|sandbox_apply/i.test(combined);
        finish(
          result.exitCode === 0 &&
            !result.signal &&
            !failedRuntime &&
            result.stdout.trim() === "ok",
        );
      })
      .catch(() => {
        clearTimeout(timeout);
        finish(false);
      });
  });

  return macOSSandboxCheckPromise;
}

/**
 * Detect the best available sandbox type for the current platform
 */
export async function detectAvailableSandbox(): Promise<SandboxType> {
  // DockerSandbox runs a Linux image (`/bin/sh -c`).  It is therefore not a
  // host sandbox for a Windows desktop process: native commands and packaged
  // Windows binaries (OfficeCLI, Python, npm.cmd, etc.) cannot execute inside
  // that container.  Falling back to NoSandbox keeps the controlled
  // cmd.exe/PowerShell invocation path usable until a real Windows-container
  // implementation exists.
  if (process.platform === "win32") {
    return "none";
  }

  // On macOS, prefer native sandbox-exec
  if (process.platform === "darwin" && (await isMacOSSandboxAvailable())) {
    return "macos";
  }

  // Check for Docker when native sandboxing is unavailable.
  if (await isDockerAvailable()) {
    return "docker";
  }

  // Fallback to no sandbox
  return "none";
}

/**
 * Create a sandbox instance for the given workspace
 *
 * @param workspace - The workspace to create a sandbox for
 * @param preferredType - Optional preferred sandbox type (overrides auto-detection)
 * @returns An initialized sandbox instance
 */
export async function createSandbox(
  workspace: Workspace,
  preferredType?: SandboxType | "auto",
): Promise<ISandbox> {
  let sandboxType: SandboxType;

  if (preferredType && preferredType !== "auto") {
    // Validate the preferred type is available
    if (
      preferredType === "macos" &&
      (process.platform !== "darwin" || !(await isMacOSSandboxAvailable()))
    ) {
      console.warn("macOS sandbox requested but unavailable, falling back to auto-detect");
      sandboxType = await detectAvailableSandbox();
    } else if (
      preferredType === "docker" &&
      (process.platform === "win32" || !(await isDockerAvailable()))
    ) {
      console.warn(
        process.platform === "win32"
          ? "Docker sandbox is not compatible with native Windows command execution; falling back to the Windows shell path"
          : "Docker sandbox requested but Docker not available, falling back to auto-detect",
      );
      sandboxType = await detectAvailableSandbox();
    } else {
      sandboxType = preferredType;
    }
  } else {
    sandboxType = await detectAvailableSandbox();
  }

  let sandbox: ISandbox;

  switch (sandboxType) {
    case "macos":
      sandbox = new MacOSSandbox(workspace);
      break;
    case "docker":
      sandbox = new DockerSandbox(workspace);
      break;
    case "none":
    default:
      sandbox = new NoSandbox(workspace);
      break;
  }

  await sandbox.initialize();
  return sandbox;
}

/**
 * Reset Docker availability cache (useful for testing or after Docker installation)
 */
export function resetDockerCache(): void {
  dockerAvailable = null;
  dockerCheckPromise = null;
}

export function resetMacOSSandboxCache(): void {
  macOSSandboxAvailable = null;
  macOSSandboxCheckPromise = null;
}
