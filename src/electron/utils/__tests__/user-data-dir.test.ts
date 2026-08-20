import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Don't mock electron globally - the module uses try/catch for require('electron')
// so it will naturally fall through to the $HOME/.neoworker fallback in test env.

describe("getUserDataDir", () => {
  let originalArgv: string[];
  let envSnapshot: Record<string, string | undefined>;

  beforeEach(() => {
    originalArgv = [...process.argv];
    envSnapshot = { ...process.env };
    // Reset module registry so each test gets a fresh import
    vi.resetModules();
  });

  afterEach(() => {
    process.argv = originalArgv;
    for (const key of Object.keys(process.env)) {
      delete process.env[key];
    }
    Object.assign(process.env, envSnapshot);
  });

  it("returns NEOWORKER_USER_DATA_DIR when env var is set", async () => {
    process.env.NEOWORKER_USER_DATA_DIR = "/custom/data";
    process.argv = ["node", "app"];
    const { getUserDataDir } = await import("../user-data-dir");
    expect(getUserDataDir()).toBe("/custom/data");
  });

  it("promotes the legacy NOVAREADY_USER_DATA_DIR override", async () => {
    delete process.env.NEOWORKER_USER_DATA_DIR;
    process.env.NOVAREADY_USER_DATA_DIR = "/legacy/novaready-data";
    process.argv = ["node", "app"];
    const { getUserDataDir } = await import("../user-data-dir");
    expect(getUserDataDir()).toBe("/legacy/novaready-data");
  });

  it("expands tilde in NEOWORKER_USER_DATA_DIR", async () => {
    process.env.NEOWORKER_USER_DATA_DIR = "~/neoworker-data";
    process.argv = ["node", "app"];
    const { getUserDataDir } = await import("../user-data-dir");
    expect(getUserDataDir()).toBe(path.join(os.homedir(), "neoworker-data"));
  });

  it("expands bare tilde in NEOWORKER_USER_DATA_DIR", async () => {
    process.env.NEOWORKER_USER_DATA_DIR = "~";
    process.argv = ["node", "app"];
    const { getUserDataDir } = await import("../user-data-dir");
    expect(getUserDataDir()).toBe(os.homedir());
  });

  it("ignores empty NEOWORKER_USER_DATA_DIR", async () => {
    process.env.NEOWORKER_USER_DATA_DIR = "   ";
    process.argv = ["node", "app"];
    const { getUserDataDir } = await import("../user-data-dir");
    const result = getUserDataDir();
    expect(result).not.toBe("   ");
  });

  it("returns --user-data-dir value from argv (space form)", async () => {
    delete process.env.NEOWORKER_USER_DATA_DIR;
    process.argv = ["node", "app", "--user-data-dir", "/from/argv"];
    const { getUserDataDir } = await import("../user-data-dir");
    expect(getUserDataDir()).toBe("/from/argv");
  });

  it("returns --user-data-dir value from argv (equals form)", async () => {
    delete process.env.NEOWORKER_USER_DATA_DIR;
    process.argv = ["node", "app", "--user-data-dir=/from/argv"];
    const { getUserDataDir } = await import("../user-data-dir");
    expect(getUserDataDir()).toBe("/from/argv");
  });

  it("expands tilde in --user-data-dir", async () => {
    delete process.env.NEOWORKER_USER_DATA_DIR;
    process.argv = ["node", "app", "--user-data-dir", "~/my-data"];
    const { getUserDataDir } = await import("../user-data-dir");
    expect(getUserDataDir()).toBe(path.join(os.homedir(), "my-data"));
  });

  it("falls back to $HOME/.neoworker when no overrides and no Electron", async () => {
    delete process.env.NEOWORKER_USER_DATA_DIR;
    process.argv = ["node", "app"];
    const { getUserDataDir } = await import("../user-data-dir");
    const result = getUserDataDir();
    // In test env (no Electron runtime), it should fall through to $HOME/.neoworker
    const expected = path.join(os.homedir(), ".neoworker");
    expect(result).toBe(expected);
  });

  it("uses stable neoworker Electron userData regardless of display app name", async () => {
    const { getStableElectronUserDataRoot } = await import("../user-data-dir");
    expect(getStableElectronUserDataRoot("/Users/test/Library/Application Support")).toBe(
      "/Users/test/Library/Application Support/neoworker",
    );
  });

  it("env var takes priority over argv", async () => {
    process.env.NEOWORKER_USER_DATA_DIR = "/from/env";
    process.argv = ["node", "app", "--user-data-dir", "/from/argv"];
    const { getUserDataDir } = await import("../user-data-dir");
    expect(getUserDataDir()).toBe("/from/env");
  });

  it("scopes named profile paths under profiles directory", async () => {
    process.env.NEOWORKER_USER_DATA_DIR = "/custom/data";
    process.env.NEOWORKER_PROFILE = "Work Alpha";
    process.argv = ["node", "app"];
    const { getUserDataDir, getActiveProfileId } = await import("../user-data-dir");
    expect(getActiveProfileId()).toBe("work-alpha");
    expect(getUserDataDir()).toBe("/custom/data/profiles/work-alpha");
  });

  it("keeps default profile on the root userData path", async () => {
    process.env.NEOWORKER_USER_DATA_DIR = "/custom/data";
    process.env.NEOWORKER_PROFILE = "default";
    process.argv = ["node", "app"];
    const { getUserDataDir, getActiveProfileId } = await import("../user-data-dir");
    expect(getActiveProfileId()).toBe("default");
    expect(getUserDataDir()).toBe("/custom/data");
  });

  it("reads profile from argv when env is absent", async () => {
    process.env.NEOWORKER_USER_DATA_DIR = "/custom/data";
    delete process.env.NEOWORKER_PROFILE;
    process.argv = ["node", "app", "--profile", "qa-profile"];
    const { getUserDataDir, getActiveProfileId } = await import("../user-data-dir");
    expect(getActiveProfileId()).toBe("qa-profile");
    expect(getUserDataDir()).toBe("/custom/data/profiles/qa-profile");
  });

  it("prefers argv profile over env profile", async () => {
    process.env.NEOWORKER_USER_DATA_DIR = "/custom/data";
    process.env.NEOWORKER_PROFILE = "ops";
    process.argv = ["node", "app", "--profile", "qa-profile"];
    const { getUserDataDir, getActiveProfileId } = await import("../user-data-dir");
    expect(getActiveProfileId()).toBe("qa-profile");
    expect(getUserDataDir()).toBe("/custom/data/profiles/qa-profile");
  });
});
