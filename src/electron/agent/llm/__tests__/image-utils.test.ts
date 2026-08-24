import { describe, expect, it } from "vitest";
import { promises as fs } from "fs";
import * as os from "os";
import * as path from "path";
import {
  guessImageMimeType,
  getProviderImageCaps,
  isSupportedImageFile,
  loadImageFromFile,
  validateImageForProvider,
  stripImagesForUnsupportedProvider,
  estimateImageTokens,
  createImageContent,
} from "../image-utils";
import { LLMMessage } from "../types";

describe("image-utils", () => {
  it("accepts supported provider-image combinations", () => {
    const image = createImageContent("aGVsbG8=", "image/jpeg");
    expect(validateImageForProvider(image, "openai")).toBeNull();
    expect(validateImageForProvider(image, "openai-compatible")).toBeNull();
  });

  it("rejects unsupported providers", () => {
    const image = createImageContent("aGVsbG8=", "image/jpeg");
    expect(validateImageForProvider(image, "groq")).toMatch(
      /does not support inline images/i,
    );
    expect(validateImageForProvider(image, "gemini")).toMatch(
      /does not support inline images/i,
    );
  });

  it("distinguishes DeepSeek visual models from text-only DeepSeek models", () => {
    const image = createImageContent("aGVsbG8=", "image/png");

    expect(
      getProviderImageCaps("deepseek", "deepseek-chat").supportsImages,
    ).toBe(false);
    expect(
      getProviderImageCaps("deepseek", "deepseek-v4-flash-vision-exp")
        .supportsImages,
    ).toBe(true);
    expect(
      validateImageForProvider(
        image,
        "deepseek",
        "deepseek-v4-flash-vision-exp",
      ),
    ).toBeNull();
  });

  it("detects visual model families behind custom OpenAI-compatible routes", () => {
    const visualModels: Array<[string, string]> = [
      ["openai-compatible", "kimi-k2.6"],
      ["nano-gpt", "moonshotai/kimi-k2.6:thinking"],
      ["moonshot", "kimi-k2.5"],
      ["moonshot", "kimi-k3"],
      ["openai-compatible", "moonshotai/kimi-k2.7-code"],
      ["zai", "GLM-5V-Turbo"],
      ["glm", "glm-4.5v"],
      ["minimax", "MiniMax-VL-01"],
    ];

    for (const [providerType, modelId] of visualModels) {
      expect(
        getProviderImageCaps(providerType, modelId).supportsImages,
        `${providerType}/${modelId}`,
      ).toBe(true);
    }
  });

  it("does not mislabel text-only MiniMax and GLM models as visual", () => {
    expect(getProviderImageCaps("minimax", "MiniMax-M2.7").supportsImages).toBe(
      false,
    );
    expect(getProviderImageCaps("glm", "glm-4.7").supportsImages).toBe(false);
    expect(
      getProviderImageCaps("moonshot", "kimi-k2-thinking").supportsImages,
    ).toBe(false);
  });

  it("honors an explicit custom image capability override", () => {
    expect(
      getProviderImageCaps("minimax", "private-model-alias", true)
        .supportsImages,
    ).toBe(true);
    expect(
      getProviderImageCaps("moonshot", "kimi-k2.6", false).supportsImages,
    ).toBe(false);
  });

  it("falls back unsupported image blocks to text", () => {
    const messages: LLMMessage[] = [
      {
        role: "user",
        content: [
          { type: "text", text: "before" },
          {
            type: "image",
            data: "aGVsbG8=",
            mimeType: "image/png",
            originalSizeBytes: 900_000,
          },
        ],
      },
    ];

    const converted = stripImagesForUnsupportedProvider(messages, "groq");
    expect(converted).toHaveLength(1);
    expect(converted[0].content).toMatchObject([
      { type: "text", text: "before" },
      {
        type: "text",
        text: expect.stringContaining("[Image attached: image/png"),
      },
    ]);
  });

  it("guesses image MIME type from supported file paths", () => {
    expect(guessImageMimeType("/tmp/example.jpeg")).toBe("image/jpeg");
    expect(guessImageMimeType("/tmp/example.webp")).toBe("image/webp");
    expect(guessImageMimeType("/tmp/example.txt")).toBeNull();
  });

  it("loads supported image files from disk", async () => {
    const tempPath = path.join(
      os.tmpdir(),
      `neoworker-image-test-${Date.now()}-${Math.random().toString(16).slice(2)}.png`,
    );
    const pngBytes = Buffer.from([
      137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13,
    ]);
    try {
      await fs.writeFile(tempPath, pngBytes);
      const image = await loadImageFromFile(tempPath);
      expect(image.type).toBe("image");
      expect(image.mimeType).toBe("image/png");
      expect(image.originalSizeBytes).toBe(pngBytes.length);
      expect(typeof image.data).toBe("string");
      expect(image.data.length).toBeGreaterThan(0);
    } finally {
      await fs.unlink(tempPath).catch(() => undefined);
    }
  });

  it("rejects unsupported image formats from disk", async () => {
    const tempPath = path.join(
      os.tmpdir(),
      `neoworker-image-test-${Date.now()}-${Math.random().toString(16).slice(2)}.txt`,
    );
    try {
      await fs.writeFile(tempPath, "not an image");
      await expect(loadImageFromFile(tempPath)).rejects.toThrow(
        "Unsupported image format: .txt",
      );
    } finally {
      await fs.unlink(tempPath).catch(() => undefined);
    }
  });

  it("tracks provider-supported file extension preferences", () => {
    expect(isSupportedImageFile("/tmp/photo.png")).toBe(true);
    expect(isSupportedImageFile("/tmp/document.txt")).toBe(false);
  });

  it("tracks token bucket thresholds", () => {
    const mb1 = createImageContent("a".repeat(1024), "image/png");
    mb1.originalSizeBytes = 300_000;
    expect(estimateImageTokens(mb1, "openai")).toBe(1000);

    const mb2 = createImageContent("a".repeat(1024 * 1024 * 2), "image/png");
    mb2.originalSizeBytes = 2_000_000;
    expect(estimateImageTokens(mb2, "openai")).toBe(2000);

    const mb3 = createImageContent("a".repeat(1024 * 1024 * 6), "image/png");
    mb3.originalSizeBytes = 6_000_000;
    expect(estimateImageTokens(mb3, "openai")).toBe(6000);
  });

  it("enforces provider-specific MIME-type limits", () => {
    const image = createImageContent("aGVsbG8=", "image/webp");
    expect(validateImageForProvider(image, "ollama")).toMatch(
      /is not supported by provider "ollama"/,
    );
    expect(validateImageForProvider(image, "openai")).toBeNull();
  });
});
