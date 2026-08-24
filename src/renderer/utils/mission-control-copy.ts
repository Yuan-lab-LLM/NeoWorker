import { getCurrentLanguage } from "../i18n";

const ZH_ROUTINE_TITLES: Record<string, string> = {
  "Market Researcher manual run": "市场研究（手动运行）",
  "Pitch Agent manual run": "推介材料助手（手动运行）",
};

const ZH_ROUTINE_DESCRIPTIONS: Record<string, string> = {
  "Research sectors, companies, catalysts, and market signals with a source trail.":
    "研究行业、公司、催化因素和市场信号，并为重要结论保留来源依据。",
  "Create pitch materials from company, market, comp, and deal context.":
    "根据公司、市场、可比对象和交易背景生成推介材料。",
};

const ZH_SCOPE_NAMES: Record<string, string> = {
  "Local Company": "本地公司",
  "Company: Local Company": "公司：本地公司",
  "Temporary Workspace": "临时工作区",
};

const ZH_MANAGED_AGENT_NAMES: Record<string, string> = {
  "Market Researcher": "市场研究助手",
  "Pitch Agent": "推介材料助手",
  "Meeting Prep Agent": "会议准备助手",
  "Earnings Reviewer": "财报审核助手",
};

const MARKET_RESEARCH_BRIEF_PREFIX =
  "Run a read-only market research workflow.";
const DISPATCH_REQUEST_PREFIX = "\nRequest:\n";
const DISPATCH_REQUEST_SUFFIX = "\n\nDeliverables:";

function extractUserRequest(prompt: string): string {
  const requestStart = prompt.indexOf(DISPATCH_REQUEST_PREFIX);
  if (requestStart < 0) return prompt;

  const contentStart = requestStart + DISPATCH_REQUEST_PREFIX.length;
  const requestEnd = prompt.indexOf(DISPATCH_REQUEST_SUFFIX, contentStart);
  if (requestEnd < 0) return prompt;

  return prompt.slice(contentStart, requestEnd).trim();
}

/** Hide managed-agent engine context and show only the actual user request. */
export function getManagedAgentPromptForDisplay(prompt: string): string {
  const normalized = prompt.replace(/\r\n/g, "\n").trim();
  const marker = "\nUser request:\n";
  const requestStart = normalized.lastIndexOf(marker);
  const isManagedPrompt =
    requestStart >= 0 &&
    (/\nOperating notes:\n/i.test(normalized) ||
      /\nPreferred memory sources:\n/i.test(normalized));
  if (!isManagedPrompt) return prompt;

  const userRequest = normalized.slice(requestStart + marker.length).trim();
  if (getCurrentLanguage() !== "zh-CN") return userRequest;

  const configuredRun = userRequest.match(
    /^Run the configured workflow for (.+?)\.?$/i,
  );
  if (!configuredRun) return userRequest;

  const rawName = configuredRun[1].trim();
  const displayName = ZH_MANAGED_AGENT_NAMES[rawName] || rawName;
  return `运行“${displayName}”已配置的工作流。所有分析、过程说明和最终结果均使用简体中文。`;
}

/** Localize titles created by older managed-agent runs without mutating history. */
export function getManagedAgentTaskTitleForDisplay(title: string): string {
  if (getCurrentLanguage() !== "zh-CN") return title;
  const localizedSuffix = title
    .replace(/\s+agent test$/i, " 智能体测试")
    .replace(/\s+agent run$/i, " 智能体运行")
    .replace(/\s+quick preview$/i, " 快速预览")
    .replace(/\s+full test$/i, " 完整测试");
  const managedAgent = Object.entries(ZH_MANAGED_AGENT_NAMES).find(
    ([name]) =>
      localizedSuffix === name || localizedSuffix.startsWith(`${name} `),
  );
  return managedAgent
    ? `${managedAgent[1]}${localizedSuffix.slice(managedAgent[0].length)}`
    : localizedSuffix;
}

/** Localize product-provided routine names, but leave user-authored titles intact. */
export function getMissionControlTaskTitle(title: string): string {
  if (getCurrentLanguage() !== "zh-CN") return title;
  return ZH_ROUTINE_TITLES[title] || title;
}

/** Localize descriptions shipped by NeoWorker while preserving user-authored copy. */
export function getRoutineDescriptionForDisplay(description: string): string {
  if (getCurrentLanguage() !== "zh-CN") return description;
  return ZH_ROUTINE_DESCRIPTIONS[description] || description;
}

/** Turn product-generated run summaries into plain Chinese instead of exposing engine copy. */
export function getRoutineRunSummaryForDisplay(summary: string): string {
  if (getCurrentLanguage() !== "zh-CN") return summary;

  if (/^Manual run$/i.test(summary.trim())) return "手动启动";

  const itemSummary = summary.match(
    /^Items:\s*(\d+)\s+done,\s*(\d+)\s+failed,\s*(\d+)\s+blocked\s*\(total:\s*(\d+)\)\s*(.*)$/i,
  );
  if (itemSummary) {
    const [, done, failed, blocked, total, detail] = itemSummary;
    const localizedDetail =
      /Synthesis timed out; completing with available team outputs\.?/i.test(
        detail,
      )
        ? "结果汇总超时，已保留当前可用的团队输出。"
        : detail.trim();
    return `共 ${total} 项：${done} 项完成，${failed} 项失败，${blocked} 项受阻。${localizedDetail}`;
  }

  return summary
    .replace(
      /Synthesis timed out; completing with available team outputs\.?/gi,
      "结果汇总超时，已保留当前可用的团队输出。",
    )
    .replace(/^No output\.?$/i, "没有生成输出")
    .replace(/^Manual run$/i, "手动启动");
}

/** Present the managed market-research brief as user-facing Chinese copy. */
export function getMissionControlTaskBrief(prompt: string): string {
  const userRequest = extractUserRequest(prompt);
  if (
    getCurrentLanguage() !== "zh-CN" ||
    !userRequest.startsWith(MARKET_RESEARCH_BRIEF_PREFIX)
  ) {
    return userRequest;
  }

  return "执行只读市场研究：比较多个来源，梳理共识与分歧，形成简明备忘录，并为每项重要结论保留来源依据。所有输出均为供专业人士审核的草案；不会执行交易、对外发送信息、发布会计分录、批准入职，或给出最终投资、会计、法律、税务意见。";
}

/** Translate only seeded workspace/company labels, never arbitrary user names. */
export function getMissionControlScopeName(name: string): string {
  if (getCurrentLanguage() !== "zh-CN") return name;
  const exactName = ZH_SCOPE_NAMES[name];
  if (exactName) return exactName;

  const companyName = name.match(/^Company:\s*(.+)$/i)?.[1]?.trim();
  if (companyName) {
    return `公司：${ZH_SCOPE_NAMES[companyName] || companyName}`;
  }

  return name;
}
