import type {
  CustomSkill,
  SkillParameter,
  SkillRegistryEntry,
  SkillStatusEntry,
} from "../../shared/types";
import { getCurrentLanguage, type SupportedLanguage } from "../i18n";
import { normalizeInternalToolNamesForDisplay } from "./internal-tool-display";

type SkillDisplayLike = Pick<
  CustomSkill | SkillRegistryEntry | SkillStatusEntry,
  "id" | "name"
> & {
  description?: string;
  category?: string;
  source?: string;
};

interface LocalizedSkillText {
  name: string;
  description: string;
  category?: string;
  source?: string;
}

interface LocalizedSkillParameterText {
  name: string;
  description: string;
  options?: string[];
}

type SkillRoutingDisplayLike = {
  useWhen?: string;
  outputs?: string;
  successCriteria?: string;
};

export interface LocalizedSkillRoutingText {
  useWhen: string;
  outputs: string;
  successCriteria: string;
}

export interface LocalizedSkillComposerPromptOptions {
  /** Raw upstream example used only when the UI language is not Chinese. */
  preferredPrompt?: string;
  /** Already-localized parameter lines, without the section heading. */
  parameterLines?: string[];
  /** Add an editable task brief when the skill has no parameters. */
  includeTaskPlaceholder?: boolean;
  /** Optional per-surface language override. */
  language?: SupportedLanguage;
}

const ZH_CATEGORY_LABELS: Record<string, string> = {
  Automation: "自动化",
  Creative: "创意",
  Data: "数据",
  "Digital Twin": "数字分身",
  Documentation: "文档",
  Development: "开发",
  development: "开发",
  DevOps: "运维",
  Engineering: "工程",
  Finance: "金融",
  Guidelines: "准则",
  Imported: "已导入",
  Learning: "学习",
  Legal: "法务",
  Marketing: "营销",
  Planning: "规划",
  Product: "产品",
  Productivity: "效率",
  Project: "项目",
  Research: "研究",
  Security: "安全",
  Tools: "工具",
  "Use Cases": "场景",
  Utilities: "实用工具",
  Writing: "写作",
};

const ZH_SOURCE_LABELS: Record<string, string> = {
  bundled: "内置",
  managed: "已安装",
  workspace: "工作区",
  external: "外部",
  neoworker: "NeoWorker",
  clawhub: "ClawHub",
};

const ZH_SKILL_TEXT_BY_ID: Record<
  string,
  { name: string; description: string }
