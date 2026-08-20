import { describe, expect, it } from "vitest";
import { normalizeRemoteIncomingCommand } from "../remote-command-normalizer";

describe("normalizeRemoteIncomingCommand", () => {
  it("canonicalizes slash aliases for any gateway channel", () => {
    expect(
      normalizeRemoteIncomingCommand({
        channelType: "slack",
        text: "/stop now",
      }),
    ).toEqual({
      text: "/cancel now",
      source: "slash",
      canonicalCommand: "/cancel",
    });

    expect(
      normalizeRemoteIncomingCommand({
        channelType: "telegram",
        text: "/new temp",
      }).text,
    ).toBe("/newtask temp");
  });

  it("keeps unknown slash commands explicit for router unknown-command handling", () => {
    expect(
      normalizeRemoteIncomingCommand({
        channelType: "discord",
        text: "/not-a-command value",
      }),
    ).toEqual({
      text: "/not-a-command value",
      source: "slash",
    });
  });

  it("keeps non-command text as plain task text", () => {
    expect(
      normalizeRemoteIncomingCommand({
        channelType: "telegram",
        text: "please update the docs",
      }),
    ).toEqual({
      text: "please update the docs",
      source: "plain",
    });
  });
});
