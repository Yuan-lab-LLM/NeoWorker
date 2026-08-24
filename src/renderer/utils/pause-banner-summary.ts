const DEFAULT_PAUSE_BANNER_SUMMARY_CHARS = 240;
const SENTENCE_BOUNDARY_REGEX = /(?<=[.!?])\s+/u;
const MIN_SENTENCE_SUMMARY_CHARS = 72;

export type PauseBannerPreview = {
  summary: string;
  showDetails: boolean;
  fullText: string;
};

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function truncateWithEllipsis(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

function buildSentenceSummary(paragraph: string, maxChars: number): string {
  const sentences = paragraph
    .split(SENTENCE_BOUNDARY_REGEX)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  if (sentences.length === 0) return "";
  if (
    sentences[0].length >= MIN_SENTENCE_SUMMARY_CHARS &&
    sentences[0].length <= maxChars
  ) {
    return sentences[0];
  }

  let summary = "";
  for (const sentence of sentences) {
    const nextSummary = summary ? `${summary} ${sentence}` : sentence;
    if (nextSummary.length > maxChars) break;
    summary = nextSummary;
    if (summary.length >= MIN_SENTENCE_SUMMARY_CHARS) break;
  }
  return summary;
}

export function buildPauseBannerPreview(
  message: string,
  maxChars: number = DEFAULT_PAUSE_BANNER_SUMMARY_CHARS,
): PauseBannerPreview {
  const fullText = message.trim();
  if (!fullText) {
    return { summary: "", showDetails: false, fullText: "" };
  }

  const collapsedText = collapseWhitespace(fullText);
  const paragraphs = fullText
    .split(/\n\s*\n/u)
    .map((paragraph) => collapseWhitespace(paragraph))
    .filter(Boolean);
  const firstParagraph = paragraphs[0] ?? collapsedText;
  const sentenceSummary = buildSentenceSummary(firstParagraph, maxChars);
  const summary =
    sentenceSummary || truncateWithEllipsis(firstParagraph, maxChars);
  const showDetails =
    collapsedText.length > summary.length ||
    paragraphs.length > 1 ||
    fullText.includes("\n");

  return { summary, showDetails, fullText };
}
