import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createTemplateFixture, configureTemplate, templateRecords } from "./presentation-template-fixture.mjs";
import { compileTemplatePlan, loadTemplateProject } from "../../resources/skills/presentation-studio/scripts/template-engine.mjs";
import { loadPresentationRuntime } from "../../resources/skills/presentation-studio/scripts/runtime-utils.mjs";

const scripts = path.resolve("resources/skills/presentation-studio/scripts");
const run = (script, ...args) => execFileSync(process.execPath, [path.join(scripts, script), ...args], { encoding: "utf8", timeout: 120000, stdio: "pipe" });
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
async function fixture(fn) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "neoworker-native-template-"));
  try {
    const source = path.join(root, "原始模板.pptx"), project = path.join(root, "project");
    await createTemplateFixture(source);
    run("import_template.mjs", "--source", source, "--project-dir", project);
    const library = JSON.parse(await fs.readFile(path.join(project, "template-library.json"), "utf8"));
    const plan = configureTemplate(JSON.parse(await fs.readFile(path.join(project, "presentation-plan.json"), "utf8")), library);
    plan.slides = templateRecords([
      { title: "服务器产品介绍", content: { subtitle: "测试模板原生格式" }, notes: "Source: fixture://source\n引用说明：测试数据，非实测结果。" },
      { title: "内容一", content: { body: "保留字体、配色和母版。" } },
      { title: "内容二", content: { body: "重复页面拥有各自的内容。" } },
      { title: "配置表", content: { matrix: [["参数", "规格", "说明"], ["外形", "2U", "机架式"], ["内存", "8 TB", "配置上限"]] } },
      { title: "速率", content: { chart: { categories: ["第四代", "第五代"], series: [{ name: "MT/s", values: [4800, 5600] }] } } },
      { title: "容量", content: { chart: { categories: ["方案甲", "方案乙"], series: [{ name: "TB", values: [2, 8] }] } } },
    ]);
    await fn({ root, source, project, plan, library });
  } finally { await fs.rm(root, { recursive: true, force: true }); }
}

test("native template auto-selection preserves brand parts and independent editable tables/charts", async () => fixture(async ({ source, project, plan, library }) => {
  const sourceHash = hash(await fs.readFile(source));
  const compiled = compileTemplatePlan(plan, library);
  assert.deepEqual(compiled.errors, []);
  assert.deepEqual(compiled.slides.map(s => s.sourceSlide), [1, 2, 2, 3, 4, 4]);
  await fs.writeFile(path.join(project, "presentation-plan.json"), JSON.stringify(plan));
  run("build_and_qa.mjs", "--project-dir", project, "--skip-render");
  const report = JSON.parse(await fs.readFile(path.join(project, "qa-report.json"), "utf8"));
  assert.deepEqual(report.errors, []);
  assert.equal(report.layout.engine, "template-v1");
  assert.equal(report.template.validation.summary.error, 0);
  assert.equal(hash(await fs.readFile(source)), sourceHash);
  const { JSZip } = loadPresentationRuntime(import.meta.url);
  const original = await JSZip.loadAsync(await fs.readFile(source)), output = await JSZip.loadAsync(await fs.readFile(report.outputPath));
  for (const name of report.template.preservedParts) assert.deepEqual(await output.file(name).async("nodebuffer"), await original.file(name).async("nodebuffer"), name);
  assert.ok(report.template.preservedParts.some(n => n.startsWith("ppt/slideMasters/")));
  const allSlides = (await Promise.all(Object.keys(output.files).filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n)).map(n => output.file(n).async("string")))).join("\n");
  assert.match(allSlides, /<a:tbl>/); assert.match(allSlides, /8 TB/); assert.match(allSlides, /内容一/); assert.match(allSlides, /内容二/); assert.match(allSlides, /参考资料/);
  assert.doesNotMatch(allSlides, /原有内容示例|第二段内容示例|样本一/);
  const charts = await Promise.all(Object.keys(output.files).filter(n => /^ppt\/charts\/chart\d+\.xml$/.test(n)).map(n => output.file(n).async("string")));
  assert.equal(charts.length, 2);
  assert.equal(charts.filter(c => c.includes("4800") && c.includes("5600")).length, 1);
  assert.equal(charts.filter(c => c.includes("方案甲") && c.includes("方案乙")).length, 1);
  assert.equal(Object.keys(output.files).filter(n => /^ppt\/embeddings\/.*\.xlsx$/.test(n)).length, 2);
  run("build_and_qa.mjs", "--project-dir", project, "--skip-render");
  await fs.access(path.join(project, "output/presentation-v2.pptx"));
}));

