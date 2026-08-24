import type { ComponentType } from "react";
import type { LucideProps } from "lucide-react";
import {
  BarChart3,
  Bot,
  Brain,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  CalendarSearch,
  ClipboardCheck,
  CircleDollarSign,
  Code2,
  FileChartColumn,
  FileSpreadsheet,
  Files,
  Gamepad2,
  GitBranch,
  Globe2,
  Handshake,
  Headphones,
  Landmark,
  Library,
  LifeBuoy,
  Lightbulb,
  Link2,
  Megaphone,
  MessageCircle,
  MessageSquareText,
  Microscope,
  MousePointer2,
  Network,
  Package,
  PenTool,
  Plug,
  Radar,
  ReceiptText,
  Rocket,
  Scale,
  ScanSearch,
  SearchCheck,
  ShieldCheck,
  Smartphone,
  TableProperties,
  Target,
  Telescope,
  TestTube2,
  UserSearch,
  UsersRound,
  WandSparkles,
  Workflow,
  Wrench,
} from "lucide-react";

export type SemanticIconTone =
  | "blue"
  | "indigo"
  | "violet"
  | "cyan"
  | "teal"
  | "green"
  | "amber"
  | "orange"
  | "rose"
  | "slate";

export interface SemanticIconVisual {
  Icon: ComponentType<LucideProps>;
  tone: SemanticIconTone;
}

interface SemanticIconInput {
  id?: string;
  name: string;
  description?: string;
  category?: string;
  fallback?: ComponentType<LucideProps>;
}

const hasAny = (text: string, terms: string[]): boolean =>
  terms.some((term) => text.includes(term));

/**
 * Maps capability names to a consistent product icon language.
 * Specific product concepts are checked before broad categories so that,
 * for example, "competitor monitoring" does not collapse into research.
 */
