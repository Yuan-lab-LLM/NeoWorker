import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PanelResizeHandle } from "../PanelResizeHandle";
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
  renderer!.root
    .findAllByType("button")
    .find((b) => b.children.some((c) => c === label))!;
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
    expect(renderer!.root.findByType("textarea").props.value).toBe(
      "Explain the evidence",
    );
    expect(
      renderer!.root.findByProps({ role: "alert" }).children.join(""),
    ).toContain("Network unavailable");
    await act(async () =>
      renderer!.root.findByType("form").props.onSubmit({ preventDefault() {} }),
    );
    expect(ask).toHaveBeenCalledTimes(2);
  });
});

describe("reading workspace controls", () => {
  it("finds and searches notes saved from other articles", async () => {
    store.set(
      "neoworker.reading-notes.v1",
      JSON.stringify([
        {
          id: "old",
          title: "Previous paper",
          url: "https://example.org/old.pdf",
          text: "Key evidence",
          page: 3,
          createdAt: 1,
        },
      ]),
    );
    await mount();
    await act(async () => button("笔记").props.onClick());
    expect(renderer!.root.findAllByType("article")).toHaveLength(0);
    await act(async () => button("全部笔记").props.onClick());
    expect(renderer!.root.findAllByType("article")).toHaveLength(1);
    const search = renderer!.root.findByProps({ "aria-label": "搜索阅读笔记" });
    await act(async () =>
      search.props.onChange({ target: { value: "not found" } }),
    );
    expect(renderer!.root.findAllByType("article")).toHaveLength(0);
    await act(async () =>
      search.props.onChange({ target: { value: "evidence" } }),
    );
    expect(renderer!.root.findAllByType("article")).toHaveLength(1);
  });
  it("resizes the assistant without losing the draft or exposing a duplicate fullscreen control", async () => {
    await mount();
    const input = renderer!.root.findByProps({
      "aria-label": "向阅读助手提问",
    });
    await act(async () =>
      input.props.onChange({ target: { value: "Keep this question" } }),
    );
    await act(async () =>
      renderer!.root.findByType(PanelResizeHandle).props.onChange(60),
    );
    expect(input.props.value).toBe("Keep this question");
    expect(
      renderer!.root.findByType("aside").props.style["--reading-width"],
    ).toBe("60%");
    expect(
      renderer!.root.findAllByProps({ "aria-label": "全屏阅读助手" }),
    ).toHaveLength(0);
  });
});

describe('selection toolbar recovery', () => {
  it('opens on the owned guest release event even while a poll is pending, and ignores a second tab with the same URL', async () => {
    vi.stubGlobal('document', {hidden:false});
    let notify!: (event: any) => void;
    let finishPoll!: (value: unknown) => void;
    window.electronAPI.getBrowserReadingSelection = vi.fn(() => new Promise(resolve => { finishPoll = resolve; })) as any;
    window.electronAPI.onBrowserReadingSelection = ((callback: any) => { notify = callback; return () => {}; }) as any;
    const guest = {getWebContentsId:()=>7, executeJavaScript:vi.fn(), getBoundingClientRect:()=>({left:0,top:0,width:900,height:600}),
      addEventListener:vi.fn(),removeEventListener:vi.fn(),findInPage:vi.fn(),loadURL:vi.fn()};
    await act(async()=>{ renderer = create(React.createElement(BrowserReadingAssistant,{...props,open:false,webviewRef:{current:guest as any}})); });
    const released = {webContentsId:7,coordinateSpace:'guest',pageURL:props.url,frameURL:props.url,text:'Released selection',x:200,y:450};
    await act(async()=>notify({...released,webContentsId:8}));
    expect(renderer!.root.findAllByProps({role:'toolbar'})).toHaveLength(0);
    await act(async()=>notify(released));
    expect(renderer!.root.findAllByProps({role:'toolbar'})).toHaveLength(1);
    await act(async()=>finishPoll(null));
    expect(renderer!.root.findAllByProps({role:'toolbar'})).toHaveLength(1);
    expect(ask).not.toHaveBeenCalled();
  });
  it('recovers a stalled navigation probe and ignores its late result', async () => {
    vi.useFakeTimers();
    try {
      vi.stubGlobal('document', {hidden:false});
      const listeners = new Map<string, (...args: any[]) => void>();
      let oldResult!: (value: unknown) => void;
      const executeJavaScript = vi.fn()
        .mockImplementationOnce(() => new Promise(resolve => { oldResult = resolve; }))
        .mockResolvedValue({text:'Selected article evidence',x:200,y:450});
      const guest = {executeJavaScript, getBoundingClientRect:()=>({left:0,top:0,right:900,bottom:600,width:900,height:600}),
        addEventListener:(name:string,fn:any)=>listeners.set(name,fn),removeEventListener:vi.fn(),findInPage:vi.fn(),loadURL:vi.fn()};
      await act(async()=>{ renderer = create(React.createElement(BrowserReadingAssistant,{...props,open:false,webviewRef:{current:guest as any}})); });
      await act(async()=>{ await vi.advanceTimersByTimeAsync(300); });
      expect(executeJavaScript).toHaveBeenCalledOnce();
      await act(async()=>listeners.get('dom-ready')!());
      expect(renderer!.root.findAllByProps({role:'toolbar'})).toHaveLength(1);
      await act(async()=>oldResult(null));
      expect(renderer!.root.findAllByProps({role:'toolbar'})).toHaveLength(1);
      expect(ask).not.toHaveBeenCalled();
      const preventDefault=vi.fn();
      renderer!.root.findByProps({role:'toolbar'}).props.onMouseDown({preventDefault});
      expect(preventDefault).toHaveBeenCalledOnce();
      await act(async()=>button('提问').props.onClick());
      expect(props.onOpen).toHaveBeenCalledWith(true);
      expect(renderer!.root.findAllByProps({role:'toolbar'})).toHaveLength(0);
    } finally { vi.useRealTimers(); }
  });
});
