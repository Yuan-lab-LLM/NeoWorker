const EXPLICIT_SKILL_ACTIVATION_CUE =
  "(?:use|run|call|invoke|activate|apply|launch|start|enable|turn\\s+on|work\\s+on|help\\s+with|help\\s+me\\s+with)";

export function matchesExplicitSkillInvocationPhrase(
  normalizedQuery: string,
  normalizedPhrase: string,
  escapeSegment: (segment: string) => string,
): boolean {
  if (!normalizedQuery || !normalizedPhrase) {
    return false;
  }

  const phrasePattern = normalizedPhrase
    .split(" ")
    .filter(Boolean)
    .map((segment) => escapeSegment(segment))
    .join("\\s+");
  if (!phrasePattern) {
    return false;
  }

  const quotedPhrase = `(?:["'“”‘’])?${phrasePattern}(?:["'“”‘’])?`;
  const patterns = [
    `(?:^|[^a-z0-9])${EXPLICIT_SKILL_ACTIVATION_CUE}\\s+(?:the\\s+)?${quotedPhrase}(?:\\s+skill)?(?:$|[^a-z0-9])`,
    `(?:^|[^a-z0-9])${EXPLICIT_SKILL_ACTIVATION_CUE}\\s+(?:the\\s+)?skill\\s+${quotedPhrase}(?:$|[^a-z0-9])`,
    `(?:^|[^a-z0-9])${quotedPhrase}\\s+skill(?:$|[^a-z0-9])`,
    `(?:^|[^a-z0-9])skill\\s+${quotedPhrase}(?:$|[^a-z0-9])`,
  ];

  return patterns.some((pattern) => new RegExp(pattern, "i").test(normalizedQuery));
}
