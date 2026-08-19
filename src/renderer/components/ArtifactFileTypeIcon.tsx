import type { Icon } from "@phosphor-icons/react";
import {
  FileCsvIcon,
  FileAudioIcon,
  FileCodeIcon,
  FileDocIcon,
  FileImageIcon,
  FileMdIcon,
  FilePdfIcon,
  FileTextIcon,
  FileVideoIcon,
  FileXlsIcon,
  FileZipIcon,
  MicrosoftExcelLogoIcon,
  MicrosoftPowerpointLogoIcon,
  MicrosoftWordLogoIcon,
} from "@phosphor-icons/react";

type ArtifactFileTypeIconProps = {
  filePath: string;
  className?: string;
  size?: number;
  containerSize?: number;
};

export type ArtifactFileIconVisual = {
  Icon: Icon;
  tone:
    | "pdf"
    | "word"
    | "excel"
    | "powerpoint"
    | "spreadsheet"
    | "markdown"
    | "image"
    | "video"
    | "audio"
    | "archive"
    | "code"
    | "document";
};

const WORD_EXTENSIONS = new Set(["doc", "docx", "docm", "dotx", "dotm"]);
const EXCEL_EXTENSIONS = new Set(["xls", "xlsx", "xlsm", "xlsb"]);
const POWERPOINT_EXTENSIONS = new Set([
  "ppt",
  "pptx",
  "pptm",
  "potx",
  "potm",
  "ppsx",
  "ppsm",
]);

function getExtension(filePath: string): string {
  const fileName = filePath.split(/[\\/]/).pop() || filePath;
  const match = /\.([^.]+)$/.exec(fileName);
  return match?.[1]?.toLowerCase() || "";
}

export function getArtifactFileIconVisual(
  filePath: string,
): ArtifactFileIconVisual {
  const extension = getExtension(filePath);

  if (extension === "pdf") {
    return { Icon: FilePdfIcon, tone: "pdf" };
  }
  if (WORD_EXTENSIONS.has(extension)) {
    return { Icon: MicrosoftWordLogoIcon, tone: "word" };
  }
  if (EXCEL_EXTENSIONS.has(extension)) {
    return { Icon: MicrosoftExcelLogoIcon, tone: "excel" };
  }
  if (POWERPOINT_EXTENSIONS.has(extension)) {
    return { Icon: MicrosoftPowerpointLogoIcon, tone: "powerpoint" };
  }
  if (extension === "csv" || extension === "tsv") {
    return { Icon: FileCsvIcon, tone: "spreadsheet" };
  }
  if (
    extension === "numbers" ||
    extension === "gsheet" ||
    extension === "ods"
  ) {
    return { Icon: FileXlsIcon, tone: "spreadsheet" };
  }
  if (extension === "md" || extension === "markdown") {
    return { Icon: FileMdIcon, tone: "markdown" };
  }
  if (
    ["png", "jpg", "jpeg", "gif", "webp", "svg", "heic"].includes(extension)
  ) {
    return { Icon: FileImageIcon, tone: "image" };
  }
  if (["mp4", "mov", "webm", "avi", "mkv"].includes(extension)) {
    return { Icon: FileVideoIcon, tone: "video" };
  }
  if (["mp3", "wav", "m4a", "aac", "flac", "ogg"].includes(extension)) {
    return { Icon: FileAudioIcon, tone: "audio" };
  }
  if (["zip", "rar", "7z", "tar", "gz"].includes(extension)) {
    return { Icon: FileZipIcon, tone: "archive" };
  }
  if (
    [
      "ts",
      "tsx",
      "js",
      "jsx",
      "json",
      "html",
      "css",
      "py",
      "java",
      "go",
      "rs",
      "sql",
      "yaml",
      "yml",
    ].includes(extension)
  ) {
    return { Icon: FileCodeIcon, tone: "code" };
  }
  if (["rtf", "odt", "ott", "pages"].includes(extension)) {
    return { Icon: FileDocIcon, tone: "document" };
  }
  return { Icon: FileTextIcon, tone: "document" };
}

export function ArtifactFileTypeIcon({
  filePath,
  className = "",
  size = 22,
  containerSize,
}: ArtifactFileTypeIconProps) {
  const { Icon, tone } = getArtifactFileIconVisual(filePath);

  return (
    <span
      className={`artifact-file-type-icon artifact-file-type-icon-${tone} ${className}`.trim()}
      style={
        containerSize
          ? {
              width: containerSize,
              height: containerSize,
              flex: `0 0 ${containerSize}px`,
            }
          : undefined
      }
      aria-hidden="true"
    >
      <Icon size={size} weight="fill" />
    </span>
  );
}
