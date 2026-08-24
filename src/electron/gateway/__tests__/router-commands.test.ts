import { describe, expect, it, vi } from "vitest";

vi.mock("better-sqlite3", () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      exec: vi.fn(),
      prepare: vi.fn().mockReturnValue({
        run: vi.fn().mockReturnValue({ changes: 1 }),
        get: vi.fn(),
        all: vi.fn().mockReturnValue([]),
      }),
      close: vi.fn(),
    })),
  };
});

vi.mock("electron", () => ({
  app: {
    getPath: vi.fn().mockReturnValue("/tmp/test-neoworker"),
  },
  BrowserWindow: {
    getAllWindows: vi.fn().mockReturnValue([]),
  },
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

describe("MessageRouter /commands", () => {
  function registerAdapter(router: MessageRouter, adapter: Any, channelId = `${adapter.type}-1`) {
    adapter.status = "connected";
    (router as Any).adapters.set(adapter.type, adapter);
    (router as Any).channelRepo.findByType = vi.fn().mockReturnValue({ id: channelId });
    (router as Any).channelRepo.findById = vi.fn().mockReturnValue({ id: channelId });
    (router as Any).messageRepo.create = vi.fn();
  }

  it("renders generated command highlights", async () => {
    const router = new MessageRouter(createMockDb(), {}, undefined);
    const adapter = {
      type: "whatsapp",
      sendMessage: vi.fn().mockResolvedValue("msg-1"),
    } as Any;
    registerAdapter(router, adapter, "wa-1");

    await (router as Any).handleCommandsCommand(
      adapter,
      { chatId: "chat-1", messageId: "incoming-1" },
      [],
    );

    const text = adapter.sendMessage.mock.calls[0]?.[0]?.text as string;
    expect(text).toContain("/commands");
    expect(text).toContain("/queue");
    expect(text).toContain("/steer");
    expect(text).toContain("/background");
  });

  it("renders a category page", async () => {
    const router = new MessageRouter(createMockDb(), {}, undefined);
    const adapter = {
      type: "whatsapp",
      sendMessage: vi.fn().mockResolvedValue("msg-1"),
    } as Any;
    registerAdapter(router, adapter, "wa-1");

    await (router as Any).handleCommandsCommand(
      adapter,
      { chatId: "chat-1", messageId: "incoming-1" },
      ["task control"],
    );

    const text = adapter.sendMessage.mock.calls[0]?.[0]?.text as string;
    expect(text).toContain("Task Control Commands");
    expect(text).toContain("/stop");
    expect(text).toContain("/queue");
  });

  it("keeps recognized commands out of agent follow-up text on external channels", async () => {
    for (const channelType of ["telegram", "discord", "slack"]) {
      const agentDaemon = {
        sendMessage: vi.fn(),
      };
      const router = new MessageRouter(createMockDb(), {}, agentDaemon as Any);
      const adapter = {
        type: channelType,
        sendMessage: vi.fn().mockResolvedValue(`${channelType}-msg-1`),
      } as Any;
      registerAdapter(router, adapter, `${channelType}-1`);

      await (router as Any).handleCommand(
        adapter,
        {
          chatId: "chat-1",
          messageId: "incoming-1",
          text: "/commands",
        },
        "session-1",
      );

      expect(agentDaemon.sendMessage).not.toHaveBeenCalled();
      expect(adapter.sendMessage).toHaveBeenCalled();
    }
  });

  it("returns unknown-command replies for unknown external slash commands", async () => {
    const router = new MessageRouter(createMockDb(), {}, undefined);
    const adapter = {
      type: "slack",
      sendMessage: vi.fn().mockResolvedValue("slack-msg-1"),
    } as Any;
    registerAdapter(router, adapter, "slack-1");

    await (router as Any).handleCommand(
      adapter,
      {
        chatId: "chat-1",
        messageId: "incoming-1",
        text: "/wat",
      },
      "session-1",
    );

    expect(adapter.sendMessage.mock.calls[0]?.[0]?.text).toContain("Unknown command");
  });

  it("wraps registered adapter sends through the shared delivery service", async () => {
    const router = new MessageRouter(createMockDb(), {}, undefined);
    const rawSendMessage = vi.fn().mockResolvedValue("slack-msg-1");
    const adapter = {
      type: "slack",
      status: "connected",
      sendMessage: rawSendMessage,
      onMessage: vi.fn(),
      onError: vi.fn(),
      onStatusChange: vi.fn(),
    } as Any;
    (router as Any).channelRepo.findById = vi.fn().mockReturnValue({ id: "slack-1" });
    (router as Any).messageRepo.create = vi.fn();

    router.registerAdapter(adapter, "slack-1");

    await adapter.sendMessage({
      chatId: "chat-1",
      text: "hello",
    });

    expect(rawSendMessage).toHaveBeenCalledWith({
      chatId: "chat-1",
      text: "hello",
    });
    expect((router as Any).messageRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        channelId: "slack-1",
        channelMessageId: "slack-msg-1",
        chatId: "chat-1",
        direction: "outgoing",
        content: "hello",
      }),
    );
  });

  it("aliases /stop to task cancellation on external channels", async () => {
    for (const channelType of ["telegram", "discord", "slack"]) {
      const agentDaemon = {
        cancelTask: vi.fn().mockResolvedValue(undefined),
      };
      const router = new MessageRouter(createMockDb(), {}, agentDaemon as Any);
      const adapter = {
        type: channelType,
        sendMessage: vi.fn().mockResolvedValue(`${channelType}-msg-1`),
      } as Any;
      registerAdapter(router, adapter, `${channelType}-1`);
      (router as Any).sessionRepo.findById = vi.fn().mockReturnValue({
        id: "session-1",
        taskId: "task-1",
      });
      (router as Any).taskRepo.findById = vi.fn().mockReturnValue({
        id: "task-1",
        status: "executing",
      });

      await (router as Any).handleCommand(
        adapter,
        {
          chatId: "chat-1",
          messageId: "incoming-1",
          text: "/stop",
        },
        "session-1",
      );

      expect(agentDaemon.cancelTask).toHaveBeenCalledWith("task-1");
      expect((router as Any).suppressedTaskUpdateIds.has("task-1")).toBe(true);
    }
  });

  it("aliases /new to unlink without cancelling and suppresses stale updates", async () => {
    for (const channelType of ["telegram", "discord", "slack"]) {
      const agentDaemon = {
        cancelTask: vi.fn(),
      };
      const router = new MessageRouter(createMockDb(), {}, agentDaemon as Any);
      const adapter = {
        type: channelType,
        sendMessage: vi.fn().mockResolvedValue(`${channelType}-msg-1`),
      } as Any;
      registerAdapter(router, adapter, `${channelType}-1`);
      (router as Any).sessionRepo.findById = vi.fn().mockReturnValue({
        id: "session-1",
        taskId: "task-1",
      });
      (router as Any).sessionManager.unlinkSessionFromTask = vi.fn();
      (router as Any).pendingTaskResponses.set("task-1", {
        adapter,
        channelId: `${channelType}-1`,
        chatId: "chat-1",
        sessionId: "session-1",
      });

      await (router as Any).handleCommand(
        adapter,
        {
          chatId: "chat-1",
          messageId: "incoming-1",
          text: "/new",
        },
        "session-1",
      );

      expect(agentDaemon.cancelTask).not.toHaveBeenCalled();
      expect((router as Any).sessionManager.unlinkSessionFromTask).toHaveBeenCalledWith(
        "session-1",
      );

      await router.sendTaskUpdate("task-1", "Planning the work.");
      expect(adapter.sendMessage).toHaveBeenCalledTimes(1);
    }
  });
});
