import { useState, useEffect } from "react";
import { TraySettings as TraySettingsType } from "../../shared/types";
import { translate, useLanguage } from "../i18n";

interface TraySettingsProps {
  onStatusChange?: (enabled: boolean) => void;
}

function detectPlatform(): string {
  if (window.electronAPI?.getPlatform) {
    return window.electronAPI.getPlatform();
  }
  if (typeof navigator === "undefined") {
    return "unknown";
  }
  const platform = navigator.platform.toLowerCase();
  if (platform.includes("win")) return "win32";
  if (platform.includes("mac")) return "darwin";
  return "linux";
}

export function TraySettings({ onStatusChange }: TraySettingsProps) {
  useLanguage();
  const [settings, setSettings] = useState<TraySettingsType | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [platform, setPlatform] = useState<string>(() => detectPlatform());
  const isMacOS = platform === "darwin";
  const supportsTraySettings = platform === "darwin" || platform === "win32";

  useEffect(() => {
    const detectedPlatform = detectPlatform();
    setPlatform(detectedPlatform);
    if (detectedPlatform === "darwin" || detectedPlatform === "win32") {
      void loadSettings();
    } else {
      setLoading(false);
    }
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const traySettings = await window.electronAPI.getTraySettings();
      setSettings(traySettings);
      onStatusChange?.(traySettings.enabled);
    } catch {
      setSettings(null);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (patch: Partial<TraySettingsType>) => {
    try {
      setSaving(true);
      const result = await window.electronAPI.saveTraySettings(patch);
      if (result.settings) {
        setSettings(result.settings);
        onStatusChange?.(result.settings.enabled);
      }
    } catch {
      await loadSettings();
    } finally {
      setSaving(false);
    }
  };

  const trayHeading = isMacOS
    ? translate("traySettings.menuBar", "Menu Bar")
    : translate("traySettings.systemTray", "System Tray");
  const trayLabel = isMacOS
    ? translate("traySettings.menuBar", "menu bar")
    : translate("traySettings.systemTray", "system tray");

  if (!supportsTraySettings) {
    return (
      <div className="tray-settings">
        <div className="settings-section">
          <h3>{translate("traySettings.tray", "Tray")}</h3>
          <div className="settings-warning">
            {translate(
              "traySettings.unavailable",
              "Tray settings are not available on this platform yet.",
            )}
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="settings-loading">
        {translate("traySettings.loading", "Loading {target} settings…", {
          target: trayLabel,
        })}
      </div>
    );
  }

  return (
    <div className="tray-settings">
      <div className="settings-section">
        <h3>{trayHeading}</h3>
        <p className="settings-description">
          {isMacOS
            ? translate(
                "traySettings.description.mac",
                "Control where NeoWorker appears when it runs: the menu bar icon, the Dock, and banner alerts. Changes apply immediately.",
              )
            : translate(
                "traySettings.description.win",
                "Control the system tray icon and banner notifications for task updates. Changes apply immediately.",
              )}
        </p>

        <div className="tray-settings-options">
          <div className="settings-form-group tray-settings-option">
            <div className="tray-settings-option-inner">
              <div className="tray-settings-option-text">
                <span className="tray-settings-option-title">
                  {isMacOS
                    ? translate(
                        "traySettings.showMenuBarIcon",
                        "Show menu bar icon",
                      )
                    : translate(
                        "traySettings.showSystemTrayIcon",
                        "Show system tray icon",
                      )}
                </span>
                <p className="tray-settings-option-desc">
                  {isMacOS
                    ? translate(
                        "traySettings.showMenuBarIcon.desc",
                        "Adds a NeoWorker icon to the menu bar for quick access. Turn off to hide the icon; the app can still run from the Dock or when you open a window.",
                      )
                    : translate(
                        "traySettings.showSystemTrayIcon.desc",
                        "Adds a NeoWorker icon to the notification area for quick access. Turn off to hide the icon while NeoWorker keeps running.",
                      )}
                </p>
              </div>
              <label className="settings-toggle tray-settings-toggle">
                <input
                  type="checkbox"
                  checked={settings?.enabled ?? true}
                  onChange={(e) =>
                    void handleSave({ enabled: e.target.checked })
                  }
                  disabled={saving}
                  aria-label={
                    isMacOS
                      ? translate(
                          "traySettings.showMenuBarIcon",
                          "Show menu bar icon",
                        )
                      : translate(
                          "traySettings.showSystemTrayIcon",
                          "Show system tray icon",
                        )
                  }
                />
                <span className="toggle-slider" />
              </label>
            </div>
          </div>

          {isMacOS && (
            <div className="settings-form-group tray-settings-option">
              <div className="tray-settings-option-inner">
                <div className="tray-settings-option-text">
                  <span className="tray-settings-option-title">
                    {translate("traySettings.showDockIcon", "Show Dock icon")}
                  </span>
                  <p className="tray-settings-option-desc">
                    {translate(
                      "traySettings.showDockIcon.desc",
                      "While NeoWorker is open, show its icon in the Dock. Turn off if you prefer to work from the menu bar only (the Dock icon can still appear briefly when you focus the app).",
                    )}
                  </p>
                </div>
                <label className="settings-toggle tray-settings-toggle">
                  <input
                    type="checkbox"
                    checked={settings?.showDockIcon ?? true}
                    onChange={(e) =>
                      void handleSave({ showDockIcon: e.target.checked })
                    }
                    disabled={saving}
                    aria-label={translate(
                      "traySettings.showDockIcon",
                      "Show Dock icon",
                    )}
                  />
                  <span className="toggle-slider" />
                </label>
              </div>
            </div>
          )}

          <div className="settings-form-group tray-settings-option">
            <div className="tray-settings-option-inner">
              <div className="tray-settings-option-text">
                <span className="tray-settings-option-title">
                  {translate(
                    "traySettings.startClosed",
                    "Start with window closed",
                  )}
                </span>
                <p className="tray-settings-option-desc">
                  {translate(
                    "traySettings.startClosed.desc",
                    "On launch, keep the main window hidden until you open it from the {target} menu or elsewhere.",
                    { target: trayLabel },
                  )}
                </p>
              </div>
              <label className="settings-toggle tray-settings-toggle">
                <input
                  type="checkbox"
                  checked={settings?.startMinimized ?? false}
                  onChange={(e) =>
                    void handleSave({ startMinimized: e.target.checked })
                  }
                  disabled={saving}
                  aria-label={translate(
                    "traySettings.startClosed",
                    "Start with main window hidden",
                  )}
                />
                <span className="toggle-slider" />
              </label>
            </div>
          </div>

          <div className="settings-form-group tray-settings-option">
            <div className="tray-settings-option-inner">
              <div className="tray-settings-option-text">
                <span className="tray-settings-option-title">
                  {translate(
                    "traySettings.closeHides",
                    "Close button hides, does not quit",
                  )}
                </span>
                <p className="tray-settings-option-desc">
                  {translate(
                    "traySettings.closeHides.desc",
                    "When you close the main window, NeoWorker keeps running in the background. Turn off to make the close button quit the app (you can still quit from the {target} menu).",
                    { target: trayLabel },
                  )}
                </p>
              </div>
              <label className="settings-toggle tray-settings-toggle">
                <input
                  type="checkbox"
                  checked={settings?.closeToTray ?? true}
                  onChange={(e) =>
                    void handleSave({ closeToTray: e.target.checked })
                  }
                  disabled={saving}
                  aria-label={translate(
                    "traySettings.closeHides",
                    "Close window hides app instead of quitting",
                  )}
                />
                <span className="toggle-slider" />
              </label>
            </div>
          </div>

          <div className="settings-form-group tray-settings-option">
            <div className="tray-settings-option-inner">
              <div className="tray-settings-option-text">
                <span className="tray-settings-option-title">
                  {translate(
                    "traySettings.bannerNotifications",
                    "Banner notifications",
                  )}
                </span>
                <p className="tray-settings-option-desc">
                  {translate(
                    "traySettings.bannerNotifications.desc",
                    "Show short alerts near the top of the screen for task updates, completions, and items that need your attention.",
                  )}
                </p>
              </div>
              <label className="settings-toggle tray-settings-toggle">
                <input
                  type="checkbox"
                  checked={settings?.showNotifications ?? true}
                  onChange={(e) =>
                    void handleSave({ showNotifications: e.target.checked })
                  }
                  disabled={saving}
                  aria-label={translate(
                    "traySettings.bannerNotifications",
                    "Show banner notifications",
                  )}
                />
                <span className="toggle-slider" />
              </label>
            </div>
          </div>

          <div className="settings-form-group tray-settings-option">
            <div className="tray-settings-option-inner">
              <div className="tray-settings-option-text">
                <span className="tray-settings-option-title">
                  {translate(
                    "traySettings.approvalSaved",
                    "Approval saved notifications",
                  )}
                </span>
                <p className="tray-settings-option-desc">
                  {translate(
                    "traySettings.approvalSaved.desc",
                    "Show a banner when an approval decision is saved for reuse, such as after using allow once or approve all. Off by default.",
                  )}
                </p>
              </div>
              <label className="settings-toggle tray-settings-toggle">
                <input
                  type="checkbox"
                  checked={settings?.showApprovalSavedNotifications ?? false}
                  onChange={(e) =>
                    void handleSave({
                      showApprovalSavedNotifications: e.target.checked,
                    })
                  }
                  disabled={saving}
                  aria-label={translate(
                    "traySettings.approvalSaved",
                    "Show approval saved notifications",
                  )}
                />
                <span className="toggle-slider" />
              </label>
            </div>
          </div>
        </div>
      </div>

      <div className="settings-section tray-settings-features">
        <h4>
          {translate(
            "traySettings.features.title",
            "What you get from the {target} icon",
            {
              target: trayHeading,
            },
          )}
        </h4>
        <div className="settings-callout info">
          <ul style={{ margin: "8px 0 0 0", paddingLeft: "20px" }}>
            <li>
              <strong>
                {translate(
                  "traySettings.features.openMenu.title",
                  "Open the menu:",
                )}
              </strong>{" "}
              {translate(
                "traySettings.features.openMenu.desc",
                "click the NeoWorker icon in the {target} to open the menu (channels, workspaces, quick task, window show/hide, settings, quit).",
                { target: trayLabel },
              )}
            </li>
            <li>
              <strong>
                {translate(
                  "traySettings.features.showHide.title",
                  "Show or hide the window:",
                )}
              </strong>{" "}
              {translate(
                "traySettings.features.showHide.desc",
                'choose "Show Window" or "Hide Window" from that menu.',
              )}
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
