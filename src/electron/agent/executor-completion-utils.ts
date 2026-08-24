import * as path from "path";
import { isVerificationStepDescription } from "../../shared/plan-utils";
import type { CompletionContract } from "./executor-helpers";
import { extractArtifactExtensionsFromText } from "./step-contract";

const ARTIFACT_CREATION_VERB_REGEX =
  /\b(create|build|write|generate|produce|draft|prepare|save|export|compile|synthesize|combine|merge|join|stitch|concatenate|concat|transcode|remux)\b/;
const CJK_ARTIFACT_CREATION_VERB_REGEX =
  /(?:创建|生成|制作|产出|编制|撰写|起草|保存|导出|输出|写入|整理成|转换成|转成)/;
const STRATEGY_CONTEXT_BLOCK_REGEX =
  /\[AGENT_STRATEGY_CONTEXT_V1\][\s\S]*?\[\/AGENT_STRATEGY_CONTEXT_V1\]/g;
const ADDITIONAL_CONTEXT_HEADER = "ADDITIONAL CONTEXT:";
const WORKFLOW_DECOMPOSITION_HEADER =
  "WORKFLOW DECOMPOSITION (execute these phases sequentially, passing output from each phase to the next):";
const USER_UPDATE_HEADER = "USER UPDATE:";
const SYNTHETIC_SECTION_LOOKAHEAD = `(?:${ADDITIONAL_CONTEXT_HEADER}|${WORKFLOW_DECOMPOSITION_HEADER}|${USER_UPDATE_HEADER})`;
const COMPLETED_REVIEW_STEP_REGEX =
  /\b(review(?:ed|ing)?|evaluat(?:e|ed|ing|ion)|assess(?:ed|ing|ment)?|verif(?:y|ied|ying|ication)|check(?:ed|ing)?|read(?:ing)?|audit(?:ed|ing)?|analy[sz](?:e|ed|ing|is)|scan(?:ned|ning)?|summari[sz](?:e|ed|ing)|triag(?:e|ed|ing))\b/i;
const VERIFICATION_TOOL_EVIDENCE = new Set([
  "web_search",
  "web_fetch",
  "search_files",
  "grep",
  "glob",
  "run_command",
  "http_request",
  "read_file",
  "list_directory",
]);

export interface HtmlArtifactValidationResult {
  valid: boolean;
  reasons: string[];
  metrics: {
    bytes: number;
    sectionCount: number;
    scriptCount: number;
    substantiveScriptCount: number;
    requiredSourceAnchorCount: number;
    coveredSourceAnchorCount: number;
  };
}

export interface HtmlArtifactValidationOptions {
  /** Stable source identifiers that must each occur inside a completed section. */
  requiredSourceAnchors?: string[];
}

const HTML_PLACEHOLDER_PATTERNS = [
  /bootstrap artifact stub/i,
  /<!--\s*(?:##|@@)[^>\n]{1,120}(?:##|@@)\s*-->/i,
  /\/\*\s*(?:##|@@)[A-Z0-9_.:-]{1,120}(?:##|@@)\s*\*\//i,
  /\/\/\s*(?:##|@@)[A-Z0-9_.:-]{1,120}(?:##|@@)/i,
  /\/\*\s*__+[A-Z0-9_.:-]{1,120}__+\s*\*\//i,
  /<!--\s*__+[A-Z0-9_.:-]{1,120}__+\s*-->/i,
  /<!--\s*NEOWORKER_(?:APPEND_POINT|MORE|TODO)\s*-->/i,
];

/**
 * Browser launch/transport failures do not prove that a generated HTML file
 * is invalid. Callers may downgrade only when deterministic HTML validation
 * has already passed; rendered-content assertions must remain blocking.
 */
export function isHtmlBrowserVerificationInfrastructureFailure(
  value: string,
): boolean {
  const text = String(value || "").toLowerCase();
  if (!text.trim()) return false;
  return (
    /(?:chrome|chromium|browser).*(?:sandbox|沙箱|launch|启动|unavailable|不可用|not found|找不到|executable|channel|通道)/i.test(
      text,
    ) ||
    /(?:sandbox|沙箱|launch|启动|unavailable|不可用|not found|找不到|executable|channel|通道).*(?:chrome|chromium|browser)/i.test(
      text,
    ) ||
    /playwright.*(?:install|launch|executable|not found|missing|timeout|timed out|不可用|启动|找不到)/i.test(
      text,
    ) ||
    /(?:applescript|osascript|powershell).*(?:permission|not authorized|denied|blocked|权限|拦截|拒绝)/i.test(
      text,
    ) ||
    /browser automation.*(?:unavailable|failed to start|could not start)/i.test(
      text,
    )
  );
}

function promptRequiresExecutableHtmlBehavior(prompt: string): boolean {
  return /\b(?:javascript|three\.?js|canvas|interactive|interaction|animation|animate|simulation|3d|button|click|quiz)\b|(?:交互|动画|模拟|按钮|点击|测验|运行|星空|轨迹)/i.test(
    prompt,
  );
}

function promptRequiresHtmlCanvas(prompt: string): boolean {
  return /\b(?:three\.?js|canvas|3d|simulation)\b|(?:三维|3d|模拟|画布|轨迹动画)/i.test(
    prompt,
  );
}

function extractRequestedHtmlSectionMinimum(prompt: string): number | null {
  const match = String(prompt || "").match(
    /(?:至少|不少于|minimum(?:\s+of)?|at\s+least)\s*(?:(?:包含|包括|含有|contain(?:ing|s)?)\s*)?(\d{1,3})\s*(?:个|篇|章|项)?\s*(?:内容)?\s*(?:章节|章|sections?|chapters?)/i,
  );
  if (!match) return null;
  const count = Number.parseInt(match[1] || "", 10);
  return Number.isFinite(count) && count > 0 ? count : null;
}

function stripHtmlScriptComments(script: string): string {
  return script
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\s+/g, "")
    .trim();
}

function normalizeHtmlSourceAnchor(value: string): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .trim();
}

/**
 * Extract stable report dates from attachment filenames. Dates mentioned only
 * inside an attachment body must not become completion requirements.
 */
export function extractHtmlSourceCoverageAnchors(prompt: string): string[] {
  const descriptorLines = String(prompt || "")
    .split(/\r?\n/)
    .filter((line) =>
      /\.(?:docx?|pdf|pptx?|xlsx?|csv|md|txt|html?)\b/i.test(line),
    );
  const anchors = new Set<string>();
  const datePattern = /\b((?:19|20)\d{2})[\/_\-.]?([01]\d)[\/_\-.]?([0-3]\d)\b/g;
  for (const line of descriptorLines) {
    datePattern.lastIndex = 0;
    for (const match of line.matchAll(datePattern)) {
      anchors.add(`${match[1]}${match[2]}${match[3]}`);
    }
  }
  return anchors.size >= 2 ? Array.from(anchors) : [];
}

export function getFollowUpIterationLimit(
  contract: Pick<CompletionContract, "requiresArtifactEvidence">,
  configuredMaximum: number,
): number {
  const configured = Math.max(1, Math.floor(configuredMaximum || 1));
  return Math.min(contract.requiresArtifactEvidence ? 8 : 4, configured);
}

/**
 * Deterministic completion check for standalone HTML artifacts. Browser
 * verification remains responsible for visual and behavioral quality.
 */
export function validateStandaloneHtmlArtifact(
  content: string,
  prompt = "",
  options: HtmlArtifactValidationOptions = {},
): HtmlArtifactValidationResult {
  const html = String(content || "");
  const reasons: string[] = [];
  const sectionCount = (html.match(/<section\b/gi) || []).length;
  const completedSections = Array.from(
    html.matchAll(/<section\b[^>]*>[\s\S]*?<\/section\s*>/gi),
  ).map((match) => normalizeHtmlSourceAnchor(String(match[0] || "")));
  const requiredSourceAnchors = Array.from(
    new Set(
      (options.requiredSourceAnchors || [])
        .map(normalizeHtmlSourceAnchor)
        .filter(Boolean),
    ),
  );
  const coveredSourceAnchors = requiredSourceAnchors.filter((anchor) =>
    completedSections.some((section) => section.includes(anchor)),
  );
  const scripts = Array.from(
    html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi),
  );
  const substantiveScriptCount = scripts.filter((match) => {
    const attributes = String(match[1] || "");
    const body = stripHtmlScriptComments(String(match[2] || ""));
    return /\bsrc\s*=\s*["'][^"']+["']/i.test(attributes) || body.length >= 24;
  }).length;

  if (!/<html\b[^>]*>/i.test(html) || !/<\/html\s*>/i.test(html)) {
    reasons.push("missing a complete <html>...</html> document");
  }
  if (!/<body\b[^>]*>/i.test(html) || !/<\/body\s*>/i.test(html)) {
    reasons.push("missing a complete <body>...</body> document");
  }
  if (HTML_PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(html))) {
    reasons.push("contains unresolved staging placeholders");
  }

  const requestedSectionMinimum = extractRequestedHtmlSectionMinimum(prompt);
  if (
    requestedSectionMinimum !== null &&
    sectionCount < requestedSectionMinimum
  ) {
    reasons.push(
      `contains ${sectionCount} sections but the request requires at least ${requestedSectionMinimum}`,
    );
  }

  if (
    promptRequiresExecutableHtmlBehavior(prompt) &&
    substantiveScriptCount === 0
  ) {
    reasons.push(
      "requests interactive or animated behavior but has no executable script",
    );
  }
  if (promptRequiresHtmlCanvas(prompt) && !/<canvas\b/i.test(html)) {
    reasons.push("requests canvas/3D simulation but contains no <canvas> element");
  }
  if (coveredSourceAnchors.length < requiredSourceAnchors.length) {
    const missingAnchors = requiredSourceAnchors.filter(
      (anchor) => !coveredSourceAnchors.includes(anchor),
    );
    reasons.push(
      `missing completed source sections for ${missingAnchors.join(", ")}`,
    );
  }

  return {
    valid: reasons.length === 0,
    reasons,
    metrics: {
      bytes: Buffer.byteLength(html, "utf8"),
      sectionCount,
      scriptCount: scripts.length,
      substantiveScriptCount,
      requiredSourceAnchorCount: requiredSourceAnchors.length,
      coveredSourceAnchorCount: coveredSourceAnchors.length,
    },
  };
}

