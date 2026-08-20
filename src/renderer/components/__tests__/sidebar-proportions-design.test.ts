import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const styles = readFileSync(
  fileURLToPath(
    new URL("../../styles/neoworker-design-system.css", import.meta.url),
  ),
  "utf8",
);

describe("NeoWorker sidebar proportions", () => {
  it("keeps a balanced desktop rail without nested navigation gutters", () => {
    expect(styles).toContain("--sidebar-width: 264px;");
    expect(styles).toMatch(
      /\.sidebar-top-actions-row,\s*\n\.theme-light\.visual-oblivion \.sidebar-nav-group \{\s*\n  padding-inline: 0;/,
    );
  });

  it("uses compact rows and a restrained icon-to-label gap", () => {
    expect(styles).toContain("min-height: 34px;\n  height: 34px;");
    expect(styles).toContain("min-height: 32px;\n  height: 32px;");
    expect(styles).toContain("gap: var(--cw-space-2);");
  });
});
