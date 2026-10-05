import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";
import type { CustomSkill } from "../../../shared/types";
import { CustomSkillLoader } from "../custom-skill-loader";
import { buildCanonicalTaskIntentQuery } from "../task-intent-query";

const SKILL_PATH = path.join(
  __dirname,
  "../../../../resources/skills/presentation-studio.json",
);
const BUNDLED_SKILLS_DIR = path.dirname(SKILL_PATH);

function loadSkill(): CustomSkill {
  return JSON.parse(fs.readFileSync(SKILL_PATH, "utf-8")) as CustomSkill;
}

describe("Presentation Studio bundled skill", () => {
  it("offers native company templates without routing translations into new decks", () => {
    const skill = loadSkill();
    expect(skill.parameters?.find(p => p.name === "mode")?.options).toContain("template");
    expect(skill.parameters?.find(p => p.name === "template_path")?.input).toBe("file");
    expect(skill.prompt).toContain("import_template.mjs");
    expect(skill.prompt).toContain("Use edit for revisions/translations");
    expect(skill.prompt).toContain("template-v1");
  });
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

  it("does not route attachment content that merely mentions PPT", () => {
    const loader = new CustomSkillLoader({
      bundledSkillsDir: BUNDLED_SKILLS_DIR,
      managedSkillsDir: "/tmp/neoworker-presentation-studio-test-skills",
    });
    const query = buildCanonicalTaskIntentQuery({
      title: "生成excel台账",
      rawPrompt: `生成excel台账

Attached files (relative to workspace):
- meeting.docx (.neoworker/uploads/123/meeting.docx)
  Extracted content:
  [[ATTACHMENT_EXTRACTED_CONTENT_START]]
    会议决定下周制作 PPT 汇报材料。
  [[ATTACHMENT_EXTRACTED_CONTENT_END]]`,
    });

    expect(query).toBe("生成excel台账");
    expect(loader.matchesSkillRoutingQuery(loadSkill(), query)).toBe(false);
  });

  it("routes an implicitly referenced attached PPTX for in-place editing", () => {
    const loader = new CustomSkillLoader({
      bundledSkillsDir: BUNDLED_SKILLS_DIR,
      managedSkillsDir: "/tmp/neoworker-presentation-studio-test-skills",
    });
    const query = buildCanonicalTaskIntentQuery({
      title: "修改这个文件",
      rawPrompt: "修改这个文件",
      prompt: `修改这个文件

Attached files (relative to workspace):
- review.pptx (.neoworker/uploads/123/review.pptx)`,
    });

    expect(query).toContain("attached PowerPoint presentation");
    expect(loader.matchesSkillRoutingQuery(loadSkill(), query)).toBe(true);
  });

  it("routes multi-deck translation through the existing-deck workflow", () => {
    const loader = new CustomSkillLoader({
      bundledSkillsDir: BUNDLED_SKILLS_DIR,
      managedSkillsDir: "/tmp/neoworker-presentation-studio-test-skills",
    });
    const query = buildCanonicalTaskIntentQuery({
      rawPrompt: "帮我把这几个 PPT 翻译成中文",
    });

    expect(loader.matchesSkillRoutingQuery(loadSkill(), query)).toBe(true);
    expect(loadSkill().prompt).toContain("mode");
  });

  it("declares native template preservation for translation", () => {
    const instructions = fs.readFileSync(
      path.join(BUNDLED_SKILLS_DIR, "presentation-studio", "SKILL.md"),
      "utf-8",
    );

    expect(instructions).toContain("Translating existing decks");
    expect(instructions).toContain("always editing operations");
    expect(instructions).toContain("Never merge them or bootstrap a blank project");
  });

  it("does not route the source deck skill for a PPT-to-Excel conversion", () => {
    const loader = new CustomSkillLoader({
      bundledSkillsDir: BUNDLED_SKILLS_DIR,
      managedSkillsDir: "/tmp/neoworker-presentation-studio-test-skills",
    });
    const query = buildCanonicalTaskIntentQuery({
      rawPrompt: "把 PPT 转成 Excel 台账",
    });

    expect(loader.matchesSkillRoutingQuery(loadSkill(), query)).toBe(false);
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
      "scripts/prepare_project.mjs",
      "scripts/review-queue.mjs",
      "references/catalog-authoring.md",
      "scripts/layout-catalog.mjs",
      "scripts/layout-engine.mjs",
      "scripts/visual-layouts.mjs",
      "scripts/rendered-layout-check.mjs",
      "scripts/package-check.mjs",
      "scripts/native-edit.mjs",
      "scripts/build_edit.mjs",
      "scripts/inspect_edit.mjs",
      "references/layout-catalog.md",
      "THIRD_PARTY_NOTICES.md",
    ]) {
      expect(fs.existsSync(path.join(skillDirectory, relativePath))).toBe(true);
    }
  });

  it("directs new decks into the catalog while keeping source edits on the preservation path", () => {
    const prompt = loadSkill().prompt;
    expect(prompt).toContain("catalog-v1");
    expect(prompt).toContain("typed content");
    expect(prompt).toContain("without truncating or shrinking");
    expect(prompt).toContain("never bootstrap them as new catalog decks");
    expect(prompt).toContain("native-edit.mjs");
    expect(prompt).toContain("build_edit.mjs");
  });
});
