import type { AgentCapability, AgentRole } from "../../shared/types";
import { getCurrentLanguage } from "../i18n";

export type AgentRoleDisplayLike = Pick<AgentRole, "name" | "displayName"> &
  Partial<Pick<AgentRole, "id" | "sourceTemplateId">> & {
  description?: string;
};

interface LocalizedAgentRoleText {
  name: string;
  description: string;
}

export interface LocalizedSubagentDisplay {
  name: string;
  profileName: string;
  codename: string;
  description: string;
}

const ZH_SUBAGENT_ROLE_BY_CALLSIGN: Record<string, LocalizedAgentRoleText> = {
    builder: {
      name: "方案构建专家",
      description: "负责实现方案、搭建产出并完成交付。",
    },
    inspector: {
      name: "质量审查专家",
      description: "负责检查结果、发现问题并验证质量。",
    },
    explorer: {
      name: "资料调研专家",
      description: "负责搜集资料、分析信息并整理依据。",
    },
    planner: {
      name: "任务规划专家",
      description: "负责拆解目标、安排步骤并协调推进。",
    },
    designer: {
      name: "设计专家",
      description: "负责设计结构、体验和视觉方案。",
    },
    writer: {
      name: "内容交付专家",
      description: "负责整理内容并形成可交付成果。",
    },
    synthesizer: {
      name: "结果汇总专家",
      description: "负责汇总各专家结论并形成最终答案。",
    },
    agent: { name: "协作专家", description: "负责处理分配的专项任务。" },
  };

