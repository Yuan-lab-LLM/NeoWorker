import { afterEach, describe, expect, it } from "vitest";
import {
  buildReasoningExhaustedGuidance,
  classifyOutputTruncation,
  inferOutputBudgetRequestKind,
  inferOutputWorkloadProfile,
  getOutputTokenPolicyMode,
  resolveOutputTokenBudget,
  resolveOutputTokenParamName,
} from "../output-token-policy";

describe("output-token-policy", () => {
  const envSnapshot = { ...process.env };

  afterEach(() => {
    process.env = { ...envSnapshot };
  });

  it("infers tool follow-up turns from tool_result history", () => {
    expect(
      inferOutputBudgetRequestKind([
        {
          role: "user",
          content: [
            { type: "tool_result", tool_use_id: "1", content: "ok" },
          ] as Any,
        },
      ]),
    ).toBe("tool_followup");
  });

  it("uses adaptive policy by default", () => {
    delete process.env.NEOWORKER_LLM_OUTPUT_POLICY;
    expect(getOutputTokenPolicyMode()).toBe("adaptive");
  });

  it("keeps ordinary chat at 8K", () => {
    delete process.env.NEOWORKER_LLM_MAX_OUTPUT_TOKENS;
    delete process.env.NEOWORKER_LLM_AGENTIC_INITIAL_MAX_TOKENS;
    const budget = resolveOutputTokenBudget({
      providerType: "generic",
      modelId: "deepseek-v4-flash",
      messages: [{ role: "user", content: "帮我解释一下这个概念" }],
      system: "system",
      contextManager: { estimateMaxOutputTokens: () => 100_000 } as Any,
      taskMaxTokens: null,
      requestKind: "agentic_main",
      phase: "initial",
    });

    expect(budget.workloadProfile).toBe("chat");
    expect(budget.transport.value).toBe(8_000);
  });

  it("uses bounded 16K/32K budgets for large artifacts", () => {
    delete process.env.NEOWORKER_LLM_MAX_OUTPUT_TOKENS;
    delete process.env.NEOWORKER_LLM_AGENTIC_INITIAL_MAX_TOKENS;
    delete process.env.NEOWORKER_LLM_AGENTIC_ESCALATED_MAX_TOKENS;
    const messages = [
      {
        role: "user" as const,
        content: "创建一个带 Three.js 动画的完整 HTML 文件",
      },
    ];

    expect(inferOutputWorkloadProfile(messages)).toBe("large_artifact");
    const initial = resolveOutputTokenBudget({
      providerType: "generic",
      modelId: "deepseek-v4-flash",
      messages,
      system: "system",
      contextManager: { estimateMaxOutputTokens: () => 100_000 } as Any,
      taskMaxTokens: null,
      requestKind: "agentic_main",
      phase: "initial",
    });
    const continuation = resolveOutputTokenBudget({
      providerType: "generic",
      modelId: "deepseek-v4-flash",
      messages,
      system: "system",
      contextManager: { estimateMaxOutputTokens: () => 100_000 } as Any,
      taskMaxTokens: null,
      requestKind: "continuation",
      phase: "initial",
    });

    expect(initial.transport.value).toBe(16_000);
    expect(continuation.transport.value).toBe(32_000);
  });

  it("recognizes an explicit cutoff continuation turn", () => {
    expect(
      inferOutputBudgetRequestKind([
        { role: "user", content: "Continue exactly from where you left off." },
      ]),
    ).toBe("continuation");
  });

  it("routes OpenRouter Anthropic models through Anthropic-style defaults", () => {
    const budget = resolveOutputTokenBudget({
      providerType: "openrouter",
      modelId: "anthropic/claude-sonnet-4-5",
      messages: [{ role: "user", content: "hello" }],
      system: "system",
      contextManager: { estimateMaxOutputTokens: () => 200_000 } as Any,
      taskMaxTokens: null,
      requestKind: "agentic_main",
      phase: "escalated",
    });

    expect(budget.providerFamily).toBe("openrouter");
    expect(budget.routedFamily).toBe("anthropic");
    expect(budget.transport.value).toBe(64_000);
  });

  it("gives task-level maxTokens precedence over env and policy defaults", () => {
    process.env.NEOWORKER_LLM_OUTPUT_POLICY = "adaptive";
    process.env.NEOWORKER_LLM_MAX_OUTPUT_TOKENS = "32000";

    const budget = resolveOutputTokenBudget({
      providerType: "openai",
      modelId: "gpt-5.4",
      messages: [{ role: "user", content: "hello" }],
      system: "system",
      contextManager: { estimateMaxOutputTokens: () => 100_000 } as Any,
      taskMaxTokens: 12_345,
      requestKind: "agentic_main",
      phase: "initial",
    });

    expect(budget.capSource).toBe("task");
    expect(budget.transport.value).toBe(12_345);
  });

  it("caps env overrides at a sane upper bound", () => {
    process.env.NEOWORKER_LLM_OUTPUT_POLICY = "adaptive";
    process.env.NEOWORKER_LLM_MAX_OUTPUT_TOKENS = "9999999";

    const budget = resolveOutputTokenBudget({
      providerType: "openai",
      modelId: "gpt-5.4",
      messages: [{ role: "user", content: "hello" }],
      system: "system",
      contextManager: { estimateMaxOutputTokens: () => 500_000 } as Any,
      taskMaxTokens: null,
      requestKind: "agentic_main",
      phase: "initial",
    });

    expect(budget.capSource).toBe("env");
    expect(budget.envLimit).toBe(128_000);
    expect(budget.transport.value).toBe(128_000);
  });

  it("clamps by context headroom after selecting the budget source", () => {
    process.env.NEOWORKER_LLM_OUTPUT_POLICY = "adaptive";

    const budget = resolveOutputTokenBudget({
      providerType: "openai",
      modelId: "gpt-5.4",
      messages: [{ role: "user", content: "hello" }],
      system: "system",
      contextManager: { estimateMaxOutputTokens: () => 2048 } as Any,
      taskMaxTokens: null,
      requestKind: "tool_followup",
      phase: "initial",
    });

    expect(budget.policyDefault).toBe(12_000);
    expect(budget.transport.value).toBe(2_048);
  });

  it("resolves transport param names for newer OpenAI/Azure reasoning models", () => {
    expect(
      resolveOutputTokenParamName({
        providerType: "openai",
        modelId: "gpt-5.4",
        apiMode: "chat_completions",
      }),
    ).toBe("max_completion_tokens");
    expect(
      resolveOutputTokenParamName({
        providerType: "azure",
        modelId: "gpt-5.4",
        apiMode: "responses",
      }),
    ).toBe("max_output_tokens");
  });

  it("classifies thinking-only truncation as reasoning exhausted", () => {
    expect(
      classifyOutputTruncation([
        {
          type: "text",
          text: "<think>internal chain of thought</think>",
        } as Any,
      ]),
    ).toBe("reasoning_exhausted");
    expect(
      classifyOutputTruncation([
        { type: "text", text: "<think>x</think>Answer" } as Any,
      ]),
    ).toBe("visible_partial_output");
  });

  it("builds operator guidance for reasoning-only truncation", () => {
    expect(buildReasoningExhaustedGuidance()).toContain("直接行动模式");
    expect(buildReasoningExhaustedGuidance()).toContain("上下文已保留");
  });
});
