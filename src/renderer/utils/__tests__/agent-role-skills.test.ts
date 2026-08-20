import { describe, expect, it } from "vitest";
import {
  getAgentRoleLinkedSkillIds,
  getAgentRoleLinkedSkillLabels,
} from "../agent-role-skills";

describe("agent role skill display", () => {
  it("reads the exact skills saved on a generated managed-agent mirror", () => {
    const role = {
      soul: JSON.stringify({
        studio: {
          skills: ["multi-pr-review", "twin-pr-triage"],
          builderPlan: { selectedSkills: ["multi-pr-review"] },
        },
      }),
    };

    expect(getAgentRoleLinkedSkillIds(role)).toEqual([
      "multi-pr-review",
      "twin-pr-triage",
    ]);
    expect(getAgentRoleLinkedSkillLabels(role, [], "zh-CN")).toEqual([
      "多智能体 PR 审查",
      "数字分身 PR 分诊",
    ]);
  });

  it("returns no fixed skills for built-in roles that use task-time matching", () => {
    expect(getAgentRoleLinkedSkillIds({})).toEqual([]);
    expect(getAgentRoleLinkedSkillIds({ soul: "not-json" })).toEqual([]);
  });
});
