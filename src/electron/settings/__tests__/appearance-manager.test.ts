import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppearanceSettings } from "../../../shared/types";

const mocks = vi.hoisted(() => {
  let storedSettings: Partial<AppearanceSettings> | undefined;
  let loadStatus:
    | "success"
    | "not_found"
    | "decryption_failed"
    | "checksum_mismatch"
    | "os_encryption_unavailable"
    | undefined;
  let userDataDir = "";

  return {
    get storedSettings() {
      return storedSettings;
    },
    set storedSettings(value: Partial<AppearanceSettings> | undefined) {
      storedSettings = value;
    },
    get loadStatus() {
      return loadStatus;
    },
    set loadStatus(value) {
      loadStatus = value;
    },
    repositorySave: vi.fn().mockImplementation((_key: string, settings: unknown) => {
      storedSettings = settings as Partial<AppearanceSettings>;
    }),
    repositoryLoad: vi.fn().mockImplementation(() => storedSettings),
    repositoryLoadWithStatus: vi.fn().mockImplementation(() => {
      const status = loadStatus ?? (storedSettings === undefined ? "not_found" : "success");
      return status === "success"
        ? { status, data: storedSettings }
        : { status, error: status === "not_found" ? undefined : "test failure" };
    }),
    repositoryExists: vi.fn().mockImplementation(() => storedSettings !== undefined),
    get userDataDir() {
      return userDataDir;
    },
    set userDataDir(value: string) {
      userDataDir = value;
    },
  };
});

vi.mock("../../utils/user-data-dir", () => ({
  getUserDataDir: () => mocks.userDataDir,
}));

vi.mock("../../database/SecureSettingsRepository", () => ({
  SecureSettingsRepository: {
    isInitialized: vi.fn().mockReturnValue(true),
    getInstance: vi.fn().mockReturnValue({
      save: mocks.repositorySave,
      load: mocks.repositoryLoad,
      loadWithStatus: mocks.repositoryLoadWithStatus,
      exists: mocks.repositoryExists,
    }),
  },
}));

import { AppearanceManager } from "../appearance-manager";

