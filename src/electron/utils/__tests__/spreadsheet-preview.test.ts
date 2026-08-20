import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";

import {
  buildDelimitedSpreadsheetPreview,
  buildSpreadsheetPreviewFromFile,
  spreadsheetPreviewToDelimitedText,
  spreadsheetPreviewToTsv,
  writeDelimitedSpreadsheetPreviewToFile,
  writeSpreadsheetPreviewToFile,
} from "../spreadsheet-preview";

describe("spreadsheet preview extraction", () => {
  it("previews valid OfficeCLI workbooks with explicitly prefixed OOXML elements", async () => {
    const tmpDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "neoworker-xlsx-prefixed-ooxml-"),
    );
    const outPath = path.join(tmpDir, "officecli-prefixed.xlsx");
    const workbook = new ExcelJS.Workbook();
    const summary = workbook.addWorksheet("分析摘要");
    summary.getCell("A1").value = "项目";
    summary.getCell("B1").value = "数值";
    summary.getCell("A2").value = "收盘";
    summary.getCell("B2").value = 78.8;
    workbook.addWorksheet("近一周日线数据").getCell("A1").value = "日期";
    await workbook.xlsx.writeFile(outPath);

    const zip = await JSZip.loadAsync(await fs.readFile(outPath));
    const prefixElements = (xml: string, prefix: string) =>
      xml.replace(
        /<(\/?)([A-Za-z_][\w.-]*)(?=[\s/>])/g,
        (_match, slash: string, tag: string) => `<${slash}${prefix}:${tag}`,
      );
    for (const entryName of Object.keys(zip.files)) {
      const entry = zip.file(entryName);
      if (!entry || !/\.xml$/i.test(entryName)) continue;
      let xml = await entry.async("string");
      if (
        entryName === "xl/workbook.xml" ||
        entryName === "xl/styles.xml" ||
        entryName.startsWith("xl/worksheets/") ||
        entryName === "xl/sharedStrings.xml"
      ) {
        xml = prefixElements(
          xml.replace(
            'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"',
            'xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"',
          ),
          "x",
        );
        zip.file(entryName, xml);
      } else if (entryName === "docProps/app.xml") {
        xml = prefixElements(
          xml.replace(
            'xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"',
            'xmlns:ap="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"',
          ),
          "ap",
        );
        zip.file(entryName, xml);
      }
    }
    await fs.writeFile(
      outPath,
      await zip.generateAsync({ type: "nodebuffer" }),
    );

    const preview = await buildSpreadsheetPreviewFromFile(outPath);

    expect(preview.sheetCount).toBe(2);
    expect(preview.sheets.map((sheet) => sheet.name)).toEqual([
      "分析摘要",
      "近一周日线数据",
    ]);
    expect(preview.sheets[0].rows[1][1].value).toBe("78.8");
  });

  it("extracts sheets, formulas, empty cells, styles, and bounds", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "neoworker-xlsx-preview-"));
    const outPath = path.join(tmpDir, "preview.xlsx");
    const workbook = new ExcelJS.Workbook();

    const summary = workbook.addWorksheet("Summary");
    summary.columns = [{ width: 8 }, { width: 24 }, { width: 12 }];
    summary.getCell("A1").value = "Rank";
    summary.getCell("A1").font = { bold: true, color: { argb: "FFFFFFFF" } };
    summary.getCell("A1").fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1F4E78" },
    };
    summary.getCell("B1").value = "Topic";
    summary.getCell("C1").value = { formula: "SUM(A2:A3)", result: 3 };
    summary.getCell("A2").value = 1;
    summary.getCell("C2").value = "keeps B2 empty";
    summary.getCell("A3").value = 2;
    summary.getCell("B3").value = "Notifications";

    const detail = workbook.addWorksheet("Detail");
    detail.getCell("A1").value = "Issue";

    await workbook.xlsx.writeFile(outPath);

    const preview = await buildSpreadsheetPreviewFromFile(outPath);

    expect(preview.sheetCount).toBe(2);
    expect(preview.activeSheetName).toBe("Summary");
    expect(preview.sheets[0].name).toBe("Summary");
    expect(preview.sheets[0].rowCount).toBe(3);
    expect(preview.sheets[0].columnCount).toBe(3);
    expect(preview.sheets[0].columnWidths).toEqual([8, 24, 12]);
    expect(preview.sheets[0].rows[0][0]).toMatchObject({
      address: "A1",
      value: "Rank",
      bold: true,
      backgroundColor: "#1F4E78",
      fontColor: "#FFFFFF",
    });
    expect(preview.sheets[0].rows[0][2]).toMatchObject({
      address: "C1",
      value: "3",
      formula: "SUM(A2:A3)",
    });
    expect(preview.sheets[0].rows[1][1]).toMatchObject({
      address: "B2",
      value: "",
    });
    expect(preview.sheets[1].name).toBe("Detail");
    expect(spreadsheetPreviewToTsv(preview)).toContain("## Sheet: Summary");
  });

  it("writes edited preview values back to the workbook", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "neoworker-xlsx-edit-"));
    const outPath = path.join(tmpDir, "editable.xlsx");
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Sheet1");
    sheet.getCell("A1").value = "Name";
    sheet.getCell("B1").value = "Status";
    sheet.getCell("A2").value = "Alice";
    sheet.getCell("B2").value = "Active";
    await workbook.xlsx.writeFile(outPath);

    const preview = await buildSpreadsheetPreviewFromFile(outPath);
    preview.sheets[0].rows[1][1].value = "Pending";
    preview.sheets[0].rows.push([
      { address: "A3", row: 3, column: 1, value: "Bruno" },
      { address: "B3", row: 3, column: 2, value: "=UPPER(A3)", formula: "UPPER(A3)" },
    ]);
    preview.sheets[0].rowCount = 3;

    await writeSpreadsheetPreviewToFile(outPath, preview);

    const reread = new ExcelJS.Workbook();
    await reread.xlsx.readFile(outPath);
    const savedSheet = reread.getWorksheet("Sheet1");
    expect(savedSheet?.getCell("B2").value).toBe("Pending");
    expect(savedSheet?.getCell("A3").value).toBe("Bruno");
    expect(savedSheet?.getCell("B3").value).toMatchObject({ formula: "UPPER(A3)" });
  });

  it("marks xlsx previews as truncated when source bounds exceed the preview window", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "neoworker-xlsx-large-preview-"));
    const outPath = path.join(tmpDir, "large.xlsx");
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Large");
    sheet.getCell("A1").value = "Header";
    sheet.getCell("A2001").value = "Outside preview";
    await workbook.xlsx.writeFile(outPath);

    const preview = await buildSpreadsheetPreviewFromFile(outPath);

    expect(preview.sheets[0].rows).toHaveLength(2000);
    expect(preview.sheets[0].sourceRowCount).toBe(2001);
    expect(preview.sheets[0].truncated).toBe(true);
  });

  it("extracts and writes CSV previews with quoted cells", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "neoworker-csv-preview-"));
    const outPath = path.join(tmpDir, "people.csv");
    const preview = buildDelimitedSpreadsheetPreview('Name,Notes\n"Alice, A.","Line 1\nLine 2"\nBruno,Ready', {
      delimiter: ",",
      sheetName: "people",
    });

    expect(preview.sheetCount).toBe(1);
    expect(preview.sheets[0].name).toBe("people");
    expect(preview.sheets[0].columnCount).toBe(2);
    expect(preview.sheets[0].rows[1][0].value).toBe("Alice, A.");
    expect(preview.sheets[0].rows[1][1].value).toBe("Line 1\nLine 2");

    preview.sheets[0].rows[2][1].value = 'Ready, "verified"';
    await writeDelimitedSpreadsheetPreviewToFile(outPath, preview, ",");
    const saved = await fs.readFile(outPath, "utf-8");
    expect(saved).toContain('"Ready, ""verified"""');
  });

  it("preserves CSV rows outside the editable preview window", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "neoworker-csv-large-"));
    const outPath = path.join(tmpDir, "large.csv");
    const lines = Array.from({ length: 2005 }, (_, index) => `row-${index + 1},value-${index + 1}`);
    await fs.writeFile(outPath, lines.join("\n"), "utf-8");

    const preview = buildDelimitedSpreadsheetPreview(await fs.readFile(outPath, "utf-8"), {
      delimiter: ",",
      sheetName: "large",
    });
    expect(preview.sheets[0].rows).toHaveLength(2000);
    expect(preview.sheets[0].truncated).toBe(true);

    preview.sheets[0].rows[0][1].value = "edited";
    await writeDelimitedSpreadsheetPreviewToFile(outPath, preview, ",");

    const saved = (await fs.readFile(outPath, "utf-8")).split("\n");
    expect(saved).toHaveLength(2005);
    expect(saved[0]).toBe("row-1,edited");
    expect(saved[2004]).toBe("row-2005,value-2005");
  });

  it("appends added CSV rows after hidden source rows", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "neoworker-csv-append-large-"));
    const outPath = path.join(tmpDir, "large.csv");
    const lines = Array.from({ length: 2005 }, (_, index) => `row-${index + 1},value-${index + 1}`);
    await fs.writeFile(outPath, lines.join("\n"), "utf-8");

    const preview = buildDelimitedSpreadsheetPreview(await fs.readFile(outPath, "utf-8"), {
      delimiter: ",",
      sheetName: "large",
    });
    preview.sheets[0].rows.push([
      { address: "A2001", row: 2001, column: 1, value: "new-row" },
      { address: "B2001", row: 2001, column: 2, value: "new-value" },
    ]);
    preview.sheets[0].rowCount = 2001;

    await writeDelimitedSpreadsheetPreviewToFile(outPath, preview, ",");

    const saved = (await fs.readFile(outPath, "utf-8")).split("\n");
    expect(saved).toHaveLength(2006);
    expect(saved[2000]).toBe("row-2001,value-2001");
    expect(saved[2005]).toBe("new-row,new-value");
  });

  it("serializes TSV previews with tabs preserved as delimiters", () => {
    const preview = buildDelimitedSpreadsheetPreview("Name\tStatus\nAlice\tActive", {
      delimiter: "\t",
      sheetName: "Sheet",
    });

    expect(spreadsheetPreviewToDelimitedText(preview, "\t")).toBe("Name\tStatus\nAlice\tActive");
  });
});
