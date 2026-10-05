// Compile semantic page choices into source-preserving native edits. The model
// chooses a composition; it does not transcribe source copy or guess coordinates.
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { inspectNativeEditSource } from './native-edit.mjs';
import { measureText } from './layout-engine.mjs';
import { parseArgs } from './runtime-utils.mjs';
export const NATIVE_COMPOSITIONS = ['cover', 'summary-grid', 'definition-split', 'capability-grid', 'labelled-rows', 'comparison', 'columns', 'closing', 'table'];
const copy = o => (o.paragraphs || []).filter(t => t.trim()).map(t => t.replace(/^\s*•\s*/u, '').trim());
const labelPair = text => {
    const at = text.search(/[：:]/u);
    return at > 0 ? [text.slice(0, at + 1), text.slice(at + 1).trim()] : ['', text];
};
const words = s => String(s).normalize('NFC').replace(/[\s•]/gu, '');
const palette = { ink: '172033', accent: '146B78', muted: '596678', white: 'FFFFFF', light: 'D7E3ED' };
function balanceHeading(text, width, size) {
    if (!text || text.includes('\n') || measureText(text, width * .94, size, { bold: true }).lines !== 2)
        return text;
    const weight = s => Array.from(s).reduce((sum, c) => sum + (/[\u2e80-\ua4cf\uff00-\uffef]/u.test(c) ? 1 : .55), 0);
    const candidates = Array.from(new Intl.Segmenter('zh', { granularity: 'word' }).segment(text))
        .map(s => s.index).filter(i => i > 0 && !/^[\s，,。；;：:]/u.test(text.slice(i)))
        .map(i => [text.slice(0, i).trimEnd(), text.slice(i).trimStart()])
        .filter(parts => parts.every(s => measureText(s, width * .94, size, { bold: true }).lines === 1))
        .sort((a, b) => Math.abs(weight(a[0]) - weight(a[1])) - Math.abs(weight(b[0]) - weight(b[1])));
    return candidates[0]?.join('\n') || text;
}
function roles(slide, brief = {}) {
    if (slide.objects.some(o => !['sp', 'graphicFrame'].includes(o.kind) || (o.kind === 'graphicFrame' && !o.table)))
        throw new Error(`Slide ${slide.index}: images, charts or groups require a reviewed native edit; automatic text composition cannot move them safely.`);
    const texts = slide.objects.filter(o => copy(o).length && !o.table);
    const get = (id, pattern) => id ? slide.objects.find(o => o.shapeId === id) : texts.find(o => pattern.test(o.name || ''));
    const title = get(brief.titleShapeId, /^(?:title|标题)$/i);
    if (!title || !title.canResegment)
        throw new Error(`Slide ${slide.index}: supply a valid titleShapeId in the composition brief.`);
    const kicker = get(brief.kickerShapeId, /^(?:kicker|section|页眉)$/i);
    if (brief.kickerShapeId && !kicker || kicker && !kicker.canResegment)
        throw new Error(`Slide ${slide.index}: supply a valid static kickerShapeId.`);
    const excluded = new Set([title.shapeId, kicker?.shapeId]);
    const body = brief.contentShapeIds ? brief.contentShapeIds.map(id => slide.objects.find(o => o.shapeId === id)) :
        slide.objects.filter(o => (copy(o).length || o.table) && !excluded.has(o.shapeId));
    if (!body.length || body.some(o => !o || (!o.table && !o.canResegment)))
        throw new Error(`Slide ${slide.index}: content must be static text or an unmerged native table.`);
    const empty = slide.objects.filter(o => !copy(o).length && !o.table);
    const removable = empty.filter(o => o.canResegment && /(?:accent|background|背景|装饰)/i.test(o.name || ''));
    if (empty.some(o => !removable.includes(o)))
        throw new Error(`Slide ${slide.index}: unidentified decorative shapes require a manual native edit.`);
    const ids = [title.shapeId, ...(kicker ? [kicker.shapeId] : []), ...body.map(o => o.shapeId), ...removable.map(o => o.shapeId)];
    const used = new Set(ids);
    if (used.size !== ids.length || used.size !== slide.objects.length || slide.objects.some(o => !used.has(o.shapeId)))
        throw new Error(`Slide ${slide.index}: the role mapping must include every source object exactly once.`);
    return { title, kicker, body, removable };
}
function recommend(slide, r) {
    if (!r.kicker && slide.index === 1 && r.body.length === 1 && !r.body[0].table)
        return 'cover';
    if (r.body.length === 1 && r.body[0].table)
        return 'table';
    if (r.body.length >= 2) {
        if (r.body.length <= 4 && r.body.every(o => copy(o).length === 3))
            return 'summary-grid';
        return r.body.length === 2 && r.body.every(o => copy(o).length === 1) ? 'comparison' : 'columns';
    }
    const paragraphs = copy(r.body[0]), title = copy(r.title).join('');
    if (paragraphs.length <= 3 && /(?:结论|总结|closing|conclusion|summary)/i.test(title))
        return 'closing';
    if (paragraphs.length > 3 && (labelPair(paragraphs[0])[0].length > 28 || /(?:弱项|局限|风险|limitation|risk|challenge)/i.test(title)))
        return 'definition-split';
    if (paragraphs.length >= 4 && paragraphs.every(p => labelPair(p)[0]))
        return paragraphs.length === 6 ? 'capability-grid' : 'labelled-rows';
    return 'definition-split';
}
export function composeNativeEdit(inventory, brief = {}) {
    const { w: W, h: H } = inventory.sizeInches;
    if (W < 10 || H < 6 || W / H < 1.4)
        throw new Error('This composition set requires a landscape deck at least 10 × 6 inches; use the manual native editor for other sizes.');
    const overrides = new Map();
    for (const entry of brief.slides || []) {
        if (!Number.isInteger(entry.index) || entry.index < 1 || entry.index > inventory.slides.length || overrides.has(entry.index))
            throw new Error('Composition overrides need unique source slide indices.');
        overrides.set(entry.index, entry);
    }
    const font = process.platform === 'win32' ? 'Microsoft YaHei' : process.platform === 'darwin' ? 'PingFang SC' : 'Noto Sans CJK SC';
    const plan = { schema: 'native-visual-edit-v1', sourceSha256: inventory.sourceSha256, generatedBy: 'native-composition-v1', slides: [] };
    const decisions = [];
    for (const slide of inventory.slides) {
        const selection = overrides.get(slide.index) || {}, r = roles(slide, selection);
        const layout = selection.layout || recommend(slide, r);
        if (!NATIVE_COMPOSITIONS.includes(layout))
            throw new Error(`Slide ${slide.index}: unknown composition ${layout}.`);
        const margin = W * .058, contentW = W - margin * 2, bottom = H - .5;
        const dark = layout === 'closing' || (layout === 'definition-split' && /(?:弱项|局限|短板|风险|limitation|risk)/i.test(copy(r.title).join('')));
        const ink = dark ? palette.white : palette.ink, muted = dark ? palette.light : palette.muted, accent = dark ? 'A7DEE0' : palette.accent;
        const edit = { index: slide.index, background: dark ? palette.ink : palette.white, composition: layout,
            rationale: selection.rationale || `Replace the source's paragraph containers with ${layout}; derive all text from the original, measure labels and body independently, and retain all content.`, objects: [] };
        const map = new Map();
        const add = (o, text, x, y, width, size, opts = {}) => {
            if (!text)
                return { h: 0, bottom: y };
            const leading = opts.leading || 1.4;
            // The wider native frame includes extra room beyond the conservative
            // measurement. This protects CJK punctuation and mixed Latin word wraps.
            const h = measureText(text, width * .94, size, { bold: !!opts.bold, leading }).height + (opts.padding ?? .12);
            const segment = { text, bounds: { x, y, w: width, h }, fontSize: size, lineHeight: size * leading,
                color: ink, fontFamily: font, role: opts.role || 'body', ...opts };
            delete segment.leading;
            delete segment.padding;
            if (x < 0 || y < 0 || x + width > W + .001 || y + h > bottom + .001)
                throw new Error(`Slide ${slide.index}, ${layout}: ${segment.role} exceeds the available area. Choose a wider composition; no source text was removed.`);
            if (!map.has(o.shapeId)) {
                const item = { shapeId: o.shapeId, segments: [] };
                map.set(o.shapeId, item);
                edit.objects.push(item);
            }
            map.get(o.shapeId).segments.push(segment);
            return { h, bottom: y + h };
        };
        r.removable.forEach(o => edit.objects.push({ shapeId: o.shapeId, removeEmpty: true }));
        let top = 1.95;
        if (layout !== 'cover') {
            if (r.kicker)
                add(r.kicker, copy(r.kicker).join('\n'), margin, .3, contentW, 10, { color: muted, role: 'section' });
            const title = add(r.title, copy(r.title).join('\n'), margin, .75, contentW, 30, { bold: true, role: 'title' });
            top = Math.max(top, title.bottom + .32);
        }
        const available = bottom - top, gap = .65;
        const pair = (o, text, x, y, width, labelSize = 20, bodySize = 17, compact = false) => {
            const [label, body] = labelPair(text);
            const spacing = compact ? { leading: 1.25, padding: .04 } : {};
            const head = add(o, label, x, y, width, labelSize, { bold: true, color: accent, role: 'label', ...spacing });
            return add(o, body, x, head.bottom + (label ? (compact ? .08 : .14) : 0), width, bodySize, { color: muted, ...spacing });
        };
        if (layout === 'cover') {
            if (r.body.length !== 1)
                throw new Error('Cover composition needs a title and one subtitle shape.');
            if (r.kicker)
                add(r.kicker, copy(r.kicker).join('\n'), margin, .5, contentW, 11, { color: muted });
            const title = copy(r.title).join('\n');
            // Prefer a natural phrase break without adding or deleting words.
            const split = title.search(/\s(?:与|和|vs\.?|versus|and)\s/iu);
            const t = split > 5 ? title.slice(0, split) + '\n' + title.slice(split).trimStart() : title;
            const heading = add(r.title, t, margin, 1.75, contentW, 42, { bold: true, role: 'title' });
            add(r.body[0], copy(r.body[0]).join('\n'), margin + .03, Math.max(4.55, heading.bottom + .5), contentW * .9, 19, { color: muted, role: 'subtitle' });
        }
        else if (layout === 'summary-grid') {
            if (r.body.length < 2 || r.body.length > 4)
                throw new Error('Summary grid needs 2–4 source groups.');
            const cols = 2, width = (contentW - gap) / cols, rows = Math.ceil(r.body.length / cols), row = available / rows;
            r.body.forEach((o, i) => {
                const ps = copy(o);
                if (ps.length !== 3)
                    throw new Error('Summary groups need label, conclusion and evidence paragraphs.');
                const x = margin + i % cols * (width + gap), y = top + Math.floor(i / cols) * row;
                const label = add(o, ps[0], x, y, width, 14, { color: accent, bold: true, role: 'label' });
                const value = add(o, ps[1], x, label.bottom + .12, width, 26, { bold: true, role: 'conclusion' });
                const body = add(o, ps[2], x, value.bottom + .13, width, 17, { color: muted });
                if (body.bottom > y + row - .12)
                    throw new Error(`Slide ${slide.index}: summary group ${i + 1} needs more room; select columns or a manual native layout.`);
            });
        }
        else if (layout === 'definition-split') {
            if (r.body.length !== 1 || copy(r.body[0]).length < 2)
                throw new Error('Definition split needs one source shape with a lead and supporting paragraphs.');
            const o = r.body[0], ps = copy(o), leftW = contentW * .475, rightW = contentW - leftW - gap;
            pair(o, ps[0], margin, top, leftW, 25, 22);
            let y = top;
            const sizes = ps.slice(1).map(p => { const [a, b] = labelPair(p); return (a ? measureText(a, rightW * .94, 17, { bold: true, leading: 1.25 }).height + .12 : 0) + measureText(b, rightW * .94, 16, { leading: 1.25 }).height + .04; });
            const spacing = Math.min(.35, (available - sizes.reduce((a, b) => a + b, 0) - .08) / Math.max(1, sizes.length - 1));
            if (spacing < .08)
                throw new Error(`Slide ${slide.index}: supporting column is too dense; select labelled-rows or capability-grid.`);
            ps.slice(1).forEach(p => { y = pair(o, p, margin + leftW + gap, y, rightW, 17, 16, true).bottom + spacing; });
        }
        else if (layout === 'capability-grid') {
            if (r.body.length !== 1)
                throw new Error('Capability grid needs one source group.');
            const o = r.body[0], ps = copy(o);
            if (ps.length < 4 || ps.length > 6)
                throw new Error('Capability grid supports 4–6 complete source paragraphs.');
            const longest = Math.max(...ps.map(p => Array.from(labelPair(p)[1]).length));
            const cols = selection.columns || (longest > 40 || ps.length !== 6 ? 2 : 3);
            if (![2, 3].includes(cols))
                throw new Error('Capability grid supports 2 or 3 columns.');
            const width = (contentW - (cols - 1) * gap) / cols, row = available / Math.ceil(ps.length / cols);
            ps.forEach((p, i) => { const y = top + Math.floor(i / cols) * row; const end = pair(o, p, margin + (i % cols) * (width + gap), y, width, 20, 17); if (end.bottom > y + row - .12)
                throw new Error(`Slide ${slide.index}: capability ${i + 1} does not fit. Use fewer columns or labelled-rows.`); });
        }
        else if (layout === 'labelled-rows') {
            if (r.body.length !== 1)
                throw new Error('Labelled rows need one source group.');
            const o = r.body[0], ps = copy(o), pairs = ps.map(labelPair);
            const short = pairs.every(([a]) => Array.from(a).length < 7), labelW = contentW * (short ? .13 : .32), bodyW = contentW - labelW - gap;
            const heights = pairs.map(([a, b]) => Math.max(measureText(a, labelW * .94, 18, { bold: true, leading: 1.4 }).height, measureText(b, bodyW * .94, 18, { leading: 1.4 }).height) + .12);
            const spacing = Math.min(.42, (available - heights.reduce((a, b) => a + b, 0)) / Math.max(1, pairs.length - 1));
            if (spacing < .1)
                throw new Error(`Slide ${slide.index}: labelled rows are too dense; choose a grid or manual layout.`);
            let y = top;
            pairs.forEach(([a, b], i) => { add(o, a, margin, y, labelW, 18, { bold: true, color: accent, role: 'label' }); add(o, b, margin + labelW + gap, y, bodyW, 18, { color: muted }); y += heights[i] + spacing; });
        }
        else if (layout === 'comparison' || layout === 'columns') {
            if (r.body.length < 2 || r.body.length > 3)
                throw new Error('Columns need 2–3 source groups.');
            const width = (contentW - gap * (r.body.length - 1)) / r.body.length;
            const columns = r.body.map(o => {
                const ps = copy(o), content = ps.slice(ps.length > 1 ? 1 : 0).join('\n');
                // Three-way comparisons need equivalent lead levels, including groups
                // without a colon. Promote the first complete clause, preserving it.
                const comma = content.search(/[，,]/u);
                const [heading, body] = r.body.length === 3 && comma > 0
                    ? [content.slice(0, comma + 1), content.slice(comma + 1)] : labelPair(content);
                return { o, label: ps.length > 1 ? ps[0] : '', heading: r.body.length === 3 ? balanceHeading(heading, width, 22) : heading, body };
            });
            const headingSize = r.body.length === 2 ? 27 : 22;
            const labelHeight = Math.max(0, ...columns.map(c => c.label ? measureText(c.label, width * .94, 16, { bold: true, leading: 1.4 }).height + .37 : 0));
            const headingHeight = Math.max(0, ...columns.map(c => c.heading ? measureText(c.heading, width * .94, headingSize, { bold: true, leading: 1.4 }).height + .36 : 0));
            columns.forEach(({ o, label, heading, body }, i) => {
                const x = margin + i * (width + gap);
                let y = top;
                add(o, label, x, y, width, 16, { color: accent, bold: true, role: 'label' });
                y += labelHeight;
                add(o, heading, x, y, width, headingSize, { bold: true, color: i ? accent : ink, role: 'heading' });
                y += headingHeight;
                // Phrase breaks retain every punctuation mark and word, making a
                // comparison scannable without replacing it with invented labels.
                const bodyText = r.body.length === 2 ? body.replace(/([，、])/gu, '$1\n') : body;
                add(o, bodyText, x, y, width, r.body.length === 2 ? 20 : 19, { color: muted });
            });
        }
        else if (layout === 'closing') {
            if (r.body.length !== 1)
                throw new Error('Closing composition needs one source group.');
            const o = r.body[0], ps = copy(o);
            if (ps.length > 3)
                throw new Error('Closing composition supports up to three complete paragraphs.');
            const lead = add(o, ps[0], margin, top, contentW, 28, { bold: true, role: 'conclusion' });
            const y = Math.max(top + 2.7, lead.bottom + .6), width = (contentW - gap) / 2;
            ps.slice(1).forEach((p, i) => add(o, p, margin + i * (width + gap), y, width, 18, { color: i ? palette.light : 'A7DEE0' }));
        }
        else if (layout === 'table') {
            if (r.body.length !== 1 || !r.body[0].table)
                throw new Error('Table composition needs one native table.');
            const o = r.body[0], rows = o.table, n = rows[0].length;
            if (rows.some(row => row.length !== n))
                throw new Error('Merged/ragged tables require a manual edit.');
            const weights = Array.from({ length: n }, (_, col) => Math.max(4, ...rows.map(row => Math.sqrt(Array.from(row[col]).length))));
            const total = weights.reduce((a, b) => a + b, 0);
            let columnWidths = weights.map(v => contentW * v / total);
            // A short row-label column should not take space needed by long evidence
            // cells. Keep at least 18% for labels and weight the remaining columns.
            if (n > 1 && rows.every(row => Array.from(row[0]).length <= 10)) {
                const first = contentW * .18, remaining = weights.slice(1).reduce((a, b) => a + b, 0);
                columnWidths = [first, ...weights.slice(1).map(v => (contentW - first) * v / remaining)];
            }
            let chosen;
            for (const fontSize of [15, 14, 13]) {
                const lineHeight = fontSize * 1.22;
                const rowHeights = rows.map((row, i) => Math.max(...row.map((t, c) => measureText(t, (columnWidths[c] - .2) * .96, fontSize, { bold: i === 0, leading: 1.22 }).height)) + .1);
                if (rowHeights.reduce((a, b) => a + b, 0) <= available) {
                    chosen = { fontSize, lineHeight, rowHeights };
                    break;
                }
            }
            if (!chosen)
                throw new Error(`Slide ${slide.index}: complete table cannot fit readably on one page; retain draft and use a manual native layout.`);
            edit.objects.push({ shapeId: o.shapeId, table: { x: margin, y: top, columnWidths, ...chosen, fontFamily: font, headerText: 'FFFFFF', bodyText: palette.ink, headerFill: palette.accent, bodyFill: 'FFFFFF', alternateFill: 'F1F5F8', borderColor: 'D8E1EB' } });
        }
        for (const o of [...r.body, r.title, ...(r.kicker ? [r.kicker] : [])]) {
            if (o.table)
                continue;
            const compiled = map.get(o.shapeId);
            if (!compiled || words(compiled.segments.map(s => s.text).join('')) !== words((o.paragraphs || []).join('')))
                throw new Error(`Slide ${slide.index}: composition did not preserve all text in shape ${o.shapeId}.`);
        }
        plan.slides.push(edit);
        decisions.push({ index: slide.index, layout, rationale: edit.rationale, titleShapeId: r.title.shapeId, kickerShapeId: r.kicker?.shapeId, contentShapeIds: r.body.map(o => o.shapeId) });
    }
    return { plan, brief: { schema: 'native-composition-brief-v1', slides: decisions } };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    const args = parseArgs(process.argv.slice(2));
    if (!args.source || !args['out-plan'])
        throw new Error('Usage: compose_native_edit.mjs --source original.pptx --out-plan NEW_PLAN.json [--brief choices.json] [--brief-out NEW_CHOICES.json]');
    const inventory = await inspectNativeEditSource(path.resolve(args.source));
    const { plan, brief } = composeNativeEdit(inventory, args.brief ? JSON.parse(await fs.readFile(args.brief, 'utf8')) : {});
    await fs.writeFile(args['out-plan'], JSON.stringify(plan, null, 2), { flag: 'wx' });
    if (args['brief-out'])
        await fs.writeFile(args['brief-out'], JSON.stringify(brief, null, 2), { flag: 'wx' });
    console.log(JSON.stringify({ plan: path.resolve(args['out-plan']), slideCount: plan.slides.length, compositions: brief.slides.map(s => ({ index: s.index, layout: s.layout })), status: 'requires-render-and-visual-review' }));
}
