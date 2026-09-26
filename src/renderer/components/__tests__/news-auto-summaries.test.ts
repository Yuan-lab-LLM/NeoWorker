import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { PaperNewsItem } from "../../../shared/paper-news";
import { useNewsAutoSummaries } from "../useNewsAutoSummaries";

const article = (
  id: string,
  host = "www.eet-china.com",
  summary = "",
): PaperNewsItem => ({
  id,
  source: "eetimes",
  title: id,
  url: `https://${host}/${id}`,
  summary,
  authors: [],
  tags: [],
  matchedTopics: [],
  date: "2026-09-26",
  score: 1,
});
let renderer: ReactTestRenderer;
let observer: (entries: any[]) => void;
let api: ReturnType<typeof vi.fn>;
let merged = vi.fn<(item: PaperNewsItem, result: unknown) => void>();
let hook: ReturnType<typeof useNewsAutoSummaries>;
const root = { current: { querySelectorAll: () => [] } } as any;
function Harness({ items }: { items: PaperNewsItem[] }) {
  hook = useNewsAutoSummaries(items, root, (item, result) => {
    merged(item, result);
  });
  return null;
}
async function mount(items: PaperNewsItem[]) {
  await act(async () => {
    renderer = create(React.createElement(Harness, { items }));
  });
}
async function visible(ids: string[], isIntersecting = true) {
  await act(async () => {
    observer(
      ids.map((id) => ({ target: { getAttribute: () => id }, isIntersecting })),
    );
  });
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: typeof observer) {
        observer = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
  api = vi.fn(async () => ({
    summary: "Public article description",
    kind: "description",
  }));
  merged = vi.fn<(item: PaperNewsItem, result: unknown) => void>();
  vi.stubGlobal("window", { electronAPI: { getNewsSummary: api } });
});
afterEach(async () => {
  if (renderer) await act(async () => renderer.unmount());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it("only loads visible publishers lacking summaries, and deduplicates repeated observations", async () => {
  await mount([
    article("a"),
    article("b"),
    article("complete", "other.com", "Existing"),
    { ...article("paper"), source: "arxiv" },
  ]);
  expect(api).not.toHaveBeenCalled();
  await visible(["a", "complete", "paper"]);
  await visible(["a"]);
  expect(api.mock.calls).toEqual([["a"]]);
  expect(merged).toHaveBeenCalledTimes(1);
});
it("paces a publisher and drops queued cards that leave the viewport", async () => {
  await mount([article("a"), article("b"), article("c")]);
  await visible(["a", "b", "c"]);
  expect(api.mock.calls).toEqual([["a"]]);
  await visible(["b"], false);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1700);
  });
  expect(api.mock.calls).toEqual([["a"], ["c"]]);
});
it("limits concurrent requests to two different hosts", async () => {
  const resolvers: Array<(value: any) => void> = [];
  api.mockImplementation(
    () => new Promise((resolve) => resolvers.push(resolve)),
  );
  await mount([
    article("a", "a.com"),
    article("b", "b.com"),
    article("c", "c.com"),
  ]);
  await visible(["a", "b", "c"]);
  expect(api).toHaveBeenCalledTimes(2);
  await act(async () => {
    resolvers[0]({ summary: "Ready", kind: "description" });
  });
  expect(api).toHaveBeenCalledTimes(3);
});
it("retries transient busy responses only twice and supports explicit retry after a failure", async () => {
  api.mockResolvedValue({ error: "busy" });
  const item = article("a");
  await mount([item]);
  await visible(["a"]);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(20_000);
  });
  expect(api).toHaveBeenCalledTimes(3);
  expect(hook.status(item)).toBe("busy");
  api.mockResolvedValue({ summary: "Recovered", kind: "description" });
  await act(async () => hook.retry(item));
  expect(api).toHaveBeenCalledTimes(4);
  expect(hook.status(item)).toBe("done");
});
it("does not repeatedly fetch unavailable or blocked summaries", async () => {
  api.mockResolvedValue({ error: "blocked" });
  const item = article("a");
  await mount([item]);
  await visible(["a"]);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(120_000);
  });
  await visible(["a"]);
  expect(api).toHaveBeenCalledTimes(1);
  expect(hook.status(item)).toBe("blocked");
});
it("does not deliver pending results or schedule more work after unmount", async () => {
  let resolve!: (value: any) => void;
  api.mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  await mount([article("a"), article("b")]);
  await visible(["a", "b"]);
  await act(async () => renderer.unmount());
  await act(async () => resolve({ summary: "Late", kind: "description" }));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(60_000);
  });
  expect(api).toHaveBeenCalledTimes(1);
  expect(merged).not.toHaveBeenCalled();
});
