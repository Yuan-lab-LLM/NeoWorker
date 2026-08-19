import { useState, useEffect, useRef } from "react";
import { Settings2, SlidersHorizontal } from "lucide-react";
import type { PersonalityConfigV2 } from "../../shared/types";
import { PersonalityIdentityTab } from "./personality/PersonalityIdentityTab";
import { PersonalityTraitsTab } from "./personality/PersonalityTraitsTab";
import { PersonalityAdvancedTab } from "./personality/PersonalityAdvancedTab";
import { PersonalityMemoryTab } from "./personality/PersonalityMemoryTab";
import { translate, useLanguage } from "../i18n";
import "./personality-settings.css";

type TabId = "personality" | "advanced";

interface PersonalitySettingsProps {
  onSettingsChanged?: () => void;
}

export function PersonalitySettings({
  onSettingsChanged,
}: PersonalitySettingsProps) {
  useLanguage();
  const t = translate;
  const [config, setConfig] = useState<PersonalityConfigV2 | null>(null);
  const configRef = useRef<PersonalityConfigV2 | null>(null);
  const saveInFlightRef = useRef(false);
  const saveQueuedRef = useRef(false);
  const reloadAfterSaveRef = useRef(false);
  const [presets, setPresets] = useState<
    Record<
      string,
      {
        name: string;
        description: string;
        icon: string;
        traits: Record<string, number>;
      }
    >
  >({});
  const [relationshipStats, setRelationshipStats] = useState<{
    tasksCompleted: number;
    projectsCount: number;
    daysTogether: number;
    nextMilestone: number | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("personality");
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    void loadData({ showLoading: true });
  }, []);

  useEffect(() => {
    if (!window.electronAPI?.onPersonalitySettingsChanged) return;
    const unsub = window.electronAPI.onPersonalitySettingsChanged(() => {
      if (saveInFlightRef.current) {
        reloadAfterSaveRef.current = true;
        return;
      }
      void loadData({ showLoading: false });
      onSettingsChanged?.();
    });
    return unsub;
  }, [onSettingsChanged]);

  const loadData = async (options?: { showLoading?: boolean }) => {
    const showLoading = options?.showLoading ?? configRef.current === null;
    try {
      if (showLoading) setLoading(true);
      const [loadedConfig, loadedPresets, stats] = await Promise.all([
        window.electronAPI.getPersonalityConfigV2(),
        window.electronAPI.getPersonalityTraitPresets?.(),
        window.electronAPI.getRelationshipStats?.(),
      ]);
      const nextConfig = loadedConfig as PersonalityConfigV2;
      configRef.current = nextConfig;
      setConfig(nextConfig);
      setPresets(
        (loadedPresets as Record<
          string,
          {
            name: string;
            description: string;
            icon: string;
            traits: Record<string, number>;
          }
        >) ?? {},
      );
      setRelationshipStats(stats as typeof relationshipStats);
    } catch (err) {
      console.error("Failed to load personality settings:", err);
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  const handleUpdate = (updates: Partial<PersonalityConfigV2>) => {
    const current = configRef.current;
    if (!current) return;
    const nextConfig = { ...current, ...updates };
    configRef.current = nextConfig;
    setConfig(nextConfig);
  };

  const handleSave = async () => {
    if (!configRef.current) return;
    if (saveInFlightRef.current) {
      saveQueuedRef.current = true;
      setSaving(true);
      return;
    }

    saveInFlightRef.current = true;
    let saved = false;
    try {
      setSaving(true);
      do {
        saveQueuedRef.current = false;
        const configToSave = configRef.current;
        if (!configToSave) break;
        await window.electronAPI.savePersonalityConfigV2(configToSave);
        saved = true;
      } while (saveQueuedRef.current);
      if (saved) {
        onSettingsChanged?.();
      }
    } catch (err) {
      console.error("Failed to save personality settings:", err);
    } finally {
      saveInFlightRef.current = false;
      setSaving(false);
      if (reloadAfterSaveRef.current) {
        reloadAfterSaveRef.current = false;
        void loadData({ showLoading: false });
      }
    }
  };

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  };

  if (loading || !config) {
    return (
      <div className="settings-loading">
        {t("personality.loading", "Loading personality settings...")}
      </div>
    );
  }

  const tabs = [
    {
      id: "personality" as const,
      label: t("personality.tab.personality", "Personality"),
      icon: SlidersHorizontal,
    },
    {
      id: "advanced" as const,
      label: t("personality.tab.advanced", "Advanced"),
      icon: Settings2,
    },
  ];

  return (
    <div className="personality-settings">
      <div
        className="personality-nav"
        role="tablist"
        aria-label={t("personality.tabsLabel", "Personality sections")}
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              className={`personality-nav-btn ${activeTab === tab.id ? "active" : ""}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <Icon size={15} strokeWidth={1.7} aria-hidden="true" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {activeTab === "personality" && (
        <>
          <PersonalityIdentityTab
            config={config}
            relationshipStats={relationshipStats}
            onUpdate={handleUpdate}
            onSave={handleSave}
            saving={saving}
          />
          <PersonalityMemoryTab onChanged={onSettingsChanged} />
          <PersonalityTraitsTab
            config={config}
            presets={presets}
            onUpdate={handleUpdate}
            onSave={handleSave}
            saving={saving}
            onToast={showToast}
          />
        </>
      )}
      {activeTab === "advanced" && (
        <PersonalityAdvancedTab
          config={config}
          onUpdate={handleUpdate}
          onSave={handleSave}
          saving={saving}
        />
      )}

      {toast && <div className="personality-toast">{toast}</div>}
    </div>
  );
}
