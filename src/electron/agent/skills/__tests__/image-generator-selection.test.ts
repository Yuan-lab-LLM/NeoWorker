import { describe, expect, it } from "vitest";
import { selectImageProviderOrder } from "../image-generator";

describe("selectImageProviderOrder", () => {
  it("defaults to the best configured image provider even when the active chat model differs", () => {
    const order = selectImageProviderOrder({
      settings: {
        providerType: "openai",
        modelKey: "x",
        gemini: { apiKey: "g" },
        openai: { apiKey: "o" },
        azure: {
          apiKey: "a",
          endpoint: "https://example.openai.azure.com",
          deployments: ["gpt-image-1.5"],
        },
      } as Any,
      prompt: "make a poster",
      providerOverride: "auto",
    });

    expect(order[0]?.provider).toBe("azure");
    expect(order.map((e) => e.provider)).toContain("gemini");
    expect(order.map((e) => e.provider)).toContain("azure");
  });

  it("switches to openai when prompt mentions gpt-image", () => {
    const order = selectImageProviderOrder({
      settings: {
        providerType: "gemini",
        modelKey: "x",
        gemini: { apiKey: "g" },
        openai: { apiKey: "o" },
        azure: {
          apiKey: "a",
          endpoint: "https://example.openai.azure.com",
          deployments: ["gpt-image-1.5"],
        },
      } as Any,
      prompt: "use gpt-image-1.5 for this",
      providerOverride: "auto",
    });

    expect(order[0]?.provider).toBe("azure");
  });

  it("switches to azure when provider override is azure", () => {
    const order = selectImageProviderOrder({
      settings: {
        providerType: "openai",
        modelKey: "x",
        gemini: { apiKey: "g" },
        openai: { apiKey: "o" },
        azure: {
          apiKey: "a",
          endpoint: "https://example.openai.azure.com",
          deployments: ["img-deploy"],
        },
      } as Any,
      prompt: "make a poster",
      providerOverride: "azure",
    });

    expect(order[0]?.provider).toBe("azure");
  });

  it("includes openai-codex when OpenAI OAuth is configured", () => {
    const order = selectImageProviderOrder({
      settings: {
        providerType: "openai",
        modelKey: "x",
        openai: {
          accessToken: "oauth-access-token",
          refreshToken: "oauth-refresh-token",
          authMethod: "oauth",
        },
        openrouter: { apiKey: "or" },
      } as Any,
      prompt: "make a poster",
      providerOverride: "auto",
    });

    expect(order[0]?.provider).toBe("openai-codex");
    expect(order[0]?.modelPreset).toBe("gpt-image-2");
    expect(order.map((entry) => entry.provider)).toContain("openrouter");
  });

  it("prefers openai-codex for automatic routing when OpenAI OAuth and API key auth are both configured", () => {
    const order = selectImageProviderOrder({
      settings: {
        providerType: "openai",
        modelKey: "x",
        openai: {
          apiKey: "openai-api-key",
          accessToken: "oauth-access-token",
          refreshToken: "oauth-refresh-token",
          authMethod: "oauth",
        },
      } as Any,
      prompt: "make a poster",
      providerOverride: "auto",
    });

    expect(order[0]).toEqual({ provider: "openai-codex", modelPreset: "gpt-image-2" });
    expect(order.map((entry) => entry.provider)).toContain("openai");
  });

  it("honors an explicit OpenAI API image provider when OpenAI OAuth is the active chat auth", () => {
    const order = selectImageProviderOrder({
      settings: {
        providerType: "openai",
        modelKey: "x",
        openai: {
          apiKey: "openai-api-key",
          accessToken: "oauth-access-token",
          refreshToken: "oauth-refresh-token",
          authMethod: "oauth",
        },
        imageGeneration: {
          defaultProvider: "openai",
          defaultModel: "gpt-image-2",
        },
      } as Any,
      prompt: "make a poster",
      providerOverride: "auto",
    });

    expect(order[0]).toEqual({ provider: "openai", modelPreset: "gpt-image-2" });
  });

  it("upgrades an explicit OpenAI OAuth image provider to the current ChatGPT image model", () => {
    const order = selectImageProviderOrder({
      settings: {
        providerType: "openai",
        modelKey: "x",
        openai: {
          apiKey: "openai-api-key",
          accessToken: "oauth-access-token",
          refreshToken: "oauth-refresh-token",
          authMethod: "oauth",
        },
        imageGeneration: {
          defaultProvider: "openai-codex",
          defaultModel: "gpt-image-1.5",
        },
      } as Any,
      prompt: "make a poster",
      providerOverride: "auto",
    });

    expect(order[0]).toEqual({ provider: "openai-codex", modelPreset: "gpt-image-2" });
  });
});
