import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { AgentBuilderPlan, AgentRole } from "../../../shared/types";
import {
  applySimpleBuilderName,
  filterSimpleAgentDirectory,
  getSimpleAgentDirectoryFilter,
  getLocalizedSimpleBuilderOption,
  getLocalizedSimpleBuilderRequirement,
} from "../SimpleAgentBuilderPanel";

const source = readFileSync(
  fileURLToPath(new URL("../SimpleAgentBuilderPanel.tsx", import.meta.url)),
  "utf8",
);
const styles = readFileSync(
  fileURLToPath(new URL("../simple-agent-builder.css", import.meta.url)),
  "utf8",
);

describe("SimpleAgentBuilderPanel", () => {
  it("keeps one focused creation flow with compact overview information", () => {
    expect(source).toContain("智能体团队");
    expect(source).toContain(
      "创建新智能体，或从现有智能体中选择合适的负责人。",
    );
    expect(source).toContain("浏览智能体");
    expect(source).toContain("你的智能体应该做什么？");
    expect(source).toMatch(
      /className="simple-agent-create-icon">\s*<Bot size=\{22\}/,
    );
    expect(source).toContain("描述它应该做什么");
    expect(source).toContain("可选，留空将根据任务自动生成");
    expect(source).toContain("团队聊天问答");
    expect(source).toContain("晨间规划助手");
    expect(source).toContain("缺陷分诊助手");
    expect(source).not.toContain("构建可持续工作的智能体团队");
    expect(source).not.toContain("智能体概览");
    expect(source).not.toContain("频道目标");
    expect(styles).toContain("padding-top: clamp(12px, 1.4vw, 18px)");
    expect(styles).toContain("scroll-margin-top: 72px");
  });

  it("supports an explicit name and replaces the generic fallback before creation", () => {
    const plan = {
      name: "Personal Agent",
      instructions: "You are Personal Agent.",
      starterPrompts: [
        {
          id: "run",
          title: "Run Personal Agent",
          prompt: "Ask Personal Agent",
          description: "Use Personal Agent",
          icon: "play",
        },
      ],
      routines: [
        {
          name: "Personal Agent manual run",
          description: "Run",
          enabled: true,
          trigger: { type: "manual", enabled: true },
        },
      ],
    } as AgentBuilderPlan;

    expect(
      applySimpleBuilderName(plan, "PR 稿写作助手", "创建一个能写PR稿的"),
    ).toMatchObject({
      name: "PR 稿写作助手",
      instructions: "You are PR 稿写作助手.",
      routines: [{ name: "PR 稿写作助手 manual run" }],
    });
    expect(applySimpleBuilderName(plan, "", "创建一个能写PR稿的").name).toBe(
      "写PR稿智能体",
    );
  });

  it("uses the real managed-agent creation flow and restores the existing directory", () => {
    expect(source).toContain("generateManagedAgentPlan");
    expect(source).toContain("createManagedAgentFromPlan");
    expect(source).toContain("activate: true");
    expect(source).toContain("getAgentRoles(true)");
    expect(source).toContain("现有智能体");
    expect(source).toContain("搜索智能体");
    expect(source).toContain("产品与技术");
    expect(source).toContain("研究与分析");
    expect(source).toContain("内容与增长");
    expect(source).toContain("规划与协作");
    expect(source).toContain("getLocalizedAgentRoleText");
    expect(source).toContain("getLocalizedAgentCapability");
    expect(source).not.toContain("推荐模板");
    expect(source).not.toContain("智能体目录");
    expect(source).not.toContain("托管运行");
    expect(source).not.toContain("Slack 频道目标");
    expect(source).not.toContain("选择任务负责人");
    expect(source).not.toContain("交给专家");
  });

  it("selects an expert for a later task instead of opening a prompt-only detail or auto-running", () => {
    expect(source).toContain("onSelectRole: (role: AgentRole) => void");
    expect(source).toContain("onClick={() => onSelectRole(role)}");
    expect(source).toContain('role.isActive ? "安排任务" : "暂不可用"');
    expect(source).not.toContain("simple-agent-detail");
    expect(source).not.toContain("可以直接使用");
    expect(source).not.toContain("setSelectedRole");
  });

  it("fills preset examples without starting generation", () => {
    expect(source).toContain(
      "const fillSuggestion = (suggestionPrompt: string)",
    );
    expect(source).toContain("setPrompt(suggestionPrompt)");
    expect(source).toContain(
      "onClick={() => fillSuggestion(suggestion.prompt)}",
    );
    expect(source).not.toContain("handleCreate(suggestion.prompt)");
  });

  it("shows visible, accessible progress while generating an agent", () => {
    expect(source).toContain('aria-live="polite"');
    expect(source).toContain('aria-busy="true"');
    expect(source).toContain("理解目标");
    expect(source).toContain("匹配能力");
    expect(source).toContain("完成配置");
    expect(source).toContain("simple-agent-progress-track");
    expect(styles).toContain("@keyframes simple-agent-progress-flow");
    expect(styles).toContain("@keyframes simple-agent-status-sheen");
    expect(styles).toContain("@media (prefers-reduced-motion: reduce)");
  });

  it("localizes skill choices before asking a Chinese user to select one", () => {
    const requirement = {
      id: "skill-choice",
      kind: "skill" as const,
      title: "Choose a skill",
      reason: "More than one enabled skill appears relevant to this agent.",
      required: true,
      options: [
        {
          id: "multi-pr-review",
          label: "multi-pr-review",
          description: "Run a consensus-style multi-agent review of a PR.",
          status: "available" as const,
          selectedSkills: ["multi-pr-review"],
        },
        {
          id: "twin-pr-triage",
          label: "PR Triage & Review Queue",
          description:
            "Scan open pull requests and build a prioritized review queue.",
          status: "available" as const,
          selectedSkills: ["twin-pr-triage"],
        },
      ],
    };

    expect(getLocalizedSimpleBuilderRequirement(requirement, "zh-CN")).toEqual({
      title: "选择一项技能",
      reason: "发现多个符合需求的技能，请选择最适合这个智能体的一项。",
    });
    expect(
      getLocalizedSimpleBuilderOption(
        requirement,
        requirement.options[0],
        "zh-CN",
      ),
    ).toEqual({
      name: "多智能体 PR 审查",
      description: "对 PR 进行共识式多智能体审查，并按严重程度输出发现。",
    });
    expect(
      getLocalizedSimpleBuilderOption(
        requirement,
        requirement.options[1],
        "zh-CN",
      ),
    ).toEqual({
      name: "数字分身 PR 分诊",
      description: "扫描开放 PR，评估风险和复杂度，并生成优先审查队列。",
    });
  });

  it("classifies and searches the restored agent roles", () => {
    const makeRole = (
      id: string,
      displayName: string,
      capabilities: AgentRole["capabilities"],
    ) =>
      ({
        id,
        name: id,
        displayName,
        description: `${displayName} description`,
        capabilities,
        icon: "",
        color: "#176fe8",
        isSystem: true,
        isActive: true,
        sortOrder: 1,
        createdAt: 1,
        updatedAt: 1,
      }) as AgentRole;
    const researcher = makeRole("researcher", "Researcher", [
      "research",
      "analyze",
    ]);
    const coder = makeRole("coder", "Coder", ["code", "document"]);

    expect(getSimpleAgentDirectoryFilter(researcher)).toBe("insight");
    expect(getSimpleAgentDirectoryFilter(coder)).toBe("build");
    expect(
      filterSimpleAgentDirectory([researcher, coder], "research", "all"),
    ).toEqual([researcher]);
    expect(
      filterSimpleAgentDirectory([researcher, coder], "", "build"),
    ).toEqual([coder]);
  });
});
