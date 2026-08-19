import {
  DEFAULT_ASSISTANT_NAME,
  type PersonalityConfigV2,
  type RelationshipData,
} from "../../../shared/types";
import { translate, useLanguage } from "../../i18n";
import { PersonalityTabHeader } from "./PersonalityTabHeader";

interface PersonalityIdentityTabProps {
  config: PersonalityConfigV2;
  relationshipStats: {
    tasksCompleted: number;
    projectsCount: number;
    daysTogether: number;
    nextMilestone: number | null;
  } | null;
  onUpdate: (updates: Partial<PersonalityConfigV2>) => void;
  onSave: () => Promise<void>;
  saving: boolean;
}

export function PersonalityIdentityTab({
  config,
  relationshipStats,
  onUpdate,
  onSave,
  saving,
}: PersonalityIdentityTabProps) {
  useLanguage();
  const t = translate;
  const relationship = config.relationship ?? ({} as RelationshipData);

  return (
    <div className="personality-identity-tab settings-section">
      <PersonalityTabHeader
        title={t("personality.identity.title", "Identity")}
        description={t(
          "personality.identity.description",
          "Agent name, your name, and relationship stats.",
        )}
      />

      <div className="personality-settings-list">
        <div className="personality-setting-row">
          <div className="personality-setting-copy">
            <label htmlFor="agent-name">
              {t("personality.identity.assistantName", "Assistant Name")}
            </label>
            <p>
              {t(
                "personality.identity.assistantNameHint",
                "Used as the assistant's name in conversations and system instructions.",
              )}
            </p>
          </div>
          <div className="agent-name-input-row">
            <input
              id="agent-name"
              type="text"
              className="settings-input"
              placeholder={DEFAULT_ASSISTANT_NAME}
              value={config.agentName ?? ""}
              onChange={(e) => onUpdate({ agentName: e.target.value })}
              maxLength={50}
            />
            <button
              className="button-secondary personality-save-button"
              onClick={onSave}
              disabled={saving || !config.agentName?.trim()}
            >
              {saving
                ? t("personality.common.saving", "Saving...")
                : t("personality.common.save", "Save")}
            </button>
          </div>
        </div>

        <div className="personality-setting-row">
          <div className="personality-setting-copy">
            <label htmlFor="user-name">
              {t("personality.identity.yourName", "Your Name")}
            </label>
            <p>
              {t(
                "personality.identity.yourNameHint",
                "The assistant will use this to personalize interactions",
              )}
            </p>
          </div>
          <div className="agent-name-input-row">
            <input
              id="user-name"
              type="text"
              className="settings-input"
              placeholder={t(
                "personality.identity.yourNamePlaceholder",
                "What should I call you?",
              )}
              value={relationship.userName ?? ""}
              onChange={(e) =>
                onUpdate({
                  relationship: {
                    ...relationship,
                    userName: e.target.value || undefined,
                  },
                })
              }
              maxLength={50}
            />
            <button
              className="button-secondary personality-save-button"
              onClick={onSave}
              disabled={saving}
            >
              {saving
                ? t("personality.common.saving", "Saving...")
                : t("personality.common.save", "Save")}
            </button>
          </div>
        </div>
      </div>

      {relationshipStats && (
        <div className="relationship-stats">
          <h4>
            {t("personality.identity.journeyTitle", "Our Journey Together")}
          </h4>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-value">
                {relationshipStats.tasksCompleted}
              </div>
              <div className="stat-label">
                {t("personality.identity.tasksCompleted", "Tasks Completed")}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-value">
                {relationshipStats.projectsCount}
              </div>
              <div className="stat-label">
                {t("personality.identity.projects", "Projects")}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{relationshipStats.daysTogether}</div>
              <div className="stat-label">
                {t("personality.identity.daysTogether", "Days Together")}
              </div>
            </div>
          </div>
          {relationshipStats.nextMilestone && (
            <div className="milestone-progress">
              <span className="progress-text">
                {t(
                  "personality.identity.nextMilestoneProgress",
                  "{completed} / {target} to next milestone",
                  {
                    completed: relationshipStats.tasksCompleted,
                    target: relationshipStats.nextMilestone,
                  },
                )}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
