import { describe, expect, it } from "vitest";
import {
  normalizeDocumentArtifactInput,
  normalizePresentationArtifactInput,
  normalizeSpreadsheetArtifactInput,
} from "../office-artifact-input-normalizer";

describe("Office artifact input normalizers", () => {
  it("preserves all six parser stages when metrics is absent or empty", () => {
    const timeline = ["文档转图片", "版面分析", "表格识别", "文字识别", "合并段落", "后处理"]
      .map((value, i) => ({ label: String(i + 1), value, detail: `说明${i + 1}` }));
    for (const metrics of [undefined, []]) {
      const { slides } = normalizePresentationArtifactInput({ slides: [{
        title: "EPAI-Parser 文档解析处理流程", slideType: "process", metrics, timeline,
      }] });
      expect(slides[0].data.items).toEqual(timeline);
      expect(slides[0].content).toContain("6 · 后处理 · 说明6");
    }
  });
  it("consumes every supported rich presentation field without truncating rows", () => {
    const rows = Array.from({ length: 9 }, (_, index) => [index + 1, `Row ${index + 1}`]);
    const normalized = normalizePresentationArtifactInput({
      filename: "analysis.pptx",
      brand: { primaryColor: "#123456", accentColor: "#ABCDEF" },
      assets: [{ id: "hero", path: "assets/hero.png" }],
      slides: [
        {
          title: "Complete evidence",
          bullets: ["Bullet evidence"],
          quote: "Quoted evidence",
          attribution: "Source",
          image: { id: "hero" },
          data: {
            categories: ["A", "B"],
            series: [{ name: "Growth", values: [2, 5] }],
            headers: ["Rank", "Name"],
            rows,
            items: [{ label: "ARR", value: "100", detail: "audited" }],
          },
        },
      ],
    });

    expect(normalized).toMatchObject({
      themeColor: "#123456",
      accentColor: "#ABCDEF",
      slides: [
        expect.objectContaining({
          imagePath: "assets/hero.png",
          data: expect.objectContaining({
            categories: ["A", "B"],
            rows,
          }),
          content: expect.arrayContaining([
            "Bullet evidence",
            "Quoted evidence — Source",
            "Categories: A · B",
            "Growth: A 2 · B 5",
            "Rank · Name",
            "9 · Row 9",
            "ARR · 100 · audited",
          ]),
        }),
      ],
    });
  });

  it("rejects unknown presentation data instead of silently discarding it", () => {
    expect(() =>
      normalizePresentationArtifactInput({
        slides: [{ title: "Unsupported", data: { mystery: [1, 2, 3] } }],
      }),
    ).toThrow(/slides\[\]\.data\.mystery/);
  });

  it("preserves canonical content references on structured slides", () => {
    const snapshot = { schemaVersion: "1.0", snapshotId: "snapshot-1" };
    const normalized = normalizePresentationArtifactInput({
      contentSnapshot: snapshot,
      slides: [
        {
          title: "Metrics",
          slideType: "metric",
          metrics: [{ label: "ARR", value: 100, detail: "USDm" }],
          sectionIds: ["overview"],
          factIds: ["arr"],
          datasetIds: ["financials"],
          factValues: { arr: { value: 100, unit: "USDm", asOf: "2026-08-14" } },
        },
      ],
    });

    expect(normalized.contentSnapshot).toBe(snapshot);
    expect(normalized.slides[0]).toMatchObject({
      sectionIds: ["overview"],
      factIds: ["arr"],
      datasetIds: ["financials"],
      factValues: { arr: { value: 100, unit: "USDm", asOf: "2026-08-14" } },
      data: { items: [{ label: "ARR", value: 100, detail: "USDm" }] },
    });
  });

  it("preserves host-only PPT Master routing fields", () => {
    const normalized = normalizePresentationArtifactInput({
      filename: "/tmp/artifacts/ppt-master/output/presentation.pptx",
      sourcePath: "/tmp/source-template.pptx",
      generationMode: "ppt-master",
      presentationWorkflow: "ppt-master",
      workflowArtifactRoot: "/tmp/artifacts/ppt-master",
      slides: [{ title: "Advanced deck", slideType: "cover" }],
    });

    expect(normalized).toMatchObject({
      generationMode: "ppt-master",
      presentationWorkflow: "ppt-master",
      workflowArtifactRoot: "/tmp/artifacts/ppt-master",
      sourcePath: "/tmp/source-template.pptx",
    });
  });

  it("unwraps a JSON-encoded slide array nested inside slides", () => {
    const normalized = normalizePresentationArtifactInput({
      filename: "analysis.pptx",
      slides: [
        JSON.stringify([
          { title: "Overview", bullets: ["First point"] },
          { title: "Comparison", content: ["A", "B"] },
        ]),
      ],
    });

    expect(normalized.slides).toHaveLength(2);
    expect(normalized.slides[0]).toMatchObject({
      title: "Overview",
      content: ["First point"],
    });
    expect(normalized.slides[1]).toMatchObject({
      title: "Comparison",
      content: ["A", "B"],
    });
  });

  it("accepts slides encoded as a JSON string and reports malformed strings clearly", () => {
    const normalized = normalizePresentationArtifactInput({
      slides: JSON.stringify([{ title: "Decoded" }]),
    });
    expect(normalized.slides[0].title).toBe("Decoded");

    expect(() =>
      normalizePresentationArtifactInput({ slides: ["not-json"] }),
    ).toThrow(/Pass slide objects directly instead of JSON-encoded strings/);
  });

  it("normalizes spreadsheet aliases into the canonical data matrix", () => {
    expect(
      normalizeSpreadsheetArtifactInput({
        filename: "ledger.xlsx",
        sheets: [
          { name: "Ledger", headers: ["Date", "Amount"], rows: [["2026-08-14", 10]] },
        ],
      }),
    ).toEqual({
      filename: "ledger.xlsx",
      templateId: undefined,
      useCase: undefined,
      sheets: [
        {
          name: "Ledger",
          data: [["Date", "Amount"], ["2026-08-14", 10]],
          columnWidths: undefined,
          hasHeader: true,
          sectionIds: [],
          factIds: [],
          datasetIds: [],
          factValues: undefined,
        },
      ],
      contentSnapshot: undefined,
    });
  });

  it("preserves template routing for every canonical Office format", () => {
    expect(
      normalizePresentationArtifactInput({
        filename: "deck.pptx",
        officeProfile: "pptx",
        templateId: "neoworker-research-report",
        useCase: "research-report",
        slides: [],
      }),
    ).toMatchObject({
      officeProfile: "pptx",
      templateId: "neoworker-research-report",
      useCase: "research-report",
    });
    expect(
      normalizeDocumentArtifactInput({
        filename: "report.docx",
        format: "docx",
        officeProfile: "academic-paper",
        templateId: "neoworker-docx-research-report",
        useCase: "financing-analysis",
        content: [],
      }),
    ).toMatchObject({
      officeProfile: "academic-paper",
      templateId: "neoworker-docx-research-report",
      useCase: "financing-analysis",
    });
    expect(
      normalizeSpreadsheetArtifactInput({
        filename: "model.xlsx",
        officeProfile: "financial-model",
        templateId: "neoworker-xlsx-baseline",
        useCase: "operating-review",
        sheets: [],
      }),
    ).toMatchObject({
      officeProfile: "financial-model",
      templateId: "neoworker-xlsx-baseline",
      useCase: "operating-review",
    });
  });

  it("reports the exact JSON path for unsupported document fields", () => {
    expect(() =>
      normalizeDocumentArtifactInput({
        filename: "report.docx",
        format: "docx",
        content: [{ type: "paragraph", text: "Hello", mystery: true }],
      }),
    ).toThrow(/content\[0\]\.mystery/);
  });
});
