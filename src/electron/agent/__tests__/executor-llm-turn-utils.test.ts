import { describe, expect, it, vi } from "vitest";
import {
  buildLargeArtifactGenerationGuidance,
  buildMalformedToolArgumentsRecoveryGuidance,
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
    expect(result.outputBudget.initialBudget).toBe(32_000);
    expect(createMessageWithTimeout).toHaveBeenCalledWith(
      expect.objectContaining({
        maxTokens: 32_000,
        system: expect.stringContaining("LARGE ARTIFACT DELIVERY PROTOCOL"),
      }),
      120_000,
      "test",
    );
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
