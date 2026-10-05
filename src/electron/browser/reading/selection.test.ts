import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readHtmlSelection, watchHtmlSelection } from "./selection";

let host: any, guest: any, selected: unknown;
beforeEach(() => {
  vi.useFakeTimers();
  selected = null;
  host = Object.assign(new EventEmitter(), { isDestroyed: () => false, send: vi.fn() });
  guest = Object.assign(new EventEmitter(), {
    id: 4, hostWebContents: host, isDestroyed: () => false,
    getURL: () => "https://example.org/article",
    // The webContents API can remain pending while a page resource loads.
    executeJavaScript: vi.fn(() => new Promise(() => {})),
    mainFrame: { framesInSubtree: [], executeJavaScript: vi.fn(async () => selected) },
  });
});
afterEach(() => vi.useRealTimers());

describe("selection release notifications", () => {
  it("shows a completed drag after one mouse release, without another click or a completed page load", async () => {
    const stop = watchHtmlSelection(guest, host);
    guest.emit("before-mouse-event", {}, { type: "mouseDown", button: "left" });
    guest.emit("before-mouse-event", {}, { type: "mouseUp", button: "left" });
    // Chromium applies the DOM selection after the native before-mouse event.
    selected = { text: "Sparse attention evidence", x: 140, y: 250 };
    await vi.advanceTimersByTimeAsync(0);
    expect(host.send).toHaveBeenLastCalledWith("browser-reading:selection", expect.objectContaining({
      ...selected as object, coordinateSpace: "guest", webContentsId: 4,
    }));
    expect(guest.executeJavaScript).not.toHaveBeenCalled();
    stop();
  });

  it("rechecks after a publisher's mouseup/share handler settles and supports keyboard selection", async () => {
    const stop = watchHtmlSelection(guest, host);
    guest.emit("before-mouse-event", {}, { type: "mouseUp", button: "left" });
    await vi.advanceTimersByTimeAsync(0);
    selected = { text: "Final selected text", x: 20, y: 30 };
    await vi.advanceTimersByTimeAsync(80);
    expect(host.send.mock.lastCall[1].text).toBe("Final selected text");
    selected = { text: "Extended with Shift", x: 20, y: 60 };
    guest.emit("before-input-event", {}, { type: "keyUp", key: "ArrowDown" });
    await vi.advanceTimersByTimeAsync(0);
    expect(host.send.mock.lastCall[1].text).toBe("Extended with Shift");
    stop();
  });

  it("discards pending selections on navigation and removes input listeners on close", async () => {
    let resolve!: (value: unknown) => void;
    guest.mainFrame.executeJavaScript.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    watchHtmlSelection(guest, host);
    guest.emit("before-mouse-event", {}, { type: "mouseUp", button: "left" });
    await vi.advanceTimersByTimeAsync(0);
    guest.emit("did-start-navigation", {}, "https://example.org/new", false, true);
    resolve({ text: "Stale text", x: 10, y: 20 });
    await vi.advanceTimersByTimeAsync(100);
    expect(host.send.mock.calls.every(([, value]: any[]) => !value.text)).toBe(true);
    host.emit("destroyed");
    expect(guest.listenerCount("before-mouse-event")).toBe(0);
  });

  it("bounds a stalled or malformed frame response and leaves native PDFs to their existing reader", async () => {
    guest.mainFrame.executeJavaScript.mockImplementationOnce(() => new Promise(() => {}));
    const pending = readHtmlSelection(guest);
    await vi.advanceTimersByTimeAsync(1000);
    expect(await pending).toBeNull();
    selected = { text: "x".repeat(12001), x: 20, y: 30 };
    expect(await readHtmlSelection(guest)).toBeNull();
    const stop = watchHtmlSelection(guest, host);
    guest.mainFrame.framesInSubtree = [{ url: "chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai/index.html" }];
    guest.emit("before-mouse-event", {}, { type: "mouseDown", button: "left" });
    expect(host.send).not.toHaveBeenCalled();
    stop();
  });
});
