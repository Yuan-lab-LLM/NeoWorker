import { useEffect, useRef, useState } from "react";
import type { PaperNewsCover, PaperNewsItem } from "../../shared/paper-news";
import { hasNewsImages } from "../../shared/news-images";
const BATCH_SIZE = 12;
const keyFor = (item: PaperNewsItem) =>
  JSON.stringify([item.id, item.url, item.imageUrl, item.date, item.title]);

/** Resolve a bounded batch before admitting cards to the image-only view. */
export function useNewsImageGallery(items: PaperNewsItem[], enabled: boolean) {
  const candidates = items.filter((item) => hasNewsImages(item.source));
  const scope = JSON.stringify(candidates.map(keyFor));
  const [page, setPage] = useState({ scope, limit: BATCH_SIZE });
  const limit = page.scope === scope ? page.limit : BATCH_SIZE;
  const batch = candidates.slice(0, limit);
  const cache = useRef(new Map<string, PaperNewsCover | null>());
  const pending = useRef(new Set<string>());
  const mounted = useRef(false);
  const [revision, update] = useState(0);
  const current = useRef({ batch, enabled });
  current.current = { batch, enabled };
  const pump = useRef<() => void>(() => {});
  pump.current = () => {
    if (!mounted.current || !current.current.enabled) return;
    for (const item of current.current.batch) {
      if (pending.current.size >= 2) break;
      const key = keyFor(item);
      if (cache.current.has(key) || pending.current.has(key)) continue;
      pending.current.add(key);
      void window.electronAPI
        .getPaperNewsCover(item.id)
        .then((cover) =>
          cache.current.set(key, cover?.kind === "source-image" ? cover : null),
        )
        .catch(() => cache.current.set(key, null))
        .finally(() => {
          pending.current.delete(key);
          if (mounted.current) {
            update((n) => n + 1);
            pump.current();
          }
        });
    }
  };
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    pump.current();
  }, [enabled, scope, limit]);
  const checked = batch.filter((item) =>
    cache.current.has(keyFor(item)),
  ).length;
  return {
    revision,
    items: batch.filter((item) => Boolean(cache.current.get(keyFor(item)))),
    cover: (item: PaperNewsItem) => cache.current.get(keyFor(item)) || null,
    reject: (item: PaperNewsItem) => {
      cache.current.set(keyFor(item), null);
      update((n) => n + 1);
    },
    checking: enabled && checked < batch.length,
    checked,
    total: candidates.length,
    hasMore: batch.length < candidates.length,
    loadMore: () => setPage({ scope, limit: limit + BATCH_SIZE }),
  };
}
