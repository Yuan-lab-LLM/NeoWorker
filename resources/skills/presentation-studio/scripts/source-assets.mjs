// Keep source figures available to the author instead of treating a document's
// extracted text as its complete contents. Never modify the source package.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { createAppRequire, parseArgs } from './runtime-utils.mjs';
const require = createAppRequire(import.meta.url);
const JSZip = require('jszip');
const imageSize = require('image-size');
const { DOMParser } = require('@xmldom/xmldom');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const parse = xml => new DOMParser().parseFromString(xml, 'application/xml');
const descendants = (node, local) => Array.from(node.getElementsByTagName('*')).filter(n => n.localName === local);
const copyText = node => descendants(node, 't').map(n => n.textContent).join('').trim();

export async function extractSourceAssets({ source, projectDir }) {
  source = path.resolve(source); projectDir = path.resolve(projectDir);
  const extension = path.extname(source).toLowerCase();
  if (!['.docx', '.pptx'].includes(extension)) throw new Error('Source figure extraction supports DOCX/PPTX. Inspect PDF pages with read_pdf_visual.');
  const bytes = await fs.readFile(source), sourceHash = hash(bytes);
  const zip = await JSZip.loadAsync(bytes);
  const mediaRoot = extension === '.docx' ? 'word/media/' : 'ppt/media/';
  const assets = [];
  for (const entry of Object.values(zip.files).filter(f => !f.dir && f.name.startsWith(mediaRoot))) {
    const ext = path.posix.extname(entry.name).toLowerCase();
    if (!['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.emf', '.wmf'].includes(ext)) continue;
    const data = await entry.async('nodebuffer');
    const id = `figure-${assets.length + 1}`;
    const relative = `slides/imgs/source-${sourceHash.slice(0, 12)}/${id}${ext}`;
    const target = path.join(projectDir, relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, data);
    let dimensions = null;
    try { const size = imageSize(data); dimensions = { width: size.width, height: size.height }; } catch { /* Keep vector/unsupported originals for explicit conversion. */ }
    assets.push({ id, path: relative, sourcePart: entry.name, source, sha256: hash(data), bytes: data.length, dimensions, contexts: [], requiresConversion: ['.emf', '.wmf'].includes(ext) });
  }
  const byPart = new Map(assets.map(a => [a.sourcePart, a]));
  const documents = extension === '.docx' ? ['word/document.xml'] : Object.keys(zip.files).filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n));
  for (const part of documents) {
    const rels = zip.file(path.posix.join(path.posix.dirname(part), '_rels', path.posix.basename(part) + '.rels'));
    if (!rels) continue;
    const targets = new Map(descendants(parse(await rels.async('string')), 'Relationship')
      .filter(n => n.getAttribute('TargetMode') !== 'External')
      .map(n => [n.getAttribute('Id'), path.posix.normalize(path.posix.join(path.posix.dirname(part), n.getAttribute('Target')))]));
    const doc = parse(await zip.file(part).async('string'));
    for (const blip of descendants(doc, 'blip')) {
      const rel = blip.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'embed');
      const asset = byPart.get(targets.get(rel)); if (!asset) continue;
      let paragraph = blip;
      while (paragraph.parentNode && paragraph.localName !== (extension === '.docx' ? 'p' : 'spTree')) paragraph = paragraph.parentNode;
      const context = [paragraph.previousSibling, paragraph, paragraph.nextSibling]
        .filter(n => n?.getElementsByTagName).map(copyText).filter(Boolean).join(' | ').slice(0, 700);
      if (context) asset.contexts.push({ part, text: context });
    }
  }
  const manifest = { schemaVersion: 1, source, sourceSha256: sourceHash, assets };
  const manifestPath = path.join(projectDir, `source-assets-${sourceHash.slice(0, 12)}.json`);
  await fs.mkdir(projectDir, { recursive: true });
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  return { manifestPath, sourceSha256: sourceHash, assets };
}

