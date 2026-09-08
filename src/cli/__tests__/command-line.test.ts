import { describe, expect, it } from "vitest";
import { splitCommandLine } from "../command-line";

describe("splitCommandLine", () => {
  it("preserves Windows path separators in command arguments", () => {
    expect(
      splitCommandLine(
        'python "C:\\Users\\alice\\NeoWorker\\scripts\\preflight.py"',
        "win32",
      ),
    ).toEqual(["python", "C:\\Users\\alice\\NeoWorker\\scripts\\preflight.py"]);
  });

  it("keeps POSIX backslash escaping unchanged", () => {
    expect(splitCommandLine(String.raw`echo hello\ world`, "linux")).toEqual([
      "echo",
      "hello world",
    ]);
  });

  it("preserves a trailing backslash on Windows", () => {
    expect(splitCommandLine("C:\\Users\\", "win32")).toEqual(["C:\\Users\\"]);
  });
});
