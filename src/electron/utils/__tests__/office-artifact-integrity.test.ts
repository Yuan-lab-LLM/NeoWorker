import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import JSZip from "jszip";
import { afterEach, describe, expect, it } from "vitest";
import { inspectOfficeArtifactIntegrity } from "../office-artifact-integrity";

const tempDirectories: string[] = [];

async function tempFile(name: string, build: (zip: JSZip) => void): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "office-integrity-"));
  tempDirectories.push(directory);
  const filePath = path.join(directory, name);
  const zip = new JSZip();
  zip.file("[Content_Types].xml", "<Types/>");
  build(zip);
  await fs.writeFile(filePath, await zip.generateAsync({ type: "nodebuffer" }));
  return filePath;
}

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map((directory) =>
      fs.rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("inspectOfficeArtifactIntegrity", () => {
  it("rejects a presentation when a requested slide is blank", async () => {
    const filePath = await tempFile("deck.pptx", (zip) => {
      zip.file("ppt/presentation.xml", "<p:presentation/>");
      zip.file("ppt/slides/slide1.xml", "<p:sld><a:t>Title</a:t></p:sld>");
      zip.file("ppt/slides/slide2.xml", "<p:sld><p:cSld/></p:sld>");
    });

    const report = await inspectOfficeArtifactIntegrity(filePath, {
      format: "pptx",
      expectedSlideCount: 2,
    });

    expect(report.passed).toBe(false);
    expect(report.observed.blankSlideNumbers).toEqual([2]);
    expect(report.errors.join(" ")).toContain("Blank slides");
  });

  it("accepts image-only slides as visible content", async () => {
    const filePath = await tempFile("deck.pptx", (zip) => {
      zip.file("ppt/presentation.xml", "<p:presentation/>");
      zip.file("ppt/slides/slide1.xml", "<p:sld><p:pic/></p:sld>");
    });

    const report = await inspectOfficeArtifactIntegrity(filePath, {
      format: "pptx",
      expectedSlideCount: 1,
    });

    expect(report.passed).toBe(true);
  });

  it("rejects title-only content slides while allowing a cover", async () => {
    const filePath = await tempFile("deck.pptx", (zip) => {
      zip.file("ppt/presentation.xml", "<p:presentation/>");
      zip.file("ppt/slides/slide1.xml", "<p:sld><a:t>Cover</a:t></p:sld>");
      zip.file("ppt/slides/slide2.xml", "<p:sld><a:t>Analysis</a:t></p:sld>");
    });

    const report = await inspectOfficeArtifactIntegrity(filePath, {
      format: "pptx",
      expectedSlideCount: 2,
      allowTitleOnlySlideNumbers: [1],
    });

    expect(report.passed).toBe(false);
    expect(report.observed.titleOnlySlideNumbers).toEqual([2]);
    expect(report.errors.join(" ")).toContain("only a title");
  });

  it("rejects a workbook that loses a requested worksheet", async () => {
    const filePath = await tempFile("book.xlsx", (zip) => {
      zip.file("xl/workbook.xml", "<workbook/>");
      zip.file("xl/worksheets/sheet1.xml", "<worksheet><row><c/></row></worksheet>");
    });

    const report = await inspectOfficeArtifactIntegrity(filePath, {
      format: "xlsx",
      expectedSheetCount: 2,
      expectedNonEmptySheetCount: 2,
    });

    expect(report.passed).toBe(false);
    expect(report.observed.sheetCount).toBe(1);
    expect(report.errors.join(" ")).toContain("Expected 2 worksheets");
  });

  it("requires visible Word content", async () => {
    const filePath = await tempFile("report.docx", (zip) => {
      zip.file("word/document.xml", "<w:document><w:body/></w:document>");
    });

    const report = await inspectOfficeArtifactIntegrity(filePath, {
      format: "docx",
      minimumTextCharacters: 1,
    });

    expect(report.passed).toBe(false);
    expect(report.errors.join(" ")).toContain("visible content");
  });

  it("rejects workbook formula errors and replacement characters", async () => {
    const filePath = await tempFile("book.xlsx", (zip) => {
      zip.file("xl/workbook.xml", "<x:workbook/>");
      zip.file(
        "xl/worksheets/sheet1.xml",
        '<x:worksheet><x:sheetData><x:row><x:c><x:v>#REF!</x:v></x:c><x:c><x:v>�</x:v></x:c></x:row></x:sheetData></x:worksheet>',
      );
    });

    const report = await inspectOfficeArtifactIntegrity(filePath, {
      format: "xlsx",
      expectedSheetCount: 1,
      expectedNonEmptySheetCount: 1,
    });

    expect(report.passed).toBe(false);
    expect(report.observed.formulaErrorCount).toBe(1);
    expect(report.errors.join(" ")).toContain("formula error");
    expect(report.errors.join(" ")).toContain("mojibake");
  });
});
