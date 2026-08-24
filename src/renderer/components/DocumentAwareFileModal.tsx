import { DocumentEditorModal } from "./DocumentEditorModal";
import { FileViewer } from "./FileViewer";

type DocumentAwareFileModalProps = {
  filePath: string;
  workspacePath?: string;
  onClose: () => void;
};

export function DocumentAwareFileModal({
  filePath,
  workspacePath,
  onClose,
}: DocumentAwareFileModalProps) {
  const lowerPath = filePath.toLowerCase();
  if (lowerPath.endsWith(".pdf")) {
    return (
      <FileViewer
        filePath={filePath}
        workspacePath={workspacePath}
        onClose={onClose}
        variant="side-pane"
      />
    );
  }
  if (lowerPath.endsWith(".docx")) {
    return (
      <DocumentEditorModal
        filePath={filePath}
        workspacePath={workspacePath}
        onClose={onClose}
      />
    );
  }
  return (
    <FileViewer
      filePath={filePath}
      workspacePath={workspacePath}
      onClose={onClose}
    />
  );
}
