import * as fs from "node:fs/promises";
import * as path from "node:path";
import JSZip from "jszip";
import type { OfficeArtifactFormat } from "./office-artifact-integrity";

export type OfficeTemplateUseCase =
  | "research-report"
  | "financing-analysis"
  | "operating-review"
  | "product-launch"
  | "teaching-deck"
  | "general";

export interface OfficeTemplateTokens {
  primaryColor: string;
  accentColor: string;
  titleColor: string;
  backgroundColor: string;
  bodyFont: string;
  cjkFont: string;
  visualMode: "work" | "editorial" | "playful" | "premium" | "technical" | "research";
  density: "comfortable" | "compact" | "presentation";
}

export interface OfficeTemplateDefinition {
  id: string;
  version: string;
  format: OfficeArtifactFormat;
  useCases: OfficeTemplateUseCase[];
  label: { zh: string; en: string };
  tokens: OfficeTemplateTokens;
}

export interface OfficeTemplateSelection {
  template: OfficeTemplateDefinition;
  reason: "explicit" | "use-case" | "content-inference" | "baseline";
}

export interface OfficeTemplateCompatibilityReport {
  supported: boolean;
  format?: OfficeArtifactFormat;
  fallbackTemplateId: string;
  errors: string[];
  warnings: string[];
  inspection: {
    fileSize: number;
    entryCount: number;
    uncompressedBytes: number;
    slideSize?: { width: number; height: number };
    themeFonts: string[];
    brandColors: string[];
    masterCount: number;
    placeholderCount: number;
    hasMacros: boolean;
    hasEmbeddings: boolean;
    hasExternalRelationships: boolean;
  };
}

const BASE = {
  bodyFont: "Aptos",
  cjkFont: "PingFang SC",
} as const;

const BUILT_IN_TEMPLATES: OfficeTemplateDefinition[] = [
  {
    id: "neoworker-research-report",
    version: "1.0.0",
    format: "pptx",
    useCases: ["research-report", "financing-analysis"],
    label: { zh: "研究报告", en: "Research report" },
    tokens: {
      ...BASE,
      primaryColor: "176B87",
      accentColor: "F59E0B",
      titleColor: "172033",
      backgroundColor: "F6F8FB",
      visualMode: "research",
      density: "presentation",
    },
  },
  {
    id: "neoworker-financing-analysis",
    version: "1.0.0",
    format: "pptx",
    useCases: ["financing-analysis"],
    label: { zh: "融资分析", en: "Financing analysis" },
    tokens: {
      ...BASE,
      primaryColor: "0F766E",
      accentColor: "D97706",
      titleColor: "F8FAFC",
      backgroundColor: "0F172A",
      visualMode: "premium",
      density: "presentation",
    },
  },
  {
    id: "neoworker-operating-review",
    version: "1.0.0",
    format: "pptx",
    useCases: ["operating-review"],
    label: { zh: "经营复盘", en: "Operating review" },
    tokens: {
      ...BASE,
      primaryColor: "2563EB",
      accentColor: "10B981",
      titleColor: "172033",
      backgroundColor: "F8FAFC",
      visualMode: "work",
      density: "presentation",
    },
  },
  {
    id: "neoworker-product-launch",
    version: "1.0.0",
    format: "pptx",
    useCases: ["product-launch"],
    label: { zh: "产品发布", en: "Product launch" },
    tokens: {
      ...BASE,
      primaryColor: "7C3AED",
      accentColor: "22D3EE",
      titleColor: "F8FAFC",
      backgroundColor: "111827",
      visualMode: "premium",
      density: "presentation",
    },
  },
  {
    id: "neoworker-teaching-deck",
    version: "1.0.0",
    format: "pptx",
    useCases: ["teaching-deck"],
    label: { zh: "教学演示", en: "Teaching deck" },
    tokens: {
      ...BASE,
      primaryColor: "0284C7",
      accentColor: "F97316",
      titleColor: "172033",
      backgroundColor: "FFF7ED",
      visualMode: "playful",
      density: "presentation",
    },
  },
  {
    id: "neoworker-docx-business-report",
    version: "2.0.0",
    format: "docx",
    useCases: ["research-report", "financing-analysis", "operating-review"],
    label: { zh: "专业商务分析报告", en: "Professional business report" },
    tokens: {
      ...BASE,
      primaryColor: "1F4E78",
      accentColor: "2E85C1",
      titleColor: "173A5E",
      backgroundColor: "FFFFFF",
      visualMode: "research",
      density: "compact",
    },
  },
  {
    id: "neoworker-docx-baseline",
    version: "1.1.0",
    format: "docx",
    useCases: ["general", "product-launch", "teaching-deck"],
    label: { zh: "商务文档", en: "Business document" },
    tokens: {
      ...BASE,
      primaryColor: "2563EB",
      accentColor: "10B981",
      titleColor: "172033",
      backgroundColor: "FFFFFF",
      visualMode: "work",
      density: "comfortable",
    },
  },
  {
    id: "neoworker-xlsx-research-report",
    version: "1.0.0",
    format: "xlsx",
    useCases: ["research-report", "financing-analysis"],
    label: { zh: "分析工作簿", en: "Analysis workbook" },
    tokens: {
      ...BASE,
      primaryColor: "176B87",
      accentColor: "F59E0B",
      titleColor: "172033",
      backgroundColor: "FFFFFF",
      visualMode: "research",
      density: "compact",
    },
  },
  {
    id: "neoworker-xlsx-baseline",
    version: "1.0.0",
    format: "xlsx",
    useCases: ["general", "operating-review", "product-launch", "teaching-deck"],
    label: { zh: "商务表格", en: "Business workbook" },
    tokens: {
      ...BASE,
      primaryColor: "2563EB",
      accentColor: "10B981",
      titleColor: "172033",
      backgroundColor: "FFFFFF",
      visualMode: "work",
      density: "comfortable",
    },
  },
  {
    id: "neoworker-pptx-baseline",
    version: "1.0.0",
    format: "pptx",
    useCases: ["general"],
    label: { zh: "通用演示", en: "General presentation" },
    tokens: {
      ...BASE,
      primaryColor: "2563EB",
      accentColor: "10B981",
      titleColor: "172033",
      backgroundColor: "F8FAFC",
      visualMode: "work",
      density: "presentation",
    },
  },
];

