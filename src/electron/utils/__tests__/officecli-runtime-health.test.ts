import * as fs from "node:fs/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  checkOfficeCliHealth,
  getOfficeCliBinaryName,
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
});