const ZH_AGENT_ROLE_TEXT_BY_NAME: Record<string, LocalizedAgentRoleText> = {
    Architect: { name: "架构师", description: "设计系统架构并规划实现路径。" },
    Coder: {
      name: "编码工程师",
      description: "编写清晰高效的代码并实现功能。",
    },
    "Code Reviewer": {
      name: "代码评审员",
      description: "检查代码缺陷、安全问题和最佳实践。",
    },
    "Content Writer": {
      name: "内容撰写员",
      description: "撰写文档、博客文章和营销文案。",
    },
    "Company Planner": {
      name: "公司规划员",
      description: "围绕公司目标、节奏和优先级规划工作。",
    },
    "Customer Ops Lead": {
      name: "客户运营负责人",
      description: "协调客户运营、支持流程和服务质量。",
    },
    "Data Scientist / Analyst": {
      name: "数据科学家/分析师",
      description: "监控数据质量、实验状态和模型表现漂移，并准备分析简报。",
    },
    "Data Analyst": {
      name: "数据分析师",
      description: "分析数据、生成报告并发现趋势洞察。",
    },
    Designer: { name: "设计师", description: "创建 UI 草图、图表和视觉方案。" },
    "Deck/Note Writer": {
      name: "演示稿/备忘录撰写员",
      description: "把已批准的分析整理成演示稿、备忘录和工作底稿草案。",
    },
    "DevOps Engineer": {
      name: "DevOps 工程师",
      description: "管理 CI/CD、部署、基础设施和监控。",
    },
    "DevOps / SRE Engineer": {
      name: "DevOps / SRE 工程师",
      description: "监控基础设施漂移、事故复盘、安全公告和 SLA 合规情况。",
    },
    "Engineering Manager": {
      name: "工程经理",
      description:
        "汇总团队状态、准备 1:1 简报、跟踪跨团队依赖并发现升级风险。",
    },
    "Finance Lead": {
      name: "财务负责人",
      description: "协调财务工作流，分配专家，并保持审核节点明确。",
    },
    "Founder Office Operator": {
      name: "创始人办公室操作员",
      description: "协助创始人办公室推进研究、跟进和跨团队事项。",
    },
    "General Assistant": {
      name: "通用助理",
      description: "处理杂项任务、日程安排和协同工作。",
    },
    "Growth Operator": {
      name: "增长运营",
      description: "跟进市场、增长机会和外部信号。",
    },
    "Hardware Engineer": {
      name: "硬件工程师",
      description: "跟踪设计评审、元器件研究、BOM 变更、测试文档和跨职能协同。",
    },
    "Marketing Specialist": {
      name: "营销专家",
      description: "创建营销活动、社媒内容和增长策略。",
    },
    "Team Chat Q&A": {
      name: "团队问答助手",
      description: "使用经过批准的文档、文件和技能回答团队常见问题。",
    },
    "Morning Planner": {
      name: "晨间规划助手",
      description: "将日历、未完成任务和收件箱上下文整理为清晰的每日计划。",
    },
    "Bug Triage": {
      name: "缺陷分诊助手",
      description: "审查新缺陷、判断优先级并生成有依据的分诊摘要。",
    },
    "Chief of Staff": {
      name: "幕僚长助手",
      description: "汇总收件箱、日历、聊天和工作区信息，准备管理层简报。",
    },
    "Customer Reply Drafter": {
      name: "客户回复助手",
      description: "基于工单、账户、政策和已保存上下文起草可靠回复。",
    },
    "Research Analyst": {
      name: "研究分析助手",
      description: "调研主题、综合发现并保留简洁的结论依据。",
    },
    "Inbox Follow-up Assistant": {
      name: "收件箱跟进助手",
      description: "跟踪久未回复的会话、起草跟进内容并推动事项继续。",
    },
    "Pitch Agent": {
      name: "推介材料助手",
      description: "根据公司、市场、可比公司和交易背景制作推介材料。",
    },
    "Meeting Prep Agent": {
      name: "会议准备助手",
      description: "准备财务会议简报，列明来源、待确认问题和跟进风险。",
    },
    "Market Researcher": {
      name: "市场研究助手",
      description: "调研行业、公司、催化因素和市场信号，并保留来源记录。",
    },
    "Earnings Reviewer": {
      name: "财报审阅助手",
      description: "审阅财报、电话会、业绩指引、预测修订和行业联动影响。",
    },
    "Model Builder": {
      name: "财务模型构建助手",
      description: "构建可审阅的 DCF、可比公司、LBO 和三表模型。",
    },
    "Valuation Reviewer": {
      name: "估值审阅助手",
      description: "审阅估值模型、可比公司组合、敏感性分析和来源支撑。",
    },
    "GL Reconciler": {
      name: "总账对账助手",
      description: "准备对账底稿、追踪差异并提交异常供审批。",
    },
    "Month-End Closer": {
      name: "月末结账助手",
      description: "准备应计项目、滚动表、差异说明和结账审阅包。",
    },
    "Statement Auditor": {
      name: "报表审计助手",
      description: "检查报表和底稿的证据支撑、异常情况与披露风险。",
    },
    "KYC Screener": {
      name: "客户尽调审查助手",
      description: "解析客户尽调材料、核对规则并提交准入异常。",
    },
    "PR Agent": {
      name: "公关文案助手",
      description: "撰写、润色并审核公关稿件。",
    },
    "Pr Agent": {
      name: "公关文案助手",
      description: "撰写、润色并审核公关稿件。",
    },
    "Product Manager": {
      name: "产品经理",
      description: "定义功能、撰写用户故事并排列需求优先级。",
    },
    "Project Manager": {
      name: "项目经理",
      description: "协调任务、跟踪进展，并管理时间线与团队负载。",
    },
    Researcher: {
      name: "研究员",
      description: "调研解决方案、分析选项并收集信息。",
    },
    "Research/Data Reader": {
      name: "研究/数据读取员",
      description: "只读收集市场、公司、申报、台账和文档证据，并保留来源线索。",
    },
    "Resolver/Controller": {
      name: "问题处理/控制员",
      description: "核对异常、追踪差异、准备差异说明，并确保过账由人工批准。",
    },
    "Reviewer/Critic": {
      name: "审核/质检员",
      description: "审核假设、来源支撑、数学校验、演示质量和防护合规。",
    },
    "Security Analyst": {
      name: "安全分析师",
      description: "执行安全审计、漏洞评估和合规检查。",
    },
    Synthesis: {
      name: "综合智能体",
      description: "汇总各智能体的结果，形成统一结论。",
    },
    "Software Engineer": {
      name: "软件工程师",
      description: "处理代码评审、PR 分流、依赖跟踪、测试覆盖分析和技术文档。",
    },
    "Support Agent": {
      name: "支持专员",
      description: "处理用户问题、排障和客户沟通。",
    },
    "System QA": {
      name: "系统 QA",
      description:
        "监控测试覆盖、跟踪不稳定测试、准备发布就绪报告并评估回归风险。",
    },
    "Technical Director": {
      name: "技术总监",
      description: "准备架构决策评审、跟踪跨团队技术风险并维护技术策略简报。",
    },
    "Technical Writer": {
      name: "技术写作员",
      description:
        "审查文档新鲜度、起草 API 变更日志、检查 README 覆盖和风格规范。",
    },
    Tester: {
      name: "测试工程师",
      description: "编写并运行测试，发现边界情况和缺陷。",
    },
    "VP of Engineering": {
      name: "工程副总裁",
      description: "准备高管简报、跟踪 OKR、汇总组织健康指标并关注招聘管线。",
    },
  };

