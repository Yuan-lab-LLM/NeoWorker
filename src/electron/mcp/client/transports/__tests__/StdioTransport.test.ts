import { describe, expect, it } from "vitest";

import { normalizeStdioSpawnCommand, splitStdioCommandLine } from "../StdioTransport";

describe("StdioTransport command normalization", () => {
  it("splits an inline command when args are omitted", () => {
    expect(normalizeStdioSpawnCommand("npx -y @jshookmcp/jshook", [], "darwin")).toEqual({
      command: "npx",
      args: ["-y", "@jshookmcp/jshook"],
      shell: false,
    });
  });

  it("preserves explicit args", () => {
    expect(normalizeStdioSpawnCommand("npx", ["-y", "@jshookmcp/jshook"], "darwin")).toEqual({
      command: "npx",
      args: ["-y", "@jshookmcp/jshook"],
      shell: false,
    });
  });

  it("supports quoted inline executable paths", () => {
    expect(
      normalizeStdioSpawnCommand(
        '"C:\\Program Files\\nodejs\\npx.cmd" -y @jshookmcp/jshook',
        [],
        "win32",
      ),
    ).toEqual({
      command: "C:\\Program Files\\nodejs\\npx.cmd",
      args: ["-y", "@jshookmcp/jshook"],
      shell: true,
    });
  });

  it("uses the Windows shell for npm command shims", () => {
    expect(normalizeStdioSpawnCommand("npx", ["-y", "@jshookmcp/jshook"], "win32")).toEqual({
      command: "npx",
      args: ["-y", "@jshookmcp/jshook"],
      shell: true,
    });
  });

  it("does not split unquoted paths with spaces", () => {
    expect(
      normalizeStdioSpawnCommand("C:\\Program Files\\nodejs\\npx.cmd", ["-y", "pkg"], "win32"),
    ).toEqual({
      command: "C:\\Program Files\\nodejs\\npx.cmd",
      args: ["-y", "pkg"],
      shell: true,
    });
  });

  it("preserves Windows backslashes", () => {
    expect(splitStdioCommandLine('"\\\\server\\share\\tool.cmd" --flag')).toEqual([
      "\\\\server\\share\\tool.cmd",
      "--flag",
    ]);
  });

  it("keeps escaped spaces inside arguments", () => {
    expect(splitStdioCommandLine("python -m my\\ server --flag")).toEqual([
      "python",
      "-m",
      "my server",
      "--flag",
    ]);
  });
});
