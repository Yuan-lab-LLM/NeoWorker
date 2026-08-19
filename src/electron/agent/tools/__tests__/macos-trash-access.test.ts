import { describe, expect, it, vi } from "vitest";

import {
  assertMacOsTrashReadable,
  isMacOsTrashPath,
  MACOS_TRASH_ACCESS_DENIED,
} from "../macos-trash-access";

describe("macOS Trash access", () => {
  it("recognizes the user's Trash and volume Trash paths", () => {
    expect(isMacOsTrashPath("/Users/test/.Trash", "/Users/test")).toBe(true);
    expect(isMacOsTrashPath("/Users/test/.Trash/item", "/Users/test")).toBe(true);
    expect(isMacOsTrashPath("/Volumes/Data/.Trashes/501/item", "/Users/test")).toBe(
      true,
    );
    expect(isMacOsTrashPath("/Users/test/Documents", "/Users/test")).toBe(false);
  });

  it("does not probe Trash on other platforms", () => {
    const readDirectory = vi.fn();
    assertMacOsTrashReadable("/Users/test/.Trash", {
      platform: "linux",
      homeDirectory: "/Users/test",
      readDirectory,
    });
    expect(readDirectory).not.toHaveBeenCalled();
  });

  it("turns EPERM into a user-facing, non-retryable error", () => {
    const permissionError = Object.assign(new Error("operation not permitted"), {
      code: "EPERM",
    });

    expect(() =>
      assertMacOsTrashReadable("/Users/test/.Trash/.DS_Store", {
        platform: "darwin",
        homeDirectory: "/Users/test",
        readDirectory: () => {
          throw permissionError;
        },
      }),
    ).toThrowError(
      expect.objectContaining({
        code: MACOS_TRASH_ACCESS_DENIED,
        causeCode: "EPERM",
        retryable: false,
        nonRetryable: true,
        userFacing: true,
      }),
    );
  });

  it("does not hide unrelated filesystem errors", () => {
    const missingError = Object.assign(new Error("missing"), { code: "ENOENT" });
    expect(() =>
      assertMacOsTrashReadable("/Users/test/.Trash", {
        platform: "darwin",
        homeDirectory: "/Users/test",
        readDirectory: () => {
          throw missingError;
        },
      }),
    ).toThrow(missingError);
  });
});
