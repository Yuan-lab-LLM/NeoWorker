import type { CSSProperties } from "react";
import {
  Briefcase,
  Check,
  Coffee,
  Palette,
  Smile,
  Wrench,
  Zap,
} from "lucide-react";
import type {
  PersonalityConfigV2,
  PersonalityTrait,
} from "../../../shared/types";
import { TRAIT_DEFINITIONS } from "../../../shared/types";
import { translate, useLanguage } from "../../i18n";
import { PersonalityTabHeader } from "./PersonalityTabHeader";

const PRESET_ICONS: Record<string, typeof Briefcase> = {
  professional: Briefcase,
  friendly: Smile,
  concise: Zap,
  creative: Palette,
  technical: Wrench,
  casual: Coffee,
};

interface PersonalityTraitsTabProps {
  config: PersonalityConfigV2;
  presets: Record<
    string,
    {
      name: string;
      description: string;
      icon: string;
      traits: Record<string, number>;
    }
  >;
  onUpdate: (updates: Partial<PersonalityConfigV2>) => void;
  onSave: () => Promise<void>;
  saving: boolean;
  onToast?: (msg: string) => void;
}

export function PersonalityTraitsTab({
  config,
  presets,
  onUpdate,
  onSave,
  saving: _saving,
  onToast,
}: PersonalityTraitsTabProps) {
  useLanguage();
  const t = translate;

  const presetName = (id: string, fallback: string) =>
    t(`personality.preset.${id}.name`, fallback);
  const presetDescription = (id: string, fallback: string) =>
    t(`personality.preset.${id}.description`, fallback);
  const traitLabel = (id: string, fallback: string) =>
    t(`personality.trait.${id}.label`, fallback);
  const traitLowLabel = (id: string, fallback: string) =>
    t(`personality.trait.${id}.low`, fallback);
  const traitHighLabel = (id: string, fallback: string) =>
    t(`personality.trait.${id}.high`, fallback);

  const applyPreset = (presetId: string) => {
    const preset = presets[presetId];
    if (!preset) return;
    const traits: PersonalityTrait[] = TRAIT_DEFINITIONS.map((def) => ({
      id: def.id,
      label: def.label,
      intensity: preset.traits[def.id] ?? def.defaultIntensity,
      description: def.description,
    }));
    onUpdate({ traits });
    void onSave();
    onToast?.(
      t("personality.traits.appliedPreset", "Applied {name} template", {
        name: presetName(presetId, preset.name),
      }),
    );
  };

  const setTraitIntensity = (id: string, intensity: number) => {
    const traits = config.traits.map((t) =>
      t.id === id ? { ...t, intensity } : t,
    );
    onUpdate({ traits });
  };

  const isPresetActive = (presetTraits: Record<string, number>) =>
    TRAIT_DEFINITIONS.every((definition) => {
      const currentTrait = config.traits.find(
        (trait) => trait.id === definition.id,
      );
      return (
        currentTrait?.intensity ===
        (presetTraits[definition.id] ?? definition.defaultIntensity)
      );
    });

  return (
    <div className="personality-traits-tab settings-section">
      <PersonalityTabHeader
        title={t("personality.traits.title", "Personality")}
        description={t(
          "personality.traits.description",
          "Quick-start presets and composable trait sliders.",
        )}
      />

      <div className="preset-quick-start">
        <h4>{t("personality.traits.quickStart", "Quick Start")}</h4>
        <div className="preset-grid">
          {Object.entries(presets).map(([id, p]) => {
            const Icon = PRESET_ICONS[id];
            const active = isPresetActive(p.traits);
            return (
              <button
                key={id}
                type="button"
                className={`preset-btn ${active ? "active" : ""}`}
                onClick={() => applyPreset(id)}
                title={presetDescription(id, p.description)}
                aria-pressed={active}
              >
                <span className="preset-btn-icon" aria-hidden="true">
                  {Icon ? <Icon size={18} strokeWidth={1.8} /> : null}
                </span>
                <span className="preset-btn-copy">
                  <span className="preset-btn-name">
                    {presetName(id, p.name)}
                  </span>
                  <span className="preset-btn-description">
                    {presetDescription(id, p.description)}
                  </span>
                </span>
                {active ? (
                  <Check
                    className="preset-btn-check"
                    size={16}
                    strokeWidth={2}
                    aria-hidden="true"
                  />
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      <div className="trait-sliders">
        <h4>{t("personality.traits.traitMixer", "Trait Mixer")}</h4>
        <div className="trait-grid">
          {config.traits.map((trait) => {
            const def = TRAIT_DEFINITIONS.find((d) => d.id === trait.id);
            if (!def) return null;
            const label =
              trait.intensity >= 70
                ? traitHighLabel(def.id, def.highLabel)
                : trait.intensity <= 30
                  ? traitLowLabel(def.id, def.lowLabel)
                  : t("personality.option.balanced", "Balanced");
            const inputId = `personality-trait-${trait.id}`;
            return (
              <div key={trait.id} className="trait-row">
                <div className="trait-row-header">
                  <label htmlFor={inputId} className="trait-row-title">
                    {traitLabel(def.id, def.label)}
                  </label>
                  <span className="trait-row-value">
                    <strong>{trait.intensity}</strong>
                    <span>{label}</span>
                  </span>
                </div>
                <input
                  id={inputId}
                  type="range"
                  min={0}
                  max={100}
                  value={trait.intensity}
                  aria-valuetext={`${trait.intensity} - ${label}`}
                  style={
                    {
                      "--trait-value": `${trait.intensity}%`,
                    } as CSSProperties
                  }
                  onChange={(e) =>
                    setTraitIntensity(trait.id, parseInt(e.target.value, 10))
                  }
                  onMouseUp={() => void onSave()}
                  onTouchEnd={() => void onSave()}
                  onKeyUp={() => void onSave()}
                />
                <div className="trait-range-labels" aria-hidden="true">
                  <span>{traitLowLabel(def.id, def.lowLabel)}</span>
                  <span>{traitHighLabel(def.id, def.highLabel)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
