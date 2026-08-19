import type { CustomSkill } from "../../shared/types";
import {
  MESSAGE_APP_SHORTCUTS,
  isValidSlashCommandName,
  type MessageAppShortcut,
} from "../../shared/message-shortcuts";
import { ONBOARDING_COMMAND_OPTIONS } from "../../shared/onboarding";
import { translate } from "../i18n";
import { getLocalizedSkillText } from "./localized-skills";
import { isSkillVisibleForCurrentProductSupport } from "./product-availability";

export const MESSAGE_SHORTCUTS_UPDATED_EVENT =
  "neoworker:message-shortcuts-updated";

export type PluginSlashCommandAlias = {
  name: string;
  description?: string;
  skillId: string;
};

export type SkillSlashCommandOption = {
  kind: "skill";
  id: string;
  commandName: string;
  name: string;
  description: string;
  icon: string;
  hasRequiredParams: boolean;
  hasOptionalParams: boolean;
  skill: CustomSkill;
};

export type AppSlashCommandOption = {
  kind: "app";
  id: string;
  commandName: string;
  name: string;
  description: string;
  icon: string;
  shortcut: MessageAppShortcut;
};

export type BuiltinSlashCommandOption = {
  kind: "builtin";
  id: string;
  commandName: string;
  name: string;
  description: string;
  icon: string;
  command: string;
};

export type SlashCommandOption =
  AppSlashCommandOption | SkillSlashCommandOption | BuiltinSlashCommandOption;

export type SlashCommandTextTarget = {
  start: number;
  end: number;
};

function getSkillDiversityKeys(option: SlashCommandOption): {
  category: string;
  family: string;
} {
  if (option.kind !== "skill") return { category: "", family: "" };

  const category = option.skill.category?.trim().toLowerCase() || "";
  const normalizedId = option.skill.id.trim().toLowerCase();
  const namespace = normalizedId.includes(":")
    ? normalizedId.split(":", 1)[0]
    : normalizedId.split("-").slice(0, 3).join("-");

  return {
    category,
    family: `${option.skill.source || "unknown"}:${namespace}`,
  };
}

function selectDefaultSkillOptions(
  options: SlashCommandOption[],
  limit: number,
  preferredSkillIds: string[],
): SlashCommandOption[] {
  if (limit <= 0 || options.length === 0) return [];

  const preferenceRank = new Map(
    preferredSkillIds.map((id, index) => [id.trim().toLowerCase(), index]),
  );
  const ranked = options
    .map((option, index) => {
      const skillId =
        option.kind === "skill" ? option.skill.id.toLowerCase() : "";
      const commandName = option.commandName.toLowerCase();
      return {
        option,
        index,
        rank:
          preferenceRank.get(skillId) ??
          preferenceRank.get(commandName) ??
          Number.MAX_SAFE_INTEGER,
      };
    })
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(({ option }) => option);

  if (ranked.length <= limit) return ranked;

  const selected: SlashCommandOption[] = [];
  const selectedIds = new Set<string>();
  const usedCategories = new Set<string>();
  const usedFamilies = new Set<string>();

  const add = (option: SlashCommandOption) => {
    if (selected.length >= limit || selectedIds.has(option.id)) return false;
    selected.push(option);
    selectedIds.add(option.id);
    const { category, family } = getSkillDiversityKeys(option);
    if (category) usedCategories.add(category);
    if (family) usedFamilies.add(family);
    return true;
  };

  // First pass: choose skills from a new category and a new package/family.
  for (const option of ranked) {
    const { category, family } = getSkillDiversityKeys(option);
    const hasNewCategory = !category || !usedCategories.has(category);
    const hasNewFamily = !family || !usedFamilies.has(family);
    if (hasNewCategory && hasNewFamily) add(option);
  }

  // Second pass: allow one dimension to repeat, while still adding variety.
  for (const option of ranked) {
    const { category, family } = getSkillDiversityKeys(option);
    const hasNewCategory = Boolean(category && !usedCategories.has(category));
    const hasNewFamily = Boolean(family && !usedFamilies.has(family));
    if (hasNewCategory || hasNewFamily) add(option);
  }

  // Finally fill any remaining slots without hiding otherwise valid skills.
  for (const option of ranked) add(option);

  return selected;
}

