import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const styles = readFileSync(
  fileURLToPath(new URL("../../styles/index.css", import.meta.url)),
  "utf8",
);

describe("native select chevron positioning", () => {
  it("keeps single-select chevrons inset from the right edge", () => {
    expect(styles).toMatch(
      /select:not\(\[multiple\]\):not\(\[size\]\)\s*\{[^}]*appearance:\s*none !important;[^}]*padding-inline-end:\s*44px !important;[^}]*background-position:\s*right 16px center !important;[^}]*background-size:\s*14px 14px !important;/s,
    );
  });

  it("does not add a decorative chevron to transparent select hit targets", () => {
    expect(styles).toMatch(
      /\.mc-task-row-priority-control select,\s*\.task-trace-run-switcher select\s*\{[^}]*padding:\s*0 !important;[^}]*background-image:\s*none !important;/s,
    );
  });
});
