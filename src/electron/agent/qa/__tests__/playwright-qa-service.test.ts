import fs from "fs";
import os from "os";
import path from "path";
import { randomUUID } from "crypto";
import { describe, expect, it, vi } from "vitest";
import { PlaywrightQAService } from "../playwright-qa-service";

function makeWorkspace() {
  const root = path.join(os.tmpdir(), `neoworker-qa-${randomUUID()}`);
  fs.mkdirSync(root, { recursive: true });
  return {
    id: `ws-${randomUUID()}`,
    name: "QA Workspace",
    path: root,
    createdAt: Date.now(),
    permissions: {} as any,
  };
}

describe("PlaywrightQAService", () => {
  it("clears the active run during cleanup", async () => {
    const service = new PlaywrightQAService(makeWorkspace() as any);
    const browserClose = vi.fn().mockResolvedValue(undefined);
    const kill = vi.fn();
    (service as any).browserService = { close: browserClose };
    (service as any).serverProcess = { killed: false, kill };
    (service as any).currentRun = {
      id: "run-1",
      taskId: "task-1",
      status: "idle",
      config: { targetUrl: "http://localhost:3000" },
      checks: [],
      interactionLog: [],
      issues: [],
      fixAttempts: 0,
      durationMs: 0,
      startedAt: Date.now(),
    };

    await service.cleanup();

    expect(browserClose).toHaveBeenCalledOnce();
    expect(kill).toHaveBeenCalledWith("SIGTERM");
    expect(service.getCurrentRun()).toBeNull();
  });
});
