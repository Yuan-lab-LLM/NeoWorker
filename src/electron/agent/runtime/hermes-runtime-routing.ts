import type {
  AgentConfig,
  ExternalRuntimeAgent,
  ExternalRuntimeConfig,
  PermissionMode,
  TaskRuntimePreference,
  TaskDomain,
} from "../../../shared/types";
import type { IntentRoute } from "../strategy/IntentRouter";
import type { DerivedTaskStrategy } from "../strategy/TaskStrategyService";

export type TaskRuntimeKind = "hermes" | "native" | "external";

export interface TaskRuntimeRouteDecision {
  preference: TaskRuntimePreference;
  resolved: TaskRuntimeKind;
  runtimeAgent?: ExternalRuntimeAgent;
  allowFallback: boolean;
  reason: string;
  signals: string[];
}

interface TaskRuntimeRoutingInput {
  title: string;
  prompt: string;
  route: IntentRoute;
  strategy: Pick<DerivedTaskStrategy, "executionMode" | "taskDomain">;
  agentConfig?: AgentConfig;
  /**
   * New tasks are created with the embedded Hermes Harness as their agent
   * loop. This flag is intentionally separate from the persisted preference
   * field so legacy tasks can keep their historical runtime unchanged.
   */
  forceHermesForNewTask?: boolean;
}

const COMPLEX_WORK_INTENTS = new Set<IntentRoute["intent"]>([
  "execution",
  "mixed",
  "workflow",
  "deep_work",
]);

const HERMES_DOMAINS = new Set<TaskDomain>(["code", "research", "operations"]);

const OFFICE_SIGNAL =
  /(?:\b(?:docx?|word|pdf|pptx?|powerpoint|presentation|slide\s+deck|xlsx?|excel|spreadsheet|workbook)\b|文档|报告|演示文稿|幻灯片|表格|台账|工作簿)/i;

const STRUCTURED_WEB_SIGNAL =
  /(?:\b(?:research|investigate|look\s+up|search|fetch|scrape|crawl|extract|compare|sources?|citations?|flight|flights|price|prices|schedule|schedules|weather|latest|current)\b|查询|搜索|检索|搜一下|查一下|航班|机票|价格|时刻|天气|最新|实时)/i;

const CODE_WORK_SIGNAL =
  /(?:\b(?:code|coding|repo|repository|codebase|test|tests|bug|debug|compile|build|lint|typescript|javascript|python|rust|java|node|stack trace|source code|script)\b|代码|源代码|仓库|项目|测试|报错|修复|调试|编译|脚本|接口)/i;

const MULTI_STEP_SIGNAL =
  /(?:\b(?:then|after\s+that|next|finally|first|second|third|step\s+\d|and\s+then)\b|然后|接着|下一步|最后|第一步|第二步|第三步|并且|同时)/i;

const MUTATION_SIGNAL =
  /(?:\b(?:create|build|make|edit|write|fix|deploy|run|install|execute|configure|implement|update|modify|delete|remove|test|verify|export|generate|draft|prepare|publish|commit|push|parse|process|transform|migrate|sync)\b|创建|制作|生成|导出|保存|写入|编辑|修改|修复|实现|运行|执行|发布|提交|推送|解析|处理|转换|迁移|同步)/i;

const SIMPLE_LOOKUP_SIGNAL =
  /^(?:\s*(?:what|when|where|who|which|is|are|can|could|would|请问|是什么|谁是|什么时候|哪里|能否|可以吗)[^?？]{0,90}[?？]?\s*)$/i;

function runtimeAgentOf(
  runtime: AgentConfig["externalRuntime"] | undefined,
): "codex" | "claude" | "hermes" | undefined {
  return runtime?.agent;
}

function normalizePreference(preference: TaskRuntimePreference | undefined): TaskRuntimePreference {
  return preference === "hermes" || preference === "native" ? preference : "auto";
}

function isComplexHermesCandidate(input: TaskRuntimeRoutingInput): {
  selected: boolean;
  signals: string[];
} {
  const text = `${String(input.title || "")}\n${String(input.prompt || "")}`.trim();
  const signals: string[] = [];
  const complexIntent = COMPLEX_WORK_INTENTS.has(input.route.intent);
  const officeCandidate = OFFICE_SIGNAL.test(text) && MUTATION_SIGNAL.test(text);
  const codeCandidate =
    CODE_WORK_SIGNAL.test(text) &&
    (MUTATION_SIGNAL.test(text) ||
      MULTI_STEP_SIGNAL.test(text) ||
      input.route.complexity !== "low");
  if (!complexIntent && !officeCandidate && !codeCandidate) {
    return { selected: false, signals };
  }

  if (input.route.intent === "workflow") signals.push("workflow");
  if (input.route.intent === "deep_work") signals.push("deep-work");
  if (input.route.complexity === "high") signals.push("high-complexity");
  if (input.route.complexity === "medium") signals.push("medium-complexity");
  if (HERMES_DOMAINS.has(input.strategy.taskDomain)) {
    signals.push(`domain:${input.strategy.taskDomain}`);
  }
  if (OFFICE_SIGNAL.test(text)) signals.push("office-artifact");
  if (codeCandidate) signals.push("code-work");
  if (STRUCTURED_WEB_SIGNAL.test(text)) signals.push("structured-web");
  if (MULTI_STEP_SIGNAL.test(text)) signals.push("multi-step");
  if (MUTATION_SIGNAL.test(text)) signals.push("mutation");

  const domainCandidate =
    HERMES_DOMAINS.has(input.strategy.taskDomain) &&
    (input.route.complexity !== "low" ||
      input.route.signals.includes("needs-tool-inspection") ||
      input.route.signals.includes("path-or-command"));
  const multiStepOfficeCandidate =
    OFFICE_SIGNAL.test(text) &&
    (MUTATION_SIGNAL.test(text) ||
      input.route.complexity !== "low" ||
      MULTI_STEP_SIGNAL.test(text));
  const webCandidate =
    STRUCTURED_WEB_SIGNAL.test(text) &&
    (input.route.signals.includes("needs-tool-inspection") ||
      input.route.complexity !== "low" ||
      input.strategy.taskDomain === "research");
  const workflowCandidate = input.route.intent === "workflow" || input.route.intent === "deep_work";
  const highComplexityCandidate =
    input.route.complexity === "high" &&
    input.strategy.executionMode !== "chat" &&
    input.strategy.executionMode !== "plan" &&
    input.strategy.executionMode !== "analyze";

  // A single, plain question remains native even if a broad keyword happens
  // to match. The exception is a structured lookup such as a flight search.
  const isPlainLookup =
    SIMPLE_LOOKUP_SIGNAL.test(text) &&
    !OFFICE_SIGNAL.test(text) &&
    !STRUCTURED_WEB_SIGNAL.test(text);

  return {
    selected:
      !isPlainLookup &&
      (workflowCandidate ||
        highComplexityCandidate ||
        domainCandidate ||
        codeCandidate ||
        officeCandidate ||
        multiStepOfficeCandidate ||
        webCandidate),
    signals,
  };
}

