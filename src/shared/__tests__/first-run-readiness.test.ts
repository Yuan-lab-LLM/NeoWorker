import { describe, expect, it } from "vitest";
import { getFirstRunReadiness } from "../first-run-readiness";
import type { LLMSettingsData } from "../types";

const workspace = { id: "workspace-1", path: "/tmp/workspace", isTemp: true };

describe("first-run readiness", () => {
  it("treats ChatGPT subscription OAuth as the easiest ready path", () => {
    const settings: LLMSettingsData = {
      providerType: "anthropic",
      modelKey: "sonnet-4-5",
      openai: {
        authMethod: "oauth",
        accessToken: "access-token",
        refreshToken: "refresh-token",
      },
    };

    expect(getFirstRunReadiness(settings, { workspace })).toMatchObject({
      modelReady: true,
      modelPath: "chatgpt_subscription",
      providerType: "openai",
      safeStarterReady: true,
    });
  });

  it("requires both ChatGPT OAuth tokens before marking the model ready", () => {
    const settings: LLMSettingsData = {
      providerType: "openai",
      modelKey: "gpt-5.5",
      openai: {
        authMethod: "oauth",
        accessToken: "access-token",
      },
    };

    expect(getFirstRunReadiness(settings, { workspace })).toMatchObject({
      modelReady: false,
      modelPath: "missing",
      safeStarterReady: false,
    });
  });

  it("treats configured Ollama as local ready path without an API key", () => {
    const settings: LLMSettingsData = {
      providerType: "ollama",
      modelKey: "llama3.2",
      ollama: {
        baseUrl: "http://localhost:11434",
        model: "llama3.2",
      },
    };

    expect(getFirstRunReadiness(settings, { workspace })).toMatchObject({
      modelReady: true,
      modelPath: "local_ollama",
      providerType: "ollama",
    });
  });

  it("does not treat the default Anthropic route as ready without credentials", () => {
    const settings: LLMSettingsData = {
      providerType: "anthropic",
      modelKey: "sonnet-4-5",
    };

    expect(getFirstRunReadiness(settings, { workspace })).toMatchObject({
      modelReady: false,
      modelPath: "missing",
    });
  });
});
