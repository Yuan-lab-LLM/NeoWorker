// Reproducible, public-material smoke deck for the actual Presentation Studio
// catalog pipeline. No LLM keys, service installs or external uploads required.
import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const target = path.resolve(process.argv[2] || path.join(root, "artifacts/presentation-layout-pilot"));
const scripts = path.join(root, "resources/skills/presentation-studio/scripts");
const source = "https://www.delltechnologies.com/asset/en-th/products/servers/technical-support/poweredge-r760-spec-sheet.pdf";
const note = "来源：Dell PowerEdge R760 规格表（2024-06）；能力随具体配置变化";
const imagePath = path.join(target, "source/r760-page1-0.jpg");
await fs.access(imagePath);
const after = path.join(target, "catalog");
execFileSync(process.execPath, [path.join(scripts, "bootstrap_project.mjs"), "--project-dir", after, "--title", "PowerEdge R760 服务器产品介绍", "--language", "chinese", "--design-family", "technology"], { cwd: root, stdio: "inherit" });
await fs.copyFile(imagePath, path.join(after, "slides/imgs/r760.jpg"));
const records = [
  { type: "cover", title: "PowerEdge R760\n服务器产品介绍", content: { subtitle: "规格与部署要点", body: "2U 双路机架平台\n面向企业混合工作负载", image: { path: "slides/imgs/r760.jpg", alt: "Dell PowerEdge R760 产品照片", source, fit: "contain" } } },
  { type: "metric", title: "关键规格", content: { body: "以下为平台规格及可支持的上限，不代表默认出厂配置。", metrics: [{ value: "2U", label: "机架高度", detail: "双处理器插槽平台" }, { value: "32", label: "DDR5 DIMM 插槽", detail: "支持 RDIMM" }, { value: "8 TB", label: "内存容量上限", detail: "取决于具体配置" }] } },
  { type: "architecture", title: "平台能力概览", content: { subtitle: "按能力归类的示意，不代表物理连接关系", body: "计算、存储和管理能力\n共同支撑业务部署。", layers: [{ label: "计算", body: "可选第四代或第五代英特尔至强可扩展处理器" }, { label: "内存", body: "32 个 DDR5 DIMM 插槽" }, { label: "存储", body: "多种 SAS、SATA 与 NVMe 配置" }, { label: "管理", body: "iDRAC9 与 OpenManage" }] } },
  { type: "comparison", title: "处理器代际与内存速率", content: { subtitle: "同一产品平台，可按工作负载选择配置", columns: [{ label: "第四代至强", body: "每颗处理器最高 56 核\n内存速率最高 4800 MT/s\n内存速率条件：1DPC" }, { label: "第五代至强", body: "每颗处理器最高 64 核\n内存速率最高 5600 MT/s\n内存速率条件：1DPC" }] } },
  { type: "table", title: "配置核对表", content: { table: { columns: ["项目", "规格摘录", "核对事项"], columnWeights: [0.7, 1.4, 1.9], rows: [["外形", "2U 机架式", "机柜空间与安装条件"], ["内存", "最高 8 TB", "DIMM 类型与配置兼容性"], ["扩展", "最高 8 个 PCIe 插槽", "插槽代际及转接卡配置"], ["散热", "风冷，可选直接液冷", "液冷需要机架歧管和 CDU"]] } } },
  { type: "chart", title: "两代平台的内存速率上限", content: { chart: { type: "bar", unit: "MT/s，1DPC", labels: ["第四代至强", "第五代至强"], series: [{ name: "内存速率上限", values: [4800, 5600] }] }, body: "这是规格上限。\n\n实际速率取决于处理器和内存配置。" } },
  { type: "process", title: "部署前的核对顺序", recommendation: true, content: { body: "先确认工作负载，再核对配置与机房条件。", steps: [{ label: "业务需求", body: "明确应用、容量和可用性要求。" }, { label: "配置验证", body: "核对处理器、内存、存储与扩展卡。" }, { label: "环境检查", body: "确认供电、散热和机柜条件。" }, { label: "验证验收", body: "按实际负载完成试运行。" }] } },
  { type: "closing", title: "选型以业务负载与配置验证为准", recommendation: true, content: { subtitle: "完成配置确认后，再进入部署与验收", body: "规格表用于界定平台能力。\n实际方案还需要结合业务\n与部署条件验证。", items: [{ label: "配置清单", body: "确认部件兼容性及可用配置。" }, { label: "试运行记录", body: "记录实际负载下的验证结果。" }] } },
];
const plan = JSON.parse(await fs.readFile(path.join(after, "presentation-plan.json"), "utf8"));
Object.assign(plan, {
  audience: "企业 IT 架构与产品团队", purpose: "了解服务器规格与部署核对事项", coreMessage: "依据规格与实际业务条件选择配置",
  narrative: { context: "企业服务器选型", tension: "平台上限不等于实际配置能力", resolution: "核对配置与部署条件后完成验证" },
  evidence: [{ id: "dell-spec", source, claim: "PowerEdge R760 官方规格，2024-06 版本" }, { id: "analysis", source: "NeoWorker 示例中的部署建议", claim: "业务与部署核对顺序" }],
  slides: records.map((s, i) => ({ index: i + 1, id: `slide-${String(i + 1).padStart(2, "0")}`, type: s.type, title: s.title, role: s.type === "cover" ? "opening" : s.type, intent: `说明${s.title.replaceAll("\n", "")}`, takeaway: s.title.replaceAll("\n", ""), evidenceRefs: [s.recommendation ? "analysis" : "dell-spec"], layoutId: "auto", content: { ...s.content, sourceNote: s.recommendation ? "部署建议，需结合实际业务与环境验证" : note, notes: s.recommendation ? "本页为示例部署建议，不是厂商性能承诺。" : `Source: ${source}\n使用 2024 年 6 月规格表版本，并非当前可售配置或性能实测。` } })),
});
await fs.writeFile(path.join(after, "presentation-plan.json"), JSON.stringify(plan, null, 2));
await fs.writeFile(path.join(target, "source/content.json"), JSON.stringify(records, null, 2));
execFileSync(process.execPath, [path.join(scripts, "validate_plan.mjs"), "--project-dir", after, "--strict"], { cwd: root, stdio: "inherit" });
execFileSync(process.execPath, [path.join(scripts, "build_and_qa.mjs"), "--project-dir", after], { cwd: root, stdio: "inherit" });

