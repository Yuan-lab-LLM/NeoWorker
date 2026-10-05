import { afterEach, describe, expect, it, vi } from "vitest";
import * as path from "node:path";
import { HermesAcpClient } from "../hermes-acp-client";
import { HermesRuntimeAdapter, type HermesSessionCheckpoint } from "../hermes-runtime-adapter";

const fixture = path.join(__dirname, "fixtures", "hermes-acp-fixture.cjs");
const delayedShutdownFixture = path.join(__dirname, "fixtures", "hermes-acp-delayed-shutdown.cjs");
const options = { command: process.execPath, args: [fixture], cwd: __dirname, timeoutMs: 5000 };
const cleanup: Array<() => void> = [];
afterEach(async () => {
  await Promise.all(cleanup.splice(0).map(async (stop) => {
    await stop();
  }));
});
async function client() {
  const c = new HermesAcpClient();
  cleanup.push(() => c.stop());
  await c.start(options);
  return c;
}
function runtime(extra: Partial<ConstructorParameters<typeof HermesRuntimeAdapter>[0]> = {}) {
  const r = new HermesRuntimeAdapter({ ...options, ...extra });
  cleanup.push(() => r.close());
  return r;
}

describe("Hermes ACP subprocess transport", () => {
  it("keeps progressing prompts alive within the hard deadline", async () => {
    const c = await client();
    await c.initialize();
    const session = await c.newSession(__dirname);
    await expect(c.prompt(String(session.sessionId), "progress-until-done", { timeoutMs: 2000, idleTimeoutMs: 150 })).resolves.toMatchObject({ stopReason: "end_turn" });
  });
  it("does not let progress extend the hard deadline indefinitely", async () => {
    const c = await client();
    await c.initialize();
    const session = await c.newSession(__dirname);
    await expect(c.prompt(String(session.sessionId), "progress-never-done", { timeoutMs: 250, idleTimeoutMs: 150 })).rejects.toMatchObject({ code: "REQUEST_TIMEOUT" });
  });
  it("drains stderr while performing a real stdio handshake", async () => {
    const c = await client();
    expect(await c.initialize()).toMatchObject({ protocolVersion: 1 });
  });
  it("matches concurrent out-of-order responses", async () => {
    const c = await client();
    const slow = c.request('echo', { label: 'slow', delay: 20 });
    const fast = c.request('echo', { label: 'fast' });
    expect(await fast).toMatchObject({ label: 'fast' });
    expect(await slow).toMatchObject({ label: 'slow' });
  });
  it("decodes UTF-8 split across individual bytes", async () => {
    expect(await (await client()).request('unicode', {})).toBe('中文 😀');
  });
  it("responds to agent permission requests while waiting for a response", async () => {
    const c = await client();
    c.onRequest = async (method, params) => {
      expect(method).toBe('session/request_permission');
      expect(params.sessionId).toBe('fixture-session');
      return { outcome: { outcome: 'selected', optionId: 'allow_once' } };
    };
    expect(await c.request('permission', {})).toEqual({ outcome: { outcome: 'selected', optionId: 'allow_once' } });
  });
  it("denies permissions without a host handler", async () => {
    expect(await (await client()).request('permission', {})).toEqual({ outcome: { outcome: 'cancelled' } });
  });
  it("rejects unsupported callbacks instead of silently hanging", async () => {
    expect(await (await client()).request('unknownCallback', {})).toMatchObject({ code: -32601 });
  });
  it("preserves remote error code and data", async () => {
    await expect((await client()).request('error', {})).rejects.toMatchObject({ code: -32001, data: {retryable:false} });
  });
  it("emits bounded transport telemetry without response bodies", async () => {
    const events: Any[] = [];
    const c = new HermesAcpClient();
    cleanup.push(() => c.stop());
    await c.start({ ...options, onTransportEvent: (event) => events.push(event) });
    await c.request("echo", { telemetry: true });
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        phase: "request_started",
        method: "echo",
        requestId: expect.any(String),
        startedAt: expect.any(Number),
        timeoutMs: 5000,
        firstByteTimeoutMs: 30000,
      }),
      expect.objectContaining({
        phase: "first_byte",
        method: "echo",
        firstByteElapsedMs: expect.any(Number),
      }),
      expect.objectContaining({
        phase: "response",
        method: "echo",
        durationMs: expect.any(Number),
      }),
    ]));
    expect(events.some((event) => Object.prototype.hasOwnProperty.call(event, "response"))).toBe(false);
  });
  it("rejects all pending calls when a process exits", async () => {
    const c = await client();
    const results = Promise.allSettled([c.request('wait', {}), c.request('exit', {})]);
    for (const result of await results) expect(result).toMatchObject({ status: 'rejected', reason: { code: 'PROCESS_EXITED' } });
  });
  it("includes bounded stderr diagnostics when the ACP process exits", async () => {
    const c = new HermesAcpClient();
    cleanup.push(() => c.stop());
    const stderrFixture = path.join(__dirname, "fixtures", "hermes-acp-stderr-exit.cjs");
    await c.start({ ...options, args: [stderrFixture] });
    await expect(c.initialize()).rejects.toMatchObject({
      code: "PROCESS_EXITED",
      message: expect.stringContaining("fixture startup failure"),
      data: { stderr: expect.stringContaining("fixture startup failure") },
    });
  });
  it("tears down a timed-out connection and can restart without stale handlers", async () => {
    const c = await client();
    await expect(c.request('wait', {}, 100)).rejects.toMatchObject({code:'REQUEST_TIMEOUT'});
    await c.start(options);
    expect(await c.request('echo', {restarted:true})).toEqual({restarted:true});
  });
  it("shares shutdown and waits before starting a replacement process", async () => {
    const c = new HermesAcpClient();
    const delayedOptions = {
      command: process.execPath,
      args: [delayedShutdownFixture],
      cwd: __dirname,
      timeoutMs: 5000,
    };
    await c.start(delayedOptions);
    expect(await c.initialize()).toMatchObject({ protocolVersion: 1 });

    const firstStop = c.stop();
    const secondStop = c.stop();
    // `stop()` must share one lifecycle promise. This is the portable
    // invariant; Windows may terminate a SIGTERM'ed Node child immediately,
    // while Unix fixtures can intentionally delay close delivery.
    expect(secondStop).toBe(firstStop);
    await firstStop;

    await c.start(delayedOptions);
    expect(await c.initialize()).toMatchObject({ protocolVersion: 1 });
    await c.stop();
  });
  it("rejects a missing executable and permits a subsequent start", async () => {
    const c = new HermesAcpClient(); cleanup.push(() => c.stop());
    await expect(c.start({...options,command:'/nonexistent/neoworker-hermes-test'})).rejects.toMatchObject({code:'HERMES_UNAVAILABLE'});
    await c.start(options);
    expect(await c.initialize()).toMatchObject({protocolVersion:1});
  });
  it("handles an already-aborted signal without sending a request", async () => {
    const c = await client(); const controller = new AbortController(); controller.abort();
    await expect(c.request('exit', {}, {signal:controller.signal})).rejects.toMatchObject({code:'CANCELLED'});
    expect(await c.request('echo', {alive:true})).toEqual({alive:true});
  });
  it("cancels in-flight calls", async () => {
    const c = await client(); const controller = new AbortController();
    const request = c.request('wait', {}, {signal:controller.signal});
    controller.abort();
    await expect(request).rejects.toMatchObject({code:'CANCELLED'});
  });
  it("reports a first-byte timeout separately from the total timeout", async () => {
    const events: Any[] = [];
    const c = new HermesAcpClient(); cleanup.push(() => c.stop());
    await c.start({ ...options, firstByteTimeoutMs: 30, onTransportEvent: (event) => events.push(event) });
    await expect(c.request("wait", {}, { timeoutMs: 1000 })).rejects.toMatchObject({ code: "FIRST_BYTE_TIMEOUT" });
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ phase: "timeout", code: "FIRST_BYTE_TIMEOUT", method: "wait" }),
      expect.objectContaining({ phase: "connection_closed", code: "FIRST_BYTE_TIMEOUT" }),
    ]));
  });
  it("accepts a matching streamed event before a slow final response", async () => {
    const c = new HermesAcpClient(); cleanup.push(() => c.stop());
    await c.start({ ...options, firstByteTimeoutMs: 200 });
    await c.initialize();
    expect(await c.prompt('fixture-session', 'delayed-stream', 2000))
      .toMatchObject({stopReason:'end_turn'});
  });
  it("does not count a foreign session's update as the first response", async () => {
    const c = new HermesAcpClient(); cleanup.push(() => c.stop());
    await c.start({ ...options, firstByteTimeoutMs: 200 });
    await c.initialize();
    await expect(c.prompt('fixture-session', 'foreign-stream', 2000))
      .rejects.toMatchObject({code:'FIRST_BYTE_TIMEOUT'});
  });
  it("keeps the total timeout after a matching streamed event", async () => {
    const c = new HermesAcpClient(); cleanup.push(() => c.stop());
    await c.start({ ...options, firstByteTimeoutMs: 200 });
    await c.initialize();
    await expect(c.prompt('fixture-session', 'stream-without-result', 500))
      .rejects.toMatchObject({code:'REQUEST_TIMEOUT'});
  });
  it("does not time out waiting for the first response while approval is open", async () => {
    const c = new HermesAcpClient(); cleanup.push(() => c.stop());
    await c.start({ ...options, firstByteTimeoutMs: 200 });
    await c.initialize();
    c.onRequest = async () => {
      await new Promise(resolve => setTimeout(resolve, 500));
      return {outcome:{outcome:'selected',optionId:'reject'}};
    };
    expect(await c.prompt('fixture-session', 'permission', 2000))
      .toMatchObject({stopReason:'end_turn'});
  });
  it("fails fast on malformed protocol output", async () => {
    await expect((await client()).request('invalid', {})).rejects.toMatchObject({code:'PROTOCOL_ERROR'});
  });
  it("bounds incomplete frames in memory", async () => {
    const c = new HermesAcpClient(); cleanup.push(() => c.stop());
    await c.start({...options,maxFrameBytes:1024});
    await expect(c.request('oversized', {})).rejects.toMatchObject({code:'PROTOCOL_ERROR'});
  });
});

