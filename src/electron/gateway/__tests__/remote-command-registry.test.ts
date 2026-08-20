import { describe, expect, it } from "vitest";
import {
  getCanonicalRemoteCommand,
  listNativeRemoteCommands,
  listRemoteCommands,
  resolveRemoteCommand,
} from "../remote-command-registry";

describe("RemoteCommandRegistry", () => {
  it("aliases /stop to /cancel", () => {
    expect(getCanonicalRemoteCommand("/stop")).toBe("/cancel");
    expect(resolveRemoteCommand("/stop")?.activeTaskPolicy).toBe("cancelTask");
  });

  it("aliases /new to /newtask", () => {
    expect(getCanonicalRemoteCommand("/new")).toBe("/newtask");
    expect(getCanonicalRemoteCommand("/reset")).toBe("/newtask");
    expect(resolveRemoteCommand("/new")?.activeTaskPolicy).toBe("unlinkTask");
  });

  it("aliases Hermes-style task flow commands", () => {
    expect(getCanonicalRemoteCommand("/btw")).toBe("/background");
    expect(getCanonicalRemoteCommand("/bg")).toBe("/background");
    expect(getCanonicalRemoteCommand("/q")).toBe("/queue");
    expect(getCanonicalRemoteCommand("/branch")).toBe("/fork");
    expect(getCanonicalRemoteCommand("/agents")).toBe("/agent");
  });

  it("exposes command metadata for generated command lists", () => {
    const commands = listRemoteCommands();
    const queue = commands.find((command) => command.name === "queue");
    expect(queue?.category).toBe("Task Control");
    expect(queue?.argsHint).toBe("[clear|prompt]");
  });

  it("exports registry-backed native command metadata for chat platform menus", () => {
    const commands = listNativeRemoteCommands();
    const names = commands.map((command) => command.name);

    expect(names).toContain("new");
    expect(names).toContain("stop");
    expect(names).toContain("commands");
    expect(names).toContain("queue");
    expect(names).toContain("steer");
    expect(names).toContain("background");
    expect(names).toContain("skills");
    expect(names).not.toContain("react-best-practices");

    expect(commands.find((command) => command.name === "stop")?.canonicalName).toBe("cancel");
    expect(commands.find((command) => command.name === "new")?.canonicalName).toBe("newtask");
  });

  it("does not resolve unknown slash commands", () => {
    expect(getCanonicalRemoteCommand("/does-not-exist")).toBeUndefined();
  });
});
