import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import {
  inferOfficeTemplateUseCase,
  inspectOfficeTemplateCompatibility,
  listBuiltInOfficeTemplates,
  selectOfficeTemplate,
} from "../office-template-registry";

async function createTemplate(
  name: string,
  entries: Record<string, string | Uint8Array>,
): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "office-template-"));
  const outputPath = path.join(directory, name);
  const zip = new JSZip();
  for (const [entry, value] of Object.entries(entries)) zip.file(entry, value);
  await fs.writeFile(outputPath, await zip.generateAsync({ type: "nodebuffer" }));
  return outputPath;
}

describe("office template registry", () => {
  it("selects stable scene templates instead of a random color theme", () => {
    expect(inferOfficeTemplateUseCase("月之暗面 Pre-IPO 融资估值分析")).toBe("financing-analysis");
    const selection = selectOfficeTemplate({
      format: "pptx",
      contentHint: "月之暗面 Pre-IPO 融资估值分析",
    });
    expect(selection.template.id).toBe("neoworker-financing-analysis");
    expect(selection.template.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(listBuiltInOfficeTemplates("pptx").length).toBeGreaterThanOrEqual(6);
  });

  it("selects the deep-blue professional report system for Word reports", () => {
    const selection = selectOfficeTemplate({
      format: "docx",
      contentHint: "2026年半年度经营分析报告",
    });

    expect(selection.template.id).toBe("neoworker-docx-business-report");
    expect(selection.template.version).toBe("2.0.0");
    expect(selection.template.tokens.primaryColor).toBe("1F4E78");
    expect(selection.template.useCases).toContain("operating-review");
  });

  it("inspects safe PPTX theme, master, placeholders and slide size", async () => {
    const filePath = await createTemplate("safe.pptx", {
      "[Content_Types].xml": "<Types/>",
      "ppt/presentation.xml": '<p:presentation xmlns:p="p"><p:sldSz cx="12192000" cy="6858000"/></p:presentation>',
      "ppt/theme/theme1.xml": '<a:theme xmlns:a="a"><a:latin typeface="Aptos"/><a:srgbClr val="176B87"/></a:theme>',
      "ppt/slideMasters/slideMaster1.xml": '<p:sldMaster xmlns:p="p"><p:ph type="title"/></p:sldMaster>',
      "ppt/slideLayouts/slideLayout1.xml": '<p:sldLayout xmlns:p="p"><p:ph type="body"/></p:sldLayout>',
    });
    const report = await inspectOfficeTemplateCompatibility(filePath);
    expect(report.supported).toBe(true);
    expect(report.inspection.slideSize).toEqual({ width: 12192000, height: 6858000 });
    expect(report.inspection.themeFonts).toContain("Aptos");
    expect(report.inspection.brandColors).toContain("176B87");
    expect(report.inspection.placeholderCount).toBe(2);
  });

  it("rejects macros and converts embedded objects to the safe baseline", async () => {
    const filePath = await createTemplate("unsafe.pptx", {
      "[Content_Types].xml": "<Types/>",
      "ppt/presentation.xml": "<p:presentation/>",
      "ppt/vbaProject.bin": new Uint8Array([1, 2, 3]),
      "ppt/embeddings/oleObject1.bin": new Uint8Array([4, 5, 6]),
    });
    const report = await inspectOfficeTemplateCompatibility(filePath);
    expect(report.supported).toBe(false);
    expect(report.inspection.hasMacros).toBe(true);
    expect(report.inspection.hasEmbeddings).toBe(true);
    expect(report.fallbackTemplateId).toBe("neoworker-pptx-baseline");
  });
});
