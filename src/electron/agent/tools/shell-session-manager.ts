import * as crypto from "crypto";
import * as fs from "fs";
import * as fsPromises from "fs/promises";
import * as path from "path";
import { execFileSync, spawn, type ChildProcess } from "child_process";
import { stdioEnvironment } from "../../mcp/client/transports/stdio-environment";
import { getUserDataDir } from "../../utils/user-data-dir";
import type {
  CommandTerminationReason,
  ShellSessionInfo,
  ShellSessionLifecycleEvent,
  ShellSessionScope,
  ShellSessionStatus,
} from "../../../shared/types";

type ShellSnapshot = {
  cwd: string;
  env: Record<string, string>;
  aliases: Record<string, string>;
};

type ShellSessionRuntime = {
  info: ShellSessionInfo;
  snapshot: ShellSnapshot;
  shell?: string;
  process: ChildProcess | null;
  invalidation?: Promise<void>;
  /** Untruncated protocol output, kept as chunks to avoid O(n²) concatenation. */
  bufferChunks: string[];
  bufferChunkStart: number;
  bufferLength: number;
  bufferTruncated: boolean;
  /** Head retained after the bounded buffer overflows. */
  bufferHead: string;
  /** Tail chunks retained after the bounded buffer overflows. */
  bufferTailChunks: string[];
  bufferTailChunkStart: number;
  bufferTailLength: number;
  ready: boolean;
  busy: boolean;
  pending: Array<{
    commandId: string;
    command: string;
    resolve: (value: ShellCommandResult) => void;
    reject: (reason?: unknown) => void;
    timeout: ReturnType<typeof setTimeout>;
    fallback: boolean;
    cwd?: string;
    onOutput?: (event: { stream: "stdout" | "stderr"; output: string }) => void;
  }>;
  cmdSeq: number;
  exitStatusOverride?: ShellSessionStatus;
  terminalOutputListeners: Map<
    string,
    (event: { stream: "stdout" | "stderr"; output: string }) => void
  >;
};

export interface ShellCommandResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  truncated?: boolean;
  terminationReason?: CommandTerminationReason;
  usedPersistentSession: boolean;
  sessionId?: string;
  sessionEvent?: ShellSessionLifecycleEvent;
}

export interface ShellRunRequest {
  taskId: string;
  workspaceId: string;
  workspacePath: string;
  command: string;
  cwd?: string;
  scope?: ShellSessionScope;
  sessionId?: string;
  timeoutMs: number;
  signal?: AbortSignal;
  onOutput?: (event: { stream: "stdout" | "stderr"; output: string }) => void;
  fallbackRunner: () => Promise<Omit<ShellCommandResult, "usedPersistentSession" | "sessionId" | "sessionEvent">>;
}

const STATE_FILE = path.join(getUserDataDir(), "shell-sessions.json");
const COMMAND_TIMEOUT_FALLBACK_MS = 60_000;
const COMMAND_TIMEOUT_MAX_MS = 5 * 60 * 1000;
const TAB_COMMAND_TIMEOUT_MAX_MS = 24 * 60 * 60 * 1000;
const MAX_TERMINAL_TABS_PER_WORKSPACE = 12;
const MAX_PERSISTENT_BUFFER_CHARS = 1_000_000;
const MAX_PERSISTENT_RESULT_CHARS = 100 * 1024;
const PERSISTENT_OUTPUT_TRUNCATION_MARKER =
  "\n[Output truncated by persistent shell]\n";

function safeJsonParse<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function normalizePathForShell(value: string): string {
  return value.replace(/\\/g, "/");
}

function isUsableDirectory(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    return fs.statSync(value).isDirectory();
  } catch {
    return false;
  }
}

function isWithinDirectory(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative === "" ||
    (relative !== ".." &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative))
  );
}

function resolveRuntimeCwd(
  runtimeCwd: string | undefined,
  workspacePath: string,
): { cwd: string; repaired: boolean } {
  const workspaceRoot = path.resolve(workspacePath);
  if (!isUsableDirectory(workspaceRoot)) {
    throw new Error(`Shell workspace is unavailable: ${workspaceRoot}`);
  }

  const candidate = runtimeCwd ? path.resolve(runtimeCwd) : "";
  if (
    candidate &&
    isUsableDirectory(candidate) &&
    isWithinDirectory(workspaceRoot, candidate)
  ) {
    return { cwd: candidate, repaired: candidate !== runtimeCwd };
  }

  return { cwd: workspaceRoot, repaired: true };
}

function quoteForPosixShell(value: string): string {
  return `'${String(value).replace(/'/g, `'"'"'`)}'`;
}

function terminateProcessTree(child: ChildProcess | null, signal: NodeJS.Signals = "SIGTERM"): void {
  if (!child?.pid) return;
  if (process.platform === "win32") {
    try {
      execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { timeout: 5_000 });
    } catch {
      // Fall through to direct process termination.
    }
    // taskkill may report success before Node observes the process exit. A
    // direct termination closes the child handle in that narrow window and
    // is harmless when the tree was already reaped.
    try {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGKILL");
      }
    } catch {
      // Ignore teardown races.
    }
    try {
      if (child.exitCode === null && child.signalCode === null && child.pid) {
        process.kill(child.pid, "SIGKILL");
      }
    } catch {
      // Ignore teardown races.
    }
    return;
  } else {
    try {
      process.kill(-child.pid, signal);
      return;
    } catch {
      // Fall through to direct process termination.
    }
  }
  try {
    child.kill(signal);
  } catch {
    // Ignore teardown races.
  }
}

function waitForProcessExit(child: ChildProcess | null, timeoutMs = 1_500): Promise<void> {
  if (!child?.pid) {
    return Promise.resolve();
  }
  const streamsClosed = [child.stdin, child.stdout, child.stderr].every(
    (stream) => {
      if (!stream) return true;
      const state = stream as {
        destroyed?: boolean;
        readableEnded?: boolean;
        writableEnded?: boolean;
      };
      return state.destroyed === true || state.readableEnded === true || state.writableEnded === true;
    },
  );
  if ((child.exitCode !== null || child.signalCode !== null) && streamsClosed) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const done = () => {
      if (timer) clearTimeout(timer);
      child.off("close", done);
      child.off("error", done);
      resolve();
    };
    child.once("close", done);
    child.once("error", done);
    timer = setTimeout(done, timeoutMs);
  });
}

function terminatePersistedShellProcess(pid: number): void {
  if (!Number.isInteger(pid) || pid <= 0) return;
  if (process.platform === "win32") {
    try {
      execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], { timeout: 5_000 });
    } catch {
      // The previous process may already be gone.
    }
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // The previous process may already be gone.
    }
    return;
  }
  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // The previous process may already be gone.
    }
  }
}

function stripShellControlCodes(text: string): string {
  return String(text || "")
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "")
    .replace(/\x1b\][^\x07]*\x07/g, "")
    .replace(/\x1b[@-_][0-?]*[ -/]*[@-~]/g, "")
    .replace(/\x1b/g, "")
    .replace(/\r/g, "")
    .trim();
}

function stripPowerShellProtocolEcho(text: string): string {
  const protocolEcho = /^(?:PS [^>\r\n]*>\s*)?Invoke-Expression \(\[System\.Text\.Encoding\]::UTF8\.GetString\(\[System\.Convert\]::FromBase64String\('[A-Za-z0-9+/=]+'\)\)\)\s*$/;
  return String(text || "")
    .split(/\r?\n/)
    .filter((line) => !protocolEcho.test(line.trim()))
    .join("\n");
}

