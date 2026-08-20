import { EventEmitter } from "events";
import fs from "fs";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ChildProcess } from "child_process";
import type { Workspace } from "../../../../shared/types";

const spawnMock = vi.hoisted(() => vi.fn());

vi.mock("child_process", () => ({
  spawn: spawnMock,
}));

import { MacOSSandbox } from "../macos-sandbox";

function makeWorkspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    id: "workspace-1",
    name: "Workspace",
    path: "/tmp/neoworker workspace",
    permissions: {
      read: true,
      write: true,
      delete: false,
      shell: true,
      network: false,
      unrestrictedFileAccess: false,
      allowedPaths: [],
    },
    settings: {
      useGuardrails: true,
      guardrails: {
        blockDangerousCommands: true,
        customBlockedPatterns: [],
        autoApproveTrustedCommands: false,
        trustedCommandPatterns: [],
        enforceAllowedDomains: false,
        allowedDomains: [],
      },
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

function makeChildProcess(options: {
  closeCode?: number | null;
  closeSignal?: NodeJS.Signals | null;
  stdout?: string;
  stderr?: string;
  errorMessage?: string;
} = {}): ChildProcess {
  const proc = new EventEmitter() as ChildProcess;
  proc.stdout = new EventEmitter() as ChildProcess["stdout"];
  proc.stderr = new EventEmitter() as ChildProcess["stderr"];
  proc.kill = vi.fn(() => true) as unknown as ChildProcess["kill"];
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
  return proc;
}

describe("MacOSSandbox", () => {
  beforeEach(() => {
    spawnMock.mockReset();
    spawnMock.mockImplementation(() => makeChildProcess());
  });

  it("passes multiline shell commands as a single -c argument to sandbox-exec", async () => {
    const sandbox = new MacOSSandbox(makeWorkspace());
    const command = "mkdir -p out && cat > out/viewer.html <<'EOF'\n<html></html>\nEOF";

    const result = await sandbox.execute(command, [], {
      cwd: "/tmp/neoworker workspace",
      timeout: 1000,
    });

    expect(result.exitCode).toBe(0);
    expect(spawnMock).toHaveBeenCalledTimes(1);
    const [bin, args, options] = spawnMock.mock.calls[0];
    expect(bin).toBe("sandbox-exec");
    expect(args.slice(2)).toEqual(["/bin/sh", "-c", command]);
    expect(options.shell).toBe(false);
  });

  it("passes explicit command arguments directly through sandbox-exec", async () => {
    const sandbox = new MacOSSandbox(makeWorkspace());

    const result = await sandbox.execute("node", ["script.js", "--flag"], {
      cwd: "/tmp/neoworker workspace",
      timeout: 1000,
    });

    expect(result.exitCode).toBe(0);
    const [bin, args, options] = spawnMock.mock.calls[0];
    expect(bin).toBe("sandbox-exec");
    expect(args.slice(2)).toEqual(["node", "script.js", "--flag"]);
    expect(options.shell).toBe(false);
  });

  it("uses the task workspace as the default cwd for executeCode", async () => {
    const workspace = makeWorkspace();
    const sandbox = new MacOSSandbox(workspace);

    const result = await sandbox.executeCode("print('hello')", "python");

    expect(result.exitCode).toBe(0);
    const [, , options] = spawnMock.mock.calls[0];
    expect(options.cwd).toBe(workspace.path);
  });

  it("reports nonzero sandbox process exits", async () => {
    spawnMock.mockImplementationOnce(() =>
      makeChildProcess({ closeCode: 2, stderr: "command failed\n" }),
    );
    const sandbox = new MacOSSandbox(makeWorkspace());

    const result = await sandbox.execute("false", [], {
      cwd: "/tmp/neoworker workspace",
      timeout: 1000,
    });

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toBe("command failed\n");
    expect(result.timedOut).toBe(false);
  });

  it("preserves process termination signals instead of returning a blank exit 1", async () => {
    spawnMock.mockImplementationOnce(() =>
      makeChildProcess({ closeCode: null, closeSignal: "SIGABRT" }),
    );
    const sandbox = new MacOSSandbox(makeWorkspace());

    const result = await sandbox.execute("python3", ["-c", "print('hello')"], {
      cwd: "/tmp/neoworker workspace",
      timeout: 1000,
    });

    expect(result.exitCode).toBe(1);
    expect(result.signal).toBe("SIGABRT");
    expect(result.stderr).toBe("Process terminated by signal SIGABRT");
    expect(result.error).toBe("Process terminated by signal SIGABRT");
  });

  it("reports sandbox spawn errors", async () => {
    spawnMock.mockImplementationOnce(() => makeChildProcess({ errorMessage: "spawn failed" }));
    const sandbox = new MacOSSandbox(makeWorkspace());

    const result = await sandbox.execute("echo ok", [], {
      cwd: "/tmp/neoworker workspace",
      timeout: 1000,
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe("spawn failed");
    expect(result.error).toBe("spawn failed");
  });

  it("allows both /var and /private/var aliases in generated sandbox profiles", async () => {
    const proc = new EventEmitter() as ChildProcess;
    proc.stdout = new EventEmitter() as ChildProcess["stdout"];
    proc.stderr = new EventEmitter() as ChildProcess["stderr"];
    proc.kill = vi.fn(() => true) as unknown as ChildProcess["kill"];
    spawnMock.mockImplementationOnce(() => proc);
    const workspacePath = "/var/folders/test/neoworker workspace";
    const sandbox = new MacOSSandbox(makeWorkspace({ path: workspacePath }));

    const resultPromise = sandbox.execute("echo ok", [], {
      cwd: workspacePath,
      timeout: 1000,
    });

    const [, args] = spawnMock.mock.calls[0];
    const profile = fs.readFileSync(args[1], "utf-8");
    expect(profile).toContain('(allow file-read* (literal "/"))');
    expect(profile).toContain('(allow file-read* (literal "/usr"))');
    expect(profile).toContain('(allow file-read* (literal "/usr/local"))');
    expect(profile).toContain('/var/folders/test/neoworker workspace');
    expect(profile).toContain('/private/var/folders/test/neoworker workspace');
    expect(profile).not.toContain('(allow file-read* (subpath "/private/var/folders"))');

    proc.emit("close", 0, null);
    await expect(resultPromise).resolves.toMatchObject({ exitCode: 0 });
  });
});