describe("AppearanceManager settings", () => {
  let originalCwd: string;
  let originalNodeEnv: string | undefined;
  let tempDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.storedSettings = undefined;
    mocks.loadStatus = undefined;
    AppearanceManager.clearCache();
    (AppearanceManager as unknown as { migrationCompleted: boolean }).migrationCompleted = false;

    originalCwd = process.cwd();
    originalNodeEnv = process.env.NODE_ENV;
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "neoworker-appearance-"));
    mocks.userDataDir = tempDir;
    process.chdir(tempDir);
    process.env.NODE_ENV = "development";
  });

  afterEach(() => {
    process.chdir(originalCwd);
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
    AppearanceManager.clearCache();
  });

  it("repairs a stale dev log sidecar when loading stored settings", () => {
    const sidecarPath = path.join(tempDir, ".neoworker", "dev-log-settings.json");
    fs.mkdirSync(path.dirname(sidecarPath), { recursive: true });
    fs.writeFileSync(
      sidecarPath,
      JSON.stringify({ captureEnabled: false, updatedAt: "stale" }),
      "utf-8",
    );
    mocks.storedSettings = {
      themeMode: "system",
      devRunLoggingEnabled: true,
    };

    const settings = AppearanceManager.loadSettings();

    expect(settings.devRunLoggingEnabled).toBe(true);
    expect(JSON.parse(fs.readFileSync(sidecarPath, "utf-8"))).toMatchObject({
      captureEnabled: true,
    });
  });

  it("keeps the dev log sidecar in sync when returning cached settings", () => {
    const sidecarPath = path.join(tempDir, ".neoworker", "dev-log-settings.json");
    mocks.storedSettings = {
      themeMode: "system",
      devRunLoggingEnabled: true,
    };

    AppearanceManager.loadSettings();
    fs.writeFileSync(
      sidecarPath,
      JSON.stringify({ captureEnabled: false, updatedAt: "stale" }),
      "utf-8",
    );
    AppearanceManager.loadSettings();

    expect(JSON.parse(fs.readFileSync(sidecarPath, "utf-8"))).toMatchObject({
      captureEnabled: true,
    });
  });

  it("shows detailed execution history by default", () => {
    const settings = AppearanceManager.loadSettings();

    expect(settings.timelineVerbosity).toBe("verbose");
    expect(settings.timelineVerbosityConfigured).toBe(false);
  });

  it("removes the retired transparency preference from stored profiles", () => {
    mocks.storedSettings = {
      themeMode: "system",
      transparencyEffectsEnabled: true,
    } as Partial<AppearanceSettings> & {
      transparencyEffectsEnabled: boolean;
    };

    const settings = AppearanceManager.loadSettings();

    expect(settings).not.toHaveProperty("transparencyEffectsEnabled");
    expect(mocks.repositorySave).toHaveBeenCalledWith(
      "appearance",
      expect.not.objectContaining({ transparencyEffectsEnabled: true }),
    );
  });

  it("removes retired home widget preferences from stored profiles", () => {
    mocks.storedSettings = {
      themeMode: "system",
      homeResearchVaultEnabled: true,
      homeNextActionsEnabled: true,
    } as Partial<AppearanceSettings> & {
      homeResearchVaultEnabled: boolean;
      homeNextActionsEnabled: boolean;
    };

    const settings = AppearanceManager.loadSettings();

    expect(settings).not.toHaveProperty("homeResearchVaultEnabled");
    expect(settings).not.toHaveProperty("homeNextActionsEnabled");
    expect(mocks.repositorySave).toHaveBeenCalledWith(
      "appearance",
      expect.not.objectContaining({
        homeResearchVaultEnabled: true,
        homeNextActionsEnabled: true,
      }),
    );
  });

  it.each(["CoWork OS", "CoWorkOS", "CrewWork", "QuiverReady"])(
    "migrates the legacy assistant name %s to NeoWorker",
    (legacyName) => {
      mocks.storedSettings = {
        themeMode: "system",
        assistantName: legacyName,
      };

      const settings = AppearanceManager.loadSettings();

      expect(settings.assistantName).toBe("NeoWorker");
      expect(mocks.repositorySave).toHaveBeenCalledWith(
        "appearance",
        expect.objectContaining({ assistantName: "NeoWorker" }),
      );
    },
  );

  it("migrates the old implicit summary default back to visible execution history", () => {
    mocks.storedSettings = {
      themeMode: "system",
      timelineVerbosity: "summary",
    };

    const settings = AppearanceManager.loadSettings();

    expect(settings.timelineVerbosity).toBe("verbose");
    expect(mocks.repositorySave).toHaveBeenCalledWith(
      "appearance",
      expect.objectContaining({
        timelineVerbosity: "verbose",
        timelineVerbosityConfigured: false,
      }),
    );
  });

  it("preserves an explicitly selected summary timeline", () => {
    mocks.storedSettings = {
      themeMode: "system",
      timelineVerbosity: "summary",
      timelineVerbosityConfigured: true,
    };

    const settings = AppearanceManager.loadSettings();

    expect(settings.timelineVerbosity).toBe("summary");
    expect(settings.timelineVerbosityConfigured).toBe(true);
  });

  it("does not overwrite an existing profile when secure settings are temporarily unreadable", () => {
    mocks.loadStatus = "decryption_failed";

    const settings = AppearanceManager.loadSettings();

    expect(settings).toMatchObject({
      disclaimerAccepted: false,
      onboardingCompleted: false,
      timelineVerbosity: "verbose",
    });
    expect(mocks.repositorySave).not.toHaveBeenCalled();
  });

  it("recovers completed onboarding state from the legacy appearance file", () => {
    fs.writeFileSync(
      path.join(tempDir, "appearance-settings.json"),
      JSON.stringify({
        themeMode: "light",
        disclaimerAccepted: true,
        onboardingCompleted: true,
        onboardingCompletedAt: "2026-02-01T22:32:08.325Z",
      }),
      "utf-8",
    );
    mocks.storedSettings = {
      themeMode: "system",
      disclaimerAccepted: false,
      onboardingCompleted: false,
    };

    AppearanceManager.initialize();
    const settings = AppearanceManager.loadSettings();

    expect(settings).toMatchObject({
      themeMode: "system",
      disclaimerAccepted: true,
      onboardingCompleted: true,
      onboardingCompletedAt: "2026-02-01T22:32:08.325Z",
    });
    expect(mocks.repositorySave).toHaveBeenCalledWith(
      "appearance",
      expect.objectContaining({
        disclaimerAccepted: true,
        onboardingCompleted: true,
        onboardingCompletedAt: "2026-02-01T22:32:08.325Z",
      }),
    );
  });

});
