import fs from "node:fs/promises";
import { loadPresentationRuntime } from "../../resources/skills/presentation-studio/scripts/runtime-utils.mjs";
import { normalizeGeneratedPackage } from "../../resources/skills/presentation-studio/scripts/package-check.mjs";

// Synthetic enterprise template for regression coverage, not a customer's brand.
export async function createTemplateFixture(file, { imagePath } = {}) {
  const { PptxGenJS, JSZip } = loadPresentationRuntime(import.meta.url);
  const pptx = new PptxGenJS();
  const font = process.platform === "darwin" ? "PingFang SC" : process.platform === "win32" ? "Microsoft YaHei" : "Noto Sans CJK SC";
  pptx.layout = "LAYOUT_WIDE"; pptx.theme = { headFontFace: font, bodyFontFace: font, lang: "zh-CN" };
  pptx.defineSlideMaster({ title: "Enterprise reference", background: { color: "F9FAFC" }, objects: [
    { text: { text: "NeoWorker / 模板演示", options: { x: 0.65, y: 0.28, w: 5, h: 0.35, fontFace: font, fontSize: 12, color: "526377", margin: 0 } } },
    { text: { text: "合成企业模板 · 非实际客户品牌", options: { x: 0.65, y: 7.02, w: 8, h: 0.23, fontFace: font, fontSize: 10, color: "627388", margin: 0 } } },
  ] });
  const add = (slide, field, text, x, y, w, h, fontSize, color = "172D46") => slide.addText(text, { objectName: `nw:${field}`, x, y, w, h, fontFace: font, fontSize, color, margin: 0, breakLine: false, valign: "top" });
  let s = pptx.addSlide("Enterprise reference");
  add(s, "title", "企业产品介绍", .7, 1.65, 11.8, 1.3, 36);
  add(s, "subtitle", "品牌样式与原生内容", .75, 3.25, 11.5, 1.1, 22, "48637D");
  if (imagePath) s.addImage({ path: imagePath, x: 7.4, y: 4.6, w: 4.8, h: 1.84, sizing: { type: "contain", w: 4.8, h: 1.84 } });
  s = pptx.addSlide("Enterprise reference");
  add(s, "title", "产品概览", .7, 1.05, 11.8, .9, 30);
  add(s, "body", "原有内容示例\n第二段内容示例", .75, 2.4, 11.5, 3.8, 22);
  s.addText("参考资料", { objectName: "static-label", x: 10.7, y: .3, w: 1.8, h: .3, fontFace: font, fontSize: 11, color: "63758A", margin: 0 });
  s = pptx.addSlide("Enterprise reference");
  add(s, "title", "配置表", .7, 1.05, 11.8, .9, 30);
  s.addTable([["项目", "规格", "核对项"], ["样本一", "数值一", "说明一"], ["样本二", "数值二", "说明二"]], { x: .75, y: 2.5, w: 11.5, h: 2.7, colW: [2.5, 3.5, 5.5], rowH: .9, fontFace: font, fontSize: 18, color: "172D46", border: { color: "CDD7E2", pt: .6 }, fill: "FFFFFF", margin: [8, 10, 8, 10] });
  s = pptx.addSlide("Enterprise reference");
  add(s, "title", "规格对比", .7, 1.05, 11.8, .9, 30);
  s.addChart(pptx.ChartType.bar, [{ name: "规格上限", labels: ["A", "B"], values: [1, 2] }], { x: .75, y: 2.3, w: 11.5, h: 4.1, catAxisLabelFontFace: font, valAxisLabelFontFace: font, chartColors: ["1B668D"], catAxisLabelFontSize: 16, valAxisLabelFontSize: 12, showLegend: false, showTitle: false, showValue: true, dataLabelPosition: "outEnd", dataLabelFormatCode: "0", dataLabelBkgrdColor: "F9FAFC", dataLabelColor: "172D46", dataLabelFontFace: font, dataLabelFormatCodeSourceLinked: false, showCatName: false, valAxisMinVal: 0, showBorder: false, showCatName: false });
  const zip = await JSZip.loadAsync(await pptx.write({ outputType: "nodebuffer" }));
  await normalizeGeneratedPackage(zip); // Fixture-only normalization, before import.
  await fs.writeFile(file, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
}

export function configureTemplate(plan, library) {
  for (const layout of plan.template.layouts) {
    const slide = library.slides.find(s => s.slide_index === layout.sourceSlide);
    for (const slot of slide.slots.filter(s => !s.nativeObject)) if (!slot.suggestedField) layout.text[slot.slot_id] = { preserve: true };
    for (const table of slide.tables) layout.tables[table.table_id] = { field: "matrix" };
    for (const chart of slide.charts) layout.charts[chart.chart_id] = { field: "chart" };
    layout.preserveObjects = slide.pictures.map(p => `picture:${p.shapeId}`);
  }
  Object.assign(plan, { audience: "企业 IT 团队", purpose: "核对服务器配置", coreMessage: "配置取决于实际业务需求", narrative: { context: "企业服务器选型", tension: "规格上限不等于默认配置", resolution: "按工作负载验证配置" }, evidence: [{ id: "fixture", source: "Synthetic regression fixture", claim: "测试数据" }] });
  return plan;
}

export function templateRecords(records) {
  return records.map((s, i) => ({ index: i + 1, id: `slide-${i + 1}`, role: i === 0 ? "opening" : "evidence", type: "content", intent: "核对规格", takeaway: s.title, evidenceRefs: ["fixture"], layoutId: "auto", ...s }));
}
