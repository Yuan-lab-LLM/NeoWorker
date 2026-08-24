import { describe, expect, it } from "vitest";
import {
  detectIdentity,
  isSigningEnabled,
  selectSigningPlan,
} from "../scripts/codesign_electron_dev.mjs";

describe("codesign_electron_dev", () => {
  it("does not infer a signing identity when the env var is absent", () => {
    expect(detectIdentity({})).toBeNull();
  });

  it("ignores blank configured signing identities", () => {
    expect(detectIdentity({ NEOWORKER_CODESIGN_IDENTITY: "   " })).toBeNull();
  });

  it("keeps development signing disabled by default", () => {
    expect(isSigningEnabled({})).toBe(false);
    expect(selectSigningPlan("signed", null)).toEqual({
      action: "skip",
      message:
        "Skipping Electron.app development signing. Set NEOWORKER_CODESIGN_ENABLE=1 or NEOWORKER_CODESIGN_IDENTITY to enable.",
    });
  });

  it("repairs an invalid Electron.app signature by default", () => {
    expect(selectSigningPlan("invalid", null)).toEqual({
      action: "sign",
      message: "Electron.app signature is invalid; applying an ad-hoc development signature.",
      signingIdentity: "-",
      timestamp: false,
      useEntitlements: false,
    });
  });

  it("enables signing with an explicit toggle", () => {
    expect(isSigningEnabled({ NEOWORKER_CODESIGN_ENABLE: "1" })).toBe(true);
  });

  it("enables signing with an explicit identity", () => {
    expect(isSigningEnabled({ NEOWORKER_CODESIGN_IDENTITY: "Apple Development: Example" })).toBe(true);
  });

  it("replaces a team signature with ad-hoc signing when explicitly enabled", () => {
    expect(selectSigningPlan("signed", null, true)).toEqual({
      action: "sign",
      message: "Replacing existing team signature with an ad-hoc development signature.",
      signingIdentity: "-",
      timestamp: false,
      useEntitlements: false,
    });
  });

  it("skips when the app is already ad-hoc signed and no identity is configured", () => {
    expect(selectSigningPlan("adhoc", null, true)).toEqual({
      action: "skip",
      message: "Electron.app is already ad-hoc signed — skipping.",
    });
  });

  it("uses an explicit signing identity when configured", () => {
    expect(selectSigningPlan("adhoc", "Apple Development: Example (TEAMID1234)", true)).toEqual({
      action: "sign",
      message: "Signing Electron.app with: Apple Development: Example (TEAMID1234)",
      signingIdentity: "Apple Development: Example (TEAMID1234)",
      timestamp: true,
      useEntitlements: true,
    });
  });
});
