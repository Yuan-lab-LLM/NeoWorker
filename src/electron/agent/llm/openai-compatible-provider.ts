import { LLMProvider, LLMProviderType, LLMRequest, LLMResponse } from "./types";
import { getProviderImageCaps } from "./image-utils";
import {
  toOpenAICompatibleMessages,
  toOpenAICompatibleTools,
  fromOpenAICompatibleResponse,
  type OpenAICompatibleToolOptions,
} from "./openai-compatible";
import { buildOpenAIPromptCacheFields } from "./prompt-cache";

const OPENCODE_GO_KIMI_MAX_COMPLETION_TOKENS = 32_768;

const RETRYABLE_HTTP_STATUSES = new Set([
  408, 409, 425, 429, 500, 502, 503, 504, 507, 522, 523, 524,
]);

const RETRYABLE_TRANSPORT_CODES = new Set([
  "ECONNRESET",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ECONNREFUSED",
  "EPIPE",
  "ECONNABORTED",
  "ERR_STREAM_PREMATURE_CLOSE",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_SOCKET",
]);

export class OpenAICompatibleProviderError extends Error {
  readonly status?: number;
  readonly code?: string;
  readonly retryable: boolean;
  readonly retryKind?: "malformed_response";
  readonly providerName: string;
  override readonly cause?: unknown;

  constructor(
    message: string,
    options: {
      providerName: string;
      status?: number;
      code?: string;
      retryable: boolean;
      retryKind?: "malformed_response";
      cause?: unknown;
    },
  ) {
    super(message);
    this.name = "OpenAICompatibleProviderError";
    this.providerName = options.providerName;
    this.status = options.status;
    this.code = options.code;
    this.retryable = options.retryable;
    this.retryKind = options.retryKind;
    this.cause = options.cause;
  }
}

function getTransportErrorCode(error: Any): string | undefined {
  // Node's fetch/undici often nests the actionable transport code more than
  // one level deep (TypeError -> cause -> cause). Preserve it so retry policy
  // can distinguish a headers timeout from a generic network blip.
  let current = error;
  for (let depth = 0; current && depth < 5; depth += 1) {
    const code = current?.code;
    if (typeof code === "string" && code.trim()) {
      return code.trim().toUpperCase();
    }
    current = current?.cause;
  }
  return undefined;
}

function isRetryableTransportError(error: Any): boolean {
  const code = getTransportErrorCode(error);
  if (code && RETRYABLE_TRANSPORT_CODES.has(code)) return true;
  const message = String(error?.message || "").toLowerCase();
  return (
    message.includes("fetch failed") ||
    message.includes("network") ||
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("socket hang up") ||
    message.includes("connection reset") ||
    message.includes("stream disconnected") ||
    message.includes("unexpected eof") ||
    message.includes("terminated")
  );
}

function joinUrl(baseUrl: string, path: string): string {
  const trimmedBase = baseUrl.replace(/\/+$/, "");
  const trimmedPath = path.startsWith("/") ? path : `/${path}`;
  return `${trimmedBase}${trimmedPath}`;
}

function normalizeBaseUrl(baseUrl: string): string {
  const trimmedBase = baseUrl.trim().replace(/\/+$/, "");
  const lowerBase = trimmedBase.toLowerCase();
  if (lowerBase.endsWith("/chat/completions")) {
    return trimmedBase.slice(0, -"/chat/completions".length);
  }
  if (lowerBase.endsWith("/models")) {
    return trimmedBase.slice(0, -"/models".length);
  }
  return trimmedBase;
}

function resolveChatCompletionsUrl(baseUrl: string): string {
  const trimmedBase = baseUrl.trim().replace(/\/+$/, "");
  if (trimmedBase.toLowerCase().endsWith("/chat/completions")) {
    return trimmedBase;
  }
  return joinUrl(trimmedBase, "/chat/completions");
}

function resolveModelsUrl(baseUrl: string): string {
  return joinUrl(normalizeBaseUrl(baseUrl), "/models");
}

