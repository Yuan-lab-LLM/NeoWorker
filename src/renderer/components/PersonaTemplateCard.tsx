import type { AgentCapability } from "../../electron/preload";
import { translate, useLanguage } from "../i18n";
import { resolveTwinIcon } from "../utils/twin-icons";
import {
  getLocalizedAgentCapability,
  getLocalizedAgentRoleText,
  getLocalizedAutonomyLabel,
} from "../utils/localized-agent-roles";

interface PersonaTemplateData {
  id: string;
  version: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  category: string;
  role: {
    capabilities: AgentCapability[];
    autonomyLevel: string;
    personalityId: string;
    systemPrompt: string;
    soul: string;
  };
  skills: Array<{ skillId: string; reason: string; required: boolean }>;
  tags: string[];
  seniorityRange: string[];
  industryAgnostic: boolean;
}

export type { PersonaTemplateData };

interface PersonaTemplateCardProps {
  template: PersonaTemplateData;
  onActivate: (template: PersonaTemplateData) => void;
}

export function PersonaTemplateCard({
  template,
  onActivate,
}: PersonaTemplateCardProps) {
  useLanguage();
  const t = translate;
  const capabilities = template.role?.capabilities ?? [];
  const skills = template.skills ?? [];
  const localizedTemplate = getLocalizedAgentRoleText({
    name: template.id,
    displayName: template.name,
    description: template.description,
  });

  return (
    <div className="pt-card" onClick={() => onActivate(template)}>
      <div className="pt-card-header">
        <span className="pt-card-icon">
          {(() => {
            const Icon = resolveTwinIcon(template.icon);
            return <Icon size={18} strokeWidth={2} />;
          })()}
        </span>
        <span className="pt-card-name">{localizedTemplate.name}</span>
      </div>

      <p className="pt-card-description">{localizedTemplate.description}</p>

      <div className="pt-card-tags">
        {capabilities.slice(0, 4).map((cap) => (
          <span key={cap} className="pt-tag">
            {getLocalizedAgentCapability(cap)}
          </span>
        ))}
        {capabilities.length > 4 && (
          <span className="pt-tag">+{capabilities.length - 4}</span>
        )}
      </div>

      <div className="pt-card-footer">
        <span className="pt-card-meta">
          {t(
            "personaTemplates.presetMeta",
            "Persona preset · {count} skills · {level}",
            {
              count: skills.length,
              level: getLocalizedAutonomyLabel(template.role.autonomyLevel),
            },
          )}
        </span>
        <span className="pt-card-action">
          {t("personaTemplates.activateAction", "Activate ->")}
        </span>
      </div>
    </div>
  );
}
