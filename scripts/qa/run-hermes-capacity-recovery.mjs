// Real packaged ACP process + local model fixture + production executor retry
// and scheduler delivery. No user config, provider credentials or chat messages.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '../..');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'neoworker-capacity-qa-'));
process.env.NEOWORKER_USER_DATA_DIR = path.join(scratch, 'userdata');
const load = (file) => require(path.join(root, 'dist/electron/electron', file));
const { TaskExecutor } = load('agent/executor.js');
const { HermesRuntimeAdapter } = load('agent/runtime/hermes-runtime-adapter.js');
const { CronService } = load('cron/service.js');
// Keep the launcher beside its bundled libraries (PyInstaller onedir).
const binary = process.env.NEOWORKER_QA_HERMES_BINARY || path.join(root, 'build/hermes-runtime/hermes-acp-neoworker-host');
const answer = '测试天气结果：北京晴，25°C（本地测试数据）。';
const deliveries = [], retries = [], errors = [], calls = [], sessionIds = [];
let requestCount = 0, task = { status: 'executing' }, execution;
const server = http.createServer(async (req, res) => {
  let text = '';
  for await (const chunk of req) text += chunk;
  if (req.method !== 'POST') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ data: [{ id: 'capacity-fixture' }] }));
  }
  const body = JSON.parse(text);
  requestCount++;
  res.setHeader('Content-Type', 'application/json');
  if (retries.length === 0) {
    res.statusCode = 502;
    return res.end(JSON.stringify({ error: { message: 'The request queue is full.', type: 'server_error' } }));
  }
  const toolResult = body.messages?.some((message) => message.role === 'tool');
  const tool = body.tools?.find((entry) => entry.function?.name?.endsWith('web_search'));
  const message = toolResult
    ? { role: 'assistant', content: answer }
    : { role: 'assistant', content: null, tool_calls: [{ id: 'weather-qa', type: 'function', function: {
        name: tool?.function.name || 'mcp_neoworker_web_search', arguments: JSON.stringify({ query: '北京天气' }),
      } }] };
  const base = { id: `qa-${requestCount}`, created: Math.floor(Date.now()/1000), model: 'capacity-fixture' };
  if (body.stream) {
    res.setHeader('Content-Type', 'text/event-stream');
    const delta = { ...message };
    if (delta.tool_calls) delta.tool_calls = delta.tool_calls.map((call, index) => ({ index, ...call }));
    res.write(`data: ${JSON.stringify({ ...base, object: 'chat.completion.chunk', choices: [{ index: 0, delta, finish_reason: null }] })}\n\n`);
    res.write(`data: ${JSON.stringify({ ...base, object: 'chat.completion.chunk', choices: [{ index: 0, delta: {}, finish_reason: toolResult ? 'stop' : 'tool_calls' }], usage: { prompt_tokens: 20, completion_tokens: 20, total_tokens: 40 } })}\n\n`);
    res.end('data: [DONE]\n\n');
  } else {
    res.end(JSON.stringify({ ...base, object: 'chat.completion',
      choices: [{ index: 0, message, finish_reason: toolResult ? 'stop' : 'tool_calls' }],
      usage: { prompt_tokens: 20, completion_tokens: 20, total_tokens: 40 } }));
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const runtime = new HermesRuntimeAdapter({
  cwd: scratch,
  command: binary,
  args: [], timeoutMs: 180_000, firstByteTimeoutMs: 90_000,
  onCheckpoint: async (checkpoint) => { sessionIds.push(checkpoint.sessionId); },
  env: {
    HERMES_HOME: path.join(scratch, 'hermes'),
    NEOWORKER_HERMES_PROVIDER: 'custom', NEOWORKER_HERMES_MODEL: 'capacity-fixture',
    NEOWORKER_HERMES_API_MODE: 'chat_completions',
    NEOWORKER_HERMES_BASE_URL: `http://127.0.0.1:${port}/v1`,
    NEOWORKER_HERMES_API_KEY: 'local-qa-only',
    OPENAI_API_KEY: '', ANTHROPIC_API_KEY: '', OPENROUTER_API_KEY: '',
    NO_PROXY: '127.0.0.1,localhost', no_proxy: '127.0.0.1,localhost',
  },
  hostToolBridge: {
    taskId: 'capacity-qa',
    getTools: () => [{ name: 'web_search', description: 'Query weather fixture', input_schema: {
      type: 'object', properties: { query: { type: 'string' } }, required: ['query'],
    } }],
    execute: async ({ toolCallId, toolName }) => {
      calls.push(toolName);
      return { schemaVersion: 'neoworker_tool_host_v1', requestId: 'weather-request', toolCallId, status: 'success', result: { text: answer } };
    },
  },
});
const prompt = runtime.prompt.bind(runtime);
runtime.prompt = async (...args) => {
  try { return await prompt(...args); }
  catch (error) { errors.push({ code: error.code, message: error.message, data: error.data }); throw error; }
};
const executor = Object.create(TaskExecutor.prototype);
executor.task = { id: 'capacity-qa', prompt: '告诉我北京天气' };
executor.emitEvent = (type, payload) => {
  if (type === 'log' && payload.metric === 'hermes_runtime_retry') {
    assert.equal(deliveries.length, 0, 'Never deliver a premature failure during recovery');
    retries.push(payload); console.log(JSON.stringify({ phase: 'retry', attempt: payload.attempt, delayMs: payload.delayMs }));
  }
};
const service = new CronService({
  cronEnabled: true, storePath: path.join(scratch, 'jobs.json'), defaultTimeoutMs: 240_000,
  log: { debug() {}, info() {}, warn() {}, error() {} },
  createTask: async ({ prompt }) => {
    execution = executor.runHermesPromptWithTransientRetry(runtime, prompt, false).then((result) => {
      task = { status: 'completed', resultSummary: result.assistantText };
    }).catch((error) => {
      task = { status: 'failed', error: executor.buildTaskFailureMessage(error, 'dependency_unavailable') };
    });
    return { id: 'capacity-qa' };
  },
  getTaskStatus: async () => task,
  getTaskResultText: async () => task.resultSummary,
  deliverToChannel: async (delivery) => { deliveries.push(delivery); },
});
try {
  await service.start();
  const added = await service.add({ name: '北京天气测试', workspaceId: 'isolated-qa', enabled: false,
    taskPrompt: '告诉我北京天气', schedule: { kind: 'every', everyMs: 3_600_000 },
    delivery: { enabled: true, channelType: 'weixin', channelDbId: 'isolated-qa', channelId: 'local-capture-only' },
  });
  assert.equal(added.ok, true);
  const result = await service.run(added.job.id, 'force');
  await execution;
  assert.equal(task.status, 'completed', JSON.stringify({ task, errors }));
  assert.equal(retries.length, 1);
  assert.equal(new Set(sessionIds).size, 1, 'Retry must restore the same session');
  assert.equal(errors[0]?.code, 'HERMES_RUNTIME_ERROR');
  assert.match(errors[0]?.message, /502/);
  assert.deepEqual(calls, ['web_search']);
  assert.equal(deliveries.length, 1);
  assert.match(JSON.stringify(deliveries[0]), /测试天气结果/);
  const history = await service.getRunHistory(added.job.id);
  assert.equal(history.entries[0].status, 'ok');
  console.log(JSON.stringify({ ok: true, requestCount, runtimeErrors: errors, retries: retries.length,
    tools: calls, deliveries: deliveries.length, status: result.status, history: history.entries[0].status }, null, 2));
} finally {
  await runtime.close();
  await execution;
  await service.stop();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(scratch, { recursive: true, force: true });
}
