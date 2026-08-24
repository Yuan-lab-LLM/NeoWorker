import { describe, expect, it } from "vitest";
import { deriveAgentNameFromPrompt, isGenericAgentName } from "../agent-name";

describe("agent naming", () => {
  it("derives concise, distinct names from Chinese creation requests", () => {
    expect(
      deriveAgentNameFromPrompt("创建一个团队问答智能体，使用工作区里的文档回答问题。"),
    ).toBe("团队问答智能体");
    expect(
      deriveAgentNameFromPrompt("创建一个缺陷分诊智能体，审查新进缺陷并判断优先级。"),
    ).toBe("缺陷分诊智能体");
    expect(deriveAgentNameFromPrompt("创建一个能写PR稿的")).toBe("写PR稿智能体");
    expect(deriveAgentNameFromPrompt("创建一个能写PR稿的智能体")).toBe("写PR稿智能体");
  });

  it("recognizes generic fallback names", () => {
    expect(isGenericAgentName("Personal Agent")).toBe(true);
    expect(isGenericAgentName("新智能体")).toBe(true);
    expect(isGenericAgentName("缺陷分诊智能体")).toBe(false);
  });
});
