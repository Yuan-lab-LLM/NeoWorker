/**
 * Image utilities for LLM provider image input support.
 * Handles validation, token estimation, and fallback for unsupported providers.
 */

import * as fs from "fs/promises";
import * as path from "path";
import {
  LLMImageContent,
  LLMImageMimeType,
  LLMMessage,
  LLMProviderImageCaps,
  PROVIDER_IMAGE_CAPS,
} from "./types";
import type { LLMProviderType } from "../../../shared/types";

const SUPPORTED_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
]);

const DEEPSEEK_VISION_MODEL_PATTERN =
  /(?:^|[/:._-])(?:vision|vl\d*|janus(?:-pro)?|ocr|multimodal)(?:$|[/:._-])/i;

// Kimi's current multimodal chat models use the standard OpenAI image_url
// shape. Keep this model-specific: older text/coding models must not inherit
// image support just because they use a Moonshot/Kimi endpoint.
const KIMI_VISION_MODEL_PATTERN =
  /(?:^|\/)(?:kimi-)?k(?:3(?:[-_:].*)?|2\.(?:5|6)(?:[-_:].*)?|2\.7(?:-code)?(?:[-_:].*)?)$/i;

const GLM_VISION_MODEL_PATTERN = /(?:^|\/)glm-[a-z0-9.]*v(?:[-_:].*)?$/i;

const EXPLICIT_VISION_MODEL_PATTERN =
  /(?:^|[\/:._-])(?:vision|visual|vlm|multimodal|image-understanding|api-vlm)(?:$|[\/:._-])/i;

const VL_MODEL_PATTERN = /(?:^|[\/:._-])vl(?:\d+)?(?:$|[\/:._-])/i;

const DEEPSEEK_VISION_CAPS: LLMProviderImageCaps = {
  supportsImages: true,
  maxImageBytes: 20 * 1024 * 1024,
  supportedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
};

/**
 * Return true only when the model ID itself is a strong image-input signal.
 *
 * This intentionally ignores provider-wide defaults and manual overrides. It
 * is used when a selected custom-gateway model accepted an image-shaped
 * request but then explicitly said it could not see the image. In that case we
 * may try another user-configured model on the same endpoint, but only when its
 * own name clearly identifies a visual model family.
 */
export function isHighConfidenceVisionModelId(modelId?: string): boolean {
  const normalizedModelId = String(modelId || "").trim();
  if (!normalizedModelId) return false;
  return (
    KIMI_VISION_MODEL_PATTERN.test(normalizedModelId) ||
    GLM_VISION_MODEL_PATTERN.test(normalizedModelId) ||
    EXPLICIT_VISION_MODEL_PATTERN.test(normalizedModelId) ||
    VL_MODEL_PATTERN.test(normalizedModelId) ||
    DEEPSEEK_VISION_MODEL_PATTERN.test(normalizedModelId)
  );
}

/**
 * Guess the image MIME type from a file path extension.
 * Returns null for unsupported formats.
 */
export function guessImageMimeType(filePath: string): LLMImageMimeType | null {
  const ext = path.extname(filePath).toLowerCase();
  const map: Record<string, LLMImageMimeType> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
  };
  return map[ext] ?? null;
}

