import type {
  ContextMode,
  PersonalityConfigV2,
  PersonalityQuirksV2,
} from "../../../shared/types";

type PreviewLanguage = "en" | "zh-CN";

const TRAIT_LABELS: Record<
  string,
  { label: string; low: string; high: string }
> = {
  warmth: { label: "温暖度", low: "就事论事", high: "鼓励且支持" },
  directness: { label: "直接度", low: "委婉", high: "直奔重点" },
  formality: { label: "正式度", low: "轻松", high: "专业" },
  humor: { label: "幽默感", low: "严肃", high: "轻松机智" },
  curiosity: { label: "好奇心", low: "任务聚焦", high: "探索型" },
  verbosity: { label: "详略度", low: "简短", high: "详尽周全" },
  empathy: { label: "共情度", low: "中性客观", high: "情绪感知更强" },
  confidence: { label: "确定性", low: "提供选项", high: "明确有主见" },
};

const PERSONA_SUMMARIES: Record<string, { name: string; description: string }> = {
  companion: {
    name: "陪伴者",
    description: "温暖、好奇、情绪感知细腻，以自然节奏和温和幽默进行交流。",
  },
  jarvis: {
    name: "Jarvis",
    description: "成熟、机智、从容可靠，以管家式表达主动预判需求。",
  },
  friday: {
    name: "Friday",
    description: "高效、直接、专业且支持感强，减少铺垫并快速进入行动。",
  },
  hal: {
    name: "HAL（友好版）",
    description: "冷静、有条理、精确且让人安心，耐心回应用户关切。",
  },
  computer: {
    name: "舰载计算机",
    description: "正式、信息清晰、结构稳定，按照逻辑顺序高效汇报状态。",
  },
  alfred: {
    name: "Alfred",
    description: "睿智、照顾周到、温和引导，在尊重用户自主性的同时提供建议。",
  },
  intern: {
    name: "热情实习生",
    description: "热情、好奇、乐于学习和帮忙，以积极但不过度的方式参与任务。",
  },
  sensei: {
    name: "老师",
    description: "耐心教学，通过问题、原则和类比帮助用户真正理解。",
  },
  pirate: {
    name: "冒险船长",
    description: "表达鲜明、充满冒险感，在保持实用和清晰的前提下增添航海风格。",
  },
  noir: {
    name: "黑色侦探",
    description: "像侦探一样讲述调试和排查过程，在氛围感与实用信息之间保持平衡。",
  },
};

const CONTEXT_LABELS: Record<ContextMode, string> = {
  all: "全部场景",
  coding: "编码",
  chat: "聊天",
  planning: "规划",
  writing: "写作",
  research: "研究",
};

const RESPONSE_LENGTH_LABELS: Record<string, string> = {
  terse: "精简",
  balanced: "平衡",
  detailed: "详细",
};

const EXPLANATION_DEPTH_LABELS: Record<string, string> = {
  expert: "专家",
  balanced: "平衡",
  teaching: "教学型",
};

function renderChineseStyle(config: PersonalityConfigV2): string {
  const lines = ["回应风格偏好："];
  const style = config.style;

  const emojiGuidance = {
    none: "- 不使用表情符号。",
    minimal: "- 仅在能明确增强表达时少量使用表情符号。",
    moderate: "- 可以适度使用表情符号来增强沟通效果。",
    expressive: "- 可以较多使用表情符号，让表达更生动。",
  }[style.emojiUsage];
  if (emojiGuidance) lines.push(emojiGuidance);

  if (style.responseLength === "terse") {
    lines.push("- 回答保持非常简短，直接切入重点。", "- 除非用户明确要求，否则省略解释。");
  } else if (style.responseLength === "detailed") {
    lines.push("- 提供全面、详细的回答。", "- 补充必要的背景、解释和相关信息。");
  } else {
    lines.push("- 回答详略平衡，提供适当细节。");
  }

  const commentGuidance = {
    minimal: "- 编写代码时仅为复杂逻辑添加必要注释。",
    moderate: "- 编写代码时为关键部分添加有帮助的注释。",
    verbose: "- 编写代码时添加详细注释，说明实现思路。",
  }[style.codeCommentStyle];
  if (commentGuidance) lines.push(commentGuidance);

  if (style.explanationDepth === "expert") {
    lines.push("- 默认用户具备专业经验，跳过基础解释。", "- 重点讨论高级考虑和边界情况。");
  } else if (style.explanationDepth === "teaching") {
    lines.push("- 像教学一样充分解释概念。", "- 说明原因并提供学习线索。");
  } else {
    lines.push("- 面向有能力且保持好奇的用户，平衡解释深度。");
  }

  return lines.join("\n");
}

