import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { approvedTestImage } from './watch-presentation-test-approvals.mjs';

test('only pending image analysis in the authorized task and real workspace is approved', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ppt-approval-scope-'));
  try {
    const workspace = path.join(root, 'workspace');
    await fs.mkdir(workspace);
    await fs.writeFile(path.join(workspace, 'slide.png'), 'fixture');
    await fs.writeFile(path.join(root, 'private.png'), 'fixture');
    await fs.symlink(path.join(root, 'private.png'), path.join(workspace, 'linked.png'));
    const scope = { taskId: 'authorized-test', workspace };
    const approval = { taskId: scope.taskId, status: 'pending', details: { tool: 'analyze_image', params: { path: 'slide.png' } } };
    assert.equal(await approvedTestImage(approval, scope), await fs.realpath(path.join(workspace, 'slide.png')));
    assert.equal(await approvedTestImage({ ...approval, taskId: 'other-task' }, scope), null);
    assert.equal(await approvedTestImage({ ...approval, status: 'approved' }, scope), null);
    for (const file of ['../private.png', 'linked.png', 'missing.png', '.']) {
      assert.equal(await approvedTestImage({ ...approval, details: { ...approval.details, params: { path: file } } }, scope), null);
    }
    for (const tool of ['run_command', 'delete_file', 'http_request']) {
      assert.equal(await approvedTestImage({ ...approval, details: { ...approval.details, tool } }, scope), null);
    }
    const batchApproval = paths => ({ ...approval, details: { ...approval.details, params: { paths } } });
    assert.deepEqual(await approvedTestImage(batchApproval(['slide.png']), scope), [await fs.realpath(path.join(workspace, 'slide.png'))]);
    for (const paths of [[], ['slide.png', '../private.png'], ['slide.png', 'linked.png'], ['slide.png', null], Array(6).fill('slide.png')]) {
      assert.equal(await approvedTestImage(batchApproval(paths), scope), null);
    }
    assert.equal(await approvedTestImage({ ...approval, details: { ...approval.details, params: { path: 'slide.png', paths: ['slide.png'] } } }, scope), null);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
