// Exercise the compiled service, real daemon/runtime and on-disk persistence.
// Only model replies are deterministic. No browser control or user profile access.
// Run after build:electron: node scripts/qa/personal-assistants-runtime.cjs
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { spawn } = require("node:child_process");

const repo = path.resolve(__dirname, "../..");
const load = (name) => require(path.join(repo, "dist/electron/electron", name));
const marker = "ASSISTANT-SOURCE-62819";
const preference = "QA preference: put the answer before supporting evidence.";

async function worker() {
  const root = process.env.NEOWORKER_QA_ROOT;
  const phase = process.env.NEOWORKER_QA_PHASE;
  const { DatabaseManager } = load("database/schema.js");
  const { SecureSettingsRepository } = load("database/SecureSettingsRepository.js");
  const { LLMProviderFactory } = load("agent/llm/provider-factory.js");
  const { AgentDaemon } = load("agent/daemon.js");
  const { ManagedSessionService } = load("managed/ManagedSessionService.js");
  const { TaskRepository, TaskEventRepository } = load("database/repositories.js");
  const manager = new DatabaseManager();
  const db = manager.getDatabase();
  new SecureSettingsRepository(db);
  load("memory/MemoryService.js").MemoryService.initialize(manager);
  load("settings/personality-manager.js").PersonalityManager.initialize();
  load("voice/voice-settings-manager.js").VoiceSettingsManager.initialize(db);
  LLMProviderFactory.initialize();
  LLMProviderFactory.saveSettings({
    ...LLMProviderFactory.loadSettings(),
    providerType: "openai-compatible",
    openaiCompatible: {
      baseUrl: process.env.NEOWORKER_QA_MODEL_URL,
      apiKey: "local-qa-only", model: "qa-personal-assistant", apiMode: "chat_completions",
    },
  });
  const daemon = new AgentDaemon(manager, { startupRecovery: false });
  const service = new ManagedSessionService(db, daemon);
  const tasks = new TaskRepository(db);
  const events = new TaskEventRepository(db);
  let state;
  try {
    if (phase === "create") {
      const { agent } = service.createAgent({
        name: "QA persistent assistant", systemPrompt: "Answer using the current project's reference file.",
        executionMode: "solo", runtimeDefaults: { maxTurns: 4, allowedTools: ["read_file"] },
        metadata: { studio: { personalAssistant: { kind: "research", preferences: [preference] }, memoryConfig: { mode: "disabled" } } },
      });
      const source = path.join(root, "source.txt");
      fs.writeFileSync(source, marker);
      const project = await service.createPersonalAssistantProject({ agentId: agent.id, name: "QA isolated project", filePaths: [source] });
      fs.writeFileSync(path.join(root, "source-path.json"), JSON.stringify(project.config.filePaths[0]));
      const session = await service.createSession({
        agentId: agent.id, environmentId: project.id, title: "QA source lookup",
        initialEvent: { type: "user.message", content: [{ type: "text", text: "Read the reference file and reply with its exact marker. Do not search online or create any files." }] },
      });
      state = { agentId: agent.id, projectId: project.id, sessionId: session.id, taskId: session.backingTaskId, workspaceId: project.config.workspaceId, sourcePath: project.config.filePaths[0] };
      fs.writeFileSync(path.join(root, "state.json"), JSON.stringify(state));
    } else {
      state = JSON.parse(fs.readFileSync(path.join(root, "state.json"), "utf8"));
      const sessions = service.listSessions({ agentId: state.agentId });
      assert.equal(sessions.length, 1);
      assert.equal(sessions[0].backingTaskId, state.taskId);
      assert.equal(sessions[0].status, "completed");
      assert.equal(fs.readFileSync(state.sourcePath, "utf8"), marker);
      const detail = service.getAgent(state.agentId);
      service.updateAgent(state.agentId, { metadata: { ...detail.currentVersion.metadata, studio: { ...detail.currentVersion.metadata.studio, personalAssistant: { kind: "research", preferences: ["New preference for future conversations only"] } } } });
      await service.sendUserMessage(state.sessionId, [{ type: "text", text: "Continue the same conversation. What exact marker did you read earlier? Reply directly without tools." }]);
    }
    const deadline = Date.now() + 90_000;
    let task;
    while (Date.now() < deadline) {
      task = tasks.findById(state.taskId);
      if (["completed", "failed", "cancelled"].includes(task?.status)) break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    assert.equal(task?.status, "completed", task?.error || "Turn did not complete within 90 seconds");
    assert.match(task.resultSummary || "", new RegExp(marker));
    assert.equal(task.workspaceId, state.workspaceId);
    assert.deepEqual(task.agentConfig.personalAssistant.preferences, [preference]);
    assert.equal(tasks.findAll().length, 1, "Reopening must not create another task");
    assert.equal(service.getSession(state.sessionId).status, "completed");
    const history = events.findByTaskId(state.taskId);
    assert(history.length > 0);
    fs.writeFileSync(path.join(root, `${phase}-result.json`), JSON.stringify({ phase, passed: true, taskId: task.id, events: history.length, runtime: task.agentConfig.externalRuntime?.agent || "native", answer: task.resultSummary }));
  } finally {
    await daemon.shutdown();
    manager.close();
  }
}

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "neoworker-assistants-runtime-"));
  const reportDir = path.join(repo, "artifacts/personal-assistants-2026-10-08");
  fs.mkdirSync(reportDir, { recursive: true });
  const requests = [];
  let phase = "create", modelError, readRequested = false;
  const server = http.createServer(async (req, res) => {
    try {
      if (req.method === "GET" && req.url === "/v1/models") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ object: "list", data: [{ id: "qa-personal-assistant", object: "model", owned_by: "local-qa" }] }));
        return;
      }
      if (req.method !== "POST") { res.writeHead(404); res.end(); return; }
      let raw = "";
      for await (const chunk of req) raw += chunk;
      const body = JSON.parse(raw);
      const names = (body.tools || []).map((tool) => tool.function?.name);
      const context = JSON.stringify(body.messages || []);
      const hasSourceToolResult = (body.messages || []).some((message) =>
        message.role === "tool" && message.tool_call_id === "call_source" && JSON.stringify(message.content).includes(marker),
      );
      const read = names.find((name) => /(?:^|_)read_file$/.test(name));
      let message = { role: "assistant", content: marker };
      requests.push({ phase, tools: names.length, hasPreference: context.includes(preference), hasMarker: context.includes(marker), hasSourceToolResult });
      if (requests.length > 16) throw new Error("Unexpected repeated model calls");
      if (phase === "create" && read && !readRequested) {
        assert(context.includes("QA isolated project"));
        assert(context.includes(preference));
        readRequested = true;
        message = { role: "assistant", content: null, tool_calls: [{ id: "call_source", type: "function", function: { name: read, arguments: JSON.stringify({ path: JSON.parse(fs.readFileSync(path.join(root, "source-path.json"), "utf8")) }) } }] };
      }
      const finish = message.tool_calls ? "tool_calls" : "stop";
      const base = { id: `chatcmpl-qa-${requests.length}`, created: Math.floor(Date.now() / 1000), model: "qa-personal-assistant" };
      if (body.stream) {
        res.writeHead(200, { "Content-Type": "text/event-stream" });
        const delta = { ...message, ...(message.tool_calls ? { tool_calls: message.tool_calls.map((call, index) => ({ index, ...call })) } : {}) };
        res.write(`data: ${JSON.stringify({ ...base, object: "chat.completion.chunk", choices: [{ index: 0, delta, finish_reason: null }] })}\n\n`);
        res.end(`data: ${JSON.stringify({ ...base, object: "chat.completion.chunk", choices: [{ index: 0, delta: {}, finish_reason: finish }] })}\n\ndata: [DONE]\n\n`);
      } else {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ...base, object: "chat.completion", choices: [{ index: 0, message, finish_reason: finish }], usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 } }));
      }
    } catch (error) {
      modelError = error;
      res.writeHead(500); res.end("Local QA fixture failed");
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    for (phase of ["create", "reopen"]) {
      const log = fs.openSync(path.join(reportDir, `runtime-${phase}.log`), "w");
      try {
        const exitCode = await new Promise((resolve, reject) => {
          const child = spawn(process.execPath, [__filename, "--worker"], {
            cwd: repo, stdio: ["ignore", log, log], timeout: 115_000,
            env: { ...process.env, NEOWORKER_QA_ROOT: root, NEOWORKER_QA_PHASE: phase, NEOWORKER_QA_MODEL_URL: `http://127.0.0.1:${server.address().port}/v1`, NEOWORKER_USER_DATA_DIR: path.join(root, "profile"), NEOWORKER_DISABLE_OS_KEYCHAIN: "1", NEOWORKER_BACKGROUND_AUTOSTART: "0" },
          });
          child.once("error", reject); child.once("exit", (code) => resolve(code));
        });
        if (modelError) throw modelError;
        assert.equal(exitCode, 0, `Worker ${phase} failed; inspect runtime-${phase}.log`);
        console.log(`${phase}: passed`);
      } finally { fs.closeSync(log); }
    }
    assert(readRequested, "Reference file must be read by a real host tool");
    assert(requests.some((request) => request.phase === "create" && request.hasSourceToolResult), "Real file content must reach the model as the read tool's result");
    assert(requests.some((request) => request.phase === "reopen" && request.hasMarker && request.hasPreference), "Persisted conversation context must reach the restarted runtime");
    const phases = ["create", "reopen"].map((name) => JSON.parse(fs.readFileSync(path.join(root, `${name}-result.json`), "utf8")));
    const report = { passed: true, model: "deterministic local replies (no external provider)", separateProcesses: true, sameTask: phases[0].taskId === phases[1].taskId, requests, phases };
    fs.writeFileSync(path.join(reportDir, "runtime-report.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    fs.rmSync(root, { recursive: true, force: true });
  } catch (error) { console.error(`QA evidence retained at ${root}`); throw error; }
  finally { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
}

(process.argv.includes("--worker") ? worker() : main()).then(() => process.exit(0), (error) => { console.error(error); process.exit(1); });