> = {
  "1password": {
    name: "1Password 密钥管理",
    description:
      "设置并使用 1Password CLI，完成登录、读取密钥、注入环境变量和运行命令。",
  },
  "add-documentation": {
    name: "补全文档注释",
    description: "为函数、类和模块生成 JSDoc、docstring 或说明文档。",
  },
  "agentic-image-loop": {
    name: "智能图像迭代",
    description: "生成图像、标注问题、继续细化，并循环产出更好的视觉结果。",
  },
  "ai-governance-legal-ai-inventory": {
    name: "AI 治理法务 · AI 系统台账",
    description:
      "按照《欧盟人工智能法案》建立 AI 系统台账，记录每个系统的用途、责任角色、供应商和部署信息。",
  },
  "ai-governance-legal-aia-generation": {
    name: "AI 治理法务 · AI 影响评估",
    description:
      "开展 AI 影响评估，完成信息收集、风险分析、适用法规分类、政策差距识别和改进建议。",
  },
  "ai-governance-legal-cold-start-interview": {
    name: "AI 治理法务 · 初始配置访谈",
    description:
      "通过简短访谈了解组织的 AI 治理实践，并生成后续工作流所需的基础配置。",
  },
  "ai-governance-legal-customize": {
    name: "AI 治理法务 · 工作流配置",
    description:
      "根据组织现状调整 AI 治理配置、风险定位和工作流程，无需重新完成初始访谈。",
  },
  "analyze-csv": {
    name: "分析 CSV",
    description: "读取 CSV 文件，提取统计洞察、异常和可行动结论。",
  },
  "android-development": {
    name: "Android 开发",
    description:
      "处理 Android/Kotlin、Jetpack Compose、Room、Gradle、模拟器和上架相关工作。",
  },
  "apple-notes": {
    name: "Apple 备忘录",
    description:
      "通过 macOS 备忘录命令创建、搜索、编辑、删除、移动和导出笔记。",
  },
  "apple-reminders": {
    name: "Apple 提醒事项",
    description: "管理 Apple 提醒事项，包括列表、添加、编辑、完成和删除任务。",
  },
  "architecture-design": {
    name: "建筑概念设计",
    description: "联动 Rhino、Blender 和 ComfyUI，完成建筑概念方案工作流。",
  },
  "architecture-diagram": {
    name: "架构图",
    description: "生成清晰、分组明确、连接关系可读的系统架构图。",
  },
  aurl: {
    name: "API 转命令",
    description: "把 OpenAPI 或 GraphQL 接口注册成可探索、可调用的命令。",
  },
  autobrowse: {
    name: "自动浏览",
    description: "通过真实网页任务学习稳定浏览器流程，并沉淀为可复用技能。",
  },
  "autoresearch-report": {
    name: "自动研究报告",
    description:
      "自动界定研究问题、检索证据、建立来源清单，并生成带引用的研究报告。",
  },
  batch: {
    name: "批处理",
    description: "规划并执行并行、可重复的迁移、整理、研究或混合任务。",
  },
  bird: {
    name: "X/Twitter 内容管理",
    description: "通过命令读取、搜索、发布和互动 X/Twitter 内容。",
  },
  blogwatcher: {
    name: "博客监控",
    description: "监控博客、RSS 和 Atom 订阅源的更新。",
  },
  "build-mode": {
    name: "构建模式",
    description: "把想法按概念、计划、搭建、迭代几个阶段推进成可运行原型。",
  },
  calendly: {
    name: "Calendly 预约管理",
    description:
      "管理 Calendly 活动类型、预约、可用时间、取消改期和一次性链接。",
  },
  "clean-imports": {
    name: "清理导入",
    description: "删除代码文件中的未使用 import。",
  },
  "cloud-migration": {
    name: "云迁移",
    description:
      "制定和执行云迁移方案，包括评估、数据库迁移、网络切换和多云规划。",
  },
  "code-review": {
    name: "代码审查",
    description: "检查代码最佳实践、潜在缺陷、回归风险和测试缺口。",
  },
  "code-reviewer": {
    name: "专业代码审查",
    description: "对本地改动或 GitHub PR 进行专业级代码审查。",
  },
  "codex-cli": {
    name: "Codex CLI 智能体",
    description: "安装、配置并以后台智能体方式运行 OpenAI Codex CLI。",
  },
  "coding-agent": {
    name: "编码智能体",
    description: "通过后台进程运行 Codex CLI、OpenCode 或 Pi Coding Agent。",
  },
  "compare-files": {
    name: "比较文件",
    description: "比较两个文件并展示差异。",
  },
  "competitive-research": {
    name: "竞品研究",
    description: "研究产品、市场或想法的竞争对手，并找到差异化机会。",
  },
  "content-monitor": {
    name: "内容监控",
    description: "监控网页变化，按计划提取更新内容。",
  },
  "convert-code": {
    name: "代码转换",
    description: "把代码从一种语言转换为另一种语言。",
  },
  "neoworker-multi-agent-research": {
    name: "NeoWorker 多智能体研究",
    description:
      "研究多智能体论文、框架和案例，并给出适合 NeoWorker 的落地建议。",
  },
  "crypto-trading": {
    name: "加密交易",
    description: "使用 ccxt 查询加密资产价格、余额和订单，覆盖多家交易所。",
  },
  "crypto-execution": {
    name: "加密货币下单执行",
    description:
      "通过 Binance、Bybit 或 Coinbase 直接提交加密货币市价单或限价单。",
  },
  "dcf-valuation": {
    name: "DCF 估值",
    description: "进行贴现现金流估值、WACC 计算、自由现金流预测和敏感性分析。",
  },
  "debug-error": {
    name: "调试错误",
    description: "分析错误信息、定位原因并建议修复方案。",
  },
  "dependency-check": {
    name: "依赖检查",
    description: "审计依赖更新和安全漏洞。",
  },
  "developer-growth-analysis": {
    name: "开发成长分析",
    description: "分析近期编码模式，并生成个性化开发者成长报告。",
  },
  "docker-compose-ops": {
    name: "Docker Compose 运维",
    description:
      "处理 Compose 服务编排、配置文件、镜像构建、网络、卷和生产部署。",
  },
  "earnings-analyzer": {
    name: "财报分析",
    description:
      "分析季度和年度财报，包括 EPS、收入、利润率、指引和管理层表述。",
  },
  "email-marketing-bible": {
    name: "邮件营销顾问",
    description: "提供邮件营销审计、唤回流程、文案、送达率、合规和平台策略。",
  },
  "esg-scorer": {
    name: "ESG 评分",
    description: "基于 SASB、TCFD、碳足迹和可持续指标进行 ESG 评估。",
  },
  "explain-code": {
    name: "解释代码",
    description: "详细解释代码的结构、逻辑和运行方式。",
  },
  "extract-todos": {
    name: "提取 TODO",
    description: "在代码库中查找 TODO、FIXME 和待办注释。",
  },
  "financial-modeling": {
    name: "财务建模",
    description: "构建和分析三表模型、情景假设、关键驱动因素和预测。",
  },
  frontend: {
    name: "高级前端",
    description:
      "在视觉方向、层级、克制感、图片和动效都重要时设计并实现前端界面。",
  },
  "frontend-design": {
    name: "前端设计",
    description: "设计并构建有明确审美方向的生产级前端界面。",
  },
  "game-performance": {
    name: "游戏性能优化",
    description: "跨引擎优化绘制调用、LOD、对象池、GPU、内存和平台性能。",
  },
  gemini: {
    name: "Gemini 命令行助手",
    description: "用 Gemini CLI 做一次性问答、摘要和生成任务。",
  },
  "generate-readme": {
    name: "生成 README",
    description: "为项目创建 README.md。",
  },
  "git-commit": {
    name: "Git 提交信息",
    description: "根据已暂存改动生成规范、清晰的提交信息。",
  },
  github: {
    name: "GitHub 项目协作",
    description: "通过 gh 命令管理 issue、PR、CI 运行和 GitHub API 查询。",
  },
  gog: {
    name: "Google 邮件与办公套件",
    description: "操作 Gmail、日历、Drive、联系人、任务、表格、文档和幻灯片。",
  },
  goplaces: {
    name: "Google 地点查询",
    description: "查询地点、详情、评价和位置数据。",
  },
  himalaya: {
    name: "邮件 CLI",
    description:
      "通过 IMAP/SMTP 列出、阅读、编写、回复、转发、搜索和整理邮件。",
  },
  humanizer: {
    name: "文本自然化",
    description: "把 AI 味较重的文本改写得更自然、更像真人表达。",
  },
  "idea-validation": {
    name: "想法验证",
    description:
      "通过市场、竞品和需求研究验证商业或产品想法，并给出 go/no-go 建议。",
  },
  "imagegen-frontend-web": {
    name: "网页设计参考图",
    description: "为营销页、产品页和高质感网页生成分区设计参考图。",
  },
  imsg: {
    name: "iMessage",
    description: "列出聊天、查看历史、监听消息并发送 iMessage/SMS。",
  },
  "ios-development": {
    name: "iOS 开发",
    description:
      "处理 SwiftUI、UIKit、Core Data、Xcode 构建、模拟器和上架流程。",
  },
  kami: {
    name: "Kami 排版",
    description: "在用户明确要求 Kami 时，使用 Kami 编辑设计系统排版文档。",
  },
  "karpathy-guidelines": {
    name: "任务准则",
    description: "为编码、调试、审查和重构任务提供克制、可验证的执行护栏。",
  },
  "kubernetes-ops": {
    name: "Kubernetes 运维",
    description: "处理 kubectl、清单、Helm、RBAC、调试和部署策略。",
  },
  "lead-scraper": {
    name: "线索抓取",
    description: "从目录页和公司网站提取企业与联系人信息。",
  },
  learn: {
    name: "学习记忆",
    description: "手动记录洞察、纠正、偏好或规则，供后续任务记住。",
  },
  "legal-contract-negotiation-review": {
    name: "合同谈判审查",
    description: "对照协议和附件分析对方修改，标出冲突并生成分级反建议。",
  },
  "legal-demand-letter-response-draft": {
    name: "律师函回复草稿",
    description: "把指控映射到合同语言，起草避免不当承认的回复函。",
  },
  "legal-verified-research-memo": {
    name: "可核验法律研究备忘录",
    description: "生成带来源核验、置信度标记和优先权威依据的法律研究备忘录。",
  },
  "link-research": {
    name: "链接研究",
    description: "处理消息中的链接，抓取每个 URL，并生成结构化发现报告。",
  },
  "llm-wiki": {
    name: "LLM 知识库",
    description:
      "按 Karpathy LLM Wiki 模式建立本地研究知识库，保存来源、笔记和维护记录。",
  },
  "local-places": {
    name: "本地点位搜索",
    description: "通过本地 Google Places 代理搜索餐厅、咖啡馆等地点。",
  },
  "local-websearch": {
    name: "本地网页搜索",
    description: "通过自托管 SearXNG 元搜索引擎进行隐私友好的网页搜索。",
  },
  "market-screener": {
    name: "市场筛选器",
    description: "按基本面、技术面和量化条件筛选股票、ETF 和债券。",
  },
  "marketing-strategist": {
    name: "营销策略顾问",
    description:
      "覆盖定位、文案、SEO、CRO、广告、漏斗、增长和上市策略的营销顾问。",
  },
  mcporter: {
    name: "MCP 管理",
    description: "列出、配置、认证和调用 MCP 服务器及工具。",
  },
  "memory-kit": {
    name: "记忆套件",
    description:
      "创建工作区本地 .neoworker 记忆套件，包括规则、身份、长期笔记和日志。",
  },
  "model-usage": {
    name: "模型用量",
    description: "汇总 Codex 或 Claude 的模型级用量和费用。",
  },
  moltbook: {
    name: "Moltbook 智能体社区",
    description: "参与 AI 智能体社交网络，发布、回复、浏览、投票和关注。",
  },
  "multi-pr-review": {
    name: "多智能体 PR 审查",
    description: "对 PR 进行共识式多智能体审查，并按严重程度输出发现。",
  },
  "nano-pdf": {
    name: "PDF 编辑",
    description: "用自然语言通过 nano-pdf 命令编辑 PDF。",
  },
  notion: {
    name: "Notion 页面与数据库",
    description: "使用 Notion API 创建和管理页面、数据库和块。",
  },
  "officecli-default": {
    name: "Office 文档处理引擎",
    description:
      "使用内置 OfficeCLI 读取、创建、修改并质检 Word、Excel 和 PowerPoint 文件。",
  },
  novelist: {
    name: "小说创作",
    description: "以较自主流程起草、修改并整理小说成果。",
  },
  "openai-image-gen": {
    name: "OpenAI 图像生成",
    description: "批量调用 OpenAI Images API 生成图片，并创建本地图库。",
  },
  "openai-whisper": {
    name: "本地 Whisper 转写",
    description: "用本地 Whisper CLI 进行语音转文字，无需 API Key。",
  },
  "openai-whisper-api": {
    name: "Whisper API 转写",
    description: "通过 OpenAI 音频转写 API 转录音频。",
  },
  ordercli: {
    name: "外卖订单查询",
    description: "查询 Foodora 历史订单和当前订单状态。",
  },
  peekaboo: {
    name: "macOS 界面自动化",
    description: "通过 Peekaboo 捕获和自动操作 macOS 界面。",
  },
  "pi-context-pipeline": {
    name: "Pi 上下文流水线",
    description:
      "组织 pi-finder 和 pi-librarian 生成紧凑上下文包和 Codex 启动提示。",
  },
  "pi-finder-subagent": {
    name: "Pi 本地侦察子智能体",
    description: "只读扫描本地工作区，快速缩小相关文件和片段范围。",
  },
  "pi-librarian": {
    name: "Pi GitHub 资料员",
    description: "使用 gh 工作流研究 GitHub 仓库，并引用相关文件。",
  },
  "playwright-qa": {
    name: "Playwright 视觉 QA",
    description: "像真实用户一样导航应用、截图、发现问题并辅助修复。",
  },
  polymarket: {
    name: "Polymarket 预测市场查询",
    description: "查询预测市场、赔率、价格、热门事件、订单簿和成交量。",
  },
  "portfolio-optimizer": {
    name: "投资组合优化",
    description: "进行均值方差、Black-Litterman、风险平价和有效前沿优化。",
  },
  prd: { name: "产品需求文档", description: "根据功能请求生成结构化 PRD。" },
  "price-tracker": {
    name: "价格追踪",
    description: "跨电商网站追踪并比较价格。",
  },
  "project-structure": {
    name: "项目结构分析",
    description: "分析并解释项目架构和目录组织。",
  },
  proofread: {
    name: "校对润色",
    description: "检查文档语法、清晰度和表达质量。",
  },
  "react-best-practices": {
    name: "React 最佳实践",
    description: "为 React 和 Next.js 改动提供性能、结构和实现建议。",
  },
  "react-native-skills": {
    name: "React Native 技能",
    description:
      "提供 React Native 和 Expo 性能、动效、UI 模式与原生集成实践。",
  },
  "refactor-code": {
    name: "重构代码",
    description: "在保持行为的前提下改善代码结构和可读性。",
  },
  "rename-symbol": {
    name: "重命名符号",
    description: "跨文件重命名变量、函数或符号。",
  },
  "research-last-days": {
    name: "最近 N 天研究",
    description: "用网页搜索研究过去若干天的主题、新闻和趋势。",
  },
  "risk-analyzer": {
    name: "风险分析",
    description: "分析投资组合 VaR、CVaR、压力测试、回撤和因子暴露。",
  },
  sag: {
    name: "语音合成",
    description: "用 ElevenLabs 文本转语音，并提供 macOS say 风格体验。",
  },
  "screenshot-capture": {
    name: "截图捕获",
    description: "捕获桌面、窗口或区域截图，并按系统规则保存。",
  },
  "security-audit": {
    name: "安全审计",
    description: "检查代码中的常见安全漏洞和风险。",
  },
  "session-logs": {
    name: "历史任务记录",
    description: "查询以往会话和任务记录。",
  },
  simplify: {
    name: "简化改进",
    description: "对代码、写作、研究或运营工作进行聚焦的简化改进。",
  },
  "site-mapper": {
    name: "网站地图",
    description: "爬取网站并生成页面摘要和结构化内容地图。",
  },
  "skill-creator": {
    name: "技能创建器",
    description: "创建或更新 NeoWorker 技能，支持结构、打包和元数据设计。",
  },
  "skill-hub": {
    name: "技能市场",
    description: "搜索、安装、更新和发布来自 skill-hub.com 的智能体技能。",
  },
  slack: {
    name: "Slack",
    description: "控制 Slack，包括回复、加反应、固定消息和处理频道或私信。",
  },
  "spotify-player": {
    name: "Spotify 播放器",
    description: "通过终端搜索、播放和控制 Spotify。",
  },
  "startup-cfo": {
    name: "创业 CFO",
    description: "为创业公司提供现金、跑道、单位经济、招聘 ROI 和预测分析。",
  },
  "stock-analysis": {
    name: "股票分析",
    description:
      "查询并分析股票、ETF 和加密资产的行情、基本面、技术指标和评级。",
  },
  summarize: {
    name: "总结",
    description: "总结或提取 URL、播客和本地文件中的文本内容。",
  },
  "summarize-folder": {
    name: "总结文件夹",
    description: "为文件夹中的所有文件生成摘要。",
  },
  "supabase-sdk-patterns": {
    name: "Supabase SDK 模式",
    description: "为 TypeScript 和 Python 项目应用生产级 Supabase SDK 实践。",
  },
  "taste-skill": {
    name: "前端审美方法",
    description: "应用更严格的前端布局、字体、动效和实现审美方法。",
  },
  "tax-optimizer": {
    name: "税务优化",
    description: "处理税损收割、资产位置、Roth 转换和慈善捐赠等税务策略。",
  },
  "terraform-ops": {
    name: "Terraform 运维",
    description:
      "处理 Terraform plan、apply、import、state、模块开发和漂移检测。",
  },
  "things-mac": {
    name: "Things 3 任务管理",
    description: "通过 macOS Things CLI 添加、更新、查询和管理任务与项目。",
  },
  tmux: {
    name: "tmux 控制",
    description: "远程控制 tmux 会话，发送按键并读取面板输出。",
  },
  translate: { name: "翻译", description: "把内容翻译成另一种语言。" },
  trello: {
    name: "Trello 看板管理",
    description: "通过 Trello REST API 管理看板、列表和卡片。",
  },
  "twin-decision-prep": {
    name: "数字分身决策准备",
    description: "为待决事项整理数据、选项、利弊和建议，减轻决策负担。",
  },
  "twin-meeting-prep": {
    name: "数字分身会议准备",
    description: "为会议准备相关背景、待办、数据点和发言要点。",
  },
  "twin-pr-triage": {
    name: "数字分身 PR 分诊",
    description: "扫描开放 PR，评估风险和复杂度，并生成优先审查队列。",
  },
  "twin-status-report": {
    name: "数字分身状态报告",
    description: "根据近期活动、任务、提交和对话生成简洁状态报告。",
  },
  twitter: {
    name: "X/Twitter 写作",
    description: "撰写适合 X 算法传播的推文和线程。",
  },
  unbroker: {
    name: "数据经纪人清理",
    description: "查找并移除数据经纪人和人物搜索网站中的个人信息暴露。",
  },
  "unity-development": {
    name: "Unity 开发",
    description:
      "处理 Unity/C#、脚本生命周期、资源、渲染管线、物理、UI 和构建。",
  },
  "unreal-development": {
    name: "Unreal Engine 开发",
    description:
      "处理 Unreal C++/蓝图、Gameplay Framework、Niagara、多人和打包。",
  },
  "usecase-booking-options": {
    name: "预约选项",
    description: "查找可预约时间，交叉检查日历，并提出 3 个候选选项。",
  },
  "usecase-chief-of-staff-briefing": {
    name: "幕僚长简报",
    description: "从日历、收件箱、任务和运营信号生成早晚高管简报。",
  },
  "usecase-dev-task-queue": {
    name: "开发任务队列",
    description: "从 issue 和 PR 创建可交给智能体执行的开发队列。",
  },
  "usecase-draft-reply": {
    name: "草拟回复",
    description: "总结聊天内容并草拟两个回复选项，发送前停止。",
  },
  "usecase-family-digest": {
    name: "家庭日摘要",
    description: "根据日历和任务起草每日家庭摘要，发送前停止。",
  },
  "usecase-figure-it-out-agent": {
    name: "问题攻关智能体",
    description: "用多工具和明确回退策略解决复杂问题，并保留可审计执行记录。",
  },
  "usecase-household-capture": {
    name: "家庭事项捕获",
    description: "把杂乱家庭消息整理成 Notion 任务和可选提醒。",
  },
  "usecase-inbox-manager": {
    name: "收件箱管理",
    description: "分诊收件箱、查找证据、准备回复，并建议清理自动化。",
  },
  "usecase-newsletter-digest": {
    name: "Newsletter 摘要",
    description: "总结最近若干小时的 newsletter 或邮件，并提出后续动作。",
  },
  "usecase-smart-home-brain": {
    name: "智能家居中枢",
    description: "协调已有智能家居集成，并在敏感动作前进行确认。",
  },
  "usecase-transaction-scan": {
    name: "交易扫描",
    description: "扫描近期消息和邮件中的银行卡交易，并标记可疑扣款。",
  },
  "presentation-studio": {
    name: "演示文稿工作室",
    description:
      "统一完成演示文稿的叙事规划、版式与风格选择、PPTX 生成和质量检查。",
  },
  "visual-presentation": {
    name: "视觉演示",
    description:
      "生成以视觉表达为主、版式鲜明且可编辑的 PowerPoint 演示文稿。",
  },
  "ppt-master": {
    name: "PPT Master（高级）",
    description:
      "高级 PPT 工作流，支持模板复用、深度美化、动画、旁白和视觉质量检查。",
  },
  "voice-call": {
    name: "语音电话",
    description: "通过 ElevenLabs Agents 发起外呼电话。",
  },
  wacli: {
    name: "WhatsApp CLI",
    description: "发送 WhatsApp 消息或搜索、同步 WhatsApp 历史。",
  },
  weather: { name: "天气", description: "获取当前天气和预报。" },
  "web-scraper": {
    name: "网页抓取",
    description: "使用反爬绕过和结构化抽取抓取网页内容。",
  },
  webmcp: {
    name: "WebMCP 网页工具调用",
    description: "发现并调用网页中声明的 WebMCP 工具。",
  },
  "write-tests": { name: "编写测试", description: "为现有代码生成单元测试。" },
};

