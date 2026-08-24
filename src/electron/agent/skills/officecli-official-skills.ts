export type OfficeArtifactKind = "docx" | "xlsx" | "pptx";

export type OfficeCliOfficialProfile =
  | "word"
  | "academic-paper"
  | "word-form"
  | "excel"
  | "data-dashboard"
  | "financial-model"
  | "pptx"
  | "pitch-deck"
  | "morph-ppt"
  | "morph-ppt-3d";

const PROFILE_FORMATS: Record<OfficeCliOfficialProfile, OfficeArtifactKind> = {
  word: "docx",
  "academic-paper": "docx",
  "word-form": "docx",
  excel: "xlsx",
  "data-dashboard": "xlsx",
  "financial-model": "xlsx",
  pptx: "pptx",
  "pitch-deck": "pptx",
  "morph-ppt": "pptx",
  "morph-ppt-3d": "pptx",
};

const DEFAULT_PROFILES: Record<OfficeArtifactKind, OfficeCliOfficialProfile> = {
  docx: "word",
  xlsx: "excel",
  pptx: "pptx",
};

function includesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

export function officeCliProfileFormat(
  profile: OfficeCliOfficialProfile,
): OfficeArtifactKind {
  return PROFILE_FORMATS[profile];
}

export function selectOfficeCliOfficialProfile(
  kind: OfficeArtifactKind,
  contentHint: string,
  requested?: OfficeCliOfficialProfile,
): OfficeCliOfficialProfile {
  if (requested && PROFILE_FORMATS[requested] === kind) return requested;

  const hint = String(contentHint || "").toLowerCase();
  if (kind === "docx") {
    if (
      includesAny(hint, [
        /论文|学术|期刊|研究论文|文献综述|参考文献|脚注|引文/,
        /academic|paper|journal|citation|bibliography|literature review/,
      ])
    ) {
      return "academic-paper";
    }
    if (
      includesAny(hint, [
        /表单|问卷|申请表|调查表|登记表|可填写|填报|合同模板/,
        /form|questionnaire|application form|fillable|survey form/,
      ])
    ) {
      return "word-form";
    }
    return "word";
  }

  if (kind === "xlsx") {
    if (
      includesAny(hint, [
        /财务模型|估值|预算模型|现金流|损益表|资产负债表|融资模型|敏感性分析/,
        /financial model|valuation|dcf|lbo|cash flow|income statement|balance sheet|forecast model/,
      ])
    ) {
      return "financial-model";
    }
    if (
      includesAny(hint, [
        /仪表盘|看板|监控|经营大盘|数据大屏|关键指标|实时指标/,
        /dashboard|scorecard|monitoring|kpi|executive summary/,
      ])
    ) {
      return "data-dashboard";
    }
    return "excel";
  }

  if (
    includesAny(hint, [
      /3d|三维|立体|空间叙事|镜头推进/,
      /three[- ]dimensional|spatial narrative/,
    ])
  ) {
    return "morph-ppt-3d";
  }
  if (
    includesAny(hint, [
      /变形转场|连续动画|平滑转场|动态演示|电影感|视觉叙事/,
      /morph|cinematic|continuous transition|animated deck/,
    ])
  ) {
    return "morph-ppt";
  }
  if (
    includesAny(hint, [
      /路演|融资|投资人|商业计划|募资|创业计划|公司介绍|投资亮点/,
      /pitch|investor|fundrais|business plan|venture|startup deck/,
    ])
  ) {
    return "pitch-deck";
  }
  return "pptx";
}

