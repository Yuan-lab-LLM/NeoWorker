import { describe, expect, it } from "vitest";
import {
  applyFewerApprovalPromptsPreset,
  applyStandardApprovalPromptsPreset,
  buildScope,
  detectApprovalExperiencePreset,
  scopeToLabel,
} from "../PermissionSettingsPanel";

const builtinCategories = {
  code: { enabled: true, priority: "high" as const },
  webfetch: { enabled: true, priority: "high" as const },
  browser: { enabled: true, priority: "normal" as const },
  search: { enabled: true, priority: "normal" as const },
  system: { enabled: true, priority: "normal" as const },
  file: { enabled: true, priority: "normal" as const },
  skill: { enabled: true, priority: "normal" as const },
  shell: { enabled: true, priority: "normal" as const },
  image: { enabled: true, priority: "normal" as const },
  chronicle: { enabled: true, priority: "normal" as const },
  computer_use: { enabled: true, priority: "normal" as const },
};

describe("PermissionSettingsPanel helpers", () => {
  it("renders domain-scoped rules without returning an object", () => {
    expect(
      scopeToLabel({
        kind: "domain",
        domain: "api.example.com",
        toolName: "http_request",
      }),
    ).toBe("Domain: api.example.com (http_request)");
  });

  it("builds a domain scope from the rule draft", () => {
    expect(
      buildScope({
        effect: "allow",
        scopeKind: "domain",
        toolName: "web_fetch",
        domain: "docs.example.com",
        path: "",
        prefix: "",
        serverName: "",
      }),
    ).toEqual({
      kind: "domain",
      toolName: "web_fetch",
      domain: "docs.example.com",
    });
  });

  it("applies the fewer-prompts preset", () => {
    const result = applyFewerApprovalPromptsPreset(
      {
        version: 1,
        defaultMode: "default",
        defaultShellEnabled: false,
        defaultPermissionAccess: "default",
        rules: [],
      },
      {
        categories: builtinCategories,
        toolOverrides: {},
        toolTimeouts: {},
        toolAutoApprove: {},
        runCommandApprovalMode: "per_command",
        codexRuntimeMode: "native",
        computerUseAutomation: {
          browserAutomationMode: "background",
          nativeComputerUseMode: "background_first",
        },
        version: "1.0.0",
      },
    );

    expect(result.permissionSettings.defaultMode).toBe("dangerous_only");
    expect(result.permissionSettings.defaultShellEnabled).toBe(false);
    expect(result.permissionSettings.defaultPermissionAccess).toBe("default");
    expect(result.builtinSettings.runCommandApprovalMode).toBe("single_bundle");
  });

  it("detects the fewer-prompts preset", () => {
    expect(
      detectApprovalExperiencePreset(
        {
          version: 1,
          defaultMode: "dangerous_only",
          defaultShellEnabled: false,
          defaultPermissionAccess: "default",
          rules: [],
        },
        {
          runCommandApprovalMode: "single_bundle",
        },
      ),
    ).toBe("fewer_prompts");
  });

  it("restores the standard approval preset", () => {
    const result = applyStandardApprovalPromptsPreset(
      {
        version: 1,
        defaultMode: "dangerous_only",
        defaultShellEnabled: false,
        defaultPermissionAccess: "default",
        rules: [],
      },
      {
        categories: builtinCategories,
        toolOverrides: {},
        toolTimeouts: {},
        toolAutoApprove: {},
        runCommandApprovalMode: "single_bundle",
        codexRuntimeMode: "native",
        computerUseAutomation: {
          browserAutomationMode: "background",
          nativeComputerUseMode: "background_first",
        },
        version: "1.0.0",
      },
    );

    expect(result.permissionSettings.defaultMode).toBe("default");
    expect(result.builtinSettings.runCommandApprovalMode).toBe("per_command");
  });
});
