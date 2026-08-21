import { describe, expect, it, vi } from "vitest";
import { TaskExecutor } from "../executor";

describe("TaskExecutor image attachment routing", () => {
  it("emits a user-facing switch-model message when the active provider cannot accept images", async () => {
    const executor = Object.create(TaskExecutor.prototype) as Any;
    executor.provider = { type: "deepseek" };
    executor.modelId = "deepseek-chat";
    executor.emitEvent = vi.fn();
    executor.ensureProviderFailoverSelectionsContext = vi.fn();

    await expect(
      executor.buildUserContent("What is in this image?", [
        {
          data: "AA==",
          mimeType: "image/png",
          filename: "image.png",
          sizeBytes: 2,
        },
      ]),
    ).rejects.toThrow(
      "User action required: I can't analyze attached images with the current model.",
    );
    expect(executor.emitEvent).toHaveBeenCalledWith("assistant_message", {
      message:
        "I can't analyze attached images with the current model. Switch to an image-capable model/provider and resend the image.",
    });
  });

  it("passes images through for a DeepSeek vision model", async () => {
    const executor = Object.create(TaskExecutor.prototype) as Any;
    executor.provider = { type: "deepseek" };
    executor.modelId = "deepseek-v4-flash-vision-exp";
    executor.emitEvent = vi.fn();
    executor.ensureProviderFailoverSelectionsContext = vi.fn();

    const result = await executor.buildUserContent("What is in this image?", [
      {
        data: "AA==",
        mimeType: "image/png",
        filename: "image.png",
        sizeBytes: 2,
      },
    ]);

    expect(result).toEqual([
      { type: "text", text: "What is in this image?" },
      {
        type: "image",
        data: "AA==",
        mimeType: "image/png",
        originalSizeBytes: 2,
      },
    ]);
    expect(executor.emitEvent).not.toHaveBeenCalledWith(
      "assistant_message",
      expect.anything(),
    );
  });

  it("proactively switches to an image-capable fallback before building visual content", () => {
    const executor = Object.create(TaskExecutor.prototype) as Any;
    executor.provider = { type: "deepseek" };
    executor.modelId = "deepseek-chat";
    executor.modelKey = "deepseek-chat";
    executor.llmProfileUsed = "balanced";
    executor.resolvedModelKey = "deepseek-chat";
    executor.providerFailoverRequiresImageInput = false;
    executor.task = { agentConfig: {} };
    executor.emitEvent = vi.fn();
    executor.emitRoutingState = vi.fn();
    executor.hasExplicitTaskRouteOverride = vi.fn().mockReturnValue(false);
    executor.rebuildProviderFailoverSelections = vi.fn(function (this: Any) {
      this.providerFailoverRequiresImageInput = true;
      this.providerFailoverSelections = [
        {
          providerType: "anthropic",
          modelId: "claude-sonnet-4-5",
          modelKey: "sonnet-4-5",
          llmProfileUsed: "strong",
          resolvedModelKey: "sonnet-4-5",
          modelSource: "provider_default",
          warnings: [],
        },
      ];
    });
    executor.applyResolvedProviderSelection = vi.fn(function (
      this: Any,
      selection: Any,
    ) {
      this.provider = { type: selection.providerType };
      this.modelId = selection.modelId;
      this.modelKey = selection.modelKey;
    });

    executor.ensureProviderFailoverSelectionsContext(true);

    expect(executor.applyResolvedProviderSelection).toHaveBeenCalledWith(
      expect.objectContaining({
        providerType: "anthropic",
        modelId: "claude-sonnet-4-5",
      }),
    );
    expect(executor.provider.type).toBe("anthropic");
    expect(executor.emitRoutingState).toHaveBeenCalledWith(
      expect.objectContaining({
        routeReason: "model_capability",
        fallbackOccurred: true,
      }),
    );
  });

  it("classifies an unsupported visual request as a failed user blocker, not partial success", () => {
    const executor = Object.create(TaskExecutor.prototype) as Any;
    executor.buildResultSummary = vi.fn().mockReturnValue("");
    executor.getContentFallback = vi.fn().mockReturnValue("");
    const error = new Error(
      "User action required: current model cannot accept image input.",
    );

    expect(executor.classifyFailure(error)).toBe("user_blocker");
    expect(executor.shouldFinalizeAsPartialSuccess(error)).toBe(false);
  });

  it("turns mp4 video attachments into video notes plus extracted image frames", async () => {
    const executor = Object.create(TaskExecutor.prototype) as Any;
    executor.provider = { type: "openai" };
    executor.emitEvent = vi.fn();
    executor.ensureProviderFailoverSelectionsContext = vi.fn();
    executor.buildVideoAttachmentContent = vi.fn().mockResolvedValue({
      note: 'Video attachment "clip.mp4" is available at /tmp/clip.mp4. I extracted 1 representative frame.',
      images: [
        {
          type: "image",
          data: "AA==",
          mimeType: "image/jpeg",
          originalSizeBytes: 2,
        },
      ],
    });

    const result = await executor.buildUserContent(
      "What happens in this clip?",
      [
        {
          filePath: "/tmp/clip.mp4",
          mimeType: "video/mp4",
          filename: "clip.mp4",
          sizeBytes: 1024,
        },
      ],
    );

    expect(Array.isArray(result)).toBe(true);
    if (!Array.isArray(result)) return;
    expect(result[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("Video processing notes:"),
    });
    expect(result[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining(
        "Do not inspect the original video with shell",
      ),
    });
    expect(result[1]).toMatchObject({
      type: "image",
      data: "AA==",
      mimeType: "image/jpeg",
      originalSizeBytes: 2,
    });
  });

  it("routes quicktime mov attachments through video frame extraction", async () => {
    const executor = Object.create(TaskExecutor.prototype) as Any;
    executor.provider = { type: "openai" };
    executor.emitEvent = vi.fn();
    executor.ensureProviderFailoverSelectionsContext = vi.fn();
    executor.buildVideoAttachmentContent = vi.fn().mockResolvedValue({
      note: 'Video attachment "clip.mov" is available at /tmp/clip.mov. I extracted 1 representative frame.',
      images: [
        {
          type: "image",
          data: "AA==",
          mimeType: "image/jpeg",
          originalSizeBytes: 2,
        },
      ],
    });

    const result = await executor.buildUserContent(
      "What happens in this clip?",
      [
        {
          filePath: "/tmp/clip.mov",
          mimeType: "video/quicktime",
          filename: "clip.mov",
          sizeBytes: 1024,
        },
      ],
    );

    expect(Array.isArray(result)).toBe(true);
    expect(executor.buildVideoAttachmentContent).toHaveBeenCalledWith(
      expect.objectContaining({
        filePath: "/tmp/clip.mov",
        mimeType: "video/quicktime",
      }),
    );
  });

  it("emits extracted video preview frames as workspace image artifacts", () => {
    const executor = Object.create(TaskExecutor.prototype) as Any;
    executor.workspace = { path: "/workspace" };
    executor.emitEvent = vi.fn();

    const video = {
      filePath: "/workspace/.neoworker/uploads/clip.mp4",
      mimeType: "video/mp4",
      filename: "clip.mp4",
      sizeBytes: 1024,
      videoContactSheetPath:
        "/workspace/.neoworker/video-frames/clip/contact_sheet.jpg",
      videoFramePaths: [
        "/workspace/.neoworker/video-frames/clip/frame_001.jpg",
      ],
    };

    executor.emitVideoPreviewArtifacts(video, "clip.mp4");
    executor.emitVideoPreviewArtifacts(video, "clip.mp4");

    expect(executor.emitEvent).toHaveBeenCalledTimes(2);
    expect(executor.emitEvent).toHaveBeenNthCalledWith(1, "artifact_created", {
      path: ".neoworker/video-frames/clip/contact_sheet.jpg",
      mimeType: "image/jpeg",
      type: "image",
      label: "Video contact sheet: clip.mp4",
      source: "video_attachment",
    });
    expect(executor.emitEvent).toHaveBeenNthCalledWith(2, "artifact_created", {
      path: ".neoworker/video-frames/clip/frame_001.jpg",
      mimeType: "image/jpeg",
      type: "image",
      label: "Video representative frame: clip.mp4",
      source: "video_attachment",
    });
  });
});
