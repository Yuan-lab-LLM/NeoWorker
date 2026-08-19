import { getCurrentLanguage } from "../i18n";
import { getLocalizedAgentRoleName } from "./localized-agent-roles";

const ZH_SYSTEM_SESSION_TITLES: Record<string, string> = {
  "Code Reviewer preview": "代码评审员预览",
  "Market Researcher manual run": "市场研究（手动运行）",
};

/**
 * Keeps user-authored titles intact while removing English from the small set
 * of product-generated sidebar titles and test-session suffixes.
 */
export function getLocalizedSidebarSystemTitle(title: string): string {
  if (getCurrentLanguage() !== "zh-CN") return title;

  const exact = ZH_SYSTEM_SESSION_TITLES[title];
  if (exact) return exact;

  const previewMatch = title.match(/^(.+?)\s+preview$/i);
  if (previewMatch) {
    const localizedRole = getLocalizedAgentRoleName(previewMatch[1]);
    if (localizedRole !== previewMatch[1]) return `${localizedRole}预览`;
  }

  return title.replace(/\bagent test\b/gi, "智能体测试");
}
