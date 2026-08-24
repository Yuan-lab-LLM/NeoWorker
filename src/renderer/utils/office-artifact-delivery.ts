import type { TaskEvent } from "../../shared/types";
import { getEffectiveTaskEventType } from "./task-event-compat";

export type OfficeDeliveryFormat = "docx" | "pptx" | "xlsx";

export type OfficeDeliveryPhase =
  | "planning"
  | "generating"
  | "validating"
  | "repairing"
  | "ready_to_publish"
  | "published"
  | "failed"
  | "cancelled";

export interface OfficeArtifactVersion {
  artifactId: string;
  path: string;
  format: OfficeDeliveryFormat;
  version: number;
  contentHash?: string;
  createdAt: string;
  publishedAt: string;
  repairAttempts: number;
  qualityStatus: "pass" | "issues" | "failed" | "unknown";
}

export interface OfficeFormatDeliveryState {
  format: OfficeDeliveryFormat;
  phase: OfficeDeliveryPhase;
  updatedAt: number;
  path?: string;
  version?: number;
  repairAttempts: number;
  diagnosticCode?: string;
  versions: OfficeArtifactVersion[];
}

export interface OfficeDeliverySummary {
  requestId: string;
  status: "working" | "partial" | "published" | "failed" | "cancelled";
  formats: OfficeFormatDeliveryState[];
  deliveredCount: number;
  failedCount: number;
  totalCount: number;
  updatedAt: number;
}

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalizeFormat(value: unknown): OfficeDeliveryFormat | null {
  const normalized = String(value || "").toLowerCase();
  if (normalized === "docx" || normalized === "pptx" || normalized === "xlsx") {
    return normalized;
  }
  return null;
}

function normalizePhase(value: unknown): OfficeDeliveryPhase | null {
  switch (String(value || "")) {
    case "planning":
    case "planning_complete":
      return "planning";
    case "staging":
    case "generating":
      return "generating";
    case "validating":
    case "repairing":
    case "ready_to_publish":
    case "published":
    case "failed":
    case "cancelled":
      return String(value) as OfficeDeliveryPhase;
    default:
      return null;
  }
}

function phaseRank(phase: OfficeDeliveryPhase): number {
  return {
    planning: 1,
    generating: 2,
    validating: 3,
    repairing: 4,
    ready_to_publish: 5,
    published: 6,
    failed: 6,
    cancelled: 6,
  }[phase];
}

function readManifest(event: TaskEvent): JsonRecord | null {
  return asRecord(asRecord(event.payload)?.officeManifest);
}

function readVersion(event: TaskEvent): OfficeArtifactVersion | null {
  const payload = asRecord(event.payload);
  const manifest = readManifest(event);
  if (!payload || !manifest || manifest.status !== "published") return null;
  const format = normalizeFormat(manifest.format);
  const artifactId = asString(manifest.artifactId);
  const artifactPath = asString(payload.path) || asString(manifest.finalPath);
  if (!format || !artifactId || !artifactPath) return null;
  return {
    artifactId,
    path: artifactPath.replace(/\\/g, "/"),
    format,
    version: asNumber(manifest.version) || 1,
    contentHash: asString(manifest.contentHash),
    createdAt: asString(manifest.createdAt) || new Date(event.timestamp).toISOString(),
    publishedAt:
      asString(manifest.publishedAt) || new Date(event.timestamp).toISOString(),
    repairAttempts: asNumber(manifest.repairAttempts) || 0,
    qualityStatus:
      payload.qualityStatus === "passed"
        ? "pass"
        : payload.qualityStatus === "pass" ||
      payload.qualityStatus === "issues" ||
      payload.qualityStatus === "failed"
        ? payload.qualityStatus
        : "unknown",
  };
}

/**
 * Projects the raw Office progress and published-manifest events into one
 * user-facing work group. The renderer never infers success from a filename:
 * only a committed published manifest can produce a delivered state.
 */
