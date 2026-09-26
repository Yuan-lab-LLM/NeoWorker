import { describe, expect, it } from "vitest";
import { readingToolbarPosition } from "./reading-toolbar-position";
describe("selection toolbar anchoring", () => {
  it("stays beside a selection instead of jumping to the top-left", () => {
    expect(readingToolbarPosition(500, 400, 1000, 800)).toEqual({
      x: 340,
      y: 412,
    });
  });
  it("flips above a bottom selection and clamps at both edges", () => {
    expect(readingToolbarPosition(980, 780, 1000, 800)).toEqual({
      x: 668,
      y: 724,
    });
    expect(readingToolbarPosition(3, 20, 280, 500)).toEqual({ x: 12, y: 32 });
  });
});
