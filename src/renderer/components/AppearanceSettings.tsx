import {
  SUPPORTED_LANGUAGES,
  LANGUAGE_NAMES,
  changeLanguage,
  translate,
  useLanguage,
} from "../i18n";

interface AppearanceSettingsProps {
  devRunLoggingEnabled: boolean;
  onDevRunLoggingEnabledChange: (enabled: boolean) => void;
}

export function AppearanceSettings({
  devRunLoggingEnabled,
  onDevRunLoggingEnabledChange,
}: AppearanceSettingsProps) {
  const currentLanguage = useLanguage();

  return (
    <div className="appearance-settings">
      {/* Language */}
      <div className="appearance-section">
        <div className="appearance-section-heading">
          <h4>{translate("appearance.language", "Language")}</h4>
          <p className="settings-description">
            {translate(
              "appearance.language.description",
              "Choose the interface language.",
            )}
          </p>
        </div>
        <div className="appearance-setting-list">
          <div className="appearance-language-row">
            <span className="appearance-setting-label">
              {translate("appearance.language", "Language")}
            </span>
            <div
              className="theme-switcher"
              role="group"
              aria-label={translate("appearance.language", "Language")}
            >
              {SUPPORTED_LANGUAGES.map((lang) => (
                <button
                  key={lang}
                  type="button"
                  className={`theme-option ${currentLanguage === lang ? "selected" : ""}`}
                  aria-pressed={currentLanguage === lang}
                  onClick={() => {
                    void changeLanguage(lang);
                  }}
                >
                  <span className="theme-option-label">
                    {LANGUAGE_NAMES[lang]}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="appearance-section">
        <div className="appearance-section-heading">
          <h4>
            {translate("appearance.developerLogging", "Developer logging")}
          </h4>
          <p className="settings-description">
            {translate(
              "appearance.developerLogging.description",
              "When enabled, npm run dev writes redacted text and structured JSONL logs to logs/ with automatic cleanup.",
            )}
          </p>
        </div>
        <div className="appearance-setting-list">
          <label className="appearance-setting-row">
            <span className="appearance-setting-label">
              {translate(
                "appearance.developerLogging.enabled",
                "Capture `npm run dev` logs locally (default: off)",
              )}
            </span>
            <span className="settings-toggle appearance-setting-toggle">
              <input
                type="checkbox"
                checked={devRunLoggingEnabled}
                onChange={(event) =>
                  onDevRunLoggingEnabledChange(event.target.checked)
                }
              />
              <span className="toggle-slider" />
            </span>
          </label>
        </div>
      </div>
    </div>
  );
}
