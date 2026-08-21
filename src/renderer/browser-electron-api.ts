import type { ElectronAPI } from "../electron/preload";
import type {
  AppearanceSettings,
  AddChannelRequest,
  ChannelData,
  ChannelUserData,
  EventType,
  EverydayActionPreview,
  EverydayActionPreviewInput,
  EverydayActionReceipt,
  EverydayActionRisk,
  EverydayAgentClearDataRequest,
  EverydayAgentListReceiptsRequest,
  EverydayAgentProfile,
  EverydayAgentProfileResult,
  EverydayAgentUpdateProfileRequest,
  EverydayCapabilityBundle,
  EverydayPauseScope,
  GuardrailSettings,
  LLMConfigStatus,
  LLMModelInfo,
  LLMProviderInfo,
  LLMProviderType,
  LLMSettingsData,
  PermissionSettingsData,
  QueueStatus,
  Task,
  TaskEvent,
  Workspace,
} from "../shared/types";
import {
  DEFAULT_EVERYDAY_AGENT_PROFILE,
  EVERYDAY_AGENT_ALWAYS_APPROVAL_RISKS,
  EVERYDAY_AGENT_CONSENT_VERSION,
  DEFAULT_VOICE_SETTINGS,
  DEFAULT_PERSONALITY_CONFIG_V2,
  PERSONA_DEFINITIONS,
  TRAIT_PRESETS,
} from "../shared/types";
import { translate } from "./i18n/index";

const STORAGE_PREFIX = "neoworker-browser:";

const defaultWorkspace: Workspace = {
  id: "__browser_workspace__",
  name: "Browser Workspace",
  path: "/browser",
  createdAt: Date.now(),
  lastUsedAt: Date.now(),
  isTemp: true,
  permissions: {
    read: true,
    write: false,
    delete: false,
    network: true,
    shell: false,
  },
};

const defaultAppearance: Partial<AppearanceSettings> = {
  themeMode: "system",
  language: "zh-CN",
  disclaimerAccepted: true,
  onboardingCompleted: true,
};

const defaultQueueStatus: QueueStatus = {
  runningCount: 0,
  queuedCount: 0,
  runningTaskIds: [],
  queuedTaskIds: [],
  maxConcurrent: 8,
};

const defaultBuiltinToolsSettings = {
  categories: {
    code: { enabled: true, priority: "high", description: "" },
    webfetch: { enabled: true, priority: "high", description: "" },
    browser: { enabled: true, priority: "normal", description: "" },
    search: { enabled: true, priority: "normal", description: "" },
    system: { enabled: true, priority: "normal", description: "" },
    file: { enabled: true, priority: "normal", description: "" },
    skill: { enabled: true, priority: "normal", description: "" },
    shell: { enabled: false, priority: "normal", description: "" },
    image: { enabled: true, priority: "normal", description: "" },
    chronicle: { enabled: false, priority: "low", description: "" },
    computer_use: { enabled: true, priority: "normal", description: "" },
  },
  toolOverrides: {},
  toolTimeouts: {},
  toolAutoApprove: {},
  runCommandApprovalMode: "per_command",
  codexRuntimeMode: "native",
  computerUseAutomation: {
    browserAutomationMode: "background",
    nativeComputerUseMode: "background_first",
  },
  version: "browser-preview",
} as const;

const defaultBuiltinToolsCategories = {
  code: ["glob", "grep", "edit"],
  webfetch: ["web_fetch"],
  browser: ["browser_open", "browser_click"],
  search: ["web_search"],
  system: ["clipboard_read", "screenshot"],
  file: ["read_file", "write_file"],
  skill: ["document_create"],
  shell: ["run_command"],
  image: ["image_generate"],
  chronicle: ["screen_context"],
  computer_use: ["computer_use"],
};

const defaultChronicleSettings = {
  enabled: false,
  mode: "hybrid",
  paused: false,
  captureIntervalSeconds: 10,
  retentionMinutes: 5,
  maxFrames: 60,
  captureScope: "frontmost_display",
  backgroundGenerationEnabled: true,
  respectWorkspaceMemory: true,
  consentAcceptedAt: null,
};

const defaultChronicleStatus = {
  enabled: false,
  paused: false,
  screenCaptureStatus: "not-determined",
  accessibilityTrusted: false,
  ocrAvailable: false,
  frameCount: 0,
  bufferBytes: 0,
  captureScope: "frontmost_display",
  lastCaptureAt: null,
  lastGeneratedAt: null,
  reason: null,
};

const defaultComputerUseStatus = {
  activeTaskId: null,
  platform: "browser",
  helperPath: "",
  sourcePath: null,
  installed: false,
  accessibilityTrusted: false,
  screenCaptureStatus: "unknown",
  error: null,
};

const defaultMcpSettings = {
  servers: [],
  autoConnect: false,
  toolNamePrefix: "mcp_",
  maxReconnectAttempts: 3,
  reconnectDelayMs: 1000,
  registryEnabled: true,
  registryUrl: "",
  hostEnabled: false,
  hostPort: 3333,
};

const defaultGatewayChannels: ChannelData[] = [];
const defaultGatewayUsers: ChannelUserData[] = [];

const defaultPermissionSettings: PermissionSettingsData = {
  version: 1,
  defaultMode: "default",
  defaultShellEnabled: false,
  defaultPermissionAccess: "default",
  rules: [],
};

const defaultGuardrailSettings: GuardrailSettings = {
  maxTokensPerTask: 100000,
  tokenBudgetEnabled: false,
  maxCostPerTask: 1.0,
  costBudgetEnabled: false,
  blockDangerousCommands: true,
  customBlockedPatterns: [],
  autoApproveTrustedCommands: false,
  trustedCommandPatterns: [],
  maxFileSizeMB: 50,
  fileSizeLimitEnabled: false,
  enforceAllowedDomains: false,
  allowedDomains: [],
  webSearchMode: "cached",
  webSearchMaxUsesPerTask: 8,
  webSearchMaxUsesPerStep: 3,
  webSearchAllowedDomains: [],
  webSearchBlockedDomains: [],
  maxIterationsPerTask: 100,
  iterationLimitEnabled: false,
  autoContinuationEnabled: true,
  defaultMaxAutoContinuations: 5,
  defaultMinProgressScore: 0.15,
  lifetimeTurnCapEnabled: true,
  defaultLifetimeTurnCap: 500,
  compactOnContinuation: true,
  compactionThresholdRatio: 0.75,
  loopWarningThreshold: 12,
  loopCriticalThreshold: 20,
  globalNoProgressCircuitBreaker: 30,
  sideChannelDuringExecution: "paused",
  sideChannelMaxCallsPerWindow: 2,
  adaptiveStyleEnabled: false,
  adaptiveStyleMaxDriftPerWeek: 1,
  channelPersonaEnabled: false,
  hitlEnabled: false,
  hitlRiskThreshold: "high",
};

const providerNames: Record<string, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  gemini: "Google Gemini",
  openrouter: "OpenRouter",
  deepseek: "DeepSeek",
  groq: "Groq",
  xai: "xAI",
  kimi: "Kimi",
  ollama: "Ollama",
  "openai-compatible": "OpenAI Compatible",
  moa: "Mixture of Agents",
};

const browserProviders: LLMProviderType[] = [
  "anthropic",
  "openai",
  "gemini",
  "openrouter",
  "deepseek",
  "groq",
  "xai",
  "kimi",
  "ollama",
  "openai-compatible",
  "moa",
];

