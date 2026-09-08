import { EventEmitter } from "events";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { ChildProcess } from "child_process";
import type { Workspace } from "../../../shared/types";

const spawnMock = vi.hoisted(() => vi.fn());

vi.mock("child_process", () => ({
  spawn: spawnMock,
}));

import {
  detectAvailableSandbox,
  isMacOSSandboxAvailable,
  NoSandbox,
  resetDockerCache,
  resetMacOSSandboxCache,
} from "../sandbox-factory";

function makeChildProcess(options: {
  closeCode?: number | null;
  closeSignal?: NodeJS.Signals | null;
  stdout?: string;
  stderr?: string;
  errorMessage?: string;
  stayOpen?: boolean;
} = {}): ChildProcess {
  const proc = new EventEmitter() as ChildProcess;
  proc.stdout = new EventEmitter() as ChildProcess["stdout"];
  proc.stderr = new EventEmitter() as ChildProcess["stderr"];
  proc.kill = vi.fn(() => true) as unknown as ChildProcess["kill"];
  if (!options.stayOpen) {
    queueMicrotask(() => {
      if (options.stdout) proc.stdout?.emit("data", Buffer.from(options.stdout));
      if (options.stderr) proc.stderr?.emit("data", Buffer.from(options.stderr));
      if (options.errorMessage) {
        proc.emit("error", new Error(options.errorMessage));
        return;
      }
      proc.emit(
        "close",
        options.closeCode === undefined ? 0 : options.closeCode,
        options.closeSignal ?? null,
      );
    });
  }
  return proc;
}

describe("sandbox factory macOS probe", () => {
  let platformSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resetMacOSSandboxCache();
    spawnMock.mockReset();
    platformSpy = vi.spyOn(process, "platform", "get").mockReturnValue("darwin");
  });

  afterEach(() => {
    resetMacOSSandboxCache();
    platformSpy.mockRestore();
    vi.useRealTimers();
  });

  it("reports macOS sandbox-exec available after a successful probe", async () => {
    spawnMock.mockReturnValueOnce(makeChildProcess({ closeCode: 0, stdout: "ok\n" }));

    await expect(isMacOSSandboxAvailable()).resolves.toBe(true);

    expect(spawnMock).toHaveBeenCalledWith(
      "sandbox-exec",
      ["-f", expect.any(String), "/bin/echo", "ok"],
      expect.objectContaining({ shell: false }),
    );
  });

  it("reports macOS sandbox-exec unavailable when the strict probe is aborted", async () => {
    spawnMock.mockReturnValueOnce(
      makeChildProcess({ closeCode: null, closeSignal: "SIGABRT" }),
    );

    await expect(isMacOSSandboxAvailable()).resolves.toBe(false);
  });

  it("reports macOS sandbox-exec unavailable when sandbox_apply fails", async () => {
    spawnMock.mockReturnValueOnce(
      makeChildProcess({ closeCode: 134, stderr: "sandbox_apply: Operation not permitted\n" }),
    );

    await expect(isMacOSSandboxAvailable()).resolves.toBe(false);
  });

  it("reports macOS sandbox-exec unavailable after spawn errors", async () => {
    spawnMock.mockReturnValueOnce(makeChildProcess({ errorMessage: "spawn sandbox-exec ENOENT" }));

    await expect(isMacOSSandboxAvailable()).resolves.toBe(false);
  });

  it("reports macOS sandbox-exec unavailable after probe timeout", async () => {
    vi.useFakeTimers();
    const proc = makeChildProcess({ stayOpen: true });
    spawnMock.mockReturnValueOnce(proc);

    const available = isMacOSSandboxAvailable();
    await vi.advanceTimersByTimeAsync(3_000);

    await expect(available).resolves.toBe(false);
    expect(proc.kill).toHaveBeenCalled();
  });
});

describe("Windows no-sandbox command execution", () => {
  let platformSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    spawnMock.mockReset();
    platformSpy = vi.spyOn(process, "platform", "get").mockReturnValue("win32");
    spawnMock.mockImplementation(() => makeChildProcess({ closeCode: 0 }));
  });

  afterEach(() => {
    resetDockerCache();
    platformSpy.mockRestore();
    vi.useRealTimers();
  });

  it("does not select the Linux Docker sandbox on Windows", async () => {
    // Docker Desktop may be installed and running, but DockerSandbox executes
    // `/bin/sh` in a Linux image and cannot run host OfficeCLI/Python/npm.cmd.
    await expect(detectAvailableSandbox()).resolves.toBe("none");
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("runs a complete command line through cmd.exe without quoting it as one token", async () => {
    const sandbox = new NoSandbox({ path: process.cwd() } as unknown as Workspace);

    await expect(sandbox.execute("echo hello")).resolves.toMatchObject({ exitCode: 0 });

    expect(spawnMock).toHaveBeenCalledWith(
      expect.stringMatching(/(?:cmd\.exe)$/i),
      ["/d", "/s", "/c", "echo hello"],
      expect.objectContaining({ shell: false }),
    );
  });

  it("maps the Unix python3 spelling to python on Windows", async () => {
    const sandbox = new NoSandbox({ path: process.cwd() } as unknown as Workspace);

    await sandbox.execute('python3 "C:\\Users\\alice\\script.py"');

    expect(spawnMock).toHaveBeenCalledWith(
      expect.stringMatching(/(?:cmd\.exe)$/i),
      ["/d", "/s", "/c", 'python "C:\\Users\\alice\\script.py"'],
      expect.objectContaining({ shell: false }),
    );
  });

  it("launches quoted PowerShell scripts with spaces in their path", async () => {
    const sandbox = new NoSandbox({ path: process.cwd() } as unknown as Workspace);

    await sandbox.execute(
      '"C:\\Program Files\\NeoWorker\\disk_scan.ps1" -Root "C:\\Users\\alice"',
    );

    expect(spawnMock).toHaveBeenCalledWith(
      expect.stringMatching(/powershell\.exe$/i),
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        "& 'C:\\Program Files\\NeoWorker\\disk_scan.ps1' -Root \"C:\\Users\\alice\"",
      ],
      expect.objectContaining({ shell: false }),
    );
  });

  it("does not wrap an explicit PowerShell command in another shell", async () => {
    const sandbox = new NoSandbox({ path: process.cwd() } as unknown as Workspace);

    await sandbox.execute('powershell -NoProfile -Command "Write-Output hi"');

    expect(spawnMock).toHaveBeenCalledWith(
      expect.stringMatching(/(?:cmd\.exe)$/i),
      ["/d", "/s", "/c", 'powershell -NoProfile -Command "Write-Output hi"'],
      expect.objectContaining({ shell: false }),
    );
  });
});
