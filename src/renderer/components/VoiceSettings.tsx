import { useState, useEffect, useRef, useCallback } from "react";
import { ChevronDown, SlidersHorizontal, Volume2 } from "lucide-react";
import {
  type VoiceSettings as VoiceSettingsType,
  type VoiceProvider,
  type VoiceInputMode,
  type VoiceResponseMode,
  type VoiceState,
  type VoiceCapabilities,
  type ElevenLabsVoice,
  OPENAI_VOICES,
  VOICE_LANGUAGES,
  DEFAULT_VOICE_SETTINGS,
} from "../../shared/types";
import { translate, useLanguage } from "../i18n";
import "./voice-settings.css";

// Audio playback helper for renderer process
async function playAudioData(
  audioData: number[],
  volume: number,
): Promise<void> {
  const audioContext = new AudioContext();
  const arrayBuffer = new Uint8Array(audioData).buffer;

  try {
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    const gainNode = audioContext.createGain();
    gainNode.gain.value = volume / 100;
    gainNode.connect(audioContext.destination);

    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(gainNode);

    return new Promise((resolve) => {
      source.onended = () => {
        audioContext.close();
        resolve();
      };
      source.start(0);
    });
  } catch (error) {
    audioContext.close();
    throw error;
  }
}

interface VoiceSettingsProps {
  onStateChange?: (state: VoiceState) => void;
}

