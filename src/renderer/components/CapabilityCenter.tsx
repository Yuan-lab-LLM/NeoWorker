import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ArrowRight,
  BadgeCheck,
  Blocks,
  Bot,
  Calculator,
  ChartNoAxesCombined,
  Check,
  ChevronDown,
  CircleAlert,
  CircleDollarSign,
  ClipboardCheck,
  ClipboardList,
  Code2,
  FileSearch,
  FlaskConical,
  HandHelping,
  LayoutGrid,
  Megaphone,
  MessageCircleQuestion,
  Microscope,
  NotebookPen,
  Palette,
  Package,
  PenLine,
  ReceiptText,
  RefreshCw,
  Search,
  SearchCheck,
  Send,
  ServerCog,
  Settings2,
  ShieldCheck,
  Target,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  ArrowRight as PhArrowRight,
  ChartLineUp,
  ChatCircleDots,
  CheckCircle,
  CirclesThreePlus,
  CloudArrowUp,
  Code as PhCode,
  Database as PhDatabase,
  FileCsv,
  HardDrives,
  Lightning as PhLightning,
  MagnifyingGlass as PhMagnifyingGlass,
  MegaphoneSimple as PhMegaphone,
  NotePencil,
  PlugsConnected,
  Robot as PhRobot,
  Scales,
  ShieldCheck as PhShieldCheck,
  Sparkle as PhSparkle,
  Stack,
  UsersThree as PhUsersThree,
  WarningCircle,
  type Icon as PhosphorIcon,
} from "@phosphor-icons/react";
import { getLocalizedMcpServerDescription } from "../utils/localized-mcp";
import type { SkillStatusEntry } from "../../shared/types";
import { translate, useLanguage, type SupportedLanguage } from "../i18n";
import {
  getLocalizedAgentCapability,
  getLocalizedAgentRoleText,
} from "../utils/localized-agent-roles";
import { getAgentRoleLinkedSkillLabels } from "../utils/agent-role-skills";
import {
  buildLocalizedSkillComposerPrompt,
  getLocalizedSkillParameterText,
  getLocalizedSkillRoutingText,
  getLocalizedSkillTag,
  getLocalizedSkillText,
} from "../utils/localized-skills";
import { MESSAGE_SHORTCUTS_UPDATED_EVENT } from "../utils/message-slash-options";
import {
  getSemanticIconVisual,
  type SemanticIconTone,
} from "../utils/semantic-icon-map";
import { SKILL_INVENTORY_UPDATED_EVENT } from "../utils/skill-inventory-events";
import {
  isPluginPackVisibleForCurrentProductSupport,
  isProductIntegrationVisible,
  isSkillVisibleForCurrentProductSupport,
} from "../utils/product-availability";
import { classifySkillScene } from "../utils/skill-scene-classifier";
import { NeoWorkerPageHeader } from "./NeoWorkerPageHeader";
import { MCPSettings } from "./MCPSettings";
import "./capability-center.css";

type CapabilityTab = "experts" | "skills" | "bundles" | "connectors" | "mcp";
type CapabilityCenterMode = "tools" | "teamExperts";
type ExpertTarget = string | null;
type ExpertFilter = "all" | "build" | "insight" | "content" | "coordination";
type SkillFilter = "all" | "ready" | "setup" | "disabled";
type SkillSceneId =
  | "all"
  | "custom"
  | "research"
  | "legal"
  | "data"
  | "content"
  | "engineering"
  | "teamwork";
type SkillCatalogCategoryId = string;
type CapabilityManagerMode = "connectors" | null;

type CapabilityRole = {
  id: string;
  name: string;
  displayName: string;
  description?: string;
  icon: string;
  color?: string;
  capabilities: string[];
  isActive: boolean;
  soul?: string;
};

type CapabilityConnectorStatus = {
  id: string;
  status: string;
  tools: Array<{ name: string }>;
};

type CapabilityBundle = {
  name: string;
  displayName: string;
  version: string;
  description: string;
  icon?: string;
  category?: string;
  recommendedConnectors?: string[];
  tryAsking?: string[];
  outcomeExamples?: string[];
  skills: Array<{
    id: string;
    name: string;
    description: string;
    icon?: string;
    enabled?: boolean;
  }>;
  slashCommands: Array<{ name: string; description: string; skillId: string }>;
  agentRoles: Array<{
    name: string;
    displayName: string;
    description?: string;
    icon: string;
    color: string;
  }>;
  enabled: boolean;
  policyBlocked?: boolean;
};

interface CapabilityCenterProps {
  onOpenExperts: () => void;
  onOpenSkillsSettings: () => void;
  initialTab?: CapabilityTab;
  mode?: CapabilityCenterMode;
  onBackToTeam?: () => void;
  onCreateExpertTask?: (
    title: string,
    prompt: string,
  ) => void | Promise<unknown>;
  onUseSkill?: (selection: {
    skillId: string;
    skillLabel: string;
    prompt: string;
  }) => void | Promise<unknown>;
  onUseBundle?: (selection: {
    bundleId: string;
    bundleLabel: string;
    prompt: string;
  }) => void | Promise<unknown>;
}

const TOOL_CAPABILITY_TABS: CapabilityTab[] = [
  "skills",
  "bundles",
  "connectors",
  "mcp",
];

const tabCopy: Record<CapabilityTab, { label: string; description: string }> = {
  experts: {
    label: translate("generated.components.capabilitycenter.182.0", "expert"),
    description: translate(
      "generated.components.capabilitycenter.183.1",
      "Find the person responsible by task type and describe the goals and deliverables above after selecting them.",
    ),
  },
  skills: {
    label: translate("generated.components.capabilitycenter.186.2", "Skills"),
    description: translate(
      "generated.components.capabilitycenter.187.3",
      "Skills are specific practices that experts can invoke, such as retrieving, writing documents, or processing data.",
    ),
  },
  bundles: {
    label: translate(
      "generated.components.capabilitycenter.190.4",
      "Ability combination",
    ),
    description: translate(
      "generated.components.capabilitycenter.191.5",
      "Combine related skills, connectors, and experts into ready-to-use scenario capabilities.",
    ),
  },
  connectors: {
    label: translate(
      "generated.components.capabilitycenter.194.6",
      "connector",
    ),
    description: translate(
      "generated.components.capabilitycenter.195.7",
      "Connectors give experts access to external tools and real data, such as cloud drives, email, or business systems.",
    ),
  },
  mcp: {
    label: "MCP",
    description: translate(
      "generated.components.capabilitycenter.199.8",
      "View MCP services, connection status, and available tools in one place, and complete startup, shutdown, and configuration on the current page.",
    ),
  },
};

const capabilityTabIcons: Record<CapabilityTab, PhosphorIcon> = {
  experts: PhRobot,
  skills: PhSparkle,
  bundles: Stack,
  connectors: PlugsConnected,
  mcp: HardDrives,
};

const capabilityIntroCopy: Record<
  CapabilityTab,
  { title: string; description: string }
> = {
  experts: {
    title: translate(
      "generated.components.capabilitycenter.213.9",
      "Select the person in charge and start the task",
    ),
    description: translate(
      "generated.components.capabilitycenter.214.10",
      "Select the appropriate expert and describe the goal. After creation, you can continue to track progress and results in the task center.",
    ),
  },
  skills: {
    title: translate(
      "generated.components.capabilitycenter.217.11",
      "Discover the skills that suit you",
    ),
    description: translate(
      "generated.components.capabilitycenter.218.12",
      "Browse specific capabilities according to work scenarios, first understand the purpose and conditions of use, and then add tasks.",
    ),
  },
  bundles: {
    title: translate(
      "generated.components.capabilitycenter.221.13",
      "Choose a complete set of work capabilities",
    ),
    description: translate(
      "generated.components.capabilitycenter.222.14",
      "Combine related skills, experts, and connectors to get to a complete job faster.",
    ),
  },
  connectors: {
    title: translate(
      "generated.components.capabilitycenter.225.15",
      "Connect the tools and data you need to work",
    ),
    description: translate(
      "generated.components.capabilitycenter.226.16",
      "Access cloud disks, knowledge bases and collaboration platforms to allow experts to use real context within the scope of authorization.",
    ),
  },
  mcp: {
    title: translate(
      "generated.components.capabilitycenter.229.17",
      "View MCP services and available tools",
    ),
    description: translate(
      "generated.components.capabilitycenter.230.18",
      "Centrally check the service status, exposed tools and configuration, and enter the management page for processing when necessary.",
    ),
  },
};

const expertFilters: Array<{
  id: ExpertFilter;
  label: string;
  capabilities: string[];
}> = [
  {
    id: "all",
    label: translate("generated.components.capabilitycenter.239.19", "All"),
    capabilities: [],
  },
  {
    id: "build",
    label: translate(
      "generated.components.capabilitycenter.242.20",
      "Products and Technology",
    ),
    capabilities: [
      "code",
      "build",
      "debug",
      "test",
      "ops",
      "security",
      "design",
    ],
  },
  {
    id: "insight",
    label: translate(
      "generated.components.capabilitycenter.247.21",
      "research and analysis",
    ),
    capabilities: ["research", "analyze", "review"],
  },
  {
    id: "content",
    label: translate(
      "generated.components.capabilitycenter.252.22",
      "Content and growth",
    ),
    capabilities: ["write", "document", "market"],
  },
  {
    id: "coordination",
    label: translate(
      "generated.components.capabilitycenter.257.23",
      "Planning and collaboration",
    ),
    capabilities: ["plan", "manage", "communicate", "product"],
  },
];

const skillFilters: Array<{ id: SkillFilter; label: string }> = [
  {
    id: "all",
    label: translate("generated.components.capabilitycenter.263.24", "All"),
  },
  {
    id: "ready",
    label: translate(
      "generated.components.capabilitycenter.264.25",
      "Can be used directly",
    ),
  },
  {
    id: "setup",
    label: translate(
      "generated.components.capabilitycenter.265.26",
      "Requires configuration",
    ),
  },
  {
    id: "disabled",
    label: translate(
      "generated.components.capabilitycenter.266.27",
      "Deactivated",
    ),
  },
];

type SkillCatalogCategoryDefinition = {
  id: SkillCatalogCategoryId;
  label: string;
  terms: string[];
};

const DEFAULT_SKILL_CATALOG_CATEGORIES: SkillCatalogCategoryDefinition[] = [
  {
    id: "all",
    label: translate("generated.components.capabilitycenter.276.28", "All"),
    terms: [],
  },
  {
    id: "data",
    label: translate(
      "generated.components.capabilitycenter.279.29",
      "Data and Analysis",
    ),
    terms: [
      translate("generated.components.capabilitycenter.281.30", "data"),
      translate("generated.components.capabilitycenter.282.31", "analysis"),
      "csv",
      translate("generated.components.capabilitycenter.284.32", "table"),
      translate("generated.components.capabilitycenter.285.33", "indicator"),
      translate("generated.components.capabilitycenter.286.34", "Statistics"),
      translate("generated.components.capabilitycenter.287.35", "database"),
      "data",
      "analytics",
      "spreadsheet",
      "database",
    ],
  },
  {
    id: "finance",
    label: translate(
      "generated.components.capabilitycenter.296.36",
      "financial research",
    ),
    terms: [
      translate("generated.components.capabilitycenter.298.37", "Finance"),
      translate("generated.components.capabilitycenter.299.38", "Finance"),
      translate(
        "generated.components.capabilitycenter.300.39",
        "financial report",
      ),
      translate("generated.components.capabilitycenter.301.40", "Valuation"),
      translate("generated.components.capabilitycenter.302.41", "stocks"),
      translate("generated.components.capabilitycenter.303.42", "securities"),
      translate(
        "generated.components.capabilitycenter.304.43",
        "Investment research",
      ),
      "finance",
      "financial",
      "stock",
      "dcf",
    ],
  },
  {
    id: "strategy",
    label: translate(
      "generated.components.capabilitycenter.313.44",
      "strategy and decision making",
    ),
    terms: [
      translate("generated.components.capabilitycenter.315.45", "Strategy"),
      translate(
        "generated.components.capabilitycenter.316.46",
        "decision making",
      ),
      translate("generated.components.capabilitycenter.317.47", "strategy"),
      translate("generated.components.capabilitycenter.318.48", "planning"),
      translate("generated.components.capabilitycenter.319.49", "Consultation"),
      translate("generated.components.capabilitycenter.320.50", "risk"),
      translate("generated.components.capabilitycenter.321.51", "market"),
      translate("generated.components.capabilitycenter.322.52", "competition"),
      "strategy",
      "decision",
      "planning",
      "risk",
    ],
  },
  {
    id: "growth",
    label: translate(
      "generated.components.capabilitycenter.331.53",
      "development and growth",
    ),
    terms: [
      translate("generated.components.capabilitycenter.333.54", "develop"),
      translate("generated.components.capabilitycenter.334.55", "Engineering"),
      translate("generated.components.capabilitycenter.335.56", "code"),
      translate("generated.components.capabilitycenter.336.57", "Debugging"),
      translate("generated.components.capabilitycenter.337.58", "test"),
      translate("generated.components.capabilitycenter.338.59", "growth"),
      translate("generated.components.capabilitycenter.339.60", "grow"),
      translate("generated.components.capabilitycenter.340.61", "Marketing"),
      "development",
      "engineering",
      "code",
      "growth",
    ],
  },
];

type SkillSceneDefinition = {
  id: Exclude<SkillSceneId, "all" | "custom">;
  title: string;
  description: string;
  image: string;
  terms: string[];
  categoryTerms: string[];
  catalogCategories: SkillCatalogCategoryDefinition[];
  Icon: PhosphorIcon;
  tone: SemanticIconTone;
};

