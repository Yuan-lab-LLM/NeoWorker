import { useEffect, useRef, useState } from "react";
import type { PaperNewsItem } from "../../shared/paper-news";

/** The main process fetches, validates and caches images. The renderer never hotlinks. */
export function NewsArticleImage({ item }: { item: PaperNewsItem }) {
  const anchor = useRef<HTMLDivElement>(null);
  const [image, setImage] = useState<string | null>(null);
  useEffect(() => {
    setImage(null);
    let disposed = false;
    let requested = false;
    const load = () => {
      if (requested || disposed) return;
      requested = true;
      void window.electronAPI.getPaperNewsCover(item.id).then((cover) => {
        if (!disposed && cover?.kind === "source-image") setImage(cover.dataUrl);
      }).catch(() => { /* Missing images keep the normal text card. */ });
    };
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        observer.disconnect();
        load();
      }
    }, { rootMargin: "160px" });
    if (anchor.current?.parentElement) observer.observe(anchor.current.parentElement);
    return () => { disposed = true; observer.disconnect(); };
  }, [item.id, item.url, item.imageUrl]);

  return <div ref={anchor} className={image ? "pn-article-image" : "pn-image-probe"}>
    {image && <img src={image} alt="" decoding="async" onError={() => setImage(null)} />}
  </div>;
}
