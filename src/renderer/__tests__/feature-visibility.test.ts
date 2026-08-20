import { describe, expect, it } from "vitest";
import {
  isInitialReleaseSettingsAvailable,
  isInitialReleaseViewAvailable,
} from "../feature-visibility";

describe("initial release product scope", () => {
  it("keeps the core work surfaces available", () => {
    expect(isInitialReleaseViewAvailable("main")).toBe(true);
    expect(isInitialReleaseViewAvailable("everydayAgent")).toBe(true);
    expect(isInitialReleaseViewAvailable("missionControl")).toBe(true);
    expect(isInitialReleaseViewAvailable("home")).toBe(true);
    expect(isInitialReleaseViewAvailable("agentTeam")).toBe(true);
    expect(isInitialReleaseViewAvailable("ideas")).toBe(true);
    expect(isInitialReleaseViewAvailable("agents")).toBe(true);
    expect(isInitialReleaseViewAvailable("agentsManage")).toBe(true);
    expect(isInitialReleaseViewAvailable("settings")).toBe(true);
  });

  it("blocks advanced product surfaces", () => {
    for (const view of ["automations", "inboxAgent", "companies"]) {
      expect(isInitialReleaseViewAvailable(view)).toBe(false);
    }
  });

  it("keeps foundational settings while blocking advanced configuration", () => {
    expect(isInitialReleaseSettingsAvailable("appearance")).toBe(true);
    expect(isInitialReleaseSettingsAvailable("aimodels")).toBe(true);
    expect(isInitialReleaseSettingsAvailable("integrations")).toBe(true);

    for (const tab of [
      "automations",
      "scheduled",
      "digitaltwins",
      "everydayAgent",
      "memory",
    ]) {
      expect(isInitialReleaseSettingsAvailable(tab)).toBe(false);
    }
  });

  it("blocks removed organization and security settings routes", () => {
    for (const tab of [
      "companies",
      "system",
      "tray",
      "policies",
      "access",
      "controlplane",
      "webaccess",
      "devices",
    ]) {
      expect(isInitialReleaseSettingsAvailable(tab)).toBe(false);
    }
  });
});
