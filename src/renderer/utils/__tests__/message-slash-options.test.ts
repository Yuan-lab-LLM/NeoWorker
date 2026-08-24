import { describe, expect, it } from "vitest";
import type { CustomSkill } from "../../../shared/types";
import {
  applySlashCommandSelection,
  buildMessageSlashOptions,
  resolveSlashSelectedIndex,
} from "../message-slash-options";

function skill(overrides: Partial<CustomSkill>): CustomSkill {
  return {
    id: "base",
    name: "Base",
    description: "Base skill",
    icon: "B",
    prompt: "Do the thing",
    enabled: true,
    ...overrides,
  } as CustomSkill;
}

describe("buildMessageSlashOptions", () => {
  it("orders app commands before onboarding, plugin aliases, and direct skills", () => {
    const options = buildMessageSlashOptions({
      query: "",
      includeOnboarding: true,
      customSkills: [
        skill({ id: "strategy", name: "Strategy", icon: "S" }),
        skill({ id: "direct-skill", name: "Direct Skill", icon: "D" }),
      ],
      pluginSlashCommands: [
        { name: "plan-doc", description: "Plan a doc", skillId: "strategy" },
      ],
      limit: 20,
    });

    expect(options.slice(0, 3).map((option) => option.commandName)).toEqual([
      "schedule",
      "clear",
      "plan",
    ]);
    expect(
      options.findIndex((option) => option.commandName === "onboard"),
    ).toBeGreaterThan(0);
    expect(
      options.findIndex((option) => option.commandName === "plan-doc"),
    ).toBeGreaterThan(
      options.findIndex((option) => option.commandName === "onboard"),
    );
    expect(options.at(-1)?.commandName).toBe("direct-skill");
  });

  it("reserves visible slots for installed skills in the empty slash menu", () => {
    const options = buildMessageSlashOptions({
      query: "",
      includeOnboarding: false,
      customSkills: [
        skill({ id: "research", name: "Research" }),
        skill({ id: "write-brief", name: "Write Brief" }),
        skill({ id: "analyze-data", name: "Analyze Data" }),
        skill({ id: "review-contract", name: "Review Contract" }),
      ],
      pluginSlashCommands: [],
      limit: 10,
    });

    expect(options).toHaveLength(10);
    expect(options.filter((option) => option.kind === "app")).toHaveLength(6);
    expect(options.filter((option) => option.kind === "skill")).toHaveLength(4);
    expect(options.slice(6).map((option) => option.commandName)).toEqual([
      "research",
      "write-brief",
      "analyze-data",
      "review-contract",
    ]);
  });

  it("diversifies the default skills instead of filling every slot from one family", () => {
    const options = buildMessageSlashOptions({
      query: "",
      includeOnboarding: false,
      customSkills: [
        ...Array.from({ length: 12 }, (_, index) =>
          skill({
            id: `ai-governance-legal-workflow-${index + 1}`,
            name: `AI Governance Workflow ${index + 1}`,
            category: "legal",
            source: "external",
          }),
        ),
        skill({
          id: "research-recent-days",
          name: "Recent Research",
          category: "research",
          source: "bundled",
        }),
        skill({
          id: "writing-executive-brief",
          name: "Executive Brief",
          category: "writing",
          source: "bundled",
        }),
        skill({
          id: "data-table-analysis",
          name: "Table Analysis",
          category: "data",
          source: "managed",
        }),
      ],
      pluginSlashCommands: [],
      limit: 10,
    });

    const visibleSkills = options
      .filter((option) => option.kind === "skill")
      .map((option) => option.commandName);
    expect(visibleSkills).toEqual([
      "research-recent-days",
      "writing-executive-brief",
      "data-table-analysis",
    ]);
  });

  it("puts recently used skills first while retaining category diversity", () => {
    const options = buildMessageSlashOptions({
      query: "",
      includeOnboarding: false,
      customSkills: [
        skill({
          id: "legal-review",
          name: "Legal Review",
          category: "legal",
          source: "external",
        }),
        skill({
          id: "research-web",
          name: "Web Research",
          category: "research",
          source: "bundled",
        }),
        skill({
          id: "writing-brief",
          name: "Write Brief",
          category: "writing",
          source: "bundled",
        }),
        skill({
          id: "data-analysis",
          name: "Data Analysis",
          category: "data",
          source: "managed",
        }),
      ],
      pluginSlashCommands: [],
      preferredSkillIds: ["data-analysis", "writing-brief"],
      limit: 10,
    });

    expect(
      options
        .filter((option) => option.kind === "skill")
        .map((option) => option.commandName),
    ).toEqual([
      "data-analysis",
      "writing-brief",
      "legal-review",
      "research-web",
    ]);
  });

  it("filters across app commands, plugin aliases, skill names, and descriptions", () => {
    const options = buildMessageSlashOptions({
      query: "rename",
      includeOnboarding: false,
      customSkills: [
        skill({
          id: "batch-rename",
          name: "Batch Rename",
          description: "Rename files",
        }),
        skill({
          id: "unrelated",
          name: "Unrelated",
          description: "Other task",
        }),
      ],
      pluginSlashCommands: [
        {
          name: "smart-files",
          description: "Rename and organize files",
          skillId: "batch-rename",
        },
      ],
      limit: 20,
    });

    expect(options.map((option) => option.commandName)).toEqual([
      "smart-files",
    ]);
  });

  it("shows /review from the built-in shortcut catalog", () => {
    const options = buildMessageSlashOptions({
      query: "review",
      includeOnboarding: false,
      customSkills: [],
      pluginSlashCommands: [],
      limit: 20,
    });

    expect(options.map((option) => option.commandName)).toEqual(
      expect.arrayContaining(["review"]),
    );
    expect(
      options.find((option) => option.commandName === "review"),
    ).toMatchObject({
      kind: "app",
      description: expect.any(String),
    });
  });

  it("shows visual-presentation for an exact slash query", () => {
    const options = buildMessageSlashOptions({
      query: "visual-presentation",
      includeOnboarding: false,
      customSkills: [
        skill({
          id: "visual-presentation",
          name: "Visual Presentation",
          description:
            "Create image-led, visually distinctive PowerPoint decks",
          invocation: { userInvocable: true },
        }),
      ],
      pluginSlashCommands: [],
      limit: 20,
    });

    expect(options).toHaveLength(1);
    expect(options[0]).toMatchObject({
      kind: "skill",
      commandName: "visual-presentation",
      skill: expect.objectContaining({ id: "visual-presentation" }),
    });
  });

  it("shows the manually invocable PPT Master advanced workflow", () => {
    const options = buildMessageSlashOptions({
      query: "ppt-master",
      includeOnboarding: false,
      customSkills: [
        skill({
          id: "ppt-master",
          name: "PPT Master（高级）",
          description: "Explicit advanced PowerPoint workflow",
          invocation: {
            userInvocable: true,
            disableModelInvocation: true,
          },
        }),
      ],
      pluginSlashCommands: [],
      limit: 20,
    });

    expect(options).toHaveLength(1);
    expect(options[0]).toMatchObject({
      kind: "skill",
      commandName: "ppt-master",
      name: "PPT Master（高级）",
      skill: expect.objectContaining({ id: "ppt-master" }),
    });
  });

  it("ranks an exact skill command ahead of broad description matches", () => {
    const options = buildMessageSlashOptions({
      query: "ppt-master",
      includeOnboarding: false,
      customSkills: [
        skill({
          id: "content-creation",
          name: "Content Creation",
          description: "Can hand off to ppt-master for advanced decks",
        }),
        skill({
          id: "ppt-master",
          name: "PPT Master（高级）",
          description: "Explicit advanced PowerPoint workflow",
        }),
      ],
      pluginSlashCommands: [],
      limit: 20,
    });

    expect(options.map((option) => option.commandName)).toEqual([
      "ppt-master",
      "content-creation",
    ]);
  });

  it("omits skills that are disabled or not user-invocable", () => {
    const options = buildMessageSlashOptions({
      query: "hidden",
      includeOnboarding: false,
      customSkills: [
        skill({ id: "hidden-disabled", enabled: false }),
        skill({
          id: "hidden-model-only",
          invocation: { userInvocable: false },
        }),
      ],
      pluginSlashCommands: [],
      limit: 20,
    });

    expect(options).toEqual([]);
  });

  it("shows flat plugin aliases for bundled plugin skills", () => {
    const options = buildMessageSlashOptions({
      query: "security-scan",
      includeOnboarding: false,
      customSkills: [
        skill({
          id: "codex-security:security-scan",
          name: "Security Scan",
          description: "Run repository security scan",
        }),
      ],
      pluginSlashCommands: [
        {
          name: "security-scan",
          description: "Run repository security scan",
          skillId: "codex-security:security-scan",
        },
      ],
      limit: 20,
    });

    expect(options.map((option) => option.commandName)).toEqual([
      "security-scan",
    ]);
    expect(options[0]).toMatchObject({
      kind: "skill",
      commandName: "security-scan",
      name: "Codex 安全 · 安全扫描",
      description:
        "在Codex 安全场景中完成“安全扫描”，并生成可检查、可继续处理的结果。",
      skill: expect.objectContaining({ id: "codex-security:security-scan" }),
    });

    const codexQueryOptions = buildMessageSlashOptions({
      query: "codex-",
      includeOnboarding: false,
      customSkills: [
        skill({
          id: "codex-security:security-scan",
          name: "Security Scan",
          description: "Run repository security scan",
        }),
      ],
      pluginSlashCommands: [
        {
          name: "security-scan",
          description: "Run repository security scan",
          skillId: "codex-security:security-scan",
        },
      ],
      limit: 20,
    });

    expect(
      codexQueryOptions.some(
        (option) => option.commandName === "codex-security:security-scan",
      ),
    ).toBe(false);
  });

  it("hides a direct skill when a plugin alias owns the same visible token", () => {
    const options = buildMessageSlashOptions({
      query: "alias review",
      includeOnboarding: false,
      customSkills: [
        skill({ id: "review", name: "Review", description: "Direct review" }),
        skill({
          id: "strategy",
          name: "Strategy",
          description: "Alias target",
        }),
      ],
      pluginSlashCommands: [
        { name: "review", description: "Alias review", skillId: "strategy" },
      ],
      limit: 20,
    });

    expect(options.map((option) => option.id)).toEqual(["alias-review"]);
    expect(options[0]).toMatchObject({
      kind: "skill",
      commandName: "review",
      name: "已安装 · 战略规划",
      description:
        "在已安装场景中完成“战略规划”，并生成可检查、可继续处理的结果。",
    });
  });

  it("hides overseas legal aliases from the mainland default slash menu", () => {
    const options = buildMessageSlashOptions({
      query: "ai-governance",
      includeOnboarding: false,
      customSkills: [
        skill({
          id: "ai-governance-legal-ai-inventory",
          name: "ai-governance-legal-ai-inventory",
          description: "EU AI Act per-system inventory",
        }),
      ],
      pluginSlashCommands: [
        {
          name: "ai-governance-legal-ai-inventory",
          description: "EU AI Act per-system inventory",
          skillId: "ai-governance-legal-ai-inventory",
        },
      ],
      limit: 20,
    });

    expect(options).toEqual([]);
  });

  it("marks required and optional skill parameter behavior separately", () => {
    const [required, optional, none] = buildMessageSlashOptions({
      query: "",
      includeOnboarding: false,
      customSkills: [
        skill({
          id: "required-skill",
          parameters: [
            {
              name: "topic",
              type: "string",
              description: "Topic",
              required: true,
            },
          ],
        }),
        skill({
          id: "optional-skill",
          parameters: [
            {
              name: "input",
              type: "string",
              description: "Input",
              required: false,
            },
          ],
        }),
        skill({ id: "plain-skill", parameters: [] }),
      ],
      pluginSlashCommands: [],
      limit: 20,
    }).filter((option) => option.kind === "skill");

    expect(required).toMatchObject({
      commandName: "required-skill",
      hasRequiredParams: true,
    });
    expect(optional).toMatchObject({
      commandName: "optional-skill",
      hasRequiredParams: false,
      hasOptionalParams: true,
    });
    expect(none).toMatchObject({
      commandName: "plain-skill",
      hasRequiredParams: false,
      hasOptionalParams: false,
    });
  });

  it("omits invalid alias tokens from the picker", () => {
    const options = buildMessageSlashOptions({
      query: "",
      includeOnboarding: false,
      customSkills: [skill({ id: "target", name: "Target" })],
      pluginSlashCommands: [
        { name: "bad token", description: "Invalid", skillId: "target" },
        { name: "good-token", description: "Valid", skillId: "target" },
      ],
      limit: 20,
    });

    expect(options.some((option) => option.commandName === "bad token")).toBe(
      false,
    );
    expect(options.some((option) => option.commandName === "good-token")).toBe(
      true,
    );
  });

  it("clamps keyboard selection to the available slash options", () => {
    expect(resolveSlashSelectedIndex(0, 4)).toBe(0);
    expect(resolveSlashSelectedIndex(3, -1)).toBe(0);
    expect(resolveSlashSelectedIndex(3, 1)).toBe(1);
    expect(resolveSlashSelectedIndex(3, 9)).toBe(2);
  });
});

describe("applySlashCommandSelection", () => {
  it("replaces the active slash query and leaves the cursor after the inserted command", () => {
    const result = applySlashCommandSelection({
      value: "/lega",
      target: { start: 0, end: 5 },
      commandName: "litigation-legal-demand-intake",
    });

    expect(result).toEqual({
      nextValue: "/litigation-legal-demand-intake ",
      cursorPosition: "/litigation-legal-demand-intake ".length,
    });
  });

  it("preserves surrounding text when selecting a slash command", () => {
    const result = applySlashCommandSelection({
      value: "first line\n/lega unpaid invoices",
      target: { start: "first line\n".length, end: "first line\n/lega".length },
      commandName: "litigation-legal-demand-intake",
    });

    expect(result.nextValue).toBe(
      "first line\n/litigation-legal-demand-intake unpaid invoices",
    );
    expect(result.cursorPosition).toBe(
      "first line\n/litigation-legal-demand-intake ".length,
    );
  });
});
