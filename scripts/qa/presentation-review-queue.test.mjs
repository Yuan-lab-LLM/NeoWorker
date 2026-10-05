import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createReviewQueue } from '../../resources/skills/presentation-studio/scripts/review-queue.mjs';

test('reviews every rendered page in ordered batches, bound to its actual bytes and deck', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ppt-review-queue-'));
  try {
    const previewFiles = Array.from({ length: 11 }, (_, i) => `slide-${String(i + 1).padStart(2, '0')}.png`);
    await Promise.all(previewFiles.map((f, i) => fs.writeFile(path.join(dir, f), `page ${i + 1}`)));
    const queue = await createReviewQueue({ outputPath: '/test.pptx', outputSha256: 'deck-hash', previewDir: dir, previewFiles });
    assert.equal(queue.status, 'pending');
    assert.equal(queue.outputSha256, 'deck-hash');
    assert.deepEqual(queue.batches.map(b => b.pages), [[1,2,3,4,5], [6,7,8,9,10], [11]]);
    assert.deepEqual(queue.batches.flatMap(b => b.paths), previewFiles.map(f => path.join(dir, f)));
    assert.equal(queue.pages[0].sha256, createHash('sha256').update('page 1').digest('hex'));
    assert.ok(queue.batches.every(b => b.max_dimension === 960));
    await fs.writeFile(path.join(dir, previewFiles[0]), 'changed page');
    const revised = await createReviewQueue({ outputPath: '/test-v2.pptx', outputSha256: 'new-deck', previewDir: dir, previewFiles });
    assert.notEqual(revised.pages[0].sha256, queue.pages[0].sha256);
    assert.equal(revised.pages[1].sha256, queue.pages[1].sha256);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('an unavailable rendered image fails rather than pretending a page is queued/verified', async () => {
  await assert.rejects(createReviewQueue({ outputPath: '/test.pptx', outputSha256: 'hash', previewDir: '/nonexistent', previewFiles: ['slide-01.png'] }), /ENOENT/);
});
