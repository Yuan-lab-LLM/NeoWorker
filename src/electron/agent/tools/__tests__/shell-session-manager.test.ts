import { describe, expect, it } from "vitest";
import { _testUtils } from "../shell-session-manager";

describe("shell-session-manager", () => {
  it("does not use interactive shell startup on Unix sessions", () => {
    if (process.platform === "win32") {
      expect(_testUtils.getShellArgs("powershell.exe")).toEqual(["-NoLogo", "-NoProfile"]);
      expect(_testUtils.getTerminalShellArgs("C:\\Windows\\System32\\cmd.exe")).toEqual(["/Q"]);
      return;
    }

    expect(_testUtils.getShellArgs("/bin/zsh")).toEqual([]);
    expect(_testUtils.getTerminalShellArgs("/bin/zsh")).toEqual([]);
  });
});
