import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useNewsImageGallery } from "../useNewsImageGallery";
import { ReadingNotesWorkspace } from "../ReadingNotesLibrary";
import { useNewsCardTranslations } from "../useNewsCardTranslations";
import type { PaperNewsItem } from "../../../shared/paper-news";
import type { ReadingNote } from "../../../shared/browser-reading";
const item = (id: string): PaperNewsItem => ({
  id,
  source: "qbitai",
  title: id,
  url: `https://www.qbitai.com/${id}`,
  summary: "Summary",
  date: "2026-09-26",
  authors: [],
  tags: [],
  matchedTopics: [],
  score: 1,
});
const cover = {
  kind: "source-image",
  dataUrl: "data:image/jpeg;base64,eA==",
  sourceUrl: "https://www.qbitai.com/image.jpg",
};
let renderer: ReactTestRenderer | undefined;
let gallery: ReturnType<typeof useNewsImageGallery>;
const fetchCover = vi.fn<(id: string) => Promise<any>>();
function Gallery({
  items,
  enabled,
  mode,
}: {
  items: PaperNewsItem[];
  enabled: boolean;
  mode?: "gallery" | "inline";
}) {
  gallery = useNewsImageGallery(items, enabled, mode);
  return null;
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  fetchCover.mockReset();
  vi.stubGlobal("window", { electronAPI: { getPaperNewsCover: fetchCover } });
});
afterEach(async () => {
  if (renderer) await act(async () => renderer!.unmount());
  renderer = undefined;
  vi.unstubAllGlobals();
});
it("keeps text mode free of image requests, excludes missing images, and preserves source order", async () => {
  fetchCover.mockImplementation(async (id) => (id === "b" ? null : cover));
  const items = [
    item("a"),
    item("b"),
    item("c"),
    { ...item("paper"), source: "arxiv" as const },
  ];
  await act(async () => {
    renderer = create(React.createElement(Gallery, { items, enabled: false }));
  });
  expect(fetchCover).not.toHaveBeenCalled();
  await act(async () => {
    renderer!.update(React.createElement(Gallery, { items, enabled: true }));
  });
  expect(gallery.items.map((i) => i.id)).toEqual(["a", "c"]);
  expect(gallery.checked).toBe(3);
  expect(gallery.total).toBe(3);
  await act(async () => gallery.reject(items[0]));
  expect(gallery.items.map((i) => i.id)).toEqual(["c"]);
});
it("checks only a bounded batch and reuses verified covers when switching modes", async () => {
  fetchCover.mockResolvedValue(cover);
  const items = Array.from({ length: 15 }, (_, i) => item(String(i)));
  await act(async () => {
    renderer = create(React.createElement(Gallery, { items, enabled: true }));
  });
  expect(fetchCover).toHaveBeenCalledTimes(12);
  expect(gallery.hasMore).toBe(true);
  await act(async () => gallery.loadMore());
  expect(fetchCover).toHaveBeenCalledTimes(15);
  await act(async () => {
    renderer!.update(React.createElement(Gallery, { items, enabled: false }));
  });
  await act(async () => {
    renderer!.update(React.createElement(Gallery, { items, enabled: true }));
  });
  expect(fetchCover).toHaveBeenCalledTimes(15);
});
it("limits concurrent cover requests and stops scheduling when image mode is closed", async () => {
  const resolve: Array<(v: any) => void> = [];
  fetchCover.mockImplementation(() => new Promise((r) => resolve.push(r)));
  const items = [item("a"), item("b"), item("c")];
  await act(async () => {
    renderer = create(React.createElement(Gallery, { items, enabled: true }));
  });
  expect(fetchCover).toHaveBeenCalledTimes(2);
  await act(async () => {
    renderer!.update(React.createElement(Gallery, { items, enabled: false }));
    resolve[0](cover);
    resolve[1](cover);
  });
  expect(fetchCover).toHaveBeenCalledTimes(2);
});
it("treats rejected and PDF previews as unavailable instead of leaving empty gallery cards", async () => {
  fetchCover
    .mockRejectedValueOnce(new Error("network"))
    .mockResolvedValueOnce({ ...cover, kind: "pdf-page" });
  await act(async () => {
    renderer = create(
      React.createElement(Gallery, {
        items: [item("a"), item("b")],
        enabled: true,
      }),
    );
  });
  expect(gallery.items).toHaveLength(0);
  expect(gallery.checking).toBe(false);
});
it("resolves paper and repository covers in the stream while leaving unavailable entries in the parent list", async () => {
  const items = [
    { ...item("paper"), source: "arxiv" as const },
    { ...item("repo"), source: "github" as const },
    { ...item("health"), source: "who" as const },
  ];
  fetchCover.mockImplementation(async (id) => id === "paper" ? { ...cover, kind: "pdf-page" } : id === "repo" ? cover : null);
  await act(async () => {
    renderer = create(React.createElement(Gallery, { items, enabled: true, mode: "inline" }));
  });
  expect(fetchCover.mock.calls.map(([id]) => id)).toEqual(["paper", "repo", "health"]);
  expect(gallery.cover(items[0])?.kind).toBe("pdf-page");
  expect(gallery.cover(items[1])?.kind).toBe("source-image");
  expect(gallery.cover(items[2])).toBeNull();
  expect(gallery.checking).toBe(false);
  await act(async () => {
    renderer!.update(React.createElement(Gallery, { items, enabled: false, mode: "inline" }));
    renderer!.update(React.createElement(Gallery, { items, enabled: true, mode: "inline" }));
  });
  expect(fetchCover).toHaveBeenCalledTimes(3);
});
const notes: ReadingNote[] = [
  {
    id: "old",
    url: "https://arxiv.org/pdf/123",
    title: "论文笔记",
    text: "论文正文",
    quote: "original passage",
    page: 7,
    createdAt: 1,
  },
  {
    id: "new",
    url: "https://www.qbitai.com/1",
    title: "产业笔记",
    text: "最新产业观点",
    quote: "",
    createdAt: 2,
  },
];
it("shows one note at a time and searches the full note content", async () => {
  await act(async () => {
    renderer = create(
      React.createElement(ReadingNotesWorkspace, {
        notes,
        onOpen: () => {},
        onDelete: () => {},
      }),
    );
  });
  expect(renderer!.root.findByType("h2").children).toEqual(["产业笔记"]);
  await act(async () =>
    renderer!.root
      .findByType("input")
      .props.onChange({ target: { value: "original passage" } }),
  );
  expect(renderer!.root.findByType("h2").children).toEqual(["论文笔记"]);
  expect(renderer!.root.findByType("details").props.open).toBeUndefined();
  await act(async () =>
    renderer!.root
      .findByType("input")
      .props.onChange({ target: { value: "does not exist" } }),
  );
  expect(renderer!.root.findByType("h2").children).toEqual(["没有匹配的笔记"]);
});
it("switches notes, opens the selected source and forwards deletion to the store", async () => {
  const open = vi.fn(),
    remove = vi.fn();
  await act(async () => {
    renderer = create(
      React.createElement(ReadingNotesWorkspace, {
        notes,
        onOpen: open,
        onDelete: remove,
      }),
    );
  });
  const entries = renderer!.root.findAllByProps({
    className: "br-library-entry",
  });
  await act(async () => entries[1].props.onClick());
  await act(async () =>
    renderer!.root.findByProps({ className: "br-note-source" }).props.onClick(),
  );
  expect(open).toHaveBeenCalledWith(notes[0]);
  await act(async () =>
    renderer!.root
      .findByProps({ "aria-label": "删除当前笔记" })
      .props.onClick(),
  );
  expect(remove).toHaveBeenCalledWith("old");
  await act(async () =>
    renderer!.update(
      React.createElement(ReadingNotesWorkspace, {
        notes: [notes[1]],
        onOpen: open,
        onDelete: remove,
      }),
    ),
  );
  expect(renderer!.root.findByType("h2").children).toEqual(["产业笔记"]);
});

