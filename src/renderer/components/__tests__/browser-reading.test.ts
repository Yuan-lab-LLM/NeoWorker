import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BrowserReadingAssistant } from "../BrowserReadingAssistant";
let renderer: ReactTestRenderer | undefined;
let ask: ReturnType<typeof vi.fn>, cancel: ReturnType<typeof vi.fn>;
let store: Map<string, string>;
const result = {
  text: "这是观点。[段落1]",
  model: "test",
  context: {
    url: "https://example.org/",
    title: "Paper",
    scope: "webpage",
    blocks: [{ id: "段落1", text: "Original evidence" }],
    truncated: false,
  },
};
const props = {
  taskId: "task",
  sessionId: "browser",
  url: "https://example.org/",
  title: "Paper",
  ready: true,
  open: true,
  onOpen: vi.fn(),
  webviewRef: { current: null },
};
async function mount() {
  await act(async () => {
    renderer = create(React.createElement(BrowserReadingAssistant, props));
  });
}
const button = (label: string) =>
  renderer!.root.findAllByType("button").find((b) => b.children.some((c) => c === label))!;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  store = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k),
    setItem: (k: string, v: string) => store.set(k, v),
  });
  ask = vi.fn(async () => result);
  cancel = vi.fn(async () => {});
  vi.stubGlobal("window", {
    electronAPI: { askBrowserReading: ask, cancelBrowserReading: cancel },
  });
});
afterEach(async () => {
  if (renderer) await act(async () => renderer!.unmount());
  renderer = undefined;
  vi.unstubAllGlobals();
});
describe("reading assistant state", () => {
  it("persists notes with actual source evidence and restores them after remount", async () => {
    await mount();
    await act(async () => button("这篇内容主要讲了什么？").props.onClick());
    await act(async () => button("存为笔记").props.onClick());
    const notes = JSON.parse([...store.values()][0]);
    expect(notes[0]).toMatchObject({
      url: props.url,
      text: result.text,
      quote: "Original evidence",
    });
    await act(async () => renderer!.unmount());
    await mount();
    await act(async () => button("笔记").props.onClick());
    expect(renderer!.root.findAllByType("article")).toHaveLength(1);
  });
  it("cancels on unmount and does not apply a late model answer to a new page", async () => {
    let resolve!: (value: unknown) => void;
    ask.mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    await mount();
    await act(async () => {
      button("这篇内容主要讲了什么？").props.onClick();
    });
    const id = ask.mock.calls[0][0].requestId;
    await act(async () => renderer!.unmount());
    renderer = undefined;
    expect(cancel).toHaveBeenCalledWith(id);
    await act(async () => resolve(result));
  });
  it("keeps the question available and exposes errors for retry", async () => {
    ask.mockRejectedValueOnce(new Error("Network unavailable"));
    await mount();
    await act(async () =>
      renderer!.root
        .findByType("textarea")
        .props.onChange({ target: { value: "Explain the evidence" } }),
    );
    await act(async () =>
      renderer!.root.findByType("form").props.onSubmit({ preventDefault() {} }),
    );
    expect(renderer!.root.findByType("textarea").props.value).toBe("Explain the evidence");
    expect(renderer!.root.findByProps({ role: "alert" }).children.join("")).toContain(
      "Network unavailable",
    );
    await act(async () =>
      renderer!.root.findByType("form").props.onSubmit({ preventDefault() {} }),
    );
    expect(ask).toHaveBeenCalledTimes(2);
  });
});
