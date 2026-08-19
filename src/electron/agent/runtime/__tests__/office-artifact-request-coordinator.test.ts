import { describe, expect, it, vi } from "vitest";
import { createCanonicalContentSnapshot } from "../../../utils/office-content-model";
import {
  buildOfficeArtifactRequestIdentity,
  OfficeArtifactRequestCoordinator,
} from "../office-artifact-request-coordinator";

function makeSnapshot(value = 100) {
  return createCanonicalContentSnapshot({
    snapshotId: "snapshot-1",
    frozenAt: "2026-08-14T00:00:00.000Z",
    title: "Analysis",
    executiveSummary: ["Frozen summary"],
    sources: [{ id: "source-1", title: "Filing", accessedAt: "2026-08-14" }],
    facts: [
      {
        id: "fact-1",
        statement: "Revenue",
        value,
        unit: "USDm",
        asOf: "2026-06-30",
        sourceIds: ["source-1"],
        confidence: "high",
        critical: true,
      },
    ],
    sections: [
      {
        id: "section-1",
        title: "Overview",
        summary: "Summary",
        factIds: ["fact-1"],
        datasetIds: [],
        required: true,
      },
    ],
    datasets: [],
    caveats: [],
  });
}

describe("OfficeArtifactRequestCoordinator", () => {
  it("keeps standard and ppt-master variants as separate deliveries", () => {
    const standard = buildOfficeArtifactRequestIdentity("pptx", {
      filename: "广州-北京航班速览.pptx",
    });
    const advanced = buildOfficeArtifactRequestIdentity("pptx", {
      filename: "广州-北京航班速览-v2.pptx",
      generationMode: "ppt-master",
      presentationWorkflow: "ppt-master",
      visualMode: "editorial",
      officeProfile: "morph-ppt",
    });

    expect(advanced).not.toBe(standard);
  });

  it("still reuses automatic revisions inside the same ppt-master variant", () => {
    const first = buildOfficeArtifactRequestIdentity("pptx", {
      filename: "广州-北京航班速览.pptx",
      generationMode: "ppt-master",
      presentationWorkflow: "ppt-master",
      visualMode: "editorial",
      officeProfile: "morph-ppt",
    });
    const revision = buildOfficeArtifactRequestIdentity("pptx", {
      filename: "广州-北京航班速览-v2.pptx",
      generationMode: "PPT-MASTER",
      presentationWorkflow: "ppt-master",
      visualMode: "editorial",
      officeProfile: "morph-ppt",
    });

    expect(revision).toBe(first);
  });

  it("does not let an explicit delivery key collapse standard and advanced decks", () => {
    const standard = buildOfficeArtifactRequestIdentity("pptx", {
      artifactRequestKey: "flight-deck",
    });
    const advanced = buildOfficeArtifactRequestIdentity("pptx", {
      artifactRequestKey: "flight-deck",
      generationMode: "ppt-master",
      presentationWorkflow: "ppt-master",
    });

    expect(advanced).not.toBe(standard);
  });

  it("runs a new writer when switching from standard to ppt-master", async () => {
    const coordinator = new OfficeArtifactRequestCoordinator();
    const standardWriter = vi.fn(async () => ({
      success: true,
      path: "广州-北京航班速览.pptx",
    }));
    const advancedWriter = vi.fn(async () => ({
      success: true,
      path: "广州-北京航班速览-v2.pptx",
    }));
    const repeatedAdvancedWriter = vi.fn(async () => ({
      success: true,
      path: "广州-北京航班速览-v3.pptx",
    }));
    const standardIdentity = buildOfficeArtifactRequestIdentity("pptx", {
      filename: "广州-北京航班速览.pptx",
    });
    const advancedIdentity = buildOfficeArtifactRequestIdentity("pptx", {
      filename: "广州-北京航班速览-v2.pptx",
      generationMode: "ppt-master",
      presentationWorkflow: "ppt-master",
      visualMode: "editorial",
      officeProfile: "morph-ppt",
    });
    const repeatedAdvancedIdentity = buildOfficeArtifactRequestIdentity("pptx", {
      filename: "广州-北京航班速览-v3.pptx",
      generationMode: "ppt-master",
      presentationWorkflow: "ppt-master",
      visualMode: "editorial",
      officeProfile: "morph-ppt",
    });

    await coordinator.run("pptx", standardWriter, undefined, standardIdentity);
    const advanced = await coordinator.run(
      "pptx",
      advancedWriter,
      undefined,
      advancedIdentity,
    );
    const repeated = await coordinator.run(
      "pptx",
      repeatedAdvancedWriter,
      undefined,
      repeatedAdvancedIdentity,
    );

    expect(standardWriter).toHaveBeenCalledTimes(1);
    expect(advancedWriter).toHaveBeenCalledTimes(1);
    expect(repeatedAdvancedWriter).not.toHaveBeenCalled();
    expect(advanced.path).toBe("广州-北京航班速览-v2.pptx");
    expect(repeated).toMatchObject({
      path: "广州-北京航班速览-v2.pptx",
      reusedExistingArtifact: true,
    });
  });

  it("treats an automatic v2 filename as the same spreadsheet delivery", async () => {
    const coordinator = new OfficeArtifactRequestCoordinator();
    const firstWriter = vi.fn(async () => ({
      success: true,
      path: "北京-广州航班明细-2026-08-16.xlsx",
    }));
    const lossyV2Writer = vi.fn(async () => ({
      success: true,
      path: "北京-广州航班明细-2026-08-16v2.xlsx",
    }));
    const firstIdentity = buildOfficeArtifactRequestIdentity("xlsx", {
      filename: "北京-广州航班明细-2026-08-16.xlsx",
      sheets: [{ rows: new Array(24).fill(["full row"]) }],
    });
    const v2Identity = buildOfficeArtifactRequestIdentity("xlsx", {
      filename: "北京-广州航班明细-2026-08-16v2.xlsx",
      sheets: [{ rows: new Array(16).fill(["compressed row"]) }],
    });

    expect(v2Identity).toBe(firstIdentity);
    const first = await coordinator.run(
      "xlsx",
      firstWriter,
      undefined,
      firstIdentity,
    );
    const repeated = await coordinator.run(
      "xlsx",
      lossyV2Writer,
      undefined,
      v2Identity,
    );

    expect(firstWriter).toHaveBeenCalledTimes(1);
    expect(lossyV2Writer).not.toHaveBeenCalled();
    expect(first.path).toBe("北京-广州航班明细-2026-08-16.xlsx");
    expect(repeated).toMatchObject({
      path: "北京-广州航班明细-2026-08-16.xlsx",
      reusedExistingArtifact: true,
    });
  });

  it("keeps semantically different same-format filenames as separate deliveries", () => {
    expect(
      buildOfficeArtifactRequestIdentity("xlsx", {
        filename: "航班总表.xlsx",
      }),
    ).not.toBe(
      buildOfficeArtifactRequestIdentity("xlsx", {
        filename: "票价对比表.xlsx",
      }),
    );
  });

  it("allows an explicitly requested later revision after the request boundary resets", async () => {
    const coordinator = new OfficeArtifactRequestCoordinator();
    const identity = buildOfficeArtifactRequestIdentity("xlsx", {
      filename: "航班明细v2.xlsx",
    });
    await coordinator.run(
      "xlsx",
      async () => ({ success: true, path: "航班明细.xlsx" }),
      undefined,
      identity,
    );

    coordinator.clear();

    await expect(
      coordinator.run(
        "xlsx",
        async () => ({ success: true, path: "航班明细v2.xlsx" }),
        undefined,
        identity,
      ),
    ).resolves.toMatchObject({
      path: "航班明细v2.xlsx",
    });
  });

  it("shares one writer across canonical and alias calls in the same task", async () => {
    const coordinator = new OfficeArtifactRequestCoordinator();
    const writer = vi.fn(async () => ({
      success: true,
      path: "analysis.xlsx",
    }));

    const [first, duplicate] = await Promise.all([
      coordinator.run("xlsx", writer),
      coordinator.run("xlsx", writer),
    ]);

    expect(writer).toHaveBeenCalledTimes(1);
    expect(first.path).toBe("analysis.xlsx");
    expect(duplicate).toMatchObject({
      path: "analysis.xlsx",
      reusedExistingArtifact: true,
    });
  });

  it("does not reuse a same-format artifact for a different request identity", async () => {
    const coordinator = new OfficeArtifactRequestCoordinator();
    const testWriter = vi.fn(async () => ({
      success: true,
      path: "qc-min-test.docx",
    }));
    const reportWriter = vi.fn(async () => ({
      success: true,
      path: "Beijing-Weather-Report-2026-08-15.docx",
    }));

    const testResult = await coordinator.run(
      "docx",
      testWriter,
      undefined,
      "qc-min-test-request",
    );
    const reportResult = await coordinator.run(
      "docx",
      reportWriter,
      undefined,
      "beijing-weather-report-request",
    );

    expect(testWriter).toHaveBeenCalledTimes(1);
    expect(reportWriter).toHaveBeenCalledTimes(1);
    expect(testResult.path).toBe("qc-min-test.docx");
    expect(reportResult).toMatchObject({
      path: "Beijing-Weather-Report-2026-08-15.docx",
    });
    expect(reportResult.reusedExistingArtifact).toBeUndefined();
  });

  it("reuses an artifact only when the request identity is identical", async () => {
    const coordinator = new OfficeArtifactRequestCoordinator();
    const writer = vi.fn(async () => ({
      success: true,
      path: "report.docx",
    }));

    const first = await coordinator.run("docx", writer, undefined, "same-request");
    const repeated = await coordinator.run("docx", writer, undefined, "same-request");

    expect(writer).toHaveBeenCalledTimes(1);
    expect(first.path).toBe("report.docx");
    expect(repeated).toMatchObject({
      path: "report.docx",
      reusedExistingArtifact: true,
    });
  });

  it("allows a retry after a failed delivery gate", async () => {
    const coordinator = new OfficeArtifactRequestCoordinator();
    const failed = vi.fn(async () => ({ success: false, error: "invalid" }));
    const recovered = vi.fn(async () => ({
      success: true,
      path: "report.docx",
    }));

    await coordinator.run("docx", failed);
    const result = await coordinator.run("docx", recovered);

    expect(failed).toHaveBeenCalledTimes(1);
    expect(recovered).toHaveBeenCalledTimes(1);
    expect(result.path).toBe("report.docx");
  });

  it("allows different Office formats to share one frozen snapshot", async () => {
    const coordinator = new OfficeArtifactRequestCoordinator();
    const snapshot = makeSnapshot();

    await expect(
      coordinator.run("docx", async () => ({ success: true, path: "report.docx" }), snapshot),
    ).resolves.toMatchObject({ path: "report.docx" });
    await expect(
      coordinator.run("pptx", async () => ({ success: true, path: "deck.pptx" }), snapshot),
    ).resolves.toMatchObject({ path: "deck.pptx" });
  });

  it("rejects a second format when a snapshot id is reused with changed facts", async () => {
    const coordinator = new OfficeArtifactRequestCoordinator();
    await coordinator.run(
      "docx",
      async () => ({ success: true, path: "report.docx" }),
      makeSnapshot(100),
    );

    await expect(
      coordinator.run(
        "xlsx",
        async () => ({ success: true, path: "ledger.xlsx" }),
        makeSnapshot(101),
      ),
    ).rejects.toThrow(/identical frozen contentSnapshot/);
  });

  it("allows two different same-format artifacts to use different snapshots", async () => {
    const coordinator = new OfficeArtifactRequestCoordinator();

    await expect(
      coordinator.run(
        "docx",
        async () => ({ success: true, path: "first.docx" }),
        makeSnapshot(100),
        "first-request",
      ),
    ).resolves.toMatchObject({ path: "first.docx" });
    await expect(
      coordinator.run(
        "docx",
        async () => ({ success: true, path: "second.docx" }),
        {
          ...makeSnapshot(101),
          snapshotId: "snapshot-2",
        },
        "second-request",
      ),
    ).resolves.toMatchObject({ path: "second.docx" });
  });

  it("requires the shared snapshot on subsequent formats once consistency mode starts", async () => {
    const coordinator = new OfficeArtifactRequestCoordinator();
    await coordinator.run(
      "docx",
      async () => ({ success: true, path: "report.docx" }),
      makeSnapshot(),
    );

    await expect(
      coordinator.run("pptx", async () => ({ success: true, path: "deck.pptx" })),
    ).rejects.toThrow(/contentSnapshot/);
  });

  it("does not carry the previous turn's format or snapshot mode across an explicit request boundary", async () => {
    const coordinator = new OfficeArtifactRequestCoordinator();
    await coordinator.run("pptx", async () => ({
      success: true,
      path: "previous-turn-deck.pptx",
    }));

    coordinator.clear();

    const result = await coordinator.run("docx", async () => ({
        success: true,
        path: "follow-up-report.docx",
      }));

    expect(result).toMatchObject({ path: "follow-up-report.docx" });
    expect(result.reusedExistingArtifact).toBeUndefined();
  });
});
