import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import {
  SkillParameterModal,
  collectSkillParameterAttachments,
  collectSkillParameterSubmissionValues,
  collectSkillParameterValues,
  expandSkillPrompt,
  getSkillAttachmentFileName,
  getSkillPathParameterKind,
  isFileSkillParameter,
  replaceSkillAttachmentPathsForComposer,
} from "../SkillParameterModal";
import { buildSlashSkillPrompt } from "../skill-parameter-utils";
import type { CustomSkill } from "../../../shared/types";

const testSkill: CustomSkill = {
  id: "novelist",
  name: "Novelist",
  description: "Draft a novel from a seed concept.",
  icon: "📚",
  prompt: "Write a {{genre}} novel about {{seed}}.",
  parameters: [
    {
      name: "seed",
      type: "string",
      description: "Story seed concept",
      required: true,
    },
    {
      name: "genre",
      type: "select",
      description: "Primary genre",
      required: false,
      default: "literary",
      options: ["literary", "thriller"],
    },
  ],
  enabled: true,
};

const appStyles = readFileSync(
  fileURLToPath(new URL("../../styles/index.css", import.meta.url)),
  "utf8",
);

const compareFilesSkill: CustomSkill = {
  id: "compare-files",
  name: "Compare Files",
  description: "Compare two files and show differences.",
  icon: "⚖️",
  prompt: "Compare {{file1}} with {{file2}}.",
  parameters: [
    {
      name: "file1",
      type: "string",
      input: "file",
      description: "Path to the first file",
      required: true,
    },
    {
      name: "file2",
      type: "string",
      input: "file",
      description: "Path to the second file",
      required: true,
    },
  ],
  enabled: true,
};

const pptMasterSkill: CustomSkill = {
  id: "ppt-master",
  name: "PPT Master（高级）",
  description: "Advanced PowerPoint workflow.",
  icon: "🎛️",
  prompt: "Use route {{route}} with profile {{profile}}.",
  parameters: [
    {
      name: "route",
      type: "select",
      description: "Advanced PPT Master route",
      default: "auto",
      options: ["auto", "generate", "beautify"],
    },
    {
      name: "profile",
      type: "select",
      description: "Execution depth",
      default: "default",
      options: ["default", "quick"],
    },
    {
      name: "source_path",
      type: "string",
      input: "file",
      description: "Optional source PPTX",
    },
  ],
  enabled: true,
};

const humanizerSkill: CustomSkill = {
  id: "humanizer",
  name: "Humanizer",
  description: "Rewrite AI-generated text to sound natural.",
  icon: "✍️",
  prompt: "Rewrite {{text}} with a {{tone}} tone.",
  parameters: [
    {
      name: "text",
      type: "string",
      description: "The text to humanize",
      required: false,
    },
    {
      name: "tone",
      type: "select",
      description: "Target tone for the rewrite",
      required: false,
      default: "professional",
      options: [
        "casual",
        "professional",
        "academic",
        "journalistic",
        "technical",
        "warm",
      ],
    },
  ],
  enabled: true,
};