// Deterministic comparison against the existing structured quick-template tool.
// This is NOT a claim that every old free-form/LLM-authored Studio deck looks the
// same. The source file and mapping are retained so that scope is reviewable.
const before = path.join(target, "existing-structured-generator");
await fs.mkdir(before, { recursive: true });
const require = createRequire(import.meta.url);
const { generatePPTX } = require(path.join(root, "dist/electron/electron/utils/document-generators/pptx-generator.js"));
const options = {
  title: plan.title, visualMode: "technical", audience: plan.audience, theme: { fontFace: "PingFang SC", primaryColor: "10243A", accentColor: "007F9C" },
  slides: plan.slides.map(s => {
    const c = s.content;
    const narrativeItems = c.columns || c.layers || c.steps || c.items;
    return {
      title: s.title,
      subtitle: narrativeItems || s.type === "cover" ? [c.subtitle, c.body].filter(Boolean).join("\n") : c.subtitle,
      content: narrativeItems || s.type === "cover" ? "" : c.body,
      notes: [c.sourceNote, c.notes].filter(Boolean).join("\n"),
      slideType: s.type === "architecture" ? "process" : s.type,
      ...(c.image ? { image: { path: imagePath, alt: c.image.alt } } : {}),
      ...(c.metrics ? { data: { items: c.metrics.map(m => ({ label: m.label, value: m.value, detail: m.detail })) } } : {}),
      ...(c.table ? { data: { headers: c.table.columns, rows: c.table.rows } } : {}),
      ...(c.chart ? { data: { categories: c.chart.labels, series: c.chart.series }, subtitle: c.chart.unit } : {}),
      ...(narrativeItems ? { bullets: narrativeItems.map(item => `${item.label}：${item.body}`) } : {}),
    };
  }),
};
await fs.writeFile(path.join(before, "input.json"), JSON.stringify(options, null, 2));
console.log(await generatePPTX(path.join(before, "presentation.pptx"), options));
await fs.writeFile(path.join(target, "comparison-scope.json"), JSON.stringify({
  source, specificationDate: "2024-06", newPipeline: "Presentation Studio catalog-v1", baseline: "Existing generate_presentation structured quick-template path", sameSourceContent: "source/content.json", limitation: "Deterministic layout comparison; not a controlled LLM quality benchmark. Free-form Studio modules can produce different results. PowerPoint/WPS compatibility still requires opening the files in those apps.",
}, null, 2));
