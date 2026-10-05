import { NewsCategoryNavigation } from "../NewsCategoryNavigation";
import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PAPER_NEWS_CONFIG, type PaperNewsSnapshot } from "../../../shared/paper-news";
import { applyPersistedLanguage, getCurrentLanguage } from "../../i18n";
import { PaperNewsPanel } from "../PaperNewsPanel";
import { NeoWorkerSelectMenu } from "../NeoWorkerSelectMenu";

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
let stored: Map<string, string>;
let usePrompt: ReturnType<typeof vi.fn>;
async function mount() {
  await act(async () => {
    renderer = create(React.createElement(PaperNewsPanel, { onUsePrompt: usePrompt }));
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
  stored = new Map();
  usePrompt = vi.fn();
  vi.stubGlobal("window", {
    localStorage: { getItem: (key: string) => stored.get(key) ?? null, setItem: (key: string, value: string) => stored.set(key, value) },
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
  it("keeps all categories available while the background refresh is still running", async () => {
    state.refreshing = true;
    await mount();
    const navigation = renderer!.root.findByType(NewsCategoryNavigation);
    const choices = navigation.findAllByType("button");
    expect(choices).toHaveLength(11);
    expect(choices.every(choice => !choice.props.disabled)).toBe(true);
    await act(async () => choices.find(choice => choice.findByType("strong").children.includes("Policy & economy"))!.props.onClick());
    expect(navigation.props.category).toBe("policy");
    expect(refresh).not.toHaveBeenCalled();
  });
  it("fetches a newly opened category once and keeps subsequent visits cached", async () => {
    vi.stubGlobal("document", { documentElement: { lang: "en" }, addEventListener: vi.fn(), removeEventListener: vi.fn() });
    await mount();
    const navigation = renderer!.root.findByType(NewsCategoryNavigation);
    await act(async () => navigation.props.onSelect("health"));
    expect(refresh).toHaveBeenCalledWith(["who", "sciencedailyhealth"]);
    await act(async () => navigation.props.onSelect("all"));
    await act(async () => navigation.props.onSelect("health"));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

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
      .find((b) => b.children.includes("Refresh all sources"))!;
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
      .find((b) => b.children.includes("Refresh all sources"))!;
    expect(button.props.disabled).toBeFalsy();
  });
  it("keeps titles, PDFs and source links inside the NeoWorker browser", async () => {
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
      .find((b) => b.children.includes("Source"))!;
    await act(async () => {
      await source.props.onClick({ currentTarget: { focus: () => {} } });
    });
    expect(renderer!.root.findByProps({ "data-preview-url": state.items[0].url })).toBeDefined();
    expect(external).not.toHaveBeenCalled();
  });
});

describe("News display modes", () => {
  it.each(["stream", "cards"])("hides redundant translation for Chinese originals in %s but keeps English originals translatable", async mode => {
    applyPersistedLanguage("zh-CN");
    stored.set("neoworker.news.view", mode);
    state.items = [
      { ...state.items[0], id: "eetimes:chinese", source: "eetimes", title: "全球四足机器人出货量增长，中国企业贡献九成以上份额", summary: "报告指出，中国企业在全球市场快速增长。" },
      { ...state.items[0], id: "engadget:english", source: "engadget", title: "Do you really need a travel router?", summary: "Travel routers simplify connecting your devices." },
    ];
    await mount();
    const rows = renderer!.root.findAllByType("article");
    const chinese = rows.find(row => row.props["data-news-id"] === "eetimes:chinese")!;
    const english = rows.find(row => row.props["data-news-id"] === "engadget:english")!;
    expect(chinese.findAllByType("button").some(b => b.children.includes("全文翻译"))).toBe(false);
    const translate = english.findAllByType("button").find(b => b.children.includes("全文翻译"));
    expect(translate).toBeDefined();
    await act(async () => translate!.props.onClick({ currentTarget: { closest: () => ({ removeAttribute() {} }) } }));
    expect(usePrompt).toHaveBeenCalledOnce();
  });

  it("filters by the application source selector and provides a brand for each source option", async () => {
    state.items.push({ ...state.items[0], id: "github:test", source: "github", title: "Example project" });
    await mount();
    const select = renderer!.root.findAllByType(NeoWorkerSelectMenu).find(node => node.props.ariaLabel === "Filter sources")!;
    expect(select.props.options.every((option: any) => option.icon)).toBe(true);
    await act(async () => select.props.onValueChange("github"));
    expect(articles()).toEqual(["github:test"]);
    await act(async () => select.props.onValueChange("all"));
    expect(articles()).toHaveLength(2);
  });
  const articles = () => renderer!.root.findAllByType("article").map(node => node.props["data-news-id"]);
  const button = (name: string) => renderer!.root.findAllByType("button").find(node => node.children.includes(name))!;
  it("loads article media in both modes and preserves all three card actions", async () => {
    stored.set("neoworker.news.view", "cards");
    state.items = [{ ...state.items[0], id: "qbitai:cover", source: "qbitai" }];
    window.electronAPI.getPaperNewsCover = vi.fn(async () => ({ kind: "source-image" as const, dataUrl: "data:image/jpeg;base64,eA==", sourceUrl: "https://www.qbitai.com/image.jpg" }));
    await mount();
    expect(window.electronAPI.getPaperNewsCover).toHaveBeenCalledOnce();
    const actions = renderer!.root.findByProps({ className: "pn-card-actions" });
    expect(actions.findAllByType("details")).toHaveLength(0);
    expect(actions.findAllByType("button")).toHaveLength(3);
    for (const action of actions.findAllByType("button")) {
      await act(async () => action.props.onClick());
    }
    expect(usePrompt.mock.calls.map(call => call[1].newsContext.action)).toEqual(["read", "translate", "research"]);
    await act(async () => button("Feed").props.onClick());
    expect(window.electronAPI.getPaperNewsCover).toHaveBeenCalledOnce();
    expect(renderer!.root.findAllByProps({ className: "pn-article-image" })).toHaveLength(1);
    await act(async () => button("Cards").props.onClick());
    expect(renderer!.root.findAllByProps({ className: "pn-article-image" })).toHaveLength(1);
    expect(window.electronAPI.getPaperNewsCover).toHaveBeenCalledOnce();
  });
  it("refreshes all sources while a category and a single source filter remain selected", async () => {
    state.sources.sciencedailyhealth = { updatedAt: "2000-01-01", nextRetryAt: new Date(Date.now() + 300_000).toISOString() };
    state.sources.who = { updatedAt: "2000-01-01" };
    state.items.push({ ...state.items[0], id: "sciencedailyhealth:test", source: "sciencedailyhealth" });
    await mount();
    await act(async () => renderer!.root.findByType(NewsCategoryNavigation).props.onSelect("health"));
    const select = renderer!.root.findAllByType(NeoWorkerSelectMenu).find(node => node.props.ariaLabel === "Filter sources")!;
    await act(async () => select.props.onValueChange("sciencedailyhealth"));
    expect(button("Refresh all sources").props.disabled).toBeFalsy();
    await act(async () => button("Refresh all sources").props.onClick());
    expect(refresh).toHaveBeenCalledExactlyOnceWith();
    expect(select.props.value).toBe("sciencedailyhealth");
    const row = renderer!.root.findByType("article");
    expect(row.children.map((node: any) => node.props.className)).toEqual(["pn-card-media", "pn-card-content"]);
  });
  it("defaults to stream and remembers cards without hiding items lacking images", async () => {
    state.items.push({ ...state.items[0], id: "qbitai:empty", source: "qbitai", title: "No cover" });
    window.electronAPI.getPaperNewsCover = vi.fn(async () => null);
    await mount();
    expect(renderer!.root.findByProps({ "data-view-mode": "stream" })).toBeDefined();
    const before = articles();
    expect(before).toHaveLength(2);
    const fallbacks = renderer!.root.findAllByProps({ className: "pn-article-image pn-image-empty" });
    expect(fallbacks).toHaveLength(2);
    expect(fallbacks.every(node => node.findAllByType("button").length === 0)).toBe(true);
    expect(fallbacks.map(node => node.findByType("small").children.join(""))).toEqual(["arXiv", "QbitAI"]);
    expect(fallbacks.every(node => node.findAllByType("strong").length === 0)).toBe(true);
    await act(async () => button("Cards").props.onClick());
    expect(articles()).toEqual(before);
    expect(stored.get("neoworker.news.view")).toBe("cards");
    await act(async () => renderer!.unmount());
    await mount();
    expect(renderer!.root.findByProps({ "data-view-mode": "cards" })).toBeDefined();
    expect(articles()).toEqual(before);
  });
  it("reserves left-side media space while loading and never substitutes unrelated artwork on failure", async () => {
    let resolve!: (cover: any) => void;
    window.electronAPI.getPaperNewsCover = vi.fn(() => new Promise(r => { resolve = r; }));
    await mount();
    expect(renderer!.root.findAllByProps({ className: "pn-article-image pn-image-empty is-loading" })).toHaveLength(1);
    await act(async () => resolve({ kind: "source-image", dataUrl: "data:image/jpeg;base64,broken", sourceUrl: "https://arxiv.org/image.jpg" }));
    const image = renderer!.root.findByProps({ className: "pn-article-image" }).findByType("img");
    await act(async () => image.props.onError());
    expect(renderer!.root.findAllByProps({ className: "pn-article-image pn-image-empty" })).toHaveLength(1);
    expect(renderer!.root.findByType("article").props.className).not.toContain("pn-card-no-image");
    expect(articles()).toEqual(["arxiv:test"]);
    expect(window.electronAPI.getPaperNewsCover).toHaveBeenCalledOnce();
  });
  it("preserves search and loaded articles across view switches", async () => {
    state.items = Array.from({ length: 35 }, (_, index) => ({ ...state.items[0], id: `arxiv:${index}`, title: `Topic ${index}` }));
    await mount();
    expect(articles()).toHaveLength(30);
    const more = renderer!.root.findAllByType("button").find(node => node.children.includes("Load more"))!;
    await act(async () => more.props.onClick());
    expect(articles()).toHaveLength(35);
    await act(async () => button("Cards").props.onClick());
    expect(articles()).toHaveLength(35);
    const search = renderer!.root.findAllByType("input").find(node => node.props["aria-label"] === "Search fetched results")!;
    await act(async () => search.props.onChange({ target: { value: "Topic 34" } }));
    expect(articles()).toEqual(["arxiv:34"]);
    await act(async () => button("Feed").props.onClick());
    expect(articles()).toEqual(["arxiv:34"]);
  });
});
