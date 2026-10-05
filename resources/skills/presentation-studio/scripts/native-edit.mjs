// Source-preserving visual edits. A plan supplies design decisions; the writer
// preserves package lineage and rejects missing text/table data before writing.
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { createAppRequire, parseArgs } from './runtime-utils.mjs';
const require = createAppRequire(import.meta.url), JSZip = require('jszip');
const { DOMParser, XMLSerializer } = require('@xmldom/xmldom');
const NS = { a: 'http://schemas.openxmlformats.org/drawingml/2006/main', p: 'http://schemas.openxmlformats.org/presentationml/2006/main' };
const all = (n, k) => Array.from(n.getElementsByTagNameNS(NS[k.split(':')[0]], k.split(':')[1]));
const direct = (n, k) => Array.from(n?.childNodes || []).find(c => c.namespaceURI === NS[k.split(':')[0]] && c.localName === k.split(':')[1]);
const text = n => all(n, 'a:t').map(t => t.textContent).join('');
const normalized = s => String(s).normalize('NFC').replace(/[\s•]/gu, '');
function coverageDifference(expected, actual) {
    const left = Array.from(normalized(expected)), right = Array.from(normalized(actual));
    let at = 0;
    while (at < left.length && left[at] === right[at]) at++;
    const excerpt = chars => JSON.stringify(chars.slice(Math.max(0, at - 12), at + 28).join(''));
    return `First difference at normalized character ${at + 1}: source ${excerpt(left)}, planned ${excerpt(right)} (source ${left.length}, planned ${right.length} characters).`;
}
const hash = b => createHash('sha256').update(b).digest('hex');
const parse = s => {
    const errors = [];
    const d = new DOMParser({ errorHandler: { warning: () => { }, error: m => errors.push(m), fatalError: m => errors.push(m) } }).parseFromString(s, 'application/xml');
    if (errors.length)
        throw new Error(errors.join('; '));
    return d;
};
function element(doc, name, attrs = {}) { const n = doc.createElementNS(NS[name.split(':')[0]], name); for (const [k, v] of Object.entries(attrs))
    n.setAttribute(k, String(v)); return n; }
function fill(doc, color) { if (!/^[\da-f]{6}$/i.test(color || ''))
    throw new Error('Color must be six hex digits.'); const n = element(doc, 'a:solidFill'); n.appendChild(element(doc, 'a:srgbClr', { val: color })); return n; }
