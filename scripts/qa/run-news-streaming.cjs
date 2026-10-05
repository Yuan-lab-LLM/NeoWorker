// Run after build:electron with: ELECTRON_RUN_AS_NODE= electron scripts/qa/run-news-streaming.cjs
// Uses an isolated Electron profile and loopback HTTP fixtures, never real feeds or user data.
const { app, session } = require('electron');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const compiled = process.env.NEOWORKER_QA_APP_ASAR
  ? path.join(process.env.NEOWORKER_QA_APP_ASAR, 'dist/electron/electron')
  : path.resolve(__dirname, '../../dist/electron/electron');
const { sessionFetch } = require(path.join(compiled, 'utils/network-fetch.js'));
const { readPaperNewsResponse } = require(path.join(compiled, 'paper-news/service.js'));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'neoworker-news-streaming-'));
app.setPath('userData', profile);
let stage = 'starting Electron';
const deadline = setTimeout(() => { console.error(`Streaming QA timed out: ${stage}`); app.exit(1); }, 30_000);
let forbidden = 0;
let sent = 0;
let disconnected;
const closed = new Promise(resolve => { disconnected = resolve; });
const server = http.createServer((req, res) => {
  if (req.url === '/redirect') { res.writeHead(302, { Location: '/forbidden' }); res.end(); return; }
  if (req.url === '/forbidden') forbidden++;
  res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
  res.flushHeaders();
  if (req.url === '/stall') { res.write('x'.repeat(16 * 1024)); return; }
  if (req.url === '/oversized') {
    const timer = setInterval(() => { sent++; res.write(Buffer.alloc(64 * 1024)); }, 10);
    res.on('close', () => { clearInterval(timer); disconnected(); });
    return;
  }
  res.write('正常');
  setTimeout(() => res.end('响应'), 20);
});
(async () => {
  try {
    await app.whenReady();
    stage = 'starting local server';
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const isolated = session.fromPartition('news-streaming-qa', { cache: false });
    stage = 'configuring isolated transport';
    await isolated.setProxy({ mode: 'direct' });
    const fetch = sessionFetch(require('electron'), isolated);
    const request = (route, signal = AbortSignal.timeout(2000)) => fetch(base + route, { redirect: 'manual', signal });
    stage = 'normal streamed response';
    assert.equal(await (await request('/ok')).text(), '正常响应');
    stage = 'oversized response cancellation';
    const oversized = await request('/oversized');
    await assert.rejects(readPaperNewsResponse(oversized, 128 * 1024), /invalidResponse/);
    stage = 'waiting for upstream disconnect';
    await closed;
    assert.ok(sent <= 5, `Oversized response continued downloading: ${sent} chunks`);
    const abort = new AbortController();
    stage = 'stalled response headers';
    const abortTimer = setTimeout(() => abort.abort(new Error('fixture headers timeout')), 2000);
    const stalled = await request('/stall', abort.signal);
    clearTimeout(abortTimer);
    stage = 'stalled body timeout';
    const reading = stalled.text();
    const rejected = assert.rejects(reading, /fixture timeout/);
    abort.abort(new Error('fixture timeout'));
    await rejected;
    stage = 'manual redirect';
    const redirect = await request('/redirect');
    assert.equal(redirect.status, 302);
    assert.ok(redirect.headers.get('location').endsWith('/forbidden'));
    assert.equal(forbidden, 0);
    console.log(JSON.stringify({ passed: true, oversizedChunksBeforeCancel: sent, stalledBodyAborted: true, uncheckedRedirectsFollowed: forbidden }));
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    clearTimeout(deadline);
    server.closeAllConnections();
    server.close();
    fs.rmSync(profile, { recursive: true, force: true });
    app.exit(process.exitCode || 0);
  }
})();
