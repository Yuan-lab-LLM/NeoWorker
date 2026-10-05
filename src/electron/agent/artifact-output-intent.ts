// Only the object of an output action contributes a required format. Source
// formats before a conversion or after "from/based on" are not deliverables.
const OUTPUT_ACTION = /\b(?:convert|turn|transform)\b[^\n;!?]{0,160}?\b(?:into|to)\b|\b(?:create|generate|produce|draft|build|write|make|prepare|design|author|compose|save|export|output|compile|synthesize|combine|merge|join|stitch|concatenate|concat|transcode|remux)\b(?=\s|$|[:：])|(?:创建|生成|制作|产出|编制|撰写|起草|保存|导出|输出(?!要求)|写入|写|做|给我|我要|整理成|转换成|转换为|转成|转为|转型(?:成|为)?|另存为|改成|改为|生动(?=\s*(?:pdf|word|docx|excel|xlsx|ppt)))/gi;

const FORMATS: Array<[string, RegExp]> = [
  [".docx", /(?<![a-z0-9])(?:word|docx?)(?![a-z0-9])/i],
  [".xlsx", /(?<![a-z0-9])(?:excel|xlsx?|spreadsheet|workbook)(?![a-z0-9])|电子表格|工作簿|表格文件/i],
  [".pptx", /(?<![a-z0-9])(?:powerpoint|pptx?|presentation|slide\s+deck|pitch\s+deck|deck|slides?)(?![a-z0-9])|演示文稿|幻灯片/i],
  [".pdf", /(?<![a-z0-9])pdf(?![a-z0-9])/i],
  [".csv", /(?<![a-z0-9])csv(?![a-z0-9])/i],
  [".html", /(?<![a-z0-9])(?:html?|web\s*page)(?![a-z0-9])|网页|页面/i],
  [".md", /(?<![a-z0-9])(?:markdown|md)(?![a-z0-9])/i],
  [".json", /(?<![a-z0-9])json(?![a-z0-9])/i],
  [".jsonl", /(?<![a-z0-9])jsonl(?![a-z0-9])/i],
  [".txt", /(?<![a-z0-9])txt(?![a-z0-9])/i],
  [".mp4", /(?<![a-z0-9])mp4(?![a-z0-9])/i],
  [".mov", /(?<![a-z0-9])mov(?![a-z0-9])/i],
  [".webm", /(?<![a-z0-9])webm(?![a-z0-9])/i],
];

