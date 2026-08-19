import { afterEach, beforeEach, describe, expect, it } from "vitest";

// We need to re-import after manipulating process.argv, so use dynamic imports.
// However, since the module reads process.argv/env at call time (not import time),
// we can import once and test by mutating process.argv/env before each call.

import {
  hasArgFlag,
  getArgValue,
  getControlPlaneAllowedOriginsFromEnv,
  getControlPlaneBindContextFromEnv,
  isHeadlessMode,
  shouldAllowInsecureControlPlanePublicBindFromEnv,
  shouldEnableControlPlaneFromArgsOrEnv,
  shouldPrintControlPlaneTokenFromArgsOrEnv,
  shouldImportEnvSettingsFromArgsOrEnv,
  shouldTrustControlPlaneProxyFromEnv,
  shouldUseManagedDeploymentModeFromEnv,
  getEnvSettingsImportModeFromArgsOrEnv,
} from "../runtime-mode";

describe("runtime-mode", () => {
  let originalArgv: string[];
  let envSnapshot: Record<string, string | undefined>;

  beforeEach(() => {
    originalArgv = [...process.argv];
    envSnapshot = { ...process.env };
  });

  afterEach(() => {
    process.argv = originalArgv;
    // Restore env
    for (const key of Object.keys(process.env)) {
      delete process.env[key];
    }
    Object.assign(process.env, envSnapshot);
  });

  describe("hasArgFlag", () => {
    it("returns true when flag is present", () => {
      process.argv = ["node", "app", "--headless"];
      expect(hasArgFlag("--headless")).toBe(true);
    });

    it("returns false when flag is absent", () => {
      process.argv = ["node", "app"];
      expect(hasArgFlag("--headless")).toBe(false);
    });
  });

  describe("getArgValue", () => {
    it("returns value for --flag value form", () => {
      process.argv = ["node", "app", "--user-data-dir", "/tmp/test"];
      expect(getArgValue("--user-data-dir")).toBe("/tmp/test");
    });

    it("returns value for --flag=value form", () => {
      process.argv = ["node", "app", "--user-data-dir=/tmp/test"];
      expect(getArgValue("--user-data-dir")).toBe("/tmp/test");
    });

    it("returns undefined when flag is absent", () => {
      process.argv = ["node", "app"];
      expect(getArgValue("--user-data-dir")).toBeUndefined();
    });

    it("returns undefined when next arg starts with --", () => {
      process.argv = ["node", "app", "--user-data-dir", "--other"];
      expect(getArgValue("--user-data-dir")).toBeUndefined();
    });

    it("returns undefined for --flag= with empty value", () => {
      process.argv = ["node", "app", "--user-data-dir="];
      expect(getArgValue("--user-data-dir")).toBeUndefined();
    });

    it("returns undefined for --flag=--something", () => {
      process.argv = ["node", "app", "--user-data-dir=--other"];
      expect(getArgValue("--user-data-dir")).toBeUndefined();
    });
  });

  describe("isHeadlessMode", () => {
    it("returns true for --headless flag", () => {
      process.argv = ["node", "app", "--headless"];
      expect(isHeadlessMode()).toBe(true);
    });

    it("returns true for --no-ui flag", () => {
      process.argv = ["node", "app", "--no-ui"];
      expect(isHeadlessMode()).toBe(true);
    });

    it("returns true for NEOWORKER_HEADLESS=1 env", () => {
      process.argv = ["node", "app"];
      process.env.NEOWORKER_HEADLESS = "1";
      expect(isHeadlessMode()).toBe(true);
    });

    it("returns true for NEOWORKER_HEADLESS=true env", () => {
      process.argv = ["node", "app"];
      process.env.NEOWORKER_HEADLESS = "true";
      expect(isHeadlessMode()).toBe(true);
    });

    it("returns true for NEOWORKER_HEADLESS=yes env", () => {
      process.argv = ["node", "app"];
      process.env.NEOWORKER_HEADLESS = "yes";
      expect(isHeadlessMode()).toBe(true);
    });

    it("returns true for NEOWORKER_HEADLESS=on env", () => {
      process.argv = ["node", "app"];
      process.env.NEOWORKER_HEADLESS = "on";
      expect(isHeadlessMode()).toBe(true);
    });

    it("returns false for NEOWORKER_HEADLESS=0", () => {
      process.argv = ["node", "app"];
      process.env.NEOWORKER_HEADLESS = "0";
      expect(isHeadlessMode()).toBe(false);
    });

    it("returns false for NEOWORKER_HEADLESS=false", () => {
      process.argv = ["node", "app"];
      process.env.NEOWORKER_HEADLESS = "false";
      expect(isHeadlessMode()).toBe(false);
    });

    it("returns false when neither flag nor env is set", () => {
      process.argv = ["node", "app"];
      delete process.env.NEOWORKER_HEADLESS;
      expect(isHeadlessMode()).toBe(false);
    });
  });

  describe("shouldEnableControlPlaneFromArgsOrEnv", () => {
    it("returns true for --enable-control-plane flag", () => {
      process.argv = ["node", "app", "--enable-control-plane"];
      expect(shouldEnableControlPlaneFromArgsOrEnv()).toBe(true);
    });

    it("returns true for NEOWORKER_CONTROL_PLANE_ENABLE=1", () => {
      process.argv = ["node", "app"];
      process.env.NEOWORKER_CONTROL_PLANE_ENABLE = "1";
      expect(shouldEnableControlPlaneFromArgsOrEnv()).toBe(true);
    });

    it("returns false when neither is set", () => {
      process.argv = ["node", "app"];
      delete process.env.NEOWORKER_CONTROL_PLANE_ENABLE;
      expect(shouldEnableControlPlaneFromArgsOrEnv()).toBe(false);
    });
  });

  describe("shouldPrintControlPlaneTokenFromArgsOrEnv", () => {
    it("returns true for --print-control-plane-token flag", () => {
      process.argv = ["node", "app", "--print-control-plane-token"];
      expect(shouldPrintControlPlaneTokenFromArgsOrEnv()).toBe(true);
    });

    it("returns true for NEOWORKER_PRINT_CONTROL_PLANE_TOKEN=true", () => {
      process.argv = ["node", "app"];
      process.env.NEOWORKER_PRINT_CONTROL_PLANE_TOKEN = "true";
      expect(shouldPrintControlPlaneTokenFromArgsOrEnv()).toBe(true);
    });
  });

  describe("shouldImportEnvSettingsFromArgsOrEnv", () => {
    it("returns true for --import-env-settings flag", () => {
      process.argv = ["node", "app", "--import-env-settings"];
      expect(shouldImportEnvSettingsFromArgsOrEnv()).toBe(true);
    });

    it("returns true for NEOWORKER_IMPORT_ENV_SETTINGS=yes", () => {
      process.argv = ["node", "app"];
      process.env.NEOWORKER_IMPORT_ENV_SETTINGS = "yes";
      expect(shouldImportEnvSettingsFromArgsOrEnv()).toBe(true);
    });
  });

  describe("getEnvSettingsImportModeFromArgsOrEnv", () => {
    it("defaults to merge when nothing is set", () => {
      process.argv = ["node", "app"];
      delete process.env.NEOWORKER_IMPORT_ENV_SETTINGS_MODE;
      expect(getEnvSettingsImportModeFromArgsOrEnv()).toBe("merge");
    });

    it("returns overwrite for --import-env-settings-mode overwrite", () => {
      process.argv = ["node", "app", "--import-env-settings-mode", "overwrite"];
      expect(getEnvSettingsImportModeFromArgsOrEnv()).toBe("overwrite");
    });

    it("returns overwrite for NEOWORKER_IMPORT_ENV_SETTINGS_MODE=force", () => {
      process.argv = ["node", "app"];
      process.env.NEOWORKER_IMPORT_ENV_SETTINGS_MODE = "force";
      expect(getEnvSettingsImportModeFromArgsOrEnv()).toBe("overwrite");
    });

    it("returns overwrite for NEOWORKER_IMPORT_ENV_SETTINGS_MODE=replace", () => {
      process.argv = ["node", "app"];
      process.env.NEOWORKER_IMPORT_ENV_SETTINGS_MODE = "replace";
      expect(getEnvSettingsImportModeFromArgsOrEnv()).toBe("overwrite");
    });

    it("returns merge for unknown mode values", () => {
      process.argv = ["node", "app"];
      process.env.NEOWORKER_IMPORT_ENV_SETTINGS_MODE = "something_else";
      expect(getEnvSettingsImportModeFromArgsOrEnv()).toBe("merge");
    });
  });

  describe("managed Control Plane env helpers", () => {
    it("detects managed deployment mode", () => {
      process.env.NEOWORKER_MANAGED_DEPLOYMENT = "1";
      expect(shouldUseManagedDeploymentModeFromEnv()).toBe(true);
    });

    it("defaults bind context to host", () => {
      delete process.env.NEOWORKER_CONTROL_PLANE_BIND_CONTEXT;
      expect(getControlPlaneBindContextFromEnv()).toBe("host");
    });

    it("reads container bind context", () => {
      process.env.NEOWORKER_CONTROL_PLANE_BIND_CONTEXT = "container";
      expect(getControlPlaneBindContextFromEnv()).toBe("container");
    });

    it("detects insecure public bind break-glass", () => {
      process.env.NEOWORKER_CONTROL_PLANE_ALLOW_INSECURE_PUBLIC_BIND = "true";
      expect(shouldAllowInsecureControlPlanePublicBindFromEnv()).toBe(true);
    });

    it("detects trusted proxy mode", () => {
      process.env.NEOWORKER_CONTROL_PLANE_TRUST_PROXY = "yes";
      expect(shouldTrustControlPlaneProxyFromEnv()).toBe(true);
    });

    it("parses allowed origins", () => {
      process.env.NEOWORKER_CONTROL_PLANE_ALLOWED_ORIGINS =
        "https://neoworker.example.com, http://localhost:18789";
      expect(getControlPlaneAllowedOriginsFromEnv()).toEqual([
        "https://neoworker.example.com",
        "http://localhost:18789",
      ]);
    });
  });
});
