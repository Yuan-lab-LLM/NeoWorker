/**
 * Mode Suggestion Detection
 *
 * Analyzes user prompt text in real-time and suggests relevant execution modes
 * based on keyword matching with confidence scoring. Pure module — no React/DOM.
 */

export interface ModeSuggestion {
  mode: "plan" | "analyze" | "verified" | "execute" | "debug" | "collaborative";
  label: string;
  description: string;
  confidence: number;
}

interface ModeConfig {
  mode: ModeSuggestion["mode"];
  label: string;
  description: string;
  patterns: RegExp[];
}

const MODE_CONFIGS: ModeConfig[] = [
  {
    mode: "plan",
    label: "Plan Mode",
    description: "Planning mode — no mutating tools",
    patterns: [
      /\bplan\b/i,
      /\bdesign\b/i,
      /\barchitect\b/i,
      /\bstrategy\b/i,
      /\boutline\b/i,
      /\broadmap\b/i,
      /\bapproach\b/i,
      /\bpropose\b/i,
      /计划|规划/,
      /设计/,
      /架构/,
      /战略|策略/,
      /大纲|提纲/,
      /路线图/,
      /方案|方法/,
      /提议|建议/,
    ],
  },
  {
    mode: "analyze",
    label: "Analyze Mode",
    description: "Read-only analysis mode",
    patterns: [
      /\banalyz[ei]\b/i,
      /\banalyse\b/i,
      /\binvestigat/i,
      /\bexamine\b/i,
      /\breview\b/i,
      /\baudit\b/i,
      /\binspect\b/i,
      /\bunderstand\b/i,
      /\bexplain\b/i,
      /\blook into\b/i,
      /分析/,
      /调查|调研/,
      /考察|检视/,
      /审查|评审|审核/,
      /审计/,
      /检查|检测/,
      /理解|了解/,
      /解释|说明/,
      /评估|评价/,
      /复盘/,
    ],
  },
  {
    mode: "verified",
    label: "Verified Mode",
    description: "Execute with verification after each step",
    patterns: [
      /\bdeploy\b/i,
      /\bproduction\b/i,
      /\bcritical\b/i,
      /\bcareful\b/i,
      /\bverif[yi]/i,
      /\bsafe\b/i,
      /\bsensitive\b/i,
      /部署|上线/,
      /生产环境|线上环境/,
      /关键/,
      /谨慎|小心/,
      /验证|核验|校验/,
      /安全/,
      /敏感/,
    ],
  },
  {
    mode: "collaborative",
    label: "Collab Mode",
    description: "Multi-agent team collaboration",
    patterns: [
      /\bteam\b/i,
      /\bcollaborat/i,
      /\bmultiple agents\b/i,
      /\bdifferent perspectives\b/i,
      /\bbrainstorm\b/i,
      /\bparallel\b/i,
      /团队/,
      /协作|合作/,
      /多个智能体|多智能体|多个代理/,
      /不同视角|不同观点/,
      /头脑风暴|集思广益/,
      /并行/,
    ],
  },
  {
    mode: "execute",
    label: "Execute Mode",
    description: "Full tool execution allowed",
    patterns: [
      /\bbuild\b/i,
      /\bimplement\b/i,
      /\bcreate\b/i,
      /\bfix\b/i,
      /\bwrite code\b/i,
      /\brefactor\b/i,
      /\bmigrat/i,
      /\bset up\b/i,
      /\binstall\b/i,
      /构建|搭建/,
      /实现|开发/,
      /创建|生成/,
      /修复|修正/,
      /编写代码|写代码/,
      /重构/,
      /迁移/,
      /设置|配置/,
      /安装/,
    ],
  },
  {
    mode: "debug",
    label: "Debug Mode",
    description: "Hypotheses, runtime evidence, targeted fix",
    patterns: [
      /\bbug\b/i,
      /\bbugs\b/i,
      /\bstack trace\b/i,
      /\breproduc/i,
      /\brac(e|ing) condition\b/i,
      /\bintermittent\b/i,
      /\broot cause\b/i,
      /\bregression\b/i,
      /\bflaky\b/i,
      /\bthrows?\b/i,
      /\bcrash(es|ed|ing)?\b/i,
      /错误|缺陷/,
      /堆栈跟踪|堆栈信息/,
      /复现|重现/,
      /竞态条件|竞争条件/,
      /间歇性|偶发/,
      /根因|根本原因/,
      /回归问题|功能回退/,
      /不稳定|时好时坏/,
      /抛出异常|异常抛出/,
      /崩溃|闪退/,
    ],
  },
];

function scoreText(text: string, patterns: RegExp[]): number {
  let score = 0;
  let matchCount = 0;
  for (const pattern of patterns) {
    if (pattern.test(text)) {
      matchCount++;
      if (matchCount === 1) score += 0.3;
      else if (matchCount === 2) score += 0.15;
      else score += 0.1;
    }
  }
  return Math.min(score, 1.0);
}

export interface DetectOptions {
  excludeModes?: string[];
  maxResults?: number;
  threshold?: number;
}

/**
 * Detects which execution modes are most relevant for the given prompt text.
 * Returns suggestions sorted by confidence, filtered by threshold.
 */
export function detectModeSuggestions(
  text: string,
  options?: DetectOptions,
): ModeSuggestion[] {
  if (!text || typeof text !== "string") return [];
  const trimmed = text.trim();
  if (!trimmed) return [];

  const excludeModes = new Set(options?.excludeModes ?? []);
  const maxResults = options?.maxResults ?? 2;
  const threshold = options?.threshold ?? 0.3;

  const suggestions: ModeSuggestion[] = [];

  for (const config of MODE_CONFIGS) {
    if (excludeModes.has(config.mode)) continue;

    const confidence = scoreText(trimmed, config.patterns);
    if (confidence >= threshold) {
      suggestions.push({
        mode: config.mode,
        label: config.label,
        description: config.description,
        confidence,
      });
    }
  }

  suggestions.sort((a, b) => b.confidence - a.confidence);
  return suggestions.slice(0, maxResults);
}
