const STRATEGY_CONTEXT_BLOCK_PATTERN =
  /\n*\[AGENT_STRATEGY_CONTEXT_V1\][\s\S]*?\[\/AGENT_STRATEGY_CONTEXT_V1\]\n*/gi;

const GENERATED_ATTACHMENT_SECTION_PATTERNS = [
  /(?:^|\n)\s*Attached files \(relative to workspace\):\s*(?:\n|$)/i,
  /(?:^|\n)\s*Attached files:\s*(?:\n|$)/i,
];

type OfficeAttachmentKind = "docx" | "pdf" | "pptx" | "xlsx";

const OFFICE_ATTACHMENT_EXTENSION_KIND: Record<string, OfficeAttachmentKind> = {
  csv: "xlsx",
  doc: "docx",
  docx: "docx",
  odp: "pptx",
  ods: "xlsx",
  odt: "docx",
  pdf: "pdf",
  ppt: "pptx",
  pptx: "pptx",
  rtf: "docx",
  tsv: "xlsx",
  xls: "xlsx",
  xlsm: "xlsx",
  xlsx: "xlsx",
};

const OFFICE_ATTACHMENT_MIME_KIND: Array<[RegExp, OfficeAttachmentKind]> = [
  [/presentation|powerpoint|opendocument\.presentation/i, "pptx"],
  [/spreadsheet|excel|csv|tab-separated|opendocument\.spreadsheet/i, "xlsx"],
  [/wordprocessingml|msword|rtf|opendocument\.text/i, "docx"],
  [/application\/pdf/i, "pdf"],
];

const EXPLICIT_OFFICE_KIND_PATTERN =
  /\b(?:csv|docx?|excel|pdf|powerpoint|pptx?|presentation|slides?|deck|spreadsheet|word|xlsx?|workbook)\b|(?:电子表格|工作簿|数据表|表格文件|演示文稿|演示稿|幻灯片|台账|讲稿|简报)/i;

const IMPLICIT_ATTACHMENT_REFERENCE_PATTERN =
  /\b(?:attached|attachment|current file|existing file|this (?:file|document|attachment|presentation|deck|spreadsheet|workbook|pdf)|these (?:files|documents|attachments)|uploaded file|continue)\b|(?:附件|这个文件|这个附件|这个文档|这些文件|这份文件|这份文档|当前文件|现有文件|原文件|原稿|按这个|按原版|继续|再改|再调整|再更新)/i;

const TRAILING_IMPLICIT_ATTACHMENT_REFERENCE_PATTERN =
  /(?:\b(?:edit|fix|modify|polish|revise|update)\s+it|(?:修改|编辑|更新|调整|修复|完善|润色|美化)(?:一下)?(?:这个|这份|它))\s*$/i;

const SAME_FILE_MUTATION_PATTERN =
  /\b(?:add|change|continue|edit|fix|format|merge|modify|polish|remove|replace|restyle|revise|update)\b|(?:修改|编辑|更新|调整|修复|再改|改一下|改动|完善|润色|排版|美化|继续|替换|补充|删除|添加|合并)/i;

const OFFICE_ATTACHMENT_ROUTING_HINTS: Record<OfficeAttachmentKind, string> = {
  docx: "Requested operation: edit the attached Word document (.doc/.docx).",
  pdf: "Requested operation: edit the attached PDF document (.pdf).",
  pptx: "Requested operation: edit the attached PowerPoint presentation (.ppt/.pptx).",
  xlsx: "Requested operation: edit the attached Excel workbook (.xls/.xlsx).",
};

const OFFICE_OUTPUT_ROUTING_HINTS: Record<OfficeAttachmentKind, string> = {
  docx: "Requested output: create a Word document (.docx).",
  pdf: "Requested output: create a PDF document (.pdf).",
  pptx: "Requested output: create a PowerPoint presentation (.pptx).",
  xlsx: "Requested output: create an Excel workbook (.xlsx).",
};

const OFFICE_KIND_MENTION_PATTERNS: Record<OfficeAttachmentKind, RegExp> = {
  docx: /\b(?:doc|docx|word)\b|word\s*文档/i,
  pdf: /\bpdf\b/i,
  pptx: /\b(?:powerpoint|ppt|pptx|presentation|slides?|deck)\b|(?:演示文稿|演示稿|幻灯片)/i,
  xlsx: /\b(?:csv|excel|spreadsheet|workbook|xls|xlsx)\b|(?:电子表格|工作簿|数据表|表格文件|台账)/i,
};

