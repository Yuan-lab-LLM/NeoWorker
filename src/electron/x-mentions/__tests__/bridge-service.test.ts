import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { XMentionBridgeService } from "../bridge-service";
import { getXMentionTriggerStatusStore } from "../status";

const createTaskFromAgentActionMock = vi.fn();
const loadSettingsMock = vi.fn();
const checkBirdInstalledMock = vi.fn();
const runBirdCommandMock = vi.fn();

vi.mock("../../hooks/agent-ingress", () => ({
  initializeHookAgentIngress: () => ({
    createTaskFromAgentAction: (...args: unknown[]) => createTaskFromAgentActionMock(...args),
  }),
}));

vi.mock("../../settings/x-manager", () => ({
  XSettingsManager: {
    loadSettings: () => loadSettingsMock(),
  },
}));

vi.mock("../../utils/x-cli", () => ({
  checkBirdInstalled: () => checkBirdInstalledMock(),
  runBirdCommand: (...args: unknown[]) => runBirdCommandMock(...args),
}));

describe("XMentionBridgeService", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    getXMentionTriggerStatusStore().reset();
    loadSettingsMock.mockReturnValue({
      enabled: true,
      authMethod: "browser",
      mentionTrigger: {
        enabled: true,
        commandPrefix: "do:",
        allowedAuthors: ["tomosman"],
        pollIntervalSec: 60,
        fetchCount: 25,
        workspaceMode: "temporary",
      },
    });
    checkBirdInstalledMock.mockResolvedValue({ installed: true });
    runBirdCommandMock.mockResolvedValue({
      data: [
        {
          id: "tweet-1",
          text: "@agent do: run task",
          author: { username: "tomosman" },
          createdAt: new Date("2026-02-28T08:05:00Z").toISOString(),
        },
      ],
    });
    createTaskFromAgentActionMock.mockResolvedValue({ taskId: "task-1" });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    getXMentionTriggerStatusStore().reset();
  });

  it("skips polling when native channel is enabled", async () => {
    const service = new XMentionBridgeService({} as Any, {
      isNativeXChannelEnabled: () => true,
    });

    service.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(runBirdCommandMock).not.toHaveBeenCalled();
    expect(createTaskFromAgentActionMock).not.toHaveBeenCalled();

    service.stop();
  });

  it("keeps polling after bird failures", async () => {
    runBirdCommandMock
      .mockRejectedValueOnce(new Error("rate limit"))
      .mockResolvedValueOnce({ data: [] });

    const service = new XMentionBridgeService({} as Any, {
      isNativeXChannelEnabled: () => false,
    });

    service.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(runBirdCommandMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(runBirdCommandMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(runBirdCommandMock).toHaveBeenCalledTimes(2);

    service.stop();
  });

  it("suppresses repeated bridge timeout failure logs while keeping backoff polling", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    runBirdCommandMock.mockRejectedValue(
      new Error("Command failed: bird --timeout 20000 mentions: timed out"),
    );

    const service = new XMentionBridgeService({} as Any, {
      isNativeXChannelEnabled: () => false,
    });

    service.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(120_000);
    await vi.advanceTimersByTimeAsync(120_000);

    expect(runBirdCommandMock).toHaveBeenCalledTimes(6);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toContain("Bridge poll failed (timeout)");

    service.stop();
  });

  it("backs off aggressively after unsupported JSON failures", async () => {
    runBirdCommandMock.mockResolvedValueOnce({
      stdout: "@agent do: run task",
      jsonFallbackUsed: true,
    });

    const service = new XMentionBridgeService({} as Any, {
      isNativeXChannelEnabled: () => false,
    });

    service.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(runBirdCommandMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(runBirdCommandMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(25 * 60_000);
    expect(runBirdCommandMock).toHaveBeenCalledTimes(2);

    service.stop();
  });

  it("surfaces unsupported JSON mode without creating tasks", async () => {
    runBirdCommandMock.mockResolvedValueOnce({
      stdout: "@agent do: run task",
      jsonFallbackUsed: true,
    });

    const service = new XMentionBridgeService({} as Any, {
      isNativeXChannelEnabled: () => false,
    });

    service.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(createTaskFromAgentActionMock).not.toHaveBeenCalled();

    service.stop();
  });

  it("marks the bridge as not running while backing off after auth failures", async () => {
    runBirdCommandMock.mockRejectedValueOnce(
      new Error("Command failed: bird --cookie-source chrome: Missing auth_token"),
    );

    const service = new XMentionBridgeService({} as Any, {
      isNativeXChannelEnabled: () => false,
    });

    service.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(60 * 60_000);

    expect(getXMentionTriggerStatusStore().snapshot()).toMatchObject({
      mode: "bridge",
      running: false,
      lastError: expect.stringContaining("Missing auth_token"),
    });
    expect(runBirdCommandMock).toHaveBeenCalledTimes(1);

    service.stop();
  });

  it("resumes polling after auth is refreshed and triggerNow is invoked", async () => {
    runBirdCommandMock
      .mockRejectedValueOnce(
        new Error("Command failed: bird --cookie-source chrome: Missing auth_token"),
      )
      .mockResolvedValueOnce({ data: [] });

    const service = new XMentionBridgeService({} as Any, {
      isNativeXChannelEnabled: () => false,
    });

    service.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(runBirdCommandMock).toHaveBeenCalledTimes(1);

    service.triggerNow();
    await vi.advanceTimersByTimeAsync(0);
    expect(runBirdCommandMock).toHaveBeenCalledTimes(2);

    service.stop();
  });
});
