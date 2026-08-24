import { describe, expect, it, vi } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { Workspace } from "../../../../shared/types";
import { VisionTools } from "../vision-tools";
import { LLMProviderFactory } from "../../llm/provider-factory";
import {
  persistTaskAttachmentSync,
  persistTempWorkspaceArtifactSync,
} from "../../../utils/durable-temp-artifact";

function createVisionTools() {
  const workspace: Workspace = {
    id: "w1",
    name: "Test",
    path: "/tmp",
    createdAt: Date.now(),
    permissions: {
      read: true,
      write: true,
      delete: true,
      network: true,
      shell: true,
    },
    isTemp: true,
  };
  const daemon = { logEvent: vi.fn() } as Any;
  return new VisionTools(workspace, daemon, "task-1") as Any;
}

describe("VisionTools cache and page range guards", () => {
  it("uses request-specific cache keys (prompt changes should not collide)", () => {
    const vision = createVisionTools();
    const keyA = vision.buildCacheKey({
      tool: "read_pdf_visual",
      absPath: "/tmp/a.pdf",
      mtimeMs: 100,
      pages: "1-2",
      prompt: "describe layout",
      provider: "bedrock",
    });
    const keyB = vision.buildCacheKey({
      tool: "read_pdf_visual",
      absPath: "/tmp/a.pdf",
      mtimeMs: 100,
      pages: "1-2",
      prompt: "extract typography only",
      provider: "bedrock",
    });

    expect(keyA).not.toBe(keyB);
  });

  it("evicts oldest entries once cache exceeds configured max", () => {
    const vision = createVisionTools();

    for (let i = 0; i < 140; i++) {
      vision.setCachedResult(`k-${i}`, { ok: true, i });
    }

    expect(vision.visionCache.size).toBeLessThanOrEqual(128);
    expect(vision.visionCache.has("k-0")).toBe(false);
    expect(vision.visionCache.has("k-139")).toBe(true);
  });

  it("normalizes reversed page ranges", () => {
    const vision = createVisionTools();

    expect(vision.parsePageRange("5-1")).toEqual({ firstPage: 1, lastPage: 5 });
    expect(vision.parsePageRange("1-20")).toEqual({
      firstPage: 1,
      lastPage: 5,
    });
  });

  it("retries only transient vision errors", () => {
    const vision = createVisionTools();

    expect(vision.shouldRetryVisionError("OpenAI API key not configured")).toBe(
      false,
    );
    expect(vision.shouldRetryVisionError("401 Unauthorized")).toBe(false);
    expect(
      vision.shouldRetryVisionError({ status: 401, message: "Unauthorized" }),
    ).toBe(false);
    expect(vision.shouldRetryVisionError("429 rate limit exceeded")).toBe(true);
    expect(
      vision.shouldRetryVisionError({
        statusCode: 503,
        message: "Service Unavailable",
      }),
    ).toBe(true);
    expect(vision.shouldRetryVisionError("503 Service Unavailable")).toBe(true);
    expect(
      vision.shouldRetryVisionError("network timeout while calling provider"),
    ).toBe(true);
  });

  it("emits both tool_result and tool_error for aggregate PDF failures", () => {
    const vision = createVisionTools();
    const daemon = vision.daemon;

    vision.logReadPdfVisualFailure("p1 failed", {
      pagesAnalyzed: 0,
      pagesFailed: 1,
    });

    expect(daemon.logEvent).toHaveBeenCalledWith(
      "task-1",
      "tool_result",
      expect.objectContaining({
        tool: "read_pdf_visual",
        success: false,
        error: "p1 failed",
        pagesAnalyzed: 0,
        pagesFailed: 1,
      }),
    );
    expect(daemon.logEvent).toHaveBeenCalledWith(
      "task-1",
      "tool_error",
      expect.objectContaining({
        tool: "read_pdf_visual",
        error: "p1 failed",
        pagesAnalyzed: 0,
        pagesFailed: 1,
      }),
    );
  });

  it("can suppress per-page tool_error emission when aggregate handling is used", async () => {
    const vision = createVisionTools();
    const daemon = vision.daemon;
    const loadSettingsSpy = vi
      .spyOn(LLMProviderFactory, "loadSettings")
      .mockReturnValue({
        providerType: "openai",
        openai: { apiKey: "" },
      } as Any);

    try {
      const result = await vision.analyzeBuffer({
        base64: "AA==",
        mimeType: "image/png",
        prompt: "test",
        maxTokens: 64,
        providerOverride: "openai",
        toolName: "read_pdf_visual",
        emitToolError: false,
      });
      expect(result.success).toBe(false);
      const emittedToolError = daemon.logEvent.mock.calls.some(
        (call: Any[]) => call[1] === "tool_error",
      );
      expect(emittedToolError).toBe(false);
    } finally {
      loadSettingsSpy.mockRestore();
    }
  });

  it("uses Azure OpenAI for vision when Azure is the active provider", async () => {
    const vision = createVisionTools();
    const loadSettingsSpy = vi
      .spyOn(LLMProviderFactory, "loadSettings")
      .mockReturnValue({
        providerType: "azure",
        azure: {
          apiKey: "azure-key",
          endpoint: "https://example.openai.azure.com/openai/v1/responses",
          deployment: "gpt-4.1-mini",
          apiVersion: "2024-12-01-preview",
        },
      } as Any);
    const azureSpy = vi
      .spyOn(vision, "analyzeWithAzureOpenAI")
      .mockResolvedValue("Azure vision result");

    try {
      const result = await vision.analyzeBuffer({
        base64: "AA==",
        mimeType: "image/png",
        prompt: "describe the page",
        maxTokens: 64,
        toolName: "read_pdf_visual",
      });

      expect(azureSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          endpoint: "https://example.openai.azure.com/openai/v1/responses",
          deployment: "gpt-4.1-mini",
          model: "gpt-4.1-mini",
        }),
      );
      expect(result).toEqual({
        success: true,
        provider: "azure",
        model: "gpt-4.1-mini",
        text: "Azure vision result",
      });
    } finally {
      azureSpy.mockRestore();
      loadSettingsSpy.mockRestore();
    }
  });

  it("uses the configured DeepSeek vision model for image analysis", async () => {
    const vision = createVisionTools();
    const loadSettingsSpy = vi
      .spyOn(LLMProviderFactory, "loadSettings")
      .mockReturnValue({
        providerType: "deepseek",
        modelKey: "deepseek-v4-flash-vision-exp",
        deepseek: {
          apiKey: "deepseek-key",
          model: "deepseek-v4-flash-vision-exp",
          baseUrl: "https://api.deepseek.com",
        },
      } as Any);
    const deepSeekSpy = vi
      .spyOn(vision, "analyzeWithDeepSeek")
      .mockResolvedValue("DeepSeek vision result");

    try {
      const result = await vision.analyzeBuffer({
        base64: "AA==",
        mimeType: "image/png",
        prompt: "describe the image",
        maxTokens: 64,
        toolName: "analyze_image",
      });

      expect(deepSeekSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          apiKey: "deepseek-key",
          baseUrl: "https://api.deepseek.com",
          model: "deepseek-v4-flash-vision-exp",
          mimeType: "image/png",
        }),
      );
      expect(result).toEqual({
        success: true,
        provider: "deepseek",
        model: "deepseek-v4-flash-vision-exp",
        text: "DeepSeek vision result",
      });
    } finally {
      deepSeekSpy.mockRestore();
      loadSettingsSpy.mockRestore();
    }
  });

  it("does not expose provider/model overrides that can bypass the selected task model", () => {
    const analyzeImage = VisionTools.getToolDefinitions().find(
      (definition) => definition.name === "analyze_image",
    );
    expect(analyzeImage?.input_schema.properties).not.toHaveProperty(
      "provider",
    );
    expect(analyzeImage?.input_schema.properties).not.toHaveProperty("model");
    expect(analyzeImage?.description).toContain(
      "routes this through the active image-capable task model automatically",
    );
  });

  it.each(["kimi-k2.6", "glm-4.6v", "MiniMax-VL-01"])(
    "routes analyze_image through the active custom multimodal model %s",
    async (modelId) => {
      const vision = createVisionTools();
      const createMessage = vi.fn().mockResolvedValue({
        content: [{ type: "text", text: `vision result from ${modelId}` }],
        stopReason: "end_turn",
      });
      vision.setActiveVisionRouteResolver(() => ({
        provider: {
          type: "openai-compatible",
          createMessage,
          testConnection: vi.fn(),
        },
        modelId,
      }));
      const loadSettingsSpy = vi
        .spyOn(LLMProviderFactory, "loadSettings")
        .mockReturnValue({
          providerType: "openai-compatible",
          openaiCompatible: {},
        } as Any);

      try {
        const result = await vision.analyzeBuffer({
          base64: "AQIDBA==",
          mimeType: "image/png",
          prompt: "describe the logo",
          maxTokens: 128,
          toolName: "analyze_image",
        });

        expect(result).toEqual({
          success: true,
          provider: "openai-compatible",
          model: modelId,
          text: `vision result from ${modelId}`,
        });
        expect(createMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            model: modelId,
            messages: [
              {
                role: "user",
                content: [
                  { type: "text", text: "describe the logo" },
                  {
                    type: "image",
                    data: "AQIDBA==",
                    mimeType: "image/png",
                  },
                ],
              },
            ],
          }),
        );
      } finally {
        loadSettingsSpy.mockRestore();
      }
    },
  );

  it("treats an empty Kimi vision response as recoverable and raises the tiny token budget", async () => {
    const vision = createVisionTools();
    const createMessage = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "" }],
      stopReason: "max_tokens",
    });
    vision.setActiveVisionRouteResolver(() => ({
      provider: {
        type: "openai-compatible",
        createMessage,
        testConnection: vi.fn(),
      },
      modelId: "kimi-k2.6",
    }));
    const loadSettingsSpy = vi
      .spyOn(LLMProviderFactory, "loadSettings")
      .mockReturnValue({
        providerType: "openai-compatible",
        openaiCompatible: {},
      } as Any);

    try {
      const result = await vision.analyzeBuffer({
        base64: "AQIDBA==",
        mimeType: "image/webp",
        prompt: "identify this logo",
        maxTokens: 900,
        toolName: "analyze_image",
      });

      expect(createMessage).toHaveBeenCalledWith(
        expect.objectContaining({ maxTokens: 2_048 }),
      );
      expect(result).toEqual(
        expect.objectContaining({
          success: false,
          nonBlocking: true,
          recoverableFallback: true,
          error: expect.stringContaining("returned no text"),
        }),
      );
    } finally {
      loadSettingsSpy.mockRestore();
    }
  });

  it.each(["azure", "anthropic", "openai", "deepseek"])(
    "keeps the selected Kimi model when a stale tool call guesses provider %s",
    async (providerOverride) => {
      const vision = createVisionTools();
      const createMessage = vi.fn().mockResolvedValue({
        content: [{ type: "text", text: "Kimi inspected the image" }],
        stopReason: "end_turn",
      });
      vision.setActiveVisionRouteResolver(() => ({
        provider: {
          type: "openai-compatible",
          createMessage,
          testConnection: vi.fn(),
        },
        modelId: "kimi-k2.6",
      }));
      const loadSettingsSpy = vi
        .spyOn(LLMProviderFactory, "loadSettings")
        .mockReturnValue({
          providerType: "deepseek",
          deepseek: {
            apiKey: "deepseek-key",
            model: "deepseek-v4-flash",
          },
        } as Any);

      try {
        const result = await vision.analyzeBuffer({
          base64: "AQIDBA==",
          mimeType: "image/png",
          prompt: "assess this logo",
          maxTokens: 128,
          providerOverride,
          modelOverride: "deepseek-v4-flash",
          toolName: "analyze_image",
        });

        expect(result).toEqual({
          success: true,
          provider: "openai-compatible",
          model: "kimi-k2.6",
          text: "Kimi inspected the image",
        });
        expect(createMessage).toHaveBeenCalledWith(
          expect.objectContaining({ model: "kimi-k2.6" }),
        );
      } finally {
        loadSettingsSpy.mockRestore();
      }
    },
  );

  it("honors the manual image-input switch for custom gateway aliases", async () => {
    const vision = createVisionTools();
    const createMessage = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "custom alias vision result" }],
      stopReason: "end_turn",
    });
    vision.setActiveVisionRouteResolver(() => ({
      provider: {
        type: "openai-compatible",
        createMessage,
        testConnection: vi.fn(),
      },
      modelId: "gateway-model-alias-001",
    }));
    const loadSettingsSpy = vi
      .spyOn(LLMProviderFactory, "loadSettings")
      .mockReturnValue({
        providerType: "openai-compatible",
        openaiCompatible: { supportsImages: true },
      } as Any);

    try {
      const result = await vision.analyzeBuffer({
        base64: "AQIDBA==",
        mimeType: "image/png",
        prompt: "read the screenshot",
        maxTokens: 128,
        toolName: "analyze_image",
      });

      expect(result).toEqual(
        expect.objectContaining({
          success: true,
          model: "gateway-model-alias-001",
          text: "custom alias vision result",
        }),
      );
      expect(createMessage).toHaveBeenCalledTimes(1);
    } finally {
      loadSettingsSpy.mockRestore();
    }
  });

  it("falls back to a configured multimodal model when GLM-5.2 refuses an image payload", async () => {
    const vision = createVisionTools();
    const activeCreateMessage = vi.fn().mockResolvedValue({
      content: [
        {
          type: "text",
          text: "抱歉，我无法查看或处理这张图片，因为没有接收到图像数据。",
        },
      ],
      stopReason: "end_turn",
    });
    const fallbackCreateMessage = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "图片中是一位穿深色上衣的男士。" }],
      stopReason: "end_turn",
    });
    vision.setActiveVisionRouteResolver(() => ({
      provider: {
        type: "openai-compatible",
        createMessage: activeCreateMessage,
        testConnection: vi.fn(),
      },
      modelId: "glm-5.2",
    }));
    const loadSettingsSpy = vi
      .spyOn(LLMProviderFactory, "loadSettings")
      .mockReturnValue({
        providerType: "openai-compatible",
        openaiCompatible: {
          model: "glm-5.2",
          supportsImages: true,
        },
        providerModelRegistry: {
          "openai-compatible": {
            models: ["glm-5.2", "kimi-k2.6"],
          },
        },
      } as Any);
    const selectableModelsSpy = vi
      .spyOn(LLMProviderFactory, "getSelectableProviderModelStatus")
      .mockReturnValue({
        currentModel: "glm-5.2",
        models: [
          {
            key: "glm-5.2",
            displayName: "glm-5.2",
            description: "Configured model",
          },
          {
            key: "kimi-k2.6",
            displayName: "kimi-k2.6",
            description: "Configured model",
          },
        ],
      });
    const createProviderSpy = vi
      .spyOn(LLMProviderFactory, "createProvider")
      .mockReturnValue({
        type: "openai-compatible",
        createMessage: fallbackCreateMessage,
        testConnection: vi.fn(),
      });

    try {
      const result = await vision.analyzeBuffer({
        base64: "AQIDBA==",
        mimeType: "image/jpeg",
        prompt: "描述照片中的人物",
        maxTokens: 128,
        toolName: "analyze_image",
      });

      expect(activeCreateMessage).toHaveBeenCalledTimes(1);
      expect(createProviderSpy).toHaveBeenCalledWith({
        type: "openai-compatible",
        model: "kimi-k2.6",
      });
      expect(fallbackCreateMessage).toHaveBeenCalledTimes(1);
      expect(result).toEqual({
        success: true,
        provider: "openai-compatible",
        model: "kimi-k2.6",
        text: "图片中是一位穿深色上衣的男士。",
      });
      expect(vision.daemon.logEvent).toHaveBeenCalledWith(
        "task-1",
        "tool_result",
        expect.objectContaining({
          route: "configured_vision_fallback",
          failedActiveModel: "glm-5.2",
          model: "kimi-k2.6",
        }),
      );
    } finally {
      createProviderSpy.mockRestore();
      selectableModelsSpy.mockRestore();
      loadSettingsSpy.mockRestore();
    }
  });

  it("does not redirect a refused active image request to an unrelated global provider", async () => {
    const vision = createVisionTools();
    const activeCreateMessage = vi.fn().mockResolvedValue({
      content: [
        {
          type: "text",
          text: "I cannot see or process the attached image.",
        },
      ],
      stopReason: "end_turn",
    });
    vision.setActiveVisionRouteResolver(() => ({
      provider: {
        type: "openai-compatible",
        createMessage: activeCreateMessage,
        testConnection: vi.fn(),
      },
      modelId: "glm-5.2",
    }));
    const loadSettingsSpy = vi
      .spyOn(LLMProviderFactory, "loadSettings")
      .mockReturnValue({
        providerType: "deepseek",
        openaiCompatible: { supportsImages: true, model: "glm-5.2" },
        deepseek: {
          apiKey: "deepseek-key",
          model: "deepseek-v4-flash",
        },
      } as Any);
    const selectableModelsSpy = vi
      .spyOn(LLMProviderFactory, "getSelectableProviderModelStatus")
      .mockReturnValue({
        currentModel: "glm-5.2",
        models: [
          {
            key: "glm-5.2",
            displayName: "glm-5.2",
            description: "Configured model",
          },
        ],
      });
    const deepSeekSpy = vi.spyOn(vision, "analyzeWithDeepSeek");

    try {
      const result = await vision.analyzeBuffer({
        base64: "AQIDBA==",
        mimeType: "image/jpeg",
        prompt: "describe the person",
        maxTokens: 128,
        toolName: "analyze_image",
      });

      expect(result).toEqual(
        expect.objectContaining({
          success: false,
          error: expect.stringContaining("vision-refusal response"),
        }),
      );
      expect(deepSeekSpy).not.toHaveBeenCalled();
    } finally {
      deepSeekSpy.mockRestore();
      selectableModelsSpy.mockRestore();
      loadSettingsSpy.mockRestore();
    }
  });

  it("restores a persisted temp-workspace upload before image analysis", async () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), "vision-upload-restore-test-"),
    );
    const previousUserDataDir = process.env.NEOWORKER_USER_DATA_DIR;
    const userDataPath = path.join(root, "user-data");
    const workspacePath = path.join(root, "neoworker-temp", "ui-session-test");
    const relativePath = path.join(".neoworker", "uploads", "123", "image.png");
    const sourcePath = path.join(workspacePath, relativePath);
    fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
    fs.writeFileSync(sourcePath, "png-placeholder");
    persistTempWorkspaceArtifactSync({
      userDataPath,
      workspacePath,
      artifactPath: relativePath,
    });
    fs.rmSync(workspacePath, { recursive: true, force: true });
    process.env.NEOWORKER_USER_DATA_DIR = userDataPath;

    const workspace: Workspace = {
      id: "__temp_workspace__:ui-session-test",
      name: "Temporary Workspace",
      path: workspacePath,
      createdAt: Date.now(),
      permissions: {
        read: true,
        write: true,
        delete: true,
        network: true,
        shell: true,
      },
      isTemp: true,
    };
    const daemon = { logEvent: vi.fn() } as Any;
    const vision = new VisionTools(workspace, daemon, "task-restore") as Any;
    const analyzeBufferSpy = vi
      .spyOn(vision, "analyzeBuffer")
      .mockResolvedValue({
        success: true,
        provider: "deepseek",
        model: "deepseek-v4-flash-vision-exp",
        text: "restored image",
      });

    try {
      const result = await vision.analyzeImage({ path: relativePath });

      expect(result).toEqual(
        expect.objectContaining({
          success: true,
          text: "restored image",
          source_path: relativePath,
        }),
      );
      expect(analyzeBufferSpy).toHaveBeenCalledTimes(1);
      expect(fs.readFileSync(sourcePath, "utf8")).toBe("png-placeholder");
    } finally {
      analyzeBufferSpy.mockRestore();
      if (previousUserDataDir === undefined) {
        delete process.env.NEOWORKER_USER_DATA_DIR;
      } else {
        process.env.NEOWORKER_USER_DATA_DIR = previousUserDataDir;
      }
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("restores a task attachment after the task moves to another temp workspace", async () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), "vision-task-restore-test-"),
    );
    const previousUserDataDir = process.env.NEOWORKER_USER_DATA_DIR;
    const userDataPath = path.join(root, "user-data");
    const originalWorkspacePath = path.join(root, "temp", "ui-session-a");
    const resumedWorkspacePath = path.join(root, "temp", "ui-session-b");
    const relativePath = path.join(".neoworker", "uploads", "123", "image.png");
    const originalPath = path.join(originalWorkspacePath, relativePath);
    fs.mkdirSync(path.dirname(originalPath), { recursive: true });
    fs.writeFileSync(originalPath, "task-png-placeholder");
    persistTaskAttachmentSync({
      userDataPath,
      taskId: "task-cross-workspace",
      workspacePath: originalWorkspacePath,
      artifactPath: relativePath,
    });
    fs.rmSync(originalWorkspacePath, { recursive: true, force: true });
    process.env.NEOWORKER_USER_DATA_DIR = userDataPath;

    const workspace: Workspace = {
      id: "__temp_workspace__:ui-session-b",
      name: "Temporary Workspace",
      path: resumedWorkspacePath,
      createdAt: Date.now(),
      permissions: {
        read: true,
        write: true,
        delete: true,
        network: true,
        shell: true,
      },
      isTemp: true,
    };
    const daemon = { logEvent: vi.fn() } as Any;
    const vision = new VisionTools(
      workspace,
      daemon,
      "task-cross-workspace",
    ) as Any;
    const analyzeBufferSpy = vi
      .spyOn(vision, "analyzeBuffer")
      .mockResolvedValue({
        success: true,
        provider: "deepseek",
        model: "deepseek-v4-flash-vision-exp",
        text: "restored across workspaces",
      });

    try {
      const result = await vision.analyzeImage({ path: relativePath });

      expect(result).toEqual(
        expect.objectContaining({
          success: true,
          text: "restored across workspaces",
        }),
      );
      expect(
        fs.readFileSync(path.join(resumedWorkspacePath, relativePath), "utf8"),
      ).toBe("task-png-placeholder");
    } finally {
      analyzeBufferSpy.mockRestore();
      if (previousUserDataDir === undefined) {
        delete process.env.NEOWORKER_USER_DATA_DIR;
      } else {
        process.env.NEOWORKER_USER_DATA_DIR = previousUserDataDir;
      }
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("marks an unavailable attachment as non-retryable and asks for re-upload", async () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), "vision-missing-attachment-test-"),
    );
    const previousUserDataDir = process.env.NEOWORKER_USER_DATA_DIR;
    process.env.NEOWORKER_USER_DATA_DIR = path.join(root, "user-data");
    const workspace: Workspace = {
      id: "__temp_workspace__:ui-session-missing",
      name: "Temporary Workspace",
      path: path.join(root, "temp", "ui-session-missing"),
      createdAt: Date.now(),
      permissions: {
        read: true,
        write: true,
        delete: true,
        network: true,
        shell: true,
      },
      isTemp: true,
    };
    const vision = new VisionTools(
      workspace,
      { logEvent: vi.fn() } as Any,
      "task-missing",
    ) as Any;

    try {
      const result = await vision.analyzeImage({
        path: ".neoworker/uploads/123/missing.png",
      });
      expect(result).toEqual(
        expect.objectContaining({
          success: false,
          code: "ATTACHMENT_UNAVAILABLE",
          retryable: false,
          nonRetryable: true,
          actionHint: expect.objectContaining({ type: "reupload_attachment" }),
        }),
      );
    } finally {
      if (previousUserDataDir === undefined) {
        delete process.env.NEOWORKER_USER_DATA_DIR;
      } else {
        process.env.NEOWORKER_USER_DATA_DIR = previousUserDataDir;
      }
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("aliases provider=openai to Azure when Azure is configured and no direct OpenAI key exists", async () => {
    const vision = createVisionTools();
    const loadSettingsSpy = vi
      .spyOn(LLMProviderFactory, "loadSettings")
      .mockReturnValue({
        providerType: "azure",
        azure: {
          apiKey: "azure-key",
          endpoint: "https://example.openai.azure.com",
          deployment: "gpt-4.1-mini",
        },
        openai: {
          apiKey: "",
        },
      } as Any);
    const azureSpy = vi
      .spyOn(vision, "analyzeWithAzureOpenAI")
      .mockResolvedValue("Azure alias result");

    try {
      const result = await vision.analyzeBuffer({
        base64: "AA==",
        mimeType: "image/png",
        prompt: "describe the page",
        maxTokens: 64,
        providerOverride: "openai",
        toolName: "read_pdf_visual",
      });

      expect(azureSpy).toHaveBeenCalledTimes(1);
      expect(result).toEqual({
        success: true,
        provider: "azure",
        model: "gpt-4.1-mini",
        text: "Azure alias result",
      });
    } finally {
      azureSpy.mockRestore();
      loadSettingsSpy.mockRestore();
    }
  });

  it("does not fall back to Gemini when the active vision provider is unavailable", async () => {
    const vision = createVisionTools();
    const loadSettingsSpy = vi
      .spyOn(LLMProviderFactory, "loadSettings")
      .mockReturnValue({
        providerType: "openai",
        openai: { apiKey: "" },
        gemini: { apiKey: "gemini-key", model: "gemini-2.0-flash" },
      } as Any);

    try {
      const result = await vision.analyzeBuffer({
        base64: "AA==",
        mimeType: "image/png",
        prompt: "describe the page",
        maxTokens: 64,
        toolName: "analyze_image",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("OpenAI credentials not configured");
      expect(result.error).not.toContain("Gemini");
    } finally {
      loadSettingsSpy.mockRestore();
    }
  });

  it("uses ChatGPT subscription OAuth tokens for OpenAI vision when no API key is configured", async () => {
    const vision = createVisionTools();
    const loadSettingsSpy = vi
      .spyOn(LLMProviderFactory, "loadSettings")
      .mockReturnValue({
        providerType: "openai",
        openai: {
          apiKey: "",
          authMethod: "oauth",
          accessToken: "access-token",
          refreshToken: "refresh-token",
          tokenExpiresAt: Date.now() + 60_000,
          model: "gpt-5.5",
        },
      } as Any);
    const oauthSpy = vi
      .spyOn(vision, "analyzeWithOpenAIOAuth")
      .mockResolvedValue("ChatGPT subscription vision result");

    try {
      const result = await vision.analyzeBuffer({
        base64: "AA==",
        mimeType: "image/png",
        prompt: "describe the image",
        maxTokens: 64,
        toolName: "analyze_image",
      });

      expect(oauthSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          accessToken: "access-token",
          refreshToken: "refresh-token",
          model: "gpt-5.5",
          mimeType: "image/png",
        }),
      );
      expect(result).toEqual({
        success: true,
        provider: "openai",
        model: "gpt-5.5",
        text: "ChatGPT subscription vision result",
      });
    } finally {
      oauthSpy.mockRestore();
      loadSettingsSpy.mockRestore();
    }
  });

  it("asks the user to switch when Gemini is the active provider for image analysis", async () => {
    const vision = createVisionTools();
    const loadSettingsSpy = vi
      .spyOn(LLMProviderFactory, "loadSettings")
      .mockReturnValue({
        providerType: "gemini",
        gemini: { apiKey: "gemini-key", model: "gemini-2.0-flash" },
      } as Any);

    try {
      const result = await vision.analyzeBuffer({
        base64: "AA==",
        mimeType: "image/png",
        prompt: "describe the page",
        maxTokens: 64,
        providerOverride: "gemini",
        toolName: "analyze_image",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain(
        "Switch to an image-capable model/provider",
      );
      expect(result.nonBlocking).toBe(true);
      expect(result.actionHint).toBeUndefined();
    } finally {
      loadSettingsSpy.mockRestore();
    }
  });
});