const ZH_SKILL_TEXT_BY_NAME: Record<
  string,
  { name: string; description: string }
> = {
  "AutoResearch Report": ZH_SKILL_TEXT_BY_ID["autoresearch-report"],
  "Competitive Research": ZH_SKILL_TEXT_BY_ID["competitive-research"],
  "Competitive Scan": {
    name: "竞品动态扫描",
    description: "扫描竞品新闻、价格变化、产品发布和招聘动态。",
  },
  "NeoWorker Multi-Agent Research":
    ZH_SKILL_TEXT_BY_ID["neoworker-multi-agent-research"],
  "Cross-Platform Search": {
    name: "跨平台搜索",
    description: "在已连接来源中查找项目相关信息。",
  },
  "Idea Validation": ZH_SKILL_TEXT_BY_ID["idea-validation"],
  "Last X Days Research": ZH_SKILL_TEXT_BY_ID["research-last-days"],
  "Link Research": ZH_SKILL_TEXT_BY_ID["link-research"],
  "LLM Wiki": ZH_SKILL_TEXT_BY_ID["llm-wiki"],
  "Recursive Search Extract": {
    name: "递归搜索提取",
    description: "递归搜索文档，提取相关段落，并引用来源。",
  },
  "Research Executive Brief": {
    name: "研究高管简报",
    description: "把研究内容综合成简洁的高管简报，并附来源。",
  },
  "Task Guidelines": ZH_SKILL_TEXT_BY_ID["karpathy-guidelines"],
};