const SKILL_SCENES: SkillSceneDefinition[] = [
  {
    id: "research",
    title: translate(
      "generated.components.capabilitycenter.364.62",
      "Research",
    ),
    description: translate(
      "generated.components.capabilitycenter.365.63",
      "Efficiently obtain information, gain insight into trends, form conclusions, and drive smarter decisions.",
    ),
    image: "./capability/research-hero-3d.webp",
    terms: [
      translate("generated.components.capabilitycenter.368.64", "Research"),
      translate("generated.components.capabilitycenter.369.65", "Search"),
      translate("generated.components.capabilitycenter.370.66", "Search"),
      translate("generated.components.capabilitycenter.371.67", "Trend"),
      translate("generated.components.capabilitycenter.372.68", "Insight"),
      translate("generated.components.capabilitycenter.373.69", "Research"),
      "research",
      "search",
      "investigate",
      "crawl",
      "scrape",
    ],
    categoryTerms: ["Research", "Learning", "Finance"],
    catalogCategories: [
      {
        id: "all",
        label: translate("generated.components.capabilitycenter.382.70", "All"),
        terms: [],
      },
      {
        id: "retrieval",
        label: translate(
          "generated.components.capabilitycenter.383.71",
          "Search and collect",
        ),
        terms: [
          translate("generated.components.capabilitycenter.383.72", "Search"),
          translate("generated.components.capabilitycenter.383.73", "Search"),
          translate("generated.components.capabilitycenter.383.74", "crawl"),
          "search",
          "crawl",
          "scrape",
        ],
      },
      {
        id: "market",
        label: translate(
          "generated.components.capabilitycenter.384.75",
          "Market and Competitive Products",
        ),
        terms: [
          translate("generated.components.capabilitycenter.384.76", "market"),
          translate(
            "generated.components.capabilitycenter.384.77",
            "Competing products",
          ),
          translate("generated.components.capabilitycenter.384.78", "Trend"),
          "market",
          "competitive",
          "trend",
        ],
      },
      {
        id: "academic",
        label: translate(
          "generated.components.capabilitycenter.385.79",
          "Papers and information",
        ),
        terms: [
          translate("generated.components.capabilitycenter.385.80", "Paper"),
          translate(
            "generated.components.capabilitycenter.385.81",
            "Literature",
          ),
          translate("generated.components.capabilitycenter.385.82", "Quote"),
          "paper",
          "academic",
          "citation",
        ],
      },
      {
        id: "synthesis",
        label: translate(
          "generated.components.capabilitycenter.386.83",
          "Insights and reporting",
        ),
        terms: [
          translate("generated.components.capabilitycenter.386.84", "Insight"),
          translate("generated.components.capabilitycenter.386.85", "Research"),
          translate("generated.components.capabilitycenter.386.86", "report"),
          "insight",
          "research",
          "report",
        ],
      },
    ],
    Icon: PhMagnifyingGlass,
    tone: "blue",
  },
  {
    id: "legal",
    title: translate(
      "generated.components.capabilitycenter.393.87",
      "legal affairs",
    ),
    description: translate(
      "generated.components.capabilitycenter.394.88",
      "Covering contracts, compliance, disputes and other scenarios, providing professional legal support.",
    ),
    image: "./ideas/legal-paper-illustration.webp",
    terms: [
      translate(
        "generated.components.capabilitycenter.396.89",
        "legal affairs",
      ),
      translate("generated.components.capabilitycenter.396.90", "law"),
      translate("generated.components.capabilitycenter.396.91", "contract"),
      translate("generated.components.capabilitycenter.396.92", "Compliance"),
      translate("generated.components.capabilitycenter.396.93", "dispute"),
      "legal",
      "law",
      "contract",
      "compliance",
    ],
    categoryTerms: ["Legal"],
    catalogCategories: [
      {
        id: "all",
        label: translate("generated.components.capabilitycenter.399.94", "All"),
        terms: [],
      },
      {
        id: "contracts",
        label: translate(
          "generated.components.capabilitycenter.400.95",
          "Contract review",
        ),
        terms: [
          translate("generated.components.capabilitycenter.400.96", "contract"),
          translate("generated.components.capabilitycenter.400.97", "Terms"),
          "contract",
          "agreement",
        ],
      },
      {
        id: "compliance",
        label: translate(
          "generated.components.capabilitycenter.401.98",
          "Compliance governance",
        ),
        terms: [
          translate(
            "generated.components.capabilitycenter.401.99",
            "Compliance",
          ),
          translate(
            "generated.components.capabilitycenter.401.100",
            "governance",
          ),
          translate(
            "generated.components.capabilitycenter.401.101",
            "supervision",
          ),
          "compliance",
          "governance",
          "regulatory",
        ],
      },
      {
        id: "legal-research",
        label: translate(
          "generated.components.capabilitycenter.402.102",
          "legal research",
        ),
        terms: [
          translate(
            "generated.components.capabilitycenter.402.103",
            "legal research",
          ),
          translate("generated.components.capabilitycenter.402.104", "Case"),
          translate(
            "generated.components.capabilitycenter.402.105",
            "regulations",
          ),
          "legal research",
          "case",
          "law",
        ],
      },
      {
        id: "risk",
        label: translate(
          "generated.components.capabilitycenter.403.106",
          "Risks and Controversies",
        ),
        terms: [
          translate("generated.components.capabilitycenter.403.107", "risk"),
          translate("generated.components.capabilitycenter.403.108", "dispute"),
          translate(
            "generated.components.capabilitycenter.403.109",
            "litigation",
          ),
          "risk",
          "dispute",
          "litigation",
        ],
      },
    ],
    Icon: Scales,
    tone: "violet",
  },
  {
    id: "data",
    title: translate(
      "generated.components.capabilitycenter.410.110",
      "data analysis",
    ),
    description: translate(
      "generated.components.capabilitycenter.411.111",
      "From data cleaning to visual analysis, let data drive business growth.",
    ),
    image: "./ideas/data-abstract-illustration.webp",
    terms: [
      translate("generated.components.capabilitycenter.413.112", "data"),
      translate("generated.components.capabilitycenter.413.113", "table"),
      translate("generated.components.capabilitycenter.413.114", "indicator"),
      translate("generated.components.capabilitycenter.413.115", "Statistics"),
      translate(
        "generated.components.capabilitycenter.413.116",
        "Visualization",
      ),
      translate("generated.components.capabilitycenter.413.117", "database"),
      "csv",
      "data",
      "analytics",
      "spreadsheet",
      "database",
      "chart",
      "sql",
    ],
    categoryTerms: ["Data", "Analytics"],
    catalogCategories: [
      {
        id: "all",
        label: translate(
          "generated.components.capabilitycenter.416.118",
          "All",
        ),
        terms: [],
      },
      {
        id: "preparation",
        label: translate(
          "generated.components.capabilitycenter.417.119",
          "Collection and cleaning",
        ),
        terms: [
          translate("generated.components.capabilitycenter.417.120", "Collect"),
          translate("generated.components.capabilitycenter.417.121", "Clean"),
          translate("generated.components.capabilitycenter.417.122", "crawl"),
          "extract",
          "clean",
          "etl",
        ],
      },
      {
        id: "analysis",
        label: translate(
          "generated.components.capabilitycenter.418.123",
          "Analysis and Statistics",
        ),
        terms: [
          translate(
            "generated.components.capabilitycenter.418.124",
            "analysis",
          ),
          translate(
            "generated.components.capabilitycenter.418.125",
            "Statistics",
          ),
          translate(
            "generated.components.capabilitycenter.418.126",
            "indicator",
          ),
          "analysis",
          "analytics",
          "statistics",
        ],
      },
      {
        id: "visualization",
        label: translate(
          "generated.components.capabilitycenter.419.127",
          "Charts and Visualizations",
        ),
        terms: [
          translate("generated.components.capabilitycenter.419.128", "chart"),
          translate(
            "generated.components.capabilitycenter.419.129",
            "Visualization",
          ),
          translate(
            "generated.components.capabilitycenter.419.130",
            "Dashboard",
          ),
          "chart",
          "visualization",
          "dashboard",
        ],
      },
      {
        id: "data-tools",
        label: translate(
          "generated.components.capabilitycenter.420.131",
          "Tables and Databases",
        ),
        terms: [
          translate("generated.components.capabilitycenter.420.132", "table"),
          "csv",
          translate(
            "generated.components.capabilitycenter.420.133",
            "database",
          ),
          "spreadsheet",
          "database",
          "sql",
        ],
      },
    ],
    Icon: ChartLineUp,
    tone: "teal",
  },
  {
    id: "content",
    title: translate(
      "generated.components.capabilitycenter.427.134",
      "content creation",
    ),
    description: translate(
      "generated.components.capabilitycenter.428.135",
      "Generate high-quality articles, reports and multimedia content to accelerate content production.",
    ),
    image: "./ideas/writing.webp",
    terms: [
      translate("generated.components.capabilitycenter.430.136", "writing"),
      translate(
        "generated.components.capabilitycenter.430.137",
        "Documentation",
      ),
      translate("generated.components.capabilitycenter.430.138", "content"),
      translate("generated.components.capabilitycenter.430.139", "report"),
      translate("generated.components.capabilitycenter.430.140", "script"),
      translate("generated.components.capabilitycenter.430.141", "Blog"),
      translate("generated.components.capabilitycenter.430.142", "Demo"),
      translate("generated.components.capabilitycenter.430.143", "image"),
      translate("generated.components.capabilitycenter.430.144", "video"),
      "writing",
      "document",
      "content",
      "copy",
      "blog",
      "presentation",
      "image",
      "video",
    ],
    categoryTerms: ["Creative", "Writing", "Documentation", "Marketing"],
    catalogCategories: [
      {
        id: "all",
        label: translate(
          "generated.components.capabilitycenter.433.145",
          "All",
        ),
        terms: [],
      },
      {
        id: "writing",
        label: translate(
          "generated.components.capabilitycenter.434.146",
          "Writing and Editing",
        ),
        terms: [
          translate("generated.components.capabilitycenter.434.147", "writing"),
          translate("generated.components.capabilitycenter.434.148", "Edit"),
          translate(
            "generated.components.capabilitycenter.434.149",
            "copywriting",
          ),
          "write",
          "writing",
          "edit",
          "copy",
        ],
      },
      {
        id: "documents",
        label: translate(
          "generated.components.capabilitycenter.435.150",
          "Documentation and reporting",
        ),
        terms: [
          translate(
            "generated.components.capabilitycenter.435.151",
            "Documentation",
          ),
          translate("generated.components.capabilitycenter.435.152", "report"),
          translate(
            "generated.components.capabilitycenter.435.153",
            "Briefing",
          ),
          "document",
          "report",
          "brief",
        ],
      },
      {
        id: "visual-media",
        label: translate(
          "generated.components.capabilitycenter.436.154",
          "Images and Videos",
        ),
        terms: [
          translate("generated.components.capabilitycenter.436.155", "image"),
          translate(
            "generated.components.capabilitycenter.436.156",
            "pictures",
          ),
          translate("generated.components.capabilitycenter.436.157", "video"),
          "image",
          "visual",
          "video",
        ],
      },
      {
        id: "publishing",
        label: translate(
          "generated.components.capabilitycenter.437.158",
          "Release and operation",
        ),
        terms: [
          translate("generated.components.capabilitycenter.437.159", "publish"),
          translate("generated.components.capabilitycenter.437.160", "Blog"),
          translate(
            "generated.components.capabilitycenter.437.161",
            "social media",
          ),
          "publish",
          "blog",
          "social",
        ],
      },
    ],
    Icon: NotePencil,
    tone: "orange",
  },
  {
    id: "engineering",
    title: translate(
      "generated.components.capabilitycenter.444.162",
      "Engineering development",
    ),
    description: translate(
      "generated.components.capabilitycenter.445.163",
      "Covers coding, testing, deployment and other aspects to improve R&D efficiency and quality.",
    ),
    image: "./ideas/development.webp",
    terms: [
      translate("generated.components.capabilitycenter.447.164", "develop"),
      translate("generated.components.capabilitycenter.447.165", "code"),
      translate("generated.components.capabilitycenter.447.166", "Engineering"),
      translate("generated.components.capabilitycenter.447.167", "test"),
      translate("generated.components.capabilitycenter.447.168", "deploy"),
      translate("generated.components.capabilitycenter.447.169", "Debugging"),
      translate("generated.components.capabilitycenter.447.170", "front end"),
      translate("generated.components.capabilitycenter.447.171", "safe"),
      translate(
        "generated.components.capabilitycenter.447.172",
        "cloud migration",
      ),
      translate(
        "generated.components.capabilitycenter.447.173",
        "Operation and maintenance",
      ),
      translate(
        "generated.components.capabilitycenter.447.174",
        "incident response",
      ),
      "development",
      "code",
      "engineering",
      "debug",
      "deploy",
      "test",
      "frontend",
      "security",
      "cloud",
      "kubernetes",
      "android",
      "ios",
      "react",
      "cli",
      "devops",
      "incident",
    ],
    categoryTerms: [
      "Development",
      "development",
      "Engineering",
      "DevOps",
      "Security",
    ],
    catalogCategories: [
      {
        id: "all",
        label: translate(
          "generated.components.capabilitycenter.450.175",
          "All",
        ),
        terms: [],
      },
      {
        id: "coding",
        label: translate(
          "generated.components.capabilitycenter.451.176",
          "coding development",
        ),
        terms: [
          translate("generated.components.capabilitycenter.451.177", "code"),
          translate("generated.components.capabilitycenter.451.178", "develop"),
          translate(
            "generated.components.capabilitycenter.451.179",
            "Programming",
          ),
          "code",
          "development",
          "programming",
        ],
      },
      {
        id: "quality",
        label: translate(
          "generated.components.capabilitycenter.452.180",
          "Testing and Quality",
        ),
        terms: [
          translate("generated.components.capabilitycenter.452.181", "test"),
          translate("generated.components.capabilitycenter.452.182", "review"),
          translate(
            "generated.components.capabilitycenter.452.183",
            "Debugging",
          ),
          "test",
          "review",
          "debug",
          "quality",
        ],
      },
      {
        id: "frontend",
        label: translate(
          "generated.components.capabilitycenter.453.184",
          "Front-end and client",
        ),
        terms: [
          translate(
            "generated.components.capabilitycenter.453.185",
            "front end",
          ),
          translate(
            "generated.components.capabilitycenter.453.186",
            "interface",
          ),
          translate(
            "generated.components.capabilitycenter.453.187",
            "Mobile terminal",
          ),
          "frontend",
          "react",
          "android",
          "ios",
        ],
      },
      {
        id: "devops",
        label: translate(
          "generated.components.capabilitycenter.454.188",
          "Deployment and operation",
        ),
        terms: [
          translate("generated.components.capabilitycenter.454.189", "deploy"),
          translate(
            "generated.components.capabilitycenter.454.190",
            "Operation and maintenance",
          ),
          translate("generated.components.capabilitycenter.454.191", "cloud"),
          "deploy",
          "devops",
          "cloud",
          "kubernetes",
        ],
      },
    ],
    Icon: PhCode,
    tone: "rose",
  },
  {
    id: "teamwork",
    title: translate(
      "generated.components.capabilitycenter.461.192",
      "Teamwork",
    ),
    description: translate(
      "generated.components.capabilitycenter.462.193",
      "Promote communication, project management and knowledge accumulation, allowing teams to collaborate more efficiently.",
    ),
    image: "./ideas/team.webp",
    terms: [
      translate(
        "generated.components.capabilitycenter.464.194",
        "collaboration",
      ),
      translate("generated.components.capabilitycenter.464.195", "team"),
      translate("generated.components.capabilitycenter.464.196", "Task"),
      translate("generated.components.capabilitycenter.464.197", "Project"),
      translate("generated.components.capabilitycenter.464.198", "meeting"),
      translate("generated.components.capabilitycenter.464.199", "knowledge"),
      translate("generated.components.capabilitycenter.464.200", "schedule"),
      translate("generated.components.capabilitycenter.464.201", "communicate"),
      translate("generated.components.capabilitycenter.464.202", "Inbox"),
      translate("generated.components.capabilitycenter.464.203", "chat"),
      "team",
      "task",
      "project",
      "meeting",
      "collaboration",
      "knowledge",
      "calendar",
      "email",
      "chat",
    ],
    categoryTerms: [
      "Project",
      "Productivity",
      "Automation",
      "Digital Twin",
      "Use Cases",
      "Guidelines",
      "Utilities",
      "Product",
    ],
    catalogCategories: [
      {
        id: "all",
        label: translate(
          "generated.components.capabilitycenter.467.204",
          "All",
        ),
        terms: [],
      },
      {
        id: "projects",
        label: translate(
          "generated.components.capabilitycenter.468.205",
          "Projects and tasks",
        ),
        terms: [
          translate("generated.components.capabilitycenter.468.206", "Project"),
          translate("generated.components.capabilitycenter.468.207", "Task"),
          translate("generated.components.capabilitycenter.468.208", "plan"),
          "project",
          "task",
          "planning",
        ],
      },
      {
        id: "communication",
        label: translate(
          "generated.components.capabilitycenter.469.209",
          "Communication and meetings",
        ),
        terms: [
          translate(
            "generated.components.capabilitycenter.469.210",
            "communicate",
          ),
          translate("generated.components.capabilitycenter.469.211", "meeting"),
          translate("generated.components.capabilitycenter.469.212", "Mail"),
          "communication",
          "meeting",
          "email",
        ],
      },
      {
        id: "knowledge",
        label: translate(
          "generated.components.capabilitycenter.470.213",
          "knowledge and records",
        ),
        terms: [
          translate(
            "generated.components.capabilitycenter.470.214",
            "knowledge",
          ),
          translate("generated.components.capabilitycenter.470.215", "record"),
          translate("generated.components.capabilitycenter.470.216", "Notes"),
          "knowledge",
          "notes",
          "memory",
        ],
      },
      {
        id: "coordination",
        label: translate(
          "generated.components.capabilitycenter.471.217",
          "collaborative automation",
        ),
        terms: [
          translate(
            "generated.components.capabilitycenter.471.218",
            "collaboration",
          ),
          translate(
            "generated.components.capabilitycenter.471.219",
            "Automation",
          ),
          translate(
            "generated.components.capabilitycenter.471.220",
            "schedule",
          ),
          "collaboration",
          "automation",
          "calendar",
        ],
      },
    ],
    Icon: PhUsersThree,
    tone: "indigo",
  },
];

const SKILL_SCENE_FILTERS: Array<{ id: SkillSceneId; label: string }> = [
  {
    id: "all",
    label: translate("generated.components.capabilitycenter.479.221", "All"),
  },
  ...SKILL_SCENES.map((scene) => ({ id: scene.id, label: scene.title })),
  {
    id: "custom",
    label: translate("capabilities.scene.custom", "Custom"),
  },
];

