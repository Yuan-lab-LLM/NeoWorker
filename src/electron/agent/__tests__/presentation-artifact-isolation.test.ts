import { afterEach, describe, expect, it, vi } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { createHash } from "crypto";
import { TaskExecutor } from "../executor";

vi.mock("electron", () => ({ app: { getPath: () => os.tmpdir() } }));
const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach(dir => fs.rmSync(dir, { recursive: true, force: true })));
function setup() {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "epai-delivery-")); dirs.push(workspace);
  const root = path.join(workspace, "artifacts/skills/epai/presentation-studio");
  const project = path.join(root, "presentation-studio");
  const executor = Object.create(TaskExecutor.prototype) as Any;
  Object.assign(executor, {
    task: { id: "epai", parentTaskId: "root", userPrompt: "分析 EPAI 并生成 PPT" },
    workspace: { path: workspace },
    appliedSkills: [{ skillId: "presentation-studio", contextDirectives: { artifactDirectories: [root] } }],
    deliveredPresentationArtifactPaths: new Set(), emitEvent: vi.fn(),
    fileOperationTracker: { getCreatedFiles: vi.fn(() => []), recordFileCreation: vi.fn() },
    daemon: { getTaskEvents: vi.fn(() => []), registerArtifact: vi.fn() },
  });
  const writeDeck = (name: string, text: string) => {
    const file = path.join(workspace, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const bytes = Buffer.alloc(2048); bytes.write(`PK ${text}`); fs.writeFileSync(file, bytes);
    return file;
  };
  return { executor, workspace, root, project, writeDeck };
}

describe("presentation delivery task ownership", () => {
  it("never copies an old MotusAI upload into an EPAI synthesis that produced nothing", () => {
    const { executor, project, writeDeck } = setup();
    const source = writeDeck(".neoworker/uploads/123/MotusAI.pptx", "MotusAI Introduce");
    writeDeck("artifacts/skills/old-task/presentation-studio/output/presentation.pptx", "Other task");
    // Even a misleading read/input artifact event cannot promote an upload.
    executor.daemon.getTaskEvents.mockReturnValue([{ payload: { path: source } }]);
    expect(executor.finalizePresentationArtifactDelivery()).toBeNull();
    expect(fs.existsSync(path.join(project, "output/presentation.pptx"))).toBe(false);
    expect(executor.daemon.registerArtifact).not.toHaveBeenCalled();
    expect(executor.presentationDeliveryRejectionReason).toBeTruthy();
    expect(fs.readFileSync(source).includes(Buffer.from("MotusAI"))).toBe(true);
  });
  it("requires QA even when an unverified copy already exists in this task's output directory", () => {
    const { executor, writeDeck } = setup();
    writeDeck("artifacts/skills/epai/presentation-studio/presentation-studio/output/presentation.pptx", "Unverified");
    expect(executor.finalizePresentationArtifactDelivery()).toBeNull();
    expect(executor.daemon.registerArtifact).not.toHaveBeenCalled();
  });
  it("publishes only the task-owned QA-approved output even with a newer unrelated upload", () => {
    const { executor, project, writeDeck } = setup();
    const output = writeDeck("artifacts/skills/epai/presentation-studio/presentation-studio/output/presentation.pptx", "EPAI competition");
    fs.writeFileSync(path.join(project, "qa-report.json"), JSON.stringify({
      status: "passed", slideCount: 1, errors: [], outputPath: output,
      outputSha256: createHash("sha256").update(fs.readFileSync(output)).digest("hex"),
    }));
    writeDeck(".neoworker/uploads/123/MotusAI.pptx", "MotusAI Introduce");
    expect(executor.finalizePresentationArtifactDelivery()).toBe(output);
    expect(executor.daemon.registerArtifact).toHaveBeenCalledWith("epai", output, expect.any(String));
  });
  it("does not accept a symlink from the task directory to an uploaded source", () => {
    const { executor, project, writeDeck } = setup();
    const source = writeDeck(".neoworker/uploads/123/MotusAI.pptx", "MotusAI");
    fs.mkdirSync(path.join(project, "output"), { recursive: true });
    fs.symlinkSync(source, path.join(project, "output/presentation.pptx"));
    expect(executor.finalizePresentationArtifactDelivery()).toBeNull();
    expect(executor.daemon.registerArtifact).not.toHaveBeenCalled();
  });
  it("keeps verified native translation output at its original path and requires its receipt", () => {
    const { executor, writeDeck } = setup();
    const output = writeDeck("MotusAI 中文.pptx", "Translated MotusAI");
    executor.fileOperationTracker.getCreatedFiles.mockReturnValue([output]);
    executor.toolRegistry = { getDocumentTranslationGuidance: () => "Preserve source", isVerifiedTranslationOutput: () => false };
    expect(executor.finalizePresentationArtifactDelivery()).toBeNull();
    executor.toolRegistry.isVerifiedTranslationOutput = (p: string) => p === output;
    expect(executor.finalizePresentationArtifactDelivery()).toBe(output);
  });
});
