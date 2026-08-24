import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const headerStylesPath = fileURLToPath(
  new URL("../neoworker-page-header.css", import.meta.url),
);
const appStylesPath = fileURLToPath(
  new URL("../../styles/index.css", import.meta.url),
);
const taskStylesPath = fileURLToPath(
  new URL("../mission-control/task-workspace-june.css", import.meta.url),
);
const capabilityStylesPath = fileURLToPath(
  new URL("../capability-center.css", import.meta.url),
);
const everydayStylesPath = fileURLToPath(
  new URL("../everyday-agent.css", import.meta.url),
);

describe("Primary page header density", () => {
  it("uses one shared title bar and page header geometry", () => {
    const appStyles = readFileSync(appStylesPath, "utf8");
    const headerStyles = readFileSync(headerStylesPath, "utf8");

    expect(appStyles).toContain("--title-bar-height: 40px;");
    expect(appStyles).toContain("--neoworker-page-header-min-height: 96px;");
    expect(appStyles).toContain("--neoworker-page-header-padding-block: 18px;");
    expect(headerStyles).toContain(
      "min-height: var(--neoworker-page-header-min-height);",
    );
    expect(headerStyles).toContain(
      "padding: var(--neoworker-page-header-padding-block) clamp(28px, 3.2vw, 56px);",
    );
    expect(headerStyles).toMatch(
      /\.neoworker-page-header-icon\s*\{[^}]*width:\s*40px;[^}]*height:\s*40px;/s,
    );
    expect(headerStyles).toMatch(
      /\.neoworker-page-header-copy h1,[^{]*\{[^}]*font-size:\s*24px;/s,
    );
    expect(headerStyles).toMatch(
      /\.neoworker-page-header-copy p,[^{]*\{[^}]*font-size:\s*14px;/s,
    );
    expect(headerStyles).toMatch(
      /\.neoworker-page-header-copy\s*\{[^}]*display:\s*grid;[^}]*gap:\s*6px;/s,
    );
    expect(headerStyles).toMatch(
      /\.neoworker-page-header-copy p,[^{]*\{[^}]*margin:\s*0;/s,
    );
  });

  it("does not let feature pages compact or hide the shared masthead", () => {
    const capabilityStyles = readFileSync(capabilityStylesPath, "utf8");
    const everydayStyles = readFileSync(everydayStylesPath, "utf8");

    expect(capabilityStyles).not.toMatch(
      /\.capability-center-product-header\.neoworker-page-header\s*\{[^}]*min-height:\s*62px;/s,
    );
    expect(capabilityStyles).not.toMatch(
      /\.capability-center-product-header \.neoworker-page-header-copy > p\s*\{[^}]*display:\s*none;/s,
    );
    expect(everydayStyles).not.toMatch(
      /\.ea-console-header h1\s*\{[^}]*font-size:\s*22px;/s,
    );
  });

  it("keeps the task page on the same shared header rhythm", () => {
    const appStyles = readFileSync(appStylesPath, "utf8");
    const taskStyles = readFileSync(taskStylesPath, "utf8");

    expect(taskStyles).toMatch(
      /\.mc-command-topbar\.neoworker-page-header\s*\{[^}]*min-height:\s*var\(--neoworker-page-header-min-height\);[^}]*padding:\s*var\(--neoworker-page-header-padding-block\)\s+clamp\(28px,\s*3\.2vw,\s*56px\);/s,
    );
    expect(taskStyles).not.toMatch(
      /\.mc-command-topbar\.neoworker-page-header \.neoworker-page-header-title\s*\{/s,
    );
    expect(taskStyles).not.toMatch(
      /\.mc-command-topbar\.neoworker-page-header \.neoworker-page-header-copy > p\s*\{/s,
    );
    expect(appStyles).not.toMatch(/\.ideas-gallery-header h1\s*\{/s);
    expect(appStyles).not.toMatch(/\.ideas-gallery-header p\s*\{/s);
  });

  it("masks scrolling page content below the desktop title-bar divider", () => {
    const appStyles = readFileSync(appStylesPath, "utf8");

    expect(appStyles).toMatch(
      /\.title-bar\.with-sidebar-shell::before\s*\{[^}]*inset:\s*0 0 0 var\(--title-bar-main-start\);[^}]*background:\s*var\(--color-bg-primary\);/s,
    );
    expect(appStyles).toMatch(
      /\.title-bar\.with-sidebar-shell::after\s*\{[^}]*z-index:\s*1;/s,
    );
  });
});
