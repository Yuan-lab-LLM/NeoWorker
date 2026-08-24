import { describe, expect, it, vi } from "vitest";

import {
  LLMRequestTimeoutError,
  classifyLLMRetryKind,
  withTimeout,
} from "../executor-helpers";

describe("LLM retry error classification", () => {
  it("keeps NeoWorker request deadlines distinct from provider overload", async () => {
    vi.useFakeTimers();
    const pending = new Promise<never>(() => undefined);
    const result = withTimeout(pending, 1_000, "Plan creation");
    const assertion = expect(result).rejects.toMatchObject({
      name: "LLMRequestTimeoutError",
      code: "NEOWORKER_LLM_TIMEOUT",
      retryKind: "request_timeout",
      operation: "Plan creation",
      timeoutMs: 1_000,
    });

    await vi.advanceTimersByTimeAsync(1_000);
    await assertion;
    vi.useRealTimers();
  });

  it("classifies timeout, network, rate limit, and overload separately", () => {
    expect(
      classifyLLMRetryKind(new LLMRequestTimeoutError("Execution", 2_000)),
    ).toBe("request_timeout");
    expect(classifyLLMRetryKind(new TypeError("fetch failed"))).toBe(
      "network",
    );
    expect(
      classifyLLMRetryKind(
        Object.assign(new Error("fetch failed"), {
          code: "UND_ERR_HEADERS_TIMEOUT",
        }),
      ),
    ).toBe("request_timeout");
    expect(
      classifyLLMRetryKind(
        Object.assign(new Error("too many requests"), { status: 429 }),
      ),
    ).toBe("rate_limit");
    expect(
      classifyLLMRetryKind(
        Object.assign(new Error("server is overloaded"), { status: 503 }),
      ),
    ).toBe("provider_overloaded");
  });
});