it("observes image cards that arrive after translation was enabled", async () => {
  let mutation: () => void = () => {};
  let intersect: (entries: any[]) => void = () => {};
  const observe = vi.fn(),
    disconnect = vi.fn();
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: typeof intersect) {
        intersect = callback;
      }
      observe = observe;
      unobserve = vi.fn();
      disconnect = disconnect;
    },
  );
  vi.stubGlobal(
    "MutationObserver",
    class {
      constructor(callback: typeof mutation) {
        mutation = callback;
      }
      observe = vi.fn();
      disconnect = vi.fn();
    },
  );
  const card = { getAttribute: () => "english" };
  const cards: (typeof card)[] = [];
  const root = {
    current: { querySelectorAll: () => cards, contains: () => true },
  };
  const items = [
    {
      ...item("english"),
      title: "A detailed report on artificial intelligence",
    },
  ];
  const translate = vi.fn().mockResolvedValue({ error: "failed" });
  vi.stubGlobal("window", { electronAPI: { translateNewsCard: translate } });
  let translations: ReturnType<typeof useNewsCardTranslations>;
  function Translations() {
    translations = useNewsCardTranslations(items, root as any);
    return null;
  }
  await act(async () => {
    renderer = create(React.createElement(Translations));
  });
  await act(async () => translations.toggle());
  expect(observe).not.toHaveBeenCalled();
  cards.push(card);
  await act(async () => {
    mutation();
  });
  expect(observe).toHaveBeenCalledWith(card);
  await act(async () => {
    intersect([{ target: card, isIntersecting: true }]);
  });
  expect(translate).toHaveBeenCalledWith("english");
});
