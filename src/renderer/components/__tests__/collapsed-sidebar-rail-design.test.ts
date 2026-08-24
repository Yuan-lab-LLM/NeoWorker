import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const component = readFileSync(
  fileURLToPath(new URL("../CollapsedSidebarRail.tsx", import.meta.url)),
  "utf8",
);
const styles = readFileSync(
  fileURLToPath(
    new URL("../../styles/collapsed-sidebar-rail.css", import.meta.url),
  ),
  "utf8",
);

describe("collapsed sidebar rail design", () => {
  it("retains a compact icon rail instead of removing navigation", () => {
    expect(styles).toContain("--collapsed-sidebar-rail-width: 56px;");
    expect(component).toContain(
      'className="collapsed-sidebar-rail-navigation"',
    );
    expect(component).toContain('src="./neoworker-app-icon.png"');
  });

  it("keeps every icon action labeled and exposes the active destination", () => {
    expect(component).toContain("aria-label={label}");
    expect(component).toContain('aria-current={active ? "page" : undefined}');
    expect(component).toContain("collapsed-sidebar-rail-settings");
  });

  it("uses automation as the single top-level destination for scheduled work and runs", () => {
    expect(component).toContain('translate("sidebar.automations", "自动化")');
    expect(component).not.toContain("sidebar.missionControl");
    expect(component).not.toContain("onOpenMissionControl");
  });

  it("keeps the title bar aligned with the collapsed rail", () => {
    expect(styles).toContain(
      "--title-bar-main-start: var(--collapsed-sidebar-rail-width);",
    );
  });
});
