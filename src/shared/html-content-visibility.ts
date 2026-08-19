const VISIBILITY_GUARD_ATTRIBUTE = "data-neoworker-content-visibility-guard";

export interface HtmlContentVisibilityRepairResult {
  content: string;
  repaired: boolean;
  reasons: string[];
}

function isHtmlDocument(content: string): boolean {
  return /<(?:!doctype\s+html|html|head|body)\b/i.test(content);
}

function containsRevealContent(content: string): boolean {
  return (
    /class\s*=\s*["'][^"']*\breveal\b[^"']*["']/i.test(content) ||
    /\bdata-reveal(?:\s|=|\/?>)/i.test(content)
  );
}

function hasUnsafeRevealDefaults(content: string): boolean {
  const cssRulePattern = /([^{}]+)\{([^{}]*)\}/g;
  let match: RegExpExecArray | null;

  while ((match = cssRulePattern.exec(content))) {
    const selector = match[1];
    const declarations = match[2];
    if (!/(?:\.reveal\b|\[data-reveal(?:\]|=))/i.test(selector)) continue;
    if (
      /(?:^|;)\s*opacity\s*:\s*0(?:\.0+)?\s*(?:!important\s*)?(?:;|$)/i.test(declarations) ||
      /(?:^|;)\s*visibility\s*:\s*hidden\s*(?:!important\s*)?(?:;|$)/i.test(declarations)
    ) {
      return true;
    }
  }
  return false;
}

export function repairHiddenHtmlContent(content: string): HtmlContentVisibilityRepairResult {
  if (
    !isHtmlDocument(content) ||
    content.includes(VISIBILITY_GUARD_ATTRIBUTE) ||
    !containsRevealContent(content) ||
    !hasUnsafeRevealDefaults(content)
  ) {
    return { content, repaired: false, reasons: [] };
  }

  const guard = [
    `  <style ${VISIBILITY_GUARD_ATTRIBUTE}="true">`,
    "    /* Generated content must remain readable when animation hooks fail. */",
    "    .reveal, [data-reveal] {",
    "      opacity: 1 !important;",
    "      visibility: visible !important;",
    "    }",
    "  </style>",
  ].join("\n");

  const repairedContent = /<\/head\s*>/i.test(content)
    ? content.replace(/<\/head\s*>/i, `${guard}\n</head>`)
    : `${guard}\n${content}`;

  return {
    content: repairedContent,
    repaired: true,
    reasons: ["reveal content was hidden by default and depended on JavaScript to become visible"],
  };
}