function setFill(doc, node, color) {
    for (const c of Array.from(node.childNodes))
        if (['solidFill', 'noFill', 'gradFill', 'blipFill', 'pattFill', 'grpFill'].includes(c.localName))
            node.removeChild(c);
    // DrawingML has ordered children. A text fill precedes its typeface, a shape
    // fill precedes the outline, and a table cell fill follows its borders.
    const after = node.localName === 'rPr' ? ['effectLst', 'effectDag', 'highlight', 'uLnTx', 'uLn', 'uFillTx', 'uFill', 'latin', 'ea', 'cs', 'sym', 'hlinkClick', 'hlinkMouseOver', 'rtl', 'extLst'] :
        node.localName === 'spPr' ? ['ln', 'effectLst', 'effectDag', 'scene3d', 'sp3d', 'extLst'] :
            node.localName === 'tcPr' ? ['headers', 'extLst'] : ['prstDash', 'custDash', 'round', 'bevel', 'miter', 'headEnd', 'tailEnd', 'extLst'];
    const next = Array.from(node.childNodes).find(c => after.includes(c.localName));
    node.insertBefore(color ? fill(doc, color) : element(doc, 'a:noFill'), next || null);
}
function bounds(doc, node, box) {
    const v = ['x', 'y', 'w', 'h'].map(k => Number(box?.[k]));
    if (!v.every(Number.isFinite) || v[2] <= 0 || v[3] <= 0)
        throw new Error('Invalid native edit bounds.');
    const t = element(doc, node.localName === 'graphicFrame' ? 'p:xfrm' : 'a:xfrm');
    t.appendChild(element(doc, 'a:off', { x: Math.round(v[0] * 914400), y: Math.round(v[1] * 914400) }));
    t.appendChild(element(doc, 'a:ext', { cx: Math.round(v[2] * 914400), cy: Math.round(v[3] * 914400) }));
    const parent = node.localName === 'graphicFrame' ? node : direct(node, 'p:spPr');
    const old = direct(parent, node.localName === 'graphicFrame' ? 'p:xfrm' : 'a:xfrm');
    if (old)
        parent.replaceChild(t, old);
    else
        parent.insertBefore(t, parent.firstChild);
}
function textStyle(doc, tx, style) {
    // Empty segments can provide a native background behind split text. They
    // have no glyphs to style and should not require a meaningless font size.
    if (!text(tx))
        return;
    const size = Number(style.fontSize);
    if (!Number.isFinite(size) || size < 8 || size > 96)
        throw new Error('Font size must be 8–96 pt.');
    const body = direct(tx, 'a:bodyPr');
    for (const [k, v] of Object.entries({ lIns: 0, tIns: 0, rIns: 0, bIns: 0, anchor: 't', wrap: 'square' }))
        body.setAttribute(k, String(v));
    for (const c of Array.from(body.childNodes))
        if (['normAutofit', 'spAutoFit', 'noAutofit'].includes(c.localName))
            body.removeChild(c);
    body.appendChild(element(doc, 'a:noAutofit'));
    for (const p of Array.from(tx.childNodes).filter(n => n.localName === 'p')) {
        let pr = direct(p, 'a:pPr');
        if (!pr) {
            pr = element(doc, 'a:pPr');
            p.insertBefore(pr, p.firstChild);
        }
        pr.setAttribute('algn', style.align || 'l');
        pr.setAttribute('marL', '0');
        pr.setAttribute('indent', '0');
        for (const c of Array.from(pr.childNodes))
            if (['lnSpc', 'spcBef', 'spcAft', 'buChar', 'buAutoNum', 'buNone'].includes(c.localName))
                pr.removeChild(c);
        const line = element(doc, 'a:lnSpc');
        line.appendChild(element(doc, 'a:spcPts', { val: Math.round((style.lineHeight || size * 1.23) * 100) }));
        pr.appendChild(line);
        for (const tag of ['spcBef', 'spcAft']) {
            const sp = element(doc, `a:${tag}`);
            sp.appendChild(element(doc, 'a:spcPts', { val: 0 }));
            pr.appendChild(sp);
        }
        pr.appendChild(element(doc, 'a:buNone'));
        for (const run of all(p, 'a:r')) {
            let rpr = direct(run, 'a:rPr');
            if (!rpr) {
                rpr = element(doc, 'a:rPr');
                run.insertBefore(rpr, run.firstChild);
            }
            rpr.setAttribute('sz', Math.round(size * 100));
            rpr.setAttribute('b', style.bold ? '1' : '0');
            setFill(doc, rpr, style.color || '172033');
            for (const fontTag of ['a:latin', 'a:ea', 'a:cs']) {
                let font = direct(rpr, fontTag);
                if (!font) {
                    font = element(doc, fontTag);
                    rpr.appendChild(font);
                }
                font.setAttribute('typeface', style.fontFamily || 'PingFang SC');
            }
        }
    }
}
function replaceText(doc, shape, value) {
    const tx = direct(shape, 'p:txBody');
    if (!tx)
        throw new Error('Shape has no native text body.');
    // Re-segmentation is deliberately limited to plain, static text. Rich fields,
    // hyperlinks and animations must use a more precise edit route.
    if (all(tx, 'a:hlinkClick').length || all(tx, 'a:hlinkMouseOver').length || all(tx, 'a:fld').length)
        throw new Error('Cannot re-segment linked text or fields.');
    for (const p of Array.from(tx.childNodes).filter(n => n.localName === 'p'))
        tx.removeChild(p);
    for (const line of String(value).split('\n')) {
        const p = element(doc, 'a:p'), r = element(doc, 'a:r'), t = element(doc, 'a:t');
        t.appendChild(doc.createTextNode(line));
        r.appendChild(element(doc, 'a:rPr'));
        r.appendChild(t);
        p.appendChild(r);
        tx.appendChild(p);
    }
    return tx;
}
function styleShape(doc, shape, style) {
    if (style.bounds)
        bounds(doc, shape, style.bounds);
    const pr = direct(shape, 'p:spPr');
    setFill(doc, pr, style.fill || null);
    const ln = direct(pr, 'a:ln');
    if (ln)
        pr.removeChild(ln);
    const line = element(doc, 'a:ln');
    line.appendChild(element(doc, 'a:noFill'));
    pr.appendChild(line);
    textStyle(doc, direct(shape, 'p:txBody'), style);
}
function styleTable(doc, shape, edit) {
    const table = all(shape, 'a:tbl')[0];
    if (!table)
        throw new Error('Target is not a table.');
    const columns = all(table, 'a:gridCol'), rows = all(table, 'a:tr');
    if (edit.columnWidths?.length !== columns.length || edit.rowHeights?.length !== rows.length)
        throw new Error(`Every native table row/column must be retained: expected ${columns.length} column widths and ${rows.length} row heights; received ${edit.columnWidths?.length ?? 0} and ${edit.rowHeights?.length ?? 0}.`);
    const sizes = [...edit.columnWidths, ...edit.rowHeights];
    if (sizes.some(n => !Number.isFinite(n) || n <= 0))
        throw new Error('Invalid table dimensions.');
    bounds(doc, shape, { x: edit.x, y: edit.y, w: edit.columnWidths.reduce((a, b) => a + b, 0), h: edit.rowHeights.reduce((a, b) => a + b, 0) });
    columns.forEach((c, i) => c.setAttribute('w', Math.round(edit.columnWidths[i] * 914400)));
    rows.forEach((r, i) => {
        r.setAttribute('h', Math.round(edit.rowHeights[i] * 914400));
        const cells = Array.from(r.childNodes).filter(n => n.localName === 'tc');
        cells.forEach((cell, j) => {
            if (['gridSpan', 'rowSpan', 'hMerge', 'vMerge'].some(k => cell.hasAttribute(k)))
                throw new Error('Merged table cells require a dedicated edit.');
            const tx = direct(cell, 'a:txBody');
            textStyle(doc, tx, { fontSize: edit.fontSize, lineHeight: edit.lineHeight, bold: i === 0 || j === 0, color: i === 0 ? edit.headerText : edit.bodyText, fontFamily: edit.fontFamily });
            let pr = direct(cell, 'a:tcPr');
            if (!pr) {
                pr = element(doc, 'a:tcPr');
                cell.appendChild(pr);
            }
            const color = i === 0 ? edit.headerFill : (i % 2 ? edit.bodyFill : edit.alternateFill);
            setFill(doc, pr, color);
            pr.setAttribute('anchor', 'ctr');
            for (const [k, v] of Object.entries({ marL: 64000, marR: 64000, marT: 32000, marB: 32000 }))
                pr.setAttribute(k, v);
            for (const line of Array.from(pr.childNodes).filter(n => /^ln[LRBT]$/.test(n.localName))) {
                setFill(doc, line, edit.borderColor);
                line.setAttribute('w', '4500');
            }
        });
    });
}
export async function inspectNativeEditSource(source) {
    const bytes = await fs.readFile(source), zip = await JSZip.loadAsync(bytes);
    const presentation = parse(await zip.file('ppt/presentation.xml').async('string'));
    const rel = parse(await zip.file('ppt/_rels/presentation.xml.rels').async('string'));
    const targets = new Map(Array.from(rel.documentElement.childNodes).filter(n => n.nodeType === 1).map(n => [n.getAttribute('Id'), n.getAttribute('Target')]));
    const size = all(presentation, 'p:sldSz')[0];
    const inventory = { source: path.resolve(source), sourceSha256: hash(bytes), sizeInches: { w: Number(size.getAttribute('cx')) / 914400, h: Number(size.getAttribute('cy')) / 914400 }, slides: [] };
    for (const [i, id] of all(presentation, 'p:sldId').entries()) {
        const target = targets.get(id.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id'));
        const part = target?.startsWith('/') ? target.slice(1) : `ppt/${target}`;
        if (!/^ppt\/slides\/slide\d+\.xml$/.test(part))
            throw new Error('Unsupported slide part relationship.');
        const doc = parse(await zip.file(part).async('string')), tree = all(doc, 'p:spTree')[0];
        const objects = Array.from(tree.childNodes).filter(n => ['sp', 'graphicFrame', 'pic', 'grpSp'].includes(n.localName)).map(n => {
            const meta = all(n, 'p:cNvPr')[0], table = all(n, 'a:tbl')[0];
            const frame = direct(n, 'p:xfrm') || direct(direct(n, 'p:spPr'), 'a:xfrm'), off = direct(frame, 'a:off'), ext = direct(frame, 'a:ext');
            return { shapeId: meta?.getAttribute('id'), name: meta?.getAttribute('name'), kind: n.localName,
                bounds: off && ext ? { x: Number(off.getAttribute('x')) / 914400, y: Number(off.getAttribute('y')) / 914400, w: Number(ext.getAttribute('cx')) / 914400, h: Number(ext.getAttribute('cy')) / 914400 } : null,
                paragraphs: table ? undefined : all(n, 'a:p').map(text),
                table: table ? all(table, 'a:tr').map(r => Array.from(r.childNodes).filter(c => c.localName === 'tc').map(text)) : undefined,
                canResegment: n.localName === 'sp' && !all(doc, 'p:timing').length && !all(n, 'a:hlinkClick').length && !all(n, 'a:hlinkMouseOver').length && !all(n, 'a:fld').length };
        });
        inventory.slides.push({ index: i + 1, objects });
    }
    return inventory;
}
export async function applyNativeEditPlan({ source, plan, candidate }) {
    if (plan.schema !== 'native-visual-edit-v1')
        throw new Error('Unknown native edit plan schema.');
    const bytes = await fs.readFile(source);
    if (hash(bytes) !== plan.sourceSha256)
        throw new Error('Source changed since design review.');
    if (await fs.realpath(candidate).catch(() => null) === await fs.realpath(source))
        throw new Error('Cannot overwrite the source.');
    const zip = await JSZip.loadAsync(bytes), presentation = parse(await zip.file('ppt/presentation.xml').async('string'));
    const ids = all(presentation, 'p:sldId');
    if (plan.slides.length !== ids.length)
        throw new Error('Review and classify every source slide.');
    const rel = parse(await zip.file('ppt/_rels/presentation.xml.rels').async('string'));
    const targets = new Map(Array.from(rel.documentElement.childNodes).filter(n => n.nodeType === 1).map(n => [n.getAttribute('Id'), n.getAttribute('Target')]));
    const changed = [];
    let replacements = 0;
    for (let index = 1; index <= ids.length; index++) {
        const edit = plan.slides[index - 1];
        if (edit.index !== index)
            throw new Error(`Slide order cannot change: expected index ${index}, received ${edit.index}. Keep slides in their original order.`);
        const target = targets.get(ids[index - 1].getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id'));
        const part = target?.startsWith('/') ? target.slice(1) : `ppt/${target}`;
        if (!/^ppt\/slides\/slide\d+\.xml$/.test(part))
            throw new Error('Unsupported slide part relationship.');
        const doc = parse(await zip.file(part).async('string')), tree = all(doc, 'p:spTree')[0], before = normalized(text(tree));
        const originals = Array.from(tree.childNodes).filter(n => ['sp', 'graphicFrame', 'pic'].includes(n.localName));
        const objects = new Map(originals.map(n => [all(n, 'p:cNvPr')[0]?.getAttribute('id'), n]));
        let nextId = Math.max(...all(doc, 'p:cNvPr').map(n => Number(n.getAttribute('id'))), 1) + 1;
        if (edit.background) {
            const cSld = all(doc, 'p:cSld')[0];
            let bg = direct(cSld, 'p:bg');
            if (bg)
                cSld.removeChild(bg);
            bg = element(doc, 'p:bg');
            const pr = element(doc, 'p:bgPr');
            pr.appendChild(fill(doc, edit.background));
            bg.appendChild(pr);
            cSld.insertBefore(bg, cSld.firstChild);
        }
        const seen = new Set();
        for (const change of edit.objects || []) {
            if (seen.has(change.shapeId))
                throw new Error(`Duplicate shape edit in slide ${index}, shape ${change.shapeId}. Combine all segments for this source shape into one objects entry.`);
            seen.add(change.shapeId);
            const shape = objects.get(change.shapeId);
            if (!shape)
                throw new Error(`Unknown source shape ${change.shapeId}.`);
            if (change.removeEmpty) {
                if (shape.localName !== 'sp' || text(shape) || all(shape, 'a:blip').length)
                    throw new Error('Only empty decorative shapes may be removed.');
                tree.removeChild(shape);
                continue;
            }
            if (change.table) {
                const before = text(shape);
                try { styleTable(doc, shape, change.table); }
                catch (error) { throw new Error(`Slide ${index}, shape ${change.shapeId}: ${error.message}`); }
                if (text(shape) !== before)
                    throw new Error('Table content changed.');
                continue;
            }
            if (shape.localName !== 'sp')
                throw new Error('Only native text shapes can be segmented.');
            const segments = change.segments;
            const plannedText = segments?.map(s => s.text).join('') || '';
            if (!segments?.length || normalized(plannedText) !== normalized(text(shape)))
                throw new Error(`Text coverage changed in slide ${index}, shape ${change.shapeId}. Preserve every word/number in order. ${coverageDifference(text(shape), plannedText)}`);
            if (all(doc, 'p:timing').length)
                throw new Error('Animated slides require a dedicated native edit.');
            if (all(shape, 'a:hlinkClick').length || all(shape, 'a:hlinkMouseOver').length || all(shape, 'a:fld').length)
                throw new Error('Linked text and fields require a dedicated native edit.');
            for (let i = 0; i < segments.length; i++) {
                const segment = segments[i], copy = shape.cloneNode(true), meta = all(copy, 'p:cNvPr')[0];
                if (i)
                    meta.setAttribute('id', String(nextId++));
                meta.setAttribute('name', `${meta.getAttribute('name') || 'Text'} — ${segment.role || i}`);
                replaceText(doc, copy, segment.text);
                try { styleShape(doc, copy, segment); }
                catch (error) { throw new Error(`Slide ${index}, shape ${change.shapeId}, segment ${i + 1}: ${error.message}`); }
                tree.insertBefore(copy, shape);
            }
            tree.removeChild(shape);
            replacements += segments.length;
        }
        if (normalized(text(tree)) !== before)
            throw new Error(`Slide ${index}: source text coverage changed.`);
        zip.file(part, new XMLSerializer().serializeToString(doc));
        changed.push(part);
    }
    const output = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    await fs.writeFile(candidate, output, { flag: 'wx' });
    return { sourceSha256: hash(bytes), candidateSha256: hash(output), slideCount: ids.length, changedParts: changed, nativeTextShapesWritten: replacements, sourceContentPreserved: true };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    const args = parseArgs(process.argv.slice(2));
    if (!args.source || !args.inventory)
        throw new Error('Usage: native-edit.mjs --source original.pptx --inventory NEW_INVENTORY.json');
    const inventory = await inspectNativeEditSource(args.source);
    await fs.writeFile(args.inventory, JSON.stringify(inventory, null, 2), { flag: 'wx' });
    console.log(JSON.stringify({ slideCount: inventory.slides.length, sourceSha256: inventory.sourceSha256, inventory: path.resolve(args.inventory) }));
}
