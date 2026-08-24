import { useState } from "react";
import type {
  PersonalityConfigV2,
  BehavioralRule,
  ExpertiseArea,
} from "../../../shared/types";
import { translate, useLanguage } from "../../i18n";
import { PersonalityTabHeader } from "./PersonalityTabHeader";

interface PersonalityInstructionsTabProps {
  config: PersonalityConfigV2;
  onUpdate: (updates: Partial<PersonalityConfigV2>) => void;
  onSave: () => Promise<void>;
  saving: boolean;
}

const RULE_TYPES: BehavioralRule["type"][] = [
  "always",
  "never",
  "prefer",
  "avoid",
];

export function PersonalityInstructionsTab({
  config,
  onUpdate,
  onSave,
  saving,
}: PersonalityInstructionsTabProps) {
  useLanguage();
  const t = translate;
  const [newRuleType, setNewRuleType] =
    useState<BehavioralRule["type"]>("always");
  const [newRuleText, setNewRuleText] = useState("");
  const [newExpertiseDomain, setNewExpertiseDomain] = useState("");
  const [newExpertiseLevel, setNewExpertiseLevel] =
    useState<ExpertiseArea["level"]>("proficient");

  const addRule = () => {
    if (!newRuleText.trim()) return;
    const rules = [...(config.rules ?? [])];
    rules.push({
      id: `rule-${Date.now()}`,
      type: newRuleType,
      rule: newRuleText.trim(),
      enabled: true,
    });
    onUpdate({ rules });
    setNewRuleText("");
    onSave();
  };

  const removeRule = (id: string) => {
    onUpdate({
      rules: (config.rules ?? []).filter((r) => r.id !== id),
    });
    onSave();
  };

  const toggleRule = (id: string) => {
    onUpdate({
      rules: (config.rules ?? []).map((r) =>
        r.id === id ? { ...r, enabled: !r.enabled } : r,
      ),
    });
    onSave();
  };

  const addExpertise = () => {
    if (!newExpertiseDomain.trim()) return;
    const expertise = [...(config.expertise ?? [])];
    expertise.push({
      id: `ex-${Date.now()}`,
      domain: newExpertiseDomain.trim(),
      level: newExpertiseLevel,
    });
    onUpdate({ expertise });
    setNewExpertiseDomain("");
    onSave();
  };

  const removeExpertise = (id: string) => {
    onUpdate({
      expertise: (config.expertise ?? []).filter((e) => e.id !== id),
    });
    onSave();
  };

  return (
    <div className="personality-instructions-tab settings-section">
      <PersonalityTabHeader
        title={t("personality.instructions.title", "Instructions")}
        description={t(
          "personality.instructions.description",
          "Custom instructions and behavioral rules.",
        )}
      />

      <div className="personality-instructions-card">
        <div className="personality-instructions-grid">
          <div className="form-group">
            <label htmlFor="about-user">
              {t("personality.instructions.aboutUser", "About the user")}
            </label>
            <p className="style-hint">
              {t(
                "personality.instructions.aboutUserHint",
                "What should the assistant know about you?",
              )}
            </p>
            <textarea
              id="about-user"
              className="settings-textarea"
              placeholder={t(
                "personality.instructions.aboutUserPlaceholder",
                "e.g. Senior fullstack dev, prefers functional patterns",
              )}
              value={config.customInstructions?.aboutUser ?? ""}
              onChange={(e) =>
                onUpdate({
                  customInstructions: {
                    ...config.customInstructions,
                    aboutUser: e.target.value,
                  },
                })
              }
              rows={4}
            />
          </div>

          <div className="form-group">
            <label htmlFor="response-guidance">
              {t(
                "personality.instructions.responseGuidance",
                "Response guidance",
              )}
            </label>
            <p className="style-hint">
              {t(
                "personality.instructions.responseGuidanceHint",
                "How should the assistant respond?",
              )}
            </p>
            <textarea
              id="response-guidance"
              className="settings-textarea"
              placeholder={t(
                "personality.instructions.responseGuidancePlaceholder",
                "e.g. Be opinionated. Don't hedge.",
              )}
              value={config.customInstructions?.responseGuidance ?? ""}
              onChange={(e) =>
                onUpdate({
                  customInstructions: {
                    ...config.customInstructions,
                    responseGuidance: e.target.value,
                  },
                })
              }
              rows={4}
            />
          </div>
        </div>

        <div className="personality-card-actions">
          <button className="button-primary" onClick={onSave} disabled={saving}>
            {saving
              ? t("personality.common.saving", "Saving...")
              : t("personality.instructions.save", "Save Instructions")}
          </button>
        </div>
      </div>

      <div className="behavioral-rules">
        <h4>
          {t("personality.instructions.behavioralRules", "Behavioral Rules")}
        </h4>
        <div className="rules-list">
          {(config.rules ?? []).map((r) => (
            <div key={r.id} className="rule-item">
              <input
                type="checkbox"
                checked={r.enabled}
                onChange={() => toggleRule(r.id)}
              />
              <span className="rule-type">{r.type.toUpperCase()}:</span>
              <span className="rule-text">{r.rule}</span>
              <button
                type="button"
                className="button-small rule-remove"
                onClick={() => removeRule(r.id)}
              >
                {t("personality.common.remove", "Remove")}
              </button>
            </div>
          ))}
        </div>
        <div className="add-rule-row">
          <select
            value={newRuleType}
            onChange={(e) =>
              setNewRuleType(e.target.value as BehavioralRule["type"])
            }
          >
            {RULE_TYPES.map((t) => (
              <option key={t} value={t}>
                {translate(`personality.ruleType.${t}`, t.toUpperCase())}
              </option>
            ))}
          </select>
          <input
            type="text"
            className="settings-input"
            placeholder={t(
              "personality.instructions.rulePlaceholder",
              "e.g. Explain your reasoning step by step",
            )}
            value={newRuleText}
            onChange={(e) => setNewRuleText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addRule()}
          />
          <button
            type="button"
            className="button-primary"
            onClick={addRule}
            disabled={!newRuleText.trim()}
          >
            {t("personality.common.add", "Add")}
          </button>
        </div>
      </div>

      <div className="expertise-tags">
        <h4>
          {t("personality.instructions.expertiseAreas", "Expertise Areas")}
        </h4>
        <div className="expertise-tag-list">
          {(config.expertise ?? []).map((e) => (
            <span key={e.id} className="expertise-tag">
              {e.domain} ({t(`personality.expertise.${e.level}`, e.level)})
              <button
                type="button"
                className="tag-remove"
                onClick={() => removeExpertise(e.id)}
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <div className="add-expertise-row">
          <input
            type="text"
            className="settings-input"
            placeholder={t(
              "personality.instructions.expertisePlaceholder",
              "e.g. TypeScript, React",
            )}
            value={newExpertiseDomain}
            onChange={(e) => setNewExpertiseDomain(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addExpertise()}
          />
          <select
            value={newExpertiseLevel}
            onChange={(e) =>
              setNewExpertiseLevel(e.target.value as ExpertiseArea["level"])
            }
          >
            <option value="familiar">
              {t("personality.expertise.familiar", "Familiar")}
            </option>
            <option value="proficient">
              {t("personality.expertise.proficient", "Proficient")}
            </option>
            <option value="expert">
              {t("personality.expertise.expert", "Expert")}
            </option>
          </select>
          <button
            type="button"
            className="button-primary"
            onClick={addExpertise}
            disabled={!newExpertiseDomain.trim()}
          >
            {t("personality.common.add", "Add")}
          </button>
        </div>
      </div>
    </div>
  );
}
