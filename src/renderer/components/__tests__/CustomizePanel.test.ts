import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const componentPath = fileURLToPath(
  new URL("../CustomizePanel.tsx", import.meta.url),
);

describe("CustomizePanel styling", () => {
  it("keeps Feature Packs aligned with the compact settings visual language", () => {
    const source = readFileSync(componentPath, "utf8");

    expect(source).toContain("Compact product-settings treatment.");
    expect(source).toContain("grid-template-columns: 252px minmax(0, 860px)");
    expect(source).toContain(
      "border-right: 1px solid var(--color-border-subtle)",
    );
    expect(source).toContain("border-bottom: 2px solid transparent");
    expect(source).toContain("animation: none");
    expect(source).toContain("box-shadow: none");
  });

  it("supports a management-only settings surface without discovery commands", () => {
    const source = readFileSync(componentPath, "utf8");

    expect(source).toContain("managementOnly?: boolean");
    expect(source).toContain('!managementOnly && detailTab === "commands"');
    expect(source).toContain("!managementOnly && activePack.tryAsking");
    expect(source).toContain('managementOnly || detailTab === "skills"');
  });
});
