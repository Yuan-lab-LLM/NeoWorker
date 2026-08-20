import type { LLMMessage } from "./llm";
import {
  buildReasoningExhaustedGuidance,
  classifyOutputTruncation,
  inferOutputBudgetRequestKind,
  inferOutputWorkloadProfile,
  isAdaptiveOutputTokenPolicyEnabled,
  responseHasToolUse,
  resolveOutputTokenBudget,
  type OutputTruncationClassification,
  type OutputWorkloadProfile,
} from "./llm/output-token-policy";

export interface QualityPassDraftResult {
  text: string;
  accepted: boolean;
}

export interface AdaptiveOutputBudgetState {
  mode: "legacy" | "adaptive";
  requestKind: "agentic_main" | "tool_followup" | "continuation";
  workloadProfile: OutputWorkloadProfile;
  providerFamily: string;
  routedFamily: string | null;
  initialBudget: number;
  finalBudget: number;
  capSource: "task" | "env" | "policy";
  escalationAttempted: boolean;
  truncationClassification: OutputTruncationClassification | null;
  continuationAllowed: boolean;
  continuationBudget?: number;
  guidanceMessage?: string;
}

/**
 * Large files are much more reliable when the model plans a small structure,
 * writes bounded chunks, and verifies the final artifact. Keeping this in the
 * system prompt also prevents a larger output allowance from becoming one
 * enormous and frequently malformed JSON tool argument.
 */
export function buildLargeArtifactGenerationGuidance(): string {
  return [
    "LARGE ARTIFACT DELIVERY PROTOCOL:",
    "1. Create a small valid skeleton or outline before adding the full content.",
    "2. Write or edit the artifact in bounded sections. Keep each text-bearing tool argument below 6000 characters; never place an entire long document inside one JSON argument.",
    "3. For PPTX, DOCX, and XLSX, use the available dedicated Office artifact tool and its complete generation workflow. Never serialize a binary Office file into chat or pretend an HTML file is a PPTX.",
    "4. For HTML, all essential text and controls must be visible without JavaScript. Animations are progressive enhancement only: never hide report content by default with opacity: 0, visibility: hidden, or display: none.",
    "5. After every section, inspect the tool result. Before claiming completion, verify that the requested file exists, has the requested extension, can be opened or rendered, and visibly contains the expected body content.",
    "6. If this turn is cut off, continue from the last completed section without repeating earlier sections.",
  ].join("\n");
}

export function isMalformedToolArgumentsError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as {
    code?: unknown;
    name?: unknown;
    message?: unknown;
  };
  return (
    candidate.code === "MALFORMED_TOOL_ARGUMENTS" ||
    candidate.name === "MalformedToolArgumentsError" ||
    /malformed tool arguments/i.test(String(candidate.message || ""))
  );
}

/**
 * A transport retry sends the exact same prompt again and commonly reproduces
 * malformed tool JSON. This guidance changes the strategy for the next model
 * turn and, for HTML conversion, routes large content through a deterministic
 * converter instead of putting the whole document inside a JSON string.
 */
export function buildMalformedToolArgumentsRecoveryGuidance(
  request: string,
): string {
  const requestsHtml = /(?:\.html?\b|\bhtml\b|网页|页面)/i.test(request);
  const htmlGuidance = requestsHtml
    ? " If existing Markdown files contain the source content, call convert_markdown_to_html with only sourcePaths, filename, and optional title. Do not copy the Markdown or the full HTML into tool arguments. If you must author HTML manually, create a small valid skeleton first and use edit_file in chunks of at most 6000 characters."
    : " For a large text artifact, create a small valid skeleton first and use targeted edits in chunks of at most 6000 characters.";

  return (
    "RECOVERY REQUIRED: the previous tool call was rejected because its arguments were not valid JSON. " +
    "Change strategy instead of repeating that call. Return exactly one valid tool call; escape quotes, backslashes, and newlines in every JSON string." +
    htmlGuidance +
    " Verify the tool result and the requested output file before claiming completion."
  );
}

