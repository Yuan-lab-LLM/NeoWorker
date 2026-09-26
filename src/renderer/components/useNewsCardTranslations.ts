import { useEffect, useRef, useState, type RefObject } from "react";
import type { PaperNewsItem } from "../../shared/paper-news";
import {
  newsTranslationKey,
  needsNewsTranslation,
  type NewsTranslation,
  type NewsTranslationResult,
} from "../../shared/news-translation";

type Entry =
  | { status: "loading" }
  | { status: "done"; value: NewsTranslation }
  | { status: "error"; error: string };
/** Only translate visible cards after explicit opt-in; keep originals and never block navigation. */
export function useNewsCardTranslations(
  items: PaperNewsItem[],
  root: RefObject<HTMLElement | null>,
  filterKey = "",
) {
  const [enabled, setEnabled] = useState(false);
  const [revision, update] = useState(0);
  const cache = useRef(new Map<string, Entry>());
  const visible = useRef(new Set<string>());
  const inFlight = useRef(0);
  const mounted = useRef(false);
  const current = useRef({ enabled, items });
  current.current = { enabled, items };
  const pumpRef = useRef<() => void>(() => {});
  const modelUnavailable = useRef(false);
  pumpRef.current = () => {
    if (
      !mounted.current ||
      !current.current.enabled ||
      modelUnavailable.current
    )
      return;
    const eligible = current.current.items.filter(
      (item) => visible.current.has(item.id) && needsNewsTranslation(item),
    );
    for (const item of eligible) {
      if (inFlight.current >= 2) break;
      const key = newsTranslationKey(item);
      if (cache.current.has(key)) continue;
      cache.current.set(key, { status: "loading" });
      inFlight.current++;
      update((n) => n + 1);
      const request = async () => {
        let result: NewsTranslationResult;
        try {
          result = await window.electronAPI.translateNewsCard(item.id);
        } catch {
          result = { error: "failed" };
        }
        if (
          "translation" in result &&
          result.translation.originalTitle === item.title &&
          result.translation.originalSummary === item.summary
        ) {
          cache.current.set(key, { status: "done", value: result.translation });
        } else {
          const error = "error" in result ? result.error : "failed";
          cache.current.set(key, { status: "error", error });
          if (error === "model") modelUnavailable.current = true;
        }
        inFlight.current--;
        if (mounted.current) {
          update((n) => n + 1);
          pumpRef.current();
        }
      };
      void request();
    }
  };
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    visible.current.clear();
    if (!enabled || !root.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = entry.target.getAttribute("data-news-id");
          if (!id) continue;
          if (entry.isIntersecting) visible.current.add(id);
          else visible.current.delete(id);
        }
        pumpRef.current();
      },
      { root: root.current, rootMargin: "100px 0px" },
    );
    root.current
      .querySelectorAll("[data-news-id]")
      .forEach((card) => observer.observe(card));
    return () => {
      observer.disconnect();
      visible.current.clear();
    };
  }, [enabled, items, root, filterKey]);
  return {
    enabled,
    revision,
    searchText: (item: PaperNewsItem) => {
      const entry = cache.current.get(newsTranslationKey(item));
      return enabled && entry?.status === "done"
        ? `${entry.value.title} ${entry.value.summary}`
        : "";
    },
    toggle: () => setEnabled((value) => !value),
    modelUnavailable: modelUnavailable.current,
    entry: (item: PaperNewsItem) =>
      enabled ? cache.current.get(newsTranslationKey(item)) : undefined,
    retry: (item: PaperNewsItem) => {
      const key = newsTranslationKey(item);
      if (cache.current.get(key)?.status !== "error") return;
      cache.current.delete(key);
      modelUnavailable.current = false;
      pumpRef.current();
    },
  };
}
