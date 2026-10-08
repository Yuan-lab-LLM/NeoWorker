// Five real bundled ACP processes, isolated data, and a local model fixture.
// Exercises parallel initialize/session creation, MCP tool execution and results
// without using the user's chats, provider credentials or a live model service.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { createRequire } from "node:module";
import { build } from "esbuild";

const root = path.resolve(import.meta.dirname, "../..");
const scratch = await fs.mkdtemp(path.join(os.tmpdir(), "neoworker-team-startup-"));
const binary = process.env.NEOWORKER_QA_HERMES_BINARY || path.join(root, "build/hermes-runtime/hermes-acp-neoworker-host" + (process.platform === "win32" ? ".exe" : ""));
const workers = Number(process.env.NEOWORKER_QA_WORKERS || 5);
assert(Number.isInteger(workers) && workers > 0 && workers <= 8);
const runtimes = [], metrics = [];
let modelRequests = 0;
const server = http.createServer(async (req, res) => {
  try {
    if (req.method !== "POST") {
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({ data: [{ id: "team-startup-fixture" }] }));
    }
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);
    modelRequests++;
    const finished = body.messages?.some(message => message.role === "tool");
    const tool = body.tools?.find(entry => entry.function?.name?.endsWith("save_result"));
    assert(finished || tool, "The real runtime must discover the host tool");
    const message = finished
      ? { role: "assistant", content: "NEOWORKER_TEAM_OK" }
      : { role: "assistant", content: null, tool_calls: [{ id: `call-${modelRequests}`, type: "function", function: {
        name: tool.function.name, arguments: JSON.stringify({ text: "NEOWORKER_TEAM_OK" }),
      } }] };
    const base = { id: `response-${modelRequests}`, created: Math.floor(Date.now() / 1000), model: "team-startup-fixture" };
    const finishReason = finished ? "stop" : "tool_calls";
    if (body.stream) {
      res.setHeader("Content-Type", "text/event-stream");
      const delta = { ...message };
      if (delta.tool_calls) delta.tool_calls = delta.tool_calls.map((call, index) => ({ index, ...call }));
      res.write(`data: ${JSON.stringify({ ...base, object: "chat.completion.chunk", choices: [{ index: 0, delta, finish_reason: null }] })}\n\n`);
      res.write(`data: ${JSON.stringify({ ...base, object: "chat.completion.chunk", choices: [{ index: 0, delta: {}, finish_reason: finishReason }] })}\n\n`);
      res.end("data: [DONE]\n\n");
    } else {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ...base, object: "chat.completion", choices: [{ index: 0, message, finish_reason: finishReason }] }));
    }
  } catch (error) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: { message: error.message } }));
  }
});

try {
  // Compile the current source, not a potentially stale dist adapter.
  const compiled = path.join(scratch, "runtime.cjs");
  await build({ entryPoints: [path.join(root, "src/electron/agent/runtime/hermes-runtime-adapter.ts")], outfile: compiled, bundle: true, platform: "node", format: "cjs", logLevel: "silent" });
  const { HermesRuntimeAdapter } = createRequire(import.meta.url)(compiled);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await fs.mkdir(path.join(scratch, "home"));
  const outcome = await Promise.allSettled(Array.from({ length: workers }, async (_, index) => {
    const cwd = path.join(scratch, `worker-${index}`);
    await fs.mkdir(cwd);
    const metric = { worker: index, toolCalls: 0 };
    metrics.push(metric);
    const started = Date.now();
    const runtime = new HermesRuntimeAdapter({
      command: binary, args: [], cwd, timeoutMs: 90_000, firstByteTimeoutMs: 60_000,
      env: {
        HOME: path.join(scratch, "home"), USERPROFILE: path.join(scratch, "home"),
        HERMES_HOME: path.join(scratch, "hermes"),
        NEOWORKER_HERMES_PROVIDER: "custom", NEOWORKER_HERMES_MODEL: "team-startup-fixture",
        NEOWORKER_HERMES_API_MODE: "chat_completions",
        NEOWORKER_HERMES_BASE_URL: `http://127.0.0.1:${port}/v1`,
        NEOWORKER_HERMES_API_KEY: "local-qa-only",
        OPENAI_API_KEY: "", ANTHROPIC_API_KEY: "", OPENROUTER_API_KEY: "",
        NO_PROXY: "127.0.0.1,localhost", no_proxy: "127.0.0.1,localhost",
      },
      onTransportEvent: event => {
        if (event.phase === "response" && event.method === "initialize") metric.initializeMs = event.durationMs;
      },
      hostToolBridge: {
        taskId: `startup-worker-${index}`,
        getTools: () => [{ name: "save_result", description: "Save the worker result", input_schema: {
          type: "object", properties: { text: { type: "string" } }, required: ["text"],
        } }],
        execute: async ({ toolCallId, input }) => {
          metric.toolCalls++;
          await fs.writeFile(path.join(cwd, "result.txt"), input.text);
          return { schemaVersion: "neoworker_tool_host_v1", requestId: `result-${index}`, toolCallId, status: "success", result: { saved: true } };
        },
      },
    });
    runtimes.push(runtime);
    const result = await runtime.prompt("Use save_result once with NEOWORKER_TEAM_OK, then return NEOWORKER_TEAM_OK.");
    metric.totalMs = Date.now() - started;
    metric.sessionId = result.sessionId;
    assert.equal(result.stopReason, "end_turn");
    assert.equal(result.assistantText.trim(), "NEOWORKER_TEAM_OK");
    assert.equal(await fs.readFile(path.join(cwd, "result.txt"), "utf8"), "NEOWORKER_TEAM_OK");
    assert.equal(metric.toolCalls, 1);
    assert.deepEqual(runtime.getCheckpoint().toolProgress.unknownToolCallIds, []);
    console.log(JSON.stringify(metric));
  }));
  const errors = outcome.filter(item => item.status === "rejected").map(item => String(item.reason));
  assert.deepEqual(errors, [], "Every worker must complete");
  assert.equal(new Set(metrics.map(item => item.sessionId)).size, workers, "Workers must have distinct sessions");
  console.log(JSON.stringify({ ok: true, workers, modelRequests, maxInitializeMs: Math.max(...metrics.map(item => item.initializeMs)), maxTotalMs: Math.max(...metrics.map(item => item.totalMs)) }));
} finally {
  await Promise.allSettled(runtimes.map(runtime => runtime.close()));
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  await fs.rm(scratch, { recursive: true, force: true });
}