export interface OpenAICompatibleProviderOptions {
  type: LLMProviderType;
  providerName: string;
  apiKey: string;
  baseUrl: string;
  defaultModel: string;
  /** Undefined uses provider/model capability inference. */
  supportsImages?: boolean;
  extraHeaders?: Record<string, string>;
}

export class OpenAICompatibleProvider implements LLMProvider {
  readonly type: LLMProviderType;
  private apiKey: string;
  private chatCompletionsUrl: string;
  private modelsUrl: string;
  private normalizedBaseUrl: string;
  private defaultModel: string;
  private providerName: string;
  private supportsImagesOverride?: boolean;
  private extraHeaders?: Record<string, string>;

  constructor(options: OpenAICompatibleProviderOptions) {
    this.type = options.type;
    this.apiKey = options.apiKey;
    this.normalizedBaseUrl = normalizeBaseUrl(options.baseUrl);
    this.chatCompletionsUrl = resolveChatCompletionsUrl(options.baseUrl);
    this.modelsUrl = resolveModelsUrl(options.baseUrl);
    this.defaultModel = options.defaultModel;
    this.providerName = options.providerName;
    this.supportsImagesOverride = options.supportsImages;
    this.extraHeaders = options.extraHeaders;
  }

  private normalizeModelForEndpoint(model: string): string {
    const trimmed = model.trim();
    const lowerBase = this.normalizedBaseUrl.toLowerCase();
    if (
      lowerBase.includes("opencode.ai/zen/go/") &&
      trimmed.startsWith("opencode-go/")
    ) {
      return trimmed.slice("opencode-go/".length);
    }
    if (
      lowerBase.includes("opencode.ai/zen/") &&
      trimmed.startsWith("opencode/")
    ) {
      return trimmed.slice("opencode/".length);
    }
    return trimmed;
  }

  private isKimiK2Model(model: string): boolean {
    const normalized = model.toLowerCase().trim();
    const bareModel = normalized.includes("/")
      ? normalized.slice(normalized.lastIndexOf("/") + 1)
      : normalized;
    const withoutVariant = bareModel.includes(":")
      ? bareModel.slice(0, bareModel.indexOf(":"))
      : bareModel;
    return (
      withoutVariant === "kimi-k2.6" ||
      withoutVariant === "kimi-k2.5" ||
      withoutVariant === "kimi-k2" ||
      withoutVariant === "kimi-k2-thinking" ||
      withoutVariant.startsWith("kimi-k2.")
    );
  }

  private getProviderFamily(
    model: string,
  ): "kimi" | "minimax" | "glm" | "qwen" | "deepseek" | "generic" {
    const signal = `${this.type || ""} ${this.providerName || ""} ${this.normalizedBaseUrl || ""} ${model || ""}`.toLowerCase();
    if (signal.includes("moonshot") || signal.includes("kimi")) return "kimi";
    if (signal.includes("minimax") || signal.includes("minimaxi")) {
      return "minimax";
    }
    if (
      signal.includes("bigmodel") ||
      signal.includes("z.ai") ||
      signal.includes("z-ai") ||
      /\bglm[-_/]/.test(signal)
    ) {
      return "glm";
    }
    if (signal.includes("dashscope") || signal.includes("qwen")) return "qwen";
    if (signal.includes("deepseek")) return "deepseek";
    return "generic";
  }

  private supportsKimiThinkingDisable(model: string): boolean {
    const normalized = model.toLowerCase().trim();
    const bareModel = normalized.includes("/")
      ? normalized.slice(normalized.lastIndexOf("/") + 1)
      : normalized;
    return /^kimi-k2\.(5|6)(?:$|[-_:])/.test(bareModel);
  }

  private isOpenCodeGoEndpoint(): boolean {
    return this.normalizedBaseUrl.toLowerCase().includes("opencode.ai/zen/go/");
  }

  private getOutputTokenField(
    model: string,
  ): "max_tokens" | "max_completion_tokens" {
    return this.isKimiK2Model(model) || this.getProviderFamily(model) === "minimax"
      ? "max_completion_tokens"
      : "max_tokens";
  }

