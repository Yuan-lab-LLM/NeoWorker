import { describe, expect, it } from "vitest";
import { resolveOpaqueWindowBackground } from "../window-background";

describe("window background", () => {
  it("resolves an opaque background for explicit and system themes", () => {
    expect(resolveOpaqueWindowBackground("dark", false)).toBe("#1a1a1c");
    expect(resolveOpaqueWindowBackground("light", true)).toBe("#f0f0f2");
    expect(resolveOpaqueWindowBackground("system", false)).toBe("#f0f0f2");
    expect(resolveOpaqueWindowBackground("system", true)).toBe("#1a1a1c");
  });
});
