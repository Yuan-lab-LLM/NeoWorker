import { afterEach, describe, expect, it, vi } from "vitest";
import {
  OpenAICompatibleProvider,
  OpenAICompatibleProviderError,
} from "../openai-compatible-provider";

function createProvider(): OpenAICompatibleProvider {
  return new OpenAICompatibleProvider({
    type: "deepseek",
    providerName: "DeepSeek",
    apiKey: "test-key",
    baseUrl: "https://api.deepseek.example/v1",
    defaultModel: "deepseek-chat",
  });
}

function createRequest() {
  return {
    model: "deepseek-chat",
    maxTokens: 32,
    system: "",
    messages: [{ role: "user" as const, content: "hello" }],
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("OpenAICompatibleProvider error metadata", () => {
  it("sends image_url content for a DeepSeek vision model", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: vi.fn().mockResolvedValue({
        choices: [
          {
            finish_reason: "stop",
            message: { content: "A city skyline." },
          },
        ],
        usage: {
          prompt_tokens: 12,
          completion_tokens: 4,
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await createProvider().createMessage({
      model: "deepseek-v4-flash-vision-exp",
      maxTokens: 32,
      system: "",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Where is this?" },
            {
              type: "image",
              mimeType: "image/png",
              data: "AA==",
              originalSizeBytes: 2,
            },
          ],
        },
      ],
    });

    const requestBody = JSON.parse(
      String((fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.body),
    );
    expect(requestBody.model).toBe("deepseek-v4-flash-vision-exp");
    expect(requestBody.messages).toEqual([
      {
        role: "user",
        content: [
          { type: "text", text: "Where is this?" },
          {
            type: "image_url",
            image_url: { url: "data:image/png;base64,AA==" },
          },
        ],
      },
    ]);
  });

  it("marks temporary HTTP failures as retryable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        statusText: "Service Unavailable",
        json: vi.fn().mockResolvedValue({
          error: { message: "upstream is overloaded" },
        }),
      }),
    );

    await expect(
      createProvider().createMessage(createRequest()),
    ).rejects.toMatchObject({
      name: "OpenAICompatibleProviderError",
      status: 503,
      code: "HTTP_503",
      retryable: true,
    });
  });

  it("does not retry authentication failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        json: vi.fn().mockResolvedValue({
          error: { message: "invalid api key" },
        }),
      }),
    );

    await expect(
      createProvider().createMessage(createRequest()),
    ).rejects.toMatchObject({
      status: 401,
      code: "HTTP_401",
      retryable: false,
    });
  });

  it("preserves fetch transport failures as structured retryable errors", async () => {
    const transportError = new TypeError("fetch failed");
    Object.assign(transportError, {
      cause: { code: "UND_ERR_CONNECT_TIMEOUT" },
    });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(transportError));

    let failure: unknown;
    try {
      await createProvider().createMessage(createRequest());
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(OpenAICompatibleProviderError);
    expect(failure).toMatchObject({
      code: "UND_ERR_CONNECT_TIMEOUT",
      retryable: true,
    });
  });

  it("retries a successful HTTP response with malformed JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        json: vi.fn().mockRejectedValue(new SyntaxError("Unexpected EOF")),
      }),
    );

    await expect(
      createProvider().createMessage(createRequest()),
    ).rejects.toMatchObject({
      code: "INVALID_JSON_RESPONSE",
      retryable: true,
    });
  });

  it("preserves malformed tool arguments as a retryable model-response error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        json: vi.fn().mockResolvedValue({
          choices: [
            {
              finish_reason: "tool_calls",
              message: {
                content: null,
                tool_calls: [
                  {
                    id: "call-html",
                    type: "function",
                    function: {
                      name: "write_file",
                      arguments:
                        '{"path":"task_output.html","content":"<html><body>',
                    },
                  },
                ],
              },
            },
          ],
        }),
      }),
    );

    await expect(
      createProvider().createMessage(createRequest()),
    ).rejects.toMatchObject({
      name: "OpenAICompatibleProviderError",
      code: "MALFORMED_TOOL_ARGUMENTS",
      retryable: true,
      retryKind: "malformed_response",
    });
  });
});
