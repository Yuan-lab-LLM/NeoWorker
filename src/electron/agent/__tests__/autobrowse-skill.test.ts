import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";
import type { CustomSkill } from "../../../shared/types";
import { CustomSkillLoader } from "../custom-skill-loader";

const SKILL_PATH = path.join(__dirname, "../../../../resources/skills/autobrowse.json");

function loadAutobrowseSkill(): CustomSkill {
  return JSON.parse(fs.readFileSync(SKILL_PATH, "utf8")) as CustomSkill;
}

describe("Autobrowse bundled skill", () => {
  it("is enabled and invocable for all users", () => {
    const skill = loadAutobrowseSkill();

    expect(skill.id).toBe("autobrowse");
    expect(skill.enabled).toBe(true);
    expect(skill.source).toBeUndefined();
    expect(skill.invocation?.userInvocable).toBe(true);
    expect(skill.invocation?.disableModelInvocation).toBe(false);
    expect(skill.metadata?.routing?.useWhen).toContain("repeatable browser workflow");
  });

  it("defines safe defaults for optional control parameters", () => {
    const skill = loadAutobrowseSkill();
    const maxIterations = skill.parameters?.find((param) => param.name === "max_iterations");
    const graduationMode = skill.parameters?.find((param) => param.name === "graduation_mode");

    expect(maxIterations?.required).toBe(false);
    expect(maxIterations?.default).toBe(3);
    expect(graduationMode?.required).toBe(false);
    expect(graduationMode?.default).toBe("proposal");
    expect(skill.parameters?.find((param) => param.name === "target_url")?.default).toBe(
      "infer from request",
    );
    expect(graduationMode?.options).toEqual(["proposal", "draft-only"]);
  });

  it("expands with usable defaults instead of blank loop controls", () => {
    const loader = new CustomSkillLoader({
      bundledSkillsDir: path.join(__dirname, "../../../../resources/skills"),
      managedSkillsDir: "/tmp/neoworker-test-skills",
    });
    const skill = {
      ...loadAutobrowseSkill(),
      filePath: SKILL_PATH,
    };

    const expanded = loader.expandPrompt(
      skill,
      {
        objective: "Find available reservations",
      },
      {
        artifactDir: "/tmp/neoworker-artifacts",
      },
    );

    expect(expanded).toContain("Max iterations: 3");
    expect(expanded).toContain("Graduation mode: proposal");
    expect(expanded).toContain("Target URL or site: infer from request");
    expect(expanded).toContain("up to `3` times");
    expect(expanded).toContain("according to `proposal`");
    expect(expanded).toContain("/tmp/neoworker-artifacts/autobrowse/");
    expect(expanded).not.toContain("up to `` times");
    expect(expanded).not.toContain("according to ``");
  });
});
