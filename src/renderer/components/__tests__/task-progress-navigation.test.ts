import { describe, expect, it, vi } from "vitest";
import { revealTaskProgressInView } from "../MainContent/task-progress-navigation";

describe("revealTaskProgressInView", () => {
  it("opens the structured progress popover when it is available", () => {
    const click = vi.fn();
    const focus = vi.fn();
    const trigger = {
      getAttribute: () => "false",
      click,
      focus,
    };
    const root = {
      querySelector: () => trigger,
    };
    const scrollTo = vi.fn();
    const scrollContainer = { scrollHeight: 900, scrollTo };

    const result = revealTaskProgressInView({
      root: root as unknown as ParentNode,
      scrollContainer: scrollContainer as unknown as HTMLElement,
    });

    expect(result).toBe("popover");
    expect(click).toHaveBeenCalledOnce();
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("keeps an open progress popover open", () => {
    const click = vi.fn();
    const focus = vi.fn();
    const root = {
      querySelector: () => ({
        getAttribute: () => "true",
        click,
        focus,
      }),
    };

    const result = revealTaskProgressInView({
      root: root as unknown as ParentNode,
      scrollContainer: null,
    });

    expect(result).toBe("popover");
    expect(click).not.toHaveBeenCalled();
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  });

  it("moves to the newest execution record when there is no structured plan", () => {
    const root = { querySelector: () => null };
    const scrollTo = vi.fn();
    const scrollContainer = { scrollHeight: 1600, scrollTo };

    const result = revealTaskProgressInView({
      root: root as unknown as ParentNode,
      scrollContainer: scrollContainer as unknown as HTMLElement,
      reduceMotion: true,
    });

    expect(result).toBe("timeline");
    expect(scrollTo).toHaveBeenCalledWith({ top: 1600, behavior: "auto" });
  });
});