export function getSemanticIconVisual({
  id = "",
  name,
  description = "",
  category = "",
  fallback = Package,
}: SemanticIconInput): SemanticIconVisual {
  const text = `${id} ${name} ${description} ${category}`.toLocaleLowerCase();

  if (hasAny(text, ["task-guidelines", "task guidelines", "任务准则"]))
    return { Icon: ClipboardCheck, tone: "blue" };
  if (hasAny(text, ["autobrowse", "自动浏览", "网页浏览"]))
    return { Icon: MousePointer2, tone: "cyan" };
  if (hasAny(text, ["calendar prep", "calendar", "日程准备", "会议简报"]))
    return { Icon: CalendarDays, tone: "blue" };
  if (hasAny(text, ["slack action", "slack", "行动项", "消息待办"]))
    return { Icon: MessageSquareText, tone: "cyan" };
  if (hasAny(text, ["animation", "动效"]))
    return { Icon: WandSparkles, tone: "violet" };
  if (hasAny(text, ["humanizer", "文本自然化", "改写文本"]))
    return { Icon: MessageCircle, tone: "teal" };
  if (hasAny(text, ["imagegen", "网页设计参考", "前端网页"]))
    return { Icon: Globe2, tone: "indigo" };
  if (hasAny(text, ["csv", "spreadsheet", "电子表格"]))
    return { Icon: FileSpreadsheet, tone: "green" };
  if (hasAny(text, ["compare files", "文件对比", "文件比较"]))
    return { Icon: Files, tone: "indigo" };
  if (hasAny(text, ["table", "表格"]))
    return { Icon: TableProperties, tone: "teal" };

  if (
    hasAny(text, ["ai governance", "ai 治理", "governance legal", "治理法务"])
  )
    return { Icon: ShieldCheck, tone: "violet" };
  if (hasAny(text, ["codex security", "security scan", "安全扫描", "代码安全"]))
    return { Icon: ShieldCheck, tone: "rose" };
  if (hasAny(text, ["commercial legal", "商业法务", "商务合同"]))
    return { Icon: Handshake, tone: "amber" };
  if (hasAny(text, ["corporate legal", "公司法务", "企业法务"]))
    return { Icon: Building2, tone: "indigo" };
  if (hasAny(text, ["employment legal", "劳动法", "雇佣法", "招聘"]))
    return { Icon: UserSearch, tone: "teal" };
  if (hasAny(text, ["law student", "法律学生", "法学生"]))
    return { Icon: Library, tone: "indigo" };
  if (hasAny(text, ["legal builder", "法律构建", "法务构建"]))
    return { Icon: Wrench, tone: "violet" };
  if (hasAny(text, ["privacy legal", "隐私法", "隐私合规"]))
    return { Icon: ShieldCheck, tone: "indigo" };
  if (hasAny(text, ["regulatory legal", "监管法", "监管合规"]))
    return { Icon: Landmark, tone: "amber" };
  if (hasAny(text, ["legal guardrail", "法律护栏", "法务护栏"]))
    return { Icon: ShieldCheck, tone: "amber" };
  if (hasAny(text, ["legal", "law", "counsel", "法务", "法律", "合同", "诉讼"]))
    return { Icon: Scale, tone: "amber" };

  if (hasAny(text, ["content & marketing", "content marketing", "内容营销"]))
    return { Icon: Megaphone, tone: "rose" };
  if (hasAny(text, ["customer support", "客户支持", "客服", "ticket triage"]))
    return { Icon: Headphones, tone: "cyan" };
  if (hasAny(text, ["devops", "ci/cd", "deployment", "部署运维", "持续集成"]))
    return { Icon: GitBranch, tone: "violet" };
  if (hasAny(text, ["engineering management", "工程管理"]))
    return { Icon: UsersRound, tone: "indigo" };
  if (hasAny(text, ["mobile development", "移动开发"]))
    return { Icon: Smartphone, tone: "violet" };
  if (hasAny(text, ["game development", "游戏开发"]))
    return { Icon: Gamepad2, tone: "violet" };
  if (hasAny(text, ["qa & testing", "qa testing", "质量测试", "测试工程"]))
    return { Icon: TestTube2, tone: "teal" };
  if (hasAny(text, ["product management", "产品管理"]))
    return { Icon: Target, tone: "blue" };
  if (
    hasAny(text, [
      "engineering",
      "software development",
      "代码开发",
      "工程研发",
    ])
  )
    return { Icon: Code2, tone: "blue" };
  if (hasAny(text, ["sales crm", "销售 crm", "销售管理"]))
    return { Icon: BriefcaseBusiness, tone: "orange" };
  if (hasAny(text, ["technical writing", "技术写作"]))
    return { Icon: PenTool, tone: "indigo" };
  if (hasAny(text, ["shortcuts", "快捷方式", "快捷命令"]))
    return { Icon: Rocket, tone: "orange" };

  if (hasAny(text, ["recent n day", "recent days", "最近 n 天", "近期研究"]))
    return { Icon: CalendarSearch, tone: "blue" };
  if (
    hasAny(text, [
      "automatic research report",
      "automated research report",
      "自动研究报告",
    ])
  )
    return { Icon: FileChartColumn, tone: "indigo" };
  if (
    hasAny(text, [
      "competitor monitoring",
      "competitive monitoring",
      "竞品动态",
    ])
  )
    return { Icon: Radar, tone: "orange" };
  if (hasAny(text, ["competitor research", "竞品研究"]))
    return { Icon: Telescope, tone: "violet" };
  if (hasAny(text, ["multi-agent", "multi agent", "多智能体", "多代理"]))
    return { Icon: Network, tone: "violet" };
  if (hasAny(text, ["cross-platform", "cross platform", "跨平台研究"]))
    return { Icon: Network, tone: "cyan" };
  if (hasAny(text, ["idea validation", "验证想法"]))
    return { Icon: Lightbulb, tone: "amber" };
  if (hasAny(text, ["link research", "链接研究"]))
    return { Icon: Link2, tone: "cyan" };
  if (hasAny(text, ["knowledge base", "知识库"]))
    return { Icon: Brain, tone: "violet" };
  if (hasAny(text, ["recursive search", "递归搜索"]))
    return { Icon: ScanSearch, tone: "indigo" };
  if (hasAny(text, ["executive brief", "高管简报"]))
    return { Icon: BriefcaseBusiness, tone: "blue" };

  if (
    hasAny(text, [
      "equity research",
      "investment",
      "wealth management",
      "股票研究",
      "投资",
      "财富管理",
    ])
  )
    return { Icon: CircleDollarSign, tone: "green" };
  if (hasAny(text, ["fund administration", "基金行政", "基金管理"]))
    return { Icon: ReceiptText, tone: "green" };
  if (
    hasAny(text, [
      "financial analysis",
      "data analysis",
      "财务分析",
      "数据分析",
    ])
  )
    return { Icon: BarChart3, tone: "green" };
  if (hasAny(text, ["kyc", "risk & compliance", "risk compliance", "风险合规"]))
    return { Icon: ShieldCheck, tone: "teal" };
  if (hasAny(text, ["smb", "small business", "小微企业", "中小企业"]))
    return { Icon: Building2, tone: "blue" };
  if (hasAny(text, ["research report", "研究报告"]))
    return { Icon: FileChartColumn, tone: "indigo" };
  if (hasAny(text, ["research", "研究"]))
    return { Icon: Microscope, tone: "blue" };

  if (hasAny(text, ["search", "搜索"]))
    return { Icon: SearchCheck, tone: "cyan" };
  if (hasAny(text, ["database", "数据库"]))
    return { Icon: BarChart3, tone: "teal" };
  if (hasAny(text, ["automation", "workflow", "自动化", "工作流"]))
    return { Icon: Workflow, tone: "violet" };
  if (hasAny(text, ["channel", "通讯", "消息"]))
    return { Icon: MessageCircle, tone: "cyan" };
  if (hasAny(text, ["integration", "connector", "集成", "连接器"]))
    return { Icon: Plug, tone: "teal" };
  if (hasAny(text, ["provider", "模型服务", "服务商"]))
    return { Icon: Bot, tone: "violet" };
  if (hasAny(text, ["tool", "工具"])) return { Icon: Wrench, tone: "blue" };
  if (hasAny(text, ["support", "帮助"]))
    return { Icon: LifeBuoy, tone: "cyan" };

  return { Icon: fallback, tone: "blue" };
}
