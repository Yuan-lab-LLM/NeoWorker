import { describe, expect, it } from "vitest";
import {
  normalizePermissionScope,
  permissionScopeFingerprint,
  summarizePermissionScope,
} from "../permission-utils";

describe("permission-utils domain tool prefixes", () => {
  it("normalizes, fingerprints, and summarizes domain tool prefixes", () => {
    const scope = normalizePermissionScope({
      kind: "domain",
      domain: " GitHub.COM ",
      toolPrefix: " browser_ ",
    });

    expect(scope).toEqual({
      kind: "domain",
      domain: "github.com",
      toolPrefix: "browser_",
    });
    expect(permissionScopeFingerprint(scope)).toBe("domain:prefix=browser_:github.com");
    expect(summarizePermissionScope(scope)).toBe("browser_* on domain github.com");
  });
});
