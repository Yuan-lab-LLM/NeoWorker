const MAILBOX_REQUIRED_SKILL_IDS = new Set([
  "usecase-inbox-manager",
  "usecase-transaction-scan",
]);

/**
 * Resolve the skill selected by a structured composer entry. The prompt fallback
 * keeps direct slash/legacy skill invocations behind the same preflight gate.
 */
export function resolveRequestedSkillId(
  structuredSkillId: string | undefined,
  prompt: string,
): string | null {
  const normalizedStructuredId = structuredSkillId?.trim().toLocaleLowerCase();
  if (normalizedStructuredId) return normalizedStructuredId;

  const normalizedPrompt = prompt.toLocaleLowerCase();
  for (const skillId of MAILBOX_REQUIRED_SKILL_IDS) {
    if (normalizedPrompt.includes(skillId)) return skillId;
  }
  return null;
}

export function requiresMailboxConnection(
  skillId: string | null | undefined,
): boolean {
  return MAILBOX_REQUIRED_SKILL_IDS.has(
    (skillId || "").trim().toLocaleLowerCase(),
  );
}
