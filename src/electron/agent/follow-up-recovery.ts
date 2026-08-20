export type FollowUpRecoveryEvent = {
  type?: string;
  legacyType?: string;
  timestamp?: number;
  ts?: number;
  seq?: number;
  payload?: Record<string, unknown>;
};

export type InterruptedFollowUp = {
  message: string;
  startedAt: number;
  turnId?: string;
  requiredArtifactExtensions: string[];
};

function getEventType(event: FollowUpRecoveryEvent): string {
  return String(
    event.legacyType || event.payload?.legacyType || event.type || "",
  ).trim();
}

function getEventTime(event: FollowUpRecoveryEvent): number {
  return Number(event.timestamp || event.ts || 0);
}

function getTurnId(payload: Record<string, unknown>): string | undefined {
  const value = String(payload.turnId || payload.stepId || "").trim();
  return value || undefined;
}

function isFollowUpUserMessage(event: FollowUpRecoveryEvent): boolean {
  if (getEventType(event) !== "user_message") return false;
  const payload = event.payload || {};
  const turnId = getTurnId(payload) || "";
  return payload.followUp === true || /:follow-up:/i.test(turnId);
}

/**
 * Locate a follow-up turn that began before an application exit but never
 * emitted a terminal follow-up event. The initial task plan is intentionally
 * ignored here: follow-ups have their own output contract and may request new
 * artifacts that are not present in the original plan.
 */
export function findInterruptedFollowUp(
  events: FollowUpRecoveryEvent[],
): InterruptedFollowUp | null {
  const ordered = [...events].sort((a, b) => {
    const aOrder = Number.isFinite(Number(a.seq))
      ? Number(a.seq)
      : getEventTime(a);
    const bOrder = Number.isFinite(Number(b.seq))
      ? Number(b.seq)
      : getEventTime(b);
    return aOrder - bOrder;
  });

  let active: InterruptedFollowUp | null = null;

  for (const event of ordered) {
    const type = getEventType(event);
    const payload = event.payload || {};

    if (type === "follow_up_started") {
      const message = String(
        payload.message || payload.followUpMessage || "",
      ).trim();
      if (!message) continue;
      active = {
        message,
        startedAt: Number(
          payload.artifactEvidenceStartedAt ||
            getEventTime(event) ||
            Date.now(),
        ),
        turnId: getTurnId(payload),
        requiredArtifactExtensions: Array.isArray(
          payload.requiredArtifactExtensions,
        )
          ? payload.requiredArtifactExtensions
              .map((extension) => String(extension || "").toLowerCase())
              .filter(Boolean)
          : [],
      };
      continue;
    }

    // Backward compatibility for tasks created before follow_up_started was
    // introduced. Timeline user messages carry a follow-up turn id.
    if (isFollowUpUserMessage(event)) {
      const message = String(payload.message || "").trim();
      if (!message) continue;
      active = {
        message,
        startedAt: getEventTime(event) || Date.now(),
        turnId: getTurnId(payload),
        requiredArtifactExtensions: [],
      };
      continue;
    }

    if (
      active &&
      (type === "follow_up_completed" || type === "follow_up_failed")
    ) {
      active = null;
    }
  }

  return active;
}