describe("skill parameter renderer utilities", () => {
  it("keeps the shared skill dialog below the app title bar", () => {
    expect(appStyles).toMatch(
      /\.skill-param-modal-overlay\s*\{[^}]*inset:\s*var\(--title-bar-height\) 0 0;/s,
    );
    expect(appStyles).toContain(
      "max-height: calc(100dvh - var(--title-bar-height) - 40px);",
    );
  });

  it("shows Ask In Chat when the slash flow enables it", () => {
    const markup = renderToStaticMarkup(
      createElement(SkillParameterModal, {
        skill: testSkill,
        onSubmit: vi.fn(),
        onAskInChat: vi.fn(),
        onCancel: vi.fn(),
      }),
    );

    expect(markup).toMatch(/Ask In Chat|在聊天中询问/);
  });

  it("omits Ask In Chat when only the prompt-expansion flow is available", () => {
    const markup = renderToStaticMarkup(
      createElement(SkillParameterModal, {
        skill: testSkill,
        onSubmit: vi.fn(),
        onCancel: vi.fn(),
      }),
    );

    expect(markup).not.toContain("Ask In Chat");
  });

  it("renders a native file picker action for file parameters", () => {
    const markup = renderToStaticMarkup(
      createElement(SkillParameterModal, {
        skill: compareFilesSkill,
        onSubmit: vi.fn(),
        onCancel: vi.fn(),
      }),
    );

    expect(markup.match(/skill-param-file-button/g)).toHaveLength(2);
    expect(markup).toMatch(/Choose file|选择文件/);
    expect(appStyles).toContain(".skill-param-selected-file");
  });

  it("turns picker selections into attachments without exposing local paths in the draft", () => {
    const values = {
      file1: "/Users/example/Desktop/旧版本.pptx",
      file2: "C:\\Users\\example\\Desktop\\新版本.pptx",
    };
    const attachments = collectSkillParameterAttachments(
      compareFilesSkill,
      values,
      {
        file1: {
          parameterName: "file1",
          path: values.file1,
          name: "旧版本.pptx",
          size: 1024,
          mimeType:
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        },
        file2: {
          parameterName: "file2",
          path: values.file2,
          name: "新版本.pptx",
          size: 2048,
          mimeType:
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        },
      },
    );
    const composerValues = replaceSkillAttachmentPathsForComposer(
      values,
      attachments,
    );
    const draft = expandSkillPrompt(compareFilesSkill, composerValues);

    expect(attachments).toHaveLength(2);
    expect(composerValues).toEqual({
      file1: "旧版本.pptx",
      file2: "新版本.pptx",
    });
    expect(draft).toContain("旧版本.pptx");
    expect(draft).toContain("新版本.pptx");
    expect(draft).not.toContain("/Users/example");
    expect(draft).not.toContain("C:\\Users\\example");
  });

  it("supports both macOS and Windows file names for attachment cards", () => {
    expect(getSkillAttachmentFileName("/Users/example/Desktop/report.docx")).toBe(
      "report.docx",
    );
    expect(
      getSkillAttachmentFileName("C:\\Users\\example\\Desktop\\report.docx"),
    ).toBe("report.docx");
  });

  it("keeps older compare-files definitions compatible with the file picker", () => {
    const legacyParameter = {
      ...compareFilesSkill.parameters![0],
      input: undefined,
    };

    expect(isFileSkillParameter(compareFilesSkill, legacyParameter)).toBe(true);
  });

  it("infers native pickers for bundled and third-party path parameters", () => {
    expect(
      getSkillPathParameterKind(testSkill, {
        name: "path",
        type: "string",
        description: "Path to the CSV file",
      }),
    ).toBe("file");
    expect(
      getSkillPathParameterKind(testSkill, {
        name: "output_dir",
        type: "string",
        description: "Workspace-relative or absolute output directory",
      }),
    ).toBe("folder");
    expect(
      getSkillPathParameterKind(testSkill, {
        name: "path",
        type: "string",
        description: "Path to file or folder to audit",
      }),
    ).toBe("file-or-folder");
    expect(
      getSkillPathParameterKind(testSkill, {
        name: "output_report_path",
        type: "string",
        description: "Where to write the report",
      }),
    ).toBe("output-file");
  });

  it("audits bundled skill path parameters with attachment-safe semantics", () => {
    const skillsDirectory = fileURLToPath(
      new URL("../../../../resources/skills/", import.meta.url),
    );
    const kinds: Record<string, string | null> = {};

    for (const fileName of readdirSync(skillsDirectory)) {
      if (!fileName.endsWith(".json")) continue;
      const skill = JSON.parse(
        readFileSync(`${skillsDirectory}/${fileName}`, "utf8"),
      ) as CustomSkill;
      for (const parameter of skill.parameters || []) {
        const kind = getSkillPathParameterKind(skill, parameter);
        if (kind) kinds[`${skill.id}:${parameter.name}`] = kind;
      }
    }

    expect(kinds).toMatchObject({
      "add-documentation:path": "file",
      "analyze-csv:path": "file",
      "clean-imports:path": "file-or-folder",
      "code-review:path": "file-or-folder",
      "compare-files:file1": "file",
      "compare-files:file2": "file",
      "convert-code:path": "file",
      "explain-code:path": "file",
      "proofread:path": "file",
      "refactor-code:path": "file",
      "security-audit:path": "file-or-folder",
      "summarize-folder:path": "folder",
      "translate:path": "file",
      "write-tests:path": "file",
      "architecture-diagram:output_path": "output-file",
      "legal-contract-negotiation-review:agreement_path": "file",
      "legal-contract-negotiation-review:output_report_path": "output-file",
      "legal-demand-letter-response-draft:demand_letter_path": "file",
      "legal-demand-letter-response-draft:response_output_path":
        "output-file",
    });
  });

  it("does not mistake URLs for local paths", () => {
    expect(
      getSkillPathParameterKind(testSkill, {
        name: "target_url",
        type: "string",
        description: "Starting URL or site path",
      }),
    ).toBeNull();
    expect(
      getSkillPathParameterKind(testSkill, {
        name: "output_style",
        type: "string",
        description: "Desired visual style or design direction",
      }),
    ).toBeNull();
  });

  it("renders file and folder actions for a mixed path", () => {
    const mixedPathSkill: CustomSkill = {
      ...testSkill,
      id: "security-audit",
      parameters: [
        {
          name: "path",
          type: "string",
          description: "Path to file or folder to audit",
          required: true,
        },
      ],
    };
    const markup = renderToStaticMarkup(
      createElement(SkillParameterModal, {
        skill: mixedPathSkill,
        onSubmit: vi.fn(),
        onCancel: vi.fn(),
      }),
    );

    expect(markup.match(/skill-param-file-button/g)).toHaveLength(2);
    expect(markup).toMatch(/Choose file|选择文件/);
    expect(markup).toMatch(/Choose folder|选择文件夹/);
  });

  it("builds a Chinese user-facing draft while keeping skill instructions hidden", () => {
    const draft = expandSkillPrompt(compareFilesSkill, {
      file1: "/tmp/旧版本.pptx",
      file2: "/tmp/新版本.pptx",
    });

    expect(draft).toContain("请使用“比较文件”技能完成以下任务");
    expect(draft).toContain("第一个文件：/tmp/旧版本.pptx");
    expect(draft).toContain("第二个文件：/tmp/新版本.pptx");
    expect(draft).not.toContain("Please compare these two files");
    expect(draft).not.toContain("Summary");
  });

  it("labels an inferred document path as a file in the user-facing draft", () => {
    const proofreadSkill = JSON.parse(
      readFileSync(
        fileURLToPath(
          new URL("../../../../resources/skills/proofread.json", import.meta.url),
        ),
        "utf8",
      ),
    ) as CustomSkill;

    const draft = expandSkillPrompt(proofreadSkill, {
      path: "大模型Computer Use Agent调研.docx",
    });

    expect(draft).toContain("文件：大模型Computer Use Agent调研.docx");
    expect(draft).not.toContain("路径：");
  });

  it("serializes slash prompts with structured parameter JSON", () => {
    expect(buildSlashSkillPrompt("novelist")).toBe("/novelist");
    expect(
      buildSlashSkillPrompt("novelist", {
        seed: "A locked-room mystery",
        genre: "thriller",
      }),
    ).toBe('/novelist {"seed":"A locked-room mystery","genre":"thriller"}');
  });

  it("preserves entered values and silent defaults for ask-in-chat handoff", () => {
    const values = collectSkillParameterValues(
      testSkill,
      {
        seed: "A city that forgets its citizens overnight",
        genre: "literary",
      },
      {
        seed: true,
      },
    );

    expect(values).toEqual({
      seed: "A city that forgets its citizens overnight",
      genre: "literary",
    });
  });

  it("keeps PPT Master defaults implicit until an advanced setting changes", () => {
    expect(
      collectSkillParameterSubmissionValues(
        pptMasterSkill,
        { route: "auto", profile: "default", source_path: "" },
        {},
      ),
    ).toEqual({});
    expect(
      collectSkillParameterSubmissionValues(
        pptMasterSkill,
        { route: "auto", profile: "quick", source_path: "" },
        { profile: true },
      ),
    ).toEqual({ profile: "quick" });
  });

  it("renders PPT Master as a one-click workflow with optional advanced settings", () => {
    const markup = renderToStaticMarkup(
      createElement(SkillParameterModal, {
        skill: pptMasterSkill,
        onSubmit: vi.fn(),
        onAskInChat: vi.fn(),
        onCancel: vi.fn(),
      }),
    );

    expect(markup).toMatch(/智能默认模式|Smart defaults/);
    expect(markup).toMatch(/高级设置（可选）|Advanced settings \(optional\)/);
    expect(markup).toMatch(/使用 PPT Master|Use PPT Master/);
    expect(markup).not.toContain('id="param-route"');
    expect(markup).not.toMatch(/Ask In Chat|在聊天中询问/);
    expect(appStyles).toContain(".skill-param-master-intro");
    expect(appStyles).toContain(".skill-param-advanced-toggle");
  });

  it("renders the humanizer tone as a compact choice grid", () => {
    const markup = renderToStaticMarkup(
      createElement(SkillParameterModal, {
        skill: humanizerSkill,
        onSubmit: vi.fn(),
        onCancel: vi.fn(),
      }),
    );

    expect(markup).toContain('role="radiogroup"');
    expect(markup).toContain("skill-param-option-grid");
    expect(markup).not.toContain("skill-param-select");
    expect(markup).toContain("skill-param-textarea");
    expect(appStyles).toContain(".skill-param-option.is-selected");
  });
});
