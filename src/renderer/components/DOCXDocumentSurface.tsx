import { useEffect, useMemo, useState } from "react";
import type {
  DocumentEditorDocxBlock,
  DocxBlockSelection,
} from "../../shared/types";
import { translate, useLanguage } from "../i18n";

type DOCXDocumentSurfaceProps = {
  blocks: DocumentEditorDocxBlock[];
  selection: DocxBlockSelection | null;
  onSelectionChange: (selection: DocxBlockSelection | null) => void;
};

export function DOCXDocumentSurface({
  blocks,
  selection,
  onSelectionChange,
}: DOCXDocumentSurfaceProps) {
  useLanguage();
  const t = translate;
  const [anchorIndex, setAnchorIndex] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const handlePointerUp = () => setDragging(false);
    window.addEventListener("pointerup", handlePointerUp);
    return () => window.removeEventListener("pointerup", handlePointerUp);
  }, []);

  const selectedIds = useMemo(
    () => new Set(selection?.blockIds || []),
    [selection],
  );

  const updateSelection = (startIndex: number, endIndex: number) => {
    const [from, to] =
      startIndex <= endIndex ? [startIndex, endIndex] : [endIndex, startIndex];
    const selectedBlocks = blocks.slice(from, to + 1);
    onSelectionChange({
      kind: "docx",
      startBlockId: selectedBlocks[0]?.id,
      endBlockId: selectedBlocks[selectedBlocks.length - 1]?.id,
      blockIds: selectedBlocks.map((block) => block.id),
      excerpt: selectedBlocks.map((block) => block.text).join("\n\n"),
    });
  };

  if (blocks.length === 0) {
    return (
      <div className="document-editor-empty">
        {t("docxSurface.empty", "No structured DOCX blocks were extracted.")}
      </div>
    );
  }

  return (
    <div className="docx-document-surface">
      {blocks.map((block, index) => (
        <button
          key={block.id}
          type="button"
          className={`docx-block-card ${selectedIds.has(block.id) ? "selected" : ""}`}
          onPointerDown={() => {
            setAnchorIndex(index);
            setDragging(true);
            updateSelection(index, index);
          }}
          onPointerEnter={() => {
            if (dragging && anchorIndex !== null) {
              updateSelection(anchorIndex, index);
            }
          }}
          onClick={() => {
            setAnchorIndex(index);
            updateSelection(index, index);
          }}
        >
          <div className="docx-block-meta">
            <span className="docx-block-type">{block.type}</span>
            <span className="docx-block-id">{block.id}</span>
          </div>
          {block.type === "heading" ? (
            <div
              className={`docx-block-heading docx-block-heading-${block.level || 1}`}
            >
              {block.text}
            </div>
          ) : block.type === "table" ? (
            <div className="docx-block-table-preview">
              {(block.rows || []).slice(0, 4).map((row, rowIndex) => (
                <div
                  key={`${block.id}-${rowIndex}`}
                  className="docx-block-table-row"
                >
                  {row.map((cell, cellIndex) => (
                    <span key={`${block.id}-${rowIndex}-${cellIndex}`}>
                      {cell || " "}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <div className="docx-block-text">{block.text}</div>
          )}
        </button>
      ))}
    </div>
  );
}
