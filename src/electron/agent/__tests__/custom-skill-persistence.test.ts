import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CustomSkillLoader } from "../custom-skill-loader";
import { SkillRegistry } from "../skill-registry";

vi.mock("electron", () => ({ app: { getPath: () => "/tmp/neoworker-skill-tests" } }));

const skill = {
  id: "server-product-doc-writing-standard", name: "服务器产品资料写作规范",
  description: "编写和审校服务器产品资料。", category: "Writing", icon: "file-text",
  prompt: "按资料写作规范编写 {{docType}}。", enabled: true,
  parameters: [{ name: "docType", type: "string" as const, description: "资料类型", required: true }],
};

describe("generated skill persistence", () => {
  let root: string;
  let managed: string;
  let workspace: string;
  const loader = () => new CustomSkillLoader({ bundledSkillsDir: path.join(root, "bundled"), managedSkillsDir: managed });
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "neoworker-persistent-skills-"));
    managed = path.join(root, "managed");
    workspace = path.join(root, "temporary-session");
    vi.spyOn(SkillRegistry.prototype, "listManagedSkills").mockReturnValue([]);
    vi.spyOn(SkillRegistry.prototype, "inspectExternalSkill").mockResolvedValue(null);
  });
  afterEach(() => { vi.restoreAllMocks(); fs.rmSync(root, { recursive: true, force: true }); });
  const legacy = (value = skill) => {
    fs.mkdirSync(path.join(workspace, "skills"), { recursive: true });
    const file = path.join(workspace, "skills", `${value.id}.json`);
    fs.writeFileSync(file, JSON.stringify(value));
    return file;
  };
  const temp = () => [{ id: "__temp_workspace__:original", path: workspace }];

  it("keeps a generated skill after the creating workspace disappears and the app restarts", async () => {
    const first = loader();
    first.setWorkspaceSkillsDir(workspace);
    const created = await first.createSkill(skill);
    expect(created.source).toBe("managed");
    expect(created.filePath).toBe(path.join(managed, `${skill.id}.json`));
    fs.rmSync(workspace, { recursive: true, force: true });
    const restarted = loader();
    await restarted.initialize();
    expect(restarted.getSkill(skill.id)).toMatchObject(skill);
  });

  it("recovers a legacy temporary skill with its parameters and retains a backup", async () => {
    const original = legacy();
    const first = loader();
    expect(first.recoverTemporaryWorkspaceSkills(temp())).toBe(1);
    expect(fs.readFileSync(`${original}.migrated`, "utf8")).toBe(JSON.stringify(skill));
    expect(fs.existsSync(original)).toBe(false);
    const restarted = loader();
    await restarted.initialize();
    expect(restarted.getSkill(skill.id)).toMatchObject({ ...skill, source: "managed" });
    expect(restarted.recoverTemporaryWorkspaceSkills(temp())).toBe(0);
    await restarted.deleteManagedSkill(skill.id);
    expect(restarted.recoverTemporaryWorkspaceSkills(temp())).toBe(0);
    expect(fs.existsSync(path.join(managed, `${skill.id}.json`))).toBe(false);
  });

  it("never overwrites a persistent skill with an older temporary copy", async () => {
    const original = legacy();
    const first = loader();
    await first.createSkill({ ...skill, prompt: "Updated instructions" });
    expect(first.recoverTemporaryWorkspaceSkills(temp())).toBe(0);
    expect(first.getSkill(skill.id)?.prompt).toBe("Updated instructions");
    expect(fs.existsSync(original)).toBe(true);
    await expect(first.createSkill(skill)).rejects.toThrow();
    expect(JSON.parse(fs.readFileSync(path.join(managed, `${skill.id}.json`), "utf8")).prompt).toBe("Updated instructions");
  });

  it("preserves explicit workspace scope and does not migrate normal project skills", async () => {
    const first = loader();
    first.setWorkspaceSkillsDir(workspace);
    const created = await first.createWorkspaceSkill(skill);
    expect(created.source).toBe("workspace");
    expect(first.recoverTemporaryWorkspaceSkills([{ id: "project", path: workspace }])).toBe(0);
    const restarted = loader();
    await restarted.initialize();
    expect(restarted.getSkill(skill.id)).toBeUndefined();
    await restarted.initializeForWorkspace(workspace);
    expect(restarted.getSkill(skill.id)).toMatchObject(skill);
  });

  it("ignores invalid legacy manifests and rejects path traversal during creation", async () => {
    const original = legacy({ ...skill, prompt: "" });
    const first = loader();
    expect(first.recoverTemporaryWorkspaceSkills(temp())).toBe(0);
    expect(fs.existsSync(original)).toBe(true);
    await expect(first.createSkill({ ...skill, id: "../outside" })).rejects.toThrow("Invalid custom skill");
    expect(fs.existsSync(path.join(root, "outside.json"))).toBe(false);
  });
});
