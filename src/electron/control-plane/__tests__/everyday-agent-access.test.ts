import { describe, expect, it, vi } from "vitest";
import { ErrorCodes } from "../protocol";
import { requireEverydayAgentReceiptAccess } from "../handlers";

describe("Everyday Agent Control Plane access", () => {
  it("requires admin scope for full receipt listing", () => {
    expect(() =>
      requireEverydayAgentReceiptAccess({
        hasScope: vi.fn((scope: string) => scope === "read"),
      }),
    ).toThrow(expect.objectContaining({ code: ErrorCodes.UNAUTHORIZED }));

    expect(() =>
      requireEverydayAgentReceiptAccess({
        hasScope: vi.fn((scope: string) => scope === "admin"),
      }),
    ).not.toThrow();
  });
});