export function VoiceSettings({ onStateChange }: VoiceSettingsProps) {
  useLanguage();
  const t = translate;
  const [settings, setSettings] = useState<VoiceSettingsType>(
    DEFAULT_VOICE_SETTINGS,
  );
  const [voiceState, setVoiceState] = useState<VoiceState>({
    isActive: false,
    isListening: false,
    isSpeaking: false,
    isProcessing: false,
    audioLevel: 0,
  });
  const [capabilities, setCapabilities] = useState<VoiceCapabilities | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [elevenLabsVoices, setElevenLabsVoices] = useState<ElevenLabsVoice[]>(
    [],
  );
  const [loadingVoices, setLoadingVoices] = useState(false);

  // Test connection states
  const [testingElevenLabs, setTestingElevenLabs] = useState(false);
  const [elevenLabsTestResult, setElevenLabsTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [testingOpenAI, setTestingOpenAI] = useState(false);
  const [openAITestResult, setOpenAITestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [testingAzure, setTestingAzure] = useState(false);
  const [azureTestResult, setAzureTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  // Test speech state
  const [testingSpeech, setTestingSpeech] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // Debounce ref for text input saves to prevent race conditions
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingSettingsRef = useRef<Partial<VoiceSettingsType>>({});

  useEffect(() => {
    loadSettings();

    // Subscribe to voice events
    const unsubscribe = window.electronAPI.onVoiceEvent?.((event) => {
      if (event.type === "voice:state-changed") {
        const newState = event.data as VoiceState;
        setVoiceState(newState);
        onStateChange?.(newState);
      }
    });

    return () => {
      unsubscribe?.();
      // Clean up pending save on unmount
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [onStateChange]);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const loaded = await window.electronAPI.getVoiceSettings();
      const nextSettings = loaded || DEFAULT_VOICE_SETTINGS;
      setSettings(nextSettings);

      // Load ElevenLabs voices if API key is configured
      if (nextSettings.elevenLabsApiKey) {
        await loadElevenLabsVoices();
      }
    } catch (error) {
      console.error("Failed to load voice settings:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadElevenLabsVoices = async () => {
    try {
      setLoadingVoices(true);
      const voices = await window.electronAPI.getElevenLabsVoices();
      setElevenLabsVoices(voices);
    } catch (error) {
      console.error("Failed to load ElevenLabs voices:", error);
    } finally {
      setLoadingVoices(false);
    }
  };

  const saveSettings = async (newSettings: Partial<VoiceSettingsType>) => {
    try {
      setSaving(true);
      const updated = await window.electronAPI.saveVoiceSettings(newSettings);
      setSettings(updated);
    } catch (error) {
      console.error("Failed to save voice settings:", error);
    } finally {
      setSaving(false);
    }
  };

  // Debounced save for text inputs - prevents race conditions when typing
  const debouncedSave = useCallback(
    (newSettings: Partial<VoiceSettingsType>) => {
      // Merge with any pending settings
      pendingSettingsRef.current = {
        ...pendingSettingsRef.current,
        ...newSettings,
      };

      // Update local state immediately for responsive UI
      setSettings((prev) => ({ ...prev, ...newSettings }));

      // Clear existing timeout
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      // Schedule save after user stops typing
      saveTimeoutRef.current = setTimeout(async () => {
        const toSave = pendingSettingsRef.current;
        pendingSettingsRef.current = {};

        try {
          setSaving(true);
          const updated = await window.electronAPI.saveVoiceSettings(toSave);
          setSettings(updated);
        } catch (error) {
          console.error("Failed to save voice settings:", error);
        } finally {
          setSaving(false);
        }
      }, 500); // Wait 500ms after last keystroke before saving
    },
    [],
  );

  const handleToggleEnabled = async () => {
    await saveSettings({ enabled: !settings.enabled });
  };

  const handleTTSProviderChange = async (provider: VoiceProvider) => {
    // When switching to Azure, also switch STT to Azure for consistency
    // When switching away from Azure, switch STT to OpenAI (most common)
    if (provider === "azure" && settings.sttProvider !== "azure") {
      await saveSettings({ ttsProvider: provider, sttProvider: "azure" });
    } else if (provider !== "azure" && settings.sttProvider === "azure") {
      await saveSettings({ ttsProvider: provider, sttProvider: "openai" });
    } else {
      await saveSettings({ ttsProvider: provider });
    }
  };

  const handleSTTProviderChange = async (provider: VoiceProvider) => {
    await saveSettings({ sttProvider: provider });
  };

  // Text input handlers use debounced save to prevent race conditions
  const handleElevenLabsApiKeyChange = (apiKey: string) => {
    debouncedSave({ elevenLabsApiKey: apiKey });
    // Load voices after debounce completes
    if (apiKey) {
      // Delay voice loading to match save timing
      setTimeout(() => loadElevenLabsVoices(), 600);
    } else {
      setElevenLabsVoices([]);
    }
  };

  const handleElevenLabsAgentsApiKeyChange = (apiKey: string) => {
    debouncedSave({ elevenLabsAgentsApiKey: apiKey });
  };

  const handleElevenLabsAgentIdChange = (agentId: string) => {
    debouncedSave({ elevenLabsAgentId: agentId });
  };

  const handleElevenLabsAgentPhoneNumberIdChange = (phoneNumberId: string) => {
    debouncedSave({ elevenLabsAgentPhoneNumberId: phoneNumberId });
  };

  const handleOpenAIApiKeyChange = (apiKey: string) => {
    debouncedSave({ openaiApiKey: apiKey });
  };

  const handleAzureEndpointChange = (endpoint: string) => {
    debouncedSave({ azureEndpoint: endpoint });
  };

  const handleAzureApiKeyChange = (apiKey: string) => {
    debouncedSave({ azureApiKey: apiKey });
  };

  const handleAzureTtsDeploymentChange = (deploymentName: string) => {
    debouncedSave({ azureTtsDeploymentName: deploymentName });
  };

  const handleAzureSttDeploymentChange = (deploymentName: string) => {
    debouncedSave({ azureSttDeploymentName: deploymentName });
  };

  const handleAzureVoiceChange = async (voice: string) => {
    await saveSettings({
      azureVoice: voice as
        "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer",
    });
  };

  const handleVoiceChange = async (voiceId: string) => {
    if (settings.ttsProvider === "elevenlabs") {
      await saveSettings({ elevenLabsVoiceId: voiceId });
    } else if (settings.ttsProvider === "openai") {
      await saveSettings({
        openaiVoice: voiceId as
          "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer",
      });
    }
  };

  const handleInputModeChange = async (mode: VoiceInputMode) => {
    await saveSettings({ inputMode: mode });
  };

  const handleResponseModeChange = async (mode: VoiceResponseMode) => {
    await saveSettings({ responseMode: mode });
  };

  const handleVolumeChange = async (volume: number) => {
    await saveSettings({ volume });
  };

  const handleSpeechRateChange = async (rate: number) => {
    await saveSettings({ speechRate: rate });
  };

  const handleLanguageChange = async (language: string) => {
    await saveSettings({ language });
  };

  const handleTestElevenLabs = async () => {
    setTestingElevenLabs(true);
    setElevenLabsTestResult(null);
    try {
      const result = await window.electronAPI.testElevenLabsConnection();
      setElevenLabsTestResult({
        success: result.success,
        message: result.success
          ? `Connected! Found ${result.voiceCount} voices.`
          : result.error || "Connection failed",
      });
    } catch (error: Any) {
      setElevenLabsTestResult({
        success: false,
        message: error.message || "Connection failed",
      });
    } finally {
      setTestingElevenLabs(false);
    }
  };

  const handleTestOpenAI = async () => {
    setTestingOpenAI(true);
    setOpenAITestResult(null);
    try {
      const result = await window.electronAPI.testOpenAIVoiceConnection();
      setOpenAITestResult({
        success: result.success,
        message: result.success
          ? "Connected!"
          : result.error || "Connection failed",
      });
    } catch (error: Any) {
      setOpenAITestResult({
        success: false,
        message: error.message || "Connection failed",
      });
    } finally {
      setTestingOpenAI(false);
    }
  };

  const handleTestAzure = async () => {
    setTestingAzure(true);
    setAzureTestResult(null);
    try {
      const result = await window.electronAPI.testAzureVoiceConnection();
      setAzureTestResult({
        success: result.success,
        message: result.success
          ? "Connected!"
          : result.error || "Connection failed",
      });
    } catch (error: Any) {
      setAzureTestResult({
        success: false,
        message: error.message || "Connection failed",
      });
    } finally {
      setTestingAzure(false);
    }
  };

  const handleTestSpeech = async () => {
    setTestingSpeech(true);
    try {
      const result = await window.electronAPI.voiceSpeak(
        "Hello! This is a test of the text to speech system.",
      );
      if (result.success && result.audioData) {
        // Play audio in renderer process
        await playAudioData(result.audioData, settings.volume);
      } else if (!result.success) {
        console.error("Test speech failed:", result.error);
      }
    } catch (error) {
      console.error("Test speech failed:", error);
    } finally {
      await window.electronAPI.voiceStopSpeaking();
      setTestingSpeech(false);
    }
  };

  const handleStopSpeaking = async () => {
    await window.electronAPI.voiceStopSpeaking();
    setTestingSpeech(false);
  };

  if (loading) {
    return (
      <div className="settings-loading">
        {t("voice.loading", "Loading voice settings...")}
      </div>
    );
  }

  return (
    <div className="voice-settings">
      {/* Enable/Disable */}
      <section className="voice-mode-card">
        <div className="settings-header-row">
          <div>
            <h3>{t("voice.mode.title", "Voice Mode")}</h3>
            <p className="settings-description">
              {t(
                "voice.mode.description",
                "Enable hands-free interaction with text-to-speech and speech-to-text.",
              )}
            </p>
          </div>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={settings.enabled}
              onChange={handleToggleEnabled}
              disabled={saving}
            />
            <span className="toggle-slider" />
          </label>
        </div>

        {/* Status indicator */}
        {settings.enabled && (
          <div
            className={`voice-status ${voiceState.isActive ? "active" : "inactive"}`}
          >
            <span className="status-dot" />
            <span className="status-text">
              {voiceState.isSpeaking
                ? t("voice.status.speaking", "Speaking...")
                : voiceState.isListening
                  ? t("voice.status.listening", "Listening...")
                  : voiceState.isProcessing
                    ? t("voice.status.processing", "Processing...")
                    : voiceState.isActive
                      ? t("voice.status.ready", "Ready")
                      : t("voice.status.inactive", "Inactive")}
            </span>
          </div>
        )}
      </section>

      <section
        className="voice-quick-settings"
        aria-label={translate(
          "generated.components.voicesettings.439.0",
          "Voice basic settings",
        )}
      >
        <div className="voice-quick-heading">
          <div>
            <span className="voice-quick-eyebrow">
              {translate(
                "generated.components.voicesettings.442.1",
                "Basic settings",
              )}
            </span>
            <h4>
              {translate(
                "generated.components.voicesettings.443.2",
                "Start voice interaction with minimal setup",
              )}
            </h4>
            <p>
              {translate(
                "generated.components.voicesettings.445.3",
                "Select the sound service and interaction method; the key, identification service and outbound call can be filled in as needed in the advanced configuration.",
              )}
            </p>
          </div>
          <Volume2 size={20} aria-hidden="true" />
        </div>

        <div className="voice-quick-grid">
          <label className="voice-quick-field">
            <span>
              {translate(
                "generated.components.voicesettings.453.4",
                "sound service",
              )}
            </span>
            <select
              className="settings-select"
              value={settings.ttsProvider}
              onChange={(event) =>
                handleTTSProviderChange(event.target.value as VoiceProvider)
              }
              disabled={saving}
            >
              <option value="local">
                {translate(
                  "generated.components.voicesettings.462.5",
                  "System default (recommended)",
                )}
              </option>
              <option value="openai">OpenAI</option>
              <option value="elevenlabs">ElevenLabs</option>
              <option value="azure">Azure OpenAI</option>
            </select>
          </label>

          {settings.ttsProvider === "elevenlabs" ? (
            <label className="voice-quick-field">
              <span>
                {translate("generated.components.voicesettings.471.6", "sound")}
              </span>
              <select
                className="settings-select"
                value={settings.elevenLabsVoiceId || ""}
                onChange={(event) => handleVoiceChange(event.target.value)}
                disabled={loadingVoices || elevenLabsVoices.length === 0}
              >
                <option value="">
                  {loadingVoices
                    ? translate(
                        "generated.components.voicesettings.480.7",
                        "Loading sounds…",
                      )
                    : elevenLabsVoices.length === 0
                      ? translate(
                          "generated.components.voicesettings.482.8",
                          "Please fill in the API Key in the advanced configuration first",
                        )
                      : translate(
                          "generated.components.voicesettings.483.9",
                          "Select sound",
                        )}
                </option>
                {elevenLabsVoices.map((voice) => (
                  <option key={voice.voice_id} value={voice.voice_id}>
                    {voice.name}
                  </option>
                ))}
              </select>
            </label>
          ) : settings.ttsProvider === "openai" ||
            settings.ttsProvider === "azure" ? (
            <label className="voice-quick-field">
              <span>
                {translate(
                  "generated.components.voicesettings.495.10",
                  "sound",
                )}
              </span>
              <select
                className="settings-select"
                value={
                  settings.ttsProvider === "azure"
                    ? settings.azureVoice
                    : settings.openaiVoice
                }
                onChange={(event) =>
                  settings.ttsProvider === "azure"
                    ? handleAzureVoiceChange(event.target.value)
                    : handleVoiceChange(event.target.value)
                }
                disabled={saving}
              >
                {OPENAI_VOICES.map((voice) => (
                  <option key={voice.id} value={voice.id}>
                    {voice.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <div className="voice-quick-system-note">
              <span>
                {translate(
                  "generated.components.voicesettings.519.11",
                  "sound",
                )}
              </span>
              <strong>
                {translate(
                  "generated.components.voicesettings.520.12",
                  "Follow the system default sound",
                )}
              </strong>
              <small>
                {translate(
                  "generated.components.voicesettings.521.13",
                  "No API Key is required, suitable for trial first.",
                )}
              </small>
            </div>
          )}
        </div>

        <div className="voice-quick-controls">
          <div className="voice-quick-control">
            <span>
              {translate(
                "generated.components.voicesettings.528.14",
                "way of speaking",
              )}
            </span>
            <div
              className="voice-segmented-control"
              role="group"
              aria-label={translate(
                "generated.components.voicesettings.532.15",
                "way of speaking",
              )}
            >
              <button
                className={
                  settings.inputMode === "push_to_talk" ? "active" : ""
                }
                onClick={() => handleInputModeChange("push_to_talk")}
                disabled={saving}
              >
                {translate(
                  "generated.components.voicesettings.541.16",
                  "Hold to speak",
                )}
              </button>
              <button
                className={
                  settings.inputMode === "voice_activity" ? "active" : ""
                }
                onClick={() => handleInputModeChange("voice_activity")}
                disabled={saving}
              >
                {translate(
                  "generated.components.voicesettings.550.17",
                  "automatic recognition",
                )}
              </button>
            </div>
          </div>
          <label className="voice-quick-control voice-response-control">
            <span>
              {translate(
                "generated.components.voicesettings.555.18",
                "Reply method",
              )}
            </span>
            <select
              className="settings-select"
              value={settings.responseMode}
              onChange={(event) =>
                handleResponseModeChange(
                  event.target.value as VoiceResponseMode,
                )
              }
              disabled={saving}
            >
              <option value="smart">
                {translate(
                  "generated.components.voicesettings.566.19",
                  "Intelligent reading (recommended)",
                )}
              </option>
              <option value="auto">
                {translate(
                  "generated.components.voicesettings.567.20",
                  "Read all",
                )}
              </option>
              <option value="manual">
                {translate(
                  "generated.components.voicesettings.568.21",
                  "Read only when needed",
                )}
              </option>
            </select>
          </label>
        </div>

        <div className="voice-quick-footer">
          <button
            className="button-secondary"
            onClick={handleTestSpeech}
            disabled={testingSpeech || !settings.enabled}
          >
            {testingSpeech
              ? translate(
                  "generated.components.voicesettings.579.22",
                  "Listening now…",
                )
              : translate(
                  "generated.components.voicesettings.579.23",
                  "Listen to the current sound",
                )}
          </button>
          {(testingSpeech || voiceState.isSpeaking) && (
            <button className="button-secondary" onClick={handleStopSpeaking}>
              {translate("generated.components.voicesettings.583.24", "stop")}
            </button>
          )}
          <button
            className={`voice-advanced-toggle ${advancedOpen ? "is-open" : ""}`}
            type="button"
            onClick={() => setAdvancedOpen((open) => !open)}
            aria-expanded={advancedOpen}
          >
            <SlidersHorizontal size={16} aria-hidden="true" />
            {translate(
              "generated.components.voicesettings.593.25",
              "Advanced configuration",
            )}
            <ChevronDown size={16} aria-hidden="true" />
          </button>
        </div>
      </section>

      {advancedOpen && (
        <div className="voice-advanced-content">
          {/* ElevenLabs Configuration */}
          {settings.ttsProvider === "elevenlabs" && (
            <div className="settings-section">
              <h4>{t("voice.elevenlabs.title", "ElevenLabs Configuration")}</h4>

              <div className="settings-field">
                <label>{t("voice.common.apiKey", "API Key")}</label>
                <div className="input-with-button">
                  <input
                    type="password"
                    className="settings-input"
                    placeholder={t(
                      "voice.elevenlabs.apiKeyPlaceholder",
                      "Enter your ElevenLabs API key",
                    )}
                    value={settings.elevenLabsApiKey || ""}
                    onChange={(e) =>
                      handleElevenLabsApiKeyChange(e.target.value)
                    }
                  />
                  <button
                    className="button-secondary"
                    onClick={handleTestElevenLabs}
                    disabled={testingElevenLabs || !settings.elevenLabsApiKey}
                  >
                    {testingElevenLabs
                      ? t("voice.common.testing", "Testing...")
                      : t("voice.common.test", "Test")}
                  </button>
                </div>
                <p className="settings-hint">
                  {t("voice.common.getApiKeyFrom", "Get your API key from")}{" "}
                  <a
                    href="https://elevenlabs.io/app/settings/api-keys"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    ElevenLabs Dashboard
                  </a>
                </p>
                {elevenLabsTestResult && (
                  <div
                    className={`test-result ${elevenLabsTestResult.success ? "success" : "error"}`}
                  >
                    {elevenLabsTestResult.message}
                  </div>
                )}
              </div>

              <div className="settings-field">
                <label>{t("voice.common.voice", "Voice")}</label>
                <select
                  className="settings-select"
                  value={settings.elevenLabsVoiceId || ""}
                  onChange={(e) => handleVoiceChange(e.target.value)}
                  disabled={loadingVoices || elevenLabsVoices.length === 0}
                >
                  <option value="">
                    {loadingVoices
                      ? t("voice.elevenlabs.loadingVoices", "Loading voices...")
                      : elevenLabsVoices.length === 0
                        ? t(
                            "voice.elevenlabs.enterKeyToLoad",
                            "Enter API key to load voices",
                          )
                        : t("voice.elevenlabs.selectVoice", "Select a voice")}
                  </option>
                  {elevenLabsVoices.map((voice) => (
                    <option key={voice.voice_id} value={voice.voice_id}>
                      {voice.name}
                      {voice.category && ` (${voice.category})`}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Phone Calls Configuration (ElevenLabs Agents) */}
          <div className="settings-section">
            <h4>{t("voice.phone.title", "Phone Calls (ElevenLabs Agents)")}</h4>
            <p className="settings-description">
              {t(
                "voice.phone.description",
                "Configure outbound phone calls initiated by the agent. Calls require an ElevenLabs agent and an outbound phone number configured in your ElevenLabs account.",
              )}
            </p>

            <div className="settings-field">
              <label>{t("voice.phone.agentsApiKey", "Agents API Key")}</label>
              <input
                type="password"
                className="settings-input"
                placeholder={t(
                  "voice.phone.agentsApiKeyPlaceholder",
                  "Enter your ElevenLabs Agents API key",
                )}
                value={settings.elevenLabsAgentsApiKey || ""}
                onChange={(e) =>
                  handleElevenLabsAgentsApiKeyChange(e.target.value)
                }
              />
              <p className="settings-hint">
                {t(
                  "voice.phone.agentsHint",
                  "Recommended: create an API key scoped to",
                )}{" "}
                <code>agents-write</code>{" "}
                {t(
                  "voice.phone.agentsHintSuffix",
                  "with a reasonable spend limit. If left blank, the app will fall back to the ElevenLabs API key from the TTS configuration (if set).",
                )}
              </p>
              <p className="settings-hint">
                {t("voice.common.getApiKeyFrom", "Get your API key from")}{" "}
                <a
                  href="https://elevenlabs.io/app/settings/api-keys"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  ElevenLabs Dashboard
                </a>
              </p>
            </div>

            <div className="settings-field">
              <label>{t("voice.phone.agentId", "Agent ID")}</label>
              <input
                type="text"
                className="settings-input"
                placeholder="e.g., 7f3d6c2e-...."
                value={settings.elevenLabsAgentId || ""}
                onChange={(e) => handleElevenLabsAgentIdChange(e.target.value)}
              />
              <p className="settings-hint">
                {t(
                  "voice.phone.agentIdHint",
                  "Used as the default agent for outbound calls. You can also pass an agent ID per call.",
                )}
              </p>
            </div>

            <div className="settings-field">
              <label>
                {t("voice.phone.phoneNumberId", "Outbound Phone Number ID")}
              </label>
              <input
                type="text"
                className="settings-input"
                placeholder="e.g., 2a1b3c4d-...."
                value={settings.elevenLabsAgentPhoneNumberId || ""}
                onChange={(e) =>
                  handleElevenLabsAgentPhoneNumberIdChange(e.target.value)
                }
              />
              <p className="settings-hint">
                {t(
                  "voice.phone.phoneNumberHint",
                  "The outbound phone number ID associated with your agent. Phone numbers should be configured in ElevenLabs.",
                )}
              </p>
            </div>
          </div>

          {/* OpenAI Configuration - show when TTS or STT uses OpenAI */}
          {(settings.ttsProvider === "openai" ||
            settings.sttProvider === "openai") && (
            <div className="settings-section">
              <h4>{t("voice.openai.title", "OpenAI Configuration")}</h4>

              <div className="settings-field">
                <label>{t("voice.common.apiKey", "API Key")}</label>
                <div className="input-with-button">
                  <input
                    type="password"
                    className="settings-input"
                    placeholder={t(
                      "voice.openai.apiKeyPlaceholder",
                      "Enter your OpenAI API key",
                    )}
                    value={settings.openaiApiKey || ""}
                    onChange={(e) => handleOpenAIApiKeyChange(e.target.value)}
                  />
                  <button
                    className="button-secondary"
                    onClick={handleTestOpenAI}
                    disabled={testingOpenAI}
                  >
                    {testingOpenAI
                      ? t("voice.common.testing", "Testing...")
                      : t("voice.common.test", "Test")}
                  </button>
                </div>
                <p className="settings-hint">
                  {t("voice.openai.requiredFor", "Required for")}{" "}
                  {settings.ttsProvider === "openai" &&
                  settings.sttProvider === "openai"
                    ? t("voice.openai.ttsAndStt", "TTS and STT")
                    : settings.ttsProvider === "openai"
                      ? "TTS"
                      : "STT (Whisper)"}
                  .
                </p>
                {openAITestResult && (
                  <div
                    className={`test-result ${openAITestResult.success ? "success" : "error"}`}
                  >
                    {openAITestResult.message}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Azure OpenAI Configuration - show when TTS or STT uses Azure */}
          {(settings.ttsProvider === "azure" ||
            settings.sttProvider === "azure") && (
            <div className="settings-section">
              <h4>{t("voice.azure.title", "Azure OpenAI Configuration")}</h4>

              <div className="settings-field">
                <label>{t("voice.azure.endpointUrl", "Endpoint URL")}</label>
                <input
                  type="text"
                  className="settings-input"
                  placeholder="https://your-resource.openai.azure.com"
                  value={settings.azureEndpoint || ""}
                  onChange={(e) => handleAzureEndpointChange(e.target.value)}
                />
                <p className="settings-hint">
                  {t(
                    "voice.azure.endpointHint",
                    "Your Azure OpenAI resource endpoint (e.g., https://your-resource.openai.azure.com)",
                  )}
                </p>
              </div>

              <div className="settings-field">
                <label>{t("voice.common.apiKey", "API Key")}</label>
                <div className="input-with-button">
                  <input
                    type="password"
                    className="settings-input"
                    placeholder={t(
                      "voice.azure.apiKeyPlaceholder",
                      "Enter your Azure OpenAI API key",
                    )}
                    value={settings.azureApiKey || ""}
                    onChange={(e) => handleAzureApiKeyChange(e.target.value)}
                  />
                  <button
                    className="button-secondary"
                    onClick={handleTestAzure}
                    disabled={
                      testingAzure ||
                      !settings.azureApiKey ||
                      !settings.azureEndpoint
                    }
                  >
                    {testingAzure
                      ? t("voice.common.testing", "Testing...")
                      : t("voice.common.test", "Test")}
                  </button>
                </div>
                <p className="settings-hint">
                  {t("voice.azure.getApiKeyFrom", "Get your API key from the")}{" "}
                  <a
                    href="https://portal.azure.com"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Azure Portal
                  </a>{" "}
                  {t(
                    "voice.azure.keysEndpointHint",
                    "under your OpenAI resource → Keys and Endpoint.",
                  )}
                </p>
                {azureTestResult && (
                  <div
                    className={`test-result ${azureTestResult.success ? "success" : "error"}`}
                  >
                    {azureTestResult.message}
                  </div>
                )}
              </div>

              {/* TTS Deployment Name - only show when using Azure for TTS */}
              {settings.ttsProvider === "azure" && (
                <div className="settings-field">
                  <label>
                    {t("voice.azure.ttsDeployment", "TTS Deployment Name")}
                  </label>
                  <input
                    type="text"
                    className="settings-input"
                    placeholder="e.g., tts-1"
                    value={settings.azureTtsDeploymentName || ""}
                    onChange={(e) =>
                      handleAzureTtsDeploymentChange(e.target.value)
                    }
                  />
                  <p className="settings-hint">
                    {t(
                      "voice.azure.ttsDeploymentHint",
                      "The deployment name for your TTS model in Azure OpenAI.",
                    )}
                  </p>
                </div>
              )}

              {/* STT Deployment Name - only show when using Azure for STT */}
              {settings.sttProvider === "azure" && (
                <div className="settings-field">
                  <label>
                    {t(
                      "voice.azure.sttDeployment",
                      "STT (Whisper) Deployment Name",
                    )}
                  </label>
                  <input
                    type="text"
                    className="settings-input"
                    placeholder="e.g., whisper-1"
                    value={settings.azureSttDeploymentName || ""}
                    onChange={(e) =>
                      handleAzureSttDeploymentChange(e.target.value)
                    }
                  />
                  <p className="settings-hint">
                    {t(
                      "voice.azure.sttDeploymentHint",
                      "The deployment name for your Whisper model in Azure OpenAI.",
                    )}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Speech-to-Text Provider */}
          <div className="settings-section">
            <h4>{t("voice.sttProvider.title", "Speech-to-Text Provider")}</h4>
            <p className="settings-description">
              {t(
                "voice.sttProvider.description",
                "Choose the speech recognition provider.",
              )}
            </p>
            <div className="llm-provider-tabs">
              <button
                className={`llm-provider-tab ${settings.sttProvider === "openai" ? "active" : ""}`}
                onClick={() => handleSTTProviderChange("openai")}
                disabled={saving}
              >
                <span className="llm-provider-tab-label">OpenAI Whisper</span>
                {settings.openaiApiKey && (
                  <span className="llm-provider-tab-status" />
                )}
              </button>
              <button
                className={`llm-provider-tab ${settings.sttProvider === "azure" ? "active" : ""}`}
                onClick={() => handleSTTProviderChange("azure")}
                disabled={saving}
              >
                <span className="llm-provider-tab-label">Azure Whisper</span>
                {settings.azureApiKey && settings.azureEndpoint && (
                  <span className="llm-provider-tab-status" />
                )}
              </button>
              <button
                className={`llm-provider-tab ${settings.sttProvider === "local" ? "active" : ""}`}
                onClick={() => handleSTTProviderChange("local")}
                disabled={saving}
              >
                <span className="llm-provider-tab-label">
                  {t("voice.provider.system", "System")}
                </span>
                <span className="llm-provider-tab-status" />
              </button>
            </div>
          </div>

          {/* Volume and Speech Rate */}
          <div className="settings-section">
            <h4>{t("voice.settings.title", "Voice Settings")}</h4>

            <div className="settings-field">
              <label>
                {t("voice.settings.volume", "Volume: {value}%", {
                  value: settings.volume,
                })}
              </label>
              <input
                type="range"
                min="0"
                max="100"
                value={settings.volume}
                onChange={(e) => handleVolumeChange(parseInt(e.target.value))}
                className="settings-slider"
              />
            </div>

            <div className="settings-field">
              <label>
                {t("voice.settings.speechRate", "Speech Rate: {value}x", {
                  value: settings.speechRate,
                })}
              </label>
              <input
                type="range"
                min="0.5"
                max="2"
                step="0.1"
                value={settings.speechRate}
                onChange={(e) =>
                  handleSpeechRateChange(parseFloat(e.target.value))
                }
                className="settings-slider"
              />
            </div>
          </div>

          {/* Language */}
          <div className="settings-section">
            <h4>{t("voice.language", "Language")}</h4>
            <select
              className="settings-select"
              value={settings.language}
              onChange={(e) => handleLanguageChange(e.target.value)}
              disabled={saving}
            >
              {VOICE_LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {t(`voice.language.${lang.code}`, lang.name)}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  );
}
