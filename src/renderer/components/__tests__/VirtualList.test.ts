import { describe, expect, it } from "vitest";

import { getVirtualScrollRequestIdentity } from "../../utils/virtual-scroll-request";

describe("getVirtualScrollRequestIdentity", () => {
  it("uses the selected session identity instead of the volatile row index", () => {
    expect(getVirtualScrollRequestIdentity(true, 4, 20, "session-1")).toBe(
      "key:session-1",
    );
    expect(getVirtualScrollRequestIdentity(true, 1, 21, "session-1")).toBe(
      "key:session-1",
    );
  });

  it("falls back to the row index when no stable request key is supplied", () => {
    expect(getVirtualScrollRequestIdentity(true, 4, 20)).toBe("index:4");
  });

  it("does not create a request for unavailable rows", () => {
    expect(
      getVirtualScrollRequestIdentity(false, 4, 20, "session-1"),
    ).toBeNull();
    expect(
      getVirtualScrollRequestIdentity(true, -1, 20, "session-1"),
    ).toBeNull();
    expect(
      getVirtualScrollRequestIdentity(true, 20, 20, "session-1"),
    ).toBeNull();
  });
});
