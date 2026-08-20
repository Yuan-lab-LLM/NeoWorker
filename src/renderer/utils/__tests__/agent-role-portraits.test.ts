import { describe, expect, it } from "vitest";
import {
  EXPERT_PORTRAIT_ROLE_NAMES,
  getAgentRolePortrait,
} from "../agent-role-portraits";

describe("agent role portraits", () => {
  it("keeps one distinct portrait for every current NeoWorker expert", () => {
    expect(EXPERT_PORTRAIT_ROLE_NAMES).toHaveLength(33);

    const portraits = EXPERT_PORTRAIT_ROLE_NAMES.map((name) =>
      getAgentRolePortrait({ name }),
    );
    expect(new Set(portraits).size).toBe(33);
  });

  it("uses a capability portrait for future custom experts", () => {
    expect(
      getAgentRolePortrait({
        name: "future-security-expert",
        capabilities: ["security"],
      }),
    ).toContain("security_analyst");
  });
});