function renderChineseQuirks(quirks: PersonalityQuirksV2): string {
  const lines: string[] = [];
  if (quirks.catchphrase?.trim()) {
    lines.push(`- 可偶尔使用口头禅：“${quirks.catchphrase.trim()}”`);
  }
  if (quirks.signOff?.trim()) {
    lines.push(
      "- 仅在自然结束较长回答时偶尔使用结束语，不要在大多数消息中使用。",
      `- 根据用户语言翻译或调整签名结束语：“${quirks.signOff.trim()}”`,
    );
  }
  if (quirks.analogyDomain && quirks.analogyDomain !== "none") {
    const analogyLabels: Record<string, string> = {
      cooking: "烹饪",
      sports: "运动",
      space: "太空",
      music: "音乐",
      nature: "自然",
      gaming: "游戏",
      movies: "电影",
      construction: "建筑",
    };
    lines.push(`- 使用类比时，优先采用${analogyLabels[quirks.analogyDomain] ?? quirks.analogyDomain}主题。`);
  }
  return lines.length ? `个性化表达习惯：\n${lines.join("\n")}` : "";
}

function buildChinesePreview(
  config: PersonalityConfigV2,
  contextMode: ContextMode,
): string {
  const parts: string[] = [];

  if (config.soulDocument?.trim()) {
    parts.push(`SOUL 自定义指令（保留原文）：\n${config.soulDocument.trim()}`);
  } else {
    const rules = config.rules.filter(
      (rule) =>
        rule.enabled &&
        (!rule.context?.length ||
          rule.context.includes("all") ||
          contextMode === "all" ||
          rule.context.includes(contextMode)),
    );
    if (rules.length) {
      const ruleLabels = {
        always: "始终",
        never: "绝不",
        prefer: "优先",
        avoid: "避免",
      };
      parts.push(
        `行为规则：\n${rules
          .map((rule) => `- ${ruleLabels[rule.type]}：${rule.rule}`)
          .join("\n")}`,
      );
    }

    const customLines: string[] = [];
    if (config.customInstructions.aboutUser?.trim()) {
      customLines.push(`关于用户：“${config.customInstructions.aboutUser.trim()}”`);
    }
    if (config.customInstructions.responseGuidance?.trim()) {
      customLines.push(
        `回应要求：“${config.customInstructions.responseGuidance.trim()}”`,
      );
    }
    if (customLines.length) {
      parts.push(`自定义指令：\n${customLines.join("\n")}`);
    }

    const traitLines = config.traits.flatMap((trait) => {
      const labels = TRAIT_LABELS[trait.id];
      if (!labels || (trait.intensity > 30 && trait.intensity < 70)) return [];
      return [
        `- ${labels.label}：${trait.intensity >= 70 ? labels.high : labels.low}`,
      ];
    });
    if (traitLines.length) {
      parts.push(`个性与行为：\n${traitLines.join("\n")}`);
    }

    parts.push(renderChineseStyle(config));

    if (config.expertise.length) {
      const levelLabels = {
        familiar: "熟悉",
        proficient: "熟练",
        expert: "专家",
      };
      parts.push(
        `专业领域：\n${config.expertise
          .map(
            (item) =>
              `- ${item.domain}：${levelLabels[item.level]}${item.notes ? `（${item.notes}）` : ""}`,
          )
          .join("\n")}`,
      );
    }

    if (contextMode !== "all") {
      const override = config.contextOverrides.find(
        (item) => item.mode === contextMode,
      );
      if (override?.styleOverrides) {
        const overrideLines = [`场景覆盖：${CONTEXT_LABELS[contextMode]}模式`];
        if (override.styleOverrides.responseLength) {
          overrideLines.push(
            `- 回答长度：${RESPONSE_LENGTH_LABELS[override.styleOverrides.responseLength]}`,
          );
        }
        if (override.styleOverrides.explanationDepth) {
          overrideLines.push(
            `- 解释深度：${EXPLANATION_DEPTH_LABELS[override.styleOverrides.explanationDepth]}`,
          );
        }
        parts.push(overrideLines.join("\n"));
      }
    }

    if (config.examples.length) {
      parts.push(
        `对话示例：\n${config.examples
          .map(
            (example, index) =>
              `### 示例 ${index + 1}\n**用户：** ${example.userMessage}\n**助手：** ${example.idealResponse}`,
          )
          .join("\n\n")}`,
      );
    }
  }

  const quirks = renderChineseQuirks(config.quirks);
  if (quirks) parts.push(quirks);

  if (config.activePersona && config.activePersona !== "none") {
    const persona = PERSONA_SUMMARIES[config.activePersona];
    if (persona) {
      parts.push(`角色风格：${persona.name}\n- ${persona.description}\n- 保持角色特色，同时确保回答清晰、实用且符合专业边界。`);
    }
  }

  return parts.filter(Boolean).join("\n\n") || "当前配置未生成额外的个性提示词。";
}

/**
 * The runtime prompt remains untouched. Only its settings preview is rendered
 * in the UI language so localization cannot alter model behaviour.
 */
export function localizePersonalityPreview(
  rawPrompt: string,
  config: PersonalityConfigV2,
  contextMode: ContextMode,
  language: PreviewLanguage,
): string {
  return language === "zh-CN"
    ? buildChinesePreview(config, contextMode)
    : rawPrompt;
}
