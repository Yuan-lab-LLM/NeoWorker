// Native NeoWorker layouts. Content contracts and geometry are kept together so
// selecting a layout cannot silently discard a table, an image or a claim.
export const DESIGN_FAMILIES = {
  business: { name: "商务汇报", primary: "132B43", accent: "146B88", muted: "586977", light: "EDF3F6", background: "FFFFFF" },
  technology: { name: "科技产品", primary: "142943", accent: "225CE0", muted: "52667C", light: "EBF2FF", background: "FBFCFF" },
  research: { name: "研究分析", primary: "243E38", accent: "267963", muted: "5C6965", light: "EDF3EF", background: "FFFEFB" },
};

const common = ["subtitle", "sourceNote", "notes"];
const entry = (id, name, fields, required, composition) => ({ id, name, fields: [...common, ...fields], required, composition });

export const LAYOUT_CATALOG = [
  entry("cover-system", "技术主题封面", ["body", "system"], ["system"], "system-cover"),
  entry("branch-flow", "分支与汇合架构", ["body", "flow"], ["flow"], "branch-flow"),
  entry("document-transform", "文档解析示意", ["body", "transformation"], ["transformation"], "document-transform"),
  entry("evidence-stage", "指标与证据说明", ["body", "metrics"], ["metrics", "sourceNote"], "evidence-stage"),
  entry("mechanism-track", "机制与步骤图解", ["body", "mechanisms", "connected"], ["mechanisms"], "mechanism-track"),
  entry("cover-image", "产品封面", ["body", "image"], ["image"], "cover"),
  entry("cover-type", "文字封面", ["body"], [], "cover"),
  entry("editorial-split", "观点与分项", ["body", "items"], ["body", "items"], "split"),
  entry("editorial-rows", "分项说明", ["body", "items"], ["items"], "rows"),
  entry("image-right", "右图左文", ["body" , "image"], ["image"], "image-right"),
  entry("image-left", "左图右文", ["body", "image"], ["image"], "image-left"),
  entry("image-wide", "原图证据页", ["body", "image"], ["image"], "image-wide"),
  entry("image-gallery", "原图对照", ["body", "images"], ["images"], "image-gallery"),
  entry("metrics-row", "关键指标", ["body", "metrics"], ["metrics"], "metrics"),
  entry("comparison-columns", "方案对比", ["body", "columns"], ["columns"], "comparison"),
  entry("table-focus", "参数表格", ["body", "table"], ["table"], "table"),
  entry("chart-focus", "数据与结论", ["body", "chart"], ["chart"], "chart"),
  entry("architecture-layers", "分层架构", ["body", "layers"], ["layers"], "architecture"),
  entry("process-steps", "流程与阶段", ["body", "steps"], ["steps"], "process"),
  entry("closing-statement", "结论与下一步", ["body", "items"], [], "closing"),
];

export function recommendDesignFamily(plan = {}) {
  if (plan.designFamily && plan.designFamily !== "auto") return plan.designFamily;
  const input = `${plan.title || ""} ${plan.purpose || ""} ${plan.styleRoute?.primaryGrammar || ""}`;
  if (/研究|实验|学术|research|evidence-plate/i.test(input)) return "research";
  if (/服务器|架构|技术|产品|technology|product|thesis-stage|telemetry/i.test(input)) return "technology";
  return "business";
}

export function layoutCandidates(slide, previous = []) {
  if (slide.layoutId && slide.layoutId !== "auto") return [slide.layoutId];
  const c = slide.content || {};
  if (c.system) return ["cover-system"];
  if (c.flow) return ["branch-flow"];
  if (c.transformation) return ["document-transform"];
  if (c.mechanisms) return ["mechanism-track"];
  if (c.images) return ["image-gallery"];
  if (slide.type === "cover") return [c.image ? "cover-image" : "cover-type"];
  if (c.table) return ["table-focus"];
  if (c.chart) return ["chart-focus"];
  if (c.layers) return ["architecture-layers"];
  if (c.steps) return ["process-steps"];
  if (c.columns) return ["comparison-columns"];
  if (c.metrics) return c.metrics.length === 3 && c.sourceNote ? ["evidence-stage", "metrics-row"] : ["metrics-row"];
  if (c.image) return previous.at(-1) === "image-right" ? ["image-left", "image-right"] : ["image-right", "image-left"];
  if (/conclusion|closing|summary/.test(slide.type || "")) return ["closing-statement"];
  return previous.at(-1) === "editorial-split" ? ["editorial-rows", "editorial-split"] : ["editorial-split", "editorial-rows"];
}
