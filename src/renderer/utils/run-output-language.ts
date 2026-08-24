import type { SupportedLanguage } from "../i18n";

const ZH_OUTPUT_REQUIREMENT =
  "输出要求：全程使用简体中文完成分析、过程说明和最终结果；代码、文件名、产品名和必须保留的专业术语除外。";

export function withRunOutputLanguage(
  prompt: string,
  language: SupportedLanguage,
): string {
  const normalized = prompt.trim();
  if (language !== "zh-CN" || !normalized) return normalized;
  if (normalized.includes(ZH_OUTPUT_REQUIREMENT)) return normalized;
  return `${normalized}\n\n${ZH_OUTPUT_REQUIREMENT}`;
}

export function stripRunOutputLanguageRequirement(prompt: string): string {
  const normalized = prompt.trim();
  const requirementBlock = `\n\n${ZH_OUTPUT_REQUIREMENT}`;
  return normalized.endsWith(requirementBlock)
    ? normalized.slice(0, -requirementBlock.length).trimEnd()
    : normalized;
}

export function buildManagedAgentRunPrompt(
  agentName: string,
  language: SupportedLanguage,
): string {
  const prompt =
    language === "zh-CN"
      ? `运行“${agentName}”已配置的工作流。`
      : `Run the configured workflow for ${agentName}.`;
  return withRunOutputLanguage(prompt, language);
}
