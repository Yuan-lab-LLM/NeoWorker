import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { compileLayoutPlan, renderLayoutSlide, measureText } from "../../resources/skills/presentation-studio/scripts/layout-engine.mjs";
import { LAYOUT_CATALOG, DESIGN_FAMILIES } from "../../resources/skills/presentation-studio/scripts/layout-catalog.mjs";
import { createAppRequire, loadPresentationRuntime } from "../../resources/skills/presentation-studio/scripts/runtime-utils.mjs";
import { compareRenderedText } from "../../resources/skills/presentation-studio/scripts/rendered-layout-check.mjs";
import { normalizeGeneratedPackage } from "../../resources/skills/presentation-studio/scripts/package-check.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const scripts = path.join(root, "resources/skills/presentation-studio/scripts");
const items = [{ label: "可扩展性", body: "容量随业务增长调整。" }, { label: "可维护性", body: "维护过程保留完整记录。" }];
const image = { path: "image.png", alt: "测试图片", source: "local test fixture" };
const contents = {
  "cover-system": { system: { inputs: ['企业文档', '表格'], core: {label:'知识检索', body:'解析与嵌入'}, output:{label:'有据可查',body:'保留原始来源'} } },
  "branch-flow": { flow: { input: {label:'问题',body:'分析问题'}, branches: items, merge:{label:'重排序',body:'组织候选'}, output:{label:'答案',body:'依据知识生成'} } },
  "document-transform": { transformation: {inputLabel:'文档结构',outputLabel:'结构化内容',regions:items,stages:items} },
  "evidence-stage": { sourceNote:'来源：测试夹具，非实测', metrics:[{value:'10+',label:'格式',detail:'覆盖多种文档'}, {value:'>95%',label:'识别',detail:'源材料口径'}, {value:'>90%',label:'检索',detail:'源材料口径'}] },
  "mechanism-track": { mechanisms:items.map((item,i)=>({...item,kind:i?'rank':'search'})), connected:true },
  "cover-image": { image, body: "服务器产品介绍" }, "cover-type": { body: "服务器产品介绍" },
  "editorial-split": { body: "按业务选择配置。", items }, "editorial-rows": { items },
  "image-right": { image, body: "原始图片保留比例。" }, "image-left": { image, body: "原始图片保留比例。" },
  "image-gallery": { images: [{ ...image, caption: "原始资料" }, { ...image, caption: "识别结果" }], body: "保留原图，用原生文字解释。" },
  "image-wide": { image, body: "保留图中标注，完整展示证据。" },
  "metrics-row": { metrics: [{ value: "2U", label: "机架高度" }, { value: "32", label: "插槽" }] },
  "comparison-columns": { columns: items },
  "table-focus": { table: { columns: ["参数", "数值"], rows: [["容量", "8 TB"], ["数量", 32]] } },
  "chart-focus": { chart: { type: "bar", unit: "示例单位", labels: ["A", "B"], series: [{ name: "测试数据", values: [1.5, -2] }] } },
  "architecture-layers": { body: "概念架构", layers: items }, "process-steps": { steps: items },
  "closing-statement": { body: "业务需求决定配置。", items },
};
const slide = (id, content = contents[id]) => ({ index: 1, id: "slide-01", title: "中文与 English 混排", type: "content", layoutId: id, content: structuredClone(content) });
const compile = s => compileLayoutPlan({ title: "测试", slides: [s] });

test("six-stage parsing processes retain every stage at readable sizes", () => {
  const steps = ["文档转图片", "版面分析", "表格识别", "文字识别", "合并段落", "后处理"]
    .map(label => ({ label, body: "识别与整理原始内容，保留阅读顺序。" }));
  const result = compile(slide("process-steps", { body: "从文档到结构化知识", steps }));
  assert.deepEqual(result.errors, []);
  for (const step of steps) assert.ok(result.slides[0].textBoxes.some(b => b.text === step.label && b.size >= 20));
  assert.ok(result.slides[0].textBoxes.find(b => b.field === "steps[5].body"));
  assert.ok(compile(slide("process-steps", { steps: [...steps, steps[0]] })).errors.length);
});