const ZH_AGENT_ROLE_TEXT_BY_ID: Record<string, LocalizedAgentRoleText> = {
    architect: ZH_AGENT_ROLE_TEXT_BY_NAME.Architect,
    assistant: ZH_AGENT_ROLE_TEXT_BY_NAME["General Assistant"],
    coder: ZH_AGENT_ROLE_TEXT_BY_NAME.Coder,
    data_analyst: ZH_AGENT_ROLE_TEXT_BY_NAME["Data Analyst"],
    devops: ZH_AGENT_ROLE_TEXT_BY_NAME["DevOps Engineer"],
    "finance-controller": ZH_AGENT_ROLE_TEXT_BY_NAME["Resolver/Controller"],
    "finance-data-reader": ZH_AGENT_ROLE_TEXT_BY_NAME["Research/Data Reader"],
    "finance-document-writer": ZH_AGENT_ROLE_TEXT_BY_NAME["Deck/Note Writer"],
    "finance-lead": ZH_AGENT_ROLE_TEXT_BY_NAME["Finance Lead"],
    "finance-model-builder": ZH_AGENT_ROLE_TEXT_BY_NAME["Model Builder"],
    "finance-reviewer": ZH_AGENT_ROLE_TEXT_BY_NAME["Reviewer/Critic"],
    "managed-market-researcher": ZH_AGENT_ROLE_TEXT_BY_NAME["Market Researcher"],
    "managed-pitch-agent": ZH_AGENT_ROLE_TEXT_BY_NAME["Pitch Agent"],
    "managed-pr-agent": ZH_AGENT_ROLE_TEXT_BY_NAME["PR Agent"],
    "company-planner": ZH_AGENT_ROLE_TEXT_BY_NAME["Company Planner"],
    "customer-ops-lead": ZH_AGENT_ROLE_TEXT_BY_NAME["Customer Ops Lead"],
    "data-scientist": ZH_AGENT_ROLE_TEXT_BY_NAME["Data Scientist / Analyst"],
    "devops-sre-engineer": ZH_AGENT_ROLE_TEXT_BY_NAME["DevOps / SRE Engineer"],
    "engineering-manager": ZH_AGENT_ROLE_TEXT_BY_NAME["Engineering Manager"],
    "founder-office-operator": ZH_AGENT_ROLE_TEXT_BY_NAME["Founder Office Operator"],
    "growth-operator": ZH_AGENT_ROLE_TEXT_BY_NAME["Growth Operator"],
    "hardware-engineer": ZH_AGENT_ROLE_TEXT_BY_NAME["Hardware Engineer"],
    marketing: ZH_AGENT_ROLE_TEXT_BY_NAME["Marketing Specialist"],
    product_manager: ZH_AGENT_ROLE_TEXT_BY_NAME["Product Manager"],
    "product-manager": ZH_AGENT_ROLE_TEXT_BY_NAME["Product Manager"],
    project_manager: ZH_AGENT_ROLE_TEXT_BY_NAME["Project Manager"],
    "qa-test-engineer": ZH_AGENT_ROLE_TEXT_BY_NAME["System QA"],
    researcher: ZH_AGENT_ROLE_TEXT_BY_NAME.Researcher,
    reviewer: ZH_AGENT_ROLE_TEXT_BY_NAME["Code Reviewer"],
    security_analyst: ZH_AGENT_ROLE_TEXT_BY_NAME["Security Analyst"],
    "software-engineer": ZH_AGENT_ROLE_TEXT_BY_NAME["Software Engineer"],
    support: ZH_AGENT_ROLE_TEXT_BY_NAME["Support Agent"],
    "technical-director": ZH_AGENT_ROLE_TEXT_BY_NAME["Technical Director"],
    "technical-writer": ZH_AGENT_ROLE_TEXT_BY_NAME["Technical Writer"],
    tester: ZH_AGENT_ROLE_TEXT_BY_NAME.Tester,
    "twin-software-engineer": {
      name: "软件工程师画像",
      description: "面向软件工程师的数字分身，处理代码评审、PR 分流、测试和技术文档。",
    },
    "vp-engineering": ZH_AGENT_ROLE_TEXT_BY_NAME["VP of Engineering"],
  writer: ZH_AGENT_ROLE_TEXT_BY_NAME["Content Writer"],
};