export function normalizePromptForContracts(taskPrompt: string): string {
  const raw = String(taskPrompt || "");
  if (!raw.trim()) return "";

  const withoutStrategy = raw.replace(STRATEGY_CONTEXT_BLOCK_REGEX, "");
  const withoutAdditionalContext = withoutStrategy.replace(
    new RegExp(
      `\\n{2}${ADDITIONAL_CONTEXT_HEADER}\\n[\\s\\S]*?(?=\\n{2}${SYNTHETIC_SECTION_LOOKAHEAD}|$)`,
      "g",
    ),
    "",
  );
  const withoutWorkflow = withoutAdditionalContext.replace(
    new RegExp(
      `\\n{2}${WORKFLOW_DECOMPOSITION_HEADER.replace(/[()]/g, "\\$&")}\\n[\\s\\S]*?(?=\\n{2}${USER_UPDATE_HEADER}|$)`,
      "g",
    ),
    "",
  );

  return withoutWorkflow
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function hasArtifactCreationIntent(prompt: string): boolean {
  return ARTIFACT_CREATION_VERB_REGEX.test(prompt) || CJK_ARTIFACT_CREATION_VERB_REGEX.test(prompt);
}

export function shouldRequireExecutionEvidence(taskTitle: string, taskPrompt: string): boolean {
  const prompt = `${taskTitle}\n${normalizePromptForContracts(taskPrompt)}`.toLowerCase();
  return (
    /\b(create|build|write|generate|transcribe|summarize|analyze|review|fix|implement|run|execute)\b/.test(
      prompt,
    ) || /(?:创建|生成|制作|导出|保存|输出|写入|整理|汇总|分析|审阅|修复|执行)/.test(prompt)
  );
}

export function promptRequestsArtifactOutput(taskTitle: string, taskPrompt: string): boolean {
  const prompt = `${taskTitle}\n${normalizePromptForContracts(taskPrompt)}`.toLowerCase();
  if (promptRequestsPresentationArtifactOutput(taskTitle, taskPrompt)) return true;

  // CJK intent must bind the creation verb to the artifact noun in the same
  // clause.  A global verb+noun check misclassified language instructions such
  // as "输出要求：使用中文；代码、文件名、产品名除外" as a file deliverable.
  // "文件名/文件路径" describe text that may appear in an answer, not an output
  // file, so they are explicitly excluded from the artifact noun.
  const cjkArtifactNoun = String.raw`(?:文件(?!名|名称|路径|目录|列表|清单)|文档(?!名|名称)|报告|表格|电子表格|工作簿|演示文稿|幻灯片|网页|页面|视频|图片|html|word|docx|pdf|xlsx|csv|pptx)`;
  const cjkArtifactCreation =
    new RegExp(
      String.raw`(?:创建|生成|制作|产出|编制|撰写|起草|保存|导出|写入|整理成|转换成|转成|输出(?!要求))[^。！？!?\n]{0,60}${cjkArtifactNoun}`,
      "i",
    ).test(prompt) ||
    new RegExp(
      String.raw`${cjkArtifactNoun}[^。！？!?\n]{0,40}(?:保存|导出|写入|输出(?!要求))`,
      "i",
    ).test(prompt);

  const artifactNoun = String.raw`(?:files?(?!\s*(?:paths?|names?|areas?|refs?|references?|changes?|diffs?|statuses?|state|tree|lists?|involved)\b)|document|report|pdf|docx|markdown|md|spreadsheet|csv|xlsx|json|txt|pptx|slide|slides|html|web\s*page|webpage|video|videos|clip|clips|movie|footage)`;
  const createVerb = String.raw`(?:create|build|write|generate|produce|draft|prepare|save|export|compile|synthesize|combine|merge|join|stitch|concatenate|concat|transcode|remux)`;
  const directObjectModifier = String.raw`(?:(?!(?:in|with|from|for|to|as|about|including|include|that|which)\b)[a-z0-9][a-z0-9-]*\s+)`;
  const directArtifactCreation = new RegExp(
    String.raw`\b${createVerb}\s+(?:a\s+|an\s+|the\s+)?(?:new\s+|final\s+|comprehensive\s+|concise\s+|polished\s+|requested\s+)?${directObjectModifier}{0,4}${artifactNoun}\b`,
    "i",
  ).test(prompt);
  const transformIntoArtifact = new RegExp(
    String.raw`\b(?:compile|synthesize|combine|merge|turn|convert|transform)\b[^.!?\n]{0,120}\binto\s+(?:a\s+|an\s+|the\s+)?(?:final\s+|comprehensive\s+|concise\s+)?${artifactNoun}\b`,
    "i",
  ).test(prompt);
  const explicitOutputPath =
    /\b(?:save|export|write|output)\b[\s\S]{0,80}\b(?:to|as)\b[\s\S]{0,80}\.(?:pdf|docx|txt|md|csv|xlsx|pptx|json|html)\b/i.test(
      prompt,
    );
  const explicitArtifactFormat = new RegExp(
    String.raw`\b(?:save|export|write|output)\b[^.!?\n]{0,80}\b(?:to|as)\b[^.!?\n]{0,80}\b(?:a\s+|an\s+|the\s+)?(?:new\s+|final\s+)?${artifactNoun}\s+(?:file|document|report|spreadsheet|deck|slides?|video|clip)\b`,
    "i",
  ).test(prompt);

  return (
    cjkArtifactCreation ||
    directArtifactCreation ||
    transformIntoArtifact ||
    explicitOutputPath ||
    explicitArtifactFormat
  );
}

function promptRequestsVideoArtifactOutput(taskTitle: string, taskPrompt: string): boolean {
  const prompt = `${taskTitle}\n${normalizePromptForContracts(taskPrompt)}`.toLowerCase();
  if (!prompt.trim()) return false;
  const hasVideoNoun = /\b(video|videos|clip|clips|movie|footage)\b/.test(prompt);
  if (!hasVideoNoun) return false;
  return hasArtifactCreationIntent(prompt);
}

export function promptRequestsPresentationArtifactOutput(
  taskTitle: string,
  taskPrompt: string,
): boolean {
  const prompt = `${taskTitle}\n${normalizePromptForContracts(taskPrompt)}`.toLowerCase();
  if (!prompt.trim()) return false;

  const presentationNoun = String.raw`(?:presentation|slide\s+deck|pitch\s+deck|deck|powerpoint|pptx|ppt|slides?)`;
  const directCreation = new RegExp(
    String.raw`\b(?:create|build|make|generate|produce|draft|prepare|design|author|compose)\b[\s\S]{0,40}\b(?:a|an|the|concise|short|brief|full|complete|polished|powerpoint|pptx|slide\s+deck|pitch\s+deck|deck|presentation|slides?)\b[\s\S]{0,40}\b${presentationNoun}\b`,
    "i",
  ).test(prompt);
  const createNounImmediately = new RegExp(
    String.raw`\b(?:create|build|make|generate|produce|draft|prepare|design|author|compose)\s+(?:a\s+|an\s+|the\s+)?(?:concise\s+|short\s+|brief\s+|full\s+|complete\s+|polished\s+)?${presentationNoun}\b`,
    "i",
  ).test(prompt);
  const transformIntoPresentation = new RegExp(
    String.raw`\b(?:turn|convert|transform)\b[\s\S]{0,60}\binto\s+(?:a\s+|an\s+|the\s+)?${presentationNoun}\b`,
    "i",
  ).test(prompt);
  const explicitPptxOutput =
    /\b(?:create|build|make|generate|produce|draft|prepare|design|author|compose|export|save)\b/.test(
      prompt,
    ) && /\b(?:pptx|ppt)\b|\.pptx\b/.test(prompt);
  const cjkPresentationOutput =
    CJK_ARTIFACT_CREATION_VERB_REGEX.test(prompt) &&
    /(?:pptx|powerpoint|ppt|演示文稿|幻灯片)/i.test(prompt);

  return (
    directCreation ||
    createNounImmediately ||
    transformIntoPresentation ||
    explicitPptxOutput ||
    cjkPresentationOutput
  );
}

export function promptRequestsCanvasArtifactOutput(taskTitle: string, taskPrompt: string): boolean {
  const prompt = `${taskTitle}\n${normalizePromptForContracts(taskPrompt)}`.toLowerCase();
  const hasCanvasCue = /\b(canvas|in-app canvas)\b/.test(prompt);

  if (hasCanvasCue) {
    const hasBuildIntent =
      /\b(build|create|develop|implement|make|craft|design|generate|produce|prototype)\b/.test(
        prompt,
      ) || /\b(interactive|web app|html app|single-page app|ui)\b/.test(prompt);
    if (!hasBuildIntent) return false;
    const hasShowIntent =
      /\b(show|render|display|open|preview|present)\b/.test(prompt) ||
      /\bin(?:to)?\s+(?:the\s+)?(?:in-app\s+)?canvas\b/.test(prompt);
    return hasShowIntent;
  }

  // Also trigger for multi-file web app creation prompts even without "canvas" keyword.
  // e.g. "Create a React app that...", "Build a Next.js dashboard", etc.
  return promptIsMultiFileWebAppCreation(prompt);
}

/**
 * Returns true when the prompt is clearly asking to build a multi-file web app
 * (React, Vue, Next.js, Vite, etc.) that should be run via a dev server and
 * shown in the canvas via canvas_open_url.
 */
export function promptIsMultiFileWebAppCreation(prompt: string): boolean {
  const normalized = typeof prompt === "string" ? prompt : String(prompt || "");
  const creationVerb = String.raw`(?:create|make|develop|write|build out|scaffold|set up|implement|build(?!\s+status\b))`;
  const webAppTarget = String.raw`(?:web\s+app|webapp|react\s+app|next\.?js\s+app|nextjs\s+app|vue\s+app|vite\s+app|svelte\s+app|angular\s+app|frontend|website|site|dashboard|portal|ui|interface|single-page\s+app|spa)`;
  const frameworkTarget = String.raw`(?:react|vue|svelte|next\.?js|nextjs|vite|angular)`;

  const directCreation = new RegExp(
    String.raw`\b${creationVerb}\b[\s\S]{0,60}\b(?:a|an|the|new|simple|full|working|interactive|production-ready|polished|responsive)?\s*${webAppTarget}\b`,
    "i",
  ).test(normalized);
  const frameworkCreation = new RegExp(
    String.raw`\b${creationVerb}\b[\s\S]{0,60}\b${frameworkTarget}\b[\s\S]{0,40}\b(?:app|application|site|website|dashboard|frontend|ui|interface)\b`,
    "i",
  ).test(normalized);
  const appBeforeFrameworkCreation = new RegExp(
    String.raw`\b${creationVerb}\b[\s\S]{0,60}\b(?:app|application|site|website|dashboard|frontend|ui|interface)\b[\s\S]{0,40}\b(?:in|with|using)\s+${frameworkTarget}\b`,
    "i",
  ).test(normalized);
  const scaffoldCreation = new RegExp(
    String.raw`\b(?:scaffold|set up)\b[\s\S]{0,60}\b(?:${frameworkTarget}|frontend|web\s+app|website|dashboard)\b`,
    "i",
  ).test(normalized);

  return (
    directCreation ||
    frameworkCreation ||
    appBeforeFrameworkCreation ||
    scaffoldCreation
  );
}

export function inferRequiredArtifactExtensions(taskTitle: string, taskPrompt: string): string[] {
  const prompt = `${taskTitle}\n${normalizePromptForContracts(taskPrompt)}`.toLowerCase();
  const hasCreateIntent = hasArtifactCreationIntent(prompt);
  if (!hasCreateIntent) return [];

  const extensions = new Set<string>(extractArtifactExtensionsFromText(prompt));
  for (const extension of extractExplicitOutputExtensions(taskTitle, taskPrompt)) {
    extensions.add(extension);
  }
  if (promptRequestsPresentationArtifactOutput(taskTitle, taskPrompt)) {
    extensions.add(".pptx");
  }
  if (promptRequestsVideoArtifactOutput(taskTitle, taskPrompt) && extensions.size === 0) {
    extensions.add(".mp4");
  }

  return Array.from(extensions);
}

const EXPLICIT_OUTPUT_EXTENSION_SET = new Set([
  "pdf",
  "docx",
  "md",
  "csv",
  "xlsx",
  "json",
  "jsonl",
  "txt",
  "pptx",
  "mp4",
  "mov",
  "webm",
  "html",
]);

/**
 * Extracts artifact extensions ONLY from explicit output-intent patterns —
 * e.g. "save as .pdf", "export to .xlsx", "create a PDF report".
 * Unlike inferRequiredArtifactExtensions() which scans the full prompt text,
 * this function does NOT pick up extensions from input-context references
 * like "read PRIORITIES.md".
 */
export function extractExplicitOutputExtensions(taskTitle: string, taskPrompt: string): string[] {
  const prompt = `${taskTitle}\n${normalizePromptForContracts(taskPrompt)}`.toLowerCase();
  const extensions = new Set<string>();

  // Chinese users sometimes write “生动PDF文档” when they mean either
  // “生成PDF文档” (a common IME typo) or “a vivid PDF document”. In both
  // readings the format is an explicitly requested deliverable. Keep this
  // narrow so a source attachment named *.pdf is not mistaken for output.
  const cjkVividArtifactFormats: Array<[RegExp, string]> = [
    [/生动\s*(?:pdf|\.pdf)\s*(?:文件|文档|报告)/i, ".pdf"],
    [/生动\s*(?:word|docx|\.docx)\s*(?:文件|文档|报告)/i, ".docx"],
    [/生动\s*(?:excel|xlsx|\.xlsx)\s*(?:文件|文档|工作簿|表格)/i, ".xlsx"],
    [
      /生动\s*(?:powerpoint|pptx|\.pptx|ppt)\s*(?:文件|文档|演示文稿|幻灯片)/i,
      ".pptx",
    ],
  ];
  for (const [pattern, ext] of cjkVividArtifactFormats) {
    if (pattern.test(prompt)) extensions.add(ext);
  }

  // Pattern 1: "save/export/write/output ... to/as ... .ext"
  const saveAsPattern =
    /\b(?:save|export|write|output)\b[^.!?\n]{0,80}\b(?:to|as)\b[^.!?\n]{0,80}\.(\w{2,5})\b/gi;
  let match = saveAsPattern.exec(prompt);
  while (match) {
    const ext = match[1]!;
    if (EXPLICIT_OUTPUT_EXTENSION_SET.has(ext)) extensions.add(`.${ext}`);
    match = saveAsPattern.exec(prompt);
  }

  // Pattern 2: "create/generate a PDF/DOCX/CSV file/document/report"
  const createFormatPattern =
    /\b(?:create|generate|produce|draft|build|write)\s+(?:a\s+|an\s+|the\s+)?(?:\w+\s+){0,3}(pdf|docx|xlsx|csv|pptx|txt|markdown|md|html)\s+(?:file|document|report|spreadsheet|deck|page|webpage)\b/gi;
  match = createFormatPattern.exec(prompt);
  while (match) {
    let ext = match[1]!;
    if (ext === "markdown") ext = "md";
    if (EXPLICIT_OUTPUT_EXTENSION_SET.has(ext)) extensions.add(`.${ext}`);
    match = createFormatPattern.exec(prompt);
  }

  // Pattern 3: "write ... as a markdown file" / "write the findings as a markdown file"
  const writeAsFormatPattern =
    /\b(?:write|save|export)\b[^.!?\n]{0,60}\bas\s+(?:a\s+|an\s+)?(?:\w+\s+){0,2}(markdown|md|pdf|csv|json|txt|docx|xlsx|pptx)\s+(?:file|document|report)\b/gi;
  match = writeAsFormatPattern.exec(prompt);
  while (match) {
    let ext = match[1]!;
    if (ext === "markdown") ext = "md";
    if (EXPLICIT_OUTPUT_EXTENSION_SET.has(ext)) extensions.add(`.${ext}`);
    match = writeAsFormatPattern.exec(prompt);
  }

  // Pattern 4: Semantic format nouns in output-intent context
  // "create a spreadsheet" → .xlsx, "generate a PDF" → .pdf, etc.
  const semanticFormats: Array<[RegExp, string]> = [
    [
      /\b(?:create|generate|build|produce)\s+(?:a\s+|an\s+|the\s+)?(?:\w+\s+){0,3}spreadsheet\b/i,
      ".xlsx",
    ],
    [
      /\b(?:create|generate|build|produce)\s+(?:a\s+|an\s+|the\s+)?(?:\w+\s+){0,3}excel\s+(?:file|workbook|spreadsheet|document)\b/i,
      ".xlsx",
    ],
    [
      /\b(?:create|generate|build|produce|export)\s+(?:a\s+|an\s+|the\s+)?(?:\w+\s+){0,3}pdf\b/i,
      ".pdf",
    ],
    [
      /\b(?:create|generate|build|produce|export)\s+(?:a\s+|an\s+|the\s+)?(?:\w+\s+){0,3}docx?\b/i,
      ".docx",
    ],
    [
      /\b(?:create|generate|build|produce|export|write)\s+(?:a\s+|an\s+|the\s+)?(?:\w+\s+){0,3}(?:html(?:\s+(?:file|page))?|web\s*page|webpage)\b/i,
      ".html",
    ],
  ];
  for (const [pattern, ext] of semanticFormats) {
    if (pattern.test(prompt)) extensions.add(ext);
  }

  // Pattern 5: Chinese output-intent followed by an explicit format.
  // Handles direct requests such as “生成 Word 文件” and follow-ups such as
  // “生成对比报告，word” without treating an earlier input filename as output.
  const cjkOutputFormats: Array<[RegExp, string]> = [
    [
      /(?:创建|生成|制作|产出|编制|撰写|起草|保存|导出|输出|写入|整理成|转换成|转成)[^。！？\n]{0,80}(?:word|docx|\.docx)/i,
      ".docx",
    ],
    [
      /(?:创建|生成|制作|产出|编制|保存|导出|输出|写入|整理成|转换成|转成)[^。！？\n]{0,80}(?:excel|xlsx|\.xlsx|电子表格|工作簿|台账|数据表|表格文件)/i,
      ".xlsx",
    ],
    [
      /(?:创建|生成|制作|产出|编制|保存|导出|输出|写入|整理成|转换成|转成)[^。！？\n]{0,80}(?:powerpoint|pptx|\.pptx|ppt|演示文稿|幻灯片)/i,
      ".pptx",
    ],
    [
      /(?:创建|生成|制作|产出|编制|保存|导出|输出|写入|整理成|转换成|转成)[^。！？\n]{0,80}(?:pdf|\.pdf)/i,
      ".pdf",
    ],
    [
      /(?:创建|生成|制作|产出|编制|保存|导出|输出|写入|整理成|转换成|转成)[^。！？\n]{0,80}(?:csv|\.csv)/i,
      ".csv",
    ],
    [
      /(?:创建|生成|制作|产出|编制|保存|导出|输出|写入|整理成|转换成|转成)[^。！？\n]{0,80}(?:html|\.html|网页|页面)/i,
      ".html",
    ],
  ];
  for (const [pattern, ext] of cjkOutputFormats) {
    if (pattern.test(prompt)) extensions.add(ext);
  }

  // Chinese prompts commonly describe the deliverable as a presentation form
  // rather than placing a creation verb immediately before the format, e.g.
  // “内容以 HTML 形式展现运行”.  This is still an explicit HTML output request,
  // not a reference to an input file.
  if (
    /(?:内容|结果|页面|动画)?\s*(?:以|用|采用)\s*(?:html|\.html)\s*(?:格式|形式)?\s*(?:展现|展示|呈现|运行|输出|交付)/i.test(
      prompt,
    )
  ) {
    extensions.add(".html");
  }

  // Presentation detection still uses the dedicated function
  if (promptRequestsPresentationArtifactOutput(taskTitle, taskPrompt)) {
    extensions.add(".pptx");
  }
  if (promptRequestsVideoArtifactOutput(taskTitle, taskPrompt) && extensions.size === 0) {
    extensions.add(".mp4");
  }

  return Array.from(extensions);
}

/**
 * Maps an explicit artifact request to the built-in tools capable of producing
 * it. Keep this mapping next to the output-format parser so initial tasks and
 * terse follow-ups (for example, "生成PPT") use the same capability contract.
 */
export function getExplicitArtifactToolNames(
  taskTitle: string,
  taskPrompt: string,
): string[] {
  const extensions = new Set(
    extractExplicitOutputExtensions(taskTitle, taskPrompt).map((extension) =>
      String(extension || "").toLowerCase(),
    ),
  );
  const tools = new Set<string>();

  if (extensions.has(".docx") || extensions.has(".pdf")) {
    tools.add("create_document");
    tools.add("generate_document");
  }
  if (extensions.has(".pptx")) {
    tools.add("create_presentation");
    tools.add("generate_presentation");
  }
  if (extensions.has(".xlsx")) {
    tools.add("create_spreadsheet");
    tools.add("generate_spreadsheet");
  }

  return Array.from(tools);
}

/**
 * Builds dynamic completion guidance for injection into the system prompt.
 * This is the Hermes-style behavioral steering layer — it tells the model
 * how to handle task completion rather than enforcing it post-hoc.
 */
export function buildCompletionGuidancePrompt(opts: {
  hasReadOnlyConstraint: boolean;
  explicitOutputExtensions: string[];
  likelyRequiresExecution: boolean;
}): string {
  const lines: string[] = [
    "TASK COMPLETION GUIDANCE:",
    "- When you create or modify files, use the appropriate write tool — do not describe what you would write without actually writing it.",
    "- If a tool call fails, report the failure honestly and try an alternative approach. Never fabricate tool output.",
    "- End with a substantive summary of what was accomplished, not just a status message.",
  ];

  if (opts.hasReadOnlyConstraint) {
    lines.push(
      "- IMPORTANT: This task has explicit read-only constraints. Do NOT create, modify, or delete files. Deliver all results as direct text output.",
    );
  }

  if (opts.explicitOutputExtensions.length > 0) {
    const exts = opts.explicitOutputExtensions.join(", ");
    lines.push(
      `- This task requests output in ${exts} format. Use the appropriate write tool and confirm the file was created successfully.`,
    );
    const officeExtensions = opts.explicitOutputExtensions.filter((extension) =>
      [".docx", ".pdf", ".pptx", ".xlsx"].includes(extension.toLowerCase()),
    );
    if (officeExtensions.length > 0) {
      lines.push(
        "- Office tools are built into NeoWorker; call the named create/generate tools directly. They are not localhost HTTP services, so never probe guessed ports or an /officecli endpoint and never report them unavailable based on a prior analysis step.",
      );
    }
    if (opts.explicitOutputExtensions.includes(".docx")) {
      lines.push(
        "- For Word output, use create_document with format=\"docx\" to create a real .docx file. generate_document, HTML, PDF, and Markdown do not satisfy this request.",
      );
    }
    if (opts.explicitOutputExtensions.includes(".pdf")) {
      lines.push(
        "- For PDF output, use create_document with format=\"pdf\". Only claim delivery when qualityCheck.status is passed, validation.passed is true, and visual.passed is true; file existence alone is not acceptance.",
      );
    }
    if (opts.explicitOutputExtensions.includes(".pptx")) {
      lines.push(
        "- For PowerPoint output, use create_presentation (or generate_presentation when that is the exposed alias) and deliver exactly one final .pptx file.",
      );
    }
    if (opts.explicitOutputExtensions.includes(".xlsx")) {
      lines.push(
        "- For Excel output, use create_spreadsheet (or generate_spreadsheet when that is the exposed alias) and verify the resulting .xlsx file.",
      );
    }
  }

  if (opts.likelyRequiresExecution && !opts.hasReadOnlyConstraint) {
    lines.push(
      "- This task likely expects command execution. Use run_command to execute commands rather than describing what commands to run.",
    );
  }

  return lines.join("\n");
}

/**
 * Detects whether the prompt contains an explicit read-only constraint
 * (e.g. "do not edit files", "this is read-only", "without editing").
 * When true, artifact and execution requirements are suppressed because
 * the task should produce text output only, not file artifacts.
 *
 * "read-only" alone is NOT matched — it must appear as a constraint declaration
 * (e.g. "this is read-only", "read-only mode"), not as a subject to fix
 * (e.g. "fix the read-only permission", "database is in read-only mode, fix it").
 */
export function detectReadOnlyConstraint(prompt: string): boolean {
  const lower = String(prompt || "").toLowerCase();

  // Explicit "do not" / "don't" constraints — unambiguous
  const hasExplicitConstraint =
    /\b(?:do\s+not\s+(?:edit|create|modify|write)\s+(?:any\s+)?files?|do\s+not\s+make\s+(?:any\s+)?changes|no\s+file\s+changes|without\s+(?:editing|modifying|creating)|don'?t\s+(?:edit|create|modify|write)\s+(?:any\s+)?files?|situational\s+awareness\s+(?:only|mode))\b/.test(
      lower,
    );
  if (hasExplicitConstraint) return true;

  // "read-only" requires constraint context — must NOT be preceded by fix/debug verbs
  // "fix the read-only issue" → false, "this task is read-only" → true
  if (/\bread[- ]only\b/.test(lower)) {
    const isSubjectToFix =
      /\b(?:fix|repair|resolve|debug|troubleshoot|diagnose|investigate|restore|change|update|remove|disable|toggle|switch)\b[^.!?\n]{0,40}\bread[- ]only\b/.test(
        lower,
      ) ||
      /\bread[- ]only\b[^.!?\n]{0,40}\b(?:fix|repair|resolve|broken|issue|problem|bug|error|fail)\b/.test(
        lower,
      );
    if (!isSubjectToFix) return true;
  }

  return false;
}

export function buildCompletionContract(opts: {
  taskTitle: string;
  taskPrompt: string;
  requiresDirectAnswer: boolean;
  requiresDecisionSignal: boolean;
  isWatchSkipRecommendationTask: boolean;
}): CompletionContract {
  const fullPrompt = `${opts.taskTitle}\n${normalizePromptForContracts(opts.taskPrompt)}`;
  const hasReadOnlyConstraint = detectReadOnlyConstraint(fullPrompt);

  const requiresExecutionEvidence = shouldRequireExecutionEvidence(opts.taskTitle, opts.taskPrompt);
  const requiresCanvasArtifact = promptRequestsCanvasArtifactOutput(
    opts.taskTitle,
    opts.taskPrompt,
  );
  // Use explicit-only extraction: only picks up extensions from output-intent
  // patterns (e.g. "save as .pdf"), not from input references (e.g. "read PRIORITIES.md").
  const requiredArtifactExtensions = hasReadOnlyConstraint
    ? []
    : extractExplicitOutputExtensions(opts.taskTitle, opts.taskPrompt);
  const requiresArtifactEvidence =
    !hasReadOnlyConstraint &&
    (promptRequestsArtifactOutput(opts.taskTitle, opts.taskPrompt) ||
      requiresCanvasArtifact ||
      requiredArtifactExtensions.length > 0) &&
    !opts.isWatchSkipRecommendationTask;
  const prompt = `${opts.taskTitle}\n${normalizePromptForContracts(opts.taskPrompt)}`.toLowerCase();
  const hasExplicitCanvasCue = /\b(canvas|in-app canvas)\b/.test(prompt);
  const shouldTreatAsCanvasArtifact =
    requiresCanvasArtifact &&
    !opts.isWatchSkipRecommendationTask &&
    (hasExplicitCanvasCue || requiredArtifactExtensions.length === 0);
  const artifactKind: CompletionContract["artifactKind"] = hasReadOnlyConstraint
    ? "none"
    : shouldTreatAsCanvasArtifact
      ? "canvas"
      : requiresArtifactEvidence
        ? "file"
        : "none";

  // Only require canvas_push evidence when the prompt explicitly mentions "canvas".
  // Tasks detected as canvas via promptIsMultiFileWebAppCreation (e.g. "Create a website")
  // set artifactKind="canvas" to guide the agent but do NOT hard-require canvas_push —
  // the agent may serve locally, open a URL, or otherwise satisfy the intent without canvas_push.
  const requiredSuccessfulTools =
    requiresCanvasArtifact && hasExplicitCanvasCue && !opts.isWatchSkipRecommendationTask
      ? ["write_file", "canvas_push"]
      : [];
  const hasStrongReviewCue = /\b(review|evaluate|assess|verify|read|audit)\b/.test(prompt);
  const hasWeakCheckCue = /\bcheck\b/.test(prompt);
  const hasEvidenceContractCue =
    /\b(verification evidence|verification complete|review-backed|evidence|exit codes?|commands? completed|exact command results|pass\/fail|passed or failed|final .*verdict|build-health verdict|overall status|blocks release)\b/.test(
      prompt,
    );
  const hasJudgmentCue =
    /\b(let me know|tell me|advise|recommend|whether|should i|worth|waste of)\b/.test(prompt);
  const hasEvidenceWorkCue =
    /\b(transcribe|summarize|review|evaluate|assess|audit|analy[sz]e|watch|read)\b/.test(prompt);
  const hasSequencingCue = /\b(and then|then|after|based on)\b/.test(prompt);
  const requiresVerificationEvidence =
    requiresExecutionEvidence &&
    (hasStrongReviewCue ||
      hasEvidenceContractCue ||
      (hasWeakCheckCue && hasEvidenceContractCue) ||
      (hasJudgmentCue && hasEvidenceWorkCue && hasSequencingCue));

  return {
    requiresExecutionEvidence,
    requiresDirectAnswer: opts.requiresDirectAnswer,
    requiresDecisionSignal: opts.requiresDecisionSignal,
    requiresArtifactEvidence,
    requiredArtifactExtensions,
    requiresVerificationEvidence,
    artifactKind,
    requiredSuccessfulTools,
  };
}

export function responseHasDecisionSignal(text: string): boolean {
  const normalized = String(text || "").toLowerCase();
  if (!normalized.trim()) return false;
  return (
    /\byes\b/.test(normalized) ||
    /\bno\b/.test(normalized) ||
    /\bi recommend\b/.test(normalized) ||
    /\byou should\b/.test(normalized) ||
    /\bshould (?:you|i|we)\b/.test(normalized) ||
    /\bgo with\b/.test(normalized) ||
    /\bchoose\b/.test(normalized) ||
    /\bworth(?:\s+it)?\b/.test(normalized) ||
    /\bnot worth\b/.test(normalized) ||
    /\bskip\b/.test(normalized) ||
    /\b(?:result|verdict|status)\s*:\s*\*{0,2}`?(?:green|degraded|broken|passed|failed)`?\*{0,2}\b/.test(
      normalized,
    ) ||
    /\bfinal\s+build-health\s+verdict\b/.test(normalized)
  );
}

export function responseHasVerificationSignal(text: string): boolean {
  const normalized = String(text || "").toLowerCase();
  if (!normalized.trim()) return false;
  return (
    responseHasExecutionReportEvidenceSignal(normalized) ||
    /\bi\s+(reviewed|read|analyzed|assessed|verified|checked)\b/.test(normalized) ||
    /\bafter\s+(reviewing|reading|analyzing)\b/.test(normalized) ||
    /\bbased on\b/.test(normalized) ||
    /\baccording to\b/.test(normalized) ||
    /\b(i|we)\s+found\b/.test(normalized) ||
    /\b(?:my|the)\s+analysis\b/.test(normalized) ||
    /\bfindings\b/.test(normalized) ||
    /\bkey takeaways\b/.test(normalized) ||
    /\brecommendation\b/.test(normalized)
  );
}

export function responseHasExecutionReportEvidenceSignal(text: string): boolean {
  const normalized = String(text || "").toLowerCase();
  if (!normalized.trim()) return false;

  const hasCommandOrApiEvidence =
    /(?:^|[\n`*-]\s*)(?:cargo|go|make|cmake|xcodebuild|swift|pytest|python -m pytest|gradle|mvn|dotnet)\s+[\w:./-]+/m.test(
      normalized,
    ) ||
    /\b(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?[\w:-]+\b/.test(normalized) ||
    /\bexit(?:\s+code)?\s*`?\d+`?\b/.test(normalized) ||
    /\bhttp\s*`?\d{3}`?\b/.test(normalized) ||
    /\b(?:get|post|put|patch|delete)\s+https?:\/\//.test(normalized);
  const hasPassFailEvidence =
    /\b(?:passed|failed|skipped|success|failure)\b/.test(normalized) ||
    /\bpass\/fail\b/.test(normalized) ||
    /\bpassed or failed\b/.test(normalized);
  const hasVerdict =
    /\b(?:final\s+)?build-health verdict\b/.test(normalized) ||
    /\boverall status\s*:\s*(?:`?green`?|`?degraded`?|`?broken`?)/.test(normalized) ||
    /\bbuild health status\s*:\s*`?(?:green|degraded|broken)`?/.test(normalized) ||
    /\bresult\s*:\s*\*{0,2}(?:green|degraded|broken)\*{0,2}\b/.test(normalized) ||
    /\bblocks release\s*:\s*(?:yes|no)\b/.test(normalized) ||
    /\bfinal verdict\b/.test(normalized);

  return hasCommandOrApiEvidence && hasPassFailEvidence && hasVerdict;
}

export function responseHasReasonedConclusionSignal(text: string): boolean {
  const normalized = String(text || "").toLowerCase();
  if (!normalized.trim()) return false;

  const hasConclusionCue =
    responseHasDecisionSignal(normalized) ||
    /\b(recommend(?:ation)?|conclusion|overall|in summary|it appears|i believe)\b/.test(normalized);
  const hasReasoningCue =
    /\b(because|since|therefore|as a result|due to|which means|this suggests|that indicates|given that)\b/.test(
      normalized,
    );

  return hasConclusionCue && hasReasoningCue;
}

export function responseHasReviewReportEvidenceSignal(text: string): boolean {
  const normalized = String(text || "").toLowerCase();
  if (!normalized.trim()) return false;

  const hasAffectedDocumentation =
    /\b(?:affected\s+(?:documentation|docs?)|docs?\s+(?:that\s+need|to\s+update)|readme\.md|docs\/|changelog\.md|agents\.md|package\.json)\b/.test(
      normalized,
    );
  const hasSourceOfTruth =
    /\b(?:source(?:\s+of\s+truth)?|source-of-truth|code\/config|current\s+(?:repo\s+)?(?:behavior|state)|fresh\s+evidence|repo\s+evidence)\b/.test(
      normalized,
    );
  const hasMismatchOrFinding =
    /\b(?:drift|mismatch|stale|outdated|missing|under-?documented|not\s+documented|finding|gap)\b/.test(
      normalized,
    );
  const hasSuggestedDocChange =
    /\b(?:suggested\s+(?:documentation|doc)\s+(?:change|update)|documentation\s+change|doc\s+update|update\s+(?:the\s+)?docs?|add\s+(?:to\s+)?docs?)\b/.test(
      normalized,
    );
  const hasPriority = /\b(?:priority|must\s+fix\s+before\s+release|should\s+fix|optional)\b/.test(
    normalized,
  );
  const hasReviewFraming =
    /\b(?:documentation\s+drift|drift\s+(?:check|assessment|report)|review-backed|review\s+report|inspected|reviewed|checked)\b/.test(
      normalized,
    );

  const matchedFieldCount = [
    hasAffectedDocumentation,
    hasSourceOfTruth,
    hasMismatchOrFinding,
    hasSuggestedDocChange,
    hasPriority,
    hasReviewFraming,
  ].filter(Boolean).length;

  return matchedFieldCount >= 4 && hasMismatchOrFinding && hasSuggestedDocChange && hasPriority;
}

export function hasVerificationToolEvidence(
  toolResultMemory: Array<{ tool: string }> | undefined,
): boolean {
  if (!Array.isArray(toolResultMemory) || toolResultMemory.length === 0) return false;
  return toolResultMemory.some((entry) =>
    VERIFICATION_TOOL_EVIDENCE.has(
      String(entry.tool || "")
        .trim()
        .toLowerCase(),
    ),
  );
}

export function responseLooksOperationalOnly(text: string): boolean {
  const normalized = String(text || "")
    .trim()
    .toLowerCase();
  if (!normalized) return true;

  const hasArtifactReference =
    /\.(pdf|docx|txt|md|csv|xlsx|pptx|json)\b/.test(normalized) ||
    /\b(document|file|report|output|artifact)\b/.test(normalized);
  const hasStatusVerb =
    /\b(created|saved|generated|wrote|updated|exported|finished|completed|done)\b/.test(normalized);
  const hasReasoningCue =
    /\b(because|therefore|so that|tradeoff|pros|cons|reason|recommend|should|why|answer|conclusion)\b/.test(
      normalized,
    );

  const sentenceCount = normalized
    .split(/[.!?]\s+/)
    .map((part) => part.trim())
    .filter(Boolean).length;

  if (/^created:\s+\S+/i.test(normalized) || /^saved:\s+\S+/i.test(normalized)) {
    return true;
  }

  return (
    hasArtifactReference &&
    hasStatusVerb &&
    !hasReasoningCue &&
    sentenceCount <= 2 &&
    normalized.length < 320
  );
}

export function getBestFinalResponseCandidate(opts: {
  buildResultSummary: () => string | undefined;
  lastAssistantText: string | null;
  lastNonVerificationOutput: string | null;
  lastAssistantOutput: string | null;
}): string {
  const candidates = [
    opts.lastNonVerificationOutput,
    opts.lastAssistantText,
    opts.lastAssistantOutput,
    opts.buildResultSummary(),
  ];

  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    const trimmed = candidate.trim();
    if (!trimmed) continue;
    return trimmed;
  }

  return "";
}

export function shouldPreserveExistingDeliverableForRecovery(opts: {
  existingDeliverable: string | null;
  recoveryText: string;
  minResultSummaryLength: number;
  contract?: CompletionContract;
}): boolean {
  const existing = String(opts.existingDeliverable || "").trim();
  const recovery = String(opts.recoveryText || "").trim();
  if (!existing || !recovery) return false;
  if (existing.length < opts.minResultSummaryLength) return false;
  if (recovery.length > existing.length * 1.15) return false;

  const existingPassesContract = opts.contract
    ? responseDirectlyAddressesPrompt({
        text: existing,
        contract: opts.contract,
        minResultSummaryLength: opts.minResultSummaryLength,
      })
    : true;
  const recoveryPassesContract = opts.contract
    ? responseDirectlyAddressesPrompt({
        text: recovery,
        contract: opts.contract,
        minResultSummaryLength: opts.minResultSummaryLength,
      })
    : false;
  const existingHasBriefSignals =
    responseHasVerificationSignal(existing) ||
    responseHasReasonedConclusionSignal(existing) ||
    /\b(top\s+3|suggested work|watchlist|health signals|current repo state|priorit(?:y|ies)|overall status|findings|summary|recommendation|verification evidence|commands completed|exact command results|blocks release)\b/i.test(
      existing,
    );
  const existingLooksLikeDeliverable =
    existingPassesContract && (existingHasBriefSignals || !responseLooksOperationalOnly(existing));
  if (!existingLooksLikeDeliverable) return false;

  const recoveryHasDeliverableSignals =
    responseHasVerificationSignal(recovery) || responseHasReasonedConclusionSignal(recovery);
  if (
    recoveryPassesContract &&
    !responseLooksOperationalOnly(recovery) &&
    (recoveryHasDeliverableSignals || recovery.length >= existing.length * 0.75)
  ) {
    return false;
  }

  const recoveryLooksLikeNarrowStatus =
    responseLooksOperationalOnly(recovery) ||
    /\b(alternative|recovery|fallback|retry|succeeded via|saved to scratchpad|captured the requested)\b/i.test(
      recovery,
    );
  return recoveryLooksLikeNarrowStatus && !recoveryHasDeliverableSignals;
}

export function responseDirectlyAddressesPrompt(opts: {
  text: string;
  contract: CompletionContract;
  minResultSummaryLength: number;
}): boolean {
  const normalized = String(opts.text || "").trim();
  if (!normalized) return false;
  if (!opts.contract.requiresDirectAnswer) return true;
  if (responseLooksOperationalOnly(normalized)) return false;
  if (opts.contract.requiresDecisionSignal && !responseHasDecisionSignal(normalized)) return false;
  const needsDetailedAnswer =
    opts.contract.requiresExecutionEvidence || opts.contract.requiresDecisionSignal;
  if (needsDetailedAnswer && normalized.length < opts.minResultSummaryLength) return false;
  return true;
}

export function fallbackContainsDirectAnswer(opts: {
  contract: CompletionContract;
  lastAssistantText: string | null;
  lastNonVerificationOutput: string | null;
  lastAssistantOutput: string | null;
  buildResultSummary?: () => string | undefined;
  minResultSummaryLength: number;
}): boolean {
  const fallbackCandidates = [
    opts.lastAssistantText,
    opts.lastNonVerificationOutput,
    opts.lastAssistantOutput,
    opts.buildResultSummary?.(),
  ];

  return fallbackCandidates.some((candidate) =>
    responseDirectlyAddressesPrompt({
      text: candidate || "",
      contract: opts.contract,
      minResultSummaryLength: opts.minResultSummaryLength,
    }),
  );
}

export function hasArtifactEvidence(opts: {
  contract: CompletionContract;
  createdFiles: string[];
  /** When createdFiles is empty, modified files can satisfy artifact evidence (e.g. task edited existing file). */
  modifiedFiles?: string[];
}): boolean {
  if (!opts.contract.requiresArtifactEvidence) return true;
  const evidenceFiles =
    opts.createdFiles.length > 0
      ? opts.createdFiles
      : (opts.modifiedFiles || []).map((file) => String(file));
  if (evidenceFiles.length === 0) return false;
  if (!opts.contract.requiredArtifactExtensions.length) return true;

  const lowered = evidenceFiles.map((file) => String(file).toLowerCase());
  return opts.contract.requiredArtifactExtensions.every((ext: string) =>
    lowered.some((file: string) => file.endsWith(ext)),
  );
}

export function hasVerificationEvidence(opts: {
  bestCandidate: string;
  planSteps?: Array<{ status?: string; description?: string }>;
  toolResultMemory?: Array<{ tool: string }>;
}): boolean {
  const hasCompletedReviewStep = !!opts.planSteps?.some(
    (step) =>
      step.status === "completed" &&
      (isVerificationStepDescription(step.description || "") ||
        COMPLETED_REVIEW_STEP_REGEX.test(step.description || "")),
  );
  const hasToolEvidence = hasVerificationToolEvidence(opts.toolResultMemory);

  if (responseHasExecutionReportEvidenceSignal(opts.bestCandidate)) {
    return true;
  }

  return (
    hasToolEvidence &&
    (hasCompletedReviewStep ||
      responseHasVerificationSignal(opts.bestCandidate) ||
      responseHasReasonedConclusionSignal(opts.bestCandidate) ||
      responseHasReviewReportEvidenceSignal(opts.bestCandidate))
  );
}

export function getFinalOutcomeGuardError(opts: {
  contract: CompletionContract;
  preferBestEffortCompletion: boolean;
  softDeadlineTriggered: boolean;
  cancelReason: string | null;
  bestCandidate: string;
  hasExecutionEvidence: boolean;
  hasArtifactEvidence: boolean;
  createdFiles: string[];
  missingArtifactExtensions?: string[];
  responseDirectlyAddressesPrompt: (text: string, contract: CompletionContract) => boolean;
  fallbackContainsDirectAnswer: (contract: CompletionContract) => boolean;
  hasVerificationEvidence: (bestCandidate: string) => boolean;
}): string | null {
  const bestEffortMode =
    opts.preferBestEffortCompletion &&
    (opts.softDeadlineTriggered || opts.cancelReason === "timeout");

  // Never turn a requested deliverable into a textual claim. A timeout may
  // relax how much analysis can be completed, but it cannot substitute prose
  // for an explicitly requested file.
  if (opts.contract.requiresArtifactEvidence && !opts.hasArtifactEvidence) {
    const missingExtensions = Array.from(
      new Set(
        (opts.missingArtifactExtensions?.length
          ? opts.missingArtifactExtensions
          : opts.contract.requiredArtifactExtensions
        ).map((extension) => String(extension || "").toLowerCase()),
      ),
    ).filter(Boolean);
    const detectedExtensions = Array.from(
      new Set(
        opts.createdFiles
          .map((file) => path.extname(String(file || "")).toLowerCase())
          .filter(Boolean),
      ),
    );
    const requested = missingExtensions.join(", ");
    const detected = detectedExtensions.join(", ");
    return requested
      ? `Task missing artifact evidence: missing required output artifact (${requested})${detected ? `; detected ${detected}.` : "; no matching created file was detected."}`
      : "Task missing artifact evidence: expected an output file/document but no created file was detected.";
  }

  if (bestEffortMode && opts.bestCandidate.trim()) {
    return null;
  }

  if (opts.contract.requiresExecutionEvidence && !opts.hasExecutionEvidence) {
    return "Task missing execution evidence: no plan step completed successfully.";
  }

  if (
    opts.contract.requiresDirectAnswer &&
    !opts.responseDirectlyAddressesPrompt(opts.bestCandidate, opts.contract)
  ) {
    if (opts.fallbackContainsDirectAnswer(opts.contract)) {
      return null;
    }
    return "Task missing direct answer: the final response does not clearly answer the user request and appears to be operational status only.";
  }

  if (
    opts.contract.requiresVerificationEvidence &&
    !opts.hasVerificationEvidence(opts.bestCandidate) &&
    opts.createdFiles.length === 0
  ) {
    return "Task missing verification evidence: no completed review/verification step or review-backed conclusion was detected.";
  }

  return null;
}