export function detectRequestedOfficeKinds(prompt: string): OfficeArtifactKind[] {
  const text = String(prompt || "").toLowerCase();
  const result: OfficeArtifactKind[] = [];
  if (
    /\.docx\b|\bdocx\b|\bword\b|word\s*文档|生成(?:一份|一个)?(?:正式|专业|可编辑)?文档|导出(?:为|成)?(?:word|docx)|论文(?:文档|文件)|合同(?:文档|文件)|表单(?:文档|文件)/.test(
      text,
    )
  ) {
    result.push("docx");
  }
  if (
    /\.xlsx\b|\bxlsx\b|\bexcel\b|电子表格|工作簿|导出(?:为|成)?(?:excel|xlsx)|生成(?:一份|一个)?(?:excel|电子表格)|(?:excel|xlsx)\s*(?:仪表盘|看板|财务模型)/.test(
      text,
    )
  ) {
    result.push("xlsx");
  }
  if (
    /\.pptx\b|\bpptx\b|\bppt\b|powerpoint|幻灯片|演示文稿|演示稿|生成(?:一份|一个)?(?:ppt|路演文件)|导出(?:为|成)?(?:ppt|pptx)/.test(
      text,
    )
  ) {
    result.push("pptx");
  }
  return result;
}

export function defaultOfficeCliOfficialProfile(
  kind: OfficeArtifactKind,
): OfficeCliOfficialProfile {
  return DEFAULT_PROFILES[kind];
}

export function officeCliProfileLabel(profile: OfficeCliOfficialProfile): string {
  const labels: Record<OfficeCliOfficialProfile, string> = {
    word: "专业 Word 文档",
    "academic-paper": "学术论文",
    "word-form": "可填写 Word 表单",
    excel: "专业 Excel 工作簿",
    "data-dashboard": "数据仪表盘",
    "financial-model": "财务模型",
    pptx: "专业 PowerPoint 演示文稿",
    "pitch-deck": "商业路演演示文稿",
    "morph-ppt": "Morph 动态演示文稿",
    "morph-ppt-3d": "3D Morph 动态演示文稿",
  };
  return labels[profile];
}

export function buildOfficeCliOfficialWorkflowContract(
  profiles: OfficeCliOfficialProfile[],
): string {
  if (profiles.length === 0) return "";
  const uniqueProfiles = [...new Set(profiles)];
  return [
    "OFFICECLI OFFICIAL GENERATION WORKFLOW (MANDATORY):",
    `- Selected official profile(s): ${uniqueProfiles.map((profile) => `${profile} (${officeCliProfileLabel(profile)})`).join(", ")}.`,
    "- Treat the profile instructions loaded from the bundled OfficeCLI as the source of truth for structure, visual hierarchy, content density, formulas/charts, transitions, and quality gates.",
    "- Before calling an Office creation tool: define the audience and purpose, plan the document/sheets/slides, choose the visual or data hierarchy, and ensure every requested fact and section has an explicit destination.",
    "- Build only the requested native Office artifact with create_document, create_spreadsheet, or create_presentation. HTML, Markdown, PDF, screenshots, and source files are not substitutes for DOCX/XLSX/PPTX.",
    "- For PPTX, prefer a coherent narrative and varied editable layouts; select pitch-deck for investor/business storytelling and morph-ppt or morph-ppt-3d only when motion is actually requested. Never repeat a generic title-and-bullets template across the deck.",
    "- For XLSX, preserve typed data, use formulas for derived values, separate inputs/calculations/outputs when appropriate, format numbers by meaning, and use data-dashboard or financial-model for those use cases.",
    "- For DOCX, use real heading hierarchy, readable page rhythm, intentional tables/lists, and the academic-paper or word-form profile when the content requires it. For business/research/financing/operating reports, supply title/subtitle/author/organization/date metadata and structure the content as an executive summary, evidence-led analysis, risks, and concrete recommendations rather than a wall of prose.",
    "- Make one creation call per requested final format after the complete content is ready. Do not call the same creation tool again merely to restate, re-announce, or re-register an already successful artifact.",
    "- After creation, close the OfficeCLI document, run integrity and quality inspection, review the generated preview/structure, repair actionable failures, and verify that the final native file exists before claiming completion.",
  ].join("\n");
}