test("semantic diagrams route automatically and retain editable relationships", async () => {
  const ids = ['cover-system', 'branch-flow', 'document-transform', 'mechanism-track'];
  const result = compileLayoutPlan({slides:ids.map(id=>({...slide(id),layoutId:'auto'}))});
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.slides.map(s=>s.layoutId),ids);
  assert.ok(result.slides.every(s=>s.visualSemantics.length && s.objects.every(o=>o.kind !== 'image')));
  assert.equal(result.slides[1].visualSemantics.includes('parallel-branches'),true);
  const {PptxGenJS,JSZip}=loadPresentationRuntime(import.meta.url);
  const pptx=new PptxGenJS(); pptx.layout='LAYOUT_WIDE';
  result.slides.forEach(model=>renderLayoutSlide(pptx,model,{fonts:{body:'Arial'}},root));
  const zip=await JSZip.loadAsync(await pptx.write({outputType:'nodebuffer'}));
  assert.equal(Object.keys(zip.files).filter(p=>/^ppt\/media\/.+/.test(p)).length,0);
  const xml=await zip.file('ppt/slides/slide2.xml').async('string');
  for(const item of items) assert.ok(xml.includes(item.label) && xml.includes(item.body));
  assert.match(xml,/tailEnd type="triangle"/);
});

test("visual schemas reject unsupported or lossy input and retain metric caveats", () => {
  const invalid=[
    slide('branch-flow',{flow:{...contents['branch-flow'].flow,branches:[items[0]]}}),
    slide('branch-flow',{flow:{...contents['branch-flow'].flow,branches:[{...items[0],score:0.8},items[1]]}}),
    slide('document-transform',{transformation:{...contents['document-transform'].transformation,regions:Array(5).fill(items[0])}}),
    slide('mechanism-track',{mechanisms:[{...items[0],kind:'fake-logo'}, {...items[1],kind:'rank'}]}),
    slide('evidence-stage',{...contents['evidence-stage'],sourceNote:''}),
    slide('evidence-stage',{...contents['evidence-stage'],metrics:contents['evidence-stage'].metrics.slice(0,2)}),
  ];
  invalid.forEach(s=>assert.ok(compile(s).errors.length));
  const result=compile(slide('evidence-stage'));
  assert.ok(result.slides[0].textBoxes.some(b=>b.field==='sourceNote' && b.text.includes('非实测')));
  // Different metrics are callouts, never fabricated comparable chart bars.
  assert.ok(result.slides[0].objects.every(o=>o.kind!=='chart'));
});

test("light custom accents keep diagram labels readable", () => {
  const result=compileLayoutPlan({slides:[slide('branch-flow')]},{layoutColors:{accent:'F6CA55',light:'FFF9E6',muted:'BBBBBB'}});
  assert.deepEqual(result.errors,[]);
  const model=result.slides[0];
  const luminance=hex=>hex.match(/../g).map(v=>parseInt(v,16)/255)
    .map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4)
    .reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
  for(const field of ['flow.merge.body','flow.branches[0].body']) {
    const label=model.textBoxes.find(b=>b.field===field);
    const drawnBefore=model.objects.slice(0,model.objects.indexOf(label));
    const surface=drawnBefore.reverse().find(o=>o.kind==='rect' && o.x<=label.x && o.y<=label.y && o.x+o.w>=label.x+label.w && o.y+o.h>=label.y+label.h);
    assert.ok(surface,field);
    const levels=[luminance(label.color),luminance(surface.fill)].sort((a,b)=>b-a);
    assert.ok((levels[0]+.05)/(levels[1]+.05)>=4.5,`${field} must remain readable on its actual surface`);
  }
});

test("processing stage numbers use the badge surface instead of the page background", () => {
  const darkBadge=compile(slide('document-transform')).slides[0];
  const lightBadge=compileLayoutPlan({slides:[slide('document-transform')]},{layoutColors:{accent:'FFF0B3'}}).slides[0];
  assert.equal(darkBadge.textBoxes.find(b=>b.field==='stageNumber[0]').color,'FFFFFF');
  assert.notEqual(lightBadge.textBoxes.find(b=>b.field==='stageNumber[0]').color,'FFFFFF');
});

