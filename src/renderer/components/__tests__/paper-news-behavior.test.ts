import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PAPER_NEWS_CONFIG, type PaperNewsSnapshot } from "../../../shared/paper-news";
import { applyPersistedLanguage, getCurrentLanguage } from "../../i18n";
import { PaperNewsPanel } from "../PaperNewsPanel";

vi.mock("../BrowserWorkbenchView", () => ({
  BrowserWorkbenchView: (props: { initialUrl: string; onClose: () => void }) =>
    React.createElement(
      "button",
      { "data-preview-url": props.initialUrl, onClick: props.onClose },
      "Close browser",
    ),
}));
const originalLanguage = getCurrentLanguage();
let renderer: ReactTestRenderer | undefined;
let state: PaperNewsSnapshot;
let refresh: ReturnType<typeof vi.fn>;
let external: ReturnType<typeof vi.fn>;
async function mount() {
  await act(async () => {
    renderer = create(React.createElement(PaperNewsPanel, { onUsePrompt: () => {} }));
  });
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  applyPersistedLanguage("en");
  state = {
    config: structuredClone(DEFAULT_PAPER_NEWS_CONFIG),
    saved: [],
    refreshing: false,
    sources: {
      arxiv: { updatedAt: "2000-01-01", error: "network" },
    } as PaperNewsSnapshot["sources"],
    items: [
      {
        id: "arxiv:test",
        source: "arxiv",
        title: "A test paper",
        summary: "A real summary",
        url: "https://arxiv.org/abs/1234.5678",
        pdfUrl: "https://arxiv.org/pdf/1234.5678",
        authors: [],
        tags: [],
        matchedTopics: [],
        score: 80,
        date: new Date().toISOString(),
      },
    ],
  };
  refresh = vi.fn(async () => state);
  external = vi.fn(async () => {});
  vi.stubGlobal("window", {
    setInterval,
    clearInterval,
    electronAPI: {
      getPaperNews: vi.fn(async () => state),
      refreshPaperNews: refresh,
      openExternal: external,
    },
  });
});
afterEach(async () => {
  if (renderer) await act(async () => renderer!.unmount());
  renderer = undefined;
  applyPersistedLanguage(originalLanguage);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe("News Feed cache and browser behavior", () => {
  it("does not refresh stale or failed sources on entry, re-entry or clock ticks", async () => {
    await mount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    await act(async () => renderer!.unmount());
    await mount();
    expect(refresh).not.toHaveBeenCalled();
    const button = renderer!.root
      .findAllByType("button")
      .find((b) => b.children.includes("Refresh"))!;
    expect(button).toBeDefined();
    await act(async () => {
      await button.props.onClick();
    });
    expect(refresh).toHaveBeenCalledTimes(1);
  });
  it("observes an in-flight refresh without starting another", async () => {
    state.refreshing = true;
    await mount();
    state = { ...state, refreshing: false };
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_100);
    });
    expect(refresh).not.toHaveBeenCalled();
    const button = renderer!.root
      .findAllByType("button")
      .find((b) => b.children.includes("Refresh"))!;
    expect(button.props.disabled).toBeFalsy();
  });
  it("opens titles and PDFs in the workbench and Source in the system browser", async () => {
    await mount();
    const title = renderer!.root
      .findAllByType("button")
      .find((b) => b.children.includes("A test paper"))!;
    await act(async () => title.props.onClick({ currentTarget: { focus: () => {} } }));
    expect(renderer!.root.findByProps({ "data-preview-url": state.items[0].url })).toBeDefined();
    expect(external).not.toHaveBeenCalled();
    await act(async () =>
      renderer!.root.findByProps({ "data-preview-url": state.items[0].url }).props.onClick(),
    );
    const pdf = renderer!.root.findAllByType("button").find((b) => b.children.includes("PDF"))!;
    await act(async () => pdf.props.onClick({ currentTarget: { focus: () => {} } }));
    expect(renderer!.root.findByProps({ "data-preview-url": state.items[0].pdfUrl })).toBeDefined();
    const source = renderer!.root
      .findAllByType("button")
      .find((b) => b.props.title === "Open in default browser")!;
    await act(async () => {
      await source.props.onClick();
    });
    expect(external).toHaveBeenCalledWith(state.items[0].url);
  });
});
