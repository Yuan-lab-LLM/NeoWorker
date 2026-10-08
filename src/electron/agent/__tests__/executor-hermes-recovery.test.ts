import { afterEach, describe, expect, it, vi } from "vitest";
import * as path from "node:path";
import { TaskExecutor } from "../executor";
import { ToolCallDeduplicator } from "../executor-helpers";
import { getDocumentTranslationToolError, resolveDocumentTranslationContract } from "../document-translation-contract";
import { DocumentTools } from "../tools/document-tools";
import { ToolRegistry } from "../tools/registry";
import { HermesAcpClient, HermesAcpError } from "../runtime/hermes-acp-client";
import { HermesRuntimeStartupError, type HermesRuntimeAdapter } from "../runtime/hermes-runtime-adapter";

const cwd = __dirname;
const fixture = path.join(
  cwd,
  "../runtime/__tests__/fixtures/hermes-acp-fixture.cjs",
);
const adapters: HermesRuntimeAdapter[] = [];
const executorsToCleanup: Any[] = [];
afterEach(async () => {
  await Promise.all(
    executorsToCleanup
      .splice(0)
      .map((instance) =>
        TaskExecutor.prototype.closeExternalRuntime.call(
          instance,
          "test_cleanup",
        ),
      ),
  );
  await Promise.all(adapters.splice(0).map((adapter) => adapter.close()));
  vi.restoreAllMocks();
});

function executor(events: Array<{ payload: unknown }>) {
  const instance = Object.create(TaskExecutor.prototype) as Any;
  instance.task = { id: "recover-hermes" };
  instance.workspace = { path: cwd };
  instance.emitEvent = vi.fn();
  instance.enforceToolBudget = vi.fn();
  instance.totalToolCallCount = 0;
  instance.toolUsageCounts = new Map();
  instance.successfulToolUsageCounts = new Map();
  instance.toolResultMemory = [];
  instance.webEvidenceMemory = [];
  instance.taskHadAnyToolSuccess = false;
  instance.daemon = {
    getTaskEvents: vi.fn(() => events.slice(-1)),
    logEvent: vi.fn((_task, type, payload) => {
      if (type === "hermes_runtime_checkpoint") events.push({ payload });
    }),
    createHermesPermissionHandler: () => async () => null,
  };
  executorsToCleanup.push(instance);
  return instance as TaskExecutor;
}

function fixtureTransport() {
  const start = HermesAcpClient.prototype.start;
  vi.spyOn(HermesAcpClient.prototype, "start").mockImplementation(
    function (options) {
      return start.call(this, {
        ...options,
        command: process.execPath,
        args: [fixture],
      });
    },
  );
}

function adapter(instance: TaskExecutor) {
  const result = instance.createHermesRuntimeAdapter();
  adapters.push(result);
  return result;
}

