import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import type { SkillParameter } from "../../../shared/types";
import { applyPersistedLanguage } from "../../i18n";
import {
  buildLocalizedSkillComposerPrompt,
  getLocalizedSkillParameterText,
  getLocalizedSkillRoutingText,
  getLocalizedSkillText,
} from "../localized-skills";
import { isSkillVisibleForCurrentProductSupport } from "../product-availability";

const bundledSkillsDirectory = fileURLToPath(
  new URL("../../../../resources/skills/", import.meta.url),
);
const pluginPacksDirectory = fileURLToPath(
  new URL("../../../../resources/plugin-packs/", import.meta.url),
);

type BundledSkillPromptFixture = {
  id: string;
  name: string;
  description?: string;
  parameters?: SkillParameter[];
  metadata?: {
    routing?: {
      useWhen?: string;
      outputs?: string;
      successCriteria?: string;
      examples?: { positive?: string[] };
    };
  };
};

function loadBundledJsonSkills(): BundledSkillPromptFixture[] {
  return readdirSync(bundledSkillsDirectory)
    .filter((name) => name.endsWith(".json"))
    .map((name) => {
      const skill = JSON.parse(
        readFileSync(`${bundledSkillsDirectory}/${name}`, "utf8"),
      ) as BundledSkillPromptFixture;
      return {
        ...skill,
        id: skill.id || name.replace(/\.json$/, ""),
        name: skill.name || skill.id || name.replace(/\.json$/, ""),
      };
    });
}

function loadPluginPackSkills(): BundledSkillPromptFixture[] {
  return readdirSync(pluginPacksDirectory).flatMap((directoryName) => {
    const manifestPath = `${pluginPacksDirectory}/${directoryName}/neoworker.plugin.json`;
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
        skills?: BundledSkillPromptFixture[];
      };
      return (manifest.skills || []).filter((skill) => skill.id && skill.name);
    } catch {
      return [];
    }
  });
}

afterEach(() => {
  applyPersistedLanguage("zh-CN");
});

