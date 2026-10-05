import type { CustomSkill } from "../../shared/types";
import {
  expandSkillPrompt,
  replaceSkillAttachmentPathsForComposer,
  type SkillParameterFormValues,
  type SkillParameterAttachment,
} from "./SkillParameterModal";
import { getLocalizedSkillText } from "../utils/localized-skills";

/** Both picker entry points produce the same draft; execution uses the exact form values. */
export function buildSkillComposerSelection(
  skill: CustomSkill,
  values: SkillParameterFormValues,
  attachments: SkillParameterAttachment[] = [],
) {
  return {
    draft: expandSkillPrompt(skill, replaceSkillAttachmentPathsForComposer(values, attachments)),
    context: {
      skillId: skill.id,
      skillLabel: getLocalizedSkillText(skill).name,
      parameters: { ...values },
    },
  };
}

export function buildSlashSkillPrompt(
  skillId: string,
  values?: SkillParameterFormValues,
): string {
  const entries = Object.entries(values || {});
  if (entries.length === 0) {
    return `/${skillId}`;
  }
  return `/${skillId} ${JSON.stringify(Object.fromEntries(entries))}`;
}
