import { useEffect, useRef, useState, type RefObject } from "react";
import type { PaperNewsItem } from "../../shared/paper-news";
import type { NewsSummaryResult } from "../../shared/news-summary";
import { isNewsPublisher } from "../../shared/news-sources";

const keyFor = (item: PaperNewsItem) =>
  JSON.stringify([item.id, item.url, item.title]);
const hostFor = (item: PaperNewsItem) => {
  try {
    return new URL(item.url).hostname;
  } catch {
    return item.source;
  }
};
type Entry = {
  status: "loading" | "done" | "busy" | "blocked" | "unavailable" | "failed";
  attempts: number;
};

/** Fetch public excerpts for visible cards; pace each publisher and never retry errors in a loop. */
export function useNewsAutoSummaries(
  items: PaperNewsItem[],
  root: RefObject<HTMLElement | null>,
  onSummary: (
    item: PaperNewsItem,
    result: Extract<NewsSummaryResult, { summary: string }>,
  ) => void,
) {
  const [, render] = useState(0);
  const entries = useRef(new Map<string, Entry>());
  const visible = useRef(new Set<string>());
  const activeHosts = useRef(new Set<string>());
  const nextHostRequest = useRef(new Map<string, number>());
  const mounted = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const current = useRef({ items, onSummary });
  current.current = { items, onSummary };
  const pump = useRef<() => void>(() => {});
  pump.current = () => {
    clearTimeout(timer.current);
    if (!mounted.current) return;
    let nextWake = Infinity;
    for (const item of current.current.items) {
      if (activeHosts.current.size >= 2) break;
      if (
        !visible.current.has(item.id) ||
        item.summary.trim() ||
        !isNewsPublisher(item.source)
      )
        continue;
      const key = keyFor(item);
      const previous = entries.current.get(key);
      if (previous && !(previous.status === "busy" && previous.attempts < 3))
        continue;
      const host = hostFor(item);
      if (activeHosts.current.has(host)) continue;
      const delay = (nextHostRequest.current.get(host) || 0) - Date.now();
      if (delay > 0) {
        nextWake = Math.min(nextWake, delay);
        continue;
      }
      const attempts = (previous?.attempts || 0) + 1;
      entries.current.set(key, { status: "loading", attempts });
      activeHosts.current.add(host);
      render((n) => n + 1);
      void (async () => {
        let result: NewsSummaryResult;
        try {
          result = await window.electronAPI.getNewsSummary(item.id);
        } catch {
          result = { error: "failed" };
        }
        entries.current.set(key, {
          status: "summary" in result ? "done" : result.error,
          attempts,
        });
        activeHosts.current.delete(host);
        // Match the main-process host cooldown; failures need an explicit retry.
        const delay =
          "summary" in result || result.error === "unavailable"
            ? 1700
            : result.error === "busy"
              ? 2000
              : 60_000;
        nextHostRequest.current.set(host, Date.now() + delay);
        if (mounted.current) {
          if ("summary" in result) current.current.onSummary(item, result);
          render((n) => n + 1);
          pump.current();
        }
      })();
    }
    if (Number.isFinite(nextWake))
      timer.current = setTimeout(() => pump.current(), nextWake);
  };
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimeout(timer.current);
    };
  }, []);
  // A stable identity list prevents status/summary updates from recreating the observer.
  const observedItems = JSON.stringify(
    items.map((item) => [item.id, item.url, item.title]),
  );
  useEffect(() => {
    visible.current.clear();
    if (!root.current) return;
    const observer = new IntersectionObserver(
      (changes) => {
        for (const entry of changes) {
          const id = entry.target.getAttribute("data-news-id");
          if (!id) continue;
          if (entry.isIntersecting) visible.current.add(id);
          else visible.current.delete(id);
        }
        pump.current();
      },
      { root: root.current, rootMargin: "0px" },
    );
    root.current
      .querySelectorAll("[data-news-id]")
      .forEach((card) => observer.observe(card));
    return () => {
      observer.disconnect();
      visible.current.clear();
      clearTimeout(timer.current);
    };
  }, [root, observedItems]);
  return {
    status: (item: PaperNewsItem) => entries.current.get(keyFor(item))?.status,
    retry: (item: PaperNewsItem) => {
      const entry = entries.current.get(keyFor(item));
      if (!entry || entry.status === "loading" || entry.status === "done")
        return;
      entries.current.delete(keyFor(item));
      render((n) => n + 1);
      pump.current();
    },
  };
}