export function applySlashCommandSelection(params: {
  value: string;
  target: SlashCommandTextTarget;
  commandName: string;
}): { nextValue: string; cursorPosition: number } {
  const before = params.value.slice(0, params.target.start);
  const after = params.value.slice(params.target.end);
  const commandText = `/${params.commandName}`;
  if (/^[ \t]/.test(after)) {
    return {
      nextValue: `${before}${commandText}${after}`,
      cursorPosition: before.length + commandText.length + 1,
    };
  }
  const insertText = `${commandText} `;
  return {
    nextValue: `${before}${insertText}${after}`,
    cursorPosition: before.length + insertText.length,
  };
}

function skillHasRequiredParams(skill: CustomSkill): boolean {
  return (
    skill.parameters?.some((parameter) => parameter.required === true) === true
  );
}

function skillHasOptionalParams(skill: CustomSkill): boolean {
  return (
    skill.parameters?.some((parameter) => parameter.required !== true) === true
  );
}

function isUserInvocableSkill(skill: CustomSkill): boolean {
  return skill.enabled !== false && skill.invocation?.userInvocable !== false;
}

function slashMatchRank(option: SlashCommandOption, query: string): number {
  const commandName = option.commandName.toLowerCase();
  const displayName = option.name.toLowerCase();
  if (commandName === query) return 0;
  if (commandName.startsWith(query)) return 1;
  if (displayName === query) return 2;
  if (displayName.startsWith(query)) return 3;
  return 4;
}