function appendBoundedRuntimeBuffer(
  runtime: ShellSessionRuntime,
  output: string,
): void {
  if (!output) return;
  if (runtime.bufferTruncated) {
    // Once the buffer has crossed the cap, retain the diagnostic head and the
    // newest tail as chunks. Windows pipes often deliver large native-command
    // output in very small chunks; rebuilding a megabyte string per chunk can
    // turn a bounded stream into an accidental O(n²) operation.
    appendRuntimeTail(runtime, output, getPersistentBufferTailLength());
    return;
  }
  runtime.bufferChunks.push(output);
  runtime.bufferLength += output.length;
  if (runtime.bufferLength <= MAX_PERSISTENT_BUFFER_CHARS) {
    return;
  }

  const next = materializeRuntimeBuffer(runtime);
  // Keep the beginning for command diagnostics and the tail where state,
  // exit markers and build errors are emitted. The marker makes truncation
  // explicit without allowing a long-running process to grow the buffer
  // without bound.
  const retained = getPersistentBufferRetainedLength();
  const head = Math.floor(retained * 0.2);
  const tail = retained - head;
  runtime.bufferChunks = [];
  runtime.bufferChunkStart = 0;
  runtime.bufferLength = 0;
  runtime.bufferHead = next.slice(0, head);
  runtime.bufferTailChunks = [];
  runtime.bufferTailChunkStart = 0;
  runtime.bufferTailLength = 0;
  runtime.bufferTruncated = true;
  appendRuntimeTail(runtime, next.slice(-tail), tail);
}

function getPersistentBufferRetainedLength(): number {
  return Math.max(
    0,
    MAX_PERSISTENT_BUFFER_CHARS - PERSISTENT_OUTPUT_TRUNCATION_MARKER.length,
  );
}

function getPersistentBufferTailLength(): number {
  const retained = getPersistentBufferRetainedLength();
  return retained - Math.floor(retained * 0.2);
}

function appendRuntimeTail(
  runtime: ShellSessionRuntime,
  output: string,
  maxLength: number,
): void {
  if (!output || maxLength <= 0) return;
  if (output.length >= maxLength) {
    runtime.bufferTailChunks = [output.slice(-maxLength)];
    runtime.bufferTailChunkStart = 0;
    runtime.bufferTailLength = maxLength;
    return;
  }

  runtime.bufferTailChunks.push(output);
  runtime.bufferTailLength += output.length;
  while (runtime.bufferTailLength > maxLength && runtime.bufferTailChunkStart < runtime.bufferTailChunks.length) {
    const first = runtime.bufferTailChunks[runtime.bufferTailChunkStart] || "";
    const overflow = runtime.bufferTailLength - maxLength;
    if (first.length <= overflow) {
      runtime.bufferTailChunkStart += 1;
      runtime.bufferTailLength -= first.length;
    } else {
      runtime.bufferTailChunks[runtime.bufferTailChunkStart] = first.slice(overflow);
      runtime.bufferTailLength -= overflow;
      break;
    }
  }
  if (
    runtime.bufferTailChunkStart > 32 &&
    runtime.bufferTailChunkStart * 2 >= runtime.bufferTailChunks.length
  ) {
    runtime.bufferTailChunks = runtime.bufferTailChunks.slice(runtime.bufferTailChunkStart);
    runtime.bufferTailChunkStart = 0;
  }
}

function getRuntimeBufferTail(runtime: ShellSessionRuntime, maxLength: number): string {
  if (maxLength <= 0) return "";
  if (!runtime.bufferTruncated) {
    let remaining = Math.min(maxLength, runtime.bufferLength);
    if (remaining <= 0) return "";
    const chunks: string[] = [];
    for (let index = runtime.bufferChunks.length - 1; index >= runtime.bufferChunkStart && remaining > 0; index -= 1) {
      const chunk = runtime.bufferChunks[index] || "";
      if (chunk.length <= remaining) {
        chunks.push(chunk);
        remaining -= chunk.length;
      } else {
        chunks.push(chunk.slice(-remaining));
        remaining = 0;
      }
    }
    return chunks.reverse().join("");
  }

  let remaining = Math.min(maxLength, runtime.bufferTailLength);
  if (remaining <= 0) return "";
  const chunks: string[] = [];
  for (
    let index = runtime.bufferTailChunks.length - 1;
    index >= runtime.bufferTailChunkStart && remaining > 0;
    index -= 1
  ) {
    const chunk = runtime.bufferTailChunks[index] || "";
    if (chunk.length <= remaining) {
      chunks.push(chunk);
      remaining -= chunk.length;
    } else {
      chunks.push(chunk.slice(-remaining));
      remaining = 0;
    }
  }
  return chunks.reverse().join("");
}

function materializeRuntimeBuffer(runtime: ShellSessionRuntime): string {
  if (!runtime.bufferTruncated) {
    return runtime.bufferChunks.slice(runtime.bufferChunkStart).join("");
  }
  return (
    runtime.bufferHead +
    PERSISTENT_OUTPUT_TRUNCATION_MARKER +
    runtime.bufferTailChunks.slice(runtime.bufferTailChunkStart).join("")
  );
}

function resetRuntimeBuffer(runtime: ShellSessionRuntime): void {
  runtime.bufferChunks = [];
  runtime.bufferChunkStart = 0;
  runtime.bufferLength = 0;
  runtime.bufferTruncated = false;
  runtime.bufferHead = "";
  runtime.bufferTailChunks = [];
  runtime.bufferTailChunkStart = 0;
  runtime.bufferTailLength = 0;
}

function boundPersistentVisibleOutput(
  output: string,
  bufferTruncated: boolean,
): { output: string; truncated: boolean } {
  if (!bufferTruncated && output.length <= MAX_PERSISTENT_RESULT_CHARS) {
    return { output, truncated: false };
  }
  const retained = Math.max(
    0,
    MAX_PERSISTENT_RESULT_CHARS - PERSISTENT_OUTPUT_TRUNCATION_MARKER.length,
  );
  return {
    output: PERSISTENT_OUTPUT_TRUNCATION_MARKER + output.slice(-retained),
    truncated: true,
  };
}

export function isLikelyInteractiveCommand(command: string): boolean {
  const text = String(command || "").trim().toLowerCase();
  if (!text) return false;
  return /(^|\s)(vim|nvim|nano|less|more|top|htop|ssh|scp|sftp|telnet|ftp|python\s+-i|node\s+-i|mysql|psql|sqlite3|ipython|fzf|man|watch)\b/.test(
    text,
  );
}

function resolveShellExecutable(): string {
  if (process.platform === "win32") {
    const systemRoot = process.env.SystemRoot || "C:\\Windows";
    const fixedCandidates = [
      path.win32.join("C:\\Program Files", "PowerShell", "7", "pwsh.exe"),
      path.win32.join(
        systemRoot,
        "System32",
        "WindowsPowerShell",
        "v1.0",
        "powershell.exe",
      ),
    ];
    for (const candidate of fixedCandidates) {
      if (fs.existsSync(candidate)) return candidate;
    }
    const pathEntries = String(process.env.PATH || "")
      .split(";")
      .map((entry) => entry.trim())
      .filter(Boolean);
    for (const entry of pathEntries) {
      for (const name of ["pwsh.exe", "powershell.exe", "cmd.exe"]) {
        const candidate = path.win32.join(entry, name);
        if (fs.existsSync(candidate)) return candidate;
      }
    }
    return process.env.COMSPEC || "cmd.exe";
  }

  if (process.env.SHELL && fs.existsSync(process.env.SHELL)) {
    return process.env.SHELL;
  }
  if (fs.existsSync("/bin/bash")) return "/bin/bash";
  if (fs.existsSync("/bin/zsh")) return "/bin/zsh";
  return "/bin/sh";
}

function resolveTerminalShellExecutable(): string {
  if (process.platform === "win32") {
    const systemRoot = process.env.SystemRoot || "C:\\Windows";
    const cmd = path.win32.join(systemRoot, "System32", "cmd.exe");
    if (fs.existsSync(cmd)) return cmd;
    return process.env.COMSPEC || "cmd.exe";
  }
  if (process.env.SHELL && fs.existsSync(process.env.SHELL)) {
    return process.env.SHELL;
  }
  if (fs.existsSync("/bin/zsh")) return "/bin/zsh";
  if (fs.existsSync("/bin/bash")) return "/bin/bash";
  return "/bin/sh";
}

