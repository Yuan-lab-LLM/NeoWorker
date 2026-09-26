import { describe, expect, it, vi } from "vitest";
import type { WebContents } from "electron";
import { installWebviewPopupNavigation } from "../webview-popup-navigation";

function setup() {
  let handler!: Parameters<WebContents["setWindowOpenHandler"]>[0];
  const contents = {
    setWindowOpenHandler: (value: typeof handler) => { handler = value; },
    isDestroyed: vi.fn(() => false),
    loadURL: vi.fn(async () => {}),
  };
  const onError = vi.fn();
  installWebviewPopupNavigation(contents, onError);
  const open = (url: string) => handler({ url, frameName: "_blank", features: "", disposition: "new-window", referrer: { url: "", policy: "default" } });
  return { contents, open, onError };
}

describe("embedded browser popup navigation", () => {
  it.each([
    "https://arxiv.org/pdf/2609.29892",
    "https://arxiv.org/abs/2609.29892",
    "https://example.org/project?q=paper#results",
    "http://localhost:5194/article.html",
  ])("keeps %s in the originating pane and denies a native window", async (url) => {
    const { contents, open } = setup();
    expect(open(url)).toEqual({ action: "deny" });
    expect(contents.loadURL).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(contents.loadURL).toHaveBeenCalledWith(url);
  });

  it("does not launch other applications or load privileged schemes", async () => {
    const { contents, open } = setup();
    for (const url of ["mailto:test@example.org", "file:///etc/passwd", "javascript:alert(1)", "about:blank", "invalid"])
      expect(open(url)).toEqual({ action: "deny" });
    await Promise.resolve();
    expect(contents.loadURL).not.toHaveBeenCalled();
  });

  it("ignores a closed pane and reports failed loads without an external fallback", async () => {
    const { contents, open, onError } = setup();
    open("https://example.org/closed");
    contents.isDestroyed.mockReturnValue(true);
    await Promise.resolve();
    expect(contents.loadURL).not.toHaveBeenCalled();
    contents.isDestroyed.mockReturnValue(false);
    const error = new Error("network unavailable");
    contents.loadURL.mockRejectedValueOnce(error);
    open("https://example.org/failure");
    await Promise.resolve();
    await Promise.resolve();
    expect(onError).toHaveBeenCalledWith(error);
  });
});
