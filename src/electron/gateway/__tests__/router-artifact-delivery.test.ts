import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("better-sqlite3", () => ({
  default: vi.fn().mockImplementation(() => ({
    exec: vi.fn(),
    prepare: vi.fn().mockReturnValue({
      run: vi.fn().mockReturnValue({ changes: 1 }),
      get: vi.fn(),
      all: vi.fn().mockReturnValue([]),
    }),
    close: vi.fn(),
  })),
}));

vi.mock("electron", () => ({
  app: { getPath: vi.fn().mockReturnValue("/tmp/test-neoworker") },
  BrowserWindow: { getAllWindows: vi.fn().mockReturnValue([]) },
}));

import { MessageRouter } from "../router";

function createMockDb() {
  return {
    prepare: vi.fn().mockReturnValue({
      run: vi.fn().mockReturnValue({ changes: 1 }),
      get: vi.fn(),
      all: vi.fn().mockReturnValue([]),
    }),
    transaction: vi.fn((fn: Any) => fn),
  } as Any;
}

const tempDirs: string[] = [];

function createArtifactFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "neoworker-artifacts-"));
  tempDirs.push(root);
  const scratch = path.join(root, ".neoworker", "tmp");
  const inbox = path.join(root, ".neoworker", "inbox", "attachments", "weixin");
  fs.mkdirSync(scratch, { recursive: true });
  fs.mkdirSync(inbox, { recursive: true });
  const finalPdf = path.join(root, "钱学森生平材料.pdf");
  const oldDraft = path.join(root, "钱学森生平材料-旧版.pdf");
  const scratchPdf = path.join(scratch, "latex-min-test.pdf");
  const inboundPdf = path.join(inbox, "用户上传.pdf");
  fs.writeFileSync(finalPdf, "final");
  fs.writeFileSync(oldDraft, "old draft");
  fs.writeFileSync(scratchPdf, "scratch");
  fs.writeFileSync(inboundPdf, "inbound");
  return { finalPdf, oldDraft, scratchPdf, inboundPdf };
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("MessageRouter artifact delivery", () => {
  it("sends only named final WeChat outputs without duplicate caption bubbles", async () => {
    const files = createArtifactFixture();
    const router = new MessageRouter(createMockDb(), {}, undefined);
    (router as Any).artifactRepo.findByTaskId = vi.fn().mockReturnValue([
      {
        id: "scratch",
        taskId: "task-1",
        path: files.scratchPdf,
        mimeType: "application/pdf",
        sha256: "scratch-hash",
        size: 7,
        createdAt: 4,
      },
      {
        id: "final",
        taskId: "task-1",
        path: files.finalPdf,
        mimeType: "application/pdf",
        sha256: "final-hash",
        size: 5,
        createdAt: 3,
      },
      {
        id: "final-duplicate",
        taskId: "task-1",
        path: files.finalPdf,
        mimeType: "application/pdf",
        sha256: "final-hash",
        size: 5,
        createdAt: 2,
      },
      {
        id: "old-draft",
        taskId: "task-1",
        path: files.oldDraft,
        mimeType: "application/pdf",
        sha256: "old-hash",
        size: 9,
        createdAt: 1,
      },
      {
        id: "inbound",
        taskId: "task-1",
        path: files.inboundPdf,
        mimeType: "application/pdf",
        sha256: "inbound-hash",
        size: 7,
        createdAt: 0,
      },
    ]);
    const adapter = {
      type: "weixin",
      sendDocument: vi.fn().mockResolvedValue("message-1"),
      sendPhoto: vi.fn().mockResolvedValue("message-2"),
    } as Any;

    await (router as Any).sendTaskArtifacts(
      "task-1",
      adapter,
      "chat-1",
      "最终文件：`钱学森生平材料.pdf`",
    );

    expect(adapter.sendDocument).toHaveBeenCalledTimes(1);
    expect(adapter.sendDocument).toHaveBeenCalledWith(
      "chat-1",
      files.finalPdf,
      undefined,
    );
    expect(adapter.sendPhoto).not.toHaveBeenCalled();
  });

  it("keeps captions for channels that can attach them to the file bubble", async () => {
    const files = createArtifactFixture();
    const router = new MessageRouter(createMockDb(), {}, undefined);
    (router as Any).artifactRepo.findByTaskId = vi.fn().mockReturnValue([
      {
        id: "final",
        taskId: "task-2",
        path: files.finalPdf,
        mimeType: "application/pdf",
        sha256: "final-hash",
        size: 5,
        createdAt: 1,
      },
    ]);
    const adapter = {
      type: "telegram",
      sendDocument: vi.fn().mockResolvedValue("message-1"),
    } as Any;

    await (router as Any).sendTaskArtifacts(
      "task-2",
      adapter,
      "chat-2",
      "钱学森生平材料.pdf",
    );

    expect(adapter.sendDocument).toHaveBeenCalledWith(
      "chat-2",
      files.finalPdf,
      "📎 钱学森生平材料.pdf",
    );
  });

  it("sends only current-turn artifacts once when completion events overlap", async () => {
    const files = createArtifactFixture();
    const duplicateDir = path.join(path.dirname(files.finalPdf), "rendered");
    fs.mkdirSync(duplicateDir, { recursive: true });
    const duplicateName = path.join(duplicateDir, path.basename(files.finalPdf));
    fs.writeFileSync(duplicateName, "second render of the same named output");

    const router = new MessageRouter(createMockDb(), {}, undefined);
    (router as Any).artifactRepo.findByTaskId = vi.fn().mockReturnValue([
      {
        id: "current-newest",
        taskId: "task-3",
        path: files.finalPdf,
        mimeType: "application/pdf",
        sha256: "current-hash",
        size: 5,
        createdAt: 30,
      },
      {
        id: "current-same-name-copy",
        taskId: "task-3",
        path: duplicateName,
        mimeType: "application/pdf",
        sha256: "different-render-hash",
        size: 38,
        createdAt: 20,
      },
      {
        id: "previous-turn",
        taskId: "task-3",
        path: files.oldDraft,
        mimeType: "application/pdf",
        sha256: "previous-turn-hash",
        size: 9,
        createdAt: 5,
      },
    ]);
    const adapter = {
      type: "weixin",
      sendDocument: vi.fn().mockResolvedValue("message-1"),
    } as Any;
    (router as Any).pendingTaskResponses.set("task-3", {
      adapter,
      channelId: "channel-3",
      chatId: "chat-3",
      sessionId: "session-3",
      artifactDeliveryStartedAt: 10,
      deliveredArtifactKeys: new Set<string>(),
    });

    await Promise.all([
      (router as Any).sendTaskArtifacts("task-3", adapter, "chat-3"),
      (router as Any).sendTaskArtifacts("task-3", adapter, "chat-3"),
    ]);

    expect(adapter.sendDocument).toHaveBeenCalledTimes(1);
    expect(adapter.sendDocument).toHaveBeenCalledWith(
      "chat-3",
      files.finalPdf,
      undefined,
    );
  });
});
