import { describe, expect, it, vi } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { CustomSkill } from "../../../shared/types";
import { CustomSkillLoader } from "../custom-skill-loader";
import { TaskExecutor } from "../executor";

const SKILL_PATH = path.join(
  __dirname,
  "../../../../resources/skills/visual-presentation.json",
);
const BUNDLED_SKILLS_DIR = path.dirname(SKILL_PATH);

function loadSkill(): CustomSkill {
  return JSON.parse(fs.readFileSync(SKILL_PATH, "utf-8")) as CustomSkill;
}

describe("Visual Presentation bundled skill", () => {
  it("declares a single deterministic PPTX plus editable source artifacts", () => {
    const skill = loadSkill();

    expect(skill.id).toBe("visual-presentation");
    expect(skill.enabled).toBe(true);
    expect(skill.requires?.tools).toEqual(["generate_image", "run_command"]);
    expect(skill.metadata?.routing?.expectedArtifacts).toEqual([
      "visual-presentation/output/presentation.pptx",
      "visual-presentation/deck.json",
      "visual-presentation/qa-report.json",
    ]);
    expect(skill.prompt).toContain("exactly one newly generated PPTX");
    expect(skill.prompt).toContain("presentation-v2.pptx");
    expect(skill.prompt).toContain("aspectRatio: \"16:9\"");
  });

  it("matches explicit visual deck requests without taking document or edit work", () => {
    const loader = new CustomSkillLoader({
      bundledSkillsDir: BUNDLED_SKILLS_DIR,
      managedSkillsDir: "/tmp/neoworker-visual-presentation-test-skills",
    });
    const skill = loadSkill();

    expect(loader.matchesSkillRoutingQuery(skill, "做一份好看的发布会 PPT")).toBe(true);
    expect(loader.matchesSkillRoutingQuery(skill, "Create a cinematic pitch deck")).toBe(true);
    expect(loader.matchesSkillRoutingQuery(skill, "写一份 Word 报告")).toBe(false);
    expect(loader.matchesSkillRoutingQuery(skill, "修改这个现有 PPTX 的第三页")).toBe(false);
  });

  it("expands to the hybrid compiler and fixed output path", () => {
    const loader = new CustomSkillLoader({
      bundledSkillsDir: BUNDLED_SKILLS_DIR,
      managedSkillsDir: "/tmp/neoworker-visual-presentation-test-skills",
    });
    const skill = { ...loadSkill(), filePath: SKILL_PATH };
    const expanded = loader.expandPrompt(
      skill,
      {
        language: "chinese",
        style: "bold-editorial",
        audience: "executives",
        slide_count: 8,
        output_dir: "",
      },
      { artifactDir: "/tmp/neoworker-artifacts" },
    );

    expect(expanded).toContain(
      path.join(BUNDLED_SKILLS_DIR, "visual-presentation", "scripts", "merge_to_pptx.mjs"),
    );
    expect(expanded).toContain(
      "/tmp/neoworker-artifacts/visual-presentation/output/presentation.pptx",
    );
    expect(expanded).toContain("Language: chinese");
  });

  it("promotes a hidden PPTX into the visible task artifact directory", () => {
    const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), "neoworker-ppt-delivery-"));
    try {
      const hiddenDir = path.join(workspacePath, ".neoworker");
      const hiddenPptx = path.join(hiddenDir, "minimax_ppt.pptx");
      fs.mkdirSync(hiddenDir, { recursive: true });
      const pptxBytes = Buffer.alloc(2_048);
      pptxBytes.write("PK", 0, "ascii");
      fs.writeFileSync(hiddenPptx, pptxBytes);

      const artifactRoot = path.join(
        workspacePath,
        "artifacts",
        "skills",
        "task-visual-delivery",
        "visual-presentation",
      );
      const executor = Object.create(TaskExecutor.prototype) as Any;
      executor.task = { id: "task-visual-delivery" };
      executor.workspace = { path: workspacePath };
      executor.appliedSkills = [
        {
          skillId: "visual-presentation",
          skillName: "Visual Presentation",
          content: "Visual workflow",
          trigger: "model",
          parameters: {},
          reason: "test",
          appliedAt: Date.now(),
          contextDirectives: {
            artifactDirectories: [artifactRoot, path.join(workspacePath, "artifacts")],
          },
        },
      ];
      executor.deliveredPresentationArtifactPaths = new Set();
      executor.fileOperationTracker = {
        getCreatedFiles: vi.fn(() => [hiddenPptx]),
        recordFileCreation: vi.fn(),
      };
      executor.emitEvent = vi.fn();
      executor.daemon = {
        getTaskEvents: vi.fn(() => []),
        registerArtifact: vi.fn(),
      };

      const delivered = (
        TaskExecutor as Any
      ).prototype.finalizePresentationArtifactDelivery.call(executor);
      const expectedPath = path.join(
        artifactRoot,
        "visual-presentation",
        "output",
        "presentation.pptx",
      );

      expect(delivered).toBe(expectedPath);
      expect(fs.readFileSync(expectedPath)).toEqual(pptxBytes);
      expect(executor.fileOperationTracker.recordFileCreation).toHaveBeenCalledWith(expectedPath);
      expect(executor.emitEvent).toHaveBeenCalledWith(
        "artifact_created",
        expect.objectContaining({ path: expectedPath, workflow: "visual-presentation" }),
      );
      expect(executor.daemon.registerArtifact).toHaveBeenCalledWith(
        "task-visual-delivery",
        expectedPath,
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      );
    } finally {
      fs.rmSync(workspacePath, { recursive: true, force: true });
    }
  });

  it("preserves a previous delivered PPTX and promotes the next one as v2", () => {
    const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), "neoworker-ppt-version-"));
    try {
      const hiddenDir = path.join(workspacePath, ".neoworker");
      const hiddenPptx = path.join(hiddenDir, "next-deck.pptx");
      fs.mkdirSync(hiddenDir, { recursive: true });
      const nextBytes = Buffer.alloc(2_048, 2);
      nextBytes.write("PK", 0, "ascii");

      const artifactRoot = path.join(
        workspacePath,
        "artifacts",
        "skills",
        "task-versioned-delivery",
        "visual-presentation",
      );
      const canonicalPath = path.join(
        artifactRoot,
        "visual-presentation",
        "output",
        "presentation.pptx",
      );
      fs.mkdirSync(path.dirname(canonicalPath), { recursive: true });
      const previousBytes = Buffer.alloc(2_048, 1);
      previousBytes.write("PK", 0, "ascii");
      fs.writeFileSync(canonicalPath, previousBytes);
      fs.utimesSync(canonicalPath, new Date(1_000), new Date(1_000));
      fs.writeFileSync(hiddenPptx, nextBytes);

      const executor = Object.create(TaskExecutor.prototype) as Any;
      executor.task = { id: "task-versioned-delivery" };
      executor.workspace = { path: workspacePath };
      executor.appliedSkills = [
        {
          skillId: "visual-presentation",
          skillName: "Visual Presentation",
          content: "Visual workflow",
          trigger: "model",
          parameters: {},
          reason: "test",
          appliedAt: Date.now(),
          contextDirectives: { artifactDirectories: [artifactRoot] },
        },
      ];
      executor.deliveredPresentationArtifactPaths = new Set();
      executor.fileOperationTracker = {
        getCreatedFiles: vi.fn(() => [hiddenPptx]),
        recordFileCreation: vi.fn(),
      };
      executor.emitEvent = vi.fn();
      executor.daemon = {
        getTaskEvents: vi.fn(() => []),
        registerArtifact: vi.fn(),
      };

      const delivered = (
        TaskExecutor as Any
      ).prototype.finalizePresentationArtifactDelivery.call(executor);
      const versionedPath = path.join(path.dirname(canonicalPath), "presentation-v2.pptx");

      expect(delivered).toBe(versionedPath);
      expect(fs.readFileSync(canonicalPath)).toEqual(previousBytes);
      expect(fs.readFileSync(versionedPath)).toEqual(nextBytes);
      expect(executor.daemon.registerArtifact).toHaveBeenCalledWith(
        "task-versioned-delivery",
        versionedPath,
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      );
    } finally {
      fs.rmSync(workspacePath, { recursive: true, force: true });
    }
  });
});
