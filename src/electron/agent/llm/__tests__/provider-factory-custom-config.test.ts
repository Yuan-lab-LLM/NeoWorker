/**
 * Tests for custom provider config resolution
 * Ensures alias fallback is logged and resolved configs are preferred.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { LLMProviderFactory } from "../provider-factory";
import type { CustomProviderConfig } from "../../../../shared/types";

const dummyModelKey = "sonnet";

function getModelIdWithCustomProviders(
  providerType: "kimi-coding" | "kimi-code",
  customProviders: Record<string, CustomProviderConfig>,
) {
  return LLMProviderFactory.getModelId(
    dummyModelKey,
    providerType,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    customProviders,
    undefined,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("LLMProviderFactory custom provider config resolution", () => {
  it("uses the saved custom image capability override during attachment routing", () => {
    vi.spyOn(LLMProviderFactory, "loadSettings").mockReturnValue({
      providerType: "minimax",
      modelKey: "private-vision-alias",
      customProviders: {
        minimax: {
          apiKey: "test-key",
          model: "private-vision-alias",
          supportsImages: true,
        },
      },
    } as never);

    expect(
      LLMProviderFactory.getImageCapabilities("minimax", "private-vision-alias")
        .supportsImages,
    ).toBe(true);
  });

  it("uses the configured display name for an OpenAI-compatible provider", () => {
    const modelStatus = LLMProviderFactory.getProviderModelStatus({
      providerType: "openai-compatible",
      modelKey: "intelligence",
      openaiCompatible: {
        displayName: "Intelligence",
        model: "intelligence",
      },
    });

    expect(modelStatus.models).toContainEqual(
      expect.objectContaining({
        key: "intelligence",
        displayName: "intelligence",
        description: "Intelligence model",
      }),
    );
  });

  it("uses the saved model name for legacy OpenAI-compatible configurations", () => {
    const modelStatus = LLMProviderFactory.getProviderModelStatus({
      providerType: "openai-compatible",
      modelKey: "intelligence",
      openaiCompatible: { model: "intelligence" },
    });

    expect(modelStatus.models).toContainEqual(
      expect.objectContaining({
        key: "intelligence",
        description: "intelligence model",
      }),
    );
  });

  it("updates generic cached OpenAI-compatible labels to the saved provider name", () => {
    const modelStatus = LLMProviderFactory.getProviderModelStatus({
      providerType: "openai-compatible",
      modelKey: "intelligence",
      openaiCompatible: {
        displayName: "积算平台",
        model: "intelligence",
      },
      cachedOpenAICompatibleModels: [
        {
          key: "intelligence",
          displayName: "intelligence",
          description: "OpenAI-Compatible model",
        },
      ],
    });

    expect(modelStatus.models).toContainEqual(
      expect.objectContaining({
        key: "intelligence",
        description: "积算平台 model",
      }),
    );
  });

  it("only exposes providers that have a configured model in the chat picker", () => {
    vi.spyOn(LLMProviderFactory, "loadSettings").mockReturnValue({
      providerType: "deepseek",
      modelKey: "deepseek-v4-flash",
      deepseek: {
        apiKey: "deepseek-key",
        model: "deepseek-v4-flash",
      },
      openaiCompatible: {
        displayName: "积算平台",
        baseUrl: "https://api.example.com/v1",
        model: "intelligence",
      },
      bedrock: {
        region: "us-east-1",
        useDefaultCredentials: true,
      },
      ollama: { baseUrl: "http://localhost:11434" },
      providerModelRegistry: {
        deepseek: { models: ["deepseek-v4-flash"] },
        "openai-compatible": { models: ["intelligence"] },
      },
    } as never);

    const configured = LLMProviderFactory.getAvailableProviders().filter(
      (provider) => provider.configured,
    );

    expect(configured.map((provider) => provider.type)).toEqual([
      "deepseek",
      "openai-compatible",
    ]);
    expect(
      configured.find((provider) => provider.type === "openai-compatible"),
    ).toMatchObject({ name: "积算平台" });
  });

  it("does not expose Claude from a legacy global default and a stray credential", () => {
    vi.spyOn(LLMProviderFactory, "loadSettings").mockReturnValue({
      providerType: "deepseek",
      modelKey: "deepseek-v4-flash",
      deepseek: {
        apiKey: "deepseek-key",
        model: "deepseek-v4-flash",
      },
      anthropic: {
        apiKey: "legacy-anthropic-key",
        authMethod: "api_key",
      },
      cachedAnthropicModels: [
        {
          key: "opus-4-6",
          displayName: "Opus 4.6",
          description: "Previously discovered Claude model",
        },
      ],
      providerModelRegistry: {
        deepseek: { models: ["deepseek-v4-flash"] },
      },
    } as never);

    const providers = LLMProviderFactory.getAvailableProviders();

    expect(
      providers.find((provider) => provider.type === "anthropic")?.configured,
    ).toBe(false);
    expect(
      providers.find((provider) => provider.type === "deepseek")?.configured,
    ).toBe(true);
  });

  it("exposes Claude after the user explicitly enables a Claude model", () => {
    vi.spyOn(LLMProviderFactory, "loadSettings").mockReturnValue({
      providerType: "deepseek",
      modelKey: "deepseek-v4-flash",
      deepseek: {
        apiKey: "deepseek-key",
        model: "deepseek-v4-flash",
      },
      anthropic: {
        apiKey: "anthropic-key",
        authMethod: "api_key",
      },
      providerModelRegistry: {
        deepseek: { models: ["deepseek-v4-flash"] },
        anthropic: {
          models: ["sonnet-4-6"],
          enabled: { "sonnet-4-6": true },
        },
      },
    } as never);

    expect(
      LLMProviderFactory.getAvailableProviders().find(
        (provider) => provider.type === "anthropic",
      )?.configured,
    ).toBe(true);
  });

  it("keeps a valid legacy Kimi model visible beside a newer provider registry", () => {
    vi.spyOn(LLMProviderFactory, "loadSettings").mockReturnValue({
      providerType: "deepseek",
      modelKey: "deepseek-v4-flash",
      deepseek: {
        apiKey: "deepseek-key",
        model: "deepseek-v4-flash",
      },
      kimi: {
        apiKey: "kimi-key",
        model: "kimi-k3",
      },
      providerModelRegistry: {
        deepseek: { models: ["deepseek-v4-flash"] },
      },
    } as never);

    const configured = LLMProviderFactory.getAvailableProviders().filter(
      (provider) => provider.configured,
    );

    expect(configured.map((provider) => provider.type)).toEqual([
      "deepseek",
      "kimi",
    ]);
  });

  it("logs when falling back from resolved alias to providerType config", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const customProviders: Record<string, CustomProviderConfig> = {
      "kimi-coding": {
        apiKey: "test-key",
        model: "custom-model",
      },
    };

    const modelId = getModelIdWithCustomProviders(
      "kimi-coding",
      customProviders,
    );

    expect(modelId).toBe("custom-model");
    expect(logSpy).toHaveBeenCalledWith(
      '[LLMProviderFactory] Custom provider config not found for "kimi-code", falling back to "kimi-coding".',
    );
  });

  it("prefers resolved alias config when present without logging", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const customProviders: Record<string, CustomProviderConfig> = {
      "kimi-code": {
        apiKey: "resolved-key",
        model: "resolved-model",
      },
      "kimi-coding": {
        apiKey: "fallback-key",
        model: "fallback-model",
      },
    };

    const modelId = getModelIdWithCustomProviders(
      "kimi-coding",
      customProviders,
    );

    expect(modelId).toBe("resolved-model");
    expect(logSpy).not.toHaveBeenCalled();
  });

  it("uses Azure deployment name when provider type is azure", () => {
    const modelId = LLMProviderFactory.getModelId(
      dummyModelKey,
      "azure",
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      "my-deployment",
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    );

    expect(modelId).toBe("my-deployment");
  });

  it("prefers explicit bedrock model ID when provider type is bedrock", () => {
    const modelId = LLMProviderFactory.getModelId(
      "sonnet-3-5",
      "bedrock",
      undefined, // ollamaModel
      undefined, // geminiModel
      undefined, // openrouterModel
      undefined, // deepseekModel
      undefined, // openaiModel
      undefined, // azureDeployment
      undefined, // azureAnthropicDeployment
      undefined, // groqModel
      undefined, // xaiModel
      undefined, // kimiModel
      undefined, // customProviders
      "us.anthropic.claude-opus-4-6-20260115-v1:0", // bedrockModel
    );

    expect(modelId).toBe("us.anthropic.claude-opus-4-6-20260115-v1:0");
  });

  it("keeps cached custom-provider models and adds documented models", () => {
    const modelStatus = LLMProviderFactory.getProviderModelStatus({
      providerType: "minimax-portal",
      modelKey: "sonnet-3-5",
      customProviders: {
        "minimax-portal": {
          apiKey: "minimax-test",
          model: "MiniMax-M2.5",
          cachedModels: [
            {
              key: "MiniMax-M2.5",
              displayName: "MiniMax M2.5",
              description: "MiniMax Portal model",
            },
            {
              key: "MiniMax-M2.1",
              displayName: "MiniMax M2.1",
              description: "MiniMax Portal model",
            },
          ],
        },
      },
    } as Any);

    expect(modelStatus.currentModel).toBe("MiniMax-M2.5");
    expect(modelStatus.models.map((model) => model.key)).toEqual([
      "MiniMax-M2.5",
      "MiniMax-M2.1",
      "MiniMax-M2.7",
      "MiniMax-M2.7-highspeed",
      "MiniMax-M2.5-highspeed",
      "MiniMax-M2.1-highspeed",
      "MiniMax-M2",
    ]);
  });

  it("keeps Anthropic-compatible gateway models that overlap another provider", () => {
    const modelStatus = LLMProviderFactory.getProviderModelStatus({
      providerType: "anthropic-compatible",
      modelKey: "sonnet-4-6",
      kimi: {
        model: "moonshotai/kimi-k2.6:thinking",
      },
      customProviders: {
        "anthropic-compatible": {
          apiKey: "nano-key",
          baseUrl: "https://nano-gpt.com/api/v1",
          model: "moonshotai/kimi-k2.6:thinking",
          cachedModels: [
            {
              key: "moonshotai/kimi-k2.6:thinking",
              displayName: "Kimi K2.6 Thinking",
              description: "NanoGPT Anthropic-compatible model",
            },
          ],
        },
      },
    } as Any);

    expect(modelStatus.currentModel).toBe("moonshotai/kimi-k2.6:thinking");
    expect(modelStatus.models[0]).toMatchObject({
      key: "moonshotai/kimi-k2.6:thinking",
      displayName: "Kimi K2.6 Thinking",
    });
  });

  it("returns documented MiniMax Portal models when refreshing custom-provider models", async () => {
    vi.spyOn(LLMProviderFactory, "loadSettings").mockReturnValue({
      providerType: "minimax-portal",
      modelKey: "sonnet-3-5",
      customProviders: {
        "minimax-portal": {
          apiKey: "minimax-test",
          model: "MiniMax-M2.5",
        },
      },
    } as Any);
    const saveSpy = vi
      .spyOn(LLMProviderFactory, "saveSettings")
      .mockImplementation(() => {});

    await expect(
      LLMProviderFactory.getCustomProviderModels("minimax-portal"),
    ).resolves.toEqual([
      {
        key: "MiniMax-M2.5",
        displayName: "MiniMax-M2.5",
        description: "MiniMax Portal model",
      },
      {
        key: "MiniMax-M2.7",
        displayName: "MiniMax-M2.7",
        description: "MiniMax Portal model",
      },
      {
        key: "MiniMax-M2.7-highspeed",
        displayName: "MiniMax-M2.7-highspeed",
        description: "MiniMax Portal model",
      },
      {
        key: "MiniMax-M2.5-highspeed",
        displayName: "MiniMax-M2.5-highspeed",
        description: "MiniMax Portal model",
      },
      {
        key: "MiniMax-M2.1",
        displayName: "MiniMax-M2.1",
        description: "MiniMax Portal model",
      },
      {
        key: "MiniMax-M2.1-highspeed",
        displayName: "MiniMax-M2.1-highspeed",
        description: "MiniMax Portal model",
      },
      {
        key: "MiniMax-M2",
        displayName: "MiniMax-M2",
        description: "MiniMax Portal model",
      },
    ]);

    expect(saveSpy).toHaveBeenCalled();
  });

  it("trims pasted compatible-provider credentials before connection testing", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [{ type: "text", text: "ok" }],
        stop_reason: "end_turn",
      }),
    } as Response);

    const provider = LLMProviderFactory.createProviderFromConfig({
      type: "anthropic-compatible",
      model: " moonshotai/kimi-k2.6:thinking \n",
      providerApiKey: " nano-key\r\n",
      providerBaseUrl: " https://nano-gpt.com/api/v1/ \n",
    } as Any);

    await expect(provider.testConnection()).resolves.toEqual({ success: true });

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://nano-gpt.com/api/v1/messages",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "x-api-key": "nano-key",
          Authorization: "Bearer nano-key",
        }),
      }),
    );

    fetchSpy.mockClear();

    const openaiCompatibleProvider =
      LLMProviderFactory.createProviderFromConfig({
        type: "openai-compatible",
        model: " openai/gpt-5.2 \n",
        openaiCompatibleApiKey: " nano-openai-key\r\n",
        openaiCompatibleBaseUrl: " https://nano-gpt.com/api/v1 \n",
      } as Any);

    await expect(openaiCompatibleProvider.testConnection()).resolves.toEqual({
      success: true,
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://nano-gpt.com/api/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer nano-openai-key",
        }),
      }),
    );
  });

  it("routes NanoGPT through its named OpenAI-compatible provider", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
      }),
    } as Response);

    const provider = LLMProviderFactory.createProviderFromConfig({
      type: "nano-gpt",
      model: "",
      providerApiKey: " nano-key\r\n",
    } as Any);

    await expect(provider.testConnection()).resolves.toEqual({ success: true });

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://nano-gpt.com/api/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer nano-key",
        }),
      }),
    );
  });

  it("uses a documented OpenCode Go chat completions endpoint without appending the path twice", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "ok" } }],
      }),
    } as Response);

    const provider = LLMProviderFactory.createProviderFromConfig({
      type: "openai-compatible",
      model: "kimi-k2.5",
      openaiCompatibleApiKey: "opencode-go-key",
      openaiCompatibleBaseUrl: "https://opencode.ai/zen/go/v1/chat/completions",
    } as Any);

    await expect(provider.testConnection()).resolves.toEqual({
      success: true,
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://opencode.ai/zen/go/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer opencode-go-key",
        }),
      }),
    );
  });

  it("routes OpenCode Go Qwen 3.7 Max through the Anthropic Messages API", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [{ type: "text", text: "ok" }],
        stop_reason: "end_turn",
      }),
    } as Response);

    const provider = LLMProviderFactory.createProviderFromConfig({
      type: "opencode",
      model: "opencode-go/qwen3.7-max",
      providerApiKey: "opencode-go-key",
      providerBaseUrl: "https://opencode.ai/zen/go/v1/chat/completions",
    } as Any);

    await expect(
      provider.createMessage({
        model: "opencode-go/qwen3.7-max",
        system: "Use tools when useful.",
        maxTokens: 4096,
        messages: [{ role: "user", content: "Hello" }],
      }),
    ).resolves.toMatchObject({
      content: [{ type: "text", text: "ok" }],
      stopReason: "end_turn",
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://opencode.ai/zen/go/v1/messages",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "anthropic-version": "2023-06-01",
          "x-api-key": "opencode-go-key",
          Authorization: "Bearer opencode-go-key",
        }),
      }),
    );

    const body = JSON.parse(String(fetchSpy.mock.calls[0]?.[1]?.body || "{}"));
    expect(body).toMatchObject({
      model: "qwen3.7-max",
      max_tokens: 4096,
      system: "Use tools when useful.",
      messages: [{ role: "user", content: "Hello" }],
    });
    expect(body.max_completion_tokens).toBeUndefined();
  });

  it("routes bare OpenCode Go Qwen 3.7 Max connection tests through the Anthropic Messages API", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [{ type: "text", text: "ok" }],
        stop_reason: "end_turn",
      }),
    } as Response);

    const provider = LLMProviderFactory.createProviderFromConfig({
      type: "opencode",
      model: "qwen3.7-max",
      providerApiKey: "opencode-go-key",
      providerBaseUrl: "https://opencode.ai/zen/go/v1/chat/completions",
    } as Any);

    await expect(provider.testConnection()).resolves.toEqual({
      success: true,
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://opencode.ai/zen/go/v1/messages",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "x-api-key": "opencode-go-key",
        }),
      }),
    );

    const body = JSON.parse(String(fetchSpy.mock.calls[0]?.[1]?.body || "{}"));
    expect(body).toMatchObject({
      model: "qwen3.7-max",
      max_tokens: 10,
      messages: [{ role: "user", content: "Hi" }],
    });
  });

  it("routes generic OpenAI-compatible OpenCode Go Qwen 3.7 Max through Anthropic Messages", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [{ type: "text", text: "ok" }],
        stop_reason: "end_turn",
      }),
    } as Response);

    const provider = LLMProviderFactory.createProviderFromConfig({
      type: "openai-compatible",
      model: "opencode-go/qwen3.7-max",
      openaiCompatibleApiKey: "opencode-go-key",
      openaiCompatibleBaseUrl: "https://opencode.ai/zen/go/v1/chat/completions",
    } as Any);

    await expect(
      provider.createMessage({
        model: "opencode-go/qwen3.7-max",
        system: "Use tools when useful.",
        maxTokens: 4096,
        messages: [{ role: "user", content: "Hello" }],
      }),
    ).resolves.toMatchObject({
      content: [{ type: "text", text: "ok" }],
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://opencode.ai/zen/go/v1/messages",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "x-api-key": "opencode-go-key",
        }),
      }),
    );
  });

  it("routes OpenCode Go request model overrides through the matching API surface", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
      }),
    } as Response);

    const kimiDefaultProvider = LLMProviderFactory.createProviderFromConfig({
      type: "opencode",
      model: "opencode-go/kimi-k2.6",
      providerApiKey: "opencode-go-key",
      providerBaseUrl: "https://opencode.ai/zen/go/v1/chat/completions",
    } as Any);

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [{ type: "text", text: "ok" }],
        stop_reason: "end_turn",
      }),
    } as Response);

    await expect(
      kimiDefaultProvider.createMessage({
        model: "opencode-go/qwen3.7-max",
        system: "Use tools when useful.",
        maxTokens: 4096,
        messages: [{ role: "user", content: "Hello" }],
      }),
    ).resolves.toMatchObject({
      content: [{ type: "text", text: "ok" }],
    });

    expect(fetchSpy.mock.calls[0]?.[0]).toBe(
      "https://opencode.ai/zen/go/v1/messages",
    );
    expect(
      JSON.parse(String(fetchSpy.mock.calls[0]?.[1]?.body || "{}")),
    ).toMatchObject({ model: "qwen3.7-max" });

    fetchSpy.mockClear();
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
      }),
    } as Response);

    const qwenDefaultProvider = LLMProviderFactory.createProviderFromConfig({
      type: "opencode",
      model: "opencode-go/qwen3.7-max",
      providerApiKey: "opencode-go-key",
      providerBaseUrl: "https://opencode.ai/zen/go/v1/chat/completions",
    } as Any);

    await expect(
      qwenDefaultProvider.createMessage({
        model: "opencode-go/kimi-k2.6",
        system: "Use tools when useful.",
        maxTokens: 4096,
        messages: [{ role: "user", content: "Hello" }],
      }),
    ).resolves.toMatchObject({
      content: [{ type: "text", text: "ok" }],
    });

    expect(fetchSpy.mock.calls[0]?.[0]).toBe(
      "https://opencode.ai/zen/go/v1/chat/completions",
    );
    expect(
      JSON.parse(String(fetchSpy.mock.calls[0]?.[1]?.body || "{}")),
    ).toMatchObject({ model: "kimi-k2.6" });
  });

  it("adapts OpenCode Go Kimi tool turns to the raw chat completions API", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
      }),
    } as Response);

    const provider = LLMProviderFactory.createProviderFromConfig({
      type: "opencode",
      model: "opencode-go/kimi-k2.6",
      providerApiKey: "opencode-go-key",
      providerBaseUrl: "https://opencode.ai/zen/go/v1/chat/completions",
    } as Any);

    await expect(
      provider.createMessage({
        model: "opencode-go/kimi-k2.6",
        system: "Use tools when useful.",
        maxTokens: 48000,
        messages: [
          { role: "user", content: "Search for current design skills" },
        ],
        tools: [
          {
            name: "web_search",
            description: "Search the web",
            input_schema: {
              type: "object",
              properties: {
                query: { type: "string" },
              },
              required: ["query"],
            },
          },
        ],
      }),
    ).resolves.toMatchObject({
      content: [{ type: "text", text: "ok" }],
      stopReason: "end_turn",
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://opencode.ai/zen/go/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer opencode-go-key",
        }),
      }),
    );

    const body = JSON.parse(String(fetchSpy.mock.calls[0]?.[1]?.body || "{}"));
    expect(body).toMatchObject({
      model: "kimi-k2.6",
      max_completion_tokens: 32768,
      thinking: { type: "disabled" },
      tool_choice: "auto",
    });
    expect(body.max_tokens).toBeUndefined();
    expect(body.tools[0].function.strict).toBe(false);
  });

  it("uses DeepSeek's documented OpenAI-compatible endpoint", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "ok" } }],
      }),
    } as Response);

    const provider = LLMProviderFactory.createProviderFromConfig({
      type: "deepseek",
      model: "deepseek-reasoner",
      deepseekApiKey: "deepseek-key",
    } as Any);

    await expect(provider.testConnection()).resolves.toEqual({
      success: true,
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.deepseek.com/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer deepseek-key",
        }),
      }),
    );
  });

  it("blocks DeepSeek Reasoner for tool-using agent turns until reasoning replay is supported", async () => {
    const provider = LLMProviderFactory.createProviderFromConfig({
      type: "deepseek",
      model: "deepseek-reasoner",
      deepseekApiKey: "deepseek-key",
    } as Any);

    await expect(
      provider.createMessage({
        model: "deepseek-reasoner",
        messages: [{ role: "user", content: "Use a tool" }],
        maxTokens: 100,
        tools: [
          {
            name: "example",
            description: "Example tool",
            input_schema: {
              type: "object",
              properties: {},
            },
          },
        ],
      }),
    ).rejects.toThrow(/DeepSeek Reasoner is not supported/);
  });

  it("sends image_url data URIs to known custom multimodal model families", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            finish_reason: "stop",
            message: { content: "ok" },
          },
        ],
      }),
    } as Response);

    const routes = [
      { type: "moonshot", model: "kimi-k2.6" },
      { type: "glm", model: "glm-4.5v" },
      { type: "minimax", model: "MiniMax-VL-01" },
    ];

    for (const route of routes) {
      const provider = LLMProviderFactory.createProviderFromConfig({
        type: route.type,
        model: route.model,
        providerApiKey: "test-key",
        providerBaseUrl: "https://example.invalid/v1",
      } as Any);

      await provider.createMessage({
        model: route.model,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "What is in this image?" },
              {
                type: "image",
                mimeType: "image/png",
                data: "AQIDBA==",
              },
            ],
          },
        ],
        maxTokens: 256,
      });
    }

    expect(fetchSpy).toHaveBeenCalledTimes(routes.length);
    for (const call of fetchSpy.mock.calls) {
      const body = JSON.parse(String(call[1]?.body || "{}"));
      expect(body.messages[0].content).toEqual([
        { type: "text", text: "What is in this image?" },
        {
          type: "image_url",
          image_url: { url: "data:image/png;base64,AQIDBA==" },
        },
      ]);
    }
  });

  it("adds documented Z.AI coding-plan models to partial refresh results", async () => {
    vi.spyOn(LLMProviderFactory, "loadSettings").mockReturnValue({
      providerType: "zai",
      modelKey: "sonnet-3-5",
      customProviders: {
        zai: {
          apiKey: "zai-test",
          baseUrl: "https://api.z.ai/api/paas/v4",
          model: "glm-4.7",
        },
      },
    } as Any);
    vi.spyOn(LLMProviderFactory, "saveSettings").mockImplementation(() => {});
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: "glm-4.7" }] }),
    } as Response);

    const models = await LLMProviderFactory.getCustomProviderModels("zai");

    expect(models.map((model) => model.key)).toEqual([
      "glm-4.7",
      "GLM-5.1",
      "GLM-5-Turbo",
      "GLM-5V-Turbo",
      "glm-4.5-air",
    ]);
  });

  it("keeps documented custom-provider models when the gateway has no models endpoint", async () => {
    vi.spyOn(LLMProviderFactory, "loadSettings").mockReturnValue({
      providerType: "zai",
      modelKey: "sonnet-3-5",
      customProviders: {
        zai: {
          apiKey: "zai-test",
          baseUrl: "https://gateway.example.com/v1",
          model: "custom-glm-alias",
        },
      },
    } as Any);
    vi.spyOn(LLMProviderFactory, "saveSettings").mockImplementation(() => {});
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => "not found",
    } as Response);

    const models = await LLMProviderFactory.getCustomProviderModels("zai");

    expect(models.map((model) => model.key)).toEqual([
      "custom-glm-alias",
      "GLM-5.1",
      "GLM-5-Turbo",
      "GLM-5V-Turbo",
      "glm-4.7",
      "glm-4.5-air",
    ]);
  });
});
