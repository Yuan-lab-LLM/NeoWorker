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

/**
 * Reasoning-capable models can spend an entire large-artifact allowance on
 * private thinking without ever emitting the mutation tool call that the task
 * needs. Replaying the same prompt with twice the allowance only makes that
 * failure slower. The bounded recovery turn below changes the objective from
 * planning to one concrete action and keeps large payloads chunked.
 */
export function buildReasoningExhaustedActionRecoveryGuidance(
  workloadProfileText = "",
): string {
  const requestsArtifact =
    /(?:\.html?\b|\bhtml\b|\.docx?\b|\.xlsx?\b|\.pptx?\b|网页|页面|文档|表格|演示文稿)/i.test(
      workloadProfileText,
    );
  return [
    "ACTION-ONLY RECOVERY TURN:",
    "The previous response spent its full output budget on private reasoning without producing a usable answer or tool call.",
    "Do not restart the analysis and do not narrate a plan. Your next response must contain exactly one concrete, usable tool call before any prose.",
    requestsArtifact
      ? "Continue the existing target artifact. Prefer one bounded edit_file/write_file or the dedicated artifact tool; keep every text-bearing argument below 6000 characters and replace any remaining staging placeholder."
      : "Call the single necessary available tool now with complete, valid arguments.",
    "After the tool result, inspect only what is necessary and continue in bounded actions until the request is complete.",
  ].join("\n");
}

export function buildReasoningExhaustedActionRecoveryMessages(
  messages: LLMMessage[],
  workloadProfileText = "",
): LLMMessage[] {
  const recoveryInstruction =
    buildReasoningExhaustedActionRecoveryGuidance(workloadProfileText);
  const cloned = messages.map((message) => ({
    ...message,
    content: Array.isArray(message.content)
      ? message.content.map((item: Any) => ({ ...item }))
      : message.content,
  }));
  const lastMessage = cloned[cloned.length - 1];

  // Most agentic requests end with a user message. Extend that message rather
  // than emitting two adjacent user roles, which stricter gateways reject.
  if (lastMessage?.role === "user") {
    if (typeof lastMessage.content === "string") {
      lastMessage.content = `${lastMessage.content}\n\n${recoveryInstruction}`;
    } else if (Array.isArray(lastMessage.content)) {
      lastMessage.content.push({ type: "text", text: recoveryInstruction });
    }
    return cloned;
  }

  cloned.push({
    role: "user",
    content: [{ type: "text", text: recoveryInstruction }],
  });
  return cloned;
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
    requestMessages: LLMMessage[] = opts.messages,
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
          messages: requestMessages,
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
    } else if (truncationClassification === "reasoning_exhausted" && hasTools) {
      // Do not replay an action-capable request unchanged with an even larger
      // reasoning allowance. Force one bounded action turn instead. Eight
      // thousand tokens is ample for the <=6000-character write chunks in the
      // artifact protocol and leaves time inside the enclosing step deadline
      // for the actual tool execution and verification.
      const actionRecoveryBudget = Math.min(
        8_000,
        escalatedBudget.transport.value,
      );
      const actionRecoveryMessages =
        buildReasoningExhaustedActionRecoveryMessages(
          opts.messages,
          opts.workloadProfileText || "",
        );
      escalationAttempted = true;
      opts.log(
        `  │ Adaptive action recovery | from=${initialBudget.transport.value} to=${actionRecoveryBudget} | classification=${truncationClassification}`,
      );
      opts.emitEvent?.("llm_output_budget_escalation", {
        family: initialBudget.providerFamily,
        routedFamily: initialBudget.routedFamily,
        requestKind,
        workloadProfile,
        fromBudget: initialBudget.transport.value,
        toBudget: actionRecoveryBudget,
        classification: truncationClassification,
        strategy: "action_only_tool_recovery",
      });
      const secondAttempt = await issueRequest(
        actionRecoveryBudget,
        "[action-recovery]",
        actionRecoveryMessages,
      );
      recordUsage(secondAttempt.response);
      response = secondAttempt.response;
      finalBudget = actionRecoveryBudget;
      if (response?.stopReason === "max_tokens") {
        truncationClassification = classifyOutputTruncation(response.content);
        const hasToolUse = responseHasToolUse(response.content);
        continuationAllowed =
          !hasToolUse &&
          (truncationClassification === "visible_partial_output" ||
            truncationClassification === "reasoning_exhausted");
        if (continuationAllowed) {
          continuationBudget = actionRecoveryBudget;
        }
        if (
          !continuationAllowed &&
          truncationClassification === "reasoning_exhausted"
        ) {
          guidanceMessage = buildReasoningExhaustedGuidance();
        }
        opts.log(
          `  │ Adaptive action recovery incomplete | finalBudget=${finalBudget} | classification=${truncationClassification} | continuation=${continuationAllowed ? "allowed" : "skipped"}`,
        );
      }
    } else if (truncationClassification === "reasoning_exhausted") {
      // A task/provider cap may prevent raising max_tokens. Preserve one
      // bounded recovery turn instead of treating a zero-output attempt as a
      // terminal task failure.
      continuationAllowed = !firstResponseHasToolUse;
      if (continuationAllowed) {
        continuationBudget = initialBudget.transport.value;
      } else {
        guidanceMessage = buildReasoningExhaustedGuidance();
      }
      opts.log(
        `  │ Adaptive output escalation unavailable | budget=${initialBudget.transport.value} | classification=${truncationClassification} | continuation=${continuationAllowed ? "allowed" : "skipped"}`,
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