export function getLocalizedSkillCategory(
  category?: string,
  language: SupportedLanguage = getCurrentLanguage(),
): string | undefined {
  if (!category) return category;
  if (language !== "zh-CN") return category;
  return ZH_CATEGORY_LABELS[category] || category;
}

export function getLocalizedSkillSource(
  source?: string,
  language: SupportedLanguage = getCurrentLanguage(),
): string | undefined {
  if (!source) return source;
  if (language !== "zh-CN") return source;
  return ZH_SOURCE_LABELS[source.toLowerCase()] || source;
}

// Plugin packs are imported with their upstream English metadata.  A Chinese UI
// should not suddenly become an English catalogue just because a pack has not
// yet received hand-written copy.  Keep the real id untouched for invocation,
// but give every known pack a useful Chinese Demo文稿 fallback.
const ZH_PLUGIN_SKILL_SCOPES = [
  ["ai-governance-legal", "AI 治理法务"],
  ["codex-security", "Codex 安全"],
  ["cocounsel-legal", "CoCounsel 法务"],
  ["commercial-legal", "商业法务"],
  ["corporate-legal", "公司法务"],
  ["employment-legal", "劳动法务"],
  ["ip-legal", "知识产权法务"],
  ["law-student", "法学学习"],
  ["legal-builder-hub", "法务技能中心"],
  ["legal-clinic", "法律诊所"],
  ["litigation-legal", "诉讼法务"],
  ["privacy-legal", "隐私法务"],
  ["product-legal", "产品法务"],
  ["regulatory-legal", "监管法务"],
  ["content-marketing", "内容营销"],
  ["neoworker-shortcuts", "办公效率"],
  ["customer-support", "客户支持"],
  ["data-analysis", "数据分析"],
  ["devops", "运维"],
  ["engineering-management", "工程管理"],
  ["engineering", "软件工程"],
  ["equity-research", "股票研究"],
  ["finance-core", "财务核心"],
  ["financial-analysis", "财务分析"],
  ["fund-admin", "基金运营"],
  ["game-development", "游戏开发"],
  ["geo-seo", "GEO 优化"],
  ["investment-banking", "投资银行"],
  ["mobile-development", "移动开发"],
  ["operations-kyc", "KYC 运营"],
  ["private-equity", "私募股权"],
  ["product-management", "产品管理"],
  ["qa-testing", "质量测试"],
  ["sales-crm", "销售 CRM"],
  ["smb-complete", "中小企业运营"],
  ["technical-writing", "技术写作"],
  ["wealth-management", "财富管理"],
].sort(([e], [i]) => i.length - e.length);

