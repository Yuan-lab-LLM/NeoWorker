import { describe, expect, it, vi } from "vitest";
import { TaskExecutor } from "../executor";

function fixture() {
  const instance = Object.create(TaskExecutor.prototype) as Any;
  const order: string[] = [];
  Object.assign(instance, {
    task: { id: "ppt-routing", title: "优化这个 PPT", agentConfig: { executionMode: "execute" } },
    stepStopReasons: new Map(), taskFailureDomains: new Set(),
    getSessionRuntime: () => ({ resetVerificationState: vi.fn() }),
    ensureVerificationOutcomeSets: vi.fn(),
    getBudgetConstrainedFailureStepIdSet: () => new Set(),
    daemon: {}, toolRegistry: { cleanup: vi.fn(async () => {}) },
    getContractPrompt: () => "优化这个 PPT",
    emitEvent: vi.fn(), buildIntegrationMentionEventPayload: () => ({}),
    explicitChatRequestNeedsExecute: () => false,
    hasImageAttachments: () => false,
    shouldHandleInitialPromptAsCompanion: () => false,
    isAcpxExternalRuntimeTask: () => true,
    getAcpxExternalRuntimeConfig: () => ({ agent: "hermes" }),
    ensureRuntimeCatalogsReady: vi.fn(async () => { order.push("catalog"); }),
    isExplicitChatExecutionMode: () => false,
    maybeHandleSkillSlashCommandOrInlineChain: vi.fn(async () => false),
    maybeHandleNaturalLlmWikiPrompt: vi.fn(async () => false),
    maybeAutoApplyConfiguredTaskSkill: vi.fn(async () => false),
    getSkillRoutingQuery: () => "优化这个 PPT",
    maybeAutoApplyExplicitSkillInvocation: vi.fn(async () => false),
    maybeHandleHighConfidenceSkillRouting: vi.fn(async () => { order.push("presentation-studio"); return true; }),
    executeWithHermesRuntime: vi.fn(async () => { order.push("prompt"); }),
  });
  return { instance, order };
}

describe("initial skills across execution engines", () => {
  it("does not activate skills or start a runtime if Stop arrived during catalog loading", async () => {
    const { instance } = fixture();
    instance.ensureRuntimeCatalogsReady.mockImplementation(async () => { instance.cancelled = true; });
    await instance.executeUnlocked();
    expect(instance.maybeHandleSkillSlashCommandOrInlineChain).not.toHaveBeenCalled();
    expect(instance.executeWithHermesRuntime).not.toHaveBeenCalled();
  });
  it("resolves automatic presentation skills before prompting Hermes", async () => {
    const { instance, order } = fixture();
    await instance.executeUnlocked();
    expect(order).toEqual(["catalog", "presentation-studio", "prompt"]);
    expect(instance.executeWithHermesRuntime).toHaveBeenCalledWith("优化这个 PPT");
  });
  it("does not start Hermes while skill parameters are awaiting user input", async () => {
    const { instance } = fixture();
    instance.maybeAutoApplyConfiguredTaskSkill.mockImplementation(async () => {
      instance.waitingForUserInput = true;
      return true;
    });
    await instance.executeUnlocked();
    expect(instance.executeWithHermesRuntime).not.toHaveBeenCalled();
    expect(instance.maybeHandleHighConfidenceSkillRouting).not.toHaveBeenCalled();
  });
  it("keeps explicitly configured skills ahead of automatic routing", async () => {
    const { instance } = fixture();
    instance.maybeAutoApplyConfiguredTaskSkill.mockResolvedValue(true);
    await instance.prepareInitialTaskSkills();
    expect(instance.maybeAutoApplyExplicitSkillInvocation).not.toHaveBeenCalled();
    expect(instance.maybeHandleHighConfidenceSkillRouting).not.toHaveBeenCalled();
  });
  it("does not activate tools or skills in explicit chat mode", async () => {
    const { instance } = fixture();
    instance.isExplicitChatExecutionMode = () => true;
    await instance.prepareInitialTaskSkills();
    expect(instance.maybeHandleSkillSlashCommandOrInlineChain).not.toHaveBeenCalled();
  });
  it("resolves selected parameters after a follow-up restart and before Hermes receives the prompt", async () => {
    const { instance, order } = fixture();
    instance.task.agentConfig.requestedSkillId = "writing-standard";
    instance.task.agentConfig.requestedSkillParameters = { brand: "I" };
    instance.prepareExternalRuntimeFollowUpRun = vi.fn(() => {
      order.push("restart");
      instance.task.agentConfig.requestedSkillParameters = { brand: "I" };
      return 0;
    });
    instance.updateTaskAgentConfig = (config: Any) => { instance.task.agentConfig = config; };
    instance.maybeAutoApplyConfiguredTaskSkill = vi.fn(async () => {
      expect(instance.task.agentConfig.requestedSkillParameters).toEqual({ brand: "Q", docLanguage: "英文" });
      order.push("selected-skill"); return true;
    });
    instance.sendMessageWithAcpxRuntime = vi.fn(async () => { order.push("prompt"); });
    await instance.sendMessageUnlocked("审校附件", undefined, undefined, {
      agentConfigOverride: { requestedSkillId: "writing-standard", requestedSkillParameters: { brand: "Q", docLanguage: "英文" } },
    });
    expect(order).toEqual(["restart", "catalog", "selected-skill", "prompt"]);
  });

});
