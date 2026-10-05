import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createTemplateFixture } from './presentation-template-fixture.mjs';
import { loadPresentationRuntime, createAppRequire } from '../../resources/skills/presentation-studio/scripts/runtime-utils.mjs';
import { applyNativeEditPlan, inspectNativeEditSource } from '../../resources/skills/presentation-studio/scripts/native-edit.mjs';
import { buildNativeEdit } from '../../resources/skills/presentation-studio/scripts/build_edit.mjs';
const { JSZip } = loadPresentationRuntime(import.meta.url);
const { DOMParser } = createAppRequire(import.meta.url)('@xmldom/xmldom');
const a = 'http://schemas.openxmlformats.org/drawingml/2006/main', p = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const parse = s => new DOMParser().parseFromString(s, 'application/xml');
const hash = b => createHash('sha256').update(b).digest('hex');
async function fixture(fn) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'native-visual-edit-test-'));
    try {
        const source = path.join(root, 'source.pptx'), candidate = path.join(root, 'candidate.pptx');
        await createTemplateFixture(source);
        const bytes = await fs.readFile(source), zip = await JSZip.loadAsync(bytes);
        const doc = parse(await zip.file('ppt/slides/slide2.xml').async('string'));
        const shape = Array.from(doc.getElementsByTagNameNS(p, 'sp')).find(s => s.getElementsByTagNameNS(p, 'cNvPr')[0].getAttribute('name') === 'nw:body');
        const shapeId = shape.getElementsByTagNameNS(p, 'cNvPr')[0].getAttribute('id');
        const plan = { schema: 'native-visual-edit-v1', sourceSha256: hash(bytes), slides: [1, 2, 3, 4].map(index => ({ index, objects: [] })) };
        const style = { bounds: { x: 1, y: 2, w: 5, h: 1 }, fontSize: 18, color: '172033' };
        plan.slides[1].objects = [{ shapeId, segments: [{ text: '原有内容示例', ...style }, { text: '第二段内容示例', ...style, bounds: { x: 7, y: 2, w: 5, h: 1 } }] }];
        await fn({ source, candidate, bytes, zip, plan });
    }
    finally {
        await fs.rm(root, { force: true, recursive: true });
    }
}
test('native re-layout changes geometry but preserves source text, chart workbook, masters and all other package parts', () => fixture(async ({ source, candidate, bytes, zip, plan }) => {
    const inventory = await inspectNativeEditSource(source);
    assert.equal(inventory.sourceSha256, hash(bytes));
    assert.equal(inventory.slides.length, 4);
    assert.deepEqual(inventory.slides[2].objects.find(o => o.table).table[2], ['样本二', '数值二', '说明二']);
    assert.equal(inventory.slides[1].objects.find(o => o.shapeId === plan.slides[1].objects[0].shapeId).canResegment, true);
    const result = await applyNativeEditPlan({ source, candidate, plan });
    assert.equal(result.sourceContentPreserved, true);
    assert.deepEqual(await fs.readFile(source), bytes);
    const out = await JSZip.loadAsync(await fs.readFile(candidate));
    for (const name of Object.keys(zip.files).filter(n => !zip.files[n].dir && !/^ppt\/slides\/slide\d+\.xml$/.test(n))) {
        assert.deepEqual(await out.file(name).async('nodebuffer'), await zip.file(name).async('nodebuffer'), name);
    }
    const doc = parse(await out.file('ppt/slides/slide2.xml').async('string'));
    const texts = Array.from(doc.getElementsByTagNameNS(a, 't')).map(n => n.textContent);
    assert.ok(texts.includes('原有内容示例'));
    assert.ok(texts.includes('第二段内容示例'));
    const ids = Array.from(doc.getElementsByTagNameNS(p, 'cNvPr')).map(n => n.getAttribute('id'));
    assert.equal(new Set(ids).size, ids.length);
    await assert.rejects(() => applyNativeEditPlan({ source, candidate, plan }), /EEXIST/);
}));
test('a visual plan cannot silently drop a sentence or use an altered source', () => fixture(async ({ source, candidate, plan }) => {
    const original = structuredClone(plan);
    plan.slides[1].objects[0].segments.pop();
    await assert.rejects(() => applyNativeEditPlan({ source, candidate, plan }), /Text coverage changed/);
    await assert.rejects(() => fs.access(candidate));
    original.sourceSha256 = 'wrong';
    await assert.rejects(() => applyNativeEditPlan({ source, candidate, plan: original }), /Source changed/);
}));
test('an empty native background segment needs no font and retains all overlaid text', () => fixture(async ({ source, candidate, plan }) => {
    plan.slides[1].objects[0].segments.unshift({ text: '', bounds: { x: .8, y: 1.8, w: 11.6, h: 2 }, fill: 'F1F5F8' });
    await applyNativeEditPlan({ source, candidate, plan });
    const result = await inspectNativeEditSource(candidate);
    const objects = result.slides[1].objects;
    assert.ok(objects.some(o => o.paragraphs?.join('') === '原有内容示例'));
    assert.ok(objects.some(o => o.paragraphs?.join('') === '第二段内容示例'));
    const zip = await JSZip.loadAsync(await fs.readFile(candidate));
    const doc = parse(await zip.file('ppt/slides/slide2.xml').async('string'));
    const background = Array.from(doc.getElementsByTagNameNS(p, 'sp')).find(s => s.getElementsByTagNameNS(p, 'cNvPr')[0].getAttribute('id') === plan.slides[1].objects[0].shapeId);
    assert.equal(background.getElementsByTagNameNS(a, 'solidFill')[0].firstChild.getAttribute('val'), 'F1F5F8');
}));
test('source overwrite, slide reordering and partial native tables are rejected', () => fixture(async ({ source, candidate, plan, zip }) => {
    await assert.rejects(() => applyNativeEditPlan({ source, candidate: source, plan }), /overwrite/);
    plan.slides[0].index = 2;
    await assert.rejects(() => applyNativeEditPlan({ source, candidate, plan }), /order/);
    plan.slides[0].index = 1;
    const doc = parse(await zip.file('ppt/slides/slide3.xml').async('string'));
    const shapeId = doc.getElementsByTagNameNS(p, 'graphicFrame')[0].getElementsByTagNameNS(p, 'cNvPr')[0].getAttribute('id');
    plan.slides[2].objects = [{ shapeId, table: { columnWidths: [2, 4, 6], rowHeights: [.5, .5] } }];
    await assert.rejects(() => applyNativeEditPlan({ source, candidate, plan }), /Every native table row/);
}));
test('native table styling retains every cell and makes body text explicit', () => fixture(async ({ source, candidate, plan, zip }) => {
    const input = parse(await zip.file('ppt/slides/slide3.xml').async('string'));
    const shapeId = input.getElementsByTagNameNS(p, 'graphicFrame')[0].getElementsByTagNameNS(p, 'cNvPr')[0].getAttribute('id');
    plan.slides[2].objects = [{ shapeId, table: { x: .6, y: 2, columnWidths: [2, 4, 6], rowHeights: [.5, .7, .7], fontSize: 16, lineHeight: 20, headerText: 'FFFFFF', bodyText: '172033', headerFill: '146B78', bodyFill: 'FFFFFF', alternateFill: 'F1F5F8', borderColor: 'D8E1EB' } }];
    await applyNativeEditPlan({ source, candidate, plan });
    const out = await JSZip.loadAsync(await fs.readFile(candidate)), doc = parse(await out.file('ppt/slides/slide3.xml').async('string'));
    const texts = n => Array.from(n.getElementsByTagNameNS(a, 't')).map(t => t.textContent);
    assert.deepEqual(texts(doc), texts(input));
    const cell = doc.getElementsByTagNameNS(a, 'tc')[3];
    const rpr = cell.getElementsByTagNameNS(a, 'rPr')[0];
    assert.equal(rpr.getElementsByTagNameNS(a, 'srgbClr')[0].getAttribute('val'), '172033');
    const names = Array.from(rpr.childNodes).filter(n => n.nodeType === 1).map(n => n.localName);
    assert.ok(names.indexOf('solidFill') < names.indexOf('latin'), 'DrawingML fill precedes typeface');
}));
test('a failed renderer leaves an unverified draft with the exact plan and cannot reuse stale previews', () => fixture(async ({ source, plan }) => {
    const priorOffice = process.env.LIBREOFFICE_PATH, priorPdf = process.env.PDFTOPPM_PATH;
    const workdir = path.join(path.dirname(source), 'failed-render');
    try {
        // Node is an existing executable but cannot render Office files.
        process.env.LIBREOFFICE_PATH = process.execPath;
        process.env.PDFTOPPM_PATH = process.execPath;
        const result = await buildNativeEdit({ source, plan, workdir });
        assert.equal(result.status, 'blocked');
        assert.equal(result.visualInspection, 'pending');
        assert.ok(result.errors.length > 0);
        assert.deepEqual(JSON.parse(await fs.readFile(path.join(workdir, 'edit-plan.json'), 'utf8')), plan);
        assert.deepEqual(JSON.parse(await fs.readFile(path.join(workdir, 'edit-qa.json'), 'utf8')), result);
        await assert.rejects(() => buildNativeEdit({ source, plan, workdir }), /EEXIST/);
    }
    finally {
        if (priorOffice === undefined) delete process.env.LIBREOFFICE_PATH;
        else process.env.LIBREOFFICE_PATH = priorOffice;
        if (priorPdf === undefined) delete process.env.PDFTOPPM_PATH;
        else process.env.PDFTOPPM_PATH = priorPdf;
    }
}));