export async function validateSourceVisuals(plan, projectDir) {
  const errors = [], inventories = [];
  for (const file of plan.sourceAssetManifests || []) {
    const inventory = JSON.parse(await fs.readFile(path.resolve(projectDir, file), 'utf8'));
    inventories.push(inventory);
  }
  const resolve = file => path.resolve(projectDir, file);
  const assets = [...new Map(inventories.flatMap(i => i.assets || []).map(a => [resolve(a.path), a])).values()];
  const usedImages = (plan.slides || []).flatMap(s => [s.content?.image, ...(s.content?.images || [])]).filter(i => i?.path);
  const usedPaths = new Map(usedImages.map(i => [resolve(i.path), i]));
  const usedHashes = new Map();
  for (const [file, image] of usedPaths) {
    try { usedHashes.set(file, hash(await fs.readFile(file))); }
    catch { errors.push(`Referenced figure is unavailable: ${image.path}`); }
  }
  const reused = assets.filter(a => {
    const file = resolve(a.path);
    if (usedPaths.has(file) && usedHashes.get(file) !== a.sha256) {
      errors.push(`Source figure bytes changed: ${a.path}. Restore the original; add redraws separately.`);
      return false;
    }
    // Renaming/copying an original is legitimate; storing it only in the project is not reuse.
    const matches = [...usedHashes].filter(([, sha]) => sha === a.sha256);
    if (matches.length && matches.every(([p]) => usedPaths.get(p).fit === 'cover')) {
      errors.push(`Source figure is only cropped: ${a.path}. Include a complete contain view to retain evidence.`);
    }
    return matches.length > 0;
  });
  const retained = new Set(reused.map(a => resolve(a.path)));
  const exclusions = new Set();
  const reviews = plan.sourceVisualReview?.exclusions || [];
  if (!Array.isArray(reviews)) errors.push('sourceVisualReview.exclusions must be an array of individual figure decisions.');
  else for (const review of reviews) {
    const asset = review?.path && assets.find(a => resolve(a.path) === resolve(review.path));
    if (!asset || exclusions.has(resolve(review.path))) {
      errors.push(`Unknown or repeated source figure exclusion: ${review?.path || '(missing path)'}`); continue;
    }
    const category = review.category;
    if (!['decorative', 'duplicate', 'out-of-scope', 'user-requested'].includes(category) || typeof review.reason !== 'string' || !review.reason.trim()) {
      errors.push(`Invalid exclusion for ${asset.path}: specify category and a figure-specific reason. Native redraw and low resolution are not exclusions.`); continue;
    }
    if (category === 'user-requested' && (typeof review.userInstruction !== 'string' || !review.userInstruction.trim())) {
      errors.push(`Exclusion for ${asset.path} must record the user's explicit instruction.`); continue;
    }
    if (category === 'duplicate' && !reused.some(a => a.sha256 === asset.sha256)) {
      errors.push(`Duplicate exclusion for ${asset.path} requires an identical retained original.`); continue;
    }
    exclusions.add(resolve(asset.path));
  }
  const missing = assets.filter(a => !retained.has(resolve(a.path)) && !exclusions.has(resolve(a.path)));
  if (missing.length) errors.push(`Unaccounted source figures (${missing.length}/${assets.length}): ${missing.map(a => a.path).join(', ')}. Reuse each original with content.image or content.images (image-gallery). Native redraws supplement originals, never replace source evidence. Only individually reviewed decorative, duplicate, out-of-scope or explicitly user-requested omissions belong in sourceVisualReview.exclusions.`);
  return { errors, sourceFigureCount: assets.length, reusedFigureCount: reused.length, excludedFigureCount: exclusions.size,
    missingFigures: missing.map(a => a.path), review: plan.sourceVisualReview || null };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = parseArgs(process.argv.slice(2));
  if (!args.source || !args['project-dir']) throw new Error('Usage: source-assets.mjs --source <DOCX/PPTX> --project-dir <project>');
  const result = await extractSourceAssets({ source: args.source, projectDir: args['project-dir'] });
  console.log(JSON.stringify({ manifestPath: result.manifestPath, figureCount: result.assets.length, next: 'Inspect the figures and their contexts; use their relative paths as content.image.path or content.images[].path (image-gallery). Account for every figure; native redraws do not replace originals. Add the manifest filename to presentation-plan.json sourceAssetManifests when extracting into an existing project.' }, null, 2));
}
