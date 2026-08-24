const PRESENTATION_ARTIFACT_EXTENSIONS = new Set([
  ".pptx",
  ".ppt",
  ".pptm",
  ".potx",
  ".potm",
  ".ppsx",
  ".ppsm",
]);

const PRESENTATION_MIME_TYPES = new Set([
  "application/vnd.ms-powerpoint",
  "application/vnd.ms-powerpoint.presentation.macroenabled.12",
  "application/vnd.ms-powerpoint.template.macroenabled.12",
  "application/vnd.ms-powerpoint.slideshow.macroenabled.12",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.presentationml.template",
  "application/vnd.openxmlformats-officedocument.presentationml.slideshow",
]);

export function getPresentationFileExtension(filePath: string): string {
  const fileName = filePath.split(/[\\/]/).pop() || filePath;
  const match = /\.([^.]+)$/.exec(fileName);
  return match ? `.${match[1].toLowerCase()}` : "";
}

export function getPresentationFormatLabel(filePath: string): string {
  const extension = getPresentationFileExtension(filePath);
  switch (extension) {
    case ".pptx":
      return "PPTX";
    case ".ppt":
      return "PPT";
    case ".pptm":
      return "PPTM";
    case ".potx":
      return "POTX";
    case ".potm":
      return "POTM";
    case ".ppsx":
      return "PPSX";
    case ".ppsm":
      return "PPSM";
    default:
      return "Presentation";
  }
}

export function isPresentationArtifactFile(filePath: string): boolean {
  return PRESENTATION_ARTIFACT_EXTENSIONS.has(getPresentationFileExtension(filePath));
}

export function canPreviewPresentationInApp(filePath: string): boolean {
  return isPresentationArtifactFile(filePath);
}

export function isPresentationMimeType(mimeType: string): boolean {
  const normalized = mimeType.trim().toLowerCase();
  return PRESENTATION_MIME_TYPES.has(normalized);
}
