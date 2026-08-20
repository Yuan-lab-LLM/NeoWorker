import { describe, expect, it, vi } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { CustomSkill } from "../../../shared/types";
import { CustomSkillLoader } from "../custom-skill-loader";
import { TaskExecutor } from "../executor";
import { ToolRegistry, parseSkillArgumentObjectPrefix } from "../tools/registry";

const SKILL_PATH = path.join(
  __dirname,
  "../../../../resources/skills/ppt-master.json",
);
const REGISTRY_SKILL_PATH = path.join(
  __dirname,
  "../../../../registry/skills/ppt-master.json",
);
const BUNDLED_SKILLS_DIR = path.dirname(SKILL_PATH);

function loadSkill(): CustomSkill {
  return JSON.parse(fs.readFileSync(SKILL_PATH, "utf-8")) as CustomSkill;
}

describe("PPT Master bundled skill", () => {
  it("keeps the bundled and registry contracts in sync", () => {
    const bundled = loadSkill();
    const registry = JSON.parse(
      fs.readFileSync(REGISTRY_SKILL_PATH, "utf-8"),
    ) as CustomSkill;

    expect(registry.prompt).toBe(bundled.prompt);
    expect(registry.requires).toEqual(bundled.requires);
    expect(registry.metadata?.routing?.expectedArtifacts).toEqual(
      bundled.metadata?.routing?.expectedArtifacts,
    );
  });

  it("separates structured options from the natural-language task", () => {
    expect(
      parseSkillArgumentObjectPrefix(
        '{"profile":"quick","animation":"off"} 生成一份产品发布会 PPT',
      ),
    ).toEqual({ profile: "quick", animation: "off" });

    const resolveSkillArgsToParameters = (
      ToolRegistry.prototype as unknown as {
        resolveSkillArgsToParameters: (
          skill: CustomSkill,
          args: string,
        ) => { success: boolean; parameters?: Record<string, unknown> };
      }
    ).resolveSkillArgsToParameters;

    expect(
      resolveSkillArgsToParameters.call({}, loadSkill(), "生成一份产品发布会 PPT"),
    ).toEqual({ success: true, parameters: {} });
    expect(
      resolveSkillArgsToParameters.call(
        {},
        loadSkill(),
        '{"profile":"quick"} 生成一份产品发布会 PPT',
      ),
    ).toEqual({ success: true, parameters: { profile: "quick" } });
  });

  it("is visible to users but excluded from automatic model routing", () => {
    const loader = new CustomSkillLoader({
      bundledSkillsDir: BUNDLED_SKILLS_DIR,
      managedSkillsDir: "/tmp/neoworker-ppt-master-test-skills",
    });
    const skill = loadSkill();

    expect(skill.id).toBe("ppt-master");
    expect(skill.enabled).toBe(true);
    expect(skill.invocation).toEqual({
      userInvocable: true,
      disableModelInvocation: true,
    });
    expect(loader.listModelInvocableSkills().map((candidate) => candidate.id)).not.toContain(
      "ppt-master",
    );
  });

  it("expands to the packaged workflow and invokes the host-pinned advanced renderer", () => {
    const loader = new CustomSkillLoader({
      bundledSkillsDir: BUNDLED_SKILLS_DIR,
      managedSkillsDir: "/tmp/neoworker-ppt-master-test-skills",
    });
    const skill = { ...loadSkill(), filePath: SKILL_PATH };
    const expanded = loader.expandPrompt(
      skill,
      {
        route: "native-enhance",
        profile: "default",
        language: "chinese",
        source_path: "/tmp/source.pptx",
        output_dir: "",
        animation: "on",
        narration: "off",
      },
      { artifactDir: "/tmp/neoworker-artifacts" },
    );

    expect(expanded).toContain(
      path.join(BUNDLED_SKILLS_DIR, "ppt-master", "scripts", "neoworker_preflight.py"),
    );
    expect(expanded).toContain("Route: native-enhance");
    expect(expanded).toContain("call `create_presentation` exactly once");
    expect(expanded).toContain("force that call through the PPT Master advanced renderer");
    expect(expanded).toContain("Do not call `generate_presentation`");
    expect(expanded).toContain(
      "canonical task project directory is exactly `/tmp/neoworker-artifacts`",
    );
    expect(expanded).toContain(
      "/tmp/neoworker-artifacts/output/presentation.pptx",
    );
    expect(skill.metadata?.routing?.expectedArtifacts).toEqual([
      "output/presentation.pptx",
      "validation/pptx-delivery-check.json",
      "validation/workflow.log",
    ]);
  });

  it("pins presentation tool calls to the advanced renderer and canonical output", () => {
    const workspacePath = fs.mkdtempSync(
      path.join(os.tmpdir(), "neoworker-ppt-master-routing-"),
    );
    try {
      const artifactRoot = path.join(
        workspacePath,
        "artifacts",
        "skills",
        "task-ppt-master-routing",
        "ppt-master",
      );
      const executor = createPptMasterExecutor(
        workspacePath,
        artifactRoot,
        "task-ppt-master-routing",
      );
      const prepared = (
        TaskExecutor as Any
      ).prototype.preparePresentationWorkflowToolInput.call(
        executor,
        "create_presentation",
        {
          filename: "ordinary.pptx",
          officeProfile: "pitch-deck",
          slides: [{ title: "Advanced deck", slideType: "cover" }],
        },
      );

      expect(prepared).toMatchObject({
        filename: path.join(artifactRoot, "output", "presentation.pptx"),
        generationMode: "ppt-master",
        presentationWorkflow: "ppt-master",
        workflowArtifactRoot: artifactRoot,
        officeProfile: "pitch-deck",
        visualMode: "editorial",
      });
      expect(prepared.styleBrief).toContain("PPT Master advanced editorial system");
    } finally {
      fs.rmSync(workspacePath, { recursive: true, force: true });
    }
  });

  it("keeps executor guidance on the single host-pinned advanced renderer", () => {
    const workspacePath = fs.mkdtempSync(
      path.join(os.tmpdir(), "neoworker-ppt-master-guidance-"),
    );
    try {
      const taskId = "task-ppt-master-guidance";
      const artifactRoot = path.join(
        workspacePath,
        "artifacts",
        "skills",
        taskId,
        "ppt-master",
      );
      const executor = createPptMasterExecutor(
        workspacePath,
        artifactRoot,
        taskId,
      );
      const hint = (
        TaskExecutor as Any
      ).prototype.buildDeterministicWorkflowHint.call(executor, {
        artifactKind: "presentation",
      });

      expect(hint).toContain("call create_presentation exactly once");
      expect(hint).toContain("host pins it to the advanced renderer");
      expect(hint).toContain("Do not call generate_presentation");
      expect(hint).not.toContain(
        "Do not call the legacy create_presentation or generate_presentation tools",
      );
    } finally {
      fs.rmSync(workspacePath, { recursive: true, force: true });
    }
  });

  it("pins a requested PPT Master route before applied-skill bookkeeping exists", () => {
    const workspacePath = fs.mkdtempSync(
      path.join(os.tmpdir(), "neoworker-ppt-master-requested-routing-"),
    );
    try {
      const taskId = "task-ppt-master-requested-routing";
      const artifactRoot = path.join(
        workspacePath,
        "artifacts",
        "skills",
        taskId,
        "ppt-master",
      );
      const executor = createPptMasterExecutor(
        workspacePath,
        artifactRoot,
        taskId,
        { requestedSkillId: "/ppt-master", includeAppliedSkill: false },
      );
      const prepared = (
        TaskExecutor as Any
      ).prototype.preparePresentationWorkflowToolInput.call(
        executor,
        "create_presentation",
        {
          filename: "ordinary.pptx",
          slides: [{ title: "Advanced deck", slideType: "cover" }],
        },
      );

      expect(prepared).toMatchObject({
        filename: path.join(artifactRoot, "output", "presentation.pptx"),
        generationMode: "ppt-master",
        presentationWorkflow: "ppt-master",
        workflowArtifactRoot: artifactRoot,
        officeProfile: "morph-ppt",
        visualMode: "editorial",
      });
    } finally {
      fs.rmSync(workspacePath, { recursive: true, force: true });
    }
  });

  it("lets the explicitly requested PPT Master route override stale applied routing", () => {
    const workspacePath = fs.mkdtempSync(
      path.join(os.tmpdir(), "neoworker-ppt-master-routing-precedence-"),
    );
    try {
      const taskId = "task-ppt-master-routing-precedence";
      const artifactRoot = path.join(
        workspacePath,
        "artifacts",
        "skills",
        taskId,
        "ppt-master",
      );
      const executor = createPptMasterExecutor(
        workspacePath,
        artifactRoot,
        taskId,
        {
          requestedSkillId: "ppt-master",
          appliedSkillId: "presentation-studio",
        },
      );
      const prepared = (
        TaskExecutor as Any
      ).prototype.preparePresentationWorkflowToolInput.call(
        executor,
        "create_presentation",
        { filename: "ordinary.pptx" },
      );

      expect(prepared).toMatchObject({
        generationMode: "ppt-master",
        presentationWorkflow: "ppt-master",
        workflowArtifactRoot: artifactRoot,
      });
      const hint = (
        TaskExecutor as Any
      ).prototype.buildDeterministicWorkflowHint.call(executor, {
        artifactKind: "presentation",
      });
      expect(hint).toContain("PPT MASTER ADVANCED WORKFLOW");
      expect(hint).not.toContain("PRESENTATION STUDIO WORKFLOW");
    } finally {
      fs.rmSync(workspacePath, { recursive: true, force: true });
    }
  });

  it("keeps legacy PPT Master tasks pinned from their command-derived title", () => {
    const workspacePath = fs.mkdtempSync(
      path.join(os.tmpdir(), "neoworker-ppt-master-legacy-title-"),
    );
    try {
      const taskId = "task-ppt-master-legacy-title";
      const artifactRoot = path.join(
        workspacePath,
        "artifacts",
        "skills",
        taskId,
        "ppt-master",
      );
      const executor = createPptMasterExecutor(
        workspacePath,
        artifactRoot,
        taskId,
        {
          taskTitle: "PPT Master：高级演示文稿",
          includeAppliedSkill: false,
        },
      );
      const prepared = (
        TaskExecutor as Any
      ).prototype.preparePresentationWorkflowToolInput.call(
        executor,
        "generate_presentation",
        { filename: "legacy.pptx" },
      );

      expect(prepared).toMatchObject({
        generationMode: "ppt-master",
        presentationWorkflow: "ppt-master",
        workflowArtifactRoot: artifactRoot,
      });
    } finally {
      fs.rmSync(workspacePath, { recursive: true, force: true });
    }
  });

  it("rejects a PPTX in the advanced output directory without PPT Master evidence", () => {
    const workspacePath = fs.mkdtempSync(
      path.join(os.tmpdir(), "neoworker-ppt-master-reject-"),
    );
    try {
      const artifactRoot = path.join(
        workspacePath,
        "artifacts",
        "skills",
        "task-ppt-master-reject",
        "ppt-master",
      );
      const outputPath = path.join(
        artifactRoot,
        "output",
        "presentation.pptx",
      );
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      const pptxBytes = Buffer.alloc(2_048);
      pptxBytes.write("PK", 0, "ascii");
      fs.writeFileSync(outputPath, pptxBytes);

      const executor = createPptMasterExecutor(
        workspacePath,
        artifactRoot,
        "task-ppt-master-reject",
        { requestedSkillId: "ppt-master", includeAppliedSkill: false },
      );
      const delivered = (
        TaskExecutor as Any
      ).prototype.finalizePresentationArtifactDelivery.call(executor);

      expect(delivered).toBeNull();
      expect(executor.daemon.registerArtifact).not.toHaveBeenCalled();
      expect(executor.emitEvent).toHaveBeenCalledWith(
        "log",
        expect.objectContaining({
          workflow: "ppt-master",
          reason: "missing_nonempty_workflow_log",
        }),
      );
    } finally {
      fs.rmSync(workspacePath, { recursive: true, force: true });
    }
  });

  it("delivers only a PPT Master output with matching workflow and QA evidence", () => {
    const workspacePath = fs.mkdtempSync(
      path.join(os.tmpdir(), "neoworker-ppt-master-accept-"),
    );
    try {
      const artifactRoot = path.join(
        workspacePath,
        "artifacts",
        "skills",
        "task-ppt-master-accept",
        "ppt-master",
      );
      const outputPath = path.join(
        artifactRoot,
        "output",
        "presentation.pptx",
      );
      const validationDirectory = path.join(artifactRoot, "validation");
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.mkdirSync(validationDirectory, { recursive: true });
      const pptxBytes = Buffer.alloc(2_048);
      pptxBytes.write("PK", 0, "ascii");
      fs.writeFileSync(outputPath, pptxBytes);
      fs.writeFileSync(
        path.join(validationDirectory, "workflow.log"),
        "project_manager init\nroute generate\n",
      );
      fs.writeFileSync(
        path.join(validationDirectory, "pptx-delivery-check.json"),
        JSON.stringify({
          schema: "ppt-master.pptx-delivery-check.v1",
          status: "passed",
          file: { path: outputPath, bytes: pptxBytes.length },
        }),
      );

      const executor = createPptMasterExecutor(
        workspacePath,
        artifactRoot,
        "task-ppt-master-accept",
        { requestedSkillId: "ppt-master", includeAppliedSkill: false },
      );
      const delivered = (
        TaskExecutor as Any
      ).prototype.finalizePresentationArtifactDelivery.call(executor);

      expect(delivered).toBe(outputPath);
      expect(executor.daemon.registerArtifact).toHaveBeenCalledWith(
        "task-ppt-master-accept",
        outputPath,
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      );
    } finally {
      fs.rmSync(workspacePath, { recursive: true, force: true });
    }
  });

  it("bundles the upstream integrity guard and lightweight advanced routes", () => {
    const skillDirectory = path.join(BUNDLED_SKILLS_DIR, "ppt-master");

    for (const relativePath of [
      "SKILL.md",
      "THIRD_PARTY_NOTICES.md",
      "scripts/attribution_guard.py",
      "scripts/pptx_delivery_check.py",
      "workflows/routing.md",
      "templates",
    ]) {
      expect(fs.existsSync(path.join(skillDirectory, relativePath))).toBe(true);
    }
    expect(fs.existsSync(path.join(skillDirectory, "ai-image-comparison"))).toBe(false);
    expect(fs.existsSync(path.join(skillDirectory, "templates", "icons"))).toBe(false);
    expect(fs.existsSync(path.join(skillDirectory, "templates", "sounds"))).toBe(false);
  });
});

