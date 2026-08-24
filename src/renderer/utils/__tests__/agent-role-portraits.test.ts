import { describe, expect, it } from "vitest";
import {
  CUSTOM_AGENT_BACKGROUNDS,
  EXPERT_PORTRAIT_ROLE_NAMES,
  getAgentRolePortrait,
  getAgentRoleVisual,
} from "../agent-role-portraits";

describe("agent role portraits", () => {
  it("keeps one distinct portrait for every current NeoWorker expert", () => {
    expect(EXPERT_PORTRAIT_ROLE_NAMES).toHaveLength(33);

    const portraits = EXPERT_PORTRAIT_ROLE_NAMES.map((name) => getAgentRolePortrait({ name }));
    expect(new Set(portraits).size).toBe(33);
  });

  it("keeps portraits for existing roles even when persisted as non-system roles", () => {
    const visual = getAgentRoleVisual({
      id: "legacy-coder",
      name: "coder",
      roleKind: "custom",
      isSystem: false,
      capabilities: ["code"],
    });

    expect(visual.kind).toBe("portrait");
    expect(visual.src).toContain("coder");
  });

  it("uses a capability portrait for unmarked legacy persona templates", () => {
    const visual = getAgentRoleVisual({
      name: "future-security-expert",
      roleKind: "persona_template",
      isSystem: false,
      capabilities: ["security"],
    });

    expect(visual.kind).toBe("portrait");
    expect(visual.src).toContain("security_analyst");
  });

  it("uses the reserved abstract background pool only for builder-created agents", () => {
    expect(CUSTOM_AGENT_BACKGROUNDS).toHaveLength(6);

    const first = getAgentRoleVisual({
      id: "created-agent-1",
      name: "managed-test-1",
      roleKind: "custom",
      isSystem: false,
      capabilities: ["research"],
      soul: JSON.stringify({
        studio: { appearance: { cardVisual: "background" } },
      }),
    });
    const restored = getAgentRoleVisual({
      id: "created-agent-1",
      name: "managed-test-1",
      roleKind: "custom",
      isSystem: false,
      capabilities: ["research"],
      soul: JSON.stringify({
        studio: { appearance: { cardVisual: "background" } },
      }),
    });

    expect(first.kind).toBe("background");
    expect(first.src).toBe(restored.src);
    expect(first.src).toMatch(/(?:agent-backgrounds|data:image\/svg\+xml)/);
  });

  it("keeps the background assignment for user-created roles saved before the marker existed", () => {
    const visual = getAgentRoleVisual({
      id: "created-before-marker",
      name: "managed-test-1",
      roleKind: "custom",
      isSystem: false,
      capabilities: ["research"],
    });

    expect(visual.kind).toBe("background");
    expect(visual.src).toMatch(/(?:agent-backgrounds|data:image\/svg\+xml)/);
  });

  it("falls back to the previous portrait behavior for legacy roles with invalid soul data", () => {
    const invalidMetadata = getAgentRoleVisual({
      id: "legacy-agent-2",
      name: "legacy-research-agent-2",
      roleKind: "persona_template",
      isSystem: false,
      capabilities: ["research"],
      soul: "{invalid",
    });

    expect(invalidMetadata.kind).toBe("portrait");
    expect(invalidMetadata.src).toContain("researcher");
  });
});
