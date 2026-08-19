import * as fs from "fs/promises";
import * as path from "path";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { Workspace } from "../../../shared/types";

export interface SheetData {
  name: string;
  data: Any[][];
  /** Optional column widths */
  columnWidths?: number[];
  /** If true, first row is treated as header with bold formatting */
  hasHeader?: boolean;
}

export interface SpreadsheetOptions {
  /** Auto-fit column widths based on content */
  autoFitColumns?: boolean;
  /** Add filters to header row */
  addFilters?: boolean;
  /** Freeze the header row */
  freezeHeader?: boolean;
}

const XLSX_FONT_CHILD_ORDER = [
  "b",
  "i",
  "strike",
  "outline",
  "shadow",
  "condense",
  "extend",
  "sz",
  "color",
  "u",
  "vertAlign",
  "name",
  "charset",
  "family",
  "scheme",
];

function normalizeFontChildOrder(stylesXml: string): string {
  const childPattern =
    /<(?:name|charset|family|b|i|strike|outline|shadow|condense|extend|color|sz|u|vertAlign|scheme)\b[^>]*\/>/g;
  return stylesXml.replace(/<font>([\s\S]*?)<\/font>/g, (fontXml, children: string) => {
    const tags = children.match(childPattern);
    if (!tags || tags.length < 2) return fontXml;
    const unparsed = children.replace(childPattern, "").trim();
    if (unparsed) return fontXml;
    const rank = (tag: string) => {
      const name = tag.match(/^<([A-Za-z]+)/)?.[1] || "";
      const index = XLSX_FONT_CHILD_ORDER.indexOf(name);
      return index < 0 ? XLSX_FONT_CHILD_ORDER.length : index;
    };
    return `<font>${tags.sort((a, b) => rank(a) - rank(b)).join("")}</font>`;
  });
}

async function normalizeWorkbookOpenXml(outputPath: string): Promise<void> {
  const workbookBuffer = await fs.readFile(outputPath);
  const archive = await JSZip.loadAsync(workbookBuffer);
  const stylesPart = archive.file("xl/styles.xml");
  if (!stylesPart) return;
  const originalStyles = await stylesPart.async("string");
  const normalizedStyles = normalizeFontChildOrder(originalStyles);
  if (normalizedStyles === originalStyles) return;
  archive.file("xl/styles.xml", normalizedStyles);
  const normalizedWorkbook = await archive.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
  });
  await fs.writeFile(outputPath, normalizedWorkbook);
}

/**
 * SpreadsheetBuilder creates Excel spreadsheets (.xlsx) using exceljs
 */
export class SpreadsheetBuilder {
  constructor(private workspace: Workspace) {}

  async create(
    outputPath: string,
    sheets: SheetData[],
    options: SpreadsheetOptions = {},
  ): Promise<void> {
    if (sheets.length === 0) {
      throw new Error("At least one sheet is required");
    }

    const ext = path.extname(outputPath).toLowerCase();

    // If CSV is explicitly requested, use CSV format
    if (ext === ".csv") {
      await this.createCSV(outputPath, sheets[0]);
      return;
    }

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "NeoWorker";
    workbook.created = new Date();

    for (const sheetData of sheets) {
      const worksheet = workbook.addWorksheet(sheetData.name, {
        properties: {
          defaultRowHeight: 21,
          tabColor: { argb: "FF2F6FEB" },
        },
        views: [{ showGridLines: false }],
        pageSetup: {
          fitToPage: true,
          fitToWidth: 1,
          fitToHeight: 0,
          orientation: "landscape",
          margins: {
            left: 0.35,
            right: 0.35,
            top: 0.5,
            bottom: 0.5,
            header: 0.2,
            footer: 0.2,
          },
        },
      });

      // Add all rows
      for (let rowIndex = 0; rowIndex < sheetData.data.length; rowIndex++) {
        const rowData = sheetData.data[rowIndex];

        // The tool schema for create_spreadsheet uses strings for cell values, so
        // formulas are commonly provided as strings like "=SUM(A1:A2)". ExcelJS
        // requires formulas to be passed as objects: { formula: "SUM(A1:A2)" }.
        const normalizedRowData = rowData.map((cell) => {
          if (typeof cell !== "string") return cell;
          const trimmed = cell.trim();
          if (trimmed.startsWith("=") && trimmed.length > 1) {
            return { formula: trimmed.slice(1) };
          }
          return cell;
        });

        const row = worksheet.addRow(normalizedRowData);

        // Style header row if specified
        if (rowIndex === 0 && sheetData.hasHeader !== false) {
          row.height = 28;
          row.font = {
            bold: true,
            color: { argb: "FFFFFFFF" },
          };
          row.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FF24466F" },
          };
          row.alignment = { vertical: "middle" };
        } else {
          row.height = 22;
          row.font = { color: { argb: "FF26374A" } };
          row.alignment = { vertical: "middle", wrapText: true };
          if (rowIndex % 2 === 0) {
            row.fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: "FFF6F9FD" },
            };
          }
        }