/**
 * Some managed agents are persisted with the language that was active when
 * they were created. Keep product-provided and known template-derived roles
 * bilingual at render time instead of leaking that stored language into the
 * other locale.
 */
const EN_AGENT_ROLE_TEXT_BY_NAME: Record<string, LocalizedAgentRoleText> = {
  "软件工程师画像": {
    name: "Software Engineer Twin",
    description:
      "Digital twin for software engineers. Handles code reviews, PR triage, testing, and technical documentation.",
  },
  "软件工程师 画像": {
    name: "Software Engineer Twin",
    description:
      "Digital twin for software engineers. Handles code reviews, PR triage, testing, and technical documentation.",
  },
  "高水平设计师": {
    name: "Senior Designer",
    description: "A highly capable designer for polished product and visual work.",
  },
  "缺陷分诊智能体": {
    name: "Bug Triage Agent",
    description:
      "Reviews incoming defects, determines priority, and produces evidence-based triage summaries.",
  },
  "团队问答智能体": {
    name: "Team Q&A Agent",
    description:
      "Answers common team questions using approved documents and files in the workspace.",
  },
  "晨间规划智能体": {
    name: "Morning Planning Agent",
    description:
      "Organizes calendars, tasks, and inbox context into a clear daily action plan.",
  },
  "叫醒闹钟智能体": {
    name: "Wake-up Alarm Agent",
    description: "Creates and manages wake-up alarms.",
  },
  "Pr Agent": {
    name: "PR Agent",
    description: "Writes, polishes, and reviews public relations copy.",
  },
};

const EN_AGENT_ROLE_TEXT_BY_ID: Record<string, LocalizedAgentRoleText> = {
  "managed-pitch-agent": {
    name: "Pitch Agent",
    description:
      "Creates pitch materials from company, market, comparable-company, and deal context.",
  },
  "managed-market-researcher": {
    name: "Market Researcher",
    description:
      "Researches sectors, companies, catalysts, and market signals with a source trail.",
  },
  "managed-pr-agent": EN_AGENT_ROLE_TEXT_BY_NAME["Pr Agent"],
  "twin-software-engineer": EN_AGENT_ROLE_TEXT_BY_NAME["软件工程师画像"],
};

const EN_AGENT_ROLE_TEXT_BY_SOURCE_TEMPLATE_ID: Record<
  string,
  LocalizedAgentRoleText
> = {
  "finance-pitch-agent": EN_AGENT_ROLE_TEXT_BY_ID["managed-pitch-agent"],
  "finance-market-researcher":
    EN_AGENT_ROLE_TEXT_BY_ID["managed-market-researcher"],
  "software-engineer": EN_AGENT_ROLE_TEXT_BY_ID["twin-software-engineer"],
};

const ZH_CAPABILITY_LABELS: Record<string, string> = {
    analyze: "分析",
    build: "构建",
    code: "代码",
    communicate: "沟通",
    debug: "调试",
    design: "设计",
    document: "文档",
    manage: "管理",
    market: "营销",
    ops: "运维",
    plan: "规划",
    product: "产品",
    research: "研究",
    review: "评审",
    security: "安全",
    test: "测试",
    write: "写作",
  };

const EN_CAPABILITY_LABELS: Record<string, string> = {
    analyze: "Analyze",
    build: "Build",
    code: "Code",
    communicate: "Communicate",
    debug: "Debug",
    design: "Design",
    document: "Document",
    manage: "Manage",
    market: "Market",
    ops: "Ops",
    plan: "Plan",
    product: "Product",
    research: "Research",
    review: "Review",
    security: "Security",
    test: "Test",
    write: "Write",
  };

const ZH_AUTONOMY_LABELS: Record<string, string> = { lead: "负责人", specialist: "专家", intern: "助理" };