const ZH_PLUGIN_SKILL_ACTIONS: Record<string, string> = {
  "ai-inventory": "AI 系统台账",
  "aia-generation": "AI 影响评估",
  "legal-guardrails": "工作护栏",
  assistant: "智能助理",
  "security-scan": "安全扫描",
  "security-diff-scan": "代码变更安全扫描",
  "deep-security-scan": "深度安全扫描",
  "threat-model": "威胁建模",
  "finding-discovery": "安全问题发现",
  validation: "安全验证",
  "attack-path-analysis": "攻击路径分析",
  "fix-finding": "安全问题修复",
  "cold-start-interview": "初始配置访谈",
  customize: "工作流配置",
  "matter-workspace": "事项工作区",
  "amendment-history": "修订历史",
  "ai-tool-handoff": "AI 工具交接",
  "board-minutes": "董事会纪要",
  "closing-checklist": "交割清单",
  "expansion-kickoff": "业务扩展启动",
  "expansion-update": "业务扩展更新",
  "handbook-updates": "员工手册更新",
  "cease-desist": "停止侵权函",
  clearance: "权利检索",
  "fto-triage": "自由实施初筛",
  "auto-updater": "自动更新",
  "registry-browser": "技能目录",
  "build-guide": "案件办理指南",
  "brief-section-drafter": "诉状章节起草",
  chronology: "案件时间线",
  "claim-chart": "权利要求对照表",
  "feature-risk-assessment": "功能风险评估",
  "is-this-a-problem": "法律问题判断",
  "launch-review": "上线审查",
  "gap-surfacer": "监管差距识别",
  gaps: "监管差距分析",
  "deep-research": "深度研究",
  comments: "意见处理",
  "contract-plain-english": "合同通俗解读",
  deadlines: "期限管理",
  "deal-team-summary": "交易团队摘要",
  "demand-draft": "律师函草稿",
  "demand-intake": "律师函接收",
  "demand-received": "来函处理",
  "deposition-prep": "证词准备",
  "diligence-issue-extraction": "尽调问题提取",
  disable: "停用技能",
  "dpa-review": "数据处理协议审查",
  "dsar-response": "数据主体请求回复",
  "entity-compliance": "主体合规检查",
  "escalation-flagger": "升级风险标记",
  "exam-forecast": "考试重点预测",
  "legal-hold": "法律保全通知",
  "nda-review": "保密协议审查",
  "policy-monitor": "政策监测",
  "policy-diff": "政策差异比对",
  "policy-redraft": "政策重拟",
  "reg-gap-analysis": "监管差距分析",
  "reg-feed-watcher": "监管动态监测",
  "review-proposals": "方案审查",
  "saas-msa-review": "SaaS 主服务协议审查",
  "stakeholder-summary": "相关方摘要",
  "vendor-agreement-review": "供应商协议审查",
  "vendor-ai-review": "供应商 AI 审查",
  "use-case-triage": "使用场景分诊",
  "client-intake": "客户接收",
  "client-letter": "客户函件",
  "client-comms-log": "客户沟通记录",
  "case-brief": "案例摘要",
  "cold-call-prep": "课堂提问准备",
  "bar-prep-questions": "法考练习题",
  flashcards: "知识闪卡",
  "study-plan": "学习计划",
  "code-review-prep": "代码评审准备",
  "dependency-audit": "依赖审计",
  "test-gap-analysis": "测试缺口分析",
  "standup-update": "站会更新",
  "feature-triage": "功能需求分诊",
  "user-stories": "用户故事生成",
  "roadmap-update": "路线图更新",
  "test-plan": "测试计划生成",
  "bug-report": "缺陷报告",
  "release-checklist": "发布就绪检查",
  "csv-analysis": "CSV 分析",
  "report-generator": "报告生成",
  "sql-query": "SQL 查询构建",
  "incident-response": "事故响应",
  postmortem: "事故复盘报告",
  "deployment-checklist": "部署检查清单",
  "monitoring-setup": "监控配置",
  "campaign-plan": "营销活动规划",
  "blog-post": "博客文章草稿",
  "social-media": "社媒内容生成",
  "prospect-research": "潜客研究",
  "followup-email": "跟进邮件",
  "pipeline-review": "销售管道复盘",
  "objection-handler": "异议处理",
  "portfolio-monitoring": "组合监控",
  "deal-sourcing": "交易机会筛选",
  "lbo-modeling": "杠杆收购建模",
  "financial-plan": "财务规划",
  "risk-assessment": "风险评估",
  "client-reporting": "客户报告",
  "policy-starter": "治理政策起草",
  strategy: "战略规划",
  "renewal-tracker": "续约跟踪",
  review: "审查清单",
  "marketing-blog-post": "博客文章起草",
  "marketing-social-media": "社交媒体内容",
  "marketing-campaign-plan": "营销活动方案",
  "integration-management": "并购整合管理",
  "material-contract-schedule": "重大合同清单",
  "tabular-review": "表格化审查",
  "written-consent": "书面同意文件",
  "support-ticket-triage": "客服工单分诊",
  "support-response-draft": "客服回复起草",
  "support-escalation-summary": "升级事项摘要",
  "support-kb-article": "知识库文章起草",
  "data-csv-analysis": "CSV 数据分析",
  "data-report-generator": "数据报告生成",
  "data-sql-query": "SQL 查询构建",
  "terraform-plan": "Terraform 变更审查",
  "k8s-manifest": "Kubernetes 清单生成",
  "migration-assessment": "云迁移评估",
  "docker-compose": "Docker Compose 配置生成",
  "hiring-review": "招聘合规审查",
  "internal-investigation": "内部调查",
  "international-expansion": "跨境用工评估",
  "investigation-add": "添加调查材料",
  "investigation-memo": "调查备忘录",
  "investigation-open": "启动内部调查",
  "investigation-query": "查询调查事项",
  "investigation-summary": "调查结论摘要",
  "leave-tracker": "休假跟踪",
  "log-leave": "登记休假",
  "policy-drafting": "用工政策起草",
  "termination-review": "解雇事项审查",
  "wage-hour-qa": "工时与薪酬问答",
  "worker-classification": "用工关系分类",
  "eng-code-review-prep": "代码评审准备",
  "eng-dependency-audit": "软件依赖审计",
  "eng-test-gap-analysis": "测试缺口分析",
  "eng-standup-update": "研发站会更新",
  "em-sprint-review": "迭代健康检查",
  "em-1on1-prep": "一对一沟通准备",
  "em-team-report": "团队状态报告",
  "er-earnings-analysis": "财报分析",
  "er-sector-analysis": "行业分析",
  "er-coverage-initiation": "首次覆盖报告",
  "er-price-target": "目标价测算",
  "er-catalyst-tracking": "投资催化剂跟踪",
  "er-earnings-preview": "财报前瞻",
  "er-model-update": "估值模型更新",
  "er-morning-note": "晨会简报",
  "er-thesis": "投资逻辑梳理",
  "er-screen": "股票筛选",
  "finance-source-ledger": "来源台账",
  "finance-model-audit": "财务模型审计",
  "finance-xlsx-author": "Excel 财务交付物制作",
  "finance-pptx-author": "财务演示文稿制作",
  "finance-deck-qc": "演示文稿质检",
  "finance-workpaper-manifest": "财务工作底稿清单",
  "finance-guardrails": "财务工作护栏",
  "fa-dcf-modeling": "现金流折现估值",
  "fa-ratio-analysis": "财务比率分析",
  "fa-statement-analysis": "财务报表分析",
  "fa-peer-benchmarking": "同业对标分析",
  "fa-valuation-summary": "估值摘要",
  "fa-lbo-modeling": "杠杆收购建模",
  "fa-three-statement-model": "三表联动模型",
  "fa-model-audit": "财务模型排错",
  "fund-gl-recon": "总账核对",
  "fund-break-trace": "差异追踪",
  "fund-accrual-schedule": "应计项目表",
  "fund-roll-forward": "余额滚动更新",
  "fund-variance-commentary": "差异说明",
  "fund-nav-tieout": "基金净值核对",
  "gamedev-unity": "Unity 游戏开发",
  "gamedev-unreal": "Unreal 游戏开发",
  "gamedev-godot": "Godot 游戏开发",
  "gamedev-performance": "游戏性能优化",
  "geo-quick-audit": "GEO 快速审计",
  "ib-deal-screening": "交易项目初筛",
  "ib-pitch-book": "融资推介材料",
  "ib-ma-analysis": "并购分析",
  "ib-due-diligence": "交易尽职调查",
  "ib-comps-analysis": "可比公司分析",
  "ib-one-pager": "项目一页纸",
  "ib-cim": "保密信息备忘录",
  "ib-teaser": "项目简介",
  "ib-buyer-list": "潜在买方清单",
  "ib-process-letter": "交易流程函",
  "ib-deal-tracker": "交易进度跟踪",
  "infringement-triage": "侵权事项初筛",
  "invention-intake": "发明信息收集",
  "ip-clause-review": "知识产权条款审查",
  "oss-review": "开源软件合规审查",
  takedown: "侵权内容下架处理",
  "irac-practice": "IRAC 案例分析练习",
  "legal-writing": "法律文书写作",
  "outline-builder": "课程提纲整理",
  session: "学习会话",
  "socratic-drill": "苏格拉底式问答练习",
  "related-skills-surfacer": "关联技能推荐",
  "skill-installer": "技能安装",
  "skill-manager": "技能管理",
  "skills-qa": "技能质量检查",
  uninstall: "卸载技能",
  draft: "法律文稿起草",
  "form-generation": "法律表单生成",
  memo: "法律备忘录",
  "plain-language-letters": "通俗法律函件",
  ramp: "案件快速上手",
  "research-start": "法律研究启动",
  "semester-handoff": "学期案件交接",
  status: "案件状态",
  "supervisor-review-queue": "指导律师审核队列",
  "matter-briefing": "案件简报",
  "matter-close": "案件结案",
  "matter-intake": "案件接收",
  "matter-update": "案件进展更新",
  "oc-status": "对方律师状态",
  "portfolio-status": "案件组合状态",
  "privilege-log-review": "保密特权清单审查",
  "subpoena-triage": "传票事项初筛",
  "mobile-react-native-setup": "React Native 项目搭建",
  "mobile-ios-development": "iOS 应用开发",
  "mobile-android-development": "Android 应用开发",
  "mobile-build-pipeline": "移动应用构建流水线",
  memory: "记忆问题排查",
  "batch-rename": "批量重命名",
  "smart-deduplication": "智能去重",
  "folder-structure": "文件夹结构整理",
  "archive-stale-files": "归档长期未用文件",
  "template-generator": "文件模板生成",
  "recursive-search-extract": "递归搜索与摘录",
  "format-converter": "文件格式转换",
  "size-audit": "大文件审计",
  "gmail-summary-drive": "邮件摘要归档",
  "calendar-prep-brief": "日程准备简报",
  "slack-action-items": "Slack 待办提取",
  "drive-analysis-slides": "云盘材料分析与演示稿",
  "email-chain-resolver": "邮件往来梳理",
  "multi-source-report": "多来源综合报告",
  "meeting-notes-distributor": "会议纪要分发",
  "cross-platform-search": "跨平台搜索",
  "voice-note-draft": "语音笔记转草稿",
  "meeting-recording-notes": "会议录音整理",
  "research-executive-brief": "研究高管简报",
  "proposal-customizer": "方案定制",
  "spreadsheet-narrative": "表格数据解读",
  "content-repurposing": "内容改编复用",
  "weekly-newsletter": "每周通讯",
  "daily-inbox-zero": "每日清空收件箱",
  "weekly-file-cleanup": "每周文件整理",
  "monday-planning-brief": "周一计划简报",
  "monthly-financial-organizer": "月度财务资料整理",
  "competitive-scan": "竞品动态扫描",
  "end-of-day-log": "每日工作日志",
  "ops-kyc-doc-parse": "KYC 文件解析",
  "ops-kyc-rules": "KYC 规则表",
  "pia-generation": "隐私影响评估",
  "pe-deal-sourcing": "投资项目搜寻",
  "pe-lbo-modeling": "杠杆收购建模",
  "pe-portfolio-monitoring": "被投企业监控",
  "pe-exit-analysis": "退出方案分析",
  "pe-fund-reporting": "基金报告",
  "pe-dd-checklist": "尽调检查清单",
  "pe-dd-prep": "尽调准备",
  "pe-unit-economics": "单位经济模型",
  "pe-ic-memo": "投委会备忘录",
  "pe-value-creation": "投后价值提升方案",
  "pe-ai-readiness": "企业 AI 就绪度评估",
  "marketing-claims-review": "营销宣传用语审查",
  "pm-feature-triage": "功能需求分诊",
  "pm-user-stories": "用户故事生成",
  "pm-roadmap-update": "产品路线图更新",
  "qa-test-plan": "测试计划生成",
  "qa-bug-report": "缺陷报告",
  "qa-release-checklist": "发布就绪检查",
  "sales-prospect-research": "潜在客户研究",
  "sales-followup-email": "销售跟进邮件",
  "sales-pipeline-review": "销售管道复盘",
  "sales-objection-handler": "客户异议处理",
  "smb-guardrails": "中小企业工作护栏",
  "smb-onboard": "企业资料初始化",
  "smb-plan-payroll": "工资发放计划",
  "smb-month-heads-up": "月度事项提醒",
  "smb-close-month": "月度结账",
  "smb-price-check": "产品价格检查",
  "smb-tax-prep": "报税资料准备",
  "smb-cash-flow-snapshot": "现金流快照",
  "smb-invoice-chase": "应收发票催办",
  "smb-margin-analyzer": "利润率分析",
  "smb-month-end-prep": "月末准备",
  "smb-tax-season-organizer": "税务季资料整理",
  "smb-call-list": "客户联系清单",
  "smb-sales-brief": "销售简报",
  "smb-run-campaign": "营销活动执行",
  "smb-lead-triage": "销售线索分诊",
  "smb-content-strategy": "内容策略",
  "smb-canva-creator": "Canva 营销素材制作",
  "smb-handle-complaint": "客户投诉处理",
  "smb-customer-pulse-check": "客户反馈检查",
  "smb-crm-cleanup": "客户资料清理",
  "smb-review-contract": "合同审查",
  "smb-ticket-deflector": "常见问题自助分流",
  "smb-customer-pulse": "客户满意度追踪",
  "smb-crm-maintenance": "客户资料维护",
  "smb-contract-review": "合同复核",
  "smb-monday-brief": "周一经营简报",
  "smb-friday-brief": "周五经营复盘",
  "smb-quarterly-review": "季度经营复盘",
  "smb-business-pulse": "企业经营健康检查",
  "smb-job-post-builder": "招聘职位说明生成",
  "tw-doc-audit": "文档质量审计",
  "tw-changelog": "更新日志生成",
  "tw-api-docs": "API 参考文档编写",
  "wm-portfolio-construction": "投资组合构建",
  "wm-asset-allocation": "资产配置",
  "wm-client-reporting": "客户投资报告",
  "wm-risk-assessment": "投资风险评估",
  "wm-tax-optimization": "税务优化分析",
  "wm-client-review": "客户投资复盘",
  "wm-financial-plan": "个人财务规划",
  "wm-proposal": "财富管理方案",
};

