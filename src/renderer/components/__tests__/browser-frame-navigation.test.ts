import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BrowserWorkbenchView } from "../BrowserWorkbenchView";
import { BrowserView } from "../BrowserView";

vi.mock("../MainContent", () => ({ ModelDropdown: () => null }));
vi.mock("../ArtifactTurnProgressPanel", () => ({ ArtifactTurnProgressPanel: () => null }));
vi.mock("../BrowserReadingAssistant", () => ({ BrowserReadingAssistant: () => null }));
vi.mock("../../hooks/useVoiceInput", () => ({ useVoiceInput: () => ({}) }));

const article = "https://www.engadget.com/2270789/travel-router-do-you-need-one/";
const serviceFrame = "https://news.google.com/swg/ui/v1/serviceiframe?publicationId=publication-id-free#ready";
let renderer: ReactTestRenderer;
let listeners: Map<string, (event: any) => void>;
let status: ReturnType<typeof vi.fn>;
let guest: any;
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  listeners = new Map();
  status = vi.fn();
  guest = {
    style: {}, setAttribute: vi.fn(), removeAttribute: vi.fn(),
    getURL: vi.fn(() => article), getTitle: () => "Travel router", getWebContentsId: () => 123,
    addEventListener: (name: string, handler: any) => listeners.set(name, handler),
    removeEventListener: (name: string) => listeners.delete(name),
  };
  const raf = (callback: () => void) => setTimeout(callback, 0);
  vi.stubGlobal("requestAnimationFrame", raf);
  vi.stubGlobal("cancelAnimationFrame", clearTimeout);
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  vi.stubGlobal("window", {
    requestAnimationFrame: raf, cancelAnimationFrame: clearTimeout,
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
    setTimeout, clearTimeout, setInterval, clearInterval,
    electronAPI: { updateBrowserWorkbenchStatus: status },
  });
});
afterEach(async () => {
  if (renderer) await act(async () => renderer.unmount());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
async function mount(kind: "workbench" | "legacy") {
  await act(async () => {
    renderer = create(kind === "workbench"
      ? React.createElement(BrowserWorkbenchView, { taskId: "qa", sessionId: "qa", initialUrl: article, mode: "sidebar", onClose() {}, onFullscreen() {}, onExitFullscreen() {}, onStatusChange: status })
      : React.createElement(BrowserView, { initialUrl: article, onBack() {} }), {
      createNodeMock: element => element.type === "webview" ? guest : {
        clientWidth: 1000, clientHeight: 700, getBoundingClientRect: () => ({ width: 1000, height: 700 }),
      },
    });
  });
  await act(async () => { await vi.runOnlyPendingTimersAsync(); });
  await act(async () => { await vi.runOnlyPendingTimersAsync(); });
  status.mockClear();
}
function address() {
  return renderer.root.findAllByType("input").find(node => node.props.value?.startsWith("https://"))!.props.value;
}
describe.each(["workbench", "legacy"] as const)("%s browser frame navigation", kind => {
  it("keeps the article and address intact when a subscription iframe updates its URL", async () => {
    await mount(kind);
    await act(async () => listeners.get("did-navigate-in-page")!({ url: serviceFrame, isMainFrame: false }));
    expect(address()).toBe(article);
    expect(renderer.root.findByType("webview").props.src).toBe(article);
    expect(status).not.toHaveBeenCalled();
  });
  it("continues tracking main-frame anchors, SPA routes and ordinary navigations", async () => {
    await mount(kind);
    for (const [event, url, isMainFrame] of [
      ["did-navigate-in-page", `${article}#specs`, true],
      ["did-navigate-in-page", "https://www.engadget.com/search?q=router", true],
      ["did-navigate", "https://www.engadget.com/next-article/", undefined],
    ] as const) {
      guest.getURL.mockReturnValue(url);
      await act(async () => listeners.get(event)!({ url, isMainFrame }));
      expect(address()).toBe(url);
      if (kind === "workbench") expect(renderer.root.findByType("webview").props.src).toBe(url);
    }
  });
});