const providerModels: Partial<Record<LLMProviderType, LLMModelInfo[]>> = {
  anthropic: [
    {
      key: "sonnet-4-5",
      displayName: "Claude Sonnet 4.5",
      description: "Claude Sonnet 4.5",
    },
    {
      key: "opus-4-1",
      displayName: "Claude Opus 4.1",
      description: "Claude Opus 4.1",
    },
    {
      key: "haiku-4-5",
      displayName: "Claude Haiku 4.5",
      description: "Claude Haiku 4.5",
    },
  ],
  openai: [
    {
      key: "gpt-5",
      displayName: "GPT-5",
      description: "OpenAI GPT-5",
      reasoningEfforts: ["low", "medium", "high"],
    },
    {
      key: "gpt-5-mini",
      displayName: "GPT-5 mini",
      description: "OpenAI GPT-5 mini",
      reasoningEfforts: ["low", "medium", "high"],
    },
    { key: "gpt-4.1", displayName: "GPT-4.1", description: "OpenAI GPT-4.1" },
  ],
  gemini: [
    {
      key: "gemini-2.5-pro",
      displayName: "Gemini 2.5 Pro",
      description: "Google Gemini 2.5 Pro",
    },
    {
      key: "gemini-2.5-flash",
      displayName: "Gemini 2.5 Flash",
      description: "Google Gemini 2.5 Flash",
    },
  ],
  openrouter: [
    {
      key: "openai/gpt-5",
      displayName: "OpenAI GPT-5",
      description: "OpenRouter route",
    },
    {
      key: "anthropic/claude-sonnet-4.5",
      displayName: "Claude Sonnet 4.5",
      description: "OpenRouter route",
    },
    {
      key: "google/gemini-2.5-pro",
      displayName: "Gemini 2.5 Pro",
      description: "OpenRouter route",
    },
  ],
  deepseek: [
    {
      key: "deepseek-chat",
      displayName: "DeepSeek Chat",
      description: "DeepSeek Chat",
    },
    {
      key: "deepseek-reasoner",
      displayName: "DeepSeek Reasoner",
      description: "DeepSeek Reasoner",
    },
  ],
  groq: [
    {
      key: "llama-3.3-70b-versatile",
      displayName: "Llama 3.3 70B",
      description: "Groq Llama 3.3 70B",
    },
    {
      key: "openai/gpt-oss-120b",
      displayName: "GPT OSS 120B",
      description: "Groq GPT OSS 120B",
    },
  ],
  xai: [
    { key: "grok-4", displayName: "Grok 4", description: "xAI Grok 4" },
    { key: "grok-3", displayName: "Grok 3", description: "xAI Grok 3" },
  ],
  kimi: [
    {
      key: "kimi-k2-0711-preview",
      displayName: "Kimi K2",
      description: "Moonshot Kimi K2",
    },
  ],
  ollama: [
    {
      key: "llama3.1",
      displayName: "llama3.1",
      description: "Local Ollama model",
    },
    {
      key: "qwen2.5-coder",
      displayName: "qwen2.5-coder",
      description: "Local Ollama model",
    },
  ],
  "openai-compatible": [
    {
      key: "custom-model",
      displayName: "Custom model",
      description: "OpenAI-compatible model ID",
    },
  ],
};

