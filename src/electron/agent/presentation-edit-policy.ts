/** Host-owned scope: model-authored slide plans cannot authorize restructuring. */
export function preservePresentationStructure(request: string, previous = false): boolean {
  const instruction = request.trim();
  if (/(?:不要|无需|不需要)(?:增加|拆分|扩展).{0,8}页|(?:不要|不)拆页|\b(?:do not|don't|without)\s+(?:add(?:ing)?|remov(?:e|ing)|split(?:ting)?).{0,20}\bslides?\b/iu.test(instruction)) return true;
  const keep = /(?:保持|保留|不改变|不增加|不要增加|无需增加|不扩页|不拆页).{0,12}(?:页数|单页|一页|页面|结构)|(?:保持|保留).{0,6}(?:一|1)页|\b(?:keep|preserve|same)\b.{0,25}\b(?:slide count|page count|single.slide|structure)\b/iu;
  if (keep.test(instruction)) return true;
  const expand = /(?:拆分|扩展|扩成|拆成|增加|新增|减少|删减|合并|重构).{0,12}(?:页|幻灯片)|\b(?:add|remove|split|expand|restructure)\b.{0,25}\b(?:slides?|pages?|deck)\b/iu;
  if (expand.test(instruction)) return false;
  if (/(?:优化|美化|排版|重排|润色|精简|修改|改进|完善|修订|调整内容)|\b(?:optimi[sz]e|polish|refine|revise|edit|improve|redesign|restyle)\b/iu.test(instruction)) return true;
  return previous;
}

/** Only inherit a source for a scoped edit, never for a new unrelated query. */
export function isPresentationEditContinuation(request: string): boolean {
  return /^(?:请|帮我|再|继续|把|将|只|仅|please\s+)*(?:(?:优化|美化|重排|润色|精简|修改|改进|完善|修订).{0,12}(?:内容|表达|文字|标题|正文|排版|视觉|PPT|幻灯片)|(?:增加|新增|拆分|拆成|扩成|减少|删减|合并).{0,8}(?:页|幻灯片)|(?:polish|refine|revise|edit|improve|redesign|restyle|add|remove|split|expand)\b.{0,25}\b(?:content|wording|slides?|pages?|deck)\b)/iu.test(request.trim()) || /^(?:继续|再优化一下|再美化一下|排版也优化一下|continue)[。！!\s]*$/iu.test(request.trim());
}

// Keeping the page roster does not mean freezing the design. Resolve this only
// from the user's instruction after generated attachment context is stripped.
export type PresentationEditIntent = "content" | "visual";

export function resolvePresentationEditIntent(request: string, previous: PresentationEditIntent = "content"): PresentationEditIntent {
  const instruction = request.trim();
  if (/(?:只|仅).{0,8}(?:改|优化|润色|修改).{0,8}(?:文字|内容|表达|措辞)|(?:保持|保留).{0,8}(?:原样式|原版式|原格式)|(?:不要|不改|不改变).{0,8}(?:版式|排版|样式|格式)|\b(?:text|wording|content)[ -]only\b|\b(?:keep|preserve)\b.{0,15}\b(?:formatting|layout|design)\b/iu.test(instruction)) return "content";
  if (/(?:美化|排版|视觉|设计|好看|美观)|\b(?:redesign|restyle|beautify|visual|layout|typography)\b/iu.test(instruction)) return "visual";
  if (/(?:内容|文字|措辞|表达|正文|错别字)|\b(?:content|wording|copy|text|typos?)\b/iu.test(instruction)) return "content";
  if (/(?:优化|改进|完善)|\b(?:optimi[sz]e|improve|polish)\b/iu.test(instruction)) return "visual";
  return previous;
}

export const PRESENTATION_EDIT_GUIDANCE = `PPT 原稿内容优化：默认保留原页数、页面顺序、母版、版式和各文本框用途，不增加封面或自动拆页。
先检查源 PPTX 的每页文本框、字号和位置，再精简重复表达，保留数字、单位、项目名称、完成状态与目标的区别。
遵循当前激活的演示文稿 skill，在源文件副本上做原生编辑，不调用被该工作流禁止的快捷生成工具。逐页、逐文本框定位，完整保留段落对齐、行距、列表、字体及混合样式；形状 ID 从原文件读取，不能猜测。不使用 office_translation 代替内容优化。
KPI 小框仅放指标，正文仅放正文，不把同一段填入多个框。没有明确授权时不得扩页、重排页面或删掉事实来通过检查。
导出后检查实际文件和预览。结构检查通过或文字变短都不能证明没有溢出，原稿也可能已经溢出。不得无依据声称“逐页核对、无重叠”。用户仅允许改文字时，报告原稿的样式缺陷，不擅自换版式。最多尝试两次，然后保留草稿并说明具体问题，禁止反复生成或虚报完成。`;

export const PRESENTATION_VISUAL_EDIT_GUIDANCE = `PPT 视觉优化：用户要求“优化PPT / 美化 / 改进视觉”，必须检查并改善实际排版，不得自动降级为只换措辞。
默认保留原页数、页面顺序、事实、数字、单位、表格全部行列、原生可编辑性以及品牌资产。保留内容结构不等于锁定字号、位置、留白、配色和段落层级；可在各页内调整这些视觉属性来完成优化。明确的原版式或仅改文字要求优先。
先渲染源 PPTX 并逐页看图，记录对比度、断行、内容越界、表格可读性、层级和构图问题，再在副本上执行当前演示文稿 skill 的 edit 工作流。不得调用与当前 skill 冲突的快捷生成工具，也不得用 office_translation 代替美化。不能用加空格、替换同义词、统一字号或换个颜色代替视觉设计。
读取 Presentation Studio 的 references/editing.md；静态文本与原生表格优先用 compose_native_edit.mjs 从原稿直接生成排版计划，按页选择构图并由程序计算尺寸，不要手写大段 Python 坐标或转录全部文字。图片、图表、复杂母版走保留资产的原生编辑。不能删事实、把表格变截图、擅自拆页或重画品牌图片。使用 build_edit.mjs / inspect_edit.mjs 对原稿、候选稿及候选稿实际渲染的 PDF 做检查。
交付前对照原稿查看每页渲染图，明确哪些视觉问题得到改善。仅 ZIP/XML 正常、文字更短或生成了 PNG 不等于视觉验收通过。渲染不可用或仍有遮挡、越界、浅底浅字时保留草稿并说明未完成视觉验收，不得宣称美化完成。`;

export function presentationEditGuidance(intent: PresentationEditIntent): string {
  return intent === "visual" ? PRESENTATION_VISUAL_EDIT_GUIDANCE : PRESENTATION_EDIT_GUIDANCE;
}
