import { describe, expect, it } from "vitest";
import {
  applyLegacyEnvironmentAliases,
  LEGACY_PLUGIN_MANIFEST_FILENAMES,
  LEGACY_PRODUCT_DISPLAY_NAMES,
  LEGACY_TASK_DEEPLINK_PROTOCOLS,
  LEGACY_TEMP_WORKSPACE_ROOT_DIR_NAMES,
  LEGACY_USER_DATA_LAYOUTS,
  LEGACY_WORKSPACE_KIT_DIRECTORIES,
} from "../legacy-brand-compat";

describe("NovaReady to NeoWorker compatibility", () => {
  it("recognizes every persisted NovaReady namespace", () => {
    expect(LEGACY_USER_DATA_LAYOUTS[0]).toMatchObject({
      directoryNames: ["novaready", "NovaReady"],
      databaseNames: ["novaready.db", "cowork-os.db"],
    });
    expect(LEGACY_WORKSPACE_KIT_DIRECTORIES).toContain(".novaready");
    expect(LEGACY_PLUGIN_MANIFEST_FILENAMES).toContain("novaready.plugin.json");
    expect(LEGACY_PRODUCT_DISPLAY_NAMES).toContain("NovaReady");
    expect(LEGACY_TASK_DEEPLINK_PROTOCOLS).toContain("novaready");
    expect(LEGACY_TEMP_WORKSPACE_ROOT_DIR_NAMES).toContain("novaready-temp");
  });

  it("promotes NOVAREADY_ environment variables without overriding NeoWorker values", () => {
    const env = {
      NOVAREADY_USER_DATA_DIR: "/legacy",
      NOVAREADY_PROFILE: "legacy-profile",
      NEOWORKER_PROFILE: "current-profile",
    } as NodeJS.ProcessEnv;

    expect(applyLegacyEnvironmentAliases(env)).toBe(1);
    expect(env.NEOWORKER_USER_DATA_DIR).toBe("/legacy");
    expect(env.NEOWORKER_PROFILE).toBe("current-profile");
  });

});
