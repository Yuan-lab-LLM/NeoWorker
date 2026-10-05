// Content-specific, editable diagrams. These are not rendered screenshots or
// slide-sized bitmap backgrounds. Labels, regions and relationships stay native.
const IDS = new Set(['cover-system', 'branch-flow', 'document-transform', 'evidence-stage', 'mechanism-track']);
export const MECHANISM_KINDS = ['document', 'layout', 'table', 'formula', 'vector', 'search', 'rank', 'shield', 'publish', 'trace'];

function contrast(a, b) {
  const lum = hex => {
    const channels = hex.match(/../g).map(v => parseInt(v, 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
    return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
  };
  const [bright, dark] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (bright + .05) / (dark + .05);
}

export function validateVisualContent(c, { keys, requireText, list, labelled }) {
  const pair = (value, field) => {
    keys(value, ['label', 'body'], field);
    requireText(value.label, `${field}.label`);
    requireText(value.body, `${field}.body`);
  };
  if (c.system !== undefined) {
    keys(c.system, ['inputs', 'core', 'output'], 'system');
    list(c.system.inputs, 2, 3, 'system.inputs');
    c.system.inputs.forEach((s, i) => requireText(s, `system.inputs[${i}]`));
    pair(c.system.core, 'system.core'); pair(c.system.output, 'system.output');
  }
  if (c.flow !== undefined) {
    keys(c.flow, ['input', 'branches', 'merge', 'output'], 'flow');
    pair(c.flow.input, 'flow.input'); pair(c.flow.merge, 'flow.merge'); pair(c.flow.output, 'flow.output');
    labelled(c.flow.branches, 2, 3, 'flow.branches');
  }
  if (c.transformation !== undefined) {
    const t = c.transformation;
    keys(t, ['inputLabel', 'outputLabel', 'regions', 'stages'], 'transformation');
    requireText(t.inputLabel, 'transformation.inputLabel'); requireText(t.outputLabel, 'transformation.outputLabel');
    labelled(t.regions, 2, 4, 'transformation.regions');
    labelled(t.stages, 2, 3, 'transformation.stages');
  }
  if (c.mechanisms !== undefined) {
    list(c.mechanisms, 2, 4, 'mechanisms');
    c.mechanisms.forEach((item, i) => {
      keys(item, ['label', 'body', 'kind'], `mechanisms[${i}]`);
      requireText(item.label, `mechanisms[${i}].label`); requireText(item.body, `mechanisms[${i}].body`);
      if (!MECHANISM_KINDS.includes(item.kind)) throw new Error(`mechanisms[${i}].kind: use ${MECHANISM_KINDS.join(', ')}.`);
    });
  }
  if (c.connected !== undefined && typeof c.connected !== 'boolean') throw new Error('connected: use a boolean; only connect actual sequential stages.');
}

export function buildVisualModel(slide, layout, palette, index, measureText) {
  if (!IDS.has(layout.id)) return null;
  const c = slide.content;
  const mix = (a, b, t) => a.match(/../g).map((v, i) => Math.round(parseInt(v, 16) * (1 - t) + parseInt(b.slice(i * 2, i * 2 + 2), 16) * t).toString(16).padStart(2, '0')).join('').toUpperCase();
  const C = { ink: palette.primary, blue: palette.accent, muted: palette.muted,
    pale: contrast(palette.light, palette.background) > 1.5 ? mix(palette.light, palette.background, .72) : palette.light,
    bg: palette.background, rule: mix(palette.muted, palette.background, .8), white: 'FFFFFF',
    dark: mix(palette.primary, '000000', .35), bright: mix(palette.accent, 'FFFFFF', .7) };
  C.paper = mix(C.dark, palette.accent, .13);
  C.deep = mix(C.dark, palette.accent, .28);
  C.dim = mix(C.dark, C.bright, .43);
  C.soft = mix(palette.accent, palette.background, .9);
  C.onDark = mix(palette.background, C.dark, .15);
  const dark = layout.id === 'cover-system';
  const m = { index, layoutId: layout.id, composition: layout.composition, background: dark ? C.dark : C.bg,
    objects: [], textBoxes: [], notes: c.notes || '', visualSemantics: [] };
  const text = (field, value, x, y, w, h, size = 18, options = {}) => {
    if (!value) return;
    const o = { kind: 'text', field, text: String(value), x, y, w, h, size, color: dark ? C.white : C.ink, ...options };
    const surface = [...m.objects].reverse().find(s => (s.kind === 'rect' || s.kind === 'ellipse') && s.x <= x && s.y <= y && s.x + s.w >= x + w && s.y + s.h >= y + h)?.fill || m.background;
    if (contrast(o.color, surface) < 4.5) {
      // An author may choose a light brand accent. Small white labels must not
      // disappear on it; use the existing dark/white ink with best contrast.
      o.color = [C.ink, C.dark, C.white].sort((a, b) => contrast(b, surface) - contrast(a, surface))[0];
    }
    o.measurement = measureText(o.text, w, size, { bold: o.bold, leading: options.leading || 1.3 });
    m.objects.push(o); m.textBoxes.push(o);
  };
  const rect = (x, y, w, h, fill, line, extra = {}) => m.objects.push({ kind: 'rect', x, y, w, h, fill, line, ...extra });
  const circle = (x, y, d, fill, line) => m.objects.push({ kind: 'ellipse', x, y, w: d, h: d, fill, line });
  const line = (x1, y1, x2, y2, color = C.rule, width = 1.25, arrow = false, dash = false) => {
    // Paths are authored left-to-right or top-to-bottom; negative slope is a flip.
    if (x2 < x1) throw new Error('visual connector: endpoints must run left-to-right.');
    m.objects.push({ kind: 'line', x: x1, y: Math.min(y1, y2), w: x2 - x1, h: Math.abs(y2 - y1), flipV: y2 < y1, color, width, arrow, dash });
  };
  const bars = (x, y, w, count, color, gap = .16) => {
    for (let i = 0; i < count; i++) rect(x, y + i * gap, w * (i === count - 1 ? .66 : 1), .035, color);
  };
  const glyph = (kind, x, y, w, h, inverted = false) => {
    const a = inverted ? C.bright : C.blue, pale = inverted ? C.deep : C.pale, ink = inverted ? 'FFFFFF' : C.ink;
    const cx = x + w / 2, cy = y + h / 2;
    if (kind === 'document' || kind === 'layout') {
      rect(cx - .56, cy - .72, 1.12, 1.44, inverted ? C.paper : C.white, a);
      if (kind === 'layout') {
        rect(cx - .43, cy - .56, .86, .2, a);
        rect(cx - .43, cy - .23, .38, .5, pale, a); rect(cx + .07, cy - .23, .36, .5, pale, a);
        bars(cx - .43, cy + .42, .8, 2, a);
      } else { rect(cx - .4, cy - .48, .48, .08, a); bars(cx - .4, cy - .21, .8, 5, a, .17); }
    } else if (kind === 'table') {
      rect(cx - .73, cy - .58, 1.46, 1.16, pale, a);
      rect(cx - .73, cy - .58, 1.46, .27, a);
      for (let k = 1; k < 4; k++) line(cx - .73, cy - .58 + k * .29, cx + .73, cy - .58 + k * .29, a);
      for (let k = 1; k < 3; k++) line(cx - .73 + k * .486, cy - .58, cx - .73 + k * .486, cy + .58, a);
    } else if (kind === 'formula') {
      // Geometry-only formula glyph: no invented equation or result.
      line(cx - .52, cy - .55, cx - .22, cy, a, 3); line(cx - .52, cy + .55, cx - .22, cy, a, 3);
      line(cx - .52, cy - .55, cx + .5, cy - .55, a, 3); line(cx - .52, cy + .55, cx + .5, cy + .55, a, 3);
      line(cx + .2, cy - .15, cx + .6, cy - .15, ink, 2); line(cx + .2, cy + .12, cx + .6, cy + .12, ink, 2);
    } else if (kind === 'vector') {
      for (let r = 0; r < 5; r++) for (let col = 0; col < 6; col++) rect(cx - .79 + col * .28, cy - .65 + r * .28, .16, .16, (r + col) % 3 ? pale : a);
    } else if (kind === 'search') {
      circle(cx - .7, cy - .66, 1.05, inverted ? C.paper : C.white, a);
      line(cx + .14, cy + .21, cx + .64, cy + .7, a, 4); bars(cx - .49, cy - .37, .58, 3, a, .16);
    } else if (kind === 'rank') {
      [.92, .68, .43, .23].forEach((v, i) => {
        circle(cx - .76, cy - .55 + i * .35, .11, a);
        rect(cx - .49, cy - .58 + i * .35, v * 1.25, .16, i ? pale : a);
      });
    } else if (kind === 'shield') {
      circle(cx - .68, cy - .68, 1.36, pale, a);
      line(cx - .31, cy, cx - .04, cy + .25, a, 3); line(cx - .04, cy + .25, cx + .41, cy - .26, a, 3);
    } else if (kind === 'trace') {
      rect(cx - .8, cy - .53, .6, 1.04, pale, a); rect(cx + .2, cy - .53, .6, 1.04, inverted ? C.paper : C.white, a);
      line(cx - .15, cy, cx + .14, cy, a, 2, true);
      bars(cx - .7, cy - .3, .36, 3, a); bars(cx + .3, cy - .3, .36, 3, a);
    } else if (kind === 'publish') {
      rect(cx - .82, cy - .6, 1.64, 1.13, pale, a);
      line(cx - .82, cy - .32, cx + .82, cy - .32, a);
      circle(cx - .67, cy - .51, .08, a); circle(cx - .51, cy - .51, .08, a);
      line(cx - .35, cy + .12, cx + .4, cy + .12, a, 2, true);
    }
  };
  const footer = (color = C.muted) => {
    text('sourceNote', c.sourceNote, .66, 7.03, 11.42, .29, 10, { color, leading: 1.1 });
    text('page', String(index).padStart(2, '0'), 12.13, 7.03, .53, .27, 10, { color, align: 'right', leading: 1.1 });
  };
  const header = () => {
    text('title', slide.title, .66, .5, 12, .78, 31, { bold: true });
    text('subtitle', c.subtitle, .68, 1.46, 11.93, .63, 17, { color: C.muted });
  };

  if (layout.id === 'cover-system') {
    const s = c.system;
    // Large title and a document-to-knowledge visual share the stage. Labels
    // describe the supplied content; the document marks are explicitly schematic.
    text('subtitle', c.subtitle, .72, .7, 6, .68, 17, { color: C.bright });
    text('title', slide.title, .7, 1.68, 6.0, 2.57, 44, { bold: true, leading: 1.4 });
    text('body', c.body, .75, 4.65, 5.35, 1.03, 20, { color: C.onDark });
    rect(6.93, 1.29, 2.12, 3.11, C.paper, C.deep);
    rect(6.73, 1.08, 2.12, 3.11, C.paper, C.dim);
    s.inputs.forEach((label, i) => {
      const yy = 1.43 + i * .87;
      rect(6.97, yy, .045, .38, C.bright);
      text(`system.inputs[${i}]`, label, 7.16, yy, 1.41, .39, 15, { color: 'FFFFFF' });
      bars(7.17, yy + .5, 1.29, 2, C.dim, .13);
    });
    line(8.9, 2.6, 9.57, 2.6, C.bright, 2, true);
    // The cells indicate indexed fragments, not a quantitative chart.
    for (let r = 0; r < 4; r++) for (let col = 0; col < 5; col++) rect(9.83 + col * .48, 1.13 + r * .45, .32, .29, (r + col) % 3 ? C.deep : C.bright);
    text('system.core.label', s.core.label, 9.75, 3.2, 2.83, .81, 20, { bold: true, color: C.bright });
    text('system.core.body', s.core.body, 9.75, 4.08, 2.83, .73, 15, { color: C.onDark });
    line(11.06, 4.94, 11.06, 5.2, C.bright, 2, true);
    rect(7.03, 5.36, 5.26, 1.06, C.pale);
    text('system.output.label', s.output.label, 7.28, 5.58, 2.52, .49, 22, { bold: true, color: C.dark });
    text('system.output.body', s.output.body, 10.05, 5.59, 1.99, .58, 15, { color: C.ink });
    m.visualSemantics.push('source-documents', 'indexed-fragments', 'grounded-output');
    footer(C.onDark); return m;
  }
  header();
  if (layout.id === 'branch-flow') {
    const f = c.flow;
    const input = { x: .66, y: 2.72, w: 1.99, h: 2.77 }, merge = { x: 7.46, y: 2.72, w: 2.08, h: 2.77 }, output = { x: 10.49, y: 2.72, w: 2.17, h: 2.77 };
    const mid = 4.1, bx = 3.43, bw = 2.96;
    const rowH = f.branches.length === 2 ? 1.67 : 1.26;
    const sy = f.branches.length === 2 ? 2.72 : 2.15;
    const centers = f.branches.map((_, i) => sy + i * rowH + .67);
    line(input.x + input.w, mid, 3.06, mid, C.blue, 1.8);
    line(3.06, Math.min(mid, centers[0]), 3.06, Math.max(mid, centers.at(-1)), C.blue, 1.8);
    line(6.85, Math.min(mid, centers[0]), 6.85, Math.max(mid, centers.at(-1)), C.blue, 1.8);
    f.branches.forEach((branch, i) => {
      const y = sy + i * rowH;
      line(3.06, centers[i], bx - .12, centers[i], C.blue, 1.8, true);
      line(bx + bw, centers[i], 6.85, centers[i], C.blue, 1.8);
      rect(bx, y, bw, 1.34, C.pale);
      text(`flow.branches[${i}].label`, branch.label, bx + .2, y + .14, bw - .4, .48, 20, { bold: true });
      text(`flow.branches[${i}].body`, branch.body, bx + .2, y + .76, bw - .4, .57, 14, { color: C.muted });
    });
    line(6.85, mid, merge.x - .14, mid, C.blue, 1.8, true);
    line(merge.x + merge.w, mid, output.x - .14, mid, C.blue, 1.8, true);
    for (const [key, item, b, fill, ink, muted] of [['input', f.input, input, C.pale, C.ink, C.muted], ['merge', f.merge, merge, C.blue, C.white, C.white], ['output', f.output, output, C.dark, C.white, C.onDark]]) {
      rect(b.x, b.y, b.w, b.h, fill);
      text(`flow.${key}.label`, item.label, b.x + .2, b.y + .25, b.w - .4, .92, 21, { bold: true, color: ink });
      text(`flow.${key}.body`, item.body, b.x + .2, b.y + 1.79, b.w - .4, .83, 15, { color: muted });
      // A compact native symbol makes each node's role legible without a logo.
      if (key === 'merge') bars(b.x + .24, b.y + 1.19, 1.32, 3, C.bright, .16);
      else if (key === 'output') for (let i = 0; i < 3; i++) circle(b.x + .28 + i * .4, b.y + 1.24, .13, C.bright);
      else line(b.x + .24, b.y + 1.36, b.x + 1.48, b.y + 1.36, C.blue, 2, true);
    }
    text('body', c.body, .69, 6.08, 11.94, .78, 18, { color: C.muted });
    m.visualSemantics.push('parallel-branches', 'merge', 'output');
  } else if (layout.id === 'document-transform') {
    const t = c.transformation;
    text('transformation.inputLabel', t.inputLabel, .68, 2.2, 3.13, .44, 18, { bold: true });
    text('transformation.outputLabel', t.outputLabel, 9.37, 2.2, 3.23, .44, 18, { bold: true });
    rect(.72, 2.92, 3.12, 3.68, C.pale); rect(.6, 2.79, 3.12, 3.68, C.white, C.rule);
    // Deliberately schematic source regions: no counterfeit source screenshot.
    const rowH = 3.26 / t.regions.length;
    t.regions.forEach((region, i) => {
      const y = 2.99 + i * rowH;
      rect(.82, y, 2.67, rowH - .14, i % 2 ? C.soft : C.pale, i % 2 ? C.bright : C.rule);
      text(`regionInput[${i}]`, region.label, 1.01, y + .1, 2.28, .36, 15, { color: C.blue, bold: true });
      if (rowH > .97) bars(1.03, y + .61, 2.05, 2, C.dim, .13);
    });
    line(3.88, 4.62, 4.47, 4.62, C.blue, 2, true);
    const sh = 3.65 / t.stages.length;
    t.stages.forEach((stage, i) => {
      const y = 2.85 + i * sh;
      circle(4.67, y + .04, .37, C.blue);
      text(`stageNumber[${i}]`, String(i + 1), 4.68, y + .067, .34, .26, 11, { color: C.white, align: 'center', leading: 1.1 });
      text(`transformation.stages[${i}].label`, stage.label, 5.23, y, 3.02, .45, 20, { bold: true });
      text(`transformation.stages[${i}].body`, stage.body, 5.23, y + .54, 3.02, .63, 15, { color: C.muted });
    });
    line(8.52, 4.62, 9.13, 4.62, C.blue, 2, true);
    rect(9.35, 2.79, 3.28, 3.68, C.dark);
    const oh = 3.23 / t.regions.length;
    t.regions.forEach((region, i) => {
      const y = 3 + i * oh;
      rect(9.56, y + .07, .045, oh - .16, C.bright);
      text(`transformation.regions[${i}].label`, region.label, 9.79, y, 2.59, .39, 15, { color: C.bright, bold: true });
      text(`transformation.regions[${i}].body`, region.body, 9.79, y + .4, 2.59, oh - .44, 13, { color: C.white });
    });
    // A long explanation belongs in notes or a companion page, not under an
    // already complete transformation diagram.
    text('body', c.body, .68, 6.64, 11.9, .3, 11, { color: C.muted, leading: 1.1 });
    m.visualSemantics.push('schematic-source-regions', 'processing-stages', 'structured-output');
  } else if (layout.id === 'evidence-stage') {
    if (c.metrics.length !== 3) throw new Error('evidence-stage requires exactly three metrics; use metrics-row for two or four.');
    const [hero, ...rest] = c.metrics;
    rect(.65, 2.35, 4.32, 4.4, C.dark);
    text('metrics[0].value', hero.value, .96, 2.65, 3.72, 1.78, 80, { bold: true, color: C.bright, leading: 1.05 });
    text('metrics[0].label', hero.label, 1, 4.63, 3.68, .87, 25, { color: C.white, bold: true });
    text('metrics[0].detail', hero.detail, 1, 5.7, 3.64, .76, 16, { color: C.onDark });
    rest.forEach((item, i) => {
      const y = 2.52 + i * 2.13;
      text(`metrics[${i + 1}].value`, item.value, 5.55, y, 3.41, 1.27, 55, { bold: true, color: C.blue, leading: 1.1 });
      text(`metrics[${i + 1}].label`, item.label, 9.31, y + .06, 3.31, .87, 22, { bold: true });
      text(`metrics[${i + 1}].detail`, item.detail, 9.31, y + 1.04, 3.31, .69, 15, { color: C.muted });
      if (!i) line(5.57, y + 1.91, 12.65, y + 1.91, C.rule);
    });
    text('body', c.body, 5.57, 6.6, 7.05, .29, 10, { color: C.muted, leading: 1.1 });
    m.visualSemantics.push('qualified-numeric-evidence');
  } else if (layout.id === 'mechanism-track') {
    const n = c.mechanisms.length, cw = 11.97 / n;
    c.mechanisms.forEach((item, i) => {
      const x = .67 + i * cw;
      glyph(item.kind, x, 2.37, cw - .35, 1.76);
      text(`mechanisms[${i}].label`, item.label, x, 4.5, cw - .47, .8, 25, { bold: true });
      text(`mechanisms[${i}].body`, item.body, x, 5.52, cw - .48, 1.05, 17, { color: C.muted });
      if (i < n - 1) {
        if (c.connected) line(x + cw - .54, 3.3, x + cw + .13, 3.3, C.blue, 1.8, true);
        else line(x + cw - .24, 4.58, x + cw - .24, 6.56, C.rule);
      }
    });
    text('body', c.body, .7, 6.67, 11.91, .3, 11, { color: C.muted, leading: 1.1 });
    m.visualSemantics.push(c.connected ? 'ordered-mechanisms' : 'independent-mechanisms');
  }
  footer(); return m;
}
