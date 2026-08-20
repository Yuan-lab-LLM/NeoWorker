import { AnthropicCompatibleProvider } from "./anthropic-compatible-provider";
import { OpenAICompatibleProvider } from "./openai-compatible-provider";
import {
  LLMProvider,
  LLMProviderType,
  LLMRequest,
  LLMResponse,
} from "./types";
import {
  isOpenCodeGoAnthropicMessagesModel,
  normalizeOpenCodeGoAnthropicBaseUrl,
  normalizeOpenCodeGoModelId,
} from "./opencode-go-routing";

export interface OpenCodeGoProviderOptions {
  type: LLMProviderType;
  providerName: string;
  apiKey: string;
  baseUrl: string;
  defaultModel: string;
}

export class OpenCodeGoProvider implements LLMProvider {
  readonly type: LLMProviderType;
  private defaultModel: string;
  private openaiProvider: OpenAICompatibleProvider;
  private anthropicProvider: AnthropicCompatibleProvider;

  constructor(options: OpenCodeGoProviderOptions) {
    this.type = options.type;
    this.defaultModel = options.defaultModel;
    this.openaiProvider = new OpenAICompatibleProvider(options);
    this.anthropicProvider = new AnthropicCompatibleProvider({
      ...options,
      baseUrl: normalizeOpenCodeGoAnthropicBaseUrl(options.baseUrl),
      defaultModel: normalizeOpenCodeGoModelId(options.defaultModel),
    });
  }

  async createMessage(request: LLMRequest): Promise<LLMResponse> {
    const model = request.model || this.defaultModel;
    if (!isOpenCodeGoAnthropicMessagesModel(model)) {
      return this.openaiProvider.createMessage(request);
    }

    return this.anthropicProvider.createMessage({
      ...request,
      model: normalizeOpenCodeGoModelId(model),
    });
  }

  async testConnection(): Promise<{ success: boolean; error?: string }> {
    if (isOpenCodeGoAnthropicMessagesModel(this.defaultModel)) {
      return this.anthropicProvider.testConnection();
    }
    return this.openaiProvider.testConnection();
  }
}
