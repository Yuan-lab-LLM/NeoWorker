import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const settingsPath = fileURLToPath(new URL("../Settings.tsx", import.meta.url));

describe("Settings guardrail entry", () => {
  it("keeps task safety limits reachable from AI & Models", () => {
    const source = readFileSync(settingsPath, "utf8");

    expect(source).toContain('() => import("./GuardrailSettings")');
    expect(source).toContain('activeAIModelsSubTab === "budget"');
    expect(source).toContain('setActiveAIModelsSubTab("budget")');
    expect(source).toContain("<GuardrailSettings />");
  });

  it("opens the safety limits directly for legacy guardrail navigation", () => {
    const source = readFileSync(settingsPath, "utf8");

    expect(source).toContain('safeInitialTab === "guardrails"');
    expect(source).toContain('? "budget"');
  });
});
