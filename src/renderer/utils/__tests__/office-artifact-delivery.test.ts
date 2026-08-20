import { describe, expect, it } from "vitest";
import type { TaskEvent } from "../../../shared/types";
import {
  deriveOfficeArtifactDelivery,
  mapOfficeVersionsByPath,
} from "../office-artifact-delivery";

function event(
  type: TaskEvent["type"],
  timestamp: number,
  payload: Record<string, unknown>,
): TaskEvent {
  return {
    id: `event-${timestamp}`,
    taskId: "task-1",
    timestamp,
    type,
    payload,
    schemaVersion: 2,
  } as TaskEvent;
}

function published(
  timestamp: number,
  format: "docx" | "pptx" | "xlsx",
  version: number,
  requestId = "request-1",
): TaskEvent {
  const extension = format;
  const path = `report${version > 1 ? `-v${version}` : ""}.${extension}`;
  return event("artifact_created", timestamp, {
    path,
    qualityStatus: "pass",
    officeManifest: {
      artifactId: `${format}-${version}`,
      requestId,
      format,
      version,
      finalPath: path,
      contentHash: `${format}-hash-${version}`,
      repairAttempts: version - 1,
      status: "published",
      createdAt: new Date(timestamp).toISOString(),
      publishedAt: new Date(timestamp).toISOString(),
    },
  });
}

describe("deriveOfficeArtifactDelivery", () => {
  it("reports a partial multi-format delivery without treating the failed format as an artifact", () => {
    const summary = deriveOfficeArtifactDelivery([
      event("progress_update", 1, {
        kind: "office_artifact_plan",
        requestId: "request-1",
        format: "docx",
        phase: "planning_complete",
      }),
      published(2, "docx", 1),
      event("progress_update", 3, {
        kind: "office_artifact_publish",
        requestId: "request-1",
        format: "pptx",
        phase: "failed",
        code: "QUALITY_FAILED",
      }),
    ]);

    expect(summary?.status).toBe("partial");
    expect(summary?.deliveredCount).toBe(1);
    expect(summary?.failedCount).toBe(1);
    expect(summary?.formats.find((item) => item.format === "pptx")).toMatchObject({
      phase: "failed",
      diagnosticCode: "QUALITY_FAILED",
      path: undefined,
    });
  });

  it("keeps published versions newest first and exposes path metadata", () => {
    const summary = deriveOfficeArtifactDelivery([
      published(1, "xlsx", 1),
      published(2, "xlsx", 2),
    ]);
    const state = summary?.formats[0];
    expect(state?.phase).toBe("published");
    expect(state?.version).toBe(2);
    expect(state?.versions.map((item) => item.version)).toEqual([2, 1]);
    expect(mapOfficeVersionsByPath(summary).get("report-v2.xlsx")?.repairAttempts).toBe(1);
  });

  it("does not infer success from a file event without a committed manifest", () => {
    expect(
      deriveOfficeArtifactDelivery([
        event("file_created", 1, { path: "broken.pptx", type: "presentation" }),
      ]),
    ).toBeNull();
  });

  it("maps the Office quality engine's passed status to the user-facing pass state", () => {
    const artifact = published(1, "docx", 1);
    (artifact.payload as Record<string, unknown>).qualityStatus = "passed";

    expect(
      deriveOfficeArtifactDelivery([artifact])?.formats[0].versions[0].qualityStatus,
    ).toBe("pass");
  });

  it("shows only the latest regeneration request while keeping its older versions", () => {
    const summary = deriveOfficeArtifactDelivery([
      published(1, "pptx", 1, "request-1"),
      event("progress_update", 2, {
        kind: "office_artifact_publish",
        requestId: "request-2",
        format: "pptx",
        phase: "failed",
        diagnosticCode: "QUALITY_FAILED",
      }),
    ]);

    expect(summary).toMatchObject({
      requestId: "request-2",
      status: "failed",
      deliveredCount: 0,
      failedCount: 1,
    });
    expect(summary?.formats[0].versions.map((item) => item.version)).toEqual([1]);
  });
});
