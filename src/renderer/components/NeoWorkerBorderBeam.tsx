import { useEffect, useState } from "react";
import { BorderBeam } from "border-beam";
import "./neoworker-border-beam.css";

type NeoWorkerBorderBeamKind = "composer" | "approval";
type NeoWorkerBorderBeamTone = "accent" | "danger";

interface NeoWorkerBorderBeamProps {
  active: boolean;
  kind: NeoWorkerBorderBeamKind;
  tone?: NeoWorkerBorderBeamTone;
}

function readNeoWorkerTheme(): "light" | "dark" {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.classList.contains("theme-light")
    ? "light"
    : "dark";
}

function readReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * A non-interactive Border Beam layer tuned for NeoWorker.
 *
 * This deliberately sits inside its host instead of wrapping the host. The
 * upstream wrapper clips overflow, which would otherwise crop composer menus.
 */
export function NeoWorkerBorderBeam({
  active,
  kind,
  tone = "accent",
}: NeoWorkerBorderBeamProps) {
  const [theme, setTheme] = useState<"light" | "dark">(readNeoWorkerTheme);
  const [reducedMotion, setReducedMotion] = useState(readReducedMotion);

  useEffect(() => {
    const root = document.documentElement;
    const syncTheme = () => setTheme(readNeoWorkerTheme());
    syncTheme();

    if (typeof MutationObserver === "undefined") return;
    const observer = new MutationObserver(syncTheme);
    observer.observe(root, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncMotionPreference = () => setReducedMotion(mediaQuery.matches);
    syncMotionPreference();
    mediaQuery.addEventListener("change", syncMotionPreference);
    return () => mediaQuery.removeEventListener("change", syncMotionPreference);
  }, []);

  const isApproval = kind === "approval";

  return (
    <BorderBeam
      aria-hidden="true"
      active={active && !reducedMotion}
      borderRadius={isApproval ? 18 : 16}
      brightness={isApproval ? 0.82 : 0.9}
      className={`neoworker-border-beam-layer neoworker-border-beam-layer--${kind}`}
      colorVariant={tone === "danger" ? "sunset" : "ocean"}
      duration={isApproval ? 2.8 : 3.4}
      saturation={0.9}
      size={isApproval ? "pulse-inner" : "line"}
      staticColors
      strength={isApproval ? 0.3 : 0.34}
      style={{
        position: "absolute",
        inset: "-1px",
        pointerEvents: "none",
        zIndex: 3,
      }}
      theme={theme}
    >
      <span className="neoworker-border-beam-surface" />
    </BorderBeam>
  );
}
