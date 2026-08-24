/**
 * Appearance Settings Manager
 *
 * Manages user appearance preferences.
 * Settings are stored encrypted in the database using SecureSettingsRepository.
 */

import * as fs from "fs";
import * as path from "path";
import {
  AppearanceSettings,
  DEFAULT_ASSISTANT_NAME,
  ThemeMode,
  TimelineVerbosity,
} from "../../shared/types";
import { SecureSettingsRepository } from "../database/SecureSettingsRepository";
import { getUserDataDir } from "../utils/user-data-dir";

const LEGACY_SETTINGS_FILE = "appearance-settings.json";
const DEV_LOG_SETTINGS_FILE = path.join(".neoworker", "dev-log-settings.json");

const DEFAULT_SETTINGS: AppearanceSettings = {
  themeMode: "system",
  language: "zh-CN",
  timelineVerbosity: "verbose",
  timelineVerbosityConfigured: false,
  devRunLoggingEnabled: false,
  disclaimerAccepted: false,
  onboardingCompleted: false,
  onboardingCompletedAt: undefined,
  assistantName: DEFAULT_ASSISTANT_NAME,
};

type StoredAppearanceSettings = Partial<AppearanceSettings> & {
  visualTheme?: unknown;
  accentColor?: unknown;
  uiDensity?: unknown;
  homeResearchVaultEnabled?: unknown;
  homeNextActionsEnabled?: unknown;
};

const LEGACY_PRODUCT_ASSISTANT_NAMES = new Set([
  "cowork os",
  "cowork-os",
  "coworkos",
  "cowork-oss",
  "crewwork",
  "quiverready",
]);

function normalizeAssistantName(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    return DEFAULT_ASSISTANT_NAME;
  }
  const trimmed = value.trim();
  return LEGACY_PRODUCT_ASSISTANT_NAMES.has(trimmed.toLowerCase())
    ? DEFAULT_ASSISTANT_NAME
    : trimmed;
}

function sanitizeAppearanceSettings(
  input: StoredAppearanceSettings,
): AppearanceSettings {
  return {
    themeMode: isValidThemeMode(input.themeMode)
      ? input.themeMode
      : DEFAULT_SETTINGS.themeMode,
    language:
      typeof input.language === "string" && input.language.trim().length > 0
        ? input.language
        : DEFAULT_SETTINGS.language,
    timelineVerbosity: isValidTimelineVerbosity(input.timelineVerbosity)
      ? input.timelineVerbosity
      : DEFAULT_SETTINGS.timelineVerbosity,
    timelineVerbosityConfigured:
      input.timelineVerbosityConfigured === true,
    devRunLoggingEnabled:
      typeof input.devRunLoggingEnabled === "boolean"
        ? input.devRunLoggingEnabled
        : DEFAULT_SETTINGS.devRunLoggingEnabled,
    disclaimerAccepted:
      input.disclaimerAccepted ?? DEFAULT_SETTINGS.disclaimerAccepted,
    onboardingCompleted:
      input.onboardingCompleted ?? DEFAULT_SETTINGS.onboardingCompleted,
    onboardingCompletedAt:
      input.onboardingCompletedAt ?? DEFAULT_SETTINGS.onboardingCompletedAt,
    assistantName: normalizeAssistantName(input.assistantName),
  };
}

export class AppearanceManager {
  private static legacySettingsPath: string;
  private static cachedSettings: AppearanceSettings | null = null;
  private static migrationCompleted = false;

  /**
   * Initialize the AppearanceManager
   */
  static initialize(): void {
    const userDataPath = getUserDataDir();
    this.legacySettingsPath = path.join(userDataPath, LEGACY_SETTINGS_FILE);
    console.log("[AppearanceManager] Initialized");

    // Migrate from legacy JSON file to encrypted database
    this.migrateFromLegacyFile();
  }

  /**
   * Migrate settings from legacy JSON file to encrypted database
   */
  private static migrateFromLegacyFile(): void {
    if (this.migrationCompleted) return;

    try {
      // Check if SecureSettingsRepository is initialized
      if (!SecureSettingsRepository.isInitialized()) {
        console.log(
          "[AppearanceManager] SecureSettingsRepository not yet initialized, skipping migration",
        );
        return;
      }

      const repository = SecureSettingsRepository.getInstance();

      // Check if already migrated to database
      if (repository.exists("appearance")) {
        this.migrationCompleted = true;
        return;
      }

      // Check if legacy file exists
      if (!fs.existsSync(this.legacySettingsPath)) {
        console.log("[AppearanceManager] No legacy settings file found");
        this.migrationCompleted = true;
        return;
      }

      console.log(
        "[AppearanceManager] Migrating settings from legacy JSON file to encrypted database...",
      );

      // Create backup before migration
      const backupPath = this.legacySettingsPath + ".migration-backup";
      fs.copyFileSync(this.legacySettingsPath, backupPath);

      try {
        // Read legacy settings
        const data = fs.readFileSync(this.legacySettingsPath, "utf-8");
        const parsed = JSON.parse(data);
        const legacySettings = sanitizeAppearanceSettings({
          ...DEFAULT_SETTINGS,
          ...parsed,
        });

        // Save to encrypted database
        repository.save("appearance", legacySettings);
        console.log(
          "[AppearanceManager] Settings migrated to encrypted database",
        );

        // Migration successful - delete backup and original
        fs.unlinkSync(backupPath);
        fs.unlinkSync(this.legacySettingsPath);
        console.log(
          "[AppearanceManager] Migration complete, cleaned up legacy files",
        );

        this.migrationCompleted = true;
      } catch (migrationError) {
        console.error(
          "[AppearanceManager] Migration failed, backup preserved at:",
          backupPath,
        );
        throw migrationError;
      }
    } catch (error) {
      console.error("[AppearanceManager] Migration failed:", error);
    }
  }

