import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const settingsSource = readFileSync(
  fileURLToPath(new URL("../Settings.tsx", import.meta.url)),
  "utf8",
);
const identitySource = readFileSync(
  fileURLToPath(new URL("../ContactIdentitySettings.tsx", import.meta.url)),
  "utf8",
);
const styles = readFileSync(
  fileURLToPath(new URL("../tools-integrations.css", import.meta.url)),
  "utf8",
);

describe("Tools & Integrations visual system", () => {
  it("scopes the palette to the consolidated workspace", () => {
    expect(settingsSource).toContain('import "./tools-integrations.css"');
    expect(settingsSource).toContain(
      "settings-tabbed-workspace settings-tools-integrations-workspace",
    );
    expect(styles).toContain(
      ".settings-page .settings-tools-integrations-workspace",
    );
  });

  it("uses neutral surfaces and reserves accent colour for state", () => {
    expect(styles).toContain("--color-bg-elevated: #ffffff");
    expect(styles).toContain("--color-bg-secondary: #f7f8fa");
    expect(styles).toContain("--color-accent: #416b96");
    expect(styles).toContain(".cm-filter-tab--active");
    expect(styles).toContain(".builtin-tools-intro");
    expect(styles).toContain(".skills-empty");
  });

  it("uses the product action colour for enabled switches", () => {
    expect(styles).toContain(
      ".builtin-tool-toggle input:checked + .builtin-tool-toggle-slider",
    );
    expect(styles).toContain(
      ".cp-toggle input:checked + .cp-toggle-slider",
    );
    expect(styles).toContain("border-color: var(--color-action-primary)");
    expect(styles).toContain("background: var(--color-action-primary)");
  });

  it("keeps the connector search input visually owned by its outer shell", () => {
    expect(styles).toContain('.cm-search\n  input[type="search"]:focus');
    expect(styles).toContain("background: transparent");
    expect(styles).toContain("box-shadow: none");
  });

  it("gives identity surfaces stable class hooks instead of relying only on inline colours", () => {
    expect(identitySource).toContain("contact-identity-manual-panel");
    expect(identitySource).toContain("contact-identity-stat");
    expect(identitySource).toContain("contact-identity-section");
    expect(styles).toContain(".contact-identity-manual-panel");
    expect(styles).toContain("background: #ffffff !important");
  });

  it("keeps a dedicated dark-mode surface system", () => {
    expect(styles).toContain(
      ".theme-dark .settings-page .settings-tools-integrations-workspace",
    );
    expect(styles).toContain("--color-bg-elevated: #171a1f");
  });
});