describe("localized skill composer prompts", () => {
  it("localizes the code-reviewer draft shown in the composer", () => {
    applyPersistedLanguage("zh-CN");

    const draft = buildLocalizedSkillComposerPrompt(
      {
        id: "code-reviewer",
        name: "code-reviewer",
        description:
          "Perform professional code review for local changes or GitHub pull requests.",
      },
      {
        preferredPrompt: "Use the code-reviewer skill for this request.",
        includeTaskPlaceholder: true,
      },
    );

    expect(draft).toContain("请使用“专业代码审查”技能完成以下任务");
    expect(draft).toContain("任务要求：请补充具体目标、相关材料和期望输出");
    expect(draft).not.toContain("Use the code-reviewer skill");
  });

  it("keeps English routing examples out of every bundled skill draft in Chinese", () => {
    applyPersistedLanguage("zh-CN");
    const skills = loadBundledJsonSkills();

    expect(skills.length).toBeGreaterThan(100);
    for (const skill of skills) {
      const upstreamExample = skill.metadata?.routing?.examples?.positive?.find(
        (example) => example.trim(),
      );
      const draft = buildLocalizedSkillComposerPrompt(skill, {
        preferredPrompt: upstreamExample,
        includeTaskPlaceholder: true,
      });

      expect(draft, skill.id).toMatch(/[\u3400-\u9fff]/);
      expect(draft, skill.id).not.toMatch(
        /^\s*(Use|Help me|Run|Create|Analyze|Review|Generate|Summarize|Compare|Build|Check|Research)\b/i,
      );
      expect(draft, skill.id).not.toContain("for this request");
    }
  });

  it("preserves the upstream example in an English UI", () => {
    applyPersistedLanguage("en");
    const skill = {
      id: "code-reviewer",
      name: "code-reviewer",
      description: "Perform a professional code review.",
    };
    const upstreamExample = "Use the code-reviewer skill for this request.";

    expect(
      buildLocalizedSkillComposerPrompt(skill, {
        preferredPrompt: upstreamExample,
      }),
    ).toBe(upstreamExample);
  });

  it("supports a per-surface language override without changing the app language", () => {
    applyPersistedLanguage("zh-CN");
    const skill = loadBundledJsonSkills().find(
      (candidate) => candidate.id === "analyze-csv",
    );

    expect(skill).toBeDefined();
    expect(getLocalizedSkillText(skill!, "zh-CN").name).toBe("分析 CSV");
    expect(getLocalizedSkillText(skill!, "en").name).toBe("Analyze CSV");
    expect(
      buildLocalizedSkillComposerPrompt(skill!, {
        language: "en",
        preferredPrompt: "Use the analyze-csv skill for this request.",
      }),
    ).toBe("Use the analyze-csv skill for this request.");
  });

  it("preserves the real name and description of an external skill", () => {
    const localized = getLocalizedSkillText(
      {
        id: "epairag",
        name: "epairag",
        description: "Query the EPAI knowledge base.",
        category: "Imported",
        source: "external",
      },
      "zh-CN",
    );

    expect(localized).toMatchObject({
      name: "epairag",
      description: "Query the EPAI knowledge base.",
      category: "自定义",
      source: "外部",
    });
    expect(localized.name).not.toContain("工作流程");
  });

  it("gives every visible plugin skill a specific Chinese action name", () => {
    const skills = loadPluginPackSkills().filter(
      isSkillVisibleForCurrentProductSupport,
    );

    expect(skills.length).toBeGreaterThan(100);
    for (const skill of skills) {
      const localized = getLocalizedSkillText(skill, "zh-CN");
      expect(localized.name, skill.id).toMatch(/[\u3400-\u9fff]/);
      expect(localized.name, skill.id).not.toMatch(/(?:专用)?工作流程$/);
      expect(localized.description, skill.id).toMatch(/[\u3400-\u9fff]/);
    }
  });

  it("localizes every bundled skill routing field in Chinese mode", () => {
    applyPersistedLanguage("zh-CN");
    const skills = loadBundledJsonSkills();

    expect(skills.length).toBeGreaterThan(100);
    for (const skill of skills) {
      const routing = getLocalizedSkillRoutingText(
        skill,
        skill.metadata?.routing,
        "zh-CN",
      );

      expect(routing.useWhen, `${skill.id}: useWhen`).toMatch(
        /[\u3400-\u9fff]/,
      );
      expect(routing.outputs, `${skill.id}: outputs`).toMatch(
        /[\u3400-\u9fff]/,
      );
      expect(routing.successCriteria, `${skill.id}: successCriteria`).toMatch(
        /[\u3400-\u9fff]/,
      );
    }
  });

  it("keeps upstream routing metadata when English is selected", () => {
    const skill = loadBundledJsonSkills().find(
      (candidate) => candidate.id === "analyze-csv",
    );

    expect(skill).toBeDefined();
    expect(
      getLocalizedSkillRoutingText(skill!, skill!.metadata?.routing, "en"),
    ).toEqual({
      useWhen:
        "Use when asked to analyze a CSV file for schema, data quality, statistical summaries, or anomalies.",
      outputs:
        "Concise dataset summary with column stats, missing-value signals, and actionable insights.",
      successCriteria:
        "Reports include row/column counts, datatype observations, numeric statistics, and high-confidence anomalies.",
    });
  });

  it("localizes every bundled parameter label and description in Chinese mode", () => {
    const skills = loadBundledJsonSkills();
    const parameterizedSkills = skills.filter(
      (skill) => skill.parameters?.length,
    );

    expect(parameterizedSkills.length).toBeGreaterThan(50);
    for (const skill of parameterizedSkills) {
      for (const parameter of skill.parameters || []) {
        const localized = getLocalizedSkillParameterText(
          skill,
          parameter,
          "zh-CN",
        );
        expect(localized.name, `${skill.id}: ${parameter.name}`).not.toBe(
          "自定义参数",
        );
        expect(localized.description, `${skill.id}: ${parameter.name}`).toMatch(
          /[\u3400-\u9fff]/,
        );
      }
    }
  });

  it("localizes the humanizer form and every tone option", () => {
    const skill = loadBundledJsonSkills().find(
      (candidate) => candidate.id === "humanizer",
    );
    expect(skill).toBeDefined();

    const text = getLocalizedSkillParameterText(
      skill!,
      skill!.parameters!.find((parameter) => parameter.name === "text")!,
      "zh-CN",
    );
    const tone = getLocalizedSkillParameterText(
      skill!,
      skill!.parameters!.find((parameter) => parameter.name === "tone")!,
      "zh-CN",
    );

    expect(text).toMatchObject({
      name: "文本",
      description: "粘贴需要自然化的原文",
    });
    expect(tone).toMatchObject({
      name: "表达风格",
      description: "选择改写后的表达方式。",
      options: [
        "轻松自然",
        "专业稳重",
        "学术严谨",
        "新闻写作",
        "技术清晰",
        "温暖亲切",
      ],
    });
  });
});
