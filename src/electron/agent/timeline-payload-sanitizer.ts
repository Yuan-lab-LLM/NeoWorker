import type { TaskEvent } from "../../shared/types";

const MAX_TIMELINE_STRING_CHARS = 60_000;
export const TIMELINE_PAYLOAD_STORAGE_BYTE_LIMIT = 256 * 1024;
const MAX_TIMELINE_PAYLOAD_PREVIEW_CHARS = 4096;
const MAX_TIMELINE_SANITIZE_DEPTH = 12;
const MAX_TIMELINE_ARRAY_ITEMS = 200;
const MAX_TIMELINE_OBJECT_KEYS = 200;

const BASE64_IMAGE_FIELD_NAMES = new Set([
  "imagebase64",
  "image_base64",
  "screenshotbase64",
  "screenshot_base64",
]);

const SUMMARY_FIELD_NAMES = new Set([
  "actor",
  "args",
  "artifactId",
  "artifact_id",
  "captureId",
  "capture_id",
  "command",
  "commandId",
  "contentType",
  "error",
  "eventId",
  "exitCode",
  "filePath",
  "groupId",
  "id",
  "label",
  "legacyType",
  "mediaType",
  "message",
  "mimeType",
  "name",
  "path",
  "reason",
  "sessionId",
  "status",
  "stepId",
  "summary",
  "title",
  "tool",
  "type",
  "url",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isBinaryLike(value: unknown): value is { byteLength?: number; length?: number } {
  if (!value || typeof value !== "object") return false;
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(value)) return true;
  return ArrayBuffer.isView(value) || value instanceof ArrayBuffer;
}

function getBinaryByteLength(value: { byteLength?: number; length?: number }): number | undefined {
  const byteLength = value.byteLength ?? value.length;
  return typeof byteLength === "number" && Number.isFinite(byteLength)
    ? Math.max(0, Math.floor(byteLength))
    : undefined;
}

function shouldOmitImageString(key: string | undefined, value: string): boolean {
  const normalizedKey = (key || "").toLowerCase();
  if (BASE64_IMAGE_FIELD_NAMES.has(normalizedKey)) return value.length > 0;
  if (value.startsWith("data:image/")) return true;
  return normalizedKey.includes("imagebase64") || normalizedKey.includes("screenshotbase64");
}

function truncateLargeString(value: string): string {
  if (value.length <= MAX_TIMELINE_STRING_CHARS) return value;

  const omittedChars = value.length - MAX_TIMELINE_STRING_CHARS;
  return `${value.slice(0, MAX_TIMELINE_STRING_CHARS)}\n[... truncated ${omittedChars} chars for timeline storage ...]`;
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify({
      __neoworkerPayloadTruncated: true,
      reason: "payload could not be serialized for timeline storage",
    });
  }
}

function serializedBytes(value: unknown): number {
  return Buffer.byteLength(safeStringify(value), "utf8");
}

function summarizeScalar(value: unknown): unknown {
  if (typeof value === "string") {
    return value.length > 1000 ? `${value.slice(0, 1000)}...` : value;
  }
  if (typeof value === "number") return Number.isFinite(value) ? value : String(value);
  if (typeof value === "boolean" || value === null) return value;
  if (typeof value === "bigint") return `${value.toString()}n`;
  return undefined;
}

function buildRetainedSummary(
  value: unknown,
  depth = 0,
  seen = new WeakSet<object>(),
): Record<string, unknown> {
  if (!isRecord(value) || seen.has(value)) return {};
  seen.add(value);
  const retained: Record<string, unknown> = {};
  let count = 0;

  for (const [key, child] of Object.entries(value)) {
    if (count >= 32) break;
    const shouldRetain =
      SUMMARY_FIELD_NAMES.has(key) ||
      key.endsWith("Omitted") ||
      key.endsWith("OriginalChars") ||
      key.startsWith("__neoworker");
    if (!shouldRetain) continue;

    const scalar = summarizeScalar(child);
    if (scalar !== undefined) {
      retained[key] = scalar;
      count += 1;
      continue;
    }

    if (Array.isArray(child)) {
      retained[key] = `[${child.length} item${child.length === 1 ? "" : "s"} omitted]`;
      count += 1;
      continue;
    }

    if (depth < 2 && isRecord(child)) {
      const nested = buildRetainedSummary(child, depth + 1, seen);
      if (Object.keys(nested).length > 0) {
        retained[key] = nested;
        count += 1;
      }
    }
  }

  seen.delete(value);
  return retained;
}

