import { SecureSettingsRepository } from "../database/SecureSettingsRepository";
import { AgentMailSettingsData } from "../../shared/types";

const DEFAULT_SETTINGS: AgentMailSettingsData = {
  enabled: false,
  baseUrl: "https://api.agentmail.to/v0",
  websocketUrl: "wss://api.agentmail.to/v0/websocket",
  timeoutMs: 20000,
  realtimeEnabled: true,
};

export class AgentMailSettingsManager {
  private static cachedSettings: AgentMailSettingsData | null = null;

  static loadSettings(): AgentMailSettingsData {
    if (this.cachedSettings) {
      return this.cachedSettings;
    }

    let settings: AgentMailSettingsData = { ...DEFAULT_SETTINGS };

    try {
      if (SecureSettingsRepository.isInitialized()) {
        const repository = SecureSettingsRepository.getInstance();
        const stored = repository.load<AgentMailSettingsData>("plugin:agentmail");
        if (stored) {
          settings = { ...DEFAULT_SETTINGS, ...stored };
        }
      }
    } catch (error) {
      console.error("[AgentMailSettingsManager] Failed to load settings:", error);
    }

    this.cachedSettings = settings;
    return settings;
  }

  static saveSettings(settings: AgentMailSettingsData): void {
    try {
      if (!SecureSettingsRepository.isInitialized()) {
        throw new Error("SecureSettingsRepository not initialized");
      }
      const repository = SecureSettingsRepository.getInstance();
      repository.save("plugin:agentmail", settings);
      this.cachedSettings = settings;
    } catch (error) {
      console.error("[AgentMailSettingsManager] Failed to save settings:", error);
    }
  }

  static clearCache(): void {
    this.cachedSettings = null;
  }
}
