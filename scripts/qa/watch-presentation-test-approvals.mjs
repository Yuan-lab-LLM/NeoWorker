// Explicitly scoped approval handling for an operator-authorized PPT test.
// Does not change NeoWorker permissions or approve unrelated tasks/tools.
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

export async function approvedTestImage(approval, { taskId, workspace }) {
  if (approval.taskId !== taskId || approval.status !== 'pending') return null;
  const details = approval.details || {};
  if (details.tool !== 'analyze_image') return null;
  const batch = details.params?.paths;
  if (batch !== undefined && (!Array.isArray(batch) || batch.length < 1 || batch.length > 5 || details.params?.path !== undefined)) return null;
  const requested = batch || [details.params?.path];
  if (requested.some(file => typeof file !== 'string' || !file)) return null;
  try {
    const root = await fs.realpath(workspace);
    const files = [];
    for (const requestedPath of requested) {
      const file = await fs.realpath(path.resolve(root, requestedPath));
      const relative = path.relative(root, file);
      if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return null;
      if (!/\.(png|jpe?g|webp)$/i.test(file) || !(await fs.stat(file)).isFile()) return null;
      files.push(file);
    }
    return batch ? files : files[0];
  } catch { return null; }
}

async function main() {
  const { values } = parseArgs({ options: {
    'cdp-url': { type: 'string' }, 'task-id': { type: 'string' },
    workspace: { type: 'string' }, 'audit-log': { type: 'string' },
    'stop-file': { type: 'string' }, help: { type: 'boolean' },
  } });
  if (values.help) {
    console.log('Usage: node scripts/qa/watch-presentation-test-approvals.mjs --cdp-url http://127.0.0.1:PORT --task-id ID --workspace TEST_WORKSPACE --audit-log FILE [--stop-file FILE]');
    return;
  }
  for (const key of ['cdp-url', 'task-id', 'workspace', 'audit-log']) {
    if (!values[key]) throw new Error(`Missing --${key}`);
  }
  const endpoint = new URL(values['cdp-url']);
  if (endpoint.protocol !== 'http:' || !['127.0.0.1', '[::1]', 'localhost'].includes(endpoint.hostname)) {
    throw new Error('Use the loopback CDP endpoint of the isolated test app.');
  }
  const scope = { taskId: values['task-id'], workspace: await fs.realpath(values.workspace) };
  const { chromium } = await import('playwright');
  // Electron requires the exact version endpoint (without a trailing slash).
  const version = await fetch(new URL('/json/version', endpoint)).then(r => {
    if (!r.ok) throw new Error(`CDP discovery failed: ${r.status}`);
    return r.json();
  });
  const browser = await chromium.connectOverCDP(version.webSocketDebuggerUrl);
  let stopped = false;
  const stop = () => { stopped = true; };
  browser.on('disconnected', stop);
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  try {
    const page = browser.contexts().flatMap(c => c.pages()).find(p => p.url().includes('/dist/renderer/'));
    if (!page) throw new Error('NeoWorker test renderer was not found.');
    const reported = new Set();
    while (!stopped) {
      if (values['stop-file'] && await fs.stat(values['stop-file']).then(() => true, () => false)) break;
      const { task, approvals } = await page.evaluate(async id => ({
        task: await window.electronAPI.getTask(id),
        approvals: await window.electronAPI.listPendingApprovals(100),
      }), scope.taskId);
      if (!task || ['cancelled', 'failed'].includes(task.status)) break;
      for (const approval of approvals.filter(a => a.taskId === scope.taskId && a.status === 'pending')) {
        const file = await approvedTestImage(approval, scope);
        if (!file) {
          if (!reported.has(approval.id)) {
            reported.add(approval.id);
            console.log(JSON.stringify({ needsOperatorReview: approval.id, tool: approval.details?.tool, type: approval.type }));
          }
          continue;
        }
        await page.evaluate(id => window.electronAPI.respondToApproval({ approvalId: id, action: 'allow_once' }), approval.id);
        const record = { at: new Date().toISOString(), taskId: scope.taskId, approvalId: approval.id, tool: 'analyze_image', path: file };
        await fs.appendFile(values['audit-log'], JSON.stringify(record) + '\n', { mode: 0o600 });
        console.log(JSON.stringify(record));
      }
      // Remain available across completed turns for operator review follow-ups.
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  } catch (error) {
    if (!stopped) throw error;
  } finally {
    browser.off('disconnected', stop);
    process.off('SIGINT', stop);
    process.off('SIGTERM', stop);
    await browser.close(); // Disconnect CDP; do not stop the application.
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
