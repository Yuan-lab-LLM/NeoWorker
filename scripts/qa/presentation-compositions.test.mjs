import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadPresentationRuntime } from '../../resources/skills/presentation-studio/scripts/runtime-utils.mjs';
import { inspectNativeEditSource, applyNativeEditPlan } from '../../resources/skills/presentation-studio/scripts/native-edit.mjs';
import { composeNativeEdit, NATIVE_COMPOSITIONS } from '../../resources/skills/presentation-studio/scripts/compose_native_edit.mjs';
const normalized = text => text.normalize('NFC').replace(/[\s•]/gu, '');
async function withSource(fn) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'native-composition-'));
    try {
        const { PptxGenJS } = loadPresentationRuntime(import.meta.url);
        const pptx = new PptxGenJS();
        pptx.layout = 'LAYOUT_WIDE';
        const text = (slide, name, value) => slide.addText(value, { objectName: name, x: 1, y: 1, w: 11, h: 5, fontSize: 20 });
        const add = (title, groups) => {
            const slide = pptx.addSlide();
            text(slide, 'Title', title);
            if (pptx._slides.length > 1)
                text(slide, 'Kicker', `RESEARCH ${pptx._slides.length}`);
            groups.forEach((value, i) => text(slide, `Evidence ${i}`, value));
            return slide;
        };
        add('水务系统与城市韧性', ['面向技术团队的部署方案']);
        add('主要发现', ['覆盖范围\n12 个区域\n统计截至 2025 年。', '服务目标\n99.9% 可用性\n目标值不等于承诺值。']);
        add('平台定义', ['统一调度：管理传感器数据并协调巡检任务。\n接入范围：覆盖水压与流量传感器。\n分析结果：用于运营辅助判断。']);
        add('平台能力', ['采集：接入现场设备。\n清洗：标注缺失数据。\n分析：计算压力波动。\n告警：通知值班人员。\n审计：保留操作记录。\n复盘：评估处理时长。']);
        add('部署方式', ['试点：先验证一个区域。\n扩展：逐批接入其他区域。\n运行：持续核对采集质量。\n维护：定期更新校准值。']);
        add('三个工作环节', ['01\n采集侧：记录原始数据，保留时间戳与设备编号。', '02\n分析侧识别异常，交由技术人员核实。', '03\n处理侧跟进结果，记录完成时间。']);
        add('结论', ['建立可追溯的运行过程。\n优先核对数据质量。\n按区域逐步扩大覆盖。']);
        const table = add('区域对比', []);
        table.addTable([['区域', '现状', '建议'], ['甲区', '设备 20 台', '核对通信质量'], ['乙区', '设备 35 台', '补充校准记录']], { x: 1, y: 2, w: 11, h: 3, fontSize: 18 });
        add('两种策略', ['方案甲：按区域部署，逐批验证。', '方案乙：统一部署，集中核验。']);
        const source = path.join(root, 'original.pptx'), candidate = path.join(root, 'candidate.pptx');
        await pptx.writeFile({ fileName: source });
        const inventory = await inspectNativeEditSource(source);
        await fn({ root, source, candidate, inventory });
    }
    finally {
        await fs.rm(root, { recursive: true, force: true });
    }
}
test('semantic compositions round-trip unrelated source facts and native table cells without changing the original', () => withSource(async ({ source, candidate, inventory }) => {
    const before = await fs.readFile(source);
    const { plan } = composeNativeEdit(inventory);
    assert.deepEqual(new Set(plan.slides.map(s => s.composition)), new Set(NATIVE_COMPOSITIONS));
    const result = await applyNativeEditPlan({ source, candidate, plan });
    assert.equal(result.sourceContentPreserved, true);
    assert.deepEqual(await fs.readFile(source), before);
    const output = await inspectNativeEditSource(candidate);
    assert.equal(output.slides.length, inventory.slides.length);
    for (const [i, slide] of inventory.slides.entries()) {
        assert.equal(normalized(output.slides[i].objects.filter(o => !o.table).flatMap(o => o.paragraphs).join('')), normalized(slide.objects.filter(o => !o.table).flatMap(o => o.paragraphs).join('')));
        assert.deepEqual(output.slides[i].objects.filter(o => o.table).map(o => o.table), slide.objects.filter(o => o.table).map(o => o.table));
    }
    const comparison = plan.slides[5].objects.flatMap(o => o.segments || []);
    assert.equal(comparison.filter(s => s.role === 'heading').length, 3);
    assert.equal(new Set(comparison.filter(s => s.role === 'body').map(s => s.bounds.y)).size, 1, 'different lead lengths retain aligned evidence baselines');
}));
test('explicit roles work with arbitrary source object names; omitted or duplicated content is rejected', () => withSource(async ({ inventory }) => {
    const renamed = structuredClone(inventory);
    const slides = renamed.slides.map((slide, i) => {
        const original = inventory.slides[i];
        slide.objects.forEach((o, n) => { o.name = `Custom ${n}`; });
        return { index: slide.index, titleShapeId: original.objects.find(o => o.name === 'Title').shapeId, kickerShapeId: original.objects.find(o => o.name === 'Kicker')?.shapeId };
    });
    assert.throws(() => composeNativeEdit(renamed), /titleShapeId/);
    assert.equal(composeNativeEdit(renamed, { slides }).plan.slides.length, 9);
    const body = inventory.slides[1].objects.filter(o => o.name.startsWith('Evidence'));
    assert.throws(() => composeNativeEdit(inventory, { slides: [{ index: 2, contentShapeIds: [body[0].shapeId] }] }), /every source object/);
    assert.throws(() => composeNativeEdit(inventory, { slides: [{ index: 2, contentShapeIds: [body[0].shapeId, body[0].shapeId] }] }), /every source object/);
    assert.throws(() => composeNativeEdit(inventory, { slides: [{ index: 2, contentShapeIds: [body[0].shapeId, body[1].shapeId, body[0].shapeId] }] }), /every source object/);
    assert.throws(() => composeNativeEdit(inventory, { slides: [{ index: 2, kickerShapeId: 'missing' }] }), /kickerShapeId/);
    assert.throws(() => composeNativeEdit(inventory, { slides: [{ index: 2 }, { index: 2 }] }), /unique/);
    assert.throws(() => composeNativeEdit(inventory, { slides: [{ index: 2, layout: 'fake' }] }), /unknown composition/);
}));
test('unsupported assets and excessive density fail explicitly instead of losing source evidence', () => withSource(async ({ inventory }) => {
    for (const kind of ['pic', 'grpSp', 'graphicFrame']) {
        const changed = structuredClone(inventory);
        changed.slides[0].objects.push({ kind, shapeId: '999', name: 'Brand asset', paragraphs: [] });
        assert.throws(() => composeNativeEdit(changed), /images, charts or groups/);
    }
    const dense = structuredClone(inventory);
    dense.slides[3].objects.find(o => o.name === 'Evidence 0').paragraphs[0] += '必须保留的测试证据。'.repeat(200);
    assert.throws(() => composeNativeEdit(dense), /exceeds|does not fit|dense/);
    const denseTable = structuredClone(inventory);
    const rows = denseTable.slides[7].objects.find(o => o.table).table;
    for (let i = 0; i < 40; i++)
        rows.push([`区域 ${i}`, '所有数据均需保留', '核对完整的记录与更新历史']);
    assert.throws(() => composeNativeEdit(denseTable), /complete table cannot fit/);
    const portrait = structuredClone(inventory);
    portrait.sizeInches = { w: 7.5, h: 13.3 };
    assert.throws(() => composeNativeEdit(portrait), /landscape/);
}));