function getPluginSkillFallback(
  skill: SkillDisplayLike,
  language: SupportedLanguage,
): LocalizedSkillText {
  const matchedScope = ZH_PLUGIN_SKILL_SCOPES.find(
    ([prefix]) =>
      skill.id === prefix ||
      skill.id.startsWith(`${prefix}-`) ||
      skill.id.startsWith(`${prefix}:`),
  );
  const scope =
    matchedScope?.[1] ||
    getLocalizedSkillCategory(skill.category, language) ||
    "已安装";
  const actionId = matchedScope
    ? skill.id.slice(matchedScope[0].length).replace(/^[:-]/, "")
    : skill.id;
  const action = ZH_PLUGIN_SKILL_ACTIONS[actionId] || "工作流程";

  return {
    name: `${scope} · ${action}`,
    description: `在${scope}场景中完成“${action}”，并生成可检查、可继续处理的结果。`,
    category: getLocalizedSkillCategory(skill.category, language),
    source: getLocalizedSkillSource(skill.source, language),
  };
}

export function getLocalizedSkillText(
  skill: SkillDisplayLike,
  language: SupportedLanguage = getCurrentLanguage(),
): LocalizedSkillText {
  if (language !== "zh-CN") {
    return {
      name: normalizeInternalToolNamesForDisplay(skill.name, language),
      description: normalizeInternalToolNamesForDisplay(
        skill.description || "",
        language,
      ),
      category: skill.category,
      source: skill.source,
    };
  }

  // External and workspace skills are user-authored content. Their names are
  // identifiers chosen by the user or by the imported SKILL.md, so replacing
  // an unknown one with a generic localized workflow label is misleading.
  if (skill.source === "external" || skill.source === "workspace") {
    return {
      name: normalizeInternalToolNamesForDisplay(skill.name, language),
      description: normalizeInternalToolNamesForDisplay(
        skill.description || "",
        language,
      ),
      category:
        skill.source === "external"
          ? "自定义"
          : getLocalizedSkillCategory(skill.category, language),
      source: getLocalizedSkillSource(skill.source, language),
    };
  }

  const localized =
    ZH_SKILL_TEXT_BY_ID[skill.id] || ZH_SKILL_TEXT_BY_NAME[skill.name];
  if (!localized) return getPluginSkillFallback(skill, language);
  return {
    name: normalizeInternalToolNamesForDisplay(localized.name, language),
    description: normalizeInternalToolNamesForDisplay(
      localized.description,
      language,
    ),
    category: getLocalizedSkillCategory(skill.category, language),
    source: getLocalizedSkillSource(skill.source, language),
  };
}

