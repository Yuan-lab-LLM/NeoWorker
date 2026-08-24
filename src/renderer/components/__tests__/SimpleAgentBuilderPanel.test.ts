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
    expect(source).toContain('"Agent team"');
    expect(source).toContain(
      '"Create a new agent or select an appropriate leader from an existing agent."',
    );
    expect(source).toContain('"Browse agents"');
    expect(source).toContain('"What should your agent do?"');
    expect(source).toMatch(/className="simple-agent-create-icon">\s*<Bot size=\{22\}/);
    expect(source).toContain('"describe what it should do"');
    expect(source).toContain(
      '"Optional, leave it blank and it will be automatically generated based on the task"',
    );
    expect(source).toContain('"Team Chat Q&A"');
    expect(source).toContain('"Morning Planning Assistant"');
    expect(source).toContain('"Defect Triage Assistant"');
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

    expect(applySimpleBuilderName(plan, "PR 稿写作助手", "创建一个能写PR稿的")).toMatchObject({
      name: "PR 稿写作助手",
      instructions: "You are PR 稿写作助手.",
      routines: [{ name: "PR 稿写作助手 manual run" }],
    });
    expect(applySimpleBuilderName(plan, "", "创建一个能写PR稿的").name).toBe("写PR稿智能体");
  });

  it("uses the real managed-agent creation flow and restores the existing directory", () => {
    expect(source).toContain("generateManagedAgentPlan");
    expect(source).toContain("createManagedAgentFromPlan");
    expect(source).toContain("activate: true");
    expect(source).toContain("getAgentRoles(true)");
    expect(source).toContain('"Existing agents"');
    expect(source).toContain('"Search agent"');
    expect(source).toContain('"Products and Technology"');
    expect(source).toContain('"research and analysis"');
    expect(source).toContain('"Content and growth"');
    expect(source).toContain('"Planning and collaboration"');
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
    expect(source).toContain('"Schedule tasks"');
    expect(source).toContain('"Not available yet"');
    expect(source).not.toContain("simple-agent-detail");
    expect(source).not.toContain("可以直接使用");
    expect(source).not.toContain("setSelectedRole");
  });

  it("fills preset examples without starting generation", () => {
    expect(source).toContain("const fillSuggestion = (suggestionPrompt: string)");
    expect(source).toContain("prompt: suggestionPrompt");
    expect(source).toContain("onClick={() => fillSuggestion(suggestion.prompt)}");
    expect(source).not.toContain("handleCreate(suggestion.prompt)");
  });

  it("shows visible, accessible progress while generating an agent", () => {
    expect(source).toContain('aria-live="polite"');
    expect(source).toContain('aria-busy="true"');
    expect(source).toContain('"Understand the goal"');
    expect(source).toContain('"Matching ability"');
    expect(source).toContain('"Complete configuration"');
    expect(source).toContain("simple-agent-progress-track");
    expect(styles).toContain("@keyframes simple-agent-progress-flow");
    expect(styles).toContain("@keyframes simple-agent-status-sheen");
    expect(styles).toContain("@media (prefers-reduced-motion: reduce)");
  });

  it("combines system experts with portraits and user-created agents with backgrounds", () => {
    expect(source).toContain("getAgentRoleVisual(role)");
    expect(source).toContain("simple-agent-card-visual is-${roleVisual.kind}");
    expect(source).toContain('loading={roleIndex < 4 ? "eager" : "lazy"}');
    expect(styles).toContain("--simple-agent-role-accent");
    expect(styles).toContain("mix-blend-mode: multiply");
    expect(styles).toContain(".simple-agent-card-visual.is-background > img");
  });

  it("keeps the creation session outside the page component while navigating", () => {
    expect(source).toContain("useSimpleAgentBuilderSession()");
    expect(source).toContain("updateSimpleAgentBuilderSession");
    expect(source).toContain("resetSimpleAgentBuilderSession");
    expect(source).not.toContain('const [stage, setStage] = useState<BuilderStage>("idle")');
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
          description: "Scan open pull requests and build a prioritized review queue.",
          status: "available" as const,
          selectedSkills: ["twin-pr-triage"],
        },
      ],
    };

    expect(getLocalizedSimpleBuilderRequirement(requirement, "zh-CN")).toEqual({
      title: "选择一项技能",
      reason: "发现多个符合需求的技能，请选择最适合这个智能体的一项。",
    });
    expect(getLocalizedSimpleBuilderOption(requirement, requirement.options[0], "zh-CN")).toEqual({
      name: "多智能体 PR 审查",
      description: "对 PR 进行共识式多智能体审查，并按严重程度输出发现。",
    });
    expect(getLocalizedSimpleBuilderOption(requirement, requirement.options[1], "zh-CN")).toEqual({
      name: "数字分身 PR 分诊",
      description: "扫描开放 PR，评估风险和复杂度，并生成优先审查队列。",
    });
  });

  it("classifies and searches the restored agent roles", () => {
    const makeRole = (id: string, displayName: string, capabilities: AgentRole["capabilities"]) =>
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
    const researcher = makeRole("researcher", "Researcher", ["research", "analyze"]);
    const coder = makeRole("coder", "Coder", ["code", "document"]);

    expect(getSimpleAgentDirectoryFilter(researcher)).toBe("insight");
    expect(getSimpleAgentDirectoryFilter(coder)).toBe("build");
    expect(filterSimpleAgentDirectory([researcher, coder], "research", "all")).toEqual([
      researcher,
    ]);
    expect(filterSimpleAgentDirectory([researcher, coder], "", "build")).toEqual([coder]);
  });
});