const defaultLlmSettings: LLMSettingsData = {
  providerType: "openai",
  modelKey: "gpt-5-mini",
  openai: {
    model: "gpt-5-mini",
    authMethod: "api_key",
    reasoningEffort: "medium",
  },
};

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${key}`);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (Array.isArray(fallback)) {
      return (Array.isArray(parsed) ? parsed : fallback) as T;
    }
    if (
      fallback &&
      typeof fallback === "object" &&
      parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed)
    ) {
      return { ...fallback, ...parsed } as T;
    }
    return parsed as T;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T): void {
  try {
    window.localStorage.setItem(
      `${STORAGE_PREFIX}${key}`,
      JSON.stringify(value),
    );
  } catch {
    // Browser storage may be unavailable in private or restricted contexts.
  }
}

function unsubscribe(): void {
  // Browser preview mode has no desktop event bus.
}

const taskEventSubscribers = new Set<(event: TaskEvent) => void>();

function nowTask(input: Partial<Task> & Pick<Task, "title" | "prompt">): Task {
  const now = Date.now();
  return {
    ...input,
    id: `browser-task-${now}`,
    title: input.title,
    prompt: input.prompt,
    status: "completed",
    workspaceId: defaultWorkspace.id,
    createdAt: now,
    updatedAt: now,
    completedAt: now,
  };
}

function readTasks(): Task[] {
  const tasks = readJson<Task[] | Record<string, Task>>("tasks", []);
  if (Array.isArray(tasks)) return tasks;
  if (tasks && typeof tasks === "object") {
    return Object.keys(tasks)
      .filter((key) => /^\\d+$/.test(key))
      .sort((a, b) => Number(a) - Number(b))
      .map((key) => tasks[key])
      .filter(Boolean);
  }
  return [];
}

function saveTasks(tasks: Task[]): void {
  writeJson("tasks", tasks);
}

function taskEventsKey(taskId: string): string {
  return `task-events:${taskId}`;
}

function readTaskEvents(taskId: string): TaskEvent[] {
  const events = readJson<TaskEvent[]>(taskEventsKey(taskId), []);
  if (events.length > 0) return events;
  const task = readTasks().find((candidate) => candidate.id === taskId);
  if (!task) return [];
  const baseTime = task.createdAt || Date.now();
  const synthesizedEvents = [
    makeTaskEvent(task.id, "task_created", { title: task.title }, baseTime, 1),
    makeTaskEvent(
      task.id,
      "user_message",
      { message: task.prompt || task.title },
      baseTime + 1,
      2,
    ),
    makeTaskEvent(
      task.id,
      "assistant_message",
      { message: browserPreviewReply(task.prompt || task.title || "") },
      baseTime + 2,
      3,
    ),
    makeTaskEvent(
      task.id,
      "task_completed",
      { resultSummary: "Browser preview response displayed." },
      baseTime + 3,
      4,
    ),
  ];
  saveTaskEvents(task.id, synthesizedEvents);
  return synthesizedEvents;
}

function saveTaskEvents(taskId: string, events: TaskEvent[]): void {
  writeJson(taskEventsKey(taskId), events);
}

function makeTaskEvent(
  taskId: string,
  type: EventType,
  payload: Record<string, unknown> = {},
  timestamp = Date.now(),
  seq = 0,
): TaskEvent {
  const id = `${taskId}:${String(seq).padStart(4, "0")}:${type}`;
  return {
    id,
    eventId: id,
    taskId,
    timestamp,
    ts: timestamp,
    seq,
    type,
    payload,
    schemaVersion: 2,
  } as TaskEvent;
}

function browserPreviewReply(prompt: string): string {
  const trimmedPrompt = prompt.trim();
  return [
    trimmedPrompt
      ? translate(
          "browserPreview.receivedNamedMessage",
          "I received your message: “{message}”.",
          { message: trimmedPrompt },
        )
      : translate(
          "generated.browser.electron.api.511.0",
          "I received your message.",
        ),
    "",
    translate(
      "generated.browser.electron.api.513.1",
      "Currently open is the browser version of WebUI preview mode: the page can already create tasks and display messages, but there is no Electron main process/backend agent, so it cannot actually call the model to generate answers.",
    ),
    translate(
      "generated.browser.electron.api.514.2",
      "To get real model responses, you need to connect a backend proxy to WebUI, or use the project's original Electron main process to perform tasks.",
    ),
  ].join("\n");
}

function emitTaskEvents(events: TaskEvent[]): void {
  for (const event of events) {
    for (const subscriber of taskEventSubscribers) {
      subscriber(event);
    }
  }
}

function appendTaskEvents(taskId: string, events: TaskEvent[]): void {
  const next = [...readTaskEvents(taskId), ...events].sort((a, b) => {
    const timestampDelta = a.timestamp - b.timestamp;
    if (timestampDelta !== 0) return timestampDelta;
    return (a.seq ?? 0) - (b.seq ?? 0);
  });
  saveTaskEvents(taskId, next);
  emitTaskEvents(events);
}

function readLlmSettings(): LLMSettingsData {
  return readJson<LLMSettingsData>("llm-settings", defaultLlmSettings);
}

function readGatewayChannels(): ChannelData[] {
  return readJson<ChannelData[]>("gateway-channels", defaultGatewayChannels);
}

function writeGatewayChannels(channels: ChannelData[]): void {
  writeJson("gateway-channels", channels);
}

function readGatewayUsers(channelId?: string): ChannelUserData[] {
  const users = readJson<ChannelUserData[]>(
    "gateway-users",
    defaultGatewayUsers,
  );
  return channelId
    ? users.filter((user) => user.channelId === channelId)
    : users;
}

function hasProviderCredentials(
  settings: LLMSettingsData,
  providerType: LLMProviderType,
): boolean {
  switch (providerType) {
    case "anthropic":
      return Boolean(
        settings.anthropic?.apiKey || settings.anthropic?.subscriptionToken,
      );
    case "openai":
      return Boolean(settings.openai?.apiKey || settings.openai?.accessToken);
    case "gemini":
      return Boolean(settings.gemini?.apiKey);
    case "openrouter":
      return Boolean(settings.openrouter?.apiKey);
    case "deepseek":
      return Boolean(settings.deepseek?.apiKey);
    case "groq":
      return Boolean(settings.groq?.apiKey);
    case "xai":
      return Boolean(settings.xai?.apiKey || settings.xai?.accessToken);
    case "kimi":
      return Boolean(settings.kimi?.apiKey);
    case "ollama":
      return Boolean(settings.ollama?.baseUrl || settings.ollama?.model);
    case "openai-compatible":
      return Boolean(
        settings.openaiCompatible?.baseUrl || settings.openaiCompatible?.apiKey,
      );
    case "moa":
      return Boolean(settings.moa?.defaultPreset);
    default:
      return settings.providerType === providerType;
  }
}

function hasBrowserProviderModels(
  settings: LLMSettingsData,
  providerType: LLMProviderType,
): boolean {
  const registry = settings.providerModelRegistry?.[providerType];
  if (registry) {
    return (registry.models || []).some(
      (model) => model.trim() && registry.enabled?.[model] !== false,
    );
  }

  if (providerType === "anthropic") {
    return Boolean(
      (settings.providerType === "anthropic" && settings.modelKey?.trim()) ||
        settings.cachedAnthropicModels?.some((model) => model.key.trim()),
    );
  }

  const configuredModels: Partial<Record<LLMProviderType, string | undefined>> = {
    openai: settings.openai?.model,
    gemini: settings.gemini?.model,
    openrouter: settings.openrouter?.model,
    deepseek: settings.deepseek?.model,
    groq: settings.groq?.model,
    xai: settings.xai?.model,
    kimi: settings.kimi?.model,
    ollama: settings.ollama?.model,
    "openai-compatible": settings.openaiCompatible?.model,
    moa: settings.moa?.defaultPreset,
  };
  return Boolean(
    configuredModels[providerType]?.trim() ||
      (settings.providerType === providerType && settings.modelKey?.trim()),
  );
}

function listBrowserProviders(settings = readLlmSettings()): LLMProviderInfo[] {
  return browserProviders.map((type) => ({
    type,
    name:
      type === "openai-compatible"
        ? settings.openaiCompatible?.displayName?.trim() ||
          settings.openaiCompatible?.model?.trim() ||
          providerNames[type] ||
          type
        : providerNames[type] || type,
    configured:
      hasProviderCredentials(settings, type) &&
      hasBrowserProviderModels(settings, type),
  }));
}

function listBrowserModels(providerType: LLMProviderType): LLMModelInfo[] {
  const settings = readLlmSettings();
  const staticModels = (providerModels[providerType] || []).map((model) =>
    providerType === "openai-compatible"
      ? {
          ...model,
          description: `${
            settings.openaiCompatible?.displayName?.trim() ||
            settings.openaiCompatible?.model?.trim() ||
            "OpenAI-compatible"
          } model`,
        }
      : model,
  );
  const configuredModel =
    providerType === settings.providerType ? settings.modelKey : undefined;
  if (
    !configuredModel ||
    staticModels.some((model) => model.key === configuredModel)
  ) {
    return staticModels;
  }
  return [
    {
      key: configuredModel,
      displayName: configuredModel,
      description: "Configured model",
    },
    ...staticModels,
  ];
}

function getBrowserLlmConfigStatus(): LLMConfigStatus {
  const settings = readLlmSettings();
  const providers = listBrowserProviders(settings);
  const configuredProvider =
    providers.find(
      (provider) =>
        provider.type === settings.providerType && provider.configured,
    ) || providers.find((provider) => provider.configured);
  const currentProvider = configuredProvider?.type || settings.providerType;
  return {
    currentProvider,
    currentModel: configuredProvider ? settings.modelKey : "",
    ...(configuredProvider
      ? {
          currentReasoningEffort:
            settings.openai?.reasoningEffort ||
            settings.azure?.reasoningEffort ||
            settings.anthropic?.reasoningEffort ||
            "medium",
        }
      : {}),
    providers,
    models: configuredProvider ? listBrowserModels(currentProvider) : [],
  };
}

function providerConfigKey(
  providerType: LLMProviderType,
): keyof LLMSettingsData | null {
  const keyMap: Partial<Record<LLMProviderType, keyof LLMSettingsData>> = {
    anthropic: "anthropic",
    openai: "openai",
    gemini: "gemini",
    openrouter: "openrouter",
    deepseek: "deepseek",
    groq: "groq",
    xai: "xai",
    kimi: "kimi",
    ollama: "ollama",
    "openai-compatible": "openaiCompatible",
    moa: "moa",
  };
  return keyMap[providerType] || null;
}

function writeSelectedModel(
  selection:
    | string
    | {
        providerType?: LLMProviderType;
        modelKey: string;
        reasoningEffort?: LLMSettingsData["openai"] extends {
          reasoningEffort?: infer T;
        }
          ? T
          : never;
      },
): { success: boolean } {
  const current = readLlmSettings();
  const providerType =
    typeof selection === "string"
      ? current.providerType
      : selection.providerType || current.providerType;
  const modelKey =
    typeof selection === "string" ? selection : selection.modelKey;
  const reasoningEffort =
    typeof selection === "string" ? undefined : selection.reasoningEffort;
  const next: LLMSettingsData = {
    ...current,
    providerType,
    modelKey,
  };
  const configKey = providerConfigKey(providerType);
  if (configKey && configKey !== "moa") {
    const existing = (next[configKey] || {}) as Record<string, unknown>;
    next[configKey] = {
      ...existing,
      model: modelKey,
      ...(providerType === "openai" && reasoningEffort
        ? { reasoningEffort }
        : {}),
    } as never;
  }
  writeJson("llm-settings", next);
  window.dispatchEvent(
    new CustomEvent("neoworker-browser-llm-settings-changed", {
      detail: getBrowserLlmConfigStatus(),
    }),
  );
  return { success: true };
}

function cloneEverydayProfile(): EverydayAgentProfile {
  const now = Date.now();
  return {
    ...DEFAULT_EVERYDAY_AGENT_PROFILE,
    capabilitySettings: Object.fromEntries(
      Object.entries(DEFAULT_EVERYDAY_AGENT_PROFILE.capabilitySettings).map(
        ([key, value]) => [key, { ...value }],
      ),
    ) as EverydayAgentProfile["capabilitySettings"],
    connectorAllowlists: {
      ...DEFAULT_EVERYDAY_AGENT_PROFILE.connectorAllowlists,
    },
    workspaceScopes: [...DEFAULT_EVERYDAY_AGENT_PROFILE.workspaceScopes],
    accountScopes: { ...DEFAULT_EVERYDAY_AGENT_PROFILE.accountScopes },
    memoryPolicy: { ...DEFAULT_EVERYDAY_AGENT_PROFILE.memoryPolicy },
    activeHours: {
      ...DEFAULT_EVERYDAY_AGENT_PROFILE.activeHours,
      windows: [...DEFAULT_EVERYDAY_AGENT_PROFILE.activeHours.windows],
    },
    retention: { ...DEFAULT_EVERYDAY_AGENT_PROFILE.retention },
    browserProfilePolicy: {
      ...DEFAULT_EVERYDAY_AGENT_PROFILE.browserProfilePolicy,
    },
    pauseScopes: [...DEFAULT_EVERYDAY_AGENT_PROFILE.pauseScopes],
    revokedCapabilities: [
      ...DEFAULT_EVERYDAY_AGENT_PROFILE.revokedCapabilities,
    ],
    createdAt: now,
    updatedAt: now,
  };
}

function normalizeEverydayProfile(
  profile: Partial<EverydayAgentProfile>,
): EverydayAgentProfile {
  const fallback = cloneEverydayProfile();
  return {
    ...fallback,
    ...profile,
    capabilitySettings: {
      ...fallback.capabilitySettings,
      ...(profile.capabilitySettings || {}),
    },
    connectorAllowlists: {
      ...fallback.connectorAllowlists,
      ...(profile.connectorAllowlists || {}),
    },
    workspaceScopes: profile.workspaceScopes || fallback.workspaceScopes,
    accountScopes: profile.accountScopes || fallback.accountScopes,
    memoryPolicy: {
      ...fallback.memoryPolicy,
      ...(profile.memoryPolicy || {}),
    },
    activeHours: {
      ...fallback.activeHours,
      ...(profile.activeHours || {}),
    },
    retention: {
      ...fallback.retention,
      ...(profile.retention || {}),
    },
    browserProfilePolicy: {
      ...fallback.browserProfilePolicy,
      ...(profile.browserProfilePolicy || {}),
    },
    pauseScopes: profile.pauseScopes || fallback.pauseScopes,
    revokedCapabilities:
      profile.revokedCapabilities || fallback.revokedCapabilities,
  };
}

function readEverydayProfile(): EverydayAgentProfile {
  return normalizeEverydayProfile(
    readJson<Partial<EverydayAgentProfile>>(
      "everyday-agent-profile",
      cloneEverydayProfile(),
    ),
  );
}

function writeEverydayProfile(
  profile: EverydayAgentProfile,
): EverydayAgentProfile {
  const next = normalizeEverydayProfile({
    ...profile,
    updatedAt: Date.now(),
  });
  writeJson("everyday-agent-profile", next);
  return next;
}

function compileEverydayPolicy(
  profile: EverydayAgentProfile,
): EverydayAgentProfileResult {
  const allowedCapabilities = Object.entries(profile.capabilitySettings)
    .filter(([, setting]) => setting.enabled && !setting.paused)
    .map(([capability]) => capability as EverydayCapabilityBundle)
    .filter((capability) => !profile.revokedCapabilities.includes(capability));
  return {
    profile,
    compiledPolicy: {
      enabled: profile.enabled && profile.pauseScopes.length === 0,
      profileId: profile.id,
      managedAgentId: profile.managedAgentId,
      managedEnvironmentId: profile.managedEnvironmentId,
      allowedCapabilities,
      blockedCapabilities: [],
      pausedScopes: profile.pauseScopes,
      approvalPosture: profile.approvalPosture,
      reviewOnly: profile.approvalPosture === "review_only",
      visibleBrowserRequired: profile.browserProfilePolicy.preferVisibleBrowser,
      allowRealBrowserAttach:
        profile.browserProfilePolicy.allowRealBrowserAttach,
      alwaysRequireApproval: EVERYDAY_AGENT_ALWAYS_APPROVAL_RISKS,
      permissionRules: [],
      workflowTargets: [],
      routineEligibility: allowedCapabilities.map((capability) => ({
        capability,
        eligible: true,
      })),
      adminPolicy: {
        blocked: false,
        blockedBundles: [],
        forceReviewOnly: false,
        maxHeartbeatCadenceMinutes: profile.heartbeatCadenceMinutes,
        maxConcurrentBackgroundWork: profile.maxConcurrentBackgroundWork,
      },
    },
  };
}

function readEverydayResult(): EverydayAgentProfileResult {
  return compileEverydayPolicy(readEverydayProfile());
}

function readEverydayReceipts(): EverydayActionReceipt[] {
  return readJson<EverydayActionReceipt[]>("everyday-agent-receipts", []);
}

function writeEverydayReceipts(receipts: EverydayActionReceipt[]): void {
  writeJson("everyday-agent-receipts", receipts);
}

function inferEverydayRisk(
  input: EverydayActionPreviewInput,
): EverydayActionRisk {
  const haystack =
    `${input.title} ${input.action} ${input.toolName || ""}`.toLowerCase();
  if (haystack.includes("delete") || haystack.includes("remove"))
    return "destructive";
  if (
    haystack.includes("send") ||
    haystack.includes("post") ||
    haystack.includes("reply")
  ) {
    return "execute_sensitive";
  }
  if (haystack.includes("export")) return "data_export";
  if (haystack.includes("draft")) return "draft";
  return "stage";
}

function everydayPreviewFromInput(
  input: EverydayActionPreviewInput,
): EverydayActionPreview {
  const profile = readEverydayProfile();
  const now = Date.now();
  const riskClass = inferEverydayRisk(input);
  return {
    id: `browser-everyday-preview-${now}`,
    profileId: input.profileId || profile.id,
    workspaceId: input.workspaceId,
    capability: input.capability || "automations",
    riskClass,
    title: input.title,
    action: input.action,
    sourceEvidence: input.sourceEvidence || [],
    target: {
      workspaceId: input.workspaceId,
      connectorId: input.connectorId,
      connectorAccountId: input.connectorAccountId,
      browserProfileId: input.browserProfileId,
      channelId: input.channelId,
      deviceId: input.deviceId,
      targetIdentity: input.targetIdentity,
      destination: input.destination,
    },
    proposedMutation: input.proposedMutation || input.action,
    affectedObjects: input.affectedObjects || [],
    rollbackAvailable: input.rollbackAvailable ?? true,
    approvalRequired: true,
    approvalReason:
      "Browser preview mode keeps Everyday Agent actions review-first.",
    idempotencyKey: `browser-${now}`,
    status: "pending",
    createdAt: now,
    expiresAt: now + 30 * 60 * 1000,
    metadata: input.metadata,
  };
}

function unsupported(name: string): Promise<{ success: false; error: string }> {
  return Promise.resolve({
    success: false,
    error: `${name} is unavailable in browser-only mode.`,
  });
}

const browserApiBase = {
  getPlatform: () => "browser",
  getAppVersion: () =>
    Promise.resolve({
      version: "browser-preview",
      isDev: true,
      isNpmGlobal: false,
      isGitRepo: false,
    }),
  windowMinimize: () => undefined,
  windowMaximize: () => undefined,
  windowClose: () => undefined,
  openExternal: (url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
    return Promise.resolve();
  },
  selectFolder: () => Promise.resolve(null),
  selectFiles: () => Promise.resolve([]),
  selectSavePath: () => Promise.resolve(null),
  openFile: (filePath: string) => unsupported(`openFile(${filePath})`),
  openFileWithApp: (filePath: string) =>
    unsupported(`openFileWithApp(${filePath})`),
  showInFinder: () => Promise.resolve(),
  downloadFile: (filePath: string) => unsupported(`downloadFile(${filePath})`),
  getAppearanceSettings: () =>
    Promise.resolve(readJson("appearance", defaultAppearance)),
  saveAppearanceSettings: (settings: Partial<AppearanceSettings>) => {
    const next = { ...readJson("appearance", defaultAppearance), ...settings };
    writeJson("appearance", next);
    return Promise.resolve({ success: true });
  },
  getPermissionSettings: () =>
    Promise.resolve(readJson("permission-settings", defaultPermissionSettings)),
  savePermissionSettings: (settings: PermissionSettingsData) => {
    writeJson("permission-settings", settings);
    return Promise.resolve({ success: true, settings });
  },
  getGuardrailSettings: () =>
    Promise.resolve(readJson("guardrail-settings", defaultGuardrailSettings)),
  saveGuardrailSettings: (settings: GuardrailSettings) => {
    const next = { ...defaultGuardrailSettings, ...settings };
    writeJson("guardrail-settings", next);
    return Promise.resolve({ success: true, settings: next });
  },
  getGuardrailDefaults: () => Promise.resolve(defaultGuardrailSettings),
  resetAdaptiveStyle: () => Promise.resolve({ success: true }),
  getVoiceSettings: () =>
    Promise.resolve(readJson("voice-settings", DEFAULT_VOICE_SETTINGS)),
  saveVoiceSettings: (settings: Partial<typeof DEFAULT_VOICE_SETTINGS>) => {
    const next = {
      ...readJson("voice-settings", DEFAULT_VOICE_SETTINGS),
      ...settings,
    };
    writeJson("voice-settings", next);
    return Promise.resolve(next);
  },
  getAppearanceRuntimeInfo: () =>
    Promise.resolve({
      devLogCaptureEnabled: false,
    }),
  getPersonalitySettings: () =>
    Promise.resolve({
      identity: "",
      communicationStyle: "",
      userPreferences: "",
      customInstructions: "",
    }),
  savePersonalitySettings: () => Promise.resolve({ success: true }),
  resetPersonalitySettings: () => Promise.resolve({ success: true }),
  getPersonalityConfigV2: () =>
    Promise.resolve(readJson("personality-v2", DEFAULT_PERSONALITY_CONFIG_V2)),
  savePersonalityConfigV2: (config: typeof DEFAULT_PERSONALITY_CONFIG_V2) => {
    writeJson("personality-v2", config);
    return Promise.resolve({ success: true });
  },
  getPersonaDefinitions: () => Promise.resolve(PERSONA_DEFINITIONS),
  getPersonalityTraitPresets: () => Promise.resolve(TRAIT_PRESETS),
  getRelationshipStats: () =>
    Promise.resolve({
      tasksCompleted: 0,
      projectsCount: 0,
      daysTogether: 0,
      nextMilestone: 10,
    }),
  getPersonalityPreview: () =>
    Promise.resolve(
      "Browser preview mode: personality prompt preview is unavailable.",
    ),
  exportPersonalityProfile: (format: "json" | "md") => {
    const config = readJson("personality-v2", DEFAULT_PERSONALITY_CONFIG_V2);
    return Promise.resolve(
      format === "json"
        ? JSON.stringify(config, null, 2)
        : config.soulDocument || "",
    );
  },
  importPersonalityProfile: () => Promise.resolve({ success: true }),
  getLLMConfigStatus: () => Promise.resolve(getBrowserLlmConfigStatus()),
  getLLMRoutingStatus: () => Promise.resolve(null),
  onLLMRoutingEvent: () => unsubscribe,
  getLLMSettings: () => Promise.resolve(readLlmSettings()),
  saveLLMSettings: (settings: LLMSettingsData) => {
    writeJson("llm-settings", settings);
    return Promise.resolve({ success: true });
  },
  setLLMModel: (selection: Parameters<typeof writeSelectedModel>[0]) =>
    Promise.resolve(writeSelectedModel(selection)),
  resetLLMProviderCredentials: (providerType: LLMProviderType) => {
    const settings = { ...readLlmSettings() };
    const key = providerConfigKey(providerType);
    if (key) delete settings[key];
    writeJson("llm-settings", settings);
    return Promise.resolve({ success: true });
  },
  testLLMProvider: () =>
    Promise.resolve({
      success: false,
      error: "Provider testing is unavailable in browser-only mode.",
    }),
  getProviderModels: (providerType: LLMProviderType) => {
    const settings = readLlmSettings();
    const configured = listBrowserProviders(settings).some(
      (provider) => provider.type === providerType && provider.configured,
    );
    return Promise.resolve(configured ? listBrowserModels(providerType) : []);
  },
  getAnthropicModels: () =>
    Promise.resolve(
      listBrowserModels("anthropic").map((model) => ({
        id: model.key,
        displayName: model.displayName,
        description: model.description,
      })),
    ),
  getOpenAIModels: () =>
    Promise.resolve(
      listBrowserModels("openai").map((model) => ({
        id: model.key,
        name: model.displayName,
        description: model.description,
      })),
    ),
  getQueueStatus: () => Promise.resolve(defaultQueueStatus),
  getMigrationStatus: () =>
    Promise.resolve({
      migrated: false,
      notificationDismissed: true,
    }),
  dismissMigrationNotification: () => Promise.resolve(),
  checkForUpdates: () => Promise.resolve({ available: false }),
  getTempWorkspace: () => Promise.resolve(defaultWorkspace),
  listWorkspaces: (options?: { includeArchived?: boolean }) =>
    Promise.resolve(
      options?.includeArchived === false && defaultWorkspace.archivedAt
        ? []
        : [defaultWorkspace],
    ),
  setWorkspaceArchived: (_id: string, archived: boolean) =>
    Promise.resolve({
      ...defaultWorkspace,
      archivedAt: archived ? Date.now() : undefined,
    }),
  selectWorkspace: () => Promise.resolve(defaultWorkspace),
  createWorkspace: () => Promise.resolve(defaultWorkspace),
  touchWorkspace: () => Promise.resolve(),
  updateWorkspacePermissions: (
    _workspaceId: string,
    permissions: Partial<Workspace["permissions"]>,
  ) =>
    Promise.resolve({
      ...defaultWorkspace,
      permissions: { ...defaultWorkspace.permissions, ...permissions },
    }),
  listTasks: () => Promise.resolve(readTasks()),
  listSidebarTasks: () => Promise.resolve(readTasks()),
  getTask: (taskId: string) =>
    Promise.resolve(readTasks().find((task) => task.id === taskId) ?? null),
  getTaskEvents: (taskId: string) => Promise.resolve(readTaskEvents(taskId)),
  getTaskTimelinePage: (request: { taskId: string; limit?: number }) => {
    const allEvents = readTaskEvents(request.taskId);
    const limit =
      request.limit && request.limit > 0 ? request.limit : allEvents.length;
    const events = allEvents.slice(Math.max(0, allEvents.length - limit));
    const payloadBytes = events.reduce(
      (total, event) => total + JSON.stringify(event.payload ?? {}).length,
      0,
    );
    return Promise.resolve({
      taskId: request.taskId,
      events,
      hasMoreHistory: events.length < allEvents.length,
      nextCursor: null,
      summary: {
        eventCount: allEvents.length,
        payloadBytes,
        truncatedEventCount: 0,
        largestEventPayloadBytes: events.reduce(
          (largest, event) =>
            Math.max(largest, JSON.stringify(event.payload ?? {}).length),
          0,
        ),
      },
    });
  },
  getTaskEventDetail: (request: { taskId: string; eventId: string }) => {
    const event =
      readTaskEvents(request.taskId).find(
        (candidate) =>
          candidate.id === request.eventId ||
          candidate.eventId === request.eventId,
      ) ?? null;
    return Promise.resolve({
      event,
      payloadBytes: event ? JSON.stringify(event.payload ?? {}).length : 0,
    });
  },
  listInputRequests: () => Promise.resolve([]),
  listNotifications: () => Promise.resolve([]),
  addNotification: () => Promise.resolve({ success: true }),
  deleteNotification: () => Promise.resolve(true),
  listSuggestions: () => Promise.resolve([]),
  everydayAgentGetProfile: () => Promise.resolve(readEverydayResult()),
  everydayAgentUpdateProfile: (updates: EverydayAgentUpdateProfileRequest) => {
    const current = readEverydayProfile();
    const capabilitySettings = { ...current.capabilitySettings };
    for (const [capability, setting] of Object.entries(
      updates.capabilitySettings || {},
    )) {
      const key = capability as EverydayCapabilityBundle;
      capabilitySettings[key] = {
        ...capabilitySettings[key],
        ...setting,
      };
    }
    const next = writeEverydayProfile({
      ...current,
      ...updates,
      capabilitySettings,
      memoryPolicy: {
        ...current.memoryPolicy,
        ...(updates.memoryPolicy || {}),
      },
      activeHours: {
        ...current.activeHours,
        ...(updates.activeHours || {}),
      },
      retention: {
        ...current.retention,
        ...(updates.retention || {}),
      },
      browserProfilePolicy: {
        ...current.browserProfilePolicy,
        ...(updates.browserProfilePolicy || {}),
      },
    });
    return Promise.resolve(compileEverydayPolicy(next));
  },
  everydayAgentAcceptConsent: (request?: {
    enabled?: boolean;
    accepted?: boolean;
    workspaceId?: string;
  }) => {
    const current = readEverydayProfile();
    const accepted = request?.accepted !== false;
    const next = writeEverydayProfile({
      ...current,
      enabled: accepted ? request?.enabled !== false : false,
      acceptedConsentVersion: accepted
        ? EVERYDAY_AGENT_CONSENT_VERSION
        : current.acceptedConsentVersion,
      consentAcceptedAt: accepted ? Date.now() : current.consentAcceptedAt,
      declinedConsentVersion: accepted
        ? undefined
        : EVERYDAY_AGENT_CONSENT_VERSION,
      consentDeclinedAt: accepted ? undefined : Date.now(),
      workspaceScopes:
        accepted && request?.workspaceId
          ? Array.from(
              new Set([...current.workspaceScopes, request.workspaceId]),
            )
          : current.workspaceScopes,
    });
    return Promise.resolve(compileEverydayPolicy(next));
  },
  everydayAgentPause: (scope: Partial<EverydayPauseScope>) => {
    const current = readEverydayProfile();
    const now = Date.now();
    const nextScope: EverydayPauseScope = {
      id: `browser-pause-${now}`,
      kind: scope.kind || "global",
      capability: scope.capability,
      targetId: scope.targetId,
      reason: scope.reason || "Paused in browser preview",
      pausedAt: now,
      expiresAt: scope.expiresAt,
    };
    const next = writeEverydayProfile({
      ...current,
      pauseScopes: [nextScope, ...current.pauseScopes],
    });
    return Promise.resolve(compileEverydayPolicy(next));
  },
  everydayAgentRevokeCapability: (capability: EverydayCapabilityBundle) => {
    const current = readEverydayProfile();
    const next = writeEverydayProfile({
      ...current,
      capabilitySettings: {
        ...current.capabilitySettings,
        [capability]: {
          ...current.capabilitySettings[capability],
          enabled: false,
          paused: true,
        },
      },
      revokedCapabilities: Array.from(
        new Set([...current.revokedCapabilities, capability]),
      ),
    });
    return Promise.resolve(compileEverydayPolicy(next));
  },
  everydayAgentListReceipts: (request?: EverydayAgentListReceiptsRequest) => {
    const receipts = readEverydayReceipts().filter((receipt) => {
      if (request?.profileId && receipt.profileId !== request.profileId)
        return false;
      if (request?.workspaceId && receipt.workspaceId !== request.workspaceId)
        return false;
      if (request?.capability && receipt.capability !== request.capability)
        return false;
      return true;
    });
    return Promise.resolve(
      receipts.slice(
        request?.offset || 0,
        (request?.offset || 0) + (request?.limit || 50),
      ),
    );
  },
  everydayAgentClearData: (request?: EverydayAgentClearDataRequest) => {
    if (
      !request ||
      request.receipts ||
      request.previews ||
      request.trustPatterns
    ) {
      writeEverydayReceipts([]);
    }
    if (request?.profile) {
      writeEverydayProfile(cloneEverydayProfile());
    } else if (request?.pauseScopes || request?.consentHistory) {
      const current = readEverydayProfile();
      writeEverydayProfile({
        ...current,
        pauseScopes: request.pauseScopes ? [] : current.pauseScopes,
        acceptedConsentVersion: request.consentHistory
          ? 0
          : current.acceptedConsentVersion,
        consentAcceptedAt: request.consentHistory
          ? undefined
          : current.consentAcceptedAt,
        declinedConsentVersion: request.consentHistory
          ? undefined
          : current.declinedConsentVersion,
        consentDeclinedAt: request.consentHistory
          ? undefined
          : current.consentDeclinedAt,
      });
    }
    return Promise.resolve(readEverydayResult());
  },
  everydayAgentPreviewAction: (input: EverydayActionPreviewInput) =>
    Promise.resolve(everydayPreviewFromInput(input)),
  everydayAgentApproveAction: (request: { previewId: string }) => {
    const now = Date.now();
    const profile = readEverydayProfile();
    const receipt: EverydayActionReceipt = {
      id: `browser-everyday-receipt-${now}`,
      profileId: profile.id,
      capability: "automations",
      riskClass: "stage",
      status: "approved",
      title: "Browser preview approval",
      summary:
        "Preview approved in browser-only mode. No external action was executed.",
      sourceSignals: ["Browser preview"],
      previewId: request.previewId,
      toolCalls: [],
      externalIds: [],
      idempotencyKey: `browser-receipt-${now}`,
      createdAt: now,
      updatedAt: now,
    };
    writeEverydayReceipts([receipt, ...readEverydayReceipts()]);
    return Promise.resolve(receipt);
  },
  listRoutines: () => Promise.resolve([]),
  listRoutineRuns: () => Promise.resolve([]),
  listManagedAgentRoutines: () => Promise.resolve([]),
  getOpenCommitments: () => Promise.resolve([]),
  getDueSoonCommitments: () => Promise.resolve({ items: [] }),
  getUserProfile: () => Promise.resolve(null),
  listCustomSkills: () => Promise.resolve(readJson("custom-skills", [])),
  getCustomSkillSettings: () =>
    Promise.resolve(
      readJson("custom-skill-settings", { externalSkillDirectories: [] }),
    ),
  reloadCustomSkills: () => Promise.resolve(readJson("custom-skills", [])),
  openCustomSkillsFolder: () => Promise.resolve(),
  openExternalSkillFolder: () => Promise.resolve(),
  setExternalSkillDirectories: (externalSkillDirectories: string[]) => {
    const next = { externalSkillDirectories };
    writeJson("custom-skill-settings", next);
    return Promise.resolve(next);
  },
  createCustomSkill: (skill: Any) => {
    const created = { ...skill, id: skill.id || `browser-skill-${Date.now()}` };
    const skills = [...readJson<Any[]>("custom-skills", []), created];
    writeJson("custom-skills", skills);
    return Promise.resolve(created);
  },
  updateCustomSkill: (id: string, skill: Any) => {
    const updated = { ...skill, id };
    const skills = readJson<Any[]>("custom-skills", []).map((entry) =>
      entry.id === id ? updated : entry,
    );
    writeJson("custom-skills", skills);
    return Promise.resolve(updated);
  },
  deleteCustomSkill: (id: string) => {
    writeJson(
      "custom-skills",
      readJson<Any[]>("custom-skills", []).filter((entry) => entry.id !== id),
    );
    return Promise.resolve({ success: true });
  },
  getBuiltinToolsSettings: () => {
    const settings = readJson(
      "builtin-tools-settings",
      defaultBuiltinToolsSettings,
    );
    return Promise.resolve(
      settings && typeof settings === "object" && "categories" in settings
        ? settings
        : defaultBuiltinToolsSettings,
    );
  },
  saveBuiltinToolsSettings: (settings: typeof defaultBuiltinToolsSettings) => {
    writeJson("builtin-tools-settings", settings);
    return Promise.resolve({ success: true });
  },
  getBuiltinToolsCategories: () =>
    Promise.resolve(defaultBuiltinToolsCategories),
  getChronicleSettings: () => {
    const settings = readJson("chronicle-settings", defaultChronicleSettings);
    return Promise.resolve(
      settings && typeof settings === "object" && "enabled" in settings
        ? settings
        : defaultChronicleSettings,
    );
  },
  saveChronicleSettings: (settings: typeof defaultChronicleSettings) => {
    writeJson("chronicle-settings", settings);
    return Promise.resolve({ success: true, settings });
  },
  getChronicleStatus: () => Promise.resolve(defaultChronicleStatus),
  getComputerUseStatus: () => Promise.resolve(defaultComputerUseStatus),
  onComputerUseEvent: () => unsubscribe,
  endComputerUseSession: () => Promise.resolve({ success: true }),
  openComputerUseScreenRecordingSettings: () => Promise.resolve(),
  openComputerUseAccessibilitySettings: () => Promise.resolve(),
  getMCPSettings: () =>
    Promise.resolve(readJson("mcp-settings", defaultMcpSettings)),
  saveMCPSettings: (settings: typeof defaultMcpSettings) => {
    writeJson("mcp-settings", settings);
    return Promise.resolve({ success: true });
  },
  getMCPStatus: () => Promise.resolve([]),
  addMCPServer: () => Promise.resolve({ success: true }),
  removeMCPServer: () => Promise.resolve({ success: true }),
  connectMCPServer: () => Promise.resolve({ success: true }),
  disconnectMCPServer: () => Promise.resolve({ success: true }),
  testMCPServer: () =>
    Promise.resolve({
      success: false,
      error: "Unavailable in browser preview",
    }),
  getSecureMcpTunnelSettings: () => Promise.resolve({ tunnels: [] }),
  getSecureMcpTunnelStatus: () => Promise.resolve([]),
  getSecureMcpTunnelAudit: () => Promise.resolve([]),
  addSecureMcpTunnel: () => Promise.resolve({ success: true }),
  removeSecureMcpTunnel: () => Promise.resolve({ success: true }),
  startSecureMcpTunnel: () => Promise.resolve({ success: true }),
  stopSecureMcpTunnel: () => Promise.resolve({ success: true }),
  getGatewayChannels: () => Promise.resolve(readGatewayChannels()),
  startWeixinLogin: () =>
    Promise.reject(
      new Error(
        translate(
          "generated.browser.electron.api.1419.3",
          "WeChat scan code login can only be used in the desktop application",
        ),
      ),
    ),
  pollWeixinLogin: () => Promise.resolve({ status: "expired" as const }),
  getGatewayUsers: (channelId?: string) =>
    Promise.resolve(readGatewayUsers(channelId)),
  addGatewayChannel: (request: AddChannelRequest) => {
    const now = Date.now();
    const channel: ChannelData = {
      id: `browser-channel-${now}`,
      type: request.type,
      name: request.name || request.type,
      enabled: true,
      status: request.type === "whatsapp" ? "connecting" : "connected",
      botUsername:
        request.type === "telegram"
          ? "browser_preview_bot"
          : request.type === "slack"
            ? "neoworker-browser"
            : undefined,
      securityMode: request.securityMode || "pairing",
      createdAt: now,
      config: {
        selfChatMode: request.selfChatMode,
        progressRelayMode: request.progressRelayMode,
        groupRoutingMode: request.groupRoutingMode,
        trustedGroupMemoryOptIn: request.trustedGroupMemoryOptIn,
        sendReadReceipts: request.sendReadReceipts,
        deduplicationEnabled: request.deduplicationEnabled,
        responsePrefix: request.responsePrefix,
        ingestNonSelfChatsInSelfChatMode:
          request.ingestNonSelfChatsInSelfChatMode,
        telegramAllowedGroupChatIds: request.telegramAllowedGroupChatIds,
      },
    };
    writeGatewayChannels([channel, ...readGatewayChannels()]);
    return Promise.resolve(channel);
  },
  updateGatewayChannel: (request: Partial<ChannelData> & { id: string }) => {
    let updated: ChannelData | null = null;
    const channels = readGatewayChannels().map((channel) => {
      if (channel.id !== request.id) return channel;
      updated = {
        ...channel,
        ...request,
        config: {
          ...channel.config,
          ...request.config,
        },
      };
      return updated;
    });
    writeGatewayChannels(channels);
    return Promise.resolve(
      updated || channels.find((channel) => channel.id === request.id) || null,
    );
  },
  removeGatewayChannel: (channelId: string) => {
    writeGatewayChannels(
      readGatewayChannels().filter((channel) => channel.id !== channelId),
    );
    return Promise.resolve({ success: true });
  },
  enableGatewayChannel: (channelId: string) => {
    writeGatewayChannels(
      readGatewayChannels().map((channel) =>
        channel.id === channelId ? { ...channel, enabled: true } : channel,
      ),
    );
    return Promise.resolve({ success: true });
  },
  disableGatewayChannel: (channelId: string) => {
    writeGatewayChannels(
      readGatewayChannels().map((channel) =>
        channel.id === channelId ? { ...channel, enabled: false } : channel,
      ),
    );
    return Promise.resolve({ success: true });
  },
  testGatewayChannel: (channelId: string) => {
    const channel = readGatewayChannels().find(
      (entry) => entry.id === channelId,
    );
    return Promise.resolve({
      success: Boolean(channel),
      error: channel ? undefined : "Channel not found",
      botUsername: channel?.botUsername,
      phoneNumber: channel?.type === "whatsapp" ? "browser-preview" : undefined,
    });
  },
  generateGatewayPairing: () =>
    Promise.resolve(String(Math.floor(100000 + Math.random() * 900000))),
  revokeGatewayAccess: () => Promise.resolve({ success: true }),
  getWhatsAppInfo: () => Promise.resolve({ isReady: false }),
  logoutWhatsApp: () => Promise.resolve({ success: true }),
  onGatewayUsersUpdated: () => unsubscribe,
  onWhatsAppQRCode: () => unsubscribe,
  onWhatsAppConnected: () => unsubscribe,
  getUsageInsights: () => Promise.resolve(null),
  listPluginPacks: () => Promise.resolve([]),
  listTaskSkills: () => Promise.resolve([]),
  listIntegrationMentionOptions: () => Promise.resolve([]),
  getAgentRoles: () => Promise.resolve([]),
  listMentions: () => Promise.resolve({ items: [] }),
  createTask: (
    input: Partial<Task> & {
      title?: string;
      prompt?: string;
      description?: string;
    },
  ) => {
    const prompt = input.prompt || input.description || "";
    const task = nowTask({
      title: input.title || "Browser preview task",
      prompt,
      status: "completed",
      workspaceId: input.workspaceId || defaultWorkspace.id,
    });
    saveTasks([task, ...readTasks()]);
    const now = Date.now();
    const events = [
      makeTaskEvent(task.id, "task_created", { title: task.title }, now, 1),
      makeTaskEvent(task.id, "user_message", { message: prompt }, now + 1, 2),
      makeTaskEvent(
        task.id,
        "assistant_message",
        { message: browserPreviewReply(prompt) },
        now + 2,
        3,
      ),
      makeTaskEvent(
        task.id,
        "task_completed",
        { resultSummary: "Browser preview response displayed." },
        now + 3,
        4,
      ),
    ];
    saveTaskEvents(task.id, events);
    emitTaskEvents(events);
    return Promise.resolve(task);
  },
  sendMessage: (taskId: string, message: string) => {
    const existingEvents = readTaskEvents(taskId);
    const baseSeq = existingEvents.reduce(
      (largest, event) => Math.max(largest, event.seq ?? 0),
      0,
    );
    const now = Date.now();
    appendTaskEvents(taskId, [
      makeTaskEvent(taskId, "user_message", { message }, now, baseSeq + 1),
      makeTaskEvent(
        taskId,
        "assistant_message",
        { message: browserPreviewReply(message) },
        now + 1,
        baseSeq + 2,
      ),
      makeTaskEvent(
        taskId,
        "task_completed",
        { resultSummary: "Browser preview response displayed." },
        now + 2,
        baseSeq + 3,
      ),
    ]);
    const tasks = readTasks().map((task) =>
      task.id === taskId
        ? {
            ...task,
            updatedAt: now,
            completedAt: now,
            status: "completed" as const,
          }
        : task,
    );
    saveTasks(tasks);
    return Promise.resolve({ queued: false });
  },
  listQueuedFollowUps: () => Promise.resolve([]),
  updateQueuedFollowUp: () => Promise.resolve(undefined),
  reorderQueuedFollowUps: () => Promise.resolve([]),
  removeQueuedFollowUp: () => Promise.resolve({ removed: false }),
  cancelTask: () => Promise.resolve(),
  resumeTask: () => Promise.resolve(),
  wrapUpTask: () => Promise.resolve(),
  forkTaskSession: () => unsupported("forkTaskSession"),
  deleteTask: (taskId: string) => {
    saveTasks(readTasks().filter((task) => task.id !== taskId));
    return Promise.resolve(true);
  },
  toggleTaskPin: (taskId: string) => {
    const tasks = readTasks().map((task) =>
      task.id === taskId ? { ...task, pinned: !task.pinned } : task,
    );
    saveTasks(tasks);
    return Promise.resolve(tasks.find((task) => task.id === taskId) ?? null);
  },
  renameTask: (taskId: string, title: string) => {
    const tasks = readTasks().map((task) =>
      task.id === taskId ? { ...task, title } : task,
    );
    saveTasks(tasks);
    return Promise.resolve(tasks.find((task) => task.id === taskId) ?? null);
  },
  archiveTask: () => Promise.resolve(true),
  unarchiveTask: () => Promise.resolve(true),
  listArchivedTasks: () => Promise.resolve([]),
  purgeArchivedTask: (taskId: string) => {
    saveTasks(readTasks().filter((task) => task.id !== taskId));
    return Promise.resolve({
      sessionId: taskId,
      taskCount: 1,
      deletedTaskIds: [taskId],
    });
  },
  listPendingApprovals: () => Promise.resolve([]),
  respondToApproval: () => Promise.resolve("handled" as const),
  respondToInputRequest: () => Promise.resolve({ success: true }),
  setSessionAutoApprove: () => Promise.resolve(),
  getSessionAutoApprove: () => Promise.resolve(false),
  onTaskEvent: (callback: (event: TaskEvent) => void) => {
    taskEventSubscribers.add(callback);
    return () => taskEventSubscribers.delete(callback);
  },
  onQueueUpdate: () => unsubscribe,
  onNavigateToTask: () => unsubscribe,
  onBrowserWorkbenchOpenRequest: () => unsubscribe,
  onPersonalitySettingsChanged: () => unsubscribe,
  onHeartbeatEvent: () => unsubscribe,
  onActivityEvent: () => unsubscribe,
  onMentionEvent: () => unsubscribe,
  onTaskBoardEvent: () => unsubscribe,
  onTeamRunEvent: () => unsubscribe,
  onVoiceEvent: () => unsubscribe,
  onCanvasEvent: () => unsubscribe,
};

function fallbackMethod(name: string) {
  if (name.startsWith("on")) return () => unsubscribe;
  if (name.startsWith("list")) return () => Promise.resolve([]);
  if (name.startsWith("get")) return () => Promise.resolve(null);
  if (name.startsWith("is")) return () => Promise.resolve(false);
  if (name.startsWith("has")) return () => Promise.resolve(false);
  if (
    name.startsWith("save") ||
    name.startsWith("update") ||
    name.startsWith("set")
  ) {
    return () => Promise.resolve({ success: true });
  }
  return () => unsupported(name);
}

export function installBrowserElectronApi(): void {
  if (typeof window === "undefined" || window.electronAPI) return;

  window.electronAPI = new Proxy(browserApiBase, {
    get(target, property) {
      if (property in target) {
        return target[property as keyof typeof target];
      }
      if (typeof property === "string") {
        return fallbackMethod(property);
      }
      return undefined;
    },
  }) as unknown as ElectronAPI;
}
