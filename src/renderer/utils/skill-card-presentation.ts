import type { CustomSkill, SkillStatusEntry, Workspace } from "../../shared/types";
import { getCurrentLanguage, translate, type SupportedLanguage } from "../i18n";
import { buildLocalizedSkillComposerPrompt, getLocalizedSkillText } from "./localized-skills";

export interface SkillUseSelection {
  skillId: string;
  skillLabel: string;
  prompt: string;
  workspacePath?: string;
  parameterSkill?: CustomSkill;
}

export function canUseSkillFromCatalog(skill: SkillStatusEntry): boolean {
  return skill.eligible && !skill.disabled && skill.enabled !== false && !skill.blockedByAllowlist
    && skill.invocation?.userInvocable !== false && skill.type !== "guideline";
}

export function getSkillCardText(skill: CustomSkill, language: SupportedLanguage = getCurrentLanguage()) {
  const localized = getLocalizedSkillText(skill, language);
  const original = localized.description || skill.description || "";
  // Catalog copy describes purpose. Preserve the complete routing guidance in details.
  const purpose = original.split(/\s*(?:Invoke when\b|Use this skill when\b|Trigger(?:s| conditions)?\s*:|触发条件\s*[：:])/i)[0].trim()
    || translate("skills.card.descriptionFallback", "Open details to see this skill's purpose and requirements.");
  const description = purpose.length > 80 && purpose.includes("。") ? purpose.slice(0, purpose.indexOf("。") + 1) : purpose;
  let name = localized.name || skill.name || skill.id;
  // Display an explicit subject from a knowledge skill's own description, keeping its id intact.
  const knowledgeSubject = description.match(/回答\s*([A-Za-z][A-Za-z0-9_-]*)\s*相关知识/);
  if (language === "zh-CN" && name === skill.id && /rag$/i.test(name) && knowledgeSubject) {
    name = `${knowledgeSubject[1]} 知识问答`;
  }
  return { ...localized, name, description, category: language === "zh-CN" && /^custom$/i.test(localized.category || "") ? "自定义" : localized.category };
}

export function buildSkillUseSelection(skill: SkillStatusEntry, workspacePath?: string): SkillUseSelection | null {
  if (!canUseSkillFromCatalog(skill)) return null;
  const text = getSkillCardText(skill);
  return {
    skillId: skill.id,
    skillLabel: text.name,
    prompt: buildLocalizedSkillComposerPrompt({ ...skill, name: text.name, description: text.description }, { includeTaskPlaceholder: true }),
    ...(skill.source === "workspace" ? { workspacePath } : {}),
    ...(skill.parameters?.length ? { parameterSkill: skill } : {}),
  };
}

/** Workspace skills must not be launched in an unrelated new temporary folder. */
export function findSkillWorkspace(path: string, workspaces: Workspace[]): Workspace | undefined {
  const normalize = (value: string) => value.replace(/\\/g, "/").replace(/\/+$/, "");
  return workspaces.find(workspace => normalize(workspace.path) === normalize(path));
}

/** SkillStatusReport.workspaceDir points to the skills directory, not its parent. */
export function getSkillWorkspacePath(skillsDirectory: string): string {
  const path = skillsDirectory.trim().replace(/\\/g, "/").replace(/\/+$/, "");
  return /\/skills$/i.test(path) ? path.slice(0, -7) || "/" : "";
}
