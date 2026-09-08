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


  it("builds a PowerShell wrapper without POSIX-only syntax", () => {
    const wrapper = _testUtils.buildShellWrapper(
      "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
      "Write-Output 'hello'; exit 7",
      "C:\\Work Folder",
      "task:1",
    );
    expect(wrapper).toContain("$__neoworker_cwd = 'C:\\Work Folder'");
    expect(wrapper).toContain("'task:1'");
    expect(wrapper).toContain("[scriptblock]::Create");
    expect(wrapper).toContain("__NEOWORKER_STATE_START__");
    expect(wrapper).toContain("__NEOWORKER_DONE__:");
    expect(wrapper).not.toContain("cat <<");
    expect(wrapper).not.toContain("set +e");
  });

  it("builds a cmd wrapper with Windows state markers", () => {
    const wrapper = _testUtils.buildShellWrapper(
      "C:\\Windows\\System32\\cmd.exe",
      "echo hello",
      "C:\\Work Folder",
      "tab:1",
    );
    expect(wrapper).toContain("cd /d \"C:\\Work Folder\"");
    expect(wrapper).toContain("%CD%");
    expect(wrapper).toContain("%ERRORLEVEL%");
    expect(wrapper).not.toContain("printf");
  });

  it("rehydrates Windows cwd and environment using native shell syntax", () => {
    const snapshot = {
      cwd: "C:\\Work Folder",
      env: { DEMO: "a'b" },
      aliases: { ll: "Get-ChildItem" },
    };
    expect(_testUtils.buildRehydrateCommands(snapshot, "pwsh.exe")).toEqual([
      "Set-Location -LiteralPath 'C:\\Work Folder'",
      "Set-Item -LiteralPath 'Env:DEMO' -Value 'a''b'",
      "Set-Alias -Name 'll' -Value 'Get-ChildItem' -Scope Global -Force",
    ]);
    expect(_testUtils.buildRehydrateCommands(snapshot, "cmd.exe")).toEqual([
      'cd /d "C:\\Work Folder"',
      'set "DEMO=a\'b"',
    ]);
  });
});
