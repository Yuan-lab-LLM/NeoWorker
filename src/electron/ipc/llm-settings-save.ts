import type { LLMSettingsData } from "../../shared/types";

function mergeProviderSettings<T extends object>(
  incoming?: T,
  existing?: T,
): T | undefined {
  if (!incoming && !existing) return undefined;
  if (!incoming) return existing;
  if (!existing) return incoming;
  return {
    ...existing,
    ...incoming,
  };
}

function cleanString(value: string | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

const PROVIDER_STRING_KEYS = [
  "displayName",
  "apiKey",
  "subscriptionToken",
  "accessToken",
  "refreshToken",
  "idToken",
  "tokenEndpoint",
  "baseUrl",
  "model",
  "provider",
  "endpoint",
  "deployment",
  "apiVersion",
  "region",
  "accessKeyId",
  "secretAccessKey",
  "sessionToken",
  "profile",
] as const;

function cleanProviderSettings<T extends object>(
  settings?: T,
): T | undefined {
  if (!settings) return undefined;
  const cleaned = { ...settings };
  const mutableCleaned = cleaned as Record<string, unknown>;
  for (const key of PROVIDER_STRING_KEYS) {
    const value = mutableCleaned[key];
    if (typeof value === "string") {
      mutableCleaned[key] = cleanString(value);
    }
  }
  return cleaned;
}

function cleanCustomProviders(
  providers?: LLMSettingsData["customProviders"],
): LLMSettingsData["customProviders"] | undefined {
  if (!providers) return undefined;
  const cleaned: NonNullable<LLMSettingsData["customProviders"]> = {};
  for (const [providerId, providerConfig] of Object.entries(providers)) {
    cleaned[providerId] = cleanProviderSettings(providerConfig) ?? {};
  }
  return cleaned;
}

function cleanProviderModelRegistry(
  registry?: LLMSettingsData["providerModelRegistry"],
): LLMSettingsData["providerModelRegistry"] | undefined {
  if (!registry) return undefined;
  const cleaned: NonNullable<LLMSettingsData["providerModelRegistry"]> = {};

  for (const [providerId, entry] of Object.entries(registry)) {
    const models = Array.from(
      new Set(
        (entry.models || [])
          .map((model) => model.trim())
          .filter(Boolean),
      ),
    );
    const enabled: Record<string, boolean> = {};
    for (const [model, value] of Object.entries(entry.enabled || {})) {
      const normalizedModel = model.trim();
      if (!normalizedModel || typeof value !== "boolean") continue;
      enabled[normalizedModel] = value;
    }

    if (models.length > 0 || Object.keys(enabled).length > 0) {
      cleaned[providerId] = {
        ...(models.length > 0 ? { models } : {}),
        ...(Object.keys(enabled).length > 0 ? { enabled } : {}),
        ...(typeof entry.updatedAt === "number" ? { updatedAt: entry.updatedAt } : {}),
      };
    }
  }

  return Object.keys(cleaned).length > 0 ? cleaned : undefined;
}

function normalizeAzureSettings(
  incoming?: LLMSettingsData["azure"],
  existing?: LLMSettingsData["azure"],
): LLMSettingsData["azure"] | undefined {
  if (!incoming && !existing) return undefined;
  const mergedDeployments = [...(incoming?.deployments || []), ...(existing?.deployments || [])]
    .map((entry) => entry.trim())
    .filter(Boolean);
  const deployment = (
    incoming?.deployment ||
    existing?.deployment ||
    mergedDeployments[0] ||
    ""
  ).trim();
  if (deployment && !mergedDeployments.includes(deployment)) {
    mergedDeployments.unshift(deployment);
  }
  return {
    ...existing,
    ...incoming,
    deployment: deployment || undefined,
    deployments: mergedDeployments.length > 0 ? Array.from(new Set(mergedDeployments)) : undefined,
  };
}

function normalizeAzureAnthropicSettings(
  incoming?: LLMSettingsData["azureAnthropic"],
  existing?: LLMSettingsData["azureAnthropic"],
): LLMSettingsData["azureAnthropic"] | undefined {
  if (!incoming && !existing) return undefined;
  const mergedDeployments = [...(incoming?.deployments || []), ...(existing?.deployments || [])]
    .map((entry) => entry.trim())
    .filter(Boolean);
  const deployment = (
    incoming?.deployment ||
    existing?.deployment ||
    mergedDeployments[0] ||
    ""
  ).trim();
  if (deployment && !mergedDeployments.includes(deployment)) {
    mergedDeployments.unshift(deployment);
  }
  return {
    ...existing,
    ...incoming,
    deployment: deployment || undefined,
    deployments: mergedDeployments.length > 0 ? Array.from(new Set(mergedDeployments)) : undefined,
  };
}

export function buildSavedLLMSettings(
  validated: LLMSettingsData,
  existingSettings: LLMSettingsData,
): LLMSettingsData {
  const hasIncoming = (key: keyof LLMSettingsData) =>
    Object.prototype.hasOwnProperty.call(validated, key);
  const mergeIncomingProviderSettings = <T extends object>(
    key: keyof LLMSettingsData,
    incoming: T | undefined,
    existing: T | undefined,
  ): T | undefined => {
    if (hasIncoming(key) && incoming === undefined) {
      return undefined;
    }
    return cleanProviderSettings(mergeProviderSettings(incoming, existing));
  };
  const existingOpenAISettings = existingSettings.openai;
  const incomingOpenAISettings = validated.openai;
  let openaiSettings =
    hasIncoming("openai") && incomingOpenAISettings === undefined
      ? undefined
      : mergeProviderSettings(incomingOpenAISettings, existingOpenAISettings);
  const shouldPreserveOpenAIOAuthTokens =
    openaiSettings !== undefined &&
    existingOpenAISettings?.authMethod === "oauth" &&
    validated.openai?.authMethod !== "api_key";
  if (validated.openai?.authMethod === "api_key" && openaiSettings) {
    delete openaiSettings.accessToken;
    delete openaiSettings.refreshToken;
    delete openaiSettings.tokenExpiresAt;
    delete openaiSettings.accountId;
    delete openaiSettings.email;
  }
  if (shouldPreserveOpenAIOAuthTokens && existingOpenAISettings) {
    openaiSettings = {
      ...openaiSettings,
      accessToken: existingOpenAISettings.accessToken,
      refreshToken: existingOpenAISettings.refreshToken,
      tokenExpiresAt: existingOpenAISettings.tokenExpiresAt,
      accountId: existingOpenAISettings.accountId,
      email: existingOpenAISettings.email,
      authMethod:
        incomingOpenAISettings?.authMethod || existingOpenAISettings.authMethod,
    };
  }

  const existingXAISettings = existingSettings.xai;
  const incomingXAISettings = validated.xai;
  let xaiSettings =
    hasIncoming("xai") && incomingXAISettings === undefined
      ? undefined
      : mergeProviderSettings(incomingXAISettings, existingXAISettings);
  const shouldPreserveXAIOAuthTokens =
    xaiSettings !== undefined &&
    existingXAISettings?.authMethod === "oauth" &&
    validated.xai?.authMethod !== "api_key";
  if (validated.xai?.authMethod === "api_key" && xaiSettings) {
    delete xaiSettings.accessToken;
    delete xaiSettings.refreshToken;
    delete xaiSettings.tokenExpiresAt;
    delete xaiSettings.tokenEndpoint;
    delete xaiSettings.idToken;
  }
  if (shouldPreserveXAIOAuthTokens && existingXAISettings) {
    xaiSettings = {
      ...xaiSettings,
      accessToken: existingXAISettings.accessToken,
      refreshToken: existingXAISettings.refreshToken,
      tokenExpiresAt: existingXAISettings.tokenExpiresAt,
      tokenEndpoint: existingXAISettings.tokenEndpoint,
      idToken: existingXAISettings.idToken,
      authMethod:
        incomingXAISettings?.authMethod || existingXAISettings.authMethod,
    };
  }

  return {
    providerType: validated.providerType,
    modelKey: validated.modelKey,
    fallbackProviders: Object.prototype.hasOwnProperty.call(
      validated,
      "fallbackProviders",
    )
      ? validated.fallbackProviders
      : existingSettings.fallbackProviders,
    failoverPrimaryRetryCooldownSeconds: Object.prototype.hasOwnProperty.call(
      validated,
      "failoverPrimaryRetryCooldownSeconds",
    )
      ? validated.failoverPrimaryRetryCooldownSeconds
      : existingSettings.failoverPrimaryRetryCooldownSeconds,
    promptCaching: validated.promptCaching ?? existingSettings.promptCaching,
    anthropic: mergeIncomingProviderSettings(
      "anthropic",
      validated.anthropic,
      existingSettings.anthropic,
    ),
    bedrock: mergeIncomingProviderSettings(
      "bedrock",
      validated.bedrock,
      existingSettings.bedrock,
    ),
    ollama: mergeIncomingProviderSettings(
      "ollama",
      validated.ollama,
      existingSettings.ollama,
    ),
    gemini: mergeIncomingProviderSettings(
      "gemini",
      validated.gemini,
      existingSettings.gemini,
    ),
    openrouter: mergeIncomingProviderSettings(
      "openrouter",
      validated.openrouter,
      existingSettings.openrouter,
    ),
    deepseek: mergeIncomingProviderSettings(
      "deepseek",
      validated.deepseek,
      existingSettings.deepseek,
    ),
    openai: cleanProviderSettings(openaiSettings),
    azure:
      hasIncoming("azure") && validated.azure === undefined
        ? undefined
        : normalizeAzureSettings(validated.azure, existingSettings.azure),
    azureAnthropic:
      hasIncoming("azureAnthropic") && validated.azureAnthropic === undefined
        ? undefined
        : normalizeAzureAnthropicSettings(
            validated.azureAnthropic,
            existingSettings.azureAnthropic,
          ),
    groq: mergeIncomingProviderSettings(
      "groq",
      validated.groq,
      existingSettings.groq,
    ),
    xai: cleanProviderSettings(xaiSettings),
    kimi: mergeIncomingProviderSettings(
      "kimi",
      validated.kimi,
      existingSettings.kimi,
    ),
    openaiCompatible: mergeIncomingProviderSettings(
      "openaiCompatible",
      validated.openaiCompatible,
      existingSettings.openaiCompatible,
    ),
    moa: mergeIncomingProviderSettings(
      "moa",
      validated.moa,
      existingSettings.moa,
    ),
    customProviders: cleanCustomProviders(
      hasIncoming("customProviders")
        ? validated.customProviders
        : existingSettings.customProviders,
    ),
    providerModelRegistry: cleanProviderModelRegistry(
      hasIncoming("providerModelRegistry")
        ? validated.providerModelRegistry
        : existingSettings.providerModelRegistry,
    ),
    imageGeneration: validated.imageGeneration ?? existingSettings.imageGeneration,
    videoGeneration: validated.videoGeneration ?? existingSettings.videoGeneration,
    cachedAnthropicModels: existingSettings.cachedAnthropicModels,
    cachedGeminiModels: existingSettings.cachedGeminiModels,
    cachedOpenRouterModels: existingSettings.cachedOpenRouterModels,
    cachedOllamaModels: existingSettings.cachedOllamaModels,
    cachedBedrockModels: existingSettings.cachedBedrockModels,
    cachedOpenAIModels: existingSettings.cachedOpenAIModels,
    cachedGroqModels: existingSettings.cachedGroqModels,
    cachedXaiModels: existingSettings.cachedXaiModels,
    cachedKimiModels: existingSettings.cachedKimiModels,
    cachedDeepSeekModels: existingSettings.cachedDeepSeekModels,
    cachedOpenAICompatibleModels: existingSettings.cachedOpenAICompatibleModels,
  };
}
