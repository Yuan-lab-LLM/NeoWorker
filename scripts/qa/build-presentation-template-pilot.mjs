import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createTemplateFixture, configureTemplate, templateRecords } from "./presentation-template-fixture.mjs";

const root = process.cwd(), target = path.resolve(process.argv[2] || "artifacts/presentation-template-pilot");
const scripts = path.join(root, "resources/skills/presentation-studio/scripts");
await fs.mkdir(target, { recursive: true });
const source = path.join(target, "enterprise-reference.pptx"), project = path.join(target, "project");
if (await fs.stat(source).catch(() => null)) throw new Error("Pilot already exists; choose a new directory");
await createTemplateFixture(source, { imagePath: path.join(root, "artifacts/presentation-layout-pilot/source/r760-page1-0.jpg") });
execFileSync(process.execPath, [path.join(scripts, "import_template.mjs"), "--source", source, "--project-dir", project, "--title", "PowerEdge R760 模板示例", "--language", "chinese"], { stdio: "inherit" });
const library = JSON.parse(await fs.readFile(path.join(project, "template-library.json"), "utf8"));
const plan = configureTemplate(JSON.parse(await fs.readFile(path.join(project, "presentation-plan.json"), "utf8")), library);
const spec = "https://www.delltechnologies.com/asset/en-th/products/servers/technical-support/poweredge-r760-spec-sheet.pdf";
plan.evidence = [{ id: "spec", source: spec, claim: "Dell 官方规格表，2024 年 6 月版本" }, { id: "analysis", source: "部署建议", claim: "按实际业务需求验证配置" }];
plan.slides = templateRecords([
  { role: "opening", title: "PowerEdge R760 产品介绍", content: { subtitle: "2U 双路机架平台\n规格与部署核对事项" } },
  { role: "context", title: "平台规格概览", content: { body: "2U 机架平台，支持两颗处理器\n32 个 DDR5 DIMM 插槽，内存容量最高 8 TB\n支持多种 SAS、SATA 和 NVMe 配置\n\n以上为平台能力及可支持的上限，不代表默认出厂配置。" } },
  { role: "evidence", title: "配置核对表", content: { matrix: [["项目", "规格摘录", "核对事项"], ["外形", "2U 机架式", "机柜空间与安装条件"], ["内存", "最高 8 TB", "DIMM 类型与配置兼容性"]] } },
  { role: "comparison", title: "内存速率上限（MT/s，1DPC）", content: { chart: { categories: ["第四代至强", "第五代至强"], series: [{ name: "内存速率上限", values: [4800, 5600] }] } } },
  { role: "recommendation", title: "部署前核对事项", content: { body: "明确应用、容量与可用性要求。\n核对处理器、内存、存储和扩展卡的兼容性。\n确认供电、散热和机柜条件。\n按实际负载试运行，并保留验证记录。" } },
  { role: "closing", title: "选型以实际业务条件为准", content: { body: "规格表用于界定平台能力。\n\n完成配置和环境确认后，再进入部署与验收。" } },
]);
for (const slide of plan.slides) {
  const advice = ["recommendation", "closing"].includes(slide.role);
  slide.evidenceRefs = [advice ? "analysis" : "spec"];
  slide.notes = advice ? "部署建议，需要结合实际业务与环境验证。" : `Source: ${spec}\n使用 2024 年 6 月规格表。规格上限不代表默认配置；内存速率取决于处理器和内存配置。封面产品照片来自同一规格表。`;
}
await fs.writeFile(path.join(project, "presentation-plan.json"), JSON.stringify(plan, null, 2));
execFileSync(process.execPath, [path.join(scripts, "build_and_qa.mjs"), "--project-dir", project], { stdio: "inherit" });
