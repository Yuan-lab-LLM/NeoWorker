import type { WebContents } from "electron";

/** Keep target=_blank and window.open navigation in the originating browser pane. */
export function installWebviewPopupNavigation(
  contents: Pick<WebContents, "setWindowOpenHandler" | "isDestroyed" | "loadURL">,
  onError: (error: unknown) => void = () => {},
): void {
  contents.setWindowOpenHandler(({ url }) => {
    try {
      const target = new URL(url);
      if (target.protocol === "http:" || target.protocol === "https:") {
        // Finish rejecting the native window before navigating its source webview.
        queueMicrotask(() => {
          if (!contents.isDestroyed()) void contents.loadURL(target.href).catch(onError);
        });
      }
    } catch {
      // Invalid and non-web URLs never create a native window or open another app.
    }
    return { action: "deny" };
  });
}