function readEnvironmentValue(
  env: NodeJS.ProcessEnv,
  key: string,
): string | undefined {
  const direct = env[key];
  if (typeof direct === "string" && direct.length > 0) return direct;
  const matchingKey = Object.keys(env).find(
    (candidate) => candidate.toLowerCase() === key.toLowerCase(),
  );
  const value = matchingKey ? env[matchingKey] : undefined;
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function buildWindowsPersistentPath(env: NodeJS.ProcessEnv): string {
  const systemRoot = readEnvironmentValue(env, "SystemRoot") || "C:\\Windows";
  const programFiles =
    readEnvironmentValue(env, "ProgramW6432") ||
    readEnvironmentValue(env, "ProgramFiles") ||
    "C:\\Program Files";
  const appData = readEnvironmentValue(env, "APPDATA");
  const inheritedPath = readEnvironmentValue(env, "PATH") || "";
  const candidates = [
    path.win32.join(systemRoot, "System32"),
    path.win32.join(systemRoot, "System32", "Wbem"),
    path.win32.join(
      systemRoot,
      "System32",
      "WindowsPowerShell",
      "v1.0",
    ),
    path.win32.join(programFiles, "PowerShell", "7"),
    path.win32.join(programFiles, "nodejs"),
    ...(appData ? [path.win32.join(appData, "npm")] : []),
    ...inheritedPath
      .split(";")
      .map((entry) => entry.trim())
      .filter(Boolean),
  ];
  const seen = new Set<string>();
  return candidates
    .filter((entry) => {
      const normalized = entry.toLowerCase();
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    })
    .join(";");
}

export function buildPersistentShellEnvironment(
  shell: string,
  isTerminalTab: boolean,
  platform: NodeJS.Platform = process.platform,
  sourceEnv: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  if (platform === "win32") {
    const systemRoot =
      readEnvironmentValue(sourceEnv, "SystemRoot") || "C:\\Windows";
    const system32 = path.win32.join(systemRoot, "System32");
    const comspec =
      readEnvironmentValue(sourceEnv, "COMSPEC") ||
      path.win32.join(system32, "cmd.exe");
    const temp =
      readEnvironmentValue(sourceEnv, "TEMP") ||
      readEnvironmentValue(sourceEnv, "TMP") ||
      path.win32.join(systemRoot, "Temp");
    const userProfile = readEnvironmentValue(sourceEnv, "USERPROFILE") || "";
    const username = readEnvironmentValue(sourceEnv, "USERNAME") || "";
    const pathext =
      readEnvironmentValue(sourceEnv, "PATHEXT") ||
      ".COM;.EXE;.BAT;.CMD;.VBS;.VBE;.JS;.JSE;.WSF;.WSH;.MSC";
    const result: NodeJS.ProcessEnv = {
      ...sourceEnv,
      SYSTEMROOT: systemRoot,
      SystemRoot: systemRoot,
      COMSPEC: comspec,
      ComSpec: comspec,
      PATH: buildWindowsPersistentPath(sourceEnv),
      PATHEXT: pathext,
      TEMP: temp,
      TMP: temp,
      USERPROFILE: userProfile,
      USERNAME: username,
      SHELL: shell,
      PROMPT: isTerminalTab ? "$P$G" : "",
      PS1: isTerminalTab ? "\\w % " : "",
      PS2: isTerminalTab ? "> " : "",
      PROMPT_COMMAND: "",
    };
    // Windows treats PATH/Path as the same variable. Remove alternate-case
    // copies so a stale Electron PATH cannot win during child resolution.
    for (const key of Object.keys(result)) {
      if (key.toLowerCase() === "path" && key !== "PATH") delete result[key];
    }
    return result;
  }

  return {
    ...sourceEnv,
    HOME: readEnvironmentValue(sourceEnv, "HOME") || "",
    SHELL: shell,
    PS1: isTerminalTab ? "\\w % " : "",
    PS2: isTerminalTab ? "> " : "",
    PROMPT_COMMAND: "",
    PATH: stdioEnvironment(sourceEnv, {}, platform, readEnvironmentValue(sourceEnv, "HOME")).PATH,
    LANG: readEnvironmentValue(sourceEnv, "LANG") || "en_US.UTF-8",
    TERM: readEnvironmentValue(sourceEnv, "TERM") || "xterm-256color",
  };
}

function getShellArgs(shell: string): string[] {
  if (process.platform === "win32") {
    const lower = shell.toLowerCase();
    if (lower.includes("powershell") || lower.includes("pwsh")) {
      return ["-NoLogo", "-NoProfile", "-NonInteractive"];
    }
    return [];
  }
  // Keep persistent sessions non-interactive so they do not attach to or read
  // from the user's controlling TTY (which can suspend an active dev terminal).
  return [];
}

function getTerminalShellArgs(shell: string): string[] {
  if (process.platform === "win32" && shell.toLowerCase().endsWith("cmd.exe")) {
    return ["/Q"];
  }
  return [];
}

function parseAliasLine(line: string): [string, string] | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("alias ")) return null;
  const eqIndex = trimmed.indexOf("=");
  if (eqIndex <= 6) return null;
  const name = trimmed.slice(6, eqIndex).trim();
  const rawValue = trimmed.slice(eqIndex + 1).trim();
  if (!name || !rawValue) return null;
  const unwrapped = rawValue.replace(/^'/, "").replace(/'$/, "");
  return [name, unwrapped];
}

function parseEnvLine(line: string): [string, string] | null {
  const idx = line.indexOf("=");
  if (idx <= 0) return null;
  const key = line.slice(0, idx).trim();
  if (!key) return null;
  return [key, line.slice(idx + 1)];
}

function diffSnapshot(previous: ShellSnapshot, next: ShellSnapshot): {
  cwd: string;
  env: Record<string, string | null>;
  aliases: Record<string, string | null>;
} {
  const env: Record<string, string | null> = {};
  const aliases: Record<string, string | null> = {};

  const envKeys = new Set([...Object.keys(previous.env), ...Object.keys(next.env)]);
  for (const key of envKeys) {
    const prev = previous.env[key];
    const curr = next.env[key];
    if (prev !== curr) {
      env[key] = curr ?? null;
    }
  }

  const aliasKeys = new Set([...Object.keys(previous.aliases), ...Object.keys(next.aliases)]);
  for (const key of aliasKeys) {
    const prev = previous.aliases[key];
    const curr = next.aliases[key];
    if (prev !== curr) {
      aliases[key] = curr ?? null;
    }
  }

  return {
    cwd: next.cwd,
    env,
    aliases,
  };
}

function applyEnvExport(name: string, value: string): string {
  return `export ${name}=${quoteForPosixShell(value)}`;
}

function applyEnvUnset(name: string): string {
  return `unset ${name}`;
}

