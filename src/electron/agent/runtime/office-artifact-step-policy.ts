import type { PlanStep } from "../../../shared/types";
import type { StepContractMode } from "../step-contract";
import { canonicalizeToolName } from "../tool-semantics";
import type { CoordinatedOfficeArtifactFormat } from "./office-artifact-request-coordinator";

type CoordinatedDeliverableFormat = CoordinatedOfficeArtifactFormat | "pdf";

const OFFICE_DELIVERY_INTENT_REGEX =
  /\b(?:create|generate|produce|build|export|save|deliver|write|make)\b|(?:生成|创建|制作|导出|保存|交付|写入|产出|使用\s*office\s*工具)/iu;

export function getOfficeArtifactFormatForToolCall(
  toolName: string,
  input?: Record<string, unknown> | null,
): CoordinatedDeliverableFormat | null {
  const canonical = canonicalizeToolName(toolName);
  if (canonical === "create_spreadsheet") return "xlsx";
  if (canonical === "create_presentation") return "pptx";
  if (canonical === "create_document") {
    const requestedFormat = String(input?.format || "").trim().toLowerCase();
    const requestedFilename = String(input?.filename || "").trim().toLowerCase();
    if (requestedFormat === "docx" || requestedFilename.endsWith(".docx")) {
      return "docx";
    }
    if (requestedFormat === "pdf" || requestedFilename.endsWith(".pdf")) {
      return "pdf";
    }
  }
  return null;
}

export function stepRequestsOfficeArtifactDelivery(
  step: Pick<PlanStep, "description">,
  format: CoordinatedDeliverableFormat,
): boolean {
  const description = String(step.description || "").toLowerCase();
  if (!description.trim() || !OFFICE_DELIVERY_INTENT_REGEX.test(description)) {
    return false;
  }

  if (format === "xlsx") {
    return /\b(?:xlsx|excel|spreadsheet|workbook)\b|(?:电子表格|工作簿|表格)/iu.test(
      description,
    );
  }
  if (format === "pptx") {
    return /\b(?:pptx|ppt|powerpoint|presentation|slide\s*deck|slides?)\b|(?:演示文稿|幻灯片)/iu.test(
      description,
    );
  }
  if (format === "pdf") {
    return /\bpdf\b|(?:pdf\s*文件|便携式文档)/iu.test(description);
  }
  return /\b(?:docx|word\s+document|word)\b|(?:word\s*文档|文字文档)/iu.test(
    description,
  );
}

/**
 * Analysis/research steps may see Office tools for capability awareness, but
 * they must not publish the formal artifact when a later plan step owns that
 * same delivery. This avoids "analysis created V1, delivery created V2".
 */
export function shouldDeferOfficeArtifactGeneration(opts: {
  planSteps: PlanStep[] | null | undefined;
  currentStepId: string;
  currentStepMode: StepContractMode;
  toolName: string;
  toolInput?: Record<string, unknown> | null;
}): {
  defer: boolean;
  format: CoordinatedDeliverableFormat | null;
  laterStepId?: string;
} {
  const format = getOfficeArtifactFormatForToolCall(
    opts.toolName,
    opts.toolInput,
  );
  if (!format || opts.currentStepMode === "mutation_required") {
    return { defer: false, format };
  }

  const steps = Array.isArray(opts.planSteps) ? opts.planSteps : [];
  const currentIndex = steps.findIndex((step) => step.id === opts.currentStepId);
  if (currentIndex < 0) return { defer: false, format };

  const laterOwner = steps.slice(currentIndex + 1).find(
    (step) =>
      step.status !== "failed" &&
      step.status !== "skipped" &&
      stepRequestsOfficeArtifactDelivery(step, format),
  );
  if (!laterOwner) return { defer: false, format };

  return { defer: true, format, laterStepId: laterOwner.id };
}
