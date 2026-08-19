import { describe, expect, it } from "vitest";
import {
  getKimiEndpointCandidates,
  KIMI_CHINA_BASE_URL,
  KIMI_INTERNATIONAL_BASE_URL,
  normalizeKimiApiKey,
  selectPreferredKimiModel,
} from "../kimi";

describe("Kimi setup helpers", () => {
  it("accepts a key pasted with an accidental Bearer prefix", () => {
    expect(normalizeKimiApiKey("  Bearer sk-example  ")).toBe("sk-example");
  });

  it("tries the other official region after the saved official endpoint", () => {
    expect(getKimiEndpointCandidates(KIMI_INTERNATIONAL_BASE_URL)).toEqual([
      KIMI_INTERNATIONAL_BASE_URL,
      KIMI_CHINA_BASE_URL,
    ]);
  });

  it("does not replace an explicit custom endpoint", () => {
    expect(getKimiEndpointCandidates("https://proxy.example.com/v1/")).toEqual([
      "https://proxy.example.com/v1",
    ]);
  });

  it("keeps an available selection and otherwise prefers Kimi K3", () => {
    const models = [
      { id: "kimi-k2.5", name: "Kimi K2.5" },
      { id: "kimi-k3", name: "Kimi K3" },
    ];
    expect(selectPreferredKimiModel(models, "kimi-k2.5")).toBe("kimi-k2.5");
    expect(selectPreferredKimiModel(models, "missing-model")).toBe("kimi-k3");
  });
});
