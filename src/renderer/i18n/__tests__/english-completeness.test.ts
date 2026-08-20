import { afterAll, describe, expect, it } from "vitest";
import { applyPersistedLanguage, translate } from "../index";

describe("English translation completeness", () => {
  afterAll(() => applyPersistedLanguage("zh-CN"));

  it("renders representative new product surfaces without Chinese copy", () => {
    applyPersistedLanguage("en");
    const keys = [
      "generated.components.addtasktoprojectdialog.152.3",
      "generated.components.automationhubpanel.221.92",
      "generated.components.weixinsettings.316.16",
      "generated.components.projectworkspaceview.652.28",
      "agents.management.title",
      "traces.viewResult",
    ];

    for (const key of keys) {
      const value = translate(key);
      expect(value).not.toBe(key);
      expect(value).not.toMatch(/[一-龥]/);
    }
  });

  it("keeps generated product surfaces bilingual", () => {
    const cases = [
      [
        "generated.components.addtasktoprojectdialog.152.3",
        "Join the project",
        "加入项目",
      ],
      [
        "generated.components.automationhubpanel.221.92",
        "Automate tasks",
        "自动化任务",
      ],
      [
        "generated.components.weixinsettings.316.16",
        "Personal WeChat",
        "个人微信",
      ],
      ["generated.components.projectworkspaceview.652.28", "Overview", "概览"],
    ] as const;

    for (const [key, english, chinese] of cases) {
      applyPersistedLanguage("en");
      expect(translate(key)).toBe(english);
      applyPersistedLanguage("zh-CN");
      expect(translate(key)).toBe(chinese);
    }
  });

  it("interpolates dynamic copy in both languages", () => {
    applyPersistedLanguage("en");
    expect(translate("activity.time.minutesAgo", undefined, { count: 3 })).toBe(
      "3 minutes ago",
    );
    expect(translate("projects.availableCount", undefined, { count: 2 })).toBe(
      "2 available projects",
    );

    applyPersistedLanguage("zh-CN");
    expect(translate("activity.time.minutesAgo", undefined, { count: 3 })).toBe(
      "3 分钟前",
    );
    expect(translate("projects.availableCount", undefined, { count: 2 })).toBe(
      "2 个可用项目",
    );
  });

  it("uses consistent sentence case for English sidebar destinations", () => {
    applyPersistedLanguage("en");

    expect(translate("sidebar.newWork")).toBe("New job");
    expect(translate("sidebar.everydayAgent")).toBe("Daily assistant");
    expect(translate("sidebar.projects")).toBe("Project");
    expect(translate("sidebar.agentTeam")).toBe("Agent team");
    expect(translate("sidebar.ideas")).toBe("Inspiration");
    expect(translate("sidebar.automations")).toBe("Automation");
  });
});