test("template capacity, source classification and full data coverage are mandatory", async () => fixture(async ({ plan, library }) => {
  for (const mutate of [
    p => { p.slides[1].content.body = "很长的中文内容".repeat(300); },
    p => { p.slides[1].content.extraEvidence = "不能丢失的证据"; },
    p => { delete p.template.layouts[1].text[Object.keys(p.template.layouts[1].text).at(-1)]; },
    p => { p.slides[3].content.matrix.push(["额外行", "不能截断", "保留"]); },
    p => { p.slides[4].content.chart.series[0].values = [4800]; },
    p => { p.slides[0].layoutId = "absent"; },
  ]) {
    const draft = structuredClone(plan); mutate(draft); const before = JSON.stringify(draft);
    assert.ok(compileTemplatePlan(draft, library).errors.length);
    assert.equal(JSON.stringify(draft), before);
  }
}));

test("source changes and edited inspection metadata cannot bypass validation; failed builds do not publish", async () => fixture(async ({ source, project, plan }) => {
  await fs.writeFile(path.join(project, "presentation-plan.json"), JSON.stringify(plan));
  const manifestPath = path.join(project, "template-library.json");
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  manifest.slides[1].slots.forEach(s => { if (s.capacity?.bounds) s.capacity.bounds.h = 1000; });
  await fs.writeFile(manifestPath, JSON.stringify(manifest));
  plan.slides[1].content.body = "长内容\n".repeat(100);
  const { compiled } = await loadTemplateProject(plan, project);
  assert.ok(compiled.errors.length);
  await fs.writeFile(path.join(project, "presentation-plan.json"), JSON.stringify(plan));
  assert.throws(() => run("build_and_qa.mjs", "--project-dir", project, "--skip-render"));
  await assert.rejects(fs.access(path.join(project, "output/presentation.pptx")));
  await fs.appendFile(path.join(project, "sources/template.pptx"), "changed");
  await assert.rejects(loadTemplateProject(plan, project), /changed since import/);
  assert.throws(() => run("import_template.mjs", "--source", source, "--project-dir", project), /Project already exists/);
}));

test("empty native placeholders inherit layout geometry and font size", async () => fixture(async ({ root, source }) => {
  const { JSZip } = loadPresentationRuntime(import.meta.url);
  const zip = await JSZip.loadAsync(await fs.readFile(source));
  const original = await zip.file("ppt/slides/slide2.xml").async("string");
  const body = [...original.matchAll(/<p:sp>[\s\S]*?<\/p:sp>/g)].map(m => m[0]).find(s => s.includes('name="nw:body"'));
  assert.ok(body);
  const withPh = body.replace("<p:nvPr></p:nvPr>", '<p:nvPr><p:ph type="body" idx="17"/></p:nvPr>');
  const inherited = withPh.replace(/<a:xfrm>[\s\S]*?<\/a:xfrm>/, "").replace(/<p:txBody>[\s\S]*?<\/p:txBody>/, '<p:txBody><a:bodyPr/><a:lstStyle/><a:p/></p:txBody>');
  zip.file("ppt/slides/slide2.xml", original.replace(body, inherited));
  const rels = await zip.file("ppt/slides/_rels/slide2.xml.rels").async("string");
  const target = /Target="([^\"]+)" Type="[^\"]*\/slideLayout"/.exec(rels)?.[1] || /Type="[^\"]*\/slideLayout" Target="([^\"]+)"/.exec(rels)?.[1];
  assert.ok(target);
  const layoutName = path.posix.normalize(path.posix.join("ppt/slides", target));
  const layout = await zip.file(layoutName).async("string");
  zip.file(layoutName, layout.replace("</p:spTree>", withPh.replace('id="3"', 'id="117"') + "</p:spTree>"));
  const file = path.join(root, "inherited.pptx"), project = path.join(root, "inherited-project");
  await fs.writeFile(file, await zip.generateAsync({ type: "nodebuffer" }));
  run("import_template.mjs", "--source", file, "--project-dir", project);
  const library = JSON.parse(await fs.readFile(path.join(project, "template-library.json"), "utf8"));
  const slot = library.slides[1].slots.find(s => s.shapeName === "nw:body");
  assert.equal(slot.text, ""); assert.equal(slot.capacity.fontSize, 22);
  assert.ok(slot.capacity.bounds.w > 11); assert.deepEqual(slot.capacity.issues, []);
  const plan = configureTemplate(JSON.parse(await fs.readFile(path.join(project, "presentation-plan.json"), "utf8")), library);
  plan.slides = templateRecords([{ title: "封面", content: { subtitle: "验证母版继承" } }, { title: "继承版式", content: { body: "中文正文继承原有字体与位置。" }, layoutId: "template-2" }]);
  await fs.writeFile(path.join(project, "presentation-plan.json"), JSON.stringify(plan));
  run("build_and_qa.mjs", "--project-dir", project, "--skip-render");
  const report = JSON.parse(await fs.readFile(path.join(project, "qa-report.json"), "utf8"));
  assert.deepEqual(report.errors, []);
}));