  /**
   * Load settings from encrypted database (with caching)
   */
  static loadSettings(): AppearanceSettings {
    if (this.cachedSettings) {
      syncDevLogSettingsFile(this.cachedSettings.devRunLoggingEnabled === true);
      return this.cachedSettings;
    }

    let settings: AppearanceSettings = { ...DEFAULT_SETTINGS };
    let needsWrite = false;
    let canPersistAutomaticRepairs = true;

    try {
      // Try to load from encrypted database
      if (SecureSettingsRepository.isInitialized()) {
        const repository = SecureSettingsRepository.getInstance();
        const loadResult = repository.loadWithStatus<StoredAppearanceSettings>(
          "appearance",
        );
        const stored = loadResult.data;
        canPersistAutomaticRepairs =
          loadResult.status === "success" || loadResult.status === "not_found";
        if (!canPersistAutomaticRepairs) {
          console.warn(
            `[AppearanceManager] Appearance settings are temporarily unreadable (${loadResult.status}); using in-memory defaults without overwriting the stored profile`,
          );
        }
        if (stored) {
          settings = sanitizeAppearanceSettings({
            ...DEFAULT_SETTINGS,
            ...stored,
          });
          // Detailed execution history used to be the product behavior. Older
          // profiles received "summary" as an implicit default, which made
          // step groups and tool results appear to vanish. Migrate only users
          // who have not made an explicit verbosity choice.
          if (stored.timelineVerbosityConfigured !== true) {
            settings.timelineVerbosity = "verbose";
            settings.timelineVerbosityConfigured = false;
            needsWrite = true;
          }
          const recoveredLifecycleSettings =
            this.recoverLegacyLifecycleSettings(settings);
          if (recoveredLifecycleSettings) {
            settings = recoveredLifecycleSettings;
            needsWrite = true;
          }
          // Persist defaults for newly added fields when missing/invalid.
          if (
            "transparencyEffectsEnabled" in stored ||
            !isValidTimelineVerbosity(stored.timelineVerbosity) ||
            typeof stored.timelineVerbosityConfigured !== "boolean" ||
            typeof stored.devRunLoggingEnabled !== "boolean" ||
            "homeResearchVaultEnabled" in stored ||
            "homeNextActionsEnabled" in stored ||
            typeof stored.language !== "string" ||
            stored.language.trim().length === 0 ||
            stored.assistantName !== settings.assistantName ||
            "visualTheme" in stored ||
            "accentColor" in stored ||
            "uiDensity" in stored
          ) {
            needsWrite = true;
          }
        }
      }

      const sanitizedSettings = sanitizeAppearanceSettings(settings);
      if (JSON.stringify(sanitizedSettings) !== JSON.stringify(settings)) {
        settings = sanitizedSettings;
        needsWrite = true;
      }
    } catch (error) {
      console.error("[AppearanceManager] Failed to load settings:", error);
      settings = { ...DEFAULT_SETTINGS };
    }

    this.cachedSettings = settings;
    syncDevLogSettingsFile(settings.devRunLoggingEnabled === true);

    // Persist defaults for newly added fields so they survive future saves
    if (
      needsWrite &&
      canPersistAutomaticRepairs &&
      SecureSettingsRepository.isInitialized()
    ) {
      try {
        const repository = SecureSettingsRepository.getInstance();
        repository.save("appearance", sanitizeAppearanceSettings(settings));
        console.log(
          "[AppearanceManager] Persisted default appearance settings fields",
          JSON.stringify({
            timelineVerbosity: settings.timelineVerbosity,
            devRunLoggingEnabled: settings.devRunLoggingEnabled,
            language: settings.language,
          }),
        );
      } catch {
        // Non-fatal: cache is correct, DB will catch up on next save
      }
    }

    console.debug(
      "[AppearanceManager] Loaded settings",
      JSON.stringify({
        themeMode: settings.themeMode,
        timelineVerbosity: settings.timelineVerbosity,
      }),
    );
    return settings;
  }