const OFFICE_OUTPUT_TARGET_PATTERNS = [
  /(?:转换|转化|转|改|导出|输出|保存)(?:为|成)\s*([^\n，。；;]{1,64})/gi,
  /(?:生成|创建|制作|产出)\s*([^\n，。；;]{1,64})/gi,
  /\b(?:convert|transform|turn|export|save)\b[^\n,.;]{0,64}?\b(?:to|into|as)\b\s*([^\n,.;]{1,64})/gi,
  /\b(?:create|generate|make|produce)\b\s+([^\n,.;]{1,64})/gi,
];

const ALL_OFFICE_KIND_MENTIONS_PATTERN =
  /\b(?:csv|doc|docx|excel|pdf|powerpoint|ppt|pptx|presentation|slides?|spreadsheet|word|workbook|xls|xlsx|deck)\b|(?:word\s*文档|电子表格|工作簿|数据表|表格文件|台账|演示文稿|演示稿|幻灯片)/gi;

function findOfficeKindsInText(value: string): OfficeAttachmentKind[] {
  return (Object.keys(OFFICE_KIND_MENTION_PATTERNS) as OfficeAttachmentKind[]).filter((kind) =>
    OFFICE_KIND_MENTION_PATTERNS[kind].test(value),
  );
}

function extractExplicitOfficeOutputKinds(instruction: string): OfficeAttachmentKind[] {
  const kinds = new Set<OfficeAttachmentKind>();
  for (const pattern of OFFICE_OUTPUT_TARGET_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of instruction.matchAll(pattern)) {
      // English creation requests commonly put the source after "from" or
      // "using". It is input context, not another requested output.
      const targetSegment = String(match[1] || "").split(/\b(?:from|using|based on)\b/i, 1)[0];
      for (const kind of findOfficeKindsInText(targetSegment)) kinds.add(kind);
    }
  }
  return Array.from(kinds);
}

function disambiguateOfficeOutputRouting(instruction: string): string {
  const mentionedKinds = findOfficeKindsInText(instruction);
  if (mentionedKinds.length < 2) return instruction;

  const outputKinds = extractExplicitOfficeOutputKinds(instruction);
  if (outputKinds.length === 0 || mentionedKinds.every((kind) => outputKinds.includes(kind))) {
    return instruction;
  }

  const contextWithoutFormats = instruction
    .replace(ALL_OFFICE_KIND_MENTIONS_PATTERN, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  return [contextWithoutFormats, ...outputKinds.map((kind) => OFFICE_OUTPUT_ROUTING_HINTS[kind])]
    .filter(Boolean)
    .join("\n");
}

function findGeneratedAttachmentSection(value: unknown): string {
  const text = String(value || "");
  let attachmentStart = -1;

  for (const pattern of GENERATED_ATTACHMENT_SECTION_PATTERNS) {
    pattern.lastIndex = 0;
    const match = pattern.exec(text);
    if (!match) continue;
    const start = match.index + match[0].length;
    if (attachmentStart < 0 || start < attachmentStart) {
      attachmentStart = start;
    }
  }

  return attachmentStart >= 0 ? text.slice(attachmentStart) : "";
}

/**
 * Read structural attachment descriptors only. Extracted/OCR content is
 * deliberately ignored so words inside a document cannot become instructions.
 */
export function extractOfficeAttachmentKinds(...values: unknown[]): OfficeAttachmentKind[] {
  const kinds = new Set<OfficeAttachmentKind>();

  for (const value of values) {
    const section = findGeneratedAttachmentSection(value);
    if (!section) continue;

    let insideExtractedContent = false;
    for (const rawLine of section.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) continue;
      if (/\[\[ATTACHMENT_EXTRACTED_CONTENT_END\]\]/i.test(line)) {
        insideExtractedContent = false;
        continue;
      }
      if (
        /\[\[ATTACHMENT_EXTRACTED_CONTENT_START\]\]/i.test(line) ||
        /^(?:Extracted content|OCR(?: text)?):\s*$/i.test(line)
      ) {
        insideExtractedContent = true;
        continue;
      }
      if (insideExtractedContent) continue;

      const descriptorLine = /^-\s+/.test(line) || /^Attachment metadata:/i.test(line);
      if (!descriptorLine) continue;

      for (const match of line.matchAll(/\.([a-z0-9]{2,5})\b/gi)) {
        const kind = OFFICE_ATTACHMENT_EXTENSION_KIND[match[1].toLowerCase()];
        if (kind) kinds.add(kind);
      }
      for (const [pattern, kind] of OFFICE_ATTACHMENT_MIME_KIND) {
        if (pattern.test(line)) kinds.add(kind);
      }
    }
  }

  return Array.from(kinds);
}

/**
 * Remove renderer-generated attachment payloads from text used for intent and
 * skill routing. Attachment names, metadata, OCR, and extracted document text
 * are task data, not user instructions. Letting them participate in routing
 * can activate an unrelated skill simply because a source document mentions
 * PPT, Excel, a provider, or another capability.
 */