function applyAliasExport(name: string, value: string): string {
  const escaped = value.replace(/'/g, `'"'"'`);
  return `alias ${name}='${escaped}'`;
}

function isWindowsPowerShell(shell: string, platform: NodeJS.Platform = process.platform): boolean {
  return platform === "win32" && /(?:powershell|pwsh)(?:\.exe)?$/i.test(path.win32.basename(shell));
}

function isWindowsCmd(shell: string, platform: NodeJS.Platform = process.platform): boolean {
  return platform === "win32" && path.win32.basename(shell).toLowerCase() === "cmd.exe";
}

function quoteForPowerShell(value: string): string {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function quoteForCmd(value: string): string {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function buildRehydrateCommands(
  snapshot: ShellSnapshot,
  shell = process.platform === "win32" ? resolveShellExecutable() : "",
  platform: NodeJS.Platform = process.platform,
): string[] {
  if (isWindowsPowerShell(shell, platform)) {
    const commands: string[] = [];
    if (snapshot.cwd) {
      commands.push(`Set-Location -LiteralPath ${quoteForPowerShell(snapshot.cwd)}`);
    }
    for (const [key, value] of Object.entries(snapshot.env)) {
      if (value == null) {
        commands.push(`Remove-Item Env:${key} -ErrorAction SilentlyContinue`);
      } else {
        commands.push(`$env:${key} = ${quoteForPowerShell(value)}`);
      }
    }
    for (const [key, value] of Object.entries(snapshot.aliases)) {
      if (value != null) {
        commands.push(`Set-Alias -Name ${quoteForPowerShell(key)} -Value ${quoteForPowerShell(value)} -Scope Global`);
      }
    }
    return commands;
  }
  if (isWindowsCmd(shell, platform)) {
    const commands: string[] = [];
    if (snapshot.cwd) commands.push(`cd /d ${quoteForCmd(snapshot.cwd)}`);
    for (const [key, value] of Object.entries(snapshot.env)) {
      commands.push(value == null ? `set "${key}="` : `set "${key}=${String(value).replace(/"/g, '""')}"`);
    }
    for (const [key, value] of Object.entries(snapshot.aliases)) {
      if (value != null) commands.push(`doskey ${key}=${value}`);
    }
    return commands;
  }

  const commands: string[] = [];
  if (snapshot.cwd) {
    commands.push(`cd ${quoteForPosixShell(normalizePathForShell(snapshot.cwd))}`);
  }
  for (const [key, value] of Object.entries(snapshot.env)) {
    if (value == null) {
      commands.push(applyEnvUnset(key));
    } else {
      commands.push(applyEnvExport(key, value));
    }
  }
  for (const [key, value] of Object.entries(snapshot.aliases)) {
    if (value != null) {
      commands.push(applyAliasExport(key, value));
    }
  }
  return commands;
}

function buildUnixCommandWrapper(targetCwd: string, command: string, commandId: string): string {
  const heredocMarker = `__NEOWORKER_CMD_${commandId.replace(/[^a-zA-Z0-9]/g, "_")}__`;
  return [
    "set +e",
    `cd ${quoteForPosixShell(normalizePathForShell(targetCwd))}`,
    `__NEOWORKER_COMMAND=$(cat <<'${heredocMarker}'`,
    command,
    heredocMarker,
    ")",
    "eval \"$__NEOWORKER_COMMAND\"",
    "__neoworker_exit_code=$?",
    "printf '\\n__NEOWORKER_STATE_START__\\n'",
    "printf '__NEOWORKER_CWD__:%s\\n' \"$(pwd -P)\"",
    "printf '__NEOWORKER_ALIASES_START__\\n'",
    "alias",
    "printf '__NEOWORKER_ALIASES_END__\\n'",
    "printf '__NEOWORKER_ENV_START__\\n'",
    "env",
    "printf '__NEOWORKER_ENV_END__\\n'",
    `printf '__NEOWORKER_DONE__:%s:%s\\n' ${quoteForPosixShell(commandId)} "$__neoworker_exit_code"`,
  ].join("\n");
}

function buildPowerShellCommandWrapper(targetCwd: string, command: string, commandId: string): string {
  // Base64 keeps arbitrary command text (quotes, newlines and shell operators)
  // out of the PowerShell wrapper itself. Invoke-Expression is intentional:
  // the command has already passed NeoWorker's approval and sandbox policy.
  const encodedCommand = Buffer.from(command, "utf8").toString("base64");
  const wrapperScript = [
    "$ErrorActionPreference = 'Continue'",
    `$global:LASTEXITCODE = 0`,
    `Set-Location -LiteralPath ${quoteForPowerShell(targetCwd)}`,
    `$__neoworker_command = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${encodedCommand}'))`,
    "try { Invoke-Expression $__neoworker_command; $__neoworker_invocation_succeeded = $?; if ($LASTEXITCODE -is [int] -and $LASTEXITCODE -ne 0) { $__neoworker_exit_code = $LASTEXITCODE } elseif ($__neoworker_invocation_succeeded) { $__neoworker_exit_code = 0 } else { $__neoworker_exit_code = 1 } } catch { [Console]::Error.WriteLine($_.Exception.Message); $__neoworker_exit_code = 1 }",
    "Write-Output ''",
    "Write-Output '__NEOWORKER_STATE_START__'",
    "Write-Output ('__NEOWORKER_CWD__:' + (Get-Location).Path)",
    "Write-Output '__NEOWORKER_ALIASES_START__'",
    "Write-Output '__NEOWORKER_ALIASES_END__'",
    "Write-Output '__NEOWORKER_ENV_START__'",
    "Get-ChildItem Env: | ForEach-Object { $_.Name + '=' + ($_.Value -replace \"`r?`n\", ' ') }",
    "Write-Output '__NEOWORKER_ENV_END__'",
    `Write-Output ('__NEOWORKER_DONE__:${commandId}:' + $__neoworker_exit_code)`,
  ].join("; ");
  // PowerShell echoes commands received through an interactive stdin. Keep
  // protocol marker strings out of that echoed line so the parser can only
  // observe markers emitted by the wrapper itself.
  const encodedWrapper = Buffer.from(wrapperScript, "utf8").toString("base64");
  return `Invoke-Expression ([System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${encodedWrapper}')))`;
}

function buildCmdCommandWrapper(targetCwd: string, command: string, commandId: string): string {
  return [
    "@echo off",
    `cd /d ${quoteForCmd(targetCwd)}`,
    command,
    "set \"__NEOWORKER_EXIT=%ERRORLEVEL%\"",
    "echo.",
    "echo __NEOWORKER_STATE_START__",
    "echo __NEOWORKER_CWD__:%CD%",
    "echo __NEOWORKER_ALIASES_START__",
    "echo __NEOWORKER_ALIASES_END__",
    "echo __NEOWORKER_ENV_START__",
    "set",
    "echo __NEOWORKER_ENV_END__",
    `echo __NEOWORKER_DONE__:${commandId}:%__NEOWORKER_EXIT%`,
  ].join("\r\n");
}

function buildCommandWrapper(
  shell: string,
  targetCwd: string,
  command: string,
  commandId: string,
  platform: NodeJS.Platform = process.platform,
): string {
  if (isWindowsPowerShell(shell, platform)) {
    return buildPowerShellCommandWrapper(targetCwd, command, commandId);
  }
  if (isWindowsCmd(shell, platform)) {
    return buildCmdCommandWrapper(targetCwd, command, commandId);
  }
  return buildUnixCommandWrapper(targetCwd, command, commandId);
}

function snapshotForPersistence(snapshot: ShellSnapshot): ShellSnapshot {
  return {
    cwd: snapshot.cwd,
    // Do not persist environment values or aliases to disk. They may contain
    // secrets and are not required for safe session recovery.
    env: {},
    aliases: {},
  };
}

function createCancellationError(message: string): Error {
  const error = new Error(message);
  error.name = "AbortError";
  (error as Error & { code?: string }).code = "CANCELLED";
  return error;
}

export class ShellSessionManager {
  private static instance: ShellSessionManager | null = null;
  private sessions = new Map<string, ShellSessionRuntime>();
  private activeSessionRuns = new Set<string>();
  private stateLoaded = false;

  static getInstance(): ShellSessionManager {
    if (!ShellSessionManager.instance) {
      ShellSessionManager.instance = new ShellSessionManager();
    }
    return ShellSessionManager.instance;
  }

  private constructor() {}

  private async ensureStateLoaded(): Promise<void> {
    if (this.stateLoaded) return;
    this.stateLoaded = true;
    try {
      const raw = await fsPromises.readFile(STATE_FILE, "utf-8");
      const parsed = safeJsonParse<{
        sessions?: Array<{
          id: string;
          taskId: string;
          workspaceId: string;
          scope: ShellSessionScope;
          cwd: string;
          status: ShellSessionStatus;
          retained: boolean;
          commandCount: number;
          aliases: string[];
          envKeys: string[];
          createdAt: number;
          updatedAt: number;
          lastCommandAt?: number;
          lastCommand?: string;
          lastExitCode?: number | null;
          lastTerminationReason?: CommandTerminationReason;
          lastError?: string;
          pid?: number;
          snapshot?: ShellSnapshot;
        }>;
      }>(raw, {});
      for (const session of parsed.sessions || []) {
        if (session.pid) {
          terminatePersistedShellProcess(session.pid);
        }
        const runtime: ShellSessionRuntime = {
          info: {
            id: session.id,
            taskId: session.taskId,
            workspaceId: session.workspaceId,
            scope: session.scope,
            cwd: session.cwd,
            status: session.status,
            retained: session.retained,
            commandCount: session.commandCount,
            aliases: session.aliases || [],
            envKeys: session.envKeys || [],
            createdAt: session.createdAt,
            updatedAt: session.updatedAt,
            lastCommandAt: session.lastCommandAt,
            lastCommand: session.lastCommand,
            lastExitCode: session.lastExitCode,
            lastTerminationReason: session.lastTerminationReason,
            lastError: session.lastError,
          },
          snapshot: session.snapshot || { cwd: session.cwd, env: {}, aliases: {} },
          shell: undefined,
          process: null,
          invalidation: undefined,
          bufferChunks: [],
          bufferChunkStart: 0,
          bufferLength: 0,
          bufferTruncated: false,
          bufferHead: "",
          bufferTailChunks: [],
          bufferTailChunkStart: 0,
          bufferTailLength: 0,
          ready: false,
          busy: false,
          pending: [],
          cmdSeq: 0,
          exitStatusOverride: undefined,
          terminalOutputListeners: new Map(),
        };
        this.sessions.set(session.id, runtime);
      }
    } catch {
      // No persisted state yet.
    }
  }

  private async persistState(): Promise<void> {
    const payload = {
      sessions: Array.from(this.sessions.values()).map((session) => ({
        id: session.info.id,
        taskId: session.info.taskId,
        workspaceId: session.info.workspaceId,
        scope: session.info.scope,
        cwd: session.info.cwd,
        status: session.info.status,
        retained: session.info.retained,
        commandCount: session.info.commandCount,
        aliases: [],
        envKeys: [],
        createdAt: session.info.createdAt,
        updatedAt: session.info.updatedAt,
        lastCommandAt: session.info.lastCommandAt,
        lastCommand: undefined,
        lastExitCode: session.info.lastExitCode,
        lastTerminationReason: session.info.lastTerminationReason,
        lastError: undefined,
        pid: session.process?.pid,
        snapshot: snapshotForPersistence(session.snapshot),
      })),
    };
    await fsPromises.mkdir(path.dirname(STATE_FILE), { recursive: true });
    try {
      await fsPromises.chmod(path.dirname(STATE_FILE), 0o700);
    } catch {
      // Best effort only.
    }
    await fsPromises.writeFile(STATE_FILE, JSON.stringify(payload, null, 2), "utf-8");
    try {
      await fsPromises.chmod(STATE_FILE, 0o600);
    } catch {
      // Best effort only.
    }
  }

  private getSessionKey(taskId: string, workspaceId: string, scope: ShellSessionScope): string {
    return `${scope}:${workspaceId}:${taskId}`;
  }

  private createInfo(params: {
    taskId: string;
    workspaceId: string;
    scope: ShellSessionScope;
    cwd: string;
    id?: string;
  }): ShellSessionInfo {
    const now = Date.now();
    return {
      id: params.id || this.getSessionKey(params.taskId, params.workspaceId, params.scope),
      taskId: params.taskId,
      workspaceId: params.workspaceId,
      scope: params.scope,
      cwd: params.cwd,
      status: "inactive",
      retained: true,
      commandCount: 0,
      aliases: [],
      envKeys: [],
      createdAt: now,
      updatedAt: now,
    };
  }

  private getOrCreateRuntime(params: {
    taskId: string;
    workspaceId: string;
    workspacePath: string;
    scope?: ShellSessionScope;
    id?: string;
  }): ShellSessionRuntime {
    const scope = params.scope || "task";
    const sessionKey = params.id || this.getSessionKey(params.taskId, params.workspaceId, scope);
    let runtime = this.sessions.get(sessionKey);
    if (!runtime) {
      runtime = {
        info: this.createInfo({
          taskId: params.taskId,
          workspaceId: params.workspaceId,
          scope,
          cwd: params.workspacePath,
          id: params.id,
        }),
        snapshot: { cwd: params.workspacePath, env: {}, aliases: {} },
        shell: undefined,
        process: null,
        invalidation: undefined,
        bufferChunks: [],
        bufferChunkStart: 0,
        bufferLength: 0,
        bufferTruncated: false,
        bufferHead: "",
        bufferTailChunks: [],
        bufferTailChunkStart: 0,
        bufferTailLength: 0,
        ready: false,
        busy: false,
        pending: [],
        cmdSeq: 0,
        exitStatusOverride: undefined,
        terminalOutputListeners: new Map(),
      };
      this.sessions.set(sessionKey, runtime);
    }
    return runtime;
  }

  private updateRuntimeInfo(runtime: ShellSessionRuntime, patch: Partial<ShellSessionInfo>): void {
    runtime.info = {
      ...runtime.info,
      ...patch,
      updatedAt: Date.now(),
    };
  }

  private async invalidateRuntime(
    runtime: ShellSessionRuntime,
    reason: string,
    rejection: Error = new Error(reason),
  ): Promise<void> {
    if (runtime.invalidation) {
      await runtime.invalidation;
      return;
    }

    let releaseInvalidation!: () => void;
    const invalidation = new Promise<void>((resolve) => {
      releaseInvalidation = resolve;
    });
    runtime.invalidation = invalidation;
    try {
      const pending = [...runtime.pending];
      runtime.pending = [];

      for (const item of pending) {
        clearTimeout(item.timeout);
        try {
          item.reject(rejection);
        } catch {
          // Ignore duplicate or late rejections.
        }
      }

      const previousCwd = runtime.snapshot.cwd || runtime.info.cwd;
      const processToKill = runtime.process;
      runtime.process = null;
      runtime.ready = false;
      runtime.busy = false;
      resetRuntimeBuffer(runtime);
      runtime.snapshot = {
        cwd: previousCwd,
        env: {},
        aliases: {},
      };
      this.updateRuntimeInfo(runtime, {
        status: "inactive",
        cwd: previousCwd,
        aliases: [],
        envKeys: [],
        lastError: reason,
      });

      runtime.exitStatusOverride = "inactive";
      terminateProcessTree(processToKill);
      await waitForProcessExit(processToKill);
      if (processToKill?.exitCode === null && processToKill.signalCode === null) {
        terminateProcessTree(processToKill, "SIGKILL");
        await waitForProcessExit(processToKill);
      }

      await this.persistState();
    } finally {
      if (runtime.invalidation === invalidation) {
        runtime.invalidation = undefined;
      }
      releaseInvalidation();
    }
  }

  private emitTerminalOutput(
    runtime: ShellSessionRuntime,
    event: { stream: "stdout" | "stderr"; output: string },
  ): void {
    if (runtime.terminalOutputListeners.size === 0) return;
    for (const listener of runtime.terminalOutputListeners.values()) {
      try {
        listener(event);
      } catch {
        // Ignore stale renderer listeners.
      }
    }
  }

  private prepareRuntimeCwd(runtime: ShellSessionRuntime, workspacePath: string): string {
    const resolved = resolveRuntimeCwd(
      runtime.snapshot.cwd || runtime.info.cwd,
      workspacePath,
    );
    if (
      resolved.repaired ||
      runtime.info.cwd !== resolved.cwd ||
      runtime.snapshot.cwd !== resolved.cwd
    ) {
      runtime.snapshot = {
        ...runtime.snapshot,
        cwd: resolved.cwd,
      };
      this.updateRuntimeInfo(runtime, {
        cwd: resolved.cwd,
        lastError: undefined,
      });
    }
    return resolved.cwd;
  }

  private handleProcessError(
    runtime: ShellSessionRuntime,
    child: ChildProcess,
    error: unknown,
  ): void {
    // A replacement shell may already own this runtime after a timeout or
    // reset. Ignore late errors from the old child in that case.
    if (runtime.process !== child) return;

    const normalizedError =
      error instanceof Error ? error : new Error(String(error || "Unknown shell error"));
    runtime.process = null;
    runtime.ready = false;
    runtime.busy = false;
    resetRuntimeBuffer(runtime);
    runtime.exitStatusOverride = undefined;

    const pending = runtime.pending.splice(0);
    for (const item of pending) {
      clearTimeout(item.timeout);
      try {
        item.reject(normalizedError);
      } catch {
        // Ignore duplicate or late rejections.
      }
    }

    const message = `Persistent shell process failed: ${normalizedError.message}`;
    this.updateRuntimeInfo(runtime, {
      status: "inactive",
      retained: true,
      lastExitCode: null,
      lastTerminationReason: "error",
      lastError: message,
    });
    this.emitTerminalOutput(runtime, {
      stream: "stderr",
      output: `\n[terminal error: ${normalizedError.message}]\n`,
    });
    void this.persistState().catch(() => undefined);
  }

  private spawnProcess(runtime: ShellSessionRuntime, workspacePath: string): void {
    const isTerminalTab = runtime.info.scope === "tab";
    const shell = isTerminalTab ? resolveTerminalShellExecutable() : resolveShellExecutable();
    const args = isTerminalTab ? getTerminalShellArgs(shell) : getShellArgs(shell);
    const targetCwd = this.prepareRuntimeCwd(runtime, workspacePath);
    const child = spawn(shell, args, {
      cwd: targetCwd,
      detached: process.platform !== "win32",
      env: buildPersistentShellEnvironment(shell, isTerminalTab),
      stdio: ["pipe", "pipe", "pipe"],
    });

    runtime.shell = shell;
    runtime.process = child;
    resetRuntimeBuffer(runtime);
    runtime.ready = true;
    child.once("error", (error) => {
      this.handleProcessError(runtime, child, error);
    });
    if (process.platform === "win32") {
      if (!isTerminalTab && isWindowsPowerShell(shell)) {
        // Windows PowerShell 5 can emit the active system code page when its
        // stdout is redirected. Set all relevant encodings before commands
        // arrive so Chinese output and marker lines remain UTF-8.
        child.stdin?.write(
          "$OutputEncoding = [System.Text.UTF8Encoding]::new($false); " +
          "[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false); " +
          "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)\n",
        );
      } else if (isWindowsCmd(shell)) {
        child.stdin?.write("chcp 65001>nul\r\n");
      }
    }

    child.stdout?.on("data", (chunk: Buffer) => {
      const output = chunk.toString("utf-8");
      if (runtime.pending.length > 0) {
        appendBoundedRuntimeBuffer(runtime, output);
      }
      this.emitTerminalOutput(runtime, { stream: "stdout", output });
      for (const pending of runtime.pending) {
        pending.onOutput?.({ stream: "stdout", output });
      }
      this.tryCompletePending(runtime);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      const output = chunk.toString("utf-8");
      if (runtime.pending.length > 0) {
        appendBoundedRuntimeBuffer(runtime, output);
      }
      this.emitTerminalOutput(runtime, { stream: "stderr", output });
      for (const pending of runtime.pending) {
        pending.onOutput?.({ stream: "stderr", output });
      }
      this.tryCompletePending(runtime);
    });

    child.on("exit", (code, signal) => {
      // A timed-out process can emit its exit event after the session has
      // already spawned a replacement. Never let that stale event clear or
      // overwrite the replacement runtime.
      if (runtime.process !== child) return;
      const nextStatus = runtime.exitStatusOverride || "ended";
      runtime.exitStatusOverride = undefined;
      runtime.process = null;
      runtime.ready = false;
      runtime.busy = false;
      this.emitTerminalOutput(runtime, {
        stream: "stderr",
        output: signal ? `\n[terminal exited: ${signal}]\n` : `\n[terminal exited: ${code ?? "unknown"}]\n`,
      });
      this.updateRuntimeInfo(runtime, {
        status: nextStatus,
        retained: true,
        lastExitCode: code,
        lastTerminationReason: signal ? "error" : code === 0 ? "normal" : "error",
      });
      void this.persistState();
    });
  }

  private tryCompletePending(runtime: ShellSessionRuntime): void {
    const currentPending = runtime.pending[0];
    if (!currentPending) return;
    const doneMarker = `__NEOWORKER_DONE__:${currentPending.commandId}:`;
    // The completion marker is emitted after the state block, so it is always
    // close to the end of the protocol buffer. Avoid rescanning the entire
    // retained output for every small stdout chunk.
    const markerLookback = Math.max(1_024, doneMarker.length * 4);
    if (!getRuntimeBufferTail(runtime, markerLookback).includes(doneMarker)) return;

    const wasBufferTruncated = runtime.bufferTruncated;
    const raw = materializeRuntimeBuffer(runtime);
    resetRuntimeBuffer(runtime);
    const parsed = this.parseShellOutput(raw, runtime, wasBufferTruncated);
    const diff = diffSnapshot(runtime.snapshot, {
      cwd: parsed.cwd,
      env: parsed.env,
      aliases: parsed.aliases,
    });
    const previousCwd = runtime.info.cwd;
    const nextCommandCount = runtime.info.commandCount + 1;

    runtime.snapshot = {
      cwd: parsed.cwd,
      env: parsed.env,
      aliases: parsed.aliases,
    };
    this.updateRuntimeInfo(runtime, {
      status: "active",
      cwd: parsed.cwd,
      aliases: Object.keys(parsed.aliases),
      envKeys: Object.keys(parsed.env),
      commandCount: nextCommandCount,
      lastCommand: currentPending.command,
      lastCommandAt: Date.now(),
      lastExitCode: parsed.exitCode,
      lastTerminationReason:
        parsed.exitCode === 0 ? "normal" : ("error" as CommandTerminationReason),
      lastError: undefined,
    });

    clearTimeout(currentPending.timeout);
    runtime.pending.shift();
    runtime.busy = false;
    void this.persistState();

    const sessionEvent: ShellSessionLifecycleEvent = {
      action: nextCommandCount <= 1 ? "created" : "updated",
      taskId: runtime.info.taskId,
      workspaceId: runtime.info.workspaceId,
      session: { ...runtime.info },
      commandId: currentPending.commandId,
      reason:
        diff.cwd !== previousCwd
          ? "cwd_changed"
          : Object.keys(diff.env).length > 0 || Object.keys(diff.aliases).length > 0
            ? "state_updated"
            : undefined,
      timestamp: Date.now(),
    };

    currentPending.resolve({
      success: parsed.exitCode === 0,
      stdout: parsed.visible,
      stderr: "",
      exitCode: parsed.exitCode,
      truncated: parsed.truncated,
      terminationReason: parsed.exitCode === 0 ? "normal" : ("error" as CommandTerminationReason),
      usedPersistentSession: true,
      sessionId: runtime.info.id,
      sessionEvent,
    });
  }

  private async ensureShellReady(runtime: ShellSessionRuntime, workspacePath: string): Promise<void> {
    if (runtime.invalidation) {
      await runtime.invalidation;
    }
    if (runtime.process && !runtime.process.killed) return;
    this.spawnProcess(runtime, workspacePath);
    if (!runtime.process?.stdin) {
      throw new Error("Unable to start persistent shell session.");
    }

    const rehydrateCommands = buildRehydrateCommands(
      runtime.snapshot,
      runtime.shell,
    );
    if (rehydrateCommands.length > 0) {
      runtime.process.stdin.write(`${rehydrateCommands.join("\n")}\n`);
    }
  }

  private parseShellOutput(
    raw: string,
    runtime: ShellSessionRuntime,
    bufferTruncated = false,
  ): {
    visible: string;
    cwd: string;
    env: Record<string, string>;
    aliases: Record<string, string>;
    exitCode: number | null;
    truncated: boolean;
  } {
    // PowerShell/cmd may append a prompt or other whitespace after the
    // sentinel. Use a greedy command-id capture so IDs containing colons do
    // not make the parser stop at an earlier numeric segment.
    const doneMatch = raw.match(/__NEOWORKER_DONE__:(.*):(\d+|null)/);
    const exitCode = doneMatch
      ? doneMatch[2] === "null"
        ? null
        : Number(doneMatch[2])
      : null;

    const stateStart = raw.indexOf("__NEOWORKER_STATE_START__");
    const stateEnd = raw.indexOf("__NEOWORKER_ENV_END__");
    const visible = stateStart >= 0 ? raw.slice(0, stateStart) : raw;
    const stateBlock = stateStart >= 0 && stateEnd >= 0 ? raw.slice(stateStart, stateEnd) : "";

    let cwd = runtime.snapshot.cwd;
    const env = { ...runtime.snapshot.env };
    const aliases = { ...runtime.snapshot.aliases };

    if (stateBlock) {
      const lines = stateBlock.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      const cwdLine =
        lines.find((line) => line.includes("__NEOWORKER_CWD__:")) ||
        lines.find((line) => !line.startsWith("__NEOWORKER_") && line.length > 0);
      if (cwdLine) {
        const cleaned = stripShellControlCodes(cwdLine);
        const cwdMarker = cleaned.match(/__NEOWORKER_CWD__:(.+)$/);
        if (cwdMarker?.[1]) {
          cwd = cwdMarker[1].trim();
        } else {
          const promptSplit = cleaned.match(/%\s*(.+)$/);
          cwd = (promptSplit?.[1] || cleaned).trim();
        }
      }

      const aliasStart = raw.indexOf("__NEOWORKER_ALIASES_START__");
      const aliasEnd = raw.indexOf("__NEOWORKER_ALIASES_END__");
      if (aliasStart >= 0 && aliasEnd >= 0 && aliasEnd > aliasStart) {
        const aliasLines = raw
          .slice(aliasStart + "__NEOWORKER_ALIASES_START__".length, aliasEnd)
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean);
        const nextAliases: Record<string, string> = {};
        for (const line of aliasLines) {
          const parsed = parseAliasLine(line);
          if (parsed) {
            nextAliases[parsed[0]] = parsed[1];
          }
        }
        for (const key of Object.keys(aliases)) {
          delete aliases[key];
        }
        Object.assign(aliases, nextAliases);
      }

      const envStart = raw.indexOf("__NEOWORKER_ENV_START__");
      if (envStart >= 0 && stateEnd > envStart) {
        const envLines = raw
          .slice(envStart + "__NEOWORKER_ENV_START__".length, stateEnd)
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean);
        const nextEnv: Record<string, string> = {};
        for (const line of envLines) {
          const parsed = parseEnvLine(line);
          if (parsed) {
            nextEnv[parsed[0]] = parsed[1];
          }
        }
        for (const key of Object.keys(env)) {
          delete env[key];
        }
        Object.assign(env, nextEnv);
      }
    }

    const cleanedVisible = stripPowerShellProtocolEcho(visible)
      .replace(/__NEOWORKER_[A-Z_]+__.*/g, "")
      .replace(/^\s+|\s+$/g, "");
    const boundedVisible = boundPersistentVisibleOutput(
      cleanedVisible,
      bufferTruncated,
    );

    return {
      visible: boundedVisible.output,
      cwd,
      env,
      aliases,
      exitCode,
      truncated: boundedVisible.truncated,
    };
  }

  async runCommand(request: ShellRunRequest): Promise<ShellCommandResult> {
    await this.ensureStateLoaded();
    if (request.signal?.aborted) {
      throw createCancellationError("Persistent shell command cancelled before start.");
    }

    const session = this.getOrCreateRuntime({
      taskId: request.taskId,
      workspaceId: request.workspaceId,
      workspacePath: request.workspacePath,
      scope: request.scope || "task",
      id: request.sessionId,
    });

    if (session.busy || session.pending.length > 0) {
      throw new Error("Terminal session is already running a command.");
    }
    const runKey = session.info.id;
    if (this.activeSessionRuns.has(runKey)) {
      throw new Error("Terminal session is already running a command.");
    }
    this.activeSessionRuns.add(runKey);

    const commandId = `${session.info.id}:${++session.cmdSeq}`;
    const commandTimeoutMaxMs = request.scope === "tab" ? TAB_COMMAND_TIMEOUT_MAX_MS : COMMAND_TIMEOUT_MAX_MS;
    const commandTimeoutMs = Math.min(Math.max(request.timeoutMs || COMMAND_TIMEOUT_FALLBACK_MS, 1_000), commandTimeoutMaxMs);

    const firstCommand = !session.process || session.process.killed;
    if (firstCommand) {
      this.spawnProcess(session, request.workspacePath);
      this.updateRuntimeInfo(session, {
        status: "active",
        cwd: session.snapshot.cwd || request.workspacePath,
      });
      await this.persistState();
    }
    if (request.signal?.aborted) {
      await this.invalidateRuntime(
        session,
        "Persistent shell command cancelled before dispatch.",
        createCancellationError("Persistent shell command cancelled before dispatch."),
      );
      this.activeSessionRuns.delete(runKey);
      throw createCancellationError("Persistent shell command cancelled before dispatch.");
    }

    if (!session.process?.stdin || !session.process.stdout) {
      this.activeSessionRuns.delete(runKey);
      return {
        success: false,
        stdout: "",
        stderr: "Persistent shell unavailable.",
        exitCode: null,
        terminationReason: "error",
        usedPersistentSession: false,
        sessionId: session.info.id,
      };
    }

    const targetCwd = request.cwd
      ? path.isAbsolute(request.cwd)
        ? request.cwd
        : path.resolve(session.snapshot.cwd || request.workspacePath, request.cwd)
      : session.snapshot.cwd || request.workspacePath;
    // A new command owns a fresh protocol buffer. Any bytes left after a
    // previous process error or cancellation must never satisfy its marker.
    resetRuntimeBuffer(session);
    const wrapper = buildCommandWrapper(
      session.shell || resolveShellExecutable(),
      targetCwd,
      request.command,
      commandId,
    );

    let abortListener: (() => void) | undefined;
    const commandPromise = new Promise<ShellCommandResult>((resolve, reject) => {
      session.busy = true;
      const timeout = setTimeout(() => {
        void this.invalidateRuntime(
          session,
          "Persistent shell command timed out.",
          new Error("Persistent shell command timed out."),
        );
      }, commandTimeoutMs);

      session.pending.push({
        commandId,
        command: request.command,
        timeout,
        fallback: false,
        resolve,
        reject,
        cwd: targetCwd,
        onOutput: request.onOutput,
      });
      abortListener = () => {
        void this.invalidateRuntime(
          session,
          "Persistent shell command cancelled.",
          createCancellationError("Persistent shell command cancelled."),
        );
      };
      if (request.signal) {
        request.signal.addEventListener("abort", abortListener, { once: true });
      }
      if (request.signal?.aborted) {
        abortListener();
        return;
      }
      try {
        session.process!.stdin!.write(`${wrapper}\n`);
      } catch (error) {
        clearTimeout(timeout);
        session.busy = false;
        session.pending = session.pending.filter((item) => item.commandId !== commandId);
        reject(error);
      }
      session.process!.stdin!.once("error", (error) => {
        clearTimeout(timeout);
        session.busy = false;
        session.pending = session.pending.filter((item) => item.commandId !== commandId);
        reject(error);
      });
    });
    return commandPromise.finally(() => {
      if (request.signal && abortListener) {
        request.signal.removeEventListener("abort", abortListener);
      }
      this.activeSessionRuns.delete(runKey);
    });
  }

  async createTab(params: {
    workspaceId: string;
    workspacePath: string;
    cwd?: string;
    title?: string;
  }): Promise<ShellSessionInfo> {
    await this.ensureStateLoaded();
    const existingTabs = Array.from(this.sessions.values())
      .filter((session) => session.info.workspaceId === params.workspaceId && session.info.scope === "tab")
      .sort((a, b) => a.info.updatedAt - b.info.updatedAt);
    let tabCount = existingTabs.length;
    for (const tab of existingTabs) {
      if (tabCount < MAX_TERMINAL_TABS_PER_WORKSPACE) break;
      if (tab.info.status !== "ended") continue;
      this.sessions.delete(tab.info.id);
      tabCount -= 1;
    }
    if (tabCount >= MAX_TERMINAL_TABS_PER_WORKSPACE) {
      throw new Error(`Terminal tabs are limited to ${MAX_TERMINAL_TABS_PER_WORKSPACE} per workspace.`);
    }
    const now = Date.now();
    const tabToken = `tab-${now}-${crypto.randomUUID().slice(0, 8)}`;
    const cwd = params.cwd
      ? path.isAbsolute(params.cwd)
        ? params.cwd
        : path.resolve(params.workspacePath, params.cwd)
      : params.workspacePath;
    const runtime = this.getOrCreateRuntime({
      taskId: tabToken,
      workspaceId: params.workspaceId,
      workspacePath: cwd,
      scope: "tab",
      id: `tab:${params.workspaceId}:${tabToken}`,
    });
    runtime.info.lastCommand = params.title?.trim() || undefined;
    this.updateRuntimeInfo(runtime, {
      cwd,
      status: "inactive",
      retained: true,
    });
    await this.persistState();
    return { ...runtime.info };
  }

  async listTabs(workspaceId?: string): Promise<ShellSessionInfo[]> {
    await this.ensureStateLoaded();
    return this.listSessions(undefined, workspaceId).filter((session) => session.scope === "tab");
  }

  async runInTab(params: {
    tabId: string;
    workspacePath: string;
    command: string;
    cwd?: string;
    timeoutMs: number;
    onOutput?: (event: { stream: "stdout" | "stderr"; output: string }) => void;
  }): Promise<ShellCommandResult> {
    await this.ensureStateLoaded();
    const runtime = this.sessions.get(params.tabId);
    if (!runtime || runtime.info.scope !== "tab") {
      throw new Error("Terminal tab not found.");
    }
    if (runtime.busy || runtime.pending.length > 0) {
      throw new Error("Terminal session is already running a command.");
    }
    this.updateRuntimeInfo(runtime, { status: "running" });
    return this.runCommand({
      taskId: runtime.info.taskId,
      workspaceId: runtime.info.workspaceId,
      workspacePath: params.workspacePath,
      command: params.command,
      cwd: params.cwd,
      timeoutMs: params.timeoutMs,
      scope: "tab",
      sessionId: params.tabId,
      onOutput: params.onOutput,
      fallbackRunner: async () => ({
        success: false,
        stdout: "",
        stderr: "Terminal tab fallback requested.",
        exitCode: null,
        terminationReason: "error",
        truncated: false,
      }),
    });
  }

  async attachTerminalTabOutput(
    sessionId: string,
    listenerKey: string,
    listener: (event: { stream: "stdout" | "stderr"; output: string }) => void,
    workspacePath?: string,
  ): Promise<ShellSessionInfo> {
    await this.ensureStateLoaded();
    const session = this.sessions.get(sessionId);
    if (!session || session.info.scope !== "tab") {
      throw new Error("Terminal tab not found.");
    }
    session.terminalOutputListeners.set(listenerKey, listener);
    if (!session.process || session.process.killed) {
      this.spawnProcess(session, workspacePath || session.info.cwd);
      this.updateRuntimeInfo(session, { status: "active" });
      await this.persistState();
    }
    return { ...session.info };
  }

  async writeToSession(sessionId: string, input: string): Promise<ShellSessionInfo> {
    await this.ensureStateLoaded();
    if (input.length > 1_000_000) {
      throw new Error("Input exceeds maximum allowed length.");
    }
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error("Terminal session is not running.");
    }
    if (session.info.scope === "tab" && input === "\x03") {
      return (await this.stopSessionById(sessionId)) || { ...session.info };
    }
    if (session.info.scope === "tab" && (!session.process || session.process.killed)) {
      this.spawnProcess(session, session.info.cwd);
      this.updateRuntimeInfo(session, { status: "active" });
    }
    if (!session.process?.stdin) {
      throw new Error("Terminal session is not running.");
    }
    if (input) {
      session.process.stdin.write(input);
    }
    this.updateRuntimeInfo(session, {
      status: session.info.scope === "tab" ? "active" : input ? "running" : "active",
    });
    return { ...session.info };
  }

  async stopSessionById(sessionId: string): Promise<ShellSessionInfo | null> {
    await this.ensureStateLoaded();
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    session.exitStatusOverride = "inactive";
    const processToKill = session.process;
    terminateProcessTree(processToKill);
    session.process = null;
    session.ready = false;
    session.busy = false;
    this.activeSessionRuns.delete(session.info.id);
    for (const pending of session.pending) {
      clearTimeout(pending.timeout);
      pending.resolve({
        success: false,
        stdout: "",
        stderr: "Terminal command stopped.",
        exitCode: null,
        terminationReason: "error",
        usedPersistentSession: true,
        sessionId: session.info.id,
      });
    }
    session.pending = [];
    await waitForProcessExit(processToKill);
    if (processToKill?.exitCode === null && processToKill.signalCode === null) {
      terminateProcessTree(processToKill, "SIGKILL");
      await waitForProcessExit(processToKill);
    }
    this.updateRuntimeInfo(session, { status: "inactive", lastTerminationReason: "error" });
    await this.persistState();
    return { ...session.info };
  }

  async closeSessionById(sessionId: string): Promise<ShellSessionInfo | null> {
    await this.ensureStateLoaded();
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    session.exitStatusOverride = "ended";
    const processToKill = session.process;
    for (const pending of session.pending) {
      clearTimeout(pending.timeout);
      pending.resolve({
        stdout: "",
        stderr: "Terminal session closed.",
        exitCode: null,
        success: false,
        usedPersistentSession: true,
      });
    }
    session.pending = [];
    terminateProcessTree(processToKill);
    session.process = null;
    session.ready = false;
    session.busy = false;
    this.activeSessionRuns.delete(session.info.id);
    await waitForProcessExit(processToKill);
    if (processToKill?.exitCode === null && processToKill.signalCode === null) {
      terminateProcessTree(processToKill, "SIGKILL");
      await waitForProcessExit(processToKill);
    }
    this.sessions.delete(sessionId);
    await this.persistState();
    return { ...session.info, status: "ended" };
  }

  getSessionInfo(taskId: string, workspaceId: string, scope: ShellSessionScope = "task"): ShellSessionInfo | null {
    const session = this.sessions.get(this.getSessionKey(taskId, workspaceId, scope));
    return session ? { ...session.info } : null;
  }

  listSessions(taskId?: string, workspaceId?: string): ShellSessionInfo[] {
    return Array.from(this.sessions.values())
      .filter((session) => {
        if (taskId && session.info.taskId !== taskId) return false;
        if (workspaceId && session.info.workspaceId !== workspaceId) return false;
        return true;
      })
      .map((session) => ({ ...session.info }));
  }

  async resetSession(taskId: string, workspaceId: string, scope: ShellSessionScope = "task"): Promise<ShellSessionInfo | null> {
    await this.ensureStateLoaded();
    const key = this.getSessionKey(taskId, workspaceId, scope);
    const session = this.sessions.get(key);
    if (!session) return null;

    this.updateRuntimeInfo(session, { status: "resetting" });
    session.exitStatusOverride = "inactive";
    const processToKill = session.process;
    terminateProcessTree(processToKill);
    session.process = null;
    session.ready = false;
    resetRuntimeBuffer(session);
    session.busy = false;
    session.snapshot = { cwd: session.info.cwd, env: {}, aliases: {} };
    session.info.commandCount = 0;
    session.info.lastCommand = undefined;
    session.info.lastExitCode = undefined;
    session.info.lastTerminationReason = undefined;
    session.info.lastError = undefined;
    await waitForProcessExit(processToKill);
    if (processToKill?.exitCode === null && processToKill.signalCode === null) {
      terminateProcessTree(processToKill, "SIGKILL");
      await waitForProcessExit(processToKill);
    }
    this.updateRuntimeInfo(session, { status: "inactive" });
    await this.persistState();
    return { ...session.info };
  }

  async closeSession(taskId: string, workspaceId: string, scope: ShellSessionScope = "task"): Promise<ShellSessionInfo | null> {
    await this.ensureStateLoaded();
    const key = this.getSessionKey(taskId, workspaceId, scope);
    const session = this.sessions.get(key);
    if (!session) return null;

    session.exitStatusOverride = "ended";
    const processToKill = session.process;
    terminateProcessTree(processToKill);
    session.process = null;
    session.ready = false;
    session.busy = false;
    for (const pending of session.pending) {
      clearTimeout(pending.timeout);
      pending.resolve({
        success: false,
        stdout: "",
        stderr: "Terminal session closed.",
        exitCode: null,
        terminationReason: "error",
        usedPersistentSession: true,
        sessionId: session.info.id,
      });
    }
    session.pending = [];
    this.activeSessionRuns.delete(session.info.id);
    await waitForProcessExit(processToKill);
    if (processToKill?.exitCode === null && processToKill.signalCode === null) {
      terminateProcessTree(processToKill, "SIGKILL");
      await waitForProcessExit(processToKill);
    }
    this.updateRuntimeInfo(session, { status: "ended" });
    await this.persistState();
    return { ...session.info };
  }
}

export const _testUtils = {
  buildCommandWrapper,
  buildPersistentShellEnvironment,
  buildRehydrateCommands,
  getShellArgs,
  getTerminalShellArgs,
  isUsableDirectory,
  resolveRuntimeCwd,
};
