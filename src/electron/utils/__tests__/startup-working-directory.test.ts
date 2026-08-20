import { describe, expect, it } from "vitest";
import { resolveSafePackagedWorkingDirectory } from "../startup-working-directory";

describe("resolveSafePackagedWorkingDirectory", () => {
  it("moves a packaged macOS app away from the filesystem root", () => {
    expect(
      resolveSafePackagedWorkingDirectory({
        isPackaged: true,
        cwd: "/",
        userDataDir: "/Users/allen/Library/Application Support/NeoWorker",
        platform: "darwin",
      }),
    ).toBe("/Users/allen/Library/Application Support/NeoWorker");
  });

  it("preserves an intentional packaged working directory", () => {
    expect(
      resolveSafePackagedWorkingDirectory({
        isPackaged: true,
        cwd: "/Users/allen/Documents/project",
        userDataDir: "/Users/allen/Library/Application Support/NeoWorker",
        platform: "darwin",
      }),
    ).toBeNull();
  });

  it("does not change development launches", () => {
    expect(
      resolveSafePackagedWorkingDirectory({
        isPackaged: false,
        cwd: "/",
        userDataDir: "/tmp/neoworker",
        platform: "darwin",
      }),
    ).toBeNull();
  });

  it("supports a packaged Windows root directory", () => {
    expect(
      resolveSafePackagedWorkingDirectory({
        isPackaged: true,
        cwd: "C:\\",
        userDataDir: "C:\\Users\\allen\\AppData\\Roaming\\NeoWorker",
        platform: "win32",
      }),
    ).toBe("C:\\Users\\allen\\AppData\\Roaming\\NeoWorker");
  });
});
