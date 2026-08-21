import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const skillHubPath = fileURLToPath(
  new URL("../SkillHubBrowser.tsx", import.meta.url),
);
const capabilityCenterPath = fileURLToPath(
  new URL("../CapabilityCenter.tsx", import.meta.url),
);
const skillsSettingsPath = fileURLToPath(
  new URL("../SkillsSettings.tsx", import.meta.url),
);
const mainContentPath = fileURLToPath(
  new URL("../MainContent/MainContent.tsx", import.meta.url),
);

describe("skill inventory refresh flow", () => {
  it("keeps the store focused on registry and ClawHub sources", () => {
    const source = readFileSync(skillHubPath, "utf8");

    expect(source).not.toContain('onClick={() => setActiveTab("installed")}');
    expect(source).not.toContain('onClick={() => setActiveTab("status")}');
    expect(source).toContain('onClick={() => setActiveTab("browse")}');
    expect(source).toContain('onClick={() => setActiveTab("clawhub")}');
  });

  it("notifies both the capability center and home composer after installs", () => {
    const skillHubSource = readFileSync(skillHubPath, "utf8");
    const capabilitySource = readFileSync(capabilityCenterPath, "utf8");
    const mainContentSource = readFileSync(mainContentPath, "utf8");

    expect(skillHubSource).toContain("notifySkillInventoryUpdated();");
    expect(capabilitySource).toContain(
      "window.addEventListener(SKILL_INVENTORY_UPDATED_EVENT, refresh);",
    );
    expect(mainContentSource).toContain(
      "window.addEventListener(SKILL_INVENTORY_UPDATED_EVENT, refresh);",
    );
  });

  it("refreshes cached bundled skills before rebuilding development Slash options", () => {
    const source = readFileSync(mainContentPath, "utf8");

    expect(source).toContain("import.meta.env.DEV");
    expect(source).toContain("window.electronAPI.reloadCustomSkills()");
    expect(source.indexOf("window.electronAPI.reloadCustomSkills()")).toBeLessThan(
      source.indexOf("window.electronAPI.listTaskSkills()"),
    );
  });

  it("makes external skill scans observable and groups imports as custom", () => {
    const settingsSource = readFileSync(skillsSettingsPath, "utf8");

    expect(settingsSource).toContain('t("skills.scan", "Scan Skills")');
    expect(settingsSource).toContain('role="status"');
    expect(settingsSource).toContain('"skills.notice.scanAdded"');
    expect(settingsSource).toContain('"skills.notice.directoryAdded"');
    expect(settingsSource).toContain('? "__custom__"');
    expect(settingsSource).toContain(
      't("skills.category.custom", "Custom")',
    );
    expect(settingsSource).toContain("countSkillsInDirectory(skills, dir)");
  });

  it("opens the parameter form when a parameterized skill is chosen from Slash", () => {
    const source = readFileSync(mainContentPath, "utf8");

    expect(source).toContain("(option.skill.parameters?.length || 0) > 0");
    expect(source).toContain('launchMode: "slash"');
    expect(source).toContain("commandName: option.commandName");
  });
});
