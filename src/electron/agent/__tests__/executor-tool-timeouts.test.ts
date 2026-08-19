import { describe, expect, it, vi } from "vitest";
import { TaskExecutor } from "../executor";
import { withTimeout } from "../executor-helpers";
import { BuiltinToolsSettingsManager } from "../tools/builtin-settings";

vi.mock("electron", () => ({
  app: {
    getPath: vi.fn().mockReturnValue("/tmp"),
  },
}));

vi.mock("../../settings/personality-manager", () => ({
  PersonalityManager: {
    getPersonalityPrompt: vi.fn().mockReturnValue(""),
    getIdentityPrompt: vi.fn().mockReturnValue(""),
  },
}));

vi.mock("../../memory/MemoryService", () => ({
  MemoryService: {
    getContextForInjection: vi.fn().mockReturnValue(""),
  },
}));

describe("TaskExecutor getToolTimeoutMs", () => {
  it("gives orchestrate_agents enough time to wait for child agents", () => {
    const executor = Object.create(TaskExecutor.prototype) as Any;
    executor.task = { agentConfig: { deepWorkMode: false } };

    const timeoutSpy = vi
      .spyOn(BuiltinToolsSettingsManager, "getToolTimeoutMs")
      .mockReturnValue(null);

    const timeoutMs = executor.getToolTimeoutMs("orchestrate_agents", {
      timeout_seconds: 300,
    });

    expect(timeoutMs).toBe(302_000);
    timeoutSpy.mockRestore();
  });

  it("uses a long timeout window for request_user_input by default", () => {
    const executor = Object.create(TaskExecutor.prototype) as Any;
    executor.task = { agentConfig: { deepWorkMode: false } };

    const timeoutSpy = vi
      .spyOn(BuiltinToolsSettingsManager, "getToolTimeoutMs")
      .mockReturnValue(null);

    const timeoutMs = executor.getToolTimeoutMs("request_user_input", {
      questions: [
        {
          id: "delivery_mode",
          question: "Choose delivery mode",
          options: [{ label: "A", description: "A" }, { label: "B", description: "B" }],
        },
      ],
    });

    expect(timeoutMs).toBe(86_400_000);
    timeoutSpy.mockRestore();
  });

  it("uses a longer default timeout for run_command", () => {
    const executor = Object.create(TaskExecutor.prototype) as Any;
    executor.task = { agentConfig: { deepWorkMode: false } };

    const timeoutSpy = vi
      .spyOn(BuiltinToolsSettingsManager, "getToolTimeoutMs")
      .mockReturnValue(null);

    const timeoutMs = executor.getToolTimeoutMs("run_command", {
      command: "git status",
    });

    expect(timeoutMs).toBe(120_000);
    timeoutSpy.mockRestore();
  });

  it("keeps Office generation alive while approval is pending", () => {
    const executor = Object.create(TaskExecutor.prototype) as Any;
    executor.task = { agentConfig: { deepWorkMode: false } };

    const timeoutSpy = vi
      .spyOn(BuiltinToolsSettingsManager, "getToolTimeoutMs")
      .mockReturnValue(null);

    expect(
      executor.getToolTimeoutMs("generate_presentation", {
        filename: "report.pptx",
      }),
    ).toBe(900_000);
    expect(
      executor.getToolTimeoutMs("create_document", {
        filename: "report",
        format: "docx",
      }),
    ).toBe(900_000);

    timeoutSpy.mockRestore();
  });

  it("does not let a legacy 30s Office setting undercut approval wait", () => {
    const executor = Object.create(TaskExecutor.prototype) as Any;
    executor.task = { agentConfig: { deepWorkMode: false } };

    const timeoutSpy = vi
      .spyOn(BuiltinToolsSettingsManager, "getToolTimeoutMs")
      .mockReturnValue(30_000);

    expect(
      executor.getToolTimeoutMs("generate_presentation", {
        filename: "report.pptx",
      }),
    ).toBe(900_000);

    timeoutSpy.mockRestore();
  });

  it("applies the approval-safe window to every Office mutation alias", () => {
    const executor = Object.create(TaskExecutor.prototype) as Any;
    executor.task = { agentConfig: { deepWorkMode: false } };
    const timeoutSpy = vi
      .spyOn(BuiltinToolsSettingsManager, "getToolTimeoutMs")
      .mockReturnValue(null);

    const officeTools = [
      "create_document",
      "generate_document",
      "edit_document",
      "edit_pdf_region",
      "create_presentation",
      "generate_presentation",
      "create_spreadsheet",
      "generate_spreadsheet",
      "compile_latex",
    ];
    for (const toolName of officeTools) {
      expect(executor.getToolTimeoutMs(toolName, {}), toolName).toBe(900_000);
    }

    timeoutSpy.mockRestore();
  });

  it("does not fail an Office call after the former 30s boundary", async () => {
    vi.useFakeTimers();
    try {
      const executor = Object.create(TaskExecutor.prototype) as Any;
      executor.task = { agentConfig: { deepWorkMode: false } };
      const timeoutSpy = vi
        .spyOn(BuiltinToolsSettingsManager, "getToolTimeoutMs")
        .mockReturnValue(null);
      const timeoutMs = executor.getToolTimeoutMs("generate_presentation", {});
      const delayedApprovalAndRender = withTimeout(
        new Promise<string>((resolve) => setTimeout(() => resolve("generated"), 31_000)),
        timeoutMs,
        "Tool generate_presentation",
      );

      await vi.advanceTimersByTimeAsync(31_000);
      await expect(delayedApprovalAndRender).resolves.toBe("generated");
      timeoutSpy.mockRestore();
    } finally {
      vi.useRealTimers();
    }
  });

  it("preserves a ten-minute render window after the full approval window", async () => {
    vi.useFakeTimers();
    try {
      const executor = Object.create(TaskExecutor.prototype) as Any;
      executor.task = { agentConfig: { deepWorkMode: false } };
      const timeoutSpy = vi
        .spyOn(BuiltinToolsSettingsManager, "getToolTimeoutMs")
        .mockReturnValue(30_000);
      const timeoutMs = executor.getToolTimeoutMs("create_presentation", {});
      const fullApprovalAndLongRender = withTimeout(
        new Promise<string>((resolve) =>
          setTimeout(() => resolve("generated"), 14 * 60 * 1000 + 59_000),
        ),
        timeoutMs,
        "Tool create_presentation",
      );

      await vi.advanceTimersByTimeAsync(14 * 60 * 1000 + 59_000);
      await expect(fullApprovalAndLongRender).resolves.toBe("generated");
      timeoutSpy.mockRestore();
    } finally {
      vi.useRealTimers();
    }
  });

  it("uses the heavy run_command timeout for build and test commands", () => {
    const executor = Object.create(TaskExecutor.prototype) as Any;
    executor.task = { agentConfig: { deepWorkMode: false } };

    const timeoutSpy = vi
      .spyOn(BuiltinToolsSettingsManager, "getToolTimeoutMs")
      .mockReturnValue(null);

    const timeoutMs = executor.getToolTimeoutMs("run_command", {
      command: "npm test",
    });

    expect(timeoutMs).toBe(300_000);
    timeoutSpy.mockRestore();
  });

  it("accepts timeout_seconds aliases for run_command and clamps to shell max", () => {
    const executor = Object.create(TaskExecutor.prototype) as Any;
    executor.task = { agentConfig: { deepWorkMode: false } };

    const timeoutSpy = vi
      .spyOn(BuiltinToolsSettingsManager, "getToolTimeoutMs")
      .mockReturnValue(null);

    const timeoutMs = executor.getToolTimeoutMs("run_command", {
      command: "node scripts/build.js",
      timeout_seconds: 480,
    });

    expect(timeoutMs).toBe(300_000);
    timeoutSpy.mockRestore();
  });

  it("gives image generation enough time to avoid retrying slow provider calls", () => {
    const executor = Object.create(TaskExecutor.prototype) as Any;
    executor.task = { agentConfig: { deepWorkMode: false } };

    const timeoutSpy = vi
      .spyOn(BuiltinToolsSettingsManager, "getToolTimeoutMs")
      .mockReturnValue(null);

    const timeoutMs = executor.getToolTimeoutMs("generate_image", {
      prompt: "snow leopard avatar",
    });

    expect(timeoutMs).toBe(600_000);
    timeoutSpy.mockRestore();
  });
});