  private getMaxOutputTokens(
    model: string,
    requestedMaxTokens: number,
  ): number {
    if (
      this.isOpenCodeGoEndpoint() &&
      this.isKimiK2Model(model) &&
      Number.isFinite(requestedMaxTokens) &&
      requestedMaxTokens > 0
    ) {
      return Math.min(
        Math.floor(requestedMaxTokens),
        OPENCODE_GO_KIMI_MAX_COMPLETION_TOKENS,
      );
    }

    return requestedMaxTokens;
  }

  private getToolOptions(
    model: string,
  ): OpenAICompatibleToolOptions | undefined {
    if (!this.isKimiK2Model(model)) return undefined;
    return { functionStrict: false };
  }

  private getToolRequestExtras(
    model: string,
    tools?: Any[],
  ): Record<string, Any> {
    if (!tools?.length) return {};

    const family = this.getProviderFamily(model);
    // Kimi K2.5/K2.6 permit thinking to be disabled for tool-bearing turns.
    // Newer always-thinking models reject this field, so preserve and replay
    // their reasoning state instead of sending an invalid compatibility flag.
    if (family === "kimi" && this.supportsKimiThinkingDisable(model)) {
      return { thinking: { type: "disabled" } };
    }
    if (family === "qwen") {
      return { enable_thinking: false };
    }
    if (family === "minimax") {
      return { reasoning_split: false };
    }
    return {};
  }

  private getErrorMessage(errorData: Any): string | undefined {
    if (!errorData || typeof errorData !== "object") return undefined;
    if (typeof errorData.error === "string") return errorData.error;
    if (typeof errorData.error?.message === "string")
      return errorData.error.message;
    if (typeof errorData.message === "string") return errorData.message;
    return undefined;
  }

