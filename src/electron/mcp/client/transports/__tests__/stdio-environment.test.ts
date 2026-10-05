import { describe, expect, it } from "vitest";
import { stdioEnvironment } from "../stdio-environment";

describe("MCP process environment", () => {
  it("finds standard Node installations from Finder's minimal PATH without dropping settings", () => {
    const original = { PATH: "/usr/bin:/bin", LANG: "zh_CN.UTF-8" };
    const env = stdioEnvironment(original, { API_KEY: "test-only" }, "darwin", "/Users/test");
    expect(env.PATH?.split(":")).toEqual(
      expect.arrayContaining(["/usr/local/bin", "/opt/homebrew/bin", "/Users/test/.local/bin"]),
    );
    expect(env.LANG).toBe(original.LANG);
    expect(env.API_KEY).toBe("test-only");
    expect(original.PATH).toBe("/usr/bin:/bin");
  });
  it("preserves a server's explicit PATH priority and deduplicates entries", () => {
    const env = stdioEnvironment(
      { PATH: "/inherited" },
      { PATH: "/custom/node:/usr/local/bin" },
      "darwin",
      "/Users/test",
    );
    expect(env.PATH?.startsWith("/custom/node:/usr/local/bin:")).toBe(true);
    expect(env.PATH?.match(/\/usr\/local\/bin/g)).toHaveLength(1);
  });
  it("leaves Windows PATH and command shim behavior unchanged", () => {
    expect(stdioEnvironment({ Path: "C:\\Windows" }, { Path: "C:\\nodejs" }, "win32")).toEqual({
      Path: "C:\\nodejs",
    });
  });
});
