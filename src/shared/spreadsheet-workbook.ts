import type { SpreadsheetPreview, SpreadsheetPreviewCell } from "./spreadsheet-preview";

export type SpreadsheetWorkbookFormat = "xlsx" | "xlsm" | "csv" | "tsv";

export type SpreadsheetCellValueType =
  | "blank"
  | "string"
  | "number"
  | "boolean"
  | "date"
  | "formula"
  | "error";

export interface SpreadsheetCellPosition {
  row: number;
  column: number;
}

export interface SpreadsheetCellRange {
  start: SpreadsheetCellPosition;
  end: SpreadsheetCellPosition;
}

export interface SpreadsheetCellInput {
  value: string;
  formula?: string;
}

export interface SpreadsheetCellData extends SpreadsheetPreviewCell {
  type: SpreadsheetCellValueType;
  displayValue: string;
  styleId?: string;
  numberFormatId?: string;
  readOnlyReason?: string;
}

export interface SpreadsheetSheetMeta {
  id: string;
  name: string;
  rowCount: number;
  columnCount: number;
  columnWidths: number[];
  sourceRowCount?: number;
  truncated?: boolean;
  frozenRows?: number;
  frozenColumns?: number;
  merges?: SpreadsheetCellRange[];
  autoFilter?: SpreadsheetCellRange;
  hidden?: boolean;
}

export interface SpreadsheetCapabilities {
  canEditCells: boolean;
  canEditStructure: boolean;
  canEditFormatting: boolean;
  canRecalculateFormulas: boolean;
  preservesUnsupportedWorkbookParts: boolean;
}

export interface SpreadsheetCompatibilityWarning {
  code: string;
  message: string;
  severity: "info" | "warning" | "error";
}

export interface SpreadsheetWorkbookSession {
  sessionId: string;
  filePath: string;
  fileName: string;
  format: SpreadsheetWorkbookFormat;
  sheets: SpreadsheetSheetMeta[];
  activeSheetId: string;
  capabilities: SpreadsheetCapabilities;
  warnings: SpreadsheetCompatibilityWarning[];
}

export interface SpreadsheetViewport {
  sheetId: string;
  startRow: number;
  endRow: number;
  startColumn: number;
  endColumn: number;
  cells: SpreadsheetCellData[][];
  rowHeights: Record<number, number>;
  columnWidths: Record<number, number>;
}

export interface SpreadsheetOpenWorkbookResult {
  success: boolean;
  error?: string;
  session?: SpreadsheetWorkbookSession;
  viewport?: SpreadsheetViewport;
  preview?: SpreadsheetPreview;
}

export interface SpreadsheetViewportRequest {
  sessionId: string;
  sheetId: string;
  startRow: number;
  endRow: number;
  startColumn: number;
  endColumn: number;
}

export interface SpreadsheetViewportResult {
  success: boolean;
  error?: string;
  viewport?: SpreadsheetViewport;
}

export type SpreadsheetPatch =
  | {
      type: "setCell";
      sheetId: string;
      row: number;
      column: number;
      input: SpreadsheetCellInput;
    }
  | {
      type: "setRange";
      sheetId: string;
      startRow: number;
      startColumn: number;
      values: SpreadsheetCellInput[][];
    }
  | {
      type: "insertRows";
      sheetId: string;
      beforeRow: number;
      count: number;
    }
  | {
      type: "deleteRows";
      sheetId: string;
      row: number;
      count: number;
    }
  | {
      type: "insertColumns";
      sheetId: string;
      beforeColumn: number;
      count: number;
    }
  | {
      type: "deleteColumns";
      sheetId: string;
      column: number;
      count: number;
    }
  | {
      type: "resizeColumn";
      sheetId: string;
      column: number;
      width: number;
    }
  | {
      type: "renameSheet";
      sheetId: string;
      name: string;
    };

export interface SpreadsheetApplyPatchesResult {
  success: boolean;
  error?: string;
  session?: SpreadsheetWorkbookSession;
  viewport?: SpreadsheetViewport;
}

export interface SpreadsheetSaveWorkbookResult {
  success: boolean;
  error?: string;
  /** True when the source file changed after this editing session was opened. */
  conflict?: boolean;
  session?: SpreadsheetWorkbookSession;
  viewport?: SpreadsheetViewport;
  preview?: SpreadsheetPreview;
  size?: number;
}
