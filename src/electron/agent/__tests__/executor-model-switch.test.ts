import { afterEach, describe, expect, it, vi } from "vitest";
import * as path from "node:path";
import { TaskExecutor } from "../executor";
import { LLMProviderFactory, type LLMSettings } from "../llm/provider-factory";
import { HermesAcpClient } from "../runtime/hermes-acp-client";

const instances: Any[] = [];
afterEach(async () => {
  await Promise.all(instances.splice(0).map((instance) => instance.closeExternalRuntime("test_cleanup")));
  vi.restoreAllMocks();
});

function setup(modelKey = "deepseek-reasoner") {
  const settings: LLMSettings = {
    providerType: "deepseek",
    modelKey: "deepseek-reasoner",
    deepseek: { apiKey: "fixture-key", model: "deepseek-reasoner" },
    openai: { apiKey: "fixture-key", model: "gpt-4.1-mini" },
  };
  vi.spyOn(LLMProviderFactory, "loadSettings").mockImplementation(() => settings);
  // Keep the real model resolver; mocking it would hide ignored overrides.
  vi.spyOn(LLMProviderFactory, "createProvider").mockImplementation((config) => ({
    type: config!.type,
    createMessage: vi.fn(async (input) => ({ content: [{ type: "text", text: input.model }] })),
  }) as Any);
  const instance = Object.create(TaskExecutor.prototype) as Any;
  instance.task = {
    id: "model-switch", title: "Model switch", status: "failed",
    agentConfig: { providerType: "deepseek", modelKey, externalRuntime: { kind: "acpx", agent: "hermes" } },
  };
  instance.workspace = { path: __dirname };
  instance.provider = { type: "deepseek" };
  instance.modelId = modelKey;
  instance.modelKey = modelKey;
  instance.llmProfileUsed = "cheap";
  instance.cachedLlmSettings = settings;
  instance.emitEvent = vi.fn();
  instance.daemon = {
    getTask: () => instance.task,
    getTaskEvents: vi.fn(() => []),
    logEvent: vi.fn(), updateTaskStatus: vi.fn(),
    createHermesPermissionHandler: () => async () => null,
  };
  instance.prepareExternalRuntimeFollowUpRun = vi.fn();
  instance.buildQuotedAssistantContextMessage = (text: string) => text;
  instance.buildIntegrationMentionEventPayload = () => ({});
  instance.enforceTaskOutputLanguageForDisplay = (text: string) => text;
  instance.finalizeTaskBestEffort = vi.fn();
  instance.finalizeRecoverableFollowUpFailure = vi.fn();
  instance.runHermesPromptToCompletion = (runtime: Any, prompt: string) => runtime.prompt(prompt);
  const start = HermesAcpClient.prototype.start;
  vi.spyOn(HermesAcpClient.prototype, "start").mockImplementation(function (options) {
    return start.call(this, {
      ...options, command: process.execPath,
      args: [path.join(__dirname, "../runtime/__tests__/fixtures/hermes-model-switch-fixture.cjs")],
    });
  });
  instances.push(instance);
  return { instance, settings };
}