const ZH_SKILL_ROUTING_BY_ID: Record<string, LocalizedSkillRoutingText> = {
  "analyze-csv": {
    useWhen:
      "需要读取 CSV 文件，检查字段结构、数据质量、统计摘要或异常时使用。",
    outputs: "简洁的数据集摘要，包含列统计、缺失值提示和可执行洞察。",
    successCriteria: "报告包含行列数量、数据类型观察、数值统计和高置信度异常。",
  },
};

function containsChineseText(value?: string): boolean {
  return Boolean(value && /[\u3400-\u9fff]/.test(value));
}

function trimSentenceEnding(value: string): string {
  return value.trim().replace(/[。.!！?？]+$/u, "");
}

/**
 * Localize routing metadata shown in skill detail surfaces. Upstream registry
 * metadata is commonly English-only, so Chinese mode uses a deterministic
 * description-based fallback instead of leaking raw execution copy.
 */
export function getLocalizedSkillRoutingText(
  skill: SkillDisplayLike,
  routing?: SkillRoutingDisplayLike,
  language: SupportedLanguage = getCurrentLanguage(),
): LocalizedSkillRoutingText {
  if (language !== "zh-CN") {
    const name = skill.name || skill.id;
    return {
      useWhen:
        routing?.useWhen || `Use when a task needs the ${name} workflow.`,
      outputs:
        routing?.outputs || `A clear, reusable result produced with ${name}.`,
      successCriteria:
        routing?.successCriteria ||
        "The result is complete, accurate, and matches the requested scope and format.",
    };
  }

  const explicit = ZH_SKILL_ROUTING_BY_ID[skill.id];
  if (explicit) return explicit;

  const localized = getLocalizedSkillText(skill, language);
  const description = trimSentenceEnding(localized.description || "");
  const name = localized.name || skill.name || skill.id;
  return {
    useWhen: containsChineseText(routing?.useWhen)
      ? routing?.useWhen || ""
      : description
        ? `当任务需要${description}时使用。`
        : `当任务需要“${name}”相关的专业处理流程时使用。`,
    outputs: containsChineseText(routing?.outputs)
      ? routing?.outputs || ""
      : `形成“${name}”的清晰结果，包含关键发现、处理说明和可继续使用的交付内容。`,
    successCriteria: containsChineseText(routing?.successCriteria)
      ? routing?.successCriteria || ""
      : "结果覆盖用户目标，关键信息准确，必要步骤可复核，并符合指定的范围与格式。",
  };
}

/**
 * Build the text that is visible in the message composer when a skill is
 * selected. Upstream skill prompts and routing examples are execution
 * instructions, not user-facing copy, and many of them are English-only.
 * Keep those instructions in structured skill context instead of leaking them
 * into an otherwise Chinese conversation.
 */
export function buildLocalizedSkillComposerPrompt(
  skill: SkillDisplayLike,
  options: LocalizedSkillComposerPromptOptions = {},
): string {
  const language = options.language || getCurrentLanguage();
  if (language !== "zh-CN") {
    const preferredPrompt = options.preferredPrompt?.trim();
    return preferredPrompt || `Use the ${skill.id} skill for this request.`;
  }

  const localized = getLocalizedSkillText(skill, language);
  const parameterLines = (options.parameterLines || []).filter((line) =>
    line.trim(),
  );
  const sections = [
    `请使用“${localized.name}”技能完成以下任务。`,
    localized.description ? `目标：${localized.description}` : "",
    parameterLines.length > 0
      ? `已选择的参数：\n${parameterLines.join("\n")}`
      : "",
    options.includeTaskPlaceholder
      ? "任务要求：请补充具体目标、相关材料和期望输出。"
      : "",
    "请按照技能要求执行，并返回清晰、完整的结果。",
  ];

  return sections.filter(Boolean).join("\n\n");
}

export function getLocalizedSkillTag(
  tag: string,
  language: SupportedLanguage = getCurrentLanguage(),
): string {
  if (language !== "zh-CN") return tag;
  return ZH_CATEGORY_LABELS[tag] || tag;
}

export function getLocalizedSkillNameFromIdentifier(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return value;
  if (getCurrentLanguage() !== "zh-CN") return trimmed;

  const normalizedId = trimmed
    .toLowerCase()
    .replace(/[_\s]+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
  const titleCaseName = trimmed
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());

  return (
    ZH_SKILL_TEXT_BY_ID[normalizedId]?.name ||
    ZH_SKILL_TEXT_BY_NAME[trimmed]?.name ||
    ZH_SKILL_TEXT_BY_NAME[titleCaseName]?.name ||
    titleCaseName
  );
}

