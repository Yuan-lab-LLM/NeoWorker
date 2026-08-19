import { createHash } from "node:crypto";

export type OfficeArtifactDeliveryMode = "enforced" | "halted";

export interface OfficeArtifactRolloutDecision {
  policyVersion: "1";
  mode: OfficeArtifactDeliveryMode;
  percentage: number;
  bucket: number;
  enabled: boolean;
  legacyExecutionAllowed: false;
  reason: "enabled" | "outside-cohort" | "emergency-halt";
}

function boundedPercentage(value: string | undefined): number {
  if (!value?.trim()) return 100;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 100;
  return Math.min(100, Math.max(0, Math.round(numeric)));
}

export function officeArtifactRolloutBucket(requestId: string): number {
  const digest = createHash("sha256").update(requestId).digest();
  return digest.readUInt32BE(0) % 100;
}

/**
 * The rollback switch is deliberately read-only: it can stop new deliveries,
 * but can never route a write back to the old generators that caused duplicate
 * and corrupt artifacts. Already published legacy files remain readable.
 */
export function resolveOfficeArtifactRollout(
  requestId: string,
  environment: NodeJS.ProcessEnv = process.env,
): OfficeArtifactRolloutDecision {
  const mode: OfficeArtifactDeliveryMode =
    environment.NEOWORKER_OFFICE_DELIVERY_MODE === "halted"
      ? "halted"
      : "enforced";
  const percentage = boundedPercentage(
    environment.NEOWORKER_OFFICE_DELIVERY_ROLLOUT,
  );
  const bucket = officeArtifactRolloutBucket(requestId);
  const enabled = mode === "enforced" && bucket < percentage;
  return {
    policyVersion: "1",
    mode,
    percentage,
    bucket,
    enabled,
    legacyExecutionAllowed: false,
    reason:
      mode === "halted"
        ? "emergency-halt"
        : enabled
          ? "enabled"
          : "outside-cohort",
  };
}