/** Check if a file path has a supported image extension. */
export function isSupportedImageFile(filePath: string): boolean {
  return SUPPORTED_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

/**
 * Get image capability limits for a provider/model pair.
 *
 * Most providers expose one transport shape for all models, so their provider
 * capability remains the default. DeepSeek is different: its ordinary chat
 * models are text-only while explicitly named Vision/VL/Janus/OCR models use
 * the OpenAI-compatible multimodal message shape. Keep that distinction at the
 * model level so a text model never receives images and a visual model does not
 * lose them because of a provider-wide flag.
 */
export function getProviderImageCaps(
  providerType: LLMProviderType,
  modelId?: string,
  explicitSupportsImages?: boolean,
): LLMProviderImageCaps {
  if (explicitSupportsImages === false) {
    return { supportsImages: false, maxImageBytes: 0, supportedMimeTypes: [] };
  }

  const normalizedModelId = String(modelId || "").trim();
  // Model IDs often arrive through the generic OpenAI-compatible route or a
  // third-party gateway (for example `moonshotai/kimi-k2.6:thinking`). Match
  // distinctive visual model families independently of the selected provider
  // ID so a gateway alias cannot silently strip image blocks.
  const inferredVisionModel =
    isHighConfidenceVisionModelId(normalizedModelId) &&
    (providerType !== "deepseek" ||
      DEEPSEEK_VISION_MODEL_PATTERN.test(normalizedModelId));

  if (explicitSupportsImages === true || inferredVisionModel) {
    return DEEPSEEK_VISION_CAPS;
  }
  return (
    PROVIDER_IMAGE_CAPS[providerType] ?? {
      supportsImages: false,
      maxImageBytes: 0,
      supportedMimeTypes: [],
    }
  );
}

/**
 * Validate an image against a provider's limits.
 * Returns null if valid, or an error string describing the issue.
 */
export function validateImageForProvider(
  image: LLMImageContent,
  providerType: LLMProviderType,
  modelId?: string,
  explicitSupportsImages?: boolean,
): string | null {
  const caps = getProviderImageCaps(
    providerType,
    modelId,
    explicitSupportsImages,
  );
  if (!caps.supportsImages) {
    return `Provider "${providerType}" does not support inline images.`;
  }
  const rawSize =
    image.originalSizeBytes ?? Math.ceil((image.data.length * 3) / 4);
  if (rawSize > caps.maxImageBytes) {
    const sizeMB = (rawSize / (1024 * 1024)).toFixed(1);
    const limitMB = (caps.maxImageBytes / (1024 * 1024)).toFixed(0);
    return `Image is ${sizeMB}MB but provider "${providerType}" supports max ${limitMB}MB.`;
  }
  if (!caps.supportedMimeTypes.includes(image.mimeType)) {
    return `Image type "${image.mimeType}" is not supported by provider "${providerType}".`;
  }
  return null;
}

/**
 * Read an image file from disk and produce an LLMImageContent.
 */
export async function loadImageFromFile(
  filePath: string,
): Promise<LLMImageContent> {
  const mimeType = guessImageMimeType(filePath);
  if (!mimeType) {
    throw new Error(`Unsupported image format: ${path.extname(filePath)}`);
  }
  const buffer = await fs.readFile(filePath);
  return {
    type: "image",
    data: buffer.toString("base64"),
    mimeType,
    originalSizeBytes: buffer.length,
  };
}

/**
 * Create an LLMImageContent from a base64 string and MIME type (for UI uploads).
 */
export function createImageContent(
  base64Data: string,
  mimeType: LLMImageMimeType,
): LLMImageContent {
  const rawSize = Math.ceil((base64Data.length * 3) / 4);
  return {
    type: "image",
    data: base64Data,
    mimeType,
    originalSizeBytes: rawSize,
  };
}

/**
 * Estimate the token cost of an image for context window accounting.
 *
 * - Anthropic/Bedrock: ~1600 tokens per megapixel (approximated from file size)
 * - OpenAI: varies by detail mode; approximated from file size
 *
 * Without actual image dimensions we use file-size heuristics.
 */
export function estimateImageTokens(
  image: LLMImageContent,
  providerType?: string,
): number {
  const sizeBytes =
    image.originalSizeBytes ?? Math.ceil((image.data.length * 3) / 4);
  const sizeMB = sizeBytes / (1024 * 1024);
  if (sizeMB <= 0.5) return 1000;
  if (sizeMB <= 2) return 2000;
  if (sizeMB <= 5) return 4000;
  return 6000;
}

/**
 * Produce a text description as a fallback for providers that do not support images.
 */
export function imageToTextFallback(image: LLMImageContent): string {
  const sizeBytes =
    image.originalSizeBytes ?? Math.ceil((image.data.length * 3) / 4);
  const sizeMB = (sizeBytes / (1024 * 1024)).toFixed(1);
  return `[Image attached: ${image.mimeType}, ${sizeMB}MB - this provider does not support inline images. Switch to an image-capable model/provider and resend the image.]`;
}

/**
 * Replace image content blocks with text fallback for providers
 * that do not support inline images.
 * Returns messages unchanged if the provider supports images.
 */
export function stripImagesForUnsupportedProvider(
  messages: LLMMessage[],
  providerType: LLMProviderType,
  modelId?: string,
  explicitSupportsImages?: boolean,
): LLMMessage[] {
  const caps = getProviderImageCaps(
    providerType,
    modelId,
    explicitSupportsImages,
  );
  if (caps.supportsImages) return messages;

  return messages.map((msg) => {
    if (typeof msg.content === "string") return msg;
    const newContent = (msg.content as Any[]).map((item: Any) => {
      if (item.type === "image") {
        return { type: "text" as const, text: imageToTextFallback(item) };
      }
      return item;
    });
    return { ...msg, content: newContent } as LLMMessage;
  });
}
