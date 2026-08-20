import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const readSource = (relativePath: string) =>
  readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");

describe("custom skills header design", () => {
  it("keeps the title and description in one vertically aligned copy group", () => {
    const source = readSource("../SkillsSettings.tsx");

    expect(source).toContain("skills-settings-heading-copy");
    expect(source).toMatch(
      /skills-settings-heading-copy[\s\S]*?<h3>[\s\S]*?<p className="settings-description">/,
    );
  });

  it("uses the shared flat action palette instead of a glossy gradient", () => {
    const styles = readSource("../skills-settings.css");

    const primaryRule = styles.match(
      /\.skills-settings \.skills-settings-header \.btn-primary\s*\{([^}]*)\}/s,
    )?.[1];
    expect(primaryRule).toContain(
      "background: var(--color-action-primary) !important;",
    );
    expect(primaryRule).toContain("color: #ffffff !important;");
    expect(styles).toMatch(
      /\.skills-settings \.skills-settings-header :is\(\.btn-primary, \.btn-secondary\)::before\s*\{[^}]*display:\s*none\s*!important;/s,
    );
    expect(styles).not.toMatch(/linear-gradient/);
  });
});