const isCustomSkillEntry = (skill: Pick<SkillStatusEntry, "source">) =>
  skill.source !== "bundled";

const skillMatchesScene = (
  skill: SkillStatusEntry,
  scene: SkillSceneDefinition,
) => {
  if (isCustomSkillEntry(skill)) return false;
  const localized = getLocalizedSkillText(skill);
  return (
    classifySkillScene(
      {
        id: skill.id,
        name: skill.name,
        localizedName: localized.name,
        category: skill.category,
        localizedCategory: localized.category,
        description: skill.description,
        localizedDescription: localized.description,
        tags: skill.metadata?.tags,
      },
      SKILL_SCENES,
      "research",
    ) === scene.id
  );
};

const getSkillCatalogCategory = (
  skill: SkillStatusEntry,
  categories: SkillCatalogCategoryDefinition[],
): SkillCatalogCategoryId | null => {
  const localized = getLocalizedSkillText(skill);
  const searchable = [
    skill.id,
    skill.name,
    skill.description,
    skill.category,
    localized.name,
    localized.description,
    localized.category,
    ...(skill.metadata?.tags || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase();

  const matched = categories
    .filter((category) => category.id !== "all")
    .find((category) =>
      category.terms.some((term) =>
        searchable.includes(term.toLocaleLowerCase()),
      ),
    );
  return matched?.id || null;
};

const dedupeSkillsByDisplayName = (entries: SkillStatusEntry[]) => {
  const unique = new Map<string, SkillStatusEntry>();
  entries.forEach((skill) => {
    const localized = getLocalizedSkillText(skill);
    const key = (localized.name || skill.name || skill.id)
      .trim()
      .toLocaleLowerCase();
    const existing = unique.get(key);
    const quality =
      Number(skill.eligible && !skill.disabled) * 2 + Number(!skill.disabled);
    const existingQuality = existing
      ? Number(existing.eligible && !existing.disabled) * 2 +
        Number(!existing.disabled)
      : -1;
    if (!existing || quality > existingQuality) unique.set(key, skill);
  });
  return [...unique.values()];
};

const getRoleExpertFilter = (
  role: CapabilityRole,
): Exclude<ExpertFilter, "all"> => {
  const capabilities = new Set(role.capabilities || []);
  const primaryCapability = role.capabilities?.[0];
  const primaryMatch = expertFilters.find(
    (item) =>
      item.id !== "all" &&
      primaryCapability &&
      item.capabilities.includes(primaryCapability),
  );
  if (primaryMatch?.id && primaryMatch.id !== "all") return primaryMatch.id;

  const fallbackMatch = expertFilters.find(
    (item) =>
      item.id !== "all" &&
      item.capabilities.some((capability) => capabilities.has(capability)),
  );
  return fallbackMatch?.id && fallbackMatch.id !== "all"
    ? fallbackMatch.id
    : "coordination";
};

const roleMatchesExpertFilter = (
  role: CapabilityRole,
  filter: ExpertFilter,
) => {
  return filter === "all" || getRoleExpertFilter(role) === filter;
};

const compactCount = (count: number, noun: string) =>
  translate("capabilities.countWithNoun", "{count} {noun}", { count, noun });

const ICON_TONES: Record<
  SemanticIconTone,
  { foreground: string; background: string; border: string }
> = {
  blue: { foreground: "#2563eb", background: "#eff6ff", border: "#bfdbfe" },
  indigo: { foreground: "#4f46e5", background: "#eef2ff", border: "#c7d2fe" },
  violet: { foreground: "#7c3aed", background: "#f5f3ff", border: "#ddd6fe" },
  cyan: { foreground: "#0e7490", background: "#ecfeff", border: "#a5f3fc" },
  teal: { foreground: "#0f766e", background: "#f0fdfa", border: "#99f6e4" },
  green: { foreground: "#15803d", background: "#f0fdf4", border: "#bbf7d0" },
  amber: { foreground: "#b45309", background: "#fffbeb", border: "#fde68a" },
  orange: { foreground: "#c2410c", background: "#fff7ed", border: "#fed7aa" },
  rose: { foreground: "#be123c", background: "#fff1f2", border: "#fecdd3" },
  slate: { foreground: "#475569", background: "#f8fafc", border: "#cbd5e1" },
};

const EXPERT_ICON_BY_NAME: Record<string, LucideIcon> = {
  coder: Code2,
  reviewer: SearchCheck,
  researcher: Microscope,
  tester: FlaskConical,
  architect: Blocks,
  writer: PenLine,
  designer: Palette,
  project_manager: ClipboardList,
  product_manager: Target,
  data_analyst: ChartNoAxesCombined,
  marketing: Megaphone,
  support: MessageCircleQuestion,
  devops: ServerCog,
  security_analyst: ShieldCheck,
  assistant: HandHelping,
  "finance-lead": CircleDollarSign,
  "finance-data-reader": FileSearch,
  "finance-model-builder": Calculator,
  "finance-document-writer": NotebookPen,
  "finance-reviewer": BadgeCheck,
  "finance-controller": ReceiptText,
};

function CapabilityPageIntro({
  tab,
  metrics,
}: {
  tab: CapabilityTab;
  metrics: Array<{ value: number; label: string }>;
}) {
  const Icon = capabilityTabIcons[tab];
  const copy = capabilityIntroCopy[tab];

  return (
    <section
      className="capability-page-intro"
      aria-labelledby={`capability-${tab}-title`}
    >
      <div className="capability-page-intro-copy">
        <span className="capability-page-intro-icon" aria-hidden="true">
          <Icon size={19} weight="duotone" />
        </span>
        <div>
          <h2 id={`capability-${tab}-title`}>{copy.title}</h2>
          <p>{copy.description}</p>
        </div>
      </div>
      <dl
        className="capability-page-intro-metrics"
        aria-label={translate("capabilities.overviewLabel", "{name} overview", {
          name: tabCopy[tab].label,
        })}
      >
        {metrics.map((metric) => (
          <div key={metric.label}>
            <dt>{metric.label}</dt>
            <dd>{metric.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function CapabilityCenter({
  onOpenExperts,
  onOpenSkillsSettings,
  onCreateExpertTask,
  onUseSkill,
  onUseBundle,
  initialTab = "skills",
  mode = "tools",
  onBackToTeam,
}: CapabilityCenterProps) {
  const appLanguage = useLanguage();
  const isTeamExpertLibrary = mode === "teamExperts";
  const [activeTab, setActiveTab] = useState<CapabilityTab>(
    isTeamExpertLibrary
      ? "experts"
      : initialTab === "experts"
        ? "skills"
        : initialTab,
  );
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState<CapabilityRole[]>([]);
  const [skills, setSkills] = useState<SkillStatusEntry[]>([]);
  const [connectors, setConnectors] = useState<
    Array<{ id: string; name: string; description?: string; enabled: boolean }>
  >([]);
  const [connectorStatus, setConnectorStatus] = useState<
    CapabilityConnectorStatus[]
  >([]);
  const [bundles, setBundles] = useState<CapabilityBundle[]>([]);
  const [selectedBundle, setSelectedBundle] = useState<CapabilityBundle | null>(
    null,
  );
  const [selectedTarget, setSelectedTarget] = useState<ExpertTarget>(null);
  const [expertFilter, setExpertFilter] = useState<ExpertFilter>("all");
  const [skillFilter, setSkillFilter] = useState<SkillFilter>("all");
  const [skillScene, setSkillScene] = useState<SkillSceneId>("all");
  const [isSceneMenuOpen, setIsSceneMenuOpen] = useState(false);
  const [selectedSkill, setSelectedSkill] = useState<SkillStatusEntry | null>(
    null,
  );
  const [skillDetailLanguage, setSkillDetailLanguage] =
    useState<SupportedLanguage>(appLanguage);
  const [skillSort, setSkillSort] = useState<"default" | "name">("default");
  const [skillCatalogCategory, setSkillCatalogCategory] =
    useState<SkillCatalogCategoryId>("all");
  const [skillCatalogLimit, setSkillCatalogLimit] = useState(12);
  const [taskBrief, setTaskBrief] = useState("");
  const [creatingTask, setCreatingTask] = useState(false);
  const [managerMode, setManagerMode] = useState<CapabilityManagerMode>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [bundleTogglePending, setBundleTogglePending] = useState<string | null>(
    null,
  );
  const taskComposerRef = useRef<HTMLFormElement>(null);
  const taskInputRef = useRef<HTMLTextAreaElement>(null);
  const sceneMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSkillDetailLanguage(appLanguage);
  }, [appLanguage]);

  useEffect(() => {
    if (!isSceneMenuOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!sceneMenuRef.current?.contains(event.target as Node)) {
        setIsSceneMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsSceneMenuOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isSceneMenuOpen]);

  useEffect(() => {
    setSkillCatalogCategory("all");
    setSkillCatalogLimit(12);
  }, [skillScene]);

  const requestRefresh = useCallback(() => {
    setLoading(true);
    setRefreshVersion((version) => version + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [nextRoles, skillReport, mcpSettings, statuses, nextBundles] =
          await Promise.all([
            window.electronAPI.getAgentRoles(true),
            window.electronAPI.getSkillStatus(),
            window.electronAPI.getMCPSettings(),
            window.electronAPI.getMCPStatus(),
            window.electronAPI.listPluginPacks(),
          ]);
        if (cancelled) return;
        setRoles(nextRoles);
        setSkills(
          skillReport.skills.filter(isSkillVisibleForCurrentProductSupport),
        );
        setConnectors(mcpSettings.servers);
        setConnectorStatus(statuses);
        setBundles(
          nextBundles
            .filter((bundle) =>
              isPluginPackVisibleForCurrentProductSupport(bundle.name),
            )
            .map((bundle) => {
              const visibleSkills = bundle.skills.filter(
                isSkillVisibleForCurrentProductSupport,
              );
              const visibleSkillIds = new Set(
                visibleSkills.map((skill) => skill.id),
              );
              return {
                ...bundle,
                skills: visibleSkills,
                slashCommands: bundle.slashCommands.filter((command) =>
                  visibleSkillIds.has(command.skillId),
                ),
                recommendedConnectors: (
                  bundle.recommendedConnectors || []
                ).filter(isProductIntegrationVisible),
              };
            }),
        );
      } catch (error) {
        console.warn("[CapabilityCenter] Failed to load capabilities", error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    const refresh = () => {
      void load();
    };

    refresh();
    window.addEventListener(SKILL_INVENTORY_UPDATED_EVENT, refresh);
    window.addEventListener(MESSAGE_SHORTCUTS_UPDATED_EVENT, refresh);
    return () => {
      cancelled = true;
      window.removeEventListener(SKILL_INVENTORY_UPDATED_EVENT, refresh);
      window.removeEventListener(MESSAGE_SHORTCUTS_UPDATED_EVENT, refresh);
    };
  }, [refreshVersion]);

  useEffect(() => {
    setSkillCatalogCategory("all");
    setSkillCatalogLimit(12);
  }, [query, skillFilter, skillScene]);

  const counts = {
    experts: roles.length,
    skills: skills.length,
    bundles: bundles.length,
    connectors: connectors.length,
    mcp: connectors.length,
  };
  const availableCounts = {
    experts: roles.filter((role) => role.isActive).length,
    skills: skills.filter((skill) => skill.eligible && !skill.disabled).length,
    bundles: bundles.filter((bundle) => bundle.enabled && !bundle.policyBlocked)
      .length,
    connectors: connectors.filter((connector) => connector.enabled).length,
    mcp: connectors.filter((connector) => connector.enabled).length,
  };
  const statusById = useMemo(
    () => new Map(connectorStatus.map((status) => [status.id, status])),
    [connectorStatus],
  );
  const normalisedQuery = query.trim().toLocaleLowerCase();
  const matches = (value: string | undefined) =>
    !normalisedQuery ||
    (value || "").toLocaleLowerCase().includes(normalisedQuery);
  const browseAllSkills = () => {
    setQuery("");
    setSkillScene("all");
    setSkillFilter("all");
    setSelectedSkill(null);
    setSkillCatalogCategory("all");
    setSkillCatalogLimit(12);
  };
  const openCurrentManager = () => {
    if (activeTab === "experts") {
      onOpenExperts();
      return;
    }
    if (activeTab === "skills") {
      onOpenSkillsSettings();
      return;
    }
    if (activeTab === "connectors" || activeTab === "mcp") {
      setManagerMode("connectors");
      return;
    }
    requestRefresh();
  };

  const openConnectorManager = () => setManagerMode("connectors");

  const toggleBundle = async (bundle: CapabilityBundle) => {
    if (bundleTogglePending) return;
    setBundleTogglePending(bundle.name);
    try {
      await window.electronAPI.togglePluginPack(bundle.name, !bundle.enabled);
      setSelectedBundle((current) =>
        current?.name === bundle.name
          ? { ...current, enabled: !bundle.enabled }
          : current,
      );
      requestRefresh();
    } finally {
      setBundleTogglePending(null);
    }
  };

  const queryMatchedRoles = roles.filter((role) => {
    const localized = getLocalizedAgentRoleText(role);
    return matches(
      `${role.displayName} ${role.name} ${role.description || ""} ${localized.name} ${localized.description}`,
    );
  });
  const visibleRoles = queryMatchedRoles.filter((role) =>
    roleMatchesExpertFilter(role, expertFilter),
  );
  const uniqueSkills = dedupeSkillsByDisplayName(skills);
  const queryMatchedSkills = uniqueSkills.filter((skill) => {
    const localized = getLocalizedSkillText(skill);
    return matches(
      `${skill.name} ${skill.id} ${skill.description || ""} ${localized.name} ${localized.description}`,
    );
  });
  const selectedSkillScene =
    skillScene === "all" || skillScene === "custom"
      ? null
      : SKILL_SCENES.find((scene) => scene.id === skillScene) || null;
  const sceneMatchedSkills =
    skillScene === "all"
      ? queryMatchedSkills
      : skillScene === "custom"
        ? queryMatchedSkills.filter(isCustomSkillEntry)
        : queryMatchedSkills.filter((skill) => {
            const scene = SKILL_SCENES.find((item) => item.id === skillScene);
            return scene ? skillMatchesScene(skill, scene) : true;
          });
  const skillFilterCounts: Record<SkillFilter, number> = {
    all: sceneMatchedSkills.length,
    ready: sceneMatchedSkills.filter(
      (skill) => skill.eligible && !skill.disabled,
    ).length,
    setup: sceneMatchedSkills.filter(
      (skill) => !skill.eligible && !skill.disabled,
    ).length,
    disabled: sceneMatchedSkills.filter((skill) => skill.disabled).length,
  };
  const visibleSkills = sceneMatchedSkills.filter((skill) => {
    if (skillFilter === "ready") return skill.eligible && !skill.disabled;
    if (skillFilter === "setup") return !skill.eligible && !skill.disabled;
    if (skillFilter === "disabled") return skill.disabled;
    return true;
  });
  const orderedVisibleSkills =
    skillSort === "name"
      ? [...visibleSkills].sort((first, second) => {
          const firstName =
            getLocalizedSkillText(first).name || first.name || first.id;
          const secondName =
            getLocalizedSkillText(second).name || second.name || second.id;
          return firstName.localeCompare(secondName, "zh-CN");
        })
      : visibleSkills;
  const highlightedSkills = orderedVisibleSkills.slice(0, 5);
  const catalogSkills = orderedVisibleSkills.slice(5);
  const activeCatalogCategories =
    selectedSkillScene?.catalogCategories || DEFAULT_SKILL_CATALOG_CATEGORIES;
  const activeSkillCatalogCategory = activeCatalogCategories.some(
    (category) => category.id === skillCatalogCategory,
  )
    ? skillCatalogCategory
    : "all";
  const catalogCategoryCounts = activeCatalogCategories.reduce<
    Record<string, number>
  >((result, category) => {
    result[category.id] =
      category.id === "all"
        ? catalogSkills.length
        : catalogSkills.filter(
            (skill) =>
              getSkillCatalogCategory(skill, activeCatalogCategories) ===
              category.id,
          ).length;
    return result;
  }, {});
  const filteredCatalogSkills =
    activeSkillCatalogCategory === "all"
      ? catalogSkills
      : catalogSkills.filter(
          (skill) =>
            getSkillCatalogCategory(skill, activeCatalogCategories) ===
            activeSkillCatalogCategory,
        );
  const skillSceneGroups = SKILL_SCENES.map((scene) => ({
    scene,
    skills: uniqueSkills
      .filter((skill) => skillMatchesScene(skill, scene))
      .sort(
        (first, second) =>
          Number(second.eligible && !second.disabled) -
          Number(first.eligible && !first.disabled),
      ),
  }));
  const showSkillBento =
    activeTab === "skills" &&
    skillScene === "all" &&
    skillFilter === "all" &&
    !normalisedQuery;
  const selectedSkillSceneLabel =
    skillScene === "custom"
      ? translate("capabilities.scene.custom", "Custom")
      : selectedSkillScene?.title;
  const selectedSkillSceneDescription =
    skillScene === "custom"
      ? translate(
          "capabilities.scene.customDescription",
          "Skills you created, imported from an external directory, or added in the current workspace.",
        )
      : selectedSkillScene?.description;
  const SelectedSceneIcon =
    skillScene === "custom"
      ? CirclesThreePlus
      : selectedSkillScene?.Icon || PhMagnifyingGlass;
  const visibleConnectors = connectors.filter((connector) =>
    matches(
      `${connector.name} ${connector.description || ""} ${getLocalizedMcpServerDescription(connector)}`,
    ),
  );
  const visibleBundles = bundles.filter((bundle) => {
    const text = getCapabilityBundleText(bundle);
    return matches(
      [
        text.name,
        text.description,
        bundle.category,
        ...bundle.skills.map((skill) => `${skill.name} ${skill.description}`),
        ...(bundle.recommendedConnectors || []),
      ].join(" "),
    );
  });
  const emptyMessage = normalisedQuery
    ? translate(
        "generated.components.capabilitycenter.923.222",
        "No match found",
      )
    : translate(
        "generated.components.capabilitycenter.923.223",
        "There is no ability to display here yet",
      );
  const selectedRole = selectedTarget
    ? roles.find((role) => role.id === selectedTarget) || null
    : null;
  const selectedRoleText = selectedRole
    ? getLocalizedAgentRoleText(selectedRole)
    : null;
  const hasValidTarget = Boolean(selectedRole?.isActive);
  const canCreateTask = Boolean(
    hasValidTarget && taskBrief.trim() && onCreateExpertTask && !creatingTask,
  );

  const focusTaskComposer = () => {
    window.requestAnimationFrame(() => {
      const reduceMotion = window.matchMedia?.(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      taskComposerRef.current?.scrollIntoView({
        behavior: reduceMotion ? "auto" : "smooth",
        block: "center",
      });
      window.setTimeout(
        () => taskInputRef.current?.focus(),
        reduceMotion ? 0 : 260,
      );
    });
  };

  const selectExpert = (role: CapabilityRole) => {
    if (!role.isActive) return;
    setSelectedTarget(role.id);
    focusTaskComposer();
  };

  const submitExpertTask = async (event: FormEvent) => {
    event.preventDefault();
    const brief = taskBrief.trim();
    if (
      !brief ||
      !selectedTarget ||
      !hasValidTarget ||
      !onCreateExpertTask ||
      creatingTask
    )
      return;

    const targetName =
      selectedRoleText?.name ||
      translate(
        "generated.components.capabilitycenter.955.224",
        "expert tasks",
      );
    const mention = `@${selectedRole?.name}`;
    const title = `${targetName}：${brief.slice(0, 42)}${brief.length > 42 ? "…" : ""}`;

    setCreatingTask(true);
    try {
      await onCreateExpertTask(title, `${mention}\n${brief}`);
    } finally {
      setCreatingTask(false);
    }
  };

  const useCapabilityBundle = async (bundle: CapabilityBundle) => {
    if (!onUseBundle || !bundle.enabled || bundle.policyBlocked) return;
    const text = getCapabilityBundleText(bundle);
    const prompt = [
      translate(
        "capabilities.bundlePrompt",
        "Use the “{name}” capability bundle to help me complete the following task.",
        { name: text.name },
      ),
      "",
      translate(
        "generated.components.capabilitycenter.973.225",
        "Mission objectives:",
      ),
      translate(
        "generated.components.capabilitycenter.974.226",
        "[Please describe the problem you want to solve or the result you hope to achieve]",
      ),
      "",
      translate("generated.components.capabilitycenter.976.227", "Enter data:"),
      translate(
        "generated.components.capabilitycenter.977.228",
        "[Please add context, documents, links, scope or time range]",
      ),
      "",
      translate(
        "generated.components.capabilitycenter.979.229",
        "Delivery requirements:",
      ),
      translate(
        "generated.components.capabilitycenter.980.230",
        "[Please specify output format, focus, language, length and deadline]",
      ),
      "",
      translate(
        "generated.components.capabilitycenter.982.231",
        "Please restate the requirements before starting execution; if key information is missing, please ask me questions first.",
      ),
    ].join("\n");
    setSelectedBundle(null);
    await onUseBundle({
      bundleId: bundle.name,
      bundleLabel: text.name,
      prompt,
    });
  };

  const displayedCount =
    activeTab === "experts"
      ? visibleRoles.length
      : activeTab === "skills"
        ? visibleSkills.length
        : activeTab === "bundles"
          ? visibleBundles.length
          : visibleConnectors.length;
  const availableToolCount = connectorStatus.reduce(
    (total, status) => total + (status.tools?.length || 0),
    0,
  );
  const introMetrics: Record<
    CapabilityTab,
    Array<{ value: number; label: string }>
  > = {
    experts: [
      {
        value: availableCounts.experts,
        label: translate(
          "generated.components.capabilitycenter.1006.232",
          "Assignable experts",
        ),
      },
      {
        value: availableCounts.skills,
        label: translate(
          "generated.components.capabilitycenter.1007.233",
          "Available skills",
        ),
      },
    ],
    skills: [
      {
        value: availableCounts.skills,
        label: translate(
          "generated.components.capabilitycenter.1010.234",
          "Can be used directly",
        ),
      },
      {
        value: counts.skills,
        label: translate(
          "generated.components.capabilitycenter.1011.235",
          "All skills",
        ),
      },
    ],
    bundles: [
      {
        value: availableCounts.bundles,
        label: translate(
          "generated.components.capabilitycenter.1014.236",
          "Can be used directly",
        ),
      },
      {
        value: counts.bundles,
        label: translate(
          "generated.components.capabilitycenter.1015.237",
          "All combinations",
        ),
      },
    ],
    connectors: [
      {
        value: availableCounts.connectors,
        label: translate(
          "generated.components.capabilitycenter.1018.238",
          "Enabled",
        ),
      },
      {
        value: counts.connectors,
        label: translate(
          "generated.components.capabilitycenter.1019.239",
          "Connect all",
        ),
      },
    ],
    mcp: [
      {
        value: availableCounts.mcp,
        label: translate(
          "generated.components.capabilitycenter.1022.240",
          "Service enabled",
        ),
      },
      {
        value: availableToolCount,
        label: translate(
          "generated.components.capabilitycenter.1023.241",
          "Available tools",
        ),
      },
    ],
  };

  if (managerMode === "connectors") {
    return (
      <main className="main-content capability-center-page capability-manager-page">
        <NeoWorkerPageHeader
          className="capability-center-product-header capability-manager-header"
          title={translate(
            "generated.components.capabilitycenter.1033.243",
            "Management connector",
          )}
          description={translate(
            "generated.components.capabilitycenter.1037.245",
            "Connect external tools with real data and add, connect, test and configure permissions here.",
          )}
          icon={<PlugsConnected size={19} weight="duotone" />}
          actions={
            <div className="capability-manager-header-actions">
              <button
                type="button"
                className="capability-center-secondary-button"
                onClick={requestRefresh}
              >
                <RefreshCw size={15} />{" "}
                {translate(
                  "generated.components.capabilitycenter.1053.246",
                  "Refresh",
                )}
              </button>
              <button
                type="button"
                className="capability-center-secondary-button"
                onClick={() => {
                  setManagerMode(null);
                  requestRefresh();
                }}
              >
                <ArrowRight size={15} className="is-back-arrow" />{" "}
                {translate(
                  "generated.components.capabilitycenter.1063.247",
                  "Return to capability homepage",
                )}
              </button>
            </div>
          }
        />
        <section className="capability-manager-shell">
          <div className="capability-manager-content is-connectors">
            <MCPSettings />
          </div>
        </section>
      </main>
    );
  }

  return (
    <main
      className={`main-content capability-center-page${activeTab === "skills" ? " is-skills" : ""}${isTeamExpertLibrary ? " is-team-expert-library" : ""}`}
    >
      <NeoWorkerPageHeader
        className="capability-center-product-header"
        title={
          isTeamExpertLibrary
            ? translate(
                "generated.components.capabilitycenter.1111.251",
                "Expert database",
              )
            : translate(
                "generated.components.capabilitycenter.1111.252",
                "Tools and Skills",
              )
        }
        description={
          isTeamExpertLibrary
            ? translate(
                "generated.components.capabilitycenter.1114.253",
                "When it is necessary to identify the person responsible, select an expert here and describe the task.",
              )
            : translate(
                "generated.components.capabilitycenter.1115.254",
                "View skills, capability sets, connectors, and MCP services in one place to find out-of-the-box capabilities by work scenario.",
              )
        }
        icon={
          isTeamExpertLibrary ? (
            <PhUsersThree size={19} weight="duotone" />
          ) : (
            <CirclesThreePlus size={19} weight="duotone" />
          )
        }
        actions={
          <div className="capability-center-header-actions">
            <button
              type="button"
              className="capability-center-icon-button"
              onClick={requestRefresh}
              aria-label={translate(
                "generated.components.capabilitycenter.1130.255",
                "Refresh capability data",
              )}
              title={translate(
                "generated.components.capabilitycenter.1131.256",
                "Refresh capability data",
              )}
            >
              <RefreshCw size={15} className={loading ? "is-spinning" : ""} />
            </button>
            <button
              type="button"
              className="capability-center-secondary-button"
              onClick={openCurrentManager}
            >
              {isTeamExpertLibrary ? (
                <Settings2 size={16} />
              ) : activeTab === "skills" ? (
                <Settings2 size={16} />
              ) : activeTab === "bundles" ? (
                <RefreshCw size={16} />
              ) : (
                <Settings2 size={16} />
              )}
              {isTeamExpertLibrary
                ? translate(
                    "generated.components.capabilitycenter.1150.257",
                    "management expert",
                  )
                : activeTab === "bundles"
                  ? translate(
                      "generated.components.capabilitycenter.1152.258",
                      "Refresh ability combination",
                    )
                  : translate("capabilities.manageNamed", "Manage {name}", {
                      name: tabCopy[activeTab].label,
                    })}
            </button>
            {isTeamExpertLibrary && onBackToTeam ? (
              <button
                type="button"
                className="capability-center-secondary-button"
                onClick={onBackToTeam}
              >
                <ArrowRight size={15} className="is-back-arrow" />{" "}
                {translate(
                  "generated.components.capabilitycenter.1161.259",
                  "Return to team",
                )}
              </button>
            ) : null}
          </div>
        }
      />
      <section className="capability-center-shell">
        {!isTeamExpertLibrary ? (
          <nav
            className={`capability-center-tabs${activeTab === "skills" ? " is-skills" : ""}`}
            aria-label={translate(
              "generated.components.capabilitycenter.1171.260",
              "Ability type",
            )}
          >
            <div className="capability-center-tab-list">
              {TOOL_CAPABILITY_TABS.map((tab) => {
                const Icon = capabilityTabIcons[tab];
                const selected = activeTab === tab;
                return (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => {
                      setActiveTab(tab);
                      setQuery("");
                      setSkillScene("all");
                      setSkillFilter("all");
                    }}
                    onMouseDown={(event) => event.preventDefault()}
                    aria-current={selected ? "page" : undefined}
                    className={selected ? "is-selected" : ""}
                  >
                    <Icon size={17} weight="duotone" /> {tabCopy[tab].label}{" "}
                    <span>{counts[tab]}</span>
                  </button>
                );
              })}
            </div>
            <label className="capability-center-search">
              <Search size={16} />
              <span className="sr-only">
                {translate(
                  "generated.components.capabilitycenter.1199.261",
                  "Search",
                )}
                {tabCopy[activeTab].label}
              </span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={translate(
                  "capabilities.searchNamed",
                  "Search {name}…",
                  { name: tabCopy[activeTab].label },
                )}
              />
            </label>
          </nav>
        ) : null}

        <CapabilityPageIntro
          tab={activeTab}
          metrics={introMetrics[activeTab]}
        />

        {activeTab === "skills" && (
          <section
            className={`skill-scene-browser${showSkillBento ? "" : " is-detail"}`}
            aria-labelledby="capability-skills-title"
          >
            <div className="skill-scene-controls">
              <div className="skill-scene-filter-row">
                <div
                  className="skill-scene-filter-list"
                  role="group"
                  aria-label={translate(
                    "generated.components.capabilitycenter.1218.262",
                    "Filter skills by scenario",
                  )}
                >
                  {SKILL_SCENE_FILTERS.map((filter) => (
                    <button
                      key={filter.id}
                      type="button"
                      className={skillScene === filter.id ? "is-selected" : ""}
                      onClick={() => {
                        setSkillScene(filter.id);
                        setSkillFilter("all");
                        setIsSceneMenuOpen(false);
                      }}
                      aria-pressed={skillScene === filter.id}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>
                <div
                  ref={sceneMenuRef}
                  className="capability-center-scene-menu"
                >
                  <button
                    type="button"
                    className="capability-center-view-mode"
                    aria-haspopup="menu"
                    aria-expanded={isSceneMenuOpen}
                    onClick={() => setIsSceneMenuOpen((open) => !open)}
                  >
                    <LayoutGrid size={15} />
                    {selectedSkillSceneLabel ||
                      translate(
                        "generated.components.capabilitycenter.1236.264",
                        "Browse by scene",
                      )}
                    <ChevronDown
                      className={isSceneMenuOpen ? "is-open" : ""}
                      size={14}
                    />
                  </button>
                  {isSceneMenuOpen && (
                    <div
                      className="capability-center-scene-menu-popover"
                      role="menu"
                      aria-label={translate(
                        "generated.components.capabilitycenter.1218.262",
                        "Filter skills by scenario",
                      )}
                    >
                      {SKILL_SCENE_FILTERS.map((filter) => (
                        <button
                          key={filter.id}
                          type="button"
                          role="menuitemradio"
                          aria-checked={skillScene === filter.id}
                          className={
                            skillScene === filter.id ? "is-selected" : ""
                          }
                          onClick={() => {
                            setSkillScene(filter.id);
                            setSkillFilter("all");
                            setIsSceneMenuOpen(false);
                          }}
                        >
                          <span>{filter.label}</span>
                          {skillScene === filter.id ? (
                            <Check size={14} strokeWidth={2.2} />
                          ) : null}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {loading ? (
              <SkillSceneSkeleton />
            ) : showSkillBento ? (
              <div className="skill-scene-bento">
                {skillSceneGroups.map(({ scene, skills: sceneSkills }) => (
                  <SkillSceneCard
                    key={scene.id}
                    scene={scene}
                    skills={sceneSkills}
                    onOpenSkillDetail={setSelectedSkill}
                    onViewAll={() => {
                      setSkillScene(scene.id);
                      setSkillFilter("all");
                    }}
                  />
                ))}
              </div>
            ) : (
              <section
                className="skill-scene-results skill-workspace"
                aria-labelledby="skill-scene-results-title"
              >
                <div
                  className={`skill-workspace-hero${selectedSkillScene ? ` is-${selectedSkillScene.id}` : ""}`}
                  style={
                    selectedSkillScene
                      ? ({
                          "--skill-workspace-tone":
                            ICON_TONES[selectedSkillScene.tone].foreground,
                          "--skill-workspace-tint":
                            ICON_TONES[selectedSkillScene.tone].background,
                        } as React.CSSProperties)
                      : undefined
                  }
                >
                  <div className="skill-workspace-hero-copy">
                    <div className="skill-workspace-title-row">
                      <span className="skill-workspace-title-icon">
                        <SelectedSceneIcon size={23} weight="duotone" />
                      </span>
                      <h3 id="skill-scene-results-title">
                        {normalisedQuery
                          ? `“${query.trim()}”`
                          : selectedSkillSceneLabel ||
                            translate(
                              "generated.components.capabilitycenter.1283.265",
                              "All skills",
                            )}
                      </h3>
                      <span>
                        {visibleSkills.length}{" "}
                        {translate(
                          "generated.components.capabilitycenter.1285.266",
                          "skills",
                        )}
                      </span>
                      <span>
                        <CheckCircle size={13} weight="fill" />{" "}
                        {translate(
                          "generated.components.capabilitycenter.1287.267",
                          "Can be used directly",
                        )}
                        {skillFilterCounts.ready}
                      </span>
                      <span>
                        <WarningCircle size={13} weight="fill" />{" "}
                        {translate(
                          "generated.components.capabilitycenter.1290.268",
                          "Requires configuration",
                        )}
                        {skillFilterCounts.setup}
                      </span>
                    </div>
                    <p>
                      {normalisedQuery
                        ? translate(
                            "generated.components.capabilitycenter.1295.269",
                            "Sort out matching professional abilities for you by name, purpose and work scenario.",
                          )
                        : selectedSkillSceneDescription}
                    </p>
                  </div>
                  {selectedSkillScene && (
                    <SkillSceneArtwork
                      scene={selectedSkillScene}
                      alt={translate(
                        "capabilities.sceneArtworkAlt",
                        "{name} capability scene artwork",
                        { name: selectedSkillScene.title },
                      )}
                      variant="hero"
                    />
                  )}
                  <button
                    type="button"
                    className="skill-workspace-back"
                    onClick={() => {
                      setQuery("");
                      setSkillScene("all");
                      setSkillFilter("all");
                    }}
                  >
                    {translate(
                      "generated.components.capabilitycenter.1315.270",
                      "Return to scene overview",
                    )}
                    <PhArrowRight size={14} weight="bold" />
                  </button>
                </div>

                <div className="skill-workspace-toolbar">
                  <div
                    className="skill-scene-result-filters"
                    role="group"
                    aria-label={translate(
                      "generated.components.capabilitycenter.1323.271",
                      "Filter skills by status",
                    )}
                  >
                    {skillFilters.map((filter) => (
                      <button
                        key={filter.id}
                        type="button"
                        className={
                          skillFilter === filter.id ? "is-selected" : ""
                        }
                        onClick={() => setSkillFilter(filter.id)}
                        aria-pressed={skillFilter === filter.id}
                      >
                        {filter.label}
                        <span>{skillFilterCounts[filter.id]}</span>
                      </button>
                    ))}
                  </div>
                  <span>
                    <Stack size={16} weight="duotone" />{" "}
                    {translate(
                      "generated.components.capabilitycenter.1339.272",
                      "Organized by common use",
                    )}
                  </span>
                </div>

                {visibleSkills.length ? (
                  <>
                    <section
                      className="skill-workspace-feature-stage"
                      aria-labelledby="skill-featured-heading"
                    >
                      <div className="skill-workspace-section-heading">
                        <div>
                          <span>
                            <PhSparkle size={15} weight="fill" />{" "}
                            {translate(
                              "generated.components.capabilitycenter.1352.273",
                              "Today's recommendation",
                            )}
                          </span>
                          <h4 id="skill-featured-heading">
                            {translate(
                              "generated.components.capabilitycenter.1354.274",
                              "Start with the most commonly used abilities first",
                            )}
                          </h4>
                        </div>
                      </div>
                      <div className="skill-workspace-highlight-grid">
                        {highlightedSkills.map((skill, index) => (
                          <PolishedSkillCard
                            key={skill.id}
                            skill={skill}
                            onOpen={() => setSelectedSkill(skill)}
                            featured={index === 0}
                            featuredArt={
                              selectedSkillScene?.id === "research" ||
                              !selectedSkillScene
                                ? "/capability/research-featured-3d.webp"
                                : selectedSkillScene.image
                            }
                          />
                        ))}
                      </div>
                    </section>

                    {catalogSkills.length > 0 && (
                      <div className="skill-workspace-catalog">
                        <div className="skill-workspace-section-heading is-catalog">
                          <div>
                            <span>
                              <CirclesThreePlus size={15} weight="duotone" />{" "}
                              {translate(
                                "generated.components.capabilitycenter.1379.275",
                                "Skill Catalog",
                              )}
                            </span>
                            <h4>
                              {translate(
                                "generated.components.capabilitycenter.1381.276",
                                "More",
                              )}
                              {selectedSkillSceneLabel ||
                                translate(
                                  "generated.components.capabilitycenter.1381.277",
                                  "scene",
                                )}
                              {translate(
                                "generated.components.capabilitycenter.1381.278",
                                "Skills",
                              )}
                            </h4>
                          </div>
                          <small>
                            {translate(
                              "generated.components.capabilitycenter.1384.279",
                              "Currently showing",
                            )}
                            {Math.min(
                              filteredCatalogSkills.length,
                              skillCatalogLimit,
                            )}{" "}
                            / {filteredCatalogSkills.length}{" "}
                            {translate(
                              "generated.components.capabilitycenter.1385.280",
                              "a",
                            )}
                          </small>
                        </div>
                        <div className="skill-workspace-catalog-toolbar">
                          <div
                            className="skill-workspace-catalog-tabs"
                            role="tablist"
                            aria-label={translate(
                              "generated.components.capabilitycenter.1392.281",
                              "Skill classification",
                            )}
                          >
                            {activeCatalogCategories.map((category) => (
                              <button
                                key={category.id}
                                type="button"
                                role="tab"
                                aria-selected={
                                  activeSkillCatalogCategory === category.id
                                }
                                className={
                                  activeSkillCatalogCategory === category.id
                                    ? "is-selected"
                                    : ""
                                }
                                onClick={() => {
                                  setSkillCatalogCategory(category.id);
                                  setSkillCatalogLimit(12);
                                }}
                              >
                                {category.label}{" "}
                                <span>
                                  {catalogCategoryCounts[category.id]}
                                </span>
                              </button>
                            ))}
                          </div>
                          <button
                            type="button"
                            className="skill-workspace-catalog-sort"
                            onClick={() =>
                              setSkillSort((current) =>
                                current === "default" ? "name" : "default",
                              )
                            }
                          >
                            {skillSort === "default"
                              ? translate(
                                  "generated.components.capabilitycenter.1421.282",
                                  "Default sort",
                                )
                              : translate(
                                  "generated.components.capabilitycenter.1421.283",
                                  "Sort by name",
                                )}{" "}
                            <ChevronDown size={13} />
                          </button>
                        </div>
                        <div className="skill-workspace-catalog-grid">
                          {filteredCatalogSkills
                            .slice(0, skillCatalogLimit)
                            .map((skill) => (
                              <SkillResultRow
                                key={skill.id}
                                skill={skill}
                                onOpen={() => setSelectedSkill(skill)}
                              />
                            ))}
                          {filteredCatalogSkills.length === 0 && (
                            <div className="skill-workspace-catalog-empty">
                              {translate(
                                "generated.components.capabilitycenter.1435.284",
                                "There are currently no matching skills in this category",
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {filteredCatalogSkills.length > skillCatalogLimit && (
                      <div className="skill-scene-results-footer">
                        <button
                          type="button"
                          onClick={() =>
                            setSkillCatalogLimit((current) => current + 12)
                          }
                        >
                          {translate(
                            "generated.components.capabilitycenter.1448.285",
                            "Load more skills",
                          )}
                          <ChevronDown size={14} />
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <EmptyState
                    message={emptyMessage}
                    onOpen={browseAllSkills}
                    label={translate(
                      "generated.components.capabilitycenter.1457.286",
                      "View all skills",
                    )}
                  />
                )}
              </section>
            )}
          </section>
        )}

        {activeTab === "experts" && (
          <div className="capability-center-overview">
            <section
              className="expert-task-guide"
              aria-labelledby="expert-task-guide-title"
            >
              <div className="expert-task-guide-copy">
                <img
                  className="expert-task-guide-visual"
                  src="/capability/experts-hero-3d.webp"
                  alt=""
                />
                <span className="expert-task-guide-label">
                  {translate(
                    "generated.components.capabilitycenter.1474.287",
                    "First time use, start here",
                  )}
                </span>
                <h2 id="expert-task-guide-title">
                  {translate(
                    "generated.components.capabilitycenter.1475.288",
                    "Choose the person in charge and describe what needs to be accomplished",
                  )}
                </h2>
                <div
                  className="expert-task-steps"
                  aria-label={translate(
                    "generated.components.capabilitycenter.1476.289",
                    "Expert task usage process",
                  )}
                >
                  <div>
                    <strong>
                      {translate(
                        "generated.components.capabilitycenter.1478.290",
                        "Pick an expert",
                      )}
                    </strong>
                    <span>
                      {translate(
                        "generated.components.capabilitycenter.1479.291",
                        "Click on the card below",
                      )}
                    </span>
                  </div>
                  <ArrowRight size={17} aria-hidden="true" />
                  <div>
                    <strong>
                      {translate(
                        "generated.components.capabilitycenter.1483.292",
                        "write tasks",
                      )}
                    </strong>
                    <span>
                      {translate(
                        "generated.components.capabilitycenter.1484.293",
                        "State goals and results",
                      )}
                    </span>
                  </div>
                  <ArrowRight size={17} aria-hidden="true" />
                  <div>
                    <strong>
                      {translate(
                        "generated.components.capabilitycenter.1488.294",
                        "See the results",
                      )}
                    </strong>
                    <span>
                      {translate(
                        "generated.components.capabilitycenter.1489.295",
                        "Tracking in Mission Hub",
                      )}
                    </span>
                  </div>
                </div>
              </div>

              <form
                className="expert-task-composer"
                ref={taskComposerRef}
                onSubmit={submitExpertTask}
              >
                <div className="expert-task-composer-header">
                  <div>
                    <span>
                      {translate(
                        "generated.components.capabilitycenter.1501.296",
                        "Task leader",
                      )}
                    </span>
                    {selectedRole ? (
                      <strong>
                        <span className="expert-task-avatar">
                          {selectedRole.icon || "✦"}
                        </span>
                        {selectedRoleText?.name}
                      </strong>
                    ) : (
                      <strong className="is-empty">
                        <PhRobot size={18} weight="duotone" />{" "}
                        {translate(
                          "generated.components.capabilitycenter.1509.297",
                          "Please select an expert first",
                        )}
                      </strong>
                    )}
                  </div>
                  {selectedTarget && (
                    <button
                      type="button"
                      onClick={() => setSelectedTarget(null)}
                    >
                      {translate(
                        "generated.components.capabilitycenter.1515.298",
                        "Reselect",
                      )}
                    </button>
                  )}
                </div>
                <label htmlFor="expert-task-brief">
                  {translate(
                    "generated.components.capabilitycenter.1519.299",
                    "What do you hope to accomplish?",
                  )}
                </label>
                <textarea
                  id="expert-task-brief"
                  ref={taskInputRef}
                  value={taskBrief}
                  onChange={(event) => setTaskBrief(event.target.value)}
                  placeholder={translate(
                    "generated.components.capabilitycenter.1525.300",
                    "For example: analyze this sales data, find out the reasons for the anomalies, and organize it into a one-page conclusion.",
                  )}
                  rows={3}
                />
                <div className="expert-task-composer-footer">
                  <span>
                    {translate(
                      "generated.components.capabilitycenter.1529.301",
                      "After creation, enter the task details or continue tracking in the task hub.",
                    )}
                  </span>
                  <button type="submit" disabled={!canCreateTask}>
                    <Send size={15} />{" "}
                    {creatingTask
                      ? translate(
                          "generated.components.capabilitycenter.1531.302",
                          "Creating…",
                        )
                      : translate(
                          "generated.components.capabilitycenter.1531.303",
                          "Create tasks",
                        )}
                  </button>
                </div>
              </form>
            </section>

            <aside
              className="capability-center-summary"
              aria-label={translate(
                "generated.components.capabilitycenter.1537.304",
                "Capacity availability",
              )}
            >
              <div className="capability-summary-intro">
                <strong>
                  {translate(
                    "generated.components.capabilitycenter.1539.305",
                    "Experts are not running robots",
                  )}
                </strong>
                <span>
                  {translate(
                    "generated.components.capabilitycenter.1540.306",
                    '"Assignable" means it can be selected by you. Only after the task is created will the expert start working.',
                  )}
                </span>
              </div>
              <div className="capability-summary-stats">
                <Stat
                  icon={<PhRobot size={18} weight="duotone" />}
                  value={availableCounts.experts}
                  label={translate(
                    "generated.components.capabilitycenter.1546.307",
                    "Assignable experts",
                  )}
                />
                <Stat
                  icon={<PhSparkle size={18} weight="duotone" />}
                  value={availableCounts.skills}
                  label={translate(
                    "generated.components.capabilitycenter.1551.308",
                    "Available skills",
                  )}
                />
                <Stat
                  icon={<PlugsConnected size={18} weight="duotone" />}
                  value={availableCounts.connectors}
                  label={translate(
                    "generated.components.capabilitycenter.1556.309",
                    "Connection enabled",
                  )}
                />
              </div>
            </aside>
          </div>
        )}

        {activeTab === "experts" && (
          <div className="capability-center-section-heading">
            <div>
              <div className="capability-center-section-title">
                <h2>
                  {translate(
                    "generated.components.capabilitycenter.1569.310",
                    "Select task manager",
                  )}
                </h2>
                <span>
                  {loading
                    ? translate(
                        "generated.components.capabilitycenter.1571.311",
                        "Syncing...",
                      )
                    : compactCount(displayedCount, tabCopy[activeTab].label)}
                </span>
              </div>
              <p>{tabCopy[activeTab].description}</p>
            </div>
          </div>
        )}

        {!loading && activeTab === "experts" && (
          <div className="expert-directory-toolbar">
            <div
              className="expert-filter-list"
              role="group"
              aria-label={translate(
                "generated.components.capabilitycenter.1581.312",
                "Filter experts by job type",
              )}
            >
              {expertFilters.map((filter) => {
                const count = queryMatchedRoles.filter((role) =>
                  roleMatchesExpertFilter(role, filter.id),
                ).length;
                const selected = expertFilter === filter.id;
                return (
                  <button
                    key={filter.id}
                    type="button"
                    className={selected ? "is-selected" : ""}
                    onClick={() => setExpertFilter(filter.id)}
                    aria-pressed={selected}
                  >
                    {filter.label}
                    <span>{count}</span>
                  </button>
                );
              })}
            </div>
            <label className="capability-center-search expert-directory-search">
              <Search size={16} />
              <span className="sr-only">
                {translate(
                  "generated.components.capabilitycenter.1603.313",
                  "Search experts",
                )}
              </span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={translate(
                  "generated.components.capabilitycenter.1607.314",
                  "Search for experts…",
                )}
              />
            </label>
          </div>
        )}

        {activeTab === "skills" ? null : loading ? (
          <CapabilitySkeleton />
        ) : activeTab === "experts" ? (
          <div
            className={`capability-center-grid expert-directory-grid ${expertFilter === "all" ? "is-all" : "is-filtered"}`}
          >
            {visibleRoles.map((role) => (
              <ExpertCard
                key={role.id}
                role={role}
                skills={skills}
                selected={selectedTarget === role.id}
                onSelect={() => selectExpert(role)}
                onManage={onOpenExperts}
              />
            ))}
            {!visibleRoles.length && (
              <EmptyState
                message={emptyMessage}
                onOpen={onOpenExperts}
                label={translate(
                  "generated.components.capabilitycenter.1630.315",
                  "Go to Management Expert",
                )}
              />
            )}
          </div>
        ) : activeTab === "bundles" ? (
          <CapabilityBundleLibrary
            bundles={visibleBundles}
            onOpen={setSelectedBundle}
            onUse={(bundle) => void useCapabilityBundle(bundle)}
            onToggle={(bundle) => void toggleBundle(bundle)}
            pendingBundle={bundleTogglePending}
          />
        ) : (
          <div
            className={`connector-workspace${activeTab === "mcp" ? " is-mcp" : ""}`}
          >
            <section
              className="connector-current-section"
              aria-labelledby="connector-current-title"
            >
              <div className="connector-section-heading">
                <div>
                  <span>
                    {translate(
                      "generated.components.capabilitycenter.1649.316",
                      "Current connection",
                    )}
                  </span>
                  <h3 id="connector-current-title">
                    {activeTab === "mcp"
                      ? translate(
                          "generated.components.capabilitycenter.1651.317",
                          "MCP services and available tools",
                        )
                      : translate(
                          "generated.components.capabilitycenter.1651.318",
                          "Connected services",
                        )}
                  </h3>
                </div>
                <small>
                  {availableCounts.connectors}{" "}
                  {translate(
                    "generated.components.capabilitycenter.1654.319",
                    "enabled",
                  )}
                </small>
              </div>
              <div className="capability-center-grid connector-current-grid">
                {visibleConnectors.map((connector) => (
                  <ConnectorCard
                    key={connector.id}
                    connector={connector}
                    status={statusById.get(connector.id)}
                    onOpen={openConnectorManager}
                  />
                ))}
                {!visibleConnectors.length && (
                  <EmptyState
                    message={translate(
                      "generated.components.capabilitycenter.1667.320",
                      "No connector yet. After connecting to the service, experts can access external tools and data.",
                    )}
                    onOpen={openConnectorManager}
                    label={translate(
                      "generated.components.capabilitycenter.1669.321",
                      "Add connector",
                    )}
                  />
                )}
              </div>
            </section>

            {activeTab === "connectors" && (
              <section
                className="connector-recommendations"
                aria-labelledby="connector-recommendations-title"
              >
                <div className="connector-section-heading">
                  <div>
                    <span>
                      {translate(
                        "generated.components.capabilitycenter.1682.322",
                        "Recommended access",
                      )}
                    </span>
                    <h3 id="connector-recommendations-title">
                      {translate(
                        "generated.components.capabilitycenter.1683.323",
                        "Complete context for common tasks",
                      )}
                    </h3>
                  </div>
                  <small>
                    {translate(
                      "generated.components.capabilitycenter.1685.324",
                      "After configuration, it can be authorized for use in tasks.",
                    )}
                  </small>
                </div>
                <div className="connector-recommendation-grid">
                  <ConnectorRecommendation
                    icon={CloudArrowUp}
                    title={translate(
                      "generated.components.capabilitycenter.1690.325",
                      "Cloud disk and documents",
                    )}
                    description={translate(
                      "generated.components.capabilitycenter.1691.326",
                      "Read information, forms and deliverables.",
                    )}
                    onOpen={openConnectorManager}
                    tone="blue"
                  />
                  <ConnectorRecommendation
                    icon={ChatCircleDots}
                    title={translate(
                      "generated.components.capabilitycenter.1697.327",
                      "Team communication",
                    )}
                    description={translate(
                      "generated.components.capabilitycenter.1698.328",
                      "Find context in messages and discussions.",
                    )}
                    onOpen={openConnectorManager}
                    tone="violet"
                  />
                  <ConnectorRecommendation
                    icon={HardDrives}
                    title={translate(
                      "generated.components.capabilitycenter.1704.329",
                      "business data",
                    )}
                    description={translate(
                      "generated.components.capabilitycenter.1705.330",
                      "Connect databases and internal business systems.",
                    )}
                    onOpen={openConnectorManager}
                    tone="teal"
                  />
                </div>
              </section>
            )}
          </div>
        )}
      </section>
      {selectedSkill && (
        <SkillDetailDrawer
          skill={selectedSkill}
          language={skillDetailLanguage}
          onLanguageChange={setSkillDetailLanguage}
          onClose={() => setSelectedSkill(null)}
          onUse={(selection) => {
            setSelectedSkill(null);
            void onUseSkill?.(selection);
          }}
        />
      )}
      {selectedBundle && (
        <CapabilityBundleDrawer
          bundle={selectedBundle}
          onClose={() => setSelectedBundle(null)}
          onUse={() => void useCapabilityBundle(selectedBundle)}
          onToggle={() => void toggleBundle(selectedBundle)}
          togglePending={bundleTogglePending === selectedBundle.name}
        />
      )}
    </main>
  );
}

function getCapabilityBundleText(bundle: CapabilityBundle) {
  return {
    name: translate(
      `extensions.catalog.${bundle.name}.name`,
      bundle.displayName || bundle.name,
    ),
    description: translate(
      `extensions.catalog.${bundle.name}.description`,
      bundle.description ||
        "将相关技能、专家与连接器组合成可直接启用的工作能力。",
    ),
  };
}

function getCapabilityBundleIcon(bundle: CapabilityBundle): PhosphorIcon {
  const descriptor =
    `${bundle.category || ""} ${bundle.name} ${bundle.displayName}`.toLowerCase();

  if (/legal|法务|法律|合规|合同|治理/.test(descriptor)) return Scales;
  if (/security|安全|风控/.test(descriptor)) return PhShieldCheck;
  if (/engineering|工程|开发|代码|codex/.test(descriptor)) return PhCode;
  if (/marketing|营销|内容|增长/.test(descriptor)) return PhMegaphone;
  if (/data|数据|分析|报表/.test(descriptor)) return ChartLineUp;
  if (/operations|运营|支持|客户/.test(descriptor)) return PhRobot;
  if (/productivity|效率|快捷|办公/.test(descriptor)) return PhLightning;
  return Stack;
}

function CapabilityBundleLibrary({
  bundles,
  onOpen,
  onUse,
  onToggle,
  pendingBundle,
}: {
  bundles: CapabilityBundle[];
  onOpen: (bundle: CapabilityBundle) => void;
  onUse: (bundle: CapabilityBundle) => void;
  onToggle: (bundle: CapabilityBundle) => void;
  pendingBundle: string | null;
}) {
  return (
    <div className="capability-bundle-library">
      <div className="capability-bundle-heading">
        <div>
          <span>
            {translate(
              "generated.components.capabilitycenter.1780.331",
              "Competency portfolio directory",
            )}
          </span>
          <h3>
            {translate(
              "generated.components.capabilitycenter.1781.332",
              "Choose a combination that is close to your current goals",
            )}
          </h3>
        </div>
        <span className="capability-bundle-heading-hint">
          {translate(
            "generated.components.capabilitycenter.1783.333",
            "The activation status can be adjusted directly in the combination details",
          )}
        </span>
      </div>

      <div className="capability-bundle-grid">
        {bundles.map((bundle) => (
          <CapabilityBundleCard
            key={bundle.name}
            bundle={bundle}
            onOpen={() => onOpen(bundle)}
            onUse={() => onUse(bundle)}
            onToggle={() => onToggle(bundle)}
            togglePending={pendingBundle === bundle.name}
          />
        ))}
        {!bundles.length && (
          <div className="capability-bundle-empty">
            <Package size={24} />
            <strong>
              {translate(
                "generated.components.capabilitycenter.1800.334",
                "No matching ability combination found",
              )}
            </strong>
            <span>
              {translate(
                "generated.components.capabilitycenter.1801.335",
                "Clear the search terms and try again, or go to the management page to check the installed combinations.",
              )}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function CapabilityBundleCard({
  bundle,
  onOpen,
  onUse,
  onToggle,
  togglePending,
}: {
  bundle: CapabilityBundle;
  onOpen: () => void;
  onUse: () => void;
  onToggle: () => void;
  togglePending: boolean;
}) {
  const text = getCapabilityBundleText(bundle);
  const Icon = getCapabilityBundleIcon(bundle);
  const ready = bundle.enabled && !bundle.policyBlocked;
  return (
    <article
      className={`capability-bundle-card${ready ? " is-ready" : " is-disabled"}`}
    >
      <div className="capability-bundle-card-topline">
        <span className="capability-bundle-icon">
          <Icon size={20} weight="regular" />
        </span>
        <span className={`capability-bundle-state${ready ? " is-ready" : ""}`}>
          {ready ? (
            <CheckCircle size={14} weight="regular" />
          ) : (
            <WarningCircle size={14} weight="regular" />
          )}
          {ready
            ? translate(
                "generated.components.capabilitycenter.1837.336",
                "Can be used directly",
              )
            : bundle.policyBlocked
              ? translate(
                  "generated.components.capabilitycenter.1837.337",
                  "Restricted by policy",
                )
              : translate(
                  "generated.components.capabilitycenter.1837.338",
                  "Not enabled",
                )}
        </span>
      </div>
      <div className="capability-bundle-card-copy">
        <span>
          {bundle.category ||
            translate(
              "generated.components.capabilitycenter.1841.339",
              "Professional scene",
            )}
        </span>
        <h3>{text.name}</h3>
        <p>{text.description}</p>
      </div>
      <div
        className="capability-bundle-inventory"
        aria-label={translate(
          "generated.components.capabilitycenter.1845.340",
          "Combination content",
        )}
      >
        <span>
          <PhSparkle size={14} /> {bundle.skills.length}{" "}
          {translate(
            "generated.components.capabilitycenter.1847.341",
            "skills",
          )}
        </span>
        <span>
          <PhRobot size={14} /> {bundle.agentRoles.length}{" "}
          {translate(
            "generated.components.capabilitycenter.1850.342",
            "expert",
          )}
        </span>
        <span>
          <PlugsConnected size={14} />{" "}
          {bundle.recommendedConnectors?.length || 0}{" "}
          {translate(
            "generated.components.capabilitycenter.1853.343",
            "connectors",
          )}
        </span>
      </div>
      <div className="capability-bundle-card-footer">
        <button type="button" className="is-secondary" onClick={onOpen}>
          {translate(
            "generated.components.capabilitycenter.1858.344",
            "View portfolio",
          )}
          <ArrowRight size={14} />
        </button>
        {ready ? (
          <button type="button" className="is-primary" onClick={onUse}>
            {translate(
              "generated.components.capabilitycenter.1862.345",
              "Fill in the task requirements",
            )}
          </button>
        ) : (
          <button
            type="button"
            className="is-primary"
            onClick={onToggle}
            disabled={bundle.policyBlocked || togglePending}
          >
            {togglePending ? (
              <RefreshCw size={14} className="is-spinning" />
            ) : (
              <Check size={14} />
            )}
            {bundle.policyBlocked
              ? translate(
                  "generated.components.capabilitycenter.1872.346",
                  "Restricted by policy",
                )
              : togglePending
                ? translate(
                    "generated.components.capabilitycenter.1872.347",
                    "Enabling",
                  )
                : translate(
                    "generated.components.capabilitycenter.1872.348",
                    "enable combination",
                  )}
          </button>
        )}
      </div>
    </article>
  );
}

function CapabilityBundleDrawer({
  bundle,
  onClose,
  onUse,
  onToggle,
  togglePending,
}: {
  bundle: CapabilityBundle;
  onClose: () => void;
  onUse: () => void;
  onToggle: () => void;
  togglePending: boolean;
}) {
  const text = getCapabilityBundleText(bundle);
  const Icon = getCapabilityBundleIcon(bundle);
  const ready = bundle.enabled && !bundle.policyBlocked;
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) =>
      event.key === "Escape" && onClose();
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div className="capability-bundle-detail-layer" role="presentation">
      <button
        type="button"
        className="capability-bundle-detail-backdrop"
        onClick={onClose}
        aria-label={translate(
          "generated.components.capabilitycenter.1908.349",
          "Close ability combination details",
        )}
      />
      <aside
        className="capability-bundle-detail"
        role="dialog"
        aria-modal="true"
        aria-labelledby="capability-bundle-detail-title"
      >
        <header>
          <span className="capability-bundle-detail-icon">
            <Icon size={24} weight="regular" />
          </span>
          <div>
            <span>
              {bundle.category ||
                translate(
                  "generated.components.capabilitycenter.1921.350",
                  "Scenario capability",
                )}
            </span>
            <h2 id="capability-bundle-detail-title">{text.name}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={translate(
              "generated.components.capabilitycenter.1924.351",
              "Close",
            )}
          >
            <X size={19} />
          </button>
        </header>
        <div className="capability-bundle-detail-body">
          <p className="capability-bundle-detail-description">
            {text.description}
          </p>
          <div
            className={`capability-bundle-detail-status${ready ? " is-ready" : ""}`}
          >
            {ready ? (
              <CheckCircle size={16} weight="fill" />
            ) : (
              <WarningCircle size={16} weight="fill" />
            )}
            <span>
              <strong>
                {ready
                  ? translate(
                      "generated.components.capabilitycenter.1937.352",
                      "You can start directly",
                    )
                  : translate(
                      "generated.components.capabilitycenter.1937.353",
                      "Need to be enabled before use",
                    )}
              </strong>
              <small>
                {ready
                  ? translate(
                      "generated.components.capabilitycenter.1940.354",
                      "Combinations are enabled and the mission automatically selects the appropriate abilities within them.",
                    )
                  : translate(
                      "generated.components.capabilitycenter.1941.355",
                      "You can enable the combination on the current page; if it is still not available, check the connector or permissions again.",
                    )}
              </small>
            </span>
          </div>
          {bundle.outcomeExamples?.length ? (
            <section>
              <h3>
                {translate(
                  "generated.components.capabilitycenter.1947.356",
                  "Suitable for delivering results",
                )}
              </h3>
              <ul>
                {bundle.outcomeExamples.slice(0, 4).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          ) : null}
          <section>
            <h3>
              {translate(
                "generated.components.capabilitycenter.1956.357",
                "Contains skills",
              )}
            </h3>
            <div className="capability-bundle-detail-skills">
              {bundle.skills.slice(0, 10).map((skill) => {
                const localized = getLocalizedSkillText(skill);
                return (
                  <span key={skill.id}>
                    <PhSparkle size={14} />
                    <span>
                      <strong>{localized.name || skill.name}</strong>
                      <small>
                        {localized.description || skill.description}
                      </small>
                    </span>
                  </span>
                );
              })}
            </div>
          </section>
          {bundle.recommendedConnectors?.length ? (
            <section>
              <h3>
                {translate(
                  "generated.components.capabilitycenter.1974.358",
                  "Recommended connectors",
                )}
              </h3>
              <div className="capability-bundle-detail-connectors">
                {bundle.recommendedConnectors.map((connector) => (
                  <span key={connector}>
                    <PlugsConnected size={14} />
                    {connector}
                  </span>
                ))}
              </div>
            </section>
          ) : null}
        </div>
        <footer>
          <button
            type="button"
            className="is-secondary"
            onClick={onToggle}
            disabled={bundle.policyBlocked || togglePending}
          >
            {togglePending ? (
              <RefreshCw size={15} className="is-spinning" />
            ) : (
              <Settings2 size={15} />
            )}
            {bundle.policyBlocked
              ? translate(
                  "generated.components.capabilitycenter.1999.359",
                  "Restricted by policy",
                )
              : togglePending
                ? translate(
                    "generated.components.capabilitycenter.2001.360",
                    "Updating",
                  )
                : ready
                  ? translate(
                      "generated.components.capabilitycenter.2003.361",
                      "Deactivate combination",
                    )
                  : translate(
                      "generated.components.capabilitycenter.2004.362",
                      "enable combination",
                    )}
          </button>
          <button
            type="button"
            className="is-primary"
            onClick={onUse}
            disabled={!ready}
          >
            <Send size={15} />{" "}
            {translate(
              "generated.components.capabilitycenter.2007.363",
              "Fill in the task requirements",
            )}
          </button>
        </footer>
      </aside>
    </div>
  );
}

function Stat({
  icon,
  value,
  label,
}: {
  icon: ReactNode;
  value: number;
  label: string;
}) {
  return (
    <div className="capability-summary-stat">
      <span>{icon}</span>
      <strong>{value}</strong>
      <small>{label}</small>
    </div>
  );
}

function ExpertCard({
  role,
  skills,
  selected,
  onSelect,
  onManage,
}: {
  role: CapabilityRole;
  skills: SkillStatusEntry[];
  selected: boolean;
  onSelect: () => void;
  onManage: () => void;
}) {
  const localized = getLocalizedAgentRoleText(role);
  const capabilities = (role.capabilities || [])
    .slice(0, 3)
    .map(getLocalizedAgentCapability);
  const linkedSkills = getAgentRoleLinkedSkillLabels(role, skills);
  const visual = getSemanticIconVisual({
    id: role.id,
    name: localized.name || role.displayName || role.name,
    description: localized.description || role.description,
    category: role.capabilities?.[0],
    fallback: Bot,
  });
  const Icon = EXPERT_ICON_BY_NAME[role.name] || visual.Icon;
  const iconPalette = ICON_TONES[visual.tone];
  return (
    <article
      className={`capability-center-card expert-card${selected ? " is-selected" : ""}${!role.isActive ? " is-disabled" : ""}`}
      style={
        {
          "--capability-card-tone": iconPalette.foreground,
          "--capability-card-tint": iconPalette.background,
        } as React.CSSProperties
      }
    >
      <div className="expert-card-header">
        <span
          className="capability-center-icon expert-icon"
          style={{
            color: iconPalette.foreground,
            background: iconPalette.background,
            borderColor: iconPalette.border,
          }}
        >
          <Icon size={19} strokeWidth={1.8} />
        </span>
        <div className="expert-card-identity">
          <h3>{localized.name || role.displayName || role.name}</h3>
          <span
            className={`capability-card-state${role.isActive ? " is-ready" : " is-warning"}`}
          >
            {role.isActive ? <Check size={12} /> : <CircleAlert size={12} />}
            {role.isActive
              ? translate(
                  "generated.components.capabilitycenter.2075.364",
                  "Available",
                )
              : translate(
                  "generated.components.capabilitycenter.2075.365",
                  "Not enabled",
                )}
          </span>
        </div>
        <button
          type="button"
          className="expert-card-configure"
          onClick={onManage}
          aria-label={translate(
            "capabilities.configureNamed",
            "Configure {name}",
            { name: localized.name || role.displayName || role.name },
          )}
          title={translate(
            "generated.components.capabilitycenter.2083.366",
            "Configuration expert",
          )}
        >
          <Settings2 size={15} />
        </button>
      </div>
      <p>
        {localized.description ||
          translate(
            "generated.components.capabilitycenter.2088.367",
            "Can perform professional tasks for the team.",
          )}
      </p>
      <div
        className="expert-card-skills"
        aria-label={translate(
          "generated.components.capabilitycenter.2089.368",
          "Related skills",
        )}
      >
        <strong>
          {translate(
            "generated.components.capabilitycenter.2090.369",
            "Related skills",
          )}
        </strong>
        {linkedSkills.length ? (
          <div>
            {linkedSkills.slice(0, 2).map((skill) => (
              <span key={skill}>{skill}</span>
            ))}
            {linkedSkills.length > 2 ? (
              <em>+{linkedSkills.length - 2}</em>
            ) : null}
          </div>
        ) : (
          <span>
            {translate(
              "generated.components.capabilitycenter.2099.370",
              "Automatically match by task",
            )}
          </span>
        )}
      </div>
      <div className="expert-card-footer">
        {capabilities.length > 0 && (
          <div
            className="expert-capability-list"
            aria-label={translate(
              "generated.components.capabilitycenter.2104.371",
              "Good at ability",
            )}
          >
            {capabilities.map((capability) => (
              <span key={capability}>{capability}</span>
            ))}
          </div>
        )}
        <button
          type="button"
          className="expert-card-select"
          onClick={onSelect}
          disabled={!role.isActive}
          aria-pressed={selected}
        >
          <span>
            {selected ? <ClipboardCheck size={14} /> : <Send size={14} />}
            {selected
              ? translate(
                  "generated.components.capabilitycenter.2119.372",
                  "Selected",
                )
              : translate(
                  "generated.components.capabilitycenter.2119.373",
                  "Leave it to the experts",
                )}
          </span>
          <ArrowRight size={13} />
        </button>
      </div>
    </article>
  );
}

function SkillSceneArtwork({
  scene,
  alt,
  variant,
}: {
  scene: SkillSceneDefinition;
  alt: string;
  variant: "card" | "hero";
}) {
  const [failed, setFailed] = useState(false);
  const Icon = scene.Icon;

  useEffect(() => {
    setFailed(false);
  }, [scene.image]);

  if (failed) {
    return (
      <span
        className={`skill-scene-artwork-fallback is-${variant}`}
        role={alt ? "img" : undefined}
        aria-label={alt || undefined}
      >
        <Icon size={variant === "hero" ? 42 : 34} weight="duotone" />
      </span>
    );
  }

  return <img src={scene.image} alt={alt} onError={() => setFailed(true)} />;
}

function SkillSceneCard({
  scene,
  skills,
  onOpenSkillDetail,
  onViewAll,
}: {
  scene: SkillSceneDefinition;
  skills: SkillStatusEntry[];
  onOpenSkillDetail: (skill: SkillStatusEntry) => void;
  onViewAll: () => void;
}) {
  const Icon = scene.Icon;
  const palette = ICON_TONES[scene.tone];
  const visibleSceneSkills = skills.slice(0, 3);

  return (
    <article
      className={`skill-scene-card is-${scene.id}`}
      style={
        {
          "--skill-scene-tone": palette.foreground,
          "--skill-scene-tint": palette.background,
          "--skill-scene-border": palette.border,
        } as React.CSSProperties
      }
    >
      <div className="skill-scene-visual" aria-hidden="true">
        <SkillSceneArtwork scene={scene} alt="" variant="card" />
        <span className="skill-scene-visual-tint" />
        {scene.id === "research" && (
          <em>
            {translate(
              "generated.components.capabilitycenter.2188.374",
              "Recommended",
            )}
          </em>
        )}
      </div>
      <div className="skill-scene-body">
        <header className="skill-scene-card-header">
          <span className="skill-scene-icon">
            <Icon size={21} weight="duotone" />
          </span>
          <div>
            <h3>
              {scene.title}
              <small>
                {skills.length}{" "}
                {translate(
                  "generated.components.capabilitycenter.2198.375",
                  "skills",
                )}
              </small>
            </h3>
            <p>{scene.description}</p>
          </div>
        </header>

        <div className="skill-scene-skill-list">
          {visibleSceneSkills.map((skill) => {
            const localized = getLocalizedSkillText(skill);
            const ready = skill.eligible && !skill.disabled;
            return (
              <button
                key={skill.id}
                type="button"
                onClick={() => onOpenSkillDetail(skill)}
              >
                <span
                  className={`skill-scene-status-dot${ready ? " is-ready" : ""}`}
                  aria-hidden="true"
                />
                <strong>{localized.name || skill.name || skill.id}</strong>
                <span
                  className={`skill-scene-state${ready ? " is-ready" : ""}`}
                >
                  {ready
                    ? translate(
                        "generated.components.capabilitycenter.2216.376",
                        "Can be used directly",
                      )
                    : skill.disabled
                      ? translate(
                          "generated.components.capabilitycenter.2216.377",
                          "Deactivated",
                        )
                      : translate(
                          "generated.components.capabilitycenter.2216.378",
                          "Requires configuration",
                        )}
                </span>
                <ArrowRight size={13} aria-hidden="true" />
              </button>
            );
          })}
          {!visibleSceneSkills.length && (
            <div className="skill-scene-empty">
              {translate(
                "generated.components.capabilitycenter.2223.379",
                "There are currently no matching skills",
              )}
            </div>
          )}
        </div>

        <button
          type="button"
          className="skill-scene-view-all"
          onClick={onViewAll}
        >
          {translate(
            "generated.components.capabilitycenter.2228.380",
            "View all",
          )}
          <ArrowRight size={14} />
        </button>
      </div>
    </article>
  );
}

const SKILL_DETAIL_COPY: Record<
  SupportedLanguage,
  {
    close: string;
    languageLabel: string;
    defaultCategory: string;
    ready: string;
    disabled: string;
    setup: string;
    catalogSource: string;
    version: string;
    summaryHeading: string;
    summaryFallback: string;
    useWhenHeading: string;
    outputs: string;
    successCriteria: string;
    exampleHeading: string;
    exampleHint: string;
    shortcut: string;
    copied: string;
    copyCommand: string;
    requirementsHeading: string;
    infoHeading: string;
    canUseTitle: string;
    needsSetupTitle: string;
    automaticOnlyTitle: string;
    canUseHint: string;
    inactiveHint: string;
    useInChat: string;
    useAfterSetup: string;
    unavailable: string;
    sources: Record<string, string>;
  }
> = {
  "zh-CN": {
    close: translate(
      "generated.components.capabilitycenter.2270.381",
      "Close skill details",
    ),
    languageLabel: translate(
      "generated.components.capabilitycenter.2271.382",
      "Skill details language",
    ),
    defaultCategory: translate(
      "generated.components.capabilitycenter.2272.383",
      "Professional skills",
    ),
    ready: translate(
      "generated.components.capabilitycenter.2273.384",
      "Can be used directly",
    ),
    disabled: translate(
      "generated.components.capabilitycenter.2274.385",
      "Deactivated",
    ),
    setup: translate(
      "generated.components.capabilitycenter.2275.386",
      "Requires configuration",
    ),
    catalogSource: translate(
      "generated.components.capabilitycenter.2276.387",
      "Skill Catalog",
    ),
    version: translate(
      "generated.components.capabilitycenter.2277.388",
      "version",
    ),
    summaryHeading: translate(
      "generated.components.capabilitycenter.2278.389",
      "What can this skill do?",
    ),
    summaryFallback: translate(
      "generated.components.capabilitycenter.2279.390",
      "Supplement the intelligent agent with a reusable professional execution capability.",
    ),
    useWhenHeading: translate(
      "generated.components.capabilitycenter.2280.391",
      "when to use",
    ),
    outputs: translate(
      "generated.components.capabilitycenter.2281.392",
      "expected results",
    ),
    successCriteria: translate(
      "generated.components.capabilitycenter.2282.393",
      "Completion standards",
    ),
    exampleHeading: translate(
      "generated.components.capabilitycenter.2283.394",
      "Usage example",
    ),
    exampleHint: translate(
      "generated.components.capabilitycenter.2284.395",
      "You can continue to modify it in the input box",
    ),
    shortcut: translate(
      "generated.components.capabilitycenter.2285.396",
      "shortcut command",
    ),
    copied: translate(
      "generated.components.capabilitycenter.2286.397",
      "Copied",
    ),
    copyCommand: translate(
      "generated.components.capabilitycenter.2287.398",
      "Copy command",
    ),
    requirementsHeading: translate(
      "generated.components.capabilitycenter.2288.399",
      "Requires configuration before use",
    ),
    infoHeading: translate(
      "generated.components.capabilitycenter.2289.400",
      "Skill information",
    ),
    canUseTitle: translate(
      "generated.components.capabilitycenter.2290.401",
      "You can still add specific content before use",
    ),
    needsSetupTitle: translate(
      "generated.components.capabilitycenter.2291.402",
      "It can be used after completing the configuration",
    ),
    automaticOnlyTitle: translate(
      "generated.components.capabilitycenter.2292.403",
      "This skill can only be automatically called by the agent",
    ),
    canUseHint: translate(
      "generated.components.capabilitycenter.2293.404",
      "will not be executed immediately",
    ),
    inactiveHint: translate(
      "generated.components.capabilitycenter.2294.405",
      "The task will not be initiated at this time",
    ),
    useInChat: translate(
      "generated.components.capabilitycenter.2295.406",
      "use in conversation",
    ),
    useAfterSetup: translate(
      "generated.components.capabilitycenter.2296.407",
      "Use after configuration",
    ),
    unavailable: translate(
      "generated.components.capabilitycenter.2297.408",
      "Cannot be called manually",
    ),
    sources: {
      bundled: translate(
        "generated.components.capabilitycenter.2299.409",
        "NeoWorker built-in",
      ),
      managed: translate(
        "generated.components.capabilitycenter.2300.410",
        "Native installation",
      ),
      external: translate(
        "generated.components.capabilitycenter.2301.411",
        "external directory",
      ),
      workspace: translate(
        "generated.components.capabilitycenter.2302.412",
        "current workspace",
      ),
    },
  },
  en: {
    close: "Close skill details",
    languageLabel: "Skill detail language",
    defaultCategory: "Professional skill",
    ready: "Ready to use",
    disabled: "Disabled",
    setup: "Setup required",
    catalogSource: "Skill catalog",
    version: "Version",
    summaryHeading: "What this skill does",
    summaryFallback: "Adds a reusable professional workflow to the agent.",
    useWhenHeading: "When to use it",
    outputs: "Expected result",
    successCriteria: "Completion criteria",
    exampleHeading: "Example",
    exampleHint: "You can edit this in the composer",
    shortcut: "Shortcut",
    copied: "Copied",
    copyCommand: "Copy command",
    requirementsHeading: "Required setup",
    infoHeading: "Skill information",
    canUseTitle: "Add task details before using this skill",
    needsSetupTitle: "Complete setup to use this skill",
    automaticOnlyTitle: "This skill is available to the agent automatically",
    canUseHint: "This will not run immediately",
    inactiveHint: "No task will be started",
    useInChat: "Use in chat",
    useAfterSetup: "Use after setup",
    unavailable: "Not manually available",
    sources: {
      bundled: "Built into NeoWorker",
      managed: "Installed locally",
      external: "External directory",
      workspace: "Current workspace",
    },
  },
};

function SkillDetailDrawer({
  skill,
  language,
  onLanguageChange,
  onClose,
  onUse,
}: {
  skill: SkillStatusEntry;
  language: SupportedLanguage;
  onLanguageChange: (language: SupportedLanguage) => void;
  onClose: () => void;
  onUse: (selection: {
    skillId: string;
    skillLabel: string;
    prompt: string;
  }) => void;
}) {
  const [copied, setCopied] = useState(false);
  const copy = SKILL_DETAIL_COPY[language];
  const localized = getLocalizedSkillText(skill, language);
  const ready = skill.eligible && !skill.disabled;
  const visual = getSemanticIconVisual({
    id: skill.id,
    name: localized.name || skill.name || skill.id,
    description: localized.description || skill.description,
    category: skill.category,
    fallback: Wrench,
  });
  const palette = ICON_TONES[visual.tone];
  const Icon = getSkillPhosphorIcon(skill);
  const routing = skill.metadata?.routing;
  const localizedRouting = getLocalizedSkillRoutingText(
    skill,
    routing,
    language,
  );
  const invocationCommand = `/${skill.id}`;
  const displayName = localized.name || skill.name || skill.id;
  const upstreamExamplePrompt = routing?.examples?.positive
    ?.find((example) => example.trim())
    ?.trim();
  const examplePrompt = buildLocalizedSkillComposerPrompt(skill, {
    preferredPrompt: upstreamExamplePrompt,
    includeTaskPlaceholder: true,
    language,
  });
  const userInvocable = skill.invocation?.userInvocable !== false;
  const canUse = ready && userInvocable;
  const missingRequirements = [
    ...skill.missing.bins,
    ...skill.missing.anyBins,
    ...skill.missing.env,
    ...skill.missing.config,
    ...skill.missing.os,
  ];
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const copyCommand = async () => {
    try {
      await navigator.clipboard.writeText(invocationCommand);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="skill-detail-layer" role="presentation">
      <button
        type="button"
        className="skill-detail-backdrop"
        aria-label={copy.close}
        onClick={onClose}
      />
      <aside
        className="skill-detail-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="skill-detail-title"
        style={
          {
            "--skill-detail-tone": palette.foreground,
            "--skill-detail-tint": palette.background,
            "--skill-detail-border": palette.border,
          } as React.CSSProperties
        }
      >
        <header className="skill-detail-header">
          <div className="skill-detail-heading">
            <span className="skill-detail-icon">
              <Icon size={26} weight="duotone" />
            </span>
            <div>
              <span>
                {localized.category || skill.category || copy.defaultCategory}
              </span>
              <h2 id="skill-detail-title">
                {localized.name || skill.name || skill.id}
              </h2>
            </div>
          </div>
          <div className="skill-detail-header-actions">
            <div
              className="skill-detail-language-switch"
              role="group"
              aria-label={copy.languageLabel}
            >
              <button
                type="button"
                className={language === "zh-CN" ? "is-active" : ""}
                aria-pressed={language === "zh-CN"}
                onClick={() => onLanguageChange("zh-CN")}
              >
                {translate(
                  "generated.components.capabilitycenter.2451.413",
                  "Chinese",
                )}
              </button>
              <button
                type="button"
                className={language === "en" ? "is-active" : ""}
                aria-pressed={language === "en"}
                onClick={() => onLanguageChange("en")}
              >
                EN
              </button>
            </div>
            <button
              type="button"
              className="skill-detail-close"
              onClick={onClose}
              aria-label={copy.close}
            >
              <X size={19} />
            </button>
          </div>
        </header>

        <div className="skill-detail-status-row">
          <span
            className={`skill-detail-status${ready ? " is-ready" : " is-warning"}`}
          >
            {ready ? (
              <CheckCircle size={15} weight="fill" />
            ) : (
              <WarningCircle size={15} weight="fill" />
            )}
            {ready ? copy.ready : skill.disabled ? copy.disabled : copy.setup}
          </span>
          <span>{copy.sources[skill.source || ""] || copy.catalogSource}</span>
          {skill.metadata?.version && (
            <span>
              {copy.version} {skill.metadata.version}
            </span>
          )}
        </div>

        <section className="skill-detail-summary">
          <h3>{copy.summaryHeading}</h3>
          <p>
            {localized.description || skill.description || copy.summaryFallback}
          </p>
        </section>

        <section className="skill-detail-use-case">
          <h3>{copy.useWhenHeading}</h3>
          <p>{localizedRouting.useWhen}</p>
          <div>
            <strong>{copy.outputs}</strong>
            <span>{localizedRouting.outputs}</span>
          </div>
          <div>
            <strong>{copy.successCriteria}</strong>
            <span>{localizedRouting.successCriteria}</span>
          </div>
        </section>

        <section className="skill-detail-example">
          <div className="skill-detail-section-heading">
            <h3>{copy.exampleHeading}</h3>
            <span>{copy.exampleHint}</span>
          </div>
          <p>{examplePrompt}</p>
        </section>

        {userInvocable && (
          <section className="skill-detail-command">
            <div>
              <span>{copy.shortcut}</span>
              <code>{invocationCommand}</code>
            </div>
            <button type="button" onClick={() => void copyCommand()}>
              {copied ? copy.copied : copy.copyCommand}
            </button>
          </section>
        )}

        {missingRequirements.length > 0 && (
          <section className="skill-detail-requirements">
            <h3>{copy.requirementsHeading}</h3>
            <div>
              {missingRequirements.slice(0, 6).map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
          </section>
        )}

        {Boolean(skill.metadata?.tags?.length || skill.parameters?.length) && (
          <section className="skill-detail-meta">
            <h3>{copy.infoHeading}</h3>
            <div>
              {(skill.metadata?.tags || []).slice(0, 5).map((tag) => (
                <span key={tag}>{getLocalizedSkillTag(tag, language)}</span>
              ))}
              {(skill.parameters || []).slice(0, 3).map((parameter) => {
                const parameterText = getLocalizedSkillParameterText(
                  skill,
                  parameter,
                  language,
                );
                return (
                  <span key={parameter.name}>
                    {parameterText.description || parameterText.name}
                  </span>
                );
              })}
            </div>
          </section>
        )}

        <footer className="skill-detail-footer">
          <div>
            <strong>
              {canUse
                ? copy.canUseTitle
                : userInvocable
                  ? copy.needsSetupTitle
                  : copy.automaticOnlyTitle}
            </strong>
            <span>{canUse ? copy.canUseHint : copy.inactiveHint}</span>
          </div>
          <button
            type="button"
            className="skill-detail-use-button"
            disabled={!canUse}
            onClick={() =>
              onUse({
                skillId: skill.id,
                skillLabel: displayName,
                prompt: examplePrompt,
              })
            }
          >
            <ChatCircleDots size={17} weight="bold" />
            {canUse
              ? copy.useInChat
              : userInvocable
                ? copy.useAfterSetup
                : copy.unavailable}
          </button>
        </footer>
      </aside>
    </div>
  );
}

function getSkillPhosphorIcon(skill: SkillStatusEntry): PhosphorIcon {
  const localized = getLocalizedSkillText(skill);
  const text = [
    skill.id,
    skill.name,
    skill.description,
    skill.category,
    localized.name,
    localized.description,
    localized.category,
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase();
  if (/(csv|表格|spreadsheet)/.test(text)) return FileCsv;
  if (/(数据|数据库|database|data)/.test(text)) return PhDatabase;
  if (/(财务|金融|估值|finance|dcf|chart)/.test(text)) return ChartLineUp;
  if (/(开发|代码|工程|code|develop|debug)/.test(text)) return PhCode;
  if (/(研究|搜索|检索|research|search|investigate)/.test(text))
    return PhMagnifyingGlass;
  if (/(法务|法律|合同|legal|law|contract)/.test(text)) return Scales;
  if (/(写作|文档|内容|write|document|content)/.test(text)) return NotePencil;
  return PhSparkle;
}

function PolishedSkillCard({
  skill,
  onOpen,
  featured,
  featuredArt,
}: {
  skill: SkillStatusEntry;
  onOpen: () => void;
  featured: boolean;
  featuredArt?: string;
}) {
  const localized = getLocalizedSkillText(skill);
  const ready = skill.eligible && !skill.disabled;
  const visual = getSemanticIconVisual({
    id: skill.id,
    name: localized.name || skill.name || skill.id,
    description: localized.description || skill.description,
    category: skill.category,
    fallback: Wrench,
  });
  const palette = ICON_TONES[visual.tone];
  const Icon = getSkillPhosphorIcon(skill);

  return (
    <article
      className={`polished-skill-card${featured ? " is-featured" : ""}`}
      style={
        {
          "--polished-skill-tone": palette.foreground,
          "--polished-skill-tint": palette.background,
          "--polished-skill-border": palette.border,
        } as React.CSSProperties
      }
    >
      {featured && featuredArt && (
        <img
          className={`polished-skill-featured-art${featuredArt.includes("research-featured") ? "" : " is-scene-photo"}`}
          src={featuredArt}
          alt=""
        />
      )}
      <div className="polished-skill-card-topline">
        <span className="polished-skill-icon">
          <Icon size={featured ? 24 : 20} weight="duotone" />
        </span>
        <span className={`polished-skill-state${ready ? " is-ready" : ""}`}>
          {ready ? (
            <CheckCircle size={14} weight="fill" />
          ) : (
            <WarningCircle size={14} weight="fill" />
          )}
          {ready
            ? translate(
                "generated.components.capabilitycenter.2661.414",
                "Can be used directly",
              )
            : skill.disabled
              ? translate(
                  "generated.components.capabilitycenter.2661.415",
                  "Deactivated",
                )
              : translate(
                  "generated.components.capabilitycenter.2661.416",
                  "Requires configuration",
                )}
        </span>
      </div>
      <div className="polished-skill-copy">
        <span className="polished-skill-category">
          {localized.category ||
            translate(
              "generated.components.capabilitycenter.2665.417",
              "Professional workflow",
            )}
        </span>
        <h5>{localized.name || skill.name || skill.id}</h5>
        <p>
          {localized.description ||
            skill.description ||
            translate(
              "generated.components.capabilitycenter.2667.418",
              "Supplement experts with dedicated execution capabilities.",
            )}
        </p>
      </div>
      <div
        className="polished-skill-tags"
        aria-label={translate(
          "generated.components.capabilitycenter.2669.419",
          "Skill tag",
        )}
      >
        <span>
          {localized.category ||
            translate(
              "generated.components.capabilitycenter.2670.420",
              "Research",
            )}
        </span>
        <span>
          {featured
            ? translate(
                "generated.components.capabilitycenter.2671.421",
                "Search",
              )
            : translate(
                "generated.components.capabilitycenter.2671.422",
                "analysis",
              )}
        </span>
        <span>
          {featured
            ? translate(
                "generated.components.capabilitycenter.2672.423",
                "Trend",
              )
            : translate(
                "generated.components.capabilitycenter.2672.424",
                "Insight",
              )}
        </span>
      </div>
      <div className="polished-skill-card-footer">
        <button
          type="button"
          className={featured ? "is-primary" : ""}
          onClick={onOpen}
        >
          {translate(
            "generated.components.capabilitycenter.2676.425",
            "View skills",
          )}
          <PhArrowRight size={14} weight="bold" />
        </button>
      </div>
    </article>
  );
}

function SkillResultRow({
  skill,
  onOpen,
}: {
  skill: SkillStatusEntry;
  onOpen: () => void;
}) {
  const localized = getLocalizedSkillText(skill);
  const ready = skill.eligible && !skill.disabled;
  const visual = getSemanticIconVisual({
    id: skill.id,
    name: localized.name || skill.name || skill.id,
    description: localized.description || skill.description,
    category: skill.category,
    fallback: Wrench,
  });
  const Icon = getSkillPhosphorIcon(skill);
  const palette = ICON_TONES[visual.tone];

  return (
    <button
      type="button"
      className="skill-result-row"
      onClick={onOpen}
      style={
        {
          "--skill-result-tone": palette.foreground,
          "--skill-result-tint": palette.background,
          "--skill-result-border": palette.border,
        } as React.CSSProperties
      }
    >
      <span className="skill-result-icon">
        <Icon size={18} weight="duotone" />
      </span>
      <span className="skill-result-copy">
        <strong>{localized.name || skill.name || skill.id}</strong>
        <small>
          {localized.description ||
            skill.description ||
            translate(
              "generated.components.capabilitycenter.2714.426",
              "Supplement experts with dedicated execution capabilities.",
            )}
        </small>
      </span>
      <span className={`skill-result-state${ready ? " is-ready" : ""}`}>
        {ready ? (
          <CheckCircle size={13} weight="fill" />
        ) : (
          <WarningCircle size={13} weight="fill" />
        )}
        {ready
          ? translate(
              "generated.components.capabilitycenter.2722.427",
              "Can be used directly",
            )
          : skill.disabled
            ? translate(
                "generated.components.capabilitycenter.2722.428",
                "Deactivated",
              )
            : translate(
                "generated.components.capabilitycenter.2722.429",
                "Requires configuration",
              )}
      </span>
      <PhArrowRight size={14} weight="bold" aria-hidden="true" />
    </button>
  );
}

function SkillSceneSkeleton() {
  return (
    <div
      className="skill-scene-bento is-loading"
      aria-label={translate(
        "generated.components.capabilitycenter.2731.430",
        "Reading skill scene",
      )}
      aria-busy="true"
    >
      {SKILL_SCENES.map((scene) => (
        <div
          key={scene.id}
          className={`skill-scene-card is-${scene.id} skill-scene-card-skeleton`}
        >
          <span />
          <strong />
          <i />
          <i />
          <i />
        </div>
      ))}
    </div>
  );
}

function ConnectorCard({
  connector,
  status,
  onOpen,
}: {
  connector: {
    id: string;
    name: string;
    description?: string;
    enabled: boolean;
  };
  status?: CapabilityConnectorStatus;
  onOpen: () => void;
}) {
  const connected = connector.enabled && status?.status === "connected";
  const state = connected
    ? translate(
        "capabilities.connectedToolCount",
        "Connected · {count} tools",
        { count: status?.tools.length || 0 },
      )
    : connector.enabled
      ? translate(
          "generated.components.capabilitycenter.2758.431",
          "Waiting for connection",
        )
      : translate(
          "generated.components.capabilitycenter.2759.432",
          "Not enabled",
        );
  return (
    <CapabilityCard
      className="connector-card"
      icon={<PlugsConnected size={20} weight="duotone" />}
      decorativeIcon={<PlugsConnected size={58} weight="duotone" />}
      iconTone="teal"
      title={connector.name}
      description={getLocalizedMcpServerDescription(connector)}
      state={state}
      warning={!connected}
      onOpen={onOpen}
      actionLabel={translate(
        "generated.components.capabilitycenter.2771.433",
        "Manage connections",
      )}
    />
  );
}

function ConnectorRecommendation({
  icon: Icon,
  title,
  description,
  onOpen,
  tone,
}: {
  icon: PhosphorIcon;
  title: string;
  description: string;
  onOpen: () => void;
  tone: SemanticIconTone;
}) {
  const palette = ICON_TONES[tone];
  return (
    <article
      className="connector-recommendation-card"
      style={
        {
          "--connector-tone": palette.foreground,
          "--connector-tint": palette.background,
          "--connector-border": palette.border,
        } as React.CSSProperties
      }
    >
      <span>
        <Icon size={23} weight="duotone" />
      </span>
      <div>
        <h4>{title}</h4>
        <p>{description}</p>
      </div>
      <button
        type="button"
        onClick={onOpen}
        aria-label={translate(
          "capabilities.configureNamed",
          "Configure {name}",
          { name: title },
        )}
      >
        <PhArrowRight size={15} weight="bold" />
      </button>
    </article>
  );
}

function CapabilityCard({
  className = "",
  icon,
  decorativeIcon,
  iconTone = "blue",
  accentColor,
  title,
  description,
  eyebrow,
  metadata = [],
  state,
  warning = false,
  onOpen,
  actionLabel,
  featured = false,
  compact = false,
  ordinal,
}: {
  className?: string;
  icon: ReactNode;
  decorativeIcon?: ReactNode;
  iconTone?: SemanticIconTone;
  accentColor?: string;
  title: string;
  description: string;
  eyebrow?: string;
  metadata?: string[];
  state: string;
  warning?: boolean;
  onOpen: () => void;
  actionLabel: string;
  featured?: boolean;
  compact?: boolean;
  ordinal?: number;
}) {
  const iconPalette = ICON_TONES[iconTone];
  return (
    <article
      className={`capability-center-card ${className}${featured ? " is-featured" : ""}${compact ? " is-compact" : ""}`.trim()}
      style={
        {
          "--capability-card-tone": accentColor || iconPalette.foreground,
          "--capability-card-tint": iconPalette.background,
        } as React.CSSProperties
      }
    >
      {ordinal && (
        <span className="capability-card-ordinal" aria-hidden="true">
          {String(ordinal).padStart(2, "0")}
        </span>
      )}
      {decorativeIcon && (
        <span className="capability-card-watermark" aria-hidden="true">
          {decorativeIcon}
        </span>
      )}
      <div className="capability-card-topline">
        <span
          className="capability-center-icon"
          style={{
            color: iconPalette.foreground,
            background: iconPalette.background,
            borderColor: iconPalette.border,
          }}
        >
          {icon}
        </span>
        <span
          className={`capability-card-state${warning ? " is-warning" : " is-ready"}`}
        >
          {warning ? <CircleAlert size={13} /> : <Check size={13} />}
          {state}
        </span>
      </div>
      {eyebrow && <span className="capability-card-eyebrow">{eyebrow}</span>}
      <h3>{title}</h3>
      <p>{description}</p>
      {metadata.length > 0 && (
        <div
          className="capability-card-metadata"
          aria-label={translate(
            "generated.components.capabilitycenter.2891.434",
            "Skill information",
          )}
        >
          {metadata.slice(0, 2).map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      )}
      <div className="capability-card-actions">
        <button type="button" className="capability-card-link" onClick={onOpen}>
          {actionLabel} <ArrowRight size={13} />
        </button>
      </div>
    </article>
  );
}

function CapabilitySkeleton() {
  return (
    <div
      className="capability-center-grid"
      aria-label={translate(
        "generated.components.capabilitycenter.2908.435",
        "Reading available capacity",
      )}
      aria-busy="true"
    >
      {Array.from({ length: 8 }).map((_, index) => (
        <div className="capability-card-skeleton" key={index}>
          <span />
          <strong />
          <i />
          <i />
        </div>
      ))}
    </div>
  );
}

function EmptyState({
  message,
  label,
  onOpen,
}: {
  message: string;
  label: string;
  onOpen: () => void;
}) {
  return (
    <div className="capability-center-empty">
      <Bot size={24} />
      <p>{message}</p>
      <button type="button" onClick={onOpen}>
        {label}
      </button>
    </div>
  );
}
