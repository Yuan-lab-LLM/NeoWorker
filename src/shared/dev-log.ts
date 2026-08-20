export type DevLogProcess = "dev-wrapper" | "react" | "electron";
export type DevLogStream = "stdout" | "stderr";
export type DevLogLevel = "error" | "warn" | "info" | "debug";

export interface DevLogEvent {
  timestamp: string;
  runId: string;
  process: DevLogProcess;
  stream: DevLogStream;
  level: DevLogLevel;
  component?: string;
  message: string;
  rawLine: string;
  error?: {
    message: string;
    name?: string;
    stack?: string;
  };
  taskId?: string;
  workspaceId?: string;
  metadata?: Record<string, unknown>;
}

export interface DevLogRunManifestEntry {
  runId: string;
  startedAt: string;
  endedAt?: string;
  exitCode?: number;
  signal?: string;
  textPath: string;
  jsonlPath: string;
  byteSize: number;
  lineCount: number;
  errorCount: number;
  warnCount: number;
}

const DEV_LOG_LEVELS = new Set(["error", "warn", "info", "debug"]);
const DEV_LOG_PROCESSES = new Set(["dev-wrapper", "react", "electron"]);
const DEV_LOG_STREAMS = new Set(["stdout", "stderr"]);

export function parseDevLogJsonLine(line: string): DevLogEvent | null {
  if (!line.trim()) return null;
  try {
    const parsed = JSON.parse(line) as Partial<DevLogEvent>;
    if (
      typeof parsed.timestamp !== "string" ||
      typeof parsed.runId !== "string" ||
      typeof parsed.message !== "string" ||
      typeof parsed.rawLine !== "string" ||
      !DEV_LOG_LEVELS.has(String(parsed.level)) ||
      !DEV_LOG_PROCESSES.has(String(parsed.process)) ||
      !DEV_LOG_STREAMS.has(String(parsed.stream))
    ) {
      return null;
    }
    return parsed as DevLogEvent;
  } catch {
    return null;
  }
}

export function isDevLogFailureEvent(event: DevLogEvent): boolean {
  if (event.level === "error") return true;
  return /error|exception|failed|uncaught|fatal|crash/i.test(event.message);
}

export function formatDevLogEventForEvidence(event: DevLogEvent): string {
  const component = event.component ? ` [${event.component}]` : "";
  return `[${event.timestamp}] [${event.process}]${component} ${event.message}`.trim();
}

export function buildDevLogStructuredSignature(event: DevLogEvent): string {
  return [event.level, event.process, event.component || "", event.message].join(":");
}
