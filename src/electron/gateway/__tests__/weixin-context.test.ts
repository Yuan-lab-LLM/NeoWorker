import { beforeEach, describe, expect, it, vi } from "vitest";

const settings = vi.hoisted(() => new Map<string, object>());
vi.mock("../../database/SecureSettingsRepository", () => ({ SecureSettingsRepository: {
  isInitialized: () => true,
  getInstance: () => ({ load: (key: string) => structuredClone(settings.get(key)),
    save: (key: string, value: object) => settings.set(key, structuredClone(value)) }),
} }));
import { WeixinAdapter } from "../channels/weixin";

describe("WeChat scheduled delivery after restart", () => {
  beforeEach(() => { settings.clear(); vi.unstubAllGlobals(); });
  const config = { enabled: true, accountId: "bot-a", botToken: "test-bot-token", baseUrl: "https://ilinkai.weixin.qq.com" };
  it("restores the latest reply context after disconnect and adapter recreation", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ret: 0, message_id: "delivered" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const first = new WeixinAdapter(config);
    const incoming = { from_user_id: "receiver", message_id: "1", context_token: "reply-v1", item_list: [] };
    await (first as any).handleIncomingMessage(incoming);
    // A replay can carry a rotated context even if its message is deduplicated.
    await (first as any).handleIncomingMessage({ ...incoming, context_token: "reply-v2" });
    await first.disconnect();
    const restarted = new WeixinAdapter(config);
    await expect(restarted.sendMessage({ chatId: "receiver", text: "scheduled result" })).resolves.toBe("delivered");
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).msg.context_token).toBe("reply-v2");
  });
  it("never reuses another bot or recipient's context", async () => {
    const first = new WeixinAdapter(config);
    await (first as any).handleIncomingMessage({ from_user_id: "receiver", message_id: "1", context_token: "context-a", item_list: [] });
    const differentBot = new WeixinAdapter({ ...config, accountId: "bot-b" });
    await expect(differentBot.sendMessage({ chatId: "receiver", text: "result" })).rejects.toThrow("Send a message");
    const sameBot = new WeixinAdapter(config);
    await expect(sameBot.sendMessage({ chatId: "someone-else", text: "result" })).rejects.toThrow("Send a message");
  });
});