test("tables allocate height to long identifiers without shrinking text or removing rows", () => {
  const content = { body: "完整模型清单", table: {
    columns: ["类别", "工具 / 模型", "说明"], columnWeights: [1.2, 6.4, 3.4],
    rows: [
      ["向量数据库", "ElasticSearch", "关键词、语义、混合检索"],
      ["编码模型", "Yuan-EB、bge-large-zh-v1.5", "支持中英文"],
      ["编码模型", "bce-embedding-base_v1、text2vec-base-chinese", "支持中英文"],
      ["支持大模型", "Yuan2.0-2B-Mars、Yuan2.0-M32、Baichuan2-7B-Chat", "原材料所列模型"],
      ["支持大模型", "ChatGLM3-6B、Qwen1.5-7B-Chat", "原材料所列模型"],
    ],
  } };
  const result = compile(slide("table-focus", content));
  assert.deepEqual(result.errors, []);
  const table = result.slides[0].objects.find(o => o.kind === "table");
  assert.deepEqual(table.rows.slice(1), content.table.rows);
  assert.ok(Math.max(...table.rowH) > Math.min(...table.rowH));
  assert.ok(Math.abs(table.rowH.reduce((sum, h) => sum + h, 0) - table.h) < 0.00001);
  assert.ok(result.slides[0].textBoxes.filter(b => b.field.startsWith("table.rows")).every(b => b.size === 17));
  const crowded = structuredClone(content); crowded.table.rows[0][1] = "内容".repeat(500);
  assert.match(compile(slide("table-focus", crowded)).errors.join(), /content needs/);
});

test("every layout supports Chinese and Latin in all three design families", () => {
  for (const designFamily of Object.keys(DESIGN_FAMILIES)) for (const layout of LAYOUT_CATALOG) {
    const result = compileLayoutPlan({ designFamily, slides: [slide(layout.id)] });
    assert.deepEqual(result.errors, [], `${designFamily}/${layout.id}`);
    assert.equal(result.slides[0].layoutId, layout.id);
  }
});

test("capacity rejects long CJK, hard newlines and long Latin words without mutating content", () => {
  for (const title of ["数据库服务器".repeat(30), "短句\n".repeat(12), "W".repeat(500)]) {
    const input = slide("cover-type"); input.title = title;
    const before = JSON.stringify(input), result = compile(input);
    assert.match(result.errors.join(), /title.*estimated lines/);
    assert.equal(JSON.stringify(input), before);
  }
  assert.ok(measureText("服务器架构", 1, 24).lines > 1);
  assert.equal(measureText("A\nB", 4, 18).lines, 2);
});

test("automatic layout keeps data semantics and changes editorial composition", () => {
  const records = ["table-focus", "chart-focus", "metrics-row", "editorial-split", "editorial-split"].map(id => ({ ...slide(id), layoutId: "auto" }));
  const result = compileLayoutPlan({ slides: records });
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.slides.map(s => s.layoutId), ["table-focus", "chart-focus", "metrics-row", "editorial-split", "editorial-rows"]);
  const explicit = compile({ ...slide("editorial-rows"), layoutId: "editorial-split", content: contents["editorial-split"] });
  assert.equal(explicit.slides[0].layoutId, "editorial-split");
});

test("unsupported fields, ragged tables, extra rows, missing units and nonfinite data fail instead of losing evidence", () => {
  const inputs = [
    slide("table-focus", { ...contents["table-focus"], metrics: contents["metrics-row"].metrics }),
    slide("table-focus", { table: { columns: ["A", "B"], rows: [[1, 2, 3]] } }),
    slide("table-focus", { table: { columns: ["A", "B"], rows: Array(8).fill([1, 2]) } }),
    slide("table-focus", { table: { columns: ["A", "B"], rows: [[1, 2]], columnWeights: [1, -1] } }),
    slide("chart-focus", { chart: { ...contents["chart-focus"].chart, unit: "" } }),
    slide("chart-focus", { chart: { ...contents["chart-focus"].chart, series: [{ name: "bad", values: [1, null] }] } }),
    slide("image-left", { image: { ...image, source: "" } }),
    slide("metrics-row", { metrics: [{ value: "C-MTEB", label: "榜单" }, { value: "SOTA", label: "效果" }] }),
    slide("does-not-exist", {}),
  ];
  for (const input of inputs) assert.ok(compile(input).errors.length, JSON.stringify(input));
});