export function deriveOfficeArtifactDelivery(
  events: TaskEvent[],
): OfficeDeliverySummary | null {
  const versionsByFormat = new Map<OfficeDeliveryFormat, OfficeArtifactVersion[]>();
  const stateByFormat = new Map<OfficeDeliveryFormat, OfficeFormatDeliveryState>();
  let requestId: string | undefined;
  let latestRequestTimestamp = -1;
  let updatedAt = 0;

  // A task can contain several explicit regeneration rounds. Show the most
  // recent request as the active work group while retaining older manifests
  // only as version history. Otherwise completed formats from an old round can
  // make a new failed round look partially successful.
  for (const event of events) {
    const payload = asRecord(event.payload);
    if (!payload) continue;
    const manifest = readManifest(event);
    const isOfficeProgress =
      getEffectiveTaskEventType(event) === "progress_update" &&
      (payload.kind === "office_artifact_plan" ||
        payload.kind === "office_artifact_publish");
    const version = readVersion(event);
    const format = version?.format || normalizeFormat(payload.format || manifest?.format);
    if ((!isOfficeProgress && !version) || !format) continue;
    const eventRequestId =
      asString(payload.requestId) ||
      asString(manifest?.requestId) ||
      "legacy-office-delivery";
    if (event.timestamp >= latestRequestTimestamp) {
      latestRequestTimestamp = event.timestamp;
      requestId = eventRequestId;
    }
  }

  if (!requestId) return null;

  for (const event of events) {
    const payload = asRecord(event.payload);
    if (!payload) continue;
    const manifest = readManifest(event);
    const isOfficeProgress =
      getEffectiveTaskEventType(event) === "progress_update" &&
      (payload.kind === "office_artifact_plan" ||
        payload.kind === "office_artifact_publish");
    const version = readVersion(event);
    if (!isOfficeProgress && !version) continue;

    const format = version?.format || normalizeFormat(payload.format || manifest?.format);
    if (!format) continue;
    const eventRequestId =
      asString(payload.requestId) ||
      asString(manifest?.requestId) ||
      "legacy-office-delivery";

    if (version) {
      const known = versionsByFormat.get(format) || [];
      if (!known.some((item) => item.artifactId === version.artifactId)) {
        known.push(version);
        known.sort((a, b) => b.version - a.version || b.publishedAt.localeCompare(a.publishedAt));
        versionsByFormat.set(format, known);
      }
      if (eventRequestId !== requestId) continue;
      updatedAt = Math.max(updatedAt, event.timestamp);
      stateByFormat.set(format, {
        format,
        phase: "published",
        updatedAt: event.timestamp,
        path: version.path,
        version: version.version,
        repairAttempts: version.repairAttempts,
        versions: known,
      });
      continue;
    }

    if (eventRequestId !== requestId) continue;
    updatedAt = Math.max(updatedAt, event.timestamp);

    const phase = normalizePhase(payload.phase);
    if (!phase) continue;
    const current = stateByFormat.get(format);
    const shouldReplace =
      !current ||
      event.timestamp > current.updatedAt ||
      (event.timestamp === current.updatedAt && phaseRank(phase) >= phaseRank(current.phase));
    if (!shouldReplace) continue;
    stateByFormat.set(format, {
      format,
      phase,
      updatedAt: event.timestamp,
      path: current?.path,
      version: current?.version,
      repairAttempts:
        asNumber(payload.repairAttempts) ||
        asNumber(payload.attempt) ||
        current?.repairAttempts ||
        0,
      diagnosticCode: asString(payload.diagnosticCode) || asString(payload.code),
      versions: versionsByFormat.get(format) || current?.versions || [],
    });
  }

  if (stateByFormat.size === 0) return null;
  const formats = Array.from(stateByFormat.values()).map((state) => ({
    ...state,
    versions: versionsByFormat.get(state.format) || state.versions,
  }));
  const deliveredCount = formats.filter((item) => item.phase === "published").length;
  const failedCount = formats.filter((item) => item.phase === "failed").length;
  const cancelledCount = formats.filter((item) => item.phase === "cancelled").length;
  const totalCount = formats.length;
  const status: OfficeDeliverySummary["status"] =
    deliveredCount === totalCount
      ? "published"
      : deliveredCount > 0 && failedCount + cancelledCount > 0
        ? "partial"
        : failedCount === totalCount
          ? "failed"
          : cancelledCount === totalCount
            ? "cancelled"
            : "working";

  return {
    requestId,
    status,
    formats: formats.sort((a, b) =>
      ["docx", "pptx", "xlsx"].indexOf(a.format) -
      ["docx", "pptx", "xlsx"].indexOf(b.format),
    ),
    deliveredCount,
    failedCount,
    totalCount,
    updatedAt,
  };
}

export function mapOfficeVersionsByPath(
  summary: OfficeDeliverySummary | null,
): Map<string, OfficeArtifactVersion> {
  const result = new Map<string, OfficeArtifactVersion>();
  for (const format of summary?.formats || []) {
    for (const version of format.versions) {
      result.set(version.path.replace(/\\/g, "/"), version);
    }
  }
  return result;
}