const ZH_PARAMETER_NAMES: Record<string, string> = {
  action: "操作",
  apiKey: "API Key",
  amount: "数量",
  amount_threshold: "金额阈值",
  analysisType: "分析类型",
  analysis_type: "分析类型",
  animation: "动画",
  arr: "年度经常性收入（ARR）",
  assetClass: "资产类别",
  assumptions: "假设条件",
  audience: "目标受众",
  audience_style: "受众风格",
  cac: "获客成本（CAC）",
  canon_mode: "设定一致性模式",
  category: "分类",
  channel: "渠道",
  chapter_count: "章节数量",
  chat_hint: "对话提示",
  checks: "检查项",
  client_role: "客户角色",
  client_side: "客户立场",
  company: "公司",
  completion_bar: "完成标准",
  confidence: "置信水平",
  confirmation_policy: "确认策略",
  constraints: "约束条件",
  days: "天数",
  days_ahead: "未来天数",
  decision_topic: "决策主题",
  delivery_style: "交付风格",
  diagram_brief: "图表需求",
  diagram_type: "图表类型",
  document_type: "文档类型",
  domain: "领域",
  earningsData: "财报数据",
  ebitdaMargin: "EBITDA 利润率",
  end_time: "结束时间",
  error: "错误信息",
  exchange: "交易所",
  expected_name: "预期名称",
  external: "外部任务",
  external_action_policy: "外部操作策略",
  fallback_budget: "备用预算",
  file: "文件",
  file1: "第一个文件",
  file2: "第二个文件",
  filingStatus: "报税身份",
  focus: "重点",
  focusArea: "重点领域",
  framework: "框架",
  genre: "题材",
  goal: "目标",
  graduation_mode: "完成模式",
  historicalData: "历史数据",
  holdings: "持仓",
  home_profile: "家庭配置",
  horizon: "投资期限",
  idea: "创意",
  include_optional_signals: "包含可选信息",
  intent: "意图",
  agreement_path: "主协议文件",
  counterparty_changes_path: "对方修改文件",
  create_reminders: "创建提醒事项",
  criteria: "筛选条件",
  data_csv: "行情数据 CSV",
  demand_letter_path: "催告函文件",
  disclosure_schedules_path: "披露附表文件",
  facts_path: "事实备忘录文件",
  input: "输入",
  issues_table_output_path: "问题表保存位置",
  jurisdictions: "司法辖区",
  language: "语言",
  level: "讲解深度",
  ltv: "客户终身价值（LTV）",
  market: "市场",
  maxResults: "最大结果数",
  max_iterations: "最大迭代次数",
  max_parallel_tasks: "最大并行任务数",
  max_search_results: "最大搜索结果数",
  meeting_topic: "会议主题",
  message_limit: "消息数量上限",
  mode: "模式",
  modelType: "模型类型",
  monthlyChurn: "月流失率",
  newName: "新名称",
  notion_database_id: "Notion 数据库 ID",
  num_options: "选项数量",
  objective: "任务目标",
  obsidian: "Obsidian 知识库",
  oldName: "原名称",
  order_type: "订单类型",
  output_dir: "输出文件夹",
  output_docx_path: "修订文档保存位置",
  output_format: "输出格式",
  output_path: "输出文件",
  output_report_path: "报告保存位置",
  output_style: "输出风格",
  owner_hints: "负责人提示",
  palette: "配色方案",
  packaging: "打包格式",
  parallel: "并行执行",
  party_size: "用餐人数",
  path: "路径",
  period: "时间周期",
  portfolio: "投资组合",
  price: "价格",
  progress_channel: "进度通知渠道",
  project_name: "项目名称",
  projectionYears: "预测年数",
  prompt: "提示词",
  profile: "质量模式",
  question: "具体问题",
  quarter: "财报季度",
  query: "查询",
  quiet_hours: "安静时段",
  range: "时间范围",
  recipient: "接收人",
  reference_assets: "参考文件",
  render_output: "渲染输出",
  repo_hints: "仓库提示",
  repository: "仓库",
  response_output_path: "回复函保存位置",
  revenueGrowth: "收入增长率",
  riskMetric: "风险指标",
  run_librarian: "运行资料管理员",
  route: "生成方式",
  scope: "范围",
  scope_filter: "范围筛选",
  scope_hint: "文件或文件夹范围",
  "secondary-data-csv": "第二份行情数据 CSV",
  sector: "行业",
  seed: "初始设定",
  selector: "页面选择器",
  server_command: "服务启动命令",
  side: "交易方向",
  since: "起始时间",
  sentiment_csv: "情绪数据 CSV",
  source: "来源",
  source_path: "源文件",
  source_material_path: "源素材文件",
  stage: "阶段",
  stale_hours: "停滞时长（小时）",
  start_time: "开始时间",
  strategy: "策略",
  style: "风格",
  slide_count: "幻灯片数量",
  symbol: "交易标的",
  system_name: "系统名称",
  target: "目标",
  targetLanguage: "目标语言",
  targetReturn: "目标收益率",
  target_length_seconds: "目标时长（秒）",
  target_url: "目标网址",
  target_words: "目标字数",
  task: "任务",
  tasks: "任务列表",
  taxBracket: "税率档位",
  tech: "技术栈",
  terminalGrowthRate: "终值增长率",
  text: "文本",
  ticker: "股票代码",
  time_window: "时间窗口",
  timeframe: "时间范围",
  tone: "语气",
  topic: "主题",
  tool: "工具",
  trades_csv: "交易记录保存位置",
  url: "链接",
  urls: "网址列表",
  visual_style: "视觉风格",
  wacc: "加权平均资本成本（WACC）",
  what: "学习主题",
};

const ZH_PARAMETER_DESCRIPTIONS: Record<string, string> = {
  "Path to the first file": "选择或粘贴第一个文件的路径。",
  "Path to the second file": "选择或粘贴第二个文件的路径。",
  "The topic to research (e.g., 'AI agents', 'prompting techniques', 'Apple announcements')":
    "要研究的主题，例如“AI 智能体”“提示词技巧”“Apple 发布会”。",
  "Number of days to look back (e.g., 1, 7, 14, 30, 90). Defaults to 7.":
    "向前回溯的天数，例如 1、7、14、30、90。默认 7 天。",
  "Target AI tool for the prompts (optional context)":
    "提示词面向的 AI 工具（可选上下文）。",
  "The product, market, or idea to research competitors for":
    "要研究竞品的产品、市场或想法。",
};

const ZH_PARAMETER_OPTIONS: Record<string, Record<string, string>> = {
  tool: { Any: "任意" },
};

const ZH_SKILL_PARAMETER_TEXT_BY_ID: Record<
  string,
  Record<
    string,
    { name: string; description: string; options?: Record<string, string> }
  >
> = {
  humanizer: {
    text: {
      name: "文本",
      description: "粘贴需要自然化的原文",
    },
    tone: {
      name: "表达风格",
      description: "选择改写后的表达方式。",
      options: {
        casual: "轻松自然",
        professional: "专业稳重",
        academic: "学术严谨",
        journalistic: "新闻写作",
        technical: "技术清晰",
        warm: "温暖亲切",
      },
    },
  },
  "ppt-master": {
    route: {
      name: "生成方式",
      description: "通常保持自动选择；只有需要特定高级流程时再手动指定。",
      options: {
        auto: "自动选择",
        generate: "全新生成",
        "create-template": "创建模板",
        "template-fill": "填充模板",
        "native-enhance": "原生增强",
        "image-to-pptx": "图片转 PPTX",
        beautify: "深度美化",
      },
    },
    profile: {
      name: "质量模式",
      description: "完整质量适合正式交付，快速模式适合预览。",
      options: { default: "完整质量", quick: "快速模式" },
    },
    language: {
      name: "演示语言",
      description: "自动选择会跟随任务语言。",
      options: {
        auto: "自动选择",
        chinese: "简体中文",
        english: "英文",
        mixed: "中英双语",
      },
    },
    source_path: {
      name: "源文件（可选）",
      description: "需要复用模板、增强现有 PPT 或读取素材时再选择。",
    },
    output_dir: {
      name: "输出文件夹（可选）",
      description: "留空时自动保存到当前任务的交付目录。",
    },
    animation: {
      name: "动画",
      description: "选择是否添加原生 PPT 动画。",
      options: { auto: "自动选择", on: "开启", off: "关闭" },
    },
    narration: {
      name: "旁白",
      description: "选择是否生成旁白。",
      options: { off: "关闭", on: "开启" },
    },
  },
};

const ZH_COMMON_PARAMETER_OPTIONS: Record<string, string> = {
  all: "全部",
  All: "全部",
  always: "始终",
  Any: "任意",
  any: "任意",
  "ask-first": "先询问",
  auto: "自动选择",
  both: "两者都要",
  confirm: "需要确认",
  no: "否",
  none: "无",
  off: "关闭",
  on: "开启",
  yes: "是",
};

function getDefaultChineseParameterDescription(
  parameter: SkillParameter,
  localizedName: string,
): string {
  if (parameter.type === "select") return `请选择${localizedName}。`;
  if (parameter.type === "boolean") return `设置是否启用${localizedName}。`;
  if (/(文件|路径|文件夹|仓库|素材)/.test(localizedName)) {
    return `请选择或填写${localizedName}。`;
  }
  return `请填写${localizedName}。`;
}

export function getLocalizedSkillParameterText(
  skill: SkillDisplayLike,
  parameter: SkillParameter,
  language: SupportedLanguage = getCurrentLanguage(),
): LocalizedSkillParameterText {
  if (language !== "zh-CN") {
    return {
      name: parameter.name,
      description: parameter.description || "",
      options: parameter.options,
    };
  }

  const skillSpecific =
    ZH_SKILL_PARAMETER_TEXT_BY_ID[skill.id]?.[parameter.name];
  const localizedName =
    skillSpecific?.name || ZH_PARAMETER_NAMES[parameter.name] || "自定义参数";
  return {
    name: localizedName,
    description:
      skillSpecific?.description ||
      ZH_PARAMETER_DESCRIPTIONS[parameter.description || ""] ||
      getDefaultChineseParameterDescription(parameter, localizedName),
    options: parameter.options?.map(
      (option) =>
        skillSpecific?.options?.[option] ||
        ZH_PARAMETER_OPTIONS[parameter.name]?.[option] ||
        ZH_COMMON_PARAMETER_OPTIONS[option] ||
        option,
    ),
  };
}