test("rendered text measurement catches missing content and overflow, and resolves repeated labels by position", () => {
  const box = { field: "body", text: "真实内容", x: 1, y: 1, w: 2, h: 1 };
  const run = (x, y) => ({ str: "真实内容", fontName: "test", transform: [18, 0, 0, 18, x, y], width: 72 });
  const styles = { test: { ascent: 0.85, descent: -0.15 } };
  assert.equal(compareRenderedText([box], [run(72, 448)], styles, 540).errors.length, 0);
  assert.match(compareRenderedText([box], [], styles, 540).errors[0], /missing/);
  const overflow = compareRenderedText([box], [run(72, 350)], styles, 540).errors[0];
  assert.match(overflow, /outside/);
  assert.match(overflow, /Rendered x\/y\/w\/h in inches: \[1.000, 2.426, 1.000, 0.250\]; assigned: \[1.000, 1.000, 2.000, 1.000\]/);
  assert.equal(compareRenderedText([box], [run(450, 450), run(72, 448)], styles, 540).errors.length, 0);
  const second = { ...box, field: "subtitle", text: "第二段" };
  assert.match(compareRenderedText([box, second], [run(72, 448), { ...run(72, 444), str: "第二段" }], styles, 540).errors.join(), /overlaps/);
});

test("actual PPTX retains native tables, charts, numeric values, source notes and image alt text", async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "neoworker-layout-test-"));
  try {
    await fs.writeFile(path.join(temp, "image.png"), Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64"));
    const { PptxGenJS, JSZip } = loadPresentationRuntime(import.meta.url);
    const pres = new PptxGenJS(); pres.layout = "LAYOUT_WIDE";
    const source = [slide("table-focus"), slide("chart-focus"), slide("image-left")];
    source[0].content.notes = "Source: fixture://table";
    const result = compileLayoutPlan({ slides: source });
    assert.deepEqual(result.errors, []);
    for (const model of result.slides) renderLayoutSlide(pres, model, { fonts: { body: "Arial", heading: "Arial" } }, temp);
    const zip = await JSZip.loadAsync(await pres.write({ outputType: "nodebuffer" }));
    const removed = await normalizeGeneratedPackage(zip);
    assert.equal(removed.filter(s => s.startsWith("ppt/slideMasters/")).length, 2);
    assert.doesNotMatch(await zip.file("[Content_Types].xml").async("string"), /slideMaster2.xml/);
    assert.match(await zip.file("[Content_Types].xml").async("string"), /slideMaster1.xml/);
    const table = await zip.file("ppt/slides/slide1.xml").async("string");
    assert.match(table, /<a:tbl>/); assert.match(table, /8 TB/); assert.match(table, />32</);
    const heights = [...table.matchAll(/<a:tr h="(\d+)"/g)].map(m => Number(m[1]));
    const expectedHeights = result.slides[0].objects.find(o => o.kind === "table").rowH;
    assert.equal(heights.length, expectedHeights.length);
    heights.forEach((h, i) => assert.ok(Math.abs(h - expectedHeights[i] * 914400) <= 1));
    const chart = await zip.file("ppt/charts/chart1.xml").async("string");
    assert.match(chart, /1.5/); assert.match(chart, /-2/);
    assert.doesNotMatch(chart, /multiLvlStrRef/);
    assert.match(chart, /<c:strRef>.*?Sheet1!\$A\$2:\$A\$3/s);
    assert.ok(zip.file("ppt/embeddings/Microsoft_Excel_Worksheet1.xlsx"));
    assert.match(await zip.file("ppt/slides/slide3.xml").async("string"), /descr="测试图片"/);
    assert.match(await zip.file("ppt/notesSlides/notesSlide1.xml").async("string"), /fixture:\/\/table/);
  } finally { await fs.rm(temp, { recursive: true, force: true }); }
});