function withoutSourceReferences(text: string): string {
  return text
    // Inline modifiers: "生成基于PPT内容的Word报告".
    .replace(/(?:基于|根据|参考|读取|使用)[^，,。；;\n]{0,80}?的/g, " ")
    .replace(/(?:pptx?|powerpoint|word|docx?|excel|xlsx?|pdf|csv|html)(?:内容|文件|文档|材料)?的(?=\s*(?:pptx?|powerpoint|word|docx?|excel|xlsx?|pdf|csv|html))/gi, " ")
    .replace(/\b[\w.-]+-based\b/gi, " ")
    .replace(/\b(?:of|about|from|using|based\s+on)\b[^\n,;]{0,100}?(?=\b(?:as|in|into)\s+(?:(?:a|an|the)\s+)?(?:word|docx|pdf|pptx?|excel|xlsx|csv|html)\b)/gi, " ")
    .split(/(?:基于|根据|参考|读取|使用|来源|输入|关于|有关|不要|而不是)|\b(?:of|about|comparing|from|based\s+on|using|according\s+to|for\s+later|rather\s+than|instead\s+of|do\s+not|don'?t|without)\b/i)[0]
    // A filename's basename is not a format: presentation-plan.json is JSON.
    .replace(/[\p{L}\p{N}_./\\-]+\.(docx?|xlsx?|pptx?|pdf|csv|html?|md|jsonl?|txt|mp4|mov|webm)(?![a-z0-9])/giu, " .$1");
}

// A reference template refines the current deliverable; it is not itself an
// output-format switch. Callers must resolve the preceding user-authored turn.
export function isArtifactRevisionRequest(text: string): boolean {
  if (/(?:不要|无需|不必|不需要|别)\s*(?:生成|输出|制作|写|做)|只(?:需|要)?\s*(?:解释|分析|回答|文字|文本)|什么意思|\b(?:do\s+not|don't|never)\s+(?:create|generate|write|make)|\b(?:explain|text\s+only)\b/i.test(text)) return false;
  if (/(?:继续|接着)\s*(?:查|搜索|分析|回答)|\bcontinue\s+(?:searching|search|looking\s+up)\b/i.test(text)) return false;
  return /\b(?:continue|finish|complete|fix|repair|resume|retry|regenerate|rebuild|redo|rerun)\b|(?:继续|补全|补齐|完善|完成|修复|重试|重新生成|重新制作|重做|再生成|重跑|不完整|没生成完|没有生成完)/i.test(text) ||
    /(?:基于|根据|参考|使用|用|沿用|套用|按|换成)[^。！？\n]{0,60}(?:模板|模版|版式|排版)|(?:保持|保留|调整|修改)[^。！？\n]{0,30}(?:版式|排版|字体|配色)|(?:增加|添加|补充|加入|补上)[^。！？\n]{0,20}(?:图片|图表|内容)|内容[^。！？\n]{0,15}(?:详细|详尽|精简)|\b(?:use|apply|follow)\b[^.!?\n]{0,60}\b(?:template|layout)\b|\b(?:add|include)\b[^.!?\n]{0,30}\b(?:images|charts|details)\b/i.test(text);
}

export function parseArtifactOutputExtensions(prompt: string): string[] {
  const extensions = new Set<string>();
  // Do not interpret auto-appended attachment descriptors as output actions.
  const text = prompt.split(/\n(?:Attached files(?:\s*\([^\n]*\))?:|附件(?:文件)?[：:])/i)[0];
  const actions = Array.from(text.matchAll(OUTPUT_ACTION));
  for (let index = 0; index < actions.length; index++) {
    const action = actions[index];
    const prefix = text.slice(Math.max(0, action.index! - 32), action.index);
    if (/(?:不要|无需|不必|不需要|不)\s*$|(?:^|[，,。;\s])别\s*$|\b(?:do\s+not|don'?t|never|without)\s*$/i.test(prefix)) continue;
    // A negated list keeps its scope across conjunctions: "不要网上搜索、
    // 补造数据或制作更多页面" does not ask for an HTML deliverable.
    if (/(?:不要|无需|不必|不需要|别)[^，,。；;！？!?\n]*(?:、|或|和|及)\s*$/.test(prefix)) continue;
    const start = action.index! + action[0].length;
    const end = Math.min(actions[index + 1]?.index ?? text.length, start + 180);
    const target = withoutSourceReferences(text.slice(start, end)
      .split(/[。！？!?;；\n]|\.(?=\s|$)/)[0]);
    let found = FORMATS.filter(([, pattern]) => pattern.test(target)).map(([extension]) => extension);
    // "PPT，每个页面…" describes slides, not a second web output. Explicit
    // HTML/webpage or a named web screen still remains a separate requirement.
    if (
      found.includes(".html") &&
      found.some((extension) => [".pptx", ".pdf", ".docx"].includes(extension)) &&
      !/\b(?:html?|web\s*page)\b|网页|网站|(?:登录|注册|落地|登陆|购物|结账)页/i.test(target)
    ) {
      found = found.filter((extension) => extension !== ".html");
    }
    found.forEach((extension) => extensions.add(extension));
    if (found.length === 0 && /台账|数据表/.test(target)) extensions.add(".xlsx");
    if (found.length === 0 && /\b(?:videos?|clips?|movie|footage)\b/i.test(target)) extensions.add(".mp4");
  }

  if (/(?:内容|结果|页面|动画)?\s*(?:以|用|采用)\s*\.?html\s*(?:格式|形式)?\s*(?:展现|展示|呈现|运行|输出|交付)/i.test(text)) {
    extensions.add(".html");
  }

  // Translation of an existing deck preserves its format only when no
  // explicit destination was requested. "Translate PPT, export PDF" is PDF.
  if (extensions.size === 0 &&
    /\b(?:locali[sz]e|translate|translation)\b|翻译|汉化|本地化|译成|译为/i.test(text) &&
    FORMATS.find(([extension]) => extension === ".pptx")![1].test(text) &&
    !/(?:不要|无需|不必|不需要)\s*(?:生成|输出|制作)|只(?:需|要)?\s*(?:文字|文本)|\b(?:text\s+only|do\s+not\s+(?:create|generate))\b/i.test(text)) {
    extensions.add(".pptx");
  }
  return Array.from(extensions);
}
