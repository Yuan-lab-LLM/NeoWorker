import fs from "fs";
import path from "path";

const GPU_SAFE_MODE_FILE = "gpu-safe-mode.json";
const RUNTIME_DIAGNOSTIC_FILE = "runtime-crashes.jsonl";
const GPU_SAFE_MODE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_DIAGNOSTIC_BYTES = 2 * 1024 * 1024;

function isEnabled(value: string | undefined): boolean {
  return /^(1|true|yes|on)$/i.test(String(value || "").trim());
}

function getDiagnosticDirectory(userDataDir: string): string {
  return path.join(userDataDir, "logs");
}

export interface RuntimeDiagnosticEntry {
  kind: "renderer-process-gone" | "child-process-gone";
  reason: string;
  exitCode?: number;
  processType?: string;
  processName?: string;
  serviceName?: string;
  timestamp?: string;
}

export function appendRuntimeDiagnostic(
  userDataDir: string,
  entry: RuntimeDiagnosticEntry,
): void {
  try {
    const directory = getDiagnosticDirectory(userDataDir);
    fs.mkdirSync(directory, { recursive: true });
    const logPath = path.join(directory, RUNTIME_DIAGNOSTIC_FILE);
    try {
      if (fs.statSync(logPath).size >= MAX_DIAGNOSTIC_BYTES) {
        fs.renameSync(logPath, `${logPath}.previous`);
      }
    } catch {
      // The log does not exist yet.
    }
    fs.appendFileSync(
      logPath,
      `${JSON.stringify({ ...entry, timestamp: entry.timestamp || new Date().toISOString() })}\n`,
      "utf8",
    );
  } catch {
    // Runtime diagnostics must never make the desktop process less stable.
  }
}

export function recordGpuProcessCrash(
  userDataDir: string,
  now = Date.now(),
): void {
  try {
    fs.mkdirSync(userDataDir, { recursive: true });
    fs.writeFileSync(
      path.join(userDataDir, GPU_SAFE_MODE_FILE),
      JSON.stringify({ recordedAt: now }),
      "utf8",
    );
  } catch {
    // Best effort. Chromium can still apply its own software fallback.
  }
}

export function shouldDisableHardwareAcceleration(options: {
  userDataDir: string;
  env?: NodeJS.ProcessEnv;
  now?: number;
}): boolean {
  const env = options.env || process.env;
  if (isEnabled(env.NEOWORKER_FORCE_HARDWARE_ACCELERATION)) {
    return false;
  }
  if (isEnabled(env.NEOWORKER_DISABLE_HARDWARE_ACCELERATION)) {
    return true;
  }

  try {
    const raw = fs.readFileSync(
      path.join(options.userDataDir, GPU_SAFE_MODE_FILE),
      "utf8",
    );
    const recordedAt = Number(JSON.parse(raw)?.recordedAt);
    const age = (options.now ?? Date.now()) - recordedAt;
    return (
      Number.isFinite(recordedAt) && age >= 0 && age <= GPU_SAFE_MODE_TTL_MS
    );
  } catch {
    return false;
  }
}

export function getRuntimeDiagnosticPath(userDataDir: string): string {
  return path.join(
    getDiagnosticDirectory(userDataDir),
    RUNTIME_DIAGNOSTIC_FILE,
  );
}