export async function requestLLMResponseWithAdaptiveBudget(opts: {
  messages: LLMMessage[];
  /** Stable task/follow-up text used when compacted messages omit the artifact request. */
  workloadProfileText?: string;
  retryLabel: string;
  operation: string;
  forceNoTools?: boolean;
  llmTimeoutMs: number;
  providerType: string;
  modelId: string;
  systemPrompt: string;
  getTaskMaxTokens: () => number | null;
  getContextManager: () => Any;
  getAvailableTools: () => Any[];
  applyRetryTokenCap: (
    baseMaxTokens: number,
    attempt: number,
    timeoutMs: number,
    hasTools?: boolean,
  ) => number;
  getRetryTimeoutMs: (
    baseTimeoutMs: number,
    attempt: number,
    hasTools?: boolean,
    maxTokensBudget?: number,
  ) => number;
  callLLMWithRetry: (
    requestFn: (attempt: number) => Promise<Any>,
    operation: string,
  ) => Promise<Any>;
  createMessageWithTimeout: (
    request: {
      model: string;
      maxTokens: number;
      system: string;
      tools: Any[];
      messages: LLMMessage[];
      systemBlocks?: Any[];
      promptCache?: Any;
    },
    timeoutMs: number,
    operation: string,
  ) => Promise<Any>;
  buildPromptCacheRequestExtras?: (args: {
    systemPrompt: string;
    tools: Any[];
  }) => {
    systemBlocks?: Any[];
    promptCache?: Any;
  };
  updateTracking: (
    inputTokens: number,
    outputTokens: number,
    cachedTokens?: number,
    cacheWriteTokens?: number,
  ) => void;
  emitEvent?: (type: string, payload: Record<string, unknown>) => void;
  log: (message: string) => void;
}): Promise<{
  response: Any;
  availableTools: Any[];
  outputBudget: AdaptiveOutputBudgetState;
}> {
  const availableTools = opts.forceNoTools ? [] : opts.getAvailableTools();
  const requestKind = inferOutputBudgetRequestKind(opts.messages);
  const workloadProfile = inferOutputWorkloadProfile(
    opts.workloadProfileText
      ? [
          ...opts.messages,
          { role: "user" as const, content: opts.workloadProfileText },
        ]
      : opts.messages,
  );
  const effectiveSystemPrompt =
    workloadProfile === "large_artifact"
      ? `${opts.systemPrompt}\n\n${buildLargeArtifactGenerationGuidance()}`
      : opts.systemPrompt;
  const promptCacheExtras = opts.buildPromptCacheRequestExtras
    ? opts.buildPromptCacheRequestExtras({
        systemPrompt: effectiveSystemPrompt,
        tools: availableTools,
      })
    : {};
  const initialBudget = resolveOutputTokenBudget({
    providerType: opts.providerType,
    modelId: opts.modelId,
    messages: opts.messages,
    system: effectiveSystemPrompt,
    contextManager: opts.getContextManager(),
    taskMaxTokens: opts.getTaskMaxTokens(),
    requestKind,
    workloadProfile,
    phase: "initial",
  });
  const adaptiveMode = isAdaptiveOutputTokenPolicyEnabled();
  const hasTools = availableTools.length > 0;
  const applyTokenCap = (
    budget: number,
    attempt: number,
    timeoutMs: number,
    requestHasTools = hasTools,
  ): number =>
    adaptiveMode
      ? budget
      : opts.applyRetryTokenCap(budget, attempt, timeoutMs, requestHasTools);

  const recordUsage = (response: Any) => {
    if (!response?.usage) return;
    opts.updateTracking(
      response.usage.inputTokens,
      response.usage.outputTokens,
      response.usage.cachedTokens,
      response.usage.cacheWriteTokens,
    );
  };

  const issueRequest = async (
    budget: number,
    labelSuffix: string,
  ): Promise<{
    response: Any;
    effectiveMaxTokens: number;
    requestTimeoutMs: number;
  }> => {
    const retryLabel = labelSuffix
      ? `${opts.retryLabel} ${labelSuffix}`
      : opts.retryLabel;
    const response = await opts.callLLMWithRetry((attempt) => {
      const effectiveMaxTokens = applyTokenCap(
        budget,
        attempt,
        opts.llmTimeoutMs,
        hasTools,
      );
      const requestTimeoutMs = opts.getRetryTimeoutMs(
        opts.llmTimeoutMs,
        attempt,
        hasTools,
        effectiveMaxTokens,
      );
      return opts.createMessageWithTimeout(
        {
          model: opts.modelId,
          maxTokens: effectiveMaxTokens,
          system: effectiveSystemPrompt,
          tools: availableTools,
          messages: opts.messages,
          ...promptCacheExtras,
        },
        requestTimeoutMs,
        labelSuffix ? `${opts.operation} ${labelSuffix}` : opts.operation,
      );
    }, retryLabel);

    const effectiveMaxTokens = applyTokenCap(
      budget,
      0,
      opts.llmTimeoutMs,
      hasTools,
    );
    const requestTimeoutMs = opts.getRetryTimeoutMs(
      opts.llmTimeoutMs,
      0,
      hasTools,
      effectiveMaxTokens,
    );
    return { response, effectiveMaxTokens, requestTimeoutMs };
  };

  const llmCallStart = Date.now();
  const effectiveMaxTokensLog = applyTokenCap(
    initialBudget.transport.value,
    0,
    opts.llmTimeoutMs,
    hasTools,
  );
  const effectiveTimeoutLog = opts.getRetryTimeoutMs(
    opts.llmTimeoutMs,
    0,
    hasTools,
    effectiveMaxTokensLog,
  );
  opts.log(
    `  │ LLM call start | family=${initialBudget.providerFamily}` +
      `${initialBudget.routedFamily ? `/${initialBudget.routedFamily}` : ""} | ` +
      `kind=${requestKind} | budget=${initialBudget.transport.value} | ` +
      `workload=${workloadProfile} | ` +
      `tokenParam=${initialBudget.transport.paramName} | ` +
      `effectiveMaxTokens=${effectiveMaxTokensLog} | capSource=${initialBudget.capSource} | ` +
      `timeout=${(effectiveTimeoutLog / 1000).toFixed(0)}s | tools=${availableTools.length} | msgCount=${opts.messages.length}`,
  );
  opts.emitEvent?.("llm_output_budget", {
    family: initialBudget.providerFamily,
    routedFamily: initialBudget.routedFamily,
    requestKind,
    workloadProfile,
    chosenBudget: initialBudget.transport.value,
    effectiveMaxTokens: effectiveMaxTokensLog,
    capSource: initialBudget.capSource,
    contextLimit: initialBudget.contextLimit,
    knownHardCap: initialBudget.knownHardCap,
  });

  const firstAttempt = await issueRequest(initialBudget.transport.value, "");
  recordUsage(firstAttempt.response);

  let response = firstAttempt.response;
  let finalBudget = initialBudget.transport.value;
  let escalationAttempted = false;
  let truncationClassification: OutputTruncationClassification | null = null;
  let continuationAllowed = true;
  let continuationBudget: number | undefined;
  let guidanceMessage: string | undefined;

  if (adaptiveMode && response?.stopReason === "max_tokens") {
    truncationClassification = classifyOutputTruncation(response.content);
    const escalatedBudget = resolveOutputTokenBudget({
      providerType: opts.providerType,
      modelId: opts.modelId,
      messages: opts.messages,
      system: effectiveSystemPrompt,
      contextManager: opts.getContextManager(),
      taskMaxTokens: opts.getTaskMaxTokens(),
      requestKind,
      workloadProfile,
      phase: "escalated",
    });

    const hasVisiblePartialOutput =
      truncationClassification === "visible_partial_output";
    const firstResponseHasToolUse = responseHasToolUse(response.content);

    // Preserve visible output and let the executor append an explicit
    // continuation turn. Replaying the same prompt here discards useful work,
    // repeats earlier content, and can reproduce the exact same truncation.
    if (hasVisiblePartialOutput) {
      const continuationTokenBudget = resolveOutputTokenBudget({
        providerType: opts.providerType,
        modelId: opts.modelId,
        messages: opts.messages,
        system: effectiveSystemPrompt,
        contextManager: opts.getContextManager(),
        taskMaxTokens: opts.getTaskMaxTokens(),
        requestKind: "continuation",
        workloadProfile,
        phase: "initial",
      });
      continuationAllowed = !firstResponseHasToolUse;
      continuationBudget = continuationTokenBudget.transport.value;
      opts.log(
        `  │ Adaptive output continuation | currentBudget=${initialBudget.transport.value} | nextBudget=${continuationBudget} | continuation=${continuationAllowed ? "allowed" : "skipped"}`,
      );
      opts.emitEvent?.("llm_output_budget_continuation", {
        family: initialBudget.providerFamily,
        routedFamily: initialBudget.routedFamily,
        requestKind,
        workloadProfile,
        currentBudget: initialBudget.transport.value,
        nextBudget: continuationBudget,
        strategy: "continue_from_cutoff",
        message: continuationAllowed
          ? "已达到 NeoWorker 本轮输出预算，正在保留已有内容并从中断位置继续。"
          : "已达到 NeoWorker 本轮输出预算，但工具调用内容不完整，无法安全续写。",
      });
    } else if (
      escalatedBudget.transport.value > initialBudget.transport.value
    ) {
      // A reasoning-only response has no visible content to preserve. In this
      // one case, retrying once with a larger allowance is useful.
      escalationAttempted = true;
      opts.log(
        `  │ Adaptive output escalation | from=${initialBudget.transport.value} to=${escalatedBudget.transport.value} | classification=${truncationClassification}`,
      );
      opts.emitEvent?.("llm_output_budget_escalation", {
        family: initialBudget.providerFamily,
        routedFamily: initialBudget.routedFamily,
        requestKind,
        workloadProfile,
        fromBudget: initialBudget.transport.value,
        toBudget: escalatedBudget.transport.value,
        classification: truncationClassification,
      });
      const secondAttempt = await issueRequest(
        escalatedBudget.transport.value,
        "[adaptive-escalation]",
      );
      recordUsage(secondAttempt.response);
      response = secondAttempt.response;
      finalBudget = escalatedBudget.transport.value;
      if (response?.stopReason === "max_tokens") {
        truncationClassification = classifyOutputTruncation(response.content);
        const hasToolUse = responseHasToolUse(response.content);
        continuationAllowed =
          truncationClassification === "visible_partial_output" && !hasToolUse;
        if (continuationAllowed) {
          continuationBudget = escalatedBudget.transport.value;
        }
        if (
          !continuationAllowed &&
          truncationClassification === "reasoning_exhausted"
        ) {
          guidanceMessage = buildReasoningExhaustedGuidance();
        }
        opts.log(
          `  │ Adaptive output escalation incomplete | finalBudget=${finalBudget} | classification=${truncationClassification} | continuation=${continuationAllowed ? "allowed" : "skipped"}`,
        );
      }
    } else if (truncationClassification === "reasoning_exhausted") {
      continuationAllowed = false;
      guidanceMessage = buildReasoningExhaustedGuidance();
      opts.log(
        `  │ Adaptive output escalation unavailable | budget=${initialBudget.transport.value} | classification=${truncationClassification} | continuation=skipped`,
      );
    }
  }

  const llmCallDuration = ((Date.now() - llmCallStart) / 1000).toFixed(1);
  const toolUseBlocks = (response.content || []).filter(
    (c: Any) => c.type === "tool_use",
  );
  const textBlocksLog = (response.content || []).filter(
    (c: Any) => c.type === "text",
  );
  const textLen = textBlocksLog.reduce(
    (sum: number, block: Any) => sum + (block.text?.length || 0),
    0,
  );
  opts.log(
    `  │ LLM call done | duration=${llmCallDuration}s | stopReason=${response.stopReason} | ` +
      `toolUseBlocks=${toolUseBlocks.length} | textLen=${textLen} | ` +
      `inputTokens=${response.usage?.inputTokens ?? "?"} | outputTokens=${response.usage?.outputTokens ?? "?"} | cachedTokens=${response.usage?.cachedTokens ?? 0}`,
  );

  return {
    response,
    availableTools,
    outputBudget: {
      mode: initialBudget.mode,
      requestKind,
      workloadProfile,
      providerFamily: initialBudget.providerFamily,
      routedFamily: initialBudget.routedFamily,
      initialBudget: initialBudget.transport.value,
      finalBudget,
      capSource: initialBudget.capSource,
      escalationAttempted,
      truncationClassification,
      continuationAllowed,
      ...(continuationBudget ? { continuationBudget } : {}),
      ...(guidanceMessage ? { guidanceMessage } : {}),
    },
  };
}

