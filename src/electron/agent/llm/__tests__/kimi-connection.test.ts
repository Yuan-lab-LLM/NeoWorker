import { afterEach, describe, expect, it, vi } from "vitest";
import { LLMProviderFactory } from "../provider-factory";
import {
  KIMI_CHINA_BASE_URL,
  KIMI_INTERNATIONAL_BASE_URL,
} from "../../../../shared/kimi";

describe("Kimi automatic connection", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("moves from the China endpoint to the international endpoint automatically", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ status: 401, ok: false })
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: async () => ({
          data: [{ id: "kimi-k2.5" }, { id: "kimi-k3" }],
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const result = await LLMProviderFactory.connectKimi("sk-example");

    expect(result).toMatchObject({
      success: true,
      resolvedBaseUrl: KIMI_INTERNATIONAL_BASE_URL,
      resolvedModel: "kimi-k3",
    });
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      `${KIMI_CHINA_BASE_URL}/models`,
      `${KIMI_INTERNATIONAL_BASE_URL}/models`,
    ]);
  });

  it("returns an ordinary authentication error after both official endpoints reject a key", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ status: 401, ok: false }),
    );

    const result = await LLMProviderFactory.connectKimi(
      "Bearer sk-example",
    );

    expect(result).toEqual({
      success: false,
      errorCode: "invalid_key",
      error: "This Kimi API key could not be verified.",
    });
  });
});
