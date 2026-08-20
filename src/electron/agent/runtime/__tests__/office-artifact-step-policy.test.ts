import { describe, expect, it } from "vitest";
import type { PlanStep } from "../../../../shared/types";
import {
  getOfficeArtifactFormatForToolCall,
  shouldDeferOfficeArtifactGeneration,
} from "../office-artifact-step-policy";

function step(
  id: string,
  description: string,
  status: PlanStep["status"] = "pending",
): PlanStep {
  return { id, description, status };
}

describe("office artifact step policy", () => {
  it("defers spreadsheet generation from analysis when a later step owns Excel delivery", () => {
    const result = shouldDeferOfficeArtifactGeneration({
      planSteps: [
        step("research", "汇总整理全部航班数据", "in_progress"),
        step("delivery", "使用 Office 工具生成 Excel 表格"),
      ],
      currentStepId: "research",
      currentStepMode: "analysis_only",
      toolName: "generate_spreadsheet",
      toolInput: { filename: "北京-广州航班明细.xlsx" },
    });

    expect(result).toEqual({
      defer: true,
      format: "xlsx",
      laterStepId: "delivery",
    });
  });

  it("allows the designated mutation step to create the spreadsheet", () => {
    const result = shouldDeferOfficeArtifactGeneration({
      planSteps: [
        step("research", "汇总整理全部航班数据", "completed"),
        step("delivery", "使用 Office 工具生成 Excel 表格", "in_progress"),
      ],
      currentStepId: "delivery",
      currentStepMode: "mutation_required",
      toolName: "create_spreadsheet",
      toolInput: { filename: "北京-广州航班明细.xlsx" },
    });

    expect(result).toEqual({ defer: false, format: "xlsx" });
  });

  it("does not defer the only Office delivery in a single-step plan", () => {
    const result = shouldDeferOfficeArtifactGeneration({
      planSteps: [step("only", "整理数据并生成 Excel", "in_progress")],
      currentStepId: "only",
      currentStepMode: "analysis_only",
      toolName: "create_spreadsheet",
      toolInput: { filename: "结果.xlsx" },
    });

    expect(result).toEqual({ defer: false, format: "xlsx" });
  });

  it("recognizes only DOCX create_document calls as coordinated Word artifacts", () => {
    expect(
      getOfficeArtifactFormatForToolCall("generate_document", {
        format: "docx",
      }),
    ).toBe("docx");
    expect(
      getOfficeArtifactFormatForToolCall("generate_document", {
        format: "pdf",
      }),
    ).toBeNull();
  });
});