export async function maybeApplyQualityPasses(opts: {
  response: Any;
  enabled: boolean;
  contextLabel: string;
  userIntent: string;
  getQualityPassCount: () => number;
  extractTextFromLLMContent: (content: Any) => string;
  applyQualityPassesToDraft: (args: {
    passes: 2 | 3;
    contextLabel: string;
    userIntent: string;
    draft: string;
  }) => Promise<QualityPassDraftResult>;
}): Promise<Any> {
  if (!opts.enabled) return opts.response;

  const qualityPasses = opts.getQualityPassCount();
  if (qualityPasses <= 1 || opts.response.stopReason !== "end_turn") {
    return opts.response;
  }

  const hasToolUse = (opts.response.content || []).some(
    (c: Any) => c && c.type === "tool_use",
  );
  if (hasToolUse) return opts.response;

  const draftText = opts
    .extractTextFromLLMContent(opts.response.content)
    .trim();
  if (!draftText) return opts.response;

  const passes: 2 | 3 = qualityPasses === 2 ? 2 : 3;
  const improved = await opts.applyQualityPassesToDraft({
    passes,
    contextLabel: opts.contextLabel,
    userIntent: opts.userIntent,
    draft: draftText,
  });
  if (!improved.accepted) {
    return opts.response;
  }
  const improvedTrimmed = String(improved.text || "").trim();
  if (!improvedTrimmed || improvedTrimmed === draftText) {
    return opts.response;
  }

  return {
    ...opts.response,
    content: [{ type: "text", text: improvedTrimmed }],
    stopReason: "end_turn",
  };
}
