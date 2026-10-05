import { describe, expect, it } from "vitest";
import {
  buildCompletionContract,
  extractExplicitOutputExtensions,
  getExplicitArtifactToolNames,
  inferRequiredArtifactExtensions,
  promptRequestsPresentationArtifactOutput,
} from "../executor-completion-utils";

export const conversionCases: Array<[string, string[]]> = [
  ["帮我基于PDF内容，写一个PPT，参考第二个PPT模版，要中文的PPT，要有文字、有图片等等，内容要详尽", [".pptx"]],
  ["帮我做一份中文PPT，参考这个PDF", [".pptx"]],
  ["给我一个中文的PPT，要有图片", [".pptx"]],
  ["我要一份Word分析报告，基于这个PPT", [".docx"]],
  ["帮我写一个PDF报告", [".pdf"]],
  ["做个Excel表格", [".xlsx"]],
  ["写一份Word并导出PDF", [".docx", ".pdf"]],
  ["不要写PPT，只做Word报告", [".docx"]],
  ["别做PPT，写一个Word报告", [".docx"]],
  ["帮我写一段关于PPT的说明", []],
  ["帮我写一段关于PDF的说明", []],
  ["请基于这个PPT模版去写", []],
  ["分析这个PPT模板，不要生成文件", []],
  ["基于PPT内容，转型word，进行详细分析", [".docx"]],
  ["基于PPT内容，转成word，进行详细分析", [".docx"]],
  ["基于PPT内容，转为Word，进行详细分析", [".docx"]],
  ["将附件.pptx转换成.docx", [".docx"]],
  ["把PPT转为Word", [".docx"]],
  ["读取附件.pptx，生成Word分析报告", [".docx"]],
  ["生成基于PPT内容的Word报告", [".docx"]],
  ["生成Word分析报告，参考原PPT", [".docx"]],
  ["Convert the PPT to Word", [".docx"]],
  ["Turn input.pptx into a Word report", [".docx"]],
  ["Create a Word report based on the PPT", [".docx"]],
  ["Generate a PDF from input.pptx", [".pdf"]],
  ["把Word转换为PDF", [".pdf"]],
  ["将Excel转成HTML台账", [".html"]],
  ["读取input.xlsx，输出CSV文件", [".csv"]],
  ["Convert source.pdf to an Excel workbook", [".xlsx"]],
  ["生成HTML页面和Excel台账", [".html", ".xlsx"]],
  ["基于PPT内容，分别生成Word和PDF文档", [".docx", ".pdf"]],
  ["把Word转成PPT", [".pptx"]],
  ["Create a PowerPoint from the Word document", [".pptx"]],
  ["Create both a CSV and JSON report file from this data", [".csv", ".json"]],
  ["翻译这个PPT，输出PDF文档", [".pdf"]],
  ["Translate the PPT and export as DOCX", [".docx"]],
  ["使用原PPT模板翻译成韩语", [".pptx"]],
  ["生成一个台账", [".xlsx"]],
  ["生成对比报告，Word", [".docx"]],
  ["不要生成PPT，只输出Word报告", [".docx"]],
  ["读取input.pptx并分析内容，不生成文件", []],
  ["Create presentation-plan.json for later slide compilation", [".json"]],
  ["保存pdf-export.xlsx文件", [".xlsx"]],
  ["Create an analysis of the PPT", []],
  ["Create a Word analysis of source.pptx", [".docx"]],
  ["Create an analysis of source.pptx as a Word document", [".docx"]],
  ["Create a PDF report comparing Word and Excel", [".pdf"]],
  ["生成PPT内容的Word报告", [".docx"]],
  ["生成一份4页PPT。不要网上搜索、补造数据或制作更多页面。", [".pptx"]],
  ["生成一份PPT，每个页面需要明确来源。", [".pptx"]],
  ["生成PDF报告，每个页面使用统一页脚。", [".pdf"]],
  ["生成PPT和HTML页面", [".pptx", ".html"]],
  ["生成PPT和一个登录页面", [".pptx", ".html"]],
  ["不要制作PPT和生成Word报告", []],
  ["不要制作PPT，生成HTML页面", [".html"]],
  ["生成一个登录页面", [".html"]],
];

describe("output intent is independent of source formats", () => {
  const formats = [["PPT", ".pptx"], ["Word", ".docx"], ["PDF", ".pdf"], ["Excel", ".xlsx"], ["CSV", ".csv"], ["HTML", ".html"]];
  for (const [source] of formats) {
    for (const [target, extension] of formats) {
      it.each([
        `基于${source}内容，转成${target}`,
        `Convert source.${source.toLowerCase()} to ${target}`,
        `生成${target}报告，参考${source}文件`,
      ])("destination matrix: %s", (prompt) => {
        expect(extractExplicitOutputExtensions("", prompt)).toEqual([extension]);
      });
    }
  }

  it.each(conversionCases)("%s", (prompt, expected) => {
    const outputs = extractExplicitOutputExtensions("", prompt);
    expect(outputs.sort()).toEqual([...expected].sort());
    expect(inferRequiredArtifactExtensions("", prompt).sort()).toEqual([...expected].sort());
    expect(promptRequestsPresentationArtifactOutput("", prompt)).toBe(expected.includes(".pptx"));
    const contract = buildCompletionContract({ taskTitle: "", taskPrompt: prompt,
      requiresDirectAnswer: false, requiresDecisionSignal: false, isWatchSkipRecommendationTask: false });
    expect(contract.requiredArtifactExtensions.sort()).toEqual([...expected].sort());
  });

  it("exposes Word generation tools, not presentation tools, for the reported query", () => {
    expect(getExplicitArtifactToolNames("", "基于PPT内容，转型word，进行详细分析")).toEqual([
      "create_document", "generate_document",
    ]);
  });
});
