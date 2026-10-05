import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { loadPresentationRuntime } from '../../resources/skills/presentation-studio/scripts/runtime-utils.mjs';
import { extractSourceAssets, validateSourceVisuals } from '../../resources/skills/presentation-studio/scripts/source-assets.mjs';

test('DOCX figures retain original bytes, nearby evidence and source; all-text output cannot silently omit them', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'neoworker-source-figures-'));
  try {
    const { JSZip } = loadPresentationRuntime(import.meta.url), zip = new JSZip();
    const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
    zip.file('word/media/image1.png', image);
    zip.file('word/_rels/document.xml.rels', '<Relationships><Relationship Id="rId1" Target="media/image1.png"/><Relationship Id="external" TargetMode="External" Target="https://example.invalid/logo.png"/></Relationships>');
    zip.file('word/document.xml', '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body><w:p><w:r><w:t>三阶段检索架构</w:t></w:r></w:p><w:p><w:r><a:blip r:embed="rId1"/></w:r></w:p></w:body></w:document>');
    const source = path.join(dir, '原始 材料.docx'), original = await zip.generateAsync({ type: 'nodebuffer' });
    await fs.writeFile(source, original);
    const projectDir = path.join(dir, 'project');
    execFileSync(process.execPath, ['resources/skills/presentation-studio/scripts/bootstrap_project.mjs', '--project-dir', projectDir, '--source', source], { stdio: 'pipe' });
    const plan = JSON.parse(await fs.readFile(path.join(projectDir, 'presentation-plan.json')));
    const manifest = JSON.parse(await fs.readFile(path.join(projectDir, plan.sourceAssetManifests[0])));
    assert.equal(manifest.assets.length, 1);
    assert.deepEqual(manifest.assets[0].dimensions, { width: 1, height: 1 });
    assert.match(manifest.assets[0].contexts[0].text, /三阶段检索架构/);
    assert.deepEqual(await fs.readFile(path.join(projectDir, manifest.assets[0].path)), image);
    assert.deepEqual(await fs.readFile(source), original);
    assert.equal((await validateSourceVisuals(plan, projectDir)).errors.length, 1);
    plan.slides[1].content = { image: { path: manifest.assets[0].path } };
    assert.equal((await validateSourceVisuals(plan, projectDir)).reusedFigureCount, 1);
    assert.deepEqual((await validateSourceVisuals(plan, projectDir)).errors, []);
    plan.slides[1].content = { body: 'Not a diagram' };
    plan.sourceVisualReview = { decision: 'native-redraw', reason: 'Rebuild the three-stage flow with editable shapes.' };
    assert.equal((await validateSourceVisuals(plan, projectDir)).errors.length, 1);
    plan.slides[1].content.steps = [{ label: '检索' }, { label: '生成' }];
    assert.match((await validateSourceVisuals(plan, projectDir)).errors.join(), /Unaccounted source figures/);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('PPTX image relationship resolution stays inside package media; unsupported inputs fail explicitly', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'neoworker-slide-figures-'));
  try {
    const { JSZip } = loadPresentationRuntime(import.meta.url), zip = new JSZip();
    zip.file('ppt/media/image1.png', Buffer.from('slide-image'));
    zip.file('ppt/slides/_rels/slide1.xml.rels', '<Relationships><Relationship Id="rId2" Target="../media/image1.png"/></Relationships>');
    zip.file('ppt/slides/slide1.xml', '<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:spTree><a:t>真实架构图</a:t><a:blip r:embed="rId2"/></p:spTree></p:sld>');
    const source = path.join(dir, 'source.pptx'); await fs.writeFile(source, await zip.generateAsync({ type: 'nodebuffer' }));
    const r = await extractSourceAssets({ source, projectDir: path.join(dir, 'output') });
    assert.match(r.assets[0].contexts[0].text, /真实架构图/);
    await assert.rejects(extractSourceAssets({ source: path.join(dir, 'source.pdf'), projectDir: dir }), /read_pdf_visual/);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});


test('partial reuse, copied originals and per-figure exclusions account for every source image', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'neoworker-source-coverage-'));
  try {
    const assets = [];
    for (const [file, bytes] of [['a.png', 'original-one'], ['b.png', 'original-two'], ['logo.png', 'letterhead']]) {
      await fs.writeFile(path.join(dir, file), bytes);
      assets.push({ path: file, sha256: createHash('sha256').update(bytes).digest('hex') });
    }
    await fs.writeFile(path.join(dir, 'inventory.json'), JSON.stringify({ assets }));
    const plan = { sourceAssetManifests: ['inventory.json'], slides: [{ content: { image: { path: 'a.png' } } }] };
    let result = await validateSourceVisuals(plan, dir);
    assert.equal(result.reusedFigureCount, 1);
    assert.deepEqual(result.missingFigures, ['b.png', 'logo.png']);
    plan.sourceVisualReview = { decision: 'native-redraw', reason: 'All relationships redrawn.' };
    assert.equal((await validateSourceVisuals(plan, dir)).errors.length, 1);
    await fs.copyFile(path.join(dir, 'b.png'), path.join(dir, 'copied.png'));
    plan.slides[0].content = { images: [{ path: 'a.png' }, { path: 'copied.png' }] };
    plan.sourceVisualReview = { exclusions: [{ path: 'logo.png', category: 'decorative', reason: 'Letterhead icon, no product or technical evidence.' }] };
    result = await validateSourceVisuals(plan, dir);
    assert.deepEqual(result.errors, []);
    assert.equal(result.reusedFigureCount, 2);
    assert.equal(result.excludedFigureCount, 1);
    for (const category of ['native-redraw', 'duplicate', 'user-requested']) {
      plan.sourceVisualReview.exclusions[0].category = category;
      assert.ok((await validateSourceVisuals(plan, dir)).errors.length, category);
    }
    plan.sourceVisualReview.exclusions[0] = { path: 'logo.png', category: 'user-requested', reason: 'User excludes branding', userInstruction: 'Remove the letterhead logo' };
    assert.deepEqual((await validateSourceVisuals(plan, dir)).errors, []);
    plan.slides[0].content.images[0].fit = 'cover';
    assert.match((await validateSourceVisuals(plan, dir)).errors.join(), /only cropped/);
    delete plan.slides[0].content.images[0].fit;
    await fs.writeFile(path.join(dir, 'a.png'), 'redrawn-replacement');
    assert.match((await validateSourceVisuals(plan, dir)).errors.join(), /bytes changed/);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
