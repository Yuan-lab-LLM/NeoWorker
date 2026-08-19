import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";
import type { CustomSkill } from "../../../shared/types";
import { CustomSkillLoader } from "../custom-skill-loader";

const SKILL_PATH = path.join(
  __dirname,
  "../../../../resources/skills/presentation-studio.json",
);
const BUNDLED_SKILLS_DIR = path.dirname(SKILL_PATH);

function loadSkill(): CustomSkill {
  return JSON.parse(fs.readFileSync(SKILL_PATH, "utf-8")) as CustomSkill;
}

describe("Presentation Studio bundled skill", () => {
  it("is the model-invocable default for PPTX work", () => {
    const skill = loadSkill();

    expect(skill.id).toBe("presentation-studio");
    expect(skill.enabled).toBe(true);
    expect(skill.invocation?.userInvocable).toBe(true);
    expect(skill.invocation?.disableModelInvocation).not.toBe(true);
    expect(skill.metadata?.routing?.expectedArtifacts).toEqual([
      "presentation-studio/output/presentation.pptx",
      "presentation-studio/qa-report.json",
    ]);
  });

  it("routes Chinese and English deck requests without taking Word work", () => {
    const loader = new CustomSkillLoader({
      bundledSkillsDir: BUNDLED_SKILLS_DIR,
      managedSkillsDir: "/tmp/neoworker-presentation-studio-test-skills",
    });
    const skill = loadSkill();

    expect(loader.matchesSkillRoutingQuery(skill, "帮我做一份产品介绍 PPT")).toBe(true);
    expect(loader.matchesSkillRoutingQuery(skill, "Improve this investor slide deck")).toBe(true);
    expect(loader.matchesSkillRoutingQuery(skill, "写一份 Word 报告")).toBe(false);
  });

  it("expands to the skill-scoped scripts and deterministic artifact paths", () => {
    const loader = new CustomSkillLoader({
      bundledSkillsDir: BUNDLED_SKILLS_DIR,
      managedSkillsDir: "/tmp/neoworker-presentation-studio-test-skills",
    });
    const skill = { ...loadSkill(), filePath: SKILL_PATH };
    const expanded = loader.expandPrompt(
      skill,
      {
        mode: "create",
        language: "chinese",
        visual_style: "soft",
        palette: "technology",
        source_path: "",
        output_dir: "",
      },
      { artifactDir: "/tmp/neoworker-artifacts" },
    );

    expect(expanded).toContain(
      path.join(BUNDLED_SKILLS_DIR, "presentation-studio", "scripts", "preflight.mjs"),
    );
    expect(expanded).toContain(
      path.join(BUNDLED_SKILLS_DIR, "presentation-studio", "scripts", "validate_plan.mjs"),
    );
    expect(expanded).toContain("references/narrative-and-quality.md");
    expect(expanded).toContain("references/style-routing.md");
    expect(expanded).toContain(
      "/tmp/neoworker-artifacts/presentation-studio",
    );
    expect(expanded).toContain("Language: chinese");
  });

  it("bundles the merged narrative, style-routing, and plan QA assets", () => {
    const skillDirectory = path.join(BUNDLED_SKILLS_DIR, "presentation-studio");

    for (const relativePath of [
      "references/narrative-and-quality.md",
      "references/style-routing.md",
      "scripts/planning-contract.mjs",
      "scripts/validate_plan.mjs",
      "THIRD_PARTY_NOTICES.md",
    ]) {
      expect(fs.existsSync(path.join(skillDirectory, relativePath))).toBe(true);
    }
  });
});
