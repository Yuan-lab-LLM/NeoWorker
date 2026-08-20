import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const componentPath = fileURLToPath(
  new URL("../PersonalitySettings.tsx", import.meta.url),
);
const traitsPath = fileURLToPath(
  new URL("../personality/PersonalityTraitsTab.tsx", import.meta.url),
);

describe("Personality settings visible surface", () => {
  it("hides instructions, style, and every chat-command panel", () => {
    const source = readFileSync(componentPath, "utf8");

    expect(source).not.toContain('id: "instructions"');
    expect(source).not.toContain('id: "style"');
    expect(source).not.toContain("PersonalityInstructionsTab");
    expect(source).not.toContain("PersonalityStyleTab");
    expect(source).not.toContain("personality.chatCommands");
    expect(source).not.toContain("command-examples");
  });

  it("combines identity, memory, and personality into one page", () => {
    const source = readFileSync(componentPath, "utf8");
    const identityPosition = source.indexOf("<PersonalityIdentityTab");
    const memoryPosition = source.indexOf("<PersonalityMemoryTab");
    const personalityPosition = source.indexOf("<PersonalityTraitsTab");

    expect(source).not.toContain('id: "identity"');
    expect(source).not.toContain('id: "memory"');
    expect(identityPosition).toBeGreaterThan(-1);
    expect(memoryPosition).toBeGreaterThan(identityPosition);
    expect(personalityPosition).toBeGreaterThan(memoryPosition);
  });

  it("hides the optional persona overlay", () => {
    const source = readFileSync(traitsPath, "utf8");

    expect(source).not.toContain("persona-overlay-collapse");
    expect(source).not.toContain("personality.traits.personaOverlay");
  });

  it("keeps the settings surface mounted during save-triggered refreshes", () => {
    const source = readFileSync(componentPath, "utf8");

    expect(source).toContain("showLoading: false");
    expect(source).toContain("if (showLoading) setLoading(true)");
    expect(source).toContain("if (showLoading) setLoading(false)");
  });

  it("renders presets and traits as selectable compact control groups", () => {
    const source = readFileSync(traitsPath, "utf8");

    expect(source).toContain('aria-pressed={active}');
    expect(source).toContain('className="trait-grid"');
    expect(source).toContain('className="trait-range-labels"');
    expect(source).toContain('"--trait-value"');
  });
});
