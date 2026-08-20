const GENERIC_AGENT_NAMES = new Set([
  "agent",
  "assistant",
  "bot",
  "personal agent",
  "private agent",
  "new agent",
  "custom agent",
  "managed agent",
  "智能体",
  "个人智能体",
  "私人智能体",
  "新智能体",
  "自定义智能体",
]);

function normalizeAgentName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function isGenericAgentName(value: string): boolean {
  const normalized = normalizeAgentName(value).toLowerCase();
  return !normalized || GENERIC_AGENT_NAMES.has(normalized);
}

function deriveChineseAgentName(prompt: string): string {
  const firstClause = prompt
    .split(/[，。；！？,.!?\n\r]/, 1)[0]
    ?.trim()
    .replace(/^[“”‘’"'《》【】\s]+|[“”‘’"'《》【】\s]+$/g, "") || "";
  const cleaned = firstClause
    .replace(/^(?:请|帮我|麻烦)?(?:创建|新建|生成|做|打造|配置)(?:一个|一位|一名|个)?/, "")
    .replace(/^(?:一个|一位|一名|个)/, "")
    .replace(/^(?:能|可以|用于|负责)/, "")
    .replace(/的(?=(?:智能体|助手|专家|顾问|工程师|经理|负责人)$)/, "")
    .replace(/[的吧呀啊呢]+$/g, "")
    .trim();

  if (!cleaned) return "新智能体";
  const concise = cleaned.length > 20 ? cleaned.slice(0, 20).replace(/[的与和、\s]+$/g, "") : cleaned;
  if (/(?:智能体|助手|专家|顾问|工程师|经理|负责人)$/.test(concise)) return concise;
  return `${concise}智能体`;
}

function deriveEnglishAgentName(prompt: string): string {
  const cleaned = prompt
    .split(/[,.!?\n\r]/, 1)[0]
    ?.replace(/^(?:please\s+)?(?:create|build|make|configure|set\s+up)\s+(?:an?\s+|the\s+)?/i, "")
    .replace(/\b(agent|assistant|bot)\b/gi, "")
    .replace(/[^a-zA-Z0-9\s-]+/g, " ")
    .trim();
  const words = (cleaned || "").split(/\s+/).filter(Boolean).slice(0, 5);
  if (words.length === 0) return "New Agent";
  const title = words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
  return `${title} Agent`;
}

export function deriveAgentNameFromPrompt(prompt: string, fallback = "新智能体"): string {
  const normalized = normalizeAgentName(prompt);
  if (!normalized) return fallback;
  const derived = /[\u3400-\u9fff]/.test(normalized)
    ? deriveChineseAgentName(normalized)
    : deriveEnglishAgentName(normalized);
  return isGenericAgentName(derived) ? fallback : derived;
}
