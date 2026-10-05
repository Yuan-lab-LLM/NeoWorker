import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NotePencil } from "@phosphor-icons/react";
import type { SkillStatusEntry, Workspace } from "../../../shared/types";
import { SkillLibraryCard } from "../../components/SkillLibraryCard";
import { getLocalizedSkillParameterText } from "../localized-skills";
import { buildSkillUseSelection, canUseSkillFromCatalog, findSkillWorkspace, getSkillCardText, getSkillWorkspacePath } from "../skill-card-presentation";

const requirements = { bins: [], anyBins: [], env: [], config: [], os: [] };
const skill: SkillStatusEntry = {
  id: "server-product-doc-writing-standard", name: "服务器产品资料写作规范",
  description: "服务器产品资料的编写与审校规范。", category: "Writing", icon: "file-pen",
  prompt: "品牌 {{brand}}", source: "workspace", enabled: true, eligible: true,
  disabled: false, blockedByAllowlist: false, requirements, missing: requirements,
  parameters: [{ name: "brand", type: "select", required: true, default: "I", options: ["I", "Q", "A", "K"], description: "适用的产品品牌，影响字体、制图配色与空行规则" }],
};

describe("skill library presentation and launch", () => {
  it("uses concise purpose without mutating user-defined identifiers or instructions", () => {
    const rag = { ...skill, id: "epairag", name: "epairag", description: "专门用来回答 EPAI 相关知识。 Invoke when the user asks about EPAI knowledge." };
    expect(getSkillCardText(rag, "zh-CN")).toMatchObject({ name: "EPAI 知识问答", description: "专门用来回答 EPAI 相关知识。" });
    expect(rag.name).toBe("epairag");
    expect(rag.description).toContain("Invoke when");
    expect(getSkillCardText({ ...rag, name: "我的 EPAI 助手" }, "zh-CN").name).toBe("我的 EPAI 助手");
    expect(getSkillCardText(rag, "en").name).toBe("epairag");
  });
  it("retains ordinary bilingual descriptions", () => {
    expect(getSkillCardText({ ...skill, description: "API 文档 / API reference" }).description).toBe("API 文档 / API reference");
  });
  it("preserves a recovered user skill's name and parameters in the persistent library", () => {
    const recovered = { ...skill, source: "managed" as const };
    expect(getSkillCardText(recovered, "zh-CN")).toMatchObject({ name: skill.name, description: skill.description });
    expect(buildSkillUseSelection(recovered)).toMatchObject({ skillLabel: skill.name, parameterSkill: recovered });
    expect(buildSkillUseSelection(recovered)).not.toHaveProperty("workspacePath");
  });
  it("passes the original parameter schema and workspace into an editable draft", () => {
    const selection = buildSkillUseSelection(skill, "/work/project");
    expect(selection).toMatchObject({ skillId: skill.id, skillLabel: skill.name, workspacePath: "/work/project", parameterSkill: skill });
    expect(selection?.prompt).toContain("任务要求");
    expect(selection?.parameterSkill?.parameters?.[0].options).toEqual(["I", "Q", "A", "K"]);
    expect(buildSkillUseSelection({ ...skill, source: "managed", parameters: [] })).not.toHaveProperty("workspacePath");
    expect(buildSkillUseSelection({ ...skill, source: "managed", parameters: [] })).not.toHaveProperty("parameterSkill");
    expect(buildSkillUseSelection(skill)).toHaveProperty("workspacePath");
  });
  it.each([
    { disabled: true }, { enabled: false }, { eligible: false }, { blockedByAllowlist: true },
    { invocation: { userInvocable: false } }, { type: "guideline" as const },
  ])("prevents unavailable or automatic skills from launching: %j", overrides => {
    expect(canUseSkillFromCatalog({ ...skill, ...overrides })).toBe(false);
    expect(buildSkillUseSelection({ ...skill, ...overrides })).toBeNull();
  });
  it("resolves the skills directory to its registered workspace on macOS and Windows", () => {
    expect(getSkillWorkspacePath("/tmp/session/skills/")).toBe("/tmp/session");
    expect(getSkillWorkspacePath("C:\\work\\project\\skills")).toBe("C:/work/project");
    expect(getSkillWorkspacePath("")).toBe("");
    expect(getSkillWorkspacePath("/untrusted/other")).toBe("");
    const workspaces = [{ id: "original", path: "C:\\work\\project" }, { id: "wrong", path: "C:/work/project2" }] as Workspace[];
    expect(findSkillWorkspace("C:/work/project/", workspaces)?.id).toBe("original");
    expect(findSkillWorkspace("C:/missing", workspaces)).toBeUndefined();
  });
  it("renders usable controls and replaces the green badge and generic tags with scope", () => {
    const html = renderToStaticMarkup(createElement(SkillLibraryCard, { skill, icon: NotePencil, onOpen() {}, onUse() {} }));
    expect(html).toContain("使用技能");
    expect(html).toContain("查看详情");
    expect(html).toContain("当前工作区");
    expect(html).not.toContain("可直接使用");
    expect(html).not.toContain("洞察");
    const unavailable = renderToStaticMarkup(createElement(SkillLibraryCard, { skill: { ...skill, disabled: true }, icon: NotePencil, onOpen() {}, onUse() {} }));
    expect(unavailable).toContain('disabled=""');
    expect(unavailable).toContain("查看详情");
  });
  it("explains the actual document parameters without inventing brand names", () => {
    const text = getLocalizedSkillParameterText(skill, skill.parameters![0], "zh-CN");
    expect(text.name).toBe("产品品牌");
    expect(text.description).toBe(skill.parameters![0].description);
    expect(text.options).toEqual(["I", "Q", "A", "K"]);
    expect(getLocalizedSkillParameterText(skill, { name: "docType", type: "string", description: "" }, "zh-CN").name).toBe("资料类型");
    expect(getLocalizedSkillParameterText(skill, { name: "docLanguage", type: "select", description: "" }, "zh-CN").name).toBe("文档语言");
  });
});
