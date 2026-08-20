import { describe, expect, it } from "vitest";
import {
  officeArtifactRolloutBucket,
  resolveOfficeArtifactRollout,
} from "../office-artifact-rollout";

describe("office artifact rollout", () => {
  it("is deterministic and defaults to the OfficeCLI delivery path", () => {
    expect(officeArtifactRolloutBucket("request-1")).toBe(
      officeArtifactRolloutBucket("request-1"),
    );
    const decision = resolveOfficeArtifactRollout("request-1", {});
    expect(decision.enabled).toBe(true);
    expect(decision.percentage).toBe(100);
    expect(decision.legacyExecutionAllowed).toBe(false);
  });

  it("can stop new writes without routing back to legacy generators", () => {
    const decision = resolveOfficeArtifactRollout("request-1", {
      NEOWORKER_OFFICE_DELIVERY_MODE: "halted",
      NEOWORKER_OFFICE_DELIVERY_ROLLOUT: "100",
    });
    expect(decision.enabled).toBe(false);
    expect(decision.reason).toBe("emergency-halt");
    expect(decision.legacyExecutionAllowed).toBe(false);
  });

  it("supports staged cohorts", () => {
    expect(
      resolveOfficeArtifactRollout("request-1", {
        NEOWORKER_OFFICE_DELIVERY_ROLLOUT: "0",
      }).reason,
    ).toBe("outside-cohort");
  });
});
