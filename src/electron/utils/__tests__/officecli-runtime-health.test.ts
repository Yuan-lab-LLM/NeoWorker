import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  checkOfficeCliHealth,
  getBundledOfficeCliCandidates,
  getOfficeCliBinaryName,
  installBundledOfficeCliRuntime,
  invalidateOfficeCliHealthCache,
} from "../officecli-runtime";

afterEach(() => invalidateOfficeCliHealthCache());

describe("Office tools health check", () => {
  it("runs version, create and validate without probing HTTP ports", async () => {
    const runner = vi.fn(async (_executable: string, args: string[]) => {
      if (args[0] === "--version") return { stdout: "officecli 1.2.3\n", stderr: "" };
      if (args[0] === "create") {
        await fs.writeFile(args[1], "valid-smoke-file");
      }
      return { stdout: JSON.stringify({ success: true }), stderr: "" };
    });
    const report = await checkOfficeCliHealth({
      candidates: [getOfficeCliBinaryName()],
      runner,
      force: true,
    });
    expect(report).toMatchObject({ ready: true, version: "officecli 1.2.3" });
    expect(runner.mock.calls.map((call) => call[1][0])).toEqual([
      "--version",
      "create",
      "validate",
    ]);
  });

  it("returns a stable diagnostic when the smoke test fails", async () => {
    const report = await checkOfficeCliHealth({
      candidates: [getOfficeCliBinaryName()],
      force: true,
      runner: async (_executable, args) => {
        if (args[0] === "--version") return { stdout: "officecli test", stderr: "" };
        throw new Error("failed");
      },
    });
    expect(report).toMatchObject({
      ready: false,
      diagnosticCode: "OFFICE_TOOL_SMOKE_FAILED",
    });
  });

  it("prefers the runtime-recorded bundled executable path", () => {
    const previous = process.env.NEOWORKER_BUNDLED_OFFICECLI_PATH;
    const recordedPath = "/Applications/NeoWorker.app/Contents/Resources/officecli/officecli";
    process.env.NEOWORKER_BUNDLED_OFFICECLI_PATH = recordedPath;
    try {
      expect(getBundledOfficeCliCandidates()[0]).toBe(recordedPath);
    } finally {
      if (previous === undefined) delete process.env.NEOWORKER_BUNDLED_OFFICECLI_PATH;
      else process.env.NEOWORKER_BUNDLED_OFFICECLI_PATH = previous;
    }
  });

  it("installs the bundled CLI with one-shot process settings", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "neoworker-office-runtime-"));
    const binary = path.join(root, "officecli", getOfficeCliBinaryName());
    await fs.mkdir(path.dirname(binary), { recursive: true });
    await fs.writeFile(binary, "test binary");

    const runtimeProcess = process as NodeJS.Process & { resourcesPath?: string };
    const previousResourcesPath = runtimeProcess.resourcesPath;
    const previousPath = process.env.PATH;
    const previousBundledPath = process.env.NEOWORKER_BUNDLED_OFFICECLI_PATH;
    const previousNoAutoResident = process.env.OFFICECLI_NO_AUTO_RESIDENT;
    const previousResidentFlush = process.env.OFFICECLI_RESIDENT_FLUSH;

    try {
      Object.defineProperty(runtimeProcess, "resourcesPath", {
        configurable: true,
        value: root,
      });
      delete process.env.NEOWORKER_BUNDLED_OFFICECLI_PATH;
      process.env.OFFICECLI_NO_AUTO_RESIDENT = "0";
      delete process.env.OFFICECLI_RESIDENT_FLUSH;

      expect(installBundledOfficeCliRuntime()).toBe(binary);
      expect(String(process.env.PATH).split(path.delimiter)[0]).toBe(path.dirname(binary));
      expect(process.env.NEOWORKER_BUNDLED_OFFICECLI_PATH).toBe(binary);
      expect(process.env.OFFICECLI_NO_AUTO_RESIDENT).toBe("1");
      expect(process.env.OFFICECLI_RESIDENT_FLUSH).toBe("each");
    } finally {
      Object.defineProperty(runtimeProcess, "resourcesPath", {
        configurable: true,
        value: previousResourcesPath,
      });
      if (previousPath === undefined) delete process.env.PATH;
      else process.env.PATH = previousPath;
      if (previousBundledPath === undefined) delete process.env.NEOWORKER_BUNDLED_OFFICECLI_PATH;
      else process.env.NEOWORKER_BUNDLED_OFFICECLI_PATH = previousBundledPath;
      if (previousNoAutoResident === undefined) delete process.env.OFFICECLI_NO_AUTO_RESIDENT;
      else process.env.OFFICECLI_NO_AUTO_RESIDENT = previousNoAutoResident;
      if (previousResidentFlush === undefined) delete process.env.OFFICECLI_RESIDENT_FLUSH;
      else process.env.OFFICECLI_RESIDENT_FLUSH = previousResidentFlush;
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
