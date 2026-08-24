import { afterEach, describe, expect, it, vi } from "vitest";
import { DingTalkAdapter } from "../channels/dingtalk";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("DingTalkAdapter", () => {
  it("converts DingTalk Stream robot text into a gateway message", async () => {
    const adapter = new DingTalkAdapter({
      enabled: true,
      clientId: "ding-client",
      clientSecret: "ding-secret",
    });
    const handler = vi.fn();
    adapter.onMessage(handler);

    await (adapter as Any).handleRobotMessage({
      headers: { messageId: "stream-message" },
      data: JSON.stringify({
        conversationId: "conversation-1",
        chatbotCorpId: "corp",
        chatbotUserId: "bot-user",
        msgId: "message-1",
        senderNick: "Allen",
        isAdmin: false,
        senderStaffId: "staff-1",
        sessionWebhookExpiredTime: Date.now() + 60_000,
        createAt: Date.now(),
        senderCorpId: "corp",
        conversationType: "2",
        senderId: "sender-1",
        sessionWebhook: "https://example.test/session-webhook",
        robotCode: "robot-code",
        msgtype: "text",
        text: { content: "  hello from DingTalk  " },
      }),
    });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "dingtalk",
        messageId: "message-1",
        userId: "staff-1",
        userName: "Allen",
        chatId: "conversation-1",
        isGroup: true,
        text: "hello from DingTalk",
      }),
    );
  });

  it("replies through the session webhook captured from an incoming message", async () => {
    const adapter = new DingTalkAdapter({
      enabled: true,
      clientId: "ding-client",
      clientSecret: "ding-secret",
      responsePrefix: "NeoWorker:",
    });
    (adapter as Any).sessionWebhooks.set("conversation-1", {
      url: "https://example.test/session-webhook",
      expiresAt: Date.now() + 60_000,
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ errcode: 0, messageId: "reply-1" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const messageId = await adapter.sendMessage({
      chatId: "conversation-1",
      text: "Done",
    });

    expect(messageId).toBe("reply-1");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.test/session-webhook",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          msgtype: "text",
          text: { content: "NeoWorker: Done" },
        }),
      }),
    );
  });

  it("does not pretend to send when DingTalk has no active session webhook", async () => {
    const adapter = new DingTalkAdapter({
      enabled: true,
      clientId: "ding-client",
      clientSecret: "ding-secret",
    });

    await expect(
      adapter.sendMessage({ chatId: "missing", text: "Hello" }),
    ).rejects.toThrow("session webhook is unavailable or expired");
  });
});