test("exported images preserve source proportions for contain and cover, including portrait figures", async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "neoworker-image-ratio-"));
  try {
    const { createCanvas } = createAppRequire(import.meta.url)("@napi-rs/canvas");
    const { PptxGenJS, JSZip } = loadPresentationRuntime(import.meta.url);
    const pres = new PptxGenJS(); pres.layout = "LAYOUT_WIDE";
    const cases = [];
    for (const [width, height] of [[300, 100], [100, 300], [100, 100]]) {
      const file = `${width}-${height}.png`;
      const canvas = createCanvas(width, height);
      canvas.getContext("2d").fillRect(0, 0, width, height);
      await fs.writeFile(path.join(temp, file), canvas.toBuffer("image/png"));
      for (const fit of ["contain", "cover"]) {
        const box = { x: 1, y: 2, w: 6, h: 3 };
        cases.push({ width, height, fit, box });
        renderLayoutSlide(pres, { index: cases.length, background: "FFFFFF", objects: [
          { kind: "image", path: file, ...box, fit, alt: "Proportion fixture" },
        ] }, {}, temp);
      }
    }
    const zip = await JSZip.loadAsync(await pres.write({ outputType: "nodebuffer" }));
    for (const [i, { width, height, fit, box }] of cases.entries()) {
      const xml = await zip.file(`ppt/slides/slide${i + 1}.xml`).async("string");
      const pic = xml.match(/<p:pic>.*?<\/p:pic>/s)[0];
      const [, x, y] = pic.match(/<a:off x="(\d+)" y="(\d+)"/).map(Number);
      const [, w, h] = pic.match(/<a:ext cx="(\d+)" cy="(\d+)"/).map(Number);
      const emu = 914400;
      if (fit === "contain") {
        assert.ok(Math.abs(w / h - width / height) < 0.00001);
        assert.ok(w <= box.w * emu && h <= box.h * emu);
        assert.ok(Math.abs(x + w / 2 - (box.x + box.w / 2) * emu) <= 1);
        assert.ok(Math.abs(y + h / 2 - (box.y + box.h / 2) * emu) <= 1);
        assert.doesNotMatch(pic, /<a:srcRect/);
      } else {
        const [, l, r, t, b] = pic.match(/<a:srcRect l="(-?\d+)" r="(-?\d+)" t="(-?\d+)" b="(-?\d+)"/).map(Number);
        assert.ok([l, r, t, b].every(n => n >= 0));
        assert.ok(Math.abs((w / h) * (1 - (t + b) / 1e5) / (1 - (l + r) / 1e5) - width / height) < 0.0001);
        assert.equal(w, box.w * emu); assert.equal(h, box.h * emu);
      }
    }
  } finally { await fs.rm(temp, { recursive: true, force: true }); }
});

test("package normalization refuses to hide missing referenced masters or slide content", async () => {
  const { JSZip } = loadPresentationRuntime(import.meta.url);
  for (const part of ["ppt/slideMasters/slideMaster2.xml", "ppt/slides/slide2.xml"]) {
    const zip = new JSZip();
    zip.file("[Content_Types].xml", `<Types><Override PartName="/${part}" ContentType="test"/></Types>`);
    zip.file("ppt/_rels/presentation.xml.rels", '<Relationships><Relationship Target="slideMasters/slideMaster2.xml"/></Relationships>');
    await assert.rejects(normalizeGeneratedPackage(zip), /missing part/);
  }
});