export function listBuiltInOfficeTemplates(format?: OfficeArtifactFormat): OfficeTemplateDefinition[] {
  return BUILT_IN_TEMPLATES.filter((template) => !format || template.format === format).map((template) => ({
    ...template,
    useCases: [...template.useCases],
    label: { ...template.label },
    tokens: { ...template.tokens },
  }));
}

export function inferOfficeTemplateUseCase(text: string): OfficeTemplateUseCase {
  const normalized = String(text || "").toLowerCase();
  if (/融资|估值|ipo|fundrais|investment|股票|证券/.test(normalized)) return "financing-analysis";
  if (/经营|复盘|季度|月报|周报|operation|business review/.test(normalized)) return "operating-review";
  if (/发布|产品介绍|launch|roadmap|go[- ]to[- ]market/.test(normalized)) return "product-launch";
  if (/教学|课程|培训|lesson|teach|workshop/.test(normalized)) return "teaching-deck";
  if (/研究|分析|报告|research|analysis|report/.test(normalized)) return "research-report";
  return "general";
}

export function selectOfficeTemplate(input: {
  format: OfficeArtifactFormat;
  templateId?: string;
  useCase?: OfficeTemplateUseCase;
  contentHint?: string;
}): OfficeTemplateSelection {
  const candidates = BUILT_IN_TEMPLATES.filter((template) => template.format === input.format);
  const explicit = input.templateId
    ? candidates.find((template) => template.id === input.templateId)
    : undefined;
  if (explicit) return { template: explicit, reason: "explicit" };
  const inferred = input.useCase || inferOfficeTemplateUseCase(input.contentHint || "");
  const matched = candidates
    .filter((template) => template.useCases.includes(inferred))
    .sort((left, right) => left.useCases.length - right.useCases.length)[0];
  if (matched) {
    return { template: matched, reason: input.useCase ? "use-case" : "content-inference" };
  }
  const baseline = candidates.find((template) => template.id.endsWith("-baseline")) || candidates[0];
  if (!baseline) throw new Error(`No Office template is registered for ${input.format}.`);
  return { template: baseline, reason: "baseline" };
}

function formatFromExtension(filePath: string): OfficeArtifactFormat | undefined {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".pptx") return "pptx";
  if (extension === ".docx") return "docx";
  if (extension === ".xlsx") return "xlsx";
  return undefined;
}

function matchesRequiredParts(format: OfficeArtifactFormat, names: Set<string>): boolean {
  if (!names.has("[Content_Types].xml")) return false;
  if (format === "pptx") return names.has("ppt/presentation.xml");
  if (format === "docx") return names.has("word/document.xml");
  return names.has("xl/workbook.xml");
}

function uniqueMatches(text: string, regex: RegExp, limit = 32): string[] {
  const matches = new Set<string>();
  for (const match of text.matchAll(regex)) {
    if (match[1]) matches.add(match[1]);
    if (matches.size >= limit) break;
  }
  return [...matches];
}

/**
 * Performs a bounded, read-only OOXML template inspection. Unsupported or
 * dangerous features never execute; callers can safely fall back to a built-in
 * template while preserving an auditable explanation.
 */
