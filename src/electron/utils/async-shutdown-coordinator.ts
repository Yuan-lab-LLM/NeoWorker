export interface BeforeQuitEventLike {
  preventDefault(): void;
}

export interface AsyncShutdownCoordinatorOptions {
  shutdown: () => Promise<void>;
  completeQuit: () => void;
  onError?: (error: unknown) => void;
}

/**
 * Electron does not wait for a Promise returned by a `before-quit` listener.
 * This coordinator holds the first quit request, runs cleanup exactly once,
 * then issues a second quit request that is allowed to complete.
 */
export class AsyncShutdownCoordinator {
  private state: "idle" | "running" | "complete" = "idle";

  constructor(private readonly options: AsyncShutdownCoordinatorOptions) {}

  handleBeforeQuit(event: BeforeQuitEventLike): void {
    if (this.state === "complete") {
      return;
    }

    event.preventDefault();
    if (this.state === "running") {
      return;
    }

    this.state = "running";
    void this.options
      .shutdown()
      .catch((error) => {
        this.options.onError?.(error);
      })
      .finally(() => {
        this.state = "complete";
        this.options.completeQuit();
      });
  }

  isComplete(): boolean {
    return this.state === "complete";
  }
}