test("default CLI bootstrap and build use catalog; overflow cannot publish and existing module decks still build", async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "neoworker-catalog-cli-"));
  const run = (script, args) => execFileSync(process.execPath, [path.join(scripts, script), "--project-dir", temp, ...args], { cwd: root, encoding: "utf8", stdio: "pipe" });
  try {
    run("bootstrap_project.mjs", ["--title", "服务器产品", "--language", "chinese", "--design-family", "auto"]);
    const planPath = path.join(temp, "presentation-plan.json");
    const plan = JSON.parse(await fs.readFile(planPath, "utf8"));
    assert.equal(plan.layoutEngine, "catalog-v1");
    assert.equal(plan.designFamily, "technology");
    const theme = JSON.parse(await fs.readFile(path.join(temp, 'theme.json'), 'utf8'));
    assert.equal(theme.palette, 'auto');
    assert.equal(theme.colors.accent, DESIGN_FAMILIES.technology.accent);
    assert.equal(theme.colors.light, DESIGN_FAMILIES.technology.light);
    assert.equal(theme.layoutColors, undefined);
    assert.deepEqual((await fs.readdir(path.join(temp, "slides"))).filter(p => p.endsWith(".mjs")), []);
    assert.throws(() => run("bootstrap_project.mjs", []), /Project already exists/);
    plan.slides = ["cover-type", "table-focus"].map((id, i) => ({ ...slide(id), index: i + 1, id: `s${i + 1}`, intent: "测试原生输出", takeaway: "内容保持完整", role: i ? "table" : "opening" }));
    await fs.writeFile(planPath, JSON.stringify(plan));
    run("build_and_qa.mjs", ["--skip-render"]);
    const report = JSON.parse(await fs.readFile(path.join(temp, "qa-report.json"), "utf8"));
    assert.deepEqual(report.errors, []); assert.equal(report.layout.engine, "catalog-v1");
    assert.equal(report.visualInspection, "pending"); assert.equal(report.status, "warning");
    plan.slides[1].title = "过长的标题".repeat(50);
    await fs.writeFile(planPath, JSON.stringify(plan));
    assert.throws(() => run("build_and_qa.mjs", ["--skip-render"]));
    await assert.rejects(fs.access(path.join(temp, "output/presentation-v2.pptx")));
    const legacy = path.join(temp, "legacy");
    execFileSync(process.execPath, [path.join(scripts, "bootstrap_project.mjs"), "--project-dir", legacy, "--title", "Legacy", "--layout-engine", "modules"], { cwd: root });
    execFileSync(process.execPath, [path.join(scripts, "build_and_qa.mjs"), "--project-dir", legacy, "--skip-render"], { cwd: root, stdio: "pipe" });
    assert.equal(JSON.parse(await fs.readFile(path.join(legacy, "qa-report.json"))).slideCount, 2);
  } finally { await fs.rm(temp, { recursive: true, force: true }); }
});


test('source galleries auto-route, retain all image bytes and never crop evidence', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'neoworker-evidence-gallery-'));
  try {
    const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
    await fs.writeFile(path.join(dir, 'image.png'), bytes);
    const content = { images: Array.from({length:4}, (_,i)=>({...image,caption:`解析样例 ${i+1}`})) };
    const result = compile({...slide('image-gallery', content),layoutId:'auto'});
    assert.deepEqual(result.errors, []);
    assert.equal(result.slides[0].layoutId, 'image-gallery');
    const {PptxGenJS,JSZip} = loadPresentationRuntime(import.meta.url);
    const pptx = new PptxGenJS(); pptx.layout='LAYOUT_WIDE';
    renderLayoutSlide(pptx, result.slides[0], {fonts:{body:'Arial'}}, dir);
    const zip = await JSZip.loadAsync(await pptx.write({outputType:'nodebuffer'}));
    const xml = await zip.file('ppt/slides/slide1.xml').async('string');
    assert.equal((xml.match(/<p:pic>/g)||[]).length,4);
    assert.doesNotMatch(xml, /<a:srcRect[^>]+[lrtb]=/);
    for(const file of Object.values(zip.files).filter(f=>!f.dir && f.name.startsWith('ppt/media/'))) assert.deepEqual(await file.async('nodebuffer'),bytes);
    assert.ok(compile(slide('image-gallery',{images:Array(5).fill(content.images[0])})).errors.length);
    assert.match(compile(slide('image-gallery',{images:[{...content.images[0],fit:'cover'},content.images[1]]})).errors.join(),/do not crop/);
    assert.match(compile(slide('image-gallery',{images:[{...content.images[0],source:''},content.images[1]]})).errors.join(),/source/);
  } finally { await fs.rm(dir, {recursive:true,force:true}); }
});
