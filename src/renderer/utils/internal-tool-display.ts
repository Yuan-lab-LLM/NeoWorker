import { getCurrentLanguage, type SupportedLanguage } from "../i18n";

const OFFICECLI_PROSE_PATTERN = /\bOffice\s*[-_ ]?\s*CLI\b/gi;
const MARKDOWN_CODE_PATTERN = /(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`)/g;

function normalizeProseSegment(
  segment: string,
  language: SupportedLanguage,
): string {
  const displayName = language === "zh-CN" ? "Office工具" : "Office tools";
  return segment.replace(OFFICECLI_PROSE_PATTERN, displayName);
}

/**
 * Keeps the internal OfficeCLI implementation available while presenting a
 * product-facing name in user-visible prose. Literal commands inside Markdown
 * code remain unchanged so copied commands continue to work.
 */
export function normalizeInternalToolNamesForDisplay(
  text: string,
  language: SupportedLanguage = getCurrentLanguage(),
): string {
  return String(text || "")
    .split(MARKDOWN_CODE_PATTERN)
    .map((segment, index) =>
      index % 2 === 1 ? segment : normalizeProseSegment(segment, language),
    )
    .join("");
}
