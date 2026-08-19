import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";

import {
  appendRuntimeDiagnostic,
  getRuntimeDiagnosticPath,
  recordGpuProcessCrash,
  shouldDisableHardwareAcceleration,
} from "../runtime-stability";

const tempDirectories: string[] = [];

function makeTempDirectory(): string {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "neoworker-runtime-stability-"),
  );
  tempDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("runtime stability", () => {
  it("uses software rendering after a recent GPU process crash", () => {
    const userDataDir = makeTempDirectory();
    recordGpuProcessCrash(userDataDir, 10_000);

    expect(
      shouldDisableHardwareAcceleration({ userDataDir, now: 11_000, env: {} }),
    ).toBe(true);
    expect(
      shouldDisableHardwareAcceleration({
        userDataDir,
        now: 11_000,
        env: { NEOWORKER_FORCE_HARDWARE_ACCELERATION: "1" },
      }),
    ).toBe(false);
  });

  it("does not keep GPU safe mode after its recovery window expires", () => {
    const userDataDir = makeTempDirectory();
    recordGpuProcessCrash(userDataDir, 1);

    expect(
      shouldDisableHardwareAcceleration({
        userDataDir,
        now: 8 * 24 * 60 * 60 * 1000,
        env: {},
      }),
    ).toBe(false);
  });

  it("writes a local crash diagnostic without task or prompt content", () => {
    const userDataDir = makeTempDirectory();
    appendRuntimeDiagnostic(userDataDir, {
      kind: "renderer-process-gone",
      reason: "crashed",
      exitCode: -1,
    });

    const record = JSON.parse(
      fs.readFileSync(getRuntimeDiagnosticPath(userDataDir), "utf8").trim(),
    );
    expect(record).toMatchObject({
      kind: "renderer-process-gone",
      reason: "crashed",
      exitCode: -1,
    });
    expect(record.timestamp).toBeTypeOf("string");
  });
});
