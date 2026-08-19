import type { IntegrationMentionOption } from "../../shared/types";

function areStringArraysEqual(prev: string[], next: string[]): boolean {
  if (prev.length !== next.length) return false;
  return prev.every((value, index) => value === next[index]);
}

function areIntegrationMentionOptionEqual(
  prev: IntegrationMentionOption,
  next: IntegrationMentionOption,
): boolean {
  return (
    prev.id === next.id &&
    prev.label === next.label &&
    prev.source === next.source &&
    prev.providerKey === next.providerKey &&
    prev.iconKey === next.iconKey &&
    prev.promptHint === next.promptHint &&
    prev.description === next.description &&
    prev.status === next.status &&
    areStringArraysEqual(prev.tools, next.tools) &&
    areStringArraysEqual(prev.aliases, next.aliases)
  );
}

export function areIntegrationMentionOptionsEqual(
  prev: IntegrationMentionOption[],
  next: IntegrationMentionOption[],
): boolean {
  if (prev === next) return true;
  if (prev.length !== next.length) return false;
  return prev.every((option, index) =>
    areIntegrationMentionOptionEqual(option, next[index]),
  );
}
