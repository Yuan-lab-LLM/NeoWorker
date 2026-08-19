const LEGACY_PRODUCT_BRAND_PATTERN =
  /\b(?:nova[\s_-]*ready|co[\s_-]*work(?:[\s_-]*(?:os|oss))?|crew[\s_-]*work|quiver[\s_-]*ready)\b/gi;

const LEGACY_WORKSPACE_KIT_PATTERN =
  /(^|[^A-Za-z0-9_])\.(?:novaready|cowork|quiverready|crewwork)(?=(?:[\\/]|[\s`.,;:!?()[\]{}]|$))/gim;

const MARKDOWN_CODE_PATTERN = /(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`)/g;

function isPathOrUrlOccurrence(source: string, start: number, end: number): boolean {
  let tokenStart = start;
  let tokenEnd = end;

  while (tokenStart > 0 && !/\s/.test(source[tokenStart - 1])) tokenStart -= 1;
  while (tokenEnd < source.length && !/\s/.test(source[tokenEnd])) tokenEnd += 1;

  const token = source.slice(tokenStart, tokenEnd);
  return /(?:https?:\/\/|file:\/\/|[\\/])/.test(token);
}

function normalizeProseSegment(segment: string): string {
  return segment.replace(LEGACY_PRODUCT_BRAND_PATTERN, (match, offset: number, source: string) =>
    isPathOrUrlOccurrence(source, offset, offset + match.length) ? match : "NeoWorker",
  );
}

function normalizeLegacyWorkspaceKitReferences(text: string): string {
  return text.replace(
    LEGACY_WORKSPACE_KIT_PATTERN,
    (_match, prefix: string) => `${prefix}.neoworker`,
  );
}

/**
 * Rewrites legacy product names in assistant-authored prose. Historical app
 * paths remain literal, while obsolete private workspace-kit directories are
 * presented through their current `.neoworker` alias, including in inline code.
 */
export function normalizeLegacyProductBrand(text: string): string {
  return normalizeLegacyWorkspaceKitReferences(String(text || ""))
    .split(MARKDOWN_CODE_PATTERN)
    .map((segment, index) => (index % 2 === 1 ? segment : normalizeProseSegment(segment)))
    .join("");
}
