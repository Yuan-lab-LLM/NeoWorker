import type { SkillStatusEntry } from "../../shared/types";
import type { SupportedLanguage } from "../i18n";
import { getLocalizedSkillText } from "./localized-skills";

type AgentRoleSkillSource = {
  soul?: string;
};

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function getAgentRoleLinkedSkillIds(
  role: AgentRoleSkillSource,
): string[] {
  const rawSoul = role.soul?.trim();
  if (!rawSoul) return [];

  try {
    const root = readRecord(JSON.parse(rawSoul));
    if (!root) return [];
    const studio = readRecord(root.studio);
    const builderPlan = readRecord(studio?.builderPlan);
    return Array.from(
      new Set([
        ...readStringArray(root.skills),
        ...readStringArray(root.selectedSkills),
        ...readStringArray(studio?.skills),
        ...readStringArray(builderPlan?.selectedSkills),
      ]),
    );
  } catch {
    return [];
  }
}

export function getAgentRoleLinkedSkillLabels(
  role: AgentRoleSkillSource,
  catalog: SkillStatusEntry[] = [],
  language: SupportedLanguage = "zh-CN",
): string[] {
  const catalogById = new Map(catalog.map((skill) => [skill.id, skill]));
  return getAgentRoleLinkedSkillIds(role).map((skillId) => {
    const skill = catalogById.get(skillId);
    return getLocalizedSkillText(
      skill || { id: skillId, name: skillId, description: "" },
      language,
    ).name;
  });
}
