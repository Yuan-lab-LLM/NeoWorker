import { describe, expect, it } from "vitest";
import {
  getMessageAppShortcut,
  isValidSlashCommandName,
  parseLeadingMessageAppShortcut,
} from "../message-shortcuts";

describe("message shortcuts", () => {
  it("recognizes deterministic app shortcut commands", () => {
    const result = parseLeadingMessageAppShortcut("/plan migrate the docs");
    expect(result.matched).toBe(true);
    expect(result.shortcut?.name).toBe("plan");
    expect(result.args).toBe("migrate the docs");
    expect(parseLeadingMessageAppShortcut("/goal ship the release").shortcut?.name).toBe("goal");
    expect(parseLeadingMessageAppShortcut("/multitask 6 audit performance").shortcut?.name).toBe(
      "multitask",
    );
    expect(parseLeadingMessageAppShortcut("/review all uncommitted fixes")).toMatchObject({
      matched: true,
      args: "all uncommitted fixes",
      shortcut: expect.objectContaining({ name: "review", action: "review" }),
    });
    expect(parseLeadingMessageAppShortcut("/side how is it going?")).toMatchObject({
      matched: true,
      args: "how is it going?",
      shortcut: expect.objectContaining({ name: "side", action: "side" }),
    });
  });

  it("does not match unknown slash commands", () => {
    expect(parseLeadingMessageAppShortcut("/geo-quick https://example.com").matched).toBe(false);
  });

  it("validates visible slash command tokens", () => {
    expect(isValidSlashCommandName("geo-quick")).toBe(true);
    expect(isValidSlashCommandName("codex-security:security-scan")).toBe(true);
    expect(isValidSlashCommandName("GEO Quick")).toBe(false);
    expect(isValidSlashCommandName("-geo")).toBe(false);
    expect(isValidSlashCommandName("codex-security:")).toBe(false);
    expect(isValidSlashCommandName("codex-security:bad token")).toBe(false);
    expect(isValidSlashCommandName("codex-security:security:scan")).toBe(false);
  });

  it("looks up commands with or without a slash prefix", () => {
    expect(getMessageAppShortcut("/clear")?.action).toBe("clear");
    expect(getMessageAppShortcut("schedule")?.action).toBe("insert");
  });
});
