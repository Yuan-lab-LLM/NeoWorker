import type { ComponentType } from "react";
import {
  Bot,
  Laptop,
  Search,
  BookOpen,
  FlaskConical,
  FileEdit,
  ClipboardList,
  Palette,
  BarChart3,
  Hammer,
  Zap,
  Rocket,
  Wrench,
  Lightbulb,
  Target,
  Brain,
  type LucideProps,
} from "lucide-react";
import { getEmojiIcon } from "./emoji-icon-map";

/** Lucide icon keys for twin icon picker. Matches PRESET_ICONS from AgentRoleEditor. */
export const TWIN_ICON_KEYS = [
  "Bot",
  "Laptop",
  "Search",
  "BookOpen",
  "FlaskConical",
  "FileEdit",
  "ClipboardList",
  "Palette",
  "BarChart3",
  "Hammer",
  "Zap",
  "Rocket",
  "Wrench",
  "Lightbulb",
  "Target",
  "Brain",
] as const;

export type TwinIconKey = (typeof TWIN_ICON_KEYS)[number];

export const LUCIDE_TWIN_ICONS: Record<
  TwinIconKey,
  ComponentType<LucideProps>
> = {
  Bot,
  Laptop,
  Search,
  BookOpen,
  FlaskConical,
  FileEdit,
  ClipboardList,
  Palette,
  BarChart3,
  Hammer,
  Zap,
  Rocket,
  Wrench,
  Lightbulb,
  Target,
  Brain,
};

/**
 * Resolve twin icon string to a Lucide React component.
 * Supports Lucide icon keys (e.g. "Laptop", "Bot") and legacy emoji for backward compatibility.
 */
export function resolveTwinIcon(
  icon: string | undefined,
): ComponentType<LucideProps> {
  if (!icon) return Bot;
  const key = icon as TwinIconKey;
  if (LUCIDE_TWIN_ICONS[key]) return LUCIDE_TWIN_ICONS[key];
  return getEmojiIcon(icon);
}