  async createMessage(request: LLMRequest): Promise<LLMResponse> {
    const model = this.normalizeModelForEndpoint(
      request.model || this.defaultModel,
    );
    const supportsImages = getProviderImageCaps(
      this.type,
      model,
      this.supportsImagesOverride,
    ).supportsImages;
    const messages = toOpenAICompatibleMessages(
      request.messages,
      request.system,
      {
        supportsImages,
        systemBlocks: request.systemBlocks,
      },
    );

    try {
      const tools = request.tools
        ? toOpenAICompatibleTools(request.tools, this.getToolOptions(model))
        : undefined;
      const outputTokenField = this.getOutputTokenField(model);
      const maxOutputTokens = this.getMaxOutputTokens(model, request.maxTokens);
      console.log(`[${this.providerName}] Calling API with model: ${model}`);

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...this.extraHeaders,
      };
      if (this.apiKey) {
        headers.Authorization = `Bearer ${this.apiKey}`;
      }

      const response = await fetch(this.chatCompletionsUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model,
          messages,
          [outputTokenField]: maxOutputTokens,
          ...(tools && tools.length > 0
            ? {
                tools,
                tool_choice: request.toolChoice || "auto",
              }
            : {}),
          ...this.getToolRequestExtras(model, tools),
          ...buildOpenAIPromptCacheFields(request.promptCache),
        }),
        signal: request.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = this.getErrorMessage(errorData);
        throw new OpenAICompatibleProviderError(
          `${this.providerName} API error: ${response.status} ${response.statusText}` +
            (errorMessage ? ` - ${errorMessage}` : ""),
          {
            providerName: this.providerName,
            status: response.status,
            code: `HTTP_${response.status}`,
            retryable: RETRYABLE_HTTP_STATUSES.has(response.status),
          },
        );
      }

      let data: Any;
      try {
        data = (await response.json()) as Any;
      } catch (error: Any) {
        throw new OpenAICompatibleProviderError(
          `${this.providerName} API returned an invalid or truncated response`,
          {
            providerName: this.providerName,
            code: "INVALID_JSON_RESPONSE",
            retryable: true,
            cause: error,
          },
        );
      }
      return fromOpenAICompatibleResponse(data);
    } catch (error: Any) {
      if (error.name === "AbortError" || error.message?.includes("aborted")) {
        console.log(`[${this.providerName}] Request aborted`);
        throw new Error("Request cancelled");
      }

      if (!(error instanceof OpenAICompatibleProviderError)) {
        const code = getTransportErrorCode(error);
        const malformedToolArguments = code === "MALFORMED_TOOL_ARGUMENTS";
        error = new OpenAICompatibleProviderError(
          `${this.providerName} API request failed: ${error?.message || "Unknown transport error"}`,
          {
            providerName: this.providerName,
            code: code || "TRANSPORT_ERROR",
            // Parser failures happen after a successful HTTP response, so
            // they are not transport errors. Preserve their structured
            // retryability instead of accidentally turning them terminal.
            retryable:
              error?.retryable === true ||
              malformedToolArguments ||
              isRetryableTransportError(error),
            ...(malformedToolArguments
              ? { retryKind: "malformed_response" as const }
              : {}),
            cause: error,
          },
        );
      }

      console.error(`[${this.providerName}] API error:`, {
        message: error.message,
        status: error.status,
        code: error.code,
        retryable: error.retryable,
      });
      throw error;
    }
  }

  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      const model = this.normalizeModelForEndpoint(this.defaultModel);
      const outputTokenField = this.getOutputTokenField(model);
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...this.extraHeaders,
      };
      if (this.apiKey) {
        headers.Authorization = `Bearer ${this.apiKey}`;
      }

      const response = await fetch(this.chatCompletionsUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: "Hi" }],
          [outputTokenField]: 10,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          success: false,
          error:
            this.getErrorMessage(errorData) ||
            `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      return { success: true };
    } catch (error: Any) {
      return {
        success: false,
        error: error.message || `Failed to connect to ${this.providerName} API`,
      };
    }
  }

  async getAvailableModels(): Promise<Array<{ id: string; name: string }>> {
    try {
      const headers: Record<string, string> = {};
      if (this.apiKey) {
        headers.Authorization = `Bearer ${this.apiKey}`;
      }

      const response = await fetch(this.modelsUrl, {
        headers,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new Error(
          `${this.providerName} model refresh failed: HTTP ${response.status}${
            errorText ? ` - ${errorText.slice(0, 500)}` : ""
          }`,
        );
      }

      const data = (await response.json()) as Any;
      const collections = [
        data,
        data?.data,
        data?.models,
        data?.data?.models,
        data?.result,
        data?.result?.models,
        data?.model_list,
        data?.modelList,
      ];
      const modelList = collections.find((value) => Array.isArray(value)) as
        | Any[]
        | undefined;
      if (!modelList) {
        throw new Error(
          `${this.providerName} returned an unrecognized model-list format.`,
        );
      }

      const seen = new Set<string>();
      return modelList
        .map((model: Any) => {
          const rawId =
            typeof model === "string"
              ? model
              : model?.id || model?.model || model?.model_id || model?.name;
          const id = typeof rawId === "string" ? rawId.trim() : "";
          if (!id || seen.has(id)) return null;
          seen.add(id);
          const rawName =
            typeof model === "string"
              ? model
              : model?.display_name ||
                model?.displayName ||
                model?.model_name ||
                model?.name ||
                id;
          return {
            id,
            name: typeof rawName === "string" && rawName.trim() ? rawName.trim() : id,
          };
        })
        .filter((model): model is { id: string; name: string } => model !== null);
    } catch (error: Any) {
      // ECONNREFUSED means the local server simply isn't running yet — not an error worth logging loudly
      const isOffline =
        error?.cause?.code === "ECONNREFUSED" || error?.code === "ECONNREFUSED";
      if (!isOffline) {
        console.error(`[${this.providerName}] Failed to fetch models:`, error);
      }
      throw error instanceof Error
        ? error
        : new Error(`Failed to refresh ${this.providerName} models.`);
    }
  }
}
