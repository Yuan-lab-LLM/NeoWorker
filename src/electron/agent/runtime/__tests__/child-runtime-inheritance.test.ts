import { describe, expect, it } from "vitest";
import { inheritChildRuntimeConfig } from "../hermes-runtime-routing";
describe("child runtime inheritance", () => {
  it("keeps experts on Hermes and the parent provider/model", () => {
    const inherited = inheritChildRuntimeConfig(
      {
        runtimePreference: "hermes",
        externalRuntime: {
          kind: "acpx",
          agent: "hermes",
          sessionMode: "persistent",
          sessionName: "root-only",
        } as Any,
        providerType: "openai-compatible",
        modelKey: "deepseek-v4-flash",
      },
      { retainMemory: false, bypassQueue: false },
    );
    expect(inherited.runtimePreference).toBe("hermes");
    expect(inherited.providerType).toBe("openai-compatible");
    expect(inherited.modelKey).toBe("deepseek-v4-flash");
    expect(inherited.externalRuntime?.agent).toBe("hermes");
    expect(inherited.externalRuntime).not.toHaveProperty("sessionName");
  });
  it("preserves explicit multi-model participant settings and delegated runtimes", () => {
    const child = {
      providerType: "anthropic" as const,
      modelKey: "claude",
      externalRuntime: { kind: "acpx" as const, agent: "claude" as const },
    };
    expect(
      inheritChildRuntimeConfig({ providerType: "openai", modelKey: "gpt" }, child),
    ).toMatchObject(child);
  });
  it("does not run a parent's provider-specific model on a different explicit child provider", () => {
    expect(
      inheritChildRuntimeConfig(
        { providerType: "openai-compatible", modelKey: "deepseek" },
        { providerType: "anthropic" },
      ).modelKey,
    ).toBeUndefined();
  });
  it("honors explicit native children and inherits parent native compatibility", () => {
    expect(
      inheritChildRuntimeConfig({ runtimePreference: "hermes" }, { runtimePreference: "native" })
        .externalRuntime,
    ).toBeUndefined();
    expect(inheritChildRuntimeConfig({ runtimePreference: "native" }).runtimePreference).toBe(
      "native",
    );
  });
});
