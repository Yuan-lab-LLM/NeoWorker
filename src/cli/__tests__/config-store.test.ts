import { describe, expect, it } from "vitest";
import {
  DEFAULT_CONTROL_PLANE_URL,
  createDefaultConfig,
  removeProfileToken,
  resolveConnection,
  upsertProfile,
} from "../config-store";

describe("CLI config store", () => {
  it("creates a local default profile", () => {
    expect(createDefaultConfig()).toEqual({
      defaultProfile: "local",
      profiles: {
        local: { url: DEFAULT_CONTROL_PLANE_URL },
      },
    });
  });

  it("resolves explicit connection options before saved profile values", () => {
    const config = upsertProfile(
      createDefaultConfig(),
      "vps",
      { url: "ws://saved:18789", token: "saved-token" },
      true,
    );

    expect(
      resolveConnection({
        config,
        url: "ws://override:18789",
        token: "override-token",
      }),
    ).toMatchObject({
      profileName: "vps",
      url: "ws://override:18789",
      token: "override-token",
    });
  });

  it("removes only the stored token for a profile", () => {
    const config = upsertProfile(
      createDefaultConfig(),
      "local",
      { url: "ws://127.0.0.1:9999", token: "secret" },
      true,
    );

    expect(removeProfileToken(config, "local").profiles.local).toEqual({
      url: "ws://127.0.0.1:9999",
    });
  });
});
