import { describe, expect, it } from "vitest";

import { getLocalizedSubagentDisplay } from "../localized-agent-roles";

describe("localized subagent display", () => {
  it("turns generated English callsigns into clear Chinese expert roles", () => {
    expect(getLocalizedSubagentDisplay("Anansi (builder)", "zh-CN")).toEqual({
      name: "方案构建专家",
      profileName: "",
      codename: "Anansi",
      description: "负责实现方案、搭建产出并完成交付。",
    });
    expect(
      getLocalizedSubagentDisplay("Apollo (inspector)", "zh-CN").name,
    ).toBe("质量审查专家");
    expect(getLocalizedSubagentDisplay("Ares (explorer)", "zh-CN").name).toBe(
      "资料调研专家",
    );
  });

  it("prefers the concrete localized agent role when it is available", () => {
    expect(
      getLocalizedSubagentDisplay("Anansi (builder)", "zh-CN", {
        name: "coder",
        displayName: "Coder",
      }),
    ).toEqual({
      name: "方案构建专家",
      profileName: "编码工程师",
      codename: "Anansi",
      description: "负责实现方案、搭建产出并完成交付。",
    });
  });

  it("keeps the original generated title in English", () => {
    expect(getLocalizedSubagentDisplay("Anansi (builder)", "en")).toEqual({
      name: "Anansi (builder)",
      profileName: "",
      codename: "",
      description: "",
    });
  });
});
