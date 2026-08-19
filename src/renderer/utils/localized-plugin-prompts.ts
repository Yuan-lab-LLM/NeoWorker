import { getCurrentLanguage } from "../i18n";

const ZH_PLUGIN_TRY_ASKING: Record<string, string[]> = {
  "ai-governance-legal-pack": [
    "建立或查看 AI 系统清单",
    "生成一份 AI 影响评估（AIA）",
    "开始 AI 治理信息采集",
    "调整 AI 治理法务配置",
    "创建或切换法律事项工作区",
  ],
};

export function getLocalizedPluginTryAskingPrompt(
  packName: string,
  prompt: string,
  index: number,
  language = getCurrentLanguage(),
  localizedCommandName?: string,
): string {
  if (language !== "zh-CN") return prompt;
  const curatedPrompt = ZH_PLUGIN_TRY_ASKING[packName]?.[index];
  if (curatedPrompt) return curatedPrompt;

  const commandName = localizedCommandName?.trim();
  if (commandName) return `运行“${commandName}”工作流`;

  return "使用此能力组合开始一项新任务，并在执行前确认目标和交付要求。";
}
