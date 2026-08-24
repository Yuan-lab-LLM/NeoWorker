import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const readSource = (relativePath: string) =>
  readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");

describe("email provider selection layout", () => {
  it("loads component-scoped provider styles after the shared settings styles", () => {
    const source = readSource("../EmailSettings.tsx");

    expect(source).toContain('import "./email-settings.css";');
  });

  it("fills the available row with a responsive provider grid", () => {
    const styles = readSource("../email-settings.css");

    expect(styles).toMatch(
      /\.email-provider-grid\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*repeat\(auto-fit, minmax\(210px, 1fr\)\);/s,
    );
    expect(styles).toMatch(
      /\.email-provider-card\s*\{[^}]*width:\s*100%;[^}]*max-width:\s*none;/s,
    );
    expect(styles).toMatch(
      /@media \(max-width: 560px\)[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\);/,
    );
  });

  it("keeps Outlook OAuth as compact as the Gmail form", () => {
    const source = readSource("../EmailSettings.tsx");
    const styles = readSource("../email-settings.css");

    expect(source).toContain("email-provider-modal-oauth");
    expect(source).toContain('className="email-oauth-setup"');
    expect(source).not.toContain('details style={{ marginTop: "8px" }}');
    expect(source).toContain('className="email-oauth-advanced-grid"');
    expect(source).toContain(
      'className="settings-field email-oauth-connect-field"',
    );
    expect(styles).toMatch(
      /\.email-provider-modal\s*\{[^}]*max-height:\s*min\(86dvh, 760px\);/s,
    );
    expect(styles).toMatch(
      /\.email-provider-modal-oauth \.email-oauth-advanced-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1\.15fr\) minmax\(0, 0\.85fr\);/s,
    );
    expect(styles).toMatch(
      /\.email-provider-modal-oauth \.email-oauth-setup\s*\{[^}]*border-radius:\s*10px;/s,
    );
  });
});
