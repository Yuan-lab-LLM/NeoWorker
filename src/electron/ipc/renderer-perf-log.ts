import type { LogLevel } from "../utils/logger";

function rendererPerfMessage(payload: unknown): string | null {
  if (typeof payload === "string") return payload;
  if (!payload || typeof payload !== "object") return null;
  const message = (payload as { message?: unknown }).message;
  return typeof message === "string" ? message : null;
}

export function stringifyRendererPerfPayload(payload: unknown): string {
  if (typeof payload === "string") return payload;
  try {
    return JSON.stringify(payload);
  } catch {
    return String(payload);
  }
}

export function rendererPerfLogLevel(payload: unknown): LogLevel {
  const message = rendererPerfMessage(payload);
  if (!message) return "debug";

  if (message.startsWith("[Startup] ")) {
    return "info";
  }

  return "debug";
}
