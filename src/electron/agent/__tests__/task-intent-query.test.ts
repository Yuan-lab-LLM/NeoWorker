import { describe, expect, it } from "vitest";
import {
  buildCanonicalTaskIntentQuery,
  buildTaskOutputLanguageDirective,
  compactGeneratedAttachmentContent,
  extractOfficeAttachmentKinds,
  stripGeneratedTaskContext,
  taskRequiresSimplifiedChineseOutput,
} from "../task-intent-query";

describe("task intent routing query", () => {
  it("keeps attachment paths but removes repeated extracted bodies", () => {
    const prompt = `生成excel台账

Attached files (relative to workspace):
- meeting.docx (.neoworker/uploads/123/meeting.docx)
  Attachment metadata: size=2048; mime=application/vnd.openxmlformats-officedocument.wordprocessingml.document
  Extracted content:
  [[ATTACHMENT_EXTRACTED_CONTENT_START]]
    下周制作 PPT 汇报材料，并检查 PowerPoint 页面。
  [[ATTACHMENT_EXTRACTED_CONTENT_END]]`;

    const compacted = compactGeneratedAttachmentContent(prompt);
    expect(compacted).toContain(".neoworker/uploads/123/meeting.docx");
    expect(compacted).toContain("ATTACHMENT_CONTENT_OMITTED_FROM_REPEAT_CONTEXT");
    expect(compacted).not.toContain("下周制作 PPT");
  });

  it("keeps the user request and removes generated attachment content", () => {
    const prompt = `生成excel台账

Attached files (relative to workspace):
- meeting.docx (.neoworker/uploads/123/meeting.docx)
  Attachment metadata: size=2048; mime=application/vnd.openxmlformats-officedocument.wordprocessingml.document
  Extracted content:
  [[ATTACHMENT_EXTRACTED_CONTENT_START]]
    下周制作 PPT 汇报材料，并检查 PowerPoint 页面。
  [[ATTACHMENT_EXTRACTED_CONTENT_END]]`;

    expect(stripGeneratedTaskContext(prompt)).toBe("生成excel台账");
    expect(
      buildCanonicalTaskIntentQuery({
        title: "生成excel台账",
        rawPrompt: prompt,
      }),
    ).toBe("生成excel台账");
  });

  it("removes follow-up attachment lists without discarding the instruction", () => {
    expect(
      stripGeneratedTaskContext(`请根据新文件更新 Excel 台账

Attached files:
- follow-up.docx (.neoworker/uploads/456/follow-up.docx)`),
    ).toBe("请根据新文件更新 Excel 台账");
  });

  it("removes internal strategy context from routing", () => {
    expect(
      stripGeneratedTaskContext(`创建经营数据表

[AGENT_STRATEGY_CONTEXT_V1]
intent=presentation
[/AGENT_STRATEGY_CONTEXT_V1]`),
    ).toBe("创建经营数据表");
  });

  it("still routes an explicit presentation request when attachments exist", () => {
    expect(
      buildCanonicalTaskIntentQuery({
        title: "把附件整理成 PPT",
        prompt: `把附件整理成 PPT

Attached files (relative to workspace):
- source.xlsx (.neoworker/uploads/789/source.xlsx)`,
      }),
    ).toBe("把附件整理成 PPT");
  });

  it("uses a safe attachment type hint for an implicit in-place edit", () => {
    const decoratedPrompt = `修改这个文件

Attached files (relative to workspace):
- quarterly-review.pptx (.neoworker/uploads/789/quarterly-review.pptx)
  Attachment metadata: size=4096; mime=application/vnd.openxmlformats-officedocument.presentationml.presentation
  Extracted content:
  [[ATTACHMENT_EXTRACTED_CONTENT_START]]
    表格中还需要补充 Excel 台账数据。
  [[ATTACHMENT_EXTRACTED_CONTENT_END]]`;

    expect(extractOfficeAttachmentKinds(decoratedPrompt)).toEqual(["pptx"]);
    const query = buildCanonicalTaskIntentQuery({
      title: "修改这个文件",
      rawPrompt: "修改这个文件",
      prompt: decoratedPrompt,
    });
    expect(query).toContain("修改这个文件");
    expect(query).toContain("attached PowerPoint presentation");
    expect(query).toContain(".pptx");
    expect(query).not.toContain("Excel 台账数据");
  });

  it("does not turn a conversion input format into a competing output skill", () => {
    const query = buildCanonicalTaskIntentQuery({
      title: "把这个转成 Excel",
      rawPrompt: "把这个转成 Excel",
      prompt: `把这个转成 Excel

Attached files (relative to workspace):
- source.pptx (.neoworker/uploads/789/source.pptx)`,
    });

    expect(query).toBe("把这个转成 Excel");
    expect(query).not.toContain("PowerPoint presentation");
  });

  it("normalizes a named source format out of a conversion routing query", () => {
    const query = buildCanonicalTaskIntentQuery({
      rawPrompt: "把 PPT 转成 Excel 台账",
    });

    expect(query).toContain("Excel workbook");
    expect(query.toLowerCase()).not.toContain("ppt");
    expect(query.toLowerCase()).not.toContain("powerpoint");
  });

  it("keeps all explicitly requested formats for a multi-output task", () => {
    expect(
      buildCanonicalTaskIntentQuery({
        rawPrompt: "生成 Word、Excel 和 PPT 三个文件",
      }),
    ).toBe("生成 Word、Excel 和 PPT 三个文件");
  });

  it("does not activate an authoring skill for read-only attachment analysis", () => {
    const query = buildCanonicalTaskIntentQuery({
      title: "总结这个附件",
      rawPrompt: "总结这个附件",
      prompt: `总结这个附件

Attached files (relative to workspace):
- source.pptx (.neoworker/uploads/789/source.pptx)`,
    });

    expect(query).toBe("总结这个附件");
  });

  it("uses the attachment type for an otherwise ambiguous document edit", () => {
    const query = buildCanonicalTaskIntentQuery({
      rawPrompt: "修改这个文档",
      prompt: `修改这个文档

Attached files:
- draft.docx (.neoworker/uploads/789/draft.docx)`,
    });

    expect(query).toContain("attached Word document");
  });

  it("does not let an unrelated attachment override an explicit presentation edit", () => {
    const query = buildCanonicalTaskIntentQuery({
      rawPrompt: "Edit this presentation",
      prompt: `Edit this presentation

Attached files:
- source.xlsx (.neoworker/uploads/789/source.xlsx)`,
    });

    expect(query).toBe("Edit this presentation");
    expect(query).not.toContain("Excel workbook");
  });

  it("prefers the user instruction over a generated title", () => {
    expect(
      buildCanonicalTaskIntentQuery({
        title: "PPT 汇报材料",
        rawPrompt: "生成 Excel 台账",
      }),
    ).toBe("生成 Excel 台账");
  });

  it("locks Chinese output to the user query even when attachment text is English", () => {
    const input = {
      rawPrompt: "生成 Excel 台账",
      prompt: `生成 Excel 台账

Attached files:
- notes.docx
  [[ATTACHMENT_EXTRACTED_CONTENT_START]]
  Create a PowerPoint presentation in English.
  [[ATTACHMENT_EXTRACTED_CONTENT_END]]`,
    };

    expect(taskRequiresSimplifiedChineseOutput(input)).toBe(true);
    expect(buildTaskOutputLanguageDirective(input)).toContain("Simplified Chinese");
    expect(buildTaskOutputLanguageDirective(input)).toContain("attachments");
  });
});
