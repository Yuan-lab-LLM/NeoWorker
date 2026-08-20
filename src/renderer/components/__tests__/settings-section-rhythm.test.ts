import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const readStyles = (relativePath: string) =>
  readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");

describe("settings section vertical rhythm", () => {
  it("uses one top inset for top-level settings intros", () => {
    const navigationStyles = readStyles("../settings-navigation.css");

    expect(navigationStyles).toContain("--settings-section-intro-inset: 14px;");
    expect(navigationStyles).toMatch(
      /\.settings-content \.mcp-settings > \.settings-section,[\s\S]*?padding-top:\s*var\(--settings-section-intro-inset\);/,
    );
    expect(navigationStyles).toMatch(
      /\.system-security-panel \.settings-combined-section-header\s*\{[^}]*padding:\s*var\(--settings-section-intro-inset\) 0 13px;/s,
    );
  });

  it("keeps custom settings headers off the top edge", () => {
    const personalityStyles = readStyles("../personality-settings.css");
    const voiceStyles = readStyles("../voice-settings.css");
    const capabilityStyles = readStyles("../capability-center.css");
    const extensionsSource = readStyles("../ExtensionsSettings.tsx");

    expect(personalityStyles).toMatch(
      /\.personality-settings \.personality-tab-header\s*\{[^}]*padding:\s*var\(--settings-section-intro-inset, 14px\) 2px 14px;/s,
    );
    expect(voiceStyles).toMatch(
      /\.voice-settings \.voice-mode-card\s*\{[^}]*padding:\s*18px 16px;/s,
    );
    expect(capabilityStyles).toMatch(
      /\.capability-manager-content\.is-connectors[\s\S]*?\.mcp-settings[\s\S]*?> \.settings-section\s*\{[^}]*padding-top:\s*var\(--settings-section-intro-inset, 14px\);/,
    );
    expect(capabilityStyles).toMatch(
      /\.capability-manager-content\.is-connectors[\s\S]*?\.mcp-settings[\s\S]*?> \.settings-section\s*\{[^}]*padding-inline:\s*22px;/,
    );
    expect(extensionsSource).toContain(
      "padding: var(--settings-section-intro-inset, 14px) 0 24px;",
    );
  });
});
