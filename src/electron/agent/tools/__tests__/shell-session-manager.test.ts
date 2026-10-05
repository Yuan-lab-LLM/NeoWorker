import { describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import type { ChildProcess } from "node:child_process";
import { _testUtils } from "../shell-session-manager";
import { ShellSessionManager } from "../shell-session-manager";

describe("shell-session-manager", () => {
  it("finds Node from a Finder-launched persistent shell without terminal startup files", () => {
    const environment = _testUtils.buildPersistentShellEnvironment("/bin/bash", false, "darwin", {
      HOME: "/Users/test", PATH: "/usr/bin:/bin", LANG: "zh_CN.UTF-8",
    });
    const entries = environment.PATH!.split(":");
    expect(entries).toContain("/usr/local/bin");
    expect(entries).toContain("/opt/homebrew/bin");
    expect(entries).toContain("/Users/test/.volta/bin");
    expect(entries.slice(0, 2)).toEqual(["/usr/bin", "/bin"]);
    expect(new Set(entries).size).toBe(entries.length);
  });
  it("does not use interactive shell startup on Unix sessions", () => {
    if (process.platform === "win32") {
      expect(_testUtils.getShellArgs("powershell.exe")).toEqual([
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
      ]);
      expect(_testUtils.getTerminalShellArgs("C:\\Windows\\System32\\cmd.exe")).toEqual(["/Q"]);
      return;
    }

    expect(_testUtils.getShellArgs("/bin/zsh")).toEqual([]);
    expect(_testUtils.getTerminalShellArgs("/bin/zsh")).toEqual([]);
  });

  it("uses PowerShell syntax for Windows persistent commands", () => {
    const wrapper = _testUtils.buildCommandWrapper(
      "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
      "C:\\workspace\\中文目录",
      "Write-Output '中文'; exit 7",
      "task-1:1",
      "win32",
    );
    expect(wrapper).toContain("[System.Convert]::FromBase64String(");
    const encodedWrapper = wrapper.match(/FromBase64String\('([^']+)'\)/)?.[1];
    expect(encodedWrapper).toBeTruthy();
    const decodedWrapper = Buffer.from(encodedWrapper || "", "base64").toString("utf8");
    expect(decodedWrapper).toContain("Set-Location -LiteralPath 'C:\\workspace\\中文目录'");
    expect(decodedWrapper).toContain("__NEOWORKER_DONE__:task-1:1:");
    expect(wrapper).not.toContain("set +e");
    expect(wrapper).not.toContain("eval \"$__neoworker_command\"");
  });

  it("uses cmd syntax when PowerShell is unavailable", () => {
    const wrapper = _testUtils.buildCommandWrapper(
      "C:\\Windows\\System32\\cmd.exe",
      "C:\\workspace files",
      "echo one && echo two",
      "task-1:2",
      "win32",
    );
    expect(wrapper).toContain("@echo off");
    expect(wrapper).toContain('cd /d "C:\\workspace files"');
    expect(wrapper).toContain("echo __NEOWORKER_DONE__:task-1:2:%__NEOWORKER_EXIT%");
    expect(wrapper).not.toContain("printf");
  });

  it("rehydrates Windows cwd and environment without Unix export syntax", () => {
    const snapshot = {
      cwd: "C:\\workspace",
      env: { NEOWORKER_TEST: "中文" },
      aliases: {},
    };
    expect(_testUtils.buildRehydrateCommands(snapshot, "powershell.exe", "win32")).toEqual([
      "Set-Location -LiteralPath 'C:\\workspace'",
      "$env:NEOWORKER_TEST = '中文'",
    ]);
    expect(_testUtils.buildRehydrateCommands(snapshot, "cmd.exe", "win32")).toEqual([
      'cd /d "C:\\workspace"',
      'set "NEOWORKER_TEST=中文"',
    ]);
  });

  it("builds a usable Windows persistent environment when Electron PATH is incomplete", () => {
    const environment = _testUtils.buildPersistentShellEnvironment(
      "D:\\Program Files\\PowerShell\\7\\pwsh.exe",
      false,
      "win32",
      {
        SystemRoot: "D:\\Windows",
        ProgramFiles: "D:\\Program Files",
        APPDATA: "D:\\Users\\tester\\AppData\\Roaming",
        Path: "D:\\workspace\\node_modules\\.bin",
        USERNAME: "tester",
      },
    );

    expect(environment.PATH?.split(";")).toEqual(
      expect.arrayContaining([
        "D:\\Windows\\System32",
        "D:\\Windows\\System32\\Wbem",
        "D:\\Windows\\System32\\WindowsPowerShell\\v1.0",
        "D:\\Program Files\\PowerShell\\7",
        "D:\\Program Files\\nodejs",
        "D:\\Users\\tester\\AppData\\Roaming\\npm",
        "D:\\workspace\\node_modules\\.bin",
      ]),
    );
    expect(environment.COMSPEC).toBe("D:\\Windows\\System32\\cmd.exe");
    expect(environment.PATHEXT).toContain(".CMD");
    expect(environment.TEMP).toBe("D:\\Windows\\Temp");
    expect(environment.Path).toBeUndefined();
  });

  it("clears the active run marker when cancellation races with initial dispatch", async () => {
    const manager = Object.create(ShellSessionManager.prototype) as unknown as {
      sessions: Map<string, unknown>;
      activeSessionRuns: Set<string>;
      stateLoaded: boolean;
      spawnProcess: (runtime: { process: ChildProcess | null }) => void;
      persistState: () => Promise<void>;
      runCommand: ShellSessionManager["runCommand"];
    };
    manager.sessions = new Map();
    manager.activeSessionRuns = new Set();
    manager.stateLoaded = true;

    const controller = new AbortController();
    const fakeProcess = {
      pid: undefined,
      stdin: { write: vi.fn() },
      stdout: {},
    } as unknown as ChildProcess;
    manager.spawnProcess = vi.fn((runtime: { process: ChildProcess | null }) => {
      runtime.process = fakeProcess;
    });
    let persistCount = 0;
    manager.persistState = vi.fn(async () => {
      persistCount += 1;
      if (persistCount === 1) controller.abort();
    });

    await expect(
      manager.runCommand({
        taskId: "task-cancel-race",
        workspaceId: "workspace-cancel-race",
        workspacePath: process.cwd(),
        command: "echo should-not-dispatch",
        timeoutMs: 1_000,
        signal: controller.signal,
        fallbackRunner: vi.fn(),
      }),
    ).rejects.toMatchObject({ name: "AbortError", code: "CANCELLED" });

    expect(manager.activeSessionRuns.size).toBe(0);
    expect(fakeProcess.stdin.write).not.toHaveBeenCalled();
  });

  it("bounds long persistent output and recovers for the next command", async () => {
    const manager = ShellSessionManager.getInstance();
    const workspace = await mkdtemp(path.join(tmpdir(), "neoworker-shell-output-"));
    const taskId = `persistent-output-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const workspaceId = `workspace-${taskId}`;
    // Windows CI can deliver a 1.2 MB child-process stream more slowly than
    // Unix runners. This test verifies bounded buffering and recovery, not a
    // ten-second latency SLA, so allow the platform pipe enough time to flush.
    const longOutputTimeoutMs = process.platform === "win32" ? 30_000 : 10_000;
    const fallbackRunner = async () => ({
      success: false,
      stdout: "",
      stderr: "fallback should not run",
      exitCode: null,
      terminationReason: "error" as const,
      truncated: false,
    });
    try {
      const result = await manager.runCommand({
        taskId,
        workspaceId,
        workspacePath: workspace,
        command: "node -e \"process.stdout.write('x'.repeat(1200000))\"",
        timeoutMs: longOutputTimeoutMs,
        fallbackRunner,
      });
      expect(result).toMatchObject({
        success: true,
        exitCode: 0,
        usedPersistentSession: true,
        truncated: true,
      });
      expect(result.stdout.length).toBeLessThanOrEqual(100 * 1024);
      expect(result.stdout).toContain("Output truncated by persistent shell");

      const recovered = await manager.runCommand({
        taskId,
        workspaceId,
        workspacePath: workspace,
        command: "node -e \"process.stdout.write('recovered')\"",
        timeoutMs: 5_000,
        fallbackRunner,
      });
      expect(recovered).toMatchObject({
        success: true,
        exitCode: 0,
        usedPersistentSession: true,
      });
      expect(recovered.stdout).toContain("recovered");
    } finally {
      await manager.closeSession(taskId, workspaceId);
      await rm(workspace, { recursive: true, force: true });
    }
  }, 45_000);
});
