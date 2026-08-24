import { describe, expect, it, vi } from "vitest";
import {
  buildLargeArtifactGenerationGuidance,
  buildMalformedToolArgumentsRecoveryGuidance,
  buildReasoningExhaustedActionRecoveryGuidance,
  buildReasoningExhaustedActionRecoveryMessages,
  isMalformedToolArgumentsError,
  maybeApplyQualityPasses,
  requestLLMResponseWithAdaptiveBudget,
} from "../executor-llm-turn-utils";

describe("large artifact delivery guidance", () => {
  it("requires skeleton, bounded chunks, dedicated Office tools, and verification", () => {
    const guidance = buildLargeArtifactGenerationGuidance();
    expect(guidance).toContain("skeleton");
    expect(guidance).toContain("6000");
    expect(guidance).toContain("PPTX");
    expect(guidance).toContain("verify");
    expect(guidance).toContain("without repeating");
  });
});

describe("malformed tool argument recovery", () => {
  it("recognizes provider parser failures and changes HTML generation strategy", () => {
    expect(
      isMalformedToolArgumentsError({
        name: "MalformedToolArgumentsError",
        code: "MALFORMED_TOOL_ARGUMENTS",
      }),
    ).toBe(true);

    const guidance =
      buildMalformedToolArgumentsRecoveryGuidance("生成一个 HTML 格式文件");
    expect(guidance).toContain("convert_markdown_to_html");
    expect(guidance).toContain("6000");
    expect(guidance).toContain("Verify the tool result");
  });
});

describe("reasoning-only action recovery", () => {
  it("forces one bounded mutation instead of repeating artifact planning", () => {
    const guidance =
      buildReasoningExhaustedActionRecoveryGuidance("继续生成完整 HTML 文件");
    expect(guidance).toContain("exactly one concrete, usable tool call");
    expect(guidance).toContain("edit_file/write_file");
    expect(guidance).toContain("6000");
    expect(guidance).toContain("staging placeholder");
  });

  it("extends the last user turn instead of creating adjacent user roles", () => {
    const messages = buildReasoningExhaustedActionRecoveryMessages(
      [{ role: "user", content: "生成 HTML" }],
      "生成 HTML",
    );
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe("user");
    expect(String(messages[0].content)).toContain("ACTION-ONLY RECOVERY TURN");
  });
});

