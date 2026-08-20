export type MessageAppShortcutName =
  | "schedule"
  | "clear"
  | "plan"
  | "cost"
  | "goal"
  | "multitask"
  | "compact"
  | "side"
  | "doctor"
  | "undo"
  | "review";

export type MessageAppShortcutAction =
  | "insert"
  | "clear"
  | "plan"
  | "cost"
  | "side"
  | "diagnostic"
  | "safe-workflow"
  | "review";

export interface MessageAppShortcut {
  name: MessageAppShortcutName;
  description: string;
  icon: string;
  action: MessageAppShortcutAction;
}

export const MESSAGE_APP_SHORTCUTS: MessageAppShortcut[] = [
  {
    name: "schedule",
    description: "Create, list, enable, disable, or delete scheduled tasks.",
    icon: "📅",
    action: "insert",
  },
  {
    name: "clear",
    description: "Start a fresh task view without deleting history.",
    icon: "🧹",
    action: "clear",
  },
  {
    name: "plan",
    description: "Create the next task in Plan mode.",
    icon: "🧭",
    action: "plan",
  },
  {
    name: "cost",
    description: "Estimate effort and model cost before running a task.",
    icon: "💳",
    action: "cost",
  },
  {
    name: "goal",
    description: "Start or manage a persistent objective.",
    icon: "🎯",
    action: "insert",
  },
  {
    name: "multitask",
    description: "Split a request into a bounded collaborative team run.",
    icon: "▦",
    action: "insert",
  },
  {
    name: "compact",
    description: "Summarize long context into a compact continuation brief.",
    icon: "🗜️",
    action: "safe-workflow",
  },
  {
    name: "side",
    description: "Ask a question in a side conversation without steering this task.",
    icon: "☉",
    action: "side",
  },
  {
    name: "doctor",
    description: "Check workspace setup, app state, integrations, and permissions.",
    icon: "🩺",
    action: "diagnostic",
  },
  {
    name: "undo",
    description: "Review the latest changes and prepare a safe undo plan.",
    icon: "↩️",
    action: "safe-workflow",
  },
  {
    name: "review",
    description: "Review local changes or a pull request in the current workspace.",
    icon: "🔍",
    action: "review",
  },
];

const MESSAGE_APP_SHORTCUT_BY_NAME = new Map(
  MESSAGE_APP_SHORTCUTS.map((shortcut) => [shortcut.name, shortcut]),
);

export function isValidSlashCommandName(value: string): boolean {
  return /^[a-z0-9][a-z0-9-]*(?::[a-z0-9][a-z0-9-]*)?$/i.test(String(value || "").trim());
}

export function normalizeSlashCommandName(value: string): string {
  return String(value || "")
    .trim()
    .replace(/^\//, "")
    .toLowerCase();
}

export function getMessageAppShortcut(name: string): MessageAppShortcut | undefined {
  const normalized = normalizeSlashCommandName(name);
  return MESSAGE_APP_SHORTCUT_BY_NAME.get(normalized as MessageAppShortcutName);
}

export function parseLeadingMessageAppShortcut(input: string): {
  matched: boolean;
  shortcut?: MessageAppShortcut;
  args?: string;
} {
  const trimmed = String(input || "").trim();
  const match = trimmed.match(/^\/([a-z0-9][a-z0-9-]*)(?=\s|$)([\s\S]*)$/i);
  if (!match) return { matched: false };
  const shortcut = getMessageAppShortcut(match[1]);
  if (!shortcut) return { matched: false };
  return {
    matched: true,
    shortcut,
    args: String(match[2] || "").trim(),
  };
}
