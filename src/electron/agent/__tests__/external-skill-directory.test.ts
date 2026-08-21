import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CustomSkillLoader } from "../custom-skill-loader";
import { SkillRegistry } from "../skill-registry";

vi.mock("electron", () => ({
  app: {
    getPath: vi.fn().mockReturnValue("/tmp/neoworker-skill-loader-tests"),
  },
}));

const SKILL_MARKDOWN = `---
name: EPAI
description: Run the EPAI agent workflow.
category: Development
---

# EPAI

Run \`agent.sh\` from this skill directory.
`;

describe("external SKILL.md directories", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "neoworker-external-skill-"));
    vi.spyOn(SkillRegistry.prototype, "listManagedSkills").mockReturnValue([]);
    vi.spyOn(SkillRegistry.prototype, "inspectExternalSkill").mockResolvedValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function createLoader(externalSkillDirectories: string[]): CustomSkillLoader {
    const bundledSkillsDir = path.join(tempDir, "bundled");
    const managedSkillsDir = path.join(tempDir, "managed");
    fs.mkdirSync(bundledSkillsDir, { recursive: true });
    fs.mkdirSync(managedSkillsDir, { recursive: true });

    return new CustomSkillLoader({
      bundledSkillsDir,
      managedSkillsDir,
      skillsConfig: {
        skillsDirectory: managedSkillsDir,
        externalSkillDirectories,
        enabledSkillIds: [],
      },
    });
  }

  it("loads a configured directory that directly contains SKILL.md", async () => {
    const skillDir = path.join(tempDir, "EPAI");
    fs.mkdirSync(skillDir);
    fs.writeFileSync(path.join(skillDir, "SKILL.md"), SKILL_MARKDOWN, "utf8");
    fs.writeFileSync(path.join(skillDir, "agent.sh"), "#!/bin/sh\necho EPAI\n", "utf8");

    const loader = createLoader([skillDir]);
    const skills = await loader.reloadSkills();

    expect(skills).toHaveLength(1);
    expect(skills[0]).toMatchObject({
      id: "epai",
      name: "EPAI",
      description: "Run the EPAI agent workflow.",
      source: "external",
      filePath: path.join(skillDir, "SKILL.md"),
    });
    expect(loader.expandPrompt(skills[0], {})).toContain(path.join(skillDir, "SKILL.md"));
  });

  it("loads SKILL.md bundles from immediate child directories", async () => {
    const skillRoot = path.join(tempDir, "shared-skills");
    const firstSkillDir = path.join(skillRoot, "EPAI");
    const secondSkillDir = path.join(skillRoot, "Writer");
    fs.mkdirSync(firstSkillDir, { recursive: true });
    fs.mkdirSync(secondSkillDir, { recursive: true });
    fs.writeFileSync(path.join(firstSkillDir, "SKILL.md"), SKILL_MARKDOWN, "utf8");
    fs.writeFileSync(
      path.join(secondSkillDir, "SKILL.md"),
      "# Writer\n\nPrepare a concise written deliverable.\n",
      "utf8",
    );

    const loader = createLoader([skillRoot]);
    const skills = await loader.reloadSkills();

    expect(skills.map((skill) => skill.id).sort()).toEqual(["epai", "writer"]);
    expect(skills.every((skill) => skill.source === "external")).toBe(true);
  });
});
