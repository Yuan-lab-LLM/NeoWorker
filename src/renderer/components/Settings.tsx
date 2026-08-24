import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useDeferredValue,
  useRef,
  lazy,
  memo,
  Suspense,
  type CSSProperties,
  type ComponentType,
  type ReactNode,
  type SetStateAction,
} from "react";
import {
  Sparkles,
  Sun,
  User,
  Users,
  Mic,
  Layers,
  Search,
  MessageCircle,
  Send,
  Hash,
  UsersRound,
  AtSign,
  Shield,
  Activity,
  Brain,
  ListOrdered,
  Wrench,
  Store,
  Clock,
  LayoutGrid,
  Zap,
  Monitor,
  Puzzle,
  BarChart3,
  Lightbulb,
  MessageSquare,
  Smile,
  ShieldCheck as ShieldCheckIcon,
  MessagesSquare,
  Mail,
  Square,
  Tv,
  CircleDot,
  Cloud,
  Star,
  Globe,
  Link,
  Hexagon,
  ChevronDown,
  Plus,
  Minus,
  Pencil,
  X,
  Building2,
  KeyRound,
  Trash2,
} from "lucide-react";
import {
  LLMSettingsData,
  type LLMProviderType,
  type LLMRoutingRuntimeState,
  type CustomProviderConfig,
  type AzureReasoningEffort,
  type OpenAIReasoningEffort,
  type LLMTextVerbosity,
  type LLMProviderFallbackConfig,
  type MoaModelSlot,
  type MoaPreset,
  type ChannelData,
  type ChannelType,
} from "../../shared/types";
import { CUSTOM_PROVIDER_MAP } from "../../shared/llm-provider-catalog";
import { getLlmModelReasoningEfforts } from "../../shared/llm-model-selection";
import {
  normalizeKimiApiKey,
  type KimiConnectionErrorCode,
} from "../../shared/kimi";
import { translate, useLanguage } from "../i18n";
import { isInitialReleaseSettingsAvailable } from "../feature-visibility";
import { CURRENT_PRODUCT_COMMUNICATION_CHANNEL_ORDER } from "../utils/product-availability";
import {
  buildClaudeCredentialInput,
  resolveOpenAIReasoningEffort,
  resolveOpenAITextVerbosity,
  resolveClaudeAuthMethod,
  selectClaudeModelKey,
} from "./settings-llm-helpers";
import "./settings.css";
import "./settings-activity.css";
import "./settings-navigation.css";
import "./automation-settings.css";
import "./tools-integrations.css";

type ProviderModelRegistry = NonNullable<
  LLMSettingsData["providerModelRegistry"]
>;
type ProviderModelRegistryEntry = NonNullable<ProviderModelRegistry[string]>;

function lazySettingsPanel<T extends ComponentType<Any>>(
  loader: () => Promise<Any>,
  exportName: string,
) {
  return lazy(async () => ({ default: (await loader())[exportName] as T }));
}

const TelegramSettings = lazySettingsPanel(
  () => import("./TelegramSettings"),
  "TelegramSettings",
);
const DiscordSettings = lazySettingsPanel(
  () => import("./DiscordSettings"),
  "DiscordSettings",
);
const SlackSettings = lazySettingsPanel(
  () => import("./SlackSettings"),
  "SlackSettings",
);
const WhatsAppSettings = lazySettingsPanel(
  () => import("./WhatsAppSettings"),
  "WhatsAppSettings",
);
const ImessageSettings = lazySettingsPanel(
  () => import("./ImessageSettings"),
  "ImessageSettings",
);
const SignalSettings = lazySettingsPanel(
  () => import("./SignalSettings"),
  "SignalSettings",
);
const MattermostSettings = lazySettingsPanel(
  () => import("./MattermostSettings"),
  "MattermostSettings",
);
const MatrixSettings = lazySettingsPanel(
  () => import("./MatrixSettings"),
  "MatrixSettings",
);
const TwitchSettings = lazySettingsPanel(
  () => import("./TwitchSettings"),
  "TwitchSettings",
);
const LineSettings = lazySettingsPanel(
  () => import("./LineSettings"),
  "LineSettings",
);
const BlueBubblesSettings = lazySettingsPanel(
  () => import("./BlueBubblesSettings"),
  "BlueBubblesSettings",
);
const EmailSettings = lazySettingsPanel(
  () => import("./EmailSettings"),
  "EmailSettings",
);
const TeamsSettings = lazySettingsPanel(
  () => import("./TeamsSettings"),
  "TeamsSettings",
);
const GoogleChatSettings = lazySettingsPanel(
  () => import("./GoogleChatSettings"),
  "GoogleChatSettings",
);
const FeishuSettings = lazySettingsPanel(
  () => import("./FeishuSettings"),
  "FeishuSettings",
);
const DingTalkSettings = lazySettingsPanel(
  () => import("./DingTalkSettings"),
  "DingTalkSettings",
);
const WeixinSettings = lazySettingsPanel(
  () => import("./WeixinSettings"),
  "WeixinSettings",
);
const WeComSettings = lazySettingsPanel(
  () => import("./WeComSettings"),
  "WeComSettings",
);
const XSettings = lazySettingsPanel(() => import("./XSettings"), "XSettings");
const SearchSettings = lazySettingsPanel(
  () => import("./SearchSettings"),
  "SearchSettings",
);
const GuardrailSettings = lazySettingsPanel(
  () => import("./GuardrailSettings"),
  "GuardrailSettings",
);
const AppearanceSettings = lazySettingsPanel(
  () => import("./AppearanceSettings"),
  "AppearanceSettings",
);
const SkillsSettings = lazySettingsPanel(
  () => import("./SkillsSettings"),
  "SkillsSettings",
);
const SkillHubBrowser = lazySettingsPanel(
  () => import("./SkillHubBrowser"),
  "SkillHubBrowser",
);
const MCPSettings = lazySettingsPanel(
  () => import("./MCPSettings"),
  "MCPSettings",
);
const ConnectorsSettings = lazySettingsPanel(
  () => import("./ConnectorsSettings"),
  "ConnectorsSettings",
);
const BuiltinToolsSettings = lazySettingsPanel(
  () => import("./BuiltinToolsSettings"),
  "BuiltinToolsSettings",
);
const ChronicleSettingsCard = lazySettingsPanel(
  () => import("./ChronicleSettings"),
  "ChronicleSettingsCard",
);
const ComputerUseSettings = lazySettingsPanel(
  () => import("./ComputerUseSettings"),
  "ComputerUseSettings",
);
const ScheduledTasksSettings = lazySettingsPanel(
  () => import("./ScheduledTasksSettings"),
  "ScheduledTasksSettings",
);
const ControlPlaneSettings = lazySettingsPanel(
  () => import("./ControlPlaneSettings"),
  "ControlPlaneSettings",
);
const PersonalitySettings = lazySettingsPanel(
  () => import("./PersonalitySettings"),
  "PersonalitySettings",
);
const ExtensionsSettings = lazySettingsPanel(
  () => import("./ExtensionsSettings"),
  "ExtensionsSettings",
);
const VoiceSettings = lazySettingsPanel(
  () => import("./VoiceSettings"),
  "VoiceSettings",
);
const MemoryHubSettings = lazySettingsPanel(
  () => import("./MemoryHubSettings"),
  "MemoryHubSettings",
);
const UsageInsightsPanel = lazySettingsPanel(
  () => import("./UsageInsightsPanel"),
  "UsageInsightsPanel",
);
const SuggestionsPanel = lazySettingsPanel(
  () => import("./SuggestionsPanel"),
  "SuggestionsPanel",
);
const CustomizePanel = lazySettingsPanel(
  () => import("./CustomizePanel"),
  "CustomizePanel",
);
const BriefingPanel = lazySettingsPanel(
  () => import("./BriefingPanel"),
  "BriefingPanel",
);
const WebAccessSettingsPanel = lazySettingsPanel(
  () => import("./WebAccessSettingsPanel"),
  "WebAccessSettingsPanel",
);
const DigitalTwinsPanel = lazySettingsPanel(
  () => import("./DigitalTwinsPanel"),
  "DigitalTwinsPanel",
);
const ContactIdentitySettings = lazySettingsPanel(
  () => import("./ContactIdentitySettings"),
  "ContactIdentitySettings",
);
const TaskTraceDebuggerPanel = lazySettingsPanel(
  () => import("./TaskTraceDebuggerPanel"),
  "TaskTraceDebuggerPanel",
);
const EverydayAgentSettingsPanel = lazySettingsPanel(
  () => import("./EverydayAgentPanel"),
  "EverydayAgentSettingsPanel",
);

type SettingsTab =
  | "appearance"
  | "personality"
  | "tray"
  | "guardrails"
  | "policies"
  | "voice"
  | "aimodels"
  | "llm"
  | "image"
  | "video"
  | "search"
  | "telegram"
  | "slack"
  | "whatsapp"
  | "teams"
  | "x"
  | "morechannels"
  | "integrations"
  | "updates"
  | "automations"
  | "queue"
  | "skills"
  | "skillhub"
  | "connectors"
  | "identity"
  | "mcp"
  | "tools"
  | "scheduled"
  | "hooks"
  | "controlplane"
  | "devices"
  | "nodes"
  | "extensions"
  | "memory"
  | "git"
  | "insights"
  | "suggestions"
  | "traces"
  | "customize"
  | "digitaltwins"
  | "everydayAgent"
  | "triggers"
  | "briefing"
  | "subconscious"
  | "health"
  | "access"
  | "webaccess";

// Secondary channels shown inside "More Channels" tab
type SecondaryChannel =
  | "teams"
  | "x"
  | "discord"
  | "imessage"
  | "signal"
  | "mattermost"
  | "matrix"
  | "twitch"
  | "line"
  | "bluebubbles"
  | "email"
  | "googlechat"
  | "feishu"
  | "wecom";

type CommunicationChannelKey = ChannelType;

interface CommunicationChannelDefinition {
  key: CommunicationChannelKey;
  channelType?: ChannelType;
  label: string;
  description: string;
  comingSoon?: boolean;
  icon?: ReactNode;
}

// Keep the first-release channel surface focused on services that are broadly
// usable in mainland China. Other integrations remain implemented and become
// visible again when the user already has one configured.
const INITIAL_RELEASE_COMMUNICATION_CHANNEL_ORDER: CommunicationChannelKey[] = [
  ...CURRENT_PRODUCT_COMMUNICATION_CHANNEL_ORDER,
];
const INITIAL_RELEASE_COMMUNICATION_CHANNELS = new Set<CommunicationChannelKey>(
  INITIAL_RELEASE_COMMUNICATION_CHANNEL_ORDER,
);
const INITIAL_RELEASE_COMMUNICATION_CHANNEL_RANK = new Map(
  INITIAL_RELEASE_COMMUNICATION_CHANNEL_ORDER.map((key, index) => [key, index]),
);

interface SettingsProps {
  onBack: () => void;
  onSettingsChanged?: () => void;
  devRunLoggingEnabled: boolean;
  onDevRunLoggingEnabledChange: (enabled: boolean) => void;
  initialTab?: SettingsTab;
  workspaceId?: string;
  onCreateTask?: (title: string, prompt: string) => void;
  onOpenTask?: (taskId: string) => void;
  onNavigateToAgents?: () => void;
}

interface ModelOption {
  key: string;
  displayName: string;
}

const OPENROUTER_PARETO_CODE_MODEL = "openrouter/pareto-code";
const OPENROUTER_PARETO_SCORE_ERROR =
  "Pareto minimum coding score must be a decimal number from 0 to 1.";

function isOpenRouterParetoCodeModel(model: string): boolean {
  return (
    model.trim().toLowerCase().split(":")[0] === OPENROUTER_PARETO_CODE_MODEL
  );
}

interface ProviderInfo {
  type: LLMProviderType;
  name: string;
  configured: boolean;
}

const MODEL_ADD_PROVIDER_ORDER = [
  "openai-compatible",
  "openai",
  "anthropic",
  "gemini",
  "deepseek",
  "kimi",
  "xai",
  "minimax",
  "qwen-portal",
  "zai",
  "openrouter",
] satisfies readonly LLMProviderType[];

const MODEL_ADD_PROVIDER_TYPE_SET = new Set<LLMProviderType>(
  MODEL_ADD_PROVIDER_ORDER,
);

const MODEL_ADD_PROVIDER_LABEL_OVERRIDES: Partial<
  Record<LLMProviderType, string>
> = {
  "openai-compatible": translate(
    "generated.components.settings.442.0",
    "Customize",
  ),
  "qwen-portal": "Qwen",
  zai: "Z.AI / GLM",
};

const areGatewayChannelsEquivalent = (
  previous: ChannelData[],
  next: ChannelData[],
): boolean => {
  if (previous.length !== next.length) return false;
  const summarize = (channel: ChannelData) =>
    [
      channel.id,
      channel.type,
      channel.name,
      String(channel.enabled),
      channel.status,
      channel.securityMode,
      channel.configReadError || "",
    ].join("|");
  const previousSummary = previous.map(summarize).sort();
  const nextSummary = next.map(summarize).sort();
  return previousSummary.every((value, index) => value === nextSummary[index]);
};

type ModelUsageMode = "daily" | "weekly" | "cumulative";

interface ModelUsageDay {
  dateKey: string;
  llmCalls?: number;
  cost?: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens?: number;
}

interface ModelUsageProviderBreakdown {
  provider: string;
  calls: number;
  distinctTasks: number;
  cost: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  percent: number;
}

interface ModelUsageCostByModel {
  model: string;
  cost: number;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  distinctTasks: number;
}

interface ModelUsageSnapshot {
  requestsByDay?: ModelUsageDay[];
  modelRequestsByDay?: Record<string, ModelUsageDay[]>;
  providerBreakdown?: ModelUsageProviderBreakdown[];
  costMetrics?: {
    totalCost?: number;
    totalInputTokens?: number;
    totalOutputTokens?: number;
    costByModel?: ModelUsageCostByModel[];
  };
  llmSuccessRate?: number | null;
  llmSummary?: {
    totalLlmCalls: number;
    totalCost?: number;
    chargeableCallRate?: number | null;
    avgTokensPerCall?: number | null;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCachedTokens?: number;
    cacheReadRate?: number | null;
    distinctTaskCount?: number;
  };
}

const formatModelMetric = (value: number | null | undefined): string => {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return "0";
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return Math.round(n).toLocaleString();
};

const formatModelCost = (value: number | null | undefined): string => {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) return "$0";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
};

const getLocalDateKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getWeekStartDateKey = (dateKey: string): string => {
  const [year, month, day] = dateKey.split("-").map(Number);
  if (!year || !month || !day) return dateKey;
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() - date.getDay());
  return getLocalDateKey(date);
};

const ModelUsageHeatmap = memo(function ModelUsageHeatmap({
  days,
  mode,
  ariaLabel,
  className = "",
}: {
  days: ModelUsageDay[];
  mode: ModelUsageMode;
  ariaLabel: string;
  className?: string;
}) {
  const language = useLanguage();
  const {
    values,
    calls,
    leadingEmptyCells,
    columnCount,
    maxValue,
    monthLabels,
  } = useMemo(() => {
    let values: number[];
    let calls: number[];
    if (mode === "daily") {
      values = days.map((day) => day.inputTokens + day.outputTokens);
      calls = days.map((day) => day.llmCalls || 0);
    } else if (mode === "cumulative") {
      let totalTokens = 0;
      let totalCalls = 0;
      values = days.map((day) => {
        totalTokens += day.inputTokens + day.outputTokens;
        return totalTokens;
      });
      calls = days.map((day) => {
        totalCalls += day.llmCalls || 0;
        return totalCalls;
      });
    } else {
      const tokensByWeek = new Map<string, number>();
      const callsByWeek = new Map<string, number>();
      for (const day of days) {
        const key = getWeekStartDateKey(day.dateKey);
        tokensByWeek.set(
          key,
          (tokensByWeek.get(key) || 0) + day.inputTokens + day.outputTokens,
        );
        callsByWeek.set(key, (callsByWeek.get(key) || 0) + (day.llmCalls || 0));
      }
      values = days.map(
        (day) => tokensByWeek.get(getWeekStartDateKey(day.dateKey)) || 0,
      );
      calls = days.map(
        (day) => callsByWeek.get(getWeekStartDateKey(day.dateKey)) || 0,
      );
    }

    const firstDate = days[0]?.dateKey
      ? new Date(`${days[0].dateKey}T00:00:00`)
      : new Date();
    const leadingEmptyCells = Number.isFinite(firstDate.getTime())
      ? firstDate.getDay()
      : 0;
    const columnCount = Math.ceil((leadingEmptyCells + days.length) / 7);
    const maxValue = Math.max(0, ...values);
    const monthLabels = days
      .map((day, index) => {
        const date = new Date(`${day.dateKey}T00:00:00`);
        if (!Number.isFinite(date.getTime()) || date.getDate() !== 1)
          return null;
        return {
          key: day.dateKey,
          label: new Intl.DateTimeFormat(
            language === "zh-CN" ? "zh-CN" : "en-US",
            { month: "short" },
          ).format(date),
          column: Math.floor((leadingEmptyCells + index) / 7) + 1,
        };
      })
      .filter(Boolean) as Array<{
      key: string;
      label: string;
      column: number;
    }>;

    return {
      values,
      calls,
      leadingEmptyCells,
      columnCount,
      maxValue,
      monthLabels,
    };
  }, [days, language, mode]);

  return (
    <div
      className={`llm-activity-heatmap-wrap ${mode} ${className}`}
      aria-label={ariaLabel}
      style={{ "--heatmap-columns": columnCount } as CSSProperties}
    >
      <div className="llm-activity-heatmap">
        {Array.from({ length: columnCount }, (_, columnIndex) => (
          <div className="llm-activity-week" key={`week-${columnIndex}`}>
            {Array.from({ length: 7 }, (_, rowIndex) => {
              const cellIndex = columnIndex * 7 + rowIndex;
              const dayIndex = cellIndex - leadingEmptyCells;
              const day = dayIndex >= 0 ? days[dayIndex] : undefined;
              if (!day) {
                return (
                  <span
                    key={`empty-${columnIndex}-${rowIndex}`}
                    className="empty"
                    aria-hidden="true"
                  />
                );
              }

              const value = values[dayIndex] || 0;
              const callCount = calls[dayIndex] || 0;
              const intensity = maxValue > 0 ? value / maxValue : 0;
              const level =
                intensity <= 0
                  ? 0
                  : intensity < 0.25
                    ? 1
                    : intensity < 0.5
                      ? 2
                      : intensity < 0.75
                        ? 3
                        : 4;
              const date = new Date(`${day.dateKey}T00:00:00`);
              const dateLabel = Number.isFinite(date.getTime())
                ? new Intl.DateTimeFormat(
                    language === "zh-CN" ? "zh-CN" : "en-US",
                    {
                      month: "long",
                      day: "numeric",
                      weekday: "short",
                    },
                  ).format(date)
                : day.dateKey;
              const periodLabel =
                mode === "weekly"
                  ? translate(
                      "settings.usage.weekContaining",
                      "Week containing {date}",
                      { date: dateLabel },
                    )
                  : mode === "cumulative"
                    ? translate(
                        "settings.usage.throughDate",
                        "Through {date}",
                        {
                          date: dateLabel,
                        },
                      )
                    : dateLabel;
              const tooltipLabel =
                value <= 0 && callCount <= 0
                  ? translate(
                      "settings.usage.noCallsForPeriod",
                      "{period} · No calls",
                      { period: periodLabel },
                    )
                  : translate(
                      "settings.usage.periodSummary",
                      "{period} · {tokens} tokens · {calls} calls",
                      {
                        period: periodLabel,
                        tokens: formatModelMetric(value),
                        calls: formatModelMetric(callCount),
                      },
                    );
              const tooltipEdgeClass =
                columnIndex <= 2
                  ? "tooltip-edge-start"
                  : columnIndex >= columnCount - 3
                    ? "tooltip-edge-end"
                    : "";
              return (
                <span
                  key={day.dateKey}
                  className={`level-${level} ${
                    level >= 3 ? "hot" : level > 0 ? "active" : ""
                  } ${tooltipEdgeClass}`}
                  data-tooltip={tooltipLabel}
                  aria-label={tooltipLabel}
                  role={value > 0 || callCount > 0 ? "img" : undefined}
                  tabIndex={value > 0 || callCount > 0 ? 0 : -1}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="llm-activity-month-labels" aria-hidden="true">
        {monthLabels.map((marker) => (
          <span
            key={marker.key}
            className={
              marker.column >= columnCount - 1
                ? "edge-end"
                : marker.column <= 1
                  ? "edge-start"
                  : undefined
            }
            style={{
              left: `${Math.max(
                0,
                Math.min(
                  100,
                  ((marker.column - 1) / Math.max(1, columnCount - 1)) * 100,
                ),
              )}%`,
            }}
          >
            {marker.label}
          </span>
        ))}
      </div>
    </div>
  );
});

const normalizeUsageLookupKey = (value?: string | null): string =>
  (value || "").trim().toLowerCase().replace(/_/g, "-");

const modelUsageMatches = (
  rowModel: string,
  selectedModel: string,
): boolean => {
  const row = normalizeUsageLookupKey(rowModel);
  const selected = normalizeUsageLookupKey(selectedModel);
  if (!row || !selected) return false;
  return (
    row === selected ||
    row.endsWith(`/${selected}`) ||
    selected.endsWith(`/${row}`)
  );
};

const isLikelyClaudeModelKey = (modelKey?: string | null): boolean => {
  const normalized = normalizeUsageLookupKey(modelKey);
  if (!normalized) return false;
  return (
    normalized.includes("claude") ||
    normalized.includes("sonnet") ||
    normalized.includes("opus") ||
    normalized.includes("haiku")
  );
};

interface ProviderRoutingConfig {
  fallbackProviders?: LLMProviderFallbackConfig[];
  failoverPrimaryRetryCooldownSeconds?: number;
  profileRoutingEnabled?: boolean;
  strongModelKey?: string;
  cheapModelKey?: string;
  automatedTaskModelKey?: string;
  preferStrongForVerification?: boolean;
}

const AZURE_REASONING_EFFORT_OPTIONS: Array<{
  value: AzureReasoningEffort;
  label: string;
  description: string;
}> = [
  {
    value: "low",
    label: "Low",
    description: "Faster responses with less reasoning.",
  },
  {
    value: "medium",
    label: "Medium",
    description: "Balanced quality and latency.",
  },
  { value: "high", label: "High", description: "More thorough reasoning." },
  {
    value: "extra_high",
    label: "Extra High",
    description: "Maximum effort. Azure maps this to High on the request.",
  },
];

const OPENAI_REASONING_EFFORT_OPTIONS: Array<{
  value: OpenAIReasoningEffort;
  label: string;
  description: string;
}> = [
  {
    value: "low",
    label: "Low",
    description: "Faster reasoning for routine tool work.",
  },
  {
    value: "medium",
    label: "Medium",
    description: "Balanced quality, latency, and cost.",
  },
  {
    value: "high",
    label: "High",
    description: "More thorough reasoning for complex work.",
  },
  {
    value: "xhigh",
    label: "Extra High",
    description: "Maximum effort for the hardest asynchronous tasks.",
  },
  {
    value: "max",
    label: "Max",
    description: "Maximum reasoning depth for the hardest problems.",
  },
  {
    value: "ultra",
    label: "Ultra",
    description: "Maximum reasoning with automatic task delegation.",
  },
];

const DEFAULT_OPENAI_REASONING_EFFORTS: OpenAIReasoningEffort[] = [
  "low",
  "medium",
  "high",
  "xhigh",
];

function getOpenAIReasoningEffortOptions(modelKey: string) {
  const modelEfforts = getLlmModelReasoningEfforts("openai", modelKey);
  const supportedEfforts =
    modelEfforts.length > 0 ? modelEfforts : DEFAULT_OPENAI_REASONING_EFFORTS;
  return OPENAI_REASONING_EFFORT_OPTIONS.filter((option) =>
    supportedEfforts.includes(option.value),
  );
}

const OPENAI_TEXT_VERBOSITY_OPTIONS: Array<{
  value: LLMTextVerbosity;
  label: string;
  description: string;
}> = [
  {
    value: "low",
    label: "Low",
    description: "Shorter final answers.",
  },
  {
    value: "medium",
    label: "Medium",
    description: "Balanced final answer detail.",
  },
  {
    value: "high",
    label: "High",
    description: "More detailed final answers.",
  },
];

function translateRequestOptionLabel(label: string): string {
  switch (label) {
    case "Low":
      return translate("aiModels.requestOption.low", "Low");
    case "Medium":
      return translate("aiModels.requestOption.medium", "Medium");
    case "High":
      return translate("aiModels.requestOption.high", "High");
    case "Extra High":
      return translate("aiModels.requestOption.extraHigh", "Extra High");
    default:
      return label;
  }
}

function translateRequestOptionDescription(description?: string): string {
  switch (description) {
    case "Faster responses with less reasoning.":
      return translate(
        "aiModels.azure.reasoning.lowHint",
        "Faster responses with less reasoning.",
      );
    case "Balanced quality and latency.":
      return translate(
        "aiModels.azure.reasoning.mediumHint",
        "Balanced quality and latency.",
      );
    case "More thorough reasoning.":
      return translate(
        "aiModels.azure.reasoning.highHint",
        "More thorough reasoning.",
      );
    case "Maximum effort. Azure maps this to High on the request.":
      return translate(
        "aiModels.azure.reasoning.extraHighHint",
        "Maximum effort. Azure maps this to High on the request.",
      );
    case "Faster reasoning for routine tool work.":
      return translate(
        "aiModels.openai.reasoning.lowHint",
        "Faster reasoning for routine tool work.",
      );
    case "Balanced quality, latency, and cost.":
      return translate(
        "aiModels.openai.reasoning.mediumHint",
        "Balanced quality, latency, and cost.",
      );
    case "More thorough reasoning for complex work.":
      return translate(
        "aiModels.openai.reasoning.highHint",
        "More thorough reasoning for complex work.",
      );
    case "Maximum effort for the hardest asynchronous tasks.":
      return translate(
        "aiModels.openai.reasoning.extraHighHint",
        "Maximum effort for the hardest asynchronous tasks.",
      );
    case "Shorter final answers.":
      return translate(
        "aiModels.openai.verbosity.lowHint",
        "Shorter final answers.",
      );
    case "Balanced final answer detail.":
      return translate(
        "aiModels.openai.verbosity.mediumHint",
        "Balanced final answer detail.",
      );
    case "More detailed final answers.":
      return translate(
        "aiModels.openai.verbosity.highHint",
        "More detailed final answers.",
      );
    default:
      return description || "";
  }
}

// Helper to format bytes to human-readable size
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

// Searchable Select Component
interface SearchableSelectOption {
  value: string;
  label: string;
  description?: string;
}

interface SearchableSelectProps {
  options: SearchableSelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  /** Allow entering a custom value that isn't in the options list */
  allowCustomValue?: boolean;
}

function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "Select...",
  className = "",
  allowCustomValue = false,
}: SearchableSelectProps) {
  useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);

  const filteredOptions = options.filter(
    (opt) =>
      opt.label.toLowerCase().includes(search.toLowerCase()) ||
      opt.value.toLowerCase().includes(search.toLowerCase()) ||
      (opt.description &&
        opt.description.toLowerCase().includes(search.toLowerCase())),
  );

  const customValue = search.trim();
  const showCustomOption =
    allowCustomValue && filteredOptions.length === 0 && customValue.length > 0;
  const optionCount =
    filteredOptions.length > 0
      ? filteredOptions.length
      : showCustomOption
        ? 1
        : 0;

  // Reset highlighted index when search changes
  useEffect(() => {
    setHighlightedIndex(0);
  }, [search]);

  // Scroll highlighted option into view
  useEffect(() => {
    if (isOpen && listRef.current) {
      const highlightedEl = listRef.current.querySelector(
        `[data-index="${highlightedIndex}"]`,
      );
      if (highlightedEl) {
        highlightedEl.scrollIntoView({ block: "nearest" });
      }
    }
  }, [highlightedIndex, isOpen]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (optionCount > 0) {
          setHighlightedIndex((i) => Math.min(i + 1, optionCount - 1));
        }
        break;
      case "ArrowUp":
        e.preventDefault();
        if (optionCount > 0) {
          setHighlightedIndex((i) => Math.max(i - 1, 0));
        }
        break;
      case "Enter":
        e.preventDefault();
        if (filteredOptions[highlightedIndex]) {
          onChange(filteredOptions[highlightedIndex].value);
          setIsOpen(false);
          setSearch("");
        } else if (showCustomOption) {
          onChange(customValue);
          setIsOpen(false);
          setSearch("");
        }
        break;
      case "Escape":
        e.preventDefault();
        setIsOpen(false);
        setSearch("");
        break;
    }
  };

  const handleSelect = (optionValue: string) => {
    onChange(optionValue);
    setIsOpen(false);
    setSearch("");
  };

  return (
    <div ref={containerRef} className={`searchable-select ${className}`}>
      <div
        className={`searchable-select-trigger ${isOpen ? "open" : ""}`}
        onClick={() => {
          setIsOpen(!isOpen);
          if (!isOpen) {
            setTimeout(() => inputRef.current?.focus(), 0);
          }
        }}
        onKeyDown={handleKeyDown}
        tabIndex={0}
      >
        <span className="searchable-select-value">
          {selectedOption ? selectedOption.label : value ? value : placeholder}
        </span>
        <ChevronDown
          className="searchable-select-arrow"
          size={12}
          strokeWidth={2}
        />
      </div>

      {isOpen && (
        <div className="searchable-select-dropdown">
          <div className="searchable-select-search">
            <Search size={14} strokeWidth={2} />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={translate(
                "aiModels.common.searchModels",
                "Search models...",
              )}
              autoFocus
            />
          </div>
          <div ref={listRef} className="searchable-select-options">
            {filteredOptions.length === 0 ? (
              showCustomOption ? (
                <div
                  key={`__custom__:${customValue}`}
                  data-index={0}
                  className={`searchable-select-option ${customValue === value ? "selected" : ""} ${highlightedIndex === 0 ? "highlighted" : ""}`}
                  onClick={() => handleSelect(customValue)}
                  onMouseEnter={() => setHighlightedIndex(0)}
                >
                  <span className="searchable-select-option-label">
                    {customValue}
                  </span>
                  <span className="searchable-select-option-desc">
                    {translate(
                      "aiModels.common.useCustomModelId",
                      "Use custom model ID",
                    )}
                  </span>
                </div>
              ) : (
                <div className="searchable-select-no-results">
                  {translate(
                    "aiModels.common.noModelsFound",
                    "No models found",
                  )}
                </div>
              )
            ) : (
              filteredOptions.map((opt, index) => (
                <div
                  key={opt.value}
                  data-index={index}
                  className={`searchable-select-option ${opt.value === value ? "selected" : ""} ${index === highlightedIndex ? "highlighted" : ""}`}
                  onClick={() => handleSelect(opt.value)}
                  onMouseEnter={() => setHighlightedIndex(index)}
                >
                  <span className="searchable-select-option-label">
                    {opt.label}
                  </span>
                  {opt.description && (
                    <span className="searchable-select-option-desc">
                      {opt.description}
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Sidebar navigation items configuration
const I = { size: 18, strokeWidth: 1.5 } as const;
type SidebarItem = {
  tab: SettingsTab;
  label: string;
  icon: ReactNode;
  macOnly?: boolean;
  group: string;
};

type SidebarSearchTarget = {
  tab?: SettingsTab;
  preferencesSubTab?: "appearance" | "personality" | "voice";
  aiAgentsSubTab?: "models" | "digitaltwins" | "everydayAgent" | "memory";
  communicationSubTab?: "whatsapp" | "telegram" | "slack" | "morechannels";
  secondaryChannel?: SecondaryChannel;
  aiModelsSubTab?: "llm" | "search" | "budget";
  showModelUsage?: boolean;
  automationsSubTab?:
    | "queue"
    | "subconscious"
    | "scheduled"
    | "hooks"
    | "triggers"
    | "council"
    | "briefing"
    | "suggestions"
    | "traces";
  skillsSubTab?: "custom" | "store";
  integrationsSubTab?: "connectors" | "identity";
  toolsIntegrationsSubTab?:
    "integrations" | "customize" | "skills" | "mcp" | "tools" | "extensions";
  accessSubTab?: "controlplane" | "webaccess";
};

type SidebarSearchEntry = {
  terms: string[];
  target?: SidebarSearchTarget;
};

type SidebarSearchResult = {
  item: SidebarItem;
  label: string;
  matchedTarget?: SidebarSearchTarget;
  isTabResult: boolean;
};

type SidebarSearchCandidate = SidebarSearchResult & {
  terms: string[];
};

const sidebarItems: SidebarItem[] = [
  {
    tab: "appearance",
    label: "Appearance & Preferences",
    group: "Settings",
    icon: <Sun {...I} />,
  },
  {
    tab: "aimodels",
    label: "AI & Models",
    group: "Settings",
    icon: <Layers {...I} />,
  },
  {
    tab: "morechannels",
    label: "Communication Channels",
    group: "Settings",
    icon: <MessageCircle {...I} />,
  },
  {
    tab: "integrations",
    label: "Tools & Integrations",
    group: "Settings",
    icon: <Wrench {...I} />,
  },
];

// Secondary channel configuration for "More Channels" tab
const S = { size: 16, strokeWidth: 1.5 } as const;
const secondaryChannelItems: Array<{
  key: SecondaryChannel;
  label: string;
  icon: ReactNode;
}> = [
  { key: "teams", label: "Teams", icon: <UsersRound {...S} /> },
  { key: "x", label: "X (Twitter)", icon: <AtSign {...S} /> },
  { key: "discord", label: "Discord", icon: <MessageSquare {...S} /> },
  { key: "imessage", label: "iMessage", icon: <MessageCircle {...S} /> },
  { key: "signal", label: "Signal", icon: <ShieldCheckIcon {...S} /> },
  { key: "line", label: "LINE", icon: <MessagesSquare {...S} /> },
  { key: "email", label: "Email", icon: <Mail {...S} /> },
  { key: "googlechat", label: "Google Chat", icon: <MessagesSquare {...S} /> },
  { key: "feishu", label: "Feishu / Lark", icon: <MessageCircle {...S} /> },
  { key: "wecom", label: "WeCom", icon: <Building2 {...S} /> },
  { key: "mattermost", label: "Mattermost", icon: <Square {...S} /> },
  { key: "matrix", label: "Matrix", icon: <LayoutGrid {...S} /> },
  { key: "twitch", label: "Twitch", icon: <Tv {...S} /> },
  { key: "bluebubbles", label: "BlueBubbles", icon: <Smile {...S} /> },
];

const secondaryChannelKeySet = new Set<string>(
  secondaryChannelItems.map((item) => item.key),
);

const isSecondaryChannelKey = (
  key: CommunicationChannelKey,
): key is SecondaryChannel => secondaryChannelKeySet.has(key);

const secondaryChannelSearchTerms: Partial<Record<SecondaryChannel, string[]>> =
  {
    teams: ["microsoft teams", "teams"],
    x: ["twitter", "x twitter", "tweets", "social"],
    discord: ["discord"],
    imessage: ["imessage", "ios messages", "apple messages"],
    signal: ["signal", "secure messaging"],
    line: ["line", "line messenger"],
    email: ["email", "mail"],
    googlechat: ["google chat", "gchat"],
    feishu: ["feishu", "lark"],
    wecom: ["wecom", "wechat work", "enterprise wechat"],
    mattermost: ["mattermost"],
    matrix: ["matrix"],
    twitch: ["twitch", "stream chat"],
    bluebubbles: ["bluebubbles", "blue bubbles"],
  };

const sidebarSearchEntries: Partial<Record<SettingsTab, SidebarSearchEntry[]>> =
  {
    appearance: [
      {
        terms: [
          "appearance and preferences",
          "preferences",
          "theme",
          "light mode",
          "dark mode",
          "accent color",
          "transparency effects",
          "ui density",
          "developer logging",
          "onboarding",
        ],
        target: { tab: "appearance", preferencesSubTab: "appearance" },
      },
      {
        terms: ["personality", "assistant behavior", "system prompt"],
        target: { tab: "appearance", preferencesSubTab: "personality" },
      },
      {
        terms: ["voice", "voice mode", "speech", "microphone", "audio"],
        target: { tab: "appearance", preferencesSubTab: "voice" },
      },
    ],
    personality: [
      { terms: ["personality", "assistant behavior", "system prompt"] },
    ],
    voice: [
      { terms: ["voice", "voice mode", "speech", "microphone", "audio"] },
    ],
    digitaltwins: [
      { terms: ["agent personas", "personas", "digital twins", "agents"] },
    ],
    aimodels: [
      {
        terms: [
          "ai model",
          "llm",
          "language model",
          "model provider",
          "provider routing",
          "fallback provider",
          "anthropic",
          "claude",
          "openai",
          "gpt",
          "azure",
          "gemini",
          "openrouter",
          "ollama",
          "groq",
          "xai",
          "grok",
          "supergrok",
          "grok oauth",
          "kimi",
          "nano-gpt",
          "nanogpt",
          "bedrock",
          "pi",
        ],
        target: {
          tab: "aimodels",
          aiAgentsSubTab: "models",
          aiModelsSubTab: "llm",
        },
      },
      {
        terms: [
          "web search",
          "search provider",
          "search engine",
          "tavily",
          "exa",
          "duckduckgo",
          "google search",
        ],
        target: {
          tab: "aimodels",
          aiAgentsSubTab: "models",
          aiModelsSubTab: "search",
        },
      },
      {
        terms: [
          "token budget",
          "token limit",
          "usage limit",
          "task budget",
          translate("generated.components.settings.1407.1", "budget"),
          translate(
            "generated.components.settings.1408.2",
            "token upper limit",
          ),
        ],
        target: {
          tab: "aimodels",
          aiAgentsSubTab: "models",
          aiModelsSubTab: "budget",
        },
      },
      {
        terms: [
          "agent personas",
          "personas",
          "digital twins",
          "agents",
          "agent roles",
        ],
        target: { tab: "aimodels", aiAgentsSubTab: "digitaltwins" },
      },
      {
        terms: ["everyday agent", "daily agent", "personal assistant"],
        target: { tab: "aimodels", aiAgentsSubTab: "everydayAgent" },
      },
      {
        terms: ["memory", "memories", "memory hub", "knowledge"],
        target: { tab: "aimodels", aiAgentsSubTab: "memory" },
      },
      {
        terms: [
          "usage insights",
          "analytics",
          "metrics",
          "token usage",
          "llm usage",
        ],
        target: {
          tab: "aimodels",
          aiAgentsSubTab: "models",
          aiModelsSubTab: "llm",
          showModelUsage: true,
        },
      },
    ],
    morechannels: [
      {
        terms: ["whatsapp", "wa"],
        target: { tab: "morechannels", communicationSubTab: "whatsapp" },
      },
      {
        terms: ["telegram", "tg"],
        target: { tab: "morechannels", communicationSubTab: "telegram" },
      },
      {
        terms: ["slack"],
        target: { tab: "morechannels", communicationSubTab: "slack" },
      },
      ...secondaryChannelItems.map((item) => ({
        terms: [item.label, ...(secondaryChannelSearchTerms[item.key] ?? [])],
        target: {
          tab: "morechannels" as SettingsTab,
          communicationSubTab: "morechannels" as const,
          secondaryChannel: item.key,
        },
      })),
    ],
    memory: [{ terms: ["memory", "memories", "memory hub", "knowledge"] }],
    automations: [
      {
        terms: ["routines", "routine", "automation routines"],
        target: { tab: "automations", automationsSubTab: "scheduled" },
      },
      {
        terms: ["scheduled", "scheduled tasks", "cron", "recurring tasks"],
        target: { tab: "automations", automationsSubTab: "scheduled" },
      },
      {
        terms: ["daily briefing", "briefing", "morning summary", "digest"],
        target: { tab: "automations", automationsSubTab: "briefing" },
      },
      {
        terms: ["suggestions", "recommendations", "next actions"],
        target: { tab: "automations", automationsSubTab: "suggestions" },
      },
    ],
    integrations: [
      {
        terms: ["connectors", "integrations", "apps"],
        target: {
          tab: "integrations",
          toolsIntegrationsSubTab: "integrations",
          integrationsSubTab: "connectors",
        },
      },
      {
        terms: ["identity", "contacts", "crm", "contact identity"],
        target: {
          tab: "integrations",
          toolsIntegrationsSubTab: "integrations",
          integrationsSubTab: "identity",
        },
      },
      {
        terms: [
          "feature packs",
          "plugin packs",
          "plugins",
          "packs",
          "customize",
          "custom",
        ],
        target: { tab: "integrations", toolsIntegrationsSubTab: "customize" },
      },
      {
        terms: ["custom skills", "skills", "local skills"],
        target: {
          tab: "integrations",
          toolsIntegrationsSubTab: "skills",
          skillsSubTab: "custom",
        },
      },
      {
        terms: ["skill store", "skill hub", "marketplace", "skillhub"],
        target: {
          tab: "integrations",
          toolsIntegrationsSubTab: "skills",
          skillsSubTab: "store",
        },
      },
      {
        terms: [
          "mcp",
          "mcp servers",
          "model context protocol",
          "server registry",
        ],
        target: { tab: "integrations", toolsIntegrationsSubTab: "mcp" },
      },
      {
        terms: ["built-in tools", "tools", "computer use", "builtin tools"],
        target: { tab: "integrations", toolsIntegrationsSubTab: "tools" },
      },
      {
        terms: ["extensions", "browser extension", "extension"],
        target: { tab: "integrations", toolsIntegrationsSubTab: "extensions" },
      },
    ],
    customize: [
      {
        terms: [
          "feature packs",
          "plugin packs",
          "plugins",
          "packs",
          "registry",
          "customize",
          "claude for legal",
          "small business",
          "smb",
          "finance packs",
        ],
      },
    ],
    skills: [
      {
        terms: ["custom skills", "skills", "local skills"],
        target: { tab: "skills", skillsSubTab: "custom" },
      },
      {
        terms: ["skill store", "skill hub", "marketplace", "skillhub"],
        target: { tab: "skills", skillsSubTab: "store" },
      },
    ],
    mcp: [
      {
        terms: [
          "mcp",
          "mcp servers",
          "model context protocol",
          "server registry",
        ],
      },
    ],
    tools: [
      { terms: ["built-in tools", "tools", "computer use", "builtin tools"] },
    ],
    briefing: [
      { terms: ["daily briefing", "briefing", "morning summary", "digest"] },
    ],
    access: [
      {
        terms: ["remote access", "control plane", "controlplane"],
        target: { tab: "access", accessSubTab: "controlplane" },
      },
      {
        terms: ["web access", "browser access", "webaccess"],
        target: { tab: "access", accessSubTab: "webaccess" },
      },
    ],
    extensions: [{ terms: ["extensions", "browser extension", "extension"] }],
    insights: [{ terms: ["usage insights", "analytics", "metrics"] }],
    suggestions: [{ terms: ["suggestions", "recommendations"] }],
    traces: [{ terms: ["trace debugger", "traces", "sessions", "debugger"] }],
    updates: [{ terms: ["updates", "update", "release notes"] }],
  };

const getSidebarItemLabel = (item: SidebarItem): string =>
  translate(`settings.sidebar.${item.tab}`, item.label);

const getSidebarGroupLabel = (group: string): string =>
  translate(`settings.sidebar.group.${group}`, group);

const translateSidebarTuple = (
  label: readonly [string, string] | undefined,
  fallback: string,
): string => (label ? translate(label[0], label[1]) : fallback);

const getSidebarSearchEntryLabel = (entry: SidebarSearchEntry): string => {
  const target = entry.target;

  if (target?.preferencesSubTab) {
    const labels = {
      appearance: ["settings.page.preferences.appearance", "Appearance"],
      personality: ["settings.page.preferences.personality", "Personality"],
      voice: ["settings.page.preferences.voice", "Voice Mode"],
    } as const;
    return translateSidebarTuple(
      labels[target.preferencesSubTab],
      entry.terms[0],
    );
  }

  if (target?.aiModelsSubTab) {
    const labels = {
      llm: ["settings.page.aiAgents.llm", "LLM Models"],
      search: ["settings.page.aiAgents.search", "Web Search"],
      budget: ["settings.page.aiModels.budget", "Token Budget"],
    } as const;
    return translateSidebarTuple(labels[target.aiModelsSubTab], entry.terms[0]);
  }

  if (target?.aiAgentsSubTab) {
    const labels = {
      models: ["settings.page.aiAgents.models", "Models"],
      digitaltwins: ["settings.page.aiAgents.personas", "Agent Personas"],
      everydayAgent: ["settings.page.aiAgents.everyday", "Everyday Agent"],
      memory: ["settings.page.aiAgents.memory", "Memory"],
    } as const;
    return translateSidebarTuple(labels[target.aiAgentsSubTab], entry.terms[0]);
  }

  if (target?.communicationSubTab) {
    if (target.secondaryChannel) {
      return (
        secondaryChannelItems.find(
          (item) => item.key === target.secondaryChannel,
        )?.label ?? entry.terms[0]
      );
    }
    return target.communicationSubTab === "morechannels"
      ? translate("settings.page.communication.more", "More Channels")
      : target.communicationSubTab;
  }

  if (target?.automationsSubTab) {
    const labels = {
      queue: ["settings.page.automations.queue", "Task Queue"],
      council: ["settings.page.automations.council", "R&D Council"],
      subconscious: [
        "settings.page.automations.subconscious",
        "Workflow Intelligence",
      ],
      scheduled: ["settings.page.automations.scheduled", "Scheduled Tasks"],
      hooks: ["settings.page.automations.hooks", "Webhooks"],
      triggers: ["settings.page.automations.triggers", "Event Triggers"],
      briefing: ["settings.page.automations.briefing", "Daily Briefing"],
      suggestions: ["settings.page.automations.suggestions", "Suggestions"],
      traces: ["settings.page.automations.traces", "Task Traces"],
    } as const;
    return translateSidebarTuple(
      labels[target.automationsSubTab],
      entry.terms[0],
    );
  }

  if (target?.toolsIntegrationsSubTab) {
    const labels = {
      integrations: [
        "settings.page.toolsIntegrations.integrations",
        "Integrations",
      ],
      customize: ["settings.page.toolsIntegrations.customize", "Customize"],
      skills: ["settings.page.toolsIntegrations.skills", "Skills"],
      mcp: ["settings.page.toolsIntegrations.mcp", "MCP Servers"],
      tools: ["settings.page.toolsIntegrations.tools", "Built-in Tools"],
      extensions: ["settings.page.toolsIntegrations.extensions", "Extensions"],
    } as const;
    return translateSidebarTuple(
      labels[target.toolsIntegrationsSubTab],
      entry.terms[0],
    );
  }

  if (target?.integrationsSubTab) {
    const labels = {
      connectors: ["settings.page.integrations.connectors", "Connectors"],
      identity: ["settings.page.integrations.identity", "Identity"],
    } as const;
    return translateSidebarTuple(
      labels[target.integrationsSubTab],
      entry.terms[0],
    );
  }

  if (target?.skillsSubTab) {
    const labels = {
      custom: ["settings.page.skills.custom", "Custom Skills"],
      store: ["settings.page.skills.store", "Skill Store"],
    } as const;
    return translateSidebarTuple(labels[target.skillsSubTab], entry.terms[0]);
  }

  if (target?.accessSubTab) {
    const labels = {
      controlplane: ["settings.page.access.remote", "Remote Access"],
      webaccess: ["settings.page.access.web", "Web Access"],
    } as const;
    return translateSidebarTuple(labels[target.accessSubTab], entry.terms[0]);
  }

  return entry.terms[0];
};

const normalizeSettingsSidebarSearchQuery = (value: string): string =>
  value.trim().toLowerCase();

const matchesSettingsSidebarSearchQuery = (
  haystack: string,
  query: string,
): boolean => {
  const normalizedQuery = normalizeSettingsSidebarSearchQuery(query);
  if (!normalizedQuery) return true;
  const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
  return tokens.every((token) => haystack.includes(token));
};

interface SettingsSidebarProps {
  activeTab: SettingsTab;
  isMacPlatform: boolean;
  onBack: () => void;
  onSelect: (item: SidebarItem, target?: SidebarSearchTarget) => void;
}

const SettingsSidebar = memo(function SettingsSidebar({
  activeTab,
  isMacPlatform,
  onBack,
  onSelect,
}: SettingsSidebarProps) {
  const language = useLanguage();
  const [sidebarSearch, setSidebarSearch] = useState("");
  const deferredSidebarSearch = useDeferredValue(sidebarSearch);
  const hasSidebarSearch = sidebarSearch.trim().length > 0;
  const showGroupHeaders = useMemo(() => {
    const groups = new Set(
      sidebarItems
        .filter((item) => !item.macOnly || isMacPlatform)
        .map((item) => item.group),
    );
    return groups.size > 1;
  }, [isMacPlatform]);

  const filteredSidebarItems = useMemo<SidebarSearchResult[]>(() => {
    return sidebarItems
      .filter((item) => !item.macOnly || isMacPlatform)
      .flatMap<SidebarSearchResult>((item) => {
        const itemLabel = getSidebarItemLabel(item);
        const tabEntries: SidebarSearchCandidate[] = (
          sidebarSearchEntries[item.tab] ?? []
        )
          .filter(
            (entry) =>
              isInitialReleaseSettingsAvailable(
                entry.target?.tab ?? item.tab,
              ) &&
              (!entry.target?.aiAgentsSubTab ||
                entry.target.aiAgentsSubTab === "models"),
          )
          .map((entry) => ({
            item,
            label: getSidebarSearchEntryLabel(entry),
            matchedTarget: entry.target,
            isTabResult: true,
            terms: [
              item.label,
              itemLabel,
              item.group,
              getSidebarGroupLabel(item.group),
              getSidebarSearchEntryLabel(entry),
              ...entry.terms,
            ],
          }));

        if (!hasSidebarSearch) {
          return [
            {
              item,
              label: itemLabel,
              matchedTarget: undefined,
              isTabResult: false,
            },
          ];
        }

        const matchedTabs = tabEntries.filter((entry) =>
          matchesSettingsSidebarSearchQuery(
            entry.terms.join(" ").toLowerCase(),
            deferredSidebarSearch,
          ),
        );
        if (matchedTabs.length > 0) {
          return matchedTabs;
        }

        const itemTerms = [
          item.label,
          itemLabel,
          item.group,
          getSidebarGroupLabel(item.group),
        ];
        return matchesSettingsSidebarSearchQuery(
          itemTerms.join(" ").toLowerCase(),
          deferredSidebarSearch,
        )
          ? [
              {
                item,
                label: itemLabel,
                matchedTarget: { tab: item.tab },
                isTabResult: false,
              },
            ]
          : [];
      });
  }, [deferredSidebarSearch, isMacPlatform, language]);

  return (
    <div className="settings-sidebar">
      <h1 className="settings-sidebar-title">
        {translate("settings.title", "Settings")}
      </h1>
      <button className="settings-back-btn" onClick={onBack}>
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        {translate("settings.back", "Back")}
      </button>
      <div className="settings-sidebar-search">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="M21 21l-4.35-4.35" />
        </svg>
        <input
          type="text"
          placeholder={translate(
            "settings.search.placeholder",
            "Search settings...",
          )}
          value={sidebarSearch}
          onChange={(e) => setSidebarSearch(e.target.value)}
        />
        {hasSidebarSearch && (
          <button
            className="settings-sidebar-search-clear"
            onClick={() => setSidebarSearch("")}
            aria-label={translate("settings.search.clear", "Clear search")}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>
      <div className="settings-nav-items">
        {
          filteredSidebarItems.reduce<{
            seenGroups: Set<string>;
            elements: ReactNode[];
          }>(
            (acc, { item, matchedTarget, label, isTabResult }, index) => {
              if (
                showGroupHeaders &&
                !hasSidebarSearch &&
                !acc.seenGroups.has(item.group)
              ) {
                acc.elements.push(
                  <div
                    key={`group-${item.group}`}
                    className="settings-nav-group-header"
                  >
                    {getSidebarGroupLabel(item.group)}
                  </div>,
                );
                acc.seenGroups.add(item.group);
              }
              acc.elements.push(
                <button
                  key={`${item.tab}-${matchedTarget ? JSON.stringify(matchedTarget) : "root"}-${index}`}
                  className={`settings-nav-item ${activeTab === item.tab || (item.tab === "morechannels" && (activeTab === "teams" || activeTab === "x")) ? "active" : ""}`}
                  data-tab={item.tab}
                  onClick={() => onSelect(item, matchedTarget)}
                >
                  {item.icon}
                  {isTabResult ? (
                    <span className="settings-nav-search-result">
                      <span>{label}</span>
                      <span className="settings-nav-search-result-parent">
                        {getSidebarItemLabel(item)}
                      </span>
                    </span>
                  ) : (
                    label
                  )}
                </button>,
              );
              return acc;
            },
            { seenGroups: new Set<string>(), elements: [] },
          ).elements
        }
        {hasSidebarSearch && filteredSidebarItems.length === 0 && (
          <div className="settings-nav-no-results">
            {translate("settings.search.noResults", "No matching settings")}
          </div>
        )}
      </div>
    </div>
  );
});

function ProviderLogoIcon({
  src,
  fallback,
}: {
  src: string;
  fallback: ReactNode;
}) {
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [src]);

  return (
    <span className="llm-provider-logo" aria-hidden="true">
      {!imageFailed ? (
        <img src={src} alt="" onError={() => setImageFailed(true)} />
      ) : (
        <span className="llm-provider-logo-fallback">{fallback}</span>
      )}
    </span>
  );
}

const vendorIconPath = (fileName: string) => `./vendor-icons/${fileName}`;
const channelIconPath = (fileName: string) => `./channel-icons/${fileName}`;

function ChannelLogoIcon({
  src,
  fallback,
}: {
  src?: string;
  fallback: ReactNode;
}) {
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [src]);

  return (
    <span className="channel-config-logo" aria-hidden="true">
      {src && !imageFailed ? (
        <img src={src} alt="" onError={() => setImageFailed(true)} />
      ) : (
        <span className="channel-config-logo-fallback">{fallback}</span>
      )}
    </span>
  );
}

const CHANNEL_ICON_SRC: Partial<Record<CommunicationChannelKey, string>> = {
  telegram: channelIconPath("telegram.svg"),
  feishu: channelIconPath("lark.svg"),
  dingtalk: channelIconPath("dingtalk.svg"),
  weixin: channelIconPath("weixin.svg"),
  wecom: channelIconPath("wecom.svg"),
  slack: channelIconPath("slack.svg"),
  discord: channelIconPath("discord.svg"),
  whatsapp: channelIconPath("whatsapp.svg"),
  teams: channelIconPath("teams.svg"),
  x: channelIconPath("x.svg"),
  imessage: channelIconPath("imessage.svg"),
  signal: channelIconPath("signal.svg"),
  email: channelIconPath("email.svg"),
  googlechat: channelIconPath("google-chat.svg"),
  line: channelIconPath("line.svg"),
  mattermost: channelIconPath("mattermost.svg"),
  matrix: channelIconPath("matrix.svg"),
  twitch: channelIconPath("twitch.svg"),
  bluebubbles: channelIconPath("bluebubbles.svg"),
};

const LLM_PROVIDER_ICONS: Record<string, ReactNode> = {
  anthropic: (
    <ProviderLogoIcon src={vendorIconPath("claude-color.svg")} fallback="CL" />
  ),
  openai: <ProviderLogoIcon src={vendorIconPath("openai.svg")} fallback="OA" />,
  azure: (
    <ProviderLogoIcon src={vendorIconPath("azure-openai.svg")} fallback="AZ" />
  ),
  "azure-anthropic": (
    <ProviderLogoIcon src={vendorIconPath("azure-openai.svg")} fallback="AZ" />
  ),
  gemini: (
    <ProviderLogoIcon src={vendorIconPath("gemini-color.svg")} fallback="GM" />
  ),
  openrouter: (
    <ProviderLogoIcon
      src={vendorIconPath("openrouter-color.svg")}
      fallback="OR"
    />
  ),
  deepseek: (
    <ProviderLogoIcon
      src={vendorIconPath("deepseek-color.svg")}
      fallback="DS"
    />
  ),
  ollama: (
    <ProviderLogoIcon
      src={vendorIconPath("local-internal.svg")}
      fallback="LC"
    />
  ),
  groq: <ProviderLogoIcon src={vendorIconPath("groq.ico")} fallback="GQ" />,
  xai: <ProviderLogoIcon src={vendorIconPath("xai.svg")} fallback="xA" />,
  "xai-oauth": (
    <ProviderLogoIcon src={vendorIconPath("xai.svg")} fallback="xA" />
  ),
  kimi: (
    <ProviderLogoIcon src={vendorIconPath("kimi-color.svg")} fallback="KM" />
  ),
  "nano-gpt": (
    <ProviderLogoIcon
      src={vendorIconPath("custom-endpoint.svg")}
      fallback="NG"
    />
  ),
  bedrock: (
    <ProviderLogoIcon src={vendorIconPath("aws-bedrock.svg")} fallback="AWS" />
  ),
  pi: <ProviderLogoIcon src={vendorIconPath("pi.svg")} fallback="PI" />,
  moa: (
    <ProviderLogoIcon
      src={vendorIconPath("agents-mixture.svg")}
      fallback="MOA"
    />
  ),
  "hf-agents": (
    <ProviderLogoIcon
      src={vendorIconPath("agents-mixture.svg")}
      fallback="HF"
    />
  ),
  "openai-compatible": (
    <ProviderLogoIcon
      src={vendorIconPath("custom-endpoint.svg")}
      fallback="AI"
    />
  ),
  minimax: (
    <ProviderLogoIcon src={vendorIconPath("minimax-color.svg")} fallback="MM" />
  ),
  "qwen-portal": (
    <ProviderLogoIcon src={vendorIconPath("qwen-color.svg")} fallback="QW" />
  ),
  zai: <ProviderLogoIcon src={vendorIconPath("zai.svg")} fallback="ZA" />,
};

const DEFAULT_DEEPSEEK_MODELS = [
  { id: "deepseek-chat", name: "DeepSeek Chat" },
];

const getLLMProviderIcon = (
  providerType: string,
  customEntry?: { compatibility?: string },
) => {
  if (LLM_PROVIDER_ICONS[providerType]) {
    return LLM_PROVIDER_ICONS[providerType];
  }
  if (customEntry?.compatibility === "anthropic") {
    return LLM_PROVIDER_ICONS.anthropic;
  }
  if (customEntry?.compatibility === "openai") {
    return LLM_PROVIDER_ICONS.openai;
  }
  return <Plus {...S} />;
};

export function Settings({
  onBack,
  onSettingsChanged,
  devRunLoggingEnabled,
  onDevRunLoggingEnabledChange,
  initialTab = "appearance",
  workspaceId,
  onCreateTask,
  onOpenTask,
  onNavigateToAgents,
}: SettingsProps) {
  const language = useLanguage();
  const safeInitialTab: SettingsTab = isInitialReleaseSettingsAvailable(
    initialTab,
  )
    ? initialTab
    : "appearance";
  const normalizedInitialTab: SettingsTab =
    safeInitialTab === "personality" || safeInitialTab === "voice"
      ? "appearance"
      : safeInitialTab === "tray" ||
          safeInitialTab === "policies" ||
          safeInitialTab === "access" ||
          safeInitialTab === "controlplane" ||
          safeInitialTab === "webaccess" ||
          safeInitialTab === "devices"
        ? "appearance"
        : safeInitialTab === "llm" ||
            safeInitialTab === "image" ||
            safeInitialTab === "video" ||
            safeInitialTab === "search" ||
            safeInitialTab === "guardrails" ||
            safeInitialTab === "insights"
          ? "aimodels"
          : safeInitialTab === "whatsapp" ||
              safeInitialTab === "telegram" ||
              safeInitialTab === "slack" ||
              safeInitialTab === "teams" ||
              safeInitialTab === "x"
            ? "morechannels"
            : [
                  "queue",
                  "subconscious",
                  "scheduled",
                  "hooks",
                  "triggers",
                  "council",
                  "briefing",
                  "suggestions",
                  "traces",
                ].includes(safeInitialTab as string)
              ? "automations"
              : [
                    "git",
                    "connectors",
                    "identity",
                    "customize",
                    "skills",
                    "skillhub",
                    "mcp",
                    "tools",
                    "extensions",
                  ].includes(safeInitialTab as string)
                ? "integrations"
                : safeInitialTab === "health" ||
                    safeInitialTab === "nodes" ||
                    safeInitialTab === "updates"
                  ? "appearance"
                  : safeInitialTab;
  const [activeTab, setActiveTab] = useState<SettingsTab>(normalizedInitialTab);
  const [activePreferencesSubTab, setActivePreferencesSubTab] = useState<
    "appearance" | "personality" | "voice"
  >(
    safeInitialTab === "personality" || safeInitialTab === "voice"
      ? safeInitialTab
      : "appearance",
  );
  const [activeAIAgentsSubTab, setActiveAIAgentsSubTab] = useState<
    "models" | "digitaltwins" | "everydayAgent" | "memory"
  >("models");
  const [, setActiveCommunicationSubTab] = useState<
    "whatsapp" | "telegram" | "slack" | "morechannels"
  >(
    initialTab === "telegram" ||
      initialTab === "slack" ||
      initialTab === "whatsapp"
      ? initialTab
      : "morechannels",
  );
  const [, setActiveSecondaryChannel] = useState<SecondaryChannel>(
    initialTab === "teams" || initialTab === "x" ? initialTab : "teams",
  );
  const [activeChannelKey, setActiveChannelKey] =
    useState<CommunicationChannelKey>(
      initialTab === "telegram" ||
        initialTab === "slack" ||
        initialTab === "whatsapp" ||
        initialTab === "teams" ||
        initialTab === "x"
        ? initialTab
        : "weixin",
    );
  const [expandedChannelKey, setExpandedChannelKey] =
    useState<CommunicationChannelKey | null>(null);
  const [gatewayChannels, setGatewayChannels] = useState<ChannelData[]>([]);
  const gatewayChannelsLoadRef = useRef<Promise<void> | null>(null);
  const [activeSkillsSubTab, setActiveSkillsSubTab] = useState<
    "custom" | "store"
  >(initialTab === "skillhub" ? "store" : "custom");
  const [activeAIModelsSubTab, setActiveAIModelsSubTab] = useState<
    "llm" | "image" | "video" | "search" | "budget"
  >(
    safeInitialTab === "guardrails"
      ? "budget"
      : initialTab === "search"
        ? "search"
        : "llm",
  );
  const [showModelUsageInsights, setShowModelUsageInsights] = useState(
    initialTab === "insights",
  );
  const [activeAutomationsSubTab, setActiveAutomationsSubTab] = useState<
    | "queue"
    | "subconscious"
    | "scheduled"
    | "hooks"
    | "triggers"
    | "council"
    | "briefing"
    | "suggestions"
    | "traces"
  >(
    ["scheduled", "briefing", "suggestions"].includes(initialTab as string)
      ? (initialTab as "scheduled" | "briefing" | "suggestions")
      : "scheduled",
  );
  const [activeIntegrationsSubTab, setActiveIntegrationsSubTab] = useState<
    "connectors" | "identity"
  >(initialTab === "identity" ? "identity" : "connectors");
  const [activeToolsIntegrationsSubTab, setActiveToolsIntegrationsSubTab] =
    useState<
      "integrations" | "customize" | "skills" | "mcp" | "tools" | "extensions"
    >(
      initialTab === "customize" ||
        initialTab === "skills" ||
        initialTab === "mcp" ||
        initialTab === "tools" ||
        initialTab === "extensions" ||
        initialTab === "skillhub"
        ? initialTab === "skillhub"
          ? "skills"
          : initialTab
        : "integrations",
    );
  const [activeAccessSubTab, setActiveAccessSubTab] = useState<
    "controlplane" | "webaccess"
  >(initialTab === "webaccess" ? "webaccess" : "controlplane");
  const settingsRef = useRef<LLMSettingsData>({
    providerType: "anthropic",
    modelKey: "sonnet-4-5",
  });
  const [settings, setSettingsState] = useState<LLMSettingsData>(
    settingsRef.current,
  );
  const setSettings = (value: SetStateAction<LLMSettingsData>) => {
    setSettingsState((prev) => {
      const next = typeof value === "function" ? value(prev) : value;
      settingsRef.current = next;
      return next;
    });
  };
  const [models, setModels] = useState<ModelOption[]>([]);
  const [providerRoutingModels, setProviderRoutingModels] = useState<
    ModelOption[]
  >([]);
  const [providerModelOptionsByType, setProviderModelOptionsByType] = useState<
    Record<string, ModelOption[]>
  >({});
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [routingRuntime, setRoutingRuntime] =
    useState<LLMRoutingRuntimeState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [resettingCredentials, setResettingCredentials] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    error?: string;
    providerType?: LLMProviderType;
  } | null>(null);
  const [addModelModalOpen, setAddModelModalOpen] = useState(false);
  const [addModelProviderType, setAddModelProviderType] =
    useState<LLMProviderType>("gemini");
  const [modelProviderSearch, setModelProviderSearch] = useState("");
  const [selectedModelsForAdd, setSelectedModelsForAdd] = useState<string[]>(
    [],
  );
  const [expandedModelProviders, setExpandedModelProviders] = useState<
    Record<string, boolean>
  >({});
  const [deleteProviderConfirm, setDeleteProviderConfirm] =
    useState<LLMProviderType | null>(null);
  const [deleteModelConfirm, setDeleteModelConfirm] = useState<string | null>(
    null,
  );
  const [expandedModelUsageDetails, setExpandedModelUsageDetails] = useState<
    Record<string, boolean>
  >({});
  const [modelUsageMode, setModelUsageMode] = useState<ModelUsageMode>("daily");
  const [modelUsage, setModelUsage] = useState<ModelUsageSnapshot | null>(null);
  const [modelUsageLoading, setModelUsageLoading] = useState(false);
  const modelUsageDays = useMemo(() => {
    const usageByDate = new Map(
      (modelUsage?.requestsByDay || []).map((day) => [day.dateKey, day]),
    );
    const today = new Date();
    return Array.from({ length: 365 }, (_, index) => {
      const date = new Date(today);
      date.setDate(today.getDate() - (364 - index));
      const dateKey = getLocalDateKey(date);
      return (
        usageByDate.get(dateKey) || {
          dateKey,
          llmCalls: 0,
          cost: 0,
          inputTokens: 0,
          outputTokens: 0,
          cachedTokens: 0,
        }
      );
    });
  }, [modelUsage?.requestsByDay]);
  const modelDailyUsageCache = useMemo(
    () => new Map<string, ModelUsageDay[]>(),
    [modelUsage?.modelRequestsByDay, modelUsageDays],
  );

  const platform =
    window.electronAPI?.getPlatform?.() ??
    (() => {
      if (typeof navigator === "undefined") return "unknown";
      const navPlatform = navigator.platform.toLowerCase();
      if (navPlatform.includes("win")) return "win32";
      if (navPlatform.includes("mac")) return "darwin";
      return "linux";
    })();
  const isMacPlatform = platform === "darwin";

  const loadModelUsage = useCallback(async () => {
    try {
      setModelUsageLoading(true);
      const usageWorkspaceId = workspaceId?.trim();
      const usage = await window.electronAPI.getUsageInsights(
        usageWorkspaceId && !usageWorkspaceId.startsWith("__temp_workspace__")
          ? usageWorkspaceId
          : "__all__",
        365,
      );
      setModelUsage(usage as ModelUsageSnapshot);
    } catch (error) {
      console.error("Failed to load model usage:", error);
      setModelUsage(null);
    } finally {
      setModelUsageLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    if (activeAIModelsSubTab === "llm") {
      void loadModelUsage();
    }
  }, [activeAIModelsSubTab, loadModelUsage]);

  const loadGatewayChannels = useCallback(() => {
    if (gatewayChannelsLoadRef.current) {
      return gatewayChannelsLoadRef.current;
    }

    const task = (async () => {
      try {
        const channels = await window.electronAPI.getGatewayChannels();
        const nextChannels = Array.isArray(channels)
          ? (channels as ChannelData[])
          : [];
        setGatewayChannels((previous) =>
          areGatewayChannelsEquivalent(previous, nextChannels)
            ? previous
            : nextChannels,
        );
      } catch (error) {
        console.error("Failed to load gateway channels:", error);
        setGatewayChannels((previous) =>
          previous.length === 0 ? previous : [],
        );
      }
    })();

    const trackedTask = task.finally(() => {
      if (gatewayChannelsLoadRef.current === trackedTask) {
        gatewayChannelsLoadRef.current = null;
      }
    });

    gatewayChannelsLoadRef.current = trackedTask;
    return trackedTask;
  }, []);

  const refreshGatewayChannels = useCallback(() => {
    void loadGatewayChannels();
  }, [loadGatewayChannels]);

  useEffect(() => {
    if (
      activeTab === "morechannels" ||
      activeTab === "telegram" ||
      activeTab === "slack" ||
      activeTab === "whatsapp" ||
      activeTab === "teams" ||
      activeTab === "x"
    ) {
      void loadGatewayChannels();
    }
  }, [activeTab, loadGatewayChannels]);

  const gatewayChannelByType = useMemo(() => {
    const channelMap = new Map<ChannelType, ChannelData>();
    for (const channel of gatewayChannels) {
      if (!channelMap.has(channel.type)) {
        channelMap.set(channel.type, channel);
      }
    }
    return channelMap;
  }, [gatewayChannels]);

  const selectCommunicationChannel = useCallback(
    (key: CommunicationChannelKey) => {
      setActiveChannelKey(key);
      if (key === "whatsapp" || key === "telegram" || key === "slack") {
        setActiveCommunicationSubTab(key);
        return;
      }
      setActiveCommunicationSubTab("morechannels");
      if (isSecondaryChannelKey(key)) {
        setActiveSecondaryChannel(key);
      }
    },
    [],
  );

  const toggleCommunicationChannelConfig = useCallback(
    (key: CommunicationChannelKey) => {
      selectCommunicationChannel(key);
      setExpandedChannelKey((current) => (current === key ? null : key));
    },
    [selectCommunicationChannel],
  );

  const handleSidebarItemSelect = useCallback(
    (item: SidebarItem, target?: SidebarSearchTarget) => {
      const nextTab = target?.tab ?? item.tab;
      if (!isInitialReleaseSettingsAvailable(nextTab)) return;
      if (target?.aiAgentsSubTab && target.aiAgentsSubTab !== "models") {
        return;
      }
      setActiveTab(nextTab);
      if (target?.preferencesSubTab) {
        setActivePreferencesSubTab(target.preferencesSubTab);
      }
      if (target?.aiAgentsSubTab) {
        setActiveAIAgentsSubTab(target.aiAgentsSubTab);
      }
      if (target?.communicationSubTab) {
        setActiveCommunicationSubTab(target.communicationSubTab);
        if (target.communicationSubTab !== "morechannels") {
          selectCommunicationChannel(target.communicationSubTab);
        }
      }
      if (target?.secondaryChannel) {
        setActiveSecondaryChannel(target.secondaryChannel);
        selectCommunicationChannel(target.secondaryChannel);
      }
      if (target?.aiModelsSubTab) {
        setActiveAIModelsSubTab(target.aiModelsSubTab);
      }
      if (target?.showModelUsage) {
        setShowModelUsageInsights(true);
      }
      if (target?.automationsSubTab) {
        setActiveAutomationsSubTab(target.automationsSubTab);
      }
      if (target?.skillsSubTab) {
        setActiveSkillsSubTab(target.skillsSubTab);
      }
      if (target?.integrationsSubTab) {
        setActiveIntegrationsSubTab(target.integrationsSubTab);
      }
      if (target?.toolsIntegrationsSubTab) {
        setActiveToolsIntegrationsSubTab(target.toolsIntegrationsSubTab);
      }
      if (target?.accessSubTab) {
        setActiveAccessSubTab(target.accessSubTab);
      }
    },
    [selectCommunicationChannel],
  );
  // Form state for credentials (not persisted directly)
  const [anthropicApiKey, setAnthropicApiKey] = useState("");
  const [anthropicSubscriptionToken, setAnthropicSubscriptionToken] =
    useState("");
  const [anthropicAuthMethod, setAnthropicAuthMethod] = useState<
    "api_key" | "subscription"
  >("api_key");
  const [loadingClaudeModels, setLoadingClaudeModels] = useState(false);
  const [awsRegion, setAwsRegion] = useState("us-east-1");
  const [awsAccessKeyId, setAwsAccessKeyId] = useState("");
  const [awsSecretAccessKey, setAwsSecretAccessKey] = useState("");
  const [awsProfile, setAwsProfile] = useState("");
  const [useDefaultCredentials, setUseDefaultCredentials] = useState(true);

  // Ollama state
  const [ollamaBaseUrl, setOllamaBaseUrl] = useState("http://localhost:11434");
  const [ollamaModel, setOllamaModel] = useState("llama3.2");
  const [ollamaApiKey, setOllamaApiKey] = useState("");
  const [ollamaModels, setOllamaModels] = useState<
    Array<{ name: string; size: number }>
  >([]);
  const [loadingOllamaModels, setLoadingOllamaModels] = useState(false);

  // Gemini state
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [geminiModel, setGeminiModel] = useState("gemini-2.0-flash");
  const [geminiModels, setGeminiModels] = useState<
    Array<{ name: string; displayName: string; description: string }>
  >([]);
  const [loadingGeminiModels, setLoadingGeminiModels] = useState(false);

  // OpenRouter state
  const [openrouterApiKey, setOpenrouterApiKey] = useState("");
  const [openrouterBaseUrl, setOpenrouterBaseUrl] = useState("");
  const [openrouterModel, setOpenrouterModel] = useState(
    "anthropic/claude-3.5-sonnet",
  );
  const [openrouterParetoMinCodingScore, setOpenrouterParetoMinCodingScore] =
    useState("");
  const [openrouterModels, setOpenrouterModels] = useState<
    Array<{ id: string; name: string; context_length: number }>
  >([]);
  const [loadingOpenRouterModels, setLoadingOpenRouterModels] = useState(false);

  // OpenAI state
  const [openaiApiKey, setOpenaiApiKey] = useState("");
  const [openaiModel, setOpenaiModel] = useState("gpt-4o-mini");
  const [openaiModels, setOpenaiModels] = useState<
    Array<{ id: string; name: string; description: string }>
  >([]);
  const [loadingOpenAIModels, setLoadingOpenAIModels] = useState(false);
  const [openaiAuthMethod, setOpenaiAuthMethod] = useState<"api_key" | "oauth">(
    "api_key",
  );
  const [openaiReasoningEffort, setOpenaiReasoningEffort] =
    useState<OpenAIReasoningEffort>("medium");
  const openaiReasoningEffortOptions = useMemo(
    () => getOpenAIReasoningEffortOptions(openaiModel),
    [openaiModel],
  );
  useEffect(() => {
    if (
      !openaiReasoningEffortOptions.some(
        (option) => option.value === openaiReasoningEffort,
      )
    ) {
      setOpenaiReasoningEffort("medium");
    }
  }, [openaiReasoningEffort, openaiReasoningEffortOptions]);
  const [openaiTextVerbosity, setOpenaiTextVerbosity] =
    useState<LLMTextVerbosity>("medium");
  const [openaiOAuthConnected, setOpenaiOAuthConnected] = useState(false);
  const [openaiOAuthLoading, setOpenaiOAuthLoading] = useState(false);

  type ImageGenProvider =
    "openai" | "openai-codex" | "azure" | "openrouter" | "gemini";
  type ImageProviderTab = ImageGenProvider | "auto";
  type ImageGenModel = "gpt-image-2" | "gpt-image-1.5" | "nano-banana-2";

  // Image generation (text-to-image) state
  const [imageGenDefaultProvider, setImageGenDefaultProvider] = useState<
    ImageGenProvider | ""
  >("");
  const [imageGenDefaultModel, setImageGenDefaultModel] = useState<
    ImageGenModel | ""
  >("");
  const [imageGenBackupProvider, setImageGenBackupProvider] = useState<
    ImageGenProvider | ""
  >("");
  const [imageGenBackupModel, setImageGenBackupModel] = useState<
    ImageGenModel | ""
  >("");
  const [imageOpenAIApiKey, setImageOpenAIApiKey] = useState("");
  const [imageOpenAIModel, setImageOpenAIModel] = useState("gpt-image-2");
  const [imageAzureApiKey, setImageAzureApiKey] = useState("");
  const [imageAzureEndpoint, setImageAzureEndpoint] = useState("");
  const [imageAzureDeployment, setImageAzureDeployment] = useState("");
  const [imageAzureApiVersion, setImageAzureApiVersion] =
    useState("2024-02-15-preview");
  const [imageGeminiApiKey, setImageGeminiApiKey] = useState("");
  const [imageGeminiModel, setImageGeminiModel] =
    useState<"nano-banana-2">("nano-banana-2");
  const [imageOpenRouterApiKey, setImageOpenRouterApiKey] = useState("");
  const [imageOpenRouterBaseUrl, setImageOpenRouterBaseUrl] = useState(
    "https://openrouter.ai/api/v1",
  );
  const [imageOpenRouterModel, setImageOpenRouterModel] =
    useState("openai/gpt-image-2");
  const [imageOpenAICodexModel, setImageOpenAICodexModel] =
    useState("gpt-image-2");
  const [imageOpenAITimeoutSeconds, setImageOpenAITimeoutSeconds] =
    useState("300");
  const [imageOpenAICodexTimeoutSeconds, setImageOpenAICodexTimeoutSeconds] =
    useState("300");
  const [imageAzureTimeoutSeconds, setImageAzureTimeoutSeconds] =
    useState("300");
  const [imageOpenRouterTimeoutSeconds, setImageOpenRouterTimeoutSeconds] =
    useState("300");
  const [imageGeminiTimeoutSeconds, setImageGeminiTimeoutSeconds] =
    useState("300");

  // Video generation state
  const [videoDefaultProvider, setVideoDefaultProvider] = useState<
    "openai" | "azure" | "gemini" | "vertex" | "kling" | ""
  >("");
  const [videoFallbackProvider, setVideoFallbackProvider] = useState<
    "openai" | "azure" | "gemini" | "vertex" | "kling" | ""
  >("");
  // OpenAI Sora video config
  const [videoOpenAIModel, setVideoOpenAIModel] = useState("sora-2");
  const [videoOpenAIDuration, setVideoOpenAIDuration] = useState("5");
  const [videoOpenAIAspectRatio, setVideoOpenAIAspectRatio] = useState("16:9");
  const [videoOpenAIResolution, setVideoOpenAIResolution] = useState("720p");
  // Azure Sora video config
  const [videoAzureApiKey, setVideoAzureApiKey] = useState("");
  const [videoAzureEndpoint, setVideoAzureEndpoint] = useState("");
  const [videoAzureDeployment, setVideoAzureDeployment] = useState("");
  const [videoAzureApiVersion, setVideoAzureApiVersion] = useState("preview");
  const [videoAzureDuration, setVideoAzureDuration] = useState("5");
  const [videoAzureAspectRatio, setVideoAzureAspectRatio] = useState("16:9");
  // Gemini Veo config
  const [videoGeminiModel, setVideoGeminiModel] = useState<
    "veo-3.1" | "veo-3.1-fast-preview" | "veo-3.0"
  >("veo-3.1");
  const [videoGeminiDuration, setVideoGeminiDuration] = useState("5");
  const [videoGeminiAspectRatio, setVideoGeminiAspectRatio] = useState("16:9");
  // Vertex AI Veo config
  const [videoVertexModel, setVideoVertexModel] = useState<"veo-3" | "veo-3.1">(
    "veo-3",
  );
  const [videoVertexProjectId, setVideoVertexProjectId] = useState("");
  const [videoVertexLocation, setVideoVertexLocation] = useState("us-central1");
  const [videoVertexOutputGcsUri, setVideoVertexOutputGcsUri] = useState("");
  const [videoVertexAccessToken, setVideoVertexAccessToken] = useState("");
  const [videoVertexDuration, setVideoVertexDuration] = useState("5");
  const [videoVertexAspectRatio, setVideoVertexAspectRatio] = useState("16:9");
  // Kling config
  const [videoKlingApiKey, setVideoKlingApiKey] = useState("");
  const [videoKlingBaseUrl, setVideoKlingBaseUrl] = useState(
    "https://api.klingai.com",
  );
  const [videoKlingModel, setVideoKlingModel] = useState("kling-v2");
  const [videoKlingDuration, setVideoKlingDuration] = useState("5");
  const [videoKlingAspectRatio, setVideoKlingAspectRatio] = useState("16:9");

  // Azure OpenAI state
  const [azureApiKey, setAzureApiKey] = useState("");
  const [azureEndpoint, setAzureEndpoint] = useState("");
  const [azureDeployment, setAzureDeployment] = useState("");
  const [azureDeploymentsText, setAzureDeploymentsText] = useState("");
  const [azureApiVersion, setAzureApiVersion] = useState("2024-02-15-preview");
  const [azureReasoningEffort, setAzureReasoningEffort] =
    useState<AzureReasoningEffort>("medium");

  // Azure Anthropic state
  const [azureAnthropicApiKey, setAzureAnthropicApiKey] = useState("");
  const [azureAnthropicEndpoint, setAzureAnthropicEndpoint] = useState("");
  const [azureAnthropicDeployment, setAzureAnthropicDeployment] = useState("");
  const [azureAnthropicDeploymentsText, setAzureAnthropicDeploymentsText] =
    useState("");
  const [azureAnthropicApiVersion, setAzureAnthropicApiVersion] =
    useState("2023-06-01");

  // Groq state
  const [groqApiKey, setGroqApiKey] = useState("");
  const [groqBaseUrl, setGroqBaseUrl] = useState("");
  const [groqModel, setGroqModel] = useState("llama-3.1-8b-instant");
  const [groqModels, setGroqModels] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [loadingGroqModels, setLoadingGroqModels] = useState(false);

  // xAI state
  const [xaiApiKey, setXaiApiKey] = useState("");
  const [xaiBaseUrl, setXaiBaseUrl] = useState("");
  const [xaiModel, setXaiModel] = useState("grok-4.3");
  const [xaiModels, setXaiModels] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [loadingXaiModels, setLoadingXaiModels] = useState(false);
  const [xaiOAuthConnected, setXaiOAuthConnected] = useState(false);
  const [xaiOAuthLoading, setXaiOAuthLoading] = useState(false);

  // DeepSeek state
  const [deepseekApiKey, setDeepseekApiKey] = useState("");
  const [deepseekBaseUrl, setDeepseekBaseUrl] = useState("");
  const [deepseekModel, setDeepseekModel] = useState("deepseek-chat");
  const [deepseekModels, setDeepseekModels] = useState<
    Array<{ id: string; name: string }>
  >(DEFAULT_DEEPSEEK_MODELS);
  const [loadingDeepseekModels, setLoadingDeepseekModels] = useState(false);

  // Kimi state
  const [kimiApiKey, setKimiApiKey] = useState("");
  const [kimiBaseUrl, setKimiBaseUrl] = useState("");
  const [kimiModel, setKimiModel] = useState("kimi-k3");
  const [kimiModels, setKimiModels] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [loadingKimiModels, setLoadingKimiModels] = useState(false);
  const [kimiConnectionState, setKimiConnectionState] = useState<
    "idle" | "success" | "error"
  >("idle");
  const [kimiConnectionError, setKimiConnectionError] =
    useState<KimiConnectionErrorCode>();

  // Pi state
  const [piProvider, setPiProvider] = useState("anthropic");
  const [piApiKey, setPiApiKey] = useState("");
  const [piModel, setPiModel] = useState("");
  const [piModels, setPiModels] = useState<
    Array<{ id: string; name: string; description: string }>
  >([]);
  const [piProviders, setPiProviders] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [loadingPiModels, setLoadingPiModels] = useState(false);

  // OpenAI-compatible state
  const [openaiCompatDisplayName, setOpenaiCompatDisplayName] = useState("");
  const [openaiCompatBaseUrl, setOpenaiCompatBaseUrl] = useState("");
  const [openaiCompatApiKey, setOpenaiCompatApiKey] = useState("");
  const [openaiCompatModel, setOpenaiCompatModel] = useState("");
  const [openaiCompatSupportsImages, setOpenaiCompatSupportsImages] = useState<
    boolean | undefined
  >(undefined);
  const [openaiCompatModels, setOpenaiCompatModels] = useState<
    Array<{ key: string; displayName: string; description: string }>
  >([]);
  const [loadingOpenAICompatModels, setLoadingOpenAICompatModels] =
    useState(false);

  // HuggingFace Local AI (hf-agents) state
  const [hfStatus, setHfStatus] = useState<{
    installed: boolean;
    hfInstalled?: boolean;
    version?: string;
    message?: string;
    mlxInstalled?: "ok" | "broken" | false;
    mlxMessage?: string;
    isMac?: boolean;
  } | null>(null);
  const [hfServerStatus, setHfServerStatus] = useState<{
    serverRunning: boolean;
    processAlive: boolean;
    models?: string[];
    lastError?: string | null;
  } | null>(null);
  const [hfHardwareOutput, setHfHardwareOutput] = useState<{
    models: string[];
    modelDetails?: Array<{
      spec: string;
      name: string;
      hasGguf: boolean;
      runtime: string;
      params: string;
      tps: number;
      memoryGb: number;
      quant: string;
      fitLevel: string;
    }>;
    output: string;
  } | null>(null);
  const [detectingHardware, setDetectingHardware] = useState(false);
  const [startingServer, setStartingServer] = useState(false);
  const [stoppingServer, setStoppingServer] = useState(false);
  const [serverLog, setServerLog] = useState<{
    lines: string[];
    state: "idle" | "downloading" | "loading" | "ready" | "error";
    downloadingFile?: string;
  } | null>(null);

  // Custom provider state
  const customProvidersRef = useRef<Record<string, CustomProviderConfig>>({});
  const [customProviders, setCustomProvidersState] = useState<
    Record<string, CustomProviderConfig>
  >(customProvidersRef.current);
  const setCustomProviders = (
    value: SetStateAction<Record<string, CustomProviderConfig>>,
  ) => {
    const previous = customProvidersRef.current;
    const next = typeof value === "function" ? value(previous) : value;
    customProvidersRef.current = next;
    setCustomProvidersState(next);
  };
  const [loadingCustomProviderModels, setLoadingCustomProviderModels] =
    useState(false);

  // Bedrock state
  const [bedrockModel, setBedrockModel] = useState("");
  const [bedrockModels, setBedrockModels] = useState<
    Array<{ id: string; name: string; description: string }>
  >([]);
  const [loadingBedrockModels, setLoadingBedrockModels] = useState(false);

  useEffect(() => {
    loadConfigStatus();
  }, []);

  useEffect(() => {
    if (!window.electronAPI?.onLLMRoutingEvent) return;
    const unsubscribe = window.electronAPI.onLLMRoutingEvent((event) => {
      setRoutingRuntime(event);
    });
    return unsubscribe;
  }, []);

  // Poll hf-agents server status when that provider is active
  useEffect(() => {
    if (settings.providerType !== "hf-agents") return;
    const poll = () => {
      window.electronAPI.getLocalAIServerStatus?.().then((result: Any) => {
        if (result) setHfServerStatus(result);
      });
    };
    poll();
    const interval = setInterval(poll, 5000);
    return () => clearInterval(interval);
  }, [settings.providerType]);

  const resolveCustomProviderId = (providerType: LLMProviderType) =>
    providerType === "kimi-coding" ? "kimi-code" : providerType;

  const updateCustomProvider = (
    providerType: LLMProviderType,
    updates: Partial<CustomProviderConfig>,
  ) => {
    const resolvedType = resolveCustomProviderId(providerType);
    setCustomProviders((prev) => ({
      ...prev,
      [resolvedType]: {
        ...prev[resolvedType],
        ...updates,
      },
    }));
  };

  const sanitizeFailoverProviders = (
    providers?: LLMProviderFallbackConfig[],
  ): LLMProviderFallbackConfig[] => {
    const normalized: LLMProviderFallbackConfig[] = [];
    const seen = new Set<string>();
    for (const entry of providers || []) {
      const providerType = resolveCustomProviderId(entry.providerType);
      const modelKey = entry.modelKey?.trim();
      if (!providerType) continue;
      const dedupeKey = `${providerType}:${modelKey || ""}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      normalized.push({
        providerType,
        ...(modelKey ? { modelKey } : {}),
      });
    }
    return normalized.slice(0, 5);
  };

  const sanitizeCustomProviders = (
    providers: Record<string, CustomProviderConfig>,
  ) => {
    const sanitized: Record<string, CustomProviderConfig> = {};
    Object.entries(providers).forEach(([key, value]) => {
      const apiKey = value.apiKey?.trim();
      const model = value.model?.trim();
      const baseUrl = value.baseUrl?.trim();
      const cachedModels = Array.isArray(value.cachedModels)
        ? value.cachedModels
            .map((entry) => ({
              key: entry.key?.trim(),
              displayName: entry.displayName?.trim(),
              description: entry.description?.trim(),
            }))
            .filter(
              (entry) =>
                typeof entry.key === "string" &&
                entry.key.length > 0 &&
                typeof entry.displayName === "string" &&
                entry.displayName.length > 0 &&
                typeof entry.description === "string" &&
                entry.description.length > 0,
            )
        : undefined;
      const strongModelKey = value.strongModelKey?.trim();
      const cheapModelKey = value.cheapModelKey?.trim();
      const automatedTaskModelKey = value.automatedTaskModelKey?.trim();
      const hasFallbackProviders = Object.prototype.hasOwnProperty.call(
        value,
        "fallbackProviders",
      );
      const fallbackProviders = sanitizeFailoverProviders(
        value.fallbackProviders,
      );
      const failoverPrimaryRetryCooldownSeconds =
        typeof value.failoverPrimaryRetryCooldownSeconds === "number" &&
        Number.isFinite(value.failoverPrimaryRetryCooldownSeconds)
          ? Math.max(
              0,
              Math.min(
                3600,
                Math.floor(value.failoverPrimaryRetryCooldownSeconds),
              ),
            )
          : undefined;
      const profileRoutingEnabled = value.profileRoutingEnabled === true;
      const supportsImages =
        typeof value.supportsImages === "boolean"
          ? value.supportsImages
          : undefined;
      const preferStrongForVerification =
        typeof value.preferStrongForVerification === "boolean"
          ? value.preferStrongForVerification
          : undefined;
      if (
        apiKey ||
        model ||
        baseUrl ||
        (cachedModels && cachedModels.length > 0) ||
        strongModelKey ||
        cheapModelKey ||
        automatedTaskModelKey ||
        hasFallbackProviders ||
        typeof failoverPrimaryRetryCooldownSeconds === "number" ||
        profileRoutingEnabled ||
        typeof supportsImages === "boolean" ||
        typeof preferStrongForVerification === "boolean"
      ) {
        sanitized[key] = {
          ...(apiKey ? { apiKey } : {}),
          ...(model ? { model } : {}),
          ...(baseUrl ? { baseUrl } : {}),
          ...(cachedModels && cachedModels.length > 0 ? { cachedModels } : {}),
          ...(strongModelKey ? { strongModelKey } : {}),
          ...(cheapModelKey ? { cheapModelKey } : {}),
          ...(automatedTaskModelKey ? { automatedTaskModelKey } : {}),
          ...(hasFallbackProviders ? { fallbackProviders } : {}),
          ...(typeof failoverPrimaryRetryCooldownSeconds === "number"
            ? { failoverPrimaryRetryCooldownSeconds }
            : {}),
          ...(profileRoutingEnabled ? { profileRoutingEnabled: true } : {}),
          ...(typeof supportsImages === "boolean" ? { supportsImages } : {}),
          ...(typeof preferStrongForVerification === "boolean"
            ? { preferStrongForVerification }
            : {}),
        };
      }
    });
    return Object.keys(sanitized).length > 0 ? sanitized : undefined;
  };

  const parseAzureDeployments = (value: string): string[] => {
    const seen = new Set<string>();
    return value
      .split(/[\n,]+/)
      .map((entry) => entry.trim())
      .filter(Boolean)
      .filter((entry) => {
        if (seen.has(entry)) {
          return false;
        }
        seen.add(entry);
        return true;
      });
  };

  const buildAzureSettings = () => {
    const deployments = parseAzureDeployments(azureDeploymentsText);
    let deployment = azureDeployment.trim();
    if (deployment) {
      if (!deployments.includes(deployment)) {
        deployments.unshift(deployment);
      }
    } else if (deployments.length > 0) {
      deployment = deployments[0];
    }

    return {
      deployment: deployment || undefined,
      deployments: deployments.length > 0 ? deployments : undefined,
    };
  };

  const buildAzureAnthropicSettings = () => {
    const deployments = parseAzureDeployments(azureAnthropicDeploymentsText);
    let deployment = azureAnthropicDeployment.trim();
    if (deployment) {
      if (!deployments.includes(deployment)) {
        deployments.unshift(deployment);
      }
    } else if (deployments.length > 0) {
      deployment = deployments[0];
    }

    return {
      deployment: deployment || undefined,
      deployments: deployments.length > 0 ? deployments : undefined,
    };
  };

  const getProviderRoutingConfig = (
    providerType: LLMProviderType,
  ): ProviderRoutingConfig => {
    const resolvedType = resolveCustomProviderId(providerType);
    const customEntry = CUSTOM_PROVIDER_MAP.get(resolvedType);
    if (customEntry) {
      return customProviders[resolvedType] || {};
    }

    switch (providerType) {
      case "anthropic":
        return settings.anthropic || {};
      case "bedrock":
        return settings.bedrock || {};
      case "ollama":
        return settings.ollama || {};
      case "gemini":
        return settings.gemini || {};
      case "openrouter":
        return settings.openrouter || {};
      case "openai":
        return settings.openai || {};
      case "azure":
        return settings.azure || {};
      case "azure-anthropic":
        return settings.azureAnthropic || {};
      case "groq":
        return settings.groq || {};
      case "xai":
      case "xai-oauth":
        return settings.xai || {};
      case "deepseek":
        return settings.deepseek || {};
      case "kimi":
        return settings.kimi || {};
      case "pi":
        return settings.pi || {};
      case "openai-compatible":
        return settings.openaiCompatible || {};
      case "moa":
        return settings.moa || {};
      default:
        return {};
    }
  };

  const getProviderFailoverConfig = (
    providerType: LLMProviderType,
  ): Pick<
    ProviderRoutingConfig,
    "fallbackProviders" | "failoverPrimaryRetryCooldownSeconds"
  > => {
    const resolvedType = resolveCustomProviderId(providerType);
    const customEntry = CUSTOM_PROVIDER_MAP.get(resolvedType);
    if (customEntry) {
      const config = customProviders[resolvedType] || {};
      return {
        fallbackProviders: Object.prototype.hasOwnProperty.call(
          config,
          "fallbackProviders",
        )
          ? config.fallbackProviders
          : settings.fallbackProviders,
        failoverPrimaryRetryCooldownSeconds:
          Object.prototype.hasOwnProperty.call(
            config,
            "failoverPrimaryRetryCooldownSeconds",
          )
            ? config.failoverPrimaryRetryCooldownSeconds
            : settings.failoverPrimaryRetryCooldownSeconds,
      };
    }

    const routing =
      (() => {
        switch (providerType) {
          case "anthropic":
            return settings.anthropic;
          case "bedrock":
            return settings.bedrock;
          case "ollama":
            return settings.ollama;
          case "gemini":
            return settings.gemini;
          case "openrouter":
            return settings.openrouter;
          case "openai":
            return settings.openai;
          case "azure":
            return settings.azure;
          case "azure-anthropic":
            return settings.azureAnthropic;
          case "groq":
            return settings.groq;
          case "xai":
          case "xai-oauth":
            return settings.xai;
          case "deepseek":
            return settings.deepseek;
          case "kimi":
            return settings.kimi;
          case "pi":
            return settings.pi;
          case "openai-compatible":
            return settings.openaiCompatible;
          case "moa":
            return settings.moa;
          default:
            return undefined;
        }
      })() || {};

    const shouldInheritGlobalFallbacks = providerType !== "moa";
    return {
      fallbackProviders: Object.prototype.hasOwnProperty.call(
        routing,
        "fallbackProviders",
      )
        ? routing.fallbackProviders
        : shouldInheritGlobalFallbacks
          ? settings.fallbackProviders
          : undefined,
      failoverPrimaryRetryCooldownSeconds: Object.prototype.hasOwnProperty.call(
        routing,
        "failoverPrimaryRetryCooldownSeconds",
      )
        ? routing.failoverPrimaryRetryCooldownSeconds
        : settings.failoverPrimaryRetryCooldownSeconds,
    };
  };

  const setProviderRoutingConfig = (
    providerType: LLMProviderType,
    updates: Partial<ProviderRoutingConfig>,
  ) => {
    const resolvedType = resolveCustomProviderId(providerType);
    const customEntry = CUSTOM_PROVIDER_MAP.get(resolvedType);
    if (customEntry) {
      setCustomProviders((prev) => ({
        ...prev,
        [resolvedType]: {
          ...prev[resolvedType],
          ...updates,
        },
      }));
      return;
    }

    const patchSettings = <T extends keyof LLMSettingsData>(key: T) =>
      setSettings((prev) => ({
        ...prev,
        [key]: {
          ...(prev[key] as Record<string, unknown> | undefined),
          ...updates,
        },
      }));

    switch (providerType) {
      case "anthropic":
        patchSettings("anthropic");
        return;
      case "bedrock":
        patchSettings("bedrock");
        return;
      case "ollama":
        patchSettings("ollama");
        return;
      case "gemini":
        patchSettings("gemini");
        return;
      case "openrouter":
        patchSettings("openrouter");
        return;
      case "openai":
        patchSettings("openai");
        return;
      case "azure":
        patchSettings("azure");
        return;
      case "azure-anthropic":
        patchSettings("azureAnthropic");
        return;
      case "groq":
        patchSettings("groq");
        return;
      case "xai":
      case "xai-oauth":
        patchSettings("xai");
        return;
      case "deepseek":
        patchSettings("deepseek");
        return;
      case "kimi":
        patchSettings("kimi");
        return;
      case "pi":
        patchSettings("pi");
        return;
      case "openai-compatible":
        patchSettings("openaiCompatible");
        return;
      case "moa":
        patchSettings("moa");
        return;
      default:
        return;
    }
  };

  const getProviderPrimaryModel = (providerType: LLMProviderType): string => {
    const resolvedType = resolveCustomProviderId(providerType);
    const customEntry = CUSTOM_PROVIDER_MAP.get(resolvedType);
    if (customEntry) {
      return (
        customProviders[resolvedType]?.model || customEntry.defaultModel || ""
      );
    }

    switch (providerType) {
      case "anthropic": {
        const registryModel =
          settings.providerModelRegistry?.anthropic?.models?.find(Boolean) ||
          "";
        if (registryModel) return registryModel;
        const isCurrentAnthropicProvider =
          resolveCustomProviderId(settings.providerType as LLMProviderType) ===
          "anthropic";
        const isEditingAnthropicProvider =
          addModelModalOpen &&
          resolveCustomProviderId(addModelProviderType as LLMProviderType) ===
            "anthropic";
        const modelKey = settings.modelKey || "";
        if (
          (isCurrentAnthropicProvider || isEditingAnthropicProvider) &&
          isLikelyClaudeModelKey(modelKey)
        ) {
          return modelKey;
        }
        return "";
      }
      case "bedrock":
        return bedrockModel || settings.bedrock?.model || "";
      case "ollama":
        return ollamaModel || settings.ollama?.model || "";
      case "gemini":
        return geminiModel || settings.gemini?.model || "";
      case "openrouter":
        return openrouterModel || settings.openrouter?.model || "";
      case "openai":
        return openaiModel || settings.openai?.model || "";
      case "azure": {
        const azureBuilt = buildAzureSettings();
        return azureBuilt.deployment || settings.azure?.deployment || "";
      }
      case "azure-anthropic": {
        const azureAnthropicBuilt = buildAzureAnthropicSettings();
        return (
          azureAnthropicBuilt.deployment ||
          settings.azureAnthropic?.deployment ||
          ""
        );
      }
      case "groq":
        return groqModel || settings.groq?.model || "";
      case "xai":
      case "xai-oauth":
        return xaiModel || settings.xai?.model || "";
      case "deepseek":
        return deepseekModel || settings.deepseek?.model || "";
      case "kimi":
        return kimiModel || settings.kimi?.model || "";
      case "pi":
        return piModel || settings.pi?.model || "";
      case "openai-compatible":
        return openaiCompatModel || settings.openaiCompatible?.model || "";
      case "moa":
        return (
          settings.moa?.defaultPreset ||
          Object.values(settings.moa?.presets || {}).find(
            (preset) => preset.enabled !== false,
          )?.id ||
          ""
        );
      default:
        return settings.modelKey || "";
    }
  };

  const getProviderApiAddress = (providerType: LLMProviderType): string => {
    const resolvedType = resolveCustomProviderId(providerType);
    const customEntry = CUSTOM_PROVIDER_MAP.get(resolvedType);
    if (customEntry) {
      return (
        customProviders[resolvedType]?.baseUrl || customEntry.baseUrl || ""
      );
    }

    switch (providerType) {
      case "gemini":
        return "https://generativelanguage.googleapis.com";
      case "openai":
        return "https://api.openai.com/v1";
      case "anthropic":
        return "https://api.anthropic.com";
      case "openrouter":
        return openrouterBaseUrl || "https://openrouter.ai/api/v1";
      case "deepseek":
        return deepseekBaseUrl || "https://api.deepseek.com";
      case "kimi":
        return kimiBaseUrl || "https://api.moonshot.cn/v1";
      case "groq":
        return groqBaseUrl || "https://api.groq.com/openai/v1";
      case "xai":
      case "xai-oauth":
        return xaiBaseUrl || "https://api.x.ai/v1";
      case "azure":
        return azureEndpoint;
      case "azure-anthropic":
        return azureAnthropicEndpoint;
      case "ollama":
        return ollamaBaseUrl;
      case "openai-compatible":
        return openaiCompatBaseUrl;
      default:
        return "";
    }
  };

  const setProviderApiAddress = (
    providerType: LLMProviderType,
    value: string,
  ) => {
    const resolvedType = resolveCustomProviderId(providerType);
    const customEntry = CUSTOM_PROVIDER_MAP.get(resolvedType);
    if (customEntry) {
      updateCustomProvider(providerType, { baseUrl: value });
      return;
    }

    switch (providerType) {
      case "openrouter":
        setOpenrouterBaseUrl(value);
        return;
      case "deepseek":
        setDeepseekBaseUrl(value);
        return;
      case "kimi":
        setKimiBaseUrl(value);
        return;
      case "groq":
        setGroqBaseUrl(value);
        return;
      case "xai":
      case "xai-oauth":
        setXaiBaseUrl(value);
        return;
      case "azure":
        setAzureEndpoint(value);
        return;
      case "azure-anthropic":
        setAzureAnthropicEndpoint(value);
        return;
      case "ollama":
        setOllamaBaseUrl(value);
        return;
      case "openai-compatible":
        setOpenaiCompatBaseUrl(value);
        return;
      default:
        return;
    }
  };

  const getProviderApiKey = (providerType: LLMProviderType): string => {
    const resolvedType = resolveCustomProviderId(providerType);
    const customEntry = CUSTOM_PROVIDER_MAP.get(resolvedType);
    if (customEntry) {
      return customProviders[resolvedType]?.apiKey || "";
    }

    switch (providerType) {
      case "anthropic":
        return anthropicApiKey || anthropicSubscriptionToken;
      case "gemini":
        return geminiApiKey;
      case "openrouter":
        return openrouterApiKey;
      case "openai":
        return openaiApiKey;
      case "azure":
        return azureApiKey;
      case "azure-anthropic":
        return azureAnthropicApiKey;
      case "groq":
        return groqApiKey;
      case "xai":
      case "xai-oauth":
        return xaiApiKey;
      case "deepseek":
        return deepseekApiKey;
      case "kimi":
        return kimiApiKey;
      case "pi":
        return piApiKey;
      case "openai-compatible":
        return openaiCompatApiKey;
      case "ollama":
        return ollamaApiKey;
      default:
        return "";
    }
  };

  const setProviderApiKey = (providerType: LLMProviderType, value: string) => {
    const resolvedType = resolveCustomProviderId(providerType);
    const customEntry = CUSTOM_PROVIDER_MAP.get(resolvedType);
    if (customEntry) {
      updateCustomProvider(providerType, { apiKey: value });
      return;
    }

    switch (providerType) {
      case "anthropic":
        setAnthropicAuthMethod("api_key");
        setAnthropicApiKey(value);
        return;
      case "gemini":
        setGeminiApiKey(value);
        return;
      case "openrouter":
        setOpenrouterApiKey(value);
        return;
      case "openai":
        setOpenaiAuthMethod("api_key");
        setOpenaiApiKey(value);
        return;
      case "azure":
        setAzureApiKey(value);
        return;
      case "azure-anthropic":
        setAzureAnthropicApiKey(value);
        return;
      case "groq":
        setGroqApiKey(value);
        return;
      case "xai":
      case "xai-oauth":
        setXaiApiKey(value);
        return;
      case "deepseek":
        setDeepseekApiKey(value);
        return;
      case "kimi":
        setKimiApiKey(value);
        return;
      case "pi":
        setPiApiKey(value);
        return;
      case "openai-compatible":
        setOpenaiCompatApiKey(value);
        return;
      case "ollama":
        setOllamaApiKey(value);
        return;
      default:
        return;
    }
  };

  const setProviderPrimaryModel = (
    providerType: LLMProviderType,
    value: string,
  ) => {
    const resolvedType = resolveCustomProviderId(providerType);
    const customEntry = CUSTOM_PROVIDER_MAP.get(resolvedType);
    if (customEntry) {
      updateCustomProvider(providerType, { model: value });
      return;
    }

    switch (providerType) {
      case "anthropic":
        setSettings((prev) => ({ ...prev, modelKey: value }));
        return;
      case "bedrock":
        setBedrockModel(value);
        return;
      case "ollama":
        setOllamaModel(value);
        return;
      case "gemini":
        setGeminiModel(value);
        return;
      case "openrouter":
        setOpenrouterModel(value);
        return;
      case "openai":
        setOpenaiModel(value);
        return;
      case "azure":
        setAzureDeployment(value);
        setAzureDeploymentsText((prev) => prev || value);
        return;
      case "azure-anthropic":
        setAzureAnthropicDeployment(value);
        setAzureAnthropicDeploymentsText((prev) => prev || value);
        return;
      case "groq":
        setGroqModel(value);
        return;
      case "xai":
      case "xai-oauth":
        setXaiModel(value);
        return;
      case "deepseek":
        setDeepseekModel(value);
        return;
      case "kimi":
        setKimiModel(value);
        return;
      case "pi":
        setPiModel(value);
        return;
      case "openai-compatible":
        setOpenaiCompatModel(value);
        return;
      default:
        return;
    }
  };

  const writeProviderPrimaryModelSetting = (
    sourceSettings: LLMSettingsData,
    providerType: LLMProviderType,
    modelName: string,
  ): LLMSettingsData => {
    const resolvedType = resolveCustomProviderId(providerType);
    const customEntry = CUSTOM_PROVIDER_MAP.get(resolvedType);
    const nextSettings: LLMSettingsData = {
      ...sourceSettings,
      providerType: customEntry
        ? (resolvedType as LLMProviderType)
        : providerType,
    };

    if (customEntry) {
      nextSettings.customProviders = {
        ...(sourceSettings.customProviders || {}),
        [resolvedType]: {
          ...(sourceSettings.customProviders?.[resolvedType] || {}),
          model: modelName,
        },
      };
      return nextSettings;
    }

    switch (resolvedType) {
      case "anthropic":
        nextSettings.modelKey = modelName;
        break;
      case "bedrock":
        nextSettings.bedrock = { ...sourceSettings.bedrock, model: modelName };
        break;
      case "ollama":
        nextSettings.ollama = { ...sourceSettings.ollama, model: modelName };
        break;
      case "gemini":
        nextSettings.gemini = { ...sourceSettings.gemini, model: modelName };
        break;
      case "openrouter":
        nextSettings.openrouter = {
          ...sourceSettings.openrouter,
          model: modelName,
        };
        break;
      case "openai":
        nextSettings.openai = { ...sourceSettings.openai, model: modelName };
        break;
      case "azure":
        nextSettings.azure = {
          ...sourceSettings.azure,
          deployment: modelName,
          deployments: Array.from(
            new Set([modelName, ...(sourceSettings.azure?.deployments || [])]),
          ),
        };
        break;
      case "azure-anthropic":
        nextSettings.azureAnthropic = {
          ...sourceSettings.azureAnthropic,
          deployment: modelName,
          deployments: Array.from(
            new Set([
              modelName,
              ...(sourceSettings.azureAnthropic?.deployments || []),
            ]),
          ),
        };
        break;
      case "groq":
        nextSettings.groq = { ...sourceSettings.groq, model: modelName };
        break;
      case "xai":
      case "xai-oauth":
        nextSettings.xai = { ...sourceSettings.xai, model: modelName };
        break;
      case "deepseek":
        nextSettings.deepseek = {
          ...sourceSettings.deepseek,
          model: modelName,
        };
        break;
      case "kimi":
        nextSettings.kimi = { ...sourceSettings.kimi, model: modelName };
        break;
      case "pi":
        nextSettings.pi = { ...sourceSettings.pi, model: modelName };
        break;
      case "openai-compatible":
        nextSettings.openaiCompatible = {
          ...sourceSettings.openaiCompatible,
          model: modelName,
        };
        break;
      case "moa":
        nextSettings.modelKey = modelName;
        nextSettings.moa = {
          ...sourceSettings.moa,
          defaultPreset: modelName,
        };
        break;
      default:
        break;
    }

    return nextSettings;
  };

  const normalizeProviderModelNames = (
    values: Array<string | undefined | null>,
  ): string[] => {
    const seen = new Set<string>();
    const normalized: string[] = [];
    for (const value of values) {
      const model = value?.trim();
      if (!model || seen.has(model)) continue;
      seen.add(model);
      normalized.push(model);
    }
    return normalized;
  };

  const normalizeProviderModelEnabledMap = (
    value?: Record<string, boolean>,
  ): Record<string, boolean> | undefined => {
    const normalized: Record<string, boolean> = {};
    for (const [model, enabled] of Object.entries(value || {})) {
      const modelKey = model.trim();
      if (!modelKey || typeof enabled !== "boolean") continue;
      normalized[modelKey] = enabled;
    }
    return Object.keys(normalized).length > 0 ? normalized : undefined;
  };

  const writeProviderModelRegistryEntry = (
    sourceSettings: LLMSettingsData,
    providerType: LLMProviderType,
    entry?: ProviderModelRegistryEntry,
  ): LLMSettingsData => {
    const registryKey = resolveCustomProviderId(providerType);
    const nextRegistry: ProviderModelRegistry = {
      ...(sourceSettings.providerModelRegistry || {}),
    };
    const models = normalizeProviderModelNames(entry?.models || []);
    const enabled = normalizeProviderModelEnabledMap(entry?.enabled);

    if (models.length > 0 || enabled) {
      nextRegistry[registryKey] = {
        ...(models.length > 0 ? { models } : {}),
        ...(enabled ? { enabled } : {}),
        updatedAt: Date.now(),
      };
    } else {
      delete nextRegistry[registryKey];
    }

    return {
      ...sourceSettings,
      providerModelRegistry:
        Object.keys(nextRegistry).length > 0 ? nextRegistry : undefined,
    };
  };

  const getProviderSavedPrimaryModel = (
    providerType: LLMProviderType,
    sourceSettings: LLMSettingsData = settings,
  ): string => {
    const resolvedType = resolveCustomProviderId(providerType);
    const customEntry = CUSTOM_PROVIDER_MAP.get(resolvedType);
    if (customEntry) {
      return sourceSettings.customProviders?.[resolvedType]?.model || "";
    }

    switch (resolvedType) {
      case "anthropic": {
        const modelKey = sourceSettings.modelKey || "";
        return resolveCustomProviderId(
          sourceSettings.providerType as LLMProviderType,
        ) === "anthropic" && isLikelyClaudeModelKey(modelKey)
          ? modelKey
          : "";
      }
      case "bedrock":
        return sourceSettings.bedrock?.model || "";
      case "ollama":
        return sourceSettings.ollama?.model || "";
      case "gemini":
        return sourceSettings.gemini?.model || "";
      case "openrouter":
        return sourceSettings.openrouter?.model || "";
      case "openai":
        return sourceSettings.openai?.model || "";
      case "azure":
        return sourceSettings.azure?.deployment || "";
      case "azure-anthropic":
        return sourceSettings.azureAnthropic?.deployment || "";
      case "groq":
        return sourceSettings.groq?.model || "";
      case "xai":
      case "xai-oauth":
        return sourceSettings.xai?.model || "";
      case "deepseek":
        return sourceSettings.deepseek?.model || "";
      case "kimi":
        return sourceSettings.kimi?.model || "";
      case "pi":
        return sourceSettings.pi?.model || "";
      case "openai-compatible":
        return sourceSettings.openaiCompatible?.model || "";
      case "moa":
        return (
          sourceSettings.moa?.defaultPreset ||
          Object.values(sourceSettings.moa?.presets || {}).find(
            (preset) => preset.enabled !== false,
          )?.id ||
          ""
        );
      default:
        return "";
    }
  };

  const getProviderSavedConfiguredModels = (
    providerType: LLMProviderType,
    sourceSettings: LLMSettingsData = settings,
  ): string[] => {
    const registryKey = resolveCustomProviderId(providerType);
    const registryModels =
      sourceSettings.providerModelRegistry?.[registryKey]?.models || [];
    const deploymentModels =
      registryKey === "azure"
        ? [
            sourceSettings.azure?.deployment,
            ...(sourceSettings.azure?.deployments || []),
          ]
        : registryKey === "azure-anthropic"
          ? [
              sourceSettings.azureAnthropic?.deployment,
              ...(sourceSettings.azureAnthropic?.deployments || []),
            ]
          : [];

    return normalizeProviderModelNames([
      getProviderSavedPrimaryModel(providerType, sourceSettings),
      ...registryModels,
      ...deploymentModels,
    ]);
  };

  const hasProviderSavedCredential = (
    providerType: LLMProviderType,
    sourceSettings: LLMSettingsData = settings,
  ): boolean => {
    const resolvedType = resolveCustomProviderId(providerType);
    const customEntry = CUSTOM_PROVIDER_MAP.get(resolvedType);
    const hasText = (value?: string | null) => !!value?.trim();
    if (customEntry) {
      const config = sourceSettings.customProviders?.[resolvedType];
      return !!(
        hasText(config?.apiKey) ||
        (hasText(config?.baseUrl) && hasText(config?.model))
      );
    }

    switch (resolvedType) {
      case "anthropic":
        return !!buildClaudeCredentialInput(sourceSettings.anthropic);
      case "openrouter":
        return hasText(sourceSettings.openrouter?.apiKey);
      case "openai":
        return !!(
          hasText(sourceSettings.openai?.apiKey) ||
          hasText(sourceSettings.openai?.accessToken) ||
          hasText(sourceSettings.openai?.refreshToken)
        );
      case "gemini":
        return hasText(sourceSettings.gemini?.apiKey);
      case "deepseek":
        return hasText(sourceSettings.deepseek?.apiKey);
      case "kimi":
        return hasText(sourceSettings.kimi?.apiKey);
      case "groq":
        return hasText(sourceSettings.groq?.apiKey);
      case "xai":
      case "xai-oauth":
        return !!(
          hasText(sourceSettings.xai?.apiKey) ||
          (hasText(sourceSettings.xai?.accessToken) &&
            hasText(sourceSettings.xai?.refreshToken))
        );
      case "azure":
        return !!(
          hasText(sourceSettings.azure?.apiKey) &&
          hasText(sourceSettings.azure?.endpoint)
        );
      case "azure-anthropic":
        return !!(
          hasText(sourceSettings.azureAnthropic?.apiKey) &&
          hasText(sourceSettings.azureAnthropic?.endpoint)
        );
      case "bedrock":
        return !!(
          (hasText(sourceSettings.bedrock?.accessKeyId) &&
            hasText(sourceSettings.bedrock?.secretAccessKey)) ||
          hasText(sourceSettings.bedrock?.profile)
        );
      case "ollama":
        return !!(
          hasText(sourceSettings.ollama?.baseUrl) &&
          hasText(sourceSettings.ollama?.model)
        );
      case "pi":
        return !!(
          hasText(sourceSettings.pi?.apiKey) &&
          hasText(sourceSettings.pi?.provider)
        );
      case "openai-compatible":
        return !!(
          hasText(sourceSettings.openaiCompatible?.baseUrl) &&
          hasText(sourceSettings.openaiCompatible?.model)
        );
      case "moa":
        return Object.values(sourceSettings.moa?.presets || {}).some(
          (preset) => preset.enabled !== false,
        );
      default:
        return false;
    }
  };

  const shouldShowProviderInModelConsole = (
    providerType: LLMProviderType,
    sourceSettings: LLMSettingsData = settings,
  ): boolean =>
    hasProviderSavedCredential(providerType, sourceSettings) &&
    getProviderSavedConfiguredModels(providerType, sourceSettings).length > 0;

  const isProviderModelEnabled = (
    providerType: LLMProviderType,
    modelName: string,
    sourceSettings: LLMSettingsData = settings,
  ): boolean => {
    const registryKey = resolveCustomProviderId(providerType);
    const enabledMap =
      sourceSettings.providerModelRegistry?.[registryKey]?.enabled;
    return enabledMap?.[modelName] !== false;
  };

  const isProviderEnabled = (providerType: LLMProviderType): boolean => {
    const configuredModels = getProviderSavedConfiguredModels(providerType);
    if (configuredModels.length === 0) return false;
    return configuredModels.some((modelName) =>
      isProviderModelEnabled(providerType, modelName),
    );
  };

  const removeModelFromProviderRegistry = (
    sourceSettings: LLMSettingsData,
    providerType: LLMProviderType,
    modelName: string,
  ): LLMSettingsData => {
    const registryKey = resolveCustomProviderId(providerType);
    const existing = sourceSettings.providerModelRegistry?.[registryKey] || {};
    const enabled = { ...(existing.enabled || {}) };
    delete enabled[modelName];
    return writeProviderModelRegistryEntry(sourceSettings, providerType, {
      models: (existing.models || []).filter((model) => model !== modelName),
      enabled,
    });
  };

  const setProviderModelEnabledInRegistry = (
    sourceSettings: LLMSettingsData,
    providerType: LLMProviderType,
    modelNames: string[],
    enabled: boolean,
  ): LLMSettingsData => {
    const registryKey = resolveCustomProviderId(providerType);
    const existing = sourceSettings.providerModelRegistry?.[registryKey] || {};
    const models = normalizeProviderModelNames([
      ...(existing.models || []),
      ...modelNames,
    ]);
    const enabledMap = { ...(existing.enabled || {}) };
    for (const modelName of modelNames) {
      const model = modelName.trim();
      if (!model) continue;
      enabledMap[model] = enabled;
    }
    return writeProviderModelRegistryEntry(sourceSettings, providerType, {
      models,
      enabled: enabledMap,
    });
  };

  const replaceProviderModelsInRegistry = (
    sourceSettings: LLMSettingsData,
    providerType: LLMProviderType,
    modelNames: string[],
  ): LLMSettingsData => {
    const registryKey = resolveCustomProviderId(providerType);
    const existing = sourceSettings.providerModelRegistry?.[registryKey] || {};
    const models = normalizeProviderModelNames(modelNames);
    const enabled = Object.fromEntries(
      models.map((model) => [model, existing.enabled?.[model] !== false]),
    );
    return writeProviderModelRegistryEntry(sourceSettings, providerType, {
      models,
      enabled,
    });
  };

  const getRoutingModelOptions = (
    providerType: LLMProviderType,
  ): ModelOption[] => {
    const routing = getProviderRoutingConfig(providerType);
    const deduped = new Map<string, ModelOption>();
    const addOption = (value?: string, label?: string) => {
      const normalized = value?.trim();
      if (!normalized || deduped.has(normalized)) return;
      deduped.set(normalized, {
        key: normalized,
        displayName: label || normalized,
      });
    };

    providerRoutingModels.forEach((model) =>
      addOption(model.key, model.displayName),
    );
    models.forEach((model) => addOption(model.key, model.displayName));
    addOption(getProviderPrimaryModel(providerType));
    addOption(routing.strongModelKey);
    addOption(routing.cheapModelKey);
    addOption(routing.automatedTaskModelKey);

    return Array.from(deduped.values());
  };

  const loadProviderModelsForType = useCallback(
    async (
      providerType: LLMProviderType,
      claudeCredentials?: ReturnType<typeof buildClaudeCredentialInput>,
    ): Promise<ModelOption[]> => {
      try {
        const providerModels =
          providerType === "anthropic"
            ? (
                await window.electronAPI.getAnthropicModels(
                  claudeCredentials ||
                    buildClaudeCredentialInput({
                      apiKey: anthropicApiKey,
                      subscriptionToken: anthropicSubscriptionToken,
                      authMethod: anthropicAuthMethod,
                    }),
                )
              ).map((model) => ({
                key: model.id,
                displayName: model.displayName,
                description: model.description,
              }))
            : await window.electronAPI.getProviderModels(providerType);
        const normalized = providerModels || [];
        setProviderModelOptionsByType((prev) => ({
          ...prev,
          [providerType]: normalized,
        }));
        return normalized;
      } catch (error) {
        console.error("Failed to load provider models:", error);
        setProviderModelOptionsByType((prev) => ({
          ...prev,
          [providerType]: [],
        }));
        return [];
      }
    },
    [anthropicApiKey, anthropicAuthMethod, anthropicSubscriptionToken],
  );

  const loadProviderRoutingModels = async (
    providerType: LLMProviderType,
    claudeCredentials?: ReturnType<typeof buildClaudeCredentialInput>,
  ) => {
    const providerModels = await loadProviderModelsForType(
      providerType,
      claudeCredentials,
    );
    setProviderRoutingModels(providerModels);
  };

  const getMoaProviderOptions = (): ProviderInfo[] => {
    return providers
      .filter((provider) => provider.type !== "moa")
      .sort((a, b) => Number(b.configured) - Number(a.configured));
  };

  const getDefaultMoaProviderType = (): LLMProviderType => {
    return (
      getMoaProviderOptions().find((provider) => provider.configured)?.type ||
      getMoaProviderOptions()[0]?.type ||
      "anthropic"
    );
  };

  const getMoaModelOptions = (
    providerType: LLMProviderType,
    currentModelKey?: string,
  ): ModelOption[] => {
    const deduped = new Map<string, ModelOption>();
    const addOption = (value?: string, label?: string) => {
      const normalized = value?.trim();
      if (!normalized || deduped.has(normalized)) return;
      deduped.set(normalized, {
        key: normalized,
        displayName: label || normalized,
      });
    };
    for (const model of providerModelOptionsByType[providerType] || []) {
      addOption(model.key, model.displayName);
    }
    addOption(getProviderPrimaryModel(providerType));
    addOption(currentModelKey);
    return Array.from(deduped.values());
  };

  const createDefaultMoaSlot = (
    providerType: LLMProviderType = getDefaultMoaProviderType(),
  ): MoaModelSlot => {
    return {
      providerType,
      modelKey:
        providerModelOptionsByType[providerType]?.[0]?.key ||
        getProviderPrimaryModel(providerType) ||
        "",
    };
  };

  const updateMoaPreset = (
    presetId: string,
    updater: (preset: MoaPreset) => MoaPreset,
  ) => {
    setSettings((prev) => {
      const presets = { ...(prev.moa?.presets || {}) };
      const existing = presets[presetId];
      if (!existing) return prev;
      const updated = updater(existing);
      presets[presetId] = updated;
      const defaultPreset = prev.moa?.defaultPreset || presetId;
      return {
        ...prev,
        modelKey: prev.providerType === "moa" ? defaultPreset : prev.modelKey,
        moa: {
          ...prev.moa,
          defaultPreset,
          presets,
        },
      };
    });
  };

  const handleAddMoaPreset = () => {
    const providerOptions = getMoaProviderOptions();
    const aggregatorProvider =
      providerOptions.find((provider) => provider.configured)?.type ||
      providerOptions[0]?.type ||
      "anthropic";
    const referenceProvider =
      providerOptions.find((provider) => provider.type !== aggregatorProvider)
        ?.type || aggregatorProvider;
    const id = `mixture-${Date.now().toString(36)}`;
    const preset: MoaPreset = {
      id,
      name: "New mixture",
      enabled: true,
      referenceModels: [createDefaultMoaSlot(referenceProvider)],
      aggregator: createDefaultMoaSlot(aggregatorProvider),
      maxReferenceTokens: 1024,
      maxReferenceCharsPerModel: 12000,
      concurrency: 4,
    };
    void loadProviderModelsForType(aggregatorProvider);
    void loadProviderModelsForType(referenceProvider);
    setSettings((prev) => ({
      ...prev,
      providerType: "moa",
      modelKey: id,
      moa: {
        ...prev.moa,
        defaultPreset: id,
        presets: {
          ...(prev.moa?.presets || {}),
          [id]: preset,
        },
      },
    }));
  };

  const handleDeleteMoaPreset = (presetId: string) => {
    setSettings((prev) => {
      const presets = { ...(prev.moa?.presets || {}) };
      delete presets[presetId];
      const nextDefault =
        prev.moa?.defaultPreset === presetId
          ? Object.values(presets).find((preset) => preset.enabled !== false)
              ?.id
          : prev.moa?.defaultPreset;
      return {
        ...prev,
        modelKey:
          prev.providerType === "moa" && nextDefault
            ? nextDefault
            : prev.modelKey,
        moa: {
          ...prev.moa,
          defaultPreset: nextDefault,
          presets,
        },
      };
    });
  };

  const updateMoaSlotProvider = (
    presetId: string,
    slotKind: "aggregator" | "reference",
    providerType: LLMProviderType,
    referenceIndex?: number,
  ) => {
    void loadProviderModelsForType(providerType);
    const nextSlot = createDefaultMoaSlot(providerType);
    updateMoaPreset(presetId, (preset) => {
      if (slotKind === "aggregator") {
        return { ...preset, aggregator: nextSlot };
      }
      const references = [...preset.referenceModels];
      if (typeof referenceIndex === "number") {
        references[referenceIndex] = nextSlot;
      }
      return { ...preset, referenceModels: references };
    });
  };

  const updateMoaReference = (
    presetId: string,
    index: number,
    patch: Partial<MoaModelSlot>,
  ) => {
    updateMoaPreset(presetId, (preset) => {
      const references = [...preset.referenceModels];
      references[index] = { ...references[index], ...patch };
      return { ...preset, referenceModels: references };
    });
  };

  const sanitizeMoaSlot = (slot?: MoaModelSlot): MoaModelSlot | null => {
    const providerType = slot?.providerType;
    const modelKey = slot?.modelKey?.trim();
    if (!providerType || providerType === "moa" || !modelKey) return null;
    return {
      providerType,
      modelKey,
      ...(typeof slot.maxTokens === "number" && Number.isFinite(slot.maxTokens)
        ? { maxTokens: Math.max(1, Math.floor(slot.maxTokens)) }
        : {}),
      ...(typeof slot.temperature === "number" &&
      Number.isFinite(slot.temperature)
        ? { temperature: Math.max(0, Math.min(2, slot.temperature)) }
        : {}),
      ...(slot.roleInstruction?.trim()
        ? { roleInstruction: slot.roleInstruction.trim() }
        : {}),
    };
  };

  const sanitizeMoaPresets = (
    presets?: Record<string, MoaPreset>,
  ): Record<string, MoaPreset> => {
    const sanitized: Record<string, MoaPreset> = {};
    for (const [presetId, preset] of Object.entries(presets || {})) {
      const id = preset.id?.trim() || presetId.trim();
      const aggregator = sanitizeMoaSlot(preset.aggregator);
      const referenceModels = (preset.referenceModels || [])
        .map((slot) => sanitizeMoaSlot(slot))
        .filter(Boolean) as MoaModelSlot[];
      if (!id || !aggregator || referenceModels.length === 0) continue;
      sanitized[id] = {
        id,
        name: preset.name?.trim() || id,
        ...(preset.description?.trim()
          ? { description: preset.description.trim() }
          : {}),
        enabled: preset.enabled !== false,
        referenceModels: referenceModels.slice(0, 8),
        aggregator,
        ...(typeof preset.maxReferenceTokens === "number" &&
        Number.isFinite(preset.maxReferenceTokens)
          ? {
              maxReferenceTokens: Math.max(
                64,
                Math.min(8192, Math.floor(preset.maxReferenceTokens)),
              ),
            }
          : {}),
        ...(typeof preset.maxReferenceCharsPerModel === "number" &&
        Number.isFinite(preset.maxReferenceCharsPerModel)
          ? {
              maxReferenceCharsPerModel: Math.max(
                500,
                Math.min(50000, Math.floor(preset.maxReferenceCharsPerModel)),
              ),
            }
          : {}),
        ...(typeof preset.concurrency === "number" &&
        Number.isFinite(preset.concurrency)
          ? {
              concurrency: Math.max(
                1,
                Math.min(8, Math.floor(preset.concurrency)),
              ),
            }
          : {}),
      };
    }
    return sanitized;
  };

  const loadClaudeModels = async (
    currentModelKeyOverride?: string,
    claudeCredentials?: ReturnType<typeof buildClaudeCredentialInput>,
  ): Promise<ModelOption[]> => {
    try {
      setLoadingClaudeModels(true);
      const models = await window.electronAPI.getAnthropicModels(
        claudeCredentials ||
          buildClaudeCredentialInput({
            apiKey: anthropicApiKey,
            subscriptionToken: anthropicSubscriptionToken,
            authMethod: anthropicAuthMethod,
          }),
      );
      const providerModels = (models || []).map((model) => ({
        key: model.id,
        displayName: model.displayName,
        description: model.description,
      }));
      setProviderModelOptionsByType((prev) => ({
        ...prev,
        anthropic: providerModels,
      }));
      setModels(providerModels);
      const nextModelKey = selectClaudeModelKey(
        providerModels,
        currentModelKeyOverride,
      );
      setSettings((prev) => {
        if (prev.providerType !== "anthropic") return prev;
        if (prev.modelKey === nextModelKey) {
          return prev;
        }
        return {
          ...prev,
          modelKey: nextModelKey,
        };
      });
      onSettingsChanged?.();
      return providerModels;
    } catch (error) {
      console.error("Failed to load Claude models:", error);
      setModels([]);
      return [];
    } finally {
      setLoadingClaudeModels(false);
    }
  };

  const getFailoverModelOptions = (
    providerType: LLMProviderType,
    currentModelKey?: string,
  ): SearchableSelectOption[] => {
    const deduped = new Map<string, SearchableSelectOption>();
    const addOption = (value?: string, label?: string) => {
      const normalized = value?.trim();
      if (!normalized || deduped.has(normalized)) return;
      deduped.set(normalized, {
        value: normalized,
        label: label || normalized,
      });
    };

    for (const model of providerModelOptionsByType[providerType] || []) {
      addOption(model.key, model.displayName);
    }
    addOption(getProviderPrimaryModel(providerType));
    addOption(currentModelKey);

    return Array.from(deduped.values());
  };

  const configuredFallbackProviderOptions = providers.filter(
    (provider) => provider.configured,
  );

  useEffect(() => {
    if (!azureDeployment) {
      const deployments = parseAzureDeployments(azureDeploymentsText);
      if (deployments[0]) {
        setAzureDeployment(deployments[0]);
      }
    }
  }, [azureDeploymentsText, azureDeployment]);

  useEffect(() => {
    if (!azureAnthropicDeployment) {
      const deployments = parseAzureDeployments(azureAnthropicDeploymentsText);
      if (deployments[0]) {
        setAzureAnthropicDeployment(deployments[0]);
      }
    }
  }, [azureAnthropicDeploymentsText, azureAnthropicDeployment]);

  const loadConfigStatus = async () => {
    try {
      setLoading(true);
      // Load config status which includes settings, providers, and models
      const configStatus = await window.electronAPI.getLLMConfigStatus();

      // Set providers
      setProviders(configStatus.providers || []);
      setModels(configStatus.models || []);
      setProviderModelOptionsByType((prev) => ({
        ...prev,
        [configStatus.currentProvider]: configStatus.models || [],
      }));

      // Load full settings separately for bedrock config
      const loadedSettings = await window.electronAPI.getLLMSettings();
      setSettings(loadedSettings);
      if (window.electronAPI?.getLLMRoutingStatus) {
        try {
          setRoutingRuntime(await window.electronAPI.getLLMRoutingStatus());
        } catch (error) {
          console.error("Failed to load LLM routing status:", error);
          setRoutingRuntime(null);
        }
      }
      if (loadedSettings.customProviders) {
        const normalized = { ...loadedSettings.customProviders };
        if (normalized["kimi-coding"] && !normalized["kimi-code"]) {
          normalized["kimi-code"] = normalized["kimi-coding"];
        }
        if (normalized["kimi-coding"]) {
          delete normalized["kimi-coding"];
        }
        setCustomProviders(normalized);
      } else {
        setCustomProviders({});
      }
      const loadedClaudeAuthMethod = resolveClaudeAuthMethod(
        loadedSettings.anthropic,
      );
      const loadedClaudeCredentials = buildClaudeCredentialInput({
        ...loadedSettings.anthropic,
        authMethod: loadedClaudeAuthMethod,
      });

      setAnthropicApiKey(loadedSettings.anthropic?.apiKey ?? "");
      setAnthropicSubscriptionToken(
        loadedSettings.anthropic?.subscriptionToken ?? "",
      );
      setAnthropicAuthMethod(loadedClaudeAuthMethod);

      await loadProviderRoutingModels(
        loadedSettings.providerType as LLMProviderType,
        loadedClaudeCredentials,
      );
      if (loadedSettings.providerType === "anthropic") {
        const providerModels = await loadClaudeModels(
          loadedSettings.modelKey,
          loadedClaudeCredentials,
        );
        const nextModelKey = selectClaudeModelKey(
          providerModels,
          loadedSettings.modelKey,
        );
        if (nextModelKey && nextModelKey !== loadedSettings.modelKey) {
          setSettings((prev) => ({ ...prev, modelKey: nextModelKey }));
        }
      }

      // Set form state from loaded settings
      setAwsRegion(loadedSettings.bedrock?.region ?? "us-east-1");
      setAwsProfile(loadedSettings.bedrock?.profile ?? "");
      setUseDefaultCredentials(
        loadedSettings.bedrock?.useDefaultCredentials ?? true,
      );

      // Set Ollama form state
      setOllamaBaseUrl(
        loadedSettings.ollama?.baseUrl ?? "http://localhost:11434",
      );
      setOllamaModel(loadedSettings.ollama?.model ?? "");
      setOllamaApiKey(loadedSettings.ollama?.apiKey ?? "");

      // Set Gemini form state
      setGeminiApiKey(loadedSettings.gemini?.apiKey ?? "");
      setGeminiModel(loadedSettings.gemini?.model ?? "");

      // Set OpenRouter form state
      setOpenrouterApiKey(loadedSettings.openrouter?.apiKey ?? "");
      setOpenrouterBaseUrl(loadedSettings.openrouter?.baseUrl ?? "");
      setOpenrouterModel(loadedSettings.openrouter?.model ?? "");
      setOpenrouterParetoMinCodingScore(
        typeof loadedSettings.openrouter?.paretoMinCodingScore === "number"
          ? String(loadedSettings.openrouter.paretoMinCodingScore)
          : "",
      );

      // Set OpenAI form state
      setOpenaiApiKey(loadedSettings.openai?.apiKey ?? "");
      setOpenaiModel(loadedSettings.openai?.model ?? "");
      setOpenaiReasoningEffort(
        resolveOpenAIReasoningEffort(loadedSettings.openai),
      );
      setOpenaiTextVerbosity(resolveOpenAITextVerbosity(loadedSettings.openai));
      // Set OpenAI auth method and OAuth status
      if (loadedSettings.openai?.authMethod) {
        setOpenaiAuthMethod(loadedSettings.openai.authMethod);
        // If authMethod is 'oauth', check if tokens are available
        if (loadedSettings.openai.authMethod === "oauth") {
          if (!loadedSettings.openai.model) {
            setOpenaiModel("gpt-5.5");
          }
          if (
            loadedSettings.openai.accessToken ||
            loadedSettings.openai.refreshToken
          ) {
            // Tokens available - fully connected
            setOpenaiOAuthConnected(true);
          } else {
            // Auth method is OAuth but tokens missing (decryption failed or expired)
            // Keep authMethod as oauth so user knows they configured it, but not connected
            setOpenaiOAuthConnected(false);
            console.log(
              "[Settings] OpenAI OAuth configured but tokens unavailable - re-authentication required",
            );
          }
        }
      } else if (loadedSettings.openai?.accessToken) {
        // Legacy: accessToken present but no authMethod set
        setOpenaiOAuthConnected(true);
        setOpenaiAuthMethod("oauth");
      }

      // Set Azure OpenAI form state
      setAzureApiKey(loadedSettings.azure?.apiKey ?? "");
      setAzureEndpoint(loadedSettings.azure?.endpoint ?? "");
      {
        const loadedDeployments =
          loadedSettings.azure?.deployments &&
          loadedSettings.azure.deployments.length > 0
            ? loadedSettings.azure.deployments
            : loadedSettings.azure?.deployment
              ? [loadedSettings.azure.deployment]
              : [];
        setAzureDeploymentsText(loadedDeployments.join("\n"));
        const selectedDeployment =
          loadedSettings.azure?.deployment || loadedDeployments[0];
        setAzureDeployment(selectedDeployment || "");
      }
      setAzureApiVersion(
        loadedSettings.azure?.apiVersion ?? "2024-02-15-preview",
      );
      setAzureReasoningEffort(
        loadedSettings.azure?.reasoningEffort || "medium",
      );

      // Set Azure Anthropic form state
      setAzureAnthropicApiKey(loadedSettings.azureAnthropic?.apiKey ?? "");
      setAzureAnthropicEndpoint(loadedSettings.azureAnthropic?.endpoint ?? "");
      {
        const loadedDeployments =
          loadedSettings.azureAnthropic?.deployments &&
          loadedSettings.azureAnthropic.deployments.length > 0
            ? loadedSettings.azureAnthropic.deployments
            : loadedSettings.azureAnthropic?.deployment
              ? [loadedSettings.azureAnthropic.deployment]
              : [];
        setAzureAnthropicDeploymentsText(loadedDeployments.join("\n"));
        const selectedDeployment =
          loadedSettings.azureAnthropic?.deployment || loadedDeployments[0];
        setAzureAnthropicDeployment(selectedDeployment || "");
      }
      setAzureAnthropicApiVersion(
        loadedSettings.azureAnthropic?.apiVersion ?? "2023-06-01",
      );

      // Set Groq form state
      setGroqApiKey(loadedSettings.groq?.apiKey ?? "");
      setGroqBaseUrl(loadedSettings.groq?.baseUrl ?? "");
      setGroqModel(loadedSettings.groq?.model ?? "");

      // Set xAI form state
      setXaiApiKey(loadedSettings.xai?.apiKey ?? "");
      setXaiBaseUrl(loadedSettings.xai?.baseUrl ?? "");
      setXaiModel(loadedSettings.xai?.model ?? "");
      setXaiOAuthConnected(
        !!(loadedSettings.xai?.accessToken && loadedSettings.xai?.refreshToken),
      );

      // Set DeepSeek form state
      setDeepseekApiKey(loadedSettings.deepseek?.apiKey ?? "");
      setDeepseekBaseUrl(loadedSettings.deepseek?.baseUrl ?? "");
      setDeepseekModel(loadedSettings.deepseek?.model ?? "");

      // Set Kimi form state
      setKimiApiKey(loadedSettings.kimi?.apiKey ?? "");
      setKimiBaseUrl(loadedSettings.kimi?.baseUrl ?? "");
      setKimiModel(loadedSettings.kimi?.model ?? "kimi-k3");
      setKimiConnectionState(
        loadedSettings.kimi?.apiKey && loadedSettings.kimi?.baseUrl
          ? "success"
          : "idle",
      );

      // Set Pi form state
      setPiProvider(loadedSettings.pi?.provider ?? "anthropic");
      setPiApiKey(loadedSettings.pi?.apiKey ?? "");
      setPiModel(loadedSettings.pi?.model ?? "");

      // Set OpenAI-compatible form state
      setOpenaiCompatDisplayName(
        loadedSettings.openaiCompatible?.displayName ??
          loadedSettings.openaiCompatible?.model ??
          "",
      );
      setOpenaiCompatBaseUrl(loadedSettings.openaiCompatible?.baseUrl ?? "");
      setOpenaiCompatApiKey(loadedSettings.openaiCompatible?.apiKey ?? "");
      setOpenaiCompatModel(loadedSettings.openaiCompatible?.model ?? "");
      setOpenaiCompatSupportsImages(
        loadedSettings.openaiCompatible?.supportsImages,
      );
      if (loadedSettings.cachedOpenAICompatibleModels) {
        setOpenaiCompatModels(loadedSettings.cachedOpenAICompatibleModels);
      }

      // Image generation (text-to-image) settings
      if (loadedSettings.imageGeneration?.defaultProvider) {
        setImageGenDefaultProvider(
          loadedSettings.imageGeneration.defaultProvider,
        );
      } else {
        setImageGenDefaultProvider("");
      }
      if (loadedSettings.imageGeneration?.defaultModel) {
        setImageGenDefaultModel(loadedSettings.imageGeneration.defaultModel);
      } else {
        setImageGenDefaultModel("");
      }
      if (loadedSettings.imageGeneration?.backupProvider) {
        setImageGenBackupProvider(
          loadedSettings.imageGeneration.backupProvider,
        );
      } else {
        setImageGenBackupProvider("");
      }
      if (loadedSettings.imageGeneration?.backupModel) {
        setImageGenBackupModel(loadedSettings.imageGeneration.backupModel);
      } else {
        setImageGenBackupModel("");
      }
      const ig = loadedSettings.imageGeneration;
      setImageOpenAIApiKey(ig?.openai?.apiKey ?? "");
      setImageOpenAIModel(ig?.openai?.model ?? "gpt-image-2");
      setImageAzureApiKey(ig?.azure?.imageApiKey ?? "");
      setImageAzureEndpoint(ig?.azure?.imageEndpoint ?? "");
      setImageAzureDeployment(ig?.azure?.imageDeployment ?? "");
      setImageAzureApiVersion(
        ig?.azure?.imageApiVersion ?? "2024-02-15-preview",
      );
      setImageGeminiApiKey(ig?.gemini?.apiKey ?? "");
      setImageGeminiModel(ig?.gemini?.model ?? "nano-banana-2");
      setImageOpenRouterApiKey(ig?.openrouter?.apiKey ?? "");
      setImageOpenRouterBaseUrl(
        ig?.openrouter?.baseUrl ?? "https://openrouter.ai/api/v1",
      );
      setImageOpenRouterModel(ig?.openrouter?.model ?? "openai/gpt-image-2");
      setImageOpenAICodexModel("gpt-image-2");
      setImageOpenAITimeoutSeconds(String(ig?.timeouts?.openai ?? 300));
      setImageOpenAICodexTimeoutSeconds(
        String(ig?.timeouts?.openaiCodex ?? 300),
      );
      setImageAzureTimeoutSeconds(String(ig?.timeouts?.azure ?? 300));
      setImageOpenRouterTimeoutSeconds(String(ig?.timeouts?.openrouter ?? 300));
      setImageGeminiTimeoutSeconds(String(ig?.timeouts?.gemini ?? 300));

      // Video generation settings
      const vg = loadedSettings.videoGeneration;
      if (vg?.defaultProvider) setVideoDefaultProvider(vg.defaultProvider);
      if (vg?.fallbackProvider) setVideoFallbackProvider(vg.fallbackProvider);
      if (vg?.openai?.defaultModel) setVideoOpenAIModel(vg.openai.defaultModel);
      if (vg?.openai?.defaultDuration)
        setVideoOpenAIDuration(String(vg.openai.defaultDuration));
      if (vg?.openai?.defaultAspectRatio)
        setVideoOpenAIAspectRatio(vg.openai.defaultAspectRatio);
      if (vg?.openai?.defaultResolution)
        setVideoOpenAIResolution(vg.openai.defaultResolution);
      if (vg?.azure?.videoApiKey) setVideoAzureApiKey(vg.azure.videoApiKey);
      if (vg?.azure?.videoEndpoint)
        setVideoAzureEndpoint(vg.azure.videoEndpoint);
      if (vg?.azure?.videoDeployment)
        setVideoAzureDeployment(vg.azure.videoDeployment);
      if (vg?.azure?.videoApiVersion)
        setVideoAzureApiVersion(vg.azure.videoApiVersion);
      if (vg?.azure?.defaultDuration)
        setVideoAzureDuration(String(vg.azure.defaultDuration));
      if (vg?.azure?.defaultAspectRatio)
        setVideoAzureAspectRatio(vg.azure.defaultAspectRatio);
      if (vg?.gemini?.defaultModel) setVideoGeminiModel(vg.gemini.defaultModel);
      if (vg?.gemini?.defaultDuration)
        setVideoGeminiDuration(String(vg.gemini.defaultDuration));
      if (vg?.gemini?.defaultAspectRatio)
        setVideoGeminiAspectRatio(vg.gemini.defaultAspectRatio);
      if (vg?.vertex?.model) setVideoVertexModel(vg.vertex.model);
      if (vg?.vertex?.projectId) setVideoVertexProjectId(vg.vertex.projectId);
      if (vg?.vertex?.location) setVideoVertexLocation(vg.vertex.location);
      if (vg?.vertex?.outputGcsUri)
        setVideoVertexOutputGcsUri(vg.vertex.outputGcsUri);
      if (vg?.vertex?.accessToken)
        setVideoVertexAccessToken(vg.vertex.accessToken);
      if (vg?.vertex?.defaultDuration)
        setVideoVertexDuration(String(vg.vertex.defaultDuration));
      if (vg?.vertex?.defaultAspectRatio)
        setVideoVertexAspectRatio(vg.vertex.defaultAspectRatio);
      if (vg?.kling?.apiKey) setVideoKlingApiKey(vg.kling.apiKey);
      if (vg?.kling?.baseUrl) setVideoKlingBaseUrl(vg.kling.baseUrl);
      if (vg?.kling?.model) setVideoKlingModel(vg.kling.model);
      if (vg?.kling?.defaultDuration)
        setVideoKlingDuration(String(vg.kling.defaultDuration));
      if (vg?.kling?.defaultAspectRatio)
        setVideoKlingAspectRatio(vg.kling.defaultAspectRatio);

      // Set Bedrock form state (access key and secret key are set earlier)
      setAwsAccessKeyId(loadedSettings.bedrock?.accessKeyId ?? "");
      setAwsSecretAccessKey(loadedSettings.bedrock?.secretAccessKey ?? "");
      setBedrockModel(loadedSettings.bedrock?.model ?? "");

      // Populate dropdown arrays from cached models
      if (
        loadedSettings.cachedGeminiModels &&
        loadedSettings.cachedGeminiModels.length > 0
      ) {
        setGeminiModels(
          loadedSettings.cachedGeminiModels.map((m: Any) => ({
            name: m.key,
            displayName: m.displayName,
            description: m.description,
          })),
        );
      }
      if (
        loadedSettings.cachedOpenRouterModels &&
        loadedSettings.cachedOpenRouterModels.length > 0
      ) {
        setOpenrouterModels(
          loadedSettings.cachedOpenRouterModels.map((m: Any) => ({
            id: m.key,
            name: m.displayName,
            context_length: m.contextLength || 0,
          })),
        );
      }
      if (
        loadedSettings.cachedOpenAIModels &&
        loadedSettings.cachedOpenAIModels.length > 0
      ) {
        setOpenaiModels(
          loadedSettings.cachedOpenAIModels.map((m: Any) => ({
            id: m.key,
            name: m.displayName,
            description: m.description || "",
          })),
        );
      }
      if (
        loadedSettings.cachedOllamaModels &&
        loadedSettings.cachedOllamaModels.length > 0
      ) {
        setOllamaModels(
          loadedSettings.cachedOllamaModels.map((m: Any) => ({
            name: m.key,
            size: m.size || 0,
          })),
        );
      }
      if (
        loadedSettings.cachedBedrockModels &&
        loadedSettings.cachedBedrockModels.length > 0
      ) {
        setBedrockModels(
          loadedSettings.cachedBedrockModels.map((m: Any) => ({
            id: m.key,
            name: m.displayName,
            description: m.description || "",
          })),
        );
      }
      if (
        loadedSettings.cachedPiModels &&
        loadedSettings.cachedPiModels.length > 0
      ) {
        setPiModels(
          loadedSettings.cachedPiModels.map((m: Any) => ({
            id: m.key,
            name: m.displayName,
            description: m.description || "",
          })),
        );
      }
    } catch (error) {
      console.error("Failed to load settings:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadOllamaModels = async (baseUrl?: string) => {
    try {
      setLoadingOllamaModels(true);
      const models = await window.electronAPI.getOllamaModels(
        baseUrl || ollamaBaseUrl,
      );
      console.log(
        `[Settings] Loaded ${models?.length || 0} Ollama models`,
        models,
      );
      setOllamaModels(models || []);
      // If we got models and current model isn't in the list, select the first one
      if (
        models &&
        models.length > 0 &&
        !models.some((m) => m.name === ollamaModel)
      ) {
        setOllamaModel(models[0].name);
      }
      // Notify main page that models were refreshed (they're now cached)
      onSettingsChanged?.();
    } catch (error) {
      console.error("Failed to load Ollama models:", error);
      setOllamaModels([]);
    } finally {
      setLoadingOllamaModels(false);
    }
  };

  const loadGeminiModels = async (apiKey?: string) => {
    try {
      setLoadingGeminiModels(true);
      const models = await window.electronAPI.getGeminiModels(
        apiKey || geminiApiKey,
      );
      setGeminiModels(models || []);
      // If we got models and current model isn't in the list, select the first one
      if (
        models &&
        models.length > 0 &&
        !models.some((m) => m.name === geminiModel)
      ) {
        setGeminiModel(models[0].name);
      }
      // Notify main page that models were refreshed (they're now cached)
      onSettingsChanged?.();
    } catch (error) {
      console.error("Failed to load Gemini models:", error);
      setGeminiModels([]);
    } finally {
      setLoadingGeminiModels(false);
    }
  };

  const loadOpenRouterModels = async (apiKey?: string) => {
    try {
      setLoadingOpenRouterModels(true);
      const models = await window.electronAPI.getOpenRouterModels(
        apiKey || openrouterApiKey,
        openrouterBaseUrl || undefined,
      );
      setOpenrouterModels(models || []);
      // If we got models and current model isn't in the list, select the first one
      if (
        models &&
        models.length > 0 &&
        !models.some((m) => m.id === openrouterModel)
      ) {
        setOpenrouterModel(models[0].id);
      }
      // Notify main page that models were refreshed (they're now cached)
      onSettingsChanged?.();
    } catch (error) {
      console.error("Failed to load OpenRouter models:", error);
      setOpenrouterModels([]);
    } finally {
      setLoadingOpenRouterModels(false);
    }
  };

  const loadOpenAIModels = async (apiKey?: string) => {
    try {
      setLoadingOpenAIModels(true);
      const models = await window.electronAPI.getOpenAIModels(
        apiKey || openaiApiKey,
      );
      setOpenaiModels(models || []);
      // If we got models and no model is selected yet, select the first one
      // (Don't override custom model IDs that may not be in the list.)
      if (models && models.length > 0 && !openaiModel) {
        setOpenaiModel(models[0].id);
      }
      // Notify main page that models were refreshed (they're now cached)
      onSettingsChanged?.();
    } catch (error) {
      console.error("Failed to load OpenAI models:", error);
      setOpenaiModels([]);
    } finally {
      setLoadingOpenAIModels(false);
    }
  };

  const loadGroqModels = async (apiKey?: string) => {
    try {
      setLoadingGroqModels(true);
      const models = await window.electronAPI.getGroqModels(
        apiKey || groqApiKey,
        groqBaseUrl || undefined,
      );
      setGroqModels(models || []);
      if (
        models &&
        models.length > 0 &&
        !models.some((m) => m.id === groqModel)
      ) {
        setGroqModel(models[0].id);
      }
      onSettingsChanged?.();
    } catch (error) {
      console.error("Failed to load Groq models:", error);
      setGroqModels([]);
    } finally {
      setLoadingGroqModels(false);
    }
  };

  const loadXAIModels = async (apiKey?: string) => {
    try {
      setLoadingXaiModels(true);
      const models = await window.electronAPI.getXAIModels(
        apiKey || xaiApiKey,
        xaiBaseUrl || undefined,
      );
      setXaiModels(models || []);
      if (
        models &&
        models.length > 0 &&
        !models.some((m) => m.id === xaiModel)
      ) {
        setXaiModel(models[0].id);
      }
      onSettingsChanged?.();
    } catch (error) {
      console.error("Failed to load xAI models:", error);
      setXaiModels([]);
    } finally {
      setLoadingXaiModels(false);
    }
  };

  const loadDeepSeekModels = async (apiKey?: string) => {
    try {
      setLoadingDeepseekModels(true);
      const models = await window.electronAPI.getDeepSeekModels(
        apiKey || deepseekApiKey,
        deepseekBaseUrl || undefined,
      );
      const availableModels =
        models && models.length > 0 ? models : DEFAULT_DEEPSEEK_MODELS;
      setDeepseekModels(availableModels);
      if (
        availableModels.length > 0 &&
        !availableModels.some((m) => m.id === deepseekModel)
      ) {
        setDeepseekModel(availableModels[0].id);
      }
      onSettingsChanged?.();
    } catch (error) {
      console.error("Failed to load DeepSeek models:", error);
      setDeepseekModels(DEFAULT_DEEPSEEK_MODELS);
    } finally {
      setLoadingDeepseekModels(false);
    }
  };

  const loadKimiModels = async (apiKey?: string) => {
    const normalizedApiKey = normalizeKimiApiKey(apiKey || kimiApiKey);
    if (!normalizedApiKey) {
      setKimiConnectionState("error");
      setKimiConnectionError("missing_key");
      return;
    }

    try {
      setLoadingKimiModels(true);
      setKimiConnectionState("idle");
      setKimiConnectionError(undefined);
      setTestResult(null);

      const result = await window.electronAPI.testLLMProvider({
        providerType: "kimi",
        modelKey: kimiModel || "kimi-k3",
        kimi: {
          apiKey: normalizedApiKey,
          model: kimiModel || "kimi-k3",
          baseUrl: kimiBaseUrl || undefined,
        },
      });

      if (!result.success || !result.resolvedBaseUrl) {
        setKimiModels([]);
        setKimiConnectionState("error");
        setKimiConnectionError(result.errorCode || "unknown");
        return;
      }

      const models = result.models || [];
      const resolvedModel = result.resolvedModel || models[0]?.id || "kimi-k3";
      const storedSettings = await window.electronAPI.getLLMSettings();
      const nextSettings: LLMSettingsData = {
        ...storedSettings,
        providerType: "kimi",
        modelKey: resolvedModel,
        cachedKimiModels: models.map((model) => ({
          key: model.id,
          displayName: model.name,
          description: "Kimi model",
        })),
        kimi: {
          ...storedSettings.kimi,
          ...settingsRef.current.kimi,
          apiKey: normalizedApiKey,
          baseUrl: result.resolvedBaseUrl,
          model: resolvedModel,
        },
      };

      await window.electronAPI.saveLLMSettings(nextSettings);
      setKimiApiKey(normalizedApiKey);
      setKimiBaseUrl(result.resolvedBaseUrl);
      setKimiModel(resolvedModel);
      setKimiModels(models);
      setSettings(nextSettings);
      setKimiConnectionState("success");
      onSettingsChanged?.();
    } catch (error: Any) {
      console.error("Failed to load Kimi models:", error);
      setKimiModels([]);
      setKimiConnectionState("error");
      setKimiConnectionError(
        /network|fetch|timeout|reach/i.test(error?.message || "")
          ? "network"
          : "unknown",
      );
    } finally {
      setLoadingKimiModels(false);
    }
  };

  const loadPiModels = async (provider?: string) => {
    try {
      setLoadingPiModels(true);
      const resolvedProvider = provider || piProvider;
      const models = await window.electronAPI.getPiModels(resolvedProvider);
      setPiModels(models || []);
      if (
        models &&
        models.length > 0 &&
        !models.some((m) => m.id === piModel)
      ) {
        setPiModel(models[0].id);
      }
      onSettingsChanged?.();
    } catch (error) {
      console.error("Failed to load Pi models:", error);
      setPiModels([]);
    } finally {
      setLoadingPiModels(false);
    }
  };

  const loadPiProviders = async () => {
    try {
      const providers = await window.electronAPI.getPiProviders();
      setPiProviders(providers || []);
    } catch (error) {
      console.error("Failed to load Pi providers:", error);
    }
  };

  const loadOpenAICompatibleModels = async (
    baseUrl?: string,
    apiKey?: string,
  ) => {
    try {
      setLoadingOpenAICompatModels(true);
      const resolvedBaseUrl = baseUrl || openaiCompatBaseUrl;
      if (!resolvedBaseUrl) return;
      const models = await window.electronAPI.getOpenAICompatibleModels(
        resolvedBaseUrl,
        apiKey || openaiCompatApiKey || undefined,
      );
      setOpenaiCompatModels(models || []);
      if (
        models &&
        models.length > 0 &&
        !models.some((m) => m.key === openaiCompatModel)
      ) {
        setOpenaiCompatModel(models[0].key);
      }
      onSettingsChanged?.();
    } catch (error) {
      console.error("Failed to load OpenAI-compatible models:", error);
      setOpenaiCompatModels([]);
      setTestResult({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to refresh OpenAI-compatible models.",
        providerType: "openai-compatible",
      });
    } finally {
      setLoadingOpenAICompatModels(false);
    }
  };

  const loadCustomProviderModels = async (providerType: LLMProviderType) => {
    const resolvedType = resolveCustomProviderId(providerType);
    const customEntry = CUSTOM_PROVIDER_MAP.get(resolvedType);
    if (!customEntry) return;

    try {
      setLoadingCustomProviderModels(true);
      setTestResult(null);
      const currentConfig = customProvidersRef.current[resolvedType] || {};
      const models = await window.electronAPI.refreshCustomProviderModels(
        resolvedType,
        {
          apiKey: currentConfig.apiKey,
          baseUrl: currentConfig.baseUrl || customEntry.baseUrl,
        },
      );

      setCustomProviders((prev) => {
        const existing = prev[resolvedType] || {};
        const nextModel =
          existing.model && models.some((entry) => entry.key === existing.model)
            ? existing.model
            : models[0]?.key || existing.model;

        return {
          ...prev,
          [resolvedType]: {
            ...existing,
            ...(nextModel ? { model: nextModel } : {}),
            cachedModels: models,
          },
        };
      });
      setTestResult({
        success: true,
        error:
          models.length > 0
            ? undefined
            : `No models returned for ${customEntry.name}. Keeping the current/default model list.`,
        providerType,
      });
      onSettingsChanged?.();
    } catch (error) {
      console.error(`Failed to load models for ${customEntry.name}:`, error);
      setTestResult({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : `Failed to load models for ${customEntry.name}`,
        providerType,
      });
    } finally {
      setLoadingCustomProviderModels(false);
    }
  };

  const handleProviderSelect = (providerType: LLMProviderType) => {
    setSettings((prev) => {
      if (providerType !== "moa") return { ...prev, providerType };
      const defaultPreset =
        prev.moa?.defaultPreset ||
        Object.values(prev.moa?.presets || {}).find(
          (preset) => preset.enabled !== false,
        )?.id ||
        "";
      return {
        ...prev,
        providerType,
        modelKey: defaultPreset || prev.modelKey,
        moa: {
          ...prev.moa,
          defaultPreset: defaultPreset || prev.moa?.defaultPreset,
        },
      };
    });

    const resolvedCustomType = resolveCustomProviderId(providerType);
    const customEntry = CUSTOM_PROVIDER_MAP.get(resolvedCustomType);
    if (customEntry) {
      setCustomProviders((prev) => {
        const existing = prev[resolvedCustomType] || {};
        const updated: CustomProviderConfig = { ...existing };
        if (!updated.model && customEntry.defaultModel) {
          updated.model = customEntry.defaultModel;
        }
        if (!updated.baseUrl && customEntry.baseUrl) {
          updated.baseUrl = customEntry.baseUrl;
        }
        return { ...prev, [resolvedCustomType]: updated };
      });
    }

    const currentRouting = getProviderRoutingConfig(providerType);
    const providerPrimaryModel = getProviderPrimaryModel(providerType);
    if (
      providerPrimaryModel &&
      (!currentRouting.strongModelKey || !currentRouting.cheapModelKey)
    ) {
      setProviderRoutingConfig(providerType, {
        strongModelKey: currentRouting.strongModelKey || providerPrimaryModel,
        cheapModelKey: currentRouting.cheapModelKey || providerPrimaryModel,
        preferStrongForVerification:
          typeof currentRouting.preferStrongForVerification === "boolean"
            ? currentRouting.preferStrongForVerification
            : true,
      });
    }
    void loadProviderRoutingModels(providerType);

    if (providerType === "ollama") {
      loadOllamaModels();
    } else if (providerType === "anthropic") {
      loadClaudeModels(settingsRef.current.modelKey);
    } else if (providerType === "gemini") {
      loadGeminiModels();
    } else if (providerType === "openrouter") {
      loadOpenRouterModels();
    } else if (providerType === "openai") {
      loadOpenAIModels();
    } else if (providerType === "groq") {
      loadGroqModels();
    } else if (providerType === "xai" || providerType === "xai-oauth") {
      loadXAIModels();
    } else if (providerType === "deepseek") {
      loadDeepSeekModels();
    } else if (providerType === "kimi") {
      loadKimiModels();
    } else if (providerType === "pi") {
      loadPiProviders();
      loadPiModels();
    } else if (providerType === "openai-compatible") {
      if (openaiCompatBaseUrl) {
        loadOpenAICompatibleModels();
      }
    } else if (providerType === "hf-agents") {
      window.electronAPI.checkHf?.().then((result: Any) => {
        if (result) setHfStatus(result);
      });
      window.electronAPI.getLocalAIServerStatus?.().then((result: Any) => {
        if (result) setHfServerStatus(result);
      });
    } else if (providerType === "moa") {
      const slots = Object.values(
        settingsRef.current.moa?.presets || {},
      ).flatMap((preset) => [
        preset.aggregator,
        ...(preset.referenceModels || []),
      ]);
      for (const slot of slots) {
        if (slot.providerType !== "moa") {
          void loadProviderModelsForType(slot.providerType);
        }
      }
    }
  };

  const isModelProviderExpanded = (providerType: LLMProviderType): boolean => {
    const key = String(providerType);
    return (
      expandedModelProviders[key] ?? settings.providerType === providerType
    );
  };

  const toggleModelProviderExpanded = (providerType: LLMProviderType) => {
    const key = String(providerType);
    setExpandedModelProviders((prev) => {
      const currentlyExpanded =
        prev[key] ?? settingsRef.current.providerType === providerType;
      return {
        ...prev,
        [key]: !currentlyExpanded,
      };
    });
  };

  const handleOpenAIOAuthLogin = async () => {
    try {
      setOpenaiOAuthLoading(true);
      setTestResult(null);
      const result = await window.electronAPI.openaiOAuthStart();
      if (result.success) {
        setOpenaiOAuthConnected(true);
        setOpenaiAuthMethod("oauth");
        setOpenaiApiKey(""); // Clear API key when using OAuth
        if (!openaiModel || openaiModel === "gpt-4o-mini") {
          setOpenaiModel("gpt-5.5");
        }
        onSettingsChanged?.();
        // Load models after OAuth success
        loadOpenAIModels();
      } else {
        setTestResult({
          success: false,
          error: result.error || "OAuth failed",
        });
      }
    } catch (error: Any) {
      console.error("OpenAI OAuth error:", error);
      setTestResult({ success: false, error: error.message || "OAuth failed" });
    } finally {
      setOpenaiOAuthLoading(false);
    }
  };

  const handleHfDetectHardware = async () => {
    setDetectingHardware(true);
    try {
      const result = await window.electronAPI.detectHardware?.();
      setHfHardwareOutput(result || { models: [], output: "" });
    } catch (err: Any) {
      setHfHardwareOutput({
        models: [],
        output: err.message || "Detection failed",
      });
    } finally {
      setDetectingHardware(false);
    }
  };

  const handleHfStartServer = async () => {
    setStartingServer(true);
    try {
      const model = customProviders["hf-agents"]?.model;
      const result = await window.electronAPI.startLocalAIServer?.(model);
      if (result && !result.ok && result.error) {
        // Show error in the server log panel — NOT in hfHardwareOutput
        setServerLog({ lines: result.error.split("\n"), state: "error" });
        setStartingServer(false);
        return;
      }
      // Poll status + log every 2s while the process is alive
      // (model may be downloading — could take many minutes)
      let pollCount = 0;
      const maxPolls = 450; // 15 min max at 2s intervals
      const poll = async () => {
        const [status, log] = await Promise.all([
          window.electronAPI.getLocalAIServerStatus?.(),
          window.electronAPI.getLocalAIServerLog?.(),
        ]);
        if (status) setHfServerStatus(status);
        if (log) setServerLog(log);
        if (
          status?.serverRunning ||
          !status?.processAlive ||
          pollCount >= maxPolls
        ) {
          if (status?.serverRunning) setServerLog(null); // clear log panel on success
          setStartingServer(false);
          return;
        }
        pollCount++;
        setTimeout(poll, 2000);
      };
      setTimeout(poll, 2000);
    } catch (err: Any) {
      setHfHardwareOutput((prev) => ({
        ...(prev ?? { models: [], modelDetails: [] }),
        output: `Error: ${(err as Any)?.message || "Unknown error"}`,
      }));
      setStartingServer(false);
    }
  };

  const handleHfStopServer = async () => {
    setStoppingServer(true);
    setServerLog(null);
    try {
      await window.electronAPI.stopLocalAIServer?.();
      const status = await window.electronAPI.getLocalAIServerStatus?.();
      if (status) setHfServerStatus(status);
    } finally {
      setStoppingServer(false);
    }
  };

  const handleOpenAIOAuthLogout = async () => {
    try {
      setOpenaiOAuthLoading(true);
      await window.electronAPI.openaiOAuthLogout();
      setOpenaiOAuthConnected(false);
      setOpenaiAuthMethod("api_key");
      onSettingsChanged?.();
    } catch (error: Any) {
      console.error("OpenAI OAuth logout error:", error);
    } finally {
      setOpenaiOAuthLoading(false);
    }
  };

  const handleXAIOAuthLogin = async () => {
    try {
      setXaiOAuthLoading(true);
      setTestResult(null);
      const result = await window.electronAPI.xaiOAuthStart();
      if (result.success) {
        setXaiOAuthConnected(true);
        setXaiApiKey("");
        setXaiModel((current) => current || "grok-4.3");
        setSettings((prev) => ({
          ...prev,
          providerType: "xai-oauth",
          modelKey: xaiModel || "grok-4.3",
          xai: {
            ...prev.xai,
            authMethod: "oauth",
            model: xaiModel || prev.xai?.model || "grok-4.3",
            baseUrl: xaiBaseUrl || prev.xai?.baseUrl || "https://api.x.ai/v1",
          },
        }));
        onSettingsChanged?.();
        loadXAIModels();
      } else {
        setTestResult({
          success: false,
          error: result.error || "xAI OAuth failed",
        });
      }
    } catch (error: Any) {
      console.error("xAI OAuth error:", error);
      setTestResult({
        success: false,
        error: error.message || "xAI OAuth failed",
      });
    } finally {
      setXaiOAuthLoading(false);
    }
  };

  const handleXAIOAuthLogout = async () => {
    try {
      setXaiOAuthLoading(true);
      await window.electronAPI.xaiOAuthLogout();
      setXaiOAuthConnected(false);
      onSettingsChanged?.();
    } catch (error: Any) {
      console.error("xAI OAuth logout error:", error);
    } finally {
      setXaiOAuthLoading(false);
    }
  };

  const loadBedrockModels = async () => {
    try {
      setLoadingBedrockModels(true);
      const config = useDefaultCredentials
        ? { region: awsRegion, profile: awsProfile || undefined }
        : {
            region: awsRegion,
            accessKeyId: awsAccessKeyId || undefined,
            secretAccessKey: awsSecretAccessKey || undefined,
          };
      const models = await window.electronAPI.getBedrockModels(config);
      const normalizedModels = models || [];

      // Keep the user's currently selected model even if it isn't in the refreshed list
      // (for example, custom inference profile ARN/ID). Only auto-select when empty.
      const currentModel = bedrockModel?.trim();
      let nextModels = normalizedModels;
      if (
        currentModel &&
        !normalizedModels.some((m: Any) => m.id === currentModel)
      ) {
        nextModels = [
          {
            id: currentModel,
            name: currentModel,
            provider: "Custom",
            description: "Currently selected (custom)",
          },
          ...normalizedModels,
        ];
      }

      setBedrockModels(nextModels);
      if (!currentModel && nextModels.length > 0) {
        setBedrockModel(nextModels[0].id);
      }
      // Notify main page that models were refreshed (they're now cached)
      onSettingsChanged?.();
    } catch (error) {
      console.error("Failed to load Bedrock models:", error);
      setBedrockModels([]);
      const rawMessage =
        error instanceof Error ? error.message : String(error || "");
      if (
        rawMessage.includes("Could not load credentials from any providers")
      ) {
        setTestResult({
          success: false,
          error:
            "Bedrock credentials were cleared. Configure AWS credentials via default chain (~/.aws/credentials, env vars, or IAM role) or enter access key + secret key, then refresh models.",
        });
      } else {
        setTestResult({
          success: false,
          error: rawMessage || "Failed to load Bedrock models.",
        });
      }
    } finally {
      setLoadingBedrockModels(false);
    }
  };

  const clearProviderFormState = (providerType: LLMProviderType) => {
    switch (providerType) {
      case "anthropic":
        setAnthropicApiKey("");
        setAnthropicSubscriptionToken("");
        setAnthropicAuthMethod("api_key");
        break;
      case "bedrock":
        setAwsRegion("us-east-1");
        setAwsAccessKeyId("");
        setAwsSecretAccessKey("");
        setAwsProfile("");
        setUseDefaultCredentials(true);
        setBedrockModel("");
        setBedrockModels([]);
        break;
      case "ollama":
        setOllamaBaseUrl("http://localhost:11434");
        setOllamaModel("");
        setOllamaApiKey("");
        setOllamaModels([]);
        break;
      case "gemini":
        setGeminiApiKey("");
        setGeminiModel("");
        setGeminiModels([]);
        break;
      case "openrouter":
        setOpenrouterApiKey("");
        setOpenrouterBaseUrl("");
        setOpenrouterModel("");
        setOpenrouterModels([]);
        break;
      case "openai":
        setOpenaiApiKey("");
        setOpenaiModel("");
        setOpenaiModels([]);
        setOpenaiAuthMethod("api_key");
        setOpenaiOAuthConnected(false);
        break;
      case "azure":
        setAzureApiKey("");
        setAzureEndpoint("");
        setAzureDeployment("");
        setAzureDeploymentsText("");
        setAzureApiVersion("2024-02-15-preview");
        setAzureReasoningEffort("medium");
        break;
      case "azure-anthropic":
        setAzureAnthropicApiKey("");
        setAzureAnthropicEndpoint("");
        setAzureAnthropicDeployment("");
        setAzureAnthropicDeploymentsText("");
        setAzureAnthropicApiVersion("2023-06-01");
        break;
      case "groq":
        setGroqApiKey("");
        setGroqBaseUrl("");
        setGroqModel("");
        setGroqModels([]);
        break;
      case "xai":
        setXaiApiKey("");
        setXaiBaseUrl("");
        setXaiModel("");
        setXaiModels([]);
        break;
      case "xai-oauth":
        setXaiOAuthConnected(false);
        setXaiModel("");
        setXaiModels([]);
        break;
      case "deepseek":
        setDeepseekApiKey("");
        setDeepseekBaseUrl("");
        setDeepseekModel("");
        setDeepseekModels([]);
        break;
      case "kimi":
        setKimiApiKey("");
        setKimiBaseUrl("");
        setKimiModel("kimi-k3");
        setKimiModels([]);
        setKimiConnectionState("idle");
        setKimiConnectionError(undefined);
        break;
      case "pi":
        setPiProvider("anthropic");
        setPiApiKey("");
        setPiModel("");
        setPiModels([]);
        break;
      case "openai-compatible":
        setOpenaiCompatDisplayName("");
        setOpenaiCompatBaseUrl("");
        setOpenaiCompatApiKey("");
        setOpenaiCompatModel("");
        setOpenaiCompatSupportsImages(undefined);
        setOpenaiCompatModels([]);
        break;
      default:
        setCustomProviders((prev) => {
          const next = { ...prev };
          delete next[providerType];
          if (providerType === "kimi-code") {
            delete next["kimi-coding"];
          }
          return next;
        });
        break;
    }
  };

  const clearProviderSettingsState = (
    sourceSettings: LLMSettingsData,
    providerType: LLMProviderType,
  ): LLMSettingsData => {
    const resolvedType = resolveCustomProviderId(providerType);
    const nextSettings: LLMSettingsData = { ...sourceSettings };

    switch (resolvedType) {
      case "anthropic":
        nextSettings.anthropic = undefined;
        nextSettings.cachedAnthropicModels = undefined;
        if (
          resolveCustomProviderId(nextSettings.providerType) === "anthropic"
        ) {
          nextSettings.modelKey = "";
        }
        break;
      case "bedrock":
        nextSettings.bedrock = undefined;
        nextSettings.cachedBedrockModels = undefined;
        break;
      case "ollama":
        nextSettings.ollama = undefined;
        nextSettings.cachedOllamaModels = undefined;
        break;
      case "gemini":
        nextSettings.gemini = undefined;
        nextSettings.cachedGeminiModels = undefined;
        break;
      case "openrouter":
        nextSettings.openrouter = undefined;
        nextSettings.cachedOpenRouterModels = undefined;
        break;
      case "openai":
        nextSettings.openai = undefined;
        nextSettings.cachedOpenAIModels = undefined;
        break;
      case "azure":
        nextSettings.azure = undefined;
        break;
      case "azure-anthropic":
        nextSettings.azureAnthropic = undefined;
        break;
      case "groq":
        nextSettings.groq = undefined;
        nextSettings.cachedGroqModels = undefined;
        break;
      case "xai":
      case "xai-oauth":
        nextSettings.xai = undefined;
        nextSettings.cachedXaiModels = undefined;
        break;
      case "deepseek":
        nextSettings.deepseek = undefined;
        nextSettings.cachedDeepSeekModels = undefined;
        break;
      case "kimi":
        nextSettings.kimi = undefined;
        nextSettings.cachedKimiModels = undefined;
        break;
      case "pi":
        nextSettings.pi = undefined;
        nextSettings.cachedPiModels = undefined;
        break;
      case "openai-compatible":
        nextSettings.openaiCompatible = undefined;
        nextSettings.cachedOpenAICompatibleModels = undefined;
        break;
      case "moa":
        nextSettings.moa = undefined;
        break;
      default: {
        if (!nextSettings.customProviders) break;
        const nextCustomProviders = { ...nextSettings.customProviders };
        delete nextCustomProviders[resolvedType];
        if (resolvedType === "kimi-code") {
          delete nextCustomProviders["kimi-coding"];
        }
        nextSettings.customProviders =
          Object.keys(nextCustomProviders).length > 0
            ? nextCustomProviders
            : undefined;
        break;
      }
    }

    return nextSettings;
  };

  const handleResetProviderCredentials = async () => {
    try {
      setResettingCredentials(true);
      setTestResult(null);

      const providerType = resolveCustomProviderId(
        settings.providerType as LLMProviderType,
      );
      await window.electronAPI.resetLLMProviderCredentials(providerType);

      clearProviderFormState(providerType);
      await loadConfigStatus();
      onSettingsChanged?.();
    } catch (error: Any) {
      console.error("Failed to reset provider credentials:", error);
      setTestResult({
        success: false,
        error: error?.message || "Failed to reset provider credentials",
      });
    } finally {
      setResettingCredentials(false);
    }
  };

  const parseOpenRouterParetoMinCodingScore = (): {
    value?: number;
    error?: string;
    shouldSave: boolean;
  } => {
    if (!isOpenRouterParetoCodeModel(openrouterModel)) {
      return { shouldSave: false };
    }
    const trimmed = openrouterParetoMinCodingScore.trim();
    if (!trimmed) return { shouldSave: true };
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
      return { error: OPENROUTER_PARETO_SCORE_ERROR, shouldSave: true };
    }
    return { value: parsed, shouldSave: true };
  };

  const handleSave = async (options?: {
    stayOnPage?: boolean;
    selectedModel?: {
      providerType: LLMProviderType;
      modelName: string;
    };
  }): Promise<boolean> => {
    try {
      setSaving(true);
      setTestResult(null);

      const currentSettings = settingsRef.current;
      const openrouterParetoScore = parseOpenRouterParetoMinCodingScore();
      const shouldValidateOpenRouterParetoScore =
        currentSettings.providerType === "openrouter" &&
        openrouterParetoScore.shouldSave;
      if (shouldValidateOpenRouterParetoScore && openrouterParetoScore.error) {
        setTestResult({ success: false, error: openrouterParetoScore.error });
        return false;
      }

      const sanitizedCustomProviders =
        sanitizeCustomProviders(customProvidersRef.current) || {};
      const sanitizedMoaPresets = sanitizeMoaPresets(
        currentSettings.moa?.presets,
      );
      const moaDefaultPreset =
        currentSettings.moa?.defaultPreset &&
        sanitizedMoaPresets[currentSettings.moa.defaultPreset]
          ? currentSettings.moa.defaultPreset
          : Object.values(sanitizedMoaPresets).find(
              (preset) => preset.enabled !== false,
            )?.id;
      const resolvedProviderTypeForSave = resolveCustomProviderId(
        currentSettings.providerType as LLMProviderType,
      );
      const selectedCustomEntry = CUSTOM_PROVIDER_MAP.get(
        resolvedProviderTypeForSave,
      );
      if (selectedCustomEntry) {
        const existing =
          sanitizedCustomProviders[resolvedProviderTypeForSave] || {};
        const withDefaults: CustomProviderConfig = { ...existing };
        if (!withDefaults.model && selectedCustomEntry.defaultModel) {
          withDefaults.model = selectedCustomEntry.defaultModel;
        }
        if (!withDefaults.baseUrl && selectedCustomEntry.baseUrl) {
          withDefaults.baseUrl = selectedCustomEntry.baseUrl;
        }
        sanitizedCustomProviders[resolvedProviderTypeForSave] = withDefaults;
      }
      const azureSettings = buildAzureSettings();
      const azureAnthropicSettings = buildAzureAnthropicSettings();
      const routingFor = (
        providerType: LLMProviderType,
      ): ProviderRoutingConfig => {
        const routing = getProviderRoutingConfig(providerType);
        const strongModelKey = routing.strongModelKey?.trim();
        const cheapModelKey = routing.cheapModelKey?.trim();
        const automatedTaskModelKey = routing.automatedTaskModelKey?.trim();
        return {
          profileRoutingEnabled: routing.profileRoutingEnabled === true,
          strongModelKey: strongModelKey || undefined,
          cheapModelKey: cheapModelKey || undefined,
          automatedTaskModelKey: automatedTaskModelKey || undefined,
          preferStrongForVerification:
            typeof routing.preferStrongForVerification === "boolean"
              ? routing.preferStrongForVerification
              : true,
        };
      };
      const failoverFor = (
        providerType: LLMProviderType,
      ): Pick<
        ProviderRoutingConfig,
        "fallbackProviders" | "failoverPrimaryRetryCooldownSeconds"
      > => {
        const failover = getProviderFailoverConfig(providerType);
        const fallbackProviders =
          failover.fallbackProviders !== undefined
            ? sanitizeFailoverProviders(failover.fallbackProviders)
            : undefined;
        const cooldown =
          typeof failover.failoverPrimaryRetryCooldownSeconds === "number" &&
          Number.isFinite(failover.failoverPrimaryRetryCooldownSeconds)
            ? Math.max(
                0,
                Math.min(
                  3600,
                  Math.floor(failover.failoverPrimaryRetryCooldownSeconds),
                ),
              )
            : undefined;
        return {
          ...(fallbackProviders !== undefined ? { fallbackProviders } : {}),
          ...(typeof cooldown === "number"
            ? { failoverPrimaryRetryCooldownSeconds: cooldown }
            : {}),
        };
      };
      const anthropicCredentialSettings = {
        apiKey: anthropicApiKey || undefined,
        subscriptionToken: anthropicSubscriptionToken || undefined,
        authMethod: anthropicAuthMethod,
      };
      const xaiAuthMethod =
        currentSettings.providerType === "xai"
          ? "api_key"
          : currentSettings.providerType === "xai-oauth"
            ? "oauth"
            : currentSettings.xai?.authMethod;
      const imageTimeoutSeconds = (value: string): number | undefined => {
        const parsed = Number(value);
        if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
        return Math.min(1800, Math.max(30, Math.round(parsed)));
      };

      // Always save settings for ALL providers to preserve API keys and model selections
      // when switching between providers
      const settingsToSave: LLMSettingsData = {
        ...currentSettings,
        modelKey:
          currentSettings.providerType === "moa" && moaDefaultPreset
            ? moaDefaultPreset
            : currentSettings.modelKey,
        // Always include anthropic settings
        anthropic: {
          ...anthropicCredentialSettings,
          ...routingFor("anthropic"),
          ...failoverFor("anthropic"),
        },
        // Always include bedrock settings
        bedrock: {
          region: awsRegion,
          useDefaultCredentials,
          model: bedrockModel || undefined,
          ...routingFor("bedrock"),
          ...failoverFor("bedrock"),
          ...(useDefaultCredentials
            ? {
                profile: awsProfile || undefined,
              }
            : {
                accessKeyId: awsAccessKeyId || undefined,
                secretAccessKey: awsSecretAccessKey || undefined,
              }),
        },
        // Always include ollama settings
        ollama: {
          baseUrl: ollamaBaseUrl || undefined,
          model: ollamaModel || undefined,
          apiKey: ollamaApiKey || undefined,
          ...routingFor("ollama"),
          ...failoverFor("ollama"),
        },
        // Always include gemini settings
        gemini: {
          apiKey: geminiApiKey || undefined,
          model: geminiModel || undefined,
          ...routingFor("gemini"),
          ...failoverFor("gemini"),
        },
        // Always include openrouter settings
        openrouter: {
          apiKey: openrouterApiKey || undefined,
          model: openrouterModel || undefined,
          baseUrl: openrouterBaseUrl || undefined,
          ...(shouldValidateOpenRouterParetoScore
            ? { paretoMinCodingScore: openrouterParetoScore.value }
            : {}),
          ...routingFor("openrouter"),
          ...failoverFor("openrouter"),
        },
        // Always include openai settings
        openai: {
          apiKey:
            openaiAuthMethod === "api_key"
              ? openaiApiKey || undefined
              : undefined,
          model: openaiModel || undefined,
          reasoningEffort: openaiReasoningEffort,
          textVerbosity: openaiTextVerbosity,
          authMethod: openaiAuthMethod,
          ...routingFor("openai"),
          ...failoverFor("openai"),
        },
        // Always include Azure OpenAI settings
        azure: {
          apiKey: azureApiKey || undefined,
          endpoint: azureEndpoint || undefined,
          deployment: azureSettings.deployment,
          deployments: azureSettings.deployments,
          apiVersion: azureApiVersion || undefined,
          reasoningEffort: azureReasoningEffort,
          ...routingFor("azure"),
          ...failoverFor("azure"),
        },
        // Always include Azure Anthropic settings
        azureAnthropic: {
          apiKey: azureAnthropicApiKey || undefined,
          endpoint: azureAnthropicEndpoint || undefined,
          deployment: azureAnthropicSettings.deployment,
          deployments: azureAnthropicSettings.deployments,
          apiVersion: azureAnthropicApiVersion || undefined,
          ...routingFor("azure-anthropic"),
          ...failoverFor("azure-anthropic"),
        },
        // Always include Groq settings
        groq: {
          apiKey: groqApiKey || undefined,
          model: groqModel || undefined,
          baseUrl: groqBaseUrl || undefined,
          ...routingFor("groq"),
          ...failoverFor("groq"),
        },
        // Always include xAI settings
        xai: {
          apiKey: xaiApiKey || undefined,
          model: xaiModel || undefined,
          baseUrl: xaiBaseUrl || undefined,
          authMethod: xaiAuthMethod,
          ...routingFor("xai"),
          ...failoverFor("xai"),
        },
        // Always include DeepSeek settings
        deepseek: {
          apiKey: deepseekApiKey || undefined,
          model: deepseekModel || undefined,
          baseUrl: deepseekBaseUrl || undefined,
          ...routingFor("deepseek"),
          ...failoverFor("deepseek"),
        },
        // Always include Kimi settings
        kimi: {
          apiKey: kimiApiKey || undefined,
          model: kimiModel || undefined,
          baseUrl: kimiBaseUrl || undefined,
          ...routingFor("kimi"),
          ...failoverFor("kimi"),
        },
        // Always include Pi settings
        pi: {
          provider: piProvider || undefined,
          apiKey: piApiKey || undefined,
          model: piModel || undefined,
          ...routingFor("pi"),
          ...failoverFor("pi"),
        },
        // Always include OpenAI-compatible settings
        openaiCompatible: {
          displayName: openaiCompatDisplayName.trim() || undefined,
          baseUrl: openaiCompatBaseUrl || undefined,
          apiKey: openaiCompatApiKey || undefined,
          model: openaiCompatModel || undefined,
          supportsImages: openaiCompatSupportsImages,
          ...routingFor("openai-compatible"),
          ...failoverFor("openai-compatible"),
        },
        moa: {
          defaultPreset: moaDefaultPreset,
          presets:
            Object.keys(sanitizedMoaPresets).length > 0
              ? sanitizedMoaPresets
              : undefined,
          ...routingFor("moa"),
          ...failoverFor("moa"),
        },
        imageGeneration:
          imageGenDefaultProvider ||
          imageGenDefaultModel ||
          imageGenBackupProvider ||
          imageGenBackupModel ||
          imageOpenAIApiKey ||
          imageOpenAIModel ||
          imageAzureApiKey ||
          imageAzureEndpoint ||
          imageAzureDeployment ||
          imageAzureApiVersion ||
          imageGeminiApiKey ||
          imageGeminiModel ||
          imageOpenRouterApiKey ||
          imageOpenRouterBaseUrl ||
          imageOpenRouterModel ||
          imageOpenAICodexModel ||
          imageOpenAITimeoutSeconds ||
          imageOpenAICodexTimeoutSeconds ||
          imageAzureTimeoutSeconds ||
          imageOpenRouterTimeoutSeconds ||
          imageGeminiTimeoutSeconds
            ? {
                defaultProvider: imageGenDefaultProvider || undefined,
                defaultModel: imageGenDefaultModel || undefined,
                backupProvider: imageGenBackupProvider || undefined,
                backupModel: imageGenBackupModel || undefined,
                timeouts: {
                  openai: imageTimeoutSeconds(imageOpenAITimeoutSeconds),
                  openaiCodex: imageTimeoutSeconds(
                    imageOpenAICodexTimeoutSeconds,
                  ),
                  azure: imageTimeoutSeconds(imageAzureTimeoutSeconds),
                  openrouter: imageTimeoutSeconds(
                    imageOpenRouterTimeoutSeconds,
                  ),
                  gemini: imageTimeoutSeconds(imageGeminiTimeoutSeconds),
                },
                openai: {
                  apiKey: imageOpenAIApiKey || undefined,
                  model: imageOpenAIModel || undefined,
                },
                azure: {
                  imageApiKey: imageAzureApiKey || undefined,
                  imageEndpoint: imageAzureEndpoint || undefined,
                  imageDeployment: imageAzureDeployment || undefined,
                  imageApiVersion: imageAzureApiVersion || undefined,
                },
                gemini: {
                  apiKey: imageGeminiApiKey || undefined,
                  model: imageGeminiModel || undefined,
                },
                openrouter: {
                  apiKey: imageOpenRouterApiKey || undefined,
                  baseUrl: imageOpenRouterBaseUrl || undefined,
                  model: imageOpenRouterModel || undefined,
                },
                openaiCodex: {
                  model: imageOpenAICodexModel || undefined,
                },
              }
            : undefined,
        videoGeneration: {
          defaultProvider: videoDefaultProvider || undefined,
          fallbackProvider: videoFallbackProvider || undefined,
          openai: {
            defaultModel: videoOpenAIModel || undefined,
            defaultDuration: videoOpenAIDuration
              ? Number(videoOpenAIDuration)
              : undefined,
            defaultAspectRatio:
              (videoOpenAIAspectRatio as "16:9" | "9:16" | "1:1") || undefined,
            defaultResolution:
              (videoOpenAIResolution as "480p" | "720p" | "1080p") || undefined,
          },
          azure: {
            videoApiKey: videoAzureApiKey || undefined,
            videoEndpoint: videoAzureEndpoint || undefined,
            videoDeployment: videoAzureDeployment || undefined,
            videoApiVersion: videoAzureApiVersion || undefined,
            defaultDuration: videoAzureDuration
              ? Number(videoAzureDuration)
              : undefined,
            defaultAspectRatio:
              (videoAzureAspectRatio as "16:9" | "9:16" | "1:1") || undefined,
          },
          gemini: {
            defaultModel: videoGeminiModel || undefined,
            defaultDuration: videoGeminiDuration
              ? Number(videoGeminiDuration)
              : undefined,
            defaultAspectRatio:
              (videoGeminiAspectRatio as "16:9" | "9:16" | "1:1") || undefined,
          },
          vertex: {
            model: videoVertexModel || undefined,
            projectId: videoVertexProjectId || undefined,
            location: videoVertexLocation || undefined,
            outputGcsUri: videoVertexOutputGcsUri || undefined,
            accessToken: videoVertexAccessToken || undefined,
            defaultDuration: videoVertexDuration
              ? Number(videoVertexDuration)
              : undefined,
            defaultAspectRatio:
              (videoVertexAspectRatio as "16:9" | "9:16" | "1:1") || undefined,
          },
          kling: {
            apiKey: videoKlingApiKey || undefined,
            baseUrl: videoKlingBaseUrl || undefined,
            model: videoKlingModel || undefined,
            defaultDuration: videoKlingDuration
              ? Number(videoKlingDuration)
              : undefined,
            defaultAspectRatio:
              (videoKlingAspectRatio as "16:9" | "9:16" | "1:1") || undefined,
          },
        },
        customProviders:
          Object.keys(sanitizedCustomProviders).length > 0
            ? sanitizedCustomProviders
            : undefined,
      };

      const settingsForPersistence = options?.selectedModel
        ? writeProviderPrimaryModelSetting(
            settingsToSave,
            options.selectedModel.providerType,
            options.selectedModel.modelName,
          )
        : settingsToSave;

      await window.electronAPI.saveLLMSettings(settingsForPersistence);
      onSettingsChanged?.();
      if (options?.stayOnPage) {
        await loadConfigStatus();
      } else {
        onBack();
      }
      return true;
    } catch (error) {
      console.error("Failed to save settings:", error);
      setTestResult({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to save model settings.",
      });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async (providerType = settings.providerType) => {
    try {
      setTesting(true);
      setTestResult(null);

      const openrouterParetoScore = parseOpenRouterParetoMinCodingScore();
      const shouldValidateOpenRouterParetoScore =
        providerType === "openrouter" && openrouterParetoScore.shouldSave;
      if (shouldValidateOpenRouterParetoScore && openrouterParetoScore.error) {
        setTestResult({
          success: false,
          error: openrouterParetoScore.error,
          providerType,
        });
        return;
      }

      const sanitizedCustomProviders =
        sanitizeCustomProviders(customProviders) || {};
      const sanitizedMoaPresets = sanitizeMoaPresets(settings.moa?.presets);
      const moaDefaultPreset =
        settings.moa?.defaultPreset &&
        sanitizedMoaPresets[settings.moa.defaultPreset]
          ? settings.moa.defaultPreset
          : Object.values(sanitizedMoaPresets).find(
              (preset) => preset.enabled !== false,
            )?.id;
      const azureSettings = buildAzureSettings();
      const azureAnthropicSettings = buildAzureAnthropicSettings();
      const anthropicCredentialSettings = {
        apiKey: anthropicApiKey || undefined,
        subscriptionToken: anthropicSubscriptionToken || undefined,
        authMethod: anthropicAuthMethod,
      };

      const testConfig = {
        providerType,
        modelKey: settings.modelKey,
        anthropic:
          providerType === "anthropic"
            ? anthropicCredentialSettings
            : undefined,
        bedrock:
          providerType === "bedrock"
            ? {
                region: awsRegion,
                ...(useDefaultCredentials
                  ? {
                      profile: awsProfile || undefined,
                    }
                  : {
                      accessKeyId: awsAccessKeyId || undefined,
                      secretAccessKey: awsSecretAccessKey || undefined,
                    }),
              }
            : undefined,
        ollama:
          providerType === "ollama"
            ? {
                baseUrl: ollamaBaseUrl || undefined,
                model: ollamaModel || undefined,
                apiKey: ollamaApiKey || undefined,
              }
            : undefined,
        gemini:
          providerType === "gemini"
            ? {
                apiKey: geminiApiKey || undefined,
                model: geminiModel || undefined,
              }
            : undefined,
        openrouter:
          providerType === "openrouter"
            ? {
                apiKey: openrouterApiKey || undefined,
                model: openrouterModel || undefined,
                baseUrl: openrouterBaseUrl || undefined,
                ...(shouldValidateOpenRouterParetoScore
                  ? { paretoMinCodingScore: openrouterParetoScore.value }
                  : {}),
              }
            : undefined,
        openai:
          providerType === "openai"
            ? {
                apiKey:
                  openaiAuthMethod === "api_key"
                    ? openaiApiKey || undefined
                    : undefined,
                model: openaiModel || undefined,
                reasoningEffort: openaiReasoningEffort,
                textVerbosity: openaiTextVerbosity,
                authMethod: openaiAuthMethod,
                // OAuth tokens are handled by the backend from stored settings
              }
            : undefined,
        azure:
          providerType === "azure"
            ? {
                apiKey: azureApiKey || undefined,
                endpoint: azureEndpoint || undefined,
                deployment: azureSettings.deployment,
                deployments: azureSettings.deployments,
                apiVersion: azureApiVersion || undefined,
                reasoningEffort: azureReasoningEffort,
              }
            : undefined,
        azureAnthropic:
          providerType === "azure-anthropic"
            ? {
                apiKey: azureAnthropicApiKey || undefined,
                endpoint: azureAnthropicEndpoint || undefined,
                deployment: azureAnthropicSettings.deployment,
                deployments: azureAnthropicSettings.deployments,
                apiVersion: azureAnthropicApiVersion || undefined,
              }
            : undefined,
        groq:
          providerType === "groq"
            ? {
                apiKey: groqApiKey || undefined,
                model: groqModel || undefined,
                baseUrl: groqBaseUrl || undefined,
              }
            : undefined,
        xai:
          providerType === "xai" || providerType === "xai-oauth"
            ? {
                apiKey:
                  providerType === "xai" ? xaiApiKey || undefined : undefined,
                model: xaiModel || undefined,
                baseUrl: xaiBaseUrl || undefined,
                authMethod: providerType === "xai-oauth" ? "oauth" : "api_key",
              }
            : undefined,
        deepseek:
          providerType === "deepseek"
            ? {
                apiKey: deepseekApiKey || undefined,
                model: deepseekModel || undefined,
                baseUrl: deepseekBaseUrl || undefined,
              }
            : undefined,
        kimi:
          providerType === "kimi"
            ? {
                apiKey: kimiApiKey || undefined,
                model: kimiModel || undefined,
                baseUrl: kimiBaseUrl || undefined,
              }
            : undefined,
        pi:
          providerType === "pi"
            ? {
                provider: piProvider || undefined,
                apiKey: piApiKey || undefined,
                model: piModel || undefined,
              }
            : undefined,
        openaiCompatible:
          providerType === "openai-compatible"
            ? {
                displayName: openaiCompatDisplayName.trim() || undefined,
                baseUrl: openaiCompatBaseUrl || undefined,
                apiKey: openaiCompatApiKey || undefined,
                model: openaiCompatModel || undefined,
                supportsImages: openaiCompatSupportsImages,
              }
            : undefined,
        moa:
          providerType === "moa"
            ? {
                defaultPreset: moaDefaultPreset,
                presets:
                  Object.keys(sanitizedMoaPresets).length > 0
                    ? sanitizedMoaPresets
                    : undefined,
              }
            : undefined,
        customProviders:
          Object.keys(sanitizedCustomProviders).length > 0
            ? sanitizedCustomProviders
            : undefined,
      };

      const result = await window.electronAPI.testLLMProvider(testConfig);
      setTestResult({ ...result, providerType });
    } catch (error: Any) {
      setTestResult({ success: false, error: error.message, providerType });
    } finally {
      setTesting(false);
    }
  };

  const renderModelSettingsActions = (options?: {
    includeProviderActions?: boolean;
  }) => (
    <div className="settings-actions">
      {options?.includeProviderActions && settings.providerType !== "kimi" && (
        <button
          className="button-secondary"
          onClick={() => void handleTestConnection()}
          disabled={loading || testing || resettingCredentials}
        >
          {testing
            ? translate("aiModels.action.testing", "Testing...")
            : translate("aiModels.action.testConnection", "Test Connection")}
        </button>
      )}
      {options?.includeProviderActions && (
        <button
          className="button-secondary"
          onClick={() => void handleResetProviderCredentials()}
          disabled={loading || saving || testing || resettingCredentials}
        >
          {resettingCredentials
            ? translate("aiModels.action.resetting", "Resetting...")
            : translate(
                "aiModels.action.resetProviderCredentials",
                "Reset Provider Credentials",
              )}
        </button>
      )}
      <button
        className="button-primary"
        onClick={() => void handleSave()}
        disabled={loading || saving || resettingCredentials}
      >
        {saving
          ? translate("aiModels.action.saving", "Saving...")
          : translate("aiModels.action.saveSettings", "Save Settings")}
      </button>
    </div>
  );

  const currentProviderType = settings.providerType as LLMProviderType;
  const resolvedProviderType = resolveCustomProviderId(currentProviderType);
  const selectedCustomProvider = CUSTOM_PROVIDER_MAP.get(resolvedProviderType);
  const selectedCustomConfig = selectedCustomProvider
    ? customProviders[resolvedProviderType] || {}
    : {};
  const selectedCustomModels = selectedCustomConfig.cachedModels || [];
  const currentProviderLabel =
    currentProviderType === "openai-compatible"
      ? openaiCompatDisplayName.trim() ||
        openaiCompatModel.trim() ||
        translate("generated.components.settings.6421.3", "Customize")
      : providers.find((provider) => provider.type === currentProviderType)
          ?.name || currentProviderType;
  const providerRouting = getProviderRoutingConfig(currentProviderType);
  const providerFailover = getProviderFailoverConfig(currentProviderType);
  const currentFailoverProviders = providerFailover.fallbackProviders || [];
  const updateCurrentFailoverProviders = (
    updater: (prev: LLMProviderFallbackConfig[]) => LLMProviderFallbackConfig[],
  ) => {
    setProviderRoutingConfig(currentProviderType, {
      fallbackProviders: updater(currentFailoverProviders),
    });
  };
  const routingEnabled = providerRouting.profileRoutingEnabled === true;
  const providerPrimaryModel = getProviderPrimaryModel(currentProviderType);
  const moaPresets = settings.moa?.presets || {};
  const moaPresetList = Object.values(moaPresets);
  const selectedMoaPresetId =
    settings.moa?.defaultPreset ||
    moaPresetList.find((preset) => preset.enabled !== false)?.id ||
    "";
  const selectedMoaPreset = selectedMoaPresetId
    ? moaPresets[selectedMoaPresetId]
    : undefined;
  const moaProviderOptions = getMoaProviderOptions();
  const strongRoutingModel =
    providerRouting.strongModelKey || providerPrimaryModel;
  const cheapRoutingModel =
    providerRouting.cheapModelKey || providerPrimaryModel;
  const automatedTaskRoutingModel = providerRouting.automatedTaskModelKey || "";
  const routingModelOptions = getRoutingModelOptions(currentProviderType);
  const routingModelsIdentical =
    routingEnabled &&
    !!strongRoutingModel &&
    !!cheapRoutingModel &&
    strongRoutingModel === cheapRoutingModel;
  const openrouterParetoSelected = isOpenRouterParetoCodeModel(openrouterModel);
  const openrouterParetoScoreError = openrouterParetoSelected
    ? parseOpenRouterParetoMinCodingScore().error
    : undefined;

  useEffect(() => {
    for (const entry of providerFailover.fallbackProviders || []) {
      if (!providerModelOptionsByType[entry.providerType]) {
        void loadProviderModelsForType(entry.providerType);
      }
    }
  }, [
    currentProviderType,
    providerFailover.fallbackProviders,
    loadProviderModelsForType,
    providerModelOptionsByType,
  ]);

  useEffect(() => {
    if (currentProviderType !== "moa") return;
    const providerTypes = new Set<LLMProviderType>();
    for (const preset of moaPresetList) {
      if (
        preset.aggregator?.providerType &&
        preset.aggregator.providerType !== "moa"
      ) {
        providerTypes.add(preset.aggregator.providerType);
      }
      for (const slot of preset.referenceModels || []) {
        if (slot.providerType && slot.providerType !== "moa") {
          providerTypes.add(slot.providerType);
        }
      }
    }
    for (const providerType of providerTypes) {
      if (!providerModelOptionsByType[providerType]) {
        void loadProviderModelsForType(providerType);
      }
    }
  }, [
    currentProviderType,
    moaPresetList,
    loadProviderModelsForType,
    providerModelOptionsByType,
  ]);

  const activeImageTab: ImageProviderTab = imageGenDefaultProvider || "auto";

  const imageProviders = [
    {
      type: "openai" as const,
      name: "OpenAI Image",
      icon: <CircleDot {...S} />,
    },
    { type: "azure" as const, name: "Azure Image", icon: <Cloud {...S} /> },
    { type: "gemini" as const, name: "Gemini Image", icon: <Star {...S} /> },
    {
      type: "openrouter" as const,
      name: "OpenRouter",
      icon: <Globe {...S} />,
    },
    {
      type: "openai-codex" as const,
      name: "ChatGPT Subscription",
      icon: <Sparkles {...S} />,
    },
  ];
  const imageProviderTabs: Array<{
    type: ImageProviderTab;
    name: string;
    icon: ReactNode;
  }> = [
    {
      type: "auto",
      name: "Automatic",
      icon: <Sparkles {...S} />,
    },
    ...imageProviders,
  ];

  const automaticImageRoutingDescription =
    currentProviderType === "openai" && openaiAuthMethod === "oauth"
      ? translate(
          "aiModels.image.auto.chatgptDescription",
          "With ChatGPT selected in AI Model, automatic image generation uses your ChatGPT subscription by default.",
        )
      : translate(
          "aiModels.image.auto.description",
          "Uses the best configured image provider. If AI Model is signed in with ChatGPT, automatic image generation will use that subscription first.",
        );

  const getImageProviderModel = (provider: ImageGenProvider): ImageGenModel =>
    provider === "gemini" ? "nano-banana-2" : "gpt-image-2";

  const getImageModelLabel = (model: ImageGenModel): string =>
    model === "nano-banana-2"
      ? "nano-banana-2 (Gemini 3.1 Flash Image)"
      : model;

  const getImageProviderLabel = (provider: ImageProviderTab): string => {
    switch (provider) {
      case "auto":
        return translate("aiModels.image.provider.auto", "Automatic");
      case "openai":
        return translate("aiModels.image.provider.openai", "OpenAI Image");
      case "azure":
        return translate("aiModels.image.provider.azure", "Azure Image");
      case "gemini":
        return translate("aiModels.image.provider.gemini", "Gemini Image");
      case "openrouter":
        return translate("aiModels.image.provider.openrouter", "OpenRouter");
      case "openai-codex":
        return translate(
          "aiModels.image.provider.openaiCodex",
          "ChatGPT Subscription",
        );
      default:
        return provider;
    }
  };

  const getVideoProviderLabel = (
    provider: "openai" | "azure" | "gemini" | "vertex" | "kling",
  ): string => {
    switch (provider) {
      case "openai":
        return translate("aiModels.video.provider.openai", "OpenAI Sora");
      case "azure":
        return translate("aiModels.video.provider.azure", "Azure Sora");
      case "gemini":
        return translate("aiModels.video.provider.gemini", "Gemini Veo");
      case "vertex":
        return translate("aiModels.video.provider.vertex", "Vertex AI Veo");
      case "kling":
        return translate("aiModels.video.provider.kling", "Kling");
      default:
        return provider;
    }
  };

  const renderImageTimeoutField = (
    value: string,
    onChange: (value: string) => void,
  ) => (
    <>
      <label className="settings-label" style={{ marginTop: "8px" }}>
        {translate(
          "aiModels.image.timeout.label",
          "Timeout before fallback (seconds)",
        )}
      </label>
      <input
        className="settings-input"
        type="number"
        min="30"
        max="1800"
        step="1"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <p className="settings-hint">
        {translate(
          "aiModels.image.timeout.hint",
          "The next image provider or deployment is tried only after this timeout.",
        )}
      </p>
    </>
  );

  const selectImageDefaultProvider = (provider: ImageGenProvider) => {
    setImageGenDefaultProvider(provider);
    const compatibleModel = getImageProviderModel(provider);
    if (imageGenDefaultModel && imageGenDefaultModel !== compatibleModel) {
      setImageGenDefaultModel(compatibleModel);
    }
  };

  const selectImageProviderTab = (provider: ImageProviderTab) => {
    if (provider === "auto") {
      setImageGenDefaultProvider("");
      setImageGenDefaultModel("");
      return;
    }
    selectImageDefaultProvider(provider);
  };

  const selectImageBackupProvider = (provider: ImageGenProvider | "") => {
    setImageGenBackupProvider(provider);
    if (!provider) return;
    const compatibleModel = getImageProviderModel(provider);
    if (imageGenBackupModel && imageGenBackupModel !== compatibleModel) {
      setImageGenBackupModel(compatibleModel);
    }
  };

  const activeVideoTab = videoDefaultProvider || "openai";

  const videoProviders = [
    {
      type: "openai" as const,
      name: "OpenAI Sora",
      icon: <CircleDot {...S} />,
    },
    { type: "azure" as const, name: "Azure Sora", icon: <Cloud {...S} /> },
    { type: "gemini" as const, name: "Gemini Veo", icon: <Star {...S} /> },
    {
      type: "vertex" as const,
      name: "Vertex AI Veo",
      icon: <Hexagon {...S} />,
    },
    { type: "kling" as const, name: "Kling", icon: <Zap {...S} /> },
  ];

  const renderImagePanel = () => (
    <div className="llm-provider-panel">
      <div className="llm-provider-header">
        <h2>{translate("aiModels.image.title", "Image Provider")}</h2>
        <p className="settings-description">
          {translate(
            "aiModels.image.description",
            "Choose which service to use for image generation. The selected provider will be used by the image creation tool.",
          )}
        </p>
      </div>
      <div className="llm-provider-tabs">
        {imageProviderTabs.map((provider) => (
          <button
            key={provider.type}
            type="button"
            className={`llm-provider-tab ${activeImageTab === provider.type ? "active" : ""}`}
            onClick={() => selectImageProviderTab(provider.type)}
          >
            {provider.icon}
            <span className="llm-provider-tab-label">
              {getImageProviderLabel(provider.type)}
            </span>
          </button>
        ))}
      </div>
      <div className="llm-provider-content">
        {activeImageTab === "auto" && (
          <div className="settings-section">
            <h3>
              {translate(
                "aiModels.image.auto.title",
                "Automatic Image Routing",
              )}
            </h3>
            <p className="settings-hint">{automaticImageRoutingDescription}</p>
            {currentProviderType === "openai" &&
              openaiAuthMethod === "oauth" && (
                <p className="settings-hint">
                  {translate(
                    "aiModels.image.auto.currentRoute",
                    "Current route: ChatGPT Subscription with gpt-image-2.",
                  )}
                </p>
              )}
            <p className="settings-hint">
              {translate(
                "aiModels.image.auto.pickSpecificHint",
                "Pick a specific provider tab only when you want image generation to ignore the AI Model provider.",
              )}
            </p>
          </div>
        )}

        {activeImageTab === "openai" && (
          <div className="settings-section">
            <h3>OpenAI GPT Image</h3>
            <p className="settings-hint">
              {translate(
                "aiModels.image.openai.description",
                "Optionally use a dedicated API key for image generation. Leave blank to reuse the OpenAI API key from AI Model.",
              )}
            </p>
            <label className="settings-label">
              {translate(
                "aiModels.image.apiKeyOptional",
                "API Key (image-specific, optional)",
              )}
            </label>
            <input
              className="settings-input"
              type="password"
              placeholder={translate(
                "aiModels.image.openai.apiKeyPlaceholder",
                "Leave blank to use the OpenAI API key",
              )}
              value={imageOpenAIApiKey}
              onChange={(e) => setImageOpenAIApiKey(e.target.value)}
            />
            <label className="settings-label">
              {translate("aiModels.common.defaultModel", "Default model")}
            </label>
            <select
              className="settings-select"
              value={imageOpenAIModel}
              onChange={(e) => {
                setImageOpenAIModel(e.target.value);
                setImageGenDefaultModel(
                  e.target.value === "gpt-image-2"
                    ? "gpt-image-2"
                    : "gpt-image-1.5",
                );
              }}
            >
              <option value="gpt-image-2">gpt-image-2</option>
              <option value="gpt-image-1.5">gpt-image-1.5</option>
              <option value="gpt-image-1">gpt-image-1</option>
              <option value="dall-e-3">dall-e-3</option>
              <option value="dall-e-2">dall-e-2</option>
            </select>
            {renderImageTimeoutField(
              imageOpenAITimeoutSeconds,
              setImageOpenAITimeoutSeconds,
            )}
          </div>
        )}

        {activeImageTab === "azure" && (
          <div className="settings-section">
            <h3>Azure OpenAI Image</h3>
            <p className="settings-hint">
              {translate(
                "aiModels.image.azure.description",
                "Optionally use a dedicated Azure resource for image generation. Leave credentials blank to reuse the Azure chat credentials from AI Model.",
              )}
            </p>
            <label className="settings-label">
              {translate(
                "aiModels.image.apiKeyOptional",
                "API Key (image-specific, optional)",
              )}
            </label>
            <input
              className="settings-input"
              type="password"
              placeholder={translate(
                "aiModels.image.azure.apiKeyPlaceholder",
                "Leave blank to use the Azure chat API key",
              )}
              value={imageAzureApiKey}
              onChange={(e) => setImageAzureApiKey(e.target.value)}
            />
            <label className="settings-label" style={{ marginTop: "8px" }}>
              {translate(
                "aiModels.image.endpointOptional",
                "Endpoint (image-specific, optional)",
              )}
            </label>
            <input
              className="settings-input"
              type="text"
              placeholder={translate(
                "aiModels.image.azure.endpointPlaceholder",
                "Leave blank to use the Azure chat endpoint",
              )}
              value={imageAzureEndpoint}
              onChange={(e) => setImageAzureEndpoint(e.target.value)}
            />
            <label className="settings-label" style={{ marginTop: "8px" }}>
              {translate(
                "aiModels.image.azure.deploymentName",
                "Image deployment name",
              )}
            </label>
            <input
              className="settings-input"
              type="text"
              placeholder="e.g. gpt-image-2"
              value={imageAzureDeployment}
              onChange={(e) => {
                setImageAzureDeployment(e.target.value);
                setImageGenDefaultModel(
                  e.target.value.trim().toLowerCase() === "gpt-image-2"
                    ? "gpt-image-2"
                    : "gpt-image-1.5",
                );
              }}
            />
            <label className="settings-label" style={{ marginTop: "8px" }}>
              {translate("aiModels.common.apiVersion", "API version")}
            </label>
            <input
              className="settings-input"
              type="text"
              placeholder="2024-02-15-preview"
              value={imageAzureApiVersion}
              onChange={(e) => setImageAzureApiVersion(e.target.value)}
            />
            {renderImageTimeoutField(
              imageAzureTimeoutSeconds,
              setImageAzureTimeoutSeconds,
            )}
          </div>
        )}

        {activeImageTab === "gemini" && (
          <div className="settings-section">
            <h3>Gemini Image</h3>
            <p className="settings-hint">
              {translate(
                "aiModels.image.gemini.description",
                "Optionally use a dedicated Gemini API key for image generation. Leave blank to reuse the Gemini API key from AI Model.",
              )}
            </p>
            <label className="settings-label">
              {translate(
                "aiModels.image.apiKeyOptional",
                "API Key (image-specific, optional)",
              )}
            </label>
            <input
              className="settings-input"
              type="password"
              placeholder={translate(
                "aiModels.image.gemini.apiKeyPlaceholder",
                "Leave blank to use the Gemini API key",
              )}
              value={imageGeminiApiKey}
              onChange={(e) => setImageGeminiApiKey(e.target.value)}
            />
            <label className="settings-label">
              {translate("aiModels.common.defaultModel", "Default model")}
            </label>
            <select
              className="settings-select"
              value={imageGeminiModel}
              onChange={(e) => {
                setImageGeminiModel(e.target.value as "nano-banana-2");
                setImageGenDefaultModel("nano-banana-2");
              }}
            >
              <option value="nano-banana-2">
                nano-banana-2 (Gemini 3.1 Flash Image)
              </option>
            </select>
            {renderImageTimeoutField(
              imageGeminiTimeoutSeconds,
              setImageGeminiTimeoutSeconds,
            )}
          </div>
        )}

        {activeImageTab === "openrouter" && (
          <div className="settings-section">
            <h3>OpenRouter Image</h3>
            <p className="settings-hint">
              {translate(
                "aiModels.image.openrouter.description",
                "Optionally use dedicated OpenRouter credentials for image generation. Leave blank to reuse OpenRouter settings from AI Model.",
              )}
            </p>
            <label className="settings-label">
              {translate(
                "aiModels.image.apiKeyOptional",
                "API Key (image-specific, optional)",
              )}
            </label>
            <input
              className="settings-input"
              type="password"
              placeholder={translate(
                "aiModels.image.openrouter.apiKeyPlaceholder",
                "Leave blank to use the OpenRouter API key",
              )}
              value={imageOpenRouterApiKey}
              onChange={(e) => setImageOpenRouterApiKey(e.target.value)}
            />
            <label className="settings-label" style={{ marginTop: "8px" }}>
              Base URL
            </label>
            <input
              className="settings-input"
              type="text"
              placeholder="https://openrouter.ai/api/v1"
              value={imageOpenRouterBaseUrl}
              onChange={(e) => setImageOpenRouterBaseUrl(e.target.value)}
            />
            <label className="settings-label">
              {translate("aiModels.common.defaultModel", "Default model")}
            </label>
            <input
              className="settings-input"
              type="text"
              placeholder="openai/gpt-image-2"
              value={imageOpenRouterModel}
              onChange={(e) => {
                setImageOpenRouterModel(e.target.value);
                setImageGenDefaultModel(
                  e.target.value.toLowerCase().includes("gpt-image-2")
                    ? "gpt-image-2"
                    : "gpt-image-1.5",
                );
              }}
            />
            {renderImageTimeoutField(
              imageOpenRouterTimeoutSeconds,
              setImageOpenRouterTimeoutSeconds,
            )}
          </div>
        )}

        {activeImageTab === "openai-codex" && (
          <div className="settings-section">
            <h3>
              {translate(
                "aiModels.image.openaiCodex.title",
                "ChatGPT Subscription Image",
              )}
            </h3>
            <p className="settings-hint">
              {translate(
                "aiModels.image.openaiCodex.description",
                "Uses the ChatGPT sign-in configured in AI Model.",
              )}
            </p>
            <label className="settings-label">
              {translate("aiModels.common.defaultModel", "Default model")}
            </label>
            <select
              className="settings-select"
              value={imageOpenAICodexModel}
              onChange={(e) => {
                setImageOpenAICodexModel(e.target.value);
                setImageGenDefaultModel("gpt-image-2");
              }}
            >
              <option value="gpt-image-2">gpt-image-2</option>
            </select>
            {renderImageTimeoutField(
              imageOpenAICodexTimeoutSeconds,
              setImageOpenAICodexTimeoutSeconds,
            )}
          </div>
        )}

        <div className="settings-section" style={{ marginTop: "16px" }}>
          <label className="settings-label">
            {translate("aiModels.common.fallbackProvider", "Fallback provider")}
          </label>
          <p className="settings-hint">
            {translate(
              "aiModels.common.fallbackProviderHint",
              "If the selected provider fails, fall back to this one.",
            )}
          </p>
          <select
            className="settings-select"
            value={imageGenBackupProvider}
            onChange={(e) =>
              selectImageBackupProvider(
                (e.target.value || "") as ImageGenProvider | "",
              )
            }
          >
            <option value="">
              {translate("aiModels.common.none", "None")}
            </option>
            {imageProviders.map((provider) => (
              <option key={provider.type} value={provider.type}>
                {getImageProviderLabel(provider.type)}
              </option>
            ))}
          </select>
          {imageGenBackupProvider && (
            <>
              <label className="settings-label" style={{ marginTop: "8px" }}>
                {translate("aiModels.common.fallbackModel", "Fallback model")}
              </label>
              <select
                className="settings-select"
                value={
                  imageGenBackupModel ===
                  getImageProviderModel(imageGenBackupProvider)
                    ? imageGenBackupModel
                    : ""
                }
                onChange={(e) =>
                  setImageGenBackupModel(
                    (e.target.value || "") as ImageGenModel | "",
                  )
                }
              >
                <option value="">
                  {translate(
                    "aiModels.common.autoRecommended",
                    "Auto (recommended)",
                  )}
                </option>
                <option value={getImageProviderModel(imageGenBackupProvider)}>
                  {getImageModelLabel(
                    getImageProviderModel(imageGenBackupProvider),
                  )}
                </option>
              </select>
            </>
          )}
        </div>

        {renderModelSettingsActions()}
      </div>
    </div>
  );

  const renderVideoPanel = () => (
    <div className="llm-provider-panel">
      <div className="llm-provider-header">
        <h2>{translate("aiModels.video.title", "Video Provider")}</h2>
        <p className="settings-description">
          {translate(
            "aiModels.video.description",
            "Choose which service to use for video generation. The selected provider will be used by the video creation tool.",
          )}
        </p>
      </div>
      <div className="llm-provider-tabs">
        {videoProviders.map((vp) => (
          <button
            key={vp.type}
            type="button"
            className={`llm-provider-tab ${activeVideoTab === vp.type ? "active" : ""}`}
            onClick={() => setVideoDefaultProvider(vp.type)}
          >
            {vp.icon}
            <span className="llm-provider-tab-label">
              {getVideoProviderLabel(vp.type)}
            </span>
          </button>
        ))}
      </div>
      <div className="llm-provider-content">
        {activeVideoTab === "openai" && (
          <div className="settings-section">
            <h3>OpenAI Sora 2</h3>
            <p className="settings-hint">
              {translate(
                "aiModels.video.openai.description",
                "Uses the OpenAI API key configured in AI Model. Supports text-to-video and image-to-video.",
              )}
            </p>
            <label className="settings-label">
              {translate("aiModels.common.defaultModel", "Default model")}
            </label>
            <select
              className="settings-select"
              value={videoOpenAIModel}
              onChange={(e) => setVideoOpenAIModel(e.target.value)}
            >
              <option value="sora-2">sora-2</option>
              <option value="sora-2-pro">sora-2-pro</option>
            </select>
            <label className="settings-label" style={{ marginTop: "8px" }}>
              {translate(
                "aiModels.video.defaultDuration",
                "Default duration (seconds)",
              )}
            </label>
            <input
              className="settings-input"
              type="number"
              min={1}
              max={20}
              value={videoOpenAIDuration}
              onChange={(e) => setVideoOpenAIDuration(e.target.value)}
            />
            <label className="settings-label" style={{ marginTop: "8px" }}>
              {translate(
                "aiModels.video.defaultAspectRatio",
                "Default aspect ratio",
              )}
            </label>
            <select
              className="settings-select"
              value={videoOpenAIAspectRatio}
              onChange={(e) => setVideoOpenAIAspectRatio(e.target.value)}
            >
              <option value="16:9">
                {translate(
                  "aiModels.video.aspect.landscape",
                  "16:9 (landscape)",
                )}
              </option>
              <option value="9:16">
                {translate("aiModels.video.aspect.portrait", "9:16 (portrait)")}
              </option>
              <option value="1:1">
                {translate("aiModels.video.aspect.square", "1:1 (square)")}
              </option>
            </select>
            <label className="settings-label" style={{ marginTop: "8px" }}>
              {translate(
                "aiModels.video.defaultResolution",
                "Default resolution",
              )}
            </label>
            <select
              className="settings-select"
              value={videoOpenAIResolution}
              onChange={(e) => setVideoOpenAIResolution(e.target.value)}
            >
              <option value="480p">480p</option>
              <option value="720p">720p</option>
              <option value="1080p">1080p</option>
            </select>
          </div>
        )}

        {activeVideoTab === "azure" && (
          <div className="settings-section">
            <h3>Azure OpenAI Sora 2</h3>
            <p className="settings-hint">
              {translate(
                "aiModels.video.azure.description",
                "Optionally use a dedicated API key and endpoint for video (e.g. a different Azure resource). Leave blank to reuse the Azure chat credentials from AI Model.",
              )}
            </p>
            <label className="settings-label">
              {translate(
                "aiModels.video.apiKeyOptional",
                "API Key (video-specific, optional)",
              )}
            </label>
            <input
              className="settings-input"
              type="password"
              placeholder={translate(
                "aiModels.video.azure.apiKeyPlaceholder",
                "Leave blank to use the Azure chat API key",
              )}
              value={videoAzureApiKey}
              onChange={(e) => setVideoAzureApiKey(e.target.value)}
            />
            <label className="settings-label" style={{ marginTop: "8px" }}>
              {translate(
                "aiModels.video.endpointOptional",
                "Endpoint (video-specific, optional)",
              )}
            </label>
            <input
              className="settings-input"
              type="text"
              placeholder={translate(
                "aiModels.video.azure.endpointPlaceholder",
                "Leave blank to use the Azure chat endpoint",
              )}
              value={videoAzureEndpoint}
              onChange={(e) => setVideoAzureEndpoint(e.target.value)}
            />
            <label className="settings-label" style={{ marginTop: "8px" }}>
              {translate(
                "aiModels.video.azure.deploymentName",
                "Sora deployment name",
              )}
            </label>
            <input
              className="settings-input"
              type="text"
              placeholder="e.g. sora"
              value={videoAzureDeployment}
              onChange={(e) => setVideoAzureDeployment(e.target.value)}
            />
            <label className="settings-label" style={{ marginTop: "8px" }}>
              {translate("aiModels.common.apiVersion", "API version")}
            </label>
            <input
              className="settings-input"
              type="text"
              placeholder="preview"
              value={videoAzureApiVersion}
              onChange={(e) => setVideoAzureApiVersion(e.target.value)}
            />
            <label className="settings-label" style={{ marginTop: "8px" }}>
              {translate(
                "aiModels.video.defaultDuration",
                "Default duration (seconds)",
              )}
            </label>
            <input
              className="settings-input"
              type="number"
              min={1}
              max={20}
              value={videoAzureDuration}
              onChange={(e) => setVideoAzureDuration(e.target.value)}
            />
            <label className="settings-label" style={{ marginTop: "8px" }}>
              {translate(
                "aiModels.video.defaultAspectRatio",
                "Default aspect ratio",
              )}
            </label>
            <select
              className="settings-select"
              value={videoAzureAspectRatio}
              onChange={(e) => setVideoAzureAspectRatio(e.target.value)}
            >
              <option value="16:9">
                {translate(
                  "aiModels.video.aspect.landscape",
                  "16:9 (landscape)",
                )}
              </option>
              <option value="9:16">
                {translate("aiModels.video.aspect.portrait", "9:16 (portrait)")}
              </option>
              <option value="1:1">
                {translate("aiModels.video.aspect.square", "1:1 (square)")}
              </option>
            </select>
          </div>
        )}

        {activeVideoTab === "gemini" && (
          <div className="settings-section">
            <h3>Gemini Veo 3.1</h3>
            <p className="settings-hint">
              {translate(
                "aiModels.video.gemini.description",
                "Uses the Gemini API key configured in AI Model. Supports text-to-video and image-to-video via long-running operations.",
              )}
            </p>
            <label className="settings-label">
              {translate("aiModels.common.defaultModel", "Default model")}
            </label>
            <select
              className="settings-select"
              value={videoGeminiModel}
              onChange={(e) =>
                setVideoGeminiModel(
                  e.target.value as
                    "veo-3.1" | "veo-3.1-fast-preview" | "veo-3.0",
                )
              }
            >
              <option value="veo-3.1">
                {translate(
                  "aiModels.video.gemini.standard",
                  "Veo 3.1 (standard)",
                )}
              </option>
              <option value="veo-3.1-fast-preview">Veo 3.1 Fast Preview</option>
              <option value="veo-3.0">Veo 3.0</option>
            </select>
            <label className="settings-label" style={{ marginTop: "8px" }}>
              {translate(
                "aiModels.video.defaultDuration",
                "Default duration (seconds)",
              )}
            </label>
            <input
              className="settings-input"
              type="number"
              min={1}
              max={30}
              value={videoGeminiDuration}
              onChange={(e) => setVideoGeminiDuration(e.target.value)}
            />
            <label className="settings-label" style={{ marginTop: "8px" }}>
              {translate(
                "aiModels.video.defaultAspectRatio",
                "Default aspect ratio",
              )}
            </label>
            <select
              className="settings-select"
              value={videoGeminiAspectRatio}
              onChange={(e) => setVideoGeminiAspectRatio(e.target.value)}
            >
              <option value="16:9">
                {translate(
                  "aiModels.video.aspect.landscape",
                  "16:9 (landscape)",
                )}
              </option>
              <option value="9:16">
                {translate("aiModels.video.aspect.portrait", "9:16 (portrait)")}
              </option>
              <option value="1:1">
                {translate("aiModels.video.aspect.square", "1:1 (square)")}
              </option>
            </select>
          </div>
        )}

        {activeVideoTab === "vertex" && (
          <div className="settings-section">
            <h3>Vertex AI Veo 3 / 3.1</h3>
            <p className="settings-hint">
              {translate(
                "aiModels.video.vertex.description",
                "Requires a Google Cloud project, location, and an access token. Output can be saved to a GCS bucket.",
              )}
            </p>
            <label className="settings-label">
              {translate("aiModels.common.model", "Model")}
            </label>
            <select
              className="settings-select"
              value={videoVertexModel}
              onChange={(e) =>
                setVideoVertexModel(e.target.value as "veo-3" | "veo-3.1")
              }
            >
              <option value="veo-3">Veo 3</option>
              <option value="veo-3.1">Veo 3.1</option>
            </select>
            <label className="settings-label" style={{ marginTop: "8px" }}>
              GCP Project ID
            </label>
            <input
              className="settings-input"
              type="text"
              placeholder="my-project-id"
              value={videoVertexProjectId}
              onChange={(e) => setVideoVertexProjectId(e.target.value)}
            />
            <label className="settings-label" style={{ marginTop: "8px" }}>
              {translate("aiModels.video.vertex.location", "Location")}
            </label>
            <input
              className="settings-input"
              type="text"
              placeholder="us-central1"
              value={videoVertexLocation}
              onChange={(e) => setVideoVertexLocation(e.target.value)}
            />
            <label className="settings-label" style={{ marginTop: "8px" }}>
              {translate(
                "aiModels.video.vertex.outputGcsUri",
                "Output GCS URI (optional)",
              )}
            </label>
            <input
              className="settings-input"
              type="text"
              placeholder="gs://my-bucket/videos/"
              value={videoVertexOutputGcsUri}
              onChange={(e) => setVideoVertexOutputGcsUri(e.target.value)}
            />
            <label className="settings-label" style={{ marginTop: "8px" }}>
              {translate("aiModels.video.vertex.accessToken", "Access Token")}
            </label>
            <p
              className="settings-hint"
              style={{
                marginBottom: "4px",
                color: "var(--color-warning, #b45309)",
              }}
            >
              {translate(
                "aiModels.video.vertex.tokenHint",
                "OAuth access tokens expire in ~1 hour. Re-paste a fresh token when generation fails. For long-running use, consider a service account key instead.",
              )}
            </p>
            <input
              className="settings-input"
              type="password"
              placeholder="ya29...."
              value={videoVertexAccessToken}
              onChange={(e) => setVideoVertexAccessToken(e.target.value)}
            />
            <label className="settings-label" style={{ marginTop: "8px" }}>
              {translate(
                "aiModels.video.defaultDuration",
                "Default duration (seconds)",
              )}
            </label>
            <input
              className="settings-input"
              type="number"
              min={1}
              max={30}
              value={videoVertexDuration}
              onChange={(e) => setVideoVertexDuration(e.target.value)}
            />
            <label className="settings-label" style={{ marginTop: "8px" }}>
              {translate(
                "aiModels.video.defaultAspectRatio",
                "Default aspect ratio",
              )}
            </label>
            <select
              className="settings-select"
              value={videoVertexAspectRatio}
              onChange={(e) => setVideoVertexAspectRatio(e.target.value)}
            >
              <option value="16:9">
                {translate(
                  "aiModels.video.aspect.landscape",
                  "16:9 (landscape)",
                )}
              </option>
              <option value="9:16">
                {translate("aiModels.video.aspect.portrait", "9:16 (portrait)")}
              </option>
              <option value="1:1">
                {translate("aiModels.video.aspect.square", "1:1 (square)")}
              </option>
            </select>
          </div>
        )}

        {activeVideoTab === "kling" && (
          <div className="settings-section">
            <h3>Kling</h3>
            <p className="settings-hint">
              {translate(
                "aiModels.video.kling.description",
                "Dedicated Kling API key. Supports text-to-video and image-to-video.",
              )}
            </p>
            <label className="settings-label">
              {translate("aiModels.common.apiKey", "API Key")}
            </label>
            <input
              className="settings-input"
              type="password"
              placeholder={translate(
                "aiModels.video.kling.apiKeyPlaceholder",
                "Enter Kling API key",
              )}
              value={videoKlingApiKey}
              onChange={(e) => setVideoKlingApiKey(e.target.value)}
            />
            <label className="settings-label" style={{ marginTop: "8px" }}>
              Base URL
            </label>
            <input
              className="settings-input"
              type="text"
              placeholder="https://api.klingai.com"
              value={videoKlingBaseUrl}
              onChange={(e) => setVideoKlingBaseUrl(e.target.value)}
            />
            <label className="settings-label" style={{ marginTop: "8px" }}>
              {translate("aiModels.common.model", "Model")}
            </label>
            <input
              className="settings-input"
              type="text"
              placeholder="kling-v2"
              value={videoKlingModel}
              onChange={(e) => setVideoKlingModel(e.target.value)}
            />
            <label className="settings-label" style={{ marginTop: "8px" }}>
              {translate(
                "aiModels.video.defaultDuration",
                "Default duration (seconds)",
              )}
            </label>
            <input
              className="settings-input"
              type="number"
              min={1}
              max={60}
              value={videoKlingDuration}
              onChange={(e) => setVideoKlingDuration(e.target.value)}
            />
            <label className="settings-label" style={{ marginTop: "8px" }}>
              {translate(
                "aiModels.video.defaultAspectRatio",
                "Default aspect ratio",
              )}
            </label>
            <select
              className="settings-select"
              value={videoKlingAspectRatio}
              onChange={(e) => setVideoKlingAspectRatio(e.target.value)}
            >
              <option value="16:9">
                {translate(
                  "aiModels.video.aspect.landscape",
                  "16:9 (landscape)",
                )}
              </option>
              <option value="9:16">
                {translate("aiModels.video.aspect.portrait", "9:16 (portrait)")}
              </option>
              <option value="1:1">
                {translate("aiModels.video.aspect.square", "1:1 (square)")}
              </option>
            </select>
          </div>
        )}

        {/* Fallback provider */}
        <div className="settings-section" style={{ marginTop: "16px" }}>
          <label className="settings-label">
            {translate("aiModels.common.fallbackProvider", "Fallback provider")}
          </label>
          <p className="settings-hint">
            {translate(
              "aiModels.common.fallbackProviderHint",
              "If the selected provider fails, fall back to this one.",
            )}
          </p>
          <select
            className="settings-select"
            value={videoFallbackProvider}
            onChange={(e) =>
              setVideoFallbackProvider(
                (e.target.value || "") as
                  "openai" | "azure" | "gemini" | "vertex" | "kling" | "",
              )
            }
          >
            <option value="">
              {translate("aiModels.common.none", "None")}
            </option>
            <option value="openai">
              {translate(
                "aiModels.video.provider.openaiSora2",
                "OpenAI Sora 2",
              )}
            </option>
            <option value="azure">
              {translate(
                "aiModels.video.provider.azureSora2",
                "Azure OpenAI Sora 2",
              )}
            </option>
            <option value="gemini">
              {translate(
                "aiModels.video.provider.geminiVeo31",
                "Gemini Veo 3.1",
              )}
            </option>
            <option value="vertex">
              {translate("aiModels.video.provider.vertexVeo", "Vertex AI Veo")}
            </option>
            <option value="kling">
              {translate("aiModels.video.provider.kling", "Kling")}
            </option>
          </select>
        </div>

        {renderModelSettingsActions()}
      </div>
    </div>
  );

  const renderMoaSlotEditor = (
    presetId: string,
    slot: MoaModelSlot,
    slotKind: "aggregator" | "reference",
    referenceIndex?: number,
  ) => {
    const modelOptions = getMoaModelOptions(slot.providerType, slot.modelKey);
    const updateSlot = (patch: Partial<MoaModelSlot>) => {
      if (slotKind === "aggregator") {
        updateMoaPreset(presetId, (preset) => ({
          ...preset,
          aggregator: { ...preset.aggregator, ...patch },
        }));
      } else if (typeof referenceIndex === "number") {
        updateMoaReference(presetId, referenceIndex, patch);
      }
    };

    return (
      <div
        className="settings-section"
        style={{ marginTop: "10px", padding: "12px" }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(120px, 180px) minmax(180px, 1fr)",
            gap: "10px",
          }}
        >
          <div>
            <label className="settings-label">
              {translate("aiModels.common.provider", "Provider")}
            </label>
            <select
              className="settings-select"
              value={slot.providerType}
              onChange={(event) =>
                updateMoaSlotProvider(
                  presetId,
                  slotKind,
                  event.target.value as LLMProviderType,
                  referenceIndex,
                )
              }
            >
              {moaProviderOptions.map((provider) => (
                <option key={provider.type} value={provider.type}>
                  {translate(
                    `aiModels.providerName.${provider.type}`,
                    provider.name,
                  )}
                  {provider.configured
                    ? ""
                    : ` ${translate("aiModels.provider.notConfiguredSuffix", "(not configured)")}`}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="settings-label">
              {translate("aiModels.common.model", "Model")}
            </label>
            {modelOptions.length > 0 ? (
              <SearchableSelect
                options={modelOptions.map((model) => ({
                  value: model.key,
                  label: model.displayName,
                }))}
                value={slot.modelKey}
                onChange={(modelKey) => updateSlot({ modelKey })}
                placeholder={translate(
                  "aiModels.common.selectModel",
                  "Select a model...",
                )}
              />
            ) : (
              <input
                className="settings-input"
                value={slot.modelKey}
                onChange={(event) =>
                  updateSlot({ modelKey: event.target.value })
                }
                placeholder={translate(
                  "aiModels.common.modelIdPlaceholder",
                  "model-id",
                )}
              />
            )}
          </div>
        </div>
        <label className="settings-label" style={{ marginTop: "10px" }}>
          {translate("aiModels.moa.roleInstruction", "Role instruction")}
        </label>
        <textarea
          className="settings-input"
          rows={2}
          value={slot.roleInstruction || ""}
          onChange={(event) =>
            updateSlot({ roleInstruction: event.target.value })
          }
          placeholder={
            slotKind === "aggregator"
              ? translate(
                  "aiModels.moa.aggregationPlaceholder",
                  "Optional aggregation guidance",
                )
              : translate(
                  "aiModels.moa.advisorFocusPlaceholder",
                  "Optional advisor focus",
                )
          }
        />
        {slotKind === "reference" && (
          <div style={{ marginTop: "10px", maxWidth: "220px" }}>
            <label className="settings-label">
              {translate("aiModels.moa.maxAdvisorTokens", "Max advisor tokens")}
            </label>
            <input
              className="settings-input"
              type="number"
              min={64}
              max={8192}
              value={slot.maxTokens || ""}
              onChange={(event) =>
                updateSlot({
                  maxTokens: event.target.value
                    ? Number(event.target.value)
                    : undefined,
                })
              }
              placeholder={translate(
                "aiModels.moa.presetDefault",
                "Preset default",
              )}
            />
          </div>
        )}
      </div>
    );
  };

  const renderLLMPanel = () => {
    const addedProviders = providers.filter((provider) => {
      const providerType = provider.type as LLMProviderType;
      return shouldShowProviderInModelConsole(providerType);
    });
    const modelAddProviderOptions = MODEL_ADD_PROVIDER_ORDER.map(
      (providerType) =>
        providers.find(
          (provider) =>
            resolveCustomProviderId(provider.type as LLMProviderType) ===
            providerType,
        ) ||
        (providerType === "openai-compatible"
          ? ({
              type: "openai-compatible",
              name: translate(
                "generated.components.settings.7757.4",
                "Customize",
              ),
              configured: false,
            } satisfies ProviderInfo)
          : undefined),
    ).filter(Boolean) as ProviderInfo[];
    const getOpenAICompatibleDisplayName = () =>
      openaiCompatDisplayName.trim() ||
      openaiCompatModel.trim() ||
      translate("generated.components.settings.7763.5", "Customize");
    const getModelAddProviderLabel = (provider?: ProviderInfo): string => {
      if (!provider)
        return translate("generated.components.settings.7765.6", "Customize");
      const providerType = provider.type as LLMProviderType;
      const resolvedType = resolveCustomProviderId(providerType);
      if (resolvedType === "openai-compatible") {
        return getOpenAICompatibleDisplayName();
      }
      return (
        MODEL_ADD_PROVIDER_LABEL_OVERRIDES[resolvedType] ||
        translate(`aiModels.providerName.${provider.type}`, provider.name)
      );
    };
    const normalizedModelProviderSearch = modelProviderSearch
      .trim()
      .toLocaleLowerCase();
    const filteredModelAddProviderOptions = normalizedModelProviderSearch
      ? modelAddProviderOptions.filter((provider) =>
          getModelAddProviderLabel(provider)
            .toLocaleLowerCase()
            .includes(normalizedModelProviderSearch),
        )
      : modelAddProviderOptions;
    const selectedProvider =
      modelAddProviderOptions.find(
        (provider) => provider.type === addModelProviderType,
      ) ||
      modelAddProviderOptions.find(
        (provider) => provider.type === settings.providerType,
      ) ||
      modelAddProviderOptions[0] ||
      providers[0];
    const selectedProviderType = (selectedProvider?.type ||
      settings.providerType ||
      "gemini") as LLMProviderType;
    const selectedProviderLabel = getModelAddProviderLabel(selectedProvider);
    const apiKeyCount = [
      anthropicApiKey || anthropicSubscriptionToken,
      geminiApiKey,
      openrouterApiKey,
      openaiApiKey || (openaiOAuthConnected ? "oauth" : ""),
      azureApiKey,
      azureAnthropicApiKey,
      groqApiKey,
      xaiApiKey || (xaiOAuthConnected ? "oauth" : ""),
      deepseekApiKey,
      kimiApiKey,
      piApiKey,
      openaiCompatApiKey,
      ollamaApiKey,
      awsAccessKeyId && awsSecretAccessKey ? "aws" : "",
      ...Object.values(customProviders).map(
        (provider) => provider.apiKey || "",
      ),
    ].filter(Boolean).length;
    const getProviderApiKeyCount = (providerType: LLMProviderType) => {
      const value = getProviderApiKey(providerType).trim();
      if (!value) return 0;
      return value.split(/[\n,]+/).filter((item) => item.trim().length > 0)
        .length;
    };
    const activeProviderLabel =
      settings.providerType === "openai-compatible"
        ? getOpenAICompatibleDisplayName()
        : translate(
            `aiModels.providerName.${settings.providerType}`,
            providers.find(
              (provider) => provider.type === settings.providerType,
            )?.name || settings.providerType,
          );
    const activeProviderModel = getProviderPrimaryModel(settings.providerType);
    const configuredModelCount = addedProviders.reduce((count, provider) => {
      const providerType = provider.type as LLMProviderType;
      return (
        count +
        getProviderSavedConfiguredModels(providerType).filter((modelName) =>
          isProviderModelEnabled(providerType, modelName),
        ).length
      );
    }, 0);
    const totalUsageCalls = modelUsage?.llmSummary?.totalLlmCalls || 0;
    const totalUsageTokens =
      (modelUsage?.llmSummary?.totalInputTokens || 0) +
      (modelUsage?.llmSummary?.totalOutputTokens || 0);
    const modelUsageRows = modelUsage?.costMetrics?.costByModel || [];
    const providerUsageRows = modelUsage?.providerBreakdown || [];
    const providerUsageByType = new Map(
      providerUsageRows.map((row) => [
        normalizeUsageLookupKey(row.provider),
        row,
      ]),
    );
    const metricCards = [
      {
        value: configuredModelCount,
        label: translate(
          "generated.components.settings.7858.7",
          "Configured model",
        ),
        highlighted: true,
      },
      {
        value: addedProviders.length,
        label: translate(
          "generated.components.settings.7863.8",
          "Platform added",
        ),
        highlighted: true,
      },
      {
        value: activeProviderLabel,
        label: translate(
          "generated.components.settings.7868.9",
          "Current service provider",
        ),
      },
      {
        value: activeProviderModel || "-",
        label: translate(
          "generated.components.settings.7872.10",
          "current model",
        ),
      },
      {
        value: apiKeyCount,
        label: "API Key",
      },
      {
        value: totalUsageCalls,
        label: translate("generated.components.settings.7880.11", "real call"),
      },
    ];
    const metricDescriptions: Record<string, string> = {
      已配置模型: translate(
        "generated.components.settings.7884.12",
        "Models whose credentials have been saved and added to the current list",
      ),
      已添加平台: translate(
        "generated.components.settings.7885.13",
        "Number of platforms that have saved credentials and added models",
      ),
      当前服务商: translate(
        "generated.components.settings.7886.14",
        "Default for agent and tool calls",
      ),
      当前模型: translate(
        "generated.components.settings.7887.15",
        "The default model under the current service provider",
      ),
      "API Key": translate(
        "generated.components.settings.7888.16",
        "Number of saved provider credentials",
      ),
      真实调用: translate(
        "generated.components.settings.7889.17",
        "From local usage records",
      ),
    };
    const activityValues = (() => {
      if (modelUsageMode === "daily") {
        return modelUsageDays.map((day) => day.inputTokens + day.outputTokens);
      }

      if (modelUsageMode === "cumulative") {
        let total = 0;
        return modelUsageDays.map((day) => {
          total += day.inputTokens + day.outputTokens;
          return total;
        });
      }

      const totalsByWeek = new Map<string, number>();
      for (const day of modelUsageDays) {
        const key = getWeekStartDateKey(day.dateKey);
        totalsByWeek.set(
          key,
          (totalsByWeek.get(key) || 0) + day.inputTokens + day.outputTokens,
        );
      }
      return modelUsageDays.map((day) => {
        return totalsByWeek.get(getWeekStartDateKey(day.dateKey)) || 0;
      });
    })();
    const hasUsageActivity =
      activityValues.some((value) => value > 0) ||
      modelUsageDays.some((day) => (day.llmCalls || 0) > 0);
    const getModelDailyUsage = (modelName: string): ModelUsageDay[] => {
      const cached = modelDailyUsageCache.get(modelName);
      if (cached) return cached;
      const modelDaysByName = modelUsage?.modelRequestsByDay || {};
      const matchedRows = Object.entries(modelDaysByName).filter(
        ([storedModel]) => modelUsageMatches(storedModel, modelName),
      );
      const totalsByDate = new Map<string, ModelUsageDay>();

      for (const [, rows] of matchedRows) {
        for (const row of rows) {
          const current = totalsByDate.get(row.dateKey) || {
            dateKey: row.dateKey,
            llmCalls: 0,
            cost: 0,
            inputTokens: 0,
            outputTokens: 0,
            cachedTokens: 0,
          };
          current.llmCalls = (current.llmCalls || 0) + (row.llmCalls || 0);
          current.cost = (current.cost || 0) + (row.cost || 0);
          current.inputTokens += row.inputTokens || 0;
          current.outputTokens += row.outputTokens || 0;
          current.cachedTokens =
            (current.cachedTokens || 0) + (row.cachedTokens || 0);
          totalsByDate.set(row.dateKey, current);
        }
      }

      const days = modelUsageDays.map((day) => {
        return (
          totalsByDate.get(day.dateKey) || {
            dateKey: day.dateKey,
            llmCalls: 0,
            cost: 0,
            inputTokens: 0,
            outputTokens: 0,
            cachedTokens: 0,
          }
        );
      });
      modelDailyUsageCache.set(modelName, days);
      return days;
    };
    const getUsageStreaks = (days: ModelUsageDay[]) => {
      let currentStreak = 0;
      let longestStreak = 0;
      let run = 0;

      for (const day of days) {
        if ((day.llmCalls || 0) > 0) {
          run += 1;
          longestStreak = Math.max(longestStreak, run);
        } else {
          run = 0;
        }
      }

      for (let index = days.length - 1; index >= 0; index -= 1) {
        if ((days[index].llmCalls || 0) <= 0) break;
        currentStreak += 1;
      }

      return {
        activeDays: days.filter((day) => (day.llmCalls || 0) > 0).length,
        currentStreak,
        longestStreak,
      };
    };
    const showLegacyProviderConfig = false;

    const getModelCatalogForAdd = (
      providerType: LLMProviderType,
    ): ModelOption[] => {
      const resolvedType = resolveCustomProviderId(providerType);
      const customEntry = CUSTOM_PROVIDER_MAP.get(resolvedType);
      if (customEntry) {
        return (customProviders[resolvedType]?.cachedModels || []).map(
          (model) => ({
            key: model.key,
            displayName: model.displayName || model.key,
          }),
        );
      }

      switch (resolvedType) {
        case "anthropic":
          return models;
        case "openai":
          return openaiModels.map((model) => ({
            key: model.id,
            displayName: model.name || model.id,
          }));
        case "gemini":
          return geminiModels.map((model) => ({
            key: model.name,
            displayName: model.displayName || model.name,
          }));
        case "openrouter":
          return openrouterModels.map((model) => ({
            key: model.id,
            displayName: model.name || model.id,
          }));
        case "xai":
          return xaiModels.map((model) => ({
            key: model.id,
            displayName: model.name || model.id,
          }));
        case "deepseek":
          return deepseekModels.map((model) => ({
            key: model.id,
            displayName: model.name || model.id,
          }));
        case "kimi":
          return kimiModels.map((model) => ({
            key: model.id,
            displayName: model.name || model.id,
          }));
        case "openai-compatible":
          return openaiCompatModels.map((model) => ({
            key: model.key,
            displayName: model.displayName || model.key,
          }));
        default:
          return providerModelOptionsByType[resolvedType] || [];
      }
    };

    const isModelCatalogLoading = (providerType: LLMProviderType): boolean => {
      const resolvedType = resolveCustomProviderId(providerType);
      if (CUSTOM_PROVIDER_MAP.has(resolvedType)) {
        return loadingCustomProviderModels;
      }
      switch (resolvedType) {
        case "anthropic":
          return loadingClaudeModels;
        case "openai":
          return loadingOpenAIModels;
        case "gemini":
          return loadingGeminiModels;
        case "openrouter":
          return loadingOpenRouterModels;
        case "xai":
          return loadingXaiModels;
        case "deepseek":
          return loadingDeepseekModels;
        case "kimi":
          return loadingKimiModels;
        case "openai-compatible":
          return loadingOpenAICompatModels;
        default:
          return false;
      }
    };

    const loadModelCatalogForAdd = async (
      providerType: LLMProviderType,
    ): Promise<void> => {
      const resolvedType = resolveCustomProviderId(providerType);
      if (CUSTOM_PROVIDER_MAP.has(resolvedType)) {
        await loadCustomProviderModels(providerType);
        return;
      }

      switch (resolvedType) {
        case "anthropic":
          await loadClaudeModels(getProviderPrimaryModel(providerType));
          return;
        case "openai":
          await loadOpenAIModels();
          return;
        case "gemini":
          await loadGeminiModels();
          return;
        case "openrouter":
          await loadOpenRouterModels();
          return;
        case "xai":
          await loadXAIModels();
          return;
        case "deepseek":
          await loadDeepSeekModels();
          return;
        case "kimi":
          await loadKimiModels();
          return;
        case "openai-compatible":
          await loadOpenAICompatibleModels();
          return;
        default:
          await loadProviderModelsForType(providerType);
      }
    };

    const openAddModelModal = (providerType?: LLMProviderType) => {
      const resolvedProviderType = providerType
        ? resolveCustomProviderId(providerType)
        : undefined;
      const nextProviderType = (
        providerType &&
        resolvedProviderType &&
        MODEL_ADD_PROVIDER_TYPE_SET.has(resolvedProviderType)
          ? providerType
          : "openai-compatible"
      ) as LLMProviderType;
      setAddModelProviderType(nextProviderType);
      const primaryModel = getProviderPrimaryModel(nextProviderType).trim();
      const configuredModels = getProviderSavedConfiguredModels(
        nextProviderType,
        settingsRef.current,
      );
      setSelectedModelsForAdd(
        configuredModels.length > 0
          ? configuredModels
          : primaryModel
            ? [primaryModel]
            : [],
      );
      setModelProviderSearch("");
      setAddModelModalOpen(true);
      void loadModelCatalogForAdd(nextProviderType);
    };

    const confirmAddModel = async () => {
      if (
        selectedProviderType === "openai-compatible" &&
        !openaiCompatDisplayName.trim()
      ) {
        setTestResult({
          success: false,
          error: translate(
            "generated.components.settings.8137.18",
            "Please fill in the model supplier name",
          ),
        });
        return;
      }
      const currentPrimaryModel = getProviderPrimaryModel(selectedProviderType);
      const modelKeys = normalizeProviderModelNames(
        selectedModelsForAdd.length > 0
          ? selectedModelsForAdd
          : [currentPrimaryModel],
      );
      const nextPrimaryModel = modelKeys.includes(currentPrimaryModel)
        ? currentPrimaryModel
        : modelKeys[0] || "";
      let nextSettings = replaceProviderModelsInRegistry(
        {
          ...settingsRef.current,
          providerType: selectedProviderType,
        },
        selectedProviderType,
        modelKeys,
      );
      nextSettings = writeProviderPrimaryModelSetting(
        nextSettings,
        selectedProviderType,
        nextPrimaryModel,
      );
      settingsRef.current = nextSettings;
      setSettings(nextSettings);
      setProviderPrimaryModel(selectedProviderType, nextPrimaryModel);
      const saved = await handleSave({
        stayOnPage: true,
        selectedModel: {
          providerType: selectedProviderType,
          modelName: nextPrimaryModel,
        },
      });
      if (!saved) return;
      setSelectedModelsForAdd([]);
      setAddModelModalOpen(false);
    };

    const selectProviderForModelAdd = (providerType: LLMProviderType) => {
      setAddModelProviderType(providerType);
      const primaryModel = getProviderPrimaryModel(providerType).trim();
      const configuredModels = getProviderSavedConfiguredModels(
        providerType,
        settingsRef.current,
      );
      setSelectedModelsForAdd(
        configuredModels.length > 0
          ? configuredModels
          : primaryModel
            ? [primaryModel]
            : [],
      );
      void loadModelCatalogForAdd(providerType);
    };

    const confirmDeleteProviderModels = async (
      providerType: LLMProviderType,
    ) => {
      setDeleteProviderConfirm(null);
      const resolvedProviderType = resolveCustomProviderId(providerType);
      const wasCurrentProvider =
        resolveCustomProviderId(
          settingsRef.current.providerType as LLMProviderType,
        ) === resolvedProviderType;
      const fallbackProviderType = providers.find(
        (provider) =>
          shouldShowProviderInModelConsole(
            provider.type as LLMProviderType,
            settingsRef.current,
          ) &&
          resolveCustomProviderId(provider.type as LLMProviderType) !==
            resolvedProviderType,
      )?.type as LLMProviderType | undefined;
      let nextSettings = writeProviderModelRegistryEntry(
        clearProviderSettingsState(settingsRef.current, providerType),
        providerType,
        undefined,
      );
      if (wasCurrentProvider) {
        nextSettings = {
          ...nextSettings,
          providerType:
            fallbackProviderType ||
            (resolvedProviderType === "anthropic" ? "gemini" : "anthropic"),
        };
      }
      settingsRef.current = nextSettings;
      setSettings(nextSettings);
      clearProviderFormState(providerType);

      try {
        setResettingCredentials(true);
        setTestResult(null);
        await window.electronAPI.saveLLMSettings({
          ...nextSettings,
          providerType: nextSettings.providerType,
          modelKey: nextSettings.modelKey || "",
          customProviders: nextSettings.customProviders || {},
          providerModelRegistry: nextSettings.providerModelRegistry || {},
        } as LLMSettingsData);
        await loadConfigStatus();
        onSettingsChanged?.();
      } catch (error: Any) {
        console.error("Failed to delete provider models:", error);
        setTestResult({
          success: false,
          error:
            error?.message ||
            translate(
              "generated.components.settings.8221.19",
              "Failed to delete model",
            ),
        });
      } finally {
        setResettingCredentials(false);
      }
    };

    const confirmDeleteModel = (
      providerType: LLMProviderType,
      modelName: string,
    ) => {
      setDeleteModelConfirm(null);
      const remainingModels = getProviderSavedConfiguredModels(
        providerType,
        settingsRef.current,
      ).filter((model) => model !== modelName);
      const nextModel = remainingModels[0] || "";
      const nextSettings = removeModelFromProviderRegistry(
        settingsRef.current,
        providerType,
        modelName,
      );
      settingsRef.current = nextSettings;
      setSettings(nextSettings);

      if (getProviderPrimaryModel(providerType) === modelName) {
        setProviderPrimaryModel(providerType, nextModel);
      }
      setTimeout(() => {
        void handleSave({ stayOnPage: true });
      }, 0);
    };

    const toggleProviderEnabled = (
      providerType: LLMProviderType,
      enabled: boolean,
    ) => {
      const configuredModels = getProviderSavedConfiguredModels(providerType);
      if (configuredModels.length === 0) {
        openAddModelModal(providerType);
        return;
      }

      let nextSettings = setProviderModelEnabledInRegistry(
        settingsRef.current,
        providerType,
        configuredModels,
        enabled,
      );

      if (enabled) {
        nextSettings = {
          ...nextSettings,
          providerType,
          modelKey:
            providerType === "anthropic"
              ? getProviderPrimaryModel(providerType) || configuredModels[0]
              : nextSettings.modelKey,
        };
        handleProviderSelect(providerType);
      }

      settingsRef.current = nextSettings;
      setSettings(nextSettings);
      setTimeout(() => {
        void handleSave({ stayOnPage: true });
      }, 0);
    };

    const toggleSingleModelEnabled = (
      providerType: LLMProviderType,
      modelName: string,
      enabled: boolean,
    ) => {
      const nextSettings = setProviderModelEnabledInRegistry(
        settingsRef.current,
        providerType,
        [modelName],
        enabled,
      );
      settingsRef.current = nextSettings;
      setSettings(nextSettings);
      setTimeout(() => {
        void handleSave({ stayOnPage: true });
      }, 0);
    };

    const selectPrimaryModel = (
      providerType: LLMProviderType,
      modelName: string,
    ) => {
      const currentProviderType = resolveCustomProviderId(
        settingsRef.current.providerType as LLMProviderType,
      );
      const selectedProviderType = resolveCustomProviderId(providerType);
      const currentModel = getProviderSavedPrimaryModel(
        providerType,
        settingsRef.current,
      );
      const modelEnabled = isProviderModelEnabled(
        providerType,
        modelName,
        settingsRef.current,
      );

      if (
        currentProviderType === selectedProviderType &&
        currentModel === modelName &&
        modelEnabled
      ) {
        return;
      }

      let nextSettings = setProviderModelEnabledInRegistry(
        settingsRef.current,
        providerType,
        [modelName],
        true,
      );
      nextSettings = writeProviderPrimaryModelSetting(
        nextSettings,
        providerType,
        modelName,
      );
      settingsRef.current = nextSettings;
      setSettings(nextSettings);
      setProviderPrimaryModel(providerType, modelName);
      setDeleteModelConfirm(null);

      setTimeout(() => {
        void handleSave({
          stayOnPage: true,
          selectedModel: { providerType, modelName },
        });
      }, 0);
    };

    const testModelConnection = (providerType: LLMProviderType) =>
      handleTestConnection(providerType);
    const selectedProviderPrimaryModel =
      getProviderPrimaryModel(selectedProviderType).trim();
    const selectedProviderConfiguredModels =
      getProviderSavedConfiguredModels(selectedProviderType);
    const selectedProviderModelCatalog = Array.from(
      new Map(
        [
          ...getModelCatalogForAdd(selectedProviderType),
          ...selectedProviderConfiguredModels.map((model) => ({
            key: model,
            displayName: model,
          })),
        ].map((model) => [model.key, model]),
      ).values(),
    );
    const selectedProviderCatalogLoading =
      isModelCatalogLoading(selectedProviderType);
    const effectiveSelectedModelsForAdd =
      selectedModelsForAdd.length > 0
        ? selectedModelsForAdd
        : selectedProviderPrimaryModel
          ? [selectedProviderPrimaryModel]
          : [];

    return (
      <div className="llm-provider-panel llm-model-console">
        {addModelModalOpen && (
          <div
            className="modal-overlay model-add-modal-overlay"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                setAddModelModalOpen(false);
              }
            }}
          >
            <div className="modal-content model-add-modal">
              <div className="model-add-modal-header">
                <div className="model-add-title-block">
                  <div>
                    <h2>
                      {translate(
                        "generated.components.settings.8401.20",
                        "Add model",
                      )}
                    </h2>
                    <p>
                      {translate(
                        "generated.components.settings.8402.21",
                        "Prioritize selection from the service provider model list, or add model IDs outside the list.",
                      )}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className="model-add-close"
                  onClick={() => setAddModelModalOpen(false)}
                  aria-label={translate(
                    "generated.components.settings.8409.22",
                    "Close",
                  )}
                >
                  <X size={18} strokeWidth={1.8} />
                </button>
              </div>

              <div className="model-add-modal-body">
                <aside className="model-add-provider-rail">
                  <label className="settings-label">
                    {translate(
                      "generated.components.settings.8417.23",
                      "model platform",
                    )}
                  </label>
                  <div className="model-add-provider-search">
                    <Search size={14} strokeWidth={1.8} aria-hidden="true" />
                    <input
                      type="search"
                      value={modelProviderSearch}
                      onChange={(event) =>
                        setModelProviderSearch(event.target.value)
                      }
                      placeholder={translate(
                        "generated.components.settings.8426.24",
                        "Search platform",
                      )}
                      aria-label={translate(
                        "generated.components.settings.8427.25",
                        "Search model platform",
                      )}
                    />
                  </div>
                  <div
                    className="model-add-provider-list"
                    role="listbox"
                    aria-label={translate(
                      "generated.components.settings.8433.26",
                      "model platform",
                    )}
                  >
                    {filteredModelAddProviderOptions.map((provider) => {
                      const providerType = provider.type as LLMProviderType;
                      const resolvedCustomType =
                        resolveCustomProviderId(providerType);
                      const customEntry =
                        CUSTOM_PROVIDER_MAP.get(resolvedCustomType);
                      const label = getModelAddProviderLabel(provider);
                      return (
                        <button
                          key={provider.type}
                          type="button"
                          className={`model-add-provider-option ${
                            selectedProviderType === provider.type
                              ? "active"
                              : ""
                          }`}
                          onClick={() =>
                            selectProviderForModelAdd(providerType)
                          }
                          role="option"
                          aria-selected={selectedProviderType === provider.type}
                        >
                          {getLLMProviderIcon(providerType, customEntry)}
                          <span>{label}</span>
                        </button>
                      );
                    })}
                    {filteredModelAddProviderOptions.length === 0 && (
                      <div className="model-add-provider-empty">
                        {translate(
                          "generated.components.settings.8464.27",
                          "No matching platform",
                        )}
                      </div>
                    )}
                  </div>
                  <p className="settings-hint">
                    {translate(
                      "generated.components.settings.8469.28",
                      "After selecting the platform, the corresponding service provider configuration will be filled in on the right side.",
                    )}
                  </p>
                </aside>

                <section className="model-add-config">
                  <div className="model-add-config-heading">
                    <div>
                      <h3>
                        {translate(
                          "generated.components.settings.8476.29",
                          "Connection settings",
                        )}
                      </h3>
                      <p>
                        {translate(
                          "generated.components.settings.8477.30",
                          "Configuration",
                        )}
                        {selectedProviderLabel}{" "}
                        {translate(
                          "generated.components.settings.8477.31",
                          "access credentials and default model.",
                        )}
                      </p>
                    </div>
                  </div>

                  {selectedProviderType === "openai-compatible" && (
                    <div className="model-add-field">
                      <label className="settings-label required-label">
                        {translate(
                          "generated.components.settings.8484.32",
                          "model supplier",
                        )}
                      </label>
                      <input
                        className="settings-input"
                        type="text"
                        value={openaiCompatDisplayName}
                        onChange={(event) =>
                          setOpenaiCompatDisplayName(event.target.value)
                        }
                        placeholder={translate(
                          "generated.components.settings.8493.33",
                          "For example: Intelligence",
                        )}
                        maxLength={100}
                      />
                      <p className="settings-hint">
                        {translate(
                          "generated.components.settings.8497.34",
                          "Used to identify this supplier in model lists and call records.",
                        )}
                      </p>
                    </div>
                  )}

                  <div className="model-add-field">
                    <label className="settings-label">
                      {translate(
                        "generated.components.settings.8503.35",
                        "API request address",
                      )}
                    </label>
                    <input
                      className="settings-input"
                      type="text"
                      placeholder={
                        getProviderApiAddress(selectedProviderType) ||
                        "https://api.example.com/v1"
                      }
                      value={getProviderApiAddress(selectedProviderType)}
                      onChange={(event) =>
                        setProviderApiAddress(
                          selectedProviderType,
                          event.target.value,
                        )
                      }
                      disabled={[
                        "gemini",
                        "openai",
                        "anthropic",
                        "bedrock",
                        "pi",
                        "moa",
                      ].includes(selectedProviderType)}
                    />
                  </div>

                  <div className="model-add-field">
                    <label className="settings-label required-label">
                      API Key
                    </label>
                    <div className="model-add-inline-input">
                      <input
                        className="settings-input"
                        type="password"
                        value={getProviderApiKey(selectedProviderType)}
                        onChange={(event) =>
                          setProviderApiKey(
                            selectedProviderType,
                            event.target.value,
                          )
                        }
                        placeholder={
                          selectedProviderType === "openai"
                            ? "sk-..."
                            : selectedProviderType === "gemini"
                              ? "AIza..."
                              : "API Key"
                        }
                      />
                    </div>
                    <p className="settings-hint">
                      {translate(
                        "generated.components.settings.8554.36",
                        "If multiple API Key rotations are required, please maintain them in the detailed configuration of the corresponding platform.",
                      )}
                    </p>
                  </div>

                  <div className="model-add-field model-add-catalog-field">
                    <div className="model-add-multi-select-heading">
                      <label className="settings-label required-label">
                        {translate(
                          "generated.components.settings.8561.37",
                          "Select model",
                        )}
                      </label>
                      <button
                        type="button"
                        className="button-small button-secondary"
                        onClick={() =>
                          void loadModelCatalogForAdd(selectedProviderType)
                        }
                        disabled={selectedProviderCatalogLoading}
                      >
                        {selectedProviderCatalogLoading
                          ? translate(
                              "generated.components.settings.8572.38",
                              "Getting...",
                            )
                          : translate(
                              "generated.components.settings.8573.39",
                              "Refresh model list",
                            )}
                      </button>
                    </div>
                    <p className="settings-hint">
                      {translate(
                        "generated.components.settings.8577.40",
                        "from",
                      )}
                      {selectedProviderLabel}
                      {translate(
                        "generated.components.settings.8578.41",
                        "Choose from the provided models; multiple models can be added at one time.",
                      )}
                    </p>
                    <div
                      className="model-add-multi-select"
                      role="group"
                      aria-label={translate(
                        "settings.models.selectFromProvider",
                        "Select {provider} models",
                        { provider: selectedProviderLabel },
                      )}
                    >
                      {selectedProviderModelCatalog.length > 0 ? (
                        selectedProviderModelCatalog.map((model) => {
                          const checked =
                            effectiveSelectedModelsForAdd.includes(model.key);
                          const isPrimary =
                            selectedProviderPrimaryModel === model.key;
                          return (
                            <label
                              key={model.key}
                              className={`model-add-model-option ${
                                checked ? "selected" : ""
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => {
                                  const nextModels = checked
                                    ? effectiveSelectedModelsForAdd.filter(
                                        (id) => id !== model.key,
                                      )
                                    : [
                                        ...effectiveSelectedModelsForAdd,
                                        model.key,
                                      ];
                                  setSelectedModelsForAdd(nextModels);
                                  if (
                                    !checked &&
                                    !selectedProviderPrimaryModel
                                  ) {
                                    setProviderPrimaryModel(
                                      selectedProviderType,
                                      model.key,
                                    );
                                  } else if (
                                    checked &&
                                    isPrimary &&
                                    nextModels.length > 0
                                  ) {
                                    setProviderPrimaryModel(
                                      selectedProviderType,
                                      nextModels[0],
                                    );
                                  }
                                }}
                              />
                              <span className="model-add-model-option-copy">
                                <strong>{model.displayName}</strong>
                                {model.displayName !== model.key && (
                                  <small>{model.key}</small>
                                )}
                              </span>
                              {isPrimary && (
                                <span className="model-add-primary-badge">
                                  {translate(
                                    "generated.components.settings.8639.42",
                                    "Default",
                                  )}
                                </span>
                              )}
                            </label>
                          );
                        })
                      ) : (
                        <div className="model-add-catalog-empty">
                          {selectedProviderCatalogLoading
                            ? translate(
                                "generated.components.settings.8648.43",
                                "Reading available models...",
                              )
                            : translate(
                                "generated.components.settings.8649.44",
                                "The model has not been read yet. Please fill in the API Key first and then refresh the model list.",
                              )}
                        </div>
                      )}
                    </div>

                    <details className="model-add-custom-model">
                      <summary>
                        {translate(
                          "generated.components.settings.8655.45",
                          "Not on the list? Fill in the custom model ID",
                        )}
                      </summary>
                      <div className="model-add-inline-input">
                        <input
                          className="settings-input"
                          type="text"
                          value={selectedProviderPrimaryModel}
                          onChange={(event) => {
                            const value = event.target.value;
                            setProviderPrimaryModel(
                              selectedProviderType,
                              value,
                            );
                            setSelectedModelsForAdd(
                              value.trim() ? [value.trim()] : [],
                            );
                          }}
                          placeholder="model-id"
                        />
                      </div>
                    </details>
                  </div>
                </section>
              </div>

              {testResult && !testResult.success && (
                <div className="test-result error model-add-save-error" role="alert">
                  {testResult.error ||
                    translate(
                      "settings.models.saveFailed",
                      "Failed to save model settings.",
                    )}
                </div>
              )}

              <div className="model-add-modal-footer">
                <div className="model-add-footer-actions">
                  <button
                    type="button"
                    className="button-small button-secondary"
                    onClick={() => setAddModelModalOpen(false)}
                  >
                    {translate(
                      "generated.components.settings.8686.46",
                      "Cancel",
                    )}
                  </button>
                  <button
                    type="button"
                    className="button-small button-primary"
                    onClick={confirmAddModel}
                    disabled={
                      saving ||
                      (selectedProviderType === "openai-compatible" &&
                        !openaiCompatDisplayName.trim()) ||
                      (effectiveSelectedModelsForAdd.length === 0 &&
                        !selectedProviderPrimaryModel)
                    }
                  >
                    {saving
                      ? translate(
                          "generated.components.settings.8700.47",
                          "Saving...",
                        )
                      : translate(
                          "generated.components.settings.8700.48",
                          "Add model",
                        )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <section className="llm-agentflow-hero">
          <div className="llm-agentflow-hero-copy">
            <div className="llm-agentflow-hero-icon">
              <Brain size={22} strokeWidth={1.8} />
            </div>
            <div>
              <h3>
                {translate("generated.components.settings.8714.49", "model")}
              </h3>
              <p>
                {translate(
                  "generated.components.settings.8715.50",
                  "Description: Centrally manage model platform, API Key, default model and real call status.",
                )}
              </p>
            </div>
          </div>
          <div
            className="llm-agentflow-hero-stats"
            aria-label={translate(
              "generated.components.settings.8718.51",
              "Model configuration statistics",
            )}
          >
            {[
              {
                label: translate(
                  "generated.components.settings.8721.52",
                  "model platform",
                ),
                value: addedProviders.length,
                icon: <Layers size={17} strokeWidth={1.8} />,
              },
              {
                label: translate(
                  "generated.components.settings.8726.53",
                  "enable model",
                ),
                value: configuredModelCount,
                icon: <Brain size={17} strokeWidth={1.8} />,
              },
              {
                label: "API Key",
                value: apiKeyCount,
                icon: <KeyRound size={17} strokeWidth={1.8} />,
              },
            ].map((stat) => (
              <div className="llm-agentflow-hero-stat" key={stat.label}>
                {stat.icon}
                <span>{stat.label}</span>
                <strong>{stat.value}</strong>
              </div>
            ))}
          </div>
        </section>

        <div className="llm-agentflow-toolbar">
          <button
            type="button"
            className="llm-agentflow-button secondary"
            onClick={() => {
              setTestResult(null);
              setRoutingRuntime(null);
            }}
          >
            {translate("generated.components.settings.8754.54", "clear status")}
          </button>
          <button
            type="button"
            className="llm-agentflow-button primary"
            onClick={() => openAddModelModal()}
          >
            <Plus size={14} strokeWidth={2} />
            {translate("generated.components.settings.8762.55", "Add model")}
          </button>
        </div>

        <div className="llm-agentflow-section-heading">
          <h4>
            {translate("generated.components.settings.8767.56", "Dosage")}
          </h4>
          <p>
            {translate(
              "generated.components.settings.8768.57",
              "View the actual number of calls and token activity.",
            )}
          </p>
        </div>

        <section className="llm-agentflow-usage-card">
          <div className="llm-agentflow-metric-strip">
            {metricCards.map((metric) => (
              <button
                type="button"
                className={`llm-agentflow-metric ${metric.highlighted ? "highlighted" : ""}`}
                key={metric.label}
                onClick={() => openAddModelModal(settings.providerType)}
                title={metricDescriptions[metric.label] || String(metric.value)}
              >
                <strong>{metric.value}</strong>
                <span>{metric.label}</span>
              </button>
            ))}
          </div>
          <div className="llm-agentflow-activity-header">
            <div>
              <strong>
                {translate(
                  "generated.components.settings.8788.58",
                  "Token activities",
                )}
              </strong>
              <span>
                {modelUsageLoading
                  ? translate(
                      "generated.components.settings.8791.59",
                      "Loading real model usage...",
                    )
                  : hasUsageActivity
                    ? translate(
                        "settings.usage.latestTotals",
                        "Latest totals: {calls} calls and {tokens} tokens.",
                        {
                          calls: formatModelMetric(totalUsageCalls),
                          tokens: formatModelMetric(totalUsageTokens),
                        },
                      )
                    : translate(
                        "generated.components.settings.8794.60",
                        "Model calls have not been recorded yet, real token usage will be shown after starting the conversation.",
                      )}
              </span>
            </div>
            <div
              className="llm-activity-tabs"
              aria-label={translate(
                "generated.components.settings.8797.61",
                "Scope of activities",
              )}
            >
              {(
                [
                  [
                    "daily",
                    translate("generated.components.settings.8800.62", "daily"),
                  ],
                  [
                    "weekly",
                    translate(
                      "generated.components.settings.8801.63",
                      "weekly",
                    ),
                  ],
                  [
                    "cumulative",
                    translate(
                      "generated.components.settings.8802.64",
                      "cumulative",
                    ),
                  ],
                ] as const
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  className={modelUsageMode === mode ? "active" : ""}
                  aria-pressed={modelUsageMode === mode}
                  onClick={() => setModelUsageMode(mode)}
                >
                  {label}
                </button>
              ))}
              <button
                type="button"
                className="llm-activity-refresh"
                onClick={() => void loadModelUsage()}
                disabled={modelUsageLoading}
              >
                {translate("generated.components.settings.8821.65", "Refresh")}
              </button>
            </div>
          </div>
          <ModelUsageHeatmap
            days={modelUsageDays}
            mode={modelUsageMode}
            ariaLabel={translate(
              "generated.components.settings.8828.66",
              "Real Token activity heat map",
            )}
          />
        </section>

        <div className="llm-agentflow-section-heading">
          <h4>
            {translate(
              "generated.components.settings.8833.67",
              "Configured model",
            )}
          </h4>
          <p>
            {translate(
              "generated.components.settings.8834.68",
              "Manage providers, models and access credentials.",
            )}
          </p>
        </div>

        <section className="llm-agentflow-provider-card llm-provider-list-card">
          {addedProviders.length === 0 && (
            <div className="llm-provider-empty-state">
              <strong>
                {translate(
                  "generated.components.settings.8840.69",
                  "No models have been added yet",
                )}
              </strong>
              <span>
                {translate(
                  "generated.components.settings.8842.70",
                  'After clicking "Add Model" to configure the service provider, only the models you have added will be displayed here.',
                )}
              </span>
              <button
                type="button"
                className="codex-settings-primary-button"
                onClick={() => openAddModelModal()}
              >
                <Plus size={14} strokeWidth={2} />
                {translate(
                  "generated.components.settings.8850.71",
                  "Add model",
                )}
              </button>
            </div>
          )}
          {addedProviders.map((provider) => {
            const providerType = provider.type as LLMProviderType;
            const resolvedCustomType = resolveCustomProviderId(providerType);
            const customEntry = CUSTOM_PROVIDER_MAP.get(resolvedCustomType);
            const label =
              providerType === "openai-compatible"
                ? getOpenAICompatibleDisplayName()
                : translate(
                    `aiModels.providerName.${provider.type}`,
                    provider.name,
                  );
            const isActive = settings.providerType === provider.type;
            const isExpanded = isModelProviderExpanded(providerType);
            const configuredModels =
              getProviderSavedConfiguredModels(providerType);
            const model =
              getProviderSavedPrimaryModel(providerType) ||
              configuredModels[0] ||
              "";
            const providerEnabled = isProviderEnabled(providerType);
            const providerUsage = providerUsageByType.get(
              normalizeUsageLookupKey(providerType),
            );
            const providerTokens =
              (providerUsage?.inputTokens || 0) +
              (providerUsage?.outputTokens || 0);
            const visibleModelUsageRows = configuredModels.map((modelName) => {
              const matched = modelUsageRows.find((row) =>
                modelUsageMatches(row.model, modelName),
              );
              return {
                model: modelName,
                cost: matched?.cost || 0,
                calls: matched?.calls || 0,
                inputTokens: matched?.inputTokens || 0,
                outputTokens: matched?.outputTokens || 0,
                cachedTokens: matched?.cachedTokens || 0,
                distinctTasks: matched?.distinctTasks || 0,
              };
            });
            const providerModelTotal = configuredModels.length;
            const providerHasRealModelUsage = visibleModelUsageRows.some(
              (row) =>
                row.calls > 0 ||
                row.inputTokens > 0 ||
                row.outputTokens > 0 ||
                row.cost > 0,
            );
            const providerApiKeyTotal = getProviderApiKeyCount(providerType);

            return (
              <div key={provider.type} className="llm-provider-block">
                <div
                  className={`llm-provider-row ${isExpanded ? "active" : ""} ${
                    isActive ? "current" : ""
                  }`}
                  onClick={() => toggleModelProviderExpanded(providerType)}
                >
                  <div className="llm-provider-row-main">
                    <ChevronDown
                      size={15}
                      strokeWidth={1.8}
                      className={isExpanded ? "expanded" : ""}
                    />
                    <div className="llm-provider-row-icon">
                      {getLLMProviderIcon(providerType, customEntry)}
                    </div>
                    <div className="llm-provider-row-copy">
                      <strong>{label}</strong>
                      <span>
                        {model ||
                          configuredModels[0] ||
                          translate(
                            "generated.components.settings.8924.72",
                            "No model selected yet",
                          )}
                      </span>
                    </div>
                  </div>
                  <div className="llm-provider-row-actions">
                    <span className="llm-provider-row-counts">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          toggleModelProviderExpanded(providerType);
                        }}
                      >
                        {translate(
                          "generated.components.settings.8937.73",
                          "model(",
                        )}
                        {providerModelTotal}）
                      </button>
                      <span>|</span>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          openAddModelModal(providerType);
                        }}
                      >
                        API Key（{providerApiKeyTotal}）
                      </button>
                    </span>
                    <button
                      type="button"
                      className={`llm-provider-switch ${providerEnabled ? "on" : ""}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        toggleProviderEnabled(providerType, !providerEnabled);
                      }}
                      aria-label={`${providerEnabled ? translate("generated.components.settings.8957.74", "deactivate") : translate("generated.components.settings.8957.75", "enable")} ${label}`}
                      aria-pressed={providerEnabled}
                    />
                    {providerUsage && (
                      <span
                        className="llm-provider-usage-pill"
                        title={translate(
                          "settings.usage.providerTokenTotal",
                          "{tokens} total tokens (input + output)",
                          { tokens: formatModelMetric(providerTokens) },
                        )}
                      >
                        {formatModelMetric(providerUsage.calls)}{" "}
                        {translate(
                          "generated.components.settings.8965.76",
                          "calls",
                        )}
                      </span>
                    )}
                    <button
                      type="button"
                      className="llm-provider-icon-button action-add"
                      data-action-label={translate(
                        "generated.components.settings.8971.77",
                        "Add model",
                      )}
                      onClick={(event) => {
                        event.stopPropagation();
                        openAddModelModal(providerType);
                      }}
                      aria-label={translate(
                        "settings.models.addForProvider",
                        "Add a model for {provider}",
                        { provider: label },
                      )}
                      title={translate(
                        "generated.components.settings.8977.78",
                        "Add model",
                      )}
                    >
                      <Plus size={15} strokeWidth={2} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="llm-provider-icon-button action-delete"
                      data-action-label={translate(
                        "generated.components.settings.8984.79",
                        "Delete model",
                      )}
                      onClick={(event) => {
                        event.stopPropagation();
                        setDeleteProviderConfirm(
                          deleteProviderConfirm === providerType
                            ? null
                            : providerType,
                        );
                      }}
                      disabled={resettingCredentials}
                      aria-label={translate(
                        "settings.models.deleteAllForProvider",
                        "Delete all models for {provider}",
                        { provider: label },
                      )}
                      title={translate(
                        "generated.components.settings.8995.80",
                        "Delete all models",
                      )}
                    >
                      <Minus size={15} strokeWidth={2} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="llm-provider-icon-button action-edit"
                      data-action-label={translate(
                        "generated.components.settings.9002.81",
                        "Edit configuration",
                      )}
                      onClick={(event) => {
                        event.stopPropagation();
                        openAddModelModal(providerType);
                      }}
                      aria-label={translate(
                        "settings.models.editProvider",
                        "Edit {provider}",
                        { provider: label },
                      )}
                      title={translate(
                        "generated.components.settings.9008.82",
                        "Edit model",
                      )}
                    >
                      <Pencil size={15} strokeWidth={1.8} aria-hidden="true" />
                    </button>
                    {deleteProviderConfirm === providerType && (
                      <div
                        className="llm-provider-inline-confirm"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <span className="llm-provider-inline-confirm-title">
                          {translate(
                            "generated.components.settings.9018.83",
                            "Delete all models?",
                          )}
                        </span>
                        <button
                          type="button"
                          onClick={() => setDeleteProviderConfirm(null)}
                        >
                          {translate(
                            "generated.components.settings.9024.84",
                            "Cancel",
                          )}
                        </button>
                        <button
                          type="button"
                          className="primary"
                          onClick={(event) => {
                            event.stopPropagation();
                            void confirmDeleteProviderModels(providerType);
                          }}
                        >
                          {translate(
                            "generated.components.settings.9034.85",
                            "OK",
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                {isExpanded && (
                  <div className="llm-provider-usage-panel">
                    <div className="llm-provider-usage-models">
                      <div className="llm-provider-usage-heading">
                        <BarChart3 size={14} strokeWidth={1.8} />
                        <span>
                          {translate(
                            "generated.components.settings.9045.86",
                            "model",
                          )}
                        </span>
                      </div>
                      {visibleModelUsageRows.length > 0 ? (
                        <div className="llm-model-usage-list">
                          {visibleModelUsageRows.map((row) => {
                            const modelEnabled = isProviderModelEnabled(
                              providerType,
                              row.model,
                            );
                            const isCurrentModel =
                              resolveCustomProviderId(
                                settings.providerType as LLMProviderType,
                              ) === resolvedCustomType &&
                              getProviderSavedPrimaryModel(providerType) ===
                                row.model;
                            const modelDays = getModelDailyUsage(row.model);
                            const rawDailyValues = modelDays.map(
                              (day) => day.inputTokens + day.outputTokens,
                            );
                            const peakTokens = Math.max(0, ...rawDailyValues);
                            const streaks = getUsageStreaks(modelDays);
                            const modelTokens =
                              row.inputTokens + row.outputTokens;
                            const detailsKey = `${providerType}:${row.model}`;
                            const detailsId = `model-usage-details-${detailsKey.replace(
                              /[^a-zA-Z0-9_-]/g,
                              "-",
                            )}`;
                            const detailsExpanded = Boolean(
                              expandedModelUsageDetails[detailsKey],
                            );
                            const detailMetrics = [
                              {
                                label: translate(
                                  "generated.components.settings.9078.87",
                                  "Single day peak",
                                ),
                                value: `${formatModelMetric(peakTokens)} Token`,
                              },
                              {
                                label: translate(
                                  "generated.components.settings.9082.88",
                                  "currently in continuous use",
                                ),
                                value: translate(
                                  "settings.usage.dayCount",
                                  "{count} days",
                                  {
                                    count: formatModelMetric(
                                      streaks.currentStreak,
                                    ),
                                  },
                                ),
                              },
                              {
                                label: translate(
                                  "generated.components.settings.9086.89",
                                  "longest continuous use",
                                ),
                                value: translate(
                                  "settings.usage.dayCount",
                                  "{count} days",
                                  {
                                    count: formatModelMetric(
                                      streaks.longestStreak,
                                    ),
                                  },
                                ),
                              },
                            ];

                            return (
                              <div
                                className={`llm-model-usage-card ${
                                  isCurrentModel ? "is-current" : ""
                                } ${detailsExpanded ? "is-expanded" : ""}`}
                                key={row.model}
                              >
                                <div className="llm-model-usage-card-header">
                                  <div className="llm-model-identity">
                                    <button
                                      type="button"
                                      className={`llm-model-selection ${
                                        isCurrentModel ? "selected" : ""
                                      }`}
                                      onClick={() =>
                                        selectPrimaryModel(
                                          providerType,
                                          row.model,
                                        )
                                      }
                                      disabled={saving}
                                      aria-label={
                                        isCurrentModel
                                          ? translate(
                                              "settings.models.isCurrent",
                                              "{model} is the current model",
                                              { model: row.model },
                                            )
                                          : translate(
                                              "settings.models.setCurrent",
                                              "Set {model} as the current model",
                                              { model: row.model },
                                            )
                                      }
                                      aria-pressed={isCurrentModel}
                                      title={
                                        isCurrentModel
                                          ? translate(
                                              "generated.components.settings.9120.90",
                                              "current model",
                                            )
                                          : translate(
                                              "generated.components.settings.9121.91",
                                              "Set as current model",
                                            )
                                      }
                                    >
                                      <span
                                        className="llm-model-selection-radio"
                                        aria-hidden="true"
                                      />
                                      <strong title={row.model}>
                                        {row.model}
                                      </strong>
                                      {isCurrentModel && (
                                        <span className="llm-model-selection-label">
                                          {translate(
                                            "generated.components.settings.9133.92",
                                            "current",
                                          )}
                                        </span>
                                      )}
                                    </button>
                                    <button
                                      type="button"
                                      className={`llm-model-switch ${modelEnabled ? "on" : ""}`}
                                      onClick={() =>
                                        toggleSingleModelEnabled(
                                          providerType,
                                          row.model,
                                          !modelEnabled,
                                        )
                                      }
                                      aria-label={`${modelEnabled ? translate("generated.components.settings.9147.93", "deactivate") : translate("generated.components.settings.9147.94", "enable")} ${row.model}`}
                                      aria-pressed={modelEnabled}
                                    />
                                  </div>

                                  <div
                                    className="llm-model-primary-metrics"
                                    aria-label={translate(
                                      "settings.usage.modelSummary",
                                      "Usage summary for {model}",
                                      { model: row.model },
                                    )}
                                  >
                                    <span>
                                      <strong>
                                        {formatModelMetric(row.calls)}
                                      </strong>
                                      {translate(
                                        "generated.components.settings.9160.95",
                                        "calls",
                                      )}
                                    </span>
                                    <span>
                                      <strong>
                                        {formatModelMetric(modelTokens)}
                                      </strong>
                                      Token
                                    </span>
                                    <span>
                                      <strong>
                                        {formatModelMetric(streaks.activeDays)}
                                      </strong>
                                      {translate(
                                        "generated.components.settings.9172.96",
                                        "active days",
                                      )}
                                    </span>
                                  </div>

                                  <div className="llm-model-row-actions">
                                    {row.cost > 0 && (
                                      <span>{formatModelCost(row.cost)}</span>
                                    )}
                                    <button
                                      type="button"
                                      className="llm-model-details-toggle"
                                      onClick={() =>
                                        setExpandedModelUsageDetails(
                                          (current) => ({
                                            ...current,
                                            [detailsKey]: !detailsExpanded,
                                          }),
                                        )
                                      }
                                      aria-expanded={detailsExpanded}
                                      aria-controls={detailsId}
                                    >
                                      <span>
                                        {detailsExpanded
                                          ? translate(
                                              "generated.components.settings.9195.97",
                                              "close",
                                            )
                                          : translate(
                                              "generated.components.settings.9195.98",
                                              "Dosage details",
                                            )}
                                      </span>
                                      <ChevronDown
                                        size={14}
                                        strokeWidth={1.8}
                                        aria-hidden="true"
                                      />
                                    </button>
                                    <button
                                      type="button"
                                      className="llm-provider-icon-button llm-model-action-button"
                                      data-action-label={translate(
                                        "generated.components.settings.9206.99",
                                        "test connection",
                                      )}
                                      onClick={() =>
                                        testModelConnection(providerType)
                                      }
                                      disabled={testing}
                                      aria-label={translate(
                                        "settings.models.testConnectionNamed",
                                        "Test connection for {model}",
                                        { model: row.model },
                                      )}
                                      title={translate(
                                        "generated.components.settings.9212.100",
                                        "test connection",
                                      )}
                                    >
                                      <Activity size={15} strokeWidth={1.8} />
                                    </button>
                                    <button
                                      type="button"
                                      className="llm-provider-icon-button action-delete llm-model-action-button"
                                      data-action-label={translate(
                                        "generated.components.settings.9219.101",
                                        "Delete model",
                                      )}
                                      onClick={() =>
                                        setDeleteModelConfirm(
                                          deleteModelConfirm === detailsKey
                                            ? null
                                            : detailsKey,
                                        )
                                      }
                                      aria-label={translate(
                                        "settings.models.deleteNamed",
                                        "Delete model {model}",
                                        { model: row.model },
                                      )}
                                      title={translate(
                                        "generated.components.settings.9228.102",
                                        "Delete model",
                                      )}
                                    >
                                      <Trash2 size={15} strokeWidth={1.8} />
                                    </button>
                                    {deleteModelConfirm === detailsKey && (
                                      <div
                                        className="llm-provider-inline-confirm model-inline-confirm"
                                        onClick={(event) =>
                                          event.stopPropagation()
                                        }
                                      >
                                        <span className="llm-provider-inline-confirm-title">
                                          {translate(
                                            "generated.components.settings.9240.103",
                                            "Delete the model?",
                                          )}
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setDeleteModelConfirm(null)
                                          }
                                        >
                                          {translate(
                                            "generated.components.settings.9248.104",
                                            "Cancel",
                                          )}
                                        </button>
                                        <button
                                          type="button"
                                          className="primary"
                                          onClick={() =>
                                            confirmDeleteModel(
                                              providerType,
                                              row.model,
                                            )
                                          }
                                        >
                                          {translate(
                                            "generated.components.settings.9260.105",
                                            "OK",
                                          )}
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {detailsExpanded && (
                                  <div
                                    className="llm-model-usage-details"
                                    id={detailsId}
                                  >
                                    <div className="llm-model-detail-metrics">
                                      {detailMetrics.map((metric) => (
                                        <span key={metric.label}>
                                          {metric.label}
                                          <strong>{metric.value}</strong>
                                        </span>
                                      ))}
                                    </div>
                                    <ModelUsageHeatmap
                                      days={modelDays}
                                      mode={modelUsageMode}
                                      ariaLabel={translate(
                                        "settings.usage.modelHeatmap",
                                        "Token activity heatmap for {model}",
                                        { model: row.model },
                                      )}
                                      className="llm-model-activity-heatmap"
                                    />
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="llm-provider-usage-empty">
                          {providerUsage
                            ? translate(
                                "generated.components.settings.9295.106",
                                "This service provider already has real call records; please click + to add the model to be managed.",
                              )
                            : translate(
                                "generated.components.settings.9296.107",
                                "No models have been added yet. After clicking + on the right to add a model, the actual configuration will be displayed here.",
                              )}
                        </p>
                      )}
                      {visibleModelUsageRows.length > 0 &&
                        !providerHasRealModelUsage && (
                          <p className="llm-provider-usage-empty">
                            {translate(
                              "generated.components.settings.9302.108",
                              "There are no real call records for these models yet, separate statistics will be shown after starting the conversation.",
                            )}
                          </p>
                        )}
                    </div>
                    {testResult?.providerType === providerType && (
                      <div
                        className={`llm-provider-inline-test-result ${
                          testResult.success ? "success" : "error"
                        }`}
                      >
                        {testResult.success
                          ? translate(
                              "generated.components.settings.9313.109",
                              "Connection successful",
                            )
                          : (() => {
                              const error =
                                testResult.error ||
                                translate(
                                  "generated.components.settings.9315.110",
                                  "Connection failed",
                                );
                              const jsonStart = error.indexOf(" [{");
                              const truncated =
                                jsonStart > 0
                                  ? error.slice(0, jsonStart)
                                  : error;
                              return truncated.length > 160
                                ? `${truncated.slice(0, 160)}...`
                                : truncated;
                            })()}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </section>

        {showLegacyProviderConfig && (
          <div className="llm-provider-content llm-provider-config-surface">
            {settings.providerType === "anthropic" && (
              <>
                <div className="settings-section">
                  <h3>Claude</h3>
                  <p className="settings-description">
                    {translate(
                      "aiModels.claude.authDescription",
                      "Choose between direct Claude API access and a Claude subscription token.",
                    )}
                  </p>
                  <div
                    className="auth-method-tabs"
                    style={{ marginBottom: "1rem" }}
                  >
                    <button
                      type="button"
                      className={`auth-method-tab ${anthropicAuthMethod === "api_key" ? "active" : ""}`}
                      onClick={() => setAnthropicAuthMethod("api_key")}
                    >
                      {translate("aiModels.claude.apiTab", "Claude API")}
                    </button>
                    <button
                      type="button"
                      className={`auth-method-tab ${anthropicAuthMethod === "subscription" ? "active" : ""}`}
                      onClick={() => setAnthropicAuthMethod("subscription")}
                    >
                      {translate(
                        "aiModels.claude.subscriptionTab",
                        "Claude Subscription",
                      )}
                    </button>
                  </div>
                </div>

                {anthropicAuthMethod === "api_key" ? (
                  <div className="settings-section">
                    <h3>
                      {translate(
                        "aiModels.claude.apiKeyTitle",
                        "Claude API Key",
                      )}
                    </h3>
                    <p className="settings-description">
                      {translate(
                        "aiModels.claude.apiKeyDescription",
                        "Enter your API key from",
                      )}{" "}
                      <a
                        href="https://console.anthropic.com/"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        console.anthropic.com
                      </a>
                    </p>
                    <input
                      type="password"
                      className="settings-input"
                      placeholder="sk-ant-..."
                      value={anthropicApiKey}
                      onChange={(e) => setAnthropicApiKey(e.target.value)}
                    />
                  </div>
                ) : (
                  <div className="settings-section">
                    <h3>
                      {translate(
                        "aiModels.claude.subscriptionTitle",
                        "Claude Subscription Token",
                      )}
                    </h3>
                    <p className="settings-description">
                      {translate(
                        "aiModels.claude.subscriptionDescription",
                        "Paste your Claude subscription token (for example, sk-ant-oat...).",
                      )}
                    </p>
                    <p className="settings-description">
                      {translate(
                        "aiModels.claude.subscriptionHowTo",
                        "To get one, install Claude Code, sign in by running `claude`, then run `claude setup-token` locally and paste the generated token here.",
                      )}
                    </p>
                    <p className="settings-description">
                      {translate(
                        "aiModels.claude.subscriptionNote",
                        "Note: third-party harnesses connected to your Claude account may draw from extra usage instead of from your subscription.",
                      )}
                    </p>
                    <input
                      type="password"
                      className="settings-input"
                      placeholder="sk-ant-oat..."
                      value={anthropicSubscriptionToken}
                      onChange={(e) =>
                        setAnthropicSubscriptionToken(e.target.value)
                      }
                    />
                  </div>
                )}

                <div className="settings-section">
                  <h3>{translate("aiModels.common.model", "Model")}</h3>
                  <p className="settings-description">
                    {translate(
                      "aiModels.claude.modelDescription",
                      "Refresh the Claude model list if this selector is showing a stale model from another provider.",
                    )}
                  </p>
                  <div className="settings-input-group">
                    <select
                      className="settings-select"
                      value={settings.modelKey}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          modelKey: e.target.value,
                        })
                      }
                    >
                      {models.map((model) => (
                        <option key={model.key} value={model.key}>
                          {model.displayName}
                        </option>
                      ))}
                    </select>
                    <button
                      className="button-small button-secondary"
                      onClick={() => loadClaudeModels()}
                      disabled={loadingClaudeModels}
                    >
                      {loadingClaudeModels
                        ? translate("aiModels.action.loading", "Loading...")
                        : translate(
                            "aiModels.action.refreshModels",
                            "Refresh Models",
                          )}
                    </button>
                  </div>
                </div>
              </>
            )}

            {settings.providerType === "gemini" && (
              <>
                <div className="settings-section">
                  <h3>
                    {translate("aiModels.gemini.apiKeyTitle", "Gemini API Key")}
                  </h3>
                  <p className="settings-description">
                    {translate(
                      "aiModels.gemini.apiKeyDescription",
                      "Enter your API key from",
                    )}{" "}
                    <a
                      href="https://aistudio.google.com/apikey"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Google AI Studio
                    </a>
                  </p>
                  <div className="settings-input-group">
                    <input
                      type="password"
                      className="settings-input"
                      placeholder="AIza..."
                      value={geminiApiKey}
                      onChange={(e) => setGeminiApiKey(e.target.value)}
                    />
                    <button
                      className="button-small button-secondary"
                      onClick={() => loadGeminiModels(geminiApiKey)}
                      disabled={loadingGeminiModels}
                    >
                      {loadingGeminiModels
                        ? translate("aiModels.action.loading", "Loading...")
                        : translate(
                            "aiModels.action.refreshModels",
                            "Refresh Models",
                          )}
                    </button>
                  </div>
                </div>

                <div className="settings-section">
                  <h3>{translate("aiModels.common.model", "Model")}</h3>
                  <p className="settings-description">
                    {translate(
                      "aiModels.gemini.modelDescription",
                      'Select a Gemini model. Enter your API key and click "Refresh Models" to load available models.',
                    )}
                  </p>
                  {geminiModels.length > 0 ? (
                    <SearchableSelect
                      options={geminiModels.map((model) => ({
                        value: model.name,
                        label: model.displayName,
                        description: model.description,
                      }))}
                      value={geminiModel}
                      onChange={setGeminiModel}
                      placeholder={translate(
                        "aiModels.common.selectModel",
                        "Select a model...",
                      )}
                    />
                  ) : (
                    <input
                      type="text"
                      className="settings-input"
                      placeholder="gemini-2.0-flash"
                      value={geminiModel}
                      onChange={(e) => setGeminiModel(e.target.value)}
                    />
                  )}
                </div>
              </>
            )}

            {settings.providerType === "openrouter" && (
              <>
                <div className="settings-section">
                  <h3>
                    {translate(
                      "aiModels.openrouter.apiKeyTitle",
                      "OpenRouter API Key",
                    )}
                  </h3>
                  <p className="settings-description">
                    {translate(
                      "aiModels.openrouter.apiKeyDescription",
                      "Enter your API key from",
                    )}{" "}
                    <a
                      href="https://openrouter.ai/keys"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      OpenRouter
                    </a>
                  </p>
                  <div className="settings-input-group">
                    <input
                      type="password"
                      className="settings-input"
                      placeholder="sk-or-..."
                      value={openrouterApiKey}
                      onChange={(e) => setOpenrouterApiKey(e.target.value)}
                    />
                    <button
                      className="button-small button-secondary"
                      onClick={() => loadOpenRouterModels(openrouterApiKey)}
                      disabled={loadingOpenRouterModels}
                    >
                      {loadingOpenRouterModels
                        ? translate("aiModels.action.loading", "Loading...")
                        : translate(
                            "aiModels.action.refreshModels",
                            "Refresh Models",
                          )}
                    </button>
                  </div>
                </div>

                <div className="settings-section">
                  <h3>{translate("aiModels.common.baseUrl", "Base URL")}</h3>
                  <p className="settings-description">
                    {translate(
                      "aiModels.openrouter.baseUrlDescription",
                      "Optional override for the OpenRouter API endpoint.",
                    )}
                  </p>
                  <input
                    type="text"
                    className="settings-input"
                    placeholder="https://openrouter.ai/api/v1"
                    value={openrouterBaseUrl}
                    onChange={(e) => setOpenrouterBaseUrl(e.target.value)}
                  />
                </div>

                <div className="settings-section">
                  <h3>{translate("aiModels.common.model", "Model")}</h3>
                  <p className="settings-description">
                    {translate(
                      "aiModels.openrouter.modelDescription",
                      'Select a model from OpenRouter\'s catalog. Enter your API key and click "Refresh Models" to load available models.',
                    )}
                  </p>
                  {openrouterModels.length > 0 ? (
                    <SearchableSelect
                      options={openrouterModels.map((model) => ({
                        value: model.id,
                        label: model.name,
                        description: `${Math.round(model.context_length / 1000)}k context`,
                      }))}
                      value={openrouterModel}
                      onChange={setOpenrouterModel}
                      placeholder={translate(
                        "aiModels.common.selectModel",
                        "Select a model...",
                      )}
                      allowCustomValue
                    />
                  ) : (
                    <input
                      type="text"
                      className="settings-input"
                      placeholder="anthropic/claude-3.5-sonnet"
                      value={openrouterModel}
                      onChange={(e) => setOpenrouterModel(e.target.value)}
                    />
                  )}
                  <p className="settings-hint">
                    {translate(
                      "aiModels.openrouter.hint",
                      "OpenRouter provides access to many models from different providers through a unified API.",
                    )}
                  </p>
                </div>

                {openrouterParetoSelected && (
                  <div className="settings-section">
                    <h3>
                      {translate(
                        "aiModels.openrouter.pareto.title",
                        "Pareto Router",
                      )}
                    </h3>
                    <p className="settings-description">
                      {translate(
                        "aiModels.openrouter.pareto.description",
                        "Optional minimum coding score for OpenRouter's Pareto Code router. Leave blank to use OpenRouter's default high tier.",
                      )}
                    </p>
                    <input
                      type="number"
                      className="settings-input"
                      min="0"
                      max="1"
                      step="0.01"
                      placeholder="0.8"
                      value={openrouterParetoMinCodingScore}
                      aria-invalid={!!openrouterParetoScoreError}
                      onChange={(e) =>
                        setOpenrouterParetoMinCodingScore(e.target.value)
                      }
                    />
                    {openrouterParetoScoreError && (
                      <p
                        className="settings-hint"
                        style={{ color: "var(--color-error, #dc2626)" }}
                      >
                        {openrouterParetoScoreError}
                      </p>
                    )}
                    <p className="settings-hint">
                      {translate(
                        "aiModels.openrouter.pareto.hint",
                        "Use 0.66 or higher for the high tier, 0.33 to 0.65 for the medium tier, and below 0.33 for cheaper low-tier routing.",
                      )}
                    </p>
                  </div>
                )}
              </>
            )}

            {settings.providerType === "openai" && (
              <>
                <div className="settings-section">
                  <h3>
                    {translate(
                      "aiModels.openai.authMethod",
                      "Authentication Method",
                    )}
                  </h3>
                  <p className="settings-description">
                    {translate(
                      "aiModels.openai.authDescription",
                      "Choose how to authenticate with OpenAI",
                    )}
                  </p>
                  <div className="auth-method-tabs">
                    <button
                      className={`auth-method-tab ${openaiAuthMethod === "oauth" ? "active" : ""}`}
                      onClick={() => setOpenaiAuthMethod("oauth")}
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                        <circle cx="12" cy="7" r="4" />
                      </svg>
                      {translate(
                        "aiModels.openai.signInWithChatGPT",
                        "Sign in with ChatGPT",
                      )}
                    </button>
                    <button
                      className={`auth-method-tab ${openaiAuthMethod === "api_key" ? "active" : ""}`}
                      onClick={() => setOpenaiAuthMethod("api_key")}
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
                      </svg>
                      {translate("aiModels.common.apiKey", "API Key")}
                    </button>
                  </div>
                </div>

                {openaiAuthMethod === "oauth" && (
                  <div className="settings-section">
                    <h3>
                      {translate(
                        "aiModels.openai.chatgptAccount",
                        "ChatGPT Account",
                      )}
                    </h3>
                    {openaiOAuthConnected ? (
                      <div className="oauth-connected">
                        <div className="oauth-status">
                          <svg
                            width="20"
                            height="20"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
                            <path d="M22 4L12 14.01l-3-3" />
                          </svg>
                          <span>
                            {translate(
                              "aiModels.openai.connected",
                              "Connected to ChatGPT",
                            )}
                          </span>
                        </div>
                        <p className="settings-description">
                          {translate(
                            "aiModels.openai.connectedDescription",
                            "Your ChatGPT account is connected. You can use Codex GPT models with your subscription.",
                          )}
                        </p>
                        <button
                          className="button-small button-secondary"
                          onClick={handleOpenAIOAuthLogout}
                          disabled={openaiOAuthLoading}
                        >
                          {openaiOAuthLoading
                            ? translate(
                                "aiModels.openai.disconnecting",
                                "Disconnecting...",
                              )
                            : translate(
                                "aiModels.openai.disconnect",
                                "Disconnect Account",
                              )}
                        </button>
                      </div>
                    ) : (
                      <div className="oauth-login">
                        <p className="settings-description">
                          {translate(
                            "aiModels.openai.signInDescription",
                            "Sign in with your ChatGPT account to use Codex GPT models with your subscription.",
                          )}
                        </p>
                        <button
                          className="button-primary oauth-login-btn"
                          onClick={handleOpenAIOAuthLogin}
                          disabled={openaiOAuthLoading}
                        >
                          {openaiOAuthLoading ? (
                            <>
                              <svg
                                className="spinner"
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                              >
                                <path d="M21 12a9 9 0 11-6.219-8.56" />
                              </svg>
                              {translate(
                                "aiModels.openai.connecting",
                                "Connecting...",
                              )}
                            </>
                          ) : (
                            <>
                              <svg
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                              >
                                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                                <polyline points="10 17 15 12 10 7" />
                                <line x1="15" y1="12" x2="3" y2="12" />
                              </svg>
                              {translate(
                                "aiModels.openai.signInWithChatGPT",
                                "Sign in with ChatGPT",
                              )}
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {openaiAuthMethod === "api_key" && (
                  <div className="settings-section">
                    <h3>
                      {translate(
                        "aiModels.openai.apiKeyTitle",
                        "OpenAI API Key",
                      )}
                    </h3>
                    <p className="settings-description">
                      {translate(
                        "aiModels.openai.apiKeyDescription",
                        "Enter your API key from",
                      )}{" "}
                      <a
                        href="https://platform.openai.com/api-keys"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        OpenAI Platform
                      </a>
                    </p>
                    <div className="settings-input-group">
                      <input
                        type="password"
                        className="settings-input"
                        placeholder="sk-..."
                        value={openaiApiKey}
                        onChange={(e) => setOpenaiApiKey(e.target.value)}
                      />
                      <button
                        className="button-small button-secondary"
                        onClick={() => loadOpenAIModels(openaiApiKey)}
                        disabled={loadingOpenAIModels}
                      >
                        {loadingOpenAIModels
                          ? translate("aiModels.action.loading", "Loading...")
                          : translate(
                              "aiModels.action.refreshModels",
                              "Refresh Models",
                            )}
                      </button>
                    </div>
                  </div>
                )}

                <div className="settings-section">
                  <h3>{translate("aiModels.common.model", "Model")}</h3>
                  <p className="settings-description">
                    {openaiAuthMethod === "oauth" && openaiOAuthConnected
                      ? translate(
                          "aiModels.openai.modelOAuthDescription",
                          "Select a GPT model to use with your ChatGPT subscription.",
                        )
                      : translate(
                          "aiModels.openai.modelApiKeyDescription",
                          'Select a GPT model. Enter your API key and click "Refresh Models" to load available models.',
                        )}
                  </p>
                  {openaiModels.length > 0 ? (
                    <SearchableSelect
                      options={openaiModels.map((model) => ({
                        value: model.id,
                        label: model.name,
                        description: model.description,
                      }))}
                      value={openaiModel}
                      onChange={setOpenaiModel}
                      placeholder={translate(
                        "aiModels.common.selectModel",
                        "Select a model...",
                      )}
                      allowCustomValue
                    />
                  ) : (
                    <input
                      type="text"
                      className="settings-input"
                      placeholder="gpt-4o-mini"
                      value={openaiModel}
                      onChange={(e) => setOpenaiModel(e.target.value)}
                    />
                  )}
                  {openaiAuthMethod === "oauth" && openaiOAuthConnected && (
                    <button
                      className="button-small button-secondary"
                      onClick={() => loadOpenAIModels()}
                      disabled={loadingOpenAIModels}
                      style={{ marginTop: "8px" }}
                    >
                      {loadingOpenAIModels
                        ? translate("aiModels.action.loading", "Loading...")
                        : translate(
                            "aiModels.action.refreshModels",
                            "Refresh Models",
                          )}
                    </button>
                  )}
                </div>

                <div className="settings-section openai-request-controls">
                  <h3>
                    {translate(
                      "aiModels.openai.requestControls",
                      "OpenAI Request Controls",
                    )}
                  </h3>
                  <p className="settings-description">
                    {translate(
                      "aiModels.openai.requestControlsDescription",
                      "Applies to OpenAI models that support reasoning effort and response verbosity. Unsupported models keep their existing request behavior.",
                    )}
                  </p>
                  <div className="settings-form-grid two-columns">
                    <label className="settings-field">
                      <span>
                        {translate(
                          "aiModels.openai.reasoningEffort",
                          "Reasoning effort",
                        )}
                      </span>
                      <select
                        className="settings-select"
                        value={openaiReasoningEffort}
                        onChange={(e) =>
                          setOpenaiReasoningEffort(
                            e.target.value as OpenAIReasoningEffort,
                          )
                        }
                      >
                        {OPENAI_REASONING_EFFORT_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {translateRequestOptionLabel(option.label)}
                          </option>
                        ))}
                      </select>
                      <small>
                        {translateRequestOptionDescription(
                          OPENAI_REASONING_EFFORT_OPTIONS.find(
                            (option) => option.value === openaiReasoningEffort,
                          )?.description,
                        )}
                      </small>
                    </label>
                    <label className="settings-field">
                      <span>
                        {translate(
                          "aiModels.openai.responseVerbosity",
                          "Response verbosity",
                        )}
                      </span>
                      <select
                        className="settings-select"
                        value={openaiTextVerbosity}
                        onChange={(e) =>
                          setOpenaiTextVerbosity(
                            e.target.value as LLMTextVerbosity,
                          )
                        }
                      >
                        {OPENAI_TEXT_VERBOSITY_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {translateRequestOptionLabel(option.label)}
                          </option>
                        ))}
                      </select>
                      <small>
                        {translateRequestOptionDescription(
                          OPENAI_TEXT_VERBOSITY_OPTIONS.find(
                            (option) => option.value === openaiTextVerbosity,
                          )?.description,
                        )}
                      </small>
                    </label>
                  </div>
                </div>
              </>
            )}

            {(settings.providerType === "azure" ||
              settings.providerType === "azure-anthropic") && (
              <>
                <div className="settings-section">
                  <h3>Azure</h3>
                  <p className="settings-description">
                    {translate(
                      "aiModels.azure.description",
                      "Configure Azure OpenAI (GPT models) or Azure Anthropic (Claude models).",
                    )}
                  </p>
                  <div
                    className="auth-method-tabs"
                    style={{ marginBottom: "1rem" }}
                  >
                    <button
                      type="button"
                      className={`auth-method-tab ${settings.providerType === "azure" ? "active" : ""}`}
                      onClick={() => handleProviderSelect("azure")}
                    >
                      Azure OpenAI
                    </button>
                    <button
                      type="button"
                      className={`auth-method-tab ${settings.providerType === "azure-anthropic" ? "active" : ""}`}
                      onClick={() => handleProviderSelect("azure-anthropic")}
                    >
                      Azure Anthropic
                    </button>
                  </div>
                </div>

                {settings.providerType === "azure" && (
                  <>
                    <div className="settings-section">
                      <h3>
                        {translate(
                          "aiModels.azure.openaiEndpoint",
                          "Azure OpenAI Endpoint",
                        )}
                      </h3>
                      <p className="settings-description">
                        {translate(
                          "aiModels.azure.openaiEndpointDescription",
                          "Enter your Azure OpenAI resource endpoint.",
                        )}
                      </p>
                      <input
                        type="text"
                        className="settings-input"
                        placeholder="https://your-resource.openai.azure.com"
                        value={azureEndpoint}
                        onChange={(e) => setAzureEndpoint(e.target.value)}
                      />
                    </div>

                    <div className="settings-section">
                      <h3>
                        {translate(
                          "aiModels.azure.openaiApiKey",
                          "Azure OpenAI API Key",
                        )}
                      </h3>
                      <p className="settings-description">
                        {translate(
                          "aiModels.azure.openaiApiKeyDescription",
                          "Enter the API key for your Azure OpenAI resource.",
                        )}
                      </p>
                      <input
                        type="password"
                        className="settings-input"
                        placeholder={translate(
                          "aiModels.azure.apiKeyPlaceholder",
                          "Azure API key",
                        )}
                        value={azureApiKey}
                        onChange={(e) => setAzureApiKey(e.target.value)}
                      />
                    </div>

                    <div className="settings-section">
                      <h3>
                        {translate(
                          "aiModels.azure.deploymentNames",
                          "Deployment Names",
                        )}
                      </h3>
                      <p className="settings-description">
                        {translate(
                          "aiModels.azure.deploymentNamesDescription",
                          "Enter one or more deployment names, one per line. These appear in the model selector.",
                        )}
                      </p>
                      <textarea
                        className="settings-input"
                        placeholder="gpt-4o-mini\nmy-other-deployment"
                        rows={3}
                        value={azureDeploymentsText}
                        onChange={(e) =>
                          setAzureDeploymentsText(e.target.value)
                        }
                      />
                    </div>

                    <div className="settings-section">
                      <h3>
                        {translate(
                          "aiModels.azure.defaultDeployment",
                          "Default Deployment",
                        )}
                      </h3>
                      <p className="settings-description">
                        {translate(
                          "aiModels.azure.defaultDeploymentDescription",
                          "Optional. Used for connection tests and initial selection. You can switch models in the main view.",
                        )}
                      </p>
                      <input
                        type="text"
                        className="settings-input"
                        placeholder="gpt-4o-mini"
                        value={azureDeployment}
                        onChange={(e) => setAzureDeployment(e.target.value)}
                      />
                    </div>

                    <div className="settings-section">
                      <h3>
                        {translate("aiModels.common.apiVersion", "API Version")}
                      </h3>
                      <p className="settings-description">
                        {translate(
                          "aiModels.azure.apiVersionDescription",
                          "Optional override for the Azure OpenAI API version.",
                        )}
                      </p>
                      <input
                        type="text"
                        className="settings-input"
                        placeholder="2024-02-15-preview"
                        value={azureApiVersion}
                        onChange={(e) => setAzureApiVersion(e.target.value)}
                      />
                    </div>

                    <div className="settings-section">
                      <h3>
                        {translate(
                          "aiModels.openai.reasoningEffort",
                          "Reasoning Effort",
                        )}
                      </h3>
                      <p className="settings-description">
                        {translate(
                          "aiModels.azure.reasoningDescription",
                          "Controls how much reasoning Azure should spend on supported models. Extra High is stored in settings but sent as High to Azure requests.",
                        )}
                      </p>
                      <select
                        className="settings-input"
                        value={azureReasoningEffort}
                        onChange={(e) =>
                          setAzureReasoningEffort(
                            e.target.value as AzureReasoningEffort,
                          )
                        }
                      >
                        {AZURE_REASONING_EFFORT_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {translateRequestOptionLabel(option.label)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </>
                )}

                {settings.providerType === "azure-anthropic" && (
                  <>
                    <div className="settings-section">
                      <h3>
                        {translate(
                          "aiModels.azure.anthropicEndpoint",
                          "Azure Anthropic Endpoint",
                        )}
                      </h3>
                      <p className="settings-description">
                        {translate(
                          "aiModels.azure.anthropicEndpointDescription",
                          "Enter your Azure resource endpoint with the Anthropic path. The API uses the Anthropic Messages format with x-api-key and anthropic-version headers.",
                        )}
                      </p>
                      <input
                        type="text"
                        className="settings-input"
                        placeholder="https://your-resource.openai.azure.com/anthropic"
                        value={azureAnthropicEndpoint}
                        onChange={(e) =>
                          setAzureAnthropicEndpoint(e.target.value)
                        }
                      />
                    </div>

                    <div className="settings-section">
                      <h3>
                        {translate(
                          "aiModels.azure.anthropicApiKey",
                          "Azure Anthropic API Key",
                        )}
                      </h3>
                      <p className="settings-description">
                        {translate(
                          "aiModels.azure.anthropicApiKeyDescription",
                          "Enter the API key for your Azure OpenAI resource. This is usually the same key as Azure OpenAI.",
                        )}
                      </p>
                      <input
                        type="password"
                        className="settings-input"
                        placeholder={translate(
                          "aiModels.azure.apiKeyPlaceholder",
                          "Azure API key",
                        )}
                        value={azureAnthropicApiKey}
                        onChange={(e) =>
                          setAzureAnthropicApiKey(e.target.value)
                        }
                      />
                    </div>

                    <div className="settings-section">
                      <h3>
                        {translate(
                          "aiModels.azure.deploymentNames",
                          "Deployment Names",
                        )}
                      </h3>
                      <p className="settings-description">
                        {translate(
                          "aiModels.azure.anthropicDeploymentNamesDescription",
                          "Enter one or more deployment names, one per line.",
                        )}
                      </p>
                      <textarea
                        className="settings-input"
                        placeholder="claude-opus-4-6\nclaude-sonnet-4-6"
                        rows={3}
                        value={azureAnthropicDeploymentsText}
                        onChange={(e) =>
                          setAzureAnthropicDeploymentsText(e.target.value)
                        }
                      />
                    </div>

                    <div className="settings-section">
                      <h3>
                        {translate(
                          "aiModels.azure.defaultDeployment",
                          "Default Deployment",
                        )}
                      </h3>
                      <p className="settings-description">
                        {translate(
                          "aiModels.azure.anthropicDefaultDeploymentDescription",
                          "The deployment name to use.",
                        )}
                      </p>
                      <input
                        type="text"
                        className="settings-input"
                        placeholder="claude-opus-4-6"
                        value={azureAnthropicDeployment}
                        onChange={(e) =>
                          setAzureAnthropicDeployment(e.target.value)
                        }
                      />
                    </div>

                    <div className="settings-section">
                      <h3>
                        {translate("aiModels.common.apiVersion", "API Version")}
                      </h3>
                      <p className="settings-description">
                        {translate(
                          "aiModels.azure.anthropicApiVersionDescription",
                          "Anthropic API version.",
                        )}
                      </p>
                      <input
                        type="text"
                        className="settings-input"
                        placeholder="2023-06-01"
                        value={azureAnthropicApiVersion}
                        onChange={(e) =>
                          setAzureAnthropicApiVersion(e.target.value)
                        }
                      />
                    </div>
                  </>
                )}
              </>
            )}

            {settings.providerType === "groq" && (
              <>
                <div className="settings-section">
                  <h3>
                    {translate("aiModels.groq.apiKeyTitle", "Groq API Key")}
                  </h3>
                  <p className="settings-description">
                    {translate(
                      "aiModels.groq.apiKeyDescription",
                      "Enter your API key from",
                    )}{" "}
                    <a
                      href="https://console.groq.com/keys"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Groq Console
                    </a>
                  </p>
                  <div className="settings-input-group">
                    <input
                      type="password"
                      className="settings-input"
                      placeholder="gsk_..."
                      value={groqApiKey}
                      onChange={(e) => setGroqApiKey(e.target.value)}
                    />
                    <button
                      className="button-small button-secondary"
                      onClick={() => loadGroqModels(groqApiKey)}
                      disabled={loadingGroqModels}
                    >
                      {loadingGroqModels
                        ? translate("aiModels.action.loading", "Loading...")
                        : translate(
                            "aiModels.action.refreshModels",
                            "Refresh Models",
                          )}
                    </button>
                  </div>
                </div>

                <div className="settings-section">
                  <h3>{translate("aiModels.common.baseUrl", "Base URL")}</h3>
                  <p className="settings-description">
                    {translate(
                      "aiModels.groq.baseUrlDescription",
                      "Optional override for the Groq API endpoint.",
                    )}
                  </p>
                  <input
                    type="text"
                    className="settings-input"
                    placeholder="https://api.groq.com/openai/v1"
                    value={groqBaseUrl}
                    onChange={(e) => setGroqBaseUrl(e.target.value)}
                  />
                </div>

                <div className="settings-section">
                  <h3>{translate("aiModels.common.model", "Model")}</h3>
                  <p className="settings-description">
                    {translate(
                      "aiModels.groq.modelDescription",
                      'Select a Groq model. Enter your API key and click "Refresh Models" to load available models.',
                    )}
                  </p>
                  {groqModels.length > 0 ? (
                    <SearchableSelect
                      options={groqModels.map((model) => ({
                        value: model.id,
                        label: model.name,
                      }))}
                      value={groqModel}
                      onChange={setGroqModel}
                      placeholder={translate(
                        "aiModels.common.selectModel",
                        "Select a model...",
                      )}
                    />
                  ) : (
                    <input
                      type="text"
                      className="settings-input"
                      placeholder="llama-3.1-8b-instant"
                      value={groqModel}
                      onChange={(e) => setGroqModel(e.target.value)}
                    />
                  )}
                </div>
              </>
            )}

            {(settings.providerType === "xai" ||
              settings.providerType === "xai-oauth") && (
              <>
                <div className="settings-section">
                  <h3>
                    {translate("aiModels.xai.authTitle", "Grok Authentication")}
                  </h3>
                  <p className="settings-description">
                    {translate(
                      "aiModels.xai.authDescription",
                      "Use your SuperGrok subscription with browser OAuth, or use a direct xAI API key.",
                    )}
                  </p>
                  <div className="auth-method-tabs">
                    <button
                      type="button"
                      className={`auth-method-tab ${settings.providerType === "xai-oauth" ? "active" : ""}`}
                      onClick={() => handleProviderSelect("xai-oauth")}
                    >
                      {translate(
                        "aiModels.xai.superGrokSubscription",
                        "SuperGrok Subscription",
                      )}
                    </button>
                    <button
                      type="button"
                      className={`auth-method-tab ${settings.providerType === "xai" ? "active" : ""}`}
                      onClick={() => handleProviderSelect("xai")}
                    >
                      {translate("aiModels.xai.apiKeyTab", "xAI API Key")}
                    </button>
                  </div>
                </div>

                {settings.providerType === "xai-oauth" ? (
                  <div className="settings-section">
                    <h3>
                      {translate("aiModels.xai.accountTitle", "Grok Account")}
                    </h3>
                    {xaiOAuthConnected ? (
                      <div className="oauth-connected">
                        <div className="oauth-status">
                          <span>
                            {translate(
                              "aiModels.xai.connected",
                              "Connected to Grok",
                            )}
                          </span>
                        </div>
                        <p className="settings-description">
                          {translate(
                            "aiModels.xai.connectedDescription",
                            "Your Grok account is connected. NeoWorker will refresh the OAuth session automatically before model calls.",
                          )}
                        </p>
                        <button
                          className="button-small button-secondary"
                          onClick={handleXAIOAuthLogout}
                          disabled={xaiOAuthLoading}
                        >
                          {xaiOAuthLoading
                            ? translate(
                                "aiModels.openai.disconnecting",
                                "Disconnecting...",
                              )
                            : translate(
                                "aiModels.openai.disconnect",
                                "Disconnect Account",
                              )}
                        </button>
                      </div>
                    ) : (
                      <div className="oauth-login">
                        <p className="settings-description">
                          {translate(
                            "aiModels.xai.signInDescription",
                            "Sign in through xAI to use Grok and related subscription models without an API key.",
                          )}
                        </p>
                        <button
                          className="button-primary oauth-login-btn"
                          onClick={handleXAIOAuthLogin}
                          disabled={xaiOAuthLoading}
                        >
                          {xaiOAuthLoading
                            ? translate(
                                "aiModels.openai.connecting",
                                "Connecting...",
                              )
                            : translate(
                                "aiModels.xai.signInWithGrok",
                                "Sign in with Grok",
                              )}
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="settings-section">
                    <h3>
                      {translate("aiModels.xai.apiKeyTitle", "xAI API Key")}
                    </h3>
                    <p className="settings-description">
                      {translate(
                        "aiModels.xai.apiKeyDescription",
                        "Enter your API key from",
                      )}{" "}
                      <a
                        href="https://console.x.ai/"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        xAI Console
                      </a>
                    </p>
                    <div className="settings-input-group">
                      <input
                        type="password"
                        className="settings-input"
                        placeholder="xai-..."
                        value={xaiApiKey}
                        onChange={(e) => setXaiApiKey(e.target.value)}
                      />
                      <button
                        className="button-small button-secondary"
                        onClick={() => loadXAIModels(xaiApiKey)}
                        disabled={loadingXaiModels}
                      >
                        {loadingXaiModels
                          ? translate("aiModels.action.loading", "Loading...")
                          : translate(
                              "aiModels.action.refreshModels",
                              "Refresh Models",
                            )}
                      </button>
                    </div>
                  </div>
                )}

                <div className="settings-section">
                  <h3>{translate("aiModels.common.baseUrl", "Base URL")}</h3>
                  <p className="settings-description">
                    {translate(
                      "aiModels.xai.baseUrlDescription",
                      "Optional override for the xAI API endpoint. OAuth defaults to the same Responses-compatible endpoint used by Hermes.",
                    )}
                  </p>
                  <input
                    type="text"
                    className="settings-input"
                    placeholder="https://api.x.ai/v1"
                    value={xaiBaseUrl}
                    onChange={(e) => setXaiBaseUrl(e.target.value)}
                  />
                </div>

                <div className="settings-section">
                  <h3>{translate("aiModels.common.model", "Model")}</h3>
                  <p className="settings-description">
                    {translate(
                      "aiModels.xai.modelDescription",
                      "Select a Grok model. OAuth defaults to Grok 4.3.",
                    )}
                  </p>
                  {xaiModels.length > 0 ? (
                    <SearchableSelect
                      options={xaiModels.map((model) => ({
                        value: model.id,
                        label: model.name,
                      }))}
                      value={xaiModel}
                      onChange={setXaiModel}
                      placeholder={translate(
                        "aiModels.common.selectModel",
                        "Select a model...",
                      )}
                    />
                  ) : (
                    <input
                      type="text"
                      className="settings-input"
                      placeholder="grok-4.3"
                      value={xaiModel}
                      onChange={(e) => setXaiModel(e.target.value)}
                    />
                  )}
                </div>
              </>
            )}

            {settings.providerType === "deepseek" && (
              <>
                <div className="settings-section">
                  <h3>
                    {translate(
                      "aiModels.deepseek.apiKeyTitle",
                      "DeepSeek API Key",
                    )}
                  </h3>
                  <p className="settings-description">
                    {translate(
                      "aiModels.deepseek.apiKeyDescription",
                      "Enter your API key from",
                    )}{" "}
                    <a
                      href="https://platform.deepseek.com/api_keys"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      DeepSeek Platform
                    </a>
                  </p>
                  <div className="settings-input-group">
                    <input
                      type="password"
                      className="settings-input"
                      placeholder="sk-..."
                      value={deepseekApiKey}
                      onChange={(e) => setDeepseekApiKey(e.target.value)}
                    />
                    <button
                      className="button-small button-secondary"
                      onClick={() => loadDeepSeekModels(deepseekApiKey)}
                      disabled={loadingDeepseekModels}
                    >
                      {loadingDeepseekModels
                        ? translate("aiModels.action.loading", "Loading...")
                        : translate(
                            "aiModels.action.refreshModels",
                            "Refresh Models",
                          )}
                    </button>
                  </div>
                </div>

                <div className="settings-section">
                  <h3>{translate("aiModels.common.baseUrl", "Base URL")}</h3>
                  <p className="settings-description">
                    {translate(
                      "aiModels.deepseek.baseUrlDescription",
                      "Optional override for the DeepSeek API endpoint.",
                    )}
                  </p>
                  <input
                    type="text"
                    className="settings-input"
                    placeholder="https://api.deepseek.com"
                    value={deepseekBaseUrl}
                    onChange={(e) => setDeepseekBaseUrl(e.target.value)}
                  />
                </div>

                <div className="settings-section">
                  <h3>{translate("aiModels.common.model", "Model")}</h3>
                  <p className="settings-description">
                    {translate(
                      "aiModels.deepseek.modelDescription",
                      "Refresh the provider's available models, then select the models you want to use. DeepSeek Reasoner cannot run tool-using agent tasks.",
                    )}
                  </p>
                  {deepseekModels.length > 0 ? (
                    <SearchableSelect
                      options={deepseekModels.map((model) => ({
                        value: model.id,
                        label: model.name,
                      }))}
                      value={deepseekModel}
                      onChange={setDeepseekModel}
                      placeholder={translate(
                        "aiModels.common.selectModel",
                        "Select a model...",
                      )}
                    />
                  ) : (
                    <input
                      type="text"
                      className="settings-input"
                      placeholder="deepseek-chat"
                      value={deepseekModel}
                      onChange={(e) => setDeepseekModel(e.target.value)}
                    />
                  )}
                </div>
              </>
            )}

            {settings.providerType === "kimi" && (
              <>
                <div className="settings-section kimi-simple-setup">
                  <h3>
                    {translate("aiModels.kimi.connectTitle", "Connect Kimi")}
                  </h3>
                  <p className="settings-description">
                    {translate(
                      "aiModels.kimi.connectDescription",
                      "Paste your API key. NeoWorker will identify the correct account region and choose an available model automatically.",
                    )}
                  </p>
                  <a
                    className="kimi-get-key-link"
                    href="https://platform.kimi.com/console/api-keys"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {translate(
                      "aiModels.kimi.getKey",
                      "No API key? Get one from Kimi",
                    )}
                  </a>
                  <div className="settings-input-group kimi-connect-row">
                    <input
                      type="password"
                      className="settings-input"
                      placeholder={translate(
                        "aiModels.kimi.keyPlaceholder",
                        "Paste Kimi API key",
                      )}
                      value={kimiApiKey}
                      onChange={(e) => {
                        setKimiApiKey(e.target.value);
                        setKimiConnectionState("idle");
                        setKimiConnectionError(undefined);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !loadingKimiModels) {
                          void loadKimiModels(event.currentTarget.value);
                        }
                      }}
                    />
                    <button
                      className="button-small button-primary kimi-connect-button"
                      onClick={() => void loadKimiModels(kimiApiKey)}
                      disabled={loadingKimiModels || !kimiApiKey.trim()}
                    >
                      {loadingKimiModels
                        ? translate("aiModels.kimi.connecting", "Connecting...")
                        : translate(
                            "aiModels.kimi.connectAction",
                            "Connect Kimi",
                          )}
                    </button>
                  </div>

                  <div
                    className={`kimi-connection-status ${
                      loadingKimiModels ? "loading" : kimiConnectionState
                    }`}
                    role="status"
                    aria-live="polite"
                  >
                    <span className="kimi-connection-dot" aria-hidden="true" />
                    <span>
                      {loadingKimiModels
                        ? translate(
                            "aiModels.kimi.status.connecting",
                            "NeoWorker is checking your Kimi account.",
                          )
                        : kimiConnectionState === "success"
                          ? translate(
                              "aiModels.kimi.status.success",
                              "Connected and saved. Kimi is ready to use.",
                            )
                          : kimiConnectionState === "error"
                            ? kimiConnectionError === "missing_key"
                              ? translate(
                                  "aiModels.kimi.error.missingKey",
                                  "Paste your API key first.",
                                )
                              : kimiConnectionError === "invalid_key"
                                ? translate(
                                    "aiModels.kimi.error.invalidKey",
                                    "This key cannot be used. Copy the complete key again, or create a new one in Kimi.",
                                  )
                                : kimiConnectionError === "network"
                                  ? translate(
                                      "aiModels.kimi.error.network",
                                      "Kimi cannot be reached right now. Check your network and try again.",
                                    )
                                  : kimiConnectionError === "no_models"
                                    ? translate(
                                        "aiModels.kimi.error.noModels",
                                        "The key works, but Kimi has no available models right now. Try again later.",
                                      )
                                    : translate(
                                        "aiModels.kimi.error.unknown",
                                        "Kimi is temporarily unavailable. Try again later.",
                                      )
                            : translate(
                                "aiModels.kimi.status.idle",
                                "Paste the key and select Connect Kimi. The remaining setup is automatic.",
                              )}
                    </span>
                  </div>
                </div>

                <details className="kimi-advanced-settings">
                  <summary>
                    {translate(
                      "aiModels.kimi.advancedTitle",
                      "Advanced settings",
                    )}
                  </summary>
                  <p className="settings-description">
                    {translate(
                      "aiModels.kimi.advancedDescription",
                      "Only change these options when using a proxy service or a specific model.",
                    )}
                  </p>

                  <div className="settings-section">
                    <h3>{translate("aiModels.common.baseUrl", "Base URL")}</h3>
                    <input
                      type="text"
                      className="settings-input"
                      placeholder="https://api.moonshot.cn/v1"
                      value={kimiBaseUrl}
                      onChange={(e) => {
                        setKimiBaseUrl(e.target.value);
                        setKimiConnectionState("idle");
                      }}
                    />
                  </div>

                  <div className="settings-section">
                    <h3>{translate("aiModels.common.model", "Model")}</h3>
                    {kimiModels.length > 0 ? (
                      <SearchableSelect
                        options={kimiModels.map((model) => ({
                          value: model.id,
                          label: model.name,
                        }))}
                        value={kimiModel}
                        onChange={setKimiModel}
                        placeholder={translate(
                          "aiModels.common.selectModel",
                          "Select a model...",
                        )}
                      />
                    ) : (
                      <input
                        type="text"
                        className="settings-input"
                        placeholder="kimi-k3"
                        value={kimiModel}
                        onChange={(e) => setKimiModel(e.target.value)}
                      />
                    )}
                  </div>
                </details>
              </>
            )}

            {settings.providerType === "pi" && (
              <>
                <div className="settings-section">
                  <h3>
                    {translate(
                      "aiModels.pi.backendProvider",
                      "Pi Backend Provider",
                    )}
                  </h3>
                  <p className="settings-description">
                    {translate(
                      "aiModels.pi.backendDescriptionPrefix",
                      "Select which LLM provider to route through",
                    )}{" "}
                    <a
                      href="https://github.com/badlogic/pi-mono"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Pi
                    </a>
                    {translate(
                      "aiModels.pi.backendDescriptionSuffix",
                      "'s unified API.",
                    )}
                  </p>
                  <select
                    className="settings-select"
                    value={piProvider}
                    onChange={(e) => {
                      setPiProvider(e.target.value);
                      setPiModels([]);
                      setPiModel("");
                      loadPiModels(e.target.value);
                    }}
                  >
                    {piProviders.length > 0 ? (
                      piProviders.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))
                    ) : (
                      <>
                        <option value="anthropic">Anthropic</option>
                        <option value="openai">OpenAI</option>
                        <option value="google">Google</option>
                        <option value="xai">xAI</option>
                        <option value="groq">Groq</option>
                        <option value="cerebras">Cerebras</option>
                        <option value="openrouter">OpenRouter</option>
                        <option value="mistral">Mistral</option>
                        <option value="amazon-bedrock">Amazon Bedrock</option>
                        <option value="minimax">MiniMax</option>
                        <option value="huggingface">HuggingFace</option>
                      </>
                    )}
                  </select>
                </div>

                <div className="settings-section">
                  <h3>{translate("aiModels.common.apiKey", "API Key")}</h3>
                  <p className="settings-description">
                    {translate(
                      "aiModels.pi.apiKeyDescription",
                      "Enter the API key for the selected backend provider.",
                    )}
                  </p>
                  <div className="settings-input-group">
                    <input
                      type="password"
                      className="settings-input"
                      placeholder={translate(
                        "aiModels.common.enterApiKey",
                        "Enter API key...",
                      )}
                      value={piApiKey}
                      onChange={(e) => setPiApiKey(e.target.value)}
                    />
                    <button
                      className="button-small button-secondary"
                      onClick={() => loadPiModels(piProvider)}
                      disabled={loadingPiModels}
                    >
                      {loadingPiModels
                        ? translate("aiModels.action.loading", "Loading...")
                        : translate(
                            "aiModels.action.refreshModels",
                            "Refresh Models",
                          )}
                    </button>
                  </div>
                </div>

                <div className="settings-section">
                  <h3>{translate("aiModels.common.model", "Model")}</h3>
                  <p className="settings-description">
                    {translate(
                      "aiModels.pi.modelDescription",
                      "Select a model from Pi's model registry.",
                    )}
                  </p>
                  {piModels.length > 0 ? (
                    <SearchableSelect
                      options={piModels.map((model) => ({
                        value: model.id,
                        label: model.name,
                        description: model.description,
                      }))}
                      value={piModel}
                      onChange={setPiModel}
                      placeholder={translate(
                        "aiModels.common.selectModel",
                        "Select a model...",
                      )}
                    />
                  ) : (
                    <input
                      type="text"
                      className="settings-input"
                      placeholder="claude-sonnet-4-5-20250514"
                      value={piModel}
                      onChange={(e) => setPiModel(e.target.value)}
                    />
                  )}
                </div>
              </>
            )}

            {settings.providerType === "openai-compatible" && (
              <>
                <div className="settings-section">
                  <h3>{translate("aiModels.common.baseUrl", "Base URL")}</h3>
                  <p className="settings-description">
                    {translate(
                      "aiModels.openaiCompatible.baseUrlDescription",
                      "Enter the base URL of your OpenAI-compatible API endpoint (for example, vLLM, LM Studio, LocalAI, text-generation-webui).",
                    )}
                  </p>
                  <div className="settings-input-group">
                    <input
                      type="text"
                      className="settings-input"
                      placeholder="http://localhost:1234/v1"
                      value={openaiCompatBaseUrl}
                      onChange={(e) => setOpenaiCompatBaseUrl(e.target.value)}
                    />
                    <button
                      className="button-small button-secondary"
                      onClick={() => loadOpenAICompatibleModels()}
                      disabled={
                        loadingOpenAICompatModels || !openaiCompatBaseUrl
                      }
                    >
                      {loadingOpenAICompatModels
                        ? translate("aiModels.action.loading", "Loading...")
                        : translate(
                            "aiModels.action.fetchModels",
                            "Fetch Models",
                          )}
                    </button>
                  </div>
                </div>

                <div className="settings-section">
                  <h3>
                    {translate(
                      "aiModels.common.apiKeyOptional",
                      "API Key (Optional)",
                    )}
                  </h3>
                  <p className="settings-description">
                    {translate(
                      "aiModels.openaiCompatible.apiKeyDescription",
                      "API key is optional for local servers. Required for remote endpoints that need authentication.",
                    )}
                  </p>
                  <input
                    type="password"
                    className="settings-input"
                    placeholder="sk-..."
                    value={openaiCompatApiKey}
                    onChange={(e) => setOpenaiCompatApiKey(e.target.value)}
                  />
                </div>

                <div className="settings-section">
                  <h3>{translate("aiModels.common.model", "Model")}</h3>
                  <p className="settings-description">
                    {translate(
                      "aiModels.openaiCompatible.modelDescription",
                      'Select a model or enter a model ID. Click "Fetch Models" to load available models from the endpoint.',
                    )}
                  </p>
                  {openaiCompatModels.length > 0 ? (
                    <SearchableSelect
                      options={openaiCompatModels.map((model) => ({
                        value: model.key,
                        label: model.displayName,
                        description: model.description,
                      }))}
                      value={openaiCompatModel}
                      onChange={setOpenaiCompatModel}
                      placeholder={translate(
                        "aiModels.common.selectModel",
                        "Select a model...",
                      )}
                    />
                  ) : (
                    <input
                      type="text"
                      className="settings-input"
                      placeholder="model-name"
                      value={openaiCompatModel}
                      onChange={(e) => setOpenaiCompatModel(e.target.value)}
                    />
                  )}
                </div>

                <div className="settings-section">
                  <h3>
                    {translate(
                      "aiModels.imageInput.title",
                      "Image input capability",
                    )}
                  </h3>
                  <p className="settings-description">
                    {translate(
                      "aiModels.imageInput.description",
                      "Automatic detects known visual models such as Kimi K2.5/K2.6, GLM-V and MiniMax-VL. Override this when a gateway uses a custom model ID.",
                    )}
                  </p>
                  <select
                    className="settings-select"
                    value={
                      openaiCompatSupportsImages === undefined
                        ? "auto"
                        : openaiCompatSupportsImages
                          ? "enabled"
                          : "disabled"
                    }
                    onChange={(event) =>
                      setOpenaiCompatSupportsImages(
                        event.target.value === "auto"
                          ? undefined
                          : event.target.value === "enabled",
                      )
                    }
                  >
                    <option value="auto">
                      {translate(
                        "aiModels.imageInput.auto",
                        "Automatic (recommended)",
                      )}
                    </option>
                    <option value="enabled">
                      {translate(
                        "aiModels.imageInput.enabled",
                        "Supports image input",
                      )}
                    </option>
                    <option value="disabled">
                      {translate("aiModels.imageInput.disabled", "Text only")}
                    </option>
                  </select>
                </div>
              </>
            )}

            {settings.providerType === "moa" && (
              <>
                <div className="settings-section">
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "12px",
                    }}
                  >
                    <div>
                      <h3>
                        {translate(
                          "aiModels.moa.presetsTitle",
                          "Mixture of Agents Presets",
                        )}
                      </h3>
                      <p className="settings-description">
                        {translate(
                          "aiModels.moa.presetsDescription",
                          "Presets appear as virtual models. Advisors run without tools; the aggregator acts with the normal NeoWorker tool loop.",
                        )}
                      </p>
                    </div>
                    <button
                      className="button-small button-secondary"
                      type="button"
                      onClick={handleAddMoaPreset}
                    >
                      {translate("aiModels.moa.addPreset", "Add Preset")}
                    </button>
                  </div>

                  {moaPresetList.length > 0 ? (
                    <div style={{ marginTop: "12px" }}>
                      <label className="settings-label">
                        {translate(
                          "aiModels.moa.selectedPreset",
                          "Selected preset",
                        )}
                      </label>
                      <select
                        className="settings-select"
                        value={selectedMoaPresetId}
                        onChange={(event) =>
                          setSettings((prev) => ({
                            ...prev,
                            modelKey: event.target.value,
                            moa: {
                              ...prev.moa,
                              defaultPreset: event.target.value,
                            },
                          }))
                        }
                      >
                        {moaPresetList.map((preset) => (
                          <option key={preset.id} value={preset.id}>
                            {preset.name || preset.id}
                            {preset.enabled === false
                              ? ` ${translate("common.disabledSuffix", "(disabled)")}`
                              : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <p
                      className="settings-description"
                      style={{ marginTop: "12px" }}
                    >
                      {translate(
                        "aiModels.moa.noPresets",
                        "No presets configured.",
                      )}
                    </p>
                  )}
                </div>

                {selectedMoaPreset && (
                  <div className="settings-section">
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "12px",
                      }}
                    >
                      <h3>
                        {translate(
                          "aiModels.moa.presetDetails",
                          "Preset Details",
                        )}
                      </h3>
                      <button
                        className="button-small button-secondary"
                        type="button"
                        onClick={() =>
                          handleDeleteMoaPreset(selectedMoaPreset.id)
                        }
                      >
                        {translate("common.delete", "Delete")}
                      </button>
                    </div>

                    <label className="settings-label">
                      {translate("common.name", "Name")}
                    </label>
                    <input
                      className="settings-input"
                      value={selectedMoaPreset.name}
                      onChange={(event) =>
                        updateMoaPreset(selectedMoaPreset.id, (preset) => ({
                          ...preset,
                          name: event.target.value,
                        }))
                      }
                    />

                    <label
                      className="settings-label"
                      style={{ marginTop: "10px" }}
                    >
                      {translate("common.description", "Description")}
                    </label>
                    <input
                      className="settings-input"
                      value={selectedMoaPreset.description || ""}
                      onChange={(event) =>
                        updateMoaPreset(selectedMoaPreset.id, (preset) => ({
                          ...preset,
                          description: event.target.value,
                        }))
                      }
                      placeholder={translate("common.optional", "Optional")}
                    />

                    <label
                      className="settings-label"
                      style={{
                        marginTop: "12px",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedMoaPreset.enabled !== false}
                        onChange={(event) =>
                          updateMoaPreset(selectedMoaPreset.id, (preset) => ({
                            ...preset,
                            enabled: event.target.checked,
                          }))
                        }
                      />
                      {translate("common.enabled", "Enabled")}
                    </label>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns:
                          "repeat(auto-fit, minmax(160px, 1fr))",
                        gap: "10px",
                        marginTop: "12px",
                      }}
                    >
                      <div>
                        <label className="settings-label">
                          {translate(
                            "aiModels.moa.advisorTokens",
                            "Advisor tokens",
                          )}
                        </label>
                        <input
                          className="settings-input"
                          type="number"
                          min={64}
                          max={8192}
                          value={selectedMoaPreset.maxReferenceTokens || 1024}
                          onChange={(event) =>
                            updateMoaPreset(selectedMoaPreset.id, (preset) => ({
                              ...preset,
                              maxReferenceTokens: Number(event.target.value),
                            }))
                          }
                        />
                      </div>
                      <div>
                        <label className="settings-label">
                          {translate(
                            "aiModels.moa.advisorChars",
                            "Advisor chars",
                          )}
                        </label>
                        <input
                          className="settings-input"
                          type="number"
                          min={500}
                          max={50000}
                          value={
                            selectedMoaPreset.maxReferenceCharsPerModel || 12000
                          }
                          onChange={(event) =>
                            updateMoaPreset(selectedMoaPreset.id, (preset) => ({
                              ...preset,
                              maxReferenceCharsPerModel: Number(
                                event.target.value,
                              ),
                            }))
                          }
                        />
                      </div>
                      <div>
                        <label className="settings-label">
                          {translate("aiModels.moa.concurrency", "Concurrency")}
                        </label>
                        <input
                          className="settings-input"
                          type="number"
                          min={1}
                          max={8}
                          value={selectedMoaPreset.concurrency || 4}
                          onChange={(event) =>
                            updateMoaPreset(selectedMoaPreset.id, (preset) => ({
                              ...preset,
                              concurrency: Number(event.target.value),
                            }))
                          }
                        />
                      </div>
                    </div>
                  </div>
                )}

                {selectedMoaPreset && (
                  <div className="settings-section">
                    <h3>
                      {translate("aiModels.moa.aggregator", "Aggregator")}
                    </h3>
                    <p className="settings-description">
                      {translate(
                        "aiModels.moa.aggregatorDescription",
                        "The aggregator is the acting model and receives tools.",
                      )}
                    </p>
                    {renderMoaSlotEditor(
                      selectedMoaPreset.id,
                      selectedMoaPreset.aggregator,
                      "aggregator",
                    )}
                  </div>
                )}

                {selectedMoaPreset && (
                  <div className="settings-section">
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "12px",
                      }}
                    >
                      <div>
                        <h3>
                          {translate("aiModels.moa.advisors", "Advisors")}
                        </h3>
                        <p className="settings-description">
                          {translate(
                            "aiModels.moa.advisorsDescription",
                            "Advisors analyze the transcript in parallel without tools.",
                          )}
                        </p>
                      </div>
                      <button
                        className="button-small button-secondary"
                        type="button"
                        disabled={selectedMoaPreset.referenceModels.length >= 8}
                        onClick={() =>
                          updateMoaPreset(selectedMoaPreset.id, (preset) => ({
                            ...preset,
                            referenceModels: [
                              ...preset.referenceModels,
                              createDefaultMoaSlot(),
                            ],
                          }))
                        }
                      >
                        {translate("aiModels.moa.addAdvisor", "Add Advisor")}
                      </button>
                    </div>

                    {selectedMoaPreset.referenceModels.map((slot, index) => (
                      <div key={`${selectedMoaPreset.id}:ref:${index}`}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            marginTop: "12px",
                          }}
                        >
                          <strong>
                            {translate(
                              "aiModels.moa.advisorNumber",
                              "Advisor {index}",
                              { index: index + 1 },
                            )}
                          </strong>
                          <button
                            className="button-small button-secondary"
                            type="button"
                            disabled={
                              selectedMoaPreset.referenceModels.length <= 1
                            }
                            onClick={() =>
                              updateMoaPreset(
                                selectedMoaPreset.id,
                                (preset) => ({
                                  ...preset,
                                  referenceModels:
                                    preset.referenceModels.filter(
                                      (_, refIndex) => refIndex !== index,
                                    ),
                                }),
                              )
                            }
                          >
                            {translate("common.remove", "Remove")}
                          </button>
                        </div>
                        {renderMoaSlotEditor(
                          selectedMoaPreset.id,
                          slot,
                          "reference",
                          index,
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {selectedCustomProvider && (
              <>
                <div className="settings-section">
                  <h3>{selectedCustomProvider.apiKeyLabel}</h3>
                  {selectedCustomProvider.apiKeyUrl ? (
                    <p className="settings-description">
                      {translate(
                        "aiModels.custom.apiKeyDescription",
                        "Enter your API key from",
                      )}{" "}
                      <a
                        href={selectedCustomProvider.apiKeyUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {selectedCustomProvider.name}
                      </a>
                    </p>
                  ) : selectedCustomProvider.description ? (
                    <p className="settings-description">
                      {selectedCustomProvider.description}
                    </p>
                  ) : null}
                  <input
                    type="password"
                    className="settings-input"
                    placeholder={
                      selectedCustomProvider.apiKeyPlaceholder || "sk-..."
                    }
                    value={selectedCustomConfig.apiKey || ""}
                    onChange={(e) =>
                      updateCustomProvider(resolvedProviderType, {
                        apiKey: e.target.value,
                      })
                    }
                  />
                  {selectedCustomProvider.apiKeyOptional && (
                    <p className="settings-hint">
                      {translate(
                        "aiModels.custom.apiKeyOptionalHint",
                        "API key is optional for this provider.",
                      )}
                    </p>
                  )}
                </div>

                {(selectedCustomProvider.requiresBaseUrl ||
                  selectedCustomProvider.baseUrl) && (
                  <div className="settings-section">
                    <h3>{translate("aiModels.common.baseUrl", "Base URL")}</h3>
                    <p className="settings-description">
                      {selectedCustomProvider.requiresBaseUrl
                        ? translate(
                            "aiModels.custom.baseUrlRequired",
                            "Base URL is required for this provider.",
                          )
                        : translate(
                            "aiModels.custom.baseUrlOverride",
                            "Override the default base URL if needed.",
                          )}
                    </p>
                    <input
                      type="text"
                      className="settings-input"
                      placeholder={
                        selectedCustomProvider.baseUrl || "https://..."
                      }
                      value={selectedCustomConfig.baseUrl || ""}
                      onChange={(e) =>
                        updateCustomProvider(resolvedProviderType, {
                          baseUrl: e.target.value,
                        })
                      }
                    />
                  </div>
                )}

                <div className="settings-section">
                  <h3>{translate("aiModels.common.model", "Model")}</h3>
                  <p className="settings-description">
                    {translate(
                      "aiModels.custom.modelDescription",
                      "Select a model for {provider}.",
                      {
                        provider: selectedCustomProvider.name,
                      },
                    )}{" "}
                    <button
                      className="button-small button-secondary"
                      onClick={() =>
                        loadCustomProviderModels(resolvedProviderType)
                      }
                      disabled={
                        loadingCustomProviderModels ||
                        (selectedCustomProvider.requiresBaseUrl &&
                          !(
                            selectedCustomConfig.baseUrl ||
                            selectedCustomProvider.baseUrl
                          ))
                      }
                      style={{ marginLeft: "8px" }}
                    >
                      {loadingCustomProviderModels
                        ? translate("aiModels.action.loading", "Loading...")
                        : translate(
                            "aiModels.action.refreshModels",
                            "Refresh Models",
                          )}
                    </button>
                  </p>
                  {selectedCustomModels.length > 0 ? (
                    <SearchableSelect
                      options={selectedCustomModels.map((model) => ({
                        value: model.key,
                        label: model.displayName,
                        description: model.description,
                      }))}
                      value={selectedCustomConfig.model || ""}
                      onChange={(value) =>
                        updateCustomProvider(resolvedProviderType, {
                          model: value,
                        })
                      }
                      placeholder={translate(
                        "aiModels.common.selectModel",
                        "Select a model...",
                      )}
                    />
                  ) : (
                    <input
                      type="text"
                      className="settings-input"
                      placeholder={
                        selectedCustomProvider.defaultModel || "model-id"
                      }
                      value={selectedCustomConfig.model || ""}
                      onChange={(e) =>
                        updateCustomProvider(resolvedProviderType, {
                          model: e.target.value,
                        })
                      }
                    />
                  )}
                </div>

                <div className="settings-section">
                  <h3>
                    {translate(
                      "aiModels.imageInput.title",
                      "Image input capability",
                    )}
                  </h3>
                  <p className="settings-description">
                    {translate(
                      "aiModels.imageInput.description",
                      "Automatic detects known visual models such as Kimi K2.5/K2.6, GLM-V and MiniMax-VL. Override this when a gateway uses a custom model ID.",
                    )}
                  </p>
                  <select
                    className="settings-select"
                    value={
                      selectedCustomConfig.supportsImages === undefined
                        ? "auto"
                        : selectedCustomConfig.supportsImages
                          ? "enabled"
                          : "disabled"
                    }
                    onChange={(event) =>
                      updateCustomProvider(resolvedProviderType, {
                        supportsImages:
                          event.target.value === "auto"
                            ? undefined
                            : event.target.value === "enabled",
                      })
                    }
                  >
                    <option value="auto">
                      {translate(
                        "aiModels.imageInput.auto",
                        "Automatic (recommended)",
                      )}
                    </option>
                    <option value="enabled">
                      {translate(
                        "aiModels.imageInput.enabled",
                        "Supports image input",
                      )}
                    </option>
                    <option value="disabled">
                      {translate("aiModels.imageInput.disabled", "Text only")}
                    </option>
                  </select>
                </div>
              </>
            )}

            {resolvedProviderType === "hf-agents" && (
              <>
                {/* Installation status */}
                <div className="settings-section">
                  <h3>
                    {translate("aiModels.local.statusTitle", "Local AI Status")}
                  </h3>
                  {hfStatus === null ? (
                    <p className="settings-description">
                      {translate(
                        "aiModels.local.checkingInstall",
                        "Checking hf-agents installation...",
                      )}
                    </p>
                  ) : hfStatus.installed ? (
                    <p
                      className="settings-description"
                      style={{ color: "var(--color-success, #16a34a)" }}
                    >
                      {translate(
                        "aiModels.local.installed",
                        "hf-agents {version} installed",
                        {
                          version: hfStatus.version,
                        },
                      )}
                    </p>
                  ) : (
                    <div>
                      <p
                        className="settings-description"
                        style={{ color: "var(--color-warning, #d97706)" }}
                      >
                        {hfStatus.message}
                      </p>
                      <div
                        style={{
                          background:
                            "var(--color-bg-secondary, rgba(0,0,0,0.1))",
                          borderRadius: "6px",
                          padding: "10px 12px",
                          marginTop: "8px",
                          fontFamily: "monospace",
                          fontSize: "12px",
                          display: "flex",
                          flexDirection: "column",
                          gap: "4px",
                        }}
                      >
                        {!hfStatus.hfInstalled && (
                          <span># Step 1 — install hf CLI</span>
                        )}
                        {!hfStatus.hfInstalled && (
                          <span>pip install huggingface_hub</span>
                        )}
                        <span
                          style={{
                            marginTop: !hfStatus.hfInstalled ? "6px" : 0,
                          }}
                        >
                          {!hfStatus.hfInstalled
                            ? "# Step 2 — install agents extension"
                            : "# Install agents extension"}
                        </span>
                        <span>hf extensions install hf-agents</span>
                      </div>
                    </div>
                  )}
                  {/* Server running indicator */}
                  <div
                    style={{
                      marginTop: "10px",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <span
                      style={{
                        width: "10px",
                        height: "10px",
                        borderRadius: "50%",
                        background: hfServerStatus?.serverRunning
                          ? "var(--color-success, #16a34a)"
                          : hfServerStatus?.processAlive
                            ? "var(--color-warning, #d97706)"
                            : "var(--color-text-muted, #888)",
                        flexShrink: 0,
                      }}
                    />
                    <span
                      className="settings-description"
                      style={{ margin: 0 }}
                    >
                      {hfServerStatus?.serverRunning
                        ? translate(
                            "aiModels.local.serverRunning",
                            "Server running on :8080{model}",
                            {
                              model: hfServerStatus.models?.length
                                ? ` · ${hfServerStatus.models[0]}`
                                : "",
                            },
                          )
                        : hfServerStatus?.processAlive
                          ? translate(
                              "aiModels.local.serverStarting",
                              "Starting… (model may be downloading)",
                            )
                          : translate(
                              "aiModels.local.serverNotRunning",
                              "Server not running",
                            )}
                    </span>
                  </div>
                  {/* Live server log panel — shown while starting or after error */}
                  {serverLog && !hfServerStatus?.serverRunning && (
                    <div
                      style={{
                        marginTop: "10px",
                        borderRadius: "8px",
                        overflow: "hidden",
                        border:
                          "1px solid var(--color-border, rgba(0,0,0,0.1))",
                      }}
                    >
                      {/* Status bar */}
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          padding: "6px 10px",
                          background:
                            serverLog.state === "error"
                              ? "rgba(220,38,38,0.08)"
                              : serverLog.state === "downloading"
                                ? "rgba(59,130,246,0.08)"
                                : "rgba(0,0,0,0.04)",
                          borderBottom:
                            "1px solid var(--color-border, rgba(0,0,0,0.08))",
                        }}
                      >
                        {serverLog.state !== "error" && (
                          <span
                            style={{
                              display: "inline-block",
                              width: "8px",
                              height: "8px",
                              borderRadius: "50%",
                              background:
                                serverLog.state === "downloading"
                                  ? "#3b82f6"
                                  : "#f59e0b",
                              animation: "pulse 1.5s ease-in-out infinite",
                            }}
                          />
                        )}
                        {serverLog.state === "error" && (
                          <span
                            style={{ color: "var(--color-error, #dc2626)" }}
                          >
                            ⚠
                          </span>
                        )}
                        <span style={{ fontSize: "12px", fontWeight: 500 }}>
                          {serverLog.state === "downloading"
                            ? translate(
                                "aiModels.local.downloading",
                                "Downloading{target}…",
                                {
                                  target: serverLog.downloadingFile
                                    ? ` ${serverLog.downloadingFile}`
                                    : " model",
                                },
                              )
                            : serverLog.state === "loading"
                              ? translate(
                                  "aiModels.local.loadingModel",
                                  "Loading model into memory…",
                                )
                              : serverLog.state === "error"
                                ? translate(
                                    "aiModels.local.serverFailed",
                                    "Server failed to start",
                                  )
                                : translate(
                                    "aiModels.local.startingServer",
                                    "Starting server…",
                                  )}
                        </span>
                      </div>
                      {/* Log lines */}
                      <pre
                        style={{
                          margin: 0,
                          padding: "8px 10px",
                          fontSize: "10px",
                          lineHeight: "1.5",
                          fontFamily: "monospace",
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-all",
                          maxHeight: "160px",
                          overflowY: "auto",
                          background:
                            "var(--color-bg-secondary, rgba(0,0,0,0.04))",
                          color: "var(--color-text-secondary, #666)",
                        }}
                      >
                        {serverLog.lines.join("\n")}
                      </pre>
                    </div>
                  )}
                </div>

                {/* Hardware detection */}
                <div className="settings-section">
                  <h3>
                    {translate(
                      "aiModels.local.detectHardware",
                      "Detect Hardware",
                    )}
                  </h3>
                  <p className="settings-description">
                    {translate(
                      "aiModels.local.detectDescription",
                      "Run `hf agents fit` to detect your hardware and get model recommendations. The best model will be selected automatically.",
                    )}
                  </p>
                  <button
                    className="button-small button-secondary"
                    onClick={handleHfDetectHardware}
                    disabled={detectingHardware || !hfStatus?.installed}
                  >
                    {detectingHardware
                      ? translate("aiModels.local.detecting", "Detecting...")
                      : translate(
                          "aiModels.local.detectHardware",
                          "Detect Hardware",
                        )}
                  </button>
                  {hfHardwareOutput &&
                    (hfHardwareOutput.modelDetails?.length ??
                      hfHardwareOutput.models?.length ??
                      0) > 0 && (
                      <div style={{ marginTop: "12px" }}>
                        {/* Model list — show all, mark MLX-only as not usable with llama-server */}
                        {(hfHardwareOutput.modelDetails ?? []).length > 0 ? (
                          <>
                            <p
                              className="settings-description"
                              style={{ marginBottom: "8px" }}
                            >
                              {translate(
                                "aiModels.local.recommendedModels",
                                "Recommended models for your hardware. Click a model to select it.",
                              )}{" "}
                              <span
                                style={{
                                  color: "var(--color-success, #16a34a)",
                                }}
                              >
                                GGUF
                              </span>{" "}
                              runs via llama-server.{" "}
                              {hfStatus?.mlxInstalled === "ok" ? (
                                <>
                                  <span style={{ color: "#8b5cf6" }}>MLX</span>{" "}
                                  runs natively on Apple Silicon via mlx_lm —
                                  fastest on your M-series Mac.
                                </>
                              ) : hfStatus?.isMac ? (
                                <>
                                  <span
                                    style={{
                                      color: "var(--color-text-muted, #888)",
                                    }}
                                  >
                                    MLX
                                  </span>{" "}
                                  models require mlx_lm (see below).
                                </>
                              ) : (
                                <>
                                  <span
                                    style={{
                                      color: "var(--color-text-muted, #888)",
                                    }}
                                  >
                                    MLX
                                  </span>{" "}
                                  requires Apple Silicon.
                                </>
                              )}
                            </p>
                            {hfStatus?.isMac &&
                              hfStatus.mlxInstalled !== "ok" && (
                                <div
                                  style={{
                                    marginBottom: "8px",
                                    padding: "7px 10px",
                                    borderRadius: "6px",
                                    background: "rgba(139,92,246,0.08)",
                                    border: "1px solid rgba(139,92,246,0.25)",
                                  }}
                                >
                                  <span style={{ fontSize: "12px" }}>
                                    {hfStatus.mlxInstalled === "broken" ? (
                                      <>
                                        {hfStatus.mlxMessage ||
                                          translate(
                                            "aiModels.local.mlxBroken",
                                            "MLX installed but broken.",
                                          )}{" "}
                                        <code style={{ fontSize: "11px" }}>
                                          pip install mlx mlx-metal
                                          --force-reinstall --no-cache-dir
                                        </code>
                                      </>
                                    ) : (
                                      <>
                                        {translate(
                                          "aiModels.local.mlxNotInstalled",
                                          "MLX not installed. To use MLX models:",
                                        )}{" "}
                                        <code style={{ fontSize: "11px" }}>
                                          pip install mlx-lm
                                        </code>
                                      </>
                                    )}
                                  </span>
                                </div>
                              )}
                            <div
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: "4px",
                                marginBottom: "10px",
                                maxHeight: "280px",
                                overflowY: "auto",
                                paddingRight: "2px",
                              }}
                            >
                              {hfHardwareOutput.modelDetails!.map((m, i) => (
                                <div
                                  key={m.spec}
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "8px",
                                    padding: "6px 10px",
                                    borderRadius: "6px",
                                    background:
                                      "var(--color-bg-secondary, rgba(0,0,0,0.06))",
                                    opacity:
                                      m.hasGguf ||
                                      (m.runtime === "MLX" &&
                                        hfStatus?.mlxInstalled === "ok")
                                        ? 1
                                        : 0.4,
                                    cursor:
                                      m.hasGguf ||
                                      (m.runtime === "MLX" &&
                                        hfStatus?.mlxInstalled === "ok")
                                        ? "pointer"
                                        : "not-allowed",
                                  }}
                                  onClick={() => {
                                    const input = document.getElementById(
                                      "hf-model-input",
                                    ) as HTMLInputElement;
                                    if (!input) return;
                                    if (m.hasGguf) {
                                      input.value = m.spec;
                                    } else if (
                                      m.runtime === "MLX" &&
                                      hfStatus?.mlxInstalled === "ok"
                                    ) {
                                      input.value = `mlx://${m.name}`;
                                    }
                                  }}
                                >
                                  <span
                                    style={{
                                      fontSize: "10px",
                                      fontWeight: 600,
                                      padding: "1px 5px",
                                      borderRadius: "3px",
                                      background: m.hasGguf
                                        ? "var(--color-success, #16a34a)"
                                        : m.runtime === "MLX" &&
                                            hfStatus?.mlxInstalled === "ok"
                                          ? "#8b5cf6"
                                          : "var(--color-text-muted, #888)",
                                      color: "#fff",
                                      flexShrink: 0,
                                    }}
                                  >
                                    {m.runtime}
                                  </span>
                                  <span
                                    style={{
                                      flex: 1,
                                      fontSize: "12px",
                                      fontFamily: "monospace",
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                      whiteSpace: "nowrap",
                                    }}
                                  >
                                    {m.name}
                                    {i === 0 && (
                                      <span
                                        style={{
                                          marginLeft: "6px",
                                          fontSize: "10px",
                                          color:
                                            "var(--color-text-muted, #888)",
                                        }}
                                      >
                                        {translate(
                                          "settings.modelCatalog.best",
                                          "★ best",
                                        )}
                                      </span>
                                    )}
                                  </span>
                                  <span
                                    style={{
                                      fontSize: "11px",
                                      color: "var(--color-text-muted, #888)",
                                      flexShrink: 0,
                                    }}
                                  >
                                    {m.params}
                                    {m.memoryGb ? ` · ${m.memoryGb}GB` : ""}
                                    {m.tps ? ` · ~${m.tps}tok/s` : ""}
                                  </span>
                                </div>
                              ))}
                            </div>
                            {/* Smaller model quick-picks — always shown since hf agents fit only recommends top-scoring (large) models */}
                            <div
                              style={{
                                marginBottom: "8px",
                                padding: "8px 10px",
                                borderRadius: "6px",
                                background:
                                  "var(--color-bg-secondary, rgba(0,0,0,0.04))",
                                border:
                                  "1px solid var(--color-border, rgba(0,0,0,0.08))",
                              }}
                            >
                              <p
                                className="settings-description"
                                style={{
                                  margin: "0 0 8px 0",
                                  fontSize: "11px",
                                }}
                              >
                                {translate(
                                  "aiModels.local.smallerModels",
                                  "Smaller models (faster download, great for most tasks):",
                                )}
                              </p>
                              {hfStatus?.mlxInstalled === "ok" && (
                                <div style={{ marginBottom: "6px" }}>
                                  <span
                                    style={{
                                      fontSize: "10px",
                                      fontWeight: 600,
                                      color: "#8b5cf6",
                                      marginRight: "6px",
                                    }}
                                  >
                                    MLX
                                  </span>
                                  {[
                                    {
                                      label: "Qwen3-8B · ~5GB · fast",
                                      spec: "mlx://mlx-community/Qwen3-8B-4bit",
                                    },
                                    {
                                      label: "Qwen3-14B · ~9GB",
                                      spec: "mlx://mlx-community/Qwen3-14B-4bit",
                                    },
                                    {
                                      label: "Qwen3-30B-A3B · ~19GB",
                                      spec: "mlx://mlx-community/Qwen3-30B-A3B-4bit",
                                    },
                                  ].map(({ label, spec }) => (
                                    <button
                                      key={spec}
                                      className="button-small button-secondary"
                                      style={{
                                        fontSize: "11px",
                                        marginRight: "4px",
                                        borderColor: "#8b5cf6",
                                        color: "#8b5cf6",
                                      }}
                                      onClick={() => {
                                        const input = document.getElementById(
                                          "hf-model-input",
                                        ) as HTMLInputElement;
                                        if (input) input.value = spec;
                                      }}
                                    >
                                      {label}
                                    </button>
                                  ))}
                                </div>
                              )}
                              <div>
                                <span
                                  style={{
                                    fontSize: "10px",
                                    fontWeight: 600,
                                    color: "var(--color-success, #16a34a)",
                                    marginRight: "6px",
                                  }}
                                >
                                  GGUF
                                </span>
                                {[
                                  {
                                    label: "Qwen3-8B · ~5GB · fast",
                                    spec: "unsloth/Qwen3-8B-GGUF:Q4_K_M",
                                  },
                                  {
                                    label: "Qwen3-14B · ~9GB",
                                    spec: "unsloth/Qwen3-14B-GGUF:Q4_K_M",
                                  },
                                  {
                                    label: "Qwen3-32B · ~20GB",
                                    spec: "unsloth/Qwen3-32B-GGUF:Q4_K_M",
                                  },
                                ].map(({ label, spec }) => (
                                  <button
                                    key={spec}
                                    className="button-small button-secondary"
                                    style={{
                                      fontSize: "11px",
                                      marginRight: "4px",
                                    }}
                                    onClick={() => {
                                      const input = document.getElementById(
                                        "hf-model-input",
                                      ) as HTMLInputElement;
                                      if (input) input.value = spec;
                                    }}
                                  >
                                    {label}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </>
                        ) : null}
                        <div
                          style={{
                            display: "flex",
                            gap: "8px",
                            alignItems: "center",
                          }}
                        >
                          <input
                            id="hf-model-input"
                            className="settings-input"
                            style={{ flex: 1, fontSize: "12px" }}
                            defaultValue={hfHardwareOutput.models[0] ?? ""}
                            placeholder="e.g. unsloth/Qwen3-4B-GGUF:Q4_K_M"
                          />
                          <button
                            className="button-small button-primary"
                            onClick={() => {
                              const input = document.getElementById(
                                "hf-model-input",
                              ) as HTMLInputElement;
                              if (input?.value)
                                updateCustomProvider("hf-agents", {
                                  model: input.value,
                                });
                            }}
                          >
                            {translate("common.use", "Use")}
                          </button>
                        </div>
                      </div>
                    )}
                  {hfHardwareOutput && hfHardwareOutput.output && (
                    <details style={{ marginTop: "8px" }}>
                      <summary
                        style={{
                          fontSize: "11px",
                          cursor: "pointer",
                          color: "var(--color-text-secondary, #888)",
                        }}
                      >
                        {translate("aiModels.local.rawOutput", "Raw output")}
                      </summary>
                      <pre
                        style={{
                          marginTop: "4px",
                          fontSize: "11px",
                          maxHeight: "160px",
                          overflow: "auto",
                          background:
                            "var(--color-bg-secondary, rgba(0,0,0,0.1))",
                          padding: "8px",
                          borderRadius: "4px",
                        }}
                      >
                        {hfHardwareOutput.output}
                      </pre>
                    </details>
                  )}
                </div>

                {/* Start / Stop server */}
                <div className="settings-section">
                  <h3>
                    {translate(
                      "aiModels.local.serverControl",
                      "Server Control",
                    )}
                  </h3>
                  <p className="settings-description">
                    {translate(
                      "aiModels.local.serverControlDescription",
                      "Start the llama.cpp server with your selected model. The server exposes an OpenAI-compatible API at http://localhost:8080.",
                    )}
                  </p>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button
                      className="button-small button-primary"
                      onClick={handleHfStartServer}
                      disabled={
                        startingServer ||
                        !hfStatus?.installed ||
                        hfServerStatus?.serverRunning
                      }
                    >
                      {startingServer
                        ? translate("aiModels.local.starting", "Starting...")
                        : translate(
                            "aiModels.local.startServer",
                            "Start Server",
                          )}
                    </button>
                    <button
                      className="button-small button-secondary"
                      onClick={handleHfStopServer}
                      disabled={stoppingServer || !hfServerStatus?.processAlive}
                    >
                      {stoppingServer
                        ? translate("aiModels.local.stopping", "Stopping...")
                        : translate("aiModels.local.stopServer", "Stop Server")}
                    </button>
                  </div>
                </div>
              </>
            )}

            {settings.providerType === "bedrock" && (
              <>
                <div className="settings-section">
                  <h3>{translate("aiModels.bedrock.region", "AWS Region")}</h3>
                  <select
                    className="settings-select"
                    value={awsRegion}
                    onChange={(e) => setAwsRegion(e.target.value)}
                  >
                    <option value="us-east-1">
                      {translate(
                        "aiModels.bedrock.region.usEast1",
                        "US East (N. Virginia)",
                      )}
                    </option>
                    <option value="us-west-2">
                      {translate(
                        "aiModels.bedrock.region.usWest2",
                        "US West (Oregon)",
                      )}
                    </option>
                    <option value="eu-west-1">
                      {translate(
                        "aiModels.bedrock.region.euWest1",
                        "Europe (Ireland)",
                      )}
                    </option>
                    <option value="eu-central-1">
                      {translate(
                        "aiModels.bedrock.region.euCentral1",
                        "Europe (Frankfurt)",
                      )}
                    </option>
                    <option value="ap-northeast-1">
                      {translate(
                        "aiModels.bedrock.region.apNortheast1",
                        "Asia Pacific (Tokyo)",
                      )}
                    </option>
                    <option value="ap-southeast-1">
                      {translate(
                        "aiModels.bedrock.region.apSoutheast1",
                        "Asia Pacific (Singapore)",
                      )}
                    </option>
                    <option value="ap-southeast-2">
                      {translate(
                        "aiModels.bedrock.region.apSoutheast2",
                        "Asia Pacific (Sydney)",
                      )}
                    </option>
                  </select>
                </div>

                <div className="settings-section">
                  <h3>
                    {translate(
                      "aiModels.bedrock.credentials",
                      "AWS Credentials",
                    )}
                  </h3>

                  <label className="settings-checkbox">
                    <input
                      type="checkbox"
                      checked={useDefaultCredentials}
                      onChange={(e) =>
                        setUseDefaultCredentials(e.target.checked)
                      }
                    />
                    <span>
                      {translate(
                        "aiModels.bedrock.useDefaultCredentials",
                        "Use default credential chain (recommended)",
                      )}
                    </span>
                  </label>

                  {useDefaultCredentials ? (
                    <div className="settings-subsection">
                      <p className="settings-description">
                        {translate(
                          "aiModels.bedrock.defaultCredentialsDescription",
                          "Uses AWS credentials from environment variables, shared credentials file (~/.aws/credentials), or IAM role.",
                        )}
                      </p>
                      <input
                        type="text"
                        className="settings-input"
                        placeholder={translate(
                          "aiModels.bedrock.profilePlaceholder",
                          "AWS Profile (optional, e.g., 'default')",
                        )}
                        value={awsProfile}
                        onChange={(e) => setAwsProfile(e.target.value)}
                      />
                    </div>
                  ) : (
                    <div className="settings-subsection">
                      <input
                        type="text"
                        className="settings-input"
                        placeholder={translate(
                          "aiModels.bedrock.accessKeyPlaceholder",
                          "AWS Access Key ID",
                        )}
                        value={awsAccessKeyId}
                        onChange={(e) => setAwsAccessKeyId(e.target.value)}
                      />
                      <input
                        type="password"
                        className="settings-input"
                        placeholder={translate(
                          "aiModels.bedrock.secretKeyPlaceholder",
                          "AWS Secret Access Key",
                        )}
                        value={awsSecretAccessKey}
                        onChange={(e) => setAwsSecretAccessKey(e.target.value)}
                      />
                    </div>
                  )}
                </div>

                <div className="settings-section">
                  <h3>{translate("aiModels.common.model", "Model")}</h3>
                  <p className="settings-description">
                    {translate(
                      "aiModels.bedrock.modelDescription",
                      "Select a Claude model from AWS Bedrock.",
                    )}{" "}
                    <button
                      className="button-small button-secondary"
                      onClick={loadBedrockModels}
                      disabled={loadingBedrockModels}
                      style={{ marginLeft: "8px" }}
                    >
                      {loadingBedrockModels
                        ? translate("aiModels.action.loading", "Loading...")
                        : translate(
                            "aiModels.action.refreshModels",
                            "Refresh Models",
                          )}
                    </button>
                  </p>
                  {bedrockModels.length > 0 ? (
                    <SearchableSelect
                      options={bedrockModels.map((model) => ({
                        value: model.id,
                        label: model.name,
                        description: model.description,
                      }))}
                      value={bedrockModel}
                      onChange={setBedrockModel}
                      placeholder={translate(
                        "aiModels.common.selectModel",
                        "Select a model...",
                      )}
                    />
                  ) : (
                    <select
                      className="settings-select"
                      value={settings.modelKey}
                      onChange={(e) =>
                        setSettings({ ...settings, modelKey: e.target.value })
                      }
                    >
                      {models.map((model) => (
                        <option key={model.key} value={model.key}>
                          {model.displayName}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </>
            )}

            {settings.providerType === "ollama" && (
              <>
                <div className="settings-section">
                  <h3>
                    {translate(
                      "aiModels.ollama.serverUrl",
                      "Ollama Server URL",
                    )}
                  </h3>
                  <p className="settings-description">
                    {translate(
                      "aiModels.ollama.serverUrlDescription",
                      "URL of your Ollama server. Default is http://localhost:11434 for local installations.",
                    )}
                  </p>
                  <div className="settings-input-group">
                    <input
                      type="text"
                      className="settings-input"
                      placeholder="http://localhost:11434"
                      value={ollamaBaseUrl}
                      onChange={(e) => setOllamaBaseUrl(e.target.value)}
                    />
                    <button
                      className="button-small button-secondary"
                      onClick={() => loadOllamaModels(ollamaBaseUrl)}
                      disabled={loadingOllamaModels}
                    >
                      {loadingOllamaModels
                        ? translate("aiModels.action.loading", "Loading...")
                        : translate(
                            "aiModels.action.refreshModels",
                            "Refresh Models",
                          )}
                    </button>
                  </div>
                </div>

                <div className="settings-section">
                  <h3>{translate("aiModels.common.model", "Model")}</h3>
                  <p className="settings-description">
                    {translate(
                      "aiModels.ollama.modelDescription",
                      "Select from models available on your Ollama server, or enter a custom model name.",
                    )}
                  </p>
                  {ollamaModels.length > 0 ? (
                    <SearchableSelect
                      options={ollamaModels.map((model) => ({
                        value: model.name,
                        label: model.name,
                        description: formatBytes(model.size),
                      }))}
                      value={ollamaModel}
                      onChange={setOllamaModel}
                      placeholder={translate(
                        "aiModels.common.selectModel",
                        "Select a model...",
                      )}
                    />
                  ) : (
                    <input
                      type="text"
                      className="settings-input"
                      placeholder="llama3.2"
                      value={ollamaModel}
                      onChange={(e) => setOllamaModel(e.target.value)}
                    />
                  )}
                  <p className="settings-hint">
                    {translate(
                      "aiModels.ollama.pullHint",
                      "No models yet? Run `ollama pull llama3.2` to download a model.",
                    )}
                  </p>
                </div>

                <div className="settings-section">
                  <h3>
                    {translate(
                      "aiModels.common.apiKeyOptional",
                      "API Key (Optional)",
                    )}
                  </h3>
                  <p className="settings-description">
                    {translate(
                      "aiModels.ollama.apiKeyDescription",
                      "Only needed if connecting to a remote Ollama server that requires authentication.",
                    )}
                  </p>
                  <input
                    type="password"
                    className="settings-input"
                    placeholder={translate(
                      "aiModels.ollama.apiKeyPlaceholder",
                      "Optional API key for remote servers",
                    )}
                    value={ollamaApiKey}
                    onChange={(e) => setOllamaApiKey(e.target.value)}
                  />
                </div>
              </>
            )}

            <div className="settings-section profile-routing-section">
              <h3>
                {translate("aiModels.routing.title", "Profile-Based Routing")}
              </h3>
              <p className="settings-description">
                {translate(
                  "aiModels.routing.description",
                  "Route strong tasks (planning/verification) and cheap execution tasks to different models for this provider.",
                )}
              </p>
              <label className="settings-checkbox profile-routing-enable">
                <input
                  type="checkbox"
                  checked={routingEnabled}
                  onChange={(e) => {
                    const enabled = e.target.checked;
                    const fallbackModel =
                      providerPrimaryModel || strongRoutingModel || "";
                    setProviderRoutingConfig(currentProviderType, {
                      profileRoutingEnabled: enabled,
                      ...(enabled
                        ? {
                            strongModelKey:
                              strongRoutingModel || fallbackModel || undefined,
                            cheapModelKey:
                              cheapRoutingModel || fallbackModel || undefined,
                          }
                        : {}),
                      preferStrongForVerification:
                        typeof providerRouting.preferStrongForVerification ===
                        "boolean"
                          ? providerRouting.preferStrongForVerification
                          : true,
                    });
                  }}
                />
                <span>
                  {translate(
                    "aiModels.routing.enable",
                    "Enable profile-based routing",
                  )}
                </span>
              </label>

              {routingEnabled && (
                <div className="profile-routing-content">
                  <div className="profile-routing-models">
                    <div className="settings-subsection">
                      <h4>
                        {translate(
                          "aiModels.routing.strongModel",
                          "Strong / Planning Model",
                        )}
                      </h4>
                      <select
                        className="settings-select"
                        value={strongRoutingModel || ""}
                        onChange={(e) =>
                          setProviderRoutingConfig(currentProviderType, {
                            strongModelKey: e.target.value || undefined,
                          })
                        }
                      >
                        {routingModelOptions.map((model) => (
                          <option key={model.key} value={model.key}>
                            {model.displayName}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="settings-subsection">
                      <h4>
                        {translate(
                          "aiModels.routing.cheapModel",
                          "Cheap / Execution Model",
                        )}
                      </h4>
                      <select
                        className="settings-select"
                        value={cheapRoutingModel || ""}
                        onChange={(e) =>
                          setProviderRoutingConfig(currentProviderType, {
                            cheapModelKey: e.target.value || undefined,
                          })
                        }
                      >
                        {routingModelOptions.map((model) => (
                          <option key={model.key} value={model.key}>
                            {model.displayName}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="settings-subsection">
                      <h4>
                        {translate(
                          "aiModels.routing.automatedModel",
                          "Automated Tasks Model",
                        )}
                      </h4>
                      <p className="settings-hint">
                        {translate(
                          "aiModels.routing.automatedHint",
                          "Optional. Dedicated model for cron, scheduled, and improvement tasks. When set, uses faster/cheaper models (e.g. gpt-4o-mini, nano). Leave empty to use the execution model above.",
                        )}
                      </p>
                      <select
                        className="settings-select"
                        value={automatedTaskRoutingModel}
                        onChange={(e) =>
                          setProviderRoutingConfig(currentProviderType, {
                            automatedTaskModelKey: e.target.value || undefined,
                          })
                        }
                      >
                        <option value="">
                          {translate(
                            "aiModels.routing.useExecutionModel",
                            "Use execution model",
                          )}
                        </option>
                        {routingModelOptions.map((model) => (
                          <option key={model.key} value={model.key}>
                            {model.displayName}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="settings-subsection profile-routing-sync">
                    <button
                      className="button-small button-secondary"
                      type="button"
                      onClick={() =>
                        setProviderRoutingConfig(currentProviderType, {
                          strongModelKey:
                            strongRoutingModel ||
                            providerPrimaryModel ||
                            undefined,
                          cheapModelKey:
                            strongRoutingModel ||
                            providerPrimaryModel ||
                            undefined,
                        })
                      }
                    >
                      {translate(
                        "aiModels.routing.useSameModel",
                        "Use same model for both",
                      )}
                    </button>
                  </div>

                  <label className="settings-checkbox profile-routing-prefer">
                    <input
                      type="checkbox"
                      checked={
                        providerRouting.preferStrongForVerification !== false
                      }
                      onChange={(e) =>
                        setProviderRoutingConfig(currentProviderType, {
                          preferStrongForVerification: e.target.checked,
                        })
                      }
                    />
                    <span>
                      {translate(
                        "aiModels.routing.preferStrong",
                        "Prefer strong model for verification tasks",
                      )}
                    </span>
                  </label>

                  {routingModelsIdentical && (
                    <p className="settings-hint">
                      {translate(
                        "aiModels.routing.identicalHint",
                        "Strong and cheap models are identical, so routing will not change model cost/quality.",
                      )}
                    </p>
                  )}

                  <div className="settings-subsection routing-runtime-panel">
                    <div className="routing-runtime-header">
                      <h4>
                        {translate("aiModels.routing.live", "Live routing")}
                      </h4>
                      <button
                        className="button-small button-secondary"
                        type="button"
                        onClick={() =>
                          void window.electronAPI
                            ?.getLLMRoutingStatus?.()
                            .then((state) => setRoutingRuntime(state))
                            .catch((error) => {
                              console.error(
                                "Failed to refresh routing status:",
                                error,
                              );
                            })
                        }
                      >
                        {translate("aiModels.action.refresh", "Refresh")}
                      </button>
                    </div>
                    {routingRuntime ? (
                      <>
                        <div className="routing-runtime-grid">
                          <div className="routing-runtime-item">
                            <span>
                              {translate(
                                "aiModels.routing.activeProvider",
                                "Active provider",
                              )}
                            </span>
                            <strong>{routingRuntime.activeProvider}</strong>
                          </div>
                          <div className="routing-runtime-item">
                            <span>
                              {translate(
                                "aiModels.routing.activeModel",
                                "Active model",
                              )}
                            </span>
                            <strong>{routingRuntime.activeModel}</strong>
                          </div>
                          <div className="routing-runtime-item">
                            <span>
                              {translate(
                                "aiModels.routing.routeReason",
                                "Route reason",
                              )}
                            </span>
                            <strong>
                              {routingRuntime.routeReason.replace("_", " ")}
                            </strong>
                          </div>
                          <div className="routing-runtime-item">
                            <span>
                              {translate(
                                "aiModels.routing.fallback",
                                "Fallback",
                              )}
                            </span>
                            <strong>
                              {routingRuntime.fallbackOccurred
                                ? translate(
                                    "aiModels.routing.fallbackUsed",
                                    "Used",
                                  )
                                : translate(
                                    "aiModels.routing.fallbackNotUsed",
                                    "Not used",
                                  )}
                            </strong>
                          </div>
                        </div>
                        <p className="settings-hint">
                          {translate(
                            "aiModels.routing.currentProviderModel",
                            "Current provider/model:",
                          )}{" "}
                          {routingRuntime.currentProvider} /{" "}
                          {routingRuntime.currentModel}
                          {routingRuntime.manualOverride
                            ? translate(
                                "aiModels.routing.manualOverride",
                                " Manual override is active.",
                              )
                            : translate(
                                "aiModels.routing.automaticRouting",
                                " Automatic routing is active.",
                              )}
                        </p>
                        {routingRuntime.fallbackChain.length > 0 && (
                          <ul className="routing-runtime-fallbacks">
                            {routingRuntime.fallbackChain.map((step, index) => (
                              <li
                                key={`${step.providerType}:${step.modelKey}:${index}`}
                              >
                                <strong>{step.providerType}</strong> /{" "}
                                {step.modelKey} - {step.reason}
                                {step.success
                                  ? translate(
                                      "aiModels.routing.stepSuccess",
                                      " (success)",
                                    )
                                  : translate(
                                      "aiModels.routing.stepFailed",
                                      " (failed)",
                                    )}
                              </li>
                            ))}
                          </ul>
                        )}
                      </>
                    ) : (
                      <p className="settings-hint">
                        {translate(
                          "aiModels.routing.noSnapshot",
                          "No live routing snapshot yet. Open a task or refresh after a route change.",
                        )}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="settings-section">
              <h3>
                {translate("aiModels.failover.title", "Provider Failover")}
              </h3>
              <p className="settings-description">
                {translate(
                  "aiModels.failover.description",
                  "Configure ordered fallback providers/models for {provider}. The selected model remains primary; configured fallbacks are used only when the primary route has a temporary outage.",
                  { provider: currentProviderLabel },
                )}
              </p>

              <div
                className="settings-subsection"
                style={{ marginBottom: "12px" }}
              >
                <label className="settings-label">
                  {translate(
                    "aiModels.failover.retryPrimaryAfter",
                    "Retry primary after (seconds)",
                  )}
                </label>
                <input
                  className="settings-input"
                  type="number"
                  min={0}
                  max={3600}
                  step={1}
                  value={
                    providerFailover.failoverPrimaryRetryCooldownSeconds ?? ""
                  }
                  placeholder="60"
                  onChange={(e) =>
                    setProviderRoutingConfig(currentProviderType, {
                      failoverPrimaryRetryCooldownSeconds:
                        e.target.value.trim().length === 0
                          ? undefined
                          : Math.max(
                              0,
                              Math.min(
                                3600,
                                Math.floor(Number(e.target.value) || 0),
                              ),
                            ),
                    })
                  }
                />
                <p className="settings-hint">
                  {translate(
                    "aiModels.failover.retryHint",
                    "How long to stay on a fallback route before trying this provider's primary route again. Leave blank for the default of 60 seconds. Set to 0 to retry the primary on the next route refresh.",
                  )}
                </p>
              </div>

              {currentFailoverProviders.length > 0 ? (
                <div className="settings-subsection">
                  {currentFailoverProviders.map((entry, index) => (
                    <div
                      key={`${entry.providerType}:${index}`}
                      style={{
                        display: "grid",
                        gridTemplateColumns:
                          "minmax(180px, 220px) minmax(240px, 1fr) auto",
                        gap: "12px",
                        alignItems: "end",
                        marginBottom: "12px",
                      }}
                    >
                      <div>
                        <label className="settings-label">
                          {translate(
                            "aiModels.failover.backupProvider",
                            "Backup provider #{index}",
                            {
                              index: index + 1,
                            },
                          )}
                        </label>
                        <select
                          className="settings-select"
                          value={entry.providerType}
                          onChange={(e) => {
                            const nextProvider = e.target
                              .value as LLMProviderType;
                            void loadProviderModelsForType(nextProvider);
                            updateCurrentFailoverProviders((prev) =>
                              prev.map((candidate, candidateIndex) =>
                                candidateIndex === index
                                  ? {
                                      providerType: nextProvider,
                                      modelKey:
                                        getProviderPrimaryModel(nextProvider) ||
                                        undefined,
                                    }
                                  : candidate,
                              ),
                            );
                          }}
                        >
                          {configuredFallbackProviderOptions.map((provider) => (
                            <option key={provider.type} value={provider.type}>
                              {provider.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="settings-label">
                          {translate(
                            "aiModels.failover.fallbackModel",
                            "Fallback model",
                          )}
                        </label>
                        <SearchableSelect
                          options={[
                            {
                              value: "",
                              label: translate(
                                "aiModels.failover.useProviderDefault",
                                "Use provider default",
                              ),
                            },
                            ...getFailoverModelOptions(
                              entry.providerType,
                              entry.modelKey,
                            ),
                          ]}
                          value={entry.modelKey || ""}
                          onChange={(value) =>
                            updateCurrentFailoverProviders((prev) =>
                              prev.map((candidate, candidateIndex) =>
                                candidateIndex === index
                                  ? {
                                      ...candidate,
                                      modelKey: value.trim() || undefined,
                                    }
                                  : candidate,
                              ),
                            )
                          }
                          placeholder={translate(
                            "aiModels.failover.useProviderDefault",
                            "Use provider default",
                          )}
                          allowCustomValue
                        />
                      </div>

                      <div
                        style={{
                          display: "flex",
                          gap: "8px",
                          justifyContent: "flex-end",
                          flexWrap: "wrap",
                        }}
                      >
                        <button
                          className="button-small button-secondary"
                          type="button"
                          onClick={() =>
                            updateCurrentFailoverProviders((prev) => {
                              if (index === 0) return prev;
                              const next = [...prev];
                              [next[index - 1], next[index]] = [
                                next[index],
                                next[index - 1],
                              ];
                              return next;
                            })
                          }
                          disabled={index === 0}
                        >
                          {translate("aiModels.action.up", "Up")}
                        </button>
                        <button
                          className="button-small button-secondary"
                          type="button"
                          onClick={() =>
                            updateCurrentFailoverProviders((prev) => {
                              if (index >= prev.length - 1) return prev;
                              const next = [...prev];
                              [next[index], next[index + 1]] = [
                                next[index + 1],
                                next[index],
                              ];
                              return next;
                            })
                          }
                          disabled={
                            index >= currentFailoverProviders.length - 1
                          }
                        >
                          {translate("aiModels.action.down", "Down")}
                        </button>
                        <button
                          className="button-small button-secondary"
                          type="button"
                          onClick={() =>
                            updateCurrentFailoverProviders((prev) =>
                              prev.filter(
                                (_, candidateIndex) => candidateIndex !== index,
                              ),
                            )
                          }
                        >
                          {translate("aiModels.action.remove", "Remove")}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="settings-hint">
                  {translate(
                    "aiModels.failover.noBackups",
                    "No backup providers configured yet for {provider}. Add at least one to enable ordered failover for this provider.",
                    { provider: currentProviderLabel },
                  )}
                </p>
              )}

              <div className="settings-subsection">
                <button
                  className="button-small button-secondary"
                  type="button"
                  onClick={() => {
                    const usedProviders = new Set(
                      currentFailoverProviders.map(
                        (entry) => entry.providerType,
                      ),
                    );
                    const nextProvider =
                      configuredFallbackProviderOptions.find(
                        (provider) =>
                          provider.type !== currentProviderType &&
                          !usedProviders.has(provider.type),
                      ) ||
                      configuredFallbackProviderOptions.find(
                        (provider) => provider.type !== currentProviderType,
                      );
                    if (!nextProvider) {
                      return;
                    }
                    void loadProviderModelsForType(nextProvider.type);
                    updateCurrentFailoverProviders((prev) => [
                      ...prev,
                      {
                        providerType: nextProvider.type,
                        modelKey:
                          getProviderPrimaryModel(nextProvider.type) ||
                          undefined,
                      },
                    ]);
                  }}
                  disabled={
                    configuredFallbackProviderOptions.filter(
                      (provider) => provider.type !== currentProviderType,
                    ).length === 0 || currentFailoverProviders.length >= 5
                  }
                >
                  {translate(
                    "aiModels.failover.addBackupProvider",
                    "Add backup provider",
                  )}
                </button>
                <p className="settings-hint">
                  {translate(
                    "aiModels.failover.backupsHint",
                    "Backups run in order from top to bottom. Leave the model blank to use that provider's default model.",
                  )}
                </p>
              </div>
            </div>

            {testResult && (
              <div
                className={`test-result ${testResult.success ? "success" : "error"}`}
              >
                {testResult.success ? (
                  <>
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
                      <path d="M22 4L12 14.01l-3-3" />
                    </svg>
                    {translate(
                      "aiModels.connection.successful",
                      "Connection successful!",
                    )}
                  </>
                ) : (
                  <>
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <line x1="15" y1="9" x2="9" y2="15" />
                      <line x1="9" y1="9" x2="15" y2="15" />
                    </svg>
                    <span title={testResult.error}>
                      {(() => {
                        const error = testResult.error || "Connection failed";
                        // Extract meaningful part before JSON details
                        const jsonStart = error.indexOf(" [{");
                        const truncated =
                          jsonStart > 0 ? error.slice(0, jsonStart) : error;
                        return truncated.length > 200
                          ? truncated.slice(0, 200) + "..."
                          : truncated;
                      })()}
                    </span>
                  </>
                )}
              </div>
            )}

            {renderModelSettingsActions({ includeProviderActions: true })}
          </div>
        )}
      </div>
    );
  };

  const renderSettingsSubTabButton = (
    active: boolean,
    onClick: () => void,
    icon: ReactNode,
    label: string,
  ) => (
    <button
      className={`more-channels-tab ${active ? "active" : ""}`}
      onClick={onClick}
    >
      {icon}
      <span>{label}</span>
    </button>
  );

  const communicationChannels = useMemo<CommunicationChannelDefinition[]>(
    () => [
      {
        key: "telegram",
        channelType: "telegram",
        label: "Telegram",
        description: translate(
          "generated.components.settings.13226.111",
          "Chat with NeoWorker Assistant via Telegram",
        ),
        icon: <Send {...S} />,
      },
      {
        key: "feishu",
        channelType: "feishu",
        label: translate("generated.components.settings.13232.112", "Feishu"),
        description: translate(
          "generated.components.settings.13233.113",
          "Talk to NeoWorker Assistant via Feishu",
        ),
        icon: <MessageCircle {...S} />,
      },
      {
        key: "dingtalk",
        channelType: "dingtalk",
        label: translate("generated.components.settings.13239.114", "DingTalk"),
        description: translate(
          "generated.components.settings.13240.115",
          "Talk to NeoWorker Assistant via DingTalk",
        ),
        icon: <MessageCircle {...S} />,
      },
      {
        key: "weixin",
        channelType: "weixin",
        label: translate("generated.components.settings.13246.116", "WeChat"),
        description: translate(
          "generated.components.settings.13247.117",
          "Chat with NeoWorker Assistant via WeChat",
        ),
        icon: <MessageCircle {...S} />,
      },
      {
        key: "wecom",
        channelType: "wecom",
        label: translate(
          "generated.components.settings.13253.118",
          "Enterprise WeChat",
        ),
        description: translate(
          "generated.components.settings.13254.119",
          "Conversation with NeoWorker assistant through enterprise WeChat bot",
        ),
        icon: <Building2 {...S} />,
      },
      {
        key: "slack",
        channelType: "slack",
        label: "Slack",
        description: translate(
          "generated.components.settings.13261.120",
          "Chat with NeoWorker Assistant via Slack",
        ),
        icon: <Hash {...S} />,
      },
      {
        key: "discord",
        channelType: "discord",
        label: "Discord",
        description: translate(
          "generated.components.settings.13268.121",
          "Chat with NeoWorker Assistant via Discord",
        ),
        icon: <MessageSquare {...S} />,
      },
      {
        key: "whatsapp",
        channelType: "whatsapp",
        label: "WhatsApp",
        description: translate(
          "generated.components.settings.13275.122",
          "Chat with NeoWorker Assistant via WhatsApp",
        ),
        icon: <MessageCircle {...S} />,
      },
      {
        key: "teams",
        channelType: "teams",
        label: "Microsoft Teams",
        description: translate(
          "generated.components.settings.13282.123",
          "Chat with NeoWorker Assistant via Teams",
        ),
        icon: <UsersRound {...S} />,
      },
      {
        key: "x",
        channelType: "x",
        label: "X / Twitter",
        description: translate(
          "generated.components.settings.13289.124",
          "Connect to X social channels and process messages",
        ),
        icon: <AtSign {...S} />,
      },
      {
        key: "imessage",
        channelType: "imessage",
        label: "iMessage",
        description: translate(
          "generated.components.settings.13296.125",
          "Talk to NeoWorker Assistant through Apple Messages",
        ),
        icon: <MessageCircle {...S} />,
      },
      {
        key: "signal",
        channelType: "signal",
        label: "Signal",
        description: translate(
          "generated.components.settings.13303.126",
          "Talk to NeoWorker Assistant via Signal secure messaging",
        ),
        icon: <ShieldCheckIcon {...S} />,
      },
      {
        key: "email",
        channelType: "email",
        label: "Email",
        description: translate(
          "generated.components.settings.13310.127",
          "Send and receive tasks and replies via email",
        ),
        icon: <Mail {...S} />,
      },
      {
        key: "googlechat",
        channelType: "googlechat",
        label: "Google Chat",
        description: translate(
          "generated.components.settings.13317.128",
          "Talk to NeoWorker Assistant via Google Chat",
        ),
        icon: <MessagesSquare {...S} />,
      },
      {
        key: "line",
        channelType: "line",
        label: "LINE",
        description: translate(
          "generated.components.settings.13324.129",
          "Talk to NeoWorker Assistant via LINE",
        ),
        icon: <MessagesSquare {...S} />,
      },
      {
        key: "mattermost",
        channelType: "mattermost",
        label: "Mattermost",
        description: translate(
          "generated.components.settings.13331.130",
          "Talk to NeoWorker Assistant via Mattermost",
        ),
        icon: <Square {...S} />,
      },
      {
        key: "matrix",
        channelType: "matrix",
        label: "Matrix",
        description: translate(
          "generated.components.settings.13338.131",
          "Talk to NeoWorker Assistant via Matrix",
        ),
        icon: <LayoutGrid {...S} />,
      },
      {
        key: "twitch",
        channelType: "twitch",
        label: "Twitch",
        description: translate(
          "generated.components.settings.13345.132",
          "Receive missions via Twitch chat",
        ),
        icon: <Tv {...S} />,
      },
      {
        key: "bluebubbles",
        channelType: "bluebubbles",
        label: "BlueBubbles",
        description: translate(
          "generated.components.settings.13352.133",
          "Bridge Apple information with BlueBubbles",
        ),
        icon: <Smile {...S} />,
      },
    ],
    [language],
  );

  const visibleCommunicationChannels = useMemo(
    () =>
      communicationChannels
        .filter(
          (definition) =>
            INITIAL_RELEASE_COMMUNICATION_CHANNELS.has(definition.key) ||
            Boolean(
              definition.channelType &&
              gatewayChannelByType.has(definition.channelType),
            ),
        )
        .sort((left, right) => {
          const leftRank =
            INITIAL_RELEASE_COMMUNICATION_CHANNEL_RANK.get(left.key) ??
            Number.MAX_SAFE_INTEGER;
          const rightRank =
            INITIAL_RELEASE_COMMUNICATION_CHANNEL_RANK.get(right.key) ??
            Number.MAX_SAFE_INTEGER;
          return leftRank - rightRank;
        }),
    [communicationChannels, gatewayChannelByType],
  );

  const getCommunicationChannelStatus = (
    definition: CommunicationChannelDefinition,
  ) => {
    if (definition.comingSoon) {
      return {
        label: translate(
          "generated.components.settings.13387.134",
          "Coming soon",
        ),
        className: "coming",
        enabled: false,
        disabled: true,
      };
    }
    const channel = definition.channelType
      ? gatewayChannelByType.get(definition.channelType)
      : undefined;
    if (!channel) {
      return {
        label: translate(
          "generated.components.settings.13398.135",
          "Not configured",
        ),
        className: "muted",
        enabled: false,
        disabled: false,
      };
    }
    if (channel.configReadError || channel.status === "error") {
      return {
        label: translate(
          "generated.components.settings.13406.136",
          "Configuration exception",
        ),
        className: "error",
        enabled: channel.enabled,
        disabled: false,
      };
    }
    if (channel.status === "connected") {
      return {
        label: translate(
          "generated.components.settings.13414.137",
          "Connected",
        ),
        className: "success",
        enabled: channel.enabled,
        disabled: false,
      };
    }
    if (channel.enabled) {
      return {
        label: translate("generated.components.settings.13422.138", "Enabled"),
        className: "success",
        enabled: true,
        disabled: false,
      };
    }
    return {
      label: translate("generated.components.settings.13429.139", "configured"),
      className: "configured",
      enabled: false,
      disabled: false,
    };
  };

  const handleCommunicationChannelToggle = async (
    definition: CommunicationChannelDefinition,
  ) => {
    if (!definition.channelType || definition.comingSoon) {
      return;
    }
    const channel = gatewayChannelByType.get(definition.channelType);
    if (!channel) {
      selectCommunicationChannel(definition.key);
      setExpandedChannelKey(definition.key);
      return;
    }
    try {
      if (channel.enabled) {
        await window.electronAPI.disableGatewayChannel(channel.id);
      } else {
        await window.electronAPI.enableGatewayChannel(channel.id);
      }
      await loadGatewayChannels();
    } catch (error) {
      console.error("Failed to toggle gateway channel:", error);
    }
  };

  const renderCommunicationChannelContent = (
    key: CommunicationChannelKey,
  ): ReactNode => {
    const refreshProps = { onStatusChange: refreshGatewayChannels };
    switch (key) {
      case "telegram":
        return <TelegramSettings {...refreshProps} />;
      case "feishu":
        return <FeishuSettings {...refreshProps} />;
      case "dingtalk":
        return <DingTalkSettings {...refreshProps} />;
      case "slack":
        return <SlackSettings {...refreshProps} />;
      case "discord":
        return <DiscordSettings {...refreshProps} />;
      case "whatsapp":
        return <WhatsAppSettings {...refreshProps} />;
      case "weixin":
        return <WeixinSettings {...refreshProps} />;
      case "wecom":
        return <WeComSettings {...refreshProps} />;
      case "teams":
        return <TeamsSettings {...refreshProps} />;
      case "x":
        return <XSettings {...refreshProps} />;
      case "imessage":
        return <ImessageSettings {...refreshProps} />;
      case "signal":
        return <SignalSettings {...refreshProps} />;
      case "mattermost":
        return <MattermostSettings {...refreshProps} />;
      case "matrix":
        return <MatrixSettings {...refreshProps} />;
      case "twitch":
        return <TwitchSettings {...refreshProps} />;
      case "line":
        return <LineSettings {...refreshProps} />;
      case "bluebubbles":
        return <BlueBubblesSettings {...refreshProps} />;
      case "email":
        return <EmailSettings {...refreshProps} />;
      case "googlechat":
        return <GoogleChatSettings {...refreshProps} />;
      default:
        return null;
    }
  };

  const availableCommunicationChannels = visibleCommunicationChannels.filter(
    (channel) => !channel.comingSoon,
  ).length;
  const enabledCommunicationChannels = visibleCommunicationChannels.filter(
    (definition) =>
      definition.channelType &&
      gatewayChannelByType.get(definition.channelType)?.enabled,
  ).length;

  return (
    <div className="settings-page">
      <div className="settings-page-layout">
        <SettingsSidebar
          activeTab={activeTab}
          isMacPlatform={isMacPlatform}
          onBack={onBack}
          onSelect={handleSidebarItemSelect}
        />

        <div className="settings-content-card">
          <div className="settings-content">
            <Suspense
              fallback={
                <div className="settings-loading">
                  {translate("settings.loading", "Loading settings...")}
                </div>
              }
            >
              {activeTab === "appearance" ||
              activeTab === "health" ||
              activeTab === "nodes" ? (
                <div className="more-channels-panel settings-tabbed-workspace">
                  <div className="more-channels-header">
                    <h2>
                      {translate(
                        "settings.page.preferences.title",
                        "Appearance & Preferences",
                      )}
                    </h2>
                    <p className="settings-description">
                      {translate(
                        "settings.page.preferences.description",
                        "Adjust the interface, assistant personality, and voice experience.",
                      )}
                    </p>
                  </div>
                  <div className="more-channels-tabs">
                    {renderSettingsSubTabButton(
                      activePreferencesSubTab === "appearance",
                      () => setActivePreferencesSubTab("appearance"),
                      <Sun {...S} />,
                      translate(
                        "settings.page.preferences.appearance",
                        "Appearance",
                      ),
                    )}
                    {renderSettingsSubTabButton(
                      activePreferencesSubTab === "personality",
                      () => setActivePreferencesSubTab("personality"),
                      <User {...S} />,
                      translate(
                        "settings.page.preferences.personality",
                        "Personality",
                      ),
                    )}
                    {renderSettingsSubTabButton(
                      activePreferencesSubTab === "voice",
                      () => setActivePreferencesSubTab("voice"),
                      <Mic {...S} />,
                      translate(
                        "settings.page.preferences.voice",
                        "Voice Mode",
                      ),
                    )}
                  </div>
                  <div className="more-channels-content">
                    {activePreferencesSubTab === "appearance" && (
                      <AppearanceSettings
                        devRunLoggingEnabled={devRunLoggingEnabled}
                        onDevRunLoggingEnabledChange={
                          onDevRunLoggingEnabledChange
                        }
                      />
                    )}
                    {activePreferencesSubTab === "personality" && (
                      <PersonalitySettings
                        onSettingsChanged={onSettingsChanged}
                      />
                    )}
                    {activePreferencesSubTab === "voice" && <VoiceSettings />}
                  </div>
                </div>
              ) : activeTab === "personality" ? (
                <PersonalitySettings onSettingsChanged={onSettingsChanged} />
              ) : activeTab === "digitaltwins" ? (
                <DigitalTwinsPanel onOpenAgents={onNavigateToAgents} />
              ) : activeTab === "everydayAgent" ? (
                <EverydayAgentSettingsPanel
                  workspaceId={workspaceId}
                  onCreateTask={onCreateTask}
                />
              ) : activeTab === "voice" ? (
                <VoiceSettings />
              ) : activeTab === "telegram" ||
                activeTab === "slack" ||
                activeTab === "whatsapp" ||
                activeTab === "morechannels" ||
                activeTab === "teams" ||
                activeTab === "x" ? (
                <div className="channel-config-page">
                  <div className="channel-config-hero">
                    <div className="channel-config-hero-main">
                      <span className="channel-config-hero-icon">
                        <MessageCircle {...S} />
                      </span>
                      <div>
                        <h2>
                          {translate(
                            "settings.page.communication.title",
                            "Channel configuration",
                          )}
                        </h2>
                        <p>
                          {translate(
                            "settings.page.communication.description",
                            "Connect to WeChat, Business WeChat, DingTalk, Feishu or email to interact with NeoWorker in common channels.",
                          )}
                        </p>
                      </div>
                    </div>
                    <div
                      className="channel-config-stats"
                      aria-label={translate(
                        "generated.components.settings.13695.140",
                        "Channel overview",
                      )}
                    >
                      <div className="channel-config-stat">
                        <MessageSquare {...S} />
                        <span>
                          {translate(
                            "generated.components.settings.13698.141",
                            "Available channels",
                          )}
                        </span>
                        <strong>{availableCommunicationChannels}</strong>
                      </div>
                      <div className="channel-config-stat">
                        <CircleDot {...S} />
                        <span>
                          {translate(
                            "generated.components.settings.13703.142",
                            "Enabled",
                          )}
                        </span>
                        <strong>{enabledCommunicationChannels}</strong>
                      </div>
                      <div className="channel-config-stat">
                        <Wrench {...S} />
                        <span>
                          {translate(
                            "generated.components.settings.13708.143",
                            "Configuration steps",
                          )}
                        </span>
                        <strong>2</strong>
                      </div>
                    </div>
                  </div>
                  <div className="channel-config-list">
                    {visibleCommunicationChannels.map((definition) => {
                      const status = getCommunicationChannelStatus(definition);
                      const isConfigured = Boolean(
                        definition.channelType &&
                        gatewayChannelByType.has(definition.channelType),
                      );
                      const isActive = activeChannelKey === definition.key;
                      const isExpanded = expandedChannelKey === definition.key;
                      return (
                        <div
                          key={definition.key}
                          className={`channel-config-row ${isActive ? "active" : ""}`}
                          onClick={() =>
                            selectCommunicationChannel(definition.key)
                          }
                        >
                          <div className="channel-config-row-summary">
                            <ChannelLogoIcon
                              src={CHANNEL_ICON_SRC[definition.key]}
                              fallback={definition.icon}
                            />
                            <div className="channel-config-copy">
                              <div className="channel-config-title-line">
                                <strong>{definition.label}</strong>
                                <span
                                  className={`channel-config-status ${status.className}`}
                                >
                                  {status.label}
                                </span>
                              </div>
                              <p>{definition.description}</p>
                            </div>
                            <div
                              className="channel-config-actions"
                              onClick={(event) => event.stopPropagation()}
                            >
                              {isConfigured && (
                                <button
                                  className={`channel-config-switch ${status.enabled ? "on" : ""}`}
                                  type="button"
                                  aria-label={translate(
                                    "settings.channels.enabledState",
                                    "Enabled state for {channel}",
                                    { channel: definition.label },
                                  )}
                                  title={
                                    status.enabled
                                      ? translate(
                                          "generated.components.settings.13756.144",
                                          "Click to deactivate",
                                        )
                                      : translate(
                                          "generated.components.settings.13756.145",
                                          "Click to enable",
                                        )
                                  }
                                  aria-pressed={status.enabled}
                                  disabled={status.disabled}
                                  onClick={() =>
                                    void handleCommunicationChannelToggle(
                                      definition,
                                    )
                                  }
                                />
                              )}
                              <button
                                className="channel-config-button"
                                type="button"
                                onClick={() =>
                                  toggleCommunicationChannelConfig(
                                    definition.key,
                                  )
                                }
                                disabled={definition.comingSoon}
                              >
                                <ChevronDown {...S} />
                                {isExpanded
                                  ? translate(
                                      "generated.components.settings.13779.146",
                                      "close",
                                    )
                                  : isConfigured
                                    ? translate(
                                        "generated.components.settings.13781.147",
                                        "Configuration",
                                      )
                                    : translate(
                                        "generated.components.settings.13782.148",
                                        "Go to configuration",
                                      )}
                              </button>
                            </div>
                          </div>
                          {isExpanded && (
                            <div
                              className="channel-config-expanded"
                              onClick={(event) => event.stopPropagation()}
                            >
                              <div className="channel-config-expanded-content">
                                {renderCommunicationChannelContent(
                                  definition.key,
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : activeTab === "aimodels" ? (
                <div className="more-channels-panel settings-tabbed-workspace">
                  <div className="more-channels-header">
                    <h2>
                      {translate("settings.page.aiAgents.title", "AI & Models")}
                    </h2>
                    <p className="settings-description">
                      {translate(
                        "settings.page.aiAgents.description",
                        "Configure the model and web search used for your work.",
                      )}
                    </p>
                  </div>
                  <div className="more-channels-tabs">
                    {renderSettingsSubTabButton(
                      activeAIAgentsSubTab === "models" &&
                        activeAIModelsSubTab === "llm",
                      () => {
                        setActiveAIAgentsSubTab("models");
                        setActiveAIModelsSubTab("llm");
                      },
                      <Layers {...S} />,
                      translate("settings.page.aiModels.ai", "AI Model"),
                    )}
                    {renderSettingsSubTabButton(
                      activeAIAgentsSubTab === "models" &&
                        activeAIModelsSubTab === "search",
                      () => {
                        setActiveAIAgentsSubTab("models");
                        setActiveAIModelsSubTab("search");
                      },
                      <Search {...S} />,
                      translate("settings.page.aiModels.search", "Web Search"),
                    )}
                    {renderSettingsSubTabButton(
                      activeAIAgentsSubTab === "models" &&
                        activeAIModelsSubTab === "budget",
                      () => {
                        setActiveAIAgentsSubTab("models");
                        setActiveAIModelsSubTab("budget");
                      },
                      <Shield {...S} />,
                      translate(
                        "settings.page.aiModels.budget",
                        "Token Budget",
                      ),
                    )}
                  </div>
                  <div className="more-channels-content">
                    {activeAIAgentsSubTab === "models" && (
                      <>
                        {activeAIModelsSubTab === "llm" && (
                          <>
                            {renderLLMPanel()}
                            <section className="model-usage-insights">
                              <div className="model-usage-insights-copy">
                                <span className="model-usage-insights-icon">
                                  <BarChart3 size={18} />
                                </span>
                                <div>
                                  <h3>
                                    {translate(
                                      "generated.components.settings.13863.149",
                                      "Model usage and costs",
                                    )}
                                  </h3>
                                  <p>
                                    {translate(
                                      "generated.components.settings.13865.150",
                                      "View call count, token consumption, and fee trends by model without leaving the model configuration.",
                                    )}
                                  </p>
                                </div>
                              </div>
                              <button
                                type="button"
                                className="button-secondary model-usage-insights-toggle"
                                onClick={() =>
                                  setShowModelUsageInsights(
                                    (visible) => !visible,
                                  )
                                }
                                aria-expanded={showModelUsageInsights}
                              >
                                {showModelUsageInsights
                                  ? translate(
                                      "generated.components.settings.13881.151",
                                      "CollapseUsage Insights",
                                    )
                                  : translate(
                                      "generated.components.settings.13882.152",
                                      "View usage insights",
                                    )}
                              </button>
                            </section>
                            {showModelUsageInsights && (
                              <div className="model-usage-insights-detail">
                                <UsageInsightsPanel workspaceId={workspaceId} />
                              </div>
                            )}
                          </>
                        )}
                        {activeAIModelsSubTab === "search" && (
                          <SearchSettings />
                        )}
                        {activeAIModelsSubTab === "budget" && (
                          <GuardrailSettings />
                        )}
                      </>
                    )}
                  </div>
                </div>
              ) : activeTab === "automations" ? (
                <div className="more-channels-panel settings-tabbed-workspace settings-automation-workspace">
                  <div className="more-channels-header">
                    <h2>
                      {translate(
                        "settings.page.automations.title",
                        "Automations",
                      )}
                    </h2>
                    <p className="settings-description">
                      {translate(
                        "settings.page.automations.description",
                        "Set up automations that run on schedule and see results and issues that need to be addressed",
                      )}
                    </p>
                  </div>
                  <div
                    className="more-channels-tabs automation-subnav"
                    aria-label={translate(
                      "settings.page.automations.navigation",
                      "Automation pages",
                    )}
                  >
                    {(
                      [
                        {
                          id: "run",
                          label: translate(
                            "settings.page.automations.group.run",
                            "Run",
                          ),
                          items: ["scheduled"] as const,
                        },
                        {
                          id: "review",
                          label: translate(
                            "settings.page.automations.group.review",
                            "Review",
                          ),
                          items: ["briefing", "suggestions"] as const,
                        },
                      ] as const
                    ).map((group) => (
                      <div className="automation-subnav-group" key={group.id}>
                        <div className="automation-subnav-label">
                          {group.label}
                        </div>
                        {group.items.map((key) => (
                          <button
                            key={key}
                            type="button"
                            className={`more-channels-tab ${activeAutomationsSubTab === key ? "active" : ""}`}
                            aria-current={
                              activeAutomationsSubTab === key
                                ? "page"
                                : undefined
                            }
                            onClick={() => setActiveAutomationsSubTab(key)}
                          >
                            {key === "queue" && <ListOrdered {...S} />}
                            {key === "council" && <Users {...S} />}
                            {key === "subconscious" && <Sparkles {...S} />}
                            {key === "scheduled" && <Clock {...S} />}
                            {key === "hooks" && <Link {...S} />}
                            {key === "triggers" && <Zap {...S} />}
                            {key === "briefing" && <Sun {...S} />}
                            {key === "suggestions" && <Lightbulb {...S} />}
                            {key === "traces" && <MessagesSquare {...S} />}
                            <span>
                              {key === "queue" &&
                                translate(
                                  "settings.page.automations.queue",
                                  "Task Queue",
                                )}
                              {key === "council" &&
                                translate(
                                  "settings.page.automations.council",
                                  "R&D Council",
                                )}
                              {key === "subconscious" &&
                                translate(
                                  "settings.page.automations.subconscious",
                                  "Workflow Intelligence",
                                )}
                              {key === "scheduled" &&
                                translate(
                                  "settings.page.automations.scheduled",
                                  "Scheduled Tasks",
                                )}
                              {key === "hooks" &&
                                translate(
                                  "settings.page.automations.hooks",
                                  "Webhooks",
                                )}
                              {key === "triggers" &&
                                translate(
                                  "settings.page.automations.triggers",
                                  "Event Triggers",
                                )}
                              {key === "briefing" &&
                                translate(
                                  "settings.page.automations.briefing",
                                  "Daily Briefing",
                                )}
                              {key === "suggestions" &&
                                translate(
                                  "settings.page.automations.suggestions",
                                  "Suggestions",
                                )}
                              {key === "traces" &&
                                translate(
                                  "settings.page.automations.traces",
                                  "Task Traces",
                                )}
                            </span>
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                  <div
                    className={`more-channels-content automation-settings-content automation-settings-content--${activeAutomationsSubTab}`}
                  >
                    {activeAutomationsSubTab === "scheduled" && (
                      <ScheduledTasksSettings onOpenTask={onOpenTask} />
                    )}
                    {activeAutomationsSubTab === "briefing" && (
                      <BriefingPanel workspaceId={workspaceId} />
                    )}
                    {activeAutomationsSubTab === "suggestions" && (
                      <SuggestionsPanel
                        workspaceId={workspaceId}
                        onCreateTask={onCreateTask}
                      />
                    )}
                  </div>
                </div>
              ) : activeTab === "skills" ? (
                <div className="more-channels-panel settings-tabbed-workspace">
                  <div className="more-channels-header">
                    <h2>{translate("settings.page.skills.title", "Skills")}</h2>
                    <p className="settings-description">
                      {translate(
                        "settings.page.skills.description",
                        "Manage custom skills and browse the Skill Store",
                      )}
                    </p>
                  </div>
                  <div className="more-channels-tabs">
                    <button
                      className={`more-channels-tab ${activeSkillsSubTab === "custom" ? "active" : ""}`}
                      onClick={() => setActiveSkillsSubTab("custom")}
                    >
                      <Wrench {...S} />
                      <span>
                        {translate(
                          "settings.page.skills.custom",
                          "Custom Skills",
                        )}
                      </span>
                    </button>
                    <button
                      className={`more-channels-tab ${activeSkillsSubTab === "store" ? "active" : ""}`}
                      onClick={() => setActiveSkillsSubTab("store")}
                    >
                      <Store {...S} />
                      <span>
                        {translate("settings.page.skills.store", "Skill Store")}
                      </span>
                    </button>
                  </div>
                  <div className="more-channels-content">
                    {activeSkillsSubTab === "custom" && <SkillsSettings />}
                    {activeSkillsSubTab === "store" && <SkillHubBrowser />}
                  </div>
                </div>
              ) : activeTab === "integrations" ? (
                <div className="more-channels-panel settings-tabbed-workspace settings-tools-integrations-workspace">
                  <div className="more-channels-header">
                    <h2>
                      {translate(
                        "settings.page.toolsIntegrations.title",
                        "Tools & Integrations",
                      )}
                    </h2>
                    <p className="settings-description">
                      {translate(
                        "settings.page.toolsIntegrations.description",
                        "Manage connected apps, custom capabilities, skills, MCP servers, built-in tools, and extensions.",
                      )}
                    </p>
                  </div>
                  <div className="more-channels-tabs">
                    {renderSettingsSubTabButton(
                      activeToolsIntegrationsSubTab === "integrations",
                      () => setActiveToolsIntegrationsSubTab("integrations"),
                      <LayoutGrid {...S} />,
                      translate(
                        "settings.page.toolsIntegrations.integrations",
                        "Integrations",
                      ),
                    )}
                    {renderSettingsSubTabButton(
                      activeToolsIntegrationsSubTab === "customize",
                      () => setActiveToolsIntegrationsSubTab("customize"),
                      <Sparkles {...S} />,
                      translate(
                        "settings.page.toolsIntegrations.customize",
                        "Customize",
                      ),
                    )}
                    {renderSettingsSubTabButton(
                      activeToolsIntegrationsSubTab === "skills",
                      () => setActiveToolsIntegrationsSubTab("skills"),
                      <Wrench {...S} />,
                      translate(
                        "settings.page.toolsIntegrations.skills",
                        "Skills",
                      ),
                    )}
                    {renderSettingsSubTabButton(
                      activeToolsIntegrationsSubTab === "mcp",
                      () => setActiveToolsIntegrationsSubTab("mcp"),
                      <Monitor {...S} />,
                      translate(
                        "settings.page.toolsIntegrations.mcp",
                        "MCP Servers",
                      ),
                    )}
                    {renderSettingsSubTabButton(
                      activeToolsIntegrationsSubTab === "tools",
                      () => setActiveToolsIntegrationsSubTab("tools"),
                      <MessageSquare {...S} />,
                      translate(
                        "settings.page.toolsIntegrations.tools",
                        "Built-in Tools",
                      ),
                    )}
                    {renderSettingsSubTabButton(
                      activeToolsIntegrationsSubTab === "extensions",
                      () => setActiveToolsIntegrationsSubTab("extensions"),
                      <Puzzle {...S} />,
                      translate(
                        "settings.page.toolsIntegrations.extensions",
                        "Extensions",
                      ),
                    )}
                  </div>
                  <div
                    className={`more-channels-content tools-integrations-content tools-integrations-content--${activeToolsIntegrationsSubTab}`}
                  >
                    {activeToolsIntegrationsSubTab === "integrations" && (
                      <div className="settings-nested-tab-panel">
                        <div className="more-channels-tabs">
                          {renderSettingsSubTabButton(
                            activeIntegrationsSubTab === "connectors",
                            () => setActiveIntegrationsSubTab("connectors"),
                            <LayoutGrid {...S} />,
                            translate(
                              "settings.page.integrations.connectors",
                              "Connectors",
                            ),
                          )}
                          {renderSettingsSubTabButton(
                            activeIntegrationsSubTab === "identity",
                            () => setActiveIntegrationsSubTab("identity"),
                            <UsersRound {...S} />,
                            translate(
                              "settings.page.integrations.identity",
                              "Identity",
                            ),
                          )}
                        </div>
                        <div className="settings-nested-tab-content tools-integrations-nested-content">
                          {activeIntegrationsSubTab === "connectors" && (
                            <ConnectorsSettings />
                          )}
                          {activeIntegrationsSubTab === "identity" && (
                            <ContactIdentitySettings
                              workspaceId={workspaceId}
                            />
                          )}
                        </div>
                      </div>
                    )}
                    {activeToolsIntegrationsSubTab === "customize" && (
                      <CustomizePanel
                        managementOnly
                        onNavigateToConnectors={() => {
                          setActiveToolsIntegrationsSubTab("integrations");
                          setActiveIntegrationsSubTab("connectors");
                        }}
                        onNavigateToSkills={() => {
                          setActiveToolsIntegrationsSubTab("skills");
                          setActiveSkillsSubTab("custom");
                        }}
                        onCreateTask={onCreateTask}
                      />
                    )}
                    {activeToolsIntegrationsSubTab === "skills" && (
                      <div className="settings-nested-tab-panel">
                        <div className="more-channels-tabs">
                          {renderSettingsSubTabButton(
                            activeSkillsSubTab === "custom",
                            () => setActiveSkillsSubTab("custom"),
                            <Wrench {...S} />,
                            translate(
                              "settings.page.skills.custom",
                              "Custom Skills",
                            ),
                          )}
                          {renderSettingsSubTabButton(
                            activeSkillsSubTab === "store",
                            () => setActiveSkillsSubTab("store"),
                            <Store {...S} />,
                            translate(
                              "settings.page.skills.store",
                              "Skill Store",
                            ),
                          )}
                        </div>
                        <div className="settings-nested-tab-content tools-integrations-nested-content">
                          {activeSkillsSubTab === "custom" && (
                            <SkillsSettings />
                          )}
                          {activeSkillsSubTab === "store" && (
                            <SkillHubBrowser />
                          )}
                        </div>
                      </div>
                    )}
                    {activeToolsIntegrationsSubTab === "mcp" && <MCPSettings />}
                    {activeToolsIntegrationsSubTab === "tools" && (
                      <div className="settings-tools-stack">
                        <BuiltinToolsSettings />
                        <ChronicleSettingsCard />
                        <ComputerUseSettings />
                      </div>
                    )}
                    {activeToolsIntegrationsSubTab === "extensions" && (
                      <ExtensionsSettings />
                    )}
                  </div>
                </div>
              ) : activeTab === "mcp" ? (
                <MCPSettings />
              ) : activeTab === "tools" ? (
                <div className="settings-tools-stack">
                  <BuiltinToolsSettings />
                  <ChronicleSettingsCard />
                  <ComputerUseSettings />
                </div>
              ) : activeTab === "access" ? (
                <div className="more-channels-panel settings-tabbed-workspace">
                  <div className="more-channels-header">
                    <h2>{translate("settings.page.access.title", "Access")}</h2>
                    <p className="settings-description">
                      {translate(
                        "settings.page.access.description",
                        "Remote access and web access",
                      )}
                    </p>
                  </div>
                  <div className="more-channels-tabs">
                    <button
                      className={`more-channels-tab ${activeAccessSubTab === "controlplane" ? "active" : ""}`}
                      onClick={() => setActiveAccessSubTab("controlplane")}
                    >
                      <Monitor {...S} />
                      <span>
                        {translate(
                          "settings.page.access.remote",
                          "Remote Access",
                        )}
                      </span>
                    </button>
                    <button
                      className={`more-channels-tab ${activeAccessSubTab === "webaccess" ? "active" : ""}`}
                      onClick={() => setActiveAccessSubTab("webaccess")}
                    >
                      <Monitor {...S} />
                      <span>
                        {translate("settings.page.access.web", "Web Access")}
                      </span>
                    </button>
                  </div>
                  <div className="more-channels-content">
                    {activeAccessSubTab === "controlplane" && (
                      <ControlPlaneSettings />
                    )}
                    {activeAccessSubTab === "webaccess" && (
                      <WebAccessSettingsPanel />
                    )}
                  </div>
                </div>
              ) : activeTab === "extensions" ? (
                <ExtensionsSettings />
              ) : activeTab === "memory" ? (
                <MemoryHubSettings
                  initialWorkspaceId={workspaceId}
                  onSettingsChanged={onSettingsChanged}
                />
              ) : activeTab === "suggestions" ? (
                <SuggestionsPanel
                  workspaceId={workspaceId}
                  onCreateTask={onCreateTask}
                />
              ) : activeTab === "traces" ? (
                <TaskTraceDebuggerPanel
                  workspaceId={workspaceId}
                  onOpenTask={onOpenTask}
                />
              ) : activeTab === "customize" ? (
                <CustomizePanel
                  managementOnly
                  onNavigateToConnectors={() => {
                    setActiveTab("integrations");
                    setActiveToolsIntegrationsSubTab("integrations");
                    setActiveIntegrationsSubTab("connectors");
                  }}
                  onNavigateToSkills={() => {
                    setActiveTab("integrations");
                    setActiveToolsIntegrationsSubTab("skills");
                  }}
                  onCreateTask={onCreateTask}
                />
              ) : activeTab === "briefing" ? (
                <BriefingPanel workspaceId={workspaceId} />
              ) : loading ? (
                <div className="settings-loading">
                  {translate("settings.loading", "Loading settings...")}
                </div>
              ) : (
                renderLLMPanel()
              )}
            </Suspense>
          </div>
        </div>
      </div>
    </div>
  );
}