  private static recoverLegacyLifecycleSettings(
    settings: AppearanceSettings,
  ): AppearanceSettings | null {
    if (!this.legacySettingsPath || !fs.existsSync(this.legacySettingsPath)) {
      return null;
    }

    try {
      const parsed = JSON.parse(
        fs.readFileSync(this.legacySettingsPath, "utf-8"),
      ) as Partial<AppearanceSettings>;
      const nextSettings = { ...settings };
      let recovered = false;

      if (
        parsed.onboardingCompleted === true &&
        settings.onboardingCompleted !== true
      ) {
        nextSettings.onboardingCompleted = true;
        recovered = true;
      }

      if (
        typeof parsed.onboardingCompletedAt === "string" &&
        parsed.onboardingCompletedAt.trim().length > 0 &&
        !settings.onboardingCompletedAt
      ) {
        nextSettings.onboardingCompletedAt = parsed.onboardingCompletedAt;
        recovered = true;
      }

      if (
        parsed.disclaimerAccepted === true &&
        settings.disclaimerAccepted !== true
      ) {
        nextSettings.disclaimerAccepted = true;
        recovered = true;
      }

      if (recovered) {
        console.log(
          "[AppearanceManager] Recovered onboarding lifecycle state from legacy file",
        );
      }

      return recovered ? nextSettings : null;
    } catch (error) {
      console.warn(
        "[AppearanceManager] Failed to recover legacy onboarding state:",
        error,
      );
      return null;
    }
  }

  /**
   * Save settings to encrypted database
   */
  static saveSettings(settings: Partial<AppearanceSettings>): void {
    try {
      if (!SecureSettingsRepository.isInitialized()) {
        throw new Error("SecureSettingsRepository not initialized");
      }

      // Load existing settings to preserve fields not being updated
      const existingSettings = this.loadSettings();

      const validatedSettings: AppearanceSettings = {
        themeMode: isValidThemeMode(settings.themeMode)
          ? settings.themeMode
          : existingSettings.themeMode,
        language: settings.language ?? existingSettings.language,
        disclaimerAccepted:
          settings.disclaimerAccepted ?? existingSettings.disclaimerAccepted,
        onboardingCompleted:
          settings.onboardingCompleted ?? existingSettings.onboardingCompleted,
        onboardingCompletedAt:
          settings.onboardingCompletedAt ??
          existingSettings.onboardingCompletedAt,
        assistantName: settings.assistantName ?? existingSettings.assistantName,
        timelineVerbosity: isValidTimelineVerbosity(settings.timelineVerbosity)
          ? settings.timelineVerbosity
          : existingSettings.timelineVerbosity,
        timelineVerbosityConfigured:
          typeof settings.timelineVerbosityConfigured === "boolean"
            ? settings.timelineVerbosityConfigured
            : existingSettings.timelineVerbosityConfigured,
        devRunLoggingEnabled:
          typeof settings.devRunLoggingEnabled === "boolean"
            ? settings.devRunLoggingEnabled
            : existingSettings.devRunLoggingEnabled,
      };

      const repository = SecureSettingsRepository.getInstance();
      repository.save("appearance", validatedSettings);
      syncDevLogSettingsFile(validatedSettings.devRunLoggingEnabled === true);
      this.cachedSettings = validatedSettings;
      console.log("[AppearanceManager] Settings saved to encrypted database");
    } catch (error) {
      console.error("[AppearanceManager] Failed to save settings:", error);
      throw error;
    }
  }

  /**
   * Clear the settings cache
   */
  static clearCache(): void {
    this.cachedSettings = null;
  }
}

export function getDevLogCaptureEnabled(): boolean {
  if (process.env.NODE_ENV !== "development") {
    return false;
  }

  try {
    const configPath = path.resolve(process.cwd(), DEV_LOG_SETTINGS_FILE);
    if (!fs.existsSync(configPath)) {
      return false;
    }

    const raw = fs.readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(raw) as { captureEnabled?: boolean };
    return parsed.captureEnabled === true;
  } catch {
    return false;
  }
}

function isValidThemeMode(value: unknown): value is ThemeMode {
  return value === "light" || value === "dark" || value === "system";
}

function isValidTimelineVerbosity(value: unknown): value is TimelineVerbosity {
  return value === "summary" || value === "verbose";
}

function syncDevLogSettingsFile(captureEnabled: boolean): void {
  if (process.env.NODE_ENV !== "development") {
    return;
  }
  try {
    const configPath = path.resolve(process.cwd(), DEV_LOG_SETTINGS_FILE);
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(
      configPath,
      JSON.stringify(
        {
          captureEnabled,
          updatedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
      "utf-8",
    );
  } catch (error) {
    console.warn(
      "[AppearanceManager] Failed to sync dev-log settings file:",
      error,
    );
  }
}
