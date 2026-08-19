import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const styles = readFileSync(
  fileURLToPath(new URL("../../styles/index.css", import.meta.url)),
  "utf8",
);

describe("shared switch alignment", () => {
  it("centers the common toggle knob independently of embedding context", () => {
    const geometry = styles.slice(
      styles.indexOf("/* Shared switch geometry."),
      styles.indexOf("/* Unified switch treatment:"),
    );

    expect(geometry).toContain(".settings-toggle .toggle-slider::before");
    expect(geometry).toContain(".toggle-switch .toggle-slider::before");
    expect(geometry).toContain("top: 50%");
    expect(geometry).toContain("bottom: auto");
    expect(geometry).toContain("transform: translateY(-50%)");
    expect(geometry).toContain("transform: translate(20px, -50%)");
  });
});