        row.eachCell({ includeEmpty: true }, (cell) => {
          cell.border = {
            bottom: { style: "hair", color: { argb: "FFD7E1EC" } },
          };
          cell.alignment = {
            ...cell.alignment,
            vertical: "middle",
            wrapText: rowIndex !== 0,
          };
        });

        if (rowIndex > 0) {
          const firstCell = row.getCell(1);
          firstCell.font = {
            ...firstCell.font,
            bold: true,
            color: { argb: "FF173B67" },
          };
        }
      }

      // Set column widths
      if (sheetData.columnWidths) {
        sheetData.columnWidths.forEach((width, index) => {
          const column = worksheet.getColumn(index + 1);
          column.width = width;
        });
      } else if (options.autoFitColumns !== false) {
        // Auto-fit columns based on content
        worksheet.columns.forEach((column) => {
          let maxLength = 10;
          column.eachCell?.({ includeEmpty: true }, (cell) => {
            const cellValue = cell.value;
            const length = cellValue ? String(cellValue).length : 0;
            if (length > maxLength) {
              maxLength = Math.min(length, 50); // Cap at 50 characters
            }
          });
          column.width = maxLength + 2;
        });
      }

      // Add filters to header row
      if (options.addFilters !== false && sheetData.data.length > 0) {
        const lastColumn = sheetData.data[0].length;
        const lastRow = sheetData.data.length;
        worksheet.autoFilter = {
          from: { row: 1, column: 1 },
          to: { row: lastRow, column: lastColumn },
        };
      }

      // Freeze header row
      if (options.freezeHeader !== false && sheetData.data.length > 0) {
        worksheet.views = [{ state: "frozen", ySplit: 1, showGridLines: false }];
      }

      worksheet.pageSetup.printTitlesRow = "1:1";
    }

    // Write the file
    await workbook.xlsx.writeFile(outputPath);
    // ExcelJS writes the default font children in an order tolerated by Excel but
    // rejected by strict OpenXML validators. Normalize the styles part so generated
    // workbooks pass OfficeCLI/OpenXML validation as well as opening in Excel/WPS.
    await normalizeWorkbookOpenXml(outputPath);
  }

  /**
   * Creates a simple CSV file (fallback for .csv extension)
   */
  private async createCSV(outputPath: string, sheet: SheetData): Promise<void> {
    const csv = sheet.data
      .map((row) =>
        row
          .map((cell) => {
            const str = String(cell ?? "");
            // Escape quotes and wrap in quotes if contains comma, quote, or newline
            if (str.includes(",") || str.includes('"') || str.includes("\n")) {
              return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
          })
          .join(","),
      )
      .join("\n");

    await fs.writeFile(outputPath, csv, "utf-8");
  }

  /**
   * Read an existing Excel file and return sheet data
   */
  async read(inputPath: string): Promise<SheetData[]> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(inputPath);

    const sheets: SheetData[] = [];

    workbook.eachSheet((worksheet) => {
      const data: Any[][] = [];
      worksheet.eachRow((row, _rowNumber) => {
        const rowData: Any[] = [];
        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          // Ensure array is long enough
          while (rowData.length < colNumber - 1) {
            rowData.push(null);
          }
          rowData.push(cell.value);
        });
        data.push(rowData);
      });

      sheets.push({
        name: worksheet.name,
        data,
        hasHeader: true,
      });
    });

    return sheets;
  }
}