export async function inspectOfficeTemplateCompatibility(
  filePath: string,
): Promise<OfficeTemplateCompatibilityReport> {
  const format = formatFromExtension(filePath);
  const fallback = selectOfficeTemplate({ format: format || "pptx" }).template.id;
  const errors: string[] = [];
  const warnings: string[] = [];
  const stat = await fs.stat(filePath);
  if (!format) errors.push("Unsupported Office template extension.");
  if (stat.size > 50 * 1024 * 1024) errors.push("Template exceeds the 50 MB safety limit.");
  const bytes = await fs.readFile(filePath);
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes, { checkCRC32: true });
  } catch {
    return {
      supported: false,
      format,
      fallbackTemplateId: fallback,
      errors: [...errors, "Template is not a readable OOXML package."],
      warnings,
      inspection: {
        fileSize: stat.size,
        entryCount: 0,
        uncompressedBytes: 0,
        themeFonts: [],
        brandColors: [],
        masterCount: 0,
        placeholderCount: 0,
        hasMacros: false,
        hasEmbeddings: false,
        hasExternalRelationships: false,
      },
    };
  }
  const entries = Object.values(zip.files);
  const names = new Set(entries.map((entry) => entry.name));
  let uncompressedBytes = 0;
  for (const entry of entries) {
    const unsafeName = (entry as { unsafeOriginalName?: string }).unsafeOriginalName || entry.name;
    if (unsafeName.startsWith("/") || unsafeName.split(/[\\/]/).includes("..")) {
      errors.push("Template contains an unsafe archive path.");
      break;
    }
    const data = (entry as unknown as { _data?: { uncompressedSize?: number; compressedSize?: number } })._data;
    const uncompressed = data?.uncompressedSize || 0;
    const compressed = data?.compressedSize || 0;
    uncompressedBytes += uncompressed;
    if (compressed > 0 && uncompressed / compressed > 1_000) {
      errors.push("Template contains a suspiciously compressed archive entry.");
      break;
    }
  }
  if (entries.length > 4_000) errors.push("Template contains too many archive entries.");
  if (uncompressedBytes > 200 * 1024 * 1024) errors.push("Template expands beyond the 200 MB safety limit.");
  if (format && !matchesRequiredParts(format, names)) errors.push("Template is missing required OOXML parts.");

  const relTexts = await Promise.all(
    entries.filter((entry) => entry.name.endsWith(".rels")).map((entry) => entry.async("text")),
  );
  const hasExternalRelationships = relTexts.some((text) => /TargetMode=["']External["']/i.test(text));
  const hasMacros = entries.some((entry) => /vbaProject\.bin|macrosheets|xlm/i.test(entry.name));
  const hasEmbeddings = entries.some((entry) => /(^|\/)(embeddings|oleObject|activeX)(\/|$)/i.test(entry.name));
  if (hasExternalRelationships) warnings.push("External relationships will not be activated.");
  if (hasMacros) errors.push("Macro-enabled templates are not supported.");
  if (hasEmbeddings) warnings.push("Embedded objects will be ignored or converted to the safe baseline.");

  const themeTexts = await Promise.all(
    entries.filter((entry) => /theme\d*\.xml$/i.test(entry.name)).slice(0, 8).map((entry) => entry.async("text")),
  );
  const themeText = themeTexts.join("\n");
  const themeFonts = uniqueMatches(themeText, /typeface=["']([^"']+)["']/gi);
  const brandColors = uniqueMatches(themeText, /(?:srgbClr|sysClr)[^>]*(?:val|lastClr)=["']([0-9A-Fa-f]{6})["']/gi);
  let slideSize: { width: number; height: number } | undefined;
  if (format === "pptx") {
    const presentation = await zip.file("ppt/presentation.xml")?.async("text");
    const size = presentation?.match(/<p:sldSz[^>]*\bcx=["'](\d+)["'][^>]*\bcy=["'](\d+)["']/i);
    if (size) slideSize = { width: Number(size[1]), height: Number(size[2]) };
  }
  const masterCount = entries.filter((entry) => /\/(slideMasters|styles)\//i.test(entry.name) || /\/styles\.xml$/i.test(entry.name)).length;
  const placeholderXml = await Promise.all(
    entries.filter((entry) => /\/(slideMasters|slideLayouts)\/.*\.xml$/i.test(entry.name)).slice(0, 64).map((entry) => entry.async("text")),
  );
  const placeholderCount = placeholderXml.reduce((count, text) => count + (text.match(/<p:ph\b/g) || []).length, 0);
  if (format === "pptx" && masterCount === 0) warnings.push("No reusable slide master was detected; the safe baseline will be used.");

  return {
    supported: errors.length === 0 && !hasEmbeddings,
    format,
    fallbackTemplateId: fallback,
    errors: [...new Set(errors)],
    warnings: [...new Set(warnings)],
    inspection: {
      fileSize: stat.size,
      entryCount: entries.length,
      uncompressedBytes,
      slideSize,
      themeFonts,
      brandColors,
      masterCount,
      placeholderCount,
      hasMacros,
      hasEmbeddings,
      hasExternalRelationships,
    },
  };
}
