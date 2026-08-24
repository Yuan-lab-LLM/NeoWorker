import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { describe, expect, it } from "vitest";

import {
  applyAgentPolicyLoopThresholds,
  evaluateAgentPolicyHook,
  filterToolsByAgentPolicy,
  getPolicyRequiredToolsForMode,
  loadAgentPolicyFromWorkspace,
  parseAgentPolicyToml,
  sanitizeFallbackTextWithPolicy,
} from "../agent-policy";

const SAMPLE_POLICY_TOML = `
[required_tool_families]
mutation_required = ["write_file", "canvas_push"]
analysis_only = ["read_file"]

[tool_filters]
allow = ["read_file", "write_file", "search_files"]
deny = ["web_search"]

[fallback]
disallowed_texts = ["stop using this tool and respond directly"]

[loop_thresholds.default]
stop_reason_tool_use_streak = 9

[loop_thresholds.mode.mutation_required]
low_progress_same_target_min_calls = 10

[loop_thresholds.domain.code]
follow_up_lock_min_streak = 14

[[hooks.on_pre_tool_use]]
when_tool = "search_files"
when_mode = "mutation_required"
action = "force_action"
force_tool = "write_file"
force_input_template_json = '{"path":"results/notes.txt","content":"seed"}'

[[hooks.on_stop_attempt]]
when_mode = "mutation_required"
action = "block_with_feedback"
feedback = "Perform required write first."
`;

describe("agent-policy parsing", () => {
  it("parses core policy sections and hook tables", () => {
    const policy = parseAgentPolicyToml(SAMPLE_POLICY_TOML);

    expect(policy.requiredToolFamilies.mutation_required).toEqual(["write_file", "canvas_push"]);
    expect(policy.requiredToolFamilies.analysis_only).toEqual(["read_file"]);
    expect(policy.toolAllowlist).toEqual(["read_file", "write_file", "search_files"]);
    expect(policy.toolDenylist).toEqual(["web_search"]);
    expect(policy.disallowedFallbackTexts).toEqual(["stop using this tool and respond directly"]);
    expect(policy.loopThresholds.default.stopReasonToolUseStreak).toBe(9);
    expect(policy.loopThresholds.byMode.mutation_required?.lowProgressSameTargetMinCalls).toBe(10);
    expect(policy.loopThresholds.byDomain.code?.followUpLockMinStreak).toBe(14);
  });
});

describe("agent-policy helpers", () => {
  const policy = parseAgentPolicyToml(SAMPLE_POLICY_TOML);

  it("returns required tools by step mode", () => {
    expect(getPolicyRequiredToolsForMode(policy, "mutation_required")).toEqual([
      "write_file",
      "canvas_push",
    ]);
    expect(getPolicyRequiredToolsForMode(policy, "artifact_presence_required")).toEqual([]);
  });

  it("filters tools by allowlist/denylist", () => {
    const filtered = filterToolsByAgentPolicy({
      tools: [{ name: "read_file" }, { name: "web_search" }, { name: "run_command" }],
      policy,
    });
    expect(filtered.tools.map((tool) => tool.name)).toEqual(["read_file"]);
    expect(filtered.blocked).toEqual([
      { name: "web_search", reason: "agent_policy_denylist" },
      { name: "run_command", reason: "agent_policy_allowlist" },
    ]);
  });

  it("applies loop threshold overrides in default -> mode -> domain order", () => {
    const base = {
      stopReasonToolUseStreak: 6,
      stopReasonMaxTokenStreak: 2,
      lowProgressWindowSize: 8,
      lowProgressSameTargetMinCalls: 6,
      followUpLockMinStreak: 10,
      followUpLockMinToolCalls: 10,
      skippedToolOnlyTurnThreshold: 2,
    };
    const resolved = applyAgentPolicyLoopThresholds({
      base,
      policy,
      mode: "mutation_required",
      domain: "code",
    });
    expect(resolved.stopReasonToolUseStreak).toBe(9);
    expect(resolved.lowProgressSameTargetMinCalls).toBe(10);
    expect(resolved.followUpLockMinStreak).toBe(14);
  });

  it("evaluates hook rules and returns force/block actions", () => {
    const preToolDecision = evaluateAgentPolicyHook({
      policy,
      hook: "on_pre_tool_use",
      toolName: "search_files",
      mode: "mutation_required",
      domain: "code",
      reasonText: "query missing",
    });
    expect(preToolDecision?.action).toBe("force_action");
    expect(preToolDecision?.forceTool).toBe("write_file");
    expect(preToolDecision?.forceInputTemplate).toEqual({
      path: "results/notes.txt",
      content: "seed",
    });

    const stopDecision = evaluateAgentPolicyHook({
      policy,
      hook: "on_stop_attempt",
      mode: "mutation_required",
      domain: "code",
    });
    expect(stopDecision?.action).toBe("block_with_feedback");
    expect(stopDecision?.feedback).toBe("Perform required write first.");
  });

  it("sanitizes disallowed fallback text when configured", () => {
    const sanitized = sanitizeFallbackTextWithPolicy({
      policy,
      text: "STOP using this tool and respond directly with what you found.",
    });
    expect(sanitized.sanitized).toBe(true);
    expect(sanitized.text).not.toContain("respond directly");
  });

  it("loads agent-policy.toml from workspace root when present", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-policy-"));
    const policyPath = path.join(tempDir, "agent-policy.toml");
    fs.writeFileSync(policyPath, SAMPLE_POLICY_TOML, "utf-8");

    const loaded = loadAgentPolicyFromWorkspace(tempDir);
    expect(loaded.filePath).toBe(policyPath);
    expect(loaded.parseError).toBeUndefined();
    expect(loaded.policy?.toolDenylist).toContain("web_search");
  });
});
