import type { DocumentEditorDocxBlock } from "./types";

export type DocumentPreviewMode = "html" | "text" | "unavailable";
export type DocumentPreviewConversionStatus = "native" | "converted" | "unavailable" | "failed";

export interface DocumentPreview {
  format: string;
  previewMode: DocumentPreviewMode;
  title?: string;
  text: string;
  htmlContent?: string;
  blocks?: DocumentEditorDocxBlock[];
  canEdit: boolean;
  conversionStatus?: DocumentPreviewConversionStatus;
  conversionMessage?: string;
}

export interface EditableDocumentRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
}

export interface EditableDocumentBlock {
  id?: string;
  type: "paragraph" | "heading" | "bullet" | "numbered" | "table";
  level?: number;
  text?: string;
  runs?: EditableDocumentRun[];
  rows?: string[][];
  order?: number;
}
