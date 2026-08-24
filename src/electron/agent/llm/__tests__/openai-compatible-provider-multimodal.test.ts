import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenAICompatibleProvider } from "../openai-compatible-provider";

afterEach(() => {
  vi.restoreAllMocks();
});

function mockSuccessfulResponse() {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok: true,
    json: async () => ({
      choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
    }),
  } as Response);
}

function createProvider(providerName: string, model: string) {
  return new OpenAICompatibleProvider({
    type: "openai-compatible",
    providerName,
    apiKey: "test-key",
    baseUrl: "https://gateway.example.com/v1",
    defaultModel: model,
  });
}

describe("OpenAI-compatible multimodal provider adapters", () => {
  it("parses common gateway model-list response shapes", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        result: {
          models: [
            { model_id: "glm-5.2", display_name: "GLM 5.2" },
            "kimi-k2.6",
            { id: "glm-5.2", name: "duplicate" },
          ],
        },
      }),
    } as Response);
    const provider = createProvider("Custom gateway", "glm-5.2");

    await expect(provider.getAvailableModels()).resolves.toEqual([
      { id: "glm-5.2", name: "GLM 5.2" },
      { id: "kimi-k2.6", name: "kimi-k2.6" },
    ]);
    expect(fetchSpy).toHaveBeenCalledWith("https://gateway.example.com/v1/models", {
      headers: { Authorization: "Bearer test-key" },
    });
  });

  it("reports model endpoint errors instead of pretending refresh succeeded", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => "invalid credential",
    } as Response);
    const provider = createProvider("Custom gateway", "glm-5.2");

    await expect(provider.getAvailableModels()).rejects.toThrow(
      "Custom gateway model refresh failed: HTTP 401",
    );
  });

  it.each([
    ["Kimi", "kimi-k2.7-code"],
    ["GLM", "glm-4.6v-flash"],
    ["MiniMax", "MiniMax-VL-01"],
  ])("sends inline images to %s visual models", async (providerName, model) => {
    const fetchSpy = mockSuccessfulResponse();
    const provider = createProvider(providerName, model);

    await provider.createMessage({
      model,
      maxTokens: 1024,
      system: "",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Describe this image" },
            { type: "image", mimeType: "image/png", data: "AQIDBA==" },
          ],
        },
      ],
    });

    const body = JSON.parse(String(fetchSpy.mock.calls[0]?.[1]?.body || "{}"));
    expect(body.messages[0].content).toEqual([
      { type: "text", text: "Describe this image" },
      {
        type: "image_url",
        image_url: { url: "data:image/png;base64,AQIDBA==" },
      },
    ]);
  });

  it("uses MiniMax tool-turn compatibility fields", async () => {
    const fetchSpy = mockSuccessfulResponse();
    const provider = createProvider("MiniMax", "MiniMax-M2.7");

    await provider.createMessage({
      model: "MiniMax-M2.7",
      maxTokens: 2048,
      system: "",
      messages: [{ role: "user", content: "Use the tool" }],
      tools: [
        {
          name: "read_file",
          description: "Read a file",
          input_schema: { type: "object", properties: {} },
        },
      ],
    });

    const body = JSON.parse(String(fetchSpy.mock.calls[0]?.[1]?.body || "{}"));
    expect(body.max_completion_tokens).toBe(2048);
    expect(body.max_tokens).toBeUndefined();
    expect(body.reasoning_split).toBe(false);
  });

  it("does not send the K2.5/K2.6 thinking switch to newer Kimi models", async () => {
    const fetchSpy = mockSuccessfulResponse();
    const provider = createProvider("Kimi", "kimi-k2.7-code");

    await provider.createMessage({
      model: "kimi-k2.7-code",
      maxTokens: 2048,
      system: "",
      messages: [{ role: "user", content: "Use the tool" }],
      tools: [
        {
          name: "read_file",
          description: "Read a file",
          input_schema: { type: "object", properties: {} },
        },
      ],
    });

    const body = JSON.parse(String(fetchSpy.mock.calls[0]?.[1]?.body || "{}"));
    expect(body.max_completion_tokens).toBe(2048);
    expect(body.thinking).toBeUndefined();
  });
});
