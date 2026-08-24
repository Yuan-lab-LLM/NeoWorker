import { describe, expect, it } from "vitest";
import { getLocalizedAgentRoleText } from "../localized-agent-roles";

describe("localized agent roles", () => {
  it.each([
    ["Pitch Agent", "推介材料助手"],
    ["Market Researcher", "市场研究助手"],
    ["Pr Agent", "公关文案助手"],
    ["Meeting Prep Agent", "会议准备助手"],
    ["KYC Screener", "客户尽调审查助手"],
  ])("localizes the built-in role %s", (name, expected) => {
    expect(
      getLocalizedAgentRoleText(
        { name, displayName: name, description: `${name} description` },
        "zh-CN",
      ).name,
    ).toBe(expected);
  });

  it("localizes mirrored managed roles by their stable role id", () => {
    expect(
      getLocalizedAgentRoleText(
        {
          name: "managed-market-researcher",
          displayName: "Market Researcher",
          description: "English description",
        },
        "zh-CN",
      ),
    ).toEqual({
      name: "市场研究助手",
      description: "调研行业、公司、催化因素和市场信号，并保留来源记录。",
    });
  });

  it("keeps original English text outside the Chinese locale", () => {
    expect(
      getLocalizedAgentRoleText(
        {
          name: "Pitch Agent",
          displayName: "Pitch Agent",
          description: "Create pitch materials.",
        },
        "en",
      ),
    ).toEqual({
      name: "Pitch Agent",
      description: "Create pitch materials.",
    });
  });

  it.each([
    [
      "缺陷分诊智能体",
      "创建一个缺陷分诊智能体，审查新进缺陷、判断优先级。",
      "Bug Triage Agent",
      "Reviews incoming defects, determines priority, and produces evidence-based triage summaries.",
    ],
    [
      "团队问答智能体",
      "使用工作区里已批准的文档和文件回答常见问题。",
      "Team Q&A Agent",
      "Answers common team questions using approved documents and files in the workspace.",
    ],
    [
      "晨间规划智能体",
      "每天整理日历、待办任务和收件箱上下文。",
      "Morning Planning Agent",
      "Organizes calendars, tasks, and inbox context into a clear daily action plan.",
    ],
    [
      "高水平设计师",
      "一个什么水平比较高的设计师",
      "Senior Designer",
      "A highly capable designer for polished product and visual work.",
    ],
    [
      "叫醒闹钟智能体",
      "创建一个叫醒闹钟",
      "Wake-up Alarm Agent",
      "Creates and manages wake-up alarms.",
    ],
  ])(
    "localizes persisted Chinese managed role %s in English mode",
    (displayName, description, expectedName, expectedDescription) => {
      expect(
        getLocalizedAgentRoleText(
          {
            name: `managed-${displayName}`,
            displayName,
            description,
          },
          "en",
        ),
      ).toEqual({
        name: expectedName,
        description: expectedDescription,
      });
    },
  );

  it("localizes a persisted Chinese software twin by stable role id", () => {
    expect(
      getLocalizedAgentRoleText(
        {
          name: "twin-software-engineer",
          displayName: "软件工程师 画像",
          description: "中文描述",
          sourceTemplateId: "software-engineer",
        },
        "en",
      ),
    ).toEqual({
      name: "Software Engineer Twin",
      description:
        "Digital twin for software engineers. Handles code reviews, PR triage, testing, and technical documentation.",
    });
  });

  it("replaces a Chinese PR description in English mode", () => {
    expect(
      getLocalizedAgentRoleText(
        {
          name: "managed-pr-agent",
          displayName: "Pr Agent",
          description: "创建一个能写PR稿的智能体",
        },
        "en",
      ),
    ).toEqual({
      name: "PR Agent",
      description: "Writes, polishes, and reviews public relations copy.",
    });
  });
});
