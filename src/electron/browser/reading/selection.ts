import type { WebContents } from "electron";
import { browserSelectionProbe } from "../../../shared/browser-selection";
import { READING_CHANNELS, type ReadingSelection } from "../../../shared/browser-reading";

/** Read the live frame directly: webContents.executeJavaScript can wait for
 * page loading to finish even though the user can already select its text. */
export async function readHtmlSelection(guest: WebContents): Promise<ReadingSelection | null> {
  if (guest.isDestroyed()) return null;
  const url = guest.getURL();
  if (!/^https?:/.test(url)) return null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const raw = await Promise.race([
      guest.mainFrame.executeJavaScript(`(${browserSelectionProbe.toString()})()`),
      new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), 1000); }),
    ]);
    if (!raw || typeof raw !== "object") return null;
    const value = raw as Record<string, unknown>;
    if (guest.isDestroyed() || guest.getURL() !== url ||
      typeof value.text !== "string" || !value.text.trim() || value.text.length > 12000 ||
      typeof value.x !== "number" || typeof value.y !== "number" ||
      !Number.isFinite(value.x) || !Number.isFinite(value.y)) return null;
    return { text: value.text, x: value.x, y: value.y, coordinateSpace: "guest" };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Bound to an owned guest by the reading IPC handler. Native input events
 * cannot be swallowed by a publisher's selection/share popover. */
export function watchHtmlSelection(guest: WebContents, host: WebContents): () => void {
  let generation = 0;
  let stopped = false;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const send = (selection: ReadingSelection | null) => {
    if (stopped || guest.isDestroyed() || host.isDestroyed() || guest.hostWebContents !== host) return;
    if (guest.mainFrame.framesInSubtree.some(frame => frame.url.startsWith("chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai/"))) return;
    const pageURL = guest.getURL();
    if (!/^https?:/.test(pageURL)) return;
    host.send(READING_CHANNELS.selection, {
      text: selection?.text || "", x: selection?.x || 0, y: selection?.y || 0,
      pageURL, frameURL: pageURL, webContentsId: guest.id, coordinateSpace: "guest",
    });
  };
  const cancelPending = () => {
    generation++;
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
  };
  const schedule = () => {
    cancelPending();
    const current = generation;
    let latestRead = 0;
    // Native before-mouse-event arrives before the page's mouseup handler.
    // Read on the next turn and once after its selection/share UI settles.
    for (const delay of [0, 80]) {
      const timer = setTimeout(async () => {
        timers.delete(timer);
        const read = ++latestRead;
        const selection = await readHtmlSelection(guest);
        if (!stopped && current === generation && read === latestRead) send(selection);
      }, delay);
      timers.add(timer);
    }
  };
  const reset = () => { cancelPending(); send(null); };
  const mouse = (_event: Electron.Event, input: Electron.MouseInputEvent) => {
    if (input.type === "mouseDown" && input.button === "left") reset();
    if (input.type === "mouseUp" && input.button === "left") schedule();
    if (input.type === "mouseWheel") schedule();
  };
  const keyboard = (_event: Electron.Event, input: Electron.Input) => {
    if (input.type === "keyUp") schedule();
  };
  const navigate = (_event: Electron.Event, _url: string, _inPlace: boolean, main: boolean) => {
    if (main) reset();
  };
  guest.on("before-mouse-event", mouse);
  guest.on("before-input-event", keyboard);
  guest.on("did-start-navigation", navigate);
  const dispose = () => {
    stopped = true;
    cancelPending();
    guest.removeListener("before-mouse-event", mouse);
    guest.removeListener("before-input-event", keyboard);
    guest.removeListener("did-start-navigation", navigate);
    guest.removeListener("destroyed", dispose);
    host.removeListener("destroyed", dispose);
  };
  guest.once("destroyed", dispose);
  host.once("destroyed", dispose);
  return dispose;
}