describe("adaptive workload profiling", () => {
  it("uses the stable request text to classify compacted HTML follow-ups", async () => {
    const createMessageWithTimeout = vi.fn(async () => ({
      stopReason: "end_turn",
      content: [{ type: "text", text: "done" }],
      usage: { inputTokens: 10, outputTokens: 2 },
    }));

    const result = await requestLLMResponseWithAdaptiveBudget({
      messages: [{ role: "user", content: "继续" }],
      workloadProfileText: "继续生成完整 HTML 动画文件",
      retryLabel: "test",
      operation: "test",
      llmTimeoutMs: 120_000,
      providerType: "deepseek",
      modelId: "deepseek-v4-flash",
      systemPrompt: "system",
      getTaskMaxTokens: () => null,
      getContextManager: () => ({ estimateMaxOutputTokens: () => 100_000 }),
      getAvailableTools: () => [
        {
          name: "write_file",
          description: "write",
          input_schema: { type: "object", properties: {} },
        },
      ],
      applyRetryTokenCap: (budget) => budget,
      getRetryTimeoutMs: (timeoutMs) => timeoutMs,
      callLLMWithRetry: (request) => request(0),
      createMessageWithTimeout,
      updateTracking: vi.fn(),
      log: vi.fn(),
    });

    expect(result.outputBudget.workloadProfile).toBe("large_artifact");
    expect(result.outputBudget.initialBudget).toBe(16_000);
    expect(createMessageWithTimeout).toHaveBeenCalledWith(
      expect.objectContaining({
        maxTokens: 16_000,
        system: expect.stringContaining("LARGE ARTIFACT DELIVERY PROTOCOL"),
      }),
      120_000,
      "test",
    );
  });

  it("turns a reasoning-only artifact cutoff into a bounded tool action", async () => {
    const previousPolicy = process.env.NEOWORKER_LLM_OUTPUT_POLICY;
    process.env.NEOWORKER_LLM_OUTPUT_POLICY = "adaptive";
    try {
      const createMessageWithTimeout = vi
        .fn()
        .mockResolvedValueOnce({
          stopReason: "max_tokens",
          content: [{ type: "text", text: "<think>long reasoning</think>" }],
          usage: { inputTokens: 10, outputTokens: 16_000 },
        })
        .mockResolvedValueOnce({
          stopReason: "tool_use",
          content: [
            {
              type: "tool_use",
              id: "call-1",
              name: "edit_file",
              input: { path: "report.html", old_text: "x", new_text: "y" },
            },
          ],
          usage: { inputTokens: 10, outputTokens: 200 },
        });

      const result = await requestLLMResponseWithAdaptiveBudget({
        messages: [{ role: "user", content: "生成完整 HTML 文件" }],
        workloadProfileText: "生成完整 HTML 文件",
        retryLabel: "test",
        operation: "test",
        llmTimeoutMs: 120_000,
        providerType: "deepseek",
        modelId: "deepseek-v4-flash",
        systemPrompt: "system",
        getTaskMaxTokens: () => null,
        getContextManager: () => ({ estimateMaxOutputTokens: () => 100_000 }),
        getAvailableTools: () => [
          {
            name: "edit_file",
            description: "edit",
            input_schema: { type: "object", properties: {} },
          },
        ],
        applyRetryTokenCap: (budget) => budget,
        getRetryTimeoutMs: (timeoutMs) => timeoutMs,
        callLLMWithRetry: (request) => request(0),
        createMessageWithTimeout,
        updateTracking: vi.fn(),
        log: vi.fn(),
      });

      expect(createMessageWithTimeout).toHaveBeenCalledTimes(2);
      expect(createMessageWithTimeout.mock.calls[1][0].maxTokens).toBe(8_000);
      const recoveryMessage =
        createMessageWithTimeout.mock.calls[1][0].messages.at(-1);
      expect(recoveryMessage?.role).toBe("user");
      expect(JSON.stringify(recoveryMessage?.content)).toContain(
        "ACTION-ONLY RECOVERY TURN",
      );
      expect(result.response.stopReason).toBe("tool_use");
      expect(result.outputBudget.escalationAttempted).toBe(true);
      expect(result.outputBudget.finalBudget).toBe(8_000);
    } finally {
      if (previousPolicy == null) {
        delete process.env.NEOWORKER_LLM_OUTPUT_POLICY;
      } else {
        process.env.NEOWORKER_LLM_OUTPUT_POLICY = previousPolicy;
      }
    }
  });
});

describe("maybeApplyQualityPasses", () => {
  it("keeps the original response when the quality pass result is not accepted", async () => {
    const response = {
      stopReason: "end_turn",
      content: [{ type: "text", text: "Original draft" }],
    };

    const result = await maybeApplyQualityPasses({
      response,
      enabled: true,
      contextLabel: "follow-up 2",
      userIntent: "Review again",
      getQualityPassCount: () => 2,
      extractTextFromLLMContent: (content) =>
        (content || [])
          .filter((item: Any) => item.type === "text")
          .map((item: Any) => item.text)
          .join("\n"),
      applyQualityPassesToDraft: vi.fn(async () => ({
        text: 'to=run_command {"command":"git status --short"}',
        accepted: false,
      })),
    });

    expect(result).toBe(response);
  });

  it("replaces the response when the quality pass result is accepted", async () => {
    const response = {
      stopReason: "end_turn",
      content: [{ type: "text", text: "Original draft" }],
    };

    const result = await maybeApplyQualityPasses({
      response,
      enabled: true,
      contextLabel: "follow-up 2",
      userIntent: "Review again",
      getQualityPassCount: () => 2,
      extractTextFromLLMContent: (content) =>
        (content || [])
          .filter((item: Any) => item.type === "text")
          .map((item: Any) => item.text)
          .join("\n"),
      applyQualityPassesToDraft: vi.fn(async () => ({
        text: "Improved draft",
        accepted: true,
      })),
    });

    expect(result).not.toBe(response);
    expect(result.content).toEqual([{ type: "text", text: "Improved draft" }]);
    expect(result.stopReason).toBe("end_turn");
  });
});
