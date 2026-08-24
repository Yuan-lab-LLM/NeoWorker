import { describe, expect, it } from "vitest";

import type { AgentRole } from "../../../shared/types";
import { buildSubagentDisplayName } from "../subagent-display-names";

function role(overrides: Partial<AgentRole>): AgentRole {
  return {
    id: "role-1",
    name: "custom-explorer",
    displayName: "Feynman",
    icon: "🤖",
    color: "#3b82f6",
    capabilities: ["research"],
    isSystem: false,
    isActive: true,
    sortOrder: 0,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

describe("buildSubagentDisplayName", () => {
  it("uses mythology codenames instead of role display names", () => {
    expect(buildSubagentDisplayName({ role: role({}), workerRole: "researcher", index: 0 })).toBe(
      "Anansi (explorer)",
    );
  });

  it("derives role labels from capabilities and keeps repeated roles distinct", () => {
    expect(
      buildSubagentDisplayName({
        role: role({ displayName: "Ada", capabilities: ["code"] }),
        workerRole: "researcher",
        index: 2,
      }),
    ).toBe("Ares (builder)");
  });

  it("falls back to worker role when capabilities are not specific", () => {
    expect(buildSubagentDisplayName({ workerRole: "verifier", index: 4 })).toBe(
      "Arthur (inspector)",
    );
  });

  it("cycles through the large mythology pool when needed", () => {
    expect(buildSubagentDisplayName({ workerRole: "researcher", index: 69 })).toBe(
      "Anansi 2 (explorer)",
    );
  });
});