export function buildMessageSlashOptions(params: {
  query: string;
  customSkills: CustomSkill[];
  pluginSlashCommands: PluginSlashCommandAlias[];
  includeOnboarding: boolean;
  limit?: number;
  preferredSkillIds?: string[];
}): SlashCommandOption[] {
  const query = params.query.trim().toLowerCase();
  const limit = params.limit ?? 10;
  const skillById = new Map(
    params.customSkills
      .filter(isUserInvocableSkill)
      .filter(isSkillVisibleForCurrentProductSupport)
      .map((skill) => [skill.id, skill]),
  );

  const appOptions: SlashCommandOption[] = MESSAGE_APP_SHORTCUTS.filter(
    (shortcut) => {
      const description = translate(
        `slash.app.${shortcut.name}.description`,
        shortcut.description,
      );
      if (!query) return true;
      return `${shortcut.name} ${shortcut.description} ${description}`
        .toLowerCase()
        .includes(query);
    },
  ).map((shortcut) => ({
    kind: "app",
    id: `app-${shortcut.name}`,
    commandName: shortcut.name,
    name: shortcut.name,
    description: translate(
      `slash.app.${shortcut.name}.description`,
      shortcut.description,
    ),
    icon: shortcut.icon,
    shortcut,
  }));

  const builtinOptions: SlashCommandOption[] = params.includeOnboarding
    ? ONBOARDING_COMMAND_OPTIONS.filter((option) => {
        const description = translate(
          `slash.onboarding.${option.name}.description`,
          option.description,
        );
        if (!query) return true;
        return `${option.name} ${option.description} ${description}`
          .toLowerCase()
          .includes(query);
      }).map((option) => ({
        kind: "builtin",
        id: `builtin-${option.name}`,
        commandName: option.name,
        name: option.name,
        description: translate(
          `slash.onboarding.${option.name}.description`,
          option.description,
        ),
        icon: option.icon,
        command: `/${option.name}`,
      }))
    : [];

  const validPluginAliases = params.pluginSlashCommands
    .filter((command) => isValidSlashCommandName(command.name))
    .flatMap((command) => {
      const skill = skillById.get(command.skillId);
      if (!skill) return [];
      return [{ command, skill }];
    });

  const pluginAliasOptions: SlashCommandOption[] = validPluginAliases
    .flatMap(({ command, skill }) => {
      const localizedSkill = getLocalizedSkillText(skill);
      if (!query) return [{ command, skill }];
      const haystack =
        `${command.name} ${command.description || ""} ${skill.name} ${skill.description || ""} ${localizedSkill.name} ${localizedSkill.description}`.toLowerCase();
      return haystack.includes(query) ? [{ command, skill }] : [];
    })
    .map(({ command, skill }) => {
      const localizedSkill = getLocalizedSkillText(skill);
      return {
        kind: "skill",
        id: `alias-${command.name}`,
        commandName: command.name,
        name: localizedSkill.name,
        description: localizedSkill.description || command.description || "",
        icon: skill.icon || "✨",
        hasRequiredParams: skillHasRequiredParams(skill),
        hasOptionalParams: skillHasOptionalParams(skill),
        skill,
      };
    });

  const aliasCommandNames = new Set(
    validPluginAliases.map(({ command }) => command.name),
  );
  const aliasSkillIds = new Set(
    validPluginAliases.map(({ skill }) => skill.id),
  );

  const skillOptions: SlashCommandOption[] = params.customSkills
    .filter(isUserInvocableSkill)
    .filter(isSkillVisibleForCurrentProductSupport)
    .filter((skill) => {
      if (
        !isValidSlashCommandName(skill.id) ||
        aliasCommandNames.has(skill.id) ||
        aliasSkillIds.has(skill.id)
      ) {
        return false;
      }
      if (!query) return true;
      const localizedSkill = getLocalizedSkillText(skill);
      return (
        skill.name.toLowerCase().includes(query) ||
        skill.id.toLowerCase().includes(query) ||
        (skill.description || "").toLowerCase().includes(query) ||
        localizedSkill.name.toLowerCase().includes(query) ||
        localizedSkill.description.toLowerCase().includes(query)
      );
    })
    .map((skill) => {
      const localizedSkill = getLocalizedSkillText(skill);
      return {
        kind: "skill",
        id: skill.id,
        commandName: skill.id,
        name: localizedSkill.name,
        description: localizedSkill.description,
        icon: skill.icon || "✨",
        hasRequiredParams: skillHasRequiredParams(skill),
        hasOptionalParams: skillHasOptionalParams(skill),
        skill,
      };
    });

  const commandOptions = [...appOptions, ...builtinOptions];
  const availableSkillOptions = [...pluginAliasOptions, ...skillOptions];

  if (!query && commandOptions.length > 0 && availableSkillOptions.length > 0) {
    // Keep the empty `/` menu useful as both a command launcher and a skill picker.
    // Without reserved slots, the built-in command catalog fills the limit before
    // any installed skill can appear.
    const reservedSkillSlots = Math.min(
      availableSkillOptions.length,
      Math.max(1, Math.floor(limit * 0.4)),
    );
    const commandSlots = Math.max(1, limit - reservedSkillSlots);
    const visibleSkillOptions = selectDefaultSkillOptions(
      availableSkillOptions,
      limit - commandSlots,
      params.preferredSkillIds ?? [],
    );
    return [...commandOptions.slice(0, commandSlots), ...visibleSkillOptions];
  }

  const matchingOptions = [...commandOptions, ...availableSkillOptions];
  if (query) {
    // An exact slash command must always win over broad name/description
    // matches. This also keeps keyboard Enter bound to what the user typed.
    matchingOptions.sort(
      (a, b) => slashMatchRank(a, query) - slashMatchRank(b, query),
    );
  }
  return matchingOptions.slice(0, limit);
}

export function resolveSlashSelectedIndex(
  optionCount: number,
  requestedIndex: number,
): number {
  if (optionCount <= 0) return 0;
  return Math.min(Math.max(0, requestedIndex), optionCount - 1);
}
