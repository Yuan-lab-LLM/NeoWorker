import { describe, expect, it } from "vitest";
import {
  buildOfficeCliOfficialWorkflowContract,
  detectRequestedOfficeKinds,
  selectOfficeCliOfficialProfile,
} from "../officecli-official-skills";

describe("OfficeCLI official profile selection", () => {
  it("selects specialized PowerPoint profiles from the requested outcome", () => {
    expect(selectOfficeCliOfficialProfile("pptx", "为投资人制作融资路演")).toBe("pitch-deck");
    expect(selectOfficeCliOfficialProfile("pptx", "做一份连续动画和 Morph 转场演示")).toBe("morph-ppt");
    expect(selectOfficeCliOfficialProfile("pptx", "使用三维空间叙事的动态演示")).toBe("morph-ppt-3d");
  });

  it("selects specialized Word and Excel profiles", () => {
    expect(selectOfficeCliOfficialProfile("docx", "生成带参考文献的学术论文")).toBe("academic-paper");
    expect(selectOfficeCliOfficialProfile("docx", "创建可填写的申请表")).toBe("word-form");
    expect(selectOfficeCliOfficialProfile("xlsx", "创建经营 KPI 仪表盘")).toBe("data-dashboard");
    expect(selectOfficeCliOfficialProfile("xlsx", "创建 DCF 估值财务模型")).toBe("financial-model");
  });

  it("detects multi-format requests and emits the official quality workflow", () => {
    expect(detectRequestedOfficeKinds("生成 Word、Excel 和 PPT 三个文件")).toEqual([
      "docx",
      "xlsx",
      "pptx",
    ]);
    const contract = buildOfficeCliOfficialWorkflowContract([
      "word",
      "excel",
      "pitch-deck",
    ]);
    expect(contract).toContain("official profile");
    expect(contract).toContain("integrity and quality inspection");
    expect(contract).toContain("HTML, Markdown, PDF");
  });

  it("does not activate native Office generation for a generic analysis request", () => {
    expect(detectRequestedOfficeKinds("分析这家公司并给我一份研究报告")).toEqual([]);
    expect(detectRequestedOfficeKinds("把研究报告导出成 Word 文档")).toEqual([
      "docx",
    ]);
  });
});