function enforcePayloadByteLimit(value: unknown, maxBytes: number): unknown {
  const serialized = safeStringify(value);
  const bytes = Buffer.byteLength(serialized, "utf8");
  if (bytes <= maxBytes) return value;

  const retained = buildRetainedSummary(value);
  const compact = {
    ...retained,
    __neoworkerPayloadTruncated: true,
    originalPayloadBytes: bytes,
    maxPayloadBytes: maxBytes,
    preview: serialized.slice(0, MAX_TIMELINE_PAYLOAD_PREVIEW_CHARS),
  };

  if (serializedBytes(compact) <= maxBytes) return compact;

  return {
    __neoworkerPayloadTruncated: true,
    originalPayloadBytes: bytes,
    maxPayloadBytes: maxBytes,
    preview: serialized.slice(0, 1000),
  };
}

function sanitizeValue(
  value: unknown,
  key: string | undefined,
  depth: number,
  seen: WeakSet<object>,
): unknown {
  if (value === undefined) return null;

  if (typeof value === "string") {
    if (shouldOmitImageString(key, value)) {
      return {
        omitted: true,
        reason: "base64 image payload",
        originalChars: value.length,
      };
    }
    return truncateLargeString(value);
  }

  if (typeof value === "bigint") return `${value.toString()}n`;
  if (typeof value === "number") return Number.isFinite(value) ? value : String(value);
  if (typeof value === "function" || typeof value === "symbol") {
    return `[${typeof value} omitted from timeline payload]`;
  }
  if (!value || typeof value !== "object") return value;

  if (seen.has(value)) {
    return "[circular timeline payload reference omitted]";
  }
  if (depth >= MAX_TIMELINE_SANITIZE_DEPTH) {
    return "[nested timeline payload omitted]";
  }

  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString() : "[invalid date omitted]";
  }

  if (isBinaryLike(value)) {
    return {
      omitted: true,
      reason: "binary payload",
      originalBytes: getBinaryByteLength(value),
    };
  }

  if (value instanceof Map) {
    return {
      omitted: true,
      reason: "Map payload",
      size: value.size,
    };
  }

  if (value instanceof Set) {
    return {
      omitted: true,
      reason: "Set payload",
      size: value.size,
    };
  }

  seen.add(value);
  try {
    if (Array.isArray(value)) {
      const entries = value
        .slice(0, MAX_TIMELINE_ARRAY_ITEMS)
        .map((entry) => sanitizeValue(entry, undefined, depth + 1, seen));
      if (value.length > MAX_TIMELINE_ARRAY_ITEMS) {
        entries.push({
          omitted: true,
          reason: "array item limit",
          omittedItems: value.length - MAX_TIMELINE_ARRAY_ITEMS,
        });
      }
      return entries;
    }

    if (!isRecord(value)) return value;

    const sanitized: Record<string, unknown> = {};
    const entries = Object.entries(value);
    for (const [entryKey, entryValue] of entries.slice(0, MAX_TIMELINE_OBJECT_KEYS)) {
      const sanitizedValue = sanitizeValue(entryValue, entryKey, depth + 1, seen);
      const normalizedKey = entryKey.toLowerCase();
      if (
        typeof entryValue === "string" &&
        shouldOmitImageString(entryKey, entryValue) &&
        (BASE64_IMAGE_FIELD_NAMES.has(normalizedKey) ||
          normalizedKey.includes("imagebase64") ||
          normalizedKey.includes("screenshotbase64"))
      ) {
        sanitized[`${entryKey}Omitted`] = true;
        sanitized[`${entryKey}OriginalChars`] = entryValue.length;
        continue;
      }
      sanitized[entryKey] = sanitizedValue;
    }
    if (entries.length > MAX_TIMELINE_OBJECT_KEYS) {
      sanitized.__neoworkerOmittedKeys = entries.length - MAX_TIMELINE_OBJECT_KEYS;
    }
    return sanitized;
  } finally {
    seen.delete(value);
  }
}

export function sanitizeTimelinePayloadForStorage(payload: unknown): unknown {
  return enforcePayloadByteLimit(
    sanitizeValue(payload, undefined, 0, new WeakSet<object>()),
    TIMELINE_PAYLOAD_STORAGE_BYTE_LIMIT,
  );
}

export function sanitizeTimelineEventForStorage<T extends TaskEvent>(event: T): T {
  return {
    ...event,
    payload: sanitizeTimelinePayloadForStorage(event.payload),
  };
}
