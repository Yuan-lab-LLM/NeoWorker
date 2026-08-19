import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildOfficeContentCoverageReport,
  createCanonicalContentSnapshot,
  inspectOfficeContentConsistency,
  persistCanonicalContentSnapshot,
} from "../office-content-model";

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map((directory) =>
      fs.rm(directory, { recursive: true, force: true }),
    ),
  );
});

function fixture() {
  return createCanonicalContentSnapshot({
    snapshotId: "moonshot-financing-v1",
    frozenAt: "2026-08-14T08:00:00.000Z",
    title: "月之暗面融资分析",
    executiveSummary: ["累计融资约 100 亿美元。"],
    sources: [{ id: "source-1", title: "招股书", url: "https://example.com" }],
    facts: [
      {
        id: "fact-total",
        statement: "累计融资规模",
        value: 100,
        unit: "亿美元",
        asOf: "2026-07-31",
        sourceIds: ["source-1"],
        confidence: "high",
        critical: true,
      },
      {
        id: "fact-rounds",
        statement: "累计完成十轮融资",
        value: 10,
        unit: "轮",
        sourceIds: ["source-1"],
        confidence: "medium",
      },
    ],
    sections: [
      {
        id: "section-summary",
        title: "核心摘要",
        factIds: ["fact-total"],
        datasetIds: [],
        required: true,
      },
    ],
    datasets: [
      {
        id: "dataset-rounds",
        title: "融资轮次",
        headers: ["轮次", "金额"],
        rows: [["A", 2]],
        sourceIds: ["source-1"],
        unit: "亿美元",
        required: true,
      },
    ],
    caveats: ["部分金额来自媒体口径。"],
  });
}

describe("office content model", () => {
  it("requires complete critical facts, sections and datasets", () => {
    const report = buildOfficeContentCoverageReport(fixture(), "pptx", [
      {
        format: "pptx",
        elementId: "slide-1",
        sectionIds: ["section-summary"],
        factIds: ["fact-total", "fact-rounds"],
        datasetIds: ["dataset-rounds"],
      },
    ]);

    expect(report.passed).toBe(true);
    expect(report.criticalFactCoverage).toBe(1);
    expect(report.generalCoverage).toBe(1);
  });

  it("fails when a critical fact or required dataset is not consumed", () => {
    const report = buildOfficeContentCoverageReport(fixture(), "docx", [
      {
        format: "docx",
        elementId: "section-1",
        sectionIds: ["section-summary"],
        factIds: ["fact-rounds"],
      },
    ]);

    expect(report.passed).toBe(false);
    expect(report.missingCriticalFactIds).toEqual(["fact-total"]);
    expect(report.missingRequiredDatasetIds).toEqual(["dataset-rounds"]);
  });

  it("detects changed values, units and as-of dates across formats", () => {
    const report = inspectOfficeContentConsistency(fixture(), [
      {
        format: "pptx",
        elementId: "slide-2",
        factId: "fact-total",
        value: 90,
        unit: "亿元",
        asOf: "2026-06-30",
      },
    ]);

    expect(report.passed).toBe(false);
    expect(report.issues).toHaveLength(3);
  });

  it("persists immutable snapshots and rejects an id reused with different facts", async () => {
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "office-snapshot-"));
    tempDirectories.push(workspace);
    const snapshot = fixture();
    const savedPath = await persistCanonicalContentSnapshot(workspace, snapshot);
    expect(JSON.parse(await fs.readFile(savedPath, "utf8"))).toMatchObject({
      snapshotId: snapshot.snapshotId,
    });
    await expect(persistCanonicalContentSnapshot(workspace, snapshot)).resolves.toBe(savedPath);
    await expect(
      persistCanonicalContentSnapshot(workspace, {
        ...snapshot,
        facts: [{ ...snapshot.facts[0], value: 101 }, snapshot.facts[1]],
      }),
    ).rejects.toThrow("different frozen facts");
  });
});
