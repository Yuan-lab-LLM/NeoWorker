import { describe, expect, it } from "vitest";
import { getStableBrowserWorkbenchSize } from "../browser-workbench-sizing";

describe("getStableBrowserWorkbenchSize", () => {
  it("ignores sub-pixel and one-pixel measurement jitter", () => {
    const current = { width: 1280, height: 720 };

    expect(getStableBrowserWorkbenchSize(current, 1279.4, 720.6)).toBe(current);
    expect(getStableBrowserWorkbenchSize(current, 1280.8, 719.2)).toBe(current);
  });

  it("updates when the workbench actually changes size", () => {
    expect(
      getStableBrowserWorkbenchSize({ width: 1280, height: 720 }, 1200, 680),
    ).toEqual({ width: 1200, height: 680 });
  });

  it("keeps the last valid size while the surface is temporarily detached", () => {
    const current = { width: 1280, height: 720 };

    expect(getStableBrowserWorkbenchSize(current, 0, 0)).toBe(current);
    expect(getStableBrowserWorkbenchSize(null, 0, 0)).toBeNull();
  });
});
