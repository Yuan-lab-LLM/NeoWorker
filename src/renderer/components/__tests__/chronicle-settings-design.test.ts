import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const componentPath = fileURLToPath(
  new URL("../ChronicleSettings.tsx", import.meta.url),
);
const stylesPath = fileURLToPath(
  new URL("../right-panel.css", import.meta.url),
);

describe("Chronicle settings design", () => {
  it("keeps the visual refresh scoped to Chronicle", () => {
    const component = readFileSync(componentPath, "utf8");

    expect(component).toContain(
      'className="computer-use-settings chronicle-settings"',
    );
    expect(component).toContain(
      'className="settings-grid chronicle-settings-grid"',
    );
    expect(
      component.match(/className="chronicle-settings-select"/g),
    ).toHaveLength(4);
  });

  it("uses compact neutral form proportions with an inset chevron", () => {
    const styles = readFileSync(stylesPath, "utf8");

    expect(styles).toMatch(
      /\.chronicle-settings-select select\s*\{[^}]*height:\s*40px;[^}]*padding:\s*0 42px 0 14px;[^}]*appearance:\s*none;[^}]*border-radius:\s*8px;[^}]*box-shadow:\s*none;/s,
    );
    expect(styles).toMatch(
      /\.chronicle-settings-select > svg\s*\{[^}]*right:\s*14px;[^}]*pointer-events:\s*none;/s,
    );
  });

  it("keeps secondary controls flat and reserves blue for focus state", () => {
    const styles = readFileSync(stylesPath, "utf8");

    expect(styles).toMatch(
      /\.chronicle-settings \.button-secondary::before\s*\{[^}]*display:\s*none;/s,
    );
    expect(styles).toMatch(
      /\.chronicle-settings-select select:focus-visible\s*\{[^}]*border-color:\s*var\(--chronicle-accent\);/s,
    );
  });
});