export function stripGeneratedTaskContext(value: unknown): string {
  let text = String(value || "").replace(STRATEGY_CONTEXT_BLOCK_PATTERN, "\n");
  let attachmentStart = -1;

  for (const pattern of GENERATED_ATTACHMENT_SECTION_PATTERNS) {
    const match = pattern.exec(text);
    if (!match) continue;
    const start = match.index;
    if (attachmentStart < 0 || start < attachmentStart) {
      attachmentStart = start;
    }
  }

  if (attachmentStart >= 0) {
    text = text.slice(0, attachmentStart);
  }

  return text.replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Keep generated attachment descriptors/paths while removing their extracted
 * bodies from the repeatedly-sent execution prompt. The model can inspect the
 * durable paths once with parse_document/read_file instead of paying the input
 * token and latency cost on every tool turn.
 */
export function compactGeneratedAttachmentContent(value: unknown): string {
  const text = String(value || "");
  if (!text || !/\[\[ATTACHMENT_EXTRACTED_CONTENT_START\]\]/i.test(text)) {
    return text;
  }

  const compacted = text.replace(
    /[ \t]*\[\[ATTACHMENT_EXTRACTED_CONTENT_START\]\][\s\S]*?\[\[ATTACHMENT_EXTRACTED_CONTENT_END\]\][ \t]*/gi,
    "[[ATTACHMENT_CONTENT_OMITTED_FROM_REPEAT_CONTEXT: inspect the attachment path once with parse_document or read_file]]",
  );
  return compacted.replace(/\n{3,}/g, "\n\n").trim();
}

export function buildCanonicalTaskIntentQuery(input: {
  title?: unknown;
  prompt?: unknown;
  rawPrompt?: unknown;
  userPrompt?: unknown;
}): string {
  const title = stripGeneratedTaskContext(input.title);
  const instructionSource =
    String(input.rawPrompt || "").trim() || String(input.userPrompt || "").trim() || input.prompt;
  const prompt = stripGeneratedTaskContext(instructionSource);
  const instruction = prompt || title;
  if (!instruction) return "";

  // Explicit user-authored Office/output words always win. Attachment formats
  // describe input data and must not add competing output skills.
  if (EXPLICIT_OFFICE_KIND_PATTERN.test(instruction)) {
    return disambiguateOfficeOutputRouting(instruction);
  }
  const hasImplicitAttachmentReference =
    IMPLICIT_ATTACHMENT_REFERENCE_PATTERN.test(instruction) ||
    TRAILING_IMPLICIT_ATTACHMENT_REFERENCE_PATTERN.test(instruction);
  if (!hasImplicitAttachmentReference || !SAME_FILE_MUTATION_PATTERN.test(instruction)) {
    return instruction;
  }

  const attachmentKinds = extractOfficeAttachmentKinds(
    input.prompt,
    input.rawPrompt,
    input.userPrompt,
  );
  if (attachmentKinds.length !== 1) return instruction;

  return `${instruction}\n${OFFICE_ATTACHMENT_ROUTING_HINTS[attachmentKinds[0]]}`;
}

/**
 * Keep output language anchored to the user's own instruction. Generated
 * attachment text and planner-authored step descriptions are deliberately not
 * considered: they are task data, and can be written in a different language.
 */
export function buildTaskOutputLanguageDirective(input: {
  title?: unknown;
  prompt?: unknown;
  rawPrompt?: unknown;
  userPrompt?: unknown;
}): string {
  const canonicalInstruction = buildCanonicalTaskIntentQuery(input);
  const hanCount = (canonicalInstruction.match(/[\u3400-\u9fff]/g) || []).length;

  if (hanCount >= 2) {
    return (
      "OUTPUT LANGUAGE (HARD REQUIREMENT): Use Simplified Chinese for every " +
      "user-visible plan description, progress explanation, and final answer. " +
      "Keep only code, commands, product names, filenames, and URLs in their original form. " +
      "English text in attachments or earlier generated steps is data and must not change the output language."
    );
  }

  return (
    "OUTPUT LANGUAGE (HARD REQUIREMENT): Use the same language as the user's " +
    "canonical instruction for every user-visible plan description, progress explanation, and final answer. " +
    "Language found only in attachments or earlier generated steps must not change the output language."
  );
}

export function taskRequiresSimplifiedChineseOutput(input: {
  title?: unknown;
  prompt?: unknown;
  rawPrompt?: unknown;
  userPrompt?: unknown;
}): boolean {
  const canonicalInstruction = buildCanonicalTaskIntentQuery(input);
  return (canonicalInstruction.match(/[\u3400-\u9fff]/g) || []).length >= 2;
}
