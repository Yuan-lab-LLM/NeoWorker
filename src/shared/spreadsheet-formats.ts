const IN_APP_SPREADSHEET_EXTENSIONS = new Set([".xlsx", ".xls", ".xlsm", ".csv", ".tsv"]);

const SPREADSHEET_ARTIFACT_EXTENSIONS = new Set([
  ".xlsx",
  ".xls",
  ".xlsm",
  ".xlsb",
  ".csv",
  ".tsv",
  ".ods",
  ".numbers",
  ".gsheet",
]);

const SPREADSHEET_MIME_TYPES = new Set([
  "application/vnd.ms-excel",
  "application/vnd.ms-excel.sheet.macroenabled.12",
  "application/vnd.ms-excel.sheet.binary.macroenabled.12",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.oasis.opendocument.spreadsheet",
  "application/x-iwork-numbers-sffnumbers",
  "application/vnd.apple.numbers",
  "application/vnd.google-apps.spreadsheet",
  "text/csv",
  "text/tab-separated-values",
]);

export function getSpreadsheetFileExtension(filePath: string): string {
  const fileName = filePath.split(/[\\/]/).pop() || filePath;
  const match = /\.([^.]+)$/.exec(fileName);
  return match ? `.${match[1].toLowerCase()}` : "";
}

export function getSpreadsheetFormatLabel(filePath: string): string {
  const extension = getSpreadsheetFileExtension(filePath);
  switch (extension) {
    case ".xlsx":
      return "XLSX";
    case ".xls":
      return "XLS";
    case ".xlsm":
      return "XLSM";
    case ".xlsb":
      return "XLSB";
    case ".csv":
      return "CSV";
    case ".tsv":
      return "TSV";
    case ".ods":
      return "ODS";
    case ".numbers":
      return "Numbers";
    case ".gsheet":
      return "Google Sheets";
    default:
      return "Spreadsheet";
  }
}

export function isSpreadsheetArtifactFile(filePath: string): boolean {
  return SPREADSHEET_ARTIFACT_EXTENSIONS.has(getSpreadsheetFileExtension(filePath));
}

export function canOpenSpreadsheetInApp(filePath: string): boolean {
  return IN_APP_SPREADSHEET_EXTENSIONS.has(getSpreadsheetFileExtension(filePath));
}

export function isSpreadsheetMimeType(mimeType: string): boolean {
  const normalized = mimeType.trim().toLowerCase();
  return SPREADSHEET_MIME_TYPES.has(normalized);
}
