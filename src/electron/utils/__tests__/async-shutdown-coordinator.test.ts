import { describe, expect, it, vi } from "vitest";

import { AsyncShutdownCoordinator } from "../async-shutdown-coordinator";

describe("AsyncShutdownCoordinator", () => {
  it("holds repeated quit requests until cleanup completes and runs cleanup once", async () => {
    let finishShutdown: (() => void) | undefined;
    const shutdown = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishShutdown = resolve;
        }),
    );
    const completeQuit = vi.fn();
    const coordinator = new AsyncShutdownCoordinator({
      shutdown,
      completeQuit,
    });
    const firstEvent = { preventDefault: vi.fn() };
    const secondEvent = { preventDefault: vi.fn() };

    coordinator.handleBeforeQuit(firstEvent);
    coordinator.handleBeforeQuit(secondEvent);

    expect(firstEvent.preventDefault).toHaveBeenCalledOnce();
    expect(secondEvent.preventDefault).toHaveBeenCalledOnce();
    expect(shutdown).toHaveBeenCalledOnce();
    expect(completeQuit).not.toHaveBeenCalled();

    finishShutdown?.();
    await vi.waitFor(() => expect(completeQuit).toHaveBeenCalledOnce());

    const finalEvent = { preventDefault: vi.fn() };
    coordinator.handleBeforeQuit(finalEvent);
    expect(finalEvent.preventDefault).not.toHaveBeenCalled();
  });

  it("allows the app to quit even when cleanup reports an error", async () => {
    const error = new Error("cleanup failed");
    const onError = vi.fn();
    const completeQuit = vi.fn();
    const coordinator = new AsyncShutdownCoordinator({
      shutdown: vi.fn().mockRejectedValue(error),
      completeQuit,
      onError,
    });

    coordinator.handleBeforeQuit({ preventDefault: vi.fn() });

    await vi.waitFor(() => expect(completeQuit).toHaveBeenCalledOnce());
    expect(onError).toHaveBeenCalledWith(error);
    expect(coordinator.isComplete()).toBe(true);
  });
});