export function resolveTaskRuntimeRoute(input: TaskRuntimeRoutingInput): TaskRuntimeRouteDecision {
  const preference = normalizePreference(input.agentConfig?.runtimePreference);
  const existingRuntime = input.agentConfig?.externalRuntime;
  const explicitPreference = input.agentConfig?.runtimePreference;

  // An explicitly delegated ACP runtime belongs to the caller that created
  // the task (for example Claude Code). Never replace it while normalizing a
  // newly-created task.
  if (input.forceHermesForNewTask && existingRuntime) {
    return {
      preference,
      resolved: "external",
      runtimeAgent: runtimeAgentOf(existingRuntime),
      allowFallback: existingRuntime.agent === "codex",
      reason: "existing_external_runtime",
      signals: ["existing-external-runtime"],
    };
  }

  // New NeoWorker tasks always use the embedded Hermes ACP Harness. The
  // persisted runtimePreference remains only as a compatibility field for
  // older tasks and integrations; it is not a user-selectable route anymore.
  if (input.forceHermesForNewTask) {
    return {
      preference: "hermes",
      resolved: "hermes",
      runtimeAgent: "hermes",
      allowFallback: false,
      reason: "new_task_hermes_default",
      signals: ["new-task-default"],
    };
  }

  if (preference === "hermes") {
    return {
      preference,
      resolved: "hermes",
      runtimeAgent: "hermes",
      allowFallback: false,
      reason: "user_forced_hermes",
      signals: ["user-selection"],
    };
  }

  if (preference === "native") {
    return {
      preference,
      resolved: "native",
      allowFallback: false,
      reason: "user_forced_native",
      signals: ["user-selection"],
    };
  }

  // Existing ACP configs are already an explicit runtime decision (for
  // example an explicitly spawned Claude task). Preserve them unless the
  // user explicitly chooses Hermes or Native in the task composer.
  if (existingRuntime && explicitPreference !== "hermes" && explicitPreference !== "native") {
    return {
      preference,
      resolved: "external",
      runtimeAgent: runtimeAgentOf(existingRuntime),
      allowFallback: existingRuntime.agent === "codex",
      reason: "existing_external_runtime",
      signals: ["existing-external-runtime"],
    };
  }

  const candidate = isComplexHermesCandidate(input);
  if (candidate.selected) {
    return {
      preference,
      resolved: "hermes",
      runtimeAgent: "hermes",
      allowFallback: true,
      reason: "auto_complex_task",
      signals: candidate.signals,
    };
  }

  return {
    preference,
    resolved: "native",
    allowFallback: false,
    reason: "auto_native_simple_task",
    signals: candidate.signals,
  };
}

export function buildHermesExternalRuntimeConfig(
  permissionMode: PermissionMode | undefined,
): ExternalRuntimeConfig {
  const runtimePermission =
    permissionMode === "bypass_permissions" || permissionMode === "dont_ask"
      ? "approve-all"
      : permissionMode === "plan"
        ? "deny-all"
        : "approve-reads";
  return {
    kind: "acpx",
    agent: "hermes",
    sessionMode: "persistent",
    outputMode: "json",
    permissionMode: runtimePermission,
  };
}

/** Keep delegated work on the parent's transport; never copy an ACP session id. */
export function inheritChildRuntimeConfig(parent?: AgentConfig, child?: AgentConfig): AgentConfig {
  const next: AgentConfig = {
    ...(parent?.providerType ? { providerType: parent.providerType } : {}),
    ...(parent?.modelKey && (!child?.providerType || child.providerType === parent?.providerType)
      ? { modelKey: parent.modelKey }
      : {}),
    ...child,
  };
  if (!child?.externalRuntime && !child?.runtimePreference) {
    next.runtimePreference =
      parent?.externalRuntime?.agent === "hermes"
        ? "hermes"
        : parent?.runtimePreference === "native"
          ? "native"
          : "hermes";
    if (next.runtimePreference === "hermes") {
      next.externalRuntime = buildHermesExternalRuntimeConfig(
        next.permissionMode ?? parent?.permissionMode,
      );
    }
  }
  return next;
}
