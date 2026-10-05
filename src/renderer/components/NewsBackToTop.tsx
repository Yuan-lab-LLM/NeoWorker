import { useEffect, useState, type RefObject } from "react";
import { ArrowUp } from "lucide-react";
import { useLanguage } from "../i18n";

export function NewsBackToTop({ scrollRef }: { scrollRef: RefObject<HTMLElement | null> }) {
  const [visible, setVisible] = useState(false);
  const language = useLanguage();
  const label = language === "zh-CN" ? "回到顶部" : "Back to top";

  useEffect(() => {
    const panel = scrollRef.current;
    if (!panel) return;
    const update = () => setVisible(panel.scrollTop >= Math.max(240, panel.clientHeight));
    panel.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(panel);
    update();
    return () => {
      panel.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [scrollRef]);

  if (!visible) return null;
  return (
    <button
      type="button"
      className="pn-back-to-top"
      aria-label={label}
      title={label}
      onClick={() => {
        const panel = scrollRef.current;
        if (!panel) return;
        // Keep focus in the feed when the floating button disappears near the top.
        panel.focus({ preventScroll: true });
        panel.scrollTo({
          top: 0,
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
            ? "instant"
            : "smooth",
        });
      }}
    >
      <ArrowUp size={16} aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}