describe("Executor Hermes recovery", () => {
  it("restarts a failed host-owned initialization without requiring a session checkpoint", async () => {
    const instance = executor([]) as Any;
    instance.waitForHermesRetryDelay = vi.fn(async () => {});
    const error = new HermesRuntimeStartupError(
      new HermesAcpError("initialize timed out", "FIRST_BYTE_TIMEOUT"), "initialize", "neoworker",
    );
    const result = { assistantText: "done", stopReason: "end_turn", sessionId: "new-session" };
    const runtime = {
      getCheckpoint: () => undefined,
      prompt: vi.fn().mockRejectedValueOnce(error).mockResolvedValueOnce(result),
      retry: vi.fn(),
    };
    await expect(instance.runHermesPromptWithTransientRetry(runtime, "北京天气", false)).resolves.toEqual(result);
    expect(runtime.prompt).toHaveBeenCalledTimes(2);
    expect(runtime.retry).not.toHaveBeenCalled();
    expect(instance.emitEvent).toHaveBeenCalledWith("log", expect.objectContaining({ startupStage: "initialize", safeForAutomaticRetry: true }));
  });

  it("bounds startup retries and preserves the startup cause instead of generating a recovery summary", async () => {
    const instance = executor([]) as Any;
    instance.waitForHermesRetryDelay = vi.fn(async () => {});
    instance.taskRequiresSimplifiedChineseOutput = () => true;
    instance.buildTimeoutRecoveryAnswer = vi.fn();
    instance.finalizeTaskBestEffort = vi.fn();
    const error = new HermesRuntimeStartupError(
      new HermesAcpError("initialize timed out", "FIRST_BYTE_TIMEOUT"), "initialize", "neoworker",
    );
    const runtime = { getCheckpoint: () => undefined, prompt: vi.fn().mockRejectedValue(error), retry: vi.fn() };
    await expect(instance.runHermesPromptWithTransientRetry(runtime, "北京天气，输出PDF", false)).rejects.toBe(error);
    expect(runtime.prompt).toHaveBeenCalledTimes(2);
    expect(runtime.retry).not.toHaveBeenCalled();
    expect(await instance.finalizeWithTimeoutRecovery(error)).toBe(false);
    expect(instance.shouldFinalizeAsPartialSuccess(error)).toBe(false);
    expect(instance.buildTimeoutRecoveryAnswer).not.toHaveBeenCalled();
    expect(instance.finalizeTaskBestEffort).not.toHaveBeenCalled();
    expect(instance.classifyFailure(error)).toBe("dependency_unavailable");
    expect(instance.isTransientProviderError(error)).toBe(false);
    expect(instance.buildTaskFailureMessage(error, "dependency_unavailable")).toContain("执行引擎未能启动");
    expect(instance.buildFollowUpFailureMessage(error)).toContain("执行引擎未能启动");
    instance.taskRequiresSimplifiedChineseOutput = () => false;
    expect(instance.buildTaskFailureMessage(error, "dependency_unavailable")).toContain("execution engine could not start");
  });

  it.each([
    new HermesAcpError("prompt timed out", "FIRST_BYTE_TIMEOUT"),
    new HermesRuntimeStartupError(new HermesAcpError("initialize timed out", "FIRST_BYTE_TIMEOUT"), "initialize", "hermes"),
    new HermesRuntimeStartupError(new HermesAcpError("missing executable", "HERMES_UNAVAILABLE"), "spawn", "neoworker"),
    new HermesRuntimeStartupError(new HermesAcpError("cancelled", "CANCELLED"), "initialize", "neoworker"),
  ])("does not start a fresh session for an unsafe or permanent failure ($code)", async error => {
    const instance = executor([]) as Any;
    const runtime = { getCheckpoint: () => undefined, prompt: vi.fn().mockRejectedValue(error), retry: vi.fn() };
    await expect(instance.runHermesPromptWithTransientRetry(runtime, "task", false)).rejects.toBe(error);
    expect(runtime.prompt).toHaveBeenCalledOnce();
    expect(runtime.retry).not.toHaveBeenCalled();
  });

  it("turns reasoning chunks into throttled activity signals without exposing their content", () => {
    const instance = executor([]) as Any;
    const runtime = adapter(instance) as Any;
    const now = vi.spyOn(Date, "now").mockReturnValue(100_000);
    const update = { sessionUpdate: "agent_thought_chunk", content: { type: "text", text: "private reasoning" } };
    for (let index = 0; index < 50; index++) runtime.options.onUpdate(update);
    expect(instance.emitEvent).toHaveBeenCalledTimes(1);
    expect(instance.emitEvent).toHaveBeenCalledWith("progress_update", {
      phase: "model_response", state: "active", heartbeat: true, message: "The model is responding...",
    });
    now.mockReturnValue(115_000);
    runtime.options.onUpdate(update);
    expect(instance.emitEvent).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(instance.emitEvent.mock.calls)).not.toContain("private reasoning");
    expect(instance.daemon.logEvent).not.toHaveBeenCalled();
  });

  it("applies a dynamically invoked Skill and returns its hidden guidance to Hermes", () => {
    const instance = executor([]) as Any;
    const application = {
      skillId: "documents",
      skillName: "Documents",
      trigger: "model",
      args: "report.docx",
      parameters: { output: "docx" },
      content: "Use the document workflow and verify the final file.",
      reason: "Applied as additive skill context.",
      appliedAt: Date.now(),
      contextDirectives: {
        allowedTools: ["read_file", "write_file"],
        artifactDirectories: ["/tmp/artifacts"],
      },
    };
    instance.toolRegistry = {
      takeResolvedSkillInvocation: vi.fn(() => application),
    };
    instance.appliedSkills = [];

    const enriched = (
      TaskExecutor.prototype as Any
    ).enrichHermesSkillToolResult.call(
      instance,
      "Skill",
      { skill: "documents", args: "report.docx" },
      {
        success: true,
        skill: "documents",
        skill_name: "Documents",
        skill_invocation_id: "skill-recover-hermes-1",
      },
    );

    expect(enriched).toMatchObject({
      success: true,
      neoworker_skill_applied: true,
      neoworker_skill_directives: application.contextDirectives,
    });
    expect(enriched.neoworker_skill_context).toContain(
      "Use the document workflow and verify the final file.",
    );
    expect(instance.appliedSkills).toHaveLength(1);
    expect(instance.appliedSkills[0]).toMatchObject({
      skillId: "documents",
      skillName: "Documents",
      content: application.content,
    });
  });

  it("routes a new Hermes session's MCP tool call through the executor Tool Host", async () => {
    fixtureTransport();
    const instance = executor([]) as Any;
    instance.getAvailableTools = () => [
      {
        name: "run_command",
        description: "Run a command",
        input_schema: {
          type: "object",
          properties: { command: { type: "string" } },
        },
      },
    ];
    instance.getToolTimeoutMs = () => 1000;
    instance.executeToolWithHeartbeat = vi.fn(
      async (_name, _input, _timeout, toolCallId) => ({
        toolHostResponse: {
          schemaVersion: "neoworker_tool_host_v1",
          requestId: "host-response",
          toolCallId,
          status: "success",
          result: { stdout: "host\n", exitCode: 0 },
        },
      }),
    );
    const runtime = adapter(instance);
    const result = await runtime.prompt("host-tool");
    expect(instance.executeToolWithHeartbeat).toHaveBeenCalledWith(
      "run_command",
      { command: "echo host" },
      1000,
      expect.stringContaining("hermes-mcp:"),
      expect.any(AbortSignal),
      expect.objectContaining({
        schema: "neoworker_hermes_acp_v1",
        sessionId: "fixture-session",
      }),
    );
    expect(JSON.parse(result.assistantText)).toMatchObject({
      result: {
        isError: false,
        content: [{ text: '{"stdout":"host\\n","exitCode":0}' }],
      },
    });
    expect(runtime.getCheckpoint()?.toolOwnership).toBe("neoworker");
    const dispatchCheckpoint =
      instance.executeToolWithHeartbeat.mock.calls[0]?.[5];
    expect(dispatchCheckpoint).toMatchObject({
      schema: "neoworker_hermes_acp_v1",
      sessionId: "fixture-session",
      toolProgress: {
        activeToolCallIds: [expect.stringContaining("hermes-mcp:")],
      },
    });
    expect(runtime.getCheckpoint()?.toolProgress?.completedToolCallIds).toEqual(
      [expect.stringContaining("hermes-mcp:")],
    );
    expect(instance.enforceToolBudget).toHaveBeenCalledWith("run_command");
    expect(instance.emitEvent).toHaveBeenCalledWith(
      "tool_result",
      expect.objectContaining({ tool: "run_command", runtime: "hermes" }),
    );
    expect(instance.emitEvent).toHaveBeenCalledWith(
      "llm_streaming",
      expect.objectContaining({ runtime: "hermes", streaming: true }),
    );
    expect(
      instance.daemon.logEvent.mock.calls.some(
        ([, type, payload]: [string, string, Any]) =>
          type === "hermes_runtime_update" &&
          payload?.sessionUpdate === "agent_message_chunk",
      ),
    ).toBe(false);
    expect(
      instance.daemon.logEvent.mock.calls.some(
        ([, type]) => type === "hermes_runtime_transport",
      ),
    ).toBe(true);
  });

  it("returns a recoverable source failure to Hermes as an advisory result", async () => {
    fixtureTransport();
    const instance = executor([]) as Any;
    instance.getAvailableTools = () => [
      {
        name: "run_command",
        description: "Run a command",
        input_schema: {
          type: "object",
          properties: { command: { type: "string" } },
        },
      },
    ];
    instance.getToolTimeoutMs = () => 1000;
    instance.executeToolWithHeartbeat = vi.fn(
      async (_name, _input, _timeout, toolCallId) => ({
        toolHostResponse: {
          schemaVersion: "neoworker_tool_host_v1",
          requestId: "host-advisory-response",
          toolCallId,
          status: "error",
          result: {
            success: false,
            error: "HTTP 432",
            nonBlocking: true,
            recoverableFallback: true,
            failureKind: "source_unavailable",
            immediateReminder: "Use a search result from a different hostname.",
          },
          error: "HTTP 432",
        },
      }),
    );

    const runtime = adapter(instance);
    const result = await runtime.prompt("host-tool");
    const parsed = JSON.parse(result.assistantText);
    const payload = JSON.parse(parsed.result.content[0].text);

    expect(parsed.result.isError).toBe(false);
    expect(payload).toMatchObject({
      success: false,
      nonBlocking: true,
      recoverableFallback: true,
      failureKind: "source_unavailable",
    });
    expect(instance.emitEvent).toHaveBeenCalledWith(
      "tool_warning",
      expect.objectContaining({
        advisory: true,
        recoverableFallback: true,
        failureKind: "source_unavailable",
      }),
    );
    expect(instance.emitEvent).not.toHaveBeenCalledWith(
      "tool_error",
      expect.anything(),
    );
  });

  it.each([true, false])("preserves structured repair failures across the executor and MCP wire (retryable=%s)", async retryable => {
    fixtureTransport();
    const instance = executor([]) as Any;
    instance.getAvailableTools = () => [{ name: "run_command", description: "Fixture tool", input_schema: { type: "object" } }];
    instance.getToolTimeoutMs = () => 1000;
    const repair = { success: false, message: "译文超出原文本框，请修复 nextUnits", retryable,
      needsAttention: !retryable, translationId: "checkpoint.json", batchId: "repair-batch", remaining: 1,
      nextUnits: retryable ? [{ key: "u1", text: "原文", previousTranslation: "이전 번역" }] : [],
      textFit: { status: "needs_repair", issues: [{ slide: 11, reason: "translation_too_long" }] } };
    const envelope = { status: "error", structuredData: repair, retryable };
    instance.executeToolWithHeartbeat = vi.fn(async (_name, _input, _timeout, toolCallId) => ({
      result: repair, envelope, durationMs: 5,
      toolHostResponse: { schemaVersion: "neoworker_tool_host_v1", requestId: "repair", toolCallId, status: "error", result: repair },
    }));
    const response = JSON.parse((await adapter(instance).prompt("host-tool")).assistantText);
    expect(response.result.isError).toBe(true);
    expect(JSON.parse(response.result.content[0].text)).toEqual({ ...repair, error: repair.message });
    expect(instance.emitEvent).toHaveBeenCalledWith("tool_error", expect.objectContaining({
      error: repair.message, result: repair, envelope, durationMs: 5,
    }));
  });

  it("keeps Office creation and translation tools stable before an unrelated task switches to translation", () => {
    const instance = executor([]) as Any;
    instance.getAvailableTools = () => [
      { name: "read_file" },
      { name: "create_spreadsheet" },
    ];
    instance.toolRegistry = {
      getTools: () => [
        { name: "create_document" },
        { name: "create_spreadsheet" },
        { name: "create_presentation" },
        DocumentTools.getToolDefinitions().find((tool) => tool.name === "office_translation"),
        { name: "run_command" },
      ],
    };
    instance.applyAgentPolicyToolFilter = (tools: Any[]) => tools;
    instance.isToolRestrictedByPolicy = () => false;

    const tools = TaskExecutor.prototype.getHermesHostTools.call(instance);

    expect(tools.map((tool: Any) => tool.name)).toEqual([
      "read_file",
      "create_spreadsheet",
      "create_document",
      "create_presentation",
      "office_translation",
    ]);
    const cachedTranslationTool = tools.find((tool: Any) => tool.name === "office_translation");
    expect(cachedTranslationTool.input_schema.properties.action.enum).toEqual(["inspect", "stage", "apply"]);
    expect(cachedTranslationTool.input_schema.properties.translations).toBeDefined();
    expect(cachedTranslationTool.input_schema.required).toEqual(["action"]);
    // A warm MCP client retains this first list, even if the task initially
    // exposed only HTML/file tools and the user later just says "继续".
    instance.getAvailableTools = () => [{ name: "write_file" }];
    expect(TaskExecutor.prototype.getHermesHostTools.call(instance).map((tool: Any) => tool.name)).toContain("office_translation");
    instance.isToolRestrictedByPolicy = (name: string) => name === "office_translation";
    expect(TaskExecutor.prototype.getHermesHostTools.call(instance).map((tool: Any) => tool.name)).not.toContain("office_translation");
  });

  it.each(["create_presentation", "generate_presentation", "create_spreadsheet", "generate_spreadsheet", "create_document", "generate_document"])("directs %s to translation before format recovery, including continuation", (toolName) => {
    const instance = executor([]) as Any;
    instance.activeFollowUpCompletionContract = { requiresArtifactEvidence: true, requiredArtifactExtensions: [".pptx"] };
    let contract = resolveDocumentTranslationContract("生成首尔旅行地图 HTML");
    contract = resolveDocumentTranslationContract("翻译成韩文\n\nAttached files:\n- original.pptx (.neoworker/uploads/1/original.pptx)", contract);
    instance.toolRegistry = { getDocumentTranslationToolError: (name: string) => getDocumentTranslationToolError(contract, name) };
    for (const message of [contract.request, "继续"]) {
      contract = resolveDocumentTranslationContract(message, contract);
      const blocked = instance.applyPreToolUsePolicyHook({ toolName, input: { filename: "tmp-check", sheets: [] } });
      expect(blocked.blockedResult.error).toContain("mcp_neoworker_office_translation");
      expect(blocked.blockedResult.error).toContain('action="inspect"');
      expect(blocked.blockedResult.error).not.toContain("Use create_presentation");
      expect(blocked.blockedResult.error).not.toContain("Office output format mismatch");
    }
  });

  it("restores translation from user events when an old Hermes snapshot contains only continue", () => {
    const instance = executor([]) as Any;
    instance.task = { id: "restore-map-translation", prompt: "生成首尔旅行地图 HTML" };
    const registry = Object.assign(Object.create(ToolRegistry.prototype), {
      officeArtifactCoordinator: { clear() {} }, verifiedTranslationOutputs: new Map(),
    });
    instance.toolRegistry = registry;
    const translation = "翻译成韩文\n\nAttached files:\n- original.pptx (.neoworker/uploads/1/original.pptx)\n  Extracted content:\n  [[ATTACHMENT_EXTRACTED_CONTENT_START]]\n重新排版并换模板\n[[ATTACHMENT_EXTRACTED_CONTENT_END]]";
    const events = [
      { timestamp: 1, type: "timeline_step_updated", legacyType: "user_message", payload: { legacyType: "user_message", message: translation } },
      { timestamp: 2, type: "timeline_step_updated", legacyType: "user_message", payload: { legacyType: "user_message", message: "继续" } },
      { timestamp: 3, type: "tool_result", payload: { message: "重新设计 PPT" } },
      { timestamp: 4, type: "assistant_message", payload: { message: "创建新模板" } },
    ];
    instance.restoreDocumentTaskContextFromEvents(events);
    expect(registry.getDocumentTaskContext()).toContain("翻译成韩文");
    expect(registry.getDocumentTaskContext()).toContain(".neoworker/uploads/1/original.pptx");
    expect(registry.getDocumentTranslationToolError("create_presentation")).toContain("原模板");
    instance.restoreDocumentTaskContextFromEvents([...events, { timestamp: 5, type: "user_message", payload: { message: "帮我新建一个预算表" } }]);
    expect(registry.getDocumentTranslationGuidance()).toBe("");
  });

  it("applies the active PPTX contract at the Hermes Tool Host boundary", async () => {
    const instance = executor([]) as Any;
    instance.activeFollowUpCompletionContract = {
      requiresArtifactEvidence: true,
      requiredArtifactExtensions: [".pptx"],
    };
    instance.getAvailableTools = () => [
      { name: "generate_spreadsheet" },
      { name: "generate_presentation" },
    ];
    instance.toolRegistry = { getTools: () => instance.getAvailableTools() };
    instance.applyAgentPolicyToolFilter = (tools: Any[]) => tools;
    instance.isToolRestrictedByPolicy = () => false;
    instance.toolCallDeduplicator = {
      checkDuplicate: vi.fn(() => ({ isDuplicate: false })),
      recordCall: vi.fn(),
    };
    instance.executeToolWithHeartbeat = vi.fn();
    const runtime = adapter(instance) as Any;
    const bridge = runtime.options.hostToolBridge;

    await expect(
      bridge.execute({
        toolName: "generate_spreadsheet",
        toolCallId: "wrong-office-format",
        input: { filename: "wrong.xlsx", sheets: [] },
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow("Office output format mismatch");

    expect(instance.executeToolWithHeartbeat).not.toHaveBeenCalled();
    expect(instance.toolCallDeduplicator.recordCall).not.toHaveBeenCalled();
    expect(instance.emitEvent).toHaveBeenCalledWith(
      "tool_error",
      expect.objectContaining({
        tool: "generate_spreadsheet",
        error: expect.stringContaining("create_presentation"),
      }),
    );
  });

  it("does not extend duplicate windows or replace successful results when a call is blocked", async () => {
    let now = 1_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const instance = executor([]) as Any;
    instance.applyPreToolUsePolicyHook = () => ({});
    instance.getToolTimeoutMs = () => 1000;
    instance.recordToolUsage = vi.fn();
    instance.recordToolResult = vi.fn();
    instance.toolFailureTracker = { recordSuccess: vi.fn(), recordFailure: vi.fn() };
    instance.toolCallDeduplicator = new ToolCallDeduplicator(1, 120_000, 4);
    const result = { success: true, completed: 40 };
    instance.executeToolWithHeartbeat = vi.fn(async () => ({
      result,
      toolHostResponse: { status: "success", result },
    }));
    const bridge = (adapter(instance) as Any).options.hostToolBridge;
    const input = { action: "stage", sourcePath: "source.pptx", units: [{ id: "one", text: "translated" }] };
    const execute = (value = input) => bridge.execute({
      toolName: "office_translation", toolCallId: "stage", input: value,
      signal: new AbortController().signal,
    });
    await execute();
    now += 110_000;
    await expect(execute()).rejects.toThrow("duplicate call");
    expect(instance.toolCallDeduplicator.checkDuplicate("office_translation", input).cachedResult).toBe(JSON.stringify(result));
    expect(instance.toolFailureTracker.recordFailure).not.toHaveBeenCalled();
    await execute({ ...input, units: [{ id: "two", text: "next" }] });
    now += 11_000;
    await execute();
    expect(instance.executeToolWithHeartbeat).toHaveBeenCalledTimes(3);
  });

  it("still records failures when a dispatched tool throws", async () => {
    const instance = executor([]) as Any;
    instance.applyPreToolUsePolicyHook = () => ({});
    instance.getToolTimeoutMs = () => 1000;
    instance.toolCallDeduplicator = { checkDuplicate: vi.fn(() => ({ isDuplicate: false })), recordCall: vi.fn() };
    instance.toolFailureTracker = { recordFailure: vi.fn() };
    instance.executeToolWithHeartbeat = vi.fn(async () => { throw new Error("disk write failed"); });
    const bridge = (adapter(instance) as Any).options.hostToolBridge;
    const input = { action: "stage", sourcePath: "source.pptx", units: [] };
    await expect(bridge.execute({ toolName: "office_translation", toolCallId: "stage", input, signal: new AbortController().signal })).rejects.toThrow("disk write failed");
    expect(instance.toolCallDeduplicator.recordCall).toHaveBeenCalledExactlyOnceWith("office_translation", input, JSON.stringify({ success: false, error: "disk write failed" }));
    expect(instance.toolFailureTracker.recordFailure).toHaveBeenCalledExactlyOnceWith("office_translation", "disk write failed");
  });

  it("keeps Hermes intermediate narration out of the final assistant text", async () => {
    fixtureTransport();
    const instance = executor([]) as Any;
    instance.getAvailableTools = () => [
      {
        name: "run_command",
        description: "Run a command",
        input_schema: {
          type: "object",
          properties: { command: { type: "string" } },
        },
      },
    ];
    instance.getToolTimeoutMs = () => 1000;
    instance.executeToolWithHeartbeat = vi.fn(
      async (_name, _input, _timeout, toolCallId) => ({
        toolHostResponse: {
          schemaVersion: "neoworker_tool_host_v1",
          requestId: "host-response",
          toolCallId,
          status: "success",
          result: { stdout: "host\n", exitCode: 0 },
        },
      }),
    );

    const result = await adapter(instance).prompt("narrated-host-tool");

    expect(result.assistantText).toBe("最终答案：已完成。");
  });

  it("finalizes a successful Hermes follow-up instead of leaving the task executing", async () => {
    const checkpoint = {
      schema: "neoworker_hermes_acp_v1",
      sessionId: "session-follow-up",
      cwd,
      agentVersion: "fixture",
      toolOwnership: "neoworker",
    } as const;
    const runtime = {
      getCheckpoint: vi.fn(() => checkpoint),
      close: vi.fn(async () => undefined),
    };
    const instance = executor([]) as Any;
    instance.task = {
      id: "follow-up-hermes",
      agentConfig: { externalRuntime: { kind: "acpx", agent: "hermes" } },
    };
    instance.getAcpxExternalRuntimeConfig = () => ({
      kind: "acpx",
      agent: "hermes",
    });
    instance.createHermesRuntimeAdapter = vi.fn(() => runtime);
    instance.runHermesPromptWithTransientRetry = vi.fn(async () => ({
      assistantText: "follow-up completed",
      stopReason: "end_turn",
      sessionId: checkpoint.sessionId,
    }));
    instance.buildQuotedAssistantContextMessage = (message: string) => message;
    instance.buildIntegrationMentionEventPayload = () => ({});
    instance.enforceTaskOutputLanguageForDisplay = (text: string) => text;
    instance.daemon.updateTaskStatus = vi.fn();
    instance.emitEvent = vi.fn();
    instance.finalizeTaskBestEffort = vi.fn();

    await TaskExecutor.prototype.sendMessageWithAcpxRuntime.call(
      instance,
      "Please verify the result.",
      undefined,
      undefined,
      1234,
    );

    expect(instance.finalizeTaskBestEffort).toHaveBeenCalledWith(
      "follow-up completed",
      "hermes follow-up completed",
      { outputEvidenceStartedAt: 1234 },
    );
    expect(instance.hermesRuntimeAdapter).toBe(runtime);
    expect(runtime.close).not.toHaveBeenCalled();
  });

  it("fails a Hermes artifact follow-up that produced no requested PPTX", async () => {
    const checkpoint = {
      schema: "neoworker_hermes_acp_v1",
      sessionId: "session-missing-pptx",
      cwd,
      agentVersion: "fixture",
      toolOwnership: "neoworker",
    } as const;
    const runtime = {
      getCheckpoint: vi.fn(() => checkpoint),
      close: vi.fn(async () => undefined),
    };
    const instance = executor([]) as Any;
    instance.task = {
      id: "follow-up-missing-pptx",
      agentConfig: { externalRuntime: { kind: "acpx", agent: "hermes" } },
    };
    instance.activeFollowUpCompletionContract = {
      requiresArtifactEvidence: true,
      requiredArtifactExtensions: [".pptx"],
    };
    instance.getAcpxExternalRuntimeConfig = () => ({
      kind: "acpx",
      agent: "hermes",
    });
    instance.createHermesRuntimeAdapter = vi.fn(() => runtime);
    instance.runHermesPromptWithTransientRetry = vi.fn(async () => ({
      assistantText: "PPT 已完成。",
      stopReason: "end_turn",
      sessionId: checkpoint.sessionId,
    }));
    instance.buildQuotedAssistantContextMessage = (message: string) => message;
    instance.buildFollowUpArtifactRetryInstruction = () =>
      "Create the requested PPTX before completing.";
    instance.buildIntegrationMentionEventPayload = () => ({});
    instance.enforceTaskOutputLanguageForDisplay = (text: string) => text;
    instance.getFollowUpArtifactGuardError = () =>
      "Follow-up missing artifact evidence";
    instance.getArtifactEvidencePathsForFollowUpContract = () => [];
    instance.getMissingArtifactExtensions = () => [".pptx"];
    instance.finalizeArtifactFollowUpFailure = vi.fn();
    instance.daemon.updateTaskStatus = vi.fn();
    instance.emitEvent = vi.fn();
    instance.finalizeTaskBestEffort = vi.fn();

    await TaskExecutor.prototype.sendMessageWithAcpxRuntime.call(
      instance,
      "翻译成韩文，发我一个PPT",
      undefined,
      undefined,
      {
        outputEvidenceStartedAt: 1234,
        previousStatus: "completed",
        previousCompletedAt: 1000,
        createdFilesBefore: new Set(),
      },
    );

    expect(instance.finalizeArtifactFollowUpFailure).toHaveBeenCalledWith(
      "Follow-up missing artifact evidence",
      "completed",
      [".pptx"],
      1000,
    );
    expect(instance.finalizeTaskBestEffort).not.toHaveBeenCalled();
    expect(instance.emitEvent).not.toHaveBeenCalledWith(
      "follow_up_completed",
      expect.anything(),
    );
  });

  it("continues an initial Hermes turn when the first response is only an in-progress note", async () => {
    const checkpoint = {
      schema: "neoworker_hermes_acp_v1",
      sessionId: "session-initial-guard",
      cwd,
      agentVersion: "fixture",
      toolOwnership: "neoworker",
    } as const;
    const runtime = {
      getCheckpoint: vi.fn(() => checkpoint),
      close: vi.fn(async () => undefined),
    };
    const instance = executor([]) as Any;
    instance.task = {
      id: "initial-hermes-guard",
      rawPrompt: "帮我查询一下明天北京飞深圳的航班信息",
    };
    instance.paused = false;
    instance.cancelled = false;
    instance.taskCompleted = false;
    instance.hermesCheckpoint = undefined;
    instance.taskContextNotes = [];
    instance.getContractPrompt = () => "";
    instance.buildAppliedSkillContext = () => "";
    instance.daemon.updateTaskStatus = vi.fn();
    instance.createHermesRuntimeAdapter = vi.fn(() => runtime);
    instance.runHermesPromptWithTransientRetry = vi
      .fn()
      .mockResolvedValueOnce({
        assistantText:
          "FlightStats 默认返回了今天（9月11日）的数据。我需要查询明天（9月12日）的航班时刻表。",
        stopReason: "end_turn",
        sessionId: checkpoint.sessionId,
      })
      .mockResolvedValueOnce({
        assistantText: "明天（9月12日）北京飞深圳有 51 班，最早 07:15 起飞。",
        stopReason: "end_turn",
        sessionId: checkpoint.sessionId,
      });
    instance.enforceTaskOutputLanguageForDisplay = (text: string) => text;
    instance.finalizeTaskBestEffort = vi.fn();
    instance.emitEvent = vi.fn();

    await TaskExecutor.prototype.executeWithHermesRuntime.call(
      instance,
      "帮我查询一下明天北京飞深圳的航班信息",
    );

    expect(instance.runHermesPromptWithTransientRetry).toHaveBeenCalledTimes(2);
    expect(
      instance.runHermesPromptWithTransientRetry.mock.calls[1][1],
    ).toContain("<neoworker_completion_guard_v1>");
    expect(instance.emitEvent).toHaveBeenCalledWith(
      "progress_update",
      expect.objectContaining({
        phase: "hermes_runtime",
        state: "continuing",
      }),
    );
    expect(instance.finalizeTaskBestEffort).toHaveBeenCalledWith(
      "明天（9月12日）北京飞深圳有 51 班，最早 07:15 起飞。",
      "hermes runtime completed",
    );
    expect(instance.hermesRuntimeAdapter).toBe(runtime);
    expect(runtime.close).not.toHaveBeenCalled();
  });

  it("gives initial artifact tasks a hard contract and performs one bounded repair", async () => {
    const checkpoint = {
      schema: "neoworker_hermes_acp_v1",
      sessionId: "session-initial-pdf-repair",
      cwd,
      agentVersion: "fixture",
      toolOwnership: "neoworker",
    } as const;
    const runtime = {
      getCheckpoint: vi.fn(() => checkpoint),
      close: vi.fn(async () => undefined),
    };
    const instance = executor([]) as Any;
    instance.task = {
      id: "initial-pdf-repair",
      rawPrompt: "生成详细的分析报告，PDF文档",
    };
    instance.paused = false;
    instance.cancelled = false;
    instance.taskCompleted = false;
    instance.hermesCheckpoint = undefined;
    instance.taskContextNotes = [];
    instance.getContractPrompt = () => "生成详细的分析报告，PDF文档";
    instance.buildAppliedSkillContext = () => "";
    instance.buildCompletionContract = () => ({
      requiresArtifactEvidence: true,
      requiredArtifactExtensions: [".pdf"],
    });
    instance.getFollowUpArtifactGuardError = vi
      .fn()
      .mockReturnValueOnce("missing PDF")
      .mockReturnValueOnce(null);
    instance.daemon.updateTaskStatus = vi.fn();
    instance.createHermesRuntimeAdapter = vi.fn(() => runtime);
    instance.runHermesPromptWithTransientRetry = vi
      .fn()
      .mockResolvedValueOnce({
        assistantText: "分析已完成。",
        stopReason: "end_turn",
        sessionId: checkpoint.sessionId,
      })
      .mockResolvedValueOnce({
        assistantText: "PDF 已生成。",
        stopReason: "end_turn",
        sessionId: checkpoint.sessionId,
      });
    instance.enforceTaskOutputLanguageForDisplay = (text: string) => text;
    instance.finalizeTaskBestEffort = vi.fn();
    instance.emitEvent = vi.fn();

    await TaskExecutor.prototype.executeWithHermesRuntime.call(
      instance,
      "生成详细的分析报告，PDF文档",
    );

    expect(instance.runHermesPromptWithTransientRetry).toHaveBeenCalledTimes(2);
    expect(
      instance.runHermesPromptWithTransientRetry.mock.calls[0][1],
    ).toContain("<neoworker_deliverable_contract_v1>");
    expect(
      instance.runHermesPromptWithTransientRetry.mock.calls[1][1],
    ).toContain('create_document with format="pdf"');
    expect(instance.emitEvent).toHaveBeenCalledWith(
      "progress_update",
      expect.objectContaining({ state: "repairing_artifact" }),
    );
    expect(instance.finalizeTaskBestEffort).toHaveBeenCalledWith(
      "PDF 已生成。",
      "hermes runtime completed",
    );
  });

  it("keeps export tools available when an artifact task reaches the completion pass", () => {
    const instance = executor([]) as Any;
    instance.buildCompletionContract = () => ({ requiresArtifactEvidence: true, requiredArtifactExtensions: [".pdf"] });
    const prompt = instance.buildHermesCompletionContinuationPrompt("", "initial", "cancelled");
    expect(prompt).toContain("tool-enabled delivery pass");
    expect(prompt).not.toContain("Do not call any more tools");
    expect(instance.hasExplicitMissingDeliverable("最终的中文 PDF 文件尚未生成，只保存了测试文件。" )).toBe(true);
    expect(instance.hasExplicitMissingDeliverable("最终的中文 PDF 文件已生成。" )).toBe(false);
    expect(instance.hasExplicitMissingDeliverable("The final PDF has not been generated." )).toBe(true);
  });

  it("finishes from existing tool evidence when Hermes unexpectedly cancels without a final answer", async () => {
    const checkpoint = {
      schema: "neoworker_hermes_acp_v1",
      sessionId: "session-cancelled-guard",
      cwd,
      agentVersion: "fixture",
      toolOwnership: "neoworker",
    } as const;
    const runtime = {
      getCheckpoint: vi.fn(() => checkpoint),
      close: vi.fn(async () => undefined),
    };
    const instance = executor([]) as Any;
    instance.task = {
      id: "cancelled-hermes-guard",
      rawPrompt: "帮我查询一下明天深圳飞上海的航班信息",
    };
    instance.paused = false;
    instance.cancelled = false;
    instance.taskCompleted = false;
    instance.hermesCheckpoint = undefined;
    instance.taskContextNotes = [];
    instance.getContractPrompt = () => "";
    instance.buildAppliedSkillContext = () => "";
    instance.daemon.updateTaskStatus = vi.fn();
    instance.createHermesRuntimeAdapter = vi.fn(() => runtime);
    instance.runHermesPromptWithTransientRetry = vi
      .fn()
      .mockResolvedValueOnce({
        assistantText: "",
        stopReason: "cancelled",
        sessionId: checkpoint.sessionId,
      })
      .mockResolvedValueOnce({
        assistantText: "明天深圳飞上海有多个直飞班次，虹桥和浦东均可到达。",
        stopReason: "end_turn",
        sessionId: checkpoint.sessionId,
      });
    instance.enforceTaskOutputLanguageForDisplay = (text: string) => text;
    instance.finalizeTaskBestEffort = vi.fn();
    instance.emitEvent = vi.fn();

    await TaskExecutor.prototype.executeWithHermesRuntime.call(
      instance,
      "帮我查询一下明天深圳飞上海的航班信息",
    );

    expect(instance.runHermesPromptWithTransientRetry).toHaveBeenCalledTimes(2);
    const completionPrompt =
      instance.runHermesPromptWithTransientRetry.mock.calls[1][1];
    expect(completionPrompt).toContain("Do not call any more tools");
    expect(completionPrompt).toContain(
      "successful tool results already present",
    );
    expect(instance.finalizeTaskBestEffort).toHaveBeenCalledWith(
      "明天深圳飞上海有多个直飞班次，虹桥和浦东均可到达。",
      "hermes runtime completed",
    );
  });

  it("fails instead of reporting success when every Hermes completion pass is empty", async () => {
    const checkpoint = {
      schema: "neoworker_hermes_acp_v1",
      sessionId: "session-empty-final",
      cwd,
      agentVersion: "fixture",
      toolOwnership: "neoworker",
    } as const;
    const runtime = {
      getCheckpoint: vi.fn(() => checkpoint),
      close: vi.fn(async () => undefined),
    };
    const instance = executor([]) as Any;
    instance.task = { id: "empty-final-hermes", rawPrompt: "查一下航班" };
    instance.paused = false;
    instance.cancelled = false;
    instance.taskCompleted = false;
    instance.hermesCheckpoint = undefined;
    instance.taskContextNotes = [];
    instance.getContractPrompt = () => "";
    instance.buildAppliedSkillContext = () => "";
    instance.daemon.updateTaskStatus = vi.fn();
    instance.createHermesRuntimeAdapter = vi.fn(() => runtime);
    instance.runHermesPromptWithTransientRetry = vi.fn(async () => ({
      assistantText: "",
      stopReason: "end_turn",
      sessionId: checkpoint.sessionId,
    }));
    instance.enforceTaskOutputLanguageForDisplay = (text: string) => text;
    instance.finalizeTaskBestEffort = vi.fn();
    instance.emitEvent = vi.fn();

    await expect(
      TaskExecutor.prototype.executeWithHermesRuntime.call(
        instance,
        "查一下航班",
      ),
    ).rejects.toMatchObject({ code: "HERMES_EMPTY_FINAL_RESPONSE" });

    expect(instance.runHermesPromptWithTransientRetry).toHaveBeenCalledTimes(3);
    expect(instance.finalizeTaskBestEffort).not.toHaveBeenCalled();
  });

  it("continues a Hermes follow-up turn before allowing queued messages to drain", async () => {
    const checkpoint = {
      schema: "neoworker_hermes_acp_v1",
      sessionId: "session-follow-up-guard",
      cwd,
      agentVersion: "fixture",
      toolOwnership: "neoworker",
    } as const;
    const runtime = {
      getCheckpoint: vi.fn(() => checkpoint),
      close: vi.fn(async () => undefined),
    };
    const instance = executor([]) as Any;
    instance.task = {
      id: "follow-up-hermes-guard",
      agentConfig: { externalRuntime: { kind: "acpx", agent: "hermes" } },
    };
    instance.getAcpxExternalRuntimeConfig = () => ({
      kind: "acpx",
      agent: "hermes",
    });
    instance.createHermesRuntimeAdapter = vi.fn(() => runtime);
    instance.runHermesPromptWithTransientRetry = vi
      .fn()
      .mockResolvedValueOnce({
        assistantText: "我需要继续检查本地磁盘占用，重点看 Codex。",
        stopReason: "end_turn",
        sessionId: checkpoint.sessionId,
      })
      .mockResolvedValueOnce({
        assistantText: "Codex 相关目录合计约 12.4GB，主要占用来自构建缓存。",
        stopReason: "end_turn",
        sessionId: checkpoint.sessionId,
      });
    instance.buildQuotedAssistantContextMessage = (message: string) => message;
    instance.buildIntegrationMentionEventPayload = () => ({});
    instance.enforceTaskOutputLanguageForDisplay = (text: string) => text;
    instance.daemon.updateTaskStatus = vi.fn();
    instance.emitEvent = vi.fn();
    instance.finalizeTaskBestEffort = vi.fn();

    await TaskExecutor.prototype.sendMessageWithAcpxRuntime.call(
      instance,
      "帮我查一下本地磁盘情况，主要看一下 Codex 的占用",
    );

    expect(instance.runHermesPromptWithTransientRetry).toHaveBeenCalledTimes(2);
    expect(
      instance.runHermesPromptWithTransientRetry.mock.calls[1][1],
    ).toContain("<neoworker_completion_guard_v1>");
    expect(instance.finalizeTaskBestEffort).toHaveBeenCalledWith(
      "Codex 相关目录合计约 12.4GB，主要占用来自构建缓存。",
      "hermes follow-up completed",
    );
    expect(instance.hermesRuntimeAdapter).toBe(runtime);
    expect(runtime.close).not.toHaveBeenCalled();
  });

  it("keeps sequential file and Shell steps inside the NeoWorker Tool Host", async () => {
    fixtureTransport();
    const instance = executor([]) as Any;
    instance.getAvailableTools = () => [
      {
        name: "write_file",
        description: "Write a file",
        input_schema: {
          type: "object",
          properties: { path: { type: "string" }, content: { type: "string" } },
        },
      },
      {
        name: "run_command",
        description: "Run a command",
        input_schema: {
          type: "object",
          properties: { command: { type: "string" } },
        },
      },
    ];
    instance.getToolTimeoutMs = () => 1000;
    instance.executeToolWithHeartbeat = vi.fn(
      async (name, input, _timeout, toolCallId) => ({
        toolHostResponse: {
          schemaVersion: "neoworker_tool_host_v1",
          requestId: `response-${name}`,
          toolCallId,
          status: "success",
          result:
            name === "write_file"
              ? { path: input.path, bytesWritten: input.content.length }
              : { stdout: "hello from Hermes", exitCode: 0 },
        },
        result:
          name === "write_file"
            ? { path: input.path, bytesWritten: input.content.length }
            : { stdout: "hello from Hermes", exitCode: 0 },
        status: "success",
        durationMs: 1,
        envelope: {},
        policyTrace: [],
      }),
    );
    const runtime = adapter(instance);
    const result = await runtime.prompt("host-multi-tool");
    expect(instance.executeToolWithHeartbeat).toHaveBeenCalledTimes(2);
    expect(
      instance.executeToolWithHeartbeat.mock.calls.map(([name]) => name),
    ).toEqual(["write_file", "run_command"]);
    expect(instance.emitEvent).toHaveBeenCalledWith(
      "tool_result",
      expect.objectContaining({ tool: "write_file", runtime: "hermes" }),
    );
    expect(instance.emitEvent).toHaveBeenCalledWith(
      "tool_result",
      expect.objectContaining({ tool: "run_command", runtime: "hermes" }),
    );
    const assistant = JSON.parse(result.assistantText);
    expect(assistant.write.result.content[0].text).toContain("bytesWritten");
    expect(assistant.shell.result.content[0].text).toContain(
      "hello from Hermes",
    );
    expect(runtime.getCheckpoint()?.toolOwnership).toBe("neoworker");
  });

  it("propagates desktop pause to the active Hermes adapter", async () => {
    const pause = vi.fn(async () => undefined);
    const events: unknown[] = [];
    const instance = executor([]) as Any;
    instance.task = { id: "pause-hermes" };
    instance.getAcpxExternalRuntimeConfig = () => ({ agent: "hermes" });
    instance.hermesRuntimeAdapter = { pause };
    instance.daemon.updateTaskStatus = vi.fn();
    instance.emitEvent = vi.fn((type: string, payload: unknown) =>
      events.push({ type, payload }),
    );
    await TaskExecutor.prototype.pause.call(instance);
    expect(instance.paused).toBe(true);
    expect(pause).toHaveBeenCalledOnce();
    expect(instance.daemon.updateTaskStatus).toHaveBeenCalledWith(
      "pause-hermes",
      "paused",
    );
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "task_paused" }),
      ]),
    );
  });

  it("resumes Hermes from the persisted checkpoint through the executor lifecycle", async () => {
    const events: unknown[] = [];
    const runtime = {
      prompt: vi.fn(async () => ({
        assistantText: "continued",
        stopReason: "end_turn",
        sessionId: "session-1",
      })),
      getCheckpoint: vi.fn(() => ({
        schema: "neoworker_hermes_acp_v1",
        sessionId: "session-1",
        cwd,
        agentVersion: "fixture",
      })),
      close: vi.fn(),
    };
    const instance = executor([]) as Any;
    instance.task = { id: "resume-hermes" };
    instance.paused = true;
    instance.waitingForUserInput = false;
    instance.cancelled = false;
    instance.taskCompleted = false;
    instance.hermesCheckpoint = runtime.getCheckpoint();
    instance.getAcpxExternalRuntimeConfig = () => ({ agent: "hermes" });
    instance.daemon.updateTaskStatus = vi.fn();
    instance.createHermesRuntimeAdapter = vi.fn(() => runtime);
    instance.getLifecycleMutex = () => ({
      runExclusive: (fn: () => Promise<void>) => fn(),
    });
    instance.emitEvent = vi.fn((type: string, payload: unknown) =>
      events.push({ type, payload }),
    );
    instance.enforceTaskOutputLanguageForDisplay = (text: string) => text;
    instance.finalizeTaskBestEffort = vi.fn();
    await TaskExecutor.prototype.resume.call(instance);
    expect(runtime.prompt).toHaveBeenCalledWith(
      expect.stringContaining("last checkpoint"),
    );
    expect(instance.finalizeTaskBestEffort).toHaveBeenCalledWith(
      "continued",
      "hermes runtime resumed",
    );
    expect(instance.hermesRuntimeAdapter).toBe(runtime);
    expect(runtime.close).not.toHaveBeenCalled();
  });

  it("applies the bounded provider retry when Hermes resume fails before host progress", async () => {
    const events: Array<{ type: string; payload?: Any }> = [];
    const checkpoint = {
      schema: "neoworker_hermes_acp_v1",
      sessionId: "session-resume-transient",
      cwd,
      agentVersion: "fixture",
      toolOwnership: "neoworker",
    } as const;
    const failure = new HermesAcpError(
      "HTTP 502: The request queue is full",
      "HERMES_RUNTIME_ERROR",
    );
    const runtime = {
      prompt: vi.fn(async () => {
        throw failure;
      }),
      retry: vi.fn(async () => ({
        assistantText: "resumed after provider retry",
        stopReason: "end_turn",
        sessionId: checkpoint.sessionId,
      })),
      getCheckpoint: vi.fn(() => checkpoint),
      getToolProgressRevision: vi.fn(() => 0),
      close: vi.fn(async () => undefined),
    };
    const instance = executor([]) as Any;
    instance.task = { id: "resume-transient-hermes" };
    instance.paused = true;
    instance.waitingForUserInput = false;
    instance.cancelled = false;
    instance.taskCompleted = false;
    instance.hermesCheckpoint = checkpoint;
    instance.getAcpxExternalRuntimeConfig = () => ({ agent: "hermes" });
    instance.daemon.updateTaskStatus = vi.fn();
    instance.createHermesRuntimeAdapter = vi.fn(() => runtime);
    instance.getLifecycleMutex = () => ({
      runExclusive: (fn: () => Promise<void>) => fn(),
    });
    instance.emitEvent = vi.fn((type: string, payload?: Any) => {
      events.push({ type, payload });
    });
    instance.enforceTaskOutputLanguageForDisplay = (text: string) => text;
    instance.finalizeTaskBestEffort = vi.fn();

    await TaskExecutor.prototype.resume.call(instance);

    expect(runtime.prompt).toHaveBeenCalledOnce();
    expect(runtime.retry).toHaveBeenCalledOnce();
    expect(instance.finalizeTaskBestEffort).toHaveBeenCalledWith(
      "resumed after provider retry",
      "hermes runtime resumed",
    );
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "log",
          payload: expect.objectContaining({
            metric: "hermes_runtime_retry",
            safeBeforeToolDispatch: true,
            safeForAutomaticRetry: true,
          }),
        }),
      ]),
    );
    expect(instance.hermesRuntimeAdapter).toBe(runtime);
    expect(runtime.close).not.toHaveBeenCalled();
  });

  it("uses a guarded retry prompt when initial execution finds a persisted checkpoint", async () => {
    const checkpoint = {
      schema: "neoworker_hermes_acp_v1",
      sessionId: "session-recover",
      cwd,
      agentVersion: "fixture",
      toolOwnership: "neoworker",
      toolProgress: {
        activeToolCallIds: ["active-1"],
        completedToolCallIds: [],
        failedToolCallIds: [],
        unknownToolCallIds: [],
      },
    } as const;
    const runtime = {
      getCheckpoint: vi.fn(() => checkpoint),
      retry: vi.fn(async (prompt: string) => ({
        assistantText: "recovered",
        stopReason: "end_turn",
        sessionId: checkpoint.sessionId,
        prompt,
      })),
      prompt: vi.fn(),
      close: vi.fn(async () => undefined),
    };
    const instance = executor([]) as Any;
    instance.task = { id: "initial-recovery", rawPrompt: "Build the project." };
    instance.hermesCheckpoint = checkpoint;
    instance.paused = false;
    instance.taskContextNotes = ["Persisted task context"];
    instance.appliedSkills = [];
    instance.daemon.updateTaskStatus = vi.fn();
    instance.createHermesRuntimeAdapter = vi.fn(() => runtime);
    instance.enforceTaskOutputLanguageForDisplay = (text: string) => text;
    instance.finalizeTaskBestEffort = vi.fn();

    await TaskExecutor.prototype.executeWithHermesRuntime.call(
      instance,
      "Build the project.",
    );

    expect(runtime.retry).toHaveBeenCalledWith(
      expect.stringContaining("<neoworker_recovery_v1>"),
    );
    expect(runtime.retry.mock.calls[0][0]).toContain(
      "Do not automatically repeat a tool call whose side effect result is unknown",
    );
    expect(runtime.prompt).not.toHaveBeenCalled();
    expect(instance.finalizeTaskBestEffort).toHaveBeenCalledWith(
      "recovered",
      "hermes runtime completed",
    );
    expect(instance.hermesRuntimeAdapter).toBe(runtime);
    expect(runtime.close).not.toHaveBeenCalled();
  });

  it("reuses a warm Hermes runtime for a follow-up in the same workspace", () => {
    const checkpoint = {
      schema: "neoworker_hermes_acp_v1",
      sessionId: "warm-session",
      cwd,
      agentVersion: "fixture",
      toolOwnership: "neoworker",
    } as const;
    const instance = executor([]) as Any;
    instance.hermesCheckpoint = checkpoint;
    const runtime = instance.createHermesRuntimeAdapter(checkpoint);
    vi.spyOn(runtime, "close");
    instance.hermesRuntimeAdapter = runtime;
    instance.hermesRuntimeWorkspacePath = cwd;

    const reused = TaskExecutor.prototype.createHermesRuntimeAdapter.call(
      instance,
      checkpoint,
    );

    expect(reused).toBe(runtime);
    expect(instance.emitEvent).toHaveBeenCalledWith(
      "log",
      expect.objectContaining({
        metric: "hermes_runtime_session_reused",
        sessionId: "warm-session",
      }),
    );
    expect(runtime.close).not.toHaveBeenCalled();
  });

  it("reads only the latest task event when building Hermes checkpoints", () => {
    const instance = executor([]) as Any;
    const runtime = adapter(instance);
    const getTaskEvents = instance.daemon.getTaskEvents as Any;
    getTaskEvents.mockReturnValue([{ seq: 42 }]);

    expect((runtime as Any).options.getLogSequence()).toBe(42);
    expect(getTaskEvents).toHaveBeenCalledWith("recover-hermes", { limit: 1 });
    expect(
      getTaskEvents.mock.calls.some(
        ([taskId, options]: [string, Any]) =>
          taskId === "recover-hermes" && options === undefined,
      ),
    ).toBe(false);
  });

  it.each([undefined, { retryable: false, reason: "provider_error" }])("retries a transient Hermes provider failure with metadata %j", async (metadata) => {
    const events: Array<{ type: string; payload?: Any }> = [];
    const checkpoint = {
      schema: "neoworker_hermes_acp_v1",
      sessionId: "session-transient",
      cwd,
      agentVersion: "fixture",
      toolOwnership: "neoworker",
    } as const;
    let savedCheckpoint: Any;
    const runtime = {
      getCheckpoint: vi.fn(() => savedCheckpoint),
      getToolProgressRevision: vi.fn(() => 0),
      prompt: vi.fn(async () => {
        savedCheckpoint = checkpoint;
        throw new HermesAcpError(
          "HTTP 502: The request queue is full",
          "HERMES_RUNTIME_ERROR",
          metadata,
        );
      }),
      retry: vi.fn(async () => ({
        assistantText: "recovered after provider retry",
        stopReason: "end_turn",
        sessionId: checkpoint.sessionId,
      })),
      close: vi.fn(async () => undefined),
    };
    const instance = executor([]) as Any;
    instance.task = {
      id: "transient-hermes",
      rawPrompt: "Run a transient test.",
    };
    instance.paused = false;
    instance.cancelled = false;
    instance.taskCompleted = false;
    instance.hermesCheckpoint = undefined;
    instance.taskContextNotes = [];
    instance.daemon.updateTaskStatus = vi.fn();
    instance.getContractPrompt = () => "";
    instance.buildAppliedSkillContext = () => "";
    instance.createHermesRuntimeAdapter = vi.fn(() => runtime);
    instance.enforceTaskOutputLanguageForDisplay = (text: string) => text;
    instance.finalizeTaskBestEffort = vi.fn();
    instance.emitEvent = vi.fn((type: string, payload?: Any) => {
      events.push({ type, payload });
    });

    await TaskExecutor.prototype.executeWithHermesRuntime.call(
      instance,
      "transient-provider-error",
    );

    expect(runtime.prompt).toHaveBeenCalledOnce();
    expect(runtime.retry).toHaveBeenCalledOnce();
    expect(instance.finalizeTaskBestEffort).toHaveBeenCalledWith(
      "recovered after provider retry",
      "hermes runtime completed",
    );
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "log",
          payload: expect.objectContaining({
            metric: "hermes_runtime_retry",
            safeBeforeToolDispatch: true,
            safeForAutomaticRetry: true,
          }),
        }),
      ]),
    );
  });

  it("bounds repeated queue-full failures and reports the provider cause", async () => {
    const instance = executor([]) as Any;
    instance.taskRequiresSimplifiedChineseOutput = () => true;
    instance.waitForHermesRetryDelay = vi.fn(async () => {});
    const error = new HermesAcpError("HTTP 502: The request queue is full.", "HERMES_RUNTIME_ERROR", { retryable: false });
    const runtime = {
      getCheckpoint: () => ({ toolOwnership: "neoworker" }),
      prompt: vi.fn().mockRejectedValue(error),
      retry: vi.fn().mockRejectedValue(error),
    };
    await expect(instance.runHermesPromptWithTransientRetry(runtime, "告诉我北京天气", false)).rejects.toBe(error);
    expect(runtime.prompt).toHaveBeenCalledOnce();
    expect(runtime.retry).toHaveBeenCalledTimes(2);
    expect(instance.waitForHermesRetryDelay.mock.calls.map(([delay]: [number]) => delay)).toEqual([2000, 4000]);
    expect(instance.classifyFailure(error)).toBe("dependency_unavailable");
    expect(instance.buildTaskFailureMessage(error, "dependency_unavailable")).toContain("模型服务当前繁忙");
    expect(instance.buildFollowUpFailureMessage(error)).toContain("模型服务当前繁忙");
  });

  it.each([
    ["HTTP 401: Invalid API key", "HERMES_RUNTIME_ERROR"],
    ["HTTP 402: Insufficient Balance", "HERMES_RUNTIME_ERROR"],
    ["HTTP 502: The request queue is full", "CANCELLED"],
    ["HTTP 502: The request queue is full", "RETRY_CONFIRMATION_REQUIRED"],
    ["connection closed", "HERMES_RUNTIME_ERROR"],
  ])("does not retry explicit non-retryable %s (%s)", async (message, code) => {
    const instance = executor([]) as Any;
    const error = new HermesAcpError(message, code, { retryable: false });
    const runtime = {
      getCheckpoint: () => ({ toolOwnership: "neoworker" }),
      prompt: vi.fn().mockRejectedValue(error),
      retry: vi.fn(),
    };
    await expect(instance.runHermesPromptWithTransientRetry(runtime, "test", false)).rejects.toBe(error);
    expect(runtime.retry).not.toHaveBeenCalled();
  });

  it("does not send the retry request when cancellation arrives during backoff", async () => {
    vi.useFakeTimers();
    try {
      const checkpoint = {
        schema: "neoworker_hermes_acp_v1",
        sessionId: "session-cancel-backoff",
        cwd,
        agentVersion: "fixture",
        toolOwnership: "neoworker",
      } as const;
      const failure = new HermesAcpError(
        "HTTP 502: The request queue is full",
        "HERMES_RUNTIME_ERROR",
      );
      let rejectPrompt!: (error: unknown) => void;
      let checkpointAvailable = false;
      const runtime = {
        getCheckpoint: vi.fn(() =>
          checkpointAvailable ? checkpoint : undefined,
        ),
        getToolProgressRevision: vi.fn(() => 0),
        prompt: vi.fn(() => {
          checkpointAvailable = true;
          return new Promise<never>((_resolve, reject) => {
            rejectPrompt = reject;
          });
        }),
        retry: vi.fn(),
        close: vi.fn(async () => undefined),
      };
      const instance = executor([]) as Any;
      instance.task = {
        id: "cancel-backoff-hermes",
        rawPrompt: "Cancel the retry.",
      };
      instance.paused = false;
      instance.cancelled = false;
      instance.taskCompleted = false;
      instance.hermesCheckpoint = undefined;
      instance.taskContextNotes = [];
      instance.daemon.updateTaskStatus = vi.fn();
      instance.getContractPrompt = () => "";
      instance.buildAppliedSkillContext = () => "";
      instance.createHermesRuntimeAdapter = vi.fn(() => runtime);
      instance.enforceTaskOutputLanguageForDisplay = (text: string) => text;
      instance.finalizeTaskBestEffort = vi.fn();
      instance.abortController = new AbortController();

      const pending = TaskExecutor.prototype.executeWithHermesRuntime.call(
        instance,
        "cancel-retry",
      );
      const pendingAssertion = expect(pending).rejects.toBe(failure);
      rejectPrompt(failure);
      await Promise.resolve();
      await Promise.resolve();
      instance.cancelled = true;
      instance.abortController.abort();
      await vi.advanceTimersByTimeAsync(500);

      await pendingAssertion;
      expect(runtime.retry).not.toHaveBeenCalled();
      expect(runtime.close).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not retry a transient Hermes failure after host progress changed", async () => {
    const checkpoint = {
      schema: "neoworker_hermes_acp_v1",
      sessionId: "session-side-effect",
      cwd,
      agentVersion: "fixture",
      toolOwnership: "neoworker",
      toolProgress: {
        activeToolCallIds: ["host-call-in-flight"],
        completedToolCallIds: [],
        failedToolCallIds: [],
        unknownToolCallIds: [],
      },
    } as const;
    let savedCheckpoint: Any;
    let revision = 0;
    const failure = new HermesAcpError(
      "HTTP 502: The request queue is full",
      "HERMES_RUNTIME_ERROR",
    );
    const runtime = {
      getCheckpoint: vi.fn(() => savedCheckpoint),
      getToolProgressRevision: vi.fn(() => revision),
      prompt: vi.fn(async () => {
        savedCheckpoint = checkpoint;
        revision = 1;
        throw failure;
      }),
      retry: vi.fn(),
      close: vi.fn(async () => undefined),
    };
    const instance = executor([]) as Any;
    instance.task = {
      id: "side-effect-hermes",
      rawPrompt: "Run a side effect.",
    };
    instance.paused = false;
    instance.cancelled = false;
    instance.taskCompleted = false;
    instance.hermesCheckpoint = undefined;
    instance.taskContextNotes = [];
    instance.daemon.updateTaskStatus = vi.fn();
    instance.getContractPrompt = () => "";
    instance.buildAppliedSkillContext = () => "";
    instance.createHermesRuntimeAdapter = vi.fn(() => runtime);
    instance.enforceTaskOutputLanguageForDisplay = (text: string) => text;
    instance.finalizeTaskBestEffort = vi.fn();

    await expect(
      TaskExecutor.prototype.executeWithHermesRuntime.call(
        instance,
        "side-effect-provider-error",
      ),
    ).rejects.toBe(failure);

    expect(runtime.prompt).toHaveBeenCalledOnce();
    expect(runtime.retry).not.toHaveBeenCalled();
    expect(runtime.close).toHaveBeenCalledOnce();
  });

  it("retries after completed host tools when Hermes queue capacity recovers", async () => {
    const checkpoint = {
      schema: "neoworker_hermes_acp_v1",
      sessionId: "session-completed-tool",
      cwd,
      agentVersion: "fixture",
      toolOwnership: "neoworker",
      toolProgress: {
        activeToolCallIds: [],
        completedToolCallIds: ["hermes-mcp:web-search-1"],
        failedToolCallIds: [],
        unknownToolCallIds: [],
        lastToolCallId: "hermes-mcp:web-search-1",
      },
    } as const;
    let savedCheckpoint: Any;
    const failure = new HermesAcpError(
      "HTTP 502: The request queue is full",
      "HERMES_RUNTIME_ERROR",
    );
    const runtime = {
      getCheckpoint: vi.fn(() => savedCheckpoint),
      prompt: vi.fn(async () => {
        savedCheckpoint = checkpoint;
        throw failure;
      }),
      retry: vi.fn(async () => ({
        assistantText: "recovered after completed search",
        stopReason: "end_turn",
        sessionId: checkpoint.sessionId,
      })),
      close: vi.fn(async () => undefined),
    };
    const instance = executor([]) as Any;
    instance.task = {
      id: "completed-tool-hermes",
      rawPrompt: "Search and summarize.",
    };
    instance.paused = false;
    instance.cancelled = false;
    instance.taskCompleted = false;
    instance.hermesCheckpoint = undefined;
    instance.taskContextNotes = [];
    instance.daemon.updateTaskStatus = vi.fn();
    instance.getContractPrompt = () => "";
    instance.buildAppliedSkillContext = () => "";
    instance.createHermesRuntimeAdapter = vi.fn(() => runtime);
    instance.enforceTaskOutputLanguageForDisplay = (text: string) => text;
    instance.finalizeTaskBestEffort = vi.fn();

    await TaskExecutor.prototype.executeWithHermesRuntime.call(
      instance,
      "completed-tool-provider-error",
    );

    expect(runtime.prompt).toHaveBeenCalledOnce();
    expect(runtime.retry).toHaveBeenCalledOnce();
    expect(instance.finalizeTaskBestEffort).toHaveBeenCalledWith(
      "recovered after completed search",
      "hermes runtime completed",
    );
  });

  it("does not retry a Hermes provider error explicitly marked non-retryable", async () => {
    const checkpoint = {
      schema: "neoworker_hermes_acp_v1",
      sessionId: "session-non-retryable",
      cwd,
      agentVersion: "fixture",
      toolOwnership: "neoworker",
    } as const;
    let savedCheckpoint: Any;
    const failure = new HermesAcpError(
      "HTTP 402: Insufficient Balance",
      "HERMES_RUNTIME_ERROR",
      { retryable: false },
    );
    const runtime = {
      getCheckpoint: vi.fn(() => savedCheckpoint),
      getToolProgressRevision: vi.fn(() => 0),
      prompt: vi.fn(async () => {
        savedCheckpoint = checkpoint;
        throw failure;
      }),
      retry: vi.fn(),
      close: vi.fn(async () => undefined),
    };
    const instance = executor([]) as Any;
    instance.task = {
      id: "non-retryable-hermes",
      rawPrompt: "Provider quota test.",
    };
    instance.paused = false;
    instance.cancelled = false;
    instance.taskCompleted = false;
    instance.hermesCheckpoint = undefined;
    instance.taskContextNotes = [];
    instance.daemon.updateTaskStatus = vi.fn();
    instance.getContractPrompt = () => "";
    instance.buildAppliedSkillContext = () => "";
    instance.createHermesRuntimeAdapter = vi.fn(() => runtime);
    instance.enforceTaskOutputLanguageForDisplay = (text: string) => text;
    instance.finalizeTaskBestEffort = vi.fn();

    await expect(
      TaskExecutor.prototype.executeWithHermesRuntime.call(
        instance,
        "non-retryable-provider-error",
      ),
    ).rejects.toBe(failure);

    expect(runtime.prompt).toHaveBeenCalledOnce();
    expect(runtime.retry).not.toHaveBeenCalled();
  });

  it("restores a persisted session after executor recreation instead of creating a conversation", async () => {
    fixtureTransport();
    const events: Array<{ payload: unknown }> = [];
    const first = adapter(executor(events));
    await first.connect();
    const checkpoint = first.getCheckpoint();
    await first.close();
    const load = vi.spyOn(HermesAcpClient.prototype, "loadSession");
    const create = vi.spyOn(HermesAcpClient.prototype, "newSession");
    const restored = adapter(executor(events));
    expect(await restored.prompt("continue")).toMatchObject({
      sessionId: checkpoint!.sessionId,
      assistantText: "你好 OK",
    });
    expect(load).toHaveBeenCalledWith(checkpoint!.sessionId, cwd, [
      expect.objectContaining({
        type: "http",
        name: "neoworker",
        url: expect.stringMatching(/^http:\/\/127\.0\.0\.1:\d+\/mcp$/),
      }),
    ]);
    expect(checkpoint?.toolOwnership).toBe("neoworker");
    expect(create).not.toHaveBeenCalled();
  });

  it("retains the checkpoint in memory before a failed prompt returns", async () => {
    fixtureTransport();
    const instance = executor([]);
    const first = adapter(instance);
    const controller = new AbortController();
    await first.connect();
    controller.abort();
    await expect(first.prompt("wait", controller.signal)).rejects.toMatchObject(
      { code: "CANCELLED" },
    );
    // Simulate event retention not being available for this in-process retry.
    (instance as Any).daemon.getTaskEvents.mockReturnValue([]);
    expect(adapter(instance).getCheckpoint()).toEqual(first.getCheckpoint());
  });

  it.each([
    { schema: "wrong", sessionId: "old", cwd, agentVersion: "fixture" },
    {
      schema: "neoworker_hermes_acp_v1",
      sessionId: "old",
      cwd: "/other",
      agentVersion: "fixture",
    },
    {
      schema: "neoworker_hermes_acp_v1",
      sessionId: "",
      cwd,
      agentVersion: "fixture",
    },
    {
      schema: "neoworker_hermes_acp_v1",
      sessionId: "old",
      cwd,
      agentVersion: "fixture",
      toolOwnership: "invalid",
    },
  ])(
    "does not silently restart a task with an invalid persisted checkpoint",
    (payload) => {
      expect(() => adapter(executor([{ payload }]))).toThrow(
        "Cannot restore task progress",
      );
    },
  );
});
