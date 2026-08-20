import { describe, expect, it } from "vitest";
import {
  buildOfficeContentCoverageReport,
  createCanonicalContentSnapshot,
} from "../../../utils/office-content-model";
import {
  planOfficeDocument,
  planOfficePresentation,
  planOfficeSpreadsheet,
} from "../office-format-planners";

describe("Office format planners", () => {
  it("infers data-driven PPT layouts and adds frozen-source notes", () => {
    const snapshot = createCanonicalContentSnapshot({
      snapshotId: "snapshot-1",
      frozenAt: "2026-08-14T00:00:00.000Z",
      title: "Analysis",
      executiveSummary: [],
      sources: [
        {
          id: "source-1",
          title: "Annual report",
          url: "https://example.com/report",
          accessedAt: "2026-08-14",
        },
      ],
      facts: [
        {
          id: "fact-1",
          statement: "Revenue",
          value: 100,
          sourceIds: ["source-1"],
          confidence: "high",
          critical: true,
        },
      ],
      sections: [],
      datasets: [],
      caveats: [],
    });
    const result = planOfficePresentation(
      [
        { title: "Analysis", slideType: "cover", subtitle: "Board review" },
        {
          title: "Revenue trend",
          content: ["Revenue accelerated"],
          data: { categories: ["H1", "H2"], series: [{ name: "Revenue", values: [80, 100] }] },
          factIds: ["fact-1"],
        },
      ],
      snapshot,
    );

    expect(result.value[1]).toMatchObject({ slideType: "chart" });
    expect(result.value[1].notes).toContain("Annual report (https://example.com/report)");
  });

  it("removes contentless PPT pages instead of failing the whole deck", () => {
    const result = planOfficePresentation([
      { title: "Cover", slideType: "cover" },
      { title: "Empty analysis", slideType: "content" },
    ]);

    expect(result.value).toHaveLength(1);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "PPT_EMPTY_SLIDE_REMOVED" }),
      ]),
    );
  });

  it("automatically adds compact appendix slides for unreferenced frozen content", () => {
    const snapshot = createCanonicalContentSnapshot({
      snapshotId: "snapshot-coverage",
      frozenAt: "2026-08-14T00:00:00.000Z",
      title: "Analysis",
      executiveSummary: [],
      sources: [],
      facts: [
        {
          id: "fact-critical",
          statement: "Close price",
          value: 78.8,
          unit: "CNY",
          sourceIds: [],
          confidence: "high",
          critical: true,
        },
      ],
      sections: [
        {
          id: "section-summary",
          title: "Summary",
          summary: "Trading-day conclusion",
          factIds: ["fact-critical"],
          datasetIds: [],
          required: true,
        },
      ],
      datasets: [
        {
          id: "dataset-price",
          title: "Price series",
          headers: ["Time", "Price"],
          rows: [["15:00", 78.8]],
          sourceIds: [],
          required: true,
        },
      ],
      caveats: [],
    });

    const result = planOfficePresentation(
      [{ title: "Analysis", slideType: "cover", subtitle: "Daily review" }],
      snapshot,
    );

    expect(result.value.flatMap((slide) => slide.factIds || [])).toContain("fact-critical");
    expect(result.value.flatMap((slide) => slide.sectionIds || [])).toContain("section-summary");
    expect(result.value.flatMap((slide) => slide.datasetIds || [])).toContain("dataset-price");
    const coverage = buildOfficeContentCoverageReport(
      snapshot,
      "pptx",
      result.value.map((slide, index) => ({
        format: "pptx",
        elementId: `slide-${index + 1}`,
        factIds: slide.factIds,
        sectionIds: slide.sectionIds,
        datasetIds: slide.datasetIds,
      })),
    );
    expect(coverage).toMatchObject({
      passed: true,
      criticalFactCoverage: 1,
      generalCoverage: 1,
      issues: [],
    });
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "PPT_CONTENT_COVERAGE_COMPLETED" }),
      ]),
    );
  });

  it("inserts a DOCX title and splits unreadably long paragraphs", () => {
    const longText = "这是一个需要拆分的完整句子。".repeat(50);
    const result = planOfficeDocument(
      [{ type: "paragraph", text: longText }],
      "研究报告",
    );
    expect(result.value[0]).toMatchObject({ type: "heading", level: 1, text: "研究报告" });
    expect(result.value.length).toBeGreaterThan(2);
    expect(result.diagnostics.map((item) => item.code)).toEqual(
      expect.arrayContaining(["DOCX_TITLE_INSERTED", "DOCX_LONG_PARAGRAPH_SPLIT"]),
    );
  });

  it("repairs duplicate worksheet names and rejects empty sheets", () => {
    const result = planOfficeSpreadsheet([
      { name: "Data", data: [["A"], [1]] },
      { name: "Data", data: [["B"], [2]] },
    ]);
    expect(result.value.map((sheet) => sheet.name)).toEqual(["Data", "Data-2"]);
    expect(() => planOfficeSpreadsheet([{ name: "Empty", data: [] }])).toThrow(/has no data/);
  });
});
