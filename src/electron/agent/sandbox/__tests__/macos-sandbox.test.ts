import { EventEmitter } from "events";
import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ChildProcess } from "child_process";
import type { Workspace } from "../../../../shared/types";

const spawnMock = vi.hoisted(() => vi.fn());
const electronApp = vi.hoisted(() => ({ isPackaged: true, getAppPath: vi.fn(() => "/app/neoworker") }));
vi.mock("electron", () => ({ app: electronApp }));

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
    electronApp.isPackaged = true;
    spawnMock.mockReset();
    spawnMock.mockImplementation(() => makeChildProcess());
  });

  it("allows development skill scripts and dependencies read-only without granting the checkout", () => {
    electronApp.isPackaged = false;
    const profile = (new MacOSSandbox(makeWorkspace()) as Any).generateSandboxProfile(false);
    expect(profile).toContain('(allow file-read* (subpath "/app/neoworker/resources/skills"))');
    expect(profile).toContain('(allow file-read* (subpath "/app/neoworker/node_modules"))');
    expect(profile).not.toContain('(allow file-read* (subpath "/app/neoworker"))');
    expect(profile).not.toContain('(allow file-write* (subpath "/app/neoworker/resources/skills"))');
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

  it("puts the packaged OfficeCLI directory on the sandbox PATH", async () => {
    const resourcesRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "neoworker-officecli-resource-"),
    );
    const officeCliDirectory = path.join(resourcesRoot, "officecli");
    fs.mkdirSync(officeCliDirectory, { recursive: true });
    fs.writeFileSync(path.join(officeCliDirectory, "officecli"), "");

    const previousResourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
    Object.defineProperty(process, "resourcesPath", {
      configurable: true,
      value: resourcesRoot,
    });

    const proc = makeChildProcess();
    spawnMock.mockImplementationOnce(() => proc);
    try {
      const resultPromise = new MacOSSandbox(makeWorkspace()).execute("which officecli", [], {
        cwd: "/tmp/neoworker workspace",
        timeout: 1000,
      });
      const [, , options] = spawnMock.mock.calls[0];
      expect(options.env.PATH.split(":")[0]).toBe(officeCliDirectory);
      await expect(resultPromise).resolves.toMatchObject({ exitCode: 0 });
    } finally {
      Object.defineProperty(process, "resourcesPath", {
        configurable: true,
        value: previousResourcesPath,
      });
      fs.rmSync(resourcesRoot, { recursive: true, force: true });
    }
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

  it("allows packaged skill resources to be read from the app Resources directory", async () => {
    const proc = new EventEmitter() as ChildProcess;
    proc.stdout = new EventEmitter() as ChildProcess["stdout"];
    proc.stderr = new EventEmitter() as ChildProcess["stderr"];
    proc.kill = vi.fn(() => true) as unknown as ChildProcess["kill"];
    spawnMock.mockImplementationOnce(() => proc);
    const previousResourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
    Object.defineProperty(process, "resourcesPath", {
      configurable: true,
      value: "/Applications/NeoWorker.app/Contents/Resources",
    });
    const workspacePath = "/tmp/neoworker workspace";
    const sandbox = new MacOSSandbox(makeWorkspace({ path: workspacePath }));

    const resultPromise = sandbox.execute("python3 scripts/neoworker_preflight.py", [], {
      cwd: "/Applications/NeoWorker.app/Contents/Resources/skills/ppt-master",
      timeout: 1000,
    });

    const [, args] = spawnMock.mock.calls[0];
    const profile = fs.readFileSync(args[1], "utf-8");
    expect(profile).toContain(
      '(allow file-read* (subpath "/Applications/NeoWorker.app/Contents/Resources"))',
    );
    expect(profile).toContain(
      '(allow file-read* (subpath "/Applications/NeoWorker.app/Contents/Resources/skills"))',
    );

    proc.emit("close", 0, null);
    await expect(resultPromise).resolves.toMatchObject({ exitCode: 0 });
    if (previousResourcesPath === undefined) {
      delete (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
    } else {
      Object.defineProperty(process, "resourcesPath", {
        configurable: true,
        value: previousResourcesPath,
      });
    }
  });

  it("keeps generation staging writable while protecting private NeoWorker state", async () => {
    const proc = new EventEmitter() as ChildProcess;
    proc.stdout = new EventEmitter() as ChildProcess["stdout"];
    proc.stderr = new EventEmitter() as ChildProcess["stderr"];
    proc.kill = vi.fn(() => true) as unknown as ChildProcess["kill"];
    spawnMock.mockImplementationOnce(() => proc);
    const workspacePath = "/tmp/neoworker workspace";
    const sandbox = new MacOSSandbox(makeWorkspace({ path: workspacePath }));

    const resultPromise = sandbox.execute(
      "python3 .neoworker/tmp/gen_charts.py",
      [],
      { cwd: workspacePath, timeout: 1000 },
    );

    const [, args] = spawnMock.mock.calls[0];
    const profile = fs.readFileSync(args[1], "utf-8");
    expect(profile).not.toContain(
      `(deny file-write* (subpath "${workspacePath}/.neoworker"))`,
    );
    expect(profile).toContain(
      `(deny file-write* (subpath "${workspacePath}/.neoworker/uploads"))`,
    );
    expect(profile).toContain(
      `(deny file-write* (subpath "${workspacePath}/.neoworker/projects"))`,
    );

    proc.emit("close", 0, null);
    await expect(resultPromise).resolves.toMatchObject({ exitCode: 0 });
  });

  it("allows harmless shell sinks and TLS trust configuration reads", async () => {
    const proc = new EventEmitter() as ChildProcess;
    proc.stdout = new EventEmitter() as ChildProcess["stdout"];
    proc.stderr = new EventEmitter() as ChildProcess["stderr"];
    proc.kill = vi.fn(() => true) as unknown as ChildProcess["kill"];
    spawnMock.mockImplementationOnce(() => proc);
    const sandbox = new MacOSSandbox(makeWorkspace({ path: "/tmp/neoworker workspace" }));

    const resultPromise = sandbox.execute("curl --silent https://registry.npmjs.org/", [], {
      cwd: "/tmp/neoworker workspace",
      timeout: 1000,
      allowNetwork: true,
    });

    const [, args] = spawnMock.mock.calls[0];
    const profile = fs.readFileSync(args[1], "utf-8");
    expect(profile).toContain('(allow file-write* (literal "/dev/null"))');
    expect(profile).toContain('(subpath "/private/etc/ssl")');
    expect(profile).toContain('(subpath "/etc/ssl")');
    expect(profile).toContain("(allow network*)");

    proc.emit("close", 0, null);
    await expect(resultPromise).resolves.toMatchObject({ exitCode: 0 });
  });
});