export function getLocalizedAgentRoleText(
  role: AgentRoleDisplayLike,
  language = getCurrentLanguage(),
): LocalizedAgentRoleText {
  const fallbackName = role.displayName || role.name;
  const fallbackDescription = role.description || "";
  if (language !== "zh-CN") {
    const localized =
      EN_AGENT_ROLE_TEXT_BY_ID[role.name] ||
      (role.id ? EN_AGENT_ROLE_TEXT_BY_ID[role.id] : undefined) ||
      (role.sourceTemplateId
        ? EN_AGENT_ROLE_TEXT_BY_SOURCE_TEMPLATE_ID[role.sourceTemplateId]
        : undefined) ||
      EN_AGENT_ROLE_TEXT_BY_NAME[role.displayName] ||
      EN_AGENT_ROLE_TEXT_BY_NAME[role.name];

    return {
      name: localized?.name || fallbackName,
      description: localized?.description || fallbackDescription,
    };
  }

  const localized =
    ZH_AGENT_ROLE_TEXT_BY_ID[role.name] ||
    ZH_AGENT_ROLE_TEXT_BY_NAME[role.displayName] ||
    ZH_AGENT_ROLE_TEXT_BY_NAME[role.name];

  return {
    name: localized?.name || fallbackName,
    description: localized?.description || fallbackDescription,
  };
}

export function getLocalizedSubagentDisplay(
  title: string,
  language = getCurrentLanguage(),
  role?: AgentRoleDisplayLike,
): LocalizedSubagentDisplay {
  const normalizedTitle = title.trim();
  if (language !== "zh-CN") {
    return {
      name: normalizedTitle,
      profileName: "",
      codename: "",
      description: "",
    };
  }

  const callsignMatch = normalizedTitle.match(
    /^(.*?)\s*\((builder|inspector|explorer|planner|designer|writer|synthesizer|agent)\)\s*$/i,
  );
  const callsign = callsignMatch?.[2]?.toLowerCase() || "";
  const codename = callsignMatch?.[1]?.trim() || "";
  const fallbackRole = callsign ? ZH_SUBAGENT_ROLE_BY_CALLSIGN[callsign] : null;
  let localizedProfile: LocalizedAgentRoleText | null = null;

  if (role) {
    const localizedRole = getLocalizedAgentRoleText(role, language);
    const originalRoleName = role.displayName || role.name;
    const hasChineseRoleName = /[\u3400-\u9fff]/.test(localizedRole.name);
    if (hasChineseRoleName || localizedRole.name !== originalRoleName) {
      localizedProfile = localizedRole;
    }
  }

  if (fallbackRole) {
    return {
      name: fallbackRole.name,
      profileName:
        localizedProfile?.name && localizedProfile.name !== fallbackRole.name
          ? localizedProfile.name
          : "",
      codename,
      description: fallbackRole.description,
    };
  }

  const localizedTitle = getLocalizedAgentRoleName(normalizedTitle, language);
  if (localizedTitle !== normalizedTitle) {
    const localizedTitleText = getLocalizedAgentRoleText(
      { name: normalizedTitle, displayName: normalizedTitle },
      language,
    );
    return {
      name: localizedTitle,
      profileName: "",
      codename: "",
      description: localizedTitleText.description,
    };
  }

  if (localizedProfile) {
    return {
      name: localizedProfile.name,
      profileName: "",
      codename: "",
      description: localizedProfile.description,
    };
  }

  return {
    name: normalizedTitle,
    profileName: "",
    codename: "",
    description: "",
  };
}

/** Translate only known, product-provided agent role labels. */
export function getLocalizedAgentRoleName(
  name: string,
  language = getCurrentLanguage(),
): string {
  if (language !== "zh-CN") return name;
  return (
    ZH_AGENT_ROLE_TEXT_BY_NAME[name]?.name ||
    ZH_AGENT_ROLE_TEXT_BY_ID[name]?.name ||
    name
  );
}

export function getLocalizedAgentCapability(
  capability: AgentCapability | string,
): string {
  if (getCurrentLanguage() !== "zh-CN")
    return EN_CAPABILITY_LABELS[String(capability)] || String(capability);
  return ZH_CAPABILITY_LABELS[String(capability)] || String(capability);
}

export function getLocalizedAutonomyLabel(level?: string): string {
  if (!level) return "";
  if (getCurrentLanguage() !== "zh-CN") {
    if (level === "lead") return "LEAD";
    if (level === "specialist") return "SPC";
    return "INT";
  }
  return ZH_AUTONOMY_LABELS[level] || level;
}

export function getLocalizedCompanyOperatorTemplateName(name: string): string {
  if (getCurrentLanguage() !== "zh-CN") return name;
  return ZH_AGENT_ROLE_TEXT_BY_NAME[name]?.name || name;
}
