type PlanStepLike = {
  description?: string | null;
};

const CAPABILITY_CATALOG_PATTERNS: Array<{ key: string; pattern: RegExp }> = [
  { key: "files", pattern: /^(?:文件与代码|文件(?:和|与)代码|files?\s*(?:and|&)\s*code)(?:\s|[:：]|$)/i },
  { key: "network", pattern: /^(?:网络|network|web)(?:\s|[:：]|$)/i },
  { key: "terminal", pattern: /^(?:终端|命令行|terminal|command\s*line)(?:\s|[:：]|$)/i },
  { key: "macos", pattern: /^(?:macos\s*原生|macos\s*native|apple\s*services?)(?:\s|[:：]|$)/i },
  { key: "communication", pattern: /^(?:通信|通讯|communication|messaging)(?:\s|[:：]|$)/i },
  { key: "cloud", pattern: /^(?:云存储|cloud\s*storage)(?:\s|[:：]|$)/i },
  { key: "other", pattern: /^(?:其他|其它|other|miscellaneous)(?:\s|[:：]|$)/i },
];

function normalizeStepDescription(description: string): string {
  return description
    .replace(/[*_`#]/g, "")
    .replace(/^\s*(?:[-–—•]|\d+[.)、])\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function promptRequestsCapabilityAudit(prompt: string): boolean {
  const normalized = String(prompt || "").toLowerCase();
  const capabilityCue =
    /(?:功能|能力|工具|集成|系统能力|capabilit(?:y|ies)|features?|tools?|integrations?)/i;
  const auditCue =
    /(?:审计|测试|验证|检查|对比|评估|逐项运行|audit|test|verify|validate|inspect|compare|evaluate)/i;
  return capabilityCue.test(normalized) && auditCue.test(normalized);
}

/**
 * Detects the planner failure where a model copies available capability
 * categories into a plan instead of decomposing the user's actual request.
 */
export function isCapabilityCatalogPlan(
  steps: PlanStepLike[],
  taskPrompt = "",
): boolean {
  if (!Array.isArray(steps) || steps.length < 4 || promptRequestsCapabilityAudit(taskPrompt)) {
    return false;
  }

  const matchedCategories = new Set<string>();
  let matchedStepCount = 0;

  for (const step of steps) {
    const description = normalizeStepDescription(String(step?.description || ""));
    const match = CAPABILITY_CATALOG_PATTERNS.find(({ pattern }) => pattern.test(description));
    if (!match) continue;
    matchedStepCount += 1;
    matchedCategories.add(match.key);
  }

  return matchedCategories.size >= 4 && matchedStepCount >= Math.ceil(steps.length * 0.6);
}
