import { useState, useEffect } from "react";
import { SearchProviderType, SearchConfigStatus } from "../../shared/types";
import { translate, useLanguage } from "../i18n";

interface SearchSettingsProps {
  onStatusChange?: (configured: boolean) => void;
}

export function SearchSettings({ onStatusChange }: SearchSettingsProps) {
  useLanguage();
  const t = translate;
  const [configStatus, setConfigStatus] = useState<SearchConfigStatus | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [preferenceStatus, setPreferenceStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [testingProvider, setTestingProvider] =
    useState<SearchProviderType | null>(null);
  const [testResult, setTestResult] = useState<{
    provider: SearchProviderType;
    success: boolean;
    error?: string;
  } | null>(null);

  // Form state
  const [primaryProvider, setPrimaryProvider] =
    useState<SearchProviderType | null>(null);
  const [fallbackProvider, setFallbackProvider] =
    useState<SearchProviderType | null>(null);

  // API Key form state
  const [tavilyApiKey, setTavilyApiKey] = useState("");
  const [exaApiKey, setExaApiKey] = useState("");
  const [braveApiKey, setBraveApiKey] = useState("");
  const [serpapiApiKey, setSerpapiApiKey] = useState("");
  const [googleApiKey, setGoogleApiKey] = useState("");
  const [googleSearchEngineId, setGoogleSearchEngineId] = useState("");

  // Track which provider is active in the tab view
  const [activeProvider, setActiveProvider] =
    useState<SearchProviderType | null>(null);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      setLoading(true);
      const status = await window.electronAPI.getSearchConfigStatus();
      setConfigStatus(status);
      setPrimaryProvider(status.primaryProvider);
      setFallbackProvider(status.fallbackProvider);
      setActiveProvider((prev) => {
        if (
          prev &&
          status.providers.some((provider) => provider.type === prev)
        ) {
          return prev;
        }
        return status.primaryProvider ?? status.providers[0]?.type ?? null;
      });
      onStatusChange?.(status.isConfigured);
    } catch (error) {
      console.error("Failed to load search config:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setTestResult(null);
      await window.electronAPI.saveSearchSettings({
        primaryProvider,
        fallbackProvider,
        tavily: tavilyApiKey ? { apiKey: tavilyApiKey } : undefined,
        exa: exaApiKey ? { apiKey: exaApiKey } : undefined,
        brave: braveApiKey ? { apiKey: braveApiKey } : undefined,
        serpapi: serpapiApiKey ? { apiKey: serpapiApiKey } : undefined,
        google:
          googleApiKey || googleSearchEngineId
            ? {
                apiKey: googleApiKey || undefined,
                searchEngineId: googleSearchEngineId || undefined,
              }
            : undefined,
      });
      // Clear the input fields after saving
      setTavilyApiKey("");
      setExaApiKey("");
      setBraveApiKey("");
      setSerpapiApiKey("");
      setGoogleApiKey("");
      setGoogleSearchEngineId("");
      await loadConfig();
    } catch (error: Any) {
      console.error("Failed to save search settings:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleTestProvider = async (providerType: SearchProviderType) => {
    try {
      setTestingProvider(providerType);
      setTestResult(null);
      const result = await window.electronAPI.testSearchProvider(providerType);
      setTestResult({ provider: providerType, ...result });
    } catch (error: Any) {
      setTestResult({
        provider: providerType,
        success: false,
        error: error.message,
      });
    } finally {
      setTestingProvider(null);
    }
  };

  const saveProviderPreferences = async (
    nextPrimary: SearchProviderType | null,
    nextFallback: SearchProviderType | null,
  ) => {
    const previousPrimary = primaryProvider;
    const previousFallback = fallbackProvider;

    setPrimaryProvider(nextPrimary);
    setFallbackProvider(nextFallback);
    setPreferenceStatus("saving");

    try {
      await window.electronAPI.saveSearchSettings({
        primaryProvider: nextPrimary,
        fallbackProvider: nextFallback,
      });
      setPreferenceStatus("saved");
    } catch (error: Any) {
      console.error("Failed to update search provider preference:", error);
      setPrimaryProvider(previousPrimary);
      setFallbackProvider(previousFallback);
      setPreferenceStatus("error");
    }
  };

  // Every configured provider is selectable. DuckDuckGo is always available without an API key.
  const selectableProviders =
    configStatus?.providers.filter((p) => p.configured) || [];
  const hasMultipleProviders = selectableProviders.length > 1;
  const activeProviderConfig =
    configStatus?.providers.find((p) => p.type === activeProvider) || null;

  if (loading) {
    return (
      <div className="settings-loading">
        {t("searchSettings.loading", "Loading search settings...")}
      </div>
    );
  }

  return (
    <div className="search-settings">
      <div className="settings-section search-provider-config-section">
        <div className="search-provider-config-header">
          <h3>{t("searchSettings.title", "Configure Search Providers")}</h3>
          <p className="settings-description">
            {t(
              "searchSettings.description",
              "Add API keys to enable web search. You can configure multiple providers and set a primary and fallback.",
            )}
          </p>
        </div>

        <div className="llm-provider-tabs">
          {configStatus?.providers.map((provider) => (
            <button
              key={provider.type}
              className={`llm-provider-tab ${activeProvider === provider.type ? "active" : ""}`}
              onClick={() => {
                setActiveProvider(provider.type);
                setTestResult(null);
              }}
            >
              <span className="llm-provider-tab-label">{provider.name}</span>
              {provider.configured && (
                <span className="llm-provider-tab-status" />
              )}
            </button>
          ))}
        </div>

        {activeProviderConfig ? (
          <div className="settings-card provider-config-panel">
            <div className="provider-config-form">
              <p className="provider-description">
                {activeProviderConfig.description}
              </p>
              <p className="provider-types">
                {t("searchSettings.supports", "Supports: {types}", {
                  types: activeProviderConfig.supportedTypes.join(", "),
                })}
              </p>

              {activeProviderConfig.type === "tavily" && (
                <div className="settings-field">
                  <label>Tavily API Key</label>
                  <input
                    type="password"
                    className="settings-input"
                    placeholder={
                      activeProviderConfig.configured
                        ? "••••••••••••••••"
                        : "tvly-..."
                    }
                    value={tavilyApiKey}
                    onChange={(e) => setTavilyApiKey(e.target.value)}
                  />
                  <p className="settings-hint">
                    {t("searchSettings.getApiKeyFrom", "Get your API key from")}{" "}
                    <a
                      href="https://tavily.com/"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      tavily.com
                    </a>
                  </p>
                </div>
              )}

              {activeProviderConfig.type === "exa" && (
                <div className="settings-field">
                  <label>Exa API Key</label>
                  <input
                    type="password"
                    className="settings-input"
                    placeholder={
                      activeProviderConfig.configured
                        ? "••••••••••••••••"
                        : "exa_..."
                    }
                    value={exaApiKey}
                    onChange={(e) => setExaApiKey(e.target.value)}
                  />
                  <p className="settings-hint">
                    {t("searchSettings.getApiKeyFrom", "Get your API key from")}{" "}
                    <a
                      href="https://exa.ai/"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      exa.ai
                    </a>
                  </p>
                </div>
              )}

              {activeProviderConfig.type === "brave" && (
                <div className="settings-field">
                  <label>Brave Search API Key</label>
                  <input
                    type="password"
                    className="settings-input"
                    placeholder={
                      activeProviderConfig.configured
                        ? "••••••••••••••••"
                        : "BSA..."
                    }
                    value={braveApiKey}
                    onChange={(e) => setBraveApiKey(e.target.value)}
                  />
                  <p className="settings-hint">
                    {t("searchSettings.getApiKeyFrom", "Get your API key from")}{" "}
                    <a
                      href="https://brave.com/search/api/"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      brave.com/search/api
                    </a>
                  </p>
                </div>
              )}

              {activeProviderConfig.type === "serpapi" && (
                <div className="settings-field">
                  <label>SerpAPI Key</label>
                  <input
                    type="password"
                    className="settings-input"
                    placeholder={
                      activeProviderConfig.configured
                        ? "••••••••••••••••"
                        : t(
                            "searchSettings.placeholder.enterApiKey",
                            "Enter API key",
                          )
                    }
                    value={serpapiApiKey}
                    onChange={(e) => setSerpapiApiKey(e.target.value)}
                  />
                  <p className="settings-hint">
                    {t("searchSettings.getApiKeyFrom", "Get your API key from")}{" "}
                    <a
                      href="https://serpapi.com/"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      serpapi.com
                    </a>
                  </p>
                </div>
              )}

              {activeProviderConfig.type === "google" && (
                <>
                  <div className="settings-field">
                    <label>Google API Key</label>
                    <input
                      type="password"
                      className="settings-input"
                      placeholder={
                        activeProviderConfig.configured
                          ? "••••••••••••••••"
                          : "AIza..."
                      }
                      value={googleApiKey}
                      onChange={(e) => setGoogleApiKey(e.target.value)}
                    />
                  </div>
                  <div className="settings-field">
                    <label>
                      {t(
                        "searchSettings.google.searchEngineId",
                        "Search Engine ID",
                      )}
                    </label>
                    <input
                      type="text"
                      className="settings-input"
                      placeholder={t(
                        "searchSettings.google.searchEngineIdPlaceholder",
                        "Enter Search Engine ID",
                      )}
                      value={googleSearchEngineId}
                      onChange={(e) => setGoogleSearchEngineId(e.target.value)}
                    />
                    <p className="settings-hint">
                      {t(
                        "searchSettings.getCredentialsFrom",
                        "Get your credentials from",
                      )}{" "}
                      <a
                        href="https://developers.google.com/custom-search/v1/introduction"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Google Custom Search
                      </a>
                    </p>
                  </div>
                </>
              )}

              {activeProviderConfig.type === "duckduckgo" && (
                <div className="ddg-free-badge" style={{ margin: "8px 0" }}>
                  <span
                    style={{
                      display: "inline-block",
                      padding: "2px 8px",
                      borderRadius: "4px",
                      background: "var(--color-success, #22c55e)",
                      color: "#fff",
                      fontSize: "12px",
                      fontWeight: 600,
                    }}
                  >
                    {t(
                      "searchSettings.duckduckgo.builtInFree",
                      "Built-in (Free)",
                    )}
                  </span>
                  <p className="settings-hint" style={{ marginTop: "6px" }}>
                    {t(
                      "searchSettings.duckduckgo.description",
                      "DuckDuckGo search works out of the box with no configuration needed. It is used as an automatic fallback when no other provider is available.",
                    )}
                  </p>
                </div>
              )}

              {activeProviderConfig.configured && (
                <button
                  className="button-small button-secondary"
                  onClick={() => handleTestProvider(activeProviderConfig.type)}
                  disabled={testingProvider === activeProviderConfig.type}
                >
                  {testingProvider === activeProviderConfig.type
                    ? t("common.testing", "Testing...")
                    : t("cloudStorage.testConnection", "Test Connection")}
                </button>
              )}

              {testResult?.provider === activeProviderConfig.type && (
                <div
                  className={`test-result-inline ${testResult.success ? "success" : "error"}`}
                >
                  {testResult.success
                    ? t(
                        "searchSettings.test.success",
                        "✓ Connection successful",
                      )
                    : t("searchSettings.test.error", "✗ {error}", {
                        error: testResult.error || "",
                      })}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="settings-empty">
            {t(
              "searchSettings.empty.selectProvider",
              "Select a provider to configure.",
            )}
          </div>
        )}
      </div>

      {selectableProviders.length > 0 && (
        <>
          <div className="settings-section search-provider-choice-section">
            <div className="search-provider-choice-header">
              <div>
                <h3>{t("searchSettings.primary.title", "Primary Provider")}</h3>
                <p className="settings-description">
                  {t(
                    "searchSettings.primary.description",
                    "Select which search provider to use by default. Changes take effect immediately.",
                  )}
                </p>
              </div>
              <span
                className={`search-provider-preference-status ${preferenceStatus}`}
                role="status"
                aria-live="polite"
              >
                {preferenceStatus === "saving" &&
                  t("common.saving", "Saving...")}
                {preferenceStatus === "saved" && t("common.saved", "Saved")}
                {preferenceStatus === "error" &&
                  t(
                    "searchSettings.preference.saveFailed",
                    "Couldn't switch provider. Try again.",
                  )}
              </span>
            </div>

            <div className="provider-options">
              {selectableProviders.map((provider) => (
                <label
                  key={provider.type}
                  className={`provider-option ${primaryProvider === provider.type ? "selected" : ""}`}
                >
                  <input
                    type="radio"
                    name="primaryProvider"
                    checked={primaryProvider === provider.type}
                    disabled={preferenceStatus === "saving"}
                    onChange={() =>
                      void saveProviderPreferences(
                        provider.type,
                        fallbackProvider === provider.type
                          ? null
                          : fallbackProvider,
                      )
                    }
                  />
                  <div className="provider-option-content">
                    <span className="provider-name">{provider.name}</span>
                    <span className="provider-types">
                      {t("searchSettings.supports", "Supports: {types}", {
                        types: provider.supportedTypes.join(", "),
                      })}
                    </span>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {hasMultipleProviders && (
            <div className="settings-section search-provider-choice-section">
              <h3>{t("searchSettings.fallback.title", "Fallback Provider")}</h3>
              <p className="settings-description">
                {t(
                  "searchSettings.fallback.description",
                  "If the primary provider fails, the fallback will be used automatically.",
                )}
              </p>

              <div className="provider-options">
                <label
                  className={`provider-option ${fallbackProvider === null ? "selected" : ""}`}
                >
                  <input
                    type="radio"
                    name="fallbackProvider"
                    checked={fallbackProvider === null}
                    disabled={preferenceStatus === "saving"}
                    onChange={() =>
                      void saveProviderPreferences(primaryProvider, null)
                    }
                  />
                  <div className="provider-option-content">
                    <span className="provider-name">
                      {t("common.none", "None")}
                    </span>
                    <span className="provider-description">
                      {t("searchSettings.fallback.none", "No fallback")}
                    </span>
                  </div>
                </label>

                {selectableProviders
                  .filter((p) => p.type !== primaryProvider)
                  .map((provider) => (
                    <label
                      key={provider.type}
                      className={`provider-option ${fallbackProvider === provider.type ? "selected" : ""}`}
                    >
                      <input
                        type="radio"
                        name="fallbackProvider"
                        checked={fallbackProvider === provider.type}
                        disabled={preferenceStatus === "saving"}
                        onChange={() =>
                          void saveProviderPreferences(
                            primaryProvider,
                            provider.type,
                          )
                        }
                      />
                      <div className="provider-option-content">
                        <span className="provider-name">{provider.name}</span>
                        <span className="provider-types">
                          {t("searchSettings.supports", "Supports: {types}", {
                            types: provider.supportedTypes.join(", "),
                          })}
                        </span>
                      </div>
                    </label>
                  ))}
              </div>
            </div>
          )}
        </>
      )}

      <div className="settings-actions">
        <button
          className="button-primary"
          onClick={handleSave}
          disabled={saving}
        >
          {saving
            ? t("common.saving", "Saving...")
            : t("cloudStorage.saveSettings", "Save Settings")}
        </button>
      </div>
    </div>
  );
}
