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
      /\.skills-settings\s+\.skills-settings-header\s+:is\(\.btn-primary, \.btn-secondary\)::before\s*\{[^}]*display:\s*none\s*!important;/s,
    );
    expect(styles).not.toMatch(/linear-gradient/);
  });

  it("keeps connected directories compact and uses platform-neutral wording", () => {
    const source = readSource("../SkillsSettings.tsx");
    const styles = readSource("../skills-settings.css");

    expect(source).toContain("skills-external-directory-summary");
    expect(source).toContain("aria-expanded={areExternalDirectoriesExpanded}");
    expect(source).toContain('t("skills.openFolder", "Open Folder")');
    expect(source).not.toContain("Open in Finder");
    expect(styles).toMatch(
      /\.skills-settings \.skills-external-directory-summary\s*\{[^}]*min-height:\s*42px;/s,
    );
  });
});
