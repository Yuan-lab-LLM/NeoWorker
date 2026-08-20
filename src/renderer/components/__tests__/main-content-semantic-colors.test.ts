import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const mainContentCss = readFileSync(
  fileURLToPath(new URL("../MainContent/main-content.css", import.meta.url)),
  "utf8",
);

const globalCss = readFileSync(
  fileURLToPath(new URL("../../styles/index.css", import.meta.url)),
  "utf8",
);

describe("main content semantic color system", () => {
  it("uses restrained light-theme success and error tokens", () => {
    expect(globalCss).toMatch(
      /\.theme-light\s*\{[\s\S]*--color-success:\s*#28785a;[\s\S]*--color-error:\s*#b44b4b;/,
    );
  });

  it("keeps action states compact without the old gray capsule", () => {
    expect(mainContentCss).toMatch(
      /\.action-block-status\s*\{[\s\S]*background:\s*transparent;[\s\S]*border-radius:\s*4px;/,
    );
    expect(mainContentCss).toMatch(
      /\.action-block-status\.status-done\s*\{[\s\S]*var\(--color-success[\s\S]*6%, transparent\)/,
    );
    expect(mainContentCss).toMatch(
      /\.action-block-status\.status-failed,[\s\S]*6%, transparent\)/,
    );
  });

  it("uses a white document surface and underline tab treatment for LaTeX previews", () => {
    expect(mainContentCss).toMatch(
      /\.latex-artifact-workbench\s*\{[\s\S]*background:\s*var\(--color-bg-primary\);/,
    );
    expect(mainContentCss).toMatch(
      /\.latex-artifact-tab\.active::after\s*\{[\s\S]*height:\s*2px;[\s\S]*background:\s*color-mix/,
    );
    expect(mainContentCss).toMatch(
      /\.latex-artifact-summary\s*\{[\s\S]*background:\s*var\(--color-bg-primary\);/,
    );
  });

  it("renders diff rows as low-contrast washes with a semantic edge", () => {
    expect(mainContentCss).toMatch(
      /\.diff-removed\s*\{[\s\S]*var\(--color-error\) 5%[\s\S]*inset 2px 0/,
    );
    expect(mainContentCss).toMatch(
      /\.diff-added\s*\{[\s\S]*var\(--color-success\) 5%[\s\S]*inset 2px 0/,
    );
  });
});