describe('Hermes runtime session', () => {
  it('does not forward late reasoning or answer chunks after the prompt has stopped', () => {
    const onUpdate = vi.fn();
    const adapter = runtime({ onUpdate }) as Any;
    adapter.sessionCheckpoint = { sessionId: 'fixture-session' };
    const notify = (sessionUpdate: string) => adapter.client.onNotification({
      method: 'session/update', params: { sessionId: 'fixture-session', update: {
        sessionUpdate, content: { type: 'text', text: 'private-content' },
      } },
    });
    adapter.acceptingUpdates = true;
    notify('agent_thought_chunk');
    expect(onUpdate).toHaveBeenCalledTimes(1);
    adapter.acceptingUpdates = false;
    notify('agent_thought_chunk');
    notify('agent_message_chunk');
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it('pauses an active host call and restores the checkpoint on a fresh transport', async () => {
    let started!: () => void;
    const ready = new Promise<void>(resolve => { started = resolve; });
    let toolSignal: AbortSignal | undefined;
    let calls = 0;
    const r = runtime({ hostToolBridge: {
      taskId: 'pause-host',
      getTools: () => [{ name: 'run_command', description: 'Run a command', input_schema: { type: 'object', properties: {} } }],
      execute: async call => {
        calls++;
        toolSignal = call.signal;
        started();
        return new Promise(() => {});
      },
    } });
    const pending = r.prompt('host-tool');
    await ready;
    const checkpoint = r.getCheckpoint();
    await r.pause();
    expect(await pending).toMatchObject({ stopReason: 'cancelled' });
    expect(toolSignal?.aborted).toBe(true);
    expect(r.getCheckpoint()).toMatchObject({
      sessionId: checkpoint?.sessionId,
      toolProgress: {
        activeToolCallIds: [],
        lastToolCallId: checkpoint?.toolProgress?.lastToolCallId,
      },
    });
    expect(await r.resume('next')).toMatchObject({ stopReason: 'end_turn', assistantText: '你好 OK', sessionId: checkpoint?.sessionId });
    expect(calls).toBe(1);
  });
  it('propagates an external abort to an active host call before allowing a later turn', async () => {
    let started!: () => void;
    const ready = new Promise<void>(resolve => { started = resolve; });
    let toolSignal: AbortSignal | undefined;
    let calls = 0;
    const controller = new AbortController();
    const r = runtime({ hostToolBridge: {
      taskId: 'abort-host',
      getTools: () => [{ name: 'run_command', description: 'Run a command', input_schema: { type: 'object', properties: {} } }],
      execute: async call => {
        calls++;
        toolSignal = call.signal;
        started();
        return new Promise(() => {});
      },
    } });
    const pending = r.prompt('host-tool', controller.signal);
    await ready;
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: 'CANCELLED' });
    expect(toolSignal?.aborted).toBe(true);
    expect(await r.prompt('next')).toMatchObject({ stopReason: 'end_turn', assistantText: '你好 OK' });
    expect(calls).toBe(1);
  });
  it('treats a structured runtime failure as an error even when ACP returns end_turn', async () => {
    const r = runtime();
    await expect(r.prompt('provider-error')).rejects.toMatchObject({
      code: 'HERMES_RUNTIME_ERROR', message: 'HTTP 402: Insufficient Balance', data: { retryable: false },
    });
    expect(r.getCheckpoint()?.sessionId).toBe('fixture-session');
  });
  it('mediates permission requests over subprocess stdio', async () => {
    const r = runtime({onPermissionRequest: async (request) => {
      expect(request.toolCall.rawInput).toEqual({path:'example.txt'});
      return 'reject';
    }});
    const result = await r.prompt('permission');
    expect(JSON.parse(result.assistantText)).toEqual({outcome:{outcome:'selected',optionId:'reject'}});
  });
  it('does not forward foreign-session approvals to the host', async () => {
    let called = false;
    const r = runtime({onPermissionRequest: async () => {called = true; return 'allow';}});
    const result = await r.prompt('foreign-permission');
    expect(called).toBe(false);
    expect(JSON.parse(result.assistantText)).toEqual({outcome:{outcome:'cancelled'}});
  });
  it('cancels while the host approval is pending and allows a later turn', async () => {
    let opened!: () => void;
    const ready = new Promise<void>(resolve => {opened = resolve;});
    let signal: AbortSignal | undefined;
    const r = runtime({onPermissionRequest: async (_, ctx) => {
      signal = ctx.signal; opened(); return new Promise(() => {});
    }});
    const pending = r.prompt('permission');
    await ready;
    await r.cancel();
    expect(await pending).toMatchObject({stopReason:'cancelled'});
    expect(signal?.aborted).toBe(true);
    expect(await r.prompt('next')).toMatchObject({stopReason:'end_turn',assistantText:'你好 OK'});
  });
  it('honors cancellation during initialization without starting the prompt', async () => {
    let approvals = 0;
    const r = runtime({onPermissionRequest: async () => {approvals++; return 'allow';}});
    const pending = r.prompt('permission');
    await r.cancel();
    expect(await pending).toMatchObject({assistantText:'',stopReason:'cancelled'});
    expect(approvals).toBe(0);
  });
  it('force-stops a real subprocess stuck in initialization without waiting for its request timeout', async () => {
    let initializing!: () => void;
    const ready = new Promise<void>(resolve => { initializing = resolve; });
    const r = runtime({ timeoutMs: 60_000,
      env: { NEOWORKER_TEST_HANG_INITIALIZE: '1' },
      onTransportEvent: event => {
        if (event.phase === 'request_started' && event.method === 'initialize') initializing();
      },
    });
    const outcome = r.prompt('permission').catch(error => error);
    await ready;
    const started = Date.now();
    await r.cancel();
    expect(Date.now() - started).toBeLessThan(5000);
    expect(await outcome).toMatchObject({ code: 'STOPPED' });
  }, 8000);
  it('persists its checkpoint before prompting and assembles only its own deltas', async () => {
    let saved: HermesSessionCheckpoint | undefined;
    const r=runtime({onCheckpoint:async (value)=>{saved=value;}});
    const result=await r.prompt('hello');
    expect(saved?.sessionId).toBe(result.sessionId);
    expect(result).toMatchObject({assistantText:'你好 OK',stopReason:'end_turn'});
  });
  it('exposes the stable start, checkpoint, and retry adapter contract', async () => {
    const r = runtime();
    const started = await r.start();
    expect(r.checkpoint()).toMatchObject(started);
    await expect(r.prompt('provider-error')).rejects.toMatchObject({
      code: 'HERMES_RUNTIME_ERROR',
    });
    expect(await r.retry('retry')).toMatchObject({
      assistantText: '你好 OK',
      stopReason: 'end_turn',
      sessionId: started.sessionId,
    });
  });
  it('requires confirmation before retrying after an unknown host side effect', async () => {
    const confirm = vi.fn().mockResolvedValue(false);
    const r = runtime({
      onRetryConfirmation: confirm,
      hostToolBridge: {
        taskId: 'retry-unknown',
        getTools: () => [{
          name: 'run_command',
          description: 'Run a command',
          input_schema: { type: 'object', properties: {} },
        }],
        execute: async () => {
          throw Object.assign(new Error('host transport lost'), {
            code: 'TRANSPORT_ERROR',
          });
        },
      },
    });
    const result = await r.prompt('host-tool');
    expect(result.stopReason).toBe('end_turn');
    expect(r.checkpoint()?.toolProgress?.unknownToolCallIds).toHaveLength(1);
    await expect(r.retry('retry')).rejects.toMatchObject({
      code: 'RETRY_CONFIRMATION_REQUIRED',
    });
    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        unknownToolCallIds: expect.any(Array),
        sessionId: 'fixture-session',
      }),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    confirm.mockResolvedValue(true);
    expect(await r.retry('retry after confirmation')).toMatchObject({
      assistantText: '你好 OK',
      stopReason: 'end_turn',
    });
  });
  it('requires confirmation when resume sees an active call restored from a checkpoint', async () => {
    const confirm = vi.fn().mockResolvedValue(false);
    const r = runtime({
      checkpoint: {
        schema: 'neoworker_hermes_acp_v1',
        sessionId: 'fixture-session',
        cwd: __dirname,
        agentVersion: 'fixture',
        toolOwnership: 'hermes',
        toolProgress: {
          activeToolCallIds: ['persisted-active-call'],
          completedToolCallIds: [],
          failedToolCallIds: [],
          unknownToolCallIds: [],
          lastToolCallId: 'persisted-active-call',
        },
      },
      onRetryConfirmation: confirm,
    });
    await r.pause();
    await expect(r.resume('continue after restart')).rejects.toMatchObject({
      code: 'RETRY_CONFIRMATION_REQUIRED',
    });
    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        unknownToolCallIds: ['persisted-active-call'],
        sessionId: 'fixture-session',
      }),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    confirm.mockResolvedValue(true);
    expect(await r.resume('continue after confirmation')).toMatchObject({
      assistantText: '你好 OK',
      stopReason: 'end_turn',
      sessionId: 'fixture-session',
    });
  });
  it('loads a saved session across process restarts without appending replayed history', async () => {
    const first=runtime(); await first.connect();
    const checkpoint=first.getCheckpoint(); await first.close();
    const second=runtime({checkpoint});
    expect(await second.prompt('hello')).toMatchObject({assistantText:'你好 OK',sessionId:checkpoint?.sessionId});
  });
  it('prevents overlapping prompts and supports cancel followed by another turn', async () => {
    const r=runtime(); await r.connect();
    const waiting=r.prompt('wait');
    await expect(r.prompt('second')).rejects.toMatchObject({code:'SESSION_BUSY'});
    // Let the prompt request leave the async connect boundary before cancellation.
    await new Promise(resolve=>setTimeout(resolve,20));
    await r.cancel();
    expect(await waiting).toMatchObject({stopReason:'cancelled'});
    expect(await r.prompt('next')).toMatchObject({assistantText:'你好 OK',stopReason:'end_turn'});
  });
  it('pauses without discarding the checkpoint and resumes the session', async () => {
    const r = runtime();
    const pending = r.prompt('wait');
    await new Promise(resolve => setTimeout(resolve, 20));
    await r.pause();
    expect(r.isPaused()).toBe(true);
    expect(await pending).toMatchObject({stopReason:'cancelled'});
    const resumed = await r.resume('continue');
    expect(resumed).toMatchObject({assistantText:'你好 OK',stopReason:'end_turn'});
    expect(resumed.sessionId).toBe(r.getCheckpoint()?.sessionId);
  });
  it('does not create a new conversation on a mismatched checkpoint', async () => {
    const r=runtime({checkpoint:{schema:'neoworker_hermes_acp_v1',sessionId:'old',cwd:'/different',agentVersion:'fixture'}});
    await expect(r.connect()).rejects.toThrow('does not match');
  });
});
