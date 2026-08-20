import { beforeEach, describe, expect, it, vi } from "vitest";

import { GuardrailManager } from "../../guardrails/guardrail-manager";
import { evaluateNetworkPolicy } from "../network-policy";

vi.mock("../../admin/policies", () => ({
  loadPolicies: vi.fn(() => ({
    runtime: {
      network: {
        defaultAction: "allow",
        allowedDomains: [],
        blockedDomains: [],
        allowShellNetwork: false,
      },
    },
  })),
}));

import { loadPolicies } from "../../admin/policies";

describe("evaluateNetworkPolicy", () => {
  beforeEach(() => {
    vi.mocked(loadPolicies).mockReturnValue({
      version: 1,
      updatedAt: new Date().toISOString(),
      packs: { allowed: [], blocked: [], required: [] },
      connectors: { blocked: [] },
      agents: { maxHeartbeatFrequencySec: 60, maxConcurrentAgents: 10 },
      runtime: {
        allowedPermissionModes: [],
        allowedSandboxTypes: ["macos", "docker"],
        requireSandboxForShell: true,
        allowUnsandboxedShell: true,
        network: { defaultAction: "allow", allowedDomains: [], blockedDomains: [], allowShellNetwork: false },
        autoReview: { enabled: true },
        telemetry: { enabled: false },
      },
      general: {
        allowCustomPacks: true,
        allowGitInstall: true,
        allowUrlInstall: true,
      },
    });
    vi.spyOn(GuardrailManager, "isDomainAllowed").mockReturnValue(true);
  });

  it("denies admin-blocked domains before legacy guardrails", () => {
    vi.mocked(loadPolicies).mockReturnValueOnce({
      ...loadPolicies(),
      runtime: {
        ...loadPolicies().runtime,
        network: {
          defaultAction: "allow",
          allowedDomains: [],
          blockedDomains: ["*.example.com"],
          allowShellNetwork: false,
        },
      },
    });

    const decision = evaluateNetworkPolicy({
      url: "https://api.example.com/v1",
      toolName: "web_fetch",
    });

    expect(decision.action).toBe("deny");
    expect(decision.reason).toBe("blocked_domain");
    expect(decision.ruleSource).toBe("admin_policy");
  });

  it("allows explicit admin allowlist matches", () => {
    vi.mocked(loadPolicies).mockReturnValueOnce({
      ...loadPolicies(),
      runtime: {
        ...loadPolicies().runtime,
        network: {
          defaultAction: "deny",
          allowedDomains: ["docs.example.com"],
          blockedDomains: [],
          allowShellNetwork: false,
        },
      },
    });

    const decision = evaluateNetworkPolicy({
      url: "https://docs.example.com/reference",
      toolName: "web_fetch",
    });

    expect(decision.action).toBe("allow");
    expect(decision.reason).toBe("admin_allowlist_match");
  });

  it("falls back to legacy guardrail domain decisions", () => {
    vi.spyOn(GuardrailManager, "isDomainAllowed").mockReturnValueOnce(false);

    const decision = evaluateNetworkPolicy({
      url: "https://blocked.example",
      toolName: "browser_navigate",
    });

    expect(decision.action).toBe("deny");
    expect(decision.reason).toBe("legacy_guardrail_domain_denied");
    expect(decision.ruleSource).toBe("legacy_guardrails");
  });

  it("redacts credentials, query strings, and fragments from returned policy URLs", () => {
    const decision = evaluateNetworkPolicy({
      url: "https://user:pass@docs.example.com/oauth/callback?code=secret-code&access_token=secret-token#frag",
      toolName: "web_fetch",
    });

    expect(decision.action).toBe("allow");
    expect(decision.url).toBe("https://docs.example.com/oauth/callback");
    expect(decision.url).not.toContain("secret");
    expect(decision.url).not.toContain("user:pass");
    expect(decision.url).not.toContain("#frag");
  });
});
