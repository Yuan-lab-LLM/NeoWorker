import { describe, expect, it } from "vitest";
import { getStartupAutoConnectRemoteDeviceIds } from "../handlers";

describe("getStartupAutoConnectRemoteDeviceIds", () => {
  it("includes only devices explicitly marked for auto-connect", () => {
    expect(
      getStartupAutoConnectRemoteDeviceIds([
        { id: "remote-a", autoConnect: true },
        { id: "remote-b", autoConnect: false },
        { id: "remote-c" },
      ]),
    ).toEqual(["remote-a"]);
  });
});
