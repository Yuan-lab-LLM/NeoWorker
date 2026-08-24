import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const mainSource = readFileSync(
  fileURLToPath(new URL("../../main.tsx", import.meta.url)),
  "utf8",
);
const styles = readFileSync(
  fileURLToPath(
    new URL("../../styles/neoworker-design-system.css", import.meta.url),
  ),
  "utf8",
);
const toolsIntegrationStyles = readFileSync(
  fileURLToPath(new URL("../tools-integrations.css", import.meta.url)),
  "utf8",
);
const capabilityCenterStyles = readFileSync(
  fileURLToPath(new URL("../capability-center.css", import.meta.url)),
  "utf8",
);
const extensionsSource = readFileSync(
  fileURLToPath(new URL("../ExtensionsSettings.tsx", import.meta.url)),
  "utf8",
);
const mainContentSource = readFileSync(
  fileURLToPath(new URL("../MainContent/MainContent.tsx", import.meta.url)),
  "utf8",
);
const projectHubSource = readFileSync(
  fileURLToPath(new URL("../ProjectHubPanel.tsx", import.meta.url)),
  "utf8",
);

describe("NeoWorker global DESIGN.md system", () => {
  it("loads DM Sans and applies the global layer after legacy styles", () => {
    expect(mainSource).toContain('import "@fontsource/dm-sans/400.css"');
    expect(mainSource).toContain('import "@fontsource/dm-sans/700.css"');

    const legacyIndex = mainSource.indexOf('import "./styles/index.css"');
    const designIndex = mainSource.indexOf(
      'import "./styles/neoworker-design-system.css"',
    );
    expect(legacyIndex).toBeGreaterThan(-1);
    expect(designIndex).toBeGreaterThan(legacyIndex);
  });

  it("maps the DESIGN.md neutral palette, spacing, and proportions", () => {
    expect(styles).toContain("--cw-canvas: #ffffff;");
    expect(styles).toContain("--cw-surface: #f7f8fa;");
    expect(styles).toContain("--cw-hairline: #e5e7eb;");
    expect(styles).toContain("--cw-ink: #0a0a0a;");
    expect(styles).toContain("--cw-space-4: 16px;");
    expect(styles).toContain("--cw-radius-xl: 16px;");
    expect(styles).toContain("min-height: 40px;");
  });

  it("reserves NeoWorker blue for primary actions and selected state", () => {
    expect(styles).toContain("--cw-brand: #1e8df6;");
    expect(styles).toContain(".sidebar-nav-item.active");
    expect(styles).toContain("background: var(--color-action-primary);");
    expect(styles).toContain("background: var(--color-accent-subtle);");
  });

  it("keeps scoped settings primary buttons on the same NeoWorker blue", () => {
    expect(toolsIntegrationStyles).toContain(
      "--color-action-primary: #1e8df6;",
    );
    expect(toolsIntegrationStyles).toContain("--ti-accent: #1e8df6;");
    expect(toolsIntegrationStyles).not.toContain(
      "--color-action-primary: #315f91;",
    );
    expect(capabilityCenterStyles).toContain(
      "background: var(--color-action-primary);",
    );
    expect(extensionsSource).toContain(
      "background: var(--color-action-primary);",
    );
  });

  it("covers the app shell and the core project, task, ideas, and capability surfaces", () => {
    expect(styles).toContain("/* Application shell */");
    expect(styles).toContain("Product-page contracts");
    expect(styles).toContain("Inspiration is a working library");
    expect(styles).toContain("Capability Center: bright working cards");
    expect(styles).toContain("Task surfaces share the same flat container");
    expect(styles).toContain(".project-hub-summary");
    expect(styles).toContain(".ideas-card");
    expect(styles).toContain(".skill-scene-card");
    expect(styles).toContain(".mc-task-summary-card");
  });

  it("keeps capability catalog imagery clear instead of washing it into gray", () => {
    expect(styles).toContain(
      "filter: saturate(0.82) contrast(1.02) brightness(1.03);",
    );
    expect(styles).toContain("opacity: 0.94;");
    expect(styles).toContain("background: #ffffff;");
    expect(styles).not.toContain("filter: saturate(0.28) contrast(0.96);");
    expect(styles).not.toContain("opacity: 0.68;");
  });

  it("uses restrained editorial artwork only at high-value entry and empty-state moments", () => {
    expect(mainContentSource).toContain("./neoworker-home-transparent.png");
    expect(mainContentSource).toContain("./neoworker-home-transparent.png");
    expect(projectHubSource).toContain("/home/project-empty-state.webp");
    expect(styles).toContain('url("/capability/research-featured-3d.webp")');
    expect(styles).toContain('url("/capability/connectors-hero-3d.webp")');
  });

  it("keeps the Ideas gallery colorful enough to scan without tinting the product shell", () => {
    expect(styles).toContain("--idea-accent-soft: #edf5fc;");
    expect(styles).toContain(
      "filter: saturate(0.76) contrast(0.98) brightness(1.02);",
    );
    expect(styles).toContain("background: var(--idea-accent-soft);");
    expect(styles).not.toContain("filter: grayscale(0.45);");
  });

  it("extends the visual contract to generated files and the task inspector", () => {
    expect(styles).toContain("Generated files are utility rows");
    expect(styles).toContain(".document-artifact-card");
    expect(styles).toContain(".presentation-artifact-card");
    expect(styles).toContain(".spreadsheet-artifact-card");
    expect(styles).toContain(".web-artifact-card");
    expect(styles).toContain(".right-panel.right-panel-v2");
    expect(styles).toContain(".right-panel-top-section");
  });

  it("keeps compact controls, nested sidebar labels, and icons on one centerline", () => {
    expect(styles).toContain("Control alignment contract");
    expect(styles).toContain("> .cli-btn-text");
    expect(styles).toContain(".cli-new-task-modern-label");
    expect(styles).toContain(".skill-scene-view-all");
    expect(styles).toContain("align-items: center;");
    expect(styles).toContain("line-height: 0;");
  });

  it("keeps decorative motion and glow out of the product surface", () => {
    expect(styles).toContain("--gradient-glossy: none;");
    expect(styles).toContain("--gradient-shine: none;");
    expect(styles).toContain("@media (prefers-reduced-motion: reduce)");
    expect(styles).toContain("transition-duration: 0.01ms !important;");
  });
});
