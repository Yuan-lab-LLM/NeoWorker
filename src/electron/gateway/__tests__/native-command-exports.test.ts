import { describe, expect, it, vi } from "vitest";

vi.mock("@slack/bolt", () => ({
  App: vi.fn(),
  LogLevel: { WARN: "warn" },
  SocketModeReceiver: vi.fn().mockImplementation(() => ({
    client: {},
  })),
}));

import { buildDiscordSlashCommands } from "../channels/discord";
import { mapSlackSlashCommandToText, SlackAdapter } from "../channels/slack";
import { buildTelegramBotCommands } from "../channels/telegram";

describe("native command exports", () => {
  it("builds Telegram bot commands from the shared remote registry", () => {
    const names = buildTelegramBotCommands().map((command) => command.command);

    expect(names).toContain("new");
    expect(names).toContain("stop");
    expect(names).toContain("commands");
    expect(names).toContain("queue");
    expect(names).toContain("steer");
    expect(names).toContain("background");
    expect(names).toContain("skills");
  });

  it("builds Discord slash commands for core lifecycle controls", () => {
    const commands = buildDiscordSlashCommands().map((command) => command.toJSON());
    const byName = new Map(commands.map((command) => [command.name, command]));

    expect(byName.has("new")).toBe(true);
    expect(byName.has("stop")).toBe(true);
    expect(byName.has("commands")).toBe(true);
    expect(byName.has("queue")).toBe(true);
    expect(byName.has("steer")).toBe(true);
    expect(byName.has("background")).toBe(true);
    expect(byName.has("skills")).toBe(true);
    expect(byName.has("task")).toBe(true);

    expect(byName.get("new")?.options?.[0]?.name).toBe("mode");
    expect(byName.get("queue")?.options?.[0]?.name).toBe("message");
    expect(byName.get("task")?.options?.[0]?.name).toBe("prompt");
  });

  it("maps Slack slash command payloads to router command text", () => {
    expect(mapSlackSlashCommandToText("/new", "temp")).toBe("/new temp");
    expect(mapSlackSlashCommandToText("stop", "")).toBe("/stop");
  });

  it("converts markdown consistently when editing Slack messages", async () => {
    const adapter = new SlackAdapter({
      botToken: "xoxb-test",
      appToken: "xapp-test",
    } as Any);
    const update = vi.fn().mockResolvedValue({});
    (adapter as Any).app = {
      client: {
        chat: { update },
      },
    };
    (adapter as Any)._status = "connected";

    await adapter.editMessage("C123", "111.222", "**Done** [Open](https://example.com)");

    expect(update).toHaveBeenCalledWith({
      channel: "C123",
      ts: "111.222",
      text: "*Done* <https://example.com|Open>",
    });
  });
});
