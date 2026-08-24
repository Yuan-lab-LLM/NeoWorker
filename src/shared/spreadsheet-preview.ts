export interface SpreadsheetPreviewCell {
  address: string;
  row: number;
  column: number;
  value: string;
  formula?: string;
  bold?: boolean;
  italic?: boolean;
  backgroundColor?: string;
  fontColor?: string;
  horizontalAlignment?: string;
}

export interface SpreadsheetPreviewSheet {
  name: string;
  rowCount: number;
  columnCount: number;
  columnWidths: number[];
  rows: SpreadsheetPreviewCell[][];
  sourceRowCount?: number;
  truncated?: boolean;
}

export interface SpreadsheetPreview {
  activeSheetName?: string;
  sheetCount: number;
  sheets: SpreadsheetPreviewSheet[];
}

export function spreadsheetColumnLetter(index: number): string {
  let letter = "";
  let n = index;
  while (n >= 0) {
    letter = String.fromCharCode(65 + (n % 26)) + letter;
    n = Math.floor(n / 26) - 1;
  }
  return letter;
}