describe("Model switching after a failed turn", () => {
  it.each([
    { providerType: "deepseek", modelKey: "deepseek-chat" },
    { providerType: "openai", modelKey: "gpt-4.1-mini" },
  ])("honors the explicit $providerType/$modelKey route in the native executor", (selection) => {
    const { instance } = setup();
    instance.updateTaskAgentConfig({ ...instance.task.agentConfig, ...selection });
    instance.refreshProviderIfSettingsChanged();
    instance.refreshProviderIfSettingsChanged();
    expect(instance.provider.type).toBe(selection.providerType);
    expect(instance.modelId).toBe(selection.modelKey);
  });

  it.each([
    { providerType: "deepseek", modelKey: "deepseek-chat" },
    { providerType: "openai", modelKey: "gpt-4.1-mini" },
  ])("recovers the same Hermes conversation on $providerType/$modelKey after an unavailable model", async (selection) => {
    const { instance } = setup();
    const create = vi.spyOn(HermesAcpClient.prototype, "newSession");
    const load = vi.spyOn(HermesAcpClient.prototype, "loadSession");
    await instance.sendMessage("hello");
    expect(instance.finalizeRecoverableFollowUpFailure).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Fixture model is unavailable" }), "failed", undefined,
    );
    const checkpoint = instance.hermesCheckpoint;
    await instance.sendMessage("try again", undefined, undefined, { agentConfigOverride: selection });
    expect(JSON.parse(instance.lastAssistantText)).toMatchObject({ model: selection.modelKey });
    expect(instance.hermesCheckpoint.sessionId).toBe(checkpoint.sessionId);
    expect(create).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledWith(checkpoint.sessionId, __dirname, expect.any(Array));
    expect(instance.finalizeTaskBestEffort).toHaveBeenCalledTimes(1);
    expect(instance.finalizeRecoverableFollowUpFailure).toHaveBeenCalledOnce();
  });

  it("replaces a warm transport when the model changes, then reuses the new route", async () => {
    const { instance } = setup("deepseek-chat");
    await instance.sendMessageUnlocked("hello");
    const first = instance.hermesRuntimeAdapter;
    const close = vi.spyOn(first, "close");
    const checkpoint = instance.hermesCheckpoint;
    const selection = { providerType: "openai", modelKey: "gpt-4.1-mini" };
    await instance.sendMessageUnlocked("switch", undefined, undefined, { agentConfigOverride: selection });
    const second = instance.hermesRuntimeAdapter;
    expect(second).not.toBe(first);
    expect(close).toHaveBeenCalledOnce();
    expect(JSON.parse(instance.lastAssistantText)).toMatchObject({ model: selection.modelKey });
    expect(instance.hermesCheckpoint.sessionId).toBe(checkpoint.sessionId);
    await instance.sendMessageUnlocked("continue", undefined, undefined, { agentConfigOverride: selection });
    expect(instance.hermesRuntimeAdapter).toBe(second);
  });

  it("does not silently reuse the failed route when constructing the chosen provider fails", () => {
    const { instance } = setup();
    instance.updateTaskAgentConfig({ ...instance.task.agentConfig, modelKey: "deepseek-chat" });
    vi.mocked(LLMProviderFactory.createProvider).mockImplementation(() => { throw new Error("New provider is not configured"); });
    expect(() => instance.refreshProviderIfSettingsChanged()).toThrow("New provider is not configured");
  });

  it("clears the old route's failure and cooldown before running a manual selection", async () => {
    const { instance } = setup();
    instance.lastFailedProviderRoute = { providerType: "deepseek", modelId: "deepseek-reasoner", error: "unavailable" };
    instance.providerFailoverPreserveUntil = Date.now() + 60_000;
    instance.sendMessageUnlocked = vi.fn(async () => {
      expect(instance.lastFailedProviderRoute).toBeNull();
      expect(instance.providerFailoverPreserveUntil).toBe(0);
      expect(instance.task.agentConfig.modelKey).toBe("deepseek-chat");
    });
    await instance.sendMessage("retry", undefined, undefined, { agentConfigOverride: { providerType: "deepseek", modelKey: "deepseek-chat" } });
    expect(instance.sendMessageUnlocked).toHaveBeenCalledOnce();
    expect(instance.finalizeRecoverableFollowUpFailure).not.toHaveBeenCalled();
  });

  it("lets a manual model recover a session with an old forced-profile setting", async () => {
    const { instance } = setup();
    instance.task.agentConfig.llmProfileForced = true;
    instance.task.agentConfig.llmProfile = "strong";
    await instance.sendMessage("retry", undefined, undefined, {
      agentConfigOverride: { providerType: "deepseek", modelKey: "deepseek-chat" },
    });
    expect(instance.finalizeRecoverableFollowUpFailure).not.toHaveBeenCalled();
    expect(JSON.parse(instance.lastAssistantText)).toMatchObject({ model: "deepseek-chat" });
  });

  it("keeps the active model/skill when access is changed during a running turn", () => {
    const { instance } = setup("deepseek-chat");
    instance.task.agentConfig.requestedSkillId = "current-skill";
    instance.updateTaskAccessConfig({
      providerType: "openai", modelKey: "gpt-4.1-mini", requestedSkillId: "queued-skill",
      permissionMode: "bypass_permissions", shellAccess: true,
    });
    expect(instance.task.agentConfig).toMatchObject({
      providerType: "deepseek", modelKey: "deepseek-chat", requestedSkillId: "current-skill",
      permissionMode: "bypass_permissions", shellAccess: true,
    });
  });

  it("replaces a warm Hermes transport after endpoint/credential settings change", async () => {
    const { instance, settings } = setup("deepseek-chat");
    await instance.sendMessageUnlocked("hello");
    const first = instance.hermesRuntimeAdapter;
    settings.deepseek = { ...settings.deepseek!, apiKey: "new-fixture-key", baseUrl: "http://127.0.0.1:45678/v1" };
    await instance.sendMessageUnlocked("retry");
    expect(instance.hermesRuntimeAdapter).not.toBe(first);
    expect(JSON.parse(instance.lastAssistantText)).toMatchObject({ model: "deepseek-chat", baseUrl: "http://127.0.0.1:45678/v1" });
    expect(JSON.stringify(instance.daemon.logEvent.mock.calls)).not.toContain("new-fixture-key");
  });
});
