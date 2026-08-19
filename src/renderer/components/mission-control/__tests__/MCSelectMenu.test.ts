import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const componentPath = fileURLToPath(
  new URL("../MCSelectMenu.tsx", import.meta.url),
);
const stylesPath = fileURLToPath(
  new URL("../task-workspace-june.css", import.meta.url),
);

describe("MCSelectMenu portal surface", () => {
  it("keeps every task-page menu above rows and other application overlays", () => {
    const component = readFileSync(componentPath, "utf8");
    const styles = readFileSync(stylesPath, "utf8");

    expect(component).toContain("zIndex: 2_147_483_000");
    expect(component).toContain(
      'backgroundColor: "var(--mc-select-menu-surface, #ffffff)"',
    );
    expect(styles).toMatch(/z-index:\s*2147483000\s*!important/);
    expect(styles).toContain("contain: layout paint");
  });

  it("uses opaque light and dark portal surfaces", () => {
    const styles = readFileSync(stylesPath, "utf8");

    expect(styles).toContain("--mc-select-menu-surface: #ffffff");
    expect(styles).toContain("--mc-select-menu-surface: #1f1f1f");
    expect(styles).toContain("background-color: #ffffff !important");
    expect(styles).toContain("background-color: #1f1f1f !important");
  });
});