type PptMasterExecutorOptions = {
  requestedSkillId?: string;
  includeAppliedSkill?: boolean;
  taskTitle?: string;
  appliedSkillId?: "ppt-master" | "visual-presentation" | "presentation-studio";
};

function createPptMasterExecutor(
  workspacePath: string,
  artifactRoot: string,
  taskId: string,
  options: PptMasterExecutorOptions = {},
): Any {
  const executor = Object.create(TaskExecutor.prototype) as Any;
  executor.task = {
    id: taskId,
    ...(options.taskTitle ? { title: options.taskTitle } : {}),
    ...(options.requestedSkillId
      ? { agentConfig: { requestedSkillId: options.requestedSkillId } }
      : {}),
  };
  executor.workspace = { path: workspacePath };
  const appliedSkillId = options.appliedSkillId || "ppt-master";
  executor.appliedSkills =
    options.includeAppliedSkill === false
      ? []
      : [
          {
            skillId: appliedSkillId,
            skillName:
              appliedSkillId === "ppt-master"
                ? "PPT Master（高级）"
                : appliedSkillId,
            content: "Advanced PPT workflow",
            trigger: "user",
            parameters: {},
            reason: "test",
            appliedAt: Date.now(),
            contextDirectives: { artifactDirectories: [artifactRoot] },
          },
        ];
  executor.deliveredPresentationArtifactPaths = new Set();
  executor.fileOperationTracker = {
    getCreatedFiles: vi.fn(() => []),
    recordFileCreation: vi.fn(),
  };
  executor.emitEvent = vi.fn();
  executor.daemon = {
    getTaskEvents: vi.fn(() => []),
    registerArtifact: vi.fn(),
  };
  return executor;
}
